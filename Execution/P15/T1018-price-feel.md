# T1018: Eat and drink shows how pricey eating out is here, not seven prices to the cent

## Task ID
T1018

## Date
2026-11-02

## What changed
The owner found the Eat and drink prices on the place page ("Dinner out, mid-range €40.20", "Cappuccino €2.02" and five more) unhelpful: a traveller wants to know how pricey a place is in general. A research proposal (artifact "Price Feel Proposal") was approved. The owner then sent a phone mock that drops the white card and the tip line.

The section now shows a **price feel**, on the page's own background:

- **The verdict:** the food band word that Explore cards already use, for example "Pricey, toward the cheap side". The lean ("toward the cheap side" or "toward the dear side") appears only when the place sits in the outer third of a middle band.
- **The scale:** five steps from Very cheap to Very pricey, with a pin kept in the middle half of its step.
- **Cheaper than usual / Dearer than usual:** a bar from a centre tick for each thing more than 10% off the frozen Europe median (`bands.ref_prices`). At most four rows are shown, furthest from the norm first, each with "about €X" in whole euros.
- **About usual:** the remaining things, named once, joined with the language's own list word ("fast food and groceries").
- **All prices:** the old list behind a quiet button, closed by default, in whole euros.

Rome (`FCO`) now reads: Pricey, toward the cheap side. Coffee is cheaper than usual (-41%). A casual meal (+30%), dinner out (+23%) and a cocktail (+15%) are dearer. Fast food and groceries are about usual.

Logic is in `priceFeel()` and a new general `bandPos()` in `lib/costIndex.js`, next to `bandFor`. Its numbers live in a new `bands.feel` rule in `config/pricing.json` (gap 0.1, rows 4, min_items 3, reach 0.5). The seven item keys are now one exported `FOOD_ITEMS` list. `DestFood` routes the inline case to its own `PriceFeel` component, so the place page no longer runs the Practical fold's receipt work.

Departures from the carta-design contract, under the 2026-10-30 design-freedom decision:
- The scale steps use green for cheap and the umber ramp for pricey.
- The verdict is 26 px, weight 800.

Every group carries a text heading, so colour is never the only signal.

## Files touched
**Modified:**
- `continent-app/src/lib/costIndex.js`: `bandPos`, `FOOD_ITEMS`, `priceFeel`
- `continent-app/src/browse/DestFood.jsx`: `PriceFeel`, `FeelGroup`, `FeelRow`, `UsualLine`; `DestFood` routes to `PriceFeel` or `FoodFold`; shared `dayOf`
- `continent-app/src/browse/DestOverview.jsx`: comment only
- `continent-app/src/styles/74-dest-food.css`: `.pfeel*`
- `continent-app/src/styles/88-place-template.css`: removed the white card rule `.pt-eat .dfood-menu`
- `continent-app/config/pricing.json`: rule `bands.feel`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: 18 `feel.*` keys each

**Created:**
- `continent-app/tests/priceFeel.test.mjs` (5 tests)
- `Execution/P15/T1018-shots/` (Rome `FCO` and Valbona at 375 and 1440, closed and open)

## Commands run
- `npx eslint` on the touched JS: 0 errors. One warning predates this task (react-refresh, the `foodPriceKeys` export).
- `npm test`: 1209 pass, 0 fail.
- `/simplify`: four review agents. Fixed:
  - one item list
  - `bandPos` as a general helper
  - thresholds moved into `pricing.json`
  - `eurDay` reused
  - kit `Button` for All prices
  - `Intl.ListFormat` for the usual line
  - `FeelGroup`
  - CSS `--reach` geometry
  - inline path split from the fold
- `impeccable detect` on the changed UI: `[]`.
- Browser end check: `npx vite --port 5219`, then Playwright (serviceWorkers blocked) on `#dest=FCO` and `#dest=gem:valbona` at 375 and 1440. No page errors, no sideways scroll, transparent background, All prices 44 px high and hidden until tapped.

## Config and secrets set
`config/pricing.json` gains `bands.feel` = `{ gap: 0.1, rows: 4, min_items: 3, reach: 0.5 }` (kind estimate, review 2027-05-02).

## Before/after measurements
| | Before | After |
|---|---|---|
| Figures shown in Eat and drink (Rome) | 7, to the cent | 1 verdict + 4 "about" figures in whole euros (7 behind All prices) |
| Card behind the prices | white card | none |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| `priceConfig` V13 failed | `FEEL_GAP` / `FEEL_ROWS` were numbers kept in a price module | Moved into rule `bands.feel` |
| `priceSources` V2 failed | `DestFood` called `foodPerDay` outside the engine | The food day comes from the cost row, else from the engine's `foodBreakdown` |
| Rome's pin sat on the line between Mid-priced and Pricey | The pin was placed at 15% into its step | Kept to the middle half of the step (25% to 75%) |
| On a phone the verdict sat close under the dish chips | `.pt-eat` gap of 12 px | 16 px more above the price feel under 700 px |
| All prices was four cramped columns on desktop | `.dfood-prices` goes to four columns from 700 px | Auto-fill with 132 px minimum inside `.pt-eat` |

## What is still open
- **T1018-a.** `DestFood`'s Practical fold (now `FoodFold`) has had no caller since T912. Only `DestOverview` renders `DestFood`, and always inline. It and its CSS (`.dfood-head`, `.dfood-bar`, `.dfood-lines`) can be deleted. This was left out of scope here.
- **T1018-b.** The German exception for lower-casing a noun mid-sentence is now in three places: `DestFood.jsx` `midSentence`, and `finderText.js` lines 333 and 505. One helper in `lib/format.js` should serve all three.
- **T1018-c.** An item cut by the four-row cap is in neither group nor "About usual". Rome's beer (+14.8%) is the example; it is still under All prices. This needs an owner decision: raise the cap, or add an "Also dearer: beer" line.
- **T1018-d.** The proposal's "compared with your home town" verdict ("About as pricey as Antwerp") was deferred. It needs the traveller's origin to be a Carta place with food prices.

The proposal's question about saying "in Italy" for country-level prices no longer applies: the owner's mock has no line naming the place.

## Rollback procedure
`git revert <T1018 commit>`. It is one commit, with no data or schema change.
