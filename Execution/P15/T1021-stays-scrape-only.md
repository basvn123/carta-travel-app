# T1021: stay prices come from the Booking and Hostelworld scrape alone

## Task ID
T1021

## Date
2026-11-03

## What changed
The owner decided (2026-11-03) that the laptop's Booking.com and Hostelworld scrape is the single source of truth for bed prices, and that the box should rebuild the prices from it each month. The 44 per-country stay files the app read were built on 21 October, before the scrape ran. They mixed Xotelo hotel rates, Inside Airbnb medians, a Eurostat season fill, star ratios, and nearby, country and Europe fallbacks.

Now:
- **The builder** (`pipeline/stays/build_stays.py`) reads only `journal_scrape.sqlite`.
- **Months:** the scrape priced five check-in days (12 Jan, 16 Mar, 18 May, 17 Aug, 12 Oct 2027). Another month takes the nearest scraped month before or after it in the same year, and a tie goes to the earlier month (owner). `season_q` marks the scraped months `m`.
- **Unpriced places:** a place the scrape did not reach gets no record (owner: "Not available yet"). On the place page that follows the 2026-10-30 rule that missing data leaves: no price card, but "Plan a trip here" stays.
- **Entire place:** Booking apartments searched for two, written as `bnb_home {"2": ...}`. A bigger group books as many places as it fills (`stayPrice.js`).
- **Hotels:** star classes only where at least two hotels of that class were priced. Nothing is scaled any more.
- **Guesthouse room:** there is no Airbnb or guesthouse room tier now. The planner's stay slot offers the entire place where it offered "Guesthouse room" (`config/slots.json`), so a room is never priced as a flat under the wrong name.
- **The box:** `pipeline/stays/box_stays.py` is the monthly box task `stays` in `run_pipeline.py`. It downloads the journal from R2, builds with the gate (judged against the live build, or the copy the app ships), and on a pass publishes to `r2:carta/data/stays-live/v1/`. It is not switched on yet: see `Execution/P15/_OPEN-stays-box.md`.
- **Deleted:**
  - `discover_xotelo.py`, `price_xotelo.py`, `xotelo.py`
  - `harvest_iab.py`, `harvest_eurostat.py`, `harvest_supply.py`
  - `calibrate_serpapi.py`, `calibrate_live.py`, `live_keys.py`
  - `.github/workflows/stays-refresh.yml`
  - the `stays_discover` task
  - the unused `stays.model` and `gate.stays` keys
  - the Inside Airbnb neighbourhoods `apply_stays` added
- **Moved:** the scrape's date helpers (`probe_day`, `peak_days`, `easter`) went to `common.py`, so the laptop scrapers keep working.

Found and fixed on the way:
- **Country briefs counted gateways.** They priced every place, gateways included, before leaving gateways out, so an out-of-bounds bed borrowed a median that counted airport places.
- **Match below 55%.** The trip finder showed a match under its 55% floor when a budget penalty pulled a fitting trip's score down. The floor now applies to the shown figure.

The month curves are mostly flat. Booking's list prices for the same property barely move between the five dates, and the build matches each property against itself (the right method, since each date lists different properties). The When to go redesign (T1022) must say "prices hardly change through the year" well, rather than invent a season.

## Files touched
**Modified:**
- Pipeline:
  - `pipeline/stays/build_stays.py`, `apply_stays.py`, `common.py`, `scrape_booking.py`, `scrape_hostelworld.py`
  - `pipeline/stays/tests/test_stays.py`, `test_gate.py`, `test_contract.py`, `test_weighting.py`
  - `run_pipeline.py`
- Config: `continent-app/config/pricing.json`, `continent-app/config/slots.json`
- App:
  - `continent-app/src/lib/costIndex.js`, `stayPrice.js`, `countryBrief.js`, `recommend/rank.js`
  - `continent-app/src/browse/DestPriceCard.jsx`, `DestinationPage.jsx`
- App tests: `continent-app/tests/firstRun.test.mjs`, `priceEngine.test.mjs`, `recommendSlots.test.mjs`
- Data: `continent-app/public/app_data.json`, plus the master `app_data/app_data.json` and `public/stays/v1/`, which git ignores

**Created:**
- `pipeline/stays/box_stays.py`
- `Execution/P15/_OPEN-stays-box.md`
- `Execution/P15/T1021-shots/`

**Deleted:** the nine scripts above and `.github/workflows/stays-refresh.yml`.

## Commands run
- `python pipeline/stays/build_stays.py --gate --fresh`: passed, 0 blocking. `--fresh` judges against nothing, because the old mixed-source build would block every intended change.
- `python pipeline/stays/apply_stays.py`: 3,353 blocks, baked into `public/stays/v1`.
- `npm run data` (sync-data): the split wire rebuilt; round trip exact.
- `python -m pytest pipeline/stays/tests`: 41 pass.
- `npm test`: 1213 pass, 0 fail.
- Root `python -m pytest tests`: 58 failures, all pre-existing and unrelated:
  - `test_data_licences`: a `harvest_emergency.py` ledger row is missing
  - `test_pipeline_code_fixes`: already logged as T1032-a
  - trip schema enums in `test_trip_*` and `test_generate_trip`
  - `test_expand_catalogue`, `test_review_queue` and the other files in the list
- `eslint` on the touched JS: 0 errors.
- Browser: `npx vite --port 5219`, then Playwright on `#dest=FCO` and `#dest=JER` at 375 and 1440, with the live stays copy blocked so the shipped scrape build shows. Rome prices €138 a day (entire place €76 a person, food €62). Jersey, unscraped, shows no price card and keeps Plan a trip on desktop. No page errors.

## Config and secrets set
- `pricing.json` `stays.model` is now `{max_age_days 400, outlier 2.5, curve_min 0.5, curve_max 2.2, hw_private_unit person, hw_private_guests 2}`.
- `gate.stays` is now `{reject_max, jump_country, jump_dest, coverage_drop, min_star_props, min_pairs, explain_tolerance}`, values unchanged.
- No secrets.

## Before/after measurements
| | Before (21 Oct build) | After (scrape only) |
|---|---|---|
| Places with a bed price | 3,868 (most modelled or borrowed) | 3,353, all measured |
| Places without one | 0 | 515 |
| Rome: entire place for two, a night | €162 | €134 |
| Rome: 3-star hotel room | €245 | €128 (3 hotels) |
| Rome: dorm bed | €42 | €40 |
| Rome: day a person (place page) | €154 | €138 |
| Sources | Xotelo, Inside Airbnb, Eurostat, Booking, Hostelworld | Booking, Hostelworld |

## What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The stay slot priced a "Guesthouse room" as an entire place | No room tier in the scrape; the slot's fixed options fell back | `slots.json` offers the entire place |
| Country briefs moved with gateways | The brief priced gateways before leaving them out | Price only the brief's towns |
| A match under 55% shown | The floor checked the fit, not the shown score | Floor on the shown figure |
| The split wire held the old prices | `sync-data` runs only before dev and build | Ran `npm run data` |
| "Not available yet" invisible on the place page | Rule from 2026-10-30: missing data leaves this page | The card goes; the primary stays |

## What is still open
- **T1021-a (owner):** switch the box on. See `Execution/P15/_OPEN-stays-box.md`.
- **T1021-b:** tonight's live hotel prices (`continent-app/functions/api/stays.js`, `src/lib/liveStays.js`) call Xotelo with keys the build no longer writes. They are inert now; remove them under the single-source rule.
- **T1021-c (owner):** 173,754 Booking hotel rows (3,336 places) carry no star class and price no tier. Decide whether a "Hotel (any class)" tier should use them.
- **T1021-d:** 515 places have no scrape, including Jersey, the Isle of Man, Saxon Switzerland and Reus. Check their Booking search terms and rescrape them on the laptop.
- **T1021-e:** the licence ledger (`src/ingestion/core/registry.py`), `attribution.js` and `docs/1.CARTA.md` still credit Inside Airbnb, Xotelo and Eurostat for stays.

## Rollback procedure
- `git revert` the T1021 commits. That brings back the builder, the scripts and the workflow.
- Then rebuild and bake the old way, or restore `public/stays/v1` and `app_data` from the commit before.
- Nothing is published to R2 until the box task is switched on.
