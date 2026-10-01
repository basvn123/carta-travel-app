# T107 Apply the title ladder across all five sections

## Task ID

T107 (mind-map number T103).

## Date

2026-10-01

## What changed

Trail titles used to be the relation's name tag copied as is. On the published wire that meant 1,925 of 17,619 titles ran past 42 characters, 621 were route codes such as "LK 08", and 29 carried tag syntax or an ingest placeholder. names.py now has title_ladder(), a pure function that walks five rungs in a fixed order and returns the title, the rung that produced it, the ref chip string and the original string. The rungs are a stored Wikidata label, a real source name (name:en, then a Latin-script name, then any name), the from and to tags, a landmark formula from the best named feature the line touches, and shape plus place. The first rung whose candidate survives the cap and is not a code wins. The cap is 42 characters on a word boundary with no ellipsis, because the full string moves to the chip. Each candidate is judged after the cap, so a 60-character name that caps down to its own waymark symbol falls through to the next rung. Region never enters a title.

attributes.py calls it from derive() and writes the title in the same UPDATE as the grade and route type. It reads the tags, never the stored title, so a re-run lands on the same answer. The string the title replaced rides in waymark_ref, which is already the mono chip the app shows, unless the tags hold a real signpost ref. The original always stays in raw_tags. The change is code only. No data was written, so the published titles stay as they are until attributes.py next runs on the box.

src/lib/trailStory.js needed no change. It reads the title only as a plain name in its sentences and has no title length or code handling of its own.

## Files touched

Modified:
- pipeline/trails/names.py (title_ladder and its helpers)
- pipeline/trails/attributes.py (title_of, UPDATE_SQL, derive, run summary)

Created:
- tests/test_trail_titles.py (27 tests)
- Execution/P7/T107-title-ladder.md

Register: Execution/_OPEN.md, rows T107-a to T107-c appended.

## Commands run

python -m pytest tests/test_trail_titles.py -q, which gives 27 passed. The measurement is a read-only script that loads continent-app/public/trails/*.json from the main checkout and runs title_ladder over every trip with its wire name, route type and ref.

## Config and secrets set

None.

## Before/after measurements

Measured on the 17,619 trips in the 46 published country files. The wire carries no raw tags, features or anchors, so the after column is a lower bound on quality: it uses only the name, ref, route type and distance, which means rungs 3 and 4 never fire here and the 650 rows that fall to shape plus place may get a better title on the box.

| Metric | Before | After | Delta |
|---|---|---|---|
| Titles over 42 characters | 1,925 | 0 | -1,925 |
| Titles that are a route code | 621 | 0 | -621 |
| Titles with tag syntax or placeholder | 29 | 0 | -29 |
| Rows by winning rung | not applicable | 16,969 name, 650 shape | |

## What broke and how it was fixed

No issues in this session. An earlier session was cut off by a usage limit after committing the code; the worktrees were clean and the tests passed on resume.

## What is still open

The new titles reach users only when attributes.py runs on the real trailslab, followed by the export and wire build. That is a data write and was out of scope here (T107-a). The wikidata_label argument has no source column yet, so rung 1 never fires in production (T107-b). The after figures above are from the wire, not from a full run with tags, features and anchors, so the rung mix should be re-read from the "title rung" line the next attributes.py run prints (T107-c).

## Rollback procedure

git revert 4ee7659ef and the report commit on main. Nothing was written to data, so there is nothing else to undo. If attributes.py has already been run with this code, re-run the previous version to restore titles from the ingest, since the stored title is overwritten.
