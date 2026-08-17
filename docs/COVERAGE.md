# Coverage and size fairness

Two problems, one cause.

**Mougins was missing.** 19,782 people, a perched village above Cannes, 58
Wikipedia languages, a Picasso museum, and it had simply never been proposed,
so it had never been added. The catalogue grew by people suggesting places, and
nothing ever enumerated what "everything" was, so nobody could see the hole.

**A perfect village could not out-rank a mediocre city.** Of the 40
destinations that reached "worth the journey" under rating_v2, nine had fewer
than 20,000 people, and eight of those nine were landscapes (Santorini, the
Dolomites, Lake Como) rather than built places. Not one village in Europe could
reach the top tier.

The cause is the same in both: **the catalogue measured size and called it
quality.** This document describes what replaced that.

---

## 1. Knowing what is missing

`data/reports/coverage/` holds one review sheet per country, ranked. It is
rebuilt from data already on disk plus one Wikidata pass.

### The candidate universe

`pipeline/build_place_candidates.py` -> `data/derived/place_candidates.json`
(90,401 rows, ~75 seconds, no network)

Three tracks, unioned:

| track | source | finds |
|---|--:|---|
| settlement | `cache/geonames_cities500.txt` | 89,323 European populated places |
| cluster | `cache/overture_pois_eu.parquet` | POI clusters with no settlement on them: national parks, cliff coasts, abbeys in fields |
| designated | `data/derived/place_registry.json` | places carrying an authoritative designation, including ones too small to be in the gazetteer |

For every candidate it measures sightseeing weight from the 807,130-POI
Overture corpus, and distance to the nearest shipped destination.

**The Voronoi split is the part that matters.** Measuring POIs in a plain
radius double-counts: one POI feeds every candidate around it, so a place
surrounded by a big city inherits that city's skyline. Levallois-Perret scored
2,035 that way, more than anywhere in Provence, because a radius around
Levallois is mostly Paris. Assigning each POI to its *nearest* candidate
conserves the mass, and Levallois drops to 75.7, which is roughly what is
actually in Levallois.

### Scoring

`pipeline/score_place_candidates.py` -> `data/reports/coverage_gaps.json` and
the per-country sheets.

`worth` blends five terms, deliberately including two that disagree:

- **mass** absolute sightseeing weight. Finds the notable cities nobody added:
  Augsburg, Besancon, Oviedo, Nottingham. Big places win this one.
- **intensity** mass divided by what a place that size normally has. Size
  cancels completely: Hallstatt runs 28x, Vernazza 18x, Positano 14x,
  Rothenburg 11x. A 500-person village can top this list, and does.
- **designation** membership of an authoritative register.
- **attention** Wikipedia sitelinks and pageviews. Smallest weight on purpose:
  the point is to find places that are missing *because* they are quiet.
- **stayable** population, saturating. Not quality, just whether you can sleep
  and eat there.

Two calibrations are load-bearing and both were measured, not chosen:

**Expected mass is fitted separately for coastal and inland places.** Overture
maps every beach segment as its own POI, so a 5,000-person seaside town carries
14.5 weight where a 5,000-person inland town carries 4.6. One shared curve made
every coastal town in Europe read as a 3x outperformer and buried the hill
villages under a wall of Adriatic resorts. Refit any time with
`score_place_candidates.py --fit`, which prints the current fit beside the one
in the file.

**Variety damps single-note places.** A resort strip is 90% "beach"; a real
town spreads across churches, museums, a castle and a park. Without this, forty
mapped beach segments outranked a cathedral city.

`covered` scales with the neighbour's size: 2.5 km around a village, ~15 km
around a capital. Mougins sits 5.7 km from Cannes and is not covered by it;
Levallois-Perret sits 6.1 km from Paris and is.

### The registers

`pipeline/place_registries.py` is the table; `harvest_place_signals.py`
resolves it. 24 place-level registers, ~10,400 member rows, 2,468 of which
match a candidate and 557 of which match something already shipped.

Two traps are encoded in the file so nobody hits them twice:

- **Level.** The same research turned up registers with 145,505 members
  (Swedish ancient monuments), 52,944 (French monuments historiques) and
  32,728 (UK scheduled monuments). Those are monuments, not destinations.
  They are recorded under `MONUMENT_REGISTRIES`, unused.
- **Modelled.** A register can be real, famous and absent from Wikidata. Los
  Pueblos mas bonitos de Espana has ~121 members and zero linking statements.
  Those carry `modelled: False` and a `fallback` pointing at the list that does
  exist, so the gap is visible rather than silently missing.

Verify every QID at any time:

```
python pipeline/harvest_place_signals.py --verify
```

### Notability, and the bug that hid in it

The harvester originally measured notability only for places that matched a
register. That is a circular filter: the attention signal could only ever
reinforce places a jury had already found, so a famous but undesignated place
carried **zero** notability.

Mougins is exactly that place. It belongs to no register, so despite having a
Wikipedia article in 58 languages it scored `sitelinks: None, views: None` and
ranked **359th of 843 in France**, below the promotion floor. The engine built
to stop Mougins being missed was still missing Mougins, one step further down
the pipeline.

Phase 3 fixes it: the same pageview measurement now runs over the best
undesignated candidates, so the requests go where a ranking decision actually
turns.

**Choosing which candidates to spend the request budget on turned out to be
the hard part, and two naive versions failed:**

Ranking by raw POI weight (mass plus intensity) put *Indre By, Kolonaki, City
of London, Innere Stadt, Paris 01 Louvre, Mala Strana* and *Gamla Stan* at the
top. A city-centre district is, by construction, the densest POI cluster for
its population that can exist. Mougins ranked **#6,727** and was never reached.

Ranking by the scorer's own `worth` was better but still returned Holborn,
five Paris arrondissements, the City of London, Etterbeek and the Giudecca,
because `score_candidate` waives its shadow penalty when intensity is high,
and district intensity is always high. Mougins reached **#2,610** and was
still one place outside the budget.

What works is excluding anything with a `parent_city`, and the reason is worth
keeping: a parent must be five times your size, Cannes is only four times
Mougins, so **Mougins has no parent** while Paris 01 has Paris. The pool then
opens with Zakopane, Rothenburg ob der Tauber, L'Aquila, Cambridge, Colmar,
Windermere, Stratford-upon-Avon, Oxford and Chester, and Mougins sits at
**#1,707**, comfortably measured. Parented places that genuinely are
destinations (Versailles) come in through their designations instead, which
cost no requests at all.

`fcode` looks like it should solve this and does not: Paris 01, Holborn,
Etterbeek and the Giudecca are all `PPL`, exactly like Mougins.

Two details matter:

- **Local-language Wikipedia, not English.** Mougins gets 113 views/day on
  `fr.wikipedia` against 94 on `en.wikipedia`, and for smaller continental
  places the gap is far wider. Ranking European villages by English readership
  measures how many English speakers looked them up.
- **Every title is coordinate-checked** against the candidate before its views
  count, because half the villages in Europe share a name with somewhere else.

The scorer changed with it: `attention01` now lets **pageviews win outright**
where they exist, instead of taking the maximum of views and sitelinks.
Sitelinks are useless in precisely the countries this catalogue cares about,
because Cebuano and Waray bots created an article for every commune: 37,762
French settlements carry 12 or more sitelinks, so the measure cannot separate
Mougins from a hamlet with a road sign.

### Known blind spots

Real registers Wikidata does not model. Each is a scrape away from being a
strong signal, and each currently means a country is under-served:

| register | members | country |
|---|--:|---|
| Los Pueblos mas bonitos de Espana | ~121 | ES |
| Bandiera Arancione | ~270 (10 modelled) | IT |
| Villes et Pays d'art et d'histoire | ~200 (9 modelled) | FR |
| Cittaslow | ~300 (3 modelled) | many |
| Die schoensten Doerfer Deutschlands | ~130 | DE |
| Les Plus Beaux Villages de Wallonie | ~30 | BE |
| Les Plus Beaux Villages de Suisse | ~50 | CH |
| Aldeias Historicas de Portugal | 12 | PT |

Spain and Italy are the biggest losses: both have famous village associations
that would surface exactly the places the catalogue is thin on.

The regional research pass also stopped early. France, Benelux, UK/Ireland,
Nordics and Baltics completed; DACH, Iberia, Italy, Visegrad, the Balkans and
the pan-European sweep did not, so `place_registries.py` covers those from
general knowledge plus live verification rather than a dedicated search.

### The gazetteer floor

The settlement track can only see what GeoNames `cities500` lists, and that
file is not the complete set of villages. **Bibury is not in it at all** (~627
people, no population recorded), so the engine cannot see it, and the UK has no
beautiful-village register modelled to catch it the other way. The same is true
of every famous hamlet under the gazetteer's floor.

Two ways out, neither done:

1. a fourth track over OSM `place=village|hamlet` nodes, which have no
   population requirement, filtered by the POI mass already computed;
2. GeoNames `allCountries.zip` instead of `cities500`, which is 1.5 GB but
   complete.

Until then: **a village that is both tiny and undesignated is invisible to
this system.** That is the one hole left in it, and it is the same shape as
the hole it was built to close.

### Promotion

`pipeline/promote_place_candidates.py` writes a spec file in the shape
`oneoff/add_gems_from_json.py` already consumes, and prints the command. It
never writes the catalogue itself: insertion stays on the one code path that
built every gem shipping today.

```
python pipeline/promote_place_candidates.py --per-country 3 --min-worth 0.60
# review the spec file, then
python pipeline/oneoff/add_gems_from_json.py app_data/new_gems_<date>.json
# then the enrichment chain, ONE AT A TIME (each writes the master):
#   harvest_images -> harvest_activities -> harvest_geonames
#   -> apply_beauty_layer -> apply_designations -> apply_place_layer
#   -> apply_rating_layer -> npm run data
```

Blurbs come out provisional and marked `_blurb_provisional`. They state only
what was measured, because an invented sentence about a village nobody has seen
is precisely what this catalogue cannot afford. The Wikivoyage guide pass
replaces them.

---

## 2. Rating v3: what changed and what did not

`pipeline/rating_layer.py`

```
score  = 0.70 appeal + 0.13 beauty + 0.11 highlights + 0.06 acclaim
appeal = curated score, read through the per-class scale (appeal_scale.py)
tiers    8.7 / 7.8 / 6.9
```

**highlights replaced things-to-do.** The old term counted every POI a place
had, which is a population measurement: it correlated +0.57 with log(population)
and +0.03 with what the curators thought of the place. It was 15% of every
score, handing roughly half a point to anywhere large for being large. The new
term sums only the best six sights, so it asks how good the best of what is here
is, which is the question a visitor on a two-day trip is actually asking.
Population correlation falls to +0.31.

**acclaim is new.** Membership of an authoritative register: someone else's
jury, with published criteria, already judged the place. The French list is
capped at 2,000 inhabitants, so it is one of the few quality signals in the
system that a village can win outright.

**The count that was removed is not lost.** It became `place.depth`, where
breadth is the answer rather than a bias.

The weights were grid-searched, not chosen: the search held the catalogue mean
at v2's 6.56 so the tier populations survive, and minimised the correlation
between the final score and log(population). Result: **+0.09 to -0.02**.

Cutoffs moved 8.5/7.5/6.8 -> 8.4/7.5/6.7 because the highlights term has a much
tighter spread than the count it replaced, which narrowed the whole
distribution. Without the recalibration, 45 destinations would have silently
lost "worth a visit" purely from the change in spread. The new cutoffs reproduce
v2's tier populations, so a destination changing tier means the model changed
its mind about that place rather than the ruler moving.

### The appeal ceiling, and how it was measured

Reweighting alone left the top tier almost all landscapes and cities, because
the binding constraint was not the data terms. Appeal is 70% of the score and
was hand-scored against anchors running "Rome 10 ... Charleroi 2.5" - all
cities. Scored against Rome, a village topped out around 8.5:

| population | n | mean appeal | share >= 8.5 |
|---|--:|--:|--:|
| <1k | 211 | 7.00 | 3.3% |
| 1-5k | 399 | 6.98 | 3.3% |
| 5-20k | 318 | 6.81 | 2.2% |
| 20-100k | 270 | 6.75 | 3.7% |
| 100k-500k | 182 | 6.44 | 4.9% |
| **500k+** | **72** | **7.47** | **36.1%** |

Of everything under 20,000 people, exactly ten scored appeal >= 9, and every
one is a landscape: Santorini, the Dolomites, the Amalfi Coast, Cinque Terre,
Lofoten, Lauterbrunnen, Lake Como, Meteora, Sognefjord, Zermatt. Not one built
village.

**How much of that gap is bias, and how much is real?** The obvious answer -
"lift every village" - would have been wrong, so the gap was measured instead.
Every destination was scored on independent, size-neutral evidence
(0.75 x beauty index + 0.25 x register acclaim, correlation with log-population
**-0.014**), and curated appeal compared at equal evidence:

| evidence quartile | city | town | village | area |
|---|--:|--:|--:|--:|
| bottom | -0.11 | -0.76 | **-1.00** | -1.06 |
| lower middle | +0.41 | -0.05 | -0.13 | -0.33 |
| upper middle | +0.82 | +0.88 | +0.69 | +0.51 |
| top | +0.60 | +0.94 | **+0.97** | +0.59 |

(positive = scored lower than a metro with the same evidence)

The markdown is not a level offset. Small places are scored **higher** than
metros at low evidence and up to a point lower at high evidence. It is a
**ceiling**: the curators compressed the top of the small classes.

### The fix

`pipeline/appeal_scale.py` applies one monotone map per class: below the class
median nothing changes, and above it `[median, best-in-class]` is bent onto
`[median, ceiling]` with an exponent of 0.7 so the upper middle gets its share
rather than the lift landing entirely on the single best member.

- **It never reorders.** The map is strictly increasing, so the curators'
  relative judgement is untouched. Only the spacing changes.
- **It is not percentile re-spreading.** No ranks are forced onto a target
  distribution. If the best village in the catalogue were a 7, the stretch
  would still leave it well short of the ceiling.
- **It closes about 30% of the measured gap, deliberately.** The gap is
  measured at equal *beauty and acclaim*, and a capital genuinely offers more
  than beauty: museums, food, music, architecture at scale. Some of the
  remainder is real. Closing all of it would assert a lovely village is Rome's
  equal in every respect, which is not the claim.
- Ceilings are not equal either: metro keeps 10.0, village and town reach 9.6.

Named checkpoints (`appeal_scale.EXPECTED`) are asserted by
`apply_rating_layer.py`, so a mis-set ceiling fails the run rather than quietly
shipping a shifted class.

### What actually changed

Tier cutoffs were re-cut a second time to hold the tier populations, so the
label keeps its meaning and only the *composition* moves:

| | before | after |
|---|--:|--:|
| mean score, <1k population | 6.49 | **6.76** |
| mean score, 500k+ | 7.24 | 7.15 |
| correlation with log(population) | +0.093 | **-0.035** |
| tier 3 size | 49 | 43 |
| tier 3 that are villages/towns/areas | 35% | **40%** |
| villages in tier 3 | 4 | **6** |
| metros in tier 3 | 20 | 13 |

Hallstatt (779 people) now reads 8.8, "Worth the journey". So do Zermatt,
Meteora, Lauterbrunnen, Kotor and Taormina, alongside Dubrovnik, Pompeii and
Sintra. The `<1k` and `1-5k` buckets are now the highest-scoring of every
bucket below 500k, where they used to be the lowest.

---

## 3. The place layer

`pipeline/place_layer.py` -> `dest.place`

```json
{"class": "village", "base": 0.22, "visit_h": 3.2, "depth": 0.56}
```

`class` is metro / city / town / village / area, from population. `base` is how
well the place works as somewhere to sleep (beds we can price, food, transport
that does not need a hire car). `visit_h` is hours to see the highlights.
`depth` is the old rating term in its proper home.

This is what the Destinations tab's size rail filters on, and it is why the
rating no longer has to answer "should I sleep here?". Hallstatt rates 8.2 and
bases 0.22, which is the honest reading: go, do not stay. Charleroi rates 3.9
and bases 0.86, which is the same honesty pointing the other way.

Two classification rules exist because the obvious version was wrong:

- **Islands are areas below city size.** An island entry stands for the whole
  island but carries its main town's population, so Ibiza read 49,727 and
  classed as a town. Nobody spends an afternoon on Corfu.
- **Region names are areas.** "Amalfi Coast" picks up Amalfi's 4,933 people and
  classed as a village; someone filtering to Villages expecting Riquewihr got a
  50 km coastline. Only the name before any parenthesis is read, because Carta's
  convention is "Place (what it is near)" and Agrigento (Valley of the Temples)
  is a city of 32,514, not a valley.

## 4. The size rail

`continent-app/src/browse/DestinationsTab.jsx`, under General: four circular
chips, Cities / Towns / Villages / Nature and islands, each with a live count,
multi-select. The same glyph rides on each card so the distinction stays
readable while scrolling.

`node scripts/verify_place_classes.mjs` (17 checks) covers the rail appearing
only when there are places to size, the counts, the union behaviour, clearing,
and the desktop pass.

One gotcha, already paid for: `useDestinationSearch.js` projects destinations
into priced rows, and anything not copied there does not exist to this tab.
`place` had to be added to that projection or every chip counted zero.

---

## Re-running the whole thing

```
python pipeline/build_place_candidates.py       # ~75s, offline
python pipeline/harvest_place_signals.py        # ~20 min, Wikidata + pageviews
python pipeline/build_place_candidates.py       # again, now with designations
python pipeline/score_place_candidates.py       # writes the country sheets
python pipeline/apply_designations.py           # dest.designations on the catalogue
python pipeline/apply_place_layer.py            # dest.place
python pipeline/apply_rating_layer.py           # dest.rating (v3)
cd continent-app && npm run data
```

Order matters twice: the candidate file must be built once before the signal
harvest (which matches against it) and again after, and the rating must run
after designations or `acclaim` is zero for everyone.
