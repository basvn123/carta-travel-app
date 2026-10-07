# T101: I2, break the seven-day assumption

## Task ID

T101 (mind-map number T097), branch `p6-i2-seven-days` in both repos.

## Date

2026-10-07

## What changed

Every curated trip now exists at two lengths, the week as written and a short version, and the trip page says which one it is pricing. The owner decided on 2026-10-07 (T362, runbook block A) that the two lengths are the short version and the week, as spec I2 says, so no ten-to-fourteen-day variant was built; that is register row T101-b.

The short version is the trip's three or four best days with a total of their own. It is four days, and three when the trip is rated Demanding or harder (difficulty 4 or 5), because a hard route is not four days of effort. Of the 253 trips, 199 get four days and 54 get three, counted from `continent-app/public/journeys/journey/*.json` by `tripLengths`. The days are one unbroken run, so the bases and the travel between them still make sense. The run is the one whose days hold the most named places and measured detail (`dayScore` in `src/lib/tripLength.js`: capitalised names mid sentence, text between asterisks, a figure in the day, a measured line). A tie goes to the later run, because the first day is the arrival day. This is a proxy for "best", not an editor's judgement, and row T101-a asks the owner whether to curate it per trip.

Nothing was added to the wire. The week is already seven day objects with an authored budget, so the short version is a chosen run of those days and a recalculated cost, which is what spec I2 says it should be. `src/lib/tripLength.js` holds the rules as pure functions (`shortDayCount`, `dayScore`, `pickShortRun`, `scaleBudget`, `tripLengths`, `cardTotal`) and the remembered choice (`carta.tripLength` in localStorage, per viewer, "short" or "week"). Because the wire is untouched there is nothing to rebuild and no pipeline change.

How it is priced. Where the trip page has a priced receipt (T099: 246 of 253 trips have a catalogue town within 30 km, per `Execution/P6/T099-price-the-trip.md`), the short version's total is that receipt run for the short number of nights from the arrival date, so the page never shows two totals that disagree: there is one receipt and it is the chosen length. `FirstRunReceipt` gained one prop, `nights`; with it the leave date is derived from the arrival date and read-only, because the length is chosen on the page and a second control would price a third length. Moving the arrival date leaves the shared return date alone. Where there is no town in reach (the other 7 trips) the page keeps the written budget, and the short version scales each authored line and the total by its share of the week (4 of 7, say), rounded to whole euros as the authored figures are. The per-day range does not change, since a day costs what it cost. The Lifestyle slider (T173) reads the scaled budget, so it moves the short version's figures on its own range. Getting to the trip's start sits inside the transport line and scales with it, which understates a short trip a little; the note under the picker says each cost is its share of the week's.

What the page shows. A "Trip length" control sits under the title and chips: two toggle buttons ("The short version, 4 days", "The whole week, 7 days") and one sentence that states the assumption, "Priced for 4 days: days 2 to 5 of the week, the run with the most to see. Each cost is its share of the week's, and the day by day below shows only these days." On the week it says "Priced for the whole 7 days, as the trip is written. A short version of 4 days is one tap away." The choice also sets the length chip, the Length, Budget and Per day facts, the suitability strip's cost cell, the heading "What 4 days cost", the receipt, the written range, the slider, the shape-of-the-week and climb modules, and the day track, which shows only the kept days renumbered from 1 so "Day 1 of 4" matches its cards. The journey page's section ids are unchanged. The where-to-sleep, logistics and data sheet sections stay the week's, since they describe the whole trip.

## Files touched

All in the app repo (`continent-app/`, commit `35fdf2b1a0161faff241dcf3499aab495aff49a8`), plus this report and the register in the root repo.

**Modified:**
- `continent-app/src/browse/JourneyPage.jsx` (length state, the view of the trip at that length, the picker, the receipt `nights`)
- `continent-app/src/components/FirstRunReceipt.jsx` (the `nights` prop)
- `continent-app/src/i18n/en.js`, `de.js`, `es.js`, `fr.js`, `it.js`, `nl.js` (seven keys each, after `journey.nDays` and `journey.budgetHead`, additions only)
- `continent-app/src/styles.css` (one `@import` line at the end)
- `Execution/_OPEN.md` (rows T101-a to T101-e appended)

**Created:**
- `continent-app/src/lib/tripLength.js`
- `continent-app/src/browse/LengthPicker.jsx`
- `continent-app/src/styles/43-trip-length.css`
- `continent-app/tests/tripLength.test.mjs` (7 tests)
- `Execution/P6/T101-trip-lengths.md`

**Deleted:** none.

## Commands run

In `C:\Users\Gebruiker\Documents\Portfolio\wt\T101-app`, with `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` unset in every shell:

```
node --test tests/tripLength.test.mjs
npm run lint
npm test
node scripts/ci/design-lint.mjs
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm run build
node node_modules/vite/bin/vite.js preview --port 5211 --strictPort --host 127.0.0.1
node ../T101-shots/shoot.mjs
rm -rf dist dist-data
```

The dev server used for the first look ran from `wt\T101-shots\vite.config.mjs`, which imports the app config and sets its own `cacheDir` and port 5211. The helper scripts (`shoot.mjs`, `measure.mjs`, `add_keys.py`, `keys1.json`, `keys2.json`) and the screenshots are in `C:\Users\Gebruiker\Documents\Portfolio\wt\T101-shots\`. `add_keys.py` keeps each catalogue's BOM and line endings; `git diff --stat` on each catalogue shows 7 added lines and nothing else.

## Config and secrets set

None. One new localStorage key, `carta.tripLength`, a per-viewer convenience that nothing depends on; a blocked store opens every trip on the week.

## Before/after measurements

Counts come from `continent-app/public/journeys/journey/*.json` (253 files) through `tripLengths`, by `T101-shots/measure.mjs`. The page checks are headless Chromium against `vite preview` of this branch's build, at 380 and 1280 px, on the Andorra High Route and the Vienna trip: no page errors and no horizontal scroll on either length.

| Metric | Before | After | Delta |
|---|---|---|---|
| Lengths priced per trip | 1 (the week) | 2 (the short version and the week) | plus 1 |
| Trips with a short version and its own total | 0 of 253 | 253 of 253 | plus 253 |
| Short versions of four days / three days | not applicable | 199 / 54 | |
| Median midpoint of the authored total, week / short | 1,175 euros / not applicable | 1,175 euros / 654 euros | |
| Andorra High Route receipt, short version (3 nights, 2 people) | not applicable | 556.48 euros, priced at Andorra la Vella | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A second trip in the browser check opened already on the short version | The length is remembered per viewer on purpose, so the check's shared browser context carried it over | The check clears `carta.tripLength` before each trip; the behaviour is the design |
| `JourneyPage.jsx` showed every line changed after a scripted edit | The index holds CRLF for that file and a scripted write had produced LF | Restored CRLF; the commit shows 66 changed lines |

One thing seen and not changed: the leave date field is clipped at its right edge in the receipt strip at 1280 px (`d1280-Andorra-short-budget.png`), on the week as well. It predates this task and belongs to T099's strip.

## What is still open

The short version's days come from a text score, not an editor. An owner who wants to choose them curates a `shortDays` list per trip, and the code would read it before scoring (T101-a).

No ten-to-fourteen-day version exists, by the owner's decision of two lengths. The task text asked for one, and the long-stay accommodation discounts of spec E6 (row T173-d) have nothing to apply to until one does, so T173-d stays open (T101-b).

The short version scales the transport line by days, which understates the cost of getting there on a short trip. A fixed share per trip type would need authored data (T101-c).

The cheaper-trip exits, the saved-trips and PDF surfaces and the planner hand-off still read the week. Browse cards read the length in T188, which follows this task (T101-d). The data sheet's surface mix is the week's on the short version (T101-e).

The trips without a town in reach, 7 of 253 by the T099 report, take the written-range path, which was not opened in the browser in this task; it uses the same scaled budget as the facts strip, which was checked, and the unit tests cover the scaling. The T224-e and T225-c rows (listing the short versions on the 3 and 4 day pages) are not in this task's files and stay open.

Answers to the seven carta-design questions, for this diff. One, no hex outside `:root`: every colour is a token (`--ink-fill`, `--on-fill`, `--rule`, `--accent`). Two, no gradient and no second saturated hue: the pressed button is `--ink-fill`, the only accent is the focus ring. Three, no ochre, teal or `--danger`, because there is no rating, gem or deletion here. Four, mono carries nothing new; the picker and the note are `--ui` prose and the figures stay in the receipt's mono. Five, one primary per view: the picker is two toggles, an active toggle is `--ink-fill` by the button rule, and the receipt's "Set your dates" stays the one primary. Six, the strings are sentence case, state the length as a fact ("Priced for 4 days") and carry no em dash, no middot and none of the banned words (design-lint: 196 in the baseline, 0 new). Seven, the thing left out: a third, ten-to-fourteen-day button, since the owner's answer is two lengths and a third would price a length nothing else on the page uses.

## Rollback procedure

In the app repo, `git revert 35fdf2b1a0161faff241dcf3499aab495aff49a8` (or drop the branch before merge). That removes the picker, the short version and the `nights` prop, and the page prices the week again. In the root repo, revert this report's commit, which removes rows T101-a to T101-e. No data, schema or migration is involved. The `carta.tripLength` key left in a visitor's browser is read by nothing once the code is gone.
