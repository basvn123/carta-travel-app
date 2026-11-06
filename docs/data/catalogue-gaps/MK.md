# MK: catalogue gaps review (D15)

## Add (0)

None.

## Stretch, below today's floor (0)

Not on the approve list: these pass every rule except the worth floor of 0.4, and score 0.3 or more. Taking them is an owner decision on the rule.

None.

## Merge (0)

None.

## Remove (0)

None.

## Fix (3)

| Place | Reason | Source |
|---|---|---|
| Ohrid `OHD` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Skopje `SKP` | missing anchor_airport (refill through the flights layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
| Мирковци `gem:place` | invalid city (no Latin form, so its name key and slug are empty) (refill through the  layer) | D2 rules (scripts/quality/rules.yaml, floor 0.90 or more) and docs/wire.schema.json |
