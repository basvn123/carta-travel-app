# Run report · AI fix program wave 3: a graceful answer for every kind of question (E7, E1)
Status: paused. Built on p15-fix-ai (7a6f98b7ba baseline bless, 051cfc0d3c change, d139329afc and af89b272ab judge fixes). NOT merged: re-judge 3 FAILED at crew's three-loop limit (lines 3, 4, 8; `judgement.md`). The next round applies its four fixes, then runs a fresh judge. Item A2g. Source: RUN programs.md (any kind of question, never a dead end), wave 2 eval.

## Result
On the 326 drafted cases of the offline eval, Ask Carta now ends every kind of question in a useful answer: graceful went from 83.7% to 100% in every type and accurate from 55.5% to 77.9%. Harmful requests are refused (0 of 24 to 24 of 24), off-topic and outside-Europe questions are declined with a door (1 of 28 to 28 of 28), and places Carta lacks are named with the nearest covered places (0 of 22 to 21 of 22). No European place is called "outside Europe" any more (19 to 0). Every type passes paired non-inferiority against wave 2 (delta 5 points). Caveat: the refusal, off-topic and outside-city word lists were drafted from the same kinds of question as the set, so the 100% scores are in-sample. The one held-out figure is `evals/any-question/heldout.json`, never tuned on: harmful refused 0 of 16, off-topic declined 0 of 6, and 0 false refusals. Region questions are NOT solved: re-judge 3's fresh probe found 10 of 64 ordinary region questions wrongly declined as a lacking place (Burgundy, Loire, Galicia, Eifel and others), and the 20 region near misses in the held-out file were written after the bug class was known, so their 0 of 47 is in-sample. The word lists are precise but do not generalise; a measured design comes before any widening (ROADMAP E7, backlog A2h). Details: `results.md`, `errors.md`, `decision.md`, `design.md` in this folder.

## What changed
- `continent-app/src/lib/ask/scope.js` (new): `askScope` returns refuse, offtopic, outside, lacking or answer; one rule for the screen and the eval.
- `continent-app/src/lib/ask/outside.js`, `compose.js`: European names never outside Europe; refusal and decline lines with nearest covered places from code.
- `continent-app/src/browse/ask/AskTurn.jsx`: calls `askScope`; renders the refusal and declines with chips, the flights link and example questions.
- `continent-app/src/i18n/{en,nl,de,fr,es,it}.js`: 7 new keys each.
- `continent-app/scripts/eval/any-question-baseline.json` (new, per-case wave 2 baseline), `adapters/any-question.mjs` (gated: floors plus paired non-inferiority; `--seed-drop` fails it), `any-question-lib.mjs`, `any-question-report.mjs`, `ask-eval.mjs`.
- `continent-app/scripts/verify_ask_scope.mjs` (new DOM check), `continent-app/tests/askScope.test.mjs` (new), `continent-app/tests/anyQuestion.test.mjs`.
- Docs: `docs/HANDBOOK.md` (Ask Carta), `docs/logic/ask.md`, `docs/reference/evals.md`, `ROADMAP.md` E1 and E7.

## Checks
- DOM check 246 of 246 at 360, 390, 600, 768, 820, 1024, 1180, 1440, 1920; touch targets 44 px at 390 and 820; axe on the decline turns 0 serious or critical.
- impeccable detect on `AskTurn.jsx`: clean. design-lint: one violation in `72-atlas.css`, not touched by this wave.
- 104 tests pass on the touched areas; lint 0 errors; Ask eval output identical to wave 2; docs checks pass.
- CI: see the judge fixes section below.

## Judge 1 fixes (d139329afc)
- CI: the catalogue is in git; only the gazetteer is not. The eval now reads `evals/any-question/towns.json` (16 GeoNames rows, CC BY 4.0) when `public/search/places/` is absent, so the gate runs in CI. Proven locally on a copy of `public/` with only git-tracked files: 77.6% (253 of 326), graceful 100%, gate pass; `--seed-drop` fails (`ci-path.txt`).
- "smugglers museum", "Smugglers trail hike" and "Smuggler's cove" are answered; only verb forms refuse. "into Japanese" and "to take home" are no longer lacking places.
- Held-out set `evals/any-question/heldout.json`, written before looking at the lists and never tuned on: harmful refused 0 of 16 (0 to 19.4%), off-topic declined 0 of 6. (The near-miss figure of this step is superseded below.) The refusal and off-topic lists do not generalise; they are precise but narrow. Not gated.
- New files: `evals/any-question/towns.json`, `evals/any-question/heldout.json`.
- Re-judge 2 (af89b272ab): covered country aliases and travel areas (UK, VK, Schengen, Riviera, Benelux and others) are never a lacking place; before the fix 3 of 47 held-out ordinary questions were wrongly declined, after it 0 of 47.

## Why not merged (re-judge 3, 2026-11-23)
1. Regions the catalogue covers are declined as "lacking" (10 of 64 fresh probes); `AREA_NAMES` is a hand list where the decision asks for the catalogue. Loire was answered in wave 2 and is a new false decline.
2. "Two weeks in Bali" went from outside Europe to lacking (a tiny European namesake).
3. The held-out region figure is in-sample; one honest figure is needed.
4. `docs/logic/ask.md:57-58` and the HANDBOOK Ask section do not yet state the area rule.
Exact fixes: `judgement.md`, "Re-judge 3 (af89b272ab)".

## Left for the backlog
Day counts, weekends and road trips not read as a plan (19 failures) and follow-ups not bound to the last place (17). Parser work, not scope. Refusal and off-topic detection that generalises (0 of 16 held out): a measured design is needed before widening any list (ROADMAP E7, backlog A2h).

## Undo
`git revert af89b272ab d139329afc 051cfc0d3c 7a6f98b7ba`. No data, schema or migration change.
