# T082 Schema contract in CI, frontend to backend

## Task ID

T082 (mind-map number T324)

## Date

2026-10-03

## What changed

There is now one contract gate that covers the three places a field name can drift apart, and a GitHub workflow that runs it. The gate is still `continent-app/scripts/ci/check-contract.mjs`, the script T029 wrote and T267 extended to the split wires; this task built on it rather than beside it, so `npm run ci:contract` and the new workflow run the same code.

The first new half pins the whole top level of the wire to `docs/SCHEMA.md`. Until now the gate checked six meta keys and seven destination fields, which is what the boot path cannot live without. A layer renamed by the pipeline (climate arriving as weather) left all of those in place and passed, and the app quietly stopped showing the layer. SCHEMA.md now ends with a "Wire contract" table listing all 41 meta keys and all 40 destination keys the shipped payload carries, each destination key marked `every` or `some`. The gate parses that table and checks the payload against it both ways: a key the table does not list fails, a listed key the payload lacks fails. It also checks that the version in SCHEMA.md's header equals `EXPECTED_SCHEMA_VERSION` in `contract.mjs`, the drift T029 found by hand (the header said 15 while 17 shipped). The table lives in the document rather than in code on purpose: the document becomes the contract, and there is no second copy of the key list to rot.

The second new half is frontend to database. The app reaches Supabase through `.from('table')` chains, `.rpc('fn', { args })`, `functions.invoke('name')` and one raw keepalive POST to `/rest/v1/rpc/paywall_event`. PostgREST resolves all of those by name at request time, so a renamed column, a renamed rpc argument, a dropped function or a revoked grant used to be a 400 or a 404 in a traveller's browser and nothing at build time. The gate now reads every call site out of `continent-app/src` and `supabase/functions` statically (105 in the app, 14 in the Edge Functions) and checks them against the catalogue that `supabase/schema.sql` plus all 47 numbered migrations build in a throwaway Postgres: the table exists, every column named in a select, filter, order or payload exists, the function exists and the named arguments fit one of its signatures with every required argument supplied, the Edge Function folder exists, and for the app's own calls anon or authenticated holds the grant the call needs, column grants included.

Both halves prove themselves the way T029's did. The gate seeds known breaks and fails if one is accepted: 8 on the fixture (2 new), 3 new ones on the real catalogue, 8 on the split wires (7 in CI), and 9 new ones on the database. A break counts as rejected only when it adds a problem the unbroken state does not already have. The workflow's last step then runs the whole gate with one wire break and one database break seeded and requires a non-zero exit.

## How it works, for whoever maintains it

The extractor in `contract.mjs` is a small scanner, not a parser. It blanks comments (keeping strings, template literals and regex literals) so a call written in a comment is never read, then finds `.from(`, `.rpc(`, `functions.invoke(` and `/rest/v1/rpc/`, walks the method chain after each `.from()`, and reads string literals, select strings (embedded resources, aliases, casts, JSON paths), filter strings in `.or()`, object literal keys (shorthand, quoted and spread of a same-file const), a const in the same file (a string, an array of strings joined, an object literal, an object grown by `row.key =` assignments, or the object returned by `list.map((x) => ({ ... }))`), and a local wrapper that forwards its first parameter to `.rpc()` (the `call()` in `src/auth/admin.js`), whose literal call sites it then follows. A `.from()` or `.rpc()` on the client whose name is not a literal and not a followed wrapper fails the gate, so a dynamic call cannot slip past by being dynamic. What it cannot read is printed as a NOTE and checked by name only; today that list is empty. The receivers it treats as a Supabase client are names ending in supabase, client, sb, admin, db or service (`CLIENT_RECEIVER`); a new client variable with another name would be missed, and the floors below would not notice one missed file.

Floors pair every walk, per the vacuous-gate rule: at least 30 app table chains, 50 rpc calls, 3 invocations, 10 Edge Function calls, 4 Edge Function folders, 30 relations and 60 functions in the catalogue, 10 meta and 20 destination keys in the SCHEMA.md table. The counts today are 38, 63, 4, 14, 5, 42 and 121 (printed by the gate itself), and 41 and 40.

The grant check counts a grant to either API role, because the source does not say whether a call runs signed in. It knows column grants: 039 grants SELECT on named columns of `moderation_statements` and 043 does the same for `content_overrides`, so a chain passes when every column it reads is granted, and `select('*')` or a bare `select()` on such a table fails. Row level security is not judged here; `test_rls_policies.mjs` does that.

The database half needs a server. With `PGPORT` set it creates `carta_t082_contract`, applies the Supabase stubs (copied from `test_rls_policies.mjs`, which runs on import and cannot be imported from), then `schema.sql`, then 002 onward in numeric order, reads the catalogue with one query and drops the database. Without `PGPORT` it prints SKIP and the gate still passes, which is right for a laptop running `npm run ci`. With `CI` set, as GitHub sets it, a skip is a failure. `schema.sql` matters: it creates `saved_trips` and `user_settings`, which `src/auth/tripStorage.js` still reads and writes, and no numbered migration does (002's header says "after schema.sql").

A git checkout has `public/app_data.json`, `fares/` and `country_insights.json` but not `boot.json`, `dest/` or `poi/`, which are generated and served from R2. `CARTA_CONTRACT_DERIVE_SPLIT=1` builds the boot index and the country files in memory with the app's own `splitCatalogue()`, proves `mergeCatalogue()` gives back every destination, and checks them. The POI shards cannot be rebuilt from the tracked wire (it ships with `items_full` stripped), so in CI they are not checked and the gate says so on a NOTE line; they are still checked by any local run where `npm run data` has produced them.

## Files touched

**Created (repo root):**
- `.github/workflows/schema-contract.yml`, the workflow.
- `Execution/P4/T082-schema-contract-ci.md`, this report.

**Modified (repo root):**
- `docs/SCHEMA.md`, a header note that CI reads the file, and the "Wire contract, checked in CI (T082)" section with its table at the end.
- `Execution/_OPEN.md`, rows T082-a to T082-f.

**Modified (app, `continent-app/`):**
- `scripts/ci/contract.mjs`, `validateAppData()` takes the parsed contract; new `parseSchemaContract()`, the extractor (`stripComments`, `parseSelect`, `extractSupabaseCalls`), `CATALOGUE_SQL`, `normaliseCatalogue()`, `validateDbContract()`; `validateSplitWires()` takes a `poiMin` option.
- `scripts/ci/check-contract.mjs`, the SCHEMA.md section, derive mode, the catalogue breaks, the database half and its breaks.

**Not touched:** `package.json` (the `ci` script is off limits this wave, and `ci:contract` already runs the gate), `continent-app/src`, `supabase/`, the existing workflows, `scripts/admin/test_rls_policies.mjs`, the fixture.

## Commands run

```bash
# throwaway cluster for the database half (session port 55445)
initdb -D <scratch>/pgdata -U postgres --auth=trust -E UTF8
pg_ctl -D <scratch>/pgdata -o "-p 55445" -l <scratch>/pg.log start

# before: five realistic renames against the old validator (scratch/before.mjs)
node before.mjs

# the gate, in the app worktree, without and with the database
CARTA_REPO_ROOT=C:/Users/Gebruiker/Documents/Portfolio/wt/T082 node scripts/ci/check-contract.mjs
CARTA_REPO_ROOT=C:/Users/Gebruiker/Documents/Portfolio/wt/T082 PGPORT=55445 PGHOST=127.0.0.1 PGUSER=postgres node scripts/ci/check-contract.mjs
CARTA_REPO_ROOT=C:/Users/Gebruiker/Documents/Portfolio/wt/T082 npm run ci:contract
npx eslint scripts/ci --no-ignore
npm run test

# CI rehearsal: a scratch copy laid out like the workflow's sparse checkout
# (the wire from `git archive 56ede22c4`, docs, supabase, src, scripts/ci),
# run with CI=true and CARTA_CONTRACT_DERIVE_SPLIT=1, one break at a time
bash rehearse.sh

pg_ctl -D <scratch>/pgdata stop
```

`rehearse.sh` made each break in the scratch copy only: a `049_t082_break.sql` renaming `trip_plans.label`, one renaming `find_profile_by_handle`, one revoking execute on `export_user_data`; an edit of the insert in `src/auth/tripPlanStorage.js` writing `title` for `label`; the `climate` row deleted from SCHEMA.md; `PGPORT` unset; the two seeds the workflow uses; then a clean run again. No worktree file was broken at any point.

## Config and secrets set

No secrets. Environment variables the gate reads, all optional:

`PGHOST`, `PGPORT`, `PGUSER` (and `PGPASSWORD` if the server is not trust auth) turn the database half on; the workflow sets 127.0.0.1, 55437, postgres. `CI` makes a skipped database half a failure. `CARTA_CONTRACT_DERIVE_SPLIT=1` builds the boot index and country files in memory when `public/boot.json` is absent; the workflow sets it. `CARTA_REPO_ROOT` names the root checkout when continent-app is a sibling worktree. `CARTA_MIGRATIONS` and `CARTA_BASE_SCHEMA` point at another migrations folder or base schema, which is how a broken migration can be tried without editing the real one. `CARTA_CI_SEED_BREAK` now also accepts `destination-field-renamed`, `meta-field-undocumented`, `destination-layer-dropped`, `optional-layer-vanished`, `meta-block-dropped` and the nine `db-*`, `client-column-typo` and `edge-function-missing` names; a database seed with the database half skipped fails instead of passing.

The service container in the workflow listens on 55437, beside admin-rpc-security on 55435 and rls-policies on 55436.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| GitHub workflows that run the contract gate | 0 (`npm run ci` only) | 1 (`schema-contract`) | +1 |
| Realistic wire renames rejected (climate to weather, rating dropped, meta.car_model renamed, an undocumented field, city_lat to centre_lat) | 0 of 5 | 5 of 5 | +5 |
| Top-level wire keys pinned | 6 meta, 7 destination | 41 meta, 40 destination | +35, +33 |
| Wire keys listed in SCHEMA.md | 24 of 41 meta, 28 of 40 destination | 41 of 41, 40 of 40 | +17, +12 |
| Supabase call sites checked against the schema | 0 | 119 (app 38 chains, 63 rpc, 4 invoke; Edge Functions 14) | +119 |
| Seeded breaks the gate must reject | 14 (6 payload, 8 split wire) | 28 (8 payload, 3 catalogue, 8 split wire, 9 database); 27 in CI | +14 |
| Deliberate breaks in the CI rehearsal that failed the gate | n/a | 8 of 8 (3 migrations, 1 frontend, 1 SCHEMA.md, no database, 2 seeds) | n/a |
| `check-contract.mjs` wall time, no database | 0.9 s | 2.1 s | +1.2 s |
| `check-contract.mjs` wall time, with the database | n/a | 14 s locally; 28 s for the CI-shaped rehearsal run | n/a |

The before figures for the five renames come from `before.mjs` against the T267 validator; the after figures from the same five edits against the new one (`after.mjs`), both on `public/app_data.json` (3,868 destinations, schema_version 17). The SCHEMA.md "before" counts are the keys named anywhere in the file before this task, by reading it and grepping each key at 56ede22c4; the 12 destination keys and 17 meta keys it did not name are the rows now marked "not yet described".

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A first heredoc append to `contract.mjs` aborted and the scratch extractor lost its backslashes | Git Bash heredocs in this environment eat backslashes and quotes (known, memory) | Wrote the block with the Write tool into scratch and appended it with `cat`; checked the escapes survived |
| The Edge Functions showed 0 table chains | Their client is named `service`, not matched by the receiver rule | Added `service` to `CLIENT_RECEIVER` |
| `profiles.update(row)` read one key, `trip_plan_stops.insert(rows)` and `admin_set_override({ ...args, p_country })` read none | The payload objects are built by assignment, by `.map()` and by a spread | `keysOf` follows `row.key =` assignments and `list.map(() => ({ ... }))`; `objectKeys` expands a spread of a same-file const. Unresolved list is now empty |
| The first database run reported `saved_trips` and `user_settings` as missing | They come from `supabase/schema.sql`, the base the numbered files build on, which the gate did not apply | Apply `schema.sql` before 002. `test_rls_policies.mjs` has the same gap (T082-b) |
| The first database run said nobody may read `moderation_statements` or `content_overrides` | 039 and 043 revoke the table-wide SELECT and grant named columns back; `has_table_privilege` is then false | The catalogue carries column grants (`has_column_privilege`) and a chain passes when every column it reads is granted |
| With those 7 false problems present, every database break looked rejected | A break counted as rejected whenever any problem appeared | Breaks are measured against the unbroken baseline, for the catalogue breaks too |
| `db-select-revoked` would have passed once column grants counted | It revoked the table grant only, and the column grants still admitted the read | The break revokes the column grants on `trip_shares` as well |

No real disagreement between the app and the database was found: once the gate itself was right, all 119 call sites fit the catalogue.

## What is still open

The workflow has never run on GitHub, because nothing is pushed. The first run happens when the owner pushes main. It should be green, and the last step should print two "the gate failed, as it must" lines; if the service container or the apt step behaves differently from the rehearsal, the job log says where (T082-a).

`test_rls_policies.mjs` applies 002 onward but not `supabase/schema.sql`, so `saved_trips` and `user_settings`, which `src/auth/tripStorage.js` reads and writes, have no isolation fixture and their policies are not tested. The rls job would also have to apply the base schema first (T082-b).

The SCHEMA.md table names every top-level key, but 12 destination keys and 17 meta keys are marked "not yet described": the table holds them to the contract without explaining them. The "Served data split" section still names `public/activities_full.json`, which the POI shards replaced (see the header of `scripts/sync-data.mjs`). A docs task should write the missing sections (T082-c).

Only the top level is pinned. A key renamed inside a block the app reads (`rating.score`, `costs.meal_mid_eur`, `accommodation.tiers`) still passes. The same table approach extends to second-level keys of the blocks the app dereferences, one table per block (T082-d).

The Supabase stub SQL now exists twice, in `test_rls_policies.mjs` and in `check-contract.mjs`. If a migration starts needing more of Supabase, both copies need it. A shared module imported by both, and by `test_admin_rpc_security.mjs`, needs a task allowed to create it and to touch all three files (T082-e).

The POI shards are not checked in CI, because they are not in git. They are checked wherever `npm run data` has run. Deciding whether CI should read a sample from the data host instead is an owner call, since that would make the job depend on production being up (T082-f).

## Rollback procedure

The two repositories revert independently.

App repository, branch `p4-schema-contract-ci`:

```bash
git -C continent-app revert dd828a9
```

That restores the T267 gate. Nothing else reads the new exports; `npm run ci` keeps working either way.

Root repository, branch `p4-schema-contract-ci`:

```bash
git revert 0edd858bd 98c59c7f1   # the five Described cells, then the workflow and the SCHEMA.md table
git revert <report commit>  # this report and the register rows, if wanted
```

Reverting the root commit while keeping the app commit makes the gate fail with "docs/SCHEMA.md has no Wire contract section", so revert both or neither. Nothing was written to a database other than the throwaway `carta_t082_contract`, which the gate drops itself, nothing in `public/` was written, and no migration was added.
