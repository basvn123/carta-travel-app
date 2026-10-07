# T089: A5: tags, basecamps and snapshot, surfaced or stripped

## Task ID

T089 (mind-map number T085), branch `p5-a5-orphan-fields` in both repos.

## Date

2026-10-07

## What changed

The owner decided on 2026-10-07 (T362) that tags become filters you can scan, and that basecamps and snapshot leave the build unless a screen reads them. Each of the three fields is now either used or gone.

Tags are a filter. The Trips style list already had two toggle rows from T188, the length and the cost band. It now has a third, "Tags": an "Any tag" button and then the tags that are common in the open style, each with how many trips it would show. One tag at a time; pressing the pressed one clears it. The row composes with everything else. The rows of the list are the style's trips, narrowed by the tab's search and country filter, then by the tag, then by the cost band. A band chip counts the trips it would show with the tag applied, and a tag button counts the trips it would show with the band applied, so every count adds up to the list. "Clear filters" also releases the tag.

A trip has up to six free-form tags and the wire holds 1,035 distinct ones, so they cannot all be buttons. The vocabulary of a style is the tags written on at least three of its trips, twelve at most, most common first (`tagVocabulary` in `src/lib/tripTags.js`). It is read before the other filters, so the buttons do not come and go while someone searches. Hiking has five such tags: hut to hut (10 trips), alpine trekking (4), via ferrata (4), cross border (3), glacier views (3). The row is not drawn when a style has no tag that common, or when the wire carries no tags on its cards.

The cards need the tags, and until now they did not carry them (only the full trip file did). `to_card` in `pipeline/journeys/build_wire.py` now copies the first six tags onto each card, the same six the trip page shows. I chose not to print tags on the cards themselves: the facts line was already cut at three cards across when T188 added the total, and the chosen tag is shown by the pressed button above the list. The trip page already shows up to six tags under the hook and uses the first short one as the style cell of the suitability strip, so nothing was added there.

Basecamps stay. `weekBases` in `src/lib/weekShape.js` reads them to place nights, and the wire builder reads them to choose heroes, so the field is read twice and is not dead weight.

Snapshot is stripped. `build_wire.py` removes it from each trip's detail file. The reader search below found no reader of the wire's snapshot that changes anything, so nothing on screen changes. The wire files on disk only change when the owner rebuilds (register row T089-a).

## Who did what

A haiku session did the first pass in two root commits. The first, `5e319d97c`, stripped snapshot in `build_wire.py`. The second, `efafa8b02`, was a report that did not meet the bar: it read "tags as filters you can scan" as the existing tag list on the trip page, wrote no register rows, had no design answers, and gave a rollback that would have reverted the report instead of the code. This fix pass removed that report commit, rebuilt the branch on current `main` and kept the snapshot strip with the same one-line change in a new commit (`9533139e2`, because the branch had to be re-based on main after T188, T093 and T194 landed), then built the tag filter and wrote this report. The branch carries exactly one report commit.

## Reader search

Run from `wt\T089` over `wt\T089-app\src`, `wt\T089-app\scripts`, `pipeline` and `Trips`, in `.js`, `.jsx`, `.mjs` and `.py` files.

Snapshot: a grep for `.snapshot`, `'snapshot'` and `"snapshot"`. Every `.snapshot` hit in `src/` is `catalogue.snapshot()`, the catalogue store, an unrelated function. The one real reader of the wire's field is `continent-app/scripts/audit-content.mjs:808`, which adds the snapshot's numbers to the set that backs prose figures. I checked what stripping does to it by running the audit twice on copies of the 253 trip files, one with and one without snapshot (`node scripts/audit-content.mjs --layer journeys`, in `wt\T089-shots\aud-with` and `aud-without`): 609 findings both times, the same counts per failure mode. The other snapshot readers work on `trips.master.json`, not on the wire, where snapshot stays: `Trips/carta-unified/carta-unified/pipeline/normalize.py:229` and `:308`, `fill_type_specific.py:79`, `export_sql.py:356`, `expand_catalogue.py:168`.

Basecamps: `src/lib/weekShape.js:122` (`weekBases`, called at `src/browse/JourneyPage.jsx:468`), `pipeline/journeys/build_wire.py:277` and `:295` (hero search), and many readers in `Trips/.../pipeline` on the master (`geocode.py:99`, `normalize.py:297`, `export_sql.py:347`).

Tags: now read by `src/lib/tripTags.js` (new), `src/browse/JourneysSection.jsx` and `src/browse/TripFilters.jsx`, and already by `src/browse/JourneyPage.jsx:183` (the style cell of the strip) and `:766` (the list under the hook).

## Files touched

Root repo (commits `9533139e2` and `653607047`, plus the commit that carries this report).

Modified: `pipeline/journeys/build_wire.py` (snapshot dropped from the detail file; the first six tags added to the card), `Execution/_OPEN.md` (rows T089-a to T089-d).

Created: `Execution/P5/T089-a5-orphan-fields.md`.

App repo (commit `49e8031`).

Modified: `src/browse/JourneysSection.jsx`, `src/browse/TripFilters.jsx`, `src/styles.css` (one import line), `src/i18n/en.js`, `de.js`, `es.js`, `fr.js`, `it.js`, `nl.js` (two keys each, after `journey.fltClear`, added lines only).

Created: `src/lib/tripTags.js`, `src/styles/44-tags.css`, `tests/tripTags.test.mjs` (4 tests).

Deleted: none.

## Commands run

With `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` unset in every shell.

```
cd wt\T089      && git merge main
cd wt\T089-app  && git merge master
node --test tests/tripTags.test.mjs
npm run lint
npm test
node scripts/ci/design-lint.mjs
npm run build
node node_modules/vite/bin/vite.js preview --port 5214 --strictPort --host 127.0.0.1
node ..\T089-shots\shoot089.mjs
python -m pytest tests -q --ignore=tests/test_monitor_check.py -k "trip or journey"
rm -rf dist dist-data
```

The six catalogues were parsed again (`import('./src/i18n/<lang>.js')`) and all six loaded. The browser check ran on a build whose `dist/journeys/type/*.json` I patched with the tags read from the detail files, to stand in for the rebuilt wire; the tracked wire in `public/` was not touched. The preview server was stopped afterwards.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta | Source |
|---|---|---|---|---|
| Trips with tags | 223 of 253 | 223 of 253, now also on the cards | none | node over `public/journeys/journey/*.json` |
| Distinct tags | 1,035 | 1,035 (twelve at most offered per style) | none | same |
| Trips with a snapshot in the detail file | 253 | 0 once the wire is rebuilt | minus 253 | same (the task text said 153) |
| Size of the 253 detail files | 4,550,184 bytes | 4,458,899 bytes | minus 91,285 (2.0 percent) | node, the files with and without `snapshot` |
| Size of the ten type (card) files | 261,807 bytes | 266,318 bytes | plus 4,511 (1.7 percent) | node, tags added to the cards |
| Filters on the Trips style list | 2 | 3 | plus 1 | `shoot089.mjs` |

The detail files are fetched one at a time and the card files all at once when a style opens, so the saving lands on the trip page and the cost lands on the list. The list's cost is about a twentieth of the page's saving.

Browser checks, headless Chromium against `vite preview` at 380 and 1280 px on the Hiking style: 28 checks, all passing, no page errors, no horizontal scroll on the list or on a trip page. They cover the row drawn with six buttons, a tag showing exactly its count, the band counts summing to the tagged list, tag plus band narrowing, the search composing (zero cards for a nonsense query), "Clear filters" releasing the tag and restoring the list, and pressing a pressed tag clearing it. Screenshots are in `wt\T089-shots\` (`089-m380-list.png`, `089-m380-tag-band.png`, `089-m380-trip.png` and the `d1280` set).

Gates: `npm run lint` 0 errors (71 warnings, none in files this task touched); `npm test` 316 pass, 0 fail; `node scripts/ci/design-lint.mjs` 196 violations, 196 in the baseline, 0 new; `npm run build` passes. The journeys pipeline tests: `pytest tests -k "trip or journey"` gives 30 failed and 32 passed, and the same 30 fail on `main` without this task (checked by checking out the merge commit under the branch); see T089-d.

## carta-design answers

The seven questions at the end of the carta-design brief, answered for this change.

1. Does it use only locked tokens? Yes. The tag row reuses `.tl-btn` and `.tf-n` from T188 (`--ink`, `--rule`, `--ink-fill`, `--on-fill`, `--space-*`); the new `44-tags.css` has no colour of its own.
2. Is the type the house type? Yes. Tag words are in the UI face; only the count is in the mono face, as with the cost band.
3. Is the pressed state obvious? Yes. It is the same `--ink-fill` filled button, with `aria-pressed`, as the length and cost rows.
4. Does it work at 380 px? Yes. The buttons wrap onto lines, a long tag breaks inside its button instead of widening the page, and there is no horizontal scroll at 380 or 1280 (checked).
5. Are the touch targets large enough? Yes. `.tl-btn` is `--tap` high, and 32 px only for a fine pointer.
6. Is the copy plain and free of banned marks? Yes. "Tags", "Any tag" and their five translations; no em dashes, no middots; the tag words are the authored slugs with hyphens read as spaces.
7. Does it add decoration the brief forbids? No. There is no icon, colour, shadow or new card; it is a row inside the existing filter card.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The branch carried a merge of `main` made before the report commit was removed, so one soft reset would have undone the merge instead of the report | The merge was run first, as the prompt listed, with the report commit still under it | The branch was moved to current `main` with a soft reset, the report removed, and the one-line snapshot change re-applied as a new commit |
| First tag patch of the test build wrote nothing | The type files are `{slug, trips}`, not arrays | The patch script reads `.trips` |

## What is still open

The journeys wire has to be rebuilt on the main checkout before the snapshot strip and the card tags reach production; until then the tag row is not drawn (T089-a). Tags are English slugs in every language, and a controlled, translated vocabulary is a product decision (T089-b). The tags on the trip page are text, not links into the filter (T089-c). Thirty trip-pipeline tests fail on main already and one test file cannot be collected, so the pipeline change was proved by the browser run and not by them (T089-d).

## Rollback procedure

Nothing is applied to production data. In the app repo run `git revert 49e8031` (the filter, its keys, its stylesheet and its test). In the root repo run `git revert 653607047 9533139e2` (the card tags and the snapshot strip, newest first), then revert the report commit. A wire that was already rebuilt with the strip and the tags keeps them until it is rebuilt again from the reverted builder; the extra tags on cards are ignored by the reverted app, and the missing snapshot is read by nothing. The old haiku commits `5e319d97c` and `efafa8b02` are no longer on the branch.
