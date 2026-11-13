"""The shared transport in pipeline/beaches/sources.py (ROADMAP H9).

On 2026-11-13 overpass-api.de refused the build box's IPv4 addresses and one
of its IPv6 addresses dropped the box's SYNs; with one urllib timeout for
connect and read, every request waited the full read timeout on the silent
address and the lakes harvest spent 48 hours on 45 batches. These tests hold
the three rules that replace that: a dead address is tried last next time, a
host with no live address is benched, and a benched host fails at once.

    python -m pytest tests/test_overpass_transport.py -q
"""

import http.server
import socket
import sys
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))

import sources  # noqa: E402

REFUSE, DROP, ACCEPT = 1, 2, 3   # fake ports


class FakeSock:
    """Connects by port: 1 refuses, 2 times out, anything else accepts."""
    log = []

    def __init__(self, *args):
        self.timeout = None

    def settimeout(self, t):
        self.timeout = t

    def bind(self, addr):
        pass

    def connect(self, sockaddr):
        FakeSock.log.append(sockaddr)
        if sockaddr[1] == REFUSE:
            raise ConnectionRefusedError("refused")
        if sockaddr[1] == DROP:
            raise TimeoutError("dropped")

    def close(self):
        pass


@pytest.fixture(autouse=True)
def clean_state():
    for d in (sources._bad_addr, sources._host_fails, sources._benched):
        d.clear()
    FakeSock.log = []
    yield
    for d in (sources._bad_addr, sources._host_fails, sources._benched):
        d.clear()


def fake_dns(monkeypatch, *addrs):
    infos = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", a) for a in addrs]
    monkeypatch.setattr(sources.socket, "getaddrinfo", lambda *a, **k: list(infos))
    monkeypatch.setattr(sources.socket, "socket", FakeSock)


def test_a_dead_address_is_tried_last_next_time(monkeypatch):
    fake_dns(monkeypatch, ("10.0.0.1", REFUSE), ("10.0.0.2", ACCEPT))
    sock = sources._connect(("api.example", 443), timeout=300)
    assert FakeSock.log == [("10.0.0.1", REFUSE), ("10.0.0.2", ACCEPT)]
    assert sock.timeout == 300                       # the read keeps its own timeout
    FakeSock.log = []
    sources._connect(("api.example", 443), timeout=300)
    assert FakeSock.log == [("10.0.0.2", ACCEPT)]   # straight to the live one


def test_each_address_gets_the_short_connect_timeout(monkeypatch):
    seen = []

    class Recording(FakeSock):
        def connect(self, sockaddr):
            seen.append(self.timeout)
            super().connect(sockaddr)

    fake_dns(monkeypatch, ("10.0.0.1", DROP), ("10.0.0.2", ACCEPT))
    monkeypatch.setattr(sources.socket, "socket", Recording)
    sources._connect(("api.example", 443), timeout=300)
    assert seen == [sources.CONNECT_TIMEOUT, sources.CONNECT_TIMEOUT]


def test_a_host_with_no_live_address_is_benched(monkeypatch):
    fake_dns(monkeypatch, ("10.0.0.1", REFUSE), ("10.0.0.2", DROP))
    for _ in range(sources.BENCH_AFTER):
        with pytest.raises(OSError):
            sources._connect(("api.example", 443), timeout=300)
    assert sources.benched_until("api.example") > 0
    FakeSock.log = []
    with pytest.raises(sources.HostBenched):
        sources._connect(("api.example", 443), timeout=300)
    assert FakeSock.log == []                        # not even tried


def test_the_bench_runs_out(monkeypatch):
    fake_dns(monkeypatch, ("10.0.0.1", ACCEPT))
    now = [1000.0]
    monkeypatch.setattr(sources.time, "monotonic", lambda: now[0])
    sources._benched["api.example"] = now[0] + sources.BENCH_SECONDS
    with pytest.raises(sources.HostBenched):
        sources._connect(("api.example", 443), timeout=300)
    now[0] += sources.BENCH_SECONDS + 1
    sources._connect(("api.example", 443), timeout=300)
    assert FakeSock.log == [("10.0.0.1", ACCEPT)]


def test_one_live_connect_clears_the_count(monkeypatch):
    fake_dns(monkeypatch, ("10.0.0.1", REFUSE))
    with pytest.raises(OSError):
        sources._connect(("api.example", 443), timeout=300)
    assert sources._host_fails["api.example"] == 1
    fake_dns(monkeypatch, ("10.0.0.2", ACCEPT))
    sources._connect(("api.example", 443), timeout=300)
    assert sources._host_fails["api.example"] == 0
    assert sources.benched_until("api.example") == 0


def test_request_to_a_benched_host_fails_at_once(monkeypatch):
    slept = []
    monkeypatch.setattr(sources.time, "sleep", lambda s: slept.append(s))
    monkeypatch.setattr(sources.socket, "socket", FakeSock)
    sources._benched["overpass.example"] = sources.time.monotonic() + 60
    with pytest.raises(sources.SourceError, match="benched"):
        sources.request("https://overpass.example/api/interpreter", data={"data": "x"}, tries=4)
    assert slept == [] and FakeSock.log == []


def test_a_real_request_goes_through_the_new_opener():
    class Hello(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = b'{"ok": true}'
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Hello)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        port = server.server_address[1]
        assert sources.get_json(f"http://127.0.0.1:{port}/", timeout=10) == {"ok": True}
    finally:
        server.shutdown()
