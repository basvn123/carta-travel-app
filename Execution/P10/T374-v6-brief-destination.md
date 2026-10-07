# T374: design brief for the destination (town) page

## Task ID

T374 (design wave V1, session 5 of 10; no mind-map prompt exists for it)

## Date

2026-10-08

## What changed

The destination page now has a written brief, `docs/design-v6/briefs/destination.md`, that the build waves V3, V4 and V5 work from. No app code changed. The brief walks the page as the hiker on a budget in `docs/design-v6/TRIP-PLANNING-RESEARCH.md` would, on Rome (`FCO`), Valbona Valley (`gem:valbona`) and Zungoli (`gem:zungoli`) at 380 and 1280 px; inventories every state, control and visual setting with a verdict (about 100 rows); scores the page 26 of 40 on Nielsen's heuristics; and plans 10 V3 items, 9 V4 items and 9 V5 items, each with its files, the impeccable command and a done check, ending in a target-state control table and the full list of files the build waves touch. Ten proposals that carta-design does not cover yet are listed for T380 to accept or reject.

The mode is Operate: the traveller comes to decide and price, and the receipt is a working instrument. The main finding is that the page answers "what does a day here cost" on two bases at once. On Rome the fact strip says €87 a day while the first-run receipt under it works out to €99.54 a person a day (€696.79 each for 7 nights), and a second receipt further down repeats the cost-index figure. The other three priority issues are that the first price sits a full screen down on a phone under seven head controls, that the folds are in source order rather than the traveller's order (the month 7th or 8th, getting there 9th on a phone), and that the month chart uses the action colour for "mixed" and shows its figures on mouse hover only.

## Files touched

Created:
- docs/design-v6/briefs/destination.md
- Execution/P10/T374-v6-brief-destination.md

Modified:
- Execution/_OPEN.md (rows T374-a to T374-d appended)

Outside both repos, never committed: eight before screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destination\` (V1-city-top-380, V1-city-top-1280, V1-city-receipt-380, V1-routes-fold-380, V1-routes-fold-1280, V1-town-empty-380, V1-town-top-1280; the eighth slot was not used) and scratch scripts in the session scratchpad.

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T374` (branch p10-v6-brief-destination):

    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target src/browse/DestinationPage.jsx
    sh ".../impeccable" detect --json <18 surface files, quoted absolute paths>     (in a sub-agent)

From the app repo in the main checkout, read only:

    node scripts/ci/design-lint.mjs
    node scripts/verify_transport_links.mjs

From the scratchpad, against the shared dev server on port 5199:

    node walk.mjs walk.json            (first pass; the shared server was still booting, top views redone)
    node walk2.mjs walk2.json          (screenshots and measurements)
    node verify_destination_page.5199.mjs   (a copy of the app's harness with the port set to 5199, waits tripled, no vite preview spawn; the same method T312 used)

## Config and secrets set

None.

## Before/after measurements

This task builds nothing, so these are the before figures the build waves move, and the targets the brief sets.

| Metric | Before (V1) | Target (after V5) | Source |
|---|---|---|---|
| Controls in the head | 7 | 3 | walk2.json `headActions` |
| Share buttons | 2 | 1 | DestinationPage.jsx |
| Receipts on the page | 2 | 1 | DestinationPage.jsx (FirstRunReceipt, CostReceipt) |
| Day cost figures that disagree (Rome) | €87 and €99.54 | one figure | walk2.json facts, V1-city-receipt-380 |
| Folds, Rome / Valbona / Zungoli | 16 / 14 / 12 | 15 at most | walk2.json `folds` |
| Receipt top on a 380 px phone, Rome | 1,006 px | first screen | walk2.json `frrTop` |
| Controls under 44 px, 380 px, Rome all open | 37 | 0 | walk2.json |
| Accent-filled controls in view | 1 | 1 | walk2.json `primaries` |
| Horizontal scroll at 380 px | 0 px (dev server) | 0 px at 360, 380, 390 | walk2.json `hscroll` |
| Detector findings, 18 surface files | 0 | 0 | sub-agent detect run |
| Design lint new violations | 0 (213 baselined) | 0 | design-lint.mjs |
| Nielsen score | 26/40 | not measured until V6 | brief part 4 |
| verify_transport_links | 43/43 | 43/43 | run above |
| verify_destination_page (5199 copy) | 48/58 (the 10 failures are the copy's Rome and Paris block after a hash change, see the brief part 4) | all pass | scratch run |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first walk saved the boot splash for three views | Ten sessions share one dev server; a cold boot took one to three minutes and the script waited for `.destp` only | The second walk waits for `.destp-head-actions` and six folds, up to three minutes; the views were saved again |
| The first detector run read nothing | The main checkout path has a space and the file list was word-split | Re-run with each path quoted; 18 files scanned |
| The returning-visit pass returned no measurements | The reload did not finish loading within the wait on the shared server | Returning behaviour is described from the code in the brief and said so there |

## What is still open

T380 must accept or reject the ten "needs a rule" proposals in part 7 of the brief before V3 builds anything that depends on them; items that depend on a rejected rule are skipped (T374-a).

The task's file list for this surface names three files the destination page does not render: `src/browse/NearbyOutdoors.jsx` (beach, lake, mountain, trail and cycle pages), `src/components/CountryIntel.jsx` (the planners) and `src/components/MonthStrip.jsx` (journey and mountain pages). OWNERSHIP.md, written in V2, should give them to the surfaces that render them, and MonthStrip to this one only if V3 item 4 adopts it (T374-b).

The research asks for the car-free access fact a hiker decides on: the nearest station or stop with its frequency. The dossier carries a transit verdict and the airport transfer but no station and no frequency, so V3 can only reorder what exists. Adding the fact is pipeline work in `pipeline/dossier`, outside every design wave (T374-c).

Two day-cost bases on one page (the cost index at the lifestyle against the first-run receipt's stay tier) are a product decision as much as a layout one. V3 item 1 makes the receipt the one figure; if the owner wants the strip to keep the lifestyle figure instead, the receipt has to be priced at the lifestyle's stay tier, and that is the owner's call (T374-d).

## Rollback procedure

The task adds two documents and four register rows. To undo it, drop the branch before merging (`git branch -D p10-v6-brief-destination` from the main checkout once the worktree is removed), or after a merge revert the merge commit with `git revert -m 1 <merge>`. Nothing in the app repo, the data or production changed. The screenshots outside the repos can be deleted by hand.
