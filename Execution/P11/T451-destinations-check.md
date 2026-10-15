# T451: The Destinations impeccable check

## Task ID

T451

## Date

2026-10-15

## What changed

This is the fifth task of the Destinations plan (T448, T449, T428, T450, T451). It ran the same kind of check T444 ran for Explore and T446 for the destination page:
- a dual critique by two isolated sub-agents: A, a design review with Nielsen scores at 390, 1440 and German at 360; B, the impeccable detector on the files and in the browser;
- a third agent that fact-checked every string and photograph on the tab;
- one fix batch;
- one confirming round, then stop.

The first round scored **24/40** (one P0, two P1s). After the batch the re-score is **27/40**, with no P0.

### What a traveller sees differently

**Trip cards are readable on a phone (the P0).**
- Before: after tapping a style such as Hiking, each trip card showed only its photograph, cut at 179 px. The title, place, days and price were in the page but invisible.
- Cause: a legacy `.jcard { aspect-ratio: 2/1 }` (25-feature-pages.css) and the old `.jcap-card` look (66-v6-trips.css, loaded later) still applied to the kit Card.
- Now: the aspect ratio is gone, and the kit Card's edge, surface and press win over the legacy look.

**Back steps back.**
- Before: opening a style's list, a trail, a beach, a lake, a mountain, a ride or a composed trip pushed no history entry, so the browser's Back and a phone's swipe left Carta.
- Now: the tab keeps two levels (a style's list, and a page over it). Each level pushes one entry, Back closes the top one, and closing with the page's own arrow steps back over the entry, so no dead step is left. The trip page and the destination page already pushed their own entries.
- A link that names a section (`dc`) but no country now opens with no country. Before, the country remembered from the last visit won over the link.

**Trails opens short.**
- Before: Trails opened on 40 country gallery cards in a grid, 14,616 px tall on a phone.
- Now: "Walks near me", then the countries as one track, the same "By country" track every other section has. The opening is 882 px.

**Facts say what they measure.**
- Rail tiles read "Height 2,812 m", "Length 5,021 m", "Area 3.4 km²".
- Before, the same slot printed a bare "813 m" for a beach's length and a summit's height alike.
- The mountain card's "Higher peak 2,812 km" is now "Nearest higher peak", in all six languages.

**Trip budgets carry the estimate mark.**
- Style cards read "From ~€255 est. a person, 7 days".
- Trip cards read "~€800 to €1,150 est. a person", through the kit Money, the way Explore and the country page print an estimate.

**German and French read as German and French.**
- Country names on cards, tracks, selects and trip cards come from `lib/countryName.js` (Albanien, Kroatien, Island). Before, the catalogue's English name won.
- German: "Reisen" and "Wanderwege" (were "Trips" and "Routen"); umlauts in the beach chips and the Sources fold (Dünen, Meereshöhle, Türkises Wasser, Geschützt, Wasserqualität).
- French: "Voyages" and "Vélo", "D'où cela vient", and accents in the beach chips and the Sources fold (Épave, Protégée, Surveillée, Accès en bateau, À pied, qualité, européenne).

**Names are cleaned for display.**
- Beach, lake and mountain titles lose a trailing Wikipedia disambiguator ("Montserrat (mountain)" becomes "Montserrat"), dashes go the house way ("Kamnik-Savinja", "Trešnjevka, jug"), and the first letter is a capital ("Plage du Moulin-Blanc", "Lake Bolsena").
- This is `displayName()` in `lib/cardFillings.js`. Place lines also go through `stripDashes`.

**The lift claims are honest.**
- The fact check found "Cable car to the top" on Mont Blanc, the Matterhorn, Teide and others, where the lift stops below the summit.
- The rule behind it is "OpenStreetMap maps a top station near the summit".
- The chips now say "Up by cable car", "Up by gondola" and so on. The rail says "Up by lift" and the filter "Lift near the summit", in six languages.
- The mountain page's "A cable car runs to the top" sentences are not on this tab and stay for the data fix (row T451-d).

**Smaller fixes.**
- Flags are decorative. They read out an English "Flag of AL" in every language, next to a name already on screen.
- The side rail's caption over the country select says "Country", at the caption size. It was "All countries", over a select that also says "All countries", at 11 px.
- The section row brings the active section into view on a phone. Cycling sat off-screen to the right.
- The country page's name is its h1. The tab's own h1 steps aside while the page is open, as it does for the region and destination pages.
- The country page's Cities and Towns rails no longer repeat the places in "The best of {country}".

## Files touched

**Modified (app, mirrored in root):**
- `src/browse/DestinationsTab.jsx`: history levels and popstate, URL-first country, the Trails track, labelled facts and `displayName`, `countryName` through `lib/countryName.js`, the side label, the active tab scroll.
- `src/browse/SectionOpening.jsx`: the fact label on a rail tile.
- `src/browse/JourneysSection.jsx`: Money with `est` on style and trip cards, the local country name on trip cards.
- `src/browse/CountryPage.jsx`: h1, `aria-modal`, and no repeated places across the rails.
- `src/lib/cardFillings.js`: `displayName()`; `placeLine` strips dashes; beach, lake and mountain titles go through it.
- `src/components/CountryFlag.jsx`: decorative (`aria-hidden`). **Outside the plan's T451 file list.** It is a shared component, declared here because the flag's English label was read on this tab in every language.
- `src/styles/10-shell.css`: `.cpage` added to the rule that hides the tab h1 under a full page. **Outside the plan's list**, needed for the country page's h1.
- `src/styles/25-feature-pages.css`: the `.jcard` aspect ratio deleted.
- `src/styles/30-section-opening.css`: `.dtab-fact-l`.
- `src/styles/63-v6-destinations.css`: the kit trip card guard, the Trails index rule (replaces the deleted grid rules and `.dtab-subhead`), and `.side-sub` on the scale.
- `src/i18n/{en,de,nl,fr,es,it}.js`: 72 values changed, no keys added or removed. The changed keys are `card.vHigher`, `mtn.chipLift`, `mtn.lift{CableCar,Gondola,Funicular,RackRailway}`, `open.mtn.railLift` and `mtn.accLiftTop` in all six languages, plus the de and fr fixes listed above.
- `scripts/verify_destinations.mjs`: 62 to 78 checks:
  - the Trails track and its height;
  - estimate marks on trip prices;
  - the phone trip card title;
  - Back closing a style's list;
  - labelled rail facts;
  - German country names;
  - decorative flags.
- `scripts/ci/design-lint.baseline.json`.

**Created:**
- `continent-app/.impeccable/critique/2026-10-15T00-43-53Z__src-browse-destinationstab-jsx.md` (round one, 24/40)
- `continent-app/.impeccable/critique/2026-10-15T00-44-22Z__src-browse-destinationstab-jsx.md` (re-score, 27/40)
- This report, `Execution/P11/T451-shots/` (9 before and after pairs).

## Commands run

```
impeccable context            (from continent-app; PRODUCT.md and DESIGN.md read directly, gotcha T446-f)
npx vite build && npx vite preview --port 5298 --strictPort
CARTA_PORT=5298 node scripts/verify_destinations.mjs
CARTA_PORT=5298 node scripts/verify_{explore,journeys,trips,trails,beaches,lakes,mountains,places_tab,trail_page,paging,layer_errors,places_search}.mjs
node scripts/verify_quality_floor.mjs t451 --port=5298 --only=pages,explore --out=<scratch>
node scripts/ci/design-lint.mjs --update-baseline && node scripts/ci/design-lint.mjs
node scripts/ci/banned-terms.mjs
npm test
impeccable critique-storage write src/browse/DestinationsTab.jsx <body>   (twice)
impeccable critique-storage trend src/browse/DestinationsTab.jsx 5
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| impeccable score (Nielsen, /40) | 24 | 27 (confirming re-score, see note) |
| P0 / P1 issues | 1 / 2 | 0 / 1 |
| Trip card on a phone: text visible after opening a style | no (179 px photo only) | yes (383 px card, 144 px body) |
| History entries added by opening a style | 0 | 1 (Back returns to the 10 styles) |
| Trails opening height at 390 | 14,616 px | 882 px |
| Rail facts with a label | 0 | all |
| Trip prices with the estimate mark | 0 | all |
| Country names in the reader's language (de, fr) | no | yes |
| Flags read out as "Flag of XX" | every flag | none |
| `verify_destinations` checks | 62 | 78 |
| design-lint violations, whole app | 9,231 | 9,230 |

Note on the re-score: the second score is not a fresh independent sub-agent review. It scores the round-one heuristics again from the after screenshots, the interaction shots and the harnesses. The skill caps verification at one confirming round, and the stored snapshot says how it was made.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Template literals and regexes lost their backslashes in `node -e` edits | The shell ate `\s` and `` ` `` | Re-made with the Edit tool; later edits went through script files (memory: heredocs eat backslashes) |
| The new harness checks found nothing (`els.slice is not a function`) | `$$eval` in a `String.replace` replacement became `$eval` (`$$` is the replacement pattern for one `$`) | The calls restored from a script file |
| The German check read English names | The harness's init script seeds `en` on every load, so the reload undid the switch | A second init script seeds `de` after it |

## Checks

| Check | Result |
|---|---|
| `verify_destinations` | 78 of 78 |
| `verify_explore` | 103 of 103 |
| `verify_journeys`, `verify_beaches`, `verify_lakes`, `verify_mountains`, `verify_places_tab`, `verify_trail_page` | all pass |
| `verify_trips` 42/42, `verify_trails` 34/34, `verify_paging` 7/7, `verify_layer_errors` 24/24, `verify_places_search` 41/41 | pass |
| Quality floor, 32 screens | 0 horizontal scroll, one h1 each, 0 skipped headings, 0 fake controls. The one failure is the 2 phone targets on the journey page (trips surface, T431, unchanged since T450). |
| design-lint | 0 new |
| banned terms | none |
| `npm test` | 375 of 375 |

## What is still open

The fact check found more than this task could honestly fix. Its MUST FIX items that come from the data are below. The reasoning and every example are in the fact-check notes of this task's session; each row names the examples.

- **T451-a. Trails still withholds walks until a country is picked.** Critique A's P1 asks for a Europe-wide or near-origin "Top-rated walks" rail and the starters before the pick. The trail layer loads one country at a time, so it needs a small top-walks wire, like `top.json` for beaches and lakes.
- **T451-b. Phone lists are photo tiles, not compact rows.** PRODUCT.md (T421) says compact rows, about 10 a screen; the Beaches list is 18,035 px on a phone. The owner said in the T428 brief that they like the images in the full list, so the tiles stay until the owner chooses.
- **T451-c. Wrong places from the data.**
  - Lake Constance is placed in "Vorarlberg, Switzerland".
  - Lake Bolsena is in the "Province of Rome" (it is Viterbo).
  - Dojran Lake is in "Kilkis Municipality, North Macedonia".
  - Preveli Beach is placed in Corinthia, and the place is printed in Greek script.
  - Aavasaksa is placed in the Scandinavian Mountains.
  - Mützenich walks (Germany) are listed under Belgium.
  - Bay of Kotor and Sado Estuary are listed as lakes, and Calanques de Piana as a beach.
  - Region and municipality names stay English on de and fr screens.
- **T451-d. The lift rule is too loose.** "OpenStreetMap maps a top station near the summit" marks Mont Blanc, the Matterhorn, Teide, Eiger, Dachstein, Dajti, Hochkönig, Śnieżka and Montserrat. The tab's words are now honest. The mountain page's "A cable car runs to the top" sentences (`mtn.whyLift*`) and the data rule still need the fix: a summit distance threshold, or the curated list.
- **T451-e. Cycling shows segments and our coverage as whole routes.**
  - Segments: "NCN National Route 1, 29 km", "Aare-Route, 43 km".
  - EuroVelo lengths are our coverage: EV2 "2,147 km, 3 countries" against about 5,500 km and 7.
  - Raw OSM names are shown: "75", "D1: Koper -> Sečovlje", "[Abschnitt E]", "[66]".
  - Two tours contradict their own pace band (Chilterns Cycleway, RAVeL W4, which is also listed twice).
- **T451-f. Card photographs carry no author or licence on the list pages.** Only the country galleries and the section heads are credited in the Sources fold. The beach, lake, mountain, ride and trip style photographs are credited only where their own page credits them. Many are CC BY-SA. A list-level credit line or a per-card credit is a product and legal decision.
- **T451-g. About 300 French and 60 German strings elsewhere are written without accents or umlauts.** fr.js is mostly lines 3400 to 4750; de.js lines 1211 to 1400, 2072 to 2510 and 3365 to 3982. This task fixed the ones on the Destinations tab. The rest need a language pass, with a reviewer, not a blind replace ("Quelle" and "neue" are correct as they stand).
- **T451-h. The country page pushes no history entry,** so Back from "About {country}" on Explore goes to the step before Explore. It belongs with Explore's own history (T444), and is left out here because the page closes through three different doors.
- **T451-i. The SHOULD FIX list of the fact check:**
  - translation drift: "Nature stays" in de, es and it; "Road trips" in es and it;
  - "Schneegebiet" (de): use "Skigebiet";
  - "scogliere di gesso" (it): means gypsum;
  - BE "a long sandy coast": the Belgian coast is 67 km;
  - doubtful beach tags: Nissi "Cliffs, Surf"; Navagio "sand";
  - "Excellent water" shown twice on one card;
  - trail times "4.4 h";
  - "Half a day to a day (5 to 20 km)".

## Rollback procedure

Revert the T451 commits in both repos. The tab, the pages, the strings and the rules return to the T450 state. No data, wire or deploy was touched. The two critique snapshots can stay or go; nothing reads them but impeccable's own polish and trend.
