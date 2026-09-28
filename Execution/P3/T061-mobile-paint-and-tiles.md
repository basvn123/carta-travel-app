# T061 Measure mobile first paint and map tiles per session

## Task ID

T061

## Date

2026-09-28

## What changed

Nothing in the product changed. This task recorded two numbers section 5.4 of `CARTA_CLOUD_ARCHITECTURE.md` and the Unit Economics plan both depend on and that no earlier report measured: first paint on a phone profile, and how many Carto vector tile requests a real Explore-map session generates.

Section 5.4 keeps Carto's hosted basemap over self-hosting one reason: it is free today. The section says to revisit "only if Carto changes terms." That is a decision with no number behind it until someone has measured how many tile requests a session actually makes, because that is the figure a self-hosting cost (a Planetiler build, ~15 GB of storage, R2 egress if traffic ever left Cloudflare) would have to be priced against. The Unit Economics plan treats it the same way: every other usage line in that document (AI calls, egress, storage) has a per-unit cost model; the basemap has never had one because nobody had counted the units. This task exists to turn "the basemap is free" from an assumption into a number that can be watched.

First paint (FCP) is the other half. T011 measured LCP on three pages but never first-contentful-paint, and FCP is closer to what "first paint" means literally: the moment anything renders, before the largest element has necessarily arrived. It is measured here on the same phone profile T011 used (390x844 viewport, 4x CPU throttle) so the two reports read side by side.

Both numbers came out low, and both are explained by the same fact: the Explore map opens at zoom 3.7, centred on all of Europe (`src/browse/ExploreMap.jsx:184-185`). At that zoom the whole continent is covered by two vector tiles. A session that never zooms in requests two tiles and nothing more. A session that drills from the continent toward a city — the thing Explore's cluster-tap zoom (`ExploreMap.jsx:231-235`) exists to let a visitor do — requests roughly nine times that, because each step to a higher zoom band is a new, larger set of tiles over a smaller area. The number that matters for pricing self-hosting is the second one, because a visitor who never opens the map costs nothing and was never going to be the reason Carto's terms mattered.

## How the numbers were produced

The harness is `continent-app/scripts/perf/tiles_and_paint_T061.mjs`, built on the same pattern as T011's `baseline_vitals.mjs`: a plain static server over the real `dist/`, a phone context at 390x844 with a 4x CPU throttle, a cold context per run, and FCP read from the browser's own `paint` timing entries through a buffered `PerformanceObserver` rather than a load event.

The session simulated is: land on Explore (the card grid), tap the phone's floating view toggle to open the map, let the basemap load, then five double-clicks on the map's centre followed by one drag. The double-click is doing specific work here. The first attempt used a wheel event to simulate zooming, because that is what a trackpad or mouse wheel session looks like, but MapLibre's wheel handler interprets a synthetic wheel event's delta inconsistently — the same script, run three times, advanced the zoom by different, unpredictable amounts, which made the tile count noise rather than a measurement. A double-click is deterministic: MapLibre's built-in `doubleClickZoom` handler (on by default, not something the app configures) advances exactly one zoom level per click regardless of how Chromium's automation layer dispatches the event. Five double-clicks reliably walk from the continent view toward a city view, and across seven runs it produced exactly the same tile count every time — 17 — which is the kind of stability that means the number describes the interaction, not the harness.

Tile requests are counted by matching the request URL against the pattern MapLibre actually fetches, not a guess at it. The Voyager style's `sources.carto.url` points at `tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json`, and that document's own `tiles` array names four round-robin hosts (`tiles-a` through `tiles-d`.basemaps.cartocdn.com) serving `{z}/{x}/{y}.mvt` — `.mvt`, not the `.pbf` extension the vector tile spec's generic name would suggest. The harness's classifier was written against a guess at first (`.pbf` or a `/tiles/` path segment) and it undercounted to zero on the first run for that reason; it was fixed by fetching the style and its `tiles.json` directly and matching what they actually said, and now separates tile requests from the style document, the sprite and the glyph fetches, because those three are each paid once per session regardless of how much the visitor pans and don't belong in a usage-scaling number.

Two mobile-specific realities cost real debugging time and are worth recording so a re-run does not lose them. T011's phone pass opens the map view through a `.xbar .xview-toggle button` selector, which is desktop chrome; `ExploreTab.jsx:842-844` is explicit that on a phone the grid/map switch is a separate floating control, `.xview-fab`, above the bottom nav where a thumb can reach it. Using T011's selector against a 390px viewport clicks nothing and silently never opens the map — T011 itself never treats this as a failure because it only uses the map-open step as an optional "interaction," but a script whose entire purpose is counting map tiles has to catch that miss, and the first run of this harness did not. Separately, `public/boot.json`, `public/dest/` and `public/poi/` are pipeline-generated and gitignored; a fresh checkout of the repository has none of them, and without `boot.json` the app never gets past its own "we couldn't load Carta's travel data" screen, so first paint and tile counts cannot be measured from a clean clone without first copying those three paths in from a checkout that has run the data pipeline.

## Files touched

**Created:**
- `continent-app/scripts/perf/tiles_and_paint_T061.mjs`
- `continent-app/reports/tiles_and_paint_T061.json`
- `Execution/P3/T061-mobile-paint-and-tiles.md`

**Modified:**
- None.

**Deleted:**
- None.

## Commands run

```
cd continent-app
npm install                                        # fresh worktree, see "What broke"
npx playwright install chromium                    # revision 1228 not in the shared cache
npm run build
RUNS=7 node scripts/perf/tiles_and_paint_T061.mjs
```

`RUNS` defaults to 3; 7 was used here once the double-click approach proved stable, to confirm the tile count was not a coincidence of one run.

## Config and secrets set

None. The harness seeds the same three localStorage keys T011's script seeds (`continent.lang.v1`, `continent.guestMode.v1`, `carta.welcomeSeen.v1`) so the welcome overlay never blocks the measured session.

## Before/after measurements

Neither number has a prior measurement to compare against; T011 did not capture either one, which is the gap this task closes. "Before" below is therefore this task's own figure, in the same place T011 left "pending P3" cells, and "After" is pending the re-measurement at launch the task's done condition asks for.

| Metric | Before (this task, pre-launch) | After (at launch) | Delta |
|---|---:|---:|---|
| First paint (FCP), phone, Explore | 912 ms (median of 7) | pending launch | |
| Grid ready, phone, Explore | 8,246 ms (median of 7) | pending launch | |
| Carto tiles, initial map view | 2 | pending launch | |
| Carto tiles, after zoom + pan | +15 | pending launch | |
| Carto tiles, full session | 17 | pending launch | |
| Style document requests, per session | 1 | pending launch | |
| Sprite requests, per session | 2 | pending launch | |
| Glyph requests, per session | 10 | pending launch | |

Read against T011: T011's median phone LCP on the price map (now Explore) was 2,180 ms. FCP at 912 ms sits well before that, which is the expected order — first paint has to precede the largest paint — and confirms the two harnesses are measuring the same page consistently rather than contradicting each other. T011 did not open the map in a way that reached MapLibre reliably (see "What broke"), so it has no comparable tile figure at all; this task's 17-tile session number is the first one on record, not a delta against a prior measurement.

The FCP figure varied more than the tile count across runs (488 ms to 1,152 ms across seven runs), which is expected: first paint depends on whatever the event loop is doing at that instant, while the tile count depends only on how many zoom levels five deterministic double-clicks cross, which is fixed by MapLibre's own handler.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The working tree was checked out to a different task's branch mid-task, with unrelated files (`src/App.jsx`, `src/components/PrivacyPolicy.jsx`, others) showing as modified | A second `run_queue.ps1` instance is running against the same checkout; `_OPEN.md` row T059-f already names this exact collision (two runners, PIDs 22284 and 30708, started minutes apart on 2026-09-28) and marks it open and unowned | Did not touch the shared tree further. Added `git worktree add ../TravelApp-T061 -b p3-mobile-paint-tiles p3-reduce-poi-payload` from T060's tip, did every remaining step (build, measure, report, commit) in that isolated worktree, and removed the two untracked files this task had already dropped into the shared tree before discovering the collision |
| `dist/index.html` disappeared partway through the first build attempt | The concurrent driver's own `npm run build` was running against the same `dist/` at the same time and had just cleaned the output directory | Same fix as above: moved entirely to the isolated worktree, which has its own `dist/` |
| Fresh worktree app showed "we couldn't load Carta's travel data" and never rendered the grid | `public/boot.json`, `public/dest/` and `public/poi/` are gitignored pipeline output; a `git worktree add` gives a clean checkout with none of them | Copied the three paths from the original checkout's `public/` into the worktree's `public/` before building |
| Playwright's `chromium.launch()` failed with "Executable doesn't exist ... chromium_headless_shell-1228" | The worktree's `npm install` resolved a newer Playwright than whatever last populated the shared `ms-playwright` cache (which only had revisions 1217 and 1243) | `npx playwright install chromium` in the worktree, which fetched revision 1228 |
| First tile count came back 0 on every run | The classifier matched `.pbf` and `/tiles/`; Carto's actual vector tiles are served as `{z}/{x}/{y}.mvt` from `tiles-{a..d}.basemaps.cartocdn.com`, per the style's own `tiles.json` | Fetched the style and its `tiles.json` directly to read the real pattern, matched `.mvt` as well as `.pbf` |
| Map never opened on the phone viewport, so every tile-related figure read null | The script's first version reused T011's `.xbar .xview-toggle button` selector, which is desktop-only chrome; on a phone the switch is `.xview-fab` (`ExploreTab.jsx:844`) | Used `.xview-fab button` on the phone profile |
| Tile count depended on which run it was (wheel-zoom version gave 0, 1, then eventually non-zero counts across attempts) | A synthetic `mouse.wheel` event's delta is interpreted by MapLibre's zoom handler inconsistently outside a real trackpad or mouse, so the resulting zoom level was not reproducible | Replaced wheel-zoom with five `mouse.dblclick` calls on the map centre, which trigger MapLibre's built-in `doubleClickZoom` handler and reliably advance exactly one zoom level each; the tile count was identical (17) across all seven runs afterward |

## What is still open

The field caveat T011 recorded applies here unchanged and is not repeated in depth: the server is on loopback and the network is not throttled, so these are floor figures for payload and render cost, not round-trip time to a phone on a real network or to `tiles.basemaps.cartocdn.com` from outside a datacenter. A field measurement needs either real-user monitoring after launch or a throttled run against the deployed site; this task's method matches T011's so the two stay comparable, but neither is a substitute for that.

"A real mid-range phone," as the task names it, was not available in this environment; both figures come from Chromium's own 4x CPU throttle and a 390x844 viewport, the same stand-in T011 uses and for the same reason (`scripts/perf/profile.mjs` already treats 4x this way). If a physical device becomes available, re-running against it is the more honest number, and the harness's server-and-seed setup would carry over unchanged; only the throttle step would need to be replaced with a real device.

The 17-tile figure is for one representative session (open Explore, zoom from the continent toward a city, pan once) on the default catalogue mode. It has not been measured against T059's viewport-loading catalogue mode (`VITE_CATALOGUE=viewport`, still undecided per `_OPEN.md` row T059-a) or against a session that opens the map, closes it, and reopens it, which MapLibre's own tile cache may serve for free the second time. Both are cheap follow-ups once whoever owns T059-a decides which catalogue mode ships.

This task's own done condition — "both numbers recorded and re-measured at launch" — is only half met by design: the "before" half is this report, and the "after" half cannot exist until there is a launch to measure. Whoever re-runs this at launch should re-run `tiles_and_paint_T061.mjs` unchanged, the same discipline T011 asks for its own harness, so the comparison is a real one and not two different measurement methods being read as if they agreed.

The two untracked files this task added to the shared working tree before discovering the branch collision (a copy of the script and its JSON output) were deleted from that tree rather than left there uncommitted, so the other driver's task does not see them as accidental staged content in its own status. They exist correctly, and were committed, only in this task's own worktree.

T059-f, the duplicate-queue-runner collision, is still open and still unowned as of this task; it is the same root cause this task hit directly. It is not this task's to close (no file naming it belongs to T061's scope), but it is worth restating here because it cost this task a rebuild and a full `npm install` in a second worktree to route around, and it will cost the next task the same thing if nobody stops the extra runner first.

## Rollback procedure

There is nothing to roll back in the product; nothing in `continent-app/src` changed. This task added one script, one JSON result file and this report, all net-new files.

To undo it completely:

```
git worktree remove ../TravelApp-T061 --force   # from the main checkout, once this branch is merged or discarded
git branch -D p3-mobile-paint-tiles
```

If the branch has already been merged, the three added files can be removed individually; no other file was modified, so nothing else is affected.
