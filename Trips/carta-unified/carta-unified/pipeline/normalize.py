"""Raw record -> unified Carta trip record."""
from __future__ import annotations

import datetime as _dt
import re

import common as C


INGESTED_AT = _dt.date.today().isoformat()

_CODE_IN_PARENS = re.compile(r"\(([A-Z]{3})\)")
_CODE_AT_START = re.compile(r"^\s*([A-Z]{3})\b")
_CODE_BEFORE_NAME = re.compile(r"\b([A-Z]{3})\b\s*[—–-]")
_CODE_NEAR_AIRPORT = re.compile(r"\b([A-Z]{3})\b(?=[^.]{0,40}\b(?:Airport|airport)\b)")
_CODE_AFTER_FLY = re.compile(r"\b(?:Fly (?:to|into)|fly (?:to|into))\s+([A-Z]{3})\b")


def _airport_code(text):
    """Conservative IATA extraction — only patterns that really denote a code."""
    if not text:
        return None
    for rx in (_CODE_IN_PARENS, _CODE_AT_START, _CODE_BEFORE_NAME, _CODE_AFTER_FLY,
               _CODE_NEAR_AIRPORT):
        m = rx.search(text)
        if m:
            return m.group(1)
    return None


# ------------------------------------------------- type-specific refinement

_TS_PATTERNS = [
    ("surface", ("surface", "terrain split", "trail surface", "surface_mix", "terrain")),
    ("distanceKm", ("total distance", "total_distance_km", "weekly_distance_km",
                    "route_distance_km", "week distance", "nordic_network_km")),
    ("elevationM", ("max_elevation_m", "top_elevation_m", "summit_elevation_m",
                    "elevation_gain_m", "max elevation")),
    ("verticalM", ("weekly_vertical_m", "vertical_drop_m", "vertical")),
    ("technicalRating", ("technical_rating", "technical grade", "technical",
                         "safety markers and waymarking", "waymarking")),
    ("transitPass", ("transit_pass", "transit pass", "walkable blocks", "walkability")),
    ("hutBooking", ("hut-to-hut booking path", "hut_network", "hut booking", "hut")),
    ("liftNetwork", ("lift_network", "lift network and interconnects", "lift network",
                     "pass tiers by name", "lift_pass", "piste breakdown", "resort_profile")),
    ("snowReliability", ("snow_reliability", "snow reliability")),
    ("windConditions", ("wind_statistics", "wind statistics", "prevailing_wind",
                        "wind", "water_temp_c", "tidal_awareness")),
    ("gpxReady", ("gpx_ready", "gpx")),
    ("bookingTimeline", ("booking timeline", "reservation_only", "cultural booking timelines")),
    ("audience", ("who it suits", "pace")),
]

_NUM_RE = re.compile(r"(\d[\d,.]*)")


def _first_number(value):
    if isinstance(value, (int, float)):
        return value
    m = _NUM_RE.search(str(value))
    if not m:
        return None
    try:
        return int(m.group(1).replace(",", "").split(".")[0])
    except ValueError:
        return None


def derive_type_specific(raw_map: dict, snapshot: dict):
    """Fold the four batches' divergent type-detail keys onto canonical slots.

    Nothing is dropped: everything stays available under `raw`.
    """
    merged = dict(raw_map or {})
    for key in ("Total Distance / Terrain", "Who It Suits", "Total distance"):
        if snapshot.get(key):
            merged.setdefault(key, snapshot[key])
    out = {"raw": merged}
    for slot, needles in _TS_PATTERNS:
        out[slot] = None
        for key, value in merged.items():
            k = str(key).strip().lower()
            if any(n in k for n in needles):
                out[slot] = value
                break
    if out["gpxReady"] is not None and not isinstance(out["gpxReady"], bool):
        out["gpxReady"] = str(out["gpxReady"]).strip().lower() in ("true", "yes", "1")
    for slot in ("distanceKm", "elevationM", "verticalM"):
        if out[slot] is not None:
            out[slot] = _first_number(out[slot])
    for slot, value in list(out.items()):
        if slot != "raw" and isinstance(value, str):
            out[slot] = C.clean(value)
    return out


def _name_slug(raw):
    source_id = raw.get("sourceId") or ""
    title = raw.get("title") or ""
    tid, type_name, type_slug = C.canonical_trip_type(raw.get("tripType") or "")
    countries = C.split_countries(raw.get("country") or "")
    tokens = set()
    for c in countries:
        tokens.update(C.slugify(c).split("-"))
        tokens.add(C.COUNTRY_CODES[c].lower())
    tokens.update(type_slug.split("-"))
    tokens.update({"trips", "trip", "sports", "tours", "stays", "escapes",
                   "running", "towns", "alpine", "trekking", "scenic", "drives",
                   "coastal", "wine", "skiing", "hiking", "cycling", "city",
                   "cozy", "nature", "water", "winter", "culinary", "road",
                   "trail"})
    base = C.slugify(source_id) if source_id else C.slugify(title)
    parts = [p for p in base.split("-") if p and p not in tokens]
    if not parts:
        parts = [p for p in C.slugify(title).split("-") if p not in tokens][:5]
    return "-".join(parts[:6]) or C.slugify(title)[:40]


def _verify_flags(raw):
    flags = C.extract_verify_flags(raw.get("rawBody") or "")
    seen, out = set(), []
    for f in flags:
        k = f.lower()
        if k not in seen:
            seen.add(k)
            out.append(f)
    return out


def _best_period(raw):
    bp = raw.get("bestPeriod") or {}
    months = []
    raw_months = bp.get("monthsRaw")
    if isinstance(raw_months, list) and raw_months:
        for m in raw_months:
            if isinstance(m, int):
                months.append(m)
            else:
                months.extend(C.months_from_text(str(m)))
    text_pool = " ".join(str(x) for x in [bp.get("window"), bp.get("note"), bp.get("raw")] if x)
    if not months:
        months = C.months_from_text(text_pool)
    months = sorted(set(m for m in months if 1 <= m <= 12))
    return {
        "months": months,
        "monthNames": C.month_names(months),
        "window": C.clean(bp.get("window")),
        "note": C.clean(bp.get("note")),
        "avoid": C.clean(bp.get("avoid")),
        "raw": C.clean(bp.get("raw")),
    }


def _budget(raw):
    b = raw.get("budget") or {}
    breakdown = {}
    for key in ("accommodation", "food", "transport", "activities"):
        part = (b.get("breakdown") or {}).get(key) or {}
        breakdown[key] = {
            "lowEur": part.get("low"),
            "highEur": part.get("high"),
            "note": C.clean(part.get("note")),
        }
    total = b.get("totalEur") or {}
    low, high = total.get("low"), total.get("high")
    if low is None:
        lows = [v["lowEur"] for v in breakdown.values() if v["lowEur"] is not None]
        highs = [v["highEur"] for v in breakdown.values() if v["highEur"] is not None]
        if len(lows) == 4 and len(highs) == 4:
            low, high = sum(lows), sum(highs)
    return {
        "currency": "EUR",
        "totalEur": {"low": low, "high": high},
        "totalNote": C.clean(b.get("totalNote")),
        "breakdown": breakdown,
        "perDayEur": {
            "low": round(low / 7) if low else None,
            "high": round(high / 7) if high else None,
        },
    }


def build_record(raw: dict, seen_ids: set):
    tid, type_name, type_slug = C.canonical_trip_type(raw.get("tripType") or "")
    countries = C.split_countries(raw.get("country") or "")
    if not countries:
        raise ValueError(f"unmapped country {raw.get('country')!r} in {raw.get('sourceFile')}")
    primary = countries[0]
    cc = C.COUNTRY_CODES[primary]
    region_key = raw["batch"]

    base_id = f"{cc.lower()}-{type_slug}-{_name_slug(raw)}"
    trip_id, n = base_id, 2
    while trip_id in seen_ids:
        trip_id = f"{base_id}-{n}"
        n += 1
    seen_ids.add(trip_id)

    tier, tier_lo, tier_hi, tier_raw = C.parse_budget_tier(raw.get("budgetTierRaw"))
    score, label, note = C.parse_difficulty(raw.get("difficultyRaw"))
    if score is None:
        score, label, note2 = C.parse_difficulty(raw.get("fitnessLevelRaw"))
        note = note or note2
    # W&C carries an explicit fitness enum alongside the 1-5 integer
    fitness_raw = raw.get("fitnessLevelRaw")
    fitness = None
    if isinstance(fitness_raw, str) and fitness_raw.strip().title() in C.FITNESS_LEVELS:
        fitness = fitness_raw.strip().title()
    elif score is not None:
        fitness = {1: "Easy", 2: "Moderate", 3: "Active", 4: "Demanding", 5: "Expert"}[score]

    itinerary = []
    for day in raw.get("itinerary") or []:
        itinerary.append({
            "day": day["day"],
            "title": C.clean(day.get("title")),
            "morning": C.clean(day.get("morning")),
            "afternoon": C.clean(day.get("afternoon")),
            "evening": C.clean(day.get("evening")),
            "dayStats": C.clean(day.get("dayStats")),
            "sleep": C.clean(day.get("sleep")),
        })

    logistics = raw.get("logistics") or {}
    verify_flags = _verify_flags(raw)
    body = raw.get("rawBody") or ""

    snapshot = {C.clean(k): C.clean(v) for k, v in (raw.get("snapshot") or {}).items()}
    gateway = (raw.get("gatewayAirport")
               or snapshot.get("Getting There") or snapshot.get("Getting there"))
    if not gateway:
        candidate = logistics.get("gettingThere")
        # only promote prose to a gateway field when it actually names an airport
        if candidate and (re.search(r"\b[Aa]irport\b", candidate)
                          or _airport_code(candidate)):
            gateway = candidate

    # emergency: fall back to any logistics bullet that carries a rescue number
    emergency = logistics.get("emergency")
    if not emergency:
        pool = [o.get("text") for o in (logistics.get("other") or [])]
        pool += [logistics.get(k) for k in ("health", "permits", "transportRules")]
        for text in pool:
            if text and re.search(r"\b112\b|emergency|rescue|ambulance", text, re.I):
                emergency = text
                break

    emergency_number = raw.get("emergencyNumber")
    if not emergency_number:
        haystack = " ".join(str(v) for v in [emergency, logistics.get("health")] if v)
        m = re.search(r"\b(112|999|911)\b", haystack)
        emergency_number = m.group(1) if m else None

    summary = C.clean(raw.get("summary"))
    hook = C.clean(raw.get("hook"))
    summary_generated = False
    if not summary and hook:
        summary = hook if len(hook) <= 220 else hook[:217].rsplit(" ", 1)[0] + "…"
    if not summary:
        # composed from the record's own fields; flagged so editors can rewrite
        where = C.clean(raw.get("subRegion")) or primary
        summary = (f"A seven-day {type_name.lower().rstrip('s')} itinerary in "
                   f"{where}, {primary}.")
        summary_generated = True

    record = {
        "id": trip_id,
        "sourceId": raw.get("sourceId"),
        "slug": trip_id,
        "title": C.clean(raw.get("title")),
        "country": primary,
        "countryCode": cc,
        "countries": [{"name": c, "code": C.COUNTRY_CODES[c]} for c in countries],
        "isMultiCountry": len(countries) > 1,
        "region": C.REGIONS[region_key],
        "regionKey": region_key,
        "subRegion": C.clean(raw.get("subRegion")),
        "tripType": type_name,
        "tripTypeId": tid,
        "tripTypeSlug": type_slug,
        "durationDays": raw.get("durationDays") or 7,
        "bestPeriod": _best_period(raw),
        "budgetTier": tier,
        "budgetTierRange": [tier_lo, tier_hi] if tier_lo else None,
        "budgetTierRaw": tier_raw,
        "budget": _budget(raw),
        "profile": {
            "difficulty": score,
            "difficultyLabel": label,
            "difficultyNote": C.clean(note),
            "fitnessLevel": fitness,
            "crowdLevel": raw.get("crowdLevel"),
            "familyFriendly": raw.get("familyFriendly"),
            "carRequired": raw.get("carRequired"),
        },
        "basecamps": [C.clean(b) for b in (raw.get("basecamps") or []) if b],
        "gatewayAirport": C.clean(gateway),
        "gatewayAirportCode": _airport_code(gateway),
        "languages": raw.get("languages") or [],
        "currency": C.clean(raw.get("currency")),
        "emergencyNumber": emergency_number,
        "coordinates": raw.get("coordinates"),
        "tags": [C.slugify(t) for t in (raw.get("tags") or []) if t],
        "summary": summary,
        "summaryGenerated": summary_generated,
        "hook": hook,
        "snapshot": snapshot,
        "itinerary": itinerary,
        "accommodationStrategy": [
            {k: C.clean(v) if isinstance(v, str) else v for k, v in a.items()}
            for a in (raw.get("accommodationStrategy") or [])
        ],
        "logistics": {
            "connectivity": C.clean(logistics.get("connectivity")),
            "emergency": C.clean(emergency),
            "weather": C.clean(logistics.get("weather")),
            "bookingWindows": C.clean(logistics.get("bookingWindows")),
            "money": C.clean(logistics.get("money")),
            "transportRules": C.clean(logistics.get("transportRules")),
            "permits": C.clean(logistics.get("permits")),
            "health": C.clean(logistics.get("health")),
            "gettingThere": C.clean(logistics.get("gettingThere")),
            "other": [{"label": C.clean(o.get("label")), "text": C.clean(o.get("text"))}
                      for o in (logistics.get("other") or [])],
        },
        "proTips": [C.clean(p) for p in (raw.get("proTips") or []) if p],
        "typeSpecific": derive_type_specific(raw.get("typeSpecific") or {}, snapshot),
        "packingNotes": [C.clean(p) for p in (raw.get("packingNotes") or []) if p],
        "whatCouldGoWrong": [C.clean(p) for p in (raw.get("whatCouldGoWrong") or []) if p],
        "sources": {
            "verified": C.clean((raw.get("sources") or {}).get("verified")),
            "confidenceNotes": C.clean((raw.get("sources") or {}).get("confidenceNotes")),
        },
        "verifyFlags": verify_flags,
        "verifyFlagCount": len(verify_flags),
        "volatilePricing": bool(raw.get("verifyVolatile")) or bool(verify_flags),
        "wordCount": len(body.split()),
        "dataVintage": raw.get("dataVintage") or 2026,
        "provenance": {
            "batch": region_key,
            "sourceFile": raw.get("sourceFile"),
            "sourceFormat": raw.get("sourceFormat"),
            "sourceId": raw.get("sourceId"),
            "ingestedAt": INGESTED_AT,
            "synthesized": False,
        },
    }
    return record
