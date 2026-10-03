# T144 K2: Split generation into three passes with different jobs

## Task ID

T144 (mind-map number T146).

## Date

2026-10-03

## What changed

Carta now has a generator that builds a trip in three passes, each with its own prompt, its own slice of the v2.1 contract and its own check before the next pass may start. Before this task there was a contract and a gate (T143) but nothing that called a model; the one thing the gate could not stop was a single wide prompt producing a confident, uneven trip. The generator is `Trips/carta-unified/carta-unified/pipeline/generate_trip.py`, the prompts are `pipeline/prompts/k2-skeleton.md`, `k2-prose.md` and `k2-numbers.md` in the same dataset folder, and the tests are `tests/test_generate_trip.py` at the repo root plus the module's own `self-test`.

Pass one is the skeleton. It gets the brief (country, trip type, a one-line idea) and decides the route, the seven days, the two or three beds, the gateways, the profile, the season and, for each day, two to six real named places. It is the only pass that uses judgement, so it runs at the highest temperature of the three (0.5) and is told to write no figure at all. Its slice of the contract has 49 typed leaf fields plus two that are not in the record: `nameSlug`, from which the trip id is built as `{cc}-{type}-{nameSlug}`, and `itinerary[].places`, the lists pass two is confined to. Its `dayStats` object carries only `mode`; the other six keys are not in its schema, so a distance in the skeleton is rejected as an extra key before any rule runs.

Pass two is the prose. It gets the skeleton and nothing else and writes Morning, Afternoon and Evening for each day, the summary, the hook, the stay descriptions, the tips, the packing notes, the risks and the logistics text. Two rules are enforced after the answer, not asked politely: the word caps from spec D4 (summary 120, each day block 45, each tip 35, the constants `SUMMARY_WORDS`, `DAY_WORDS` and `TIP_WORDS`) and a ban on figures. A euro amount or a number followed by a unit (km, m, min, hours, percent) anywhere in the answer fails the pass, because a number in prose is a number nobody sourced. A tier mark or an ISO code is exempt. The pass must also answer about the skeleton's lists item for item: six days of prose for a seven-day skeleton is an alignment error.

Pass three is the numbers. It gets the merged trip so far and the JSON Schema of its slice, runs at temperature 0 with Google Search grounding, and fills the budget rows, the day distances, climbs, times and spends, the hotel prices, the airport transfer minutes, the surface split, the week totals, the exchange rate and the booking windows. It is the only grounded call. The rule that makes "forbidden from inventing a figure" mechanical rather than rhetorical is evidence. For every figure the pass must return an evidence row with the figure's dotted path, the page URL and one sentence of basis. `apply_evidence` then checks each row's URL against the pages the response's `groundingMetadata.groundingChunks` says were read. A figure with no row, or a row whose URL was not read, is withheld: the field becomes null and a `verifyFlags` line says which figure and why. The four budget breakdown rows may not be null, so an unsourced one fails the trip. A pass three that ran no search at all has read nothing, so everything is unsourced and the trip fails. `budget.totalEur` is not asked of the model; it is the sum of the sourced rows, arithmetic like `perDayEur`.

The three answers are merged by key, lists by position, and `derive()` from `generation_gate.py` fills the derived fields; `admit()` then decides. The generator never repairs. A pass that fails its checks is called once more with the errors appended to its prompt, and if it fails again the trip is rejected at that pass with the raw text and the errors kept in `rejected/`. An accepted answer is cached in `passes/<brief>/pass{n}.json` keyed on the SHA-1 of the exact prompt text, so a rerun with unchanged prompts makes no call, a changed skeleton invalidates the prose and the numbers, and a prompt edit to pass three alone re-runs only pass three. That cache is what makes iterating on the numbers prompt cheap: the two unpaid passes are never repeated to fix the paid one.

Every call writes a ledger line (`ledger.jsonl`): trip, pass, attempt, model version as the API reports it, prompt tokens, output and thinking tokens, tool tokens, the number of web search queries, and a USD price. The price comes from a table of Google's list prices read from ai.google.dev on 2026-10-03 (`PRICES`), matched on the longest prefix of the model version; a model not in the table prices as None and the `cost` subcommand names it rather than summing it as zero. The two billing units differ by family: Gemini 2.5 bills grounding per grounded prompt, Gemini 3.x per search request, and the ledger keeps both counts. The evidence sidecar `<id>.evidence.json` written beside each record lists every figure with its class (range, price, transport, or static for geography), source URL, basis, status and fetch date, in the shape the facts store T041 designed for T147 to load.

This task also settles T143-g, where admitted files live. They live in `Trips/carta-unified/carta-unified/data/generated/admitted/<id>.json`, one file per trip exactly as `data/trips/` holds the 253, with the evidence sidecar beside it, rejects in `data/generated/rejected/` and the pass cache and ledger alongside. That folder is tracked, like `data/trips`. Joining the master is a `build.py` step that reads the folder after the four batches (T144-b), and the SQL export stores the v2.1 objects as jsonb (T144-c); both files are outside this task's scope and are register rows.

## Files touched

Root repo, branch p9-k2-three-passes. The app repo was not touched.

Created:
- Trips/carta-unified/carta-unified/pipeline/generate_trip.py
- Trips/carta-unified/carta-unified/pipeline/prompts/k2-skeleton.md
- Trips/carta-unified/carta-unified/pipeline/prompts/k2-prose.md
- Trips/carta-unified/carta-unified/pipeline/prompts/k2-numbers.md
- tests/test_generate_trip.py
- Execution/P9/T144-three-pass-generation.md

Modified:
- Execution/_OPEN.md

## Commands run

From `Trips/carta-unified/carta-unified` in the root worktree:

```
python -X utf8 pipeline/generate_trip.py self-test
python -X utf8 pipeline/generate_trip.py pass-schema 1 --gemini
python -X utf8 pipeline/generation_gate.py self-test        (unchanged, still passes)
python -X utf8 pipeline/generate_trip.py run <scratch>\brief.json --stub <scratch> --out <scratch>\out
python -X utf8 pipeline/generate_trip.py cost --ledger <scratch>\out\ledger.jsonl
```

From the root worktree:

```
python -X utf8 -m pytest tests/test_generate_trip.py -q      (17 passed)
```

The stub folder held the three fixture bodies `fixture_bodies()` makes from the T143 example record and a brief; the run admitted the example id, reported 28 figures sourced and 0 withheld, and `cost` listed the fixture model as unpriced. No Gemini call was made in this task: stage 3 of `_OPEN-MASTER.md` is not complete and the session notes say the measured run waits for it. Nothing was written under `data/`, `cache/`, R2 or production; the generator's default output folder `data/generated/` does not exist yet.

## Config and secrets set

None. A live run reads `GEMINI_API_KEY` from the repo-root `.env` through `pipeline/env_local.py`, the same spot `rewrite_intros.py` uses. The module adds no dependency; it uses `urllib` and the `jsonschema` the gate already needs.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Prompts that produce a trip | 0 | 3 (`pipeline/prompts/k2-*.md`, 552, 412 and 501 words) | +3 |
| Typed leaf fields asked in one call | 115 (`generation_gate.py gemini-schema`) | 49, 26 and 45 per pass (`pass-schema`) | widest call 45 |
| Gemini responseSchema size per call | 22,882 characters | 9,801, 5,847 and 10,282 | widest call 10,282 |
| Calls per trip that use grounded search | not applicable | 1 of 3 (pass three only) | |
| Mechanical checks before the gate | 0 | word caps, figure ban, skeleton figure ban, alignment, evidence | new |
| Figures a model can state without a read page | all | 0 (optional ones withheld and flagged, budget rows fatal) | |
| Classes of bad answer the self-test rejects | 0 | 8 (unread source, missing budget source, no search, over-cap prose, euro in prose, distance in prose, figure in skeleton, six-day prose) | +8 |
| pytest cases | 0 | 17 | +17 |
| Measured cost per trip | not measured | not measured: no call made (T144-a) | |

The leaf counts come from walking `pass_schema(n)` and `model_schema()`; the three slices add to 120 because `day`, `rank` and `code` are asked in every pass to align the lists, and `nameSlug`, `places` and `evidence` are asked but not stored. The task's done condition includes a measured cost per trip; the price table and the ledger are in place and the number comes out of the first live run.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The fixture failed pass one on `bestPeriod.monthNames`, `raw` and `profile.fitnessLevel` | Projecting a whole object out of the example copies the derived keys too | `fixture_bodies` drops the two-level `DERIVED` paths |
| `budgetTier`, `budgetTierRaw` and `currency` were flagged as figures | The euro regex matched a tier mark and the ISO code | A value that is exactly a tier mark or a three-letter code is exempt (`CODE_RE`) |
| The self-test's "distance in prose" case passed silently | The test string was under the summary's 40-character minimum, so the schema error came first | A longer test string |
| Three dash characters in the source | The pattern in `PASS_EXTRAS` was written as literal characters, the T143 gotcha | The source holds `\u` escapes |

## What is still open

The measured run is the one thing the done condition asks for that this task could not do. When stage 3 is complete, run `generate_trip.py run` on three to five briefs with the existing key and read `cost`; the report of that task records USD per trip and per pass. The same run answers two things the code assumes: what `groundingChunks` look like in practice (the match in `url_was_read` accepts an exact URI, or the figure's host against the chunk title or the redirect URI, and if real chunks carry neither the evidence rule withholds everything), and whether pass three's JSON parses reliably without a `responseSchema`, which the client does not send alongside the search tool (T144-a, owner). No briefs exist yet; the first set should come from `reports/gap-matrix.md`, which says which country and type cells are empty (T144-e).

`build.py` does not read `data/generated/admitted/` (T144-b) and `export_sql.py` writes the v2.1 objects as text (T144-c); both were out of scope. The evidence sidecar uses a class `static` for distances, climbs and surface splits, which `fact_classes` in T041's design does not define; T147 decides whether geography rows enter the facts table at all (T144-d). Register row T143-g is closed by the decision above; T143-d (jsonschema in requirements.txt) and T143-f (self-tests in CI) still stand and now cover this module too.

## Rollback procedure

Revert the task commit on p9-k2-three-passes, or drop the branch before merge. That removes the module, the three prompts and the test file; nothing else was changed, no data was written, no dependency or migration was added, and the app repo has no commit for this task. Row T143-g goes back to open with the revert.
