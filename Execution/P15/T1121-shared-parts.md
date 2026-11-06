# T1121: shared parts that exist once

Roadmap item: **G2** (session S37). Branch `p15-s37-shared-parts`.

## Date

2026-11-06

## What changed

The place head, the carousel arrows, links styled as buttons, the short centred sheet and five price-line parts now exist once each, in `continent-app/src/components/ui/` (and `PriceDock` / `WayFig` in the place template). Every call site that wrote one out by hand now uses the shared part, and no screen looks different. Seven new parts or props:

- `PlaceHead` and `PlaceTag`: 3 copies before (place page, outdoor item pages, journey page).
- `CarouselArrows`: 6 hand-written arrow pairs before (photo strip, mosaic and tile carousels, country gallery, item track, Explore section rails).
- `Button href`: 14 hand-written `<a className="btn ...">` in 12 files.
- `DialogSheet`: FlightSheet and RatingSheet frames.
- `SlotText`, `MoneyUnit`, `WayFig`: a sentence with a Money in its slot (3 copies), a figure plus unit (3), a way figure (3).
- `PriceDock`: now also draws the outdoor pages' dock (2 copies).
- `DayFrom className`: TripStylesRow's copy of the "From {eur} a person a day" line.

I checked "looks the same" three ways:

- **Full-page DOM.** HEAD and the branch ran side by side, with `#root` dumped on 10 screens at 390 and 1440 (20 dumps). The DOM is identical apart from three known differences:
  - the `rel` token order on external links;
  - an `is-next` class on three arrow kinds that lacked one (no CSS rule reads it);
  - URL-state timing in header and footer links, which differs between two runs of the same code.
- **Pixels.** The viewport screenshots are pixel-identical, except the home page, whose playing film differs between two captures of the same code.
- **Tests.** A new SSR test rebuilds each old hand-written markup and asserts byte-equal HTML against the shared part. Its source guards fail if a duplicate comes back.

The styleguide gains a "Page parts" section and a `Button href` demo. The CSS is unchanged and the HANDBOOK is not touched (no feature behaviour changed). Cards, most sheets and the remaining price lines differ in markup between copies, so folding them would change the DOM; they are inventoried below and left as register rows.

## Inventory

| Family | Implementations found | How they differed | Done here |
|---|---|---|---|
| Place head | DestinationPage, OutdoorParts (`OxShell`), JourneyPage | Journey puts "where" on its own line with no meta row; Outdoor has a subtitle and an optional flag; Destination always shows the meta row | Folded: `PlaceHead` (`whereLine`, `sub`, `score`, `tags`, children) |
| Standing tags | DestinationPage, OutdoorParts (`li.pt-tag.is-rank/is-unesco`) | Same markup | Folded: `PlaceTag` (tone rank or unesco) |
| Carousel arrows | PhotoGallery strip (`destp-gallery-arrow`), mosaic (`pmos-arrow`), tile (`tphotos-arrow`), CountryGallery (`dgal-arrow`), Track (`itrack-arrow`), SectionOpening rails (`dtab-arrow`) | Tone, chevron size, labels, ends (index, pixel ends or none), aria-hidden on tiles, aria-controls on the track | Folded: `CarouselArrows` |
| Button links | DayOverview, ReadyToBook, BookPasses, trip/Journey, TripItinerary (3), SettleUp, OutdoorParts `OxLinkButton`, DestPriceCard, HomeTry, HomeProof, DestPractical, wizard/StepStays | Variant, size, icon before or after, bare glyph or wrapped, sr-only note | Folded: `Button href`, `external`, `iconAfter` |
| Centred sheet (`frr-*`) | FlightSheet, RatingSheet | Id, title, body; FlightSheet keeps Escape for its airport list | Folded: `DialogSheet` |
| Bottom sheets (`fsheet-*`) | SheetShell (shared) plus PlacesFilterSheet hand-rolled | Its own trap, drag, `is-closing` and a footer | Open, T1121-b |
| Other modals | PassModal, LegalDoc, App share offer (`shell-scrim`), UploadForm, PhotoGallery AllPhotos, StartDialog, SearchDock, AuthModal, AiDayPlanModal, lifestyle sheet | Exit animation, trap options, scrim handling | Open, T1121-b |
| Sentence with a Money | ExploreRails `withNode`, TripStylesRow and JourneyCards `withMoney` | Identical | Folded: `SlotText` and `lib/slot.js` |
| Figure plus unit | CountryPage, RegionPage (`rgnp-unit`), DestinationPage similar places (`pt-sim-unit`) | Unit class | Folded: `MoneyUnit` |
| Way figure | DestPractical, JourneyPage (2) | Value and unit only | Folded: `WayFig` |
| Price dock | PriceDock, OutdoorParts dock | `ox-dock` class, a note in place of the inputs button | Folded: `PriceDock` (`className`, `note`) |
| "From x a day" line | DayFrom, TripStylesRow copy | Wrapper class | Folded: `DayFrom className` |
| Price lines, other | DestPriceCard total, TravelView `ac-proof-fig`, ExploreMap `xmap-fig`, OutdoorParts `ox.stayPrice`, KeptTrips and TogetherSheet unit strings | Different classes and structure | Open, T1121-c |
| Cards | About 17 hand-rolled (DestCards `places-bcard` x4, `places-card`/`icard`, TripCard x3 (`tff-card`, `wtrip`, `tg-fp`), PlaceCard x3 (`daya-card`, `dayex-card`, `xpc`), story cards x3, SpotCard, TripPlaceCard, DayCard x2 on `tday`); about 10 already on `ui/Card` | Own BEM roots and structure each | Open, T1121-a |
| Chip tones rank, UNESCO | `pt-tag` (28 px pill) vs `Chip status` (24 px, small radius) | Different size and shape | Open, T1121-d (the tag now has one implementation, `PlaceTag`) |

## Files touched

- Created:
  - `continent-app/src/components/ui/PlaceHead.jsx`
  - `continent-app/src/components/ui/CarouselArrows.jsx`
  - `continent-app/src/components/ui/DialogSheet.jsx`
  - `continent-app/src/components/ui/SlotText.jsx`
  - `continent-app/src/lib/slot.js`
  - `continent-app/tests/sharedParts.test.mjs`
  - `Execution/P15/T1121-shared-parts.md`
- Modified, components: `continent-app/src/components/ui/Button.jsx` (href mode), `continent-app/src/components/ui/Money.jsx` (`MoneyUnit`), `continent-app/src/components/ui/index.js`, `continent-app/src/components/FlightSheet.jsx`.
- Modified, browse: `continent-app/src/browse/` DestinationPage, OutdoorParts, JourneyPage, PageTemplate (`PriceDock` note and className, `WayFig`), PhotoGallery, CountryGallery, SectionOpening, Track, RatingSheet, CountryPage, RegionPage, DestPractical, DestPriceCard, ExploreRails, TripStylesRow, JourneyCards, `home/HomeTry`, `home/HomeProof`.
- Modified, planner: `continent-app/src/planner/` DayOverview, TripItinerary, `trip/ReadyToBook`, `trip/BookPasses`, `trip/Journey`, `wizard/StepStays`.
- Modified, other: `continent-app/src/together/SettleUp.jsx`, `continent-app/src/styleguide/StyleGuide.jsx` (Page parts section, Button href demo).
- Modified, project files:
  - `ROADMAP.md` (G2 status only)
  - `Execution/_OPEN.md` (T1121 rows appended; T1024-c, T1027-c, T1039-b moved out)
  - `Execution/_OPEN-CLOSED.md` (those three rows, closed by T1121)
- Not committed: `Execution/P15/T1121-shots/` (DOM dumps and screenshots).

## Commands run

- `cd continent-app && npm ci && node scripts/sync-data.mjs --split-only`. This builds the gitignored boot index and `public/dest/` from the shipped `public/app_data.json`, as T1111 did.
- A HEAD worktree in the scratchpad (node_modules and the generated `public/boot.json` and `public/dest` linked in), served with `npx vite --port 5238`; the branch on `npx vite --port 5237`.
- Playwright capture scripts (scratchpad):
  - `cap.cjs`: the region DOM and viewport screenshots, 6 screens x 2 widths.
  - `cap2.cjs`: the full `body` DOM, 10 screens x 2 widths, the rating sheet opened by its button.
  - `px.cjs`: element screenshots of the rail and track arrows on both servers.
- `npx eslint src`, `npm test`, `node scripts/ci/design-lint.mjs --self-test`, `node scripts/ci/design-lint.mjs`. The same three were run on the HEAD worktree for the baseline.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Place head implementations | 3 | 1 | -2 |
| Carousel arrow pair implementations | 6 | 1 | -5 |
| Hand-written button links (`<a className="btn`) | 14 | 0 | -14 |
| `frr` sheet frames | 2 | 1 | -1 |
| Slot helpers (`withMoney`/`withNode`) | 3 | 1 (`SlotText`) | -2 |
| Figure plus unit, way figure, price dock copies | 3, 3, 2 | 1, 1, 1 | -5 |
| `npm test` | 1,481 tests, 1,476 pass, 5 skipped | 1,486 tests, 1,481 pass, 5 skipped | +5 tests |
| eslint `src` | 0 errors, 163 warnings | 0 errors, 163 warnings | 0 |
| design-lint | 7,692 found, 5 outside the baseline | 7,692 found, the same 5 outside the baseline | 0 |
| Full-page DOM, 20 screen-width dumps | | identical except `rel` order, `is-next` and URL-state timing | 0 visible |
| Viewport pixels, 12 screenshots | | 10 identical; home (playing film) differs between two runs of the same code too | 0 |
| Bundle size | Not measured (no number promised) | | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First home capture at 390 showed one extra "Try it" link | The section renders on its own timing; a second capture matched the baseline exactly | Re-captured; DOM identical |
| `IconButton`/`As` aliases flagged as unused by eslint | The config has no `jsx-uses-vars`, so a component held in a lowercase-free alias reads as unused | `PlaceHead` renders `<p>` or `<span>` directly |
| The source guard found two more button links (TripItinerary stay links, StepStays) | Multi-line `<a>` my first grep missed | Folded them too |
| The guard found three more arrow pairs (CountryGallery, Track, SectionOpening) | Not named in T1024-c | `CarouselArrows` took `tone`, labels, `atStart`/`atEnd`, `controls`; folded |
| design-lint reports 5 violations outside its baseline | Already on the base branch (`AroundHere.jsx` raw buttons, `69-v6-account.css` literals), not in a file this task touched | Left alone, row T1121-e |

## Screens checked

- Old (HEAD) and new side by side, at 390 x 844 and 1440 x 900:
  - home and Explore;
  - the place page `#dest=FCO`, plus its rating sheet;
  - trail `#trail=20050&tc=AT`, beach (Strandbad Klagenfurt) and journey (Julian Alps trail running);
  - region (Sithonia), country (Italy), and Explore trip styles.
- Seen: identical DOM and pixels as described above. The arrows on the region rails and the journey track are pixel-identical in element screenshots.
- Not seen in a browser:
  - the flight sheet (its opener needs a priced flight line, which this container has no fares for);
  - the trip planner screens (DayOverview, ReadyToBook, BookPasses, trip Journey, TripItinerary, SettleUp, StepStays), which need a saved trip.

  Their folds are covered by the SSR equality test instead, and the G11 end check takes them (row T1121-f).

## What is still open

- **T1121-a.** About 17 hand-rolled card implementations each carry their own class root and structure. Folding them onto `ui/Card` changes the DOM and the CSS, so it belongs with G7's CSS consolidation and needs a written card rule first.
- **T1121-b.** PlacesFilterSheet copies SheetShell with its own trap, drag and `is-closing`. The `shell-scrim` modals (PassModal, LegalDoc, App share offer), UploadForm and PhotoGallery's AllPhotos each hand-roll a scrim. Moving them onto SheetShell or DialogSheet changes their exit motion, so it fits G5 (motion).
- **T1121-c.** The remaining price lines differ in markup and classes:
  - DestPriceCard's total (an unclassed unit span);
  - TravelView `ac-proof-fig`;
  - ExploreMap `xmap-fig`;
  - OutdoorParts `ox.stayPrice`;
  - the KeptTrips and TogetherSheet unit strings.

  One price line is G3's cost card work.
- **T1121-d.** T1024-b stays open. The rank and UNESCO tag has one implementation (`PlaceTag`), but a Chip `status` is 24 px with a small radius and the tag is a 28 px pill. Making them one Chip tone is a look decision, so it waits for G1 approval (T1111-a).
- **T1121-e.** design-lint fails on the base: 5 violations outside the baseline in `AroundHere.jsx` and `69-v6-account.css`, from an earlier wave. The task that owns those files should fix them; this task did not add any.
- **T1121-f.** The trip planner screens and the flight sheet were checked by SSR equality, not in a browser. The G11 end check (or the batch end check) should look at them with a seeded trip.

## Rollback procedure

`git revert` of the T1121 commits. Nothing is one-way: no data, no migration, no CSS change.

## Owner steps (for the checklist)

None. Every open item is for a next task.
