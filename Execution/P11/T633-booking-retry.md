# T633: Booking scrape retries a dropped search once before it stops

## Task ID

T633

## Date

2026-10-23

## What changed

After T624 the scheduled run (CartaStaysNow, 16:56) stopped on its first page, STN, with a 20-hour block: Booking had dropped the search from the URL once. The same STN search worked straight after, headed, from a shell (15 cards, then 10 pages and 270 prices with the real scraper on a copy of the journal) and from a Task Scheduler probe (25 and 40 cards, page visible and focused), so neither the scheduled context nor the town was the cause: Booking drops a search now and then on a page it serves a minute later. `visit()` in `scrape_booking.py` now waits 60 s and loads the same page once more when the search was dropped, and only stops the night (and writes the block) when the second load is dropped too. A 403, a 429 or a challenge page still stops at once, and headless Chrome still ends in a block, one minute later than before.

## Files touched

**Modified:**
- `pipeline/stays/scrape_booking.py` (visit: one retry on a dropped search)

**Created:**
- `Execution/P11/T633-booking-retry.md`

**Not in git (local state):**
- `cache/stays/journal_scrape.sqlite`: the T624-era block row ("challenge at STN 2027-01-12", until 2026-10-24T10:58Z) deleted so the restarted run does not wait 20 hours.

## Commands run

```
python probe7.py      # shell, headed: STN 15 cards, Berlin 30
STAYS_STATE=<copy> python pipeline/stays/scrape_booking.py --run 2026-10 --only STN --headed --max-hours 0.04   # 10 pages, 270 prices
python probe9.py via a one-off scheduled task (CartaT624Probe, removed after)   # visible, focused, 25 and 40 cards
python -m pytest -q pipeline/stays/tests/test_stays.py    # 15 passed
STAYS_STATE=<copy> python pipeline/stays/scrape_booking.py --run 2026-10 --only STN --max-hours 0.05            # headless: retry, then block, 81 s
delete from blocks where source='booking'   -- real journal
Stop-ScheduledTask / Start-ScheduledTask CartaStaysNow
```

## Config and secrets set

None.

## Before/after measurements

Not measured beyond the checks above: the change is a retry, and its effect (fewer nights lost to a one-off dropped search) shows only over many nights.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Scheduled Booking run stopped on page 1 with a 20 h block | One dropped search counted as a block (T624's rule), and Booking drops a search intermittently | One retry after 60 s before the block |

## What is still open

None new. T624-a to T624-d stay open.

## Rollback procedure

`git revert` this task's commit. No data to undo.
