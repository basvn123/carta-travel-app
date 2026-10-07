#!/usr/bin/env python3
"""The three accuracy signals, from one model (T093, spec J4, J5 and K3).

    python pipeline/accuracy.py check data/trips.master.json   # list disagreements
    python pipeline/accuracy.py apply data/trips.master.json   # rewrite master + data/trips/
    python pipeline/accuracy.py self-test

A trip record carries three signals a reader or a consumer acts on:
`verifyFlagCount` (how many details to check before booking), `volatilePricing`
(whether a price is among them, which picks the page's wording) and
`sources.verified` (what was confirmed and against what). Before this task each
came from a different place: the count from the length of `verifyFlags`, the
boolean from that list or a tag at source, the paragraph from the writer. They
could and did contradict each other (J4): 30 of the 253 published trips were
volatile with nothing to check.

The owner's decision (2026-10-07, T362) is that the K3 confidence model is the
one source. A record's `figures` list says, per numeric figure, how it is
known: `sourced` (a page the pipeline read, named in `sourceUrl`), `derived`
(computed from other figures here) or `estimated` (general knowledge). A row
may also carry `flag`: the reason a person should look again at a figure that
has a value, today the critic's dispute. From that list alone:

  verifyFlagCount  the figures a reader should check: estimated or flagged.
  volatilePricing  true when one of those is a price (a budget row, a total,
                   the per-day range, a stay's price, a day's spend, the rate).
  sources.verified a sentence built from the sourced rows: how many figures,
                   against how many pages, read when, on which hosts. Null when
                   nothing was sourced. The rows themselves are the record of
                   which fact was confirmed against what (J5); the sentence is
                   the summary a consumer can print.

`verifyFlags` stays what it was: the pipeline's own checklist (withheld
figures, disputes, perishable prices and opening times), read by the review
queue, never by the page. It is no longer the source of any signal, so its
length and `verifyFlagCount` may differ on purpose.

A record without `figures` (the 253 published v2.0 trips, until the T149
backfill writes their ledgers) has no per-figure model, so the signals fall
back to the legacy rule in `legacy()`: the count is the number of `[VERIFY]`
markers lifted from the source, volatile means there is at least one, and the
writer's `sources.verified` paragraph stands. A volatile tag at source with
nothing to check no longer survives: that was the J4 contradiction.

`inconsistencies()` is what the gate (generated records) and validate.py (the
published catalogue) enforce: a record whose three fields are not what
`signals()` gives from its own ledger is rejected.
"""
from __future__ import annotations

import collections
import copy
import json
import os
import re
import sys
import urllib.parse

CONFIDENCE = ("sourced", "derived", "estimated")

# The figure paths that are prices, as patterns ([] for any index). Written
# out here rather than imported from generation_gate so the page's copy in
# continent-app/src/lib/journeys.js (PRICE_FIGURE) has one list to match.
PRICE_PATTERNS = (
    "budget.breakdown.accommodation", "budget.breakdown.food",
    "budget.breakdown.transport", "budget.breakdown.activities",
    "budget.totalEur", "budget.perDayEur", "eurRate",
    "itinerary[].dayStats.spendEur", "accommodationStrategy[].priceEur",
)
MAX_HOSTS = 5


def pattern(path):
    """itinerary[2].dayStats.spendEur -> itinerary[].dayStats.spendEur"""
    return re.sub(r"\[\d+\]", "[]", path or "")


def is_price(path):
    return pattern(path) in PRICE_PATTERNS


def needs_check(row):
    """A figure a reader should look at before booking: an estimate, or a
    sourced or derived figure that carries a flag."""
    return row.get("confidence") == "estimated" or bool(row.get("flag"))


def ledgered(rec):
    """True when the record carries a figures list (a v2.1 record)."""
    return isinstance(rec.get("figures"), list)


def _host(url):
    try:
        host = urllib.parse.urlsplit(url).hostname or ""
    except ValueError:
        return ""
    return host[4:] if host.startswith("www.") else host


def verified_text(rows):
    """The sources.verified sentence for a ledger, or None when no figure is
    sourced. Deterministic: the same rows give the same sentence."""
    sourced = [r for r in rows if r.get("confidence") == "sourced" and r.get("sourceUrl")]
    if not sourced:
        return None
    pages = {r["sourceUrl"] for r in sourced}
    hosts = collections.Counter(_host(u) for u in pages)
    hosts.pop("", None)
    top = [h for h, _ in sorted(hosts.items(), key=lambda kv: (-kv[1], kv[0]))]
    shown, rest = top[:MAX_HOSTS], len(top) - min(len(top), MAX_HOSTS)
    if rest:
        names = ", ".join(shown) + f" and {rest} more"
    elif len(shown) > 1:
        names = ", ".join(shown[:-1]) + " and " + shown[-1]
    else:
        names = shown[0] if shown else "pages without a host name"
    dates = sorted(r.get("checkedAt") or "" for r in sourced)
    latest = dates[-1] if dates and dates[-1] else None
    when = f" read on {latest}" if latest else ""
    n_pages = len(pages)
    return (f"{len(sourced)} of {len(rows)} figures confirmed against "
            f"{n_pages} page{'s' if n_pages != 1 else ''}{when}: {names}.")


def signals(figures):
    """The three signals from a ledger. Rows that are not well formed (no
    path, unknown confidence) are ignored rather than guessed about."""
    rows = [r for r in (figures or []) if isinstance(r, dict) and r.get("path")
            and r.get("confidence") in CONFIDENCE]
    checks = [r for r in rows if needs_check(r)]
    return {
        "verifyFlagCount": len(checks),
        "volatilePricing": any(is_price(r["path"]) for r in checks),
        "verified": verified_text(rows),
    }


def legacy(rec):
    """The signals of a record with no ledger: the [VERIFY] markers lifted
    from the source are the things to check, and volatile means there is at
    least one. sources.verified is the writer's own account and stands."""
    flags = rec.get("verifyFlags") or []
    return {
        "verifyFlagCount": len(flags),
        "volatilePricing": bool(flags),
        "verified": (rec.get("sources") or {}).get("verified"),
    }


def expected(rec):
    return signals(rec["figures"]) if ledgered(rec) else legacy(rec)


def apply(rec):
    """Write the three fields onto the record, in place, and return it."""
    want = expected(rec)
    rec["verifyFlagCount"] = want["verifyFlagCount"]
    rec["volatilePricing"] = want["volatilePricing"]
    src = rec.get("sources")
    if not isinstance(src, dict):
        src = rec["sources"] = {"verified": None, "confidenceNotes": None}
    src["verified"] = want["verified"]
    return rec


def inconsistencies(rec):
    """Every way the record's three signals differ from what its own ledger
    (or, without one, its own flags) gives. Empty for a consistent record."""
    out = []
    want = expected(rec)
    src = rec.get("sources") if isinstance(rec.get("sources"), dict) else {}
    have = {"verifyFlagCount": rec.get("verifyFlagCount"),
            "volatilePricing": rec.get("volatilePricing"),
            "verified": src.get("verified")}
    basis = "figures" if ledgered(rec) else "verifyFlags (no figures)"
    if have["verifyFlagCount"] != want["verifyFlagCount"]:
        out.append(f"accuracy-count: verifyFlagCount: is {have['verifyFlagCount']}, "
                   f"{basis} gives {want['verifyFlagCount']}")
    if bool(have["volatilePricing"]) != want["volatilePricing"]:
        out.append(f"accuracy-volatile: volatilePricing: is {have['volatilePricing']}, "
                   f"{basis} gives {want['volatilePricing']}")
    if ledgered(rec) and (have["verified"] or None) != want["verified"]:
        out.append("accuracy-verified: sources.verified: is not the sentence the sourced "
                   f"figures give ({want['verified']!r})")
    if ledgered(rec):
        for r in rec["figures"]:
            flag = r.get("flag") if isinstance(r, dict) else None
            if flag is not None and (not isinstance(flag, str) or not flag.strip()):
                out.append(f"accuracy-flag: {r.get('path')}: a flag is a sentence or absent")
    return out


# ── command line ─────────────────────────────────────────────────────────────

def _load(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _dump(path, obj):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=2)


def check_master(path):
    master = _load(path)
    bad = {t["id"]: inconsistencies(t) for t in master["trips"]}
    bad = {k: v for k, v in bad.items() if v}
    for tid, errs in bad.items():
        for e in errs:
            print(f"{tid}: {e}")
    print(f"{len(bad)} of {len(master['trips'])} trips disagree with their own basis")
    return 1 if bad else 0


def apply_master(path):
    """Rewrite the master and the per-trip files beside it (data/trips/<id>.json)
    with the three fields re-derived; files that do not change are not written."""
    master = _load(path)
    trips_dir = os.path.join(os.path.dirname(path), "trips")
    changed = 0
    for t in master["trips"]:
        before = (t.get("verifyFlagCount"), t.get("volatilePricing"), (t.get("sources") or {}).get("verified"))
        apply(t)
        after = (t["verifyFlagCount"], t["volatilePricing"], t["sources"]["verified"])
        if before == after:
            continue
        changed += 1
        single = os.path.join(trips_dir, f"{t['id']}.json")
        if os.path.exists(single):
            rec = _load(single)
            _dump(single, apply(rec))
    if changed:
        _dump(path, master)
    print(f"{changed} of {len(master['trips'])} trips re-derived")
    return 0


def self_test():
    fails = []
    today = "2026-10-07"

    def row(path, conf, url=None, flag=None):
        r = {"path": path, "confidence": conf, "sourceUrl": url, "checkedAt": today}
        if flag:
            r["flag"] = flag
        return r

    clean = [row("budget.breakdown.food", "sourced", "https://www.example.org/food"),
             row("budget.breakdown.accommodation", "sourced", "https://beds.example.net/a"),
             row("budget.totalEur", "derived"),
             row("itinerary[0].dayStats.ascentM", "sourced", "https://www.example.org/day1")]
    s = signals(clean)
    if s != {"verifyFlagCount": 0, "volatilePricing": False,
             "verified": "3 of 4 figures confirmed against 3 pages read on 2026-10-07: "
                         "example.org and beds.example.net."}:
        fails.append(f"a clean ledger: {s}")
    est = clean[:2] + [row("budget.totalEur", "estimated"), row("itinerary[0].dayStats.timeMin", "estimated")]
    s = signals(est)
    if (s["verifyFlagCount"], s["volatilePricing"]) != (2, True):
        fails.append(f"two estimates, one a price: {s}")
    disputed = copy.deepcopy(clean)
    disputed[3]["flag"] = "Disputed itinerary[0].dayStats.ascentM, high terrain: the pass is 900 m higher"
    s = signals(disputed)
    if (s["verifyFlagCount"], s["volatilePricing"]) != (1, False):
        fails.append(f"a disputed climb is checked but not a price: {s}")
    if signals([])["verified"] is not None or signals([row("budget.totalEur", "derived")])["verified"]:
        fails.append("verified text without a sourced row")
    many = [row(f"itinerary[{i}].dayStats.spendEur", "sourced", f"https://h{i}.example.com/p") for i in range(7)]
    v = signals(many)["verified"]
    if not v.endswith("h3.example.com, h4.example.com and 2 more.") or v.count(" and ") != 1:
        fails.append(f"host list is not capped at {MAX_HOSTS}: {v}")
    rec = {"figures": clean, "verifyFlags": ["Withheld x: no source given"], "verifyFlagCount": 1,
           "volatilePricing": True, "sources": {"verified": None, "confidenceNotes": "n"}}
    codes = [e.split(":")[0] for e in inconsistencies(rec)]
    if codes != ["accuracy-count", "accuracy-volatile", "accuracy-verified"]:
        fails.append(f"a ledgered record out of step: {codes}")
    if inconsistencies(apply(copy.deepcopy(rec))):
        fails.append("apply() does not satisfy inconsistencies()")
    old = {"verifyFlags": [], "verifyFlagCount": 0, "volatilePricing": True,
           "sources": {"verified": "The writer checked the ferry.", "confidenceNotes": None}}
    codes = [e.split(":")[0] for e in inconsistencies(old)]
    if codes != ["accuracy-volatile"]:
        fails.append(f"the J4 contradiction on a v2.0 record: {codes}")
    apply(old)
    if old["volatilePricing"] or old["sources"]["verified"] != "The writer checked the ferry.":
        fails.append("legacy apply() dropped the writer's account or kept the tag")
    old2 = {"verifyFlags": ["Lift pass price"], "verifyFlagCount": 1, "volatilePricing": True, "sources": {}}
    if inconsistencies(old2):
        fails.append("a consistent v2.0 record is reported")
    flagged = {"figures": [row("budget.totalEur", "derived", flag="   ")], "verifyFlagCount": 0,
               "volatilePricing": False, "sources": {"verified": None}}
    if not any(e.startswith("accuracy-flag") for e in inconsistencies(flagged)):
        fails.append("a blank flag was accepted")
    for f in fails:
        print(f"SELF-TEST FAIL: {f}")
    if not fails:
        print("SELF-TEST OK: signals, verified text, inconsistencies and the legacy rule hold")
    return 1 if fails else 0


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] not in ("check", "apply", "self-test"):
        print(__doc__.strip().splitlines()[0])
        print("usage: accuracy.py check|apply <trips.master.json> | self-test")
        return 2
    if argv[0] == "self-test":
        return self_test()
    if len(argv) < 2:
        print("usage: accuracy.py check|apply <trips.master.json>")
        return 2
    return check_master(argv[1]) if argv[0] == "check" else apply_master(argv[1])


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
