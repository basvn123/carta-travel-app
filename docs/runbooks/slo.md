# Runbook: service level objectives

ROADMAP H8, task T1160. One config, `continent-app/config/slo.json`; the maths in `continent-app/src/lib/slo.js`; the owner-only panel `continent-app/src/components/admin/SloPanel.jsx` (data from `src/admin/sloSnapshot.json` through `src/hooks/useSloSnapshot.js`). Tests: `continent-app/tests/slo.test.mjs`.

## How an SLO and its budget work

- **ratio**: good events / all events must stay at or above `target`. The error budget is the bad events the target allows, `(1 - target) x total`. Budget left = `1 - bad / allowed`.
- **latency**: at most `1 - quantile` (5 percent for p95) of the calls may be slower than `threshold_ms`. The budget is that share of the calls. When a source only knows a p95, the panel shows inside or spent, with no budget bar.
- Status: `ok` above `burn.warn_below` (25 percent left), `warn` below it, `breached` at zero or less, `nodata` when the source has nothing (never shown as ok).
- Window: `window_days` (30), the length of the sources' history.

## The SLOs and why these targets

A one-person product with no on-call rota: targets are set where a miss changes what the owner does, not at the number a large team would print.

| SLO | Target | Source | Why |
|---|---|---|---|
| Uptime | 99.5% of monitor runs green | uptime workflow runs (every 15 min, about 2,880 a month) | 99.5% allows about 3.6 hours of red a month, a day of Cloudflare or Supabase trouble would spend it |
| Error rate: ask, flights, stays | 99% of requests without a server error | Sentry events (T1120) over Pages Functions request counts | the first sign of a bad deploy |
| Error rate: plan-day, parse-booking | 97% of calls not `failed` | `ai_model_events` kind `call` (071, T1139) | model providers fail more often; a refusal or fallback is not a failure |
| p95 latency | ask 8 s, plan-day 20 s, parse-booking 10 s, flights and stays 4 s | `ai_model_events.latency_ms`; function analytics | thresholds sit above today's measured p95 so the budget means something |
| Freshness | 90% of wires inside their cadence | `scripts/freshness_report.py` (T1099) | one stale wire of nine is a warning, two is a spent budget |

Targets are first guesses (the H-R1 research row is open). Review them after the first month of real snapshots.

## Getting numbers into the panel

The panel renders a snapshot, `{ generatedAt, windowDays, data: { <slo id>: ... } }`; `buildSnapshot()` in `slo.js` builds it from raw rows: the list of Actions runs of `uptime.yml`, the `ai_model_events` call rows, the freshness report JSON and per-route function stats. The collector that fetches those needs the owner's keys and is an owner step (T1160-b). Until then the shipped snapshot is empty and the panel says so. The panel is not yet mounted in `AdminPage.jsx` (T1160-a).

## Drill

`python -I ops/drill/drill.py --out docs/runbooks/drill-log.md` walks a seeded incident on a local stack and writes the timeline. The live drill is described in [incident.md](incident.md#drill).
