# T679: the stays scrapers survive bad pages, and each site runs on its own

## Task ID

T679

## Date

2026-10-24

## What changed

A Booking or Hostelworld session no longer ends on one bad page. On 2026-10-23 and 24 Hostelworld stopped four times (a 60 s page timeout at Helsingborg, `ERR_INTERNET_DISCONNECTED`, `ERR_NETWORK_IO_SUSPENDED` when the laptop slept, a closed browser) and each time lost the rest of its run. Two causes: no page was wrapped, and the session caught Python's built-in `TimeoutError` (which the scraper raised itself for `--max-hours`), not Playwright's `TimeoutError`, a different class, so a slow page ended the session. Now every page is wrapped: a failure is logged, the page is not marked done (a later run retries it), the scraper waits 30 s, 1, 2, 5, then 10 minutes as failures follow one another, restarts the browser when it died, and goes on; 40 failures in a row (about 5 hours without a network) end the session and the next start resumes. A block from the site still stops it on purpose. `--max-hours` raises its own `OutOfTime`. An error nobody foresaw prints its traceback and exits 1 instead of a bare crash. Hostelworld's "no cards on the town's first page" check counted the session's pages, not the town's; fixed. `scripts/stays_scrape.bat` takes `booking`, `hostelworld` or `both` (default, the season task), each with its own log, and uploads a consistent snapshot of the journal (SQLite backup API), since the other site's scraper may be writing it. The owner's tasks: CartaStaysBooking and CartaStaysHostelworld, each starting every hour (never two at once), replace CartaStaysNightly.

## Files touched

**Modified:** `pipeline/stays/common.py` (`Trouble`, `OutOfTime`, `browser_gone`), `pipeline/stays/scrape_booking.py`, `pipeline/stays/scrape_hostelworld.py`, `scripts/stays_scrape.bat`.
**Created:** `pipeline/stays/tests/test_robust.py`, this report.
**Outside git:** `logs/run_stays_booking.cmd`, `logs/run_stays_hostelworld.cmd`; Task Scheduler CartaStaysBooking, CartaStaysHostelworld (CartaStaysNightly removed).

## Commands run

`python -m pytest pipeline/stays/tests` (42 passed); `py_compile`; a live recovery test on a scratch copy of the state: Hostelworld for LIS, BCN and PRG, its browser killed after 25 s.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| A page timeout or a dropped network | ends the session (4 times on 2026-10-23 and 24) | the page is skipped and retried later; the session goes on |
| Live test, browser killed mid-run | session over | 1 page failed, browser restarted, 15 pages and 712 prices for all three towns |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The live Booking run (old code) ended at 17:11, 13 minutes before its 6 hours | The recovery test killed every Playwright Chromium on the laptop, the live run's too | Nothing lost (the journal resumes it); kill only the test's own process tree next time |

## What is still open

None new. Closes T624-c.

## Rollback procedure

`git revert` this task's commit, then put back one task for both sites: `logs/run_stays_nightly.cmd` and CartaStaysNightly (repeat hourly).
