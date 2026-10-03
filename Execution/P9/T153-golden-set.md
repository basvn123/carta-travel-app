# T153 K8: Keep a golden set and re-run it on every prompt change

## Task ID

T153 (mind-map number T155).

## Date

2026-10-03

## What changed

Prompt changes now have something to be measured against. Before this task nothing compared one generation of a trip with the next, so a tweak to the numbers prompt could have raised every food budget by a fifth and the first sign would have been 600 trips carrying it. There is now a golden set of ten trips, one per trip style, a runner that regenerates all ten through the full four-call pipeline and diffs the numbers against the last blessed run, and a CI check that fails when a prompt, the model chain or the set itself changes without a new blessed run.

The set lives in `Trips/carta-unified/carta-unified/golden/golden-set.json`. Each entry names a curated record from `data/trips.master.json` (Donauradweg, Engadin ridges, Brno, Appenzell, Grossglockner, Stubai Hoehenweg, lambic and Trappist Belgium, Arlberg, the Swiss National Park, Ruegen), a brief that `generate_trip.load_brief` accepts, and that record's figures as ground truth: the four budget lines, total, per day, and the distance for linear routes only. The curated figures are hand written and were corrected in T332, but they are not a fresh check against current prices. That limit is stated in the file and in register row T153-d. The ten cover all three budget tiers (one cheap, four middle, five dear).

The runner is `pipeline/golden_set.py`. A run calls `generate_trip.generate` for each trip with the cache off, because the pass cache is keyed on the prompt text and not the model, so a cached run would hide a model change. From each admitted record it pulls a flat list of numbers (budget lines, totals, per-day, distance, summed day stats, mean stay price, exchange rate, mean transfer time, withheld figure count, flag count) and from the critique file the critic's disputes as path, kind and severity. A trip that raises is recorded as an error and the other nine still run.

The diff against the baseline fails on five things. A trip that was admitted and now is not. Fewer than eight trips with numbers on both sides, because a gate that compares nothing passes by default. One figure moving more than 30%. A systematic drift, meaning one group of figures (budget.food, say) moving the same way in at least 80% of at least five trips by a mean of 5% or more, which is exactly the food-budget-up-20% case. And the critic's disputes per trip moving by half or more and by at least two, which is how a change to `k4-critic.md` shows up (register row T145-e, now closed). It warns on a figure moving more than 10%, on a new high-severity dispute, on a model that differs from the baseline's (a chain that fell over to another model explains movement the prompt did not cause) and on a trip further than 40% from its curated figure. The `score` command prints the same truth comparison for a single run, so the first live run is useful before any baseline exists.

What triggers a run. `stamp()` hashes the four prompt files, `MODEL_CHAIN`, a pinned critic chain and the golden-set file into one digest. `bless` stores the stamp in `golden/baseline.json`. `check` exits 1 when the tree's digest differs from the baseline's and names what changed. `.github/workflows/golden-set.yml` runs the self-test and `check` on every change to the prompts, `generate_trip.py`, the runner or the set, so a prompt or model change cannot merge without a new blessed baseline in the same change. The live run itself is paid, about 40 calls for the set, so it is a manual dispatch with `live=true` or a local `run --live`, never automatic. `run` refuses to start without exactly one of `--live` and `--stub`, and `bless` refuses a stub run and a run made with a different stamp than the tree has now. A bless whose diff against the old baseline fails needs `--force`.

Stage 3 of `_OPEN-MASTER.md` is not complete, so no paid call was made and there is no baseline. `check` therefore reports NO BASELINE and the workflow passes it with `--allow-missing-baseline`, which must be removed when the baseline is committed (T153-a). That is a deliberate soft spot, written down so it is not forgotten.

## File formats (for T154 and anyone reading the files)

All files are UTF-8 JSON with no em dashes. The module docstring of `pipeline/golden_set.py` holds the full description; this is the short form.

`golden/golden-set.json`: `format` 1; `truthSource`; `tolerances` (drift 0.10, bigMove 0.30, systemicMean 0.05, systemicAgree 0.8, systemicMinTrips 5, truth 0.40, minComparedTrips 8); `trips[]` each with `key` (unique, also the output folder), `curatedId`, `style`, `brief` and `truth` (budget lines low and high, totalEur, perDayEur, durationDays, budgetTier, distanceKm for linear routes).

A run file (`<out>/run.json`; `golden/baseline.json` is a blessed one with an added `blessed: {at, note}`): `format`, `mode` (live or stub), `stamp`, `ranAt`, `setSha`, and `trips{key}` each with `status` (admitted, rejected, error), `stage`, `errors`, `models` per pass, `usd`, `metrics` (flat names such as `budget.food.low`, `days.distanceKm`, `flags`), `disputes[{path, kind, severity}]` and `flags`. For T154 the useful part is `disputes`: it is read from `<id>.critique.json`, so a flag-only review can compare what the critic raised against what a reviewer decided across re-runs.

## Files touched

Root repo, branch p9-k8-golden-set. The app repo was not touched.

Created:
- Trips/carta-unified/carta-unified/golden/golden-set.json
- Trips/carta-unified/carta-unified/pipeline/golden_set.py
- tests/test_golden_set.py
- .github/workflows/golden-set.yml
- Execution/P9/T153-golden-set.md

Modified:
- Execution/_OPEN.md (rows T153-a to T153-f, T145-e closed)

## Commands run

From the root worktree (wt\T153), with `PYTHONUTF8=1`:

```
python Trips/carta-unified/carta-unified/pipeline/golden_set.py self-test
python Trips/carta-unified/carta-unified/pipeline/golden_set.py check --allow-missing-baseline    (exit 0, NO BASELINE)
python Trips/carta-unified/carta-unified/pipeline/golden_set.py check                             (exit 2)
python -m pytest tests/test_golden_set.py tests/test_trip_critic.py tests/test_generate_trip.py -q (46 passed)
```

The ten entries of `golden-set.json` were written by a throwaway script from `data/trips.master.json`, so the figures were never typed by hand. No Gemini call was made. Nothing was written under `data/`, `cache/`, R2 or production.

## Config and secrets set

None in the repository. The live dispatch reads a `GEMINI_API_KEY` repository secret that does not exist yet (T153-b). No dependency was added; the workflow installs `jsonschema` as the generator already needs. The Claude API is not used anywhere.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips with ground truth that a prompt change is checked against | 0 | 10, one per style (all 10 trip types) | +10 |
| Prompt, model or set changes that can merge without a re-run | all | none, once a baseline is blessed (check exits 1) | gate added |
| Classes of regression the diff fails on | 0 | 5 (status, too few compared, big move, systematic drift, critic volume) | +5 |
| Calls for one full run | not applicable | 40 (10 trips by 4 calls, 20 of them grounded) | new |
| Cost of one full run | not measured | not measured: no call made (T153-a) | |
| pytest cases in the generator suites | 36 | 46 (10 new) | +10 |

The 40 and the 20 come from the four-call design in `generate_trip.generate` (T145 report) times ten trips. A planted 20% rise in every food budget, replayed through stubs, fails the diff as systematic drift on budget.food in the self-test and in `test_a_twenty_percent_food_rise_is_a_failure`. That test is the one measured effect of the gate; real-model behaviour is unmeasured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first self-test failed on an identical rerun | The mini set of six trips was held to the real set's minimum of eight compared trips | The mini set carries its own minComparedTrips of 5 |
| Two stub trips would have collided in the admitted folder | Every fixture trip has the same id | Each trip writes into its own subfolder of the run folder, named by its key |

## What is still open

The measured run is the one thing this task cannot do. When stage 3 is complete, someone runs the set live, reads the `score` output, blesses it and removes the soft spot in the workflow (T153-a, owner). A GEMINI_API_KEY repository secret is needed if that run is dispatched from CI (T153-b, owner). The root `.gitignore` does not ignore `data/generated/`, where runs write by default; rule 4 kept this task out of it (T153-c). The ground truth is the curated figures and has not been spot-checked against current sources, and the tolerances are first guesses to revisit after one measured run (T153-d, owner). The stamp does not cover `generation_gate.py`, whose `derive()` T090-e will change (T153-e). The Carta BackEnd.md Phase 3 model fallback note and the K8 section of the spec are not in the repository, so the design follows the task text and T145's report (T153-f, owner). The register row T145-e is closed by this task.

## Rollback procedure

Revert the task commit on p9-k8-golden-set, or drop the branch before merge. That removes the runner, the set, the tests and the workflow and puts `_OPEN.md` back. Nothing else reads these files, no data was written and no dependency or migration was added.
