# T473: owner calls on the T472 navigation plan applied

## Task ID

T473

## Date

2026-10-20

## What changed

The owner answered the three decisions T472 needed by W44, all as proposed.

- **T472-a:** the navigation becomes three places plus an account icon. Explore takes Destinations in, and its categories become filters and rails. Plan holds the trip and its days as one workspace, and one day is a one-day trip. My trips is the third. Old links keep working.
- **T472-b:** the pass keeps the name Trip Pass. No button ever says "Get a pass" on its own.
- **T472-c:** the first trip saves on the device without an account. Sign-in comes only for a second device, co-editing or a second trip.

The calls are recorded in three places:
- **The roadmap:** a "Besloten op 20 oktober (T473)" line under the decisions table in "Begin hier". The three rows left that table, and rows 1.15 and 2.19 now say the calls were made.
- **The plan:** a "Besluiten (20 oktober, T473)" section in `Roadmap/1.15-navigatie-pass-prijsweergave.md`. The three rows left its "Te beslissen" table.
- **The register:** rows T472-a to c are closed.

Roadmap rows 1.15, 2.18 and 2.19 are now unblocked. No app code changed.

## Files touched

**Modified:**
- Roadmap/Carta roadmap.md
- Roadmap/1.15-navigatie-pass-prijsweergave.md
- Execution/_OPEN.md (T472-a to c closed by T473)

**Created:**
- Execution/P11/T473-owner-calls-t472.md

## Commands run

```
git switch -c p11-owner-calls-t472
python -I (exact-string replacements, each asserted to match once)
```

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

No issues.

## What is still open

None raised. T472-d to g and T471-a to d stay open with their deadlines in the roadmap's "Begin hier".

## Rollback procedure

Revert the commit on branch `p11-owner-calls-t472`, which reopens T472-a to c and restores the decisions table.
