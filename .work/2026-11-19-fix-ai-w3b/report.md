# Run report · AI fix program wave 3b: covered regions answered, graceful answers per type finished (E7, E1)
Status: built on p15-fix-ai (0172b9d494, judge fixes 1643ffa448 and 375628e7a0, on top of wave 3: 7a6f98b7ba to af89b272ab), judged by the program session before merge. Item A2g. Redo of wave 3 (`.work/2026-11-19-fix-ai-w3/`), from its last judge's four fixes.

## Result
Ask's scope rule now asks the catalogue before it calls a name a place Carta lacks. On a fresh probe of 95 ordinary region questions in six languages, written and run before the change, false "lacking" fell from 18 of 95 (12.3 to 28.0%) to 2 of 95 on the first run of the design and 1 of 95 after two changes made after that run. The generalisation figure is the judge's own 54 fresh region questions (held-out block in `evals/any-question/regions.json`): 4 of 54 before the judge fixes, 1 of 54 after (0.3 to 9.8%; 2 of 54 on the git-only path, where the areas fixture lacks Trentino). False outside and false refusal stay 0 on every block. All 15 truly lacking places are still declined with nearest places, and 10 outside places with tiny European namesakes (Bali, Lima, Goa) stay outside Europe (in-sample: their names were added to the outside list). The any-question eval is unchanged from wave 3: 254 of 326 accurate, graceful 100% in every type, every type non-inferior to wave 2. Held-out file unchanged: harmful refused 0 of 16, off-topic declined 0 of 6, 0 of 47 ordinary questions refused or declined. Details: `results.md`, `errors.md`, `decision.md`.

## What changed
- `continent-app/src/lib/ask/scope.js`: a name is covered when at least 3 catalogue places mention it or it is a gazetteer region or country word in six languages; a gazetteer town of 10,000 or more under its own name beats that; `AREA_NAMES` cut to 18 names the catalogue cannot know; outside names win before the gazetteer; a lower-case word is a place only for a town of 20,000 or more.
- `continent-app/src/lib/ask/outside.js`: longer outside names first (Santiago de Chile).
- `continent-app/src/browse/ask/AskTurn.jsx`: loads the gazetteer regions with the towns.
- `continent-app/scripts/eval/adapters/any-question.mjs`, `continent-app/scripts/eval/regions-probe.mjs` (new), `evals/any-question/regions.json` (new probe), `evals/any-question/towns.json` (regions added for the git-only path).
- Tests: `continent-app/tests/askScope.test.mjs`, `continent-app/tests/regionsProbe.test.mjs` (new), `continent-app/tests/fixtures/libNumberAllowlist.json` (the three new constants, RC16).
- Judge 1 fixes: a catalogue place's own name counts as covered (Lofoten), hyphenated admin names match as a word run (Alto Adige), the head noun of a two-word name uses the same bar (Hoge Tatra).
- Docs: `docs/logic/ask.md`, `docs/HANDBOOK.md` (Ask Carta), `ROADMAP.md` E7, `docs/reference/evals.md`.

## Checks
- Tests askScope, regionsProbe, anyQuestion, askEval, askChat: 53 of 53. Lint 0 errors. Docs checks pass.
- `run.mjs any-question ask --check`: pass on the full catalogue and on the git-only path (253 of 326).
- `verify_ask_scope.mjs` on a fresh fast build: 246 of 246 at 390, 820, 1440, 360, 600, 768, 1024, 1180 and 1920 (program session rerun; `dom-check.txt`).

## Left for the backlog (A2h)
Regions known only by a foreign-language name neither the catalogue nor the gazetteer holds ("Sächsischen Schweiz"); unresolved regions answered by a generic search ("Ribera del Duero"); refusal and off-topic detection that generalises (0 of 16 held out); day counts as plans (19); follow-up binding (17).

## Undo
`git revert 375628e7a0 1643ffa448 0172b9d494 af89b272ab d139329afc 051cfc0d3c 7a6f98b7ba` (waves 3 and 3b). No data, schema or migration change.
