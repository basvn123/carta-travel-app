# T877: the traveller persona in Help me choose and in the trip finder's scoring, deployed

## Task ID

T877

## Date

2026-10-30

## What changed

The owner asked for a persona, how someone travels rather than where they sleep or what they pay. Some stay in the big cities and hop between them. Others stay just outside the hubs (the owner's Côte d'Azur trip: Antibes or Saint-Paul-de-Vence, not Nice) and see the region from there. Others want small towns, nature, places few tourists find, or nights out. The scoring should tell these apart clearly.

**The question.** "What kind of traveller are you?" (`g:persona`) is the first help-me-choose question. It offers eight photo rows, each with a name and one example line: Big cities (Paris, Rome, Barcelona); A city base, day trips out (Lisbon, then Sintra and Cascais); Near the hubs, not in them (Antibes instead of Nice); Small towns and their region (Tuscany, town by town); Nature first; Off the beaten track; Lively and social; A bit of everything. Each photo is the catalogue place its example names (config `persona.photos`). One choice; selected is the tint, the brown edge and a tick; two columns from 769 px, on the wide card.

**The scoring** (new `src/lib/recommend/persona.js`, numbers in config `recommend.json` `persona`):
- Each place gets a persona fit P (0 to 1) from features the data carries: its size class (`place.class`), how good a base it is (`place.base`), its taste values (city, culture, nightlife, hidden, hiking, lakes, ski), its crowd tier in the month, and two features computed on a one-degree grid: the nearest metro and how far, and how many places rated 7.5 or more lie within 45 km. Building the grid takes about 0.35 s for 3,868 places, once per catalogue.
- The trip finder adds `weight x (P - 0.5)`, up to 1.5 points, to each country's place pool key (`personaPool`, from all the country's places rated 6.5 or more, so Antibes or Saint-Paul-de-Vence can lead) and to every trip's score (`rank.js`). Named countries use the same pool (the T859 named path skipped it at first). A named town still leads its own trips.
- The existing personal match stays capped at one point (owner decision 9), and the rating and Explore never read the persona.
- With What kind of trip unanswered, the persona sets the shapes (config `persona.shapes`). Big cities may sit up to 350 km apart (a train ride, config `persona.towns.cities`).
- Each card's first reason names the persona only when its fact holds: "A calmer base in Saint-Paul-de-Vence, 8 km from Nice", "Big cities: Nice and Marseille". Big cities needs every place to be a metro or a city; small towns needs two or more town-sized places (config `persona.reasonFacts`).
- The persona shows as an answer chip on Trips for you and as a line in the search brief.

## Files touched

**Created (app, commit bb07bd5, mirrored in the root repo):**
- `continent-app/src/lib/recommend/persona.js`
- `continent-app/tests/persona.test.mjs`

**Modified:**
- `continent-app/config/recommend.json` (the `persona` block, appended)
- `continent-app/src/lib/recommend/candidates.js`, `rank.js`
- `continent-app/src/planner/flow/setupScreens.jsx` (PersonaScreen), `QuestionScreen.jsx`, `questions.js`, `flowGraph.js`, `tripSettings.js` (`guide.persona`), `TripFlow.jsx` (wide card)
- `continent-app/src/planner/finder/finderText.js`, `FindingTrips.jsx`
- `continent-app/src/styles/86-plan-flow.css`
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js` (23 keys each: pf.q.persona, pf.persona.*, tf.reason.persona.*)
- `continent-app/tests/flowGraph.test.mjs`

**Created (root):** `Execution/P15/T877-traveller-persona.md`

## Commands run

1. A calibration script on the real catalogue (boot.json plus public/dest) printing each persona's top places for France, Italy and Portugal; weights tuned once (more weight on `base` for the personas that choose a base, more on `nature` for Nature first).
2. `npm test` (1121 of 1121), eslint on the touched files, `node scripts/ci/design-lint.mjs` (none in the touched rules), `impeccable detect` (none).
3. Browser walks on `npx vite --port 5199`, phone and desktop: the persona screen, and the same answers (France, June, two people, beaches) with three personas.
4. `git -C continent-app checkout -b p15-persona`, commit bb07bd5, then `git branch -f master HEAD` and `git symbolic-ref HEAD refs/heads/master`.
5. `VITE_E2E_SEAMS= npm run build:pages`: first run ENOSPC (C: full, 808 KB free). The owner approved deleting the Visual Studio installer cache `%LOCALAPPDATA%\Temp\objaq3r4` (4.7 GB). Rerun: PASS, 280 files (19,720 under the ceiling), entry `index-TNJzLCFj.js`. `css-routes --check`: the 1 known problem (T833-a).
6. `node scripts/r2/push-data.mjs --rclone-dry-run`: 0 B, 251 of 251 checks, so no data push.
7. `npx wrangler pages deploy dist --project-name carta-app --branch preview` (e7b94cdd), then a smoke walk on preview.carta-app.pages.dev.
8. `npx wrangler pages deploy dist --project-name carta-app --branch main` (d831a0a4). The auto-mode check held it until the owner approved it in the moment. The first walk ran before the edge served the new index.html; a second walk 20 s later ran on the new entry and passed.
9. Root: this report, the register rows and the sync, then `git push origin main`.

## Config and secrets set

`config/recommend.json` gains the `persona` block (weights, distances, shapes, photos, reason facts). No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| "Near the hubs" trips for France in June (two people, beaches) | n/a (Nice, Biarritz, Nice and Cassis for every traveller) | Saint-Paul-de-Vence (8 km from Nice), Saint-Paul-de-Vence and Menton, Menton (26 km from Nice) | Nice gone from the top |
| Outside persona fit, Nice / Antibes / Saint-Paul-de-Vence | n/a | 0.08 / 0.75 / 0.81 | |
| Personas with a distinct top three in France (of 7) | n/a | at least 6 (test) | |
| Help-me-choose questions (nothing answered) | 9 | 10 | +1 |
| `npm test` | 1114 | 1121 | +7 |
| Search stand, production walk | 3,991 ms | 3,969 ms | |
| Live entry | `index-DNhyVmBx.js` (Pages db83239f) | `index-TNJzLCFj.js` (Pages d831a0a4) | |
| Free on C: | 808 KB | 2 GB after the build | owner cleared 4.7 GB |

## What broke and how it was fixed

- The first walk with France named returned Nice and Biarritz for every persona: the named-place path (T859) built its pool from the plain quality top 12 and never reached the persona. The named path now uses the same persona pool.
- Reasons were too generous ("Big cities: Biarritz", "Small towns close together: Bayonne"). Each reason now needs its own fact (config `persona.reasonFacts`).
- On desktop the kit button kept long persona names on one line, so they spilled out of their cells. The rows now wrap and the step uses the wide card.
- Rewriting `recommend.json` with JSON.stringify reformatted the whole file; it was restored, and the block was appended as text in the file's own compact style.
- The build ran out of disk; the owner cleared the VS installer cache.

## What is still open

- The Tell sentence does not set the persona ("stay outside the busy cities" is not read) (T877-a).
- The persona reorders places and trips but not which countries are considered (the country match's top 8) (T877-b).
- The persona weights are a first calibration on France, Italy and Portugal; the owner should try them on trips they know and say where they feel wrong (T877-c).
- Explore's For you and the taste profile do not use the persona; decide whether they should (T877-d).
- C: has about 2 GB free after a build; free space before the next build (T877-e).

## Rollback procedure

- **Production:** in the Pages dashboard, roll back to db83239f (T876).
- **Code:** `git -C continent-app revert bb07bd5` and revert the root sync. `guide.persona` is optional, so saved trips load either way.
- **The persona alone:** set every `persona.profiles` weight to 0 or `persona.weight` to 0 in config, which keeps the question but removes its effect.

## Notes on filling this template

One task. The calibration printouts informed the weights; the tests fix the behaviour that matters (Antibes over Nice, distinct personas).
