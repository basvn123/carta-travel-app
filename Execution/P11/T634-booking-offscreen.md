# T634: Booking scrape runs headed in an off-screen window

## Task ID

T634

## Date

2026-10-23

## What changed

Since T624 the Booking scrape runs headed because Booking turns headless Chrome away, which put a Chrome window on the owner's screen every night (and closing it by hand ended a run on 2026-10-23). `scrape_booking.py --headed` now starts Chromium with `--window-position=-32000,-32000`: the same normal browser, served normally by Booking, but nothing on screen. `--show` puts the window back on screen for debugging. Chrome's newer headless mode (`channel="chromium"`) was tried first and is still blocked: it reports `HeadlessChrome` in its user agent, and changing that would be disguising the scraper, which the stays scrapers do not do.

## Files touched

**Modified:**
- `pipeline/stays/scrape_booking.py` (launch args, --show)
- `scripts/stays_scrape.bat` (comment only)

**Created:**
- `Execution/P11/T634-booking-offscreen.md`

## Commands run

```
python probe12.py   # new headless: blocked on Ljubljana and Porto; headed off-screen: 39 and 40 cards, 8 to 10 s
python -m pytest -q pipeline/stays/tests/test_stays.py   # 15 passed
STAYS_STATE=<copy of cache/stays> python pipeline/stays/scrape_booking.py --run 2026-10 --only BGO --headed --max-hours 0.05
```

## Config and secrets set

None. The nightly Task Scheduler entry CartaStaysNightly (owner request, outside the repo) runs `scripts/stays_scrape.bat`, so it picks this up from the next night.

## Before/after measurements

| Metric | Before (visible window, real journal) | After (off-screen, journal copy) | Delta |
|---|---|---|---|
| Bergen: pages, prices, prices with stars | 11, 364, 255 | 11, 361, 252 | same within card churn |
| Bergen: seconds per page | not separable from the 32 s run mean | 13.6 | |

## What broke and how it was fixed

No issues.

## What is still open

None new. The speed items stay under T624-a and belong in the price-engine F0 batch, which rewrites `scrape_booking.py`.

## Rollback procedure

`git revert` this task's commit. The scrape then runs in a visible window again.
