# T891 to T894: the plan flow studio and the ten travellers

## Task ID

T891 to T894, one batch (CLAUDE.md "Batches"), branch `p15-plan-flow-studio`.

## Date

2026-10-30

## Shared header

The owner sent a screenshot of the "What kind of traveller are you?" step on desktop: ten pastel cards in a narrow centred sheet. They asked for two things, researched first and proposed as an artifact:

1. How desktop questions can fill the screen in a way that helps the traveller.
2. A full redesign of the personas: Carta's colours, two per row, photos, ten human personas, more than one can be picked, and the matching takes them into account.

They judged the artifact "Plan Flow, Filled" (https://claude.ai/artifact/PRAP6NTS7yLGjjnuKson6n): "I love it but some things", then "in general I love it go on". Their changes, all built:

- the help line under the question ("Pick everyone you recognise yourself in, up to 3..."), the "2 picked" count line and the "why we ask" line go, because they make the screen busy;
- the line on a card was cut off; every line now shows in full;
- no white band under the photo: the Explore tile, with the text on the photo.

**Research behind the design, in the artifact:**

- live outcome beside the question: Kayak Explore, Zillow and Expedia's count on the button;
- named steps rather than a percentage bar: Conrad, Couper et al.; Villar, Callegaro and Yang (32 experiments);
- photos over words for taste: Stitch Fix, Pinterest and Spotify onboarding;
- people are more than one type: Amadeus Future Traveller Tribes 2030, Plog, Cohen.

**The owner's open decisions, defaulted as the artifact proposed:**

- the ten personas: the current ten ids kept, renamed. "Food first" and "Treat myself" were not swapped in;
- the cap: up to 3, and a fourth tick replaces the first;
- card order: fixed, with the owner's three first (the big city, the city base, the small towns).

**How it was checked.** This session has no app data and no access to the live site, so each task ran static checks only: eslint on the touched files, `npm test` and design-lint. The end check was one throwaway harness (`continent-app/__t895/`, deleted, never committed). It rendered the real `TripFlow` and `PlanFlow` with a synthetic catalogue of 24 European places. Their photos were the five home-film stills, so most persona cards show the no-photo fallback in the harness (the real catalogue has thousands of photos). Playwright drove it at 390x900, 820x1000 and 1440x900:

- Start planning, then the persona step with "Small towns with a view" and "Lakes and peaks" picked;
- Your trip so far opened on the phone;
- the "Which one is most you?" row;
- Continue to "What kind of trip?";
- the setup flow's first question on desktop.

| Check | Result |
|---|---|
| Page errors, console errors | none at any width |
| Horizontal overflow | none at 390, 820 or 1440 |
| Persona cards | two per row at every width; name and full line on the photo; selected ring and tick in umber |
| Live count | 12 places for towns and lakes, 19 for the big city and the sea; the best three (Bled, Hallstatt, Annecy) each say which pick they fit |
| Desktop studio | step list, 820 px question card, Your trip so far; a click on an answered step opens it |

## T891: several personas in the matching

### What changed

A persona answer is now up to three ids, one of them maybe marked "most you". `lib/recommend/persona.js` reads one id (as before), a list, or `{ ids, most }`.

- **A place:** its fit P is the best of the picks, each times its weight. The weight is 1 for the most-you pick, or for every pick when none is marked, and config `persona.otherW` (0.85) for the rest.
- **A trip:** its P is still its places' P weighted by nights. Now four nights in a city and four by a lake fit someone who picked both. A single pick never gave that.
- **Shapes:** the union of the picks' shapes, most-you first.
- **Reach:** that of the first pick that has one.
- **Reason line:** names the pick the trip fits best that has something true to say.

New functions:

- `picksOf`;
- `personaOf(guide)`;
- `personaMatches`: the count and the best places, used by Your trip so far;
- `personaPhotos`: one catalogue photo per persona, used by T892.

`tripSettings` normalises `personas` (up to 3, "A bit of everything" only alone) and `personaMost`. `persona` stays the lead id, so readers of the old field and trips saved before still work. `candidates.js` and `rank.js` read `personaOf(settings.guide)`. The finder's answer chips show one chip per pick.

### Files touched

**Modified:**

- `continent-app/src/lib/recommend/persona.js`, `candidates.js`, `rank.js`
- `continent-app/src/planner/flow/tripSettings.js`
- `continent-app/src/planner/finder/finderText.js`
- `continent-app/config/recommend.json` (persona `otherW`, the `_about` text)
- `continent-app/tests/persona.test.mjs` (3 tests)

### Commands run

`npx eslint` on the touched files, `node --test tests/persona.test.mjs`, `npm test`.

### Config and secrets set

`config/recommend.json`: `persona.otherW` = 0.85. No secrets.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `npm test` passing | 1114 | 1119 (whole batch) | +5 |
| `npm test` failing | 3 | 3 | 0 (the same three, they need `public/boot.json`) |

### What broke and how it was fixed

Nothing.

### What is still open

- The fit and photo picks are tested on a synthetic catalogue only. They need one look with the real data (T891-a).

### End check screens

The persona step with two picks, and the answer chips of the trips (unchanged look, one chip per pick).

### Rollback procedure

`git revert` the T891 commit. Saved trips with `personas` keep loading: the old `oneOf(g.persona)` reads the lead id that is still stored.

## T892: the persona as ten photographs

### What changed

`PersonaScreen` shows ten cards, two to a row on every width.

- **Card:** a full photo, 4:5 on a phone and 16:11 from 600 px, with the name and one line in the traveller's own words on an ink fade over the photo. This is the Explore tile, with no white band. The lines are short, so nothing is cut off.
- **Photo:** the best-known place among the 24 that fit that persona best (`personaPhotos`), never one photo twice. The credits come from the Commons credits file under one "Photo credits" button, as on "What are you up for?".
- **Picking:** up to three; a fourth replaces the first, and "A bit of everything" stands alone. With two or more picks, one chip row asks "Which one is most you?" and has "All the same". The most-you card wears a small "Most you" pill.
- **Wording:** the question reads "Which of these travellers are you?". The names follow the artifact ("The big city", "Small towns with a view", "Lakes and peaks", ...) in six languages.
- **Removed:** the pastel colour worlds, the line marks (`PersonaMark.jsx`) and the Details sheet.

### Files touched

**Modified:**

- `continent-app/src/planner/flow/setupScreens.jsx`
- `continent-app/src/planner/flow/questions.js` (the order; multi with max 3)
- `continent-app/src/styles/86-plan-flow.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: 23 keys added or reworded

**Deleted:**

- `continent-app/src/planner/flow/PersonaMark.jsx`

### Commands run

`python3 -I i18n_add.py k892.json pf.persona.mixTag` (scratchpad helper), eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

Not measured.

### What broke and how it was fixed

- **Raw button:** design-lint flagged the raw `<button>`, so the cards use the kit `Button`.
- **Shadow literal:** the double-ring box shadow was flagged, so the ring is an outline, as on the trip cards.
- **Fade gradient:** the ink fade stays a flagged gradient. It is the same fade as the trip cards, allowed by the owner's design-freedom decision (T878).

### What is still open

- Whether every persona finds a fitting, well-known photo in the real catalogue, and whether the credits file covers them all (T891-a).
- The detail texts (`pf.persona.*.stay`, `.visit`, `.move`, `.eg`) are no longer shown anywhere. They are kept for now.

### End check screens

The persona step at 390, 820 and 1440, with picks, the most-you row and the credits button.

### Rollback procedure

`git revert` the T892 commit. It brings back `PersonaMark.jsx`, the Details sheet and the single pick.

## T893: the studio, three columns from 1100 px

### What changed

From 1100 px a question stands in the middle of three columns.

- **Left, the step list (`FlowRail`):** the steps in named groups (Your trip; What you like; Practical; Last), each with a number. A done step has a tick and its answer under it, and the step in hand is marked. Any answered step, and the first open one, is one click away. The trip's own answers (Leaving from, When, Who) open the trip settings.
- **Middle:** the question card grows from 520 px or 640 px to 820 px.
- **Right:** Your trip so far (T894).

The setup questions (`PlanFlow`) get the list and the wider card, without a right column. Below 1100 px nothing changes. `stepText.js` writes each answer as one short line.

### Files touched

**Modified:**

- `continent-app/src/planner/flow/PlanStage.jsx` (`rail` and `side` props)
- `continent-app/src/planner/flow/TripFlow.jsx`, `PlanFlow.jsx`
- `continent-app/src/styles/86-plan-flow.css`
- `continent-app/src/i18n/{en,nl,fr,de,es,it}.js`: 33 keys (step names, groups, the side panel)

**Created:**

- `continent-app/src/planner/flow/FlowRail.jsx`
- `continent-app/src/planner/flow/stepText.js`
- `continent-app/tests/stepText.test.mjs` (2 tests)

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Question card width at 1440 (from the end-check screenshots) | 640 px (persona), 520 px (other steps) | 788 px on both, with the step list (248 px) and Your trip so far (340 px) beside it | the empty two thirds of the screen now hold the steps and the trip |

The 788 px is the 820 px maximum held to the middle column less its margins at 1440.

### What broke and how it was fixed

- **Step list:** the number sat above the step's name because the kit `Button` wraps its children in `.btn-label`, so the grid now sits on that label. End check fix, commit "T893: end check fix".
- **Persona card width:** the persona card stayed 640 px wide, because the wide-card rule (`.is-wide`) won over the studio width. A studio-and-wide rule now gives it the studio width. Fixed in the commit "T893: end check fix, the persona card takes the studio width".

### What is still open

- The setup questions have no right column yet (T893-a).
- The research's keyboard pattern (number keys to pick, Enter to continue) is not built (T893-b).

### End check screens

The persona step and "What kind of trip?" at 1440, and the setup flow's first question at 1440.

### Rollback procedure

`git revert` the two T893 commits. `PlanStage` without `rail` or `side` renders as before.

## T894: Your trip so far

### What changed

The right column (`FlowSide`) shows two things:

- **Places that fit:** once travellers are picked, how many places fit them (`personaMatches`: the rated places with a photo whose fit reaches `reasonMin`) and the best three with a photo. With more than one pick, each of the three says which pick it fits.
- **Every answer:** on hairlines, each a way back to its step; an empty one reads "Not yet".

The persona screen reports its picks before Continue through a `PersonaDraft` context, so the count and the three move on every tick. Below 1100 px the same column folds behind one "Your trip so far" button under the step's head, with the count in it.

### Files touched

**Modified:**

- `continent-app/src/planner/flow/TripFlow.jsx`, `setupScreens.jsx`
- `continent-app/src/styles/86-plan-flow.css`

**Created:**

- `continent-app/src/planner/flow/FlowSide.jsx`

### Commands run

eslint, design-lint, `npm test`.

### Config and secrets set

None.

### Before/after measurements

Not measured. The live count is a new figure, true by construction: it counts the catalogue's places, never an estimate.

### What broke and how it was fixed

- **The count box was cut off:** it sat under 13 answer rows and fell below a 900 px high screen, so it now leads the column.
- **Ticks on empty answers:** Leaving from and When were ticked while empty, so a trip answer is ticked only when it has a value.

Both are in the commit "T894: end check fixes".

### What is still open

- The count follows the travellers only. Weather, reach and budget do not move it yet (T894-a).
- The batch is merged, not deployed (T894-b).

### End check screens

Your trip so far at 1440 on the persona step and the next step, and opened at 390.

### Rollback procedure

`git revert` the two T894 commits. `PersonaScreen` then has no draft context to report to and behaves as in T892.
