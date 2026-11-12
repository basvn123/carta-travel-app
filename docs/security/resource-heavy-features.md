# Resource-heavy features

Every Carta feature that costs real time, CPU, money or a third party's patience per call, with the limit that stops it being abused or running away. Built by T1211 (row T1164-h, ROADMAP C10) on 2026-11-07 from the code. Covers ASVS 5.0.0 V15.1.3; it is also the list to check against OWASP API4 (unrestricted resource consumption).

A task that adds an endpoint, a model call, a scraper or a scheduled job adds its row here with its limit in the same commit. A row without a limit is a gap.

## 1. Pages Functions (`continent-app/functions/`)

Limits are per caller address (`cf-connecting-ip`). Each route has two layers (`functions/_lib/guard.js` `overLimit`): a Workers Rate Limiting binding shared across isolates in one Cloudflare location (`continent-app/wrangler.toml` `[[ratelimits]]`), then a per-isolate sliding window in memory. Refusal: 429 with `Retry-After: 60`.

| Route | Why it is heavy | Binding limit | Per-isolate limit | Other caps |
|---|---|---|---|---|
| `/api/ask/answer` | A language model on Workers AI, streamed | `RL_ASK`, 60 a minute (shared with `/api/ask`) | 8 a minute (`RATE` in `functions/api/ask/answer.js`) | Body 8192 bytes (413 above); answer 380 tokens (`MAX_ANSWER_TOKENS`, `src/lib/ask/context.js`); daily cap 9,000 Neurons of the free 10,000, worst case booked before the call (`CAP`, KV key `n:<day>`, 429 `cap`); refuses to run without the `ASK` KV binding; same question answered from KV for 7 days |
| `/api/ask` | Search over the Ask index | `RL_ASK`, 60 a minute | 60 a minute | Edge cache 1 hour per URL |
| `/api/flights` | One live Google Flights search, 10 to 25 ms CPU, needs Workers Paid | `RL_FLIGHTS`, 20 a minute | 20 a minute | Dates today to 330 days ahead only (`MAX_AHEAD_DAYS`); edge cache 1 hour, browser 10 minutes; a cache hit is not counted |
| `/api/forecast` | MET Norway weather API, whose terms ask for polite use | `RL_FORECAST`, 60 a minute | 60 a minute | Edge cache 30 minutes per cell; altitude stepped so the cache key cannot widen |
| `/api/stays` (not built) | | `RL_STAYS`, 20 a minute, declared ahead | | |

The bindings only count once the owner has created the namespaces (row T1157-a). Until then only the per-isolate window works, which resets with the isolate.

## 2. Supabase Edge Functions (`supabase/functions/`)

Every body is read with a byte limit (`_shared/http.mjs` `readJson`, 413 above it).

| Function | Why it is heavy | Per-user limit | Global limit | Other caps |
|---|---|---|---|---|
| `plan-day` | Gemini, optionally with grounded search (about EUR 0.05 worst case a unit, migration 007 header) | `ai_consume` (migration 044) against `plan_tiers`: free 2 plans that never refill (021, 044); Trip Pass 60 plans and 40 grounded over 60 days (053); Year Pass 300 plans and 120 grounded over 365 days. 2 free refines per plan in 24 hours (`REFINES_FREE`) | `AI_GLOBAL_DAILY_CAP`, default 200 units a day across the three AI functions (`ai_daily_total`) | Body 400,000 bytes; model chain at most 6 (`MAX_CHAIN`), each with a timeout; failed calls refund the unit; same request served from `ai_plan_cache` for 7 days |
| `suggest-city` | Gemini | Same ledger as `plan-day` | Same | Body 400,000 bytes |
| `parse-booking` | Gemini reading PDFs and photos | One `plan` unit per import | Same | Body 9,000,000 bytes; at most 4 files (`MAX_FILES`); cache 24 hours |
| `notify` | Sends mail through Resend | Price mail at most once a day per account, one place at most once a week, 5 places a mail (`notify/logic.mjs`) | Reminders: one daily pg_cron run (060) | Body 64 KiB |
| `price-alerts` | Sends mail; called by the box after each data refresh | One confirmation mail per opt-in | At most 2,000 checks a call (`MAX_CHECKS`) | Body 256 KiB; box calls need `PRICE_ALERTS_BOX_SECRET` |
| `waitlist` | Sends mail | One confirmation mail per address per 10 minutes (066) | | Body 4 KiB |
| `upload-scan` | Image re-encoding and GPX trimming | Called only by pg_cron with a secret | Every 15 minutes; 20 uploads scanned and 200 files purged a run (`SCAN_BATCH`, `PURGE_BATCH`) | |
| `checkout`, `billing` | Stripe API calls | Signed-in only | | Body 8 KiB, 4 KiB |

Per-user tier caps and the global cap are in the database, so a change is an `update` of `plan_tiers` or an Edge Function secret, not a deploy.

## 3. Supabase Auth and database functions

| Feature | Limit | Where |
|---|---|---|
| Sign-ups and sign-ins | 30 per 5 minutes per IP in `supabase/config.toml`; live value is a Dashboard setting, proposal 20 | `docs/owner/auth-settings.md` step 5 (T1071-a) |
| OTP and magic-link checks | 30 per 5 minutes per IP (`config.toml`); proposal 15 | Same |
| Token refreshes | 150 per 5 minutes per IP | Same |
| Auth emails | 2 an hour on the built-in sender; custom SMTP needed for launch | Same |
| Accept a co-plan link | 20 tries an hour per account; at most 5 live links per plan | `052_coplan_links.sql` |
| Admin functions | 60 a minute overall; destructive actions 10 a minute (`admin_guard` tiers) | `034_admin_guard_tiers.sql` |
| Full data export, account deletion | Password asked again in the app; one account at a time (`auth.uid()` only) | `AccountPanel.jsx`, `024_export_user_data.sql`, `005_delete_user.sql` |

## 4. Scheduled jobs

| Job | Schedule | Limit |
|---|---|---|
| Flight sweep Worker (`workers/flight-sweep/`) | Every minute (searches), every 10 minutes (publish to R2) | One search at a time, no new search after 50 s; the first refusal from Google pauses the sweep for an hour or longer; `/ingest` needs `INGEST_TOKEN` |
| Weekly pipeline (`carta-weekly`) | Monday 09:00 Brussels | `TimeoutStartSec=48h` |
| Monthly and quarterly pipeline | First Saturday; third Saturday of Jan, Apr, Jul, Oct | 84 h, 120 h |
| Stays scrape | Daily 00:05 Brussels (runs in March and September) | 7 h |
| Trails lab push | Tuesday 02:30 Brussels | 3 h |
| Nightly backup | 01:30 Brussels | 1 h |
| On-demand worker jobs (`infra/hetzner/jobs/jobs.tsv`) | By hand | Hour ceilings: selftest 1, valhalla_tiles 6, planetiler 8, clip_sweep 12, image_transcode 8, trailslab 10 (`ceiling_h`) |
| pg_cron jobs | Uploads scan every 15 minutes; privacy sweep, moderation purge, AI events prune and trip reminders daily; VAT threshold check weekly | Each a single SQL call or one function invocation |

Systemd units carry `Nice=` and some a `MemoryMax=512M` (`infra/hetzner/cron/`), so a long run does not starve the box.

## 5. Box services and local tools

| Service | Limit | Where |
|---|---|---|
| Intelligence API (`services/intelligence/`) | Token bucket per key, burst 30, 120 a minute; batches at most 100 items; bridge call timeout 10 s; container 1 GB and 2 CPUs; bound to 127.0.0.1 | Threat model section 14 |
| MCP server (`services/mcp/`) | Local stdio only; at most 25 results and 10 stops a call | Threat model section 13 |

## 6. Gaps

- The per-address bindings are not live until T1157-a is done; a spread of isolates can each allow their own window.
- `/api/ask/answer` shares the `RL_ASK` binding with `/api/ask`, so its binding limit is 60 a minute, not the 8 its own window allows. The Neurons cap still bounds the cost.
- No Edge Function has a per-address limit of its own; signed-out abuse of `waitlist` and the unsubscribe doors is bounded only by the per-address mail throttle and Supabase's platform limits.
- The live Auth rate limits are not read from the Dashboard yet (T1071-a).
