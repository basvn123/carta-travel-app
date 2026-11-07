"""Link and page health (ROADMAP D16, T1197).

Tier: Weekly (soft task `link_health` in run_pipeline.py, before photo_sources)

WHAT. Collects every outbound link and image URL in the shipped data
(continent-app/public: app_data.json, beaches, lakes, mountains, cycling,
region) plus the partner landing pages in pipeline/config/link_health.yaml,
checks each politely, and records status and redirects. Broken ones are listed
in the admin Data health tab (continent-app/src/admin/linkHealth.json) and the
share of broken links is a D2 rule (scripts/quality/rules.yaml `links`).

POLITE. A user agent naming Carta and a contact page, no personal data; HEAD
first, one GET (headers only, body never read) when the host refuses HEAD
(403, 405, 501); robots.txt read once per host and respected (a disallowed URL
is recorded `robots`, never fetched); a minimum gap per host; Retry-After
honoured on 429 and 503, and the URL parked for the next run, never looped.
Method chosen in T1197 report "Research": own code on `requests` + stdlib
robotparser.

CLASSES. ok (2xx), moved (3xx chain ending 2xx; `final` is the fix), unsure
(timeout, 429, 5xx, 403: a hiccup, not counted), robots (not fetched), broken
(404, 410, DNS failure, refused connection, or a redirect that dead-ends).
A link is `broken` after `strikes` failed checks in a row; one failure is
`unsure`. The state is resumable: a result younger than `recheck_days` is
not fetched again, and the run stops at its time budget.

    python pipeline/audit/link_health.py run [--limit N] [--budget-min M] [--kind image,source]
    python pipeline/audit/link_health.py report            # rebuild the admin snapshot from the state
    python pipeline/audit/link_health.py collect           # count the links, fetch nothing

State: CARTA_LINKS_OUT or logs/status/links/results.json (the box's git reset
leaves logs/). Snapshot: continent-app/src/admin/linkHealth.json.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib import robotparser
from urllib.parse import urljoin, urlsplit

import yaml

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / "pipeline" / "config" / "link_health.yaml"
STATE_DIR = Path(os.environ.get("CARTA_LINKS_OUT") or ROOT / "logs" / "status" / "links")
SNAPSHOT = ROOT / "continent-app" / "src" / "admin" / "linkHealth.json"
SNAPSHOT_VERSION = 1
LIST_CAP = 200
OFFLINE_MIN, OFFLINE_SHARE = 20, 0.8
URL_RE = re.compile(r"^https?://[^\s]+$")
IMG_EXT = re.compile(r"\.(jpe?g|png|webp|gif|svg|avif)(\?|$)", re.IGNORECASE)
SOURCE_HOSTS = re.compile(r"(^|\.)(wikipedia|wikivoyage|wikidata|wikimedia)\.org$", re.IGNORECASE)
KINDS = ("image", "source", "official", "partner")


def load_config(path: Path = CONFIG) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def kind_of(url: str) -> str:
    host = (urlsplit(url).hostname or "").lower()
    if host == "upload.wikimedia.org" or IMG_EXT.search(urlsplit(url).path + ("?" if "?" in url else "")):
        return "image"
    if SOURCE_HOSTS.search(host):
        return "source"
    return "official"


def _walk(o, path, out):
    if isinstance(o, dict):
        for k, v in o.items():
            _walk(v, path + [str(k)], out)
    elif isinstance(o, list):
        for i, v in enumerate(o):
            _walk(v, path + [str(i)], out)
    elif isinstance(o, str) and URL_RE.match(o):
        out.append((o.strip(), ".".join(path)))


def _layer_and_ids(rel: str, data):
    """(layer, [(id, subtree)]) so a broken link names the item that carries it."""
    first = rel.split("/")[0]
    if rel.endswith("app_data.json") and isinstance(data, dict):
        dests = data.get("destinations") or {}
        items = dests.items() if isinstance(dests, dict) else ((d.get("id"), d) for d in dests)
        return "dest", [(str(i), d) for i, d in items]
    keys = {"beaches": ("beach", "beaches"), "lakes": ("lake", "lakes"), "mountains": ("mountain", "mountains")}
    if first in keys and isinstance(data, dict):
        layer, k = keys[first]
        return layer, [(str(x.get("id") or x.get("slug") or ""), x) for x in data.get(k) or [] if isinstance(x, dict)]
    return first, [(Path(rel).stem, data)]


def collect(cfg: dict, root: Path = ROOT) -> dict[str, dict]:
    """url -> {kind, n, where: [{file, layer, id, path}] (first 3)}."""
    found: dict[str, dict] = {}
    files: list[Path] = []
    for s in cfg.get("sources") or []:
        p = root / s
        files += sorted(p.glob("*.json")) if p.is_dir() else ([p] if p.is_file() else [])
    for f in files:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except ValueError:
            continue
        rel = f.relative_to(root / "continent-app" / "public").as_posix() if "public" in f.parts else f.name
        layer, items = _layer_and_ids(rel, data)
        for iid, sub in items:
            hits: list = []
            _walk(sub, [], hits)
            for url, path in hits:
                e = found.setdefault(url, {"kind": kind_of(url), "n": 0, "where": []})
                e["n"] += 1
                if len(e["where"]) < 3:
                    e["where"].append({"file": rel, "layer": layer, "id": iid, "path": path})
    for u in cfg.get("partners") or []:
        found.setdefault(u, {"kind": "partner", "n": 1, "where": [{"file": "pipeline/config/link_health.yaml", "layer": "partner", "id": "", "path": ""}]})
    return found


class Polite:
    """Per-host pacing and a robots.txt cache. `session` is any object with
    head/get like requests.Session; `sleep` and `clock` are injected in tests."""

    def __init__(self, cfg, session, sleep=time.sleep, clock=time.monotonic):
        self.cfg, self.s, self.sleep, self.clock = cfg, session, sleep, clock
        self.ua = cfg["user_agent"]
        self.last: dict[str, float] = {}
        self.robots: dict[str, robotparser.RobotFileParser | None] = {}
        self.lock = threading.Lock()

    def wait(self, host):
        gap = float((self.cfg.get("host_delay_s") or {}).get(host, self.cfg.get("per_host_delay_s", 1.0)))
        with self.lock:
            t = self.clock()
            at = max(t, self.last.get(host, 0.0) + gap)
            self.last[host] = at
        if at > t:
            self.sleep(at - t)

    def allowed(self, url):
        sp = urlsplit(url)
        key = f"{sp.scheme}://{sp.netloc}"
        if key not in self.robots:
            rp = robotparser.RobotFileParser()
            try:
                self.wait(sp.netloc)
                r = self.s.get(key + "/robots.txt", headers={"User-Agent": self.ua},
                               timeout=self.cfg.get("timeout_s", 15), allow_redirects=True)
                if r.status_code in (401, 403):
                    rp.parse(["User-agent: *", "Disallow: /"])
                elif r.status_code >= 400:
                    rp.parse([])  # no robots.txt: everything allowed
                else:
                    rp.parse(r.text.splitlines())
            except Exception:  # noqa: BLE001 - robots unreadable: treat as allowed, the fetch will show the real state
                rp = None
            self.robots[key] = rp
        rp = self.robots[key]
        return True if rp is None else rp.can_fetch(self.ua, url)

    def check(self, url) -> dict:
        """One URL -> {status, final, chain, err, retry_after}. Redirects are
        followed by hand so every hop is paced, robots-checked and recorded."""
        chain, cur = [], url
        hdr = {"User-Agent": self.ua, "Accept": "*/*"}
        t = self.cfg.get("timeout_s", 15)
        for _ in range(int(self.cfg.get("max_redirects", 5)) + 1):
            if not self.allowed(cur):
                return {"status": None, "final": cur, "chain": chain, "err": "robots", "retry_after": None}
            host = urlsplit(cur).netloc
            try:
                self.wait(host)
                r = self.s.head(cur, headers=hdr, timeout=t, allow_redirects=False)
                if r.status_code in (403, 405, 501):
                    self.wait(host)
                    r = self.s.get(cur, headers=hdr, timeout=t, allow_redirects=False, stream=True)
                    close = getattr(r, "close", None)
                    if close:
                        close()
            except Exception as e:  # noqa: BLE001 - every network failure is a result, not a crash
                return {"status": None, "final": cur, "chain": chain, "err": type(e).__name__, "retry_after": None}
            code = r.status_code
            if code in (301, 302, 303, 307, 308) and r.headers.get("Location"):
                chain.append({"url": cur, "status": code})
                cur = urljoin(cur, r.headers["Location"])
                continue
            ra = r.headers.get("Retry-After") if code in (429, 503) else None
            return {"status": code, "final": cur, "chain": chain, "err": None, "retry_after": ra}
        return {"status": None, "final": cur, "chain": chain, "err": "TooManyRedirects", "retry_after": None}


def classify(res: dict) -> str:
    st, err = res.get("status"), res.get("err")
    if err == "robots":
        return "robots"
    if st is not None and 200 <= st < 300:
        return "moved" if res.get("chain") else "ok"
    if st in (404, 410):
        return "gone"
    if err == "TooManyRedirects" or (err in ("ConnectionError", "SSLError") and not res.get("chain")):
        return "gone"
    return "unsure"


def _now(now=None):
    return (now or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _when(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def merge(prev: dict | None, res: dict, now: str, strikes: int) -> dict:
    """The state row after one more check. `gone` counts a strike; the row is
    `broken` once strikes in a row reach the limit, `unsure` before."""
    cls = classify(res)
    n = (prev or {}).get("strikes", 0) + 1 if cls == "gone" else 0
    state = "broken" if cls == "gone" and n >= strikes else ("unsure" if cls in ("gone", "unsure") else cls)
    return {"state": state, "status": res.get("status"), "err": res.get("err"), "final": res.get("final"),
            "hops": len(res.get("chain") or []), "checked_at": now, "strikes": n,
            "retry_after": res.get("retry_after")}


def load_state(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8")).get("links", {})
    except (OSError, ValueError):
        return {}


def save_state(path: Path, links: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"version": 1, "links": links}, separators=(",", ":")) + "\n", encoding="utf-8")
    tmp.replace(path)


def due(found: dict, state: dict, cfg: dict, now: datetime, kinds=None) -> list[str]:
    """Never-checked first (partner, official and source links before the ~80k
    image URLs, so a short budget covers what matters), then the oldest results
    older than recheck_days. Unsure ones come back on the next run."""
    cut = now - timedelta(days=float(cfg.get("recheck_days", 6)))
    out = []
    for u, e in found.items():
        if kinds and e["kind"] not in kinds:
            continue
        row = state.get(u)
        if row is None:
            out.append((0, KINDS.index(e["kind"]) if e["kind"] != "image" else 9, "", u))
        elif row["state"] == "unsure" or _when(row["checked_at"]) < cut:
            out.append((1, 0, row["checked_at"], u))
    return [x[-1] for x in sorted(out)]


def run(cfg, found, state, polite, now: datetime, limit=None, budget_min=None, kinds=None,
        clock=time.monotonic, save=None) -> dict:
    todo = due(found, state, cfg, now, kinds)
    n_due = len(todo)
    if limit:
        todo = todo[:limit]
    t0 = clock()
    budget = (budget_min if budget_min is not None else cfg.get("budget_minutes", 120)) * 60
    done = 0
    before = {u: state.get(u) for u in todo}
    for u in todo:
        if clock() - t0 > budget:
            break
        res = polite.check(u)
        state[u] = merge(state.get(u), res, _now(now), int(cfg.get("strikes", 2)))
        done += 1
        if save and done % 200 == 0:
            save(state)
    # Offline guard: when nearly every answer in a sizeable run is a network
    # error, the box (or its proxy) was down, not the links. Keep the old rows
    # so no strike is counted and the links are due again next run.
    fresh = [u for u in todo if state.get(u) is not before[u]]
    down = [u for u in fresh if state[u]["status"] is None and state[u]["err"] not in (None, "robots", "TooManyRedirects")]
    offline = len(fresh) >= OFFLINE_MIN and len(down) / len(fresh) >= OFFLINE_SHARE
    if offline:
        for u in fresh:
            if before[u] is None:
                state.pop(u, None)
            else:
                state[u] = before[u]
    if save:
        save(state)
    return {"due": n_due, "checked": done, "offline": offline}


def snapshot(found: dict, state: dict, now: str, cfg: dict) -> dict:
    kinds = {k: {"links": 0, "checked": 0, "ok": 0, "moved": 0, "unsure": 0, "robots": 0, "broken": 0} for k in KINDS}
    broken, moved = [], []
    for u, e in found.items():
        k = kinds[e["kind"]]
        k["links"] += 1
        row = state.get(u)
        if not row:
            continue
        k["checked"] += 1
        k[row["state"]] += 1
        item = {"url": u, "kind": e["kind"], "status": row["status"], "err": row["err"], "final": row["final"],
                "checked_at": row["checked_at"], "uses": e["n"], "where": e["where"]}
        if row["state"] == "broken":
            broken.append(item)
        elif row["state"] == "moved":
            moved.append(item)
    tot = {f: sum(k[f] for k in kinds.values()) for f in ("links", "checked", "ok", "moved", "unsure", "robots", "broken")}
    reachable = tot["checked"] - tot["robots"] - tot["unsure"]
    tot["broken_share"] = round(tot["broken"] / reachable, 4) if reachable else None
    broken.sort(key=lambda x: (-x["uses"], x["url"]))
    moved.sort(key=lambda x: (-x["uses"], x["url"]))
    return {"version": SNAPSHOT_VERSION, "generated_at": now, "totals": tot, "kinds": kinds,
            "broken": broken[:LIST_CAP], "broken_total": len(broken),
            "moved": moved[:LIST_CAP], "moved_total": len(moved)}


def write_snapshot(snap: dict, path: Path = SNAPSHOT):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snap, indent=1) + "\n", encoding="utf-8")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Link and page health (D16)")
    ap.add_argument("cmd", choices=["run", "report", "collect"])
    ap.add_argument("--limit", type=int)
    ap.add_argument("--budget-min", type=float)
    ap.add_argument("--kind", help="comma list of: " + ", ".join(KINDS))
    ap.add_argument("--state", default=str(STATE_DIR / "results.json"))
    ap.add_argument("--no-snapshot", action="store_true")
    a = ap.parse_args(argv)
    cfg = load_config()
    found = collect(cfg)
    by = {k: sum(1 for e in found.values() if e["kind"] == k) for k in KINDS}
    print(f"link_health: {len(found)} distinct links {by}")
    if a.cmd == "collect":
        return 0
    state_path = Path(a.state)
    state = load_state(state_path)
    now = datetime.now(timezone.utc)
    if a.cmd == "run":
        import requests
        s = requests.Session()
        s.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=4))
        r = run(cfg, found, state, Polite(cfg, s), now, a.limit, a.budget_min,
                set(a.kind.split(",")) if a.kind else None, save=lambda st: save_state(state_path, st))
        print(f"link_health: {r['checked']} checked of {r['due']} due")
        if r["offline"]:
            print("link_health: almost every answer was a network error, so this run is discarded (offline guard)")
    snap = snapshot(found, state, _now(now), cfg)
    if not a.no_snapshot:
        write_snapshot(snap)
    t = snap["totals"]
    print(f"link_health: {t['broken']} broken, {t['moved']} moved, {t['unsure']} unsure, share {t['broken_share']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
