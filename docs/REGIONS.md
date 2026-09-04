# The region layer

The unit between "beach" and "country". From Knokke the beach list used to
run 3 km, 3 km, then 135, 141, 208, 216, 225, 236, 243, 243, 244, 244, 397,
415 km, all under a header that said "Near Knokke" (the distances are the
brief's, read off the screenshot that opened 01-REGIONS-AND-COVERAGE.md,
not a measurement taken here). The cause was never a
missing radius filter: the catalogue had no unit between a beach and a
country, and a country level publish cap decided Belgium gets 2 beaches and
Spain gets 120 no matter where in Spain they are. This layer builds that
missing unit and the machinery that uses it: region ids on every published
row, per region publication quotas, a coverage audit with a work queue, and
an app that says "within a day trip of Knokke" instead of "415 km away,
near you".

## What this document promises the wire contains

Every field named below is checked by `verify_regions.mjs` against the
shipped wire, so a rename cannot leave this page pointing at something that
no longer exists. Keep the list in step when you add a pointer; the check
reads it from here rather than from a copy.

```pointers
coverage.json           quota_units
coverage.json           refreshed
coverage.json           layers
region/index.json       model.quotas.beach.hi
region/index.json       coverage_version
region/{ID}.json        listed
region/{ID}.json        editorial
region/{ID}.json        neighbours[].name
```

That closes the one gap this file used to name and not fix: prose about the
model still cannot be verified, but a pointer either resolves or fails a
check. A path existing is a fact rather than a judgement, which is the kind
of guard that does not need a guard of its own.

## Reading the numbers in this file

Two kinds of number appear below and they age completely differently.

**Invariants** are properties of the code: the quota formulas, `lo` and
`hi`, the floors, the travel band cut points, the drive model behind the
band chips, the coastal stretch target of 40 to 120 km, the ~200 seed
names. If this document and `quotas.py`, `coasts.py` or `lib/regions.js`
disagree, the DOCUMENT is wrong. They change only when somebody edits a
constant, and that edit should change this file in the same pass.

Every invariant printed below is a COPY, and nothing machine-checks any of
them against the code. `verify_regions.mjs` checks the WIRE against
`quotas.py`, which is a different pair: code and wire cannot drift, code
and this page can. That is worth stating rather than implying, because a
copy of a constant you own reads as a fact while a copy of somebody else's
reads as a quotation, and only the second one invites checking. The
duplication earns its place only while somebody keeps it in step, so treat
a number here as orientation and the module as the answer.

**Measurements** are readings taken from a wire or a build at a moment: how
many regions the spine holds, how many rows a country publishes, how many
regions sit at a clamp. Every one of them is stamped with where and when it
was read. They move whenever a layer re-exports, which during this
programme was hourly, so **a figure quoted without its vintage is unknown
rather than current.** Re-read it before relying on it.

The distinction matters most where a measurement is carrying an argument.
The count is a measurement; the reason it is being cited is usually an
invariant. "Beaches reach the clamp before lakes because 60 per stretch
over 2,666 stretches is a tighter budget than 40 per NUTS3 over 1,345
regions" survives any change in the counts; "beaches have already reached
it" does not. Writing the two in one breath is how a stale number takes a
sound argument down with it.

## What changed, and why

- **A region spine exists.** One GeoPackage holds NUTS 0..3 (2024) for 39
  countries, ONS ITL 1..3 for the UK (the UK is not in NUTS 2024, checked
  against the live GISCO files), geoBoundaries for Ukraine, Moldova and the
  microstates, LAU municipalities, coastal stretches cut from the EEA
  coastline, the GMBA mountain ranges touching Europe, the WISE river basin
  districts and the EEA's eleven biogeographical regions. Measured from
  `cache/regions/regions_index.json`, generated 2026-08-29 21:46 UTC:
  admin 2,615, lau 97,987, coast 2,666, range 1,810, basin 171, biogeo 11.
  Those move only when the yearly sources are re-fetched, but they are
  still readings: that file carries the live counts and is the thing to
  quote. (Dated from the artifact, not from recollection. The first draft
  of this line said "the 2026-08-30 build" because that is when the work
  felt like it happened, and the file disagreed.)
- **Every layer row knows where it is.** Enrich stamps `rg` (nuts3, nuts2,
  coast stretch, range, basin, biogeo, H3 r4 cell) into the cache; export
  reads it back and ships it. The export never recomputes an assignment.
- **Quotas replace flat caps as the selection order.** The beach, lake and
  mountain gates group candidates by their honest unit (stretch, NUTS3,
  range) and interleave so every region's first pick outranks any region's
  second. A quota is a PRIORITY, not a ceiling: rows past their region's
  target sort behind every region's allocation and are trimmed by the
  country cap, never dropped at the region clamp. Cutting there made the
  quota a hard ceiling, which in a country that is a single unit of the
  layer is a national one, and that is a real bug rather than a
  hypothetical: the trails layer found Cyprus, one NUTS3 region, falling
  from 103 publishable routes to a quota of 12. The country cap remains the
  only thing that decides HOW MANY; the quota decides WHICH.
- **The photo gate no longer empties the floor's pool.** The standing
  mountain bug: COUNTRY_FLOOR=8 relaxed the score, but `publishable()` had
  already deleted every peak short a photograph, so Lithuania sat at 4. Gate
  order is now score -> photo -> quota -> floor fill -> dedupe -> write, and
  photo failures fall through to the floor as `listed` candidates.
- **A third outcome exists between publish and drop.** A `listed` row is
  verified to exist, named, deduped, in region, and NOT scored: the wire
  omits the score key entirely (absent, not null), the row lives in a
  separate `listed` array a screen has to opt into, and the app renders it
  as a visibly different card with a "not scored yet" chip.
- **Coverage is audited, with receipts.** `coverage.py` writes the wire
  status per region per layer (ok | thin | empty | na with the reason) and a
  backlog CSV joining every deficit region to the specific candidates the
  gate rejected and why ("score_4.9_below_5.4", "imgs_1_strong_0"), by
  replaying each layer's own gate code over its own caches.

## The chain

```
pipeline/regions/
  region_sources.py   polite clients: GISCO, ONS ArcGIS, geoBoundaries,
                      EarthEnv GMBA, EEA datashare and ArcGIS, cache first
  build_regions.py    one command: fetch -> normalise -> index ->
                      cache/regions/regions.gpkg (+ opportunity measures)
  coasts.py           cuts the EEA coastline into 40..120 km stretches,
                      borders hard, admin seams soft, numpy ring walk
  seed_coasts.py      the human decided file: ~200 traveller's names
                      (Costa de la Luz, Cote d'Opale, the Belgian coast)
  assign.py           point/line -> RegionIds; shapely STRtree by default,
                      PostGIS behind the same signature for the trails lab
  quotas.py           the quota table, floors and applicable(); the model
                      block that ships in every index.json
  opportunity.py      how much of each thing a region actually has
  coverage.py         the audit: coverage.json + backlog CSVs + coverage.html
  export_regions.py   region/{ID}.json + region/index.json, gate before write
pipeline/oneoff/
  backfill_regions.py stamps rg onto every cached row that predates the spine
```

```
continent-app/
  src/lib/regions.js        loaders, travel bands, the scope ladder,
                            #region= deep link, the ':' -> '_' file mapping
  src/browse/RegionPage.jsx the region record: rated, listed, neighbours
  src/browse/DestinationsTab.jsx  band chips on every card, band dividers
                            in near mode, the scope aware header
  scripts/verify_regions.mjs
```

## Rebuilding it

```
python pipeline/regions/build_regions.py            # fetch + gpkg + opportunity
python pipeline/oneoff/backfill_regions.py          # once, for pre-spine caches
python pipeline/beaches/export_beaches.py           # rg + quotas + listed
python pipeline/lakes/export_lakes.py
python pipeline/mountains/export_peaks.py
python pipeline/regions/coverage.py                 # audit + backlog
python pipeline/regions/export_regions.py --all     # region pages
python run_pipeline.py --only regions               # the scheduled shape
```

Cold, the fetch is ~600 MB and minutes; the build is ~15 minutes, most of
it the LAU read and the coastline walk. Warm (sources and gpkg on disk),
build_regions is minutes and everything downstream is seconds.

### Why a rebuild reproduces

- **The cache is the snapshot.** Every source lands in cache/regions/src
  and is never fetched again while the file exists; the geoBoundaries URLs
  are pinned to release commits so the licence recorded matches the bytes.
- **Assignment is stored, not recomputed.** Enrich stamps `rg` into the
  layer caches; exports read what enrich stored, so the wire never depends
  on this module being loadable.
- **The model ships with the data.** The quota table, floors and
  applicable() rules ride in every index.json as `region_quota`
  (region_quota_v1), and verify_regions.mjs holds the wire copy against
  quotas.py.
- **The gate runs before the write.** export_regions composes and validates
  every file first; a failure leaves the previous wire standing. Same rule
  the layer exports already lived by.
- **No reading is not a bad reading.** A region the opportunity table has
  not measured is quota-exempt, never quota-zero: `applicable()` reports
  n/a with the reason, and a beach that cleared every gate in an unmeasured
  region still publishes.

## Where the data comes from

| Source | What it gives | Licence |
|---|---|---|
| Eurostat GISCO NUTS 2024 | admin spine, 39 countries, levels 0..3 | EC reuse (CC BY compatible) + EuroGeographics notice |
| Eurostat GISCO LAU 2024 | 97,987 municipalities | same |
| ONS Open Geography ITL 2025 | the UK spine (not in NUTS post Brexit) | OGL v3 + OS Crown copyright |
| geoBoundaries gbOpen | UA, MD, AD, SM, FO, MC fill | mixed per release (ODbL / PD) |
| GMBA Mountain Inventory v2 | 1,810 named ranges with hierarchy | CC BY 4.0 |
| EEA coastline for analysis v3 | the shoreline the stretches are cut from | EEA re-use |
| EEA biogeographical regions | the eleven region axis | EEA re-use |
| EEA/WISE WFD RBD 2022 | river basin districts | EEA re-use |

Rejected on licence, recorded so nobody relitigates them: GADM and
WDPA/Protected Planet, both non-commercial.

## The model

Quotas are computed from opportunity, not fiat, and the table ships in the
wire verbatim:

```
beach     per coast stretch   coast_km / 12                    clamp 3..60
lake      per NUTS3           lakes_over_5ha ** 0.5 * 1.5      clamp 2..40
mountain  per GMBA range      peaks_over_p100 ** 0.4 * 2       clamp 2..40
trail     per NUTS3           4 + 8*protected_share + 6*relief_norm  3..45
cycling   per NUTS3           2 + route_km / 60                clamp 2..30
```

That block is a COPY, reproduced because a reader meeting this layer needs
to see the model rather than go and find it. `quotas.py` is the authority
and `model.region_quota` in every `index.json` is what actually produced
the data. Note what is and is not verified: `verify_regions.mjs` checks the
WIRE against `quotas.py`, so those two cannot drift, but nothing checks
this table against either. It is the one place in this document that can
go quietly wrong while every automated check still passes, so change the
constant and this block in the same commit, and trust the code over the
page.

The floor is a different number from the quota, on purpose: the quota is
how many RATED rows a region should carry (a target the score gate still
polices), the floor is the minimum rows of ANY tier so a region page is
never empty, satisfiable by listed rows. Floor: 1 per applicable NUTS3, 3
per applicable NUTS2, country floors unchanged per layer.

**The unit is the whole design, and it decides who gets cut.** A quota is
spent per unit, so a country's budget is the number of units it has times
each unit's target. Cyprus is ONE NUTS3 region and 46 coastal stretches:
beaches there get 46 budgets and trails get one. That is why a nuts3-unit
layer (lake, trail, cycling) can find `hi` acting as a national ceiling in
a small country while a coast or range unit layer never notices. The trails
brief hit this first: Cyprus has 103 routes clearing its continuity gate
against a region quota of 12. The quota is a budget for WHICH rows fill a
country's allowance, and a layer whose unit does not subdivide a small
country needs a country floor underneath it, which is what
`max(sum of region quotas, what the country actually has)` gives.

Reading `coverage.json` alongside this: that file is keyed per NUTS3 for
every layer, but beaches gate per stretch and mountains per range, so for
those two the `quota` beside a region is a NUTS3 equivalent view rather
than the number that gated anything. A region legitimately showing more
rated rows than quota is that mismatch, not a leak. `quota_units` in the
wire names each layer's real unit.

**Which constant binds moves when the quota stops cutting.** Making the
quota a priority rather than a ceiling hands the deciding role to whatever
is next in line, so the number worth watching is not the one that was
watched before. Measured after the change, no country cap binds anywhere:

```
                                                          measured against
beach     PUBLISH_MAX 900   largest country ES 109    beaches  2026-08-30 16:33
lake      PUBLISH_MAX 400   largest country FR  74    lakes    2026-08-30 16:09
mountain  PUBLISH_MAX 300   largest country FR  40    mountains 2026-08-30 15:55
```

Those are MEASUREMENTS, not invariants, which is why each carries the wire
it was read from. Every one of them moves when its layer re-exports, and
during the v2 programme they moved hourly. Re-read them from each
`index.json` before relying on one, and treat a figure quoted without its
vintage as unknown rather than current: a stale count that reaches a
document travels further than the check that produced it, because the next
reader has no way to date it.

Mountains is the one to watch, and not for the headroom. France and Germany
both sit on exactly 40, which is the master spec's smell test for a
constant deciding an answer. It is not the cap (40 against 300); it is
`hi` in the mountain quota, clamped at 40 per GMBA range, with each of
those countries dominated by one large range. Two countries sharing a
maximum is under the spec's threshold of three and 40 rated summits in one
range is defensible, so this is a thing to watch rather than a fault. The
general lesson is the one the lake layer paid for the same afternoon: a
comment calling a constant "a sanity ceiling far above the quota sum"
stops being true the moment the quota stops summing to a cut, and a stale
note about which constant binds is worse than none.

`applicable()` keeps honesty symmetrical: a region is never held to a quota
it cannot meet. No coast and no big lakes, no beach quota; relief under
250 m, no mountain quota; Flanders is not failing at mountains.

Two opportunity inputs are still labelled proxies in the artifact itself
(`cache/regions/opportunity.json` carries a basis string per input):
relief comes from GeoNames settlement DEM spread raised by the highest
pooled peak until the GLO-30 sweep lands, and protected_share is OSM
protected site density until Natura 2000 + Emerald polygons land. The
quota formulas are the brief's, unchanged; only the inputs upgrade.

The third has upgraded. `lakes_over_5ha` was the lake harvest pool and is
now the OSM extract sweep (`pipeline/lakes/osm_water.py`, brief 04): named
water bodies with a MEASURED polygon area, which is the thing the formula
actually names, rather than the head of a Wikidata ranking. A country the
sweep has not reached still falls back to the pool, so a partial sweep
degrades one country at a time instead of emptying the measure.

### Travel bands and the scope ladder

Raw kilometres left the cards. A distance is grouped into the band a
traveller thinks in: nearby (<= 30 km, shown in km), day trip (<= 120 km,
shown as an estimated drive, tilde marked), weekend (<= 300 km), worth the
journey (beyond, shown in km again because at that range the number IS the
message). The drive time reuses the cartaRoute road model (1.3 detour,
72 km/h, 0.6 h fixed) and exists to size a chip, not to promise an arrival;
the precomputed gateway-to-row travel time matrix from the brief is future
work and the estimate is the sanctioned v1.

The near screen's header is composed from the scope that actually
answered, decided by the nearest row: "Near Knokke" (<= 30 km), "Within a
day trip of Knokke" (<= 120), otherwise the honest far phrasing with the
nearest row's region or distance. Band dividers rule the list at every
boundary, so a far row can never render under a near heading. That is the
assertion verify_regions.mjs makes, and the screenshot this programme
started from cannot come back.

## What gets published

- `public/region/index.json`: every region with counts per layer, the
  quota model block, the coverage version.
- `public/region/{ID}.json`: one file per NUTS2 region, coastal stretch
  and GMBA range: `region`, `rated` (ranked cards, each tagged with its
  layer), `listed` (no score key, separate array), `editorial` (seed picks,
  empty until the layer briefs land), `neighbours` as `{id, name, kind}`
  so a page labels its own "try next door" buttons without fetching the
  index. Windows cannot put a
  colon in a filename, so `COAST:ES-LUZ-CADIZ` ships as
  `COAST_ES-LUZ-CADIZ.json`; `fileForRegion()` in lib/regions.js mirrors
  the mapping, and reserved device names get an `R_` prefix (the fare layer
  paid for that lesson).
- An empty region still gets a file: under public/ a missing JSON is served
  as the SPA index with status 200.
- Cards are a projection, not a copy of the source row (`CARD_KEEP` in
  export_regions.py): a name, a place, a rating, one picture, the reason
  codes and the credit. The score breakdown, the gallery, the geometry and
  the per-layer detail stay on the layer's own page, which the card taps
  through to. The picture keeps its `by`, `lic`, `licUrl` and `page`,
  because the per-file Commons credit obligation travels with the
  photograph: dropping the picture is allowed, dropping its author is not.
- `public/coverage.json`: per region per layer, r / l counts against quota
  and floor, status ok | thin | empty | na with the n/a reason. A
  `--layers beach` run merges into the existing wire rather than replacing
  it, for the same reason a targeted region export must not de-index the
  rest: a one layer audit that overwrote the file would report every
  region as having no lakes, no mountains and no trails. `layers` lists
  what the wire knows about, `refreshed` what the last run recomputed.
- `reports/coverage_backlog_{layer}_{date}.csv`: every deficit region
  joined to the candidates the gate rejected and why, straight from a
  replay of the layer's own gate. `--explain <candidate_id>` prints one
  row's full trace. `reports/coverage.html` is the human read.

How to read a deficit row, because the three cases need different work and
the CSV does not label them:

  candidates listed        the gate rejected real rows and named the reason.
                           This is the work queue: raise a photo, fix a
                           name, or accept the score.
  no candidates, scored    nothing reached the gate. The pool is empty, so
  layer                    the fix is upstream (a harvest, a second spine,
                           a seed entry), not in the gate.
  no candidates, trail     means only that no examiner exists for a layer
                           whose publication path is a person. It says
                           nothing about the pool; look in the lab.

### A coverage gap must never become a scoring penalty

> **Exercised by:** cycling (brief 07), which implemented this constraint
> against real routes and measured it, twice, and whose second measurement
> is why the rule below is the strong form rather than the weak one. The
> evidence is in `docs/CYCLING.md` (its `catalogue` component), including
> the rejected middle version and all three scores; that file points back
> here, so either end leads to the other. Lakes (brief 04) adopts it next
> for its `walks` term.
>
> This layer publishes constraints and consumes none of them, so it cannot
> falsify its own guidance: a rule here is an argument until a consumer runs
> it over real rows and reports back. Every constraint in this file should
> carry a line like this one, and a constraint with no consumers named has
> not yet met data. Treat that as a claim awaiting a test, not as settled.

Brief 08 joins the layers by coordinate, and the cycling layer (07) built
the first such term ahead of it: a "catalogue" component scoring a route by
our own published beaches, lakes, peaks and trails within 5 km. Measured on
its own data, that term scores `absent` for every Highland route and 0.83
for a central-belt one, because Great Britain publishes 4 lakes and 21
peaks and they all sit in the populated half.

That is a feedback loop, and this layer is where it would be created. A
cross-layer join turns coverage into quality the moment coverage is uneven:
a thin region loses a component it ought to WIN, its weights renormalise
onto components where dense regions are strong, and its rows then score
lower, publish less, and look thinner to the next join. The Highlands are
not short of lakes; they are short of PUBLISHED lakes, which is a statement
about this pipeline rather than about Scotland.

**The constraint is stronger than "read the audit", and this document said
the weaker thing first.** The first version of this section told a
cross-layer term to trust a zero in an `ok` region and distrust it in a
`thin` one. The cycling layer implemented exactly that and measured it
against its own routes: Highlands 5.2 and central belt 5.8, WORSE than the
6.2 / 6.2 the naive version produced. The reason is that **`ok` means "met
its quota", not "densely enumerated"**. Measured here: 42 of the 88 regions
currently `ok` for mountains publish three rows or fewer, because the
mountain quota's `lo` clamp is 2. Highlands and Islands is `ok` on nine
summits across a region the size of Belgium. Reading the audit that way
stops scoring our backlog and starts scoring our quota model instead, which
is the same error one level up.

So the rule is, with the principle first because everything under it is
mechanism a reader can re-derive:

> **Degrade toward no reading, never toward a bad one.** A cross-layer term
> may only ever ADD. Absence of a neighbour is not evidence of absence in
> the world, at ANY coverage status, because no region-level status is
> fine-grained enough to license it. Drop the component and renormalise,
> per invariant 6. And do NOT test this rule against trails: it is the one
> layer dense enough to make the weak version look correct, and every
> sparse layer is where it does harm.

That last clause is why two sessions reached the wrong version
independently. The weak rule VERIFIES against the densest layer we have,
and trails is what anybody reaches for to check anything, because it is the
only layer with enough rows to check against. Measured over the same audit:

```
layer      lo   ok regions   r <= lo      r <= 3     median r   max r
mountain    2        88      25 (28%)    42 (48%)        4        20
lake        2       104      22 (21%)    58 (56%)        3         9
beach       3         7       4 (57%)     4 (57%)        3        11
trail       3       723       0 ( 0%)     0 ( 0%)       15       177
```

Read the `r <= lo` column, not `r <= 3`: a flat cut is NOT layer-neutral,
because it sits AT the clamp for beach and trail and above it for mountain
and lake, so it flatters the two layers whose `lo` is 3. (The first version
of this table quoted only the flat cut and drew the comparison from it.)
Either column carries the point, but only the first is comparing like with
like.

The load-bearing evidence is not the table at all, and it is the lake
layer's: **the gradient continues INSIDE `ok`.** Among trail-`ok` regions,
lakes carry the walks signal 14.3% where the region publishes five trails
or fewer, 26.9% at six to twenty, and 38.9% above twenty. Those regions run
from 4 to 177 trails. So a correction keyed on `empty` repairs a step in
something continuous, which is why no threshold can be the fix and why the
rule has to hold at every status.

No audit lookup at all. Present, a neighbour is evidence; absent, the
component is not a reading. It bites hardest on LINEAR features, since a
200 km route through a region holding nine published summits can pass none
of them and that says nothing about the route, which is why a point feature
asking "what is within 5 km" makes the weaker rule look correct.

Read that table in both directions. It is not only a list of layers that
get misled by a join; it is a list of layers that will MISLEAD one. Lakes is
`ok` in 104 regions on a median of 3 rows, so anything joining to lakes and
reading "none nearby" in a lake-`ok` region is reading our backlog exactly
as the lake layer was reading the trails layer's. Every layer here except
trails is sparse enough inside `ok` to do that to a consumer, which is why
the rule is stated over any status rather than per layer, and why the layer
that raises the alarm is usually also a source of it.

The residual bias is worth naming rather than hiding: rows near our
published places are still advantaged, because the term can raise a score.
What makes that acceptable is the DIRECTION OF FAILURE. When the input is
thin or stale the component goes missing rather than going to zero, so it
degrades toward no reading instead of toward a bad one, which is the whole
of invariant 6.

A region can also be permanently short for a reason no gate owns, and the
two known cases fail differently. Both are expected to keep appearing in
the audit, and a number reached by loosening a floor would report the
opposite of the truth in either.

Both figures below were measured by the TRAILS layer (brief 06) and are
quoted here, not produced by anything in pipeline/regions. Re-derive them
from that layer rather than from this file, and see TRAILS.md for their
vintage. They are recorded here because the region audit is where the
consequence shows up, as a deficit that will never close.

  Moldova, trails    2,557 named path seeds yield 25 clusters over the 2 km
                     curation floor. The constraint is that Moldovan paths
                     are short and disconnected IN OPENSTREETMAP. The fix
                     is upstream of this repo entirely.
  Malta, derived     515 seeds and 13,097 walkable ways on an island 27 km
  routes             long produce 3 clusters, all branching, all trimming
                     to a longest run UNDER 2 km. Malta's walks are
                     genuinely 1 to 2 km: the floor that stops the rest of
                     Europe publishing crumbs is what excludes them. Not a
                     data gap and not a bug, a floor calibrated for bigger
                     countries. Malta still publishes 30 hikes from real
                     relations, which is most of what it has. If that floor
                     ever moves it should move as a rule about small
                     countries, never as an exception for one.

## Deliberate deviations from the brief, and why

- **~2,600 stretches, not ~600.** The EEA shoreline at 1:100k carries
  281,719 km, over half of it Norwegian fjord and archipelago coast; 600
  stretches would mean 470 km each up north. The cut keeps stretches at a
  honest 40..120 km and lets Norway have its 629. A later outer-coast
  generalisation can merge fjord shorelines if browsing wants it.
- **Trips ship rg but keep their own gate.** A trip is a composed
  itinerary rather than a place, so it is counted by the audit and carries
  region ids, but nothing here spends a quota on it.
- **Trails adopted the quota in brief 06, not here.** Its store is the lab
  database and its publication path is human approval, so this brief left
  it at rg plus an audit count. That layer has since taken the rest:
  `curate.py` spends `quotas.published_target(n3, "trail")` per NUTS3
  instead of a flat 150 a country, it stamps rg at curation time through
  its own `regionize.py` rather than at export, and it ships `t` with a
  `listed` array of its own. (This paragraph first said "Belgium goes to
  roughly 509", correctly quoted from that layer on 2026-08-30 and
  superseded within the hour: 509 was the figure BEFORE it found its fill
  pass was refusing rows at the region quota, and Belgium landed on its
  full target of 652 once fixed. A number can be right when written and
  wrong by the time it is read, so the trails totals belong in TRAILS.md
  where they are maintained, not here where they are quoted.) It reads quotas.py
  directly, so the trail quota has one definition and it lives here. The
  audit still has no gate examiner for it, and cannot: approval is a
  person, not a function, so a trails backlog row names the deficit without
  claiming a reason.
- **Country caps still bind.** This layer changes which rows fill the cap
  (region first), not the cap itself; the counts move when the layer briefs
  raise targets with the widened photo funnel behind them. The harness
  reports cap-shaped counts as WARN, not FAIL, until then.
- **`#region=<id>`, not a `/region/<slug>` path.** The app has no router:
  tabs are state in App.jsx and every layer's deep link is a hash read once
  at boot and then stripped. A real path would need SPA rewrites that
  `vercel.json` does not carry (it has headers only) and a path-to-state
  reader that `urlState.js` does not have, and it would break the same way
  every harness navigates today. The SEO landing-page surface the brief
  wants from region pages is worth revisiting with a router, as its own
  piece of work rather than smuggled in here.
- **The coverage alert is deterministic, not 500 random coordinates.** The
  brief asks for random sampling; random sampling would break the
  byte-identical rebuild rule (invariant 1). Every level 3 region's
  representative point is asked instead, which is a superset of what the
  sample would have caught and reproduces exactly.

## Checking it

```
cd continent-app && npm run build
node scripts/verify_regions.mjs
```

The harness asserts: the region index exists and its quota model matches
quotas.py; sampled region files exist, parse, keep listed scoreless and
rated ranked; top.json files carry rated rows only; sampled layer rows all
carry rg; with a mocked location on the Belgian coast the header scope is
`nearby`, cards carry band chips, and nothing beyond the nearby band
renders above the first band divider; `#region=COAST:BE-BELGIAN-COAST`
opens the page and Escape closes it.
