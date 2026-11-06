# RS: catalogue gaps review (D15)

## Gaps

| Gap | Scope | Need | Added | Left | Main reasons candidates fell out |
|---|---|--:|--:|--:|---|
| D6-034 | RS11 City of Belgrade | 3 | 0 | 3 | under the worth floor 31, covered 22 |

## Add (0)

None.

## Stretch, below today's floor (2)

Not on the approve list: these pass every rule except the worth floor of 0.4, and score 0.3 or more. Taking them is an owner decision on the rule.

| Place | Gap | Region | Worth | People | Anchor | Why | Source |
|---|---|---|--:|--:|---|---|---|
| Grocka | D6-034 | RS11 | 0.357 | 0 | BEG 36 km | 13x the sights of a place its size; sights: landmark and historical building, monument; nearest shipped Smederevo 17 km | GeoNames 790132 (cities500, CC BY 4.0); Overture Places, 7 sights won (CDLA-Permissive 2.0) |
| Barajevo | D6-034 | RS11 | 0.330 | 0 | BEG 28 km | 11x the sights of a place its size; sights: landmark and historical building, church cathedral; nearest shipped Belgrade 25 km | GeoNames 792892 (cities500, CC BY 4.0); Overture Places, 8 sights won (CDLA-Permissive 2.0) |

## Merge (0)

None.

## Remove (0)

None.

## Fix (5)

| Place | Reason | Source |
|---|---|---|
| Belgrade `BEG` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Nis `INI` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Đavolja Varoš `gem:djavolja-varos` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Kopaonik `gem:kopaonik` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Studenica Monastery `gem:studenica` | missing geonames (refill through the place layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
