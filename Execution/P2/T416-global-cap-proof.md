# Execution Report: T416

## Task ID

T416: prove the AI global daily cap on the live functions (owner runbook E4, row T036-b)

## Date

2026-10-09

## What changed

The global daily cap on the Carta bot is now proven on production, not only by reading the code. The owner set the Edge Function secret AI_GLOBAL_DAILY_CAP to 1 and asked plan-day for a day plan with new answers. The app showed the shared-budget refusal ("...fully used. It resets tomorrow; the built-in planner still works right now."), with Try again and Plan it myself instead, and no hiccup. That is the global_cap path of ai_consume (007) through plan-day's 429. The secret was then deleted (confirmed by `supabase secrets list`), so the cap is back to its default of 200. The first attempt did nothing: the dashboard saved the secret under the name AI_GLOBAL_DAILY_CAPValue, which the function does not read, so two plans went through on the default cap. Deleting it and re-adding the exact name fixed that.

## Files touched

**Created:**
- Execution/P2/T416-global-cap-proof.md

**Modified:**
- Execution/_OPEN.md (T036-b closed, T416-a added)

**Deleted:**
- None

## Commands run

```
npx supabase secrets list --project-ref ntssxktaduxzpsmejwyv   # names only, three times: before, with the secret, after deletion
# owner, Dashboard, Edge Functions, Secrets: add AI_GLOBAL_DAILY_CAP=1, one plan-day request, delete the secret
```

Setting the secret from this session was refused by the permission classifier (a production secret-store write), so the owner set and removed it in the dashboard.

## Config and secrets set

AI_GLOBAL_DAILY_CAP set to 1 for the test and deleted afterwards; none remains.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Global cap proven live | no | yes | |
| AI_GLOBAL_DAILY_CAP secret present | no | no | unchanged after the test |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first cap test let two plans through | The secret was saved as AI_GLOBAL_DAILY_CAPValue | Deleted and re-added under the exact name |

## What is still open

Row T416-a: the refusal names Carta twice ("Carta's shared Carta bot budget"). Row T037-b, the refund check (a failed AI call must hand the unit back), is still open and needs a test account and a database read; it is the second half of runbook E4.

## Rollback procedure

Nothing to roll back: no code, schema or lasting setting changed. If the secret is ever found set, delete it in the dashboard.
