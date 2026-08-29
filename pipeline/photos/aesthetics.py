"""One CLIP embedding per image, cached forever, and the heads that read it.

The cost model of the whole engine hangs on one fact: relevance (zero-shot
veto), aesthetics (LAION head) and dedupe (cosine clusters) all read the
SAME ViT-L/14 embedding. So the embedding is computed once, stored next to
the image record under cache/photos/emb/, and never recomputed. Scoring a
million files is a few GPU hours on a T4; on this CPU box it is a trickle,
which is fine, because the cache means the trickle only ever runs forward.

Models, and the licences that chose them:

  OpenCLIP ViT-L/14, openai weights   MIT / Apache. The openai pretrain is
      the one the LAION aesthetic head was trained against, so it is not a
      free choice.
  LAION improved-aesthetic-predictor  Apache-2.0, from its own repository.
      A 5-layer MLP over the normalised embedding, scores roughly 1..10.
  idealo NIMA                         Apache-2.0, second opinion, wanted
      because it decorrelates the first. The published weights are Keras;
      this box runs torch. The loader looks for a converted checkpoint at
      models/nima_mobilenet.pth and DEGRADES TO NONE without it, and
      select.py renormalises the beauty weights over what answered
      (invariant 6). Converting the weights is an open item in PHOTOS.md.

  pyiqa / IQA-PyTorch is not imported anywhere in this package and must
  never be: PolyForm Noncommercial (MUSIQ, CLIP-IQA, Q-Align).

Everything torch-shaped loads lazily. Importing this module costs nothing,
so the layers can import the package without paying for a model they may
not use in that run.

ASCII clean, no em dashes, per project convention.
"""

import hashlib
import io
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PHOTO_CACHE = ROOT / "cache" / "photos"
EMB_DIR = PHOTO_CACHE / "emb"
MODEL_DIR = PHOTO_CACHE / "models"

# The -quickgelu name matters: the openai checkpoint was trained with
# QuickGELU, and the LAION aesthetic head was trained on embeddings
# computed through it. The plain ViT-L-14 config builds the tower with
# standard GELU, open_clip warns, and every embedding comes out subtly
# wrong. Verified 2026-08-29: the warning appears with the plain name and
# not with this one.
CLIP_ARCH = "ViT-L-14-quickgelu"
CLIP_PRETRAIN = "openai"        # the head below was trained on this, not laion2b
EMB_DIM = 768

AESTHETIC_HEAD_URL = ("https://github.com/christophschuhmann/"
                      "improved-aesthetic-predictor/raw/main/"
                      "sac%2Blogos%2Bava1-l14-linearMSE.pth")
AESTHETIC_HEAD_FILE = "sac+logos+ava1-l14-linearMSE.pth"
NIMA_FILE = "nima_mobilenet.pth"    # optional, see module docstring

# Raw LAION scores cluster in roughly 3.5..7.5 on real Commons landscape
# files. The norm maps that band onto 0..1 without clipping the tails to
# a cliff. Constants ship in the model block (select.MODEL), versioned.
AESTHETIC_LO = 3.0
AESTHETIC_HI = 7.5

_clip = None          # (model, preprocess, tokenizer) once loaded
_head = None
_nima = None


class ModelUnavailable(RuntimeError):
    """Raised when a caller insists on a model this box cannot load."""


# ---------------------------------------------------------------------------
# Lazy loading
# ---------------------------------------------------------------------------

def _load_clip():
    global _clip
    if _clip is not None:
        return _clip
    try:
        import open_clip
        import torch
    except ImportError as exc:
        raise ModelUnavailable(f"open_clip/torch not installed: {exc}")
    model, _, preprocess = open_clip.create_model_and_transforms(
        CLIP_ARCH, pretrained=CLIP_PRETRAIN, cache_dir=str(MODEL_DIR))
    model.eval()
    tokenizer = open_clip.get_tokenizer(CLIP_ARCH)
    torch.set_grad_enabled(False)
    _clip = (model, preprocess, tokenizer)
    return _clip


def _fetch_head():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    path = MODEL_DIR / AESTHETIC_HEAD_FILE
    if path.exists():
        return path
    req = urllib.request.Request(AESTHETIC_HEAD_URL, headers={
        "User-Agent": "CartaPhotoEngine/1.0 "
                      "(https://carta-europetravel.com)"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = resp.read()
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)
    return path


def _load_head():
    """The LAION MLP: 768 -> 1024 -> 128 -> 64 -> 16 -> 1, dropouts
    between, exactly the shape the published state dict expects."""
    global _head
    if _head is not None:
        return _head
    import torch
    from torch import nn

    class MLP(nn.Module):
        def __init__(self):
            super().__init__()
            self.layers = nn.Sequential(
                nn.Linear(EMB_DIM, 1024), nn.Dropout(0.2),
                nn.Linear(1024, 128), nn.Dropout(0.2),
                nn.Linear(128, 64), nn.Dropout(0.1),
                nn.Linear(64, 16),
                nn.Linear(16, 1),
            )

        def forward(self, x):
            return self.layers(x)

    head = MLP()
    state = torch.load(_fetch_head(), map_location="cpu",
                       weights_only=True)
    head.load_state_dict(state)
    head.eval()
    _head = head
    return head


def _load_nima():
    """The optional second opinion. None, silently, when the converted
    checkpoint is absent: select.py renormalises, nothing else changes."""
    global _nima
    if _nima is not None:
        return _nima if _nima != "missing" else None
    path = MODEL_DIR / NIMA_FILE
    if not path.exists():
        _nima = "missing"
        return None
    import torch
    from torch import nn
    from torchvision.models import mobilenet_v2

    model = mobilenet_v2()
    model.classifier = nn.Sequential(nn.Dropout(0.75),
                                     nn.Linear(model.last_channel, 10))
    state = torch.load(path, map_location="cpu", weights_only=True)
    model.load_state_dict(state)
    model.eval()
    _nima = model
    return model


# ---------------------------------------------------------------------------
# Embeddings, cached by content
# ---------------------------------------------------------------------------

def emb_key(name):
    """Cache key for an image: the Commons file title when there is one
    (stable across thumbnail widths), else the URL."""
    return hashlib.sha1(str(name).encode("utf-8")).hexdigest()


def cached_embedding(name):
    """The stored embedding for this file, or None. numpy float32[768],
    L2-normalised at write time."""
    path = EMB_DIR / f"{emb_key(name)}.npy"
    if not path.exists():
        return None
    try:
        import numpy as np
        return np.load(path)
    except Exception:
        return None


def embed_image(data, name=None):
    """Embed one image's bytes, through the cache when `name` is given.

    Returns numpy float32[768], L2-normalised, or None when the bytes are
    unreadable. Raises ModelUnavailable only when a fresh embedding is
    needed and CLIP cannot load; a cached vector never needs the model."""
    import numpy as np
    if name is not None:
        hit = cached_embedding(name)
        if hit is not None:
            return hit
    model, preprocess, _ = _load_clip()
    import torch
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        return None
    with torch.no_grad():
        feats = model.encode_image(preprocess(img).unsqueeze(0))
    vec = feats[0].float().numpy()
    vec = vec / (np.linalg.norm(vec) or 1.0)
    vec = vec.astype("float32")
    if name is not None:
        EMB_DIR.mkdir(parents=True, exist_ok=True)
        final = EMB_DIR / f"{emb_key(name)}.npy"
        tmp = final.with_suffix(".tmp")
        with open(tmp, "wb") as fh:
            np.save(fh, vec)
        tmp.replace(final)
    return vec


def embed_texts(prompts):
    """Embed a list of prompts, L2-normalised, float32[len, 768]. Cached
    per process only: prompt lists are tiny and versioned in code."""
    import numpy as np
    model, _, tokenizer = _load_clip()
    import torch
    with torch.no_grad():
        feats = model.encode_text(tokenizer(list(prompts)))
    arr = feats.float().numpy()
    return (arr / np.linalg.norm(arr, axis=1, keepdims=True)).astype(
        "float32")


# ---------------------------------------------------------------------------
# Scores
# ---------------------------------------------------------------------------

def aesthetic_raw(embedding):
    """LAION head over a normalised embedding, roughly 1..10."""
    import torch
    head = _load_head()
    with torch.no_grad():
        value = head(torch.from_numpy(embedding).unsqueeze(0))
    return round(float(value[0, 0]), 3)


def aesthetic_norm(raw):
    if raw is None:
        return None
    return round(max(0.0, min(1.0, (raw - AESTHETIC_LO)
                              / (AESTHETIC_HI - AESTHETIC_LO))), 3)


def nima_raw(data):
    """Mean of NIMA's ten-bin distribution, roughly 1..10, or None when
    the converted checkpoint is not on this box."""
    model = _load_nima()
    if model is None:
        return None
    import numpy as np
    import torch
    from PIL import Image
    from torchvision import transforms
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        return None
    prep = transforms.Compose([
        transforms.Resize(256), transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406],
                             [0.229, 0.224, 0.225]),
    ])
    with torch.no_grad():
        logits = model(prep(img).unsqueeze(0))
        dist = torch.softmax(logits[0], dim=0).numpy()
    return round(float((dist * np.arange(1, 11)).sum()), 3)


def nima_norm(raw):
    if raw is None:
        return None
    return round(max(0.0, min(1.0, (raw - 3.0) / 5.0)), 3)


def score_image(data, name=None):
    """Everything this module knows about one file's pixels, one call.

    {'emb_key', 'aesthetic', 'aesthetic_norm', 'nima', 'nima_norm'},
    with None for whatever could not answer. The embedding itself stays in
    the cache; the record carries only the key, because 768 floats per
    image do not belong in a country JSON."""
    out = {"emb_key": emb_key(name) if name else None,
           "aesthetic": None, "aesthetic_norm": None,
           "nima": None, "nima_norm": None}
    try:
        vec = embed_image(data, name=name)
    except ModelUnavailable:
        vec = None
    if vec is not None:
        try:
            out["aesthetic"] = aesthetic_raw(vec)
            out["aesthetic_norm"] = aesthetic_norm(out["aesthetic"])
        except (ModelUnavailable, Exception):
            pass
    raw = nima_raw(data)
    out["nima"] = raw
    out["nima_norm"] = nima_norm(raw)
    return out
