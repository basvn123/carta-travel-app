# Run report: Style Studio (travel styles overview and create wizard)

- **Status:** done (judge round 2 PASS, every criterion 4)
- **Date:** 2026-11-18
- **Level and playbook:** L2 · crew:design via deep-task (owner: "use the crew setup ... launch a lot of agents on checking every flow")
- **ROADMAP item:** G12
- **Branch:** `p15-style-studio` (worktree `C:/Users/Gebruiker/Documents/Portfolio/wt/style-studio`), based on `p15-integrate-2026-11-18`, not merged
- **Proposal the owner approved:** https://claude.ai/artifact/E9qHf87FdRKnmEBsnjb5bW
- **Undo:** `git revert` the run's 16 commits (`e61669ace0` to `03f17f6913`), or drop the branch; no data migration (old saved styles load and gain `ways` and `tradeoffs` on read)

## Summary
The round style button bottom left now opens one place, Style Studio. First an overview: a short explainer of why a style matters, then your styles as cards with what a day costs, one tap to switch, a More menu for Edit, Duplicate and Delete, and a New travel style tile. Making or editing a style is a wizard of ten short steps, one question each: name and who, where you sleep and eat, how you get there (several ways, one shown on Explore), what matters most with three save-money questions, then six "how you explore" questions. Every old way of editing a style is gone: the dock's inline editor and "Open all settings", the old styles sheet, the separate "How you'll spend" dialog, the taste sheet and its doors, the header door, the persona question, the place page bed chips. Explore's filters open on "Priced for", the search dock marks what the style set, and the style now reaches Ask Carta and the day planner. My trips wears a ticket.

## What was asked
See `brief.md` and `decision.md` (the owner's changes after the proposal are at its top): an overview first, a structured wizard, fewer words, no leftover panels, human copy, brand colours only (no "AI blue"), no overlap, clean card meta, a ticket icon, the persona question gone, the style wired into Ask Carta and plan-day, every flow checked by agents, right on phone, tablet and desktop.

## What we did
1. Intake, three explorers (current UI and data, consumers and nav, outside references), proposal artifact, owner approval with changes.
2. Prep commits: shared helpers into `src/browse/styles/` so old files could go.
3. Build in four parallel lanes in one worktree: A model and hook, B1 studio UI and six catalogues, B2 removals and doors, C filters and AI. Lane D: docs, stale comments, verify scripts.
4. Lead review of screenshots, one polish round (single frame on cards, On Explore mark, structured explainer, no teal).
5. Four flow checkers walked every flow in a real browser at 360, 390, 820 and 1440 and in six languages: 2 blockers, 9 majors (`flow-1.md` to `flow-4.md`). One fix round across three lanes (`fixes-r1.md`).
6. Judge 1 FAIL (leftovers, one red test), fixed; judge 2 PASS.

## Why
- One surface for every style edit: the owner's "nothing left from before, everything makes sense"; two ways to change a bed was the most common confusion the checkers found.
- A wizard of one question per step with "Save style" from step 4: short to finish, the explore half can wait.
- Persona cut and derived from the other answers: its ten choices repeated other steps; ranking still gets personas.
- Food bar in light umber instead of the house teal: the owner's explicit ask; recorded as a departure in DESIGN.md.
- The style sent to Ask Carta and plan-day: the explainer says the style steers them, and it did not before.

## Files changed
`git diff --stat p15-integrate-2026-11-18...p15-style-studio`: 150 files, about 6,100 added and 5,200 removed. The main ones:

| File | Change | Why |
|---|---|---|
| `src/browse/styles/` (StyleStudio, StyleOverview, StyleCards, StyleWizard, StyleSteps, StaySpendFields, studioSteps, studioDoors, styleBits, spendBits) | new | the one surface and its parts |
| `src/styles/79-style-studio.css` | new (replaces 79-travel-styles.css) | umber family and one saffron mark |
| `src/browse/TravelStylesSheet.jsx`, `LifestylePanel.jsx`, `TasteSheet.jsx`, `TasteDoor.jsx`, `components/StyleDoor.jsx`, `components/SettingsLine.jsx` (unmounted), the persona screen | deleted | old flows |
| `src/lib/travelStyles.js`, `hooks/useTravelStyles.js`, `lib/styleForAi.js` | `ways`, `tradeoffs`, derived personas, drafts, `createFrom`, `commit`, open state | the wizard's model |
| `planner/flow/tripSettings.js`, `lib/flights/flights.js`, `lib/recommend/adapters/stay.js`, `lib/price/styleDay.js` | trade-offs reach flight prefs, ranking and hostel options; day figure skips tier fallbacks | the answers change real things |
| `components/dock/StyleDock.jsx`, `Dock.jsx`, `TripDock.jsx`, `App.jsx`, price cards, planner Who and settings | every door opens the studio | one way in |
| `browse/PricedFor.jsx`, `ExploreFilterRail.jsx`, `components/SearchDock.jsx` | Priced for, style marks, ways first | style meets the filters |
| `functions/api/ask/answer.js`, `functions/_lib/prompts.js`, `supabase/functions/plan-day/` | style read, validated to enums, a few prompt lines | style steers the AI (Gemini) |
| `components/HouseIcons.jsx`, `AppHeader.jsx` | ticket glyph for My trips, cairn removed | owner's pick |
| `src/i18n/*.js`, `tests/home.test.mjs` | about 110 new keys, about 150 retired | six languages, no dead keys |
| `scripts/verify_lifestyle|stay_tiers|docks|explore.mjs`, `scripts/lib/dataMirror.mjs` | rewritten for the studio; data mirror for sparse worktrees | DOM checks |
| tests: `styleStudioData`, `styleStudioSteps`, `style-doors`, `aiStyle`, `travelStyles` and others | new and updated | |
| docs: HANDBOOK "Travel styles", ROADMAP G12, `docs/decisions/0011-travel-styles.md`, DESIGN.md, project map, craft guide | | in step with the behaviour |

## How it fits together
The corner disc and every other door call `ts.setOpen({ view, id, step })`. `StyleStudio` (lazy, in App) shows the overview or the wizard. The wizard edits a draft; `createFrom` or `commit` stores it, derives personas and, for the style in use, writes the stay half into choices, which the price engine reads everywhere. Trip settings seeded from a style carry its trade-offs into flight filtering and ranking and the planner's stay options. `styleForAi` turns the style in use into an enum-only object that Ask and plan-day read.

## How it was checked
Full table: `checks.md`.
- eslint 0 errors; fast build exit 0; i18nParity 21/21; design-lint no new findings
- Full `npm test`: 2274 tests, 2233 pass, 28 fail. Ours (style-doors) fixed and passing. The others were compared file by file with the base branch: they fail there too or swing both ways between runs (Windows worktree path `C:\C:\` and CRLF, DOM tests timing out under load). CI on Linux decides.
- verify_docks 51/51, verify_lifestyle and verify_stay_tiers OK, verify_explore 104/107 (three map checks outside this work)
- Browser: four flow checkers at 360, 390, 820, 1440 and six languages; judge shots `judge1-*`, `judge2-*`

| Criterion (judgement-2) | Score |
|---|---|
| Flow | 4 |
| Nothing old left | 4 |
| Truth | 4 |
| Craft | 4 |
| Accessibility | 4 |
| Nothing lost | 4 |
| Checks and docs | 4 |

Departures from the design defaults: the food segment of the day bar is light umber, not the house teal (owner's ask); one saffron "On Explore" mark.

## Open issues and risks
- The held strip says "Changed for this trip" but not what changed.
- `g:persona` stays as an internal seed marker in `travelStyles.js` and `stepText.js` (not a question any more); `pf.step.g:persona` could retire with it.
- In-browser save time after the A4 fix was not re-measured (node: 20 to 65 ms per figure).
- Account merge of styles across two devices was not walked in a browser (unit tests cover `mergeStyles`).
- Base-branch test failures listed in `checks.md` are not this run's and stay open.

## Next steps
- Owner: look at the studio on a phone and desktop (`npm run dev` in the worktree, or after merge).
- Merge `p15-style-studio` into `p15-integrate-2026-11-18` (or main with it) when the owner is happy; ship stays owner only.
- The where-to-go filters are the next run, as the owner said.
