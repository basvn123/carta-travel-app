# T468: Roadmap 1.9, the phone problems

## Task ID

T468

## Date

2026-10-17

## What changed

Roadmap 1.9 lists the phone problems the owner sees:

- primary buttons under the bottom bar
- buttons cut off at 380 px
- the wizard taking 48% of a Pixel 5

Its done condition is that no primary button is hidden on an iPhone 13 or a Pixel 5. Thirteen register rows carried pieces of it (T411-h, T413-c, T410-h, T389-i, T409-g, T411-c, T372-b, T386-d, T406-d, T402-d, T373-i, and the owner questions T432-g and T433-i). No harness in the repo measured a Pixel 5 or the iPhone 13's visible viewport outside the home page.

A new harness, `scripts/verify_phone_chrome.mjs`, walks every main phone screen at three sizes. The screens:

- Destinations and a destination page
- the Report a problem sheet, also with the keyboard up
- Explore's list
- the plan chooser, Lifestyle, the pass dialog, Account and My trips
- every trip wizard step and the planned trip
- the day planner start and a planned day

The sizes:

- the iPhone 13 visible viewport, 390 x 664
- the Pixel 5 visible viewport, 393 x 727
- 380 x 720 for clipping

On each screen it measures:

- every primary that cannot be brought fully above the bottom bar, after scrolling it into view or where something covers its centre
- every button, tab, chip or tile label cut inside its box
- the share of the screen held by fixed and sticky bars
- sideways scroll

The first run used the harness exactly as written. It found that every trip wizard step failed the quarter-screen rule: 29% of a Pixel 5 and 32% of an iPhone 13. The fixed bars were the header, the step's Back and Next footer, and the 86 px bottom bar. It also flagged three screens that turned out to be the harness's own mistakes, corrected before the second run:

- **The destination page and the pass dialog.** They cover the bottom bar, so their primaries were fully visible. The harness now counts the bar only where it is actually on top.
- **The Report a problem sheet.** It was flagged for the page's primary behind the sheet. With a dialog open, only the dialog's primaries count now.
- **Explore's search field.** It was flagged as clipped because it cuts a long typed query. A search field is a field, not a button label, and is excluded.

The fixes:

1. **The trip and day wizards.** While a planner step with its Back and Next footer is the screen, the bottom bar steps aside on a phone, as it already did for the keyboard (html.kbd-open). Every layout that follows `--bottom-nav-h` gives the room back, and the footer takes the home-indicator inset instead.
   - The CSS rule ignores a planner tab kept mounted behind another tab or under My trips or Account, so the bar is back everywhere else.
   - Back, the brand mark and the system back still leave the flow.
   - This answers the owner questions T432-g and T433-i in the direction the roadmap row asks for. A register row asks the owner to confirm it on a real phone.
2. **The Report a problem sheet.** Send is now the kit primary. Once the message or email field has focus and the keyboard has had time to rise, Send is scrolled into view inside the sheet.

## Files touched

**Created (app repo):**
- scripts/verify_phone_chrome.mjs

**Modified (app repo):**
- src/styles/60-v6-shell.css (the bar steps aside inside a planner step flow)
- src/components/ReportProblem.jsx (Send on the kit, brought into view on focus)
- src/styles/42-feedback.css (the bespoke Send rules removed)

**Created (root repo):**
- Execution/P11/T468-phone-fixes.md
- Execution/P11/T468-shots/

## Commands run

```
cd continent-app
npx vite --port 5210 --strictPort
node scripts/verify_phone_chrome.mjs --port=5210
node scripts/ci/design-lint.mjs
npm test
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Trip wizard fixed chrome, Pixel 5 (393 x 727), every step | 29% | 18% | -11 points |
| Trip wizard fixed chrome, iPhone 13 (390 x 664), every step | 32% | 20% | -12 points |
| Day planner start fixed chrome, Pixel 5 / iPhone 13 | 29% / 32% | 18% / 20% | -11 / -12 points |
| Screens over the quarter-screen rule (wizard steps, Pixel 5) | 7 of 7 | 0 of 7 | -7 |
| Primaries that cannot reach above the bar, iPhone 13 and Pixel 5 (after the harness corrections) | 0 | 0 | 0 |
| Labels cut at 380 px | 0 | 0 | 0 |
| Report a problem with the keyboard up (page 40% shorter): Send reachable | not measured, raw button | yes, at all three sizes | |
| Screens measured | 57 (19 x 3 sizes) | 60 (with the keyboard case) | +3 |
| verify_phone_chrome | 17 screens flagged (13 real: 7 wizard steps at Pixel 5 plus 6 that were harness errors) | 60/60 | |
| Design lint | 7,818 | 7,812 | -6 |

The original "48 percent of a Pixel 5" (T411-h) was measured before T432 and T458 rebuilt the wizard. At the start of this task the wizard took 29%; it now takes 18%.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The harness reported the destination page and the pass dialog as hiding their primaries | It read the bar's position even where a full-screen page or a sheet covers the bar | The bar counts only where elementFromPoint finds it on top |
| The harness reported the page's primary behind the Report a problem sheet | It checked every primary on the page | With an aria-modal dialog open, only that dialog's primaries count |
| The harness reported Explore's search field as clipped | The field cuts a long query with an ellipsis by design | Search triggers are excluded from the clipped check |
| The Lifestyle step timed out | Its door is on Explore's settings line, not on Destinations | The step opens Explore and taps the Lifestyle part |

## What is still open

T468-a: real phones.

- The harness measures emulated viewports, and the emulated safe-area insets are 0 px.
- On a real iPhone 13 and a Pixel 5, the owner checks four things:
  - the wizard without the bar
  - the footer above the home indicator
  - the Report a problem sheet with the keyboard up
  - the date fields of the first run (T402-d)

T468-b: the bar stepping aside inside a planner's step flow answers the owner questions T432-g and T433-i in the direction roadmap 1.9 asks for.

- Both rows are closed by this task.
- If the owner prefers the bar to stay, revert the one rule in 60-v6-shell.css. The wizard then needs another quarter-screen fix: folding its footer into a single row is the next lever.

T468-c: T410-h and T402-d are still open.

- **T410-h:** the next-trip card's secondary actions with the install hint showing. The hint shows only on a real phone browser, after a saved trip, so the harness cannot reach it.
- **T402-d:** the nav over a focused first-run date field. That needs a real keyboard. html.kbd-open already hides the bar while a field has focus.
- Both stay open for the real-phone round in T468-a.

## Rollback procedure

In the app repo: `git revert -m 1 <merge of p11-phone-fixes>`. The bar then stays visible inside the wizards again. In the root repo, revert the report commit.
