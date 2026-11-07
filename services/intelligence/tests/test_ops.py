"""Logs, metrics, the bridge's failure handling, the OpenAPI file and the
static rules (no Claude API, no writes)."""
from __future__ import annotations

import io
import json
import logging
import re

from conftest import SERVICE, H
from intelligence import openapi_dump
from intelligence.bridge import BridgeError, NodeBridge
from intelligence.logs import JsonFormatter, ctx


def test_logs_are_json_with_context_and_no_bodies(client):
    log = logging.getLogger("intelligence")
    buf = io.StringIO()
    h = logging.StreamHandler(buf)
    h.setFormatter(JsonFormatter())
    log.addHandler(h)
    try:
        secret = "Xyzzyplace secret trip name"
        client.post("/profile", json={"trips": [{"id": "t", "name": secret, "destIds": ["NCE"]}]},
                    headers={**H, "X-Request-Id": "abc-123"})
    finally:
        log.removeHandler(h)
    lines = [json.loads(x) for x in buf.getvalue().splitlines()]
    req = [x for x in lines if x["msg"] == "request" and x.get("route") == "/profile"]
    assert req and req[-1]["request_id"] == "abc-123" and req[-1]["key_id"] == "pipeline"
    assert req[-1]["status"] == 200 and isinstance(req[-1]["ms"], float)
    assert secret not in buf.getvalue()


def test_formatter_without_context():
    rec = logging.LogRecord("intelligence", logging.WARNING, __file__, 1, "hello", None, None)
    token = ctx.set({})
    try:
        out = json.loads(JsonFormatter().format(rec))
    finally:
        ctx.reset(token)
    assert out["level"] == "warning" and out["msg"] == "hello" and out["ts"].endswith("Z")


def test_request_id_is_sanitised(client):
    r = client.get("/healthz", headers={"X-Request-Id": "a\"b<script>c"})
    assert re.fullmatch(r"[A-Za-z0-9_-]{1,64}", r.headers["X-Request-Id"])


def test_metrics(client):
    client.post("/link", json={"mentions": [{"text": "porto"}]}, headers=H)
    m = client.get("/metrics", headers=H)
    assert m.status_code == 200 and m.headers["content-type"].startswith("text/plain")
    t = m.text
    for name in ("intel_requests_total", "intel_request_seconds_bucket", "intel_items_total", "intel_auth_failures_total",
                 "intel_bridge_calls_total", "intel_similar_index_items"):
        assert name in t, name
    assert re.search(r'intel_bridge_calls_total\{fn="link",outcome="ok"\} [1-9]', t)


def test_bridge_restarts_after_a_crash(client):
    br = client.app.state.bridge
    assert br.call("ping")["places"] > 1000
    br._proc.kill()
    br._proc.wait()
    assert client.post("/link", json={"mentions": [{"text": "porto"}]}, headers=H).status_code == 200
    assert br.alive()


def test_bridge_timeout_and_dead_node_give_503(settings):
    slow = NodeBridge("node", settings.public, settings.app, timeout_s=0.001)
    try:
        try:
            slow.call("ping")
            raised = False
        except BridgeError:
            raised = True
        assert raised and not slow.alive(), "a timeout kills the child"
    finally:
        slow.stop()
    from fastapi.testclient import TestClient
    from intelligence.app import create_app
    dead = NodeBridge("/nonexistent/node", settings.public, settings.app)
    try:
        with TestClient(create_app(settings, bridge=dead)) as c:
            r = c.post("/link", json={"mentions": [{"text": "porto"}]}, headers=H)
            assert r.status_code == 503 and r.json() == {"detail": "linker or profile engine unavailable"}
            assert c.post("/tag", json={"items": [{"layer": "place", "id": "FLR"}]}, headers=H).status_code == 200, \
                "the Python endpoints keep working without node"
    finally:
        dead.stop()


def test_openapi_file_is_current():
    assert openapi_dump.OUT.read_text(encoding="utf-8") == openapi_dump.text(), \
        "run: cd services/intelligence && python -m intelligence.openapi_dump"
    spec = json.loads(openapi_dump.OUT.read_text(encoding="utf-8"))
    assert {"/tag", "/link", "/similar", "/taxonomy", "/profile"} <= set(spec["paths"])
    assert {"APIKeyHeader", "HTTPBearer"} <= set(spec["components"]["securitySchemes"])


def test_static_rules():
    src = "\n".join(p.read_text(encoding="utf-8") for p in SERVICE.rglob("*") if p.suffix in (".py", ".mjs", ".txt", ".toml")
                    and "tests" not in p.parts)
    assert not re.search(r"anthropic|claude", src, re.IGNORECASE), "never the Claude API (CLAUDE.md)"
    assert "ANTHROPIC" not in src
    app_src = (SERVICE / "intelligence" / "app.py").read_text(encoding="utf-8")
    assert "write_text" not in app_src and "open(" not in app_src, "the API writes nothing"
    for f in SERVICE.rglob("*"):
        if f.is_file() and f.suffix in (".py", ".md", ".mjs", ".json", ".yml", ".yaml", ".txt") and "tests" not in f.parts:
            assert "—" not in f.read_text(encoding="utf-8") and "–" not in f.read_text(encoding="utf-8"), f
