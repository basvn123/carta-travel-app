# Run report · AI fix program wave 4: figures and places must sit in a cited note (E1, E7)
Status: built on p15-fix-ai (4adc04c87d characterisation, 0ffd7089e4 change), judged by the program session before merge. Item A3. Spec: north-star decision 2.1, 2.2, 7.3 (E-plant, E-verify).

## Result
The verifier now checks each sentence against the notes it cites, not the whole pack. On 6,138 planted errors over 420 packs it drops 99.8% (was 71.0%); the 11 survivors hold their value in a cited note under the verifier's reading, so 0 misses are unexplained (at most 0.05% by the rule of three). Hand plants 100 of 100. The cost is open: no recorded live answers exist, and on a deliberately hard stand-in (a sentence naming a place while citing a row that never names it) answers kept fell from 100% to 26.9%. The live non-inferiority run (n about 470) is owner step AI-12; it decides whether the prompt must change so the model cites the note it quotes. The rule is never loosened (decision 2.1). Details: `results.md`, `s5.md`, `errors.md`.

## What changed
- `continent-app/src/lib/ask/verify.js`: figures and places per cited note (`figure-uncited`, `place-uncited`), the question's own figures and places allowed, `noFigures` option (`figure-free`, not switched on yet).
- `continent-app/scripts/eval/planted/plant.mjs` (value cut fixed), `golden.mjs`, `score.mjs`, `errors.mjs` (new), `keep.mjs`; `continent-app/scripts/eval/adapters/plant.mjs` (new gated E-plant eval); `run.mjs`; `ask-eval.mjs` (S5 diagnostics).
- Tests: `continent-app/tests/askVerify.test.mjs` (new), `evalPlantGate.test.mjs` (new), `evalPlatform.test.mjs`; fixtures `plantedGolden.json`, `verifyBefore.mjs` (frozen old verifier).
- Docs: HANDBOOK Ask Carta, `docs/logic/ask.md`, ROADMAP E1 and E7, `docs/reference/evals.md`, `docs/owner/ai.md` AI-12.

## S5 (the measurement that picks A16)
Of 500 missed places: filter 44%, rank 26%, parse 18%, pool 12%. Dense, hybrid and sparse end within 1 point of the rules path. Dutch is worst (56% of its misses at the filter). The one fix it points at: parser tables, Dutch then German (A16).

## Checks
187 tests pass on the touched areas; lint clean; `run.mjs ask any-question plant --check` pass with `CARTA_PUBLIC`, `plant --seed-drop` fails as it must; docs checks pass. CI: see the judgement.

## Notes
`functions/api/ask/answer.js` runs the output guard on cache hits, not verify.js; the browser runs verify.js on every stored answer it shows, so cached text is still verified before it shows.

## Undo
`git revert 0ffd7089e4 4adc04c87d`. No data, schema or migration change.
