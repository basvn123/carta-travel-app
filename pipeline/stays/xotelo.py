"""Xotelo client (https://xotelo.com): free, TripAdvisor-based hotel prices.

Endpoints used (no key needed):
  /api/list     properties of a TripAdvisor location (geo id), 100 per page, a
                cap of 3,000 per sort order; type, geo, rating, price range
  /api/rates    dated per-OTA prices for one property (Booking.com, Agoda,
                Trip.com, Vio, ...) for given adults/rooms
  /api/heatmap  cheap / average / high days for the year ahead

/api/search (name -> geo id) needs a RapidAPI key, so town geo ids come from the
property URLs that /api/list returns for a whole country (geo_xotelo.py).

Politeness: one request at a time, >= MIN_GAP seconds apart, backoff on 429 and
5xx, a user agent that says who we are. Xotelo is run by one developer for free.
"""

import random
import re
import time

import httpx

from common import USER_AGENT

BASE = "https://data.xotelo.com/api"
MIN_GAP = 1.2

# TripAdvisor country geo ids. geo_xotelo.py --verify checks each against the
# country name in the returned property URLs before a run trusts it.
COUNTRY_GEO = {
    "IT": "g187768", "FR": "g187070", "GB": "g186216", "ES": "g187427",
    "DE": "g187275", "GR": "g189398", "NL": "g188553", "PT": "g189100",
    "SE": "g189806", "PL": "g274723", "CZ": "g274684", "DK": "g189512",
    "RO": "g294457", "HR": "g294453", "BG": "g294451", "NO": "g190455",
    "HU": "g274881", "AT": "g190410", "CH": "g188045", "BE": "g188634",
    "IE": "g186591", "SI": "g274862", "SK": "g274922", "FI": "g189896",
    "RS": "g294471", "IS": "g189952", "AL": "g294445", "CY": "g190372",
    "EE": "g274952", "BA": "g294449", "MK": "g295109", "LT": "g274947",
    "MT": "g190311", "MD": "g294455", "LU": "g190340", "AD": "g190391",
    "LI": "g190357", "MC": "g190405",
    # Latvia's country id is unknown; its regions cover the 23 destinations.
    "LV": ["g274960", "g274964", "g274965", "g274961"],
    # No verified id yet (T530): Montenegro, Faroe Islands, San Marino, Kosovo.
    # Their 39 destinations are priced by the Booking scrape or modelled.
}

# TripAdvisor property types -> our kinds.
KIND = {
    "Hotel": "hotel", "Small Hotel": "hotel", "Boutique Hotel": "hotel",
    "Specialty Hotel": "hotel", "Resort": "hotel", "Motel": "hotel",
    "Limited Service Property": "hotel", "Hostel": "hostel",
    "Bed and Breakfast": "guesthouse", "Specialty B&B": "guesthouse",
    "Pension (B&B)": "guesthouse", "Guest house": "guesthouse",
    "Inn": "guesthouse", "Specialty Inn": "guesthouse", "Lodge": "guesthouse",
    "Farmhouse": "guesthouse", "Condominium": "apartment", "Villa": "apartment",
    "Apartment": "apartment", "Cottage": "apartment",
}

URL_GEO = re.compile(r"Hotel_Review-(g\d+)-(d\d+)-Reviews-[^-]+-([^.]+)\.html")


class Blocked(Exception):
    pass


class Client:
    def __init__(self, min_gap=MIN_GAP):
        self.min_gap = min_gap
        self._last = 0.0
        self.calls = 0
        self.http = httpx.Client(headers={"User-Agent": USER_AGENT},
                                 timeout=40, follow_redirects=True)

    def _get(self, path, params):
        for attempt in range(5):
            wait = self.min_gap - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait + random.uniform(0, 0.4))
            self._last = time.monotonic()
            self.calls += 1
            try:
                r = self.http.get(f"{BASE}/{path}", params=params)
            except httpx.HTTPError:
                time.sleep(5 * (attempt + 1))
                continue
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(20 * (attempt + 1))
                continue
            if r.status_code in (401, 403):
                raise Blocked(f"{path} {r.status_code}")
            body = r.json()
            err = body.get("error")
            if err:
                return None
            return body.get("result")
        raise Blocked(f"{path}: gave up after retries")

    def list(self, geo, offset=0, limit=100, sort="popularity"):
        return self._get("list", {"location_key": geo, "offset": offset,
                                  "limit": limit, "sort": sort})

    def rates(self, hotel_key, chk_in, chk_out, adults=2, rooms=1):
        return self._get("rates", {"hotel_key": hotel_key, "chk_in": chk_in,
                                   "chk_out": chk_out, "adults": adults,
                                   "rooms": rooms, "currency": "EUR"})

    def heatmap(self, hotel_key, chk_out):
        return self._get("heatmap", {"hotel_key": hotel_key, "chk_out": chk_out})


def parse_property(p):
    """One /list entry -> dict with the town geo id taken from its URL."""
    m = URL_GEO.search(p.get("url") or "")
    geo = (p.get("geo") or {})
    pr = p.get("price_ranges") or {}
    return {
        "key": p.get("key"),
        "name": p.get("name"),
        "town_geo": m.group(1) if m else None,
        "town_slug": m.group(3) if m else None,
        "type": p.get("accommodation_type"),
        "kind": KIND.get(p.get("accommodation_type"), "other"),
        "lat": geo.get("latitude"), "lon": geo.get("longitude"),
        "rating": (p.get("review_summary") or {}).get("rating"),
        "reviews": (p.get("review_summary") or {}).get("count"),
        "pmin": pr.get("minimum"), "pmax": pr.get("maximum"),
    }


def rate_median(result):
    """Median of the OTA rates for one dated query; None when nothing is sold."""
    rates = [r.get("rate") for r in (result or {}).get("rates") or []
             if isinstance(r.get("rate"), (int, float)) and r.get("rate") > 0]
    if not rates:
        return None, None
    rates.sort()
    mid = rates[len(rates) // 2] if len(rates) % 2 else \
        (rates[len(rates) // 2 - 1] + rates[len(rates) // 2]) / 2
    codes = [r.get("code") for r in result["rates"]]
    return float(mid), ",".join(c for c in codes if c)
