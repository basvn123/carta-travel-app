# Owner procedure: Supabase: migrations, Edge Functions and secrets (ROADMAP A3, C4)

Project Carta, `ntssxktaduxzpsmejwyv` only (never Horizon-App or the inactive project). When a step is done, delete it here (`docs/decisions/0003-open-items-owner-steps-and-roadmap.md`).

## State on 2026-11-12 (owner sweep, supabase lane)

- **Live:** migrations 001 to 075 (there is no 068).
- **Deployed:** all ten Edge Functions from `main` as of 2026-11-12. These five run without the JWT check: stripe-webhook, notify, price-alerts, waitlist, upload-scan. Each was smoke-tested.
  - The AI trio answers 401 without a signed-in user.
  - Without their provider keys, the others answer "not configured" and send nothing: billing (removed from the code by round 2; deleted with the next deploy, step 1), checkout, stripe-webhook, notify, price-alerts, waitlist, upload-scan.
- **Secrets set:** the Supabase defaults, `GEMINI_API_KEY` and `AI_ENABLE_CITY_GROUNDING`. No Stripe or Resend key. No shared secret for notify, upload-scan, waitlist or price alerts.
- **Vault:** empty. So 060's reminder job and 061's upload scan are not scheduled.
- **Checked live:** every SECURITY DEFINER function in `public` pins its `search_path` (121 of 121).

The sweep could not apply migrations or write secrets: the session's permission guard refuses production DB and secret-store writes. So step 1 is one run for whoever holds that permission, a Claude session the owner allows or the owner.

- **Applied 2026-11-12 by the orchestrator (owner sweep):** migrations 063 to 075, one at a time, no error; `carta_privacy_retention`, `carta_ai_events_prune` and `carta_ai_reports_prune` are scheduled. A JSON copy of the tables 069 prunes was taken first (local only, `.work/2026-11-12-owner-sweep/db-backup-before-069/`). The app was shipped the same evening, so 064 and the admin page match.
- **Step 1 below is one command:** `python -I .work/2026-11-12-owner-sweep/set_shared_secrets.py` makes the four values, sets them, fills Vault and runs only the cron blocks of 060 and 061; it prints no secret. The session permission check refused to run it for Claude.

## Steps

1. **Shared secrets and the two cron jobs (rows T985-a, T1070-a step 5, T944-b part, T1110-b part, T1205-b part).**
   - Make four random values with `openssl rand -hex 32`. Keep them in the password manager, never in chat or git.
   - Set them:
     ```
     supabase secrets set NOTIFY_SECRET=<a> UPLOADS_SCAN_SECRET=<b> WAITLIST_SECRET=<c> PRICE_ALERTS_LINK_SECRET=<d>
     supabase db query --linked "select vault.create_secret('https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/notify','notify_url'); select vault.create_secret('<a>','notify_secret'); select vault.create_secret('https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/upload-scan','uploads_scan_url'); select vault.create_secret('<b>','uploads_scan_secret');"
     awk '/^do \$cron\$/,/^\$cron\$;/' supabase/migrations/060_email_prefs.sql > /tmp/cron060.sql && supabase db query --linked -f /tmp/cron060.sql
     awk '/^do \$cron\$/,/^\$cron\$;/' supabase/migrations/061_user_uploads.sql > /tmp/cron061.sql && supabase db query --linked -f /tmp/cron061.sql
     ```
     Run only these schedule blocks, **never the whole of 060 or 061 again**. 061 re-creates the upload read policy without the MFA check that 062 added, and later migrations changed functions that 060 also defines.
   - Check:
     ```
     supabase db query --linked "select jobname, schedule from cron.job where jobname in ('carta_notify_reminders','carta_uploads_scan')"
     ```
     It answers two rows: `41 7 * * *`, and the upload scan every 15 minutes.
   - `PRICE_ALERTS_BOX_SECRET` is a fifth value. It goes into Supabase and onto the box at the same time, with `PRICE_ALERTS_URL`. See `supabase/functions/price-alerts/README.md`.
2. **Resend: switch on Carta's mail (rows T944-b, T1110-b, T1205-b).** This needs the Resend login.
   - In Resend, under Domains, check that `carta-europetravel.com` is Verified. Auth already sends through `smtp.resend.com`, so it probably is.
   - Under API keys, create a key with sending access.
   - Set it with the senders:
     ```
     supabase secrets set RESEND_API_KEY=<key> NOTIFY_FROM="Carta <trips@carta-europetravel.com>" WAITLIST_FROM="Carta <hello@carta-europetravel.com>" PRICE_ALERTS_FROM="Carta <alerts@carta-europetravel.com>"
     ```
   - Price alerts stay off until `supabase secrets set PRICE_ALERTS_ENABLED=1`. Set it once the box has its secret.
   - Check: `curl -s -X POST https://ntssxktaduxzpsmejwyv.supabase.co/functions/v1/waitlist -H 'Content-Type: application/json' -d '{}'` no longer answers `"code":"unavailable"`.
3. **Signed-in walks on the live site (rows T823-a, T281-b, T326-c).** They need a real account and inbox.
   - **T823-a:** On a test account (not the owner's), use "Let Carta plan them" once. A 7-day trip spends up to 7 AI plans.
   - **T281-b:** As admin, take a test guide down with a statement of reasons. Reverse it.
   - **T326-c:** Send one real content report. Then run the next query and check the row exists. Press Open in Content on it.
     ```
     supabase db query --linked "select source_header, created_at from public.content_reports order by created_at desc limit 1"
     ```
     `source_header` must be `cf-connecting-ip`. That also closes T068-c.

## Moved from unsorted.md (owner sweep 2026-11-12)

T1110-b and T1205-b were merged into steps 2 and 3 by owner sweep round 2.

| ID | Item | Order |
|---|---|---|
| T1205-c | After step 1 (073), step 2 (`PRICE_ALERTS_BOX_SECRET`) and step 3 (Resend): a session turns price alerts on for a preview. Sign in with your own account, open a place, press Price alert, open the confirmation mail and click the link. It worked when the place shows the alert as active. Tell a session "T1205-c done" and it switches the flags on for everyone (`PRICE_ALERTS_ENABLED=1`, `VITE_PRICE_ALERTS=1`). | after steps 1 to 3 |
