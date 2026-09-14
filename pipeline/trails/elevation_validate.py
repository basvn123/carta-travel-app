"""The validation table the elevation layer never had (ROUTES.md R4).

elevation.py samples Copernicus GLO-30 at 30 m, smooths over three samples
and commits a climb only past 5 m of hysteresis. Those constants were
chosen in 2026-08 by sweeping combinations against the OSM ascent tags of
272 Swiss routes, most of which copy SchweizMobil's official figures, and
they have never been checked against anything else. ROUTES.md proposed a
different recipe (20 m, a 150 m window, 8 m of hysteresis) without evidence
either. This module puts both against published figures for named routes
and writes the table, so the choice is a measurement and not a preference.

What it compares. For each route below the lab holds an OSM relation with a
sampled profile. The publisher's own figure for the same route is recorded
with its URL; where the OSM relation runs the other way round, the lab's
descent is compared with the published ascent and the flag says so. The ten
CORE rows have one clear published figure from the route's operator or the
national mapping standard. The SUPPLEMENTARY rows are routes whose
published figures disagree with each other by 15 percent or more (the West
Highland Way is quoted at anything from 3,155 to 4,800 m), and they are
reported but do not count towards the verdict.

Both methods are run here by calling elevation.process_trip with the
module's constants set for the run, on the same cached DEM tiles. The file
elevation.py is not changed by this; the winner is applied by hand, if the
table says the current method should change at all.

Also here: the outlier review. Every published route over 250 m of ascent
per kilometre is listed with the one test that separates a real climb from
a DEM artefact: on a single sustained climb the summed ascent is close to
the height difference between the line's lowest and highest point, while
noise inflates the sum far above it.

Usage, from the repo root (lab up; DEM tiles under data/raw/dem):
    python pipeline/trails/elevation_validate.py           # table + outliers
    python pipeline/trails/elevation_validate.py --outliers-only

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from db import connect  # noqa: E402
import elevation as E  # noqa: E402

REPORT = ROOT / "data" / "reports" / "routes_elevation_validation.json"
TOLERANCE = 0.15
ACCESSED = "2026-09-13"

# The two recipes. A is what elevation.py ships; B is ROUTES.md's proposal
# (150 m over 20 m samples is 7.5 samples; the window must be odd, so 7).
METHODS = {
    "A_current": {"SAMPLE_STEP_M": 30.0, "SMOOTH_WINDOW": 3, "CLIMB_THRESHOLD_M": 5.0},
    "B_spec": {"SAMPLE_STEP_M": 20.0, "SMOOTH_WINDOW": 7, "CLIMB_THRESHOLD_M": 8.0},
}

# lab trip id, name, country, published figures, provenance.
# reversed: the OSM relation runs opposite to the publisher's direction, so
# the lab's descent stands in for the published ascent and vice versa.
ROUTES = [
    {"id": 7077, "name": "Via Alpina (Swiss national route 1)", "cc": "CH", "core": True,
     "official": {"distance_km": 390, "ascent_m": 23600, "descent_m": 24800},
     "publisher": "SchweizMobil", "source": "https://www.schweizmobil.ch/en/wanderland/route-01.html",
     "note": "SchweizMobil route page; OSM ascent tag on the relation says 23500. Lab relation is 379.5 km, 20 stages."},
    {"id": 17370, "name": "Adlerweg Etappe 11, Karwendelhaus to Hallerangerhaus", "cc": "AT", "core": True,
     "official": {"distance_km": 14.0, "ascent_m": 1440, "descent_m": None},
     "publisher": "Tirol Werbung", "source": "https://www.tirol.at/aktivitaeten/sport/wandern/weitwanderwege/anspruchsvolle-weitwanderwege/adlerweg/etappen-karwendel",
     "note": "Tirol's stage numbering matches OSM's for the Karwendel stages (8 to 15 checked by endpoints and length)."},
    {"id": 17660, "name": "Adlerweg Etappe 15, Solsteinhaus to Leutasch", "cc": "AT", "core": True,
     "official": {"distance_km": 20.0, "ascent_m": 870, "descent_m": None},
     "publisher": "Tirol Werbung", "source": "https://www.tirol.at/aktivitaeten/sport/wandern/weitwanderwege/anspruchsvolle-weitwanderwege/adlerweg/etappen-karwendel",
     "note": ""},
    {"id": 17675, "name": "Adlerweg Etappe 16, Leutasch to Ehrwald", "cc": "AT", "core": True,
     "official": {"distance_km": 23.0, "ascent_m": 590, "descent_m": None},
     "publisher": "Tirol Werbung", "source": "https://www.tirol.at/aktivitaeten/sport/wandern/weitwanderwege/anspruchsvolle-weitwanderwege/adlerweg/etappen-wettersteingebirge",
     "note": ""},
    {"id": 31151, "name": "GR 20 (Calenzana to Conca)", "cc": "FR", "core": True,
     "official": {"distance_km": 178, "ascent_m": 12800, "descent_m": None},
     "publisher": "published guide (route managed by the Parc naturel regional de Corse)",
     "source": "https://livre-gr20-corse.com/etapes",
     "note": "176 km classic line, 180 km with the summit variants; 12,800 m D+ is the figure the French guides agree on. Lab relation 183.6 km."},
    {"id": 102744, "name": "Malerweg", "cc": "DE", "core": True,
     "official": {"distance_km": 116, "ascent_m": 3600, "descent_m": None},
     "publisher": "Tourismusverband Saechsische Schweiz",
     "source": "https://www.saechsische-schweiz.de/malerweg/wanderweg-malerweg/wanderweg-profil.html",
     "note": "Publisher calls 3600 hm a Richtwert and says measurements vary by method; their own 2026-01 track analysis is quoted elsewhere at about 4,000."},
    {"id": 207956, "name": "Rennsteig", "cc": "DE", "core": True,
     "official": {"distance_km": 169.28, "ascent_m": 2690, "descent_m": 2439},
     "publisher": "Tourismus Thueringer Wald",
     "source": "https://www.tourismus-thueringer-wald.de/wanderroute/rennsteig",
     "note": "A ridge path with hundreds of small undulations: the case that tests hysteresis rather than smoothing. Wanderbares Deutschland quotes 2186 / 1968."},
    {"id": 21667, "name": "Besseggen (Memurubu to Gjendesheim)", "cc": "NO", "core": True, "reversed": True,
     "official": {"distance_km": 13.7, "ascent_m": 1020, "descent_m": None},
     "publisher": "DNT (ut.no)", "source": "https://ut.no/turforslag/114842/klassikeren-over-besseggen",
     "note": "DNT quotes 1020 hoydemeter totalt Memurubu to Gjendesheim; the OSM relation runs Gjendesheim to Memurubu."},
    {"id": 22086, "name": "Preikestolen round trip", "cc": "NO", "core": True,
     "official": {"distance_km": 8.0, "ascent_m": 500, "descent_m": None},
     "publisher": "Fjord Norway", "source": "https://www.fjordnorway.com/en/see-and-do/preikestolen",
     "note": "Round trip from the car park; 500 m of gain is the regional tourism board's figure."},
    {"id": 186740, "name": "Ben Nevis Mountain Track", "cc": "GB", "core": True,
     "official": {"distance_km": 8.5, "ascent_m": 1352, "descent_m": None},
     "publisher": "Walkhighlands", "source": "https://www.walkhighlands.co.uk/fortwilliam/bennevis.shtml",
     "note": "17 km return, 1352 m ascent; the OSM relation is the one-way path (8.1 km). Net height 1345 minus 20 m."},
    # Supplementary: published figures disagree with each other.
    {"id": 190557, "name": "Alta Via 1 (Braies to Belluno)", "cc": "IT", "core": False, "reversed": True,
     "official": {"distance_km": 120, "ascent_m": 7300, "descent_m": 8400},
     "publisher": "published guides", "source": "https://www.alpineexploratory.com/walking-guides/alta-via-1.html",
     "note": "Alpine Exploratory says 6,665 m ascent; other guides 7,300 up and 8,400 down. OSM relation runs Belluno to Braies."},
    {"id": 7337, "name": "Eiger Trail (Eigergletscher to Alpiglen)", "cc": "CH", "core": False,
     "official": {"distance_km": 6.0, "ascent_m": 140, "descent_m": 800},
     "publisher": "published guide (official Jungfrau page did not render)",
     "source": "https://www.earthtrekkers.com/eiger-trail-hike-bernese-oberland-switzerland/",
     "note": "Descent is the figure that matters on this one; the ascent is small enough that 50 m is a third."},
    {"id": 204468, "name": "Rheinsteig", "cc": "DE", "core": False,
     "official": {"distance_km": 320, "ascent_m": 9500, "descent_m": None},
     "publisher": "published (Wikipedia; others say over 9,000 or over 10,000)",
     "source": "https://en.wikipedia.org/wiki/Rheinsteig",
     "note": "rheinsteig.de states no total. Lab relation is 314 km."},
    {"id": 185703, "name": "West Highland Way", "cc": "GB", "core": False,
     "official": {"distance_km": 154, "ascent_m": 3946, "descent_m": None},
     "publisher": "published, sources disagree (3,155 Wikipedia; 4,020; 4,735 official site per forum; 4,800 Cicerone)",
     "source": "https://www.cicerone.co.uk/west-highland-way-complete-planning-guide",
     "note": "The midpoint of the published spread is used; our figure sits inside the spread whichever is right."},
]


def run_method(rows, tiles, params):
    saved = {k: getattr(E, k) for k in params}
    for k, v in params.items():
        setattr(E, k, v)
    try:
        out = {}
        for row in rows:
            rec = E.process_trip(row, tiles)
            rep = rec["report"]
            out[row[0]] = {"status": rec["status"], "distance_m": rep.get("distance_m"),
                           "ascent_m": rep.get("ascent_m"), "descent_m": rep.get("descent_m")}
        return out
    finally:
        for k, v in saved.items():
            setattr(E, k, v)


def compare(route, computed):
    """(ratio, within) of the computed ascent against the published one,
    honouring the direction flag."""
    off = route["official"]
    asc_ref = off.get("ascent_m")
    if computed is None or computed.get("status") != "ok" or not asc_ref:
        return None, None
    ours = computed["descent_m"] if route.get("reversed") else computed["ascent_m"]
    if ours is None:
        return None, None
    ratio = ours / asc_ref
    return round(ratio, 3), abs(ratio - 1.0) <= TOLERANCE


def outliers(conn):
    """Published routes over 250 m/km, each with the sustained-climb test."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT t.id, t.country, t.title, t.distance_m, t.ascent_m, t.descent_m,
                   (t.elevation->>'ele_min_m')::float, (t.elevation->>'ele_max_m')::float,
                   (t.elevation->>'max_grade_pct')::float, (t.elevation->>'nodata_frac')::float,
                   t.sac_scale, t.grade, t.grade_src, t.highlight_kinds, t.tier, t.quality_score
            FROM trips t
            WHERE t.status = 'published' AND t.distance_m > 2000
              AND t.ascent_m::float / t.distance_m * 1000 > 250
            ORDER BY t.ascent_m::float / t.distance_m DESC""")
        out = []
        for (tid, cc, title, dist, asc, desc, emin, emax, maxg, nodata,
             sac, grade, gsrc, kinds, tier, q) in cur.fetchall():
            net = (emax - emin) if emin is not None and emax is not None else None
            inflation = round(asc / net, 2) if net else None
            # One sustained climb sums to about its net height; noise does not.
            verdict = ("genuine" if inflation is not None and inflation <= 1.15
                       else "suspect")
            out.append({"id": tid, "country": cc, "name": title,
                        "distance_m": dist, "ascent_m": asc, "descent_m": desc,
                        "m_per_km": round(asc / dist * 1000),
                        "ele_min_m": emin, "ele_max_m": emax, "net_m": round(net) if net else None,
                        "ascent_over_net": inflation, "max_grade_pct": maxg,
                        "nodata_frac": nodata, "sac_scale": sac, "grade": grade,
                        "grade_src": gsrc, "highlights": kinds, "tier": tier,
                        "quality_score": float(q) if q is not None else None,
                        "verdict": verdict})
    return out


# A wider grid, run only with --sweep, to see whether ANY recipe clears the
# bar the two named ones tie on. Information for the report; the winner is
# still applied by hand, because a new recipe means re-sampling every
# curated route and re-ranking the rating.
SWEEP = {
    f"step{s:g}_win{w}_gate{g:g}": {"SAMPLE_STEP_M": float(s), "SMOOTH_WINDOW": w,
                                     "CLIMB_THRESHOLD_M": float(g)}
    for s in (20.0, 30.0) for w in (3, 5, 7) for g in (5.0, 8.0, 12.0)
}


def sweep(rows, tiles, routes):
    core = [r for r in routes if r["core"]]
    out = {}
    for name, params in SWEEP.items():
        res = run_method(rows, tiles, params)
        ratios, within = [], 0
        for r in core:
            ratio, ok = compare(r, res.get(r["id"]))
            if ratio is not None:
                ratios.append(ratio)
                within += bool(ok)
        out[name] = {"within_15pct": within, "core_routes": len(core),
                     "median_ratio": round(statistics.median(ratios), 3) if ratios else None,
                     "mean_ratio": round(statistics.mean(ratios), 3) if ratios else None,
                     "ratios": {r["id"]: compare(r, res.get(r["id"]))[0] for r in core}}
        print(f"  {name:<24} within {within}/{len(core)}  median {out[name]['median_ratio']}  "
              f"mean {out[name]['mean_ratio']}")
    return out


def main():
    sys.stdout.reconfigure(errors="replace")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--outliers-only", action="store_true")
    ap.add_argument("--sweep", action="store_true",
                    help="also run the wider parameter grid (information only)")
    ap.add_argument("--evict-gb", type=float, default=0)
    args = ap.parse_args()

    conn = connect()
    report = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
              "accessed": ACCESSED, "tolerance": TOLERANCE, "methods": METHODS}

    if not args.outliers_only:
        ids = [r["id"] for r in ROUTES]
        with conn.cursor() as cur:
            cur.execute(E.FETCH_SQL, (ids,))
            rows = {r[0]: r for r in cur.fetchall()}
            cur.execute("SELECT id, distance_m, ascent_m, descent_m FROM trips WHERE id = ANY(%s)", (ids,))
            stored = {r[0]: {"distance_m": r[1], "ascent_m": r[2], "descent_m": r[3]}
                      for r in cur.fetchall()}
        conn.commit()
        tiles = E.DemTiles(evict_gb=args.evict_gb or None)
        results = {}
        for name, params in METHODS.items():
            t0 = time.time()
            results[name] = run_method([rows[i] for i in ids if i in rows], tiles, params)
            print(f"{name}: {len(results[name])} routes in {time.time() - t0:.0f}s")

        table = []
        for route in ROUTES:
            entry = dict(route)
            entry["stored"] = stored.get(route["id"])
            for name in METHODS:
                comp = results[name].get(route["id"])
                ratio, within = compare(route, comp)
                entry[name] = {**(comp or {}), "ratio": ratio, "within": within}
            table.append(entry)
        report["routes"] = table

        summary = {}
        core = [e for e in table if e["core"]]
        for name in METHODS:
            ratios = [e[name]["ratio"] for e in core if e[name]["ratio"] is not None]
            summary[name] = {
                "core_routes": len(core),
                "within_15pct": sum(1 for e in core if e[name]["within"]),
                "median_ratio": round(statistics.median(ratios), 3) if ratios else None,
                "mean_ratio": round(statistics.mean(ratios), 3) if ratios else None,
                "supplementary_within": sum(1 for e in table if not e["core"] and e[name]["within"]),
            }
        a, b = summary["A_current"], summary["B_spec"]
        if b["within_15pct"] > a["within_15pct"]:
            summary["verdict"] = "B_spec wins: more core routes within 15 percent"
        elif a["within_15pct"] > b["within_15pct"]:
            summary["verdict"] = "A_current wins: more core routes within 15 percent; elevation.py unchanged"
        else:
            summary["verdict"] = ("tie on the count; the median ratio decides: "
                                  + ("A_current" if abs(a["median_ratio"] - 1) <= abs(b["median_ratio"] - 1)
                                     else "B_spec"))
        summary["systematically_high"] = {
            name: (summary[name]["median_ratio"] or 0) > 1 + TOLERANCE for name in METHODS}
        report["summary"] = summary
        if args.sweep:
            print("\nsweep (core routes):")
            report["sweep"] = sweep([rows[i] for i in ids if i in rows], tiles, ROUTES)

        print("\n{:<52} {:>4} {:>8} {:>8} {:>8} {:>6} {:>8} {:>6}".format(
            "route", "cc", "official", "stored", "A", "rA", "B", "rB"))
        for e in table:
            off = e["official"]["ascent_m"]
            key = "descent_m" if e.get("reversed") else "ascent_m"
            st = (e["stored"] or {}).get(key)
            A, B = e["A_current"], e["B_spec"]
            mark = "" if e["core"] else "  (supplementary)"
            print("{:<52} {:>4} {:>8} {:>8} {:>8} {:>6} {:>8} {:>6}{}".format(
                e["name"][:52], e["cc"], off, st if st is not None else "-",
                A.get(key) if A.get(key) is not None else "-", A["ratio"] if A["ratio"] is not None else "-",
                B.get(key) if B.get(key) is not None else "-", B["ratio"] if B["ratio"] is not None else "-", mark))
        for name in METHODS:
            s = summary[name]
            print(f"{name}: {s['within_15pct']} of {s['core_routes']} core routes within 15%, "
                  f"median ratio {s['median_ratio']}, mean {s['mean_ratio']}")
        print("verdict:", summary["verdict"])

    report["outliers"] = outliers(conn)
    conn.close()
    n_susp = sum(1 for o in report["outliers"] if o["verdict"] == "suspect")
    print(f"\noutliers over 250 m/km: {len(report['outliers'])}, suspect: {n_susp}")
    for o in report["outliers"]:
        print(f"  {o['m_per_km']:4d} m/km  ascent {o['ascent_m']:5d}  net {o['net_m']:5d}  "
              f"x{o['ascent_over_net']:.2f}  {o['verdict']:8}  {o['country']} {o['name'][:48]}")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n",
                      encoding="utf-8")
    print(f"report: {REPORT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
