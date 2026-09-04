# The cross-layer join

Brief 08's lead: six wires keyed by coordinate and country that never spoke.
A mountain did not list the trails that climb it, a beach did not mention the
published coastal walk beside it, a trip through Austria did not link the
lakes near its bases. One spatial pass at export time closes that, and five
catalogues become one place for zero runtime cost.

## The pass

`pipeline/joins/neighbours.py`, registered as the `joins` task in
`run_pipeline.py` (cadence `after` any layer export, sitting BEFORE `regions`
in the task list so region pages are composed from stamped rows).

```
python pipeline/joins/neighbours.py                # every published country
python pipeline/joins/neighbours.py --countries SI,AT --verbose
python pipeline/joins/neighbours.py --dry-run      # count, write nothing
```

Per country it loads every layer's published wire (rated + listed), projects
everything to EPSG:3035, builds one STRtree per layer, and writes neighbour
ids into each row under **`nb`**:

```json
"nb": {"trail": ["65085"], "lake": ["si-lake-bled-Q648902"]}
```

The rule table (radius km, max ids) lives in `RULES` in the module and ships
to the wire as `public/joins.json` on every full run, with the model version
and per-country stamp counts. Ranking is rated-first (score desc), then
distance, then id, so listed rows only surface where nothing rated is close
and a warm rebuild is byte-identical.

Two deliberate deviations from the brief, both design rather than drift:

- **The key is `nb`, not `near`.** Mountain rated rows already ship `near`
  as the nearest trip-priceable hub (`{city, dest_id, km}`) and MountainPage
  reads it; reusing the name would have clobbered a live feature.
- **Point-layer joins are same-country only.** The app resolves ids against
  the country file it already has loaded; cross-border resolution needs an
  id-to-country map the wire does not carry yet. Trips are the exception:
  their neighbours are computed PER STOP against the stop's own iso2 and
  written into the trip detail file, because a trip already crosses borders.

Cycling tours get a whole-line `nb` on the tour row (the per-stage split is a
later refinement).

## The app side

`src/lib/neighbours.js` resolves a row's `nb` against the cached country
loads (never a geo query), and `src/browse/NearbyOutdoors.jsx` renders the
blocks. Each page opts into exactly the blocks its brief names by passing
heading keys:

| page | blocks |
|---|---|
| MountainPage | Trails up this mountain, Neighbouring summits, Lakes nearby |
| BeachPage | Walk the coast here, Other beaches on this stretch, Cycle routes past this beach |
| LakePage | Walk around it, Summits over the water |
| TrailPage | The summit on this walk, Lakes along the walk, Swim afterwards |
| CyclePage | Walks along the route, Summits on the way, Lakes you pass, Beaches you pass |

Navigation is `openNeighbour` in `DestinationsTab.jsx`: one page open at a
time, so Escape and the back cross keep one meaning. Headings are `nb.*`
i18n keys in all six catalogs; a row with no neighbours renders no block at
all, because an empty "nearby" section is a claim of emptiness the build
never made.

## Order in a full rebuild

```
layer exports (beaches, lakes, mountains, trails, cycling, trips)
  -> python pipeline/joins/neighbours.py        # stamps nb + joins.json
  -> python pipeline/regions/coverage.py        # audits the stamped wire
  -> python pipeline/regions/export_regions.py --all
  -> npm run build
  -> node scripts/verify_joins.mjs              # the contract below
```

Any layer re-export rewrites its files WITHOUT `nb`, so the joins pass must
run again after it. That is what the task's `after` cadence encodes.

## Running it unattended, and the two traps

A full rebuild is a day's wall clock, so it runs detached and finishes
itself. Three scripts, in order:

| script | job |
|---|---|
| `pipeline/cycling/run_all.ps1` | the cycling chain, stage by stage, resumable with `-From <stage>` |
| `pipeline/finish_run.ps1` | trails refresh, joins, coverage, region export, build, verify |
| `pipeline/watch_and_finish.ps1` | supervises a driver that predates the receipt, verifies the wire itself, then calls the finisher |

**Trap 1: never edit a driver while it runs.** On 2026-09-02 `run_all.ps1`
was edited at 20:37 during a full-Europe pass and the run died at 23:06, the
moment the current stage returned: the interpreter re-read the changed file
at the stage boundary and lost its place. Land cover for all 43 countries
survived because it lands in the database, but ten stages never ran. Both
drivers now copy themselves to `pipeline/logs/.snapshots/` and re-exec the
copy, so editing the repo file mid-run is harmless.

**Trap 2: an exit is not a completion.** That silent death also let the
finisher publish a cycling wire nothing had rebuilt, and report success.
`run_all.ps1` now writes `pipeline/logs/cycling_complete.txt` only after a
clean pass, and `finish_run.ps1` refuses to publish without a receipt newer
than its own start. `-Force` publishes anyway, deliberately, and says so in
the log.

Watch the PER-STAGE logs (`pipeline/logs/cycling_<stage>.log`), not the
summary: `cycling_all.log` is buffered and can sit hours behind the work.

## The contract (`scripts/verify_joins.mjs`)

- `joins.json` exists and names the model version and rule table
- every `nb` id resolves inside its own country's target layer file
- no `nb` list exceeds its rule's limit
- mountain rated rows keep their `near` hub link untouched
- a trip stop carrying `nb` carries the `iso2` that resolves it
