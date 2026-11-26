# Owner steps: deploy the denser flight sweep (D10, T855)

The sweep now spends the same search budget where travellers pick: every day of the next 90 for the 400 busiest routes, and the box's idle time on days 1 to 14 for the next 1,000. Nothing goes live until you deploy it. Branch `p15-flights-dense`, run `.work/2026-11-26-flights-dense/`.

## What changes

| Part | Before | After |
|---|---|---|
| Worker searches a day (planned) | 25,738 | 25,503 |
| Busiest day minute | 40 | 41 (1% of minutes; one search at a time, as before) |
| Box searches a day | 6,649 (late tier) | about 9,940 (late tier plus near days in idle time, same 4 to 9 s spacing) |
| Top 100 routes: days 1 to 90 with a fare checked on that day | 19% | 100% |
| Top 1,000 routes, same | 20% | 57% |
| All 10,094 routes, same | 21% | 26% |

No proxy, no new address, no higher concurrency, no night slots, the same backoff on refusal.

## Deploy, in this order

1. Merge `p15-flights-dense` to `main`.
2. Put the route list with its rank on R2: `python run_pipeline.py --only flight_routes` (or wait for the monthly run). Without the rank the Worker runs exactly the old plan.
3. Deploy the Worker from `continent-app/`: `npx wrangler deploy -c workers/flight-sweep/wrangler.toml`.
4. Deploy the app as usual (`node scripts/ship.mjs`, then `--live`): it carries `flights.max_age_days.late_after_days` 90 and the exact-day flight changes.
5. On the box: `git pull`, then `sudo systemctl restart carta-late-sweep.service`. Check the dry plan: `node continent-app/workers/late-sweep/run.mjs --dry` prints the late searches an hour and the near-day ones.

## Watch for refusals (first 3 days)

- Worker: `curl https://flight-sweep.bas-vannieuwenhuyse123.workers.dev/status`. `lastHour.blocked` should stay 0 and `pausedUntil` null, as before the change. `lastHour.jobs` stays about 1,400 an hour by day.
- Box: `journalctl -u carta-late-sweep -n 200`. Lines `box-near <minute>: {...}` are the new near days; `refused` on either `late-sweep` or `box-near` pauses both (the shared pause file).
- The general scraper notes: `docs/owner/scraper-health.md`.

## Roll back

1. Box only: set `LADDER_STOP_GOOGLE_FLIGHTS=1` stops every box search at once; or check out the previous `run.mjs` and restart the unit. The late tier alone is the old behaviour.
2. Worker: `npx wrangler rollback` from `continent-app/` with `-c workers/flight-sweep/wrangler.toml`, or `git revert` the D10 sweep commit and deploy again.
3. Removing `rank` from `_routes.json` on R2 also turns the dense tier off without a deploy. Fares already stored stay valid; nothing to migrate back.
