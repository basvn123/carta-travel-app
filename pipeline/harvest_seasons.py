"""Seasons and closures: the months a place, its huts, lifts and ferries are open (T1202, D18).

Tier: Scheduled (run_pipeline task seasons)

Source: OpenStreetMap contributors, ODbL 1.0 (commercial use allowed, credit
required). One pass over each Geofabrik country extract the pipeline already
keeps (data/raw/geofabrik/, the same files pipeline/beaches/osm_extract.py
reads), keeping objects with an `opening_hours` or `seasonal` tag, and every
ferry route (a year-round ferry with no hours tag still counts as a way in).

What is kept per object (a "facility"):

    kind    hut (tourism=alpine_hut), lift (aerialway=*), ferry (route=ferry or
            amenity=ferry_terminal), or place (anything else whose name is the
            destination's own name, a beach town's lido for example)
    open    the months (1 to 12) it is open, from the month selectors of
            `opening_hours` (MONTH RULES below), else from `seasonal=summer`,
            `winter`, `spring` or `autumn`; None when neither says months
    conf    high    opening_hours months and a check date (check_date,
                    opening_hours:check_date, survey:date) under
                    CHECK_FRESH_DAYS old
            medium  opening_hours months, no or an older check date
            low     a seasonal=<season> word only (months by convention)
    checked the check date when the object carries one

The destination's own `season` block (the wire field):

    open    the months the PLACE can be visited, only when one of two rules
            holds, else absent:
              own     a facility within OWN_KM whose name is the
                      destination's name says months (the place is the hut,
                      the lift or the lido);
              ferry   the destination is an island (categories holds
                      "island") and every ferry within FERRY_KM is seasonal
                      with medium or high confidence: the union of their
                      months. One year-round ferry keeps the island open.
            A hut or a lift near a village never closes the village: it is
            listed under `items` instead.
    conf    the lowest confidence of the facilities behind `open`
    why     own or ferry
    checked the newest check date behind `open`, or absent
    items   at most KEEP_ITEMS seasonal facilities nearby, nearest first:
            [{"n": name, "k": kind, "open": [months], "conf": ...}]
    _src, _asof  osm_seasons and the build date (pipeline/provenance.py)

A destination with neither `open` nor any item gets no block at all: absence
means "nothing seasonal mapped", never "open all year, checked".

MONTH RULES (the month-level reading of the opening_hours grammar):
    rules split on ";" and "||" (a fallback rule is read as a normal rule);
    each rule may start with a month selector: "May-Oct", "Jun 15-Sep 30",
    "Jun,Aug", "Dec-Feb" (wraps the year), "2026 May-Oct" (the year is
    dropped); a rule without one covers all twelve months; "off" or
    "closed" at the end of a rule closes its months; a later rule overrides
    an earlier one for its months (OSM semantics); a comma followed by a
    month starts an additional rule. A month counts open when any day of it
    is open. Rules on PH or SH alone are skipped (holidays are not months).
    Anything else month-like (week numbers, easter, "Jan Su[1]") makes the
    string unreadable at month level, and the facility is skipped.

Research (T1202 report): opening-hours-py 2.1.5 (MIT/Apache) parses the full
grammar but only months are needed; this reader has no dependency and is
cross-checked against that library on the fixtures in tests/test_seasons.py
when it is installed.

Usage, from the repo root:
    python pipeline/harvest_seasons.py --countries AT,HR      # scan, join, apply to the master
    python pipeline/harvest_seasons.py --facilities FILE.json --master WIRE.json --dry-run
    python pipeline/harvest_seasons.py --parse "May-Oct 09:00-18:00"

ASCII clean, no em dashes, per project convention.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

MASTER = ROOT / "app_data" / "app_data.json"
OVERLAY = "dest_seasons"
LAYER_SRC = "osm_seasons"

CHECK_FRESH_DAYS = 3 * 365   # a check date under three years old makes "high"
OWN_KM = 2.0                 # a facility named like the place, this close, is the place
FERRY_KM = 3.0               # a ferry route this close to an island serves it
ITEM_KM = {"hut": 8.0, "lift": 5.0, "ferry": 3.0, "place": 2.0}
KEEP_ITEMS = 4
CONF_RANK = {"low": 0, "medium": 1, "high": 2}
SEASON_WORDS = {             # seasonal=<word>, months by the European convention
    "spring": [3, 4, 5],
    "summer": [6, 7, 8],
    "autumn": [9, 10, 11],
    "winter": [12, 1, 2],
}
LIFT_KINDS = {"cable_car", "gondola", "mixed_lift", "chair_lift", "drag_lift",
              "t-bar", "j-bar", "platter", "rope_tow", "magic_carpet", "zip_line",
              "funicular"}

MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
_MON = r"(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
_POINT = rf"{_MON}(?:\s+\d{{1,2}})?"
_RANGE = rf"{_POINT}(?:\s*-\s*{_POINT})?"
_SEL = rf"(?:\d{{4}}\s+)?{_RANGE}(?:\s*,\s*(?:\d{{4}}\s+)?{_RANGE})*"
SEL_AT_START = re.compile(rf"^\s*({_SEL})(?=$|[\s:;])", re.IGNORECASE)
COMMA_SEL = re.compile(rf",\s*(?={_SEL}(?:$|[\s:;]))", re.IGNORECASE)
# Month-level forms this reader refuses rather than guesses.
UNREADABLE = re.compile(r"\bweek\b|easter|\[|\bSH\b(?!\s+off)", re.IGNORECASE)
ALL_YEAR = re.compile(r"^\s*(24/7|sunrise-sunset|sunrise\s*-\s*sunset)\s*$", re.IGNORECASE)


def _month_no(token: str) -> int:
    return MONTHS.index(token[:3].lower()) + 1


def _expand(selector: str) -> set[int]:
    """The months one selector names: "Dec-Feb" is {12, 1, 2}."""
    months: set[int] = set()
    for part in selector.split(","):
        part = re.sub(r"^\s*\d{4}\s+", "", part.strip())
        ends = [p.strip() for p in part.split("-")]
        a = _month_no(re.match(_MON, ends[0], re.IGNORECASE).group(0))
        b = _month_no(re.match(_MON, ends[-1], re.IGNORECASE).group(0)) if len(ends) > 1 else a
        m = a
        while True:
            months.add(m)
            if m == b:
                break
            m = m % 12 + 1
    return months


def months_open(oh: str | None) -> list[int] | None:
    """The months (sorted) an opening_hours value is open, or None when the
    value says nothing readable at month level. Twelve months is all year."""
    if not oh or not isinstance(oh, str):
        return None
    text = re.sub(r'"[^"]*"', "", oh).strip()   # comments carry no months
    if not text:
        return None
    if ALL_YEAR.match(text):
        return list(range(1, 13))
    if UNREADABLE.search(text):
        return None
    state = [None] * 12
    rules = [r for r in re.split(r";|\|\|", text) if r.strip()]
    for rule in rules:
        piece = rule.strip()
        while piece:
            if re.match(r"^(PH|SH)\b", piece, re.IGNORECASE):
                break   # a holiday-only rule: not a month
            m = SEL_AT_START.match(piece)
            months = _expand(m.group(1)) if m else set(range(1, 13))
            rest = piece[m.end():] if m else piece
            # A comma followed by a month starts an additional rule.
            nxt = COMMA_SEL.search(rest)
            body, piece = (rest[:nxt.start()], rest[nxt.end():].strip()) if nxt else (rest, "")
            off = bool(re.search(r"\b(off|closed)\s*$", body, re.IGNORECASE))
            if re.search(rf"\b{_MON}\b", body, re.IGNORECASE):
                return None   # a month further in (e.g. "Mo-Fr Jan"): not ours to guess
            for mo in months:
                state[mo - 1] = not off
    open_ = [i + 1 for i, v in enumerate(state) if v]
    return open_ or None


def _parse_day(v) -> date | None:
    if not isinstance(v, str):
        return None
    m = re.match(r"^(\d{4})-(\d{2})(?:-(\d{2}))?", v.strip())
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3) or 1))
    except ValueError:
        return None


def check_date(tags: dict) -> date | None:
    days = [_parse_day(tags.get(k)) for k in ("opening_hours:check_date", "check_date", "survey:date")]
    days = [d for d in days if d]
    return max(days) if days else None


def season_of(tags: dict, today: date) -> dict | None:
    """{open, conf, checked} for a seasonal object, None for one open all
    year or with no readable months."""
    open_ = months_open(tags.get("opening_hours"))
    conf = None
    if open_ is not None:
        if len(open_) == 12:
            return None
        checked = check_date(tags)
        fresh = checked is not None and (today - checked).days <= CHECK_FRESH_DAYS
        conf = "high" if fresh else "medium"
    else:
        word = (tags.get("seasonal") or "").strip().lower()
        if word not in SEASON_WORDS:
            return None
        open_ = sorted(SEASON_WORDS[word])
        checked = check_date(tags)
        conf = "low"
    return {"open": open_, "conf": conf, "checked": checked.isoformat() if checked else None}


def kind_of(tags: dict) -> str | None:
    if tags.get("tourism") == "alpine_hut":
        return "hut"
    if tags.get("aerialway") in LIFT_KINDS or tags.get("railway") == "funicular":
        return "lift"
    if tags.get("route") == "ferry" or tags.get("amenity") == "ferry_terminal":
        return "ferry"
    if tags.get("name") and (tags.get("opening_hours") or tags.get("seasonal")):
        return "place"
    return None


def facility(tags: dict, lat: float, lon: float, today: date, pts=None) -> dict | None:
    """One row for the overlay, or None when the object is of no kind we keep.
    A ferry keeps its row even when it runs all year (open None, seasonal
    False), since a year-round ferry keeps an island open."""
    kind = kind_of(tags)
    if kind is None:
        return None
    s = season_of(tags, today)
    if s is None and kind != "ferry":
        return None
    row = {"kind": kind, "name": (tags.get("name") or "").strip(), "lat": round(lat, 5), "lon": round(lon, 5),
           "seasonal": s is not None}
    if s:
        row.update(s)
    if pts:
        row["pts"] = [[round(a, 4), round(b, 4)] for a, b in pts]
    return row


def hav(a, b, c, d):
    p = math.pi / 180
    x = math.sin((c - a) * p / 2) ** 2 + math.cos(a * p) * math.cos(c * p) * math.sin((d - b) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(min(1.0, x)))


def _km(f: dict, la: float, lo: float) -> float:
    pts = f.get("pts") or [[f["lat"], f["lon"]]]
    return min(hav(la, lo, a, b) for a, b in pts)


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def _lowest(confs):
    return min(confs, key=lambda c: CONF_RANK[c])


def season_block(d: dict, facilities: list[dict]) -> dict | None:
    """The destination's season block (see the module notes), or None."""
    la, lo = d.get("city_lat", d.get("lat")), d.get("city_lon", d.get("lon"))
    if la is None or lo is None:
        return None
    near = []
    for f in facilities:
        km = _km(f, la, lo)
        if km <= ITEM_KM.get(f["kind"], 0):
            near.append((km, f))
    near.sort(key=lambda t: t[0])
    block: dict = {}
    names = {_norm(d.get("city") or ""), _norm(d.get("name") or "")} - {""}
    own = [f for km, f in near if km <= OWN_KM and f.get("seasonal") and _norm(f["name"]) in names]
    ferries = [f for km, f in near if f["kind"] == "ferry" and km <= FERRY_KM]
    is_island = "island" in (d.get("categories") or [])
    behind = None
    if own:
        behind, why = own[:1], "own"
    elif (is_island and ferries and all(f.get("seasonal") for f in ferries)
          and all(CONF_RANK[f["conf"]] >= CONF_RANK["medium"] for f in ferries)):
        behind, why = ferries, "ferry"
    if behind:
        months = sorted({m for f in behind for m in f["open"]})
        if len(months) < 12:
            block["open"] = months
            block["conf"] = _lowest([f["conf"] for f in behind])
            block["why"] = why
            dates = [f["checked"] for f in behind if f.get("checked")]
            if dates:
                block["checked"] = max(dates)
    items, seen = [], set()
    for km, f in near:
        if not f.get("seasonal") or not f["name"]:
            continue
        key = (f["kind"], _norm(f["name"]))
        if key in seen:
            continue
        seen.add(key)
        items.append({"n": f["name"], "k": f["kind"], "open": f["open"], "conf": f["conf"]})
        if len(items) == KEEP_ITEMS:
            break
    if items:
        block["items"] = items
    return block or None


def join(dests: dict, facilities: list[dict]) -> dict:
    """{destination id: season block} for every destination that has one."""
    rows = {}
    for did, d in dests.items():
        if d.get("tier") == "airport":
            continue
        b = season_block(d, facilities)
        if b:
            rows[did] = b
    return rows


def apply(dests: dict, rows: dict, today_iso: str) -> int:
    """Write the blocks into the destinations (a fresh dict each, stamped
    here); a destination with no row loses an old block. Returns the count."""
    n = 0
    for did, d in dests.items():
        row = rows.get(did)
        if row:
            d["season"] = {**row, "_src": LAYER_SRC, "_asof": today_iso}
            n += 1
        else:
            d.pop("season", None)
    return n


def scan(path: Path, today: date) -> list[dict]:
    """Every kept facility in one Geofabrik extract (pyosmium, one pass)."""
    import osmium
    from osmium.filter import KeyFilter

    out = []
    fp = (osmium.FileProcessor(str(path))
          .with_locations("flex_mem")
          .with_filter(KeyFilter("opening_hours", "seasonal", "route", "amenity")))
    for obj in fp:
        tags = {t.k: t.v for t in obj.tags}
        if kind_of(tags) is None:
            continue
        if obj.is_node():
            row = facility(tags, obj.location.lat, obj.location.lon, today)
        elif obj.is_way():
            pts = [(n.location.lat, n.location.lon) for n in obj.nodes if n.location.valid()]
            if not pts:
                continue
            step = max(1, len(pts) // 20)   # a ferry line: every 20th point is enough at km scale
            pts = pts[::step] + [pts[-1]]
            la = sum(p[0] for p in pts) / len(pts)
            lo = sum(p[1] for p in pts) / len(pts)
            row = facility(tags, la, lo, today, pts if tags.get("route") == "ferry" else None)
        else:
            continue
        if row:
            out.append(row)
    return out


def summary(rows: dict) -> dict:
    by_why, by_conf, items = {}, {}, 0
    for r in rows.values():
        if "open" in r:
            by_why[r["why"]] = by_why.get(r["why"], 0) + 1
            by_conf[r["conf"]] = by_conf.get(r["conf"], 0) + 1
        items += len(r.get("items") or [])
    return {"blocks": len(rows), "with_open": sum(by_why.values()), "by_why": by_why,
            "by_conf": by_conf, "items": items}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--countries", help="ISO2 list, default every extract on disk")
    ap.add_argument("--facilities", help="read facilities from this JSON list instead of scanning")
    ap.add_argument("--master", default=str(MASTER), help="the master to apply to")
    ap.add_argument("--dry-run", action="store_true", help="join and print, write nothing")
    ap.add_argument("--parse", help="print the open months of one opening_hours value and exit")
    a = ap.parse_args(argv)
    if a.parse is not None:
        print(json.dumps(months_open(a.parse)))
        return 0
    today = datetime.now(timezone.utc).date()
    if a.facilities:
        facilities = json.loads(Path(a.facilities).read_text(encoding="utf-8"))
    else:
        sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
        import osm_extract  # noqa: E402
        have = osm_extract.available()
        want = set(a.countries.upper().split(",")) if a.countries else set(have)
        paths = sorted({p for cc, p in have.items() if cc in want})
        if not paths:
            print("no Geofabrik extract on disk for", ",".join(sorted(want)) or "any country")
            return 3
        facilities = []
        for p in paths:
            got = scan(p, today)
            print(f"{p.name}: {len(got)} facilities")
            facilities += got
    master = Path(a.master)
    data = json.loads(master.read_text(encoding="utf-8"))
    dests = data["destinations"]
    rows = join(dests, facilities)
    print(json.dumps(summary(rows)))
    if a.dry_run:
        return 0
    import explore_overlay as ov  # noqa: E402
    meta = {"source": "OpenStreetMap contributors", "licence": "ODbL-1.0", "date": today.isoformat(),
            "facilities": len(facilities), "rule": "t1202-v1"}
    ov.save(OVERLAY, rows, meta)
    apply(dests, rows, today.isoformat())
    data.setdefault("meta", {}).setdefault("data_sources", {})["osm_seasons"] = {
        "provider": "OpenStreetMap opening_hours and seasonal tags (Geofabrik extracts)",
        "license": "ODbL (c) OpenStreetMap contributors",
        "used_for": "the months a place, its huts, lifts and ferries are open",
    }
    from pipeline_io import atomic_write_json  # noqa: E402
    atomic_write_json(master, data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
