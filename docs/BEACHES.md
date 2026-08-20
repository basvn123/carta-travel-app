# The beach layer

The Beaches category on the Destinations tab, end to end: where the beaches
come from, what the beauty index actually measures, how the explanation on
each page is written, and how to rebuild the whole thing from nothing.

## What changed, and why

Before this layer, "Beaches" was a filter over the published trips: any trip
in a country whose anchor destination carried a `beach` or `coast` tag. Three
things were wrong with that, and all three were visible on the first screen.

- It listed **countries, not beaches**. The index counted every trip in the
  country, so Andorra offered ten and Moldova three. Neither has a coast.
- It listed **trips, not beaches**. Tapping through got you a city day in a
  coastal town, never a beach.
- It carried the **price chrome**: a country dropdown, a "priced from
  Brussels" origin and a "Dorm bed" stay tier over a list of places nobody
  sleeps on.

The layer replaces all of it. `pipeline/beaches` publishes real named beaches
with a score, a reason list and photographs; the tab renders those directly,
ranked, with the country dropdown, the origin picker and the stay tier removed
from that category only.

## The chain

```
pipeline/beaches/
  sources.py           polite clients: Wikidata, Overpass, Commons, Wikipedia
  harvest_beaches.py   stage 1  every named beach   -> cache/beaches/raw_CC.json
  enrich_beaches.py    stage 2  the shortlist, in full -> cache/beaches/rich_CC.json
  beauty_index.py      the model: six components, the reasons, the ids
  export_beaches.py    stage 3  score, gate, validate -> continent-app/public/beaches/
  build_beaches.py     all three, in order, in one command
```

```
continent-app/src/
  lib/beaches.js       the wire loader (index, top, per country, share links)
  lib/beachStory.js    reason codes -> sentences, in six languages
  browse/BeachPage.jsx the page one card opens
  browse/DestinationsTab.jsx  the category itself
  scripts/verify_beaches.mjs  the headless check
```

## Rebuilding it

```
python pipeline/beaches/build_beaches.py                 # everything
python pipeline/beaches/build_beaches.py --countries GR  # one country
python pipeline/beaches/build_beaches.py --skip-harvest  # re-score only
python pipeline/beaches/build_beaches.py --dry-run       # what would ship
```

or through the orchestrator, which is where the cadence lives:

```
python run_pipeline.py --only beaches
```

A cold build is a few hours and nearly all of it is Overpass being asked
politely: one query per country for the named beaches, then one query per 30
shortlisted beaches for what stands around them. A warm re-run is seconds.

Overpass is the fragile part of the chain, and three rules exist because it
broke in three different ways:

- **A timed-out query returns HTTP 200 with an empty result** and a `remark`.
  Read naively that is "this country has no beaches"; `sources.overpass()`
  raises on the remark instead, and the caller falls back to querying the
  country in 4 degree tiles.
- **A regional mirror answers cleanly for the wrong planet.** overpass.osm.ch
  is a Swiss database and returned a well-formed empty result for Austria,
  which cost two countries before the pattern showed. Any mirror added to the
  list must be checked with a query outside its own country first.
- **An empty answer never replaces a non-empty cache.** Each country records
  `osm_ok`, set only when Overpass actually answered, and a run that comes back
  with nothing for a country that already has beaches keeps what it had. So a
  bad hour costs nothing and the next run picks the OSM half up where it
  stopped.

### Why a rebuild reproduces

- **The caches are the snapshot.** Every stage reads `cache/beaches/*.json`
  when it can. With the caches in place, a rebuild produces identical wire
  files apart from the `generated_at` stamp. Delete one cache to re-query one
  source. They are LOCAL ONLY and gitignored: 159 MB rewritten whole on every
  refresh does not belong in a 3 GB repository, and the LFS rule in
  .gitattributes (`cache/*.json`) does not reach a subdirectory anyway. A fresh
  clone therefore rebuilds from the sources, which is hours rather than
  seconds, and produces the same wire from the same world.
- **Every stage is deterministic.** Ranking sorts on score then id, the
  shortlist is cut by a documented pre score, ties break on the id, and no
  stage depends on dict ordering or on the clock.
- **The model is versioned.** `beauty_index.MODEL_VERSION` and the full weight
  table ship inside `index.json`, so a wire file can always be matched to the
  model that produced it.
- **The inputs are dated.** `index.json` carries `sources`: the harvest and
  enrich timestamp per country, and the mtime of the EEA cache. Two builds
  that differ can then be told apart, code moved or the world moved.
- **The gate runs before the write.** Every country is scored and validated
  first; only then is anything written. A validation failure leaves the
  previous wire standing rather than half replacing it.

## Where the beaches come from

| Source | What it gives | Licence |
|---|---|---|
| Wikidata | The named beach, its coordinates, region, main image, Commons category, sitelink count | CC0 |
| OpenStreetMap (Overpass) | Every other named `natural=beach`, plus surface, lifeguard, nudism, access, and what stands within 400 m | ODbL 1.0 |
| EEA WISE bathing water | The official bathing season class near the beach, Excellent to Poor | EEA re-use policy |
| Wikimedia Commons | Three or four photographs, each with author and licence | Per file |
| Wikipedia | Article facts (substrate, colour, setting, access) and pageviews | CC BY-SA, facts only |

Two things are deliberately **not** in that list.

**No places API.** Google Places, Foursquare and TripAdvisor all forbid
keeping what they return; a beach database built on them could not be stored,
only rented. Everything above can be kept.

**No Instagram.** The Basic Display API was retired in December 2024 and the
Graph API has no location search, so the popularity signal people reach for
there is not obtainable. The count of freely licensed photographs taken at a
beach does the same job, legally, and it is already in `acclaim`.

The OSM slice stays in its own fields (`osm_tags`, and the `osm` id in the
wire) and every published row carries its own `credit` array, the same
arrangement the trails wire ships under: selected, scored and rewritten items
are a produced work, and the ODbL obligation travels with the rows that used
ODbL data.

## The beauty index

Published in `index.json` under `model`, and shown to the reader as six bars
on every beach page. Each component is 0..1.

| Component | Weight | What it reads |
|---|---|---|
| setting | 0.26 | Cliffs, sea cave, rock arch, dunes, pines, lagoon, islet, reef, lighthouse, and whether it sits in a national park or reserve |
| acclaim | 0.20 | Sitelinks, pageviews, photograph count. 60% rank within its own country, 40% within Europe, both log scaled |
| water | 0.16 | The EEA bathing season class, with a half step for a class that just moved |
| sand | 0.14 | Substrate and colour: white, pink and black above golden, golden above shingle, shingle above rock; clear or turquoise water lifts all of them |
| wildness | 0.14 | Minus what is built within 400 m, plus boat only, steps or a walk in |
| comfort | 0.10 | Parking, toilets, showers, drinking water, food, lifeguard, step free access |

Plus a standout bonus of 0.15 times the strongest PHYSICAL component (setting,
sand, wildness only), so a beach that is exceptional in one way still ranks.
Score is `10 x` the total; the bands are 6.4, 7.6 and 8.6.

Five choices in there are worth defending out loud.

**Fame is capped and split.** Dias et al. (2024) surveyed 70 beach ranking
sites and found two thirds ranked with no stated indicator at all. The ones
with a method mostly count reviews, which returns the beaches that are already
famous and already full. Splitting acclaim between "best in its own country"
and "best in Europe" stops Greece and Spain, which have far more mapped and
photographed beaches than Latvia, from filling every page.

**Wildness subtracts.** A cove with nothing on it outranks a strip with forty
hotels behind it. This is the component the review-count rankings have
backwards, and it is what makes the small coves the tab was asked for reachable
rather than buried.

**No reading is not a bad reading.** A beach with no EEA site nearby scores
its country's median water class, not zero. Otherwise every wild cove would be
punished for being wild.

**Nor is it a good one.** The same rule cuts the other way for the two
components read off the ground. Wildness is one minus what is built within
400 m, so a beach the Overpass pass has not reached would score a perfect 1.0
for having no hotels nobody counted, and comfort would score 0.0 for having no
car park nobody looked for. An unmeasured beach gets 0.60 and 0.35 instead,
and the sentence "nothing is built on it" is only emitted where the ground was
actually swept.

**The bonus is not paid for fame.** Being the most talked-about beach in your
own country is true of exactly one beach in every country, landlocked ones
included, and paying a standout bonus for it put an Austrian lake lido above a
Cypriot cove on the first ranked page. Nor for an Excellent bathing class,
which is the common case rather than a distinction. The bonus is for setting,
sand and wildness.

## Why each beach is beautiful

The wire carries no prose. Every beach ships a `why` array of reason codes:

```json
"why": [{"k": "surface", "surface": "pebble"},
        {"k": "cliffs"},
        {"k": "waterExcellent", "site": "JALE"},
        {"k": "nationalPark", "name": "Llogara"},
        {"k": "boatOnly"}]
```

`src/lib/beachStory.js` turns those into sentences through `t()`, which buys
three things a written description could not have: the text lands in all six UI
languages, every sentence on the page maps to exactly one field in the data,
and the country files stay small enough to load at once. It is the same
arrangement `lib/trailStory.js` uses for hikes.

This is also why the page shows the component bars next to the prose. The
number is only worth as much as the reader's ability to check it.

### Claims the data cannot make

The protected-area cache holds CENTROIDS, not polygons, so "this beach is
inside the national park" can never be proved from it. What it can support is a
claim that stays true anyway, so the distance gates the wording: a national
park centroid within 3 km earns "it is on the coast of X, a national park"
(parks are large), a nature reserve earns "it sits inside X" only within
1.5 km, and anything further away is dropped from both the prose and the
score. Before that gate existed, a beach 5 km from a park was told it was in
one.

### Photographs, and the cove that has none

Three passes, in order: the Commons category on the Wikidata item, a name
search pinned to the coordinate with `nearcoord`, and, only when those come up
short, a plain geosearch within 300 m. The first two are precise but they only
find beaches somebody has NAMED a file after, which on the first Albanian run
was 22 of 141. The third fixes exactly the case this layer exists for, the
small unnamed cove, by moving the relevance test from the file name to where
the camera stood.

It has one failure mode, and the export handles it: eight named beaches inside
one bay (Ksamil) all borrow the same photograph. A lead photograph already used
by a better scoring beach retires the row, so the best of the cluster keeps the
picture and the name.

Card thumbnails are 500 px because upload.wikimedia.org serves only a fixed
list of widths and answers 640, 800 and 320 with a 400. Check with curl before
changing it.

## What gets published

A beach ships only if it has at least two relevant freely licensed
photographs, a name with a word in it beyond the local word for "beach", a
score of at least 5.6, and no better scoring beach within 150 m. Each country
keeps its best 120. A country with nothing that clears the gate does not appear
anywhere in the app, which is how "only countries that have beaches" is
enforced: by the data, not by a hand kept coastline list.

`top.json` is the Europe wide opening page: the best 240, capped at 12 per
country so the first screen is a tour of the continent rather than a page of
Greek islands. Typing a country's name in the search field swaps it for that
country's full list.

## What is not in the index yet

Two signals from the research this layer was built against are deliberately
absent rather than approximated.

**Blue Flag, per beach.** The programme awarded 4,323 beaches in 2025 and it
is exactly the kind of binary, auditable signal the index wants. What we have
is the country total (`pipeline/beauty_layer.py`) and whatever OSM mappers
tagged `blue_flag=yes`, which is a handful. The index already reads the OSM tag
and pays 0.10 of acclaim for it; a real per-beach list would need FEE's
published data and a check of its reuse terms first.

**Accolades from published rankings.** A beach appearing on several
independent lists is strong evidence, and cross-list agreement is stronger
still. Recording WHO ranked WHAT is a fact and is safe; republishing a list is
not, and the EU database right makes a scraper that sweeps fifty ranking sites
on a schedule a bad idea. The shape when it lands is one row per award,
`beach_id | awarding_body | list_name | year | rank | source_url`, entered by
hand a few hundred rows a year, log scaled and decayed by year so six mentions
cannot crush an unlisted cove. Nothing has been entered, because inventing
award rows to fill a column would be worse than an empty one.

## Checking it

```
cd continent-app
npm run build && npm run preview -- --port 4173
node scripts/verify_beaches.mjs
```

The harness checks what the brief asked for: beaches rather than trips, no
country dropdown, no priced-from, no stay tier, a pin and a place on every
card, three or four credited photographs on the page, composed prose with no
reason codes leaking through, the score broken into its parts, and no GPX or
route export anywhere on a beach.
