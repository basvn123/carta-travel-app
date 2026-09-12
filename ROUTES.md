<!-- Carta routes layer. Spec + session prompts for Claude Code. -->
<!-- Revision 2, 2026-09-12: reshaped around the R0 audit. R0 is done. -->

# Carta, Routes layer (hiking + cycling)

Companion to `PLAN.md`. Turns the existing trails and cycling layers into a
route catalogue with a real hierarchy (parents, stages, variants), geometric
dedup, and a destination attach step that presents the Via Francigena
rather than stage 47 of it. Phase one enriches destination pages, phase two
adds route pages and a routes Explore.

**Steps are labelled R0 to R8.** Same working agreement as `PLAN.md`: one
branch, one commit per step, acceptance criteria are not negotiable, stop
and report rather than working around a failure. This file was committed
on its own on `explore-v4`. When R1 starts, create `routes` from a head
that contains it. Regenerated wires and caches sitting in the working
tree are never part of a routes commit; stage files by name.

## What R0 found (2026-09-12)

The first revision of this file assumed there was little to build on. The
audit found the opposite, and every prompt below is reshaped by it.

| Exists today | Where | Covers |
|---|---|---|
| 238,709 hiking route relations staged from Geofabrik extracts, 1,758 of them superroutes | trailslab `trips` (PostGIS, port 5433) | R2 |
| 65,375 cycle route relations, node networks kept as a graph (18,939 nodes, 24,171 edges) | `cycle_routes`, `cycle_nodes`, `cycle_node_edges` | R2, R8 |
| Way stitching in relation order with flips, gap bookkeeping, 10,023 accepted splice or Valhalla repairs, 207,353 gapless relations | `ingest_osm_routes.py`, `splice.py`, `repair.py`, `gap_info` | R3b |
| Copernicus GLO-30 elevation, calibrated against 272 official Swiss figures (median ratio 0.94, France 1.00) | `elevation.py` | R4 |
| Member way surface, highway, sac_scale, visibility, wheelchair percentages with a known share | `way_tags.py`, `trips.way_tags` | R4 |
| Two scores: `quality_score` 0-100 (five checks) and `rating` 0-10 with reason codes, plus NUTS3 quotas | `validate.py`, `rate.py`, `curate.py` | R5 |
| A 17,670-row wire with 90 m geometry per country file and full 3D geometry plus a 200-point profile per detail file | `public/trails/`, `export_wire.py` | R1, R6 |
| A destination join: radius by place class to the route's bbox centre, cap 6, page shows 3 | `pipeline/dossier/build_dossier.py` `join_nearby` | R6 (the defect) |
| Trail and cycle pages with GPX, KML, share links, live GPS | `TrailPage.jsx`, `CyclePage.jsx` | R7 |

Four things are missing, and they are the work:

1. **Hierarchy is discarded at ingest.** `expand_ways` flattens superroute
   children into the parent's way list and no row keeps parent ids, child
   ids or member roles. Zero rows carry any such bookkeeping. Stage
   detection is name-only today: 12.3% of the trail rows attached to
   destinations carry a stage pattern in their name.
2. **No geometric dedup.** `curate.collapse_families` folds on three NAME
   keys (title with counters stripped, wiki article, E-path). Three
   relations on one trail under three names are three rows.
3. **The attach measures the wrong thing.** Distance to the bbox centre,
   not to the line, so a 386 km route is placed by a point that may be
   100 km from where it passes. A second runtime join in
   `components/TrailsNearby.jsx` (40 km, cap 4) disagrees with the first.
4. **Parents fail the continuity gate, so stages ship.** The Via Francigena
   superroute (lab id 6828, relation 1,921 km, iwn) is staged in 54 parts
   with 53 gaps and 1,352 missing member ways and has never been published.
   Nineteen of its stages and variants are. That is the Rome page.

**Decisions made on the back of the audit**

- **Extend in place.** `pipeline/trails/` and `pipeline/cycling/` grow the
  missing pieces. There is no `pipeline/routes/` and no second store. The
  lab is the store of record; the wires are the produced works.
- **The lab is PostGIS and stays PostGIS.** The first revision said not to
  introduce it. It was already the store every other layer reads.
- **The attach lands in the dossier contract**, which the page and the PDF
  already read, not in `app_data.json`. `app_data.json` is the 77 MB wire
  the perf work names as the blocker; it gets nothing from this layer. If
  the Destinations grid ever needs a "has routes" filter, it gets a count
  pair per destination (`routes_n: {hiking, cycling}`) and nothing more.
  Decided 2026-09-12; do not reopen it inside a session.
- **Parents are presented as umbrellas, never as a GPX.** A 1,900 km
  superroute with 53 gaps will never pass the continuity gate and should
  not. The destination page names the parent and the nearest stage; the
  downloadable thing is the stage.
- **Cycling rides in the same passes.** Every column R1 adds to `trips`
  is added to `cycle_routes`; every hierarchy and dedup pass runs for both.
- **Activities, first pass:** hiking and cycling. The rest is R8.

---

## What makes this hard (read before writing code)

**1. OSM route relations are not tidy lines.** A route relation is an
unordered bag of ways. Members carry roles: `""`, `forward`, `backward`,
`alternative`, `approach`, `excursion`, `connection`, `main`. Long routes
are super-relations whose members are stage sub-relations, sometimes two
levels deep. Ways are shared between routes. Gaps are common and often
legitimate (ferry hops, unmapped urban sections). The stitching already
exists and is not rewritten here; the hierarchy is what has to be added.

**2. The stage/parent problem is measured, not suspected.** Of 15,685
trail rows attached to destinations, 1,927 carry a stage pattern in the
name and 1,245 are rows the pipeline itself knows to be one of a family.
All six of Rome's rows today are stages. R3a resolves stages to parents
by structure; R6 presents the parent.

**3. Naive elevation gain is wrong by 2 to 5 times.** The existing pass
already resamples (30 m), smooths (3 samples, about 90 m) and gates with
hysteresis (5 m), and was calibrated against official figures. R4 is a
validation exercise against that calibration, not a rewrite. Replacing a
calibrated method with a prescribed one without a comparison table is the
failure mode to avoid.

**4. Duplicates.** The same physical path is frequently carried by four or
five overlapping relations: a European E-path, a national GR, a regional
network route and a local themed walk. Name folding catches some. Only a
geometric overlap test catches the rest, and nothing does that today.

## Sources

| Layer | Source | Notes |
|---|---|---|
| Route relations | Geofabrik per-country extracts, cached under `data/raw/geofabrik/<date>/` (44 files, 30 GB, IE and NI share one; TR and UA are on disk though out of the catalogue) | Never Overpass for bulk. The extracts carry no object metadata, so `osm_last_edited` is not available; do not promise it |
| Hiking filter today | `type=route\|superroute`, `route=hiking\|foot\|walking`, kept when `network` has iwn/nwn/rwn or the relation is named | `ingest_osm_routes.py`; only 21 tags retained in `raw_tags`, R2 fixes that |
| Cycling filter today | `route=bicycle`; superroutes and `network:type=node_network` are dropped from the catalogue, node networks kept as a graph | `harvest_cycling.py` |
| Difficulty | `sac_scale`, `trail_visibility`, `via_ferrata_scale` on member ways, DEM otherwise; the wire says which (`f.gs` tagged or derived) | `way_tags.py`, `attributes.py` |
| Surface | per-member-way percentages with a `cover` share for each key | `trips.way_tags` (hiking), `cycle_routes.way_spans` (cycling, positioned) |
| Waymarking | `osmc:symbol`, `symbol`; wire `f.way` and `waymark_ref` | present |
| Elevation | Copernicus GLO-30 from the public AWS bucket, tiles cached under `data/raw/dem/` (24 GB) | `elevation.py` |
| Huts | `scenic_pois` kind `hut` (15,104) and `spring` (45,279) | drinking water is not harvested; R6 may add it |
| Transit access | `railway=station\|halt` from the extracts with the heritage and miniature exclusions in `enrich_cycling.py` (line 620) | no standalone stops table yet; R6 adds one |
| Node networks | `cycle_nodes`, `cycle_node_edges` | Belgium and the Netherlands; the NodeNetwork record and destination summary are R8 |
| Cross-check | Waymarked Trails (github.com/waymarkedtrails) | same OSM source, validate counts per country |

---

# The prompts

Paste one per session. Each assumes `ROUTES.md` and `PLAN.md` are committed
at the repo root, and that the lab is up (`docker ps` shows `trailslab-db`;
Docker Desktop is a per-user install, prepend its `resources/bin` to PATH).
Before any migration, check `pg_stat_activity` for an idle-in-transaction
session: an `ALTER TABLE trips` queues behind it and freezes the lab.

---

## R0, Audit (done 2026-09-12)

The audit report lives in the session that produced it and in memory. Its
numbers are the ones cited above. Do not repeat it.

---

## R1, Schema on the lab and the wire

```
Read ROUTES.md. Implement R1: the hierarchy and dedup columns on the lab,
and the two record shapes as a mapping onto the wire. No ingestion, no new
store.

Lab migration tools/trailslab/initdb/09_hierarchy.sql, applied through
pipeline/trails/schema.py's guard (it only ALTERs when a column is missing,
because a no-op ALTER still takes an ACCESS EXCLUSIVE lock):

  route_relations, one row per OSM route relation of either activity,
  whether or not it has a trips or cycle_routes row. This is the relation
  graph and the only place the full member list lives:
    activity text, osm_id bigint, country text, PRIMARY KEY (activity, osm_id)
    tags_all jsonb            every tag, verbatim
    members jsonb             ordered [[type, ref, role], ...], OSM order kept
    parent_refs bigint[]      route relations this one is a member of
    child_refs bigint[]       member relations of the same activity
    hierarchy text            parent | stage | variant | standalone
    hierarchy_src text        structure | name
    stage_index int, stage_count int
    in_store boolean          a trips / cycle_routes row exists
    duplicate_in text[]       other country extracts that carried it
    scanned_at timestamptz

  on trips AND cycle_routes, copied from route_relations by (source, source_ref):
    hierarchy, hierarchy_src, parent_refs, stage_index, stage_count
    co_located bigint[]       R3c writes it, ids of overlapping rows

Then pipeline/trails/route_schema.py: two dataclasses and the mapping from
lab rows to them. This is a MAPPING onto fields that already exist; do not
rename anything the app reads today.

RouteSummary (the wire country row plus the dossier attach row):
  route_id            trips.id (wire id)
  osm_relation_id     source_ref, NEW wire key `osm`
  name, activity      name; hike / cycle by table
  network_tier        network, NEW wire key `net` (only the detail file has it)
  distance_km         distance_m
  ascent_m, descent_m ascent_m; descent_m is NEW in the country row
  loop                is_loop, and f.rt for the four shapes
  difficulty          f.g (easy..alpine, five values, keep them) and f.gs as
                      difficulty_source
  waymarked           f.way
  surface_summary     NEW wire key `sf` {paved, gravel, path, other, unknown}
                      as shares of length, derived from way_tags.surface and
                      way_tags.cover; unknown is never hidden
  is_stage_of         NEW wire key `h` {cls, of, i, n}: class, parent wire id
                      or name, stage index, stage count
  quality             rating (0-10) and quality_score (0-100), both already
                      shipped or shippable
  thumbnail_hint      img.u
  distance_from_destination_km, access_point, transit_reachable
                      belong to the attach row (R6), not the country row

RouteDetail (the trip/{id}.json file), everything above plus:
  geometry            already full 3D MultiLineString
  elevation_profile   already 200 points
  member_way_ids      NOT stored today; add to the detail file from
                      route_relations.members (ways only) in R2
  stages, variants    NEW, ordered child route ids with roles
  huts, water_points  from scenic_pois within 500 m, with distance along
  transit_access      R6
  gaps                gap_info counts today; positions are NOT stored and
                      are not promised
  tags_raw            tags_all once R2 has run

Extend pipeline/trails/smoke_test.py: insert three fixture relations under
source='fixture' (a loop, a point-to-point, a parent with three stages),
run the mapping, assert the parent round-trips with its stages nested and
in order, and delete the fixtures. Do not touch export_wire.py's existing
keys; add the new keys through route_schema so R2/R3 can fill them.
```

> **Done when:** the migration applies through the guard on the live lab and on a fresh lab started from an empty volume (a throwaway compose project on another port, never `down -v` on the live one), the smoke test passes with the three fixtures, and a Liechtenstein export to a scratch directory differs from the one before only by the added keys. Keys the lab can already fill (`osm`, `net`, `descent_m`, `sf`, `huts`, `gaps`) carry values; the hierarchy keys stay null until R3.
>
> **Shipped 2026-09-12.** `09_hierarchy.sql`, `route_schema.py`, the smoke test fixtures, and the export additions. On the 111 Liechtenstein rows: `osm`, `net` and `descent_m` on 110, `sf` on 105, `h` on none, and every pre-existing key byte-identical.

---

## R2, Retain relation members and parents

```
Read ROUTES.md. Implement R2: fill route_relations from the cached
extracts. Raw relations only, no geometry, no DEM.

Build pipeline/trails/hierarchy.py with a --scan step. Per country extract
under data/raw/geofabrik/ (already on disk, never re-download; use the
newest dated folder that has the file):

  one relations-only pyosmium pass with KeyFilter("route"), the same shape
  as scan_relations() in ingest_osm_routes.py, but keeping EVERY tag and
  the full ordered member list, for
    hiking:  type=route|superroute, route=hiking|foot|walking
    cycling: type=route|superroute, route=bicycle
  Keep node-network relations too, flagged by tags; R8 reads them.

  upsert into route_relations with in_store set by joining trips and
  cycle_routes on (source='osm', source_ref). parent_refs and child_refs
  come from the member lists across the whole pool of that country.

Rules:
- Keep the member order as OSM gives it. Do not sort. R3 depends on it.
- Keep every tag. Do not pre-filter to the ones you think matter.
- A relation that appears in more than one extract (cross-border) keeps
  the row from the country that ingested it (trips already chose one; use
  that, else the first scanned) and records the others in duplicate_in.
  Parent and child refs are merged across extracts, never overwritten.
- Per-country resumable: --countries CH must touch only CH rows.
- Copy hierarchy fields onto trips and cycle_routes only in R3, not here.
- Write data/reports/routes_extract.json: per country and activity, the
  relation count, superroute count, node-network count, and how many have
  a store row.

Expect about 240,000 hiking and 70,000 cycling relations. The lab already
holds 238,709 and 65,375 rows respectively, so the scan must land within a
few percent of those plus the superroutes and node networks the cycling
harvest dropped. An order of magnitude off means the filter is wrong: stop
and report.
```

> **Done when:** all 44 extracts scanned, every `trips` and `cycle_routes` row with source osm has a `route_relations` row, the counts report exists, and re-running one country leaves every other country's `scanned_at` untouched.
>
> **Shipped 2026-09-12.** `hierarchy.py --scan`, 44 extracts in 252 s. Hiking: 308,266 relations (2,159 superroutes, 121,161 node-network, 9,443 cross-border), every one of the 238,709 store rows covered. Cycling: 117,668 (1,272 superroutes, 48,441 node-network, 3,885 cross-border), every one of the 65,375 store rows covered. Gate ratios 1.29 hiking (the unnamed local relations the ingest filter dropped, kept here on purpose) and 1.06 cycling excluding node networks. Re-running LI alone moved none of the other 425,752 timestamps. The Via Francigena top relation (11860709) has four children, which are the national sections; the Italian one is itself a superroute, so R3 must classify two levels deep.

---

## R3, Hierarchy, dedup, and the stitch report (the hard one)

```
Read ROUTES.md, section "What makes this hard". Implement R3. Report at
the end of each sub-task before starting the next.

3a. Hierarchy resolution (pipeline/trails/hierarchy.py --classify).
  From route_relations alone. A parent has child relations of the same
  activity. A stage is a member of exactly one route relation of the same
  activity with role "" or main. A variant is a member with role
  alternative, alternate, variant, approach, excursion, connection, link,
  shortcut or detour. Everything else is standalone. A relation that is
  both a parent and a stage (two-level superroutes) is a parent with its
  own parent_refs. hierarchy_src=structure for all of these.
  Name patterns (Tappa, Etappe, Etape, Stage, Sezione, Tramo, Etapa,
  numbered suffixes, the STAGE_SUFFIX_RE in curate.py) are the FALLBACK
  for relations with no structural parent, set hierarchy_src=name, and
  log every one. stage_index comes from the parent's member order,
  stage_count from the parent's child count.
  Copy hierarchy, hierarchy_src, parent_refs, stage_index, stage_count
  onto trips and cycle_routes.
  Then make it the first key in curate.collapse_families: two rows with
  the same structural parent are one family before any name key runs.
  Report: parents, stages, variants, standalones per country and activity,
  how many stages were found by name only, and what a --dry-run curate
  would change in family membership.

3b. Stitching: verify and report, do not rewrite.
  ingest_osm_routes.py already stitches in relation order, flips ways,
  records gaps in gap_info, and splice.py / repair.py bridge short breaks.
  Report the distribution of gap_count over staged rows, the ten
  most-gapped routes by name, and for each of the 1,758 hiking superroutes
  whether its assembled line is gapless. Parents are presented as
  umbrellas in R6 whether or not they stitch; a gapless parent may also be
  offered as a download. Never fabricate geometry to close a gap.

3c. Deduplication (pipeline/trails/dedup.py).
  Two rows of the same activity are co-located when the shorter one lies
  more than 80% of its length inside a 30 m buffer of the longer, in
  EPSG:3035. Candidates by bbox intersection through the GiST index, then
  ST_Length(ST_Intersection(short, ST_Buffer(long, 30))) / ST_Length(short).
  Sample nothing; the lengths are exact. Run per country, with cross-border
  pairs handled by the duplicate_in countries. When co-located, the row
  with the higher network tier (iwn > nwn > rwn > lwn, icn > ncn > rcn >
  lcn) is the head; the others get its id in co_located and are NOT
  deleted, demoted or unpublished by this step. curate.py reads co_located
  as a fourth family key.
  Report: groups formed, the five largest by member count, and how many
  published rows now share a group with another published row.

3d. Classification: verify attributes.py's route_type (loop, out_back,
  point, figure8) against the spec's definitions (loop = ends within
  500 m and not an out-and-back; out-and-back = more than 60% retraced
  within 30 m). Report disagreements on a sample of 200; change the code
  only if the spec's rule is right and the code's is wrong, and say which.

Constraints:
- Deterministic: the same lab state must produce the same columns.
- Nothing in this step deletes an OSM relation from the store.
```

> **Done when:** the Via Francigena resolves to relation 6828 as one parent with its stages in order and its variants labelled, the 85 other Francigena rows all point at it or at the Magna, Fabaria and Mare parents; every hiking superroute has a reported gap state; co_located groups are reported; and a curate `--dry-run` shows the family collapse now honouring structure before names.

---

## R4, Elevation: validate the calibrated pass, then fill the gaps

```
Read ROUTES.md. Implement R4. elevation.py exists and is calibrated. This
step decides whether it stays, with evidence, and adds the derived metrics
the wire lacks.

1. Build the validation table the layer never had. Pick ten routes with
   published official ascent figures across at least four countries: a
   GR 20 stage, an Alta Via stage, a EuroVelo section, a Swiss Wanderweg,
   an Adlerweg stage, and so on. Record source and figure in
   data/reports/routes_elevation_validation.json.
2. Compare the current numbers (30 m step, 3-sample window, 5 m
   hysteresis) against them.
3. Run the spec's variant as an OFFLINE experiment on the same ten: 20 m
   resample, 150 m moving average, 8 m hysteresis. The DEM tiles are
   cached; do not change elevation.py's constants for this.
4. Keep whichever is within 15% on more of the ten. If the current method
   wins, leave elevation.py alone and say so. If it is systematically more
   than 15% above published figures, report the table and stop.
5. List the 13 published routes over 250 m/km (max 321). For each, say
   whether it is genuinely alpine or a DEM artefact, and demote the
   artefacts through the existing regression path.

Then add, without changing the ascent method:
- max_elevation, min_elevation, elevation at start and end
- steepness shares: percent of distance above 10% and above 15% grade
- descent_m in the country row (the detail file has it already)
- surface_summary {paved, gravel, path, other, unknown} from way_tags,
  through the route_schema mapping from R1
- duration: hiking keeps DIN 33466 (the signpost standard, already there,
  conservative by design); cycling gets a flat 18 km/h with a grade
  adjustment if enrich_cycling.py does not already carry one, and the
  wire says which rule produced the number.

Report the ten-route table, both methods side by side, in the final
message.
```

> **Done when:** the chosen method is within 15% of published figures on at least 8 of 10 routes, the 13 outliers are each explained or demoted, and the new fields appear in a `--dry-run` export.

---

## R5, Quality: verify, expose, and report

```
Read ROUTES.md. Implement R5. Two scores exist: validate.py's
quality_score (0-100, five weighted checks) and rate.py's rating (0-10
with reason codes, percentiles within the route's own region). Neither is
replaced. This step checks them against the spec's components, exposes
what the wire hides, and writes the report the spec asked for.

Check each spec component against the code and state where it lives:
  network tier        curate NETWORK_LEVEL and rate's designation term
  waymarking          f.way, and whether it enters either score
  completeness        continuity check in validate.py from gap_info
  tag richness        surface, sac_scale, operator, website, description
                      presence; add to validate's completeness check if
                      absent
  OSM maturity        member way count (gap_info.member_ways); last-edited
                      is NOT available from Geofabrik public extracts, so
                      omit it and say so in the doc
  named               curate's SYNTHETIC_PREFIX exclusion
  scenic context      rate's scenery term from scenic_pois

Length must not be a quality term. Verify that neither score carries
distance directly (curate's bands are a selection quota, not a quality)
and report if one does.

Expose in the wire: `net` (network tier) in the country row, so the app
and the attach step can balance by tier without opening detail files.

The publish threshold is not one number here; it is curate.py's gates
plus the NUTS3 quota. Write it down as such in a comment block at the top
of curate.py and in docs/TRAILS.md, then write
data/reports/routes_quality.json: score distributions for both scores,
count published per country per activity, and the 20 highest-rated routes
by name per activity so the result can be eyeballed.
```

> **Done when:** the top 20 per activity reads like recognisable routes, no country with meaningful OSM coverage has zero published routes (Faroe and Monaco have one each today; say whether that is coverage or the bar), and the report exists.

---

## R6, Attach routes to destinations

```
Read ROUTES.md. Implement R6: replace the trail entries in "Nature close
by" with proper route attachments, computed in the lab and carried by the
dossier contract.

pipeline/trails/attach.py, registered in run_pipeline.py as routes_attach,
cadence after trails_rate and cycling_publish, and listed before dossier
so a dossier build always reads the newest attach.

For each destination in app_data.json (3,868, use city_lat/city_lon when
present), candidates are published rows of either activity whose bbox
lies within 25 km, then exact ST_Distance in EPSG:3035 from the centre to
the LINE, nearest point, never bbox centre and never the start. For each:
  distance_from_destination_km  to the nearest point on the line
  direction                     compass bearing and a phrase key the app
                                translates ("12 km south-east")
  nearest_access_point          the nearest vertex of the line that is
                                within 500 m of a highway junction, a
                                car park (amenity=parking) or a transit
                                stop, with its name if any
  transit_reachable             a station lies within 1 km of that access
                                point. Stations come from a new
                                transit_stops table filled by one
                                KeyFilter("railway") node and way pass per
                                country, reusing the classifier at
                                enrich_cycling.py line 620 that excludes
                                miniature, subway, light rail and
                                heritage; add amenity=bus_station. Not bus
                                stops: they are millions and prove nothing.

Selection rules, and these matter more than the matching:
- Present parents, never stages. When the nearest row is a stage, attach
  the parent (its own line if it has one, else the union of its stages
  for the distance) and carry the nearest stage's name and distance as a
  note. Rome must say "Via Francigena, passes 9 km west" with "nearest
  stage: Variante Anello di Campagnano".
- One entry per physical path: fold on co_located, then on family.
- Cap 8 hiking and 6 cycling per destination, ranked by rating times a
  proximity decay (half weight at 25 km).
- At most 3 entries from the same network tier per activity.
- Rated rows only. Listed rows may fill only where a destination would
  otherwise have nothing, and carry `listed: true`.
- Attach nothing rather than fill to the cap.

Write data/derived/routes_attach.json keyed by destination id:
  {hiking: [RouteSummary attach rows], cycling: [...]}
and have build_dossier.py read it into a `routes` key in the dossier,
removing `nearby.trails` (beaches, lakes and mountains stay in nearby).
Bump the dossier schema to dossier_v2. Do not touch app_data.json.

Then the page. Split the block:
- "Nature close by" keeps beaches, lakes and mountains.
- A new card "Routes from here" (i18n key dest.routesTitle, six catalogs)
  grouped by activity, each row: name, distance, ascent, difficulty,
  shape, a waymarked mark, distance and direction from here, a car-free
  start mark where transit_reachable, the stage note for parents, and the
  existing OSM link. Rows open TrailPage / CyclePage as today.
- destinationPdf.js prints the same rows from the same key.
- Retire the join in components/TrailsNearby.jsx: it either reads the
  dossier rows or goes. One rule, one place.
- Footer of the card: coverage is uneven, say so; OSM contributors under
  ODbL, and the Copernicus DEM credit for the ascent figures. Both here,
  not in R7.
- Omit the card entirely when there is nothing; never an empty shell.

Verify with a Playwright harness continent-app/scripts/verify_routes_block.mjs
in the style of verify_detail_sheet.mjs: Rome shows the Via Francigena as
a parent, no row name anywhere in the block matches the stage patterns
from R3a, the card is absent for a destination with no attachments, and
the PDF section renders.
```

> **Done when:** Rome shows the Via Francigena as a parent route with sensible figures, no stage names appear anywhere in the UI, the two runtime joins are one, and the per-destination route count distribution for both activities is reported alongside the R0 baseline (134 / 365 / 342 / 320 / 265 / 212 / 1,926 for 0 to 6 trails).

---

## R7, Route pages and the routes Explore

```
Read ROUTES.md and PLAN.md phase C. Implement R7: routes as a browsable
catalogue, reusing the Explore patterns from PLAN.md rather than inventing
new ones. TrailPage.jsx and CyclePage.jsx exist: generalise them into one
RoutePage rather than adding a third page.

Route page (continent-app/src/browse/RoutePage.jsx):
  hero map with the geometry drawn, start and end marked, huts and water
  the elevation profile as an interactive chart, hover reading off
    distance and elevation, steep sections shaded
  the stat row: distance, ascent, descent, difficulty, duration, shape
  surface breakdown as one stacked bar, the unknown share visible
  stages listed in order for parent routes, each linking to its own page
  "Bases along the route": Carta destinations within 10 km, existing
    destination cards, ordered by distance along the route
  getting there and back: transit at both ends, loop or one-way logistics
  GPX and GeoJSON download, attribution to OSM contributors under ODbL

Routes Explore (continent-app/src/ExploreRoutes.jsx):
  reuse the taxonomy, token and card conventions from PLAN.md C1 to C4
  kind becomes activity; verdict becomes network tier; role becomes shape
  filters: activity, distance band, ascent band, difficulty, shape,
    waymarked, car-free start, country, "near a Carta destination"
  a map view sharing the ExploreMap component from C7
  editorial rails: The long-distance classics (iwn/icn), Loops under
    20 km, Car-free starts, High routes above 2,000 m, Flat and easy

Link both directions: destination pages to route pages, route pages to
destination pages.

Follow PLAN.md phase C rules: tokens in :root first, no literals in
components, everything visible at rest, no horizontal body scroll at
390px.
```

> **Done when:** a route page renders for the Via Francigena (a parent), the GR 20, EuroVelo 6 and a 6 km local loop without layout breaking at any of those scales, and the elevation chart reads correctly in both themes.

---

## R8, Extending to the other activities

```
Read ROUTES.md. Implement R8: further activities. Everything reuses R1 to
R6; only the filter, classification and difficulty change.

Native OSM tags, straightforward:
  MTB            route=mtb, difficulty from mtb:scale and mtb:scale:uphill
  Ski touring    route=ski, piste:type=skitour, piste:difficulty
  Nordic ski     piste:type=nordic
  Via ferrata    highway=via_ferrata, ferrata_scale (K1 to K6)
  Canoe/kayak    route=canoe, whitewater difficulty tags
  Horse riding   route=horse

Derived, no native tag; the rules go in the module docstring:
  Trail running  hiking routes, loop or out-and-back, 8 to 30 km, ascent
                 under 60 m/km, surface predominantly path or track,
                 sac_scale T1 to T2, waymarked. Scored for runnability.
  Gravel         cycle routes with 40 to 85% unpaved, tracktype grade1 to
                 grade3, no section requiring mtb:scale above 1; measure
                 from way_spans, which are positioned
  Bikepacking    cycle routes over 150 km, segmented into day stages of
                 60 to 120 km with an overnight candidate near each break;
                 stage_planner.py already does this for tours, reuse it

Node networks (Belgium, Netherlands, parts of Germany):
  the graph already exists in cycle_nodes and cycle_node_edges. Build the
  NodeNetwork record over it (area, signed km, junction count) and present
  it on destination pages as "node network cycling, 340 km of signed
  routes in this area" with a link, never as individual routes.

Add each activity as its own commit. After each, re-run the R5 report and
check that the new activity has not displaced hiking and cycling from
destination attachments; the R6 caps are per activity for that reason.
```

> **Done when:** each activity has published routes in at least five countries, trail running never surfaces a route that fails its own runnability rules, and node-network countries show a network summary rather than a route list.

---

## Ship order

| Session | Steps | Note |
|---|---|---|
| 1 | R0 | Done 2026-09-12. Reshaped this file. |
| 2 | R1, R2 | Both done 2026-09-12. The relations-only scan is four minutes for all of Europe, so re-running it is never the expensive part. |
| 3 | R3 | Alone. Hierarchy, dedup and the reports. Four reporting points inside it. |
| 4 | R4, R5 | Validation-heavy, code-light. R4 has a hard gate on the comparison table. |
| 5 | R6 | First user-visible value. Ship here if you ship nothing else. |
| 6 | R7 | Route pages and Explore. Depends on PLAN.md phase C having landed. |
| 7 | R8 | One commit per activity. |

**Attribution.** All of this is OSM data under ODbL. Route pages, GPX
exports and the map need "(c) OpenStreetMap contributors" with a link to
the licence, and the elevation figures need a Copernicus DEM credit. Both
land in R6, not as an afterthought in R7. `docs/tos/data_licenses.md`
gets a row for any new source (transit_stops is still OSM; a Waymarked
Trails cross-check is not a redistribution and needs no row).
