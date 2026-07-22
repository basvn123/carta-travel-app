"""Repair destination hero images that are flags (and Wells's wrong article).

The Wikipedia lead-image harvest takes an article's FIRST image, which for
country/territory articles (Monaco, San Marino, Malta, Isle of Man, the
Channel Islands...) and some municipality articles (Appenzell, Sigulda) is
the infobox FLAG - so ~15 destinations shipped a literal flag as their hero.
Wells, Somerset is worse: its image resolved to the United Kingdom article,
which also poisoned its fame signal (18,823 views/day - more than London).

This pass finds every dest whose hero is a Flag_of image (plus the Wells
article override), walks the correct article's media list, and picks the
first real PHOTO (skips .svg and flag/coat/map/locator/logo files). It
patches the master dataset AND cache/wiki_images.json (so a re-harvest keeps
the fix), and corrects Wells's cached pageviews to the real article's number.

One-off; safe to re-run (skips dests whose hero is no longer a flag).
"""

import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "app_data" / "app_data.json"
IMG_CACHE = ROOT / "cache" / "wiki_images.json"
PV_CACHE = ROOT / "cache" / "dest_pageviews.json"

# dest id -> the article its image should come from. Country/territory
# articles often have no usable hero (Luxembourg's first photo is a medieval
# manuscript, Monaco's a prince's portrait), so these point at the city/
# capital article instead.
ARTICLE_OVERRIDES = {
    "gem:wells-somerset": "Wells, Somerset",
    "LUX": "Luxembourg City",
    "gem:monaco-mc": "Monte Carlo",
    "gem:aland": "Mariehamn",
    "GCI": "Saint Peter Port",
    "OVD": "Oviedo",
}

# Only ids whose FAME was also wrong refetch pageviews (Wells had inherited
# the United Kingdom article's traffic). The image-only overrides above keep
# their existing fame: Monaco's fame is the principality's article, not
# Monte Carlo's.
FAME_REFETCH = {"gem:wells-somerset"}

SKIP_FILE_WORDS = ("flag", "coat", "arms", "locator", "map_of", "_map",
                   "logo", "escudo", "blason", "wappen", "banner_of", "seal_of")
# Prefer a hero-looking shot (the infobox montage, a skyline, a panorama)
# over whatever historical image happens to come first in the article body
# (Luxembourg's article otherwise leads with a medieval manuscript page).
PREFER_FILE_WORDS = ("montage", "collage", "panorama", "skyline", "cityscape",
                     "aerial", "view_of", "vista")


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "carta-image-fix/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def pick_photo(article_title):
    """Best photo on the article: a montage/skyline/panorama if one exists,
    else the first image that isn't an svg or a flag/CoA/map."""
    t = urllib.parse.quote(article_title.replace(" ", "_"), safe="")
    media = get_json(f"https://en.wikipedia.org/api/rest_v1/page/media-list/{t}")
    candidates = []
    for item in media.get("items", []):
        if item.get("type") != "image":
            continue
        name = (item.get("title") or "")            # e.g. "File:Wells Cathedral.jpg"
        low = name.lower()
        if low.endswith(".svg") or any(w in low for w in SKIP_FILE_WORDS):
            continue
        candidates.append(name)
    if not candidates:
        return None
    name = next((n for n in candidates
                 if any(w in n.lower() for w in PREFER_FILE_WORDS)), candidates[0])
    fname = name.split(":", 1)[-1]
    q = urllib.parse.quote(fname, safe="")
    return {
        "thumb": f"https://commons.wikimedia.org/wiki/Special:FilePath/{q}?width=960",
        "original": f"https://commons.wikimedia.org/wiki/Special:FilePath/{q}",
        "file": fname,
    }


def pageviews_avg(article_title):
    t = urllib.parse.quote(article_title.replace(" ", "_"), safe="")
    d = get_json("https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/"
                 f"en.wikipedia/all-access/user/{t}/monthly/20250701/20260630")
    items = d.get("items", [])
    return int(round(sum(x["views"] for x in items) / 365)) if items else 0


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    img_cache = json.loads(IMG_CACHE.read_text(encoding="utf-8")) if IMG_CACHE.exists() else {}
    pv_cache = json.loads(PV_CACHE.read_text(encoding="utf-8")) if PV_CACHE.exists() else {}

    fixed = 0
    for did, d in data["destinations"].items():
        img = d.get("image") or {}
        needs = "Flag_of" in (img.get("url") or "") or did in ARTICLE_OVERRIDES
        if not needs:
            continue
        page = img.get("page") or ""
        article = ARTICLE_OVERRIDES.get(did) or urllib.parse.unquote(
            page.rsplit("/", 1)[-1]).replace("_", " ")
        if not article:
            continue
        time.sleep(0.15)
        try:
            photo = pick_photo(article)
        except Exception as e:
            print(f"  {did} ({d.get('city')}): media-list failed: {e}")
            continue
        if not photo:
            print(f"  {did} ({d.get('city')}): no non-flag photo on '{article}'")
            continue
        page_url = ("https://en.wikipedia.org/wiki/"
                    + urllib.parse.quote(article.replace(" ", "_"), safe=""))
        d["image"] = {
            "url": photo["thumb"],
            "hires": photo["original"],
            "credit": article,
            "page": page_url,
            "source": "wikipedia",
        }
        img_cache[did] = {
            "title": article,
            "url": page_url,
            "thumb": photo["thumb"],
            "original": photo["original"],
        }
        note = ""
        if did in FAME_REFETCH:        # wrong article also poisoned the fame signal
            try:
                pv = pageviews_avg(article)
                pv_cache[did] = pv
                pv_cache[f"_ovr_{did}"] = True
                note = f", fame -> {pv}/day"
            except Exception as e:
                note = f", fame refetch failed: {e}"
        print(f"  {did} ({d.get('city')}): {article} -> {photo['file']}{note}")
        fixed += 1

    DATA.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    IMG_CACHE.write_text(json.dumps(img_cache, ensure_ascii=False, indent=1), encoding="utf-8")
    PV_CACHE.write_text(json.dumps(pv_cache, indent=1), encoding="utf-8")
    print(f"fixed {fixed} hero images. Re-run apply_rating_layer + npm run data to ship.")


if __name__ == "__main__":
    main()
