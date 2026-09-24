# T028 Classify pipeline scripts into three tiers

## Task ID

T028

## Date

2026-09-23

## What changed

Every `.py` file under `pipeline/` now carries a declared tier, both in a
report and in the file itself. The tier is a `Tier: ...` line inserted as
the first line of the module's docstring (or a `#` comment when a file has
none): `Scheduled (run_pipeline task <key>)`, `Manual`, `Library`, or
`One-shot, done, kept for provenance (pipeline/oneoff)`. Two scripts were
moved to `archive/` as Superseded, with rows added to `archive/README.md`
following its existing table format.

The task's own text said 47 standalone scripts. The real numbers are
larger: 82 top-level `pipeline/*.py` files and 255 `.py` files across the
whole `pipeline/` tree (11 subpackages plus the root). 47 does not match any
natural cut of this tree exactly, but the closest candidate is the top-level
scripts that are neither imported by anything else nor wired into
`run_pipeline.py` before this task, i.e. root-level scripts a reader would
have called "loose", that count, by my inventory, is closer to 41 (34
unwired top-level scripts I found by diffing against `run_pipeline.py`'s
references, plus later corrections). I could not reconstruct exactly 47
from any grouping I tried, and I did not force the numbers to match; the
mind map's figure was likely a rough headcount taken before the codebase
had grown to its current size, not a count this task should try to hit.
What matters for T048 is that the true total (255) is now fully classified,
not that a stale headcount lines up.

`pipeline/oneoff/` was not touched as a folder. It already holds 21 scripts
that each did one dated job and are not expected to run again; that is a
fourth honest label ("one-shot, done, kept for provenance"), distinct from
Superseded (nothing replaced these, they simply finished) and distinct from
Manual (nobody is expected to reach for them routinely). None of the 21 were
archived; they already live in their intended holding pen.

`run_pipeline.py` itself was read closely but not edited. T029 audits it
next and needs to see it unchanged, per the prompt's own instruction.

## Files touched

**Modified (Tier line added to docstring or as a leading comment):**
251 files under `pipeline/` received a new `Tier:` line. The two files
tagged during dry-run testing before the batch script ran
(`pipeline/audit_gaps.py`, `pipeline/audit_quality.py`) are included in
that 251; the batch script found them already tagged and skipped them
without duplicating. The full path list is the "Path" column of the
inventory table below, tier `Scheduled`, `Manual`, or `Library`. See
"Commands run" for the exact tool that made the edits, and "Rollback
procedure" for how to undo all 253 in one step.

**Modified (existing docs):**
- `archive/README.md`, two rows added, in the table's existing voice.

**Created:**
- `pipeline/README.md`, the tier index: how to tell the tiers apart, how a
  new script gets one, a Scheduled table grouped by `run_pipeline.py` task
  key, a Manual table with the exact command/reads/writes/human-action for
  each tool, a short One-shot section, and pointers to `docs/TRAILS.md` and
  `docs/PHOTOS.md` for the Manual tools those docs already cover in depth.
- `pipeline/intake/README.md`, the three B3/B4 intake tools, since no file
  under `docs/` covers them.
- `Execution/P1/T028-classify-pipeline-scripts.md` (this report).

**Moved (git mv, Superseded):**
- `pipeline/harvest_climate_worldclim.py` -> `archive/harvest_climate_worldclim.py`
- `pipeline/trails/describe.py` -> `archive/trails/describe.py`

Both moved files also received a `Tier: Superseded, see archive/README.md`
line, inserted the same way as the other 253.

**Not touched:** `run_pipeline.py`, anything under `docs/`, `tools/`,
`scripts/`, `tests/`, or `continent-app/`, and the pre-existing uncommitted
changes noted in the task prompt (`continent-app/package.json`,
`continent-app/public/_headers`, `_redirects`, `wrangler.toml`,
`continent-app/scripts/check-pages-limits.mjs`,
`continent-app/scripts/perf/`, `continent-app/scripts/verify_data_export.mjs`,
`continent-app/reports/perf_baseline_T011.json`, `additional docs/`).

## Full inventory

253 files classified directly, plus 2 moved to Superseded. "Owner task /
replacement" names the `run_pipeline.py` task key for Scheduled scripts;
Manual, Library and One-shot rows have no single owner and are marked n/a
(their detail lives in `pipeline/README.md`'s Manual table, or in this
report's judgment-call notes below the table for the harder cases). Purpose
is the file's own opening docstring line, trimmed.

Six Scheduled scripts also carry `cadence: backfill` for some or all of
their tasks (`geonames`, `nature`, `guide`, `images`, `activities`,
`overture`, `must_descs`, `poi_images_wikidata`, `poi_images`, `climate`):
they sit in `run_pipeline.py`'s task table and are Scheduled by the task's
own rule ("the path appears in the task table"), but `--only` is the only
way they ever run; see "What is still open" for why this is a hybrid worth
flagging rather than a clean Scheduled.

| Path | Tier | Owner task / replacement | Purpose |
|---|---|---|---|
| `pipeline/apply_accommodation_anchors.py` | Scheduled | lodging | Apply rich Inside Airbnb anchors to app_data.json - measured cities only. |
| `pipeline/apply_beauty_layer.py` | Scheduled | fame | Add the schema-v9 beauty layer to an existing app_data.json in place. |
| `pipeline/apply_climate.py` | Scheduled | climate | Fold the climate normals harvested by harvest_climate.py into app_data.json. |
| `pipeline/apply_designations.py` | Scheduled | fame | Attach dest.designations to app_data.json: who has already judged this place. |
| `pipeline/apply_longtail_granularity.py` | Scheduled | lodging | Long-tail within-country granularity for accommodation (schema v16). |
| `pipeline/apply_place_layer.py` | Scheduled | fame | Write dest.place (schema v16) into app_data.json, in place. |
| `pipeline/apply_rating_layer.py` | Scheduled | poi_significance | Add the schema-v17 traveller rating to an existing app_data.json in place. |
| `pipeline/apply_stay_tiers.py` | Scheduled | staytiers | Apply hostel + hotel city anchors as stay tiers on app_data.json. |
| `pipeline/apply_tourist_premium.py` | Scheduled | lodging | Tourist-hotspot price premium layer (schema v14). |
| `pipeline/apply_wikivoyage.py` | Scheduled | guide | Fold the Wikivoyage guide blurbs harvested by harvest_wikivoyage.py into app_data.json. |
| `pipeline/audit_hero_images.py` | Scheduled | hero_audit | audit_hero_images.py - the hero image gate. |
| `pipeline/audit_quality.py` | Scheduled | audit | audit_quality.py - data-quality audit of the destination/POI master. |
| `pipeline/beaches/build_beaches.py` | Scheduled | beaches | Build the whole beach layer, from nothing to shipped wire, in one command. |
| `pipeline/build_place_candidates.py` | Scheduled | coverage | build_place_candidates.py - the candidate universe for catalogue coverage. |
| `pipeline/country_context_layer.py` | Scheduled | country_context | Country context (A6, 2026-09): where a place stands in ITS country. |
| `pipeline/cycling/bridge_gaps.py` | Scheduled | cycling_bridge | Bridge the real breaks in a cycle route by ROUTING across them, with BRouter. |
| `pipeline/cycling/cycle_images.py` | Scheduled | cycling_photos | Photographs of the RIDE, anchored on the route line. |
| `pipeline/cycling/cycle_index.py` | Scheduled | cycling_publish | The published cycle-route rating, 0 to 10, and the reasons behind it. |
| `pipeline/cycling/cycle_sources.py` | Scheduled | cycling_enrich | Every upstream the cycling layer reads, cache first, network second. |
| `pipeline/cycling/enrich_cycling.py` | Scheduled | cycling_enrich | Everything a harvested cycle route has to know before it can be rated. |
| `pipeline/cycling/export_cycling.py` | Scheduled | cycling_publish | The gate and the wire. Nothing reaches the app except through this file. |
| `pipeline/cycling/harvest_cycling.py` | Scheduled | cycling_harvest | Cycle route ingestion: Geofabrik extracts -> trailslab cycle_routes. |
| `pipeline/cycling/seed_bike_rail.py` | Scheduled | cycling_publish | Bike on trains: a curated table, because there is no feed to read. |
| `pipeline/cycling/splice_cycling.py` | Scheduled | cycling_harvest | Bridge the short breaks OSM cycle relations leave in otherwise whole routes. |
| `pipeline/cycling/stage_planner.py` | Scheduled | cycling_publish | Compose multi-day cycling tours over published routes. The differentiator. |
| `pipeline/cycling/validate_cycling.py` | Scheduled | cycling_publish | Ten hard checks, and a tour that fails one does not publish. |
| `pipeline/dedupe_pois.py` | Scheduled | poi_significance | dedupe_pois.py - master-level POI dedupe, index-stable. |
| `pipeline/dossier/audit.py` | Scheduled | dossier | Audit every built dossier against the contract, and say what is wrong. |
| `pipeline/dossier/build_dossier.py` | Scheduled | dossier | Build the per-destination dossier contract: continent-app/public/dossier/{base}.json. |
| `pipeline/dossier/fill_licences.py` | Scheduled | dossier | Resolve TASL for dossier images that none of the existing licence caches know. |
| `pipeline/dossier/fix_airport_listings.py` | Scheduled | dossier | Point the 260 gateway records at their CITY's Wikivoyage listings. |
| `pipeline/dossier/harvest_city_intros.py` | Scheduled | dossier | City descriptions for the 260 airport-tier destinations. |
| `pipeline/dossier/harvest_event_dates.py` | Scheduled | dossier | Put a month on the festivals. |
| `pipeline/dossier/harvest_landmarks.py` | Scheduled | dossier | The landmarks a place is actually known for, from Wikidata. |
| `pipeline/dossier/plan_research.py` | Scheduled | dossier | Plan the remaining S4 research sweep: who still needs it, batched to hand out. |
| `pipeline/dossier/reclassify_landmarks.py` | Scheduled | dossier | Re-derive every cached landmark's kind from its real Wikidata types. |
| `pipeline/dossier/research_do.py` | Scheduled | dossier | S4, the "best things to do" research sweep: validator and coverage report. |
| `pipeline/dossier/web_sweep.py` | Scheduled | dossier | The 40-source web sweep as a batch job: whole catalogue, one API key. |
| `pipeline/enrich_images_commons.py` | Scheduled | poi_images | Fill missing POI images from Wikimedia Commons geotagged photos. |
| `pipeline/enrich_images_web.py` | Scheduled | poi_images | Second-pass POI image fill for items the Commons geosearch could not match. |
| `pipeline/enrich_must_descs.py` | Scheduled | must_descs | Upgrade description and images for every POI the app shows as a top pick. |
| `pipeline/export_destinfo.py` | Scheduled | events | Ship the per-destination info layer: cache -> public/destinfo/{CC}.json. |
| `pipeline/harvest_accommodation.py` | Scheduled | lodging | Real Inside Airbnb anchors for accommodation - maximal specificity (schema v16). |
| `pipeline/harvest_activities.py` | Scheduled | activities | harvest_activities.py - the "things to do" layer (schema v10). |
| `pipeline/harvest_all_origins.py` | Scheduled | fares | Harvest REAL Ryanair per-day fares from every European origin airport. |
| `pipeline/harvest_bathing_water.py` | Scheduled | bathing_water | Real bathing-water quality per destination. |
| `pipeline/harvest_climate_power.py` | Scheduled | climate | Climate normals from NASA POWER climatology - replaces WorldClim 2.1. |
| `pipeline/harvest_events.py` | Scheduled | events | Recurring events, festivals and concert series per destination, from Wikidata. |
| `pipeline/harvest_flight_times.py` | Scheduled | flight_times | Add departure/arrival TIMES to the fares table. |
| `pipeline/harvest_geonames.py` | Scheduled | geonames | Real settlement size per destination (GeoNames). Backfill cadence. |
| `pipeline/harvest_hostelworld.py` | Scheduled | staytiers | Hostelworld hostel-price anchors, the dorm + private-room stay tiers. |
| `pipeline/harvest_hotels_liteapi.py` | Scheduled | staytiers | LiteAPI (Nuitee) hotel-price anchors, the 3-star and 4/5-star stay tiers. |
| `pipeline/harvest_images.py` | Scheduled | images | The destination image layer (schema v10). Backfill cadence. |
| `pipeline/harvest_pageviews.py` | Scheduled | poi_significance | Harvest Wikipedia pageviews as a fame signal - network only, no data writes. |
| `pipeline/harvest_parking.py` | Scheduled | parking | The best place to leave a car, per destination, from OpenStreetMap. |
| `pipeline/harvest_place_signals.py` | Scheduled | coverage | Resolve the place registers, and measure fame. |
| `pipeline/harvest_poi_wikidata.py` | Scheduled | poi_significance | Wikidata significance signals for POIs. |
| `pipeline/harvest_pois_overture.py` | Scheduled | overture | Maximal sightseeing POIs from Overture Maps. Backfill cadence. |
| `pipeline/harvest_pois_wikidata_images.py` | Scheduled | poi_images_wikidata | Bulk POI images from Wikidata (P18). Backfill cadence. |
| `pipeline/harvest_protected_areas_osm.py` | Scheduled | nature | A nearby-nature layer from OpenStreetMap. Backfill cadence. |
| `pipeline/harvest_tourism_density.py` | Scheduled | crowding | A crowding / tourism-density layer. |
| `pipeline/harvest_unesco_whc.py` | Scheduled | unesco | Harvest cache/unesco_whc.json from the UNESCO World Heritage Centre list. |
| `pipeline/harvest_volotea.py` | Scheduled | volotea_fares | Harvest REAL Volotea cheapest fares from every Volotea origin. |
| `pipeline/harvest_vueling.py` | Scheduled | vueling_fares | Harvest REAL Vueling per-day fares from every Vueling origin. |
| `pipeline/harvest_wikivoyage.py` | Scheduled | guide | Narrative travel-guide blurbs from Wikivoyage. Backfill cadence. |
| `pipeline/harvest_wikivoyage_listings.py` | Scheduled | poi_significance | See/Do listings as a POI significance signal. |
| `pipeline/harvest_wizzair.py` | Scheduled | wizz_fares | Harvest REAL Wizz Air per-day fares from every Wizz origin. |
| `pipeline/images/audit_all.py` | Scheduled | image_audit | Audit every image the app ships, across every layer at once. |
| `pipeline/images/fix_special_filepath.py` | Scheduled | image_audit | Rewrite Special:FilePath image URLs into real upload.wikimedia thumbs. |
| `pipeline/images/fix_url_queries.py` | Scheduled | image_audit | Strip tracking query strings off every stored Commons image URL. |
| `pipeline/intake/register_intake.py` | Scheduled | register_intake | Register-driven intake (B3, 2026-09): which members do we NOT have? |
| `pipeline/joins/neighbours.py` | Scheduled | joins | Cross-layer neighbours: one spatial pass that lets six wires speak. |
| `pipeline/lakes/build_lakes.py` | Scheduled | lakes | Build the whole lake layer, from nothing to shipped wire, in one command. |
| `pipeline/lakes/seed_lakes.py` | Scheduled | lakes | The curated seed: the water bodies a European traveller has actually heard of. |
| `pipeline/mountains/build_peaks.py` | Scheduled | mountains | Build the whole mountain layer, from nothing to shipped wire, in one command. |
| `pipeline/mountains/export_peaks.py` | Scheduled | mountains | Stage 3: score the enriched summits and publish the ones worth showing. |
| `pipeline/mountains/osm_spine.py` | Scheduled | mountains | The second spine: every NAMED landform OpenStreetMap knows about. |
| `pipeline/mountains/season.py` | Scheduled | mountains | When to go: a monthly climatology per summit, and the months it points at. |
| `pipeline/mountains/seed_peaks.py` | Scheduled | mountains | The curated seed: the mountains a European traveller has actually heard of. |
| `pipeline/mountains/terrain.py` | Scheduled | mountains | What the ground itself says: prominence, isolation, the elevation check. |
| `pipeline/normalize_poi_kinds.py` | Scheduled | poi_significance | Normalize POI kinds and demote commercial noise, in place. |
| `pipeline/regions/build_regions.py` | Scheduled | regions | Build the region spine: fetch, normalise, index -> cache/regions/regions.gpkg. |
| `pipeline/regions/coverage.py` | Scheduled | regions | The coverage audit: status per region per layer, and the backlog. |
| `pipeline/regions/export_regions.py` | Scheduled | regions | Write the region wire: continent-app/public/region/{ID}.json + index. |
| `pipeline/resolve_dest_articles.py` | Scheduled | fame | Find the Wikipedia article for a destination that fame cannot yet see. |
| `pipeline/score_place_candidates.py` | Scheduled | coverage | Rank what the catalogue is missing, and why. |
| `pipeline/score_significance.py` | Scheduled | poi_significance | Composite POI significance -> recalibrated rate. |
| `pipeline/trails/attach.py` | Scheduled | routes_attach | Which routes are near a destination, measured to the line, named as paths. |
| `pipeline/trails/attributes.py` | Scheduled | trails_attributes | The published filters: how hard, what shape, what it passes, who it suits. |
| `pipeline/trails/coverage_report.py` | Scheduled | trails_registry | Registry versus published: which famous walks are missing, and why. |
| `pipeline/trails/curate.py` | Scheduled | trails_curate | Curation: choose which staged routes deserve to be published, per region. |
| `pipeline/trails/db.py` | Scheduled | trails_validate | Connection helper for the trails content-lab PostGIS DB (tools/trailslab). |
| `pipeline/trails/dedup.py` | Scheduled | trails_hierarchy | Co-located routes: the same path carried by several relations. |
| `pipeline/trails/derive_routes.py` | Scheduled | trails_derive_routes | Routes built from way-level paths, for countries with no relation culture. |
| `pipeline/trails/derived_activities.py` | Scheduled | routes_attach | Trail running and gravel: two activities OSM does not tag, derived here. |
| `pipeline/trails/elevation.py` | Scheduled | trails_elevation | Elevation layer: Copernicus GLO-30 sampling for staged trailslab trips. |
| `pipeline/trails/export_wire.py` | Scheduled | trails_rate | Export approved trailslab content into the app as produced works. |
| `pipeline/trails/famous_registry.py` | Scheduled | trails_registry | The famous-trail registry: what a region is embarrassed to be missing. |
| `pipeline/trails/forests.py` | Scheduled | trails_forests | Named forests as AREAS, from the extracts, because Overpass is the wrong door. |
| `pipeline/trails/hierarchy.py` | Scheduled | trails_hierarchy | The relation graph: every route relation, every tag, every member, kept. |
| `pipeline/trails/ingest_osm_routes.py` | Scheduled | trails_ingest | Hiking route ingestion: Geofabrik extracts -> trailslab trips staging table. |
| `pipeline/trails/node_networks.py` | Scheduled | routes_attach | Node-network cycling: a mesh is not a route, so it is not published as one. |
| `pipeline/trails/popularity.py` | Scheduled | trails_popularity | Popularity signals + curation ranking for staged trails. |
| `pipeline/trails/rate.py` | Scheduled | trails_rate | The published trail rating, 0 to 10, and the reasons behind it. |
| `pipeline/trails/regionize.py` | Scheduled | trails_regionize | Stamp region ids onto every staged route, so the quota can be spatial. |
| `pipeline/trails/regression.py` | Scheduled | trails_validate | Regression gate for published trailslab content. |
| `pipeline/trails/scenic.py` | Scheduled | trails_scenic | Scenic features along the curated routes: the evidence behind a rating. |
| `pipeline/trails/splice.py` | Scheduled | trails_elevation | Bridge the short breaks that OSM route relations leave in otherwise whole trails. |
| `pipeline/trails/trail_images.py` | Scheduled | trails_images | Photographs of the walk itself, from Wikimedia Commons. |
| `pipeline/trails/transit_stops.py` | Scheduled | routes_attach | Railway stations, from the extracts, so "car-free start" is a fact. |
| `pipeline/trails/validate.py` | Scheduled | trails_validate | Validation engine: score staged trailslab trips and route them by status. |
| `pipeline/trails/way_tags.py` | Scheduled | trails_way_tags | What the ground under a route is actually tagged as, way by way. |
| `pipeline/trips/build_trips.py` | Scheduled | trips | Build the whole trip layer, from nothing to shipped wire, in one command. |
| `pipeline/apply_airport_anchors.py` | Manual | n/a | Make near-but-unserved destinations reachable by anchoring them to the nearest served airport. |
| `pipeline/apply_airport_categories.py` | Manual | n/a | Give airport-tier destinations trip-type categories, in place. |
| `pipeline/apply_car_layer.py` | Manual | n/a | Add the schema-v8 car layer to an existing app_data.json in place. |
| `pipeline/apply_gem_categories.py` | Manual | n/a | Patch fact-checked GEM trip-type categories into app_data.json, in place. |
| `pipeline/apply_image_dims.py` | Manual | n/a | The shape of every hero photograph, into the master. |
| `pipeline/apply_new_gems.py` | Manual | n/a | Insert promoted gem specs into the master, at scale. Deliberately hand-run. |
| `pipeline/apply_toll_layer.py` | Manual | n/a | Add per-country toll & vignette estimates to app_data.json in place. |
| `pipeline/audit_gaps.py` | Manual | n/a | Audit app_data.json for missing pieces across all destinations. |
| `pipeline/backfill_landmarks.py` | Manual | n/a | Add MISSING famous sights from Wikidata sitelinks. |
| `pipeline/cycling/_truncate_lc.py` | Manual | n/a | No docstring; truncates the trailslab cycle_landcover Postgres table. |
| `pipeline/cycling/build_cycling.py` | Manual | n/a | Build the whole cycling layer, from nothing to shipped wire, in one command. |
| `pipeline/diagnostics/appeal_queue.py` | Manual | n/a | Prioritised curation queue (A7) - where a hand-scored appeal pays most. |
| `pipeline/diagnostics/coverage_report.py` | Manual | n/a | Coverage report - where the catalogue is thin, stated before a user finds it. |
| `pipeline/diagnostics/rating_audit.py` | Manual | n/a | Rating model audit - measure the model before (and after) changing it. |
| `pipeline/dossier/parking_check.py` | Manual | n/a | Fact-check "where to park" against the web, one destination at a time. |
| `pipeline/dossier/rewrite_intros.py` | Manual | n/a | Short custom intros for every destination, written by a model as a REWRITER. |
| `pipeline/enrich_activities.py` | Manual | n/a | Fill img/desc/wiki gaps in destinations[*].activities.items_full. |
| `pipeline/gen_mock_data.py` | Manual | n/a | Generate a flights-only mock app_data.json for testing without the pipeline. |
| `pipeline/harvest_image_licenses.py` | Manual | n/a | Per-file TASL metadata for POI thumbnails. |
| `pipeline/harvest_ryanair_schedules.py` | Manual | n/a | Attach Ryanair's published TIMETABLE to the fares table. |
| `pipeline/harvest_urban_fabric.py` | Manual | n/a | Measure the built beauty of a town from OSM. |
| `pipeline/images/drop_dead_files.py` | Manual | n/a | Remove references to Commons files that no longer exist. |
| `pipeline/intake/gap_scan.py` | Manual | n/a | Geographic gap scan (B4, 2026-09): the misses no register can name. |
| `pipeline/intake/ingest_candidates.py` | Manual | n/a | Turn reviewed intake candidates into new-gem specs (2026-09). |
| `pipeline/intake/osm_settlement_scan.py` | Manual | n/a | OSM settlement scan (B4's grid variant, 2026-09): misses beyond the boxes. |
| `pipeline/journeys/build_wire.py` | Manual | n/a | The curated trip library ("journeys") as a browsable wire. |
| `pipeline/lakes/rebuild_v2.py` | Manual | n/a | Drive the v2 rebuild: wait for each country's OSM sweep, fold it, enrich it. |
| `pipeline/member_layer.py` | Manual | n/a | Cluster members (B1, 2026-09): the villages inside the area entries. |
| `pipeline/merge_curation.py` | Manual | n/a | Fill the last POI-sparse destinations from hand-curated JSON. |
| `pipeline/photos/contact_sheet.py` | Manual | n/a | Contact sheets, so a reviewer judges sixteen photographs in one look. |
| `pipeline/photos/evalset.py` | Manual | n/a | The labelled set every threshold in the photo engine answers to. |
| `pipeline/photos/export_poi_credits.py` | Manual | n/a | Ship the credit for every POI thumbnail the app shows. |
| `pipeline/photos/fill_authors.py` | Manual | n/a | Fill missing author credit for licensed photographs. |
| `pipeline/photos/geograph_fill.py` | Manual | n/a | Fill the listed-tier photo gap in GB and IE from Geograph. |
| `pipeline/photos/label_sheet.py` | Manual | n/a | Write a contact sheet's verdicts into the evaluation set. |
| `pipeline/photos/rescore.py` | Manual | n/a | Re-rank every cached gallery by beauty, without re-harvesting anything. |
| `pipeline/photos/review.py` | Manual | n/a | The hero review queue: a person, a contact sheet, one click. |
| `pipeline/photos/verify_credit.py` | Manual | n/a | The credit rule, pinned, because another layer's gate depends on it. |
| `pipeline/photos/verify_takedown.py` | Manual | n/a | The takedown path, exercised end to end, against a copy of the wire. |
| `pipeline/practical_layer.py` | Manual | n/a | Practical layer (D4, 2026-09): the fields travellers ask for. No confirmed wired consumer. |
| `pipeline/promote_place_candidates.py` | Manual | n/a | Turn ranked coverage gaps into gem specs. Deliberately hand-run. |
| `pipeline/rating_shadow_report.py` | Manual | n/a | Shadow-score consistency check for the curated appeal file. |
| `pipeline/search_index_layer.py` | Manual | n/a | Fold-and-alias search index (B2, 2026-09): typed names must find places. |
| `pipeline/trails/compose_citytrips.py` | Manual | n/a | City trip composer: curated one-day sightseeing days for in-demand cities. |
| `pipeline/trails/crosscheck_portals.py` | Manual | n/a | National portal cross-check: official trail geometries vs staged OSM trips. |
| `pipeline/trails/elevation_validate.py` | Manual | n/a | The validation table the elevation layer never had (ROUTES.md R4). |
| `pipeline/trails/market_demand.py` | Manual | n/a | Market demand harvester: official visitor-night statistics per city. |
| `pipeline/trails/quality_report.py` | Manual | n/a | What the two trail scores are made of, and what was published. |
| `pipeline/trails/repair.py` | Manual | n/a | Gap repair: bridge breaks in staged hike geometries via local Valhalla. |
| `pipeline/trails/smoke_test.py` | Manual | n/a | Smoke test for the trailslab PostGIS staging DB. |
| `pipeline/verify_skip_flags.py` | Manual | n/a | A skip flag controls the network, never the data. |
| `pipeline/airport_categories.py` | Library | n/a | Trip-type categories for airport-tier destinations. |
| `pipeline/appeal_scale.py` | Library | n/a | Let the best of any kind of place reach the same height. |
| `pipeline/beaches/beauty_index.py` | Library | n/a | The beach beauty index. |
| `pipeline/beaches/coastline.py` | Library | n/a | Which way a beach faces, and whether the sun sets over its water. |
| `pipeline/beaches/eea_spine.py` | Library | n/a | The EEA WISE bathing water register, read as a spine. |
| `pipeline/beaches/enrich_beaches.py` | Library | n/a | Stage 2 of the beach layer: enrichment. |
| `pipeline/beaches/export_beaches.py` | Library | n/a | Stage 3: score the enriched beaches and publish the ones worth showing. |
| `pipeline/beaches/harvest_beaches.py` | Library | n/a | Stage 1 of the beach layer: find every named beach in Europe. |
| `pipeline/beaches/osm_extract.py` | Library | n/a | The bulk OpenStreetMap pass, off Overpass and onto Geofabrik extracts. |
| `pipeline/beaches/protection.py` | Library | n/a | Protected status, with polygons rather than centroids. |
| `pipeline/beaches/sources.py` | Library | n/a | Shared, polite clients for the beach layer's four open sources. |
| `pipeline/beaches/uk_bathing.py` | Library | n/a | Bathing water quality for Great Britain. |
| `pipeline/beauty_layer.py` | Library | n/a | The "Beauty Index" data layer (schema v9). |
| `pipeline/car_layer.py` | Library | n/a | Car layer (schema v8), shared by gen_mock_data.py and apply_car_layer.py. |
| `pipeline/cycling/landcover.py` | Library | n/a | The scenic score's missing input: what kind of country a route rides through. |
| `pipeline/dossier/common.py` | Library | n/a | Shared plumbing for the destination dossier pipeline. |
| `pipeline/dossier/derive_do.py` | Library | n/a | Derive "best things to do" for every destination from open data alone. |
| `pipeline/env_local.py` | Library | n/a | Load the repo-root .env into os.environ for pipeline scripts. |
| `pipeline/gem_category_overrides.py` | Library | n/a | Fact-checked trip-type corrections for GEM-tier destinations. |
| `pipeline/images/checks.py` | Library | n/a | Shared per-image checks for the cross-layer image audit. |
| `pipeline/lakes/check_doc.py` | Library | n/a | Check that every pointer LAKES.md gives a reader actually resolves. |
| `pipeline/lakes/enrich_lakes.py` | Library | n/a | Stage 2 of the lake layer: enrichment. |
| `pipeline/lakes/export_lakes.py` | Library | n/a | Stage 3: score the enriched water bodies and publish the ones worth showing. |
| `pipeline/lakes/harvest_lakes.py` | Library | n/a | Stage 1 of the lake layer: find the water bodies worth ranking. |
| `pipeline/lakes/lake_climate.py` | Library | n/a | Monthly air temperature normals for the lake season model, from CHELSA. |
| `pipeline/lakes/lake_images.py` | Library | n/a | Is this photograph OF this lake, and is it the one to lead with? |
| `pipeline/lakes/lake_index.py` | Library | n/a | The lake index: what "one of the best lakes in Europe" means here. |
| `pipeline/lakes/osm_water.py` | Library | n/a | Every named water body in OpenStreetMap, from the extracts. |
| `pipeline/lakes/water_sources.py` | Library | n/a | The lake layer's polite clients. |
| `pipeline/mountains/enrich_peaks.py` | Library | n/a | Stage 2 of the mountain layer: enrichment. |
| `pipeline/mountains/harvest_peaks.py` | Library | n/a | Stage 1 of the mountain layer: find the summits worth ranking. |
| `pipeline/mountains/peak_index.py` | Library | n/a | The mountain index: what "one of the best mountains in Europe" means. |
| `pipeline/mountains/peak_sources.py` | Library | n/a | The mountain layer's polite clients. |
| `pipeline/photos/__init__.py` | Library | n/a | The photo engine: relevance gates what enters, beauty ranks what stays. |
| `pipeline/photos/aesthetics.py` | Library | n/a | One CLIP embedding per image, cached forever, and the heads that read it. |
| `pipeline/photos/commons.py` | Library | n/a | Pull MORE from Commons, not the same amount: the funnel, widened. |
| `pipeline/photos/credit.py` | Library | n/a | Who to name under a photograph, decided in one place. |
| `pipeline/photos/dedupe.py` | Library | n/a | Four photographs should be four views, not four crops of one file. |
| `pipeline/photos/geograph.py` | Library | n/a | Geograph Britain and Ireland: the single biggest win available. |
| `pipeline/photos/mapillary.py` | Library | n/a | Mapillary: existence proof only, and marked so it can never lead. |
| `pipeline/photos/relevance.py` | Library | n/a | The classifier for the miss the heuristics documented and could not fix. |
| `pipeline/photos/season.py` | Library | n/a | The fix for fog and bare trees: prefer the season the category sells. |
| `pipeline/photos/selection.py` | Library | n/a | After relevance: rank for beauty, then compose the hero and the gallery. |
| `pipeline/photos/takedown.py` | Library | n/a | Pull one photograph out of everything we publish, in minutes, forever. |
| `pipeline/photos/technical.py` | Library | n/a | Cheap hard rejects, run first, so nothing expensive looks at junk. |
| `pipeline/photos/wikidata_views.py` | Library | n/a | More community-picked bests than P18 alone, for the same cost. |
| `pipeline/pipeline_io.py` | Library | n/a | Shared, crash-safe IO for the offline data pipeline. |
| `pipeline/place_layer.py` | Library | n/a | What KIND of place this is, and what you do with it. |
| `pipeline/place_registries.py` | Library | n/a | The authoritative registers that say "this place". |
| `pipeline/rating_layer.py` | Library | n/a | Traveller rating engine - schema v17 dest.rating (rating_v4). |
| `pipeline/regions/assign.py` | Library | n/a | Point and line to region ids. The one lookup every layer's enrich calls. |
| `pipeline/regions/coasts.py` | Library | n/a | Cut the EEA coastline into named coastal stretches. |
| `pipeline/regions/opportunity.py` | Library | n/a | Per region opportunity measures: how much of each thing is actually there. |
| `pipeline/regions/quotas.py` | Library | n/a | Region publication quotas and floors. |
| `pipeline/regions/region_sources.py` | Library | n/a | The region layer's polite clients. |
| `pipeline/regions/seed_coasts.py` | Library | n/a | The hand-named coastal stretches, and how a name lands on a cut. |
| `pipeline/resume_cache.py` | Library | n/a | Resumable anchor cache for the long stay-tier harvests. |
| `pipeline/toll_layer.py` | Library | n/a | Per-country toll & vignette engine. |
| `pipeline/trails/compose_daytrips.py` | Library | n/a | Daytrip composer: turn catalogue POIs plus a staged hike into a timed day. |
| `pipeline/trails/names.py` | Library | n/a | One definition of what two trail names being "the same name" means. |
| `pipeline/trails/route_schema.py` | Library | n/a | The two route record shapes, as a mapping onto fields the lab already has. |
| `pipeline/trails/schema.py` | Library | n/a | Apply a lab migration only when it would actually change something. |
| `pipeline/trips/compose_trips.py` | Library | n/a | Compose the trips: one base, a chain of bases, or a loop by car. |
| `pipeline/trips/export_trips.py` | Library | n/a | Publish the validated trips to continent-app/public/trips/. |
| `pipeline/trips/harvest_routes.py` | Library | n/a | Harvest the free routing evidence a multi-city trip needs: Wikivoyage. |
| `pipeline/trips/trip_model.py` | Library | n/a | The trip model: what makes a good base, a reachable day out, a sane hop. |
| `pipeline/trips/trip_sources.py` | Library | n/a | Shared ground for the trip layer: paths, the catalogue view, attribution. |
| `pipeline/trips/validate_trips.py` | Library | n/a | Check every composed trip before it is allowed anywhere near the app. |
| `pipeline/oneoff/add_appeal_2026_07c.py` | One-shot | n/a | Merge curated_appeal entries for the 2026-07c gem batch (43 new dests). |
| `pipeline/oneoff/add_appeal_2026_07d.py` | One-shot | n/a | Merge curated_appeal entries for the 2026-07d Europe-wide research batch. |
| `pipeline/oneoff/add_beach_i18n.py` | One-shot | n/a | Add the beach layer's copy to the six i18n catalogs. |
| `pipeline/oneoff/add_famous_small_gems.py` | One-shot | n/a | Add 12 famous small destinations missing from the catalogue. |
| `pipeline/oneoff/add_gems_from_json.py` | One-shot | n/a | Add new gem destinations from a researched JSON list. |
| `pipeline/oneoff/add_istria_gems.py` | One-shot | n/a | Add Motovun and Groznjan (Istria hill towns) as new gem destinations. |
| `pipeline/oneoff/add_regional_icons.py` | One-shot | n/a | Seed world-class excursion sights into items_full. |
| `pipeline/oneoff/add_thin_country_gems.py` | One-shot | n/a | Add 65 new gem destinations to complete the thin countries. |
| `pipeline/oneoff/apply_appeal_recal_2026_07.py` | One-shot | n/a | Merge the 2026-07 appeal recalibration overlay into curated_appeal.json. |
| `pipeline/oneoff/apply_city_center.py` | One-shot | n/a | Add schema-v13 city-centre coordinates to app_data.json in place. |
| `pipeline/oneoff/backfill_regions.py` | One-shot | n/a | Stamp region ids onto every existing cached layer row. |
| `pipeline/oneoff/batch_approve_shortlists.py` | One-shot | n/a | Batch-approve the staged shortlist content through the review API. |
| `pipeline/oneoff/build_country_shapes.py` | One-shot | n/a | Country outlines for the Visited map, one small file the browser can hold. |
| `pipeline/oneoff/destinations_master.py` | One-shot | n/a | European destinations master list. |
| `pipeline/oneoff/enrich_reharvested_20260722.py` | One-shot | n/a | Wikipedia-enrich only the dests re-harvested on 2026-07-22. |
| `pipeline/oneoff/expand_towns_geonames.py` | One-shot | n/a | Mass-generate destination records from GeoNames. |
| `pipeline/oneoff/fix_city_centers_20260723.py` | One-shot | n/a | Repair runway-anchored city centres from GeoNames (2026-07-23). |
| `pipeline/oneoff/fix_data.py` | One-shot | n/a | Data repair pass for app_data.json - addresses fact-check findings. |
| `pipeline/oneoff/fix_flag_hero_images.py` | One-shot | n/a | Repair destination hero images that are flags. |
| `pipeline/oneoff/followup_20260722_landmarks_descs_images.py` | One-shot | n/a | Driver script, 2026-07-22 evening, finishing the landmark/description/image campaign. |
| `pipeline/oneoff/make_stay_fixtures.py` | One-shot | n/a | Generate recorded-shape stay-tier fixtures for dev without API credentials. |
| `pipeline/harvest_climate_worldclim.py` (moved) | Superseded | `pipeline/harvest_climate_power.py` | Bulk climate normals from WorldClim 2.1 rasters. Retired 2026-08-30. |
| `pipeline/trails/describe.py` (moved) | Superseded | `lib/trailStory.js` + `pipeline/trails/attributes.py` | Grounded trip descriptions composed by a model as a rewriter. Retired, per run_pipeline.py's own comment. |

## Commands run

Investigation (read-only, no writes):

```bash
git status --short
powershell -NoProfile -Command "Get-Process python -ErrorAction SilentlyContinue"
cat logs/pipeline.lock          # empty
cat logs/pipeline_state.json    # no in-progress entries, all timestamps in the past
grep -noE "pipeline[/\\][A-Za-z0-9_./\\]+\.py" run_pipeline.py | sort -u
grep -n '"key":' run_pipeline.py | wc -l                 # 65 tasks
find pipeline -name "*.py" | grep -v __pycache__ | grep -v .pytest_cache | wc -l   # 255
find pipeline -maxdepth 1 -name "*.py" | wc -l            # 82
find archive -type f | grep -v __pycache__ | wc -l        # 26
```

No live pipeline process and an empty lockfile confirmed it was safe to move
files. `logs/pipeline_state.json` held only `last_success` timestamps, the
most recent from 2026-07-31, all in the past; nothing suggested an
in-progress run.

Archiving the two Superseded scripts, preserving depth:

```bash
mkdir -p archive/trails
git mv pipeline/harvest_climate_worldclim.py archive/harvest_climate_worldclim.py
git mv pipeline/trails/describe.py archive/trails/describe.py
```

Tagging every classified file (a small Python script read a hand-built
path -> tier mapping from a JSON file and inserted the `Tier:` line into
each docstring; kept in the session scratchpad, not committed, since the
edits themselves are what the report and the repo need to keep):

```bash
python apply_tags.py
# changed: 251   already tagged (skipped): 2   no-docstring files: 1   errors: 0
```

Verification:

```bash
find pipeline -name "*.py" | grep -v __pycache__ | grep -v .pytest_cache > compile_list.txt
echo archive/harvest_climate_worldclim.py >> compile_list.txt
echo archive/trails/describe.py >> compile_list.txt
# 255 files
while IFS= read -r f; do python -m py_compile "$f" || fail=$((fail+1)); done < compile_list.txt
# compile failures: 0

python -m py_compile run_pipeline.py                # OK, and git diff --stat run_pipeline.py is empty
python run_pipeline.py --help                        # prints usage, exit 0
python run_pipeline.py --list                         # prints all 65 tasks, exit 0
python run_pipeline.py --dry-run                      # prints the full plan, no writes, exit 0
python pipeline/verify_skip_flags.py --help            # loads and prints usage, exit 0
python -m pytest tests/ -q                             # 1 passed, 1 failed (pre-existing, see below)

grep -lE "Tier:" $(find pipeline -name "*.py" | grep -v __pycache__ | grep -v .pytest_cache) | wc -l
# 253 of 253
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Scripts with a declared tier | 0 | 253 (pipeline/) + 2 (archived) = 255 | +255 |
| Top-level `pipeline/*.py` files | 82 | 81 | -1 (harvest_climate_worldclim.py moved) |
| Total `pipeline/**/*.py` files (excl. cache) | 255 | 253 | -2 (both moved to archive/) |
| Files in `archive/` (excl. `__pycache__`) | 26 | 28 | +2 |
| Scheduled (in `run_pipeline.py`'s task table) | untracked | 113 | n/a |
| Manual | untracked | 50 | n/a |
| Library | untracked | 69 | n/a |
| One-shot (`pipeline/oneoff/`) | untracked | 21 | n/a |
| Superseded (`archive/`, this task's moves) | 0 | 2 | +2 |

113 + 50 + 69 + 21 + 2 = 255, matching the total. The task prompt's figure
of 47 does not match any grouping found in the repo; see "What changed" for
the closest approximation and why I did not force a match.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `pytest tests/test_rating_distribution.py` fails on `curated/fitted sd gap 0.280 >= 0.18` | Pre-existing: the test's own comment says "Phase A has not run; this suite is the contract it must meet" (rating_v4 Phase A, per CLAUDE.md's phase plan, is not finished). Confirmed unrelated to this task by inspection: nothing this task touched (docstrings, two file moves) affects `app_data.json`'s rating values. | Not fixed; out of scope for T028. Left as a known pre-existing failure for whichever Phase A task addresses it. |
| Two test-tagged files (`audit_gaps.py`, `audit_quality.py`) briefly got a malformed tier line during script development (the line landed after the closing `"""` instead of inside the docstring) | An early version of the tagging script mishandled single-line docstrings | Fixed the script before running it against the other 251 files; the two test files were restored from a backup and re-tagged correctly with the fixed script. Confirmed by reading the final file contents and running py_compile. |

No other issues. `run_pipeline.py --help`, `--list` and `--dry-run` all
exercise the whole task table, including every `guard=` and `run=` function
that imports pipeline modules, and all three completed with exit code 0.

## What is still open

**The `backfill` cadence is a hybrid this report classifies as Scheduled
but which behaves like Manual.** Ten tasks (`geonames`, `nature`, `climate`
partially, `guide`, `images`, `activities`, `overture`, `must_descs`,
`poi_images_wikidata`, `poi_images`) sit in `run_pipeline.py`'s TASKS list
with `cadence: "backfill"`, which means `run_pipeline.py --list` will
always show them as not due; they only run when a human types
`--only <key>`. I classified their scripts as Scheduled because the task's
own rule says "the path appears in the task table", but for the cron port
this distinction matters more than the label suggests: putting these on a
timer would silently re-run coverage-guarded, potentially null-risk writers
(`images` and `activities` are both marked NULL-RISK in their own task
notes) without the human judgment the backfill cadence exists to require.
`pipeline/README.md`'s "For the cron port" section says this explicitly,
but T048 should treat it as the single most important thing in this report.

**`pipeline/practical_layer.py` has no confirmed consumer.** It writes
`cache/practical.json` and there is no `apply_practical_layer.py`, no
import of it from any wired script, and no mention in `docs/`. It might be
finished-but-unwired work, or it might be dead. I classified it Manual
rather than Superseded because I found no evidence of a replacement, and
"prefer Manual when unsure" is the task's own rule. Whoever next touches
the practical/D4 feature area should resolve this one way or the other:
wire it in, document why it stays manual, or archive it with a named
replacement.

**`pipeline/harvest_ryanair_schedules.py` has no confirmed consumer either.**
Its docstring explains what it does and why, but no Scheduled script reads
its output cache. Classified Manual for the same reason as practical_layer.py.

**Two Manual scripts call the Anthropic API directly, which conflicts with
CLAUDE.md's "Never use the Claude API" rule.** `pipeline/dossier/parking_check.py`
and `pipeline/dossier/rewrite_intros.py` both contain `import anthropic` and
`anthropic.Anthropic()`, gated behind `ANTHROPIC_API_KEY` with a Gemini
fallback when that key is absent. This task's scope is classification only;
I did not edit either file beyond the required Tier line, and I did not run
either script or call the API myself. This is a pre-existing condition in
the repository, not something this task introduced, but it should be
flagged for whoever owns the "Never use the Claude API" rule: either these
two tools need a non-Anthropic path, or the rule needs a stated exception
for pipeline research tools. `pipeline/trails/describe.py`, which had the
same pattern, is now archived as Superseded, which removes it from any
live path, but the other two remain live Manual tools.

**The 47-script figure could not be reconciled exactly.** See "What
changed" above. I recommend the next planning pass drop the specific number
from future task prompts and instead point at this report's inventory,
since the true count (255, now fully tiered) is what matters operationally
and the mind map's older estimate no longer describes the repository.

**Judgment calls I was least sure about**, in descending order of
uncertainty:

1. `pipeline/apply_car_layer.py`, `apply_toll_layer.py`, `apply_airport_anchors.py`,
   `apply_airport_categories.py`, `apply_gem_categories.py`, `apply_image_dims.py`,
   and `pipeline/member_layer.py` are idempotent appliers with no scheduled
   home. I called all seven Manual (a human re-runs them after a relevant
   change: a rate table update, a new area destination, a new image batch).
   An alternative reading is that some of these should actually be folded
   into the `fame` or `coverage` Scheduled tasks; I did not make that call
   because it would mean editing `run_pipeline.py`, which this task must
   leave untouched.
2. `pipeline/cycling/_truncate_lc.py` has no docstring and no `__main__`
   guard; it runs a destructive `TRUNCATE TABLE` on import. I tagged it
   Manual with a comment rather than Library, since it does nothing safe to
   import. Worth a second look because it is the one script in the whole
   tree that can lose data just by being imported.
3. `pipeline/cycling/build_cycling.py`, `pipeline/lakes/rebuild_v2.py`, and
   the trip-layer chain are "run the whole layer locally in one command"
   convenience wrappers around scripts that are individually Scheduled. I
   called the wrappers Manual and their called stages Library/Scheduled,
   but a reasonable alternative is to call the wrappers Scheduled too,
   since they do nothing the Scheduled stages don't already do. I kept them
   Manual because nothing in `run_pipeline.py` calls the wrapper itself.
4. Six backfill-cadence scripts are Scheduled by the letter of the rule but
   Manual in practice; see the first item above.

## Rollback procedure

To undo the tier tagging only (keep the archive moves):

```bash
git checkout p1-orphaned-components -- pipeline
```

This restores every `pipeline/*.py` file's docstrings to their pre-tagging
state in one step, since the tagging commit touches no other content.

To undo the archive moves only (keep the tier tags):

```bash
git mv archive/harvest_climate_worldclim.py pipeline/harvest_climate_worldclim.py
git mv archive/trails/describe.py pipeline/trails/describe.py
git checkout HEAD~1 -- archive/README.md    # or hand-edit out the two new rows
```

Note both moved files still carry their `Tier: Superseded` line after a
manual move-back; re-tag them by hand (or re-run the tagging script against
a one-line classification file) if they are un-archived.

To undo everything this task did in one step, reset the branch to the
commit before this task's work:

```bash
git log --oneline -5              # find the commit before "T028: ..."
git reset --hard <that commit>
```

Since this task never touched `run_pipeline.py`, `docs/`, or any file
outside `pipeline/`, `archive/`, and this report, a rollback cannot affect
anything the pipeline actually runs. The worst case of reverting this task
is that every script's tier goes back to undeclared, which is the state
T028 started from.
