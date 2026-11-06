# T1180: Downhill relief, read uphill (D24, round 2 S96)

Roadmap item: D24 (trail quality pack). Register row closed: T286-c.

## Date

2026-11-06

## What changed

The trail rating's relief part now reads the climb a walker faces, not the stored ascent. `pipeline/trails/rate.py` `relief_raw` takes its climb per km from `climb_of(row)`, which is `attributes.uphill`, the one uphill rule the reason codes, the grade and the app's climb already use (stored descent at least 300 m more than the ascent and at least twice it: read from the bottom). Top height and spread do not depend on direction, so a route drawn summit to valley now scores exactly the relief of its uphill twin; no other route's relief changes. The handbook was silent on direction for relief, so the rule is now written in its "Trail rating" section. The trails lab and its row cache are not in this cloud container, so the published scores are not rewritten here: the re-rate is an owner step (T1180-a). The band changes were estimated on the shipped wire (2026-09-13), which carries every input relief reads, against the frozen v5 calibration: of the 503 walks the uphill rule marks as drawn downhill (488 in the lab at T286), 265 move up one or two bands (253 certain, 12 near a cut), 238 stay, none move down; 37 enter the top band (exceptional or excellent) that T1179's summaries cover, and none leave it.

## Research

None chosen. Two readings were possible: the climb in the walking direction (uphill rule) or both directions (for example the larger of ascent and descent). The uphill rule was taken because the handbook already uses it for every other climb (Trails difficulty, rule 6; summary facts; `rate.reasons_for`), `rate.py` imports it for exactly that reason ("imported rather than copied a fourth time"), and it makes the 488 score like their twins, which is the done condition. The larger of the two would also lift point to point walks under the rule's 300 m threshold (say 100 m up, 350 m down), which no other part of Carta reads as a 350 m climb; that would make the rating disagree with the climb the app prints.

## Files touched

- `pipeline/trails/rate.py`: `relief_raw` reads `climb_of(row)`; module docstring says "climb per kilometre read uphill".
- `tests/test_trail_climb_consistency.py`: four tests (twin equality on Mount Korab 9, the rule's threshold, uphill rows unchanged, the v5 relief part equal for twins).
- `docs/HANDBOOK.md`: Trail rating, relief row and the direction rule; Limits line.
- `ROADMAP.md`: D24 status.
- `Execution/P15/T1180-downhill-relief.md` (this report), `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`.

## Commands run

```bash
git fetch origin p15-round2 && git checkout -b p15-s96-downhill-relief origin/p15-round2
pip install -r requirements.txt pytest
python -m pytest tests/test_trail_climb_consistency.py tests/test_golden_ratings.py tests/test_rating_distribution.py tests/test_rating_inputs.py tests/test_rating_stability.py tests/test_trail_data_bugs.py tests/test_trail_difficulty_names.py tests/test_trail_summaries.py -q
ruff check --select E9,F63,F7,F82 pipeline/trails/rate.py tests/test_trail_climb_consistency.py
```

The band estimate was a scratch script (not committed, outside the brief's files). Per walk on the wire: old and new relief raw from `distance_m`, `ascent_m`, `descent_m`, `ele.min`, `ele.max`; each placed on the frozen relief knots of `reports/rating_reference_v5.json` (read only); the published v5 score inverted through the frozen ladder and score knots to its composite; the composite moved by `0.16 x` the change in the relief percentile; mapped back. The wire score is floored to 0.1, so each walk was run at both ends of its 0.1 interval: "certain" means both ends land in the same band. Inverting reproduced the published band for 503 of 503 walks.

## Config and secrets set

None. `reports/rating_reference_v5.json` read only, not refit.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Walks on the wire drawn downhill (uphill rule) whose relief reads the stored ascent | 503 | 0 (in code; on the wire after T1180-a) | -503 |
| Mount Korab 9 (63428) climb read by relief | 7 m | 1,423 m | +1,416 m |
| Relief of a downhill route minus its reversed twin (tests) | up to the whole climb term | 0 | |
| Downhill walks that move band (estimate) | | 265 up (253 certain), 0 down, 238 stay | |
| Walks entering the top band, exceptional or excellent (estimate) | 2,089 top band (T1179) | 37 enter (33 certain), 0 leave | +37 |
| Walks entering exceptional (estimate) | 680 | 692 | +12 |
| Mean v5 score change of the 503 (estimate) | | +0.61 (median +0.5, max +2.0, min 0.0) | |
| Walks whose relief changes that are not drawn downhill | | 0 (by construction: `uphill` returns the stored ascent for them) | 0 |
| Frozen calibration `rating_reference_v5.json` | v5.0-r3 | v5.0-r3, unchanged | none |
| Trail rating tests (8 files above) | 63 passed, 2 failed, 4 skipped | 67 passed, 2 failed, 4 skipped | +4 new tests |

Band moves (estimate, 265 walks):

| From | To | Walks |
|---|---|---|
| pleasant | good | 76 |
| below pleasant | pleasant | 63 |
| good | very good | 43 |
| very good | excellent | 33 |
| below pleasant | good | 23 |
| excellent | exceptional | 12 |
| pleasant | very good | 11 |
| good | excellent | 4 |

Band shares of all 17,743 v5 rated walks on the frozen knots (estimate): exceptional 3.83% to 3.90%, excellent 9.40% to 9.54%, very good 17.95% to 18.07%, good 24.64% to 24.93%, pleasant 24.56% to 24.42%, below pleasant 19.62% to 19.14%. The calibration is frozen, so these drift a little off the 3/9/18/25/25 design shares; that is the calibration being respected, not a fault, and no refit is proposed.

The 20 largest moves by score (estimate). Nearly all are short climbs to a hut or summit drawn from the top, which the old relief read as flat:

| # | Walk (id, country) | Stored up / down | km | v5 before | v5 after (estimate) | Band move |
|---|---|---|---|---|---|---|
| 1 | Paulahuette - Schaanwald (13252, LI) | 0 / 548 m | 5.0 | 4.6 | 6.6 | below pleasant to pleasant |
| 2 | Карлово - хижа Равнец (75505, BG) | 0 / 698 m | 3.5 | 4.4 | 6.4 | below pleasant to pleasant |
| 3 | Sentiero Rosso (192717, IT) | 0 / 649 m | 2.2 | 4.8 | 6.8 | below pleasant to pleasant (near a cut) |
| 4 | Magarevo - Jorgov Kamen (311074, MK) | 0 / 658 m | 3.5 | 4.6 | 6.6 | below pleasant to pleasant |
| 5 | Zwischenbergen - Passo di Monscera (9181, CH) | 0 / 807 m | 3.5 | 5.0 | 6.9 | below pleasant to good |
| 6 | Бистрица - Алеко (Янчовска река) (75211, BG) | 0 / 897 m | 6.9 | 5.0 | 6.9 | below pleasant to good |
| 7 | Rhyd Ddu Path (186736, GB) | 0 / 859 m | 5.8 | 5.0 | 6.9 | below pleasant to good |
| 8 | Rruga Padesh-Ujeze (310996, AL) | 0 / 656 m | 3.7 | 5.0 | 6.9 | below pleasant to good |
| 9 | Kaledonia Waterfall Trail (62652, CY) | 0 / 390 m | 3.0 | 4.9 | 6.8 | below pleasant to pleasant (near a cut) |
| 10 | Nikisiani Mavra Nera Trail (74549, GR) | 0 / 779 m | 3.7 | 4.3 | 6.2 | below pleasant to pleasant |
| 11 | Пирдоп - х. Паскал - в. Косица (75346, BG) | 0 / 1269 m | 7.4 | 4.7 | 6.6 | below pleasant to pleasant |
| 12 | Bergstation Sareis - Malbun (62367, LI) | 0 / 388 m | 2.6 | 5.2 | 7.0 | below pleasant to good |
| 13 | Марково - Калоянов връх (75496, BG) | 0 / 468 m | 3.3 | 5.2 | 7.0 | below pleasant to good |
| 14 | Janče - Galičnik (311081, MK) | 0 / 394 m | 2.5 | 5.1 | 6.9 | below pleasant to good |
| 15 | Пензионерска патека (311602, MK) | 0 / 338 m | 2.9 | 5.2 | 7.0 | below pleasant to good |
| 16 | Ljubunčić - Velika Golija (63949, BA) | 6 / 1092 m | 10.9 | 4.4 | 6.2 | below pleasant to pleasant |
| 17 | Към Гоцев връх (74121, BG) | 6 / 1232 m | 10.4 | 4.6 | 6.4 | below pleasant to pleasant |
| 18 | Εμπόριο - Υφαντής - Μουρίκι (75006, GR) | 6 / 1010 m | 6.7 | 4.4 | 6.2 | below pleasant to pleasant |
| 19 | Троянски манастир - скит Св. Никола - вр. Иван дял (75590, BG) | 0 / 552 m | 3.8 | 4.2 | 6.0 | below pleasant to pleasant |
| 20 | Ibish Muslia (310981, XK) | 0 / 767 m | 8.1 | 4.3 | 6.1 | below pleasant to pleasant |

Countries with the most walks moving up: BG 38, GR 31, HR 24, IT 21, LI 19, AT 13, AL 12, CH 11.

Not estimated: the older published `rating` (region percentile, which also sets the wire order) moves for these walks and, slightly, for their regional neighbours; and the v5 rank lines of walks in the same regions. Both are recomputed by the owner step.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `test_rating_inputs.py::test_beauty_v2_reads_no_register` and `test_rating_stability.py::test_adding_places_moves_nobody_else` fail in this container, before and after the change | They read place caches (`cache/dest_pageviews.json` and others) that are Git LFS pointers here; nothing to do with trails | None needed; unchanged by this task |
| The register says 488 downhill routes, the wire shows 503 | 488 was counted in the lab at T286; the wire of 2026-09-13 holds a slightly different set under the same rule | Both numbers recorded; the re-rate covers whatever the lab holds |
| `psycopg` and `osmium` missing, so `rate.py` would not import | Fresh container | `pip install -r requirements.txt` |

## Screens checked

None: no app change, and the wire is not rewritten in this task. After the owner re-rate, the trail page's score and band for the walks above change; that is data, not layout.

## What is still open

- T1180-a (user): re-rate on the box, the lab is not in the cloud container.
- T1180-b (user, after T1180-a): the top band gains about 37 walks, so T1179's summaries must be rerun. Not rerun here: summaries.py reads the wire, which only changes after the re-rate, so a rerun now would write the same 2,089. Goes with T1179-e.

## Owner steps (for the checklist)

On the box, with the trails lab up, from the repo root:

```bash
python run_pipeline.py --only trails_rate
```

```bash
python run_pipeline.py --only rating_v5_profile
```

```bash
python pipeline/nature_tiers.py --check
```

The check must print `wire matches frozen: True` for trails. It will print `remeasured breakpoints identical: False` for trails because the relief values moved; that is expected, and `--recalibrate` must not be run (the calibration is frozen). Expect about 265 downhill walks to move up and 37 to enter the top band; the 20 above are the ones to spot check on the wire (for example `continent-app/public/trails/LI.json` id 13252). Then rerun the summaries:

```bash
python pipeline/trails/summaries.py
```

```bash
python -m pytest tests/test_trail_summaries.py -q
```

and commit `data/trails/summaries.json` and `data/reports/trails_summaries.json` with the new wire.

## Rollback procedure

`git revert` the T1180 commits. The code change is two lines in `relief_raw`; no data, schema or calibration was written. If the owner has already re-rated, rerun the two pipeline steps above after the revert.
