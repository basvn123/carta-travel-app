# Runbook: backup and restore

Owner and only operator: Bas. Rewritten by T1086 (ROADMAP B2) from `ops/backup_supabase.sh`, `ops/restore_supabase.sh`, `infra/hetzner/cax11/run_pipeline.sh`, `pipeline/archive/push.py` and `pipeline/archive/manifest.yml`, with the retired `archive/docs-2026-11/BACKUP.md` as a guide only. Every command below was checked to exist in the repo on 2026-11-05. None was run: this session had no Supabase, R2 or box access.

What is backed up, and why it matters: everything a traveller saved (profiles, trips, shares, passes, entitlements, `pass_grants`) lives only in the Supabase project `ntssxktaduxzpsmejwyv`. It cannot be rebuilt from the pipeline. Pipeline data can: the master and caches are in R2 (`r2:carta/archive/`, see [build-box.md](build-box.md)).

Two dump routes exist. Know which file you hold, because they decrypt differently.

| Route | Made by | Encrypted with | Lands in | Decrypt with |
|---|---|---|---|---|
| Hand dump | `ops/backup_supabase.sh`, on the laptop, before each hand-pasted migration | A passphrase (`CARTA_BACKUP_PASSPHRASE`, symmetric AES256) | `~/carta-backups/carta-<UTC stamp>.dump.gpg` plus `.sha256` | The same passphrase; `ops/restore_supabase.sh` does it |
| Weekly dump | The build box, inside `infra/hetzner/cax11/run_pipeline.sh` ("weekly database dumps"), when `SUPABASE_DB_URL` and `CARTA_BACKUP_KEY` are set in `~/.config/carta/env` | The owner's GPG public key; the box never holds the secret half | `supabase-<date>.dump.gpg` in `$CARTA_ARCHIVE_OUT/dumps` (default `~/archive-out/dumps`), pushed to `r2:carta/archive/db/supabase/` | The owner's GPG secret key. `ops/restore_supabase.sh` cannot read these (it only knows the passphrase) |

Both are `pg_dump --format=custom` of the `public` schema only. `auth.users`, Supabase Storage, Edge Function code and project secrets are not in either. Functions are in `supabase/functions/` in git; secrets are listed by name in [../security/SECRETS.md](../security/SECRETS.md).

## Take a hand dump (before every pasted migration)

Needs `pg_dump` 17 or newer, `gpg`, and the Supabase CLI logged in (`supabase login`; the project is linked through `supabase/.temp/project-ref`). No database password is needed: the script asks the CLI for a temporary login role. Keep the passphrase in a password manager, not next to the dumps.

```
read -rs CARTA_BACKUP_PASSPHRASE
export CARTA_BACKUP_PASSPHRASE
ops/backup_supabase.sh                      # or: ops/backup_supabase.sh --out <dir>   (also CARTA_BACKUP_DIR)
```

It refuses to call a file under 2 KB a success. Then copy the `.dump.gpg` and its `.sha256` off the laptop (a cloud drive, a disk kept elsewhere, or R2); a copy on the same disk is not a backup. Keep the last few.

## Weekly dump on the box

Runs on its own with the weekly run (`carta-weekly.timer`, Mondays 09:00 Brussels). It is skipped, with a log line, if any of these is missing: `pg_dump` 17 or newer, `gpg`, `CARTA_BACKUP_KEY`, that key in the box's keyring (`gpg --import carta-backups.pub.asc`), or `SUPABASE_DB_URL` (the Supabase session pooler string). Check it:

```
grep -i dump ~/logs/weekly.log | tail
```

A line `dump supabase skipped: ...` means no backup was made that week. The same run pushes the file with `python pipeline/archive/push.py --only supabase-dump --dump-dir <that dumps folder>`. R2 keeps `archive/db/` for 30 days only (the lifecycle rule from `push.py --lifecycle`), so at most about four weekly dumps exist.

List what is in R2 (needs the `R2` rclone remote variables from `infra/hetzner/cax11/env.example`):

```
rclone lsl r2:carta/archive/db/supabase/
```

## Prove a dump can be read (do this monthly)

Hand dump, restored to a scratch local Postgres (reachable with `PGHOST`, `PGPORT`, `PGUSER`; default `localhost:5432` as `postgres`):

```
read -rs CARTA_BACKUP_PASSPHRASE
export CARTA_BACKUP_PASSPHRASE
ops/restore_supabase.sh ~/carta-backups/carta-<stamp>.dump.gpg
```

It checks the checksum, decrypts to a temp file it deletes on exit, drops and recreates `carta_restore_test`, restores, and prints a row count per table. Errors about the missing `auth` schema (every RLS policy calls `auth.uid()`) are expected; any other error is worth reading. Judge it by the row counts. A local copy is for reading data, never for pointing the app at.

Weekly dump from R2, streamed with no disk and no database (needs the owner's GPG secret key, so run it on the laptop):

```
rclone cat r2:carta/archive/db/supabase/supabase-YYYY-MM-DD.dump.gpg | gpg --decrypt | pg_restore --list | grep -c "TABLE DATA"
```

A count of table-data entries proves the key, the file and every byte. For the trailslab dump use `r2:carta/archive/db/trailslab/trailslab-YYYY-MM-DD.dump.gpg` the same way.

## Restore for real

There is no one-command way back to the live project, on purpose. A whole-dump restore would undo every migration pasted since and drop rows travellers wrote in the meantime.

1. Restore the dump to a scratch database first (above) and confirm the lost rows are in it.
2. Take a fresh hand dump of the live project as it is now, broken or not, so you can compare later.
3. Move only what is lost, table by table: decrypt, then `pg_restore --data-only --table=<name> --dbname=<live connection string> <plain dump>`, or export the rows from the scratch database and insert them in the Supabase SQL editor (which has no undo).
4. If the whole project is gone: create a new Supabase project, paste the migrations in order from `supabase/migrations/`, deploy the functions from `supabase/functions/` after the SQL they call, set the secrets, then load the data as in step 3. Travellers re-authenticate through their sign-in provider and profile rows keyed to the old user ids need re-linking by hand. Anything newer than the last dump is gone; say so to the affected travellers.

Never run `pg_restore --clean` or `--clean --if-exists` against a live database (the live trailslab lab on port 5433 included). It drops what it is about to prove.

## Trailslab dump

The lab database is on the owner's laptop or the trailslab worker. The box skips its dump unless the lab is on the box. The dump in R2 expires after 30 days; the open decision is T288-b in `Execution/_OPEN.md` and `Execution/P15/_OPEN-hetzner-box.md`.

## What the traveller sees

Nothing while you back up or prove a dump. During a real restore of saved trips: sign-in and saved trips are failing, so post the status line from [incident.md](incident.md) first.

## Undo

A dump is read only. The scratch database `carta_restore_test` is dropped and recreated each run; remove it with `dropdb carta_restore_test`. A table restore into the live project has no undo, which is why step 2 comes first.
