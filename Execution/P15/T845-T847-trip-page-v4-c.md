# T845 to T847: trip page v4 Batch C, Costs, budget and Share

## Shared header

**Date.** 2026-10-29.

**Ask.** The owner, in chat:
- "Remove it there too" (T844).
- Then, to the Batch C colour question: "Yes, distinct colours" and "change carta design".

**What Batch C covers.** Board marks (`Execution/P15/T834-board/marks.md`):
- Panel 8: Costs, with distinct colours and the route in place of "Getting there".
- Panel 3's rail and budget card, which also closes T843-b (a total beside every tab).
- Panel 10, kept: Share, apart from the trip settings.
- Register rows T839-b, T839-c and T843-b.

**Owner decision recorded.**
- The four cost groups each have a colour: `--cost-travel`, `--cost-around`, `--cost-stay`, `--cost-food`.
- They are added in `continent-app/src/styles/01-tokens.css` and recorded in `DESIGN.md` (Cost groups).
- carta-design's cost bar rule is amended: grouped receipts take the group colours with a matching dot; ungrouped ones keep the ink ramp.
- `scripts/ci/token-contrast.mjs` checks the colours at 3:1 or more on `--surface`, apart from each other and from the action brown: 11 marks and 12 distances, none under the floor.

**Task numbers.** T845 to T847. T844 was the highest.

**Branches.** Both stacked on Batch B, nothing merged:
- continent-app `p15-trip-page-v4-c` (from `p15-trip-page-v4-b` `6b0f02b`): `887555b`, `6ae273f`, `3dfd38f`, `c06a624`.
- Root `p15-trip-page-v4-c`: sync `3073ae657`, then this report.

**Checks.**
- `npm test`: 1023 of 1023.
- ESLint on every touched file: 0 errors. The one old warning (`Icon` in TripSummary) remains.
- token-contrast: 0 under the floor.
- NOPUBLIC fast build.

**End check.**
- `Execution/P15/T845-T847-walk/walk-c.mjs` on the build plus `public/`: 66 of 66 at 390, 1024 and 1440 px, no page or console errors (`walk.json`). It uses the same Slovenia seed as Batch B.
- Screenshots are in `Portfolio/wt/v4c-shots/`.

**Rollback, the whole batch.**
- `git -C continent-app checkout p15-trip-page-v4-b` and delete `p15-trip-page-v4-c`.
- The same in the root. Reverting `3073ae657` also restores DESIGN.md and the old cost bar rule.

---

## T845: Costs as a coloured, editable receipt

**What changed.** The Costs tab's receipt (`PlanTotal`, grouped):
- **The bar:** one segment per cost group in its colour. Each group's name carries a matching 8 px dot, and so does each overview tile, so a colour never stands alone.
- **Groups fold:** the head is a button with its total and a chevron.
- **Every line** ends in a quiet Change that goes where the line is set:
  - a flight goes to Change flight;
  - food and drink goes to the Lifestyle;
  - a stay, a hop, the transfers, the car and the day trips go to their place on the Itinerary route.
- **Flight lines** are named by their airports (BRU → LJU). No "Getting there" is left on Costs.
- **The total** on Costs is a figure, no longer a button that read as a link.
- **The People and Lifestyle box** leaves Costs; the chips set them. This was the owner's first screenshot.

**Files.**
- Modified: `src/planner/PlanTotal.jsx`, `src/planner/TripItinerary.jsx` (`onReceiptLine`, kept CRLF), `src/planner/TripPlannerTab.jsx`, `src/planner/trip/CostTiles.jsx`, `src/planner/TripSummary.css`, `src/styles/01-tokens.css`, `scripts/ci/token-contrast.mjs`, the six i18n files (`tp.cost.*`).
- Root: `DESIGN.md`, `.claude/skills/carta-design/SKILL.md`.

**Commit.** `887555b`.

**Measurements.** Not measured.

**What broke.** No issues.

**Still open.**
- **T845-a, owner.** The Costs head still reads "Total for 2 people, €1,048.83 a person, €150 a person a day". Board panel 3 removed that line from the Overview band. Keep it on the receipt or remove it there too?

**End check covered.**
- Four distinct tile dots; a bar segment per group in four distinct colours.
- No People and Lifestyle box; the total is not a button; airports on flight lines; no "Getting there".
- A group folds.
- A flight line's Change opens Change flight; the stay line's Change opens the route.

**Rollback.** Revert `887555b`.

## T846: the total against the budget, beside every tab

**What changed.** A budget card (`planner/trip/BudgetCard.jsx`):
- **Contents:** the total for the party. With a budget, it adds what one person spends against it as a thin ink bar and one line ("€5 under your budget"). The budget is the trip or a day, as the trip settings ask. Over the budget, the bar and the gap turn the warning rust.
- **Editing:** Edit budget (or Set a budget) opens the two fields in place and writes the trip settings' budget.
- **Placement:** from 1024 px it sits in the side column under the map, so the total stays in view on every tab (closes T843-b). On a phone it sits under the cost band.
- **Undo:** the budget is part of the Undo history. A change that takes the trip over its budget says so on its Undo message ("Now €120 over your budget").

**Files.**
- New: `src/planner/trip/BudgetCard.jsx`.
- Modified: `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.jsx`, `src/planner/TripSummary.css`, the six i18n files (`tp.bud.*`).

**Commits.** `6ae273f`, and the fix `c06a624`.

**Measurements.** Not measured.

**What broke.**

| What | Cause | Fix |
|---|---|---|
| A first budget was saved as "a day" (end check: "€108.83 a person a day of €1,105") | The card took the stored default kind, which the settings normalise to a day | A first budget is for the whole trip; a set one keeps its kind (`c06a624`) |

**Still open.** None.

**End check covered.**
- The card in view: in the side column at 1024 and 1440, under the band at 390.
- Setting a budget just above the spend shows the bar and "€5 under".
- A five-star stay takes the trip over, and the Undo message says so.

**Rollback.** Revert `c06a624` and `6ae273f`.

## T847: Share this trip, and Trip settings without who can see it

**What changed.**
- **Where it opens:** a Share button on the top row (and the side column's Export and share) opens Share this trip (`planner/trip/ShareSheet.jsx`).
- **What it holds:**
  - who can see it (the same three chips as Create trip);
  - Copy link (the phone's own share sheet on a touch screen);
  - Download PDF, behind the pass as before;
  - Calendar and maps, which opens the route's export block.
- **Trip settings** on a planned trip no longer ask who can see it.
- **One build:** the share payload and the PDF are built once, for the route and the sheet.

**Files.**
- New: `src/planner/trip/ShareSheet.jsx`.
- Modified: `src/planner/TripPlannerTab.jsx`, `src/planner/TripSummary.jsx`, `src/planner/TripSummary.css`, `src/planner/flow/TripSettingsSheet.jsx`, the six i18n files (`tp.sh.*`).

**Commit.** `3dfd38f`.

**Measurements.** Not measured.

**What broke.** No issues.

**Still open.**
- **T847-a.** Calendar and Google Maps in the sheet lead to the route's export block rather than running there. The ICS and KML handlers live inside `TripItinerary`. Moving them to a shared module would let the sheet run them itself.

**End check covered.**
- Share opens with three choices.
- Copy link says it copied (clipboard granted).
- Trip settings opens without "Who can see it?".

**Rollback.** Revert `3dfd38f`.
