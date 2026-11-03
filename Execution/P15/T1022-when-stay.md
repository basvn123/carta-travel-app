# T1022: When to go and Where to stay, redesigned on the scrape

## Task ID
T1022

## Date
2026-11-03

## What changed
The owner disliked both sections: the per-area prices, the dorm, room and hotel price list, the "a day by month" card, the bar strip and the booking disclaimer. They asked for a written recommendation, the month prices per stay type made interactive, crowds shown insightfully, and clean buttons to the booking sites. Areas were to go entirely. Two research agents ran first:
- **Traveller research:** price, weather and crowds lead (Booking.com 2026: 43% plan to avoid crowds). Products use a written best-months line, a rated month strip, price as a word or one figure, and "best for" stay types.
- **Data audit:** only the scrape has month prices (T1021, five dates). The areas were administrative districts with no tags (owner: remove).

**When to go** (`browse/DestWhen.jsx`, logic in the new `lib/whenGuide.js`):
- **The verdict:** "Best in Apr to May", then why, in up to four lines:
  - the days in those months ("Days of 20° to 24°")
  - the quieter months that are still pleasant
  - "Hot and busy in Jul to Aug" (a high of 31° or more with busy crowds)
  - "Cold or wet in Jan to Feb, Dec"
- **One strip of twelve months, each a button:**
  - the comfort band as a coloured bar
  - the daytime high
  - the crowd level as four dots
  - a sun mark where a dated festival falls

  The chosen month's line sits under it: its rating, its crowd word, "33° by day, 21° at night, 26 mm of rain", and its festivals.
- **Crowds against Europe:** a small gauge and "Busier than 95% of places in Europe", from visitor nights per km² across the catalogue.
- **Stay prices by month:** a Hostel / Hotel / Entire place switch over the same months.
  - Only the scraped months are bars; the rest are dashed gaps.
  - The cheapest month's bar is green.
  - One sentence per type: "Cheapest in Jan, dearest in May", or "Prices hardly change through the year".
  - The chosen month's figure: "€129 a night in August".
- **Festivals:** as before, the links in Carta's link colour.

**Where to stay** (`DestStay` in `browse/DestPractical.jsx`):
- One row per stay type the scrape found here (all three otherwise): a colour disc with its icon, the name (Hostels, Hotels, Entire places) and what it is good for.
- Buttons to the sites that sell it, searched for the traveller's dates and party: Hostelworld; Booking.com; Booking.com apartments and Airbnb.
- No prices, no areas, no disclaimer line.

**Removed:**
- `Neighbourhoods.jsx` and its CSS (29 rules)
- `monthDayCosts` and the "A day by month" card
- the `.pt-months` rule
- 8 translation keys in 6 languages that had no caller left

The PDF export still reads `sleep`, so `destSleep` stays.

**Shared:**
- `useStayRecord(id)` in `staysData.js`
- `baseCity` exported from `nearby.js`
- `comfortTier` moved into `whenGuide.js`
- the "hot" mark and the "prices hardly change" ratio in config rule `when.guide`, with `whenGuide.js` under the price-number guard

## Files touched
**Modified:**
- `continent-app/src/browse/DestWhen.jsx`, `DestPractical.jsx`, `DestinationPage.jsx`, `ClimateStrip.jsx`
- `continent-app/src/lib/staysData.js`, `nearby.js`
- `continent-app/src/styles/25-feature-pages.css`, `64-v6-destination.css`, `88-place-template.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (28 keys added, 8 removed)
- `continent-app/config/pricing.json` (rule `when.guide`)
- `continent-app/tests/priceConfig.test.mjs`

**Created:**
- `continent-app/src/lib/whenGuide.js`
- `continent-app/src/styles/94-when-stay.css`
- `continent-app/tests/whenGuide.test.mjs` (5 tests)
- `Execution/P15/T1022-shots/`

**Deleted:** `continent-app/src/browse/Neighbourhoods.jsx`

## Commands run
- `npm test`: 1218 pass, 0 fail.
- `eslint`: 0 errors. The warnings are the files' existing helper exports and the known destructured-`Icon` false positive.
- `impeccable detect`: one finding (an animated `height`), fixed; then `[]`.
- `/simplify`, four review agents. Fixed:
  - one stay-record hook instead of two lint-silenced memos
  - `baseCity` instead of a fourth copy of the regex
  - `QUIET_MAX_TIER` instead of hard-coded thresholds
  - `HOT_C` and `STAY_FLAT` moved to config
  - derived month state instead of an effect
  - stay types and month names computed once
  - dead props, keys and CSS removed; shared CSS selectors merged

  Skipped:
  - comfort cut points into a shared config: needs a pipeline change, T1022-b
  - a locale-aware month initial in `dates.js`: outside this task's files, T1022-a
  - a WeakMap for the crowd standing: about 0.1 ms, not worth it
- Browser: `npx vite --port 5219`, then Playwright (live stays blocked, flights proxied) on `#dest=FCO` and `#dest=JER` at 390 and 1440, tapping a month and a stay type. Two rounds. No page errors, no sideways scroll, the old blocks gone.

## Config and secrets set
`config/pricing.json` rule `when.guide` = `{ hot_c: 31, stay_flat: 1.1 }`.

## Before/after measurements
| | Before | After |
|---|---|---|
| Euro figures in Where to stay (Rome) | 12 (8 areas, 4 stay types) | 0 |
| Prices by month per stay type | 1 curve, no choice | Hostel / Hotel / Entire place, scraped months only |
| Written recommendation | none | best months + up to 3 reasons |
| Disclaimer lines in the two sections | 1 | 0 |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The price bars animated `height` | Layout thrash (detector) | No transition |
| The festival link was browser blue | No link style in the section | Carta link colour |
| The stylesheet was lost after the simplify rewrite | The import line was dropped | Imported in both components |

## What is still open
- **T1022-a:** `ClimateStrip.jsx` keeps an English-only `MONTHS_INITIAL` while When to go uses locale initials. One locale-aware initial in `lib/dates.js` should serve both.
- **T1022-b:** the comfort cut points (78/60/45) copy `apply_climate.py` by hand. Put them in a config the pipeline and the app both read.
- **T1022-c (owner):** the climate comfort index rates Rome's August (33°) "Good", while the verdict calls it "Hot and busy". Decide whether the comfort index should weigh heat harder.

## Rollback procedure
`git revert` the T1022 commit; `Neighbourhoods.jsx` and the old sections come back.
