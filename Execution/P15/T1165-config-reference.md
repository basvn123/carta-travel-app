# T1165: Config reference, generated (ROADMAP B4, round 2 session S81)

## Date

2026-11-06

## What changed

`docs/reference/` went from an empty stub to `config.md`, a generated reference of every config key: 298 keys in six files (`continent-app/config/pricing.json` 46, `rating.json` 113, `rating_anchors.json` 8, `recommend.json` 47, `slots.json` 6, and `scripts/quality/rules.yaml` 78, the quality gate that `run_pipeline.py` runs through `scripts/quality/engine.py`). Each row gives the key, type, value, unit, the code lines that read it (file and line), what it changes for a traveller and its `docs/HANDBOOK.md` section. 277 keys have a reader, 4 are provenance notes (`created`, `task`, `rule`, `shortfalls` in rating_anchors.json) and 17 have no reader and are listed as dead, one register row each, none deleted. `scripts/docs/config_reference.py` writes it in about 10 seconds; its `--check` mode (0.1 s) runs in the `ci.yml` python job next to the docs drift check and fails when a key is added or removed without regenerating. The pipeline has no config file of its own: `pipeline/pricing_config.py` and `pipeline/rating_config.py` read pricing.json and rating.json. No code or config changed.

## Research

None chosen. The generator follows `scripts/docs/drift.py` (T1134): plain Python, `-I`, `CARTA_REPO_ROOT` for another tree. Readers are found by reading the code rather than by tracing a run, because most keys are read at import time by modules that need the data to run. Granularity: a pricing rule is one key (its `value` may be an object); elsewhere a top-level key, or one level into a block (`tiers.cutoffs`), and list rows by id (`slots[flight]`, `rules[core.tier]`). Deeper leaves were not listed: 223 rating leaves and 967 pricing leaves would bury the reference, and the readers almost always take the block at this level.

## Files touched

- Created: `scripts/docs/config_reference.py`, `docs/reference/config.md` (generated), this report.
- Modified: `docs/reference/README.md` (the stub is now an index of generated files), `docs/README.md` (the `reference/` row), `.github/workflows/ci.yml` (one step in the python job), `ROADMAP.md` (B4 status only), `Execution/_OPEN.md` (rows T1165-a to T1165-s appended).
- No code, config, test or HANDBOOK change.

## Commands run

```
python -I scripts/docs/config_reference.py                    # Wrote docs/reference/config.md: 298 keys, 17 dead
python -I scripts/docs/config_reference.py --check            # Config reference OK: 298 keys in 6 files
python -I scripts/docs/check_entry_points.py                  # Entry points OK: 199 paths checked
python -I scripts/docs/drift.py                               # 0 drift, exit 0
ruff check scripts/docs/config_reference.py                   # All checks passed
```

Seeded keys on the real tree, each restored after (exit 1 every time, with the key named):

```
recommend.json  gateway.seededKm added        FAIL: ... key gateway.seededKm is not in docs/reference/config.md
pricing.json    rules.stay.seeded added       FAIL: ... key stay.seeded is not in docs/reference/config.md
rules.yaml      rule core.seeded added        FAIL: ... key rules[core.seeded] is not in docs/reference/config.md
slots.json      version removed               FAIL: docs/reference/config.md lists ... key version, which the config no longer has
```

Two runs of the generator give byte-identical output.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Config keys in a reference | 0 | 298 | +298 |
| Keys with a named reader (file and line) | 0 | 277 | +277 |
| Dead keys known | 0 | 17 | +17 |
| Keys with a handbook section | 0 | 298 | +298 |
| Keys with a unit | 0 | 89 (45 from pricing.json units, 8 set in the generator, 36 from the key's name) | +89 |
| Code files named as readers | 0 | 63 | +63 |
| CI check on config keys | none | `--check`, 0.1 s | new |
| Generator run time | n/a | about 10 s | new |

How readers were found, per reader line: alias of the section 117, list rows 90, `section.key` on one line 88, quoted pricing rule 76, whole block iterated 15.

Dead keys by file: pricing.json 2 (`version`, `stay.repair`), rating.json 8 (`match.lambda_range`, `match.conflict_range`, `depth.categories_from`, `bands.top_share_min`, `bands.top_share_max`, and `stability.sample`, `max_move`, `seed`, which only `tests/test_rating_stability.py` reads), rating_anchors.json 3 (`version`, `bands`, `calibration`), recommend.json 2 (`version`, `month.anyWeather`), slots.json 1 (`version`), rules.yaml 1 (`version`). Each was confirmed by a repo-wide grep.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| First run found 9 dead keys, too few | "Whole block" matched any iterating line that named the section word (`p.rating?.hidden_gem` in ExploreTab.jsx, aware only through a comment) | A reader must reach the section from the config itself: the import variable, `cfg()`/`section()`, or a variable loaded from the file's path; comments and docstrings are skipped |
| `cfg("nature.kinds")` counted as reading all of `nature` | The rooted pattern allowed a sub path when used for iteration and aliases | Aliases and iteration use an exact pattern (the section itself, not a key in it) |
| `rules[core.tier]` was taken for a pricing rule | The row id has a dot, like a pricing key | Pricing rules are found only for pricing.json |
| First run took 53 s | A regex per key over every code line | One index of quoted strings for pricing rules, cached code lines, substring prefilters: about 10 s |
| `docs/reference/config.md` is not a docs workflow of its own | `entry-points.yml` runs only when CLAUDE.md or MAP.md change, and has no PyYAML | The step went into the `ci.yml` python job, beside the docs drift check, which runs on every push |

The check compares keys only. A changed value or a moved reader line does not fail CI (an unrelated code edit must not turn CI red); regenerate to refresh them.

## Screens checked

None: no screen changed.

## What is still open

- T1165-a to T1165-q: the 17 dead keys, one row each, kept, not deleted. The next task wires each one or removes it.
- T1165-r: the other half of B4, a `_doc` sibling on every key and a CI failure on a missing one. It changes the config, which this brief ruled out, so B4 stays "in progress".
- T1165-s: limits of the reader search. A pricing rule's object value is one key, so a dead field inside it is not found; a key read by a computed name (`cfg(f"{part}.x")`) would be missed. No such miss was seen in the 17 checked by hand.

## Rollback procedure

`git revert` of the T1165 commit. Nothing is one-way.
