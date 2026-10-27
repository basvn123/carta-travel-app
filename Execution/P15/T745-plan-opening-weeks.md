# T745: the Plan opening's photographs become three planned weeks in season, and a new headline

## Task ID

T745 (P15), branch `p15-plan-opening-v3` in the root repo and in `continent-app/`. Follows T744 (`Execution/P15/T744-plan-opening-one-screen.md`).

## Date

2026-10-27

## What changed

The owner kept T744's look and asked for the photographs to be more dynamic and to serve a clearer purpose (only the large one carried a price), and for a second half of the headline that suits the app better than "priced day by day".

- **Every photograph is a planned week.** The month picks the styles to look in (`SEASON` in `PlanHome.jsx`: October hiking, cities, cycling; December to February ski weeks, cities, food; July and August the sea first), each style gives its cheapest week a person a day that is in season, and the first three make the picture, with a fallback list for a thin month. Each tile shows the week's own photograph and a white card: style and days, the week's name (the title before its colon, or before its first comma when that is still long), "From €79 a day" and an arrow. A tile opens the whole week (`#journey=`). On a phone the two small tiles drop the name so the card does not cover the photograph.
- **Motion, inside the rules.** The weeks arrive once, 70 ms apart (`--dur-3`, opacity and a 12 px rise). On hover the photograph scales to 1.04, the card lifts 3 px to `--elev-3`, the arrow moves 3 px. Nothing loops; reduced motion stills it all.
- **Headline:** "Travel Europe your way, **at a price you know**". It says what Carta exists for (PRODUCT.md mission: a cheap flight is not a cheap trip; Carta removes the uncertainty). Six languages.
- The tiles have an accessible group name, "Planned weeks in season now".

## Files touched

**Modified:** `continent-app/src/planner/flow/PlanHome.jsx`; `continent-app/src/planner/flow/PlanFlow.jsx` and `continent-app/src/App.jsx` (the `onOpenJourney` door back); `continent-app/src/i18n/{en,nl,fr,de,es,it}.js` (`pf.home.titleAccent` rewritten, `pf.home.inSeason` added); `continent-app/src/styles/86-plan-flow.css` (the card, the arrival, the hover, the phone rule); `DESIGN.md` (the exception).

**Created:** none. **Deleted:** none.

## Commands run

`npm test` (833 pass), `node scripts/ci/design-lint.mjs` (nothing new in touched files), `npx eslint` on the two JSX files (clean), the NOPUBLIC build (`wt/vite.t743.mjs`), `node scripts/css-routes.mjs --check` (no plan-flow problem), two Playwright rounds at 360×640, 390×844, 820×1100, 1280×720 and 1440×900 plus a desktop hover, and a click on the cycling tile (opens `#journey=cz-cycling-south-bohemia-ponds`). No page errors.

## Config and secrets set

None.

## Before/after measurements

| Measure | T744 | T745 |
|---|---|---|
| Scroll on the first Plan screen, every size above | 0 px | 0 px |
| Photographs that say what they are and open something specific | 0 of 3 (style doors, one price) | 3 of 3 (a week each, with its price) |
| Style files fetched by the opening | 1 | up to 8 (cached and shared with Destinations' trip library) |

## What broke and how it was fixed

The first round truncated the small tiles' names on a phone ("Pristina & Prizr…") and the cards covered most of those photographs; the phone's small tiles now drop the name. The cycling week's name ran long on desktop ("Carp Country, Cycling the Třeboň…"); names over 28 characters stop at the first comma.

## What is still open

T743-a stands (a planned week cannot yet pre-fill the trip planner). The October picks show the photographs the library has; a weak hero on a week shows here first, which is the image audit's work, not this page's. Not deployed: the owner asked for merge and push.

## Rollback procedure

`git revert` the T745 commit in `continent-app/` and in the root repo (restores T744), rebuild, redeploy. No data or schema change.
