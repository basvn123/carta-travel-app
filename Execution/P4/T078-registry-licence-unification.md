# T078: Registry and licence unification

## Task ID

T078

## Date

2026-10-01

## What changed

`docs/tos/data_licenses.md` is no longer written by hand. It is rendered from
`src/ingestion/core/registry.py`, which now carries two tables that used to
live in different places and drift apart: what runs (cadence, the
`run_pipeline.py` task, the failure mode) and what each source is licensed
for (licence, attribution, share-alike, where the credit renders). A CI
workflow fails the build when a collector or a `pipeline/harvest_*.py`
script exists without its row, when the committed ledger is stale, or when a
cadence in the registry disagrees with `run_pipeline.py`.

The hand-written ledger had 147 rows and about 230 lines of prose across
twenty sections. All of it moved over verbatim: the rows became `Source`
literals, the chapter prose became `Section.intro` and `Section.outro`
strings, and the share-alike review became `WireReview` rows. Nothing was
retyped; a one-off parser in the session scratchpad split the markdown
tables on pipes outside backticks and emitted the Python, and the rendered
output was diffed against the original before the first commit. The only
differences in that diff were the ones this task intended: a generated-file
banner and note at the top, a new section 0 with the execution roster, three
new rows, and one repaired row.

The three new rows are harvesters that existed in the tree with no ledger
row at all, which is exactly the gap the task was commissioned to close:
`harvest_image_licenses.py` (Commons imageinfo metadata, the TASL chain for
POI thumbnails), `harvest_place_signals.py` (Wikidata place registers plus
Wikipedia pageviews for the coverage report) and
`harvest_ryanair_schedules.py` (the Ryanair timetable endpoint). The repaired
row is the NASA POWER `pipeline/mountains/season.py` entry in the
resolutions section, which had five cells instead of six; its share-alike
cell was missing and the "where attributed" text sat in the wrong column. It
now reads correctly.

How the enforcement works, since that is what the next maintainer has to
trust. `@register` in `registry.py` looks up `cls.name` in `RUNS` and in
`SOURCES` before it adds the class to `REGISTRY`; a miss raises
`MissingLicenceRow` at import time, so an orphan collector breaks
`run_all --list`, the pipeline's weekly ingestion step and the test suite
before it can ship anything. Harvesters cannot be caught at import because
they are standalone scripts, so `validate()` globs `pipeline/harvest_*.py`
on disk and demands a `RUNS` entry and a `SOURCES` row for each path. The
same function checks the reverse direction (an entry naming a collector or
script that does not exist), refuses duplicate row keys and empty cells,
and reads `run_pipeline.py`'s task table by regex to confirm every `RUNS`
cadence and soft flag against the driver that owns them. `run_pipeline.py`
is read as text, never imported, because importing it runs its environment
setup.

Why the cadence is copied into the registry at all, when `run_pipeline.py`
already has it: the task asked for one place that answers both "how does
this run" and "what may we do with it", and a reader of the ledger should
not have to open a 3,000-line driver to find out that a source is Manual
tier. The copy is safe only because the check makes a disagreement a build
failure rather than a stale number.

The rendered document gains section 0, the execution roster, with one table
for the 29 collectors and one for the 28 harvesters: cadence, task, failure
mode, a note, and the keys of the ledger rows that govern each. Collector
descriptions in that table come from the live classes, so a description edit
in a collector module also makes the ledger stale until `--write` is run.
Rows whose scripts are gone from the tree (the retired features wire,
WorldClim, `describe.py`) carry `retired=True`, or sit in a section marked
retired, and are exempt from the path-existence check; they stay in the
document because the ledger is also the record of what was shipped.

## Files touched

**Modified:**
- src/ingestion/core/registry.py (the data tables, `Run`, `Section`, `Source`, `WireReview`, the enforcing `register`, `validate`, `pipeline_tasks`, `harvester_scripts`)
- docs/tos/data_licenses.md (now generated; 614 lines to 707)

**Created:**
- src/ingestion/core/ledger.py (render, check, CLI)
- tests/test_data_licences.py (eight tests, three of them negative)
- .github/workflows/data-licences.yml (new workflow; no existing workflow edited)
- Execution/P4/T078-registry-licence-unification.md

**Deleted:**
- none

## Commands run

```
cd C:\Users\Gebruiker\Documents\Portfolio\wt\T078
python -m src.ingestion.core.ledger            # render to stdout, diffed against the old file
python -m src.ingestion.core.ledger --write    # regenerate docs/tos/data_licenses.md
python -m src.ingestion.core.ledger --check    # what CI runs; exit 0
python -m pytest tests/test_data_licences.py -q
python -m src.ingestion.run_all --list         # still works, 29 collectors
```

The negative case was also proven end to end, not only in the unit tests: an
empty `pipeline/harvest_zz_t078_probe.py` made `--check` exit 1 with two
errors naming the file and the entries it lacked, and passed again once the
file was removed.

## Config and secrets set

None. The workflow installs only what importing the collector modules needs
(`requests`, `beautifulsoup4`, `lxml`, `python-dotenv`, `pytest`), not
`requirements.txt`, which would pull geopandas and rasterio for nothing.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `pipeline/harvest_*.py` scripts with no ledger row | 3 of 28 | 0 of 28 | -3 |
| Collectors with no ledger row | 0 of 29 | 0 of 29, now refused at import | 0 |
| Ledger rows | 147 | 150 | +3 |
| Ledger rows with a wrong cell count | 1 | 0 | -1 |
| Places a source's cadence is written | 2 (`run_pipeline.py`, hand prose) | 1 checked copy in the registry | -1 |
| CI gates on the ledger | 0 | 1 workflow, 8 tests | +1 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First parse of the ledger produced a nine-cell row | The lakes OSM row carries `water=lake\|reservoir\|lagoon\|pond` inside backticks and the splitter cut on every pipe | The converter and the renderer treat pipes inside backticks as text; the renderer writes cells verbatim |
| The NASA POWER `season.py` row had five cells | A missing share-alike cell in the hand-written source, present since 2026-08-26 | Cell added ("No"); the attributed text moved back to its column |
| Six row script paths do not exist in the tree | Rows for retired code (features wire, WorldClim, describe.py) | `retired` flag on the row or section; the existence check skips them |
| Rendered `©` printed as `?` when piped to a file on Windows | Console code page on stdout redirect | Not a bug in the output: `--write` writes UTF-8 directly; the nine `©` characters are intact in the committed file |

## What is still open

The ingestion README (`src/ingestion/README.md`) still carries a hand-typed
roster table with 24 rows against 29 registered collectors, and its
"adding a source" sentence predates the registry rule. It was outside this
task's scope. It should either be rendered from the registry the same way
the ledger is, or shrink to a pointer at the ledger's section 0. Register
row T078-a.

`continent-app/src/data/attribution.js`, the Data sources screen's input,
is still derived from the ledger by hand (the ledger's "ready to paste"
section is the handover mechanism). The registry now knows which rows
require a user-facing credit, so the app file could be generated or checked
from it; that is an app-repo change and a separate task. Register row T078-b.

`run_all --list` prints name, group and description but not the cadence or
licence that the registry now attaches to every class as `cls.run` and
`cls.sources`. `run_all.py` was not named by the task. Register row T078-c.

The retired `describe.py` row in the trails section still describes a
Claude API provider that T264 removed from the live scripts. It is marked
retired and nothing runs it, but a reader skimming the ledger could take it
as current. Whether retired rows stay in place or move to a closing
"retired" chapter is a documentation decision for a later pass. Register row
T078-d.

## Rollback procedure

Everything is one commit on `p4-registry-licence` plus the report commit.
`git revert` of the code commit restores the hand-written ledger byte for
byte (it was never retyped), the old 50-line `registry.py`, and removes the
workflow, the test and `ledger.py`. No data, schema, migration, secret or
app file is involved, and nothing was pushed.
