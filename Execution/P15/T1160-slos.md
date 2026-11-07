# T1160: SLOs, error budgets and an incident drill (S76, ROADMAP H8)

## Date

2026-11-07.

## What changed

Carta now has written service levels. `continent-app/config/slo.json` holds 12 SLOs (uptime, error rate for ask, flights, stays, plan-day and parse-booking, p95 latency for the same five, data freshness), each with its target and the source that feeds it (uptime workflow runs, Sentry plus function analytics, `ai_model_events`, the freshness report). `continent-app/src/lib/slo.js` turns a snapshot of those sources into an error budget per SLO (ok, warn, breached, or no data, never ok by default). An owner-only panel, `SloPanel.jsx` with `useSloSnapshot.js`, shows each SLO, its measure, target, budget bar and status; it renders from fixtures in tests. `ops/drill/drill.py` walks a seeded incident on a local stack (healthy wire, truncate the trails index, `check.py` detects, the alert reaches a local pager, the last good file is restored, green again) and writes `docs/runbooks/drill-log.md`. Before: no SLOs, no drill. After: 12 SLOs, 7 JS and 3 Python tests, one drill run written up.

## Research

None chosen as a tool or service: the maths is the standard SRE error budget (ROADMAP H-R1 names the Google SRE book and Hidalgo as its sources; that row is still open, so the targets are first guesses and say so in `docs/runbooks/slo.md`). The drill reuses `scripts/monitor/check.py` instead of a chaos tool, so it exercises the real detector; the cloud container cannot reach the live stack anyway.

## Files touched

Created: `continent-app/config/slo.json`, `continent-app/src/lib/slo.js`, `continent-app/src/hooks/useSloSnapshot.js`, `continent-app/src/components/admin/SloPanel.jsx`, `continent-app/src/admin/sloSnapshot.json` (empty snapshot), `continent-app/tests/slo.test.mjs`, `ops/drill/drill.py`, `tests/test_incident_drill.py`, `docs/runbooks/slo.md`, `docs/runbooks/drill-log.md`, this report.
Modified: `docs/runbooks/incident.md` (Drill section), `ROADMAP.md` (H8), `Execution/_OPEN.md`.

## Commands run

`cd continent-app && node --test tests/slo.test.mjs`; `python -m pytest tests/test_incident_drill.py`; `python -I ops/drill/drill.py --out docs/runbooks/drill-log.md`; `ruff check ops tests/test_incident_drill.py`.

## Config and secrets set

New `continent-app/config/slo.json`. No secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| SLOs defined | 0 | 12 | +12 |
| Drill steps passing locally | none | 6 of 6 | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Budget values like 100.00000000000009 failed exact tests | float multiplication | rounded to 6 places in `slo.js` |
| `docs/reference/config.md` does not list `slo.json` | `scripts/docs/config_reference.py` has a fixed file list and is outside this task's files | register row T1160-e |

## Screens checked

None in a browser (panel is not mounted in `AdminPage.jsx`, which is outside this task's files). Rendered to static markup in `slo.test.mjs`: every row, the breached, ok and no-data states, and the empty snapshot message.

## What is still open

- T1160-a: mount `<SloPanel />` as a section in `AdminPage.jsx` (add `slo` to `SECTIONS` and an `admin.nav.slo` key in all six languages).
- T1160-b: write the collector that fetches the four sources and writes `sloSnapshot.json` (needs the owner's GitHub, Sentry and Supabase keys); `buildSnapshot()` already does the mapping.
- T1160-c: run the drill on the live stack (owner step).
- T1160-d: review the targets after a month of real snapshots; close the H-R1 research row.
- T1160-e: add `slo.json` to the config reference generator.

## Owner steps (for the checklist)

- [T1160-b] Feed the SLO panel | the panel is empty until a snapshot exists | give a task the GitHub token, Sentry token and Supabase service key it needs for the collector; run it weekly on the box; commit or push the snapshot | docs/runbooks/slo.md
- [T1160-c] Run the live incident drill | proves the page reaches your phone and the notice works | follow the Live steps in incident.md, note the times in drill-log.md | docs/runbooks/incident.md

## Rollback procedure

`git revert` the T1160 commits. Nothing live changed: no migration, deploy or data touched.
