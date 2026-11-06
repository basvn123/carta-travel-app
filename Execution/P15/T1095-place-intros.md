# T1095: Grounded place intros for FR, RS and IT (D9)

## Date

2026-11-06

## What changed

The harvest, the checks and the merge for grounded Wikipedia and Wikivoyage intros now exist and are tested on fixtures; the real run needs the owner's network (Wikipedia and Wikivoyage are not reachable from the cloud box), so no dossier changed tonight. `pipeline/dossier/harvest_place_intros.py` picks the top 300 places of FR, RS and IT by Carta score (136 FR, 136 IT, all 28 RS), fetches each place's Wikivoyage and Wikipedia lead, and builds one intro from whole source sentences (Wikivoyage first, then non-duplicate Wikipedia sentences until 135 words, at most 230). No model writes anything, so the text is grounded by construction and `check_grounded` proves it. Each record keeps source title, URL, revision id, licence (CC BY-SA 4.0) and fetch date. Records are checked for length, English, boilerplate (disambiguation, stub, list, airport lead) and wrong-place matches (title, coordinates within 30 km, country in the lead); a failing record is stored as rejected with reasons and never merged. `build_dossier.compose_intro` uses an ok record when it is longer than the old body (which was cut at 700 characters, about 110 words, so it could not reach the bar alone), and the grounding list then names both sources.

Owner decision 1 stands: the bar is untouched (120 words, `PLACE_MIN_WORDS`). Short sources are not padded.

## Files touched

- Created: `pipeline/dossier/harvest_place_intros.py`, `tests/test_place_intros.py`, `tests/fixtures/place_intros/wikivoyage.json`, `tests/fixtures/place_intros/wikipedia.json`, `Execution/P15/T1095-targets.csv` (the 300 targets with their current words and group).
- Modified: `pipeline/dossier/build_dossier.py` (load `place_intros.json`, new `compose_intro` argument), `docs/HANDBOOK.md` (Destination page: intro body, limits), `ROADMAP.md` (D9 status), `Execution/_OPEN.md`.

## Commands run

- `python -m pytest tests/test_place_intros.py -q` (8 passed)
- `python pipeline/dossier/harvest_place_intros.py --fixtures tests/fixtures/place_intros --limit 3 --out <scratch>` (offline path works)
- `ruff check --select E9,F63,F7,F82` (the CI rule set) on the touched Python: clean.

## Config and secrets set

None. The harvest is keyless.

## Before/after measurements

Coverage from the shipped dossiers (`continent-app/public/dossier`, built 2026-10-30), word count as the prerender counts it (short + body unless the body repeats the short):

| Metric | FR | RS | IT |
|---|---|---|---|
| Places | 591 | 28 | 651 |
| With a Wikivoyage body | 157 (27%) | 8 (29%) | 202 (31%) |
| Intro of 120 words or more | 27 (5%) | 1 (4%) | 41 (6%) |

The top 300 (136 FR, 28 RS, 136 IT): 28 pass the bar today (FR 14, RS 1, IT 13); 112 have a short Wikivoyage lead; 160 have no body at all. By class they are 156 villages, 39 areas, 101 towns, cities and metros.

After: Not measured. The real run is T1095-a. Expected, as an estimate and not a measurement: the 28 stay; the 101 towns and cities likely reach the bar at about 80% (Wikipedia leads for towns run 100 to 250 words); villages about 35% and areas about 50%, which gives roughly 150 of 300 (range 130 to 190), half of them new. Evidence for the range: the 260 cached airport city leads (`city_intros.json`) have a median of 65 Wikivoyage words and 24% at 120 or more, so Wikivoyage alone is not enough and the Wikipedia lead has to carry it. The honest floor is 28. `--report` and the prerender manifest give the real number after the run.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `cache/wikivoyage.json`, `dest_articles.json` are LFS pointers here | LFS files not fetched in the container | Did not need them: the harvest reads names and scores from the shipped dossiers and fetches articles itself |
| Top 300 by score alone gave 183 IT, 116 FR, 1 RS | RS has only 28 places and low scores | Equal share per country, unused share handed on (`select_targets`, tested) |
| An airport mention in a city lead would have rejected good intros | Boilerplate regex included "airport" everywhere | Airport check only on the first 220 characters of the lead, as the existing city harvest does |

## Screens checked

None. No app code changed and no dossier was rebuilt. After T1095-b the Destination page intro (phone and desktop width) and the PDF credit line should be looked at.

## What is still open

See the register rows T1095-a to T1095-e: the real run, the rebuild and prerender count, breadth beyond the top 300, crediting both sources on the page and in the PDF, and the villages whose sources are too short.

## Rollback procedure

`git revert` of the T1095 commits. The merge only reads `cache/dossier/place_intros.json`; deleting that file and rebuilding restores the old bodies exactly.

## Owner steps (for the checklist)

- [T1095-a] Run the intro harvest | the Wikipedia and Wikivoyage APIs are not reachable from the cloud box | from the repo root run `python pipeline/dossier/harvest_place_intros.py` (about 300 places, 2 sources, 0.4 s pace, resumable, about 10 minutes); run `python pipeline/dossier/harvest_place_intros.py --report`; open `cache/dossier/place_intros.json` and read 10 rejected rows | pipeline/dossier/harvest_place_intros.py
- [T1095-b] Rebuild dossiers and count the bar | the merge happens in the dossier build | run `python pipeline/dossier/build_dossier.py --all` (or `python run_pipeline.py dossier`); run the prerender; compare `bar.intro` passes against the 28 before; look at one FR, one RS and one IT place page at phone and desktop width | pipeline/dossier/build_dossier.py
