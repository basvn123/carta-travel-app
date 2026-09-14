"""A skip flag controls the network, never the data.

Every layer's enrich and harvest can be told to skip a source (--no-images,
--no-context, --seed-only, --no-spine, --skip-articles, ...). The invariant
this harness pins down is that such a run may fetch nothing, but it must
never WRITE a cache that carries less than the cache it started from. That
is the bug that unpublished lakes in Andorra and Albania, was fixed there
and in mountains, and sat unported in beaches at enrich_beaches.py:846
until 2026-08-29. See 02-PHOTO-ENGINE.md, task zero.

For each layer the check copies the smallest country's caches into a temp
directory, repoints the layer's cache root there, stubs the network to
RAISE (so any fetch attempted with every skip flag on is itself a failure),
runs the enrich or harvest with every skip flag on, and asserts that every
previously cached key survives the rewrite.

    python pipeline/verify_skip_flags.py              # every layer
    python pipeline/verify_skip_flags.py --layer lakes

Each layer runs in its own subprocess: lakes and mountains load the beach
client module under a shared name (carta_open_sources) and repoint its
cache root at import time, so two layers in one interpreter would fight
over it.

Trails has no cache-file skip flag to cover: its enrich stages live in
PostGIS behind the review app's approve gate, and its composers regenerate
their output by design (--no-hike and --no-validate change what is
composed, not what is kept). Audited 2026-08-29, nothing to pin.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Smallest countries with both a raw and a rich cache, so a check costs
# milliseconds and the temp copy stays tiny.
BEACH_CC = "LU"
LAKE_CC = "LU"
PEAK_CC = "MC"


class EmptyIndex:
    """Stands in for the bathing / protected / dest NearIndex joins."""

    def nearest(self, lat, lon, max_km, where=None):
        return None, None

    def within(self, lat, lon, max_km, where=None):
        return []


def tripwire(*args, **kwargs):
    raise AssertionError(
        "network touched although every skip flag was on")


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def copy_caches(layer, tmp, names):
    src = ROOT / "cache" / layer
    for name in names:
        if not (src / name).exists():
            raise SystemExit(f"  {layer}: {name} missing from cache/, "
                             f"cannot run the check")
        shutil.copy(src / name, tmp / name)


def assert_rows_survive(label, before, after, key, fields):
    """Every row cached before must still be there, its skipped-source
    fields intact. `fields` lists only what the SKIP FLAGS govern: a field
    a run always refetches (mountain facts, say) has no flag to test."""
    after_by = {row[key]: row for row in after}
    lost, changed = [], []
    for row in before:
        got = after_by.get(row[key])
        if got is None:
            lost.append(row.get("name") or row[key])
            continue
        for field in fields:
            if row.get(field) is not None and got.get(field) != row[field]:
                changed.append(f"{row.get('name') or row[key]}.{field}")
    if lost or changed:
        raise AssertionError(
            f"{label}: skip-flag run dropped data. "
            f"lost rows: {lost or 'none'}; "
            f"lost or altered fields: {changed or 'none'}")
    print(f"  ok: {label}, {len(before)} rows carried intact")


# ---------------------------------------------------------------- the layers

def check_beaches():
    tmp = Path(tempfile.mkdtemp(prefix="skipflags_beaches_"))
    copy_caches("beaches", tmp,
                [f"raw_{BEACH_CC}.json", f"rich_{BEACH_CC}.json"])
    sys.path.insert(0, str(ROOT / "pipeline" / "beaches"))
    import enrich_beaches as enrich  # noqa: E402
    import sources  # noqa: E402
    sources.CACHE = tmp
    sources.request = tripwire
    # Articles have no skip flag; beaches with a wiki link and no cached
    # article are asked for every run. Empty answer, so the check stays
    # offline and the carried articles must come from the cache alone.
    enrich.fetch_articles = lambda *a, **k: {}

    before = load(tmp / f"rich_{BEACH_CC}.json")["beaches"]
    enrich.enrich_country(BEACH_CC, refresh=False,
                          bathing=EmptyIndex(), protected=EmptyIndex(),
                          dests=EmptyIndex(), images=False, context=False)
    after = load(tmp / f"rich_{BEACH_CC}.json")["beaches"]
    assert_rows_survive("beaches enrich --no-images --no-context",
                        before, after, "key",
                        ("images", "article", "context"))
    shutil.rmtree(tmp, ignore_errors=True)


def check_lakes():
    tmp = Path(tempfile.mkdtemp(prefix="skipflags_lakes_"))
    copy_caches("lakes", tmp,
                [f"raw_{LAKE_CC}.json", f"rich_{LAKE_CC}.json"])
    sys.path.insert(0, str(ROOT / "pipeline" / "lakes"))
    import enrich_lakes as enrich  # noqa: E402
    shared = sys.modules["carta_open_sources"]
    shared.CACHE = tmp
    shared.request = tripwire
    enrich.fetch_articles = lambda *a, **k: {}

    before = load(tmp / f"rich_{LAKE_CC}.json")["lakes"]
    enrich.enrich_country(LAKE_CC, refresh=False,
                          bathing=EmptyIndex(), protected=EmptyIndex(),
                          dests=EmptyIndex(), images=False, context=False)
    after = load(tmp / f"rich_{LAKE_CC}.json")["lakes"]
    assert_rows_survive("lakes enrich --no-images --no-context",
                        before, after, "key",
                        ("images", "article", "context"))

    # --seed-only --refresh once rewrote a country down to its seed rows:
    # the shrink guard reads `cached`, and --refresh nulls `cached`.
    import harvest_lakes as harvest  # noqa: E402
    harvest.resolve_seed = lambda cc, rows, lang: (rows, 0, [])
    raw_before = load(tmp / f"raw_{LAKE_CC}.json")["lakes"]
    harvest.harvest_country(LAKE_CC, refresh=True, classes=["stub"],
                            seed_only=True)
    raw_after = load(tmp / f"raw_{LAKE_CC}.json")["lakes"]
    assert_rows_survive("lakes harvest --seed-only --refresh",
                        raw_before, raw_after, "key", ())
    shutil.rmtree(tmp, ignore_errors=True)


def check_mountains():
    tmp = Path(tempfile.mkdtemp(prefix="skipflags_mountains_"))
    copy_caches("mountains", tmp,
                [f"raw_{PEAK_CC}.json", f"rich_{PEAK_CC}.json"])
    sys.path.insert(0, str(ROOT / "pipeline" / "mountains"))
    import enrich_peaks as enrich  # noqa: E402
    shared = sys.modules["carta_open_sources"]
    shared.CACHE = tmp
    shared.request = tripwire
    # Details and facts have no skip flag, every run refetches them; the
    # stubs keep the check offline and out of the assertions.
    enrich.details_for = lambda peaks, cc: None
    enrich.wikipedia_facts = lambda peaks, cc: None

    before = load(tmp / f"rich_{PEAK_CC}.json")["peaks"]
    enrich.enrich_country(PEAK_CC, refresh=True, dests=EmptyIndex(),
                          images=False, context=False)
    after = load(tmp / f"rich_{PEAK_CC}.json")["peaks"]
    assert_rows_survive("mountains enrich --no-images --no-context",
                        before, after, "wd", ("images", "osm"))

    # --no-spine --refresh once rewrote the raw cache from the seed and the
    # high points alone, and every spine row silently left the pool.
    import harvest_peaks as harvest  # noqa: E402
    harvest.highpoint_rows = lambda cc: []
    harvest.query_rows = lambda query, cc, kind: []
    harvest.resolve_seed = lambda cc, rows: (rows, 0, [])
    raw_before = load(tmp / f"raw_{PEAK_CC}.json")["peaks"]
    harvest.harvest_country(PEAK_CC, refresh=True, use_spine=False)
    raw_after = load(tmp / f"raw_{PEAK_CC}.json")["peaks"]
    assert_rows_survive("mountains harvest --no-spine --refresh",
                        raw_before, raw_after, "wd", ())
    shutil.rmtree(tmp, ignore_errors=True)


def check_trips():
    tmp = Path(tempfile.mkdtemp(prefix="skipflags_trips_"))
    sys.path.insert(0, str(ROOT / "pipeline" / "trips"))
    import harvest_routes as hr  # noqa: E402
    src = hr.ROUTES_CACHE
    if not src.exists():
        raise SystemExit("  trips: no routes.json cached, cannot run")
    shutil.copy(src, tmp / "routes.json")
    hr.ROUTES_CACHE = tmp / "routes.json"
    hr.api = tripwire

    before = load(tmp / "routes.json")
    # main() with --skip-articles --skip-gonext --skip-itineraries is
    # exactly load + save; the phases extend `routes` in place, so a
    # skipped phase leaves its keys alone by construction. Pin it anyway.
    routes = hr.load_json(hr.ROUTES_CACHE, {}) or {}
    hr.save(routes)
    after = load(tmp / "routes.json")
    before.pop("generated_at", None)
    after.pop("generated_at", None)
    if before != after:
        raise AssertionError("trips: a skip-everything run changed "
                             "routes.json beyond generated_at")
    print(f"  ok: trips harvest --skip-articles --skip-gonext "
          f"--skip-itineraries, {len(before)} keys carried intact")
    shutil.rmtree(tmp, ignore_errors=True)


CHECKS = {
    "beaches": check_beaches,
    "lakes": check_lakes,
    "mountains": check_mountains,
    "trips": check_trips,
}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--layer", choices=sorted(CHECKS),
                    help="run one layer in this process (the parent run "
                         "spawns one subprocess per layer)")
    args = ap.parse_args()

    if args.layer:
        CHECKS[args.layer]()
        return

    failed = []
    for layer in ("beaches", "lakes", "mountains", "trips"):
        print(f"{layer}:")
        proc = subprocess.run([sys.executable, __file__, "--layer", layer],
                              cwd=str(ROOT))
        if proc.returncode != 0:
            failed.append(layer)
    print("trails:")
    print("  ok: no cache-file skip flag (PostGIS + approve gate); "
          "composers regenerate by design")
    if failed:
        raise SystemExit(f"FAILED: {', '.join(failed)}")
    print("\nevery skip flag leaves the cache intact")


if __name__ == "__main__":
    main()
