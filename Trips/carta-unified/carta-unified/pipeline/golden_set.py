#!/usr/bin/env python3
"""The golden set: ten trips re-generated on every prompt or model change (T153, spec K8).

    python pipeline/golden_set.py stamp                       what the prompts and model chain hash to now
    python pipeline/golden_set.py check [--allow-missing-baseline]
                                                               offline: has anything changed since the baseline?
    python pipeline/golden_set.py run --live [--only KEY] [--out DIR] [--model M] [--critic-model M]
    python pipeline/golden_set.py run --stub ROOT [--out DIR]  replay ROOT/<key>/{pass1,pass2,pass3,critic}.json
    python pipeline/golden_set.py diff RUN.json [--baseline FILE] [--json OUT]
    python pipeline/golden_set.py score RUN.json               a run against the curated truth, no baseline needed
    python pipeline/golden_set.py bless RUN.json --note TEXT   make a live run the new baseline
    python pipeline/golden_set.py self-test                    no network

Why it exists. Without it a prompt change is unfalsifiable: a tweak to the numbers
prompt can quietly make every food budget 20% higher and nothing notices until 600
trips carry it. The set holds ten trips, one per style, each with the figures of its
curated record as ground truth. A run regenerates all ten through the full four-call
pipeline (generate_trip.generate) with the cache off, pulls a flat list of numbers
out of each admitted record, and compares them with the last blessed run.

What a run is compared with, and what fails it
  The baseline (golden/baseline.json) is the last live run a person accepted. The
  diff fails on: a trip that was admitted and now is not; fewer than minComparedTrips
  trips with numbers on both sides (a gate that compares nothing passes by default,
  so it needs a minimum); one figure moving more than bigMove; a systematic drift
  (one group of figures, such as budget.food, moving the same way in at least
  systemicAgree of at least systemicMinTrips trips by a mean of systemicMean or
  more, which is the "every food budget 20% higher" case); and the critic's
  disputes per trip changing by half or more and by at least two. It warns on a
  figure moving more than drift, a new high-severity dispute, a changed model
  (a run whose model chain fell over answers differently for that reason alone)
  and a trip further than tolerances.truth from its curated figure.

What triggers a run
  stamp() hashes the four prompt files, the model chain, the critic chain if one
  is pinned and the golden-set file. check compares it with the stamp stored in the
  baseline and exits 1 on a difference, so a prompt or model change cannot merge
  until someone has run the set live and blessed the result. .github/workflows/
  golden-set.yml runs check on every change to those files. The live run needs a
  key and costs money, so it is a manual dispatch (or run locally with --live),
  never automatic.

File formats (all JSON, UTF-8, no em dashes)
  golden/golden-set.json
    format          1
    truthSource     where the truth figures came from
    tolerances      drift, bigMove, systemicMean, systemicAgree, systemicMinTrips,
                    truth, minComparedTrips (fractions, except the two counts)
    trips[]         key (unique, also the output folder name), curatedId (the
                    record in data/trips.master.json the truth was read from),
                    style (a tripTypeSlug), brief (what generate_trip.load_brief
                    takes: countryCode, tripTypeSlug, idea, batch), truth
    truth           budget.{accommodation,food,transport,activities}.{low,high},
                    totalEur.{low,high}, perDayEur.{low,high}, durationDays,
                    budgetTier, and distanceKm for linear routes only
  A run file (written to OUT/run.json, and golden/baseline.json is one that was blessed)
    format          1
    mode            "live" or "stub"
    stamp           what stamp() returned when the run started
    ranAt, setSha   date and hash of golden-set.json
    blessed         only in a baseline: {at, note}
    trips{key}      status "admitted" | "rejected" | "error", stage, errors[],
                    models{pass: model}, usd (null when not priced), metrics{name: number|null},
                    disputes[{path, kind, severity}], flags (verifyFlags count)
  Metric names are flat: budget.food.low, budget.total.high, budget.perDay.low,
  typeSpecific.distanceKm, days.distanceKm (sum over itinerary days), days.ascentM,
  days.spendEur, stay.priceEur (mean), eurRate, gateway.transferMin (mean),
  figures.withheld, flags. A group is the name without a trailing .low or .high.

The Claude API is never called; the live client is generate_trip.GeminiClient.
"""
from __future__ import annotations

import argparse
import copy
import datetime as _dt
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_trip as T  # noqa: E402
import generation_gate as G  # noqa: E402

GOLDEN_DIR = os.path.join(G.ROOT, "golden")
SET_PATH = os.path.join(GOLDEN_DIR, "golden-set.json")
BASELINE_PATH = os.path.join(GOLDEN_DIR, "baseline.json")
PROMPT_FILES = ("k2-skeleton.md", "k2-prose.md", "k2-numbers.md", "k4-critic.md")
DEFAULT_TOL = {"drift": 0.10, "bigMove": 0.30, "systemicMean": 0.05, "systemicAgree": 0.8,
               "systemicMinTrips": 5, "truth": 0.40, "minComparedTrips": 8}
BUDGET_LINES = ("accommodation", "food", "transport", "activities")


# ── the set and the stamp ────────────────────────────────────────────────────

def _sha(data):
    return hashlib.sha256(data).hexdigest()


def load_set(path=SET_PATH):
    with open(path, encoding="utf-8") as fh:
        gset = json.load(fh)
    keys = [t["key"] for t in gset["trips"]]
    if len(set(keys)) != len(keys):
        raise SystemExit(f"{path}: duplicate trip keys")
    gset["tolerances"] = {**DEFAULT_TOL, **gset.get("tolerances", {})}
    return gset


def stamp(set_path=SET_PATH, critic_models=None):
    """What a baseline was made with. digest changes when any prompt file, the
    model chain, a pinned critic chain or the golden-set file changes."""
    prompts = {}
    for name in PROMPT_FILES:
        with open(os.path.join(T.PROMPT_DIR, name), "rb") as fh:
            prompts[name] = _sha(fh.read())
    with open(set_path, "rb") as fh:
        set_sha = _sha(fh.read())
    body = {"prompts": prompts, "promptVersion": T.prompt_version(), "modelChain": list(T.MODEL_CHAIN),
            "criticModels": list(critic_models) if critic_models else None, "setSha": set_sha}
    body["digest"] = _sha(json.dumps(body, sort_keys=True).encode("utf-8"))
    return body


def stamp_changes(old, new):
    """Human lines saying what differs between two stamps."""
    out = []
    for name in PROMPT_FILES:
        if (old.get("prompts") or {}).get(name) != new["prompts"].get(name):
            out.append(f"prompt changed: {name}")
    if old.get("modelChain") != new["modelChain"]:
        out.append(f"model chain changed: {old.get('modelChain')} -> {new['modelChain']}")
    if old.get("criticModels") != new["criticModels"]:
        out.append(f"critic chain changed: {old.get('criticModels')} -> {new['criticModels']}")
    if old.get("setSha") != new["setSha"]:
        out.append("golden-set.json changed")
    return out


# ── numbers out of a record ──────────────────────────────────────────────────

def _num(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def _sum(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals), 2) if vals else None


def _mean(vals):
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 2) if vals else None


def metrics_of(rec, figures_withheld=None):
    """The flat numbers a diff compares, from an admitted record."""
    m = {}
    b = rec.get("budget") or {}
    br = b.get("breakdown") or {}
    for k in BUDGET_LINES:
        row = br.get(k) or {}
        m[f"budget.{k}.low"], m[f"budget.{k}.high"] = _num(row.get("lowEur")), _num(row.get("highEur"))
    for name, key in (("total", "totalEur"), ("perDay", "perDayEur")):
        row = b.get(key) or {}
        m[f"budget.{name}.low"], m[f"budget.{name}.high"] = _num(row.get("low")), _num(row.get("high"))
    ts = rec.get("typeSpecific") or {}
    for k in ("distanceKm", "elevationM", "verticalM"):
        m[f"typeSpecific.{k}"] = _num(ts.get(k))
    stats = [(d.get("dayStats") or {}) for d in rec.get("itinerary") or []]
    for k in ("distanceKm", "ascentM", "spendEur"):
        m[f"days.{k}"] = _sum(_num(s.get(k)) for s in stats)
    m["stay.priceEur"] = _mean(_num(a.get("priceEur")) for a in rec.get("accommodationStrategy") or [])
    m["eurRate"] = _num(rec.get("eurRate"))
    m["gateway.transferMin"] = _mean(_num(g.get("transferMin")) for g in rec.get("gateways") or [])
    m["figures.withheld"] = figures_withheld
    m["flags"] = len(rec.get("verifyFlags") or [])
    return m


def truth_metrics(truth):
    """The curated figures under the same metric names (only those that exist)."""
    m = {}
    for k in BUDGET_LINES:
        row = (truth.get("budget") or {}).get(k) or {}
        m[f"budget.{k}.low"], m[f"budget.{k}.high"] = row.get("low"), row.get("high")
    for name, key in (("total", "totalEur"), ("perDay", "perDayEur")):
        row = truth.get(key) or {}
        m[f"budget.{name}.low"], m[f"budget.{name}.high"] = row.get("low"), row.get("high")
    if truth.get("distanceKm") is not None:
        m["typeSpecific.distanceKm"] = truth["distanceKm"]
    return {k: v for k, v in m.items() if v is not None}


def group_of(name):
    return name[:-4] if name.endswith((".low", ".high")) else name


# ── running the set ──────────────────────────────────────────────────────────

def run_set(gset, client_for, out_dir, *, mode, today=None, critic_for=None, only=None, critic_models=None,
            set_path=SET_PATH):
    """Regenerate every trip in the set (cache off) and return the run dict.
    client_for(entry) and critic_for(entry) return the clients; a trip that
    raises is recorded as status "error", so one dead call does not hide the
    other nine."""
    today = today or _dt.date.today().isoformat()
    run = {"format": 1, "mode": mode, "stamp": stamp(set_path, critic_models), "ranAt": today,
           "setSha": None, "trips": {}}
    run["setSha"] = run["stamp"]["setSha"]
    for entry in gset["trips"]:
        if only and entry["key"] not in only:
            continue
        tdir = os.path.join(out_dir, entry["key"])
        brief = {**entry["brief"], "key": entry["key"]}
        try:
            res = T.generate(brief, client_for(entry), tdir, reuse=False, today=today,
                             critic_client=critic_for(entry) if critic_for else None)
        except Exception as exc:  # noqa: BLE001 - a failed call is a result, not a crash
            run["trips"][entry["key"]] = {"status": "error", "stage": "call", "errors": [str(exc)[:300]],
                                          "models": {}, "usd": None, "metrics": {}, "disputes": [], "flags": None}
            continue
        run["trips"][entry["key"]] = trip_result(res)
    return run


def trip_result(res):
    models = {T.PASS_LABEL.get(n, f"pass{n}"): u.get("model") for n, u in res["passes"].items()}
    out = {"status": "admitted" if res["ok"] else "rejected", "stage": res["stage"],
           "errors": res["errors"][:5], "models": models, "usd": res.get("usd"),
           "metrics": {}, "disputes": [], "flags": None}
    if not res["ok"]:
        return out
    with open(res["path"], encoding="utf-8") as fh:
        rec = json.load(fh)
    out["metrics"] = metrics_of(rec, (res.get("figures") or {}).get("withheld"))
    out["flags"] = len(rec.get("verifyFlags") or [])
    cpath = os.path.join(os.path.dirname(res["path"]), f"{res['id']}.critique.json")
    if os.path.exists(cpath):
        with open(cpath, encoding="utf-8") as fh:
            crit = json.load(fh)
        out["disputes"] = [{"path": d["path"], "kind": d["kind"], "severity": d["severity"]}
                           for d in crit.get("disputes") or []]
    return out


# ── comparing runs ───────────────────────────────────────────────────────────

def rel(old, new):
    """Relative change, None when it cannot be said (no old value, or none now)."""
    if old is None or new is None:
        return None
    if old == new:
        return 0.0
    if old == 0:
        return None
    return (new - old) / abs(old)


def _systemic(changes, tol):
    """changes: {group: {trip: [rel, ...]}}. The groups that moved together."""
    hits = []
    for group, per_trip in sorted(changes.items()):
        trips = {t: sum(v) / len(v) for t, v in per_trip.items() if v}
        if len(trips) < tol["systemicMinTrips"]:
            continue
        mean = sum(trips.values()) / len(trips)
        if abs(mean) < tol["systemicMean"]:
            continue
        agree = sum(1 for v in trips.values() if (v > 0) == (mean > 0) and v != 0) / len(trips)
        if agree >= tol["systemicAgree"]:
            hits.append({"group": group, "meanChange": round(mean, 4), "trips": len(trips), "agree": round(agree, 2)})
    return hits


def truth_report(run, gset):
    """Each trip's figures against its curated truth: signed mean deviation per
    group, and the trips beyond tolerances.truth. Information, not a gate."""
    tol = gset["tolerances"]
    per_group, far = {}, []
    for entry in gset["trips"]:
        res = (run["trips"] or {}).get(entry["key"])
        if not res or res["status"] != "admitted":
            continue
        for name, want in truth_metrics(entry["truth"]).items():
            r = rel(want, res["metrics"].get(name))
            if r is None:
                continue
            per_group.setdefault(group_of(name), {}).setdefault(entry["key"], []).append(r)
            if abs(r) > tol["truth"]:
                far.append(f"{entry['key']} {name}: {res['metrics'][name]} against curated {want} ({r:+.0%})")
    groups = {g: {"meanDeviation": round(sum(sum(v) / len(v) for v in t.values()) / len(t), 4), "trips": len(t)}
              for g, t in sorted(per_group.items())}
    return {"groups": groups, "beyondTolerance": far}


def diff_runs(base, new, gset):
    """Compare a new run with the baseline. Returns {fail: [], warn: [], ...}."""
    tol = gset["tolerances"]
    fail, warn = [], []
    for line in stamp_changes(base.get("stamp") or {}, new["stamp"]):
        warn.append(f"changed since the baseline: {line}")
    if base.get("mode") != "live":
        warn.append(f"the baseline is a {base.get('mode')} run, not a measured one")
    compared, changes, big, moved = 0, {}, [], []
    d_old = d_new = n_old = n_new = 0
    for entry in gset["trips"]:
        key = entry["key"]
        a, b = base["trips"].get(key), new["trips"].get(key)
        if not b:
            continue
        if not a:
            warn.append(f"{key}: not in the baseline")
            continue
        if a["status"] == "admitted" and b["status"] != "admitted":
            fail.append(f"{key}: was admitted, now {b['status']} at {b['stage']}: {(b['errors'] or [''])[0][:120]}")
            continue
        if a["status"] != "admitted" or b["status"] != "admitted":
            continue
        n_with = 0
        for name, old in a["metrics"].items():
            r = rel(old, b["metrics"].get(name))
            if r is None or name in ("flags", "figures.withheld"):
                continue
            n_with += 1
            changes.setdefault(group_of(name), {}).setdefault(key, []).append(r)
            if abs(r) > tol["bigMove"]:
                big.append(f"{key} {name}: {old} -> {b['metrics'][name]} ({r:+.0%})")
            elif abs(r) > tol["drift"]:
                moved.append(f"{key} {name}: {old} -> {b['metrics'][name]} ({r:+.0%})")
        compared += 1 if n_with else 0
        for p in sorted(set(a["models"]) | set(b["models"])):
            if a["models"].get(p) != b["models"].get(p):
                warn.append(f"{key} {p}: model {a['models'].get(p)} -> {b['models'].get(p)}")
        old_d = {(d["path"], d["kind"]): d for d in a["disputes"]}
        new_d = {(d["path"], d["kind"]): d for d in b["disputes"]}
        for k2, d in new_d.items():
            if k2 not in old_d and d["severity"] == "high":
                warn.append(f"{key}: new high-severity dispute on {k2[0]} ({k2[1]})")
        d_old, d_new, n_old, n_new = d_old + len(a["disputes"]), d_new + len(b["disputes"]), n_old + 1, n_new + 1
    if compared < tol["minComparedTrips"]:
        fail.append(f"only {compared} trips had numbers on both sides; at least {tol['minComparedTrips']} are needed "
                    "for the comparison to mean anything")
    fail += [f"one figure moved more than {tol['bigMove']:.0%}: {m}" for m in big]
    warn += [f"moved more than {tol['drift']:.0%}: {m}" for m in moved]
    systemic = _systemic(changes, tol)
    for s in systemic:
        fail.append(f"systematic drift: {s['group']} moved {s['meanChange']:+.1%} on average, the same way in "
                    f"{s['agree']:.0%} of {s['trips']} trips")
    per_old, per_new = (d_old / n_old if n_old else 0), (d_new / n_new if n_new else 0)
    if abs(per_new - per_old) >= 2 and abs(per_new - per_old) >= 0.5 * max(per_old, 1e-9):
        fail.append(f"the critic's disputes per trip moved from {per_old:.1f} to {per_new:.1f}")
    return {"fail": fail, "warn": warn, "comparedTrips": compared, "systemic": systemic,
            "disputesPerTrip": {"before": round(per_old, 2), "after": round(per_new, 2)},
            "truth": truth_report(new, gset)}


def print_diff(d):
    print(f"{'FAIL' if d['fail'] else 'PASS'}: {d['comparedTrips']} trips compared, "
          f"disputes per trip {d['disputesPerTrip']['before']} -> {d['disputesPerTrip']['after']}")
    for line in d["fail"]:
        print(f"  FAIL {line}")
    for line in d["warn"]:
        print(f"  warn {line}")
    print_truth(d["truth"])


def print_truth(t):
    print("  against the curated figures (mean signed deviation, trips):")
    for g, v in t["groups"].items():
        print(f"    {g:24s} {v['meanDeviation']:+.1%}  ({v['trips']})")
    for line in t["beyondTolerance"]:
        print(f"  warn beyond truth tolerance: {line}")


# ── CLI ──────────────────────────────────────────────────────────────────────

def _read(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def _write(path, obj):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    G._write_atomic(path, json.dumps(obj, ensure_ascii=False, indent=1) + "\n")


def cmd_check(allow_missing):
    now = stamp()
    if not os.path.exists(BASELINE_PATH):
        print("NO BASELINE: golden/baseline.json does not exist, so nothing has been measured yet.")
        return 0 if allow_missing else 2
    base = _read(BASELINE_PATH)
    if base["stamp"]["digest"] == now["digest"]:
        print(f"OK: prompts, model chain and golden set match the baseline blessed {base['blessed']['at']}")
        return 0
    print("CHANGED: the golden baseline was made with something else than what is in the tree now.")
    for line in stamp_changes(base["stamp"], now):
        print(f"  {line}")
    print("Run `python pipeline/golden_set.py run --live`, then `diff`, and `bless` the result in the same change.")
    return 1


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("stamp")
    c = sub.add_parser("check")
    c.add_argument("--allow-missing-baseline", action="store_true")
    r = sub.add_parser("run")
    r.add_argument("--live", action="store_true", help="make paid Gemini calls (about 40 for the full set)")
    r.add_argument("--stub", help="folder holding one subfolder of recorded answers per trip key")
    r.add_argument("--out", default=os.path.join(T.DEFAULT_OUT, "golden"))
    r.add_argument("--only", action="append")
    r.add_argument("--model", action="append")
    r.add_argument("--critic-model", action="append")
    d = sub.add_parser("diff")
    d.add_argument("run")
    d.add_argument("--baseline", default=BASELINE_PATH)
    d.add_argument("--json")
    s = sub.add_parser("score")
    s.add_argument("run")
    b = sub.add_parser("bless")
    b.add_argument("run")
    b.add_argument("--note", required=True)
    b.add_argument("--force", action="store_true", help="bless although the diff against the old baseline fails")
    b.add_argument("--allow-stub", action="store_true")
    sub.add_parser("self-test")
    args = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    if args.cmd == "self-test":
        return self_test()
    if args.cmd == "stamp":
        print(json.dumps(stamp(), indent=1))
        return 0
    if args.cmd == "check":
        return cmd_check(args.allow_missing_baseline)
    gset = load_set()
    if args.cmd == "run":
        if bool(args.live) == bool(args.stub):
            raise SystemExit("run needs exactly one of --live and --stub ROOT")
        if args.stub:
            def client_for(e):
                return T.StubClient(os.path.join(args.stub, e["key"]))
            critic_for, mode = None, "stub"
        else:
            sys.path.insert(0, os.path.join(G.ROOT, "..", "..", "..", "pipeline"))
            try:
                from env_local import load_env
                load_env()
            except ImportError:
                pass
            gem = T.GeminiClient(args.model)
            critic = T.GeminiClient(args.critic_model) if args.critic_model else None

            def client_for(_e):
                return gem

            def critic_for(_e):
                return critic
            mode = "live"
        run = run_set(gset, client_for, args.out, mode=mode, critic_for=critic_for if mode == "live" else None,
                      only=args.only, critic_models=args.critic_model)
        path = os.path.join(args.out, "run.json")
        _write(path, run)
        ok = sum(t["status"] == "admitted" for t in run["trips"].values())
        usd = [t["usd"] for t in run["trips"].values() if t["usd"] is not None]
        print(f"{ok} of {len(run['trips'])} trips admitted -> {path}"
              + (f", USD {sum(usd):.2f} (list prices, free quota not subtracted)" if usd else ""))
        return 0 if ok == len(run["trips"]) else 1
    run = _read(args.run)
    if args.cmd == "score":
        print_truth(truth_report(run, gset))
        return 0
    if args.cmd == "diff":
        if not os.path.exists(args.baseline):
            raise SystemExit("no baseline yet; use `score` for the curated comparison and `bless` after a live run")
        res = diff_runs(_read(args.baseline), run, gset)
        print_diff(res)
        if args.json:
            _write(args.json, res)
        return 1 if res["fail"] else 0
    if args.cmd == "bless":
        if run["mode"] != "live" and not args.allow_stub:
            raise SystemExit("refusing to bless a stub run: a baseline of recorded answers measures nothing")
        if run["stamp"]["digest"] != stamp()["digest"]:
            raise SystemExit("the run was made with other prompts, models or golden set than the tree has now")
        if os.path.exists(BASELINE_PATH) and not args.force:
            res = diff_runs(_read(BASELINE_PATH), run, gset)
            if res["fail"]:
                print_diff(res)
                raise SystemExit("the diff fails; fix the prompt, or bless with --force if the movement is intended")
        run["blessed"] = {"at": _dt.date.today().isoformat(), "note": args.note}
        _write(BASELINE_PATH, run)
        print(f"blessed -> {BASELINE_PATH}")
        return 0
    return 2


# ── self-test ────────────────────────────────────────────────────────────────

def make_stubs(root, keys, *, food=1.0, dispute=None):
    """Write recorded answers for each key: the fixture trip, its food budget
    scaled by `food`, and optionally one critic dispute."""
    bodies = T.fixture_bodies()
    for key in keys:
        b = copy.deepcopy(bodies)
        part = b["pass3"]["candidates"][0]["content"]["parts"][0]
        frag = json.loads(part["text"])
        food_row = frag["budget"]["breakdown"]["food"]
        for k in ("lowEur", "highEur"):
            food_row[k] = round(food_row[k] * food)
        part["text"] = json.dumps(frag, ensure_ascii=False)
        if dispute:
            b["critic"] = T.critic_body(T.fixture_critique([dispute]))
        os.makedirs(os.path.join(root, key), exist_ok=True)
        for label, body in b.items():
            _write(os.path.join(root, key, f"{label}.json"), body)


def _mini_set(n):
    base = T.FIXTURE_BRIEF
    return {"format": 1, "tolerances": {**DEFAULT_TOL, "minComparedTrips": 5},
            "trips": [{"key": f"mini-{i}", "style": "cycling", "brief": {k: base[k] for k in
                       ("countryCode", "tripTypeSlug", "idea", "batch")},
                       "truth": {"budget": {"food": {"low": 250, "high": 350}}}} for i in range(n)]}


def self_test():
    import tempfile
    fails = []

    def expect(cond, msg):
        if not cond:
            fails.append(msg)
    gset = load_set()
    expect(len(gset["trips"]) == 10, "the golden set holds ten trips")
    expect(len({t["style"] for t in gset["trips"]}) == 10, "ten distinct styles")
    slugs = {s for _, _, s in T.C.TRIP_TYPES}
    expect(all(t["brief"]["tripTypeSlug"] in slugs and t["style"] == t["brief"]["tripTypeSlug"]
               for t in gset["trips"]), "every brief names a real trip type")
    expect(all(t["truth"]["budget"]["food"]["low"] for t in gset["trips"]), "every trip has a food truth")
    with tempfile.TemporaryDirectory() as tmp:
        mini = _mini_set(6)
        keys = [t["key"] for t in mini["trips"]]
        mini_path = os.path.join(tmp, "set.json")
        _write(mini_path, mini)
        runs = {}
        for name, food, disp in (("a", 1.0, None), ("same", 1.0, None), ("food", 1.2, None),
                                 ("crit", 1.0, {"path": "budget.breakdown.food.lowEur", "kind": "stale",
                                                "severity": "high", "quote": "250",
                                                "reason": "Self-test dispute on the food floor figure.", "url": None})):
            make_stubs(os.path.join(tmp, f"stub-{name}"), keys, food=food, dispute=disp)
            runs[name] = run_set(mini, lambda e, n=name: T.StubClient(os.path.join(tmp, f"stub-{n}", e["key"])),
                                 os.path.join(tmp, f"out-{name}"), mode="stub", today="2026-10-03", set_path=mini_path)
        expect(all(t["status"] == "admitted" for t in runs["a"]["trips"].values()), "the stub trips are admitted")
        expect(not diff_runs(runs["a"], runs["same"], mini)["fail"], "an identical rerun passes")
        d = diff_runs(runs["a"], runs["food"], mini)
        expect(any("budget.food" in f and "systematic" in f for f in d["fail"]),
               "food budgets 20% higher everywhere is caught as systematic drift")
        d = diff_runs(runs["a"], runs["crit"], mini)
        expect(any("new high-severity dispute" in w for w in d["warn"]), "a new high dispute is reported")
        expect(len(runs["crit"]["trips"]["mini-0"]["disputes"]) == 1, "the dispute reaches the run file")
        short = diff_runs(runs["a"], {**runs["a"], "trips": {k: v for k, v in list(runs["a"]["trips"].items())[:2]}},
                          mini)
        expect(any("only 2 trips" in f for f in short["fail"]), "a comparison of two trips is refused")
    expect(stamp()["digest"] == stamp()["digest"], "the stamp is stable")
    for f in fails:
        print("FAIL", f)
    print("golden_set self-test:", "FAILED" if fails else "ok")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
