# Owner procedure: refresh the basemap (G12)

The Explore map draws its land, water, roads and labels from one file on R2: a Europe extract of the Protomaps basemap, built from OpenStreetMap. Protomaps publishes a new planet build every day; once a month is plenty for a trip planner. Why our own tiles: `.work/2026-11-20-map-view/decision.md` ("Base map") and `docs/tos/data_licenses.md` section 6.

What is where:
- The extract: R2 `carta/data/maps/europe-<build date>.pmtiles`, about 25 GB at zoom 14, public at `https://data.carta-europetravel.com/data/maps/...`.
- The glyphs and sprites: R2 `data/maps/fonts/` and `data/maps/sprites/v4/`. They do not need a monthly refresh.
- The name the app reads: `BASEMAP_FILE` in `continent-app/src/lib/map/cartaMapStyle.js`.
- The deploy's R2 prune never touches `data/maps/` (`OTHER_WRITERS` in `continent-app/scripts/r2/push-data.mjs`).

## Steps

1. **Move the first extract into the cache (G12-a, once).** The 2026-11-20 build lane could not write into `cache/` (a protected path), so the extract it uploaded sits in its scratch folder, which a reboot can clear. It is also on R2, so this is only a local copy. If you want it, move `C:/Users/GEBRUI~1/AppData/Local/Temp/claude/087d6591ea9ad4e8/64ec75fe-61e8-40cb-9125-b0b37710d190/scratchpad/tools/europe-2026-11-18.pmtiles` to `cache/maps/`; otherwise delete it to free 25 GB.

## Monthly refresh (owner-run, about 1 to 2 hours, mostly download and upload)

1. Get the `pmtiles` command once: download `go-pmtiles_<version>_Windows_x86_64.zip` from https://github.com/protomaps/go-pmtiles/releases and unzip `pmtiles.exe` somewhere outside the repo (not into `tools/`).
2. Check free disk: the extract needs about 25 GB, twice to be safe.
   ```
   powershell -c "[math]::Round((Get-PSDrive C).Free/1GB,1)"
   ```
3. Set the five rclone variables for R2 (the header of `continent-app/scripts/r2/push-data.mjs` lists them).
4. See the plan (newest build, its size, the two commands):
   ```
   cd continent-app
   node scripts/maps/refresh-basemap.mjs --cli <path to pmtiles.exe>
   ```
5. Extract and upload:
   ```
   node scripts/maps/refresh-basemap.mjs --cli <path to pmtiles.exe> --run --upload
   ```
   It writes `cache/maps/europe-<date>.pmtiles`, checks it with `pmtiles verify`, then uploads it with `push-maps.mjs --live` (copy only, never deletes). If the download breaks, run it again; it starts over.
6. Check the public host answers a range request with 206:
   ```
   curl -s -o NUL -w "%{http_code}\n" -r 0-16383 https://data.carta-europetravel.com/data/maps/europe-<date>.pmtiles
   ```
7. Set `BASEMAP_FILE = 'europe-<date>.pmtiles'` in `continent-app/src/lib/map/cartaMapStyle.js`, run `npm test`, commit and deploy as usual.
8. A week after the deploy (so open tabs and cached pages have moved on), delete the previous month's file on R2 by hand (Cloudflare dashboard, R2, carta, `data/maps/`) and the old local copy in `cache/maps/`. Nothing deletes them for you.

If the map ever shows the CARTO style instead of ours, the app could not read the extract (the map container then carries `data-basemap="carto"`): check step 6 for the file `BASEMAP_FILE` names.
