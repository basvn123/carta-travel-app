"""Data repair pass for app_data.json - addresses the fact-check findings.

Run once on the real dataset:  python fix_data.py
A backup (app_data.backup.json) was taken before the first run.

Fixes:
  A. Flight calendar densification + de-staling. The Ryanair harvest stored only
     ~4 monthly-cheapest dates per route, so arbitrary-date trips could not be
     priced. We build a daily fare for every day from `today` to the window end by
     linearly interpolating between the real monthly-cheapest anchors (anchor days
     keep their exact API price; a mild weekend uplift is added to filled days).
     Past dates are dropped. Each touched route is tagged `fare_model` and a
     meta.flight_model note records the method. The real anchors are preserved.
  B. Cost correction for the PLI-estimated countries that were off. Austria,
     Croatia and Czechia were estimated (Numbeo IP-ban mid-harvest); spot-checks
     showed Czechia especially too high. We replace the dining/drink items with
     live Numbeo anchors (Vienna / Split / Prague, June 2026), preserving the
     existing grocery + club figures, and relabel them `numbeo_direct`.
  C. Country-name unification: "Czech Republic" -> "Czechia".
  D. De-duplicate the one true accidental duplicate (Eze gem x2) and any unpriced,
     non-anchor airport that exactly duplicates a gem city (Rotterdam/Mostar).
  E. Honest reachability flag: `no_ryanair_route=True` only for destinations with
     neither a flight nor a drivable (road_connected, within max_drive_km) option.
"""

import json
import math
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "app_data" / "app_data.json"
TODAY = date(2026, 6, 7)  # environment "today"

# --- Live Numbeo anchors (EUR, June 2026) for the previously-estimated countries.
#     Only the dining/drink items we verified; grocery + club are preserved. ---
COST_FIX = {
    # country: (meal_mid_pp, meal_cheap, fastfood/McMeal, beer_0.5L, coffee)
    "Austria": (37.50, 18.00, 12.00, 5.50, 4.68),   # Vienna
    "Croatia": (33.10, 15.00, 10.00, 4.25, 2.45),   # Split
    "Czechia": (24.20,  9.68,  8.88, 2.62, 3.28),   # Prague
}
COUNTRY_RENAME = {"Czech Republic": "Czechia"}


def haversine_km(a, b, c, d):
    R = 6371
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(x))


def densify(anchor_map, start, end):
    """Daily prices from start..end, linearly interpolated between anchors."""
    anchor_dates = {date.fromisoformat(k): v for k, v in anchor_map.items()}
    pts = sorted(anchor_dates.items())
    if not pts:
        return {}
    out = {}
    cur = start
    one = timedelta(days=1)
    while cur <= end:
        if cur <= pts[0][0]:
            price = pts[0][1]
        elif cur >= pts[-1][0]:
            price = pts[-1][1]
        else:
            price = pts[-1][1]
            for i in range(len(pts) - 1):
                (da, pa), (db, pb) = pts[i], pts[i + 1]
                if da <= cur <= db:
                    frac = (cur - da).days / max(1, (db - da).days)
                    price = pa + (pb - pa) * frac
                    break
        if cur not in anchor_dates and cur.weekday() in (4, 5, 6):
            price *= 1.05  # Ryanair weekend uplift on filled days
        out[cur.isoformat()] = round(price, 2)
        cur += one
    # Anchors that fall inside the emitted window keep their exact API price.
    for d, p in anchor_dates.items():
        if start <= d <= end:
            out[d.isoformat()] = p
    return out


def main():
    data = json.loads(TARGET.read_text(encoding="utf-8"))
    meta, ds = data["meta"], data["destinations"]
    end = date.fromisoformat(meta["end_date"])
    home = meta["home"]
    cm = meta.get("car_model", {})
    max_km = cm.get("max_drive_km", 3500)
    detour = cm.get("road_detour_factor", 1.3)

    # ---- A. Densify flight calendars + drop past dates ----
    # GUARD: this interpolation path is SUPERSEDED by reharvest_flights.py, which
    # writes REAL per-day Ryanair fares (fare_model="ryanair_cheapestPerDay_live").
    # Re-running densify over that real data would treat each true daily price as an
    # "anchor" and smear a synthetic monthly-cheapest interpolation (with a +5%
    # weekend uplift) back across it - silently degrading real fares to fabricated
    # ones. Detect live fares and skip step A entirely so this script can never
    # clobber a reharvest. (B/C/D/E below are still safe to apply.)
    live_fares = (
        meta.get("flight_model", {}).get("anchor_source") == "ryanair_api_cheapest_per_day"
        or any(
            r.get("fare_model") == "ryanair_cheapestPerDay_live"
            for v in ds.values() for r in (v.get("routes") or {}).values()
        )
    )
    touched_routes = 0
    if live_fares:
        print("  A. SKIPPED - dataset already carries real per-day Ryanair fares; "
              "not re-interpolating (use reharvest_flights.py to refresh fares).")
    else:
        for v in ds.values():
            for r in (v.get("routes") or {}).values():
                changed = False
                for kind in ("outbound_fare", "return_fare"):
                    fares = r.get(kind) or {}
                    if not fares:
                        continue
                    r[kind] = densify(fares, TODAY, end)
                    changed = True
                if changed:
                    r["fare_model"] = "interpolated_monthly_cheapest"
                    touched_routes += 1

    # ---- B + C. Cost correction + country rename ----
    cost_fixed = 0
    renamed = 0
    for v in ds.values():
        if v["country"] in COUNTRY_RENAME:
            v["country"] = COUNTRY_RENAME[v["country"]]
            renamed += 1
        c = v.get("costs")
        if not c:
            continue
        if v["country"] in COST_FIX and c.get("price_source") == "pli_scaled":
            mid, cheap, ff, beer, coffee = COST_FIX[v["country"]]
            c.update({
                "meal_mid_eur": mid, "meal_cheap_eur": cheap, "fastfood_eur": ff,
                "drink_out_eur": beer, "coffee_eur": coffee,
                "cocktail_eur": round(beer * 2.4, 2),  # schema's estimate method
                # grocery_day_eur + club_entry_eur preserved as-is
                "price_source": "numbeo_direct",
            })
            cost_fixed += 1

    # ---- D. De-duplicate same (city, country) entries ----
    def has_fares(x):
        return any((r.get("outbound_fare") or r.get("return_fare"))
                   for r in (x.get("routes") or {}).values())

    # Group duplicates.
    groups = {}
    for did, v in ds.items():
        groups.setdefault((v["city"], v["country"]), []).append(did)

    drop_ids = []
    for key, ids in groups.items():
        if len(ids) < 2:
            continue
        # Keep the best: prefer a priceable entry; if none has fares prefer the gem
        # (the actual destination, with categories/blurb) over a bare airport; then
        # the one with more categories.
        def pref(did):
            x = ds[did]
            return (1 if has_fares(x) else 0,
                    1 if x["tier"] == "gem" else 0,
                    len(x.get("categories") or []))
        keeper = max(ids, key=pref)
        for did in ids:
            if did == keeper:
                continue
            x = ds[did]
            # Don't drop a *priceable* airport that a gem in ANOTHER city anchors to
            # (would orphan a working "via" route). Unpriced airports carry no fares,
            # so they are safe to drop - any dangling "via" reference is nulled below.
            if x["tier"] == "airport" and has_fares(x) and any(
                g.get("anchor_airport") == x.get("iata") and g["id"] not in ids
                for g in ds.values()):
                continue
            drop_ids.append(did)

    dropped_iatas = {ds[i].get("iata") for i in drop_ids if ds[i]["tier"] == "airport"}
    for did in drop_ids:
        ds.pop(did, None)
    # Null any dangling "via <dropped airport>" reference.
    for v in ds.values():
        if v.get("anchor_airport") in dropped_iatas:
            v["anchor_airport"] = None

    # ---- E. Honest reachability flag ----
    relabelled = 0
    for v in ds.values():
        has_fares = any((r.get("outbound_fare") or r.get("return_fare"))
                        for r in (v.get("routes") or {}).values())
        lt = v.get("local_transport") or {}
        drivable = False
        if lt.get("road_connected") and v.get("lat") is not None:
            road = haversine_km(home["lat"], home["lon"], v["lat"], v["lon"]) * detour
            drivable = road <= max_km
        unreachable = (not has_fares) and (not drivable)
        new_flag = unreachable
        if v.get("no_ryanair_route") != new_flag:
            v["no_ryanair_route"] = new_flag
            relabelled += 1

    # ---- meta bookkeeping ----
    # Never downgrade the schema version (later layers - beauty=9, images=10 - may
    # already have run); only ever raise the floor.
    meta["schema_version"] = max(meta.get("schema_version", 0), 8)
    # Only rewrite the flight-model note + de-stale the start date when we actually
    # densified; otherwise leave the live-fare metadata (set by reharvest) intact.
    if not live_fares:
        meta["flight_model"] = {
            "method": "daily fares interpolated between real monthly-cheapest Ryanair "
                      "anchors; anchor days keep the exact API price; +5% weekend uplift "
                      "on filled days; past dates dropped.",
            "anchor_source": "ryanair_api_monthly_cheapest",
            "densified_from": TODAY.isoformat(),
        }
        meta["start_date"] = TODAY.isoformat()
    val = meta.get("cost_validation", {})
    val["corrected_from_live_numbeo"] = ["Austria (Vienna)", "Croatia (Split)",
                                         "Czechia (Prague)"]
    meta["cost_validation"] = val
    meta["n_destinations"] = len(ds)

    TARGET.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print("Data repair complete:")
    print(f"  A. densified {touched_routes} flight routes (daily, from {TODAY})")
    print(f"  B. corrected costs for {cost_fixed} destinations (AT/HR/CZ)")
    print(f"  C. renamed {renamed} 'Czech Republic' -> 'Czechia'")
    print(f"  D. dropped {len(drop_ids)} duplicate destinations: {drop_ids}")
    print(f"  E. re-labelled no_ryanair_route on {relabelled} destinations")
    print(f"  -> {len(ds)} destinations total")


if __name__ == "__main__":
    main()
