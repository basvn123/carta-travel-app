# T1188: The LLM judge for text and facts (ROADMAP D23, D4)

Round 2 session S104, batch 9. Branch `p15-s104-llm-judge`.

## Date

2026-11-07

## What changed

Carta now has one LLM judge for every text it shows that cites a source: place intros and blurbs, trail summaries, trip text, Ask answers and translations. `pipeline/judge/` splits a text into claims, marks each one supported, unsupported or contradicted against the cited source, and rolls them up into one verdict per text. The prompt is `judge-text` v1 in the prompt registry: a rubric, a source rule per kind and the item as data. It has two backends and never uses the Claude API. In the offline `session` backend, a Claude Code session judges from prompt files and writes a verdicts file. The `gemini` backend runs through the pipeline gateway, with a Pro tier judging text that Flash wrote. The judge is calibrated against the D4 text sample with Cohen's kappa, a seeded bootstrap lower bound, Gwet's AC1 and the recall on the planted faults. A threshold rule in `pipeline/judge/config.json` decides whether its verdicts count. The validation runner has a fourth layer, `texts`, that uses the judge as its text check: an uncalibrated judge's share is reported but kept out of the gate. The owner has filled none of the 50 labels (T1144-b), so the calibration runs on seeded labels, marked as seeded. Those labels are T1144's blind session verdicts, corrected by the planted key. On them the new session judge scores kappa 0.94 (bootstrap low 0.78) and catches 20 of 20 planted faults. By rule, the seeded calibration does not count until the owner labels the texts.

## Research

A research subagent compared the options (2026-11-07):

| Question | Options | Choice and why |
|---|---|---|
| Judging method | FActScore and SAFE (atomic facts, https://arxiv.org/abs/2305.14251, https://arxiv.org/abs/2403.18802); RAGAS faithfulness (claims then NLI, https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/); FACTS Grounding judge (binary, calibrated on 402 human labels, https://arxiv.org/html/2501.03200v1); MiniCheck small checkers (https://llm-aggrefact.github.io/; Bespoke weights CC BY-NC); G-Eval 1 to 5 scores (https://arxiv.org/abs/2303.16634) | The judge splits the text into claims and labels each one in three classes with quoted evidence, then a rule gives the text verdict (a contradicted claim wins). This is the RAGAS and FActScore shape, written as prompt text and not taken as a library. Kappa is taken on the binary fold (supported or not). G-Eval scores calibrate poorly on facts. The Bespoke MiniCheck weights may not be used commercially. |
| Gemini judge model | The same Flash chain as the generator; a Pro tier; a cross-family panel | A Pro tier first (`gemini-pro-latest`, then `gemini-flash-latest`). Self-preference is real when the judge is the generator's own model (https://arxiv.org/abs/2604.06996), and a stronger judge reduces it (https://arxiv.org/pdf/2502.01534). The Claude API is banned, so the offline session backend is the cross-family judge. Temperature stays 1.0, per Google's Gemini 3 guidance (https://ai.google.dev/gemini-api/docs/gemini-3). Output is held to a JSON response schema (https://ai.google.dev/gemini-api/docs/structured-output), and `votes` gives a majority when wanted. |
| Calibration rule | Landis and Koch bands (0.61); point kappa >= 0.7; the lower 95% bound; Gwet's AC1 (https://pmc.ncbi.nlm.nih.gov/articles/PMC5712640/) | Point kappa >= 0.7 AND seeded bootstrap 2.5th percentile >= 0.5 (to be raised to 0.6 at 100 or more labels), AND planted fault recall >= 0.9, AND at least 40 labels with 15 or more not supported. At n = 50 the interval is about plus or minus 0.2, so the bound is what keeps the rule honest. The recall floor catches a judge that misses rare faults, which kappa alone can pass. AC1 and the confusion table are reported, not gated. |
| Library | RAGAS 0.4.3 and DeepEval 4.3.3 (Apache-2.0, both pull the OpenAI SDK); promptfoo (MIT, Node, being acquired by OpenAI); Inspect AI 0.3.287 (MIT, about 40 dependencies); MiniCheck 0.4.0 | A small in-repo stdlib module. The pipeline gate is stdlib only, and two of the libraries force a vendor SDK. |

## Files touched

Created:
- `prompts/judge-text/v1.md` (the prompt; registry entry in `prompts/registry.json`, runtime python, guard the calibration)
- `pipeline/judge/__init__.py`, `core.py` (items, prompt, verdicts), `backends.py` (session, gemini), `calibrate.py` (kappa, bootstrap, AC1, threshold rule), `__main__.py` (CLI), `config.json` (threshold and backends)
- `pipeline/judge/fixtures/fixture-items.json`, `fixture-answers.json` (one made-up text per kind)
- `pipeline/judge/calibration/seeded-labels.json` (marked SEEDED), `calibration/judgments/session-2026-11-07.json` (blind session judge, 50 verdicts), `calibration/calibration-session.json`
- `scripts/validation/judge.py` (CLI entry), `scripts/validation/layer_texts.py` (the runner's text layer)
- `tests/test_judge.py` (17 tests)
- `Execution/P15/T1188-llm-judge.md`

Modified:
- `scripts/validation/runner.py` (one line: `texts` in `LAYERS`)
- `docs/HANDBOOK.md` (External validation runner: item 8 and the Limits line), `ROADMAP.md` (D4 and D23 status), `Execution/_OPEN.md` (rows T1188-a to T1188-e appended)

## Commands run

```
node scripts/prompts/registry.mjs record judge-text
node scripts/prompts/registry.mjs build
node scripts/prompts/registry.mjs check --no-eval
python -I scripts/validation/judge.py fixtures
python -I scripts/validation/judge.py seed-labels
python -I scripts/validation/judge.py prompts --items evals/truth/judge/text-sample.json --out <scratch>/judge-prompts
(a blind subagent read only those 50 prompt files and wrote calibration/judgments/session-2026-11-07.json)
python -I scripts/validation/judge.py check-session pipeline/judge/calibration/judgments/session-2026-11-07.json --manifest <scratch>/judge-prompts/manifest.json
python -I scripts/validation/judge.py calibrate --write
python -I scripts/validation/runner.py texts --out <scratch>/val
ruff check pipeline/judge scripts/validation/judge.py scripts/validation/layer_texts.py scripts/validation/runner.py tests/test_judge.py
python -m pytest -q
cd continent-app && npm test
```

## Config and secrets set

None set. New config file `pipeline/judge/config.json` (threshold, bootstrap seed, Gemini chain, temperature, votes, label paths). New optional environment variables `CARTA_JUDGE_ITEMS` and `CARTA_JUDGE_VERDICTS` (the texts layer's inputs). The Gemini backend reads `GEMINI_API_KEY` and honours `AI_JUDGE_MODELS` and `AI_JUDGE_PROVIDER` through the gateway.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| LLM judges for text against a cited source | 1, T1144's truth judge (2 kinds, rubric outside the registry) | 1, `pipeline/judge` (5 kinds, prompt in the registry); T1144's still beside it (T1188-d) | +3 kinds |
| Validation runner layers | 3 (trails, beaches, beaches_blueflag) | 4 (+ texts) | +1 |
| Judge kappa against labels (binary) | none (no labels, T1144-b) | 0.9398 on seeded labels, 95% 0.82 to 1, bootstrap low 0.7788, AC1 0.9701, n 50 | does not count (seeded) |
| Planted faults caught by the session judge | 20 of 20 (T1144, rubric 1) | 20 of 20 (judge-text v1) | 0 |
| Session judge verdicts on the 50 texts | 10 supported (T1144, rubric 1) | 11 supported, 25 unsupported, 14 contradicted | +1 supported |
| Disagreements with the seeded labels | not measured | 1 of 50 (a shipped trail summary the new judge calls supported) | new |
| Python tests for the judge | 0 | 17 | +17 |

The seeded kappa is optimistic: both raters are Claude session judges with nearly the same rubric, so it shows the path works, not that the judge agrees with a person.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `python -I -m pipeline.judge` not found | `-I` ignores PYTHONPATH and the current folder | A thin entry `scripts/validation/judge.py` puts the root on the path (the repo's `python -I scripts/...` convention) |
| The gateway has no `judge` feature | `pipeline/ai_gateway.py` was outside the brief | `backends.ensure_feature` adds it at run time; register row T1188-c to add it in the gateway and `ai_models.json` |
| The gateway would scan the rubric for injection | `screen` defaults to the whole user turn, and the rubric names instructions | The judge screens only the text and its source |
| Full pytest: 2 failures (`test_rating_inputs.py::test_beauty_v2_reads_no_register`, `test_rating_stability.py::test_adding_places_moves_nobody_else`) | Not this task: both fail the same way on `origin/p15-round2` in this container (a JSON input under `cache/` that is not here) | None here; 840 passed, 10 skipped. `npm test`: 1,823 pass, 0 fail, 12 skipped |
| ruff put `import ai_gateway` before the import that puts `pipeline/` on the path | import sorting | The test loads it with `importlib.import_module` after the judge imports |

## Screens checked

None: nothing a traveller sees changed. The admin validation view reads the scorecard, and no texts result was written to `data/reports/validation/`: an uncalibrated judge with no baseline would fail the D2 hook.

## What is still open

- T1188-a (owner): label the 50 texts (the T1144-b step), then run `calibrate --write`. Only a human's labels can make the judge count.
- T1188-b (owner): run the Gemini judge on the D4 sample and calibrate it; check that `gemini-pro-latest` resolves.
- T1188-c: add the `judge` feature to `pipeline/ai_gateway.py` and `continent-app/config/ai_models.json`.
- T1188-d: point `evals/truth/judge` at the registry prompt or retire it (closes T1144-d).
- T1188-e: collect each release's shipped texts and sources into an items file, then write the first texts baseline once the judge counts (S112, T1196).
- Not a new row: the plan-day judge (`eval-judge`, T1148) stays a separate judge, because it scores plans against a rubric, not text against a source.

## Owner steps (for the checklist)

- [T1188-a] Label the 50 judge calibration texts | the text judge's verdicts count only after a human's labels pass kappa 0.7 (bootstrap low 0.5) and 90% planted recall; today they rest on seeded labels | open evals/truth/judge/labels.json and, for each of the 50 texts in text-sample.json, write supported, unsupported or contradicted per rubric (do not open text-sample-key.json), fill by and at; run python -I scripts/validation/judge.py calibrate --write; commit pipeline/judge/calibration/calibration-session.json | evals/truth/judge/labels.json, Execution/P15/T1188-llm-judge.md
- [T1188-b] Run and calibrate the Gemini judge | the session judge needs a person at the keyboard; the Gemini judge can run every release, but only once it is calibrated on its own verdicts | on the box with GEMINI_API_KEY set run python -I scripts/validation/judge.py gemini --items evals/truth/judge/text-sample.json --out pipeline/judge/calibration/judgments/gemini-YYYY-MM-DD.json (if gemini-pro-latest is refused, set AI_JUDGE_MODELS to a current Pro model id); run python -I scripts/validation/judge.py calibrate --verdicts that file --write; commit both files | pipeline/judge/config.json, Execution/P15/T1188-llm-judge.md

## Rollback procedure

`git revert` the T1188 commits on this branch. Everything is additive: the registry entry and prompt file, `pipeline/judge/`, the texts layer, a single `LAYERS` line in `runner.py`, the tests and the docs lines. No data, migration or deploy is involved.
