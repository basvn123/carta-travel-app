# T151 D3: Fill the type-specific data sheet, one trip type at a time

## Task ID

T151 (mind-map number T153).

## Date

2026-10-03

## What changed

The three numeric slots of `typeSpecific`, `distanceKm`, `elevationM` and `verticalM`, are now filled from the words the master already holds, under one stated rule per trip type. Before this task they were filled at ingest by taking the first number found under a matching key, and that grabbed the wrong thing in 16 places. A ski trip with a distance of 1,050 km was Engelberg's base altitude, 1,035 was Chamonix's, a water-sports trip with 25 km was the depth of a lake and one with 3 km was the length of a beach. Two trail-running trips held a vertical of 1 because the key "Named routes, distance and vertical" begins with "(1)". Fourteen of those distances are now null, the two verticals are corrected, and one more value (a cozy-towns driving figure) no longer fits its slot, which is why some counts fall.

The work is one new script, `Trips/carta-unified/carta-unified/pipeline/fill_type_specific.py`. It reads `data/trips.master.json`, derives the three slots for every trip, writes them back into the master and the single files in `data/trips/`, and writes `data/type_specific_basis.json`. The basis file says, for every filled figure, where it came from (basis `key`, `stated`, `summed`, `derived` or `mentioned`) and the exact words. Nothing is invented and nothing is fetched. When the text does not state a figure and the day lines cannot be added up into it, the slot stays null.

The rule has three parts. First, a structured raw key (`total_distance_km`, `max_elevation_m`, `weekly_vertical_m`, `vertical_drop_m`, `nordic_network_km`) is trusted as it stands; this is 26 figures. Second, the one headline sentence each source wrote about distance and terrain is read with patterns that need a unit and the right mode beside the figure: "N km" for the route types, "N km on foot" for a city, "N km walked" for cozy towns, "N km piste" for a ski area, "N nautical miles of sailing" for water sports. Third, for cycling, trail running, hiking, road trips and city trips, the week's figure is the sum of the day lines when the headline gives none, and the sum wins when a headline figure is under half of it, which catches headlines that open with one day's km ("Day 1 ... 40 km"). A range gives its low end, because that is what the ingest used for the 114 figures that were right, so those stay unchanged, and because it never overstates a week. The basis file keeps the full words so the range can be read back.

What each slot means depends on the type, and that table now lives in `schema/SCHEMA.md` under "The three numeric slots". In short, distance is the km of the mode the trip is built around (ridden, run, walked, driven, sailed; for winter sports the marked piste or groomed Nordic km of the main area), elevation is the highest point the week reaches, and vertical is cumulative ascent (for winter sports the vertical drop of the main area). A type never gets a slot that makes no sense for it, so there is no elevation for a city and no vertical for a road trip.

Two bases are weaker than the rest and the basis file says so. `derived` (4 figures) is a winter-sports vertical worked out as the top minus the base from one sentence. `mentioned` (21 figures, all elevation) is the highest summit or pass height named in a day line with a cue word beside it: a name with its height in brackets, or "summit", "pass", "col", "top", "saddle". It can understate the week's true high point, so a chart that needs the real maximum should prefer `key` and `stated`. I tried a looser version that accepted "at 860 m" and a bare "1,100 m". It put Innsbruck's Nordkette run at 860 m (a bail-out station) and a 700 m gondola gain in as a summit, so it was removed. I also tried reading the ski area's altitude band from day lines ("Kopaonik 1,060 to 2,017 m"). It was right for four resorts and wrong for four others (a pass list, a Sellaronda route, a glacier line), and a rule that cannot tell the two apart was dropped. Those winter trips stay null.

Schema paths added: none. `typeSpecific.distanceKm`, `elevationM` and `verticalM` already exist in `schema/trip.generated.schema.json` as integer or null with bounds 3000, 30000 and 60000, and the generator's pass three already asks for all three. The generator and the schema were not touched, because sessions T146 and T150 edit them this wave. The one thing a generated trip does not yet get is the per-type meaning of each slot. That belongs in the pass-three prompt and is a register row.

## Files touched

Root repo, branch p9-d3-data-sheet. App repo: nothing changed, because the page reads none of these three slots yet (P10 does), so no app commit was made.

**Created:**
- Trips/carta-unified/carta-unified/pipeline/fill_type_specific.py
- Trips/carta-unified/carta-unified/data/type_specific_basis.json
- tests/test_fill_type_specific.py
- Execution/P9/T151-type-specific-fields.md

**Modified:**
- Trips/carta-unified/carta-unified/data/trips.master.json (typeSpecific numerics only)
- Trips/carta-unified/carta-unified/data/trips/*.json, 140 of the 253 files (typeSpecific numerics only; the diff is 194 lines added and 194 removed, every one a `distanceKm`, `elevationM` or `verticalM` line)
- Trips/carta-unified/carta-unified/schema/SCHEMA.md (a table of what each slot means per type)
- Execution/_OPEN.md

## Commands run

From `Trips/carta-unified/carta-unified` in the root worktree:

```
python -X utf8 pipeline/fill_type_specific.py self-test
python -X utf8 pipeline/fill_type_specific.py report
python -X utf8 pipeline/fill_type_specific.py apply
python -X utf8 pipeline/fill_type_specific.py check
python -X utf8 pipeline/validate.py --report <scratch>/v_after.md --json <scratch>/v_after.json
python -X utf8 pipeline/generation_gate.py self-test
```

From the root worktree:

```
python -X utf8 -m pytest tests/test_fill_type_specific.py tests/test_generate_trip.py -q
```

`apply` is idempotent, and `check` exits 1 if the master, the single files or the basis file differ from a fresh derivation, so a hand edit of any of them is caught. `build.py` cannot rebuild the master on this machine because the raw batches are not here, so the script patches the master in place instead. Files keep their CRLF line endings and the 2-space JSON layout, which I confirmed by round-tripping the untouched master byte for byte before writing.

## Config and secrets set

None. No network call, no Gemini call, no new dependency.

## Before/after measurements

Counts of trips with the slot filled, from `data/trips.master.json` at HEAD (before) and after `apply`. Every count is reproducible with `fill_type_specific.py report`.

| Type (trips) | distanceKm | elevationM | verticalM |
|---|---|---|---|
| Cycling (26) | 13 to 26 | 3 to 7 | 0 to 23 |
| Trail running (25) | 10 to 25 | 0 to 1 | 5 to 25 |
| City (26) | 10 to 18 | 0 to 0 | 0 to 2 |
| Cozy towns (26) | 10 to 9 | 0 to 0 | 0 to 0 |
| Road trips (26) | 16 to 26 | 0 to 12 | 0 to 0 |
| Hiking (24) | 12 to 24 | 3 to 9 | 1 to 19 |
| Culinary (26) | 10 to 10 | 0 to 0 | 0 to 0 |
| Winter sports (24) | 13 to 7 | 2 to 11 | 3 to 8 |
| Nature escapes (26) | 10 to 10 | 0 to 3 | 0 to 7 |
| Water sports (24) | 10 to 3 | 0 to 0 | 0 to 0 |
| All 253 | 114 to 158 | 8 to 43 | 9 to 84 |

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips with at least one numeric slot | 120 | 169 | +49 |
| Styles with at least one numeric slot | 10 | 10 | none lost |
| Wrong figures held (a base altitude, a depth, a count or a transfer read as km, or a vertical of 1) | 16 | 0 | removed or corrected |
| Figures by basis | not recorded | key 26, stated 145, summed 89, derived 4, mentioned 21 | new, 285 in all |
| validate.py errors, warnings, notices (no wire, no gazetteer) | 2, 492, 30 | 2, 492, 30 | 0 |

The 16 wrong figures are 7 winter-sports distances that were altitudes (Hautes Fagnes, Engelberg, Verbier, Krkonose, Garmisch, Chamonix, Malbun), 7 water-sports distances that were depths, beach lengths, a 12 nautical mile gap or a 230 km transfer drive, and 2 verticals of 1. One more cozy-towns value, Dordogne's driving 200 km, is also null now because the type's distance is the walked km and the source states none. Eight further values changed meaning without being wrong: six cozy-towns distances went from the rail or driving km to the walked km, because the type is about walking and the walked figure is what the headline states for nine of them; Les 3 Vallees went from 3 (the word) to 600 km of piste; Monaco's sailing week went from 70 (nautical miles) to 130 km.

Where a stated week total and the summed day lines both exist, they agree within a factor of 1.4 for all but four trips. Berliner Hohenweg and Stubai Hohenweg state 55 and 60 km but their day lines add up to about 1.5 times that. Donauradweg states 1,100 m of climbing and its days add to 1.55 times that. Berner Oberland states 5,800 m and its days add to 0.61 times that. The stated figure is kept in each case, and the disagreement is a source inconsistency this task cannot settle.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Regex word boundaries became backspace characters or a bare letter b three times | A shell heredoc and sed both treat `\b` as an escape | Wrote each patch as a script file and, after each, scanned the module for character 8 and for a letter b after a letter and before a bracket; the module now holds neither |
| A first draft used midpoints for ranges and rewrote 80 values that were already right | The old ingest used the low end | Switched to the low end; the previously populated values that change fell from 80 to 25 |
| A loose elevation rule turned bail-out stations and gondola gains into summits | "at N m" and a bare "N m" are not altitude cues | Only a name with its height in brackets or a high-point word counts; the weaker figures are tagged `mentioned` |
| A loose ski-band rule gave four resorts a wrong top and vertical | A day line with a range of metres can be a resort band, a pass list or a route | Removed; those trips stay null |
| Two headlines opened with one day's distance | "Day 1 ... 40 km" read as the week | When the day lines add to more than twice the headline figure, the sum is used |

## What is still open

The numerics reach a traveller only after the journey wire is rebuilt, because `build_wire.py` copies the whole record into each journey file. That rebuild is the owner's T085-a step and is not done here (T151-a). The Supabase seed `20260902000002_carta_seed.sql` holds `type_specific` as jsonb and still has the old values. Regenerating it with `export_sql.py` is the same job as T090-b (T151-b).

84 of 253 trips still have no numeric at all, because their source never states one. The newer batches carry no distance headline, and city, cozy, culinary, nature and water trips only sometimes have a day line with a distance. Those need the fill-mode pass of T149 against a source, not a rule (T151-c). The pass-three prompt `k2-numbers.md` does not yet tell the model what each slot means per type, so a generated trip could put a base altitude in `elevationM`. The meaning table is in SCHEMA.md now, and the prompt belongs to T146 or T150 (T151-d). `normalize.py` still has the loose needles that caused the wrong figures (`vertical`, `hut`, and `_first_number`). A rebuild from raw would bring them back unless `fill_type_specific.py apply` runs after `build.py` (T151-e). `validate.py` has no check that these slots are integers within bounds. `fill_type_specific.py check` does that today, and moving it into the validator is a later task's (T151-f). Four trips disagree between their stated week total and their day lines (see the measurements), and the source needs a human look (T151-g). A chart that wants a trustworthy maximum for elevation should skip basis `mentioned`, which only the basis file records, and carrying the basis onto the wire is a P10 decision (T151-h).

## Rollback procedure

Revert the task commit on p9-d3-data-sheet in the root repo, or drop the branch before merge. That restores the master, the 140 single files and SCHEMA.md and removes the script, the basis file and the test. No migration, wire, dependency or app file changed, so nothing else needs undoing. To redo, run `fill_type_specific.py apply` from the dataset folder. The data change is reversible because every changed line is a typeSpecific numeric and the old values are in git.
