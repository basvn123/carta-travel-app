# T878 to T883: Trips for you v2, the free direction

## Task ID

T878 to T883, one batch (CLAUDE.md "Batches"), branch `p15-trips-for-you-v2`.

## Date

2026-10-30

## Shared header

The owner reviewed the results page and the trip page of the plan flow from seven phone screenshots, asked for market research and a design, and approved the design published as an artifact ("Trips for you, rebuilt", versions 1 to 4). Three owner decisions shape the batch:

1. **The free direction** (2026-10-30): "You don't necessarily have to follow those constraints of carta". The design may put words on photos over a fade, use a richer layout and heavier figures. Then, after version 2: "make the colours a little more subtle ... make sure the colours fit in the carta colour choices of the other tabs". So the colours stay in Carta's palette (umber and its tints, blue-grey ink, rust for a warning, sun yellow for value, the four cost colours), with no new green or red.
2. **Wat het kost**: compact, modern, with icons, and "at the top a button where I can just click and see the breakdown".
3. **The match number**: "Blend, answers lead". The trip finder ranks by 60% answers and 40% place quality, and the badge shows that same number.

The research behind the design, from the published page:
- **Decision factors** (ETC 2026, Ipsos 2025, Eurobarometer 499, YouGov 2026): safety, weather and total cost lead; fit with interests, crowds and travel time follow.
- **Comparable apps:** Google Travel Explore, Kayak Explore, Skyscanner Everywhere and Airbnb.

**How the work was checked.** This cloud session could not load the travel data: `app_data/app_data.json` is not in the clone, and the network policy blocks the data host and the live site. So:
- **Per task:** static checks only (eslint on the touched files, `npm test`, `node scripts/ci/design-lint.mjs`).
- **One end check:** a throwaway harness page (`continent-app/__t884/`, deleted, never committed) rendered the real `TripsForYou` and `TripPage` with six synthetic trips in Dutch, through the app's own Vite config. The checks:
  - Playwright at 390x844 and 1440x900, on the list, the map, the sort menu, the trip page and the opened cost card.
  - Page errors and sideways overflow.
  - Whether each row's prices line up.
  - Whether the map draws its pins and time labels and syncs hover.
- **Map style:** the CARTO style is blocked here, so the map check used a stand-in background-only style served by Playwright.

Every task below lists the screens the owner's walk on real data should look at.

`DESIGN.md` is unchanged: no token in `01-tokens.css` changed. The carta-design skill gains a "Trips for you v2" section that records decision 1, so a later session keeps the look rather than reverting it.

---

## T878: one blended score ranks the trips and is the badge

### What changed

- **Ranking:** `rankTrips` used to rank by `Q + lambda (F - 0.5) + persona - budget sink`, while the badge showed `F`, the fit alone. So "Beste match" could put Rome at 62% above Corfu at 89% (the owner's screenshot). The trip finder now ranks by `blendOf(F, P, Q)`:
  - **Answers:** the fit F, mixed 75/25 with the persona's fit P when there is one.
  - **Weights:** answers 0.6, place quality Q / 10 0.4.
  - **Budget sink:** 0.3 points (of 10) per €100 over, now 0.03 on the 0 to 1 scale.
  - **Flight lever's pull:** scaled the same way.
- **Badge:** `match.pct` is `matchPct(score)`, 0 to 99, and still hides when the fit is under `match.show_min`. `match.fit` keeps the fit alone.
- **Unchanged:** Explore's For you and the rating.

### Files touched

`continent-app/config/recommend.json` (rank.blend and its note), `continent-app/src/lib/recommend/rank.js`, `continent-app/tests/recommendRank.test.mjs`.

### Commands run

`npx eslint src/lib/recommend/rank.js`, `node --test tests/recommendRank.test.mjs ...`, `npm test`.

### Config and secrets set

`rank.blend = { answers_w: 0.6, quality_w: 0.4, persona_w: 0.25 }` in `config/recommend.json`. No secrets.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Badge figure equals the sort key | no (badge F, sort Q + lambda (F - 0.5) + persona) | yes, asserted by the new test |
| Weight of the answers in the order | at most 1 point of about 10 (lambda 2, capped by owner decision 9) | 60% |

### What broke and how it was fixed

The test "without a budget the better place leads" assumed quality leads. With answers leading, the better-fitting place led instead. The test now uses a place that wins on both (Echo), so it still checks the budget sink.

### What is still open

- T878-a: the weights are a first setting; try them on answer sets the owner knows.
- T878-b: the batch is not deployed and was never run on the real catalogue.

### End check screens

Trips for you on Beste match: the list should fall by its badge figures. Explore's For you order should be unchanged.

### Rollback procedure

`git revert 78e2d7b50`. The old score and the fit-only badge come back.

---

## T879: the trip card, two a row on a phone

### What changed

- **Photo:** 4:5, carrying the name and the country over an ink fade, the match as an umber ring (SVG, `MatchRing`, shared with the trip page) and the heart.
- **Under the photo, four facts:**
  - the month's highs;
  - the time there with its stops, using a compact `shortDuration` ("3u 30");
  - the crowd tier as a four-bar meter, rust at "Overvol";
  - Best price on the cheapest whole total.
- **Price:** the total for the group, with the price a person under it.
- **Budget:** a thin ink bar, rust when over.
- **Top pick:** under Beste match, the top trip takes a whole row with two reasons on its photo.
- **Removed from the card:** the reason and the catch sentence (they stay on the trip page).
- **Grid:** 2 columns on a phone and 3 from 600 px.
- **Countries:** in the reader's language (`countryLabel`, `Intl.DisplayNames`): "Italië", not "Italy".
- **Price alignment:** the price block sits at the card's foot, so the prices of a row line up.

### Files touched

`continent-app/src/planner/finder/TripCard.jsx`, `TripsForYou.jsx` (the feat and best props), `finderText.js` (cardFacts, shortDuration, countryLabel), `continent-app/src/styles/87-trip-finder.css`, `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (tf.card.best, top, ppAll, ppPartial, facts, highs, way, crowd, budget, hm, h), `continent-app/tests/finderCard.test.mjs`.

### Commands run

eslint on the touched files, `node --test tests/finderCard.test.mjs tests/finderResults.test.mjs`, `npm test`, design-lint.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Trips a phone screen (390x844) under the top pick | about 1.3 (the owner's screenshot, one card a row) | about 4.4 (two a row, a 386 px row pitch in the end check) |
| Facts on the card that echo an answer | 0 (country, nights, bases) | 4 (highs, time there, crowds, budget) |

### What broke and how it was fixed

The end check found a trip with no photo at all: the flag-and-name placeholder drew its initials under the ring, because `.tff-photo` sets `display: block`. It is now a centred flag. Fixed in commit 4d32908e7.

### What is still open

- T879-a: a place without its own photo takes its country's best photo (the T810 rule). With the place's name now on the photo, Riva del Garda reads over the Trevi Fountain.
- T879-b: the two photo fades are `gradient` hits in design-lint. The lint already fails on `main` (168 lines before this batch), so the owner decides whether the fades go in the baseline.

### End check screens

Trips for you at 390 and 1440 px:
- a trip without a photo;
- a trip with a stop;
- the cheapest trip;
- a trip over budget.

### Rollback procedure

`git revert 4d32908e7 37e23c301`.

---

## T880: the toolbar, every answer as a chip, the map beside the list

### What changed

- **Answers:** every answer is a chip that reopens its question, replacing the one-line summary, "+N meer" and Antwoorden aanpassen.
- **Sort:** a menu (`SortMenu.jsx`, Explore's behaviour, its styles copied as `.tff-sortmenu` because the planner does not load Explore's stylesheet). Five sorts: Beste match, Goedkoopst, Snelst er (was "Kortste reis erheen", which wrapped), Warmst, Rustigst.
- **Quick filters:** Rechtstreeks, Binnen budget, Rustig, 25° of warmer, 1 uitvalsbasis (`QUICK_FILTERS`, `filterTrips`).
- **Empty result:** one line and "Filters wissen" when nothing passes.
- **From 1024 px:** the map stands beside the gallery (two columns there, three from 1440 px) with the picked trip floating on it, and "Kaart verbergen" in the toolbar.
- **Phone:** one dark Kaart pill floats above the nav.

### Files touched

`continent-app/src/planner/finder/SortMenu.jsx` (new), `TripsForYou.jsx`, `finderText.js`, `continent-app/src/styles/87-trip-finder.css`, the six i18n files (tf.sort.*, tf.quick.*, tf.view.*), `continent-app/tests/finderResults.test.mjs`.

### Commands run

eslint, `node --test tests/finderResults.test.mjs`, `npm test`, design-lint (the answer chip moved from a raw button to the kit Button).

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Sorts | 3 | 5 |
| Quick filters | 0 | 5 |
| Answers visible without a tap | about 4, then "+4 meer" | all, as chips |

### What broke and how it was fixed

The T868 sort test pinned three sorts. It now pins five, and a new test covers warmest, quietest and the filters.

### What is still open

T880-a: `SortMenu` duplicates the one inside `ExploreTab.jsx`. Share one component when a task may touch Explore.

### End check screens

Trips for you at 390 px (the chips scroll, the Kaart pill) and at 1440 px (the split). Also the sort menu, each quick filter, and the empty state.

### Rollback procedure

`git revert e01231c81` (after T883's commits if those stay, since T883 extends this file).

---

## T881: the trip page leads with the place and why it fits

### What changed

- **Phone head:** the name, the country, the dates and the match ring lie on the first photo over an ink fade.
- **From 769 px:** the head follows the gallery. It is rendered once, so the page keeps one h1.
- **Who it is for:** the lede, no longer its own section.
- **Facts:** tiles with an icon on umber 50.
- **Why it fits:** moved up, right after the facts. It shows For and Against as two cards (the old "Het nadeel" folded in), then the bars. A like under 20% says "Weinig hiervan in de buurt" under its bar.
- **When to go (new):** each month's daytime high as a bar and its crowd tier as a dot, the trip's month in the action brown. A screen reader hears one sentence a month.

### Files touched

`continent-app/src/planner/finder/TripPage.jsx`, `TripCard.jsx` (MatchRing exported), `continent-app/src/styles/87-trip-finder.css`, the six i18n files (tf.why.for, against, miss; tf.when.*).

### Commands run

eslint, `npm test`, design-lint.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Position of Waarom het past on the page | 6th section | 2nd, after the facts |

### What broke and how it was fixed

Nothing in the end check.

### What is still open

T881-a: the design's price by month (the month bars as totals, "€310 minder in oktober") needs a per-month total from the engine. The strip shows highs and crowds only.

### End check screens

The trip page at 390 px (the head on the photo; a trip without photos keeps the head under the gallery) and at 1440 px. Also a multi-base trip, and a like under 20%.

### Rollback procedure

`git revert 311c6a93f`.

---

## T882: Wat het kost, compact

### What changed

- **Closed by default:** "Wat het kost" with **Opbouw** at its top right, the total, the price a person, a 6 px cost bar and the budget line.
- **Opbouw:** folds open the four lines, each with its icon (plane or car, bus, bed, cutlery) on a tile in its cost colour. A line with choices still opens its picker.
- **Public transport with no fare found:** shows Nog niet beschikbaar instead of € 0,00.
- **Under 1024 px:** a bar pinned above the nav holds the total and Plan deze reis, and the card's own button hides, so one primary shows at a time.

### Files touched

`continent-app/src/planner/finder/TripPage.jsx` (PriceCard, PlanDock), `continent-app/src/styles/87-trip-finder.css`, the six i18n files (tf.cost.open, close, lines).

### Commands run

eslint, `npm test`, design-lint.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Height of the price card, closed (390 px, four lines) | about 760 px (the owner's screenshot) | about 330 px |
| Onderweg, public transport without a fare | € 0,00 | Nog niet beschikbaar |

### What broke and how it was fixed

Nothing in the end check.

### What is still open

- T882-a: price public transport where no transfer, hop or local fare is found. `localOf` in `adapters/local.js` returns 0.
- T882-b: a typical fare when the sweep holds none, so a trip months ahead can say "alles inbegrepen". The owner chooses the source.
- T882-c: Rome cost the same € 2.119 in June and in September in the owner's screenshots; check whether the stay price follows the month.

### End check screens

The trip page at 390 px: the dock above the nav, Opbouw open and closed. At 1440 px: the sticky card. Also a trip over budget, and a drive.

### Rollback procedure

`git revert 36b6fcb84`.

---

## T883: the trips map, photo pins and the lines from home

### What changed

- **Pins:** each shows the place's photo in a round thumbnail and the group's total; the name is in its label and title.
- **Pin states:** the cheapest pin is best-value yellow, the picked one the action brown.
- **Lines from home:** a curved line runs from the home airport (`finder.origin`, passed through `FindingTrips`) to every trip, with the time there at its middle. Dashed for a flight, solid for a drive; the picked trip's line is brown. The colours come from `tokenColour`.
- **Hover sync:** beside the list, a card and its pin light each other up under the pointer.
- **Camera:** keeps the pins clear of the floating card (`pad`).

### Files touched

`continent-app/src/planner/finder/TripsMap.jsx`, `TripsForYou.jsx`, `FindingTrips.jsx` (the home prop), `continent-app/src/styles/87-trip-finder.css`.

### Commands run

eslint, `npm test`, design-lint (ring shadows became outlines).

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Height of the map frame in the end check | 0 px (nothing drawn) | fills its box; 6 pins, 5 time labels, hover sync 1 of 1 |

### What broke and how it was fixed

The end check found the map frame 0 px high. `maplibre-gl.css`, loaded later with the map's chunk, sets `.maplibregl-map { position: relative }` over the finder's `position: absolute; inset: 0`. The rule dates from T867 to T869, so production's Kaart view very likely draws nothing today. The fix is `.tff-map-frame.maplibregl-map { position: absolute }`.

The first camera padding (left) squeezed the pins into a corner, so it became bottom padding. Both are in commit 5311b3529.

### What is still open

- T883-a: pins and time labels overlap where places sit close (Garda, Annecy, Split, Rome at Europe's zoom).
- T883-b: confirm on the live site, after the deploy, that the Kaart view draws its map.

### End check screens

The Kaart view at 390 px and the split at 1440 px with the real CARTO style. Also: hover a card, pick a pin, and a drive trip's solid line.

### Rollback procedure

`git revert 5311b3529 b915661eb`. Keep the frame fix if only the pins go.

---

## Rollback of the whole batch

`git revert 5311b3529 4d32908e7 b915661eb 36b6fcb84 311c6a93f e01231c81 37e23c301 78e2d7b50`, newest first. Nothing was deployed. No data or schema changed. Saved trips are untouched: the trip objects only gained `match.fit`.

## Notes on filling this template

- One report for the batch, a section per task with the template's headings.
- The batch has no deploy, so no Pages id and no entry hash.
- The end check ran on synthetic trips; it shows layout and behaviour, not real prices or real photos.
