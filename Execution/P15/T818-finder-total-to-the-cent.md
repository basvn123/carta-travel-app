# T818: the trip finder's totals equal the planner's, to the cent

## Task ID
T818. The number was taken after T817, the highest in `git log --all` and in every worktree. The next free number is T819.

## Date
2026-10-29.

## What changed
**The ask.** The owner, in chat, after T816 and T817: "push, cleanup, and fix the rounding difference". The difference meant is the one the T816 report left open: the trip preview's total sat a few euro from Review's (register rows T801-a and T801-b).

**Two causes, one fix: the finder now prices a trip the way the planner does.**

1. **Whole-euro slots (T801-a).**
   - **Before:** every slot rounded to whole euros (`slots.js` `perHead`, `Math.round` on the group figure), and the total was the sum of those rounded slots. A trip therefore sat up to about half a euro a slot from the planner's total, which is in cents.
   - **After:** slots carry cents. A person's lines are the group figures divided by the quote's head count (adults and children, the planner's divisor). The cent those divisions lose or gain goes to the largest line (`balanced`), so the lines a traveller reads add up exactly to the total under them.
2. **Swaps priced one slot at a time (T801-b).**
   - **Before:** a stay, food, getting-around or flight swap in the preview (and a toolbar lever) replaced one slot with that option's own figure, while the planner prices every choice together in one quote.
   - **After:** `repriceTrip` (`lib/recommend/trips.js`) turns the swapped trip into the plan the planner receives (`planOf`). It then quotes it once from the finder's own request with those settings, which is the same request `handoff.js` `planState` builds, and rebuilds every slot from that one quote.
   - **Where it is used:** `withSlot` (the preview, the line picker and the flight options) and `applyLevers` both use it.
   - **Levers:** these are cached per trip and lever setting, so moving a lever back costs nothing.
   - **Hidden fields:** priced trips now also carry their pricing context (`ctx`, not enumerable). `rankTrips` keeps a levered trip's own quote and state instead of re-attaching the base's.

**Smaller changes.**
- The budget badge says "on budget" within half a euro, instead of "€0 under budget".
- The money formatter already rounds whole-euro figures, so cards, badges and the list read as before. The preview's cost rows now show real cents (they showed €251.00 for a whole-euro figure).

## Files touched
- `continent-app/src/lib/recommend/slots.js`: cents, perHead, balanced, slotTotals.
- `continent-app/src/lib/recommend/trips.js`: ctx, keepHidden, repriceTrip, receiptOf.
- `continent-app/src/lib/recommend/rank.js`: applyLevers reprices and caches; rankTrips keeps the hidden fields.
- `continent-app/src/planner/finder/finderText.js`: withSlot reprices; the budget badge.
- Tests:
  - `finderHandoff.test.mjs`: to the cent, plus 2 new tests: every stay and food swap of the top 6, and a food lever over the list.
  - `finderCard.test.mjs`, `recommendLevers.test.mjs`, `recommendSlots.test.mjs`, `recommendTrips.test.mjs`: their expectations moved from whole euros to cents.

## Commands run
- `node wt/t818-gap.mjs`, before and after the change.
- `node wt/t819-lever-time.mjs`.
- `npm test` in the worktree, with a real `public/` checked out by sparse-checkout.
- ESLint and design-lint on the touched files.
- The NOPUBLIC build `wt/dist-t818`, measured with `wt/t806-measure.mjs`.
- `node wt/t818-probe.mjs 5821`: the preview, Review and the planned trip after a hotel and eat-out swap.
- `node wt/pf2-end-walk.mjs 5821`.

## Config and secrets set
None.

## Before/after measurements
| Measure | Before | After |
|---|---|---|
| Finder total equals Finish to the cent, top 6 of May and November, unswapped (`t818-gap`) | 0 of 12 | 12 of 12 |
| The same over every stay and food swap of those trips | 1 of 108 | 108 of 108 |
| Largest gap a person | €1.35 | €0.00 |
| Browser: preview's group total after a hotel and eat-out swap, against Review | €2,322 against €2,321.56 (it was €2,322.00, a sum of whole-euro slots) | €2,321.56 against €2,321.56, and the planned trip the same |
| Food lever, 6 trips, first tap / again (node, no throttle) | not repriced | 1.7 to 5.4 ms / 0.1 to 0.3 ms |
| Modulepreloads | 37 | 37 |
| First-paint JS bytes | 1,369,991 | 1,369,991 |
| Plan tab first-load JS bytes | 2,902,967 | 2,903,397 (+430, including T816's hand-over) |
| Finder-only bytes | 85,359 | 86,848 (+1,489) |

- **`npm test` in the worktree:** 982 run (2 new). All the finder and recommend tests pass, including "receipt equals Finish to the cent: 12 of 12".
- **Environment failures:** the 3 failures there are the page-credits and layer-status tests. They read files the worktree's sparse checkout leaves out, and they fail the same way without this change. The full suite runs again on the main checkout before the deploy.
- **End walk:** 34 of 34, no errors.

## What broke and how it was fixed
**Five older tests failed at first.**
- **Cause:** they expected whole euros, or compared float sums (745.8299999) with a cent total.
- **A real one-cent mismatch:** one exposed a defect the traveller could see. The lines a person, each divided separately, summed to a cent less than the total. The largest-line rounding (`balanced`) fixes it.
- **Test fix:** the remaining tests now compare to the cent.

**The worktree data incident.**
- **What happened:** setting up this task, `git checkout -b` in the sparse batch worktree removed the tracked files under its `continent-app/public`. That folder was a junction to the main checkout's `public/`, so 48,037 files of the main checkout went.
- **How it was fixed:**
  - `git checkout -- continent-app/public` in the main root restored every file. The root tracks all of them, and its status showed no change in `public/` before.
  - `git -C continent-app checkout -- public/_routes.json` put back that one file; it differed only in line endings.
- **Result:** both repositories were clean afterwards. The worktree then got a real `public/` through its sparse patterns instead of a link.
- **Never deployed:** the incident never reached the site; the deployed build was made before it.
- **Recorded in memory:** never link a folder into a sparse worktree that excludes it.

## What is still open
- `withSlot` keeps a `sumSlots` fallback for a trip without its pricing context (a trip rebuilt from storage, such as Kept trips). Such a trip still sums its slots and is not repriced.
- The levers' per-trip cache lives as long as the trips' base objects (a WeakMap). Memory is bounded by the trips memo of 8 answer sets.

## Rollback procedure
`git revert` of this commit (`00e0d61b1`). Nothing stored changes shape: kept trips hold totals that may now carry cents, and they read the same either way.
