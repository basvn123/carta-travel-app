# GR: catalogue gaps review (D15)

## Gaps

| Gap | Scope | Need | Added | Left | Main reasons candidates fell out |
|---|---|--:|--:|--:|---|
| D6-022 | EL64 Sterea Elláda | 7 | 0 | 7 | under the worth floor 150, covered 6, no place name 1 |

## Add (0)

None.

## Stretch, below today's floor (7)

Not on the approve list: these pass every rule except the worth floor of 0.4, and score 0.3 or more. Taking them is an owner decision on the rule.

| Place | Gap | Region | Worth | People | Anchor | Why | Source |
|---|---|---|--:|--:|---|---|---|
| Kárystos | D6-022 | EL64 | 0.386 | 5,091 | ATH 42 km | sights: beach, monument; nearest shipped Limín Mesoyaías 39 km | GeoNames 260935 (cities500, CC BY 4.0); Overture Places, 27 sights won (CDLA-Permissive 2.0) |
| Aráchova | D6-022 | EL64 | 0.355 | 2,439 | VOL 84 km | 6x the sights of a place its size; sights: landmark and historical building, church cathedral; nearest shipped Delphi 7 km | GeoNames 264714 (cities500, CC BY 4.0); Overture Places, 14 sights won (CDLA-Permissive 2.0) |
| Karpenísi | D6-022 | EL64 | 0.353 | 6,888 | PVK 89 km | 3x the sights of a place its size; sights: landmark and historical building, museum; nearest shipped Lake Plastiras 43 km | GeoNames 260891 (cities500, CC BY 4.0); Overture Places, 14 sights won (CDLA-Permissive 2.0) |
| Lamía | D6-022 | EL64 | 0.334 | 52,006 | VOL 47 km | sights: church cathedral, landmark and historical building; nearest shipped Delphi 47 km | GeoNames 258620 (cities500, CC BY 4.0); Overture Places, 45 sights won (CDLA-Permissive 2.0) |
| Chairóneia | D6-022 | EL64 | 0.334 | 993 | VOL 81 km | 7x the sights of a place its size; sights: castle, landmark and historical building; nearest shipped Delphi 30 km | GeoNames 260176 (cities500, CC BY 4.0); Overture Places, 6 sights won (CDLA-Permissive 2.0) |
| Dístomo | D6-022 | EL64 | 0.332 | 0 | VOL 89 km | 13x the sights of a place its size; sights: landmark and historical building, church cathedral; nearest shipped Delphi 16 km | GeoNames 263034 (cities500, CC BY 4.0); Overture Places, 7 sights won (CDLA-Permissive 2.0) |
| Livadeiá | D6-022 | EL64 | 0.306 | 21,492 | VOL 87 km | sights: church cathedral, landmark and historical building; nearest shipped Delphi 33 km | GeoNames 258463 (cities500, CC BY 4.0); Overture Places, 21 sights won (CDLA-Permissive 2.0) |

## Merge (3)

| Keep | Drop | Action | Reason | Source |
|---|---|---|---|---|
| Rhodes `RHO` | Ródos `gem:rodos` | merge | same GeoNames place 400666 | GeoNames cities500 (CC BY 4.0) and the shipped catalogue |
| Chios (Mastic Villages) `gem:chios-mastic` | Chios `gem:chios` | review | same GeoNames place 259973; one name carries a qualifier in brackets | GeoNames cities500 (CC BY 4.0) and the shipped catalogue |
| Elafonisos (Simos Beach) `gem:elafonisos-simos` | Elafónisos `gem:elafonisos` | review | same GeoNames place 262817; one name carries a qualifier in brackets | GeoNames cities500 (CC BY 4.0) and the shipped catalogue |

## Remove (0)

None.

## Fix (10)

| Place | Reason | Source |
|---|---|---|
| Kalamata `KLX` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Kavala `KVA` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Preveza `PVK` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Balos Lagoon `gem:balos-lagoon` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Koufonisia `gem:koufonisia` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Kythira `gem:kythira` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Monemvasia `gem:monemvasia` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Samaria Gorge `gem:samaria-gorge` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Vatheia (Deep Mani) `gem:vatheia-mani` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Άργος `gem:αργος` | invalid city (no Latin form, so its name key and slug are empty) (refill through the  layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
