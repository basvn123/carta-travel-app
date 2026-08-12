# Trails expansion plan (2026-08-12)

The gap list from comparing the trails/daytrips stack against the open-data
research playbook. The architecture verdict was: ~90% implemented, with two
deliberate divergences to KEEP (the local lab + produced-work-only export is
a stronger ODbL posture than Supabase-hosted trip tables; run_pipeline.py
replaces Prefect with equivalent function). This plan covers only what is
genuinely unfinished, in dependency order.

Current state: 43.4k OSM routes ingested for CH/AT/NO/FR; elevation complete
for CH only; portal cross-checks live for CH/FR/NO; 49 trips published (CH);
20 citytrips at needs_review; popularity shortlists favour long famous
routes; POI images carry no per-file licence metadata.

## Wave A: finish the four started countries

Everything below runs inside the existing lab chain (elevation -> validate ->
popularity -> crosscheck -> describe -> review -> export), no new code.

- [ ] Elevation for FR, NO, AT (`pipeline/trails/elevation.py`, GLO-30
  tiles; CH's window-3 + 5m gate calibration carries over). Watch the
  re-ingest-zeroes-Z gotcha: run elevation AFTER any re-ingest.
- [ ] Validate + repair for FR/NO/AT (repair needs the per-country Valhalla
  tile swap; Valhalla far-snaps outside its loaded country).
- [ ] Popularity shortlists for FR/NO/AT, then describe + drift-check, then
  human review to publish. Target: the playbook's 5-15 flagship hikes per
  country actually published, not just staged.
- [ ] Citytrips: clear the 20 needs_review pilots through the review UI.

Benchmark: 4 countries with published, elevation-profiled, portal-checked
flagship trails; public/trails/{AT,FR,NO}.json no longer empty.

## Wave B: DE + AT portal cross-checks

`crosscheck_portals.py` gains two fetchers next to CH/FR/NO:

- [ ] AT: BEV / geoland.at (CC BY 4.0, credit "(c) BEV"). Wanderwege layers
  are federated per Bundesland on geoland.at's WFS; start with Tirol +
  Salzburg (densest trail stock, covers Adlerweg/Zentralalpenweg spot
  checks).
- [ ] DE: BKG federal products are dl-de/by-2-0, but trail GEOMETRY lives at
  Laender level under per-Land terms. Implement only Laender with clean
  open WFS (Bayern and Baden-Wuerttemberg first), verify licence per Land
  before each fetcher ships, add a data_licenses.md row per portal.
- [ ] ST_Subdivide the portal geometries before the KNN match (the CH lesson:
  unsubdivided portal multilines make index probes crawl).

Benchmark: agreement rates reported for AT/DE shortlist trips; disagreements
land in the review UI overlay like CH's.

## Wave C: the day-hike blind spot

Popularity scoring ramps short routes DOWN (extract-clipped crumbs of long
routes had to be suppressed), which also buries genuine half-day loops. Fix
by adding a second shortlist FAMILY rather than un-suppressing:

- [ ] `popularity.py --family dayhikes`: 5-25 km, roundtrip tag or start/end
  within 2 km of each other, sac_scale <= mountain_hiking, and ANCHORED
  fame: score by the fame of catalogue destinations/POIs within 30 km of
  the route (the app already knows which towns are worth visiting; a loop
  above a famous lake inherits the lake's draw), not by the route's own
  Wikipedia footprint, which day hikes rarely have.
- [ ] Feed the dayhike shortlist into `compose_daytrips.py` so daytrips can
  include a real short hike leg (its current pool skews long-distance).
- [ ] Same gate as everything else: validate -> describe -> human review.

Benchmark: each published country carries at least 5 published day hikes
(distinct from long-distance stages), and daytrips can attach one.

## Wave D: per-image TASL metadata (licence ledger follow-up)

The POI image sweeps store only a thumbnail URL. The citytrips path already
stores per-file licences (cache/citytrip_image_licenses.json); generalise it:

- [ ] New `pipeline/harvest_image_licenses.py`: for every its img whose URL is
  a Commons file, batch `action=query prop=imageinfo iiprop=extmetadata`
  (50 titles/req) -> {file: {license, license_url, author, credit_line}}
  into cache/poi_image_licenses.json. Resumable, additive.
- [ ] Reject list: NC/ND licences and "Wikimedia-only" files get the image
  DROPPED from the master (audit_quality.py gains the check; the FoP queue
  pattern already exists for the reporting side).
- [ ] Surface: per-image credit available from the POI detail panel (a
  lightweight "photo: author / licence" line sourced from the cache at
  build time; keep the wire lean by shipping credits only for images the
  panel actually shows).

Benchmark: every rendered POI photo can produce its TASL line; zero NC/ND
files in the catalogue; data_licenses.md follow-up row closed.

## Wave E: ops hardening

- [ ] Heartbeat: run_pipeline.py pings a Healthchecks.io check URL (env var,
  skip cleanly when unset) at start and success, so a silently-dead
  Scheduled Task or a paused machine is noticed within a day.
- [ ] Standing lab dedupe: monthly task running ST_DWithin + folded-name
  similarity across trips (the ingest dedupes per source; cross-SOURCE
  twins appear once portals contribute geometry).
- [ ] Regression alert: `regression.py` failures on published trips should
  mark the trip needs_review in the lab AND surface in the pipeline log
  summary, not just the report file.

## Next ingest wave (after A-D hold)

Priority by market demand data + OSM density + portal quality:
IT, ES, DE, GB, SI, SE first (the ingest COUNTRIES roster already lists all
44 slugs; ingest is the cheap step, review time is the constraint). Seed
5-15 flagship routes per country through the full gate before opening the
next country, per the playbook's quality-over-quantity rule.

## Explicitly not doing

- Prefect/Airflow migration and Supabase-hosted trip tables: the local lab +
  wire export is deliberate (ODbL posture, zero standing cost).
- Komoot/AllTrails/Wikiloc: legally closed, permanently out.
- Waymarked Trails as a source: superseded by direct OSM relation ingest.
