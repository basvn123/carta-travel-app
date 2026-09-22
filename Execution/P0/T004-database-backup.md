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

The done condition is met. A real encrypted dump of the live project was taken
and restored successfully. It needed no database password, which is the part
worth remembering: Supabase shows that password once at project creation and
keeps only a hash, so it cannot be recovered from the dashboard at all. The
scripts instead ask the Supabase CLI for a temporary login role, minted fresh
per run and authorised by the stored access token. Nothing long-lived is kept
and no reset was needed.

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

Then the real thing, against the live project, on a second throwaway cluster
on port 5441:

```
CARTA_BACKUP_PASSPHRASE=... ops/backup_supabase.sh --out <scratch>/bk
CARTA_BACKUP_PASSPHRASE=... ops/restore_supabase.sh <scratch>/bk/carta-*.dump.gpg carta_live_verify
```

Both clusters, the test dump and the live verification dump were deleted
afterwards. The verification dump held real user data under a throwaway
passphrase in a scratch directory, so leaving it there would have been worse
than not taking it. Nothing was written outside the scratch directory and the
four repository files above. Everything run against the live project was
read-only: a dump, and `supabase db dump --dry-run` to obtain credentials.

## Config and secrets set

No secret was stored, and no database password is used. One environment
variable is read at runtime and is not written anywhere.

| Key | Value | Where it lives |
|---|---|---|
| CARTA_BACKUP_PASSPHRASE | redacted | to be created in a password manager |
| CARTA_BACKUP_DIR | optional, defaults to ~/carta-backups | shell, if overridden |

The anon key in `continent-app/.env` is a client credential and cannot perform
a dump, so it is not usable here either.

The connection goes through the session pooler at
`aws-1-eu-central-2.pooler.supabase.com:5432` as the CLI's temporary role
`cli_login_postgres.ntssxktaduxzpsmejwyv`, with `--role postgres` so the dump
can read tables the temporary role does not own. The direct host
`db.<ref>.supabase.co` is IPv6-only on this plan.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Encrypted dumps of the live project | 0 | 1, verified | +1 |
| Tested restore procedure | none | verified end to end, twice | new |
| Repeatable backup command | none | one script | new |
| Database passwords needed | unknown, assumed 1 | 0 | none |
| Live dump size | n/a | 51,130 bytes encrypted | new |
| Live rows recovered | n/a | 100 across 21 tables | 100% |
| Live objects in the archive | n/a | 42 tables, 38 policies, 59 functions, 23 FKs, 19 indexes, 6 triggers | complete |
| Synthetic rows recovered | n/a | 3,500 of 3,500 | 100% |

Two measurements, because they prove different things. The synthetic test
compared a source and a restored database across nine categories and every one
matched: RLS on both tables, 2 policies, 1 foreign key, 1 check constraint, 1
trigger, 1 function, 4 indexes, 3000 intact JSONB payloads, and 3000 rows
showing the trigger had fired. That establishes the chain is lossless, which a
live dump alone cannot show without a known-good comparison.

The live dump then proved it works against the real project: 51,130 encrypted
bytes, restoring to 100 rows across 21 tables, among them 8 profiles, 8 day
plans, 3 trip plans and the entitlements row carrying the owner year pass. The
encrypted file was confirmed as GPG AES256 data with no plaintext row values
recoverable by grep.

The catalogue data is not in here and does not need to be. Destinations,
trails, beaches and the rest are built by the pipeline into
`continent-app/public/` and are reproducible. What this dump protects is the
100 rows that are not: what users saved.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| CARTA_CLOUD_ARCHITECTURE.md not found | The file does not exist in the repository; the task cites section 6.3 of it | Worked from the second cited source, the 007_passes.sql header, which states the no-db-push constraint directly. Design decisions were made here and written into docs/BACKUP.md |
| psql hung with no output | Connection with no password prompts interactively and blocks | Used -w to force a non-interactive failure, which reported the missing password immediately |
| No database password anywhere on the machine | Supabase shows it once at creation and stores only a hash. It is not recoverable from the dashboard; only a reset is offered, which would break anything holding the old one | Avoided it entirely. `supabase db dump --dry-run` prints the connection it would use, including a temporary login role the CLI mints per run from the stored access token. The script parses those five export lines and drives its own pg_dump |
| Dump failed: permission denied for schema storage | The temporary login role has no rights on `storage` | Dropped `--schema=storage`. Confirmed first that the app makes no Supabase Storage calls, so nothing is lost. Noted in docs/BACKUP.md in case that changes |
| Dump failed: permission denied for table saved_trips | The temporary role owns nothing; the tables belong to `postgres` | Added `--role=postgres` so pg_dump switches role after connecting, which is what the CLI's own dump does |
| Local Postgres 18 needs a password | Host cluster is not trust-auth | Created a throwaway trust-auth cluster on port 5440 in the scratch directory rather than touching host configuration |
| Docker unavailable for a test database | Docker Desktop daemon not running | Same throwaway cluster; starting Docker was out of scope |
| pg_ctl -w start never returned | Known Git Bash behaviour with the wait flag | Confirmed the server was up from its log and a probe; the call was harmless |
| Restore logs one error | CREATE SCHEMA public when public already exists | Expected and harmless. Documented so the next reader does not treat it as a failure. Restores are judged on the row counts, not a silent log |
| Live restore logged 55 errors | Every RLS policy calls `auth.uid()`, and a bare local Postgres has no `auth` schema | Expected, and all 55 are that one cause. The policies are in the archive and restore into a real Supabase project. A local restore is for reading data, not for pointing an app at. Written up in docs/BACKUP.md |

## What is still open

The scripts work and the chain is proven, but no dump is being kept yet. The
verified one was deliberately destroyed: it was encrypted under a throwaway
passphrase and sat in a scratch directory, which is not a place real user data
should rest. Taking the keeper is a one-line job for whoever holds the
passphrase:

```
export CARTA_BACKUP_PASSPHRASE='<new, into a password manager>'
ops/backup_supabase.sh
```

Then copy the `.dump.gpg` and its `.sha256` off the laptop. The script prints a
reminder but cannot do it; it does not know where the off-machine storage is.
Until that copy exists, the dump is a second file on the disk whose failure it
is meant to survive. This is the one genuinely manual step and no script can
close it.

Storage is out of scope and currently empty of consequence. The temporary login
role cannot read the `storage` schema, and the app makes no Storage calls, so
nothing is lost today. If buckets are ever used, they need their own backup
path.

`auth.users` is not in the dump. If accounts themselves were lost, users would
re-authenticate through Google and the profile rows keyed by their user id
would need re-linking by hand. Project secrets, including the Gemini key, are
not in the dump either. Edge Functions are already in git.

CARTA_CLOUD_ARCHITECTURE.md is referenced by the plan but does not exist.
Either it was never written or it lives outside the repository. Worth resolving
before a later task cites it and finds the same gap.

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
