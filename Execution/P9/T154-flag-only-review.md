# T154 K7: Spend the human review budget on flags only

## Task ID

T154 (mind-map number T156).

## Date

2026-10-03

## What changed

A person reviewing generated trips now reads a queue of flagged fields instead of whole files, and `sources.confidenceNotes` can no longer be empty on a generated trip.

The queue is `Trips/carta-unified/carta-unified/pipeline/review_queue.py`. Pointed at the folder the generator writes admitted trips to (`data/generated/admitted`), it reads each record with its two sidecars and lists a trip only for four reasons. The critic disputed a field: these come from `<id>.critique.json`, which carries the kind, severity, quote, reason and URL, and whether the critic's grounding actually read that URL, so a dispute resting on a page nobody read is visible as such. A sourced figure is an estimate worth at least 150 euros: these come from the evidence sidecar, where a row qualifies when its basis says the page gives an estimate, an approximate or a typical value, and only money figures count, because a wrong price costs a traveller and a wrong distance costs a reviewer a minute. The trip is the first in the catalogue for its country or its trip type, in which case the whole record is read once, and the next trip in that country or style is not. Or `confidenceNotes` is missing or a placeholder, which can only happen to a record that bypassed the gate. Everything else ships on the automated checks. Figures the evidence rule withheld are not queued, since they are already absent.

"New" is judged against `data/trips.master.json` plus trips in the same folder whose review was closed, so a reviewed first trip in a country makes the second ordinary.

A reviewer's verdict needed a home (register row T145-d, now closed). It is `<id>.review.json` beside the record, holding for each item key (`path#kind`) a verdict of upheld, dismissed or accepted with a required one-sentence note. The file stores the SHA-1 of the record the verdicts were given against. If the trip is regenerated, the sha differs and every verdict is treated as stale: the items reopen, because a verdict on a field that was rewritten says nothing about the new text. `close` refuses while any item has no verdict and then writes `reviewedAt`. It deliberately does not edit the record. The gate never repairs a record, and stamping `provenance.reviewedAt` is left to whatever copies admitted records into the catalogue (T154-b).

`confidenceNotes` is required in `schema/trip.generated.schema.json`: it must be a string of 30 to 800 characters under the house no-dash rule, where before it was text or null. The gate and the model's response schema both derive from that file, so a generated record with a null, empty or short note is rejected, and the writer is told it is required. The example record, which the generator tests use as the source of every fixture, now carries a note. I did not change the k2 prompts: pass three already asks for a note saying what could not be confirmed, and editing a prompt would invalidate the golden set stamp from T153 and collide with the other sessions editing the generator this wave. A `notes` command reports coverage: 130 of the 253 curated trips have no usable note (northern-baltics 30 of 30, western-central 100 of 100), which is a backlog for a person, not something the schema can enforce on hand-written records.

## Files touched

**Created:**
- Trips/carta-unified/carta-unified/pipeline/review_queue.py
- tests/test_review_queue.py
- Execution/P9/T154-flag-only-review.md

**Modified:**
- Trips/carta-unified/carta-unified/schema/trip.generated.schema.json (one line: confidenceNotes required, 30 to 800 characters)
- Trips/carta-unified/carta-unified/schema/examples/generated-trip.example.json (the example now has a note)
- Execution/_OPEN.md (T145-d closed, rows T154-a to T154-e)

The app repo was not touched. `generate_trip.py` and the prompts were not touched.

## Commands run

From `Trips/carta-unified/carta-unified` in the root worktree, with `PYTHONUTF8=1`:

```
python pipeline/review_queue.py self-test
python pipeline/review_queue.py notes <empty folder>
python pipeline/generation_gate.py self-test
```

From the root worktree:

```
python -m pytest tests/test_review_queue.py tests/test_generate_trip.py tests/test_trip_critic.py tests/test_golden_set.py -q    (53 passed)
```

The measurement below came from a stub run of `generate_trip.generate` on the T143 example with one stub dispute, then `review_queue.build_queue` on its admitted folder. No Gemini call was made, since stage 3 of `_OPEN-MASTER.md` is not complete. Nothing was written under `data/`, `cache/`, R2 or production.

## Config and secrets set

None. No dependency was added. The Claude API is not used.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Fields a reviewer reads per trip | the whole file: 253 populated values in the example record | 1 (the one disputed field) in the stub run, 253 only for a first-of-its-kind trip |
| Share of the example record read | 1.0 | 0.004 |
| Generated records admitted with a null confidenceNotes | allowed | rejected by the schema (4 bad values tested: null, empty, "n/a", short) |
| Curated trips without a usable confidenceNotes | 130 of 253 | 130 of 253 (not changed, T154-c) |
| pytest cases in the generator suites | 46 | 53 (7 new) |

The 253 is `_leaves` of the example record (non-null scalars, counted by the queue). The 0.004 is one field over that. It is a fixture, with one dispute on a clean trip; it shows the mechanism and says nothing about the real rate of flags per trip, which needs a live run (T154-a). The 130 comes from `review_queue.py notes`, reading `data/trips.master.json`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first measuring run showed zero trips | My stub dispute reason was under the critic check's minimum length, so the generator correctly rejected the trip at the critic stage | Used a full-length reason; the check doing its job |
| One test could not see its own first-of-country item | `cmd_verdict` and `cmd_close` read the real catalogue, where Austria and cycling exist | Both take a `master` argument, as `build_queue` does |

## What is still open

The estimate threshold and the wording that marks an estimate are first guesses and need the first measured run to tune (T154-a, owner). Closing a review is recorded only in the sidecar; the catalogue importer that will read admitted records must stamp `provenance.reviewedAt` from it and refuse an open or stale review (T154-b). The 130 curated trips without notes need a person (T154-c, owner). `SCHEMA.md` and `types.ts` still describe the note as nullable, and were outside this task's files (T154-d). Nothing in CI runs the queue's tests or fails on an open review (T154-e).

## Rollback procedure

Revert the task commit on p9-k7-review-flags, or drop the branch before merge. That removes the queue, its tests and the report, restores the nullable confidenceNotes in the schema and example, and reopens T145-d. No data, migration or dependency was involved. Generated trips do not exist yet, so no record needs fixing, and a stray `.review.json` can simply be deleted.
