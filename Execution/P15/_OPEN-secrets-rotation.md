# Owner procedure: secrets rotation and MFA (T1059, ROADMAP C2 and N3)

The inventory is `docs/security/SECRETS.md`. Do the steps in this order: the first two close the known exposure, then accounts get MFA before keys are rolled, so a rolled key cannot be read by someone still holding an account. Never paste a new value into a chat, a report or a commit. After each step, write the date in the "Last rotated" column of the inventory (a one-line commit).

Register rows: T1059-a to T1059-e.

## 1. Roll the leaked R2 admin token (T291-b, N3; row T1059-a)

1. Cloudflare dashboard, My Profile (or Manage Account), API Tokens. Find `carta-r2-admin`, choose Roll, and store the new value only in your password manager.
2. Delete the unused "Carta user token" named in T291-b.
3. R2, bucket `carta`, Metrics and the account audit log (Manage Account, Audit Log): look for writes or deletes since 2026-10-02 that were not your deploys or the box. Note what you saw in the register row.
4. Then run the waiting CORS step T296-a with the new token.

## 2. Turn on MFA everywhere (row T1059-b)

In this order, because each one resets through the one before: email, GitHub, Cloudflare, Supabase, Stripe, Google, Hetzner, the domain registrar (also switch on the transfer lock), Resend, Travelpayouts. Use an authenticator app or a passkey, not SMS. Print or write down the recovery codes and keep them offline, not on this laptop.

## 3. Roll the critical keys (row T1059-c)

Each key: create the new one, update every place the inventory lists, check the service works, then revoke the old one.

1. **R2 S3 keys** (`RCLONE_CONFIG_R2_*`, `CARTA_WORKER_R2_*`): Cloudflare R2, Manage API Tokens. Update the Hetzner box `.env`. Check with `node scripts/r2/push-data.mjs --rclone-dry-run` from `continent-app/`.
2. **`CLOUDFLARE_API_TOKEN`**: scope it to Pages edit and R2 edit only. Update the box `.env`.
3. **`HCLOUD_TOKEN`**: Hetzner Cloud console, Security, API tokens. Update the box `.env`.
4. **`SUPABASE_DB_URL`**: reset the database password in Supabase, Database settings. Update the box `.env`. Check one backup run.
5. **Supabase service role key**: only if you suspect exposure; Supabase's API keys page shows how this project's keys rotate, and every Edge Function and the box must get the new one. Otherwise first check whether `uptime.yml` can use the anon key, and drop `CARTA_SUPABASE_SERVICE_KEY` from GitHub if it can.

## 4. Roll the billed keys (row T1059-d)

1. **`GEMINI_API_KEY`**: it sits in five places (Supabase secret, GitHub secret, box, laptop `.env`, `supabase/.env.local`). Make one key for production (Supabase) and a separate one for the pipeline and CI, each with a budget alert in Google Cloud billing.
2. **`INGEST_TOKEN`**: `npx wrangler secret put INGEST_TOKEN` in `continent-app/workers/flight-sweep`, then the same value as `CARTA_SWEEP_INGEST_TOKEN` in the box `.env`.
3. **Proxy credentials** in `HTTPS_PROXY`, if the provider allows a reset.
4. **`TRAVELPAYOUTS_TOKEN`**: reset in the Travelpayouts dashboard; update the laptop and box `.env`.

## 5. Before Stripe goes live (row T1059-e)

Stripe test keys are fine to keep until launch. When you switch to live mode (`Execution/P2/_OPEN-stripe-launch.md`): make restricted live keys, set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Supabase secrets, and never put them anywhere else.

## Afterwards

Repeat step 3 and 4 once a year, and at once when a key is pasted somewhere it should not be or someone with access leaves.
