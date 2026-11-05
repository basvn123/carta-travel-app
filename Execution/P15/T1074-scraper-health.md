# T1074: Scraper and source health (ROADMAP D5)

## Date

2026-11-05

## What changed

The Hostelworld "677 pages, 0 prices" sessions turned out not to be a parser fault, so the parser is unchanged and now has a card test. The journal shows the same parser read 13,930 prices over 1,613 pages on 23 and 24 October (389 places); the zero sessions are the 678 places left over, 677 of them village destinations (`gem:` ids such as zonnebeke, zlin, hallstatt) for which Hostelworld has no list, plus STN. The scraper logged "no cards" for each of them, once per run and month, and the hourly task repeated it. The scraper's session line now counts `pages with no cards`, so this reads as nothing to find, not as a broken parser. The inert Xotelo live-stays path is removed (function, app module, rule, test, five call sites). A new health script computes yield per source per run (alert below 70% of the median of the previous 7 runs) and price drift per place (alert above 25%), writes a JSON report and exits 1 on alerts. Booking stays paused (blocked since 30 October), with no evasion. Box and owner steps are in `Execution/P15/_OPEN-scraper-health.md`.

## Files touched

- Created: `scripts/stays_health.py`, `tests/test_stays_health.py`, `pipeline/stays/tests/test_hostelworld_cards.py`, `pipeline/stays/tests/fixtures/hostelworld_cards.json`, `Execution/P15/_OPEN-scraper-health.md`, this report.
- Modified: `pipeline/stays/scrape_hostelworld.py` (session line counts empty pages), `continent-app/src/lib/stayPrice.js` (live branch, `liveStayRatio` and the `live` option removed), `continent-app/src/App.jsx`, `src/browse/ask/AskTripCard.jsx`, `src/browse/DestPriceCard.jsx`, `src/browse/TripPriceCard.jsx`, `src/hooks/useTripPlanner.js` (live asks removed; each still re-renders on `useStaysVersion`), `continent-app/config/pricing.json` (`stay.live` rule removed), `continent-app/tests/priceSources.test.mjs` (stayPrice.js leaves the kernel list), `tests/priceEngine.test.mjs` (comment), `docs/HANDBOOK.md` (Live stays section, Stays scraper health paragraph, known-gaps row).
- Deleted: `continent-app/functions/api/stays.js`, `continent-app/src/lib/liveStays.js`, `continent-app/tests/liveStays.test.mjs`.

## Commands run

```
python -m pytest pipeline/stays/tests tests/test_stays_health.py -q
python scripts/stays_health.py --logs <main checkout>/logs --journal <main checkout>/cache/stays/journal_scrape.sqlite --out <temp>
node --test tests/priceSources.test.mjs tests/priceConfig.test.mjs tests/priceEngine.test.mjs tests/priceDisplay.test.mjs
python -m ruff check --select E9,F63,F7,F82 pipeline src scripts tests
```

## Config and secrets set

None. The `stay.live` rule is removed from `continent-app/config/pricing.json`. The Pages variable `LIVE_STAYS` has no function to read it now and can be deleted in the Cloudflare dashboard.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Hostelworld sessions with prices per page, first run (23 to 24 Oct) | 3,374 prices over 1,613 pages | unchanged (parser untouched) | 0 |
| Hostelworld places in the journal with a price | 389 (252 of them `gem:` places) | unchanged | 0 |
| Places the scraper found no cards for | 678 (677 `gem:`, plus STN), shown only as "0 prices" | counted in the session line | named |
| Health script on the real logs and journal | none | one alert: booking latest run 20.0 prices per page, 69% of the previous 7 runs' median 29.2 | new |
| Stays pytest | 41 | 44 (+3 card tests) plus 7 health tests | +10 |
| Live stays code | 3 files, 5 call sites, 1 rule | 0 | removed |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `priceConfig` V13 failed after the first removal | the `stay.live` rule named `tests/liveStays.test.mjs` | rule removed from `pricing.json` |
| `priceSources` V2 "stale allowed entry" | `stayPrice.js` no longer calls the price engine once `liveStayRatio` is gone | entry removed from the kernel list |
| The health check on the real data alerts for booking | the latest Booking session (the 30 Oct block) read fewer prices per page | expected: the alert is the signal; Booking stays paused |
| Hostelworld gives no yield alert although its latest runs are 0 | the median of its earlier runs is 0 (four of five earlier sessions found nothing), so 70% of it is 0 | known limit of a median baseline; the empty runs are the villages above, and the log now says so |

## Screens checked

Not checked in the browser (no dev server in this run). The end check must look at: the Plan trip card and the trip planner total on a dated trip, a destination page price card with own dates, the Explore day-price cards with a date range set, and Ask's trip card, at phone and desktop width. None should change: a bed price comes from the scrape model alone, as before (no place carried `xk`).

## What is still open

- T1074-a: put a real Hostelworld card capture in the fixture; the test cards are built from the journal's price text (box step 2 of the open file).
- T1074-b: dead leftovers of live stays: `stay.live` strings in six catalogues, `stayLive` in `costIndex.js`, the `live` bed quality in `priceDay.js`, `liveBed` in `AskTripCard.jsx`, `xk` in `docs/SCHEMA.md`, `pipeline/stays/live_keys.py` and the Xotelo attribution entry (T1021-e); remove them in a cleanup task that also touches the catalogues.
- T1074-c: wire the health run and the email on the laptop and box, and switch on the box's monthly stays build (T1021-a); owner and box steps.
- T1074-d: the hourly Hostelworld and Booking tasks run empty; pausing them is T1046-a.

## Register rows to add

| T1074-a | T1074 | Replace the synthetic card fixture in pipeline/stays/tests/fixtures/hostelworld_cards.json with one real Hostelworld list capture from the laptop (Execution/P15/_OPEN-scraper-health.md step 2) | user | open |  |
| T1074-b | T1074 | Remove the dead leftovers of live stays: `stay.live` catalogue strings, `stayLive` in costIndex.js, the `live` bed quality in priceDay.js, `liveBed` in AskTripCard.jsx, `xk` in docs/SCHEMA.md and pipeline/stays/live_keys.py | next task | open |  |
| T1074-c | T1074 | Wire scripts/stays_health.py and its email on exit 1 on the laptop and the box, and switch on the monthly stays build (T1021-a) (Execution/P15/_OPEN-scraper-health.md steps 1, 3, 4) | user | open |  |

## Rollback procedure

`git revert` the T1074 commits. Nothing live was written. The deleted Pages function is restored by the revert; it sent no requests before, since no place carried `xk`.
