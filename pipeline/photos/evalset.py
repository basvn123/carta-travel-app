"""The labelled set every threshold in this package answers to.

The lake layer threw away three pixel measurements because they were
tuned by eyeballing a handful of files and died on the next dozen. The
rule since: no threshold ships tuned without a labelled set to measure it
against. This module builds that set for the photo engine: about 800
images, 200 per layer, drawn from currently published heroes, half of
which are exactly the population the new ranking has to fix.

    python pipeline/photos/evalset.py build     write/refresh the manifest
    python pipeline/photos/evalset.py stats     score the rejector + probes

`build` samples an even stride across each layer's published rows (best
to worst), so the set spans the quality range rather than the top. Labels
start null and are filled by a person, in the review queue or in the
manifest directly:

    "label": "good"   a fine card photograph of the subject
    "label": "bad"    wrong subject, junk frame (board, facade, bin, fog),
                      or unusable for a card

`stats` reports, against the labelled rows only:
  - relevance rejector: precision on rejects (bar: at least 0.95, a good
    photograph is almost never vetoed) and recall on the bad set (bar: at
    least 0.80), across a margin sweep so the margin is chosen by
    reading, not guessing
  - the overcast probe's separation, which decides whether
    season.CONDITION_ENABLED may flip on

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PUBLIC = ROOT / "continent-app" / "public"
MANIFEST = HERE / "evalset" / "manifest.json"

PER_LAYER = 200
LAYERS = (
    ("beach", "beaches", "beaches"),
    ("lake", "lakes", "lakes"),
    ("mountain", "mountains", "mountains"),
    ("trail", "trails", "trips"),
)
UA = ("CartaPhotos/1.0 (https://carta-europetravel.com; "
      "bas.vannieuwenhuyse123@gmail.com)")


def _hero_url(row):
    imgs = row.get("images") or []
    if imgs:
        return imgs[0].get("u") or imgs[0].get("big") or ""
    return row.get("img") or ""


def build():
    existing = {}
    if MANIFEST.exists():
        for row in json.loads(MANIFEST.read_text(encoding="utf-8")):
            existing[row["img"]] = row
    out = []
    for category, dirname, key in LAYERS:
        rows = []
        base = PUBLIC / dirname
        for path in sorted(base.glob("*.json")):
            if path.name in ("index.json", "top.json"):
                continue
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                continue
            for row in data.get(key) or []:
                url = _hero_url(row)
                if url:
                    rows.append({"category": category,
                                 "row": row.get("id") or "",
                                 "name": row.get("name") or "",
                                 "img": url})
        if not rows:
            print(f"  {category}: nothing published, skipped")
            continue
        # An even stride across the publication order spans the quality
        # range; random sampling would too, but a stride is reproducible
        # without a seed and re-running build keeps the same set.
        step = max(1, len(rows) // PER_LAYER)
        picked = rows[::step][:PER_LAYER]
        for row in picked:
            kept = existing.get(row["img"]) or {}
            row["label"] = kept.get("label")
            row["why"] = kept.get("why", "")
        out.extend(picked)
        print(f"  {category}: {len(picked)} of {len(rows)} heroes")
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(out, ensure_ascii=False, indent=1),
                        encoding="utf-8")
    labelled = sum(1 for r in out if r.get("label"))
    print(f"{len(out)} rows -> {MANIFEST} ({labelled} labelled)")


def _fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except Exception:
        return None


def stats(margins=(0.0, 0.01, 0.02, 0.03, 0.05)):
    sys.path.insert(0, str(HERE))
    import aesthetics
    import relevance
    import season

    rows = [r for r in json.loads(MANIFEST.read_text(encoding="utf-8"))
            if r.get("label") in ("good", "bad")]
    if not rows:
        raise SystemExit("no labelled rows yet; label the manifest first")
    scored = []
    for i, row in enumerate(rows, 1):
        data = _fetch(row["img"])
        if data is None:
            continue
        try:
            emb = aesthetics.embed_image(data, name=row["img"])
        except aesthetics.ModelUnavailable:
            raise SystemExit("CLIP unavailable; install open_clip_torch")
        sky = season.sky_reading(data)
        scored.append((row, emb, sky))
        if i % 50 == 0:
            print(f"  embedded {i}/{len(rows)}")

    print(f"\nrejector, {len(scored)} labelled files:")
    print("margin  reject-precision  bad-recall")
    for margin in margins:
        tp = fp = fn = 0
        for row, emb, _ in scored:
            vetoed, _why = relevance.veto(emb, row["category"],
                                          margin=margin)
            if vetoed and row["label"] == "bad":
                tp += 1
            elif vetoed:
                fp += 1
            elif row["label"] == "bad":
                fn += 1
        precision = tp / (tp + fp) if (tp + fp) else 1.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        flag = " <- bar" if precision >= 0.95 and recall >= 0.80 else ""
        print(f"{margin:6.2f}  {precision:16.3f}  {recall:10.3f}{flag}")

    overcast_bad = sum(1 for row, _, sky in scored
                       if sky and row["label"] == "bad"
                       and sky["sat"] < season.OVERCAST_SAT
                       and sky["spread"] < season.OVERCAST_SPREAD)
    overcast_good = sum(1 for row, _, sky in scored
                        if sky and row["label"] == "good"
                        and sky["sat"] < season.OVERCAST_SAT
                        and sky["spread"] < season.OVERCAST_SPREAD)
    print(f"\novercast probe fires on {overcast_bad} bad, "
          f"{overcast_good} good "
          f"(CONDITION_ENABLED stays False until this reads clean)")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("cmd", choices=("build", "stats"))
    args = ap.parse_args()
    build() if args.cmd == "build" else stats()


if __name__ == "__main__":
    main()
