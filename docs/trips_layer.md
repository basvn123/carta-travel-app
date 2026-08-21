# The trip layer

Ready-made itineraries of two to fourteen days, composed and checked offline,
published to `continent-app/public/trips`, and read by the **Trips category of
the Destinations tab**, alongside Trails, Beaches, Lakes and Mountains.

The question it answers is the one a traveller actually has. Not "where should
I go", which the catalogue already answers three thousand ways, but **"I have
five days and I am thinking of Austria, what is the best thing to do with
them"**. That is a different question with a different answer for every day
count: five days in Austria is Salzburg and Vienna on the train, ten is a
third base, fourteen is a car loop.

## Why it is composed offline rather than generated live

Every AI trip planner on the market fails the same way: the plausible
itinerary. A route that reads beautifully and cannot be taken, a train that
does not run, a day trip that arrives at four in the afternoon, a village
booked for five nights that has eleven beds. Nothing on this layer is
generated at request time and nothing is written in prose by a model.

- Every stop is a place the catalogue already prices and rates.
- Every leg is priced and timed by a **Python port of the app's own leg
  estimator** (`trip_model.leg`, ported from `continent-app/src/lib/transport.js`,
  `countryTransport.js` and `groundFares.js`), so a composed trip and the same
  trip opened in the planner agree about how long Vienna to Salzburg takes.
- Every trip passes **ten hard checks** before it is written, and what could
  not be verified ships as a warning on the trip and prints on the page.
- Every sentence the app shows is composed in the app from reason codes
  through `t()` (`src/lib/tripStory.js`), so the text lands in all six UI
  languages and nothing can appear on screen that no source put there.

## Where it lives, and the one control

That category already existed and showed one thing: the 215 drawn one-day city
walks from the content lab. It now answers the question a traveller arrives
with, "how many days have I got", with the day count as the control:

| Chip | What it shows |
|---|---|
| `1` | the drawn city walks, unchanged, with their real route and geometry |
| `2` to `14` | the composed multi-day itineraries from `pipeline/trips` |
| any length | every composed itinerary, best first |

Nothing is lost and nothing is duplicated: a one-day walk and a five-day
itinerary are different objects answering the same question at different
lengths, and the day rail is what tells them apart. Each chip carries its own
count, so a length nobody composed is greyed out rather than offered.

## The three shapes

The three real shapes a European trip takes:

| Shape | Days | What it is |
|---|---|---|
| `base` | 2 to 6 | One bed for the whole trip, days out from it. The right answer for a short trip, and the only shape that does not spend a quarter of it moving luggage. |
| `chain` | 4 to 14 | Two to five bases in sequence, each leg on a train or a coach that actually runs. |
| `loop` | 6 to 14 | A car route that returns to where it started, and the only shape that reaches the places no train serves. A loop only ships when it **earns the car**: a stop with weak transport, or a railway the leg estimator rates fair or worse. |

## The pipeline

```
python pipeline/trips/build_trips.py
```

Three stages, each cached, each idempotent:

| Stage | Script | Writes |
|---|---|---|
| harvest | `harvest_routes.py` | `cache/trips/routes.json`, and extends `cache/wikivoyage.json` |
| compose | `compose_trips.py` | `cache/trips/composed.json` |
| export | `export_trips.py` (runs `validate_trips.py` first) | `continent-app/public/trips/` |

Shared ground lives in `trip_sources.py` (paths, the catalogue view,
attribution) and `trip_model.py` (the whole model: legs, bases, day trips,
themes, seasons).

A cold build is about five minutes, most of it the Wikivoyage harvest. A warm
re-run is about three. It is registered in `run_pipeline.py` as the `trips`
task on a **monthly** cadence, because it reads the ratings, the accommodation
anchors and the POI shortlists, and a trip is only as current as those.

## The one new harvest

`harvest_routes.py` is the only thing here that goes over the network, and it
only talks to Wikivoyage. It answers the question distance cannot: **which
places belong together**. Guessing that from a map produces routes that look
sensible and read as nonsense to anyone who has been there.

- **Go next.** Every city guide ends with a section listing where an editor
  thinks you should head next. Across a country that is a hand-drawn adjacency
  graph of real onward journeys: **4,286 resolved links across 1,277 places**.
  It is the strongest single signal in the composer, worth 2.2 points when it
  points forward.
- **Itineraries.** Wikivoyage has hundreds of written itinerary articles.
  Those whose stops resolve onto the catalogue in one tight corridor become
  corroboration: a composed route that follows one says so and links it.
- **Get in.** Which modes the arrivals section mentions, as booleans.
- **Article status.** `{{guidecity}}`, `{{starcity}}` and the rest, as a
  quality weight on a base and as the `no_written_guide` warning.

Only link structure, article class and coordinates are stored. No prose.

## The checks

`validate_trips.py`. Hard failures drop the trip and are counted in the run
summary, so a rule that starts quietly deleting a country shows up in the run
rather than in the app as an empty page.

| Check | What it refuses |
|---|---|
| `stops` | a stop that is not a rated, photographed, sleepable place |
| `no_repeats` | the same town twice, or two bases within 40 km |
| `nights` | one night in a base, or more nights than the place holds |
| `legs` | a leg that crosses water, exceeds its cap, or claims a train on a network without one |
| `loop_closes` | a loop that does not return, or drives more than 3 h a day |
| `daytrips` | a day out that does not fit a day, or has nothing to see |
| `plan` | a day with nothing on it, or a plan that does not cover the trip |
| `enough_to_do` | a base with fewer things to see than nights |
| `images` | a photograph from a host whose licence was never resolved |
| `cost` | a trip with no stay price, or an implausible one |

Soft warnings ship on the trip and print in the "What was checked" block:
no shared season, no editorial link, no written guide, sights spread out,
country-level stay prices, every stop crowded.

## The coverage floor

Ranking the whole continent on one scale starves Moldova, Malta and the
Faroes. That is a fact about the scale rather than about those countries:
they have four good places each and the scale was calibrated against France.
A country with fewer than four eligible bases takes its seeds from the top of
its own list instead, and every trip it produces carries a `thinCoverage`
reason so the page says so out loud. All 43 countries have trips.

## The wire

| File | What it is |
|---|---|
| `/trips/index.json` | which countries have trips, how many, which day counts, one cover photo, the attribution block |
| `/trips/top.json` | the best across Europe, capped at six per country |
| `/trips/{CC}.json` | every trip touching that country, as **cards** (about 1 kB each) |
| `/trips/trip/{id}.json` | one trip in full: stops, legs, days, gallery, checks (about 11 kB) |

The card and detail split is why picking a country costs about thirty
kilobytes instead of a megabyte. A trip that crosses a border is written into
every country file it touches, so `loadTripsFor` de-duplicates by id.

## The app

| File | What it does |
|---|---|
| `src/lib/trips.js` | the loader, the day-fit ranking, the `#itin=` share link |
| `src/lib/tripStory.js` | reason codes to sentences, in six languages |
| `src/browse/DestinationsTab.jsx` | the day rail, `ItinCard`, and the list |
| `src/browse/TripPage.jsx` | one trip: route on a map, day by day, cost, checks |
| `scripts/verify_trips.mjs` | 38 headless checks over the wire and both screens |

`Open in the trip planner` hands the stops to the planner through the same
door a shared trip uses, so every stop, night and date stays editable.

## Gotchas worth keeping

- **The catalogue's climate lives in two spellings.** The master has
  `climate.summary.best_months`; the served wire slims it to `climate.best`.
  Reading only the served spelling made every trip in Austria warn that its
  stops shared no season when all of them agree on May to September.
- **`place.visit_h` is a class constant**, not a per-place measure (a metro
  gets 16.8 h, a city 9.6, a village 3.4). Taking `min(visit_h, poi_count)`
  let the class alone decide how many days a base holds and gave Salzburg the
  same day and a half as every other city in the catalogue.
- **`base_score` is not clamped at 10 on purpose.** Clamping flattened Vienna,
  Salzburg and Florence to an identical 10.0 and the composer lost the ability
  to tell them apart. The wire clamps once, at export.
- **maplibre-gl.css arrives after styles.css** with the lazy chunk, same
  specificity, later sheet wins. `.itin-hero .trip-map` needs
  `inset: 0 !important` or the map draws in a strip down the right of the hero.
- **This tab has no `.places-card` class.** Its cards are `.places-dcard`,
  `.places-ccard` and `.places-tcard`, and the only shared pieces are
  `.places-card-img` (absolutely positioned at `inset: 0`) and
  `.places-card-scrim`. Building the trip card on invented `.places-card*`
  names left that image with no positioned parent to fill, so it escaped the
  card, covered the day rail and swallowed every click on the page. Headless
  Playwright reported it as "img intercepts pointer events", which is exactly
  what a person would have hit with a mouse.
- **`landmass_of` knows islands, not gulfs.** Tallinn to Helsinki is 82 km of
  Gulf of Finland and about 700 km of road, and both stops read as "the
  continent", so the estimator offered it as a 64 minute train. `SEA_PAIRS`
  and the Adriatic corridor rule in `trip_model.py` close that. This makes
  the composer **stricter than the app's own leg estimator**, which still has
  the blind spot: the pipeline refuses to publish a trip the planner would
  happily price, which is the safe direction for the asymmetry to run.
- **Wikidata carries events at coordinates.** "Battle of Vienna" was the top
  thing to see in Vienna until `_is_event` existed; it filters 848 of them.
  `_is_not_a_sight` removes another 1,208 universities, stadiums and hospitals,
  and `_usable_photo` ignores 406 logos and coats of arms standing in for
  photographs.
