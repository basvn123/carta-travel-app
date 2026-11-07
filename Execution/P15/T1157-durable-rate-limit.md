# T1157: Durable rate limiting (ROADMAP H3)

## Date

2026-11-06

## What changed

The Pages Function limiter in `continent-app/functions/_lib/guard.js` now asks a Workers Rate Limiting binding per endpoint (`RL_ASK` for ask and answer, `RL_FLIGHTS`, `RL_STAYS`, `RL_FORECAST`), then the older shared `RATE_LIMIT` binding, then the in-memory window. Bindings are shared by every isolate in a location, so a burst no longer resets when an isolate does. A missing or failing binding falls back to the in-memory window, so local dev and tests need no binding. The four bindings are declared in `continent-app/wrangler.toml` (ask 60, flights 20, stays 20, forecast 60 per 60 s per address). Creating them is the owner's.

## Research

Research subagent, with the caveat that developers.cloudflare.com was unreachable, so Pages support is unconfirmed (owner step T1157-a).

| Option | Verdict |
|---|---|
| Workers Rate Limiting binding | Chosen. Shared across isolates in a location, no extra cost, fits the existing code path. Per location and eventually consistent; period 10 or 60 s only. |
| Durable Object | Rejected. Only option with one global exact counter, but Pages cannot define the class: it needs a second Worker and billing. Overkill for three endpoints. |
| WAF rate rule | Kept as the owner's backstop if Pages refuses the binding (one rule on the three paths, dashboard only). |

Links: developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/, /pages/functions/wrangler-configuration/, /waf/rate-limiting-rules/.

## Files touched

- continent-app/functions/_lib/guard.js
- continent-app/wrangler.toml
- continent-app/tests/functionGuards.test.mjs
- docs/HANDBOOK.md, ROADMAP.md (H3), Execution/_OPEN.md, Execution/_OPEN-CLOSED.md

## Commands run

`cd continent-app && npm ci && node --test tests/functionGuards.test.mjs` (11 pass), then `npm test`.

## Config and secrets set

None. Binding entries in wrangler.toml only; namespaces are created by the owner.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Limit state for flights across fresh isolates (stub binding, limit 2, 3 calls) | not shared (in-memory per isolate) | third call refused | enforced via binding |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Edge Function gap | The per-address limit cannot use a Cloudflare binding on Supabase; per-user ai_consume caps are already in the database | Not edited (outside scope); register row T1157-c. T1079-d closed on that finding |

## Screens checked

None (no traveller-facing change).

## What is still open

- T1157-a: create the namespaces and confirm Pages accepts `[[ratelimits]]`.
- T1157-b: /api/stays has no Function in this repo, so its limit call site does not exist yet; the binding is declared.
- T1157-c: per-address limit for Edge Functions needs an owner decision.

## Owner steps (for the checklist)

- [T1157-a] Create rate limit bindings | the limits only hold across isolates once Cloudflare has the bindings | in Pages, deploy a preview and check the build accepts the `[[ratelimits]]` entries; if it rejects them add one WAF rate rule on /api/ask, /api/flights, /api/stays (Security, Security rules, Rate limiting); check a burst returns 429 | continent-app/wrangler.toml, Execution/P15/T1157-durable-rate-limit.md
- [T1157-c] Decide the Edge Function per-address limit | Supabase functions have only per-user caps | choose a database counter by address or a WAF rule in front of the Supabase domain | Execution/_OPEN.md

## Rollback procedure

`git revert` of the T1157 commits. Nothing live changed.
