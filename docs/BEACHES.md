# The beach layer

The Beaches category on the Destinations tab, end to end: where the beaches
come from, what the beauty index actually measures, how the explanation on
each page is written, and how to rebuild the whole thing from nothing.

Version 2 (`beach_beauty_v2`), per `03-BEACHES.md`. The v1 sections that did
not change are kept rather than rewritten, because the arguments in them are
still the arguments.

## What changed in v2, and why

v1 harvested 25,475 beaches and published 1,191 of them across 38 countries.
Spain, France, Great Britain and Portugal each published **exactly 120**,
which is the signature of a constant deciding a catalogue: `PUBLISH_MAX=120`.
Nobody had ever looked at what sat at 121. Belgium published 2, which is why
the beach list opened from Knokke ran 3 km, 3 km, then 135 km.

**The harvest was never the problem. The gate was.** Four things changed, in
this order.

- **The bulk OSM pass moved off Overpass and onto the Geofabrik extracts this
  repository already keeps.** 30 GB of country files were already on disk for
  the trails layer. Reading them with pyosmium is local, deterministic, and
  immune to all three ways Overpass had broken this layer before. It also made
  the widening affordable: `natural=shingle`, `natural=sand`,
  `leisure=beach_resort` and `leisure=swimming_area` alongside
  `natural=beach`, UNNAMED beaches named from the nearest bay or village, and
  the beach LENGTH read off the geometry.
- **The EEA bathing water register became a SPINE rather than an
  enrichment.** The layer had always read the register's CLASS. It had never
  read the register's LIST. There are 22,289 designated bathing sites in it,
  every one a place a European government says people swim, with a coordinate
  and up to ten seasons of classification, and a great many of them are not
  tagged `natural=beach` anywhere in OpenStreetMap. Reading the list cost no
  network at all: the file was already in `cache/`.
- **`PUBLISH_MAX` stopped binding.** It is 900 now, a sanity ceiling far above
  the sum of any country's region quotas rather than the thing that decides
  what a coast carries. The region quota from `pipeline/regions` decides that.
- **A beach that misses a gate is listed rather than deleted.** The rated tier
  asks for four photographs and a strongly evidenced lead; what fails falls
  through into `listed`, which ships without a score at all.

Together: **34,068 harvested beaches became 58,881**, and the tail that the
constant used to cut now lands in a tier that says what it is.

Two numbers moved that were not in the brief, and both were bugs the widening
exposed.

**`fold()` deleted every non-Latin alphabet.** The name test ("a word beyond
the local word for beach") is built on `name_tokens()`, which is built on
`fold()`, which ended by removing everything outside `[a-z0-9 ]`. For a name
written in Greek or Cyrillic that removed the whole name, so the beach had no
tokens and the name test failed. It was a hard gate on both tiers, so those
beaches could never publish under any circumstances. Measured across the
harvest: **1,850 beaches, including 1,228 in Greece** (37 per cent of the
country) and 74 per cent of Bulgaria. `fold()` now spells Greek and Cyrillic
into Latin first. The tables are a comparison key, not transliteration for a
reader: nothing built on them is ever shown on screen.

**San Marino published 2,415 beaches.** It is landlocked. Geofabrik cuts by
its own regions, so San Marino and Italy share one extract, and the country
filter that separates them (`belongs_to`) is deliberately generous: a point
outside a country's simplified outline still counts unless it is demonstrably
inside a neighbour's, because the shapes are drawn at continent zoom and a
strict test deletes the Balearics from Spain. A beach on the Adriatic sits ON
Italy's simplified coastline rather than inside it, so "not demonstrably
inside Italy" was true of most of the Italian coast. Where two countries share
an extract, containment in the country's own outline is now the only test.

## The chain

```
pipeline/beaches/
  sources.py           polite clients: Wikidata, Overpass, Commons, Wikipedia
  osm_extract.py       NEW  the bulk OSM pass, pyosmium over Geofabrik
  eea_spine.py         NEW  the bathing register read as a candidate source
  uk_bathing.py        NEW  Defra England and Wales (blocked, see open items)
  coastline.py         NEW  which way a beach faces, and the sunset
  protection.py        NEW  Natura 2000 + Emerald polygons, EU and non-EU
  harvest_beaches.py   stage 1  every named beach   -> cache/beaches/raw_CC.json
  enrich_beaches.py    stage 2  the shortlist, in full -> cache/beaches/rich_CC.json
  beauty_index.py      the model: eight components, the reasons, the ids
  export_beaches.py    stage 3  score, gate, validate -> continent-app/public/beaches/
  build_beaches.py     all three, in order, in one command
```

```
continent-app/src/
  lib/beaches.js       the wire loader (index, top, per country, share links)
  lib/beachStory.js    reason codes -> sentences in six languages, and
                       BEACH_FACETS, the nine filter groups
  browse/BeachPage.jsx the page one card opens, score badge included
  browse/DestinationsTab.jsx  the category itself
  scripts/verify_beaches.mjs  the headless check
```

## Rebuilding it

```
python pipeline/harvest_bathing_water.py --sites-only   # the register, once a year
python pipeline/beaches/protection.py --fetch           # Natura 2000 + Emerald, once
python pipeline/beaches/osm_extract.py                  # the extracts -> osm_CC.json
python pipeline/beaches/harvest_beaches.py --reuse-wikidata
python pipeline/beaches/enrich_beaches.py
python pipeline/beaches/export_beaches.py
```

`--reuse-wikidata` is the switch to use when the OSM half changed and Wikidata
did not, which is what moving the bulk pass onto the extracts is: the Wikidata
rows are already on disk and re-asking SPARQL 43 times to be told the same
thing is both rude and slow.

The osmium sweep is the long pole and it is entirely local: about four minutes
per gigabyte of extract, so roughly two hours for the 30 GB of Europe, and the
result is cached per country. France alone is 5.1 GB.

Three performance facts that are not optional, all measured on this box:

- **Filter on tag VALUES, not on tag keys.** A `KeyFilter` on `natural` hands
  Python every tree, pond and scrub polygon in the country: 386 seconds and
  3.66 million objects for Spain, against 239 seconds and 677 thousand for the
  identical answer filtered on values. The filter runs in C++; everything that
  reaches Python has already been decided.
- **Never walk a land polygon's exterior ring.** `project()` and
  `interpolate()` on a ring with millions of vertices is the quadratic ring
  walk this repository has paid for before. Reading a beach's aspect that way
  took three seconds per beach. Against the coastal stretches
  `pipeline/regions` already cut to 40..120 km it takes one millisecond.
- **`STRtree.query(predicate='contains')` does not answer point-in-polygon.**
  It runs its predicate against a PREPARED copy of each tree geometry, and
  prepared `contains` returns False for a point that the same polygon's own
  `.contains()` returns True for. The first version of the land test therefore
  answered "not land" for Brussels, Madrid and every beach in Europe, which
  gave every beach two sea probes and no aspect at all. Use `intersects`.

Overpass is still in the chain for the 400 m context sweep, and the three
rules that exist because it broke in three different ways still apply to it
(a timed-out query returns HTTP 200 with an empty body and a remark; a
regional mirror answers cleanly for the wrong planet; an empty answer never
replaces a non-empty cache). That last guard is now scoped to Overpass ONLY.
A Geofabrik extract cannot lie in that way, so an empty answer from it is
believed, which is what lets a landlocked country correctly publish nothing.

### Why a rebuild reproduces

Everything v1 said still holds: the caches are the snapshot, a switch controls
the network and never the data, every stage is deterministic, the model is
versioned, the inputs are dated, and the gate runs before the write.

The v2 additions follow the same rules. `osm_extract.py` writes one cache per
country and records which extract and which download day produced it.
`coastline.py` and `protection.py` stamp their answers into the rich cache and
mark the row as asked, so `{}` ("we looked and found nothing") never reads the
same as absent ("nobody looked"). The carry-over block at the top of
`enrich_country` now copies `aspect`, `shore_km`, `sunset_facing`,
`protection`, `sst` and `approach` across before any phase runs, for exactly
the reason the photographs and the article facts are copied there: this list
is rebuilt from the HARVEST cache every run, so anything a phase decides not
to fetch again has to be copied or the rewritten cache loses it.

## Where the beaches come from

| Source | What it gives | Licence |
|---|---|---|
| OpenStreetMap via Geofabrik | The bulk: named and unnamed beaches, shingle, sand, beach resorts, swimming areas, the surface, lifeguard, nudism and access tags, and the LENGTH off the geometry | ODbL 1.0 |
| EEA WISE bathing water | Both a spine and a reading: 22,289 designated sites with a name, a coordinate and ten seasons of class | EEA re-use |
| Wikidata | The named beach, its coordinates, region, main image, Commons category, sitelink count | CC0 |
| Wikimedia Commons | The photographs, each with author and licence | Per file |
| Wikipedia | Article facts (substrate, colour, setting, access) and pageviews | CC BY-SA, facts only |
| Natura 2000 + Emerald Network | 29,749 protected site polygons, EU and non-EU | CC BY 4.0 |
| EEA coastline for analysis | Which way a beach faces | EEA re-use |
| OpenStreetMap via Overpass | What stands within 400 m | ODbL 1.0 |

Still deliberately **not** in that list: no places API (Google, Foursquare and
TripAdvisor all forbid keeping what they return), and no Instagram. Added to
the refusals in v2: **WDPA / Protected Planet**, which is the obvious
"protected areas API" and is non-commercial, and is the single biggest legal
trap in this space.

## The beauty index

Eight components now, each 0..1, published in `index.json` under `model` and
shown to the reader as bars on every beach page.

| Component | v1 | v2 | What it reads |
|---|---|---|---|
| setting | 0.26 | 0.24 | Cliffs, sea cave, rock arch, dunes, pines, lagoon, islet, reef, lighthouse, and whether it sits in a park or reserve |
| acclaim | 0.20 | 0.18 | Sitelinks, pageviews, photograph count. 60% rank within its own country, 40% within Europe, log scaled |
| water | 0.16 | 0.16 | The EEA bathing class, with a half step for a class that just moved |
| sand | 0.14 | 0.14 | Substrate and colour |
| wildness | 0.14 | 0.14 | Minus what is built within 400 m, plus boat only, steps or a walk in |
| comfort | 0.10 | 0.10 | Parking, toilets, showers, drinking water, food, lifeguard, step free |
| **space** | - | **0.06** | How long the beach is, normalised inside its own coastal stretch |
| **photo beauty** | - | **0.06** | The mean beauty of its best three photographs, capped |

Standout bonus: 0.15 of the strongest PHYSICAL component, now including
`space`. Score is `10 x` the total; the bands are 6.4, 7.6 and 8.6, unchanged.

### The weight table does not add up, and what was done about it

`03-BEACHES.md` trims setting by 0.02 and acclaim by 0.02, then adds two
components worth 0.06 each. That frees 0.04 and spends 0.12, so the table as
written sums to **1.08**, and the brief's own word for the trims ("make room")
says that was not the intention.

Shipping it unbalanced would not have been a neutral choice. The score is ten
times the weighted sum, so every beach in Europe would have scored about eight
per cent higher against band cutoffs the brief leaves unchanged, and the top
of the range would have compressed against the 1.0 clamp until a 10.0 stopped
meaning anything.

So the brief's RATIOS ship exactly as written and the sum is normalised back
to 1.00. Both tables go into `index.json`, as `weights` and
`weights_as_briefed`, so the deviation is visible from the wire rather than
buried in a comment. `verify_beaches.mjs` asserts both that the published
weights sum to 1 and that the brief's own table ships beside them.

### `space`, and why it is not just "length"

A four kilometre strand and a sixty metre pocket cove are different products
bought for different reasons, and nothing in v1 could tell them apart. The
length comes off the OSM geometry: a beach mapped as an open way IS its
length, and a beach mapped as a closed polygon has none, so half its perimeter
is used, which is exact for a long thin rectangle and the right order of
magnitude for everything else a beach is shaped like. Which of the two was
measured rides in the row.

It is normalised **inside its own coastal stretch**, not against a European
constant. A Norwegian fjord beach and a Costa de la Luz strand cannot share a
yardstick: 400 m is a big beach on one and a small one on the other. The
median beach on a stretch scores 0.63.

It doubles as a crowding proxy. A high `space` next to a low `comfort` is the
arithmetic of "you will have it to yourself".

### `photo beauty`, and why it is capped

A place that photographs well is genuinely a better beach day, which is what
earns the component its 0.06. But how MANY good photographs exist of a beach
is a popularity signal wearing a different hat, so the component reads the
MEAN of the best three rather than the count, and it is clamped at 0.9. It is
also excluded from the standout bonus for the same reason acclaim is.

The scores come from the photo engine (`pipeline/photos/selection.py`,
`photo_rank_v1`), which already wrote them onto the cached image records. This
reads what is there and derives nothing.

### No reading is not a bad reading, and v2 finally acts on it

v1 gave an unmeasured beach a documented default. v2 keeps that where a
default can be honestly computed and **drops the component and renormalises
the remaining weights** where it cannot. That is invariant 6, and the
difference between the two cases is whether any source covers the country at
all.

- A beach with no bathing reading in a country the register covers scores its
  country's MEDIAN class. A wild cove must not be punished for being wild.
- A beach in a country **no register covers** gets no water component at all.
  The remaining seven weights are renormalised over what is left. Norway,
  Iceland, the non-Albania Balkans and (until the Defra block lifts) Great
  Britain are in this case, and the card says so through the
  `water_unknown_no_source` code rather than showing a number nobody earned.
- Same rule for `space` where no geometry was digitised, and for `photo` where
  the beauty engine has not run over the row. A row is not judged ugly; it has
  not been judged.

A component that was dropped is **absent from `comp`**, not zero, so the page
draws seven bars instead of eight and the `bestFor` rules read every component
through `.get()`. Indexing one directly raises on exactly the rows the rule
exists to protect.

## The gate

```
name test       a word beyond the local word for beach   hard, BOTH tiers
score gate      >= 5.6, bands 6.4 / 7.6 / 8.6            -> candidate 'r'
photo gate      >= 4 images, LEAD at p18|cat|name        -> 'r' confirmed
                failures fall through, they do NOT disappear
dedupe          no better beach within 150 m             hard, BOTH tiers
region quota    top-N by score per coastal stretch       trims 'r'
floor fill      every applicable NUTS3 >= 1 row,
                every coastal stretch >= 3 rows          adds 'l'
country ceiling PUBLISH_MAX = 900, a sanity ceiling far above the quota sum
top.json        240 at 12 a country, 'r' only, ever
```

The load bearing change is that a score or photo failure falls through into
the listed pool instead of deleting the beach. The name test and the dedupe
are hard on both tiers, so they drop a row outright: a row nobody can name is
not coverage, and the same sand twice under two names is worse than once.

**The lead photograph is what the photo gate is about.** v1 asked for two
pictures and for at least one of them, anywhere in the gallery, to be strongly
evidenced. That let a geotagged frame lead the card while a name-matched
picture sat in slot three, which is exactly backwards: the lead is the one
picture most people ever see of a beach, so it is the one that has to prove it
is this beach.

The `listed` tier's own bar is one strongly evidenced photograph, or none and
the card is drawn from the map (`no_photo_map_card`). A weakly evidenced
picture is refused outright there, and that is stricter than the rated tier
on purpose: a listed row has no score to argue with, so its one photograph is
the whole of what the card claims.

## New in the wire

Every row, both tiers, may now carry `size` (cove / beach / strand), `aspect`
(the true bearing out to sea), `sunset`, `prot` (the protected site it is
INSIDE, from polygons), `sst`, and `nameSrc` where the name was not the
beach's own: `eea` for a bathing register name, `osm_near` for one borrowed
from the nearest named bay or village. Rated rows also carry `space` and
`photo` in `comp`. Country files and `index.json` carry a `facets` block.

`beachStory.js` gained the codes `sunset_facing`, `long_strand`,
`pocket_cove`, `water_unknown_no_source`, `natura2000`, `emerald` and
`no_photo_map_card`, in six languages, alongside `unrated_coverage`.

## The filter rail

The tab shipped three chips and two of them read zero in every scope:
"Excellent water 2", "Nothing built on it 0", "Lifeguard 0". A filter showing
a zero tells the reader the filters are broken even when they are honest.

Nine groups now (`BEACH_FACETS` in `lib/beachStory.js`), the same grouped
shape the lake and mountain rails use: water quality, underfoot, setting, how
wild, size, facilities, naturist, protected, best for. Every option is backed
by a field the pipeline publishes, and one rule of its own that the sibling
layers do not follow because this brief is explicit about it:

**A chip whose count is zero in the current scope is not rendered.** Not
greyed out. Absent. A disabled control still occupies the rail and still reads
as something that ought to work, which is exactly the impression "Nothing
built on it 0" gave. A chip the reader has already SELECTED always survives,
even at zero, because removing the control they just tapped would strand them
in an empty list with no way back out.

Counts are computed both ways on purpose. The wire carries a scope-wide count
per facet (written by `export_beaches.facet_counts`, zeros omitted so a
consumer that renders whatever it is given cannot render an empty chip), and
the app recomputes them live, because a chip's count has to answer "inside
what the other chips already narrowed".

## The score badge opens

The weights were already in the wire and the components were already on the
row, so surfacing them was nearly free and it is the strongest trust move
available: a 6.7 nobody can take apart is an opinion with a decimal point.
Tapping the badge on the beach page shows each component with its score AND
its weight.

## What is still not in the index

**Blue Flag, per beach.** Unchanged from v1 and confirmed by the brief:
`blueflag.global`'s map system is offline with no API, no GeoJSON and no
per-site list, so there is nothing to harvest. The 0.10-of-acclaim slot stays
empty and correct rather than approximated. If it is ever wanted it is an
annual manual import of the FEE published list plus a reuse check, which is a
content job and not an engineering one.

**Accolades from published rankings.** Designed and empty, for the same
reason. Worth doing for the top 200 beaches only.

## Open items

- **Defra England and Wales.** The client is written to the documented API and
  the licence is Open Government Licence v3.0, but every path under
  `environment.data.gov.uk/bwq/` answers HTTP 403 from an Azure Application
  Gateway while the same host's root answers 200. That is a network-level
  block, not a retired service. Until it lifts, Great Britain publishes with
  the water component dropped.
- **SEPA (Scotland) and DAERA (Northern Ireland).** Not wired at all. The
  brief flags them unverified and they need a portal read first.
- **Northern Ireland's beaches.** Geofabrik files them in the Ireland extract
  while they belong to Great Britain, and the country filter drops them from
  both. A small, known gap.
- **Sea temperature climatology.** Copernicus Marine is the right source
  (free, commercial use permitted, and a static per-beach number fits the
  cache-is-the-snapshot invariant far better than a runtime API). Open-Meteo's
  free marine endpoint is NON-COMMERCIAL and must not be used. The `sst` field
  is in the wire contract and nothing writes it yet.
- **The four-photograph target.** The gate is in place and the funnel is
  widened, but the photo pass over the new candidates is hours of Wikimedia's
  bandwidth and has not been run to completion. Until it has, rows that would
  clear the score gate sit in `listed` for want of pictures, which is the tier
  model working as designed rather than a failure.

## Checking it

```
cd continent-app
npm run build && npm run preview -- --port 4173
node scripts/verify_beaches.mjs
```

The harness checks what v1 checked, plus what v2 added: the model block is
`beach_beauty_v2` and its weights sum to 1, the brief's own table ships beside
them, no country's count equals the ceiling or the old 120, every rated row
carries four photographs and a strongly evidenced lead, every rated row
carries its region block, `top.json` is rated only, listed rows carry no score
of any spelling and never interleave into the ranked array, a listed
photograph is always strongly evidenced, no facet count in the wire is zero,
no chip on screen renders a zero, and the score badge opens a breakdown that
shows each component's weight.
