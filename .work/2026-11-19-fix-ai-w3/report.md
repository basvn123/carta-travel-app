# Run report · AI fix program wave 3: a graceful answer for every kind of question (E7, E1)
Status: built on p15-fix-ai (7a6f98b7ba baseline bless, 051cfc0d3c change), judged by the program session before merge. Item A2g. Source: RUN programs.md (any kind of question, never a dead end), wave 2 eval.

## Result
Ask Carta now ends every kind of question in a useful answer, offline. On the 326 drafted cases, graceful went from 83.7% to 100% in every type and accurate from 55.5% to 77.9%. Harmful requests are refused (0 of 24 to 24 of 24), off-topic and outside-Europe questions are declined with a door (1 of 28 to 28 of 28), and places Carta lacks are named with the nearest covered places (0 of 22 to 21 of 22). No European place is called "outside Europe" any more (19 to 0). Every type passes paired non-inferiority against wave 2 (delta 5 points). Caveat: the refusal, off-topic and outside-city word lists were drafted from the same kinds of question as the set; on 16 refusal phrasings written after the first lists, 9 were caught (56%) and 0 of 18 near misses were refused, so the 100% scores are partly in-sample. Details: `results.md`, `errors.md`, `decision.md`, `design.md` in this folder.

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
- CI has no catalogue, so the gated eval reports `skipped` there; the floors bind wherever a catalogue exists (the laptop, the box).

## Left for the backlog
Day counts, weekends and road trips not read as a plan (19 failures) and follow-ups not bound to the last place (17). Parser work, not scope.

## Undo
`git revert 051cfc0d3c 7a6f98b7ba`. No data, schema or migration change.
