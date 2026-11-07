# T1213: Data access ladder

ROADMAP item I16 (round 3 session S129, batch 16).

## Date

2026-11-07.

## What changed

Each commercial data source now has a written, dated record (`docs/data/access-ladder.md`), its thresholds and flag names sit in `continent-app/config/access-ladder.json`, and three fetchers carry a flag that is off by default: the flight sweep Worker (`LADDER_STOP_GOOGLE_FLIGHTS`), `scrape_booking.py` (`LADDER_STOP_BOOKING_SCRAPE`) and `scrape_hostelworld.py` (`LADDER_STOP_HOSTELWORLD_SCRAPE`). Two more flags are reserved with no code path (live flight search, activity prices). Nothing is switched live. The router was not touched.

## Research

A research subagent re-checked the terms on 2026-11-07. Options and result: the Aviasales Data API, Viator Basic and the Tiqets API are the only gated-free routes open now; real-time flight search needs about 50,000 monthly users; Booking.com needs a contract; Hostelworld is affiliate only; Google Flights has no legal route. Limit: the container could not fetch the official hosts, so the answers come from search snippets and the scraping, caching and storage clauses are UNVERIFIED (owner step T1213-a). Links are in the doc.

## Files touched

Created: `docs/data/access-ladder.md`, `continent-app/config/access-ladder.json`, `continent-app/workers/shared/ladder.mjs`, `pipeline/stays/ladder.py`, `continent-app/tests/accessLadder.test.mjs`, `tests/test_access_ladder.py`.
Modified: `continent-app/workers/flight-sweep/src/index.mjs`, `pipeline/stays/scrape_booking.py`, `pipeline/stays/scrape_hostelworld.py`, `ROADMAP.md` (I16), `Execution/_OPEN.md`.

## Commands run

`node --test tests/accessLadder.test.mjs`, `python -m pytest tests/test_access_ladder.py`, `ruff check` on the new Python files.

## Config and secrets set

None. The flags are environment variables the owner sets later.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Sources with a dated record | 0 | 5 |
| Flags on by default | n/a | 0 (tested) |
| New tests | | 4 JS, 3 Python, all passing |

Full `npm test`, lint and the whole pytest run were not completed in this session (see What is still open).

## What broke and how it was fixed

A `git stash` used to compare ruff output on the scrapers was refused by the sandbox; I did not retry it. The scraper edits are two lines each.

## Screens checked

None. Nothing a traveller sees changed.

## What is still open

- T1213-a: read the official scraping, caching and storage clauses (owner step).
- T1213-b: the 80% coverage threshold is a starting value until the P1 run.
- T1213-c: the K12 admin view does not show the unlock numbers yet (T1109-b); the new config is not in `config_reference.py`.
- T1213-d: the late sweep on the Hetzner box has no flag yet (owner box, outside this repo's Worker).
- T1213-e: the full CI checks (npm test, lint, full pytest, docs checks) still need a run by the orchestrator.

## Owner steps (for the checklist)

- [T1213-a] Read the partner terms | the research could not fetch official pages, so scraping, caching and storage clauses are unverified | open the links in docs/data/access-ladder.md and note the clauses for Aviasales, Booking, Hostelworld, Viator, Tiqets | docs/data/access-ladder.md
- [T1213-f] Sign up for the Travelpayouts Data API | needed for the P1 coverage run on 10,094 routes | create the account; copy the token into the pipeline environment; run the coverage measurement | docs/data/access-ladder.md
- [T1213-g] Set the Google Flights stop flag | scraping must stop before the first paid sale | set LADDER_STOP_GOOGLE_FLIGHTS=1 on the sweep Worker; stop the late sweep on the Hetzner box | docs/data/access-ladder.md
- [T1213-h] Review decision I-g | Booking's terms may forbid scraping and endanger the affiliate account | decide A or C before the P4 application; set LADDER_STOP_BOOKING_SCRAPE=1 if C | docs/data/access-ladder.md
- [T1213-i] Apply to partners | the Flight Search API, Booking, Hostelworld, Viator, Tiqets and GetYourGuide are the owner's applications | apply at the milestones in the doc, with click numbers | docs/data/access-ladder.md

## Rollback procedure

`git revert` of the T1213 commits. The flags default off, so nothing changes in behaviour either way.
