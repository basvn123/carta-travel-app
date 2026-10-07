#!/usr/bin/env python3
"""Validate the unified Carta dataset.

    python3 pipeline/validate.py [--data data/trips.master.json] [--report reports/validation-report.md]
                                 [--wire continent-app/public/journeys] [--check-urls]

Exit code 0 when there are no ERRORs (warnings are allowed), 1 otherwise.

Two layers are checked. The master dataset (data/trips.master.json) carries
the schema contract and the mechanical content checks from the trips
enhancement spec, section K5: the budget breakdown sums to the stated total,
perDayEur is total over days, every place the itinerary names geocodes inside
the trip's country, the accommodation strategy is slept in, surface
percentages add to 100, and no "€x, €y" comma range survives. The trip's
own coordinate is checked against its stated country too (T090, spec J1): a
capital-city fallback pin is an error, and with cities500 a pin whose nearest
town lies in another country is an error. The shipped
wire (continent-app/public/journeys, built by pipeline/journeys/build_wire.py)
is the only place a hero photograph exists, so the hero checks read it: every
journey has a hero, it is at least HERO_MIN_W wide, and, with --check-urls,
the URL still resolves. The comma-range check runs on the wire too, because
the wire builder is where the range character gets stripped.
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import accuracy as A  # noqa: E402
import common as C  # noqa: E402
import generation_gate as GG  # noqa: E402
import geocode as G  # noqa: E402

try:
    import geonamescache
except ImportError:  # pragma: no cover
    geonamescache = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Trips/carta-unified/carta-unified -> the repository root, where the app lives.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(ROOT)))
DEFAULT_WIRE = os.path.join(REPO_ROOT, "continent-app", "public", "journeys")

REQUIRED_TOP = ["id", "title", "country", "countryCode", "region", "tripType",
                "tripTypeId", "durationDays", "budgetTier", "budget", "itinerary",
                "accommodationStrategy", "logistics", "proTips", "provenance"]

VALID_TIERS = {"€", "€€", "€€€"}
ID_RE = re.compile(r"^[a-z]{2}-[a-z-]+-[a-z0-9-]+$")
# lat_min, lat_max, lon_min, lon_max; the south edge takes in Madeira (32.6 N)
# and the Canaries (27.6 N), which are Portugal and Spain
EUROPE_BBOX = G.EUROPE_BBOX
PLACEHOLDER_RE = re.compile(r"\bTBD\b|\bTODO\b|\bXXX\b|\{\{|\bLorem ipsum\b", re.I)

# K5 mechanical checks. The tolerances are for rounding only: a breakdown whose
# parts were written in tens can miss the total by a euro or two, and a surface
# split written as "roughly 70%, 25%, 5%" can miss 100 by a point.
SUM_TOLERANCE = 0.01          # breakdown vs totalEur, as a share of the total
PER_DAY_TOLERANCE = 1         # euros, perDayEur vs totalEur / durationDays
SURFACE_TOLERANCE = 2         # percentage points
HERO_MIN_W = 1600             # pixels on the long edge (spec B3)
URL_TIMEOUT = 20              # seconds per HEAD request
URL_WORKERS = 2               # upload.wikimedia.org rate-limits a burst
URL_PACE = 0.3                # seconds between requests per worker
URL_RETRIES = 2
URL_BACKOFF = 5               # seconds, when no Retry-After is given
UA = "CartaTravelApp/1.0 (https://carta-europetravel.com; trip validator)"

# "€1,200, €1,850" or "€14, €22": a range whose dash was stripped and replaced
# with a comma, so it reads as two prices (spec A1). Thousands separators are
# allowed inside each number; the defect is the ", €" between two numbers.
# A genuine pair of prices ("€14, €13 online") runs downwards, and a list of
# denominations ("€5, €10 and €20 notes") carries a third figure, so the match
# is kept only when the second figure is larger and nothing follows it.
COMMA_RANGE_RE = re.compile(
    r"€\s?(\d[\d.,]*\d|\d),\s€\s?(\d[\d.,]*\d|\d)(?!\d)(?!\s?(?:,\s?|\sand\s|\sor\s)€)")
PERCENT_RE = re.compile(r"(\d{1,3})\s?%")
# A surface line can carry several splits: one per day ("**Day 1** ...") or one
# per strand, written as separate sentences. Each is judged on its own.
SURFACE_SEGMENT_RE = re.compile(r"\*{0,2}Day\s+\d+\*{0,2}|(?<=[a-z\)])\.\s+(?=[A-Z])")

# Place check gazetteer: the GeoNames cities500 dump the catalogue pipeline
# already caches (pipeline/harvest_geonames.py), every populated place over
# 500 people. The pipeline's geonamescache extract (cities over 15k) is the
# fallback; it is too thin to vouch for a village, so with it the check can
# only say where a name is NOT.
DEFAULT_GAZETTEER = os.path.join(REPO_ROOT, "cache", "geonames_cities500.txt")
FOREIGN_MIN_POP = 20000       # a namesake abroad must be a real town to count

# Coordinate geocode check (T090). The pin is reverse-geocoded to its nearest
# populated place in cities500. It is outside the stated country when a town
# of another country lies within COORD_LOCAL_KM of it and the nearest town of
# the stated countries is more than COORD_BORDER_KM farther away than that.
# Where no town at all lies within COORD_LOCAL_KM (Lapland, the high fjell)
# nearest-town is not evidence of anything, so the check stays silent.
COORD_LOCAL_KM = 15
COORD_BORDER_KM = 10
# A pin this far from every place the itinerary names (outside the gateway
# city) is reported, as a warning: cities500 does not know most huts and
# hamlets, and a homonym can be the only name it resolves.
COORD_FAR_KM = 50


def _to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _comma_range_hits(blob):
    out = []
    for m in COMMA_RANGE_RE.finditer(blob):
        a = _to_int(m.group(1).replace(",", "").replace(".", ""))
        b = _to_int(m.group(2).replace(",", "").replace(".", ""))
        if b > a:
            out.append(m)
    return out

# Words that name a neighbouring country inside a record. A place that
# geocodes only to that country is then a legitimate border crossing, not a
# geocoding defect ("Lindau and the Austrian corner" on a German trip).
COUNTRY_WORDS = {
    "AL": ["albania", "albanian"], "AD": ["andorra", "andorran"],
    "AT": ["austria", "austrian"], "BE": ["belgium", "belgian"],
    "BA": ["bosnia", "bosnian", "herzegovina"], "BG": ["bulgaria", "bulgarian"],
    "HR": ["croatia", "croatian"], "CZ": ["czechia", "czech"],
    "DK": ["denmark", "danish"], "EE": ["estonia", "estonian"],
    "FO": ["faroe", "faroese"], "FI": ["finland", "finnish"],
    "FR": ["france", "french"], "DE": ["germany", "german"],
    "GR": ["greece", "greek"], "HU": ["hungary", "hungarian"],
    "IE": ["ireland", "irish"], "IT": ["italy", "italian"],
    "XK": ["kosovo", "kosovar"], "LV": ["latvia", "latvian"],
    "LI": ["liechtenstein"], "LT": ["lithuania", "lithuanian"],
    "LU": ["luxembourg", "luxembourgish"], "MD": ["moldova", "moldovan"],
    "MC": ["monaco", "monegasque"], "ME": ["montenegro", "montenegrin"],
    "NL": ["netherlands", "dutch", "holland"], "MK": ["macedonia", "macedonian"],
    "NO": ["norway", "norwegian"], "PL": ["poland", "polish"],
    "PT": ["portugal", "portuguese"], "RO": ["romania", "romanian"],
    "SM": ["san marino", "sammarinese"], "RS": ["serbia", "serbian"],
    "SK": ["slovakia", "slovak"], "SI": ["slovenia", "slovene", "slovenian"],
    "ES": ["spain", "spanish"], "SE": ["sweden", "swedish"],
    "CH": ["switzerland", "swiss"],
    # not in the catalogue but named by border trips
    "GB": ["united kingdom", "britain", "british", "england", "english",
           "scotland", "scottish", "wales", "welsh", "northern ireland"],
    "TR": ["turkey", "turkish"], "UA": ["ukraine", "ukrainian"],
    "BY": ["belarus", "belarusian"], "RU": ["russia", "russian"],
    "MT": ["malta", "maltese"], "CY": ["cyprus", "cypriot"],
    "IS": ["iceland", "icelandic"], "GI": ["gibraltar"],
}

PLACE_SPLIT_RE = re.compile(
    r"\s*(?:,|:|;|/|\||\u2014|\u2013|\(|\)|\band\b|\bor\b|\bthen\b|\bto\b|\bvia\b|\binto\b|"
    r"\bfrom\b|\bthrough\b|\bover\b|\bacross\b|\bon\b|\bat\b|\bin\b|\bnear\b|"
    r"\bback\b|\bout\b|\bup\b|\bdown\b|&|->|→)\s*")
# A name has to look like one before it is looked up: capitalised, short, and
# not a generic noun phrase. Short names are the ones that double as words.
PLACE_MIN_LEN = 4
PLACE_MAX_WORDS = 3
PLACE_STOP = {"hotel", "hostel", "pension", "guesthouse", "refuge", "refugio",
              "rifugio", "hut", "huette", "cabin", "camp", "apartment", "apartments",
              "airport", "station", "day", "rest", "night", "nights", "morning",
              "afternoon", "evening", "arrival", "departure", "transfer", "return",
              "summit", "lake", "valley", "pass", "peak", "ridge", "coast", "bay",
              "island", "islands", "national", "park", "the", "old", "town", "city",
              "centre", "center", "north", "south", "east", "west", "upper", "lower"}


def _fold(text):
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z ]+", " ", text.lower()).strip()


def _place_tokens(name):
    return [w for w in _fold(name).split() if w not in PLACE_STOP and len(w) > 2]


class PlaceIndex:
    """Folded place name -> ISO country codes, European places only.

    `anywhere` holds every place in the gazetteer; `towns` only those over
    FOREIGN_MIN_POP. A name vouches for the trip's country if it appears in
    `anywhere` there (a village is enough); it is suspected of sitting in
    another country only when a real town carries it there and nothing in the
    trip's countries does. Alternate names are indexed too (Wien, Vienna,
    Vienne) because the batches spell towns in the local language as often as
    in English.
    """

    def __init__(self):
        self.anywhere = collections.defaultdict(set)
        self.towns = collections.defaultdict(set)
        self.source = None

    def add(self, names, code, population):
        for n in names:
            key = _fold(n)
            if not key:
                continue
            self.anywhere[key].add(code)
            if population >= FOREIGN_MIN_POP:
                self.towns[key].add(code)

    @classmethod
    def from_cities500(cls, path):
        idx = cls()
        idx.source = f"cities500 ({os.path.relpath(path, REPO_ROOT)})"
        lat_min, lat_max, lon_min, lon_max = EUROPE_BBOX
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                f = line.rstrip("\n").split("\t")
                if len(f) < 15:
                    continue
                try:
                    lat, lon = float(f[4]), float(f[5])
                except ValueError:
                    continue
                if not (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max):
                    continue
                names = [f[1], f[2]] + (f[3].split(",") if f[3] else [])
                idx.add(names, f[8], _to_int(f[14]))
        return idx

    @classmethod
    def from_geonamescache(cls):
        idx = cls()
        idx.source = "geonamescache (cities over 15k)"
        lat_min, lat_max, lon_min, lon_max = EUROPE_BBOX
        for city in geonamescache.GeonamesCache().get_cities().values():
            lat, lon = city["latitude"], city["longitude"]
            if not (lat_min <= lat <= lat_max and lon_min <= lon <= lon_max):
                continue
            names = [city["name"]] + list(city.get("alternatenames") or [])
            idx.add(names, city["countrycode"], city.get("population") or 0)
        return idx


def load_place_index(path):
    """The namesake index, and with cities500 also the reverse geocoder for the
    coordinate check (`.gazetteer`, a geocode.Gazetteer). geonamescache alone
    is too thin to say which country a pin is in, so with it the coordinate
    check keeps only its capital-fallback half."""
    if path and os.path.isfile(path):
        idx = PlaceIndex.from_cities500(path)
        idx.gazetteer = G.Gazetteer.from_cities500(path)
        return idx
    if geonamescache is not None:
        idx = PlaceIndex.from_geonamescache()
        idx.gazetteer = None
        return idx
    return None


def coordinate_issues(trip, gaz):
    """[(level, code, detail)] for the trip's own pin against its stated
    countries, using the cities500 reverse geocoder `gaz`."""
    out = []
    coords = trip.get("coordinates") or {}
    lat, lon = coords.get("lat"), coords.get("lon")
    if lat is None or lon is None:
        return out
    stated = G.stated_countries(trip)
    near_any = gaz.nearest(lat, lon)
    near_stated = gaz.nearest(lat, lon, codes=stated)
    if near_any and near_any[0] <= COORD_LOCAL_KM and near_any[1].cc not in stated:
        d_stated = near_stated[0] if near_stated else float("inf")
        if d_stated > near_any[0] + COORD_BORDER_KM:
            out.append(("ERROR", "coordinate-outside-country",
                        f"pin {lat},{lon} is {near_any[0]:.0f} km from {near_any[1].name} "
                        f"({near_any[1].cc}) and {d_stated:.0f} km from the nearest town in "
                        f"{'/'.join(sorted(stated))}"))
    named = [r for r in G.itinerary_resolutions(trip, gaz) if not r[2]]
    if named:
        d, name = min((G._rad_km(lat, lon, q.lat, q.lon), r[0]) for r in named for q in r[4])
        if d > COORD_FAR_KM:
            out.append(("WARNING", "coordinate-far-from-itinerary",
                        f"pin is {d:.0f} km from the nearest place the itinerary names "
                        f"({name}); check it is not a homonym"))
    return out


def itinerary_places(trip):
    """Candidate place names from the itinerary: day titles, where the night is
    spent, the basecamps and the sub-region. Free prose is deliberately left
    alone; it names restaurants, people and dishes, and a geocoder cannot tell
    those from towns."""
    texts = []
    for d in trip.get("itinerary") or []:
        texts.append(d.get("title") or "")
        texts.append(d.get("sleep") or "")
    texts.extend(trip.get("basecamps") or [])
    texts.append(trip.get("subRegion") or "")
    out = []
    for text in texts:
        for part in PLACE_SPLIT_RE.split(re.sub(r"\[VERIFY:[^\]]*\]", "", text)):
            part = re.sub(r"\*+", "", part or "").strip(" .'\"")
            part = re.sub(r"^(the|a|an)\s+", "", part, flags=re.I)
            if not part or not part[0].isupper():
                continue
            words = part.split()
            if len(words) > PLACE_MAX_WORDS or len(part) < PLACE_MIN_LEN:
                continue
            if any(ch.isdigit() for ch in part):
                continue
            if _fold(words[0]) in PLACE_STOP:
                continue
            if part not in out:
                out.append(part)
    return out


def allowed_country_codes(trip, blob_lower):
    """The trip's countries plus every country the record names anywhere."""
    codes = {c.get("code") for c in trip.get("countries") or [] if c.get("code")}
    codes.add(trip.get("countryCode"))
    words = set(re.findall(r"[a-z]+", blob_lower))
    for code, names in COUNTRY_WORDS.items():
        for n in names:
            if (n in words) if " " not in n else (n in blob_lower):
                codes.add(code)
                break
    return {c for c in codes if c}


def surface_percent_groups(text):
    """Percentages in a surface line, grouped so a per-day split ("**Day 1** ...
    70% ... **Day 2** ...") is judged one day at a time. Returns a list of
    lists of ints; groups with fewer than two figures are dropped because a lone
    "gradients to 14%" is not a split."""
    text = str(text or "")
    segments = SURFACE_SEGMENT_RE.split(text) if SURFACE_SEGMENT_RE.search(text) else [text]
    groups = []
    for seg in segments:
        nums = [int(n) for n in PERCENT_RE.findall(seg)]
        if len(nums) >= 2:
            groups.append(nums)
    return groups


def accommodation_slept(name, sleep_blob):
    """True when the strategy's property is named in some day's sleep line.
    A strategy entry can itself offer alternatives ("Hotel X or a Y pansion");
    any one of them counts. Exact folded substring first; otherwise most of
    the entry's distinctive words."""
    for alt in re.split(r"\s+or\s+|\s*/\s*", name):
        folded = _fold(alt)
        if folded and folded in sleep_blob:
            return True
        tokens = _place_tokens(alt)
        if not tokens:
            continue
        hits = sum(1 for w in tokens if re.search(rf"\b{re.escape(w)}\b", sleep_blob))
        if hits >= max(1, (len(tokens) + 1) // 2) and hits >= min(2, len(tokens)):
            return True
    return False


def load_wire(wire_dir):
    """id -> journey record from the shipped wire, or None when absent."""
    if not wire_dir or not os.path.isdir(os.path.join(wire_dir, "journey")):
        return None
    out = {}
    folder = os.path.join(wire_dir, "journey")
    for name in os.listdir(folder):
        if name.endswith(".json"):
            with open(os.path.join(folder, name), encoding="utf-8") as fh:
                rec = json.load(fh)
            out[rec.get("id") or name[:-5]] = rec
    return out


def head_url(url):
    """(status, reason). Status 0 is a transport failure, not an answer.

    upload.wikimedia.org answers a burst of HEADs with 429, so the request is
    paced and a 429 or 5xx is retried after the server's Retry-After (or a
    short default) before it is reported as transient."""
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    status, reason = 0, ""
    for attempt in range(URL_RETRIES + 1):
        time.sleep(URL_PACE)
        try:
            with urllib.request.urlopen(req, timeout=URL_TIMEOUT) as resp:
                return resp.status, ""
        except urllib.error.HTTPError as e:
            status, reason = e.code, str(e.reason)
            if status != 429 and status < 500:
                return status, reason
            wait = _to_int(e.headers.get("Retry-After")) or URL_BACKOFF * (attempt + 1)
            time.sleep(min(wait, 30))
        except Exception as e:  # noqa: BLE001 - DNS, TLS, timeout: all transport
            status, reason = 0, type(e).__name__
            time.sleep(URL_BACKOFF)
    return status, reason


def check_urls(urls):
    with concurrent.futures.ThreadPoolExecutor(max_workers=URL_WORKERS) as pool:
        return dict(zip(urls, pool.map(head_url, urls)))


class Issue:
    __slots__ = ("level", "trip", "code", "detail")

    def __init__(self, level, trip, code, detail):
        self.level, self.trip, self.code, self.detail = level, trip, code, detail

    def as_dict(self):
        return {"level": self.level, "trip": self.trip, "code": self.code,
                "detail": self.detail}


def validate(dataset, wire=None, verify_urls=False, places=None):
    """wire: id -> shipped journey record (see load_wire), or None to skip the
    hero checks. verify_urls: HEAD every hero URL (network). places: a
    PlaceIndex, or None to skip place-outside-country."""
    trips = dataset["trips"]
    issues = []

    def err(t, code, detail):
        issues.append(Issue("ERROR", t, code, detail))

    def warn(t, code, detail):
        issues.append(Issue("WARNING", t, code, detail))

    def info(t, code, detail):
        issues.append(Issue("INFO", t, code, detail))

    seen_ids = collections.Counter(t["id"] for t in trips)
    seen_titles = collections.Counter((t["title"] or "").strip().lower() for t in trips)

    for t in trips:
        tid = t.get("id") or "<no id>"

        # --- structural -------------------------------------------------
        for field in REQUIRED_TOP:
            if t.get(field) in (None, "", [], {}):
                err(tid, "missing-field", f"required field `{field}` is empty")

        if seen_ids[t["id"]] > 1:
            err(tid, "duplicate-id", f"id used {seen_ids[t['id']]} times")
        if not ID_RE.match(t["id"] or ""):
            err(tid, "bad-id-pattern", f"id {t['id']!r} breaks {{cc}}-{{type}}-{{name}}")
        if seen_titles[(t["title"] or "").strip().lower()] > 1:
            warn(tid, "duplicate-title", f"title {t['title']!r} is not unique")

        # --- enums ------------------------------------------------------
        try:
            tid_num, name, _slug = C.canonical_trip_type(t.get("tripType") or "")
            if tid_num != t.get("tripTypeId") or name != t.get("tripType"):
                err(tid, "trip-type-mismatch",
                    f"{t.get('tripType')!r}/{t.get('tripTypeId')} is not canonical")
        except ValueError:
            err(tid, "bad-trip-type", f"{t.get('tripType')!r} is not one of the 10 types")

        if t.get("budgetTier") not in VALID_TIERS:
            err(tid, "bad-budget-tier", f"{t.get('budgetTier')!r} not in €/€€/€€€")

        if t.get("countryCode") not in C.COUNTRY_CODES.values():
            err(tid, "bad-country-code", f"{t.get('countryCode')!r} is not a mapped ISO code")
        else:
            expected = C.COUNTRY_REGION.get(t["countryCode"])
            if expected and expected != t.get("regionKey"):
                info(tid, "region-country-mismatch",
                     f"{t['country']} sits in {C.REGIONS[expected]} but the record is "
                     f"filed under {t.get('region')} (source batch)")

        # --- prose caps (T152, spec D4) ---------------------------------
        # A generated trip over a cap is an ERROR: the generator's prompt and
        # gate already refuse it, so one here means something bypassed them.
        # A trip from the original source batches is a WARNING, one row per
        # trip with the counts, because rewriting them needs a Gemini pass
        # (stage 3 of _OPEN-MASTER.md); it still shows in the report.
        caps = GG.word_cap_errors(t)
        if caps:
            blocks = [c for c in caps if c.startswith("word-cap: itinerary")]
            tips = [c for c in caps if c.startswith("word-cap: proTips")]
            summ = [c for c in caps if c.startswith("word-cap: summary")]
            worst = max(int(re.search(r": (\d+) words", c).group(1)) for c in caps)
            detail = (f"{len(summ)} summary, {len(blocks)} day blocks and {len(tips)} pro tips "
                      f"over their caps ({GG.SUMMARY_WORDS}, {GG.DAY_WORDS} and {GG.TIP_WORDS} "
                      f"words); longest {worst}; first: {caps[0]}")
            if (t.get("provenance") or {}).get("sourceFormat") == "generated":
                err(tid, "word-cap", detail)
            else:
                warn(tid, "word-cap", detail)

        fit = t.get("profile", {}).get("fitnessLevel")
        if fit is not None and fit not in C.FITNESS_LEVELS:
            err(tid, "bad-fitness-level", f"{fit!r} not in {C.FITNESS_LEVELS}")
        diff = t.get("profile", {}).get("difficulty")
        if diff is None:
            warn(tid, "missing-difficulty", "no difficulty rating in the source record")
        elif not isinstance(diff, int) or not 1 <= diff <= 5:
            err(tid, "bad-difficulty", f"difficulty {diff!r} is outside 1 to 5")

        if t.get("durationDays") != 7:
            err(tid, "bad-duration", f"durationDays={t.get('durationDays')}, expected 7")

        # --- budget -----------------------------------------------------
        b = t.get("budget") or {}
        total = (b.get("totalEur") or {})
        low, high = total.get("low"), total.get("high")
        if low is None or high is None:
            err(tid, "missing-budget-total", "budget.totalEur is incomplete")
        else:
            if low > high:
                err(tid, "inverted-budget", f"total low {low} > high {high}")
            if low <= 0:
                err(tid, "nonpositive-budget", f"total low {low}")
            bd = b.get("breakdown") or {}
            lows = [v.get("lowEur") for v in bd.values()]
            highs = [v.get("highEur") for v in bd.values()]
            if any(v is None for v in lows + highs):
                warn(tid, "incomplete-breakdown",
                     "one or more budget categories has no parsed range")
            else:
                for cat, v in bd.items():
                    if v["lowEur"] > v["highEur"]:
                        err(tid, "inverted-category", f"{cat}: {v['lowEur']} > {v['highEur']}")
                s_low, s_high = sum(lows), sum(highs)
                for label, part, whole in (("low", s_low, low), ("high", s_high, high)):
                    if whole and abs(part - whole) > max(1, SUM_TOLERANCE * whole):
                        err(tid, "budget-sum-mismatch",
                            f"{label}: breakdown sums to €{part} against a stated total "
                            f"of €{whole} ({(part - whole) / whole:+.0%})")
            days_n = t.get("durationDays") or 7
            per_day_stated = b.get("perDayEur") or {}
            for label, whole in (("low", low), ("high", high)):
                stated = per_day_stated.get(label)
                if stated is None:
                    err(tid, "per-day-missing", f"budget.perDayEur.{label} is empty")
                elif abs(stated - whole / days_n) > PER_DAY_TOLERANCE:
                    err(tid, "per-day-mismatch",
                        f"{label}: perDayEur {stated} but total {whole} over {days_n} "
                        f"days is {whole / days_n:.0f}")
            rank = C.TIER_ORDER.get(t.get("budgetTier"))
            per_day = (high or 0) / 7
            if rank == 1 and per_day > 260:
                warn(tid, "tier-price-mismatch",
                     f"tier € but €{per_day:.0f}/day at the top of the range")
            if rank == 3 and per_day < 90:
                warn(tid, "tier-price-mismatch",
                     f"tier €€€ but only €{per_day:.0f}/day at the top of the range")

        # --- itinerary --------------------------------------------------
        days = t.get("itinerary") or []
        nums = [d.get("day") for d in days]
        if len(days) != 7:
            err(tid, "bad-day-count", f"{len(days)} days parsed, expected 7")
        if sorted(nums) != list(range(1, 8)):
            err(tid, "bad-day-numbering", f"day numbers {nums}")
        for d in days:
            for slot in ("morning", "afternoon"):
                if not d.get(slot):
                    err(tid, "missing-day-slot", f"day {d.get('day')} has no {slot}")
            if not d.get("evening"):
                warn(tid, "missing-evening", f"day {d.get('day')} has no evening block")
            if not d.get("title"):
                warn(tid, "missing-day-title", f"day {d.get('day')} has no title")

        # --- best period ------------------------------------------------
        bp = t.get("bestPeriod") or {}
        months = bp.get("months") or []
        if not months:
            err(tid, "missing-best-period", "no months resolved for bestPeriod")
        elif any(not isinstance(m, int) or not 1 <= m <= 12 for m in months):
            err(tid, "bad-month", f"months {months}")
        if t.get("tripTypeId") == 8 and months and not (set(months) & {12, 1, 2, 3, 4}):
            warn(tid, "season-implausible",
                 f"winter-sports trip with best months {C.month_names(months)}")

        # --- coordinates ------------------------------------------------
        coords = t.get("coordinates")
        if coords is None:
            warn(tid, "missing-coordinates", "no basecamp coordinates on the record")
        else:
            lat, lon = coords.get("lat"), coords.get("lon")
            if lat is None or lon is None:
                err(tid, "broken-coordinates", f"incomplete coordinate pair {coords}")
            elif not (EUROPE_BBOX[0] <= lat <= EUROPE_BBOX[1]
                      and EUROPE_BBOX[2] <= lon <= EUROPE_BBOX[3]):
                err(tid, "coordinates-out-of-range",
                    f"lat/lon {lat},{lon} falls outside the European bounding box")
            elif coords.get("precision") == "country":
                err(tid, "coordinate-capital-fallback",
                    f"pin falls back to the {t['country']} capital "
                    f"({coords.get('matchedPlace')}), no place the itinerary names resolved; "
                    "run pipeline/geocode.py")
            elif coords.get("precision") == "gateway":
                warn(tid, "gateway-coordinates",
                     f"pin sits on the gateway city ({coords.get('matchedPlace')}), "
                     "not on the trip's basecamp")
            if coords.get("precision") not in ("source", "city", "gateway", "country"):
                err(tid, "bad-coordinate-precision", f"{coords.get('precision')!r}")
            gaz = getattr(places, "gazetteer", None)
            if gaz is not None and lat is not None and lon is not None:
                for level, code, detail in coordinate_issues(t, gaz):
                    (err if level == "ERROR" else warn)(tid, code, detail)

        # --- content depth ----------------------------------------------
        if len(t.get("accommodationStrategy") or []) < 2:
            warn(tid, "thin-accommodation",
                 f"{len(t.get('accommodationStrategy') or [])} lodging options")
        if len(t.get("proTips") or []) < 3:
            warn(tid, "thin-pro-tips", f"{len(t.get('proTips') or [])} pro-tips")
        if not t.get("gatewayAirport"):
            warn(tid, "missing-gateway", "no gateway airport named on the record")
        if not (t.get("logistics") or {}).get("connectivity"):
            warn(tid, "missing-connectivity", "logistics.connectivity is empty")
        if not (t.get("logistics") or {}).get("bookingWindows"):
            warn(tid, "missing-booking-windows", "logistics.bookingWindows is empty")
        if t.get("summaryGenerated"):
            info(tid, "generated-summary",
                 "summary composed from metadata, no editorial summary in the source")

        # --- type-specific refinements ----------------------------------
        ts = t.get("typeSpecific") or {}
        expectations = {
            1: ("surface", "surface/GPX detail"),
            2: ("technicalRating", "technical rating"),
            3: ("transitPass", "transit pass detail"),
            6: ("hutBooking", "hut booking path"),
            8: ("liftNetwork", "lift network / pass detail"),
        }
        want = expectations.get(t.get("tripTypeId"))
        if want and not ts.get(want[0]):
            warn(tid, "missing-type-detail", f"no {want[1]} captured for this trip type")

        # --- text hygiene -------------------------------------------------
        blob = json.dumps(t, ensure_ascii=False)
        if PLACEHOLDER_RE.search(blob):
            err(tid, "placeholder-text", "unresolved placeholder (TBD/TODO/{{…}}) in record")
        if t.get("verifyFlagCount", 0) > 20:
            info(tid, "many-verify-flags",
                 f"{t['verifyFlagCount']} distinct [VERIFY] flags to clear before publishing")

        # --- T093 (spec J4, J5): one model behind the accuracy signals -----
        # verifyFlagCount, volatilePricing and sources.verified must be what
        # the trip's own figures ledger gives (accuracy.py), or, on a v2.0
        # trip with no ledger, what its own verify flags give. A ledgered
        # trip also meets the K3 rules the gate applies to a generated one
        # (register row T230-c).
        for e in A.inconsistencies(t):
            err(tid, "accuracy-signals", e)
        if A.ledgered(t):
            for e in GG.figure_errors(t):
                err(tid, "figure-ledger", e)

        # --- K5: comma ranges ---------------------------------------------
        for m in _comma_range_hits(blob):
            err(tid, "comma-range",
                f"{blob[max(0, m.start() - 20):m.end() + 12]!r} reads as two prices, "
                "not a range")

        # --- K5: surface split --------------------------------------------
        surface = ts.get("surface")
        if surface:
            for nums in surface_percent_groups(surface):
                if abs(sum(nums) - 100) > SURFACE_TOLERANCE:
                    err(tid, "surface-percent-sum",
                        f"surface split {nums} adds to {sum(nums)}%, not 100%")

        # --- K5: the strategy is slept in ---------------------------------
        sleeps = [d.get("sleep") for d in days if d.get("sleep")]
        strategy = t.get("accommodationStrategy") or []
        if not sleeps:
            warn(tid, "no-sleep-lines",
                 "no day names where the night is spent, so the accommodation "
                 "strategy cannot be checked against the itinerary")
        else:
            sleep_blob = _fold(" | ".join(sleeps))
            # Schema v2.1 (T143): a generated record names the strategy entry
            # it sleeps in by rank (sleepRef), and an entry that is only a
            # different-budget substitute for another says so (alternativeTo).
            # The reference is the proof, so the name match is skipped for it,
            # and a declared alternative is exempt. A v2.0 record carries
            # neither field and is checked by name exactly as before.
            refs = {d.get("sleepRef") for d in days if d.get("sleepRef") is not None}
            for opt in strategy:
                name = opt.get("name") or ""
                if opt.get("alternativeTo") is not None or (
                        opt.get("rank") is not None and opt.get("rank") in refs):
                    continue
                if name and not accommodation_slept(name, sleep_blob):
                    err(tid, "accommodation-not-slept",
                        f"{name!r} is in accommodationStrategy but no day sleeps there")

        # --- K5: places geocode inside the country ------------------------
        # A warning, not an error: an offline gazetteer lists towns, and the
        # itinerary also names huts, beaches, districts and peaks, so a name
        # that only matches a town abroad is a lead for a reviewer, not proof.
        if places is not None:
            allowed = allowed_country_codes(t, blob.lower())
            for place in itinerary_places(t):
                key = _fold(place)
                if places.anywhere.get(key, set()) & allowed:
                    continue
                abroad = places.towns.get(key, set()) - allowed
                if abroad:
                    warn(tid, "place-outside-country",
                         f"{place!r} is a town in {'/'.join(sorted(abroad))} and "
                         f"nothing in {'/'.join(sorted(allowed))} carries the name")

    if places is None:
        issues.append(Issue("WARNING", "<dataset>", "gazetteer-missing",
                            "no gazetteer found, place-outside-country skipped"))

    # --- K5: heroes and the shipped copy ------------------------------------
    if wire is None:
        issues.append(Issue("WARNING", "<dataset>", "wire-missing",
                            "no journeys wire found, hero checks skipped"))
    else:
        pending = {}
        by_photo = {}
        for t in trips:
            tid = t.get("id") or "<no id>"
            rec = wire.get(tid)
            if rec is None:
                err(tid, "wire-missing-journey", "trip is not in the shipped wire")
                continue
            wire_blob = json.dumps(rec, ensure_ascii=False)
            hits = _comma_range_hits(wire_blob)
            if hits:
                m = hits[0]
                err(tid, "comma-range-wire",
                    f"{len(hits)} comma range(s) in the shipped copy, e.g. "
                    f"{wire_blob[max(0, m.start() - 20):m.end() + 12]!r}")
            hero = rec.get("hero") or {}
            if not hero.get("url"):
                err(tid, "hero-missing", "no hero photograph in the shipped wire")
                continue
            # Spec B3 measures the long edge. The wire records the size of the
            # derivative it serves (build_wire.py THUMB_W), not the original,
            # because the served file is what the visitor sees.
            long_edge = max(_to_int(hero.get("w")), _to_int(hero.get("h")))
            if not long_edge:
                err(tid, "hero-below-floor",
                    f"hero carries no size, floor is {HERO_MIN_W}px")
            elif long_edge < HERO_MIN_W:
                err(tid, "hero-below-floor",
                    f"hero long edge is {long_edge}px, floor is {HERO_MIN_W}px")
            by_photo.setdefault(hero_photo_key(hero["url"]), []).append(tid)
            if verify_urls:
                pending.setdefault(hero["url"], []).append(tid)
        # J2: two weeks opening on the same photograph is what a generated
        # catalogue looks like. The check reads the file name, not the URL,
        # because one file is served at several thumb widths.
        for key, tids in by_photo.items():
            if len(tids) > 1:
                for tid in tids:
                    others = ", ".join(x for x in tids if x != tid)
                    err(tid, "hero-duplicate",
                        f"hero photograph {key} is also the hero of {others}")
        if pending:
            results = check_urls(list(pending))
            for url, (status, reason) in results.items():
                for tid in pending[url]:
                    if status == 0 or status == 429 or status >= 500:
                        warn(tid, "hero-url-unverified",
                             f"{reason or 'HTTP ' + str(status)} while fetching {url}; "
                             "transient, re-run to confirm")
                    elif status >= 400:
                        err(tid, "hero-url-dead", f"HTTP {status} for {url}")

    return issues


def hero_photo_key(url):
    """The Commons file a hero URL serves, whatever the thumb width: the
    last path segment, query and a leading NNNpx- derivative prefix removed,
    percent-escapes decoded, case folded."""
    name = urllib.parse.unquote(str(url).split("?")[0].rsplit("/", 1)[-1])
    return re.sub(r"^\d+px-", "", name).lower()


def coverage_stats(trips):
    by_region = collections.Counter(t["regionKey"] for t in trips)
    by_type = collections.Counter(t["tripType"] for t in trips)
    by_country = collections.Counter(t["country"] for t in trips)
    return by_region, by_type, by_country


# --- self-test: a seeded bad trip -----------------------------------------
# A check that never fires looks exactly like a catalogue with no defects, so
# CI first proves every K5 check can fail. One clean trip is copied, one
# defect per check is planted in the copy, and the run must report each
# planted code on the copy and none of them on the clean original.
K5_CODES = ["budget-sum-mismatch", "per-day-mismatch", "comma-range",
            "surface-percent-sum", "accommodation-not-slept",
            "place-outside-country", "comma-range-wire", "hero-below-floor",
            "hero-missing", "coordinate-capital-fallback", "coordinate-outside-country",
            "hero-duplicate", "accuracy-signals"]
SEED_DEAD_URL = ("https://upload.wikimedia.org/wikipedia/commons/0/00/"
                 "Carta_trip_validator_seeded_missing_file.jpg")
# A town far from every trip in the catalogue, and the country it sits in.
SEED_ABROAD = [("Salamanca", "ES"), ("Uppsala", "SE")]
# where those towns are, for the seeded wrong pin
SEED_ABROAD_AT = {"Salamanca": (40.9701, -5.6635), "Uppsala": (59.8586, 17.6389)}


def _clean_control(trips, places):
    """The first trip that raises none of the K5 codes on its own and has the
    fields the seeds need (a breakdown, sleep lines, a strategy)."""
    for t in trips:
        days = t.get("itinerary") or []
        bd = (t.get("budget") or {}).get("breakdown") or {}
        if not bd or not t.get("accommodationStrategy"):
            continue
        if not any(d.get("sleep") for d in days):
            continue
        # The control's shipped copy is the master record itself: today every
        # trip with sleep lines carries a stripped range in the real wire, and
        # the control has to be clean to prove the seeds, not the catalogue.
        rec = dict(t)
        rec["hero"] = {"url": "https://example.invalid/clean.jpg", "w": 2400, "h": 1600}
        got = {i.code for i in validate({"trips": [t]}, wire={t["id"]: rec}, places=places)}
        if not got & set(K5_CODES):
            return t, rec
    return None, None


def self_test(dataset, places, verify_urls):
    import copy
    control, control_rec = _clean_control(dataset["trips"], places)
    if control is None:
        print("SELF-TEST: no clean control trip found", file=sys.stderr)
        return 1

    bad = copy.deepcopy(control)
    bad["id"] = control["id"] + "-seeded"
    bad["title"] = (control.get("title") or "") + " (seeded)"
    b = bad["budget"]
    first_cat = next(iter(b["breakdown"]))
    b["breakdown"][first_cat]["lowEur"] += 500
    b["breakdown"][first_cat]["highEur"] += 500
    b["perDayEur"]["low"] = (b["perDayEur"].get("low") or 0) + 40
    bad["summary"] = "word " * (GG.SUMMARY_WORDS + 1) + (bad.get("summary") or "") + " Dinner runs €14, €22 a head."
    bad.setdefault("typeSpecific", {})["surface"] = "60% paved road, 30% gravel"
    # T093: volatile pricing with nothing to check, the J4 contradiction
    bad["verifyFlags"], bad["verifyFlagCount"], bad["volatilePricing"] = [], 0, True
    bad["accommodationStrategy"] = list(bad["accommodationStrategy"]) + [
        {"name": "Pension Zzyzx Seeded"}]
    allowed = allowed_country_codes(control, json.dumps(control, ensure_ascii=False).lower())
    abroad = next((n for n, cc in SEED_ABROAD if cc not in allowed), None)
    if abroad:
        bad["itinerary"] = copy.deepcopy(bad["itinerary"])
        bad["itinerary"][0]["title"] = f"Arrival, then {abroad}"
        # the pin itself abroad, labelled the way a capital fallback is
        lat, lon = SEED_ABROAD_AT[abroad]
        bad["coordinates"] = {"lat": lat, "lon": lon, "precision": "country",
                              "matchedPlace": abroad, "source": "country capital fallback"}
    bad_rec = copy.deepcopy(bad)
    bad_rec["budget"]["totalNote"] = "€1,200, €1,850 per person"
    bad_rec["hero"] = {"url": SEED_DEAD_URL, "w": 1280, "h": 853}
    # a second seeded copy with no hero at all
    bare = copy.deepcopy(control)
    bare["id"] = control["id"] + "-seeded-bare"
    bare["title"] = (control.get("title") or "") + " (seeded, no hero)"
    bare_rec = copy.deepcopy(bare)
    bare_rec["hero"] = {}

    # a fourth copy that opens on the same photograph as the bad one
    twin = copy.deepcopy(bad)
    twin["id"] = control["id"] + "-seeded-twin"
    twin_rec = copy.deepcopy(bad_rec)
    twin_rec["id"] = twin["id"]
    twin_rec["hero"] = {"url": SEED_DEAD_URL.replace("/commons/0/00/", "/commons/thumb/0/00/") + "/1280px-"
                        + SEED_DEAD_URL.rsplit("/", 1)[-1], "w": 1280, "h": 853}

    data = {"trips": [control, bad, bare, twin]}
    seeded_wire = {control["id"]: control_rec, bad["id"]: bad_rec, bare["id"]: bare_rec,
                   twin["id"]: twin_rec}
    issues = validate(data, wire=seeded_wire, verify_urls=verify_urls, places=places)
    on = collections.defaultdict(set)
    for i in issues:
        on[i.trip].add(i.code)

    expected = {c for c in K5_CODES if c != "hero-missing"}
    if places is None or not abroad:
        expected.discard("place-outside-country")
    if not abroad:
        expected.discard("coordinate-capital-fallback")
    if getattr(places, "gazetteer", None) is None or not abroad:
        expected.discard("coordinate-outside-country")
    if verify_urls:
        expected.add("hero-url-dead")
    failures = []
    for code in sorted(expected):
        if code not in on[bad["id"]]:
            failures.append(f"seeded {code} was not reported")
    # T152: the seeded summary is over its cap. A catalogue trip is warned, a
    # generated one is an error, and the control must not be caught by it.
    if "word-cap" not in on[bad["id"]]:
        failures.append("seeded word-cap was not reported")
    gen = copy.deepcopy(bad)
    gen["id"] = control["id"] + "-seeded-generated"
    gen["title"] = (control.get("title") or "") + " (seeded, generated)"
    gen["provenance"] = {**(gen.get("provenance") or {}), "sourceFormat": "generated"}
    levels = {(i.code, i.level) for i in validate({"trips": [gen]}, places=places)}
    if ("word-cap", "ERROR") not in levels:
        failures.append("a generated trip over a word cap was not an ERROR")
    if ("word-cap", "WARNING") not in {(i.code, i.level) for i in issues if i.trip == bad["id"]}:
        failures.append("a catalogue trip over a word cap was not a WARNING")
    if "hero-missing" not in on[bare["id"]]:
        failures.append("seeded hero-missing was not reported")
    leaked = on[control["id"]] & (set(K5_CODES) | {"hero-url-dead"})
    if leaked:
        failures.append(f"clean control {control['id']} raised {sorted(leaked)}")

    print(f"SELF-TEST control={control['id']} seeded={len(expected) + 1} checks "
          f"place-check={'on' if 'place-outside-country' in expected else 'off'} "
          f"coord-check={'on' if 'coordinate-outside-country' in expected else 'off'} "
          f"url-check={'on' if verify_urls else 'off'}")
    for f in failures:
        print(f"SELF-TEST FAIL: {f}")
    if not failures:
        print("SELF-TEST OK: every seeded defect was caught, the control stayed clean")
    return 1 if failures else 0


def write_report(dataset, issues, path):
    trips = dataset["trips"]
    errors = [i for i in issues if i.level == "ERROR"]
    warnings = [i for i in issues if i.level == "WARNING"]
    infos = [i for i in issues if i.level == "INFO"]
    by_region, by_type, by_country = coverage_stats(trips)
    by_code = collections.Counter(i.code for i in issues)

    lines = []
    lines.append("# Carta master dataset validation report\n")
    lines.append(f"Dataset: **{len(trips)} trips**, schema v{dataset['schemaVersion']}, "
                 f"generated {dataset['generated']}\n")
    lines.append(f"**{len(errors)} errors, {len(warnings)} warnings, {len(infos)} notices**\n")

    lines.append("## Issue counts by check\n")
    lines.append("| Check | Level | Count |")
    lines.append("|---|---|---|")
    level_of = {}
    for i in issues:
        level_of.setdefault(i.code, i.level)
    for code, n in by_code.most_common():
        lines.append(f"| `{code}` | {level_of[code]} | {n} |")
    lines.append("")

    if errors:
        lines.append("## Errors by check\n")
        grouped = collections.defaultdict(list)
        for i in errors:
            grouped[i.code].append(i)
        for code, items in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"### `{code}`: {len(items)} record(s)\n")
            for i in items[:40]:
                lines.append(f"- `{i.trip}`: {i.detail}")
            if len(items) > 40:
                lines.append(f"- …and {len(items) - 40} more (full list in validation-issues.json)")
            lines.append("")
    else:
        lines.append("## Errors\n\nNone. Every record satisfies the hard schema contract.\n")

    lines.append("## Warnings by check\n")
    grouped = collections.defaultdict(list)
    for i in warnings:
        grouped[i.code].append(i)
    for code, items in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"### `{code}`: {len(items)} record(s)\n")
        for i in items[:40]:
            lines.append(f"- `{i.trip}`: {i.detail}")
        if len(items) > 40:
            lines.append(f"- …and {len(items) - 40} more")
        lines.append("")

    if infos:
        lines.append("## Notices\n")
        grouped = collections.defaultdict(list)
        for i in infos:
            grouped[i.code].append(i)
        for code, items in sorted(grouped.items(), key=lambda kv: -len(kv[1])):
            lines.append(f"- `{code}`: {len(items)} record(s); "
                         f"e.g. `{items[0].trip}`: {items[0].detail}")
        lines.append("")

    lines.append("## Coverage\n")
    lines.append("| Region | Trips |")
    lines.append("|---|---|")
    for region, n in by_region.most_common():
        lines.append(f"| {C.REGIONS[region]} | {n} |")
    lines.append("")
    lines.append("| Trip type | Trips |")
    lines.append("|---|---|")
    for _i, name, _s in C.TRIP_TYPES:
        lines.append(f"| {name} | {by_type.get(name, 0)} |")
    lines.append("")
    lines.append("| Country | Trips |")
    lines.append("|---|---|")
    for country, n in sorted(by_country.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"| {country} | {n} |")
    lines.append("")

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(ROOT, "data", "trips.master.json"))
    ap.add_argument("--report", default=os.path.join(ROOT, "reports", "validation-report.md"))
    ap.add_argument("--json", default=os.path.join(ROOT, "reports", "validation-issues.json"))
    ap.add_argument("--wire", default=DEFAULT_WIRE,
                    help="continent-app/public/journeys; the shipped copy with the heroes")
    ap.add_argument("--check-urls", action="store_true",
                    help="HEAD every hero URL (network; CI does this, local runs may skip it)")
    ap.add_argument("--gazetteer", default=DEFAULT_GAZETTEER,
                    help="GeoNames cities500.txt; falls back to geonamescache when absent")
    ap.add_argument("--self-test", action="store_true",
                    help="plant one defect per K5 check in a copy of a clean trip and "
                         "confirm each is caught; writes no report")
    args = ap.parse_args()

    with open(args.data, encoding="utf-8") as fh:
        dataset = json.load(fh)

    places = load_place_index(args.gazetteer)
    if places is None:
        print(f"no gazetteer at {args.gazetteer} and geonamescache is not installed; "
              "place-outside-country skipped", file=sys.stderr)
    else:
        print(f"gazetteer: {places.source}, {len(places.anywhere)} names", file=sys.stderr)
    wire = load_wire(args.wire)
    if wire is None:
        print(f"no wire at {args.wire}; hero checks skipped", file=sys.stderr)

    if args.self_test:
        return self_test(dataset, places, args.check_urls)

    issues = validate(dataset, wire=wire, verify_urls=args.check_urls, places=places)
    write_report(dataset, issues, args.report)
    with open(args.json, "w", encoding="utf-8") as fh:
        json.dump([i.as_dict() for i in issues], fh, ensure_ascii=False, indent=2)

    errors = sum(1 for i in issues if i.level == "ERROR")
    warns = sum(1 for i in issues if i.level == "WARNING")
    infos = sum(1 for i in issues if i.level == "INFO")
    print(f"TRIPS:{len(dataset['trips'])}  ERRORS:{errors}  WARNINGS:{warns}  NOTICES:{infos}")
    print(f"report -> {args.report}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
