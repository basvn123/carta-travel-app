# T643 to T646: price engine F0, the scrape gate

Batch of four tasks (CLAUDE.md batch rules), run on 2026-10-23 while the owner's Booking, Hostelworld and flight scrapes kept running. Source of truth: the Claude Doc "Carta prijslogica Explore: plan", sections 6.2, 6.3 and phase F0; owner decisions B1 to B4 fixed. Root branch `p11-price-f0-scrape-gate`, app branch `p11-price-f0`. Nothing was published: no apply_stays, no R2 upload of a wire, no deploy (B1).

**Audit findings, verified in the code before any change:**

| Finding | Verdict | Where |
|---|---|---|
| Hostelworld privates doubled only when `hw_private_per_person` is set, and it is unset | Confirmed; every legacy private would have been stored at half a room | `pipeline/stays/build_stays.py:97-98` (before), `spike.json` had no key |
| Hostelworld URL forces no currency, en-GB locale, `parse_money` drops the symbol | Confirmed. `&currency=GBP` turns the page to pounds, `&currency=EUR` to euros (checked live) | `pipeline/stays/hostelworld/page.py:42-44`, `booking/page.py:45-61` |
| Booking stores the "from" or discounted price without taxes; "1 night, 2 adults" never checked | Partly true. The text was never checked and a deal's first amount (the struck-out price) was taken; but all 12 cards sampled (Bergen, Kotor) and all 155 of a live Prague test say "Includes taxes and charges" | `scrape_booking.py:111-127` (before), `booking/page.py:33` |
| Booking's 25 to 50 cards outvote Xotelo's 4 anchors in the median of property medians | Confirmed | `build_stays.py:148-165` (before) |
| A peak factor needs only 1 pair, the weekend factor 2 | Confirmed | `build_stays.py:243-247`, `:431-432` (before) |
| The gate blocks only a coverage drop over 2%; seasonal checks are notes; the SerpApi check never fires on Actions | Confirmed. `calibrate_serpapi.py` runs before the build, when `STAYS_OUT/v1` holds no country files, so it compares nothing | `build_stays.py:460-479` (before), `.github/workflows/stays-refresh.yml:124-134` |
| `build_stays.py` without `--gate` then `apply_stays.py` publishes unchecked; food and flights have no gate | Confirmed | `apply_stays.py:85-108` (before), `apply_food_prices.py`, `pipeline/flights/build_routes.py` |
| Stays files have no version in the URL; `_headers` max-age 3600 + one day stale; the service worker serves them stale | Confirmed for the URL and the worker; `_headers` needs no change once the URL is versioned (a second matching rule would comma-join Cache-Control on Pages) | `continent-app/src/lib/staysData.js:59-64`, `public/_headers:57-61`, `public/sw.js:181` |
| `stays_scrape.bat` overwrites the shared R2 journal with whatever the laptop has | Confirmed, and worse: it uploaded the main `.sqlite` of a WAL journal without a checkpoint, so the newest rows could be missing from the copy | `scripts/stays_scrape.bat:40` (before) |
| Flights: `build_routes.py` should reject prices <= 0 or above a distance ceiling | Wrong for that file: it builds the route list and holds no prices. The price check went into the flight-sweep Worker's publish step | `pipeline/flights/build_routes.py` (docstring), `workers/flight-sweep/src/publish.mjs` |

**End check** (one round, on the merged batch): the app at `/portugal/porto` from the app worktree (Vite with its own cache folder and port, data linked from the root app), phone 390 px and desktop 1280 px, DOM only. Passed on both widths: every stays country file was requested with its build in the URL (`stays/v1/PT.json?b=2026-10-21T23%3A42%3A53Z` and 8 more countries), no page errors, and the price card shows the stay line "Bed, 7 nights, €393" next to "Food and drink, 7 days, €290" (7 nights €683).

**Batch measurements** (journal copy `cache/stays/f0/`, taken with SQLite's backup API at 19:3x: 1,327 Xotelo, 9,326 Booking, 1,748 Hostelworld rows):

| Metric | Before | After |
|---|---|---|
| Broken-scrape fixtures blocked (V14: prices x3, GBP page, empty country, per-person private as room) | 2 of 4 by the old coverage gate, and only in a two-country fixture: the GBP rows were dropped by the new loader before the old gate saw them (the old loader read them as euros), and the empty country was half the fixture's world; on the real catalogue about 0 of 4 | 4 of 4 |
| Rows rejected by the contract on the journal copy | not checked | 0 of 12,401 with the B4 verdict (855 Hostelworld privates, 49% of its rows, without it); all 12,401 legacy |
| Full gate on the journal copy against the published copy | coverage only | FAILED, 6,832 blocking: 85 country x bed tier and 6,747 destination moves, 0 losses, 0 thin values, SerpApi not judged (no key) |

The full gate report is attached at the end. It fails mostly because the laptop's `journal.sqlite` holds 1,327 Xotelo rows, while the published copy was built on Actions from the R2 journal, so the measured base of the modelled ~3,800 towns shrinks (22 to 31 measured towns per bed tier here). The first real publish is built from the R2 state (T645-a).

---

## T643: one source contract, Hostelworld and Booking units

### Task ID

T643

### Date

2026-10-23

### What changed

Every stays observation now carries the same facts: `currency`, `unit` (bed, person, room, place), `tax_included`, `from_or_discount`, the page's `price_text` and `per_text`, added to the journal as additive columns. Only the scrapers add them, when they start (`migrate_scrape`), and they insert by column name, so a journal still written by an old 12-column scraper never changes under it. `build_stays.py` loads old and new journals alike: a row with an unknown unit or a currency other than EUR is rejected and counted per source and reason; a row from before the contract takes its source's known behaviour (`LEGACY`) and counts as legacy. Booking: the price is the last amount on the card (the price paid; two amounts set `from_or_discount`), "+€X taxes and charges" is added, "Includes taxes and charges" keeps it (B3), a card without a tax line is kept with `tax_included` 0, a card whose "1 night, N adults" does not match the search is rejected. Booking also stops waiting when the search came back empty, no longer scrolls for a second batch, skips its hostel search where Hostelworld covers the town (unless Hostelworld's city page came back empty), and logs seconds per page, retries and rejections per town. Hostelworld: `currency=EUR` in the URL, the currency read per price and a non-EUR row rejected, the unit stored, and the card reader no longer lends a "Featured Properties" hostel the next card's prices. B4: `scripts/hw_unit_sample.py` runs on its own (20 pages, 10 cities) and decided **per person** (below); `HW_PRIVATE_UNIT = "person"` in `build_stays.py` and `hw_private_unit` in `spike.json`.

### Files touched

**Modified:** `pipeline/stays/common.py` (contract columns, `migrate_scrape`, `insert_obs`), `pipeline/stays/booking/page.py`, `pipeline/stays/scrape_booking.py`, `pipeline/stays/hostelworld/page.py`, `pipeline/stays/scrape_hostelworld.py`, `pipeline/stays/build_stays.py` (load step).
**Created:** `scripts/hw_unit_sample.py`, `pipeline/stays/tests/test_contract.py`.
**Local state (not in git):** `cache/stays/spike.json` gained `hw_private_unit: person`, `hw_private_per_person: true`; `cache/stays/hw_unit_sample.json` and `.md`.

### Commands run

`python scripts/hw_unit_sample.py` (STAYS_STATE = the live state folder; writes only its own files); a live Booking run for Prague on a scratch copy of the state (`scrape_booking.py --run 2026-10 --only PRG --headed --max-hours 0.1`); `python -m pytest pipeline/stays/tests`; `python -m py_compile` on every touched file (no ruff or pyflakes on this laptop).

### Config and secrets set

None. `cache/stays/spike.json`: `hw_private_unit = person` (B4).

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| B4 sample | unset (T530-a) | per person: 259 hostels in 10 cities (Lisbon, Barcelona, Paris, Berlin, Amsterdam, Prague, Budapest, Rome, Athens, Edinburgh), private / dorm bed median 1.14 for 2 guests; the 2-guest and 1-guest list prices were the same (median 1.0), so the list ignores the guest count and the verdict rests on the private / dorm ratio; every price in euros |
| Booking, Prague live (8 pages) | about 12 pages a town, 32 s a page (2026-10-23 run mean) | 8 pages (hostel searches skipped), 155 prices, all with taxes, all "1 night, 2 adults", 6 cards without a price rejected, 8.5 s to load and read a page, 14.9 s a page in all |
| Contract rejections, journal copy | not checked | xotelo 0 of 1,327, booking 0 of 9,326, hostelworld 0 of 1,748 (855 "unit unknown" without the B4 verdict) |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Headless Chromium failed to start ("Invalid file descriptor to ICU data") at 19:45, and the headed one was gone | Python Playwright's build 1217 was garbage-collected by another project's Playwright install while a scraper held some files | `python -m playwright install chromium chromium-headless-shell`; T646 gives the scrape its own browser folder |
| A property page's room list never loaded for the B4 wording check | Hostelworld renders it late and the page never goes network-idle | B4 decided on list pages instead (the ratio test in the script) |
| `'--run' is not recognized` in tonight's log | `stays_scrape.bat` was changed by the T634 merge while cmd was executing it (cmd reads a batch file as it goes) | No data harm; the F0 merge waited until no scrape ran |

### What is still open

T643-a (the B4 verdict rests on one signal), T643-b (Xotelo does not say whether its rates include taxes), T643-c (Hostelworld list prices may leave city tax out). Closes T530-a and T624-a.

### Rollback procedure

`git revert 5a20e6e6e`. The added journal columns stay (additive; old code ignores them). To drop the B4 verdict: remove `hw_private_unit` and `hw_private_per_person` from `cache/stays/spike.json`.

---

## T644: weighting and minimum samples

### Task ID

T644

### Date

2026-10-23

### What changed

A town's level for a bed type is now the median of its sources' medians: each source's median of its property medians counts once, so Booking's 25 to 50 cards a page no longer outvote Xotelo's 4 anchors; one source alone gives its own median, as before. The month curve is weighted the same way (per source, then the median across sources). Rows with `tax_included` 0 or `from_or_discount` 1 are **excluded** from hotel levels (hotel2 to hotel5, the pooled hotel level and the single-room ratio), not adjusted: Booking already adds a "+€X taxes" line at scrape time, so a remaining 0 has no known factor to apply, and a deal says nothing about the normal rate; rows that do not say (Xotelo, NULL) stay in, or the primary source would go. Constant `HOTEL_LEVEL_EXCLUDES`. A peak factor now needs `MIN_PAIRS` = 2 same-property pairs, like the weekend factor.

### Files touched

**Modified:** `pipeline/stays/build_stays.py`, `pipeline/stays/tests/test_stays.py` (the seasonal fixture gets a second 14 August pair).
**Created:** `pipeline/stays/tests/test_weighting.py`.

### Commands run

`python -m pytest pipeline/stays/tests` (27 passed then).

### Config and secrets set

None.

### Before/after measurements

The size of the change T643 and T644 cause, old code against new code on the same journal copy (the old code with the B4 doubling switched on, so the difference is the contract and the weighting), euros per night, annual median:

| Destination | Bed | Old code | New code | Move |
|---|---|---|---|---|
| Lake Como | private | 82 | 96 | +17% |
| Lake Como | bnb_room | 106 | 124 | +17% |
| Lake Como | bnb_home | 167 | 143 | -14% |
| Kotor | dorm | 20 | 24 | +20% |
| Kotor | private | 91 | 58 | -36% |
| Kotor | bnb_room | 86 | 55 | -36% |
| Bergen | private | 129 | 98 | -24% |
| Bergen | bnb_room | 123 | 93 | -24% |
| Porto (city) | dorm | 20 | 19 | -5% |
| Porto (city) | hotel4 | 103 | 101 | -2% |
| Lagos (beach) | private | 72 | 67 | -7% |
| Lagos (beach) | bnb_room | 68 | 64 | -6% |
| Chamonix (mountain) | hotel2 | 77 | 85 | +10% |
| Chamonix (mountain) | hotel3 | 120 | 104 | -13% |

Every other bed tier of the six moved 0 to 3%. The weighting mostly moves hostel privates and the Airbnb rooms derived from them; the largest country moves are privates (AL 73 to 46, HR 133 to 84, IE 180 to 114, AD 117 to 74).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `test_model_season_weekend_peak_and_stars` lost its August peak | Its fixture had one 14 August pair, which T644 no longer accepts | A second pair in the fixture |

### What is still open

T645-d (the constants to `config/pricing.json` in F3).

### Rollback procedure

`git revert 246bb1329`.

---

## T645: the gate

### Task ID

T645

### Date

2026-10-23

### What changed

`build_stays.py` runs one gate on every build and writes `cache/stays/gate_report.md`; with `--gate` a failed gate exits 2 before anything is written. Blocking checks: (1) contract rejections over 5% of a source's rows; (2) a country x bed tier median moving over 25%, or one destination's bed tier over 40%, against the last published version, unless `pipeline/stays/gate_explain.json` lists the move (key `CC:bed` or `dest:bed`, the new value within 2%, reason, who, date) (B2); (3) a country that had measured data losing all of it, or a measured bed tier in a country; (4) a measured star class from fewer than 2 hotels (weekend and peak factors and country curves have their minimums built in, listed in the report); (5) the six test destinations, before and after in euros, under the destination threshold; (6) SerpApi: `calibrate_serpapi.py` now stores Google's medians per town, bed and month as references, and the gate compares the build it is about to publish against them (a median error over 25% from at least 10 references blocks). The coverage check stays. "Last published" is `STAYS_PREV`, else `continent-app/public/stays/v1` (what `apply_stays` bakes), else the manifest alone, which now carries `levels` and `cc_cov` per country so a later build can compare without the country files. Test set: Lake Como (`gem:como`), Kotor (`gem:kotor`), Bergen (`BGO`), Porto (`OPO`, city), Lagos (`gem:lagos-pt`, beach), Chamonix (`gem:chamonix`, mountain). Food: `apply_food_prices.py` refuses to write when a country's median basket moves over 25% unless the explain file lists `food:CC`. Flights: `build_routes.py` refuses to write when the route list loses over 10% of its routes or a 10-route airport loses all (`--accept-drop`); the flight-sweep Worker's publish leaves out a price at or below zero or above `max(250, 150 + 0.5 x km)` euros (1,500 without coordinates) and logs routes whose median moved over 40% against the published file.

### Files touched

**Modified:** `pipeline/stays/build_stays.py`, `pipeline/stays/calibrate_serpapi.py`, `pipeline/apply_food_prices.py`, `pipeline/flights/build_routes.py`; app: `workers/flight-sweep/src/publish.mjs`, `workers/flight-sweep/src/index.mjs`, `tests/flightSweep.test.mjs`.
**Created:** `pipeline/stays/gate_explain.json` (empty), `pipeline/stays/tests/test_gate.py`, `tests/test_price_gates.py`.

### Commands run

`python -m pytest pipeline/stays/tests tests/test_price_gates.py` (36 passed); `node --test tests/flightSweep.test.mjs` (10 passed); the full gate on the journal copy: `STAYS_STATE=cache/stays/f0 STAYS_OUT=cache/stays/f0/out STAYS_PREV=continent-app/public/stays/v1 python pipeline/stays/build_stays.py`.

### Config and secrets set

None. The Worker change is not deployed (T645-e).

### Before/after measurements

V14 and the full gate: see the batch measurements above. The test set against the published copy (from the attached report):

| Destination | Bed | Published | This build | Move | Status |
|---|---|---|---|---|---|
| Lake Como | hotel3 | 204 | 132 | -35% | ok |
| Kotor | hotel4 | 123 | 182 | +48% | BLOCKED |
| Bergen | hotel3 | 244 | 144 | -41% | BLOCKED |
| Bergen | hotel5 | 489 | 259 | -47% | BLOCKED |
| Porto (city) | hotel3 | 131 | 78 | -40% | BLOCKED |
| Lagos (beach) | hotel3 | 131 | 78 | -40% | BLOCKED |
| Chamonix (mountain) | dorm | 439 | 44 | -90% | BLOCKED |
| Chamonix (mountain) | private | 471 | 92 | -80% | BLOCKED |
| Chamonix (mountain) | hotel2 to hotel4 | 226 to 354 | 85 to 153 | -57% to -68% | BLOCKED |

The published Chamonix dorm bed (439 euros) and private room (471) are wrong in what is live today; the gate found them (T645-b).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The V14 measurement script crashed after printing its first table | Windows would not delete a temp folder holding an open SQLite file | `TemporaryDirectory(ignore_cleanup_errors=True)` |

### What is still open

T645-a (first real publish from the R2 state, with this report and the explain file), T645-b (Chamonix live), T645-c (per-destination jumps need the previous country files on Actions), T645-d (constants to `config/pricing.json`), T645-e (deploy the Worker gate).

### Rollback procedure

`git revert f723e347d` in the root and `git revert 7ac2dd9` in the app. The rollback the plan names: publish one build past the gate with `apply_stays.py --override "reason"` (T646); the previous wire stays live while a gate fails.

---

## T646: one publish path, versioned files, safe journal upload

### Task ID

T646

### Date

2026-10-23

### What changed

`build_stays.py` stamps the manifest after writing the country files: `gate.passed`, `gate.hash` (sha256 of the country files in name order) and `build` (its first 12 characters). `apply_stays.py` refuses a build whose gate did not pass, that has no stamp, or whose files changed after the stamp; `--override "reason"` is the one way round and the reason lands in `meta.stays.override`; `meta.stays.build` is new. `run_pipeline.py --only stays` (build `--gate`, then apply) stays the one documented path, unchanged; food gates inside its own apply step (T645). The app asks for each stays country file with its build in the URL, `?b={built}` (the baked copy with `meta.stays.built`, the live copy with its manifest's `built`), so a fixed build reaches browsers at once; the live manifest is fetched `no-cache` and network first in the service worker. `_headers` is unchanged (not needed with a versioned URL). `stays_scrape.bat`: Booking and Hostelworld run side by side (different sites; Booking gets the whole night, both up to 6 hours), with their own Playwright folder (`%LOCALAPPDATA%\ms-playwright-carta-stays`), one run tag across months (`STAYS_RUN`; without it the November nights of the October run would restart the plan), and a safe upload: checkpoint the WAL journal, keep a dated copy of R2's journal under `state/backup/`, refuse when the local journal has fewer rows than R2's. `migrate_scrape` tolerates the other scraper adding the same column a moment earlier. `docs/SCHEMA.md` documents the contract, the gate, the stamp and the versioned fetch.

### Files touched

**Modified:** `pipeline/stays/apply_stays.py`, `pipeline/stays/build_stays.py`, `pipeline/stays/common.py`, `scripts/stays_scrape.bat`, `scripts/stays_scrape_task.ps1` (comment), `docs/SCHEMA.md`; app: `src/lib/staysData.js`, `public/sw.js`.
**Created:** `pipeline/stays/tests/test_publish.py`.
**Outside git:** `logs/run_stays_nightly.cmd` (the owner's CartaStaysNightly runner) sets `STAYS_RUN=2026-10`.

### Commands run

`python -m pytest pipeline/stays/tests tests/test_price_gates.py` (40 passed); `npm test` in the app worktree (688 tests: 685 pass; the 3 failures read `public/boot.json`, generated data a fresh worktree lacks, unrelated); `npx eslint` on the touched app files (clean); a dry run of the batch file's side-by-side start and of the upload guard (refuses 5 local rows against 7 remote, passes with no remote).

### Config and secrets set

None. Playwright browsers for the scrape install into `%LOCALAPPDATA%\ms-playwright-carta-stays` on the next run.

### Before/after measurements

Not measured beyond the checks above (the versioned fetch shows in the end check).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 27 app test files failed to load and eslint could not find `@eslint/js` | The node_modules junction made from Git Bash pointed at `C:\C:\Users\...` | Junction recreated from PowerShell; 3 environmental failures remain |
| Vite in the worktree began re-optimizing the root app's dependency cache | The junction shares `node_modules/.vite` with the root app another session uses | An outside Vite config with its own `cacheDir` and port |

### What is still open

T646-a (deploy the app change), T624-d stays open (no rclone remote on the laptop, so the safe upload is not exercised yet).

### Rollback procedure

`git revert 623541b22` (root) and `git revert 6f35b17` (app). A build stamped by T646 still applies after a revert (the old `apply_stays` ignores the stamp). Remove `%LOCALAPPDATA%\ms-playwright-carta-stays` to drop the private browsers.

---

## Screens and states the end check covered

- Destination page `/portugal/porto`, phone 390 px and desktop 1280 px: the stays country file is fetched with `?b=`, and the price card shows a stay line.

## Gate report on the journal copy

The first 60 lines of `cache/stays/f0/gate_report.md` (the full file lists 300 of the 6,832 blocking lines):

```text
# Stays gate report, 2026-10-23T18:23:55Z

**FAILED**: 6832 blocking, 1 notes. Compared against: C:\Users\Gebruiker\Documents\Portfolio\Travel App\continent-app\public\stays\v1.

## 1. Contract (rejected rows per source, block above 5%)
- booking: 9326 rows, 9326 legacy, 0 rejected (0.0%) {}
- hostelworld: 1748 rows, 1748 legacy, 0 rejected (0.0%) {}
- xotelo: 1327 rows, 1327 legacy, 0 rejected (0.0%) {}

## 2. Jumps (country x bed tier above 25%, destination above 40%)
- 85 country x bed tier moves and 6747 destination moves over the thresholds without an explain entry

## 3. Losses (a country loses all measured data, or a measured bed tier)
- 0 losses

## 4. Minimum samples (a measured star class needs 2 hotels, weekend and peak factors 2 pairs, a country curve 3 towns)
- 0 measured values under their minimum

## 5. Fixed test set (euros per night; destination threshold applies)

| Destination | Bed | Before | After | Move | Status |
|---|---|---|---|---|---|
| Lake Como | dorm | 36 | 36 | +0% | ok |
| Lake Como | private | 110 | 96 | -13% | ok |
| Lake Como | hotel2 | 140 | 99 | -29% | ok |
| Lake Como | hotel3 | 204 | 132 | -35% | ok |
| Lake Como | hotel4 | 220 | 143 | -35% | ok |
| Lake Como | hotel5 | 409 | 406 | -1% | ok |
| Lake Como | bnb_room | 119 | 124 | +4% | ok |
| Lake Como | bnb_home | 129 | 143 | +11% | ok |
| Kotor | dorm | 18 | 24 | +33% | ok |
| Kotor | private | 67 | 58 | -13% | ok |
| Kotor | hotel2 | 78 | 95 | +22% | ok |
| Kotor | hotel3 | 114 | 103 | -10% | ok |
| Kotor | hotel4 | 123 | 182 | +48% | BLOCKED |
| Kotor | hotel5 | 229 | 258 | +13% | ok |
| Kotor | bnb_room | 64 | 55 | -14% | ok |
| Kotor | bnb_home | 95 | 106 | +12% | ok |
| Bergen | dorm | 39 | 35 | -10% | ok |
| Bergen | private | 144 | 98 | -32% | ok |
| Bergen | hotel2 | 168 | 125 | -26% | ok |
| Bergen | hotel3 | 244 | 144 | -41% | BLOCKED |
| Bergen | hotel4 | 264 | 190 | -28% | ok |
| Bergen | hotel5 | 489 | 259 | -47% | BLOCKED |
| Bergen | bnb_room | 137 | 93 | -32% | ok |
| Bergen | bnb_home | 187 | 244 | +30% | ok |
| Porto (city) | dorm | 21 | 19 | -10% | ok |
| Porto (city) | private | 78 | 70 | -10% | ok |
| Porto (city) | hotel2 | 90 | 68 | -24% | ok |
| Porto (city) | hotel3 | 131 | 78 | -40% | BLOCKED |
| Porto (city) | hotel4 | 141 | 101 | -28% | ok |
| Porto (city) | hotel5 | 263 | 184 | -30% | ok |
| Porto (city) | bnb_room | 72 | 72 | +0% | ok |
| Porto (city) | bnb_home | 126 | 126 | +0% | ok |
| Lagos (beach) | dorm | 21 | 20 | -5% | ok |
| Lagos (beach) | private | 78 | 67 | -14% | ok |
| Lagos (beach) | hotel2 | 90 | 68 | -24% | ok |
| Lagos (beach) | hotel3 | 131 | 78 | -40% | BLOCKED |
| Lagos (beach) | hotel4 | 141 | 101 | -28% | ok |
| Lagos (beach) | hotel5 | 263 | 184 | -30% | ok |
```
