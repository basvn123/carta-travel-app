# T045 Move the cold archive to R2 and stop the laptop being the system of record

## Task ID

T045

## Date

2026-09-27

## What changed

Nothing was uploaded and nothing local was deleted. What exists now is the whole archive procedure, written down as data and exercised as far as a machine with no Cloudflare credentials allows. The bucket "carta" still does not exist (T044-a), so the task's done condition is not met, and the honest R2 object count is 0 before and 0 after.

The procedure is three files in `pipeline/archive/`. `manifest.yml` names every gitignored path on the laptop that a clean-out would lose, sorts each into one of the four classes of section 6.3 of the cloud architecture document, and records its R2 key, its treatment, its lifecycle and its measured size and file count. `pack.py` turns each derived-cache class into one tarball. `push.py` uploads everything, pulls it back onto a fresh build box, and adds the lifecycle rules. Neither script hardcodes a path, a key or a day count.

How it works, for whoever maintains it. There are four classes. Reproducible inputs (the Geofabrik extracts, the GLO-30 tiles and the other ingestion mirrors under `data/raw`, 1,332 files and 58 GiB) go up as individual files under `archive/inputs/`, because they are already compressed, there are few of them, and a box usually wants one region, not all. Derived caches (12 layers, 29,306 files, 11.3 GB) go up as one gzip tarball per layer under `archive/caches/`, which is the point of the task: the embedding cache alone is 23,262 files, and section 7b is right that a sync which must enumerate that many objects is slow and billed per write. One tarball per layer rather than one for everything, because the layers change on different cadences and a change to one should not re-upload nine gigabytes. Master snapshots (11 dated backups) go up one object per file under `archive/snapshots/` with a 60-day expiry, and the live master `app_data/app_data.json` goes to a fixed key `archive/master/app_data.json` with no expiry, so that a pause in pushing can never expire the only remote copy. Database dumps go up gpg-encrypted under `archive/db/` with a 30-day expiry.

Tar members are stored relative to the repo root, so a pull extracts at the root and every file lands where it came from. `pack.py` skips a layer whose fingerprint (path, size and mtime of every file, no content read) has not changed since its last pack, and writes to a `.partial` name first so an interrupted pack never leaves a truncated tarball under the uploaded name. On the build box a run starts with `push.py --pull` and ends with `pack.py` then `push.py`, and only the layers that moved are re-uploaded.

Three decisions the task prompt did not anticipate, each forced by checking the tool rather than assuming it. First, objects move with rclone, not wrangler. Wrangler 4.142.0 refuses any file over 300 MiB (`MAX_UPLOAD_SIZE_BYTES = 300 * 1024 * 1024` in its `cli.js`), and 23 of the 47 OSM extracts, 6 raw mirrors and at least four tarballs are larger. rclone does multipart uploads, skips files already present, reads its remote from environment variables so no secret is written to disk, and speaks SFTP, so moving a class to a Hetzner Storage Box is a change of remote, not a rewrite. Second, lifecycle rules go through `wrangler r2 bucket lifecycle add`, one per prefix, not `lifecycle set --file`. Reading wrangler's source showed that `set` replaces every rule on the bucket, which would wipe rules on `img/`, `data/` and `tiles/` and R2's default multipart-abort rule; `add` reads the existing rules and appends. So there is no `lifecycle.json`. Third, there are two database dumps, not one. Section 6.3 names Supabase, and that dump is kept. But the trailslab PostGIS lab holds `trip_reviews`, the human review ledger and the audit trail of the trails publish gate, and it lives only inside Docker's disk image on this laptop. Section 6.4 is right that the lab is disposable build infrastructure; that one table is not, and without its dump the laptop would stay the system of record for it.

Tooling on this machine, checked: no `zstd` (so gzip level 6, set once in the manifest so a key never depends on which machine packed it), no `age`, gpg 2.2.29 present with no keys yet, pg_dump 18.1, no rclone, no boto3, Docker daemon not running, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` both unset.

On Storage Box versus R2 for the pipeline-only classes: stay on R2 for now. The whole archive is about 75 GB, which at R2's $0.015 per GB-month, less the 10 GB free, is roughly $0.97 a month with zero egress, against EUR 3 to 4 a month for a 1 TB Storage Box. R2 also keeps one bucket, one credential set and one tool. The crossover is near 250 GB of pipeline-only data, where the box's flat price wins, and the box's other advantage, sitting in the same datacentre as a Hetzner build box, only matters once the build box exists. When either happens, the inputs class is the one to move. `rclone_remote` is one setting for the whole manifest today, so moving a single class means adding a per-class remote to `push.py`, a small change because every transfer already goes through one `remote()` helper. The app never reads `archive/`, so nothing user-facing depends on where it lives.

## Files touched

Pipeline:

**Created:**
- pipeline/archive/manifest.yml
- pipeline/archive/pack.py
- pipeline/archive/push.py
- pipeline/archive/.gitignore (ignores `output/`, `pack_state.json`, `__pycache__/`)

Execution:

**Created:**
- Execution/P3/T045-archive-to-r2.md

**Modified:**
- Execution/_OPEN.md (rows T045-a to T045-g)

**Deleted:**
- None. No local data was touched. The two test tarballs were written to the session scratchpad, outside the repo.

Nothing in `continent-app/` was edited. The bug found in T044's `provision.sh` is filed as T045-f rather than fixed here, because that file belongs to T044.

## Commands run

All from the repo root in Git Bash unless marked.

```bash
echo "${CLOUDFLARE_API_TOKEN:+set} ${CLOUDFLARE_ACCOUNT_ID:+set}"      # both empty
for p in <every local_path in manifest.yml>; do [ -e "$p" ] && echo OK $p; done   # all present
du -sm data/raw/* ; du -sm cache/* ; du -sm cache/photos/* ; du -sm app_data/backups app_data/*.json
find <path> -type f | wc -l                                               # one path per call
git ls-files -o -i --exclude-standard --directory                         # every ignored path
git ls-files <each class path> | wc -l                                    # found dossier and app_data caches tracked
zstd --version ; age --version ; gpg --version ; pg_dump --version ; which rclone ; gpg --list-keys
(cd continent-app) npx wrangler r2 object put --help
(cd continent-app) npx wrangler r2 bucket lifecycle --help
(cd continent-app) npx wrangler r2 bucket lifecycle add --help
(cd continent-app) npx wrangler r2 bucket lifecycle set --help
grep -n "deleteObjectsTransition\|MAX_UPLOAD_SIZE_BYTES" <npx cache>/wrangler/wrangler-dist/cli.js
(cd continent-app) CI=1 npx wrangler r2 bucket lifecycle add carta carta-archive-db-expire-30d archive/db/ --expire-days 30 --force
    # arguments accepted, stopped at the auth check, nothing changed

python pipeline/archive/pack.py --dry-run
python pipeline/archive/pack.py --only fare-estimation-history --out "$SCRATCH/archive-out"
python pipeline/archive/pack.py --only fare-estimation-history --out "$SCRATCH/archive-out"   # second run skips, unchanged
python pipeline/archive/pack.py --only photo-embeddings --out "$SCRATCH/archive-out"
# round trip: extracted both tarballs into $SCRATCH/roundtrip with filter="data" and
# compared every file by sha256 against the source: 0 mismatches in 23,267 files

python pipeline/archive/push.py --dry-run --out "$SCRATCH/archive-out"
python pipeline/archive/push.py --pull --dry-run
python pipeline/archive/push.py --lifecycle --dry-run
python pipeline/archive/push.py --only master-current                     # exits 1, names the missing variables
```

`$SCRATCH` is the session scratchpad under `C:\Users\GEBRUI~1\AppData\Local\Temp\claude\`. The full dry-run command lists are reproduced by the three `push.py` lines above. The lifecycle list, as printed:

```
npx wrangler r2 bucket lifecycle add carta carta-archive-db-expire-30d archive/db/ --expire-days 30 --force
npx wrangler r2 bucket lifecycle add carta carta-archive-snapshots-expire-60d archive/snapshots/ --expire-days 60 --force
npx wrangler r2 bucket lifecycle list carta
```

Inputs, caches and `archive/master/` get no rule, on purpose.

### Database dump commands (written, not run)

Both dumps are encrypted to a public key, so the build box can make them without ever holding the secret that reads them. The key does not exist yet (T045-d). Create it once on a trusted machine, export the public half, and keep the private half off the laptop and off the build box:

```bash
gpg --quick-generate-key "Carta backups <owner address>" rsa4096 encrypt never
gpg --armor --export "Carta backups" > carta-backups.pub.asc      # import this on any box that dumps
gpg --armor --export-secret-keys "Carta backups" > carta-backups.secret.asc   # to offline storage, then delete
export CARTA_BACKUP_KEY="Carta backups"
export OUT=/path/with/room        # never inside the repo
```

The trailslab lab, with Docker running and the container up. The password is the local development literal in `tools/trailslab/docker-compose.yml`:

```bash
PGPASSWORD=trailslab pg_dump -h 127.0.0.1 -p 5433 -U trailslab -d trailslab -Fc -Z 6 \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$CARTA_BACKUP_KEY" \
        -o "$OUT/trailslab-$(date +%F).dump.gpg"
```

The live Supabase project, with the session pooler connection string from the Dashboard (Project Settings, Database) exported as `SUPABASE_DB_URL` for this shell only:

```bash
pg_dump "$SUPABASE_DB_URL" -Fc -Z 6 --no-owner --no-privileges \
  | gpg --batch --yes --trust-model always --encrypt --recipient "$CARTA_BACKUP_KEY" \
        -o "$OUT/supabase-$(date +%F).dump.gpg"
python pipeline/archive/push.py --only trailslab-dump --dump-dir "$OUT"
python pipeline/archive/push.py --only supabase-dump  --dump-dir "$OUT"
```

pg_dump 18.1 dumps the version 17 servers fine, but its custom-format output needs pg_restore 18 or newer to read. Restore, deliberately and by hand:

```bash
rclone copyto r2:carta/archive/db/trailslab/trailslab-YYYY-MM-DD.dump.gpg ./t.dump.gpg
gpg --decrypt ./t.dump.gpg > ./t.dump        # needs the private key
pg_restore -h 127.0.0.1 -p 5433 -U trailslab -d trailslab --clean --if-exists ./t.dump
```

A snapshot is restored the same way with `rclone copyto r2:carta/archive/snapshots/<file> app_data/`.

### Laptop clean-out (written, not run; T045-e)

Only after the push has completed and `rclone check` passes for every class. Each check must print "0 differences found":

```bash
rclone check data/raw/geofabrik r2:carta/archive/inputs/geofabrik --one-way
rclone check data/raw/dem       r2:carta/archive/inputs/dem       --one-way
rclone check data/raw           r2:carta/archive/inputs/raw       --one-way --exclude "/geofabrik/**" --exclude "/dem/**"
rclone check app_data/backups   r2:carta/archive/snapshots        --one-way
rclone check "$CARTA_ARCHIVE_OUT" r2:carta/archive/caches         --one-way --include "*.tar.gz"
rclone check app_data r2:carta/archive/master --one-way --include "/app_data.json"
rclone ls r2:carta/archive/db/                                       # both dumps listed
```

Then, from the repo root:

```bash
rm -rf data/raw data/history data/models \
       cache/photos/emb cache/photos/dumps cache/photos/models cache/photos/sheets cache/photos/geograph.sqlite \
       cache/beaches cache/cycling cache/lakes cache/iab cache/regions cache/trails cache/mountains cache/trips \
       app_data/backups app_data/app_data.json \
       tools/trailslab/valhalla/data tools/brouter/segments data/trails/famous_registry_full.json \
       data/derived/tp_fares.json tools/reachability/cache logs pipeline/logs "$CARTA_ARCHIVE_OUT"
git status --short        # must show no deletions: every path above is gitignored
```

The trailslab Docker volume is the last step and the largest (T023 measured `docker_data.vhdx` at 19.11 GB): only after the trailslab dump has been restored once into a scratch database and `trip_reviews` counted, run `docker compose -f tools/trailslab/docker-compose.yml down -v`, then reclaim the vhdx through Docker Desktop's own settings as T023 describes.

## Config and secrets set

None were set, and none could be. The real run needs, exported in the shell and never written to a file:

`RCLONE_CONFIG_R2_TYPE=s3`, `RCLONE_CONFIG_R2_PROVIDER=Cloudflare`, `RCLONE_CONFIG_R2_ENDPOINT=https://<account id>.r2.cloudflarestorage.com`, `RCLONE_CONFIG_R2_ACCESS_KEY_ID` and `RCLONE_CONFIG_R2_SECRET_ACCESS_KEY`, the last two from an R2 API token (Dashboard, R2, Manage API tokens) with Object Read and Write on the bucket `carta` only. This is a different credential from the account API token T044 uses; R2's S3 endpoint does not accept a Cloudflare API token.

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, as in T044, for `push.py --lifecycle` only.

`CARTA_ARCHIVE_OUT` (optional), the directory `pack.py` and `push.py` use for tarballs instead of `pipeline/archive/output`.

`SUPABASE_DB_URL` and `CARTA_BACKUP_KEY` for the dump commands above. `PGPASSWORD=trailslab` is the known local literal, not a secret.

## Before/after measurements

Would-be objects are the files the class holds locally, which is what it would cost in R2 objects uploaded loose. Sizes from `du -sm` are MiB; the pack figures are exact bytes.

| Class | Local files | R2 objects with treatment | Local size | R2 objects before | R2 objects after |
|---|---|---|---|---|---|
| Reproducible inputs (3 entries) | 1,332 | 1,332 (files) | 59,428 MiB | 0 | 0 |
| Derived caches (12 layers) | 29,306 | 12 (one tarball each) | 11,272 MB | 0 | 0 |
| Master snapshots and live master | 12 | 12 (files) | 1,039 MiB | 0 | 0 |
| Encrypted database dumps | 0 | 2 per dump day, 30-day expiry | not dumped | 0 | 0 |
| Total | 30,650 | 1,356 plus dumps | about 75 GB | 0 | 0 |

The two layers actually packed this session:

| Layer | Files in | Bytes in | Tarballs out | Bytes out | Round trip |
|---|---|---|---|---|---|
| fare-estimation-history (smallest) | 5 | 6,147,632 | 1 | 6,130,303 | 5 of 5 identical |
| photo-embeddings (the named case) | 23,262 | 74,469,120 | 1 | 68,879,106 | 23,262 of 23,262 identical |

Compressor: gzip level 6, because `zstd` is not installed. Compression barely matters here. Float32 embeddings and already-compressed joblib and gzip files shrink by 0.3 to 7.5 percent. The saving the task is about is the object count, 23,262 to 1, not the bytes. Packing the embedding layer took 11.4 seconds; a second run of an unchanged layer is skipped.

Other figures the task implies: lifecycle rules on the bucket, 0 before and 0 after (2 written and dry-run). Bytes in the archive classes with no copy off the laptop, about 75 GB before and about 75 GB after, because nothing was pushed. Estimated R2 bill for the archive once pushed, about $0.97 a month at today's size.

## What broke and how it was fixed

The first attempt at this task was terminated by a model safeguard mid-way, after it had written drafts of the three files and before it had run any of them, written a report or committed anything. This session resumed from those uncommitted drafts, kept their structure and most of their prose, and fixed the following.

| What | Cause | Fix |
|---|---|---|
| Every upload in the draft `push.py` would have reported success and uploaded nothing | `wrangler r2 object put` without `--remote` writes to the local Miniflare store in wrangler 4 | Objects now move with rclone against the S3 endpoint. The same omission is in T044's `provision.sh`, filed as T045-f |
| 23 OSM extracts, 6 raw mirrors and the lakes, iab, photo-support and geograph tarballs could not have been uploaded at all | wrangler caps `object put` at 300 MiB (`MAX_UPLOAD_SIZE_BYTES` in `cli.js`) | rclone, which does multipart uploads |
| A pull would have nested every cache one level deep, for example `cache/photos/emb/photo-embeddings/*.npy` | `pack.py` prefixed members with the layer name while `pull` extracted into the layer's own directory | Members are repo-relative and pull extracts at the repo root; verified by the round trip |
| Keys said `.tar.zst` while this machine produces `.tar.gz`, so pull would have tried to zstd-decode a gzip file | Compressor was chosen per machine at runtime, key pattern was fixed | One `tar_compression` setting in the manifest; keys end `.tar.gz`; asking for zstd without the binary fails loudly |
| Every push would have re-uploaded all 11 snapshots under a new date prefix | Snapshot keys used today's date instead of the file's own timestamped name | Keyed by file name; rclone skips files already present |
| The live 115 MB master had no remote copy in the plan | It was declared out of scope as "the working copy" | New `master-current` class at a fixed key with no expiry |
| The draft archived four `app_data/*_cache.json` files and all of `cache/dossier` | Not checked against git; all are tracked, `cache/dossier` has 244 tracked files, not the 8 recorded | Moved to `not_archived` with the reason |
| `cache/photos/geograph.sqlite` (941 MiB), the other 5.3 GB of `data/raw`, and `data/history` plus `data/models` were missing | The draft inventoried from the architecture table, not from `git ls-files -o -i` | Added as `geograph-index`, `raw-mirrors` and `fare-estimation-history`; the fare history cannot be re-fetched |
| `photo-support` measured 3,789 MB instead of 2,079 MB | `rglob` plus `is_file()` followed the Hugging Face `snapshots/` symlink to the 1.7 GB weights blob | Symlinks kept as symlinks and sized with `lstat` |
| `npx` would not be found by `subprocess.run` on Windows | It is `npx.cmd` | Executables resolved with `shutil.which` first |
| Several `local_object_count` values were null and one size was stale | Not measured in the draft | Every class now has a measured size and count |
| The trails review ledger had no backup plan | The draft followed section 6.4 and treated trailslab as disposable | `trailslab-dump` class added next to `supabase-dump` |

## What is still open

Everything that touches Cloudflare or deletes data belongs to the owner, and all of it waits on T044-a (the bucket) first. T044-b and T044-c, the custom domains, are not needed for the archive, because the app never reads `archive/`. T044-d asked that T045 not start before the bucket exists; this session honoured that for everything live and wrote only the scripts and the procedure, which touch no account.

Credentials and tooling (T045-a). Install rclone on whichever machine pushes, create an R2 API token with Object Read and Write on `carta`, and export the five `RCLONE_CONFIG_R2_*` variables.

Lifecycle rules (T045-b). Run `python pipeline/archive/push.py --lifecycle` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exported, then read the `lifecycle list` output it ends with. Doing this before the first push means no snapshot ever sits in the bucket without its expiry.

The real pack and push (T045-c). `pack.py` needs about 11 GB free for its output; C: had 24 GB free at the time of writing, so point `--out` or `CARTA_ARCHIVE_OUT` at a disk with room and keep it outside the repo. Then `push.py` for real, then every `rclone check` above. The four retired masters and the older Supabase dumps T023 left on the USB drive at `D:\carta-backups` can go up the same way (`rclone copy D:/carta-backups/app_data_masters r2:carta/archive/snapshots`), where they will expire after 60 days; if they should outlive that, keep the USB drive.

The first database dumps (T045-d). Create the backup key, make both dumps with the commands above, push them, and restore the trailslab one once into a scratch database to prove the key and the file both work. A backup nobody has restored is a hope, not a backup. Nothing makes the dump repeat yet; with a 30-day expiry, a month without a dump leaves no dump at all, so the dump needs a schedule, weekly at least, once the build box exists.

The laptop clean-out (T045-e). Only after T045-c and T045-d pass their checks, with the commands above. This is the task's done condition and is not met today.

T044's `provision.sh` (T045-f, next task). Its `wrangler r2 object put` calls have no `--remote`, so when the owner runs T044-a the prefix markers and the two test objects will land in local Miniflare storage and `verify.mjs` will then fail on T044-c for a reason unrelated to the domains. Fix that file before T044-a is run.

Wiring into the pipeline (T045-g, next task). Nothing calls `pack.py` or `push.py` yet. The pull at run start and the pack and push at run end belong in `run_pipeline.py` or in the build box's run script, once that box exists; the dump schedule belongs in the same place.

## Rollback procedure

Locally, delete `pipeline/archive/` and revert this commit; nothing else in the repository references those files, and no data was changed. `git revert <this commit>` restores `Execution/_OPEN.md` as well.

Once the archive exists in R2, removing it is `rclone purge r2:carta/archive` followed by removing the two rules with `npx wrangler r2 bucket lifecycle remove carta --name carta-archive-db-expire-30d` and the same for `carta-archive-snapshots-expire-60d` (run from `continent-app/`). That is safe only while the laptop still holds the data, that is before T045-e. After the clean-out, the R2 copy is the only copy of the caches, the fare history, the master and the review ledger, and deleting it is not reversible. Expired snapshots and dumps are gone by design; a lifecycle rule has no undo.
