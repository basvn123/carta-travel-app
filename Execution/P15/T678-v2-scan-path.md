# T678: the V2 price scan under a path with a space

## Task ID

T678

## Date

2026-10-24

## What changed

`tests/priceSources.test.mjs` (invariant V2, written in T662) built its scan root from `new URL("..", import.meta.url).pathname`, which keeps `%20` for a space. In the main checkout (`.../Travel App/continent-app`) the scan therefore read no files: "no price outside the engine" passed with nothing found, and "no stale entry" failed. In the batch worktree (`wt/p15-price-pb1-app`, no space) both passed, so the PB1 checks did not catch it; the full `npm test` on merged app master did (723 of 724). The root now comes from `fileURLToPath`, and the scan asserts that it found the kernel (`src/lib/costIndex.js`), so an empty scan fails instead of passing.

## Files touched

**Modified:** continent-app/tests/priceSources.test.mjs (app commit cf88ecb, merged as cd3e008; root mirror in this task's commit).

**Created:** this report.

**Deleted:** none.

## Commands run

`node --test tests/priceSources.test.mjs` in the main checkout and in the worktree (3 of 3 in both); `npm test` in the main checkout.

## Config and secrets set

None.

## Before/after measurements

| Measure | Before | After |
|---|---|---|
| `npm test`, merged app master (main checkout, with public/) | 723 pass, 1 fail | 724 pass, 0 fail |

## What broke and how it was fixed

See What changed.

## What is still open

Nothing.

## Rollback procedure

Revert app cf88ecb (merge cd3e008) and this task's root commit. V2 then passes vacuously in any checkout whose path has a space.
