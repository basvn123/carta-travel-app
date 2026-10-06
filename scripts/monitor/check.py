#!/usr/bin/env python3
"""Carta uptime and data-health checker (T235). Standard library only.

Run:  python scripts/monitor/check.py [--targets path] [--json] [--no-notify]

It checks, in order:
  1. HTTP probes: the app, the R2 data host, the cdn host, the Supabase project.
  2. Wire row counts per layer, read from the data host, against a floor.
  3. Pipeline silent failure, read from the pipeline_runs table (migration 041)
     through PostgREST: last run too old, last run failed or soft-failed, a layer
     count that dropped more than max_drop_fraction against the run before.
     Needs CARTA_SUPABASE_URL and CARTA_SUPABASE_SERVICE_KEY; absent, this
     section reports "skip", never "ok".

Alert delivery: every failing check becomes one line in a payload
{"text": ..., "failures": [...]}. If ALERT_WEBHOOK_URL is set the payload is POSTed
there (Slack, ntfy and most hooks accept {"text": ...}). The process also exits 1
on any failure, so a scheduled GitHub Actions run goes red and GitHub emails the
owner even with no webhook configured.

Exit codes: 0 all good, 1 at least one failure, 2 bad configuration.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

TIMEOUT = float(os.environ.get("MONITOR_TIMEOUT", "15"))


def fetch(url, headers=None, timeout=None):
    """Return (status, body_bytes, error_text). Never raises."""
    req = urllib.request.Request(url, headers={"User-Agent": "carta-monitor/1", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout or TIMEOUT) as r:
            return r.status, r.read(2_000_000), None
    except urllib.error.HTTPError as e:
        try:
            body = e.read(200_000)
        except Exception:
            body = b""
        return e.code, body, None
    except Exception as e:  # DNS, TLS, timeout, refused
        return None, b"", f"{type(e).__name__}: {e}"


def check_http(probes, env):
    out = []
    for p in probes:
        if not p.get("enabled", True):
            continue
        name = "http:" + p["name"]
        headers = {}
        expect = list(p.get("expect_status", [200]))
        key_env = p.get("apikey_env")
        if key_env and env.get(key_env):
            headers = {"apikey": env[key_env]}
            expect = [200]
        status, body, err = fetch(p["url"], headers)
        if err:
            out.append((name, False, f"{p['url']} unreachable ({err})"))
        elif status not in expect:
            out.append((name, False, f"{p['url']} answered {status}, expected {expect}"))
        elif p.get("body_contains") and p["body_contains"].encode() not in body:
            out.append((name, False, f"{p['url']} answered {status} but the body lacks {p['body_contains']!r}"))
        elif p.get("json") and not _is_json(body):
            out.append((name, False, f"{p['url']} answered {status} but not with JSON"))
        else:
            out.append((name, True, str(status)))
    return out


def _is_json(body):
    try:
        json.loads(body.decode("utf-8-sig"))
        return True
    except Exception:
        return False


def check_wire(cfg):
    out = []
    base = cfg["base"].rstrip("/")
    for layer, spec in cfg["layers"].items():
        name = "wire:" + layer
        status, body, err = fetch(f"{base}/{spec['path']}")
        if err or status != 200:
            out.append((name, False, f"{base}/{spec['path']} not readable ({err or status})"))
            continue
        try:
            n = json.loads(body.decode("utf-8-sig")).get(spec["field"])
        except Exception:
            n = None
        if not isinstance(n, int):
            out.append((name, False, f"{spec['path']} has no integer field {spec['field']}"))
        elif n < spec["floor"]:
            out.append((name, False, f"{layer} has {n} rows, below the floor of {spec['floor']}"))
        else:
            out.append((name, True, f"{n} rows (floor {spec['floor']})"))
    return out


def _parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def evaluate_runs(rows, cfg, now=None):
    """rows: pipeline_runs rows, newest first (the last two are enough)."""
    now = now or datetime.now(timezone.utc)
    if not rows:
        return [("pipeline:runs", False, "pipeline_runs has no rows: the pipeline has never reported")]
    out = []
    last = rows[0]
    age_h = (now - _parse_ts(last["finished_at"])).total_seconds() / 3600
    if age_h > cfg["max_age_hours"]:
        out.append(("pipeline:age", False, f"last pipeline run finished {age_h:.0f} h ago, limit {cfg['max_age_hours']} h"))
    else:
        out.append(("pipeline:age", True, f"{age_h:.0f} h ago"))
    bad = list(last.get("failed") or [])
    soft = list(last.get("soft_failed") or [])
    if bad:
        out.append(("pipeline:failed", False, "last run failed tasks: " + ", ".join(bad)))
    elif soft:
        out.append(("pipeline:soft_failed", False, "last run soft-failed tasks: " + ", ".join(soft)))
    else:
        out.append(("pipeline:failed", True, "no failed tasks"))
    if len(rows) > 1:
        prev_counts = rows[1].get("layer_counts") or {}
        cur_counts = last.get("layer_counts") or {}
        drops = []
        for layer, prev in prev_counts.items():
            cur = cur_counts.get(layer)
            if not isinstance(prev, int) or prev <= 0:
                continue
            if cur is None:
                drops.append(f"{layer} missing (was {prev})")
            elif (prev - cur) / prev > cfg["max_drop_fraction"]:
                drops.append(f"{layer} {prev} -> {cur}")
        if drops:
            pct = int(cfg["max_drop_fraction"] * 100)
            out.append(("pipeline:row_counts", False, f"layer counts dropped more than {pct} percent: " + "; ".join(drops)))
        else:
            out.append(("pipeline:row_counts", True, "no layer dropped"))
    return out


def check_pipeline(cfg, env):
    base, key = env.get("CARTA_SUPABASE_URL"), env.get("CARTA_SUPABASE_SERVICE_KEY")
    if not base or not key:
        return [("pipeline", None, "skipped: CARTA_SUPABASE_URL or CARTA_SUPABASE_SERVICE_KEY not set")]
    url = (base.rstrip("/") + "/rest/v1/pipeline_runs?select=finished_at,ran,failed,soft_failed,layer_counts"
           "&order=finished_at.desc&limit=2")
    status, body, err = fetch(url, {"apikey": key, "Authorization": "Bearer " + key})
    if err or status != 200:
        return [("pipeline", False, f"pipeline_runs unreadable ({err or status})")]
    try:
        return evaluate_runs(json.loads(body.decode("utf-8")), cfg)
    except Exception as e:
        return [("pipeline", False, f"pipeline_runs answer not understood ({type(e).__name__})")]


def build_payload(results):
    failures = [{"check": n, "detail": d} for n, ok, d in results if ok is False]
    if failures:
        text = f"Carta monitor: {len(failures)} check(s) failing. " + " | ".join(
            f"{f['check']}: {f['detail']}" for f in failures)
    else:
        text = "Carta monitor: all good"
    return {"text": text, "failures": failures,
            "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def notify(payload, url):
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "User-Agent": "carta-monitor/1"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status
    except Exception as e:
        print(f"alert delivery failed: {type(e).__name__}: {e}", file=sys.stderr)
        return None


def run(cfg, env):
    return check_http(cfg["http"], env) + check_wire(cfg["wire_layers"]) + check_pipeline(cfg["pipeline"], env)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", default=str(Path(__file__).with_name("targets.json")))
    ap.add_argument("--json", action="store_true", help="print the alert payload as JSON")
    ap.add_argument("--no-notify", action="store_true", help="do not POST to ALERT_WEBHOOK_URL")
    a = ap.parse_args(argv)
    try:
        cfg = json.loads(Path(a.targets).read_text(encoding="utf-8"))
    except Exception as e:
        print(f"bad targets file: {e}", file=sys.stderr)
        return 2
    results = run(cfg, os.environ)
    for n, ok, d in results:
        print(f"{'ok  ' if ok else ('skip' if ok is None else 'FAIL')} {n}: {d}")
    payload = build_payload(results)
    if payload["failures"]:
        if a.json:
            print(json.dumps(payload, indent=2))
        hook = os.environ.get("ALERT_WEBHOOK_URL")
        if hook and not a.no_notify:
            print("alert POST status:", notify(payload, hook))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
