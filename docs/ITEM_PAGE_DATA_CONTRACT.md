# Item page and trip page data contract (T430, T431)

Written 2026-10-15. This file is the hand-off between the page design (T430 and T431)
and the data work that follows it. It lists every slot the redesigned pages show, the
field that fills it, the shape the field must have, how full it is today, and what the
page does when it is empty. A model or a person filling data can work from this file
alone. The design rules behind it are in `.claude/skills/carta-design/SKILL.md`
("Detail pages", owner decisions of 2026-10-15).

The worked example is the five sample trips of the new styles
(`pipeline/journeys/sample_trips.py`): every trip slot below is filled in them.

## Rules for every field

1. **A missing value hides its slot.** The page never prints "Not recorded", a dash or a
   placeholder sentence. So leave a field out (or `null`) rather than fill it with
   something vague.
2. **No em dash, no en dash, no middot** in any text. A range is "10 to 15" or a typed
   pair `{low, high}`. Prices in prose use the euro sign and "to", never "€10, €15".
3. **Appeal first.** A hook or highlight line says why someone would go ("Turquoise water
   and one pine on a rock"), never a statistic (an area, a population, a founding year).
   The fact band carries the numbers.
4. **Photos are real and credited.** A Wikimedia Commons file, at least 1280 px on the
   long edge, with author, licence and file page. Never AI made, never stock people with
   laptops. A caption names the place shown in one to five words.
5. **Short.** A title up to 40 characters, a line up to 90. One sentence per line.
6. **One fact, one place.** A number in the fact band is not repeated in a sentence.

### The photo shape

The pages accept two spellings of one photo. New data should use the first.

| Field | Trip shape (`photos[]`, `hero`, day `photo`) | Layer shape (`images[]`) |
|---|---|---|
| File at 1280 px | `url` | `big` (and `u` for a 500 px thumb) |
| Size | `w`, `h` | `w`, `h` |
| What it shows | `credit` (the place name) or `caption` | `caption` (optional, new) |
| Author | `author` | `by` |
| Licence | `licence` | `lic`, `licUrl` |
| File page | `page` | `page` |
| Where on a route | (none) | `along_m` (optional, new): metres from the start |

`src/lib/itemPhotos.js` (`toPhoto`) reads both. A photo with no author and no licence is
dropped. A photo vetoed in `photoVeto` is dropped.

## The page order (every item page)

Gallery, then the head (name, rating, where, one hook), then the fact band, then Why go,
then the map with the climb (on the side column from 1024 px), then Before you go, then
the hand-off (one primary action, a cost line, secondary actions, Download PDF), then
getting there, then at most three folds of depth, then "Not quite right?" (alternatives),
then nearby, then one line of sources.

## Trail (`public/trails/trip/{id}.json`, `src/browse/TrailPage.jsx`)

| Slot | Field | Shape | Today (sample of 800) | When empty |
|---|---|---|---|---|
| Gallery | `images[]` | layer photo shape, `along_m` optional | 21% have any; 7% have 4 or more | The town's photo, then the drawn route |
| Name | `name` | text | 100% | (required) |
| Rating | `rating`, `rating_parts` | number 0 to 10 | 98% | No score chip |
| Hook | `highlights[0]` or `reasons[0]` | text | 70% / 95% | The head has no hook line |
| Facts | `duration_min`, `distance_m`, `ascent_m`, `descent_m`, `elevation.ele_max_m`, `waymark_ref` | numbers in minutes and metres | 98 to 100% | That fact hides |
| Loop chip | `is_loop` | boolean; the page also checks the ends are within 1 km | 100% | No chip |
| Why go | `highlights[]` | `{title, line, lat, lon}`; a photo within 1.5 km is matched | 70% | `reasons[]` as plain rows |
| Climb | `geometry` with a third coordinate (height) | GeoJSON MultiLineString `[lon, lat, ele]` | 98% | No profile |
| Before you go | `suitability`, `sac_scale`, `huts`, `water_points` | see `src/lib/beforeGo.js` | 98% | The block hides |
| Getting there | `stops[]` | `{name, lat, lon, mode}` | 2% | Only the start coordinates |
| Stages | `stages[]` | `{name, distance_m, ascent_m}` | multi-day only | Fold hides |

## Beach (`public/beaches/{cc}.json`, `src/browse/BeachPage.jsx`)

| Slot | Field | Shape | Today (2,984) | When empty |
|---|---|---|---|---|
| Gallery | `images[]` | layer photo shape | 100% have 4 | Flag-and-name placeholder |
| Hook | `why[0]` through `beachHighlights()` | a reason key | 100% | No hook line |
| Facts | `water.class`, `access`, `lifeguard`, `surface`, `lengthM`, `aspect` | see `beachStory.js` | 82%, 0.4%, 6%, 58%, 80%, 67% | That fact hides |
| Why go | `why[1..]` | reason keys, translated in the app | 97% have 2 or more | Plain rows |
| Before you go | `hazards`, `services`, `wheelchair` | | 27% services | The block hides |
| Cost line | `base` (a destination id) | id | 99.9% | No cost line |

Wanted next: `access` (how you reach the sand: steps, path, car park) is the most asked
and the least filled. `lifeguard` and blue-flag status come next.

## Lake (`public/lakes/{cc}.json`, `src/browse/LakePage.jsx`)

| Slot | Field | Shape | Today (1,815) | When empty |
|---|---|---|---|---|
| Gallery | `images[]` | layer photo shape | 100% have 4 or 5 | Placeholder |
| Swim | `swim` | `{ok, why}` | 100% | The swim dot hides |
| Facts | `size.areaKm2`, `size.depthM`, `size.elevM`, `water.class`, the warmest month | numbers | 98%, partial, partial, 56% | That fact hides |
| Why go | `why[]` through `lakeHighlights()` | reason keys | 100% | Plain rows |
| Walks | `walks[]`, `nWalks` | trail ids | 46% | The walks row hides |
| Before you go | `hazards[]` | keys | 100% | The block hides |

## Mountain (`public/mountains/{cc}.json`, `src/browse/MountainPage.jsx`)

| Slot | Field | Shape | Today (948) | When empty |
|---|---|---|---|---|
| Gallery | `images[]` | layer photo shape | 85% have 6 | Placeholder |
| Facts | `ele`, the way up (`acc`, `lift`), `prom`, `isoKm`, `season` | metres, keys | 100%, 83%, 100%, 97%, 100% | That fact hides |
| 3D map | `lat`, `lon` | numbers | 100% | 2D only when terrain tiles fail |
| Why go | `why[]` through `mountainHighlights()` | reason keys | 100% | Plain rows |
| Before you go | `hazards[]`, `diff` | keys, 1 to 5 | 100% | The block hides |
| Getting there | `near`, `acc` | town and access key | 99%, 83% | The row hides |

## Cycle route and tour (`public/cycling/route|tour/{id}.json`, `src/browse/CyclePage.jsx`)

| Slot | Field | Shape | Today (706 routes) | When empty |
|---|---|---|---|---|
| Gallery | `img`, `nimg`, detail `images[]` | layer photo shape | every route has a lead photo | The drawn route |
| Facts | `km`, `asc`, `dur`, `paved`, `bike` | numbers and keys | 100% | That fact hides |
| Why go | `why[]` | reason lines | 100% | Plain rows |
| Climb | `geometry` with heights | as trails | 100% | No profile |
| Getting there | `near`, the start station | | 82% | Start coordinates only |
| Family | `fam` | boolean | 49% | No chip |

## Trip (`Trips/carta-unified/carta-unified/data/trips.master.json`, wire `public/journeys/journey/{id}.json`, `src/browse/JourneyPage.jsx`)

Today means the 253 catalogue trips. The 5 samples fill every slot.

| Slot | Field | Shape | Today (253) | When empty |
|---|---|---|---|---|
| Card photos (swipe) | `hero`, `photos[]` | trip photo shape | hero 100%, photos 0% | One photo |
| Card visits line | `visits[]`, else `dayPlaces[].name`, else day titles | up to 4 place names | derived for 252 | The line hides |
| Gallery | `hero`, `photos[]`, `itinerary[].photo`, `highlights[].photo` | trip photo shape | 1 photo each | One photo |
| Title | `title` | up to 120 characters, shown in full | 100% | (required) |
| Hook | `highlights[0].line`, else `hook` | one appeal-led sentence | 0% / 100% (the `hook` field is often trivia) | No hook line |
| Facts | `durationDays`, `typeSpecific.distanceKm`, `typeSpecific.verticalM`, `typeSpecific.elevationM`, the bed kinds, `gatewayAirport` | numbers | partial by style | That fact hides |
| Difficulty | `profile.difficulty` (1 to 5), `profile.difficultyLabel`, `profile.difficultyNote` | | 100% | The chip hides |
| Why this trip | `highlights[]` | `{title, line, photo, day}` 3 to 5 | 0% | Derived from the bold names in the summary, no photos |
| Price | `budget.totalEur`, `budget.breakdown`, `budget.perDayEur` | euros, low and high | 100% | "Price on request" |
| Included | `included[]` and `notIncluded[]` (new) | short strings | 0% | The app's default: travel to the start, insurance and personal spending are not included |
| Is it for you | `bestPeriod.months`, `bestPeriod.avoidMonths`, `typeSpecific.audience` | months 1 to 12 | 100% | The month strip shows no weather |
| Day cards | `itinerary[]` | 7 days with `title`, `morning`, `afternoon`, `evening` | 100% | (required) |
| Day stats | `itinerary[].stats` (v2.0 record) or `itinerary[].dayStats` as an object (v2.1) | `{mode, distanceKm, ascentM, descentM, highM, timeMin {low, high}}` | 0% typed; a free string on every day | Read from the string where it parses (about 434 days), else the chips hide |
| Day photo | `itinerary[].photo` | trip photo shape | 0% | A highlight photo of that day, else none |
| Tonight | `itinerary[].sleepRef` into `accommodationStrategy[]` | rank 1 to 3 | partial | The `sleep` text alone |
| Day map | `dayPlaces[]` | `{day, name, lat, lon}` | 0% | No day map |
| Getting there | `gateways[]` (built from `logistics.gettingThere`) | `{name, code, minutes}` | most | The prose |
| Before you go | `logistics.bookingWindows`, `packingNotes[]`, `proTips[]`, `whatCouldGoWrong[]` | short strings | 100% | That card hides |
| Sample flag | `sample` | `true` | 5 trips | Shown like any trip; kept out of the sitemap |

Day stats, written once and read everywhere:

```json
"stats": {"mode": "walk", "distanceKm": 22, "ascentM": 420, "descentM": 470, "highM": 660,
          "timeMin": {"low": 330, "high": 330}}
```

`mode` is one of `ride, run, walk, hike, drive, ski, paddle, sail, swim, mixed, rest, bus,
train, ferry`. The schema is `schema/trip.generated.schema.json` `$defs/dayStats`.

## Trip styles

Fifteen since T431. A new style needs, in one change:

1. a row in `Trips/carta-unified/carta-unified/pipeline/common.py` `TRIP_TYPES` (and
   aliases), the enum in `schema/trip.generated.schema.json` and `schema/types.ts`;
2. its place in `pipeline/journeys/build_wire.py` `TYPE_ORDER`, and a photograph of
   people doing it in `TYPE_HERO_FILES` (or the samples lock);
3. the app tables: `src/lib/journeys.js` `TYPE_LABEL_KEY`, `src/lib/dataSheet.js`
   `SHEET_ORDER`, `src/lib/packGrid.js` `TYPE_KEY` and `BY_TYPE`, and `CUTS` in
   `src/lib/weekShape.js` when its days are measured in km or climb;
4. `journey.type{Name}`, `journey.typeDesc{Name}` and the `journey.pack.*` rows in all
   six catalogues.

## How to hand this to a model

Give it this file, the sample trip of the style (`data/trips/{id}.json`) and one target
record. Ask for the missing fields only, in the shapes above, with a source URL for every
fact and a Commons file page for every photo. Run `pipeline/validate.py` on the result
and reject, never repair. Runtime and pipeline AI is Gemini only (CLAUDE.md).
