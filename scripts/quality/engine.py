"""Data quality gate per pipeline run (ROADMAP D2, T1142).

Builds the scorecard (scripts/quality/scorecard.py), checks it against
scripts/quality/rules.yaml, and writes the card, a history line and the Data
health panel snapshot with the 90-day trend.

A run fails (exit 1) when
- a must_see field's completeness falls by more than gate.must_see_drop_points
  percentage points against the previous passing card, or
- a hard rule's field is under its floor (`min`), or
- a hard check of a layer's latest external validation result (D23,
  scripts/validation/runner.py gate_from_disk) fails against its baseline.
- a hard text check (rules.yaml `text_checks`, T1201 from T1179-c) finds a
  shipped generated text that breaks the house rules: today the trail
  summaries in data/trails/summaries.json, re-checked with the same
  pipeline/trails/summaries.py check() that wrote them.
A soft rule under its floor only warns. A scorecard field with no rule, or a
rule for a field the scorecard does not measure, is a configuration error
(exit 2) so the rules cannot fall behind the layers.

    python -I scripts/quality/engine.py                 # check only, print the result
    python -I scripts/quality/engine.py --write         # also write the card, history line and panel
    python -I scripts/quality/engine.py --write --out DIR --public DIR --now 2026-11-06T12:00:00Z

`run_pipeline.py` calls it with --write after the ship; a failure adds
`quality` to the run's failed tasks. CARTA_QUALITY_OUT overrides --out's
default (the box keeps its history under logs/, which its git reset leaves). Reads only what is on disk; no network.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
RULES = HERE / "rules.yaml"
APP_SNAPSHOT = ROOT / "continent-app" / "src" / "admin" / "dataHealth.json"
LINKS = ROOT / "continent-app" / "src" / "admin" / "linkHealth.json"
SUMMARIES = ROOT / "data" / "trails" / "summaries.json"
VALIDATION = Path(os.environ.get("CARTA_VALIDATION_DIR") or ROOT / "data" / "reports" / "validation")
PANEL_VERSION = 1
LEVELS, KINDS = {"must_see", "must_have"}, {"hard", "soft"}


def _scorecard():
    if "scorecard" in sys.modules:
        return sys.modules["scorecard"]
    spec = importlib.util.spec_from_file_location("scorecard", HERE / "scorecard.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules["scorecard"] = mod
    spec.loader.exec_module(mod)
    return mod


def _validation_gate(valid_dir):
    """D23 (T1187): the latest external validation result of every layer,
    re-checked against its baseline; a failed hard check fails this run."""
    if valid_dir is None:
        return [], []
    spec = importlib.util.spec_from_file_location("validation_runner", ROOT / "scripts" / "validation" / "runner.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.gate_from_disk(Path(valid_dir))


def _links_gate(cfg: dict, snap_path: Path | None) -> tuple[list, list]:
    """D16 (T1197): the share of broken links in the latest link health
    snapshot, against rules.yaml `links`. No snapshot, or fewer than
    min_checked results, is silent: nothing was measured yet."""
    rule = cfg.get("links")
    if not rule or snap_path is None or not Path(snap_path).is_file():
        return [], []
    try:
        t = json.loads(Path(snap_path).read_text(encoding="utf-8")).get("totals") or {}
    except ValueError:
        return [], []
    share = t.get("broken_share")
    if share is None or (t.get("checked") or 0) < rule["min_checked"]:
        return [], []
    row = {"id": rule["id"], "layer": "links", "field": "broken_share", "level": "must_have", "kind": "soft",
           "min": rule["max_broken_share"], "value": share, "previous": None, "delta_points": None}
    if share > rule["hard_broken_share"]:
        return [{**row, "kind": "hard", "why": f"{share * 100:.1f}% of {t['checked']} checked links are broken (hard limit {rule['hard_broken_share'] * 100:.0f}%)"}], []
    if share > rule["max_broken_share"]:
        return [], [{**row, "why": f"{share * 100:.1f}% of {t['checked']} checked links are broken (limit {rule['max_broken_share'] * 100:.0f}%)"}]
    return [], []


def _when(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def load_rules(path: Path = RULES) -> dict:
    d = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    rules = d.get("rules") or []
    errors = []
    seen = set()
    for r in rules:
        rid = r.get("id")
        if rid in seen:
            errors.append(f"duplicate rule id {rid}")
        seen.add(rid)
        if r.get("level") not in LEVELS:
            errors.append(f"{rid}: level must be one of {sorted(LEVELS)}")
        if r.get("kind") not in KINDS:
            errors.append(f"{rid}: kind must be one of {sorted(KINDS)}")
        m = r.get("min")
        if not isinstance(m, (int, float)) or not 0 <= m <= 1:
            errors.append(f"{rid}: min must be a share between 0 and 1")
    if errors:
        raise ValueError("rules.yaml: " + "; ".join(errors))
    texts = d.get("text_checks") or []
    for c in texts:
        if c.get("kind") not in KINDS:
            errors.append(f"{c.get('id')}: kind must be one of {sorted(KINDS)}")
        if c.get("source") not in TEXT_SOURCES:
            errors.append(f"{c.get('id')}: source must be one of {sorted(TEXT_SOURCES)}")
        if c.get("check") not in TEXT_CHECKS:
            errors.append(f"{c.get('id')}: check must be one of {sorted(TEXT_CHECKS)}")
    if errors:
        raise ValueError("rules.yaml: " + "; ".join(errors))
    gate = d.get("gate") or {}
    lk = d.get("links")
    if lk is not None:
        for k in ("max_broken_share", "hard_broken_share"):
            if not isinstance(lk.get(k), (int, float)) or not 0 <= lk[k] <= 1:
                errors.append(f"links.{k} must be a share between 0 and 1")
        if not isinstance(lk.get("min_checked"), int) or lk["min_checked"] < 0:
            errors.append("links.min_checked must be a whole number")
        if not errors and lk["max_broken_share"] > lk["hard_broken_share"]:
            errors.append("links.max_broken_share must not exceed hard_broken_share")
    if errors:
        raise ValueError("rules.yaml: " + "; ".join(errors))
    return {"links": lk, "rules": rules, "texts": texts, "drop_points": float(gate.get("must_see_drop_points", 2)),
            "trend_days": int(gate.get("trend_days", 90))}


# --- Text checks (T1201, register row T1179-c) -------------------------------
# A generated text is checked when it is written; this re-checks what is on
# disk, so an edited file or a changed template cannot ship unnoticed. Each
# check sorts the reasons summaries.check() gives into one family:
#   dash     a dash or a list separator           (house rule)
#   banned   a banned word or superlative          (house rule)
#   facts    a word, figure, month or claim the walk's own facts do not hold
#   length   outside summaries.MIN_CHARS to MAX_CHARS
TEXT_SOURCES = {"trails_summaries"}
TEXT_CHECKS = {"dash", "banned", "facts", "length"}


def _summaries_module():
    if "trail_summaries" in sys.modules:
        return sys.modules["trail_summaries"]
    path = ROOT / "pipeline" / "trails" / "summaries.py"
    sys.path.insert(0, str(path.parent))
    spec = importlib.util.spec_from_file_location("trail_summaries", path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["trail_summaries"] = mod
    spec.loader.exec_module(mod)
    return mod


def text_family(reason: str) -> str:
    if reason in ("dash", "separator"):
        return "dash"
    if reason.startswith("banned word"):
        return "banned"
    if reason.startswith("length"):
        return "length"
    return "facts"


def trail_summary_findings(items: dict, wire_dir: Path, sm=None) -> dict:
    """{family: [(id, reason)]} over the summaries file's items, plus
    `not_on_wire`: ids whose walk is not on this wire (the file is older than
    the wire; T1179-e reruns it), checked for dash and length only."""
    sm = sm or _summaries_module()
    rows = {}
    for cc in sorted({(v or {}).get("cc") for v in items.values()} - {None}):
        try:
            blob = json.loads((wire_dir / f"{cc}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for r in (blob.get("trips") or []) + (blob.get("listed") or []):
            rows[str(r.get("id"))] = r
    out = {f: [] for f in TEXT_CHECKS}
    out["not_on_wire"] = []
    for tid, item in items.items():
        text = (item or {}).get("text") or ""
        row = rows.get(str(tid))
        if row is None:
            out["not_on_wire"].append((tid, "walk not on this wire"))
            reasons = (["dash"] if sm.DASH_RE.search(text) else []) + (
                ["separator"] if sm.SEPARATOR_RE.search(text) else []) + (
                [f"length {len(text)}"] if not sm.MIN_CHARS <= len(text) <= sm.MAX_CHARS else [])
        else:
            reasons = sm.check(text, sm.facts_of(row, sm.load_detail(wire_dir, row)))
        for b in reasons:
            out[text_family(b)].append((tid, b))
    return out


def text_gate(checks: list[dict], public: Path, summaries: Path | None) -> tuple[list, list]:
    """Failures and warnings of the rules.yaml text checks."""
    if not checks or summaries is None or not summaries.is_file():
        return [], []
    try:
        items = (json.loads(summaries.read_text(encoding="utf-8")) or {}).get("items") or {}
    except ValueError:
        items = None
    failures, warnings = [], []
    if items is None:
        for c in checks:
            (failures if c["kind"] == "hard" else warnings).append(
                {"id": c["id"], "kind": c["kind"], "why": f"{summaries.name} does not parse"})
        return failures, warnings
    found = trail_summary_findings(items, public / "trails")
    for c in checks:
        bad = found.get(c["check"]) or []
        if bad:
            eg = "; ".join(f"{i}: {r}" for i, r in bad[:3])
            (failures if c["kind"] == "hard" else warnings).append(
                {"id": c["id"], "kind": c["kind"],
                 "why": f"{len(bad)} of {len(items)} summaries ({eg})"})
    if found["not_on_wire"] and checks:
        warnings.append({"id": "trails_summaries.stale", "kind": "soft",
                         "why": f"{len(found['not_on_wire'])} of {len(items)} summaries name a walk not on this wire "
                                "(rerun pipeline/trails/summaries.py, T1179-e)"})
    return failures, warnings


def measured_fields() -> set[tuple[str, str]]:
    sc = _scorecard()
    out = {(layer, f) for layer, fields in sc.APP_LAYERS.items() for f in fields}
    out |= {(layer, f) for layer, spec in sc.SHARD_LAYERS.items() for f in spec[3]}
    return out


def coverage_problems(rules: list[dict]) -> list[str]:
    have = {(r.get("layer"), r.get("field")) for r in rules}
    need = measured_fields()
    return ([f"no rule for {lay}.{f}" for lay, f in sorted(need - have)]
            + [f"rule for {lay}.{f}, which the scorecard does not measure" for lay, f in sorted(have - need)])


def previous_fields(out: Path, before: str) -> tuple[dict, str | None]:
    """Field shares of the latest passing card generated before `before`:
    from quality_history.jsonl (lines since T1142 carry the fields), else from
    the dated card files (T1134's first card). A failed run is never the
    baseline, so a drop cannot be waved through by running twice."""
    cut = _when(before)
    best, best_at = None, None
    hist = out / "quality_history.jsonl"
    if hist.is_file():
        for line in hist.read_text(encoding="utf-8").splitlines():
            try:
                h = json.loads(line)
            except ValueError:
                continue
            at = h.get("generated_at")
            if not at or _when(at) >= cut or h.get("gate_ok") is False:
                continue
            fields = {k: v.get("fields") for k, v in (h.get("layers") or {}).items() if v.get("fields")}
            if fields and (best_at is None or _when(at) > _when(best_at)):
                best, best_at = fields, at
    if best is None:
        for f in sorted(out.glob("????-??-??.json")):
            try:
                c = json.loads(f.read_text(encoding="utf-8"))
            except ValueError:
                continue
            at = c.get("generated_at")
            if not at or _when(at) >= cut or c.get("gate", {}).get("ok") is False:
                continue
            if best_at is None or _when(at) > _when(best_at):
                best = {r["layer"]: r.get("fields", {}) for r in c.get("layers", [])}
                best_at = at
    return best or {}, best_at


def evaluate(card: dict, cfg: dict, prev: dict) -> dict:
    by_layer = {r["layer"]: r for r in card["layers"]}
    failures, warnings, must_see = [], [], []
    for r in cfg["rules"]:
        lay, fld = r["layer"], r["field"]
        v = (by_layer.get(lay) or {}).get("fields", {}).get(fld)
        p = (prev.get(lay) or {}).get(fld)
        delta = None if v is None or p is None else round((v - p) * 100, 2)
        row = {"id": r["id"], "layer": lay, "field": fld, "level": r["level"], "kind": r["kind"],
               "min": r["min"], "value": v, "previous": p, "delta_points": delta}
        if r["level"] == "must_see":
            must_see.append(row)
        if v is None:
            # An empty layer (no records) reads null: the scorecard could not measure it.
            (failures if r["kind"] == "hard" else warnings).append({**row, "why": "not measured"})
            continue
        if delta is not None and r["level"] == "must_see" and -delta > cfg["drop_points"]:
            failures.append({**row, "why": f"fell {-delta:.1f} points (gate {cfg['drop_points']:g})"})
        if v < r["min"]:
            (failures if r["kind"] == "hard" else warnings).append(
                {**row, "why": f"{v * 100:.1f}% is under the floor {r['min'] * 100:.0f}%"})
    return {"ok": not failures, "failures": failures, "warnings": warnings,
            "rules": len(cfg["rules"]), "must_see": must_see}


def trend(out: Path, now: str, days: int, current: dict | None = None) -> list[dict]:
    """One point per history line in the last `days` days (plus the current
    card when given), oldest first: each layer's score and whether the gate passed."""
    end = _when(now)
    start = end - timedelta(days=days)
    pts = []
    hist = out / "quality_history.jsonl"
    if hist.is_file():
        for line in hist.read_text(encoding="utf-8").splitlines():
            try:
                h = json.loads(line)
            except ValueError:
                continue
            at = h.get("generated_at")
            if not at or not start <= _when(at) <= end:
                continue
            pts.append({"at": at, "gate_ok": h.get("gate_ok"),
                        "scores": {k: v.get("score") for k, v in (h.get("layers") or {}).items()}})
    if current:
        pts.append(current)
    pts.sort(key=lambda p: _when(p["at"]))
    return pts


def panel(card: dict, result: dict, points: list[dict], days: int, baseline_at: str | None) -> dict:
    keep = ("layer", "wire", "records", "completeness", "validity", "freshness", "age_days", "accuracy", "score")
    return {
        "version": PANEL_VERSION,
        "generated_at": card["generated_at"],
        "public": card.get("public"),
        "gate": {"ok": result["ok"], "rules": result["rules"], "baseline_at": baseline_at,
                 "failures": result["failures"], "warnings": result["warnings"]},
        "layers": [{k: r.get(k) for k in keep} for r in card["layers"]],
        "must_see": result["must_see"],
        "trend": {"days": days, "points": points},
    }


def run(public: Path, now: datetime | None, out: Path, rules_path: Path = RULES,
        write: bool = False, snapshot: Path | None = APP_SNAPSHOT,
        validation: Path | None = VALIDATION, links: Path | None = LINKS,
        summaries: Path | None = SUMMARIES) -> tuple[int, dict]:
    cfg = load_rules(rules_path)
    problems = coverage_problems(cfg["rules"])
    if problems:
        return 2, {"config_errors": problems}
    sc = _scorecard()
    card = sc.build(public, now)
    prev, prev_at = previous_fields(out, card["generated_at"])
    result = evaluate(card, cfg, prev)
    vfail, vwarn = _validation_gate(validation)
    lfail, lwarn = _links_gate(cfg, links)
    result["failures"] += vfail + lfail
    result["warnings"] += vwarn + lwarn
    tfail, twarn = text_gate(cfg.get("texts") or [], public, summaries)
    result["failures"] += tfail
    result["warnings"] += twarn
    result["ok"] = not result["failures"]
    card["gate"] = {"ok": result["ok"], "failures": len(result["failures"]),
                    "warnings": len(result["warnings"]), "baseline_at": prev_at}
    current = {"at": card["generated_at"], "gate_ok": result["ok"],
               "scores": {r["layer"]: r["score"] for r in card["layers"]}}
    if write:
        sc.write_card(card, out, extra={"gate_ok": result["ok"]})
        points = trend(out, card["generated_at"], cfg["trend_days"])
    else:
        points = trend(out, card["generated_at"], cfg["trend_days"], current)
    data = panel(card, result, points, cfg["trend_days"], prev_at)
    if write:
        text = json.dumps(data, indent=1) + "\n"
        (out / "panel.json").write_text(text, encoding="utf-8")
        if snapshot is not None:
            snapshot.parent.mkdir(parents=True, exist_ok=True)
            snapshot.write_text(text, encoding="utf-8")
    return (0 if result["ok"] else 1), data


def main(argv=None) -> int:
    sc = _scorecard()
    ap = argparse.ArgumentParser(description="Data quality gate (D2)")
    ap.add_argument("--public", default=str(sc.PUBLIC))
    ap.add_argument("--now", help="ISO time to age the wires against (tests)")
    # The box resets its checkout before each run (weekly.sh), which would put a
    # tracked history file back; CARTA_QUALITY_OUT moves the output to a
    # folder the reset leaves alone (logs/status/quality on the box).
    ap.add_argument("--out", default=os.environ.get("CARTA_QUALITY_OUT") or str(sc.OUT))
    ap.add_argument("--rules", default=str(RULES))
    ap.add_argument("--write", action="store_true", help="write the card, a history line and the panel")
    ap.add_argument("--no-snapshot", action="store_true",
                    help="do not refresh continent-app/src/admin/dataHealth.json")
    ap.add_argument("--validation", default=str(VALIDATION),
                    help="folder of the D23 validation results whose hard checks join the gate")
    ap.add_argument("--links", default=str(LINKS), help="link health snapshot (D16) whose broken share joins the gate")
    ap.add_argument("--no-validation", action="store_true", help="leave the D23 validation gate out")
    a = ap.parse_args(argv)
    now = _when(a.now) if a.now else None
    try:
        rc, data = run(Path(a.public).resolve(), now, Path(a.out), Path(a.rules), a.write,
                       None if a.no_snapshot else APP_SNAPSHOT,
                       None if a.no_validation else Path(a.validation), Path(a.links))
    except ValueError as e:
        print(f"quality: {e}", file=sys.stderr)
        return 2
    if rc == 2:
        for p in data["config_errors"]:
            print(f"quality: {p}", file=sys.stderr)
        return 2
    g = data["gate"]
    print(f"quality gate: {'PASS' if g['ok'] else 'FAIL'}, {g['rules']} rules, "
          f"{len(g['failures'])} failed, {len(g['warnings'])} warnings, baseline {g['baseline_at'] or 'none'}")
    for f in g["failures"]:
        print(f"  FAIL [{f['kind']}] {f['id']}: {f['why']}")
    for w in g["warnings"]:
        print(f"  warn [{w['kind']}] {w['id']}: {w['why']}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
