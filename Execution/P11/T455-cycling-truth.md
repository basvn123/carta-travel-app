# T455: What a cycling card may claim

## Task ID

T455

## Date

2026-10-15

## What changed

The T451 fact check found four ways the cycling layer said more than it knew (row T451-e). The owner asked for the pipeline fix. A read-only investigation traced all four to one cause: the unit of data is one OSM relation, and every long named route is stored as several relations that are never joined. The rebuild needs the trailslab database and the harvest caches, and neither is on this machine (row T297-a).

So the rules live in one new module, `pipeline/cycling/wire_truth.py`, used twice:
- `export_cycling.py` calls it at the next rebuild;
- `repair_cycling_wire.py` applies it to the published wire now.

**1. Names.**
- Bracketed refs go wherever they stand: "Elberadweg rechtselbisch [Abschnitt E]" becomes "Elberadweg rechtselbisch"; "Unterwegs in Mützenich [66]" loses its "[66]".
- Arrows and spaced dashes become commas, the house way: "D1: Koper -> Sečovlje" becomes "D1: Koper, Sečovlje".
- A name that is only a ref becomes empty. The app then writes "Regional route 75" in the reader's language.
- A tour titled "75" is now "Glasgow, Edinburgh", its first and last towns.
- 4,329 route names changed and 23 became empty.

**2. A stretch says it is a stretch.** A route is marked `sec` when:
- its name shows a section ("Teil 7", "part Austria leg 1", "[Abschnitt E]"); or
- it shares its country and national or international ref with another route; or
- it shares its name stem with another route.

1,956 routes are marked, among them both Aare-Route rows (43 and 59 km of a route of about 300 km) and the three Elberadweg sections. The card says "A stretch of a longer route" in place of its reason. The "Top-rated routes" rail puts whole routes first and lets a stretch only fill in.

**3. EuroVelo, without numbers we cannot stand behind.**
- The list showed "EV2, 2,147 km, 3 countries" for a route of about 5,500 km through seven: that was the sum of the sections Carta holds.
- The chip now shows the route's official name ("Capitals Route", "Iron Curtain Trail"), and the family page's subtitle does too.
- The total length and country count are gone from the index. The section list on the family page, which is ours and true, stays.
- The official lengths are not added. They change as routes are re-signed, and a figure from memory would be a new error.

**4. Pace.**
- A tour's pace label is set from the distance it actually rides a day: under 65 km relaxed, under 95 balanced, above that strong.
- "Chilterns Cycleway, Strong, 95 to 130 km a day" over 91 km a day is now Balanced. RAVeL W4 is now Relaxed.
- One tour per route and length: the second RAVeL W4 is dropped from the lists. Its file stays, so an old link still opens.

## Files touched

**Pipeline (root):**
- `pipeline/cycling/wire_truth.py` (new)
- `pipeline/cycling/repair_cycling_wire.py` (new)
- `pipeline/cycling/export_cycling.py`: names through `clean_route_name`, from/to joined by a comma, `tour_title` with the towns fallback, sections marked and tours deduped per country file, pace from the ride, EuroVelo name in the family files and index (no index km).

**Data (app, gitignored, ships with the R2 data push):** `continent-app/public/cycling/`, repaired in place:
- the country files, `top.json` and `index.json`;
- the route and tour files;
- the family files.

A pre-repair copy was kept in the session scratchpad.

**App (mirrored in root):**
- `src/lib/cardFillings.js`: the stretch label.
- `src/lib/openingScreen.js`: whole routes before stretches in a best-of rail.
- `src/browse/DestinationsTab.jsx`: EuroVelo chip shows the name; unused imports removed.
- `src/browse/CyclePage.jsx`: family subtitle is the name; unused imports removed.
- `src/i18n/{en,de,nl,fr,es,it}.js`: `cycle.stretch`.

**Created (root):** this report, `Execution/P11/T455-shots/`.

## Commands run

```
python pipeline/cycling/repair_cycling_wire.py --dry-run
python pipeline/cycling/repair_cycling_wire.py
python pipeline/cycling/repair_cycling_wire.py --dry-run     (renamed 0, relabelled 0, dropped 0: idempotent)
python -m py_compile pipeline/cycling/export_cycling.py
npx vite build && npx vite preview --port 5298 --strictPort
CARTA_PORT=5298 node scripts/verify_{cycling,destinations,places_tab}.mjs
npm test && node scripts/ci/design-lint.mjs && node scripts/ci/banned-terms.mjs
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Route names carrying bracketed refs, arrows or spaced dashes | 4,329 | 0 |
| Names that were only a ref | 23 | 0 (the app composes "Regional route N") |
| Routes marked as a stretch of a longer route | 0 | 1,956 |
| EuroVelo entries showing our coverage as the route's length | 17 | 0 |
| Tours whose pace label contradicts their own ride | 2 | 0 |
| Duplicate tours in the lists | 1 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A second run would have unmarked stretches | The repair cleans the very words ("[Abschnitt E]") that mark them | A mark once set stays |
| "A stretch of a longer route, A national signed route" | Two sentences joined with a comma | A stretch row shows the stretch label alone. The screenshot predates this fix. |
| The T454 report calls the mountain wire gitignored | True of the app repo only; the root repo tracks `continent-app/public/cycling` and `public/mountains` as its data record | The repaired cycling wire is in this task's root commit; the repaired mountain wire (30 files) is committed on its own right after this task, as T454's data |

## Checks

| Check | Result |
|---|---|
| verify_cycling | 76/78. The same two data checks failed before this task (a repeated country count; no Scottish five-day tour). |
| verify_destinations 86/86, verify_places_tab | pass |
| npm test | 375/375 |
| design-lint, banned terms | 0 new, none |

## What is still open

- **T455-a (user).** The repaired cycling wire reaches production only with the R2 data push, with T453-a and T454-a.
- **T455-b.** True merging of a route's sections into one card (one "Aare-Route", about 300 km) needs the superroute and parent-relation membership from OSM, which means a harvest run (Geofabrik or Overpass, plus the trailslab database). Until then each stretch is labelled.
- **T455-c.** The section mark by shared name stem can mark two different local routes that share a generic name. It errs toward saying "a stretch", the safer claim.

Row T451-e is closed by this task.

## Rollback procedure

- **Pipeline and app:** revert the T455 commits in both repos.
- **Wire:** restore `continent-app/public/cycling/` from the pre-repair copy, or pull it from R2, which holds the pre-T455 wire until T455-a runs.
