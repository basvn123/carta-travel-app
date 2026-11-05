# T1069: threat model (ROADMAP C1)

## Date

2026-11-05

## What changed

Carta has a threat model for the first time: `docs/security/threat-model.md` walks eleven surfaces (static app on Cloudflare Pages, Pages Functions, the R2 data host, Supabase Auth, the database and its row policies, the Edge Functions, Stripe, the upload path, the Hetzner build box, GitHub and CI, and the admin surfaces) with a small data flow, the assets, the trust boundaries, STRIDE threats rated for likelihood and impact, the control that exists today with the file that holds it, the test that proves it (or "none yet") and the gap. It ends with fifteen ranked gaps, each mapped to a ROADMAP item. Every Dashboard setting (Supabase Auth, Cloudflare, Stripe, GitHub branch protection) is marked "not verified", because this task read no Dashboard. Measuring the database posture on a local Postgres 18 found that both security workflows (`rls-policies`, `admin-rpc-security`) had been red since 055 for a loader fault, not a policy fault: they applied each `_down.sql` straight after its migration and never applied `supabase/schema.sql`. With the loaders corrected (committed by T1070) the admin surface passes 211 of 211 and the row policy suite 413 of 415; the two failures are 19 tables without an isolation fixture and 28 policies whose helper functions `anon` cannot execute. Surfaces modelled went from 0 to 11, ranked gaps from 0 to 15.

## Files touched

Created:
- `docs/security/threat-model.md`
- `Execution/P15/T1069-threat-model.md`

## Commands run

```
# throwaway cluster, scratchpad only
initdb -D pgdata -U postgres --auth=trust -E UTF8
pg_ctl -D pgdata -o "-p 55470" start
PGPORT=55470 node continent-app/scripts/admin/test_admin_rpc_security.mjs
PGPORT=55470 node continent-app/scripts/admin/test_rls_policies.mjs
```

Plus greps over `supabase/`, `continent-app/functions/`, `continent-app/workers/`, `continent-app/public/_headers`, `infra/hetzner/` and `.github/workflows/` for each claim.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Surfaces with a STRIDE model | 0 | 11 | +11 |
| Ranked gaps mapped to a ROADMAP item | 0 | 15 | +15 |
| `admin-rpc-security` locally, loaders as committed | aborts at 056 (53 of 56) | n/a | |
| `admin-rpc-security` locally, loaders corrected | | 211 of 211 | |
| `rls-policies` locally, loaders as committed | aborts at 056 (52 of 54) | n/a | |
| `rls-policies` locally, loaders corrected | | 413 of 415 | |
| GitHub Actions uses pinned to a SHA | 4 of 31 | 4 of 31 (measured only) | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Both security workflows abort at 056 | Their loaders take every `NNN_*.sql`, so each `NNN_*_down.sql` (055 on) runs right after its migration; and neither applies `supabase/schema.sql`, which alone creates `user_settings` that 056 joins | Fixed in T1070 (that task extends both scripts); recorded here as a finding |

## Screens checked

None: a document only.

## What is still open

The ranked table in the threat model is the open list; each row maps to a ROADMAP item that already exists (C2 to C10, T333-a), so no new register row is needed for those. Two findings have no row yet:

- The 19 tables without an isolation fixture and the 28 policies uncallable by `anon` (rank 4). T1070 lists them in the RLS test as known entries so the gate goes green and fails the day one is fixed; the work to fix them is T1070-c and T1070-d.
- The Dashboard settings marked "not verified" (rank 2) are listed as owner steps by T1071 in `Execution/P15/_OPEN-auth-settings.md`.

### Register rows to add

None for this task (the two findings are carried by T1070 and T1071 rows).

## Rollback procedure

`git revert` of the T1069 commit. Nothing else depends on the file.
