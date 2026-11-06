# Trails recovery sizing (T1094, D7)

Generated 2026-11-06T00:57:52+00:00 by `pipeline/trails/recover_walks.py` from the committed registry (2026-09-18T03:48:46+00:00) and coverage report (2026-10-02T00:19:51+00:00).

## way_only_not_derived

| Bucket | Rows | What carries it |
|---|---|---|
| no trail signal (streets, squares, bridges, lakes) | 8,621 | registry re-harvest reclassifies them `not_a_walk`; no derivation should publish them |
| walk evidence, 2+ named ways | 120 | fame or base-name chain; T1094 article-pair and spine rules |
| walk evidence, 1 named way | 126 | T1094 lone famous way, if 600 m or more and not a structure (56 are named like one) |
| a relation exists too | 17 | the relation path (ingest, splice, curate) |
| network tag only | 7 | none yet |

Ceiling for derivation: **190** rows (walk evidence, less the lone ways named like a structure). The box run gives the real number.

## failed_continuity

| Bucket | Rows |
|---|---|
| needs lab split | 4,169 |
| same relation other country | 251 |
| parent of published stage | 126 |
| already published | 9 |

`needs lab split` is sized by `python pipeline/trails/splice.py --dry-run` on the box: it prints how many more relations the T1094 reorder pass bridges, and why the rest are refused.

## The 30 famous test routes

| Country | Route | Reason now | Evidence | Expected after the run | Rule |
|---|---|---|---|---|---|
| FR | Sentier des Roches | `way_only_not_derived` | 18 named ways, demanding_mountain_hiking | recovered by derivation | fame chain, with the T1094 spine rule if it branches |
| FR | Tour du Mont Blanc | `matched` | - | published | - |
| FR | GR 20 | `matched` | relation 12484370 | published | - |
| FR | Cirque de Gavarnie | `unresolved_seed` | - | not recovered | no rule: unresolved_seed |
| ES | Ruta del Cares | `way_only_not_derived` | 7 named ways, hiking | recovered by derivation | fame chain, with the T1094 spine rule if it branches |
| ES | Caminito del Rey | `matched` | 1 named ways, mountain_hiking | published | - |
| ES | Teide | `unresolved_seed` | - | not recovered | no rule: unresolved_seed |
| CH | Hardergrat | `None` | - | no registry row | - |
| CH | Eiger Trail | `matched` | - | published | - |
| CH | Gornergrat | `no_osm_data` | - | not recovered | no rule: no_osm_data |
| IS | Laugavegur | `failed_continuity` | relation 1225037 | recovered only if its breaks are order artefacts | T1094 reorder pass (splice.py) |
| IS | Fimmvorduhals | `matched` | relation 396940 | published | - |
| PL | Rysy | `matched` | - | published | - |
| PL | Morskie Oko | `no_osm_data` | - | not recovered | no rule: no_osm_data |
| PL | Orla Perc | `way_only_not_derived` | 12 named ways, demanding_alpine_hiking | recovered by derivation | fame chain, with the T1094 spine rule if it branches |
| PT | Pico Ruivo | `no_osm_data` | - | not recovered | no rule: no_osm_data |
| IT | Seceda | `no_osm_data` | - | not recovered | no rule: no_osm_data |
| IT | Alpe di Siusi | `unresolved_seed` | - | not recovered | no rule: unresolved_seed |
| IT | Tre Cime di Lavaredo | `unresolved_seed` | - | not recovered | no rule: unresolved_seed |
| IT | Sentiero degli Dei | `matched` | relation 4757514 | published | - |
| GR | Mount Olympus | `unresolved_seed` | - | not recovered | no rule: unresolved_seed |
| GR | Samaria | `matched` | - | published | - |
| HR | Plitvice | `unresolved_seed` | - | not recovered | no rule: unresolved_seed |
| NO | Trolltunga | `matched` | - | published | - |
| NO | Preikestolen | `matched` | - | published | - |
| NO | Besseggen | `matched` | 1 named ways, demanding_mountain_hiking | published | - |
| GB | Ben Nevis | `matched` | - | published | - |
| GB | West Highland Way | `matched` | relation 16287, 1 named ways | published | - |
| SI | Triglav | `matched` | - | published | - |
| AT | Adlerweg | `matched` | - | published | - |
