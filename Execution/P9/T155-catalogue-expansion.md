# T155 D2: Expand the catalogue, batched by region

## Task ID

T155 (mind-map number T157).

## Date

2026-10-03

## What changed

Carta can now grow its trip catalogue in batches without a person writing trips, and nothing a batch makes reaches the catalogue until it has passed the validator, the critic, the coverage checks and a review. Before this task the pieces existed one by one: a contract and gate (T143), a three-pass generator (T144), a critic (T145), per-figure confidence (T146), a golden set (T153) and a review queue (T154). Nothing decided which trips to make, nothing capped the spend of a batch, nothing flagged every price, opening time and booking window, and nothing moved a reviewed trip into `trips.master.json`. No trip was generated in this task. The session notes keep this task to code and plans; the paid runs and every catalogue rebuild are the owner's.

The work is one new module, `Trips/carta-unified/carta-unified/pipeline/expand_catalogue.py`, and it runs as eight subcommands in a fixed order. `slots` reads the gap matrix (`gap_matrix.build`) over the catalogue and splits each region into cells to fill (no trip for that country and trip type), cells to deepen (one trip, room for a second), and cells that are geographically blocked. `plan` writes one brief per cell into `expansion/<batch>.json`, a tracked file a person can read and edit before any money is spent. `run` sends the briefs through `generate_trip.generate()` with a spending cap. `check` is the promotion gate. `close-clean` records a person's sign-off for trips the review queue has nothing to show for. `promote` copies ready trips into `data/expansion/`. `join` merges that folder into the master, the single files and the flat CSV. `retract` takes a whole batch back out.

A batch is one region and one wave, named `<regionKey>-g<wave>`, for example `northern-baltics-g1`. That name is what the generator writes into `provenance.batch`. The 253 curated trips are batched by region in the same field (western-central 100, southern-mediterranean 70, eastern-southeastern 53, northern-baltics 30, from `data/trips.master.json`), so a generated batch can be counted, reviewed, refreshed and retracted as one unit, and the batch name alone says which region it belongs to. The gate already fills `dataVintage` from the generation year and `provenance.ingestedAt` from the day, and every figure has a `figures` row with its source URL and `checkedAt`. What was missing was the review date: `promote` stamps `provenance.reviewedAt` from the trip's `<id>.review.json`, which closes register row T154-b. So every promoted trip carries a traceable source per figure and a date on which a person signed it off.

Briefs are written from the cell, never with a figure, because the skeleton pass fails on any number with a unit. A fill brief says what a week of that type is and that Carta has no such trip in the country yet. A marginal cell (the gap matrix says only a reduced form of the type fits, a lake week in a country with no coast) carries the matrix's reason with its figures and dashes taken out. A deepen brief lists the existing trip's title and bases under `differentFrom`, and the generator passes every brief key except `key` into the skeleton prompt, so the model sees what not to repeat without a prompt change. I did not touch the prompts: a prompt edit would move the golden-set stamp and collide with the sessions editing the generator this wave. A cell already in any plan file is never planned again, and `plan` refuses to overwrite a plan, because a plan is history.

The spec asks for a verify flag on every price, opening time and booking window. The generator only flags figures it withheld and fields the critic disputed. So after each admitted trip, `run` adds one line per perishable field. A price is any budget row, stay `priceEur` or day `spendEur` that holds a value. A booking window is `logistics.bookingWindows`, `typeSpecific.bookingTimeline`, `typeSpecific.hutBooking` or a stay's `booking` line when it holds text, and any other text that says to book or reserve ahead, or that a place fills up. An opening time is a sentence with a clock time, or with an open or close word next to a day, month, season or time word. The lines read like "Recheck price at accommodationStrategy[1].priceEur before booking (checked 2026-10-03)". They go into the record's own `verifyFlags`, and `verifyFlagCount` and `volatilePricing` are re-derived, so the page's existing note ("{n} prices or opening times in this plan change often", `journey.verifyNote` in `src/i18n/en.js`) counts them with no app change. A field the critic already disputed counts as flagged. The step is deterministic, so a rerun adds nothing. The record then goes through `generation_gate.admit()` again. The contract holds 40 flags, and a trip that would need more is moved out of `admitted/` into `rejected/` with its sidecars, rather than shipping with some flags missing.

The promotion gate in `check` holds a trip for any of six reasons, and `promote` copies only trips with none. Validator: `generation_gate.check` (schema, cross-field rules and the K5 checks of `validate.py`), plus the validator's ERROR checks with the place index when a gazetteer is present. Critic: the critique file exists for this record, covers all six kinds, matches the record's prompt version, and every dispute is in `verifyFlags` with none dropped over the cap. Provenance: the batch is the plan's and of the record's region, the record was written with the prompts in the tree today (an older prompt version means regenerate), `dataVintage` is the year of `ingestedAt`, and the evidence sidecar lists the pages read. I deliberately did not require `sources.verified`, because that paragraph is the writer's own account and the critic is not shown it for that reason; the trace is the evidence sidecar. Flags: no perishable field is left unflagged. Coverage: the record is in the cell its brief asked for, the cell is not blocked, the cell holds fewer than `MAX_PER_CELL` (2) other trips, and the trip is not a near copy of a trip already in the cell or the batch. A near copy means half or more of the title words in common, or half of the bases. The T143 example trip, for instance, is caught as a copy of the curated Donauradweg. Review: the review queue has no open item for it and its review is closed against this exact record's SHA-1.

Getting into the catalogue had two parts. `data/expansion/` is the durable source of generated trips, the way the raw batches are for curated ones. `build.py` now reads it after the four batches (register rows T144-b and T145-c). It reads it through `expand_catalogue.load_expansion`, which takes `<id>.json` files only and refuses a record that is not generated, has no review date, sits in a batch of another region, or fails the gate; a refused record is a build error, not a silent skip. `build.py` cannot run on this laptop because the raw batches are not here (the T151 report found the same), so `join` patches the master in place the way `fill_type_specific.py apply` does. It never rewrites a curated trip. It replaces the master's generated trips with whatever `data/expansion/` holds now, so a re-promote or a retract lands the same way. It keeps the master's byte layout (two-space indent, CRLF, which round-trips the current master exactly), writes or removes only generated single files, and in `trips.flat.csv` moves only generated rows. That last point matters because the CSV is already stale against the master for curated rows (see What is still open), and regenerating it whole would have slipped 115 unrelated changes into a join. Finally `fill_type_specific.py` now skips generated trips. Its text rules would otherwise null the grounded `typeSpecific` figures of every generated trip, because a generated trip has an empty `typeSpecific.raw`. They would also crash on the typed `dayStats`.

The spend cap works on the generator's ledger. A live run refuses to start without `--max-usd`. Before each trip it adds up the USD spent so far on this batch's briefs, and it stops when the cap is reached or when the dearest trip so far would cross it. It also stops if the ledger holds a model missing from `generate_trip.PRICES`, since an unpriced call would make the cap a guess. A status file per batch (`data/generated/batches/<batch>.json`) records each brief's outcome, so a rerun skips admitted trips and retries rejected ones only with `--retry`. The generator's pass cache means a retry does not repay the passes that already succeeded.

## Files touched

Root repo, branch p9-d2-catalogue-expansion. The app repo was not touched.

Created:
- Trips/carta-unified/carta-unified/pipeline/expand_catalogue.py
- Trips/carta-unified/carta-unified/expansion/northern-baltics-g1.json (20 briefs)
- Trips/carta-unified/carta-unified/expansion/southern-mediterranean-g1.json (20 briefs)
- Trips/carta-unified/carta-unified/expansion/western-central-g1.json (17 briefs)
- Trips/carta-unified/carta-unified/expansion/eastern-southeastern-g1.json (3 briefs)
- tests/test_expand_catalogue.py
- Execution/P9/T155-catalogue-expansion.md

Modified:
- Trips/carta-unified/carta-unified/pipeline/build.py (reads data/expansion/ after the batches, `--expansion`)
- Trips/carta-unified/carta-unified/pipeline/fill_type_specific.py (`is_generated`, `curated`; generated trips are skipped)
- Execution/_OPEN.md (T144-b, T144-e, T145-c, T154-b closed; T155-a to T155-f added)

Not touched: `generate_trip.py`, the prompts, the schema, `generation_gate.py`, `review_queue.py`, `validate.py`, `gap_matrix.py`, `export_sql.py`, any data file, `.gitignore`, `infra/hetzner/`, `run_pipeline.py`, `pipeline/archive/`.

## Commands run

From `Trips/carta-unified/carta-unified` in the root worktree, with `PYTHONUTF8=1`:

```
python pipeline/expand_catalogue.py self-test
python pipeline/expand_catalogue.py slots
python pipeline/expand_catalogue.py plan --region northern-baltics --wave 1 --write
python pipeline/expand_catalogue.py plan --region southern-mediterranean --wave 1 --write
python pipeline/expand_catalogue.py plan --region western-central --wave 1 --write
python pipeline/expand_catalogue.py plan --region eastern-southeastern --wave 1 --write
python pipeline/expand_catalogue.py check expansion/eastern-southeastern-g1.json     (3 missing, exit 1: nothing generated yet)
python pipeline/fill_type_specific.py check                                          (ok)
python pipeline/fill_type_specific.py self-test                                      (11 of 11)
python pipeline/validate.py --report <scratch>/v_after.md --json <scratch>/v_after.json
python pipeline/generate_trip.py self-test; generation_gate.py, review_queue.py, golden_set.py, backfill_modules.py self-test
python pipeline/golden_set.py check --allow-missing-baseline                         (NO BASELINE, unchanged)
python <scratchpad>/t155_measure.py      (the stub flow on a scratch copy, for the measurements below)
```

From the root worktree:

```
python -m pytest tests/test_expand_catalogue.py tests/test_generate_trip.py tests/test_trip_critic.py tests/test_review_queue.py tests/test_golden_set.py tests/test_trip_confidence.py tests/test_backfill_modules.py tests/test_fill_type_specific.py -q     (117 passed)
```

No Gemini call was made. Every write of the generator, the review files, `data/expansion/`, the master, the single files and the CSV happened in temporary copies made by `_scratch_root`, which the tests and the self-test delete. Nothing was written to the real `data/`, `cache/`, R2 or production.

## Config and secrets set

None. A live run reads `GEMINI_API_KEY` from the repo-root `.env` through `pipeline/env_local.py`, as `generate_trip.py run` does. No dependency was added. The Claude API is not used anywhere.

## Before/after measurements

Catalogue figures come from `gap_matrix.build` over `data/trips.master.json` (`expand_catalogue.py slots` prints them). The cost ranges are the brief count times EUR 0.25 to 0.45 a trip, the estimate in the task text and in the "expand to about 600" line of `CARTA_UNIT_ECONOMICS.md` section 2.3; they are sizing figures until the first measured run.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips in the catalogue | 253 | 253 | 0, no run (T155-a) |
| Country and trip-type cells covered, of 390 | 231 | 231 | 0 |
| Cells to fill, of them marginal | 139, 16 | 139, 16 (60 of them now planned) | |
| Cells holding one trip that may take a second | 208 | 208 (203 viable to deepen) | |
| Blocked cells, never planned | 20 | 20 | |
| Trips when every open cell is made, at two per cell | not computed | 595 | |
| Briefs ready for the generator | 0 | 60 in four region batches | +60 |
| Estimated cost of wave 1 | not applicable | EUR 15.00 to 27.00 | |
| Estimated cost to fill and deepen every open cell (342 trips) | not applicable | EUR 85.50 to 153.90 | |
| Fields of a generated trip with a verify flag, stub example | 0 of 20 perishable fields | 20 of 20 (9 prices, 5 booking windows, 6 opening times) | +20 |
| Checks between an admitted trip and the catalogue | none (no path existed) | 6 groups (validator, critic, provenance, flags, coverage, review) | new |
| validate.py on the real master: errors, warnings, notices | 2, 492, 30 | 2, 492, 30 | 0 |
| Scratch master, one stub trip joined: trips, errors, warnings | 252, 2, 489 | 253, 2, 492 | +1 trip, 0 errors |
| Scratch gap matrix after the join: covered, gaps | 230, 140 | 231, 139 | one cell filled |
| Generator test suites | 91 pass | 117 pass (26 new) | +26 |

Wave 1 is fill only. Its cells are the gap matrix's highest-priority gaps in each region: northern-baltics 20 of 53, southern-mediterranean 20 of 66, western-central all 17, eastern-southeastern all 3. The scratch measurement dropped the curated Austria cycling trips from a copy of the master so the T143 example trip could fill a real gap. The three warnings on the joined trip are `missing-coordinates` (geocoding needs geonamescache or the cities500 gazetteer, neither of which this laptop has), `missing-connectivity` and `missing-booking-windows` (null in the fixture). The review queue showed 0 of the trip's 390 fields to read, because the stub critic disputed nothing.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Dash and superscript characters landed literally in the source | The file-writing tool turned `\u` escapes inside raw strings into characters | A scratch script replaced each with its `\u` escape; the source now holds escapes only, checked by a scan |
| A heredoc fix script failed with a unicode escape error | Bash heredocs eat backslashes (the T143 gotcha) | Wrote the script as a file instead |
| The self-test promoted nothing | The gate required `sources.verified`, which the fixture leaves null | Dropped the requirement: it is the writer's own account, and the evidence sidecar is the trace |
| A marginal reason read "of coast at Neum" and "Kuutsemaee:, Nordic-led" | The figure stripper left the words around the figure | It also drops a following "of", "vertical" or "maximum" and a comma left after a colon |
| The slot test failed once the plans were written | It counted the real plan folder, which now holds wave 1 | The count tests use an empty plan folder; a separate test checks the committed plans |

## What is still open

The run itself. Stage 3 of `_OPEN-MASTER.md` is not complete and the session notes keep this task to code and plans, so no batch has been generated and the done condition (the catalogue grows with every new trip passing) is not met yet. The order is in the register. T155-b comes first, for the owner: read and edit the wave-1 plans. The gap matrix only knows terrain limits for hiking, winter sports and water sports and calls every other type viable everywhere. So wave 1 asks for cozy-towns, culinary, cycling and nature-escape weeks in Monaco, and city weeks in Liechtenstein, Andorra and San Marino. Strike cells in the plan files or add rules to `CONSTRAINTS`, and confirm the cap of two trips per cell and the target of about 600. Then T144-a, the measured run of a few briefs. The eastern-southeastern plan, with three briefs, is a natural first batch for it.

Then T155-a, a capped run per batch (`run expansion/<batch>.json --live --max-usd <cap> --limit 3`, read `cost`, then the rest). Two existing rows should be fixed before it, because both cost yield: T146-b (a withheld hotel price fails the whole trip) and T151-d (the numbers prompt does not say what each `typeSpecific` slot means per type). Then T155-c, per batch: review, `close-clean`, `check`, `promote --write`, `join --write`, then the wire rebuild (T085-a). The validator then runs with the wire and the gazetteer, because the hero checks need the wire. Join on a machine with a gazetteer so the new trips get coordinates, and retract a batch whose trips get no hero.

Three follow-ups for a later task. The perishable flags are added after `generate()`, so a trip made by the generator directly, such as a golden run, carries none. They belong in `generate()` once no other session is editing it (T155-d). `data/trips.flat.csv` is already stale against the master: 115 rows differ in coordinates, 42 and 57 in the budget low and high, and 30 in the accommodation and food rows, from the T090 and T332 changes. `join` moves only generated rows, so the curated rows need a `build.py` run on the box (T155-e). CI runs neither this module's self-test nor its tests (T155-f, with T143-f).

Rows that still stand and bear on this work: T144-c (`export_sql.py` would write the v2.1 objects as text, so the Supabase seed must not be regenerated from an expanded master until it is fixed; the app reads the wire, not the seed). T153-c (`data/generated/`, where batches run, is not in `.gitignore`, and rule 4 kept this task out of it). T146-g (per-field expiry). The yearly EUR 100 to 200 refresh the task mentions needs T146-g: the flags and each figure's `checkedAt` say what to recheck, but nothing yet schedules the recheck. Closed by this task: T144-b, T144-e, T145-c and T154-b.

## Rollback procedure

Revert the task commits on p9-d2-catalogue-expansion, or drop the branch before merge. That removes the module, the four plan files and the test file, restores `build.py` and `fill_type_specific.py`, and puts the four closed register rows back to open. No data, wire, migration or dependency was changed. After the owner runs batches, a single batch is undone with `python pipeline/expand_catalogue.py retract <batch> --write`, which deletes that batch from `data/expansion/` and rejoins. The test shows this restores the master, the CSV and the single files byte for byte. The wire then needs rebuilding.
