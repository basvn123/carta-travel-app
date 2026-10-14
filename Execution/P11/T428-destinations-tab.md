# T428: The Destinations tab, rebuilt on the kit in Explore's grammar

## Task ID

T428

## Date

2026-10-15

## What changed

This is roadmap 1.2's Destinations task (`Roadmap/1.2-migration-handoff.md`), carried out to the owner's brief of 2026-10-14: make the tab modern, clean and professional, show what matters first, cut every sentence the traveller does not need, reuse Explore's patterns, put people and better photographs in front, add a guided way in, link to the other tabs, and check every photograph. It builds on T448 (trip styles) and T449 (country galleries).

### Before

The tab showed:
- six category buttons, as a 2 x 3 grid on a phone and a second grid in the desktop panel;
- a search row, then a toolbar of sort toggles, a Filters pill, the country picker and inline chips, each chip carrying a count;
- for each outdoor section, "Europe's 6 best-known mountains" over a method sentence ("Ranked by how widely they are read about and photographed..."), then up to six rails with dots and "1 to 4 of 12", "See all 173" on each, and the further cuts under "More ways in".

The list cards were photo bands with a 6 px data strip, a key sentence explaining that strip, a mono reference chip, three values and a row of unlabelled glyphs. Every list ended with a credit sentence and a coverage footer.

The Trips section opened on "253 trips in 39 countries, across 10 styles. Coverage is uneven: 19 of the 39 countries...", ten style cards each carrying a trip count, and the composed-route door with its method sentence. Trails opened on "Walks are ranked within each country, so this section opens on the countries. Pick one to see its best walks.", then country cards that took the first trail photograph (a moth for Belgium) and showed a walk count.

`measure_destinations.mjs` counted these bare figures on screen, phone view (desktop in brackets where it differs):

| Section | Bare figures |
|---|---|
| Trips | 10 |
| Trails | 38 |
| Beaches | 15 |
| Lakes | 11 |
| Mountains | 13 |
| Cycling | 61 (75 on desktop) |

### After, top to bottom

- **Section tabs.** One row of kit Tabs (Trips, Trails, Beaches, Lakes, Mountains, Cycling), sticky under the top chrome, on every width. The desktop panel no longer repeats them.
- **Search.** On a desktop the search field sits in the header's slot, as Explore's guided search does. On a phone it shares one row with a single kit Filters button.
- **Section head.** One photograph of people doing the thing (T448, rule 6 as narrowed) and one title with a verb: "Find your next walk", "Find your beach", "Swim, paddle or walk around a lake", "Get to the top", "Ride Europe's best routes", "Pick a kind of trip".
- **Try one.** The guided starters, offline and with no AI call. They are the saved cuts that did not get a rail, and each applies a real filter ("Tucked into a small cove", "Waves worth surfing", "Over a summit", "Good with children"). A starter only appears when its filter leaves at least four places. On a phone they are one row a thumb can swipe.
- **Rails.** Kit tile Cards (photograph, name, where, one measured fact, the Score):
  - at most four rails on a desktop and three on a phone;
  - the best-known set comes first ("Best-known beaches", "Top-rated walks in Belgium");
  - a place appears in only one rail where it can (row T444-d's repeat problem, for this tab);
  - "See all" carries no figure; there are no dots and no position figure.
- **By country.** The T449 gallery cards: three photographs to swipe, the flag and name, and one line ("Belfry towns, Ardennes forests and a long sandy coast"), with no count. On Trails at rest the same cards are the section, under "Choose a country" and the "Walks near me" door.
- **A picked or typed country** gets one band over the list: the flag, the name, the line, and "See places in Croatia", which opens Explore filtered to that country (`onExploreCountry`, App sets the filter and goes to the tab).
- **Browse the full list.** It keeps the photo cards the owner said they like, now the kit tile Card:
  - the photograph, the name with the Score;
  - where it is;
  - one line of the facts that matter (a swimming verdict, a lift, "Loop" for a walk that comes back);
  - up to three measured values set label over value.

  The strip, the strip key, the reference chip and the glyph row are gone.
- **Refine row.** Over the list on a phone, and sticky: the sort as one select (three toggle buttons before), the country picker matched to the field, the Lifestyle door. On a desktop the left panel holds the same, the short facet set as kit filter chips, and "All filters".
- **Copy cut.**
  - The listed tier reads "More in {country}", without its note.
  - The coverage footers, every credit sentence and the cycling "best rides" sentence are gone.
  - "N famous walks we cannot map yet" and "Show all N" lost their figures.
  - The trip-filter method line ("Totals are per person, flights not included...") is gone.
- **Sources.** Every credit, the licences and the photograph credits (the section photograph and every country gallery on screen, each with its author, licence and file page) wait in one closed "Where this comes from" row at the end.
- **Trips.**
  - The ten style cards are kit tiles: the people photograph, the plain name, the one-line description and "From €255 a person, 7 days". There is no count and no coverage sentence.
  - The composed-route door is a quiet secondary button.
  - A style's list has a "Hostel, hut or campsite beds" switch on T448's `beds` field.
  - The composed trips' length is a stepped select that commits on change, instead of a slider that re-ranked the list on every step (row T199-a).
- **URL.** `dc` (section) and `dn` (country) are written while the tab is on screen, keeping the hash and `history.state`, and read on arrival. Reload, Back and a shared link restore the view, and a country photograph's link opens it in a new tab.

### The photographs, checked

An image-check agent downloaded and looked at every photograph an opening can lead with, 1,317 rows and 1,290 distinct files:
- the top beaches, lakes, mountains and cycle routes;
- the cycle tours;
- each country's twelve best walks.

It failed 245 rows (243 files). Examples: the moth; a fire hydrant for Tragumna beach; paintings for Snowdon, Parnassus and Vesuvius; a church interior; a doughnut; a helicopter for Pilatus; satellite night images; an insect shared by three Serbian walks.

`src/lib/photoVeto.js` lists the 243 files. A refused photograph counts as none: a card falls back to the row's next photograph or the drawn route, and a rail picks another row. The 110 trail rows not already on it went onto `data/reports/trail_photo_patch.json`, so the next trail export drops them at the source. The whole list is kept for the pipeline in `data/reports/photo_veto_t428.json`.

### A kit bug found on the way

On every kit Card with a stretched link (Explore's rail tiles, the destination page's tracks, now this tab), a press that started on the photograph did not open the card:
1. The global press rule in `02-base.css` gives an active button `scale: 0.98`.
2. A `scale` makes the button the containing block of its `::after` overlay, so the overlay shrank to the 55 x 22 px title while the button was down.
3. The release landed on the photograph, and the click went to the card, not the link.

Traced with mousedown and mouseup targets. Fixed in `04-ui.css` with two appended rules: the stretched link takes no compression (with a doubled class, because the global rule's `:is()` carries an element), and the card answers the press instead.

## Files touched

**Modified (app, mirrored in root):**
- `src/browse/DestinationsTab.jsx`: the chrome, the opening, the country band and track, the lists' copy, the Sources fold, the URL state, the photo veto; the old CountryCard, the trail-cover fetch, the slider and the sort toggles deleted.
- `src/browse/SectionOpening.jsx`: rewritten (head, starters, rails on the kit Card, the shared Strip).
- `src/browse/PlaceCard.jsx`: on the kit tile Card.
- `src/browse/JourneysSection.jsx`: kit tiles, no counts, the beds switch, the composed door.
- `src/browse/PlacesFilterSheet.jsx`: kit filter chips and close button, no counts.
- `src/browse/TripFilters.jsx`: the method line removed. This is outside the task's file list, declared here: a one-line removal of copy the owner named.
- `src/App.jsx`: two props on DestinationsTab, `isActive` and `onExploreCountry`.
- `src/lib/openingScreen.js`: `photoOf` honours the veto.
- `src/i18n/{en,de,nl,fr,es,it}.js`: 19 new keys each, 6 changed.
- `src/styles/63-v6-destinations.css`, `30-section-opening.css`, `37-card-fillings.css`: rewritten.
- `src/styles/23-places-pages.css`: the dead overlay-card rules (`.places-bcard` and its where line and tag chips) and the dead header friends and pricing rules (row T426-b) deleted.
- `src/styles/04-ui.css`: the press fix, appended only.
- `scripts/verify_*.mjs`: 19 harnesses moved onto the new markup. Checks that asserted what the owner removed (a count on a chip, "N beaches in X", the not-scored note, the rail's position figure, a General category) are inverted or retired, each with a T428 note.
- `scripts/ci/design-lint.baseline.json`.

**Created (app, mirrored in root):**
- `src/browse/CountryGallery.jsx`
- `src/lib/photoVeto.js`
- `scripts/measure_destinations.mjs`
- `scripts/verify_destinations.mjs`

**Deleted (app):** `scripts/verify_filter_sheet.mjs` (row T440-a).

**Root only:**
- `data/reports/trail_photo_patch.json` (110 drops)
- `data/reports/photo_veto_t428.json` (new)
- this report, `Execution/P11/T428-shots/`
- `Execution/_OPEN.md`

## Commands run

```
node scripts/measure_destinations.mjs --port=5298 --label=before --shots=../Execution/P11/T428-shots   # at the start
npx vite build && npx vite preview --port 5298 --strictPort          # after each batch
CARTA_PORT=5298 node scripts/verify_destinations.mjs                 # and the 18 harnesses below
node scripts/verify_quality_floor.mjs t428 --port=5298 --only=pages --out=<scratch>
node scripts/ci/design-lint.mjs --update-baseline && node scripts/ci/design-lint.mjs
node scripts/ci/banned-terms.mjs
npm test
node scripts/measure_destinations.mjs --port=5298 --label=after --shots=../Execution/P11/T428-shots
```

## Config and secrets set

None.

## Before/after measurements

From `measure_destinations.mjs` (committed), phone 390 x 844 / desktop 1440 x 900. "Bare figures" counts visible text that states a number with no unit. After the change, every remaining hit was read by hand and is a name, not a count: "Natura 2000", a photographer "Tobi 87", route names such as "NCN National Route 1" and "33 Šumavská magistrála".

| Metric | Before | After |
|---|---|---|
| Bare counts on Trips | 10 | 0 |
| Bare counts on Trails | 38 | 0 (1 hit, a name) |
| Bare counts on Beaches | 15 | 0 (7 hits, names) |
| Bare counts on Lakes | 11 | 0 (1 hit, a name) |
| Bare counts on Mountains | 13 | 0 (1 hit, a name) |
| Bare counts on Cycling | 61 / 75 | 0 (route names only) |
| Words on the first screen, Trips | 82 / 111 | 74 / 95 |
| Words on the first screen, Trails | 39 / 57 | 17 / 52 |
| Words on the first screen, Beaches | 56 / 67 | 42 / 71 |
| Raw buttons, DestinationsTab.jsx (meter) | 22 | 7 |
| Raw buttons, SectionOpening, PlaceCard, PlacesFilterSheet | 8 | 0 |
| Raw buttons, JourneysSection.jsx | 10 | 1 |
| 63-v6-destinations.css font-size / radius / legacy tokens | 24 / 15 / 85 | 0 / 0 / 0 |
| 30-section-opening.css font-size / legacy tokens | 9 / 20 | 0 / 0 |
| 37-card-fillings.css font-size / radius / legacy tokens | 10 / 6 / 25 | 0 / 0 / 0 |
| design-lint violations, whole app | 9,523 | 9,282 |
| Leading photographs that fail the image brief, shown | 245 of 1,317 | 0 (vetoed) |
| Country cards with their own photographs | 0 | 45 |

Two readings are not wins on every width:
- Desktop first-screen words rose a little on Beaches, Lakes and Mountains. The head title and the Try one starters are new words.
- Page height on a phone is about the same, 17,000 to 18,000 px. Most of it is the first page of 36 list cards, which this task did not shorten.

Trip-length input delay (row T199-a) was not measured. The cause, a re-rank on every slider step, is gone by construction: the select commits once per change.

## Checks

| Harness | Result |
|---|---|
| `verify_destinations` (new contract) | 62 of 62 |
| `verify_places_tab`, `verify_beaches`, `verify_lakes`, `verify_mountains`, `verify_journeys`, `verify_shortlist`, `verify_trail_page` | all passed |
| `verify_trails` | 34 of 34 |
| `verify_trips` | 42 of 42 |
| `verify_paging` | 7 of 7 |
| `verify_layer_errors` | 24 of 24 (14 before: it looked for a retry class ErrorBlock had already replaced) |
| `verify_places_search` | 41 of 41 |
| `verify_explore` | 103 of 103 |
| `verify_destination_page` | all passed |
| `verify_cycling` | 76 of 78. The two failures are data checks that failed before this task too (a repeated per-country count, no Scotland tour of about five days). |
| `verify_desktop_shell` | stops on Explore's retired `.xcard` class, row T429-c, unchanged by this task |
| `verify_quality_floor`, pages flow, 24 screens | the Destinations screens pass. The two phone target failures are the journey page's cost-bar segments (trips surface, T431). |
| design-lint | 0 new |
| banned terms | none |
| `npm test` | 375 of 375 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A card did not open when pressed on its photograph | Global press `scale` turned the link into its overlay's containing block | `04-ui.css`: no compression on the stretched link, the card takes the press |
| The fix lost to the global rule | The global `:is()` list carries `input[type=checkbox]`, one element more specific | Doubled class |
| Typing a country lost its header | The old "N beaches in X" line followed the field; the new band only followed the picker | The band reads `typedCc` |
| The gallery strip was a pointer-only control (quality floor) | `onClick` on a div | Each photograph is a real link to the country's address, out of the tab order |
| The "walk is a loop" fact vanished with the glyph row | The loop glyph was its only mark | "Loop" leads the card's fact line |
| The harness "under 5 km" check would pass on nothing | The facts are label over value now, so `parseFloat` read NaN and an empty list passed `every` | Parse the km figure and require at least one |
| The quality floor screened nothing | `--only=places` is not a flow name | `--only=pages` |
| `sed -i` turned two files to LF | Known Git Bash trap | Edits through node and the Edit tool; git normalises |

## What is still open

- **T428-a (owner).** Deploy: the app build, and the R2 push of the journeys wire (T448-a), so the live tab shows any of this.
- **T428-b.** The 243 vetoed photographs on beaches, lakes, mountains and cycling still ship in their wires. Drop them in each layer's next export (beach, lake and mountain image patches; the cycling image pass), then shrink `src/lib/photoVeto.js` to what is left. The trail rows are already on `trail_photo_patch.json` (owner row T449-a covers the re-export).
- **T428-c.** The check covered the photographs an opening can lead with. The rest of each list (thousands of rows) was not looked at, and the failure rate in what was checked was 18.6 per cent. A catalogue-wide pass needs the vision scoring the image brief describes, as a pipeline run.
- **T428-d.** Only the section and the country are in the URL. The facet chips, the sort and a near-place search are not, so a shared link opens the section unfiltered.
- **T428-e.** Seven raw buttons are left in `DestinationsTab.jsx`: the search suggestion rows (listbox options), the locate crosshair, the EuroVelo chips, the composed-trip card, the stub rows. `23-places-pages.css` still holds 180 font-size literals and 461 legacy token reads, most of them for the item pages (T430).
- **T428-f.** `countryGallery.js` and `photoVeto.js` ride the Destinations code. If the main bundle carries the tab, about 20 KB gzip moved into it; check with T449-d.
- **T428-g.** The region door (brief V3-9) is still not on the tab; T450 decides it with the country and region pages.

Rows closed by this task:
- T440-a (`verify_filter_sheet.mjs` retired);
- T426-b (the dead header rules deleted);
- T199-a (the slider replaced by a select; not measured, the cause removed).

## Rollback procedure

Revert the T428 commits in both repos (`git revert <sha>` on continent-app master and on root main). That restores:
- the old tab, cards, opening and stylesheets;
- the harnesses and `verify_filter_sheet.mjs`;
- the trail drop list.

The `04-ui.css` press fix is two appended rules; reverting it brings the photo-press bug back to every kit Card. No data, database or live deploy was touched.
