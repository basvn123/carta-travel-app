# T152 D4: Cap the prose and let the structure carry the load

## Task ID

T152 (mind-map number T154).

## Date

2026-10-03

## What changed

The caps are now enforced in three places that read one set of numbers, but the catalogue itself is not yet within them, and this task cannot make it so. Summary at most 120 words, each day's morning, afternoon and evening at most 45, each pro tip at most 35.

Before this task the generator already had the caps. T144 put them in the pass-two prompt (`{{summaryWords}}`, `{{dayWords}}`, `{{tipWords}}`) and in `generate_trip.py`, which rejects a pass-two answer over a cap and retries once. What was missing was the record-level gate and the catalogue validator, so a record that reached `generation_gate.check()` by any other road was never measured, and `validate.py` said nothing about prose length. Now `generation_gate.py` owns the three constants and one function, `word_cap_errors`, which counts whitespace-separated words (the same count `_words()` uses for `wordCount`). `generate_trip.py` imports the constants and its `_word_caps` calls that function, so the prompt, the pass check and the gate cannot drift apart. `check()` appends the cap errors, so `admit()` quarantines an over-cap record with the reason beside it.

`validate.py` reports a `word-cap` issue per trip with the counts (how many summaries, day blocks and tips are over, the longest, and the first offender). Severity follows provenance. A trip whose `provenance.sourceFormat` is `generated` gets an ERROR, because the prompt and gate already refuse it and one here means something bypassed them. A trip from the original source batches gets a WARNING. I chose a warning for those on purpose: 236 errors would turn every validator run red for a defect that only a model rewrite can fix, and that would hide real errors. The warnings still appear in the report and the count is the number to drive to zero.

The done condition is only half met. Rewriting 236 trips under the caps is a Gemini job, stage 3 is not complete, so no paid call was made and no catalogue prose was touched. I did not truncate: cutting a sentence in half to satisfy a counter is the opposite of what the spec asks. The rewrite is register rows T152-a (owner) and T152-b (next task).

One side effect. The v2.1 example record, `schema/examples/generated-trip.example.json`, had five day blocks over 45 words (49, 50, 48, 48 and 53), so the new gate rejected the project's own example and the self-test failed. I removed one middle sentence from each of those five blocks and kept the rest as written. The example's `wordCount` field is now a little high; nothing reads it for the example.

## Files touched

Root repo, branch p9-d4-cap-prose. App repo: nothing changed, so no app commit.

**Modified:**
- Trips/carta-unified/carta-unified/pipeline/generation_gate.py (the constants, `word_cap_errors`, `check()`, three new self-test mutations)
- Trips/carta-unified/carta-unified/pipeline/generate_trip.py (constants imported, `_word_caps` delegates)
- Trips/carta-unified/carta-unified/pipeline/validate.py (the `word-cap` check, its self-test)
- Trips/carta-unified/carta-unified/schema/SCHEMA.md (one paragraph)
- Trips/carta-unified/carta-unified/schema/examples/generated-trip.example.json (five blocks shortened)
- Execution/_OPEN.md

**Created:**
- tests/test_word_caps.py
- Execution/P9/T152-prose-caps.md

## Commands run

From `Trips/carta-unified/carta-unified` in the root worktree:

```
python -X utf8 pipeline/generation_gate.py self-test
python -X utf8 pipeline/generation_gate.py check schema/examples/generated-trip.example.json
python -X utf8 pipeline/generate_trip.py self-test
python -X utf8 pipeline/validate.py --self-test
python -X utf8 pipeline/validate.py --report <scratch>/v.md --json <scratch>/v.json
```

From the root worktree:

```
python -X utf8 -m pytest tests/test_word_caps.py tests/test_generate_trip.py tests/test_trip_confidence.py tests/test_fill_type_specific.py -q
```

The measurement is a short script over `data/trips.master.json` that counts words with `len(text.split())`, the same rule as the gate. No browser check, because nothing a traveller sees changed. No Gemini call, no network call, no data written.

## Config and secrets set

None.

## Before/after measurements

Counted on `data/trips.master.json` (253 trips, 5,313 day blocks, 1,771 pro tips). The catalogue is unchanged by this task, so before and after are the same; the change is that the validator now reports it.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips within all three caps | 17 of 253 | 17 of 253 | 0 |
| Trips over at least one cap | 236 | 236, all reported as WARNING word-cap | now visible |
| Summaries over 120 words | 41 (longest 219) | 41 | 0 |
| Day blocks over 45 words | 943 of 5,313 (longest 142) | 943 | 0 |
| Pro tips over 35 words | 334 of 1,771 (longest 93) | 334 | 0 |
| Validator word-cap rows | 0 | 236 warnings, 0 errors | new |
| Gate self-test malformed answers rejected | 30 | 33 | +3 |

The medians are already inside the caps (summary 30, day block 31, tip 29 words), so the problem is a long tail, not a general habit. That makes the rewrite smaller than the totals suggest: most of the 236 are over on a few blocks. A trip's `wordCount` runs from 1,344 to 4,900 with a median of 2,228 (the field in the master).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Gate self-test rejected the example record | Five example day blocks were over 45 words | Dropped one middle sentence from each |
| `validate.py` could not use `G` for the gate | `G` is `geocode` in that file | Imported the gate as `GG` |

## What is still open

The 236 over-cap catalogue trips need a model rewrite, which needs stage 3 (T152-a, owner) and then a task to run it (T152-b). The check covers summary, day blocks and tips only; hook, logistics and whatCouldGoWrong have no cap, and the page-side rule that nothing over 60 words shows unasked belongs to P10 (T152-c).

Rollback: `git revert` the task commit. The catalogue data was not changed, so nothing else needs undoing.
