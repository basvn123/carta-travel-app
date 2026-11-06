# HR: catalogue gaps review (D15)

## Gaps

| Gap | Scope | Need | Added | Left | Main reasons candidates fell out |
|---|---|--:|--:|--:|---|
| D6-018 | HR02 Panonska Hrvatska | 9 | 0 | 9 | under the worth floor 375, covered 4 |

## Add (0)

None.

## Stretch, below today's floor (3)

Not on the approve list: these pass every rule except the worth floor of 0.4, and score 0.3 or more. Taking them is an owner decision on the rule.

| Place | Gap | Region | Worth | People | Anchor | Why | Source |
|---|---|---|--:|--:|---|---|---|
| Ozalj | D6-018 | HR02 | 0.381 | 1,053 | ZAG 48 km | 14x the sights of a place its size; sights: landmark and historical building, museum; nearest shipped Zagreb 45 km | GeoNames 3193754 (cities500, CC BY 4.0); Overture Places, 15 sights won (CDLA-Permissive 2.0) |
| Karlovac | D6-018 | HR02 | 0.362 | 41,869 | ZAG 49 km | sights: landmark and historical building, church cathedral; nearest shipped Rastoke 41 km | GeoNames 3345300 (cities500, CC BY 4.0); Overture Places, 32 sights won (CDLA-Permissive 2.0) |
| Vukovar | D6-018 | HR02 | 0.326 | 22,255 | OSI 19 km | sights: landmark and historical building, history museum; nearest shipped Šid 30 km | GeoNames 3187047 (cities500, CC BY 4.0); Overture Places, 31 sights won (CDLA-Permissive 2.0) |

## Merge (1)

| Keep | Drop | Action | Reason | Source |
|---|---|---|---|---|
| Krk `gem:krk` | Krk (Baška) `gem:krk-baska` | review | same GeoNames place 3197208; one name carries a qualifier in brackets | GeoNames cities500 (CC BY 4.0) and the shipped catalogue |

## Remove (0)

None.

## Fix (6)

| Place | Reason | Source |
|---|---|---|
| Osijek `OSI` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Split `SPU` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Kornati Islands `gem:kornati` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Northern Velebit `gem:northern-velebit` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Plitvice Lakes `gem:plitvice` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Trogir `gem:trogir` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
