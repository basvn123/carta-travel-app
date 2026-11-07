"""API key auth and the per-key rate limit."""
from __future__ import annotations

import pytest
from conftest import KEY, OTHER, H, keys
from fastapi.testclient import TestClient
from intelligence.app import create_app
from intelligence.auth import hash_key, match_key, new_key
from intelligence.config import KeySpec, Settings, parse_keys
from intelligence.ratelimit import TokenBucket

ROUTES = [("post", "/tag", {"items": [{"layer": "place", "id": "FLR"}]}),
          ("post", "/link", {"mentions": [{"text": "porto"}]}),
          ("post", "/similar", {"tags": ["set.beach"]}),
          ("post", "/profile", {}),
          ("get", "/taxonomy", None),
          ("get", "/taxonomy/set.beach", None),
          ("get", "/metrics", None)]


class NoBridge:
    def alive(self):
        return False

    def stop(self):
        pass

    def call(self, fn, args=None):
        return {"ping": {}}.get(fn, [])


@pytest.mark.parametrize("method,path,body", ROUTES)
@pytest.mark.parametrize("headers", [{}, {"X-API-Key": "wrong"}, {"Authorization": "Bearer wrong"}, {"X-API-Key": ""},
                                     {"X-API-Key": "x" * 300}])
def test_every_route_needs_a_key(client, method, path, body, headers):
    r = client.request(method.upper(), path, json=body, headers=headers)
    assert r.status_code == 401
    assert r.json() == {"detail": "unauthorized"}


def test_key_in_either_header_and_health_is_open(client):
    assert client.get("/taxonomy/set.beach", headers=H).status_code == 200
    assert client.get("/taxonomy/set.beach", headers={"Authorization": f"Bearer {OTHER}"}).status_code == 200
    assert client.get("/healthz").status_code == 200


def test_fails_closed_without_keys(tags_file):
    with pytest.raises(RuntimeError, match="INTEL_API_KEYS"):
        create_app(Settings(keys=[], tags_path=tags_file), bridge=NoBridge())


def test_key_parsing_and_matching():
    k, h = new_key()
    assert len(k) >= 40 and h == hash_key(k)
    specs = parse_keys(f"pipeline:{h}:600, bad, short:abc, nothex:{'z' * 64}, ops:{hash_key('o')}")
    assert [(s.key_id, s.rate_per_min) for s in specs] == [("pipeline", 600), ("ops", None)]
    assert match_key(k, specs).key_id == "pipeline"
    assert match_key("o", specs).key_id == "ops"
    assert match_key("nope", specs) is None and match_key(None, specs) is None


def test_token_bucket_refills():
    t = [0.0]
    b = TokenBucket(rate_per_min=60, burst=2, clock=lambda: t[0])
    assert b.take("a")[0] and b.take("a")[0]
    ok, retry, _ = b.take("a")
    assert not ok and retry == 1
    assert b.take("b")[0], "keys have their own buckets"
    t[0] = 1.0
    assert b.take("a")[0]
    assert not b.take("a")[0]
    t[0] = 100.0
    assert b.take("a")[2] == 1, "refill stops at the burst"


def test_rate_limit_over_http(tags_file):
    s = Settings(keys=keys(), rate_per_min=1, burst=3, tags_path=tags_file)
    with TestClient(create_app(s, bridge=NoBridge())) as c:
        hdr = {"X-API-Key": OTHER}   # the ops key: default rate, burst 3
        codes = [c.get("/taxonomy/set.beach", headers=hdr).status_code for _ in range(4)]
        assert codes == [200, 200, 200, 429]
        r = c.get("/taxonomy/set.beach", headers=hdr)
        assert r.status_code == 429 and int(r.headers["Retry-After"]) >= 1
        # the pipeline key has its own bucket and its own rate
        assert c.get("/taxonomy/set.beach", headers={"X-API-Key": KEY}).status_code == 200
        assert c.get("/healthz").status_code == 200, "health is never limited"
        m = c.get("/metrics", headers={"X-API-Key": KEY}).text
        assert 'intel_rate_limited_total{key_id="ops"} 2.0' in m


def test_per_key_rate_is_used(tags_file):
    s = Settings(keys=[KeySpec("slow", hash_key("s"), 1), KeySpec("fast", hash_key("f"), 6000)], rate_per_min=60,
                 burst=1, tags_path=tags_file)
    t = [0.0]
    with TestClient(create_app(s, bridge=NoBridge())) as c:
        c.app.state.limiter.clock = lambda: t[0]
        for k in ("s", "f"):
            assert c.get("/taxonomy/set.beach", headers={"X-API-Key": k}).status_code == 200
        t[0] = 0.5   # 0.5 s: the fast key (100/s) has a token again, the slow one (1/min) not
        assert c.get("/taxonomy/set.beach", headers={"X-API-Key": "f"}).status_code == 200
        assert c.get("/taxonomy/set.beach", headers={"X-API-Key": "s"}).status_code == 429
