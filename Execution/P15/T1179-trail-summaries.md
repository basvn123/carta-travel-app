# T1179: Trail summaries for the top band (D24)

ROADMAP item: D24 (Trail quality pack), the summaries bullet; D7's summaries line. Round 2 session S95 of `Execution/P15/_SESSIONS-ROUND-2.md`. Builds on T1092 (names, per-day difficulty), T1094 (recover walks) and T1102 (trail cards).

## Date

2026-11-06

## What changed

Every top-band walk now has a summary written only from its own facts. The new step `pipeline/trails/summaries.py` reads the shipped trail wire and writes `data/trails/summaries.json`: 2,089 summaries, one for every walk in v5 band exceptional or excellent, and none fails its checks. A summary is two to five sentences covering length, climb (read uphill, as the app reads it), walking time and days, shape, start and end, stage, highest point, ground, named sights in walking order, places it goes close to, and the snow-free season. Example (AT 20050): "Stage 15 of the BergeSeen Trail. A 16.4 km walk with 985 m of climbing, about 7 h 50 min of walking. It tops out at 1,544 m, with steep mountain paths in places. On the way: the lake Löckersee and the cave Wildfrauenloch. It passes below the peak Hohe Scheibe (1,659 m). Usually clear of snow from June to October." The text comes from templates, not a model: the facts read well in plain sentences, so Gemini was not needed, and the Claude API was never an option. Before a summary is written, `check()` tests it. It uses a closed vocabulary: each word must be a template word, a month, a unit, a figure the facts hold or a name the facts hold. It checks consistency: "loop" is said only when the row is a loop and its two ends sit within 100 m of each other in height, and the months must be the season's. And it applies the house rules: no dashes, no banned words or superlatives, 40 to 320 characters. Each summary also carries `parts`, a language-neutral form of the same clauses. Before this task, 116 of the 2,089 top-band rows had a `summary` on the wire, all of them the retired describe.py lead, and some of those leads contradict their own figures. The summaries are not on the wire yet. The app prints `summary` as English prose on the trail page and in the planner, so shipping it is a traveller-facing change with an i18n choice behind it (T1179-a). The 2,348 in ROADMAP D24 does not reproduce on this wire: the top band is 2,089 rows.

## Research

Templates or a model were compared on the real top band. Templates over the wire's fields read clearly for 2,089 of 2,089 rows, and every word can be traced back to a field, which a model's output cannot promise without a judge. Gemini on the pipeline key was not used. The Claude API was never an option (CLAUDE.md).

## Files touched

- Created: `pipeline/trails/summaries.py`, `tests/test_trail_summaries.py` (22 tests), `data/trails/summaries.json` (1.5 MB), `data/reports/trails_summaries.json`, this report.
- Modified: `docs/HANDBOOK.md` (new section "Trail summaries" and its contents line), `ROADMAP.md` (D24 status), `Execution/_OPEN.md` (rows T1179-a to T1179-f, appended).
- Not touched: the trail layer writer (`export_wire.py`), `docs/SCHEMA.md` and the contract pin, because no wire field was added. `scripts/quality/` was not touched either (S58 works there); the proposed rules are row T1179-c.

## Commands run

```
git fetch origin && git checkout -b p15-s95-trail-summaries origin/p15-round2
pip install pytest ruff==0.14.3 -r requirements.txt     # container only
python -I pipeline/trails/summaries.py                  # top band, writes the two files
python -I pipeline/trails/summaries.py --all --print 1  # every rated walk, writes nothing
python -m pytest tests/test_trail_summaries.py -q
python -m pytest tests -q <quarantine deselects>
ruff check --select E9,F63,F7,F82,F401,F841 pipeline/trails/summaries.py tests/test_trail_summaries.py
cd continent-app && npm ci && npm test
```

The trail lab and its cache are not in the cloud container, but this step does not need them: the wire (`continent-app/public/trails/`, tracked, wire of 2026-09-13) holds every fact the summaries use. So the full top band was run here, not just a sample.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Top-band walks (v5 exceptional or excellent) with a summary | 116 of 2,089 (wire, retired describe.py lead) | 2,089 of 2,089 (`data/trails/summaries.json`) | +1,973 |
| Top-band summaries that fail the fact-match and house-rule checks | not checked | 0 | |
| First run: summaries refused by the check | | 7 (the plurals "volcanos" and "monasterys", fixed) | |
| Rated walks with a summary that passes, `--all` dry run | 458 of 17,619 had a wire summary | 17,404 of 17,404 walks pass (the other 215 rows are city days and are skipped) | |
| Wire summaries with the banned word "easy" | 41 | 41 (still on the wire, T1179-f) | 0 |
| Summary length, top band | | 113 to 320 characters, median 237 | |
| Clauses present, top band | | lead 2,089, ground 2,087, sights 2,028, season 2,021, passes 326, stage 290 | |
| Python trail summary tests | 0 | 22 passing | +22 |
| App tests (`npm test`) | | 1,571 tests: 1,559 pass, 0 fail, 12 skipped | |
| Python suite (quarantine deselected) | | 529 pass, 2 fail (`test_rating_inputs`, `test_rating_stability`: LFS cache absent in this container, as in T1092 and T1094) | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| 7 summaries refused on the first full run | Plurals built by adding an "s" ("volcanos", "monasterys") are not in the template vocabulary | Added both to `PLURAL`. The check did its job: it refused the row instead of writing it |
| The roundtrip tag said "loop" on AT 20050, whose ends are 262 m apart in height | The OSM tag and the geometry disagree | A loop or an out and back walk is claimed only when the start and end heights agree within 100 m. Otherwise the summary says "walk" |
| A peak 115 m above the route's highest point read as a sight on the way | Highlights are matched near the line, not on it | A peak more than 30 m above the top is told as "It passes below the peak ..." |
| "the lighthouse Gale Warning Burgau Iso Y 2s" | Lake navigation lights are tagged as lighthouses | A sight name with a digit is refused |
| The dash regex held literal dash characters after an edit | The file was rewritten on disk with the escapes expanded | Escapes restored; `test_module_has_no_dashes` guards it |
| 2 Python failures outside this task | LFS JSON not pulled in this container | Not touched (known since T1092) |

Gotcha: the app's `looksTemplated()` does not match the old lead "Based on its distance and ascent" (its pattern needs "based on the distance"), so those leads can print as prose on the trail page. That is row T1179-f.

## Screens checked

None. No app code or wire data changed, so a traveller sees nothing new until T1179-a is decided and T1179-b ships it. The check after that: the trail page and the planner day rail, at phone and desktop width, for AT 20050 and ES 179475 (a one-way walk "from Vic to Olot").

## What is still open

- T1179-a (user): choose how summaries ship, either the English `summary` key on the wire or `parts` rendered through t() in six languages.
- T1179-b (next task): a `trails_summaries` task in `run_pipeline.py`, the export of the chosen form, and the browser check.
- T1179-c (next task): propose the checks as D2 rules for `scripts/quality/` (S58).
- T1179-d (next task): sight kinds come from OSM tags and are sometimes wrong (a fountain read as a lake). This belongs in the D23 texts validation (S112).
- T1179-e (user): rerun the step after the trails rebuild and commit the output.
- T1179-f (next task): 458 retired describe.py leads are still on the wire, 41 of them with "easy".

## Rollback procedure

`git revert` the T1179 commit. Nothing is one-way: no wire file, migration or live data was changed.

## Owner steps (for the checklist)

- [T1179-a] Choose how trail summaries reach travellers | 2,089 checked summaries exist in data/trails/summaries.json but are not on the wire; the app prints `summary` as English prose in every language | pick one: (1) ship the English text as `summary` (fast, English only), or (2) a next task renders `parts` through t() in en, nl, de, fr, es and it (six languages, more work); tell the next session which | Execution/P15/T1179-trail-summaries.md
- [T1179-e] Rerun the summaries after the trails rebuild | the top band, names and grades move when T1092-a and T1094-a run, and the committed file then goes stale | on the box after `trails_rate` and the v5 pass: `python pipeline/trails/summaries.py`, then `python -m pytest tests/test_trail_summaries.py -q`, then commit data/trails/summaries.json and data/reports/trails_summaries.json | Execution/P15/T1179-trail-summaries.md
