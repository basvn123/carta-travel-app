# T915-T917: the flight sweep's blind spot, January and February sooner, a faster box fill

Batch of three tasks asked for in one message (owner, 2026-10-30: "do all 3", after the coverage audit in the same session). App branch `p11-sweep-gaps` (continent-app `bbc5c2f`), root branch `p11-sweep-gaps`. The three tasks share one change to `workers/late-sweep/run.mjs` (one walker for all the box's fills), so they are one app commit; T916 alone is one constant (`FILL_GAP_MS`).

Shared before state (2026-10-30 22:20 UTC): the Worker sweeps 10,094 Eurostat routes plus 57 found ones; the box runs the late tier (T798) and the late fill (T819) at 1,648 of 7,570 routes, about 50 routes an hour by day; no refusal on the box since it started, the Worker's last pause ended 04:43 UTC.

End check: no screen is touched. The check is on the box and the Worker, after the owner runs the deploy script (T915-a): `systemctl is-active carta-late-sweep carta-late-fill`, `journalctl -u carta-late-fill` showing gap-fill, then far-fill, then late-fill, and `/status`.

---

## Task ID

T915

## Date

2026-10-30

## What changed

The route list comes from Eurostat, where a route exists when either end's country reports it. Routes between two countries that do not report (the UK, Czechia, the Channel Islands, the Isle of Man, the Faroes, Albania, Kosovo, Moldova) were never searched: London to Prague, London to Edinburgh, Manchester to Tirana. The Worker's find tier would reach each such pair only once in 90 days. Now the box searches each of those pairs once, both directions on two different days (21 and 24 days out), direct flights only, and sends every pair with a direct flight to the Worker's `/ingest` as a found route, which the Worker then sweeps on every tier like the find tier's discoveries. The Worker also serves the box its found routes (in a fixed order, so both build the same route list) and its dormant routes (`GET /extra`), so the box's late tier now includes found routes and skips dormant ones, which closes T798-a. The pair list keeps to Europe by coordinates (the list also carries Réunion, Mayotte, French Guiana, Niger and Mozambique airports) and to pairs at least 150 km apart: 564 pairs, 1,128 searches, about 1.3 hours on the box.

## Files touched

**Modified:**
- continent-app/workers/flight-sweep/src/ingest.mjs (`ingestFound`; a found-only body is valid)
- continent-app/workers/flight-sweep/src/index.mjs (`/ingest` stores found; `GET /extra`, `GET /have` behind the ingest token; found read in a fixed order)
- continent-app/workers/late-sweep/run.mjs (route list with found and dormant; the gap fill; one walker for the fills)
- continent-app/tests/flightSweep.test.mjs
- infra/hetzner/cron/install.sh (restart the fill so it picks up new code)
- infra/hetzner/cron/carta-late-fill.service (comment)

**Created:**
- continent-app/workers/late-sweep/gaps.mjs

## Commands run

```
node --test tests/flightSweep.test.mjs                       # 23 pass
npm test                                                     # 1,007 pass, 3 fail (numbersPage: public/boot.json is not in a fresh worktree; passes in the main checkout)
npx eslint workers/late-sweep workers/flight-sweep/src tests/flightSweep.test.mjs
node $TMP/gapcount.mjs <worktree> data/raw/eurostat_routes/ourairports.csv   # 564 pairs
USERPROFILE=<tmp> CARTA_SWEEP_INGEST_TOKEN=x CARTA_SWEEP_INGEST_URL=http://127.0.0.1:8787/ingest node workers/late-sweep/run.mjs --fill   # against a local stub
```

Deploy (owner, T915-a): `scratchpad/run-t915.sh` runs `npx wrangler deploy` in `workers/flight-sweep`, checks `/extra` answers 401, then on the box: `git checkout -f -B carta-run origin/main` (app_data.json kept), `sudo bash infra/hetzner/cron/install.sh`.

## Config and secrets set

None new. `/extra` and `/have` reuse the Worker's `INGEST_TOKEN` and the box's `CARTA_SWEEP_INGEST_TOKEN`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Pairs between non-reporting European countries ever searched by date | 0 (find tier: one in 90 days) | 564 pairs, once, within about 1.3 h of the deploy | +564 |
| London-Prague, Edinburgh-London | not in the route list | direct flight seen in the local run, sent as found | 2 of 2 tested |
| Box late tier route list | Eurostat only, dormant searched | Eurostat + found, dormant skipped | T798-a |

The count of found routes after the box run is open (T915-b).

## What broke and how it was fixed

- The first pair count was 1,009: Carta's list holds a few overseas and African airports (RUN, DZA, NIM, LMZ, ...) in non-reporting countries. Limited to Europe by coordinates: 564.
- Clean-up of the local stub went wrong twice: a broad `taskkill` with a window-title filter (it matched nothing, all other node processes were checked and still running) and a `Stop-Process` by PID that the permission check denied. The stub exits on its own after 400 s.
- `npx wrangler deploy` was denied by the permission check (production deploy); it moved into the owner's script.

## What is still open

- T915-a: the owner runs the deploy script (the Worker first, then the box).
- T915-b: after the gap fill, count the found routes (`/status` found, was 57) and check one, London-Prague, gets fares from the Worker within 3 days.
- New routes since December 2024 between reporting countries are still only found by the 90-day find tier; a yearly rebuild of `_routes.json` is the real fix, not more searching.

## Rollback procedure

`git revert bbc5c2f` in continent-app and the root mirror commit, redeploy the Worker (`npx wrangler deploy` in `workers/flight-sweep`), and on the box check out the reverted `origin/main` and run `sudo bash infra/hetzner/cron/install.sh`. Found routes the gap fill added stay in D1 `found`; remove them with `DELETE FROM found WHERE first_seen >= <deploy time>` if wanted. The fill's state files (`~/.local/state/carta/gap-fill.json`, `far-fill.json`) can be deleted; the old code ignores them.

---

## Task ID

T916

## Date

2026-10-30

## What changed

The box's fills wait 2 to 4.5 seconds between searches, was 3 to 6.5, still doubled from 23:00 to 05:00 UTC and slowed 1.5 times per refusal (at most 4 times). That is about 960 searches an hour by day, was about 690, beside the late tier's 205; the late fill's remaining routes end about a day sooner than at the old pace, but now after the gap and January-February fills (T915, T917), so its end moves from about 5 to about 6 or 7 November. The box has had no refusal in 33 hours at the old pace; the Worker's refusals all came at night and at about 1,000 an hour from Cloudflare's addresses, which are not the box's.

## Files touched

**Modified:**
- continent-app/workers/late-sweep/run.mjs (`FILL_GAP_MS`; the slow-down is now shared between the fills, so a refusal in one keeps the next slower too)

## Commands run

As T915.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Fill gap between searches (day) | 3 to 6.5 s | 2 to 4.5 s | -31% |
| Fill searches an hour (day, about) | 690 | 960 | +39% |
| Box refusals since start | 0 | measured by T916-a | |

## What broke and how it was fixed

Nothing.

## What is still open

- T916-a: watch the box for refusals for two days after the deploy; at the first one, put `FILL_GAP_MS` back to 3000, 6500.

## Rollback procedure

Set `FILL_GAP_MS = [3000, 6500]` in `workers/late-sweep/run.mjs`, push, and on the box check out `origin/main` and run `sudo systemctl restart carta-late-fill` (it resumes where it was).

---

## Task ID

T917

## Date

2026-10-30

## What changed

The owner wants every fare to the end of February complete. Those dates are the Worker's far tier (weeks 3 to 26), which reaches each route once in 2 weeks and has done about 2,450 of the about 7,350 routes that fly in January and February since its range grew on 26 October, about 460 more a day. Now the box, after the gap fill, asks the Worker which routes already have a fare between 2027-01-01 and 2027-02-28 (`GET /have`), and searches the rest on the far tier's own days in that window (about 8 a route; `farJobsInWindow`, tested to match the Worker's days), starting with the routes the Worker reaches last and checking again every 100 routes so it skips any the Worker reached meanwhile. The fares go in through `/ingest` with today's check time, so they sit under the far age (16 days) until the Worker's own turn replaces them. Expected: January and February complete about 2 to 3 days after the deploy (about 2 to 3 November), was 10 to 11 November.

## Files touched

**Modified:**
- continent-app/workers/flight-sweep/src/plan.mjs (`farJobsInWindow`)
- continent-app/workers/flight-sweep/src/index.mjs (`GET /have`, with T915)
- continent-app/workers/late-sweep/run.mjs (the far fill)
- continent-app/tests/flightSweep.test.mjs

## Commands run

As T915. The local run sent 8 January-February fares for route 5000 (KRK-SKG) to the stub.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Routes with a fare in January 2027 | 2,457 (2026-10-30 22:20 UTC) | measured by T917-a | |
| Routes with a fare in February 2027 | 2,450 | measured by T917-a | |
| Expected date January-February complete | 10 to 11 November | about 2 to 3 November | about 8 days sooner |

## What broke and how it was fixed

Nothing.

## What is still open

- T917-a: about 3 November, count routes with a fare per month (the D1 query in the session) and compare with the routes that fly then (`_routes.json` month bits plus found).

## Rollback procedure

With T915 (one commit). To stop only the far fill on the box: write `{"done":"skipped"}` to `~/.local/state/carta/far-fill.json` and `sudo systemctl restart carta-late-fill`.
