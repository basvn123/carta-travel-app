"""Snapshot the Eurostat price level indices the food benchmark reads.

Dataset: prc_ppp_ind, indicator PLI_EU27_2020 (price level index, EU27 = 100),
two analytical categories:

    A0111  Restaurants and hotels     (the eating-out part of the basket)
    A0101  Food and non-alcoholic bev (the self-catering part)

Licence: Eurostat reuse policy, compatible with CC BY 4.0 (the ledger row for
Eurostat in docs/tos/data_licenses.md already covers prc_ppp_ind as the cost
layer's own scaling source). Attribution: (c) European Union, Eurostat.

The snapshot is committed next to the suite (data/eurostat_pli.json) so a run
is reproducible without the network and the year each figure comes from is on
record. Re-run this script to refresh; the benchmark reads the file, never the
API.

    python tools/benchmark/fetch_eurostat.py

Every geo keeps its LATEST available year. The United Kingdom stops at 2020 in
this dataset, so it is kept with its year and the benchmark decides what to do
with stale rows (it excludes them from the headline score).
"""
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

API = ("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/"
       "prc_ppp_ind?format=JSON&lang=EN&na_item=PLI_EU27_2020&ppp_cat={cat}")
CATS = {"A0111": "rest_hotels", "A0101": "food_nonalc"}
OUT = Path(__file__).resolve().parent / "data" / "eurostat_pli.json"

# Eurostat geo code -> ISO 3166-1 alpha-2 as the catalogue uses it.
GEO_TO_ISO2 = {"EL": "GR", "UK": "GB"}


def fetch(cat):
    with urllib.request.urlopen(API.format(cat=cat), timeout=90) as r:
        d = json.load(r)
    geo = d["dimension"]["geo"]["category"]["index"]
    years = d["dimension"]["time"]["category"]["index"]
    n_years = d["size"][d["id"].index("time")]
    vals = d["value"]
    out = {}
    for g, gi in geo.items():
        series = {}
        for yr, ti in years.items():
            v = vals.get(str(gi * n_years + ti))
            if v is not None:
                series[yr] = v
        if not series or len(g) != 2 or g in ("EA", "EU"):
            continue
        latest = max(series)
        out[GEO_TO_ISO2.get(g, g)] = {"value": series[latest], "year": int(latest)}
    return out, d.get("updated")


def main():
    snap = {"source": "Eurostat prc_ppp_ind, PLI_EU27_2020 (EU27 = 100)",
            "licence": "Eurostat reuse policy, CC BY 4.0 compatible; (c) European Union",
            "fetched": date.today().isoformat(), "categories": {}}
    for cat, key in CATS.items():
        data, updated = fetch(cat)
        snap["categories"][key] = {"code": cat, "updated": updated, "by_iso2": data}
        print(f"{cat} {key}: {len(data)} geos, dataset updated {updated}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snap, indent=1, sort_keys=True), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    sys.exit(main())
