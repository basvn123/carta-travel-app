# Owner procedure: the basemap refresh (G12)

The Explore map draws its land, water, roads and labels from one file on R2: a Europe extract of the Protomaps basemap, built from OpenStreetMap. The Hetzner box refreshes it once a month on its own (owner call 2026-11-20). You only check the log. Why our own tiles: `.work/2026-11-20-map-view/decision.md` ("Base map") and `docs/tos/data_licenses.md` section 6.

What is where:
- The extract: R2 `carta/data/maps/europe-<build date>.pmtiles`, about 13 GB, zoom 0 to 13 (MapLibre overzooms past 13), public at `https://data.carta-europetravel.com/data/maps/...`.
- The manifest the app reads: `data/maps/basemap.json` (`pmtiles`, `built`, `maxzoom`, `updated`, `previous`, `job_files`). The app reads it on each visit (cached five minutes) and opens the file it names; if it cannot, it reads `BASEMAP_FILE` in `continent-app/src/lib/map/cartaMapStyle.js` (the first extract, `europe-2026-11-18.pmtiles`).
- The glyphs and sprites: R2 `data/maps/fonts/` and `data/maps/sprites/v4/`. No monthly refresh.
- The job: `infra/hetzner/cax11/basemap_refresh.sh`, run by `carta-basemap.timer` on the second Wednesday of the month at 02:00 Brussels time (`infra/hetzner/cron/`). Log: `~/logs/basemap.log` on the box, and `journalctl -u carta-basemap.service`.
- The deploy's R2 prune never touches `data/maps/` (`OTHER_WRITERS` in `continent-app/scripts/r2/push-data.mjs`).

What the job does: if Protomaps has a newer build than the manifest names, it extracts Europe at zoom 13 on the box, checks it, uploads it under a new dated key, points `basemap.json` at it, and deletes only extracts it uploaded itself that were replaced more than 30 days ago (the manifest's `job_files` list). It never deletes anything else; the first extract (`europe-2026-11-18.pmtiles`, uploaded from the laptop) is not on its list and stays.

## Check (once a month, after the second Wednesday)

1. Read the log on the box:
   ```
   ssh -i ~/.ssh/carta_orchestrator_ed25519 carta@46.225.237.75 "tail -n 20 ~/logs/basemap.log"
   ```
   A good month ends with `done: europe-<date>.pmtiles`; a month with no new build says `skip: the map already reads ...`. A `FAILED:` line names the step; nothing the app reads changes before an upload has succeeded.
2. Optional, see what the app reads: open `https://data.carta-europetravel.com/data/maps/basemap.json`.

## Steps

1. **The first extract's local copy (G12-a, once).** The 2026-11-20 build lane could not write into `cache/` (a protected path), so its 13 GB copy sits in the scratch folder `C:/Users/GEBRUI~1/AppData/Local/Temp/claude/087d6591ea9ad4e8/64ec75fe-61e8-40cb-9125-b0b37710d190/scratchpad/tools/europe-2026-11-18.pmtiles`. It is on R2, so delete it to free 13 GB, or move it to `cache/maps/` if you want a local copy.
2. **The first extract on R2 (G12-b, after 2027-01-15).** Once the box has replaced it for a month, you may delete `data/maps/europe-2026-11-18.pmtiles` by hand (Cloudflare dashboard, R2, carta). First change `BASEMAP_FILE` in `continent-app/src/lib/map/cartaMapStyle.js` to a newer extract and deploy: it is the app's fallback when the manifest cannot be read.

## By hand, if the box cannot run it

- On the box, now: `sudo systemctl start --no-block carta-basemap.service`, then `journalctl -fu carta-basemap.service`. A dry run: `bash ~/carta/infra/hetzner/cax11/basemap_refresh.sh --dry-run`.
- From the laptop: `cd continent-app`, `node scripts/maps/refresh-basemap.mjs --cli <path to pmtiles.exe> --run --upload` (needs the five rclone variables and about 26 GB free), then upload a `basemap.json` naming the new file. The laptop path does not add the file to the job's ledger, so the job never deletes it.
