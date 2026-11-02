# T1012: between-stop chips, a quieter Export & share, prices forward, group expenses out

## Task ID
T1012

## Date
2026-11-02

## What changed
The owner sent three messages during this task:
1. **The chips.** "Getting between stops": make the chips nicer, with each icon aligned to its text.
2. **Export & share and prices.** The brown Export & share feels busy; make it more subtle. Everywhere, make the pricing stand out more.
3. **Group expenses.** Remove all the group expenses logic for now; a separate section will come later.

**Chips.** The mode's icon was inline inside the chip's label, so it sat on the text's baseline. It now goes in the Chip kit's own icon slot, where icon and words share one centre line (measured offset 0 px on all four chips, at 390 and 1440 px). The four choices are an equal 2 × 2 grid of 48 px tiles. The chosen one shows the kit's tick in place of its icon, as every choice chip in the app does.

**Export & share** is now a white card:
- Share trip is its one umber button.
- PDF is a quiet bordered button beside it.
- Copy trip link, Add to calendar, Google My Maps and Open in Google Maps are light chips; their small coloured marks (lagoon, sun, terracotta, sand) carry the colour.

**Prices** are larger and heavier on every trip-page card. Each is the first thing read on its card.

| Where | Before | After |
|---|---|---|
| Route cards (`jr-fig`) | 16 px | 20 px, weight 800 |
| Still to book passes | 20 px | 22 px |
| Itinerary flight figure | 16 px | 20 px |
| Lodging figure | 14 px | 16 px |
| Hop figure | 14 px | 16 px |
| Cost card rows | 14 px | 16 px, weight 800 |
| Costs receipt group totals | as before | 16 px, weight 800 |
| Costs receipt lines | as before | weight 700 |

**Group expenses** are removed from the trip page:
- the ledger section on Costs (added in T1011)
- the ledger sheet behind the kit's old Expenses tool
- `ExpenseLedger.jsx`, which nothing else used

The trip's stored `expenses` data is untouched. So are the features that read it elsewhere: Together's settle-up, the Today card's spend line, and past-trip memories. The owner can name those if they should go too.

## Files touched
**Modified:**
- `continent-app/src/planner/TripPlannerTab.jsx`: the chips' icon slot; Costs without expenses
- `continent-app/src/planner/TripItinerary.jsx`
- `continent-app/src/planner/TripSummary.css`

**Deleted:** `continent-app/src/planner/ExpenseLedger.jsx`

**Created:** `Execution/P15/T1012-shots/`

## Commands run
- `npx eslint`: 0 errors.
- `npm test`: 1204 of 1204 pass.
- NOPUBLIC build. Playwright ran at 390 px (touch) and 1440 px:
  - the chips, with their icon-to-label centre offsets measured
  - the Overview route
  - the Itinerary's stop, chips and Export & share
  - Costs, with no ledger on the page (`.itin-spent` count 0)

## Config and secrets set
None.

## Before/after measurements
In the table under "What changed", plus:
- icon-to-label centre offset on the chips: off the baseline before, 0 px after
- ledger sections on the trip page: 1 before, 0 after

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new. T1011-a (restyle the ledger on Costs) is closed by this task: the ledger has left the trip page.

## Rollback procedure
`git revert fd177ed41d`. This also restores `ExpenseLedger.jsx`.
