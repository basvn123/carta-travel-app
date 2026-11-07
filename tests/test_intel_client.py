"""T1215 (row T1154-b): the pipeline's Intelligence API client and its batch job.

The batching, Retry-After and skip rules run on a fake transport; one test
runs the real service in-process through FastAPI's TestClient (skipped when
the service's requirements are not installed).
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import intel_client as ic


class FakeSend:
    """Answers /tag with one found result per item; `script` statuses come first."""

    def __init__(self, script=()):
        self.script = list(script)
        self.calls = []

    def __call__(self, method, url, body, headers, timeout):
        self.calls.append((method, url, json.loads(body) if body else None, headers))
        if self.script:
            status, hdrs = self.script.pop(0)
            return status, hdrs, b'{"detail": "busy"}'
        items = json.loads(body)["items"]
        res = [{"layer": i["layer"], "id": i["id"], "found": True, "tags": [{"tag": "set.lake", "score": 0.9}]} for i in items]
        return 200, {}, json.dumps({"results": res}).encode()


def test_unset_url_is_a_clean_skip(monkeypatch, capsys):
    monkeypatch.delenv("INTEL_URL", raising=False)
    assert ic.from_env() is None
    assert ic.main(["tag"]) == 0
    assert "skipped" in capsys.readouterr().out


def test_from_env_reads_url_and_key():
    c = ic.from_env({"INTEL_URL": "http://127.0.0.1:8090/", "INTEL_API_KEY": "k"})
    assert c.base == "http://127.0.0.1:8090" and c.key == "k"


def test_batches_of_one_hundred_with_the_key():
    send = FakeSend()
    c = ic.IntelClient("http://x", "secret", send=send, sleep=lambda s: None)
    items = [{"layer": "place", "id": f"P{k}"} for k in range(250)]
    out = c.tag(items)
    assert [len(b["items"]) for _, _, b, _ in send.calls] == [100, 100, 50]
    assert [r["id"] for r in out] == [i["id"] for i in items]
    assert all(h["X-API-Key"] == "secret" for *_, h in send.calls)
    assert send.calls[0][1] == "http://x/tag"


def test_retry_after_is_honoured_and_capped():
    waits = []
    send = FakeSend([(429, {"Retry-After": "3"}), (503, {"retry-after": "999"})])
    c = ic.IntelClient("http://x", None, send=send, sleep=waits.append)
    assert len(c.tag([{"layer": "place", "id": "BRU"}])) == 1
    assert waits == [3.0, ic.MAX_WAIT_S] and c.calls == 3
    assert "X-API-Key" not in send.calls[0][3]


def test_gives_up_and_raises_on_errors():
    c = ic.IntelClient("http://x", "k", send=FakeSend([(429, {})] * 10), sleep=lambda s: None, max_retries=2)
    with pytest.raises(ic.IntelError):
        c.tag([{"layer": "place", "id": "BRU"}])
    c = ic.IntelClient("http://x", "k", send=FakeSend([(401, {})]), sleep=lambda s: None)
    with pytest.raises(ic.IntelError, match="401"):
        c.tag([{"layer": "place", "id": "BRU"}])


def test_parity_against_a_local_tag_file():
    local = {"place:A": {"tags": [{"tag": "set.lake", "score": 0.9}, {"tag": "set.alpine", "score": 0.7}]},
             "place:B": {"tags": [{"tag": "set.lake", "score": 0.9}]}}
    res = [{"layer": "place", "id": "A", "found": True, "tags": [{"tag": "set.lake", "score": 0.9}]},
           {"layer": "place", "id": "B", "found": True, "tags": [{"tag": "set.lake", "score": 0.9}]},
           {"layer": "place", "id": "C", "found": False, "tags": []}]
    p = ic.parity(res, local, 0.6)
    assert p == {"compared": 2, "not_compared": 1, "mean_jaccard": 0.75, "identical": 1}


def test_the_task_is_registered_and_guarded(monkeypatch):
    import run_pipeline as rp
    keys = [t["key"] for t in rp.TASKS]
    t = rp.TASK_BY_KEY["intel_tags"]
    assert keys.index("intel_tags") < keys.index("photo_sources") < keys.index("trailslab_worker")
    assert t["writes_app_data"] is False and t["writes_wire"] is False and t["soft"] is True
    monkeypatch.delenv("INTEL_URL", raising=False)
    assert t["guard"](None)[0] is False
    monkeypatch.setenv("INTEL_URL", "http://127.0.0.1:8090")
    assert t["guard"](None)[0] is True


def test_against_the_real_service_in_process(tmp_path):
    pytest.importorskip("fastapi")
    pytest.importorskip("prometheus_client")
    sys.path.insert(0, str(ROOT / "services" / "intelligence"))
    from fastapi.testclient import TestClient
    from intelligence.app import create_app
    from intelligence.auth import hash_key
    from intelligence.config import KeySpec, Settings

    key = "pipeline-test-key-0123456789"
    settings = Settings(keys=[KeySpec("pipeline", hash_key(key), 100000)], rate_per_min=6000, burst=300,
                        tags_path=ROOT / "cache" / "taxonomy" / "tags-sample.json")
    with TestClient(create_app(settings)) as tc:
        def send(method, url, body, headers, timeout):
            r = tc.request(method, url.removeprefix("http://intel"), content=body, headers=headers)
            return r.status_code, dict(r.headers), r.content

        c = ic.IntelClient("http://intel", key, send=send, sleep=lambda s: None)
        items = ic.batch_items(0)
        assert len(items) == 15
        tg = ic._tagger()
        local = tmp_path / "tags.json"
        local.write_text(json.dumps(tg.run(tg.eval_items("seed"), tg.Corpus(), log=None)), encoding="utf-8")
        res = ic.run_tag(c, items, local)
        assert res["found"] == 15 and res["requests"] == 1
        assert res["parity"] == {"compared": 15, "not_compared": 0, "mean_jaccard": 1.0, "identical": 15}, \
            "the service and the local tagger agree on the same data"
        assert all(t["tag"].count(".") == 1 for tags in res["results"].values() for t in tags)
        bad = ic.IntelClient("http://intel", "wrong-key", send=send, sleep=lambda s: None)
        with pytest.raises(ic.IntelError, match="401"):
            bad.tag(items[:1])
