# T746: the Plan opening's two actions lead, and one planned day plays on one photograph

## Task ID

T746 (P15), branch `p15-plan-opening-v4` in the root repo and in `continent-app/`. Follows T745 (`Execution/P15/T745-plan-opening-weeks.md`).

## Date

2026-10-27

## What changed

The owner asked (through `/impeccable`, then a second message mid-task): remove the line under the headline; put the photographs lower; photographs lead to an overview of the planned trips, not one trip; add something that plays a day from a planned trip; make Start planning and Planned trips really stand out; one image is enough; the main job is a way to the planned trips; optimise; push and give a preview link.

- **The line under the headline is gone.** The page is the headline, then the actions.
- **Two tall actions** (56 px, 16 px bold): Start planning in brown with a shadow, Planned trips on the light brown tint with a calendar glyph. Stacked full width on a phone, side by side from 769 px. Planned trips opens the fifteen styles.
- **One photograph instead of three**, under the actions on a phone (down to the bottom) and on the right from 1024 px: the month's first style with a week in season (October: hiking), its cheapest week a person a day, that week's own photograph.
- **Play a day.** A white card on the photograph plays day 3 of that week (today "Day 3 of 7, Up to Prijevor and the Maglić summit"): morning, afternoon, evening and where you sleep, the first sentence of each from the written week, 3.6 s apiece, with four bars that fill as it goes. It plays once on its own when the page opens and again on the round Play button, which also pauses and replays. Its link, "More trips like this", opens that style's planned trips (the overview, as asked; nothing on the page opens a single week now). Under reduced motion it waits for Play and the bars do not run.
- **Loading.** The page reads the journeys index, then style files one at a time only until one has a week in season (usually one), then that one week: two or three files where T745 read up to eight.
- Keys: `pf.day.*` added, `pf.home.lede`, `pf.home.chipKind`, `pf.home.inSeason` removed, in six languages. Icons: `PlayIcon`, `PauseIcon`, `ReplayIcon`.

## Files touched

**Modified:** `continent-app/src/planner/flow/PlanHome.jsx` (rewritten), `continent-app/src/planner/flow/PlanFlow.jsx` and `continent-app/src/App.jsx` (the journey door removed again), `continent-app/src/components/Icons.jsx`, `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`, `continent-app/src/styles/86-plan-flow.css` (the opening block rewritten), `DESIGN.md` (the exception).

**Created:** none. **Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files), `node scripts/ci/token-contrast.mjs` (0 under the floor), `npx eslint` (clean), the NOPUBLIC build (`wt/vite.t743.mjs`), `node scripts/css-routes.mjs --check` (no plan-flow problem), two Playwright rounds at 360×640, 375×667, 390×844, 820×1100, 1280×720 and 1440×900, and a click round: Start planning opens the trip-kind sheet, Planned trips shows 15 styles, More trips like this shows hiking's 25 weeks, Pause holds the day on Morning. No page errors. Then `npm run build:pages` and a Pages preview deploy.

## Config and secrets set

None.

## Before/after measurements

| Measure | T745 | T746 |
|---|---|---|
| Scroll on the first Plan screen, every size above | 0 px | 0 px |
| Journeys files fetched by the opening | index + up to 8 style files | index + 1 style file + 1 week (October) |
| Photographs | 3 | 1 |

## What broke and how it was fixed

The first round truncated the day's title on a phone ("Up to Prijevor and the Maglić su…"); it now takes two lines. The day card's link first opened its week, which the owner had just ruled out for the photographs; it opens the style's planned trips instead.

## What is still open

T743-a stands. Not deployed to production: the owner asked for push and a preview link.

## Rollback procedure

`git revert` the T746 commit in `continent-app/` and in the root repo (restores T745), rebuild, redeploy. No data or schema change.
