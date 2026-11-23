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

Also printed: id_suffix, names ending ", no. <id>" or ", #<id>" (77 on the
2026-11-17 wire with the first dedupe, 57 with the second; it must not rise
without a reason), and too_long (0 required: every title fits TITLE_MAX).

dedupe_cut / dedupe_trim / dedupe_replaced (judge 3, fix 5) say what the
dedupe did to the start of a name it had to change (dedupe_kind). dedupe_cut,
a start cut inside a word or down to two words or fewer, must be 0.
dedupe_trim, trailing words dropped at a word boundary with three words and 16
characters kept, is capped at MAX_TRIM with the reason beside it.

Accepts (exit 0, prints ACCEPT) when unclean <= MAX_UNCLEAN (1,312, the
research's after-value on the 2026-11-17 wire), no end loss other than
those over the cap (still printed: end_losses_over_cap), head_cut == 0 (the
start A of a two-part name whose end alone is over the cap stays whole) and
new dup groups == 0; otherwise exit 1 and FAIL. Run it before the trails rebuild
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
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUBLIC = ROOT / "continent-app" / "public"
MAX_UNCLEAN = 1312
# Rows the dedupe may trim at a word boundary (three or more words and 16
# characters kept) so a suffix fits a 42 character title: "Alta Via
# dell'Anfiteatro Morenico di Ivrea" (42) becomes "Alta Via dell'Anfiteatro,
# Fiorano Canavese". No title can hold a 42 character start and a suffix; the
# cap is the measured count on the 2026-11-17 wire (9, all Alta Via
# dell'Anfiteatro Morenico di Ivrea) plus a little room, and a
# cut inside a word or down to two words (dedupe_cut) is never allowed.
MAX_TRIM = 12
# Ends lost although start and end would fit in 42 together, each with the
# reason it cannot be avoided:
#   74251 "Agios Konstantinos - Katafygio Koromilias" is 41 characters and its
#   twin 74250 has the same start, so a suffix needs room the name does not
#   have; the id-free choice is "Agios Konstantinos, 4.1 km".
END_LOSS_ALLOWED = {74251}


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


def head_cut(n0: str, n1: str, cc: str | None = None) -> bool:
    """A two-part name whose end B alone is over TITLE_MAX and whose start A
    fits a title: A must stand whole in the new name. Cutting inside A and
    then adding a piece of B's code ("Il Cammino di santa, CSG-T002_V26
    Valle") is worse than dropping B."""
    tail = names.readable(n0, cc).split(": ", 1)[-1]
    segs = names._DASH_SEP_RE.split(tail)
    if len(segs) != 2:
        return False
    start = names.split_code(segs[0].strip())[0] or segs[0].strip()
    end = segs[-1].strip()      # as written, code included (cap_title measures it so)
    # A start longer than TITLE_MAX less the shortest id suffix (", no. 123456")
    # cannot stay whole when the dedupe has to add something: no title can.
    if len(end) <= names.TITLE_MAX or len(start) > names.TITLE_MAX - 12 or names.is_code(start):
        return False
    return names.squash(start) not in names.squash(n1)


_SEG_AFTER = re.compile(r"^(?:\s[-–]\s|:\s|,\s|\s\()")


def dedupe_kind(pre: str, new: str, orig: str) -> str | None:
    """How dedupe_names changed a name, judged on the start it kept.

    None      nothing changed, or the start is whole (the name before the last
              ", suffix" is the old name, or the old name up to a segment
              boundary: a comma part, an "A - B" or "A: B" segment, a bracket)
    replaced  the new name is a part of the readable original on its own (a
              quoted or bracketed part, the tail after ": ")
    trim      the start loses trailing words at a word boundary and keeps
              three or more words and 16 characters
    cut       anything else: inside a word, or down to two words or fewer.
              Required to be 0."""
    if new == pre:
        return None
    base = new.rsplit(", ", 1)[0] if ", " in new else new
    if pre == base or (pre.startswith(base) and _SEG_AFTER.match(pre[len(base):])):
        return None
    if names.squash(new) in names.squash(orig) and not pre.startswith(new):
        return "replaced"
    if pre.startswith(base) and pre[len(base):][:1] == " " and len(base.split()) >= 3 and len(base) >= 16:
        return "trim"
    return "cut"


def mid_word_loss(n0: str, n1: str, cc: str | None = None, require_code: bool = True) -> bool:
    """(judge 1 fix 4) The original's first "A - B" segment keeps its first word
    and loses its last word, while B survives: "PRC43SMI Pico das Camarinhas -
    Ponta da Ferraria" read "Pico das - Ponta da Ferraria". Code words are not
    counted (they ride the chip), and a name that dropped the start whole is a
    different matter (head_cut)."""
    r = names.readable(n0, cc)
    segs = re.split(r"\s[-–]\s", r)
    if len(segs) < 2:
        return False
    # Only a start that carries a code or a waymark symbol is judged here: the
    # code rides the chip and the word after it is the name ("PRC43SMI Pico das
    # Camarinhas"). Other starts cut to fit are counted by start_tail_cut.
    if require_code and not any(names.is_code(t) or re.fullmatch(r"\[.{1,3}\]", t) for t in segs[0].split()):
        return False
    if require_code:
        if segs[0].count("(") != segs[0].count(")"):
            return False        # the dash is inside a bracket: "N (A - B)" names the walk A - B
        toks = segs[0].split()
        last = max((i for i, t in enumerate(toks) if re.fullmatch(r"[A-Za-z]{1,5}-?\d[\w-]*|[A-Z\d]*\d[A-Z\d-]*[A-Z\d]|\[.{1,3}\]", t) and len(t) >= 4 or re.fullmatch(r"\[.{1,3}\]", t)), default=-1)
        if last < 0:
            return False
        after = next((t for t in toks[last + 1:] if re.search(r"[^\W\d_]", t)), "")
        tail = re.findall(r"[^\W\d_][\w'’]*", segs[-1])
        low = " " + " ".join(re.findall(r"[^\W_]+", n1.lower())) + " "
        w = " ".join(re.findall(r"[^\W_]+", after.lower()))
        kept = any(" " + " ".join(re.findall(r"[^\W_]+", t.lower())) + " " in low
                   for t in toks if len(t) > 2 and re.search(r"[^\W\d_]", t) and t != after and not names.is_code(t))
        # A start kept in part and cut at the word after its code; a start
        # dropped whole is a deliberate "keep the end" (names._keep_the_end).
        return kept and bool(w and tail) and " " + w + " " not in low and " " + " ".join(re.findall(r"[^\W_]+", tail[-1].lower())) + " " in low
    words = [w for w in re.findall(r"[^\W\d_][\w'’]*", segs[0]) if not names.is_code(w) and len(w) > 2]
    tail = re.findall(r"[^\W\d_][\w'’]*", segs[-1])
    if len(words) < 2 or not tail:
        return False
    low = " " + " ".join(re.findall(r"[^\W_]+", n1.lower())) + " "
    has = lambda w: " " + w.lower() + " " in low
    return has(words[0]) and not has(words[-1]) and has(tail[-1])


def end_too_long(n0: str, cc: str | None = None) -> bool:
    """The end segment alone is longer than a title may be, so no 42
    character title can hold it whole. Counted apart; still a loss."""
    segs = names._DASH_SEP_RE.split(names.readable(n0, cc).split(": ", 1)[-1])
    end = segs[-1].strip()
    if len(segs) != 2:
        return False
    # Over the cap: the end alone, or the whole start and the end together
    # ("Via Sancti Martini HW-37-02 ..." keeps its name, not half of it).
    start = names.split_code(segs[0].strip())[0] or segs[0].strip()
    return len(end) > names.TITLE_MAX or len(start) + 3 + len(end) > names.TITLE_MAX


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
    pre = {r["id"]: r["name"] for r in rows}
    # The export dedupes every row of a country, whatever its category.
    names.dedupe_names(rows, originals)
    hikes = [r for r in rows if r.get("category") == "hike" and r.get("_counted")]
    before, after = collections.Counter(), collections.Counter()
    b_groups, a_groups = collections.defaultdict(list), collections.defaultdict(list)
    res = {"walks": len(hikes), "changed": 0, "unclean_before": 0, "unclean_after": 0,
           "end_segment_losses": 0, "end_losses_over_cap": 0, "head_cut": 0, "id_suffix": 0,
           "mid_word_loss": 0, "start_tail_cut": 0, "dedupe_cut": 0, "dedupe_trim": 0, "dedupe_replaced": 0, "end_losses_unexplained": 0}
    residual, end_ex, head_ex, mid_ex = collections.defaultdict(list), [], [], []
    dd_ex = collections.defaultdict(list)
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
        res["id_suffix"] += bool(re.search(r", (?:no\. |#)\d+$", n1))
        kind = dedupe_kind(pre[r["id"]], n1, names.readable(n0, r.get("country")))
        if kind:
            res["dedupe_" + kind] += 1
            if len(dd_ex[kind]) < 40:
                dd_ex[kind].append([r["id"], n0, pre[r["id"]], n1])
        if mid_word_loss(n0, n1, r.get("country")):
            res["mid_word_loss"] += 1
            if len(mid_ex) < 25:
                mid_ex.append([r["id"], n0, n1])
        res["start_tail_cut"] += mid_word_loss(n0, n1, r.get("country"), False)
        if head_cut(n0, n1, r.get("country")):
            res["head_cut"] += 1
            if len(head_ex) < 25:
                head_ex.append([r["id"], n0, n1])
        if end_lost(n0, n1, r.get("country")):
            res["end_segment_losses"] += 1
            over = end_too_long(n0, r.get("country"))
            res["end_losses_over_cap"] += over
            res["end_losses_unexplained"] += not over and r["id"] not in END_LOSS_ALLOWED
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
    # acceptance asks for zero of the others, and for head_cut == 0: the start
    # of a name is never cut (judge fix 1; the over-cap deviation is recorded
    # in the wave 1 report and printed with every run).
    res["accept"] = (res["unclean_after"] <= MAX_UNCLEAN
                     and res["end_losses_unexplained"] == 0
                     and res["dedupe_cut"] == 0 and res["dedupe_trim"] <= MAX_TRIM
                     and res["head_cut"] == 0 and res["mid_word_loss"] == 0
                     and res["after"].get("too_long", 0) == 0
                     and not new and res["walks"] > 0)
    res["examples"] = {"residual": residual, "end_losses": end_ex, "head_cuts": head_ex, "mid_word_loss": mid_ex, "dedupe": dd_ex,
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
