# T538: the last cost figures on the shared line

## Task ID

T538 (P11). Closes T537-a and T537-b. App branch `p11-cost-rest`, commit 01c7e7f, merged into app master as ac73e46. Root mirror bcb45460b.

## Date

2026-10-22

## What changed

The owner asked to finish the five price spots that T537 left behind.

- **Itinerary, each stop.** The bed line is now the kit CostRow (bed icon, "Beds", the figure marked est. or "yours"). It sits beside the Find a place and booking-price actions.
- **Itinerary, extras.** The rental car and vignette rows are now CostRow, with the car and route icons.
- **Airport transfer picker.** Totals show as `~€… est.`. These are modelled prices, and before this they showed as a bare figure.
- **Trip summary in the wizard review.** Each leg is a CostRow:
  - the mode icon (plane, train, bus, car, ferry), the route as the label, and the mode or "Booked" as the second line
  - the figure, which is "yours", Carta's flight with its airline mark, an estimate, or "Not in the total" in the missing tone
  - airport transfers use the bus icon. COST_ICON gains the train, bus, ferry and fly keys.
- **Country brief cost fold.** Bed and eating out are a two-row CostRow list instead of two tiles. Both carry the estimate mark, because they are country medians, and so does the fold summary.
- **Neighbourhood prices.** These now use the same `bedEur` as the bed tiers, so they get the estimate mark when the town's beds are not measured.
- **Flight chips and map pins.** No change. The chip shows Google's measured fare, so it carries no estimate mark. Pins already show the tilde for a stand-in figure and say "est." in their screen-reader label, because a visible word does not fit on a pin.
- **Dead code removed.**
  - `BreakdownSection` in TripItinerary had no callers.
  - 167 lines of CSS that no component uses: `itin-breakdown*`, `itin-bd-*`, `trip-total-row`, `itin-bed-lbl`/`-fig`, `cbrief-fig*`, and the old `tsum-row`/`tsum-eur`/`tsum-list` grid. The comments that went with them were removed too.
- **T537-b closed.** The "0 days" came from the trip wizard, which keeps its own dates and does not read `d`/`r` from the URL. Once dates are picked on its When step, it reaches Trips, Getting there, Review and the itinerary normally. This is not a price bug.

## Files touched

App:
- `src/planner/TripItinerary.jsx`, `TravelLegsSection.jsx`, `CountryBrief.jsx`
- `src/browse/Neighbourhoods.jsx`
- `src/components/ui/CostRow.jsx`
- `src/styles/11-trip-planner.css`, `12-guided-trip.css`, `19-guide-ratings.css`, `24-destination-workspace.css`, `26-shortlist-extras.css`, `67-v6-tripplanner.css`, `planners-held.css`, `planners/24-destination-workspace.css`, `planners/67-v6-tripplanner.css`

Root: the mirror, this report, `Execution/_OPEN.md`.

## Commands run

- eslint on the touched JS files: 0 errors. Braces are balanced in every touched stylesheet.
- `npm test` on merged master: 588 of 588 pass.
- `npm run build:pages`: PASS, 169 files.
- `npx wrangler pages deploy dist --project-name carta-app --branch main`: deployment a78844d4. Live bundle index-CT_jsJ15.js.

## Config and secrets set

None.

## Before/after measurements

| | Before | After |
|---|---|---|
| Price rows outside CostRow (itinerary bed, extras, trip summary, country fold) | 4 kinds | 0 |
| Modelled prices without an estimate mark (transfer picker, country fold, hood prices) | 3 | 0 |
| T538 diff | | +61 / −340 lines |

## What broke and how it was fixed

- The first CSS pruner joined a line onto the one before it wherever it dropped a rule. Restored from HEAD and re-ran a corrected pruner. The second run's diff adds only one changed selector line.
- The edits changed line endings. Each file was restored to its line endings in HEAD before the commit.

## End check (browser)

- **Dev server on master, desktop:**
  - Trip wizard: Austria, Salzburg and Vienna, 21 to 28 Nov, 2 adults.
  - Review: three summary legs on CostRow with icons (flights read "Not in the total" because the dev server has no fares proxy; the train shows ~€76.91 est.).
  - Itinerary: two stop bed rows (€339.28 + €551.52), which add up to the Beds line of €890.80.
- **Phone, 375 wide:** the itinerary has no horizontal overflow, and no cost row goes past the edge.
- **Production:** the Vienna card renders its four rows and the return-flight link on the new bundle.
- **Not opened:** the country brief cost fold. It only opens from the "Help me choose" match cards, and the hash route opens the country page instead. It is covered by lint and the build only.

## What is still open

- The country brief cost fold was not seen in a browser (T538-a).

## Rollback procedure

- App: `git -C continent-app revert -m 1 ac73e46`, then build and redeploy, or promote Pages deployment a7ef8e93.
- Root: `git revert bcb45460b`.
- No data change.
