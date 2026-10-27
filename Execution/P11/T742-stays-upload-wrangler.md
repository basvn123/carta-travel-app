# T742: the stays journal reaches R2 through wrangler

## Task ID

T742

## Date

2026-10-27

## What changed

The scrape journal never reached R2: the rclone key the owner set (`RCLONE_CONFIG_R2_*`) answers 403 Forbidden on `carta-stays-state`, and before that rclone had no key at all (T624-d, T741-a), so the monthly Actions build could not see a single Booking or Hostelworld price. `wrangler`, logged in on this laptop, reads and writes that bucket (checked with a test object, then deleted). `stays_scrape.bat` now uploads through wrangler with the same rules: a consistent snapshot of the journal (SQLite backup API), R2's copy downloaded first and never replaced by a snapshot with fewer rows, one backup of R2's copy per day (`state/backup/journal_scrape-YYYYMMDD.sqlite`, overwritten within the day, so hourly runs do not pile up 93 MB copies), and no upload when R2 already has the same rows (the idle Hostelworld task runs every hour). A failed download (no copy on R2 yet) used to leave an empty file that the row count could not read; it is now deleted, so "no copy" and "a broken copy" stay apart (a broken copy is still refused). rclone is no longer used.

## Files touched

**Modified:** `scripts/stays_scrape.bat`.
**Created:** this report.

## Commands run

`npx wrangler r2 bucket list`; a test `object put` and `delete` of `state/_probe.txt`; the upload section run twice from a test batch file in the root checkout.

## Config and secrets set

None. The `RCLONE_CONFIG_R2_*` variables stay as they are and are no longer read.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Scrape journal on R2 | none (rclone 403) | 288,972 rows uploaded, then 289,032 on the second run |
| Upload of an unchanged journal | every run (rclone) | skipped |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first test refused the upload ("no such table: obs") | wrangler leaves an empty file when the key does not exist | Delete the copy when the download fails |

## What is still open

None new. Closes T741-a and T624-d (the upload no longer needs the rclone key).

## Rollback procedure

`git revert` this commit; the journal on R2 stays (it is only read by the Actions build).
