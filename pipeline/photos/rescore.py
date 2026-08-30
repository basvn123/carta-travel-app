"""Re-rank every cached gallery by beauty, without re-harvesting anything.

The full photograph pass is hours of Wikimedia's bandwidth per layer. The
four bad heroes on the current grid (an apartment block for Laguna Beach,
a beach-bar facade for Langevelderslag, a litter bin for Fuussefeld, fog
for Burfelt) do not need a wider funnel to fix, they need the pictures
already in the cache put in a better order. So this pass walks a layer's
rich cache, fetches only the thumbnails it already published, scores each
with the engine, and rewrites the SAME image lists reordered: the beauty
hero first, everything else behind it, scores stored on the record so the
export orders without re-deriving (invariant: the cache is the snapshot).

    python pipeline/photos/rescore.py beaches --countries LU,NL
    python pipeline/photos/rescore.py lakes
    python pipeline/photos/rescore.py mountains --dry-run

Per image, stored: beauty (photo_rank_v1), aesthetic (raw LAION), month,
phash, cluster, and vetoed (the relevance rejector's reason) when it
fired. Attribution and licence fields are never touched.

Transition rule, deliberate and temporary: a vetoed image is excluded
from the hero contest and demoted to the back, but it is only DROPPED
when at least two clean images remain. The export gate wants two
photographs, and unpublishing a hundred honest rows to punish their worst
file would repeat the mountain layer's 478-row lesson in the opposite
direction. Brief 03-05 re-harvests widen the funnel; the drop tightens
then, and the `l` tier catches what still falls.

Embeddings cache under cache/photos/emb, so a re-run after a weight
change costs CPU only for the head, not for CLIP.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import aesthetics  # noqa: E402
import dedupe  # noqa: E402
import relevance  # noqa: E402
import season  # noqa: E402
import selection  # noqa: E402
import technical  # noqa: E402

LAYERS = {
    # cache dir, row list key, evidence field on the image record
    "beaches": ("beaches", "beaches", "evidence", "beach"),
    "lakes": ("lakes", "lakes", "why", "lake"),
    "mountains": ("mountains", "peaks", "evidence", "mountain"),
}

UA = ("CartaPhotos/1.0 (https://carta-europetravel.com; "
      "bas.vannieuwenhuyse123@gmail.com)")
PACE_S = 0.3          # between thumbnail fetches; CPU dominates anyway
_last_fetch = [0.0]


def fetch(url):
    wait = _last_fetch[0] + PACE_S - time.time()
    if wait > 0:
        time.sleep(wait)
    _last_fetch[0] = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.read()
    except Exception:
        return None


def assessment_from_stars(stars):
    """mountains' cached Commons Assessments string, e.g.
    "quality|featured|valued|potd". Absent elsewhere, which renormalises
    the weight away rather than scoring an unmeasured zero."""
    if not stars:
        return None
    lowered = str(stars).lower()
    if "featured" in lowered or "poty" in lowered:
        return 1.0
    if "quality" in lowered:
        return 0.75
    if "valued" in lowered:
        return 0.6
    return 0.0


def probe_url(url):
    """The 500 px derivative of a Commons thumb URL, for scoring.

    CLIP embeds at 224 px and the pixel reads all downscale first, so the
    1280 px card asset buys nothing here and costs five times the
    bandwidth. 500 is on Commons' served-width list (widths off that list
    answer 400)."""
    if url and "/thumb/" in url:
        return re.sub(r"/\d+px-", "/500px-", url, count=1)
    return url


def score_one(img, category, evidence_field):
    """Fill beauty fields on one cached image record, in place. Returns
    the fetched bytes (for dedupe hashing) or None."""
    url = probe_url(img.get("url") or img.get("full") or "")
    data = fetch(url) if url else None
    emb = None
    if data is not None:
        try:
            emb = aesthetics.embed_image(data, name=img.get("file") or url)
        except aesthetics.ModelUnavailable:
            emb = None
    aesthetic = None
    if emb is not None:
        try:
            aesthetic = aesthetics.aesthetic_raw(emb)
        except Exception:
            aesthetic = None
    month = season.capture_month(
        cand={"title": f"{img.get('file') or ''} {img.get('caption') or ''}"},
        data=data)
    # A record from before the tiers were stored passed the same strict
    # gate; it is `legacy`, hero-eligible, and never treated as `geo`.
    tier = img.get(evidence_field) or "legacy"
    vetoed, why = relevance.veto(emb, category, evidence=tier)
    try:
        width, height = int(img.get("w") or 0), int(img.get("h") or 0)
    except (TypeError, ValueError):
        width = height = 0
    components = {
        "aesthetic_norm": aesthetics.aesthetic_norm(aesthetic),
        "commons_assessment": assessment_from_stars(img.get("stars")),
        "nima_norm": aesthetics.nima_norm(aesthetics.nima_raw(data))
                     if data is not None else None,
        "technical_norm": technical.technical_norm(width, height, data),
        "season_fit": season.season_fit(month, category),
    }
    img["beauty"] = selection.beauty(components)
    img["aesthetic"] = aesthetic
    if month is not None:
        img["month"] = month
    if vetoed:
        img["vetoed"] = why
    else:
        img.pop("vetoed", None)
    ph = dedupe.phash(data) if data is not None else None
    if ph is not None:
        img["phash"] = f"{ph:016x}"
    return data


def rerank(images, evidence_field):
    """New order for one row's images: beauty hero first, clean images
    before vetoed ones, one image per dedupe cluster ahead of its twins.
    Nothing is deleted here unless two clean images remain."""
    def hero_ok(img):
        tier = img.get(evidence_field) or "legacy"
        return tier not in selection.NEVER_HERO
    clusters = dedupe.clusters(
        images,
        hash_of=lambda i: int(i["phash"], 16) if i.get("phash") else None,
        embedding_of=lambda i: aesthetics.cached_embedding(
            i.get("file") or i.get("url") or ""))
    for idx, cluster in enumerate(clusters):
        for img in cluster:
            img["cluster"] = idx

    clean = [i for i in images if not i.get("vetoed")]
    vetoed = [i for i in images if i.get("vetoed")]

    hero, gallery = selection.pick(
        clean,
        beauty_of=lambda i: i.get("beauty"),
        cluster_of=lambda i: i.get("cluster"),
        aspect_class=lambda i: "wide" if _ratio(i) >= 1.6 else
                     ("tall" if _ratio(i) < 1.0 else "mid"),
        month_of=lambda i: i.get("month"),
        hero_ok=hero_ok)
    ordered = ([hero] if hero else []) + gallery
    # Clean images the gallery cap or the cluster rule held back still
    # belong to the row; they follow in beauty order.
    rest = sorted((i for i in clean if i not in ordered),
                  key=lambda i: -(i.get("beauty") or 0.0))
    ordered += rest
    if len(clean) >= 2:
        return ordered            # vetoed images finally dropped
    return ordered + vetoed       # transition: the count survives


def _ratio(img):
    try:
        w, h = int(img.get("w") or 0), int(img.get("h") or 0)
        return (w / h) if w and h else 1.5
    except (TypeError, ValueError):
        return 1.5


def rescore_country(layer, cc, dry_run=False):
    cache_dir, row_key, evidence_field, category = LAYERS[layer]
    path = ROOT / "cache" / cache_dir / f"rich_{cc}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = data.get(row_key) or []
    changed = vetoed_n = scored_n = 0
    for row in rows:
        images = row.get("images") or []
        # One image reorders to nothing and the transition rule would not
        # drop it either way, so a single-image row costs the engine
        # nothing until the funnel widens it.
        if len(images) < 2:
            continue
        before = [i.get("file") or i.get("url") for i in images]
        for img in images:
            score_one(img, category, evidence_field)
            scored_n += 1
        vetoed_n += sum(1 for i in images if i.get("vetoed"))
        row["images"] = rerank(images, evidence_field)
        after = [i.get("file") or i.get("url") for i in row["images"]]
        if after != before:
            changed += 1
    print(f"  {cc}: {scored_n} images scored, {vetoed_n} vetoed, "
          f"{changed} rows reordered")
    if not dry_run:
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1),
                       encoding="utf-8")
        tmp.replace(path)
    return changed


def held(cache_dir):
    """The layer's hold file, or None.

    Several sessions rebuild these caches at once (the layer briefs run in
    parallel), and a rich_CC.json is a read, modify, write: whoever writes
    a country last wins and silently drops the other's fields. A layer
    being rebuilt right now therefore gets a hold file, and this refuses
    to start rather than race it:

        cache/mountains/.rescore_hold   one line saying who and why

    Delete it when the rebuild is done. This is advisory and one way (it
    only stops the photo engine), which is the honest scope: the other
    writers are separate scripts owned by separate sessions."""
    path = ROOT / "cache" / cache_dir / ".rescore_hold"
    if not path.exists():
        return None
    try:
        return path.read_text(encoding="utf-8").strip() or "no reason given"
    except OSError:
        return "unreadable hold file"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("layer", choices=sorted(LAYERS))
    ap.add_argument("--countries", default="",
                    help="comma separated ISO2, default every cached one")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--ignore-hold", action="store_true",
                    help="run even though the layer carries a hold file")
    args = ap.parse_args()

    cache_dir = LAYERS[args.layer][0]
    hold = held(cache_dir)
    if hold and not (args.ignore_hold or args.dry_run):
        raise SystemExit(f"{args.layer} is held: {hold}\n"
                         f"  (delete cache/{cache_dir}/.rescore_hold when "
                         f"the rebuild is done, or pass --ignore-hold)")
    wanted = [c.strip().upper() for c in args.countries.split(",")
              if c.strip()]
    if not wanted:
        wanted = sorted(
            re.match(r"rich_([A-Z]{2})\.json", p.name).group(1)
            for p in (ROOT / "cache" / cache_dir).glob("rich_??.json"))
    t0 = time.time()
    for cc in wanted:
        rescore_country(args.layer, cc, dry_run=args.dry_run)
    print(f"done in {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
