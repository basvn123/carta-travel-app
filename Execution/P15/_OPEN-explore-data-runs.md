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
