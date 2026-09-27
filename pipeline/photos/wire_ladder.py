"""Join the image ladder into a layer's wire at export (T052).

Tier: Library

derive.py (T049) writes every published photograph as 3 AVIF + 2 WebP under
a content address, and a per-layer manifest (img/manifest/<layer>.json,
schema carta.img-manifest.v1) that says which sources exist and how big each
rung really is. The app needs three facts per image to build a <picture>:

    ih   the sha1 of the canonical source title, which is the whole address
         ({base}/{ih[0:2]}/{ih[2:4]}/{ih}/{w}.{fmt}). The manifest calls it
         `h`, but every wire image record already has an `h`: the pixel
         height of the 1280 thumbnail. Joining it under its manifest name
         would overwrite that height with a hash, so it travels as `ih`
    d    [[w, h], [w, h], [w, h]], the real pixel size of the 320, 640 and
         1280 rungs. A source narrower than a rung is not upscaled, so the
         srcset descriptor must be the real width, never the rung's name
    ph   on the hero only (images[0] of a row): a 24 character placeholder,
         see encode_placeholder

T049 measured the manifest at about 180 bytes per source (about 3 MB gzip
for full beaches), so the browser never fetches it. The export joins the
three facts into the wire records it is about to write, and leaves every
other field alone: u, big, w, h, by, lic, licUrl and page stay exactly as
they were (T051-b), so the credit still comes from the wire record and the img
fallback is still today's JPEG.

No manifest, no join. An export run without --img-manifest writes the same
bytes it wrote before this module existed; that is how the wire stays
unchanged in production until the first real derive run has landed in R2.

The placeholder. Six colours, the photograph averaged down to a 3 x 2 grid,
18 bytes of RGB, base64url without padding: exactly 24 characters. The app
paints them as six flat blocks behind the hero until the photograph covers
them. Why not blurhash: blurhash needs a decoder in the bundle and a canvas
or data URL made on the main thread before the hero paints, which is the
exact path LCP measures, and what it draws is a smooth gradient, which the
carta-design rules forbid. Six flat colours cost no decoder, no canvas and
no JavaScript beyond reading six bytes triples, and they are not an LCP
candidate (a CSS background with no url() never is), so the placeholder can
never become the largest paint and hide a slow photograph.

Where the pixels come from: the manifest entry's `p` field when derive.py
has written one (not yet; register row T052-c), else the local 320 WebP rung
under --img-root, which is the img/ tree a derive run leaves before upload.
A hero with neither ships without `ph` and the page shows the plain panel
ground, exactly as today.

ASCII clean, no em dashes, per project convention.
"""

import base64
import importlib.util
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

SHA1 = re.compile(r"^[0-9a-f]{40}$")
PH_LEN = 24
GRID = (3, 2)

_derive = None


def _derive_mod():
    """derive.py, loaded by path under its own name, with sys.path put back
    afterwards: derive puts pipeline/photos first on the path, and a layer
    export that later imports a module called `season` must still get its
    own, not the photo engine's."""
    global _derive
    if _derive is None:
        saved = list(sys.path)
        try:
            spec = importlib.util.spec_from_file_location(
                "carta_derive", HERE / "derive.py")
            mod = importlib.util.module_from_spec(spec)
            sys.modules["carta_derive"] = mod
            spec.loader.exec_module(mod)
        finally:
            sys.path[:] = saved
        _derive = mod
    return _derive


def encode_placeholder(path):
    """The 24 character placeholder of one image file, or None.

    Box-filtered to 3 x 2 (every source pixel counts once, so a small bright
    boat does not become a whole block), RGB, base64url, no padding."""
    try:
        from PIL import Image  # noqa: PLC0415
    except ImportError:
        return None
    try:
        with Image.open(path) as im:
            px = im.convert("RGB").resize(GRID, Image.BOX)
            raw = bytes(c for rgb in px.getdata() for c in rgb)
    except (OSError, ValueError):
        return None
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def valid_placeholder(value):
    return isinstance(value, str) and len(value) == PH_LEN \
        and re.fullmatch(r"[A-Za-z0-9_-]+", value) is not None


def _manifest_path(value, layer):
    if not value:
        return None
    p = Path(value)
    if p.is_dir():
        # a manifest directory (img/manifest) or a derive --out (img/manifest
        # under it)
        for cand in (p / f"{layer}.json", p / "img" / "manifest" / f"{layer}.json"):
            if cand.exists():
                return cand
        return None
    return p if p.exists() else None


class Ladder:
    def __init__(self, layer, manifest, img_roots):
        self.layer = layer
        self.files = manifest.get("files") or {}
        self.img_roots = [Path(r) for r in img_roots if r]
        self.stats = {"images": 0, "joined": 0, "heroes": 0,
                      "heroes_joined": 0, "placeholders": 0,
                      "no_dims": 0}

    def _rung(self, h, name):
        for root in self.img_roots:
            for base in (root, root / "img"):
                f = base / h[:2] / h[2:4] / h / name
                if f.exists():
                    return f
        return None

    def placeholder(self, entry):
        if valid_placeholder(entry.get("p")):
            return entry["p"]
        f = self._rung(entry["h"], "320.webp")
        return encode_placeholder(f) if f else None

    def join(self, rows):
        """Add ih, d (and ph on images[0]) to every image record whose source
        the manifest holds. Mutates the records in place; rows shared between
        a country file and top.json are the same dicts, so both get it."""
        derive = _derive_mod()
        seen = set()
        for row in rows:
            if id(row) in seen:
                continue
            seen.add(id(row))
            for i, img in enumerate(row.get("images") or []):
                if not isinstance(img, dict):
                    continue
                self.stats["images"] += 1
                if i == 0:
                    self.stats["heroes"] += 1
                entry = self.files.get(derive.canonical_title(img) or "")
                if not entry or not SHA1.match(str(entry.get("h") or "")):
                    continue
                dims = entry.get("d")
                if not (isinstance(dims, list) and len(dims) == 3
                        and all(isinstance(x, list) and len(x) == 2
                                and x[0] > 0 and x[1] > 0 for x in dims)):
                    self.stats["no_dims"] += 1
                    continue
                img["ih"] = entry["h"]
                img["d"] = [list(x) for x in dims]
                self.stats["joined"] += 1
                if i == 0:
                    self.stats["heroes_joined"] += 1
                    ph = self.placeholder(entry)
                    if ph:
                        img["ph"] = ph
                        self.stats["placeholders"] += 1

    def summary(self):
        s = self.stats
        return (f"[{self.layer}] image ladder joined into {s['joined']} of "
                f"{s['images']} image records ({s['heroes_joined']} of "
                f"{s['heroes']} heroes, {s['placeholders']} placeholders)"
                + (f", {s['no_dims']} manifest entries without dims skipped"
                   if s["no_dims"] else ""))


def load(layer, manifest=None, img_roots=()):
    """A Ladder for `layer`, or None when no manifest was given. A path that
    was given and cannot be read is an error, not a silent no-op: an export
    asked to join the ladder that quietly did not would ship a wire the
    owner believes is joined."""
    if not manifest:
        return None
    path = _manifest_path(manifest, layer)
    if path is None:
        raise SystemExit(f"[{layer}] --img-manifest {manifest}: no "
                         f"{layer}.json there")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != "carta.img-manifest.v1":
        raise SystemExit(f"[{layer}] {path}: schema {data.get('schema')!r}, "
                         f"expected carta.img-manifest.v1")
    if data.get("layer") not in (None, layer):
        raise SystemExit(f"[{layer}] {path} is the {data.get('layer')} "
                         f"manifest")
    return Ladder(layer, data, img_roots)


def add_arguments(parser):
    """The two export flags, identical on every layer."""
    parser.add_argument(
        "--img-manifest", default="",
        help="derive.py's manifest (img/manifest/<layer>.json, or a "
             "directory holding it); joins ih, d and the hero placeholder "
             "into the wire. Omitted: the wire is written as before")
    parser.add_argument(
        "--img-root", action="append", default=[],
        help="a local img/ tree from a derive run, for hero placeholders "
             "(repeatable)")


def join_rows(layer, args, row_lists):
    """What each export calls just before it writes: load, join, print."""
    ladder = load(layer, args.img_manifest, args.img_root)
    if ladder is None:
        return None
    for rows in row_lists:
        ladder.join(rows)
    print(ladder.summary())
    return ladder
