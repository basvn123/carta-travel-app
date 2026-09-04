# The lake layer

The Lakes category on the Destinations tab, end to end: where the water bodies
come from, what the index actually measures, how the swimming verdict is
decided, how the explanation on each page is written, and how to rebuild the
whole thing from nothing.

## What this layer is for

Beaches answered "where is the sea worth swimming in". Lakes answers a
different and harder question, because a lake list has to carry information a
beach list never needs:

- **Can you get in at all.** Plitvice, Morskie Oko, Strbske pleso, Skradinski
  Buk, Loch Katrine, Lago di Braies, Gruner See and most drinking water
  reservoirs in Europe forbid swimming, and every one of them appears on
  published lists of the most beautiful lakes in Europe. A layer that ranks
  them by beauty and says nothing about the rule sends people to a fence.
- **When you can get in.** A glacial tarn at 2,000 m and a shallow Hungarian
  lake are both lakes. One is swimmable for eight weeks and one for five
  months, and no single "beauty" number can express that.
- **What kind of water it is.** Lake, reservoir, lagoon, mountain tarn, crater
  lake, thermal bathing lake. The word changes what you pack.

So the layer publishes three sub scores that stand on their own (setting,
swimming, things to do), a swimming verdict with its evidence named, an
estimated season, and a hazards list, alongside the ranked score the list is
ordered by.

## The chain

```
pipeline/lakes/
  water_sources.py     the beach layer's polite clients, repointed at cache/lakes
  seed_lakes.py        the curated seed: 380 water bodies, 42 countries, and
                       the swimming rules that override every machine signal
  lake_climate.py      stage 0  CHELSA V2.1 monthly air normals, the whole of
                                Europe cropped once -> cache/lakes/chelsa/
  osm_water.py         stage 1  every NAMED water body in a country's Geofabrik
                                extract, and what is on its shore
                                -> cache/lakes/osm_CC.json
  harvest_lakes.py     stage 2  Wikidata + OSM + the seed
                                -> cache/lakes/raw_CC.json
  enrich_lakes.py      stage 3  the shortlist, in full -> cache/lakes/rich_CC.json
  lake_images.py       is this photograph OF this lake, and is it the one to
                       lead with: the subject gate, the pixel probe, the beauty
                       score borrowed from Commons' own reviewers
  lake_index.py        the model: eight components, three sub scores, the
                       swimming rule, the season estimate, the hazards, the
                       reasons
  export_lakes.py      stage 4  score, gate, fill the region and country
                                floors, validate
                                -> continent-app/public/lakes/
  build_lakes.py       all five, in order, in one command
```

```
continent-app/src/
  lib/lakes.js         the wire loader (index, top, per country, share links)
  lib/lakeStory.js     reason codes -> sentences, in six languages
  browse/LakePage.jsx  the page one card opens
  browse/DestinationsTab.jsx  the category itself
  scripts/verify_lakes.mjs    the headless check, plus a pass over the wire
```

## Reading the numbers in this document

Two kinds of figure appear below and they age differently.

**Invariants** are properties of the code: the weights, the gate thresholds,
the floors, the caps, the keep rule, the shore distances, the season model's
corrections, the number of seed entries. They change only when somebody edits
a constant, and if this document disagrees with `lake_index.py`,
`export_lakes.py`, `osm_water.py` or `enrich_lakes.py` then this document is
wrong.

**Every invariant printed below is a COPY, and nothing machine-checks any of
them against the code.** The export writes the model's own constants into
`index.json`, so the code and the wire cannot drift; `verify_lakes.mjs` then
checks the wire. Neither of those pairs is this page. So a constant and the
sentence describing it have to change in the same commit, and the duplication
is worth it only while somebody does that. It is here because a reader meeting
the layer should not have to assemble the gate from four modules.

That gap is easy to miss for a reason worth naming: a copy of somebody else's
constant reads as a quotation and invites a check, while a copy of your own
reads as a fact and never does. The quota formula that used to sit in the gate
block was the first kind, and it was the one this document had already learned
to be careful with. The weights and the gate thresholds are the second kind,
and they are the ones that had quietly been assumed covered.

**Measurements** are readings taken from a wire at a moment: how many lakes a
country publishes, how many water bodies a sweep kept, how many regions sit at
a quota. They move on every export and every re-sweep. Each one below is
stamped with the wire or the date it came from, and a figure quoted anywhere
without its vintage should be treated as unknown rather than current.

The distinction is not pedantry. "The largest country publishes 76" sat in the
gate section below as the evidence that the country cap was not binding, and
it was already wrong by two when it was written, from a different export the
same afternoon. The argument it supported was sound; the number had moved
underneath it.

## How it differs from the beach layer

The two layers share their clients, their cache discipline, their card and
most of their page. Three things are deliberately different.

**There are two spines, and the second one is the whole of v2.** Wikidata was
the only spine until 2026-08-30: two bounded passes per country, the 700 most
written about water bodies and the 250 largest. That is the right population
for Italy and the wrong one for Scotland, and the published counts said so
out loud. In the `lake_index_v1` wire, the one this brief replaced: Great
Britain 8, Ireland 9, Norway 13, Iceland 4, against the Netherlands at 60 and
Lithuania at 51, both pinned to the publication cap of the day. Those six
numbers are the DIAGNOSIS and they are historical; see below for how to read
any count in this document.

A Scottish loch wins neither ranking. It is not written about the way an
Italian lake is, and it is not large the way a Dutch engineered water is, so
it never entered the shortlist at all and no amount of re-scoring could reach
it. That is a spine problem, not a scoring problem, and it needed a second
spine rather than more seeds.

So `osm_water.py` reads the Geofabrik extract of every country and takes every
NAMED water area out of it: `natural=water`, `water=lake|reservoir|lagoon|pond`
and `leisure=swimming_area`. The public Overpass API is never asked a country
sized question, for the same reason the trails ingest does not ask it one: an
extract answers it offline, reproducibly, and without spending somebody else's
server.

How much that reaches, measured rather than quoted: the Great Britain sweep of
2026-08-30T13:52Z found 45,102 named water areas and kept 9,499; Norway's, at
14:48Z, found 74,853 and kept 26,326. Brief 04 puts Scotland alone at about
31,000 named freshwater bodies, which is the brief's figure and not one this
layer has re-derived, since the sweep is per country and does not split
Great Britain.

That is the second rule for a borrowed number, after stamping it. Attribution
alone does not stop it rotting: a correctly credited figure goes stale exactly
as fast as an uncredited one. Where the number is MAINTAINED somewhere, point
at that place instead of restating it here, so a reader gets the current value
rather than the one that was current when this was written. The region quota
below is the worked example: its formula and clamp live in
`pipeline/regions/quotas.py` and ship in every `index.json`, so this document
names where to look rather than copying the numbers. The Scotland figure has
no such home, being a one-off in a brief, which is why it is stamped and
credited instead.

The keep rule is deliberately narrow, because most of those are farm ponds. It
must have a NAME, and then any one of three things:

  - five hectares of surface, measured on the ellipsoid (pyproj's Geod) rather
    than in square degrees, because a degree of longitude in Lapland is half a
    degree of longitude in Crete and a planar cut would keep Norway's ponds
    and drop Greece's lakes;
  - a `wikidata` or `wikipedia` tag, so somebody wrote about it whatever its
    size (the Blue Eye in Albania is 0.2 ha and belongs in this layer);
  - a beach or a mapped swimming place on its shore, so somebody swims in it
    whatever its size.

The reconcile against the Wikidata rows is the brief's, in its order: the
`wikidata` tag settles it where the mapper recorded one; otherwise a centroid
within 500 m AND a surface area within 40 per cent; otherwise, where Wikidata
records no area at all and the area test has nothing to compare, a centroid
within 500 m plus names that share a distinctive word. That last clause is the
documented fallback, and it is the same standard the beach layer merges OSM
into Wikidata on.

**The shore comes out of the same pass, and it is free.** The Overpass sweep
that runs over the shortlist deliberately leaves `highway=path` out: it
returned a hundred thousand ways around Lake Constance alone. The extract pass
has no such problem, because it is reading a file. So every swept water body
carries a `shore` block counted locally: metres of walkable way inside 50 m of
the waterline, beaches, slipways, mapped swimming places, marinas, piers, car
parks, and the count of ways that say `access=private`. That block feeds the
new `shore` component, the fourth step of the swimming rule, and the shortlist
score that decides who earns a photograph.

**There is a curated seed, and it outranks the machine.** 380 entries, after
the 2026-08-30 coverage pass added 118 for the six countries thinnest against
their actual wealth of water (GB, IE, NO, IS, HR, ME). Both counts are read
from `seed_lakes.SEED`, before and after, rather than from the brief. `seed_lakes.py`
names the water bodies travel writing actually names, including the ones
Wikidata records as small and ordinary: Lago di Sorapis, Rummu quarry,
Sorvagsvatn, the Blue Eye, Lovatnet, the Fairy Pools. Every entry is pinned
into its country's list, and its `swim` column overrides every machine signal,
because a wrong "yes" is the only field in this layer that can hurt somebody.

**Every region gets an answer, and every country still does.** The country
floor of four is now a backstop rather than the coverage rule. What fills the
map is two region floors, both satisfied by `listed` rows:

  - every applicable NUTS3 region shows at least one water body. The quota
    module owns the number and the `applicable()` rule, so the layer cannot
    quietly disagree with the audit that grades it.
  - every river basin district shows at least two. A basin is where the water
    in a region actually comes from, it crosses admin borders the way water
    does, and a basin district with nothing published is a real hole in a way
    that an empty city NUTS3 is not.

Then the country floor: a country holding fewer than four RATED entries has
its own best relaxed in down to a floor score, and a CURATED entry can fill it
at any score. `index.json` records which countries were filled that way.
Nothing is invented: a country with two publishable water bodies publishes
two, and a country with none (Monaco) is listed in `absent` with the reason.

That last rule is what San Marino needed. Its one water body is a pond at
Faetano with no elevation, no area, no bathing site and a swimming ban, and it
scores 3.7 out of a model built for Alpine tarns. It is also the only inland
water the republic has, and a human put it on the list knowing exactly that.
41 of the 43 in scope countries publish on the score alone; Monaco has nothing
to publish, and San Marino publishes through the seed.

## The model

`lake_index.py`, version `lake_index_v2`. Eight components, each 0..1:

| Component | v1 | v2 | What it reads |
|---|---|---|---|
| setting | 0.30 | **0.25** | elevation, peaks, glaciers, cliffs, waterfalls, islands, forest, castles, turquoise and clear water, protection, surface area |
| swimming | 0.20 | 0.20 | the verdict first, then the estimated season length, official bathing sites, a beach or a lido on the shore, minus the hazards |
| acclaim | 0.18 | **0.13** | sitelinks, pageviews and photograph count, 60 per cent normalised within the country, 40 per cent across Europe |
| activity | 0.14 | 0.14 | kayak, sail, dive, fish, ferry, windsurf, a shore path, a cable car |
| water | 0.10 | 0.10 | the EEA bathing season class, plus clarity from the article |
| wildness | 0.08 | 0.08 | what is built within the shore radius, subtracted, with credit back for a lake you can only walk to |
| **photo** | - | **0.06** | the photo engine's beauty rank over this lake's gallery, capped the way fame is |
| **shore** | - | **0.04** | can you get to the water at all |

Two weights moved to make room, and both movements are arguments rather than
arithmetic. Setting gives way because it was the largest term and the two new
ones describe things it was silent about. Acclaim gives way because the OSM
spine added tens of thousands of water bodies with no sitelinks at all, and a
long tail deserves less of its ranking decided by how much has been written
about the head of it. Setting is still the biggest weight in the table and
acclaim is still the third.

The weight column above is a copy of `lake_index.WEIGHTS` with nothing
checking it. `verify_lakes.mjs` asserts against the wire's `model.weights`
that the table sums to one and holds both new components, so a bad edit to the
CODE is caught and a bad edit to this table is not.

**A note on the arithmetic, because the numbers are not the brief's.** The
brief's v2 table trims setting to 0.28 and acclaim to 0.16, freeing 0.04, and
then spends 0.10 on the two new components. That sums to 1.06. The score here
is `10 x (weighted sum + 0.15 x standout)` clipped at 1.0, and the gate (5.4)
and the bands (6.3 / 7.5 / 8.5) are the same numbers v1 used and the brief
keeps; a table summing to 1.06 would lift every lake by up to that margin,
clip the top, and quietly stop those numbers meaning what they meant. So the
room is taken from the same two components the brief took it from, in the same
ratio, until it is actually there. `lake_index.WEIGHTS` asserts the sum, and
`verify_lakes.mjs` re-checks it against the table that shipped in the wire.

**`shore` (new).** Is there a public way to the water, or is the lake ringed
by private land? A path along the waterline for at least 300 m, a beach, a
slipway or a jetty, a mapped swimming place, somewhere to park; against the
count of shore ways that say `access=private`, which subtracts and is capped,
because one private drive on a twelve kilometre shore is not a closed lake. In
the Alps and in Britain this distinction is real and nothing else in the model
was saying it: Loch Katrine has a tarmac path all the way round and no
swimming, Lough Tay is a private estate you can only look down on, and a
gorgeous lake you cannot reach is a different product. A lake the extract
sweep has not reached takes a documented default of 0.45, deliberately under
the mean of the swept population rather than at it, so an unswept lake cannot
outrank a swept one that was actually found to have a path.

**`photo` (new).** `pipeline/photos` already scores every published picture
for beauty and re-orders the gallery by it; until v2 that only decided WHICH
picture led. It is part of the ranking now, at the smallest weight in the
table, reading the hero at 65 per cent and the rest of the gallery at 35, and
normalised exactly the way fame is: 60 per cent standing at home and 40 per
cent across Europe. "The lakes of the country with the best photographers" is
not a ranking anybody asked for. A gallery the beauty pass has not reached
takes 0.5 rather than a zero it never earned.

`photo` is deliberately NOT part of `quality_of`, the fame-free half the
hidden gem residual is measured against. How well a place has been
photographed is the other face of how much attention it has had, and putting
it inside the quality half would smuggle fame back into the residual the gem
score exists to remove. `shore` is in it, because it is a fact about the lake.

Plus a standout bonus of 0.15 on the strongest of setting, swimming and
activity, so a lake that is exceptional in exactly one way still ranks.

**Three of those are published on their own** as `sub`, and the lake page
shows them side by side above everything else. That is the methodological
point: a cold, stunning tarn should read as 9 for setting and 2 for swimming,
not as a single 6 that hides the choice.

**Hidden gems.** `quality` (the lake with fame removed) is regressed on
`acclaim` across everything published, and each lake's residual becomes its
`gem` score: how much better it is than its own fame predicts. It never moves
the ranking. It is published so the app can offer the other list, the one a
ranking by attention buries.

## Reading another layer across a join

A cross-layer term may only ever ADD. The absence of a neighbour is never
evidence of absence in the world, at ANY coverage status, because no region
level status is fine grained enough to license it. That rule is the regions
layer's, arrived at the hard way, and this section is the lake layer's worked
example of why.

**The reframing is worth more than the rule.** This model asks "is there
somewhere to walk here" twice, from two sources, and only one of them is
honest about it. Measured on 2026-08-30, by the trail layer's coverage status
of each lake's own NUTS3 region:

| signal | trail `ok` | `thin` | `empty` |
|---|---|---|---|
| `shore.path_m` >= 300 m, from the OSM extract sweep | 78.9% | 79.5% | 69.4% |
| `walks`, from our own published trails wire | 32.4% | 18.3% | 4.2% |

The extract sweep reads every country the same way, so its answer barely moves
with somebody else's publishing. The trails wire moves by a factor of eight,
because what it actually reports is "have we PUBLISHED a walk here". So
`shore.path_m` is the walkability signal, and it was already in the model; the
trails term is the narrower and still useful claim that a named MARKED ROUTE
exists, and it earns its points on presence alone.

**Why no threshold rescues the biased signal.** The obvious repair is to
distrust a zero where the trail layer has published nothing. It does not work,
because the gradient continues INSIDE `ok`:

| trails published in the region | lakes carrying the `walks` signal |
|---|---|
| 5 or fewer | 14.3% |
| 6 to 20 | 26.9% |
| more than 20 | 38.9% |

`ok` means "met its quota", not "enumerated". Trail-`ok` regions publish
between 4 and 177 routes, median 15. A correction keyed on `empty` therefore
repairs a step in something continuous, and any expected value it uses is
itself computed from our own publishing rate, which is the quantity it was
trying not to score.

**The wrong turn, kept because it is the useful part.** The first fix here did
exactly that: a documented default where the trail layer had published
nothing, on invariant 6's "documented default" half, with a build-time
measurement, a wire field and a staleness guard against the coverage audit.
All of it was careful and none of it was right. The cycling layer (brief 07)
implemented the same idea against its own routes and measured it scoring WORSE
than the naive term it replaced; the two tables above are why. Everything
built for it was deleted, including a guard that was correct and whose only
job was to defend a mistake.

The general lesson is not about coverage. Care taken over making a correction
correct cannot tell you the correction is wrong. Only measuring what it does
can, and that needs a consumer with real rows.

**And the same trap points at us.** Anything joining to this layer inherits
it. In the audit of 2026-08-30T21:23:24Z, 104 NUTS3 regions were `ok` for
lakes; they published between 2 and 9 rows, median 3, and 58 of them were
`ok` on three rows or fewer, because the lake quota's `lo` clamp is 2. A
region can be `ok` on two lakes. So a downstream term that reads "lakes
nearby: 0" in a lake-`ok` region is reading our backlog exactly as this
section read the trails layer's, and the rule above applies to us unchanged.
Those figures are a measurement, and a stale one: `refreshed` named `trail`
only when they were taken, and this layer's own rebuild is raising them.

## The swimming verdict

The one field here that can hurt somebody, so it is resolved by a written
rule rather than by a score, in `lake_index.swim_rule()`:

1. **curated** the seed's `swim` column, if the lake is seeded. Wins outright.
2. **a prohibition** an OSM `swimming=no` or `access=no|private` on the water,
   or a ban phrase matched in the Wikipedia extract. Produces `no`, or
   `limited` when the lake ALSO holds official bathing sites, which is not a
   contradiction: it is a lake with a closed part and an open one.
3. **an official designation** one or more EEA bathing sites of type Lake or
   River within the lake's own shore radius. Produces `yes`.
4. **a mapped swimming place** OSM `swimming=yes`, `sport=swimming`, a
   `leisure=swimming_area` or a beach on the shore. Produces `yes`.
5. **a drinking water reservoir** produces `limited`.
6. otherwise **`unknown`**, which the app renders as "no swimming rule
   recorded, look for a sign" rather than as silence. On a page about
   beautiful water, silence reads as permission.

The rule is deliberately asymmetric: it takes a human or an explicit
prohibition to say no, and an official designation or a mapped swimming place
to say yes. `export_lakes.validate()` refuses to write a build where any
verdict is outside those four words, or where a lake that forbids swimming
scores anything above zero for it.

## The season estimate, and why it is labelled

There is no free, Europe wide, per lake water temperature series. ESA Lakes
CCI and Copernicus Lake Surface Water Temperature cover the big lakes, need an
account and a large download, and would still leave most of this layer
uncovered.

So the season is a **model**, and it says so everywhere it appears. It takes
the CHELSA V2.1 monthly air normals sampled at the lake's own coordinate and
applies three corrections that are physics rather than taste:

- **thermal lag**, each month is half itself and half the one before
- **solar gain**, up to about two degrees once the air is well above ten
- **depth and altitude**, deep water mixes and stays cold, and above about
  800 m the raster cell is usually lower than the lake in it

The model string rides in `index.json` under `model.season_model`. The wire
never carries a temperature series without `swim.est: true`, and the validator
refuses a build that does. Geothermal lakes get no estimate at all, because an
air temperature model says nothing useful about water heated from below.

### Why CHELSA, and why not WorldClim

WorldClim 2.1 stood here until 2026-08-30 and is licensed for NON-COMMERCIAL
use only. Carta carries affiliate links and ships a redistributable PDF that
prints monthly figures, so a non-commercial raster underneath a published
number was the clearest legal hole in the layer. The catalogue's own climate
strip had already moved off WorldClim for exactly this reason; the lake season
had not.

The brief offered two replacements and either closes the risk. ERA5-Land
monthly climatology from the Copernicus Climate Data Store is free, permits
commercial use, and is 0.1 degree; it also needs a CDS account, an API key on
the machine that builds, and a queue, which is a build that cannot run from a
fresh clone. CHELSA V2.1 is CC BY 4.0, permits commercial use with
attribution, is served as plain GeoTIFFs over HTTPS with no account at all,
and at 30 arc seconds is three times finer than the WorldClim 5 arc minute
grid it replaces. That resolution matters for exactly the lakes this layer was
worst at: a tarn at 1,900 m in a cell whose average elevation is a valley.

CHELSA is taken, and `lake_climate.py` crops the whole of Europe once into
`cache/lakes/chelsa/`, twelve int16 rasters of monthly mean 2 m air
temperature, about 115 MB. GDAL reads only the byte ranges the window needs,
so the fetch is minutes rather than the fifteen gigabytes the twelve global
files weigh. Everything after it reads a local file: no account, no queue, no
runtime API, and the cache is the snapshot exactly as the other stages have
it. The reader holds five degree tiles rather than the whole 1.2 GB stack,
because lakes arrive country by country and a sample is nearly always in the
same corner of Europe as the one before it.

The ring search in `lake_climate.sample` is not decoration: a lake IS a water
pixel and CHELSA masks large water bodies out, so the middle of Vattern and
the middle of Balaton both read nodata. Without the fallback the biggest lakes
in the layer would be the ones with no season at all.

`docs/tos/data_licenses.md` carries the CHELSA row and records the WorldClim
risk item as closed. Nothing shipped is derived from WorldClim any more;
`pipeline/harvest_climate_worldclim.py` and `cache/worldclim` are retained
only so a pre-2026-08-30 build can be reproduced.

## Rebuilding it

```
python pipeline/lakes/build_lakes.py                  # everything
python pipeline/lakes/build_lakes.py --countries SI   # one country
python pipeline/lakes/build_lakes.py --skip-climate   # the crop is on disk
python pipeline/lakes/build_lakes.py --skip-osm       # the sweep is on disk
python pipeline/lakes/build_lakes.py --skip-harvest   # re-enrich and re-score
python pipeline/lakes/build_lakes.py --skip-enrich    # re-score only
python pipeline/lakes/build_lakes.py --no-context     # leave Overpass alone
python pipeline/lakes/build_lakes.py --dry-run        # what would ship
```

The two new stages have their own entry points, because both are slow, both
are offline and neither needs re-running when the model changes:

```
python pipeline/lakes/lake_climate.py --fetch         # once, ~115 MB
python pipeline/lakes/lake_climate.py --sample 46.36 14.09
python pipeline/lakes/osm_water.py --smallest-first   # every country
python pipeline/lakes/osm_water.py --countries GB,IE
python pipeline/lakes/harvest_lakes.py --fold-osm     # merge, no re-query
```

`--fold-osm` is to the OSM spine what `--fix-seeds` is to the seed: the
Wikidata passes are the expensive half and they do not change when the extract
sweep lands, so a re-sweep costs a fold rather than a re-harvest. It drops the
rows a previous fold added before merging, so folding twice does not stack a
second copy of the same lakes.

The extract sweep parallelises cleanly over disjoint country lists, which is
how a 30 GB run fits in an afternoon:

```
python pipeline/lakes/osm_water.py --countries FR,ES,NL,AT,DK,PT,GR,SI,BA,MD &
python pipeline/lakes/osm_water.py --countries DE,PL,CZ,SE,BE,SK,HU,LT,BG,LV &
python pipeline/lakes/osm_water.py --countries SM,IT,GB,NO,FI,CH,IE,RO,RS,HR,EE,IS &
```

or through the orchestrator, which is where the cadence lives:

```
python run_pipeline.py --only lakes
```

A cold build is a day. Two things dominate it and neither is Overpass: the
extract filter (CPU, offline, roughly an hour a gigabyte of extract while the
machine is busy) and Wikimedia photographs (network, paced, about fifteen
requests a lake). A warm re-run is seconds and produces byte identical wire
files.

### The two targeted re-runs

The counts in this section are v1-era: a shortlist of 3,809, a flat 120 a
country, and roughly 1,100 published rows. Both numbers were superseded on
2026-08-30, when the OSM spine took the pool from about 4,000 to 112,719 rows
and the shortlist became region-sized rather than country-capped. The argument
is unchanged and the arithmetic moved in the direction that makes these flags
matter more, not less: a full re-photograph is now far more expensive than the
figures below suggest.

Both stages are per item idempotent, and both have a mode that spends network
only where it is needed.

```
python pipeline/lakes/enrich_lakes.py --rephotograph 2 --no-context
python pipeline/lakes/enrich_lakes.py --context-published --no-images
```

`--rephotograph N` re-shoots only the lakes holding fewer than N photographs,
which is what to run after changing the candidate rules. Adding Wikidata's P18
as a source rescued lakes the image gate had dropped; re-photographing all
3,809 shortlisted water bodies (the v1 shortlist, a flat 120 a country)
to reach them would have been hours of
somebody else's bandwidth for nothing.

`--photos-published` re-shoots the lakes already in `public/lakes`, and only
those. The strict picker costs about fifteen requests a lake, so running it
over the whole shortlist to improve the published cards would be an
hour of Wikimedia's bandwidth spent on rows nobody will ever open.

A COLD build needs neither flag: `build_lakes.py` photographs every
shortlisted lake with the strict picker in one pass, so every picture it
publishes carries its evidence. The two flags exist for improving a cache that
already exists, and there the published set is a moving target: tightening the
picker drops some lakes and lets others in, so converging takes

```
python pipeline/lakes/enrich_lakes.py --photos-published --no-context
python pipeline/lakes/export_lakes.py
python pipeline/lakes/enrich_lakes.py --photos-published --no-context
python pipeline/lakes/export_lakes.py
```

The second round only re-shoots the lakes the first round's export promoted,
so it is short. `scripts/verify_lakes.mjs` asserts the end state: every
published photograph names the evidence that let it in.

`--context-published` sweeps the shore only for the lakes already in
`public/lakes`, which on a warm re-run is about a quarter of the shortlist and
all of what a traveller actually sees. The shore sweep is the expensive half
of the stage (one Overpass query per twelve lakes, radius in kilometres,
against an endpoint that answers 504 whenever it is busy), and three quarters
of a full sweep is spent on lakes the export gate drops. On a cold build there
is no wire to read and the flag is a no-op.

### Making sure a photograph is of the lake

`lake_images.py` holds three gates, in the order they cost. They exist because
the first build was not strict enough: nine per cent of published lead
photographs did not carry their own lake's name, and among them were a
memorial plaque in Hungary, a monument to the liberators of Rezekne, a sports
hall in Flanders and a photograph of Greece taken from the International Space
Station. All four arrived the same way, through a blind Commons geosearch,
because "near the water" is not "of the water".

**Subject, from metadata.** Free, and it does the heavy lifting. A file is
accepted only when something ASSERTS it is this lake, and the strength of that
assertion becomes its evidence tier, which also drives the ranking:

| tier | what it means |
|---|---|
| `p18` | Wikidata: a person stated this image depicts this item |
| `title` | the file is named after the lake and nothing else |
| `viewcat` | it sits in "Views of X" or "Panoramics of X" on Commons |
| `category` | it sits in the lake's category tree |
| `name` | the lake is mentioned somewhere in the file name |

A geosearch hit that reaches none of those tiers is refused outright. On top
of that sits a vocabulary of what a lake photograph is not (maps, plaques,
monuments, coats of arms, interiors, aircraft, satellite imagery, species
close-ups), matched against the title, the categories AND the description,
because Commons file names are very often silent and the categories never are.

**Composition, from pixels.** One 500 px thumbnail per surviving candidate.
The probe measures colour in the lower 60 per cent of the frame: how much of
it reads as water, how much as vegetation, whether it is snow-bright or shot
in the dark. This gate may NOT overrule `p18` or `title`, because those are
humans stating what the picture is and the probe is a heuristic that rejects
the grey moorland water of the Faroes. It may overrule `name` and `category`,
which is the tier that admits the bar, the hotel terrace and the car park that
happen to name the lake they stand on.

**Beauty, from Commons itself.** Commons runs peer review and records the
verdict as a category: Quality images, Featured pictures, Valued images. Those
are humans saying "this is a good photograph", for free, and nothing computed
here comes close. Underneath them the picker reads the view subcategories, the
shape of the frame, and penalties for the wrong season, the dark, and a
subject standing in front of the water rather than in it.

Three measurements were taken and thrown away, and all three are worth
recording so nobody spends the afternoon again.

- A **texture** based water detector does not work. Toftavatn, a genuine
  Faroese lake, came back smoother than a Flemish sports hall, and the
  Attersee came back rougher than a memorial plaque.
- A **"flat overcast water"** clause keyed on low saturation does not work,
  because grey is grey. It passed a plaque at 0.94 and a sports hall wall at
  0.96, which is the whole set of files the gate exists to stop.
- **Printed ink saturation** does not separate an information board from a
  lake. The most saturated file in the sample was an aerial photograph of
  Lake Bled, at 0.38, and the board was 0.17: deep blue water is about as
  pure a colour as printers use.

What survives is one measurement: how much of the lower 60 per cent of the
frame reads as water, plus two narrow rejects for snow-bright and near-black
frames.

**A known miss.** A photograph of an information board standing beside a lake
still passes every gate, because its metadata describes the lake (its
categories, its description and its title all name it) and its printed map of
the lake reads as water. "Naturerlebnis Schwendisee.jpeg" is the example.
Detecting a photograph of a sign is a real classification problem rather than
a heuristic, so it is left undone and written down here instead.

### How many photographs a lake needs

**Four on a rated row, and a lead one that is evidenced.** That is v2, and the
number moved for a reason that is not "more is better". Two photographs is a
floor for EXISTENCE: it proves the place is real and that somebody has been
there. It is not a bar for BEAUTY, and the tab promises the best lakes in
Europe. Four pictures is what a gallery needs before a reader can tell whether
they want to go.

The old rule was two, unless one of them was evidence rather than a guess: the
beach layer's flat two dropped 618 of the 3,809 water bodies on the v1
shortlist, and
302 of those carried a Wikidata P18. That escape hatch is gone from the rated
tier and survives where it belongs, on `listed` rows, whose whole job is to
keep a region page honest about what exists and which ship whatever evidenced
pictures they have, including none.

**A row that cannot reach four is not dropped.** It falls to `listed`. That is
the mountain layer's lesson, which cost 478 rows and a country floor that could
not hold: the photo gate used to empty the pool before the floor could reach
it. The gate order is score -> photo -> region quota -> floor fill -> dedupe
-> write, and a photo failure falls through every time.

Which photograph LEADS is a separate question with a separate answer, decided
at export time so it costs no network call. "Magaro, Mountain Galichica, in the
background Ohrid lake" is genuinely a photograph of Lake Ohrid and genuinely a
picture of a snowfield: it belongs in the gallery, not on the card. The lead
prefers a file named after the lake in its first three words, and penalises
"in the background", winter words, and winter dates in the file name.

### Fixing one seed entry without a re-harvest

The country passes are the expensive half and they do not change when a seed
name is corrected:

```
python pipeline/lakes/harvest_lakes.py --countries DK --fix-seeds
```

That re-resolves only what is still outstanding and rewrites the cache.

## Lessons this layer paid for

- **A property path from a class root times the public endpoint out.** Both
  `wdt:P31/wdt:P279* wd:Q23397` per country and a bounded `P279?` chain from
  the roots answered Malta in fourteen seconds and returned HTTP 504 for
  Germany and Italy after four tries. Walking the subclass tree one hop at a
  time in Python, with a VALUES list of known parents, answers in six seconds
  for all 249 classes.
- **One query with every OPTIONAL in it multiplies its own answer out.** A
  lake with four types, three protected areas and four basin countries came
  back as ninety six near identical rows, each carrying the label and both
  Wikipedia links. Ninety lakes of that shape produced a 9 MB response the
  endpoint truncated, and Switzerland died on a JSON parse error rather than
  on anything readable. The one-to-one fields and the many-valued fields are
  now two queries.
- **NFKD does not decompose every letter.** `ø` and `æ` are letters, not a
  base plus a mark, so the standard fold turned `Arresø` into `arres` and four
  Danish seed entries never matched. `harvest_lakes.UNDECOMPOSED` carries the
  table, including `ł`, `ß`, `đ`, `ð` and `þ`.
- **A short generic name defeats entity search.** "Una" is a Spanish word, an
  album and a given name before it is a Bosnian river. Seed searches are
  qualified with the kind and the country name, and river seeds get a 160 km
  coordinate tolerance because Wikidata puts a river's point at its source.
- **A "skip this source" flag must not also discard that source's cache.**
  `--no-images` put the REUSE of already cached photographs inside the same
  `if images:` block as the fetching, so a shore sweep started with
  `--no-images` rewrote Andorra's and Albania's caches with no pictures in
  them, and both countries silently vanished from the next export. The switch
  controls the network. It has never controlled the data.
- **Overpass batches must not hold neighbours.** The shore sweep assigns each
  returned element to the nearest lake of the batch, so two lakes 3 km apart
  in one batch would share every marina between them. `split_batches()` deals
  lakes round robin by longitude and spills anything still within 12 km.
- **Filter the extract before you touch geometry.** `osmium tags-filter` is
  the shape (pyosmium does it in process with `BackReferenceWriter`), and the
  reason is memory rather than speed: building water polygons needs a node
  location index over the whole file, and Germany's is several gigabytes.
  Filtering first turns a 4.7 GB country into a file two orders of magnitude
  smaller, and everything after it fits on a laptop that also has a browser
  open. `relation_depth=1` is not optional: without it a lake mapped as a
  multipolygon loses its member ways and never becomes an area.
- **A buffer of a buffer is quadratic where a distance is not.** The first
  shore join asked "is this slipway within 150 m of the waterline" by
  buffering the 50 m band by another 100 m, per feature per lake. Macedonia
  took 66 seconds and Montenegro 160. `boundary.distance(feature) <= 150` is
  the same answer, and simplifying the waterline to 10 m before buffering it
  once per lake is invisible against a 50 m tolerance. Lake Constance has
  forty thousand vertices.
- **A climate raster masks out the thing you are measuring.** CHELSA has no
  reading in the middle of Vattern or Balaton, because a lake is a water pixel
  and water is masked. Sampled naively, the biggest lakes in the layer would
  be the ones with no season at all. The ring search out to eight pixels
  (four kilometres at 30 arc seconds) reaches the shore of everything short of
  Ladoga and never crosses a climate boundary that matters.
- **A new spine needs a new pre score, or it will never be shortlisted.** The
  OSM rows arrive with no sitelinks, no Commons category and no article, so
  `prelim_score` scored them under two and the second spine would have
  reached the enrich stage for nobody. What OSM knows instead is what is ON
  the shore, and a lake with a path round it, a beach and a car park is a lake
  people go to whatever Wikidata says about it.

## Tiers: rated, listed, and nothing invented

Every published row carries a `t` field, and the app has to opt in to seeing
anything but the first.

| `t` | Meaning | Score | Photo bar | Where it appears |
|---|---|---|---|---|
| `r` | Clears the score gate and the full photo gate | shown | 4+, evidenced lead | everywhere; ranked lists; `top.json` |
| `l` | Exists, named, deduped, in region, but under one gate or both | **omitted from the wire entirely** | whatever it has, including none | region pages, the map, "also here", coverage fill |

The rules the export enforces, and `verify_lakes.mjs` re-checks against the
files that shipped:

- A `listed` row **has no `score` key**. Not `null`, not `0`: absent. The app
  cannot render what is not there, which is the only reliable way to guarantee
  a number nobody earned never appears.
- `listed` rows live in their own `listed: [...]` array inside `CC.json`, not
  as a flag inside the main one, so a screen has to opt in rather than
  remember to filter.
- `top.json` contains `r` only. Ever.
- The tier is derived by the gate, never hand set.
- The one line a listed card carries is a code, not prose: `{"k":
  "unrated_coverage"}`, which `lakeStory.js` renders in six languages.

## The gate

```
score gate      >= 5.4, bands 6.3 / 7.5 / 8.5                     -> 'r'
photo gate      >= 4 images, lead at an evidence tier             -> 'r'
                failures fall to 'l', never to nothing
region quota    per NUTS3; the formula and the clamp are quotas.py's,
                not this layer's, and ship in every index.json under
                model.region_quota. Read them there rather than here
floors          every applicable NUTS3 >= 1 (any tier)
                every river basin district >= 2 (any tier)
                country floor 4 retained as a backstop
country cap     400, which decides HOW MANY once the quota has decided WHICH
top.json        200 at 6 a country, 'r' only
```

Every number in that block is a copy of a constant in `export_lakes.py`
(MIN_SCORE, MIN_IMAGES, BASIN_FLOOR, COUNTRY_FLOOR, PUBLISH_MAX, TOP_N,
TOP_PER_COUNTRY) or `lake_index.py` (TIER_CUTOFFS), and nothing checks the
copy. See "Reading the numbers in this document".

The country cap was 60 and it bound seven countries to exactly 60, which is
the master spec's own test for a cap still deciding the answer rather than the
quota. It is 400 now, and in the wire of 2026-08-30T16:09:49Z the largest country
published 74 (France). That is a measurement, not a property: it moves on
every export, and it was 76 in an earlier draft of this paragraph written from
a different wire the same afternoon.

The division of labour between the cap and the quota changed on 2026-08-30,
across all three scored layers. The region quota used to CUT: a row past its
region's allocation was dropped. That made the quota a hard ceiling, and in a
country that is a single region of the layer's unit it made it a NATIONAL
ceiling. The trails layer found it in the field, with Cyprus falling from 103
publishable routes to a quota of 12, and lakes was exposed the same way
structurally because its unit is NUTS3 too; it had simply not bitten yet,
because no small country had enough publishable water to reach the clamp.

Overflow is now deprioritised rather than dropped: it sorts behind every
region's allocation, keeping the interleave, and the country cap trims it.
So the quota decides which rows fill the budget and the cap decides how many.
The change can only ever add rows. It also means the cap, not the quota sum,
is what binds a large country, which is why `verify_lakes.mjs` asserts that no
more than two countries share the same maximum: if that fires, the cap has
started deciding the answer and the fix is to raise it.

Monaco has no water and San Marino has no photograph. Both are correct
outcomes, both are recorded in `absent` with the reason, and a country that
drops out has its file DELETED rather than left on disk serving the last build
(the SM.json lesson: the app fetches a country file by name, so nothing in the
index was stopping it).

## Filters

Nine groups, in `LAKE_FACETS` in `src/lib/lakeStory.js`, rendered twice from
one model: the toolbar row under the search field and the full set inside the
Filters sheet. Inside a group the options are an OR, between groups an AND,
which is what people mean when they tick two boxes in different rows.

| Facet | Values | Source |
|---|---|---|
| Swimming | Yes / Limited / No / Look for a sign | the swimming rule, unchanged |
| Water quality | Excellent / Good / Sufficient / Not rated | EEA WISE |
| Setting | Mountain / Forest / Islands / Town / Lowland | the scenery inputs |
| Size | Pond under 10 ha / Lake / Large over 10 km2 | the polygon area |
| What to do | Kayak / Sail / Dive / Boat / Fish / Shore path | the activity inputs |
| Getting to the water | Public path / Beach / Mostly private | the shore block |
| How wild | Wild / Quiet / Developed | the wildness component |
| Warm enough in | the twelve months | the season model |
| Protected | National park / Nature reserve / UNESCO | the protection inputs |

**Never a chip with a zero count.** A chip offering "Sufficient water" over a
list that holds none of it is a promise the list cannot keep, and greying it
out still puts the word on screen. So a zero option is dropped outright and a
group whose every option is zero never renders. A SELECTED chip survives its
own zero, because the way back out of an empty list is the chip you tapped to
get there.

Two of the brief's rows are narrower here than it wrote them, and both
narrowings are about not inventing a reading:

- **Setting** was asked for as Mountain / Forest / Moorland / Lowland / Urban
  / Island from "scenery inputs + WorldCover". ESA WorldCover is not joined to
  this layer, so the five the scenery inputs really do evidence are offered
  and Moorland is not. A chip nothing can ever match is worse than a missing
  one.
- **Protected** was asked for as Natura 2000 / Emerald / national. Neither
  polygon set is ingested for lakes; the protected-area cache holds OSM
  CENTROIDS, which is also why the layer can say "on the coast of X, a
  national park" but never "inside it". The three levels that cache does
  support are offered instead. Natura 2000 and Emerald are the upgrade, and
  they arrive with brief 08's cross-layer pass.

## Checking it

```
python pipeline/lakes/check_doc.py            # every pointer in this file
cd continent-app && npm run build
node scripts/verify_lakes.mjs                 # the wire and the screen
```

`check_doc.py` exists because this document broke its own promise once. Every
path, module, symbol and wire field named here is an invitation to go and
look, each was true when written, and that is exactly why nobody re-reads
them. It walks all of them and exits non-zero on the first that does not
resolve. A field the doc says arrives from a later export is reported rather
than failed, because "not built yet" and "does not exist" are different
answers and only the second is a fault.

`verify_lakes.mjs` covers the wire and the screen: tier integrity (no score on
a listed row), the four-photograph floor and the evidenced lead, region
assignment on every row, the model version and the weight table summing to
one, the swimming verdict's four words, no country or region pinned to a
constant, and the nine filter groups rendering with no zero chips.

## The four named holes, and the one that closed

Brief 04 named four countries as the proof that the gate and the country cap
were deciding this catalogue rather than the data: Great Britain 8, Ireland 9,
Norway 13, Iceland 4. It set targets of 60, 40, 80 and 25. One was met.

| | v1 | v2 (when written) | target |
|---|---|---|---|
| Great Britain | 8 | 60 | 60 |
| Ireland | 9 | 30 | 40 |
| Norway | 13 | 45 | 80 |
| Iceland | 4 | 7 | 25 |

The v2 column is a snapshot from the day this section was written and later
rebuilds move it a few rows either way (a 2026-09-02 read had IE 27 and
NO 42); the wire's `index.json` is the current count, this table is the
argument. `verify_lakes.mjs` pins the measured floors (GB 60 / IE 25 /
NO 40 / IS 7) so a regression alarms without asserting the conceded targets.

**The spine argument was right and it is closed.** Great Britain went from 8 to
60 under an identical gate, which is the whole claim: the change is the second
spine and the pool it fills, not a loosened bar. Norway and Ireland rose the
same way.

**What stops the other three is photographs, and the number says so.** After
the shortlist was resized (see below), Norway enriched 867 water bodies and
only 13 per cent of them have four usable photographs. Ireland is 12 per cent
over 641, Iceland 16 per cent over 197. In Norway, 125 lakes score above 5.4
and are held out by the photo gate ALONE, which is nearly three times the
number that publish.

So the brief sets two requirements that pull against each other for these
countries: four photographs on every rated row, and 80 rated rows in Norway.
Commons does not hold four relevant, licensed, evidenced pictures for 80
Norwegian lakes. No amount of sweeping reaches them, because the sweep is not
what is short: the shortlist is already at its 900 ceiling for Norway and the
pass rate is 5 per cent.

Three ways forward, none taken here because each is a decision rather than a
fix:

  - Accept it, with this measurement as the reason.
  - Widen the funnel. Brief 02 cleared **Geograph** (CC BY-SA, systematic grid
    square coverage of the whole of Britain and Ireland) for exactly this
    hole, and it has never been wired in. That is the honest fix for GB and
    IE and it would do nothing for Norway or Iceland.
  - Publish those countries at two or three photographs as a documented
    exception. Argued against: the four photograph bar is the programme's, and
    lowering it for the countries that fail it is how a gate stops meaning
    anything.

**A sizing bug this exposed, worth keeping.** The shortlist that feeds the
gate was sized `regions * 8`, a flat budget per region. That is the same fault
as a flat cap per country, one level down, and it was introduced by the fix
for the country cap. Norway's 22 regions hold 24,808 named water bodies and
Belgium's 33 hold a few hundred; both were given eight apiece, so Norway
shortlisted 176 candidates out of 26,339 and published 30 against a target of
80. The gate can only choose from what was photographed. It is sized from the
region quota now, with headroom for the pass rate, which took Norway to 900
and left Luxembourg at 120.

That fault was invisible from the wire, because the published counts looked
like a gate being strict rather than a shortlist being small. It surfaced only
when the failing countries were compared against their own pool sizes.

## Countries with nothing

`index.json` carries an `absent` map for an in-scope country with no
published entries at all: either "nothing cleared the gate" or a written
reason from `seed_lakes.NO_WATER`. Since the 2026-09 refactor a country with
zero RATED rows but listed rows (or a deliberately shipped empty file, the
SM lesson) appears as an `n: 0` index entry instead of in `absent`, so the
map only holds countries with nothing of any tier. Keeping the distinction
matters: an empty list because the pipeline failed and an empty list because
there is nothing there are not the same fact, and `verify_lakes.mjs` now
checks that every empty index entry still has a wire file rather than
forbidding emptiness.

Ukraine, Turkey and the Caucasus are named in the research this layer was built
from and are deliberately out of scope, because they are not in the catalogue's
43 countries. Ukraine additionally carries a wartime travel advisory.
