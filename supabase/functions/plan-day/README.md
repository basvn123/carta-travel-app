# plan-day, the AI day-planner function

Sequences a day from Carta's own POI catalogue with Gemini, then re-validates
and re-times everything server-side (`logic.mjs`). The client never sees the
AI key; guests never spend quota; identical requests answer from cache.

## Zero-billing setup (do these in order)

1. Create a **dedicated Google account** for this prototype (not your main
   one). Never attach a billing account or card to it, anywhere. This is the
   entire guarantee: with no payment instrument on file, running out of free
   quota returns errors, never charges.
2. In [Google AI Studio](https://aistudio.google.com) with that account,
   create an API key. Do NOT "upgrade", do NOT enable billing when prompted.
   Attaching billing to the underlying Cloud project permanently removes the
   free tier there and makes every call billable from the first token.
3. Run the migration: `supabase db push` (or paste
   `supabase/migrations/006_ai_day_planner.sql` into the SQL editor).
4. Set the secret and deploy:

   ```
   supabase secrets set GEMINI_API_KEY=<your AI Studio key>
   supabase functions deploy plan-day
   ```

Keep JWT verification ON for this function (the default): the function
rejects anonymous callers anyway, but the gateway check is a free first wall.

## Tuning (optional secrets)

| Secret | Default | Meaning |
| --- | --- | --- |
| `GEMINI_MODEL` | `gemini-flash-latest` | Pin a specific Flash model if the alias moves under you. |
| `AI_USER_DAILY_CAP` | `10` | Generations per signed-in user per day. |
| `AI_GLOBAL_DAILY_CAP` | `200` | Generations across all users per day. Keep well under Google's free-tier requests-per-day for the chosen model (some models dropped to 250/day after the December 2025 quota cuts). |

## What is deliberately NOT here

- No Google Search grounding and no other tools in the request: grounding is
  the one Gemini feature that can bill past its free allowance, so the tool
  simply never rides along.
- No client-side key, no `VITE_GEMINI_*` var: anything with a `VITE_` prefix
  is compiled into the public bundle.

## Local test

```
supabase functions serve plan-day --env-file supabase/.env.local
```

with `supabase/.env.local` holding `GEMINI_API_KEY=...`. The pure logic
(2-opt route check, scheduling, sanitizers) is testable without any key:
`node continent-app/scripts/ai/test_plan_logic.mjs` from the repo root.
