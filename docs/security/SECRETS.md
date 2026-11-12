# Secrets and owner accounts

Every secret Carta depends on, where it lives, what reads it and what a leak would cost. Names and places only: no value is ever written here, in a report or in chat. Built by T1059 (ROADMAP C2) on 2026-11-05 from the code, the workflows and the example env files. The owner's rotation and MFA steps are in `docs/owner/secrets-rotation.md`.

Keep it true: a task that adds, renames or moves a secret updates its row in the same commit.

## How it was checked

- Names were read from `.github/workflows/*.yml` (`secrets.*`), `supabase/functions/` (`Deno.env.get`), `continent-app/functions/` and `continent-app/workers/` (`env.*`), the `wrangler.toml` files, `infra/hetzner/cax11/env.example` and the key names (never values) in the untracked `.env` files.
- The tracked example files (`.env.example`, `continent-app/.env.example`, `infra/hetzner/cax11/env.example`) carry no values: no line has a value of 12 characters or more.
- All of git history was searched for secret-shaped strings (Supabase secret keys, GitHub tokens, Google AI keys, Stripe live, test and webhook keys, Resend keys, Kaggle tokens, AWS keys, private keys). Nothing matched.
- The one known leak is not in git: the `carta-r2-admin` Cloudflare token was pasted into a session on 2026-10-02 (T291-b, audit P-07). The owner rolled it and checked the audit log (T1059-a, ticked in the owner walkthrough; recorded 2026-11-12).
- 2026-11-12 (owner sweep): GitHub secret scanning had two open alerts, both `whsec_test` placeholders in old `Execution/` reports (T031, T252, T320), never a Stripe secret. Both closed as test value and false positive.

## Blast radius levels

- **Critical:** a leak lets someone change or delete shipped data, read every user's data, or take money.
- **High:** it costs money or gets an account blocked, but no user data is exposed.
- **Low:** a free data source key; the worst case is a revoked key or a rate limit.
- **Public:** meant to be in the browser bundle; not a secret.

## Production secrets

| Name | Service | Lives in | Read by | Radius | Last rotated |
|---|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Supabase (set automatically for Edge Functions) | Edge Functions `plan-day`, `parse-booking`, `suggest-city`, `checkout`, `stripe-webhook`, `billing`, `notify` | Critical: bypasses every row policy | Never (project key) |
| `CARTA_SUPABASE_SERVICE_KEY` | Supabase (same key) | Hetzner box `.env`. Not in GitHub (2026-11-12: no Actions secret is set) | the box's pipeline publish; `uptime.yml` reads it if set | Critical. The anon key cannot do the uptime pipeline check (`pipeline_runs` is readable by service_role only, migration 041), so the plan is a narrow read path instead of this key in GitHub (ROADMAP C6 follow-up) | Never |
| `SUPABASE_DB_URL` | Supabase Postgres | Hetzner box `.env` | backups (`ops/`), the box | Critical: database password inside the URL | Rolled by the owner (T1059-c; date not recorded) |
| `CARTA_BACKUP_KEY` | Backups | Hetzner box `.env` | the encrypted archive | Critical: decrypts the backups | Not recorded |
| `STRIPE_SECRET_KEY` | Stripe | Supabase secret | `checkout`, `billing`, `stripe-webhook` | Critical once live (test mode today) | Not recorded |
| `STRIPE_WEBHOOK_SECRET` | Stripe | Supabase secret | `stripe-webhook` (signature check) | Critical once live: forged payments grant passes | Not recorded |
| `STRIPE_PRICE_TRIP`, `STRIPE_PRICE_YEAR` | Stripe | Supabase secret | `checkout` | Public ids, not secret | n/a |
| `carta-r2-admin` token | Cloudflare R2 | Owner's Cloudflare account; used by hand | deploys, CORS (`push-data.mjs --cors`) | Critical: write and delete on the data bucket | Leaked 2026-10-02; rolled by the owner (T1059-a) |
| `RCLONE_CONFIG_R2_ACCESS_KEY_ID`, `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY` | Cloudflare R2 (S3 API) | Hetzner box `.env`; owner's shell when deploying | `push-data.mjs`, the box publish | Critical: write and delete on `carta/data/` | Rolled by the owner (T1059-c; date not recorded) |
| `CARTA_WORKER_R2_ACCESS_KEY_ID`, `CARTA_WORKER_R2_SECRET_ACCESS_KEY` | Cloudflare R2 | Hetzner box `.env` | the trails worker | High | Not recorded |
| `CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`) | Cloudflare | Hetzner box `.env`; owner's shell | `wrangler pages deploy`, purge scripts | Critical: can replace the live site | Rolled by the owner (T1059-c; date not recorded) |
| `INGEST_TOKEN` / `CARTA_SWEEP_INGEST_TOKEN` | flight-sweep Worker | Worker secret; Hetzner box `.env` | `workers/flight-sweep` ingest, the late sweep | High: lets someone write fares | Rolled by the owner (T1059-d; date not recorded) |
| `HTTPS_PROXY` / `HTTP_PROXY` | Proxy provider | Worker and box env | flight sweep | High if the URL holds a password | Rolled by the owner (T1059-d; date not recorded) |
| `GEMINI_API_KEY` | Google AI | Two keys since T1059-d: production in the Supabase secret; pipeline and CI in the Hetzner box, laptop `.env` and `supabase/.env.local`. The GitHub secret is not set yet (T153-b) | `plan-day`, `parse-booking`, `suggest-city`, golden-set workflow, pipeline | High: billed usage | Split and rolled by the owner (T1059-d; date not recorded). Laptop key answered 200 on 2026-11-12 |
| `AI_OPENAI_API_KEY` | An OpenAI-compatible model API (Scaleway, OVHcloud, Mistral) | Supabase secret or Pages secret, only when a feature is switched to provider `openai`; Hetzner box `.env` for a pipeline job on it | `aiModels.mjs` (Edge Functions, Ask) and `pipeline/ai_gateway.py`, provider `openai` | High: billed usage. Not set today (no feature uses the provider) | Not set |
| `CF_ACCOUNT_ID`, `CF_AI_TOKEN` | Cloudflare Workers AI (REST) | Supabase secret, only when an Edge Function feature is switched to provider `workers-ai`; Hetzner box `.env` for a pipeline job | `aiModels.mjs` outside a Worker (Ask on Pages uses the `AI` binding and needs neither), `pipeline/ai_gateway.py` | High: the token spends Neurons on the account. Scope it to Workers AI only. Not set today | Not set |
| `AI_EVENTS_SALT` | Carta (a random 32 character string the owner makes) | Pages secret | Ask (`/api/ask/answer`) salts the question hash in `ai_model_events` with it | Medium: with the salt, a guessed question can be matched to its hash; without it the hash is not reversible | Not set yet (T1139-b) |
| `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | Langfuse on the build box (optional) | Supabase secret and Pages secret, only with `AI_TRACE_LANGFUSE=on` | `aiEvents.mjs` (metadata only, no prompt or answer text) | Medium: write access to the trace store | Not set |
| `RESEND_API_KEY`, `NOTIFY_SECRET` | Resend email | Supabase secret | `notify` (price-drop email) | High: mail sent as Carta | Not set yet (T944-b) |
| Resend SMTP key (`supabase-auth-smtp`, sending only) | Resend | Supabase Dashboard, Authentication, Emails, SMTP Settings (password field); owner's password manager | Supabase Auth: sign-up confirmation, password reset and email change mail | High: mail sent as Carta | Set 2026-11-05 (T1084) |
| `WAITLIST_SECRET`, `WAITLIST_FROM` (and the same `RESEND_API_KEY`) | Carta (a long random string the owner makes); Resend | Supabase Edge Function secrets | `waitlist` signs the confirm and unsubscribe links with it and sends the confirmation mail from `WAITLIST_FROM` | High: whoever holds the secret can confirm or unsubscribe any address; the key sends mail as Carta | Not set yet (T1110-b) |
| `PRICE_ALERTS_LINK_SECRET` | Carta (a long random string the owner makes) | Supabase Edge Function secret | `price-alerts` signs and checks the confirm, stop and unsubscribe links (account and expiry) | High: whoever holds it can forge a link that confirms or stops any alert | Not set yet (T1205-b) |
| `PRICE_ALERTS_BOX_SECRET` | Carta (a long random string the owner makes) | Supabase Edge Function secret; Hetzner box `.env` (with `PRICE_ALERTS_URL`, the function's address, not a secret) | `price-alerts` checks it on the box's calls; `pipeline/price_alerts.py` sends it when it posts the weekly totals | High: whoever holds it can post totals that trigger alert emails (the box never holds the service role key) | Not set yet (T1205-b) |
| `PRICE_ALERTS_FROM`, `PRICE_ALERTS_ENABLED` (and the same `RESEND_API_KEY`) | Carta; Resend | Supabase Edge Function secrets | `price-alerts`: the sender address, and the server half of the off switch | Low: an address and a flag; the key beside them is High | Not set yet (T1205-b, T1205-c) |
| `SENTRY_DSN` (with `SENTRY_OFF`, `SENTRY_SAMPLE`) | Sentry (EU) | Pages secret | `continent-app/functions/_lib/track.js`: error events from the Pages Functions, scrubbed | Low: a DSN can only send events; someone holding it could flood the project with fake errors | Not set yet (T1120-b) |
| `UPLOADS_SCAN_SECRET` | Carta (a long random string the owner makes) | Supabase Edge Function secret | `upload-scan` checks it against the `x-uploads-secret` header of every call | High: whoever holds it can trigger scan and purge runs (the function only scans pending uploads and deletes queued files; it publishes nothing) | Not set yet (061 not applied, T1070-a) |
| Vault `uploads_scan_secret` | Carta (the same value as `UPLOADS_SCAN_SECRET`) | Supabase Vault (`vault.secrets`) | 061's pg_cron job `carta_uploads_scan`, which sends it as `x-uploads-secret` every 15 minutes | High: as above | Not set yet (T1070-a) |
| Vault `uploads_scan_url` | Carta | Supabase Vault | the same cron job: the `upload-scan` function URL it posts to | Low: an address, not a credential (kept in the vault so the SQL carries no project URL) | Not set yet (T1070-a) |
| `ALERT_WEBHOOK_URL` | Alerting | GitHub secret, not set (optional: GitHub already emails on a failed run) | the uptime workflow | Low: someone could post fake alerts | n/a |
| `CARTA_HEARTBEAT_URL` | Uptime ping | Hetzner box `.env` | the box | Low | Not recorded |
| `HCLOUD_TOKEN` | Hetzner Cloud | Hetzner box `.env` | box scripts | Critical: can delete or rebuild the server | Rolled by the owner (T1059-c; date not recorded) |
| `CARTA_TRAILSLAB_DUMP_CRYPT`, `CARTA_WORKER_GPG_KEY_FILE` | Trails worker | Hetzner box | trails dump encryption | High | Not recorded |
| `CARTA_SEARCH_KEY` (+ `CARTA_SEARCH_CX`) | Web search provider | Hetzner box `.env` | pipeline research tasks | High: billed | Not recorded |
| `SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` | Supabase | Pages build env; app `.env`; GitHub secret `SUPABASE_ANON_KEY` not set yet (T235-a) | the browser app; `uptime.yml` | Public by design (row policies guard the data) | n/a |
| `VITE_TP_MARKER`, `VITE_OMIO_TRACKING_LINK`, `VITE_VIATOR_PID`, `VITE_GYG_PARTNER_ID`, `VITE_SKYSCANNER_PARTNER_ID` | Affiliates | Pages build env | the browser app | Public affiliate ids | n/a |

**AI gateway settings (T1137, T1139).** Every model call reads its provider and chain from config, so a switch is a setting, not a code change. These are not secrets, but they live beside the keys (Supabase secrets for the Edge Functions, Pages env for Ask, the box `.env` for the pipeline), and changing one changes which model answers travellers: a provider or model switch is the owner's call with an eval run (`docs/ai/model-strategy.md`). `<FEATURE>` is the feature name in upper case with `-` as `_`: `PLAN_DAY`, `SUGGEST_CITY`, `PARSE_BOOKING`, `ASK`, `EVAL_JUDGE` (Edge Functions and Ask, `aiModels.mjs`) and `INTROS`, `PARKING`, `TRIPS`, `LEXICON`, `TAGGING`, `SUMMARIES`, `BLOG` (pipeline, `pipeline/ai_gateway.py`).

| Name | Meaning |
|---|---|
| `AI_<FEATURE>_PROVIDER` | `gemini`, `workers-ai` or `openai` (the pipeline adds `ollama` and `box`). Unset: the feature's default. |
| `AI_<FEATURE>_MODELS` | Comma separated model chain, first model first, at most 6. |
| `AI_<FEATURE>_BASE_URL` | The server for provider `openai` (and `ollama`, `box` in the pipeline). `AI_OPENAI_BASE_URL` is the fallback for every feature. |
| `GEMINI_MODELS`, `GEMINI_MODEL` | The older Gemini overrides: replace the chain, or put one model first. |
| `AI_BOX_BASE_URL`, `AI_BOX_EVAL_RUN` | Pipeline only: the llama.cpp server on the box, and `1` to let an eval run use it before the job passed. |
| `AI_EVENTS_JSONL` | Pipeline only: a file the gateway appends one event line per call to. |
| `AI_TRACE_LANGFUSE` | `on` turns the Langfuse export on (with the three `LANGFUSE_*` keys above). |

A value naming the Claude API (`anthropic`, `claude`) is refused as a config error.

**Rotating the upload scan secret (T1081).** `UPLOADS_SCAN_SECRET` and the vault secret `uploads_scan_secret` hold one value and must change together, or every scheduled run is refused with 401 and uploads wait in pending. Make a new long random string, then in one sitting: set it as the Edge Function secret (Dashboard, Edge Functions, Secrets, or `supabase secrets set`), then update the vault row (`select vault.update_secret(id, '<new>') from vault.secrets where name = 'uploads_scan_secret'` in the SQL editor), then confirm the next quarter-hour run answers 200 in the function logs. A run that falls between the two steps fails once and is retried by the next. Rotate on any suspected exposure and at least yearly; `uploads_scan_url` changes only if the project or the function name does. The setup order is `docs/owner/uploads.md`.

## Data source keys (pipeline)

Low radius: free or registration-only keys for open data. They live in the laptop `.env` and the Hetzner box `.env`; `src/ingestion/CREDENTIALS.md` says how to get each one.

`KAGGLE_API_TOKEN` (`KAGGLE_USERNAME`, `KAGGLE_KEY`), `TRAFIKLAB_GTFS_SWEDEN_KEY`, `TRAFIKLAB_NETEX_SWEDEN_KEY`, `TRAFIKLAB_GTFS_REGIONAL_KEY`, `MOBILITYDATA_AT_USER`, `MOBILITYDATA_AT_PASSWORD`, `OTD_SWISS_TOKEN`, `NDOV_USER`, `NDOV_PASS`, `OPENSKY_CLIENT_ID`, `OPENSKY_CLIENT_SECRET`, `OPENSKY_USER`, `OPENSKY_PASS`, `DELIJN_API_KEY`, `BELGIUM_OPENDATA_KEY`, `OPENTRIPMAP_KEY`, `GITHUB_TOKEN` (rate limits only; give it no scopes. 2026-11-12: the laptop one is a fine-grained token that gets 403 on Actions secrets, hooks, Actions settings and e-mails, so it is narrow), `LITEAPI_KEY`, `HW_CONSUMER_KEY`, `HW_CONSUMER_SECRET`.

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
| Travelpayouts and affiliate programmes | commission payouts | Where offered (Travelpayouts offers none, owner 2026-11) | Offline |

The owner turned MFA on for every account above that offers it (T1059-b, ticked in the owner walkthrough; recorded 2026-11-12).

## Guards in place

- `secret-scan.yml` fails a push to `main` (and any pull request) when the tree holds a privileged-key shape: Supabase secret keys, service-role JWTs, GitHub tokens, Google AI keys, Stripe live and webhook keys, Kaggle tokens, AWS keys, private keys. It also scans the built bundle.
- Not covered by the scan, because the keys have no fixed shape: Cloudflare and R2 tokens, Resend keys (`re_`), proxy URLs. They stay out of the repo by living only in env files that git ignores.
- `.gitignore` keeps `.env` and `.env.local` out of git; only the `.example` files are tracked.
- GitHub (2026-11-12): secret scanning and push protection on; Dependabot alerts and Dependabot security updates on; the workflow token is read-only by default. Non-provider patterns and validity checks are not offered on this plan.
