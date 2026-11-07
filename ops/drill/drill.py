#!/usr/bin/env python3
"""Incident drill (ROADMAP H8, T1160): walk a seeded incident end to end on a local stack.

Stack: a local HTTP "data host" serving a copy of the published wire indexes, a local
"pager" webhook that records alerts, and scripts/monitor/check.py as the detector, exactly
as the uptime workflow runs it. Steps:

  1. baseline   the monitor is green against the healthy wire
  2. break      seed the incident: the trails index loses most of its rows (a bad data push)
  3. detect     the monitor goes red and names the layer
  4. page       the alert payload is POSTed to the pager and received
  5. roll back  the previous good file is restored (what push-data.mjs does with the last good build)
  6. verify     the monitor is green again
  7. write up   a timeline with the elapsed seconds per step

Nothing leaves the machine: no network but 127.0.0.1, no Supabase, no R2. The drill on the
live stack is an owner step (docs/runbooks/incident.md, "Drill").

    python -I ops/drill/drill.py [--out docs/runbooks/drill-log.md] [--json]

Exit 0 when every step behaved, 1 when one did not.
"""
import argparse
import json
import shutil
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from functools import partial
from http.server import BaseHTTPRequestHandler, HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "monitor"))
import check

LAYERS = {"trails": {"path": "trails/index.json", "field": "n_trips", "floor": 14000},
          "beaches": {"path": "beaches/index.json", "field": "n_beaches", "floor": 2200}}
HEALTHY = {"trails": 17619, "beaches": 2746}  # figures from T072, the same ones targets.json floors are cut from


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def make_pager(inbox):
    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            n = int(self.headers.get("Content-Length", "0"))
            inbox.append(json.loads(self.rfile.read(n) or b"{}"))
            self.send_response(200)
            self.end_headers()

        def log_message(self, *a):
            pass
    return H


def serve(handler):
    srv = HTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def write_wire(base, counts):
    for layer, spec in LAYERS.items():
        p = base / spec["path"]
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({spec["field"]: counts[layer]}), encoding="utf-8")


def run_drill():
    steps = []
    t0 = time.monotonic()

    def step(name, ok, detail):
        steps.append({"step": name, "ok": bool(ok), "detail": detail, "t": round(time.monotonic() - t0, 2)})

    tmp = Path(tempfile.mkdtemp(prefix="carta-drill-"))
    inbox = []
    data_srv = pager = None
    try:
        live, good = tmp / "live", tmp / "last_good"
        write_wire(live, HEALTHY)
        shutil.copytree(live, good)
        data_srv = serve(partial(Quiet, directory=str(live)))
        pager = serve(make_pager(inbox))
        cfg = {"base": f"http://127.0.0.1:{data_srv.server_port}", "layers": LAYERS}
        hook = f"http://127.0.0.1:{pager.server_port}/page"

        res = check.check_wire(cfg)
        step("baseline", all(ok for _, ok, _ in res), "; ".join(f"{n} {d}" for n, _, d in res))

        write_wire(live, {**HEALTHY, "trails": 900})
        step("break", True, "trails index now reports 900 rows (floor 14000), the shape of a truncated data push")

        res = check.check_wire(cfg)
        bad = [(n, d) for n, ok, d in res if ok is False]
        step("detect", [n for n, _ in bad] == ["wire:trails"], "; ".join(f"{n}: {d}" for n, d in bad) or "monitor stayed green")

        payload = check.build_payload(res)
        status = check.notify(payload, hook)
        step("page", status == 200 and len(inbox) == 1 and "wire:trails" in inbox[0].get("text", ""),
             f"pager answered {status}, received: {inbox[0]['text'] if inbox else 'nothing'}")

        shutil.copy(good / LAYERS["trails"]["path"], live / LAYERS["trails"]["path"])
        step("roll back", True, "previous good trails index restored from the last good build")

        res = check.check_wire(cfg)
        step("verify", all(ok for _, ok, _ in res), "; ".join(f"{n} {d}" for n, _, d in res))
    finally:
        for s in (data_srv, pager):
            if s:
                s.shutdown()
                s.server_close()
        shutil.rmtree(tmp, ignore_errors=True)
    return steps


def write_up(steps):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = ["# Incident drill log", "",
             "Written by `ops/drill/drill.py` (ROADMAP H8, T1160). Local stack only: the live drill is an owner step in `incident.md`.", "",
             f"## Run of {now}", "", "Seeded incident: the trails wire index loses most of its rows after a data push.", "",
             "| Step | Result | At (s) | What happened |", "|---|---|---|---|"]
    for s in steps:
        lines.append(f"| {s['step']} | {'pass' if s['ok'] else 'FAIL'} | {s['t']} | {s['detail']} |")
    total = steps[-1]["t"] if steps else 0
    lines += ["", f"Detect to recovered: {total} s on the local stack. On the live stack the detector runs every 15 minutes, so the real time to detect is up to 15 minutes plus the owner's reaction time; time it on the live drill.", ""]
    return "\n".join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", help="write the drill up to this Markdown file")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    steps = run_drill()
    for s in steps:
        print(f"{'ok  ' if s['ok'] else 'FAIL'} {s['step']}: {s['detail']}")
    if a.json:
        print(json.dumps(steps, indent=2))
    if a.out:
        Path(a.out).write_text(write_up(steps), encoding="utf-8")
    return 0 if all(s["ok"] for s in steps) and len(steps) == 6 else 1


if __name__ == "__main__":
    sys.exit(main())
