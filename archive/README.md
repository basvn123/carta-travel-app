# Archive - superseded code, kept for reference

Nothing in here is wired into `run_pipeline.py` or the app. Scripts keep their
original root-relative paths, so they will NOT run correctly from this folder
without fixes - that is intentional; they are retired.

| File | Replaced by | Why |
|---|---|---|
| `reharvest_flights.py` | `pipeline/harvest_all_origins.py` (weekly `fares` task) | Legacy BRU+CRL-only fare fetch; its output was discarded by `sync-data.mjs`, which ships the all-origins `public/fares/` system. |
| `refresh_fares.bat`, `refresh_fares_scheduled.bat` | `run_pipeline.bat` (CartaDataPipeline scheduled task) | Drove the legacy fare refresher above. |
| `harvest_climate.py` | `pipeline/harvest_climate_worldclim.py` | Per-point Open-Meteo calls were rate-capped; WorldClim bulk rasters cover all dests in seconds. |
| `harvest_pois_osm.py` | `pipeline/harvest_pois_overture.py` | Per-dest Overpass sweeps don't scale to the full catalogue (ban risk); Overture parquet does. |
| `harvest_protected_areas.py` | `pipeline/harvest_protected_areas_osm.py` | Wikidata SPARQL (WDQS) proved unreliable (502/504 outages); the OSM version is the live `nature` task. |
| `harvest_osm_wikidata.py` | split across `harvest_pois_overture.py`, `harvest_protected_areas_osm.py`, `harvest_pois_wikidata_images.py` | Combined v15-era script whose jobs now have dedicated, wired-in harvesters. |
| `notebooks/` (00-05, 03b) | `run_pipeline.py` + `pipeline/` | The original v1 notebook pipeline (schema v7, ~450 dests). docs/SCHEMA.md's provenance sections still describe the cost/accommodation methodology they established. |
| `HomePage.jsx`, `home-redesign.css` | nothing | The standalone home-redesign brief/draft that used to sit at the repo root. The Home tab it grew into was deleted on 2026-08-19: the app opens on Destinations and has no front page. |
| `harvest_climate_worldclim.py` | `pipeline/harvest_climate_power.py` (destination climate strip) and CHELSA V2.1 via `pipeline/lakes/lake_climate.py` (lake season model) | Switched off WorldClim 2.1 on 2026-08-30 (docs/tos/data_licenses.md, docs/LAKES.md): WorldClim is non-commercial-only and the dossier PDFs redistribute the monthly values; NASA POWER and CHELSA are both open. Nothing shipped is derived from WorldClim any more. Kept, per its own note in run_pipeline.py, "for reference only" so a pre-2026-08-30 build can be reproduced. Its own path resolution (`Path(__file__).resolve().parents[1]`) is unchanged by the move. Stale mentions remain in run_pipeline.py's `climate` task note, docs/LAKES.md and docs/tos/data_licenses.md; none of them execute the file, they only name it. |
| `trails/describe.py` | `lib/trailStory.js` (app-side prose composition) plus `pipeline/trails/attributes.py` (promotes `waymark_ref`, `passes`, `publisher` into the wire as fields) | Explicitly marked RETIRED, not disabled, in run_pipeline.py's task table comment: TrailPage stopped reading the composed prose once trailStory.js could compose the same lines from structured fields, and keeping the monthly job alive would only spend free-tier model quota for three strings the fields already carry. See docs/TRAILS.md, "Two debts, closed". Path resolution (`Path(__file__).resolve().parents[2]`) is unchanged by the move to `archive/trails/`. Stale mentions remain in run_pipeline.py's comment, pipeline/dossier/rewrite_intros.py, data/curation/research/_sources_beaches.md and docs/trails-daytrips-setup-prompts.md; none of them execute the file. |
