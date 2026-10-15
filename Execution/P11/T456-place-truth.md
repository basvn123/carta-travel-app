# T456: Places said from our own spine

## Task ID

T456

## Date

2026-10-15

## What changed

The T451 fact check found place lines that were wrong (row T451-c). The owner asked for the pipeline fix.

A read-only investigation traced each error to its source:
- **Lake and beach regions.** The `region` was the first Wikidata P131 label of the item, whichever SPARQL returned first. A lake on a border was published once per country with the same label, so the Swiss and German copies of Lake Constance said "Vorarlberg". The label came in English or in the local script ("Άγιος Βασίλειος Κορινθίας" for a Cretan beach).
- **The lakes harvest.** It let in sea bays, rias, estuaries, beaches and about thirty car parks.
- **Trails.** A walk is filed under the Geofabrik extract it came from, and extracts overlap at borders, so walks round Mützenich, a German village, sat under Belgium.

The harvest caches and the trailslab database are not on this machine, so no layer can be rebuilt. As in T454 and T455, the rules live in one module, `pipeline/regions/place_truth.py`:
- `repair_places_wire.py` applies them to the published wire;
- `place_pass()` runs as the last step of the lake, beach and mountain exports, and the trail export files walks by the same rule. The next rebuild and today's repair are one code path.

**1. Regions from the NUTS spine.** Every lake and beach row already carries `rg`, the NUTS 3 region its point lies in. When that region is in the row's own country, the card prints its Latin name:

| Place | Before | After |
|---|---|---|
| Bolsena | Province of Rome | Viterbo |
| Preveli Beach | Άγιος Βασίλειος Κορινθίας | Rethymni |
| Lake Constance, Germany | Vorarlberg | Bodenseekreis |
| Lake Maggiore, Italy | Canton of Ticino | Varese |
| Jarun Lake | Trešnjevka, jug | Grad Zagreb |

The rules for the rest:
- **Point across the border.** The Wikidata label stays only if it is Latin and belongs to the row's country. Ownership is read off the rows whose own point agrees. So Lake Constance keeps "Vorarlberg" in Austria and shows no region in Switzerland.
- **The UK.** It has no 2021 NUTS, so its rows keep their label. The ITL codes ("TL...") are read as GB.
- **Names a reader uses.** NUTS names drop their admin prefixes ("Arr. Bastogne" is Bastogne).
- **The effect.** Most of the English admin labels ("Municipality of Pylos-Nestor") give way to the region's own name. Rows that had no region now get one, so every place line has the same shape.

**2. What is not a lake leaves the lakes.** 95 rows by name: the Bay of Kotor, Kotor Beach, the Sado Estuary, the rias of Plentzia, Cubas and Ferrol, the Fiord of Furore, Vest Stadil Fjord, Novigrad Sea, beaches, tidal pools and car parks.

**3. Hand fixes from the fact check:**
- Calanques de Piana (a cliff coast) leaves the beaches.
- Inch Beach is 5 km, not 9.4: its OSM relation is the whole peninsula.
- Nissi loses "cliffs" and "surf".
- Navagio is pebble.
- Aavasaksa loses "Scandinavian Mountains".

**4. Walks filed where they run.** A walk under 30 km whose midpoint lies in another catalogue country moves to that country's file. Its detail file says so, and both files' counts and the index follow.
- 317 walks moved. The largest flows: 56 Northern Ireland walks from Ireland to Great Britain, 27 from Bosnia and Herzegovina to Croatia, 19 from Czechia to Germany.
- Three of the four Mützenich walks moved to Germany. The fourth runs mostly in Belgium and stays.
- Long routes cross borders and stay where they are.

## Files touched

**Pipeline (root):**
- `pipeline/regions/place_truth.py` (new)
- `pipeline/regions/repair_places_wire.py` (new)
- `pipeline/lakes/export_lakes.py`, `pipeline/beaches/export_beaches.py`, `pipeline/mountains/export_peaks.py`: the place pass as the last step.
- `pipeline/trails/export_wire.py`: walks filed by `trail_country`.

**Data (tracked in the root repo, ignored in the app repo, ships with the R2 push):**
- `continent-app/public/lakes/*.json`
- `continent-app/public/beaches/*.json`
- `continent-app/public/mountains/FI.json` and `top.json`
- `continent-app/public/trails/*.json`, the moved walks' `trips/*.json`, and the index

Pre-repair copies were kept in the session scratchpad.

**Created (root):** this report.

## Commands run

```
python pipeline/regions/repair_places_wire.py --dry-run
python pipeline/regions/repair_places_wire.py
python pipeline/regions/repair_places_wire.py --dry-run     (nothing left: idempotent)
npx vite build && npx vite preview --port 5298 --strictPort
CARTA_PORT=5298 node scripts/verify_{lakes,beaches,mountains,trails,trail_page,places_tab,destinations,layer_errors,paging}.mjs
npm test
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Lake and beach regions set from the NUTS region the point lies in | 0 | 7,104 |
| Regions dropped (not Latin, or another country's) | | 21 |
| Rows in the lakes layer that are not lakes | 95 | 0 |
| Region in a non-Latin script on a Latin screen | 1 | 0 |
| Short walks filed under a country they do not run in | 317 | 0 |
| Fact-check place errors still shown (the eleven named) | 11 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 1,916 GB and IE walks looked like "elsewhere" | UK rows carry ITL codes (TL...), outside NUTS 2021 | TL read as GB. Northern Ireland walks filed under Ireland then moved to GB (56); the others are correct where they are. |
| verify_lakes: the index no longer matched the country files | 95 rows dropped, index counts and photo tally unchanged | The repair recounts each country's rows, the totals and the photo-reading tally |

## Checks

| Check | Result |
|---|---|
| verify_beaches, verify_mountains, verify_trail_page, verify_places_tab | pass |
| verify_trails 34/34, verify_destinations 86/86, verify_layer_errors 24/24, verify_paging 7/7 | pass |
| verify_lakes | 2 failures, both honest. "GB publishes at least 60 lakes" (54) and "IE publishes at least 25 lakes" (19): the export filled both countries to the floor partly with car parks, beaches and bays, and with those gone the real count shows. Row T456-e. |
| npm test | 375/375 |

## What is still open

- **T456-a (user).** The repaired lake, beach, mountain and trail wires reach production only with the R2 data push, with T453-a, T454-a and T455-a.
- **T456-b.** Moved walks keep the rating they earned within their old country (`rated_within`). Each country file's facet counts (the chip model) are not recomputed for the 317 moves. The next trail export recomputes both.
- **T456-c.** The NUTS names are local, in Latin script ("Jugoistočen", "Rethymni"). A reader's own language ("Rethymno", "Südost") needs a label fetch per region (Wikidata, network). That is the rest of the de and fr region issue.
- **T456-e.** Great Britain (54) and Ireland (19) fall under the lake floor of 60 and 25 once the non-lakes are gone: the export's floor fill reached for car parks and beaches. Filter non-lakes before the floor fill in `export_lakes.py` and find real lakes to fill it (a re-harvest), or lower the floor for those two. `verify_lakes` reports the gap until then.
- **T456-d.** The lake classifier itself (`harvest_lakes.py` CLASS_ROOTS and the OSM water tags) still admits these rows. The place pass removes them after every export, but a class filter at harvest would stop them earlier and needs a re-harvest.

Row T451-c is closed by this task.

## Rollback procedure

- **Pipeline:** revert the T456 commit.
- **Data:** revert the same commit (the root repo holds the previous wire), or restore the scratchpad copies.
