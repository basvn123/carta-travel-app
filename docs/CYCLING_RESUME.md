# Cycling layer: what is published, and what the next session picks up

Written 2026-08-30, updated 2026-08-31. Read `docs/CYCLING.md` first for how the layer works; this
is the state of the build and the ordered list of what is left.

---

## Status

**43 countries harvested, one published.** The catalogue is 65,375 routes
across 43 of 44 countries, all spliced, all with regions, surface and safety
measured. Great Britain is the only country through the full chain and
published: 98 rated, 613 listed, one tour passing all ten hard checks, 879
photographs.

`node scripts/verify_cycling.mjs` passes **16 of 20** on the wire pass and
26 of 30 with the DOM pass. The four failures are the Scotland clauses of the
acceptance test and are explained with measurements in section 4.

A full-Europe pass is mid-flight. What it still owes: land cover for 41
countries, services, elevation, scenic, photos, and then rate, tours, validate
and export for everything that is not GB.

---

## The disk, and the two things that are not what they look like

This is the constraint the layer now has to be built around, and both halves
of it are counter-intuitive.

**C: is 100% full at about 2.4 GB free**, and most of that was this layer's
fault. `cycle_landcover` stored full-resolution OSM polygons in two
projections and reached **14 GB across 34 countries**, two thirds of the whole
lab, to answer a question whose tolerance is 500 m. It is now stored simplified
to 50 m in EPSG:3035 only, which measured at 0.44 kB per row against 14 kB
before, a **32x reduction**: Andorra and Albania together are 40 MB, so all of
Europe should land near 860 MB.

**Freeing it did not give Windows anything back.** The database went from 21 GB
to 7.35 GB and C: did not move, because `docker_data.vhdx` grows on demand and
never shrinks. `docker exec trailslab-db df -h /var/lib/postgresql/data` shows
11 GB used inside a 27.9 GB file.

That distinction decides what can still run:

- **Database writes are free.** There is about 17 GB of slack inside the vhdx
  that Postgres reuses without the Windows file growing. Land cover, services,
  scenic, rating, tours: all safe at 2 GB host free.
- **Host writes are not.** DEM tiles, extracts and the exported wire land on
  C:. `DEM_EVICT_GB` is therefore 1, not the 4 the trails task uses. Raise it
  the moment the disk is not binding.

**Reclaiming the 14 GB needs a vhdx compaction** with Docker and WSL shut
down, which kills every other session's in-flight work. Left for a human.

**Two traps for whoever goes looking for space.** `data/raw/geofabrik` holds
three dated snapshots totalling 29.1 GB and they are NOT overlapping copies:
austria, norway, switzerland and france exist only in the two older folders,
so deleting them to reclaim 7 GB deletes the only copy and costs a 4.7 GB
re-download. Verified independently by two sessions. And `data/raw/dem`
(23 GB) is the trails layer's cache, not ours to delete.

---

## The lab episode, and the one line worth keeping

The lab was unreachable for about forty minutes and four sessions on this
machine chased the wrong cause:

> On this box a wedged trailslab presents as connections **timing out** while
> port 5433 stays **open**. The open port is the Docker proxy on the host and
> says nothing about the VM behind it. A Postgres that is merely busy, or out
> of shared memory, REFUSES or errors. **Timeout means the VM. Refusal means
> the database.**

The decisive test: with host free RAM at 4,126 MB, up from 169 MB after another
session's 4 GB Geofabrik scan ended, the lab still timed out after 60.2 s. Host
memory contention was never the constraint.

**The fix was `wsl --shutdown` then Docker Desktop, then
`docker compose up -d`**, performed by the trails session after killing its own
writer first so nothing could write into a half-started server. The engine
answered in 10 seconds, and `vmmemWSL` went from 655 MB to 1,619 MB.

Two things for a human to consider, neither done here:

- There is **no `.wslconfig`** on this machine. One with an explicit memory
  reservation for the WSL2 VM would stop this recurring.
- **Docker Desktop is a per-user install** under
  `AppData/Local/Programs/DockerDesktop`; there is no `C:/Program Files/Docker`
  at all. Several notes in this project point at Program Files.
  `(Get-Command docker).Source` is the reliable lookup.

---

## What is in the lab

Volumes, so all of it survives a Docker restart.

| table | rows | state |
|---|---|---|
| `cycle_routes` | ~62,500 across 25 countries | harvested, with `way_spans` |
| `cycle_services` | 11,567 (GB) | service towns, `geom_3035` indexed |
| `cycle_protected` | 29,479 | Natura 2000 26,947 + Emerald 2,532, projected |
| `region_coast` | 2,666 | EEA coastline mirrored |
| `cycle_nodes` / `cycle_node_edges` | 11,058 / 14,498 | NL and BE junction graph |
| `cycle_repairs` | 389 | spliced GB geometry |
| `bike_rail` | 69 | curated operator policies, 37 countries |
| `cycle_tours` | 4 (GB) | 1 passing all ten checks |

Great Britain is fully enriched: regions, elevation (1,941 routes, all `ok`),
surface, safety, services attached, cross-layer `near`, and scenic with all
five components measured.

---

## Measured rates, for anyone estimating

Not extrapolated. Every figure here came off a run on this machine, under
normal contention from the other sessions:

| stage | rate | note |
|---|---|---|
| land cover, small countries | ~685 s per GB of extract | AD 9 s, AL 30 s, EE 98 s |
| land cover, large countries | ~1,624 s per GB | GB 2.16 GB took 58 min. **Superlinear**, so do not scale from the small ones |
| scenic, with land cover | ~38 routes/min | GB: 500 of 1,941 in 13 min. About 14 h for Europe's 32,264 |
| photos | 12.6 s/route | Commons-paced. 20,676 eligible is ~72 h, which is why they are held |
| services | ~200 s per GB + attach | GB scan 426 s, attach 52 s for 1,941 routes |
| elevation | ~4.6 routes/s | plus DEM fetches, bounded at 4 GB per run |

The two that matter for planning: land cover is superlinear in extract size,
and scenic is the long pole once land cover exists.

## What is left, in order

### 0. Restart the passes, because they do not survive a session ending

**Both long passes die when the Claude session that launched them exits**, and
this has happened twice: once losing about eight hours of wall clock, once
losing an hour. Nothing committed is lost, because both stages are resumable,
but nothing runs either. First thing on picking this up:

```bash
# the lab first: Docker Desktop can be up while its engine is not
docker ps --format '{{.Names}} {{.Status}}'      # want: trailslab-db ... healthy
cd tools/trailslab && docker compose up -d       # if it is not

bash pipeline/cycling/run_all.sh &               # main pass, resumable
bash pipeline/cycling/_landcover_big.sh &        # deferred countries, guarded
```

Order matters only in that the queue's guard waits for the main pass, not the
reverse. Starting the queue first lets it take a country during `splice`,
which is harmless for a small one and would not be for France.

Known wart: `_landcover_big.sh` exempts LV from its skip check, so Latvia
re-extracts on every restart. It was exempted because its first pass wedged
mid-write and the skip cannot tell a partial country from a finished one. It
has since completed cleanly, so the exemption can be removed (`[ "$cc" !=
"LV" ] &&` on the skip line) the next time the queue is not running. It costs
two minutes per restart, which is why it has not been worth stopping the queue
to fix.

The land-cover stage skips countries that already have polygons, so a restart
costs about ninety seconds rather than the hours it used to. That skip cannot
tell a FINISHED country from one killed mid-write, so anything interrupted
during its own insert needs `--refresh` (Latvia needed exactly this after a
psycopg3 `executemany` wedge left 16,917 rows behind).

### 1. Finish the full-Europe pass

`bash pipeline/cycling/run_all.sh` runs the whole chain in the one order that
works, one stage per log file. It is idempotent: splice and the fast
enrichment are already done for all 43 countries and re-running them is cheap
insurance rather than repeated work.

The scenic score's missing land-cover input is **closed**:
`pipeline/cycling/landcover.py` measures the brief's forest-and-water fraction
from the OSM polygons already on disk, in four classes (wild, water, farm at
half weight, built subtracted). `SCENIC_MODEL` is `cycle_scenic_v4`.

### 1b. Re-run scenic for the five deferred countries

**This one is easy to miss and it is not optional.** Land cover for PL, IT,
ES, DE and FR runs in its own serial queue (`_landcover_big.sh`) because area
assembly is memory bound, and it takes about seven hours: measured, Great
Britain was 1,624 s per GB of extract against 685 for the small countries, so
big extracts are superlinear rather than proportional.

The main pass will reach `scenic` BEFORE that queue finishes. Those five
countries will therefore be scored with the land-cover component absent,
which is honest (it drops and the other five renormalise) but is not the
answer we want for Germany and France. When the queue reports "deferred
countries done":

```bash
python pipeline/cycling/enrich_cycling.py --steps scenic     --countries PL,IT,ES,DE,FR --refresh
python pipeline/cycling/cycle_index.py --countries PL,IT,ES,DE,FR
python pipeline/cycling/export_cycling.py
```

Check first, rather than trusting the ordering:

```sql
SELECT country, count(*) FROM cycle_landcover
WHERE country IN ('PL','IT','ES','DE','FR') GROUP BY 1;
```

### 2. Widen the photo pass

188 routes have galleries, 180 of them with four or more. Routes without one
stay `listed`, which is the gate working rather than a shortfall.

```bash
python pipeline/cycling/cycle_images.py --countries GB      # no limit
python pipeline/cycling/export_cycling.py --countries GB
```

It records empty answers as well as hits, so a re-run never re-asks about a
route Commons had nothing for.

### 3. Harvest the remaining countries

25 of 44 are in. Missing: GR, HU, IS, LI, LT, LV, MC, MD, ME, MK, MT, RO, RS,
SI, SK, TR, UA, XK, and CH/NO/ES/IT/PT/SE/PL if that run did not complete.

```bash
python pipeline/cycling/harvest_cycling.py --countries greece,hungary,iceland
```

**One country at a time.** Two concurrent harvests plus other sessions' passes
put this Postgres into crash recovery at 13:15. The surviving process kept a
dead connection and then failed every remaining country **while still printing
progress**; check output for "the connection is closed" rather than trusting
the tail.

Then per country, and both orderings matter:
`splice_cycling.py` BEFORE `enrich_cycling.py`, and `splice_cycling.py
--sync-only` after it.

### 4. Run the whole thing through the orchestrator

`run_pipeline.py` now carries `cycling_harvest`, `cycling_enrich`,
`cycling_photos` and `cycling_publish` with the right order and guards:

```bash
python run_pipeline.py --only cycling_publish
```

### 5. Smoke BRouter

Configured but never started here: this machine has no Java and the Docker CLI
was unreachable for most of the session.

```bash
python tools/brouter/prepare.py --country GB --up --wait
curl "http://127.0.0.1:17777/brouter?lonlats=-5.06,56.82|-5.11,56.71\
&profile=carta-touring&alternativeidx=0&format=geojson"
```

The tile planner itself is verified: `--list` correctly resolves GB to twelve
5-degree segments.

---

## Why the Scotland clauses do not pass, measured

Not plumbing. Three separate causes, none of which a threshold change would
honestly fix.

### Continuity, and why the trails bound is right

Of 103 GB routes long enough to be a tour, **95 are not one continuous line**
after `ST_LineMerge`, even after splicing. In Scotland it is 14 of 18. The
obvious suspicion is that 300 m is too tight for cycling. **The data says
otherwise.** Every Scottish candidate that fails, measured:

| route | km | parts | largest gap |
|---|---|---|---|
| route `75` | 159 | 12 | 1.4 km |
| EuroVelo 12 (a UK section) | 127 | 5 | 12.0 km |
| Gallovidian Gravel | 309 | 10 | 14.7 km |
| NCN National Route 76 | 208 | 19 | 16.9 km |
| Border Loop | 432 | 15 | 48.0 km |
| John Muir Way | 208 | 7 | 95.5 km |
| NCN 1 Dundee to Tain | 503 | 34 | 165.7 km |

The smallest largest-gap in Scotland is 1,356 m, four times the splice bound,
and the median is tens of kilometres: ferry crossings (Bute, the Hebrides, the
coastal run of EuroVelo 12) and genuinely absent sections. A threshold that
admitted them would draw a straight line across the Sound of Bute and call it a
day's ride.

**The fix is routing plus explicit ferry legs**, not a looser bound. That is
what `tools/brouter/` is for.

### The four continuous Scottish routes, and what the gate said

| route | outcome |
|---|---|
| Hebridean Way, 324 km | composes at balanced (4 stages) and strong (3). **Refused**: stage 1 safety 3.57 and 2.76 |
| Tweed Cycleway, 155 km | composes at relaxed (3 stages). **Refused**: stage 2 ends at Smailholm Mains, one bed |
| Caledonia Way, 191 km | **Between paces.** 2,945 m over 191 km is 982 m a day against balanced's 1,000 m cap; too hilly for relaxed, too short for strong at 64 km a day |
| unnamed, 127 km | too short to split three ways at any pace |

Every one of those is a correct refusal a reader could check on a map.

### The Hebridean Way is the interesting one

224 km of its 296 tagged kilometres are `highway=primary`, which the brief's own
anchor prices at 6, and 83 km carries `maxspeed=60 mph`. The metric is doing
exactly what it was specified to do.

It is also describing the A865 across Barra, the Uists and Lewis: a single-track
road with passing places and some of the lightest traffic in Britain. The tags
that would tell those apart are **not present** on those ways: only `highway`,
`surface`, `oneway`, `maxspeed` and `smoothness`. No `lanes`, no `width`, no
`passing_places`.

So the reading stands and so does the refusal. If `lanes=1` or
`passing_places=yes` coverage improves in the Hebrides, that is the signal to
fold in. Inventing a remoteness discount without one would be a thumb on the
scale.

### The scenic comparison ties at 6.2, and the reason is diagnosed

Best Highland route NCN 78 scores 6.187; best central belt route NCN 754, the
Forth and Clyde canal towpath, scores 6.174. Component by component:

| | NCN 78 (Highlands) | NCN 754 (canal) |
|---|---|---|
| protected | **0.502** | 0.002 |
| views | 0.376 | **0.729** |
| coast | **1.000** | 0.804 |
| catalogue | **absent** | 0.833 |
| quiet | 0.772 | **0.999** |

Three structural causes, fully written up in `CYCLING.md`:

1. **No land-cover component** (step 1 above). Nothing measures that one route
   crosses moorland and the other passes a retail park.
2. **`views` measures OSM naming density, which follows population.** 0.656
   named features per km on the canal against 0.338 in the Highlands. NCN 79 is
   the extreme: `views` of 0.0 next to a `protected` of 0.81.
3. **`catalogue` no longer penalises thin regions**, but it does not rescue
   the comparison either. It now drops rather than scoring an absence, because
   reading `coverage.json` and counting only `ok` regions was tried and
   measured WORSE (5.2 against 5.8): `ok` means "met its quota", and Highlands
   and Islands is `ok` for mountains on nine published summits. Full reasoning
   in `CYCLING.md`.

Nothing was tuned to make this pass. The tie is the honest reading.

---

## One correction worth carrying forward

The harness originally hard-coded Scotland's ITL2 codes as TLM5 to TLM9 from
the published 2021 table. **The spine on disk carries TLM0 Eastern, TLM1 East
Central, TLM2 Highlands and Islands, TLM3 West Central, TLM5 North Eastern and
TLM9 Southern.** Every Scottish check failed silently for a while because of
it. `verify_cycling.mjs` now tests the ITL1 prefix `TLM` instead, which cannot
go stale against a re-cut spine.
