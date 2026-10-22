# T559 to T562: live bed prices, the four follow-ups

Batch of four, 2026-10-22. The owner asked to do the four open items T539 to T540 left: the Xotelo terms, the monthly refresh keeping the hotel list, live prices on the trip card and the planner, and tuning against real prices ("Now this needs to be done").

- Root branch `claude/accommodation-cost-setup-87d85c`.
- App branch `p11-live-stays-2`, merged into app master as 999ad92.
- **Not live yet.** The permission check refused the R2 upload of the corrected stays files as a production change, so the Pages deploy and the push were not attempted. All three wait for the owner (T562-a). Until then, production runs T540 with the uncalibrated typical night, so live prices there read about 20% low on ordinary days.

---

## T559: Xotelo terms and safeguards

### What changed

What Xotelo publishes, checked 2026-10-22 on xotelo.com:
- No terms, licence, privacy or limits page (/terms, /terms-of-service, /privacy, /faq and /pricing all 404).
- The site calls itself a "Free Hotel Prices API", has a Donate page, is built by one developer (Anas, anastue.com) on TripAdvisor data, and is also listed on RapidAPI.

So whether a commercial app may call it per visitor stays the owner's decision (T540-c, still open). What this task added so that decision can be acted on:

- **Off switch.** `functions/api/stays.js` answers 503 without calling Xotelo when the Pages variable `LIVE_STAYS=off` is set in the Cloudflare dashboard (Settings, Variables). The app then shows the modelled price. No redeploy is needed.
- **Credit.** `src/data/attribution.js` names "TripAdvisor data via Xotelo" for hotel prices and the live prices for your own nights. The prerendered pages already credited Xotelo.

The owner's options, for the T540-c call:
1. Keep it as it is: free, donation-ware, with the 12-hour cache limiting calls.
2. Write to the developer (anastue.com/contact) for permission to use it commercially. Claude does not send this.
3. Set `LIVE_STAYS=off`.

### Rollback

`git -C continent-app revert f28f911`.

---

## T560: the monthly refresh keeps the hotel list

### What changed

- **The bucket was missing.** The private bucket `carta-stays-state` that `stays-refresh.yml` pulls from and pushes to **did not exist**, so the first monthly run would have failed at "Pull state from R2". It now exists and is private (r2.dev access disabled). It is seeded with:
  - the Xotelo pool (`xotelo_props.json`, 25 MB) and anchors
  - OSM stays, supply, Eurostat and Inside Airbnb
  - the journal
  - the calibration (T562)
- **The gate.** `build_stays.py` records `live_keys` in the manifest and fails its gate when a build writes none (the pool missing from the state) while the previous build had them, or on a fresh runner. A refresh can no longer publish a newer stays copy without `xk`, which would have switched live prices off everywhere.

### Rollback

`git revert` the T560 commit. The bucket can stay; it is private and costs nothing that matters.

---

## T561: live prices on the planner and the journey trip card

### What changed

- **Planner** (`useTripPlanner.js`):
  - Each dated stop asks `/api/stays` for its own nights and party.
  - The trip is repriced when an answer lands, because `bedPrice()` already reads it through `accommodationPerPerson()`.
  - The itinerary's stop bed line says "Adjusted to live prices for your nights" when it is live.
- **Journey trip card** (`TripPriceCard.jsx`):
  - A journey names towns, not destination ids. With the traveller's own dates, the card finds the nearest destination with live keys within 40 km of the journey's coordinates (`nearestLiveDest`).
  - It asks for that place's live prices for the journey's nights, and scales the card's accommodation line by its live-to-model ratio (`liveStayRatio`). The totals, per person and per day follow, and the line carries the same label.
- **`bedPrice()`** gains `live: false`, so the ratio has a model to compare against.
- **Tests:** 2 new tests (ratio, nearest), 7 in `liveStays.test.mjs`.

### What to look at in the end check

- the planner itinerary with dates, hotel 3 star: the stop bed lines
- a journey page with own dates near a live town
- phone and desktop

### Rollback

`git -C continent-app revert a9d6a97`.

---

## T562: calibration against real prices

### What changed

New `pipeline/stays/calibrate_live.py`.
- **Sample.** 30 towns with at least 3 hotel keys and a hotel3 curve, at most 2 per country. Four ordinary Tuesdays (November, January, April, July), away from peak weeks. One call at a time.
- **Measure.** It prices each town's hotels and compares tonight / typical with the model's own season for that month.

### Before/after measurements

85 samples in 26 towns, 476 Xotelo calls:

| | Value |
|---|---|
| Median of live factor / model season (bias) | 0.804 |
| 10th / 90th percentile | 0.59 / 0.99 |
| Spread within a town between dates (log sd) | 0.142 |
| Spread between towns (log sd) | 0.140 |
| Correlation of live factor with the model's season | 0.41 |

- **Correction.** The typical night (the geometric mean of TripAdvisor's yearly low and high) sits about 24% above a hotel's real ordinary night, so live prices read about 20% low on a normal week. `live_keys.py` now scales `typ` by `TYP_SCALE = 0.804`, so an ordinary week reads 1.0. Example: Vienna's cheapest-quartile hotel goes from 201 to 161.
- **Damping kept at 0.6.**
  - Ordinary-week noise is about ±14%, and the damping shrinks it to about ±9%.
  - Real events move prices 40 to 100%, which still show at about 1.2 to 1.5 times.
  - The 0.41 correlation says the live factor carries real seasonal signal beside its noise. Undamped, it would swing too much for six hotels.
- **Data.** 2,114 destinations have keys. The corrected files are in `cache/stays/out/v1` and the app's `public/stays/v1`, and the calibration is in the state bucket.

### Rollback

Revert the T562 commit and rerun `live_keys.py`.

---

## Checks (batch)

- `npm test` on merged master: 595 of 595.
- `pytest pipeline/stays/tests`: 14 passed.
- eslint: 0 errors.
- `npm run build:pages`: PASS.

**End check:** not done in a browser. It needs the deploy, which waits for the owner. Preview origins cannot read the data host. To look at after the deploy:
- the planner itinerary bed lines
- a journey card near a live town
- the Vienna destination card again, where an ordinary week should now read close to the model

## What is still open

- **T562-a.** Upload the 44 corrected stays files to R2 (`carta/data/stays/v1/`), deploy app master 999ad92 to Pages, run the browser end check, fast-forward root main and push. The permission check refused the upload as a production change, so this waits for the owner.
- **T561-a.** The journey card's live adjustment uses the nearest live town within 40 km. A journey that sleeps in several towns, or far from its coordinates, is only approximated; per-night destination ids in the journey data would make it exact.
- **T562-b.** The bias was measured once, on 26 towns. Rerun `calibrate_live.py` after each quarterly Xotelo discover, and per country once the pool grows (towns differ by about 14%).
- **T540-c** stays open for the owner (Xotelo commercial use). T559 gives the off switch and the options above.
