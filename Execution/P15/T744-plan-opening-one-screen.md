# T744: the Plan opening on one screen, in the app's face, with photographs and one price

## Task ID

T744 (P15), branch `p15-plan-opening-v2` in the root repo and in `continent-app/`. Follows T743 (`Execution/P15/T743-plan-opening.md`).

## Date

2026-10-27

## What changed

The owner reviewed T743 the same day and asked for: the typeface of the other tabs, no "Meet Carta" mark, no scrolling on the first page, the planned trips as one button rather than a grid, a new second half for the headline and a new line under it, more modern and visual, following the logic of the other tabs. The page now:

- **Fits one screen** at every size checked (360×640, 390×844, 820×1100, 1280×720, 1440×900), measured as `.pf` scrollHeight minus clientHeight = 0, with and without a trip in progress.
- **Leads with photographs.** Three journeys-library style heroes (Zermatt for hiking, Dubrovnik for cities, Benagil for the sea): one large tile and two stacked, above the words on a phone and to the right from 1024 px. The picture takes whatever height the words leave; under 700 px of height it shrinks to 120 px minimum, under 560 px it leaves. Each tile opens its style's weeks.
- **One honest price on the large photograph:** a white chip "Hiking, 7 days / From €79 a day", the hiking week in season this month that costs least a person a day (the app's existing `saved.costFromDay` wording).
- **Headline in Figtree 700**, the face of My trips and the other tabs: "Travel Europe your way, **priced day by day**", the second half in the brown. Line under it, the owner's positioning sentence (PRODUCT.md, T471-b): "Stop stitching a trip together from five apps. Carta plans the route, the stays and every day in one place." Six languages, word order kept through one `{accent}` placeholder.
- **Two buttons:** Start planning (primary, arrow) and Planned trips (secondary, opens the fifteen styles). The trip in progress stays one quiet row under them.
- **Removed:** the "Meet Carta" mark, Instrument Serif (fonts, token, lint allowance), the contour watermark, the eight-card grid and the style chips.

## Files touched

**Modified:**
- `continent-app/src/planner/flow/PlanHome.jsx`: rewritten.
- `continent-app/src/planner/flow/PlanFlow.jsx`, `continent-app/src/App.jsx`: the unused `onOpenJourney` prop removed.
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: `pf.home.title`, `pf.home.lede` rewritten; `titleAccent`, `browse`, `chipKind` added; `line`, `continue`, `trips`, `mast`, `templates`, `templatesHelp`, `allTrips`, `byStyle` removed (closes T743-b).
- `continent-app/src/styles/01-tokens.css`: `--serif` removed; `--text-plan-hero` now `clamp(32px, 3.9vw, 56px)`, `--tracking-plan` `-0.025em`.
- `continent-app/src/styles/86-plan-flow.css`: the opening block rewritten.
- `continent-app/scripts/ci/design-lint.mjs`: back to its pre-T743 state.
- `DESIGN.md`: `plan-hero` entry, "Plan opening exception (T743, T744)", sync line.

**Deleted:** `continent-app/public/fonts/InstrumentSerif-latin.woff2`, `InstrumentSerif-latin-ext.woff2`, `InstrumentSerif-OFL.txt`, `continent-app/public/img/plan-contours.svg`.

**Created:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files), `node scripts/ci/token-contrast.mjs` (0 under the floor), `npx eslint` on the two JSX files (clean), the NOPUBLIC build with `wt/vite.t743.mjs`, `node scripts/css-routes.mjs --check` (no plan-flow problem), two Playwright rounds over the five sizes above, and a click round: Start planning opens "What do you want to plan?", Planned trips shows the 15 styles, the city tile opens Cities' 25 weeks. No page errors.

## Config and secrets set

None.

## Before/after measurements

| Measure | T743 | T744 |
|---|---|---|
| Scroll on the first Plan screen, 390×844 | yes (about two screens) | 0 px |
| Scroll at 1440×900 | yes | 0 px |
| Style files fetched by the opening | 8 | 1 (plus the index) |
| Serif font bytes | 33 KB | 0 |

## What broke and how it was fixed

The first round showed soft photographs: a photograph that covers a tile taller than its own shape needs the width its height asks for, and `sizes` gave the tile's width. `sizes` now asks 190vw on a phone and 72vw on desktop for the large tile (up to the 1920 thumb), 60vw and 34vw for the small ones. On a 360 px phone the chip's price wrapped to three lines; it is the shorter "From €79 a day" and does not wrap. The large crop showed only the slope on desktop; `object-position: 30% 50%` keeps the Matterhorn in frame.

## What is still open

T743-a stands: a planned week cannot pre-fill the trip planner until the journeys wire carries catalogue stops. Nothing new.

## Rollback procedure

`git revert` the T744 commit in `continent-app/` and in the root repo (that restores T743's page), rebuild, `npx wrangler pages deploy dist --project-name carta-app --branch main`, or promote the previous Pages deployment (68cfd367). No data or schema change.
