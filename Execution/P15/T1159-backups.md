# T1159: Nightly backups and the restore drill

ROADMAP item **H5** (session S75). Branch `p15-s75-backups`.

## Date

2026-11-06

## What changed

The routine backup no longer depends on a person. A new box timer, `carta-backup.timer`, runs `ops/backup_nightly.sh` every night at 01:30 Brussels. It streams an encrypted `pg_dump -Fc` of the Supabase `public` schema (gpg, the owner's public key, so the box cannot read its own backups) into `r2:carta/archive/db/supabase-nightly/` with a checksum and a row-count manifest. It checks the size in R2, then prunes R2 objects older than 30 days, and records `ok` or `failed` in a status file. `ops/restore_drill.sh` is the other half: it fetches the newest dump, decrypts, restores into a scratch Postgres (it refuses the live host), compares row counts with the manifest and times each stage. The round trip was proven in the container against a local Postgres 16 with the migrations applied: dump, encrypt, upload to a stand-in for R2, fetch, decrypt, restore, verify in 2.55 s total. The live drill is the owner's (rows T1159-a to T1159-e). The hand script `ops/backup_supabase.sh` stays for the dump before a pasted migration.

## Research

A research subagent compared options (from its own knowledge; no live web check, so links need a look).

| Choice | Options | Chosen | Why |
|---|---|---|---|
| Encryption | gpg public key, age, gpg passphrase | gpg public key | Already used by the weekly dump and the key is set up; the box holds only the public half. A passphrase would have to live on the box. age is equivalent but would add a second key regime |
| Method | `pg_dump -Fc`, restic, pgBackRest, wal-g, Supabase PITR | `pg_dump -Fc` | Hosted Supabase gives no physical or WAL access. PITR is a paid same-vendor net, not an off-site copy |
| Retention | R2 lifecycle rule, `rclone delete --min-age` | Both | The lifecycle rule on `archive/db/` already exists (30 days). The script prune runs only after a verified upload and only matches `supabase-nightly-*`. The subagent warned a lifecycle rule keeps deleting when backups stop silently; hence row T1159-c (alert) |
| Restore check | `pg_restore --list` only, full restore | Full restore with row counts | Proves the data, and gives the restore time |

Links the subagent gave: https://github.com/FiloSottile/age, https://supabase.com/docs/guides/platform/backups, https://developers.cloudflare.com/r2/buckets/object-lifecycles/.

## Files touched

- Created: `ops/backup_nightly.sh`, `ops/restore_drill.sh`, `ops/supabase_local_stub.sql`, `infra/hetzner/cron/carta-backup.service`, `infra/hetzner/cron/carta-backup.timer`, `tests/test_backup_restore.py`, this report.
- Modified: `infra/hetzner/cron/install.sh` (installs, enables, verifies and disables the backup units), `docs/runbooks/backup-restore.md`, `docs/HANDBOOK.md` (build box section), `ROADMAP.md` (H5 status), `Execution/_OPEN.md` (rows appended).

## Commands run

```bash
python -m pytest tests/test_backup_restore.py tests/test_box_schedule.py -q   # 23 passed
ruff check tests/test_backup_restore.py
bash infra/hetzner/cron/install.sh --dry-run
systemd-analyze calendar "*-*-* 01:30:00 Europe/Brussels"
```

The pytest builds its own Postgres cluster in a temp dir (as the `postgres` user when run as root), applies `supabase/migrations`, seeds users and trips, generates a throwaway gpg key and puts a stand-in `rclone` (a directory acting as R2) first on PATH.

## Config and secrets set

None. The job reads `SUPABASE_DB_URL` and `CARTA_BACKUP_KEY`, already named in `infra/hetzner/cax11/env.example`. Optional: `CARTA_BACKUP_OUT`, `CARTA_BACKUP_REMOTE`, `CARTA_BACKUP_RETENTION_DAYS`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Routine Supabase backup | weekly on the box when keys set; hand script otherwise | nightly timer, status file | 7x frequency |
| Restore time (local PG 16, 69 tables, 108 rows, 87 KB dump) | never measured | 2.55 s (fetch 0.11, decrypt 0.03, restore 0.73, verify 1.68) | new |
| Live restore time | never measured | Not measured (owner, T1159-a) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Migrations failed on a plain Postgres | `anon`, `authenticated`, `service_role`, `auth` and `storage` do not exist | `ops/supabase_local_stub.sql`, loaded before the migrations and before every drill restore |
| Two migrations still fail their self-tests (048, 056) | 048 counts an AI call the stub cannot; 056 needs `public.user_settings`, which no migration creates | Tolerated in the test; row T1159-d |
| Backup died silently after "wrote" | a stand-in `rclone lsf` parsed its arguments wrongly and `set -e` plus `pipefail` ended the script | Fixed the stand-in; the script now treats an empty size as a `fail` with a message |
| Restore from a public-only dump logs FK errors | `auth.users` is not in the dump, so FKs to it cannot be added | Documented as expected; the drill judges by `problems` and counts |

Test runs before the last push: full pytest 797 passed, 2 failed (the two T1107 lists, data missing in the container); `npm test` 1712 passed, 1 failed (`recommendLevers.test.mjs` "flight lever re-orders", app code this task did not touch, likely the container lacking `public/` data; not investigated).

## Screens checked

None (no traveller-facing change).

## What is still open

- T1159-a: the live drill (install timer, run once, restore on the laptop, record seconds). Owner only.
- T1159-b: retire the weekly dump in `run_pipeline.sh` (outside this task's files).
- T1159-c: alert on a stale backup.
- T1159-d: migrations 048 and 056 cannot be rebuilt from `supabase/migrations` alone.
- T1159-e: `auth.users`, Storage objects and function secrets are in no backup.

## Owner steps (for the checklist)

- [T1159-a] Install the nightly backup timer | the routine backup only exists once the box runs it | on the box: `git pull`; `sudo bash infra/hetzner/cron/install.sh`; confirm `SUPABASE_DB_URL` and `CARTA_BACKUP_KEY` in `~/.config/carta/env`; `sudo systemctl start --no-block carta-backup.service` and check `journalctl -u carta-backup.service` | docs/runbooks/backup-restore.md
- [T1159-b] Run the restore drill and record the time | an untested backup is a guess, and the live restore time is the figure to plan an incident around | on the laptop with the GPG secret key and a scratch Postgres 17: `ops/restore_drill.sh --latest --report ~/restore-drill.json`; write the total seconds into the runbook | docs/runbooks/backup-restore.md
- [T1159-c] Check the R2 lifecycle rule and the newest object | retention only works if the rule exists, and a stopped backup is invisible | `python pipeline/archive/push.py --lifecycle` (needs Cloudflare token); `rclone lsl r2:carta/archive/db/supabase-nightly/` shows an object under 36 hours old | docs/runbooks/backup-restore.md

## Rollback procedure

`git revert` the T1159 commits. On the box: `sudo systemctl disable --now carta-backup.timer`, remove `/etc/systemd/system/carta-backup.*`, `sudo systemctl daemon-reload`. Dumps already in R2 expire by themselves after 30 days. Nothing here touches the live database (the dump is read only).
