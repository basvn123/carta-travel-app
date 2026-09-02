"""Format-specific parsers for the four Carta source batches.

Each parser yields a *raw record* dict; normalize.build_record() turns that into
the unified schema. Raw records deliberately keep the source's own wording so
nothing is lost in translation.
"""
from __future__ import annotations

import os
import re

import yaml

import mdutil as md


DAY_HEADING = re.compile(r"^Day\s+(\d+)\s*[—–-]\s*(.+)$")


# --------------------------------------------------------------- day blocks

def parse_day_block(content: str):
    """Pull Morning / Afternoon / Evening / stats / sleep out of a day body.

    Handles both the '**Morning.** text' paragraph style (W&C, E&SE, Nordic)
    and the '- **Morning:** text' bullet style (S&Med).
    """
    fields = {}
    text = content.strip()
    labels = [
        ("morning", r"Morning"),
        ("afternoon", r"Afternoon"),
        ("evening", r"Evening"),
        ("dayStats", r"Day stats|Key numbers|Stats"),
        ("sleep", r"Sleep"),
    ]
    pattern = re.compile(
        r"^\s*(?:[-*]\s*)?\*\*(" + "|".join(p for _, p in labels) + r")[.:]?\*\*[:.]?\s*",
        re.M | re.I,
    )
    matches = list(pattern.finditer(text))
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        label = m.group(1).lower()
        key = next(k for k, p in labels if re.fullmatch(p, m.group(1), re.I))
        value = text[start:end].strip()
        value = re.sub(r"\s*\n\s*", " ", value).strip()
        fields[key] = value
    return fields


def parse_days(itinerary_text: str, level: int = 3):
    days = []
    for heading, content in md.sections(itinerary_text or "", level):
        m = DAY_HEADING.match(heading.strip())
        if not m:
            continue
        n = int(m.group(1))
        title = m.group(2).strip()
        # Nordic records carry the day's numbers in the heading parentheses
        stats_in_title = None
        tm = re.match(r"^(.*?)\s*\(([^)]*(?:km|m gain|elev|vertical|hours|h\b)[^)]*)\)\s*$",
                      title, re.I)
        if tm:
            title, stats_in_title = tm.group(1).strip(), tm.group(2).strip()
        block = parse_day_block(content)
        if stats_in_title and not block.get("dayStats"):
            block["dayStats"] = stats_in_title
        days.append({
            "day": n,
            "title": title,
            "morning": block.get("morning"),
            "afternoon": block.get("afternoon"),
            "evening": block.get("evening"),
            "dayStats": block.get("dayStats"),
            "sleep": block.get("sleep"),
        })
    days.sort(key=lambda d: d["day"])
    return days


# ----------------------------------------------------------- accommodation

def _split_name_style_location(heading: str):
    """'Hotel Altstadt Vienna — Design hotel, Kirchengasse, Neubau' and the
    '1. Kempinski — Pirin Street, Bansko (4/5-star)' variants."""
    h = re.sub(r"^\s*\d+[.)]\s*", "", heading.strip())
    style = location = None
    paren = re.search(r"\(([^)]+)\)\s*$", h)
    if paren:
        style = paren.group(1).strip()
        h = h[: paren.start()].strip()
    parts = re.split(r"\s*[—–]\s*", h, maxsplit=1)
    if len(parts) == 2:
        name, rest = parts[0].strip(), parts[1].strip()
        if style is None and "," in rest:
            style, location = [p.strip() for p in rest.split(",", 1)]
        elif style is None:
            # a lone trailing phrase is a style only if it reads like one
            style_words = ("hotel", "hostel", "guesthouse", "guest house", "apartment",
                           "self-catering", "b&b", "bed and breakfast", "inn", "lodge",
                           "cabin", "chalet", "hut", "refuge", "rifugio", "farmhouse",
                           "pension", "aparthotel", "campsite", "star", "design",
                           "boutique", "resort", "gîte", "agriturismo", "konak",
                           "villa", "hostal", "pousada", "albergue", "mountain")
            if any(w in rest.lower() for w in style_words):
                style = rest
            else:
                location = rest
        else:
            location = rest
    else:
        name = h
    return name.strip(), style, location


def parse_accommodation_headings(text: str, level: int):
    out = []
    for i, (heading, content) in enumerate(md.sections(text or "", level), start=1):
        name, style, location = _split_name_style_location(heading)
        body = re.sub(r"\s*\n\s*", " ", content.strip())
        booking = None
        bm = re.search(r"\*\*Book by:?\*\*[:.]?\s*(.+)$", body) or \
            re.search(r"(?:^|\s)Book:\s*(.+)$", body)
        if bm:
            booking = bm.group(1).strip()
            body = body[: bm.start()].strip()
        price = None
        pm = re.search(r"\*\*Approx\.?\*\*\s*([^*]+)", body)
        if pm:
            price = pm.group(1).strip(" .")
            body = body[: pm.start()].strip()
        body = re.sub(r"^Why it works:\s*", "", body).strip()
        out.append({
            "rank": i, "name": name, "style": style, "location": location,
            "description": body or None, "booking": booking, "priceNote": price,
        })
    return out


def parse_accommodation_bold(text: str):
    """S&Med style: '**1. Coco-Mat Athens BC — Boutique hotel, Falirou 5, Koukaki**'."""
    out = []
    blocks = re.split(r"\n(?=\*\*\d+\.)", (text or "").strip())
    for i, block in enumerate(blocks, start=1):
        block = block.strip()
        if not block.startswith("**"):
            continue
        m = re.match(r"\*\*(.+?)\*\*\s*(.*)$", block, re.S)
        if not m:
            continue
        name, style, location = _split_name_style_location(m.group(1))
        body = re.sub(r"\s*\n\s*", " ", m.group(2).strip())
        price = None
        pm = re.search(r"(€[\d,]+\s*[–-]\s*€?[\d,]+\.?)\s*$", body)
        if pm:
            price = pm.group(1).strip(" .")
        out.append({
            "rank": i, "name": name, "style": style, "location": location,
            "description": body or None, "booking": None, "priceNote": price,
        })
    return out


# ---------------------------------------------------------------- sections

def parse_logistics(text: str):
    from common import bucket_logistics
    logistics = {"connectivity": None, "emergency": None, "weather": None,
                 "bookingWindows": None, "money": None, "transportRules": None,
                 "permits": None, "health": None, "gettingThere": None,
                 "other": []}
    for item in md.bullet_items(text or ""):
        label, value = md.labelled_item(item)
        if label is None:
            logistics["other"].append({"label": None, "text": value})
            continue
        key = bucket_logistics(label)
        if key and not logistics.get(key):
            logistics[key] = value
        else:
            logistics["other"].append({"label": label, "text": value})
    return logistics


def parse_type_specific(text: str):
    out = {}
    for item in md.bullet_items(text or ""):
        label, value = md.labelled_item(item)
        if label:
            out[label.rstrip(":.")] = value
        else:
            out.setdefault("notes", []).append(value)
    return out


def parse_sources(text: str):
    verified, notes = None, None
    for item in md.bullet_items(text or ""):
        label, value = md.labelled_item(item)
        low = (label or "").lower()
        if low.startswith("verified"):
            verified = value
        elif "confidence" in low:
            notes = value
    if verified is None and notes is None and text:
        return {"verified": None, "confidenceNotes": re.sub(r"\s*\n\s*", " ", text.strip())}
    return {"verified": verified, "confidenceNotes": notes}


# =========================================================== batch parsers

def parse_western(root: str):
    """Western & Central Europe — one file per trip, YAML frontmatter."""
    trips_dir = os.path.join(root, "trips")
    for fname in sorted(os.listdir(trips_dir)):
        if not fname.endswith(".md"):
            continue
        path = os.path.join(trips_dir, fname)
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
        fm_text, body = md.split_frontmatter(text)
        fm = yaml.safe_load(fm_text) if fm_text else {}
        bb = fm.get("budget_breakdown") or {}

        def rng(key):
            v = bb.get(key)
            if isinstance(v, list) and len(v) == 2:
                return {"low": v[0], "high": v[1], "note": None}
            return {"low": None, "high": None, "note": None}

        total = fm.get("budget_total_eur") or [None, None]
        yield {
            "batch": "western-central",
            "sourceFormat": "md+yaml-frontmatter (one file per trip)",
            "sourceFile": f"cartatripsv1/trips/{fname}",
            "sourceId": fm.get("id"),
            "title": fm.get("title"),
            "country": fm.get("country"),
            "subRegion": fm.get("subregion"),
            "tripType": fm.get("trip_type"),
            "durationDays": fm.get("duration_days", 7),
            "bestPeriod": {
                "monthsRaw": fm.get("best_period"),
                "note": fm.get("best_period_note"),
                "window": None, "avoid": None, "raw": None,
            },
            "budgetTierRaw": fm.get("budget_tier"),
            "budget": {
                "totalEur": {"low": total[0], "high": total[1]},
                "totalNote": None,
                "breakdown": {
                    "accommodation": rng("accommodation_eur"),
                    "food": rng("food_eur"),
                    "transport": rng("transport_eur"),
                    "activities": rng("activities_eur"),
                },
            },
            "basecamps": [fm.get("basecamp")] if fm.get("basecamp") else [],
            "gatewayAirport": fm.get("gateway_airport"),
            "languages": fm.get("languages") or [],
            "currency": fm.get("currency"),
            "emergencyNumber": None,
            "difficultyRaw": fm.get("difficulty"),
            "fitnessLevelRaw": fm.get("fitness_level"),
            "crowdLevel": fm.get("crowd_level"),
            "familyFriendly": fm.get("family_friendly"),
            "carRequired": fm.get("car_required"),
            "tags": fm.get("tags") or [],
            "summary": fm.get("summary"),
            "hook": md.blockquote_hook(body),
            "coordinates": None,
            "dataVintage": fm.get("data_vintage", 2026),
            "snapshot": md.markdown_table(md.find_section(body, "Trip Snapshot")),
            "itinerary": parse_days(md.find_section(body, "Day-by-Day Itinerary"), 3),
            "accommodationStrategy": parse_accommodation_headings(
                md.find_section(body, "Accommodation Strategy"), 3),
            "logistics": parse_logistics(md.find_section(body, "Smart Logistics")),
            "proTips": md.bullet_items(md.find_section(body, "Pro-Tips")),
            "typeSpecific": {},
            "packingNotes": md.bullet_items(md.find_section(body, "Packing Notes")),
            "whatCouldGoWrong": md.bullet_items(md.find_section(body, "What Could Go Wrong")),
            "sources": {"verified": None, "confidenceNotes": None},
            "rawBody": body,
        }


def parse_eastern(root: str):
    """Eastern & Southeastern Europe — one file per trip, nested YAML frontmatter."""
    trips_dir = os.path.join(root, "trips")
    for fname in sorted(os.listdir(trips_dir)):
        if not fname.endswith(".md"):
            continue
        with open(os.path.join(trips_dir, fname), encoding="utf-8") as fh:
            text = fh.read()
        fm_text, body = md.split_frontmatter(text)
        fm = yaml.safe_load(fm_text) if fm_text else {}
        bp = fm.get("best_period") or {}
        bb = fm.get("budget_breakdown") or {}
        from common import parse_eur_range

        def rng(key):
            raw = bb.get(key)
            low, high = parse_eur_range(raw)
            return {"low": low, "high": high, "note": raw}

        tl, th = parse_eur_range(bb.get("total_estimate"))
        yield {
            "batch": "eastern-southeastern",
            "sourceFormat": "md+nested-yaml-frontmatter (one file per trip)",
            "sourceFile": f"cartaeasterneuropetrips/trips/{fname}",
            "sourceId": fm.get("id"),
            "title": fm.get("title"),
            "country": fm.get("country"),
            "subRegion": fm.get("sub_region"),
            "tripType": fm.get("trip_type"),
            "durationDays": fm.get("duration_days", 7),
            "bestPeriod": {
                "monthsRaw": bp.get("months"),
                "note": None,
                "window": bp.get("peak_window"),
                "avoid": bp.get("avoid"),
                "raw": None,
            },
            "budgetTierRaw": fm.get("budget_tier"),
            "budget": {
                "totalEur": {"low": tl, "high": th},
                "totalNote": bb.get("total_estimate"),
                "breakdown": {
                    "accommodation": rng("accommodation"),
                    "food": rng("food"),
                    "transport": rng("transport"),
                    "activities": rng("activities"),
                },
            },
            "basecamps": fm.get("base_towns") or [],
            "gatewayAirport": None,
            "languages": fm.get("languages") or [],
            "currency": fm.get("currency"),
            "emergencyNumber": str(fm.get("emergency_number")) if fm.get("emergency_number") else None,
            "difficultyRaw": fm.get("difficulty"),
            "fitnessLevelRaw": fm.get("difficulty"),
            "crowdLevel": None,
            "familyFriendly": None,
            "carRequired": None,
            "tags": fm.get("tags") or [],
            "summary": None,
            "hook": md.blockquote_hook(body),
            "coordinates": None,
            "dataVintage": 2026,
            "snapshot": md.markdown_table(md.find_section(body, "Trip Snapshot")),
            "itinerary": parse_days(md.find_section(body, "Day-by-Day Itinerary"), 3),
            "accommodationStrategy": parse_accommodation_headings(
                md.find_section(body, "Accommodation Strategy"), 3),
            "logistics": parse_logistics(md.find_section(body, "Smart Logistics")),
            "proTips": md.bullet_items(md.find_section(body, "Pro-Tips")),
            "typeSpecific": parse_type_specific(md.find_section(body, "Type-Specific Profile")),
            "packingNotes": [],
            "whatCouldGoWrong": [],
            "sources": parse_sources(md.find_section(body, "Sources & Confidence")),
            "rawBody": body,
        }


def parse_southern(root: str):
    """Southern & Mediterranean Europe — metadata as a '## Metadata' bullet list."""
    trips_dir = os.path.join(root, "trips")
    from common import parse_eur_range
    for fname in sorted(os.listdir(trips_dir)):
        if not fname.endswith(".md"):
            continue
        with open(os.path.join(trips_dir, fname), encoding="utf-8") as fh:
            body = fh.read()

        meta = {}
        for item in md.bullet_items(md.find_section(body, "Metadata") or ""):
            label, value = md.labelled_item(item)
            if label:
                meta[label.rstrip(":.").strip().lower()] = value

        # budget table lives under '### Budget Breakdown' inside the Metadata section
        budget_rows = {}
        meta_section = md.find_section(body, "Metadata") or ""
        for line in meta_section.split("\n"):
            if not line.strip().startswith("|"):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) < 2 or set("".join(cells)) <= set("-: "):
                continue
            key = re.sub(r"\*+", "", cells[0]).strip().lower()
            val = re.sub(r"\*+", "", cells[1]).strip()
            note = re.sub(r"\*+", "", cells[2]).strip() if len(cells) > 2 else None
            budget_rows[key] = (val, note)

        def row(*keys):
            for k in keys:
                for have, (val, note) in budget_rows.items():
                    if have.startswith(k):
                        low, high = parse_eur_range(val)
                        return {"low": low, "high": high, "note": note or val}
            return {"low": None, "high": None, "note": None}

        total_row = row("total")
        tl, th = total_row["low"], total_row["high"]
        if tl is None:
            tl, th = parse_eur_range(meta.get("budget_total_pp"))

        tags = [t.strip() for t in (meta.get("tags") or "").split(",") if t.strip()]
        yield {
            "batch": "southern-mediterranean",
            "sourceFormat": "md with '## Metadata' bullet block (one file per trip)",
            "sourceFile": f"carta-dataset/trips/{fname}",
            "sourceId": meta.get("trip_id") or fname[:-3],
            "title": meta.get("title"),
            "country": meta.get("country"),
            "subRegion": meta.get("sub_region"),
            "tripType": meta.get("trip_type"),
            "durationDays": 7,
            "bestPeriod": {
                "monthsRaw": None,
                "note": None,
                "window": meta.get("best_period"),
                "avoid": meta.get("avoid_period"),
                "raw": meta.get("best_period"),
            },
            "budgetTierRaw": meta.get("budget_tier"),
            "budget": {
                "totalEur": {"low": tl, "high": th},
                "totalNote": meta.get("budget_total_pp") or total_row.get("note"),
                "breakdown": {
                    "accommodation": row("accommodation"),
                    "food": row("food"),
                    "transport": row("transport"),
                    "activities": row("activities", "activity"),
                },
            },
            "basecamps": [],
            "gatewayAirport": meta.get("base_airport"),
            "languages": [],
            "currency": None,
            "emergencyNumber": None,
            "difficultyRaw": meta.get("fitness_level"),
            "fitnessLevelRaw": meta.get("fitness_level"),
            "crowdLevel": None,
            "familyFriendly": None,
            "carRequired": None,
            "tags": tags,
            "summary": re.sub(r"\s*\n\s*", " ", (md.find_section(body, "Trip Summary") or "").strip()) or None,
            "hook": md.blockquote_hook(body),
            "coordinates": None,
            "dataVintage": 2026,
            "snapshot": {},
            "itinerary": parse_days(md.find_section(body, "Day-by-Day Itinerary"), 3),
            "accommodationStrategy": parse_accommodation_bold(
                md.find_section(body, "Accommodation Strategy")),
            "logistics": parse_logistics(md.find_section(body, "Smart Logistics")),
            "proTips": md.bullet_items(md.find_section(body, "Pro-Tips")),
            "typeSpecific": parse_type_specific(md.find_section(body, "Type-Specific Profile")),
            "packingNotes": [],
            "whatCouldGoWrong": [],
            "sources": parse_sources(md.find_section(body, "Sources & Confidence")),
            "rawBody": body,
        }


NORDIC_RECORD = re.compile(r"^## Trip (\d{2}) [—–-] (.+)$", re.M)


def parse_northern(path: str):
    """Northern Europe & Baltics — 30 records inside one file, fenced YAML blocks."""
    from common import parse_eur_range
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    matches = list(NORDIC_RECORD.finditer(text))
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end].strip()
        number = m.group(1)
        ym = re.search(r"```yaml\s*\n(.*?)\n```", body, re.S)
        fm = yaml.safe_load(ym.group(1)) if ym else {}
        rest = body[ym.end():] if ym else body
        bb = fm.get("budget_breakdown") or {}

        def rng(key):
            raw = bb.get(key)
            low, high = parse_eur_range(raw)
            return {"low": low, "high": high, "note": raw}

        tl, th = parse_eur_range(bb.get("total_estimate"))
        coords = fm.get("coordinates") or None
        if isinstance(coords, dict) and coords.get("lat") is not None:
            coords = {"lat": float(coords["lat"]), "lon": float(coords["lon"])}
        else:
            coords = None
        core_keys = {
            "slug", "title", "country", "country_code", "region", "sub_region",
            "trip_type", "duration_days", "best_period", "months", "budget_tier",
            "budget_breakdown", "currency", "languages", "emergency_number",
            "coordinates", "base_towns", "difficulty", "verify", "tags",
            "gateway_airport", "summary",
        }
        type_specific = {k: v for k, v in fm.items()
                         if k not in core_keys and v is not None}
        yield {
            "batch": "northern-baltics",
            "sourceFormat": "single-file md, '## Trip NN' records with fenced YAML",
            "sourceFile": f"carta_northern_europe_baltics_trips.md#trip-{number}",
            "sourceId": fm.get("slug"),
            "title": fm.get("title") or m.group(2).strip(),
            "country": fm.get("country"),
            "subRegion": fm.get("sub_region"),
            "tripType": fm.get("trip_type"),
            "durationDays": fm.get("duration_days", 7),
            "bestPeriod": {
                "monthsRaw": fm.get("months"),
                "note": None,
                "window": fm.get("best_period"),
                "avoid": None,
                "raw": fm.get("best_period"),
            },
            "budgetTierRaw": fm.get("budget_tier"),
            "budget": {
                "totalEur": {"low": tl, "high": th},
                "totalNote": bb.get("total_estimate"),
                "breakdown": {
                    "accommodation": rng("accommodation"),
                    "food": rng("food"),
                    "transport": rng("transport"),
                    "activities": rng("activities"),
                },
            },
            "basecamps": fm.get("base_towns") or [],
            "gatewayAirport": fm.get("gateway_airport"),
            "languages": fm.get("languages") or [],
            "currency": fm.get("currency"),
            "emergencyNumber": str(fm.get("emergency_number")) if fm.get("emergency_number") else None,
            "difficultyRaw": fm.get("difficulty"),
            "fitnessLevelRaw": fm.get("difficulty"),
            "crowdLevel": None,
            "familyFriendly": None,
            "carRequired": None,
            "tags": fm.get("tags") or [],
            "summary": None,
            "hook": md.blockquote_hook(rest),
            "coordinates": coords,
            "dataVintage": 2026,
            "snapshot": {},
            "itinerary": parse_days(md.find_section(rest, "Day-by-Day Itinerary", level=3), 4),
            "accommodationStrategy": parse_accommodation_headings(
                md.find_section(rest, "Accommodation Strategy", level=3), 4),
            "logistics": parse_logistics(md.find_section(rest, "Smart Logistics", level=3)),
            "proTips": md.bullet_items(md.find_section(rest, "Pro-Tips", level=3)),
            "typeSpecific": type_specific,
            "packingNotes": [],
            "whatCouldGoWrong": [],
            "sources": {"verified": None, "confidenceNotes": None},
            "verifyVolatile": bool(fm.get("verify")),
            "rawBody": body,
        }
