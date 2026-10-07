#!/usr/bin/env python3
"""Expand the trip catalogue in batches, one region at a time (T155, trips spec D2).

    python pipeline/expand_catalogue.py slots [--region R]
    python pipeline/expand_catalogue.py plan --region R --wave N [--mode fill|deepen] [--size K]
                                             [--cells CC:slug,...] [--write]
    python pipeline/expand_catalogue.py run PLAN (--live --max-usd X | --stub DIR) [--limit N] [--retry]
                                             [--model M] [--critic-model M]
    python pipeline/expand_catalogue.py check PLAN [--json FILE]
    python pipeline/expand_catalogue.py close-clean PLAN --reviewer NAME
    python pipeline/expand_catalogue.py promote PLAN [--write]
    python pipeline/expand_catalogue.py join [--write]
    python pipeline/expand_catalogue.py retract BATCH [--write]
    python pipeline/expand_catalogue.py self-test

Going from 253 curated trips to several hundred cannot be done by hand, so
new trips come out of the generator (generate_trip.py: skeleton, prose,
grounded numbers, critic) in the same v2.1 shape the gate enforces. This
module is the batch around that generator. It decides which trips to make,
runs them with a spending cap, adds the perishable flags, decides which ones
may join the catalogue, and joins them. A batch is one region and one wave,
named `<regionKey>-g<wave>` (northern-baltics-g1), which is what lands in
provenance.batch: the curated trips are batched by region the same way
(western-central, southern-mediterranean, ...), so a batch can be counted,
reviewed, refreshed and retracted as one unit.

The steps, in order, and where each writes:

  slots    read only. The gap matrix (gap_matrix.py) over the catalogue: per
           region, the cells with no trip (fill), the cells with one trip
           that could take a second (deepen, up to MAX_PER_CELL), the cells
           that are geographically blocked, and a cost range.
  plan     expansion/<batch>.json, tracked, one brief per cell. The idea line
           is written from the trip type and the cell, never with a figure,
           because the skeleton pass is not allowed to write one. A cell
           already in any plan is not planned twice. Read and edit the plan
           before paying for it.
  run      data/generated/ (the generator's own folders) plus a status file
           data/generated/batches/<batch>.json. Live runs need --max-usd and
           stop before a trip that would cross it. After each admitted trip
           the perishable flags are added (below) and the record is put
           through the gate again; a record that cannot carry them is moved
           to rejected/, so nothing sits in admitted/ without its flags.
  check    read only. The promotion gate per trip: validator, critic,
           provenance, perishable flags, coverage and review (below).
  close-clean
           a person's sign-off for the trips the review queue has nothing
           to show (review_queue.py close on each), so every promoted trip
           has a review date, also the ones that ship on the automated
           checks.
  promote  data/expansion/<id>.json, tracked: the record with
           provenance.reviewedAt stamped from its review file (register row
           T154-b), and the evidence, critique and review sidecars beside it.
  join     data/trips.master.json, data/trips/<id>.json and
           data/trips.flat.csv, in place, for a machine without the raw
           batches (build.py reads data/expansion/ itself on a full
           rebuild, register row T144-b). Only generated rows move.
  retract  removes one batch from data/expansion/ and joins again.

Perishable flags. The spec wants a verifyFlags line on every price, opening
time and booking window, so a traveller is told what to check and the
refresh knows what expires. A price is a budget row, a stay's priceEur or a
day's spendEur that holds a value. A booking window is
logistics.bookingWindows, typeSpecific.bookingTimeline, typeSpecific.hutBooking
or a stay's booking line when it holds text, and any other text that says
to book or reserve ahead. An opening time is a sentence with a clock time, or
with an open or close word beside a day, month, season or time word. One
line per field and kind, "Recheck price at <path> before booking (checked
<date>)", in the record's own verifyFlags, so the page's "n prices or opening
times change often" note counts them with no app change. A field the critic
already disputed is flagged already. The contract holds 40 flags; a trip that
needs more fails rather than losing some.

The promotion gate, every one of which must pass:

  validator  generation_gate.check (schema, cross-field rules, the K5 checks
             of validate.py) and, when a gazetteer is present, validate.py's
             ERROR-level checks with the place index.
  critic     the critique file exists for this record, checked all six
             kinds, matches the prompt version, and every dispute it raised
             is in verifyFlags (none dropped over the cap).
  provenance the batch is the plan's, its region is the record's region,
             the record was generated with the prompts in the tree today,
             ingestedAt is set and dataVintage is its year, and the evidence
             sidecar lists the pages read.
  flags      every price, opening time and booking window is flagged.
  coverage   the cell is the plan's, it is not geographically blocked, it
             holds fewer than MAX_PER_CELL trips without this one, and the
             trip is not a near copy (same title words or the same bases) of
             a trip already in the cell or in the batch.
  review     the review queue (review_queue.py) has no open item for it and
             its review is closed against this exact record.

No network call is made outside `run --live`, which calls Gemini through
generate_trip.GeminiClient. The Claude API is never used.
"""
from __future__ import annotations

import argparse
import collections
import copy
import csv
import datetime as _dt
import io
import json
import os
import re
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import accuracy as A  # noqa: E402
import common as C  # noqa: E402
import gap_matrix as GM  # noqa: E402
import generate_trip as T  # noqa: E402
import generation_gate as G  # noqa: E402
import review_queue as R  # noqa: E402

ROOT = G.ROOT
REGION_KEYS = tuple(C.REGIONS)
BATCH_RE = re.compile(r"^(" + "|".join(re.escape(k) for k in REGION_KEYS) + r")-g([1-9][0-9]{0,2})$")

# A cell is one country and one trip type. Two trips per cell is what takes
# the catalogue from 253 to about 600 (slots prints the projection); a third
# is an owner decision, not a default.
MAX_PER_CELL = 2
BATCH_SIZE = 20
# Generation cost per trip including the critic and the grounded pass, in
# euros: the estimate in the T155 task text, the same range as the "expand
# to ~600 via generate-verify" line of CARTA_UNIT_ECONOMICS.md section 2.3.
# A sizing figure until the first measured run (register row T144-a).
EST_EUR_PER_TRIP = (0.25, 0.45)

SLUG_OF = {i: s for i, _n, s in C.TRIP_TYPES}
NAME_OF = {s: n for _i, n, s in C.TRIP_TYPES}
COUNTRY_OF = {code: name for name, code in C.COUNTRY_CODES.items()}

# What a week of each type is, for the brief's idea line. Words only.
TYPE_IDEA = {
    "cycling": "bike week on a signed route or on loops from one or two bases",
    "trail-running": "trail running week on marked mountain, forest or coastal trails",
    "city": "city week on foot and by public transport, with a day trip or two",
    "cozy-towns": "slow week through small towns linked by train, bus or short drives",
    "road-trip": "scenic road trip with two or three bases",
    "hiking": "hiking week on waymarked trails, hut to hut or from bases",
    "culinary": "food and wine week built around markets, producers and tastings",
    "winter-sports": "ski or Nordic week in one main area",
    "nature-escape": "cabin or lodge week in protected nature, with walks and quiet days",
    "water-sports": "paddling, sailing or swimming week on the coast or a lake",
}
TYPE_NOUN = {
    "cycling": "cycling", "trail-running": "trail running", "city": "city", "cozy-towns": "small-town",
    "road-trip": "road", "hiking": "hiking", "culinary": "food and wine", "winter-sports": "winter sports",
    "nature-escape": "nature", "water-sports": "water sports",
}

PRICE_PATHS = ("budget.breakdown.accommodation", "budget.breakdown.food", "budget.breakdown.transport",
               "budget.breakdown.activities", "accommodationStrategy[].priceEur",
               "itinerary[].dayStats.spendEur")
BOOKING_PATHS = ("logistics.bookingWindows", "typeSpecific.bookingTimeline", "typeSpecific.hutBooking",
                 "accommodationStrategy[].booking")
# Text the perishable scan does not read: identifiers, codes, the writer's
# own account (sources), the flags themselves and the pipeline's metadata.
SCAN_SKIP = {"schemaVersion", "id", "slug", "country", "countryCode", "countries", "region", "regionKey",
             "tags", "tripType", "tripTypeSlug", "budgetTier", "budgetTierRaw", "languages", "currency",
             "emergencyNumber", "gatewayAirport", "gatewayAirportCode", "basecamps", "coordinates",
             "sources", "verifyFlags", "figures", "provenance", "snapshot"}

_DAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday"
_MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december"
CLOCK_RE = re.compile(r"\b(?:[01]?[0-9]|2[0-3])[:.h][0-5][0-9]\b|\b(?:1[0-2]|0?[1-9])\s?(?:am|pm)\b", re.I)
OPEN_RE = re.compile(
    r"\b(?:open(?:s|ed|ing)?\b(?!-)(?!\s+(?:air|water|sea|views?|fields?|country(?:side)?|plan|ridges?|"
    r"plateaus?|terrain|landscapes?|meadows?|spaces?|valleys?)\b)"
    r"|clos(?:es|ed|ing|ures?)\b|shuts?\b"
    r"|last\s+(?:entry|entries|admission|ferry|ferries|boat|bus|train|lift|gondola|departure)s?\b"
    r"|opening\s+(?:hours|times|days|season)\b)", re.I)
CUE_RE = re.compile(
    rf"\b(?:(?:{_DAYS})s?|{_MONTHS}|daily|weekends?|weekdays?|mornings?|afternoons?|evenings?|nights?|"
    r"noon|midday|midnight|dawn|dusk|sunset|sunrise|seasons?|seasonal(?:ly)?|summer|winter|spring|autumn|"
    r"holidays?|until|till|from|between|hours)\b", re.I)
BOOK_RE = re.compile(
    r"\b(?:book|booking|reserve|reservation)s?(?:ed|ing)?\b[^.;!?]{0,80}?"
    r"\b(?:ahead|in advance|early|weeks?|months?|opens?|released?)\b"
    r"|\b(?:sells? out|sold out|fills? up|books? up|booked out)\b", re.I)
_SENT_RE = re.compile(r"(?<=[.;!?])\s+")

PRICE_FLAG = "Recheck price at {path} before booking (checked {date})"
BOOKING_FLAG = "Recheck booking window at {path} (checked {date})"
OPENING_FLAG = 'Recheck opening times at {path}: "{quote}" (checked {date})'
_PREFIX = {"price": "Recheck price at {path} ", "booking": "Recheck booking window at {path} ",
           "opening": "Recheck opening times at {path}:"}

_STOP = {"the", "and", "through", "from", "with", "week", "weeks", "days", "seven", "trip", "trips", "tour",
         "into", "over", "along", "for", "its", "via", "around", "across", "between", "your", "one", "two"}


def flag_cap():
    return G.load_schema()["properties"]["verifyFlags"]["maxItems"]


# ── paths and files ──────────────────────────────────────────────────────────

class Paths:
    """Every place this module reads or writes, under one dataset root, so a
    test can point the whole flow at a scratch copy."""

    def __init__(self, root=ROOT, gen=None):
        self.root = root
        self.master = os.path.join(root, "data", "trips.master.json")
        self.trips = os.path.join(root, "data", "trips")
        self.csv = os.path.join(root, "data", "trips.flat.csv")
        self.expansion = os.path.join(root, "data", "expansion")
        self.plans = os.path.join(root, "expansion")
        self.gen = gen or os.path.join(root, "data", "generated")
        self.admitted = os.path.join(self.gen, "admitted")
        self.rejected = os.path.join(self.gen, "rejected")
        self.status = os.path.join(self.gen, "batches")
        self.ledger = os.path.join(self.gen, "ledger.jsonl")


def _read(path):
    with open(path, "rb") as fh:
        return json.loads(fh.read().decode("utf-8"))


def _crlf(obj):
    """The layout of trips.master.json and data/trips/*.json: two-space
    indent, CRLF, UTF-8 (fill_type_specific.py writes the same)."""
    return json.dumps(obj, ensure_ascii=False, indent=2).replace("\n", "\r\n").encode("utf-8")


def _write_bytes(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, path)


def _write_json(path, obj):
    _write_bytes(path, (json.dumps(obj, ensure_ascii=False, indent=1) + "\n").encode("utf-8"))


def _today():
    return _dt.date.today().isoformat()


def is_generated(trip):
    return (trip.get("provenance") or {}).get("sourceFormat") == "generated"


def batch_region(batch):
    m = BATCH_RE.match(batch or "")
    return m.group(1) if m else None


def load_expansion(folder, seen_ids=None):
    """(records, errors) for data/expansion/: the reviewed generated trips
    that join the catalogue. Only <id>.json record files are read, never the
    sidecars beside them (register row T145-c). Each must be generated, carry
    a review date, belong to a batch of its own region and pass the gate; a
    failing one is an error, not a silent skip, and is not returned."""
    seen = set(seen_ids or ())
    out, errors = [], []
    if not os.path.isdir(folder):
        return out, errors
    for name in sorted(os.listdir(folder)):
        if not name.endswith(".json") or name.endswith(R.SIDECARS):
            continue
        path = os.path.join(folder, name)
        try:
            rec = _read(path)
        except (OSError, ValueError) as e:
            errors.append(f"{name}: unreadable: {e}")
            continue
        prov = rec.get("provenance") if isinstance(rec, dict) else None
        if not isinstance(prov, dict):
            errors.append(f"{name}: not a trip record")
            continue
        why = []
        if prov.get("sourceFormat") != "generated":
            why.append("not a generated record")
        if not prov.get("reviewedAt"):
            why.append("provenance.reviewedAt is not set: it was never promoted")
        if batch_region(prov.get("batch")) != rec.get("regionKey"):
            why.append(f"batch {prov.get('batch')!r} is not a batch of region {rec.get('regionKey')!r}")
        if name != f"{rec.get('id')}.json":
            why.append(f"file name differs from id {rec.get('id')!r}")
        if rec.get("id") in seen:
            why.append("id already in the catalogue")
        if not why:
            why += G.check(rec)
        if why:
            errors.append(f"{name}: " + "; ".join(why[:5]))
            continue
        seen.add(rec["id"])
        out.append(rec)
    return out, errors


def catalogue(paths):
    """(master, trips): the master, and every trip a plan is measured
    against, which is the master plus promoted records not yet joined."""
    master = _read(paths.master)
    trips = list(master["trips"])
    ids = {t["id"] for t in trips}
    recs, _errs = load_expansion(paths.expansion)
    trips += [r for r in recs if r["id"] not in ids]
    return master, trips


def plan_files(paths):
    if not os.path.isdir(paths.plans):
        return []
    return [os.path.join(paths.plans, n) for n in sorted(os.listdir(paths.plans))
            if n.endswith(".json") and BATCH_RE.match(n[:-5])]


def planned_cells(paths):
    """(countryCode, tripTypeSlug) -> batch, for every brief in every plan."""
    out = {}
    for path in plan_files(paths):
        plan = _read(path)
        for e in plan["entries"]:
            b = e["brief"]
            out.setdefault((b["countryCode"], b["tripTypeSlug"]), plan["batch"])
    return out


# ── slots: where the catalogue is thin ───────────────────────────────────────

def slot_table(trips, planned=None):
    """Per region: fill, deepen and blocked cells, each a dict, best first."""
    planned = planned or {}
    rows, _gaps, per_country, per_type = GM.build({"trips": trips})
    table = {k: {"fill": [], "deepen": [], "blocked": [], "full": []} for k in REGION_KEYS}
    for r in rows:
        slug = SLUG_OF[r["tripTypeId"]]
        cell = {"countryCode": r["countryCode"], "country": r["country"], "tripTypeSlug": slug,
                "regionKey": r["regionKey"], "viability": r["viability"], "reason": r["viabilityReason"],
                "tripsInCell": r["tripCount"], "tripIds": list(r["tripIds"]),
                "plannedIn": planned.get((r["countryCode"], slug))}
        if r["state"] == "blocked":
            table[r["regionKey"]]["blocked"].append(cell)
        elif r["state"] == "gap":
            cell["priority"] = r["priorityScore"]
            table[r["regionKey"]]["fill"].append(cell)
        elif r["viability"] == "viable" and r["tripCount"] < MAX_PER_CELL:
            # The gap matrix's own weighting, so thin countries and thin
            # types go first here too.
            cell["priority"] = round(0.6 / (1 + per_country[r["countryCode"]])
                                     + 0.4 / (1 + per_type[r["tripTypeId"]]), 5)
            table[r["regionKey"]]["deepen"].append(cell)
        else:
            table[r["regionKey"]]["full"].append(cell)
    for region in table.values():
        for mode in ("fill", "deepen"):
            region[mode].sort(key=lambda c: (-c["priority"], c["countryCode"], c["tripTypeSlug"]))
    return table


def eur_range(n):
    return round(n * EST_EUR_PER_TRIP[0], 2), round(n * EST_EUR_PER_TRIP[1], 2)


def slots_summary(paths, region=None):
    _master, trips = catalogue(paths)
    planned = planned_cells(paths)
    table = slot_table(trips, planned)
    out = {"trips": len(trips), "maxPerCell": MAX_PER_CELL, "eurPerTrip": list(EST_EUR_PER_TRIP),
           "regions": {}}
    for key in REGION_KEYS:
        if region and key != region:
            continue
        t = table[key]
        fill = [c for c in t["fill"] if not c["plannedIn"]]
        deepen = [c for c in t["deepen"] if not c["plannedIn"]]
        out["regions"][key] = {
            "trips": sum(1 for x in trips if x.get("regionKey") == key),
            "fill": len(fill), "fillMarginal": sum(c["viability"] == "marginal" for c in fill),
            "deepen": len(deepen), "blocked": len(t["blocked"]),
            "planned": sum(1 for c in t["fill"] + t["deepen"] if c["plannedIn"]),
        }
    regs = out["regions"].values()
    out["fill"] = sum(r["fill"] for r in regs)
    out["deepen"] = sum(r["deepen"] for r in regs)
    out["planned"] = sum(r["planned"] for r in regs)
    out["projectedTrips"] = out["trips"] + out["fill"] + out["deepen"] + out["planned"]
    out["eurToFill"] = eur_range(out["fill"])
    out["eurToDeepen"] = eur_range(out["deepen"])
    return out


# ── plan: one brief per cell ─────────────────────────────────────────────────

def plain(text):
    """A viability reason as brief words: no figure with a unit (the skeleton
    may not write one, so the brief should not offer one) and no dashes."""
    t = re.sub(r"\s*[\u2014\u2013]\s*", ", ", text or "")
    t = re.sub(r"(?:\s(?:at|of))?\s*~?[0-9][0-9,.]*\s?(?:km\u00b2|km|m)\b(?:\s(?:of|vertical|maximum))?", "", t)
    t = re.sub(r"\(\s*\)", "", t)
    t = re.sub(r"\s+([,;:)])", r"\1", t)
    t = re.sub(r"([,;:])\s*,", r"\1", t)
    t = re.sub(r"\s{2,}", " ", t).strip(" ,;:")
    return t[:1].upper() + t[1:]


def idea_for(cell, mode):
    slug, country = cell["tripTypeSlug"], cell["country"]
    if mode == "deepen":
        return (f"In {country}, a second seven-day {TYPE_IDEA[slug]}, on a different route and in a "
                f"different area from the Carta trip listed in differentFrom, so the two do not overlap.")
    idea = (f"In {country}, a seven-day {TYPE_IDEA[slug]}. Carta has no {TYPE_NOUN[slug]} trip in "
            f"{country} yet, so choose the strongest route the country offers for it.")
    if cell["viability"] == "marginal":
        idea += (f" Only a reduced form of this trip type fits here ({plain(cell['reason'])}); "
                 "say so plainly in the trip rather than stretching it.")
    return idea


def _clean_title(s):
    return re.sub(r"\s*[\u2014\u2013\u00b7]\s*", ", ", s or "").strip()


def make_brief(batch, cell, mode, cell_trips):
    cc, slug = cell["countryCode"], cell["tripTypeSlug"]
    brief = {"key": f"{batch}-{cc.lower()}-{slug}", "countryCode": cc, "tripTypeSlug": slug,
             "idea": idea_for(cell, mode), "batch": batch}
    if mode == "deepen":
        brief["differentFrom"] = [{"title": _clean_title(t["title"]),
                                   "basecamps": [_clean_title(b) for b in t.get("basecamps") or []][:6]}
                                  for t in cell_trips]
    return brief


def make_plan(paths, region, wave, mode="fill", size=BATCH_SIZE, cells=None, today=None):
    if region not in REGION_KEYS:
        raise SystemExit(f"unknown region {region!r}; one of {', '.join(REGION_KEYS)}")
    if mode not in ("fill", "deepen"):
        raise SystemExit("mode is fill or deepen")
    batch = f"{region}-g{int(wave)}"
    if not BATCH_RE.match(batch):
        raise SystemExit(f"bad batch name {batch!r}")
    if os.path.exists(os.path.join(paths.plans, f"{batch}.json")):
        raise SystemExit(f"{batch} is already planned; a plan is history, start the next wave instead")
    _master, trips = catalogue(paths)
    by_id = {t["id"]: t for t in trips}
    table = slot_table(trips, planned_cells(paths))
    pool = [c for c in table[region][mode] if not c["plannedIn"]]
    if cells:
        want = {tuple(x.split(":", 1)) for x in cells}
        unknown = want - {(c["countryCode"], c["tripTypeSlug"]) for c in pool}
        if unknown:
            raise SystemExit(f"not open {mode} cells in {region}: {sorted(':'.join(u) for u in unknown)}")
        pool = [c for c in pool if (c["countryCode"], c["tripTypeSlug"]) in want]
    pool = pool[:size]
    entries = []
    for c in pool:
        cell_trips = [by_id[i] for i in c["tripIds"] if i in by_id]
        entries.append({"slot": {"mode": mode, "viability": c["viability"], "tripsInCell": c["tripsInCell"],
                                 "priority": c["priority"]},
                        "brief": make_brief(batch, c, mode, cell_trips)})
    low, high = eur_range(len(entries))
    return {"format": 1, "batch": batch, "regionKey": region, "region": C.REGIONS[region],
            "wave": int(wave), "mode": mode, "plannedAt": today or _today(),
            "catalogueTrips": len(trips), "maxPerCell": MAX_PER_CELL,
            "estimateEur": {"low": low, "high": high, "perTrip": list(EST_EUR_PER_TRIP)},
            "entries": entries}


def plan_problems(plan):
    """Why a plan file may not be run: a shape a person editing it could break."""
    out = []
    batch, region = plan.get("batch"), plan.get("regionKey")
    if batch_region(batch) != region:
        out.append(f"batch {batch!r} is not a batch of region {region!r}")
    seen_keys, seen_cells = set(), set()
    for i, e in enumerate(plan.get("entries") or []):
        b = e.get("brief") or {}
        cc, slug = b.get("countryCode"), b.get("tripTypeSlug")
        where = f"entries[{i}]"
        if cc not in COUNTRY_OF:
            out.append(f"{where}: unknown countryCode {cc!r}")
            continue
        if slug not in NAME_OF:
            out.append(f"{where}: unknown tripTypeSlug {slug!r}")
            continue
        if C.COUNTRY_REGION.get(cc) != region:
            out.append(f"{where}: {cc} is not in {region}")
        if GM.viability(cc, next(i for i, _n, s in C.TRIP_TYPES if s == slug))[0] == "not-viable":
            out.append(f"{where}: {cc} {slug} is geographically blocked")
        if not (b.get("idea") or "").strip():
            out.append(f"{where}: no idea")
        if b.get("batch") != batch:
            out.append(f"{where}: brief batch {b.get('batch')!r} is not the plan's")
        if b.get("key") in seen_keys:
            out.append(f"{where}: key {b.get('key')!r} twice")
        if (cc, slug) in seen_cells:
            out.append(f"{where}: cell {cc} {slug} twice in one batch")
        seen_keys.add(b.get("key"))
        seen_cells.add((cc, slug))
    return out


def load_plan(path):
    plan = _read(path)
    errs = plan_problems(plan)
    if errs:
        raise SystemExit(f"plan {path} cannot run:\n  " + "\n  ".join(errs[:20]))
    return plan


# ── perishable flags: every price, opening time and booking window ───────────

def _snippet(text, m, width=70):
    start = max(0, m.start() - 20)
    s = text[start:start + width]
    if start:
        s = s.split(" ", 1)[-1]
    if start + width < len(text):
        s = s.rsplit(" ", 1)[0]
    return s.replace('"', "'").strip(" ,;:")


def opening_quote(text):
    """The words of the first sentence that states an opening or operating
    time, or None."""
    for sent in _SENT_RE.split(text or ""):
        m = CLOCK_RE.search(sent)
        if not m:
            o = OPEN_RE.search(sent)
            m = o if o and CUE_RE.search(sent) else None
        if m:
            return _snippet(sent, m)
    return None


def perishables(rec):
    """[(kind, path, quote)] for every price, opening time and booking window
    the record states, in a fixed order."""
    out = []
    for pat in PRICE_PATHS:
        for p in T._instances(rec, pat):
            v = T._get(rec, p)
            if isinstance(v, dict) and "lowEur" in v:
                if v.get("lowEur") is None and v.get("highEur") is None:
                    continue
            elif v is None:
                continue
            out.append(("price", G._path(p), None))
    dedicated = set()
    for pat in BOOKING_PATHS:
        for p in T._instances(rec, pat):
            v = T._get(rec, p)
            if isinstance(v, str) and v.strip():
                dotted = G._path(p)
                dedicated.add(dotted)
                out.append(("booking", dotted, None))
    for path, s in T._strings({k: v for k, v in rec.items() if k not in SCAN_SKIP}):
        dotted = G._path(path)
        if dotted.startswith("bestPeriod.monthNames"):
            continue
        q = opening_quote(s)
        if q:
            out.append(("opening", dotted, q))
        if dotted not in dedicated:
            m = BOOK_RE.search(s)
            if m:
                out.append(("booking", dotted, None))
    return out


def _covered(flags, kind, path):
    pre = _PREFIX[kind].format(path=path)
    return any(f.startswith(pre) or f.startswith(f"Disputed {path},") for f in flags)


def _checked(rec, kind, path):
    if kind == "price":
        for f in rec.get("figures") or []:
            if f.get("path") == path and f.get("checkedAt"):
                return f["checkedAt"]
    return (rec.get("provenance") or {}).get("ingestedAt") or _today()


def flag_text(rec, kind, path, quote):
    date = _checked(rec, kind, path)
    if kind == "price":
        return PRICE_FLAG.format(path=path, date=date)
    if kind == "booking":
        return BOOKING_FLAG.format(path=path, date=date)
    return OPENING_FLAG.format(path=path, quote=quote, date=date)


def add_perishable_flags(rec):
    """(record, errors, added). Appends one flag per unflagged perishable,
    after the evidence rule's and the critic's own flags. Deterministic: the
    same record always gets the same flags, so a rerun changes nothing. The
    reader's signals (verifyFlagCount, volatilePricing, sources.verified)
    follow from the figures ledger, not from this list (T093, accuracy.py),
    so a perishable flag never moves them; apply() is called only so a
    record that reaches here out of step is put right."""
    out = copy.deepcopy(rec)
    flags = list(out.get("verifyFlags") or [])
    added = 0
    for kind, path, quote in perishables(out):
        if _covered(flags, kind, path):
            continue
        f = flag_text(out, kind, path, quote)
        if f not in flags:
            flags.append(f)
            added += 1
    errors = []
    cap = flag_cap()
    if len(flags) > cap:
        errors.append(f"flag-budget: the trip needs {len(flags)} verify flags and the contract holds {cap}")
    out["verifyFlags"] = flags
    A.apply(out)
    return out, errors, added


def unflagged(rec):
    flags = rec.get("verifyFlags") or []
    return [(k, p) for k, p, _q in perishables(rec) if not _covered(flags, k, p)]


# ── run: generate a batch with a spending cap ────────────────────────────────

def batch_spend(ledger, keys):
    """(USD spent on these keys, the dearest trip so far, unpriced models)."""
    per, unpriced = collections.Counter(), set()
    keys = set(keys)
    if os.path.exists(ledger):
        with open(ledger, encoding="utf-8") as fh:
            for line in fh:
                if not line.strip():
                    continue
                row = json.loads(line)
                if row.get("trip") not in keys:
                    continue
                if row.get("usd") is None:
                    unpriced.add((row.get("usage") or {}).get("model"))
                else:
                    per[row["trip"]] += row["usd"]
    return round(sum(per.values()), 5), round(max(per.values(), default=0.0), 5), unpriced


def _status_path(paths, batch):
    return os.path.join(paths.status, f"{batch}.json")


def read_status(paths, batch):
    p = _status_path(paths, batch)
    return _read(p) if os.path.isfile(p) else {}


def quarantine(paths, rid, rec, errors):
    """Take an admitted record and its sidecars out of admitted/: a record
    that cannot carry its flags does not ship."""
    stamp = _dt.datetime.now(_dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = os.path.join(paths.rejected, f"{stamp}-{rid}")
    os.makedirs(paths.rejected, exist_ok=True)
    _write_json(base + ".json", rec)
    _write_bytes(base + ".errors.txt", ("\n".join(errors) + "\n").encode("utf-8"))
    for suffix in (".evidence.json", ".critique.json"):
        src = os.path.join(paths.admitted, rid + suffix)
        if os.path.isfile(src):
            os.replace(src, base + suffix)
    src = os.path.join(paths.admitted, rid + ".json")
    if os.path.isfile(src):
        os.remove(src)
    return base + ".json"


def run_batch(plan, client, paths, *, max_usd=None, limit=None, retry=False, critic_client=None,
              today=None, live=False, log=print):
    """Generate the plan's briefs in order. Returns the status dict."""
    batch = plan["batch"]
    keys = [e["brief"]["key"] for e in plan["entries"]]
    if live and max_usd is None:
        raise SystemExit("a live run needs --max-usd")
    status = read_status(paths, batch)
    calls = 0
    for e in plan["entries"]:
        brief = e["brief"]
        key = brief["key"]
        st = status.get(key)
        if st and st.get("ok") and os.path.isfile(os.path.join(paths.admitted, f"{st['id']}.json")):
            continue
        if st and not st.get("ok") and not retry:
            continue
        if limit is not None and calls >= limit:
            break
        if max_usd is not None:
            spent, dearest, unpriced = batch_spend(paths.ledger, keys)
            if live and unpriced:
                log(f"STOP {batch}: unpriced model(s) {sorted(unpriced)} in the ledger; add them to "
                    "generate_trip.PRICES before a capped run can trust its spend")
                break
            if spent >= max_usd or spent + dearest > max_usd:
                log(f"STOP {batch}: USD {spent:.4f} spent, the dearest trip cost USD {dearest:.4f}, "
                    f"the cap is USD {max_usd:.2f}")
                break
        res = T.generate(brief, client, paths.gen, reuse=True, today=today, critic_client=critic_client)
        calls += 1
        entry = {"at": today or _today(), "ok": res["ok"], "stage": res["stage"], "id": res.get("id"),
                 "errors": list(res["errors"])[:10], "usd": res.get("usd"), "flags": None,
                 "perishableFlags": None}
        if res["ok"]:
            rec = _read(res["path"])
            flagged, ferr, added = add_perishable_flags(rec)
            if ferr:
                ok, errs = False, ferr
            else:
                ok, errs, _path = G.admit(flagged, paths.admitted, paths.rejected)
            if ok:
                entry.update(flags=len(flagged["verifyFlags"]), perishableFlags=added)
            else:
                quarantine(paths, rec["id"], flagged, errs)
                entry.update(ok=False, stage="flags", errors=list(errs)[:10])
        status[key] = entry
        _write_json(_status_path(paths, batch), status)
        log(f"{'ADMIT ' if entry['ok'] else 'REJECT'} {key} -> {entry['id']} ({entry['stage']})"
            + (f", {entry['flags']} flags of which {entry['perishableFlags']} perishable" if entry["ok"] else
               f": {entry['errors'][:2]}"))
    return status


# ── check: may this trip join the catalogue ──────────────────────────────────

def _fold(s):
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _title_words(t):
    return {w for w in _fold(t.get("title")).split() if len(w) > 2 and w not in _STOP}


def near_copy(a, b):
    """Why trip a reads as a copy of trip b in the same cell, or None."""
    wa, wb = _title_words(a), _title_words(b)
    if wa and wb and len(wa & wb) / len(wa | wb) >= 0.5:
        return f"title shares {sorted(wa & wb)} with {b['id']}"
    ba = {_fold(x) for x in a.get("basecamps") or [] if _fold(x)}
    bb = {_fold(x) for x in b.get("basecamps") or [] if _fold(x)}
    shared = {x for x in ba for y in bb if x == y or x.startswith(y + " ") or y.startswith(x + " ")}
    if ba and bb and len(shared) * 2 >= min(len(ba), len(bb)):
        return f"bases {sorted(shared)} are {b['id']}'s"
    return None


def _cells(trips):
    out = collections.defaultdict(list)
    for t in trips:
        for c in t.get("countries") or [{"code": t.get("countryCode")}]:
            out[(c["code"], t.get("tripTypeSlug"))].append(t)
    return out


def _record_for(paths, plan, entry, status, admitted):
    st = status.get(entry["brief"]["key"]) or {}
    if st.get("id") and st["id"] in admitted:
        return admitted[st["id"]]
    cell = (entry["brief"]["countryCode"], entry["brief"]["tripTypeSlug"])
    hits = [r for r in admitted.values()
            if (r["provenance"].get("batch"), r["countryCode"], r["tripTypeSlug"]) == (plan["batch"], *cell)]
    return hits[0] if len(hits) == 1 else None


def promotion_problems(rec, entry, plan, ctx):
    """Every reason this admitted record may not join the catalogue."""
    p = []
    brief, rid, prov = entry["brief"], rec["id"], rec.get("provenance") or {}

    # validator
    gate = G.check(rec)
    p += [f"validator: {e}" for e in gate[:10]]
    if ctx["places"] is not None and not gate:
        import validate as V
        for i in V.validate({"trips": [rec]}, wire=None, verify_urls=False, places=ctx["places"]):
            if i.level == "ERROR" and i.trip == rid:
                p.append(f"validator: k5/{i.code}: {i.detail}")
    if rid in ctx["curatedIds"]:
        p.append(f"validator: id {rid} is a curated trip's")

    # critic
    crit = R.side(ctx["admittedDir"], rid, ".critique.json")
    if not crit or crit.get("id") != rid:
        p.append("critic: no critique file for this record; the critic never ran on it")
    else:
        kinds = {c.get("kind") for c in crit.get("checks") or []}
        if kinds != set(T.CRITIC_KINDS):
            p.append(f"critic: checked {sorted(kinds)}, not all six kinds")
        if not str(prov.get("promptVersion", "")).endswith(crit.get("promptVersion") or "-"):
            p.append(f"critic: critique {crit.get('promptVersion')} is not the record's {prov.get('promptVersion')}")
        missing = [d["flag"] for d in crit.get("disputes") or [] if d.get("flag") not in rec["verifyFlags"]]
        if missing or crit.get("flagsDropped"):
            p.append(f"critic: {max(len(missing), crit.get('flagsDropped') or 0)} dispute(s) are not in verifyFlags")

    # provenance
    if prov.get("batch") != plan["batch"]:
        p.append(f"provenance: batch {prov.get('batch')!r} is not {plan['batch']!r}")
    if batch_region(prov.get("batch")) != rec.get("regionKey"):
        p.append(f"provenance: batch region is not the record's region {rec.get('regionKey')!r}")
    if prov.get("promptVersion") != ctx["promptVersion"]:
        p.append(f"provenance: written with prompts {prov.get('promptVersion')}, the tree has "
                 f"{ctx['promptVersion']}; regenerate")
    if not prov.get("ingestedAt") or rec.get("dataVintage") != int(str(prov.get("ingestedAt"))[:4]):
        p.append("provenance: dataVintage is not the year of provenance.ingestedAt")
    ev = R.side(ctx["admittedDir"], rid, ".evidence.json")
    # The trace is the evidence sidecar and each figure's sourceUrl, not
    # sources.verified: that paragraph is the writer's own account, which is
    # why the critic is not shown it.
    if not ev or not ev.get("pagesRead"):
        p.append("provenance: no evidence sidecar listing the pages read")

    # flags
    left = unflagged(rec)
    if left:
        p.append(f"flags: {len(left)} perishable field(s) without a verify flag, first {left[0][0]} at {left[0][1]}")

    # coverage
    cell = (rec["countryCode"], rec["tripTypeSlug"])
    if cell != (brief["countryCode"], brief["tripTypeSlug"]):
        p.append(f"coverage: the record is {cell}, the brief asked for "
                 f"{(brief['countryCode'], brief['tripTypeSlug'])}")
    tid = next(i for i, _n, s in C.TRIP_TYPES if s == rec["tripTypeSlug"])
    if GM.viability(rec["countryCode"], tid)[0] == "not-viable":
        p.append(f"coverage: {cell} is geographically blocked")
    others = [t for t in ctx["cells"].get(cell, []) if t["id"] != rid]
    if len(others) >= MAX_PER_CELL:
        p.append(f"coverage: the cell already holds {len(others)} trips, the cap is {MAX_PER_CELL}")
    for o in others + [r for r in ctx["batchRecords"] if r["id"] != rid
                       and (r["countryCode"], r["tripTypeSlug"]) == cell]:
        why = near_copy(rec, o)
        if why:
            p.append(f"coverage: near copy, {why}")

    # review
    q = ctx["queue"].get(rid)
    if q is None:
        p.append("review: not in the review queue")
    elif q["needsReview"]:
        p.append(f"review: {q['open']} open item(s) in the review queue")
    elif not q["closed"]:
        p.append("review: not closed against this record; close it (close-clean when nothing is flagged)")
    return p


def check_batch(plan, paths, places=None):
    status = read_status(paths, plan["batch"])
    admitted = {r["id"]: r for _n, r in R.record_files(paths.admitted)}
    master = _read(paths.master)
    expansion, _errs = load_expansion(paths.expansion)
    exp_ids = {r["id"] for r in expansion}
    trips = list(master["trips"]) + [r for r in expansion if r["id"] not in {t["id"] for t in master["trips"]}]
    queue = {t["id"]: t for t in R.build_queue(paths.admitted, paths.master)["trips"]} \
        if os.path.isdir(paths.admitted) else {}
    batch_records = [r for r in admitted.values() if r["provenance"].get("batch") == plan["batch"]]
    ctx = {"places": places, "curatedIds": {t["id"] for t in master["trips"] if not is_generated(t)},
           "admittedDir": paths.admitted, "promptVersion": T.prompt_version(), "cells": _cells(trips),
           "queue": queue, "batchRecords": batch_records}
    results = []
    for e in plan["entries"]:
        rec = _record_for(paths, plan, e, status, admitted)
        row = {"key": e["brief"]["key"], "cell": f"{e['brief']['countryCode']}:{e['brief']['tripTypeSlug']}",
               "id": rec["id"] if rec else None, "problems": [], "reviewedAt": None}
        if rec is None:
            st = status.get(e["brief"]["key"])
            row["state"] = "missing" if not st else f"rejected at {st.get('stage')}"
        else:
            row["problems"] = promotion_problems(rec, e, plan, ctx)
            rv = R.side(paths.admitted, rec["id"], ".review.json") or {}
            row["reviewedAt"] = rv.get("reviewedAt") if queue.get(rec["id"], {}).get("closed") else None
            row["state"] = ("promoted" if rec["id"] in exp_ids and not row["problems"] else
                            "ready" if not row["problems"] else "held")
        results.append(row)
    return results


def close_clean(plan, paths, reviewer, today=None):
    """Close the review of every trip in the batch the queue has nothing to
    show for. A person runs it; the reviewer name and date are recorded."""
    if not reviewer or not reviewer.strip():
        raise SystemExit("close-clean needs --reviewer")
    queue = R.build_queue(paths.admitted, paths.master)
    closed = []
    for t in queue["trips"]:
        rec = _read(os.path.join(paths.admitted, t["file"]))
        if rec["provenance"].get("batch") != plan["batch"] or t["items"] or t["closed"]:
            continue
        R.cmd_close(paths.admitted, t["id"], reviewer.strip(), today=today, master=paths.master)
        closed.append(t["id"])
    return closed


# ── promote, join, retract ───────────────────────────────────────────────────

def promote(plan, paths, write=False, places=None):
    """Copy every ready record of the batch to data/expansion/ with
    provenance.reviewedAt stamped from its review file. Returns the ids."""
    results = check_batch(plan, paths, places)
    done = []
    for row in results:
        if row["state"] not in ("ready", "promoted"):
            continue
        rid = row["id"]
        rec = _read(os.path.join(paths.admitted, f"{rid}.json"))
        rec["provenance"]["reviewedAt"] = row["reviewedAt"]
        errs = G.check(rec)
        if errs or not row["reviewedAt"]:
            raise SystemExit(f"{rid}: will not promote: {errs[:3] or ['no review date']}")
        done.append(rid)
        if not write:
            continue
        _write_bytes(os.path.join(paths.expansion, f"{rid}.json"), _crlf(rec))
        for suffix in (".evidence.json", ".critique.json", ".review.json"):
            src = os.path.join(paths.admitted, rid + suffix)
            if os.path.isfile(src):
                with open(src, "rb") as fh:
                    _write_bytes(os.path.join(paths.expansion, rid + suffix), fh.read())
    return results, done


def _sort_key(t):
    return (t["tripTypeId"], t["countryCode"], t["id"])


def _geocode(rec):
    try:
        import geocode
        return geocode.geocode_trip(rec)
    except Exception:  # noqa: BLE001  a missing optional gazetteer must not stop a join
        return None


def _csv_rows(text):
    return list(csv.DictReader(io.StringIO(text, newline="")))


def _csv_text(rows):
    import build
    buf = io.StringIO(newline="")
    w = csv.DictWriter(buf, fieldnames=build.CSV_COLUMNS)
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue()


def join(paths, write=False):
    """Put data/expansion/ into the master, the single files and the flat CSV.
    Curated trips are never rewritten: the master's generated trips are
    replaced by what data/expansion holds now, so a retract or a re-promote
    lands the same way. Refuses to write when any expansion record fails."""
    import build
    with open(paths.master, "rb") as fh:
        old_bytes = fh.read()
    master = json.loads(old_bytes.decode("utf-8"))
    curated = [t for t in master["trips"] if not is_generated(t)]
    old_gen = {t["id"]: t for t in master["trips"] if is_generated(t)}
    recs, errors = load_expansion(paths.expansion, {t["id"] for t in curated})
    if errors:
        return {"ok": False, "errors": errors}
    joined = []
    for r in recs:
        r = copy.deepcopy(r)
        prev = old_gen.get(r["id"])
        same = prev is not None and {k: v for k, v in prev.items() if k != "coordinates"} == \
            {k: v for k, v in r.items() if k != "coordinates"}
        r["coordinates"] = prev["coordinates"] if same else _geocode(r)
        joined.append(r)
    trips = sorted(curated + joined, key=_sort_key)
    counts = collections.Counter(t["provenance"]["batch"] for t in trips)
    regions = {k: counts[k] for k in master.get("regions", {}) if counts.get(k)}
    regions.update({k: counts[k] for k in sorted(counts) if k not in regions})
    new_master = {**master, "tripCount": len(trips), "regions": regions, "trips": trips}
    new_ids = {r["id"] for r in joined}
    summary = {"ok": True, "errors": [], "tripsBefore": len(master["trips"]), "tripsAfter": len(trips),
               "added": sorted(new_ids - set(old_gen)), "removed": sorted(set(old_gen) - new_ids),
               "replaced": sorted(i for i in new_ids & set(old_gen)
                                  if old_gen[i] != next(r for r in joined if r["id"] == i))}
    if not write:
        return summary
    master_bytes = _crlf(new_master)
    if master_bytes != old_bytes:
        _write_bytes(paths.master, master_bytes)
    for r in joined:
        path = os.path.join(paths.trips, f"{r['id']}.json")
        data = _crlf(r)
        if not os.path.isfile(path) or open(path, "rb").read() != data:
            _write_bytes(path, data)
    for rid in summary["removed"]:
        path = os.path.join(paths.trips, f"{rid}.json")
        if os.path.isfile(path) and is_generated(_read(path)):
            os.remove(path)
    if os.path.isfile(paths.csv):
        with open(paths.csv, "rb") as fh:
            raw = fh.read()
        gone = set(old_gen) | new_ids
        rows = [row for row in _csv_rows(raw.decode("utf-8")) if row["id"] not in gone]
        rows += [{k: ("" if v is None else v) for k, v in build.to_csv_row(r).items()} for r in joined]
        rows.sort(key=lambda row: (int(row["trip_type_id"]), row["country_code"], row["id"]))
        text = _csv_text(rows).encode("utf-8")
        if text != raw:
            _write_bytes(paths.csv, text)
    return summary


def retract(batch, paths, write=False):
    """Take one batch out of data/expansion/ and the catalogue."""
    if not BATCH_RE.match(batch or ""):
        raise SystemExit(f"{batch!r} is not a generated batch name; curated batches are not retracted here")
    gone = []
    if os.path.isdir(paths.expansion):
        for name in sorted(os.listdir(paths.expansion)):
            if not name.endswith(".json") or name.endswith(R.SIDECARS):
                continue
            rec = _read(os.path.join(paths.expansion, name))
            if (rec.get("provenance") or {}).get("batch") == batch:
                gone.append(rec["id"])
    if write:
        for rid in gone:
            for suffix in (".json",) + R.SIDECARS:
                p = os.path.join(paths.expansion, rid + suffix)
                if os.path.isfile(p):
                    os.remove(p)
    summary = join(paths, write=write) if write else {"ok": True}
    summary["retracted"] = gone
    return summary


# ── self-test ────────────────────────────────────────────────────────────────

def _scratch_root(tmp, drop_cell=("AT", "cycling")):
    """A dataset copy for tests: the real master without one cell, so the
    T143 example trip (Austria, cycling) fills a gap, with its single files
    and a flat CSV written the way build.py writes them."""
    import build
    master = _read(Paths().master)
    trips = [t for t in master["trips"]
             if not (t["tripTypeSlug"] == drop_cell[1] and any(c["code"] == drop_cell[0] for c in t["countries"]))]
    master = {**master, "trips": trips, "tripCount": len(trips),
              "regions": dict(collections.Counter(t["provenance"]["batch"] for t in trips))}
    paths = Paths(tmp)
    _write_bytes(paths.master, _crlf(master))
    for t in trips:
        _write_bytes(os.path.join(paths.trips, f"{t['id']}.json"), _crlf(t))
    rows = [{k: ("" if v is None else v) for k, v in build.to_csv_row(t).items()} for t in trips]
    _write_bytes(paths.csv, _csv_text(rows).encode("utf-8"))
    return paths


def self_test():
    import shutil
    import tempfile
    fails = []
    example = _read(G.EXAMPLE_PATH)
    today = example["provenance"]["ingestedAt"]
    tmp = tempfile.mkdtemp(prefix="t155-")
    quiet = lambda *_a, **_k: None  # noqa: E731
    try:
        paths = _scratch_root(tmp)
        before = {p: open(p, "rb").read() for p in (paths.master, paths.csv)}

        # 1. Slots and plan: the dropped cell is a fill gap; a plan for it is a
        # valid brief with no figure and no dash in the idea.
        s = slots_summary(paths, "western-central")
        if s["regions"]["western-central"]["fill"] < 1:
            fails.append("the dropped AT cycling cell is not a fill slot")
        plan = make_plan(paths, "western-central", 1, cells=["AT:cycling"], today=today)
        idea = plan["entries"][0]["brief"]["idea"]
        if plan_problems(plan) or re.search(r"[0-9\u2014\u2013\u00b7]", idea):
            fails.append(f"the plan is not runnable or its idea carries a figure or dash: {plan_problems(plan)}")
        _write_json(os.path.join(paths.plans, f"{plan['batch']}.json"), plan)
        try:
            make_plan(paths, "western-central", 1, today=today)
            fails.append("a batch was planned twice")
        except SystemExit:
            pass
        p2 = make_plan(paths, "western-central", 2, today=today)
        if any((e["brief"]["countryCode"], e["brief"]["tripTypeSlug"]) == ("AT", "cycling") for e in p2["entries"]):
            fails.append("a cell already in a plan was planned again")
        blocked = copy.deepcopy(plan)
        blocked["entries"][0]["brief"].update(countryCode="NL", tripTypeSlug="winter-sports")
        if not any("blocked" in e for e in plan_problems(blocked)):
            fails.append("a blocked cell passed the plan check")

        # 2. Run with stubs: admitted, with every perishable flagged.
        stub = T.StubClient(T.fixture_bodies(example))
        status = run_batch(plan, stub, paths, today=today, log=quiet)
        st = status[plan["entries"][0]["brief"]["key"]]
        if not st["ok"]:
            fails.append(f"the stub trip was not admitted: {st['stage']} {st['errors'][:2]}")
            raise RuntimeError("stop")
        rec = _read(os.path.join(paths.admitted, f"{st['id']}.json"))
        if unflagged(rec) or not st["perishableFlags"] or G.check(rec):
            fails.append(f"perishable flags missing or the flagged record fails the gate: {unflagged(rec)[:2]}")
        if rec["provenance"]["batch"] != plan["batch"]:
            fails.append("provenance.batch is not the plan's batch")
        again = run_batch(plan, T.StubClient({}), paths, today=today, log=quiet)
        if again != status:
            fails.append("a second run touched an admitted trip")

        # 3. Check holds it for review, close-clean closes it, then it is ready.
        res = check_batch(plan, paths)[0]
        if res["state"] != "held" or not any(x.startswith("review:") for x in res["problems"]):
            fails.append(f"an unreviewed trip was not held for review: {res}")
        if close_clean(plan, paths, "self-test", today=today) != [st["id"]]:
            fails.append("close-clean did not close the clean trip")
        res = check_batch(plan, paths)[0]
        if res["state"] != "ready":
            fails.append(f"a reviewed trip is not ready: {res['problems'][:3]}")

        # 4. A record missing a flag, with stale prompts or a dropped
        # dispute is held.
        stripped = copy.deepcopy(rec)
        stripped["verifyFlags"] = stripped["verifyFlags"][:-1]
        if not unflagged(stripped):
            fails.append("a missing perishable flag was not noticed")
        stale = copy.deepcopy(rec)
        stale["provenance"]["promptVersion"] = "k2-0.0.0-k4-0"
        ctx = {"places": None, "curatedIds": set(), "admittedDir": paths.admitted, "promptVersion": T.prompt_version(),
               "cells": {}, "queue": {}, "batchRecords": []}
        if not any("regenerate" in x for x in promotion_problems(stale, plan["entries"][0], plan, ctx)):
            fails.append("a record written with old prompts was not held")

        # 5. Promote, join, retract: join adds one trip and one CSV row,
        # retract restores the files byte for byte.
        _res, done = promote(plan, paths, write=True)
        prom = _read(os.path.join(paths.expansion, f"{st['id']}.json"))
        if done != [st["id"]] or prom["provenance"]["reviewedAt"] != today:
            fails.append("promote did not stamp provenance.reviewedAt from the review")
        j = join(paths, write=True)
        m = _read(paths.master)
        if not j["ok"] or j["added"] != [st["id"]] or m["tripCount"] != len(m["trips"]) \
                or m["regions"].get(plan["batch"]) != 1:
            fails.append(f"join did not add exactly the promoted trip: {j}")
        if not os.path.isfile(os.path.join(paths.trips, f"{st['id']}.json")):
            fails.append("join wrote no single file")
        if sum(r["id"] == st["id"] for r in _csv_rows(open(paths.csv, encoding="utf-8", newline="").read())) != 1:
            fails.append("join wrote no CSV row")
        if join(paths, write=False)["added"]:
            fails.append("a second join would add the trip again")
        retract(plan["batch"], paths, write=True)
        if any(open(p, "rb").read() != b for p, b in before.items()) \
                or os.path.exists(os.path.join(paths.trips, f"{st['id']}.json")):
            fails.append("retract did not restore the master, CSV and single files")

        # 6. Coverage: the same trip in a cell that already holds the curated
        # Donauradweg is a near copy.
        real = _read(Paths().master)
        curated = next(t for t in real["trips"] if t["id"] == "at-cycling-donauradweg-wachau")
        if not near_copy(rec, curated):
            fails.append("the example trip is not seen as a copy of the curated Donauradweg")

        # 7. Perishable detection.
        for text, want in (("The abbey is closed on Mondays and opens at 9:30.", True),
                           ("Huts open from late June to mid September.", True),
                           ("The valley opens out into open meadows.", False),
                           ("Close to the station, a quiet guesthouse.", False)):
            if bool(opening_quote(text)) != want:
                fails.append(f"opening time detection is wrong on {text!r}")
        if not BOOK_RE.search("Book the hut two months ahead.") or BOOK_RE.search("Book through the website."):
            fails.append("booking window detection is wrong")
        over = copy.deepcopy(rec)
        over["verifyFlags"] = [f"Withheld field{i}: no source given" for i in range(flag_cap())]
        if not add_perishable_flags(over)[1]:
            fails.append("a trip over the flag cap was not refused")
    except RuntimeError:
        pass
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    for f in fails:
        print(f"SELF-TEST FAIL: {f}")
    if not fails:
        print("SELF-TEST OK: slots and plans by region, no cell planned twice, blocked cells refused, stub batch "
              "admitted with every perishable flagged, held until reviewed, promoted with its review date, joined "
              "and retracted byte for byte, near copies and stale prompts held, flag cap enforced")
    return 1 if fails else 0


# ── cli ──────────────────────────────────────────────────────────────────────

def _places():
    try:
        import validate as V
        if os.path.isfile(V.DEFAULT_GAZETTEER):
            return V.load_place_index(V.DEFAULT_GAZETTEER)
    except Exception:  # noqa: BLE001  the place check is optional, as in validate.py
        return None
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("slots")
    s.add_argument("--region", choices=REGION_KEYS)
    s.add_argument("--json", action="store_true")
    p = sub.add_parser("plan")
    p.add_argument("--region", required=True, choices=REGION_KEYS)
    p.add_argument("--wave", required=True, type=int)
    p.add_argument("--mode", default="fill", choices=("fill", "deepen"))
    p.add_argument("--size", type=int, default=BATCH_SIZE)
    p.add_argument("--cells", help="only these cells, CC:slug comma-separated")
    p.add_argument("--write", action="store_true", help="write expansion/<batch>.json")
    r = sub.add_parser("run")
    r.add_argument("plan")
    g = r.add_mutually_exclusive_group(required=True)
    g.add_argument("--live", action="store_true", help="call Gemini (paid)")
    g.add_argument("--stub", help="folder of recorded pass1/pass2/pass3/critic bodies")
    r.add_argument("--max-usd", type=float)
    r.add_argument("--limit", type=int)
    r.add_argument("--retry", action="store_true", help="run briefs an earlier run rejected")
    r.add_argument("--model", action="append")
    r.add_argument("--critic-model", action="append")
    c = sub.add_parser("check")
    c.add_argument("plan")
    c.add_argument("--json")
    cc = sub.add_parser("close-clean")
    cc.add_argument("plan")
    cc.add_argument("--reviewer", required=True)
    pr = sub.add_parser("promote")
    pr.add_argument("plan")
    pr.add_argument("--write", action="store_true")
    j = sub.add_parser("join")
    j.add_argument("--write", action="store_true")
    rt = sub.add_parser("retract")
    rt.add_argument("batch")
    rt.add_argument("--write", action="store_true")
    sub.add_parser("self-test")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    paths = Paths()

    if args.cmd == "self-test":
        return self_test()
    if args.cmd == "slots":
        out = slots_summary(paths, args.region)
        if args.json:
            print(json.dumps(out, ensure_ascii=False, indent=1))
            return 0
        print(f"{out['trips']} trips in the catalogue, at most {MAX_PER_CELL} per cell")
        for key, reg in out["regions"].items():
            print(f"  {key}: {reg['trips']} trips; {reg['fill']} cells to fill ({reg['fillMarginal']} marginal), "
                  f"{reg['deepen']} to deepen, {reg['planned']} planned, {reg['blocked']} blocked")
        print(f"fill {out['fill']}, deepen {out['deepen']}, planned {out['planned']}: "
              f"{out['projectedTrips']} trips when every open cell is made")
        print(f"at EUR {EST_EUR_PER_TRIP[0]} to {EST_EUR_PER_TRIP[1]} a trip: fill EUR {out['eurToFill'][0]} to "
              f"{out['eurToFill'][1]}, deepen EUR {out['eurToDeepen'][0]} to {out['eurToDeepen'][1]}")
        return 0
    if args.cmd == "plan":
        plan = make_plan(paths, args.region, args.wave, args.mode, args.size,
                         args.cells.split(",") if args.cells else None)
        if args.write:
            _write_json(os.path.join(paths.plans, f"{plan['batch']}.json"), plan)
        print(f"{plan['batch']}: {len(plan['entries'])} briefs, EUR {plan['estimateEur']['low']} to "
              f"{plan['estimateEur']['high']}" + ("" if args.write else " (not written; add --write)"))
        for e in plan["entries"]:
            b = e["brief"]
            print(f"  {b['countryCode']} {b['tripTypeSlug']:14} {e['slot']['viability']:8} {b['key']}")
        return 0
    if args.cmd == "join":
        out = join(paths, args.write)
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0 if out["ok"] else 1
    if args.cmd == "retract":
        out = retract(args.batch, paths, args.write)
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return 0 if out.get("ok", True) else 1

    plan = load_plan(args.plan)
    if args.cmd == "run":
        if args.stub:
            client = T.StubClient(args.stub)
        else:
            sys.path.insert(0, os.path.join(ROOT, "..", "..", "..", "pipeline"))
            try:
                from env_local import load_env  # repo-root .env, the sanctioned paste spot
                load_env()
            except ImportError:
                pass
            client = T.GeminiClient(args.model)
        critic = T.GeminiClient(args.critic_model) if args.critic_model and args.live else None
        status = run_batch(plan, client, paths, max_usd=args.max_usd, limit=args.limit, retry=args.retry,
                           critic_client=critic, live=args.live)
        spent, dearest, unpriced = batch_spend(paths.ledger, [e["brief"]["key"] for e in plan["entries"]])
        ok = sum(1 for v in status.values() if v.get("ok"))
        print(f"{plan['batch']}: {ok} admitted, {len(status) - ok} rejected, {len(plan['entries']) - len(status)} "
              f"not run; USD {spent:.4f} spent, dearest trip USD {dearest:.4f}"
              + (f"; unpriced {sorted(unpriced)}" if unpriced else ""))
        return 0
    if args.cmd == "close-clean":
        closed = close_clean(plan, paths, args.reviewer)
        print(f"closed {len(closed)} review(s): {', '.join(closed) or 'none'}")
        return 0
    places = _places()
    if args.cmd == "check":
        results = check_batch(plan, paths, places)
        if args.json:
            _write_json(args.json, results)
        for row in results:
            print(f"{row['state']:9} {row['cell']:20} {row['id'] or row['key']}")
            for x in row["problems"][:8]:
                print(f"            {x}")
        n = collections.Counter(r["state"] for r in results)
        print(f"{plan['batch']}: " + ", ".join(f"{v} {k}" for k, v in sorted(n.items()))
              + ("" if places is not None else "; place check skipped, no gazetteer"))
        return 0 if all(r["state"] in ("ready", "promoted") for r in results) else 1
    if args.cmd == "promote":
        _results, done = promote(plan, paths, args.write, places)
        print(f"{plan['batch']}: {len(done)} record(s) " + ("promoted to data/expansion" if args.write
                                                           else "would be promoted (add --write)"))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
