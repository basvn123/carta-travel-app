# T453: Trails opens on walks

## Task ID

T453

## Date

2026-10-15

## What changed

The T451 design review found that Trails, the section hikers reach first, opened without a single walk (row T451-a). The owner asked for an investigation first, then the fix.

**The investigation.** A read-only agent mapped the trail wire. It found:
- 45 country files, 17,619 rated walks, 3,554 of them with a photograph;
- every other section (beaches, lakes, mountains, cycling) opens on a `top.json`;
- the comment in the tab said Trails could not, only because no Europe-wide list existed;
- such a list can be built offline from the published country files, with no trailslab database and no network.

The review's other point stands: a walk's rating is scored within its own country, so one Europe-wide sort would compare unlike scales. The list is therefore chosen per country and pooled, and the app takes each country's best in turn.

Rails that read well across a continent:
- each country's best walks;
- walks over several days;
- day walks with a view;
- past a waterfall;
- past a lake.

Rails that do not, and stay country-level:
- "Back where you started": a loop is a local choice;
- "Under 5 km".

**What a walker sees now, at rest:**
1. The section's photograph and "Find your next walk".
2. Rails: "Each country's best walks", "Walks over several days", "Day walks with a view", and on desktop "Past a waterfall". Each tile carries its photograph, the name, the country, the length and the Score.
3. "Walks near me".
4. "Choose a country" (the country track).

A tile opens the walk's own page. Europe-wide rails carry no "See all" and offer no starters, because a walk list is one country's. The country rails, starters and "See all" appear once a country is picked, as before.

**The pipeline.** `pipeline/trails/export_top.py` writes `public/trails/top.json`. From each country it takes, among the rated walks that have a real name and a photograph:
- the 4 best;
- the best 3 in each of the four cuts.

The result is 339 walks from 41 countries: 87 over several days, 149 day walks with a view, 93 past a waterfall, 162 past a lake. The file is 957 KB raw and about 259 KB gzipped, the same order as the other sections' top files. `export_wire.py` calls it at the end of every export, so the list cannot disagree with the country files.

A bare route number is a ref, not a name: "6668" was the first tile until the selection required a real name.

**Copy.**
- The day rail loses its method bracket in all six languages ("Half a day to a day", was "... (5 to 20 km)"), the fact-check item in T451-i.
- Rail tile names go through `displayName`. "E7 - Andorra" becomes "E7, Andorra" and "Mount Korab (9/1)" becomes "Mount Korab". "7 (The Blue Eye)" keeps its bracket, because there the bracket is the name.

## Files touched

**Pipeline (root):**
- `pipeline/trails/export_top.py` (new)
- `pipeline/trails/export_wire.py`: calls it at the end.

**Data (app, gitignored, ships with the R2 data push):** `public/trails/top.json` (new).

**App (mirrored in root):**
- `src/lib/trails.js`: `loadTopTrails`.
- `src/lib/openingScreen.js`:
  - `OPENING_RAILS.trailEurope`;
  - `buildRails` takes a rail set;
  - `railOrder` takes countries in turn for trails too;
  - `pickIcons` caps per country when the rows span countries.
- `src/browse/DestinationsTab.jsx`:
  - the top list loaded at rest;
  - the opening gate;
  - a tile opens through `openNeighbour`;
  - no See all or starters at rest;
  - the country on Europe-wide tiles;
  - `displayName` on walk names;
  - no "full list" heading over the countries.
- `src/lib/cardFillings.js`: `displayName` keeps a bracket that is the name.
- `src/i18n/{en,de,nl,fr,es,it}.js`: three new keys (`dtab.railBest.trail`, `open.trail.railTrek`, `open.trail.railView`) and `open.trail.railDay` without its bracket.
- `scripts/verify_destinations.mjs`: 78 to 86 checks (walk rails at rest, photographed tiles, no See all, a tile opens its page).

**Created (root):** this report, `Execution/P11/T453-shots/`.

## Commands run

```
python pipeline/trails/export_top.py --dry-run
python pipeline/trails/export_top.py
npx vite build && npx vite preview --port 5298 --strictPort
CARTA_PORT=5298 node scripts/verify_{destinations,trails,places_tab,trail_page,paging,layer_errors,explore}.mjs
npm test
node scripts/ci/design-lint.mjs && node scripts/ci/banned-terms.mjs
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Walks shown on Trails before a country is picked | 0 | 3 rails on a phone, 4 on a desktop, up to 12 walks each |
| Countries on the first rail | none | one walk per country, in turn |
| Trails page height at rest, phone | 882 px (countries only) | 2,131 px (rails, then countries) |
| `verify_destinations` checks | 78 | 86 |
| design-lint | 9,230 | 9,230 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| "6668" as a walk tile's name | A route with only a ref as its name | The selection needs a name with letters |
| "7" as a tile's name | `displayName` dropped "(The Blue Eye)" | The bracket goes only when a real name remains |
| Blank lines in the six language files | The insert script's indent capture took a newline | Removed |

## Checks

| Check | Result |
|---|---|
| verify_destinations | 86/86 |
| verify_trails 34/34, verify_places_tab, verify_trail_page, verify_paging 7/7, verify_layer_errors 24/24, verify_explore 103/103 | pass |
| npm test | 375/375 |
| design-lint, banned terms | 0 new, none |

## What is still open

- **T453-a (user).** `public/trails/top.json` reaches production only with the R2 data push (`node scripts/r2/push-data.mjs --live`), with the other wire changes. Until then the deployed app falls back to the old opening: its loader resolves null, and the tab shows the head and the countries.
- **T453-b.** Some walks in the list carry names in Cyrillic (Bulgaria, Serbia) on a Latin screen. Their wire rows have no Latin name to fall back to; a transliterated or English name belongs in the trail export.

Row T451-a is closed by this task.

## Rollback procedure

Revert the T453 commits in both repos and delete `continent-app/public/trails/top.json`. The tab returns to opening on the countries; nothing reads the file once the app change is reverted.
