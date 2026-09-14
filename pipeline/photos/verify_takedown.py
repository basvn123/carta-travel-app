"""The takedown path, exercised end to end, against a copy of the wire.

A takedown is the one operation that has to work the first time it is
ever run for real, under time pressure, on somebody's angry email. So it
gets a test rather than a docstring promise, and the test runs against a
COPY of the published wire: proving the scrub works must not itself
unpublish anything.

What this asserts, in the order it matters:

  the scrub finds the image        across every wire directory, at every
                                   nesting depth, in both the rated array
                                   and the listed one
  the row survives it              a takedown removes one photograph, not
                                   the place it was of
  nothing else is touched          every other image on every other row is
                                   byte identical afterwards
  the ledger blocks re-entry       is_taken_down, which every layer's
                                   candidate pass consults, answers True
                                   for the file afterwards, so the next
                                   enrich cannot quietly put it back
  it is fast                       the whole scrub is timed and reported,
                                   because "under five minutes" is part of
                                   the promise

    python pipeline/photos/verify_takedown.py

ASCII clean, no em dashes, per project convention.
"""

import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import takedown  # noqa: E402

# Enough of the wire to be a real test: two layers, several countries.
SAMPLE = [("beaches", ("ES", "GR", "HR", "IT")),
          ("mountains", ("AT", "CH", "IT", "NO"))]


def _images(node, out):
    """Every image record anywhere in a wire file."""
    if isinstance(node, list):
        for item in node:
            _images(item, out)
    elif isinstance(node, dict):
        if any(k in node for k in takedown.IMAGE_KEYS):
            out.append(node)
        for value in node.values():
            _images(value, out)
    return out


def _rows_with_names(data):
    """{name: n_images} for every named row in a wire file."""
    out = {}
    for value in data.values():
        if not isinstance(value, list):
            continue
        for row in value:
            if isinstance(row, dict) and row.get("name"):
                out[row["name"]] = len(row.get("images") or [])
    return out


def main():
    tmp = Path(tempfile.mkdtemp(prefix="takedown_"))
    public = tmp / "public"
    copied = 0
    for layer, countries in SAMPLE:
        src = ROOT / "continent-app" / "public" / layer
        if not src.exists():
            continue
        (public / layer).mkdir(parents=True, exist_ok=True)
        for cc in countries:
            path = src / f"{cc}.json"
            if path.exists():
                shutil.copy(path, public / layer / f"{cc}.json")
                copied += 1
    if not copied:
        raise SystemExit("no wire files to test against")

    # Point the module at the copy. Both globals are read at call time.
    takedown.PUBLIC = public
    takedown.LEDGER = tmp / "takedowns.json"
    takedown._ledger_cache.update({"mtime": None, "rows": []})

    # A real published photograph, chosen from the copy so the test never
    # depends on one particular file still being live next month. The MOST
    # REPEATED one, because a takedown that only ever has to remove a
    # single record is the easy case: a Commons file used by a row, its
    # neighbour and a region page is the case that has to work.
    counts = {}
    for path in sorted(public.rglob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for img in _images(data, []):
            url = img.get("big") or img.get("u") or ""
            if "upload.wikimedia.org" in url and "/thumb/" in url:
                name = url.split("/thumb/")[1].split("/")[2]
                counts[name] = counts.get(name, 0) + 1
    if not counts:
        raise SystemExit("no Commons image found in the sampled wire")
    target = max(counts, key=lambda n: (counts[n], n))
    print(f"target: {target} ({counts[target]} records)")

    before = {}
    for path in sorted(public.rglob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        before[path] = (_rows_with_names(data),
                        [json.dumps(i, sort_keys=True)
                         for i in _images(data, [])])
    n_before = sum(len(imgs) for _, imgs in before.values())
    hits_expected = sum(1 for _, imgs in before.values()
                        for i in imgs if target.lower() in i.lower())
    print(f"  {n_before} images across {len(before)} files, "
          f"{hits_expected} carry the target")
    if not hits_expected:
        raise SystemExit("the chosen target is in no file, test is void")

    t0 = time.time()
    ledger = takedown.load_ledger()
    ledger.append({"needle": target, "reason": "verify_takedown",
                   "at": "2026-08-30T00:00:00Z"})
    takedown.save_ledger(ledger)
    touched = takedown.scrub()
    took = time.time() - t0

    failures = []
    n_after = 0
    for path, (rows_before, imgs_before) in before.items():
        data = json.loads(path.read_text(encoding="utf-8"))
        imgs_after = [json.dumps(i, sort_keys=True)
                      for i in _images(data, [])]
        n_after += len(imgs_after)
        rows_after = _rows_with_names(data)
        # The image is gone.
        still = [i for i in imgs_after if target.lower() in i.lower()]
        if still:
            failures.append(f"{path.name}: {len(still)} records survived")
        # The rows are not.
        for name in rows_before:
            if name not in rows_after:
                failures.append(f"{path.name}: row {name} disappeared")
        # Nothing else moved.
        kept_before = [i for i in imgs_before
                       if target.lower() not in i.lower()]
        if kept_before != imgs_after:
            failures.append(f"{path.name}: an unrelated image changed")

    removed = n_before - n_after
    if removed != hits_expected:
        failures.append(f"removed {removed} records, expected "
                        f"{hits_expected}")
    if not takedown.is_taken_down(f"File:{target}"):
        failures.append("the ledger does not block the file's re-entry")
    if takedown.is_taken_down("File:Something else entirely.jpg"):
        failures.append("the ledger blocks an unrelated file")

    print(f"  scrub touched {len(touched)} files in {took:.1f} s, "
          f"removed {removed} image records")
    shutil.rmtree(tmp, ignore_errors=True)
    if failures:
        for line in failures:
            print(f"  FAIL  {line}")
        raise SystemExit(f"{len(failures)} takedown failures")
    print("takedown path holds: the photograph goes, the place stays, "
          "the ledger keeps it out")


if __name__ == "__main__":
    main()
