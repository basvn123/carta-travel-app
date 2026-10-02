"""derive.py's T269 additions, pinned offline.

Tier: Manual

T049 tested the ladder with a scratchpad script that did not survive the
session. This is the committed harness for what stage 9 D5 added on top:
the published-first sources file, the wire layers and their credit rule,
the non-image drop rule, the manifest's `n`, `p` and `s`, the re-upload
address, the garbage collector and its guards, the ledger floor, and the
takedown reaching a re-upload's address.

Nothing touches the network or the repo. A throwaway data root (a cache
and a wire of three beaches and one cycling file) stands in for
CARTA_DATA_ROOT; Commons' imageinfo and the image download are replaced by
local fakes, so a full `derive.py run` goes end to end on this laptop:
resolve, fetch, encode with the real libvips, journal, manifest. The
takedown ledger is redirected to a temp file.

    CARTA_VIPS_BIN=C:/Users/Gebruiker/vips/vips-dev-8.15/bin \\
        python pipeline/photos/verify_derive.py

Exit 0 when every check holds, 1 otherwise. Without pyvips the encode
checks are skipped and say so.

ASCII clean, no em dashes, per project convention.
"""

import contextlib
import io
import json
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import derive  # noqa: E402
import takedown  # noqa: E402
import wire_ladder  # noqa: E402

FAILS = []
CHECKS = [0]


def check(cond, what):
    CHECKS[0] += 1
    if not cond:
        FAILS.append(what)
        print(f"  FAIL  {what}")
    return cond


def quiet(fn, *a, **kw):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = fn(*a, **kw)
    return rc, buf.getvalue()


# ---------------------------------------------------------------------------
# A throwaway data root
# ---------------------------------------------------------------------------

def thumb(name, w=500):
    from urllib.parse import quote
    q = quote(name.replace(" ", "_"))
    return (f"https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/{q}/"
            f"{w}px-{q}")


def make_root(tmp):
    root = tmp / "data"
    cache = root / "cache" / "beaches"
    wire = root / "continent-app" / "public"
    (wire / "beaches").mkdir(parents=True)
    (wire / "cycling").mkdir(parents=True)
    cache.mkdir(parents=True)

    def img(name, lic="CC BY-SA 4.0", by="Jane Doe", **kw):
        d = {"file": name, "url": thumb(name, 1280), "license": lic,
             "author": by}
        d.update(kw)
        return d

    rows = [
        {"images": [img("A lead.jpg"), img("A second.jpg")]},
        {"images": [img("B lead.jpg"), img("B nc.jpg", lic="CC BY-NC 2.0")]},
        {"images": [img("C unpublished.jpg"),
                    img("C flag.svg"), img("C anthem.ogg"),
                    img("C stamped.jpg", lic="CC BY 4.0", by="",
                        no_attribution_required=True)]},
    ]
    (cache / "rich_XX.json").write_text(json.dumps({"beaches": rows}),
                                        encoding="utf-8")

    def wimg(name, lic="CC BY-SA 4.0", by="Jane Doe"):
        return {"u": thumb(name), "big": thumb(name, 1280), "lic": lic,
                "by": by, "page": "https://commons.wikimedia.org/wiki/File:"
                + name.replace(" ", "_")}

    # The wire publishes B first (its file sorts first), then A, and one
    # file no cache holds (an orphan), and the NC file the cache refused.
    (wire / "beaches" / "AA.json").write_text(json.dumps({"beaches": [
        {"images": [wimg("B lead.jpg"), wimg("B nc.jpg", lic="CC BY-NC 2.0")]},
        {"images": [wimg("Orphan beach.jpg")]},
    ]}), encoding="utf-8")
    (wire / "beaches" / "BB.json").write_text(json.dumps({"beaches": [
        {"images": [wimg("A lead.jpg"), wimg("A second.jpg")]},
    ]}), encoding="utf-8")
    # A cycling file: the route's lic is ODbL and must never be read as the
    # photograph's; a region-style photo record does carry its own credit.
    (wire / "cycling" / "XX.json").write_text(json.dumps({"routes": [
        {"id": 1, "name": "Route", "lic": "ODbL 1.0",
         "img": thumb("Route lead.jpg", 1280)},
        {"id": 2, "name": "Route two", "lic": "ODbL 1.0",
         "img": thumb("Route stamped.jpg", 1280)},
        {"id": 3, "name": "Route three", "lic": "ODbL 1.0",
         "img": thumb("Route uncredited.jpg", 1280)},
        {"id": 4, "photos": [{"u": thumb("Route credited.jpg"),
                              "by": "Ann", "lic": "CC BY 2.0"}]},
        {"id": 5, "link": {"url": "https://ec.europa.eu/eurostat"}},
    ]}), encoding="utf-8")
    return root


# Commons as the fakes answer it: content sha1 and extmetadata credit.
COMMONS = {}


def fake_resolve(batch):
    out = {}
    for s in batch:
        info = COMMONS.get(s.title)
        if info is None:
            out[s.title] = ("missing", None)
            continue
        out[s.title] = ("ok", dict(info, url="fake://" + s.title))
    return out


def fake_fetch(src, work, sem):
    from PIL import Image
    sem.acquire()
    path = work / f"{src.sha1}.src"
    shade = int(derive.sha1_of(src.title)[:2], 16)
    Image.new("RGB", (1600, 1000), (shade, 90, 200 - shade // 2)).save(
        path, "JPEG")
    return src, path, None


def manifest_of(out, layer):
    return json.loads((out / "img" / "manifest" / f"{layer}.json")
                      .read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# The parts
# ---------------------------------------------------------------------------

def part_gates():
    print("gates: non-image files and wire credit")
    for name in ("File:Flag.svg", "File:Anthem.ogg", "File:Call.wav",
                 "File:Clip.webm", "File:Clip.ogv", "File:Doc.pdf"):
        check(not derive._is_raster(name), f"{name} would reach the encoder")
    for name in ("File:A.jpg", "File:B.JPEG", "File:C.png", "File:D.tif",
                 "geograph:123"):
        check(derive._is_raster(name), f"{name} refused as not raster")
    route = {"name": "R", "lic": "ODbL 1.0", "img": thumb("R.jpg", 1280)}
    t, cred, _f = derive._wire_record(route)
    check(t == "File:R.jpg" and cred is None,
          "a route's ODbL was read as its photograph's licence")
    region = {"u": thumb("R.jpg"), "by": "X", "lic": "CC BY-SA 4.0"}
    check(derive._wire_record(region)[1] == {"lic": "CC BY-SA 4.0",
                                             "by": "X"},
          "a photo record's own credit was not kept")
    dossier = {"url": thumb("D.jpg"), "author": "Y", "licence": "CC0"}
    check(derive._wire_record(dossier)[1]["lic"] == "CC0",
          "the dossier's licence spelling was not read")
    check(derive._wire_record({"url": "https://ec.europa.eu/eurostat",
                               "licence": "CC BY 4.0"}) is None,
          "a data source link was taken for a photograph")
    dest = {"url": thumb("Town.jpg", 960),
            "page": "https://en.wikipedia.org/wiki/Town"}
    check(derive._wire_record(dest)[0] == "File:Town.jpg",
          "a hero with an article page lost its file title")


def part_sources(tmp, root):
    print("sources: published first, orphans, wire layers")
    derive.DATA_ROOT = root
    srcs, stats = derive.collect("beaches")
    check([s.title for s in srcs][:2] == ["File:A lead.jpg", "File:B lead.jpg"],
          "without a sources file the cache's hero-first order changed")
    check(stats["rejected"].get("not-raster") == 2,
          f"svg and ogg not refused: {stats['rejected']}")
    doc = derive.build_sources("beaches")
    check(doc["titles"][:3] == ["File:B lead.jpg", "File:Orphan beach.jpg",
                                "File:A lead.jpg"],
          f"sources file not hero first by wire order: {doc['titles']}")
    prior = tmp / "prior"
    (prior / "_sources").mkdir(parents=True)
    (prior / "_sources" / "beaches.json").write_text(json.dumps(doc),
                                                     encoding="utf-8")
    found = derive.find_sources("beaches", None, prior)
    check(found and found["count"] == doc["count"],
          "the sources file under --prior was not found")
    srcs, stats = derive.collect("beaches", sources_doc=found)
    titles = [s.title for s in srcs]
    check(titles[:3] == ["File:B lead.jpg", "File:Orphan beach.jpg",
                         "File:A lead.jpg"],
          f"published titles not first: {titles}")
    check("File:Orphan beach.jpg" in titles,
          "the wire orphan was not derived")
    check(titles.index("File:C unpublished.jpg") > titles.index(
        "File:Orphan beach.jpg"), "an unpublished file came before the "
          "published ones")
    check("File:B nc.jpg" not in titles,
          "the wire re-admitted a file the cache refused (NC)")
    check(stats["published_first"] == 4, f"published_first "
          f"{stats['published_first']}, expected 4")
    pub, _ = derive._published_for(type("A", (), {
        "published_only": True, "layer": "beaches"})(), found)
    srcs, _ = derive.collect("beaches", published=pub, sources_doc=found)
    check({s.title for s in srcs} == {"File:A lead.jpg", "File:A second.jpg",
                                      "File:B lead.jpg",
                                      "File:Orphan beach.jpg"},
          "--published-only from the sources file picked the wrong set")
    srcs, stats = derive.collect("cycling")
    by = {s.title: s for s in srcs}
    check(by.get("File:Route lead.jpg") is not None
          and by["File:Route lead.jpg"].pending,
          "a route photo was not left for Commons to credit")
    check(by.get("File:Route credited.jpg") is not None
          and not by["File:Route credited.jpg"].pending,
          "a credited photo record was sent to Commons anyway")
    check(len(srcs) == 4, f"cycling sources {len(srcs)}, expected 4")
    return prior


def part_run(tmp, root, prior, have_vips):
    print("run: placeholder, nothing-owed marker, content sha1, re-upload")
    if not have_vips:
        print("  SKIP  no pyvips: set CARTA_VIPS_BIN")
        return None
    derive.DATA_ROOT = root
    real_resolve, real_fetch = derive.resolve_commons, derive.fetch
    derive.resolve_commons, derive.fetch = fake_resolve, fake_fetch
    try:
        for t in ("A lead.jpg", "A second.jpg", "B lead.jpg",
                  "Orphan beach.jpg", "C unpublished.jpg"):
            COMMONS["File:" + t] = {"sha1": "1" * 40, "lic": "CC BY-SA 4.0",
                                    "by": "Jane Doe", "nao": False}
        COMMONS["File:C stamped.jpg"] = {"sha1": "2" * 40, "lic": "CC BY 4.0",
                                         "by": "", "nao": True}
        out = tmp / "run1"
        rc, log = quiet(derive.main, [
            "run", "beaches", "--out", str(out), "--prior", str(prior),
            "--encoders", "2", "--run-id", "20260101t000000z-a"])
        check(rc == 0, f"run 1 exited {rc}: {log[-300:]}")
        man = manifest_of(out, "beaches")
        files = man["files"]
        check(man["count"] == 6, f"run 1 manifest count {man['count']}")
        check(all(wire_ladder.valid_placeholder(e.get("p"))
                  for e in files.values()), "an entry has no placeholder")
        a = files["File:A lead.jpg"]
        rung = out / "img" / a["h"][:2] / a["h"][2:4] / a["h"] / "320.webp"
        check(a.get("p") == wire_ladder.encode_placeholder(rung),
              "the manifest placeholder differs from the export's")
        check(files["File:C stamped.jpg"].get("n") == 1,
              "the stamped CC BY file lost its nothing-owed marker")
        check("n" not in a, "an owed credit was marked nothing-owed")
        check(a.get("s") == "1" * 40, "the content sha1 is not in the "
              "manifest")
        check(man["ledger"]["rows"] == 0, "the manifest does not record the "
              "ledger it saw")
        # The export joins `p` with no img/ tree at all (T052-c).
        ladder = wire_ladder.Ladder("beaches", man, [])
        rows = [{"images": [{"u": thumb("A lead.jpg"),
                             "page": "https://commons.wikimedia.org/wiki/"
                                     "File:A_lead.jpg"}]}]
        ladder.join(rows)
        check(rows[0]["images"][0].get("ph") == a.get("p"),
              "wire_ladder did not take the manifest's placeholder")

        # run 2 over the same state: nothing to do, manifest unchanged
        prior2 = out / "img" / "manifest"
        rc, log = quiet(derive.main, [
            "run", "beaches", "--out", str(out), "--prior", str(prior2),
            "--sources", str(prior / "_sources" / "beaches.json"),
            "--held", str(out / "img"), "--run-id", "20260101t000200z-c"])
        check(rc == 0 and "6 held, 0 to derive" in log,
              f"a second run re-derived held files: {log[:200]}")
        check("manifest unchanged" in log, "an unchanged layer rewrote its "
              "manifest")

        # run 3: Commons re-uploaded A lead.jpg; --recheck finds it
        COMMONS["File:A lead.jpg"] = dict(COMMONS["File:A lead.jpg"],
                                          sha1="3" * 40)
        rc, log = quiet(derive.main, [
            "run", "beaches", "--out", str(out), "--prior", str(prior2),
            "--sources", str(prior / "_sources" / "beaches.json"),
            "--held", str(out / "img"), "--recheck",
            "--run-id", "20260101t000300z-d"])
        man3 = manifest_of(out, "beaches")
        new = man3["files"]["File:A lead.jpg"]
        check(rc == 0 and "re-uploaded 1" in log, f"re-upload not seen: "
              f"{log[-300:]}")
        check(new["h"] == derive.revision_key("File:A lead.jpg", "3" * 40),
              "the re-upload was not given its revision address")
        check(new["h"] != a["h"], "the re-upload overwrote the old address")
        check(all((out / k).exists() for k in derive.keys_for(new["h"])),
              "the re-upload's five objects were not written")
        check(all((out / k).exists() for k in derive.keys_for(a["h"])),
              "the old address was rewritten in place")
        check(derive.address_ok("File:A lead.jpg", new),
              "a revision address does not count as the title's own")
        # run 4: the revision is held from now on
        rc, log = quiet(derive.main, [
            "run", "beaches", "--out", str(out), "--prior", str(prior2),
            "--sources", str(prior / "_sources" / "beaches.json"),
            "--held", str(out / "img"), "--run-id", "20260101t000400z-e"])
        check("6 held, 0 to derive" in log,
              f"the revision is not held after its run: {log[:200]}")
        return out, a["h"], new["h"]
    finally:
        derive.resolve_commons, derive.fetch = real_resolve, real_fetch


def part_wire_run(tmp, root, have_vips):
    print("run: a wire layer takes its credit from Commons")
    if not have_vips:
        print("  SKIP  no pyvips")
        return
    derive.DATA_ROOT = root
    real_resolve, real_fetch = derive.resolve_commons, derive.fetch
    derive.resolve_commons, derive.fetch = fake_resolve, fake_fetch
    try:
        COMMONS["File:Route lead.jpg"] = {"sha1": "4" * 40,
                                          "lic": "CC BY-SA 3.0",
                                          "by": "Rider", "nao": False}
        COMMONS["File:Route stamped.jpg"] = {"sha1": "5" * 40,
                                             "lic": "CC BY 4.0", "by": "",
                                             "nao": True}
        COMMONS["File:Route uncredited.jpg"] = {"sha1": "6" * 40,
                                                "lic": "CC BY-SA 4.0",
                                                "by": "", "nao": False}
        COMMONS["File:Route credited.jpg"] = {"sha1": "7" * 40,
                                              "lic": "CC BY 2.0",
                                              "by": "Ann", "nao": False}
        out = tmp / "cyc"
        rc, log = quiet(derive.main, ["run", "cycling", "--out", str(out),
                                      "--run-id", "20260101t001000z-w"])
        check(rc == 0, f"cycling run exited {rc}: {log[-300:]}")
        man = manifest_of(out, "cycling")
        files = man["files"]
        check(set(files) == {"File:Route lead.jpg", "File:Route stamped.jpg",
                             "File:Route credited.jpg"},
              f"cycling manifest {sorted(files)}")
        pair = man["credits"][files["File:Route lead.jpg"]["c"]]
        check(pair == ["CC BY-SA 3.0", "Rider"],
              f"the route photo's credit is {pair}, not Commons'")
        check(files["File:Route stamped.jpg"].get("n") == 1,
              "Commons' AttributionRequired=false did not become n")
        check("refused 1" in log, "the uncredited CC BY-SA file was not "
              "refused at resolve")
    finally:
        derive.resolve_commons, derive.fetch = real_resolve, real_fetch


def part_gc(tmp, run):
    print("gc: unnamed objects, folded journals, taken-down titles, guards")
    try:
        derive.plan_gc(set(), tmp / "empty-prior-missing")
        check(False, "gc ran with no copy of img/manifest")
    except derive.GcRefused:
        pass
    empty = tmp / "empty"
    empty.mkdir()
    try:
        derive.plan_gc({"ab/cd/" + "a" * 40 + "/320.avif"}, empty, ledger=[])
        check(False, "gc ran with no manifest: everything would go")
    except derive.GcRefused:
        pass
    if run is None:
        print("  SKIP  the run-based gc checks (no run)")
        return
    out, old_h, new_h = run
    held = derive.load_held(out / "img")
    held = {k for k in held if derive.OBJECT_KEY.match(k)}
    prior = out / "img" / "manifest"
    # Within the grace period nothing a journal names goes.
    plan = derive.plan_gc(held, prior, ledger=[], grace_days=14)
    check(not plan["drop_journals"], "a fresh journal was dropped")
    check(not plan["objects"], "a journal-named object was deleted within "
          "the grace period")
    # Past it, the journals are folded and the old address is unnamed.
    plan = derive.plan_gc(held, prior, ledger=[], grace_days=-1)
    old_keys = {k for k in held if old_h in k}
    check(set(plan["objects"]) == old_keys and len(old_keys) == 5,
          f"gc deletes {len(plan['objects'])} objects, expected the old "
          f"address's 5")
    check(plan["drop_journals"] and all(
        j.startswith("manifest/_journal/") for j in plan["drop_journals"]),
        "folded journals not listed for deletion")
    # A taken-down title goes even while a manifest names it.
    ledger = [{"needle": "File:B lead.jpg"}]
    plan = derive.plan_gc(held, prior, ledger=ledger, grace_days=14)
    b_h = derive.sha1_of("File:B lead.jpg")
    check(plan["taken_down_objects"] == 5 and all(
        b_h in k for k in plan["objects"]),
        "a taken-down title's objects were not swept")
    check(plan["taken_named"], "a manifest naming a taken title was not "
          "reported")
    # The command: dry run by default, the fraction guard.
    o = tmp / "gcout"
    rc, log = quiet(derive.main, ["gc", "--held", str(out / "img"),
                                  "--prior", str(prior), "--out", str(o),
                                  "--grace-days", "-1",
                                  "--max-delete-frac", "0.1"])
    check(rc == 3 and "REFUSED" in log, "the delete-fraction guard did not "
          f"hold (rc {rc})")
    rc, log = quiet(derive.main, ["gc", "--held", str(out / "img"),
                                  "--prior", str(prior), "--out", str(o),
                                  "--grace-days", "-1",
                                  "--max-delete-frac", "0.1", "--force"])
    check(rc == 0 and "dry run" in log and "rclone delete" in log,
          f"gc dry run did not print its commands (rc {rc})")
    listed = (o / "gc-objects.txt").read_text(encoding="utf-8").split()
    check(len(listed) == 5, f"gc-objects.txt holds {len(listed)} keys")
    check(all((out / "img" / k).exists() for k in listed),
          "a dry run deleted something")


def part_ledger_floor(tmp, run):
    print("ledger floor: a lost ledger stops the run")
    if run is None:
        print("  SKIP  no run")
        return
    out = run[0]
    prior = tmp / "prior-floor"
    shutil.copytree(out / "img" / "manifest", prior)
    m = prior / "beaches.json"
    data = json.loads(m.read_text(encoding="utf-8"))
    data["ledger"] = {"rows": 3}
    m.write_text(json.dumps(data), encoding="utf-8")
    rc, log = quiet(derive.main, ["run", "beaches", "--out",
                                  str(tmp / "floor"), "--prior", str(prior),
                                  "--limit", "1"])
    check(rc == 2 and "REFUSED" in log, f"a shrunken ledger did not stop "
          f"the run (rc {rc})")


def part_takedown(tmp, run):
    print("takedown: reaches a re-upload's address")
    if run is None:
        print("  SKIP  no run")
        return
    out, old_h, new_h = run
    work = tmp / "td"
    shutil.copytree(out / "img" / "manifest", work / "img" / "manifest")
    rc_log = io.StringIO()
    with contextlib.redirect_stdout(rc_log):
        row = takedown.reach("File:A lead.jpg", dry_run=True, work_dir=work)
    log = rc_log.getvalue()
    check(new_h in log and old_h in log,
          "the R2 purge did not reach both addresses")
    check(row.get("h") == [old_h, new_h], f"ledger row h {row.get('h')}")
    man = json.loads((work / "img" / "manifest" / "beaches.json")
                     .read_text(encoding="utf-8"))
    check("File:A lead.jpg" not in man["files"],
          "the manifest still names the title")
    check(man["inputs_hash"] == takedown._rehash_manifest(man),
          "the rewritten manifest's hash is not derive's")


def main():
    have_vips = True
    try:
        derive.vips()
    except Exception as exc:  # noqa: BLE001
        print(f"pyvips unavailable ({exc}); encode checks skipped")
        have_vips = False
    saved_root = derive.DATA_ROOT
    saved_ledger = takedown.LEDGER
    tmp = Path(tempfile.mkdtemp(prefix="t269-derive-"))
    try:
        takedown.LEDGER = tmp / "takedowns.json"
        root = make_root(tmp)
        part_gates()
        prior = part_sources(tmp, root)
        run = part_run(tmp, root, prior, have_vips)
        part_wire_run(tmp, root, have_vips)
        part_gc(tmp, run)
        part_ledger_floor(tmp, run)
        part_takedown(tmp, run)
    finally:
        derive.DATA_ROOT = saved_root
        takedown.LEDGER = saved_ledger
        shutil.rmtree(tmp, ignore_errors=True)
    if FAILS:
        print(f"{len(FAILS)} of {CHECKS[0]} checks failed")
        return 1
    print(f"derive holds: {CHECKS[0]} checks")
    return 0


if __name__ == "__main__":
    sys.exit(main())
