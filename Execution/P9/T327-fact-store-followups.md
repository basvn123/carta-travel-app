# T327: fact store follow-ups, written as the input T147 builds on

## Task ID

T327

## Date

2026-10-03

## What changed

T147, the task that builds the volatile fact store, has not run: it sits in wave 17, which waits for the owner's stage 2 and 3 pastes. So this task does what can be done without the table and writes the rest down as the input T147 starts from. The facts migration is not written here. Its number is 049, reserved for T147; nothing under `supabase/migrations/` changed.

Two pieces of code landed. The aggregator block list moved out of `pipeline/dossier/common.py` into `supabase/functions/_shared/blocked_domains.json`, the one file both the Python sweep and the future Deno refresh job read, with a JavaScript twin of the publisher rule in `_shared/publisher.mjs` and a test that runs the same hosts through both. And `pipeline/facts/parking_fold.py` maps the parking cache to `public.facts` rows and back; run over the real cache it reproduces today's dossier parking block for 1,215 of the 1,294 records and withholds the other 79, which carry no source.

The four rows, one by one, follow. Each section ends with what T147 does with it.

### T041-d: suggest-city discoveries as store keys (option only)

`suggest-city` grounds by default and keys its cache on the stay point rounded to 0.01 degrees, the focus, the interests, the free text, the language, the grounded flag and the candidate ids (`supabase/functions/suggest-city/logic.mjs`, `cacheKeyInput`). Its answer depends on the traveller's own wish, which the prompt treats as "the main brief". That is why T041 left it on the live allowance.

The option, written so a later task can build it without redesigning: a new fact class `discovery` with a 180-day TTL, an entity per coarse cell, `cell:<lat>/<lon>` with both rounded to 0.25 degrees (roughly 28 by 18 km at 50 degrees north), and one field per focus, `discovery.city`, `discovery.nature`, `discovery.mix`. The value is a list of up to ten real places outside the catalogue with coordinates and one cited source each. The store only serves requests with an empty free-text box. Interests are not part of the key; the ungrounded call that follows picks among the catalogue candidates and the stored discoveries using the interests, so they still shape the answer without forking the store. A request with free text stays on live grounding, unchanged.

Whether it pays is a measurement, not a guess. Over N grounded suggest-city calls with an empty free-text box landing in U distinct (cell, focus) keys inside one TTL window, the store saves N minus U ground units and spends U refreshes. Build it only if the repeat share, 1 minus U over N, is at least 0.5 over a 180-day window. Below that it halves nothing, adds a refresh path, and lowers quality by dropping the interests from the search. Nothing records the inputs today: `suggest-city` writes no `ai_cache_events` row (only plan-day does, `plan-day/index.ts` around line 425) and no table holds a stay point. The measurement needs one log row per suggest-city call with the 0.25-degree cell, the focus, whether the free text was empty and whether it grounded, and no user id. That needs a table, so a migration, so a later task. Row T327-b carries it.

For T147: nothing. `discovery` is not in the class table T147 seeds, and should not be until T327-b answers.

### T041-e: the plan-day cache key folds in the facts, with one version bump

The row asks that the plan-day cache key carry the newest `fetched_at` of the facts a plan used, bumping `CACHE_KEY_VERSION` once. Reading the request path for this turned up a bug the same bump should fix.

The bug. The key carries `events: 1` for an events request (`plan-day/logic.mjs` line 649) but not whether the plan was grounded. The cache lookup runs at lines 400 to 411 of `plan-day/index.ts`; the decision to ground runs later, at line 470, and depends on the traveller's tier and allowance. So a free traveller's events request produces an ungrounded plan cached under the same key a paying traveller's identical request computes, and the paying traveller is served that ungrounded plan, without live events, for up to seven days. The reverse also happens: a free traveller can be served a paying traveller's grounded plan. No client code reads `meta.groundingSkipped` (grep over `continent-app/src`), so the harm is the plan itself, not a wrong upsell. `suggest-city` already avoids this: it reads the tier without spending (`resolveTier`, line 186) and puts `grounded` in its key (line 233). Row T327-a.

The design T147 applies, as one change under version 6:

1. `cacheKeyInput` gains `eventsSrc` and the line `events: wantEvents ? 1 : null` becomes `events: wantEvents ? eventsSrc : null`. `eventsSrc` is one of `live`, `store:<newest fetched_at among the facts used, ISO>`, or `none`. A non-events request passes nothing and `compact()` drops the member.
2. In `index.ts`, after the `plan` unit is consumed and before the hash: when `wantEvents` and `FACTS_MODE` is `serve` or `strict`, call `facts_for('dest:' + destId, 'events.')`. A hit makes the intended source `store:<ts>`. Otherwise, when grounding is enabled, the mode is not `strict`, and `resolveTier(service, user.id).groundLeft > 0`, the intended source is `live`. Otherwise it is `none`. Under `shadow` the store is read and logged but never changes the source, so shadow keys equal off keys.
3. Look up the cache under the intended source.
4. On a miss with intended `live`, consume the `ground` unit as today. If the consume loses the race, the actual source becomes `none`.
5. Write the cache row under the key of the actual source, re-hashing when it differs from the intended one. This is the line that keeps an ungrounded plan from ever landing under a `live` key.
6. `meta.groundingSkipped` is an entitlement fact, like `pass`, so on a cache hit it is recomputed for this request rather than served from the row. Two `none` requesters can have different reasons (`tier`, `cap`, `off`, and T041's new `pending`).
7. `CACHE_KEY_VERSION` goes from 5 to 6 with one line on `v`: "v6: the events member names its source (live, store at a date, or none), so a grounded and an ungrounded events plan never share a row, and a refreshed fact makes a new row." The test in `scripts/ai/test_plan_logic.mjs` that pins the constant to the key moves with it.

This fixes the bug from phase 0, with `FACTS_MODE` still `off`, because `live` and `none` already separate. The bump also orphans every v5 row; they age out on the seven-day window, as v4 did.

For T147: apply the seven steps in the same commit that reads the store. If T147 slips far, T327-a says to ship steps 1 to 7 alone with `store:` unused, and then the store adds a source value without a second bump, because `store:<ts>` is new key content, not a new shape.

### T041-f: the parking cache as fact rows, and where the block list lives

The block list. It now lives in `supabase/functions/_shared/blocked_domains.json`. It has to be under `supabase/functions` because an Edge Function bundle can only carry files from there, and `_shared/passes.mjs` set that precedent. `common.py` reads the file by path at import and keeps the name `BLOCKED_DOMAINS`, now a frozenset, so `web_sweep.py`, `research_do.py` and every `publisher()` caller are unchanged. The list is the same fourteen domains. The rule around it, `registrable` and `is_blocked` with the five-letter brand match, is mirrored in `_shared/publisher.mjs`, which imports the JSON with an import attribute (`with { type: 'json' }`, supported by Deno 2, the version `supabase/config.toml` pins). `tests/test_blocked_domains.py` runs 22 hosts and 8 URLs through both and fails on any difference. Nothing imports `publisher.mjs` yet; the refresh job is its first caller. A third grounding consumer, `Trips/carta-unified/carta-unified/pipeline/generate_trip.py`, applies no block list at all; whether it should belongs with T144-d, which T147 also owns.

The parking fold. `cache/dossier/parking_web.json` holds 1,294 records, all checked on 2026-09-15, all with `model` "claude-opus-5 (cowork, manual web research)". They came from Cowork sessions, not from a grounded Gemini call, so they carry 3,004 real publisher URLs and no Google redirect links; none of the sources is on the block list. 1,215 records have sources and 79 do not. Of the 79, 74 carry nothing but `restricted: false` and `confidence: low`. The dossier wire prints all 1,294 as `parking.web` (1,294 of the 3,869 files under `continent-app/public/dossier/`), including those 74, which tell a driver the centre is not restricted with no citation behind it.

`pipeline/facts/parking_fold.py` makes one row per record: entity `dest:<id>`, field `transport.parking`, class `transport` (90 days, so these expire on 2026-12-14). It is one row, not one per car park, because one prompt produced the record with one source list, and splitting it would claim citations it never had. The value carries `official_url`, `restricted`, `restricted_note`, `car_parks`, `park_ride_names`, `advice` and the record's own `confidence`. The columns take the rest: `source_urls` the sources, `source_url` the official URL when it is among them and otherwise the first citable source, `fetched_at` the checked date, `value_text` the advice, `queries` 0 because nothing was metered. A record with no source that counts as a publisher becomes `unsourced` with its value withheld, which is T041's status rule. `row_to_overlay()` rebuilds the `parking.web` block from a row, and `--check` compares it against `build_dossier.parking_web_overlay()` over the real file.

Three findings T147 needs. First, `parking_check.py` stores `groundingChunks[].web.uri` as its sources (line 135). On a Gemini run those are Google redirect links: `generate_trip.py` records at line 447 that the chunk URI is a redirect and the page's host is in `web.title`. T041's acceptance rule ("at least one `web.uri` not on the block list") would therefore pass every grounded answer, because the redirect host is never blocked. The refresh job must resolve each redirect (one request with `redirect: 'manual'`, read `Location`) or fall back to the host in `web.title`, store the publisher URL, and only then apply `publisher()`. Row T327-d. Second, the 1,294 records expire in the same week. At the 120-a-day cap that is eleven nights of refreshes, all inside the twice-TTL window in which a stale row is still served with its real date, so nothing goes dark. It is still the quarterly wall T041 wanted to avoid, and the steady state is about 14 parking refreshes a day (1,294 over 90 days). Third, 86 records are twins (1,208 distinct contents), like FCO and CIA for Rome, which `parking_check.py` checks once; the store keys on the dossier id, so the refresh job should group rows whose value is identical and ground once per group.

For T147: write the 1,294 rows once with a small importer that calls `record_to_row()` and upserts through PostgREST (status `ok` or `unsourced`, never `missing`, which is the one place a seeder writes a value, because these values are already sourced). Then point `build_dossier.parking_web_overlay()` at `cache/facts_snapshot.json` through `row_to_overlay()`, falling back to `parking_web.json` while the snapshot is absent. Finally retire `parking_check.py` as a writer, since the refresh job owns `transport.parking` from then on. The 79 withheld blocks are a visible change on 79 dossier pages, and the report that ships it should say so.

### T300-n: the facts migration, and the secrets it needs

The migration is not written, because T147 has not run. It is `049`, a name like `049_facts_store.sql`, and T041's DDL (in `Execution/P2/T041-per-fact-grounding-design.md`) is its body with the corrections below. Each was found by reading that DDL against migrations 001 to 048.

1. The guard function is `admin_guard`, created in `015_admin_hardening.sql` line 81, not in 014 as T041 says. `admin_guard('read')` exists from 015 on, so 049 requires 015.
2. Add `revoke all on table public.fact_refresh_totals from anon, authenticated;`. T041 enables RLS on it but revokes nothing, unlike its other three tables.
3. `fact_refresh_consume(p_cap)` inserts the day's first row with `queries = 1` whatever the cap, so a cap of 0 still allows one call. Start it with `if p_cap <= 0 then return false; end if;`.
4. Entity keys must not come from the client. `plan-day` takes `destId` from the request body (`cleanText(dest.id, 60)`, `index.ts` line 234), and T041 has it call `fact_want('dest:' + destId, ...)` on a miss. Anyone with a plan unit could then seed rows the nightly job grounds, spending the refresh budget on chosen strings and putting those strings in a prompt. Add a table `public.fact_entities (entity_key text primary key, label text not null, country text, lat double precision, lon double precision)` seeded by `seed_facts.py` from the dossier and journeys wires, and make `facts.entity_key` reference it. `fact_want` then fails for an unknown key, which plan-day already has to swallow, and the refresh prompt names the place from `label`, never from request text. Also add `check (entity_key ~ '^(dest|trip|poi|beach|lake|mountain|trail|cycling):[A-Za-z0-9:_./-]{1,80}$')`.
5. The cron block follows 044's pattern (`044_payments_quota.sql` lines 1019 to 1031): schedule when `pg_cron` and `pg_net` exist, otherwise `raise notice` with the exact `cron.schedule` statement to run later. Add a notice when `refresh_facts_url` or `refresh_facts_key` is missing from `vault.decrypted_secrets`. The command reads them at run time, so they can be created after the paste and before the first 03:00 UTC run, which is the order T147's notes give.
6. `net.http_post` returns as soon as its own timeout passes (the pg_net documentation gives a 5,000 ms default; T147 should confirm it on the installed version). The batch runs for up to 120 seconds in T041's design. So `refresh-facts` should answer 202 at once and run the batch inside `EdgeRuntime.waitUntil`, the same helper plan-day already uses for telemetry. Pass `timeout_milliseconds := 10000` explicitly.
7. Add a self-check `do` block ending in `raise notice 'facts store self-check passed'`, as 040 to 048 do. It should check that anon has no select on `public.facts` (`has_table_privilege`), that `fact_class_of('price.x')` is `price`, that `fact_refresh_consume(0)` is false, and that `facts_for` on an unknown entity returns no rows. It must write no rows.
8. The down block gains `drop table if exists public.fact_entities;` after `public.facts`, and the cron unschedule guarded as in 044's down section.

The secrets. On `refresh-facts`: `GEMINI_API_KEY` (reused), `FACTS_DAILY_CAP` (default 120), `REFRESH_FACTS_TOKEN` (new, see below), and optionally `CARTA_HEARTBEAT_URL`. On `plan-day`: `FACTS_MODE` (`off`, `shadow`, `serve`, `strict`; default `off`). In the vault: `refresh_facts_url`, holding `https://<project-ref>.supabase.co/functions/v1/refresh-facts`, and `refresh_facts_key`. T041 implies the key is the service role key. A dedicated random token is better: put the same value in `REFRESH_FACTS_TOKEN`, deploy `refresh-facts` with `verify_jwt = false`, and have the function compare the bearer token in constant time. A leak through a cron log then exposes one token that starts one batch, not the key to the whole database, and rotating it touches nothing else. Owner row T327-c, ordered after T147's paste; T041-b stays the row for creating the vault secrets.

For T147: write 049 from T041's DDL plus these eight changes.

## Files touched

**Created:**
- supabase/functions/_shared/blocked_domains.json
- supabase/functions/_shared/publisher.mjs
- pipeline/facts/parking_fold.py
- tests/test_blocked_domains.py
- tests/test_parking_fold.py
- Execution/P9/T327-fact-store-followups.md

**Modified:**
- pipeline/dossier/common.py (BLOCKED_DOMAINS read from the JSON file)
- Execution/_OPEN.md (T041-d closed; T041-e, T041-f and T300-n annotated and left open; rows T327-a to T327-e)

## Commands run

All from the worktree root `C:\Users\Gebruiker\Documents\Portfolio\wt\T327`. The cache was read, never written, from the main checkout.

```
python -m pytest tests/test_blocked_domains.py tests/test_parking_fold.py -q
python -m pytest tests -q
python pipeline/facts/parking_fold.py --check --cache "C:/Users/Gebruiker/Documents/Portfolio/Travel App/cache/dossier"
python -c "import common, web_sweep, research_do"     # from pipeline/dossier, import check
```

No migration, no deploy, no pipeline run, no database, no Gemini call, no push.

## Config and secrets set

None. The secrets 049 needs are named above and in row T327-c.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Places the block list is written (common.py, then the JSON file) | 1 inline in Python, Deno copy planned | 1 JSON file read by Python and JS | the planned copy is gone |
| Domains on the list | 14 | 14 | 0 |
| Parking records that round-trip to the same dossier block (parking_fold --check) | not measurable | 1,215 of 1,294 | n/a |
| Parking records withheld as unsourced by the fold | 0 | 79 | +79 |
| Parking records whose block would change in any other way | not measurable | 0 | n/a |
| Root tests passing, whole folder in one process | 148 | 157 | +9 (the new tests) |
| Root tests failing, whole folder in one process | 20 | 20 | 0 (pre-existing, T327-e) |

The parking counts come from `cache/dossier/parking_web.json` and `continent-app/public/dossier/` in the main checkout. The test counts come from `python -m pytest tests -q` in this worktree, before and after adding the two files.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The whole test folder in one process lost tests once the new files imported the dossier `common` | `Trips/.../pipeline` also has a module called `common`, and the first one imported stays in `sys.modules` | Both new tests import against the dossier `common`, then restore `sys.modules` and `sys.path`. The folder still fails 20 tests with or without them (T327-e) |

No screen was touched, so there was nothing to check in the browser.

## What is still open

T147 builds the store. T041-e, T041-f and T300-n stay open for it, with this report as its input. T041-d is closed: the option is written, and the measurement that would decide it is T327-b.

The plan-day cache serves grounded and ungrounded events plans across tiers today (T327-a). The fix is step 1 to 7 of the T041-e section and belongs in T147's single version bump. If wave 17 stays gated for long, a smaller task can ship it alone.

Whether a suggest-city discovery store pays needs one log row per call (cell, focus, empty free text, grounded, no user id), which needs a migration (T327-b).

When T147 has pasted 049, the owner sets `REFRESH_FACTS_TOKEN` on `refresh-facts` and stores the same value as the vault secret `refresh_facts_key`, with `refresh_facts_url` beside it (T327-c, with T041-b).

The refresh job must resolve grounding redirect links before it judges a source, or every grounded answer counts as sourced. `parking_check.py` has the same flaw and stops being a writer once the store owns parking (T327-d).

`python -m pytest tests -q` fails 20 tests in one process because of module-name collisions among the trips tests. Each file passes alone, except the golden-ratings and distribution tests, which need the app wire the sparse worktree lacks (T327-e).

## Rollback procedure

Revert the T327 commit on branch `p9-fact-store-followups`: `git revert <T327 commit>`. That restores the inline `BLOCKED_DOMAINS` in `common.py` and removes the JSON file, `publisher.mjs`, `parking_fold.py`, the two tests, this report and the register edits. Nothing else depends on the new files yet, nothing was deployed, and no data was written, so the revert is complete.
