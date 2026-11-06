# LT: catalogue gaps review (D15)

## Gaps

| Gap | Scope | Need | Added | Left | Main reasons candidates fell out |
|---|---|--:|--:|--:|---|
| D6-010 | Lithuania | 8 | 0 | 8 | under the worth floor 135, covered 32, no place name 1 |

## Add (0)

None.

## Stretch, below today's floor (6)

Not on the approve list: these pass every rule except the worth floor of 0.4, and score 0.3 or more. Taking them is an owner decision on the rule.

| Place | Gap | Region | Worth | People | Anchor | Why | Source |
|---|---|---|--:|--:|---|---|---|
| Birštonas | D6-010 | LT02 | 0.384 | 2,331 | KUN 40 km | 7x the sights of a place its size; sights: landmark and historical building, park; nearest shipped Rumsiskes 31 km | GeoNames 600443 (cities500, CC BY 4.0); Overture Places, 19 sights won (CDLA-Permissive 2.0) |
| Šiauliai | D6-010 | LT02 | 0.378 | 99,462 | KUN 118 km | sights: museum, landmark and historical building; nearest shipped Hill of Crosses 11 km | GeoNames 594739 (cities500, CC BY 4.0); Overture Places, 64 sights won (CDLA-Permissive 2.0) |
| Merkinė | D6-010 | LT02 | 0.376 | 963 | VNO 88 km | 9x the sights of a place its size; sights: landmark and historical building, national park; nearest shipped Druskininkai 22 km | GeoNames 597070 (cities500, CC BY 4.0); Overture Places, 9 sights won (CDLA-Permissive 2.0) |
| Gelgaudiškis | D6-010 | LT02 | 0.341 | 1,839 | KUN 72 km | 6x the sights of a place its size; sights: national park, landmark and historical building; nearest shipped Kaunas 63 km | GeoNames 599420 (cities500, CC BY 4.0); Overture Places, 7 sights won (CDLA-Permissive 2.0) |
| Salantai | D6-010 | LT02 | 0.319 | 1,829 | PLQ 31 km | 5x the sights of a place its size; sights: landmark and historical building, national park; nearest shipped Zemaitija NP (Plateliai) 20 km | GeoNames 595020 (cities500, CC BY 4.0); Overture Places, 8 sights won (CDLA-Permissive 2.0) |
| Šventoji | D6-010 | LT02 | 0.312 | 2,000 | PLQ 6 km | sights: beach, landmark and historical building; nearest shipped Palanga 12 km | GeoNames 594050 (cities500, CC BY 4.0); Overture Places, 22 sights won (CDLA-Permissive 2.0) |

## Merge (0)

None.

## Remove (0)

None.

## Fix (5)

| Place | Reason | Source |
|---|---|---|
| Palanga `PLQ` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Vilnius `VNO` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Kernavė `gem:kernave` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Rumsiskes `gem:rumsiskes` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Trakai `gem:trakai` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
