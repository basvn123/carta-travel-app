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
  seed_lakes.py        the curated seed: 262 water bodies, 42 countries, and
                       the swimming rules that override every machine signal
  harvest_lakes.py     stage 1  Wikidata + the seed  -> cache/lakes/raw_CC.json
  enrich_lakes.py      stage 2  the shortlist, in full -> cache/lakes/rich_CC.json
  lake_images.py       is this photograph OF this lake, and is it the one to
                       lead with: the subject gate, the pixel probe, the beauty
                       score borrowed from Commons' own reviewers
  lake_index.py        the model: six components, three sub scores, the swimming
                       rule, the season estimate, the hazards, the reasons
  export_lakes.py      stage 3  score, gate, fill the country floor, validate
                                -> continent-app/public/lakes/
  build_lakes.py       all three, in order, in one command
```

```
continent-app/src/
  lib/lakes.js         the wire loader (index, top, per country, share links)
  lib/lakeStory.js     reason codes -> sentences, in six languages
  browse/LakePage.jsx  the page one card opens
  browse/DestinationsTab.jsx  the category itself
  scripts/verify_lakes.mjs    the headless check, plus a pass over the wire
```

## How it differs from the beach layer

The two layers share their clients, their cache discipline, their card and
most of their page. Three things are deliberately different.

**The spine is Wikidata, not OpenStreetMap.** The beach layer sweeps every
country for named `natural=beach` elements. The same sweep for `natural=water`
would return 168,000 named Finnish lakes, almost all of them a pond behind a
summer house, and would spend hours of Overpass time to do it. So this layer
takes two bounded Wikidata passes per country (the 700 most written about, the
250 largest) and asks Overpass only what is **around** each shortlisted lake.

**There is a curated seed, and it outranks the machine.** `seed_lakes.py`
names the water bodies travel writing actually names, including the ones
Wikidata records as small and ordinary: Lago di Sorapis, Rummu quarry,
Sorvagsvatn, the Blue Eye, Lovatnet, the Fairy Pools. Every entry is pinned
into its country's list, and its `swim` column overrides every machine signal,
because a wrong "yes" is the only field in this layer that can hurt somebody.

**Every country gets an answer.** After the ranked cut, a country holding
fewer than four entries has its own best relaxed in down to a floor score, and
a CURATED entry can fill the floor at any score. `index.json` records which
countries were filled that way. Nothing is invented: a country with two
publishable water bodies publishes two, and a country with none (Monaco) is
listed in `absent` with the reason.

That last rule is what San Marino needed. Its one water body is a pond at
Faetano with no elevation, no area, no bathing site and a swimming ban, and it
scores 3.7 out of a model built for Alpine tarns. It is also the only inland
water the republic has, and a human put it on the list knowing exactly that.
41 of the 43 in scope countries publish on the score alone; Monaco has nothing
to publish, and San Marino publishes through the seed.

## The model

`lake_index.py`, version `lake_index_v1`. Six components, each 0..1:

| Component | Weight | What it reads |
|---|---|---|
| setting | 0.30 | elevation, peaks, glaciers, cliffs, waterfalls, islands, forest, castles, turquoise and clear water, protection, surface area |
| swimming | 0.20 | the verdict first, then the estimated season length, official bathing sites, a beach or a lido on the shore, minus the hazards |
| acclaim | 0.18 | sitelinks, pageviews and photograph count, 60 per cent normalised within the country, 40 per cent across Europe |
| activity | 0.14 | kayak, sail, dive, fish, ferry, windsurf, a shore path, a cable car |
| water | 0.10 | the EEA bathing season class, plus clarity from the article |
| wildness | 0.08 | what is built within the shore radius, subtracted, with credit back for a lake you can only walk to |

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
the WorldClim 2.1 monthly air normals sampled at the lake's own coordinate and
applies three corrections that are physics rather than taste:

- **thermal lag**, each month is half itself and half the one before
- **solar gain**, up to about two degrees once the air is well above ten
- **depth and altitude**, deep water mixes and stays cold, and above about
  800 m the 5 arc-minute raster cell is usually lower than the lake in it

The model string rides in `index.json` under `model.season_model`. The wire
never carries a temperature series without `swim.est: true`, and the validator
refuses a build that does. Geothermal lakes get no estimate at all, because an
air temperature model says nothing useful about water heated from below.

## Rebuilding it

```
python pipeline/lakes/build_lakes.py                  # everything
python pipeline/lakes/build_lakes.py --countries SI   # one country
python pipeline/lakes/build_lakes.py --skip-harvest   # re-enrich and re-score
python pipeline/lakes/build_lakes.py --skip-enrich    # re-score only
python pipeline/lakes/build_lakes.py --no-context     # leave Overpass alone
python pipeline/lakes/build_lakes.py --dry-run        # what would ship
```

or through the orchestrator, which is where the cadence lives:

```
python run_pipeline.py --only lakes
```

A cold build is a few hours, most of it Wikimedia rather than Overpass. A warm
re-run is seconds and produces byte identical wire files.

### The two targeted re-runs

Both stages are per item idempotent, and both have a mode that spends network
only where it is needed.

```
python pipeline/lakes/enrich_lakes.py --rephotograph 2 --no-context
python pipeline/lakes/enrich_lakes.py --context-published --no-images
```

`--rephotograph N` re-shoots only the lakes holding fewer than N photographs,
which is what to run after changing the candidate rules. Adding Wikidata's P18
as a source rescued lakes the image gate had dropped; re-photographing all
3,809 shortlisted water bodies to reach them would have been hours of
somebody else's bandwidth for nothing.

`--photos-published` re-shoots the lakes already in `public/lakes`, and only
those. The strict picker costs about fifteen requests a lake, so running it
over the whole 3,809 shortlist to improve 1,125 published cards would be an
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

Two, unless one of them is evidence rather than a guess. The beach layer uses
a flat two, and it exists because a beach found by a blind geosearch and shown
under one borrowed photograph is a name on somebody else's picture. Applied to
lakes it dropped 618 of 3,809, and 302 of those carried a Wikidata P18: a
curated statement that this photograph depicts this lake. So the rule is two
photographs OR one that is provably of this lake, meaning the P18 or a file
named after it. A lone geosearch hit is still not enough.

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

## Countries with nothing

`index.json` carries an `absent` map: for each in scope country with no
published entries, either "nothing cleared the gate" or a written reason from
`seed_lakes.NO_WATER`. Monaco is the only entry in the second category. Keeping
the distinction matters: an empty list because the pipeline failed and an empty
list because there is nothing there are not the same fact.

Ukraine, Turkey and the Caucasus are named in the research this layer was built
from and are deliberately out of scope, because they are not in the catalogue's
43 countries. Ukraine additionally carries a wartime travel advisory.
