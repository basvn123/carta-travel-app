# T798: flight fares 6 to 9 months out, from the Hetzner box

## Task ID

T798 (phase P11, branch `p11-late-flights` in both repos). The number is used twice: TF2's trip card also took T798 (root 8cd6bd8ac); register row T802-d already records it, and a renumber is the owner's call. This report is the late tier's.

## Date

2026-10-28 to 2026-10-29

## What changed

The owner asked for flight prices past November, to June or July 2027, gathered slowly on the box.

Before, the Cloudflare sweep (workers/flight-sweep) covered the next 26 weeks: dates up to about 28 April 2027. Now a third tier, late, covers weeks 27 to 40 (day 182 to about day 279, so May to early August 2027 today, rolling forward each day):

- `plan.mjs`: `LATE_CYCLE` (4 weeks), `LATE_WEEKS` (14) and `lateJobsForMinute`, the far tier's one-day-a-week spread carried on, with the same month mask. Each route is searched once a cycle; the tier starts the day after the far tier's last.
- `workers/late-sweep/run.mjs` (new): the box runner. It walks the plan one minute at a time with 4 to 9 s between searches, sends results to the Worker in batches of 40, pauses on a Google refusal (the Worker's `nextPause`: an hour, doubling while refusals keep coming back, at most a day) and keeps its place in `~/.local/state/carta/late-sweep.json`. After a gap it catches up at the same pace; after more than a cycle it starts fresh. `--dry` counts a cycle's searches.
- Worker: `POST /ingest` (bearer `INGEST_TOKEN`, compared on SHA-256 digests in constant time) writes the box's rows to the same `fares` table, so the 10-minute publish ships them. `ingest.mjs` drops rows that are not fares (bad codes, dates in the past or over 400 days out, prices that are not whole euros 1 to 20,000), at most 200 rows a call. `/status` gains `lateFares`.
- App: `flights.max_age_days` gains `late: 32` and `late_after_days: 181`; `maxAgeMs` keeps a fare past day 181 for 32 days (a 4-week cycle plus a few days for a pause or a restart). Before, those dates had no fares and the far rule (16 days) would have dropped a box fare halfway through its cycle.
- Box: `infra/hetzner/cron/carta-late-sweep.service` (always on, `TZ=UTC` because `flightSearch.mjs` reads times with `getHours()` as in the Worker, nice 10, idle IO, 512 MB cap, restart after 60 s). `install.sh` installs, enables and restarts it; `--disable` stops it with the timers. `env.example` names `CARTA_SWEEP_INGEST_TOKEN`.

The Booking stays scrape is unrelated and stays on the laptop.

## Files touched

App (continent-app, commit 8866484, merged as 4502501):
- workers/flight-sweep/src/plan.mjs, workers/flight-sweep/src/index.mjs, workers/flight-sweep/src/ingest.mjs (new)
- workers/late-sweep/run.mjs (new)
- config/pricing.json, src/lib/flights/flights.js
- tests/flightSweep.test.mjs, tests/flights.test.mjs

Root (commit e9131d417, merged as c8b5fe9fa, pushed): the same app files mirrored, plus infra/hetzner/cron/carta-late-sweep.service (new), infra/hetzner/cron/install.sh, infra/hetzner/cax11/env.example.

## Commands run

```
node --test tests/flightSweep.test.mjs tests/flights.test.mjs tests/priceConfig.test.mjs   35 pass, 1 skipped
npx eslint workers/flight-sweep/src workers/late-sweep src/lib/flights/flights.js tests/...  clean
TZ=UTC node workers/late-sweep/run.mjs --dry      10094 routes, 137697 searches a cycle, about 205 an hour
npx wrangler deploy -c workers/flight-sweep/wrangler.toml          version a5a7a38d
git push origin main                                               f700c674d..c8b5fe9fa
box: git fetch origin main && git checkout -f -B carta-run origin/main   (app_data.json kept, see below)
npm run build:pages; node scripts/r2/push-data.mjs --live; npx wrangler pages deploy dist --branch main   Pages 61f11430
owner: set-ingest-token.sh (wrangler secret put INGEST_TOKEN, the same token in the box's env, sudo install.sh)
```

Feasibility first: three searches from the box (BRU-BCN 15 Jun 2027 41 EUR, AMS-LIS 6 Jul 101 EUR, CDG-FCO 11 May 96 EUR), all answered in about 0.5 s with no refusal.

## Config and secrets set

- Worker secret `INGEST_TOKEN` (flight-sweep), set by the owner; the auto-mode classifier refuses secret-store writes from Claude.
- Box `~/.config/carta/env`: `CARTA_SWEEP_INGEST_TOKEN`, the same value.
- systemd `carta-late-sweep.service` enabled on the box.
- `config/pricing.json` `flights.max_age_days.late` 32, `late_after_days` 181 (reviewed 2026-10-28).

## Before/after measurements

| | Before | After |
|---|---|---|
| Furthest swept date | about day 181 (28 Apr 2027) | about day 279 (early Aug 2027) |
| Searches an hour, Worker | about 1,040 | unchanged |
| Searches an hour, box | 0 | about 205 (dry run on the real route list; catching up at most about 500) |
| `/status` lateFares | 0 | 608 on 2026-10-29 about 13:10 UTC, minutes after the service started |

The first full late cycle ends about 2026-11-26; until then a late date has a fare only once its route's turn came.

## What broke and how it was fixed

- A full root worktree (`git worktree add`) filled C: (the root repo tracks continent-app/public, about 48,000 files); bash then could not fork. Stopped the checkout, deleted the partial `public/`, and made a sparse root worktree (202 MB). Git Bash rewrote the leading `/` in sparse patterns to `C:/Program Files/Git/`; `MSYS_NO_PATHCONV=1` fixed it. The Booking scrape kept running.
- A test compared far dates from 2 weeks of different days with the first day; rewritten to measure each date from its own minute (code unchanged).
- Root `main`'s merge refused because the app merge had already changed the mirrored files in root's working copy; checked all 8 were byte-identical to the branch, reset them, merged.
- The box's working copy had its own `continent-app/public/app_data.json` from its pipeline run; it was copied to `~/backup-t798/`, the checkout forced, and the copy put back (cmp equal). The force also reset the box's `data/derived/freshness_report.json`, a report each pipeline run writes again.
- Deploy, push and box steps needed the owner's permission; the secret step the owner ran by hand (`set-ingest-token.sh`, Git Bash, since PowerShell 5.1 cannot parse the bash line).

## What is still open

- The box does not know dormant routes or the find tier's discoveries: it searches about 170 dormant routes every cycle (many all-empty minutes in the log) and misses routes found after Eurostat's list. A `GET /plan-hints` on the Worker (dormant and found pairs) would fix both. Row T798-a.
- Batch SW2 (T805, branch `p11-flights-to-august`, not merged) widens `LATE_WEEKS` to 19 (weeks 27 to 45, about 278 searches an hour). Merging it changes this tier's reach and load; the late age (32) stays right because the cycle stays 4 weeks. Its row T805-a ("the service had not run yet") is closed by this work once SW2 lands.
- Watch the first cycle: no refusals on the box, `lateFares` growing to roughly 100,000, and a May to July date showing a price in the app. Row T798-b.

## Rollback procedure

- Box: `sudo systemctl disable --now carta-late-sweep` (or `install.sh --disable`, which also stops the weekly timers).
- Worker: `npx wrangler rollback` to the version before a5a7a38d (1798d987), or leave it: without the box nothing calls /ingest. `npx wrangler secret delete INGEST_TOKEN` closes the route.
- Data: late fares age out of the app 32 days after their last check; to remove them at once, `DELETE FROM fares WHERE date >= <today + 182 days>` on D1 `carta_flights` and wait for the next publish.
- Code: `git revert -m 1 4502501` (app) and `git revert -m 1 c8b5fe9fa` (root), then a Pages deploy.
