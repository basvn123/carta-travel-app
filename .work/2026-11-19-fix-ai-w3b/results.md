# Results, wave 3b (E7, E1)

Probe `evals/any-question/regions.json` was written and run before `scope.js` changed (`probe-before.json`); after: `probe-after.json` (full catalogue and gazetteer) and `probe-after-gitonly.json` (only git-tracked files, the committed fixture `evals/any-question/towns.json` stands in for the gazetteer). Intervals are 95% Wilson.

## Region probe

| what | before (af89b272ab) | after |
| --- | --- | --- |
| ordinary region questions called lacking (false lacking) | 18 of 95 (12.3 to 28.0%) | 1 of 95 (0.2 to 5.7%); the first run of the design was 2 of 95 |
| called outside Europe (false outside) | 0 of 95 (0.0 to 3.9%) | 0 of 95 (0.0 to 3.9%) |
| refused or off-topic (false refusal) | 0 of 95 (0.0 to 3.9%) | 0 of 95 (0.0 to 3.9%) |
| the judge's ten named cases lacking | 10 of 10 | 0 of 10 (upper bound 27.8%) |
| 15 truly lacking places still lacking | 15 of 15 (79.6 to 100%) | 15 of 15 (79.6 to 100%) |
| 10 outside places still outside | 0 of 10 | 10 of 10 (72.2 to 100%) |

The git-only path gives the same figures. In-sample warnings: the judge's ten are in-sample by design; the outside names (Bali, Lima, Goa, Cusco, Zanzibar, Patagonia, Victoria Falls, Santiago de Chile, Queenstown) were added to the outside list in this wave, so 10 of 10 is in-sample; the "after" of 1 of 95 follows two small changes made after seeing the first run (a connector phrase such as "Ribera del Duero" no longer borrows the town Ribera; a town alias such as Tenerife for Santa Cruz de Tenerife no longer blocks the region test). The honest generalisation figure is the before rate on fresh questions (18.9%) and the first-run after (2.1%).

Changes after the first probe run, recorded: (1) phrase lookup with connectors, (2) longer outside name before first word (Santiago de Chile), (3) the big-town veto uses the town's own name not an alias (found by the held-out near miss "Zwarte zandstranden op Tenerife", which the first design declined).

## Any-question eval (326 cases)

Full catalogue: pass, 254 of 326 (77.9%, 73.1 to 82.1), graceful 100% in every type, `ask` pass at 60.3%. Git-only path (`ci-path.txt`): pass, 253 of 326, graceful 100%. No type moved from wave 3 (`measure-full.txt`):

| type | wave 2 | wave 3 | wave 3b | NI lower vs wave 2 |
| --- | --- | --- | --- | --- |
| harmful | 0/24 | 24/24 | 24/24 | +100.0 pass |
| out-of-scope | 1/28 | 28/28 | 28/28 | +89.3 pass |
| places-lacking | 0/22 | 21/22 | 21/22 (78.2 to 99.2) | +86.4 pass |
| every other type | unchanged | unchanged | unchanged | 0.0 pass |

Non-inferior to wave 3 (254 of 326): equal, per type equal. Places-lacking misses: Gimmelwald only, as in wave 3 (no called-outside). The K = 3 rule did not need a second signal for the set; the second signal (a gazetteer town of 10000 or more beats the text) is for towns the text names.

## Held-out file (not tuned on)

Harmful refused 0 of 16 (0.0 to 19.4%), off-topic declined 0 of 6 (0.0 to 39.0%), near misses refused 0 of 47 (0.0 to 7.6%), declined another way 0 of 47 (0.0 to 7.6%). The 20 area near misses of wave 3 are in-sample.

## Checks

Tests askScope, regionsProbe, anyQuestion, askEval, askChat: 53 of 53 pass (before the last test file edit, rerun below). Lint 0 errors. Docs checks pass. `verify_ask_scope.mjs` at 390 and 1440: 57 of 57 (AskTurn now loads the gazetteer areas); the other seven widths were not rerun.

## Judge fixes (round 2 of wave 3b)

The judge's own 54 region questions (written 2026-11-23, in `regions.json` block `heldout`, copied before the fixes; `probe2-before.json`, `probe2-after.json`, `probe2-after-gitonly.json`):

| | before | after (full) | after (git-only) |
| --- | --- | --- | --- |
| false lacking | 4 of 54 (7.4%, 2.9 to 17.6%) | 1 of 54 (0.3 to 9.8%) | 2 of 54 (1.0 to 12.5%) |
| false outside | 0 of 54 (0 to 6.6%) | 0 of 54 | 0 of 54 |
| false refusal | 0 of 54 (0 to 6.6%) | 0 of 54 | 0 of 54 |

The three classes the judge named were fixed and nothing else was tuned on it: catalogue own place names (Lofoten), hyphenated multi-word admin names as a word run (Alto Adige), the head noun of a two-word name with the 3-mention bar and the town veto (Hoge Tatra). Left: "Fränkischen Schweiz" (inflected German adjective; "Schweiz" is not named 3 times; git-only also "Alto Adige", because the committed areas fixture holds no Trentino row). The 95-question probe is unchanged (1 of 95, false outside 0, false refusal 0). Eval unchanged: 254 of 326 full, 253 of 326 git-only, graceful 100%, gate pass. RC16: `ask/scope.js` constants listed in `tests/fixtures/libNumberAllowlist.json`.

The one generalisation figure for regions is the judge set (4 of 54 before, 1 of 54 after). The "1 of 95" follows two changes after the first run (first run 2 of 95) and is not held out.

## Full `npm test` (local, Windows, under load)

Started in the background and not finished within the turn budget (the round 2 baseline notes a 32 minute run with many process-start failures). The failures seen before it was stopped, none in the ask scope code: `cspHashes` (a `C:\C:\` path bug on Windows, ENOENT), `askDocs` "the eval passes its gate" (fails identically with the docs of cc6ee79567, so not from this wave), `aiGateway` "scans the attack set" (needs Python), design and snapshot tests that drive a browser and timed out under load, `budgetSearch` worked example (passes alone). The RC16 test (`priceConfig.test.mjs`) passes: 12 of 12. The CI run on the pushed branch is the comparison with the round 2 baseline; this local run is not a clean baseline comparison.
