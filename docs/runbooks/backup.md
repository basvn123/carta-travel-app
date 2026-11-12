# Runbook: backup and restore

Written by T1085 (ROADMAP B2) from the code: `ops/backup_supabase.sh`, `ops/restore_supabase.sh`, `infra/hetzner/cax11/run_pipeline.sh`, `pipeline/archive/manifest.yml`, `pipeline/archive/push.py`, `infra/hetzner/README.md`. The old `archive/execution-2026-11-11:archive/docs-2026-11/BACKUP.md` was distrusted and not copied. Names and places only, never a secret value (see [../security/SECRETS.md](../security/SECRETS.md)).

## What exists, in one table

| What | Where it goes | How often and who | Kept for | Encryption |
|---|---|---|---|---|
| Supabase project `public` schema (user data: profiles, saved trips, passes) | `~/carta-backups/carta-<UTC stamp>.dump.gpg` plus `.sha256` on the laptop (`CARTA_BACKUP_DIR` or `--out`) | By hand with `ops/backup_supabase.sh`, before every hand-pasted SQL migration | Until you delete it. Copying it off the laptop is manual: the script prints "NOT DONE YET" and does nothing more | gpg symmetric AES256, passphrase `CARTA_BACKUP_PASSPHRASE` |
| Supabase database, all schemas the role can read | R2 bucket `carta`, key `archive/db/supabase/supabase-<YYYY-MM-DD>.dump.gpg` | Every run of `run_pipeline.sh` on the build box (weekly timer), if `SUPABASE_DB_URL`, `CARTA_BACKUP_KEY`, `gpg` and `pg_dump` 17 or newer are present | `lifecycle_days: 30` in `pipeline/archive/manifest.yml`; the box deletes its own copy after 8 days (`-mtime +8`) once pushed | gpg public key `CARTA_BACKUP_KEY`; the box holds only the public half |
| Trailslab lab database | `archive/db/trailslab/trailslab-<date>.dump.gpg` | Box dump only when `TRAILSLAB_HOST` answers (on the box it normally does not); the trailslab worker also writes one (`infra/hetzner/README.md`, "The trailslab job") | `lifecycle_days: 30` | Owner key, plus the worker key when `CARTA_TRAILSLAB_DUMP_CRYPT` is `worker-key` |
| Pipeline master `app_data/app_data.json` | `archive/master/app_data.json`, one fixed key, overwritten | Pushed by the box after a good run (`PUSH_CLASSES` in `infra/hetzner/cax11/run_pipeline.sh`) | Current copy only, no lifecycle rule | R2 at rest only |
| Master snapshots `app_data/backups/` | `archive/snapshots/<file>` | Pushed after every run, including a failed one | `lifecycle_days: 60` | R2 at rest only |
| Orchestrator state `logs/pipeline_state.json` | `archive/state/pipeline_state.json` | With the master, only after a good run | Current copy only | R2 at rest only |
| Fare history and model `data/history`, `data/models` | `archive/caches/fare-estimation-history.tar.gz` (packed by `pipeline/archive/pack.py`) | Weekly (`PACK_CLASSES`) | No lifecycle rule | R2 at rest only |
| Raw mirrors `data/raw` (except `geofabrik`, `dem`) | `archive/inputs/raw/` | Weekly (`PUSH_CLASSES`) | No lifecycle rule | R2 at rest only |
| Other caches (photo embeddings, lakes, beaches, trails and so on) | `archive/caches/*.tar.gz` | Not weekly: pushed by the laptop or a heavy job (`clip_sweep`, `image_transcode`) | No lifecycle rule | R2 at rest only |
| Code, docs, tracked data | The git remote | Every push | Git history | None |

`archive/runs/<run id>/` holds worker staging and expires after 14 days (`worker-runs`, `lifecycle_days: 14`). The full class list, with what is deliberately not archived (`not_archived`), is `pipeline/archive/manifest.yml`.

## What does not exist in code

- No nightly Supabase backup. Roadmap item H5 (nightly encrypted `pg_dump` to R2, 30 day retention, timed restore) is `todo` in `ROADMAP.md`. The weekly box dump is the only scheduled one.
- No timed restore drill, and no record of one. Nothing in the repository proves a box dump restores.
- No automation that copies the laptop dump off the laptop.
- No GitHub workflow takes a backup. `.github/workflows/` has no backup job.
- No Hetzner server backups: `infra/hetzner/README.md` lists "Hetzner backups: not enabled", because the box holds nothing not in git or R2.
- No bucket versioning is set up by `continent-app/scripts/r2/provision.sh`. A key that is overwritten (`archive/master/app_data.json`) or pruned (`push-data.mjs --prune`) has no earlier version in R2.
- No backup of the live wire in R2 (`data/`, `img/`). It is rebuilt by the pipeline from the master.
- Nothing in code says whether Supabase's own platform backups or point in time recovery are on for the project. That depends on the Supabase plan and is visible only in the Supabase dashboard. Treat it as unknown.
- A dump that is skipped (no key, old `pg_dump`, no `SUPABASE_DB_URL`) only logs a line "dump supabase skipped: ..." in the run log. It does not fail the run or send the failure heartbeat. A dump or push that is attempted and fails sets exit code 3 (`archive_fail`).
- `ops/backup_supabase.sh` and `ops/restore_supabase.sh` are still under `ops/`; `ROADMAP.md` plans to move them to `infra/backup/`.

## Check that the weekly dump is landing

On the box: `tail -n 40 ~/logs/weekly.log` and look for `dump supabase -> ...` and no `ARCHIVE STEP FAILED`. With the R2 remote variables set (names in `infra/hetzner/cax11/env.example`): `rclone lsf r2:carta/archive/db/supabase/`. That the secrets, the key and a 17+ `pg_dump` are in place on the live box is not verifiable from the repository; confirm by that listing.

## Take a backup by hand (before a migration)

1. `supabase login`, project linked.
2. `read -rs CARTA_BACKUP_PASSPHRASE` then `export CARTA_BACKUP_PASSPHRASE` (keep the passphrase in a password manager, not beside the dump).
3. `ops/backup_supabase.sh`. It asks the Supabase CLI for a short lived login role, so no database password is needed. It streams `pg_dump --format=custom --schema=public --no-owner --no-privileges` into gpg, so no plaintext file is written, and fails if the result is under 2048 bytes.
4. Copy the `.dump.gpg` and `.sha256` off the laptop yourself.

## Restore

Never restore over the live project in an incident. Restore to a scratch database, check the data, then decide by hand what to copy back.

Supabase dump made on the laptop (symmetric):

1. `read -rs CARTA_BACKUP_PASSPHRASE; export CARTA_BACKUP_PASSPHRASE`
2. `ops/restore_supabase.sh <file>.dump.gpg [dbname]`. It checks the `.sha256`, decrypts to a temp file that is removed on exit, drops and recreates local database `carta_restore_test` (or `dbname`), runs `pg_restore --no-owner --no-privileges`, and prints row counts. Expect errors about roles (`anon`, `authenticated`, `service_role`) and extension schemas on a plain Postgres; the script says so. Policies that call `auth.uid()` fail for lack of the `auth` schema, so a local copy is for reading data only.

Supabase dump from the box (public key):

1. Fetch: `rclone copyto r2:carta/archive/db/supabase/supabase-<date>.dump.gpg .` (the `r2` remote comes from the `RCLONE_CONFIG_R2_*` variables).
2. Decrypt with the owner's secret key, which lives off the box: `gpg --decrypt supabase-<date>.dump.gpg > supabase.dump`.
3. `pg_restore --list supabase.dump`, then `pg_restore --no-owner --no-privileges -d <scratch db> supabase.dump`; one table with `-t <table>`.
4. `ops/restore_supabase.sh` was written for the symmetric laptop dumps. It has not been checked against a public key dump, so use the commands above.

Pipeline master and caches:

- Fresh box: `bash infra/hetzner/cax11/run_pipeline.sh --pull-only` or `python pipeline/archive/push.py --pull` fetches the master, the state file and the cache tarballs. Per `run_pipeline.sh`, the master and state are pulled only when missing, so a running box is never overwritten by an older copy.
- Snapshots and dumps are never pulled automatically (`pipeline/archive/push.py` `pull_entry`). Restore a snapshot on purpose: `rclone copyto r2:carta/archive/snapshots/<file> app_data/app_data.json`, after saving the current file.
- Lifecycle rules are set only by `python pipeline/archive/push.py --lifecycle` (needs `CLOUDFLARE_API_TOKEN` and the account id). Whether it has been run on the live bucket is not verified here; `npx wrangler r2 bucket lifecycle list carta` shows it.

The detailed history of the archive build is in `.work/INDEX.md` (entry T045).

## Undo

A dump or a restore to a scratch database changes nothing live. Drop the scratch database and delete the decrypted file when done.
