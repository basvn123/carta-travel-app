# Trails data quality — the standing contract

Status: written 2026-09-17 from an audit of the published wire
(`trails-export.zip`, 17,670 detail rows, wire stamped 2026-09-13) and of
`pipeline/trails/`. This file is the standing brief for anyone — human or
Claude Code — changing the trails layer. `docs/TRAILS.md` says how the layer
works; this says what it must be true of, and what to do when it is not.

The one rule, stated once:

**A region is only covered when a traveller searching for that region's
best-known walks finds them here, under the names they searched for, with a
photo that shows the place and numbers that match the ground.**

Catalogue size is not coverage. 17,670 rows with the Sentier des Roches
missing is a worse product than 8,000 rows with it present.

---

## 1. What the audit found (the baseline to beat)

| Measure | 2026-09-13 wire | Target |
|---|---|---|
| Rows with a photo | 3,554 / 17,670 (20%) | every published row has a photo or a 3D render |
| Rows with a written summary | 459 (2.6%) | every published row |
| Stage groups with no parent record | 540 of 594 (37,507 km) | 0 |
| Names that are codes, or empty | 1,282 + 114 | 0 published |
| NUTS3 regions with ≤2 trails | 162 of 1,367 | every applicable region meets its quota or explains the gap |
| Region top trail with no photo | 739 (54%) | 0 |
| Region top trail that is a long-distance stage | 299 (22%) | only where it genuinely is the region's best-known walk |

Worked example of the failure: **Sentier des Roches** (Vosges, Haut-Rhin).
OSM holds it as ~20 ways named `Sentier des Roches [secteur 1..8]`, each
tagged `sac_scale=demanding_mountain_hiking` and
`wikipedia=fr:Sentier des Roches`. There is no route relation. The ingest
reads relations, `derive_routes.py` runs only for five countries, and the
`FAMOUS` recall list in `curate.py` is per country and only matches rows
already in the pool. So the walk cannot arrive by any path. Haut-Rhin
publishes 11 trails, headed by an 11 km vineyard loop.

Three structural causes, in the order they cost coverage:

1. **Relation-only ingest.** Famous day walks in France, Italy, Spain,
   Switzerland, Poland and Portugal are frequently way-only.
2. **A hand-written, country-level recall list.** It cannot notice what was
   never ingested, and cannot promise anything per region.
3. **The continuity gate applied to parents.** Right for a GPX, wrong for a
   parent page, which is an itinerary of stages and offers no single file.

---

## 2. The famous-trail registry (new, and the centre of this work)

Build `data/trails/famous_registry.json` before curation runs. It is
evidence, not opinion, and it is what makes "did we get the famous ones"
answerable.

One row per candidate trail (shape is illustrative; ids and figures are filled by the harvest, not typed by hand):

```json
{
  "id": "fr-vosges-sentier-des-roches",
  "name": "Sentier des Roches",
  "aliases": ["Felsenpfad", "Sentier des Roches [secteur 1]"],
  "nuts3": "FRF12",
  "range": "GMBA:<id>",
  "lat": 0.0, "lon": 0.0,
  "evidence": {
    "wikidata": "<Q-id from WDQS>",
    "wikipedia": {"lang": "fr", "title": "Sentier des Roches", "pageviews_avg": 0},
    "sitelinks": 0,
    "osm": {"relation": null, "named_ways": 20, "wikipedia_tagged": true},
    "portal": null
  },
  "fame_score": 0.0,
  "expected_km": 0.0
}
```

Sources, all already reachable from this repo:

- **Wikidata**: items that are instance-of hiking trail / tourist attraction
  with coordinates inside a NUTS3 region; sitelink counts already cached via
  `harvest_activities.sitelink_counts`.
- **Wikipedia**: article titles per region plus average daily pageviews
  (`harvest_pageviews.py`, `cache/trail_pageviews.json`).
- **OSM**: any way or relation carrying `wikipedia` / `wikidata` with a
  hiking-ish tag (`highway=path|footway|track|steps` with a name or
  `sac_scale`, or `route=hiking`). This is what finds way-only trails.
- **National portals** already cross-checked in `crosscheck_portals.py`
  (swisstopo, IGN BD TOPO, BVV, Turrutebasen, …).

Rules:

- The registry is **per NUTS3 region and per mountain range**, never per
  country. A country list cannot promise a region page anything.
- Registry rows are candidates, not truth. A row is confirmed when it matches
  a published trail; otherwise it is a **named gap** with a reason.
- Regenerate monthly, on the fame cadence, and keep the previous file so
  `quality_report.py` can diff it.
- `FAMOUS` in `curate.py` stops being a source and becomes a seed list merged
  into the registry, so nothing already known is lost.

---

## 3. The coverage gate (build-failing)

After `curate.py`, every region is scored against its registry. Each
unmatched registry row must carry exactly one reason code:

| Code | Meaning | Allowed to ship? |
|---|---|---|
| `matched` | published trail found within 250 m of the registry line or point, name or alias matching | yes |
| `no_osm_data` | nothing in OSM to build from | yes, logged |
| `way_only_not_derived` | named ways exist, chaining failed | **no** — fix the chainer |
| `failed_continuity` | derived or relation geometry is broken | **no** for a day walk; parents exempt (§5) |
| `below_quota` | present but not selected | only if the region already publishes its top 3 registry rows |
| `out_of_scope` | outside the 43-country catalogue | yes |
| `composed` | built by `carta_compose`, human-approved | yes |

`quality_report.py` fails the run when any region's **top three** registry
rows by `fame_score` are unmatched with a non-allowed code, and prints them.
Coverage is reported per region, per country and per range, and the report is
committed so regressions are visible in the diff.

---

## 4. Way-chain derivation, everywhere

`derive_routes.py` becomes a standard pass for all countries, not a fallback
for five. Chaining rules, in priority order:

1. **Same `wikipedia` or `wikidata` tag** on contiguous ways → one route.
   This is the strongest signal and it is what recovers Sentier des Roches.
2. **Same normalised name.** Normalise by stripping section markers before
   comparing: `[secteur N]`, `Etappe N`, `Abschnitt N`, `tappa N`, `étape N`,
   `deel N`, `- Teil N`, and trailing `(1/8)`-style counters.
3. **Same `ref` within a waymarked network**, when the ref is not a bare
   number shared across the country.

Then: require physical connection (endpoints within 50 m), order the chain,
and emit one route with `source: "osm_ways"`, `derived_route: true`, the
member way ids, and the evidence that drove the chain. A chain that includes
`highway=service`, `parking_aisle` or road segments longer than 150 m is
trimmed at those segments rather than published with them.

Guard rails: a derived route never outranks a relation-sourced route for the
same corridor (`dedup.py` keeps the relation), and a derived route is never
described as waymarked unless its ways carry the waymark tags.

---

## 5. Parent pages for stage families

A stage family gets a parent record when two or more published stages share a
parent (`hierarchy.py` already holds `parent_refs` / `child_refs`), even when
no parent relation exists in OSM.

- The parent carries: name, total distance, total ascent, stage count,
  ordered stage list, region list, and the best photo among its stages.
- The parent is **exempt from the single-line continuity gate**, because it
  ships no single GPX. Per-stage GPX only, plus an optional concatenated file
  clearly labelled as stitched.
- A parent never consumes a region quota slot; it belongs to the country or
  range page. Stages keep competing on their own merits.
- `t: "p"` as a third tier beside rated (`r`) and listed (`l`), so the app can
  render a parent differently from a day walk.

This is what makes "England Coast Path", "Goldsteig", "GR 5 Vosges" and 537
other long paths exist as searchable objects.

---

## 6. Composition, and how it must be labelled

When a registry row has no OSM geometry to build from, compose it: route
between its known waypoints with the lab's Valhalla instance, store the
waypoints and their source, and set `source: "carta_compose"` with
`composed_from` listing the waypoints and the article that describes the walk.

Hard rules:

- A composed route **requires human approval** in the review UI before it
  publishes. `reviewer` is a person, never `pipeline:*`.
- The app shows composed and derived provenance honestly: relation-sourced,
  way-derived, or composed. Never present a composed line as an official
  waymarked route, and never claim a waymark colour that no tag supports.
- Composed routes carry `confidence: "composed"` so a card can say
  "reconstructed from the published description".

This mirrors Carta's price rule — harvested, then cached, then estimated,
each labelled — and for the same reason: the asset is trust.

---

## 7. Every published row must pass these

Applies to rated and listed tiers alike, at wire build time
(`export_wire.py`), as assertions that fail the build:

1. **A human name.** No `OSM route 12345`, no bare codes (`LK 08`, `TV-151`,
   `P3`), no empty names. If OSM offers only a ref, compose a name from the
   ref plus its endpoints or its summit: `9/1 · Radomirë → Maja e Korabit`.
2. **A photo or a 3D render.** A photo scoring ≥7 (see the image pipeline), or
   the rendered terrain image. Never a photo of the nearest town, never an
   animal, vehicle or building as the hero.
3. **A one-sentence hook**, generated from facts already in the row and
   nothing else.
4. **Numbers that agree with the line.** Ascent, descent, high point and the
   elevation profile must be consistent with the geometry and its direction.
   Reject or re-orient a route whose ascent is under 20 m while its profile
   spans more than 300 m (136 rows today), or whose descent is under 20 m with
   over 300 m of ascent (268 rows). Prefer the uphill direction for a summit
   route; where both directions are meaningful, publish both figures.
5. **A region label taken from the start point**, not from the nearest famous
   park. Mount Korab (9/1) starts in Radomirë, Albania, and must not be
   labelled "Mavrovo National Park, North Macedonia".
6. **Latin-script names by default**, `name:en` → local Latin name → other
   script, with the local name kept as a secondary field.
7. **Grades that match the copy.** Do not put "a comfortable day out" beside
   1,568 m of ascent. `difficulty` (effort) and `f.g` (terrain) are two
   different gradings by design — the UI must label which is which rather than
   show one and hide the other.

---

## 8. Ordering of work

1. Registry build + coverage report (read-only; tells you the true size of the
   gap per region).
2. Way-chain derivation for all countries; re-run the report.
3. Parent pages for stage families; re-run the report.
4. Per-row gates (§7) as build assertions.
5. Composition for whatever is still a named gap in a region's top three.

Each step is shippable and each one moves a number in §1. Do not start step 5
before step 1 exists: composing trails by hand before knowing what is missing
is how the catalogue grew wide and shallow in the first place.

---

## 9. Checks that must exist

- `pipeline/trails/coverage_report.py` — registry vs published, per region,
  per country, per range. Writes `reports/trails_coverage.json` and a short
  markdown summary. Fails on unexplained top-3 misses.
- Extend `pipeline/trails/quality_report.py` with the §7 assertions and the
  counters from §1, so every run prints the same table and a regression is
  obvious.
- A fixture set of 30 famous trails across 15 countries (Sentier des Roches,
  Ruta del Cares, Hardergrat, Laugavegur, Rysy, Pico Ruivo, Seceda, Mount
  Olympus, Plitvice, Trolltunga, …) asserted present in `smoke_test.py`. When
  one of them cannot be published, the test names the reason code, so the
  answer to "did you get the famous ones" is never "probably".

---

## 10. Phase 1 as built (2026-09-17)

Phase 1 of `CARTA_TRAILS_BUILD_BRIEF.md` is implemented and running:

- `pipeline/trails/famous_registry.py` -> `data/trails/famous_registry.json`
- `pipeline/trails/coverage_report.py` -> `data/reports/trails_coverage.json`
  and `data/reports/trails_coverage.md`
- `run_pipeline.py` task `trails_registry`, monthly, no lab guard

Phase 1 is an INSTRUMENT. It changes no published row, gates nothing by
default, and is expected to report a large gap. That is the point: the gap
was always there, and until now nothing measured it.

### What the first full sweep measured (2026-09-18)

`famous_registry.py --all` then `coverage_report.py --all`, 44 countries:

| Measure | Value |
|---|---|
| Candidates harvested | 179,243 (171,776 placed in a NUTS3) |
| Walk candidates (`kind: trail`) | 15,943 |
| Walks published | 1,630 (10.2%) |
| **Walks missing for reasons that are ours** | **12,411** |
| `way_only_not_derived` (Phase 2) | 8,893 |
| `failed_continuity` (Phase 3) | 3,518 |
| Regions with a walk candidate | 1,151 |
| Regions failing the top-three gate | 1,067 |
| Famous fixtures published | 14 of 30 |

Worst miss in Europe is Orla Perc (0.735, `way_only_not_derived`).
Fuerstensteig, Ruta del Cares and Laugavegur are all in the list. Every one
of the 16 fixture gaps now carries a reason code.

The `kind` split is what makes those numbers readable: 156,905 of the raw
misses are `no_osm_data` on `kind: place` rows, a named summit or lake with
an article and no path. Gating on those would bury 12,411 real problems
under 160,000 non-problems.

**File sizes.** The raw registry and report are 113 MB and 46 MB. The
largest report already committed in this repo is 6 MB, and `trails_registry`
runs monthly, so committing them raw would add a nine-figure line count to
the repo every month and defeat the point of committing them at all. The
committed files carry every walk candidate and all the rollups (12.3 MB and
5.9 MB); the place candidates go to `famous_registry_full.json` and
`trails_coverage_full.json` behind `--full` / `--full-rows`, both gitignored.

### What the build confirmed, and what it corrected

Measured against the France extract and the published wire rather than
assumed:

- **Confirmed.** Sentier des Roches exists in OSM as 15 ways tagged
  `wikipedia=fr:Sentier des Roches` and `sac_scale=demanding_mountain_hiking`,
  named `[secteur 1..8]`, and is absent from all 17,619 published rows. The
  registry now carries it, in region FRF12, with 18 named ways and no
  relation.
- **Confirmed, after a false alarm.** A name search finds four relations
  called "Sentier des Roches" in the France extract, which looked at first
  like a contradiction of the audit's "no route relation anywhere". It is
  not. Two are `type=associatedStreet` (street addressing, not routes), and
  the two real `route=hiking` relations are operated by Cote d'Or Tourisme
  in Burgundy, about 400 km from the Vosges: different paths that share a
  common French name. The Vosges walk at 48.0497N 7.0309E genuinely has no
  relation, and the registry row correctly carries `relation_id: null` with
  18 named ways.

  The lesson is for Phase 2, not for the audit: **a French trail name is not
  unique**. "Sentier des Roches", "Sentier des Douaniers" and their like
  recur across the country, so the way chainer must not fold ways together
  on a normalised name alone. Chain on the shared `wikipedia`/`wikidata` tag
  first (rule 1 of section 4), and require physical endpoint proximity for
  every name-based chain, or Burgundy and Alsace end up in one route.

### Decisions taken during the build, with their reasons

1. **The report reads the published wire, not the staging DB.** The wire is
   what a traveller gets, it is what the audit measured, and it means the
   report runs when the lab is down (which it was, wedged in WSL, for part of
   this work).
2. **Rows carry `kind`: `trail` or `place`.** Wikidata's classes for a famous
   walk are inconsistent (Trolltunga is a rock formation, Samaria a gorge), so
   the class net has to be wide. Wide nets also catch every named summit and
   lake. Measured on Liechtenstein, 33 of 36 misses were summits and lakes.
   A region is therefore HELD TO its top three `trail` rows only; `place` rows
   are still reported and ranked, because "no trail is published to this lake"
   is a real but much weaker finding than "this named path is missing".
   An OSM hiking tag or a human seed promotes a row to `trail` whatever
   Wikidata calls it.
3. **`mountain range` (Q207326) is not queried.** A range is where walks are,
   not a walk. Including it ranked "Alpidischer Gebirgsguertel", a tectonic
   belt spanning a continent, fifth in Liechtenstein. Ranges belong in the
   `range` field, which is what they are good for.
4. **Fame is normalised within country.** Otherwise a small country has no
   top three and the per-region gate cannot hold it to anything.
5. **Reason codes are assigned from the row's own evidence**, most actionable
   first, so a row that COULD have been derived is never filed under a code
   that excuses it.

### The strict gate refuses to pass vacuously

`coverage_report.py --strict` exits 2, not 0, when there are no registry
rows, no published rows, or no row carrying a region. "Every region's top
three is matched" is vacuously true over zero regions, so a half-built
registry or a country filter that matched nothing would otherwise report
success and hide the entire problem the gate exists to catch.

### Two gotchas worth keeping

- **QLever and WDQS do not answer the same query.** The `p:P625`/`psv:P625`
  coordinate path with `wikibase:geoLatitude` returns a 400 from QLever and
  correct results from WDQS, so whichever endpoint answered decided which
  items a country got, and the Dune du Pilat silently vanished from France.
  The registry uses the plain truthy `wdt:P625` path, which both serve, and
  parses the WKT point. Any new SPARQL here must be checked against BOTH
  endpoints, not just the one that answers first.
- **Filter OSM extracts on a key, in C++, before Python sees the object.**
  A tag-blind pass over the 5 GB France extract takes 783 seconds; the same
  scan filtered with `KeyFilter("wikidata", "wikipedia")` takes 31. That 25x
  is the difference between a 44-country sweep being half an hour and being
  overnight.
