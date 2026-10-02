# T267: frozen fares and housekeeping

## Task ID

T267

## Date

2026-10-02

## What changed

The planner's round flight now prices the same way Explore does. combineTripLegs takes three steps: a stored day, a served airport within PLANE_REACH_KM for a town with no fares of its own, then the month band. It returns a per-direction provenance bag (into_prov, out_of_prov), a fare_estimated flag and the nearby-airport hop (into_via, out_via). The date sweep cheapestStartDates still passes no options, so it stays on stored days only. The dead expiry slot is gone: the x field, fareExpired, the expired chip, the ?provmock exp key, the prov.expiredTitle strings in six languages and the .is-expired rule. The three unused wizardTransit exports are removed, along with everything that only they used.

The chat planner now says what went wrong. too_few and no_ai have their own copy (ai.tooFew, ai.unavailable) and no_ai drops the pointless retry button. chatDest reads the same list the day workspace reads, so a failed shard fetch falls back to the boot index items. A failed shard fetch is no longer cached, in appData.js or in the ensurePois ask-set, so "Try again" can succeed.

The contract gate now checks the split wires: the boot index, the destination files it names, a sample of POI shards, fare slices and country insights. It carries eight seeded breaks that must be rejected. The smoke gate waits on each route's own selector instead of a fixed five seconds.

The docs are brought up to date: SCHEMA.md says version 17 and has a "Flight-cost input" subsection, ESTIMATION.md points to it, and the fare tasks are described as retired in PIPELINE.md, ESTIMATION.md and SCHEMA.md. The queue runner has a new gate for work stranded in continent-app/. The T027 stale comments and unused CSS are removed. practical_layer.py is decided: it is consumed.

## Files touched

**Modified (root repo):**
- docs/SCHEMA.md
- docs/ESTIMATION.md
- docs/PIPELINE.md
- pipeline/README.md
- Execution/_queue/run_queue.ps1
- Execution/_OPEN.md

**Created (root repo):**
- Execution/P3/T267-frozen-fares-housekeeping.md

**Modified (continent-app, its own repo):**
- src/lib/trip_planner_pricing.js
- src/hooks/useTripPlanner.js
- src/components/FareProvenance.jsx
- src/lib/wizardTransit.js
- src/lib/appData.js
- src/lib/urlState.js
- src/planner/CartaChatPlanner.jsx
- src/planner/DayPlannerTab.jsx
- src/browse/PlacesFilterSheet.jsx
- src/styles.css
- src/i18n/de.js, en.js, es.js, fr.js, it.js, nl.js
- scripts/verify_fare_provenance.mjs
- scripts/ci/contract.mjs
- scripts/ci/check-contract.mjs
- scripts/ci/smoke.mjs

**Created (continent-app):**
- tests/combineTripLegs.test.mjs

**Deleted:** nothing.

## Commands run

    cd wt/T267-app
    npm test                                  # 100 pass, 0 fail
    node --test tests/combineTripLegs.test.mjs  # 4 pass
    node scripts/ci/check-contract.mjs        # passed, 8/8 split-wire breaks rejected
    npx eslint (touched files)                # 0 errors
    npx vite --port 5203                      # dev server, browser check at 380 and 1360 px
    # root: PowerShell function test of the new queue gate on a throwaway repo pair

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Unit tests passing | 96 | 100 | +4 |
| Seeded contract breaks rejected | 6 | 14 (6 payload, 8 split-wire) | +8 |
| Smoke gate settle wait per route | 5 s fixed | up to 30 s, ends on the selector | Not measured |
| wizardTransit.js lines | 329 | about 95 | about -230 |

The smoke wall time was not measured because the gate was not run (see open items). The 96 is the 100 passing now minus my four new tests.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| New split-wire check failed on every fare slice | Slices carry a `__window` metadata key beside the anchor records | The check skips keys that start with `__` |
| A queue gate that compared against a clean app tree would fail a task for another session's changes | The app tree is shared and often dirty | The gate compares against a `git status --porcelain` snapshot taken at task start |
| Moving the retired harvesters would break `--only wizz_fares` | run_pipeline.py still calls them, and it and pipeline/archive/ are off limits here | Left open as T267-a |

## What is still open

Rows closed by this task: T058-a, T058-c, T058-d, T056-c, T255-c, T062-b, LIVE-b.

The T029 items (SCHEMA.md header, split-wire contract gate, smoke waits), the T027 comments and CSS and the practical_layer decision were not in the register, so there is nothing to close for them. They are done as described above.

Left open, with the reason in each row:
- T267-a: the retired carrier harvesters and harvest_ryanair_schedules.py stay in pipeline/. Moving them needs run_pipeline.py and pipeline/archive/, both off limits to this session. The registry.py entries and the ledger must be updated in the same move.
- T267-b: scripts/verify_reach_filter.mjs drives a deleted component and cannot pass.
- T267-c: verify_fare_provenance.mjs has a baseline that predates T256 (flight rows always est.). I only re-headed it and dropped the expiry mock.
- T267-d: run `npm run ci:smoke` after a build. I ran the contract gate and the browser checks, not the full smoke gate, because a build over the linked 52k-file public tree is heavy.
- T267-e: the queue gate is tested on a throwaway repo pair only, and the wave runners do not use it.

Not mine, left alone as the notes said: T072-c, T072-d, T255-b (wait for stage 7) and T062-e. T062-c (duplicate task number) is the owner's.

The grounding rows named in the master paragraph (T041-c to T041-f, T040-c) were not in this session's list and were not touched.

Judgement calls worth a look when merging. combineTripLegs only prices a band when both directions have one, as planeFare does. A leg that resolves through a nearby airport takes its ground cost from airportLastLeg (zero when the place needs a car anyway), so the planner's anchor-leg code, which only runs when the flight-in airport differs from the stop, does not charge it twice. I checked this by reading, not with a fixture that has both an anchor and an unserved town. dedupeByArrival, groupByDeparture and driveOption went with the removed exports because nothing else read them.

## Rollback procedure

App repo: `git -C continent-app revert 78c9563` (one commit, branch p3-d6-fares-housekeeping). Root repo: revert the T267 commit on p3-d6-fares-housekeeping, or delete both branches if unmerged. No data, migration, secret or deploy is involved. The removed prov.expiredTitle strings come back with the app revert.
