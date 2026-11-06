# T1112: Aviasales Data API coverage probe

## Date

2026-11-06.

## What changed

ROADMAP D14 asks for a measurement before any switch from the sweep to the Aviasales (Travelpayouts) Data API. `scripts/aviasales_probe.py` now asks the API, for each of the 10,094 routes in `data/flights/_routes.json` and each chosen month, whether a price comes back, how old it is, and how it compares with the cheapest sweep price for that route and month. It writes `coverage.json` and `coverage.md` with coverage overall, by origin country and by month, a freshness table and a price gap distribution (five buckets plus the median). It is resumable (answers append to `results.jsonl`; reruns skip answered pairs and retry errors), rate limited (default 2 requests per second, backoff on 429 and 5xx), and reads the token only from `AVIASALES_TOKEN` (header `X-Access-Token`, never printed or written). The API host and token are not reachable from the cloud container, so it was run on recorded fixtures only; the real run is an owner step.

Assumptions to confirm on the first real call (use `--limit 20`): the endpoint is `/aviasales/v3/prices_for_dates` with `departure_at=YYYY-MM`, and the response carries `data[].price`; freshness uses `found_at` when present and reports "unknown" otherwise (v3 may not return it; then use the v2 latest endpoint or accept coverage-only).

## Files touched

- `scripts/aviasales_probe.py` (new)
- `tests/test_aviasales_probe.py` (new, 7 tests)
- `tests/fixtures/aviasales/` (new: 3 recorded responses, a 3-route list, airports, a sweep CSV)
- `ROADMAP.md` (D14 status), `Execution/_OPEN.md` (rows), this report

## Commands run

- `python -m pytest tests/test_aviasales_probe.py -q` (7 passed)
- `ruff check scripts/aviasales_probe.py tests/test_aviasales_probe.py` (clean)

## Config and secrets set

None. The owner supplies `AVIASALES_TOKEN` at run time.

## Before/after measurements

Not measured. The coverage numbers are what the owner run produces.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Ruff DTZ011, F541, ISC004 | First draft | Timezone-aware today, plain string, parenthesised head |

## Screens checked

None; no traveller-facing change.

## What is still open

- T1112-a: the real run (owner step below). The sweep export for the comparison is optional but needed for the gap table.
- T1112-b: after the run, a decision task: switch, hybrid or stay, from the coverage table (threshold to be set by the owner; no number is assumed here).

## Rollback procedure

`git revert` the T1112 commit. Nothing else depends on the script.

## Owner steps (for the checklist)

- [T1112-a] Run the Aviasales coverage probe | the cloud container cannot reach the API and has no token, so the real coverage is unmeasured | export the sweep fares (`SELECT origin AS o, dest AS d, date, price FROM fares`) to `cache/flights/sweep_export.csv`; `export AVIASALES_TOKEN=<your Travelpayouts token>`; smoke test `python scripts/aviasales_probe.py --months 2027-01,2027-02 --limit 20 --out cache/flights/aviasales_probe`; then the full run `python scripts/aviasales_probe.py --months 2027-01,2027-02 --sweep cache/flights/sweep_export.csv --out cache/flights/aviasales_probe` (about 20,200 requests at 2 per second, roughly 2.8 hours; rerun the same command to resume; raise `--rps` only if the Travelpayouts limit allows); send back `cache/flights/aviasales_probe/coverage.md` | scripts/aviasales_probe.py
