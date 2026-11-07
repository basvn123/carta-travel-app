"""Link and page health (ROADMAP D16, T1197): the checker on fixtures, no network."""
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc)


def _load(name, rel):
    spec = importlib.util.spec_from_file_location(name, ROOT / rel)
    mod = importlib.util.module_from_spec(spec)
    import sys
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


lh = _load("link_health", "pipeline/link_health.py")


class Resp:
    def __init__(self, code, headers=None, text=""):
        self.status_code, self.headers, self.text = code, headers or {}, text

    def close(self):
        pass


class Fake:
    """requests.Session stand-in: routes maps (method, url) or url to a Resp or exception."""

    def __init__(self, routes):
        self.routes, self.calls, self.agents = routes, [], set()

    def _go(self, method, url, headers=None, **kw):
        self.calls.append((method, url))
        self.agents.add((headers or {}).get("User-Agent"))
        r = self.routes.get((method, url), self.routes.get(url, Resp(404)))
        if isinstance(r, Exception):
            raise r
        return r

    def head(self, url, **kw):
        return self._go("HEAD", url, **kw)

    def get(self, url, **kw):
        return self._go("GET", url, **kw)


@pytest.fixture
def cfg():
    c = lh.load_config()
    c["per_host_delay_s"] = 0
    c["host_delay_s"] = {}
    return c


def polite(cfg, routes):
    s = Fake(routes)
    return lh.Polite(cfg, s, sleep=lambda x: None), s


def test_head_ok_and_agent_names_carta(cfg):
    p, s = polite(cfg, {"https://a.test/robots.txt": Resp(404), "https://a.test/x": Resp(200)})
    r = p.check("https://a.test/x")
    assert lh.classify(r) == "ok"
    assert s.agents == {cfg["user_agent"]} and "Carta" in cfg["user_agent"]
    assert "@" not in cfg["user_agent"]  # no personal data


def test_head_refused_falls_back_to_get(cfg):
    p, s = polite(cfg, {"https://a.test/robots.txt": Resp(404), ("HEAD", "https://a.test/x"): Resp(405),
                        ("GET", "https://a.test/x"): Resp(200)})
    assert lh.classify(p.check("https://a.test/x")) == "ok"
    assert ("GET", "https://a.test/x") in s.calls


def test_redirect_chain_recorded_and_final_is_the_fix(cfg):
    p, _ = polite(cfg, {"https://a.test/robots.txt": Resp(404),
                        "https://a.test/old": Resp(301, {"Location": "/new"}), "https://a.test/new": Resp(200)})
    r = p.check("https://a.test/old")
    assert lh.classify(r) == "moved" and r["final"] == "https://a.test/new" and len(r["chain"]) == 1


def test_robots_disallow_is_never_fetched(cfg):
    p, s = polite(cfg, {"https://a.test/robots.txt": Resp(200, text="User-agent: *\nDisallow: /private\n"),
                        "https://a.test/private/p": Resp(200)})
    r = p.check("https://a.test/private/p")
    assert lh.classify(r) == "robots"
    assert ("HEAD", "https://a.test/private/p") not in s.calls


def test_dead_links_gone_and_hiccups_unsure(cfg):
    p, _ = polite(cfg, {"https://a.test/robots.txt": Resp(404), "https://a.test/404": Resp(404),
                        "https://a.test/429": Resp(429, {"Retry-After": "60"}), "https://a.test/500": Resp(503),
                        "https://a.test/loop": Resp(302, {"Location": "/loop"})})
    assert lh.classify(p.check("https://a.test/404")) == "gone"
    r429 = p.check("https://a.test/429")
    assert lh.classify(r429) == "unsure" and r429["retry_after"] == "60"
    assert lh.classify(p.check("https://a.test/500")) == "unsure"
    assert lh.classify(p.check("https://a.test/loop")) == "gone"


def test_strikes_make_broken_only_on_the_second_failure(cfg):
    gone = {"status": 404, "final": "u", "chain": [], "err": None, "retry_after": None}
    one = lh.merge(None, gone, "2026-11-01T00:00:00Z", 2)
    assert one["state"] == "unsure" and one["strikes"] == 1
    two = lh.merge(one, gone, "2026-11-08T00:00:00Z", 2)
    assert two["state"] == "broken"
    ok = lh.merge(two, {**gone, "status": 200}, "2026-11-15T00:00:00Z", 2)
    assert ok["state"] == "ok" and ok["strikes"] == 0


def test_host_pacing(cfg):
    cfg["per_host_delay_s"] = 1.0
    slept, t = [], [100.0]
    s = Fake({"https://a.test/robots.txt": Resp(404), "https://a.test/x": Resp(200), "https://a.test/y": Resp(200)})
    p = lh.Polite(cfg, s, sleep=lambda x: slept.append(x), clock=lambda: t[0])
    p.check("https://a.test/x")
    p.check("https://a.test/y")
    assert slept == [1.0, 2.0]  # robots.txt, then x, then y, one second apart on a frozen clock


def make_tree(tmp_path):
    pub = tmp_path / "continent-app" / "public"
    (pub / "beaches").mkdir(parents=True)
    (pub / "app_data.json").write_text(json.dumps({"destinations": {"rome": {
        "image": {"url": "https://upload.wikimedia.org/a.jpg", "page": "https://en.wikipedia.org/wiki/Rome"},
        "official": "https://rome.example/", "name": "Rome"}}}), encoding="utf-8")
    (pub / "beaches" / "IT.json").write_text(json.dumps({"beaches": [
        {"id": "b1", "images": [{"u": "https://upload.wikimedia.org/a.jpg"}], "site": "https://beach.example/"}]}),
        encoding="utf-8")
    return tmp_path


def test_collect_finds_kinds_dedupes_and_names_the_item(tmp_path, cfg):
    root = make_tree(tmp_path)
    cfg = {**cfg, "sources": ["continent-app/public/app_data.json", "continent-app/public/beaches"], "partners": ["https://p.example/"]}
    found = lh.collect(cfg, root)
    img = found["https://upload.wikimedia.org/a.jpg"]
    assert img["kind"] == "image" and img["n"] == 2
    assert {(w["layer"], w["id"]) for w in img["where"]} == {("dest", "rome"), ("beach", "b1")}
    assert found["https://en.wikipedia.org/wiki/Rome"]["kind"] == "source"
    assert found["https://rome.example/"]["kind"] == "official"
    assert found["https://p.example/"]["kind"] == "partner"


def test_run_is_resumable_and_the_snapshot_lists_broken(tmp_path, cfg):
    root = make_tree(tmp_path)
    cfg = {**cfg, "sources": ["continent-app/public/app_data.json", "continent-app/public/beaches"], "partners": [], "strikes": 1}
    found = lh.collect(cfg, root)
    routes = {"https://upload.wikimedia.org/robots.txt": Resp(404), "https://en.wikipedia.org/robots.txt": Resp(404),
              "https://rome.example/robots.txt": Resp(404), "https://beach.example/robots.txt": Resp(404),
              "https://upload.wikimedia.org/a.jpg": Resp(404), "https://en.wikipedia.org/wiki/Rome": Resp(200),
              "https://rome.example/": Resp(200), "https://beach.example/": Resp(200)}
    p, _ = polite(cfg, routes)
    state = {}
    r = lh.run(cfg, found, state, p, NOW, limit=2)
    assert (r["due"], r["checked"]) == (4, 2)
    assert lh.due(found, state, cfg, NOW)  # two left
    lh.run(cfg, found, state, p, NOW)
    assert lh.due(found, state, cfg, NOW) == []  # nothing is fetched twice
    snap = lh.snapshot(found, state, "2026-11-07T12:00:00Z", cfg)
    assert snap["totals"]["checked"] == 4 and snap["totals"]["broken"] == 1
    assert snap["broken"][0]["url"].endswith("a.jpg") and snap["broken"][0]["where"][0]["layer"] in ("dest", "beach")
    assert snap["totals"]["broken_share"] == 0.25
    # Non-image links are checked before images when the budget is short.
    assert lh.due(found, {}, cfg, NOW)[-1].endswith("a.jpg")


def test_config_is_polite_by_design():
    c = lh.load_config()
    assert c["per_host_delay_s"] >= 1.0 and c["host_delay_s"]["upload.wikimedia.org"] >= 0.5
    assert c["strikes"] >= 2 and c["timeout_s"] <= 30


def test_an_offline_run_is_discarded_and_counts_no_strike(cfg):
    cfg = {**cfg, "sources": [], "partners": [], "strikes": 1}
    import requests
    found = {f"https://h{i}.test/x": {"kind": "official", "n": 1, "where": []} for i in range(25)}
    routes = {f"https://h{i}.test/robots.txt": requests.ConnectionError("down") for i in range(25)}
    routes.update({f"https://h{i}.test/x": requests.ConnectionError("down") for i in range(25)})
    p, _ = polite(cfg, routes)
    state = {}
    r = lh.run(cfg, found, state, p, NOW)
    assert r["offline"] and state == {}
    # A few real network errors among good answers still count.
    routes.update({f"https://h{i}.test/x": Resp(200) for i in range(1, 25)})
    p, _ = polite(cfg, routes)
    r = lh.run(cfg, found, state, p, NOW)
    assert not r["offline"] and state["https://h0.test/x"]["state"] == "broken"
