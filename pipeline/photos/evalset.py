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
import re
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
    img = row.get("img") or ""
    # The trail wire ships img as an object; the hero is its display URL.
    if isinstance(img, dict):
        img = img.get("u") or img.get("url") or img.get("big") or ""
    return img if isinstance(img, str) else ""


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


# Which reason codes the RELEVANCE rejector is answerable for. A
# photograph can be unusable for two very different reasons, and only one
# of them is a classification problem:
#
#   subject   it shows the wrong thing (a board, a facade, a car, a
#             church, somebody's head). This is what the rejector exists
#             to catch, and what its recall is measured against.
#   condition it shows the right thing badly (fog, winter, dusk, blur).
#             The season term and the technical gate handle these, and
#             a rejector that started vetoing them would be judging
#             weather with a subject classifier.
#
# Both count as "not a good photograph" for precision, because the
# precision bar is "never veto a picture that should have shipped".
SUBJECT_REASONS = {"wrong-subject", "board-or-sign", "building",
                   "vehicle-or-street", "people", "other", ""}
CONDITION_REASONS = {"bad-season", "bad-weather", "too-dark", "blurry"}


def _probe_url(url):
    """The 500 px derivative, the same one rescore scores from, so the
    sweep reads the embedding cache instead of refilling it."""
    if url and "/thumb/" in url:
        return re.sub(r"/\d+px-", "/500px-", url, count=1)
    return url


def _emb_names():
    """{image url: Commons file title} from the rich caches, so a label
    written against a URL can find the embedding rescore stored under
    the file title."""
    out = {}
    for cache_dir, row_key in (("beaches", "beaches"), ("lakes", "lakes"),
                               ("mountains", "peaks")):
        for path in (ROOT / "cache" / cache_dir).glob("rich_??.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                continue
            for row in data.get(row_key) or []:
                for img in row.get("images") or []:
                    url, file = img.get("url"), img.get("file")
                    if url and file:
                        out[url] = file
    return out


def stats(margins=(0.0, 0.005, 0.01, 0.02, 0.03, 0.05), with_sky=False):
    sys.path.insert(0, str(HERE))
    import aesthetics
    import relevance
    import season

    rows = [r for r in json.loads(MANIFEST.read_text(encoding="utf-8"))
            if r.get("label") in ("good", "bad")]
    if not rows:
        raise SystemExit("no labelled rows yet; label the manifest first")
    names = _emb_names()
    scored = []
    fetched = 0
    for i, row in enumerate(rows, 1):
        # The cache first, under every key the image could have been
        # embedded under: rescore stores by Commons file title, this
        # module by probe URL. A hit costs no download and no model,
        # which is what lets the sweep run beside a rescore.
        emb = None
        for key in (row.get("emb"), names.get(row["img"]),
                    _probe_url(row["img"])):
            if key:
                emb = aesthetics.cached_embedding(key)
                if emb is not None:
                    break
        data = None
        if emb is None or with_sky:
            data = _fetch(_probe_url(row["img"]))
        if emb is None:
            if data is None:
                continue
            try:
                emb = aesthetics.embed_image(
                    data, name=names.get(row["img"])
                    or _probe_url(row["img"]))
            except aesthetics.ModelUnavailable:
                raise SystemExit(
                    "CLIP unavailable and this image is not in "
                    "cache/photos/emb. Run the sweep when no rescore "
                    "holds the model, or rescore its layer first.")
            fetched += 1
        scored.append((row, emb,
                       season.sky_reading(data) if data else None))
        if i % 50 == 0:
            print(f"  read {i}/{len(rows)}")
    print(f"  {len(scored)} labelled files read, {fetched} embedded "
          f"fresh, {len(scored) - fetched} from cache")

    n_good = sum(1 for r, _, _ in scored if r["label"] == "good")
    n_subject = sum(1 for r, _, _ in scored if r["label"] == "bad"
                    and (r.get("why") or "") in SUBJECT_REASONS)
    n_cond = sum(1 for r, _, _ in scored if r["label"] == "bad"
                 and (r.get("why") or "") in CONDITION_REASONS)
    print(f"\n{len(scored)} labelled files: {n_good} good, "
          f"{n_subject} bad on subject, {n_cond} bad on condition")
    print("Precision counts any veto of a GOOD photograph as the error "
          "(the bar is 0.95).")
    print("Recall is measured over the SUBJECT class only (the bar is "
          "0.80): fog and winter belong to the season term, and a "
          "subject classifier judging weather is the failure mode this "
          "package already threw away three times.")
    print("\nmargin  reject-precision  subject-recall  vetoed")
    for margin in margins:
        vetoed_n = fp = caught = 0
        for row, emb, _ in scored:
            vetoed, _why = relevance.veto(emb, row["category"],
                                          margin=margin)
            if vetoed:
                vetoed_n += 1
                if row["label"] == "good":
                    fp += 1
                elif (row.get("why") or "") in SUBJECT_REASONS:
                    caught += 1
        precision = (vetoed_n - fp) / vetoed_n if vetoed_n else 1.0
        recall = caught / n_subject if n_subject else 0.0
        flag = " <- clears both bars" if (precision >= 0.95
                                          and recall >= 0.80) else ""
        print(f"{margin:6.3f}  {precision:16.3f}  {recall:14.3f}  "
              f"{vetoed_n:6}{flag}")

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
    ap.add_argument("--with-sky", action="store_true",
                    help="also fetch every labelled image to measure the "
                         "overcast probe; without it the sweep runs from "
                         "the embedding cache alone")
    args = ap.parse_args()
    build() if args.cmd == "build" else stats(with_sky=args.with_sky)


if __name__ == "__main__":
    main()
