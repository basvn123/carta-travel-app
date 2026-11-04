# Batch SW2: flight prices out to the end of August (T804 to T805)

You are running batch SW2. The owner wants swept flight prices from now to the end of August 2027, so a trip like the trip finder plan's May example gets a real flight figure instead of NotYet (row T795-c). The owner chose the slow-tier route on 2026-10-28: add far-out weeks on a slow cycle, not a faster sweep.

Most of that already exists. T798 (app commit 8866484, merged into app `master` as 4502501; root mirror e9131d417 and c8b5fe9fa) built the **late tier**:

- **Weeks:** 27 to 40, one day a week.
- **Cycle:** each route every 4 weeks, about 205 searches an hour.
- **Where it runs:** on the Hetzner box (`workers/late-sweep/run.mjs`, `carta-late-sweep.service`). It sends fares to the Worker's `POST /ingest`.
- **App side:** the app keeps a fare dated past day 181 for 32 days (`flights.max_age_days.late`).

Week 40 is about early August. SW2 does two things:

1. **T804:** finds out why the published files hold almost no outbound fares after mid December, even though the far tier should already reach week 26.
2. **T805:** stretches the late tier to the end of August.

Follow `CLAUDE.md` in batch mode: one batch branch per repo, one commit per task (`T{n}: ...`), static checks per task, one end check, then one report and the register rows. No screen changes, so no browser round and no /impeccable.

## Where to run it

- **The app repo.** The code lives in the app repo: the nested `continent-app/` of the main checkout, its own git tree, on `master`. Work in a fresh worktree of that repo under `Portfolio/wt/` (for example `wt/sw2-app`) on a branch `p11-flights-to-august` cut from app `master`. Unlink `node_modules` junctions before any `git worktree remove` (memory `worktree-remove-deletes-through-junction`).
- **The root repo.** The box files (`infra/hetzner/...`) and the report live in the root repo. Use a root worktree `wt/sw2-root` on a branch of the same name from root `main`, and mirror the app commits into its `continent-app/` folder the way T798 did.
- **What you must not do.** Do not deploy the Worker, the Pages app or the box service; those are the owner's. Do not change the Worker's own search pace (`PARALLEL`, `GAP_MS`, `BUDGET_MS`, the near and far cycles). The owner capped it on 2026-10-27 (T780).

## Read first

1. **The late tier report and its rows.** Read the T798 late tier report, if one is committed (grep `Execution/P11/` and every worktree for "late tier"), and its register rows. If no report exists yet, read commits 8866484 and e9131d417 instead and say so.
   - Watch the numbering: T798 was also used by the trip finder's TF2 (the trip card). Refer to this one as "T798 (late tier)".
2. **The earlier sweep reports:**
   - `Execution/P11/T780-sweep-gentle.md`: the near and far cycles and the guard.
   - `Execution/P11/T739-sweep-publish-queue.md`: how files are published.
3. **Code:**
   - `workers/flight-sweep/src/plan.mjs` (`jobsForMinute`, `lateJobsForMinute`, `FAR_WEEKS`, `LATE_WEEKS`, `LATE_CYCLE`)
   - `workers/flight-sweep/src/index.mjs` (the publish SQL, the `DELETE FROM fares WHERE date < ?`)
   - `workers/flight-sweep/src/publish.mjs` (`buildFile` and its gate)
   - `workers/late-sweep/run.mjs`
   - `src/lib/flights/flights.js` (the age rule)
   - `config/pricing.json` `flights.max_age_days`
4. **Memory:**
   - `travel-app-fli-google-flights-test`
   - `travel-app-hetzner-batch-t046-t048` (the box is IPv6-only; check what it can reach)
   - `travel-app-box-run-1-t740`
   - `concurrent-session-gotcha`
   - `two-git-repos-nested`
   - `nested-repo-strands-task-work`
5. **Open rows.** Read the `open` rows in `Execution/_OPEN.md` owned by `next task`. This batch takes T795-c's data part (the owner still calls the shape).
6. **Task numbers.** Check them before you take any.
   - Take the highest number in `git log --all --oneline` of both repos and in every worktree's `Execution/` folder (`git worktree list`; several live under `Portfolio/wt/`). Also check `wt/vite.t*.mjs` and ListAgents.
   - The trip finder's TF3 prompt reserves T802 and T803.
   - If T804 or T805 is taken, shift up and say so in the report.

## The evidence so far (2026-10-28, from the published `data/flights/BRU.json`)

- **Checked:** 2026-10-28 19:50 UTC.
- **Outbound fares from BRU (`to`):** 288 in October, 941 in November, and 148 in December, all on 9 and 11 December. Nothing later, for any of 78 airports.
- **Return fares to BRU (`back`):** these carry on into 2027, 35 to 53 a month to 27 April, on 15 routes only.
- **Fare check times:** 21 to 28 October.

So the far tier (weeks 3 to 26) shows up only as a thin, one-directional tail. Either far searches are not running, or they run and their rows are dropped before the file.

## Tasks

### T804: why outbound stops after mid December

**This is a diagnosis first, and a fix only if the cause is in code.**

- **Count the D1 rows.** Read-only, through `wrangler d1 execute --remote` as the existing reports do. For BRU and two other big origins (say AMS and MAD), count the rows by origin, direction, month of `date`, and tier when the table can tell it. Compare these counts with the published files. The question is whether the gap is in the searches or in the publish.
- **Check the plan.** Run `jobsForMinute` in node over one full far cycle (20,160 minutes) on the live `_routes.json`. Count the far jobs per route and per month, and check the month mask (`mask & monthBit`):
  - Does a route Eurostat saw only in some months skip the winter and spring?
  - Does the mask hide whole months for the BRU outbound routes but not the return ones?
- **Check `/status`** for refusals and `pauseLevel`. Do it read-only, through the existing `/status` endpoint. A long pause since T780 would starve the 2-week far cycle.
- **Check the publish.** Does `buildFile`'s gate or the publish SQL drop far rows (age, price moves, `routeMoves`)? Count what `gate.rejected` and `gate.moved` hold for BRU.
- **Fix only a code cause.** If the cause is a bug in code (the mask, the gate, the SQL, the cycle spread), fix it with a test in `tests/flightSweep.test.mjs` that fails before the fix. If the cause is operational (pauses, refusals, a deploy that has not happened, a cycle that has not come round yet since T780 on 2026-10-27), fix nothing. Write the evidence and one register row for the owner with the step.
- **Measure.** Report outbound priced days per month for BRU, AMS and MAD, in D1 and in the file, before and (if fixed) after.

### T805: the late tier out to the end of August

- **The change.** Raise `LATE_WEEKS` in `plan.mjs` so the late tier's last date stays at least 10 months ahead.
  - With the far tier's 24 weeks, `LATE_WEEKS = 19` covers weeks 27 to 45. That is about day 314, so the window always passes the end of August from late October on.
  - Check it against Google Flights' booking horizon (about 330 days, memory `travel-app-fli-google-flights-test`). Searches past the horizon only return empty rows, so cap below it.
- **Keep the cycle.** `LATE_CYCLE` stays at 4 weeks, so `flights.max_age_days.late` (32 days) still holds. If anything changes the cycle, the age in `config/pricing.json` moves with it, in the same commit, with its source line updated.
- **Load.** Measure with `node workers/late-sweep/run.mjs --dry`: searches per cycle and per hour, before and after. Expect about 205 an hour to become about 280, all on the box. The Worker's own load does not change. Check it against the box's guard: a refusal pauses it, as in the Worker.
- **App side.** Make sure the app keeps and shows late fares on the new far dates:
  - `flights.js` uses the `late` age past `late_after_days`, with no upper bound that would cut week 41 and later.
  - `sweptNear` and the trip finder's flight adapter (`src/lib/recommend/adapters/flight.js` on the trip finder branch; on app `master` that file is not there yet) read those days.
  - Add a test in `tests/flights.test.mjs` for a fare at day 300.
- **Docs.**
  - Update the `plan.mjs` header comment and the late-sweep header to the new weeks.
  - Update `PRODUCT.md` where it states how far ahead flights are priced. Grep for it; if `PRODUCT.md` has no such line, leave it alone.
- **The owner's steps.** One register row with the order:
  1. App `master` merged and Pages deployed first, so the app accepts the far dates.
  2. Then the Worker, if T804 changed it.
  3. Then the box: pull, restart `carta-late-sweep.service`, using the `install.sh` from T798 (late tier).
  4. Then check `/status` `lateFares` grows over a week.

  If the late tier itself is not deployed yet (box service, `INGEST_TOKEN` secret), say so and point at T798's (late tier) own rows. Do not duplicate them.

## Checks

**Per task:**
- lint the touched files
- `npm test` from `continent-app/`: no new failures, with `tests/flightSweep.test.mjs` and `tests/flights.test.mjs` green

**End of batch:**
- `node workers/late-sweep/run.mjs --dry`, before and after
- `jobsForMinute` and `lateJobsForMinute` over a full cycle in node: the far and late tiers meet with no missing week, and the last date is at least day 300
- no deploy

**Baseline** (in the report):

| Metric | Before | After |
|---|---|---|
| Last outbound priced day in BRU.json | 2026-12-11 | after T804's fix and a cycle, or "owner step pending" |
| Outbound priced days per month, BRU, Dec to Aug | from T804 | from T804 |
| Late tier's last week ahead | week 40 (about day 279) | week 45 (about day 314) |
| Box searches an hour (late tier) | about 205 | about 280 |
| Worker searches an hour | about 1,100 | unchanged |

## Done when

- The cause of the missing outbound fares after mid December is written down with D1 counts, and fixed if it is in code.
- The late tier reaches the end of August with its 4-week cycle and its 32-day age.
- The app keeps a fare at day 300.
- The owner's deploy order is one register row.
- `npm test` has no new failures.
- The report `Execution/P11/T804-T805-flights-to-august.md` and the register rows are committed together in the root repo. The app commits are on `p11-flights-to-august`, not merged.

## Never

- **No Anthropic or Claude API.** No SDK, no key, no call to `api.anthropic.com`.
- **No em dashes, en dashes or middle dots** anywhere. Not in code, strings, docs or the report.
- **No banned words:** seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.
- **No faster Worker sweep.** Keep T780's pace, and no search from Cloudflare's servers past week 26.
- **No writes to D1 or R2 from this session.** Only read-only queries.
- **No deploy, no secrets set, no box restart.** Those are the owner's.
- **No `git stash`** while worktrees are in use. Before any `git worktree remove`, unlink the `node_modules` junctions first.

## Rollback

Every task is its own commit, so `git revert` any one of them.

- **Reverting T805** puts `LATE_WEEKS` back to 14. The box then searches weeks 27 to 40 on its next restart. Fares already ingested past week 40 age out after 32 days.
- **Reverting T804's fix** (if any) restores the old behaviour.
- There is no data or schema migration. D1 and R2 are not written by this batch.
