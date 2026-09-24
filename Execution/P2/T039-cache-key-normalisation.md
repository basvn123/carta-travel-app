# T039: Normalise the ai_plan_cache key

## Task ID

T039

## Date

2026-09-24

## What changed

The plan-day cache key no longer forks on distinctions that nothing downstream can see, and the hit rate it produces is now recorded and shown in the admin panel instead of being unknowable.

Before this task the key was already doing the two obvious things: candidate ids were sorted, and a non-events request keyed on the month rather than the exact date. What it was not doing was normalising the human end of the request. A group of 6 and a group of 9 produced two different keys, although `buildPrompt` and `scheduleDay` both branch only on `groupSize >= 5`, so the two requests asked the model an identical question and were scheduled at an identical pace, then paid for two generations of the same day. "Paella", "paella" and "Paella!" produced three keys. A traveller who cleared the free-text box produced a different key from one who never typed in it, because an empty string was serialised as a field rather than dropped. The profile carried both `steps` and `maxWalkKm`, which the client derives from each other, so a rounding difference between two client paths was a cache fork.

All of those are now collapsed, and each one is collapsed only where the collapse is provably lossless: the band changed to 1/2/3-4/5+ because 5+ is the only threshold the prompt and the scheduler read; free text and must-include names are lower-cased and stripped of punctuation and repeated spacing; empty strings, empty arrays and absent fields all drop out of the key entirely, so absence and emptiness are the same request; and the profile keys on the kilometre figure the scheduler actually enforces rather than on the steps and the kilometres both. The key version moved to 5.

The second half is the instrumentation. Migration 029 adds `ai_cache_events`, one row per lookup carrying whether it hit, which destination was asked for, and which key version produced it. `plan-day` writes that row best-effort on every lookup, before the branch, so misses are counted as well as hits. A new admin section shows the rate, the hits, the generations bought, the fresh row count, a per-key-version split and the ten destinations that miss most.

Offline replay of the two key functions over a fixed population of request variants: 48 distinct keys before, 18 after, which is exactly one per distinct intent in that population.

## Files touched

**Root repo, created:**

- `supabase/migrations/029_cache_hit_instrumentation.sql`
- `Execution/P2/T039-cache-key-normalisation.md` (this report)

**Root repo, modified:**

- `supabase/functions/plan-day/logic.mjs`
- `supabase/functions/plan-day/index.ts`
- `Execution/_OPEN.md`

**App repo (`continent-app/`, its own git tree), created:**

- `scripts/ai/measure_cache_keys.mjs`

**App repo, modified:**

- `src/admin/AdminPage.jsx`
- `src/auth/admin.js`
- `scripts/ai/test_plan_logic.mjs`

`AdminPage.jsx` and `admin.js` are listed in the root repo as carrying uncommitted modifications. Those are T038's app-side changes, which that task committed to the nested repo only, following the convention its own commits set: the root repo carries `supabase/` and `Execution/`, the app repo carries `continent-app/`. This task did the same, so the root repo's drift on those two files is still T038's and was not swept into any commit here.

## Commands run

Root repo:

```
git checkout -b p2-cache-key-normalisation
git add supabase/functions/plan-day/logic.mjs supabase/functions/plan-day/index.ts supabase/migrations/029_cache_hit_instrumentation.sql
git commit -m "T039: Normalise the plan-day cache key and instrument the hit rate"
```

App repo:

```
git checkout -b p2-cache-key-normalisation
git add src/admin/AdminPage.jsx src/auth/admin.js scripts/ai/test_plan_logic.mjs scripts/ai/measure_cache_keys.mjs
git commit -m "T039: Surface the cache hit rate and measure the key normalisation"
```

Verification, from `continent-app/`:

```
node scripts/ai/test_plan_logic.mjs
node scripts/ai/measure_cache_keys.mjs
node scripts/ai/test_import_logic.mjs
npm run build
npx esbuild ../supabase/functions/plan-day/index.ts --target=es2022 --format=esm --outfile=/dev/null
```

## Config and secrets set

None. No credentials, no keys, no Supabase secrets. Migration 029 is written but not applied; applying it is a user row in the register, as 022 and 025 through 028 already are.

## Before/after measurements

Measured offline by `scripts/ai/measure_cache_keys.mjs`, which reads the shipped old `cacheKeyInput` out of git rather than keeping a copy of it, so the comparison cannot drift from what actually ran. The population is the cross product of five axes along which real requests differ: group size, free-text spelling, deck order, date within a month, and the must-include channel.

| Metric | Before | After | Delta |
|---|---|---|---|
| Requests in the population | 1,120 | 1,120 | 0 |
| Distinct intents among them | 18 | 18 | 0 |
| Distinct cache keys | 48 | 18 | -30 (-62.5%) |
| Keys per distinct intent | 2.67 | 1.00 | -1.67 |
| Ceiling hit rate over the population | 95.7% | 98.4% | +2.7pp |
| Checks in test_plan_logic.mjs | 49 | 90 | +41 |

Per axis, with everything else held fixed, distinct keys before and after: group size 4 to 3 over 7 sizes, free text 4 to 3 over 8 spellings, must-include 3 to 2 over 5 shapes. Deck order and date-within-month were already collapsed and stayed at 1.

Two things about these numbers matter more than their size.

The headline is "48 keys become 18", not the percentage. The ceiling hit rate figure is high in both columns only because the population repeats each intent many times over, which flatters both sides equally; it is reported because it is the arithmetic the live rate is a version of, not because 98.4% is a forecast. What is directly comparable is keys per intent, which was 2.67 and is now exactly 1: in this population every remaining fork is a real difference in the question.

Nothing here is the live hit rate. That is a property of real traffic against a deployed function and cannot be measured from a session with no database access and no deploy rights. The offline figure is an upper bound: real traffic is not uniform, the cache expires after seven days, and a key nobody ever asks twice never hits however well it is normalised. The live figure becomes readable in the admin panel once 029 is applied and plan-day is redeployed, and that is registered as a user row.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `cache key: group band 5-6 vs 7+ differ` failed | The test asserted the exact fork this task removes | Replaced with five checks that pin the new band: 6 equals 7, 5 equals 20, 4 differs from 5, 3 equals 4, 1 differs from 2 |
| The first measurement reported a 95.7% baseline | The cross-product population repeats intents, so both rates were near-saturated and the real effect was invisible | Added a per-intent count so the headline is keys per intent (2.67 to 1.00) rather than a flattered rate |

## What is still open

Migration 029 is not applied. Nothing is recorded until it is, and the admin section renders nothing rather than zeroes because the RPC returns an error the panel treats as "no section". User row.

Plan-day must be redeployed after 029 is applied, or the function will keep running the v4 key and writing no events. This is also what makes the live before-and-after impossible to take: the pre-change key was never instrumented, so there is no v4 row in `ai_cache_events` to compare v5 against. The per-version split in the report exists for the next key change, which will have a baseline; this one will not. If a genuine live baseline matters more than the saving, the honest route is to apply 029, redeploy with `CACHE_KEY_VERSION` temporarily held at 4 and the old key restored, collect a week, then ship v5. That costs a week of the saving to buy a number, which is why it was not done by default. User decision.

The version bump to 5 makes every existing cached row unreachable. That is not a correctness problem, the rows would simply never be found under a hash nothing computes any more, and they age out on the seven-day window. It does mean the first week after the redeploy shows a hit rate depressed by a cold cache, and reading that week as evidence the normalisation failed would be wrong.

`ai_cache_events` has no pruning job. At this project's volumes that is thousands of rows a year and not worth a scheduled task; the prune statement is written into the migration as a comment for whoever eventually needs it. Not registered, because it is a note rather than work.

The SQL in 029 was never executed. The local Postgres on 5432 rejects every credential available to a session, which T036-c already records, so the migration was checked by reading and by balancing its quoting and parentheses, not by running it. It follows the shape of 028 closely, which is the mitigation, not a guarantee. Registered, because a syntax error would be found by the user at paste time rather than here.

The admin section is not internationalised. It is owner-only and the model-fallback section beside it is written the same way, so this matches the local convention rather than breaking one. Noted, not registered.

## Rollback procedure

Both commits are on `p2-cache-key-normalisation` in their own repo and each reverts on its own.

Root repo:

```
git revert d59d9ff50
```

App repo (`continent-app/`):

```
git revert 9a29f43
```

Reverting the root commit restores the v4 key, which means cache rows written under v5 become unreachable in exactly the way v4's rows are now. No data is lost and nothing serves a wrong plan; the cache simply goes cold again for seven days.

If 029 was already applied, its down section runs in the SQL editor:

```
drop function if exists public.admin_ai_cache_report(int);
drop table if exists public.ai_cache_events;
```

Dropping the table discards the recorded hit rate history, which is the one thing here that is not recoverable. If the intent is only to stop the logging, revert the function and leave the table.

---

## Notes for the maintainer

The rule that governs every collapse in this key is worth stating plainly, because the next person to touch it will be tempted to go further: a distinction may be removed from the key only when the prompt and the scheduler cannot see it either. That is what makes this a normalisation rather than a quality trade. The group band is the clearest case. It looks like a judgement call about how similar two groups are, and it is not: `buildPrompt` emits the large-group note at `groupSize >= 5` and `scheduleDay` drops the walking speed at `groupSize >= 5`, so a party of 6 and a party of 9 were receiving the identical prompt and the identical schedule. Keying them apart bought nothing and cost a generation. If someone later adds a branch at, say, 10, the band has to gain a rung in the same commit.

The same rule is why the exact date survives in events mode and the month survives everywhere else. An events request genuinely reads the day; a normal one cannot see it at all.

`compact()` drops null, empty string and empty array, and sorts the keys it keeps. The sort is not cosmetic. The key is a JSON string and JSON preserves insertion order, so without it the same fields arriving in a different order would produce a different string and a different hash, which would have reintroduced exactly the class of bug this task removed.

The version lives in `CACHE_KEY_VERSION`, is exported, and is asserted by a test to be the same number the key actually carries. That pairing exists because `index.ts` logs the version beside every lookup: if the constant and the key drift, the admin panel attributes a hit rate to the wrong key, which is worse than reporting none. Bump it whenever the key or the payload shape changes, and add a line to the comment on `v` saying what the bump meant, as the previous three bumps do.

The cache event is written before the hit branch and deliberately without `await`. Before the branch, because a rate needs the misses and a miss has no cache row to hang a counter on, which is also why this is an event table and not a column on `ai_plan_cache`. Without `await`, because the traveller should not wait on telemetry; the promise carries a no-op rejection handler so a failed insert cannot surface as an unhandled rejection in the function log.

There is no `user_id` on the event. The row would otherwise be a per-user record of which cities somebody planned, which is not needed to compute a rate. `dest_id` is kept because "which destinations miss" is the question that tells you where to look next, and it identifies a city rather than a person.

`measure_cache_keys.mjs` reads the old key function out of git with `git show` rather than keeping a copy. This is the part most likely to be undone by someone tidying up, so: a copied-in baseline silently stops being the baseline the moment the original changes, and a measurement that quietly compares against the wrong thing is worse than no measurement. The default revision is the branch this work came off. The script exits non-zero if the new key collapses nothing, so it fails rather than printing a cheerful zero.
