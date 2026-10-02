# T288 The R2 bucket, the cold archive and the first database dumps are live

## Task ID

T288

## Date

2026-10-02

## What changed

Stages 5.1 and 5.2 of `Execution/_OPEN-MASTER.md` were run by the owner on the laptop on 2026-10-01 and 2026-10-02, guided step by step from a Claude Code session; this report records the outcome and closes the eight register rows it settled. The R2 bucket `carta` exists with its four prefix markers and two test objects, and `cdn.carta-europetravel.com` and `data.carta-europetravel.com` are attached to it and serve the test objects with the expected Cache-Control. The cold archive described in the T045 report is now in the bucket under `archive/`: 1,359 objects, 66.43 GiB, covering the inputs (47 Geofabrik extracts, 996 DEM tiles, 289 raw-mirror files), the 12 derived-cache tarballs, the 12 master snapshots, the live master and the pipeline state file. Both databases have their first encrypted dump under `archive/db/`: trailslab at 4,866,135,487 bytes and Supabase at 127,291 bytes, each encrypted to a new 4096-bit RSA key, "Carta backups", fingerprint 1F6E1DCD2DD731E1A2C088A7BCA9DCA8D738AC84, whose secret half the owner exported to offline storage. The trailslab dump was read back end to end from R2 and decrypted, and its `trip_reviews` data holds 102,093 rows, the same count as the live table. No code changed. The laptop clean-out (T045-e) was not done and stays open, as does all of stage 5.3.

Two things in the T045 procedure did not survive contact with this laptop, and the way round each is the part the next person needs. First, the USB drive at D: is formatted FAT32, so no file on it can exceed 4 GiB; `pack.py` packed eleven layers there but the lakes tarball (4.7 GB) stopped at 4,294,966,173 bytes with Errno 28, and the trailslab dump stopped at the same limit. Lakes was packed onto C: instead and pushed from there. Second, neither disk had room for the dumps (C: fell to 1.4 GB free while Docker ran), so both dumps were streamed straight into R2 through `rclone rcat` and never written locally. The full restore into a scratch database that T045-d asked for would have needed about 11 GB on C:, which did not exist, so the proof of restore was a streamed read instead: download, decrypt, `pg_restore -f -` over the whole archive, and a row count of `trip_reviews` from the SQL stream. That proves the key, the passphrase and every byte of the file; it does not prove a PostGIS restore, which is the same `pg_restore` reading the same stream into a database.

## Files touched

Execution:

**Created:**
- Execution/P3/T288-archive-live.md

**Modified:**
- Execution/_OPEN.md (T044-a to T044-d and T045-a to T045-d closed by T288; rows T288-a to T288-d added)

**Deleted:**
- None

Nothing in `continent-app/`, `pipeline/` or `infra/` was edited. Everything else this task changed is in Cloudflare and on the laptop's disks, listed below.

## Commands run

The owner ran these in Git Bash. Stage 5.1, from `continent-app/` with `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_ZONE_ID` exported, after enabling R2 on the account in the dashboard (the first real run failed with code 10042 "Please enable R2" and created nothing):

```bash
bash scripts/r2/provision.sh --dry-run
bash scripts/r2/provision.sh
node scripts/r2/verify.mjs        # 2/2 checks passed
```

Stage 5.2, from the repo root:

```bash
python pipeline/archive/push.py --lifecycle      # with a new Account-scoped token carta-r2-admin, Workers R2 Storage: Edit

export CARTA_ARCHIVE_OUT=/d/carta-archive-out
python pipeline/archive/pack.py --out "$CARTA_ARCHIVE_OUT"          # stopped at lakes-cache, FAT32
python pipeline/archive/pack.py --only lakes-cache --out /c/carta-archive-lakes
for c in iab-cache regions-cache trails-cache mountains-cache trips-cache fare-estimation-history; do
  python pipeline/archive/pack.py --only $c --out "$CARTA_ARCHIVE_OUT"
done

for c in master-current pipeline-state master-snapshots; do
  python pipeline/archive/push.py --only $c --out "$CARTA_ARCHIVE_OUT"
done
python pipeline/archive/push.py --only lakes-cache --out /c/carta-archive-lakes
for c in photo-embeddings photo-support geograph-index beaches-cache cycling-cache iab-cache regions-cache \
         trails-cache mountains-cache trips-cache fare-estimation-history raw-mirrors dem-tiles osm-extracts; do
  python pipeline/archive/push.py --only $c --out "$CARTA_ARCHIVE_OUT"
done

rclone check data/raw/geofabrik r2:carta/archive/inputs/geofabrik --one-way
rclone check data/raw/dem       r2:carta/archive/inputs/dem       --one-way
rclone check data/raw           r2:carta/archive/inputs/raw       --one-way --exclude "/geofabrik/**" --exclude "/dem/**"
rclone check app_data/backups   r2:carta/archive/snapshots        --one-way
rclone check "$CARTA_ARCHIVE_OUT" r2:carta/archive/caches         --one-way --include "*.tar.gz"
rclone check /c/carta-archive-lakes r2:carta/archive/caches       --one-way --include "*.tar.gz"
rclone ls r2:carta/archive/master ; ls -l app_data/app_data.json
rclone size r2:carta/archive
rm -rf /c/carta-archive-lakes
```

The backup key and the dumps:

```bash
gpg --quick-generate-key "Carta backups <owner address>" rsa4096 encrypt never
gpg --armor --export "Carta backups" > /d/carta-backups.pub.asc
gpg --armor --export-secret-keys "Carta backups" > ~/carta-key/carta-backups.secret.asc   # moved offline by the owner

docker compose -f tools/trailslab/docker-compose.yml up -d
set -o pipefail
PGPASSWORD=trailslab pg_dump -h 127.0.0.1 -p 5433 -U trailslab -d trailslab -Fc -Z 6 \
  | gpg --batch --yes --trust-model always --encrypt --recipient "Carta backups" \
  | rclone rcat r2:carta/archive/db/trailslab/trailslab-$(date +%F).dump.gpg

rclone cat r2:carta/archive/db/trailslab/trailslab-2026-10-02.dump.gpg \
  | gpg --decrypt | pg_restore -f - \
  | awk '/^COPY [^ ]*trip_reviews /{f=1;next} f&&/^\\\.$/{f=0} f{n++} END{print "trip_reviews rows:", n+0}'

pg_dump "$SUPABASE_DB_URL" -Fc -Z 6 --no-owner --no-privileges \
  | gpg --batch --yes --trust-model always --encrypt --recipient "Carta backups" \
  | rclone rcat r2:carta/archive/db/supabase/supabase-$(date +%F).dump.gpg
rclone cat r2:carta/archive/db/supabase/supabase-2026-10-02.dump.gpg | gpg --decrypt | pg_restore --list | grep -c "TABLE DATA"
```

The streamed dump is the command to repeat for T288-b. It needs no local disk, and `set -o pipefail` makes a failure in `pg_dump` or `gpg` fail the whole line rather than leave a short object in R2 under a good name.

## Config and secrets set

Cloudflare, account `daf2ff5738483ff058ac645c04638613`, zone `carta-europetravel.com`:

- R2 enabled on the free plan.
- User API token `Carta` (5.1, R2 edit plus zone and DNS rights), used for `provision.sh`. Its secret was later lost, and the API answers "Invalid API Token" for the value the owner had; it is unused.
- User API token `carta-r2-admin`, Workers R2 Storage: Edit, used for `push.py --lifecycle`; needed again for the stage 5.3 CORS step.
- Account API token `carta-rclone`, Object Read and Write on bucket `carta` only, for rclone. It was created three times because two pairs were exposed (one in a screenshot, one pasted in the chat); T288-a finishes the last swap.
- Bucket lifecycle rules added by `push.py --lifecycle`: `archive/db/` 30 days, `archive/runs/` 14 days, `archive/snapshots/` 60 days. The owner reported the run succeeded; its `lifecycle list` output was not pasted into the session.

Shell variables, never written to a file: `RCLONE_CONFIG_R2_TYPE=s3`, `RCLONE_CONFIG_R2_PROVIDER=Cloudflare`, `RCLONE_CONFIG_R2_ENDPOINT=https://daf2ff5738483ff058ac645c04638613.r2.cloudflarestorage.com`, `RCLONE_CONFIG_R2_ACCESS_KEY_ID`, `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY`, and `RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true`. The last is not in the T045 list. `push.py` and `push-data.mjs` already pass `--s3-no-check-bucket`, so the variable only matters for hand-run `rclone` commands such as `rcat` with a bucket-scoped key.

Supabase: the database password was reset in the dashboard and stored by the owner in the password manager; nothing in the project used the old one. The dump connected through the session pooler at `aws-1-eu-central-2.pooler.supabase.com:5432`; `aws-0-eu-central-2` answers "tenant/user not found" for this project.

gpg: the "Carta backups" key, fingerprint 1F6E1DCD2DD731E1A2C088A7BCA9DCA8D738AC84, passphrase in the owner's password manager, public half at `D:\carta-backups.pub.asc`.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| R2 buckets | 0 | 1 (`carta`) | +1 |
| Custom domains passing verify.mjs | 0 of 2 | 2 of 2 | +2 |
| Lifecycle rules on `carta` | 0 | 3 | +3 |
| Objects under archive/ (excluding db/) | 0 | 1,359 | +1,359 |
| Bytes under archive/ (excluding db/) | 0 | 71,325,421,551 (66.43 GiB) | +66.43 GiB |
| Database dumps in archive/db/ | 0 | 2 (4,866,135,487 and 127,291 bytes) | +2 |
| trip_reviews rows read back from the dump | not checked | 102,093 of 102,093 | all |
| Supabase tables with data in the dump | not checked | 72 | +72 |

Upload ran at 5.4 to 6.8 MB/s; the inputs (about 59 GB) took from 09:50 to about 12:50 on 2026-10-02.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `wrangler whoami` returned "Invalid format for Authorization header" | A placeholder or stray characters in `CLOUDFLARE_API_TOKEN` | Exported again cleanly; checked length and character set before use |
| `provision.sh` stopped at the first command with code 10042 | R2 was not enabled on the account | Enabled R2 in the dashboard, ran the script again; nothing had been created |
| `rclone` gave no output at all | An unclosed quote in a pasted export left Bash at a `>` continuation prompt, so nothing ran | Ctrl+C, then each export on its own line |
| rclone 401 Unauthorized, twice | First an Access Key ID and Secret from different token creations; the next day a copy from a document that capitalised the first letter of each key | New pair, copied straight from the dashboard |
| `push.py --lifecycle` failed with "Invalid access token" (9109) | The value exported was not a live token, most likely the "Token value" of a deleted R2 token | New User API token `carta-r2-admin` from My Profile, checked with `/user/tokens/verify` first |
| `pack.py` failed on lakes-cache with Errno 28 while D: had 102 GB free | D: is FAT32, maximum file size 4 GiB | Lakes packed onto C:, the rest stayed on D:; T288-c |
| The pack stopped part way through overnight | The laptop slept or the drive was disconnected | Removed the `.partial` file and packed the remaining six layers |
| Ten cache tarballs were missing from R2 after the push looked complete | The first push loop got a KeyboardInterrupt after photo-embeddings (Ctrl+C in Git Bash interrupts rather than copies) and the loop's break-on-failure skipped the rest, while the lakes line after the loop ran regardless | Found by `rclone check`, pushed again with a loop that logs a failure and carries on; checks then passed |
| The first round of `rclone check` reported "is a file not a directory" for every path | The shell running it held the deleted key pair; that message is rclone's wording for a refused listing | Exported the current pair in that shell |
| The trailslab dump to D: failed at 4 GiB | FAT32 again, and C: had too little room | Streamed both dumps to R2 with `rclone rcat` |
| `psql` to the session pooler: "tenant/user not found" | Wrong pooler host, `aws-0` instead of `aws-1` | Probed both hosts with a dummy password; `aws-1` answers with an authentication error, so it is the right one |

## What is still open

The owner was finishing two hygiene steps when this report was written (T288-a). The secret half of the backup key is still in the laptop keyring until the owner confirms the offline copy and deletes it. The `carta-rclone` pair in use on 2026-10-02 was pasted into the chat, so both listed `carta-rclone` tokens are to be deleted and one new pair made, stored only in the password manager. Nothing needs that pair until the stage 7 box. The `Carta` user token can be deleted once stage 5.3 has run on `carta-r2-admin`.

The trailslab dump expires on 2026-11-01 (T288-b). The `archive/db/` rule is 30 days, and the box's weekly run (`infra/hetzner/cax11/run_pipeline.sh`) dumps trailslab only when `TRAILSLAB_HOST` is reachable from the box, which it is not while the lab lives in Docker on the laptop. Unless someone dumps again, the only off-laptop copy of the `trip_reviews` review ledger disappears in four weeks. The cheapest fix is a monthly laptop run of the streamed command above. The alternative is a separate, longer rule for `archive/db/trailslab/`, which `push.py --lifecycle` cannot express today because it reads one rule per manifest class. The Supabase dump expires on the same day; the box makes that one weekly once it runs (stage 7).

`pack.py` should refuse a FAT32 target, or any target where a layer's projected tarball exceeds what the filesystem can hold, before packing rather than at 4 GiB (T288-c). The T045 report's restore command uses `--clean --if-exists` against the live trailslab database. That would overwrite the source while proving the backup, so any runbook that copies it should restore into a scratch database instead (T288-d). Both rows are owned by the next task. The files involved (`pipeline/archive/`, the runbooks) are rollout-owned paths in `PARALLEL-WAVES-PLAN.md`, so a wave session should not take them.

T045-e, the laptop clean-out, is now unblocked: T045-c and T045-d have passed their checks. It stays the owner's call. Stage 5.3 (T054-a to T054-c) is next in `_OPEN-MASTER.md`.

Laptop state left behind: the eleven tarballs are in `D:\carta-archive-out` (2.9 GB) as a second copy, the public key is at `D:\carta-backups.pub.asc`, and `D:\carta-dumps` is empty. The trailslab container was left running.

## Rollback procedure

This report and the register edit revert with `git revert <this commit>`.

The Cloudflare side can be undone in this order, but should not be once T045-e has deleted local data, because R2 is then the only copy. Remove the archive with `rclone purge r2:carta/archive`. Remove the three rules from `continent-app/` with `npx wrangler r2 bucket lifecycle remove carta --name carta-archive-db-expire-30d`, the same for `carta-archive-runs-expire-14d` and `carta-archive-snapshots-expire-60d`. Detach the domains with `npx wrangler r2 bucket domain remove carta --domain cdn.carta-europetravel.com` and the same for `data.`. Then empty the bucket and run `npx wrangler r2 bucket delete carta`. Deleting the bucket frees the name. Today the app reads nothing from R2, so none of this affects production until stage 5.3's cutover.

The dumps cannot be decrypted without the offline secret key and its passphrase. Losing either makes every dump unreadable, and there is no recovery for that.
