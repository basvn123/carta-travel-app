# T090: J1, fix the trips geolocated to the wrong place

## Task ID

T090 (mind-map number T086).

## Date

2026-10-03

## What changed

Every trip in the catalogue now carries a pin on a place its own itinerary names, inside the country the record states, and the validator fails any record that falls back to a capital or sits beside a town of another country.

Before this task, 61 of the 253 trips in `Trips/carta-unified/carta-unified/data/trips.master.json` had `coordinates.precision` "country", meaning the pin was the country capital (the Istria Parenzana cycling week sat on Zagreb, 189 km from where it is ridden), and 54 more had "gateway", meaning the pin was the arrival airport's city (Bansko on Sofia). The cause was the gazetteer. `pipeline/geocode.py` used geonamescache, which only lists towns over 15,000 people, so basecamps like Motovun, Capileira or Zabljak never resolved and the code fell through to the gateway and then the capital. Those 115 trips now sit on a town or village their itinerary names: Istria on Brtonigla, where the first two nights are spent; Bansko on Dobrinishte, its stated second base; the Madeira trail week on Santana instead of Lisbon, 959 km away. The other 138 records (108 basecamp pins and 30 source coordinates) are untouched.

How the derivation works. `derive_from_itinerary` in `geocode.py` collects every place name the record gives in a structured slot: the basecamps, the town in each day's sleep line, the day titles and the sub-region. Free prose is left alone because it names dishes, people and restaurants. Each name is looked up in GeoNames, restricted to the record's stated countries, so a "Trieste" on an Istria trip cannot win. Each name carries a weight (a basecamp 3, a night's sleep line 2, a title or the sub-region 1, summed over mentions), and a candidate's support is the weight of every named place with a homonym within 20 km of it. The pin goes to the candidate with the most support, then the most mentions, then the smallest total distance to the rest of the itinerary, then the place named first. The cluster rule is what keeps a homonym at the other end of the country, or the town the trip only passes on day one, from winning on its own. Four refinements came out of reading every result by hand. The gateway airport's city is left out of the vote whenever anything else resolves, because "Land at Sarajevo, and up to the mountain" names the arrival, not the trip; if only the gateway city resolves, the function returns nothing and the record keeps an honestly labelled gateway pin. When a basecamp resolves, the pin is chosen among the basecamps, since that is what the field means. On a cross-border trip the pin stays in the primary country when it can (the Tara road trip ends in Sarajevo but is a Montenegro trip, so it sits on Zabljak). And the gazetteer is tiered: cities500 (every populated place over 500 people) answers first, and the 39 GeoNames country files for the catalogue's countries answer only for names cities500 does not know. That is how Malbun, Hrensko, Torla, Jahorina and Modrava resolve without letting a hamlet steal a name from a real town ("Zabljak" stays the Durmitor town, not Zabljak Crnojevica by Lake Skadar). Only populated places (GeoNames feature class P) are read, so a hut, a peak or a hotel never becomes a pin. Of the 115 new pins, 90 came from cities500 and 25 from a country file; the `source` field says which, for example "itinerary places (geonames LI dump)", and `precision` is "city", the tier the app already treats as a real place.

The raw source batches that `build.py` parses are not in the repository, so `data/` is the source of truth. `geocode.py` is now also a script: a dry run prints the table of moves, and `--write` rewrites only the coordinates in `trips.master.json` and the matching `data/trips/<id>.json`, keeping the files' formatting and line endings, so the diff is five lines per record. The itinerary tier also sits inside `geocode_trip`, after the two geonamescache town tiers and before the gateway tier, so a rebuild from the raw batches reproduces what is stored. I checked that: fed each record with the parser's own coordinate, `geocode_trip` returns the stored pin for all 253 (108 basecamp, 115 itinerary, 30 source), with geonamescache 3.0.2 and the full gazetteer.

The validator check. `validate.py` now raises `coordinate-capital-fallback` as an error where it used to warn `approximate-coordinates`. With cities500 it also reverse-geocodes every pin to its nearest populated place and raises `coordinate-outside-country` when a town of another country lies within 15 km and the nearest town of the stated countries is more than 10 km farther than that. The 15 km condition matters: on the Kungsleden the nearest town of any kind is 49 km away, in Norway, and in empty country nearest-town says nothing, so the check stays silent there rather than flagging a correct Swedish source coordinate. A third check, `coordinate-far-from-itinerary`, warns when a pin is more than 50 km from every place the itinerary names. It is a warning because cities500 alone (what CI downloads) does not know most villages and sometimes resolves only a homonym. The self-test now seeds a pin on Salamanca or Uppsala labelled as a capital fallback and requires both errors; I confirmed it bites by disabling the outside-country rule in a scratch run, and the self-test failed on exactly that code. The validator's bounding box moved south to 27 N, because Madeira (32.6 N) and the Canaries are Portugal and Spain and the old 33 N edge would have rejected the corrected Madeira pin.

Heroes. `build_wire.py` used to put a "city" pin's matched place at the front of the hero candidates. Left alone, the 115 new pins would have changed 18 heroes in an offline rebuild, several for the worse (Durmitor's mountain replaced by Zabljak's main square, a Govedartsi view by a hotel facade), and choosing photographs belongs to the hero tasks, not this one (spec B1 wants the activity, not the nearest town). A derived pin's place is now tried only after the basecamps and the sub-region. In the offline scratch rebuild that leaves two heroes changed, both previously photographs of the gateway city: De Panne loses Brussels' Grand Place for a De Panne street, and the Appenzell week loses its Zurich old town and, offline, has no hero until a rebuild with fetching looks the new candidates up.

As an independent check that does not use GeoNames at all, I tested every pin against the Natural Earth 50 m country outlines in the main checkout's cache. None of the 115 new pins is in the wrong country. Nine sit just outside their country's simplified outline: border towns (Echternach 0.1 km twice, Grevenmacher 0.0 km, Hrensko 0.4 km, Malbun 0.2 km twice) and coastal ones (Ouddorp 1.4 km, Paros 1.8 km, Quiberon 16.5 km, where the 50 m outline drops the peninsula). That coarseness is why the CI check uses towns, not outlines.

## Files touched

Modified, root repo (branch p5-j1-geolocation):
- Trips/carta-unified/carta-unified/pipeline/geocode.py
- Trips/carta-unified/carta-unified/pipeline/validate.py
- pipeline/journeys/build_wire.py
- Trips/carta-unified/carta-unified/data/trips.master.json (coordinates of 115 records)
- Trips/carta-unified/carta-unified/data/trips/*.json (the same 115 records)
- Trips/carta-unified/carta-unified/README.md (the two coordinate rows of the known-gaps table, and how to run geocode.py)
- Trips/carta-unified/carta-unified/schema/SCHEMA.md (the coordinates field and invariant 7)
- Execution/_OPEN.md

Created, root repo:
- Execution/P5/T090-j1-geolocation.md

App repo (branch p5-j1-geolocation): no changes. No screen, string or token changed, so DESIGN.md and the carta-design questions do not apply; the trip page's existing "where" row (shown only for source and city pins, `JourneyPage.jsx`) will start appearing on these 115 trips once the tracked wire is rebuilt.

Not touched, deliberately: `reports/validation-report.md` and `validation-issues.json` (T332, merged this wave, regenerated them; a second regeneration here would only conflict), `data/trips.flat.csv` and the seed migration (both carry coordinates; see T090-b), and `.github/workflows/trip-validator.yml` (it already downloads cities500, which is all the new checks need).

## Commands run

From `Trips/carta-unified/carta-unified` in the worktree. `S` is the session scratch folder; nothing was written to the main checkout or to `cache/`.

```
# the 39 GeoNames country files for the catalogue's countries (CC BY 4.0), to scratch
for c in AD AL AT BA BE BG CH CZ DE DK EE ES FI FO FR GR HR HU IE IT LI LT LU LV MC MD ME MK NL NO PL PT RO RS SE SI SK SM XK; do
  curl -fsSL https://download.geonames.org/export/dump/$c.zip -o $S/geonames/$c.zip && unzip -o -q $S/geonames/$c.zip $c.txt -d $S/geonames
done
# cities500 first, then the country files; ; is the Windows path separator
export CARTA_GAZETTEER="<main>\cache\geonames_cities500.txt;$S\geonames\AD.txt;...;$S\geonames\XK.txt"
python pipeline/geocode.py            # dry run: 115 re-derived, 0 left
python pipeline/geocode.py --write
# validator, wire and gazetteer read from the main checkout; reports to scratch
python pipeline/validate.py --wire "<main>\continent-app\public\journeys" --gazetteer "<main>\cache\geonames_cities500.txt" --report $S\val_final.md --json $S\val_final.json
python pipeline/validate.py --self-test --wire "<main>\continent-app\public\journeys" --gazetteer "<main>\cache\geonames_cities500.txt"
python pipeline/generation_gate.py self-test
# offline wire builds to scratch, image cache read from the main checkout, cache writes refused
python $S/wire.py <worktree> <main> <master.json> $S/wire_before|wire_after   # build_wire.py --no-fetch --src --out
git merge-tree --write-tree main p5-j1-geolocation    # clean against main after the wave 10 merges, T332 included
```

geonamescache is not installed on this machine, so for the reproduction check it went into a scratch folder (`pip install --target $S/pylib geonamescache`, version 3.0.2) on PYTHONPATH; no package was added to the repository or the system.

## Config and secrets set

None in the repository. `CARTA_GAZETTEER` is a new, optional environment variable read by `geocode.py`: one or more GeoNames dump paths separated by the OS path separator, cities500 first. Without it `geocode.py` reads `cache/geonames_cities500.txt`. The country files were downloaded to scratch only and are not kept anywhere; GeoNames republishes them daily, so a later re-derivation can differ slightly, which is one reason the stored coordinates, not the script, are the record.

## Before/after measurements

Precision counts from `data/trips.master.json` at the base commit (d39d55a0b) and after the task. Validator figures are full runs of `pipeline/validate.py` against the main checkout's cached cities500 and tracked wire, so the totals include the defects other tasks own; "old validator" is the file at the base commit.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips pinned at the country capital (precision country) | 61 | 0 | -61 |
| Trips pinned at the gateway city (precision gateway) | 54 | 0 | -54 |
| Trips on a basecamp or itinerary town (precision city) | 108 | 223 | +115 |
| Trips with a source coordinate | 30 | 30 | 0 |
| coordinate-capital-fallback errors (new check, old data / new data) | 61 | 0 | -61 |
| coordinate-outside-country errors | 0 | 0 | 0 |
| gateway-coordinates warnings | 54 | 0 | -54 |
| coordinate-far-from-itinerary warnings (new check) | 90 | 16 | -74 |
| Validator errors, old validator on old data / new validator on new data | 606 | 606 | 0 |
| Validator warnings, same runs | 623 | 524 | -99 |
| Validator errors on the tree merged with main (T332 included) | n/a | 464, none of them a coordinate code | |
| Median pin move, the 61 capital pins | | 165 km (4 to 959) | |
| Median pin move, the 54 gateway pins | | 75 km (17 to 196) | |
| New pins in the wrong country by Natural Earth 50 m | 61 capital pins were in-country but on the capital | 0 of 115 | |
| Heroes changed in an offline wire rebuild | | 2 of 253 (18 before the build_wire.py change) | |

The new validator on the old data reports 667 errors, the 606 plus the 61 capital pins, which is the check doing what the task asks. The 99 fewer warnings are the 54 gateway warnings and the 61 approximate-coordinates warnings gone, less the 16 far-from-itinerary warnings the new check adds.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Kotor and Tivat trips pinned on Tivat, the arrival airport | Equal support, first-named won | The gateway city is out of the vote when anything else resolves; most mentions breaks a support tie |
| Madeira trail week put on mainland villages called Santana and Sao Vicente | Madeira lies at 32.6 N, south of the 33 N box both files used | Box moved to 27 N in geocode.py, and validate.py now reads the same constant |
| Kopaonik on "Duboka", Corvara on a hamlet above Merano, Santa Teresa in Abruzzo | A homonym with no support won on a tie, or a country-file hamlet outranked the cities500 town | cities500 answers first and country files only for names it lacks; a homonym is scored by its distance to the rest of the itinerary |
| Extremadura week on La Vera, Tenerife | The wider box let the Canaries in and three candidates tied on support | Total distance to the other named places now breaks ties |
| Mercantour on Le Boreon, Berner Oberland on Griesalp, not the stated basecamps | A nearby village gathered as much support as the basecamp | When a basecamp resolves, the pin is chosen among basecamps |
| Tara road trip on Sarajevo | A homonym of Sutjeska near Sarajevo lent support; Sarajevo is in the trip's second country | The pin stays in the primary country when a named place resolves there |
| "Point" in Austria from "Point-to-point" basecamp lines, hotels named Quinta or Estalagem resolving as hamlets | Shape words and lodging words read as place names | Added to the stop list |
| Patch scripts failed to find their target text | The worktree checks files out with CRLF; Bash heredocs also strip backslashes | Patches run from files written with the Write tool, normalising line endings and writing them back as found |
| 18 heroes changed in the offline rebuild | build_wire.py put a city pin's place first among hero candidates | A derived pin's place is tried after the basecamps and sub-region |

## What is still open

The tracked wire in `continent-app/public/journeys` still carries the old pins. It has to be rebuilt on the main checkout with fetching on, the same rebuild T085-a, T087-a and T094-a wait for. After it, the Appenzell week needs a look: the offline rebuild gives it no hero, because its old hero was the Zurich gateway photograph, and only a fetching run looks up its new candidates. The trip page's coordinate row will appear on these 115 trips at the same moment, so that is also when to check one at 380 px and desktop (T090-a).

`data/trips.flat.csv` and `supabase/migrations/20260902000002_carta_seed.sql` both carry lat, lon and coord_precision and still hold the old pins; T332's budget figures are stale there too. The seed comes from `export_sql.py` over the master. The CSV is only written by `build.py`, which needs the raw batches, so it needs either those batches or a small writer that reuses `build.to_csv_row`. Both are best done once, after the wave merge (T090-b).

The validation report files T332 regenerated describe the old coordinates and lack the new codes; regenerate them on main after this branch merges (T090-c).

The far-from-itinerary warning found two basecamp pins that look wrong, in the 108 records this task left alone: the Baqueira-Beret ski week sits on Lleida, 122 km from Vielha, and the Moravia wine week on Prague, 181 km from Znojmo. Both came from the old geonamescache tiers matching a province or a gateway name. The other 14 warnings are city trips whose gateway is the city itself, Nordic records with no gateway field, or homonyms. A re-derive of those two needs an `--ids` option on `geocode.py` and a reviewer (T090-d).

`generation_gate.py`'s `derive()` writes `coordinates: None` for a generated trip, so a new trip gets no pin and only a missing-coordinates warning. It should call `geocode.geocode_trip`. That file is outside this task (T090-e).

The namesake warning from T084 (`place-outside-country`, 18 warnings) is unchanged. Seven of the 18 are real villages under 500 people that the country files know (Lozova twice, Brda, Vrata, Muran, Kalana, Bolonia); the rest are words or sites (Salt, Pantheon, Karst, Albania). Reading the country files in that check would remove the seven, but CI downloads only cities500, so it would need the workflow to fetch them too (T090-f).

## Rollback procedure

Before merge, drop the branch. After merge, revert the two T090 commits on p5-j1-geolocation (the code and data commit 9d181af6b, then the report commit, which also carries a docstring touch-up in geocode.py); that restores the old geocoder, validator, wire-builder candidate order, docs and the 115 old coordinates in one step; the data change is fully reversible because the old values are in git. Nothing was written outside the root repo, no migration was added, and the tracked wire was not touched, so production is unaffected until the rebuild in T090-a.
