"""Tests for scripts/monitor/check.py (T235). Local stub servers only, no network.

Run: python -m unittest tests.test_monitor_check -v   (from the repo root)
"""
import json
import sys
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "monitor"))
import check  # noqa: E402

check.TIMEOUT = 3


def iso(hours_ago):
    return (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()


class Stub:
    """One server standing in for app, data host, PostgREST and the alert webhook."""

    def __init__(self):
        self.routes = {}      # path -> (status, body)
        self.posted = []      # webhook bodies
        stub = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                status, body = stub.routes.get(self.path.split("?")[0], (404, b"no"))
                self.send_response(status)
                self.end_headers()
                self.wfile.write(body)

            def do_POST(self):
                n = int(self.headers.get("Content-Length", 0))
                stub.posted.append(json.loads(self.rfile.read(n)))
                self.send_response(200)
                self.end_headers()

        self.srv = HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_port}"
        self.t = threading.Thread(target=self.srv.serve_forever, daemon=True)
        self.t.start()

    def stop(self):
        self.srv.shutdown()
        self.srv.server_close()


def healthy(stub):
    stub.routes["/"] = (200, b'<html><div id="root"></div></html>')
    for layer, field, n in [("beaches", "n_beaches", 2746), ("lakes", "n_lakes", 1681)]:
        stub.routes[f"/data/{layer}/index.json"] = (200, json.dumps({field: n}).encode())
    stub.routes["/rest/v1/pipeline_runs"] = (200, json.dumps([
        {"finished_at": iso(5), "failed": [], "soft_failed": [], "layer_counts": {"beaches": 2746, "lakes": 1681}},
        {"finished_at": iso(173), "failed": [], "soft_failed": [], "layer_counts": {"beaches": 2740, "lakes": 1680}},
    ]).encode())


def cfg_for(stub):
    return {
        "http": [
            {"name": "app", "url": stub.url + "/", "expect_status": [200], "body_contains": '<div id="root"'},
            {"name": "data-host", "url": stub.url + "/data/beaches/index.json", "json": True},
        ],
        "wire_layers": {"base": stub.url + "/data", "layers": {
            "beaches": {"path": "beaches/index.json", "field": "n_beaches", "floor": 2200},
            "lakes": {"path": "lakes/index.json", "field": "n_lakes", "floor": 1350}}},
        "pipeline": {"max_age_hours": 216, "max_drop_fraction": 0.10},
    }


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.stub = Stub()
        healthy(self.stub)
        self.cfg = cfg_for(self.stub)
        self.env = {"CARTA_SUPABASE_URL": self.stub.url, "CARTA_SUPABASE_SERVICE_KEY": "k"}

    def tearDown(self):
        self.stub.stop()

    def failing(self):
        return {n for n, ok, _ in check.run(self.cfg, self.env) if ok is False}

    def test_healthy_is_silent(self):
        self.assertEqual(self.failing(), set())
        self.assertEqual(check.build_payload(check.run(self.cfg, self.env))["failures"], [])

    def test_endpoint_stopped(self):
        self.stub.stop()
        f = self.failing()
        self.assertIn("http:app", f)
        self.assertIn("wire:beaches", f)
        self.assertIn("pipeline", f)

    def test_wrong_body_and_status(self):
        self.stub.routes["/"] = (200, b"<html>maintenance</html>")
        self.assertIn("http:app", self.failing())
        self.stub.routes["/"] = (502, b"bad gateway")
        self.assertIn("http:app", self.failing())

    def test_data_host_not_json(self):
        self.stub.routes["/data/beaches/index.json"] = (200, b"<html>error</html>")
        self.assertIn("http:data-host", self.failing())

    def test_wire_below_floor(self):
        self.stub.routes["/data/lakes/index.json"] = (200, json.dumps({"n_lakes": 900}).encode())
        self.assertEqual(self.failing(), {"wire:lakes"})

    def test_pipeline_stale(self):
        rows = json.loads(self.stub.routes["/rest/v1/pipeline_runs"][1])
        rows[0]["finished_at"] = iso(300)
        self.stub.routes["/rest/v1/pipeline_runs"] = (200, json.dumps(rows).encode())
        self.assertEqual(self.failing(), {"pipeline:age"})

    def test_pipeline_failed_task(self):
        rows = json.loads(self.stub.routes["/rest/v1/pipeline_runs"][1])
        rows[0]["failed"] = ["fare_model"]
        self.stub.routes["/rest/v1/pipeline_runs"] = (200, json.dumps(rows).encode())
        self.assertEqual(self.failing(), {"pipeline:failed"})

    def test_pipeline_row_count_drop(self):
        rows = json.loads(self.stub.routes["/rest/v1/pipeline_runs"][1])
        rows[0]["layer_counts"]["beaches"] = 1200
        self.stub.routes["/rest/v1/pipeline_runs"] = (200, json.dumps(rows).encode())
        self.assertEqual(self.failing(), {"pipeline:row_counts"})
        rows[0]["layer_counts"] = {"lakes": 1681}  # beaches vanished
        self.stub.routes["/rest/v1/pipeline_runs"] = (200, json.dumps(rows).encode())
        self.assertEqual(self.failing(), {"pipeline:row_counts"})

    def test_no_rows_ever(self):
        self.stub.routes["/rest/v1/pipeline_runs"] = (200, b"[]")
        self.assertEqual(self.failing(), {"pipeline:runs"})

    def test_no_credentials_is_skip_not_ok(self):
        res = check.check_pipeline(self.cfg["pipeline"], {})
        self.assertEqual(res[0][1], None)

    def test_webhook_receives_payload_and_exit_code(self):
        import os
        import tempfile
        self.stub.routes["/"] = (503, b"down")
        p = Path(tempfile.mkdtemp()) / "t.json"
        p.write_text(json.dumps(self.cfg))
        old = dict(os.environ)
        os.environ.update(self.env)
        os.environ["ALERT_WEBHOOK_URL"] = self.stub.url + "/hook"
        try:
            code = check.main(["--targets", str(p), "--json"])
        finally:
            os.environ.clear()
            os.environ.update(old)
        self.assertEqual(code, 1)
        self.assertEqual(len(self.stub.posted), 1)
        self.assertIn("http:app", self.stub.posted[0]["text"])
        self.assertEqual(self.stub.posted[0]["failures"][0]["check"], "http:app")


if __name__ == "__main__":
    unittest.main()
