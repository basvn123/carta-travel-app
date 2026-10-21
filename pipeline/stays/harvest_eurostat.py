"""Eurostat signals for the stay layer (free, CC BY 4.0 reuse policy).

  HICP accommodation services, monthly index per country:
      prc_hicp_minr (ECOICOP v2), coicop18=CP112, unit=I25 (2025=100).
      The older prc_hicp_midx stops at 2025-12, so it is not used.
      build_stays applies it YEAR ON YEAR (same calendar month), so the index's
      own summer peak never gets counted on top of our measured season.

  Nights spent at tourist accommodation, monthly per country:
      tour_occ_nim (unit=NR, c_resid=TOTAL, nace_r2=I551-I553).
      Only used to fill a month that has no measured price anywhere in the
      country (normally none once Xotelo has run for a few months).

  Price level index, restaurants and hotels (prc_ppp_ind, ppp_cat=A0111,
      EU27=100), latest year: scales the European median for a country with no
      measured town at all (the last rung of the estimation ladder).

Writes STATE/eurostat.json:
  {"captured", "hicp": {iso2: {"YYYY-MM": index}}, "nights": {iso2: [12 shares]},
   "pli": {iso2: index}}
"""

import sys
from collections import defaultdict
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import STATE, USER_AGENT, now_iso, write_json  # noqa: E402

API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"
OUT = STATE / "eurostat.json"

# Eurostat geo codes that differ from ISO 3166.
TO_ISO = {"EL": "GR", "UK": "GB"}


def fetch(dataset, params):
    r = httpx.get(f"{API}/{dataset}", params={"format": "JSON", **params},
                  headers={"User-Agent": USER_AGENT}, timeout=120)
    r.raise_for_status()
    return r.json()


def decode(d):
    """JSON-stat -> {(geo, time): value}; every other dimension has size 1."""
    dims = d["id"]
    sizes = d["size"]
    idx = {k: {v: kk for kk, v in d["dimension"][k]["category"]["index"].items()}
           for k in dims}
    out = {}
    for flat, val in d["value"].items():
        flat = int(flat)
        coords = {}
        for k, s in zip(reversed(dims), reversed(sizes)):
            coords[k] = idx[k][flat % s]
            flat //= s
        out[(coords["geo"], coords["time"])] = val
    return out


def hicp(since):
    d = fetch("prc_hicp_minr", {"unit": "I25", "coicop18": "CP112",
                                "sinceTimePeriod": since})
    res = defaultdict(dict)
    for (geo, t), v in decode(d).items():
        if len(geo) == 2:
            res[TO_ISO.get(geo, geo)][t] = v
    return res


def nights(since):
    d = fetch("tour_occ_nim", {"unit": "NR", "c_resid": "TOTAL",
                               "nace_r2": "I551-I553", "sinceTimePeriod": since})
    acc = defaultdict(lambda: [[] for _ in range(12)])
    for (geo, t), v in decode(d).items():
        if len(geo) == 2 and v:
            acc[TO_ISO.get(geo, geo)][int(t[5:7]) - 1].append(v)
    res = {}
    for cc, months in acc.items():
        means = [sum(m) / len(m) if m else None for m in months]
        if None in means:
            continue
        avg = sum(means) / 12
        res[cc] = [round(m / avg, 3) for m in means]
    return res


def pli():
    d = fetch("prc_ppp_ind", {"na_item": "PLI_EU27_2020", "ppp_cat": "A0111",
                              "sinceTimePeriod": "2022"})
    best = {}
    for (geo, t), v in decode(d).items():
        if len(geo) == 2 and v and (geo not in best or t > best[geo][0]):
            best[geo] = (t, v)
    return {TO_ISO.get(g, g): v for g, (t, v) in best.items()}


def main():
    out = {"captured": now_iso(), "hicp": hicp("2024-01")}
    try:
        out["nights"] = nights("2023-01")
    except httpx.HTTPError as e:
        print("tour_occ_nim failed, season fill-in falls back to measured "
              "curves only:", e)
        out["nights"] = {}
    out["pli"] = pli()
    write_json(OUT, out)
    last = {cc: max(v) for cc, v in out["hicp"].items()}
    print(f"HICP CP112: {len(out['hicp'])} countries, latest "
          f"{max(last.values()) if last else None}; nights curves: "
          f"{len(out['nights'])} countries")


if __name__ == "__main__":
    main()
