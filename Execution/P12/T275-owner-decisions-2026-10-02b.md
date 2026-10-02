# T275: Owner decisions of 2026-10-02 (second round) and the corrected paste list

**Task ID:** T275
**Date:** 2026-10-02
**Branch:** p12-owner-decisions-b (root only)

## What changed

The owner answered the decisions wave 4 raised.

Paste list: yes. `Execution/_OPEN-MASTER.md` now carries the three new migrations, and one ordering fault found while placing them is fixed. Stage 2 as written could not work. Migration 037 raises "apply 011 and 019 first" when 019 is missing, and 039's header says pasting 020 after it breaks 038 and 039. 019 and 020 have never been applied (the community-layer memory and T083-a both say so), so paste 8 would have failed. Stage 2.1 gains step 5: one query that shows whether 019 (`trip_plans.published_at`) and 020 (`trip_collaborators`) are live. The table gains rows 6a (019), 6b (020) and 6c (046), all before 036. Row 15 is 045, after 042. 044 is named as not belonging to stage 2, and stage 10.2 now pastes it right after 031 and before both deploys, with the pg_cron note. The re-paste table gains the 046 row, the 045 rows from 045's header and the "never re-paste 043 after 045" rule. The labels 6a to 6c keep every existing row number, so "paste 13" in stage 2.3 still points at 041. Closes T274-a and T268-b. T268-a and T265-a stay open as the owner's paste steps; they are now in the master.

Travelpayouts: remove the Drive script from `index.html`. Closes the decisions T214-b and T056-a. The removal is wave 5 task T276. It touches `vercel.json` and `public/_headers`, which the rollout also edits, so it runs as the one session that owns those files in that wave.

Trail GPX: remove the pass gate on the trail GPX and KML; the cycling GPX is already free. Closes the decision T206-a. The work is wave 5 task T176, which closes T203-b when it lands.

Confirmed as recommended: hikers lead the audience order (T203-a); no third-party analytics script and first-party events only, so no cookie banner (T214-a); the visitor count comes from the host's server-side dashboard, which reads nothing on the device (T215-a, following T214); no cold press before the launch gates pass (T208-a). The launch date (T207-a) stays open: no date was given.

Support: yes to support@carta-europetravel.com. T216-a stays open until the mailbox exists. The app swap of the four CONTACT constants waits for it, because pointing the legal pages at an address that receives nothing is worse than the current one.

T177-b (the route track wire) needs routing through the local Valhalla and BRouter servers. That is a data-lane run, not a parallel code task, so it is moved to the data lane and is not in wave 5.

## Files touched

`Execution/_OPEN-MASTER.md` (stage 2.1, 2.2, 2.5, 10.2), `Execution/_OPEN.md`, this report.

## Commands run

`grep` over migrations 036 to 046 for their stated dependencies on 019 and 020; nothing executed against any database.

## Measurements

Not measured: no number moves.

## What broke

Nothing. The 037 dependency on 019 was already in 037's own header; it had not reached the master's paste order.

## What is still open

The owner pastes in the corrected order. Launch date (T207-a). The mailbox (T216-a). Execution of T214-b and T206-a in wave 5.

## Rollback

`git revert` this commit; `_OPEN-MASTER.md` returns to the 14-row stage 2 list.
