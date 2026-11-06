# T1139: LLM observability (ROADMAP E4)

## Date

2026-11-06

## What changed

Every call through the model gateway now leaves one privacy safe event. `aiModels.callModel` (and its Pages copy) builds the event after each call, answered or refused, and writes it to `ai_model_events` as a `call` row: feature, provider, model, prompt id and registry version, tokens in and out, a cost estimate, latency and outcome. No prompt or answer text, no user id; Ask's question is kept only as a salted SHA-256. Migration 071 extends the existing table from 028, keeps RLS closed (only the service role writes), prunes call rows after 30 days, and adds `admin_ai_calls_weekly` (calls, failure counts, p50, p95, cost per feature per week, cost per day). A new admin panel `AiCalls.jsx` with its hook renders that view. The pipeline gateway (`ai_gateway.py`) records the same events in memory and, with `AI_EVENTS_JSONL`, in a file. An optional Langfuse export exists and is off unless `AI_TRACE_LANGFUSE=on` and three more keys are set; it sends metadata only. Before: only plan-day logged a fallback row. After: all four traveller features and the eval judge log every call. Nothing is live: the migration paste, the deploys, the secrets and mounting the panel are owner or next task steps.

## Research

Choice: storage in the existing Postgres table (no new service), Langfuse as the optional tracer because T1148 already prepared its compose file. A research subagent was blocked from ai.google.dev, developers.cloudflare.com and langfuse.com, so prices and the Langfuse ingestion body are NOT verified against primary sources.
- Gemini prices (aggregator sources, undated, unverified): gemini-3.1-flash-lite 0.25 / 1.50 USD per 1M tokens (benchlm.ai, costbench.com); gemini-3.5-flash-lite 0.30 / 2.50 (hashnode, July 2026, one source); 2.5 flash-lite 0.10 / 0.40. The `-latest` aliases could not be resolved to a model. The table in `aiEvents.mjs` uses these and prices unknown models at the dearest known, so the estimate errs high. Recommendation from the subagent: pin explicit model ids (S54 owns model config).
- Workers AI: 0.011 USD per 1,000 Neurons from memory, unverified.
- Langfuse ingestion: `POST {host}/api/public/ingestion`, Basic auth (public key as user), batch of `generation-create` events, input and output optional. From memory, unverified; newer versions may prefer `usageDetails` or OTel ingestion.
- Self-hosted tracers (memory): Langfuse v3 MIT but needs ClickHouse, Postgres, Redis and S3 (heavy, about 4 GB); Phoenix is the lightest single container but Elastic License 2.0; Helicone is a proxy with a multi-service stack; OpenLLMetry is only an SDK needing a backend. Langfuse stays because T1148-b already installs it and the Postgres table is the primary record, so the exporter is optional.

## Files touched

- `supabase/functions/_shared/aiEvents.mjs` (new), copy `continent-app/functions/_lib/aiEvents.mjs`
- `supabase/functions/_shared/aiModels.mjs` (event hook around callModel), copy `continent-app/functions/_lib/aiModels.js`
- `continent-app/functions/api/ask/answer.js` (query hash and waitUntil passed to callModel, nothing else)
- `pipeline/ai_gateway.py` (event per call), `tests/test_ai_gateway.py`
- `supabase/migrations/071_ai_model_events_calls.sql`, `071_ai_model_events_calls_down.sql`
- `continent-app/src/components/admin/AiCalls.jsx`, `useAiCalls.js`, `continent-app/src/lib/aiCalls.js`, `continent-app/src/i18n/en.js` (11 `admin.aiCalls.*` keys appended)
- `continent-app/tests/aiEvents.test.mjs` (new), `continent-app/scripts/admin/test_rls_policies.mjs`, `test_admin_rpc_security.mjs`
- `docs/HANDBOOK.md` (admin section), `ROADMAP.md` (E4 status), `Execution/_OPEN.md`

## Commands run

- `cd continent-app && node --test tests/aiEvents.test.mjs tests/aiGateway.test.mjs`
- `python -m pytest tests/test_ai_gateway.py -q`
- A throwaway PostgreSQL 16 on port 55437: `PGHOST=127.0.0.1 PGPORT=55437 PGUSER=postgres node continent-app/scripts/admin/test_rls_policies.mjs`, then `test_admin_rpc_security.mjs` and `test_privacy_gdpr.mjs`
- `cd continent-app && npm test`, `node scripts/ci/design-lint.mjs`

## Config and secrets set

None set. Needed by the owner (see Owner steps): `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the Pages project (Edge Functions have them already), `AI_EVENTS_SALT`, optional Langfuse keys.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Features writing a per-call event | 1 (plan-day, fallbacks only) | 5 (ask, plan-day, suggest-city, parse-booking, eval-judge) | +4 |
| continent-app node tests | n/a | 1675 pass, 0 fail (final run) | |
| RLS harness assertions | 846 | 847 pass, 0 fail (+9 for call rows, prune and bypass posture) | |
| Admin RPC harness | 285 | 285 pass, 0 fail (includes 5 new for the weekly view) | |
| Live traffic figures (calls per day, p50, cost) | Not measured | Not measured: nothing is deployed | |

The one failing npm test, `design-lint reports no new motion-literal`, was my two middots in AiCalls.jsx; fixed, and the lint now reports 0 new (4,612 of 4,612 baseline). The full suite was re-run after the fix: 1675 pass, 0 fail.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `ai_model_events` already existed | Migration 028 made it a per-user fallback log (user_id not null, kind plan or ground) | 071 extends it: user_id nullable, kind `call` allowed, a check forces call rows to have no user id; the 028 report is re-created to count plan and ground rows only so call rows do not double it |
| Service role insert failed in the RLS harness | The stub `service_role` has no BYPASSRLS, the real one has | The new block sets bypassrls for its checks and resets it |
| Retention clash | 069 sweeps this table at 180 days | Call rows get their own 30 day prune; plan rows stay at 180. ARTICLE30 not edited (outside scope), see T1139-e |

## Screens checked

None in a browser. The panel is not mounted in the Overview (that file is outside this task's scope), so there is no screen to look at yet; it renders from fixtures in `aiEvents.test.mjs` (static markup checked for calls, failure rate, p50, p95, cost, cost per day, and empty for an error or null report).

## What is still open

Rows T1139-a to T1139-f in `Execution/_OPEN.md`. Notably: a stream (Ask) reports no output token count, so Ask rows carry estimated input tokens and null output tokens and a cost for input only; fixing that means counting the streamed text in answer.js after the stream ends.

Rollback: `git revert` the T1139 commits; for the database run `071_ai_model_events_calls_down.sql` (one way for call rows, which it deletes).

## Owner steps (for the checklist)

- [T1139-a] Paste migration 071 | Without it no event is stored and the admin view stays empty | open the Supabase SQL editor; paste 071_ai_model_events_calls.sql after 028 and 069; check `select count(*) from cron.job where jobname='carta_ai_events_prune'` is 1 (enable pg_cron first if it is 0) | supabase/migrations/071_ai_model_events_calls.sql
- [T1139-b] Deploy the gateway with event logging | The events only flow once the new code runs | deploy plan-day, suggest-city, parse-booking and the Pages build (the same deploy as T1137-a and T1140-a); in the Pages project add SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and AI_EVENTS_SALT (a random 32 character string) as secrets | Execution/P15/T1139-llm-observability.md
- [T1139-c] Optional: turn on Langfuse export | Traces on the build box beside the table | after T1148-b is installed, set AI_TRACE_LANGFUSE=on, LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY as function secrets; check one trace appears; leave off otherwise | continent-app/scripts/eval/langfuse/README.md
