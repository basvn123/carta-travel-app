"""Pull one photograph out of everything we publish, in minutes, forever.

Tier: Library

A CC licence does not oblige a photographer to like where their picture
ended up, and an attribution complaint answered in minutes is a non-event
while one answered next quarter is a reputation. Since T049 (derive.py) the
image itself can also be self-hosted on R2, so a takedown has four parts,
in the order they must happen:

  the scrub     walks every wire file under continent-app/public, removes
                every image record that matches the needle (a Commons file
                title, a URL fragment, a Geograph id), reseats galleries,
                and reports what it touched. No full rebuild needed, so it
                runs in well under five minutes.
  the R2 delete rclone purge of the five derivative objects
                (img/{ab}/{cd}/{sha1}/...), one title at a time, so a purge
                that fails for one title never silently skips another.
  the edge purge Cloudflare's purge_cache API for the five cdn_url()s,
                because every object was served with a one-year immutable
                Cache-Control: the R2 delete alone leaves stale bytes at
                the edge and in every browser that already fetched them.
  the manifest  img/manifest/<layer>.json is keyed by canonical title
                (T049's inputs_hash design); a taken-down title is dropped
                from `files` in every layer manifest that carries it, and
                the manifest is re-hashed and re-uploaded exactly the way
                derive.py's build_manifest would, so a title that is gone
                from R2 is also gone from the index that points at R2.
  the ledger    cache/photos/takedowns.json. The scrub alone would last
                until the next export or derive run re-admitted the file,
                so the ledger is consulted by the layers' image passes
                (is_taken_down) and by derive.py's own source gate, and a
                takedown survives every rebuild and every re-run after it.

    python pipeline/photos/takedown.py add "PLAYA DE LAS CATEDRALES.jpg" \
        --reason "author request 2026-08-29"
    python pipeline/photos/takedown.py add "File:Some beach.jpg" --dry-run
    python pipeline/photos/takedown.py scrub          # apply ledger to wire
    python pipeline/photos/takedown.py reach "File:Some beach.jpg"
    python pipeline/photos/takedown.py list

`add` records and scrubs in one step, then reaches R2, the edge and the
manifests for whichever needle looks like a Commons or Geograph identity
(derive.canonical_title succeeds on it); a needle that is only a URL
fragment or an author name still scrubs the wire, but there is no R2 object
to address, and the row's `r2` field says so. `--dry-run` prints every
command it would run (rclone, the Cloudflare HTTP call, the rewritten
manifests) and changes nothing: no ledger write, no wire scrub, no request.
`reach` re-runs the R2/edge/manifest half alone, for a needle already in the
ledger (a purge that failed the first time, or a credential that arrived
after `add` ran without one).

A needle matches case-insensitively against every string field of an image
record, so a file title, a thumb URL or an author name all work; prefer the
file title, it is the stable one and the only form derive.py's identity
functions can resolve to an R2 key.

Failure is loud on purpose. `add` and `reach` are not "best effort": if the
R2 delete, the Cloudflare purge or a manifest re-upload fails, the command
prints the failure, records it in the ledger row (`r2`, `edge`, `manifest`,
each "ok", "failed: <reason>" or "skipped: no credential"), and exits
non-zero. The wire scrub always happens first and is never rolled back by a
later failure: a photograph a court or a photographer asked to be pulled
comes off the site even when the CDN cache cannot be reached right now, and
the ledger row shows exactly what still needs a retry.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "cache" / "photos" / "takedowns.json"
PUBLIC = ROOT / "continent-app" / "public"

CLOUDFLARE_API = "https://api.cloudflare.com/client/v4"

# The wire dirs that carry image records. Scoped so the scrub does not
# parse megabytes of fares and reach files for nothing.
WIRE_DIRS = ("beaches", "lakes", "mountains", "trails", "trips",
             "features", "dossier")

# A dict is an image record when it carries any of these keys.
IMAGE_KEYS = ("u", "url", "thumb", "big", "full", "img")


_ledger_cache = {"mtime": None, "rows": []}


def load_ledger():
    """Cached by mtime: is_taken_down runs once per candidate in every
    layer's image pass, and the ledger changes a few times a year."""
    try:
        mtime = LEDGER.stat().st_mtime
    except OSError:
        return []
    if _ledger_cache["mtime"] != mtime:
        try:
            _ledger_cache["rows"] = json.loads(
                LEDGER.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            _ledger_cache["rows"] = []
        _ledger_cache["mtime"] = mtime
    return _ledger_cache["rows"]


def save_ledger(rows):
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    tmp = LEDGER.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(rows, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    tmp.replace(LEDGER)


def is_taken_down(text, ledger=None):
    """For the layers' image passes: does any ledger needle match this
    candidate's title or URL? Cheap, case-insensitive substring."""
    lowered = str(text or "").lower()
    if not lowered:
        return False
    for row in (ledger if ledger is not None else load_ledger()):
        if row["needle"].lower() in lowered:
            return True
    return False


def _matches(record, needles):
    for value in record.values():
        if isinstance(value, str):
            lowered = value.lower()
            if any(n in lowered for n in needles):
                return True
    return False


def _scrub_node(node, needles, hits):
    """Recursively remove matching image records from every list. A list
    that held a row's images simply gets shorter; a hero removed promotes
    images[1], which is the strongest remaining claim by construction
    because the lists ship ordered."""
    if isinstance(node, list):
        kept = []
        for item in node:
            if (isinstance(item, dict)
                    and any(k in item for k in IMAGE_KEYS)
                    and _matches(item, needles)):
                hits.append(item)
                continue
            _scrub_node(item, needles, hits)
            kept.append(item)
        node[:] = kept
    elif isinstance(node, dict):
        for value in node.values():
            _scrub_node(value, needles, hits)


def scrub(needles=None):
    """Apply the ledger (or an explicit needle list) to every wire file.
    Returns {path: n_removed}; files without a hit are not rewritten."""
    needles = [n.lower() for n in
               (needles or [r["needle"] for r in load_ledger()])]
    if not needles:
        print("ledger empty, nothing to scrub")
        return {}
    touched = {}
    for dirname in WIRE_DIRS:
        base = PUBLIC / dirname
        if not base.exists():
            continue
        for path in sorted(base.rglob("*.json")):
            try:
                text = path.read_text(encoding="utf-8")
            except OSError:
                continue
            lowered = text.lower()
            if not any(n in lowered for n in needles):
                continue
            data = json.loads(text)
            hits = []
            _scrub_node(data, needles, hits)
            if hits:
                tmp = path.with_suffix(".json.tmp")
                tmp.write_text(json.dumps(data, ensure_ascii=False,
                                          separators=(",", ":")),
                               encoding="utf-8")
                tmp.replace(path)
                # Relative for a readable log, absolute when the wire is
                # not under the repo (verify_takedown.py runs the scrub
                # against a copy, and a progress line must never be the
                # thing that fails a takedown).
                try:
                    label = str(path.relative_to(ROOT))
                except ValueError:
                    label = str(path)
                touched[label] = len(hits)
    for rel, n in touched.items():
        print(f"  {rel}: removed {n}")
    if not touched:
        print("no wire file carried a match")
    return touched


def _derive():
    """Lazy import: derive.py does `import takedown` at module load, so a
    module-level `import derive` here would be circular. By the time any
    function below runs, both modules have finished loading."""
    import derive
    return derive


def _addresses(derive, canon, extra=()):
    """Every address a title's objects can live under: the plain sha1 of
    the title, plus any re-upload address (derive.revision_key, T049-i) a
    manifest named for it. Order kept, duplicates dropped."""
    out = [derive.sha1_of(canon)]
    for h in extra or ():
        if h and h not in out:
            out.append(h)
    return out


def r2_delete(title, dry_run, extra=()):
    """rclone purge of the five derivative objects for one canonical title,
    at every address it has had (`extra`: the re-upload addresses the
    manifests named). Returns (status, detail). "skipped: ..." is not a
    failure: a needle that is not a Commons or Geograph identity (an author
    name, a URL fragment) never had an R2 object to begin with."""
    derive = _derive()
    canon = derive.canonical_title(title)
    if not canon:
        return "skipped: not a Commons or Geograph title", None
    cmds = [derive.r2_purge_cmd(h) for h in _addresses(derive, canon, extra)]
    if dry_run:
        for cmd in cmds:
            print("+ " + " ".join(cmd))
        return "dry-run", canon
    if not os.environ.get("RCLONE_CONFIG_R2_ENDPOINT") \
            and not os.environ.get("CARTA_RCLONE"):
        return ("skipped: no RCLONE_CONFIG_R2_* credential on this machine",
                canon)
    statuses = []
    for cmd in cmds:
        print("+ " + " ".join(cmd))
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              check=False)
        if proc.returncode != 0:
            # rclone purge on a prefix nothing ever wrote (a title gated out
            # before it reached R2) is not a failure the operator needs to
            # see again; anything else is loud.
            if "directory not found" in (proc.stderr or "").lower():
                statuses.append("ok: nothing was in R2")
                continue
            return (f"failed: rclone exit {proc.returncode}: "
                    f"{proc.stderr.strip()[:300]}"), canon
        statuses.append("ok")
    return ("ok" if "ok" in statuses else statuses[0]), canon


def edge_purge_cmd(urls):
    """The Cloudflare purge_cache request for these CDN URLs, as a
    (method, url, headers, body) tuple. The token is read from the
    environment at call time and never placed in the returned headers dict
    used for printing (dry-run prints a redacted Authorization)."""
    zone = os.environ.get("CLOUDFLARE_ZONE_ID", "<CLOUDFLARE_ZONE_ID>")
    return ("POST", f"{CLOUDFLARE_API}/zones/{zone}/purge_cache",
            {"Content-Type": "application/json",
             "Authorization": "Bearer <CLOUDFLARE_API_TOKEN>"},
            json.dumps({"files": urls}))


def edge_purge(title, dry_run, extra=()):
    """Cloudflare cache purge of the five cdn_url()s for one canonical
    title. The R2 objects are served with a one-year immutable
    Cache-Control (derive.py IMMUTABLE), so deleting them from the bucket
    is not enough on its own: the edge, and any browser that already
    fetched one, would keep serving the old bytes for up to a year."""
    derive = _derive()
    canon = derive.canonical_title(title)
    if not canon:
        return "skipped: not a Commons or Geograph title", None
    urls = [derive.cdn_url(h, w, fmt)
            for h in _addresses(derive, canon, extra)
            for fmt, w in derive.LADDER]
    method, url, headers, body = edge_purge_cmd(urls)
    if dry_run:
        print(f"+ curl -X {method} {url} "
              f"-H 'Content-Type: application/json' "
              f"-H 'Authorization: Bearer <redacted>' "
              f"--data {body}")
        return "dry-run", urls
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    zone = os.environ.get("CLOUDFLARE_ZONE_ID")
    if not token or not zone:
        return ("skipped: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set",
                urls)
    real_headers = dict(headers)
    real_headers["Authorization"] = f"Bearer {token}"
    real_url = url.replace("<CLOUDFLARE_ZONE_ID>", zone)
    req = urllib.request.Request(real_url, data=body.encode("utf-8"),
                                  headers=real_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        return f"failed: {exc}", urls
    if not payload.get("success"):
        return f"failed: {json.dumps(payload.get('errors'))[:300]}", urls
    return "ok", urls


def _rehash_manifest(data):
    """The same hash build_manifest computes, over the same two fields
    (files, credits) in the same order, so a manifest this module rewrites
    is indistinguishable from one derive.py would have written for the same
    contents. Duplicated rather than imported because derive.build_manifest
    takes Source objects, not a manifest dict; keeping the hash a private
    one-line function here means a change to derive's hash shape is a
    visible diff in both files, not a silent drift."""
    import hashlib
    body = {"files": data.get("files", {}), "credits": data.get("credits", [])}
    return hashlib.sha1(json.dumps(
        body, ensure_ascii=False, sort_keys=True,
        separators=(",", ":")).encode("utf-8")).hexdigest()


def manifest_purge(title, dry_run, work_dir=None, found=None):
    """Drop `title` from `files` in every layer manifest that carries it, so
    the index that points at R2 stops naming an object that (a) may no
    longer be there and (b) must never be re-derived while the ledger holds
    this title. One rclone cat / edit / copyto round trip per layer that
    actually references the title; a layer whose manifest never carried it
    is left untouched and unfetched.

    Returns {layer: status}. `work_dir` is a directory to read/write local
    manifest copies from instead of R2, for tests and for a dry run with no
    credential (derive.py's --out layout: <work_dir>/img/manifest/<layer>.json).

    `found`, when a list, collects the address (`h`) each removed entry
    named, so the R2 delete and the edge purge also reach a re-upload's
    address (T049-i), not only the plain sha1 of the title."""
    derive = _derive()
    canon = derive.canonical_title(title)
    if not canon:
        return {}
    results = {}
    for layer in sorted(derive.ALL_LAYERS):
        key = f"{derive.IMG_PREFIX}/{derive.MANIFEST_DIR}/{layer}.json"
        local_copy = None
        if work_dir is not None:
            local_copy = Path(work_dir) / derive.IMG_PREFIX / \
                derive.MANIFEST_DIR / f"{layer}.json"
            if not local_copy.exists():
                continue
            data = derive.load_manifest(local_copy)
        else:
            cat_cmd = [os.environ.get("CARTA_RCLONE", "rclone"), "cat",
                       f"{derive.REMOTE}:{derive.BUCKET}/{key}"]
            if dry_run:
                print("+ " + " ".join(cat_cmd) + "  # read, edit in memory, "
                      "re-upload only if the title is present")
                results[layer] = "dry-run"
                continue
            if not os.environ.get("RCLONE_CONFIG_R2_ENDPOINT") \
                    and not os.environ.get("CARTA_RCLONE"):
                results[layer] = "skipped: no RCLONE_CONFIG_R2_* credential"
                continue
            proc = subprocess.run(cat_cmd, capture_output=True, check=False)
            if proc.returncode != 0:
                results[layer] = ("skipped: no manifest in R2 for this "
                                   "layer yet")
                continue
            try:
                data = json.loads(proc.stdout.decode("utf-8"))
            except ValueError as exc:
                results[layer] = f"failed: unreadable manifest: {exc}"
                continue
        if canon not in (data.get("files") or {}):
            results[layer] = "ok: title not in this layer's manifest"
            continue
        if found is not None:
            found.append(data["files"][canon].get("h"))
        del data["files"][canon]
        data["count"] = len(data["files"])
        data["inputs_hash"] = _rehash_manifest(data)
        data["generated_at"] = datetime.now(timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ")
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        if local_copy is not None:
            local_copy.write_text(text, encoding="utf-8")
            results[layer] = f"ok: local copy rewritten, {data['count']} files left"
            continue
        put_cmd = [os.environ.get("CARTA_RCLONE", "rclone"), "copyto", "-",
                   f"{derive.REMOTE}:{derive.BUCKET}/{key}",
                   "--header-upload", f"Cache-Control: {derive.MANIFEST_CACHE}",
                   "--header-upload", "Content-Type: application/json",
                   "--s3-no-check-bucket", "--retries", "3"]
        proc = subprocess.run(put_cmd, input=text.encode("utf-8"),
                              capture_output=True, check=False)
        if proc.returncode != 0:
            results[layer] = (f"failed: rclone exit {proc.returncode}: "
                              f"{proc.stderr.decode('utf-8', 'replace')[:300]}")
        else:
            results[layer] = f"ok: {data['count']} files left"
    return results


def reach(title, dry_run=False, work_dir=None):
    """The R2/edge/manifest half of a takedown, for one title already (or
    about to be) in the ledger. Runs all three regardless of an earlier
    failure, because a manifest fix and an edge purge do not depend on each
    other succeeding, and the operator needs to see every outcome in one
    pass rather than fix-and-rerun three times. Returns a dict written into
    the ledger row: {"r2": ..., "edge": ..., "manifest": {...}}."""
    # The manifests go first since T269: they name the address each title
    # is stored under, which after a re-upload is not the plain sha1 of the
    # title, and the R2 delete and the edge purge need every one of them.
    # `h` keeps them in the ledger row, so a later `reach` (when no manifest
    # names the title any more) and derive.py gc still know them.
    found = []
    manifest_status = manifest_purge(title, dry_run, work_dir=work_dir,
                                     found=found)
    derive = _derive()
    prior = next((r.get("h") or [] for r in load_ledger()
                  if r.get("needle") == title), [])
    extra = [h for h in list(prior) + found if h]
    r2_status, canon = r2_delete(title, dry_run, extra)
    edge_status, _ = edge_purge(title, dry_run, extra)
    row = {"r2": r2_status, "edge": edge_status, "manifest": manifest_status,
           "h": _addresses(derive, canon, extra) if canon else []}
    print(f"  r2:       {r2_status}")
    print(f"  edge:     {edge_status}")
    for layer, status in manifest_status.items():
        print(f"  manifest[{layer}]: {status}")
    return row


def _failed(status):
    if isinstance(status, dict):
        return any(_failed(v) for v in status.values())
    return isinstance(status, str) and status.startswith("failed")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    add = sub.add_parser("add", help="record a takedown, scrub, reach R2")
    add.add_argument("needle")
    add.add_argument("--reason", default="")
    add.add_argument("--dry-run", action="store_true",
                      help="print every command, change nothing")
    scrub_p = sub.add_parser("scrub", help="re-apply the whole ledger to the wire")
    scrub_p.add_argument("--dry-run", action="store_true",
                         help="wire scrub has no external command to print; "
                              "kept for symmetry, always a no-op change here")
    reach_p = sub.add_parser("reach", help="re-run R2/edge/manifest for a "
                             "needle already in the ledger")
    reach_p.add_argument("needle")
    reach_p.add_argument("--dry-run", action="store_true")
    reach_p.add_argument("--work-dir", help="read/write local manifest "
                         "copies here instead of R2 (tests, or a dry run "
                         "with derive.py's --out layout)")
    sub.add_parser("list")
    args = ap.parse_args()

    if args.cmd == "add":
        if args.dry_run:
            print(f"would record: {args.needle!r} ({args.reason})")
            print("(the wire scrub is not previewed here: it can only "
                  "report what it would touch by actually touching it, "
                  "which --dry-run must never do; "
                  "verify_takedown.py exercises it against a copy)")
            reach(args.needle, dry_run=True)
            return
        rows = load_ledger()
        if any(r["needle"] == args.needle for r in rows):
            print("already in the ledger, scrubbing and reaching again")
            row = next(r for r in rows if r["needle"] == args.needle)
        else:
            row = {
                "needle": args.needle,
                "reason": args.reason,
                "at": datetime.now(timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"),
            }
            rows.append(row)
        scrub([args.needle])
        result = reach(args.needle)
        row["r2"] = result["r2"]
        row["edge"] = result["edge"]
        row["manifest"] = result["manifest"]
        row["h"] = result["h"]
        save_ledger(rows)
        if _failed(result):
            print("one or more of R2, the edge purge or a manifest rewrite "
                  "failed; the wire is scrubbed, retry with: "
                  f"python pipeline/photos/takedown.py reach {args.needle!r}")
            sys.exit(1)
    elif args.cmd == "scrub":
        scrub()
    elif args.cmd == "reach":
        rows = load_ledger()
        row = next((r for r in rows if r["needle"] == args.needle), None)
        result = reach(args.needle, dry_run=args.dry_run,
                       work_dir=args.work_dir)
        if row is not None and not args.dry_run:
            row["r2"] = result["r2"]
            row["edge"] = result["edge"]
            row["manifest"] = result["manifest"]
            row["h"] = result["h"]
            save_ledger(rows)
        if _failed(result):
            sys.exit(1)
    elif args.cmd == "list":
        for row in load_ledger():
            extra = ""
            if "r2" in row:
                extra = f"  r2={row['r2']}  edge={row.get('edge')}"
            print(f"  {row['at']}  {row['needle']}  ({row['reason']}){extra}")


if __name__ == "__main__":
    main()
