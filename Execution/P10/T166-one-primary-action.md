# Execution Report: T166

## Task ID

T166: C10: One primary action per view

## Date

2026-10-03

## What changed

The first pass (commit ab81c54 in the app repo) only restyled three button groups and left two mistakes behind. This pass re-measured every main view in a browser and finished the job. After it, each measured page shows exactly one filled action, except the tab views, where the phone's round plus button and the desktop "Get a pass" chip still add a second filled control. Those two are chrome and are left as owner decisions.

How the primary is chosen on each page. The destination page makes "Plan a trip here" the primary and puts "Plan a day here" beside it as a bordered secondary; the PDF download, Shortlist, Share and Maps links are secondary. The beach, lake, mountain and journey pages make "Price a trip to {city}" the primary, which is the button the task text names. A city-day trail page ("Vienna in a day") makes "See Vienna prices" the primary and drops the GPX download to a bordered secondary. A hike trail page has no price door, so its GPX download stays the one primary. The trip page, the shared trip link, the trip planner step and the day planner keep their single existing filled button.

Two defects in the first pass are fixed. It gave both destination-page planner doors the class .destp-plan-btn and filled that class, so the page showed two primaries. It also left an old hover rule on .feat-dayplan, so the new bordered secondary turned solid ink on hover. The new rule `.destp-plan-btn + .destp-plan-btn` makes the second door secondary only when two sit side by side, so a page that offers only one door keeps it primary.

I also fixed a second kind of filled button: the active tab on the Destinations category rails (.side-cat.on on desktop, .places-cat.on on phone) and on the My trips tabs (.saved-cat.on) was filled --accent. DESIGN.md says an active toggle is --ink-fill, so those three rules now use --ink-fill. On My trips this takes the empty state from two filled buttons to one.

The shared Button component (src/components/Button.jsx) was not adopted. These controls are bespoke classes in a row with matched heights and radii (the destination page row is 40px high with 10px radius, Button is 44px high with 6px), so swapping them would restyle the whole row and need JSX edits in page components that other wave 12 sessions are editing. The change here is CSS only, and the swap is raised as an open item.

## Files touched

Modified (app repo, continent-app, branch p10-c10-one-primary):
- src/styles/23-places-pages.css: .bpage-base filled (first pass); .tpage-cta now --accent with a hover; the city-day trail GPX button steps down through `.tpage:has(.tpage-cta) .tpage-primary`
- src/styles/24-destination-workspace.css: .destp-pdf bordered secondary (first pass); .side-cat.on and .places-cat.on use --ink-fill
- src/styles/25-feature-pages.css: .saved-cat.on uses --ink-fill
- src/styles/26-shortlist-extras.css: .destp-plan-btn primary (first pass); second door secondary; .feat-dayplan secondary (first pass) with its stale ink hover rule removed

Modified (root repo):
- Execution/P10/T166-one-primary-action.md (this report, rewritten)
- Execution/_OPEN.md (rows T166-a to T166-g)

Created: none. Deleted: none.

## Commands run

```
cd C:\Users\Gebruiker\Documents\Portfolio\wt\T166-app
npx vite --port 5212 --strictPort
node <scratchpad>\audit2.mjs <label> shots
node scripts/ci/design-lint.mjs
git add src/styles ; git commit    (bdf0dc5, then c2674d3)
```

The Vite dev server ran one at a time and was stopped after each browser check. The measurement script is a Playwright script kept in the session scratchpad, not in the repo. For each view it opens the URL at 380 by 800 and at 1280 by 900 in a guest session, waits for a page-specific selector, then walks every button, link, role=button and summary element. An element counts as a filled primary when it is visible (checkVisibility, a nonzero box, and the element at its centre point is itself or a descendant, so chrome hidden under a full-screen page is not counted) and its computed background-color is --accent (rgb 224, 90, 71), --accent-hover or --accent-press. Persistent chrome (the "Get a pass" chip, the round plus button, the category rails, the Filters opener) is tallied separately. The selected date in the day planner calendar is a selection state and is listed rather than counted. Dark fills under luminance 140 are listed too, which is how the ink-filled "See Vienna prices" button was found. The same script ran against three states of the app: the commit before the first pass (70cba6f), the first pass (ab81c54) and this pass (c2674d3). design-lint reported 204 violations, 204 in the baseline, 0 new. ESLint does not lint CSS and no JS file was touched, so there was nothing to lint.

## Config and secrets set

None.

## Before/after measurements

Filled primary actions per view, excluding persistent chrome and selection states. Before is the app at 70cba6f, After is c2674d3. The counts were identical at 380px and at 1280px for every view, and no measured view scrolled horizontally at either width.

| Metric | Before | After | Delta |
|---|---|---|---|
| Destination page (#dest=BRU, #dest=gem:valbona) | 1 (PDF download) | 1 (Plan a trip here) | 0, but the right button |
| Beach page, lake page, mountain page | 0 | 1 | +1 |
| Journey page | 0 | 1 | +1 |
| Hike trail page (#trail=176172&tc=ES) | 1 (GPX) | 1 (GPX) | 0 |
| City-day trail page (#trail=62253&tc=AT) | 2 (GPX, and the ink-filled "See Vienna prices") | 1 (See Vienna prices) | -1 |
| Trip page (#itin=ad-andorra-la-vella-barcelona-chain-5d) | 1 | 1 | 0 |
| Shared trip link (#trip=0.) and trip planner first step | 1 | 1 | 0 |
| Day planner landing, and with a destination | 0 and 1 | 0 and 1 | 0 |
| My trips, empty state, 380px | 2 (active tab, "Open the Day planner") | 1 | -1 |
| Destinations tab, Explore, Journeys index, region page | 0 | 0 | 0 |
| Filled chrome controls on the Destinations tab, 380px | 2 (active category, plus button) | 1 (plus button) | -1 |
| Filled chrome controls on the Destinations tab, 1280px | 2 (active category, Get a pass) | 1 (Get a pass) | -1 |

Against the first pass (ab81c54), the destination page went from 2 to 1 in this pass, and the city-day trail page stayed at 2 until this pass because its rules were untouched. The first pass's report said the trip page had 0 primaries before and 1 after. The measurement shows the trip page had 1 before ("Open in the trip planner") and still has 1; the 0-to-1 change happened on the beach, lake, mountain and journey pages. It also said "Plan a day" was the destination page's primary before; the measured primary was the PDF button. Its "5 secondary buttons" figure cited nothing and was not reproduced.

Not measured: the cycling route page and the cycling tour page (see open items), the account panel, later steps of the trip planner and day planner, and My trips at 1280px (the browser timed out loading it twice on this laptop).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Destination page showed two filled buttons | The first pass filled .destp-plan-btn, a class both planner doors share | `.destp-plan-btn + .destp-plan-btn` renders the second door as a bordered secondary |
| Day-plan secondary went solid ink on hover | The first pass added a new hover rule above the old `.feat-dayplan:hover` ink rule and left both | Removed the old rule |
| City-day trail page had two filled buttons | .tpage-cta was ink-filled and .tpage-primary was accent-filled, and no rule related them | .tpage-cta is the accent primary, and `.tpage:has(.tpage-cta) .tpage-primary` steps GPX down |
| Active category tabs read as primary buttons | Three rules filled the active state with --accent | Changed to --ink-fill per DESIGN.md |
| Cycling tour page showed "Reload the app" in the dev server | Not caused by this task: the same error appears at 70cba6f, and the cause was not investigated | Raised as T166-e |

## What is still open

Seven items, each also a row in Execution/_OPEN.md. First, the phone's round plus button and the desktop "Get a pass" chip are accent-filled on every tab view, so the Destinations, Explore, trip and day tabs show two filled controls; whether either becomes secondary is a product call (T166-a). Second, the primary on each page is a judgement the rules do not settle: Plan a trip over Plan a day and the PDF on the destination page, "Price a trip" on layer pages, GPX on a hike trail. I kept the most defensible and the owner should confirm (T166-b). Third, Explore has no primary action of its own, and its Filters opener is its only filled control on a phone (T166-c). Fourth, the selected date in the shared calendar is filled --accent beside the "Continue" button in the day flow; it is a selection, DESIGN.md says an active toggle is --ink-fill, but the calendar is shared by planner components other sessions edit (T166-d). Fifth, several views were not measured and one looks broken in dev (T166-e). Sixth, the controls were restyled in CSS and not moved to the shared Button (T166-f). Seventh, the audit script is not in the repo, so nothing stops the rule drifting again (T166-g).

## Rollback procedure

In the app repo, `git revert c2674d3 bdf0dc5` restores the first-pass state, and reverting ab81c54 as well restores the state before T166 (commit 70cba6f). In the root repo, revert the report commit. There is no data, schema or config change, and no build output is committed.
