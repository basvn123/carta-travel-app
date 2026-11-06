# IE: catalogue gaps review (D15)

## Gaps

| Gap | Scope | Need | Added | Left | Main reasons candidates fell out |
|---|---|--:|--:|--:|---|
| D6-021 | IE06 Eastern and Midland | 8 | 0 | 8 | under the worth floor 171, covered 72 |

## Add (0)

None.

## Stretch, below today's floor (8)

Not on the approve list: these pass every rule except the worth floor of 0.4, and score 0.3 or more. Taking them is an owner decision on the rule.

| Place | Gap | Region | Worth | People | Anchor | Why | Source |
|---|---|---|--:|--:|---|---|---|
| Slane | D6-021 | IE06 | 0.399 | 1,369 | DUB 37 km | 9x the sights of a place its size; sights: landmark and historical building, museum; nearest shipped Newgrange (Bru na Boinne) 6 km | GeoNames 2961450 (cities500, CC BY 4.0); Overture Places, 10 sights won (CDLA-Permissive 2.0) |
| Athlone | D6-021 | IE06 | 0.394 | 22,869 | DUB 110 km | sights: landmark and historical building, church cathedral; nearest shipped Clonmacnoise 12 km | GeoNames 3313472 (cities500, CC BY 4.0); Overture Places, 31 sights won (CDLA-Permissive 2.0) |
| Stradbally | D6-021 | IE06 | 0.393 | 1,350 | DUB 74 km | 8x the sights of a place its size; sights: church cathedral, landmark and historical building; nearest shipped Carlow 25 km | GeoNames 2961349 (cities500, CC BY 4.0); Overture Places, 10 sights won (CDLA-Permissive 2.0) |
| Kilmessan | D6-021 | IE06 | 0.390 | 654 | DUB 30 km | 12x the sights of a place its size; sights: landmark and historical building, castle; nearest shipped Newgrange (Bru na Boinne) 20 km | GeoNames 2963261 (cities500, CC BY 4.0); Overture Places, 11 sights won (CDLA-Permissive 2.0) |
| Straffan | D6-021 | IE06 | 0.372 | 635 | DUB 26 km | 10x the sights of a place its size; sights: landmark and historical building, castle; nearest shipped Dublin 24 km | GeoNames 2961342 (cities500, CC BY 4.0); Overture Places, 7 sights won (CDLA-Permissive 2.0) |
| Greystones | D6-021 | IE06 | 0.372 | 22,009 | DUB 34 km | registers: national_park; sights: beach, church cathedral; nearest shipped Glendalough (Wicklow) 23 km | GeoNames 2963848 (cities500, CC BY 4.0); Overture Places, 21 sights won (CDLA-Permissive 2.0); Wikidata Q22806718 (CC0); data/derived/place_registry.json |
| Castlepollard | D6-021 | IE06 | 0.368 | 1,163 | DUB 74 km | 9x the sights of a place its size; sights: landmark and historical building, castle; nearest shipped Newgrange (Bru na Boinne) 56 km | GeoNames 2965573 (cities500, CC BY 4.0); Overture Places, 9 sights won (CDLA-Permissive 2.0) |
| Birr | D6-021 | IE06 | 0.347 | 5,741 | DUB 115 km | 4x the sights of a place its size; sights: castle, landmark and historical building; nearest shipped Clonmacnoise 26 km | GeoNames 2966154 (cities500, CC BY 4.0); Overture Places, 13 sights won (CDLA-Permissive 2.0) |

## Merge (0)

None.

## Remove (0)

None.

## Fix (17)

| Place | Reason | Source |
|---|---|---|
| Kerry `KIR` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Knock `KOW` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Shannon `SNN` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Aran Islands (Inishmore) `gem:aran-islands` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Connemara `gem:connemara` | missing anchor_airport, geonames (refill through the flights, place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Dingle `gem:dingle` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Doolin `gem:doolin` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Downpatrick Head (Dun Briste) `gem:downpatrick-head` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Fanad Head `gem:fanad-head` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Galway & Cliffs of Moher `gem:galway-cliffs` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Inishbofin `gem:inishbofin` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Killarney `gem:killarney` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Loop Head `gem:loop-head` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Malin Head `gem:malin-head` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Mizen Head `gem:mizen-head` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Skellig Michael (Portmagee) `gem:skellig-michael` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Slieve League `gem:slieve-league` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
