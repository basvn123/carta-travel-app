# Carta — unified trip schema (v2.0)

One record = one 7-day itinerary. Every record in `data/trips.master.json` obeys this
contract, whichever of the four source batches it came from. `schema/types.ts` is the
TypeScript expression of the same contract; the Supabase migrations in
`supabase/migrations/` are its relational projection.

## Identity

| Field | Type | Notes |
|---|---|---|
| `id` | string | Primary key. `{cc}-{tripTypeSlug}-{nameSlug}`, lowercase. Stable across rebuilds. Collisions get a numeric suffix. |
| `sourceId` | string \| null | The id the record carried in its original batch. Kept so the source files stay traceable. |
| `slug` | string | Same as `id`; present for routing clarity in the app. |
| `title` | string | Editorial title, unchanged from source. |
| `summary` | string | ≤220 chars for card views. Falls back to the editorial hook; if a batch supplied neither, it is composed from metadata and `summaryGenerated` is `true`. |
| `summaryGenerated` | boolean | `true` means no human wrote this summary — a rewrite candidate. |
| `hook` | string \| null | The source's blockquote lede, where one exists. |

## Placement

| Field | Type | Notes |
|---|---|---|
| `country` / `countryCode` | string | Primary country; ISO 3166-1 alpha-2, with `XK` for Kosovo. |
| `countries[]` | `{name, code}[]` | Every country the trip crosses. One record is genuinely cross-border (Montenegro → Bosnia and Herzegovina). |
| `isMultiCountry` | boolean | `countries.length > 1`. |
| `region` / `regionKey` | enum | `Western & Central Europe` · `Southern & Mediterranean Europe` · `Eastern & Southeastern Europe` · `Northern Europe & Baltics`. Reflects the batch the trip was authored in, which is also its editorial home. |
| `subRegion` | string \| null | Free text, e.g. `Stubai Alps, Tyrol`. |
| `basecamps[]` | string[] | Towns the week is run from. |
| `gatewayAirport` / `gatewayAirportCode` | string \| null | Name plus a conservatively extracted IATA code. |
| `coordinates` | object \| null | `{lat, lon, precision, matchedPlace, source}`. **`precision` matters**: `source` = stated in the source record; `city` = a named basecamp or sub-region town resolved against GeoNames, or (`source` "itinerary places (geonames ...)", T090) the best-supported place the itinerary names, inside the stated countries, from cities500 and the GeoNames country files; `gateway` = only the gateway airport's city resolved, which can be hours from the trip; `country` = capital-city fallback, a map pin rather than a location, and a validator error since T090. |

## Classification

| Field | Type | Notes |
|---|---|---|
| `tripType` / `tripTypeId` / `tripTypeSlug` | enum | The ten canonical types, ids 1–10 (see below). |
| `durationDays` | 7 | Constant across the dataset; enforced by a CHECK constraint. |
| `tags[]` | string[] | Lowercase hyphenated facets. |
| `profile.difficulty` | 1–5 \| null | Normalised from four different source scales. `null` where the source never rated the trip. |
| `profile.difficultyLabel` / `fitnessLevel` | enum | `Easy` · `Moderate` · `Active` · `Demanding` · `Expert`. |
| `profile.difficultyNote` | string \| null | The source's own difficulty sentence, kept verbatim. |
| `profile.crowdLevel` | enum \| null | `Low` · `Moderate` · `High`. Only the W&C batch stated it. |
| `profile.familyFriendly` / `carRequired` | boolean \| null | Same. |

### Trip type ids

| id | Type | slug |
|---|---|---|
| 1 | Cycling Trips | `cycling` |
| 2 | Trail Running | `trail-running` |
| 3 | City Trips | `city` |
| 4 | Cozy Towns Trips | `cozy-towns` |
| 5 | Road Trips & Scenic Drives | `road-trip` |
| 6 | Hiking & Alpine Trekking | `hiking` |
| 7 | Culinary & Wine Tours | `culinary` |
| 8 | Winter Sports & Skiing | `winter-sports` |
| 9 | Nature Escapes & Cabin Stays | `nature-escape` |
| 10 | Water Sports & Coastal Trips | `water-sports` |

## Season

`bestPeriod` is `{months, monthNames, window, note, avoid, raw}`. `months` is an integer
array 1–12 — for the two batches that only gave prose ("Late March–mid May & late
September–early November") the months are expanded from that text, and the prose is kept
in `window` / `raw`. `avoid` carries the "do not go then" sentence where a batch had one.

## Budget

```
budgetTier          "€" | "€€" | "€€€"      -- the LOW end of a straddling tier
budgetTierRange     [1,2]                   -- rank range when the source said "€–€€"
budgetTierRaw       "€–€€"                  -- exactly what the source wrote
budget.totalEur     {low, high}             -- per person, 7 days, excl. international flights
budget.totalNote    string                  -- the source's own total sentence
budget.perDayEur    {low, high}             -- derived, total / 7
budget.breakdown    accommodation | food | transport | activities
                      -> {lowEur, highEur, note}
```

Every category carries the source's own wording in `note` (per-night rates, what the
figure includes). Breakdown sums are expected to land within 15% of the stated total;
the validator warns beyond that rather than rewriting either number.

## Itinerary

`itinerary` is exactly seven `ItineraryDay` objects, ordered:

```
{ day, title, morning, afternoon, evening, dayStats, sleep }
```

`morning` and `afternoon` are guaranteed non-empty. `evening` is present on every day except day 7 of the 30 Nordic
records, where the source has no evening block (departure day). `dayStats`
is type-dependent free text (km and ascent, drive time and passes, walking km and ticket
spend, vertical metres, water hours) and must be parsed as a string, never as numbers.
`sleep` is populated where the batch stated the night's accommodation per day.

## Supporting blocks

| Field | Shape | Notes |
|---|---|---|
| `accommodationStrategy[]` | `{rank, name, style, location, description, booking, priceNote}` | 2–3 properties per trip. |
| `logistics` | `{connectivity, emergency, weather, bookingWindows, money, transportRules, permits, health, gettingThere, other[]}` | Source bullets bucketed onto canonical slots; anything unmapped is kept, with its label, in `other[]`. |
| `proTips[]` | string[] | 3+ per trip. |
| `packingNotes[]` / `whatCouldGoWrong[]` | string[] | Present in the W&C batch only. |
| `sources` | `{verified, confidenceNotes}` | The S&Med and E&SE batches recorded what was web-verified and what was not. |
| `snapshot` | `Record<string,string>` | The source's own snapshot table, preserved as key/value. |

## Type-specific refinements

`typeSpecific.raw` holds every type-detail key the source provided, whatever it was
called. On top of that, five slots are normalised across all four batches so the app can
filter on them:

| Slot | Fed by | Used for |
|---|---|---|
| `surface`, `gpxReady`, `distanceKm` | `surface_mix`, `Week surface split`, `Terrain split`, `Total Distance / Terrain`, `gpx_ready` | Cycling |
| `technicalRating` | `technical_rating`, `Safety markers and waymarking`, `Waymarking` | Trail running, alpine |
| `transitPass` | `transit_pass`, `Transit pass`, `Walkable blocks`, `walkability` | City trips |
| `hutBooking` | `Hut-to-hut booking path`, `hut_network` | Hiking & alpine trekking |
| `liftNetwork`, `snowReliability` | `Lift network and interconnects`, `Pass tiers by name`, `Piste breakdown`, `snow_reliability` | Winter sports |
| `windConditions` | `wind_statistics`, `prevailing_wind`, `tidal_awareness`, `water_temp_c` | Water sports |

### The three numeric slots

`typeSpecific.distanceKm`, `elevationM` and `verticalM` are integers or null. They are filled by
`pipeline/fill_type_specific.py` from the record's own text, and each figure's origin is in
`data/type_specific_basis.json` (basis `key`, `stated`, `summed`, `derived` or `mentioned`, plus
the quoted words). A stated range gives its low end ("330 to 370 km" is 330). A slot is null when
the text does not state the figure; nothing is estimated. No schema path was added for this.

| Type | `distanceKm` | `elevationM` | `verticalM` |
|---|---|---|---|
| Cycling, trail running, hiking | km ridden, run or walked over the week | highest point stated or named in a day line | cumulative ascent over the week |
| Road trips | km driven | highest pass stated or named | not used |
| Winter sports | km of marked piste, or of groomed Nordic trail, of the main area | top of the lift system | vertical drop of the main area |
| City trips | km on foot | not used | cumulative ascent, where day lines give it |
| Cozy towns | km walked | not used | not used |
| Culinary | km between villages and venues by rail, road or boat | not used | not used |
| Nature escapes | km walked or cycled | highest named summit or pass | cumulative ascent |
| Water sports | km sailed or paddled (nautical miles times 1.852) | not used | not used |

`elevationM` with basis `mentioned` is the highest summit or pass height a day line names. It can
understate the week's true high point, so a chart should prefer `key` and `stated` figures where it
needs the real maximum.

## Verification and provenance

| Field | Notes |
|---|---|
| `verifyFlags[]` / `verifyFlagCount` | Every inline `[VERIFY: …]` marker lifted out of the prose, deduplicated. These are the volatile fields — prices, pass tariffs, opening hours, refuge dates. |
| `volatilePricing` | `true` when the record carries verify flags or was tagged volatile at source. |
| `wordCount` | Words in the original source body. |
| `dataVintage` | `2026` throughout. Prices are indicative planning figures for that year. |
| `provenance` | `{batch, sourceFile, sourceFormat, sourceId, ingestedAt, synthesized}`. `synthesized` is `false` for all 253 current records: nothing in this dataset was invented by the pipeline. |

## Guarantees a consumer can rely on

1. `id` is unique and matches `^[a-z]{2}-[a-z-]+-[a-z0-9-]+$`.
2. `tripTypeId`/`tripType` are always a canonical pair; `durationDays` is always 7.
3. `budgetTier` is always one of `€`, `€€`, `€€€`; `budget.totalEur.low ≤ .high`.
4. `itinerary` always has exactly 7 days numbered 1–7, each with morning and afternoon text.
5. `bestPeriod.months` is always non-empty and within 1–12.
6. `countryCode` is always a mapped ISO code, and `countries[0]` is the primary country.
7. Coordinates, where present, fall inside the European bounding box (27 N to 72.5 N, so Madeira and the Canaries count), declare their precision, are not a capital-city fallback, and, with GeoNames cities500, do not sit beside a town of another country (T090).

`pipeline/validate.py` enforces all seven and reports everything softer as a warning.

## Generated records (v2.1)

Every trip a model writes must meet `schema/trip.generated.schema.json` (JSON Schema
2020-12, task T143) before it is written to disk. `pipeline/generation_gate.py` checks a
candidate against that schema, against the cross-field rules a schema cannot express, and
against the K5 checks in `validate.py`, and rejects on any failure; it never repairs. A
passing record is written atomically; a failing one is kept verbatim in a rejects folder
with its errors beside it. `generation_gate.py self-test` proves the gate bites, and
`generation_gate.py gemini-schema` prints the Gemini `responseSchema` the generator sends,
which leaves out the fields `derive()` fills (ids, per-day figures, provenance and the rest
of the `DERIVED` list).

v2.1 is v2.0 with every number that has a typed home taken out of prose. The keys the app
reads keep their v2.0 names (`budget.breakdown.*.lowEur`, `itinerary[].dayStats`,
`packingNotes`), so `JourneyPage.jsx` renders both shapes. What changes:

| Field | v2.0 | v2.1 |
|---|---|---|
| `itinerary[].dayStats` | free text | `{mode, distanceKm, ascentM, descentM, timeMin {low, high}, spendEur {low, high}, note}` |
| `itinerary[].sleepRef` | absent | rank of the `accommodationStrategy` entry slept in tonight, or null |
| `accommodationStrategy[]` | `priceNote` carries the figures | `priceEur {low, high}`, `priceUnit`, `priceNote` in words only, `alternativeTo` |
| `gateways[]` | one `gatewayAirport` string | `{code, name, transferMin, transferTo, note}`; `gatewayAirport` and its code are derived from the first row |
| `packingNotes[]` | strings | `{icon, item, whyThisTrip}`, `icon` from a fixed key list |
| `whatCouldGoWrong[]` | strings | `{severity, trigger, consequence, whatToDo}` |
| `bestPeriod.avoidMonths` | parsed from `avoid` by the wire build | stated |
| `currency` | ISO code or a sentence | ISO 4217 code; the sentence goes to `currencyNote`, the rate to `eurRate {low, high}` |
| `emergencyNumber` | a number or a sentence | digits only; rescue lines go to `logistics.emergency` |
| `typeSpecific.surfaceMix` | absent | `[{surface, pct}]`, adding to 100 |
| `provenance` | source batch | `sourceFormat: "generated"`, `synthesized: true`, `model` (Gemini only), `promptVersion`, `reviewedAt` |

Two rules apply to every string. Display copy may not contain an em dash, an en dash or a
middot. A note that sits beside a typed number (`totalNote`, breakdown notes, `priceNote`,
gateway notes, `dayStats.note`, `currencyNote`) may not carry a euro range of its own.

The accommodation rule (register row T084-b): a night slept in a strategy entry names it by
`sleepRef`; every entry must be referenced by at least one night unless it declares
`alternativeTo`, the rank of the slept-in entry it substitutes for at another budget. A
tier alternative is exempt only when it says so. Every night but the last names its bed in
`sleep`. `validate.py` honours both fields and checks a v2.0 record by name as before.

Per-figure confidence (T146, spec K3). A v2.1 record carries `figures`, one row per numeric
figure: `{path, confidence, sourceUrl, checkedAt}`. `confidence` is `sourced` (a page the
model read gave it, and `sourceUrl` names it), `derived` (computed from other figures here:
the week total and the per-day range) or `estimated` (general knowledge, no URL). The list of
figure paths is `FIGURE_PATTERNS` in `generation_gate.py`: the four budget rows, the total
and per-day range, `eurRate`, airport transfer minutes, a day's distance, ascent, descent,
time and spend, a stay's price, the surface split and the three week totals. Identifiers,
counters and ratings (day, rank, months, tier range, difficulty, wordCount) carry none.
Only `budget.breakdown.food` and a day's `timeMin` may be estimated (`ESTIMATE_OK`); a hotel
price, a ticket or day spend, a transfer time, a distance, a climb or an exchange rate may
not, and pass three withholds one that arrives without a page. A total built on an estimated
row is itself `estimated`. The pipeline writes `figures` from the evidence rows (it is in
`DERIVED`, so the model is never asked and cannot label its own work), and the gate rejects a
record whose rows do not match its figures one to one. The v2.0 records have no `figures`.

Prose is capped (T152, spec D4): `summary` at most 120 words, each day's `morning`,
`afternoon` and `evening` at most 45, each `proTips` entry at most 35. The numbers live in
`generation_gate.py` (`SUMMARY_WORDS`, `DAY_WORDS`, `TIP_WORDS`); the pass-two prompt, the
gate and `validate.py` all read them. The gate rejects a generated record over a cap, and
the validator reports `word-cap` as an ERROR for a generated trip and a WARNING for a
trip from the original source batches.
