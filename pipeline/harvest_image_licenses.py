"""harvest_image_licenses.py - per-file TASL metadata for POI thumbnails.

The POI image sweeps stored only a thumbnail URL; reuse compliance needs the
file's Title-Author-Source-Licence chain, and NC/ND-licensed files (plus the
rare "Wikimedia only" grants) are not acceptable in the catalogue at all.
The citytrips path already stores per-file licences; this generalises it to
every items_full POI image hosted on Wikimedia (upload.wikimedia.org).

Batched (50 titles/request), cached, resumable, cache-only:

  cache/poi_image_licenses.json
    { "<File name.jpg>": {"license": "CC BY-SA 4.0",
                          "license_url": "...", "author": "Jane Doe",
                          "credit": "...", "ok": true}
      | {"miss": true} }         # file gone from Commons

`ok: false` marks files whose licence fails the gate (NC, ND, "permission",
no licence metadata). audit_quality.py reports them; a follow-up apply can
drop those img fields from the master once reviewed.

Source: Commons imageinfo extmetadata (LicenseShortName, LicenseUrl, Artist,
Credit, Restrictions). Artist arrives as HTML; tags are stripped.

Usage:
    python harvest_image_licenses.py             # everything unresolved
    python harvest_image_licenses.py --limit 500
    python harvest_image_licenses.py --report    # gate summary, no network
"""
import argparse
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from pipeline_io import atomic_write_json, load_json

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "app_data" / "app_data.json"
CACHE = ROOT / "cache" / "poi_image_licenses.json"

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "CartaTravelApp/1.0 (portfolio project; "
                    "data@carta-europetravel.com)"}
TITLES_PER_REQ = 50
DELAY_S = 0.25
RETRIES = 5
TIMEOUT_S = 60
CHECKPOINT_EVERY = 20

# upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Name.jpg/400px-Name.jpg
# upload.wikimedia.org/wikipedia/commons/a/ab/Name.jpg
_THUMB_RE = re.compile(
    r"upload\.wikimedia\.org/wikipedia/commons/thumb/[0-9a-f]/[0-9a-f]{2}/"
    r"([^/]+)/")
_DIRECT_RE = re.compile(
    r"upload\.wikimedia\.org/wikipedia/commons/[0-9a-f]/[0-9a-f]{2}/([^/?]+)$")
_TAG_RE = re.compile(r"<[^>]+>")
# Licence short names that fail the gate. "Public domain", CC0, CC BY,
# CC BY-SA, FAL and the localised variants all pass, and so does
# "Copyrighted free use" (Commons' released-for-any-purpose grant; an
# earlier regex wrongly flagged it on the word "copyrighted" - the 2026-08
# full sweep found those 36 were the ONLY hits, i.e. zero real violations).
_BAD_LICENSE_RE = re.compile(r"\b(nc\b|nd\b|noncommercial|non.?commercial"
                             r"|no.?derivatives|by permission|permission only"
                             r")", re.I)


def commons_filename(img_url):
    if not img_url:
        return None
    m = _THUMB_RE.search(img_url) or _DIRECT_RE.search(img_url)
    if not m:
        return None
    return urllib.parse.unquote(m.group(1)).replace("_", " ")


def _get(params):
    url = API + "?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            last = e
            time.sleep(2 ** attempt * 2)
    print(f"    ! giving up: {last}")
    return None


def strip_html(s):
    return _TAG_RE.sub("", s or "").strip()


def gate_ok(license_name, restrictions):
    if not license_name:
        return False
    if _BAD_LICENSE_RE.search(license_name):
        return False
    if restrictions and "insignia" not in restrictions:
        # 'trademarked'/'personality' are display-safe; 'fop' style
        # restrictions surface through the audit's FoP queue instead.
        pass
    return True


def collect_filenames(data):
    names = {}
    for d in data["destinations"].values():
        for it in (d.get("activities") or {}).get("items_full") or []:
            fn = commons_filename(it.get("img"))
            if fn:
                names.setdefault(fn, 0)
                names[fn] += 1
    return names


def harvest(names, cache, limit=None):
    todo = [n for n in sorted(names) if n not in cache]
    if limit:
        todo = todo[:limit]
    print(f"[tasl] {len(todo)} Commons files to resolve "
          f"({len(cache)} cached)")
    batches = 0
    for i in range(0, len(todo), TITLES_PER_REQ):
        chunk = todo[i:i + TITLES_PER_REQ]
        params = {
            "action": "query", "format": "json",
            "prop": "imageinfo", "iiprop": "extmetadata",
            "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|"
                                   "Credit|Restrictions|UsageTerms",
            "titles": "|".join(f"File:{n}" for n in chunk),
        }
        time.sleep(DELAY_S)
        d = _get(params)
        if d is None:
            continue
        q = (d.get("query") or {})
        norm = {r["to"]: r["from"] for r in q.get("normalized") or []}
        for p in (q.get("pages") or {}).values():
            title = p.get("title") or ""
            orig = norm.get(title, title)
            name = orig[len("File:"):] if orig.startswith("File:") else orig
            info = (p.get("imageinfo") or [{}])[0]
            meta = info.get("extmetadata") or {}
            if not meta:
                cache[name] = {"miss": True}
                continue
            def val(k):
                return (meta.get(k) or {}).get("value") or ""
            lic = strip_html(val("LicenseShortName")) or None
            rec = {
                "license": lic,
                "license_url": strip_html(val("LicenseUrl")) or None,
                "author": strip_html(val("Artist"))[:200] or None,
                "credit": strip_html(val("Credit"))[:200] or None,
                "ok": gate_ok(lic, strip_html(val("Restrictions"))),
            }
            cache[name] = {k: v for k, v in rec.items() if v is not None
                           or k == "ok"}
        batches += 1
        if batches % CHECKPOINT_EVERY == 0:
            atomic_write_json(CACHE, cache, indent=None,
                              separators=(",", ":"))
            print(f"    [tasl] {i + len(chunk)}/{len(todo)}")
    atomic_write_json(CACHE, cache, indent=None, separators=(",", ":"))


def report(names, cache):
    resolved = {n: cache[n] for n in names if n in cache}
    bad = {n: r for n, r in resolved.items()
           if not r.get("miss") and not r.get("ok")}
    missing = sum(1 for n in names if n not in cache)
    gone = sum(1 for r in resolved.values() if r.get("miss"))
    print(f"[tasl] {len(names)} Commons files referenced by POI images; "
          f"{len(resolved)} resolved, {missing} unresolved, {gone} gone")
    print(f"[tasl] GATE FAILURES: {len(bad)} files with NC/ND/permission "
          f"licences (POIs using them: "
          f"{sum(names[n] for n in bad)})")
    from collections import Counter
    lic_dist = Counter(r.get("license") or "?" for r in resolved.values()
                       if not r.get("miss"))
    for lic, n in lic_dist.most_common(12):
        print(f"    {lic}: {n}")
    for n, r in list(bad.items())[:10]:
        print(f"    BAD: {n} ({r.get('license')})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    data = json.loads(DATA.read_text(encoding="utf-8"))
    names = collect_filenames(data)
    cache = load_json(CACHE)
    if not args.report:
        harvest(names, cache, args.limit)
    report(names, cache)


if __name__ == "__main__":
    main()
