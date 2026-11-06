# T1133: one machine-readable data contract (ROADMAP D1, session S49)

## Date

2026-11-06

## What changed

The wire `continent-app/public/app_data.json` now has one machine-readable contract, `docs/wire.schema.json` (a JSON Schema 2020-12 subset plus an `x-presence` keyword for required, every and some). It lists all 33 meta keys and 43 destination keys with type, range, pattern or enum, and goes deeper where a wrong shape broke screens before (`rating`, `rating.class_rank`, `taste` and its twelve likes). Three readers share it. The pipeline: `pipeline_io.atomic_write_json` calls `wire_contract.check_wire` before every write of the wire (and so do the three image fixers that write raw JSON). A break raises `WireContractError` with each field path and leaves the file on disk untouched. The app sync: `sync-data.mjs` calls `assertWire` before writing `public/app_data.json` and before splitting it. The CI gate: `contract.mjs` and `check-contract.mjs` read the schema instead of parsing the SCHEMA.md table. The table in `docs/SCHEMA.md` is now generated from the schema (byte-identical rows to before) and the gate fails when it is stale. Two twin interpreters, `pipeline/wire_contract.py` and `continent-app/src/lib/wireSchema.js`, word each problem the same way. The 20 shared seeded cases in `tests/fixtures/wire_contract_cases.json` fail pytest and `npm test` with the same message, for example `destinations.BRU.lat is "50.9", expected number`. Schema version stays 19; no payload, key or value changed.

Where the file lives: `docs/`, next to `SCHEMA.md`. Both the pipeline and the app read it and neither owns it. `schema-contract.yml` already checks out `/docs/` and triggers on it, and SCHEMA.md, its human view, sits beside it. Under `pipeline/` the app would depend on a Python folder, and the sparse CI checkout would need it for the JS half.

## Files touched

- Created: `docs/wire.schema.json`, `pipeline/wire_contract.py`, `continent-app/src/lib/wireSchema.js`, `continent-app/scripts/ci/wire-table.mjs`, `tests/test_wire_contract.py`, `continent-app/tests/wire-contract.test.mjs`, `tests/fixtures/wire_contract_cases.json`, this report.
- Modified (the validation call only): `pipeline/pipeline_io.py`, `pipeline/images/drop_dead_files.py`, `pipeline/images/fix_special_filepath.py`, `pipeline/images/fix_url_queries.py`, `continent-app/scripts/sync-data.mjs`.
- Modified: `continent-app/scripts/ci/contract.mjs` (reads the schema; per-value rules moved to the schema; keeps the cross-record relations; table render and drift check), `continent-app/scripts/ci/check-contract.mjs` (schema and table steps), `.github/workflows/schema-contract.yml` (paths, sparse files, pytest and node steps for the shared cases), `docs/SCHEMA.md` (Wire contract section, generated table between markers), `docs/HANDBOOK.md` (data wire section, step 6), `ROADMAP.md` (D1 status), `Execution/_OPEN.md` (rows T1133-a to g).

## Commands run

```
python3 <scratch>/build_schema.py            # one-off: the schema seeded from the old table and v19 checks
node continent-app/scripts/ci/wire-table.mjs --write
python3 -m pytest tests/test_wire_contract.py -q
python3 -m pytest tests -q $(quarantine deselects)    # here and on the base, side by side
cd continent-app && npm test && node --test tests/wire-contract.test.mjs
CARTA_CONTRACT_DERIVE_SPLIT=1 node scripts/ci/check-contract.mjs
CARTA_CI_SEED_BREAK=coordinates-as-strings CARTA_CONTRACT_DERIVE_SPLIT=1 node scripts/ci/check-contract.mjs
node scripts/sync-data.mjs --split-only      # the sync guard on the real wire (generated files removed after)
ruff check pipeline/wire_contract.py tests/test_wire_contract.py; npx eslint src/lib/wireSchema.js scripts/ci/contract.mjs tests/wire-contract.test.mjs
```

The seeded bad value on the real wire, all three readers: `atomic_write_json` on `continent-app/public/app_data.json` with `BRU.lat = "50.9"` raised `WireContractError ... destinations.BRU.lat is "50.9", expected number`, and the file's sha256 was the same before and after (no `.tmp` left). `assertWire` gave the same line, and the gate's seeded break gave `destinations.BRU.lat is "50.9014", expected number`.

## Config and secrets set

None. Optional env `CARTA_WIRE_SCHEMA` points the JS loader at another schema file (tests only); `CARTA_REPO_ROOT` is honoured as before.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Machine-readable contract files read by both pipeline and app | 0 | 1 (`docs/wire.schema.json`) | +1 |
| Pipeline writes of the wire validated | 0 | every `atomic_write_json` to the wire, plus 3 raw writers | all but 2 one-offs (T1133-c) |
| Wire keys with a type or range rule | 7 destination, 6 meta (hand-written) plus v19 second level | 43 destination, 33 meta plus v19 second level | +63 keys typed |
| Shared seeded cases failing in both pytest and npm test, field path first | 0 | 20 | +20 |
| pytest (minus quarantine), this checkout | 435 passed, 2 failed (base) | 483 passed, 2 failed | +48 new, same 2 pre-existing failures (T1133-g) |
| npm test | 1481 tests, 0 fail (base) | 1530 tests, 0 fail | +49 |
| Guard cost per wire write, real 14 MB wire | 0 | Python 0.46 s, JS 145 ms (catalogue mode 0.48 s / 162 ms) | new |
| Contract gate seeded breaks rejected | 7/7 fixture, 6/6 catalogue | 7/7, 6/6 | same |
| Real wire, catalogue mode | passes | passes (both interpreters) | same |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Python and JS could disagree on `true` against an enum or const holding `1` | Python `True == 1` | `_same()` in `wire_contract.py` treats a bool as never equal to a number, as JS does |
| Python `integer` would reject `3.0` that JS accepts | `json` gives a float for `3.0` | integer means a finite number with no fraction, in both |
| Contract gate FAILs on `boot.json` missing and on two dynamic `.rpc()` call sites | the cloud checkout has no generated split files; the rpc ones are on the base too | ran with `CARTA_CONTRACT_DERIVE_SPLIT=1` as CI does; the rpc FAIL is row T1133-f |
| npm test skips 12 here vs 5 on the base worktree | the base worktree had a generated `boot.json`, which un-skips 7 tests | environment only; same 0 failures |

## Screens checked

None: nothing a traveller sees changed (no app source path in the bundle imports the new module yet). The end check needs no screen for this task.

## What is still open

- T1133-a (owner): run a wire-writing layer and `npm run data` on the build box with the guard on. Only the shipped wire could be checked here; the master is not in the cloud checkout.
- T1133-b: no browser hydration validation yet. The interpreter is pure and ready, but the schema would add about 21 KB to the bundle, and the browser holds boot plus shards rather than `app_data.json`. A lean boot-path check needs its own byte budget.
- T1133-c: two one-off scripts write the wire outside the guard.
- T1133-d: split wires, nature rows and trail photos are still checked by JS only; extend the schema with D2 and D3.
- T1133-e: MAP.md does not yet name the new files.
- T1133-f: the gate's database half is red on two dynamic rpc call sites (pre-existing).
- T1133-g: two pytest failures with a JSONDecodeError, also on the base (likely LFS in `cache/`).

The cross-record relations (id equals key, gateways point back, every rated record has a taste) stay in `contract.mjs` because JSON Schema cannot say them; the pipeline guard does not check them.

## Rollback procedure

`git revert` the T1133 commit(s). Nothing is one-way: no data, migration or schema version changed, and `docs/SCHEMA.md`'s table rows are the same as before.

## Owner steps (for the checklist)

- [T1133-a] Prove the wire guard on the real master | the cloud checkout had only the shipped wire, so the owner's full pipeline output has not been through the guard | on the build box pull the branch; run one layer that writes the wire, for example `python pipeline/country_context_layer.py`; then `cd continent-app && npm run data`; if either stops with `WireContractError`, the message names the field path: fix the value or add the key to `docs/wire.schema.json` and run `node continent-app/scripts/ci/wire-table.mjs --write` | `docs/wire.schema.json`, `pipeline/wire_contract.py`
