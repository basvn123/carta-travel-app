# T918 to T922: the five outdoor pages on the place template, and their data

## Task ID

T918 to T922, one batch (renumbered at merge: another session had taken T915 to T917 on main while this batch ran; the commits on the batch branch still carry T915 to T919, in that order, so T915 here is T918, T916 is T919, T917 is T920, T918 is T921 and T919 is T922). CLAUDE.md "Batches", branch `p15-outdoor-pages`.

## Date

2026-10-31

## Shared header

The owner sent three screenshots of the trail page (Mount Korab) and asked for the same treatment the place page got, for the trail, beach, lake, mountain and cycling pages:

- /impeccable, clean and professional;
- deep research on what each page really needs;
- an artifact first;
- placeholders and pipeline changes for data that is not there yet.

The research and the artifact "Outdoor Place Pages" (https://claude.ai/artifact/DXyCVsrRUG9NnhWs7eVHdz) followed. The owner answered: "go on, if done can you push and deploy aswell". So the artifact's defaults are decided:

- "Add to a day plan" is the one primary action on all five pages.
- The map is a full-width Route block in the page.
- "Stay nearby" is a priced line in the side card.

Two tasks ran in parallel worktrees: T918 (pipeline) and T919 to T922 (pages, in sequence). They were merged into the batch branch, followed by one end check and one fix commit.

**How it was checked.**

- **Static checks:** eslint has 0 errors. `npm test` passes, 1130 tests. design-lint reports 168 violations, the same count as `main` (all in `styles/planners-held.css`).
- **Data gate:** passed for beaches, lakes, peaks, trails and cycling.
- **End check:** the real app with data (`node scripts/sync-data.mjs --split-only`, gitignored output) on the dev server. All five pages were looked at, at 390 and 1440:
  - Mount Korab (`#trail=63433&tc=AL`)
  - Figueirinha (`#beach=pt-figueirinha-beach-Q10352598&bc=PT`)
  - Cinco Reis (`#lake=pt-praia-fluvial-de-cinco-reis-w821133685&lc=PT`)
  - Triglav (`#mtn=si-triglav-Q1024&mc=SI`)
  - EuroVelo 1 part 30 (`#cycle=57332&cc=PT`)
- **Not loadable here:** Wikimedia photos were routed to the film stills; map tiles do not load in this session. No overflow and no page errors were found beyond the blocked tiles.

**Deploy.** Not done. This session has no Cloudflare token or account id, and `api.cloudflare.com` is not allowed in its network settings (T918-c).

## T918: the outdoor page keys in the pipeline

### What changed

New pass `pipeline/outdoor/derive_outdoor_pages.py`, run as the `outdoor_pages` task in `run_pipeline.py` behind the publish gate, after the nature exports. It adds keys to the committed wires and is idempotent. Placeholder sources are `cache/outdoor/{trails,beaches,lakes,mountains,cycling}.json` (`{"_about", "items": {id: {...}}}`); a placeholder value wins over a derived one, field by field. The contract is in `docs/SCHEMA.md`, section "Outdoor page keys (T918)".

| Layer | Key | Rows | Source |
|---|---|---|---|
| Trails (detail file) | `start` | 17,619 (7,278 named) | Line start, settlements cache |
| Trails | `access.parking` | 964 | `cache/parking_osm.json` |
| Trails | `dogs`, `permit`, hut season and booking | 0 | Placeholder |
| Beaches | `access.parking` | 522 | Parking cache |
| Beaches | `step_free` | 33 | OSM |
| Beaches | `waves` | 1 | Placeholder (Figueirinha) |
| Beaches | `sea_temp`, `shade`, `sunbeds`, `lifeguard_season` | 0 | `sea_temp` is read from `cache/sea_temp_beaches.json` when it lands; the rest are placeholders |
| Lakes | `alt_m` | 964 | 900 from Wikidata, 64 from trail heights (median error 4 m on 36 checked) |
| Lakes | `access.parking` | 72 | Parking cache |
| Lakes | `entry_eur` | 1 | Placeholder |
| Lakes | `rentals` | 0 | Placeholder |
| Mountains | `routes` | 275 of 2,143 peaks | Trails passing within about 150 m of the summit |
| Mountains | `hut_info` | 1 | Placeholder (Triglav) |
| Mountains | `lift_info` | 0 | Placeholder |
| Cycling (detail file) | `stations` | 7,598 | Station data |
| Cycling | `stages` | 788 | Numbered series |
| Cycling | `services` (water, repair) | 11,625 | |
| Cycling | `bike_trains` | 1 | Placeholder |
| Cycling | `rental` | 0 | Placeholder |

### Files touched

- `pipeline/outdoor/derive_outdoor_pages.py` (new)
- `cache/outdoor/*.json` (new)
- `pipeline/field_stubs/gate.py` (ranges for the new numbers, enum for `waves`)
- `run_pipeline.py`
- `docs/SCHEMA.md`
- The nature wires: 30,534 files, new keys only

### Before/after measurements

| Wire | Before | After |
|---|---|---|
| Trail detail files | 350.2 MB | 351.3 MB (+0.31%) |
| Beaches | 13.27 MB | 13.31 MB (+0.28%) |
| Lakes | 7.73 MB | 7.75 MB (+0.21%) |
| Mountains | 6.05 MB | 6.10 MB (+0.87%) |
| Cycling detail files | 450.8 MB | 452.1 MB (+0.28%) |

The trails and cycling country files are unchanged.

### What broke and how it was fixed

The layer exports need the trailslab PostGIS database or the `rich_*` caches, and neither is in this checkout. So the pass adds keys to the committed files. Every changed file was compared with HEAD and shows no other difference.

Beaches (9 rows) and lakes (369 rows) already had an older string `access` ("road", "steps", ...). The pass keeps the string, so on those rows the new object is not written (2 beaches and 12 lakes lose a derived parking spot). The pages read the object only when `typeof access === 'object'`.

### What is still open

- Bus, train and tram stops near a start (`access.transit`) are empty in every layer: there is no offline stops source (T918-a).
- `sea_temp` waits for `cache/sea_temp_beaches.json`, the output of `pipeline/harvest_sea_temp.py` (T918-b).
- The placeholder files need a harvest: dogs, permit, hut season, sunbeds, lifeguard season, waves, entry fee, rentals, lift, bike trains, rental (T918-d).
- Parking only covers places within about 1.5 km of a Carta destination, so no parking means not known.
- The deploy (T918-c).

### Rollback procedure

`git revert fe67786f35 e5d733cfcc 323bf501f1`. The keys are additive and the pages skip them when absent.

## T919: shared outdoor parts and the trail page

### What changed

New `src/browse/OutdoorParts.jsx` and `src/styles/89-outdoor-page.css`, on top of the T912 template (PageTemplate, PhotoGallery, KeyFacts). They provide:

- the side card: key figures, "Add to a day plan", a secondary row, and "Stay nearby" with the town's price a person a day;
- the phone foot bar;
- the full-width Route block: the map with 2D/3D and full screen, then the height profile with a height scale and the steepness key;
- the grade card: T1 to T6 in plain words, with "assumes dry rock and good visibility";
- check rows, a facilities grid, the water class as four named steps, a month strip and a safety block;
- "Other X nearby" cards, where a card without a photo shows a map spot.

The trail page:

- **Head:** the name without the route number (now a badge), and six facts.
- **Jump bar:** Route, Before you go, Getting there, Along the way, Nearby.
- **Kept:** the forecast warning, GPX, Follow on the map, PDF, add photo or track, report.
- **Removed:** the tab rail and the three folds. The score explanation stays as one fold near the sources. The KML export was dropped; the spec lists GPX, Follow and PDF.

### Files touched

`continent-app/src/browse/OutdoorParts.jsx` (new), `styles/89-outdoor-page.css` (new), `TrailPage.jsx`, and `i18n/*.js` (192 `ox.*` keys across the batch, after `destx.dockInputs`).

### Before/after measurements

Not measured.

### What broke and how it was fixed

Nothing at merge.

### What is still open

The helper exports in `OutdoorParts.jsx` and `PeakFacts.jsx` raise react-refresh lint warnings; move them to a lib file (T919-a).

### Rollback procedure

`git revert 5c50ce1fe6`, together with T920 to T922, which use its parts.

## T920: the beach and lake pages

### What changed

- **Beach:** facts on top; The water (EU class with site, sea by month when present, waves, which way it faces, lifeguard); On the beach (facilities); Getting there; Other beaches.
- **Lake:** Swimming first (verdict, class, water temperature by month); Around the shore; Getting there; Other lakes.

### Files touched

`BeachPage.jsx`, `LakePage.jsx`, and `tests/pricePlace.test.mjs`. Test V12 now checks the `<StayLine>` that replaced `view.stayIn(`, since the approved spec moved "Stay nearby" into the card.

### What broke and how it was fixed

The end check, `cb14a0899e`:

1. The facilities grid left a grey hole after an odd last row, as the quick facts grid did on the place page. Its background is now the surface, and the cells draw the hairlines.
2. "1 places to sleep" on cycling towns now reads "1 place to sleep", in six languages.

### What is still open

Nothing beyond the T918 placeholders.

### Rollback procedure

`git revert cb14a0899e f9d58bc9bc`.

## T921: the mountain page

### What changed

Sections:

1. **Routes to the top**, from `routes`. Triglav shows "Dolič - Triglav" and "Aljažev dom - Kredarica - Triglav", each linking to its walk.
2. **Huts and lifts**, with the map.
3. **When to go**: summit temperatures, the snow cell, the summit forecast.
4. **Before you go**: the hazards.
5. **Other peaks**.

### Files touched

`MountainPage.jsx`, `PeakFacts.jsx`.

### What is still open

The storm and crowd cells render only once `season.storm` or `crowds` exist in the data (T921-a).

### Rollback procedure

`git revert e3bd548f67`.

## T922: the cycling page

### What changed

Sections:

1. **Route**, with six facts on top.
2. **Surface and traffic**, as two bars, with OSM named.
3. **Stages**.
4. **Getting there**: stations at both ends and trains with bikes.
5. **Along the way**: water, repair and beds, with the town list.
6. **Other routes**: cards without photos show a map spot instead of "ED" and "Not available yet".

`DestinationsTab.jsx` now passes `onAddToDay` and `onSelectDest` to the cycle page, which had no primary button before.

### Files touched

`CyclePage.jsx`, `DestinationsTab.jsx`.

### What is still open

Cycling pages have no "Stay nearby": route rows carry no base town (T922-a).

### Rollback procedure

`git revert 81e624aa43`.

## Batch

- **Config and secrets set:** none.
- **Commands run:**
  - `python pipeline/outdoor/derive_outdoor_pages.py`
  - `python pipeline/field_stubs/gate.py --layer ...`
  - `node scripts/sync-data.mjs --split-only`
  - `npm test`, eslint, design-lint
  - `npx vite --port 5191` with Playwright
