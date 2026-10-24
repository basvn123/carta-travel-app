# Explore data fill: what the Monday run on the Hetzner box does (T640)

This replaces the draft hand-run procedure of phase A. The owner decided (2026-10-23) that no step of the batch is run by hand: every step is a registered task in `run_pipeline.py`, and the weekly run on the Hetzner box (`carta-weekly.timer`, Monday 09:00 Europe/Brussels) runs them by itself once the owner steps further down are done. T640 only set this up; nothing below has been run.

## How the box selects the batch

- The box keeps its ceiling, `--max-cadence weekly` (register row T048-h). The stays, food and flight tasks of price batch F0 stay held back.
- `CARTA_EXTRA_TASKS` in `~/.config/carta/env` lists the batch's tasks. `run_pipeline.sh` passes it as `--also`: those tasks join the plan when due, whatever their cadence, and the `after` tasks that follow them come too (`field_stubs_report` after `dossier`).
- A task that has never run is due. A task with a `rev` (crowding, dossier and most of the new ones) is also due when the state file records another rev, so the extended `crowding` and `dossier` run on the first Monday even if their clocks say not yet. `--list` shows `rev` in the DUE column for those.
- `--max-hours 16` (the default `run_pipeline.sh` sets when `CARTA_EXTRA_TASKS` is set; `CARTA_MAX_HOURS` overrides, 0 = no limit): no `--also` task starts once the run is 16 hours old. The tasks left over stay due and run the next Monday. This keeps the first run inside the Healthchecks grace of one day.
- Every publishing step runs through `pipeline/field_stubs/publish.py`: snapshot the previous wire (`logs/publish_prev/<layer>/`), run the export, run `gate.py --layer <layer> --prev-dir <snapshot>`, and put the snapshot back when the command or the gate fails. Every task here is `soft`, so a failed gate is a SOFT-FAIL: the ship still builds with the previous wire, the reason is in `logs/pipeline_<date>.log` (`FAIL:` lines), and the task is due again next week. Every harvest is resumable, so a retry repeats little more than the export.
- Gate rules: coverage per key may not fall, rows may not disappear, values in range (water and `sst` 0 to 32 C, wind 0 to 40 m/s, rain days 0 to 31, opening months 1 to 12, prices above 0, transfer minutes 0 to 600, airports within 110 km, crowd shares 0 to 1), enums (`car_basis`, `transfer_mode`, trail `difficulty`), and for trails the T642 floor: no difficulty below the distance and ascent ladder of `pipeline/trails/attributes.py`. The master gate (`--layer master`) judges `app_data/app_data.json` and restores it together with `continent-app/public/app_data.json`.

## The plan, in run order

`python run_pipeline.py --max-cadence weekly --also <list> --max-hours 16 --dry-run --ship none` in the T640 worktree printed this plan on 2026-10-24. The weekly core runs first and is not budgeted. Hours are warm-cache estimates (`est_h` in the registry, printed in the plan).

| # | Task key | Cadence | Guard (a no is a skip, never a failure) | Expected | Writes and publishes | Gate | On the box |
|---|---|---|---|---|---|---|---|
| 0 | `ingestion`, `country_context`, `image_audit` | weekly | as before | as before (ingestion is the long one) | as before | as before | runs |
| 1 | `crowding` (extended) | quarterly, rev T642 | Eurostat reachable | 0.2 h | master `crowding.monthly` (T642) | master | runs |
| 2 | `transit_lines` | monthly, rev T642 | Overpass reachable | 1 h | `cache/dest_transit.json` (GTFS feeds with a verified licence, today Trenord), `cache/dest_transit_ferry.json` (OSM), `cache/transit_lines.json`, then master `local_transport.car_basis`, `car_useful_for`, `parking_hard` (`apply_car_layer.py --transit`) | master | runs |
| 3 | `airports` | quarterly, rev T642 | master present | minutes | master `airports[]`, `transfer.transfer_mode` (`apply_airport_anchors.py --airports-only`) | master | runs |
| 4 | `sea_temp` | quarterly | NOAA ERDDAP reachable, beach wire present | 2 to 3 h | `cache/sea_temp/`, `cache/sea_temp_beaches.json`, `cache/sea_temp_dest.json` | (cache only) | runs |
| 5 | `climate_daily` | quarterly, rev T641 | NASA POWER reachable | about 2.2 h | `cache/climate_power_daily.json`, `cache/climate.json`, master `climate.rain_days`, `wind_ms`, `elev_m`, `sun_h`, `water_c` | climate + master | runs |
| 6 | `beach_context` | quarterly, rev T641 | beach stages, EEA cache, `cache/beaches/raw_*` and `rich_*`, Overpass | 4 to 6 h (about 400 Overpass batches of 12, then about 265 walk batches of 25) | `cache/beaches/rich_*.json` (context v2), `cache/beach_walks.json`, `continent-app/public/beaches/*` (pool, kids pool, rentals, access, dogs, shade, operator, `sst`, `walkFrom`) | beaches | runs |
| 7 | `peak_context` | quarterly, rev T630 | mountain stages, `cache/mountains/rich_*`, Overpass | 2 to 4 h (8,898 enriched peaks, batches of 20) | `cache/mountains/rich_*.json` (huts), `cache/peak_lift_hours.json`, `continent-app/public/mountains/*` (huts, `slopeDeg`, `rangeRank`, `lift.hours`) | peaks | runs |
| 8 | `lake_detail` | quarterly, rev T642 | `cache/lakes/raw_*` and `rich_*`, EEA cache, `cache/regions`, Overpass | 3 to 6 h | `cache/lakes/rich_*.json` (bathing zones), `cache/lake_outlines.json`, `cache/lake_water_detail.json`, `continent-app/public/lakes/*` (zones, beaches around, sport zones, ferry lines, lifeguards, bans, wind profile) | lakes | runs, after beach_context, whose wire it joins |
| 9 | `dest_overlays` | quarterly | Overpass | 2 to 3 h | `cache/dest_emergency.json`, `cache/dest_swim_bans.json` | (through the dossier) | runs |
| 10 | `poi_fees` | quarterly | POI shards `continent-app/public/poi/*.json` (written by the ship), Overpass | 2 to 3 h | `cache/poi_fees.json` | (through the dossier) | runs |
| 11 | `trails_fields` | quarterly, rev T642 | trails lab up and 20 or more Geofabrik extracts | 6 h or more | `way_tags.py --refresh` (technique, exposure, sac_segments), `transit_stops.py` (ferry and bus_stop kinds), `continent-app/public/trails/*` (sac_scale, T642 difficulty floor), `continent-app/public/cycling/*` (rt) | trails, cycling | SKIPS: no Docker, no PostGIS, no extracts on the box |
| 12 | `dossier` (extended) | monthly, rev T642 | dossier stages, public app_data and activities | about 1.5 h | `continent-app/public/dossier/*` (`do[].kind`, `do[].town`, `do[].fee`, `practical.emergency`, `practical.transit`, `water.bans`, `getting_there.airports`, around rows with ascent, SAC and riding time) | `audit.py --strict`, then dossier | runs |
| 13 | `field_stubs_report` | after dossier | none | seconds | `data/reports/field_stubs.md` and `.json` | none | runs |
| - | ship | - | - | the build | `npm run build` (sync-data, then vite), then the publish to the data host when `VITE_DATA_BASE` is set | - | runs |

`ask_index` also follows `dossier` and skips on the box (no model2vec), as it always has.

### First Monday and second Monday

Warm estimates with the 16 h budget, counted from the end of the weekly core (ingestion's time on the box is not in these numbers; a long ingestion moves the cut earlier):

- Monday 1: crowding, transit_lines, airports, sea_temp, climate_daily, beach_context and peak_context start inside the budget (about 14 to 15 h together); lake_detail starts just inside it and ends around 19 to 21 h. dest_overlays, poi_fees, trails_fields and dossier are DEFERRED (still due). With the ship, about 20 to 22 h: inside the 48 h `TimeoutStartSec` of carta-weekly.service and inside the Healthchecks grace of one day.
- Monday 2: dest_overlays, poi_fees, dossier and field_stubs_report, plus any task that soft-failed on Monday 1. About 6 to 8 h.
- Without the budget (`CARTA_MAX_HOURS=0`) the first run would be about 26 to 30 h: under the 48 h timeout but past the Healthchecks grace, so the check would go red while the run is healthy. That is why the default is 16.
- Nothing else interrupts it: carta-reboot.timer fires Sunday 04:00, and `reboot-if-needed.sh` skips while `logs/carta-run.lock` is held.

### What a skip on the box means

- `trails_fields`: the trails lab (decision D5). It runs through the trails lab worker of task T647 (its section follows when it lands), or on the owner's laptop with `python run_pipeline.py --only trails_fields`. Rows T630-a (SAC filter and badges) depends on it; T630-b (cycling `rt`) was already exported in phase A (`090b6bd61`).
- A network guard that says no (an IPv4-only source seen from an IPv6-only box, a source down for the day): the task waits a week. The dry run in step 6 shows the guards that read files; the network guards are only probed by a real run.
- `poi_fees` on a box that has never shipped: no POI shards yet. The first ship writes them; the task runs the week after.

## Owner steps before Monday 09:00, in order

1. Merge and push (laptop, main checkout). The batch branch carries T640 to T642 and the coverage and report task T648; merge it into main once T648's report is in:

   ```
   cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"
   git checkout main
   git merge --no-ff p15-explore-data-fill
   git push origin main
   ```

   The app repo (`continent-app/`, no remote) merges `p15-explore-data-fill` into `master` the same way. The root already carries its mirror (T640, app branch `p15-t640-app` eb4dc56), which is what the box builds.

2. Check that R2 holds the cache tarballs the box will pull (on the box, as carta):

   ```
   rclone lsf r2:carta/archive/caches/ | grep -E 'beaches-cache|mountains-cache|regions-cache|lakes-cache'
   ```

   All four must be listed. If one is missing, push it from the machine that holds the full cache: `python pipeline/archive/pack.py --only <class>` then `python pipeline/archive/push.py --only <class>`. Never pack `lakes-cache` from a copy the box made (its `.partial-from-r2` marker refuses it anyway).

3. Move the box to the merged commit. It never pulls code itself; it is on `p3-ingestion-run-shadow`, which is already in main.

   ```
   ssh carta@<box>
   cd /home/carta/carta
   git status --short                              # tracked files an earlier run changed show here
   git diff > ~/pre-T640-$(date +%F).patch         # keep them, then:
   git checkout -- .
   git fetch origin main
   git checkout -B carta-run origin/main
   git log --oneline -1
   ```

   If `git fetch` cannot reach GitHub (an IPv6-only box), send a bundle from the laptop instead: `git bundle create carta-main.bundle main`, `scp carta-main.bundle carta@<box>:`, then on the box `git fetch ~/carta-main.bundle main:refs/remotes/origin/main` and the same `git checkout -B carta-run origin/main`.

4. Name the tasks (on the box):

   ```
   printf '%s\n' 'CARTA_EXTRA_TASKS=crowding,transit_lines,airports,sea_temp,climate_daily,beach_context,peak_context,lake_detail,dest_overlays,poi_fees,trails_fields,dossier' >> ~/.config/carta/env
   grep -E '^(CARTA_EXTRA_TASKS|CARTA_MAX_CADENCE|CARTA_MAX_HOURS|VITE_DATA_BASE)=' ~/.config/carta/env
   ```

   Leave `CARTA_MAX_CADENCE` blank or `weekly`; do not set it to `all`. `VITE_DATA_BASE` decides whether the run reaches production: blank, the new wires stay on the box until they are copied back (step 7) and deployed.

5. Disk (on the box). The run needs about 2.5 GB on top of what is there (table below); 12 GB are free.

   ```
   df -h /home/carta
   du -sh /home/carta/carta/cache /home/carta/archive-out 2>/dev/null
   ```

6. Optional, recommended: a dry run and a pull ahead of time (on the box). The dry run prints the pulls, the plan, `ADDED by --also`, the expected hours and each file guard's verdict; the pull-only run fetches the caches now, so Monday starts on the pipeline at once and a missing tarball shows today.

   ```
   cd /home/carta/carta
   CARTA_PIPELINE_ENABLED=1 bash infra/hetzner/cax11/weekly.sh --dry-run
   bash infra/hetzner/cax11/run_pipeline.sh --pull-only
   ~/venv/bin/python run_pipeline.py --list | grep -E 'crowding|transit_lines|airports|sea_temp|climate_daily|beach_context|peak_context|lake_detail|dest_overlays|poi_fees|trails_fields|dossier'
   ```

   Every listed task should say `yes` or `rev` in the DUE column.

7. After Monday's run (and again after Monday 2): `grep -E 'SOFT-FAIL|FAIL:|DEFERRED|guard:' /home/carta/carta/logs/pipeline_$(date +%F).log`. The box never commits, so to bring the published wires back into the repo, copy them to the laptop and commit them in a follow-up task:

   ```
   rsync -av carta@<box>:/home/carta/carta/continent-app/public/{beaches,lakes,mountains,dossier}/ <laptop checkout>/continent-app/public/
   rsync -av carta@<box>:/home/carta/carta/cache/climate.json <laptop checkout>/cache/
   ```

   The master travels through R2 (`master-current`), the overlay caches through `explore-overlays`.

## Disk and archive classes on the box

| Class | Pulled | Pushed | On disk | Note |
|---|---|---|---|---|
| beaches-cache | when `cache/beaches/rich_*` is missing | after a good run | 332 MB, plus its 46 MB tarball kept in `~/archive-out` | the box holds a full copy, so its push is safe; pull it on the laptop before a hand rebuild there |
| mountains-cache | when `cache/mountains/rich_*` is missing | after a good run | 129 MB, plus 16 MB | same |
| regions-cache | when `cache/regions/regions.gpkg` is missing | never | 514 MB, plus the 371 MB tarball | rg stamping in enrich_lakes and enrich_beaches |
| lakes-json (new) | when `cache/lakes/rich_*` is missing | never (pull_only) | 193 MB; streamed, the 4.7 GB tarball is never stored | marks `cache/lakes/.partial-from-r2`, after which pack.py and push.py refuse lakes-cache on that machine |
| explore-overlays (new) | when the overlays are missing; absent in R2 before the first push is not an error (`optional`) | after a good run | about 60 MB today; each new GTFS feed adds up to 500 MB | the resumable caches that let a pass finish over two Mondays |

Plus transient snapshots under `logs/publish_prev/` (master 115 MB with its public copy, dossier 92 MB, a nature layer a few MB), deleted after each passing gate. About 2.5 GB in all, against 12 GB free.

## What still needs the trails lab (decision D5)

`trails_fields` is registered behind `guard_trailslab_up` plus an extracts check and skips on the box with the line "trails lab not reachable ... (T640: this task runs through the trails lab worker, D5 / T647)". Until the T647 worker (or the laptop) runs it, trail rows carry no `sac_scale`, `technique`, `exposure` or `sac_segments` (T630-a), the trail transit flags lack the ferry and bus stop kinds (T641), the published trail wire lacks the T642 difficulty floor, and the dossier around rows keep no SAC grade.

## Rollback

- The registry: `git revert` the T640 commits on the batch branch; nothing else reads the new keys. Or on the box, empty `CARTA_EXTRA_TASKS` and the run is the weekly run it was.
- A published layer: every publish is gated and keeps its previous wire on failure. To undo a layer that passed, `git checkout HEAD -- continent-app/public/<layer>` on the box (HEAD is the merged commit) and re-ship.
- The master: the pre-write backups under `app_data/backups/` (run_pipeline.py takes one before the first writer) and the `master-snapshots` class in R2.
- R2: `beaches-cache`, `mountains-cache` and `explore-overlays` are overwritten by the box's push, and R2 keeps no versions, so the laptop's last copy is the fallback for the first two. `lakes-cache` is never written by the box.
