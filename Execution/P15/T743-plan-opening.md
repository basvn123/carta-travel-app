# T743: the Plan opening, a page on warm paper with the planned trips to start from

## Task ID

T743 (P15), branch `p15-plan-opening` in the root repo and in `continent-app/`.

## Date

2026-10-27

## What changed

The first page of the Plan place (Plan with nothing open) was a white sheet over a map of Europe: the compass mark, "Hey, I'm Carta. Tell me how you like to travel and I'll plan the whole trip, with what every day costs.", Start planning, and an underlined "Open My trips" link that repeated the bottom nav. The owner asked (2026-10-27, through `/impeccable`) for a clean, editorial page for phone and desktop. It is now:

- **No map, no sheet, no grab handle.** The opening renders `PlanHome` on its own instead of `PlanStage`, so the map chunk and its tiles no longer load for the first Plan screen. Every later step (the trip-kind sheet, the questions, Create trip) keeps the map stage unchanged.
- **Warm paper.** `--plan-ground` (`--umber-50`, `#faf6f1`), the same warm family as the bottom nav.
- **A cartographic watermark.** Contour rings of one summit and a dotted route (`public/img/plan-contours.svg`, 12 KB) as a CSS mask over `--text` at 5 per cent, top right.
- **An editorial serif** for the headline and the section heading: Instrument Serif 400, self-hosted (21 KB latin, 12 KB latin-ext, OFL), token `--serif`. Everything else stays Figtree.
- **Copy split** into "Meet Carta" beside the mark, the headline "Travel Europe your way, down to the daily budget", the line "Share how you like to explore, and get a complete day-by-day route with transparent cost breakdowns.", and "Start planning" with an arrow. Six languages.
- **"Open My trips" removed.** In its place, only when a trip is in progress, a "Continue planning" card with the trip's name beside the action.
- **"Or start from a planned trip".** Eight written weeks from the journeys library, one a style, each the style's cheapest week a person a day that is in season this month: photo, style, days, title, "From €79 a person a day". A swipe rail on a phone, two columns from 769 px, four from 1024 px. Below them every trip style as a chip, and "All planned trips". A card opens the week's full plan (`#journey=`), a chip opens that style's weeks.

Three requests were adapted to written rules, not followed literally:

- The brief's "MEET CARTA" eyebrow: impeccable bans a kicker above a heading outright, so "Meet Carta" is a masthead beside the compass mark.
- The brief's emoji pills ("🏔️ Alpine passes & lakes, 7 days, ~€110/day"): emoji are not an icon system (carta-design, impeccable) and the tilde left the screen on 2026-10-24 (PRODUCT.md). The cards carry a real photograph and "From €110 a person a day", the library's own price line.
- The brief's invented trips (Alpine passes, Northern Italy by train, Vosges, Andalusia): replaced by the real written weeks, as the owner asked ("the precreated trips must be added").

## Files touched

**Modified:**
- `continent-app/src/planner/flow/PlanFlow.jsx`: the home screen renders `PlanHome` without the map stage; the old `HomeIntro` and its imports removed; two new props, `onOpenJourney`, `onOpenStyle`.
- `continent-app/src/App.jsx`: passes `openFeature('journey', …)` and `openTripStyles(…)` to PlanFlow.
- `continent-app/src/components/Icons.jsx`: `ArrowRightIcon`.
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: nine `pf.home.*` keys each.
- `continent-app/src/styles/01-tokens.css`: `--serif`, `--plan-ground`, `--text-plan-hero`, `--tracking-plan`.
- `continent-app/src/styles/86-plan-flow.css`: the opening's rules and the serif's `@font-face` (here, not in the planner sheet: `css-routes --check` flagged them as overridable from the route sheet); the old `.pf-intro-line` rules removed.
- `continent-app/src/styles/planners/86-plan-flow.css`: the old `.pf-intro`, `.pf-continue`, `.pf-quiet` rules removed.
- `continent-app/scripts/ci/design-lint.mjs`: `var(--serif)` is a fourth type token; `font-family` inside an `@font-face` block is not checked.
- `continent-app/scripts/verify_plan_mocks.mjs`: waits for `.pf-open` instead of `.pf-intro`.
- `DESIGN.md`: the `plan-hero` type entry, "Plan opening exception (T743)", the sync line.

**Created:**
- `continent-app/src/planner/flow/PlanHome.jsx`
- `continent-app/public/img/plan-contours.svg`
- `continent-app/public/fonts/InstrumentSerif-latin.woff2`, `InstrumentSerif-latin-ext.woff2`, `InstrumentSerif-OFL.txt` (from `@fontsource/instrument-serif@5.2.5`)
- `wt/vite.t743.mjs` (outside both repos, the fast build config)

**Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (no new violations in touched files; self-test ok), `node scripts/ci/token-contrast.mjs` (0 under the floor), `npx eslint` on the touched JSX (0 errors), the NOPUBLIC fast build with `wt/vite.t743.mjs`, `node scripts/css-routes.mjs --check` (no plan-flow problems; 5 older ones elsewhere), then the end check: the build served with `public/` as a fallback, Playwright at 390, 820 and 1440 px, with and without a trip in progress, and a click round on Start planning (opens "What do you want to plan?"), a trip card (opens the week, `#journey=ba-hiking-sutjeska-via-dinarica`), and a style chip (opens Cycling's 26 weeks). No page errors.

## Config and secrets set

None.

## Before/after measurements

| Measure | Before | After |
|---|---|---|
| Map loaded on the first Plan screen | yes (TripMap chunk and tiles) | no |
| PlanFlow chunk | not measured | 8,328 B (2,974 B gzip) |
| Extra bytes on the opening | none | serif 21 KB (latin), watermark 12 KB, eight style files of the journeys library (cached, shared with Destinations) |

## What broke and how it was fixed

- `TripFlow` already uses `.pf-home*` classes, so the first naming collided (`.pf-home-start` in both). Renamed the opening's classes to `.pf-open*`; the rename's sed also touched TripFlow's `.pf-home-cover`, `.pf-home-empty` and three `.pf-home` waits in `verify_plan_mocks.mjs`, which were put back.
- The end check's first round: on a phone the fifteen style chips wrapped six rows deep, and the 4:3 photographs filled the screen. The styles became one swipe row and the phone photographs 3:2; then the row's label wrapped, fixed with `white-space: nowrap`.
- The Vite dev server stalled on its first dependency scan with a fresh cache, and the DevTools browser timed out on screenshots; the end check used the fast build and Playwright instead.

## What is still open

- **T743-a.** A planned trip opens its written plan; it cannot yet pre-fill the trip planner, because the journeys wire has no catalogue stop ids (`basecamps` is empty, the gateway is an airport). A pipeline task would map each week's places to catalogue destinations with nights, then the card could use the door `openTripInPlanner` already gives the composed trips.
- **T743-b.** `pf.home.line`, `pf.home.continue` and `pf.home.trips` are no longer read; left in the six catalogs for a cleanup task.

## Rollback procedure

`git revert` the T743 commit in `continent-app/` and in the root repo, rebuild, redeploy (`npx wrangler pages deploy dist --project-name carta-app --branch main`), or promote the previous Pages deployment. No data or schema change.
