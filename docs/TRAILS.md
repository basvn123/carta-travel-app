# The trail layer

Every published hike in the app, end to end: where 236,000 route relations
come from, what the continuity gate refuses and why, how a region's quota
decides which of them ship, what the six filters read, how a 0 to 10 rating
is built out of open data alone, and how to rebuild the whole thing from a
cold clone.

Model: **`open-signals-v2`** for the rating, **`trail_filters_v1`** for the
filters, **`region_quota_v1`** for the budget. The v1 argument is unchanged
and restated below, because every part of it was earned; what v2 adds is a
spatial budget where v1 had a country constant, two tiers where v1 had one,
and six filters where v1 had two.

This is the largest layer in the app and it was the only one without a doc.
The material existed, spread over nine module headers, `run_pipeline.py`'s
task notes and memory. This is that material in one place.

## What this layer is for

Somebody has a Saturday and a car. The question is not "which walks exist
near here", which every mapping app answers, but "which of them is worth the
drive", and that question has no free data source: AllTrails and Komoot have
no public API and forbid reuse of their reviews, Strava's heatmap is licensed
for improving OpenStreetMap and nothing else, and Instagram removed location
search in 2020. Buying an opinion is not an option and inventing one would be
worse.

So the layer answers it from what open data honestly can say, and four
decisions follow from that. Each is a design commitment, not a detail.

- **A GPX that teleports is not a route.** 142 of the first 545 published
  hikes were multi-part geometries with gaps between the parts, the worst
  552 km wide. Continuity is a hard gate: one continuous line, or the walk is
  not published. Nothing downstream is allowed to soften it.
- **Nothing here is anybody's opinion.** Every component of the rating is a
  claim a reader could go and check: a designation on a relation, a summit
  within 250 m of the line, a metre of climb from a public DEM. There is no
  review text in this layer because there is no review text anybody is
  allowed to give us.
- **A rating is fair inside its own field or it is noise.** A Dutch dune walk
  ranked against the Alps scores 4 and tells a Dutch walker nothing. Every
  component is a percentile inside a reference class: the route's own NUTS3
  region when the region has enough rows to be a fair field, its country
  otherwise.
- **A guess says it is a guess.** A grade a mapper wrote on the path and a
  grade read off a 30 m elevation model are different claims, and the wire
  carries which. Wheelchair access is never derived at all.

## The chain

```
pipeline/trails/
  ingest_osm_routes.py  Geofabrik extracts -> 236k staged route relations,
                        three streaming pyosmium passes, memory safe on the
                        4 GB France extract
  splice.py             bridges breaks short enough to be mapping artefacts
                        and stores the joined line as a repair
  repair.py             the same idea with real routing (local Valhalla),
                        where per-country tiles exist
  regionize.py          NEW  stamps rg / nuts3 / region_crosses on every
                        staged route, so the quota can be spatial
  derive_routes.py      NEW  builds routes from way-level paths for the five
                        countries with no route-relation culture
  curate.py             the selection: per-NUTS3 quota, continuity gate,
                        families collapsed, loops first, bands, two tiers
  way_tags.py           NEW  a fourth extract pass for the MEMBER WAY tags
                        the relations never carried
  elevation.py          Copernicus GLO-30 along every curated line
  scenic.py             one Overpass sweep per 1.5 degree cell, then the
                        spatial join that says what each route passes
  forests.py            NEW  named forests as AREAS, from the extracts, so
                        the tenth highlight code does not need Overpass
  trail_images.py       Commons photographs shot within 400 m of the line
  attributes.py         NEW  the six published filters, plus season, surface
                        and the three facts the retired prose knew
  crosscheck_portals.py five official portals against the OSM geometry
  validate.py           five checks -> quality_score, status routing
  regression.py         demotes published content that fell below the bar
  rate.py               the published 0 to 10 and its reason codes
  export_wire.py        the last gate, and the wire
  popularity.py         fame signals + the curation shortlists
  market_demand.py      city demand stats, for the citytrip composer
  compose_daytrips.py   composed city days (a different product, same store)
  compose_citytrips.py
  schema.py             NEW  apply a migration only when it would change
                        something (see "Scar tissue")
  describe.py           RETIRED, see "Two debts"

tools/trailslab/
  docker-compose.yml    the lab: PostGIS + pgRouting on port 5433, local only
  initdb/01..07         the schema, applied in order on a fresh container
  review/               the human approval queue, FastAPI on 127.0.0.1:8011

continent-app/
  src/lib/trails.js       loaders, the SPA-fallback guard, #trail= deep link
  src/lib/trailCards.js   the filter model the chips render from
  src/lib/trailStory.js   codes -> sentences, in six languages
  src/browse/TrailPage.jsx
  scripts/verify_trails_export.mjs
```

The lab is **local only**. It runs in Docker on port 5433 and never touches
the live Supabase project. It is a content store, not a database the app
reads: the app reads static JSON that this store produced.

## Why the store is a database and the wire is not

The `trips` table IS a derived database in the ODbL sense, so shipping it in
bulk would carry share-alike onto anything built from it. Publishing selected
finished items instead keeps the wire in produced-work territory, and every
item carries its own `attribution_text` and `source`, so the credit travels
with the content rather than living only in a footer.

That is also why a country with nothing published still gets a file with an
empty `trips` array: under `public/` a missing JSON is served as the SPA
index with status 200, so "no file" reaches the app as HTML that parses as
neither JSON nor an error. Every fetch in `lib/trails.js` checks the content
type first. This is the repo gotcha that file exists to contain.

## Ingestion: three passes, and why

`ingest_osm_routes.py` reads per-country Geofabrik `.osm.pbf` extracts. The
public Overpass API is deliberately never queried for bulk: extracts are the
bulk channel and Overpass is for the targeted sweeps further down.

What is ingested: relations with `type=route` or `type=superroute` and
`route=hiking|foot|walking` that additionally carry `network=iwn|nwn|rwn` or
a name. Superroute members of type relation resolve recursively against the
scanned pool, so a stage relation and its parent both land.

Geometry assembly is three passes because one would not fit in memory on the
4 GB France extract:

1. **relations only**, with `KeyFilter("route")` running in C++;
2. **member way node refs**, through an `IdFilter` over the ways pass one
   asked for;
3. **node locations**, into flat numpy arrays at 8 + 4 + 4 bytes per node.

Member ways are then stitched in relation order, flipping ways so consecutive
ends meet; every break starts a new segment. A second pass merges segments
that share an endpoint where exactly two segment ends meet, which is
`ST_LineMerge` semantics: it heals relations whose members are stored
unordered and leaves genuine gaps and junctions alone. The difference between
the two counts is what `gap_info` records, and it is how a later gate can
tell "stored out of order" from "actually broken".

Cross-border relations appear in every extract that clips them. The row is
keyed on `(source, source_ref)` and the longest assembled geometry wins.

Two boundary quirks inherited from Geofabrik's own cuts, recorded so nobody
rediscovers them: `great-britain` excludes Northern Ireland, which arrives
inside `ireland-and-northern-ireland` and is therefore stored as IE until
the bbox check flags it.

## Splicing: what a gap actually is

`curate.py` refuses any route whose geometry is not one continuous line. That
gate is right and it is also blunt: it threw away the Walker's Haute Route
over a **seven metre** break between two parts of its relation, along with
10,757 other routes whose every gap is under 300 m.

Those gaps are not missing legs of a walk. They are what happens when a
mapper splits a way at a road crossing and the relation loses a ten metre
connector, or when an extract clips a way at a border. The walk is continuous
on the ground; the relation is not.

So `splice.py` joins the parts in relation order with a straight connector
where **every** break is short enough to be an artefact, and stores the
result as a repair. The thresholds, and the routes that set them:

| threshold | value | why |
|---|---|---|
| longest single break | 300 m | about three football pitches. Haute Route 7 m, Glowny Szlak Beskidzki 62 m, Malerweg 179 m, Besseggen 251 m |
| most breaks | 8 | more than that is a route that was never finished. Likya Yolu has 21 |
| total bridged, absolute | 750 m | eight 290 m bridges on a 4 km walk is 2.3 km, refused |
| total bridged, share | 5% | a share cap alone punishes short routes. At 1.5% it threw out Besseggen: two 250 m breaks on 14 km is 3.6% and 500 m of ground, which is an artefact by any reading except a percentage |

Both caps, because either alone gets a class of route wrong.

A straight connector is a claim about ground nobody checked, so it is said
out loud: the count and total length ride in `repair_info`, `export_wire`
ships them as `bridges`, and the trail page says the route has short bridged
breaks. Z is carried through from the real points either side, so ascent and
the profile stay valid without re-sampling; only the distance grows.

`repair.py` is the same idea done properly, routing across a gap with a local
Valhalla instance, and is the better answer where per-country routing tiles
exist (1.8 GB each; Switzerland has them). Both write to `trip_repairs` and
both are read the same way, so a country that later gets tiles can have its
splices replaced by real routing without anything downstream changing.

A repair is only used while it still matches the relation it was built from:
every reader joins on `repair_info->>'source_geom_md5' = md5(...)` of the
current geometry. A re-ingest that changes a line silently invalidates its
repair rather than publishing a stale one.

## Regions: the budget stopped being a constant

The first wave published up to **150 routes per country**. Twelve countries
landed on exactly 158 published rows and twenty-nine on exactly 150 hikes,
which is a constant deciding the tail rather than the data. Spain and Belgium
got the same budget, and inside Spain the Pyrenees competed with Castile for
the same 150 slots.

`regionize.py` stamps every staged route with the region spine's ids before
the gate runs, and `curate.py` spends a **quota per NUTS3 region** instead:

```
trail  per NUTS3  4 + 8 * protected_share + 6 * relief_norm   clamp 3..45
```

That formula is `pipeline/regions/quotas.py`'s, read from there rather than
copied, so the number the gate spends and the number the coverage audit
checks against are the same number computed once. Summed over the 1,475 level
3 regions that hold at least one staged route, the quotas ask for about
17,000; the pool does not fill all of it.

**The old cap is now a floor, not a ceiling, and that correction was forced by
the first run.** The regions programme's rule is that the quota replaces the
flat cap as the SELECTION ORDER while the country cap still binds, and that
lifting the cap is each layer brief's work. Read as a ceiling instead, the
quota does not raise coverage evenly: it raises it enormously where a country
has many NUTS3 regions and CUTS it where a country has few. The first run
published Cyprus at **12**, down from 101, because Cyprus is one NUTS3 region
and the formula clamps a region at 45. Luxembourg fell to 19 and Estonia to
30.

The mechanism is the UNIT, not the country's size, and stating it that way is
what makes it predictable. A quota is spent per unit, so a country's budget is
(number of units) times (target per unit). Cyprus is ONE NUTS3 region and
forty-six coastal stretches: for beaches it gets forty-six budgets and for
trails it gets one, so the per-region ceiling of 45 becomes a NATIONAL ceiling
for trails and is invisible to beaches. Every layer whose unit is `nuts3`
(trail, cycling, lake) is exposed to this in a one-region country; the layers
budgeted per coast stretch or per GMBA range are not, because those subdivide
independently of administrative geography.

The inputs make it bite sooner: `protected_share` is OSM protected-site
density and `relief_norm` is GeoNames settlement DEM spread, and the
opportunity artifact labels both as proxies pending Natura 2000 and a GLO-30
sweep. Cyprus reads as low-relief and lightly protected on those two while
having the Troodos and a real trail network. So the country target is

```
target = max(sum of its region quotas, min(150, what the country actually has))
```

where "what it has" is counted AFTER the family collapse, because a country
with 300 stages of one path has one walk. Germany rises to 4,666; Cyprus
stays where it was. When the floor raises the target, every region's quota is
scaled by the same factor rather than the difference being dumped into
whichever region ranks best: the point of the quota is WHICH rows fill the
budget, and that survives the budget being raised.

A country sitting exactly on the floor is cap-bound, and both `curate.py` and
`verify_trails_export.mjs` say so by name and exclude it from the
shared-count check. Any OTHER count shared by three or more countries is a
new constant and fails the harness. Reporting the two together would let a
real regression pass as the known one.

**And a quota is a PRIORITY, not a ceiling.** That is the second correction
the first run forced, and it is a different fault from the floor. The picker
originally refused a row once its region was at quota in every pass,
including the final best-of-the-rest fill, so a country's budget could sit
unspent while the gate declined good walks: Belgium published 509 against a
target of 652 with 4,340 candidates available, Greece 324 against 548,
Austria 410 against 562. Every region had hit its own number while the
country budget went unspent.

So passes 1 to 3 (famous, loops, distance bands) spend the quotas and
interleave, which is what makes every region's allocation lead and keeps the
region-first spread; only the final fill pass ignores the region quota, with
the grid cell cap still applying so "wherever it is left" never becomes forty
more walks in the one massif that maps best. The beach, lake and mountain
layers reached the same correction independently and in the same afternoon,
which is reasonable evidence the original reading had it backwards.

Placement rules, all of them the assignment contract's rather than this
layer's:

- **The midpoint of the route's LENGTH owns it.** Not the bbox centre, which
  for a horseshoe route sits in a valley the walk never enters, and not the
  start, which would hand every cross-border route to whichever country the
  mapper began in.
- **`region_crosses` lists everything the line passes through**, so a route
  appears on each region's page even though only one region budgets for it.
- **Assignment is stored, not recomputed.** `export_wire` reads the `rg`
  column rather than re-deriving it, exactly as every other layer's export
  reads what its enrich stored. The gate that spent a region's quota and the
  file that ships the row cannot disagree about which region it is in.
- **A region the opportunity table has not measured is quota-exempt, never
  quota-zero.** No reading is not a bad reading.

`regionize.py` runs batched, not per row: `assign_line()` is the reference
implementation and called 236,000 times it is an afternoon, so the module
reads midpoints from PostGIS and does one geopandas spatial join per spine
layer. `--verify N` holds a sample of the batch result against the reference
lookup, and 60 of 60 agreed when this was written. Run it after touching
either path.

## Curation: which walks earn a slot

`curate.py` turns 236,000 staged relations into a published list. Nobody is
going to read 236,000 rows, and the first 545 that reached the app were
picked on `quality_score` alone, which measures whether a relation is well
FORMED, not whether the walk is any good.

**The hard gate** is continuity, in the WHERE clause rather than in a scoring
term, because a route whose GPX teleports is not a worse route, it is not a
route. Two ways to pass: the relation is already one continuous line, or
`splice.py` has stored a joined line for it.

**Families collapse to one slot.** Bulgaria's first list was ST424, ST427,
ST701 through ST710: ten consecutive stages of one long-distance path. The
fold is a union-find over TWO keys rather than one with a fallback, because
each catches what the other misses:

- the **title** key collapses "Nordkalottruta Etapp 4" and "Etapp 17" to
  `nordkalottruta`. It misses the Sultans Trail, whose stages are named after
  their endpoints.
- the **article** key collapses every stage tagged
  `wikipedia=en:Sultans Trail`. It SPLIT the Norwegian route, because
  somebody gave each of its 19 stages its own wikidata item.

- the **E path** key collapses every stage of E1 to E12 by its `ref`. Both
  the others miss them: a stage is named after the towns it runs between
  ("E4: Sokobanja - Jalovik izvor"), so the title key gives each its own
  family, and the stages are not individually articled, so the article key
  gives them nothing. Serbia published SEVEN separate E4 rows before this
  existed, which is the ST701-to-ST710 fault wearing a different tag. Folded
  per country, not per continent: E4 across Serbia and E4 across Greece are
  two walks a traveller chooses between.

Sharing any key puts two routes in one family, so a route split across
several tagging styles still takes one slot. A fourth, softer key caps how
many of one operator's numbered series a country may show (`SERIES_CAP = 4`):
it does not merge, it only stops a foundation that numbers the forty stages
of one path from taking forty slots through inconsistent tagging.

**The order of claims on a slot**, strongest first:

1. **Famous routes**, and never blocked by either spatial cap. A route
   somebody was looking for by name is not a coverage decision. Capped at a
   share of the target, because uncapped it took all 150 in Germany and
   France and left Germany with zero loops out of the 13,775 it has: fame
   buys a guaranteed share of the list, not the list. Inside that share, a
   route on the country's own recall list (`FAMOUS`, a hand-written net over
   OSM's names) outranks one merely tagged with a wikidata id, which is what
   put the Rennsteig back.
2. **Loops**, the shape people actually want, round-robin across regions so
   the loop budget is not spent entirely in whichever region maps loops best.
3. **Distance bands**, 16 / 26 / 30 / 20 / 8 percent across
   `<5 / 5-10 / 10-20 / 20-40 / 40+` km, so a country's list is not forty
   6 km strolls because short routes are the most numerous.
4. **Best of the rest**, so a region with an unusual length profile still
   reaches its quota.

Everything that used to be a constant against 150 is now a SHARE of whatever
the region quotas add up to, so the same balance holds whether a country's
target is 17 (Malta) or several thousand (Germany): loops 40%, famous 30%
(floor 8, ceiling 120), treks 8% (floor 4, ceiling 60).

**Two spatial caps, answering different questions.** The region quota is the
budget: how many walks this area is worth, from how much of the thing it has.
The 0.35 degree grid cap (`CELL_CAP = 3`) is the spread inside it: not all of
them in one massif. The region quota is hard; the cell cap is soft and
loosens when a region cannot fill its quota any other way, because a second
walk in the same valley beats a short list.

**Length bounds.** Below 2 km there is nothing to describe. Above 45 km it is
a multi-day trek, which enters only as a famous one and only up to the trek
share, so treks do not take slots from the day walks people browse.

Everything selected moves to `approved`; anything that was published or
approved and did NOT survive re-selection drops back to `needs_review`, so
the app's list is exactly this pass's opinion.

## The E paths, and family pages

E1 to E12 are the European long distance paths. The European Ramblers
Association publishes no data of its own (its own page sends walkers to
Waymarked Trails for GPX), so an E path is nothing more exotic than an OSM
`route=hiking network=iwn` relation, which this layer already held and was
already publishing without ever saying so.

Three things make them findable:

- **They are guaranteed a slot.** `is_epath()` matches a `ref` of exactly
  E1..E12, optionally with a national suffix ("E1 DE", "E4-GR"), and treats
  the route as famous. Matched on the ref and anchored, never by substring:
  `_squash` strips separators, so a loose "e1" needle would match E10, E11,
  E12 and anything whose name contains those two characters in a row.
- **Their stages collapse to one slot**, by the E path family key above.
- **The family has a NAME**, so the row that took the slot can say what it
  stands for. `family_display()` returns the E number for an E path rather
  than the shortest stage title, because otherwise the family a reader can
  follow across a continent would be labelled "Bad Meinberg to Horn".

The family page is that row's page: it names the path, says how many stages
it stands for, and is reachable from the card that represents it. That is
what "the family page exists even when the stages do not each get a slot"
comes to in a layer whose unit is a walk rather than a route network. The
country file also ships a `families` array, deduped by NAME rather than by
the internal key, so one path is listed once.

Estonia's E11 stands for 33 stages, Latvia's for 30, Lithuania's for 34, and
every one of E1 to E12 appears somewhere in the wire.

## Two tiers

| tier | what it is | in the wire |
|---|---|---|
| `r` rated | the walk we are recommending. Scored, ranked, what a card shows | `trips[]`, with `rating` |
| `l` listed | continuity and geometry sanity passed, named, deduped, in region, and NOT scored | `listed[]`, with **no rating key at all** |

A listed row exists because a region page in Moldova (3 published) or Kosovo
(14) was empty, and an empty page says "this app does not cover here" when
the truth is "nothing here cleared the bar". The rating key is **absent**
rather than null, which is the only reliable way to guarantee the app cannot
render a number nobody earned: `export_wire.validate_listed()` fails the
export if a listed row carries `rating`, `reasons` or `score` in any
spelling, and a failure leaves the previous wire standing.

`rate.py` excludes tier `l` from its query AND clears any rating left on a
row that has since been demoted, because a stale number in the column is how
the promise breaks.

A region is left empty by the rated gate in three ways, and the listed pass
draws from the whole candidate pool rather than from family heads so it
catches all three: every candidate is a long route nobody famous walks; every
candidate was folded into a family whose best member sits in the next region;
or the region's quota went to routes that turned out to be elsewhere.

Listed rows ship `why: [{"k": "unrated_coverage"}]`, the same shape the
beach, lake and mountain layers use, so `lib/trailStory.js` renders the same
sentence in all six languages and a listed trail card matches a listed peak
card on a region page.

## Countries with no relation culture

Moldova published 3 walks, Kosovo 14, North Macedonia 16, Malta 30, Albania
34. None of those is a quota problem and raising a ceiling does not touch
them: the countries have paths on the ground and in OpenStreetMap, and almost
nobody has wrapped them in a `type=route` relation. The ingest reads
relations, so it reads almost nothing.

`derive_routes.py` reads the WAYS instead: every
`highway=path|footway|track|bridleway|steps`, clustered where they physically
connect, staged as ordinary trips with `derived_route = true` and
`source = 'osm_ways'`.

They then face exactly the same gates as everything else. The continuity gate
is the same gate. The quotas are the same quotas. `validate.py` scores them
the same way. The only difference is that the wire says `derived_route`, and
the review UI shows it, because "somebody assembled this from six named path
segments" is a weaker claim than "a mapper published this as a route".

Clustering, and why it is shaped the way it is:

- **Seeds** are named or graded `path`, `track` or `bridleway`. Not
  `footway`: a named footway is a pavement carrying a street name, and
  seeding on those grows a whole city's pavement network. A footway may still
  JOIN a cluster a path started, which is how a trail crossing a village
  stays whole.
- **Two growth passes.** The first takes only ways sharing the seed's folded
  name, plus unnamed connectors under 300 m, which is what rejoins a path
  split at a road crossing without swallowing the road. The second, over what
  the first left, takes any named or graded neighbour and is marked
  `derived_join: any-named` in the tags because it is the weaker claim.
- **A way only stops being available when a cluster it is in actually
  ships.** Getting that wrong made the two-pass rule pointless the first
  time: pass one marked every way it touched as used, including the 2,030
  Moldovan clusters under 500 m that were then thrown away, so pass two
  started with nothing to grow through and found two routes.
- **The continuity gate does most of the filtering.** A branching blob of
  city pavement assembles into a dozen segments and is dropped, the same way
  a broken relation is.
- **A branching cluster is trimmed to its longest continuous run**, not
  dropped. That is the continuity gate applied earlier rather than relaxed:
  nothing is bridged and nothing is invented, and `gap_info.trimmed_from`
  records that the published line is part of something larger. Dropping
  clusters whole cost 110 routes across the five countries, including every
  candidate in Malta.
- **A derived route that runs alongside an existing relation is rejected.**
  The relation wins: somebody published it as a route, which is a stronger
  claim than one we assembled.

`derived_route` reaches the trail PAGE, in the quiet provenance block beside
the "this route has short bridged breaks" note, and never the card. The rule,
agreed with the regions layer and worth stating because it decides the next
field somebody asks for: **provenance that changes what a walker should
expect on the ground goes on the page; provenance about our own decision
process goes nowhere a reader sees.** "Nobody signed this as one route"
changes what to expect on a 9 km walk in Albania. "We did not score this
because the photo pass had not run" does not.

## Elevation

`elevation.py` samples the Copernicus GLO-30 DSM (30 m, global, free with
credit) along every curated line and fills `distance_m`, `ascent_m`,
`descent_m`, `duration_min`, per-vertex Z and a stored profile. SRTM is
deliberately not used: it stops at 60N and would lose most of Norway.

Method, per part: resample every 30 m (the DEM grid spacing) and bilinear
sample. Then clean, in this order, because each step exists for a failure the
one before it caused:

1. short exact-zero runs flanked by land are DEM water pixels at coastlines
   and are interpolated away (`COAST_RUN_MAX = 3` samples,
   `COAST_LAND_M = 5`);
2. nodata gaps fill by linear interpolation;
3. a trip missing more than 20% of its samples keeps NULL metrics, status
   `low_coverage`, rather than a number built from a fifth of a hill.

**The smoothing, which the brief asked to have written down.** Raw
point-to-point summation on a 30 m DSM inflates ascent badly: plus or minus
2 to 4 m of vertical noise per sample turns a flat towpath into thousands of
fake metres. Two constants prevent it, and both were calibrated against the
OSM `ascent` tags of **272 Swiss routes**, most of them official Schweiz
Mobil figures:

| constant | value | what it does |
|---|---|---|
| `SMOOTH_WINDOW` | 3 samples (about 90 m) | moving average over the sampled profile, before any climb is counted |
| `CLIMB_THRESHOLD_M` | 5.0 m | hysteresis: ascent and descent accumulate over local extrema only once the profile has moved this far, so speckle never commits |
| `GRADE_SPAN_STEPS` | 3 (about 90 m) | max gradient is the steepest SUSTAINED run, never a single 30 m step |

This pair puts the computed/tag median at **0.94**, deliberately still on the
conservative side. Heavier smoothing or a 10 m gate drops it to 0.83 to 0.86,
which understates real climb; a smaller window overstates it. The window is
what makes the climb bands in the filter mean anything.

Duration is DIN 33466, the DAV/SAC signpost standard: 4 km/h flat, 300 m/h
up, 500 m/h down, the slower of the horizontal and vertical times counted in
full and the faster one halved.

**Gotcha:** re-running the OSM ingest zeroes Z while keeping the 2D
coordinates. Stored metrics stay valid; run with `--refresh` to rebuild Z.
And the `--sync-only` splice step after an elevation pass is not optional:
elevation measures the ORIGINAL relation, so a spliced trip would otherwise
state a length shorter than the line it ships.

## Scenic features: the evidence behind a rating

`scenic.py` is one Overpass query per 1.5 degree grid cell that a curated
route actually touches, not one per country and not one per trail: about 410
cells for Europe against 6,000 trail queries, deduped ACROSS countries so the
Alps are swept once rather than once each for Austria, Switzerland and Italy.

Two radii, and the difference matters:

- **250 m**, `HIGHLIGHT_M`: what the route genuinely touches. Only these earn
  a highlight code or a name in the "what you walk past" list.
- **600 m**, `DENSITY_M`: what makes the area worth walking. This feeds the
  scenery density signal.

Kinds and their density weights run from `peak`, `volcano`, `viewpoint`,
`waterfall`, `glacier` at 1.0 down to `spring` 0.25 and `water` 0.15.
`village` is weighted **0.0** on purpose: it earns a highlight chip, because
walking through villages is a different day from walking round a reservoir,
and it earns nothing in the density signal, because Europe has a million of
them and even 0.2 each would make the densest walk in the catalogue a stroll
through the Randstad.

`amenity=drinking_water` is deliberately absent: Germany alone has tens of
thousands, they dominated the response by count, and a tap is not a reason to
choose a walk. Named springs stay, because on a hill they are.

Two performance facts worth keeping:

- **Overpass answers a query it could not finish with HTTP 200, an empty
  element list and a remark**, which reads exactly like "this cell has no
  viewpoints". `sources.overpass()` raises on the remark instead. Never call
  the endpoint directly.
- **A cell is the size of a country, so a cheap-looking selector is not.**
  Adding named woods to the sweep took a cell from 2,215 features to 12,246
  and Europe from an hour to thirteen, with both live mirrors 504ing. Before
  adding a selector, ask what it returns over an area the size of Belgium; if
  the answer is "a landcover layer", it belongs in an extract pass.
- **The join needs the `&&` line.** `ST_DWithin` on a geography cast cannot
  use the GiST index on `scenic_pois.geom`, which is a geometry index, so the
  join degraded to a sequential scan over 800,000 landmarks PER ROUTE: the
  first attempt linked twelve routes in ten minutes. Overlapping the plain
  geometry against an expanded envelope first uses the index and leaves the
  metric test with a handful of candidates. `DEG_PAD = 0.02` covers 600 m at
  every European latitude; too tight would silently drop landmarks in the
  north, which is the kind of bug that never shows up in Slovenia.

A mirror probe runs first (`live_endpoints`), because a dead public instance
is expensive in a way a fast failure is not: one endpoint was refusing TCP
for 42 s per attempt and another timing out reads at 70 s, so with three
tries and backoff a single cell spent five minutes learning what one probe
learns once. That is the difference between an hour and nine.

## The six filters

`attributes.py` derives all six, stores them on the route, and
`export_wire.filter_model()` ships the model itself in `index.json` so the
app renders chips from the data rather than from a list of its own.

### 1. Difficulty: worst segment wins

Five values: easy, moderate, hard, very hard, alpine.

The inputs are on the member WAYS, not on the relation, and the ingest never
kept them. `way_tags.py` is a fourth pass over the same extracts (already on
disk, no re-download) collecting `sac_scale`, `trail_visibility`,
`via_ferrata_scale`, `surface`, `smoothness`, `width`, `highway`,
`wheelchair`, `dog` and `tracktype` per member way, and reducing them to
**length-weighted** shares. Length weighted, not way counted, because a route
is fifty 20 m ways through a village and two 3 km ways over the pass, and
counting ways would say the village is the walk.

The grade is then the strongest of:

| input | mapping |
|---|---|
| `sac_scale` | hiking -> easy, mountain_hiking -> moderate, demanding_mountain_hiking -> hard, alpine_hiking -> very hard, the two hardest -> alpine |
| `trail_visibility` | raises a floor rather than setting the grade: bad -> moderate, horrible or no -> hard. Route finding is what people underestimate |
| `via_ferrata_scale` | any section -> at least very hard; grade 3 and up -> alpine |
| effort | distance and ascent, capped at very hard: a 60 km flat trek is a long day, not an alpine one |

**Worst segment wins with a noise floor.** A route inherits its hardest
graded section only if that section is at least 200 m long or 2% of the line.
Without the floor one mistagged 30 m scramble spur would grade a valley walk
alpine and move a country's list.

**Where nothing is tagged**, the DEM answers: max sustained gradient and
ascent per km, read hardest first (alpine at 40% or 250 m/km, very hard at
30% or 180, hard at 22% or 120, moderate at 14% or 70). A derived alpine
grade additionally needs the route to reach 1,500 m, because a 45% gradient
on a 300 m hill is a staircase in a wood.

`f.gs` says `tagged` or `derived` and the card marks a derived grade with a
tilde. A derived alpine grade is a guess and says so.

### 2. Distance

Already measured. Five bands, the same ones `curate.py` fills its quota with,
so a chip a traveller taps maps onto a slice the selection is built to
contain and no band can come back empty because the selection over-favoured
one length.

### 3. Elevation gain

Already measured. Flat under 150 m, Rolling 150 to 500, Hilly 500 to 1000,
Steep 1000 to 1800, Serious 1800 and up. The smoothing above is what makes
these honest; without it every towpath would be Hilly.

### 4. Route type

Loop, out-and-back, point-to-point, figure-eight, from the geometry in one
PostGIS query in EPSG:3035 so the buffer means metres from Marseille to
Tromso.

**The order of the tests is the whole subtlety.** An out-and-back ALSO starts
and finishes in the same place, so testing "closed" first would call every
there-and-back a loop. So: buffer the outbound half by 15 m, measure the
overlap fraction with the inbound half, and anything over 0.6 is out-and-back
before endpoints are looked at. Then a closed line that crosses itself once
inside (noding into exactly two rings) is a figure-eight; more crossings than
that is a network, not a shape with a name, and stays a loop. Then closed, or
`roundtrip=yes`, is a loop. Everything else is point-to-point.

`is_loop` stays exactly as it was and is a different question: endpoints
within 250 m, which is "can I leave the car here" and covers loop,
out-and-back and figure-eight alike.

### 5. Highlights

Ten codes: waterfall, lake, summit, viewpoint, castle, hut, gorge, coast,
forest, village. Several scenic kinds fold onto one code on purpose, because
a reader filtering for "castle" wants the ruin on the ridge too, and a filter
with eighteen values is a taxonomy rather than a filter.

Only what the route TOUCHES (250 m) earns a code. This is the single most
persuasive thing on a trail card: "waterfall, castle" is a reason to go on
Saturday and "12.4 km, moderate" is a specification.

**One of the ten is not populated yet, and the tenth needed a different door
entirely.** `village` and `forest` both need OSM kinds the sweep never asked
for. Adding them to the sweep was tried and reverted:

| | before | with wood + forest + village + cliff |
|---|---|---|
| features per cell | 2,215 | **12,246** |
| time per cell | seconds | **1.8 minutes** |
| Europe | about an hour | **13 hours** |
| the mirrors | fine | both live ones returning **504** |

A 1.5 degree cell is roughly the size of Belgium, and asking a free shared
Overpass mirror for every named wood inside one is not a targeted sweep. It
breaks this layer's own rule, stated at the top of `scenic.py`: extracts are
the bulk channel and Overpass is for the targeted sweeps.

So the forest selector is out of the sweep and `forests.py` reads the
Geofabrik extracts instead: already on disk for `way_tags.py` and the ingest,
costing nobody else anything, and re-runnable whenever those files refresh.
`village` and `cliff` stayed in the sweep, because they are node-level and
cheap, and they arrive with the next routine refresh at no extra cost.

The ten cells swept before this was measured were deleted from `scenic_pois`
rather than kept: uniform absence beats ten cells' worth of routes carrying a
chip the rest of Europe cannot have. Until `village` lands, its chip does not
render at all, because the app builds its chip row from the counts in the wire
and a value with a count of zero is not offered.

### Forests are areas, and that is the whole design

`forest` is the one highlight where the question is "does the route go
THROUGH it", not "does it pass NEAR a point". The Black Forest's centroid is
tens of kilometres from most walks inside it, so a centroid answers wrongly in
both directions: silent on a route that spends all day under its trees,
positive for one that passes the middle without entering.

So forests live in `scenic_areas` as multipolygons, and the link step joins
them by distance to the POLYGON, which is zero whenever the route is inside
it. `scenic.py` reads both tables into the same list, so the density weight,
the touched list and `highlight_kinds` know nothing about the shapes behind
them. A clone that has never run `forests.py` links points exactly as before:
`has_areas()` checks for the table rather than assuming it.

Three bounds, each with a reason:

| | value | why |
|---|---|---|
| named only | | the rule the peaks and lakes follow. The Forest of Dean is a reason to walk somewhere; an unnamed patch of trees is scenery everybody assumed |
| smallest | 5 ha | below that it is a copse, and a named copse is usually a field boundary somebody labelled |
| largest | 2,000 km2 | above that it is a region, not a place. Safe because OSM maps the famous massifs as their constituent woods, each well inside it |
| stored at | ~22 m | `ST_SimplifyPreserveTopology` at 0.0002 degrees. The only question asked is a 250 m proximity test, so metre-accurate boundaries store three orders of magnitude more precision than the answer uses. PreserveTopology, because a plain simplify can collapse a narrow strip of woodland to nothing and lose the forest rather than coarsen it |

The area test reads the UNsimplified outline, so a forest near the 5 ha floor
cannot be simplified under it and vanish.

### 6. Suitability

Family, dog, stroller, wheelchair, winter, beginner, and **tagged and derived
never merge**. The filter accepts both, because somebody looking for a family
walk wants both; the CARD says which, because "a mapper recorded that dogs
are allowed here" and "this looked gentle to us" are not the same promise.

- **wheelchair is tagged only, and nothing derives it.** It is the one claim
  in this layer that could put a person somewhere they cannot get out of.
  Claimed only when 60% of the line was surveyed for it, 80% of that says
  yes, and no segment says no.
- **dog is tagged only** for the same reason: silence about dogs is not
  permission, and a "dogs welcome" chip that turns out to be a guess is a
  wasted drive with a dog in the car.
- **stroller** is tagged when smoothness says excellent or good over 80% of a
  short route, and derived otherwise from the brief's own rule: easy grade,
  60% rollable surface, gradient under 6%, under 6 km.
- **family**, **beginner** and **winter** are derived, from distance, ascent,
  grade, visibility and the season estimate.

Coverage gates every tagged claim, because OSM tagging is wildly uneven:
dense in Germany, absent on remote alpine paths. "0% of this route is tagged
`dog=no`" is not "dogs are welcome", and `way_tags.cover` is what every
derivation reads before it reads a share.

### And four more, since we have them

**Designation** (`network`: iwn / nwn / rwn / lwn), **Waymarked**
(`osmc:symbol` present; the symbol string is not something the app can draw,
so only the fact ships), **Season**, and **Portal-verified**.

The season estimate is the mountain layer's rule, deliberately: months from
the route's top height and its latitude, `effective = ele + (lat - 45) * 55`,
banded at 900 / 1500 / 2200 / 3000 m, carried with `est: true` so the app
says "typically" and never presents it as a condition report. The same rule
in both layers is what stops a peak and the path up it disagreeing about when
the season is. The brief suggested ERA5-Land; this reuses what the mountain
layer already publishes instead, which is one fewer source to license and one
fewer number to keep in sync.

## Portals: five official cross-checks

| country | source | licence | agreement |
|---|---|---|---|
| CH | swisstopo swissTLM3D-Wanderwege | swisstopo OGD, free use with source | 92.4% |
| NO | Kartverket Turrutebasen | CC BY 4.0 | 76.3% |
| FR | IGN BD TOPO, `itineraire_autre` | Etalab Licence Ouverte 2.0 | 49.5% |
| DE | BVV Wanderwege (Bavaria only) | CC BY 4.0 | per Bavaria bbox |
| GB | Natural England National Trails (England only) | **OGL v3.0** | 95.3% |

Matching, per staged trip: sample points along the line, take the distance
from each to the nearest official geometry (geography, metres, capped at
250). Coverage at 60 m is the core signal; median, p90 and 150 m coverage are
recorded too. Names are matched by accent-folded similarity within 120 m, and
the fold maps l-with-stroke, o-slash, eszett and the ae/oe ligatures BEFORE
NFKD, because NFKD leaves those letters alone. Agreement is coverage60 >= 0.60,
or >= 0.40 with a name match; the score is 100 * coverage60 plus 10 for a
nearby name match.

**France's 49.5% is not a data-quality failure and should not be read as
one.** The French portal layer holds official ITINERARIES only, so a route in
OSM that is not one of IGN's itineraries has nothing to agree with. The
FFRandonnee's GR traces are not open and will not become so, so OSM
`ref=GR*` relations stay the source for France.

**GB is new and England-only**, and it is the strongest of the five: 182 of 191 comparable trips agree, median coverage 96%, and the Ridgeway, the South Downs Way and the North Downs Way all match the official line at 100% coverage with a median distance of 1 to 2 metres. Only 191 of Great Britain's 4,053 staged trips are comparable at all, which is right: the dataset is sixteen National Trails, not a national network. The Wales Coast Path (Natural Resources
Wales) and Scotland's Great Trails (NatureScot) are separate datasets under
separate licences and are not in this one, so the GB check is restricted to
an England bbox exactly as the DE check is restricted to Bavaria's. Otherwise
Scottish routes would collect meaningless failed checks. Licence was checked
on the dataset page before the loader was written: Open Government Licence
v3.0, commercial reuse permitted, attribution "(c) Natural England copyright.
Contains Ordnance Survey data (c) Crown copyright and database right".

Italy has no portal here: CAI's Sentiero Italia material exists but its
licence is unconfirmed, so OSM `ref=SI` relations are the safe fallback. AT
was surveyed in 2026-08: Tirol/tiris publishes bike routes but no hiking
vector layer, the OeAV Wegenetz is not open, and no other Land ships trail
geometry under an open licence.

## Validation: five checks and a ledger

`validate.py` runs five checks per staged trip, writes one `validation_runs`
row per check (append-only; consumers take the newest row per subject and
check), and computes `quality_score` 0 to 100 as the weighted mean.

| check | weight | what it asserts |
|---|---|---|
| continuity | 30 | gaps between assembled parts above tolerance, run on the repaired geometry when a fresh accepted repair exists. `osmc:status` corroborates a gap as a signal, never as a gate |
| geometry_sanity | 20 | nonzero length, no vertex jump above 2 km inside a part, bbox inside the claimed country (generous boxes plus 0.5 degrees, so border-hugging routes keep their slack) |
| elevation_sanity | 20 | recomputed distance within 25% of the OSM `distance` tag, average grade under 45%, ascent per km under 300 |
| completeness | 20 | name, network and description present in the source tags |
| difficulty | 10 | easy/moderate/hard derived from distance plus ascent with a `sac_scale` floor; contradictions between the tag and the measured terrain are flagged |
| portal | +10 | not a sixth check: `crosscheck_portals.py`'s boost, applied here too so re-validation never wipes a granted one and reruns never double-count |

**The NULL redistribution rule.** A check whose subchecks all lack data
scores NULL and its weight redistributes across the remaining checks, rather
than scoring zero. Without it, every trip the elevation pass had not yet
reached would be punished for the pipeline's ordering instead of for its own
quality, and the review queue would sort by how recently a DEM tile was
downloaded.

**Status routing touches drafts only.** A draft at or above 60 moves to
`needs_review`; a draft below 25 moves to `rejected`; anything between stays
draft. A trip a human already touched keeps its status, which is what keeps
`approved` a human-only status.

`regression.py` closes the one gap that leaves: a published trip is
re-validated like everyone else, and OSM churn or a re-ingest can turn
yesterday's good route into today's broken one, with nothing watching. It
demotes a published trip whose refreshed score falls below the same threshold
that lets a draft into the queue, to `needs_review` and never to `rejected`
or deleted: `needs_review` puts it back in front of a person with its failing
checks attached, and only a person can approve it again. A trip that merely
SLIPPED, more than `--max-drop` below its approval score but still above the
floor, stays published and is reported as a `watch` entry, because a 95 to 80
slide is worth a look rather than an eviction. Only trips re-validated inside
`--since-hours` are judged, so a stale score can never demote anything.

## The two ledgers, and their actor convention

Every status change writes to both, and the actor is what distinguishes a
machine pass from a person:

| ledger | what it is | actor examples |
|---|---|---|
| `validation_runs` | append-only machine half, one row per check per subject | `check_name` says which pass |
| `trip_reviews` | the human half, so a trip's own history explains every move | `pipeline:trails_curate`, `pipeline:trails_export`, `pipeline:trails_validate`, or a person's name from the review UI |

The review UI on `127.0.0.1:8011` remains the way a person clears a route,
and `approved` is reachable only through it or through a curation pass that
signs its own name. Curating 15,000 routes by hand was never going to happen
and shipping 545 was the alternative, so `curate.py` writes its rows as
`pipeline:trails_curate` with the gates it applied in the note. A curator
reading a trip's history can always tell a machine-curated route from a
human-read one.

Publication is a separate step from approval on purpose: `approved` means "a
person cleared this", `published` means "this is live". Keeping them apart is
what lets the review queue run ahead of a release, and what lets
`regression.py` demote live content without rewriting a curator's decision.

## The rating

Eight components, each converted to a percentile inside its reference class
before it is weighted.

| component | v1 | v2 | what it measures |
|---|---|---|---|
| scenery | 0.24 | **0.22** | weighted scenic features per kilometre, damped for very short walks |
| relief | 0.17 | **0.16** | climb rate, top height and profile spread, log-damped |
| shape | 0.16 | **0.15** | loops above there-and-back, plus a bonus for a length that fits a day |
| prominence | 0.16 | **0.14** | did anybody write about it: the wikidata/wikipedia tag, sitelinks, pageviews |
| designation | 0.14 | **0.13** | iwn / nwn / rwn / lwn on the relation |
| photos | 0.13 | **0.12** | usable Commons photographs taken ON the line |
| **variety** | | **0.05** | distinct highlight TYPES. A walk past a waterfall, a lake and a castle beats one past nine trees, and the scenery term cannot tell those apart because it sums weights |
| **surface** | | **0.03** | `surface` and `smoothness` share along the line, minus the road-walking share |

Nothing was reweighted for its own sake: the six that were there keep their
order and very nearly their size, because the model they encode was right and
only incomplete.

**Scenery is per kilometre**, not per route, or every long trek would
out-score every day loop simply by covering more ground. The +1 km damping
stops a 2 km path past one viewpoint reading as denser than anything in the
Alps.

**Surface scores nothing rather than badly where nothing is tagged.**
`attributes.py` blends the tagged share towards a neutral 0.5 by how much of
the line said anything, so a country that does not map surface sits mid-field
instead of at the bottom of a component it never had a chance at. Road
walking is then subtracted directly: it is the most common complaint about
any OSM-derived route and nothing scored it before.

**The reference class**, generalising the regions programme's fifth
invariant: a route is ranked inside its own NUTS3 region when the region has
at least **20 rows**, and inside its country otherwise. Below 20 the
percentile is measuring the shape of a handful, and a region with four routes
would publish one 9.8 and one 4.1 whatever they were like. The wire carries
`rated_within: {id, n}` so "8.4 against what" has an answer.

**The band stretch is per COUNTRY, not per class.** A weighted sum of
percentiles cannot reach its own ends (topping all eight at once does not
happen), so the raw composite ran about 0.25 to 0.70 and the first pass
published every country's best walk at 8.0 and its weakest at 5.5: the middle
of a rating, wasting the half of the scale a reader actually reads. Min-max
within the country, floor 4.0, ceiling 9.8, pad 0.12 so the floor is not
exactly the floor. Deliberately country and not region: the percentile above
is what makes a component fair inside a region, and stretching per region as
well would put a 9.8 at the top of every region in Europe. One country, one
scale, is what makes two numbers on two cards in the same list comparable.

Linear, not rank-based: rank alone would put every country's best at the
ceiling whatever the gap behind it, and the gaps are the information.

The same evidence produces `reasons`, a list of CODES with numbers that the
app turns into sentences. The wire never carries prose, so the explanation
lands in all six UI languages instead of only in English.

**A card carries three reasons, the page carries all of them** (`WIRE_REASONS`
in the export). Worth knowing before wondering why a code never appears on a
card: `varied` is page-only in practice, because a route with three distinct
highlight types by definition already has three more specific reasons ahead of
it ("2 named summits", "past Lake Bohinj", "Predjama Castle"), and those are
the better sentences. It is on 2,433 detail files and almost no cards, and
that is the right way round.

## Two debts, closed

**`describe.py` is retired.** It composed from the same numbers the facts row
already prints, in a script's voice, naming countries by ISO code, and
`TrailPage` had stopped reading it: `trailStory.js` composes every line from
structured fields instead. It kept exactly three things the fields did not
know, and all three are now fields:

| was scraped out of prose | is now |
|---|---|
| "signposted as CBE" | `waymark_ref`, from the OSM `ref` tag |
| "passes X within 800 m" | `passes[]`, from `popularity.py`'s anchors, nearest per folded name, rounded to hundreds with a 100 m floor |
| "published by turrutebasen" | `publisher`, from the portal cross-check |

`trailStory.js` reads the field first and falls back to its regex scrapers
only for descriptions still sitting in the lab from before the fields
existed. Those scrapers can go the day the last one does. The alternative,
pointing `describe.py` at what the page cannot compose, would have kept a
monthly job and a free-tier quota alive for three strings.

**This document.** It was the second debt.

## Scope: 43 countries

Trails alone used to publish Turkey (47) and Ukraine (150) while the
destination catalogue, beaches, lakes, mountains and trips all cover the same
43 countries and neither of those. A traveller who found a Ukrainian trail
and no Ukrainian anything else read it as breakage rather than as generosity.

Both are now out of the default scope, behind `curate.py --include TR,UA`,
and `curate.py` reopens any published rows there rather than deleting them.
The alternative, bringing four other layers to 45 countries, is a data
programme rather than a scope decision, and this brief was the wrong place to
start it. When those layers cover TR and UA, one flag brings the trails back.

## What actually shipped

The numbers, as of the export this document was written against, so a later
reader can tell drift from design.

| | before | after |
|---|---|---|
| published hikes | 5,028 | **17,619 rated + 45 listed** |
| countries | 44 (incl. TR, UA) | 42 with content, from the 43 catalogue |
| a country's count | 29 sat on exactly 150 | no count shared by three or more |
| Germany | 150 | 4,666 |
| Cyprus | 101 | 101 (quota said 12; the floor held it) |
| Moldova | 3 | 24, all from way-level paths |
| Kosovo | 14 | 100 |
| North Macedonia | 16 | 69 |
| Albania | 40 | 170 |
| level 3 regions with content | not measured | 1,475 hold a staged route |
| rows carrying a region | 0 | 17,552 of 17,619 (99.6%) |

The filters, rolled up across every country file:

```
grade        moderate 6971  hard 4320  easy 2977  very_hard 2865  alpine 271
             3,045 graded from member way tags, 14,410 derived from the DEM
route type   loop 10474  point 6149  figure8 652  out_back 127
ascent       rolling 7309  flat 7147  hilly 2021  steep 603  serious 324
highlights   summit 5816  lake 4735  castle 3850  viewpoint 3394
             gorge 1224  hut 1215  coast 638  waterfall 584
suitability  winter 8089*  beginner 7340*  family 2918*  stroller 128* / 30
             dog 83  wheelchair 6                        (* derived)
verified     1,662 routes confirmed against an official portal
derived      290 routes assembled from way-level paths
```

The suitability shape is the honest one and worth reading twice: six
wheelchair routes and eighty-four dog routes across seventeen thousand walks,
because those two are TAGGED only and almost nobody tags them. The derived
codes run into the thousands because a derivation can always be made. Putting
them in one list with one count would have implied a survey that does not
exist.

Coverage of the passes behind them, all of it complete: elevation 17,455 of
17,455, scenic features 17,455 of 17,455, member way tags 17,165 of the 17,165
routes that come from relations (the 290 derived ones carry their way tags in
`raw_tags` already, so there is nothing for that pass to read).

## Rebuilding it

```
cd tools/trailslab && docker compose up -d            # the lab, port 5433
python pipeline/trails/smoke_test.py                  # schema + 3D round trip

python pipeline/trails/ingest_osm_routes.py --refresh # quarterly, multi-GB
python pipeline/trails/splice.py                      # +10k recovered routes
python pipeline/trails/popularity.py                  # fame, for the ranking
python pipeline/trails/regionize.py --all             # rg on the whole pool
python pipeline/trails/derive_routes.py               # MD, XK, MK, MT, AL
python pipeline/trails/curate.py                      # the selection
python pipeline/trails/elevation.py --curated --evict-gb 4
python pipeline/trails/splice.py --sync-only          # NOT optional
python pipeline/trails/way_tags.py                    # member way tags
python pipeline/trails/forests.py                     # named forest areas
python pipeline/trails/scenic.py                      # Overpass + join
python pipeline/trails/trail_images.py                # Commons
python pipeline/trails/crosscheck_portals.py          # five portals
python pipeline/trails/validate.py                    # + regression.py
python pipeline/trails/attributes.py                  # the six filters
python pipeline/trails/rate.py                        # the published rating
python pipeline/trails/export_wire.py                 # the wire
```

Or through the orchestrator, which knows the dependency order and guards on
the lab being reachable:

```
python run_pipeline.py --only trails_curate
python run_pipeline.py --only trails_rate
```

Cold, the ingest is 30 GB of extracts and hours of pyosmium; the DEM pass
pulls tiles on demand and `--evict-gb` bounds what it leaves behind (the four
pilot countries alone left 15.6 GB). Warm, everything except elevation and
the Overpass sweep is minutes.

### Why a rebuild reproduces

- **Every source lands in `data/raw/<source>/` with a manifest** and is never
  re-fetched while the file exists.
- **Every pass is resumable and idempotent.** The ingest upserts on
  `(source, source_ref)`; `elevation.py` only samples trips whose elevation
  is missing or whose 2D geometry hash moved; `scenic.py` caches per grid
  cell; `trail_images.py` skips routes that already have photographs;
  `way_tags.py` skips routes that already have a summary.
- **Assignment is stored, not recomputed** (see Regions).
- **The model ships with the data.** `filter_model()` rides in `index.json`
  and `verify_trails_export.mjs` holds the app's copy against it, so a filter
  value added in the pipeline cannot go missing in the UI and one removed
  cannot leave a dead chip behind.
- **The gate runs before the write.** `export_wire` composes and validates a
  country file first; a failure leaves the previous wire standing.

## Checking it

```
cd continent-app && npm run build
node scripts/verify_trails_export.mjs
node scripts/verify_trails.mjs
node scripts/verify_trail_page.mjs
python pipeline/trails/regionize.py --verify 200
```

`verify_trails_export.mjs` asserts: the index exists and its filter model
matches `lib/trailCards.js`; every listed country file parses and every trip
carries the fields the app needs plus its own attribution; tier integrity (a
listed row carries no rating in any spelling, a rated row carries one);
region completeness (every rated row carries `rg.n3`); filter-count sanity
(the shipped facet counts equal a recount of the rows); derived-flag presence
(a `derived_route` row says so); no country's count equals a constant shared
by three or more countries; the detail file carries more geometry than the
wire and keeps its Z; the SPA fallback answers 200 text/html, which is why
every fetch checks the content type; and the data credits render.

## Scar tissue

Things this layer paid for, kept so nobody pays twice.

- **A no-op `ALTER TABLE` is not free.** `ADD COLUMN IF NOT EXISTS` still
  takes ACCESS EXCLUSIVE, which queues behind every open read AND blocks
  every read that arrives after it. One long `SELECT` plus one routine schema
  apply froze the whole lab, twice, with other passes running against the
  same database. `schema.ensure()` looks at the catalogue first and takes the
  lock only when the migration would actually add something.
- **`ST_Segmentize` adds vertices, it does not resample.** Dumping its points
  hands back every original vertex too: 110 Liechtenstein routes produced
  61,643 "samples". Walk the fraction with `ST_LineInterpolatePoint`.
- **One query over 236,000 geometries kills the server.** Merging and
  interpolating the whole pool in one statement spawned parallel workers,
  filled memory and dropped the connection, twice. `regionize.py` goes
  country by country and commits between them, so a crash costs one country.
- **A default that was right for the pilot is a silent no-op later.**
  `elevation.py --countries` defaulted to `CH,FR,NO,AT`, correct for exactly
  as long as those were the only countries with approved routes. Run after
  the layer reached 43, `--curated` printed "nothing to do" and exited 0,
  because the four pilots WERE done. It now defaults to every country that has
  curated content. A no-op that looks like success is the worst shape a
  default can have.
- **Re-curating invalidates every pass that ran on the previous selection.**
  A second `curate.py` run swapped in about 750 routes that had never been
  through elevation, `way_tags` or the scenic join, and the export shipped
  them without a climb band. The order in "Rebuilding it" is not a
  suggestion: anything after `curate.py` has to run again after `curate.py`
  runs again.
- **An idle-in-transaction session blocks DDL.** This repo runs several
  pipeline passes at once against the same lab; check `pg_stat_activity`
  before diagnosing a hang as your own.
- **A wedged lab TIMES OUT; a busy one REFUSES.** Port 5433 stays open either
  way, because the open port is only the Docker proxy on the host and says
  nothing about the VM behind it. A connection that hangs to
  `ConnectionTimeout` means the WSL VM is not scheduling and needs
  `wsl --shutdown` then a Docker restart; a connection that is refused or
  errors means Postgres itself. Four concurrent sessions on this machine
  chased the wrong cause for an hour before drawing that line. Memory
  pressure from a sibling pass (a 5 GB extract scan taking the host to 169 MB
  free) is what wedges the VM in the first place.
- **Filter BEFORE area assembly, not after.** `forests.py` on the 4.8 GB
  Germany extract held **4.9 GB** and took host free memory to 854 MB while
  four other sessions were working, which is the same condition that wedged
  the VM for everyone the day before. The cause was not the node index: it
  was assembling every multipolygon in Germany (each building outline, field
  and administrative boundary, millions of them) and discarding 99.9% in the
  callback. `FileProcessor.with_areas(TagFilter(...))` applies the filter in
  the FIRST pass, so the assembler only ever sees wood and forest relations.
  Same output, **117 MB instead of 4,933 MB**, a 42x reduction. A disk-backed
  node index for extracts over 1.5 GB helps too, but it was worth about 20%
  and the filter was worth the rest.

  The general lesson, which cost two kills of the same job: on a machine
  running several pipelines at once memory is a shared resource, and a pass
  that finishes by starving its neighbours has not finished. Watch the
  process, not just the wall clock.
- **Stopping the lab: give Postgres its grace period.** A sibling session
  compacting the WSL virtual disk stopped `trailslab-db` with a 60 second
  grace first, so Postgres exited 0 rather than being killed with the VM: no
  crash recovery on start, no torn WAL, every table intact. Killing the VM
  under a live server is how a compaction turns into an afternoon. And
  `fstrim` inside the distro before shutting down is what lets the compaction
  find the free space at all (16.55 GB returned rather than the 14 estimated);
  `wsl --manage --set-sparse true` alone returns nothing, because it only
  affects future writes.
- **Right after a restart the planner's row estimates read zero.** Count
  before concluding a table is empty; autovacuum has not been round yet.
- **Docker Desktop here is a per-user install.** It lives under
  `%LOCALAPPDATA%\Programs\DockerDesktop\`, not in Program Files, so a
  hard-coded Program Files path fails with a file-not-found that reads
  nothing like the real problem. `(Get-Command docker).Source` finds it.
- **Windows cannot put a colon in a filename**, which the region ids use.
  `fileForRegion()` mirrors the mapping and reserved device names get a
  prefix; the fare layer paid for that lesson first.
- **A missing JSON under `public/` is served as the SPA index with status
  200.** `r.ok` is true and `r.json()` throws on `<!doctype`. Check the
  content type.
- **Overpass answers a timed-out query with 200 and an empty list.** Check
  the remark.
- **NFKD leaves some letters alone.** l-with-stroke, o-slash, eszett and the
  ae/oe ligatures need an explicit fold table before normalisation.
