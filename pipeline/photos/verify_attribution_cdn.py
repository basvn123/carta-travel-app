"""Attribution follows the pixels: the credit gate, proven on the R2 path.

Tier: Manual

CARTA_CLOUD_ARCHITECTURE.md section 4.5. A hotlinked Commons file is
Wikimedia's copy; a transcoded file in R2, served from
cdn.carta-europetravel.com, is OURS, and a CC BY-SA copy we serve without
its author is a licence breach we commit, not one we link to. The rule
that keeps an uncredited photograph out of every layer export is
credit.owes_credit(). This harness proves the same rule stands between a
cache record and the image manifest (img/manifest/<layer>.json), which is
the only thing that points at an object in R2, and that the manifest
carries enough for the app to print the credit from a CDN URL alone.

Three parts, all offline apart from one `node` process:

  gate      every beach record goes through derive.collect() (the five
            gates) and derive.build_manifest(); every manifest entry must
            carry a licence and, unless the licence or Commons says none is
            owed, an author. Then a hostile cache of eight records (no
            author, punctuation for an author, an empty HTML wrapper, no
            licence, NC, ND, GFDL unnamed, and one good file) goes the same
            way, plus an entry smuggled into build_manifest for a title that
            never passed the gates: only the good file and the exempt one
            may come out.
  file      one real CC BY-SA beach file from the published wire (Commons by
            default, `--title` to choose, and the first native Geograph
            file too) through collect() and build_manifest() with no fetch
            and no upload. The manifest is written to --out; the CDN URL is
            derive.cdn_url(). src/lib/imageCredit.js then resolves that URL
            against that manifest in node, and the credit it returns must
            match the wire's own by, lic, licUrl and page.
  --run     optional: a real `derive.py run --upload none` output directory
            (manifest plus the encoded objects under img/). Every entry's
            five objects must exist there, every credit must be complete,
            and every CC BY-SA entry must resolve in the app.
  --manifest  the same checks on a manifest file alone, such as the live
            one read back from R2; with --head N, the five CDN URLs of the
            first N CC BY-SA entries are fetched with HEAD and must answer
            200 with the right Content-Type and the immutable Cache-Control.

What this is NOT: a live check. No R2 credential exists on the laptop this
was written on, so "served from R2" is simulated by a manifest plus
cdn_url() (and, with --run, by the local img/ tree a run writes before it
would upload). The live check is Execution/P3/_OPEN-hetzner.md step 28.

    python pipeline/photos/verify_attribution_cdn.py
    python pipeline/photos/verify_attribution_cdn.py --run <derive out dir>
    python pipeline/photos/verify_attribution_cdn.py --manifest beaches.json --head 5

Exit 0 when everything holds, 1 on any failure. Writes nothing in the repo.
ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import credit  # noqa: E402
import derive  # noqa: E402

ROOT = HERE.parent.parent
APP = ROOT / "continent-app"
RESOLVER = APP / "src" / "lib" / "imageCredit.js"
LAYER = "beaches"

FAILS = []


def check(cond, what):
    if not cond:
        FAILS.append(what)
        print(f"  FAIL  {what}")
    return cond


def complete(pair, stamped=False):
    """A manifest credit pair is complete when it has a licence that may be
    stored, and an author unless nothing is owed."""
    lic, by = (pair + ["", ""])[:2]
    if not str(lic).strip() or derive.NOT_STORABLE.search(lic):
        return False
    if stamped:
        return True
    return not credit.owes_credit({"license": lic, "author": by})


def fake_entries(sources_):
    """Pixel sizes do not bear on the credit; the manifest needs some."""
    d = {"320": [320, 213], "640": [640, 427], "1280": [1280, 853]}
    return {s.title: {"h": s.sha1, "d": d} for s in sources_}


def stamped_titles(layer):
    out = set()
    for _cc, _ri, _ii, img in derive.iter_layer(layer):
        if img.get("no_attribution_required"):
            t = derive.canonical_title(img)
            if t:
                out.add(t)
    return out


# ---------------------------------------------------------------------------
# gate
# ---------------------------------------------------------------------------

def part_gate(measure):
    print("gate: every beach record through collect() and build_manifest()")
    published = derive.published_titles(LAYER) or set()
    srcs, stats = derive.collect(LAYER)
    stamped = stamped_titles(LAYER)
    man = derive.build_manifest(LAYER, srcs, fake_entries(srcs), "t051-gate")
    # T051-c: the manifest says "nothing owed" itself (`n`), so the
    # completeness check reads the manifest alone, and the cache's stamps
    # are only the cross-check that every one of them arrived.
    marked = {t for t, e in man["files"].items() if e.get("n")}
    check(stamped & set(man["files"]) <= marked,
          f"{len(stamped & set(man['files']) - marked)} stamped files lack "
          f"the manifest's nothing-owed marker")
    measure["nothing_owed_marked"] = len(marked)
    bad = [t for t, e in man["files"].items()
           if not complete(man["credits"][e["c"]], bool(e.get("n")))]
    check(not bad, f"{len(bad)} manifest entries lack a complete credit"
          + (f", first {bad[0]}" if bad else ""))
    check(man["count"] == stats["unique"],
          "manifest count differs from the gated source count")
    print(f"  {stats['records']} records, {stats['unique']} sources after the "
          f"gates, refused {stats['rejected']}; {man['count']} manifest "
          f"entries, {len(man['credits'])} distinct credits, "
          f"{len(bad)} incomplete")

    # The measurement: published titles owing a credit, and how many of
    # them the manifest carries complete.
    owing = set()
    for path in sorted((APP / "public" / LAYER).glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for row in (data.get(LAYER) or []) + (data.get("listed") or []):
            for img in row.get("images") or []:
                lic = (img.get("lic") or "").strip()
                if lic and not credit.NO_CREDIT_LIC.search(lic):
                    t = derive.canonical_title(img)
                    if t:
                        owing.add(t)
    carried = sum(1 for t in owing if t in man["files"] and complete(
        man["credits"][man["files"][t]["c"]], bool(man["files"][t].get("n"))))
    measure["published_titles"] = len(published)
    measure["published_owing_credit"] = len(owing)
    measure["owing_with_complete_manifest_credit"] = carried
    check(carried == len(owing),
          f"{len(owing) - carried} published titles owing credit are not "
          f"carried complete in the manifest")
    print(f"  published {LAYER}: {len(published)} titles, {len(owing)} owe a "
          f"credit, {carried} carried complete in the manifest")

    print("gate: a hostile cache")
    hostile = [
        ("File:T051 good.jpg", {"license": "CC BY-SA 4.0",
                                "author": "Jane Doe"}, True),
        ("File:T051 cc0.jpg", {"license": "CC0", "author": ""}, True),
        ("File:T051 no author.jpg", {"license": "CC BY-SA 4.0",
                                     "author": ""}, False),
        ("File:T051 comma.jpg", {"license": "CC BY-SA 3.0",
                                 "author": " , "}, False),
        ("File:T051 span.jpg", {"license": "CC BY 2.0",
                                "author": "<span></span>"}, False),
        ("File:T051 unlicensed.jpg", {"license": "",
                                      "author": "Jane Doe"}, False),
        ("File:T051 nc.jpg", {"license": "CC BY-NC-SA 4.0",
                              "author": "Jane Doe"}, False),
        ("File:T051 nd.jpg", {"license": "CC BY-ND 2.0",
                              "author": "Jane Doe"}, False),
        ("File:T051 gfdl.jpg", {"license": "GFDL", "author": ""}, False),
    ]
    real_iter, real_ledger = derive.iter_layer, derive.takedown.load_ledger

    def fake_iter(layer, countries=None):
        for i, (title, rec, _ok) in enumerate(hostile):
            yield "XX", i, 0, dict(rec, file=title)
    derive.iter_layer = fake_iter
    derive.takedown.load_ledger = lambda *a, **k: []
    try:
        hs, hstats = derive.collect(LAYER)
    finally:
        derive.iter_layer, derive.takedown.load_ledger = real_iter, real_ledger
    entries = fake_entries(hs)
    entries["File:T051 smuggled.jpg"] = {
        "h": derive.sha1_of("File:T051 smuggled.jpg"),
        "d": {"320": [320, 213], "640": [640, 427], "1280": [1280, 853]}}
    hman = derive.build_manifest(LAYER, hs, entries, "t051-hostile")
    want = {t for t, _r, ok in hostile if ok}
    check(set(hman["files"]) == want,
          f"hostile cache: manifest holds {sorted(hman['files'])}, "
          f"expected {sorted(want)}")
    for t, e in hman["files"].items():
        check(complete(hman["credits"][e["c"]]),
              f"hostile cache: {t} entered without a complete credit")
    print(f"  {len(hostile)} records in, {hman['count']} out "
          f"({', '.join(sorted(hman['files']))}); refused {hstats['rejected']}; "
          f"the smuggled entry was dropped")


# ---------------------------------------------------------------------------
# the app side, in node
# ---------------------------------------------------------------------------

NODE_DRIVER = r"""
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const [resolverPath, casesPath] = process.argv.slice(2);
const m = await import(pathToFileURL(resolverPath).href);
const cases = JSON.parse(readFileSync(casesPath, 'utf8'));
const out = [];
for (const c of cases) {
  const manifest = c.manifest ? JSON.parse(readFileSync(c.manifest, 'utf8')) : undefined;
  const viaFor = await m.creditFor(c.url, { manifest });
  const direct = m.creditFromManifest ? m.creditFromManifest(c.url, manifest) : null;
  out.push({ id: c.id, creditFor: viaFor, direct,
             line: m.creditLine ? m.creditLine(viaFor) : null });
}
process.stdout.write(JSON.stringify(out));
"""


def run_node(cases, tmp):
    node = shutil.which("node")
    if not node:
        check(False, "node is not on PATH; the app resolver cannot be run")
        return {}
    driver = Path(tmp) / "t051_driver.mjs"
    driver.write_text(NODE_DRIVER, encoding="utf-8")
    cpath = Path(tmp) / "t051_cases.json"
    cpath.write_text(json.dumps(cases), encoding="utf-8")
    res = subprocess.run([node, str(driver), str(RESOLVER), str(cpath)],
                         capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        check(False, f"node failed: {res.stderr.strip()[:400]}")
        return {}
    return {r["id"]: r for r in json.loads(res.stdout)}


def _norm_url(u):
    return (u or "").rstrip("/")


def expect_credit(got, want, label):
    """`want` is a wire image record (by, lic, licUrl, page)."""
    if not check(got is not None, f"{label}: resolver returned null"):
        return
    check(got.get("by") == (want.get("by") or "").strip(),
          f"{label}: author {got.get('by')!r} != wire {want.get('by')!r}")
    check(got.get("lic") == (want.get("lic") or "").strip(),
          f"{label}: licence {got.get('lic')!r} != wire {want.get('lic')!r}")
    if want.get("licUrl"):
        check(_norm_url(got.get("licUrl")) == _norm_url(want["licUrl"]),
              f"{label}: licUrl {got.get('licUrl')!r} != wire "
              f"{want['licUrl']!r}")
    check(derive.canonical_title(got.get("page") or "")
          == derive.canonical_title(want),
          f"{label}: page {got.get('page')!r} names a different file than "
          f"the wire's {want.get('page')!r}")


# ---------------------------------------------------------------------------
# one real file
# ---------------------------------------------------------------------------

def pick_files(title_arg):
    """(commons record, cc) and (geograph record, cc): published CC BY-SA
    beach images, first in sorted country order unless --title."""
    want = derive.canonical_title(title_arg) if title_arg else None
    commons = geograph = None
    for path in sorted((APP / "public" / LAYER).glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        cc = path.stem.upper()
        for row in (data.get(LAYER) or []) + (data.get("listed") or []):
            for img in row.get("images") or []:
                lic = (img.get("lic") or "")
                t = derive.canonical_title(img)
                if not t or not lic.upper().startswith("CC BY-SA"):
                    continue
                if want:
                    if t == want and commons is None:
                        commons = (img, cc)
                elif t.startswith("File:") and commons is None:
                    commons = (img, cc)
                if t.startswith("geograph:") and geograph is None:
                    geograph = (img, cc)
        if commons and geograph:
            break
    return commons, geograph


def manifest_for(img, cc, out):
    title = derive.canonical_title(img)
    srcs, _stats = derive.collect(LAYER, {cc})
    srcs = [s for s in srcs if s.title == title]
    if not check(len(srcs) == 1, f"{title}: did not pass the gates"):
        return None, title
    man = derive.build_manifest(LAYER, srcs, fake_entries(srcs), "t051-file")
    path = Path(out) / f"{derive.sha1_of(title)[:12]}-manifest.json"
    path.write_text(json.dumps(man, ensure_ascii=False, indent=1),
                    encoding="utf-8")
    return path, title


def part_file(args, tmp, measure):
    print("file: a real CC BY-SA beach file through the manifest path")
    commons, geograph = pick_files(args.title)
    if not check(commons is not None, "no published CC BY-SA Commons beach "
                 "file found" + (f" for {args.title}" if args.title else "")):
        return
    picks = [("commons", commons)] + ([("geograph", geograph)]
                                      if geograph else [])
    cases, wires = [], {}
    for kind, (img, cc) in picks:
        mpath, title = manifest_for(img, cc, args.out)
        if not mpath:
            continue
        man = json.loads(mpath.read_text(encoding="utf-8"))
        e = man["files"][title]
        pair = man["credits"][e["c"]]
        check(pair == [img["lic"].strip(), img["by"].strip()],
              f"{kind}: manifest credit {pair} != wire "
              f"[{img['lic']!r}, {img['by']!r}]")
        check(e["h"] == derive.sha1_of(title), f"{kind}: h is not sha1(title)")
        for w, fmt in ((320, "avif"), (640, "avif"), (1280, "avif"),
                       (320, "webp"), (640, "webp")):
            url = derive.cdn_url(title, w, fmt)
            cases.append({"id": f"{kind}-{w}.{fmt}", "url": url,
                          "manifest": str(mpath)})
        cases.append({"id": f"{kind}-nomanifest",
                      "url": derive.cdn_url(title, 640, "avif")})
        cases.append({"id": f"{kind}-hotlink", "url": img["u"]})
        wires[kind] = (img, title, mpath)
        print(f"  {kind}: {title} ({cc}), credit {pair}, manifest {mpath}")
        print(f"    {derive.cdn_url(title, 640, 'avif')}")

    # URLs the resolver must refuse to credit from the manifest.
    any_manifest = str(next(iter(wires.values()))[2]) if wires else None
    other = derive.cdn_url("File:T051 not in any manifest.jpg", 640, "avif")
    cases += [
        {"id": "cdn-unknown-hash", "url": other, "manifest": any_manifest},
        {"id": "cdn-wrong-host", "url": other.replace(derive.CDN_BASE,
                                                      "https://cdn.example.com"),
         "manifest": any_manifest},
        {"id": "cdn-bad-path", "url": derive.CDN_BASE + "/img/zz/yy/"
         + "0" * 40 + "/640.avif", "manifest": any_manifest},
    ]
    got = run_node(cases, tmp)
    if not got:
        return
    handled = set()
    for kind, (img, title, _mpath) in wires.items():
        for c in cases:
            if not c["id"].startswith(kind + "-") or "manifest" not in c \
                    or c["id"].endswith("nomanifest"):
                continue
            r = got[c["id"]]
            expect_credit(r["creditFor"], img, c["id"])
            expect_credit(r["direct"], img, c["id"] + " (creditFromManifest)")
            want_line = ", ".join(x for x in (img["by"].strip(),
                                              img["lic"].strip()) if x)
            check(r["line"] == want_line,
                  f"{c['id']}: credit line {r['line']!r} != {want_line!r}")
            if r["creditFor"] and r["creditFor"].get("by"):
                handled.add("cdn")
        check(got[f"{kind}-nomanifest"]["creditFor"] is None,
              f"{kind}: a CDN URL with no manifest must answer null, not a "
              f"guess")
        hot = got[f"{kind}-hotlink"]["creditFor"]
        if check(hot is not None and bool(hot.get("page")),
                 f"{kind}: the hotlinked URL {img['u']} yields no page"):
            check(derive.canonical_title(hot["page"]) == title,
                  f"{kind}: hotlink page {hot['page']} names another file")
            handled.add("geograph" if kind == "geograph" else "commons")
        line = got[f"{kind}-640.avif"]["line"]
        print(f"    app credit line from the CDN URL: {line!r}")
    for cid in ("cdn-unknown-hash", "cdn-wrong-host", "cdn-bad-path"):
        check(got[cid]["creditFor"] is None,
              f"{cid}: resolver credited a URL the manifest does not list")
    measure["resolver_url_kinds"] = sorted(handled)
    print(f"  resolver handles: {', '.join(sorted(handled))}")


# ---------------------------------------------------------------------------
# --run / --manifest: a real derive output, or the live manifest
# ---------------------------------------------------------------------------

def head_ok(url):
    """(ok, detail) for one live CDN object: 200, the right Content-Type and
    the immutable Cache-Control derive.py uploads with."""
    import urllib.request
    req = urllib.request.Request(url, method="HEAD", headers={
        "User-Agent": "carta-verify-attribution/1.0 (T051)"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            ctype = r.headers.get("Content-Type", "")
            cache = r.headers.get("Cache-Control", "")
            want = derive.CONTENT_TYPE[url.rsplit(".", 1)[-1]]
            ok = r.status == 200 and ctype == want and "immutable" in cache
            return ok, f"{r.status} {ctype} {cache}"
    except Exception as exc:  # noqa: BLE001, reported as the failure
        return False, str(exc)[:120]


def part_run(mpath, tmp, measure, run_dir=None, head=0):
    """Check a manifest: every credit complete, every CC BY-SA entry
    resolved by the app. With run_dir, every object it names must be in
    that local img/ tree (a derive run with --upload none). With head > 0,
    the first `head` CC BY-SA entries' five CDN URLs are fetched with HEAD
    (the live check, needs the domain serving)."""
    mpath = Path(mpath)
    print(f"manifest: {mpath}")
    if not check(mpath.exists(), f"{mpath} does not exist"):
        return
    man = derive.load_manifest(mpath)
    stamped = stamped_titles(man.get("layer") or LAYER)
    missing_obj = incomplete = 0
    cases, wire = [], {}
    for title, e in man["files"].items():
        if run_dir is not None:
            for key in derive.keys_for(e["h"]):
                if not (Path(run_dir) / key).exists():
                    missing_obj += 1
        pair = man["credits"][e["c"]]
        # `n` on manifests since T269; the cache stamp for older ones.
        if not complete(pair, bool(e.get("n")) or title in stamped):
            incomplete += 1
        if pair[0].upper().startswith("CC BY-SA"):
            url = derive.cdn_url(e["h"], 640, "avif")
            cases.append({"id": title, "url": url, "manifest": str(mpath)})
            wire[title] = {"by": pair[1], "lic": pair[0],
                           "page": "https://commons.wikimedia.org/wiki/"
                           + title if title.startswith("File:") else
                           "https://www.geograph.org.uk/photo/"
                           + title.split(":", 1)[1]}
    if run_dir is not None:
        check(missing_obj == 0, f"run: {missing_obj} objects named by the "
              f"manifest are not in the local img/ tree")
    check(incomplete == 0, f"{incomplete} manifest entries lack a complete "
          f"credit")
    got = run_node(cases, tmp) if cases else {}
    ok = 0
    for c in cases:
        before = len(FAILS)
        expect_credit(got.get(c["id"], {}).get("creditFor"), wire[c["id"]],
                      f"manifest {c['id']}")
        ok += len(FAILS) == before
    measure["manifest_entries"] = man["count"]
    measure["manifest_cc_by_sa_resolved"] = f"{ok}/{len(cases)}"
    where = (f"{man['count'] * len(derive.LADDER)} objects expected, "
             f"{missing_obj} missing, ") if run_dir is not None else ""
    print(f"  {man['count']} entries, {where}{incomplete} incomplete "
          f"credits; {ok} of {len(cases)} CC BY-SA entries resolved in the app")
    if head:
        served = 0
        probed = cases[:head]
        for c in probed:
            h = man["files"][c["id"]]["h"]
            good = True
            for fmt, w in derive.LADDER:
                url = derive.cdn_url(h, w, fmt)
                okk, detail = head_ok(url)
                good &= check(okk, f"live {url}: {detail}")
            served += good
        measure["live_cc_by_sa_served"] = f"{served}/{len(probed)}"
        print(f"  live: {served} of {len(probed)} CC BY-SA entries serve all "
              f"five objects with the right headers")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--title", help="the CC BY-SA beach file to use "
                    "(title or URL); default the first published one")
    ap.add_argument("--run", help="a derive.py run output directory")
    ap.add_argument("--manifest", help="a manifest file alone (the live one: "
                    "rclone cat r2:carta/img/manifest/beaches.json)")
    ap.add_argument("--head", type=int, default=0, metavar="N",
                    help="with --manifest or --run, HEAD the five CDN URLs of "
                    "the first N CC BY-SA entries (the live check)")
    ap.add_argument("--out", help="where to write the one-file manifests "
                    "(default: a temp dir, removed afterwards)")
    ap.add_argument("--json", help="write the measurements here")
    args = ap.parse_args(argv)
    tmp = tempfile.mkdtemp(prefix="t051-")
    args.out = args.out or tmp
    Path(args.out).mkdir(parents=True, exist_ok=True)
    measure = {}
    try:
        part_gate(measure)
        part_file(args, tmp, measure)
        if args.run:
            part_run(Path(args.run) / "img" / derive.MANIFEST_DIR
                     / f"{LAYER}.json", tmp, measure, run_dir=args.run,
                     head=args.head)
        if args.manifest:
            part_run(args.manifest, tmp, measure, head=args.head)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if args.json:
        Path(args.json).write_text(json.dumps(measure, indent=1),
                                   encoding="utf-8")
    print("measurements: " + json.dumps(measure))
    if FAILS:
        print(f"{len(FAILS)} failures")
        return 1
    print("attribution follows the pixels: no manifest entry without its "
          "credit, and the app credits a CDN URL from the manifest alone")
    return 0


if __name__ == "__main__":
    sys.exit(main())
