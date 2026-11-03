# T804 to T805: flight prices out to the end of August (batch SW2)

Batch SW2, run 2026-10-28 to 2026-10-29 from `Execution/_queue/SW2-flights-to-august.prompt.md`. Two tasks: T804 finds out why the published files hold almost no outbound fares after mid December, and T805 stretches the late tier to the end of August 2027. Numbers were checked first: the highest task number in both repos' `git log --all`, every worktree's `Execution/` folder and `wt/vite.t*.mjs` was T801, TF3 reserves T802 and T803, so T804 and T805 were free.

Branches: app `p11-flights-to-august` (worktree `wt/sw2-app`, cut from app `master` 4502501), root `p11-flights-to-august` (worktree `wt/sw2-root`, from root `main` c8b5fe9fa). The app branch is not merged. Nothing was deployed, no secret was set, nothing was written to D1 or R2, and the box was not touched.

Read first: T798 (late tier) has no report and no register rows. The service file `infra/hetzner/cron/carta-late-sweep.service` names `Execution/P11/T798-late-flights.md`, which does not exist. So this batch worked from app commit 8866484 and root commits e9131d417 and c8b5fe9fa. The T795-c row this batch takes the data part of lives in the register on `p15-trip-finder-screens`, not on root `main`, so it is not closed here (see T805, what is still open).

No screen changed, so there was no browser round and no /impeccable pass.

---

## T804: why outbound stops after mid December

### Task ID

T804

### Date

2026-10-29

### What changed

Nothing in code. This is the diagnosis. The gap is in the searches, not the publish, and the cause is timing, not a bug. D1 holds no outbound fare after 2026-12-11 for BRU, AMS or MAD either, so the publish drops nothing (after the gate the files match D1 exactly). The far tier is running: D1 holds 7,000 to 9,000 fares a month for January to April 2027, all checked on 26 to 28 October, and in the minutes since 28 October 07:00 UTC most far routes got all 24 of their weeks. Since T780 the 50 s budget cuts nothing: minutes ran up to 37 searches, the most the plan asks for. What the three origins lack is a far turn since T780.

`flattenRoutes` sorts the routes by origin, so all of one origin's outbound routes sit next to each other and share one stretch of the far cycle. BRU's 78 outbound routes are indices 1,803 to 1,880 of 10,094. Under the old one-week cycle their far turn was 2026-10-23 06:03 to 07:20 UTC. Back then every minute held far more searches than it could finish, and a route's 24 weeks run in date order after the near jobs, so that turn only reached about week 7, the 9 and 11 December fares. T780 (deployed 2026-10-27) made the far cycle two weeks and spread the routes over it. That moved BRU's turn to cycle minute 3,600 to 3,754, which fell on 2026-10-24 12:00, before the deploy. The next one is **2026-11-07 12:00 to 14:34 UTC**. AMS's turn is 2026-11-05 12:56 to 17:52, and MAD's is 2026-10-30 04:59 to 08:33. MAD's old turn, 2026-10-26 02:38 to 04:25, fell in that night's refusal storm: 2,679 of 5,060 searches failed in the 02:00 hour. The return fares into 2027 are routes like BCN to BRU. Their indices are spread over the whole list, so about one in five had its turn after the deploy. That is the 15 routes the evidence saw.

The month mask is not the cause. For all three origins the outbound and return routes miss exactly the same months (BRU: 20 routes skip January and December, 7 skip April), and 56 of BRU's 78 routes fly all year. Over one far cycle on the live `_routes.json`, the plan schedules far searches in every month from November to April (21,000 to 35,000 a month) and a few hundred in May. The routes with no far job are summer-only routes whose mask blocks every far week. The late tier will reach those.

So this is operational: a cycle that has not come round since T780. Fixing nothing was the call. The register carries the owner's check and one fragility for a later task: the contiguous origin blocks mean that one pause in an origin's window of about 2.5 hours costs every outbound far fare from that origin for a whole cycle. Its 16-day age runs out before its next turn at 14 days plus a pause. A spread that interleaves origins would fix that, but it moves every route's turn once, so it belongs in its own task.

### Files touched

None. The evidence scripts lived in the session scratchpad (`plan_check.mjs`, `slots.mjs`, `gate.mjs`, `endcheck.mjs`) and were not committed.

### Commands run

All read-only, from `wt/sw2-app`:

    npx wrangler d1 execute carta_flights --remote --json -c workers/flight-sweep/wrangler.toml --command "SELECT origin, substr(date,1,7) m, COUNT(*), SUM(price IS NOT NULL), MIN(checked), MAX(checked) FROM fares WHERE origin IN ('BRU','AMS','MAD') GROUP BY origin, m"
    npx wrangler d1 execute ... --command "SELECT substr(date,1,7) m, date(checked,'unixepoch') c, COUNT(*) FROM fares GROUP BY m, c"
    npx wrangler d1 execute ... --command "SELECT k, v FROM state"
    npx wrangler d1 execute ... --command "SELECT strftime('%m-%d %H', minute*60, 'unixepoch') h, COUNT(*), SUM(jobs), SUM(ok), SUM(empty), SUM(failed), SUM(blocked) FROM runs GROUP BY h"
    npx wrangler d1 execute ... --command "SELECT jobs, COUNT(*) FROM runs WHERE minute >= <2026-10-28 07:00> GROUP BY jobs"
    npx wrangler d1 execute ... --command "SELECT dest, date, price, airline, dep, arr, stops, checked FROM fares WHERE origin = '<o>' AND date >= '2026-10-29'"   (BRU, AMS, MAD)
    curl https://flight-sweep.bas-vannieuwenhuyse123.workers.dev/status
    curl https://data.carta-europetravel.com/data/flights/{_routes,BRU,AMS,MAD}.json
    node plan_check.mjs routes.json     (jobsForMinute over one 20,160-minute far cycle)
    node slots.mjs                      (each origin's far turn, old and new cycle)
    node gate.mjs                       (buildFile on the D1 rows against the published file)

### Config and secrets set

None.

### Before/after measurements

Outbound priced fares per month, as route-days and distinct days, dates from 2026-10-29. D1 is counted after `buildFile`'s gate. The file is what the app reads (checked 2026-10-28 23:52 UTC). No fix, so there is no "after": the after is the owner's check in T804-a.

| Origin | Source | Oct | Nov | Dec | Jan to Aug | Last day | Gate left out |
|---|---|---|---|---|---|---|---|
| BRU | D1 | 215 / 3 | 941 / 14 | 148 / 2 | 0 | 2026-12-11 | 8 |
| BRU | file | 215 / 3 | 941 / 14 | 148 / 2 | 0 | 2026-12-11 | |
| AMS | D1 | 400 / 3 | 1,375 / 15 | 144 / 2 | 0 | 2026-12-11 | 87 |
| AMS | file | 400 / 3 | 1,375 / 15 | 144 / 2 | 0 | 2026-12-11 | |
| MAD | D1 | 303 / 3 | 972 / 14 | 107 / 2 | 0 | 2026-12-11 | 8 |
| MAD | file | 303 / 3 | 972 / 14 | 107 / 2 | 0 | 2026-12-11 | |

`/status` at 2026-10-28 23:52 UTC: last hour 1,199 searches, 998 priced, 201 empty, 0 failed, 0 refused. `pauseLevel` 2, last pause ended 2026-10-28 08:29 UTC. 178,248 fares, 144 dormant routes, `lateFares` 0. Since 28 October 07:00 the Worker has run at 775 to 1,346 searches an hour with no refusal.

### What broke and how it was fixed

No issues.

### What is still open

The owner's check (T804-a): after BRU's turn on 2026-11-07, BRU.json's last outbound day should move to early May 2027. The far tier's last date is day 175 to 181, so 1 to 7 May from 7 November, where the route flies that month. AMS should get there after 2026-11-05 and MAD after 2026-10-30. If BRU.json still ends in December on 2026-11-08, the far turn was refused or paused. Look at `runs` for 7 November 12:00 to 15:00 UTC and open a task.

The fragility (T804-b): origins cluster in the far cycle, and the late cycle has the same layout. Interleaving them (for example ordering the cycle by a fixed hash of origin and destination instead of the sorted list) would turn a lost window into a thin slice of every origin. The cost: it moves every route's turn once, and some routes wait up to a cycle for their first turn under the new order. Do it right after a cycle has filled the files, not before.

### Rollback procedure

Nothing to roll back.

---

## T805: the late tier out to the end of August

### Task ID

T805

### Date

2026-10-29

### What changed

The late tier now searches weeks 27 to 45 instead of 27 to 40 (`LATE_WEEKS` 19, was 14). On any day its last date is day 308 to 314: 2027-09-02 to 2027-09-08 from 2026-10-29, so from late October on it always passes the end of the next August. It stays under Google Flights' booking horizon of about 330 days, the figure from the prompt (the memory note `travel-app-fli-google-flights-test` has no horizon figure). The cycle is unchanged at 4 weeks, so every route still comes round inside `flights.max_age_days.late` (32 days), and `config/pricing.json` did not move.

The box's load rises from about 205 to about 278 searches an hour (187,036 a 4-week cycle, was 137,696). The Worker's load does not change: it runs only the near, far and find tiers, and its `PARALLEL`, `GAP_MS`, `BUDGET_MS` and cycles are untouched. The box keeps its own guard: the first refusal stops that minute and pauses it (`nextPause`, an hour, doubling while refusals come back, at most a day). The pause does not depend on the load, so more weeks mean more searches between refusals, not a faster pace. `GAP_MS` (4 to 9 s) stays.

The app needed no code change. `maxAgeMs` uses the late age for every date past `late_after_days` (181) with no upper bound. `/ingest` takes dates up to 400 days out (`MAX_AHEAD_DAYS`), the publish keeps every date from today on, and `sweptNear` (used by `roundTripNear`, `cartaFlight.js`, `price/flight.js` and the trip finder's `adapters/flight.js` on the trip finder branch) only looks within the 4-day spread of the asked day. Two tests were added and fail on the old `LATE_WEEKS`. In `tests/flightSweep.test.mjs`: over one late cycle from 2026-10-28, the far and late tiers together give an all-year route one day in every week from 3 to 45 with none missing, the last date is at least day 300 and under 330, and it passes 2027-08-31. In `tests/flights.test.mjs`: a fare at day 300 (2027-08-17), 30 days old, is kept and found by `sweptNear` two days off, and at 33 days old it is dropped.

### Files touched

**Modified (app repo, mirrored into the root repo's `continent-app/`):**
- workers/flight-sweep/src/plan.mjs (`LATE_WEEKS` 19, header and constant comments)
- workers/late-sweep/run.mjs (header weeks, the hourly load comment)
- src/lib/flights/flights.js (age comment only: 6 to 10 months, to day 314)
- tests/flightSweep.test.mjs (T805 test; the T798 test's title no longer names week 40)
- tests/flights.test.mjs (T805 day-300 test, `sweptNear` import)

**Modified (root repo):**
- infra/hetzner/cron/carta-late-sweep.service (comments and `Description`: weeks 27 to 45, about 280 an hour)

**Created:**
- Execution/P11/T804-T805-flights-to-august.md (this report)

PRODUCT.md was not touched. It has no line on how far ahead flights are priced, only the fare ages, and those are out of date since T780 (row T805-b).

### Commands run

    git -C "Travel App/continent-app" worktree add -b p11-flights-to-august ../../wt/sw2-app master
    git -C "Travel App" worktree add -b p11-flights-to-august ../wt/sw2-root main
    mklink /J wt\sw2-app\node_modules "Travel App\continent-app\node_modules"
    node workers/late-sweep/run.mjs --dry          (before and after)
    node --test tests/flightSweep.test.mjs tests/flights.test.mjs
    npx eslint <the five app files>
    npm test
    node endcheck.mjs                               (far and late over one full cycle, live routes)
    curl -X POST .../ingest  (no token, empty body: 401, so the Worker's /ingest is deployed; nothing written)

Commits: app 2252629, root 54bb465f7 (mirror and service file), then the report and register commit.

### Config and secrets set

None. `config/pricing.json` `flights.max_age_days` is unchanged (late 32, late_after_days 181), because the cycle did not change.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Last outbound priced day in BRU.json | 2026-12-11 | owner step pending (T804-a; T805 also needs the box running, T805-a) | |
| Outbound priced days per month, BRU, Dec to Aug | Dec 2 days (148 route-days), Jan to Aug 0 | same until the far turn of 2026-11-07 and the box run | |
| Late tier's last week ahead | week 40 (day 273 to 279) | week 45 (day 308 to 314) | +5 weeks |
| Late tier's last date, from 2026-10-29 | 2027-08-04 | 2027-10-05 over the cycle; on day one 2027-09-02 to 09-08 | |
| Box searches a 4-week cycle | 137,696 | 187,036 | +49,340 |
| Box searches an hour (late tier) | about 205 | about 278 | +73 |
| Worker searches an hour | about 1,100 (775 to 1,346 on 28 Oct) | unchanged (no Worker change) | 0 |
| All-year routes with a missing week, weeks 3 to 45 | not checked | 0 of 6,788 | |

End check over one full cycle on the live `_routes.json` (10,094 routes): the far tier's last date is day 181, the late tier's first is day 182, the late tier's last is day 314.

`npm test`: 878 tests, 827 pass, 3 fail, the rest skipped. The three failures are in `tests/numbersPage.test.mjs`, which reads `public/boot.json`, an untracked data file a fresh worktree does not have. They have nothing to do with this batch. `tests/flightSweep.test.mjs` and `tests/flights.test.mjs`: 29 pass, 0 fail.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `tests/flights.test.mjs` could not load `react` in the new worktree | the `node_modules` junction was made with a mangled target (`C:\C:\...`) through Git Bash's `cmd //c mklink` | removed the dangling junction with `rmdir` and made it again from PowerShell |

### What is still open

The deploy order (T805-a, owner). T798 (late tier) has no rows of its own, so its remaining steps are written into this one row instead of pointing elsewhere. The Worker's `/ingest` is live (an unauthenticated POST gets 401), but `/status` `lateFares` is 0, so the box service has not sent a fare yet. The steps:

1. Merge app `p11-late-flights` (already in `master` as 4502501) and `p11-flights-to-august` into app `master`, and deploy Pages, so the live app keeps a fare past day 181 for 32 days. The app code in this batch is comments and tests, but the deploy carries T798's age rule if the live site does not have it yet.
2. The Worker: no redeploy needed for this batch. T804 changed nothing, and the Worker does not read `LATE_WEEKS`.
3. The box: make sure `CARTA_SWEEP_INGEST_TOKEN` in the box's env file matches the Worker's `INGEST_TOKEN` secret (T798's step). Then pull the root repo and run `infra/hetzner/cron/install.sh`, which installs, enables and restarts `carta-late-sweep.service`. `node workers/late-sweep/run.mjs --dry` on the box should print about 278 an hour.
4. Over the next week, `/status` `lateFares` should grow by about 6,500 a day in the first 4 weeks (278 searches an hour, and every search writes a row, priced or not), then level off near 187,000. `journalctl -u carta-late-sweep` shows each minute and any refusal.

PRODUCT.md (T805-b): line 63 still says a swept price is shown for 3 days for the next two weeks and 8 days for later dates. Since T780 and T798 it is 5, 16 and 32. The prompt kept PRODUCT.md out of scope unless it named a horizon, so this is left for a task that may edit it.

T798 (late tier) report (T805-c): there is no report for it, the service file points at a missing `Execution/P11/T798-late-flights.md`, and the number is shared with TF2's trip card. A short task should write that report (or point the service file at this one) under its own number.

T795-c lives in the register on `p15-trip-finder-screens`. Once its far turns and the box have run, its data part is covered by T804 and T805 for dates to the end of August. The shape (what the card shows past the sweep's reach) is still the owner's call. Whoever merges that branch should note T805 on the row rather than close it.

### Rollback procedure

App: `git revert 2252629` on `p11-flights-to-august` (or on `master` after the merge). Root: `git revert 54bb465f7`. That puts `LATE_WEEKS` back to 14, and the box searches weeks 27 to 40 again after its next pull and restart. Fares already ingested past week 40 stay in D1 until their date passes. The app ignores them 32 days after their check. There is no data or schema migration.
