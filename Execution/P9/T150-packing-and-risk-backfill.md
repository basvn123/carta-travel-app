# T150 K10 + D1: Start the backfill with packing and risk modules

## Task ID

T150 (mind-map number T152).

## Date

2026-10-03

## What changed

Carta now has the machinery to write the two modules that most trips lack, but it has not yet written them, and the done condition (packingNotes and whatCouldGoWrong populated on all 253 trips) is not met. Stage 3 of the rollout, the owner's Gemini setup, is not done, so no model was called. What exists is the tool, its prompt, its checks and its tests, all proven against stub answers. The measured run is an owner register row (T150-a).

The tool is `Trips/carta-unified/carta-unified/pipeline/backfill_modules.py`. It is a fill-mode pass, not another trip generator. The trip already exists, so the model is shown the finished record (title, country, type, months, difficulty, the seven days, the stays, the tips and the weather and rules text) and asked for exactly two fields, in one ungrounded call. The shape of the answer is not defined in this module. `module_schema()` reads the `packingNotes` and `whatCouldGoWrong` properties out of the T143 contract through `generation_gate.model_schema()`, so the item counts (4 to 24 and 2 to 8), the length limits and the 23 icon keys are the contract's own, and a change to the contract changes this module with no edit here. The prompt is `pipeline/prompts/k10-packing-risk.md`, version 1, temperature 0.3, and the version is recorded as `k10-1`.

The data today is two different problems. 153 trips have both arrays empty. The other 100 hold v2.0 prose: packing items as sentences, risks as markdown bold followed by "Fallback:" and often a euro amount. For those 100 the old text goes into the prompt as source material, with an instruction to keep what is specific and true, drop prices and distances and not copy the wording, so the typed result starts from what a person already wrote. All 253 get the typed shape.

The reason this needs checks and not just a schema is that a model can fill both shapes perfectly and still write the defect spec A4 and C6 describe: reasons that fit any trip. After the answer, `module_errors` checks four things and never repairs. Shape is the contract, including the ban on em dashes, en dashes and middots. Numbers are banned outright: no euro amount and no figure with a unit, because a number in these modules would be one nobody sourced, and prices belong to pass three. Specificity is a word test: at least 60 percent of the packing reasons, and of the risks (trigger, consequence and what to do together), must use a word from this trip's own record, after removing every word that more than a third of the 253 trips also use (`document_frequency`, computed from the data folder at run time, and ignored over fewer than 30 trips). I calibrated the 60 percent against the existing hand-written notes: the 100 v2.0 packing lists share a word with their trip's record on 86 percent of items on average. Variety is at least three different icon keys, "other" at most once, no item or trigger twice, at least two severities, and the icon keys a trip type cannot do without (`TYPE_NEEDS`: cycling needs bike or repair, hiking and trail running need footwear, winter sports need snow or warmth, water sports need swim or sun).

A failing answer is sent back once with its errors in the prompt. A second failure rejects the trip: the raw text and the errors go to `rejected/` and nothing is written for it. An accepted answer is cached on the SHA-1 of the exact prompt plus the schema, so a rerun makes no call, an edited record asks again, and a changed icon list or limit asks again too. A test pins that last point, because the first version keyed on the prompt alone and would have replayed answers written against an old icon list. Every call is appended to `ledger.jsonl` with its tokens and a USD price from `generate_trip.PRICES`, and `cost` reads it with the T144 reporter.

The output is one sidecar per trip, `<out>/<id>.json`, holding the two arrays and a provenance block (model, `k10-1`, generatedAt, `reviewedAt` null, whether older notes existed). The default folder is `data/generated/backfill/`, beside the T144 admitted folder, and it does not exist yet. Trip files are touched by one command only, `apply`. It needs an explicit `--dest`, does nothing without `--write`, re-checks every sidecar against the current contract and record and skips any that no longer pass, and replaces only the two keys, keeping each file's CRLF line endings, indent, key order and escaping. I checked that claim on the real data first: all 253 trip files re-serialise to identical bytes with `json.dumps(indent=2)` and CRLF, so an apply moves exactly two keys and the diff is those two keys. Running the K5 checks (`generation_gate.k5_errors`) on a real trip before and after swapping in typed modules gave 0 errors both times.

The schema paths this task changed: none. The contract file, `generation_gate.py`, `generate_trip.py` and `validate.py` are untouched, so this session cannot conflict with T146 or T151 on the schema or the generator. The module imports from `generate_trip` (`GeminiClient`, `StubClient`, `fill`, `parse_json`, `response_text`, `usage_of`, `price_usd`, `ledger_append`, `cost_report`, `print_cost`, `PROMPT_DIR`, `EURO_RE`, `UNIT_RE`) and from `generation_gate` (`model_schema`, `load_schema`, `_to_gemini`, `_write_atomic`, `EXAMPLE_PATH`). If T146 or T151 rename any of those, this module breaks, and the tests will say so at once. The page needed no change: T143 already added `packingText` and `riskText` to `src/lib/journeys.js`, which render the typed objects and pass v2.0 strings through, so a mixed catalogue renders. The app repo has no commit for this task, and Vite was not started.

## Files touched

Root repo, branch p9-k10-backfill-modules. The app repo was not touched.

Created:
- Trips/carta-unified/carta-unified/pipeline/backfill_modules.py
- Trips/carta-unified/carta-unified/pipeline/prompts/k10-packing-risk.md
- tests/test_backfill_modules.py
- Execution/P9/T150-packing-and-risk-backfill.md

Modified:
- Execution/_OPEN.md (rows T150-a to T150-e)

## Commands run

From `Trips/carta-unified/carta-unified` in the root worktree:

```
python -X utf8 pipeline/backfill_modules.py self-test
python -X utf8 pipeline/backfill_modules.py status
python -X utf8 pipeline/backfill_modules.py prompt at-cozy-towns-salzkammergut
python -X utf8 pipeline/generate_trip.py self-test            (unchanged, passes)
python -X utf8 pipeline/generation_gate.py self-test          (unchanged, passes)
```

From the root worktree:

```
python -X utf8 -m pytest tests/test_backfill_modules.py tests/test_generate_trip.py tests/test_trip_critic.py -q     (65 passed)
```

Throwaway Python one-liners measured the prompt sizes, the anchor-word counts and the byte round trip of the 253 files. No Gemini call was made, nothing was written under `data/`, `cache/`, R2 or production, no wire was built and no migration was added.

## Config and secrets set

None. A live run reads `GEMINI_API_KEY` from the repo-root `.env` through the same client as T144.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips with both modules empty | 153 | 153 | 0, no model call was made |
| Trips with v2.0 prose in the modules | 100 | 100 | 0 |
| Trips with the typed v2.1 modules | 0 | 0 | 0 |
| Tool that writes the typed modules | none | `backfill_modules.py status` reports the three counts and the sidecar count | new |
| Bad answers the checks reject (self-test) | 0 | 16 of 16, each for the stated reason | +16 |
| Pytest cases for this module | 0 | 29 (65 with T144 and T145 together) | +29 |
| Prompt size over all 253 records | not applicable | min 7,694, mean 11,545, max 15,981 characters | |
| Estimated cost for all 253 trips | not measured | about USD 1.5 to 3.4 before retries, an arithmetic estimate | |
| Measured cost per trip | not measured | not measured: no call made (T150-a) | |

The 153, 100 and 0 come from `backfill_modules.py status` over `data/trips`. The prompt sizes come from `build_prompt` over the same 253 files; 2,920,777 characters in total, about 730,000 input tokens at four characters a token. The cost estimate is that figure plus an assumed 1,000 output tokens per trip, priced at the `gemini-3.6-flash` rate (USD 0.75 and 3.75 per million, about 1.5 dollars) and the `gemini-3.5-flash` rate (1.50 and 9.00, about 3.4 dollars) in `generate_trip.PRICES`. It is a sizing figure, not a measurement. The done condition needs the populated count to reach 253, and it will only after T150-a and T150-c.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first self-test run crashed writing the cache | `G._write_atomic` does not create the folder | Create the folder before each write |
| Applying a single-trip folder skipped the trip as generic | With one record, every word has a document frequency of 1, so no word could anchor | The frequency table is empty below 30 trips |
| The cache would replay an answer after an icon list change | The cache key was the prompt text only | The schema is part of the key; a test pins it |
| One mutation test checked nothing | The "type need missing" case was a chain of expressions that all evaluated to nothing | Replaced with one change to one item |

## What is still open

The measured run. When stage 3 is complete, run `python -X utf8 pipeline/backfill_modules.py run --limit 5` first, read `cost`, read the five sidecars, then run the rest with `--max-usd` set (T150-a, owner). The run also answers three things the code assumes: how often Gemini passes the specificity test at 60 percent without a retry, whether "no figures at all" is too strict for risks (a fare or a fee is sometimes the point), and whether the model keeps to the icon list. If the reject rate is high the prompt or the threshold changes; both are one-line edits with the version bumped.

Nothing is applied to the trip files. After the sidecars exist, run `apply --dest` into a scratch folder, diff it, then copy over `data/trips` and rebuild `trips.master.json` and the wire (T150-c, next task; `build.py` and the wire build are outside this task). The 23 icon keys are still T143-e's proposal and T168 has not confirmed them; if T168 changes the list the cache invalidates by itself and affected trips regenerate (T150-b).

The model writes about places it was not given a web page for. The ungrounded call is the cheap choice and the prompt tells it to write checks as checks, but a risk that names a ferry or an office is a claim of existence. Spec K7 (T154) is the flag-only review; until it exists a person should read a sample of the sidecars, risks first (T150-d, owner). A grounded critic over these two modules would reuse T145's `critic_view`, but its prompt and field list are written for whole trips, so that is a follow-on (T150-e).

## Rollback procedure

Drop branch p9-k10-backfill-modules, or revert its commit. That removes the module, the prompt and the test file. No trip file, schema, wire, migration or dependency was changed, and there is no sidecar folder to clean up. If sidecars were later generated and applied, `git checkout` on `data/trips` restores the originals, since `apply` writes only those two keys.
