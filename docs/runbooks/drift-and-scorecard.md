# Docs drift check and data quality scorecard

ROADMAP B7 and D2, first cut (T1134). Two scripts, both offline, both runnable on any checkout.

## Docs drift: `scripts/docs/drift.py`

Fails when the docs no longer say what the code does.

| Check | What fails |
|---|---|
| `logic` | A constant named in `docs/logic/*.md` (`- Constant:` lines) no longer exists in the file the entry names, or the entry gives a plain value (`= 7`, `= 0.6`, `= [5, 6]`, `= "priority"`) and the code or config holds another. Config keys such as `request.default_nights` are read from the JSON (`rules[key].value` in `pricing.json`, nested keys elsewhere). Line numbers are not checked. |
| `tests` | A test named in `docs/logic/*.md` (`` `path` :: "name" ``) is no longer in that file, or the file is gone. |
| `schema` | `docs/SCHEMA.md`'s wire table and `docs/wire.schema.json` disagree (runs `continent-app/scripts/ci/wire-table.mjs`; needs node). |
| `entry` | `CLAUDE.md` or `MAP.md` names a path that does not exist (runs `scripts/docs/check_entry_points.py`). |

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

Run it after each pipeline run, after `npm run data`, so it reads the wires the app ships. It sets no threshold yet: hard and soft rules that block a run are the next half of D2.
