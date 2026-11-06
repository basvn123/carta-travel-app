# ES: catalogue gaps review (D15)

## Gaps

| Gap | Scope | Need | Added | Left | Main reasons candidates fell out |
|---|---|--:|--:|--:|---|
| D6-013 | ES70 Canarias | 22 | 0 | 22 | under the worth floor 109, covered 10 |
| D6-016 | ES42 Castilla-La Mancha | 14 | 6 | 8 | under the worth floor 819, covered 12 |

## Add (6)

| Place | Gap | Region | Worth | People | Anchor | Why | Source |
|---|---|---|--:|--:|---|---|---|
| Molina de Aragón | D6-016 | ES42 | 0.427 | 3,536 | ZAZ 116 km | registers: heritage_town; 4x the sights of a place its size; sights: landmark and historical building, palace; nearest shipped Monasterio de Piedra 40 km | GeoNames 3116595 (cities500, CC BY 4.0); Overture Places, 8 sights won (CDLA-Permissive 2.0); Wikidata Q43167339 (CC0); data/derived/place_registry.json |
| Infantes | D6-016 | ES42 | 0.420 | 5,835 | MJV 195 km | registers: heritage_town; 3x the sights of a place its size; sights: landmark and historical building, monument; nearest shipped Almagro 63 km | GeoNames 2516449 (cities500, CC BY 4.0); Overture Places, 11 sights won (CDLA-Permissive 2.0); Wikidata Q43168602 (CC0); data/derived/place_registry.json |
| Moya | D6-016 | ES42 | 0.417 | 242 | VLC 91 km | registers: heritage_town; 9x the sights of a place its size; sights: landmark and historical building, castle; nearest shipped Teruel 49 km | GeoNames 2513475 (cities500, CC BY 4.0); Overture Places, 3 sights won (CDLA-Permissive 2.0); Wikidata Q28517436 (CC0); data/derived/place_registry.json |
| Riópar | D6-016 | ES42 | 0.416 | 1,504 | MJV 139 km | 8x the sights of a place its size; sights: landmark and historical building, national park; 56 Wikipedia views a day; nearest shipped Albacete 75 km | GeoNames 2511818 (cities500, CC BY 4.0); Overture Places, 11 sights won (CDLA-Permissive 2.0) |
| Torija | D6-016 | ES42 | 0.412 | 619 | MAD 54 km | 10x the sights of a place its size; sights: castle, monument; 34 Wikipedia views a day; nearest shipped Brihuega 14 km | GeoNames 3107932 (cities500, CC BY 4.0); Overture Places, 7 sights won (CDLA-Permissive 2.0) |
| Pastrana | D6-016 | ES42 | 0.411 | 1,081 | MAD 54 km | registers: heritage_town; 7x the sights of a place its size; sights: landmark and historical building, monument; nearest shipped Guadalajara 31 km | GeoNames 3114204 (cities500, CC BY 4.0); Overture Places, 8 sights won (CDLA-Permissive 2.0); Wikidata Q43167552 (CC0); data/derived/place_registry.json |

## Stretch, below today's floor (8)

Not on the approve list: these pass every rule except the worth floor of 0.4, and score 0.3 or more. Taking them is an owner decision on the rule.

| Place | Gap | Region | Worth | People | Anchor | Why | Source |
|---|---|---|--:|--:|---|---|---|
| Ruidera | D6-016 | ES42 | 0.380 | 598 | MAD 176 km | 13x the sights of a place its size; sights: national park, park; 21 Wikipedia views a day; nearest shipped Alcázar de San Juan 54 km | GeoNames 2511661 (cities500, CC BY 4.0); Overture Places, 9 sights won (CDLA-Permissive 2.0) |
| Ciudad Real | D6-016 | ES42 | 0.363 | 74,743 | MAD 168 km | sights: museum, park; nearest shipped Almagro 22 km | GeoNames 2519402 (cities500, CC BY 4.0); Overture Places, 43 sights won (CDLA-Permissive 2.0) |
| Torremocha del Campo | D6-016 | ES42 | 0.360 | 251 | MAD 97 km | 13x the sights of a place its size; sights: landmark and historical building, national park; nearest shipped Siguenza 10 km | GeoNames 3107754 (cities500, CC BY 4.0); Overture Places, 7 sights won (CDLA-Permissive 2.0) |
| Huete | D6-016 | ES42 | 0.352 | 2,075 | MAD 82 km | 6x the sights of a place its size; sights: landmark and historical building, museum; nearest shipped Cuenca 48 km | GeoNames 3120511 (cities500, CC BY 4.0); Overture Places, 10 sights won (CDLA-Permissive 2.0) |
| Almadén | D6-016 | ES42 | 0.349 | 4,855 | BJZ 173 km | 4x the sights of a place its size; sights: landmark and historical building, monument; nearest shipped Guadalupe 87 km | GeoNames 2521938 (cities500, CC BY 4.0); Overture Places, 12 sights won (CDLA-Permissive 2.0) |
| Manzanares | D6-016 | ES42 | 0.341 | 19,186 | MAD 165 km | sights: landmark and historical building, church cathedral; nearest shipped Almagro 32 km | GeoNames 2514190 (cities500, CC BY 4.0); Overture Places, 22 sights won (CDLA-Permissive 2.0) |
| Villalba de la Sierra | D6-016 | ES42 | 0.337 | 659 | MAD 128 km | 9x the sights of a place its size; sights: landmark and historical building, monument; nearest shipped Cuenca 19 km | GeoNames 3105513 (cities500, CC BY 4.0); Overture Places, 8 sights won (CDLA-Permissive 2.0) |
| Talavera de la Reina | D6-016 | ES42 | 0.321 | 88,856 | MAD 122 km | sights: monument, landmark and historical building; nearest shipped Arenas de San Pedro 35 km | GeoNames 2510693 (cities500, CC BY 4.0); Overture Places, 45 sights won (CDLA-Permissive 2.0) |

## Merge (0)

None.

## Remove (0)

None.

## Fix (10)

| Place | Reason | Source |
|---|---|---|
| Badajoz `BJZ` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Murcia `MJV` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Asturias (Oviedo) `OVD` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Pamplona `PNA` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Valladolid `VLL` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Jerez `XRY` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| El Rocio `gem:el-rocio` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Miño de Medinaceli `gem:mino-de-medinaceli` | missing image (refill through the imagery layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Ordesa & Monte Perdido `gem:ordesa` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Salamanca `gem:salamanca` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
