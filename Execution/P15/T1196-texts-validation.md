# T1196: Texts and translations validation (ROADMAP D23, Texts row; I8)

Round 2 session S112, batch 12. Branch `p15-s112-texts-validation`. Builds on T1188 (the judge), T1144 (the D4 text sample), T1170 (the drafted strings) and T1179 (trail summaries).

## Date

2026-11-07

## What changed

The D23 texts layer has its first run, and every machine-drafted translation has been checked before the native review. Every number here is **provisional**: the judge counts only once it is calibrated on the owner's labels (T1144-a, T1144-b, T1188-a).

**Shipped texts.** `scripts/validation/texts_sample.py` draws a seeded sample of 120 shipped texts with their cited sources, stratified by kind and then by country. Blind session judges, using prompt `judge-text`, judged every one claim by claim.
- Overall, 41 of 120 are supported (34%, 95% 26% to 43%), 73 are unsupported and 6 are contradicted. Weighted by population over the strata that ship today, the supported share is 19%.
- Place blurbs: 2 of 40 are backed by the Wikivoyage text they cite. They may be true, but the source does not carry them. One cites an unrelated page: High Fens cites a "High Desert" disambiguation line.
- Wire trail summaries: 8 of 20 are supported and 1 is contradicted (215.6 km against 216.3 km).
- The T1179 trail summaries, which do not ship yet: 20 of 20 are supported.
- Journey summaries: 11 of 40 are supported against their verified note and their own itinerary, and 5 contradict their own itinerary. In the full set, 53 of the 258 journey summaries ship cut off mid-sentence with an ellipsis.

**Translations.** `scripts/validation/texts_backtranslation.py` checked all 3,187 strings T1170 drafted:
- Hard checks: 0 failures.
- A blind back-translation by a different model tier, scored with chrF++. Median per language: nl 93, de 85, fr 83, es 84, it 82.
- The judge on the 2,056 flagged strings plus a 5% control. The flagged strings are mostly short ones and ones with a placeholder.

3,176 strings hold and 11 fail. The worst cases are listed for the native reviewer in `docs/i18n/review.md`. Treat the 99.7% as an upper bound, because the batch judges are lenient: 6 of the 11 failures were found only by the lead session's own reading of the lowest-scoring strings.

## Research

A research subagent compared the method options (2026-11-07):

| Question | Options | Choice and why |
|---|---|---|
| Round-trip check | Back-translation alone; blind back-translation plus a metric; a direct source-and-target judge | Blind back-translation is used to rank strings, never to approve them, because round trip hides errors and a model "repairs" meaning on the way back (Zhuo et al. 2022, https://ar5iv.labs.arxiv.org/html/2209.07351; Aiken and Park 2010, https://aclanthology.org/www.mt-archive.info/TranslationJ-2010-Aiken.pdf). The pass saw opaque ids only: no English and no key. A Sonnet-tier pass back-translated, a different tier from the drafting session. |
| Metric | BLEU, token F1, chrF and chrF++ (https://aclanthology.org/W15-3049, https://aclanthology.org/W17-4770), COMET-22 (Apache-2.0, needs torch), CometKiwi and xCOMET (CC BY-NC-SA, https://huggingface.co/Unbabel/wmt22-cometkiwi-da) | chrF++ in stdlib (char 6, word 2, beta 2, the sacrebleu definition, https://github.com/mjpost/sacrebleu). It matched sacrebleu 2.x on 6 test pairs to two decimals. Sentence BLEU collapses on short strings (Kocmi et al. 2021, https://aclanthology.org/2021.wmt-1.57). The neural metrics need torch, and the reference-free ones are non-commercial. |
| Flag rule | A fixed cut-off; a rank within each language | Both. A string is flagged when chrF++ is under 45 or in the bottom 15% of its language, when it is 3 words or shorter, or when it holds a placeholder (chrF is noise there). |
| Judge on flagged strings | GEMBA-MQM (https://arxiv.org/abs/2310.13988), GEMBA-DA (https://arxiv.org/abs/2302.14520); the registry prompt | The registry prompt `judge-text` (kind translation, the T1188 rubric), batched 100 items per prompt with the rubric once. Its claim shape plays the role of MQM's error spans. A seeded 5% control of unflagged strings measures what the flags miss. |
| Sample size | 40 per stratum, 150 overall | Wilson half-width is about 15 points at n = 40 and 8 at n = 150. I chose 120 (40, 20, 20, 40): enough to find a bad stratum, not to rank strata finely. |

## Files touched

Created:
- `scripts/validation/texts_sample.py`: build the stratified items, and the provisional report.
- `scripts/validation/texts_backtranslation.py`: keys, blind prompts, chrF++, checks, flags, batched judge prompts, merge and score.
- `tests/test_texts_validation.py`: 11 tests.
- `prompts/backtranslate/v1.md` and its entry in `prompts/registry.json`: the blind back-translation prompt and the batch-judge header. This is outside the brief's file list, but the registry rule (T1140, `promptRegistry.test.mjs`) forbids prompt text in code. Running `build` left the generated prompt modules unchanged, because the runtime is Python.
- `data/reports/validation/texts/`:
  - `items.json` (120 texts with sources), `verdicts-session-2026-11-07.json`, `provisional-2026-11-07.json` and `.md`
  - `drafted_keys.json` (the 3,187 keys T1170 added)
  - `verdicts-backtranslation-session-2026-11-07.json`, `backtranslation-2026-11-07.json` and `.md`, `backtranslation-rows-2026-11-07.json`
- This report.

Modified:
- `docs/i18n/review.md`: the back-translation section, fix-first list and borderline list.
- `docs/HANDBOOK.md`: External validation runner, item 9.
- `ROADMAP.md`: D23 status.
- `Execution/_OPEN.md`: rows T1196-a to T1196-h appended.

## Commands run

```
python -I scripts/validation/texts_sample.py build
python -I scripts/validation/judge.py prompts --items data/reports/validation/texts/items.json --out <scratch>/tp
(3 blind subagents judged x001 to x120 from the prompt files only; merged into verdicts-session-2026-11-07.json)
python -I scripts/validation/judge.py check-session data/reports/validation/texts/verdicts-session-2026-11-07.json --manifest <scratch>/tp/manifest.json
python -I scripts/validation/texts_sample.py report --verdicts data/reports/validation/texts/verdicts-session-2026-11-07.json --date 2026-11-07
python -I scripts/validation/texts_backtranslation.py keys
python -I scripts/validation/texts_backtranslation.py prompts --out <scratch>/bt     (manifest moved out of the folder)
(5 blind Sonnet subagents, one per language, back-translated from the prompt files only)
python -I scripts/validation/texts_backtranslation.py judge-items --back <scratch>/ans/bt-*.json --manifest <scratch>/bt-manifest.json --out <scratch>/bt-items.json
python -I scripts/validation/texts_backtranslation.py judge-prompts --items <scratch>/bt-items.json --out <scratch>/jt
(5 judge subagents on 21 batches; jt-017 to jt-021 rerun by 2 subagents with 50 planted swaps; a lead review file for 6 strings)
python -I scripts/validation/texts_backtranslation.py merge-verdicts --answers <scratch>/ans/jt-0*.json <scratch>/ans/zz-lead-review.json --manifest <scratch>/jt-manifest.json --out data/reports/validation/texts/verdicts-backtranslation-session-2026-11-07.json
python -I scripts/validation/texts_backtranslation.py score --back <scratch>/ans/bt-*.json --manifest <scratch>/bt-manifest.json --verdicts data/reports/validation/texts/verdicts-backtranslation-session-2026-11-07.json --date 2026-11-07
node scripts/prompts/registry.mjs record backtranslate && node scripts/prompts/registry.mjs build
ruff check scripts/validation/texts_sample.py scripts/validation/texts_backtranslation.py tests/test_texts_validation.py
python -m pytest -q tests (quarantine deselected)
cd continent-app && npm test
```

No Claude API, no Anthropic SDK. The judges and translators were Claude Code subagents of this session (the session backend).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Shipped texts judged against their cited source (outside the D4 calibration set) | 0 | 120 (place blurbs 40, wire trail summaries 20, T1179 summaries 20, journey summaries 40) | +120 |
| Supported share, all 120 (raw, provisional) | not measured | 41 of 120, 34.2% (95% 26.3% to 43.0%) | new |
| Supported per stratum | not measured | place blurb 2 of 40 (5%); wire summary 8 of 20 (40%); T1179 summary 20 of 20 (100%); journey summary 11 of 40 (28%) | new |
| Contradicted texts | not measured | 6 (1 wire trail summary, 5 journey summaries) | new |
| Supported, weighted by population | not measured | 66.7% all strata; 19.3% shipped strata only | new |
| Place blurbs with a cited source text to judge against | not measured | 796 of 3,608 (the rest cite nothing judgeable) | new |
| Journey summaries cut off with an ellipsis | not measured | 53 of 258 | new |
| Drafted strings with a back-translation check | 0 of 3,187 | 3,187 of 3,187 | +3,187 |
| Drafted strings failing a hard check | not checked | 0 (the 1 digits hit was "2,500" against "2500": the thousands separator is now ignored) | 0 |
| Drafted strings flagged for the judge | n/a | 2,056 (64.5%) | new |
| Drafted strings that hold (provisional) | not measured | 3,176 of 3,187, 99.65% (95% 99.38% to 99.81%) | new |
| Holds per language | not measured | nl 578 of 583, de 650 of 651, fr 650 of 651, es 649 of 651, it 649 of 651 | new |
| Control strings (unflagged, judged) supported | n/a | 61 of 61 | new |
| Planted wrong translations caught (whole-string swaps) | n/a | 50 of 50 | new |
| Python tests for the texts run | 0 | 11 | +11 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| One judge pass marked 456 of 456 strings supported in 36 seconds, wrote the file from a script and passed a reversed direction | A rubber stamp | The files were discarded. jt-017 to jt-021 were rerun by two passes with 10 planted wrong translations per file. They caught 50 of 50, and the real strings were judged on their own. |
| The batch judges were lenient on subtle errors (word sense, direction) | Judging many short strings at once | The lead read the 45 lowest chrF++ traveller-facing strings and recorded 6 more failures in a separate, labelled review file (`lead review, T1196` in each reason). Row T1196-g measures subtle-fault recall next time. |
| `digits_changed` on "2,500 m" against "2500 m" | Thousands separators | Separators between digit groups are ignored before comparing. |
| `length_ratio` and `left_in_english` failed good strings ("Cómo es"; the cut-off English `day.place`) | Soft signals treated as failures | Split into hard checks (fail) and soft checks (send to the judge). |
| `npm test`: 1 failure, "no eight-word run of any registry prompt is left in a code file" | The blind prompt was written in `texts_backtranslation.py` and shared a phrase with the `judge-text` rubric | Both prompt texts moved to the registry prompt `backtranslate` v1 (sha d8e908068bab). The regenerated prompt files carry the same strings and items as the run's. |
| Regex parsing of the catalogues missed about 2,200 keys | Values in single quotes, backticks and over several lines | The catalogues are read by node (`import()` of each ES module). |
| Full pytest: 2 failures (`test_rating_inputs.py::test_beauty_v2_reads_no_register`, `test_rating_stability.py::test_adding_places_moves_nobody_else`) | Not this task: the same as T1188 and T1179 (a cache input that is not in this container) | None here. 946 passed, 11 skipped. |

## Screens checked

None. Nothing a traveller sees changed. The catalogues and the shipped data were read, not edited.

## What is still open

- T1196-a (user): start the native review from the fix-first and borderline lists in `docs/i18n/review.md`. This sharpens T1170-a.
- T1196-b: fix the 11 failing strings in the catalogues once a native reader confirms them.
- T1196-c: place blurbs are almost never backed by their cited text, and the guide match is wrong for at least one place (High Fens). Fix the match at the cause, with the T1144-e decision.
- T1196-d: correct the 5 contradicting journey summaries and the 53 cut-off ones at their source files.
- T1196-e: the wire trail summaries are weak and the T1179 summaries are clean. This backs T1179-a and T1179-f; T1179-d (sight kinds) was not hit in this sample.
- T1196-f (user): cross-check with Gemini. The session translators and judges are one model family.
- T1196-g: measure the judge's recall on subtle planted faults.
- T1196-h: the texts baseline waits for a judge that counts (T1188-a). T1188-e's items half is done by `texts_sample.py build`; its baseline half stays open.
- Not a new row: the human labels (T1188-a, T1144-b) are what turn every number above from provisional to counted.

## Owner steps (for the checklist)

- [T1196-a] Native review starting from the back-translation worst list | 11 drafted strings say something other than the English (one reverses a direction, two read "card" or "target" as map or destination) and the judge that passed the rest is lenient and uncalibrated | open docs/i18n/review.md, section Back-translation check; have a native reader confirm or correct the "Fix these first" list, then the borderline list, then the traveller-facing groups; send the corrections for a next task (T1196-b) | docs/i18n/review.md
- [T1196-f] Cross-check the texts run and the translations with Gemini | the session translators and judges are one model family, so a second family shows how much of the verdict is the model's own taste | on the box with GEMINI_API_KEY set run python -I scripts/validation/judge.py gemini --items data/reports/validation/texts/items.json --out data/reports/validation/texts/verdicts-gemini-YYYY-MM-DD.json; then python -I scripts/validation/texts_sample.py report --verdicts that file; commit both and compare the per-stratum table with provisional-2026-11-07.md | Execution/P15/T1196-texts-validation.md

## Rollback procedure

`git revert` the T1196 commits on this branch. Everything is additive: two scripts, a test file, files under `data/reports/validation/texts/` (which the D2 gate does not read, because none is a dated runner result), doc sections and register rows. No data, catalogue, migration or deploy changed.
