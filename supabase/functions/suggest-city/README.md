# suggest-city, the Carta bot's "ask AI" town search

The Carta chat's town-picker step lets a traveller describe what they want
("a quiet coastal town, not touristy") and get a short list of suggested
towns back. Unlike `plan-day`, this function is explicitly allowed to look
beyond Carta's own catalogue: Google Search grounding is **on by default**,
since surfacing a real place Carta hasn't researched yet is the whole point.
Every suggestion is still re-validated server-side (`logic.mjs`): a
catalogue pick must reference a real candidate id, a web discovery needs
real, in-area coordinates.

Shares its quota ledger and cache with `plan-day` (`ai_plan_consume`,
`ai_plan_cache`, `supabase/migrations/006_ai_day_planner.sql`) - both are
already generic, so there is no separate migration for this function.

## Setup

If `plan-day` is already deployed, this function reuses the same secrets and
migration - just deploy it:

```
supabase functions deploy suggest-city
```

Otherwise follow `plan-day/README.md`'s "Zero-billing setup" first (dedicated
no-billing Google account, AI Studio key, `supabase db push` for migration
006), then deploy both functions with that same `GEMINI_API_KEY` secret.

## A note on grounding + structured output

Gemini's API does not allow combining the `google_search` tool with
`responseSchema`/`responseMimeType: application/json` in the same call
(grounding and controlled generation are mutually exclusive server-side).
So when grounding is on (the default here), `index.ts` does NOT send
`responseSchema` - instead the exact JSON shape is spelled out in the
prompt, and the reply is parsed defensively (`extractJson` in `index.ts`:
direct parse, then a fenced ` ```json ` block, then the outermost `{...}`
span). `sanitizeSuggestions()` in `logic.mjs` is the real safety net either
way: a malformed or hallucinated reply degrades to fewer (or zero)
suggestions, never bad data reaching the client.

## Tuning (optional secrets)

| Secret | Default | Meaning |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-flash-latest` | Same first rung as `plan-day`, pin if the alias moves under you. |
| `GEMINI_MODELS` | (unset) | Same fallback chain as `plan-day`, shared helper in `plan-day/logic.mjs`. |
| `AI_USER_DAILY_CAP` | `10` | Shared with `plan-day`'s cap - both spend from the same daily bucket. |
| `AI_GLOBAL_DAILY_CAP` | `200` | Same shared bucket, global side. |
| `AI_ENABLE_CITY_GROUNDING` | `true` | **Must be `false` on a free-tier key**, see below. Off, it answers from the catalogue only, with strict `responseSchema` output. |

## Grounding is not available on the free tier

The `true` default predates testing against a real unbilled key. Measured
2026-07-27: a grounded call returns `429 RESOURCE_EXHAUSTED` immediately,
while the identical ungrounded call on the same key succeeds. The AI Studio
rate-limit page shows why, Search grounding for the Gemini 3 family reads
`0 / 0`. The 2.5 family does list a 1,500/day grounding allowance, but those
models now answer 404 "no longer available to new users", so that allowance
is unreachable on a key created recently.

On a zero-billing deployment this must therefore be `false`, and the function
suggests only from Carta's own catalogue. That is a real capability loss (no
surfacing of towns Carta has not researched yet) and the only way back is
attaching billing, which is exactly what the posture exists to avoid. Left
on, every call fails and the traveller sees a generic error.

## Local test

```
supabase functions serve suggest-city --env-file supabase/.env.local
```

The pure logic (candidate/suggestion sanitizers) is testable without any
key: `node continent-app/scripts/ai/test_suggest_city_logic.mjs` from the
repo root.
