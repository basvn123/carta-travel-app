# T1082: Live-stays leftovers and admin test scripts

## Date

2026-11-05

## What changed

Part A (closes T1074-b): the dead leftovers of the removed live-stays path are gone. The `stay.live` string is out of all six catalogues, `stayLive` is out of `costIndex.js`, the `live` bed quality is out of `priceDay.js` (the `live` quality stays for flights), `liveBed` is out of `AskTripCard.jsx` together with the bed quote that only fed it, and `xk` is out of `docs/SCHEMA.md`. `pipeline/stays/live_keys.py` was already gone (nothing to delete). `xk` is not in `contract.mjs`, so the wire contract is untouched and no pipeline rebuild is needed. The Explore filter URL key `xk` is a different thing and stays.

Part B (closes T1070-e): the two admin harnesses that loop over every migration (`test_admin_followups.mjs`, `test_moderation_decisions.mjs`) now skip `_down` files, apply `supabase/schema.sql` first and carry the Storage stubs (copied from `test_rls_policies.mjs`). The other admin and ai harnesses use explicit migration lists or prefixes, so they never hit 056. `060_email_prefs_down.sql` now guards `cron.job` with `to_regclass` and a dynamic `execute`, as 061's down file does.

## Files touched

- Modified: `continent-app/src/i18n/{de,en,es,fr,it,nl}.js`, `continent-app/src/lib/costIndex.js`, `continent-app/src/lib/price/priceDay.js`, `continent-app/src/browse/ask/AskTripCard.jsx`, `docs/SCHEMA.md`, `docs/HANDBOOK.md` (Live stays leftovers paragraph), `continent-app/scripts/admin/test_admin_followups.mjs`, `continent-app/scripts/admin/test_moderation_decisions.mjs`, `supabase/migrations/060_email_prefs_down.sql`.
- Created: this report. Deleted: none.

Proof nothing read the removed names: a grep of app, pipeline, scripts, tests, functions and docs for `stayLive|liveBed|live_keys|stay.live` found only the lines removed, the HANDBOOK note, and a guard in `tests/priceDisplay.test.mjs` V4 (kept; it forbids the string). `row.stayLive` fed only `bedQuality` and `provenance.live`; no reader of `provenance.live` exists. `AskTripCard` priced a bed quote only to read `liveBed`; the shown bed is `cost.stayEur`.

## Commands run

```
grep -rnE "stayLive|liveBed|live_keys|stay\.live" (repo, minus node_modules, archive, cache, public)
temporary Postgres 18 on port 55482 (initdb, pg_ctl start, stopped and deleted afterwards)
node continent-app/scripts/admin/test_moderation_decisions.mjs
node continent-app/scripts/admin/test_admin_followups.mjs
psql -f supabase/migrations/060_email_prefs_down.sql   (no pg_cron)
npm test; npm run lint; node scripts/ci/design-lint.mjs
python -m ruff check --select E9,F63,F7,F82 pipeline src scripts tests
CARTA_CONTRACT_DERIVE_SPLIT=1 node continent-app/scripts/ci/check-contract.mjs
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| `stay.live` keys across six catalogues | 6 | 0 | -6 |
| Live-stays symbols (`stayLive`, `liveBed`, live bed quality, `xk` doc) | 4 places | 0 | removed |
| Source files deleted | `live_keys.py` already absent | n/a | 0 |
| `test_moderation_decisions.mjs` | aborted at 056 | applies all migrations; 74 of 76 pass; 76 of 76 with migrations to 055 | runs |
| `test_admin_followups.mjs` | aborted at 056 | applies all 59; 66 of 86 pass; 86 of 86 with migrations to 055 | runs |
| `060_email_prefs_down.sql` without pg_cron | ERROR (cron.job missing) | passes | fixed |
| `npm test` | 1,266 tests | 1,266 tests, 1,254 pass, 0 fail, 12 skipped (worktree) | 0 fail |
| lint, design lint, ruff, contract | 0 errors, 0 new | 0 errors (163 warnings), 0 new (7,721 baseline), ruff clean, contract gate passed | none |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Both harnesses then stopped at 061 "Storage is missing" | their stubs lack the `storage` schema | Storage stubs copied in |
| 2 and 20 assertions fail with the full stack | the assertions predate migrations 052 to 067 (for example 062 admin audit and read budgets change behaviour); with migrations to 055 they all pass | not fixed here, register row T1082-a |

## Screens checked

No browser run. The end check must look at the Ask trip card (stay line shows "from {price} a night" from the destination's cost, or the none text), and, for the unchanged paths, the Plan trip card and a trip page day price at phone and desktop width. The `stay.live` string was never drawn.

## What is still open

- T1082-a: the 2 and 20 stale assertions in the two admin harnesses against migrations after 055.

## Register rows to add

| T1082-a | T1082 | Update the stale assertions in test_moderation_decisions.mjs (2 fail) and test_admin_followups.mjs (20 fail) to the behaviour of migrations 052 onward (for example 062), then add them to CI | next task | open |  |

Closes: T1074-b and T1070-e (the scripts run past 056 and 060's down file passes; the remaining failures are the new row).

## Rollback procedure

`git revert` the T1082 commits. Nothing live was touched.
