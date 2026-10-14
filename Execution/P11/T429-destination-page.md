# T429: The destination page, open and visual, with one price

## Task ID

T429

## Date

2026-10-14

## What changed

The page a traveller opens from Explore (Rome is `#dest=FCO`) was rebuilt to the owner's brief of 2026-10-13 and the three calls the owner made today: When to go then Things to do lead, six sections open with at most five folded rows, and colour comes from photography.

**Before.** A photo strip, a head, then a 380 px right column holding the first-run receipt, the cost fold, When to go and nine more folded rows, three screens long beside an empty left half. The receipt carried the method sentences the owner named ("Priced for 2 people and 7 nights: the bed measured in Rome, the food at the national basket...", "Tap a segment for its figure", "At the dorm bed rate it would be..."). Fold summaries carried counts ("10 ideas", "12 sights", "6 tips"). Every photograph showed "N of 8" and long names were cut. The page printed "€87" where the Explore card printed "~€87 est.", and its receipt priced the stay on a second, seasoned basis (about €99.54 a person a day).

**After, top to bottom:**
- **Page bar:** back or close, the place name once scrolled, save (Explore's bookmark) and share as kit IconButtons. "Expand all" is gone.
- **Gallery:** the same strip, each photograph named in full under it on up to two lines, the credit on a small second line, no position figure. On a phone the next photograph peeks in and the arrows stay, so a swipe is never the only way.
- **Head:** the place, the Score with its band (a link to "Why it rates"), the hidden gem mark (new on this page, 302 places), country and rank, UNESCO as a status chip, the short intro.
- **Key facts:** four to six label-over-value facts: best months, the traveller's month (only with their own dates), crowds, nearest airport, car, time here.
- **Price card** (new `DestPriceCard`): the day at the traveller's Lifestyle with the estimate mark, then Dates, People and Stay rows, then the page's one primary "Plan a trip here" and "Plan a day here", then the stay's receipt, and one line "Excludes flights, local transport and tickets." with "Add your fare". On a phone it sits in the flow after the key facts; from 1024 px it is a sticky side column that fits 1280 x 720 with the primary in view.
- **Six open sections:** When to go (month strip, cheap-stay months, crowds, bathing water, the next 7 days); Things to do (a photo track, or text tiles where fewer than half the items have a photograph); the highlights map (mounted when it comes near the view) with a numbered photo track under it; Walk and ride (a photo track of trails, beaches, lakes and peaks, then the routes that pass the town); Getting there; Day trips (a photo track of trips and paired places, then the villages inside).
- **Five folded rows at most:** Why it rates, Where to sleep, Insider tips, Festivals and events, Where to park and what to bring (merged).
- **Exits** to the booking sites as links, with the "prices may have changed" line; then Download PDF and Report a problem.

**One cost truth (closes T385-a).** The day figure is the `computeCosts` row the card and the pin print, and the total is that day times the nights and the party (`lib/destPrice.js`, 7 unit tests). The Stay row opens the one Lifestyle panel. Rome reads "~€87 est." on the Explore row, the pin and the page; `verify_explore` now checks the row and the page agree. The trip total changes basis with it: Rome, 7 nights, 2 people, is €1,220.38 on the page where the old receipt said about €1,393.58, because the Lifestyle basis has no seasonal bed and no cleaning or platform fee. Row T429-b asks the owner to confirm that.

**Bugs fixed on the way:**
- The Lifestyle panel opened BEHIND the page (page z 240, panel 58/59), so the old cost fold's "Change" showed nothing. It now opens over the page, and Escape closes the panel, not the page.
- The section rail selected the wrong section ("Trips" while When to go was in view), because the sections sat in two columns. It now follows one column.
- Explore's hover preview (shared receipt, row T427-c) lost its "city" and "country" words; its figures carry the estimate mark instead.

## Files touched

**Created (app):**
- `continent-app/src/browse/DestPriceCard.jsx`
- `continent-app/src/browse/DestTrack.jsx`
- `continent-app/src/lib/destPrice.js`
- `continent-app/tests/destPrice.test.mjs`
- `continent-app/scripts/measure_destination_page.mjs`

**Modified (app):**
- `continent-app/src/browse/DestinationPage.jsx` (the page)
- `continent-app/src/browse/ClimateStrip.jsx` (no key line or best line in figures mode)
- `continent-app/src/browse/RatingBreakdown.jsx` (no method sentence)
- `continent-app/src/browse/Neighbourhoods.jsx` (no basis note)
- `continent-app/src/browse/RoutesFromHere.jsx` (a `limit` with See all; no coverage sentence)
- `continent-app/src/components/FirstRunReceipt.jsx` (`FlightSheet` exported, nothing else)
- `continent-app/src/components/CostSummary.jsx` (T427-c: Money with the estimate mark; dead branches removed)
- `continent-app/src/styles/64-v6-destination.css` (the page's rules, rewritten)
- `continent-app/src/styles/24-destination-workspace.css`, `25-feature-pages.css`, `26-shortlist-extras.css`, `38-first-run.css` (stale page rules deleted)
- `continent-app/src/i18n/{en,de,nl,fr,es,it}.js` (19 keys each)
- `continent-app/scripts/verify_destination_page.mjs` (rewritten for the new contract), `verify_explore.mjs`, `smoke-nav.mjs`, `verify_routes_block.mjs`, `verify_keyboard.mjs`
- `continent-app/scripts/ci/design-lint.baseline.json` (shrunk; no new entries)

**Created (root):** this report, `Execution/P11/T429-shots/` (before and after, Rome and Valbona, phone 390, desktop 1280 and 1440).

**Modified (root):** `Execution/_OPEN.md`.

## Commands run

```
git checkout -b p11-destination-page            # root and continent-app
npm run build                                    # before (local data)
npx vite preview --port 5297 --strictPort
node scripts/measure_destination_page.mjs --port=5297 --label=before --shots=../Execution/P11/T429-shots
npm test                                         # 375 of 375
npx vite build                                   # after each batch
CARTA_PORT=5297 node scripts/verify_destination_page.mjs
CARTA_PORT=5297 node scripts/verify_explore.mjs
CARTA_PORT=5297 node scripts/verify_routes_block.mjs
node scripts/smoke-nav.mjs http://localhost:5297/
node scripts/verify_quality_floor.mjs t429 --port=5297 --only=pages --out=<scratch>
node scripts/ci/design-lint.mjs --update-baseline && node scripts/ci/design-lint.mjs
node scripts/ci/token-contrast.mjs
impeccable detect --json <the page's files>
ONLY=destination-page RUNS=3 node scripts/perf/baseline_vitals.mjs   # then git checkout the report file it writes
node scripts/measure_destination_page.mjs --port=5297 --label=after --shots=../Execution/P11/T429-shots
```

Two harnesses ran as untracked copies with one line changed: `verify_handoffs` (its fixed port 4211 was held by another session, row T429-e) and `verify_keyboard` (its destination entry waits for Explore's pre-T427 `.xcard`, row T429-c).

## Config and secrets set

None. The local build leaves `VITE_DATA_BASE` unset so the data stays same-origin; `build:pages` forces the live data host, which does not answer localhost.

## Before/after measurements

Measured by `scripts/measure_destination_page.mjs` on a local build, words counted in visible text on the first screen inside the page.

| Metric | Before | After | Delta |
|---|---|---|---|
| Words on the first screen, Rome, phone 390 | 171 | 135 | -21% |
| Words on the first screen, Rome, 1280 x 720 | 220 | 168 | -24% |
| Words on the first screen, Rome, 1440 x 900 | 239 | 201 | -16% |
| Words on the first screen, Valbona, phone / 1280 / 1440 | 185 / 219 / 241 | 123 / 157 / 190 | -34% / -28% / -21% |
| Folded rows, Rome / Valbona | 14 / 12 | 5 / 3 | -9 / -9 |
| Sections open without a click | 0 | 6 | +6 |
| When to go starts, phone, in screens (T385-c target under 2) | 2.2 | 1.82 | -0.38 |
| When to go starts, 1280 x 720, in screens | 2.19 | 0.9 | -1.29 |
| Primary in view at load, 1280 x 720 and 1440 x 900 | no, no | yes, yes | fixed |
| Primaries on the page | 1 | 1 | 0 |
| Day figure the page prints, Rome | €87 (no mark) | ~€87 est. | same as card and pin |
| Controls under 44 px, phone (stretched card links excluded) | 0 | 0 | 0 |
| Raw buttons, DestinationPage.jsx (design-lint meter) | 20 | 0 | -20 |
| Layout shift (CLS), desktop / phone, `#dest=gem:valbona` | 0.0099 / 0.0002 | 0 / 0.0038 | -0.0099 / +0.0036 |
| Page height, Rome, phone / 1440 | 3,021 / 2,556 px | 5,258 / 4,072 px | +2,237 / +1,516 px |

The page is longer because six sections are now open, which is what the owner chose; what a reader meets first is shorter and its price and primary come sooner. The phone layout shift that remains (0.0038) comes from a Journeys card on the tab behind the page, not from this page. T200-b's 0.309 had already been fixed by T271; this task re-measured it and closes the row.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Photo tracks rendered as a row beside their heading | `.dtrack` is the day carousel's class (32-day-carousel.css) | Renamed to `.dphoto-*` |
| Primary below the fold at 1280 x 720 | The receipt sat above the buttons in the card | Buttons under the inputs, the receipt after them |
| Card's top lost above the screen with the calendar open | A sticky column taller than the view | The side column caps at the view's height and scrolls inside |
| Lifestyle panel invisible from the page | z 58/59 under the page's 240 | `body:has(.destp)` lifts scrim and panel, desktop panel from the top |
| Grey squares for things without a photo | Many do items have no Commons match | Photo items lead; under half with photos turns the track to text tiles (row T429-g) |
| Desktop layout shift 0.0495 | Slides took their width only when each photograph loaded; one gallery item has no recorded size | `width`/`height` from the dossier, a 4:3 frame where none is recorded |
| Focus ring on track cards clipped | The kit draws it 2 px outside the card, inside a scroller | Drawn 3 px inside the card edge in tracks |
| Forecast day names and the crowd year at 10.5 and 11 px | Explore's shared rules | Set to the caption size on this page |
| Photo credits 24 px tall on desktop | Inline link | Hit area grown to 32 px into the band's padding |
| Map 300 px with a 360 px slot | DestMap sets its own inline height | One height, 320 px, passed and held by the placeholder |

## What is still open

Each item is one row in `Execution/_OPEN.md`.

- **T429-a** (owner): native review of the 19 new strings in five languages.
- **T429-b** (owner): confirm the trip total's new basis. The page now totals the Lifestyle day (Rome 7 nights for 2: €1,220.38), where the old receipt added a seasonal bed and fees (about €1,393.58). If season should count, a later task puts it into the shared day figure so card, pin and page still agree.
- **T429-c**: `verify_keyboard`, `smoke-nav` and `perf/baseline_vitals` still look for Explore's pre-T427 `.xcard`. Smoke-nav's destination step is skipped because of it.
- **T429-d**: `verify_keyboard`'s ring test diffs 6 px around the focused element, so the kit Card's ring, drawn on the card around its stretched title link, reads as missing (40 false stops here). A screenshot of a keyboard-focused card shows the ring.
- **T429-e**: `verify_handoffs` hardcodes port 4211.
- **T429-f**: two dead rules in Explore's files (`.cost-assumes-edit`, `.cost-level`), left because those files are outside this task.
- **T429-g**: Things to do lacks a photograph for many items; the dossier could carry one per item.
- **T429-h**: data seen on the page: a gallery credit "0, CC BY 3.0" (Valbona), and the Lifestyle panel's trade-off line naming "Rome (Fiumicino)".
- **T429-i**: `ExploreMap.jsx:621` fails eslint (`react-hooks/exhaustive-deps`); it predates this task.
- **T427-b** stays open: a "Recently viewed" write point was not part of this task.

carta-design's seven questions, answered for this page:
1. No hex outside the token file: design-lint 0 new, the page CSS is tokens only.
2. No gradient or off-palette colour: none; token-contrast 0 under the floor.
3. Brown only for the primary, links, the selected rail item, the committed map pin, the star and the gem; no yellow; every selected state is a tint.
4. Figures at 12 px or more, tabular; every euro through `formatMoney` via `<Money>` or the receipt.
5. One primary (checked at 390, 1280 and 1440); no text on a photograph.
6. Headlines carry a verb or a number, or are plain section names; no counts, method lines, dashes or middots (checked by the harness on the page's text).
7. Removed: the receipt's sentences, the evidence meters, Expand all, the webcams fold, the figure footer, "N of 8", the bed-basis note, the rating method line, the routes coverage line, the separate price-report link.

## Rollback procedure

In `continent-app/` and at the root: `git revert -m 1 <merge commit of p11-destination-page>`, then rebuild. No data, schema or deploy changed. The fold memory moved to the session key `carta.destFolds.v2`, which a revert simply stops reading. A fare typed on the page keeps its store key (`dest:{id}`), which the first-run receipt reads, so no fare is lost either way.
