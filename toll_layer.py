"""Per-country toll & vignette engine - replaces the flat 2.2 EUR/100 km guess.

Europe charges cars three different ways, and the differences are huge:

  distance   France ~8.5-11 EUR/100 motorway km (peage), Italy ~7, Portugal ~7.5,
             Greece/Croatia ~6 - while Spain has scrapped most AP tolls and
             Germany/Benelux/Scandinavia charge nothing per km.
  vignette   Austria/Switzerland/Slovenia/Czechia/Slovakia/Hungary sell a
             time-based sticker (10-40 EUR) that covers the whole trip.
  crossings  a few fixed chokepoints dominate specific routes: the Brenner
             pass into Italy, the Austrian Tauern route to the Balkans, and
             the Storebaelt + Oresund bridges to Copenhagen/Sweden.

The old model billed every road km at a flat 2.2 EUR/100 km, which overprices
a Munich run (free autobahn) and underprices Barcelona (900+ French peage km).

How this layer works, per destination:
  1. Sample the great-circle line home -> destination every ~15 km.
  2. Classify each sample point by country (Natural Earth 50m polygons,
     cache/ne_50m_admin0.geojson, shapely STRtree). Sea points count nothing.
  3. Scale each country's share by the road detour factor (1.3), then price:
     distance-country km at its effective rate x2 (round trip), vignette
     countries once per trip, plus any fixed crossings the corridor triggers.

"Effective" per-100km rates are calibrated against real 2026 route totals
(e.g. Paris-Marseille ~62 EUR/775 km, Lisbon-Porto ~22 EUR/295 km, Zagreb-
Split ~24 EUR/380 km) and deliberately sit slightly under the pure motorway
rate, since real routes always include free stretches. Sources: tolls.eu,
autovig.eu, tollguru.com, asfinag.at (July 2026).

The result is stored on each destination as `driving_toll` (round trip, PER
CAR) and consumed by runtime_pricing.drivingEstimate(); the flat rate stays
in meta.car_model as the fallback for anything unmapped.
"""

import json
import math
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent
NE_GEOJSON = ROOT / "cache" / "ne_50m_admin0.geojson"

SAMPLE_KM = 15.0          # great-circle sampling step
ROAD_DETOUR = 1.3         # same factor the runtime uses for road km

# Effective toll EUR per 100 ROAD km for distance-tolled countries (car).
DISTANCE_RATES = {
    "FR": 8.0,   # peage 8.5-11/100 on autoroutes; some free N-roads mixed in
    "IT": 6.5,   # Milan-Rome ~45 EUR / 575 km
    "PT": 7.0,   # Lisbon-Porto ~22 EUR / 295 km
    "ES": 1.5,   # most AP tolls abolished 2018-2021; coastal remnants
    "GR": 5.5,   # Athens-Thessaloniki ~30 EUR / 500 km
    "HR": 6.0,   # Zagreb-Split ~24 EUR / 380 km
    "PL": 1.5,   # only parts of A1/A2/A4 tolled for cars
    "RS": 5.0,   # Belgrade corridor tolls
    "MK": 3.0,
    "BA": 2.0,
    "ME": 2.0,
    "AL": 0.5,
    "TR": 1.5,
    "NO": 3.0,   # bomringer everywhere, AutoPASS
    "IE": 1.0,   # barrier tolls, M50 eFlow
    "GB": 0.3,   # M6 Toll / Dartford only
}

# Vignette countries: one purchase covers the whole (<= ~10 day) round trip.
VIGNETTES = {
    "AT": (12.80, "Austria 10-day vignette"),
    "CH": (43.00, "Switzerland annual vignette (only option)"),
    "SI": (16.00, "Slovenia 7-day e-vignette"),
    "CZ": (12.70, "Czechia 10-day e-vignette"),
    "SK": (12.00, "Slovakia 10-day e-vignette"),
    "HU": (17.00, "Hungary 10-day e-vignette"),
    "RO": (6.00, "Romania 10-day rovinieta"),
    "BG": (8.00, "Bulgaria weekly e-vignette"),
}

# Fixed crossings, round-trip EUR per car, triggered by the corridor.
BRENNER_RT = 23.00        # A13 Brenner special toll, 11.50 each way
TAUERN_RT = 29.00         # A10 Tauern + Katschberg, ~14.50 each way
STOREBAELT_RT = 74.00     # Great Belt bridge, ~37 each way
ORESUND_RT = 100.00       # Oresund bridge, ~50-61 each way

TOLL_MODEL = {
    "version": "toll_v1",
    "method": ("great-circle corridor sampled every ~15 km, classified by "
               "Natural Earth 50m country polygons, km x road_detour_factor; "
               "distance countries priced per-km round trip, vignette "
               "countries once per trip, plus fixed alpine/bridge crossings"),
    "distance_rates_eur_per_100km": DISTANCE_RATES,
    "vignettes_eur": {k: v[0] for k, v in VIGNETTES.items()},
    "crossings_eur_rt": {
        "brenner": BRENNER_RT, "tauern": TAUERN_RT,
        "storebaelt": STOREBAELT_RT, "oresund": ORESUND_RT,
    },
    "sources": ["tolls.eu", "autovig.eu", "tollguru.com", "asfinag.at (2026)"],
}


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


class CountryIndex:
    """Point -> ISO2 via Natural Earth polygons (Europe + neighbours only)."""

    def __init__(self):
        gj = json.loads(NE_GEOJSON.read_text(encoding="utf-8"))
        geoms, isos = [], []
        for f in gj["features"]:
            props = f["properties"]
            iso = props.get("ISO_A2_EH") or props.get("ISO_A2")
            if not iso or iso == "-99":
                continue
            # Europe-ish bounding box keeps the tree small and fast.
            g = shape(f["geometry"])
            minx, miny, maxx, maxy = g.bounds
            if maxx < -35 or minx > 55 or maxy < 27 or miny > 75:
                continue
            geoms.append(g)
            isos.append(iso)
        self._tree = STRtree(geoms)
        self._geoms = geoms
        self._isos = isos

    def iso2(self, lat, lon):
        pt = Point(lon, lat)
        for i in self._tree.query(pt):
            if self._geoms[int(i)].covers(pt):
                return self._isos[int(i)]
        return None


def corridor_countries(index, home, dest_lat, dest_lon):
    """km of great-circle line per ISO2 (unordered dict + ordered sequence)."""
    lat1, lon1 = home
    total = _haversine_km(lat1, lon1, dest_lat, dest_lon)
    n = max(2, int(total / SAMPLE_KM) + 1)
    km_per = {}
    seq = []
    step = total / (n - 1) if n > 1 else total
    for i in range(n):
        t = i / (n - 1)
        # Linear interpolation is fine at intra-Europe distances.
        lat = lat1 + (dest_lat - lat1) * t
        lon = lon1 + (dest_lon - lon1) * t
        iso = index.iso2(lat, lon)
        if iso:
            km_per[iso] = km_per.get(iso, 0.0) + step
            if not seq or seq[-1] != iso:
                seq.append(iso)
    return km_per, seq


def price_corridor(km_per, seq, dest_iso2):
    """-> driving_toll block (round trip, per car)."""
    toll_rt = 0.0
    countries = {}
    for iso, km in km_per.items():
        road_km = km * ROAD_DETOUR
        countries[iso] = round(road_km)
        rate = DISTANCE_RATES.get(iso)
        if rate:
            toll_rt += 2 * road_km * rate / 100.0

    vignettes, vignette_eur = [], 0.0
    for iso in km_per:
        if iso in VIGNETTES:
            eur, label = VIGNETTES[iso]
            vignette_eur += eur
            vignettes.append(label)

    crossings, crossing_eur = [], 0.0
    seq_set = set(seq)
    # Brenner: Austria -> Italy (and everything beyond Italy on that axis).
    if "AT" in seq_set and "IT" in seq_set:
        crossing_eur += BRENNER_RT
        crossings.append("Brenner pass (A13)")
    # Tauern: Austria on the way to the western Balkans.
    elif "AT" in seq_set and seq_set & {"SI", "HR", "BA", "RS", "ME", "MK", "GR"}:
        crossing_eur += TAUERN_RT
        crossings.append("Tauern route (A10)")
    # Danish bridges: Zealand destinations, and everything via Denmark to
    # Sweden/Norway/Finland.
    beyond_dk = dest_iso2 in ("SE", "NO", "FI") and "DK" in seq_set
    zealand = dest_iso2 == "DK" and countries.get("DK", 0) > 0 and _dest_on_zealand(km_per, seq)
    if beyond_dk or zealand:
        crossing_eur += STOREBAELT_RT
        crossings.append("Storebaelt bridge")
    if beyond_dk:
        crossing_eur += ORESUND_RT
        crossings.append("Oresund bridge")

    return {
        "toll_rt_eur": round(toll_rt, 2),
        "vignettes_eur": round(vignette_eur, 2),
        "crossings_eur": round(crossing_eur, 2),
        "total_rt_eur": round(toll_rt + vignette_eur + crossing_eur, 2),
        "countries": countries,
        "vignettes": vignettes,
        "crossings": crossings,
        "source": TOLL_MODEL["version"],
    }


def _dest_on_zealand(km_per, seq):
    # Heuristic: driving from the continent into Denmark and NOT stopping in
    # Jutland means crossing the Great Belt. Copenhagen sits at ~12.5E; the
    # bridge at ~11.0E. Caller only invokes this for Danish destinations.
    return True  # refined by the caller via dest longitude


def compute_driving_toll(index, home, dest):
    lat = dest.get("city_lat", dest.get("lat"))
    lon = dest.get("city_lon", dest.get("lon"))
    if lat is None or lon is None:
        return None
    if (dest.get("local_transport") or {}).get("road_connected") is False:
        return None
    km_per, seq = corridor_countries(index, home, lat, lon)
    block = price_corridor(km_per, seq, dest.get("iso2"))
    # Zealand refinement: only Danish destinations EAST of the Great Belt
    # (~11.0 E) pay Storebaelt.
    if dest.get("iso2") == "DK" and lon is not None and lon < 10.9:
        if "Storebaelt bridge" in block["crossings"]:
            block["crossings"].remove("Storebaelt bridge")
            block["crossings_eur"] = round(block["crossings_eur"] - STOREBAELT_RT, 2)
            block["total_rt_eur"] = round(block["total_rt_eur"] - STOREBAELT_RT, 2)
    return block
