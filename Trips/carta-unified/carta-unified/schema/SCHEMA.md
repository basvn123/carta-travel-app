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
| `coordinates` | object \| null | `{lat, lon, precision, matchedPlace, source}`. **`precision` matters**: `source` = stated in the source record · `city` = a named basecamp or sub-region town resolved against GeoNames · `gateway` = only the gateway airport's city resolved, which can be hours from the trip · `country` = capital-city fallback, a map pin rather than a location. |

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
7. Coordinates, where present, fall inside the European bounding box and declare their precision.

`pipeline/validate.py` enforces all seven and reports everything softer as a warning.
