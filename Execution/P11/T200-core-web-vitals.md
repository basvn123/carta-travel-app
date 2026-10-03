# T200 Measure Core Web Vitals on the three heaviest pages

## Task ID

T200 (mind-map number T196)

## Date

2026-10-03

## What changed

Nothing in the product changed. This task measured LCP, INP and CLS on the price map, a destination page and a trip page, on desktop and on a simulated mobile phone, against the live site at https://www.carta-europetravel.com. It is the first measurement of the real deployment. T011 and T055 both measured a build served from loopback, which has no round trip and no real data host, so those numbers were a floor. These are not.

The done condition, all three pages passing Core Web Vitals on mobile, is not met. Every page fails at least one metric on the phone profile. The failures are listed below and each has a register row.

One qualification matters more than the rest. T271 (first paint from the boot index, CLS and INP) is still in progress and is not deployed. Everything here is the pre-T271 baseline. T271 is aimed at several of these numbers, so the comparison that matters is the re-run after it ships, which is filed as T200-e.

Three register rows were closed by measurement. T056-b asked for the no-runtime-fares trace against the live deploy, T059-c asked for the 238-shard full load against the real data host, and T055-a asked for a real measurement instead of a loopback stand-in. All three are answered below.

## How the measurements were produced

The method is T011's, unchanged, so the numbers sit in the same table as T011 and T055. Three cold runs per cell, a fresh browser context each time with empty storage and the service worker blocked, the median reported. The phone profile is a 390 by 844 viewport with a 4x CPU throttle, the same stand-in for a mid-range phone that `scripts/perf/profile.mjs` uses. Thresholds are Google's: LCP 2,500 ms, INP 200 ms, CLS 0.1.

The existing harness, `continent-app/scripts/perf/baseline_vitals.mjs`, serves `dist/` from loopback and cannot point at a URL, and this task is not allowed to change app code. So the run used a scratch copy kept outside the repository, made by cutting the static server out of the harness and setting the base URL to production. The probe, the page list, the settle logic and the median are the harness's own. Two things differ, and both matter when reading the numbers.

First, the trip page interaction. T011 recorded no INP for the trip page because its generic click sweep landed on the covered header behind the trip overlay and produced no counted interaction. The scratch copy clicks the first four `button[aria-expanded]` folds instead. That gives the trip page a real INP for the first time (6 to 9 interactions per run), but it also means the trip INP cell has no T011 or T055 counterpart.

Second, the network. This is the owner's own connection to Cloudflare from Belgium (the edge answered from BRU), with no throttle, so it is faster than a typical phone connection. A second pass used a CDP network profile of 1.6 Mbit/s down and 150 ms latency, the usual slow 4G figure. That pass is only meaningful for the phone cells. It also left the trip page unmeasured: the harness settles the trip page by waiting a fixed six seconds, and under slow 4G the trip had not opened by then, so those cells measured the page behind the overlay (the LCP element was `DIV.name`, with zero interactions) and are discarded.

All of this is lab data from one machine. It is not field data. Real-user numbers come from CrUX or Search Console once there is traffic (T200-g).

## Measured: Core Web Vitals

Production, run on 2026-10-02 23:50 UTC to 2026-10-03 00:03 UTC, median of three runs, source `continent-app/reports/perf_prod_T200.json`. The T011 column comes from `Execution/P0/T011-performance-and-cost-baseline.md` and the T055 column from `Execution/P3/T055-post-migration-measurement.md` (its same-origin current-HEAD column, the like for like comparison). Both are loopback. Times in milliseconds.

| Device | Page | LCP now | LCP T011 | LCP T055 | INP now | INP T011 | CLS now | CLS T011 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| desktop | price map | 2,384 | 652 | 668 | 152 | 48 | 0.004 | 0.029 |
| desktop | destination | 2,124 | 908 | 648 | 56 | 16 | 0.091 | 0.093 |
| desktop | trip | 5,816 | 1,320 | 1,452 | 72 | none | 0.005 | 0.005 |
| phone | price map | 5,496 | 2,180 | 2,120 | 608 | 160 | 0.008 | 0.007 |
| phone | destination | 8,216 | 2,564 | 2,180 | 88 | 56 | 0.309 | 0.309 |
| phone | trip | 7,840 | 3,476 | 2,780 | 248 | none | 0.008 | 0.008 |

Against the thresholds, on the phone: the price map fails LCP and INP and passes CLS. The destination page fails LCP and CLS and passes INP. The trip page fails LCP and INP and passes CLS. On desktop the price map and destination page pass LCP narrowly, the trip page fails LCP at 5.8 s, and everything else passes.

Individual runs vary a lot, which is why the median of three is used and why one run should not be read. Phone LCP on the destination page was 11,180, 5,228 and 8,216 ms across its three runs, and on the trip page 7,840, 14,260 and 7,076 ms. Phone INP on the price map was 608, 712 and 608 ms, consistent. Every run is in the JSON.

Slow 4G, phone only (`reports/perf_prod_slow4g_T200.json`): price map LCP 20,448 ms, INP 976 ms, CLS 0.144; destination page LCP 21,672 ms, INP 176 ms, CLS 0.309. The trip page is not measured on slow 4G, for the reason given above. Slow 4G is harsher than most visitors have, so it is context and not the headline. It does show that first paint is bandwidth bound, which the shard section below explains.

What the table says, in order of importance.

LCP on production is two to four times the loopback figure on every cell. Loopback was a floor and the gap is the real network, the data host and the Wikimedia hotlinks. The desktop trip page is the worst case, 5.8 s against 1.4 s. The LCP element is an image on five of six cells (the card image, the destination hero, the trip hero). On the phone trip page it is the `H1` title, so there the text waited on something the photo did not.

The destination page phone CLS of 0.309 is unchanged to three decimals from T011 and T055, so nothing in between touched it. It is the only failure that is a plain layout bug and not a payload problem. T011 filed it as a finding and no task has fixed it.

Phone INP on the price map is 608 ms, almost four times T011's 160 ms and three times the threshold. T055 saw the same direction (312 ms) and blamed one slow run, but all three runs here are 608 to 712 ms, so it is real. The harness interaction is typing in the search box and then switching to the map view, which mounts maplibre. This task does not split the two, so it cannot say which half costs the 600 ms.

Trip page INP is measured for the first time: 72 ms on desktop and 248 ms on the phone, which fails narrowly.

## Measured: no runtime fare reads against the live deploy (T056-b)

`verify_no_runtime_fares.mjs` serves `dist/`, so the same scratch approach applies: origin set to production, the static server removed, the production host classed as the app's own. The trace pass walks seven paths on desktop and phone (Explore on three origins, Destinations, a destination page, the trip planner walked to its priced legs, the day planner), fourteen traces in all. Source: `reports/fare_trace_live_T200.json`.

The trace passes all of its checks. No request went to a fare or travel API host and none to an unclassified host. The third parties seen were Google Fonts, Supabase, Wikimedia and flagcdn images, and the data host. Fare slices were read from `data.carta-europetravel.com`, two per path, so the trace is not vacuous, and the planner reached its priced legs. Fares in production are static slices from the data host, as T056 intended.

The static pass fails, and it fails on the repository, not on the deploy. Two network call sites are not in the harness's `CALL_SITES` list: `src/lib/overrides.js` line 267 (a data-host fetch) and `src/lib/paywallEvents.js` line 130 (a Supabase RPC call). Neither is a fare read. The list is stale, which is what the check exists to catch. Filed as T200-f.

## Measured: the 238 shard full load against the real data host (T059-c)

The live `boot.json` names 238 shards under `data.carta-europetravel.com/data/dest/`. Served with brotli they total 2,048,535 bytes. The largest is 39,379 bytes and the median 5,888. Of the 238, 165 are under 10 KB and 30 under 2 KB. Sizes came from a curl loop over the chunk urls (source `reports/shard_load_T200.json` holds the timings, the sizes are in this paragraph only). All 238 returned 200.

The app loads every shard before it renders the first card (the default `all` catalogue mode). Timed in a real browser against production, from navigation start, three runs per profile:

| Profile | Boot index done | First shard | Last shard | First card on screen |
|---|---:|---:|---:|---:|
| desktop | 241 to 471 ms | 524 to 945 ms | 1,069 to 1,619 ms | 1,287 to 2,044 ms |
| phone, 4x CPU, slow 4G | 2,049 to 2,107 ms | 4,385 to 5,651 ms | 16,032 to 16,559 ms | 24,361 to 24,729 ms |

All 238 requests completed in every run. On desktop the whole shard window is about a second, so the request count costs nothing visible: it is HTTP/2 on one host, and the first card appears within a second of the last shard. On the slow phone the window is about twelve seconds, which is 2 MB at 1.6 Mbit/s, and the first card then lands another eight seconds after the last shard, which is the 4x CPU merging 12 MB of records and rendering.

So SHARD_BYTES should not change. Raising it would cut the request count and win back the 235 KB compression penalty T059 estimated, which is about one eleventh of the 2 MB, so roughly a second and a half of the twelve on slow 4G and nothing on desktop. The cost that matters is that first paint waits for every shard, not how many there are. Viewport mode (`CATALOGUE_MODE`, T059) is the lever, and T271 is the task that uses it for first paint.

## Files touched

**Created (continent-app, branch `p11-core-web-vitals`):**
- continent-app/reports/perf_prod_T200.json
- continent-app/reports/perf_prod_slow4g_T200.json
- continent-app/reports/fare_trace_live_T200.json
- continent-app/reports/shard_load_T200.json

**Created (root repo, branch `p11-core-web-vitals`):**
- Execution/P11/T200-core-web-vitals.md

**Modified (root repo):**
- Execution/_OPEN.md (rows T200-a to T200-g added; T055-a, T056-b and T059-c closed)

No app code, harness, migration or config file was touched. The scratch scripts live in the session scratchpad and are not committed.

## Commands run

The scratch scripts were derived from the committed ones. From `continent-app/`, with the scratch copies outside the repo:

```bash
# prod_vitals.mjs: baseline_vitals.mjs with the loopback server removed,
# BASE=https://www.carta-europetravel.com, trip interaction = button[aria-expanded]
RUNS=3 OUT=prod_open.json node prod_vitals.mjs
RUNS=3 NET=slow4g OUT=prod_slow4g.json node prod_vitals.mjs

# prod_fares.mjs: verify_no_runtime_fares.mjs with the origin set to production
node prod_fares.mjs --json fares_live.json

# shards.mjs: loads /?tab=map and records every /data/dest/ response;
# sizes from curl -H "accept-encoding: br" over the 238 chunk urls in boot.json
node shards.mjs
```

## Config and secrets set

None. Network reads of the public site and the public data host only. No credentials, no writes.

## Before/after measurements

Before is T011 (loopback, 2026-09-23) and T055 (loopback, 2026-09-28). After is production on 2026-10-03, before T271. The full table is above. The movement is not a product regression, because the conditions changed from loopback to the real network. What this establishes is the true starting point for T271 and any later work.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First live fares run reported every own-host request as unclassified | The scratch copy classed only loopback as the app's own host | Classed `www.carta-europetravel.com` as self in the scratch copy |
| Static pass reported 19 unclassified call sites | The scratch copy compared forward slash paths with Windows separators | Resolved the roots with `path.resolve`; two real call sites remain, see T200-f |
| Trip page empty on slow 4G | Fixed six second settle, the trip had not opened | Cells discarded and reported as not measured |
| Fourteen shard size requests returned curl status 000 | Transient connection failures from Windows curl under 8 parallel requests | Retried serially, all 238 returned 200 |
| The fares JSON landed in the app root | The `--json` path is relative to the working directory | Moved into `reports/` |

## What is still open

All three pages fail Core Web Vitals on mobile (T200-a), which holds the phone LCP failures: they are image and payload bound and partly addressed by T271 and the picture rollout. The plain causes are filed separately: destination page CLS 0.309 (T200-b), price map INP 608 ms (T200-c), and trip page LCP and INP (T200-d).

The measurement must be repeated after T271 deploys, by the same method, and the harness should learn to point at a URL and give the trip page a real interaction so nobody needs a scratch copy (T200-e).

The no-runtime-fares harness needs two call sites added to its list (T200-f). Field data from CrUX or Search Console needs real traffic and the owner's access (T200-g).

## Rollback procedure

Nothing in the product changed. To remove this task, delete the four JSON files from `continent-app/reports/` and revert the report and register commit in the root repo. The closed rows can be reopened by setting their Status back to `open`.
