"""Turn reviewed intake candidates into new-gem specs (2026-09).

The bridge between B3's review queue and the proven ingestion path
(apply_new_gems.py -> build_record): reads reports/intake_candidates.csv,
keeps the SETTLEMENT-register auto_admit misses, enriches each QID from
Wikidata in batches (P31 types, P17 country, the English short description,
the P18 image pointer), drops anything not typed as a settlement - the
review walk caught French DEPARTMENTS wearing a register award - and emits
app_data/new_gems_<date>.json in exactly the shape the 2026-08 expansion
shipped with.

Nothing here is invented:
  coordinates    the register harvest's P625
  country        Wikidata P17, mapped to iso2 through the catalogue's own
                 country table; a country the catalogue does not know is
                 skipped, not guessed
  blurb          the entity's own English short description plus the
                 register membership fact, marked _blurb_provisional like
                 the expansion's were
  anchor         the nearest airport-tier destination; minutes and euros
                 from the relation fitted on the expansion's OWN 1,468
                 records (minutes ~ 1.196 km + 1.3, eur ~ 0.322 km + 10.5),
                 marked _transfer_estimated
  image          left for the image pipeline - a hero image needs the
                 coordinate proof the audit demands, never a blind P18

Usage:
    python pipeline/intake/ingest_candidates.py            # write specs
    python pipeline/intake/ingest_candidates.py --report   # count only
"""

import argparse
import csv
import json
import sys
import time
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
sys.path.insert(0, str(ROOT / "pipeline" / "intake"))

from harvest_place_signals import ask                     # noqa: E402
from member_layer import SETTLEMENT_TYPES                 # noqa: E402
from pipeline_io import atomic_write_json                 # noqa: E402

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CSV_IN = ROOT / "reports" / "intake_candidates.csv"
WIRE = ROOT / "continent-app" / "public" / "app_data.json"
OUT = ROOT / "app_data" / f"new_gems_{date.today().strftime('%Y%m%d')}.json"

SETTLE_REGS = {
    "fr_plus_beaux_villages", "fr_plus_beaux_detours", "fr_petites_cites",
    "it_borghi_piu_belli", "fr_villes_art_histoire", "it_bandiera_arancione",
    "es_conjunto_historico", "gb_market_town", "eu_great_spa_towns",
}
REGISTER_NAME = {
    "fr_plus_beaux_villages": "Les Plus Beaux Villages de France",
    "fr_plus_beaux_detours": "Les Plus Beaux Détours de France",
    "fr_petites_cites": "Petites Cités de Caractère",
    "it_borghi_piu_belli": "I Borghi più belli d'Italia",
    "fr_villes_art_histoire": "Villes et Pays d'Art et d'Histoire",
    "it_bandiera_arancione": "Bandiera Arancione",
    "es_conjunto_historico": "Conjunto histórico-artístico",
    "gb_market_town": "historic market towns",
    "eu_great_spa_towns": "the Great Spa Towns of Europe",
}
KIND_CATS = {
    "beautiful_village": ["village", "historic"],
    "heritage_town": ["historic", "culture"],
    "spa_town": ["historic", "wellness"],
    "market_town": ["historic"],
}

MINUTES_PER_KM, MINUTES_BASE = 1.196, 1.3     # fitted on the 2026-08 expansion
EUR_PER_KM, EUR_BASE = 0.322, 10.50
ANCHOR_MAX_KM = 260.0
BATCH = 150


def fold(s):
    s = (s or "").translate(str.maketrans({"ł": "l", "Ł": "l", "ø": "o",
                                           "Ø": "o", "ß": "ss", "æ": "a"}))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return "-".join("".join(ch if ch.isalnum() else " " for ch in s.lower())
                    .split())


def haversine_km(la1, lo1, la2, lo2):
    import math
    r = 6371.0
    p1, p2 = math.radians(la1), math.radians(la2)
    dp = math.radians(la2 - la1)
    dl = math.radians(lo2 - lo1)
    a = (math.sin(dp / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2)
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def enrich(qids):
    """{qid: {types, country, desc, img}} via batched WDQS."""
    out = {}
    for i in range(0, len(qids), BATCH):
        chunk = qids[i:i + BATCH]
        values = " ".join(f"wd:{q}" for q in chunk)
        q = f"""SELECT ?p ?type ?countryLabel ?desc ?img WHERE {{
  VALUES ?p {{ {values} }}
  OPTIONAL {{ ?p wdt:P31 ?type }}
  OPTIONAL {{ ?p wdt:P17 ?country }}
  OPTIONAL {{ ?p schema:description ?desc FILTER(LANG(?desc)="en") }}
  OPTIONAL {{ ?p wdt:P18 ?img }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en" }}
}}"""
        rows = ask(q, f"enrich {i}") or []
        for b in rows:
            qid = b["p"].rsplit("/", 1)[-1]
            rec = out.setdefault(qid, {"types": set(), "country": None,
                                       "desc": None, "img": None})
            if b.get("type"):
                rec["types"].add(b["type"].rsplit("/", 1)[-1])
            if b.get("countryLabel") and not rec["country"]:
                rec["country"] = b["countryLabel"]
            if b.get("desc") and not rec["desc"]:
                rec["desc"] = b["desc"]
            if b.get("img") and not rec["img"]:
                rec["img"] = b["img"]
        print(f"  enriched {min(i + BATCH, len(qids))}/{len(qids)}")
        time.sleep(1.0)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    rows = [r for r in csv.DictReader(CSV_IN.open(encoding="utf-8-sig"))
            if r["register"] in SETTLE_REGS and r["auto_admit"] == "yes"
            and r["status"] == "missing"]
    print(f"{len(rows)} settlement-register auto_admit candidates")

    wire = json.loads(WIRE.read_text(encoding="utf-8"))
    dests = wire["destinations"]
    country_iso = {}
    for d in dests.values():
        country_iso.setdefault(d.get("country"), d.get("iso2"))
    airports = [(d.get("city_lat") if d.get("city_lat") is not None else d["lat"],
                 d.get("city_lon") if d.get("city_lon") is not None else d["lon"],
                 did)
                for did, d in dests.items() if d.get("tier") == "airport"]
    existing_ids = set(dests)
    existing_names = {}
    for d in dests.values():
        existing_names.setdefault(d.get("iso2"), set()).add(
            fold((d.get("city") or "").split("(")[0]))

    info = enrich([r["qid"] for r in rows])

    specs, dropped = [], {"not_settlement": 0, "unknown_country": 0,
                          "name_clash": 0, "no_anchor": 0, "no_desc": 0}
    used_slugs = set()
    for r in rows:
        rec = info.get(r["qid"]) or {}
        if not rec.get("types") & SETTLEMENT_TYPES:
            dropped["not_settlement"] += 1
            continue
        iso2 = country_iso.get(rec.get("country"))
        if not iso2:
            dropped["unknown_country"] += 1
            continue
        name = r["name"]
        if fold(name) in existing_names.get(iso2, set()):
            dropped["name_clash"] += 1
            continue
        lat, lon = float(r["lat"]), float(r["lon"])
        best = None
        for (alat, alon, aid) in airports:
            km = haversine_km(lat, lon, alat, alon)
            if best is None or km < best[0]:
                best = (km, aid)
        if not best or best[0] > ANCHOR_MAX_KM:
            dropped["no_anchor"] += 1
            continue
        desc = (rec.get("desc") or "").strip()
        reg_line = f"A member of {REGISTER_NAME[r['register']]}."
        blurb = (desc[0].upper() + desc[1:] + ". " if desc else "") + reg_line
        slug = fold(name)
        if f"gem:{slug}" in existing_ids or slug in used_slugs:
            slug = f"{slug}-{iso2.lower()}"
            if f"gem:{slug}" in existing_ids or slug in used_slugs:
                dropped["name_clash"] += 1
                continue
        used_slugs.add(slug)
        km, anchor = best
        specs.append({
            "slug": slug, "city": name, "wiki": name,
            "country": rec["country"], "iso2": iso2,
            "lat": round(lat, 5), "lon": round(lon, 5),
            "categories": KIND_CATS.get(r["kind"], ["historic"]),
            "blurb": blurb,
            "anchor": anchor,
            "minutes": max(5, round(MINUTES_PER_KM * km + MINUTES_BASE)),
            "eur": max(2, round(EUR_PER_KM * km + EUR_BASE)),
            "_register": r["register"], "_qid": r["qid"],
            "_sitelinks": int(r["sitelinks"]),
            "_anchor_km": round(km, 1),
            "_img_hint": rec.get("img"),
            "_blurb_provisional": True,
            "_transfer_estimated": True,
        })

    import collections
    per = collections.Counter(s["_register"] for s in specs)
    print(f"specs: {len(specs)}  dropped: {dropped}")
    for k, v in per.most_common():
        print(f"  {k:28s} {v}")
    if args.report:
        return
    atomic_write_json(OUT, specs)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
