# T968-T970: My trips, cleaned up, with the dock and a real map of Europe

Batch of three tasks on branch `p15-my-trips-clean` (root repo), from the owner's brief of 2026-11-01: take the clutter off My trips, give it the phone top bar the other tabs have, and replace Your Europe's tile map with "the cleanest, nicest looking map you can find". The work went through the impeccable skill. A research agent studied visited-country maps (Polarsteps, Been, Visited, Skratch, WorldScratch, Flighty) and EU cartography (EPSG:3035). Its brief chose the map's projection, the three map states and the land-share figure.

Commits: `a8b92f1993` (T968), `283e8e74c8` (T969), `9249e178a2` (T970).

**Repo note.** Recent tasks (T960 to T967) committed app work only through the root repo, which tracks a copy of `continent-app/**`. This batch did the same. The app's own git tree (`continent-app`, branch `master` at `bbc5c2f`) still holds a large amount of uncommitted work from those tasks. Even `src/auth/mytrips/` is not in its HEAD. This batch did not touch that state. It is register row T970-a.

End check (once, on the merged batch): ran the dev server with `VITE_E2E_SEAMS=1` and the `?savedmock` seam, at 375 and 1440 px. Covered Trips, Saved, Your Europe (including a tapped country), the past trip form and Add a booking. Result: no page errors, no horizontal scroll at either width, the dock present on the phone and absent on the desktop. Screenshots are in `Execution/P15/T968-T970-my-trips/`. The impeccable detector found nothing (`[]`). `npm test` passed 1204 of 1204. Lint on the touched files: 0 errors (the warnings were already there).

---

## T968: the explaining lines go

### Task ID
T968

### Date
2026-11-01

### What changed
My trips no longer explains itself:
- The "Saved on this device" line under a trip kept on this device is gone. A signed-out traveller still sees the Sign in button alone, because it is the only sign-in door while a device trip is on show (TripsTab hides its own sign-in line then).
- The Saved tab's empty state lost its line ("Save places, walks and Carta's trips as you browse...").
- The past-trips empty state lost its line ("Add a trip you took and it joins your record...").
- Add a booking lost all three subcaptions: under the drop zone, under Take a photo and under Type it in.
- The past-trip form's "Add details" lost its list ("Who came, how you travelled..."). It changed from a bordered box to a quiet brown text door with a plus.

The strings stay in the six i18n files and are now unused (row T968-a).

### Files touched
**Modified:** `continent-app/src/auth/SavedTripsPanel.jsx`, `continent-app/src/auth/PastTripForm.jsx`, `continent-app/src/auth/mytrips/AddBookingSheet.jsx`, `continent-app/src/auth/mytrips/SavedTab.jsx`, `continent-app/src/auth/mytrips/YourEurope.jsx`, `continent-app/src/styles/69-v6-account.css`

### Commands run
`npx eslint <files>`, `npm test`, then `git commit` in the root repo.

### Config and secrets set
None.

### Before/after measurements
Not measured (copy removal).

### What broke and how it was fixed
Nothing.

### What is still open
- T968-a: the unused strings (`saved.deviceLine`, `saved.deviceLineShort`, `mt.savedEmptyLine`, `mt.journalEmptyLine`, `mt.dropLine`, `mt.takePhotoLine`, `mt.typeInLine`, `saved.pastAddDetailsSub`) and the `.mt-qk-s`, `.mt-drop-line` and `.pasttrip-details-sub` rules can be deleted.

### Rollback procedure
`git revert a8b92f1993`.

---

## T969: the phone's top bar on My trips

### Task ID
T969

### Date
2026-11-01

### What changed
On a phone, My trips opens with the same search dock as Explore: the "Where to?" pill over the trip line, and the round Ask Carta door. My trips is a full-screen page on a phone (`top: 0`), so it covers the shell header. The dock therefore renders at the top of the page head (`MyTripsHead` gets a `topBar` prop from App through `SavedTripsPanel`), not in the shell header.

The dock has a new `plain` prop. In plain mode it always shows the places pill and Ask, never Explore's Back and Filters, even if Explore was left on a results list underneath. A search runs App's `dockSearch`. That goes through `goToTab`, which closes My trips and opens the kind's view in Explore. The desktop is unchanged: it keeps its header nav and has no dock.

### Files touched
**Modified:** `continent-app/src/App.jsx`, `continent-app/src/auth/SavedTripsPanel.jsx`, `continent-app/src/auth/mytrips/MyTripsTabs.jsx`, `continent-app/src/components/SearchDock.jsx`, `continent-app/src/styles/70-mytrips.css` (`.mt-topbar` only)

### Commands run
`npx eslint <files>`, `npm test`, then `git commit` in the root repo. The CSS hunk was staged on its own with `git apply --cached`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
The first version rendered the dock in the shell header. In the end check it was invisible, because the phone's My trips page covers the header. It was moved into the page head before the commit.

### What is still open
Nothing new. T961-c (whether a desktop gets the dock) still covers the desktop question.

### Rollback procedure
`git revert 283e8e74c8`.

---

## T970: Your Europe as a real map

### Task ID
T970

### Date
2026-11-01

### What changed
The tile cartogram (T926) is replaced by a drawn map of Europe:
- **Source and projection.** Natural Earth 1:50m admin-0, projected Lambert azimuthal equal-area at 52N 10E (the EU's EPSG:3035 framing). It is framed Iceland to Cyprus and clipped. Overseas parts are dropped (French Guiana, the Canaries, the Azores, Madeira, Svalbard).
- **The data file.** A new one-off script, `pipeline/oneoff/build_europe_map.py`, writes `public/europe_map.json` with SVG paths that are already projected, so the app has no projection code. It holds:
  - the 43 catalogue countries, one path each, with a label point and their true area in km²;
  - the land around them (Ukraine, Belarus, Russia, Turkey, North Africa) as one quiet context path, so the east has no hole;
  - a dot flag for countries under 3,000 km² (AD, LI, LU, MC, MT, SM, FO).
- **How it looks.** The sea is the white card and land not yet visited is flat grey. Visited countries are deep umber. The next trip is umber hatching, and a saved country gets an umber dot. Borders are hairline white gaps and there are no labels. A tap names the country in a pill over the map (flag, name, state).
- **The head.** Above the map: a 56 px umber count, "of 43 countries in Europe", and "20% of their land". The share is honest because the areas are equal-area, and its base (the 43 countries) is stated. Mark a country became a pencil button in the head, so the legend fits on one line on a phone.
- **The figures.** The Countries figure tile is dropped, because the head carries the count. An odd last figure tile now spans the row.

Seven new i18n keys in all six languages: `mt.mapLabel`, `mt.ofEurope`, `mt.landShare`, `mt.state.{been,next,saved,none}`.

**Departures from the direction contract** (allowed by the owner's design-freedom decision of 2026-10-30): the hatched pattern for the next trip, and the 56 px display number.

**Accessibility.** The map is one `role="img"` with a count label. Countries are not separate tab stops (43 stops would be worse). The keyboard and screen-reader route to marking a country stays the Mark a country sheet, now behind the labelled pencil button. The tap pill is `aria-live="polite"`. The fill transition has a reduced-motion branch.

### Files touched
**Created:** `pipeline/oneoff/build_europe_map.py`, `continent-app/public/europe_map.json`

**Modified:** `continent-app/src/auth/mytrips/YourEurope.jsx`, `continent-app/src/styles/70-mytrips.css`, `continent-app/src/i18n/{en,de,es,fr,it,nl}.js`

### Commands run
```
python pipeline/oneoff/build_europe_map.py      # europe_map.json: 83 kB, 43 countries, 1000x1035
npx eslint src/auth/mytrips/YourEurope.jsx
npm test                                        # 1204 pass
impeccable detect --json <touched files>        # []
```

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Map data fetched on Your Europe | 0 (tiles inline) | 83 kB raw, 33.7 kB gzip, fetched once and cached | +33.7 kB gzip, only on Your Europe |
| Map aspect at phone width | 11:9 tiles, ISO codes | 1000:1035, geographic | |

### What broke and how it was fixed
- An older `.mt-map` rule (the MapLibre trip map) drew a grey box with a border around the new SVG. The new classes were renamed to `mt-eumap-*`.
- The first frame kept specks of the Azores, which widened the frame and flattened the map. The west edge moved from 26W to 24.9W, and the map became nearly square, which suits a phone better.

### What is still open
- T970-a: the app's own git tree holds many files of uncommitted work from T878 to T967 (the root carries it). It should be committed as one catch-up commit, or the root-only convention should be written down.
- T970-b: DESIGN.md and the carta-design skill do not describe the atlas: the hatching for the next trip, the dot vocabulary, or the 56 px count.

### Rollback procedure
`git revert 9249e178a2`. This restores the tiles and removes the JSON and the script. The i18n keys go with the revert.
