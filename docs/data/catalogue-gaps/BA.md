# BA: catalogue gaps review (D15)

## Gaps

| Gap | Scope | Need | Added | Left | Main reasons candidates fell out |
|---|---|--:|--:|--:|---|
| D6-008 | Bosnia and Herzegovina | 14 | 0 | 14 | under the worth floor 285, covered 30 |

## Add (0)

None.

## Stretch, below today's floor (3)

Not on the approve list: these pass every rule except the worth floor of 0.4, and score 0.3 or more. Taking them is an owner decision on the rule.

| Place | Gap | Region | Worth | People | Anchor | Why | Source |
|---|---|---|--:|--:|---|---|---|
| Visoko | D6-008 |  | 0.314 | 17,890 | SJJ 22 km | sights: landmark and historical building, church cathedral; nearest shipped Sarajevo 21 km | GeoNames 3187609 (cities500, CC BY 4.0); Overture Places, 20 sights won (CDLA-Permissive 2.0) |
| Foča | D6-008 |  | 0.306 | 14,615 | SJJ 50 km | sights: landmark and historical building, church cathedral; nearest shipped Sutjeska (Tjentište) 21 km | GeoNames 3200837 (cities500, CC BY 4.0); Overture Places, 16 sights won (CDLA-Permissive 2.0) |
| Doboj | D6-008 |  | 0.301 | 27,235 | TZL 59 km | sights: landmark and historical building, church cathedral; nearest shipped Tuzla 51 km | GeoNames 3201984 (cities500, CC BY 4.0); Overture Places, 21 sights won (CDLA-Permissive 2.0) |

## Merge (0)

None.

## Remove (0)

None.

## Fix (4)

| Place | Reason | Source |
|---|---|---|
| Tuzla `TZL` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Lukomir `gem:lukomir` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Mostar `gem:mostar-ba` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Sutjeska (Tjentište) `gem:sutjeska` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
