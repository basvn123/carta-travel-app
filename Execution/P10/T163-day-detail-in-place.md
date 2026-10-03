# T163: Day detail opens in place

## Task ID

T163 (mind-map number T167). Branch p10-c3-day-in-place, in both repos.

## Date

2026-10-03

## What changed

The "More about this day" control already existed on the trip page and the journey page, and it already showed the day's detail without leaving the page. What it did was mount the detail the moment the button was pressed, so the card jumped taller with no transition. It is now a proper accordion. The panel is always in the DOM and its height animates from zero to full, so the card grows in place. The button gained aria-controls pointing at the panel, and the closed panel is visibility hidden, so its links stay out of the tab order and away from screen readers until it opens.

How it works: the markup is a grid container (tday-panel) with one child (tday-panel-in). Closed, the grid row is 0fr and the child clips its content. Open, the row is 1fr. The visibility switch is delayed on close so the collapse animation is seen. Reduced-motion users get no transition. The labels Morning, Afternoon and Evening come from the unchanged journey page markup, and the trip page shows the leg line and the sights as before.

I chose the accordion rather than a bottom sheet on mobile. The spec allows either, and the accordion is one mechanism for desktop and phone, with the card growing only for the person who asked. The sheet can be added later if the owner wants it.

## Files touched

Modified, in continent-app: src/browse/TripPage.jsx, src/browse/JourneyPage.jsx, src/styles/24-destination-workspace.css.

Created in the root repo: Execution/P10/T163-day-detail-in-place.md. Modified: Execution/_OPEN.md.

## Commands run

npx eslint on the two JSX files, then npm run build in the app worktree, then deleted dist and dist-data.

## Config and secrets set

None.

## Before/after measurements

Not measured as a metric. The task promises behaviour, not a number; the card heights above are from the browser check. Page height with every day closed is unchanged, since the closed panel has zero height.

## Browser check

Run headless with Playwright against the Vite dev server on port 5205, at 380 and 1280 px wide, on the Cycling journey page (the Donauradweg) and on a composed trip page (6 days, Salzburg and Vienna). Screenshots are in wt/T163-shots, outside the repo. On all four combinations the panel opened in place: aria-expanded flipped, the button's aria-controls matched the panel id, and the card grew with no jump (journey card 100 to 389 px at 1280 and 135 to 612 px at 380, with an intermediate height 60 ms in; trip card 238 to 343 and 256 to 361). Closing returned each card to its exact starting height. Closed, the panel computed visibility hidden, and pressing Tab from the button did not land inside it. The page did not scroll sideways at either width. Nothing needed fixing, so the app commit is unchanged.

## What broke and how it was fixed

My first scripted edit of TripPage.jsx closed the wrong block and lint reported adjacent JSX elements. I repaired the block by hand and lint and build then passed.

## What is still open

The day carousel (T162) is gated and not built; when it lands, its cards should reuse this panel. Both items are in the register.

## Rollback procedure

Revert the single app commit on branch p10-c3-day-in-place (git revert, or reset to the master base aa1fce5). No data or schema is touched.
