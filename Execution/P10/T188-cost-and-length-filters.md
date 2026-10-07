# T188: cost band and trip length filters

## Task ID

T188 (mind-map number T341), branch `p10-cost-length-filters` in both repos, built on T101 (`p6-i2-seven-days`) in the same worktrees.

## Date

2026-10-07

## What changed

The curated trip list, the page that opens when a trip style is chosen in the Trips category, now carries two filters above its cards: the length the list is read at and a cost band. It is the one place curated trips are browsed (`src/browse/JourneysSection.jsx`; the trip page's exits are not a browse list). The composed city routes, the other trips product, already had their own day-count filter (`TripLengthSlider` in `DestinationsTab.jsx`) and carry no price, so they are untouched and a cost band there is register row T188-a.

Trip length is not a filter that drops trips. After T101 every trip exists at two lengths, so a length cannot exclude one; the choice is therefore two buttons, "The whole week, 7 days" and "The short version, 3 or 4 days", one always pressed. It sets the days each card shows, the total each card shows and the total the cost band tests, and it is the same remembered choice (`carta.tripLength`) the trip page opens on: tap a card with the short version chosen and the trip opens on its short version. The default is the week, as before.

The cost band tests a card's total at the chosen length. There are three bands, "Under 1,050 euros", "1,050 to 1,350 euros" and "Over 1,350 euros" on the week, and "Under 550 euros", "550 to 750 euros" and "Over 750 euros" on the short version, plus "Any cost". The edges are not constants. They are the one-third and two-thirds points of the whole library's totals at that length, rounded to the nearest 50 euros (`costEdges` in `src/lib/tripFilters.js`, fed by `loadAllJourneyCards`), so a band holds about a third of the 253 trips and follows the wire when it changes instead of going stale in a document. On the current wire the week splits 88, 81 and 84 and the short version 84, 91 and 78. A card's total is the midpoint of its authored range (the short version's is the range scaled by its share of the week, `cardTotal` in `src/lib/tripLength.js`). Each band button carries how many trips in the open style it would show, counted after the search and the country filter, so a button never promises a trip the others have already removed.

How it composes. The rows are the style's trips, then the tab's search field and country filter (unchanged), then the band, in that order. The band counts read from the rows before the band, so they add up to the list. Nothing in the existing filters was changed. An empty result says "No trip in this style fits those filters." when the style has trips the filters removed, and the older country and style messages when it does not. "Clear filters" appears while a filter is on and returns the list to the week and any cost.

The card itself now shows its days and total at the chosen length, for example "3 days, 334 to 536 euros", and drops the authored tier symbols while a total shows, because the total says the same thing and the line was already cutting off the months at three cards across.

## Files touched

All in the app repo (`continent-app/`, commit `79449f54118c0d8e9bfd9ae395bb906b6e4a8670`), plus this report and the register in the root repo.

**Modified:**
- `continent-app/src/browse/JourneysSection.jsx` (the two filters, the card at the chosen length, the empty state)
- `continent-app/src/i18n/en.js`, `de.js`, `es.js`, `fr.js`, `it.js`, `nl.js` (ten keys each, after `journey.lenNoteWeek`, additions only)
- `continent-app/src/styles/43-trip-length.css` (the `.tf-*` rules, appended; the file is T101's, and the prompt allows both tasks to use it)
- `Execution/_OPEN.md` (rows T188-a to T188-e appended)

**Created:**
- `continent-app/src/lib/tripFilters.js`
- `continent-app/src/browse/TripFilters.jsx`
- `continent-app/tests/tripFilters.test.mjs` (5 tests)
- `Execution/P10/T188-cost-and-length-filters.md`

**Deleted:** none.

## Commands run

In `C:\Users\Gebruiker\Documents\Portfolio\wt\T101-app`, with `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` unset in every shell:

```
git checkout -b p10-cost-length-filters
node --test tests/tripFilters.test.mjs
npm run lint
npm test
node scripts/ci/design-lint.mjs
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm run build
node node_modules/vite/bin/vite.js preview --port 5211 --strictPort --host 127.0.0.1
node ../T101-shots/shoot188.mjs
node ../T101-shots/shoot.mjs
rm -rf dist dist-data
```

The scripts (`shoot188.mjs`, `shoot.mjs`, `measure188.mjs`, `add_keys.py`, `keys3.json`) and the screenshots (`188-*.png`) are in `C:\Users\Gebruiker\Documents\Portfolio\wt\T101-shots\`. Each catalogue's `git diff --stat` shows 10 added lines and nothing else.

## Config and secrets set

None. The filters use the localStorage key T101 added (`carta.tripLength`); the cost band is not kept.

## Before/after measurements

Counts come from `continent-app/public/journeys/type/*.json` (253 cards) through `costEdges` and `bandCounts`, by `T101-shots/measure188.mjs`. The browser checks are headless Chromium against `vite preview` of this branch's build, at 380 and 1280 px in English and at 380 px in Spanish: 37 checks, all passing, no page errors, no horizontal scroll on the week list or the short list.

| Metric | Before | After | Delta |
|---|---|---|---|
| Filters on the curated trip list | 0 (the tab's search and country only) | 2 (length, cost band), composing with both | plus 2 |
| Week band edges (low, high), euros | not applicable | 1,050 and 1,350 | |
| Trips per band on the week (under, between, over) | not applicable | 88, 81, 84 | |
| Short band edges, euros | not applicable | 550 and 750 | |
| Trips per band on the short version | not applicable | 84, 91, 78 | |
| Hiking style, 24 trips: under, between, over on the week | not applicable | 16, 5, 3 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The check "trip opens on the short version" read the list's button, not the page's | The page opens over the list, so the first `.tl-btn` in the document is the list's | The checks now ask for `.tl-pick .tl-btn`; the first run of T101's check had the same selector and was re-run on the final build |
| The card's facts line cut the months at three cards across once the total was added | Days, total, tier, difficulty and months do not fit one line at 310 px | The authored tier symbols show only when a card has no total |

## What is still open

The composed city routes have a day-count filter and no price, so they have no cost band (T188-a).

The style cards at the head of the Trips category still count every trip in a style, not the trips the filters leave (T188-b).

The band is a position in the library, a third of the trips, not a budget the traveller states. A typed ceiling would answer the question a budget product is asked, and is a product decision (T188-c).

Card totals are the authored per-person range, and the trip page's receipt is the priced total for the party (T099-b already records the mismatch on the page). Cards and receipt will not agree until the cards read the priced figure (T188-d).

`formatRange` in `src/lib/format.js` writes the word "to" in English in every language, so a card in Spanish reads "334 to 536" between two euro figures. It is older than this task and every authored range in the app shares it (T188-e).

Row T224-d (map the trip-length paths in `pathBoot.js` to the filtered view) stays open; `pathBoot.js` is outside this task's files, and the filtered view it would open now exists.

Answers to the seven carta-design questions, for this diff. One, no hex outside `:root`: every colour is a token (`--bg-card`, `--rule`, `--ink`, `--ink-soft`, `--ink-fill`, `--on-fill`, `--accent` for the focus ring). Two, no gradient and no second saturated hue. Three, no ochre, teal or `--danger`. Four, mono carries the euro figures and the counts on the band buttons and the card total; every label and sentence is `--ui`. Five, one primary per view: the filters are toggles and a text button, and the list has no primary action of its own. Six, strings are sentence case and state facts ("Under 1,050 euros", "Totals are per person, flights not included, for the length chosen"), with no em dash, no middot and none of the banned words (design-lint: 196 in the baseline, 0 new). Seven, the thing removed: the authored tier symbols on a card that now shows its total, because the line was already losing the months.

## Rollback procedure

In the app repo, `git revert 79449f54118c0d8e9bfd9ae395bb906b6e4a8670` (or drop the branch before merge); the list returns to its unfiltered form and T101's page picker is unaffected. In the root repo, revert this report's commit, which removes rows T188-a to T188-e. No data, schema or migration is involved.
