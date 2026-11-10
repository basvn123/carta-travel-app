# T1222: box checklist audit, and a review API that no longer locks the lab

ROADMAP items: H5 (backups), D24 (the trails lab on the box). Owner request: check that the box really does the eight owner steps on the checklist page (nightly backup, weekly-dump checks, backup alert, trailslab dump to R2, lab and review app on the box, the image test, the one trails rebuild) and finish what was missing.

## Date

2026-11-10

## What changed

Checked live on the box (`carta-orchestrator`) and in R2: the nightly Supabase backup runs every night (`carta-backup.timer`, 01:30 Brussels; last run 2026-11-10, 9 s, 113,412 bytes, checksum and counts beside it), both `SUPABASE_DB_URL` and `CARTA_BACKUP_KEY` are set, the backup key BCA9DCA8D738AC84 is imported, `pg_dump` is 18.6, `status/backup.json` answers 200 and the uptime run with `backup.enabled` true has been green all day, R2 expires `archive/db/` after 30 days, the trailslab dump goes to R2 weekly (`carta-trailslab-push.timer`, last 2026-11-10, encrypted to the owner and worker keys), and the lab runs on the box (239,571 trips, PostGIS 3.5.3, pgRouting 3.8.0). These were done by the owner session of 2026-11-08 (commit 8acb1317ac); this laptop's `main` only lagged `origin/main`. What was missing was the review app: its UI had never been built and its two units were never installed. Building and installing them showed a bug: the API runs `ALTER TABLE trips ADD COLUMN IF NOT EXISTS` on every start, which takes an ACCESS EXCLUSIVE lock even when the column exists, so a start during a trails run queued behind the pipeline's 37 minute query and would have stalled every later query on `trips` (cancelled within a minute, the pipeline was not touched). `apply_migrations` now reads the catalogue first and runs the DDL only when something is missing, under a 5 s `lock_timeout`, and the API refuses to start with a clear message if the lab is busy. Proven on the box against the live lab during the run: health answered in 3 s, the queue in 29 s, no session waited on a lock.

## Research

None chosen.

## Files touched

- `tools/trailslab/review/api/server.py` (catalogue check before the startup migrations, lock timeout, clear exit on a busy lab)
- `tests/test_review_api_migrations.py` (new)
- `docs/HANDBOOK.md` (trails lab on the box: one sentence on the startup migrations)
- `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md` (T324-a closed)
- `Execution/P15/T1222-box-checklist-review-api.md` (this report)

## Commands run

```
# on the box (carta@carta-orchestrator), read-only checks
systemctl list-timers --all 'carta-*'; journalctl -u carta-backup.service -n 40
cat ~/archive-out/nightly/last_backup.json; gpg --list-keys; pg_dump --version
docker exec trailslab-db psql ... -c "select extname, extversion from pg_extension"
# laptop
curl https://data.carta-europetravel.com/status/backup.json
npx wrangler r2 bucket lifecycle list carta
gh run list --workflow uptime.yml -L 3
# on the box, the review app
bash tools/trailslab/box/lab.sh review-build      # 7.6 s
bash tools/trailslab/box/lab.sh install
bash tools/trailslab/box/lab.sh review on         # the old API hung on its migration
bash tools/trailslab/box/lab.sh review off; select pg_terminate_backend(<the API's backend>)
# the patched server from a temporary copy on port 8012, then removed
python -m pytest tests/test_review_api_migrations.py -q   # 3 passed
python -m ruff check tools/trailslab/review/api/server.py tests/test_review_api_migrations.py
```

## Config and secrets set

None. Two systemd units installed on the box (`carta-trailslab-review-api.service`, `carta-trailslab-review-ui.service`, not enabled at boot, as designed) and `tools/trailslab/review/dist/` built there (untracked build output).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Review API start during a trails run | hung (waiting on a lock on trips, blocking the pipeline's next queries) | health 200 in 3 s, 0 sessions waiting on a lock | fixed |
| Review units installed on the box | 0 of 2 | 2 of 2 | +2 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `lab.sh review on` started an API that never listened, and its migration queued an exclusive lock behind the running pipeline | `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` take their table lock before they check; harmless on the laptop, where nothing else used the lab, but on the box the lab is shared with the pipeline | stopped the units and terminated the queued backend within a minute; `apply_migrations` now checks the catalogue first (no table lock) and runs DDL only when needed, under `lock_timeout = 5s` |
| `scp` to the box dropped its connection twice | not found (ssh itself kept working) | sent the probe script inline as base64 over ssh |
| Commands that source `~/.config/carta/env` over ssh printed nothing | the env loader swallows stdout in a non-interactive shell | redirect to a file inside the script and read it in a second call |

## Screens checked

None in a browser: the review app is reached through an ssh tunnel. The UI answered 200 on 127.0.0.1:4174 on the box and the patched API answered `/api/health` and `/api/queue`.

## What is still open

Existing rows, not new ones; the checklist items they belong to:

- Item 2, T1159-a: the restore drill on the laptop (`ops/restore_drill.sh --latest`). The laptop has no gpg and no secret key in a keyring, so it cannot decrypt a dump yet; the owner imports the backup secret key (BCA9DCA8D738AC84) first. The box half (timer installed, run checked) is done.
- Item 3: Supabase's own backup setting is a dashboard look only the owner can take; the R2 retention half is checked (30 days on `archive/db/`).
- Item 8, the one trails rebuild (T1183-a, T1094-a, T1180-a, T1201-b, T1093-a, T449-a, T311-d, T1185-a, T1184-a, T124-a, T1179-e, T1181-i, T1187-h): a quarterly box run started 2026-11-10 11:44 (`--max-cadence quarterly`, 16 h budget) is in progress and its task graph runs ingest, splice, regionize, hierarchy, curate, forests, scenic, images, way tags, attributes, then rate with the export and summaries. The routed repair (T1183-a) will skip: `CARTA_TRAILS_ROUTE_BRIDGE` is not set and the box has no BRouter segment tiles (`tools/brouter/segments4` is empty). The rows close only after the run, its push and the counts are read.
- T1159-b: retire the weekly dump in `run_pipeline.sh` once the nightly one has run a week (first nightly 2026-11-07, so from 2026-11-14).

## Rollback procedure

`git revert` of this task's commit. On the box, `lab.sh review off` and `sudo rm /etc/systemd/system/carta-trailslab-review-{api,ui}.service && sudo systemctl daemon-reload` remove the units; nothing in the lab was changed.
