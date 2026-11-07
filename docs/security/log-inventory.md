# Log inventory

What each layer of Carta logs, in what format, where it goes, who can read it and how long it is kept. Built by T1211 (row T1164-h, ROADMAP C10) on 2026-11-07 from the code. Covers ASVS 5.0.0 V16.1.1.

Rules every Carta-written log follows (they match the protection levels in `data-classification.md`): no request or response bodies, no passwords, tokens or keys, no prompt or answer text, no IP address in a Carta table. Account ids appear only where a row must be tied to an account, and are set to null when the account is deleted. Retention for every database table is also in `docs/legal/ARTICLE30.md` section 2a; the day counts are constants in `supabase/migrations/069_privacy_gdpr.sql` `privacy_retention_sweep()` (pg_cron `carta_privacy_retention`, daily 03:23 UTC).

"Platform" retention is set by the provider's plan and shown only in its Dashboard; nobody has read it into the repo, so it says "not verified".

## 1. Browser app (`continent-app/src/`)

| Log | Events | Format | Where | Retention |
|---|---|---|---|---|
| Error tracker | Uncaught errors and render crashes: error type, scrubbed message and stack, release, boundary name. Never user, IP, cookies, headers, query, breadcrumbs | Sentry envelope (`src/lib/errorEvent.js`, sent by `src/lib/errorReporter.js`) | Sentry EU or GlitchTip. **Not live:** the project and DSN are owner steps T1120-a, T1120-b | Tracker setting, to be set at T1120-a |
| Client crash record | Render crash as `origin = client`, `code`, no message, stack or page | Postgres row | `edge_errors` (040, 047) | 90 days |
| Counters | One integer per day per event: launch, channel, funnel step, taste chip, paywall shown | Postgres rows | `launch_counts` (048), `channel_counts` (067), `funnel_counts` (070), `taste_counts` (072), `paywall_events` (022) | Counters not limited (not personal); `paywall_events` 180 days |

The browser console is not collected.

## 2. Pages Functions (`continent-app/functions/`)

Routes `/api/ask`, `/api/ask/answer`, `/api/flights`, `/api/forecast`. No `console` call in any of them.

| Log | Events | Format | Where | Retention |
|---|---|---|---|---|
| Request log | Every request: method, path, status, time, colo | Cloudflare | Cloudflare Dashboard (Pages, Functions) | Platform, not verified. No Logpush configured in `wrangler.toml` |
| Error tracker | Server errors: error type, scrubbed message and stack, route, method, path without query | Sentry envelope (`functions/_lib/track.js`) | Sentry; a no-op until the `SENTRY_DSN` Pages secret is set (T1120-b) | Tracker setting |
| AI call events | One row per model call from Ask: feature, provider, model, prompt id and version, tokens, cost estimate, latency, outcome, salted hash of the question. No text, user id or IP | Postgres row (`functions/_lib/aiEvents.mjs`) | `ai_model_events`, kind `call` (071) | 30 days (`ai_events_prune`, pg_cron `carta_ai_events_prune`) |
| Ask budget counter | Neurons spent today | Workers KV key `n:<day>` (`functions/api/ask/answer.js`) | KV namespace `ASK` (`wrangler.toml`) | 2 days (`expirationTtl`) |
| AI traces | Same metadata as the AI call events | Langfuse | Langfuse on the box. **Off** unless `AI_TRACE_LANGFUSE=on` | Langfuse setting |

## 3. Flight sweep Worker (`continent-app/workers/flight-sweep/`)

| Log | Events | Format | Where | Retention |
|---|---|---|---|---|
| Worker log | Run summaries and failures (`console` in `src/index.mjs`) | Workers Logs | Cloudflare, `[observability] enabled = true` in its `wrangler.toml` | Platform, not verified |

## 4. Supabase Edge Functions (`supabase/functions/`)

| Log | Events | Format | Where | Retention |
|---|---|---|---|---|
| Function log | Invocations with status and time; `console.error` lines from `stripe-webhook` and `_shared/passes.mjs` (failed event writes, Stripe errors without card data) | Supabase | Supabase Dashboard, Edge Functions, Logs | Platform, not verified |
| AI failures | `plan-day`, `suggest-city`, `parse-booking`: function, error code (`ai_timeout`, `ai_bad_output`, `url_unreachable`, `ai_error`), HTTP and upstream status, account id | Postgres row | `edge_errors` (040, 047) | 90 days, pruned on write and by the sweep |
| Parse failures | Input kind, size, mime type, failed check, app version, account id; never the content | Postgres row | `parse_failures` (042) | 30 days |
| AI model events | Plan and ground calls: which model answered, fallback, tokens, account id | Postgres row | `ai_model_events` (028) | 180 days |
| AI cap refusals | Reason, kind, tier; no account id | Postgres row | `ai_cap_events` (030) | 400 days |
| AI cache hits | Destination and hit; no account id | Postgres row | `ai_cache_events` (029) | 400 days |
| Email sent | Kind and trip or place ref per mail, account id | Postgres row | `email_log` (060) | 400 days |
| Upload scans | Scan result and decision per upload | Postgres row | `user_uploads` (061) | With the upload |

Not logged today: 401 and 403 answers of the Edge Functions and failed sign-ins in a Carta store (row T1164-i). Supabase's own Auth log holds sign-ins.

## 5. Supabase database and Auth

| Log | Events | Format | Where | Retention |
|---|---|---|---|---|
| Admin audit trail | Every admin action: admin id, action, target, before and after, reason | Postgres row | `admin_audit_log` (014, 033, 062, 064) | 3 years |
| Co-plan link attempts | Who tried a link and when (rate limit) | Postgres row | `coplan_link_attempts` (052) | 7 days |
| Moderation | Reports, statements of reasons, decisions | Postgres rows | `content_reports` (037), `moderation_statements` (039) | 12 months after decision; 3 years |
| Pipeline runs | Tasks ran, skipped, failed; row counts per layer | Postgres row | `pipeline_runs` (041) | Not limited (no personal data) |
| Auth log | Sign-ins, sign-ups, token refreshes, failures, with IP | Supabase | Dashboard, Logs (Auth) | Platform, not verified (threat model section 4) |
| API and Postgres logs | PostgREST requests, database errors | Supabase | Dashboard, Logs | Platform, not verified |

Event and log tables have no client policy and no client grant: only definer functions and the service role reach them (`ARTICLE30.md` section 5).

## 6. Build box (Hetzner, `infra/hetzner/`)

| Log | Events | Format | Where | Retention |
|---|---|---|---|---|
| Pipeline day log | Everything a pipeline run prints | Text | `logs/pipeline_<date>.log` | Compressed after 7 days, deleted after 90 (`infra/hetzner/cax11/run_pipeline.sh`) |
| Run log and weekly log | Run output; "cron fired" lines | Text | `/home/carta/carta/logs/pipeline_run.log`, `/home/carta/logs/weekly.log` | Weekly rotation, 12 kept (`infra/hetzner/cron/carta-logrotate`) |
| systemd journal | Timer and service starts, exits, timeouts | journald | The box | journald defaults (not set in the repo) |
| Backup counts | Row counts per table for each nightly dump | JSON | `supabase-nightly-<stamp>.counts.json` beside the dump (`ops/backup_nightly.sh`) | With the dump: 30 days on R2, 7 days on the box |
| Intelligence API | Start, stop, every request: request id, key id, route, method, status, ms. Never bodies | JSON lines on stdout (`services/intelligence/intelligence/logs.py`) | Docker log of the container | Docker defaults (not set in `compose.yaml`) |
| AI gateway events | One line per pipeline model call (metadata only) | JSON lines | File named by `AI_EVENTS_JSONL`, when set | Not limited; off unless set |
| Heartbeat | Run succeeded or failed | HTTP ping | `CARTA_HEARTBEAT_URL` | Provider setting |

## 7. CI and monitoring (`.github/workflows/`)

| Log | Events | Where | Retention |
|---|---|---|---|
| Workflow logs | Every job's output | GitHub Actions | Repository setting, not verified |
| Artifacts | ZAP reports (`zap.yml`), SBOMs (`supply-chain.yml`), docs site (`docs-site.yml`) | GitHub Actions | 30, 90 and 7 days (`retention-days`) |
| Uptime alerts | Probe failures every 15 minutes | `uptime.yml` posts to `ALERT_WEBHOOK_URL` | Receiver's setting |

## 8. Gaps

- No log store outside each platform, so no single place to search or alert on security events (row T1164-i, ASVS V16.4.3).
- Edge Function 401 and 403 answers and failed sign-ins are not in a Carta log (T1164-i).
- The error tracker is built but not connected (T1120-a to T1120-d).
- Platform retentions (Cloudflare, Supabase, GitHub, journald, Docker) are not recorded; read them from the Dashboards when T1164-i is done.
