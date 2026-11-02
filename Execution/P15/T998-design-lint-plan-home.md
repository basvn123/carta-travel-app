# T998: design-lint on the Plan home and TripArt

## Task ID
T998. The number was taken after travel-app-1b reserved T992 to T997.

## Date
2026-11-02

## What changed
The owner forwarded a failed `design-lint` run (GitHub Actions). That workflow has failed on every push in its last 30 runs, back to before T986: the run on main now reports 463 new violations in total. Most come from earlier work, in files such as `96-search-dock.css`, `62-home-story.css`, `45-empty-states.css` and `SearchDock.jsx`.

This task fixed the violations that T988 to T991 added and that can be fixed without changing the look:
- **New trip tile.** It is the kit `Button` (quiet look replaced in CSS), not a raw `<button>`.
- **Shadows.** Every shadow on the Carta door, the deck photos and the TripArt disc is an `--elev` token.
- **Radius.** The deck photo's radius is `--radius-control`.
- **Up next.** The name lost its text shadow. The dark fade under it carries the contrast.

**Left flagged:** the gradients on the umber door, Up next, the card fade and TripArt. The lint's `gradient` rule is the pre-2026-10-30 contract. The owner's design-freedom decision of that date allows gradients, and the lint was never brought in line. Whether to drop or narrow that rule (or add these lines to the baseline) is an owner call: T998-a.

## Files touched
**Modified:**
- `continent-app/src/planner/flow/PlanHome.jsx`
- `continent-app/src/styles/planners/90-plan-home.css`
- `continent-app/src/styles/98-trip-art.css`

## Commands run
- `node scripts/ci/design-lint.mjs`
- `npx eslint`
- `npm test`: 1204 of 1204 pass.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| design-lint findings in T988 to T991's files (not counting gradients) | 7 | 0 |
| design-lint new violations, whole tree | 470 | 463 |

## What broke and how it was fixed
- **No dev-server check.** The dev server could not serve a page: two other sessions' Vite servers (ports 5203 and 4198) held the processor, and they were left running. The look was checked on the production build through `vite preview` instead.

## What is still open
T998-a: the owner decides how design-lint treats gradients after the 2026-10-30 design-freedom decision. Until then the workflow stays red on every push.

## Rollback procedure
`git revert c6f7c770e9`.
