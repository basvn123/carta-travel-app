# The mountain layer

The Mountains category on the Destinations tab, end to end: where the summits
come from, what the index actually measures, how the way up is decided, what
the seven filters read, how the explanation on each page is written, and how
to rebuild the whole thing from nothing.

Model: **`peak_index_v2`**. The v1 argument is unchanged and is restated
below, because every part of it was earned; what v2 adds is measurement where
v1 had inference, a third publication tier, and a floor that actually holds.

## What this layer is for

Until 2026-08-21 the Mountains category was a filter over the published hikes:
any trail whose kind was mountain-flavoured, or that climbed more than 600 m.
That is a list of walks. It never contained the Matterhorn, because the
Matterhorn is not a walk, and it never contained the Zugspitze, because the way
most people reach the Zugspitze is a cog railway rather than a path.

So this layer answers the question the tab's name makes: which mountains in
Europe are worth travelling to see, and how do you get up them. Three things
follow from that, and each of them is a design decision rather than a detail.

- **A lift is not a footnote.** For most people reading this app the answer to
  "can I get to the top" decides everything else. A cable car, a funicular, a
  rack railway or a road is the difference between an afternoon and an
  expedition, so `access` is a scored component in its own right, it is one of
  the three figures shown on every page, and it leads the filter row.
- **Height is the wrong question in half of Europe.** The highest natural point
  of the European Netherlands is a wooded 322 m road junction and the thing
  people actually go and look at in Denmark is a chalk cliff. A ranking by
  elevation says those countries have nothing, which is a true statement about
  numbers and a useless product, so the layer publishes cliffs, ridges,
  plateaus, rock formations and lowland high points alongside summits, and it
  guarantees every country a floor.
- **Nothing here is a route description.** The research this layer was built
  from is blunt about it: generated route text kills people, and OSM's
  `sac_scale` is misused often enough that a path tag cannot be read as
  "walkable". The wire carries facts with their sources attached, the page
  composes sentences from those facts, and the hazard block sends the reader to
  a local forecast.

v2 adds a fourth, from the programme's ninth invariant:

- **A number nobody earned is never shown.** Coverage growth means publishing
  places we cannot score. They ship in a separate tier, with no `score` key at
  all, and the app renders them as a list rather than as ranked cards.

## The v2 targets, and where the layer stands

The brief's numbers, written down here so they are auditable from the repo
rather than living in a script header: **~4,500 rated + ~3,000 listed over 44
countries, every applicable floor country at 8 published rows, GB at 60 and
NO at 120.** Current counts belong to the wire, not to this file: read
`public/mountains/index.json` (`n_mountains`, per-country `n` and `listed`,
the `floor` and `photo_shortfall` blocks), because a copied count rots.

What the wire said on 2026-09-02: 746 rated, roughly 1,400 listed, 44 files,
every floor country filled to 8 with listed rows except Monaco (pool
exhausted at 2). The binding constraint is photo supply, not scoring:
`photo_shortfall` covers most of the layer, Norway is the dominant gap (the
four-photo rate there measured 23.4% against 36.8% layer-wide), and the named
fix is the Geograph ingest for GB/IE plus a wider Commons funnel elsewhere,
not another rescore.

## The chain

```
pipeline/mountains/
  peak_sources.py      the beach layer's polite clients, repointed at
                       cache/mountains
  seed_peaks.py        the curated seed: 393 mountains, all 43 countries, the
                       lift-served viewpoints fame does not find, and the
                       hazards a human looked up
  osm_spine.py         NEW  the second spine: every NAMED landform OSM knows,
                       per country, through Overpass
                                             -> cache/mountains/osm_CC.json
  harvest_peaks.py     stage 1  the Wikidata spine + P610 high points + a hill
                       pass for thin countries + the OSM spine + the seed
                                             -> cache/mountains/raw_CC.json
  terrain.py           NEW  Copernicus GLO-30, windowed: the elevation check,
                       prominence, isolation, the viewshed, the ascent slope
                                             -> cache/mountains/terrain.json
  season.py            NEW  a monthly climatology per summit, lapse corrected
                                             -> cache/mountains/season.json
  enrich_peaks.py      stage 2  measurements, photographs, Wikipedia facts, the
                       Overpass access sweep, the nearest priced town
                                             -> cache/mountains/rich_CC.json
  peak_index.py        the model: seven components, three sub scores, the way
                       up, the difficulty facet, the hazards, the reasons
  export_peaks.py      stage 3  score, gate, tier, quota, floor, validate
                                             -> continent-app/public/mountains/
  build_peaks.py       harvest, enrich and export in one command
```

The app reads it through `src/lib/mountains.js` (four artifacts now:
`index.json`, `top.json`, `{CC}.json` and that file's `listed` array), turns
the reason codes into sentences in six languages in `src/lib/mountainStory.js`,
and renders `MountainCard` in `browse/DestinationsTab.jsx` and
`browse/MountainPage.jsx`.

## Two spines, because one was uneven

Wikidata types 247,164 mountains inside these 43 countries and Norway is
171,183 of that on its own. Querying that live would spend hours to bring back
a haystack the ranking then throws away, so stage 1 reads a spine that is
already on disk: `cache/features_wikidata.json`, with a coordinate, an
elevation, a prominence, a sitelink count and a P18 image per item.

That spine is uneven in exactly the places this layer was thinnest.
Luxembourg has **15** mountains in it and OpenStreetMap has **165** named
summits in the same country; Lithuania 52 against 193, Latvia 72, Malta 17.
So `osm_spine.py` harvests a second one:

```
natural=peak | volcano | saddle       nodes, named
mountain_pass=yes                     nodes, named
natural=ridge | arete | cliff         ways, named, longer than 500 m
natural=plateau                       ways, named
```

A country too wide for one query is asked in 3 degree tiles, and **only the
tiles that touch land in that country**. A bounding box is a rectangle around
a country and Europe's countries are not rectangles: the Netherlands' box
reaches Bonaire and France's reaches Reunion, so even clamped to Europe's
window those two tiled to 140 and 234 rectangles of which the great majority
were open Atlantic. Every one was a full Overpass query answering nothing, and
at the minutes-per-query this endpoint gives under load that is most of a day
spent asking about the sea. Intersecting each tile with the country's outline,
with a quarter degree of margin for a simplified coastline, takes the six
remaining countries from 538 tiles to 103. Sixteen summits chosen for sitting
where a coarse outline would most likely have dropped them (Teide in the
Canaries, Reinebringen in Lofoten, Sgurr Alasdair on Skye, a Schiermonnikoog
dune) were checked against the surviving tiles first.

Each tile is **written as it lands**. This is the longest single job in the
layer and it does not get to finish uninterrupted: a run that keeps everything
in memory until the last tile hands all of it back the moment the process goes
away, which happened twice, once losing 35 Norwegian tiles that had already
been paid for. A re-run reads the checkpoint and asks only for what is missing
from it.

Reconciliation is the brief's: the `wikidata` tag first, because a mapper
writing Q1234 on a summit node is a human statement that these are the same
mountain, then a spatial match within 150 m. A match ENRICHES rather than
replaces, which is the whole argument for having two: Wikidata carries the
sitelinks `acclaim` is built from and OSM carries the elevation and prominence
Wikidata mostly does not.

What that did to the pool, measured:

| | Wikidata spine | after the OSM merge |
|---|---|---|
| Luxembourg | 89 | 239 |
| Lithuania | 58 | 217 |
| Faroes | 376 | 621 |
| Belgium | 377 | 657 |
| Andorra | 348 | 450 |
| Cyprus | 375 | 905 |

Two live Wikidata passes still add what neither spine knows: the **P610 high
points** of every country and province (which is how the Netherlands gets an
answer at all, because a 322 m hill is not typed as a mountain), and a **hill
and volcano pass** for countries under 900 spine rows.

## The ground, measured

`terrain.py` is new and it is where most of v2's honesty comes from. Wikidata
tags prominence on a small minority of European summits and isolation on
fewer, so in v1 `stature` was mostly carried by relative height alone and the
view was not measured at all: v1 paid for a `tourism=viewpoint` node within
500 m, which is a proxy for somebody having mapped a bench.

Everything below is computed against **Copernicus GLO-30**, read as HTTP
windows over the public COGs (`/vsicurl/`), which pulls the few hundred
kilobytes each summit needs instead of a 42 MB tile. No tile is kept: the
cache is `cache/mountains/terrain.json`, keyed by COORDINATE, because the
ground around a point is a property of the point.

- **prominence** by flooding. Raise the water until the summit's island first
  touches ground higher than the summit; the water line is the key col. Binary
  search on the level, `scipy.ndimage.label` for the island. Where the search
  window holds nothing higher, the flood is run again for the level at which
  the island reaches the window EDGE, which is an upper bound on a col that
  must lie outside, so the answer is a true lower bound and `promSrc:
  "dem_min"` says so.
- **isolation**: the distance to the nearest ground that is higher.
- **the elevation check**: the DEM's own summit, and the gap where it
  disagrees with the source by more than 30 m.
- **the viewshed**: a ray per half degree of azimuth to 30 km, sampled every
  90 m, with earth curvature and standard refraction subtracted (61 m at
  30 km, which is the difference between "the sea is visible" and "the sea is
  over the horizon"). It returns visible land area, how many other named
  summits are visible, and whether big water is in the frame.
- **the ascent slope**: the steepest sustained stretch of the gentlest radial
  line off the summit, which is the fallback behind the difficulty facet.

Checked against published figures:

| | computed | published |
|---|---|---|
| Matterhorn prominence | 1,042.7 m | 1,042 m |
| Matterhorn isolation | 13.8 km | 13.6 km |
| Zugspitze isolation | 25.8 km | 25.8 km |
| Triglav prominence | 2,020.9 m | 2,052 m |
| Snowdon prominence | 1,057 m (bounded) | 1,039 m |
| Grossglockner prominence | at least 2,312 m | 2,423 m |

### Why not akirmse/mountains

The brief asks for it, and its warning is worth repeating: the CODE is MIT,
the precomputed CSVs carry no stated licence and must not be redistributed.
That warning is respected in the strongest form available, which is to compute
the numbers ourselves. What is not adopted is the toolchain: akirmse is a C++
build over whole downloaded tiles, and Europe's GLO-30 coverage for this
layer's summits is 769 tiles and 32 GB, on a box with 48 GB free and no
compiler. The definition it implements is one paragraph long, it is a flood
level, and it is implemented here directly over windowed reads of the same
COGs.

## The index

Seven components, weighted, each dropped rather than scored zero when nothing
was asked (see "Overpass is optional" below).

| Component | v1 | v2 | What it reads |
|---|---|---|---|
| scenery | 0.26 | **0.24** | shape (spire, wall, volcano, sea cliff), prominence against its own height, glacier, lake below, national park, UNESCO, the seed bonus, and 0.15 of fame |
| access | 0.22 | **0.20** | the way up: lift at the summit, road, chairlift, graded path, hut, minus what makes it hard, floored at 0.15 |
| acclaim | 0.22 | **0.18** | sitelinks and 60-day pageviews, split 60 per cent at home and 40 per cent across Europe |
| stature | 0.16 | 0.16 | prominence first, then isolation, then height against the tallest thing in the same country. Inputs now computed rather than hoped for |
| experience | 0.14 | 0.14 | what is up there: viewpoint, summit restaurant, hut, observatory, summit cross, via ferrata, cave, wildlife |
| **views** | | **0.06** | the viewshed, below |
| **photo** | | **0.02** | the photo engine's beauty rank for this row's best picture, capped |

Plus a standout bonus of 0.15 on the strongest of scenery, access, experience
and now views, so a mountain that is exceptional in exactly one way still
ranks.

**Why acclaim was cut hardest.** 0.22 was tuned for a 687 row list where every
row had an article. At the coverage v2 targets, most of the tail has no fame
at all, and a weight that large turns "nobody has written about it" into "it
is not worth seeing".

**`views`, and why it is a measurement.** The tab now offers a "scenery and
views" filter, and a filter needs a measurement behind it. The formula is the
brief's:

```
views = 0.45 x visible area within 30 km
      + 0.25 x other named summits visible
      + 0.15 x sea or major lake in the frame
      + 0.15 x a mapped viewpoint within 500 m of the summit
```

The last term is v1's signal, kept at the weight the brief gives it: a mapped
bench is weak evidence, and it is also the only one of the four where a human
decided the view was worth marking. Big water is one rule for both cases, and
it needs no second source: cells at or below 1 m, or outside every tile (open
sea), in a connected patch of at least 4 km2.

Two v1 arguments are unchanged and still load-bearing.

**Fame folded back into beauty.** `FAME_TO_SCENERY = 0.15`. It is not circular
reasoning: the research spends a page on geotagged photograph density as a
validated proxy for scenicness, and the reason a mountain carries 92 Wikipedia
articles is usually that it looks like that. It is capped low enough that a
famous ordinary hill cannot climb past a beautiful unknown one on this term.

**The hard-route penalties apply only where the hard way is the only way.**
The first version subtracted the glacier, the climbing grade and the altitude
from every summit that had them, and put the Matterhorn 27th in Switzerland
behind a dozen ski hills, because you cannot walk up it. Nobody goes to
Zermatt to stand on the summit. Where a lift or a road puts you on the
mountain, the climbing grade is somebody else's problem.

## The seven filters

Brief 05's list, in the model `MOUNTAIN_FACETS` in `src/lib/mountainStory.js`.
Inside a group the chips are OR (the bands are mutually exclusive, so AND
would mean every second tap emptied the list); across groups they are AND,
because "a volcano you can walk up" is the question people actually ask. Every
chip carries a count, computed inside the pool the other groups already
narrowed, and a chip with a zero count in scope renders disabled.

| # | Filter | Values | Where the answer comes from |
|---|---|---|---|
| 1 | Height | five bands, under 500 m to over 3,000 m | `ele`, verified against GLO-30 and flagged where they disagree |
| 2 | How much of a mountain | a rise, a hill, its own summit, a major peak | prominence, published where one exists and computed otherwise |
| 3 | Scenery and views | fine, good, wide, panoramic, exceptional | the viewshed, banded by percentile WITHIN THE COUNTRY |
| 4 | How hard is the way up | walk up, hike, mountain hike, scramble, alpine, via ferrata, technical | OSM grades within 800 m of the summit, else the terrain, marked as inferred |
| 5 | How you get there | lift to the top, lift on the mountain, road to the top, parking at the start, public transport, remote | the existing lift provenance, plus parking and the nearest station or stop |
| 6 | Rating | the three score bands | the score, on rated rows only |
| 7 | Best months | twelve month chips | the climatology, below |

Filter 3 is banded by percentile within the country and not against Europe,
which is invariant 5 and is the only reading that works on both a Dutch and a
Swiss page. Filter 2 is absolute metres, because 300 m of prominence is 300 m
of prominence in Denmark and in Switzerland.

Only filter 5 rides in the toolbar row. The other six live in the Filters
sheet: seven groups of chips under a search field is a wall, and the way up is
what this tab is opened for.

### Difficulty is a facet, never a score

Nothing in the model reads it. A hard mountain is not a better mountain, and
this layer already learned that the expensive way with the v1 hard-route
penalties.

A mountain is graded by its EASIEST way to the top, which is what every
guidebook does and the only reading under which the ladder means anything:
Snowdon is a walk that happens to have Crib Goch on it, and a rule that took
the hardest tag within a kilometre would file it under alpine. "Worst segment
wins" applies inside a route, which is what a `sac_scale` tag on a way already
encodes. The hardest grade nearby still ships, as `diff.hard`, so the page can
say there are harder ways up and nothing here hides a hazard.

Four sources, in order of how much each knows about this summit:

1. a graded way within 800 m of the top. The real answer, and the only one
   not marked as an estimate.
2. a graded way anywhere in the Overpass sweep (2.6 km). "Somebody graded a
   path on this mountain" rather than "this is the grade of the way up", so
   it ships `est: true`.
3. the terrain: the gentlest radial line's steepest sustained stretch,
   banded. A DEM has never walked anything, and the app says so.
4. nothing, and then the row carries no difficulty at all.

**What is not a source is a word in an article.** The first version read
"climbing" out of the Wikipedia extract and, finding no "hiking" beside it,
filed Snowdon and Ben Nevis under "technical climb": two of the most walked
mountains in Britain, both of which OpenStreetMap grades T1 on their tourist
paths. An article that mentions climbing says climbing happens there. It does
not say that is the way up. Facts may still RAISE the floor, never set it, and
only the two that are about the ground: a glaciated mountain's walk is an
alpine route whatever its slope reads, and a summit with climbing evidence and
no walking evidence at all is at least a scramble. That direction is the safe
one.

## When to go

`season.py` ships twelve monthly values per summit plus a `months` array, all
static, all in the wire, no runtime call.

The brief names **ERA5-Land** through the Copernicus CDS and it is the right
source: free, commercial use permitted. It needs an API key, and there is none
on this box or in the repo's `.env`, so `--source era5` is written and will run
the moment `CDSAPI_KEY` exists, and the shipped default is **NASA POWER**,
which this repo already harvests for the destination climate strip: US
government open data, no key, one small request per 0.5 degree cell. The cell
is ~50 km, which for a summit matters less than it sounds, because it is
ELEVATION that decides whether a European summit is under snow and the cell
mean is lapse corrected to the summit's own height at 6.5 C/km. `season.src`
records which source answered.

Snow cover is a MODEL and not a measurement: near certain below -2 C, near
absent above +4 C, linear between, damped in a dry month because snow has to
fall before it can lie. Copernicus Land's high resolution Fractional Snow
Cover product, which would measure it, has concluded production.

`months` is the answer to "when should I go": months under 35 per cent snow
probability and over 3 C. Where nothing clears that bar the three warmest are
named instead and `snowbound` is set, so the page reads "Snow all year. The
warmest months are July to September" rather than as an invitation. A
snowbound summit is also excluded from the month filter: it would be the one
row on the July list nobody can walk up.

**Live conditions are deliberately out of scope.** Open-Meteo's free endpoint
is non-commercial. There is no pan-European avalanche API: CAAML is a schema,
every national service publishes its own feed, and integrating ~20 of them is
real work. Windy's webcam URLs expire in ten minutes. And all three are runtime
calls, which sit outside the cache-is-the-snapshot invariant: nothing live may
enter this wire.

## Photographs, and why relevance is a gate

A file is a candidate only when a source says it depicts THIS mountain:

| Evidence | What it is | Can it carry a gallery |
|---|---|---|
| `p18` | Wikidata's main image for the item | only when it also names the mountain |
| `article` | used in the mountain's own Wikipedia article | yes |
| `name` | the name is in the title, ObjectName or description | yes |
| `cat` | filed in the mountain's own Commons category | no, and at most two per gallery |

Everything else is rejected, whatever it looks like. After the gate, 98 per
cent of published images name their mountain in the file title, the object
name or the description, against 70 per cent before it.

Beauty is ranked on top of that by the photo engine (`pipeline/photos`,
`photo_rank_v1`: LAION aesthetic head, Commons quality and featured
assessments, NIMA, technical headroom, season fit). Its order is respected by
this export wherever it has spoken, and its hero score is now worth 0.02 of
the mountain's own score.

**The bar moved from two photographs to four**, which is the programme wide
target, and it is affordable for one reason: a row that misses it is no longer
deleted. It becomes a listed row, keeps its name and its place on the map, and
stops claiming a score. `index.json` publishes the backlog as
`photo_shortfall`, per country: rows that cleared the score gate and missed the
photo gate. That is the queue the photo engine's wider funnel works through.

## The gate

Order matters, and the order is the fix. In v1 the photo gate ran first and
emptied the pool, so `COUNTRY_FLOOR = 8` relaxed a score over an empty list
and Lithuania published four mountains.

```
score gate      >= 5.0, bands 6.2 / 7.4 / 8.5              -> rated
photo gate      >= 4 images, gallery carried by a named or
                article picture                            -> rated
                REJECTS FALL THROUGH to listed
country check   Wikidata P17 must match the file; a border peak publishes
                under every country P17 gives it
dedupe          no better peak within 1 km
region quota    per GMBA range, opportunity sized (pipeline/regions)
floor fill      country 8, every applicable NUTS3 1, every European GMBA
                range 2, satisfiable by rows of ANY tier
report          index.json records which countries the floor filled AND
                which it could not reach, with a reason code
```

Three tiers reach the wire, and one rule is absolute: **only a rated row
carries a score, and it carries it as a key that exists.**

| `t` | Meaning | Score | Photographs |
|---|---|---|---|
| `r` | rated: clears both gates | shown | 4+, one that names the mountain |
| `l` | listed: exists, named, deduped, in region | **no score key at all** | up to 2, or none and a map card |
| `e` | editorial: a seed a person vouched for that missed a gate | no score key | as listed |

Listed and editorial rows live in a separate `listed` array in `{CC}.json`,
never inside `mountains`, so a screen has to opt in to showing them. The tab
does, under its own heading, as a hairline list rather than as photo cards: a
listed row has no score and often no photograph, and a photo card would
promise a judgement that was never made.

**The floor, reported both ways round.** `index.json` carries
`floor.filled` (where the floor added rows) and `floor.unreachable` (where it
could not, with a code). Monaco has six named landforms in the whole country,
Wikidata and OSM together; San Marino sixteen. Those countries publish what
exists and `mountainStory.js` composes one line from the code: *"Monaco has
few mountains, and this is every one we could verify."* The layer is honest
about the floor internally and invisible about it to a reader.

## Overpass is optional, on purpose

During the first build the public Overpass instance refused every connection
for over an hour and both mirrors answered a bare 500, while Wikidata, Commons
and Wikipedia were fine throughout. The layer is built so that does not block
a release:

```
python pipeline/mountains/build_peaks.py --no-context      # ship without it
python pipeline/mountains/enrich_peaks.py --context-only   # fill it in later
python pipeline/mountains/export_peaks.py                  # republish
```

`peak_index.evidence_for()` is what makes that honest. A country enriched
without the sweep has no evidence for "what is at the top" and often none for
"getting up", so those components are excluded and the remaining weights are
renormalised. The same rule now covers the two new components: a row the
terrain sweep has not reached scores on the five it has rather than losing
one it used to have.

## Rebuilding it

```
python pipeline/mountains/osm_spine.py                  # the second spine
python pipeline/mountains/harvest_peaks.py --refresh    # merge both spines
python pipeline/mountains/enrich_peaks.py               # photographs, Overpass
python pipeline/mountains/terrain.py --workers 6        # GLO-30, ~6 s a summit
python pipeline/mountains/season.py                     # one call per 0.5 deg cell
python pipeline/mountains/export_peaks.py --verbose
python pipeline/regions/coverage.py                     # the backlog
python pipeline/regions/export_regions.py --all         # region pages
```

or `python pipeline/mountains/build_peaks.py` for harvest, enrich and export
in one command. Every stage is cache first and resumable: `enrich` now fills
in only the rows a grown shortlist added and carries the photographs of the
rest across, so raising `ENRICH_TOP` costs the new rows rather than all of
them.

Repairs that do not re-photograph:

```
python pipeline/mountains/enrich_peaks.py --recheck-country   # P17 + measurements
python pipeline/mountains/enrich_peaks.py --resync-seeds      # re-apply harvest pins
python pipeline/mountains/enrich_peaks.py --context-only      # the Overpass sweep
python pipeline/photos/rescore.py mountains                   # re-rank galleries
```

## Checking it

```
cd continent-app
npm run build && npm run preview -- --port 4173
node scripts/verify_mountains.mjs
```

The harness checks the v1 promises (mountains rather than trips, no country
dropdown, no priced-from, a photograph and a height and a score on every card,
the way up above the photograph with its source, hazards in their own block)
and the v2 ones: the model is `peak_index_v2` and its weights sum to one, the
terrain model ships with the data, every rated row carries four photographs
and a gallery that names the mountain, **no listed row carries a score key of
any spelling**, every country reaches the floor or says why, every published
row carries its region block, every facet code is in vocabulary, a DEM
difficulty is marked estimated, and the filter sheet offers every group with a
count on every chip and none offered at zero.

## Deliberate deviations from the brief, and why

- **The DEM does not overrule the source elevation.** The brief says to take
  the DEM value wherever it disagrees by more than 30 m. Run literally that
  puts 4,330 m on the Matterhorn's card: GLO-30 is a 30 m posting and the
  Matterhorn's top 200 m is a spire narrower than one, so the DEM smooths
  every sharp summit downward, by 148 m there and by nothing at all on Mont
  Blanc's broad dome (4,810.7 against a surveyed 4,808). The disagreement is
  real and its SIGN is not evidence of a wrong source. What the DEM can prove
  is the impossible, so it overrules only where the source is higher than
  anything within 12 km (a foot value read as metres). Everything else keeps
  the source value and ships the gap as `eleGap`.
- **Overpass rather than osmium over Geofabrik extracts.** Same elements, same
  clauses, clipped to the country by the query, without 30 GB of downloads and
  a compiler this box does not have. The 500 m rule for ridges and cliffs runs
  inside the query (`if:length()>500`).
- **NASA POWER rather than ERA5-Land**, until a CDS key exists. See "When to
  go".
- **Bands rather than sliders** on height and prominence. The brief asks for a
  slider; the same section asks that every chip carry a count and that no chip
  render at zero in scope, which a slider cannot do. Bands keep the counts.
- **The nearest station comes from OSM, not GTFS.** The brief names the
  Mobility Database and Transitous. `public_transport=station|stop_position|
  platform` within 2 km answers the same question from a source the layer
  already sweeps, in the same query, under a licence already recorded. GTFS
  remains the upgrade path when the cycling brief brings it in for its own
  reasons.

## Scar tissue

- **`near` is bounded by the catalogue, not by the world, and the copy has to
  say so.** The `near` block names the closest place Carta PRICES within
  120 km, which is not the closest town. Measured 2026-09-01 over a 666-row
  wire (the wire has since grown through rounds 3/3b and the 2026-09-02
  credit re-export; the shape of the numbers holds): most rated rows carry
  one, the median is 10.4 km, 15 sit beyond 60 km and the furthest is 89.3. On those fifteen the number is a fact about our own
  coverage, and a card that read "89 km from the nearest town" would be
  saying something false about Norway. It survives because the copy is an
  OFFER rather than a claim: "Price a trip to Tromso, 89 km from the
  mountain" is true whatever else is nearby. Anything built on this field
  later must keep that framing. **This is the shape of the trap waiting for
  brief 08's cross-layer join** (`near: {trail, lake, beach, peak, cycle}`):
  the moment a mountain card says "3 trails nearby", it is reporting where
  trails have been PUBLISHED, and a range with no published trail will read
  as a range with no trails. The cycling layer hit the same class from the
  other end, where `cycle_landcover` is extracted only within the grid cells
  a cycle route passes through, so a wood with no cycle route near it is
  absent from it by construction and always will be. A cross-layer count
  needs either full coverage on the far side or a code saying what it counted.
- **The spine is tiled by bounding box.** Switzerland's tile contains Mont
  Blanc and Italy's contains Triglav. Both are true statements about a
  rectangle and wrong answers on a country page, and a reader spots "Mont
  Blanc, Switzerland" instantly. The export gate checks Wikidata's P17, and a
  border mountain keeps every country P17 gives it, so the Matterhorn is
  published under Switzerland and Italy both.
- **A DEM under-reads its neighbours too.** Prominence measured against a
  surveyed 4,478 finds no higher ground until Monte Rosa, so the flood escapes
  over the Theodul Pass and the answer is 200 m wrong; measured against the
  DEM's own 4,326 m Matterhorn, its own subsidiary tops become "higher
  ground". The reference is the DEM's summit plus half the gap to the source,
  which is this DEM's under-read at this summit, and it lands within 1 per cent
  of the published figure.
- **Nothing may be higher than the mountain itself.** Mont Blanc's source
  elevation is 4,808 and its DEM summit cell is 4,810.5, so a reference of
  4,808 made its own snow cap higher ground: a col at the summit, a prominence
  of 0.3 m and an isolation of zero.
- **Decimation lowers ridges.** Averaging a 60 m cell out of four 30 m ones
  lowers every crest, and a lowered crest lets the flood escape at a level the
  real ridge would have held. The prominence windows decimate with max; the
  viewshed keeps bilinear, because a surface you look across should be smooth
  rather than raised.
- **A row without a Q number needs an identity.** The OSM spine contributes
  summits Wikidata has never heard of, and every stage keyed its dictionaries
  on `wd`. One None key per country means one summit per country survives the
  Overpass sweep, which looks like a thin answer rather than a crash.
  `harvest_peaks.row_key()` is the fix, and `peak_id()` falls back to the OSM
  element id.
- **"Cached" has to mean "nothing left to do".** Raising the shortlist from
  110 to 500 changed nothing at all on the first run, because a rich cache
  from the 62 row era is still a rich cache. The check now compares what the
  cache holds against what the run would enrich.
- **Entity search returns the wrong mountain, confidently.** Searching "Pic
  Blanc Andorra" returns Aneto and Mulhacen among the hits. Only the candidate
  that resolves a seed is kept.
- **A token name match is a guess.** "Jungfrau" matched "Wengen Jungfrau" 6 km
  away and pinned Switzerland's rack railway onto the wrong item. An exact
  folded name now outranks a token match, whatever the distance.
- **Deduplication has to be gridded.** A pairwise scan is fine for Andorra's
  154 rows and hangs outright on Norway's 100,823.
- **Wikidata answers a badly planned query with a 504.** Elevation, prominence
  and isolation in one three-way UNION timed out on 70 items; three separate
  queries answer in a second each. Split, do not union.
- **One item carries six elevations.** Mont Blanc has 4805.59, 4807.02,
  4807.81, 4808.06, 4808.72 and 4810.02, every one a real survey. Reading "the
  last row" put 4,887 m on its card. The preferred rank wins, and the median
  of the rest wins when there is no preferred.
- **A Commons category is alphabetical.** Asking for the first 30 files in
  Category:Teide returns "At Teide Observatory 2019 054" before anything that
  shows the mountain. A Wikidata P18 now outranks everything computable.
- **A skip-this-source flag must not discard that source's cache.**
  `--no-images` and `--no-context` carry the previous cache's photographs and
  sweeps across instead of writing empty ones.
- **A cp1252 console kills a build.** One Bosnian summit name in a verbose
  export, and the run dies on the print rather than on the data.
