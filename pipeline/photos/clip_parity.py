"""Does CLIP on this machine embed like the laptop did? (T047-g, T006)

Tier: Manual (run once on a new architecture before its first promoted
clip_sweep; see docs/PHOTOS.md, "Moving the photo caches to the CAX41")

Every cached embedding under cache/photos/emb was computed on the x86
laptop. A clip_sweep on the arm64 CAX41 reuses those vectors for every
photograph it has seen and computes new ones beside them, so the two must
agree, or the beauty ranking of a layer quietly becomes a mix of two
models. The aarch64 torch wheels take a different BLAS path, and the
aesthetic head is sensitive to the QuickGELU detail aesthetics.py
documents (T006 named this check; nobody has had an arm64 box to run it).

What it does: picks N image records of a layer whose embedding is cached,
fetches the same 500 px thumbnail rescore.py embedded (rescore.probe_url,
through rescore.fetch's pacing and retries), embeds it fresh WITHOUT the
cache (embed_image with no name, so nothing is written to cache/photos/emb),
and compares the fresh vector with the cached one: cosine distance, and the
difference of the LAION aesthetic score each gives, because that score is
what a ranking moves on.

Pass: the largest cosine distance is under --max-cos (default 0.002) and
the largest aesthetic difference under --max-aes (default 0.05, about one
per cent of the 3.0..7.5 band aesthetics.py normalises). The same thumbnail
re-encoded by Commons, or a JPEG decoder of another version, can move a
vector a little; a distance well above that is a model or BLAS problem.

    python pipeline/photos/clip_parity.py beaches --n 20 --json out.json

On the laptop itself the answer must be ~0 (same machine, same wheels):
that run proves the script, not the box. CARTA_DATA_ROOT points at a full
checkout's cache when this runs from a sparse worktree. Exit 0 pass, 1
fail, 2 when too few cached embeddings could be checked.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import os
import platform
import random
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import aesthetics  # noqa: E402
import rescore  # noqa: E402

DATA_ROOT = Path(os.environ.get("CARTA_DATA_ROOT") or HERE.parents[1])


def candidates(layer, rnd, n):
    """(record, cached vector) for up to n records with a cached embedding,
    sampled across the layer's countries."""
    import numpy as np
    cache_dir, row_key = rescore.LAYERS[layer][:2]
    pool = []
    for path in sorted((DATA_ROOT / "cache" / cache_dir).glob("rich_*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for row in data.get(row_key) or []:
            for img in row.get("images") or []:
                if not isinstance(img, dict):
                    continue
                url = img.get("url") or img.get("full") or ""
                name = img.get("file") or url
                if not url or not name:
                    continue
                f = aesthetics.EMB_DIR / f"{aesthetics.emb_key(name)}.npy"
                if f.exists():
                    pool.append((img, f))
    rnd.shuffle(pool)
    out = []
    for img, f in pool[: n * 3]:
        try:
            out.append((img, np.load(f)))
        except (OSError, ValueError):
            continue
        if len(out) >= n:
            break
    return out, len(pool)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("layer", choices=sorted(rescore.LAYERS))
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=47)
    ap.add_argument("--max-cos", type=float, default=0.002)
    ap.add_argument("--max-aes", type=float, default=0.05)
    ap.add_argument("--min-checked", type=int, default=10)
    ap.add_argument("--json")
    args = ap.parse_args(argv)

    # Read the full checkout's cache and models; embed_image(name=None)
    # never writes, so this stays read only.
    aesthetics.EMB_DIR = DATA_ROOT / "cache" / "photos" / "emb"
    aesthetics.MODEL_DIR = DATA_ROOT / "cache" / "photos" / "models"
    import numpy as np

    rnd = random.Random(args.seed)
    picked, pool_n = candidates(args.layer, rnd, args.n)
    print(f"{args.layer}: {pool_n} image records with a cached embedding; "
          f"checking {len(picked)} on {platform.machine()} "
          f"({platform.system()}, python {platform.python_version()})",
          flush=True)
    rows = []
    for img, cached in picked:
        url = rescore.probe_url(img.get("url") or img.get("full") or "")
        data = rescore.fetch(url)
        if data is None:
            print(f"  skip (no bytes): {img.get('file') or url}")
            continue
        fresh = aesthetics.embed_image(data, name=None)
        if fresh is None:
            print(f"  skip (unreadable): {img.get('file') or url}")
            continue
        cos = float(1.0 - np.dot(fresh, cached) / (
            np.linalg.norm(fresh) * np.linalg.norm(cached) or 1.0))
        aes = abs(aesthetics.aesthetic_raw(fresh)
                  - aesthetics.aesthetic_raw(cached.astype("float32")))
        rows.append({"file": img.get("file") or url, "cos_dist": cos,
                     "aes_diff": round(aes, 4)})
        print(f"  cos {cos:.6f}  aes {aes:.3f}  {img.get('file') or url}",
              flush=True)
    if len(rows) < min(args.min_checked, args.n):
        print(f"only {len(rows)} checked (need {args.min_checked}): no "
              f"verdict")
        rc = 2
    else:
        worst_cos = max(r["cos_dist"] for r in rows)
        worst_aes = max(r["aes_diff"] for r in rows)
        ok = worst_cos <= args.max_cos and worst_aes <= args.max_aes
        print(f"{len(rows)} checked: cosine distance median "
              f"{statistics.median(r['cos_dist'] for r in rows):.6f}, max "
              f"{worst_cos:.6f} (limit {args.max_cos}); aesthetic diff max "
              f"{worst_aes:.3f} (limit {args.max_aes}): "
              + ("PASS" if ok else "FAIL"))
        rc = 0 if ok else 1
    if args.json:
        Path(args.json).write_text(json.dumps({
            "layer": args.layer, "machine": platform.machine(),
            "system": platform.system(), "seed": args.seed,
            "max_cos": args.max_cos, "max_aes": args.max_aes,
            "checked": rows, "exit": rc}, indent=1), encoding="utf-8")
    return rc


if __name__ == "__main__":
    sys.exit(main())
