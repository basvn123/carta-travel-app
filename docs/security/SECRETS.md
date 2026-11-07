# Secrets and owner accounts

Every secret Carta depends on, where it lives, what reads it and what a leak would cost. Names and places only: no value is ever written here, in a report or in chat. Built by T1059 (ROADMAP C2) on 2026-11-05 from the code, the workflows and the example env files. The owner's rotation and MFA steps are in `Execution/P15/_OPEN-secrets-rotation.md`.

Keep it true: a task that adds, renames or moves a secret updates its row in the same commit.

## How it was checked

- Names were read from `.github/workflows/*.yml` (`secrets.*`), `supabase/functions/` (`Deno.env.get`), `continent-app/functions/` and `continent-app/workers/` (`env.*`), the `wrangler.toml` files, `infra/hetzner/cax11/env.example` and the key names (never values) in the untracked `.env` files.
- The tracked example files (`.env.example`, `continent-app/.env.example`, `infra/hetzner/cax11/env.example`) carry no values: no line has a value of 12 characters or more.
- All of git history was searched for secret-shaped strings (Supabase secret keys, GitHub tokens, Google AI keys, Stripe live, test and webhook keys, Resend keys, Kaggle tokens, AWS keys, private keys). Nothing matched.
- The one known leak is not in git: the `carta-r2-admin` Cloudflare token was pasted into a session on 2026-10-02 (T291-b, audit P-07). It has not been rolled yet.

## Blast radius levels

- **Critical:** a leak lets someone change or delete shipped data, read every user's data, or take money.
- **High:** it costs money or gets an account blocked, but no user data is exposed.
- **Low:** a free data source key; the worst case is a revoked key or a rate limit.
- **Public:** meant to be in the browser bundle; not a secret.

## Production secrets

| Name | Service | Lives in | Read by | Radius | Last rotated |
|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Supabase (set automatically for Edge Functions) | Edge Functions `plan-day`, `parse-booking`, `suggest-city`, `checkout`, `stripe-webhook`, `billing`, `notify` | Critical: bypasses every row policy | Never (project key) |
| `CARTA_SUPABASE_SERVICE_KEY` | Supabase (same key) | GitHub secret; Hetzner box `.env` | `uptime.yml` (every run); the box's pipeline publish | Critical. Check that the uptime probe needs the service key at all; the anon key may do | Never |
| `SUPABASE_DB_URL` | Supabase Postgres | Hetzner box `.env` | backups (`ops/`), the box | Critical: database password inside the URL | Not recorded |
| `CARTA_BACKUP_KEY` | Backups | Hetzner box `.env` | the encrypted archive | Critical: decrypts the backups | Not recorded |
| `STRIPE_SECRET_KEY` | Stripe | Supabase secret | `checkout`, `billing`, `stripe-webhook` | Critical once live (test mode today) | Not recorded |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Supabase secret | `stripe-webhook` (signature check) | Critical once live: forged payments grant passes | Not recorded |
| `STRIPE_PRICE_TRIP`, `STRIPE_PRICE_YEAR` | Stripe | Supabase secret | `checkout` | Public ids, not secret | n/a |
| `carta-r2-admin` token | Cloudflare R2 | Owner's Cloudflare account; used by hand | deploys, CORS (`push-data.mjs --cors`) | Critical: write and delete on the data bucket | **Leaked 2026-10-02, not rolled (T291-b)** |
| `RCLONE_CONFIG_R2_ACCESS_KEY_ID`, `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` | Cloudflare R2 (S3 API) | Hetzner box `.env`; owner's shell when deploying | `push-data.mjs`, the box publish | Critical: write and delete on `carta/data/` | Not recorded |
| `CARTA_WORKER_R2_ACCESS_KEY_ID`, `CARTA_WORKER_R2_SECRET_ACCESS_KEY` | Cloudflare R2 | Hetzner box `.env` | the trails worker | High | Not recorded |
| `CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`) | Cloudflare | Hetzner box `.env`; owner's shell | `wrangler pages deploy`, purge scripts | Critical: can replace the live site | Not recorded |
| `INGEST_TOKEN` / `CARTA_SWEEP_INGEST_TOKEN` | flight-sweep Worker | Worker secret; Hetzner box `.env` | `workers/flight-sweep` ingest, the late sweep | High: lets someone write fares | Not recorded |
| `HTTPS_PROXY` / `HTTP_PROXY` | Proxy provider | Worker and box env | flight sweep | High if the URL holds a password | Not recorded |
| `GEMINI_API_KEY` | Google AI | Supabase secret; GitHub secret; Hetzner box; laptop `.env`; `supabase/.env.local` | `plan-day`, `parse-booking`, `suggest-city`, golden-set workflow, pipeline | High: billed usage. In five places, the widest spread | Not recorded |
| `RESEND_API_KEY`, `NOTIFY_SECRET` | Resend email | Supabase secret | `notify` (price-drop email) | High: mail sent as Carta | Not set yet (T944-b) |
| Resend SMTP key (`supabase-auth-smtp`, sending only) | Resend | Supabase Dashboard, Authentication, Emails, SMTP Settings (password field); owner's password manager | Supabase Auth: sign-up confirmation, password reset and email change mail | High: mail sent as Carta | Set 2026-11-05 (T1084) |
| `UPLOADS_SCAN_SECRET` | Carta (a long random string the owner makes) | Supabase Edge Function secret | `upload-scan` checks it against the `x-uploads-secret` header of every call | High: whoever holds it can trigger scan and purge runs (the function only scans pending uploads and deletes queued files; it publishes nothing) | Not set yet (061 not applied, T1070-a) |
| Vault `uploads_scan_secret` | Carta (the same value as `UPLOADS_SCAN_SECRET`) | Supabase Vault (`vault.secrets`) | 061's pg_cron job `carta_uploads_scan`, which sends it as `x-uploads-secret` every 15 minutes | High: as above | Not set yet (T1070-a) |
| Vault `uploads_scan_url` | Carta | Supabase Vault | the same cron job: the `upload-scan` function URL it posts to | Low: an address, not a credential (kept in the vault so the SQL carries no project URL) | Not set yet (T1070-a) |
| `ALERT_WEBHOOK_URL` | Alerting | GitHub secret | the uptime workflow | Low: someone could post fake alerts | Not recorded |
| `CARTA_HEARTBEAT_URL` | Uptime ping | Hetzner box `.env` | the box | Low | Not recorded |
| `HCLOUD_TOKEN` | Hetzner Cloud | Hetzner box `.env` | box scripts | Critical: can delete or rebuild the server | Not recorded |
| `CARTA_TRAILSLAB_DUMP_CRYPT`, `CARTA_WORKER_GPG_KEY_FILE` | Trails worker | Hetzner box | trails dump encryption | High | Not recorded |
| `CARTA_SEARCH_KEY` (+ `CARTA_SEARCH_CX`) | Web search provider | Hetzner box `.env` | pipeline research tasks | High: billed | Not recorded |
| `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` | Supabase | Pages build env; GitHub secret; app `.env` | the browser app | Public by design (row policies guard the data) | n/a |
| `VITE_TP_MARKER`, `VITE_OMIO_TRACKING_LINK`, `VITE_VIATOR_PID`, `VITE_GYG_PARTNER_ID`, `VITE_SKYSCANNER_PARTNER_ID` | Affiliates | Pages build env | the browser app | Public affiliate ids | n/a |

**Rotating the upload scan secret (T1081).** `UPLOADS_SCAN_SECRET` and the vault secret `uploads_scan_secret` hold one value and must change together, or every scheduled run is refused with 401 and uploads wait in pending. Make a new long random string, then in one sitting: set it as the Edge Function secret (Dashboard, Edge Functions, Secrets, or `supabase secrets set`), then update the vault row (`select vault.update_secret(id, '<new>') from vault.secrets where name = 'uploads_scan_secret'` in the SQL editor), then confirm the next quarter-hour run answers 200 in the function logs. A run that falls between the two steps fails once and is retried by the next. Rotate on any suspected exposure and at least yearly; `uploads_scan_url` changes only if the project or the function name does. The setup order is `Execution/P15/_OPEN-uploads.md`.

## Data source keys (pipeline)

Low radius: free or registration-only keys for open data. They live in the laptop `.env` and the Hetzner box `.env`; `src/ingestion/CREDENTIALS.md` says how to get each one.

`KAGGLE_API_TOKEN` (`KAGGLE_USERNAME`, `KAGGLE_KEY`), `TRAFIKLAB_GTFS_SWEDEN_KEY`, `TRAFIKLAB_NETEX_SWEDEN_KEY`, `TRAFIKLAB_GTFS_REGIONAL_KEY`, `MOBILITYDATA_AT_USER`, `MOBILITYDATA_AT_PASSWORD`, `OTD_SWISS_TOKEN`, `NDOV_USER`, `NDOV_PASS`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `OPENSKY_USER`, `OPENSKY_PASS`, `DELIJN_API_KEY`, `BELGIUM_OPENDATA_KEY`, `OPENTRIPMAP_KEY`, `GITHUB_TOKEN` (rate limits only; give it no scopes), `LITEAPI_KEY`, `HW_CONSUMER_KEY`, `HW_CONSUMER_SECRET`.

`TRAVELPAYOUTS_TOKEN` is higher: it is the affiliate account behind the fare data and future commission (ROADMAP I16).

## Owner accounts

Every account below can reach production. Each needs MFA with an authenticator app or a passkey (not SMS) and recovery codes stored offline, outside this laptop.

| Account | Controls | MFA | Recovery codes |
|---|---|---|---|
| Email (the address every account resets to) | password resets for everything below | Required first: whoever holds it holds the rest | Offline |
| GitHub | the repo, the workflows and their secrets | Required | Offline |
| Cloudflare | Pages, R2, Workers, KV, D1, DNS | Required | Offline |
| Supabase | database, auth, Edge Functions and their secrets | Required | Offline |
| Stripe | payments and payouts | Required (Stripe asks for it before live mode) | Offline |
| Google (AI Studio / Cloud billing) | the Gemini key and its bill | Required | Offline |
| Hetzner | the build box | Required | Offline |
| Domain registrar (carta-europetravel.com) | DNS delegation | Required, with transfer lock on | Offline |
| Resend | email sending | Required | Offline |
| Travelpayouts and affiliate programmes | commission payouts | Where offered | Offline |

## Guards in place

- `secret-scan.yml` fails a push to `main` (and any pull request) when the tree holds a privileged-key shape: Supabase secret keys, service-role JWTs, GitHub tokens, Google AI keys, Stripe live and webhook keys, Kaggle tokens, AWS keys, private keys. It also scans the built bundle.
- Not covered by the scan, because the keys have no fixed shape: Cloudflare and R2 tokens, Resend keys (`re_`), proxy URLs. They stay out of the repo by living only in env files that git ignores.
- `.gitignore` keeps `.env` and `.env.local` out of git; only the `.example` files are tracked.
