# T1150: Travel taxonomy, part 2: the tagger (ROADMAP F1, round 2 session S66)

## Date

2026-11-06

## What changed

Carta now has a batch tagger that tags every place, trail, beach, lake and mountain on taxonomy v1, with evidence per tag. `pipeline/taxonomy/tagger.py` reads each item's English passages from the shipped wires. It builds up to 25 candidate nodes per item, fused by reciprocal rank from four lists: phrase hits of node labels and synonyms, today's tags mapped through `mapping.yaml`, BM25 against each node's label, synonyms and definition, and optionally a bi-encoder. It scores each candidate with a noisy-OR over its evidence and keeps the quoted sentence that supports it. Data-rule nodes come from data fields at score 1. A Gemini verifier, called through `pipeline/ai_gateway.py` feature `tagging`, can confirm uncertain tags; it must quote a passage, and a quote that is not in the passages is ignored. Three thresholds, one per use, select tags: filter 0.75, profile 0.6, search 0.45. The batch task `taxonomy_tags` in `run_pipeline.py` writes `cache/taxonomy/tags.json`, not the wire. Without the verifier and the bi-encoder, the full corpus (26,588 items, 210,353 passages) runs in 30 s on the cloud container. Every tag at or over the search threshold carries evidence. On the taxonomy eval's 15-item seed set, the tagger beats today's tags on R-precision at 5 (0.433 to 0.477), P@5 (0.413 to 0.453), recall at 10 (0.444 to 0.516), micro F1 (0.431 to 0.438), macro F1 (0.339 to 0.397) and calibration error (0.271 to 0.218). It is slightly lower on MRR (0.810 to 0.794) and lenient F1 (0.544 to 0.524). The seed set was labelled by a session, so these numbers show the tagger runs and beats the bar; they do not measure quality. The verifier run, the bi-encoder run and the owner's 400 labels are owner steps. Nothing in the wire or the app changed.

## Research

A research subagent compared candidate methods for this exact task (short English passages, 268 labels, CPU, no torch, permissive licence). huggingface.co, hf-mirror.com, modelscope and the fastembed GCS bucket return 403 from the container (proxy policy), and arxiv.org was unreachable, so the paper figures come from search extracts. PyPI and raw.githubusercontent.com were reachable.

| Option | Licence | Size | CPU speed | Torch | Fit |
|---|---|---|---|---|---|
| BM25 over label, synonyms, definition (standard library) | n/a | 0 | instant | no | exact and synonym hits; misses paraphrase. On ESCO linking (LELA) BM25 reached about 81 percent recall against about 96 percent for dense |
| Synonym phrase matcher | n/a | 0 | instant | no | high precision, gives the evidence sentence |
| all-MiniLM-L6-v2 ONNX (Chroma's S3 mirror, the one model downloadable here) | Apache-2.0 | 90 MB | about 400 passages/s measured here | no (onnxruntime plus tokenizers) | older (MTEB about 56) |
| bge-small-en-v1.5 (fastembed) | MIT | 67 MB quantised | about 150 to 250/s estimated | no | best small English model (MTEB about 62); needs Hugging Face |
| gte-small, snowflake-arctic-embed-xs/s | MIT, Apache-2.0 | 67 to 130 MB | similar | no | close alternatives |
| multilingual-e5-small | MIT | about 470 MB | similar | no | only if non-English passages are read |
| fastembed 0.9.1 (library) | Apache-2.0 | n/a | n/a | no | pulls from Hugging Face: fine on the box, not here |

The papers: Decorte et al. 2023 (https://arxiv.org/abs/2307.10778) use one contrastive bi-encoder over ESCO labels. Clavie and Soulie 2023 (https://arxiv.org/abs/2307.03539) retrieve candidates by similarity and then rerank them with an LLM, which adds more than 22 RP@10 points. TalentCLEF 2025 entries (https://ceur-ws.org/Vol-4283/paper482.pdf) fuse E5 with BM25, and the sparse and dense lists complement each other (https://arxiv.org/pdf/2605.05726). For the verifier, the subagent found three things: send one call per item with the shortlist, make every yes carry a verbatim quote that code checks, and send only the uncertain band to the verifier (https://aclanthology.org/2026.emnlp-main.1049.pdf). Thresholds per label or per use are swept on a held-out slice (https://arxiv.org/pdf/2608.14649; conformal option https://proceedings.mlr.press/v266/ornbratt25a.html). Other sources: https://raw.githubusercontent.com/qdrant/fastembed/main/pyproject.toml, https://deepinfra.com/BAAI/bge-base-en-v1.5.

Chosen: the lexical half now. The phrase matcher (it supplies the evidence) and a standard-library BM25 are fused by reciprocal rank (k 60) with today's tags mapped, so the batch job runs in the container and on the box with no model download and no new dependency. The bi-encoder is a hook (`--dense`) for bge-small-en-v1.5 through fastembed, for the box, where Hugging Face is reachable (owner step T1150-b). MiniLM from the S3 mirror was not shipped, for two reasons: it would add a 90 MB artefact and a tokenizer dependency to the repo, and it is the weakest of the listed models. The verifier follows the routing evidence: one call per item, only for the 0.3 to 0.75 band, and a yes needs a quote found in the passages. It runs through the gateway's `tagging` feature (Gemini by default, the box CPU by config under E7), never the Claude API.

## Files touched

- Created: `pipeline/taxonomy/tagger.py` (the tagger and its CLI), `tests/test_taxonomy_tagger.py` (11 tests), `cache/taxonomy/tags-sample.json` (the sample run, 40 items per layer), `cache/taxonomy/seed-predictions.json` (the eval's predictions file), this report.
- Modified: `pipeline/taxonomy/taxonomy.py` (one line: `_country_rows` is cached; without it the full run re-read a country's trail file for every trail), `run_pipeline.py` (task `taxonomy_tags`), `docs/HANDBOOK.md` (new section "Travel taxonomy and tagging" and its contents line), `ROADMAP.md` (F1 status), `Execution/_OPEN.md` (rows T1150-a to T1150-h appended).
- Not touched: the eval adapter (its `--predictions` interface already fits), the wire, the app, `continent-app/config/ai_models.json` (T1150-f), MAP.md (T1150-h).

## Commands run

```
git fetch origin && git checkout -b p15-s66-taxonomy-2 origin/p15-round2
python -I pipeline/taxonomy/tagger.py --items seed --out <scratch>/seed-tags.json --eval-out cache/taxonomy/seed-predictions.json
cd continent-app && node scripts/eval/run.mjs taxonomy --json                       # baseline: today's tags
node scripts/eval/run.mjs taxonomy --predictions ../cache/taxonomy/seed-predictions.json --json
node scripts/eval/run.mjs taxonomy --check
cd .. && python -I pipeline/taxonomy/tagger.py --sample 40                        # cache/taxonomy/tags-sample.json
python -I pipeline/taxonomy/tagger.py --all --out <scratch>/tags-full.json         # the full corpus, 30 s
pip install pytest ruff                                                            # not in the container
python -m pytest tests/test_taxonomy_tagger.py tests/test_taxonomy.py tests/test_box_schedule.py tests/test_provenance.py -q
ruff check pipeline/taxonomy tests/test_taxonomy_tagger.py tests/test_taxonomy.py
python -I scripts/docs/check_entry_points.py && python -I scripts/docs/drift.py
```

## Config and secrets set

None. The verifier uses the existing gateway feature `tagging` (`AI_TAGGING_PROVIDER`, `AI_TAGGING_MODELS`, `GEMINI_API_KEY`); none was set here.

## Before/after measurements

Taxonomy eval, 15-item seed set (89 scored labels), set metrics at the profile threshold 0.6.

| Metric | Before (today's tags mapped) | After (tagger: phrase + mapped + BM25) | Delta |
|---|---|---|---|
| R-precision at 5 (headline) | 0.433 | 0.477 | +0.044 |
| P@5 | 0.413 | 0.453 | +0.040 |
| Recall at 10 | 0.444 | 0.516 | +0.072 |
| MRR | 0.810 | 0.794 | -0.016 |
| Micro F1 | 0.431 | 0.438 | +0.007 |
| Macro F1 | 0.339 | 0.397 | +0.058 |
| Lenient (tree) micro F1 | 0.544 | 0.524 | -0.020 |
| Calibration error (ECE) | 0.271 | 0.218 | -0.053 (better) |
| F1 setting / activity / vibe / traveller | 0.474 / 0.412 / 0.296 / 0.333 | 0.455 / 0.424 / 0.400 / 0.333 | |
| Cost per 1,000 items | 0 | 0 (no model call) | |

Other measurements:

| Metric | Before | After | Delta |
|---|---|---|---|
| Items with taxonomy tags | 0 | 26,588 (3,868 places, 17,619 trails, 2,745 beaches, 1,628 lakes, 728 mountains) | +26,588 |
| Full run time, cloud container, no verifier | n/a | 30 s wall (23.5 s tagging), 62.6 MB tag file | |
| Passages read | n/a | 210,353; 0 items without a passage | |
| Tags per item at the profile threshold (implied ancestors not counted) | n/a | places 5.9, trails 6.1, beaches 3.1, lakes 5.2, mountains 5.9 | |
| Selected tags with evidence | n/a | 100 percent | |
| Items with at least one tag in the verifier band | n/a | 25,761 of 26,588 (98,847 candidates would be asked, at most 12 per item) | |
| First tagger run on the seed set (list weight 0.4) | n/a | R-precision at 5 0.460, micro F1 0.381 (micro precision 0.325) | |
| Ablation, text only (no mapped tags) | n/a | R-precision at 5 0.297, recall at 10 0.455, micro F1 0.331, ECE 0.129 | |
| Python tests | 11 taxonomy tests | 22 (11 new) | +11 |

The 15 seed items were labelled by the T1149 session and the list weight was lowered after reading them, so these numbers are optimistic. They show that the tagger runs end to end and beats the bar. P@5 and F1 on the owner's 400 labels is T1149-b, and then T1150-c fits the weights on a held-out half. The ablation shows that most of the signal still comes from today's tags; text alone has better calibration but worse ranking.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first run fell to micro precision 0.325 | every church, square or monastery in a city's sight list became a tag at 0.78 (three list hits) | list field weight 0.4 to 0.22: three list hits now make 0.53, under the profile threshold; a test pins it |
| A full run would re-read each country's trail file per trail | `taxonomy.old_tags` loads the country file on every call | `@lru_cache` on `_country_rows` (read-only rows) |
| English words named the wrong node | the synonyms "see" (German lake), "bad" (German spa), "top", "lac" and others are English words with another sense | `NOT_EVIDENCE` drops them as single-word phrases; `WEAK` common words such as "city" and "town" count half |
| `parse_json` import error in the verifier | the gateway's helper is `parse_model_json` | renamed in the call |
| `tests/test_pipeline_code_fixes.py` does not import in the container | `psycopg` is not installed here (unrelated to this task, CI installs it) | not touched |

Gotcha: the eval drops nodes with `source: data` on both sides, so the tagger's rule tags (trail grade, loop) neither help nor hurt the score; they are in the tag file for the later wiring.

## Screens checked

None. No traveller screen changed; the end check of the batch needs no screen for this task.

## What is still open

- T1150-a (user): run the verifier on the 400 gold items, then on the full corpus.
- T1150-b (user): the bi-encoder on the box (fastembed, bge-small-en-v1.5); keep it only if it lifts the eval.
- T1150-c (next task): fit the weights and the three thresholds on a held-out half of the owner's labels.
- T1150-d (next task): wire the tags into the wire and the app (schema change).
- T1150-e (next task): the verifier band holds almost every item; a full verify run at Gemini's rate floor is about 46 hours, so narrow the band or use a batch API.
- T1150-f (next task): update the tagging entry in `continent-app/config/ai_models.json` with the tagger's score and real tokens per call.
- T1150-g (next task): read non-English text and the trail detail files.
- T1150-h (next task): MAP.md and `docs/ai/taxonomy.md` do not name the tagger yet.
- T1149-d: the score gate. It stays open until the owner's gold exists. The tagger's seed score is the first bar.
- T1149-e: journeys. They stay open because taxonomy v1 has no journey layer in `applies_to`.

The Claude API was not used and is not needed: the verifier is Gemini or the box through the gateway.

## Rollback procedure

`git revert` of the T1150 commit. Nothing is one-way: no wire, app, migration or deploy changed. Removing the `taxonomy_tags` entry from `run_pipeline.py` stops the batch job. `cache/taxonomy/` can be deleted.

## Owner steps (for the checklist)

- [T1150-a] Run the tagger's verifier | the lexical tagger only beats today's tags by a little, and the verifier is the step meant to raise precision on uncertain tags | with GEMINI_API_KEY set, run `python -I pipeline/taxonomy/tagger.py --items gold --verify --eval-out gold-verify.json` and `python -I pipeline/taxonomy/tagger.py --items gold --eval-out gold-lexical.json` (once T1149-b has filled gold.csv; before that use `--items seed`); score both with `cd continent-app && node scripts/eval/run.mjs taxonomy --predictions ../gold-verify.json` and the same for gold-lexical.json; only if the verifier lifts R-precision at 5 or micro F1, run `python -I pipeline/taxonomy/tagger.py --all --verify` on the box (about 26,000 calls, see T1150-e) | Execution/P15/T1150-taxonomy-2.md
- [T1150-b] Try the bi-encoder on the box | a dense list catches paraphrases the phrase and BM25 lists miss | on the box `pip install fastembed`; run `python -I pipeline/taxonomy/tagger.py --items gold --dense --eval-out gold-dense.json` and compare with gold-lexical.json through `node continent-app/scripts/eval/run.mjs taxonomy --predictions`; keep `--dense` in the `taxonomy_tags` task in run_pipeline.py only if R-precision at 5 or recall at 10 rises | pipeline/taxonomy/tagger.py
