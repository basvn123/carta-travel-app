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

## Wave A: finish the four started countries - STAGED 2026-08-13

- [x] Elevation NO (2,957) + AT (11,415) + FR (18,307), all zero
  low-coverage; FR calibration medians exactly 1.00 for both distance and
  ascent over thousands of tagged routes. (NO's ascent tag-check read 0.00
  over its 11 tagged routes; profiles themselves are healthy, the tag
  sample is junk.)
- [x] validate.py for NO/AT/FR: quality scores + drafts to needs_review.
- [x] Flagship + dayhike shortlists for NO/AT/FR (spot checks: Adlerweg
  family rank 7, GR 5 top-10, Preikestolen surfaced).
- [ ] describe.py for the NO/AT/FR shortlists: BLOCKED in this session,
  no ANTHROPIC_API_KEY / GEMINI_API_KEY in the environment. One command
  per country once a key is in .env:
  `python pipeline/trails/describe.py --countries NO,AT,FR --top 15`
- [ ] HUMAN: review UI approval pass (trips + the 20 staged citytrips).
  Approval is deliberately the only path to published.

Benchmark: 4 countries with published, elevation-profiled, portal-checked
flagship trails; public/trails/{AT,FR,NO}.json no longer empty (fires on
the first approval + export run after the review pass).

## Wave B: DE + AT portal cross-checks - DONE 2026-08-13 (DE; AT n/a)

- [x] DE: BVV Wanderwege GPX bundle (geodaten.bayern.de, CC BY 4.0, updated
  monthly): 330 named routes staged as 6,421 subdivided pieces; matching
  restricted to a Bavaria coverage envelope so other Laender collect no
  meaningless failed checks. Ledger row added. Germany OSM ingest started
  so the check has trips to check.
- [x] AT: surveyed 2026-08 and NOT implementable open-data-clean: the
  Tirol/tiris hub publishes bike routes but no hiking vector layer, the
  OeAV Wegenetz is closed, no other Land ships open trail geometry.
  Documented in the loader; revisit if a Land opens one.
- [x] Subdivision already happened at stage time (the CH lesson is baked
  into stage_portal for every source).

Benchmark: agreement rates reported for AT/DE shortlist trips; disagreements
land in the review UI overlay like CH's.

## Wave C: the day-hike blind spot - SHIPPED 2026-08-13 (one known limit)

- [x] `popularity.py --family dayhikes`: 5-25 km, loop (roundtrip tag or
  ends within 2 km) OR own wikipedia/wikidata identity (A-to-B day routes
  like Besseggen end at a boat dock), sac_scale up to
  demanding_mountain_hiking (T3: the iconic alpine day hikes), ranked by
  anchored catalogue fame with no network component and no length factor.
  Own CSV ({CC}_dayhikes.csv) + validation check popularity_dayhike.
  First NO run surfaced Preikestolen Roundtrip (flagship rank: 1194).
- [ ] Feed the dayhike shortlist into `compose_daytrips.py` once the first
  dayhikes are published (composer reads published content only).
- KNOWN LIMIT: a famous route whose OSM relation carries no wikipedia/
  wikidata tag AND has no catalogue anchor nearby (Besseggen: Jotunheimen
  wilderness) stays invisible to fame ranking; there is no honest signal
  to rank it with. Fix is upstream (tag the relation in OSM) or a future
  name-to-article resolution pass with a verification gate.

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
