# T271 D4 speed: first paint from the rank tier, the destination page CLS, the trip page INP

## Task ID

T271

## Date

2026-10-03

## What changed

The Destinations and Explore screens no longer wait for the 238 destination shards before they paint. Until now the default build fetched every shard (12.2 MB raw, 2.1 MB gzip) because every screen ranks all of Europe by price, rating and kind, and ranking needs the record. There is now a third file beside the boot index and the shards, the rank tier at `/dest/_rank.json`. It carries, for every destination, exactly the fields those screens rank, filter, price and draw a card from. The first paint waits for the boot index and the rank tier, 2.7 MB raw and 0.47 MB gzip in two files. The shards follow once the page is idle, at low fetch priority, and the app swaps the lite records for the full ones once, when the last shard is in. On a throttled phone (Fast 4G, 4x CPU) the first Explore card appears in 3.9 s instead of 13.9 s, and the first Destinations card in 5.7 s instead of 14.5 s.

Nothing changes for a session that arrives through a link, a planner tab, or a place opened from a card. A shared link (`#dest=`, `#itin=`, a trail, a region, a shared trip and the rest) still waits for the full catalogue behind the loading screen, as before. The Trip planner and Day planner tabs show their usual loading pulse until the shards are in. An opened destination fetches its own shard first and appears when it lands. So every surface that reads a place in full still reads it in full.

The destination page on a phone no longer shifts. Its layout shift score was 0.309, the one failing Core Web Vital in T011. It is now 0.0001 to 0.0002. The cause was the head of the page drawing from the record while the dossier loaded: the intro grew from the one-line "known for" sentence to the dossier's two sentences, the fact strip gained its best months and bed price, and the planner buttons and the strip moved 45 px down. Everything below the badge row now appears once the dossier has answered, in its final shape. Content that appears moves nothing.

The trip page INP is measured for the first time, with a new harness beside T011's (T011's own sweep never produced an interaction there). The smaller items are done too: `stage-data.mjs` survives the Windows EPERM rename (T059-d), `sw.js` describes its `/dest/` rule correctly (T059-e), and the phone price-map INP and the map tiles have their wider samples (T055-d, T061-b).

## How it works

### The rank tier

`RANK_FIELDS` in `src/lib/bootIndex.js` is the list. It names each field and how much of it ships: the whole value, or an object with some keys picked or omitted. Today it is city, country, tier, iata, anchor_airport, anchor_estimated, no_ryanair_route, city_lat, city_lon, country_rank, country_n, country_badge, tags, categories, blurb, transfer, driving_toll, costs, local_transport, place, crowding and accommodation in full; rating and beauty without their components; bathing_water without its nearest sites; image as url, w and h; climate as `best` only. Left out, and arriving with the shard: the climate table, the POI list (`activities`), the guide, members, designations, geonames, nature, the percentiles and the rest.

The file is columnar and pooled. It holds one array of distinct values per field and one row of indexes per destination, in boot row order, with -1 for an absent field. Pooling is what makes the cost inputs nearly free: the 3,868 destinations carry 90 distinct cost baskets, 150 local transport blocks and 257 accommodation blocks, because most of those numbers are national. The pooled values are shared objects in the browser; nothing in the app writes into a destination record (a grep for assignments found only `cityResearch.js` building a new record).

A rank file belongs to one boot index. `scripts/sync-data.mjs` hashes `boot.d` (sha256, 12 characters) and writes the hash into both files, as `boot.rank.key` and `rank.key`, and the boot index also names the file's content hash (`boot.rank.hash`, sent as `?v=`). `decodeRankTier` refuses a file whose key, version or row count does not match. A refused or missing rank tier costs only the fast first paint: `ensureRank()` resolves false and the app loads every shard first, exactly as before T271. That also covers an old boot index cached by the service worker and a deploy whose data upload has not happened yet.

`sync-data.mjs` proves the tier on every build, the same way it proves the shard split. It decodes the rank file against the boot index it just wrote and checks every listed field of every lite record against the full record; one mismatch fails the build. `node scripts/sync-data.mjs --split-only` runs the split step alone from the `public/app_data.json` on disk, for a checkout without the master dataset, which is how this worktree built it.

### Lite records and the swap

`mergeCatalogue(boot, shards, lite)` fills every row whose shard has not arrived with its rank record plus `_lite: true`, and marks the result `partial: true` at the top, where it survives `hydrateForOrigin`'s copy. The store in `catalogue.js` gains `ensureRank()`; its `snapshot()` includes the lite records once the tier is in.

In `appData.js`, `firstPaintPromise` replaces `appDataPromise`. In the default mode it is the rank tier's snapshot, or the full catalogue when there is no usable tier. `useAppData` renders from it, then schedules `loadFullCatalogue({ background: true })` with `requestIdleCallback` (2 s timeout). Background shards are fetched with `priority: 'low'`, so they queue behind what the visible screen asks for. Without that, the 238 shards held the journeys index back by about five seconds on the throttled phone and the Destinations cards came no sooner than before (11.2 s against 12.2 s). The hook subscribes to the store and replaces `raw` once, when `isComplete()`. It also returns `needRecords(ids)`, which fetches named shards now and puts those places in full into the snapshot.

`tests/rankTier.test.mjs` is the promise that the swap moves nothing. Over the real published split it prices every destination with `composeTrip` from the lite record and from the full record, under four sets of choices (plane and car, one to five people, home, hotel and dorm, two lifestyles), and requires identical JSON. It does the same for `computeCosts` and for every field the two list hooks copy into their rows. The first run caught one difference: `accommodationPerPerson` reads the neighbourhoods for a displayed range, so accommodation now ships whole (pooling makes it cheap).

The rest of the default screens were checked by tracing, not by reading. A temporary proxy over the lite records, in the Vite dev server only, logged every read of a key the lite record lacks while a Playwright session browsed both screens at 1440 and 380 px: first load, scrolling, Explore, the search box, hovering and pinning a card preview, opening a destination with all folds expanded, every Destinations category and a card in it, the Lifestyle panel and My trips. Two real misses came back, both on hover surfaces: the card preview's sights line and the map tooltip's lead read `activities.items`, and the water badge's tooltip reads `bathing_water.nearest`. Both fill in when the shard lands, seconds after the first paint. Shipping the three sights per place would add 594 KB raw to the tier, so they stay in the shard (row T271-a). The proxy was removed before the commit.

### App gating

`App.jsx` decides once, at load, whether the session arrived through a link (`linkedAtLoad`, the existing `deepLinked` test). If it did, a partial catalogue counts as not loaded and the loading screen stays, and the full load starts at once. A planner tab opened while partial shows `TabFallback` and starts the full load. The shared trip view gets no destinations while partial. A selected place renders only once its record is not lite; the selection effect asks for its shard through `needRecords`.

### The destination page

`DestinationPage.jsx` computes `settled = !loading` from the dossier hook and renders the intro paragraph, the head actions, the fact strip and the section grid only when settled. The gallery, the title row, the country line and the badge row draw at once, as before. A failed dossier (null) settles too, and the page draws from the record as it did. Measured with a layout-shift probe that names the moved nodes, on the dev server with the T011 phone profile: 0.3030 before, 0.0003 after.

### The two small fixes

`scripts/r2/stage-data.mjs` (T059-d, the one rule-4 file this task was allowed) now moves each `R2_TIER` entry through `moveEntry`: the rename is retried six times on EPERM, EBUSY, EACCES or ENOTEMPTY with a pause doubling from 0.25 s (about 16 s in all), each retry logged, and if the directory is still refused it is copied and the source deleted. The split build that failed for T059 unless `vite build` and `stage-data.mjs` ran as two steps passed here as one `npm run build`, moving 17 entries and 52,311 files. The retry log line was added after that build, so whether a retry fired in it is not known.

`public/sw.js` (T059-e) now says its `/dest/` rule keeps one cached copy per path, which is per region shard and one for the rank tier, and why a stale pairing is safe. Only comments changed; `CACHE_VERSION` stays `carta-v7`.

### Measurement scripts

T011's `baseline_vitals.mjs` and T061's `tiles_and_paint_T061.mjs` are unchanged, as the prompt asked. Three scripts sit beside them in `scripts/perf/`, each on the same method (the real `dist/` over a plain static server, the T011 seeds, cold contexts, the 390x844 phone at 4x CPU):

- `trip_inp_T271.mjs` measures the trip page INP with a real interaction (open and close the first three folds, pick a stop, scroll) and records the worst interaction of each step.
- `first_card_T271.mjs` serves the same dist in two arms, A with `/dest/_rank.json` answered 404 (the pre-T271 path) and B as built, under a 150 ms, 1.6 MB/s throttle with gzip, and records the time to the first card and the bytes received by then.
- `tiles_reopen_T271.mjs` runs T061's map session twice in one tab with the list in between, and counts tiles per half and how many the HTTP cache served.

`scripts/verify_data_host.mjs` now counts the shards without the rank file and requires the rank file to come from the data host.

## Files touched

App repo (`continent-app/`), branch `p3-d4-speed`, commit `3a1f5b6` on top of `19c8dd7`:

**Modified:**
- continent-app/src/lib/bootIndex.js (RANK_FIELDS, buildRankTier, decodeRankTier, lite merge)
- continent-app/src/lib/catalogue.js (loadRank, ensureRank, lite snapshot)
- continent-app/src/lib/appData.js (fetchRank, firstPaintPromise, low-priority background shards)
- continent-app/src/hooks/useAppData.js (paint from the rank tier, one swap, needRecords)
- continent-app/src/App.jsx (gating for links, planners, the selected place)
- continent-app/src/browse/DestinationPage.jsx (settle before the head and the body)
- continent-app/scripts/sync-data.mjs (writes and proves the rank tier, --split-only)
- continent-app/scripts/r2/stage-data.mjs (retrying move, EXCEPTION to rule 4 for T059-d)
- continent-app/scripts/verify_data_host.mjs (rank file counted apart)
- continent-app/public/sw.js (comment only, T059-e)
- continent-app/reports/perf_baseline_T011.json (re-run, after)
- continent-app/reports/tiles_and_paint_T061.json (re-run, after)

**Created:**
- continent-app/tests/rankTier.test.mjs
- continent-app/scripts/perf/trip_inp_T271.mjs
- continent-app/scripts/perf/first_card_T271.mjs
- continent-app/scripts/perf/tiles_reopen_T271.mjs
- continent-app/reports/trip_inp_T271.json
- continent-app/reports/first_card_T271.json
- continent-app/reports/tiles_reopen_T271.json

Root repo, branch `p3-d4-speed`:

**Created:**
- Execution/P3/T271-d4-speed.md

**Modified:**
- Execution/_OPEN.md (eight rows closed, rows T271-a to T271-e added)

**Deleted:**
- None.

Generated and gitignored, not committed: `continent-app/public/boot.json`, `public/dest/` (now 238 shards plus `_rank.json`). The root repo's tracked copies of the app files are left for the orchestrator's mirror commit.

## Commands run

From `continent-app/` in the app worktree unless noted.

```bash
npm run build                                       # before: the branch's starting code
node scripts/perf/baseline_vitals.mjs               # before
RUNS=7 node scripts/perf/tiles_and_paint_T061.mjs   # before
node scripts/perf/trip_inp_T271.mjs                 # before (first version, no per-step labels)

node scripts/sync-data.mjs --split-only             # boot.json, 238 shards, dest/_rank.json, both proofs
node --test tests/rankTier.test.mjs                 # 8/8
npm test                                            # 112/112
npx eslint src                                      # 0 errors

npx vite --port 5201 --strictPort                   # the trace and the CLS probe (temporary scripts, deleted)

VITE_DATA_BASE=http://127.0.0.1:4391/data CARTA_SKIP_CSP_CHECK=1 npm run build   # one step, no EPERM
node scripts/verify_data_host.mjs                   # OK, 7 routes
rm -rf dist dist-data

npm run build                                       # after
node scripts/perf/first_card_T271.mjs
node scripts/perf/baseline_vitals.mjs
RUNS=7 node scripts/perf/tiles_and_paint_T061.mjs
node scripts/perf/trip_inp_T271.mjs
ONLY=price-map RUNS=9 node scripts/perf/baseline_vitals.mjs     # T055-d, arm B
mv dist/dest/_rank.json ..; ONLY=price-map RUNS=9 node scripts/perf/baseline_vitals.mjs   # arm A
node scripts/perf/tiles_reopen_T271.mjs
VITE_CATALOGUE=viewport npm run build; RUNS=7 node scripts/perf/tiles_and_paint_T061.mjs  # T061-b
rm -rf dist dist-data
```

## Config and secrets set

None. No new build variable: the rank tier is used whenever the boot index names one. `VITE_CATALOGUE` stays unset (T059-a is the owner's).

## Before/after measurements

### What the first paint waits for

From the staged split build (`dist/boot.json`, `dist-data/dest/`), 3,868 destinations.

| Metric | Before | After | Delta |
|---|---|---|---|
| Files before the default screens paint | 239 (boot + 238 shards) | 2 (boot + rank tier) | -237 |
| Bytes before first paint, raw | 12,453,441 | 2,732,093 | -78% |
| Bytes before first paint, gzip -9 | 2,184,217 | 476,561 | -78% |
| Rank tier, raw / gzip | none | 2,504,678 / 392,240 B | new |
| Rank tier per destination, raw | none | 647 B (shards: 3,161 B) | |
| Same extrapolated to 25,000 destinations | about 80 MB | at most about 16 MB raw, 2.5 MB gzip | pooled fields grow slower than linearly |

### Throttled phone, time to the first card

`first_card_T271.mjs`, median of 3, both arms in one run on the same dist, 150 ms and 1.6 MB/s, 4x CPU, 390x844.

| Screen | A: pre-T271 path | B: rank tier | Delta |
|---|---|---|---|
| Explore, first card | 13,856 ms | 3,931 ms | -72% |
| Destinations, first card | 14,520 ms | 5,681 ms | -61% |
| Explore, KB on the wire by then | 2,886 | 1,361 | -53% |
| Destinations, KB on the wire by then | 2,786 | 2,015 | -28% |
| Shards received by the first card | 240 | 56 to 95 | |

A first B run, before the background shards went to low priority, gave Explore 5.7 s and Destinations 11.2 s: the shards were starving the journeys index.

### Core Web Vitals, T011's harness unchanged

Median of 3 per cell, loopback, no network throttle. Before was measured at the start of the task on the starting code. After is the final code. Ten sessions share this laptop tonight, so the absolute figures move with the load: the trip page, whose load path this task does not change, measured 2,904 then 4,612 ms desktop LCP across the evening. Read the LCP and INP rows as noise-bound. The CLS rows are not noise.

| Metric | Before | After, first run | After, final | Delta, before to final |
|---|---:|---:|---:|---:|
| CLS, phone destination page | 0.3086 | 0.0001 | 0.0002 | -0.308 |
| CLS, desktop destination page | 0.0905 | 0.0099 | 0.0099 | -0.081 |
| CLS, phone price map | 0.1442 | 0.0074 | 0.0075 | -0.137 |
| CLS, desktop price map | 0.0285 | 0.0268 | 0.0041 | -0.024 |
| CLS, phone trip page | 0.0084 | 0.022 | 0.0242 | +0.016 |
| LCP, desktop price map | 2,880 ms | 1,104 ms | 1,248 ms | -1,632 ms |
| LCP, phone price map | 4,856 ms | 2,396 ms | 3,664 ms | -1,192 ms |
| LCP, desktop destination page | 2,432 ms | 1,768 ms | 3,672 ms | noise |
| LCP, phone destination page | 4,416 ms | 3,176 ms | 5,572 ms | noise |
| LCP, desktop trip page (load path unchanged) | 2,904 ms | 2,560 ms | 4,612 ms | noise |
| LCP, phone trip page (load path unchanged) | 5,336 ms | 4,676 ms | 6,796 ms | noise |
| INP, desktop price map | 96 ms | 56 ms | 112 ms | noise |
| INP, phone price map | 816 ms | 288 ms | 792 ms | noise, see T055-d below |
| INP, desktop destination page | 80 ms | 48 ms | 64 ms | noise |
| INP, phone destination page | 144 ms | 80 ms | 208 ms | noise |

The first after run is the same code without the low-priority background fetch, which only matters off loopback. The LCP element is still a photograph in every cell (`IMG.railcard-img`, `IMG`, `IMG.itin-photohero-img`). The phone price map's CLS of 0.144 is also gone, and the A/B below shows it is the rank tier that removed it: the pre-T271 path still scores 0.1441 in the same run. The trip page's phone CLS rose from 0.008 to 0.024 in both after runs, still far inside the 0.1 threshold; it is not explained yet (row T271-e).

T061's harness, unchanged, RUNS=7, median: phone FCP on Explore 868 ms before, 728 ms after; its "grid ready" (to the first card plus its fixed 1.5 s wait, on loopback) 6,481 ms before, 6,239 ms after. Loopback has no transfer time, so this is the parse and merge cost alone, and it is small next to the throttled result above.

### The trip page INP (T300-g)

`trip_inp_T271.mjs`, median of 3, 21 qualifying interactions per run. The page's load path did not change in this task, so these are the first figures, not a delta.

| Cell | Start of task build | After, first run | After, final |
|---|---:|---:|---:|
| INP, desktop trip page | 104 ms | 104 ms | 136 ms |
| INP, phone trip page | 624 ms | 264 ms | 368 ms |

Desktop is inside the 200 ms "good" line. On the phone the worst steps are picking a stop on the route (168 to 736 ms) and reopening the route fold, which mounts the map (200 to 728 ms). A breakdown of the event entries shows why: input delay 4 to 62 ms, the click handlers 0 to 214 ms, and the rest presentation delay, the next frame waiting behind MapLibre frames rendered in software WebGL by headless Chromium at 4x CPU. That is row T271-b.

### Phone price-map INP, wider sample (T055-d)

`baseline_vitals.mjs` unchanged with `ONLY=price-map RUNS=9`, both arms on the same final dist in one sitting: B as built, then A with `dist/dest/_rank.json` moved aside.

| Metric | A: pre-T271 path | B: rank tier |
|---|---:|---:|
| Phone INP, the nine runs sorted | 160, 168, 200, 256, 584, 600, 840, 1320, 1400 | 240, 376, 440, 440, 488, 832, 904, 1088, 1296 |
| Phone INP, median / 75th percentile | 584 / 840 ms | 488 / 904 ms |
| Desktop INP, median / 75th percentile | 104 / 120 ms | 128 / 136 ms |
| Phone LCP, median | 3,840 ms | 3,548 ms |
| Desktop LCP, median | 2,792 ms | 1,368 ms |
| Phone CLS, median | 0.1441 | 0.0075 |

T055's 312 ms was one draw from a spread that runs from 160 to 1,400 ms in either arm. The measured interaction opens the map view, which mounts MapLibre, and on this shared machine the spread is the software WebGL frames and the load of the other sessions. The rank tier does not move it in either direction. That answers T055-d; the number that would mean something is a GPU phone or field data (T271-b).

### Map tiles (T061-b)

T061's harness, unchanged, RUNS=7. The second and third rows are new builds; the last two rows come from `tiles_reopen_T271.mjs`, which runs T061's session twice in one tab.

| Session | Initial view | Added by zoom and pan | Session total (median) | Per-run totals |
|---|---:|---:|---:|---|
| Default mode, start of task | 2 | 15 | 17 | 15, 17, 17, 17, 17, 17, 17 |
| Default mode, final | 2 | 13 | 15 | 11, 11, 15, 17, 17, 17, 15 |
| Viewport mode (`VITE_CATALOGUE=viewport`) | 2 | 13 | 15 | 15, 15, 15, 15, 17, 12, 17 |
| Default mode, map closed and opened again | | | 17 requests, 17 from the browser cache | 3 runs |
| Viewport mode, map closed and opened again | | | 15 requests, 15 from the browser cache | 3 runs |

The viewport catalogue does not change what the basemap costs: the tiles follow the camera, not the records. A reopened map costs Carto nothing, because Carto sends `cache-control: public,max-age=15552000` and the browser answers every repeat from its HTTP cache. The session count is now 11 to 17 rather than T061's steady 17, which reads as the double-click timing under this evening's load; the band, not a single number, is the figure to keep.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The lite and full prices differed for Brussels | `accommodationPerPerson` reads the neighbourhoods for its displayed range, and the first field list omitted them | accommodation ships whole; pooled, it costs about 100 KB |
| Destinations cards came no sooner with the rank tier (11.2 s against 12.2 s) | The 238 background shards, at auto priority, queued ahead of the journeys index on the throttled link | Background shards fetch at `priority: 'low'`; first card 5.7 s |
| The trace proxy broke the dev build | A Python edit through a bash heredoc turned `\n` into a newline inside a JS string | Used `String.fromCharCode(10)`; the proxy is gone now |
| A build ran with half the edits stashed | `git stash` for a lint comparison while `vite build` was reading `src/` | Stopped the build and its orphaned Vite processes, rebuilt from the restored tree; every after figure is from the rebuild |
| `tiles_reopen` first counted 0 tiles | MapLibre fetches tiles in a worker, which the page's DevTools Network domain does not see | Counted with Playwright's request events, as T061 does |
| Every reopened tile looked like a network fetch | Playwright reports a server address even for a cached response | A tile whose first byte arrived within 5 ms of the request is counted as cached |

## What is still open

T271-a. On the lite records the card preview's sights line, the map tooltip's lead and the water badge tooltip lack `activities.items` and `bathing_water.nearest` for the seconds until the shards land, so a preview opened in that window reads differently once they arrive. Adding the three sights per place to the rank tier would cost 594 KB raw. Whether that is worth it, or whether the preview should ask for its card's shard through `needRecords`, is a next-task call; the preview lives in `ExploreTab.jsx`, which T312 is editing this wave.

T271-b. The trip page INP on the phone is dominated by presentation delay, not by Carta's handlers: the click handlers take 0 to 214 ms at 4x CPU, and the next frame waits behind MapLibre frames that headless Chromium renders in software WebGL (SwiftShader). That inflates every map interaction in these harnesses. The honest number needs a phone with a GPU or field data after launch.

T271-c. Production gets the rank tier only with the next data upload and deploy. `dest/_rank.json` sits inside the `dest` entry of `R2_TIER`, so `stage-data.mjs` moves it and `push-data.mjs` uploads it, with the `/dest/*` caching rule; no rule-4 file needed a change. Upload phase 1 before the Pages deploy, as always. If the deploy goes first, the app falls back to the full load, so the order costs speed, not data.

T271-e. The trip page's phone CLS rose from 0.008 to 0.022 and 0.024 in both after runs of T011's harness (and from 0.009 to 0.019 in `trip_inp_T271.mjs`). It is still a quarter of the 0.1 threshold. The page's load path is unchanged, so the likely cause is the full load now starting a beat later (after the rank tier, from App's effect) and the page's first render landing on the other side of a font swap; that was not checked.

T271-d. At 25,000 destinations the rank tier extrapolates to at most about 16 MB raw (2.5 MB gzip). That is a fifth of the shards, but it is not under the 2 MB the architecture document wants for a boot payload. The next step is the one T059-b pointed at for the long run: P15's pin tiles, and a per-region rank file for the viewport mode, which still waits on the owner (T059-a).

The destination page on a phone still overflows sideways: in the 390 px check the PDF button and the "Open in Google Maps" chip run past the right edge. That is register row T281-a (open, the `.destp-pdf` width in `styles.css`), which this task did not touch; it is named here only because the CLS fix was checked on that screen.

The rows this task closes: T054-d, T055-c and T059-b (the default screens paint from the rank tier; P15's pin tiles remain P15's), T055-d, T059-d, T059-e, T061-b and T300-g. T059-a stays open with the owner.

## Rollback procedure

Nothing is live until the owner deploys a build that contains this branch. After that, reverting the app commit restores the full load before the first paint; the rank file left on R2 is ignored by the old code and removed by the next prune.

```bash
cd continent-app
git revert 3a1f5b6                     # or, before the merge: git branch -D p3-d4-speed
npm run data                          # rewrites public/boot.json without a rank entry
cd ..
git revert <the T271 report commit>
```

Reverting only the destination page part is safe on its own: it is one file and touches no data. If a deployed rank tier ever misbehaves without a code revert, delete `dest/_rank.json` from the bucket: every client then fails the fetch and loads the shards as before.
