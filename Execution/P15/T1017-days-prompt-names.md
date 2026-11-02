# T1017: the days prompt's ways by name only

## Task ID
T1017

## Date
2026-11-02

## What changed
The owner asked to remove the subtext under "Carta plans every day" ("Every empty day filled from your answers. Change anything after.") and under the other ways in "How do you want to plan your days?".

- Each of the three ways now shows its icon, its name and its radio mark only: Carta plans every day, Plan with the Carta bot, I'll plan them myself.
- From 600 px the cards no longer keep a 176 px minimum height for the subline. They are 128 px high side by side, and 82 px stacked on a phone.
- The questions further down the prompt (what else, pace, start, what to keep) are headings, not sublines, and stay.
- The `pf.dh.*Sub` strings stay in the i18n files, unused.

## Files touched
**Modified:**
- `continent-app/src/planner/flow/DaysPrompt.jsx`
- `continent-app/src/styles/planners/89-plan-days.css`

**Created:** `Execution/P15/T1017-shots/`

## Commands run
- `npx eslint`: 0 errors. One warning predates this task (`Icon`, a false positive).
- NOPUBLIC build. Playwright at 390 px (touch) and 1440 px opened the prompt from Plan your days: 0 sublines; card heights 82 / 128 px.

## Config and secrets set
None.

## Before/after measurements
| | Before | After |
|---|---|---|
| Sublines under the ways | 3 | 0 |
| Card height, 1440 px | 176 px | 128 px |

## What broke and how it was fixed
Nothing.

## What is still open
Nothing new.

## Rollback procedure
`git revert feb6fdca17`
