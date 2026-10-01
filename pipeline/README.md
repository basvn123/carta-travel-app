# pipeline/ - script tiers

Every script under `pipeline/` carries a `Tier:` line as the first line of
its module docstring (or a `#` comment when it has no docstring). The tier
says who runs the script and when. There are four tiers plus one holding pen:

Scheduled
: wired into `run_pipeline.py`, either directly in a task's `cmds` list or
  through a `run:` function the task table points at. A cron job can call it
  with no human present. Some Scheduled tasks carry `cadence: backfill`,
  which means they sit in the task table but never come due on their own;
  a human still has to type `--only <key>`. They are Scheduled because the
  task said so ("the path appears in run_pipeline.py's task table"), but
  they behave like Manual tools in practice. The inventory below marks them.

Manual
: not wired into `run_pipeline.py`, and not meant to be. A human runs it,
  reads the output, and decides what happens next: a review queue, an
  audit report, a one-time backfill, a labelling pass, a local full-layer
  rebuild. Every Manual tool in this index has the command that runs it.

Library
: has no entry point of its own, or has one only for local debugging, and
  is otherwise imported by a Scheduled or Manual script. It never appears
  in a cron log because nothing calls it directly.

One-shot, done, kept for provenance
: lives in `pipeline/oneoff/`, which is already the project's holding pen
  for scripts that did one job once (a specific catalogue expansion, a
  specific data repair) and are not expected to run again. Keeping them is
  provenance, not maintenance: if a future audit asks "how did these 65
  gems get added", the script that added them is still there to read.
  `pipeline/oneoff/` is a fourth label, not a fifth tier: it does not mean
  Superseded (nothing replaced it) and it does not mean Manual (nobody is
  expected to run it again as a routine task).

Superseded
: replaced by something else, and moved to `archive/` with a row in
  `archive/README.md` naming the replacement and the reason. A Superseded
  script's own path resolution (`Path(__file__).resolve().parents[N]`) is
  preserved across the move, so if it is ever run again by hand from a
  clone of that old commit, it still finds the repo root correctly. It will
  not run correctly from inside `archive/` in the CURRENT tree, because the
  files it reads have moved on; that is intentional, it is retired.

## How a new script gets its tier

Ask two questions in order.

1. Does `run_pipeline.py` call it, directly in a `cmds` list or through a
   `run:` function? If yes: Scheduled. Name the task key in the tier line,
   `Tier: Scheduled (run_pipeline task <key>)`.
2. Is it imported by another script that is already Scheduled or Manual,
   and does it have no independent reason to be run on its own? If yes:
   Library.

If neither, it needs a human, which makes it Manual, unless it did one
specific job that is now finished and will not be asked for again, which
makes it One-shot (put it in `pipeline/oneoff/`, not at the pipeline root).
When genuinely unsure between Manual and Superseded, choose Manual. Deleting
a tool someone still reaches for is the more expensive mistake; a script
sitting unused in a Manual list costs nothing but a line in a table.

Once the tier is decided, add the `Tier:` line to the script's docstring in
the same run that adds or changes the script, so the repo is never out of
date with this file. If the script is Manual, add a row to this file (or to
the layer's own README if it already has several Manual tools) with the
exact command, what it reads, what it writes, and what a human does with
the output.

## For the cron port (T048)

Only the Scheduled tier is a cron candidate, and even inside Scheduled, the
`backfill` cadence tasks should NOT be put on the cron schedule: they exist
specifically so a human can force them with `--only` when the catalogue
grows or a cache goes stale, and putting them on a timer defeats the coverage
guards `run_pipeline.py` wraps them in (see its own docstring, "NULL-RISK"
notes on `images` and `activities`). The safe starting point for T048 is:
port every `cadence` other than `backfill` to cron at the same interval
(weekly/monthly/quarterly/after), leave `backfill` tasks and everything in
this README's Manual and One-shot sections off the schedule, and confirm the
concurrency lockfile (`logs/pipeline.lock`) and state file
(`logs/pipeline_state.json`) live on a path the cron user can write to.

## Scheduled

Every Scheduled script, grouped by the run_pipeline.py task key that owns
it. See `run_pipeline.py`'s own docstring and task table for what each key
does and how often it runs; this list exists so a reader can find which
script belongs to which task without grepping the 2,672-line file.

| Task key | Scripts |
|---|---|
| lodging | `apply_accommodation_anchors.py`, `apply_longtail_granularity.py`, `apply_tourist_premium.py`, `harvest_accommodation.py` |
| climate | `apply_climate.py`, `harvest_climate_power.py` |
| poi_significance | `apply_rating_layer.py`, `dedupe_pois.py`, `harvest_pageviews.py`, `harvest_poi_wikidata.py`, `harvest_wikivoyage_listings.py`, `normalize_poi_kinds.py`, `score_significance.py` |
| staytiers | `apply_stay_tiers.py`, `harvest_hostelworld.py`, `harvest_hotels_liteapi.py` |
| guide | `apply_wikivoyage.py`, `harvest_wikivoyage.py` |
| hero_audit | `audit_hero_images.py` |
| audit | `audit_quality.py` |
| beaches | `beaches/build_beaches.py` |
| coverage | `build_place_candidates.py`, `harvest_place_signals.py`, `score_place_candidates.py` |
| country_context | `country_context_layer.py` |
| cycling_bridge | `cycling/bridge_gaps.py` |
| cycling_photos | `cycling/cycle_images.py` |
| cycling_publish | `cycling/cycle_index.py`, `cycling/export_cycling.py`, `cycling/seed_bike_rail.py`, `cycling/stage_planner.py`, `cycling/validate_cycling.py` |
| cycling_enrich | `cycling/cycle_sources.py`, `cycling/enrich_cycling.py` |
| cycling_harvest | `cycling/harvest_cycling.py`, `cycling/splice_cycling.py` |
| dossier | `dossier/audit.py`, `dossier/build_dossier.py`, `dossier/fill_licences.py`, `dossier/fix_airport_listings.py`, `dossier/harvest_city_intros.py`, `dossier/harvest_event_dates.py`, `dossier/harvest_landmarks.py`, `dossier/plan_research.py`, `dossier/reclassify_landmarks.py`, `dossier/research_do.py`, `dossier/web_sweep.py` |
| poi_images | `enrich_images_commons.py`, `enrich_images_web.py` |
| must_descs | `enrich_must_descs.py` |
| events | `export_destinfo.py`, `harvest_events.py` |
| activities | `harvest_activities.py` |
| fares | `harvest_all_origins.py` |
| bathing_water | `harvest_bathing_water.py` |
| flight_times | `harvest_flight_times.py` |
| geonames | `harvest_geonames.py` |
| images | `harvest_images.py` |
| parking | `harvest_parking.py` |
| overture | `harvest_pois_overture.py` |
| poi_images_wikidata | `harvest_pois_wikidata_images.py` |
| nature | `harvest_protected_areas_osm.py` |
| crowding | `harvest_tourism_density.py` |
| unesco | `harvest_unesco_whc.py` |
| volotea_fares | `harvest_volotea.py` |
| vueling_fares | `harvest_vueling.py` |
| wizz_fares | `harvest_wizzair.py` |
| image_audit | `images/audit_all.py`, `images/fix_special_filepath.py`, `images/fix_url_queries.py` |
| register_intake | `intake/register_intake.py` |
| joins | `joins/neighbours.py` |
| lakes | `lakes/build_lakes.py`, `lakes/seed_lakes.py` |
| mountains | `mountains/build_peaks.py`, `mountains/export_peaks.py`, `mountains/osm_spine.py`, `mountains/season.py`, `mountains/seed_peaks.py`, `mountains/terrain.py` |
| regions | `regions/build_regions.py`, `regions/coverage.py`, `regions/export_regions.py` |
| fame | `apply_beauty_layer.py`, `apply_designations.py`, `apply_place_layer.py`, `resolve_dest_articles.py` |
| routes_attach | `trails/attach.py`, `trails/derived_activities.py`, `trails/node_networks.py`, `trails/transit_stops.py` |
| trails_attributes | `trails/attributes.py` |
| trails_registry | `trails/coverage_report.py`, `trails/famous_registry.py` |
| trails_curate | `trails/curate.py` |
| trails_validate | `trails/db.py`, `trails/regression.py`, `trails/validate.py` |
| trails_hierarchy | `trails/dedup.py`, `trails/hierarchy.py` |
| trails_derive_routes | `trails/derive_routes.py` |
| trails_elevation | `trails/elevation.py`, `trails/splice.py` |
| trails_rate | `trails/export_wire.py`, `trails/rate.py` |
| trails_forests | `trails/forests.py` |
| trails_ingest | `trails/ingest_osm_routes.py` |
| trails_popularity | `trails/popularity.py` |
| trails_regionize | `trails/regionize.py` |
| trails_scenic | `trails/scenic.py` |
| trails_images | `trails/trail_images.py` |
| trails_way_tags | `trails/way_tags.py` |
| trips | `trips/build_trips.py` |

`geonames`, `nature`, `climate`, `guide`, `images`, `activities`, `overture`,
`must_descs`, `poi_images_wikidata` and `poi_images` also carry
`cadence: backfill` for some or all of their scripts: they are in this table
and in the task list, but `run_pipeline.py --list` will always print them as
not due, because backfill tasks only run via `--only`. Do not schedule these
on cron without a human decision gate; see "For the cron port" above.

## Manual

Command paths are relative to the repo root. Every one of these reads and
writes are described in the script's own docstring in more depth; this is
the index, not the whole story.

| Path | Command | Reads | Writes | What the human does with it |
|---|---|---|---|---|
| `apply_airport_anchors.py` | `python pipeline/apply_airport_anchors.py` | `app_data/app_data.json`, nearest-airport distances | `app_data/app_data.json` (anchors near-but-unserved dests to a served airport) | Re-run after adding destinations that need an airport anchor; reviews the printed summary before shipping. |
| `apply_airport_categories.py` | `python pipeline/apply_airport_categories.py` | `airport_categories.py` curated table | `app_data/app_data.json` categories | Re-run when the curated table changes or new airport-tier dests are added. |
| `apply_car_layer.py` | `python pipeline/apply_car_layer.py` | `car_layer.py` model | `app_data/app_data.json` car_model + local_transport | Re-run after a driving-model or rental-rate change. |
| `apply_gem_categories.py` | `python pipeline/apply_gem_categories.py` | `gem_category_overrides.py` curated table | `app_data/app_data.json` categories | Companion to apply_airport_categories.py; run after curating new gem tags. |
| `apply_image_dims.py` | `python pipeline/apply_image_dims.py` | hero image files | `app_data/app_data.json` image dimensions | Re-run after a hero image harvest or swap so crop math stays correct. |
| `apply_new_gems.py` | `python pipeline/apply_new_gems.py <spec.json>` | a spec file from `promote_place_candidates.py` | `app_data/app_data.json` (new destinations) | The last, deliberately manual step of the coverage loop; adding a destination is an editorial act, never scheduled. |
| `apply_toll_layer.py` | `python pipeline/apply_toll_layer.py` | `toll_layer.py` rate tables | `app_data/app_data.json` driving_toll | Re-run after a toll/vignette rate table update. |
| `audit_gaps.py` | `python pipeline/audit_gaps.py` | `app_data/app_data.json` | stdout report only | Read the printed counts to see where fields are missing across the catalogue. |
| `backfill_landmarks.py` | `python pipeline/backfill_landmarks.py apply` | Wikidata sitelink boxes | `app_data/app_data.json` items_full (adds missing famous sights) | Run after a catalogue expansion so world-famous but out-of-radius sights are not missing. |
| `cycling/_truncate_lc.py` | `python pipeline/cycling/_truncate_lc.py --yes` | trailslab Postgres `cycle_landcover` table | truncates that table | A destructive DB maintenance script; run only when the landcover cache needs a full rebuild. Does nothing on import, and without `--yes` only prints what it would do (T260). |
| `cycling/build_cycling.py` | `python pipeline/cycling/build_cycling.py` | everything the nine cycling stages read | `public/cycling/*` | Convenience wrapper for a full local rebuild; the same nine stages are individually Scheduled. Use for dev/test, not for the live schedule. |
| `diagnostics/appeal_queue.py` | `python pipeline/diagnostics/appeal_queue.py` | `app_data/app_data.json`, fame, coverage | a ranked curation queue | Read the queue to decide which uncurated destinations to hand-score next. |
| `diagnostics/coverage_report.py` | `python pipeline/diagnostics/coverage_report.py [--check]` | `app_data/app_data.json`, registers | `reports/coverage_report.json` | Read per-country density and register coverage; `--check` ratchets against the last committed report and exits 1 on regression, so it is also CI-suitable if T029/T048 wants that. |
| `diagnostics/rating_audit.py` | `python pipeline/diagnostics/rating_audit.py` | `app_data/app_data.json` rating | stdout distribution report | Run before and after a rating-model change to see the effect on the score distribution. |
| `dossier/parking_check.py` | `python pipeline/dossier/parking_check.py` | `cache/parking_osm.json`, live web search | `cache/parking_osm.json` corrections | Fact-checks OSM parking data against the web. Uses the Anthropic SDK directly (see "What is still open"); read before running. |
| `dossier/rewrite_intros.py` | `python pipeline/dossier/rewrite_intros.py` | Wikivoyage extracts | rewritten dest intros | Upgrades the dossier's fallback intro text. Uses the Anthropic SDK directly (see "What is still open"); read before running. |
| `enrich_activities.py` | `python pipeline/enrich_activities.py apply` | `app_data/enrich_cache.json` | `app_data/app_data.json` activities | The older activities enrichment path; also imported as a library by harvest_pageviews.py (Scheduled) for its cache-writing helpers. Run by hand if you need the standalone `apply` step outside the harvest_pageviews flow. |
| `gen_mock_data.py` | `python pipeline/gen_mock_data.py` | nothing (synthetic) | a flights-only mock `app_data.json` | Run to get a testable app_data.json without hitting any live harvester. |
| `harvest_image_licenses.py` | `python pipeline/harvest_image_licenses.py [--limit N \| --report]` | Commons imageinfo API | `cache/poi_image_licenses.json` | Run to refresh per-file licence metadata before an image-compliance pass; `audit_quality.py` (Scheduled) reads its cache but does not invoke it. |
| `harvest_ryanair_schedules.py` | `python pipeline/harvest_ryanair_schedules.py` | Ryanair's public timetable API | a schedule cache (not yet consumed by any Scheduled script) | Run to see flight-frequency data; check the docstring before relying on the output, nothing downstream reads it yet. |
| `harvest_urban_fabric.py` | `python pipeline/harvest_urban_fabric.py [ISO2 ...] [--refresh CC]` | Geofabrik country extracts | `cache/urban_fabric.json` | Feeds beauty_layer.py's urban-fabric component. Re-run when the catalogue gains destinations in a country not yet cached. |
| `images/drop_dead_files.py` | `python pipeline/images/drop_dead_files.py` | `data/reports/image_audit.json` 404 candidates, Commons API | strips dead references from the caches | Conservative cleanup; confirms every candidate against the Commons API before removing anything. Run after `image_audit` (Scheduled) flags 404s. |
| `intake/gap_scan.py` | see `pipeline/intake/README.md` | | | |
| `intake/ingest_candidates.py` | see `pipeline/intake/README.md` | | | |
| `intake/osm_settlement_scan.py` | see `pipeline/intake/README.md` | | | |
| `journeys/build_wire.py` | `python pipeline/journeys/build_wire.py` | the curated Trips/carta-unified dataset | `continent-app/public/journeys/*` | Run whenever the curated trip dataset changes; nothing schedules this, so a stale journeys wire is a silent risk. |
| `lakes/rebuild_v2.py` | `python pipeline/lakes/rebuild_v2.py` | per-country OSM sweep + Commons | drives the lakes v2 harvest/enrich chain | Convenience driver for a full local rebuild across all countries; the individual lake stages are Scheduled. |
| `member_layer.py` | `python pipeline/member_layer.py` | Wikidata, area-type destinations | `app_data/app_data.json` members[] | Re-run after adding an area-type (Amalfi Coast, Lake Como, ...) destination so its member villages become searchable. |
| `merge_curation.py` | `python pipeline/merge_curation.py` | `scratchpad/curation_*.json` hand-curated files, Wikipedia geosearch | `cache/activities.json` | Run after an agent produces curated POI JSON for sparse destinations, before the next `harvest_activities` patch. |
| `photos/contact_sheet.py` | `python pipeline/photos/contact_sheet.py <layer>` | a layer's rich photo cache | a numbered contact-sheet image + index | Feeds a human labelling pass; see docs/PHOTOS.md. |
| `photos/evalset.py` | `python pipeline/photos/evalset.py` | published heroes across layers | a ~800-image labelled set manifest | Builds the set any new photo-engine threshold must be measured against. |
| `photos/export_poi_credits.py` | `python pipeline/photos/export_poi_credits.py` | `cache/poi_image_licenses.json` | `continent-app/public/*` POI credit ledger | Run after a licence harvest so POI thumbnails carry visible attribution. |
| `photos/fill_authors.py` | `python pipeline/photos/fill_authors.py` | Commons Artist/Attribution/Credit fields | fills missing author credit in published layers | Run when a licence audit finds photographs with a licence but no named author. |
| `photos/geograph_fill.py` | `python pipeline/photos/geograph_fill.py` | Geograph API | fills GB/IE `listed`-tier photo gaps | Run to recover the ~18% of GB/IE listed rows Commons cannot supply. |
| `photos/label_sheet.py` | `python pipeline/photos/label_sheet.py <sheet>` | a reviewer's read of a contact sheet | `evalset/manifest.json` labels | Second half of the contact_sheet.py / label_sheet.py labelling pair. |
| `photos/rescore.py` | `python pipeline/photos/rescore.py <layer>` | a layer's rich cache (already-fetched thumbnails only) | re-ranked hero order | Run to fix a bad hero photo without a full re-harvest; respects the `.rescore_hold` concurrency guard. |
| `photos/review.py` | `python pipeline/photos/review.py` (binds 127.0.0.1:8012) | flagged photo candidates | a decision ledger | A local review web app; a person clicks through candidates, nothing publishes automatically. |
| `photos/verify_credit.py` | `python pipeline/photos/verify_credit.py` | `credit.py` rule | pass/fail test output | Run after touching the shared credit rule; cycling/export_cycling.py depends on it. |
| `photos/verify_takedown.py` | `python pipeline/photos/verify_takedown.py` | a copy of the published wire | pass/fail test output | Run before trusting `photos/takedown.py` in a real takedown; proves the scrub works without touching the live wire. |
| `practical_layer.py` | `python pipeline/practical_layer.py` | Wikidata, curated book-ahead list | `cache/practical.json` | No wired consumer was found for this cache as of this task (see "What is still open"); treat as Manual/experimental until confirmed. |
| `promote_place_candidates.py` | `python pipeline/promote_place_candidates.py` | `data/reports/coverage/*`, `coverage_gaps.json` | a new-gem spec file | Deliberately not scheduled, same reasoning as apply_new_gems.py: a human decides what enters the catalogue. |
| `rating_shadow_report.py` | `python pipeline/rating_shadow_report.py` | `app_data/curated_appeal.json`, independent signals | `app_data/rating_review_queue.json` | A human review queue for curator/data disagreements; never auto-corrects. |
| `search_index_layer.py` | `python pipeline/search_index_layer.py` | destination names | `continent-app/public/search_index.json` | Run whenever destination names change (a catalogue expansion, a rename); nothing schedules this, and a stale index means new places are unsearchable. |
| `trails/compose_citytrips.py` | see docs/TRAILS.md | | | |
| `trails/crosscheck_portals.py` | see docs/TRAILS.md | | | |
| `trails/elevation_validate.py` | see docs/TRAILS.md | | | |
| `trails/market_demand.py` | see docs/TRAILS.md | | | |
| `trails/quality_report.py` | see docs/TRAILS.md | | | |
| `trails/repair.py` | see docs/TRAILS.md | | | |
| `trails/smoke_test.py` | see docs/TRAILS.md | | | |
| `verify_skip_flags.py` | `python pipeline/verify_skip_flags.py [--layer beaches\|lakes\|mountains\|trips]` | a copied small-country cache | pass/fail per layer | Run after touching any layer's skip-flag logic (`--no-images`, `--seed-only`, etc.) to confirm a skipped run never writes a thinner cache than it started with. |

## One-shot (pipeline/oneoff/)

The 21 scripts in `pipeline/oneoff/` each did one specific, dated job (a
named catalogue expansion, a named data repair) and are not expected to run
again against the current data. They are not Superseded, because nothing
replaced them, and they are not Manual, because nobody is meant to reach for
them as a routine tool. They stay for provenance: if a future audit asks how
a specific batch of destinations entered the catalogue, the script that did
it is still readable. See the inventory in
`Execution/P1/T028-classify-pipeline-scripts.md` for the full list with a
one-line purpose per file.

## Layer READMEs

`pipeline/intake/README.md` covers the B3/B4 intake tools (`gap_scan.py`,
`ingest_candidates.py`, `osm_settlement_scan.py`), which have no dedicated
doc under `docs/`.

For trails and photos, `docs/TRAILS.md` and `docs/PHOTOS.md` already explain
the Manual tools in depth (review UIs, labelling workflow, the coverage and
quality reports); this index links to them rather than duplicating.
