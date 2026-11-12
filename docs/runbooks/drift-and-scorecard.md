# Docs drift check and data quality scorecard

ROADMAP B7 and D2 (T1134; the quality gate T1142, extended by T1201, T1197, T1187 and T1214). Three scripts, all offline, all runnable on any checkout.

## Docs drift: `scripts/docs/drift.py`

Fails when the docs no longer say what the code does.

| Check | What fails |
|---|---|
| `logic` | A constant named in `docs/logic/*.md` (`- Constant:` lines) no longer exists in the file the entry names, or the entry gives a plain value (`= 7`, `= 0.6`, `= [5, 6]`, `= "priority"`) and the code or config holds another. Config keys such as `request.default_nights` are read from the JSON (`rules[key].value` in `pricing.json`, nested keys elsewhere). Line numbers are not checked. |
| `tests` | A test named in `docs/logic/*.md` (`` `path` :: "name" ``) is no longer in that file, or the file is gone. |
| `schema` | `docs/SCHEMA.md`'s wire table and `docs/wire.schema.json` disagree (runs `continent-app/scripts/ci/wire-table.mjs`; needs node). |
| `entry` | `CLAUDE.md`, `docs/project-map.md` or `docs/lessons.md` names a path that does not exist (runs `scripts/docs/check_entry_points.py`). |

```
python -I scripts/docs/drift.py                      # all four; exit 1 on new drift
python -I scripts/docs/drift.py --only logic,tests
python -I scripts/docs/drift.py --json out.json      # every finding
```

CI: the `python` job of `.github/workflows/ci.yml`, on every push and pull request.

When it fails: fix the doc entry (or the code, if the code is wrong) in the same commit. A value the parser cannot read (an object, a formula in words) is counted as "not plain, not compared" and never fails. Known drift that cannot be fixed now goes in `scripts/docs/drift_baseline.json` with `--update-baseline`; the gate then fails on anything else and on a baseline entry that no longer drifts, so the list only shrinks. It is empty today.

## Quality scorecard: `scripts/quality/scorecard.py`

Per layer of the shipped data, four numbers from 0 to 1:

- completeness: share of records with each layer field filled (empty string, list or object counts as missing);
- validity: share of present values that pass `docs/wire.schema.json` (app_data layers), or basic checks (id, name, coordinates in Europe, score 0 to 10) for wires with no contract yet;
- freshness: 1 inside the wire's cadence, else cadence / age, from `scripts/freshness_report.py`;
- accuracy: only where an eval set exists; today the rating layer against the 200 pairwise orders in `tests/golden_ratings.json`.

Layers: `core`, `flights`, `prices`, `rating`, `climate`, `place`, `imagery` (field groups of `app_data.json`, listed in `APP_LAYERS`), and `trails`, `beaches`, `lakes`, `mountains`, `cycling` (their country shards, `SHARD_LAYERS`).

```
python -I scripts/quality/scorecard.py               # print the table
python -I scripts/quality/scorecard.py --write       # data/reports/quality/<date>.json and .md, one line in quality_history.jsonl
python -I scripts/quality/scorecard.py --json --public continent-app/public --now 2026-11-06T12:00:00Z
```

Run it after each pipeline run, after `npm run data`, so it reads the wires the app ships. The scorecard sets no threshold itself; the quality gate below reads it.

## Quality gate: `scripts/quality/engine.py`

The scorecard is a gate. `run_pipeline.py` calls the engine with `--write` after every run; a failure adds the task `quality` to the run's failed tasks, so the run exits 1 and the admin health line shows it. The rules are in `scripts/quality/rules.yaml` (handbook "Data quality scorecard and gate"):

| Section | Reads | Hard (fails the run) | Soft (warns) |
|---|---|---|---|
| `rules` | completeness per field | a must_see field more than 2 points under the last passing card, or a hard field under its floor | a soft field under its floor |
| `layer_rules` | validity, freshness, accuracy per layer | validity or rating accuracy under its floor | a wire past its cadence (freshness under 0.50) |
| `reports` | the audit scripts' reports (dossier audit, hero image audit, POI audit) | a dossier HARD check failing | coverage checks, missing hero images, POI audit findings |
| `text_checks` | `data/trails/summaries.json` against the trail wire | dashes, banned words | facts, length |
| `links` | `continent-app/src/admin/linkHealth.json` | over 10% of checked links broken | over 2% |
| validation (D23) | `data/reports/validation/` | a hard check under its baseline | a soft check |

```
python -I scripts/quality/engine.py                  # check only; exit 0 pass, 1 fail, 2 rules out of step with the scorecard
python -I scripts/quality/engine.py --write          # also the card, a history line, panel.json and the admin snapshot
```

CI: `tests/test_quality_engine.py` in the `python` job of `ci.yml`, on every push.

### When the `quality` task fails

1. Read the failures: the run log prints one `FAIL [hard]` line per breach, and `data/reports/quality/panel.json` (on the box, `logs/status/quality/panel.json`) carries them with value, floor and previous value. The admin Data health tab shows the same after the next build.
2. Decide whether the data or the rule is wrong. A field that fell is almost always a layer that ran short (a harvest cut off, a cache missing): rerun that layer's task and then `python -I scripts/quality/engine.py`. A dossier HARD check names its destinations in `data/reports/dossier_audit.json`.
3. Never lower a floor to make a run pass. A floor moves only when the layer's content changed on purpose; change the rule and its comment (the value it was set from) in its own commit, with the reason in the task report.
4. A failed run is never the baseline, so running again without fixing does not pass. The ship already happened; if the data is wrong for travellers, roll the wire back (`docs/runbooks/deploy.md`).
5. Exit 2 means the rules and the scorecard disagree (a new field with no rule, or a rule for a field that is gone): add or remove the rule in `rules.yaml`.
