# T059 Shard app data by region and viewport

## Task ID

T059

## Date

2026-09-28

## What changed

The destination records are now split into region shards instead of country files. The app loads them through a store that fetches a shard only when something needs a place inside it. There is also a new build mode in which the Explore map fetches shards as the reader pans.

Before this task, `public/dest/` held 43 files, one per country. Italy alone was 1.95 MB, and it would grow to about 12 MB at 25,000 destinations. A country is too coarse to count as "what is on screen". Now any country with more than 256 KB of records is cut into square grid tiles. The build picks the coarsest grid of 8, 4, 2 or 1 degrees that keeps every tile under the budget. That gives 238 shards, the largest 253 KB, and the size stays bounded as the catalogue grows.

In the default build nothing visible changes. The app still downloads every shard before its first paint, in parallel, exactly as after T054. The same test and harness suite passes, with the same pre-existing failures.

With `VITE_CATALOGUE=viewport` set at build time, the first paint waits only for the boot index and the shards within 300 km of the origin airport. From Charleroi, the default, that is 1.91 MB in 25 files, against 12.4 MB in 44 files before. The Explore map draws every pin in Europe from the boot index. Once the reader zooms in past the clusters, each pan fetches the shards that have just come on screen and nothing else. Every other tab still asks for the whole catalogue, because each of them ranks all of Europe. This mode is off by default: switching it on is a product decision, explained under What is still open.

Points of interest and routes needed no change. POIs were already one file per destination (`poi/<id>.json`, fetched by the day planner and the destination page for the place in hand). Trails, cycling, beaches, lakes, mountains and trips were already one file per country, loaded when a country is chosen. Accommodation is a field of each destination record, so it now travels in the region shards.

## How it works

### The shard rule

`shardKey(row, tiles)` in `src/lib/bootIndex.js` is the only rule, and the split, the merge and the store all call it. A boot row is `[id, lat, lon, cc, flags, band]`, as in T054. The boot index gains one field, `tiles`, which maps each tiled country to its grid size in degrees, for example `{ "IT": 1, "ES": 4, "FR": 2 }`. A row in a country without an entry, or a row with no position, belongs to the plain country shard (`BE`). Any other row belongs to `<cc>_<deg>_<floor(lat/deg)>_<floor(lon/deg)>`, for example `IT_1_41_12` for Rome. A boot index without `tiles`, as T054 wrote it, keys every shard by country, so an old cached index still merges.

`splitCatalogue` measures each record's serialised size and chooses the grid per country. When no grid brings every tile under the budget, it falls back to 1 degree. That happens for a very dense city, and also when the country shard of position-less rows is itself over budget. Today Italy and Great Britain are tiled at 1 degree, France, Germany and the Netherlands at 2, Spain at 4, and Portugal, Greece and Czechia at 8. The other 34 countries fit in one file each.

`scripts/sync-data.mjs` did not need editing: it writes whatever keys the split returns and still proves the round trip record by record. Its log line still says "country files" (238 of them). `BOOT_VERSION` stays 1, because the change is additive.

### The region store

`src/lib/catalogue.js` holds `createCatalogue({ loadBoot, loadCountry })`. Once the boot index arrives, the store indexes it: which shard each id lives in, and which shards have a destination in each 1-degree cell. A viewport is answered from the cells, not from country bounding boxes, which would pull all of France into a view of Andorra. Callers ask for what they need in their own terms: `ensureViewport(bbox)`, `ensureNear(lat, lon, km)`, `ensureIds(ids)` or `ensureAll()`. Each returns a promise for its shards. A shard in flight is shared, a loaded one is never fetched again, and a failed one is forgotten so the next ask retries it. `snapshot()` returns the records loaded so far as the usual `{ meta, destinations }`, in the master's order. It keeps the same object until another shard arrives, so it is safe as a React dependency. Subscribers are told of arrivals in batches of 60 ms, so a burst of shards re-prices the app once, not 238 times.

`src/lib/appData.js` creates the one store and keeps T054's fetch, with one retry per shard and the `?v=<hash>` cache key. In the default mode, `appDataPromise` is `loadFullCatalogue()`, started at module-evaluation time, so the app sees the same promise and the same object it always did.

### The viewport mode

`VITE_CATALOGUE=viewport` is read once, as `CATALOGUE_MODE` in `appData.js`. Nothing is fetched at module load except the boot index. Four places act on the mode.

`useAppData` makes the first paint wait for the shards within 300 km of the origin (`FIRST_PAINT_KM`), plus the shard of a place opened by id. From then on it subscribes to the store, so each arrival replaces `raw` with the larger snapshot. If the origin has no coordinates, it asks for everything.

`App.jsx` asks for the full catalogue whenever the active tab is not Explore, or when the session arrived through a deep link (a shared trip, a trail, a destination or region page, and the rest), because those screens rank or search all of Europe. It also loads the shard of the selected place.

`ExploreTab.jsx` asks for everything in the grid view. In the map view it decodes the boot index into pins and fetches `ensureViewport` on every map settle at zoom 6 or above (`DETAIL_FROM`), which is where the clusters end. Below zoom 6 the map shows clusters, which the boot pins already count correctly, so panning a continental view costs nothing.

`ExploreMap.jsx` accepts an optional `pins` prop. With it, every boot pin is a feature from the start. A pin whose record has not arrived carries `ld: 0`: it draws at the default size, stays visible through filters it cannot yet be judged on, and fetches its shard when hovered instead of showing an empty tip. Without `pins`, which is the default mode, the component builds exactly the features it built before.

The Explore view now rides the URL as `xw=map`, next to the filter keys the tab already writes. Without that, every Explore session would open on the grid and load the whole catalogue before the reader could reach the map. A map link opens on the map.

### Why a flag, and not the whole app

Every screen in the app, including the Explore map's own list beside it, is a list of places ranked across Europe by price, rating or cost. Ranking needs the full record, which is about 3.2 KB per destination, so the full download is inherent to the current screens. A first paint that shows a partial catalogue changes what those screens claim. The tier legend's counts, "nothing matches" messages and the order of the Destinations list would all briefly describe only the places near the origin. carta-design has no rule for a partial-catalogue state, so this task does not make that call. The mode is built, tested and measured, and it stays off until the owner decides.

## Files touched

App repo (`continent-app/`), branch `p3-shard-by-region-viewport`, commit `4fc5b3d`, on top of `0d48811` (T056).

**Created:**
- continent-app/src/lib/catalogue.js
- continent-app/tests/catalogue.test.mjs
- continent-app/scripts/verify_viewport_catalogue.mjs

**Modified:**
- continent-app/src/lib/bootIndex.js (shardKey, tiled split, merge by shard)
- continent-app/src/lib/appData.js (the store, CATALOGUE_MODE, loadFullCatalogue)
- continent-app/src/hooks/useAppData.js (first paint by radius in viewport mode)
- continent-app/src/App.jsx (full catalogue off the Explore tab, selected place's shard)
- continent-app/src/browse/ExploreTab.jsx (grid asks for all, map asks by viewport, xw=map)
- continent-app/src/browse/ExploreMap.jsx (optional boot pins, zoom in onViewport, onNeedDetail)

Root repo, branch `p3-shard-by-region-viewport`: commit `34f664820` mirrors the nine app files. The report commit carries:

**Created:**
- Execution/P3/T059-shard-by-region-viewport.md

**Modified:**
- Execution/_OPEN.md (rows T059-a to T059-e)

**Deleted:**
- None.

Generated and gitignored: `continent-app/public/boot.json` and `continent-app/public/dest/` (now 238 files) were rewritten by `npm run data`. No tracked data file changed. `scripts/sync-data.mjs`, `src/lib/origins.js`, `src/components/PrivacyPolicy.jsx` and `src/data/attribution.js` held uncommitted work from earlier sessions when this task started (T057's fare metadata edit is in the first two). They were left untouched and unstaged in the app repo.

## Commands run

From `continent-app/` unless noted.

```bash
git checkout -b p3-shard-by-region-viewport          # both repos
node scripts/sync-data.mjs                           # 238 shards, round trip exact
node --test tests/catalogue.test.mjs                 # 9/9
npm test                                             # 92/92 (includes T054's wireSplit)
npx eslint <the touched files>                       # no new warnings

VITE_CATALOGUE=viewport npm run build
node scripts/verify_viewport_catalogue.mjs           # OK, port 4396

VITE_DATA_BASE=http://127.0.0.1:4391/data CARTA_SKIP_CSP_CHECK=1 npx vite build
# pause ~45 s, see "What broke"
VITE_DATA_BASE=http://127.0.0.1:4391/data CARTA_SKIP_CSP_CHECK=1 node scripts/r2/stage-data.mjs
node scripts/verify_data_host.mjs                    # OK, 7 routes

rm -rf dist-data && npx vite build && node scripts/r2/stage-data.mjs   # same-origin dist for other sessions
node scripts/ci/smoke.mjs                            # 9/9 routes
npx vite preview --port 4173 --strictPort &
node scripts/verify_explore.mjs                      # 28/30, the pre-existing two
```

The measurements below came from a throwaway node script that drove `createCatalogue` over `public/boot.json` and summed the file sizes in `public/dest/`, raw and `gzip -9`. It was not kept. The committed test asserts on the same figures.

## Config and secrets set

One new build variable, `VITE_CATALOGUE`. It is unset everywhere, which means the default full load. Set it to `viewport` only after decision T059-a. No secrets.

## Before/after measurements

Before is the T054 wire on this branch's starting commit: 43 country files, all loaded before the first paint. After is this branch, 3,868 destinations in both.

| Metric | Before | After | Delta |
|---|---|---|---|
| boot.json | 221,859 B (81,248 B gzip) | 227,363 B (83,615 B gzip) | +5.5 KB, the `tiles` table and longer keys |
| boot.json extrapolated to 25,000 destinations | about 1.15 MB | about 1.19 MB | under 2 MB |
| Record shards | 43 country files | 238 region shards | +195 |
| Largest shard | 1,953,471 B (IT) | 253,083 B | -87% |
| All shards | 12,225,831 B (1,863,492 B gzip) | 12,226,026 B (2,098,732 B gzip) | gzip +235 KB, smaller files compress less well |
| Bytes before first paint, default mode | 12,447,690 B in 44 files | 12,453,389 B in 239 files | unchanged in substance |
| Bytes before first paint, viewport mode, origin CRL | not available | 1,911,223 B in 25 files (335,556 B gzip) | -85% against default |
| Same, origin AMS / MAD / WAW | not available | 1,576,633 / 983,638 / 533,027 B | |
| Shards fetched by panning the Explore map (harness, 6 steps) | 0 (everything already loaded) | 7, 2, 6, 13, 12, 2 per step, 42 in all, 2,361,819 B | every step incremental |
| Shards loaded after that pan | 43 of 43 | 66 of 238 (4,045,679 of 12,226,026 B) | |
| Same pan simulated with country files instead of tiles | | 7,330,160 B | tiles cost 41% less |

The harness pan starts at zoom 3.7 over Europe, zooms three steps to 6.7 over southern Germany, then pans west, south, east, south again, and back north. At the first paint the harness logged 24 shards from Charleroi; the first row of the table counts boot.json as the 25th file. Standing still at continental zoom fetched nothing. Switching to the grid then loaded all 238 shards and rendered.

"The boot payload is measured under 2 MB" holds in two senses. The boot index is 227 KB and extrapolates to about 1.19 MB at 25,000. In viewport mode, everything the first paint waits for is 1.91 MB from the default origin. In the default mode, the first paint still waits for the whole catalogue (12.2 MB, 2.1 MB gzip). That is T054-d, and this task narrows it without closing it.

Regression, default mode: `npm test` 92/92, `ci/smoke.mjs` 9/9 routes, `verify_explore.mjs` 28/30. The two failures, a desktop and a phone pass timing out on a locator, are the same count T052-g and T054 recorded before this task. The split build against the two-origin stand-in (`verify_data_host.mjs`) passes on all seven routes, with 238 of 238 shards from the data host and the Pages deploy at 61 files.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First paint in viewport mode was 5.06 MB from Charleroi | Country files: the 300 km radius pulled in all of France, Germany and Great Britain | Region tiles in the split. The same radius now costs 1.91 MB |
| The viewport harness could not find the map canvas | Overriding `navigator.serviceWorker` in an init script broke the app's boot | Block service workers with Playwright's context option instead |
| `npm run build` for the stand-in failed with EPERM renaming `dist/trips`, then `dist/cycling` | `stage-data.mjs` renames directories seconds after Vite wrote 52,000 files into them. No process held them, so this points to a Windows scanner lock. It is not caused by this task | Ran `vite build` and `stage-data.mjs` separately with a pause between them. Raised as T059-d |
| A test assertion expected BE and IT to tile at 2 and 8 degrees | Two Belgian fixtures share a 1-degree cell, and IT's position-less row is over budget at any grid | Corrected the test to the documented fallback (1 degree) |

## What is still open

Whether to switch the viewport mode on is the owner's decision (T059-a). Switching it on makes a map link and the first paint cheap, but for a moment every list shows only the places near the origin. That includes the tier legend's counts on the Explore map, which count the loaded shards. carta-design has no rule for a partial-catalogue state, so a loading treatment, or a decision that the brief partial list is acceptable, has to come first. To switch it on, set `VITE_CATALOGUE=viewport` in the Production environment and redeploy. To undo it, unset the variable.

The default screens still need every shard before they can rank Europe (T059-b, which narrows T054-d and T055-c without closing them). At 25,000 destinations that is about 80 MB raw. The fix this task points to is a ranking tier: put the few fields the lists sort and filter on (the cost inputs, rating, kind) in the boot index or a per-origin rank file. The lists can then render from the index and fetch each card's detail by shard, with the store built here. That is an architecture change to runtime pricing, and it pairs with P15's pin tiles.

The full-load path now makes 238 requests instead of 43, and the shards compress about 235 KB worse in total (T059-c). Over HTTP/2 on one host this should not matter, but it has not been measured against the real data host, which does not exist yet (T054-a to T054-c). If it does matter, raise `SHARD_BYTES` or tile only in viewport builds.

`scripts/r2/stage-data.mjs` fails with EPERM on this Windows machine when `postbuild` runs straight after a large Vite build (T059-d). Retrying the directory rename a few times, or copying and then deleting, would make it robust. The build box on Linux is unlikely to hit it.

`public/sw.js` still describes its `/dest/` rule as "one cached copy per country" (T059-e). The rule keys on the path, so it keeps one copy per shard and behaves correctly. Only the comment and the T054 report's wording are out of date. Fix it whenever `sw.js` is next touched.

T059 was launched twice (T059-f). Two copies of `Execution/_queue/run_queue.ps1` were running at once, started at 08:55 and 08:59 on 2026-09-28 (snapshots `run_queue.20260928_085549.ps1` and `run_queue.20260928_085904.ps1`, PowerShell PIDs 22284 and 30708). Each started its own T059 session, six minutes apart, in the same working tree. The second session saw the first one editing, stayed out of the tree, waited for it to exit, and made no code changes. The work above and its commits come from the first session alone. The two runners will keep racing on every later task, and two sessions editing one checkout can corrupt each other's commits. By 10:06 the 08:59 runner had already started T060. Stopping one runner is the owner's call and was not done here.

## Rollback procedure

In production nothing changes until a deploy includes this branch. Even then, the default build loads the full catalogue as before, and the shard layout is internal to the app and the upload.

To undo the code:

```bash
cd continent-app
git checkout p3-remove-fare-runtime-reads
git branch -D p3-shard-by-region-viewport      # or: git revert 4fc5b3d once merged
npm run data                                   # rewrites public/boot.json and 43 country files
cd ..
git checkout p3-flight-cost-input-decision
git branch -D p3-shard-by-region-viewport      # or revert 34f664820 and the report commit
```

The boot index and its shards are always built and shipped together, so a reverted build is consistent: its boot index has no `tiles` and names 43 country files. One edge is worth knowing. A browser whose service worker cached the tiled `boot.json` serves it stale-while-revalidate, and the reverted app code does not read `tiles`. For that one visit the tiled countries (IT, GB, FR, DE, NL, ES, PT, GR, CZ) are missing, and `appData.js` logs how many destinations had no record. The next visit has the fresh index. If that matters, bump `CACHE_VERSION` in `public/sw.js` in the revert. The 238 tile objects stay in the R2 bucket until the pruning phase (`push-data.mjs --prune`) removes them.
