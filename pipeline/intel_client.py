"""The pipeline's client for the Carta Intelligence API, and its first batch job (T1215, row T1154-b, ROADMAP F5).

Tier: Library (the client) and Pipeline (the `tag` command, task `intel_tags`)

    python -I pipeline/intel_client.py tag                     seed items plus 20 per layer, parity report
    python -I pipeline/intel_client.py tag --sample 100 --out <file>

The service (services/intelligence) runs on the box, bound to localhost.
Settings come from the environment only:

    INTEL_URL       base URL, for example http://127.0.0.1:8090; unset = skip
    INTEL_API_KEY   the pipeline's key (sent as X-API-Key); never in a file

With INTEL_URL unset the command prints why and exits 0, so the pipeline
task is a clean skip everywhere but the box.

The `tag` command batch-calls POST /tag for catalogue ids (BATCH = 100, the
API's limit per request), waits out a 429 or 503 for its Retry-After, and
writes cache/taxonomy/intel-tags.json: the API's tags per item plus a parity
report against the local tag file (cache/taxonomy/tags.json, else
tags-sample.json). Parity is the mean Jaccard of the profile tag sets; a
service that runs stale code or reads other data shows up as parity under
1.0. Standard library only; no model is called here.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "cache" / "taxonomy" / "intel-tags.json"
LOCAL_TAGS = (ROOT / "cache" / "taxonomy" / "tags.json", ROOT / "cache" / "taxonomy" / "tags-sample.json")
BATCH = 100            # the API's max items per /tag and /link request
MAX_RETRIES = 5        # per request, on 429, 503 or a connection error
MAX_WAIT_S = 60        # the longest Retry-After honoured
TIMEOUT_S = 60
API_LAYERS = ("place", "trail", "beach", "lake", "mountain")   # what /tag accepts


class IntelError(RuntimeError):
    pass


def urllib_send(method: str, url: str, body: bytes | None, headers: dict, timeout: float):
    """(status, headers, body bytes) over urllib; an HTTP error status is returned, not raised."""
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, dict(r.headers.items()), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers.items()) if e.headers else {}, e.read() or b""


class IntelClient:
    def __init__(self, base: str, key: str | None, send=urllib_send, sleep=time.sleep,
                 timeout: float = TIMEOUT_S, max_retries: int = MAX_RETRIES):
        self.base = base.rstrip("/")
        self.key = key
        self.send, self.sleep, self.timeout, self.max_retries = send, sleep, timeout, max_retries
        self.calls = 0
        self.waited_s = 0.0

    def request(self, method: str, path: str, body: dict | None = None) -> dict:
        headers = {"Accept": "application/json"}
        if self.key:
            headers["X-API-Key"] = self.key
        data = None
        if body is not None:
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        for attempt in range(self.max_retries + 1):
            self.calls += 1
            try:
                status, hdrs, raw = self.send(method, self.base + path, data, headers, self.timeout)
            except (urllib.error.URLError, OSError) as e:
                if attempt == self.max_retries:
                    raise IntelError(f"{method} {path}: {e}") from e
                self._wait(None, attempt)
                continue
            if status in (429, 503) and attempt < self.max_retries:
                self._wait({k.lower(): v for k, v in hdrs.items()}.get("retry-after"), attempt)
                continue
            if status >= 400:
                raise IntelError(f"{method} {path}: HTTP {status} {raw[:200].decode('utf-8', 'replace')}")
            return json.loads(raw.decode("utf-8")) if raw else {}
        raise IntelError(f"{method} {path}: gave up after {self.max_retries} retries")

    def _wait(self, retry_after, attempt: int) -> None:
        try:
            s = float(retry_after)
        except (TypeError, ValueError):
            s = 2.0 ** attempt
        s = max(0.0, min(s, MAX_WAIT_S))
        self.waited_s += s
        self.sleep(s)

    def tag(self, items: list[dict], use: str = "profile", evidence: bool = False) -> list[dict]:
        """POST /tag in batches of BATCH. items: [{layer, id}] or [{layer, name, text}]. Results in order."""
        out: list[dict] = []
        for k in range(0, len(items), BATCH):
            res = self.request("POST", "/tag", {"items": items[k:k + BATCH], "use": use, "evidence": evidence})
            out += res.get("results") or []
        return out

    def link(self, mentions: list[dict]) -> list[dict]:
        """POST /link in batches of BATCH."""
        out: list[dict] = []
        for k in range(0, len(mentions), BATCH):
            res = self.request("POST", "/link", {"mentions": mentions[k:k + BATCH]})
            out += res.get("results") or []
        return out


def from_env(env=None, **kw) -> IntelClient | None:
    """A client from INTEL_URL and INTEL_API_KEY, or None when INTEL_URL is unset."""
    env = os.environ if env is None else env
    base = (env.get("INTEL_URL") or "").strip()
    if not base:
        return None
    return IntelClient(base, (env.get("INTEL_API_KEY") or "").strip() or None, **kw)


# ---------------------------------------------------------------- the batch job
def _tagger():
    for p in (ROOT / "pipeline" / "taxonomy", ROOT / "pipeline"):
        if str(p) not in sys.path:
            sys.path.insert(0, str(p))
    import tagger
    return tagger


def batch_items(per_layer: int, seed: bool = True) -> list[dict]:
    """The eval's seed items plus a deterministic sample per layer, as /tag items."""
    tg = _tagger()
    picked = tg.pick(list(tg.Corpus().items(API_LAYERS)), per_layer) if per_layer else []
    seen, out = set(), []
    for it in (tg.eval_items("seed") if seed else []) + picked:
        key = (it["layer"], str(it["item_id"]))
        if it["layer"] in API_LAYERS and key not in seen:
            seen.add(key)
            out.append({"layer": it["layer"], "id": str(it["item_id"])})
    return out


def profile_set(tags: list[dict], threshold: float) -> set[str]:
    return {t["tag"] for t in tags if not t.get("implied") and t.get("score", 0) >= threshold}


def parity(results: list[dict], local: dict, threshold: float) -> dict:
    """Mean Jaccard of the API's and the local tagger's profile tags, over items in both."""
    js, missing = [], 0
    for r in results:
        row = local.get(f"{r['layer']}:{r['id']}")
        if not r.get("found") or row is None:
            missing += 1
            continue
        a, b = profile_set(r.get("tags") or [], threshold), profile_set(row.get("tags") or [], threshold)
        js.append(len(a & b) / len(a | b) if a | b else 1.0)
    return {"compared": len(js), "not_compared": missing,
            "mean_jaccard": round(sum(js) / len(js), 4) if js else None,
            "identical": sum(1 for j in js if j == 1.0)}


def run_tag(client: IntelClient, items: list[dict], local_path: Path | None) -> dict:
    t0 = time.time()
    results = client.tag(items, use="profile", evidence=False)
    local, thr = {}, None
    if local_path and Path(local_path).is_file():
        data = json.loads(Path(local_path).read_text(encoding="utf-8"))
        local, thr = data.get("items") or {}, (data.get("uses") or {}).get("profile")
    thr = thr if thr is not None else _tagger().USES["profile"]
    return {
        "schema": 1, "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "base": client.base,
        "seconds": round(time.time() - t0, 1), "requests": client.calls, "waited_s": round(client.waited_s, 1),
        "items": len(items), "found": sum(1 for r in results if r.get("found")),
        "local": str(local_path) if local else None,
        "parity": parity(results, local, thr) if local else None,
        "results": {f"{r['layer']}:{r['id']}": r.get("tags") or [] for r in results},
    }


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("tag", help="batch-tag catalogue items through POST /tag")
    t.add_argument("--sample", type=int, default=20, help="items per layer besides the seed items (default 20)")
    t.add_argument("--no-seed", action="store_true", help="leave out the eval's 15 seed items")
    t.add_argument("--out", default=str(OUT))
    t.add_argument("--local", default=None, help="local tag file to compare with (default tags.json, else tags-sample.json)")
    a = ap.parse_args(argv)

    client = from_env()
    if client is None:
        print("intel_client: skipped, INTEL_URL is not set (the Intelligence API runs on the box)")
        return 0
    items = batch_items(a.sample, seed=not a.no_seed)
    local = Path(a.local) if a.local else next((p for p in LOCAL_TAGS if p.is_file()), None)
    try:
        res = run_tag(client, items, local)
    except IntelError as e:
        print(f"intel_client: {e}")
        return 1
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({k: res[k] for k in ("items", "found", "requests", "waited_s", "seconds", "parity")}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
