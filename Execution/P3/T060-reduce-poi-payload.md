# T060 Reduce the POI payload and lazy-load map layers

## Task ID

T060

## Date

2026-09-28

## What changed

The finding, after auditing every place POIs and the ten layer directories (beaches, cycling, lakes, mountains, reach, region, trails, trips, dossier, destinfo) are read from, is that almost all of this ground was already covered by earlier tasks. One real violation remained: the reach-hours travel-time layer fetched itself at app boot on every session, regardless of whether the reader ever opened Explore. That is now fixed. Everything else described below is the audit trail, kept here so the next task does not re-walk it.

POIs are already as small as this task would have asked for. `scripts/sync-data.mjs` strips `activities.items_full` out of each destination record before it is written to the region shards (`sync-data.mjs:97-99`), and writes it instead to `public/poi/{destId}.json`, one file per destination, fetched only by `fetchDestPois`/`fetchDestPoiMap` in `src/lib/appData.js` when the day planner or the destination page opens that specific place. A city's whole POI shard is small: Amsterdam, the largest sampled, is 52 records and 13.4 KB; the average is 8.6 KB. No view fetches the 134,657-POI catalogue, or even one country's worth, at once. The fields in a record (name, kind, coordinates, rating, a one-line description, one image, a Wikipedia link for attribution, a significance score) are each read by at least one real consumer (the destination page's "best things to do" photo matching, the day planner's picker, the day explore builder's search), so there was no per-view subset to cut without breaking a feature or duplicating the file. No change was made here.

The ten layer directories are also already switched-on, not boot-loaded, everywhere that was checked: `src/browse/ExploreMap.jsx` and `src/map/TripMap.jsx` do not draw trail, cycling, beach, lake or mountain geometry at all today (those are separate pages, not map overlays, reached through `React.lazy` code-split routes in `DestinationsTab.jsx`); `DestinationsTab.jsx`'s nine category loaders are each gated on the active category tab; `CountryBrief.jsx`'s beach/trail/lake/mountain rails load together only once the reader opens "Things to do" (by design, one open action revealing several rails is normal here, not a bug); and `CountryBrief`'s "Best trips" fold is deliberately pre-opened (confirmed by `scripts/verify_country_brief.mjs`'s explicit SHAPE check and by task T4's history), so its eager fetch is a product decision, not the kind of boot-time layer arrival this task was about. A first attempt to close that fold by default was reverted once the test made the intent clear; see "What broke" below.

The one real gap: `public/reach/{IATA}.json`, the reach-hours filter's travel-time table, was fetched by `useReach(choices.origin)` in `App.jsx` unconditionally on every mount, before the reader had done anything. The reach filter's only control is a dropdown inside Explore's filter rail (`ExploreFilterRail.jsx`), and it is off by default (`reachHours` initialises to `null` in `useFilterState.js`). Since the app now opens on the Destinations tab by default, every session that never visits Explore, and every session that visits but leaves the filter alone, was paying for a file it could not use. The fetch is now gated on `activeTab === 'map'` or an already-set `reachHours` (so a shared link carrying `rh=` still resolves immediately, wherever it lands, exactly as before).

## Files touched

**Modified (continent-app/):**
- src/App.jsx (gate `useReach`'s origin argument on the Explore tab or a restored `rh` value)

**Modified (root repo):**
- Execution/_OPEN.md (no new rows; nothing this task found was both new and unowned, see "What is still open")

**Created:**
- Execution/P3/T060-reduce-poi-payload.md

## Commands run

From `continent-app/`.

```bash
git checkout -b p3-reduce-poi-payload          # both repos
npm test                                        # 92/92, unchanged
npx eslint src/App.jsx                          # pre-existing warnings only, no new ones
CARTA_SKIP_CSP_CHECK=1 npx vite build
npx vite preview --port 4173 --strictPort &
# a throwaway Playwright script counted /reach/ requests for four URLs,
# run once against this branch and once against the branch with the fix
# stashed out; not kept, the numbers are in the table below
node scripts/verify_explore.mjs                 # 28/30, same two pre-existing failures as T059
node scripts/verify_country_brief.mjs           # 34/35, same pre-existing phone timeout on baseline too
node scripts/verify_reach_filter.mjs            # already broken before this task, see "What broke"
node scripts/verify_places_tab.mjs              # already broken before this task (T052-g)
```

## Config and secrets set

None.

## Before/after measurements

Measured with a throwaway Playwright script against a preview build of this branch, once with the fix and once with `src/App.jsx` stashed back to `4fc5b3d` (T059's tip). Origin CRL (`public/reach/CRL.json`, 7,441 B) and BRU (`public/reach/BRU.json`, 8,261 B) are the only two origins with a reach artifact today.

| Scenario | Before | After |
|---|---|---|
| Bare landing, no query string (default: Destinations tab) | fetches `/reach/CRL.json` | no reach request |
| `?tab=day` (day planner) | fetches `/reach/CRL.json` | no reach request |
| `?tab=map` (Explore) | fetches `/reach/CRL.json` | fetches `/reach/CRL.json`, unchanged |
| `?tab=places&rh=5&o=BRU` (a shared link with the filter already set) | fetches `/reach/BRU.json` | fetches `/reach/BRU.json`, unchanged |

Every session that opens on Destinations, Trip planner or Day planner, and never switches to Explore, now fetches about 7-8 KB less before it is interactive; a session that does visit Explore, or arrives on a shared reach link, sees no change. This is a small number against the multi-megabyte boot payload T054-T059 already measured, because that is genuinely the only boot-time layer fetch left to find after the audit above; the larger POI and layer questions the task raised were already closed by prior work.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `CountryBrief.jsx`'s "Best trips" fold was briefly changed to start closed, reasoning that its own comment ("fetched when their fold is first opened") implied it should be lazy like "Getting there" | Misread the comment: it describes when the data loads, not that the fold starts closed. `scripts/verify_country_brief.mjs`'s SHAPE check ("the first three open, the rest closed") and its literal assertion that glance, places and trips start open show this is deliberate, tracing back to task T4 | Reverted before committing; `useFolds(['glance', 'places', 'trips'], ...)` is unchanged |
| First test of the reach gate, against `/?o=CRL`, still showed the fetch firing | The URL's own convention (`App.jsx:290-294`) treats a query string with no `tab=` as an implicit map link, so `activeTab` resolved to `'map'` for that URL and the gate correctly let it through | Retested against a bare `/` and explicit `?tab=day`/`?tab=map`/`?tab=places&rh=5`, which isolate the four cases the fix is meant to tell apart |
| `verify_reach_filter.mjs` fails outright (`unexpected real reach artifact for CRL`, then a 120 s timeout waiting for `.result-row`) | Pre-existing: CRL now has a real `reach/CRL.json` (the test's premise was that it did not), and the test's selectors (`.result-row`, `.filter-tray-btn`, `.filter-reach`, `.reach-note`) exist only in `styles.css`, not in any current component, meaning the UI they target was replaced by a later redesign and the harness was never updated. Reproduced identically with this task's change stashed out, so it is not something this task broke | Already tracked under T054-i ("screen harness failures... reach_filter CRL premise... need owners"); not re-filed |
| `verify_country_brief.mjs`'s phone pass times out on a click | Reproduced identically on the baseline before this task's change | Already tracked under T054-i ("country_brief phone click"); not re-filed |

## What is still open

Nothing new. T059-a (whether to ship viewport-mode catalogue loading) and T059-b (put ranking fields in the boot index so lists stop needing all shards) are the two items that would meaningfully move the first-interactive-map number further, and neither is this task's to decide or do. T054-i already owns the four pre-existing harness failures re-confirmed above (`verify_reach_filter.mjs`'s two failures, `verify_country_brief.mjs`'s phone click, `verify_places_tab.mjs`'s selectOption); this task adds no new information about them beyond confirming they predate it. T059-f, the duplicate `run_queue.ps1` runner, was still true at the time this task ran (two PowerShell processes from 08:55 and 08:59 on 2026-09-28 were both still alive); it is the user's to resolve and is not re-filed here.

## Rollback procedure

```bash
cd continent-app
git checkout p3-shard-by-region-viewport
git branch -D p3-reduce-poi-payload      # or: git revert a45d5b2 once merged
cd ..
git checkout p3-shard-by-region-viewport
git branch -D p3-reduce-poi-payload      # or revert this report's commit
```

The change is a single conditional around one existing hook call, with no data or schema effect: reverting it only means every session goes back to fetching the 7-8 KB reach artifact at boot, which is harmless, just wasteful. No migration, no build flag, nothing to undo on the data side.
