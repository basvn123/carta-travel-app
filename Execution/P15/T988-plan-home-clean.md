# T988: the Plan home with trips, cleaner

## Task ID
T988

## Date
2026-11-01

## What changed
The owner asked for these changes on 2026-11-01, through the impeccable skill:
- Make the head (New trip, Carta's own trips, then the trip up next) cleaner and more professional. Carta's own trips should look as good as it does on Explore.
- Give the top bar the same colour as the page.
- Make the Up next card nicer, with some movement.
- Remove "No past trips yet" and the other empty-tab lines.
- Remove "Carta's trips in season".
- Keep the Upcoming tab, but draw its cards like Explore's and drop the "7 nights, 1 place" line under them.

Changes on the Plan home with trips (`PlanHome.jsx`, `90-plan-home.css`):
- **Head.** The title "Your trips" sits with New trip in one row. Carta's own trips is now a door in Explore's umber (the colour of the T964 folder and the Ask door). It holds a small deck of three trip-style photos that deal in when the page opens and fan out on hover. On a phone the door runs full width under the title row. From 769 px it sits in the head row between the title and New trip.
- **Up next.** The cover photo fills the card: 4:3 on a phone, 3:1 from 769 px. The name and dates sit on a dark fade at the bottom, the countdown is a solid chip, and a round arrow opens the trip. The one moving thing is a slow 18 s drift on the photo. A trip with no photo stands on the umber gradient with a dashed route that moves slowly. The label "Up next" or "Continue planning" over the name, the separate Open trip button, and the nights and places count are gone.
- **Trip cards.** Cards are drawn like Explore's rail cards (`80-story-rail.css`): the photo is square on a phone and 4:5 from 769 px, with one solid chip and the name and dates on the page underneath. Nights and places are gone. A trip with no photo gets the umber look instead of a blue, green or orange letter tile. From 769 px there are four cards to a row.
- **Tabs.** Only tabs that hold trips are drawn, so the "No … yet" lines are gone.
- **Removed.** "Carta's trips in season" (its rail and its See all) is gone, along with the `useSeasonCards` hook.
- **Drafts.** A draft row shows only its dates line, without nights.
- **Top bar.** On any Plan screen (`body:has(.pf)`) the top bar takes the Plan ground colour, `--plan-ground`, at every width.

Not changed:
- The Plan home with no trips (the slogan, the two actions, the photo fan).
- The setup questions.
- The trip and day pages, apart from the top bar colour.

Eight i18n keys are no longer used and leave all six languages: `pf.home.upNext`, `continuePlan`, `openTrip`, `none.upcoming`, `none.planning`, `none.past`, `cartaInSeason` and `seeAll`.

Research for this task: one agent looked at competitor Plan screens (Polarsteps, Tern, TripIt, Expedia and Vrbo), and one agent audited every Plan screen. Every empty state they found has one message and one action, and none of them put rails or alerts on the trips home. Both fed the removals above.

Departures from the direction contract, under the owner's design-freedom decision of 2026-10-30:
- A full-photo card with a dark fade.
- An umber gradient door.
- Infinite slow drift on the photo, which reduced motion turns off.

## Files touched
**Modified:**
- `continent-app/src/planner/flow/PlanHome.jsx`
- `continent-app/src/planner/flow/PlanFlow.jsx` (drops the `onOpenJourney` prop that PlanHome no longer takes)
- `continent-app/src/styles/planners/90-plan-home.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`

**Created:** `Execution/P15/T988-shots/` (before and after, at 375 px and 1440 px)

## Commands run
- `npx eslint` on the two jsx files: 0 errors. The one warning (`tripState` export) was there before.
- `npm test`: 1204 of 1204 pass, and `keyStats` passes again after the keys were removed.
- Playwright on the dev server with `VITE_E2E_SEAMS=1`, four seeded trips (two upcoming with photos, one without, one past), at 375 px as a touch phone and at 1440 px.

## Config and secrets set
None.

## Before/after measurements
| Metric | Before | After |
|---|---|---|
| Top bar and page colour (375 px and 1440 px) | different (`--surface-page` and `--plan-ground`) | both rgb(250, 246, 241) |
| Doors to Carta's trips on the page | 2 (head button and in-season See all) | 1 |
| Lines under a trip card | 3 (when, name, nights and places) | 2 (name, when) |
| Horizontal scroll | none | none |
| Plan home tap targets under 44 px | not measured | 0 |

## What broke and how it was fixed
- **Long door on desktop.** In the first version the door was a 1200 px bar with nothing on its right. From 769 px it now moves into the head row.
- **Tall photo.** The 21:8 Up next photo was 460 px tall at 1440 px. It is now 3:1.
- **Letter tiles.** Trips with no photo showed a letter on the cost colours (blue, green, orange). They now use the umber look.
- **Disk full.** The C: drive filled to 7 MB mid-task. A Visual Studio installer cache, the npm cache and old Claude temp folders were cleared with the owner's go-ahead.

## What is still open
Nothing for this task. Ideas from the research that the owner can pick from, each added only if asked:
- The weather at the place when the trip is less than ten days away, on the Up next card.
- A resume chip on a draft, showing the step it stopped at.
- Hiding the Up next trip from the Upcoming tab, where it shows a second time. The owner said they like the tab as it is, so it was kept.

## Rollback procedure
`git revert 1f277125a5`. This brings back the in-season rail, the tabs' empty lines, the old Up next card and the eight keys.
