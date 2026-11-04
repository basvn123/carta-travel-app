# T1045: Carta Handbook and the roadmap to production

## Date

2026-11-04

## What changed

Carta now has one document that explains every feature and how it works: `docs/HANDBOOK.md`, 2,555 lines, 93 features in six parts (Discover; Scores, ranking and seasons; Prices and logistics; Planning; Outdoors and imagery; Ask Carta, accounts and platform). Each feature has the same five headings (What it does, How it works, Data behind it, Where it lives, Limits), and the rules are given with their real numbers and the config key or constant they come from. Six research agents read the code, config and migrations on `main` at `944c4ef0e8`; where code and docs disagreed the code was followed, and anything the code does not decide is written as "Not found in code". The repo also has a new plan of record, `ROADMAP.md`. It sets out nine tracks to the 4 May 2027 launch: repo cleanup, documentation, security, data quality, RAG and guardrails, Carta Intelligence, UI and UX, production hardening, and launch. Each track has a goal, exit criteria, research items for the owner, build items with done conditions, and dependencies. It is based on a read-only audit of the repo, docs, data quality, RAG and design. MAP.md and README.md now point to both files.

## Files touched

- Created: `docs/HANDBOOK.md`, `ROADMAP.md`, `Execution/P15/T1045-handbook-and-roadmap.md`
- Modified: `MAP.md` (pointer line), `README.md` (pointer line), `Execution/_OPEN.md` (rows T1045-a to T1045-i)

## Commands run

None that change the system. Read-only audits and research ran in subagents; the handbook was assembled from six section files by a small script in the session scratchpad.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Features explained in one document | 0 | 93 | +93 |
| MAP areas with no doc at all | 9 | 9 (all covered in the handbook; area docs follow in roadmap B2) | 0 |
| Plan of record | `Roadmap/Carta roadmap.md` (10-28, Dutch) | `ROADMAP.md` (9 tracks, 65 build and 21 research items) | replaced, old file kept until the owner approves (R-a) |

## What broke and how it was fixed

No issues. Writing the handbook found places where docs, comments or MAP no longer match the code; they are listed in the handbook's appendix and below, not fixed here (scope).

## Screens checked

None: documentation only, nothing a traveller sees changed.

## What is still open

- T1045-a: CLAUDE.md names `pipeline/schema.py` as the data contract; it does not exist, and it says tests are not in CI while 11 workflows run. Correct both (roadmap B2).
- T1045-b: MAP.md lists `RatingBreakdown.jsx` (the sheet is `browse/RatingSheet.jsx`) and points "Trip page" at `planner/finder/TripPage.jsx` (the planned trip is `planner/TripPlannerTab.jsx` with `TripSummary.jsx`).
- T1045-c: Stale comments: `rating_layer.py` docstring describes v4 weights; beauty v2 "NOT LIVE", vibe text "top fifth" (code uses top tenth), CrowdCalendar "no monthly data", sea temperature metadata years and radius.
- T1045-d: The 10% buffer exists only in Ask's budget search, not in the planner total or place card; live stays (Xotelo) inert since T1021; no place has a local transport fare. Product decision on whether the buffer belongs in the planner.
- T1045-e: The toll layer has no `run_pipeline.py` task; `search_index_layer.py` and `guided_search_layer.py` run by hand outside the registry.
- T1045-f: plan-day keeps the first 28 candidates on the server, so the trim limit of 30 never applies; no prompt version beyond `CACHE_KEY_VERSION = 6` (roadmap E5).
- T1045-g: No test checks that the six language files share their keys; the five non-English files are about 600 lines shorter than English.
- T1045-h: Own AVIF and WebP image copies are built but not live; production links photos from Wikimedia.
- T1045-i: Owner decisions in ROADMAP.md section 15 (approve the plan and archive `Roadmap/`, research rhythm, Bedrock experiment, Sentry and Langfuse, external security check, `Trips/carta-unified/`, docs site visibility).

## Rollback procedure

`git revert` of the T1045 commit. Documentation only; nothing is one-way.
