"""The first-paint derivative manifest: which published photographs the app
may ask our own CDN for (H12, T1105).

Tier: Manual (run after a derive.py run has reached R2; see the T1105 report)

The app builds the ladder_v1 address of a photograph itself, from the
Wikimedia URL already on the wire: the address is sha1_of(canonical_title),
and the sizes of the three rungs follow from the wire's own w and h by
derive.rung_dims. What it cannot know is whether the copy is really on R2.
derive.py's manifests (img/manifest/<layer>.json, carta.img-manifest.v1)
know that, but they are about 180 bytes a source and never reach the
browser. This module reads them and writes the part the first paint needs,
small enough to ship inside the app bundle:

    continent-app/src/lib/heroLadder.json   (carta.hero-ladder.v1)

    live      true once a manifest was read and the published set is covered
              well enough (missing under --max-missing); false keeps every
              photograph on Wikimedia, which is the state of every build
              until the owner's derive run and upload
    missing   12 hex characters of sha1_of(title) for each published
              photograph with no copy (gated out: a licence that may not be
              stored, an SVG, a takedown; or not derived yet). The app keeps
              these on Wikimedia
    rev       key -> the full address, for a file re-uploaded on Commons and
              re-derived under derive.revision_key
    dims      key -> [[w, h] x 3], for a copy whose real rung sizes differ
              from what the wire's w and h predict (a wire measured from an
              older revision)

The published set is what the first screens draw: every destination hero
(app_data.json) and every destination gallery photograph (dossier/*.json).
Keys are taken from the record's `url`, the same field the app reads, so the
two sides can never key the same photograph differently.

Usage:

    python pipeline/photos/hero_ladder.py --manifests DIR [--out FILE]
        [--max-missing 2500] [--layers dest,dossier]
    python pipeline/photos/hero_ladder.py            (no manifest: live false)

DIR is a copy of img/manifest/ from R2 (`rclone copy r2:carta/img/manifest
DIR`), journals included: derive.load_prior reads both. CARTA_DATA_ROOT
reads continent-app/public from another checkout.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCHEMA = "carta.hero-ladder.v1"
KEY_LEN = 12
OUT = ROOT / "continent-app" / "src" / "lib" / "heroLadder.json"
MAX_MISSING = 2500      # about 37 KB in the bundle; past it, join the wire
WIRE_SETS = ("dest", "dossier")

_derive = None


def derive_mod():
    """derive.py, loaded by path with sys.path put back (as wire_ladder)."""
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


def public_root():
    base = os.environ.get("CARTA_DATA_ROOT")
    return (Path(base) if base else ROOT) / "continent-app" / "public"


def wire_images(pub, sets=WIRE_SETS):
    """Every published image record of the first screens, in a stable
    order: destination heroes, then destination galleries."""
    out = []
    if "dest" in sets:
        f = pub / "app_data.json"
        if f.exists():
            data = json.loads(f.read_text(encoding="utf-8"))
            for _id, d in sorted((data.get("destinations") or {}).items()):
                img = (d or {}).get("image")
                if isinstance(img, dict) and img.get("url"):
                    out.append(img)
    if "dossier" in sets:
        for f in sorted((pub / "dossier").glob("*.json")):
            try:
                doc = json.loads(f.read_text(encoding="utf-8"))
            except ValueError:
                continue
            for g in doc.get("gallery") or []:
                if isinstance(g, dict) and g.get("url"):
                    out.append(g)
    return out


def expected_dims(w, h):
    """The rung sizes the app predicts from the wire's w and h
    (heroImage.ladderDims): the 1920 source, then each rung, never
    upscaled."""
    dv = derive_mod()
    if not (isinstance(w, (int, float)) and isinstance(h, (int, float))
            and w > 0 and h > 0):
        return None
    src = dv.rung_dims(w, h, dv.SOURCE_WIDTH)
    return [dv.rung_dims(src[0], src[1], r) for r in dv.WIDTHS]


def build(images, known, have_manifest, max_missing=MAX_MISSING):
    """The hero-ladder document for `images` (wire records) against `known`
    (title -> manifest entry, as derive.load_prior returns it)."""
    dv = derive_mod()
    seen, missing, rev, dims = set(), set(), {}, {}
    titles = derived = 0
    for img in images:
        title = dv.canonical_title(img.get("url"))
        if not title or not title.startswith("File:") or title in seen:
            continue
        seen.add(title)
        titles += 1
        plain = dv.sha1_of(title)
        key = plain[:KEY_LEN]
        e = known.get(title)
        if not e or not dv.address_ok(title, e) or not e.get("d"):
            missing.add(key)
            continue
        derived += 1
        if e["h"] != plain:
            rev[key] = e["h"]
        d = [list(x) for x in e["d"]]
        if d != expected_dims(img.get("w"), img.get("h")):
            dims[key] = d
    live = bool(have_manifest and derived and len(missing) <= max_missing)
    if not have_manifest:
        note = ("No derive manifest was given: every photograph stays on "
                "Wikimedia.")
    elif not derived:
        note = "The manifests name none of the published photographs."
    elif not live:
        note = (f"{len(missing)} published photographs have no copy, over "
                f"--max-missing {max_missing}: join the ladder into the "
                "wire (T052-d) instead of shipping the list.")
    else:
        note = "Live: the app prefers our own copy of every photograph not listed in missing."
    return {
        "schema": SCHEMA,
        "ladder": dv.LADDER_V,
        "live": live,
        "note": note + " Written by pipeline/photos/hero_ladder.py; do not edit by hand.",
        "generated_at": (datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                         if have_manifest else None),
        "layers": sorted(WIRE_SETS),
        "titles": titles,
        "derived": derived,
        "missing": sorted(missing) if live else [],
        "rev": dict(sorted(rev.items())) if live else {},
        "dims": dict(sorted(dims.items())) if live else {},
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--manifests", help="a copy of img/manifest/ from R2")
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--max-missing", type=int, default=MAX_MISSING)
    ap.add_argument("--layers", default=",".join(WIRE_SETS))
    args = ap.parse_args(argv)
    sets = tuple(s.strip() for s in args.layers.split(",") if s.strip())
    known = {}
    if args.manifests:
        if not Path(args.manifests).is_dir():
            ap.error(f"{args.manifests}: not a directory")
        known, _own = derive_mod().load_prior(args.manifests)
    doc = build(wire_images(public_root(), sets), known, bool(args.manifests),
                args.max_missing)
    doc["layers"] = sorted(sets)
    text = json.dumps(doc, ensure_ascii=True, indent=2) + "\n"
    Path(args.out).write_text(text, encoding="utf-8")
    print(f"hero_ladder: live={doc['live']} titles={doc['titles']} "
          f"derived={doc['derived']} missing={len(doc['missing'])} "
          f"rev={len(doc['rev'])} dims={len(doc['dims'])} -> {args.out} "
          f"({len(text) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
