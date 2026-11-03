# T1037: page bars on the page's ground; Plan's inner screens without the app head

## Task ID
T1037

## Date
2026-11-03

## What changed
The owner asked for three things:
- the top bar (back, save, share) in the colour of the page, "for the entire app"
- on inner pages like Carta's own trips and the step after Start planning, no Carta mark, together icon or account; that same page bar instead
- "everywhere possible"

**Changes:**
- **The shared page bar** (`PageBar`, `.tpage-bar.ipage-bar`, worn by every full-screen page) is now on `--surface-page` instead of white. Its hairline shows only once the page has scrolled under it (`is-scrolled`, from the bar's own `nameOn`).
- **Plan's inner screens** (Carta's own trips, What do you want to plan?, the setup questions, the create screen) wear that bar: "← Plan", plus the page's name where it has one ("Carta's own trips"). `PlanFlow` tells the app it is past its opening (`onInnerChange`), and the app hides its head (`.top-bar.is-hidden`). The bottom nav stays.
- **Removed duplicates:**
  - the breadcrumb on Carta's own trips (Plan / Carta's own trips), since the bar names the page
  - the ✕ on What do you want to plan? (the bar goes back; Cancel stays)
  - the ✕ on the setup questions (their own Back between questions stays)

## Files touched
**Modified:**
- `continent-app/src/browse/PageBar.jsx`
- `continent-app/src/planner/flow/PlanFlow.jsx`, `CartaTrips.jsx`
- `continent-app/src/App.jsx`
- `continent-app/src/styles/70-item-pages.css`, `10-shell.css`

**Created:** `Execution/P15/T1037-shots/` (gitignored)

## Commands run
- `npm test`: 1223 pass. `eslint`: 0 errors. The 2 warnings in App.jsx (`setPendingFriend`, `setPriceRange`) existed before.
- Browser: Playwright at 390 and 1440. No page errors.
  - **Place page (Rome):** the bar background is rgb(246,245,242), the same as the page.
  - **Plan home:** the app head shows, with no page bar.
  - **Carta's own trips:** the app head is hidden; the bar reads "← Plan · Carta's own trips".
  - **Back:** returns to Plan home with the head back.
  - **Start planning:** the head is hidden; the bar reads "← Plan".

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Page bar colour | white (`--surface`) | the page's ground (`--surface-page`) |
| App head on Plan's inner screens | mark, together, account | hidden, page bar instead |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The phone check could not find Plan | It lives in the bottom nav there | The check clicks the bottom nav |

## What is still open
- **T1037-a:** "everywhere possible": other inner screens still sit under the app head. Examples are My trips' trip pages, Account sub-screens and the day planner. Apply the same rule (inner screen means page bar, no head) to them one by one.

## Rollback procedure
`git revert` the T1037 commit.
