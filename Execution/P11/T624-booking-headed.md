# T624: Booking stay scrape reads prices and stars again

## Task ID

T624

## Date

2026-10-23

## What changed

The first real Booking.com scrape (run tag 2026-10, started out of season with FORCE=1) read 313 pages in 2.2 hours and stored 0 prices, without ever reporting a block. Booking now answers headless Chrome with a 202 and a redirect to a bare `searchresults` page: the search is gone from the URL and the page is the empty search form. The reader saw no cards, took that for a town with nothing to book, and marked the page done. A visible (headed) Chrome window gets the normal results page, with no change of browser or user agent, no CAPTCHA solving and no evasion code. Three changes: a search that has dropped out of the URL now counts as a block (`search_dropped` in `booking/page.py`), so it can never again be journalled as an empty page; `scripts/stays_scrape.bat` runs Booking with the existing `--headed` flag, and the block message says so when a headless run hits it; and the star reader follows Booking's new markup (the icons are bare `<span>` children, the "4 out of 5 stars" label sits on a button beside the block, and Booking's own estimate is drawn as `rating-circles` where it used to be `rating-squares`). Before the star fix every card read `stars = null`, so the class searches added nothing. The 313 empty journal rows and the 342 star-less Berlin test rows were deleted so the real run redoes them. Hostelworld was checked as well: it serves headless Chrome normally (17 cards on the Munich page) and needs no change here.

## Files touched

**Modified:**
- `pipeline/stays/booking/page.py` (search_dropped, looks_blocked, star reading in EXTRACT_JS)
- `pipeline/stays/scrape_booking.py` (block message names --headed)
- `scripts/stays_scrape.bat` (Booking with --headed)
- `pipeline/stays/tests/test_stays.py` (test_dropped_search_is_a_block)

**Created:**
- `Execution/P11/T624-booking-headed.md`

**Not in git (local state):**
- `cache/stays/journal_scrape.sqlite`: the 313 `done` rows of run 2026-10 deleted; later the 10 Berlin test `done` rows and 342 star-less `obs` rows deleted. Backup before any change: `cache/stays/journal_scrape.pre-t624.sqlite`.

## Commands run

```
# diagnosis (throwaway probes in the session scratchpad, no journal writes)
python probe.py / probe2.py   # headless: 202 -> 301 -> 200, URL without ss=, 0 cards; headed: 40 cards
python probe3.py              # Hostelworld headless and headed: 17 cards each
python probe5.py / probe6.py  # star markup; Berlin 4-star filter after the fix

# journal clean-up (root repo)
cp cache/stays/journal_scrape.sqlite cache/stays/journal_scrape.pre-t624.sqlite
delete from done where source='booking' and task like '2026-10|%'     -- 313 rows
delete from obs where source='booking'; delete from done where source='booking'   -- after the Berlin test: 342 + 10

# end to end, headed, one town, real journal
STAYS_STATE=<root>/cache/stays python pipeline/stays/scrape_booking.py --run 2026-10 --only BER --headed --max-hours 0.15

python -m pytest -q pipeline/stays/tests/test_stays.py    # 15 passed
```

Lint: ruff and pyflakes are not installed on this laptop, so no linter ran; the touched Python is covered by the test run above.

## Config and secrets set

None. Task Scheduler entries used for the out-of-season run (CartaStaysNow, CartaFlightsNow, CartaFlightsAll) and the AC lid action are owner-session operations outside the repo, recorded in the session, not part of this task.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Booking prices stored per page (run 2026-10 vs Berlin test) | 0 of 313 pages | 342 from 10 pages (34.2 per page) | +34.2 per page |
| Cards with an official star class, Berlin 4-star search | 0 (all null) | 20 of 45, all 4 (the other 25 are Booking estimates, ignored) | +20 |
| Cards with an official star class, Berlin popularity search | 0 | 9 of 30 (2, 3, 4, 5 stars) | +9 |
| Seconds per Booking page, headed, Berlin test (10 pages) | not measured (headless pages were empty) | 57 s | |

Berlin test prices (one night, January to May 2027 probes): hotel rooms for 2, 170 cards, €35 to €445, mean €123; hostel dorm beds, 58 cards, €13 to €57, mean €27.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 313 Booking pages journalled done with 0 prices | Booking redirects headless Chrome to a bare searchresults page (202, then 301 without the query); the block test only knew 403, 429, "captcha" and "awswaf" | A searchresults URL without `ss=` is a block; Booking runs headed |
| Every Booking card had `stars = null` | Icons are now bare spans (the counter wanted `svg` or `span[aria-hidden]`), the "out of 5" label moved to a button, and the estimate testid is `rating-circles` | Count `:scope > span`, read the label from the card's button, treat circles like squares |
| Hostelworld half of the 2026-10 run ended on its first page | The laptop lost its internet at 13:16 (`ERR_INTERNET_DISCONNECTED`); the scrapers stop the session on a network error | Not fixed here: T624-c |
| `--max-hours 0.15` Berlin test ended with "Browser.close: Connection closed" | The test's own `timeout 600` killed it at 10 minutes | Test artefact, no change |

## What is still open

- **T624-a.** Booking runs at about 57 s per page headed (Berlin, 10 pages, including the 3 to 6 s pause). T539 sized the lean plan at 32,898 pages and about 64 hours, which assumed about 7 s per page; at 57 s it is about 520 hours, or some 115 nights of 4.5 hours. Where the time goes (the 15 s card wait, the lazy-load scroll pass, overlay closing, page load in a visible window) needs profiling before the plan or the nightly hours are re-cut.
- **T624-b.** On the live Munich page Hostelworld's `parse_card` returned the same figure for dorm and private (15.53 and 15.53) on a card, so private-room medians may be dorm prices. Check the card text on a live page and fix `hostelworld/page.py`.
- **T624-c.** Both scrapers end the whole session on a network error (`ERR_INTERNET_DISCONNECTED`, `ERR_NETWORK_CHANGED` on 2026-10-23). The page is not journalled, so nothing is lost, but the night's run stops; a wait-and-retry on the page would keep it going.
- **T624-d.** The laptop has no rclone R2 remote (no `RCLONE_CONFIG_R2_*` variables, no rclone.conf), so `stays_scrape.bat` cannot upload the journal to `carta-stays-state`; the owner sets the five variables (T045) or runs `rclone config`.

## Rollback procedure

`git revert ec55565fe` (the code) and the report commit. To restore the journal as it was before this task: stop any running scrape, then copy `cache/stays/journal_scrape.pre-t624.sqlite` over `cache/stays/journal_scrape.sqlite` (that brings back the 313 empty rows, which would make the scraper skip those pages again, so this is only for forensics).
