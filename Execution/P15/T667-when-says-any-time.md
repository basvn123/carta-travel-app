# T667: the settings line's When says what the prices are for

## Task ID

T667

## Date

2026-10-24

## What changed

Owner answers on the PB1 review list (Claude Doc "Carta prijsmotor PB1: te bekijken", https://claude.ai/artifact/2yRFjfWf439yzWjCVECKmq), 2026-10-24:

- T663-a: price with the month the traveller chose; without a month, the year's average, and that must be clear. The engine already does the first part (T662, T663). The second part was missing: without the traveller's own dates the settings line showed Carta's suggested dates ("21 Nov to 28 Nov, 7 nights") while every price was the year's average.
- T662-b: under any time the flight is the cheapest period, taking every filter into account. The flight already takes the year's cheapest return (T663); "every filter" is row T667-a.
- B8 (one coffee a day in every profile but the cheapest) and B10 (activities never in the Explore card amount) decided. B11 decided: local transport gets an estimate and goes into the day price, so the price is as complete as possible; the short line names the items in it. All three marked "Besloten (24-10-2026)" in the plan doc. B9 and T661-b are still unanswered.

Code: `SettingsLine.jsx` `whenValue` reads the app's one price request (`settings.priceRequest.when`, T663). Not the traveller's own dates: "Any time". The Explore month filter on: that month's name. Own dates and a picked month read as before. No new string: `dates.any` exists in all six languages.

## Files touched

**Modified:** continent-app/src/components/SettingsLine.jsx (app commit c7fb051, root mirror in this task's commit). Execution/_OPEN.md.

**Created:** this report.

**Deleted:** none.

## Commands run

eslint on SettingsLine.jsx (0 errors; 6 fast-refresh warnings that were there before). Browser check, dev server port 5261, headless Chromium, script `wt/t667-check.mjs` (outside the repo), at 390 x 844 and 1280 x 800.

## Config and secrets set

None.

## Before/after measurements

| State | Before | After (desktop When; phone settings summary) |
|---|---|---|
| No dates chosen | "21 Nov to 28 Nov, 7 nights" | "Any time, 7 nights"; "Any time, 2 people" |
| Own dates 5 to 12 Dec | "5 Dec to 12 Dec, 7 nights" | same |
| Explore month filter June (`xm=6`) | "21 Nov to 28 Nov, 7 nights" | "June, 7 nights"; "June, 2 people" |
| Month December | "December, 7 nights" | same |

No page error in any state.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| T667 was first claimed by both this batch and the trip planner session's day planner batch | the peer had an unmerged T667 commit on `p15-day-planner` | agreed by message: T667 is this task, the peer renamed theirs to T668 and runs from there |
| A vite process from the PB1 end check kept port 5261 | stopping the shell left the node child running | killed by PID after checking its command line |

## What is still open

T667-a: under any time, pick the cheapest period that also passes every active filter (flight length, bag, party), not the year's cheapest and then filter. T667-b: B11 brings an estimated local transport line into the day price; plan F8 has it after F4, so the order of PB2 and PB5 needs a look. T661-b (scope confirmation) and B9 (homepage promise) still wait for the owner.

## Rollback procedure

Revert app c7fb051 and this task's root commit. The When value goes back to showing Carta's suggested dates.
