# Owner procedure: Supabase: SQL pastes, Edge Functions and secrets (T1072, ROADMAP A3)

Pastes in the SQL editor, Edge Function deploys and secrets for project ntssxktaduxzpsmejwyv. Migrations 013 to 060 are live (T985); run the liveness query before any paste list.

Steps are the open register rows with Owner `user` that belong to this system, in register order: the Order column first, then task number. A row's own wording says what it waits on ("after", "before"); that is repeated beside the step. Nothing here is new: each step is a row, and the task report named in the row has the detail. When you finish a step, tell a session the row id; it moves the row to `Execution/_OPEN-CLOSED.md`.

Rows: 12. Register rows point back here.

## Steps

1. **T031-a** (register order: 6): Make the real test purchases per supabase/functions/checkout/test_purchase_e2e.md on fresh accounts, never the owner account
2. **T041-b** (register order: 12): Before the cron block in migration 030 runs on the live project: enable pg_cron and pg_net under Database, Extensions, and create the vault secrets refresh_facts_url and refresh_facts_key; without them the block silently schedules nothing and the store never refreshes
3. **T042-c** (register order: 17): The daily percentages assume a global cap of 200 because AI_GLOBAL_DAILY_CAP lives in the Edge Function environment where SQL cannot read it; if the live secret is ever changed, set the site_config key ai_global_daily_cap to match or every percentage in the section goes quietly wrong
4. **T069-b** (register order: after T069-a): 038 re-creates 020's guard_coplanner_write with a takedown exception; if 020 is ever pasted after 038 its old guard comes back and every takedown fails with "the plan is still public after the update", so paste 038 again after any re-paste of 020
5. **T070-b** (register order: after T070-a): 039 re-creates the takedown body, the report list and the co-planner guard; paste 039 again after any later re-paste of 038, 037 or 020, or reversals fail loudly and the report list loses its decision fields
6. **T281-b** (register order: after the stage 2 pastes): The statement of reasons has been run through the real RPC only at database level (test_statement_of_reasons.mjs, 132 of 132 on a throwaway cluster); the browser path through a real signed-in session is still ?savedmock only, because it needs migrations 036 and 039 live
7. **T326-c** (register order: after 047): Send one real report after migration 047 and confirm the row has kind data and the report key; then press Open in Content on it
8. **T823-a**: Walk "Let Carta plan them" once with a real signed-in account on the live plan-day function (only the ?aiplanmock seam was walked); a 7-day trip now spends up to 7 AI plans
9. **T946-a**: Turn on manual identity linking in Supabase so Connect Google works (Execution/P15/T937-T947-owner-decisions.md)
10. **T985-a** (register order: before T944-b): Confirm 060 scheduled its cron job: if its paste printed the pg_cron, pg_net or Vault notice, enable pg_cron and pg_net, add Vault secrets notify_url and notify_secret, and paste 060 again; until then no Together email is queued (Execution/P15/T985-migrations-052-060-live.md)
11. **T1078-a** (register order: after 061 and 062, T1070-a and T1071-a): Paste supabase/migrations/063_signed_out_policy_helpers.sql in the SQL editor and look for "signed-out policy helpers self-check passed"; pasting twice is safe, and the way back is 063_signed_out_policy_helpers_down.sql. It must follow 061 and 062 (Execution/P15/T1078-rls-coverage.md)
12. **T1081-a** (register order: after T1078-a, so after 061, 062 and 063): Paste supabase/migrations/064_admin_action_reasons.sql and look for "admin action reasons self-check passed"; pasting twice is safe, and the way back is 064_admin_action_reasons_down.sql. Deploy the T1081 app in the same sitting: until both are live, ban, delete and set tier answer PGRST202 and change nothing (Execution/P15/T1081-admin-reasons.md)
