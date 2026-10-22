# T530 to T536: bed prices for every bed type and month, merged with live flights and food

## Shared header

**Date:** 2026-10-21 to 2026-10-22.

**Branches:** root `claude/accommodation-cost-setup-87d85c` (worktree), app `p11-stay-prices` (worktree `wt/app-stays`). Both merged into root `main` (`e84ee3c23`) and app `master` (`4505859`), together with `p11-food-costs` (T513 to T515, the food and drink session). Live flights (T511 to T519) was already on `main` and `master`.

**Deployed:** Pages `db9a32f6` (production) on 2026-10-22, with 245 changed data objects on R2: `dest/` (201) and the new `stays/v1/` (44).

**Numbering:** the batch started as T511 to T517. The live flights and food sessions had taken T511 to T519 in parallel, so the unpushed commits were renumbered to T530 to T536 (message rewrite, plus `9f2a713d3` for the in-file references). T513-a, T514-a and T514-b now exist twice in `_OPEN.md`, once from each of the other two sessions (T536-d).

**Owner decisions, 2026-10-21, this session:**

1. Remove the old accommodation setup (LiteAPI, Hostelworld partner, fixtures, the PLI/longtail/ADR bed model) and rebuild from the sources in the owner's brief.
2. Free sources only.
3. The refresh runs on GitHub Actions.
4. Numbeo stays for food only.
5. Booking.com and Hostelworld are scraped twice a year by the owner, who states permission and educational use. The scraper is one plain browser on one IP, 3 to 6 seconds a page, and stops when blocked. No proxies, no stealth plugins, no CAPTCHA solving.
6. Xotelo is the primary dated source; the scrape adds star class, dorm beds and gaps.
7. The stay picker shows three kinds with a second row.
8. Bed provenance on screen is the estimate mark only.
9. Peak and low seasons must differ, even if that takes more data.

**Plan:** `C:\Users\Gebruiker\.claude\plans\bright-roaming-metcalfe.md`. Every task ran on the session model.

---

## T530: source spike

### What changed
`pipeline/stays/xotelo.py` and `discover_xotelo.py` probe and harvest Xotelo; `spike.py` is the laptop runner for the scrape half. Findings:

- **Xotelo** works with no key. It gives a dated rate per OTA (Booking.com, Agoda, Trip.com, Vio) for each property, by adults and rooms. Florence's Hotel David: 136 EUR in February, 155 EUR in August.
- `/search` needs RapidAPI, so town ids come from the property URLs in the country lists. Wikidata P3134 is too sparse (Florence has none).
- Six of the 43 country ids written from memory were wrong. Estonia and Latvia were swapped, and Montenegro, the Faroe Islands, San Marino, Kosovo and Moldova pointed elsewhere. Moldova is now `g294455` and Latvia goes through four regions. Montenegro, the Faroes, San Marino and Kosovo have no id.
- **Inside Airbnb** has 55 European city and region files. Country archives are on request only. 85% of Ghent's listings are priced.
- **Eurostat:** `prc_hicp_midx` stops at 2025-12. `prc_hicp_minr` (ECOICOP v2, CP112, 2025=100) runs to 2026-09.
- **Booking.com:** plain HTTP gets 403 on autocomplete and an AWS WAF challenge on search. The live browser probe was refused in this session by the permission check, so that half of the spike is the owner's (T530-a).

### Files
**Created:** `pipeline/stays/xotelo.py`, `pipeline/stays/discover_xotelo.py`, `pipeline/stays/spike.py`.

### Commands
1. `python pipeline/stays/discover_xotelo.py --verify`
2. `python pipeline/stays/discover_xotelo.py`: the country pass completed; the town pass was stopped at 175 towns. The pool holds 99,917 properties.

### Measurements
| Metric | Before | After |
|---|---|---|
| Free dated hotel price source | none (LiteAPI key never created) | Xotelo, 99,917 properties discovered |

### What broke
| What | Cause | Fix |
|---|---|---|
| Six country ids wrong | Written from memory | Verified against the property URLs, corrected |

### Open
T530-a, T530-b.

---

## T531: harvesters and model (`pipeline/stays/`)

### What changed
**Harvesters:**

- `harvest_iab.py` reads Inside Airbnb by destination footprint, converted with ECB rates. It gives the entire place for 2, 4, 6 and 8 sleepers, the private room, the shared room, and up to 8 neighbourhood medians.
- `price_xotelo.py` prices anchor properties: a monthly rotation, and a bootstrap that covers 12 months plus the peak nights.
- `harvest_supply.py` counts OpenStreetMap stays and stars.
- `harvest_eurostat.py` fetches HICP CP112, the price level index (PLI) and tourist nights.
- `calibrate_serpapi.py` checks prices against SerpApi's free tier.

**Scrapers (owner, laptop):** `scrape_booking.py` and `scrape_hostelworld.py`. The Booking card reader is adapted from Edioff/booking-scraper (MIT, notice kept), without its webdriver override, fingerprint scripts or spoofed user agent; it declines the cookie banner. Hostelworld follows the crawl shape of the 2020 Scrapy project. That project has no licence, so no code was copied.

**`build_stays.py`:**

- Season curves per property, combined per bed type.
- Weekend factor, and peak factors for Christmas, Easter and 15 August.
- Star tiers are measured, or scaled from the town's hotel level, and never come out cheaper than the class below.
- A bed type with no measurement climbs a ladder: a same-size town within 30 km, then the country by size, then Europe times the PLI.
- HICP drift is applied year on year.
- Gates on coverage, calibration and the known seasonal places.

**`apply_stays.py`** writes the compact block into `app_data` and bakes `public/stays/v1/`. The ledger gained nine licence rows.

### Files
**Created:** `pipeline/stays/{common,harvest_iab,harvest_supply,harvest_eurostat,price_xotelo,calibrate_serpapi,scrape_booking,scrape_hostelworld,build_stays,apply_stays}.py`, `pipeline/stays/booking/{__init__,urls,page}.py` with `LICENSE-booking-scraper`, `pipeline/stays/hostelworld/{__init__,page}.py`, `pipeline/stays/tests/test_stays.py`.

**Modified:** `src/ingestion/core/registry.py`, `docs/tos/data_licenses.md`, `run_pipeline.py` (tasks `stays` and `stays_discover`), `.gitignore`, `pipeline/dossier/build_dossier.py` (the sleep block), `docs/SCHEMA.md` (v18).

### Commands
1. `python pipeline/stays/harvest_eurostat.py`
2. `python pipeline/stays/harvest_iab.py`
3. `python pipeline/stays/harvest_supply.py` (run twice: Overpass answered 502)
4. `python pipeline/stays/price_xotelo.py --bootstrap --only <32 hubs> --max-hours 2`
5. `python pipeline/stays/build_stays.py`
6. `python pipeline/stays/apply_stays.py`

### Measurements
| Metric | Before | After |
|---|---|---|
| Fixture hotel and hostel tier blocks in the wire | 284 | 0 |
| Places with their own Airbnb median | 1,000 labelled `inside_airbnb_city`, 35 truly their own (T209-d) | 234 within their own footprint, 87 from a named town nearby |
| Destinations with a measured 12-month hotel curve | 0 (one global curve, or a curve from review counts) | 8 hubs (VIE, BER, BUD, FCO, CDG, BCN, PRG, NAP), 1,327 dated rates |
| Destinations with every bed type priced | 284 (fixtures) | 3,868: 243 measured, 81 nearby, 3,544 modelled (every modelled price marked est.) |
| Geneva entire place | 0.16 EUR (CHF parse bug, T096-c) | 210 EUR for 4 sleepers |
| Moldova, Romania, Kosovo, Albania | all exactly 48 EUR (T472-i) | entire place for two, medians 81, 81, 60.5, 62 EUR |
| 3-star peak/low | (no measured season) | Santorini x2.9; Palma x1.5 (Aug 325, Jan 215); Vienna dearest in November (Christmas markets) |
| Pipeline stay tests | none | 12 pass |

### What broke
| What | Cause | Fix |
|---|---|---|
| Overpass 502 for 20 countries | Server overload | Retry on 502 and 503; a second run completed 41 countries |
| `database is locked` | A build read the journal while an orphaned bootstrap wrote it | WAL mode and a 60 s busy timeout |
| Florence October at 1,773 EUR | One absurd OTA rate entered the Italian country curve | Rates more than 2.5x the property median are dropped; month factors clamped to 0.5 to 2.2 |
| Vienna 4-star priced under its 3-star | Star ratios fitted from only 26 classed hotels | Each class is at least 1.08x the class below |
| Palma copied Barcelona's season (November dearest) | Spain's country curve was built from one city | A country curve needs 3 measured towns, else the country's Eurostat tourist season is used |
| Edinburgh and Mostar flat all year | Eurostat has no UK or Bosnia nights series | Europe's mean season is the last fallback |

### Open
T531-a to T531-f.

---

## T532: scheduling

### What changed
`.github/workflows/stays-refresh.yml`:

- Every Monday: a Xotelo slice, capped at 5.5 h.
- First Monday of the month: Eurostat, Inside Airbnb, calibration, then a gated build and a publish to `r2:carta/data/stays-live/v1/`.
- January, April, July and October: discovery as well.
- State lives in the private bucket `carta-stays-state`.

`scripts/stays_scrape.bat` with `stays_scrape_task.ps1` is the owner's nightly laptop task. It works in March and September only and uploads `journal_scrape.sqlite`.

### Files
**Created:** `.github/workflows/stays-refresh.yml`, `scripts/stays_scrape.bat`, `scripts/stays_scrape_task.ps1`.

### Config and secrets
- **Owner (T532-a):** GitHub secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `SERPAPI_KEY` (free plan), and the private bucket `carta-stays-state`.
- **Laptop (T532-b):** rclone with the five `RCLONE_CONFIG_R2_*` variables.

### Measurements
Not measured. The workflow needs the secrets before its first run.

### Open
T532-a, T532-b.

---

## T533: the old bed pipeline retired

### What changed
- Moved to `pipeline/archive/`: `harvest_accommodation.py`, `apply_accommodation_anchors.py`, `apply_longtail_granularity.py`, `harvest_hostelworld.py`, `harvest_hotels_liteapi.py`, `apply_stay_tiers.py`, `resume_cache.py`.
- Deleted: the stay fixtures and `make_stay_fixtures.py`.
- The `lodging` and `staytiers` tasks are gone.
- `apply_tourist_premium.py` now covers food only, under the task `tourist_premium`.
- The LiteAPI and Hostelworld partner licence rows are retired.

### Measurements
| Metric | Before | After |
|---|---|---|
| Bed model scripts in the live pipeline | 7 | 0 (archived) |

### What broke
| What | Cause | Fix |
|---|---|---|
| The ledger would not write | The RUNS entry for `harvest_flight_times` said monthly, its task said manual (T255) | Aligned; main later dropped the entry with live flights |

---

## T534: one bed price in the app

### What changed
- `src/lib/stayPrice.js` `bedPrice()` prices night by night: each night gets its month's measured price, the weekend factor and the peak factor. Rooms are sized to the party, and Airbnb fees apply only to an entire place.
- `src/lib/staysData.js` loads the stays wire per country, keeps the newer of the baked copy and the live copy, and asks the live manifest only once.
- `bedPrice()` now feeds `runtime_pricing`, `costIndex` (month-aware and party-aware, default party of two), `firstRun`, budget search, `priceMonths`, the destination page and its PDF, the trip page, the static pages and the OG cards.
- Explore prices the dates on screen, and the month filter re-prices the cards.
- New tiers `room` and `hotel2`, in six languages.
- Schema 18. The R2 tier folders `stays` and `stays-live` are added, with Cache-Control.

### Measurements
| Metric | Before | After |
|---|---|---|
| Bed formulas in the app | 3 (cost index, planner model, written ranges) | 1 (`bedPrice`); a test checks that the Explore card times the nights equals the planner's Beds line |
| App tests | 558, 547 pass | 588, 588 pass (main checkout) |
| Vienna 3-star, 21 to 28 Nov, 2 people | annual rate | 1,253.00 EUR (7 x 179, the measured November rate) |

### What broke
| What | Cause | Fix |
|---|---|---|
| About 45 failed requests a page to `stays-live/*` | The live prefix is not published yet, and each country fetched it | One manifest request, skipped on localhost; country files only when the manifest is newer |
| The destination card priced the annual rate under Carta's suggested November week | Dates were used only when the traveller had set them | Beds price for the dates on screen |
| `composeTrip`'s bed fields read v17 | Missed in the first pass | Now read `q`, `from`, `beds.bnb_home` and `tiersAt` |
| The "tight budget" home persona showed Mostar, outside its 60 EUR search | Measured bed prices put Mostar at about 80 a day | The persona shows Ohrid (about 57 a day); photo by kallerna, CC BY-SA 4.0 |

### Open
T534-a to T534-c.

---

## T535: three ways to sleep

### What changed
The Lifestyle panel and the planner show three kinds: Hostel, Home and Hotel. Under the chosen kind, the kit's Segmented control asks which bed, which home or which hotel (2 to 5 star). This is the owner's choice, built with impeccable and carta-design; the impeccable detector found nothing. Trip ranges keep their sleep ladder. Where to sleep now lists the entire place for two and marks unmeasured beds with the tilde and est.

Carta-design's seven questions:

1. No hex.
2. No gradient.
3. Brown only on the selected tile and the segment thumb.
4. Figures 12 px or larger, tabular, through `formatMoney`.
5. One primary.
6. No method lines (the owner chose the estimate mark only).
7. Removed: the old local grade pills, replaced by the kit Segmented control.

### Measurements
Not measured. Design.

### Browser check
- **Desktop:** tiles Hostel, Home [on], Hotel. "Which home" offers Room in a home and Entire place [on]; Hotel offers 2 to 5 star. Vienna re-prices to 3 star 1,253.00, 4 star 1,267.00 (annual) and a dorm at 350.00 for two.
- **Phone (375 px):** three columns of 102 px, segments 44 px high, no sideways scroll.

---

## T536: merge, data apply, end check, deploy

### What changed
**Merge:**

- Live flights and food are merged into this batch, in both repos.
- The food branch lacked its licence rows (the Eurostat food tables, Open Food Facts Open Prices) and its two meta keys in the wire table. Both added.

**Data apply, in the main checkout:**

- Food was applied with `run_pipeline --only food`, then the stays build.
- Both were synced to the wires.
- App master was mirrored into root.

**Fixed on the way:**

- `run_pipeline.py` `backup_master` pruned the backup it had just made (its name sorted after the hand-named snapshots), then crashed.
- Eight retired fare keys came out of the wire table: the contract half of T519-b.
- A dead `.fare-prov-age` rule was failing the CSS route gate.

**Deploy:** `dest/` and `stays/` went to R2 with wrangler, then Pages was deployed.

### End check
Merged main checkout, phone 375 px and desktop 1440 px:

- **Explore:** measured beds carry no mark (Barcelona 123, Vienna 124); estimates do (Rome ~154 est.).
- **Destination page:** the price card for Vienna shows the Stay line, food and drink, the total and the person share.
- **Lifestyle picker:** checked on desktop and phone.
- **Budget search:** Rome for two ~1,469 est.: bed, food and drink, a 10% buffer, and not-priced lines with no amount.

Not opened in the browser: the trip planner, the day planner, the PDFs and My trips. Node tests only (T536-c). The flight lines in dev hit the data host's CORS, which predates this batch.

### Deploy
- R2: 245 objects uploaded, 0 failed. ETags spot-checked equal to the local MD5 (`dest/_rank.json`, `stays/v1/IT.json`).
- `npx wrangler pages deploy dist --project-name carta-app --branch main`: deployment `db9a32f6`.
- Live probe: the bundle `index-D963hmY2.js` matches the build; `boot.json` reads schema 18 with the stay tiers and the food model; `/`, `?tab=explore` and `/pricing` return 200.
- Live smoke: 72 cards priced ("~€124 est. a person a day"). Two 404s, both expected: `stays-live/v1/manifest.json` (until the workflow first publishes) and `status.json` (T316, older).

### Commands (main checkout)
1. `cp app_data/app_data.json app_data/backups/T536-pre-data.app_data.json`
2. `python run_pipeline.py --only food --force` (stale lock from 28 Sep)
3. `python pipeline/stays/build_stays.py`
4. `python pipeline/stays/apply_stays.py`
5. `node continent-app/scripts/sync-data.mjs`
6. `npm test`: 588 of 588
7. `npm run ci:contract`
8. `npm run build:pages`: PASS, 169 files
9. `npm run ci:css-routes`
10. `node logs/r2_upload.mjs`
11. `npx wrangler pages deploy dist --project-name carta-app --branch main`

### Open
T536-a to T536-d.

---

## Rollback
**App:**

- `git -C continent-app revert -m 1 4505859`, plus the T536 fixes after it: `17f44f5`, `dd71503`, `2ba354e`, `5595427`.
- Then `npm run build:pages` and redeploy, or promote the previous Pages deployment in the dashboard.

**Root:**

1. Revert the mirror commit `019190a8c` and the T536 root commit.
2. Revert `e84ee3c23` with `-m 1`.
3. Restore the master: `cp app_data/backups/T536-pre-data.app_data.json app_data/app_data.json`.
4. `node continent-app/scripts/sync-data.mjs`.
5. Re-upload `dest/` to R2.

To undo only the food data: `python pipeline/apply_food_prices.py --restore` (see the food report).

**R2:** `data/stays/` is additive. Re-uploading the previous `dest/` shards gives the old app v17 back.

**Schedules:** disable `stays-refresh.yml` and unregister `CartaStayScrape`.
