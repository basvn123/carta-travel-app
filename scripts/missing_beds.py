"""Target list for the bed re-scrape (T1075, ROADMAP D10).

Lists the places with no bed price, grouped by country with counts (for
example "FR 94, IT 77"), and the places whose beds rest on 2 or fewer scraped
properties in every tier, for the next laptop or box scrape run.

Reads only what the app ships: the destination list (public/app_data.json)
and the stays wire (public/stays/v1/{iso2}.json). A place is missing when the
wire holds no record for it, or a record with no beds. A tier is thin when its
`src[tier].n` is stay.thin_obs (2) or fewer; a place is thin when it has beds
and every tier it prices is thin. Writes nothing to the app.

Usage:
  python scripts/missing_beds.py
  python scripts/missing_beds.py --public continent-app/public --out cache/stays/missing_beds.json
"""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
THIN_OBS = 2     # config/pricing.json stay.thin_obs


def load_wire(stays_dir):
    out = {}
    for f in sorted(Path(stays_dir).glob("*.json")):
        if f.name == "manifest.json":
            continue
        out.update(json.loads(f.read_text(encoding="utf-8")).get("dests") or {})
    return out


def classify(destinations, wire, thin_obs=THIN_OBS):
    """-> (missing, thin): lists of {id, city, country, iso2[, tiers]} rows."""
    missing, thin = [], []
    for did, d in destinations.items():
        row = {"id": did, "city": d.get("city"), "country": d.get("country"), "iso2": d.get("iso2")}
        rec = wire.get(did)
        beds = (rec or {}).get("beds") or {}
        if not beds:
            missing.append(row)
            continue
        src = (rec or {}).get("src") or {}
        counts = {t: (src.get(t) or {}).get("n") for t in beds}
        known = {t: n for t, n in counts.items() if isinstance(n, (int, float))}
        if known and len(known) == len(counts) and all(n <= thin_obs for n in known.values()):
            thin.append({**row, "tiers": known})
    return missing, thin


def by_country(rows):
    groups = {}
    for r in rows:
        groups.setdefault(r.get("iso2") or "??", []).append(r["id"])
    return {k: {"count": len(v), "ids": sorted(v)}
            for k, v in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0]))}


def summary(groups, top=8):
    return ", ".join(f"{k} {g['count']}" for k, g in list(groups.items())[:top])


def build(public_dir):
    public = Path(public_dir)
    destinations = json.loads((public / "app_data.json").read_text(encoding="utf-8"))["destinations"]
    wire = load_wire(public / "stays" / "v1")
    missing, thin = classify(destinations, wire)
    return {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "places": len(destinations),
        "with_beds": len(destinations) - len(missing),
        "missing": {"count": len(missing), "by_country": by_country(missing),
                    "ids": sorted(r["id"] for r in missing), "places": missing},
        "thin": {"count": len(thin), "threshold": THIN_OBS, "by_country": by_country(thin),
                 "places": thin, "thin_tiers": sum(
                     1 for rec in wire.values() for v in (rec.get("src") or {}).values()
                     if isinstance(v.get("n"), (int, float)) and v["n"] <= THIN_OBS),
                 "tiers": sum(len(rec.get("src") or {}) for rec in wire.values())},
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--public", default=str(ROOT / "continent-app" / "public"))
    ap.add_argument("--out", default=str(ROOT / "cache" / "stays" / "missing_beds.json"))
    a = ap.parse_args(argv)
    rep = build(a.public)
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rep, indent=1, ensure_ascii=False), encoding="utf-8")
    m, t = rep["missing"], rep["thin"]
    print(f"{m['count']} of {rep['places']} places have no bed price: {summary(m['by_country'])}")
    print(f"{t['count']} places rest on {THIN_OBS} or fewer observations in every tier: {summary(t['by_country'])}")
    print(f"{t['thin_tiers']} of {t['tiers']} priced tiers rest on {THIN_OBS} or fewer observations")
    print(f"target list: {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
