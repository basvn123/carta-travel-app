# T454: Honest lift claims on mountains

## Task ID

T454

## Date

2026-10-15

## What changed

The T451 fact check found the Mountains layer claiming a lift to the summit of mountains whose lifts stop well below it: Mont Blanc, the Matterhorn, Teide, the Eiger, Dachstein, Dajti, Hochkönig and Montserrat (row T451-d). The owner asked for it to be fixed in the pipeline.

**Why it happened.** A read-only investigation of `pipeline/mountains/peak_index.py` `lift_of()` found two causes:
1. **The OSM distance was too loose.** An OSM aerialway element within 700 m of the summit counted as "this mountain's lift". Every true summit lift in the wire sits within 219 m. From about 300 m out the station is a shoulder or a terrace well below the top: Teide 550 m, Titlis 592 m, Hafelekar 488 m.
2. **Curated lifts carried no distance at all.** Fifty-one seeds in `seed_peaks.py` named a lift ("cable_car", "rack", ...), and every one was published as a lift to the top. Most are lifts on the mountain: the Aiguille du Midi under Mont Blanc, the Jungfraujoch under the Jungfrau, Fuente Dé far from the Naranjo de Bulnes.

**The rule now (pipeline):**
- An OSM top station counts within 250 m (`SUMMIT_LIFT_M`, was 700).
- `LIFT_TOP_CONFIRMED` lists five mountains, by Wikidata id, whose lift ends at the top although OSM measures the station further out. The summit node and the station node sit apart on Lomnický štít, Harder Kulm, Ulriken, Ljubljana Castle Hill and Montjuïc.
- A curated lift is a lift to the top only where its seed carries `"top": True`. Fifteen seeds do, each checked by hand:
  - Pilatus, Rigi, Gornergrat, Monte Generoso;
  - Brocken, Drachenfels, Puy de Dôme, Snowdon, Petřín, Fløyen;
  - Schafberg, Zugspitze (AT), Pfänder, Gaislachkogl, Kitzbüheler Horn.
- Every other lift becomes "lifts on the mountain". The page then says "There are lifts on the mountain, though not to this summit."
- One correction to the fact check: Śnieżka keeps its claim. Since 2014 the Czech cable car from Pec pod Sněžkou runs to the summit; the fact check had the Polish chairlift to Kopa in mind.

**The published wire.** The rebuild that applies the rule needs the enrich cache (`cache/mountains/rich_*.json`), which is not on this machine. So `pipeline/mountains/repair_lift_wire.py` applies the same rule, importing the same constants and seeds, to `public/mountains/`. For each demoted claim it changes, together:
- the row's lift kind;
- its access code (`liftTop` to `liftMountain`);
- its "why" entry.

It is idempotent: a second run demotes nothing.

| | Before | After |
|---|---|---|
| Mountains claiming a lift to the top | 185 | 92 |
| Demoted to lifts on the mountain | | 93 (43 curated, 50 OSM) |
| Of those, in `top.json` | | 58 rows |

Mont Blanc, the Eiger, Etna, Teide, the Jungfrau, Titlis and Montserrat lose the claim. Zugspitze, Pilatus, Rigi, Snowdon, Lomnický štít and Śnieżka keep it.

**The score is not recomputed by the repair.** A mountain's score weighs its access, so the 93 keep the access weight of a summit lift until the next full rebuild recomputes it. The words on screen are honest now; the order of the list moves when the cache is back.

## Files touched

**Pipeline (root):**
- `pipeline/mountains/peak_index.py`: `SUMMIT_LIFT_M` 250, `LIFT_TOP_CONFIRMED`, the seed `top` rule in `lift_of()`.
- `pipeline/mountains/seed_peaks.py`: `"top": True` on 15 seeds and the field documented.
- `pipeline/mountains/repair_lift_wire.py` (new).

**Data (app, gitignored, ships with the R2 data push):** `continent-app/public/mountains/*.json` and `top.json`, repaired in place. A copy of the pre-repair files was kept in the session scratchpad.

**Created (root):** this report.

## Commands run

```
python pipeline/mountains/repair_lift_wire.py --dry-run
python pipeline/mountains/repair_lift_wire.py
python pipeline/mountains/repair_lift_wire.py --dry-run     (0 left: idempotent)
CARTA_PORT=5298 node scripts/verify_mountains.mjs
CARTA_PORT=5298 node scripts/verify_destinations.mjs
npm test
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Mountains with a lift-to-the-top claim | 185 | 92 |
| Named false claims from the fact check still shown | 9 | 0 |
| True summit lifts lost | | 0 of those checked |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first dry run demoted Lomnický štít, Ulriken, Harder Kulm, Ljubljana Castle Hill and Montjuïc | OSM measured their station 279 to 680 m from the summit node | `LIFT_TOP_CONFIRMED` by Wikidata id |

## Checks

| Check | Result |
|---|---|
| verify_mountains | pass |
| verify_destinations | 86/86 (the "Up by lift" rail still has its four or more mountains) |
| npm test | 375/375 |

## What is still open

- **T454-a (user).** The repaired mountain wire reaches production only with the R2 data push (`node scripts/r2/push-data.mjs --live`), with T453-a.
- **T454-b.** The rule still measures horizontal distance. The station's height against the summit's is the real test, already row T182-c (export the top station's `ele`, or sample GLO-30 at it). With it, `LIFT_TOP_CONFIRMED` and the curated `top` flags could shrink.
- **T454-c.** The next full mountain rebuild (once the enrich cache is restored) recomputes the scores of the 93 demoted mountains with their true access.

Row T451-d is closed by this task.

## Rollback procedure

- **Pipeline:** revert the T454 commit.
- **Wire:** restore `continent-app/public/mountains/` from the pre-repair copy, or pull it from R2, which still holds the pre-T454 wire until T454-a runs.
