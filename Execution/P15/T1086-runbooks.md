# T1086: backup, refund and incident runbooks

## Date

2026-11-05. Roadmap item B2 (register rows T1073-b and T1073-f).

## What changed

`docs/runbooks/` now holds the three runbooks B2 asked for. `backup-restore.md` and `refund.md` are new, rewritten from the code rather than from the distrusted archive copies; `incident.md` gained sections 4 (R2 or Cloudflare) and 5 (Supabase) re-checked against the repo. Differences found against the archived versions: the box now makes a weekly public-key Supabase dump (`ops/restore_supabase.sh` cannot read those, only the hand dump), the Trip Pass is 60 days since migration 053, the Year plan is a subscription granted per `invoice.paid`, and the webhook still ignores refunds. `build-box.md` now states the Hetzner boxes run in production (owner decision), and the README index lists all runbooks. Every file path, script, migration, SQL object, env variable and command the runbooks name was checked to exist in the repo with grep or ls; none was executed, since Supabase, R2 and the box are unreachable here.

## Files touched

Created: `docs/runbooks/backup-restore.md`, `docs/runbooks/refund.md`. Modified: `docs/runbooks/incident.md`, `docs/runbooks/build-box.md`, `docs/runbooks/README.md`, `ROADMAP.md` (B2 status line), `Execution/_OPEN.md` (three rows appended), this report.

## Commands run

Only reads: `ls`, `grep`, `sed`, and a loop testing that each referenced path exists (no misses).

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Archived refund SOP said Trip Pass 30 days and webhook ignores all but one event | Written before migration 053 | Rewrote with 60 days, subscription renewals and the full event list |
| Archived backup text implied one dump route | The box dump came later (T045) | Documented both routes and which tool decrypts which |
| Dump folder on the box | Dumps go to `$CARTA_ARCHIVE_OUT/dumps`, not the archive-out root | Corrected after reading `run_pipeline.sh` |

## Screens checked

None; docs only.

## What is still open

T1086-a: nothing was run against live services; the owner should do one dry run. T1086-b: confirm the weekly dump is not skipped. T1086-c: dashboard steps and the refund-ledger gap need an owner look. T1073-b and T1073-f are closed by this task in the register move below. T1073-e (box in production) is answered by the owner decision; the other doc it names, `docs/areas/build-box.md`, is outside this session's folder and still needs the same one-line correction.

## Rollback procedure

`git revert` the T1086 commit. Docs only.

## Owner steps (for the checklist)

- [T1086-a] Dry run the backup and restore runbook | nothing in it was executed against a live service | take a hand dump with ops/backup_supabase.sh; restore it with ops/restore_supabase.sh; run the rclone cat | gpg --decrypt | pg_restore --list check on the newest supabase dump | docs/runbooks/backup-restore.md
- [T1086-b] Confirm the weekly Supabase dump runs on the box | a missing SUPABASE_DB_URL or key makes it skip with only a log line | grep dump ~/logs/weekly.log on the box; check CARTA_BACKUP_KEY and SUPABASE_DB_URL in ~/.config/carta/env; gpg --import carta-backups.pub.asc if the key is missing | docs/runbooks/backup-restore.md
- [T1086-c] Re-verify dashboard steps and the refund gap | only repo objects were checked, not Stripe, Supabase or Cloudflare screens | walk refund.md steps 3 to 5 once on a test sale; check the alert and rollback lines in incident.md sections 4 and 5; decide on a refund column for pass_grants | docs/runbooks/refund.md
