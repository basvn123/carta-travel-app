# T741: the stays scrapers write their log in UTF-8

## Task ID

T741

## Date

2026-10-27

## What changed

From 2026-10-27 02:16 every hourly Booking run ended within 20 seconds on `UnicodeEncodeError: 'charmap' codec can't encode characters` (`scrape_booking.py` line 279, the per-town log line). Under Task Scheduler the log is a file, so Python writes it as cp1252, and the next town in line has an id with a letter outside cp1252 (two ids do, for example `gem:hafnarfjorður`). The line sits outside T679's per-page protection, so each run skipped the finished towns in seconds and died on the same town; no Booking page was scraped from about 02:00 to the merge. Both scrapers now switch stdout and stderr to UTF-8 (`errors="replace"`) before they start, and `stays_scrape.bat` sets `PYTHONIOENCODING=utf-8` as well.

## Files touched

**Modified:** `pipeline/stays/scrape_booking.py`, `pipeline/stays/scrape_hostelworld.py`, `scripts/stays_scrape.bat`.
**Created:** this report.

## Commands run

The crash reproduced (`print('gem:łódź')` redirected to a file: exit 1, the same error); `python -m pytest pipeline/stays/tests` (42 passed); a live Booking run on a scratch copy of the state for `gem:hafnarfjorður`, output redirected, `PYTHONIOENCODING` unset.

## Config and secrets set

`PYTHONIOENCODING=utf-8` inside `stays_scrape.bat` only.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Hourly Booking runs, 2026-10-27 02:16 to 09:16 | 8 runs, each ended after about 20 s, 0 pages | |
| Live test, gem:hafnarfjorður | | 6 pages, 114 prices, the log line written |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Every Booking run crashed on its log line | cp1252 log file, a town id with a letter outside it | UTF-8 streams |

## What is still open

T741-a: rclone now has R2 credentials on the laptop (no rclone.conf; the environment variables), but every call to `carta-stays-state` answers 403 Forbidden, so the journal is not uploaded (the upload guard refuses safely). The token needs object read and write on that bucket. T624-d stays open for that.

## Rollback procedure

`git revert` this commit.
