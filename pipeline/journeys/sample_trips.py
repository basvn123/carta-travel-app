"""The five sample trips of the new trip styles (T431, owner 2026-10-15).

    python pipeline/journeys/sample_trips.py [--check]

The owner asked for five new kinds of trip (Hostel weeks, Beach weeks, Rail
journeys, Pilgrim routes, Island hopping) with one sample each, written so
every slot the redesigned trip page has is filled: structured day stats,
highlights with photographs, a photograph per day, the places each day
sleeps in with their coordinates. The samples are the worked example of
docs/ITEM_PAGE_DATA_CONTRACT.md; the owner audits them (register rows
T431-a to T431-e) before they are treated as researched.

What this does, idempotently:
  1. writes each sample into Trips/carta-unified/carta-unified/data/
     trips.master.json (replacing an earlier copy of the same id) and as
     data/trips/{id}.json, and adds the five styles to the master's
     tripTypes list, so a later full build_wire.py run reproduces them;
  2. resolves every photograph from the destination dossiers the app already
     ships (continent-app/public/dossier/{id}.json galleries: Commons files
     with author, licence and file page, checked when the dossiers were
     built), so nothing here is fetched or guessed;
  3. writes pipeline/journeys/samples.lock.json, the hero of each sample and
     the photograph of each new style, which build_wire.py reads as pins.

Every price is a sample figure in the house format ("EUR 10 to 15" in the
prose as the euro sign, "to" for a range, never a comma range) and every
trip carries `sample: true`, which keeps it out of the sitemap and the
prerender until the owner has audited it.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TRIPS = ROOT / "Trips" / "carta-unified" / "carta-unified"
MASTER = TRIPS / "data" / "trips.master.json"
TRIP_DIR = TRIPS / "data" / "trips"
DOSSIER = ROOT / "continent-app" / "public" / "dossier"
LOCK = Path(__file__).resolve().parent / "samples.lock.json"

NEW_TYPES = [
    (11, "Hostel weeks", "hostel"),
    (12, "Beach weeks", "beach-week"),
    (13, "Rail journeys", "rail"),
    (14, "Pilgrim routes", "pilgrim"),
    (15, "Island hopping", "island-hopping"),
]
TYPE_NAME = {slug: name for _, name, slug in NEW_TYPES}
TYPE_ID = {slug: i for i, _, slug in NEW_TYPES}

# The photograph of each new style: a dossier photo, (dossier id, index).
# These are views, not yet people doing the thing (docs/IMAGE_BRIEF.md
# "People doing the thing"); row T431-f asks the owner for those.
TYPE_PHOTOS = {
    "hostel": ("gem-kotor", 3),
    "beach-week": ("gem-makarska", 6),
    "rail": ("gem-bergun", 1),
    "pilgrim": ("SCQ", 3),
    "island-hopping": ("gem-naxos", 6),
}

_dossiers: dict = {}


def dossier(did: str) -> dict:
    if did not in _dossiers:
        _dossiers[did] = json.loads((DOSSIER / f"{did}.json").read_text(encoding="utf-8"))
    return _dossiers[did]


def photo(did: str, i: int, caption: str | None = None) -> dict:
    """One gallery photograph at 1280 px, with its credit, as the wire's
    photo shape {url, w, h, credit, page, author, licence}."""
    g = dossier(did)["gallery"][i]
    url = g["url"].replace("/960px-", "/1280px-")
    w, h = g.get("w"), g.get("h")
    if w and h:
        h = round(1280 * h / w)
        w = 1280
    else:
        w, h = 1280, 853
    return {
        "url": url,
        "w": w,
        "h": h,
        "credit": caption or g.get("caption") or dossier(did)["place"].get("name"),
        "page": g.get("page"),
        "author": g.get("author"),
        "licence": g.get("licence"),
    }


def place(did: str) -> tuple[float, float]:
    p = dossier(did)["place"]
    return p.get("lat"), p.get("lon")


def budget(acc, food, trans, act, days=7):
    rows = {"accommodation": acc, "food": food, "transport": trans, "activities": act}
    low = sum(r[0] for r in rows.values())
    high = sum(r[1] for r in rows.values())
    return {
        "currency": "EUR",
        "totalEur": {"low": low, "high": high},
        "totalNote": None,
        "breakdown": {k: {"lowEur": v[0], "highEur": v[1], "note": v[2] if len(v) > 2 else None}
                      for k, v in rows.items()},
        "perDayEur": {"low": round(low / days), "high": round(high / days)},
    }


def typed_stats(raw: dict) -> dict:
    """The schema v2.1 typed day line (schema/trip.generated.schema.json
    $defs/dayStats) plus the high point, which the trip page's climb chart
    reads: {mode, distanceKm, ascentM, descentM, highM, timeMin}."""
    hours = raw.get("hours")
    minutes = round(hours * 60) if hours is not None else None
    return {
        "mode": raw.get("mode"),
        "distanceKm": raw.get("km"),
        "ascentM": raw.get("ascentM"),
        "descentM": raw.get("descentM"),
        "highM": raw.get("highM"),
        "timeMin": {"low": minutes, "high": minutes} if minutes is not None else None,
    }


def day(n, title, morning, afternoon, evening, stats, sleep, sleep_ref, photo_ref, place_ref):
    return {
        "day": n,
        "title": title,
        "morning": morning,
        "afternoon": afternoon,
        "evening": evening,
        # The prose line the v2.0 readers parse, and the structured stats the
        # contract asks for (T431, ITEM_PAGE_DATA_CONTRACT.md "Trip day").
        "dayStats": stats["line"],
        "stats": typed_stats(stats),
        "sleep": sleep,
        "sleepRef": sleep_ref,
        "photo": photo(*photo_ref) if photo_ref else None,
        "place": place_ref,
    }


def sample(**k) -> dict:
    """The fields every trip record carries, with the sample's own on top."""
    days = k["itinerary"]
    cc = k["countryCode"]
    countries = k.get("countries") or [{"name": k["country"], "code": cc}]
    out = {
        "id": k["id"],
        "sourceId": k["id"],
        "slug": k["id"],
        "title": k["title"],
        "country": k["country"],
        "countryCode": cc,
        "countries": countries,
        "isMultiCountry": len(countries) > 1,
        "region": k["region"],
        "regionKey": k["regionKey"],
        "subRegion": k["subRegion"],
        "tripType": TYPE_NAME[k["slug"]],
        "tripTypeId": TYPE_ID[k["slug"]],
        "tripTypeSlug": k["slug"],
        "durationDays": len(days),
        "bestPeriod": k["bestPeriod"],
        "budgetTier": k["budgetTier"],
        "budgetTierRange": [len(k["budgetTier"]), len(k["budgetTier"])],
        "budgetTierRaw": k["budgetTier"],
        "budget": k["budget"],
        "profile": k["profile"],
        "basecamps": k.get("basecamps", []),
        "gatewayAirport": k["gatewayAirport"],
        "gatewayAirportCode": k["gatewayAirportCode"],
        "languages": k["languages"],
        "currency": k["currency"],
        "emergencyNumber": "112",
        "coordinates": k["coordinates"],
        "tags": k["tags"],
        "summary": k["summary"],
        "summaryGenerated": False,
        "hook": k["hook"],
        "snapshot": None,
        "itinerary": days,
        "accommodationStrategy": k["accommodationStrategy"],
        "logistics": k["logistics"],
        "proTips": k["proTips"],
        "typeSpecific": k["typeSpecific"],
        "packingNotes": k["packingNotes"],
        "whatCouldGoWrong": k["whatCouldGoWrong"],
        "sources": {
            "verified": None,
            "confidenceNotes": "Sample trip written for T431 to show every slot of the trip page. "
                               "Prices, timetables and opening details are to be audited by the owner.",
        },
        "verifyFlags": [],
        "verifyFlagCount": 0,
        "volatilePricing": False,
        "dataVintage": 2026,
        "provenance": {
            "batch": "t431-samples",
            "sourceFile": "pipeline/journeys/sample_trips.py",
            "sourceFormat": "python (sample)",
            "sourceId": k["id"],
            "ingestedAt": "2026-10-15",
            "synthesized": True,
        },
        # The contract fields (docs/ITEM_PAGE_DATA_CONTRACT.md).
        "sample": True,
        "highlights": k["highlights"],
        "photos": k["photos"],
        "dayPlaces": [
            {"day": d["day"], "name": d["place"][0], "lat": d["place"][1], "lon": d["place"][2]}
            for d in days if d.get("place")
        ],
    }
    for d in out["itinerary"]:
        d.pop("place", None)
    words = sum(len(str(v).split()) for v in json.dumps(out, ensure_ascii=False).split(",")) // 3
    out["wordCount"] = words
    return out


def hl(title, line, photo_ref, day_n):
    return {"title": title, "line": line, "photo": photo(*photo_ref), "day": day_n}


def samples() -> list[dict]:
    sjj, mostar, kotor = place("SJJ"), place("gem-mostar-ba"), place("gem-kotor")
    prg, vie, bts, bud = place("PRG"), place("VIE"), place("BTS"), place("BUD")
    mak, ath = place("gem-makarska"), place("ATH")
    par, ant, nax = place("gem-paros"), place("gem-antiparos"), place("gem-naxos")
    scq = place("SCQ")

    out = []

    # ── Hostel weeks: the Balkan backpacker loop ─────────────────────────
    out.append(sample(
        id="ba-hostel-sarajevo-mostar-kotor",
        slug="hostel",
        title="Sarajevo, Mostar and the Bay of Kotor in Hostel Beds",
        country="Bosnia and Herzegovina",
        countryCode="BA",
        countries=[{"name": "Bosnia and Herzegovina", "code": "BA"}, {"name": "Montenegro", "code": "ME"}],
        region="Southern & Mediterranean Europe",
        regionKey="southern-mediterranean",
        subRegion="Sarajevo, the Neretva valley and the Bay of Kotor",
        bestPeriod={"months": [5, 6, 9, 10], "monthNames": ["May", "June", "September", "October"],
                    "window": "May to June and September to October", "note": None,
                    "avoid": "July and August, when Mostar passes 38 °C and cruise ships fill Kotor",
                    "raw": "May to June, September to October"},
        budgetTier="€",
        budget=budget((90, 150, "Dorm beds from €15 a night, six nights"),
                      (100, 170, "Bakeries, ćevapi and market lunches"),
                      (60, 90, "Train to Mostar, bus to Kotor, city buses"),
                      (50, 90, "Tunnel museum, Blagaj and Kravica day, Kotor walls")),
        profile={"difficulty": 2, "difficultyLabel": "Easy", "difficultyNote": "2/5, city walking and one 1,350 step climb above Kotor",
                 "fitnessLevel": "Easy", "crowdLevel": "Moderate", "familyFriendly": None, "carRequired": False},
        gatewayAirport="SJJ Sarajevo, 30 min to the old town by bus; TIV Tivat or DBV Dubrovnik for the way home",
        gatewayAirportCode="SJJ",
        languages=["Bosnian", "Montenegrin", "English"],
        currency="BAM and EUR",
        coordinates={"lat": sjj[0], "lon": sjj[1], "precision": "city", "matchedPlace": "Sarajevo", "source": "dossier"},
        tags=["hostel", "backpacker", "train", "old-towns", "balkans", "budget"],
        summary=("Three of the best value old towns in Europe, joined by one of its most beautiful train rides. "
                 "The week starts in **Sarajevo**, where Ottoman lanes meet Austro-Hungarian avenues, rides the "
                 "Neretva canyon line to **Mostar** and its rebuilt **Stari Most**, then crosses to Montenegro for "
                 "the walled town of **Kotor** at the head of its fjord-like bay. Every night is a social hostel "
                 "with a dorm bed under €20."),
        hook="Three old towns, one canyon train and six nights in dorms for under €150.",
        itinerary=[
            day(1, "Sarajevo, the old bazaar",
                "Bus 200 from the airport to the centre takes about 30 minutes. Drop your bag and walk **Baščaršija**, the copper-smiths' lanes and the Sebilj fountain.",
                "Free walking tour from the Eternal Flame, about two and a half hours, tips only. It covers the **Latin Bridge** and the 1914 assassination corner.",
                "Ćevapi at a buregdžinica for about €6, then the view over the city from the **Yellow Fortress** at sunset.",
                {"line": "City walking, about 8 km", "km": 8, "hours": 4, "mode": "walk"},
                "Hostel in Baščaršija", 1, ("SJJ", 3), ("Sarajevo", *sjj)),
            day(2, "Sarajevo, the siege and the hills",
                "Tram and bus to the **Tunnel of Hope** museum, the 800 m lifeline under the airport runway during the siege. Entry about €10.",
                "The **War Childhood Museum**, small and unforgettable, then the cable car up Trebević to the abandoned 1984 Olympic bobsleigh track.",
                "Coffee the Bosnian way in a džezva, then a bar crawl in the hostel quarter.",
                {"line": "City walking, about 9 km", "km": 9, "hours": 5, "mode": "walk"},
                "Hostel in Baščaršija", 1, ("SJJ", 7), ("Sarajevo", *sjj)),
            day(3, "The Neretva canyon train to Mostar",
                "The 07:15 train to Mostar takes about two hours through the Neretva canyon, the most scenic line in the Balkans. Tickets about €10 at the station.",
                "Walk the old town to **Stari Most** and watch the divers, who jump 21 m into the river once the hat has collected enough.",
                "Sunset from the **Kriva Ćuprija**, the small crooked bridge, and dinner on a terrace over the river.",
                {"line": "Train 2 h, city walking 6 km", "km": 6, "hours": 3, "mode": "train"},
                "Hostel in the old town of Mostar", 2, ("gem-mostar-ba", 1), ("Mostar", *mostar)),
            day(4, "Blagaj, Počitelj and the Kravica falls",
                "Hostels run a shared minibus day for about €35. First stop the **Blagaj Tekke**, a dervish house under a cliff at the source of the Buna.",
                "The stone village of **Počitelj**, then a swim under the **Kravica** waterfalls, warm enough from late May.",
                "Back in Mostar for grilled trout and the evening light on the bridge.",
                {"line": "Minibus day, about 110 km", "km": 110, "hours": 8, "mode": "bus"},
                "Hostel in the old town of Mostar", 2, ("gem-mostar-ba", 0), ("Mostar", *mostar)),
            day(5, "Over the mountains to Kotor",
                "The morning bus to Kotor takes five to six hours through Trebinje and Herceg Novi, about €25. Sit on the right for the bay.",
                "Arrive in **Kotor**, drop your bag and get lost in the marble lanes of the walled town.",
                "Sunset drink on the walls by the Sea Gate, then burek from the bakery by the North Gate.",
                {"line": "Bus 5 h 30 min, 190 km", "km": 190, "hours": 5.5, "mode": "bus"},
                "Hostel inside Kotor's walls", 3, ("gem-kotor", 0), ("Kotor", *kotor)),
            day(6, "The walls of Kotor and Perast",
                "Climb the **Fortifications of Kotor** early, 1,350 steps and 260 m to San Giovanni, about €15 in season. Go before 08:00 for the light and the shade.",
                "Local bus to **Perast** for about €2, then the boat to **Our Lady of the Rocks**, an island church built on sunken ships.",
                "Last night: grilled squid by the harbour and the hostel's rooftop.",
                {"line": "Walk 8 km, climb 260 m", "km": 8, "ascentM": 260, "descentM": 260, "highM": 280, "hours": 4, "mode": "walk"},
                "Hostel inside Kotor's walls", 3, ("gem-kotor", 3), ("Kotor", *kotor)),
            day(7, "Budva beach, then home",
                "Bus to **Budva** in 40 minutes for a last swim at the old town beach.",
                "Bus to Tivat airport in 30 minutes, or two hours to Dubrovnik for more flights.",
                None,
                {"line": "Bus 40 min, beach day", "km": 25, "hours": 1, "mode": "bus"},
                None, None, ("gem-budva", 0), ("Budva", *place("gem-budva"))),
        ],
        accommodationStrategy=[
            {"rank": 1, "name": "Hostel in Baščaršija", "style": "hostel", "location": "Sarajevo old town",
             "description": "Pick one inside the bazaar quarter with a kitchen and a common room; most run the free walking tour and evening outings.",
             "booking": "two weeks ahead for weekends", "priceNote": "€15 to €20 a dorm bed"},
            {"rank": 2, "name": "Hostel in the old town of Mostar", "style": "hostel", "location": "Mostar, 5 minutes from Stari Most",
             "description": "Family-run hostels here sell the Blagaj and Kravica day and often include breakfast.",
             "booking": "a week ahead", "priceNote": "€14 to €20 a dorm bed"},
            {"rank": 3, "name": "Hostel inside Kotor's walls", "style": "hostel", "location": "Kotor old town",
             "description": "Two well-known hostels sit inside the walls, so the fortress climb starts at your door.",
             "booking": "three weeks ahead in summer", "priceNote": "€18 to €28 a dorm bed"},
        ],
        logistics={
            "connectivity": "Montenegro and Bosnia are outside EU roaming; buy a local prepaid SIM for about €5 or use hostel wifi.",
            "emergency": "112 works in both countries.",
            "weather": "Mostar is one of the hottest towns in Europe in July; carry water on the minibus day.",
            "bookingWindows": "The Sarajevo to Mostar train has no seat reservations; arrive 20 minutes early in summer.",
            "money": "Bosnia uses the convertible mark (BAM, about €0.51); Montenegro uses the euro. Small places are cash only.",
            "transportRules": "Buses charge about €1 to €2 for each bag in the hold; keep coins.",
            "permits": None,
            "health": "Tap water is safe in all three towns.",
            "gettingThere": "Fly into Sarajevo and out of Tivat or Dubrovnik to avoid doubling back.",
            "other": [],
        },
        proTips=[
            "Take the Sarajevo to Mostar train, not the bus: same price, half the bends and the canyon views.",
            "Climb Kotor's walls before 08:00; the ticket booth opens later and the steps are in shade.",
            "Pay for Blagaj and Kravica through the hostel; the shared minibus is cheaper than two buses and a taxi.",
        ],
        typeSpecific={"raw": {"Who It Suits": "Solo travellers and friends on a first Balkan trip"},
                      "surface": None, "distanceKm": None, "elevationM": None, "verticalM": None,
                      "technicalRating": None, "transitPass": None, "hutBooking": None, "liftNetwork": None,
                      "snowReliability": None, "windConditions": None, "gpxReady": False,
                      "bookingTimeline": "Hostels two to three weeks ahead from June", "audience": "Solo and budget travellers, 18 to 35"},
        packingNotes=["A padlock for the hostel lockers", "Flip-flops for shared showers",
                      "A shawl or long sleeves for the mosques", "Water shoes for Kravica"],
        whatCouldGoWrong=["The Mostar train can be replaced by a bus at short notice; check the station board the day before.",
                          "The border at Debeli Brijeg can add an hour on summer weekends."],
        highlights=[
            hl("Stari Most at sunset", "The rebuilt Ottoman bridge, with divers leaping 21 m into the Neretva.", ("gem-mostar-ba", 1), 3),
            hl("The canyon train", "Two hours along the emerald Neretva for about €10.", ("gem-mostar-ba", 0), 3),
            hl("Kotor from its walls", "1,350 steps to San Giovanni and the whole bay below.", ("gem-kotor", 3), 6),
            hl("Baščaršija", "Copper lanes, coffee in a džezva and ćevapi for €6.", ("SJJ", 0), 1),
            hl("Our Lady of the Rocks", "An island church built on scuttled ships, by boat from Perast.", ("gem-kotor", 4), 6),
        ],
        photos=[photo("gem-mostar-ba", 1), photo("SJJ", 0), photo("gem-kotor", 0), photo("gem-kotor", 3), photo("SJJ", 3)],
    ))

    # ── Beach weeks: a family base on the Makarska Riviera ───────────────
    out.append(sample(
        id="hr-beach-week-makarska-riviera",
        slug="beach-week",
        title="A Family Beach Week on the Makarska Riviera",
        country="Croatia",
        countryCode="HR",
        region="Southern & Mediterranean Europe",
        regionKey="southern-mediterranean",
        subRegion="Makarska Riviera, Split-Dalmatia",
        bestPeriod={"months": [6, 7, 8, 9], "monthNames": ["June", "July", "August", "September"],
                    "window": "June to September, sea above 22 °C", "note": "Late June and September are calmer and cheaper.",
                    "avoid": "October to April, when most beach bars and boats stop", "raw": "June to September"},
        budgetTier="€€",
        budget=budget((210, 350, "An apartment for four, shared, six nights"),
                      (140, 220, "Self-catering breakfasts and lunches, konoba dinners"),
                      (40, 70, "Bus from Split, boat to Bol, local buses"),
                      (60, 110, "Biokovo Skywalk, boat day, Cetina canyon")),
        profile={"difficulty": 1, "difficultyLabel": "Easy", "difficultyNote": "1/5, beaches and short walks; every day trip suits children from 5",
                 "fitnessLevel": "Easy", "crowdLevel": "High", "familyFriendly": True, "carRequired": False},
        basecamps=["Makarska"],
        gatewayAirport="SPU Split, 1 h 45 min to Makarska by bus",
        gatewayAirportCode="SPU",
        languages=["Croatian", "English", "German"],
        currency="EUR",
        coordinates={"lat": mak[0], "lon": mak[1], "precision": "city", "matchedPlace": "Makarska", "source": "dossier"},
        tags=["beach", "family", "one-base", "boat", "snorkel", "croatia"],
        summary=("One apartment, no packing up, and a different beach every day. **Makarska** sits between the "
                 "pine-backed pebble coves of the riviera and the wall of **Biokovo** behind it, with a boat to "
                 "**Zlatni Rat** on Brač and the **Cetina** canyon at Omiš within an hour. Shallow pebble shelves, "
                 "lifeguards on the town beach and ice cream on every promenade."),
        hook="Seven days, one apartment, five beaches and a glass skywalk 1,228 m above the sea.",
        itinerary=[
            day(1, "Arrive and settle in",
                "Bus from Split airport or the bus station to **Makarska**, about 1 h 45 min, from €10.",
                "Unpack, find the supermarket and walk the **Makarska** promenade to the town beach.",
                "Pizza on the harbour and a first swim off the Sveti Petar peninsula.",
                {"line": "Bus 1 h 45 min, then rest", "km": 70, "hours": 2, "mode": "bus"},
                "Apartment in Makarska", 1, ("gem-makarska", 0), ("Makarska", *mak)),
            day(2, "The town beach and the Sveti Petar woods",
                "Morning on the main beach, shallow pebbles and lifeguards in summer.",
                "Shaded walk round the **Sveti Petar** peninsula to the lighthouse, 2 km on a flat path.",
                "Fish platter at a konoba in the old town.",
                {"line": "Beach day, walk 2 km", "km": 2, "hours": 1, "mode": "walk"},
                "Apartment in Makarska", 1, ("gem-makarska", 5), ("Makarska", *mak)),
            day(3, "Punta Rata at Brela",
                "Bus to **Brela** in 20 minutes for **Punta Rata**, often named the most beautiful beach in Europe.",
                "Picnic under the pines, then snorkel round the rock with its single pine.",
                "Back by bus or the coastal path, 8 km, for older children.",
                {"line": "Bus 20 min, beach day", "km": 14, "hours": 1, "mode": "bus"},
                "Apartment in Makarska", 1, ("gem-makarska", 6), ("Brela", 43.37, 16.93)),
            day(4, "Boat day to Zlatni Rat on Brač",
                "Summer excursion boats leave Makarska harbour for **Bol** on Brač, about 1 h, around €35 an adult and half for children.",
                "**Zlatni Rat**, the horn-shaped spit that moves with the wind, and warm shallow water on both sides.",
                "Boat back at about 17:00; early night.",
                {"line": "Boat 1 h each way", "km": 40, "hours": 2, "mode": "ferry"},
                "Apartment in Makarska", 1, ("gem-makarska", 7), ("Bol", 43.26, 16.65)),
            day(5, "Biokovo Skywalk",
                "Shuttle up the **Biokovo** nature park road to the glass **Skywalk** at 1,228 m, booked the day before. Park ticket about €20 to €30 an adult in season.",
                "Back down for a lazy afternoon on **Nugal** beach, or the town beach with small children.",
                "Ice cream and the evening promenade.",
                {"line": "Shuttle up 1,228 m, beach afternoon", "km": 46, "highM": 1228, "hours": 4, "mode": "bus"},
                "Apartment in Makarska", 1, ("gem-makarska", 1), ("Biokovo", 43.32, 17.06)),
            day(6, "The Cetina canyon at Omiš",
                "Bus to **Omiš** in 40 minutes; family rafting on the **Cetina** runs from age 5 with a guide, about €30.",
                "Lunch in Omiš old town under the pirate fortress.",
                "Last sunset swim at Makarska.",
                {"line": "Bus 40 min, rafting 3 h", "km": 60, "hours": 4, "mode": "bus"},
                "Apartment in Makarska", 1, ("gem-makarska", 2), ("Omiš", 43.44, 16.69)),
            day(7, "Back to Split",
                "A last morning swim, then the bus to Split, 1 h 45 min.",
                "Two hours in **Diocletian's Palace** before the airport bus if flights allow.",
                None,
                {"line": "Bus 1 h 45 min", "km": 70, "hours": 2, "mode": "bus"},
                None, None, ("SPU", 1), ("Split", *place("SPU"))),
        ],
        accommodationStrategy=[
            {"rank": 1, "name": "Apartment in Makarska", "style": "apartment", "location": "Makarska, 10 minutes from the beach",
             "description": "A two-bedroom apartment with a kitchen and a balcony sleeps four; the price is shared by the party.",
             "booking": "two to three months ahead for July and August", "priceNote": "€90 to €150 a night for the apartment"},
        ],
        logistics={
            "connectivity": "EU roaming works; 4G everywhere on the coast.",
            "emergency": "112; lifeguards on Makarska town beach from June to September.",
            "weather": "The bora can close boats on two or three days a summer; keep the boat day flexible.",
            "bookingWindows": "Skywalk shuttles and rafting book out in August; book a day or two ahead.",
            "money": "Euro; cards work almost everywhere, boats prefer cash.",
            "transportRules": "Children under 6 travel free on most local buses; excursion boats charge half for 3 to 12.",
            "permits": None,
            "health": "Pebble beaches: water shoes save tears.",
            "gettingThere": "Fly to Split; the airport bus links to the coastal buses south.",
            "other": [],
        },
        proTips=["Pick an apartment on the Sveti Petar side: shade in the afternoon and a shorter walk to the quiet coves.",
                 "Go to Punta Rata before 10:00 for space under the pines."],
        typeSpecific={"raw": {"Who It Suits": "Families with children from 3 to 14"},
                      "surface": None, "distanceKm": None, "elevationM": 1228, "verticalM": None,
                      "technicalRating": None, "transitPass": None, "hutBooking": None, "liftNetwork": None,
                      "snowReliability": None, "windConditions": "Bora can stop boats for a day", "gpxReady": False,
                      "bookingTimeline": "Apartment two to three months ahead for July and August", "audience": "Families"},
        packingNotes=["Water shoes for the pebbles", "Snorkel masks", "Sun hats and rash vests", "A beach umbrella or rent one"],
        whatCouldGoWrong=["The bora can cancel the Bol boat; swap it with the Cetina day.",
                          "August beaches fill by 11:00; go early or after 16:00."],
        highlights=[
            hl("Punta Rata", "Turquoise water and one pine on a rock, 20 minutes by bus.", ("gem-makarska", 6), 3),
            hl("Zlatni Rat by boat", "The golden horn of Brač, warm shallows on both sides.", ("gem-makarska", 7), 4),
            hl("Biokovo Skywalk", "A glass platform 1,228 m above the riviera.", ("gem-makarska", 1), 5),
            hl("Makarska promenade", "Ice cream, palm trees and a lifeguarded town beach.", ("gem-makarska", 0), 1),
        ],
        photos=[photo("gem-makarska", 0), photo("gem-makarska", 6), photo("gem-makarska", 1), photo("gem-makarska", 5)],
    ))

    # ── Rail journeys: Prague, Vienna, Bratislava, Budapest ──────────────
    out.append(sample(
        id="cz-rail-prague-vienna-budapest",
        slug="rail",
        title="Prague, Vienna and Budapest by Train",
        country="Czechia",
        countryCode="CZ",
        countries=[{"name": "Czechia", "code": "CZ"}, {"name": "Austria", "code": "AT"},
                   {"name": "Slovakia", "code": "SK"}, {"name": "Hungary", "code": "HU"}],
        region="Western & Central Europe",
        regionKey="western-central",
        subRegion="Bohemia, Vienna, Bratislava and Budapest",
        bestPeriod={"months": [4, 5, 6, 9, 10, 12], "monthNames": ["April", "May", "June", "September", "October", "December"],
                    "window": "April to June, September to October, and December for the markets", "note": None,
                    "avoid": "Mid-July to August heat and peak hostel prices", "raw": "Spring, autumn, December"},
        budgetTier="€€",
        budget=budget((140, 300, "Hostels and budget hotels, six nights"),
                      (140, 230, "Bakeries, beer halls, market lunches"),
                      (70, 130, "Three trains booked ahead, city transport"),
                      (60, 120, "Opera standing place, thermal bath, castles")),
        profile={"difficulty": 1, "difficultyLabel": "Easy", "difficultyNote": "1/5, city walking and three train rides of 1 to 4 hours",
                 "fitnessLevel": "Easy", "crowdLevel": "High", "familyFriendly": True, "carRequired": False},
        gatewayAirport="PRG Prague, 35 min to the centre by bus and metro; home from BUD Budapest",
        gatewayAirportCode="PRG",
        languages=["Czech", "German", "Slovak", "Hungarian", "English"],
        currency="CZK, EUR, HUF",
        coordinates={"lat": prg[0], "lon": prg[1], "precision": "city", "matchedPlace": "Prague", "source": "dossier"},
        tags=["train", "car-free", "capitals", "danube", "interrail", "cafes"],
        summary=("Four capitals, three easy trains and no car. **Prague** for its bridges and beer, **Vienna** for "
                 "coffee houses and a €15 opera ticket, **Bratislava** for an afternoon on the Danube and "
                 "**Budapest** for its thermal baths. Booked a few weeks ahead, every train costs less than a taxi "
                 "to the airport."),
        hook="Four capitals in seven days, three trains for under €60 booked ahead.",
        itinerary=[
            day(1, "Prague old town",
                "Bus 59 and metro from the airport, about 35 minutes. Walk to **Old Town Square** for the astronomical clock.",
                "**Charles Bridge** and the Lesser Town lanes below the castle.",
                "Dinner and a 0.5 l Pilsner for under €3 in a Vinohrady beer hall.",
                {"line": "City walking, about 8 km", "km": 8, "hours": 4, "mode": "walk"},
                "Hostel in Prague", 1, ("PRG", 7), ("Prague", *prg)),
            day(2, "Prague Castle and Petřín",
                "**Prague Castle** grounds and St Vitus nave are free to walk; the combined ticket is optional.",
                "Down through the gardens to **Petřín** hill and its mirror maze, then the river.",
                "Jazz in a cellar, or the **Dancing House** terrace at sunset.",
                {"line": "City walking, about 10 km, 130 m up", "km": 10, "ascentM": 130, "hours": 5, "mode": "walk"},
                "Hostel in Prague", 1, ("PRG", 1), ("Prague", *prg)),
            day(3, "Railjet to Vienna",
                "Railjet from Prague hlavní nádraží to Vienna in about 4 hours, from €20 booked ahead.",
                "Check in, then **Naschmarkt** for a late lunch.",
                "Standing place at the **Vienna State Opera**, from about €15, sold 80 minutes before curtain.",
                {"line": "Train 4 h, 330 km", "km": 330, "hours": 4, "mode": "train"},
                "Budget hotel in Vienna", 2, ("VIE", 4), ("Vienna", *vie)),
            day(4, "Vienna, palaces and coffee",
                "**Schönbrunn** gardens and the Gloriette, free; the palace tour is extra.",
                "The **Hofburg** and the Museum quarter, then cake in a classic café.",
                "Heuriger wine tavern in Grinzing by tram 38.",
                {"line": "City walking, about 11 km", "km": 11, "hours": 5, "mode": "walk"},
                "Budget hotel in Vienna", 2, ("VIE", 1), ("Vienna", *vie)),
            day(5, "Bratislava on the way",
                "Regional train to **Bratislava** in about 1 h, around €12 return-free single.",
                "**Bratislava Castle**, the old town and the UFO bridge over the Danube; leave bags in station lockers.",
                "Evening train on to **Budapest**, about 2 h 30 min, from €15.",
                {"line": "Trains 1 h and 2 h 30 min", "km": 260, "hours": 3.5, "mode": "train"},
                "Hostel in Budapest", 3, ("BTS", 1), ("Bratislava", *bts)),
            day(6, "Budapest baths and bridges",
                "**Széchenyi** thermal baths in the city park, about €30 for the day.",
                "**Heroes' Square** and **Andrássy út** back to the **Parliament** on the river.",
                "Ruin bars of the Jewish quarter.",
                {"line": "City walking, about 9 km", "km": 9, "hours": 4, "mode": "walk"},
                "Hostel in Budapest", 3, ("BUD", 1), ("Budapest", *bud)),
            day(7, "Buda Castle, then home",
                "Funicular or the stairs to **Buda Castle** and Fisherman's Bastion.",
                "Bus 100E to the airport, about 35 minutes.",
                None,
                {"line": "City walking, about 5 km", "km": 5, "ascentM": 60, "hours": 3, "mode": "walk"},
                None, None, ("BUD", 2), ("Budapest", *bud)),
        ],
        accommodationStrategy=[
            {"rank": 1, "name": "Hostel in Prague", "style": "hostel", "location": "Prague New Town",
             "description": "Pick one within walking distance of the main station for the morning train.",
             "booking": "three weeks ahead", "priceNote": "€18 to €30 a dorm bed, €60 to €90 a private double"},
            {"rank": 2, "name": "Budget hotel in Vienna", "style": "budget hotel", "location": "Vienna, near the Westbahnhof or Hauptbahnhof",
             "description": "Vienna's hostels are large and clean; budget hotels near the stations are close in price for two.",
             "booking": "three weeks ahead", "priceNote": "€25 to €40 a dorm bed, €80 to €120 a double"},
            {"rank": 3, "name": "Hostel in Budapest", "style": "hostel", "location": "Budapest District VII",
             "description": "The Jewish quarter is the hostel quarter, steps from the ruin bars.",
             "booking": "two weeks ahead", "priceNote": "€15 to €25 a dorm bed"},
        ],
        logistics={
            "connectivity": "EU roaming works in all four countries.",
            "emergency": "112 everywhere.",
            "weather": "Danube summers are hot and continental; spring and autumn are best for walking.",
            "bookingWindows": "Railjet and EuroCity fares rise as the date nears; book 3 to 6 weeks ahead on the operators' sites.",
            "money": "Three currencies: koruna, euro, forint. Cards work almost everywhere; skip exchange booths.",
            "transportRules": "An Interrail Global pass rarely pays for three short trains; buy point to point.",
            "permits": None,
            "health": None,
            "gettingThere": "Fly into Prague and out of Budapest; open-jaw tickets often cost the same as a return.",
            "other": [],
        },
        proTips=["Use the station lockers in Bratislava hlavná stanica so the stopover costs nothing but time.",
                 "Buy the Vienna 24 or 48 hour transport ticket only if you plan more than four rides a day."],
        typeSpecific={"raw": {"Who It Suits": "First trips by train, couples, friends, families with older children"},
                      "surface": None, "distanceKm": 590, "elevationM": None, "verticalM": None,
                      "technicalRating": None, "transitPass": "Point-to-point tickets beat a pass for this route", "hutBooking": None, "liftNetwork": None,
                      "snowReliability": None, "windConditions": None, "gpxReady": False,
                      "bookingTimeline": "Trains 3 to 6 weeks ahead", "audience": "Car-free travellers"},
        packingNotes=["A day bag for the Bratislava stop", "Flip-flops and a towel for the baths", "A smart layer for the opera"],
        whatCouldGoWrong=["Track work can replace a train with a bus on Sundays; check the operator's site the day before."],
        highlights=[
            hl("Charles Bridge at dawn", "Prague's Gothic bridge before the crowds, statues against the castle.", ("PRG", 2), 1),
            hl("€15 at the opera", "Standing places at the Vienna State Opera, sold on the night.", ("VIE", 4), 3),
            hl("Széchenyi baths", "Outdoor thermal pools in a palace, steaming even in winter.", ("BUD", 0), 6),
            hl("Bratislava Castle", "A Danube capital in an afternoon between two trains.", ("BTS", 1), 5),
        ],
        photos=[photo("PRG", 2), photo("BUD", 0), photo("VIE", 0), photo("BTS", 0)],
    ))

    # ── Pilgrim routes: the last 100 km of the Camino Francés ────────────
    out.append(sample(
        id="es-pilgrim-camino-sarria-santiago",
        slug="pilgrim",
        title="The Camino Francés from Sarria to Santiago",
        country="Spain",
        countryCode="ES",
        region="Southern & Mediterranean Europe",
        regionKey="southern-mediterranean",
        subRegion="Galicia, Lugo and A Coruña",
        bestPeriod={"months": [5, 6, 9, 10], "monthNames": ["May", "June", "September", "October"],
                    "window": "May to June and September to October", "note": "July and August fill every albergue by early afternoon.",
                    "avoid": "November to March, short days and many albergues closed", "raw": "May to June, September to October"},
        budgetTier="€",
        budget=budget((70, 120, "Albergues, €10 public and €12 to €20 private"),
                      (140, 210, "Menú del peregrino €12 to €15, café breakfasts"),
                      (25, 45, "Bus from Santiago airport to Sarria and back to the airport"),
                      (10, 30, "Credencial, cathedral roof tour")),
        profile={"difficulty": 3, "difficultyLabel": "Active", "difficultyNote": "3/5, five walking days of 19 to 29 km on good paths, about 5 to 7 hours each",
                 "fitnessLevel": "Active", "crowdLevel": "High", "familyFriendly": None, "carRequired": False},
        gatewayAirport="SCQ Santiago de Compostela, bus to Sarria via Lugo in about 2 h 30 min",
        gatewayAirportCode="SCQ",
        languages=["Spanish", "Galician", "English"],
        currency="EUR",
        coordinates={"lat": 42.78, "lon": -7.41, "precision": "city", "matchedPlace": "Sarria", "source": "manual"},
        tags=["camino", "pilgrim", "albergue", "walking", "galicia", "compostela"],
        summary=("The last 100 km of the Camino Francés, the minimum that earns the **Compostela**. Five days on "
                 "oak-lined lanes and stone villages from **Sarria**, through **Portomarín** on its reservoir, "
                 "octopus in **Melide** and eucalyptus woods, to the **Cathedral of Santiago** and the pilgrims' Mass. "
                 "Beds are €10 to €20 a night and dinner is a three-course menú for €13."),
        hook="111 km in five days, beds from €10 a night, and the Compostela at the end.",
        itinerary=[
            day(1, "To Sarria",
                "Fly to **Santiago de Compostela**, then the bus to **Sarria** via Lugo, about 2 h 30 min.",
                "Get your **credencial** stamped at the parish church and check the first yellow arrow.",
                "Pilgrim dinner on Rúa Maior and an early night.",
                {"line": "Bus 2 h 30 min", "km": 115, "hours": 2.5, "mode": "bus"},
                "Albergue in Sarria", 1, ("gem-lugo", 1), ("Sarria", 42.781, -7.414)),
            day(2, "Sarria to Portomarín",
                "Out through oak woods and hamlets; the **100 km stone** comes before lunch.",
                "Down to the **Miño** reservoir and the climb of stairs into **Portomarín**, rebuilt stone by stone above the water.",
                "Tarta de Santiago and an evening walk on the church square.",
                {"line": "22 km, +420 m, -470 m, 5 h 30 min", "km": 22, "ascentM": 420, "descentM": 470, "highM": 660, "hours": 5.5, "mode": "walk"},
                "Albergue in Portomarín", 2, ("gem-lugo", 7), ("Portomarín", 42.807, -7.616)),
            day(3, "Portomarín to Palas de Rei",
                "The longest climb of the week, up to **Sierra Ligonde**, about 720 m, on forest tracks.",
                "Down through Ligonde and Eirexe to **Palas de Rei**.",
                "Caldo gallego and a foot soak.",
                {"line": "25 km, +560 m, -320 m, 6 h 30 min", "km": 25, "ascentM": 560, "descentM": 320, "highM": 720, "hours": 6.5, "mode": "walk"},
                "Albergue in Palas de Rei", 3, ("SCQ", 7), ("Palas de Rei", 42.873, -7.869)),
            day(4, "Palas de Rei to Arzúa",
                "The longest day, 29 km, on rolling lanes through Galician farms.",
                "**Pulpo a feira** in **Melide**, octopus with paprika on wooden plates, the Camino's best lunch.",
                "Cheese from Arzúa, famous for it, with bread and a beer.",
                {"line": "29 km, +500 m, -580 m, 7 h", "km": 29, "ascentM": 500, "descentM": 580, "highM": 560, "hours": 7, "mode": "walk"},
                "Albergue in Arzúa", 4, ("SCQ", 2), ("Arzúa", 42.928, -8.163)),
            day(5, "Arzúa to O Pedrouzo",
                "A shorter day under eucalyptus, with cafés every few kilometres.",
                "Arrive in **O Pedrouzo** early and rest before the last stage.",
                "Pilgrims' dinner and a 06:30 alarm.",
                {"line": "19 km, +290 m, -350 m, 4 h 30 min", "km": 19, "ascentM": 290, "descentM": 350, "highM": 410, "hours": 4.5, "mode": "walk"},
                "Albergue in O Pedrouzo", 5, ("SCQ", 7), ("O Pedrouzo", 42.905, -8.360)),
            day(6, "O Pedrouzo to Santiago",
                "Up to **Monte do Gozo**, the Mount of Joy, for the first sight of the cathedral spires.",
                "Into the old town and the **Praza do Obradoiro**; queue at the pilgrim office for the **Compostela**.",
                "Celebration dinner on Rúa do Franco.",
                {"line": "20 km, +330 m, -360 m, 5 h", "km": 20, "ascentM": 330, "descentM": 360, "highM": 370, "hours": 5, "mode": "walk"},
                "Albergue in Santiago", 6, ("SCQ", 3), ("Santiago de Compostela", *scq)),
            day(7, "Santiago, the Mass and home",
                "The noon pilgrims' Mass in the **Cathedral**; the botafumeiro swings on feast days and some Fridays.",
                "Rooftop tour of the cathedral, about €12, then the bus to the airport, 35 minutes.",
                None,
                {"line": "City walking, about 4 km", "km": 4, "hours": 2, "mode": "walk"},
                None, None, ("SCQ", 1), ("Santiago de Compostela", *scq)),
        ],
        accommodationStrategy=[
            {"rank": 1, "name": "Albergue in Sarria", "style": "albergue", "location": "Sarria, Rúa Maior", "description": "Many private albergues; book the first night.", "booking": "a week ahead", "priceNote": "€12 to €18 a bunk"},
            {"rank": 2, "name": "Albergue in Portomarín", "style": "albergue", "location": "Portomarín", "description": "The Xunta's public albergue takes no bookings; private ones do.", "booking": "book private beds ahead in summer", "priceNote": "€10 to €15 a bunk"},
            {"rank": 3, "name": "Albergue in Palas de Rei", "style": "albergue", "location": "Palas de Rei", "description": "Public and private albergues in the centre.", "booking": "a few days ahead", "priceNote": "€10 to €15 a bunk"},
            {"rank": 4, "name": "Albergue in Arzúa", "style": "albergue", "location": "Arzúa", "description": "Most open at 13:00; washing lines and kitchens.", "booking": "a few days ahead", "priceNote": "€10 to €15 a bunk"},
            {"rank": 5, "name": "Albergue in O Pedrouzo", "style": "albergue", "location": "O Pedrouzo", "description": "The last night on the trail; the busiest stop.", "booking": "book ahead", "priceNote": "€12 to €18 a bunk"},
            {"rank": 6, "name": "Albergue in Santiago", "style": "albergue", "location": "Santiago old town", "description": "Seminario Menor and old town hostels, or a private room to celebrate.", "booking": "a week ahead", "priceNote": "€15 to €25 a bunk"},
        ],
        logistics={
            "connectivity": "EU roaming; signal is good in every village.",
            "emergency": "112.",
            "weather": "Galicia is green because it rains; a light rain jacket every day, all year.",
            "bookingWindows": "Private albergues take bookings; public ones are first come from 13:00.",
            "money": "Small cafés are cash only; ATMs in every stage town.",
            "transportRules": "Luggage transfer between albergues costs about €5 a stage per bag.",
            "permits": "The credencial, the pilgrim passport, with two stamps a day from Sarria for the Compostela.",
            "health": "Treat hot spots on the first day; pharmacies in every stage town.",
            "gettingThere": "Fly to Santiago; buses to Sarria run via Lugo.",
            "other": [],
        },
        proTips=["Collect two stamps a day from Sarria: the pilgrim office asks for them on the last 100 km.",
                 "Start at 07:30 to finish before the afternoon heat and the albergue queue."],
        typeSpecific={"raw": {"Who It Suits": "First-time pilgrims and walkers who want a week with meaning"},
                      "surface": "Paths and quiet lanes, about 90% unpaved", "distanceKm": 115, "elevationM": 720, "verticalM": 2100,
                      "technicalRating": "Waymarked with yellow arrows and stone markers every 500 m", "transitPass": None, "hutBooking": None, "liftNetwork": None,
                      "snowReliability": None, "windConditions": None, "gpxReady": False,
                      "bookingTimeline": "Private albergues a few days ahead, a week in summer", "audience": "Walkers and pilgrims"},
        packingNotes=["Broken-in walking shoes", "Blister plasters", "A light sleeping bag", "Rain jacket", "Shell for the credencial"],
        whatCouldGoWrong=["Summer albergues fill by early afternoon; book private beds or start early.",
                          "Blisters on day two end more Caminos than anything; stop and treat them early."],
        highlights=[
            hl("The Compostela", "Your certificate at the pilgrim office after the last 100 km.", ("SCQ", 1), 6),
            hl("Monte do Gozo", "The first sight of the cathedral spires, 5 km from the end.", ("SCQ", 3), 6),
            hl("Pulpo in Melide", "Octopus with paprika on wooden plates, the Camino's best lunch.", ("SCQ", 2), 4),
            hl("Portomarín", "A village moved stone by stone above its reservoir.", ("gem-lugo", 7), 2),
        ],
        photos=[photo("SCQ", 0), photo("SCQ", 3), photo("SCQ", 1), photo("gem-lugo", 1), photo("SCQ", 4)],
    ))

    # ── Island hopping: Paros, Antiparos and Naxos ───────────────────────
    out.append(sample(
        id="gr-island-hopping-paros-antiparos-naxos",
        slug="island-hopping",
        title="Paros, Antiparos and Naxos by Ferry",
        country="Greece",
        countryCode="GR",
        region="Southern & Mediterranean Europe",
        regionKey="southern-mediterranean",
        subRegion="The Cyclades",
        bestPeriod={"months": [5, 6, 9, 10], "monthNames": ["May", "June", "September", "October"],
                    "window": "Late May to June and September to mid-October", "note": "The sea is warmest in September.",
                    "avoid": "July and August, when the meltemi wind and prices both peak", "raw": "May to June, September to October"},
        budgetTier="€€",
        budget=budget((180, 330, "Studios and rooms, six nights"),
                      (160, 260, "Bakeries, gyros, tavernas"),
                      (100, 150, "Three ferries on deck, island buses"),
                      (30, 60, "Antiparos cave, Portara at sunset, a boat trip")),
        profile={"difficulty": 1, "difficultyLabel": "Easy", "difficultyNote": "1/5, ferries, beaches and village walks",
                 "fitnessLevel": "Easy", "crowdLevel": "Moderate", "familyFriendly": True, "carRequired": False},
        gatewayAirport="ATH Athens, 1 h to Piraeus by metro; home by ferry or from JNX Naxos",
        gatewayAirportCode="ATH",
        languages=["Greek", "English"],
        currency="EUR",
        coordinates={"lat": par[0], "lon": par[1], "precision": "city", "matchedPlace": "Paros", "source": "dossier"},
        tags=["islands", "ferry", "beaches", "cyclades", "sunset", "car-free"],
        summary=("Three Cycladic islands and no car. **Paros** for fishing harbours and white lanes, tiny "
                 "**Antiparos** ten minutes across the strait for its cave and empty beaches, and **Naxos**, the "
                 "biggest and greenest, for the marble **Portara** at sunset and long sandy beaches. Every hop is a "
                 "short ferry and every island has a bus."),
        hook="Three islands, three short ferries and the Portara of Naxos at sunset.",
        itinerary=[
            day(1, "Athens and the Acropolis",
                "Metro from the airport to the centre, 40 minutes. Afternoon at the **Acropolis**, about €20.",
                "Plaka and Anafiotika's island lanes under the rock.",
                "Sunset from the Areopagus hill, free, then souvlaki.",
                {"line": "City walking, about 7 km", "km": 7, "ascentM": 90, "hours": 4, "mode": "walk"},
                "Hostel in Athens", 1, ("ATH", 2), ("Athens", *ath)),
            day(2, "Ferry to Paros",
                "Morning ferry from **Piraeus** to **Paros**, 3 to 4 hours on a conventional boat, from €40 on deck.",
                "Settle in **Parikia** and visit the **Panagia Ekatontapyliani**, the church of a hundred doors.",
                "Sunset on the windmill quay, drinks by the old harbour.",
                {"line": "Ferry 3 h 30 min, 170 km", "km": 170, "hours": 3.5, "mode": "ferry"},
                "Studio in Parikia", 2, ("gem-paros", 3), ("Parikia", 37.085, 25.152)),
            day(3, "Naoussa and Kolymbithres",
                "Bus to **Naoussa**, the fishing harbour with tavernas on the quay.",
                "Swim among the wind-carved granite of **Kolymbithres** beach.",
                "Grilled octopus by the boats in Naoussa.",
                {"line": "Bus 20 min, beach day", "km": 22, "hours": 1, "mode": "bus"},
                "Studio in Parikia", 2, ("gem-paros", 0), ("Naoussa", 37.124, 25.236)),
            day(4, "Antiparos",
                "Bus to Pounta, then the 10 minute ferry to **Antiparos**, about €2.",
                "The **Cave of Antiparos**, 400 steps down into stalactites, about €6; then a quiet beach.",
                "Dinner on Antiparos' main street before the last boat.",
                {"line": "Ferry 10 min, bus, cave 400 steps", "km": 16, "descentM": 100, "ascentM": 100, "hours": 2, "mode": "ferry"},
                "Studio in Parikia", 2, ("gem-antiparos", 6), ("Antiparos", *ant)),
            day(5, "Hop to Naxos",
                "Ferry from Parikia to **Naxos** in about 45 minutes, from €10.",
                "Old town lanes up to the Venetian castle.",
                "The marble **Portara** at sunset, the gate of an unfinished temple of Apollo.",
                {"line": "Ferry 45 min, 40 km", "km": 40, "hours": 1, "mode": "ferry"},
                "Room in Naxos town", 3, ("gem-naxos", 6), ("Naxos", *nax)),
            day(6, "Naxos beaches or the mountain villages",
                "Bus to **Agios Prokopios** and its long sandy beach.",
                "Or the bus inland to **Halki** and Apiranthos, marble villages and kitron liqueur.",
                "Taverna dinner in the old town.",
                {"line": "Bus 20 min, beach or villages", "km": 30, "hours": 2, "mode": "bus"},
                "Room in Naxos town", 3, ("gem-naxos", 0), ("Naxos", *nax)),
            day(7, "Back to Athens",
                "Ferry from Naxos to **Piraeus**, about 5 hours, or a 40 minute flight from Naxos airport.",
                "Metro to the airport.",
                None,
                {"line": "Ferry 5 h, 190 km", "km": 190, "hours": 5, "mode": "ferry"},
                None, None, ("gem-paros", 1), ("Naxos", *nax)),
        ],
        accommodationStrategy=[
            {"rank": 1, "name": "Hostel in Athens", "style": "hostel", "location": "Athens, near Monastiraki", "description": "Rooftop hostels with Acropolis views.", "booking": "two weeks ahead", "priceNote": "€20 to €35 a dorm bed"},
            {"rank": 2, "name": "Studio in Parikia", "style": "studio", "location": "Parikia, Paros", "description": "Family-run studios with a kitchenette, five minutes from the port.", "booking": "a month ahead in June and September", "priceNote": "€45 to €80 a night for the studio"},
            {"rank": 3, "name": "Room in Naxos town", "style": "room", "location": "Naxos old town", "description": "Rooms in the old town or at Agios Georgios beach.", "booking": "a month ahead", "priceNote": "€40 to €75 a night"},
        ],
        logistics={
            "connectivity": "EU roaming; 4G on all three islands.",
            "emergency": "112; the coastguard is 108.",
            "weather": "The meltemi blows hardest in July and August and can cancel small boats.",
            "bookingWindows": "Book Piraeus ferries two to three weeks ahead; island hops can be bought the day before.",
            "money": "Euro; cards widely taken, small tavernas prefer cash.",
            "transportRules": "Deck class is the cheapest ticket and has seats inside and out.",
            "permits": None,
            "health": "Strong sun from May; shade is rare on the beaches.",
            "gettingThere": "Fly to Athens and take the metro to Piraeus.",
            "other": [],
        },
        proTips=["Compare conventional and fast ferries: the slow boat is half the price and steadier in wind.",
                 "Stay in Parikia on Paros: every ferry and bus leaves from there."],
        typeSpecific={"raw": {"Who It Suits": "Couples, friends and families who want beaches without a car"},
                      "surface": None, "distanceKm": None, "elevationM": None, "verticalM": None,
                      "technicalRating": None, "transitPass": None, "hutBooking": None, "liftNetwork": None,
                      "snowReliability": None, "windConditions": "Meltemi north wind in July and August", "gpxReady": False,
                      "bookingTimeline": "Ferries 2 to 3 weeks ahead from Piraeus", "audience": "Island hoppers"},
        packingNotes=["Seasickness tablets for windy days", "A light jacket for the ferry deck", "Snorkel mask", "Sun hat"],
        whatCouldGoWrong=["A meltemi day can cancel the small Antiparos boats; move the cave day.",
                          "Ferries run late in summer; never book a flight on the same afternoon."],
        highlights=[
            hl("The Portara at sunset", "A marble gate to nowhere, the symbol of Naxos.", ("gem-naxos", 6), 5),
            hl("Naoussa harbour", "Fishing boats, octopus drying in the sun and tavernas on the quay.", ("gem-paros", 0), 3),
            hl("Cave of Antiparos", "400 steps down into a hall of stalactites.", ("gem-antiparos", 6), 4),
            hl("The Acropolis", "Start the week on the rock above Athens.", ("ATH", 2), 1),
        ],
        photos=[photo("gem-paros", 1), photo("gem-paros", 0), photo("gem-antiparos", 0), photo("gem-naxos", 6), photo("gem-naxos", 0)],
    ))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="print what would change and write nothing")
    args = ap.parse_args()
    trips = samples()
    master = json.loads(MASTER.read_text(encoding="utf-8"))
    ids = {t["id"] for t in trips}
    kept = [t for t in master["trips"] if t["id"] not in ids]
    master["trips"] = kept + trips
    master["tripCount"] = len(master["trips"])
    regions: dict = {}
    for t in master["trips"]:
        regions[t["regionKey"]] = regions.get(t["regionKey"], 0) + 1
    master["regions"] = {k: regions.get(k, 0) for k in master["regions"]} | regions
    have = {t["slug"] for t in master.get("tripTypes", [])}
    for i, name, slug in NEW_TYPES:
        if slug not in have:
            master["tripTypes"].append({"id": i, "name": name, "slug": slug})
    lock = {
        "heroes": {t["id"]: t["photos"][0] for t in trips},
        "typeHeroes": {slug: photo(*ref) for slug, ref in TYPE_PHOTOS.items()},
    }
    print(f"{len(trips)} samples; master {len(kept)} kept + {len(trips)} = {master['tripCount']}")
    if args.check:
        return 0
    MASTER.write_text(json.dumps(master, ensure_ascii=False, indent=2), encoding="utf-8")
    for t in trips:
        (TRIP_DIR / f"{t['id']}.json").write_text(json.dumps(t, ensure_ascii=False, indent=2), encoding="utf-8")
    LOCK.write_text(json.dumps(lock, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {MASTER.relative_to(ROOT)}, {len(trips)} files in {TRIP_DIR.relative_to(ROOT)}, {LOCK.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
