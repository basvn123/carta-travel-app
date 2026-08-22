# The mountain layer

The Mountains category on the Destinations tab, end to end: where the summits
come from, what the index actually measures, how the way up is decided, how the
explanation on each page is written, and how to rebuild the whole thing from
nothing.

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
  the three figures shown on every page, and it is the one filter chip the tab
  offers.
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

## The chain

```
pipeline/mountains/
  peak_sources.py      the beach layer's polite clients, repointed at
                       cache/mountains
  seed_peaks.py        the curated seed: 393 mountains, all 43 countries, the
                       lift-served viewpoints fame does not find, and the
                       hazards a human looked up
  harvest_peaks.py     stage 1  the Wikidata spine + P610 high points + a hill
                       pass for thin countries + the seed
                                             -> cache/mountains/raw_CC.json
  enrich_peaks.py      stage 2  measurements, photographs, Wikipedia facts, the
                       Overpass access sweep, the nearest priced town
                                             -> cache/mountains/rich_CC.json
  peak_index.py        the model: five components, three sub scores, the way
                       up, the season estimate, the hazards, the reasons
  export_peaks.py      stage 3  score, gate, country floor, validate
                                             -> continent-app/public/mountains/
  build_peaks.py       all three in one command
```

The app reads it through `src/lib/mountains.js` (three artifacts: `index.json`,
`top.json`, `{CC}.json`), turns the reason codes into sentences in six
languages in `src/lib/mountainStory.js`, and renders `MountainCard` in
`browse/DestinationsTab.jsx` and `browse/MountainPage.jsx`.

## The harvest does not sweep

Wikidata types 247,164 mountains inside these 43 countries and Norway is
171,183 of that on its own. Querying that live would spend hours to bring back
a haystack the ranking then throws away, so stage 1 reads a spine that is
already on disk: `cache/features_wikidata.json`, harvested by the earlier
features build, with a coordinate, an elevation, a prominence, a sitelink count
and a P18 image per item.

Three live passes add what the spine cannot know:

- **P610 high points.** Wikidata records the highest point of a country and of
  its provinces and counties. One cheap query per country turns that into
  exactly the list the brief asks lowland countries to be filled from, and it
  is how the Netherlands gets an answer at all, because a 322 m hill is not
  typed as a mountain.
- **A hill and volcano pass** for countries with fewer than 900 spine rows,
  which is affordable exactly where the country is small.
- **The seed**, resolved by name against the pool and, where the pool missed
  it, by Wikidata entity search.

## The index

Five components, weighted, and each one is dropped rather than scored zero when
nothing was asked (see "Overpass is optional" below).

| Component | Weight | What it reads |
|---|---|---|
| scenery | 0.26 | shape (spire, wall, volcano, sea cliff), prominence against its own height, glacier, lake below, national park, UNESCO, the curated bonus, and 0.15 of fame |
| access | 0.22 | the way up: lift at the summit, road, chairlift, graded path, hut, minus what makes it hard, floored at 0.15 |
| acclaim | 0.22 | sitelinks and 60-day pageviews, split 60 per cent at home and 40 per cent across Europe |
| stature | 0.16 | prominence first, then isolation, then height against the tallest thing in the same country |
| experience | 0.14 | what is up there: viewpoint, summit restaurant, hut, observatory, summit cross, via ferrata, cave, wildlife |

Plus a standout bonus of 0.15 on the strongest of scenery, access and
experience, so a mountain that is exceptional in exactly one way still ranks.

Two of those deserve their reasoning written down.

**Fame folded back into beauty.** `FAME_TO_SCENERY = 0.15`. It is not circular
reasoning: the research spends a page on geotagged photograph density as a
validated proxy for scenicness, and the reason a mountain carries 92 Wikipedia
articles is usually that it looks like that. It is capped low enough that a
famous ordinary hill cannot climb past a beautiful unknown one on this term.

**The hard-route penalties apply only where the hard way is the only way.** The
first version subtracted the glacier, the climbing grade and the altitude from
every summit that had them, and put the Matterhorn 27th in Switzerland behind a
dozen ski hills, because you cannot walk up it. Nobody goes to Zermatt to stand
on the summit. Where a lift or a road puts you on the mountain, the climbing
grade is somebody else's problem.

## Photographs, and why relevance is a gate

The first build ranked candidates by plausibility and took the top six, so a
mountain with three good photographs got three good ones and three car parks.
An audit of the published wire found 30 per cent of gallery images with no
connection to their mountain at all: "Skiing in Andorra", "Road CS-240 at Coll
d'Ordino", "Andorra la Vella". Every one was a geosearch hit, which proves
only that somebody stood near the summit.

So a file is a candidate only when a source says it depicts THIS mountain:

| Evidence | What it is | Can it carry a gallery |
|---|---|---|
| `pinned` | Wikidata's P18 for the item | only when it also names the mountain |
| `article` | used in the mountain's own Wikipedia article | yes |
| `named` | the name is in the title, ObjectName or description | yes |
| `category` | filed in the mountain's own Commons category | no, and at most two per gallery |

Everything else is rejected, whatever it looks like.

After the gate, 98 per cent of published images name their mountain in the
file title, the object name or the description, against 70 per cent before it,
and 29 geosearch hits survive out of 3,718 images. 478 rows lost their gallery
entirely and are no longer published, which is the point: a mountain nobody
has photographed is better absent than illustrated by somewhere else.

Beauty is scored on top of that, and the strongest signal is not mine:
Commons publishes **quality**, **featured** and **valued** assessments per
file, and `imageinfo` returns them in the same request as the licence. A
Featured Picture of the right mountain is exactly "the actual beautiful view",
judged by photographers. After that come the words a photographer uses for
light and vantage point (sunrise, alpenglow, reflection, sea of clouds, seen
from), landscape aspect and resolution, against penalties for what merely
stands on a mountain (masts, huts, summit crosses, cable car cabins, car
parks) and outright rejection for somewhere else entirely (towns, roads, ski
resorts, interiors).

Two rules stop a bad source from winning, and both were written against a real
failure:

- **A Wikidata pin that never names the mountain drops to a supporting slot.**
  Tossal de la Llosada's P18 is `Skiing in Andorra.jpg`.
- **A gallery must be carried by a named or article picture.** Commons filing
  is loose enough that a photograph of the town of Andorra la Vella sits in
  Category:Tossal de la Llosada, because the ridge is on the skyline. A
  mountain with no carrying picture publishes nothing, and the export gate
  drops it rather than showing somebody else's view under its name.

## The way up, and where the claim comes from

`lift_of()` in peak_index.py, and the wire always records `src`:

- `osm` OpenStreetMap has aerialway or rack/funicular geometry within 700 m of
  the summit. Out to 3 km it becomes the weaker "lifts on the mountain".
- `curated` the seed says so, because a human looked it up.
- `wiki` the Wikipedia article mentions a cable car or a funicular on this
  mountain. That is evidence lifts exist here and NO evidence that one reaches
  this summit, so it may only ever produce "lifts on the mountain". The export
  validator enforces that.

None of the three knows whether the lift is running today, and the page says
so in its own line under the banner.

## Overpass is optional, on purpose

During the first build the public Overpass instance refused every connection
for over an hour and both mirrors answered a bare 500, while Wikidata, Commons
and Wikipedia were fine throughout. The layer is built so that does not block a
release:

```
python pipeline/mountains/build_peaks.py --no-context      # ship without it
python pipeline/mountains/enrich_peaks.py --context-only   # fill it in later
python pipeline/mountains/export_peaks.py                  # republish
```

`peak_index.evidence_for()` is what makes that honest. A country enriched
without the sweep has no evidence for "what is at the top" and often none for
"getting up", so those components are excluded and the remaining weights are
renormalised. The page then shows two figures instead of three rather than
printing a zero it did not earn.

## The gate

`export_peaks.py` publishes a mountain when it has two photographs (or one that
is provably of it, a Wikidata P18), a real name, a reason to be there, a score
over `MIN_SCORE` (5.0, which is about a third more rows than 5.5 and still well
inside what the tier words can describe honestly), a Wikidata country that
matches the file it is going into, and no better-scoring duplicate within a
kilometre. Then the country floor
relaxes the best of a thin country in, down to `FLOOR_MIN_SCORE`, and a seeded
entry can fill the floor at any score. `index.json` records which countries were
filled that way.

## Repairs that do not re-photograph

Photographs are the expensive part of a build. Three passes exist so a fix to
the cheap fields never costs Commons time twice:

```
python pipeline/mountains/enrich_peaks.py --recheck-country   # P17 + measurements
python pipeline/mountains/enrich_peaks.py --resync-seeds      # re-apply harvest pins
python pipeline/mountains/enrich_peaks.py --context-only      # the Overpass sweep
```

## Scar tissue

- **The spine is tiled by bounding box.** Switzerland's tile contains Mont
  Blanc and Italy's contains Triglav. Both are true statements about a
  rectangle and wrong answers on a country page, and a reader spots "Mont
  Blanc, Switzerland" instantly. The export gate checks Wikidata's P17, and a
  border mountain keeps every country P17 gives it, so the Matterhorn is
  published under Switzerland and Italy both.
- **Entity search returns the wrong mountain, confidently.** Searching "Pic
  Blanc Andorra" returns Aneto and Mulhacen among the hits. The first version
  appended every candidate to the pool whether it matched the seed or not, and
  both of those outranked the real Andorran summits on sitelinks. Only the
  candidate that resolves a seed is kept.
- **A token name match is a guess.** "Jungfrau" matched "Wengen Jungfrau" 6 km
  away and pinned Switzerland's rack railway onto the wrong item. An exact
  folded name now outranks a token match, whatever the distance.
- **Deduplication has to be gridded.** A pairwise scan is fine for Andorra's
  154 rows and hangs outright on Norway's 100,823.
- **Wikidata answers a badly planned query with a 504.** Elevation, prominence
  and isolation in one three-way UNION timed out on 70 items; three separate
  queries answer in a second each. The same lesson as
  `docs/LAKES.md`: split, do not union.
- **One item carries six elevations.** Mont Blanc has 4805.59, 4807.02,
  4807.81, 4808.06, 4808.72 and 4810.02, every one a real survey. Reading "the
  last row" put 4,887 m on its card. The preferred rank wins, and the median
  of the rest wins when there is no preferred.
- **A Commons category is alphabetical.** Asking for the first 30 files in
  Category:Teide returns "At Teide Observatory 2019 054" before anything that
  shows the mountain. A Wikidata P18 now outranks everything computable.
- **A skip-this-source flag must not discard that source's cache.** Straight
  from the lake layer: `--no-images` and `--no-context` now carry the previous
  cache's photographs and sweeps across instead of writing empty ones.
