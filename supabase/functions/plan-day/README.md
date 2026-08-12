# plan-day, the AI day-planner function

Sequences a day from Carta's own POI catalogue with Gemini, then re-validates
and re-times everything server-side (`logic.mjs`). The client never sees the
AI key; guests never spend quota; identical requests answer from cache.

## Setup (billing posture CHANGED in migration 007)

The old zero-billing guarantee is retired. Google's Gemini API Additional
Terms (effective 2026-03-23) allow only Paid Services for API clients serving
the EEA/CH/UK, so `GEMINI_API_KEY` must come from a Google Cloud project WITH
an active billing account; see the header comment in `index.ts` for the exact
wording. Attaching billing is the compliance step, not a decision to spend.
What protects the wallet now: per-tier caps in `public.plan_tiers` enforced by
the `ai_consume` RPC (migration 007), the paid-tier-only grounded-search
counter, the `AI_GLOBAL_DAILY_CAP` backstop, and the answer cache.

1. Run the migrations: paste `supabase/migrations/006_ai_day_planner.sql` and
   `007_passes.sql` into the SQL editor (never `db push` against the live
   project).
2. Set the secret and deploy:

   ```
   supabase secrets set GEMINI_API_KEY=<key from the billed project>
   supabase functions deploy plan-day
   ```

Keep JWT verification ON for this function (the default): the function
rejects anonymous callers anyway, but the gateway check is a free first wall.

## Tuning (optional secrets)

| Secret | Default | Meaning |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-flash-latest` | Pin the model tried FIRST if the alias moves under you. The default fallbacks stay behind it. |
| `GEMINI_MODELS` | (unset) | Comma separated chain that replaces the default outright, e.g. `gemini-3.5-flash-lite,gemini-3.1-flash-lite`. Max 6. |
| `AI_GLOBAL_DAILY_CAP` | `200` | Generations across all users per day, the abuse backstop. The 200 default applies only when the secret is unset; setting it high effectively removes the backstop. |

Per-user caps are rows in `public.plan_tiers` (migration 007), not env vars.
The old `AI_USER_DAILY_CAP` secret is dead: no function reads it.

## The model fallback chain

Every model carries its OWN free daily request budget, so trying a second
model after the first is exhausted is not a redundancy trick, it multiplies
the ceiling. Measured on this project's key (2026-07-27):

| Rung | Model | Free requests per day | Notes |
| --- | --- | --- | --- |
| 1 | `gemini-flash-latest` (3.6 Flash today) | 20 | Best sequencing. A thinking model, ~2700 to 3850 thought tokens per day plan. |
| 2 | `gemini-3.5-flash` | 20 | Same class, separate budget. |
| 3 | `gemini-3.5-flash-lite` | 500 | Does not reason first, so plans are flatter but valid. Much faster. |
| 4 | `gemini-3.1-flash-lite` | 500 | Same shape as rung 3. |

Roughly 1,040 free generations a day combined, which is why the 200 global
cap is comfortable. The chain advances on 429 (budget spent), 404 (model
retired under a pinned config) and 5xx (Google's "high demand" 503). It stops
on any other 4xx, because a malformed request fails identically everywhere.
A timeout also stops it, so one slow model cannot hold the traveller for
minutes. When every rung is spent the traveller sees the "budget resets
tomorrow" copy, not a generic error.

Do NOT add the 2.5 family: those models answer 404 "no longer available to
new users" on keys created recently, even though they still appear in the AI
Studio rate-limit table and in `models.list`.

## The walking budget

`logic.mjs` re-times the day from real distances, and since 2026-07-27 it also
holds it to a distance a person can walk. The candidate deck reaches 20 km
from the city centre, so a model that grazed across it used to produce a real,
faithfully-timed, completely impossible day: one shipped as "About 89.4 km on
foot, done around 11:32", the clock having wrapped at midnight from 35:32.

`scheduleDay` now keeps the largest walkable CLUSTER of the stops the model
chose, in the model's own order, and reports the rest as `meta.farDropped`:

| Limit | Default | Source |
| --- | --- | --- |
| Total walking | 12 km | `profile.maxWalkKm` when the traveller answered the chat, else `DEFAULT_MAX_WALK_KM` |
| One leg | 6.5 km | `MAX_LEG_KM`, or half the day's budget when that is larger |
| Walking from the stay | 2.5 km | `STAY_WALK_MAX_KM`, mirroring the app, which draws a longer hop as a ride |

A `meta.farDropped` that stays high in the logs means the deck is offering the
model places no walking day can reach. If nothing forms a walkable cluster the
function answers `too_few` rather than selling a one-stop route.

Note `cacheKeyInput` carries `v: 3`; v2 rows hold the old impossible totals and
are never served.

## What is deliberately NOT here

- No client-side key, no `VITE_GEMINI_*` var: anything with a `VITE_` prefix
  is compiled into the public bundle.
- Grounded search rides along only for paid tiers with `groundLeft > 0`, and
  each grounded generation spends the separate `'ground'` counter: it is the
  one Gemini surface billed per search query the model chooses to run.

## Local test

```
supabase functions serve plan-day --env-file supabase/.env.local
```

with `supabase/.env.local` holding `GEMINI_API_KEY=...`. The pure logic
(2-opt route check, scheduling, sanitizers) is testable without any key:
`node continent-app/scripts/ai/test_plan_logic.mjs` from the repo root.
