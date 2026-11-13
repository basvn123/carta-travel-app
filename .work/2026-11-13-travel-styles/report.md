# Run report: travel styles (lifestyle and trip settings as one)

- **Status:** done (judge round 4 PASS, every criterion 4)
- **Date:** 2026-11-13
- **Level and playbook:** L2 · deep-task (owner: "use the crew orchestration system, high level")
- **Run folder:** `.work/2026-11-13-travel-styles/` (only this report is tracked)
- **ROADMAP items:** G12 (plan flow, the help-me-choose walk), D10 (price accuracy)
- **Branch:** `claude/lifestyle-trip-settings-redesign-9k2n7u` (the cloud session's assigned branch, in place of `p15-<slug>`); not merged to `main`

## Summary
The two settings families the owner named, Lifestyle (how I stay: party, bed, eating and drinking, way there) and trip settings (how I explore: one base or moving, persona, likes, avoid, getting around, day rhythm), are now one object: **travel styles**. A traveller keeps up to six named styles ("With the kids", "On my own", "The two of us"), switches in one tap from a door in the header of every tab, and each style card states what it costs a day. The active style prices the whole app, seeds every new trip so the planner asks only what a style cannot know, and is the taste profile Explore's For you reads. A change made for one trip holds the style ("Changed for now", Keep or Back) instead of rewriting it. In the same run the trip finder's ranking now follows one base vs moving, the persona, the priority and who comes, and the price follows getting around, a hire car, car seats, the bag and the stop's own nights.

## What was asked
See `brief.md`: clean, professional, out of the ordinary and flexible settings, top level and changeable at any stage on every tab; several saved setups chosen by who you travel with, lifestyle and trip blended; fewer near-duplicate planner questions; sub-agents researching each part and one reviewing every flow; price and ranking more accurate.

## What we did
1. Intake and plan: `brief.md`, `plan.md` (7-criterion rubric).
2. Explore, five parallel agents: Lifestyle map, planner questions, ranking inputs, price inputs, outside research on preference profiles (`explore-*.md`).
3. Decide: `decision.md`; lasting record `docs/decisions/0011-travel-styles.md`.
4. Build in three file-disjoint lanes: lead (styles model, store, sheet, header door, planner seeding and de-duplication, taste merge, docs), ranking agent (`lib/recommend/*`), price agent (`lib/price/*`).
5. Critique: a fresh reviewer traced every flow and found 11 issues, two high (`critique-flows.md`); all fixed, plus an older `urlState` bug it exposed (children set back to 0 came back on reload).
6. Verify: `checks.md`; judge rounds 1 to 3 FAIL (judgements 1 to 3), each fix round re-tested in node and the browser; round 4 PASS (`judgement-4.md`).

## Why
- Named styles behind a header door, not a second bar or a richer gear: switching is cheaper than editing (Apple Focus, Google Maps vehicle), and a row under the header is a carta-design "Never" (`explore-ux.md`, `decision.md`).
- The bed and the table stay in the one Lifestyle panel (carta-design "Lifestyle control: there is one").
- Trip changes hold the style rather than rewrite it, and loads never overwrite either side: judges 1 to 3 showed every "one truth" variant lost data somewhere.

## Files changed
`git diff --stat ce0e3d99..HEAD` lists every file (about 75). The main ones:

| File | Change | Why |
|---|---|---|
| `continent-app/src/lib/travelStyles.js` (new) | model, templates, store moves, taste link, hold rules (`afterChoicesChange`, `holdChoices`, `keepChoices`, `switchChoices`), account merge | one tested home for every rule |
| `continent-app/src/hooks/useTravelStyles.js` (new) | wires the rules to React, localStorage `carta.travelStyles.v1` | the store in `choices.travel_styles` |
| `continent-app/src/browse/TravelStylesSheet.jsx`, `components/StyleDoor.jsx`, `styles/79-travel-styles.css` (new) | the sheet (templates, cards with day figures, two halves, Keep and Back) and the header door | top level on every tab |
| `continent-app/src/lib/price/styleDay.js` (new) | a style's day, bed and food a person, from `priceDays` | honest cost before switching |
| `continent-app/src/planner/flow/styleSeed.js` (new), `flowGraph.js`, `TripFlow.jsx`, `PlanFlow.jsx`, `setupScreens.jsx`, `TripSettingsSheet.jsx`, `tripSettings.js`, `DaysPrompt.jsx` | new trips start from the style; the walk skips style answers; Who picks the style; gear shows the style and its tags; getting around and the day goal asked once | fewer questions |
| `continent-app/src/lib/recommend/*`, `lib/countryMatch.js`, `config/recommend.json` | shape nudge, persona types, priority pull, family kept, one heat and no-car rule, persona weight smoothed, no-car priced as public, the bag | ranking follows the settings |
| `continent-app/src/lib/price/*`, `config/pricing.json` (`car.local`), `planner/wizard/useWizardPricing.js`, `TripItinerary.jsx`, `lib/tripExport.js` | no local fares with a hire, parking and local driving, one seat count, stop nights, own itinerary row | price follows the settings |
| `continent-app/src/lib/urlState.js` | `gc`, `gb`, `df`, `cn` owned keys | stale children on reload |
| `continent-app/src/lib/taste.js`, `hooks/useAccountSync.js`, `hooks/useAppData.js` | merge styles by id, keep a held trip on sign-in, data default stands down | nothing silently overwritten |
| `continent-app/src/lib/plan/doors.js`, `planner/finder/planOf.js`, `finderHooks.js`, `GuidedTripWizard.jsx`, `useWizardHandOver.js`, `lib/shareLink.js` | the bag end to end | one bag everywhere |
| `continent-app/src/browse/TasteDoor.jsx` | every "Your travel style" door opens Travel styles | one concept, not two |
| `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` | about 65 keys each | six languages |
| tests: `travelStyles` (27), `recommendPrefs` (12), `priceLifestyleFixes` (7), `endToEnd` updated | | |
| docs: HANDBOOK "Travel styles" and plan flow, `docs/logic/price.md` PRICE-017, 033 to 035, 046, 047, `docs/decisions/0011-travel-styles.md`, `docs/project-map.md`, `docs/reference/config.md`, ROADMAP G12 and D10 | | same commit as behaviour |

## How it fits together
`useTravelStyles` (in App) keeps `choices.travel_styles` and puts the store on `SettingsContext`. The header door and the sheet read it; the active style's stay half sets `choices`, which the price engine reads everywhere; its explore half is written into `choices.taste` (Explore For you) and seeded into new trips' settings (`styleSeed.js`, sources `'style'`), which the trip finder ranks with. Trip-scoped writes call `hold()` first.

## How it was checked
Full table: `checks.md`.
- `npm test` before 2073 tests, 0 fail; after 2119 tests, 2107 pass, 0 fail, 12 skipped
- eslint 0 errors; design-lint 0 new; impeccable detect `[]`; css-routes, entry points, drift (746 constants, 405 tests), config reference all OK
- Browser (Vite, Playwright) at 1440 and 390: header door, sheet and figures, switching reprices the settings line, new trip Who with styles, trip settings gear, the hold (Changed for now, banner, Back restores), deleting styles, arrow keys; 0 page errors

| Criterion (judgement-4) | Score |
|---|---|
| One model, top level | 4 |
| One truth, nothing lost | 4 |
| Fewer, cleaner questions | 4 |
| Ranking follows the settings | 4 |
| Price follows the settings | 4 |
| Craft | 4 |
| Checks and docs | 4 |

Departures from the design defaults: a colour world per style (tokens only) on the door and cards; selected and changed states never colour alone (tick disc, words, dot plus accessible name).

## Open issues and risks
- No blended style (brief item 3 "or maybe blend those in"): styles are switched, not mixed; and only the active style is edited. ROADMAP G12 follow-up.
- The hold is tested as pure functions, not with a React render harness.
- `DaysPrompt` keeps unchanged style answers as the style's; that rule has no test, and `r:goal` is always the traveller's.
- `syncParty` holds on every Who Continue; the hold lifts at once when nothing differs.
- Your own car (`owncar`) pays local fares and no parking (owner call); a `car_needed` place in the planner still has no hire priced.
- Not shipped: deploy is owner only (`node scripts/ship.mjs`).

## Next steps
- Merge the branch to `main` after a look at both widths; ship when the owner chooses.
- The visual design pass the owner announced can start from `TravelStylesSheet.jsx` and `79-travel-styles.css`.

## Undo
`git revert` the run's commits (`ce0e3d99..HEAD`). No schema or data migration; `car.local`, `rank.shapeStep`, `rank.priorityPull` and `persona.types` are added config only; styles in localStorage and `choices` are ignored once the code is gone.

## Where to find things
- Brief and plan: `brief.md`, `plan.md`
- Exploration: `explore-lifestyle-and-questions.md`, `explore-ranking.md`, `explore-price.md`, `explore-ux.md`
- Decision and critique: `decision.md`, `critique-flows.md`
- Checks and judging: `checks.md`, `judgement-1.md` to `judgement-4.md`
- Lasting decision: `docs/decisions/0011-travel-styles.md`
