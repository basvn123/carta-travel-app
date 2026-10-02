# T143 K1: Generate into a JSON Schema, never into prose

## Task ID

T143 (mind-map number T145).

## Date

2026-10-03

## What changed

Carta now has a written contract for a model-generated trip, and a gate that enforces it. The contract is `Trips/carta-unified/carta-unified/schema/trip.generated.schema.json`, a JSON Schema (draft 2020-12) for what this note calls schema v2.1. The gate is `Trips/carta-unified/carta-unified/pipeline/generation_gate.py`. Before this task a generator had nothing to fill but the v2.0 master shape, where the numbers live inside sentences, and nothing checked its answer before it reached disk.

v2.1 is the v2.0 master record with every number that has a typed home taken out of prose. A day's measured line is no longer "52 km, +160 m, asphalt throughout". It is `dayStats: {mode, distanceKm, ascentM, descentM, timeMin {low, high}, spendEur {low, high}, note}`, with `ascentM` an integer. Packing notes are `{icon, item, whyThisTrip}`. Risks are `{severity, trigger, consequence, whatToDo}`. A hotel's price is `priceEur {low, high}` plus `priceUnit`, and `priceNote` keeps only the words ("per night for two, half board available"). Gateway airports are rows of `{code, name, transferMin, transferTo, note}`. `bestPeriod.avoidMonths` is stated, not parsed. `currency` is an ISO 4217 code, with the sentence in `currencyNote` and the rate in `eurRate`. `provenance` records `model`, `promptVersion` and `reviewedAt`. Every object forbids unknown keys and every key is required, with null standing in where a value does not apply. Two rules apply to all strings: display copy may not contain an em dash, en dash or middot, and a note that sits beside a typed number may not carry a euro range of its own.

The keys the app already reads keep their v2.0 names, and that was a deliberate choice. The task text says `budget.breakdown.food.low`, but `JourneyPage.jsx` and all 253 published records use `lowEur` and `highEur` there. Renaming would mean two shapes in the catalogue and a page change for nothing, so the schema keeps `lowEur`. The same reasoning kept `dayStats`, `packingNotes` and `whatCouldGoWrong` as the field names, with new value shapes.

The gate checks a candidate three ways and rejects on any failure. First the JSON Schema, which covers types, enums, lengths, required keys and the two string rules. Second the cross-field rules a schema cannot express, in `semantic_errors`: the id starts with the country and trip type, `low <= high` on every pair, the trip type id and name are the canonical pair, the region follows the country, derived fields agree with what they derive from, `surfaceMix` adds to 100, and each night's bed is accounted for. Third the K5 checks in `validate.py`, run on the one record, so the budget sum, per-day, surface split and comma range rules exist once and are not copied. `admit()` writes a passing record atomically into the destination folder. A failing one is kept byte for byte as received in a rejects folder, with an `.errors.txt` beside it, so a bad prompt can be read and fixed from its output. The gate never repairs. A repaired file is a file nobody wrote and nobody checked, and that is how half-valid trips would get into the catalogue. If `jsonschema` is not installed the gate fails closed and admits nothing.

The model is asked for named fields, not for a description. `generation_gate.py gemini-schema` turns the contract into the `responseSchema` a Gemini `generateContent` call takes. That is the OpenAPI subset the plan-day and parse-booking Edge Functions already use: uppercase types, `nullable`, enums, item counts, numeric bounds and `propertyOrdering`. It leaves out the 26 key paths in `DERIVED` (id slug, per-day figures, region, trip type id, gateway mirror, word count, provenance and so on), which `derive()` fills by arithmetic and lookup. A model cannot get `perDayEur` out of step with `totalEur`, because it is never asked for it. Length limits and the two string rules go into each field's description, so the model sees them even where Gemini's dialect cannot enforce them. The gate checks them afterwards either way. This module makes no network call. The Gemini call itself is T144's, and the schema's `provenance.model` pattern rejects any record not written by a Gemini model.

Four register rows were folded in. For T084-b the decision is: a night slept in a strategy entry names it by `sleepRef` (its rank). Every entry must be slept in at least once unless it declares `alternativeTo`, the rank of the slept-in entry it replaces at another budget. So a tier alternative is exempt only when it says so. Every night but the last must name its bed in `sleep`, which closes the gap behind T084's 183 no-sleep-lines warnings for anything generated. `validate.py` now honours both fields. A v2.0 record carries neither and is checked by name exactly as before, with 606 errors before and after. For T085-b and T092-b, the hotel, airport and day ranges are typed fields. `totalNote`, the breakdown notes, `priceNote`, gateway notes, `dayStats.note` and `currencyNote` are qualifiers that the schema bars from carrying a euro range. For T088-a and T092-a, `build_wire.py` now writes `gateways` and `gatewaysPartial` into every journey file. A v2.1 record's rows pass through untouched. A v2.0 string is read at build time by `parse_gateways`, a Python twin of `src/lib/gateway.js`. Run over all 223 gateway strings, the two produce identical rows and the same complete flag on every trip. The page prefers the wire rows and falls back to the browser parser only for a wire built before this task.

The page renders the v2.1 shapes. `src/lib/journeys.js` gained `dayStatsLine`, `minutesText`, `packingText`, `riskText` and `stayPriceText`. Each returns a v2.0 string unchanged and formats a v2.1 object, so the 253 published trips look exactly as before. Two i18n keys were added in all six languages: `journey.gatewayTransfer` ("{time} to {place}") and `journey.wrongDo` ("What to do: {text}"). I proved the shape matches with a throwaway harness. The example record (`schema/examples/generated-trip.example.json`, a v2.1 version of the Donauradweg week) went through `build_wire.py --src --out` into a scratch wire and was mounted on `JourneyPage` under Vite on port 5202. With Playwright at 380 and 1280 px, 29 of 29 checks passed: the typed day line, the gateway row, the hotel range, packing and risk text, two struck avoid months, the budget, no "[object Object]", no horizontal scroll, and no console errors. Two v2.0 trips also rendered through the new wire: a complete three-airport gateway, and a partial one that shows one row plus the info button.

Two fixes in `build_wire.py` came out of the measurement. Building a scratch wire put one new comma range on `it-city-rome` ("Via Giovanni Branca 88, then a spaced em dash, then €4 to €6" became "88 to €4, €6"). The cause was T085's currency rule, which treated any dash before a euro sign as a range, so the address dash became "to". In the master, all 2,079 price ranges use an unspaced en dash, and all 9 spaced em dashes before a price are prose after an address. So the rule now matches only an unspaced en dash, with a lookahead so a chain stays a range. Second, `--no-fetch` wrote the image cache. That cache is tracked in the repo, and it was also being poisoned with null entries for titles never looked up, which a later online run would then skip. The cache is now saved only when fetching is allowed. The middot between a stay's price and its booking line became a full stop, because I edited that line and middots are banned.

## Files touched

Root repo, branch p9-k1-json-schema.

Created:
- Trips/carta-unified/carta-unified/schema/trip.generated.schema.json
- Trips/carta-unified/carta-unified/schema/examples/generated-trip.example.json
- Trips/carta-unified/carta-unified/pipeline/generation_gate.py
- Execution/P9/T143-generation-schema.md

Modified:
- Trips/carta-unified/carta-unified/pipeline/validate.py (accommodation check honours sleepRef and alternativeTo)
- Trips/carta-unified/carta-unified/schema/SCHEMA.md (a v2.1 section)
- pipeline/journeys/build_wire.py (gateways, `--src`, avoidMonths pass-through, the range rule, no cache write offline)
- Execution/_OPEN.md

App repo, branch p9-k1-json-schema.

Modified:
- src/browse/JourneyPage.jsx
- src/lib/journeys.js
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (two keys each)

## Commands run

From `Trips/carta-unified/carta-unified` in the root worktree:

```
python -X utf8 pipeline/generation_gate.py self-test
python -X utf8 pipeline/generation_gate.py check schema/examples/generated-trip.example.json
python -X utf8 pipeline/generation_gate.py survey
python -X utf8 pipeline/generation_gate.py gemini-schema
python pipeline/validate.py --wire "<main>/continent-app/public/journeys" --gazetteer "<main>/cache/geonames_cities500.txt" --report <scratch>/after.md --json <scratch>/after.json
python <scratch>/headval/validate.py ... (the HEAD validate.py, same inputs, for the before figure)
python pipeline/validate.py --self-test --wire "<main>/continent-app/public/journeys" --gazetteer "<main>/cache/geonames_cities500.txt"
```

From the root worktree:

```
python -X utf8 pipeline/journeys/build_wire.py --no-fetch --src <scratch>/example-master.json --out <scratch>/wire-example
python -X utf8 pipeline/journeys/build_wire.py --no-fetch --out <scratch>/wire-full
python pipeline/validate.py --wire <scratch>/wire-full ...   (from the dataset folder)
node <scratch>/gwcmp.mjs <scratch>/gw_py.json                 (Python against JS gateway reader, 223 strings)
```

From the app worktree:

```
npx eslint src/browse/JourneyPage.jsx src/lib/journeys.js
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npm test                                                        (104 pass)
npx vite --config vite.t143.mjs                                 (port 5202, temporary config and harness page, both deleted)
node <scratch>/harness.mjs                                      (29 of 29)
```

The first offline wire build rewrote the tracked `cache/journey_images.json` into the sparse worktree. I restored it with `git checkout` and `git sparse-checkout reapply`, then fixed the cause (see above). No wire was written to continent-app/public, no dist was built, and nothing went to data/, cache/, R2 or production.

## Config and secrets set

None. The gate uses `jsonschema` 4.23.0, already installed and pinned in `constraints.txt`. It is not named in `requirements.txt` (T143-d).

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Written contract for a generated trip | none | trip.generated.schema.json, 31 model-filled top-level fields, 115 typed leaf fields asked of the model, 26 derived paths | new |
| Malformed answers the gate rejects (self-test) | 0 of 25 (no gate) | 25 of 25 | +25 |
| Truncated or non-JSON answer admitted | yes, nothing checked | rejected as not-json, quarantined | fixed |
| Published v2.0 trips that meet the v2.1 contract | not measurable | 0 of 253 | baseline for T149 |
| Strings in the master carrying a euro range in a field v2.1 types | priceNote 316, dayStats 265, totalNote 153, breakdown notes 521 | 0 allowed in a generated record | schema-enforced |
| Trips whose gateway rows are parsed in the browser | 223 | 0 once the wire is rebuilt (223 carry `gateways` in a scratch wire) | -223 |
| Gateway rows: complete, partial | 144, 79 (T088) | 144, 79, with 0 of 223 differing between the Python and JS readers | equal |
| Complete gateway rows with transfer minutes | 0 | 108 of 208 | +108 |
| comma-range-wire on a wire built from the unchanged master | 1 (it-city-rome) | 0 | -1 |
| validate.py errors on the 253 (same inputs) | 606 | 606 | 0 |
| Render harness checks on JourneyPage | none | 29 of 29 | new |

The euro-range counts come from a scan of `data/trips.master.json` for a euro figure, a dash and a second figure. Breakdown notes are food 148, accommodation 141, activities 117 and transport 115. The survey lists, per field, how many trips fail; every one of the 253 fails at the itinerary, the strategy, packing, risks and provenance, which is what the fill-mode pass has to convert.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Two self-test mutations did not test what they said | "inverted total" tripped the schema maximum first; "night pointing at no stay" pointed at rank 3, which exists | Use a low above the high but inside the bound; drop the third stay instead |
| anyOf errors read "not valid under any of the given schemas" | jsonschema reports the union, not the branch | Report the best-matching branch's message |
| The qualifier rule rejected "€4, 35 min" | A comma after a figure counted as a range | Comma only when a euro sign follows it |
| Regex backslashes became backspace characters, and dash characters landed literally in code | Shell heredocs and the edit tool interpret escapes | Wrote the patches as script files; the source holds escapes, not characters |
| A sed edit turned JourneyPage.jsx to LF | sed on Windows | Restored CRLF; the diff touches only the changed lines |
| Offline wire build rewrote the tracked image cache | save_cache ran with --no-fetch | Restored the file; the cache is now saved only when fetching |
| One comma range appeared on it-city-rome | T085's rule read a spaced address dash as a range | Range rule matches only an unspaced en dash |

## What is still open

The 253 published trips are v2.0 and none meets the contract. Converting them is fill-mode work for T149, starting with the 34 trips the accommodation check fails, the 316 hotel price notes and the 79 partial gateways (T143-a). The browser gateway parser and the page's fallback to it only serve a wire built before this task. They can go once the tracked wire is rebuilt, which is the owner's T085-a step; that rebuild now also ships `gateways` (T143-b). The app's `stripDashes` in `format.js` still has the spaced currency rule I narrowed in `build_wire.py`. I left it because it runs over destination data, not journeys, and that is outside this task (T143-c).

`jsonschema` should be named in `requirements.txt`. Dependency files are outside a session's scope (T143-d). The 23 packing icon keys are a proposal that the icon grid task T168 must confirm or change before T150 generates packing notes (T143-e). The gate's self-test is not in CI yet (T143-f).

Before a generated record can join the catalogue, someone has to decide where admitted files live and how they reach `trips.master.json`. `build.py` rebuilds it from the four source batches and would drop them. `export_sql.py` would also write the new objects as text. That is T144's to settle (T143-g). The day line still sets its note in mono, as v2.0 prose does. The day carousel T162 should split figures from words (T143-h). `types.ts` describes v2.0 only (T143-i). Register row T094-b stays open: the schema now has `provenance.reviewedAt`, but the page still reads `ingestedAt`.

The example record is a test fixture, not catalogue data. Its id ends in `-example`, its batch is `fixture` and its model is `gemini-fixture`. A few figures were added to exercise the formatter: the day 1 riding time and the day 1 and day 5 spend. They are illustrative and must not be copied into the real Donauradweg trip.

## Rollback procedure

Revert the task commits on p9-k1-json-schema in both repos, or drop the branches before merge. That removes the schema, the gate and the example, and restores `validate.py`, `build_wire.py`, the page and the i18n files. No published data, wire, migration or dependency was changed, so nothing else needs undoing. The five register rows marked closed by T143 go back to open with the revert.
