# T145 K4: Run a separate adversarial critic with no memory of the writing

## Task ID

T145 (mind-map number T147).

## Date

2026-10-03

## What changed

Every trip the generator would admit now goes through a fourth call before it is written: a critic whose only job is to find what is wrong. Before this task the only flags a generated record could carry came from the evidence rule in pass three ("Withheld ...: no source given"), and nothing looked at the finished record as a whole. The writer passes cannot do that job. Pass three is told to source its figures, and asked whether it did, it will say yes.

The critic lives in `Trips/carta-unified/carta-unified/pipeline/generate_trip.py` as pass 4, with its own prompt in `pipeline/prompts/k4-critic.md`. Three things keep it independent of the writing. It is a fresh call with no conversation history. Its prompt shares no run of eight words with the three k2 prompts, which a test checks, so it is not the writer's rules read back to it. And it is shown the finished record without the keys that carry the writer's memory, listed in `CRITIC_HIDDEN`: `provenance` (which model and prompt wrote it), `sources` (the writer's own account of what it verified), `verifyFlags` with the two keys derived from it, and the empty `snapshot`. It never sees the evidence rows or the k2 prompts. On the fixture record that hides 402 of 18,186 characters, which is small because the fixture's sources paragraph is short; on a real trip the sources paragraph is the part most likely to talk the critic into agreeing.

The prompt names six kinds of fault, the ones the spec lists: contradiction (two fields that cannot both be true), arithmetic (a total that is not the sum of its parts), terrain (a climb or distance that does not fit the ground or the route between the day's places), existence (a hotel, trail, ferry or museum that does not exist or is not where the trip puts it), stale (a price or rule that matches an old page and not the current one) and access (a road said to be open to bikes, a ferry said to carry them, a permit said not to be needed). The critic runs with Google Search grounding at temperature 0, because three of the six kinds cannot be judged from memory: whether a hotel exists today, whether a fee has moved and whether a road admits bikes are questions about the current web. The prompt tells it that a missed error costs a traveller and a wrong dispute costs a reviewer a minute, so when unsure it should dispute.

Its answer is checked as mechanically as the writer passes are. It must return one row in `checks` for each of the six kinds saying what it examined, also when it found nothing. That is there so an empty `disputes` list is a statement and not a shrug: a critic that skipped a kind is rejected. Each dispute carries the dotted path of the field, the kind, a severity, a quote, a reason of at most 180 characters and an optional URL. The path must name a field the critic was actually shown (`resolve_path`), that field must hold a value, and the quote must be what the field says. For text the quote must be a phrase of the field, ignoring case and spacing. For a number or an object every number in the quote must be one of the field's numbers (`quote_matches`). These checks stop a critic arguing with a field it imagined, which is the one way a critic makes review more expensive instead of cheaper. A failing answer is sent back once with its errors, the same retry the writer passes get. A critic that fails twice rejects the trip at stage `critic`: the record, the errors and the critic's raw text go to `rejected/`, and nothing is admitted unchecked. Because the three writing passes are cached, a rerun after a critic prompt fix makes only the critic call.

Each accepted dispute becomes one `verifyFlags` line, for example "Disputed accommodationStrategy[1].priceEur, medium stale: ...", cut to the contract's 200 characters. The evidence rule's flags come first and the disputes follow, high severity first. The contract allows 40 flags, and anything over that is counted in `flagsDropped`. `derive()` then sets `verifyFlagCount` and `volatilePricing` from the flags as it already did, so the page's existing "n figures to verify" note (`JourneyPage.jsx` line 687 reads `verifyFlagCount`) counts the critic's disputes with no app change. A disputed figure stays in the record: the critic flags and the reviewer decides, while withholding stays the evidence rule's job, done on evidence and not on opinion. The full critique is written beside the record as `<id>.critique.json`. It holds the six checks, every dispute with its URL and whether that URL was among the pages the critic's grounding read, the critic's model, the writers' models and a `sameModelAsWriter` flag. Rows in the evidence sidecar that a dispute covers carry it under `disputes`, so the flag-only review in K7 (T154) can find a sourced figure the critic doubts.

Two ordering choices save money. The gate (`generation_gate.check`) runs before the critic, so a trip the gate would reject anyway does not pay for a grounded call; `admit()` runs it again on the flagged record. And the critic's answer is cached like the other passes, keyed on the SHA-1 of its exact prompt, which contains the record it was shown. An unchanged record replays the cached critique, and any change to the record asks again. The critic's prompt version is part of `provenance.promptVersion`, now `k2-1.1.1-k4-1`, because the record's flags depend on it.

By default the critic uses the writer's model chain, which still satisfies the spec. Its argument is about the instruction and the memory, not about the weights: a writer agrees with itself because it is asked to check what it was just told to produce, with that context in hand. `run --critic-model M` (repeatable) gives the critic its own chain, and `generate(..., critic_client=...)` does the same in code. Whether to spend that is an owner decision once the first measured run shows how often the same-model critic is right (T145-b).

## Files touched

Root repo, branch p9-k4-critic. The app repo was not touched.

Created:
- Trips/carta-unified/carta-unified/pipeline/prompts/k4-critic.md
- tests/test_trip_critic.py
- Execution/P9/T145-adversarial-critic.md

Modified:
- Trips/carta-unified/carta-unified/pipeline/generate_trip.py (pass 4, the critic, its checks, the flag merge, the critique file, `--critic-model`, the self-test)
- tests/test_generate_trip.py (four T144 tests pinned three calls per trip; they now expect the critic as the fourth)
- Execution/_OPEN.md

## Commands run

From `Trips/carta-unified/carta-unified` in the root worktree:

```
python -X utf8 pipeline/generate_trip.py self-test
python -X utf8 pipeline/generation_gate.py self-test        (unchanged, still passes)
python -X utf8 pipeline/generate_trip.py run <scratch>\brief.json --stub <scratch>\stub --out <scratch>\out
python -X utf8 pipeline/generate_trip.py cost --ledger <scratch>\out\ledger.jsonl
```

From the root worktree:

```
python -X utf8 -m pytest tests/test_generate_trip.py tests/test_trip_critic.py -q      (36 passed)
```

The stub folder held the four fixture bodies `fixture_bodies()` makes, with one stub dispute added to `critic.json`. The run admitted the example id with 28 figures sourced, 0 withheld and one flag from the critic ("Disputed accommodationStrategy[1].priceEur, medium stale: Stub dispute for the CLI check ..."), and wrote the record, `.evidence.json` and `.critique.json` side by side. No Gemini call was made: stage 3 of `_OPEN-MASTER.md` is not complete. Nothing was written under `data/`, `cache/`, R2 or production.

## Config and secrets set

None. A live critic reads the same `GEMINI_API_KEY` as the writer passes. No dependency was added. The Claude API is not used anywhere.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Calls per generated trip | 3 | 4 (critic is the fourth, `PASS_LABEL`) | +1 |
| Grounded calls per trip | 1 (pass three) | 2 (pass three and the critic) | +1 |
| Sources of verifyFlags on a generated record | 1 (evidence rule) | 2 (evidence rule, critic disputes) | +1 |
| Fault kinds a record is checked for after writing | 0 | 6 (`CRITIC_KINDS`) | +6 |
| Classes of bad critique rejected | not applicable | 6 (invented path, out-of-range index, null field, wrong quote, missing kind, duplicate dispute) plus the dash rule | new |
| Critic prompt | none | 665 words; 0 shared eight-word runs with k2 prompts | new |
| Prompt sent per call on the fixture (characters) | 3,303 / 6,425 / 34,300 | 3,303 / 6,425 / 34,300 / 20,940 | critic +20,940 |
| Writer memory hidden from the critic on the fixture | not applicable | 402 of 18,186 characters, 6 keys | |
| pytest cases | 17 | 36 (17 + 19 new) | +19 |
| Measured cost of the critic per trip | not measured | not measured: no call made (T145-a) | |

The call counts come from the stub client's call list in the run above, the prompt word counts from `load_prompt(n)` bodies, and the character counts from the same stubbed run and `critic_view()` of the example record. The critic's real cost and its hit rate (how many disputes a person agrees with) need a live run and are the first thing T145-a records.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The no-dash pattern landed in the source as literal characters | A bash heredoc ate the backslashes of the replacement script (the T143 gotcha) | Rewrote it from a script file; the source holds `\u` escapes |
| Four T144 tests failed | They pinned exactly three calls and six ledger lines per run | Updated to expect the critic as the fourth call |
| The independence test found shared text with the k2 prompts | The house dash rule and "Answer with one JSON object and nothing around it" were copied phrasing | Reworded both in the critic prompt |
| A cache test assumed a changed pass three answer would be used | Pass three is cached on its own prompt, which did not change | The test changes the record the critic sees (a new data vintage) instead |

## What is still open

The measured run is the one thing the critic cannot get without the owner. When stage 3 is complete and T144-a runs the first briefs, the same run measures the critic: USD per trip for the critic call (it is grounded, so it adds search units), the disputes per trip, and how many of them a person agrees with on review. That run also shows whether the critic's JSON parses reliably without a `responseSchema`, which the client does not send alongside the search tool (T145-a, owner). Whether the critic should run on a different model from the writer is the owner's call after that run; the switch exists as `--critic-model` (T145-b, owner).

When `build.py` learns to read `data/generated/admitted/` (T144-b), it must read only `<id>.json` and skip the `.evidence.json` and `.critique.json` sidecars beside it (T145-c). The flag-only review in K7 (T154) should read the critique file and the `disputes` marks on the evidence rows, not just the flag strings, and a reviewer's verdict on a dispute needs somewhere to live. That is T154's design (T145-d). The golden set in K8 (T153) should diff the critic's disputes as well as the numbers, since a critic prompt change moves `verifyFlags` the way a numbers prompt change moves the budget (T145-e). Existing rows T143-d (jsonschema in requirements.txt) and T143-f (generator self-tests in CI) now cover the critic too.

## Rollback procedure

Revert the task commit on p9-k4-critic, or drop the branch before merge. That removes the critic prompt and its test file and restores `generate_trip.py` and the T144 tests to three passes; `provenance.promptVersion` goes back to `k2-1.1.1`. No data was written, no dependency or migration was added, and the app repo has no commit for this task. Generated records do not exist yet, so no admitted record carries critic flags that would need removing.
