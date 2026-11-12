# Owner procedure: secrets rotation and MFA (T1059, ROADMAP C2 and N3)

The inventory is `docs/security/SECRETS.md`. Never paste a secret value into a chat, a report or a commit.

Done by the owner and recorded on 2026-11-12 (owner sweep): the leaked `carta-r2-admin` token rolled and the audit log checked (T1059-a, also T291-b and T1046-b), MFA on every account that offers it (T1059-b; Travelpayouts offers none), the critical keys rolled (T1059-c) and the billed keys rolled with Gemini split into a production key and a pipeline/CI key (T1059-d).

## 1. Give GitHub Actions its secrets (T153-b, T235-a)

On 2026-11-12 the repository had no Actions secrets at all, so the uptime check skips its database probes and the golden-set live run cannot start. Claude's permission rules do not let it write secrets into GitHub, so this is yours. In Git Bash, in the Carta folder:

1. `supabase projects api-keys --project-ref ntssxktaduxzpsmejwyv`, copy the `anon` value, then `gh secret set SUPABASE_ANON_KEY` and paste it when asked. (The anon key is public by design.)
2. `gh secret set GEMINI_API_KEY` and paste the **pipeline/CI** Gemini key (the one in the laptop `.env`), not the production key in Supabase. It costs nothing by itself: only a manual `golden-set` run with `live=true` calls Gemini.
3. Check: `gh secret list` shows the two names. `gh workflow run uptime.yml`, wait a minute, then `gh run list --workflow uptime.yml -L 1` shows `success`.

Do not add `CARTA_SUPABASE_URL` or `CARTA_SUPABASE_SERVICE_KEY` to GitHub (the URL is only read together with the key): the uptime pipeline check is the only reader, and a narrow read path will replace it (ROADMAP C6). `ALERT_WEBHOOK_URL` is optional; GitHub already emails you when a scheduled run fails.

## 2. Before Stripe goes live (T1059-e)

Stripe test keys are fine until launch. When you switch to live mode (the other live-mode steps are in `docs/owner/stripe.md`):

1. Stripe Dashboard, live mode, Developers, API keys, Create restricted key. The Edge Functions call only these, so give only these rights (2026-11-12, from `supabase/functions/`): Checkout Sessions **Write**, Customer portal **Write**, Subscriptions **Write**, PaymentIntents **Read**, Charges **Read** and Balance **Read** (the webhook reads the real Stripe fee through the charge's balance transaction; without the last two it silently falls back to a modelled fee). Everything else None.
2. `supabase secrets set STRIPE_SECRET_KEY=<restricted live key> STRIPE_WEBHOOK_SECRET=<live webhook signing secret>`. Nowhere else: not `.env`, not GitHub.
3. Check: one small real purchase passes and is refunded; `supabase secrets list` shows both names; Stripe, Developers, Logs shows no `403` for that purchase (a `403` on `payment_intents` means a right is missing, and the pass then records a modelled fee instead of the real one).

## Afterwards

Roll these once a year, and at once when a key is pasted somewhere it should not be or someone with access leaves. For each: make the new one, update every place listed, check, then revoke the old one. Write the date in the "Last rotated" column of `docs/security/SECRETS.md`.

1. **R2 S3 keys** (`RCLONE_CONFIG_R2_*`, `CARTA_WORKER_R2_*`): Cloudflare, R2, Manage API Tokens. Update the box `.env`. Check: `node scripts/r2/push-data.mjs --rclone-dry-run` from `continent-app/`.
2. **`CLOUDFLARE_API_TOKEN`**: Cloudflare, My Profile, API Tokens; scope Pages edit and R2 edit only. Update the box `.env`. Check: `npx wrangler whoami` with it.
3. **`HCLOUD_TOKEN`**: Hetzner Cloud console, Security, API tokens. Update the box `.env`.
4. **`SUPABASE_DB_URL`**: Supabase, Database settings, reset the password. Update the box `.env`. Check one backup run.
5. **`GEMINI_API_KEY`** (two keys): production in `supabase secrets set`; pipeline/CI in the box `.env`, laptop `.env`, `supabase/.env.local` and the GitHub secret. Keep a budget alert on each in Google Cloud billing.
6. **`INGEST_TOKEN`**: `npx wrangler secret put INGEST_TOKEN` in `continent-app/workers/flight-sweep`, the same value as `CARTA_SWEEP_INGEST_TOKEN` in the box `.env`.
7. **`TRAVELPAYOUTS_TOKEN`** and the proxy password in `HTTPS_PROXY`: reset at the provider; update the laptop and box `.env`.
8. **Supabase service role key**: only on suspected exposure; every Edge Function and the box must get the new one.
