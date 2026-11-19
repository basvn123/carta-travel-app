"""Trail name replay: the name code run over the shipped trail names (D7, wave 1 item 0.4).

Read-only. For every walk on the trails wire it runs what the next export and
the title ladder would do to the shipped name (wire_name, then split_code
and cap_title, then dedupe_names over each country) and counts:

- unclean      names with any problem by pipeline/trails/names.name_problems
- end losses   a two-part name "A - B" (or "X: A - B") whose end B no longer
               appears in the new name. B is read from the readable original
               (network fold and fixme out) and compared without a trailing
               bracketed code ("Erze (SH-MR-002)" -> "Erze"): the code goes to
               the ref chip, which is not a loss of the end. Losses whose B
               alone is longer than TITLE_MAX are counted apart
               (end_losses_over_cap): no title can hold them.
- new dup groups  (country, folded name) groups shared by two or more walks
               after the replay that were not shared before.

Accepts (exit 0, prints ACCEPT) when unclean <= MAX_UNCLEAN (1,312, the
research's after-value on the 2026-11-17 wire), no end loss other than
those over the cap, and new dup groups == 0; otherwise exit 1 and FAIL. Run it before the trails rebuild
(T1092-a) reaches the box; the owner deadline is 2027-01-16
(docs/owner/data-and-pipeline-runs.md).

    python -I scripts/quality/trail_names_replay.py [--public DIR] [--out FILE.json]

Adapted from the research script (.work/2026-11-17-data-quality-research,
main checkout) and the run's names_replay.py.
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "continent-app" / "public"
MAX_UNCLEAN = 1312


def _names():
    spec = importlib.util.spec_from_file_location("trail_names", ROOT / "pipeline" / "trails" / "names.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


names = _names()


def run_one(n0: str, cc: str) -> str:
    """The export's wire_name, then the ladder's code split and cap."""
    n1 = names.wire_name(n0, cc) or ""
    s, _code = names.split_code(n1)
    if s and not names.is_code(s):
        n1 = names.cap_title(s)
    return n1


def end_lost(n0: str, n1: str, cc: str | None = None) -> bool:
    # The end is read from the readable original, the string the cap gets:
    # "E3 - part Belgium" is "E3, Belgium" and "Saulcy - fixme" is "Saulcy"
    # before any shortening, by design (strip_network, _strip_fixme).
    tail = names.readable(n0, cc).split(": ", 1)[-1]
    segs = names._DASH_SEP_RE.split(tail)
    if len(segs) != 2:
        return False
    end = names.split_code(segs[-1])[0] or segs[-1]
    return names.squash(end) not in names.squash(n1)


def end_too_long(n0: str, cc: str | None = None) -> bool:
    """The end segment alone is longer than a title may be, so no 42
    character title can hold it whole. Counted apart; still a loss."""
    segs = names._DASH_SEP_RE.split(names.readable(n0, cc).split(": ", 1)[-1])
    end = names.split_code(segs[-1])[0] or segs[-1]
    return len(segs) == 2 and len(end) > names.TITLE_MAX


def load_rows(public: Path) -> list[dict]:
    rows = []
    for f in sorted((public / "trails").glob("[A-Z][A-Z].json")):
        blob = json.loads(f.read_text(encoding="utf-8"))
        for key in ("trips", "listed"):
            # Counted: the walks in `trips` (17,404 hikes on the 2026-11-17
            # wire, the research's base). Listed rows are deduped with them,
            # as the export does, but not counted.
            rows += [dict(r, _counted=key == "trips") for r in blob.get(key) or [] if isinstance(r, dict)]
    return rows


def replay(rows: list[dict]) -> dict:
    originals = {r["id"]: r.get("name") or "" for r in rows}
    for r in rows:
        r["name"] = run_one(originals[r["id"]], r.get("country"))
    # The export dedupes every row of a country, whatever its category.
    names.dedupe_names(rows, originals)
    hikes = [r for r in rows if r.get("category") == "hike" and r.get("_counted")]
    before, after = collections.Counter(), collections.Counter()
    b_groups, a_groups = collections.defaultdict(list), collections.defaultdict(list)
    res = {"walks": len(hikes), "changed": 0, "unclean_before": 0, "unclean_after": 0,
           "end_segment_losses": 0, "end_losses_over_cap": 0}
    residual, end_ex = collections.defaultdict(list), []
    for r in hikes:
        n0, n1 = originals[r["id"]], r["name"] or ""
        p0, p1 = names.name_problems(n0), names.name_problems(n1)
        before.update(p0)
        after.update(p1)
        for k in p1:
            if len(residual[k]) < 15:
                residual[k].append([r["id"], r.get("country"), n0, n1])
        res["unclean_before"] += bool(p0)
        res["unclean_after"] += bool(p1)
        res["changed"] += n1 != n0
        if end_lost(n0, n1, r.get("country")):
            res["end_segment_losses"] += 1
            res["end_losses_over_cap"] += end_too_long(n0, r.get("country"))
            if len(end_ex) < 25:
                end_ex.append([r["id"], n0, n1])
        if n0.strip():
            b_groups[(r.get("country"), names.squash(n0))].append(r["id"])
        if n1.strip():
            a_groups[(r.get("country"), names.squash(n1))].append(r["id"])
    dup_b = {k for k, v in b_groups.items() if len(v) > 1}
    dup_a = {k for k, v in a_groups.items() if len(v) > 1}
    new = [k for k in dup_a if k not in dup_b]
    res.update(dup_groups_before=len(dup_b), dup_groups_after=len(dup_a), new_dup_groups=len(new),
               before=dict(before), after=dict(after))
    # A loss whose end segment alone is longer than TITLE_MAX cannot be
    # avoided by any 42 character title; it is counted and shown, and the
    # acceptance asks for zero of the others (deviation recorded in the
    # wave 1 report).
    res["accept"] = (res["unclean_after"] <= MAX_UNCLEAN
                     and res["end_segment_losses"] == res["end_losses_over_cap"]
                     and not new and res["walks"] > 0)
    res["examples"] = {"residual": residual, "end_losses": end_ex,
                       "new_dups": [[list(k), a_groups[k][:4]] for k in new[:25]]}
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Trail name replay (D7)")
    ap.add_argument("--public", default=str(PUBLIC))
    ap.add_argument("--out", help="write the full result, with examples, to this JSON file")
    a = ap.parse_args(argv)
    res = replay(load_rows(Path(a.public)))
    if a.out:
        Path(a.out).write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps({k: v for k, v in res.items() if k != "examples"}, ensure_ascii=False))
    print("ACCEPT" if res["accept"] else "FAIL")
    return 0 if res["accept"] else 1


if __name__ == "__main__":
    sys.exit(main())
