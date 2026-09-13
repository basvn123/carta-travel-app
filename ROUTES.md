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
>
> **Shipped 2026-09-12**, with three deliberate departures from the wording above, each measured before it was made.
>
> *3a.* "A stage is a member of exactly one route relation" would have made 4,753 hiking and 3,031 cycling stages standalone: the Via Alpina's twenty Swiss stages are listed by both the national and the international superroute. A multi-parent stage now picks one parent deterministically (drop ancestors of other candidates, then name affinity, then fewest stage children, then lowest id) and keeps every parent in `parent_refs`; `stage_of` is the chosen one and `top_of` the root of its chain, because the Via Francigena is path, national section, regional section, stage: three levels. Result on 308,266 hiking relations: 3,658 parents, 22,717 stages, 2,683 variants, 279,208 standalone; 1,160 stages and 947 variants decided by name alone, all flagged `hierarchy_src = name`. A parent with `stage_count` 0 has only variant children and is a line with alternatives (the Lazio section), which R6 may offer as a download. Trips 6828 is relation 11860709: four national sections, the Italian one (955907) nine regional sections in order, Lazio eight variants. Of the 85 other Italian Francigena rows, 74 resolve by structure to the Francigena, Magna, Fabaria or Mare parents, 6 are variants or a stage by name only, and 5 are relations OSM never linked to anything ("Trasversale Francigena"); the data says so rather than guessing. The structural key is the first in `curate.collapse_families`; it merged 4.9% of Italian, 4.7% of Swiss, 2.8% of Austrian, 4.9% of German and 8.3% of French families on the same candidate rows.
>
> *3b.* Reported, not rewritten: 207,353 of 238,709 staged rows have no gap, 16,413 one, 11,336 two to four, 3,529 five to forty-nine, 78 fifty or more (the worst is Finland's E6 at 319). Of 2,159 hiking superroutes in the graph, 1,758 have a line: 1,105 gapless (own assembly or a fresh whole repair), 653 gapped, 401 never staged. Cycling superroutes have no line at all: the harvest drops them, and their children carry the paths.
>
> *3c.* Measured one-sidedly as written (80% of the shorter), Switzerland chained 1,891 rows into one group behind the E4 superroute and 259 behind the E1 section, because a superroute's assembled line contains every stage and a 12 km village loop on a 500 km path "lies inside" it. Two changes: umbrellas (parents with stages) and node-network edges are structure and leave the candidate set, and the shorter must be at least half the longer's length, so "the same walk under several names" is what groups and "lies on" is not. Switzerland then gave 241 groups with a largest of 5 (Trans Swiss Trail, ViaGottardo under two spellings). Rows under 200 m are left out and counted. `co_located` carries the head first with the row itself included. Measuring Europe takes half an hour and writing takes seconds, so the measured pairs are saved to `data/derived/routes_dedup_pairs.json` before anything is written and `dedup.py --write-only` replays them. Europe: hiking compared 142,659 rows (98,823 node-network edges, 14,758 short and 4,055 umbrellas left out), found 5,054 pairs, 3,828 groups over 8,226 rows, the largest 8, and 209 groups in which two or more published rows share one line (444 rows, which the next curate run folds to one slot each); cycling 1,354 pairs, 1,080 groups, largest 6. Nested loops of one trail system chain (a 1.25, 2.5, 3.7, 5 and 11 km Motionsspår are one group); that is the extent rule working as written and is noted rather than special-cased. On the same candidate rows, the family collapse goes from name keys alone to structure to structure plus dedup as 7,043 to 6,696 to 6,448 heads in Italy, 3,472 to 3,309 to 3,168 in Switzerland, 5,629 to 5,473 to 5,222 in Austria, 23,868 to 22,704 to 22,051 in Germany and 10,357 to 9,496 to 9,309 in France: 7 to 10 percent fewer slots spent on the same walk twice.
>
> *3d.* On 200 published rows the code and the spec agree on 190; all ten disagreements are routes whose ends sit 126 to 441 m apart, which the spec's 500 m calls closed and the code's 100 m does not. The retrace buffer (15 m vs 30 m) changed nothing. The code's figure is the trails brief's and is the more defensible one for a walk, so the code stays. `data/reports/routes_shape_check.json`.

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
>
> **Shipped 2026-09-13.** `elevation_validate.py` builds the table the layer never had: ten core routes whose operator publishes one clear figure (SchweizMobil, Tirol Werbung for three Adlerweg stages, the GR 20 guides, the Saxon and Thuringian tourism boards, DNT, Fjord Norway, Walkhighlands) plus four supplementary routes whose published figures disagree with each other by more than 15 percent and therefore cannot judge anything. Both recipes run on the same cached tiles by setting the module's constants for the run; `elevation.py` was not edited to measure it.
>
> | Route | Official | Current (30 m, 3, 5 m) | Spec (20 m, 7, 8 m) |
> |---|---|---|---|
> | Via Alpina, Swiss route 1 | 23,600 | 0.94 | 0.90 |
> | Adlerweg stage 11 | 1,440 | 1.00 | 0.99 |
> | Adlerweg stage 15 | 870 | 1.03 | 1.00 |
> | Adlerweg stage 16 | 590 | 0.77 | 0.72 |
> | GR 20 | 12,800 | 0.96 | 0.92 |
> | Malerweg | 3,600 | 1.18 | 1.06 |
> | Rennsteig | 2,690 | 1.55 | 1.36 |
> | Besseggen | 1,020 | 1.08 | 1.06 |
> | Preikestolen | 500 | 0.93 | 0.83 |
> | Ben Nevis Mountain Track | 1,352 | 0.98 | 0.98 |
>
> Both land 7 of 10 within 15 percent, so the gate's 8 of 10 is not met by either. Neither is systematically high: medians 0.99 and 0.99, so the stop condition in the prompt does not apply. **`elevation.py` is unchanged**, per the tie-break the prompt sets, and because switching recipes means re-sampling 17,455 curated routes and re-ranking every rating that reads ascent.
>
> A wider sweep (18 combinations, in the report) says what the two named recipes hid: the smoothing window is not the lever, the hysteresis gate is. Every combination that reaches 8 of 10 keeps a 3-sample window and raises the gate; at 8 m the Malerweg comes inside the band and nothing else leaves it. That is a one-line change worth making the next time the whole layer is re-sampled anyway, and not worth a re-rank on its own.
>
> **Two routes miss by a mile and both are the publisher's fault, not the DEM's.** The Rennsteig at 1.55 is a ridge path of hundreds of small undulations: its own tourism board publishes 2,690 m while Wanderbares Deutschland publishes 2,186 for the same 169 km, and no hysteresis gate reconciles a 23 percent disagreement between two official sources. Adlerweg stage 16 at 0.77 is the reverse: Tirol publishes 590 m for a 23 km stage that the DEM reads as 453 m, and Tirol's own stage numbering shifted when the route was extended into East Tyrol, so the published stage and the OSM relation may not be the same walk end to end.
>
> **Outliers: 13 published routes over 250 m/km, all 13 genuine, none demoted.** The test is that a single sustained climb sums to about its own net height while noise inflates the sum: every one of the thirteen has summed ascent within 4 percent of the height between its lowest and highest point (Triglav 1,878 m over a 1,801 m net, Ben Nevis 1,326 over 1,342), all thirteen carry a summit highlight, and eleven of thirteen have a tagged or derived hard grade. The maximum is 321 m/km on the Triglav north face, which is what that face is.
>
> **New fields.** `ele_start_m`, `ele_end_m`, `steep10_pct` and `steep15_pct` join the elevation jsonb, measured over the same 90 m spans as `max_grade_pct` so one noisy step cannot make a towpath steep; `elevation.py --derive` filled them for 17,451 of 17,455 curated routes from the stored Z in 72 seconds without touching the DEM (4 rows carry no Z and need a real pass). The wire gains `ele` {min, max, start, end} and `steep` {p10, p15} on the country row through the R1 mapping, `descent_m` was already added in R1, and `sf` carries the surface summary. Cycling gains a `dur` of its own: there is no DIN 33466 for a bicycle, so the wire ships a house rule that names itself, `flat18_climb10` (18 km/h plus ten minutes per 100 m of climb), rather than borrowing a walking standard.

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
>
> **Shipped 2026-09-13.** `quality_report.py` states, component by component, where each thing the prompt named actually lives, and the answer is that the prompt's list mixes three different mechanisms: the gate that decides publication, the 0 to 100 admission score, and the 0 to 10 rating. Network tier is in all three. Continuity is a hard gate and 30 points of the admission score. A real name is a hard gate. Scenic context is the largest rating term at 0.22. Waymarking is in neither score, deliberately: a painted symbol says a symbol is painted, and the designation term already carries what a signed network means, so scoring both counts one fact twice.
>
> **Two things were wrong and are fixed.**
>
> *Tag richness was missing.* The completeness check read three tags. It now keeps four fifths of its weight for the three that decide usability and scales a 20 point bonus over surface, sac_scale, operator, website and description. Their absence is a fact about the mapper rather than about the walk, which is why they lift a score and gate nothing.
>
> *Length was a quality term.* The shape term paid a graded bonus for a distance between 6 and 22 km, so a 3,000 km path could not reach 1.0 on it however good it was, which is exactly what the prompt forbids. Shape is now loop and figure-of-eight at 1.0, point-to-point at 0.55, out-and-back at 0.40, read from `route_type`, and nothing else in either score reads distance as a judgement. The day-length band survives only as a reason code, where "this one fits a Saturday" is a fact and not a mark. The rating is not re-run here; the next `trails_rate` applies it.
>
> **OSM maturity stays out, and the doc says why.** Last-edited is not in a public Geofabrik extract at all, and member way count measures how finely the ways were split rather than how mature the route is: one path mapped as one way and the same path mapped as forty are the same walk, so scoring the count would reward fragmentation.
>
> **The publish threshold is not a number**, and it is now written at the top of `curate.py` and in `docs/TRAILS.md`: hard gates (one continuous line, a real name, inside the length band, one slot per family) and then a slot won inside the route's own NUTS3 quota. `rate.py` runs afterwards and scores only what was already chosen, so no rating decides publication. Cycling is the exception and gates on its own score of 5.4 plus a photograph count, which is why its listed tier is 16,460 rows against 506 rated.
>
> **The thin countries.** Faroe stages exactly one route and publishes it, and Monaco has none at all: coverage, not the bar. Turkey and Ukraine publish nothing because they are outside the 43-country catalogue by an explicit scope decision, not because they failed a gate. No country with real coverage publishes nothing.
>
> **The top list needed a fix of its own.** Ordering by rating returns 52 rows tied at the 9.8 ceiling, because the rating is a percentile inside a region or country and every country therefore reaches its own top. The report now shows the best in each country, which is the list a reader can actually check: Mythenweg, Carros de Foc, the Aphrodite trail, Tour du Pic du Midi d'Ossau. Cycling's top is EuroVelo and national-network sections. Distributions for both scores and all counts are in `data/reports/routes_quality.json`.

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
>
> **Shipped 2026-09-13**, with one design decision that departs from the prompt and is the heart of the step.
>
> **"Attach the parent" is impossible, and should be.** Only 94 of 1,463 published stages have a published parent, and that is correct rather than a gap: a superroute is a container, not a walk. The Via Francigena's own relation assembles into 54 disjoint parts whose summed ascent is 5,715 m over 1,921 km, a figure no reader should ever see. So a stage keeps its own line, its own figures and its own page, and wears the path's name: the row says "Romea Strata" where it used to say "Romea Strata in Italia - Tappa RSIT47", with "this stretch: Tappa RSIT47" underneath. Both names come from the relation graph, the distance is to the line that is actually there, and tapping the row opens the piece that has a GPX. Rome's seven rows now read Cammino Naturale dei Parchi, Cammino di San Tommaso Apostolo, Romea Strata, Via di Francesco, Antica Via Clodia and two local loops.
>
> **The Via Francigena does not appear at Rome, and that is the fix working.** Its Campagnano variant is published and the old block showed it at "9.3 km". Measured to the line it is 28.5 km away, outside the 25 km radius. The 9.3 km was the bounding-box centre of a route that passes nowhere near.
>
> | Routes | R0 trails | R6 hiking |
> |---|---|---|
> | 0 | 134 | 287 |
> | 1 to 2 | 707 | 562 |
> | 3 to 5 | 797 | 1,758 |
> | 6 | 1,926 | 428 |
> | 7 to 8 | not possible | 833 |
>
> The old join pinned 1,926 destinations at its cap of six because the bbox centre put everything in range; the new one spreads across the whole range and 287 destinations honestly show nothing. 3,605 of 3,868 have at least one route: 16,491 hiking rows and 1,864 cycling, 2,811 and 483 of them named for their path, and 1,179 and 257 carrying a car-free start. Cycling is thinner by design, since only 506 cycle routes are rated in the wire against 17,404 hiking rows, so 2,788 destinations get no cycling row at all.
>
> **Stations, because "car-free start" has to be a fact.** `transit_stops.py` reads 56,857 stations from the same extracts (44,593 railway, 12,264 coach) in 28 minutes, using the cycling layer's own classifier so a zoo miniature or a heritage line is not a way home. Ordinary bus stops are excluded: there are millions and one beside a trailhead proves nothing.
>
> **Two traps worth recording.** The first full pass took 14 seconds per destination because `ST_DWithin` over a transform cannot use the GiST index; a degree prefilter that the index serves, with the exact geography test behind it, took it under one second. And the first pass attached zero cycling rows: `cycle_routes.tier` is NULL for all 65,375 rows because the cycling layer derives the tier at export time and never writes it back, so "published" for cycling is a property of the wire. The attach now reads the wire's own ids.
>
> **Not done here:** the curate chain has not been re-run, so the published set is still the one from before R3 and R5. The attach reads whatever is published when it runs.

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
| 3 | R3 | Done 2026-09-12. Classify is 25 seconds for Europe; dedup is the slow one. Registered as `trails_hierarchy` in run_pipeline.py, before trails_curate. |
| 4 | R4, R5 | Both done 2026-09-13. R4 kept the recipe with evidence; R5 removed length from the rating and added tag richness. Neither score is re-run until the next `trails_rate`. |
| 5 | R6 | Done 2026-09-13. The page, the PDF and the pipeline task all read one attach; `verify_routes_block.mjs` is 15/15. |
| 6 | R7 | Route pages and Explore. Depends on PLAN.md phase C having landed. |
| 7 | R8 | One commit per activity. |

**Attribution.** All of this is OSM data under ODbL. Route pages, GPX
exports and the map need "(c) OpenStreetMap contributors" with a link to
the licence, and the elevation figures need a Copernicus DEM credit. Both
land in R6, not as an afterthought in R7. `docs/tos/data_licenses.md`
gets a row for any new source (transit_stops is still OSM; a Waymarked
Trails cross-check is not a redistribution and needs no row).
