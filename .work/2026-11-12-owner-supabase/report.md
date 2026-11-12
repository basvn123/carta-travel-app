# Run report: owner sweep, supabase lane

- **Status:** done. Waiting on the orchestrator for the migration and secret writes, which this session's permission guard refused.
- **Date:** 2026-11-12
- **Level and playbook:** L2 · deep-task (lane of the 2026-11-12 owner sweep)
- **Run folder:** `.work/2026-11-12-owner-supabase/`
- **ROADMAP:** A3, C3, C4, E4, I2

## Summary
The lane checked all 29 walkthrough steps and every step in the five Supabase owner files against the live project Carta (`ntssxktaduxzpsmejwyv`).
- All ten Edge Functions are deployed and smoke-tested.
- Auth settings are read back and verified.
- Four decisions were made.
- The five owner files are cut down to what is still open.

Migrations 063 to 074 and the generated shared secrets could not be written. The session's permission guard refused both ("Production Deploy", "Secret-Store Writes"), and they were not worked around. They are one exact handoff in `docs/owner/supabase-migrations.md` steps 1 and 2.

## What was asked
Close every Supabase owner step Claude can close (the owner's 2026-11-12 permission), decide the decision steps, and leave only truly human steps, short and exact. Rules: `lane-brief-common.md`.

## What we did
1. **Intake:** read the live state through the Management API (read-only SQL, auth config, function list, secret names).
   - Migrations up to 062 are live; 063 to 074 are not.
   - Vault is empty.
   - Only plan-day, suggest-city and parse-booking were deployed.
2. **Explore:** two explorers wrote `explore-migrations.md` and `explore-functions.md`.
3. **Decide:** `decision.md`. No proposers: the work was applying written code, and the choices were per step.
4. **Build:**
   - Dumped the schema and public data with pg_dump 18 through a 5-minute CLI login role (`dump/`, local only, git-ignored).
   - The migration loop was refused before it ran; nothing was applied.
   - Deployed the ten functions.
   - Setting the secrets was refused.
   - Rewrote the owner files.
5. **Verify:** smoke calls, catalogue queries and the docs checks.
   - Judge 1 failed the work on one unsafe handed-off command: re-running all of 061 would have dropped 062's MFA check from the upload read policy. It also flagged wrong sender and rate-limit lines and stale docs.
   - All of these are fixed. The handoff now runs only the cron blocks of 060 and 061.

Skipped: diverge and proposers (no competing designs); a second judge (the fixes were exactly the listed lines).

## Live-system changes
| Change | Undo |
|---|---|
| Deployed for the first time: billing, checkout, notify, price-alerts, stripe-webhook, upload-scan, waitlist. stripe-webhook, notify, price-alerts, upload-scan and waitlist run without the JWT check. | `supabase functions delete <name> --project-ref ntssxktaduxzpsmejwyv`. Without keys they answer "not configured" and send or charge nothing. |
| Redeployed from this branch's `main` base: plan-day (v17 to v18), parse-booking, suggest-city. Same code as `main` on 2026-11-07, plus the T1211 security-event logging and T1215 booking-place linking that were already in `main` | `git checkout prod-2026-09 -- supabase/functions` in a scratch worktree, then `supabase functions deploy <name>` |
| Created and dropped temporary `cli_login_postgres` login roles (Supabase-managed, 5-minute TTL) for pg_dump | none needed |

Smoke results (2026-11-12, no side effects):
- waitlist: 200 `unavailable`
- notify: 200 `not_configured`
- price-alerts: 200 `off`
- stripe-webhook: 503 "not configured"
- upload-scan: 503 `not_configured`
- billing and checkout: 503 `no_stripe`
- plan-day, parse-booking and suggest-city: 401 `auth` with the anon key
- checkout OPTIONS: 204

No DB schema, data, secret, Vault or Auth setting was changed.

## Decisions
- **064 timing:** apply it together with the orchestrator's ship of `main`. It drops the old admin signatures, so the live `prod-2026-09` admin page loses suspend, delete and set tier until the new app is live.
- **T1164-j:** keep the email OTP expiry at 3600 s. Session limits are Pro-only, and the project stays on Free until launch (I2).
- **T460-d:** keep EUR 14.99 and the 40/120 search ceilings, per the cost floor in `pricing.js`.
- **T461-e:** use Stripe's cancellation email first; the billing function sends one only if Stripe has none.
- **T1139-c:** Langfuse export stays off until Langfuse runs on the box.

## Ledger
`ledger.json`, 56 entries:

| Outcome | Count |
|---|---|
| handoff | 20 |
| human | 18 |
| already-done | 6 |
| obsolete | 6 |
| decided | 4 |
| done | 2 |

## Files changed
| File | Change |
|---|---|
| `docs/owner/supabase-migrations.md` | Rewritten: the live state, then 4 steps. The migration and secret commands are exact. |
| `docs/owner/auth-settings.md` | Rewritten around the 2026-11-12 API read-back; one human step (MFA on the Supabase account) |
| `docs/owner/stripe.md` | Merged into 5 steps; T460-d and T461-e decided |
| `docs/owner/pass-subscription.md` | 053 and the deploys removed (done) |
| `docs/owner/uploads.md` | Steps 1 to 4 removed (done); the secret and schedule point to the migrations file |
| `docs/owner/README.md` | Counts: migrations 4, stripe 5 |
| `ROADMAP.md` | C4: live search_path check, the advisor follow-up and T068-c. E4: the Langfuse decision. |
| `docs/HANDBOOK.md`, `docs/security/threat-model.md` | Stale "062 not applied", notify, upload and auth-gap lines brought to the live state |

## Checks
- `check_entry_points.py`: only the 4 `continent-app/public` paths are missing, which is expected in this sparse worktree.
- `drift.py`: the same 4 paths, plus a `docs/SCHEMA.md` wire-table drift in a file this lane did not touch.
- No app or Python code changed, so `npm test` and pytest were not needed.

## Handoffs
- **Orchestrator:**
  - Run `docs/owner/supabase-migrations.md` step 1 (migrations, same day as the ship) and step 2 (the four secrets, the Vault secrets, and only the cron blocks of 060 and 061), or let a session with that permission run them.
  - Before 069, take a data dump: its retention job deletes rows one way.
- **Box:** `PRICE_ALERTS_BOX_SECRET` and `PRICE_ALERTS_URL` on the box, set together with the Supabase secret.
- **Deploy:** drop the obsolete or duplicate rows T532-a, T327-c and T944-b in `docs/owner/cloudflare.md`.
- **Unsorted:** drop T1164-j, T1087-c and T1139-c in `docs/owner/unsorted.md`; they are decided or done here.

## How to undo
`git revert` the lane's commits for the docs. For the function deploys, see the table above.

## Learned
- The Management API query endpoint and `supabase db query --linked` run SQL as postgres without the DB password.
- pg_dump works through `POST /v1/projects/{ref}/cli/login-role` plus `--role=postgres`.
- Re-running an old migration whole can undo a later one (061 against 062). Handoffs should run only the block they need.
