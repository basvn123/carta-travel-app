"""Gazetteer for Explore search (G12): every European town, region and country.

Tier: Manual (run_pipeline.py --only gazetteer)

Search must find any place in Europe, not only the catalogue: a town Carta
does not cover becomes "Near {town}" with Carta's places by distance, and a
region or country gives the places inside it (decision
.work/2026-11-18-search-settings/decision.md, section 3). This layer builds
that list from GeoNames (CC BY 4.0, credited in src/data/attribution.js):

  towns      cache/geonames_cities500.txt (every place with 500 or more
             people), kept to Europe by country code and a box
  regions    cache/geonames/admin1CodesASCII.txt, the first level below the
             country, with a box drawn around its towns
  countries  cache/geonames/countryInfo.txt
  names      cache/geonames/alternateNamesV2.zip, the en, nl, de, fr, es and
             it names of all three, so "Keulen", "Firenze" and "Venedig" find
             their place. Without the file the layer still builds, with the
             GeoNames name and its ASCII form only, and says so.

Output, continent-app/public/search/places/ (under public/search, an R2_TIER
entry, so it travels to the data host with the other search files):

  index.json   the shard table and the build facts
  areas.json   countries and regions, small, loaded when search opens
  t-NN.json    towns in about 20 shards split by folded name, so a phone
               fetches one or two small files for what is typed, never the
               whole list (measure.md, gate G2)

A town row is [geonameid, [names], lat, lon, cc, admin1, population,
{lang: name}?], the last only where a UI language names it differently; an
area row ends with the same map. A town
sits in every shard where one of its names starts, and carries all its
names there, so a prefix search needs only the shards its prefix spans.

Usage:
    python pipeline/gazetteer_layer.py [--fetch] [--cache DIR] [--out DIR]
"""

import argparse
import io
import json
import os
import sys
import unicodedata
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "cache"
OUT = ROOT / "continent-app" / "public" / "search" / "places"

DUMP = "https://download.geonames.org/export/dump/"
EXTRA_FILES = ("admin1CodesASCII.txt", "countryInfo.txt", "alternateNamesV2.zip")

# Carta's six languages. GeoNames' main name is usually the English or the
# local one, so en is asked for too.
LANGS = ("en", "nl", "de", "fr", "es", "it")

# The countries Explore can reach (the catalogue's 52, measure.md section 2),
# plus the small ones a traveller may still type.
EUROPE = frozenset((
    "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU "
    "IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ "
    "SK SM TR UA VA XK").split())

# Russia and Turkey reach far into Asia; the box keeps their European part.
# South to 27 and west to -32 keep the Canaries, Madeira and the Azores.
BOX = (27.0, 72.5, -32.0, 45.0)  # lat min, lat max, lon min, lon max

SHARDS = 20

# The letters NFKD does not decompose; the same table as
# pipeline/search_index_layer.py and src/lib/searchIndex.js, because two
# half-matching folds are worse than none.
FOLD_TABLE = str.maketrans({
    "ł": "l", "Ł": "l", "ø": "o", "Ø": "o", "æ": "ae", "Æ": "ae",
    "œ": "oe", "Œ": "oe", "ß": "ss", "đ": "d", "Đ": "d",
    "þ": "th", "Þ": "th", "ð": "d", "Ð": "d",
})


def fold(s):
    s = (s or "").translate(FOLD_TABLE)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.replace("-", " ").replace("'", " ").replace("’", " ") \
        .lower().strip()


def in_box(lat, lon):
    return BOX[0] <= lat <= BOX[1] and BOX[2] <= lon <= BOX[3]


def fetch_missing(gn_dir):
    """Download the three GeoNames files that are not there yet. Never
    re-downloads: the files change little and alternateNamesV2 is 200 MB."""
    gn_dir.mkdir(parents=True, exist_ok=True)
    for name in EXTRA_FILES:
        dest = gn_dir / name
        if dest.exists() and dest.stat().st_size > 0:
            continue
        tmp = dest.with_suffix(dest.suffix + ".part")
        print(f"  fetching {DUMP}{name}")
        req = urllib.request.Request(DUMP + name, headers={"User-Agent": "carta-pipeline"})
        with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
        os.replace(tmp, dest)


def read_towns(path):
    """Europe's towns from cities500: {gid: town dict}."""
    towns = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            c = line.rstrip("\n").split("\t")
            if len(c) < 15 or c[8] not in EUROPE:
                continue
            lat, lon = float(c[4]), float(c[5])
            if not in_box(lat, lon):
                continue
            towns[int(c[0])] = {
                "name": c[1], "ascii": c[2], "lat": lat, "lon": lon,
                "cc": c[8], "a1": c[10], "pop": int(c[14] or 0),
            }
    return towns


def read_admin1(path):
    """{"IT.16": {"name", "ascii", "gid"}} for Europe's countries."""
    out = {}
    if not path.exists():
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            c = line.rstrip("\n").split("\t")
            if len(c) < 4 or c[0].split(".")[0] not in EUROPE:
                continue
            out[c[0]] = {"name": c[1], "ascii": c[2], "gid": int(c[3] or 0)}
    return out


def read_countries(path):
    """{"IT": {"name", "gid", "pop"}} for Europe's countries."""
    out = {}
    if not path.exists():
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#"):
                continue
            c = line.rstrip("\n").split("\t")
            if len(c) < 17 or c[0] not in EUROPE:
                continue
            out[c[0]] = {"name": c[4], "gid": int(c[16] or 0), "pop": int(c[7] or 0)}
    return out


def read_alt_names(path, wanted):
    """{gid: [(lang, name, preferred, short)]} in LANGS for the geonameids
    in `wanted`, streamed from the zip so the 790 MB text never lands on
    disk. Historic and colloquial names are left out: they would match what
    nobody types."""
    out = {}
    if not path.exists():
        return out
    langs = set(LANGS)
    with zipfile.ZipFile(path) as z:
        with z.open("alternateNamesV2.txt") as raw:
            for line in io.TextIOWrapper(raw, encoding="utf-8", errors="replace"):
                c = line.split("\t")
                if len(c) < 8 or c[2] not in langs:
                    continue
                gid = int(c[1])
                if gid not in wanted or c[6] == "1" or c[7].strip() == "1":
                    continue
                name = c[3].strip()
                if name:
                    out.setdefault(gid, []).append((c[2], name, c[4] == "1", c[5] == "1"))
    return out


def alt_list(entries):
    return [e[1] for e in entries or ()]


def lang_names(main, entries):
    """{lang: name} to show in each UI language, only where it differs from
    the main name: "Lissabon" finds Lisbon in an English UI, which then shows
    "Lisbon" (flow-C M4). Preferred names win, then full names over short
    ones, then the first listed."""
    best = {}
    for lang, name, preferred, short in entries or ():
        rank = (0 if preferred else 1, 1 if short else 0)
        if lang not in best or rank < best[lang][0]:
            best[lang] = (rank, name)
    main_fold = fold(main)
    return {lang: n for lang, (_, n) in sorted(best.items()) if fold(n) != main_fold}


def names_for(main, ascii_name, alts):
    """Main name first, then every other spelling that folds differently."""
    names, seen = [], set()
    for n in [main, ascii_name, *alts]:
        k = fold(n)
        if n and k and k not in seen:
            seen.add(k)
            names.append(n)
    return names


def boxes(towns):
    """{key: [w, s, e, n]} around the towns of each country and region,
    with a small margin so a lone town still makes a box."""
    acc = {}
    for t in towns.values():
        for key in (t["cc"], f"{t['cc']}.{t['a1']}"):
            b = acc.setdefault(key, [t["lon"], t["lat"], t["lon"], t["lat"], 0])
            b[0] = min(b[0], t["lon"]); b[1] = min(b[1], t["lat"])
            b[2] = max(b[2], t["lon"]); b[3] = max(b[3], t["lat"])
            b[4] += t["pop"]
    m = 0.05
    return {k: ([round(b[0] - m, 3), round(b[1] - m, 3), round(b[2] + m, 3), round(b[3] + m, 3)], b[4])
            for k, b in acc.items()}


def split_shards(keyed, n):
    """Cut the sorted (fold key, gid) list into n runs of about equal size.
    A cut never splits one key, and each shard starts at the shortest
    prefix that still sorts after the shard before it, so the index stays
    readable ("sa", "san", "sb")."""
    keyed.sort()
    total = len(keyed)
    cuts = [0]
    for i in range(1, n):
        j = max(cuts[-1] + 1, round(total * i / n))
        while j < total and keyed[j][0] == keyed[j - 1][0]:
            j += 1
        if j >= total:
            break
        cuts.append(j)
    shards = []
    for i, start in enumerate(cuts):
        end = cuts[i + 1] if i + 1 < len(cuts) else total
        first = keyed[start][0]
        if i == 0:
            frm = ""
        else:
            prev = keyed[start - 1][0]
            frm = first
            for L in range(1, len(first) + 1):
                if first[:L] > prev:
                    frm = first[:L]
                    break
        shards.append((frm, keyed[start:end]))
    return shards


def build(cache, out, *, shards=SHARDS, now=None):
    cities = cache / "geonames_cities500.txt"
    gn_dir = cache / "geonames"
    towns = read_towns(cities)
    admin1 = read_admin1(gn_dir / "admin1CodesASCII.txt")
    countries = read_countries(gn_dir / "countryInfo.txt")
    alt_path = gn_dir / "alternateNamesV2.zip"
    wanted = set(towns) | {a["gid"] for a in admin1.values()} | {c["gid"] for c in countries.values()}
    alts = read_alt_names(alt_path, wanted)
    langs = list(LANGS) if alt_path.exists() else []

    rows = {}
    keyed = []
    for gid, t in towns.items():
        names = names_for(t["name"], t["ascii"], alt_list(alts.get(gid)))
        rows[gid] = [gid, names, round(t["lat"], 4), round(t["lon"], 4), t["cc"], t["a1"], t["pop"]]
        shown = lang_names(t["name"], alts.get(gid))
        if shown:
            rows[gid].append(shown)
        for k in {fold(x) for x in names}:
            keyed.append((k, gid))

    bx = boxes(towns)
    area_regions = []
    for code, a in sorted(admin1.items()):
        if code not in bx:
            continue  # a region with no town in the list has nothing to show
        box, pop = bx[code]
        area_regions.append([code, names_for(a["name"], a["ascii"], alt_list(alts.get(a["gid"]))), box, pop,
                             lang_names(a["name"], alts.get(a["gid"]))])
    area_countries = []
    for cc, c in sorted(countries.items()):
        if cc not in bx:
            continue
        area_countries.append([cc, names_for(c["name"], "", alt_list(alts.get(c["gid"]))), bx[cc][0], c["pop"],
                               lang_names(c["name"], alts.get(c["gid"]))])

    out.mkdir(parents=True, exist_ok=True)
    table = []
    for i, (frm, part) in enumerate(split_shards(keyed, shards)):
        name = f"t-{i:02d}.json"
        gids = sorted({g for _, g in part}, key=lambda g: (-rows[g][6], g))
        _write(out / name, [rows[g] for g in gids])
        table.append({"file": name, "from": frm, "rows": len(gids)})
    for old in out.glob("t-*.json"):
        if old.name not in {s["file"] for s in table}:
            old.unlink()  # a shard from an earlier, larger split
    _write(out / "areas.json", {"countries": area_countries, "regions": area_regions})
    stamp = (now or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
    index = {
        "v": 2,
        "built": stamp,
        "source": "GeoNames, CC BY 4.0",
        "langs": langs,
        "towns": len(rows),
        "regions": len(area_regions),
        "countries": len(area_countries),
        "shards": table,
    }
    _write(out / "index.json", index)
    return index


def _write(path, obj):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--fetch", action="store_true",
                    help="download the GeoNames admin1, country and alternate-name files when missing")
    ap.add_argument("--cache", type=Path, default=Path(os.environ.get("CARTA_GEONAMES_CACHE") or CACHE),
                    help="the folder holding geonames_cities500.txt and geonames/ (default cache/)")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args(argv)
    if not (args.cache / "geonames_cities500.txt").exists():
        print(f"ERROR: {args.cache / 'geonames_cities500.txt'} is missing; run the geonames task first")
        return 1
    if args.fetch:
        fetch_missing(args.cache / "geonames")
    ix = build(args.cache, args.out)
    sizes = sum(p.stat().st_size for p in args.out.glob("*.json"))
    print(f"gazetteer: {ix['towns']} towns, {ix['regions']} regions, {ix['countries']} countries, "
          f"{len(ix['shards'])} shards, {sizes / 1e6:.2f} MB, names in {', '.join(ix['langs']) or 'GeoNames main and ASCII only'}")
    if not ix["langs"]:
        print("  alternateNamesV2.zip is missing: names in other languages are not in this build (--fetch adds them)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
