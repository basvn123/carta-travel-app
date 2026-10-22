# T539 to T540: a lean scrape, and live bed prices for the traveller's own nights

Batch of two tasks, 2026-10-22. The owner asked three things:

- why the Booking and Hostelworld scrape takes 25 nights, and whether it needs to;
- whether prices can update on demand when a traveller searches, for example during an event;
- to build both ("yes").

Root branch `claude/accommodation-cost-setup-87d85c`. App branch `p11-live-stays`, merged into app master as c9d7ce3.

Production was **not** deployed. The permission check refused the Pages deploy ("Production Deploy"), so it waits for the owner (T540-a). The 44 stays files with the new keys are already on R2, which is harmless: the live app does not read `xk`.

---

## T539: lean Booking and Hostelworld scrape

### What changed

- `scrape_booking.py` is lean by default:
  - 6 probe dates instead of 19: the January, March, May, August and October Tuesdays, plus one May Friday for the weekend factor.
  - A town OSM shows with nothing to book is skipped. A town missing from the supply file is still searched, because unknown is not the same as empty.
  - The hostel search runs only where OSM shows a hostel.
  - A star-class search runs only when OSM says the town has that class and the popularity page did not already show one.
  - `--full` brings back the old plan.
- `scrape_hostelworld.py` uses the same five months by default; `--full` gives all 12.
- `build_stays.fill()` scales a fallback curve to the months already measured before it fills the gaps. Before, it copied a country curve's raw values into a town's curve, which sits on a different scale. With 5 measured months, the other 7 now follow the fallback's shape at the town's own level.

### Before/after measurements

Upper bounds from the real destination and supply files:

| | Before (19 dates, every town) | After (lean) |
|---|---|---|
| Booking pages | 135,380 (about 263 h at 7 s) | at most 32,898 (about 64 h) |
| Hostelworld pages | 18,480 | 7,700 (about 15 h) |
| Towns searched on Booking | 3,868 | 3,437 |
| Hostel towns | 3,868 | 1,540 |

The star searches are counted as if every one runs. In practice fewer do, because many are skipped once the first page shows that class.

### Checks

`pytest pipeline/stays/tests`: 14 passed. Two tests are new: the lean plan, and the scaled fill.

### What broke

Nothing.

### Rollback

`git revert 30468f103`. Running with `--full` also restores the old behaviour without a revert.

---

## T540: live bed prices, on demand

### What changed

- **Keys per destination.** `pipeline/stays/live_keys.py` picks up to 6 Xotelo properties per destination from the 99,917 already discovered, using the same rule as the price anchors. These are the most reviewed hotel in each price quartile and the two most reviewed guesthouses. Each carries its typical night, the geometric mean of TripAdvisor's yearly low and high.
  - They go into the stays wire as `xk`: `[key, kind, stars, band, typ]`.
  - `build_stays` attaches them on every build. `price_xotelo.choose_anchors` now records the price band.
  - 2,114 of 3,868 destinations have keys. The rest have no Xotelo hotel inside their footprint and keep the model.
- **`/api/stays`** is a new Pages Function. It takes up to 6 keys, up to 3 nights and 1 or 2 adults. It asks Xotelo for each single night and returns the median of the booking sites' rates.
  - Each cell is cached at the edge for 12 hours. A sold-out cell is cached for 6 hours and a failed call for 10 minutes.
  - It makes 6 upstream calls at a time.
  - Bad input gets a 400. If every call fails, it answers 502 and the app keeps the model.
  - Xotelo is used for single nights only, because multi-night queries came back empty or mixed totals with nightly rates (measured on Vienna).
- **`src/lib/liveStays.js`** asks once per dated stay, for the first and middle nights. It turns the answer into a factor: tonight's price against each property's typical night, by star class, then by price quartile, then across all hotels. Guesthouses set the factor for the private room.
- **`bedPrice()`** moves a dated hotel or private-room stay by `(factor / model season) ^ 0.6`, marked `q: 'live'`. A ratio outside 0.4 to 3 is ignored.
  - The price is used as a factor, not taken as-is, because the most reviewed hotels are central and sit above the market.
  - The damping is there because six hotels are a small sample: a real ×2 festival week shows as about ×1.5.
- **Cost index and destination card.**
  - The cost index counts a live bed as measured in town and passes `stayLive`.
  - With the traveller's own dates, the destination card asks for the live price. The cost index reprices when the answer lands, and the stay line says "Adjusted to live prices for your nights" (6 languages).
- **SCHEMA.md** documents `xk` and the live route.

### Measured (preview deployment, real Xotelo through Cloudflare)

| Vienna, 6 properties | Factor (tonight / typical) |
|---|---|
| Sat 12 Dec 2026 (Christmas markets) | 1.28 |
| Tue 15 Dec 2026 | 0.83 |
| Tue 2 Feb 2027 | 0.51 |
| Fri 5 Feb 2027 | 0.67 |

Response times:
- first answer (12 calls): 6 to 14 s
- cached answer: 0.6 s
- invalid key: 400

### Checks

- `npm test` on merged master: 593 of 593 (5 new in `liveStays.test.mjs`).
- eslint: 0 errors.
- `npm run build:pages`: PASS.
- Preview deployments ae037ee3 and c4d1f39f, with the endpoint tested by curl.

### What broke and how it was fixed

- **Prices too high.** The first version used the live prices as the price. Vienna's popular central hotels gave €258 a night for the cheapest quartile. Switched to the factor model, then added the damping.
- **28-second first answer.** 3 nights × 6 keys at 4 calls a time took 28 s. Now it is 2 nights at 6 calls a time, and failed calls are cached so a retry does not repeat them.
- **Lost comment marker.** A docstring lost its closing `*/` in an edit (a lint error). Restored.

### End check

**Not done in a browser.** Preview origins cannot read the data host, and the production deploy was refused. The endpoint and the price maths are covered by curl and the node tests. After the deploy, check:
- the Vienna destination page with own dates: the stay line says "Adjusted to live prices for your nights", and the figure changes once the answer lands
- phone and desktop
- a town without keys keeps the modelled price with no label

### Rollback

- App: revert merges a6790e0, 649220f and c9d7ce3 in continent-app, then redeploy.
- Root: revert 1583e5a58 and 6ca4b6ea0.
- The `xk` field on R2 is ignored by the old app and needs no rollback.

## What is still open

- **T540-a.** The production Pages deploy of app master c9d7ce3 waits for the owner. The permission check refused it.
- **T540-b.** Only the destination card asks for live prices. The trip card and the planner's stop beds would use them through `bedPrice()` but never call `loadLiveStay()`.
- **T540-c.** Xotelo publishes no terms, and the app now calls it per visitor from Cloudflare, behind a 12-hour cache. Whether that is acceptable for a commercial app is the owner's call.
- **T540-d.** The monthly refresh must have `xotelo_props.json` in the private state bucket. Otherwise `build_stays` writes no `xk`, the newer live copy wins, and live prices silently switch off.
- **T540-e.** The damping exponent (0.6) and the typical night (geometric mean of the yearly range) are judgement calls. They should be checked against SerpApi samples or a few hand checks.
- **T539-a.** The scaled month fill has not yet run on real lean-scrape data (no scrape journal exists yet). The first run's report should check that the curves still pass the seasonal gate.
