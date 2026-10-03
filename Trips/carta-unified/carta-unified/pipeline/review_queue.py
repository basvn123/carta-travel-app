#!/usr/bin/env python3
"""The review queue: a person reads flagged fields only (T154, trips spec K7).

    python pipeline/review_queue.py queue [DIR] [--all] [--json FILE] [--md FILE]
    python pipeline/review_queue.py verdict DIR TRIP_ID ITEM_KEY VERDICT --note TEXT --reviewer NAME
    python pipeline/review_queue.py close DIR TRIP_ID --reviewer NAME
    python pipeline/review_queue.py notes [DIR]
    python pipeline/review_queue.py self-test

DIR defaults to data/generated/admitted, where generate_trip.py writes. At
253 trips and growing, reading whole files does not scale, and most of a file
is safe: it passed the gate, its figures were sourced from pages the model's
search actually read, and a separate critic looked for faults. So a trip
enters the queue only for four reasons, and only the fields behind them:

  disputed    the critic (T145) disputed a field. Read from <id>.critique.json,
              which holds the kind, severity, quote, reason and URL, and
              whether the URL was among the pages the critic read.
  estimated   a sourced figure worth at least ESTIMATE_MIN_EUR whose evidence
              row says in its basis that the page gives an estimate, an
              approximate or a typical value. Read from <id>.evidence.json.
              Figures in kilometres or minutes never qualify: the threshold is
              money, because a wrong price costs a traveller and a wrong
              distance costs a reviewer.
  new country or style
              the trip's country code or trip type has no trip in the
              catalogue (data/trips.master.json) and none already reviewed in
              DIR. The whole record is read once, as the first of its kind; the
              next one in that country or style is not.
  notes       sources.confidenceNotes is missing or a placeholder. It is
              required: it is the writer's own statement of what it could not
              confirm and the reviewer's starting point. The schema refuses a
              null or short one, so this only fires for a record that bypassed
              the gate.

Everything else ships on the automated checks. Evidence rows the evidence rule
withheld are not queued: the figure is already absent from the record.

A reviewer's verdict has to live somewhere that survives a re-run. It goes in
<id>.review.json beside the record:

  format        1
  id            the trip id
  recordSha     SHA-1 of the record file the verdicts were given against
  reviewer      name, set by `close`
  reviewedAt    ISO date, set by `close`; null while the review is open
  verdicts      {item key: {verdict, note, reviewer, at}}

An item key is "<path>#<kind>" (itinerary[3].dayStats.ascentM#terrain,
budget.breakdown.food#estimated, *#new-country, *#notes). A verdict is one of
upheld (the flag was right; the reviewer fixed the field or will), dismissed
(the flag was wrong) or accepted (an estimate the reviewer is content with).
It needs a note: one sentence is the whole cost. If the record is regenerated
its sha changes and every verdict on it is stale; the queue shows the items
open again, because a verdict on a field that was rewritten says nothing about
the new one. `close` refuses while an item has no verdict, and writes
reviewedAt. It does not touch the record: provenance.reviewedAt in the record
is stamped by whatever copies admitted records into the catalogue (T154-b),
so the gate's "never repairs" rule holds.

No network call is made. The Claude API is never used.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import generation_gate as G  # noqa: E402

ROOT = G.ROOT
DEFAULT_DIR = os.path.join(ROOT, "data", "generated", "admitted")
MASTER = os.path.join(ROOT, "data", "trips.master.json")

# First guesses, to revisit after one measured run (T154-a).
ESTIMATE_MIN_EUR = 150
ESTIMATE_RE = re.compile(r"\b(?:estimat\w*|approx\w*|roughly|around|about|typical\w*|assum\w*|"
                         r"ballpark|guess\w*|expected|average)\b", re.I)
MONEY_PATHS = ("budget.breakdown", "priceEur", "spendEur")
VERDICTS = ("upheld", "dismissed", "accepted")
SIDECARS = (".evidence.json", ".critique.json", ".review.json")
SEVERITY = {"high": 0, "medium": 1, "low": 2}
KIND_ORDER = {"disputed": 0, "notes": 1, "new-country": 2, "new-style": 3, "estimated": 4}
MIN_NOTE = 30
PLACEHOLDER_RE = re.compile(r"^\W*(?:none|n/?a|nothing|tbd|todo|unknown|no notes?)\W*$", re.I)


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _write(path, obj):
    G._write_atomic(path, json.dumps(obj, ensure_ascii=False, indent=1) + "\n")


def _sha(path):
    with open(path, "rb") as fh:
        return hashlib.sha1(fh.read()).hexdigest()


def _leaves(x):
    if isinstance(x, dict):
        return sum(_leaves(v) for v in x.values())
    if isinstance(x, list):
        return sum(_leaves(v) for v in x)
    return 0 if x is None else 1


def record_files(folder):
    """The <id>.json records in a folder, never the sidecars beside them."""
    out = []
    for name in sorted(os.listdir(folder)) if os.path.isdir(folder) else []:
        if not name.endswith(".json") or name.endswith(SIDECARS):
            continue
        try:
            rec = _read(os.path.join(folder, name))
        except (OSError, ValueError):
            continue
        if isinstance(rec, dict) and "id" in rec and "provenance" in rec:
            out.append((name, rec))
    return out


def side(folder, rec_id, suffix):
    path = os.path.join(folder, rec_id + suffix)
    return _read(path) if os.path.isfile(path) else None


def notes_problem(rec):
    """Why a record's confidenceNotes does not meet the requirement, or None."""
    note = (rec.get("sources") or {}).get("confidenceNotes")
    if not isinstance(note, str) or not note.strip():
        return "sources.confidenceNotes is missing"
    if len(note.strip()) < MIN_NOTE or PLACEHOLDER_RE.match(note):
        return f"sources.confidenceNotes is a placeholder or under {MIN_NOTE} characters"
    return None


def figure_eur(row):
    """The largest euro amount a sourced figure row holds, or None when the
    figure is not money."""
    if not any(m in row["path"] for m in MONEY_PATHS):
        return None
    v = row.get("value")
    nums = [x for x in (v.values() if isinstance(v, dict) else [v]) if isinstance(x, (int, float))]
    return max(nums) if nums else None


def catalogue_sets(master=MASTER):
    """Countries and styles that already have a curated trip."""
    countries, styles = set(), set()
    if os.path.isfile(master):
        for t in _read(master).get("trips", []):
            countries.add(t.get("countryCode"))
            styles.add(t.get("tripTypeSlug"))
    return countries, styles


def reviewed_sets(folder, skip_id=None):
    """Countries and styles of trips in folder whose review was closed."""
    countries, styles = set(), set()
    for _name, rec in record_files(folder):
        rv = side(folder, rec["id"], ".review.json")
        if rec["id"] != skip_id and rv and rv.get("reviewedAt"):
            countries.add(rec.get("countryCode"))
            styles.add(rec.get("tripTypeSlug"))
    return countries, styles


def items_for(rec, evidence, critique, known_countries, known_styles):
    """The flagged fields of one trip, as a list of item dicts."""
    items = []

    def add(path, kind, severity, why, **extra):
        items.append({"key": f"{path}#{kind}", "path": path, "kind": kind, "severity": severity,
                      "why": why, **extra})

    for d in (critique or {}).get("disputes", []):
        add(d["path"], d["kind"], d["severity"], d["reason"], source="critic", quote=d.get("quote"),
            url=d.get("url"), urlRead=d.get("urlRead"))
    # Items are keyed path#kind. A critic kind (contradiction, stale ...) never
    # collides with the queue's own kinds below, which are hyphenated or fixed.
    for row in (evidence or {}).get("figures", []):
        if row.get("status") != "sourced":
            continue
        eur = figure_eur(row)
        if eur is not None and eur >= ESTIMATE_MIN_EUR and ESTIMATE_RE.search(row.get("basis") or ""):
            add(row["path"], "estimated", "medium", f"{row['basis']}", source="evidence",
                valueEur=eur, url=row.get("sourceUrl"))
    problem = notes_problem(rec)
    if problem:
        add("*", "notes", "high", problem, source="record")
    if rec.get("countryCode") not in known_countries:
        add("*", "new-country", "medium", f"first trip for {rec.get('countryCode')}: read the whole record",
            source="catalogue", fullReview=True)
    if rec.get("tripTypeSlug") not in known_styles:
        add("*", "new-style", "medium", f"first trip of style {rec.get('tripTypeSlug')}: read the whole record",
            source="catalogue", fullReview=True)
    items.sort(key=lambda i: (SEVERITY.get(i["severity"], 3), KIND_ORDER.get(i["kind"], 0), i["path"]))
    return items


def build_queue(folder, master=MASTER):
    """{trips: [...], summary: {...}} for every record in folder."""
    base_c, base_s = catalogue_sets(master)
    trips = []
    for name, rec in record_files(folder):
        rid = rec["id"]
        rev_c, rev_s = reviewed_sets(folder, skip_id=rid)
        sha = _sha(os.path.join(folder, name))
        review = side(folder, rid, ".review.json") or {}
        fresh = review.get("recordSha") == sha
        verdicts = review.get("verdicts", {}) if fresh else {}
        items = items_for(rec, side(folder, rid, ".evidence.json"), side(folder, rid, ".critique.json"),
                          base_c | rev_c, base_s | rev_s)
        for it in items:
            v = verdicts.get(it["key"])
            it["verdict"] = v["verdict"] if v else None
            it["verdictNote"] = v["note"] if v else None
        leaves = _leaves(rec)
        open_items = [i for i in items if i["verdict"] is None]
        full = any(i.get("fullReview") for i in items)
        trips.append({"id": rid, "country": rec.get("countryCode"), "style": rec.get("tripTypeSlug"),
                      "file": name, "recordSha": sha, "fieldsInRecord": leaves, "items": items,
                      "open": len(open_items), "fullReview": full,
                      "closed": bool(review.get("reviewedAt")) and fresh,
                      "staleVerdicts": bool(review.get("verdicts")) and not fresh,
                      "fieldsToRead": leaves if full else len({i["path"] for i in items}),
                      "needsReview": bool(open_items)})
    summary = {
        "trips": len(trips),
        "tripsInQueue": sum(t["needsReview"] for t in trips),
        "tripsClean": sum(not t["items"] for t in trips),
        "openItems": sum(t["open"] for t in trips),
        "fieldsInAllRecords": sum(t["fieldsInRecord"] for t in trips),
        "fieldsToRead": sum(t["fieldsToRead"] for t in trips if t["items"]),
    }
    summary["shareOfFieldsRead"] = (round(summary["fieldsToRead"] / summary["fieldsInAllRecords"], 4)
                                    if summary["fieldsInAllRecords"] else None)
    return {"folder": folder, "trips": trips, "summary": summary}


def render(queue, show_all=False):
    lines = []
    for t in queue["trips"]:
        shown = [i for i in t["items"] if show_all or i["verdict"] is None]
        if not shown:
            continue
        tag = " (whole record)" if t["fullReview"] else ""
        lines.append(f"{t['id']}{tag}: {t['open']} open of {len(t['items'])}"
                     + ("  [record changed since the last verdicts]" if t["staleVerdicts"] else ""))
        for i in shown:
            mark = f"[{i['verdict']}] " if i["verdict"] else ""
            extra = ""
            if i.get("quote"):
                extra += f' says "{i["quote"]}"'
            if i.get("url"):
                extra += f" ({i['url']}{'' if i.get('urlRead') in (None, True) else ', page not read by the critic'})"
            lines.append(f"  {i['severity']:6} {i['kind']:12} {i['path']}{extra}: {i['why']}  key={i['key']}")
    s = queue["summary"]
    lines.append("")
    lines.append(f"{s['trips']} trips, {s['tripsInQueue']} need review, {s['tripsClean']} ship on the automated "
                 f"checks, {s['openItems']} open items; {s['fieldsToRead']} of {s['fieldsInAllRecords']} "
                 f"fields to read ({s['shareOfFieldsRead']})")
    return "\n".join(lines)


def render_md(queue):
    out = ["# Review queue", "", "Flagged fields only. Everything not listed shipped on the automated checks.", ""]
    for t in queue["trips"]:
        open_items = [i for i in t["items"] if i["verdict"] is None]
        if not open_items:
            continue
        out.append(f"## {t['id']}" + (" (read the whole record)" if t["fullReview"] else ""))
        out.append("")
        for i in open_items:
            out.append(f"- {i['severity']} {i['kind']}, `{i['path']}`: {i['why']}")
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def cmd_verdict(folder, rec_id, key, verdict, note, reviewer, today=None, master=MASTER):
    if verdict not in VERDICTS:
        raise SystemExit(f"verdict must be one of {', '.join(VERDICTS)}")
    if not note or not note.strip():
        raise SystemExit("a verdict needs a note")
    q = build_queue(folder, master)
    trip = next((t for t in q["trips"] if t["id"] == rec_id), None)
    if trip is None:
        raise SystemExit(f"no record {rec_id} in {folder}")
    if key not in {i["key"] for i in trip["items"]}:
        raise SystemExit(f"{rec_id} has no queue item {key}")
    path = os.path.join(folder, rec_id + ".review.json")
    review = side(folder, rec_id, ".review.json") or {}
    if review.get("recordSha") != trip["recordSha"]:
        review = {}
    review = {"format": 1, "id": rec_id, "recordSha": trip["recordSha"], "reviewer": review.get("reviewer"),
              "reviewedAt": None, "verdicts": review.get("verdicts", {})}
    review["verdicts"][key] = {"verdict": verdict, "note": note.strip(), "reviewer": reviewer,
                               "at": today or _dt.date.today().isoformat()}
    _write(path, review)
    return review


def cmd_close(folder, rec_id, reviewer, today=None, master=MASTER):
    q = build_queue(folder, master)
    trip = next((t for t in q["trips"] if t["id"] == rec_id), None)
    if trip is None:
        raise SystemExit(f"no record {rec_id} in {folder}")
    left = [i["key"] for i in trip["items"] if i["verdict"] is None]
    if left:
        raise SystemExit(f"{rec_id} still has {len(left)} item(s) without a verdict: " + ", ".join(left))
    review = side(folder, rec_id, ".review.json") or {"format": 1, "id": rec_id, "verdicts": {}}
    review.update({"recordSha": trip["recordSha"], "reviewer": reviewer,
                   "reviewedAt": today or _dt.date.today().isoformat()})
    _write(os.path.join(folder, rec_id + ".review.json"), review)
    return review


def notes_report(folder, master=MASTER):
    """confidenceNotes coverage: the catalogue (a backlog, not a failure) and
    the generated folder (a failure)."""
    cat = {"trips": 0, "missing": 0, "byBatch": {}}
    if os.path.isfile(master):
        for t in _read(master).get("trips", []):
            b = cat["byBatch"].setdefault((t.get("provenance") or {}).get("batch"), [0, 0])
            b[0] += 1
            cat["trips"] += 1
            if notes_problem(t):
                b[1] += 1
                cat["missing"] += 1
    gen = [{"id": r["id"], "problem": notes_problem(r)} for _n, r in record_files(folder)]
    return {"catalogue": cat, "generated": gen, "generatedFailing": [g for g in gen if g["problem"]]}


# ── self-test ────────────────────────────────────────────────────────────────

def _fixture(tmp, *, dispute=True, estimate=True, country="DE", style="cycling", note=True):
    """A one-record folder: the T143 example, a critique and an evidence sidecar."""
    import copy
    with open(G.EXAMPLE_PATH, encoding="utf-8") as fh:
        rec = json.load(fh)
    rec = copy.deepcopy(rec)
    rec["countryCode"], rec["tripTypeSlug"] = country, style
    if not note:
        rec["sources"]["confidenceNotes"] = None
    os.makedirs(tmp, exist_ok=True)
    _write(os.path.join(tmp, rec["id"] + ".json"), rec)
    _write(os.path.join(tmp, rec["id"] + ".evidence.json"), {"figures": [
        {"path": "budget.breakdown.food", "value": {"lowEur": 120, "highEur": 210}, "status": "sourced",
         "sourceUrl": "https://example.org/a", "basis": "the page gives a typical daily food cost"},
        {"path": "budget.breakdown.transport", "value": {"lowEur": 40, "highEur": 90}, "status": "sourced",
         "sourceUrl": "https://example.org/b", "basis": "typical fares"},
        {"path": "itinerary[1].dayStats.distanceKm", "value": 400, "status": "sourced",
         "sourceUrl": "https://example.org/c", "basis": "approximately 400 km"}]
        if estimate else []})
    _write(os.path.join(tmp, rec["id"] + ".critique.json"), {"disputes": [
        {"path": "itinerary[3].dayStats.ascentM", "kind": "terrain", "severity": "high", "quote": "290",
         "reason": "The climb is more than this day allows.", "url": None, "urlRead": False}] if dispute else []})
    return rec["id"]


def self_test():
    import shutil
    import tempfile
    fails = []

    def expect(cond, msg):
        if not cond:
            fails.append(msg)

    root = tempfile.mkdtemp(prefix="review-queue-")
    try:
        master = os.path.join(root, "master.json")
        _write(master, {"trips": [{"countryCode": "DE", "tripTypeSlug": "cycling",
                                   "provenance": {"batch": "x"}, "sources": {"confidenceNotes": None}}]})
        tid = _fixture(os.path.join(root, "a"))
        q = build_queue(os.path.join(root, "a"), master)
        t = q["trips"][0]
        kinds = sorted(i["kind"] for i in t["items"])
        expect(kinds == ["estimated", "terrain"], f"expected one dispute and one estimate, got {kinds}")
        expect(t["items"][0]["kind"] == "terrain", "high severity dispute should sort first")
        expect(not any(i["path"] == "budget.breakdown.transport" for i in t["items"]), "a 90 euro estimate is under the threshold")
        expect(not any(i["path"].startswith("itinerary[1]") for i in t["items"]), "a kilometre estimate must not queue")
        expect(not t["fullReview"] and t["fieldsToRead"] < t["fieldsInRecord"], "partial review reads fewer fields than the file")
        # verdicts
        try:
            cmd_close(os.path.join(root, "a"), tid, "me")
            expect(False, "close must refuse with open items")
        except SystemExit:
            pass
        for k in [i["key"] for i in t["items"]]:
            cmd_verdict(os.path.join(root, "a"), tid, k, "dismissed", "checked the route", "me", today="2026-10-03")
        expect(build_queue(os.path.join(root, "a"), master)["summary"]["openItems"] == 0, "verdicts should clear the queue")
        cmd_close(os.path.join(root, "a"), tid, "me", today="2026-10-03")
        expect(build_queue(os.path.join(root, "a"), master)["trips"][0]["closed"], "close should mark the trip closed")
        # a rewritten record voids the verdicts
        p = os.path.join(root, "a", tid + ".json")
        rec = _read(p)
        rec["title"] = rec["title"] + " again"
        _write(p, rec)
        t2 = build_queue(os.path.join(root, "a"), master)["trips"][0]
        expect(t2["open"] == len(t2["items"]) and t2["staleVerdicts"], "a changed record must reopen its items")
        # new country, new style, missing notes
        _fixture(os.path.join(root, "b"), dispute=False, estimate=False, country="ZZ", style="hiking", note=False)
        t3 = build_queue(os.path.join(root, "b"), master)["trips"][0]
        expect(sorted(i["kind"] for i in t3["items"]) == ["new-country", "new-style", "notes"], "new country, style and notes")
        expect(t3["fullReview"] and t3["fieldsToRead"] == t3["fieldsInRecord"], "a new country reads the whole record")
        # a clean trip is not queued
        _fixture(os.path.join(root, "c"), dispute=False, estimate=False)
        q4 = build_queue(os.path.join(root, "c"), master)
        expect(q4["summary"]["tripsClean"] == 1 and q4["summary"]["tripsInQueue"] == 0, "a clean trip ships on the checks")
        # sidecars are never read as records
        expect(len(record_files(os.path.join(root, "a"))) == 1, "sidecars must not count as records")
        # the schema requires the note
        rec = _read(G.EXAMPLE_PATH)
        expect(not G.schema_errors(rec), "the example must pass the schema")
        for bad in (None, "", "n/a", "short note"):
            rec["sources"]["confidenceNotes"] = bad
            expect(G.schema_errors(rec), f"the schema must refuse confidenceNotes {bad!r}")
    finally:
        shutil.rmtree(root, ignore_errors=True)
    for f in fails:
        print("FAIL", f)
    if not fails:
        print("review_queue self-test: all checks passed")
    return 1 if fails else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("queue")
    q.add_argument("dir", nargs="?", default=DEFAULT_DIR)
    q.add_argument("--all", action="store_true")
    q.add_argument("--json")
    q.add_argument("--md")
    v = sub.add_parser("verdict")
    v.add_argument("dir")
    v.add_argument("id")
    v.add_argument("key")
    v.add_argument("verdict", choices=VERDICTS)
    v.add_argument("--note", required=True)
    v.add_argument("--reviewer", required=True)
    c = sub.add_parser("close")
    c.add_argument("dir")
    c.add_argument("id")
    c.add_argument("--reviewer", required=True)
    n = sub.add_parser("notes")
    n.add_argument("dir", nargs="?", default=DEFAULT_DIR)
    sub.add_parser("self-test")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if args.cmd == "self-test":
        return self_test()
    if args.cmd == "queue":
        queue = build_queue(args.dir)
        print(render(queue, args.all))
        if args.json:
            _write(args.json, queue)
        if args.md:
            G._write_atomic(args.md, render_md(queue))
        return 0
    if args.cmd == "verdict":
        cmd_verdict(args.dir, args.id, args.key, args.verdict, args.note, args.reviewer)
        return 0
    if args.cmd == "close":
        cmd_close(args.dir, args.id, args.reviewer)
        return 0
    if args.cmd == "notes":
        r = notes_report(args.dir)
        c = r["catalogue"]
        print(f"catalogue: {c['missing']} of {c['trips']} trips lack a usable confidenceNotes (a backlog for a person)")
        for b, (t, m) in sorted(c["byBatch"].items(), key=lambda kv: str(kv[0])):
            print(f"  {b}: {m} of {t}")
        print(f"generated: {len(r['generatedFailing'])} of {len(r['generated'])} fail the requirement")
        for g in r["generatedFailing"]:
            print(f"  {g['id']}: {g['problem']}")
        return 1 if r["generatedFailing"] else 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
