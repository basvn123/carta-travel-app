# T029 Audit run_pipeline.py and expand the CI gates

## Task ID

T029

## Date

2026-09-24

## What changed

Two things, one per half of the task.

`docs/PIPELINE.md` now exists and describes what `run_pipeline.py` actually
does: the five cadence tiers and the exact rule that decides "due", how the
state file, the lock file and the five flags interact, the three separate
mechanisms that carry task ordering, every guard and what quiet degradation it
exists to prevent, the two different things that happen when a task fails, the
Windows assumptions, and a row per task for all 65 with its cadence, scripts,
what it writes, its guard, the wall time where one was ever recorded, and
whether it is safe on unattended cron. Nothing in `run_pipeline.py` was
touched. T048 is the intended reader of the last column.

`npm run ci` went from four gates to seven, and from green-by-accident to
actually green. It was failing before this task started, on a pre-existing
problem unrelated to it (see "What broke"). The three new gates are a URL
round trip, a negative schema contract check, and a browser smoke test over
every route the app has. The contract check is the one that matters: it seeds
six known contract breaks into a fixture and fails if the validator accepts any
of them, so the gate cannot quietly become vacuous.

The audit found a stale schema version in the documentation. `docs/SCHEMA.md`'s
header says the live master is `meta.schema_version` 15. The shipped
`public/app_data.json` carries 17, and SCHEMA.md's own later sections run up to
"Schema v17", so the header is stale prose. The contract gate pins 17, because
it pins what ships rather than what is written down, and says so in a comment.

## Files touched

**Created (repo root):**
- `docs/PIPELINE.md`, the audit. Linked from nowhere else, per the task.
- `Execution/P1/T029-pipeline-audit-and-ci.md`, this report.

**Created (app):**
- `continent-app/scripts/ci/contract.mjs`, the contract written as code.
- `continent-app/scripts/ci/check-contract.mjs`, the negative gate.
- `continent-app/scripts/ci/check-routes.mjs`, the URL round trip.
- `continent-app/scripts/ci/smoke.mjs`, the browser smoke test.
- `continent-app/scripts/ci/make-fixture.mjs`, regenerates the fixture.
- `continent-app/scripts/ci/fixtures/contract-min.json`, the fixture.

**Modified:**
- `continent-app/package.json`, three new scripts plus a rewritten `ci`, and
  the `test` glob narrowed (see "What broke").

**Not touched:** `run_pipeline.py`, `pipeline/`, `docs/SCHEMA.md`, `public/`,
`src/`.

A caveat on the root commit. In the root repository `continent-app/package.json`
already showed as modified before this task began, because T024 added a
`"check:pages"` script that was committed inside `continent-app/`'s own git
tree but never at the root. Committing `package.json` at the root necessarily
carries that hunk along. It is called out in the root commit message. No other
pre-existing uncommitted change was staged.

## The audit, in brief

The detail is in `docs/PIPELINE.md`. Four things are worth repeating here
because they change how somebody should treat the orchestrator.

The cadence tiers are not all intervals. `weekly`, `monthly` and `quarterly`
are 7, 30 and 90 days since `last_success`, and a task that has never run is
always due. `after` has no interval at all: it is due when a task it names has
succeeded more recently than it has, which is what chains the twenty trails and
cycling tasks together. `backfill` never becomes due under any circumstances;
`--only` is the only way one runs. Eleven tasks carry it. T028's report listed
ten of them and missed `poi_enrich`.

Ordering is carried three separate ways and only one of them is checked. The
`after` field is explicit and enforced. `chain_followups` appends newly-due
chain links to the plan mid-run so a chain finishes in one run. But the fare
chain, where `tp_stage` has to precede `fares` which has to precede the three
other carriers because each merges cheapest-wins onto the last one's table,
rests on nothing but the order of entries in the `TASKS` list. Reordering that
list would break the merge silently.

Failure is two-valued and the distinction is load-bearing. A hard failure
breaks out of the loop and abandons every later task in the plan, specifically
so a half-refreshed catalogue never ships. A soft failure logs and continues.
Forty-four of the 65 tasks are soft. Only ten tasks can actually stop a
scheduled run, because the other eleven hard ones are backfill and therefore
unreachable without `--only`. A task that raises rather than returning false is
in neither category: it escapes all of the accounting, including the heartbeat
`/fail` ping whose entire purpose is noticing runs that went wrong.

For the cron port, the list of things that genuinely have to change is short.
`run_pipeline.bat` does not port and is the scheduled entry point. Drive
letters appear only as node fallback paths. Nothing opens a browser or waits on
input. The real hazards are `other_python_running()`, whose Linux branch
`pgrep -f python` matches any process with "python" in its command line and
will abort every writer run on a shared box, and the twenty tasks that need the
local Docker lab on 5433, which skip cleanly but then let the trails and
cycling wires go stale with no signal.

## Why the negative checks are shaped this way

There is no runtime validator in the app to import. `src/lib/appData.js`
fetches `/app_data.json` and hands the parsed object to `useAppData`, which
reads every meta block with optional chaining and falls back on all of them.
Nothing throws. A payload missing half its keys renders an app with no prices
and no error, which is a failure that reaches a user rather than a build log.
So `contract.mjs` writes the checks from `docs/SCHEMA.md`'s required fields and
from what the app actually dereferences, and says so in its own header. When
somebody writes a real hydration-time validator, that file should import it and
keep only what the validator does not cover.

The required set is deliberately narrow. A field is required only where the app
is visibly broken without it, never merely thinner. Climate, crowding, guide,
beauty and the dossier joins are all layers the app degrades through on
purpose, and asserting on them would make the gate fail for reasons that are
not contract breaks, which is how a gate gets disabled.

The six breaks are the ones a real change causes: a pipeline that bumps the
schema without telling the app, a sync step that drops a meta block, a
hand-edited destination that loses its id, a CSV round trip that turns
coordinates into strings, a filter that empties the catalogue, and the Windows
reserved-filename escape coming undone so `PRN.json` ships as a name git will
not index.

Two places pair an "all X satisfy P" walk with a minimum count, because that
kind of gate passes vacuously on an empty collection. `validateAppData` rejects
a destinations map with fewer than two entries, so `empty-destinations` is a
break rather than a silent pass. And `check-contract.mjs` fails if fewer than
six breaks are defined, so a future edit that empties the break list turns the
gate red instead of green.

## Commands run

Audit, all read-only:

```bash
sed -n '1,220p' run_pipeline.py     # and onward, the whole 2,672 lines
python -c "..."                      # parse the TASKS block, 65 keys
cat logs/pipeline_state.json         # 11 of 65 keys have ever succeeded
cat run_pipeline.bat
grep -oE 'os\.environ(\.get)?\(?"[A-Z_]+"' run_pipeline.py | sort -u
```

Building the gates:

```bash
cd continent-app
mkdir -p scripts/ci/fixtures
node scripts/ci/make-fixture.mjs      # -> fixtures/contract-min.json (BRU, gem:bruges)
node scripts/ci/check-contract.mjs    # 6/6 breaks rejected, exit 0
node scripts/ci/check-routes.mjs      # exit 0
node scripts/ci/smoke.mjs             # exit 0
npx eslint scripts/ci --no-ignore     # exit 0
```

The two runs the done condition asks for:

```bash
npm run ci
# exit 0, 221s

CARTA_CI_SEED_BREAK=schema-version-bumped npm run ci
# exit 1, 15s, stops at the contract gate before the build
```

Each of the other five breaks was run the same way; all six exit 1. `git status
--short public/` is empty afterwards, confirming the contract check never wrote
to `public/`.

## Config and secrets set

One environment variable, read only by the new contract gate:

`CARTA_CI_SEED_BREAK=<break name>`, unset by default. When set to one of
`schema-version-bumped`, `meta-key-removed`, `destination-missing-id`,
`coordinates-as-strings`, `empty-destinations` or `fare-file-unescaped`, the
contract check applies that break to the real payload in memory before
validating it, so `npm run ci` can be demonstrated failing on a contract break
without editing a data file. An unrecognised value exits 2 and lists the valid
names. Nothing is written to `public/` in any mode.

No secrets, no credentials, no new dependency. Every new script is plain ESM
node. The smoke test uses `playwright`, which was already a dev dependency.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| ci gates | 4 (lint, test, verify, build) | 7 (lint, test, verify, ci:routes, ci:contract, build, ci:smoke) | +3 |
| `npm run ci` exit code, clean | 1 (pre-existing failure) | 0 | fixed |
| `npm run ci` wall time, clean | 29s (aborted at the test step) | 221s | +192s |
| `npm run ci` wall time, full green path | not reachable | 221s | n/a |
| `npm run ci` wall time, seeded break | n/a | 15s | fails before the 136s build |
| unit tests passing | 75 of 76 | 75 of 75 | the 76th moved to `test:browser` |
| seeded contract breaks defined | 0 | 6 | +6 |
| seeded contract breaks rejected | n/a | 6 of 6 | must equal the number seeded |
| routes asserted by a smoke test | 0 | 9 | +9 |
| run_pipeline.py tasks documented | 0 | 65 | +65 |
| tasks marked unsafe for unattended cron | not recorded | 32 | n/a |

The build alone is 136s of the 221s. Lint is 8s, the unit tests 2s, verify 2s,
the two node gates under a second each, and the smoke test about 70s for nine
routes at a five second settle each.

The 32 cron-unsafe tasks are the 11 backfill tasks, which never come due and
several of which are null-risk patch writers, plus the 21 that need the local
Docker lab on 5433 or BRouter on 17777.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `npm run ci` was already red before this task, at the test step | `"test"` globbed `tests/*.mjs`, which includes `explore.spec.mjs`, a Playwright harness that needs a server on 4173. With no server it fails with `ERR_CONNECTION_REFUSED`. Confirmed pre-existing by reading `package.json` on the parent branch `p1-orphaned-components`. | Narrowed `test` to `tests/*.test.mjs` (the five unit tests, 75 assertions, all passing) and added `test:browser` for `tests/*.spec.mjs`. The naming already made the split; the glob did not honour it. The browser spec is not lost, it has its own script, and the new `ci:smoke` gate covers the same ground inside `ci` with a server it starts itself. |
| The smoke test failed on the shared-trail route with a bare 404 | Two separate things. First my route used trail id 63478, taken from a code comment, which is not in the shipped `AT.json`. Second, and the real one: the app asks Supabase for `content_overrides`, a table that is not deployed, and 404s. The app shrugs it off by design (the overrides are optional patches) but Chromium logs a console error whose message text carries no URL, so the noise filter could not see it was cross-origin. | Used a real trail id (20050), and made the console listener read `m.location().url` for "Failed to load resource" messages and ignore anything not served from the preview origin. Same-origin JSON is still checked strictly and separately via the response listener, which is where a real regression would show. |
| The route gate failed twice on the favourites round trip | Both times my test data, not the code, which is the gate doing its job. Shortlist keys are `kind:id`, and the country-carrying kinds are `kind:cc/id` with a slash. I first wrote `cc:BRU` (not a kind) and then `trail:AT:63478` (colon instead of slash). `readFavToken` correctly fell back to treating both as legacy bare destination ids. | Used the canonical forms, and included all three shapes in the fixture on purpose: `dest:BRU`, `dest:gem:bruges` (an id that itself carries a colon) and `trail:AT/63478`. |
| The fixture pinned the wrong schema version | I wrote `EXPECTED_SCHEMA_VERSION = 15` from `docs/SCHEMA.md`'s header. Generating the fixture from the real payload showed 17. | Pinned 17 and documented why in the file: the gate pins what ships, not what is written down. The stale header in SCHEMA.md is left for a separate task, since this task may not edit it. |

## What is still open

**`docs/SCHEMA.md`'s header is wrong.** Line 3 says the live master is
`meta.schema_version` 15. It is 17. The document's own later sections
("Schema v15", "v16", "v17") confirm 17 is current, so it is only the summary
line that rotted. This task may not edit `docs/SCHEMA.md`, so it is recorded
here. Whoever fixes it should also update `EXPECTED_SCHEMA_VERSION` in
`continent-app/scripts/ci/contract.mjs` in the same change if the version moves
again; the two are now deliberately coupled.

**Four bugs in `run_pipeline.py`, with line numbers.** This was an audit, so
none were fixed.

Line 2301, `poi_enrich` duplicates `poi_images` and `must_descs` exactly: its
three commands are the union of those two tasks' commands. All three are
backfill so nothing runs twice on a schedule, but `--only poi_enrich` and
`--only poi_images,must_descs` are the same work under two names. Note the
duplication is not quite harmless: `poi_images` sets `retries: 12` (line 2290)
and `poi_enrich` sets none, so the same two commands retry twelve times under
one key and not at all under the other.

Line 2615, `chain_followups` appends to the plan list while the runner is
iterating over it at line 2571. It works and the comment says it is
deliberate, but it means the plan printed at the start of a run is not the
plan that executes.

Line 2587 and the loop around it, a task that raises rather than returning
false escapes the whole failure accounting: no state write at 2611, no ship
decision, no freshness report, and no heartbeat `/fail` at 2667. Only the
`finally` that releases the lock runs. The heartbeat exists to notice runs
that went wrong, and this is the one failure mode it cannot report.

Also worth a task: `guard_beaches` and `guard_lakes` both require
`cache/eea_bathing_water.json`, which the `bathing_water` task produces, but
`bathing_water` sits later in the `TASKS` list than both. On a fresh machine
the first run skips both layers and the second run, 90 days later, is the first
that can build them.

**The smoke test settles on a fixed timeout.** Each route waits five seconds
after `domcontentloaded` before reading the DOM, which is how the existing
`verify_*.mjs` harnesses do it and why it is done that way here. It is the
whole reason the gate takes 70 seconds. A slower machine could in principle
read a route before it has rendered, which would be a false failure. Replacing
the wait with a per-route `waitForSelector` would be faster and steadier, but
it would mean each route declaring a settled signal, which several of them do
not obviously have.

**Wall times are recorded for only 11 of the 65 tasks.** The other 54 have
never completed on this machine, so `docs/PIPELINE.md` says "not recorded"
rather than guessing. T048 will need real timings for anything it puts on a
schedule, and the only way to get them is to run the tasks.

**The contract gate does not check the split wires.** It validates
`public/app_data.json` and the fare slice filenames. The per-destination POI
shards, the layer wires (trails, beaches, lakes, mountains, regions, cycling,
trips, dossier) and `country_insights.json` all have contracts of their own
that nothing asserts. The smoke test catches a same-origin JSON 404 on the nine
routes it loads, which is a weaker check covering some of the same ground.

## Rollback procedure

The two halves are independent and can be reverted separately.

To drop the CI gates and restore the previous `ci` script, in the app
repository:

```bash
cd continent-app
git checkout p1-orphaned-components -- package.json
rm -rf scripts/ci
```

Note this also restores the pre-existing red `test` glob, so `npm run ci` will
go back to failing on `explore.spec.mjs`. If the intent is only to remove the
three new gates while keeping CI green, edit `package.json` by hand instead:
remove `ci:routes`, `ci:contract` and `ci:smoke` from the `ci` chain and keep
the narrowed `test` glob.

To drop the audit:

```bash
rm docs/PIPELINE.md
```

To undo everything in one step, in each repository:

```bash
git log --oneline -3                 # find the commit before "T029: ..."
git reset --hard <that commit>
```

Rollback is completely safe. This task wrote no data, ran no pipeline task,
never touched `public/`, and changed nothing `run_pipeline.py` reads or the app
ships. The worst case of reverting it is that the orchestrator is undocumented
again and `npm run ci` is red again, which is the state T029 started from.
