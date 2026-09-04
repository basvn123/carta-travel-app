# The cycling layer

The sixth content layer, and the first one whose product is not a place but a
PLAN. Everything else in the catalogue answers "where"; this answers "what are
the days".

Built as a sibling of trails, not from scratch. The PostGIS lab, the relation
stitching, the gap-splicing thresholds, the Copernicus GLO-30 sampling with
its Swiss-calibrated smoothing, the Commons photo engine and the continuity
gate are all the trails layer's, imported rather than restated. What is new is
three things: surfaces positioned along the line, a house safety metric, and
the stage planner.

---

## What this layer is for

The test it has to pass is one sentence: *plan me a cycling trip through the
nicest part of Scotland.* If a reader cannot get from that to a day by day plan
with real overnights, real surfaces and a real elevation budget, the layer is
not done. `continent-app/scripts/verify_cycling.mjs` is that sentence written
as a test, and it is the acceptance gate for the whole layer.

Two published things, deliberately kept apart:

| | what it is | where it comes from |
|---|---|---|
| **Routes** | named, signed, real-world cycle routes. The catalogue. | OSM `route=bicycle` relations, cross-checked against EuroVelo and the national portals |
| **Tours** | composed multi-day plans over those routes. The product. | `stage_planner.py`, at build time, never at request time |

The failure mode this layer exists to avoid is cycling's version of the
plausible itinerary: a 140 km day with 2,400 m of climbing that ends in a
hamlet with no bed, on a track that is grade-5 sand. Every one of those four
claims is a measurement here, and a tour that fails any of ten checks does not
publish.

---

## The chain

```
cycle_sources.py      cache-first access to every upstream
harvest_cycling.py    route=bicycle relations out of the Geofabrik extracts
splice_cycling.py     short mapping breaks bridged, thresholds from trails
enrich_cycling.py     regions, elevation, surface, safety, services, near, scenic
cycle_images.py       Commons and Geograph, anchored on the line
cycle_index.py        the published rating, ranked at home first
stage_planner.py      tours composed at build time
seed_bike_rail.py     bike-on-train policy, curated
validate_cycling.py   ten hard checks
export_cycling.py     the gate and the wire
build_cycling.py      one command for all of it
```

One command:

```bash
python pipeline/cycling/build_cycling.py
```

A cold build is dominated by the harvest (about two hours over 44 cached
extracts, most of it Germany and France) and the photo pass. A warm re-run with
`--skip-harvest --skip-photos` is minutes.

---

## Harvest: OSM is the only pan-European spine

Everything else is national and partial. `route=bicycle` relations with a
signed network (`icn`/`ncn`/`rcn`/`lcn`) or at least a name, read with pyosmium
out of the same per-country `.osm.pbf` files the trails layer already
downloaded, so cycling costs nothing extra to fetch. Overpass is never the bulk
channel; it is used only for the per-network census (`--counts`), because
taginfo blocks automated fetches.

Three kinds of relation come out of one scan, and separating them is what keeps
the catalogue honest:

- **routes** go to `cycle_routes`. The catalogue.
- **node-network connections** (`network:type=node_network`) go to
  `cycle_node_edges`, never to the catalogue. Belgium alone has 11,693 of them
  against 1,298 real routes; without this split the Netherlands would publish
  forty thousand two-kilometre "routes".
- **superroutes** are not assembled. A continental relation clipped by a
  country extract is a broken line, and the ECF GPX is better geometry anyway.
  What is kept is MEMBERSHIP: every child relation gets `carta:family_ref`
  stamped on it, so EV6's German section knows it is EV6.

### way_spans, the thing that is not in the hiking ingest

A hike is a line. A cycle route is a line **made of surfaces**. Percent paved,
percent traffic free, the safety score, the bike-type facet and the stage
planner's "a touring tour may not contain grade-4 track" are all length
weighted properties of the member ways, not of the relation. And they have to
be POSITIONED: the worst surface on stage three is a different question from
the worst surface on the route.

So the harvest keeps, for every metre of assembled line, which way it came from
and what that way was tagged:

```json
{"tagsets": [{"highway": "cycleway", "surface": "asphalt"}, ...],
 "spans":   [[0.0, 158.7, 0], [158.7, 179.1, 1], ...],
 "n_ways":  412, "untagged_m": 120}
```

A tagset dictionary plus integer references, because a 900 km route crosses
four thousand ways and perhaps thirty distinct tag combinations. `enrich` reads
the spans; `stage_planner` slices them.

The one real cost of this design is that a splice changes the length the spans
are measured against, so `splice_cycling.py --sync-only` rescales them by the
length ratio whenever the stated distance moves. Run it after any elevation
pass, which measures the original geometry.

### The census

`harvest_cycling.py --counts` asks Overpass for the real per-network relation
count per country, because the brief asks for the numbers rather than a guess
and taginfo will not serve a script. `out count` returns one tiny element, so
it is cheap even against a public instance.

---

## Enrich

| attribute | how |
|---|---|
| **regions** | `pipeline/regions/assign.py`, by the midpoint of the line, plus every region crossed. Stored, never recomputed at export. |
| **elevation** | Copernicus GLO-30, sampled through `pipeline/trails/elevation.py` itself, so the smoothing discipline is literally the same code: a 3-sample moving average and a 5 m hysteresis gate, calibrated against Swiss OSM ascent tags to a computed/tag median of 0.94. What is NOT reused is DIN 33466, which is a walking rule. |
| **surface** | length-weighted over `way_spans`. Paved is the brief's set verbatim; traffic free is `highway in {cycleway, path, track, pedestrian, footway, bridleway}` or `cycleway=track`. `known_share` ships next to every share. |
| **safety** | the house metric, below. |
| **services** | sleeping, water, food, bike shops and stations within 2 km of the line, read out of the same extracts and clustered onto named places. These are the atoms the stage planner cuts at. |
| **near** | our own published beaches, lakes, peaks and trails within 5 km. Brief 08 will own this pass for all layers; cycling reads the published wires until it does. |
| **scenic** | the composite, below. |
| **photos** | `cycle_images.py`, the trails photo engine pointed at cycle routes: every candidate's camera stood within 400 m of the real line, measured with `ST_Distance` rather than against the probe that found it. |

### Safety is a house metric, and says so

There is no standard to adopt. The ECF's own OSM-based methodology computes
infrastructure ratios and **deliberately declines to define a safety score**,
so anything here is ours. Per way, length weighted:

```
penalty = road-class penalty     cycleway 0, residential 1, secondary 3,
                                 primary 6, trunk 10
        + speed penalty          over 30 km/h, up to +4
        - segregation bonus      cycleway=track, up to -1.5
score   = 10 - mean(penalty), clamped 0..10, 10 being safest
```

Only the TAGGED length counts and `known_share` ships beside the score, so a
route nobody has tagged reads as unmeasured rather than as safe. The app says
"our own measure" out loud on the page.

### Scenic, six components

`protected` (share of the line inside a Natura 2000 or Emerald site),
`views` (named summits, viewpoints, waterfalls, lakes, gorges and castles
within 500 m, per kilometre, out of the 972k-row `scenic_pois` sweep the trails
layer already did across Europe), `coast` (proximity to the EEA coastline,
decaying), `catalogue` (our own published places within 5 km), and `quiet` (the
inverse of the safety penalty).

Emerald matters as much as Natura here: the Cairngorms, the Norwegian fjords
and every Swiss pass are outside the EU designation and would otherwise score
zero. WDPA is refused outright, as the master spec requires: the UNEP-WCMC
licence is non-commercial and it is the single biggest legal trap in this
space.

`land` is the brief's "forest/water fraction", and it is the largest weight
because it is the only component that says what the ride LOOKS like rather
than what is near it. It comes from OSM land-cover polygons within 500 m of
the line (`pipeline/cycling/landcover.py`), not from the ESA WorldCover the
brief names: WorldCover is cleared but is roughly 100 GB at 10 m for Europe,
while the OSM extracts are already on disk, are vector rather than raster, and
carry the distinction that matters here. Four classes, because "forest or not"
would rank the Cairngorms with Slough:

| class | counts | why |
|---|---|---|
| `wild` | forest, wood, heath, moor, scrub, grassland, fell, glacier, wetland | full weight |
| `water` | water, reservoir, bay, strait, riverbank | full weight |
| `farm` | meadow, orchard, vineyard, allotments | HALF weight. Green and worked is not wilderness, and measured over Luxembourg `landuse=meadow` alone covers 423 km2 against forest's 953, so folding it into `wild` would have read most of lowland Europe as wilderness |
| `built` | residential, industrial, retail, commercial, quarry, landfill, aerodrome | SUBTRACTED |

`known_share` ships beside the fraction, and a corridor with almost no
land-cover tagging reads as unmeasured rather than as built-up. The polygons
are stored simplified to 50 m in EPSG:3035 only: the first version kept full
resolution in two projections and reached 14 GB across 34 countries, which is
two thirds of the whole lab for a number whose question has a 500 m tolerance.

A component with no reading drops out and the rest renormalise. Never a zero
nobody earned.

---

## The rating

Six components, weights summing to 1, each a percentile **inside the route's
own region** where the region has twelve or more routes to rank within, and
inside its country otherwise. Absolute scoring would give the Alps every high
mark and leave the Netherlands with nothing above four, which tells a Dutch
rider nothing about which Dutch route to take.

```
scenic 0.26   safety 0.20   surface 0.16
designation 0.14   services 0.14   shape 0.10
```

Nothing in it is anybody's opinion, because no opinion is legally available:
Komoot, Strava, Ride with GPS and AllTrails all forbid reuse of their ratings.
The same evidence produces `reasons`, a list of codes `cycleStory.js` turns
into sentences in all six UI languages.

---

## The stage planner

**No incumbent auto-splits a route into days.** Komoot's multi-day planner is
explicitly manual: you pick the number of days and drag the endpoints, and "add
accommodation" is what sets a boundary. Ride with GPS is the same. This is the
reason to build the layer.

Nothing is generated at request time. Tours are composed here, validated, and
published as wire.

```
pace       km/day     ascent/day
relaxed    45 to 65   <= 600 m
balanced   65 to 95   <= 1000 m
strong     95 to 130  <= 1600 m
```

1. Walk cumulative distance and **smoothed** ascent along the route. The ascent
   curve comes from the stored elevation profile rescaled so its total equals
   the route's measured ascent: the profile says where the climbing is, the
   full-resolution sampling says how much of it there is. Summing raw 30 m DEM
   differences here instead would put two thousand fake metres on a canal
   towpath.
2. Cut when either budget is reached, whichever binds first. On the Rhine that
   is always distance; in the Cairngorms it is usually ascent.
3. **Snap the cut to a service town.** Never an arbitrary GPS point. Candidates
   are towns within 8 km of the line whose position falls inside the pace band,
   scored 0.7 on services and 0.3 on how close stopping there leaves the day to
   its intended length.
4. If no service town is in reach, extend or shorten rather than invent one. If
   neither works, **the tour does not publish**.

Chains of routes are proposed only when their endpoints actually meet on the
ground, within 2 km. Two routes in the same region are not a chain: "these are
both in the Highlands" is not a plan.

### The ten hard checks

All hard. There are no soft checks in this layer, because each of these
describes something that would strand a rider at six in the evening a hundred
kilometres from a station.

| check | rule |
|---|---|
| `continuity` | one merged line, zero gaps. The trails gate, unchanged |
| `stage_budget` | no stage over its pace's kilometres or ascent cap |
| `overnight_real` | every stage end has three or more mapped beds within 8 km, or a campsite |
| `no_repeats` | no town twice unless the route is a loop returning to the start |
| `surface_fit` | the declared bike type matches the WORST surface on the tour |
| `safety_floor` | no stage below the safety floor; no stage with more than 2 km on `highway=trunk` |
| `water_and_food` | drinking water or a shop at least every 40 km |
| `bailout` | every stage end within 20 km of a station, **or** explicitly flagged remote |
| `images` | no photograph from an unresolved licence |
| `season` | months declared from the climatology; no Highland tour published as a January product |

A tour that fails any one is not published and the previous wire stands.

---

## Bike on trains

There is **no open machine-readable dataset** of which trains carry how many
bicycles. EU Regulation 2021/782 sets a floor (new and renewed rolling stock
must provide at least four bicycle spaces where practicable, and carriers must
publish their conditions) but a legal minimum is not a feed. Every operator
publishes its own policy page and none as structured data.

So `seed_bike_rail.py` is 69 hand-curated rows across 37 countries, each with
the operator's own policy URL and the date it was checked. Where a carrier's
answer genuinely differs by train, line or season the value is `varies` rather
than a confident wrong answer. `--verify` re-fetches every URL and reports
which have moved; the output says plainly that a live link is not a current
policy.

Countries with no passenger rail worth a row (Iceland, Malta, Cyprus, the
Faroes, and the microstates served by neighbouring operators) are absent on
purpose: an empty row would read as "we checked and there is no policy" rather
than "there are no trains".

---

## Routing: BRouter, and why

| engine | verdict |
|---|---|
| **BRouter** | **chosen.** Its `.brf` DSL exposes arbitrary tag-based costing directly, which is the only practical way to express "prefer quiet, paved, coastal, through the national park" as a cost function. Elevation is baked into the `.rd5` segment tiles, which are memory mapped, so the footprint is small. GPL. |
| Valhalla | strong elevation handling and native isochrones, but a Europe tile build wants 64 to 128 GB. Add later, for isochrones, if the planner needs them. |
| GraphHopper | a Europe multi-profile graph with elevation is about 170 GB. |
| OSRM | no elevation in the cost model at all. Wrong tool. |

Three house profiles ship in `tools/brouter/profiles/`, because they are part
of the model and the model ships with the data:

- `carta-touring` paved, quiet, comfortable. Unpaved is expensive, trunk roads
  are refused.
- `carta-gravel` accepts grade1 to grade3 track and neutral surfaces, but
  relaxes nothing about traffic. Its ceiling matches `BIKE_ALLOWS` in
  `validate_cycling.py` exactly; a profile that routed over grade-4 would
  produce tours the gate then refuses.
- `carta-scenic` weights protected areas, water and signed routes heavily and
  buys detours with them. Its road ladder is deliberately not normalised to 1.0
  at its best, because a profile that refuses to spend distance cannot find a
  coast road that runs the long way round a sea loch.

`python tools/brouter/prepare.py --country GB --up --wait` stages only the
5-degree segment tiles that country needs and starts the stack on 127.0.0.1.

---

## Licence posture

ODbL is this layer's backbone and there is one real consequence to design
around. A rendered map tile or a static image is a **produced work** and may be
licensed however we like. But a route-details response and a GPX export are
**database extracts**, and the OSMF's own produced-work guideline names GPX as
the paradigm case.

So the wire splits every route file in two:

```json
{"osm":   {"geometry": ..., "tags": ..., "license": "ODbL 1.0",
           "attribution": "Cycle route data (c) OpenStreetMap contributors, ODbL"},
 "carta": {"surface": ..., "safety": ..., "scenic": ..., "services": ...,
           "score": ..., "reasons": ...}}
```

`osm` is the extract and the credit is inside the object, so it cannot be
separated from the data. `carta` is original work layered on top, and
share-alike attaches to the OSM facts rather than to it. `lib/cycling.js`'s
`gpxCredit()` is the only place the GPX exporter reads that string from, so no
exporter can quietly drop it. Tours reference route ids rather than restating
geometry, which keeps the composition on our side of the line.

This is the same posture the trails layer already settled and exactly how
Komoot, Strava and Ride with GPS operate. Not a blocker; a structure to keep
clean from day one rather than untangle later.

---

## A photograph we cannot credit does not ship

`export_cycling.py` drops any photograph whose licence requires attribution
and whose author is empty, before it can reach a card. Not a repair, a GATE:

> A missing credit costs US a picture, never a reader a false notice.

The reasoning is that "CC BY-SA 3.0" printed under a photograph with nobody
named is **the credit removed and the licence notice kept**, which is worse
than shipping no photograph at all, because it looks like compliance. It also
recovers by itself: if the name turns up on Commons later the photograph
returns at the next export with nobody needing to remember, which repairing
the stored data cannot do.

This layer had one such row of 1,186, a Commons-hosted Geograph upload. The
number is small because Geograph carries the photographer in a field the
harvester reads; the lake wire had 29 and mountains 33, which are older
Commons uploads with an empty `Artist` and the name sitting in `Attribution`
or `Credit` instead.

**The decision is not made here.** `pipeline/photos/credit.owes_credit` is the
single answer for every layer, and this layer imports it rather than deciding
twice. Two things it gets right that the licence-string test written here
first did not:

- It is a **whitelist of exemptions**, so an unrecognised licence fails
  CLOSED. The original test asked whether a licence begins with `cc by`, which
  is true of everything in this layer today and false of GFDL, which requires
  attribution too.
- It reads a `no_attribution_required` flag stamped at HARVEST time from
  Commons' own `AttributionRequired` field, which beats any string test, and
  that flag is written only when the answer is "nothing is owed" so the
  existing backlog cannot silently become exempt.

The division of labour, which is the general form: the harvest decides when
the metadata is in hand and the request is already paid for; the gate reads
the answer. Parsing a licence at export time was always the fallback.

---

## Tiers

Every published row carries `t`:

| `t` | meaning | score | photo bar |
|---|---|---|---|
| `r` rated | clears the score gate (5.4) and the photo gate | shown | 2 or more, one strong |
| `l` listed | exists, named, deduped, in region, under one gate | **key absent entirely** | 1, or 0 |
| `e` editorial | a person vouched for it | absent | as listed |

A listed row has no `score` key. Not `null`, not `0`: absent, because the app
cannot render what is not there and that is the only reliable way to guarantee
a number nobody earned is never shown. Listed rows live in their own `listed`
array in the country file so a screen has to opt in to showing them, and
`lib/cycling.js` strips a score off any row that arrives with one anyway.

Publication is by **region quota**, not country cap:
`quotas.published_target(region, 'cycling')` is `2 + route_km / 60`, clamped to
2..30. The country ceiling survives only as a sanity check far above the quota
sum, and the export warns rather than silently trims if it is ever hit.

---

## The wire

```
public/cycling/
  index.json          countries, counts, the model blocks, the attribution,
                      and the names of all ten checks
  {CC}.json           routes (rated), listed (no score key), tours
  route/{id}.json     the osm block and the carta block
  tour/{slug}.json    stages, overnights, surfaces, bail-outs
```

A country with nothing published still gets a file with empty arrays. Under
`public/` a missing JSON is served as the SPA index with status 200, so "no
file" reaches the app as HTML that parses as neither JSON nor an error.

---

## Rebuilding it

```bash
# everything
python pipeline/cycling/build_cycling.py

# one country, from what is already harvested
python pipeline/cycling/enrich_cycling.py --countries GB
python pipeline/cycling/cycle_index.py --countries GB
python pipeline/cycling/stage_planner.py --countries GB
python pipeline/cycling/validate_cycling.py --countries GB
python pipeline/cycling/export_cycling.py --countries GB
```

The lab must be up: `cd tools/trailslab && docker compose up -d`.

`--countries` is ISO2 everywhere EXCEPT `harvest_cycling.py`, which takes
Geofabrik slugs. `build_cycling.py` says so out loud and skips the harvest
rather than silently harvesting all of Europe for a one-country rebuild.

---

## Checking it

```bash
cd continent-app
node scripts/verify_cycling.mjs --wire        # the data pass, no browser
node scripts/verify_cycling.mjs               # plus the DOM pass
```

The wire pass IS the Scotland acceptance test. It reads the published files
and checks every clause of section 6 of the brief: five stages inside the
balanced band, five named overnight towns with three or more beds each,
per-stage surface and safety, a rail bail-out named for every stage or an
explicit remote flag, a summer season that excludes January, four or more
photographs from checked hosts, cross-layer links, and a Highlands scenic
median above the central belt's.

---

## Deliberate deviations from the brief, and why

**ERA5-Land is not the season source; NASA POWER is.** The brief names
ERA5-Land. Brief 04 retired WorldClim over its non-commercial licence and
landed on the NASA POWER 2001-2020 normals, which are a US Government work with
no reuse restriction and are already cached for 3,038 places. Same variables,
same resolution class, already cleared. Adding a third climate source for one
field would be a new key, a new cache and a new licence row to justify one
array of months.

**Spatial Hub Scotland is recorded as gated, not used.** It publishes its
Cycling Network under OGL v3 and serves it only through a GeoServer WFS that
answers an anonymous `GetFeature` with 403 Forbidden. `cycle_sources.PORTALS`
records that as a status with the reason and the contact address rather than
working around it. Scotland's ground truth comes from the Sustrans National
Cycle Network instead, which now carries the Scottish NCN itself: the Spatial
Hub dataset says so in its own description.

**ESA WorldCover is not sampled.** The scenic score's land-cover component
would need 10 m rasters for Europe, which is roughly 100 GB for one of five
components. It is absent, so the component drops and the remaining four
renormalise, which is what invariant 6 prescribes. Corine at 100 m is the
cheaper way in if the component is ever wanted.

**The stitch has a segment cap.** `MAX_STITCH_SEGMENTS = 1500`. Merging
segments rebuilds the endpoint index every pass, so the work grows with the
square of the segment count, and Germany's regional networks include relations
with thousands of unordered members. A route in four thousand pieces is not one
the merge was going to rescue; it fails the continuity gate either way.

---

## What the first real run found

Great Britain, 1,941 routes enriched end to end, is the layer's first honest
answer about itself. Three findings are worth keeping.

### The continuity gate is the binding constraint, not the scoring

Of 103 GB routes long enough to be a tour, **95 are not one continuous line**
after `ST_LineMerge`, even after splicing. British `route=bicycle` relations
are far more fragmented than hiking ones: gaps of 350 to 650 m are common,
above the 300 m the trails splice bridges, and several routes have 10 to 31
parts against its 8-gap limit. In Scotland specifically, 14 of 18 tour
candidates fail here, including NCN 1 Dundee to Tain, the John Muir Way, the
Border Loop and both long EuroVelo 12 sections.

Those thresholds are imported from `pipeline/trails/splice.py` rather than
restated, and the first instinct on seeing 95 of 103 refused is to wonder
whether 300 m is simply too tight for cycling. **It is not, and the data says
so plainly.** Every Scottish tour candidate that fails continuity, measured:

| route | km | parts | largest gap | total gap |
|---|---|---|---|---|
| NCN 78 area route `75` | 159 | 12 | 1.4 km | 3.5 km |
| EuroVelo 12 (one UK section) | 127 | 5 | 12.0 km | 12.1 km |
| Gallovidian Gravel | 309 | 10 | 14.7 km | 68.8 km |
| NCN National Route 76 | 208 | 19 | 16.9 km | 35.1 km |
| Border Loop | 432 | 15 | 48.0 km | 213.6 km |
| John Muir Way | 208 | 7 | 95.5 km | 199.2 km |
| NCN 1 Dundee to Tain | 503 | 34 | 165.7 km | 374.5 km |

The SMALLEST largest-gap in Scotland is 1,356 m, four times the splice bound,
and the median is tens of kilometres. These are ferry crossings (Bute, the
Hebrides, the whole coastal run of EuroVelo 12) and genuinely absent sections,
not connectors a mapper forgot. A threshold that admitted them would be
drawing a straight line across the Sound of Bute and calling it a day's ride.

**So the way to raise the count is routing, not thresholds**: BRouter across a
real gap instead of a straight line, which is what `tools/brouter/` is
configured for, plus explicit ferry legs for the crossings that are genuinely
part of the route.

### The safety metric reads road class, and road class does not mean the same thing everywhere

The Hebridean Way scores 3.9 and is refused. Measured: 224 km of its 296
tagged kilometres are `highway=primary`, which the brief's own anchor prices
at 6, and 83 km of that carries `maxspeed=60 mph`. The metric is doing
precisely what it was specified to do.

It is also, in this one case, describing the A865 across Barra, the Uists and
Lewis, which is a single-track road with passing places and some of the
lightest traffic in Britain. The tags that would tell those apart are not
there: on those stretches OSM carries only `highway`, `surface`, `oneway`,
`maxspeed` and `smoothness`. No `lanes`, no `width`, no `passing_places`.

So the reading stands and the refusal stands, and the limitation is named
rather than tuned away. If `lanes=1` or `passing_places=yes` coverage ever
improves in the Hebrides, that is the signal to fold in; inventing a
"remoteness" discount without one would be putting a thumb on the scale.

### The scenic score does not yet answer "the nicest part of Scotland", and the reason is precise

The acceptance test asks for a Highland route to out-score a same-length one
through the central belt. Measured, the best of each **ties at 6.2**, and the
component breakdown says exactly why:

| | NCN 78, Highlands, 80 km | NCN 754, central belt, 94 km |
|---|---|---|
| protected | **0.502** | 0.002 |
| views | 0.376 | **0.729** |
| coast | **1.000** | 0.804 |
| catalogue | **absent** | 0.833 |
| quiet | 0.772 | **0.999** |
| **scenic** | **6.187** | **6.174** |

NCN 754 is the Forth and Clyde canal towpath: 99% traffic free, safety 9.99.
It is a genuinely lovely ride. It is not the nicest part of Scotland.

Three structural causes, in order of how much they cost:

**1. The land-cover component is missing, and it is the one that would have
separated these two.** The brief specifies "forest/water fraction from ESA
WorldCover or Corine". WorldCover at 10 m is roughly 100 GB for Europe and was
not obtained, so the component drops and the rest renormalise, which is correct
under invariant 6 but leaves nothing measuring that one route crosses moorland
and the other passes a retail park. **This is the single highest-value thing to
add to this layer.** Corine at 100 m is the cheap way in; OSM `landuse=forest`,
`natural=wood` and `natural=water` polygons out of the extracts already on disk
are a third, ODbL-cleared route to the same number.

**2. `views` measures OSM naming density, which follows population, not
scenery.** The canal route carries 0.656 named features per kilometre against
the Highland route's 0.338. NCN 79 is the extreme case: `views` of exactly 0.0
alongside a `protected` of 0.81. Rural Scotland is under-named in OSM, not
under-scenic. Weighting a per-kilometre count of named things at 0.24 imports
that bias wholesale.

**3. `catalogue` used to penalise exactly the regions our own catalogue has
not reached.** A cross-layer component becomes a feedback loop the moment
coverage is uneven: a thin region loses a component it ought to WIN, its
weights renormalise onto components where dense regions are strong, it scores
lower, publishes less, and looks thinner still to the next join. Great Britain
publishes 4 lakes and 22 summits, all in the populated half.

This is now fixed, and the route to the fix is worth recording because the
obvious answer is wrong.

*First attempt, rejected by measurement.* Read `coverage.json` and count a
layer only where the audit says `ok`, excluding `na` (the layer does not apply
here) and `thin`/`empty` (our backlog has not arrived). Implemented, run, and
it made the Highlands WORSE: 5.2 against the central belt's 5.8, where they
had tied.

`ok` means "met its quota", not "densely enumerated", and the quota has a
floor. Measured over the current audit:

| layer | `ok` regions | of those, publishing 3 rows or fewer | quota at its `lo` clamp |
|---|---|---|---|
| mountain | 88 | **42 (48%)** | 34 |
| lake | 104 | **58 (56%)** | 22 |
| beach | 7 | 4 (57%) | 4 |
| trail | 723 | **0 (0%)** | 0 |

Highlands and Islands is `ok` for mountains on nine published summits across a
region the size of Belgium, and that is not an outlier: it is about half the
`ok` population, because `QUOTA['mountain']['lo']` is 2 and a region can clear
its quota with two rows.

**The fault is layer-dependent, and that is why it is easy to get wrong.**
Trails publishes densely (median 15 rows in an `ok` region, minimum 4) so the
audit-based rule looks perfectly sound when tested against it. Mountains,
lakes and beaches are sparse, and there the same rule substitutes our quota
model for the world. Anyone deriving this rule from the trails wire will reach
the wrong answer and see it confirmed.

*What shipped.* For a LINEAR feature no region-level status is fine-grained
enough to license "absence is evidence", so a zero here is a zero nobody
earned and therefore not a reading at all. The component drops and the
remaining scenic weights renormalise, exactly as every other absent component
in this layer does. `catalogue` can raise a score and can never lower one.

The residual bias is real and stated in the code: a route with catalogue
evidence is advantaged over one without, rather than the reverse. That is the
right direction for a bonus signal built on an admittedly incomplete
catalogue, and it is why the weight is 0.16 and not larger.

The same fault was found independently in the lakes layer, consuming this
layer's wire in the opposite direction: a lake's activity score rises when it
carries a `walks` signal, which comes from the published trails wire, so lakes
were fifteen times likelier to carry it where trails had published (33.1% in
`ok` regions, 2.2% in `empty` ones). Two layers, independently, each reading
the other's coverage as though it were the world.

**The cheapest version of the rule is a word in the copy.** This layer ships
the same catalogue-bounded join it warns about: beaches, lakes, peaks and
trails within 5 km of a route. What keeps it honest is not the data, it is
that `cycleStory.js` renders it as "Passes 3 of our PUBLISHED lakes" rather
than "Passes 3 lakes". The first is a claim about our catalogue and is true at
any coverage; the second is a claim about the world and is false wherever we
are thin. English carried the word from the start and the other five languages
did not, which is worth knowing as a failure mode of its own: the honest
phrasing was one translation away from being lost, in five of six languages,
with nothing to catch it.

The mountains layer found the same thing in its own `near` block on the same
day, where 15 of 666 rated rows name a priced town more than 60 km away, the
furthest at 89.3 km. Those are not remote mountains, they are mountains where
OUR pricing is thin, and the card survives only because it offers rather than
claims. Brief 08 writes this join into every row of five layers, so the rule
it needs is: a cross-layer count may ship as a bare number only if the sentence
rendering it names the catalogue.

**Where the rule lives, and why this file is its evidence.** The constraint
itself is in `REGIONS.md`, which names cycling under "Exercised by" because
this is the layer that ran it against real rows and measured it twice. That
cross-reference is load-bearing in both directions: the region layer publishes
constraints and consumes none of them, so it cannot falsify its own guidance,
and a rule there is an argument until a consumer reports back. The three
measurements above are what turned that particular argument into a rule, and
the rejected middle version is why the section keeps them. If you change the
`catalogue` component here, the constraint there is what you are testing
against, and `REGIONS.md` should be updated with what you find.

None of these was tuned away to make the test pass. The tie is the honest
reading of the composite as specified, minus the one input that could not be
obtained.

### The gate refuses for reasons a reader could check

Every refusal in the first run was verifiable on a map:

| tour | refused for | is it true |
|---|---|---|
| Caledonia Way, balanced | last stage over the ascent cap | 2,945 m over 191 km is 982 m a day against a 1,000 m cap. Genuinely between paces: too hilly for relaxed, too short for strong |
| Hebridean Way, balanced and strong | stage 1 safety 3.57 and 2.76 | 76% of the route is classified A road |
| Tweed Cycleway, relaxed | stage 2 ends at Smailholm Mains with one bed | it is a farm. Precisely the "hamlet with one guesthouse" the brief names |

---

## Scar tissue

**The lab crashed under concurrent harvests.** Two cycling harvests plus
another session's lakes, mountains and beaches passes put Postgres into crash
recovery. It recovered without data loss (everything committed survived), but
the running harvest kept its dead connection and then failed every remaining
country with "the connection is closed" while still reporting progress. Run one
extract-heavy pass at a time, and check `Get-Process python` before starting a
second.

**`with_locations()` is not free.** The first services sweep asked pyosmium for
a way's geometry through the location cache, which needs every node in the
extract in memory and refuses outright when NODE is not in the entity mask.
Replaced with the three-pass id lookup the route harvest already uses: keep
each way's first node reference, then resolve just those with an `IdFilter`.

**Belgium is 90 percent node network.** 13,152 `route=bicycle` relations, of
which 11,693 are junction-to-junction connections. Any filter that does not
separate them publishes a catalogue of two-kilometre fragments and calls it
coverage.
