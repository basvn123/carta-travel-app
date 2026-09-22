# T004 — Encrypted Supabase backup

## Task ID

T004

## Date

2026-09-22

## What changed

There is now a tested way to take an encrypted dump of the live Supabase
project, and a tested way to get the data back out of one. Before this task
there was no backup of the live project at all, and no written procedure for
taking one. P2 and P4 both apply SQL migrations by hand in the Supabase SQL
editor, which has no undo, so the project was one mistyped statement away from
losing user data that exists nowhere else.

Two scripts and one document were added. `ops/backup_supabase.sh` streams
`pg_dump --format=custom` straight into `gpg --symmetric` with AES256, so the
unencrypted dump never touches disk. `ops/restore_supabase.sh` verifies the
checksum, decrypts to a temporary file that is removed on any exit path, and
restores into a local scratch database. `docs/BACKUP.md` explains the design
and the recovery procedure.

Custom format was chosen over a plain SQL dump because `pg_restore` can pull a
single table out of it. Most real incidents damage one table, and being able to
restore just that one is the difference between a short recovery and reverting
every migration applied since the dump. Symmetric encryption was chosen over a
GPG keypair because there is no GPG key on this machine, and a backup encrypted
to a key that only exists on the laptop you are recovering from is not a
backup. A passphrase in a password manager survives the laptop.

The restore script deliberately cannot target the live project. Restoring a
whole dump over a live database during an incident reverts every migration
since the dump and destroys rows written in the meantime. The documented path
is to restore locally, confirm, and then move only what is needed.

The done condition is not fully met. The restore chain is tested and works, but
no dump of the live project exists yet, because the database password is not on
this machine and is not in any `.env` file. That is the one remaining step and
it is described under "What is still open".

## Files touched

**Created:**
- ops/backup_supabase.sh
- ops/restore_supabase.sh
- docs/BACKUP.md
- Execution/P0/T004-database-backup.md

**Modified:**
- .gitignore (three rules so an encrypted dump cannot be committed by accident)

## Commands run

The restore chain was verified against a throwaway PostgreSQL 18.1 cluster
created in the scratch directory on port 5440, seeded with a schema shaped like
Carta's real one: two tables with a foreign key, a check constraint, RLS
enabled with two policies, a trigger calling a PL/pgSQL function, a JSONB
column, 500 and 3000 rows.

```
initdb -D <scratch>/pgtest -U postgres -A trust -E UTF8 --no-locale
pg_ctl -D <scratch>/pgtest -o "-p 5440" -l <scratch>/pg.log -w start

pg_dump --host=localhost --port=5440 --username=postgres --dbname=carta_src \
        --format=custom --no-owner --no-privileges --schema=public \
  | gpg --batch --yes --symmetric --cipher-algo AES256 \
        --passphrase-fd 3 --output <scratch>/carta-test.dump.gpg 3<<<"$PASS"

sha256sum <scratch>/carta-test.dump.gpg > <scratch>/carta-test.dump.gpg.sha256
CARTA_BACKUP_PASSPHRASE=... ops/restore_supabase.sh <scratch>/carta-test.dump.gpg

pg_ctl -D <scratch>/pgtest -m fast stop
```

The cluster and the test dump were deleted afterwards. Nothing was written
outside the scratch directory and the four repository files above. No command
was run against the live project beyond `supabase projects list` and one
connection probe, which failed on the missing password and wrote nothing.

The command that has not yet been run, because it needs the password:

```
SUPABASE_DB_PASSWORD=... CARTA_BACKUP_PASSPHRASE=... ops/backup_supabase.sh
```

## Config and secrets set

No secret was stored. Two environment variables are read at runtime and neither
is written anywhere.

| Key | Value | Where it lives |
|---|---|---|
| SUPABASE_DB_PASSWORD | redacted, not obtained | Supabase dashboard, Project Settings, Database |
| CARTA_BACKUP_PASSPHRASE | redacted, not yet chosen | to be created in a password manager |
| CARTA_BACKUP_DIR | optional, defaults to ~/carta-backups | shell, if overridden |

The anon key in `continent-app/.env` is a client credential and cannot perform
a dump, so it is not usable here.

The connection goes through the session pooler at
`aws-1-eu-central-2.pooler.supabase.com:5432` as user
`postgres.ntssxktaduxzpsmejwyv`, taken from `supabase/.temp/pooler-url`. The
direct host `db.<ref>.supabase.co` is IPv6-only on this plan.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Encrypted dumps of the live project | 0 | 0 | 0 |
| Tested restore procedure | none | verified end to end | new |
| Repeatable backup command | none | one script | new |
| Rows recovered in the restore test | n/a | 3,500 of 3,500 | 100% |
| Structural objects recovered | n/a | 9 of 9 categories | 100% |

The restore test compared the source and restored databases across nine
categories and every one matched: RLS enabled on both tables, 2 policies, 1
foreign key, 1 check constraint, 1 trigger, 1 function, 4 indexes, 3000 intact
JSONB payloads, and 3000 rows showing the trigger's effect. The encrypted file
was confirmed as GPG AES256 data with zero plaintext row values recoverable by
grep.

The count of real dumps is still zero. That number moves to one when the
password is supplied.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| CARTA_CLOUD_ARCHITECTURE.md not found | The file does not exist in the repository; the task cites section 6.3 of it | Worked from the second cited source, the 007_passes.sql header, which states the no-db-push constraint directly. Design decisions were made here and written into docs/BACKUP.md |
| psql hung with no output | Connection with no password prompts interactively and blocks | Used -w to force a non-interactive failure, which reported the missing password immediately |
| Local Postgres 18 needs a password | Host cluster is not trust-auth | Created a throwaway trust-auth cluster on port 5440 in the scratch directory rather than touching host configuration |
| Docker unavailable for a test database | Docker Desktop daemon not running | Same throwaway cluster; starting Docker was out of scope |
| pg_ctl -w start never returned | Known Git Bash behaviour with the wait flag | Confirmed the server was up from its log and a probe; the call was harmless |
| Restore logs one error | CREATE SCHEMA public when public already exists | Expected and harmless. Documented so the next reader does not treat it as a failure. Restores are judged on the row counts, not a silent log |

## What is still open

One step, and it is the step that makes the task's done condition true. No dump
of the live project has been taken, because the database password is not on
this machine. It is at Supabase dashboard, Project Settings, Database, and only
the project owner can read it.

To close this out:

```
export SUPABASE_DB_PASSWORD='<from the dashboard>'
export CARTA_BACKUP_PASSPHRASE='<new, into a password manager>'
ops/backup_supabase.sh
CARTA_BACKUP_PASSPHRASE='<same>' ops/restore_supabase.sh ~/carta-backups/<newest>.dump.gpg
```

Then copy the `.dump.gpg` and its `.sha256` off the laptop. The script prints a
reminder because it cannot do this itself; it does not know where the
off-machine storage is. Until that copy exists, the dump is a second file on
the disk whose failure it is meant to survive.

The restore chain itself is tested, so that second command is a confirmation
against real data rather than an unknown.

Two things are outside the dump and stay outside it. `auth.users` is managed by
Supabase and a project-level dump on this plan does not expose it, so if
accounts themselves were lost, users would re-authenticate through Google and
the profile rows keyed by their user id would need re-linking by hand. Project
secrets, including the Gemini key, are also not in the dump. Edge Functions are
in git already.

CARTA_CLOUD_ARCHITECTURE.md is referenced by the plan but does not exist. Either
it was never written or it lives outside the repository. Worth resolving before
a later task cites it again and finds the same gap.

The first real backup must be taken before the first P2 migration, not
alongside it.

## Rollback procedure

Nothing was changed that needs undoing. No live database was touched, no schema
altered, no data written. The task added three new files and five lines to
`.gitignore`.

To undo completely:

```
git checkout main
git branch -D p0-database-backup
```

If the branch was already merged, remove `ops/backup_supabase.sh`,
`ops/restore_supabase.sh`, `docs/BACKUP.md` and the T004 block at the end of
`.gitignore`. The throwaway test cluster was already stopped and deleted.

Note what rollback means here: reverting this task removes the only tested way
to recover the live project. Do it only if the scripts are being replaced by
something better.
