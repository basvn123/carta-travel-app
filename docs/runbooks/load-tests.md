# Load tests (ROADMAP H4)

k6 scripts in `tests/load/` for the four routes a launch day leans on. Built in T1158. The preview run is an owner step (see "Run it").

## What is tested

| Script | Route | What it hits | p95 budget |
|---|---|---|---|
| `ask.js` | `GET /api/ask` | Dense retrieval Function; 70% popular questions (edge cache hits), 30% unique (misses) | 800 ms |
| `flights.js` | `GET /api/flights` | Live Google Flights search behind a one hour edge cache; 80% hits, 20% misses | 2,500 ms |
| `stays.js` | `stays/v1/{cc}.json` | The stays wire shards (there is no live stays Function since T1074) | 400 ms |
| `static.js` | `/`, `/boot.json`, `/dest/{cc}.json`, `/search/ask/lexicon.json`, `/country_insights.json` | The static shell and wire of a first visit | 300 ms |
| `all.js` | all four together | Same rates, one run | per route |

Every script also fails on a 5xx rate (not counting a 502 upstream) of 1% or more, and on an http failure rate of 1% or more. `flights.js` and `all.js` also fail when upstream 502s pass 5%. A 429 is the per-address limit working as designed: it is counted (`refused_429`), never a failure, and excluded from the latency budget because it is cheap.

## The 10x number

The launch plan holds no traffic forecast, so the number is an assumption written in `tests/load/lib.js`:

- Launch is 10,000 monthly active users (the middle column of `docs/research/E-R3-models-and-hosting.md` section 6). 10x is 100,000 MAU.
- Calls per user per month: ask 6 (E-R3 section 3), flights 4 (a guess), stays 2 (one session start each, two sessions a month), static 16 (eight files a session).
- The busiest hour holds 12% of a day, and the 4 May campaign day runs 5 times an ordinary peak hour.
- Rate = MAU x calls / 30 x 0.12 x 5 / 3600, rounded up: **ask 4, flights 3, stays 2, static 9 requests per second**.

These are small for a CDN and honest for the Functions: the risk at launch is not requests per second, it is edge cache misses on the Functions (ask CPU, flights upstream) and the per-address limits. For a stress run pass `-e MULT=3`. Replace the assumptions with real figures when E4 and K12 give them (register row T1158-c).

## Run it

Install k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/), then:

```
k6 run -e BASE_URL=https://<preview>.carta-app.pages.dev -e SPOOF_IP=0 tests/load/all.js
```

- Preview or production edge: always `SPOOF_IP=0`. Cloudflare overwrites `cf-connecting-ip`, so one runner is one address and the 60 per minute ask limit and 20 per minute flights limit answer 429 for most requests. That is the limiter proving itself; the latency of the answered requests is what the budget measures. For a broader run, use the manual workflow (`.github/workflows/load.yml`, Actions tab, "Run workflow") or several runners.
- Local (`wrangler pages dev` on a build, port 8788): leave `SPOOF_IP` at its default 1; the Functions trust the header there.
- `DATA_URL` is the data host when it differs from `BASE_URL` (`/dest` and `/stays` live on `data.carta-europetravel.com` in production).
- `/api/flights` needs outbound access to Google Flights. From an offline runner every miss is 502.
- Stop if the Cloudflare dashboard shows the Functions request quota nearing its limit; a three minute run at the target is about 3,200 requests in total across the four routes.

## How to read a run

k6 prints each threshold as a tick or a cross. Per route look at `http_req_duration{route:...}` p(95), `refused_429`, `upstream_502` and `server_5xx`. Record the result in the task report with the date, the preview URL and the multiplier.

## Local numbers

Not recorded in T1158: the cloud container refused to run a downloaded k6 binary, so the scripts were checked by `tests/load/smoke.test.mjs` (parse, thresholds, arithmetic) and the first run is an owner step (T1158-a).
