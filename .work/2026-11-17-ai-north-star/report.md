# Run report · AI north star (E1, E3, E4, E7)

Status: approved by the owner 2026-11-17 ("Go on"); build lanes wait for the house style on main.

## What ran
- Six explorers: Ask UX and app links, model and hosting alternatives, competitors, AI surfaces, evals, cost floor.
- Three proposals: copilot everywhere, concierge hub, quiet intelligence.
- Four critics: accuracy, design, cost and feasibility, privacy and trust.
- One synthesis (`proposal-final.md`, saved as `decision.md`); a fresh judge scored it 92 of 115, every criterion at 4 (`judgement-1.md`). Orchestrator fixes after judging: latency budget (Slow state, E-latency row), `results.mjs` extended rather than new, the place page file named, owner decision 15 (offline AI judge).

## The decision in brief
Cheapest layer first: code, then precomputed files, then a live model. The verifier must find each figure in a cited note before anything else ships. No model writes a digit. Every saving is gated by a paired non-inferiority test. Ask stays in today's panel, with in-context doors and history inside the panel; the concierge hub waits for funnel data. Launch cut: 11 lanes, about 29 lane days. Scenario cost: about EUR 3, 28 and 428 a month at 1k, 10k and 100k MAU, against 7, 77 and 1,175.

## Files changed
| File | What changed | Why |
|---|---|---|
| none in the project | this run wrote only its run folder (`.work/2026-11-17-ai-north-star/`) and a memory note | research run; build lanes come after the house style |
| `docs/research/2026-11-17-data-quality.md` | not written by this run: created by another session's data-quality research run (`.work/2026-11-17-data-quality-research/`) while this run was open | listed because it appeared in the working tree during this run; that run owns it |
| `cache/geonames/admin1CodesASCII.txt`, `cache/geonames/alternateNamesV2.zip`, `cache/geonames/countryInfo.txt` | not written by this run: GeoNames downloads refreshed on 2026-11-18 18:16 by a pipeline task or another session | listed because they changed during this run; this run made no tool call outside its run folder and memory |
| `continent-app/src/admin/pipelineOverrides.json` | not written by this run: modified on 2026-11-19 00:33 by another session (uncommitted) | same; the owning session commits or reverts it |
| `data/derived/freshness_report.json` | not written by this run: rewritten on 2026-11-19 00:35 by a pipeline run in another session (uncommitted) | same; this run wrote nothing outside its run folder and memory. Any other file that changes in the shared checkout after 2026-11-17 belongs to other sessions too |

## Undo
Nothing to undo.
