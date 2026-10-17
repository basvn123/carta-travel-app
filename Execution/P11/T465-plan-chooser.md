# T465: The plan chooser, two tiles

## Task ID

T465

## Date

2026-10-17

## What changed

On a phone the bottom nav's plus opens the choice between the Trip planner and the Day planner. It was two rows, each an icon, the planner's name and a grey sub line ("Route, stops and ground costs", "Hour by hour in one city"). The owner asked for the sub lines to go and for a more modern, professional way to choose between the trip and the day.

Market research (the T464 research agent) looked at how leading apps present a choice made from a plus button:

- **Wanderlog** has an orange plus in its bottom bar offering "Trip plan", "Trip story" and "Guide".
- **Google Maps Contribute** offers "Add place", "Edit map", "Write review" and "Add photo".
- **Instagram** offers POST, STORY, REEL and LIVE.
- **Airbnb** labels its Homes, Experiences and Services tabs with an illustration and one word each.

They share one pattern: one or two words, no explanatory sub line, three or four choices at most. Where a choice carries a picture, the picture is an illustration with a single word under it.

The chooser is now a menu above the plus, with three parts:

- **A heading:** "Plan something new", the label it already carried, now visible.
- **Two equal tiles side by side.** Each tile is one link holding a small drawing in ink and the planner's name with a chevron:
  - The Trip planner's drawing is a route through three stops, the last one filled.
  - The Day planner's drawing is a day down a timeline, three stops with their bars.
- **The in-progress dot.** While a trip plan is in progress, the Trip planner tile carries the same dot as the plus, with its words for screen readers.

The drawings are line work on the tile's white, not icons on a tinted tile (carta-design "Icons"). Neither tile is the view's primary, so nothing in the chooser is brown. It stays a menu and not a sheet, because carta-design's dialog family says a choice of two from the bottom nav is a menu. It has no grab handle and no close of its own; the plus (which turns to a cross), the scrim and Escape close it, as before. The focus trap is unchanged.

The tiles keep the planners' own names ("Trip planner", "Day planner"), the names the desktop header uses. That follows the one-name-per-section rule of T381, rather than inventing single words for the same sections.

## Files touched

**Modified (app repo, continent-app/):**
- src/components/BottomNav.jsx (the two drawings and the tile markup)
- src/styles/10-shell.css (the chooser: heading, tile grid, tile, drawing strokes)
- src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js (nav.planTripSub and nav.planDaySub removed)
- scripts/verify_bottom_nav.mjs (two checks: two drawn tiles side by side with no sub line, the visible heading)
- src/lib/homeDemo.js (a euro sign in a T464 code comment, which the money-literal lint rule caught, written out)

**Created (root repo):**
- Execution/P11/T465-plan-chooser.md
- Execution/P11/T465-shots/ (before and after at 390 in English, 360 in German and 393 in French)

## Commands run

```
cd continent-app
npx vite --port 5210 --strictPort
node scripts/verify_bottom_nav.mjs http://localhost:5210/
npm test
node scripts/ci/design-lint.mjs
& impeccable.cmd detect --json src/components/BottomNav.jsx
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Lines of text in the chooser (en) | 4 (two names, two sub lines) | 3 (heading, two names) | -1 |
| Chooser items at 390 (en) | 330 x 71 rows, stacked | 163 x 120 tiles, side by side | +49 px tall a target |
| Chooser items at 360 (de) | 330 x 71 | 148 x 112 | |
| i18n keys | nav.planTripSub, nav.planDaySub in six languages | removed | -12 strings |
| verify_bottom_nav | 19 checks | 21/21 | +2 checks |
| npm test | 451/451 | 451/451 | 0 |
| Design lint, new violations | 0 | 0 | 0 |
| impeccable detect on BottomNav.jsx | | [] | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The design lint reported one new money-literal | A T464 code comment in src/lib/homeDemo.js quoted a price with a euro sign | The comment writes the figure out in words |
| scripts/verify_focus_trap.mjs failed before reaching the chooser | It serves the built dist with vite preview, and the dist predates this work; it timed out waiting for the destination page | Not a T465 fault; the preview server it left on port 4197 was stopped. The chooser's trap is unchanged code (useFocusTrap on the same ref) |

## What is still open

T465-a: run scripts/verify_focus_trap.mjs against a fresh build (T435 builds one for its quality floor), so the chooser's trap is re-proved with the new tile markup.

T465-b: the owner sees the chooser on a real phone. The tile drawings are a design call that carta-design does not spell out (it covers icons, not small drawings on a menu tile), so the owner should confirm it, or ask for icons instead.

## Rollback procedure

In the app repo: `git revert -m 1 <merge of p11-plan-chooser>`. This restores the rows and the two sub line strings in six languages. In the root repo, revert the report commit.
