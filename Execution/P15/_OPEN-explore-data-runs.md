# Explore data fill: ordered run procedure (T640, draft)

Draft written in phase A of the batch. The orchestrator adds the T641 and T642 steps in phase B.
Run every command from the root of a FULL root checkout (caches are git-tracked, some through LFS).
Gate = `python pipeline/field_stubs/gate.py --layer <layer>` (T640). Exit 1 means keep the previous wire:
`git checkout HEAD -- <paths>`. Never publish a failed layer.

## Preconditions found in phase A (2026-10-23)

| Need | State | What the owner or the next session does |
|---|---|---|
| trailslab PostGIS (port 5433) | Docker container `trailslab-db` is Exited (255). Docker Desktop was started, `docker start trailslab-db` was denied in the agent session | Owner: `docker start trailslab-db` (or `cd tools/trailslab && docker compose up -d`), then check `psql -h localhost -p 5433 -U trailslab trailslab -c "select count(*) from trips"` |
| Geofabrik extracts (way_tags.py) | `data/raw/geofabrik/` does not exist in any checkout (about 30 GB, C: has under 1 GB free) | Owner: free disk or point `INGEST_DATA_DIR` to a big drive, download or restore the country extracts |
| Beach, lake, peak harvest caches (`cache/beaches/raw_CC.json`, `rich_CC.json`, `cache/lakes/`, `cache/mountains/`) | Not in git, not in the main checkout, not in any worktree | Owner: restore from the machine or backup that holds them, else a full re-harvest (hours to days, see steps 2, 3 and 6) |
| NASA POWER, Overpass | Reachable (Overpass 2 slots, needs a User-Agent) | none |
| Disk | C: 0.2 GB free at the end of phase A | Free at least 10 GB before step 4 or any harvest |

## Steps

| # | Step | Command | Duration | Inputs | Writes (tracked) | Gate | Closes |
|---|---|---|---|---|---|---|---|
| 1 | Climate daily | `python -u pipeline/harvest_climate_power.py --daily` then `python pipeline/apply_climate.py` then `node continent-app/scripts/sync-data.mjs` | harvest about 2.2 h (1 worker, 3868 points, 1.4 s call + 0.8 s pace; resumable through `cache/climate_power_daily.json`), apply and sync minutes | `cache/climate.json`, `cache/climate_elevations.json`, `continent-app/public/app_data.json` | `cache/climate.json`, `cache/climate_power_daily.json`, `continent-app/public/app_data.json`, `app_data/app_data.json`, `continent-app/public/dest/*` | `gate.py --layer climate` (rain_days 0 to 31, wind_ms 0 to 40, coverage not down) | T631-a |
| 2 | Beach context pass | `python pipeline/beaches/enrich_beaches.py --refresh` (per country `--countries CC`), then `python pipeline/beaches/export_beaches.py` | many hours (Overpass batches of 12 beaches, 2 slots) | `cache/beaches/raw_CC.json` (absent), `cache/eea_bathing_water.json` | `continent-app/public/beaches/*.json` | `gate.py --layer beaches` | T631-c |
| 2b | After T641 water temperature and T642 fixes | repeat the export once, not the Overpass pass | minutes | step 2 cache | same | same | T631-d (partly) |
| 3 | Lakes (after 2) | `python pipeline/lakes/enrich_lakes.py` then `python pipeline/lakes/export_lakes.py` | hours | `cache/lakes/` (absent), beach wire | `continent-app/public/lakes/*.json` | `gate.py --layer lakes` | T631-b |
| 4 | Trails tags | `python pipeline/trails/way_tags.py --refresh` then (after T642 merges) `python pipeline/trails/export_wire.py` | hours (30 GB of extracts, 4th pass) | trailslab DB, Geofabrik extracts | `continent-app/public/trails/*.json`, `trails/trip/*.json` | `gate.py --layer trails` | T630-a |
| 5 | Cycling shape | `python pipeline/cycling/export_cycling.py` | minutes to an hour | trailslab DB | `continent-app/public/cycling/*` | `gate.py --layer cycling` | T630-b |
| 6 | Peaks context | `python pipeline/mountains/enrich_peaks.py` then `python pipeline/mountains/export_peaks.py` | hours | `cache/mountains/raw_CC.json` (absent) | `continent-app/public/mountains/*.json` | `gate.py --layer peaks` | T630-c |
| 7 | Dossier rebuild (last, after 1 to 6, T641, T642) | `python pipeline/dossier/build_dossier.py` then `node continent-app/scripts/sync-data.mjs` | about an hour (3868 dossiers) | all public wires, `cache/dossier/*` | `continent-app/public/dossier/*.json` | `gate.py --layer dossier`; `around.trails[].ascent_m` and `around.cycling[].duration_min` rise, `sac_scale` appears once step 4 ran | T632-a, T630-h |
| T641 | (orchestrator adds the new harvests here) | | | | | | |
| T642 | (orchestrator adds the new rules and the repairs here) | | | | | | |

Mirror to the app: after the last step, `node continent-app/scripts/sync-data.mjs` in `continent-app/`, then commit the app repo and mirror it into the root repo (the root tracks `continent-app/public`).

## T647 trailslab worker

Steps 4 and 5 above, run without the laptop: `run_pipeline.py`'s weekly `trailslab_worker` task spawns an on-demand x86 worker (`infra/hetzner/jobs/trailslab.sh`, CPX42) every 28 days that restores the newest trailslab dump from R2, runs `way_tags.py --refresh` and `transit_stops.py` per country over fresh Geofabrik extracts, exports trails (`--no-promote`) and cycling behind `gate.py` and `pipeline/trails/difficulty_gate.py`, and writes a fresh dump back. The orchestrator gates the wires again against its own copy, installs what passed into `continent-app/public`, so the same Monday ship publishes it, and moves the dump into `archive/db/trailslab/`. Design and reasons: `infra/hetzner/README.md`, "The trailslab job". It stays a logged skip until every step below is done.

Owner decisions first:

| Decision | Recommendation | Why |
|---|---|---|
| D6, x86 workers | Yes, for this job: CPX42 (8 vCPU, 16 GB, 320 GB) | The dumps come from the laptop's amd64-only `pgrouting/pgrouting:17-3.5-3.7` lab; no CAX type has had stock in the EU since 2026-09-03 (T299). The rate in `cost.py` (EUR 0.1292 an hour, about EUR 0.65 a run) is a planning figure: confirm it with `hcloud server-type describe cpx42`. |
| Dump keys | `worker-key`: a dedicated worker keypair, every new dump encrypted to the owner key and the worker key | Keeps "every dump in R2 is encrypted" true and the owner's offline key opens every dump. `plain` (unencrypted, ODbL data plus the curator ledger) is the alternative; set `CARTA_TRAILSLAB_DUMP_CRYPT=plain` and upload one plain dump instead of step 4. The Supabase dump is unchanged either way. |
| D7, a separate R2 token for workers (T047-f) | Yes, before the first trailslab run | The worker now also holds a gpg secret key and runs Docker images and pip packages; a token of its own can be revoked without touching the box's. R2 tokens scope to a bucket, not a prefix, so it is still Object Read and Write on `carta`. |
| The Hetzner token | Already T047-a: a Read and Write token in the box's `HCLOUD_TOKEN` | `env.example` has the line; only the owner can see whether the box's file has a value. |

Steps, in order, on the box as `carta` unless marked laptop. Do 4 before 2026-11-01, when `trailslab-2026-10-22.dump.gpg` expires.

1. The code: merge this branch, push, and on the box `cd ~/carta && git pull`. The worker clones the branch in `CARTA_REPO_BRANCH`, so it must be pushed and contain `infra/hetzner/jobs/trailslab.sh`.
2. The token and the static checks (T047-a, if not done): `HCLOUD_TOKEN` in `~/.config/carta/env`, then
   `bash infra/hetzner/cax41/verify.sh` (ends "0 failed"), `bash infra/hetzner/cax41/spawn.sh --list` (trailslab shows cpx42), `bash infra/hetzner/cax41/spawn.sh --dry-run trailslab worker-key LI`, and the sweep timer from `_OPEN-hetzner.md` step 17.
3. A selftest spawn first, on x86, since no CAX is in stock: `CARTA_WORKER_TYPE_SELFTEST=cpx22 bash infra/hetzner/cax41/spawn.sh selftest`. It passes when spawn.sh ends "outcome ok, exit 0", `hcloud server list --selector role=worker` is empty, and `rclone cat r2:carta/archive/built/selftest/selftest.txt` shows x86_64. This proves the amd64 rclone path in cloud-init for a few cents.
4. The worker key (box), then the dump it can read (laptop):
   ```
   # box
   export GNUPGHOME="$(mktemp -d)"
   gpg --batch --passphrase '' --quick-generate-key "Carta trailslab worker" future-default default never
   gpg --armor --export-secret-keys "Carta trailslab worker" > ~/.config/carta/trailslab-worker.sec.asc
   chmod 600 ~/.config/carta/trailslab-worker.sec.asc
   gpg --armor --export "Carta trailslab worker" > ~/carta-trailslab-worker.pub.asc
   rm -rf "$GNUPGHOME"; unset GNUPGHOME
   gpg --list-keys "$CARTA_BACKUP_KEY"        # the owner's public key must be in the box keyring (T045-d)
   ```
   Laptop, option A (the lab has changes after 2026-10-22, e.g. T641's transit work): `docker start trailslab-db`, then
   ```
   scp carta@<box>:carta-trailslab-worker.pub.asc . && gpg --import carta-trailslab-worker.pub.asc
   pg_dump -h localhost -p 5433 -U trailslab -d trailslab -Fc -Z 6 | gpg --trust-model always --encrypt -r 1F6E1DCD2DD731E1A2C088A7BCA9DCA8D738AC84 -r "Carta trailslab worker" -o trailslab-$(date +%F).dump.gpg
   rclone copyto trailslab-$(date +%F).dump.gpg r2:carta/archive/db/trailslab/trailslab-$(date +%F).dump.gpg
   ```
   Option B (re-encrypt the 2026-10-22 dump without Docker): `rclone lsl r2:carta/archive/db/ | grep trailslab` for its exact key, then
   ```
   rclone copyto r2:carta/archive/db/<key as listed> t.dump.gpg
   gpg --decrypt t.dump.gpg | gpg --trust-model always --encrypt -r 1F6E1DCD2DD731E1A2C088A7BCA9DCA8D738AC84 -r "Carta trailslab worker" -o trailslab-2026-10-22-w.dump.gpg
   rclone copyto trailslab-2026-10-22-w.dump.gpg r2:carta/archive/db/trailslab/trailslab-2026-10-22-w.dump.gpg
   ```
   Either way the new object restarts the 30-day clock. Delete the local copies afterwards.
5. Settings in `~/.config/carta/env`: `CARTA_TRAILSLAB_DUMP_CRYPT=worker-key` (or blank), and `CARTA_WORKER_R2_ACCESS_KEY_ID` / `CARTA_WORKER_R2_SECRET_ACCESS_KEY` if D7 is yes. Leave `CARTA_TRAILSLAB_WORKER` blank for now. Then `CARTA_TRAILSLAB_WORKER=1 python3 infra/hetzner/cax41/trailslab_worker.py check` must print "ready".
6. One hand-started test run that installs nothing: `CARTA_TRAILSLAB_WORKER=1 python3 infra/hetzner/cax41/trailslab_worker.py run --force --countries LI --no-install`. One country in the loop, both full exports, both gates on both machines, the dump moved to `archive/db/trailslab/`. About 3 to 4 h, about EUR 0.50. Read `logs/trailslab_worker/<run id>/out/MANIFEST.txt`, `out/reports/steps.tsv` and `out/reports/extracts.tsv`, and write the real per-step seconds into the register row (T647-d) so `expected_h` and the reserve can be set from measurements.
7. Switch it on: `CARTA_TRAILSLAB_WORKER=1` in `~/.config/carta/env`. The next Monday run spawns (the last good run is the step 6 one only if it is 28 days old; `--force` once more runs it now). Afterwards, `git diff --stat continent-app/public/trails continent-app/public/cycling` on the box shows what the ship carried, and `cat logs/trailslab_worker.json` the state.

Rollback: `CARTA_TRAILSLAB_WORKER=` (blank) stops the task at once. A wire that shipped wrongly: `tar -xzf logs/trailslab_worker/<run id>/prev-trails.tar.gz -C ~/carta` after removing `continent-app/public/trails` (same for cycling), then the next ship. The dumps are never deleted by the job; the older ones expire on their own.
