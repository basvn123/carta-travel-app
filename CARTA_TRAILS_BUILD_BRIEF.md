# Carta trails — build brief for Claude Code

Written 2026-09-17. Everything here was measured against the published wire
(`trails-export.zip`, 17,670 detail rows, wire stamped 2026-09-13), the live
site, and the source in `pipeline/trails/`. Companion documents:
`docs/TRAILS_DATA_QUALITY.md` (the standing contract), `docs/TRAILS.md` (how
the layer works today), `ROUTES.md` (the R-series plan).

**The non-negotiable goal:** for every region Carta covers, the region's
best-known trails are published, under the names people search for, with a
photo of the place and numbers that match the ground. A named famous trail that
cannot be published must appear in the coverage report with a reason code. No
silent misses. Ever.

---

## 0. How to run this

Work phase by phase. Each phase ends with a command that prints numbers, and
those numbers are the acceptance test. Do not start a phase before the previous
one's numbers are green.

```
Phase 1  Registry + coverage report     (read-only, tells the truth)
Phase 2  Way-chain derivation           (recovers way-only famous trails)
Phase 3  Parent pages for stage families
Phase 4  Per-row publish gates
Phase 5  Composition for the remaining named gaps
Phase 6  Images: rules, 3D renders, AI scoring
Phase 7  Route page + listing UI
Phase 8  Path routing, prerender, sitemap
```

Rules for the whole job:

1. **Never invent data.** Every field is harvested, derived from harvested
   data, or composed and labelled as composed. If a value is unknown, the field
   is absent and the UI says "not mapped".
2. **Provenance travels.** `source` ∈ `osm` | `osm_ways` | `carta_compose`,
   plus `derived_route`, `composed_from`, `reviewer`. The app renders the
   difference. This mirrors the fare rule in `1.CARTA.md`.
3. **Idempotent passes.** Every script is safe to re-run and writes to the
   staging DB or `cache/`, never straight to the wire.
4. **Run from the repo root**, as modules, like the rest of `pipeline/`.
5. **Commit the reports.** `reports/trails_coverage.json` and
   `reports/trails_quality.md` are committed so regressions show up in a diff.

---

## 1. Ground truth from the audit (the baseline to beat)

| Measure | Now | Target |
|---|---|---|
| Detail rows | 17,670 (17,455 hikes, 215 composed city walks) | — |
| Rows with a photo | 3,554 (20%) | 100% of published rows have a photo or a 3D render |
| Rows with a summary | 459 (2.6%) | 100% of published rows |
| Stage groups without a parent record | 540 of 594 (37,507 km) | 0 |
| Code-like names / empty names | 1,282 / 114 | 0 published |
| NUTS3 regions covered | 1,367; 162 with ≤2 trails | every applicable region at quota, or a logged reason |
| Region top trail without a photo | 739 (54%) | 0 |
| Region top trail that is a long-distance stage | 299 (22%) | only when it truly is the best-known walk |
| Ascent < 20 m while the profile spans > 300 m | 136 rows | 0 |
| Descent < 20 m with > 300 m ascent | 268 rows | 0 (or both directions published) |

Known-missing famous trails found by name search: Sentier des Roches, Cirque de
Gavarnie, Calanques, Brévent, Seceda, Alpe di Siusi, Ruta del Cares, Teide,
Laugavegur, Fimmvörðuháls (partially), Hardergrat, Gornergrat, Rysy, Morskie
Oko, Orla Perc, Plitvice, Pico Ruivo, Mount Olympus.

Root causes, verified:

- **Relation-only ingest.** `ingest_osm_routes.py` reads `type=route`
  relations. Sentier des Roches exists in OSM only as ~20 ways named
  `Sentier des Roches [secteur 1..8]`, each with `sac_scale` and
  `wikipedia=fr:Sentier des Roches`, and no relation. It cannot arrive.
- **`derive_routes.py` runs for five countries only** (MD, XK, MK, MT, AL).
- **`FAMOUS` in `curate.py` is per country and matches only rows already in the
  pool**, so it cannot notice what was never ingested.
- **The continuity gate is applied to parents**, so long paths exist only as
  stages.

---

## 2. Repo map for this work

```
pipeline/trails/
  ingest_osm_routes.py   relations -> trailslab trips           (extend: keep way-level fame tags)
  derive_routes.py       named ways -> routes, 5 countries      (extend: all countries, new chain rules)
  splice.py              joins short gaps in relations          (unchanged)
  hierarchy.py           relation graph, parent/child refs      (source for Phase 3)
  dedup.py               duplicate corridors                    (extend: relation beats derived)
  curate.py              gates + per-NUTS3 quota + FAMOUS list  (extend: registry-driven)
  rate.py                the 0..10 rating                       (unchanged)
  describe.py            text                                   (extend: hook + why-you-ll-love-it)
  trail_images.py        image pick                             (rewrite per Phase 6)
  scenic.py              highlights within 250 m                (unchanged)
  way_tags.py            per-way surface/sac/access             (source for Phase 4 surface_est)
  crosscheck_portals.py  national portals                       (source for the registry)
  popularity.py          wikidata/wikipedia/pageview fame       (source for the registry)
  quality_report.py      quality counters                       (extend: the §1 table + gates)
  export_wire.py         the published JSON                     (extend: new fields, assertions)
  smoke_test.py          harness                                (extend: famous fixtures)
NEW:
  famous_registry.py     builds data/trails/famous_registry.json
  coverage_report.py     registry vs published -> reports/trails_coverage.json
  render_terrain.py      3D terrain images per trail
  score_images.py        rule filter + Claude vision scoring
```

---

## 3. Phase 1 — the famous-trail registry and the coverage report

### 3.1 `pipeline/trails/famous_registry.py`

Builds `data/trails/famous_registry.json`: one row per candidate famous trail,
per NUTS3 region and per mountain range. Candidates come from evidence, and the
seed list in §9 is only a recall net on top.

Inputs, in order of strength:

1. **Wikidata (WDQS).** Items that are `instance of` (P31) hiking trail
   (Q2143825), long-distance trail, via ferrata, tourist attraction or
   mountain pass, that have coordinates (P625) inside one of the 43 countries.
   Keep: label per language, aliases (P1449/skos:altLabel), coordinates,
   sitelinks count, `located in` (P131), length (P2043) when present.
   Reuse the cached sitelink infrastructure in
   `harvest_activities.sitelink_counts`.
2. **Wikipedia.** For each Wikidata hit, the article title in the local
   language and in English, plus average daily pageviews over the last 12
   months (`harvest_pageviews.py`, cache in `cache/trail_pageviews.json`).
3. **OSM fame tags.** Every relation *and every way* carrying `wikipedia` or
   `wikidata` together with a hiking-ish tag (`route=hiking|foot`, or
   `highway=path|footway|track|steps` with a name or `sac_scale`). Read from
   the Geofabrik extracts already on disk — never the public Overpass API in
   bulk. This is the step that finds way-only trails.
4. **National portals** already handled in `crosscheck_portals.py`
   (swisstopo, IGN BD TOPO, BVV Wanderwege, Turrutebasen, …): any named route
   they publish counts as evidence.
5. **The seed list in §9**, resolved against 1–4. A seed that resolves to
   nothing is written to the registry with `unresolved: true` and a note, so it
   is visible rather than silently dropped.

Row shape (ids and numbers come from the harvest, never typed by hand):

```json
{
  "id": "fr-frf12-sentier-des-roches",
  "name": "Sentier des Roches",
  "aliases": ["Felsenpfad"],
  "country": "FR",
  "nuts3": "FRF12",
  "range": "GMBA:<id>",
  "lat": 0.0, "lon": 0.0,
  "evidence": {
    "wikidata": "<Qid>", "sitelinks": 0,
    "wikipedia": {"lang": "fr", "title": "Sentier des Roches", "pageviews_avg": 0},
    "osm": {"relation_id": null, "named_ways": 0, "fame_tagged": true},
    "portal": null,
    "seed": true
  },
  "fame_score": 0.0,
  "expected_km": null,
  "unresolved": false
}
```

`fame_score` ∈ 0..1, computed and documented in the module docstring:

```
fame_score = 0.35 * norm(log1p(pageviews_avg))
           + 0.25 * norm(sitelinks)
           + 0.20 * (1 if osm.fame_tagged else 0)
           + 0.10 * (1 if portal else 0)
           + 0.10 * (1 if seed else 0)
```
Normalise within country so a small country still has a top three.

Assign each row to a NUTS3 region with the same regionizer the trails use
(`regionize.py`), and to a GMBA range when it falls inside one.

CLI: `python pipeline/trails/famous_registry.py --countries FR,CH --refresh`
(monthly cadence task `trails_registry` in `run_pipeline.py`).

### 3.2 `pipeline/trails/coverage_report.py`

Matches the registry against what `curate.py` published.

A registry row is **matched** when a published trail satisfies either:

- **Geometric:** the published line passes within 250 m of the registry
  coordinate, and (when `expected_km` is known) its length is within ±40%.
- **Nominal:** normalised name or alias equality (casefold, strip accents,
  strip section markers, strip refs) with the published name.

Everything else gets exactly one reason code: `no_osm_data`,
`way_only_not_derived`, `failed_continuity`, `below_quota`, `out_of_scope`,
`composed`, `unresolved_seed`.

Outputs:

- `reports/trails_coverage.json` — per region: quota, published counts,
  registry rows with status and reason, and the region's top three by
  `fame_score`.
- `reports/trails_coverage.md` — a short human table: country, regions at
  full coverage, regions with unexplained misses, the worst 20 misses by
  `fame_score`.

**Build-failing rule:** the run fails when any region's top-three registry rows
are unmatched with a code in {`way_only_not_derived`, `failed_continuity`,
`below_quota`}. Those are our bugs, not the world's gaps.

### Acceptance for Phase 1

```
python pipeline/trails/famous_registry.py --all
python pipeline/trails/coverage_report.py --all
```
prints, and writes to the report:

- registry rows total, and per country
- matched / unmatched split with the reason histogram
- the list of unresolved seeds (must be reviewed by a human once, then either
  corrected or marked `out_of_scope` with a note)

Phase 1 ships with misses; it is the instrument, not the fix.

---

## 4. Phase 2 — way-chain derivation for every country

Extend `derive_routes.py` to run for all 43 countries, with chaining rules in
this priority order:

1. **Shared fame tag.** Contiguous ways with the same `wikipedia` or
   `wikidata` value → one route. Strongest signal; recovers Sentier des Roches.
2. **Normalised name.** Strip section markers before comparing:
   `[secteur N]`, `Etappe N`, `Abschnitt N`, `tappa N`, `étape N`, `deel N`,
   `- Teil N`, `odcinek N`, `szakasz N`, and trailing `(3/8)` counters.
3. **Shared `ref` inside one waymarked network**, when the ref is not a bare
   number reused across the country.

Then:

- Require endpoint proximity ≤ 50 m to chain two ways; order the chain
  end-to-end; refuse a chain whose graph branches into a network rather than a
  line (a named network like "Mullerthal Trail Route 2" stays out unless it
  resolves to one line).
- Trim leading/trailing `highway=service`, `parking_aisle`, or road segments
  longer than 150 m rather than publishing them as part of the walk.
- Emit `source: "osm_ways"`, `derived_route: true`, `member_way_ids`,
  `derived_from` = the rule that fired.
- `dedup.py`: a relation-sourced route always beats a derived route for the
  same corridor.
- A derived route is never described as waymarked unless its ways carry
  waymark tags (`osmc:symbol`, `marked_trail:*`).

### Acceptance for Phase 2

Restated during implementation, because the original target measured the wrong
thing. Of the 8,893 `way_only_not_derived` misses Phase 1 reported, only **29**
were trails by Wikidata class or by a human seed. The other 8,864 were
`kind: trail` only because `famous_registry.py` called any fame-tagged walkable
way a trail, and `footway` was in that set: Via Roma, Bahnhofsplatz, Gustav
Adolfs Torg, the Millennium Bridge, Solkanski most, Ketelmeer (a lake) and
Karl XII:s staty (a statue) were all filed as famous trails Carta had failed to
publish. Measured against the extracts: in Luxembourg 45 of the 48 admitted
ways carried no trail signal at all; in France a group-level trail-signal test
cuts 557 fame groups to 28 and keeps the Sentier des Roches.

Chaining cannot drive that number to zero, because there is nothing to chain.
So:

- `way_only_not_derived` falls from 8,893 to roughly 100 or fewer. The
  classifier fix accounts for most of it, and those rows move to a new
  `not_a_walk` code which is **reported, counted, per country, with a readable
  sample, and every id kept in the json**, so the move is auditable rather than
  silent. Derivation accounts for the rest. Every row still coded
  `way_only_not_derived` carries a written explanation.
- `--strict` fails when `not_a_walk` grows by more than `way_only_not_derived`
  shrinks. A code that drains another must not outgrow it, or the classifier is
  quietly reclassifying real trails to make the gate pass.
- Sentier des Roches specifically: present, one continuous line, roughly
  6 to 8 km, `sac_scale=demanding_mountain_hiking` preserved, region FRF12.
- No decrease in the published count of any region (derivation only adds),
  checked with `smoke_test.py --regression-published`, which also reports a
  region that kept its count and **swapped a member**, since `curate.py` runs a
  fixed per-region quota and a raw count diff cannot see a displacement.

Two rules in section 4 above did not survive contact with the code, and the
implementation says so rather than shipping dead code:

- **Trimming leading/trailing `highway=service` / `parking_aisle`** is
  unreachable: `scan_ways` admits only `path`, `footway`, `track`, `bridleway`
  and `steps`, so no chain can contain a service road. The reachable version of
  the same complaint is implemented instead, as `trim_tail`: a member hanging
  off either end that the cluster key does not name, that no grade defends, and
  that is longer than 150 m.
- **Refusing every branching chain** is applied to the two new strong-key
  passes only. The two original passes keep taking the longest continuous run,
  which was a deliberate earlier decision worth 110 routes across the five thin
  countries. A famous trail is held to the strict rule, plus a length
  cross-check against Wikidata's published length, because a fragment shipping
  under a famous name would match in the coverage report and turn the one
  instrument that can find the miss green.

---

## 5. Phase 3 — parent pages for stage families

Using `hierarchy.py`'s `parent_refs` / `child_refs`, plus `h.top`/`h.of` in the
current wire (today they are name strings; make them ids).

- Create a parent record when ≥2 published stages share a parent, even when no
  parent relation exists in OSM.
- Parent fields: `name`, `stage_count`, `distance_m` (sum), `ascent_m` (sum),
  `regions[]`, `stages[]` (ordered ids), `hero` (best stage photo),
  `t: "p"` as a third tier beside `r` and `l`.
- **Exempt parents from the single-line continuity gate.** They ship no single
  GPX: per-stage GPX only, plus an optional stitched file labelled as stitched.
- Parents do not consume a NUTS3 quota slot; they belong to country and range
  pages.
- Wire: `/trails/parent/{id}.json`, and parents listed in the country file
  under `parents[]`.

### Acceptance for Phase 3

- Stage groups without a parent record: **0** (from 540).
- England Coast Path, Goldsteig, Wales Coast Path, GR 5 Vosges, Via Mariae,
  Camino Lituano and Östgötaleden each resolve to one parent page with the
  right stage count.
- No stage disappears from its region listing.

---

## 6. Phase 4 — per-row publish gates

Implement in `export_wire.py` as assertions that fail the build, and report the
counts in `quality_report.py`.

1. **Human name.** No `OSM route 12345`, no bare codes (`LK 08`, `TV-151`,
   `P3`), no empty names. When OSM gives only a ref, compose:
   `"{ref} · {start_place} → {end_place_or_summit}"`, and store
   `name_source: "composed"`.
2. **Latin-script default.** `name:en` → local Latin name → transliteration,
   with the original kept as `name_local`. Applies to highlight names too
   (today Korab shows `Голем Кораб`).
3. **Region label from the start point.** Mount Korab (9/1) starts in
   Radomirë, Albania: it must not read "Mavrovo National Park, North
   Macedonia". Cross-border routes list both countries.
4. **Direction and elevation sanity.**
   - Reject `ascent_m < 20` while the profile spans > 300 m (136 rows today).
   - Reject `descent_m < 20` with `ascent_m > 300` (268 rows today).
   - For a summit route, orient the line uphill; where both directions are
     meaningful, publish `ascent_m` and `ascent_m_reverse`.
   - Cross-check the profile against `ele.start`/`ele.end` and the summit
     altitude from `scenic.py`; flag disagreements over 50 m.
5. **Grade honesty.** `difficulty` (effort) and `f.g` (terrain) are two
   gradings by design — the UI must label both rather than show one. Copy
   generated by `describe.py` may not contradict them ("a comfortable day out"
   next to 1,568 m of climb is a bug).
6. **A hook sentence** for every published row, generated from facts in the row
   only (§7.2).
7. **A photo or a 3D render** for every published row (Phase 6).
8. **Surface estimate** (`surface_est`) for every published row, derived in
   `way_tags.py` from `highway`, `tracktype`, `smoothness`, `surface`,
   `sac_scale`, `trail_visibility` plus DEM roughness, and always labelled
   "estimated" when `surface.known < 0.5`.

---

## 7. Phase 5 — composition, the last resort

When a registry row in a region's top three has no OSM geometry to build from:

- Route between its known waypoints (trailhead, named features from the
  article, summit) with the lab's Valhalla instance.
- Store `source: "carta_compose"`, `composed_from: {waypoints[], article,
  method}`, `confidence: "composed"`.
- **A composed route requires human approval** in the review UI before it
  publishes; `reviewer` is a person, never `pipeline:*`.
- The card and the page say so: "reconstructed from the published
  description". Never claim a waymark colour no tag supports.

### 7.2 Text (describe.py)

- `hook`: one sentence, ≤ 140 characters, generated from `reasons`,
  `highlights`, `ele`, `sf`, `f.g`, `grade_parts`. No adjectives that no field
  supports.
- `why_love[]`: 3 bullets, same constraint.
- Cache per trail and per language; regenerate only when the inputs change.

---

## 8. Phases 6–8 — images, page, routing (summary; full detail in the audit)

**Phase 6 — images.**
1. Free rule filters first: Commons quality badges (Featured/Quality/Valued),
   structured `depicts` rejects (animal, insect, plant, church, train, car,
   building, sign), category-name rejects, landscape ≥1,600 px, distance to the
   line, deprioritise iNaturalist/GBIF imports.
2. `render_terrain.py`: a 3D terrain image per trail (MapLibre + Mapterhorn DEM
   in headless Chromium, 1200×630 WebP, tilt and exaggeration from the route's
   climb, flat routes rendered top-down). This is the fallback that removes the
   pressure to find a photo everywhere.
3. `score_images.py`: Claude vision over the survivors — ≤6 candidates per
   trail, 640 px, terse JSON out (`scenic`, `subject`, `matches_place`,
   `quality_issues`, `crop_safe_16x9`, `caption`), Batch API. About $25 for the
   catalogue on Haiku. Hero requires `scenic ≥ 7` and `matches_place != no`.
4. Store per image: `commons_title`, `author`, `license`, `license_url`,
   `score`, `subject`, `caption`, `lat/lon`, `along_m`, `model`, `scored_at`.

**Phase 7 — route page and listing.** Two-column route page with a sticky
MapLibre 3D map, scrubbable slope-coloured elevation profile linked to a map
marker, trail-intelligence bento (water, season, weather, safety, getting
there, underfoot), masonry gallery with `along_m` hovers, GPX/phone/share
actions. Listing: full-bleed header with a Photo ⇄ 3D map toggle, bento grid
with a double-width feature card, hover carousel, quick-preview drawer, Epic
meter. The working prototype is `carta-trails-prototype.html`.

**Phase 8 — routing and SEO.** `/trails/{cc}/{slug}-{id}` and `/trails/{cc}`,
prerendered by `scripts/prerender.mjs`, per-page title/description/OG image,
a real sitemap index, `robots.txt` updated so content paths are crawlable.
Without this, no famous trail can ever rank, which defeats the point of
including them.

---

## 9. The seed famous-trail list

This is a **recall net**, not a data source. Every entry must resolve through
§3.1 against Wikidata, Wikipedia, OSM or a national portal; an entry that
resolves to nothing ships as `unresolved: true` in the registry and is reviewed
by a human once. Names are as travellers search for them; aliases and local
spellings are the resolver's job. Add to this list whenever a miss is found —
it is expected to grow.

**AD** Coma Pedrosa · Estanys de Tristaina · Camí dels Matxos · Estany de l'Illa · Coronallacs · GR 11 · GR 7
**AL** Theth–Valbonë · Blue Eye of Theth · Maja e Jezercës · Mount Korab · Llogara–Cika · Gjipe Canyon · Peaks of the Balkans · Grunas Waterfall
**AT** Adlerweg · 5-Gipfel-Klettersteig · Gosausee–Adamekhütte · Krimmler Wasserfälle · Dachstein Heilbronner Rundweg · Zentralalpenweg · Salzsteigweg · Karnischer Höhenweg · Rax Plateau · Wilder Kaiser Steinerne Rinne · Großglockner Gamsgrubenweg
**BA** Via Dinarica · Lukomir–Rakitnica · Čvrsnica/Hajdučka vrata · Sutjeska Maglić · Vjetrenica
**BE** GR 5 · GR 57 Ourthe · Hautes Fagnes boardwalks · Ninglinspo · Herbeumont Semois loop · Sentier de l'Amblève
**BG** Kom–Emine · Seven Rila Lakes · Musala · Vihren · Malyovitsa · Belogradchik Rocks · Devil's Throat
**CH** Hardergrat · Aletsch Panoramaweg · Eiger Trail · Fünf-Seen-Weg Pizol · Gornergrat–Riffelsee · Creux du Van · Oeschinensee Panoramaweg · Schynige Platte–First · Walker's Haute Route · Via Alpina · Gemmipass · Bisse du Rho
**CY** Aphrodite Trail · Artemis Trail · Caledonia Falls · Avakas Gorge · Troodos Atalante
**CZ** Pravčická brána · Sněžka · Prachovské skály · Adršpach · Český ráj Zlatá stezka · Macocha · Pancíř
**DE** Watzmann Ostwand path · Höllentalklamm · Partnachklamm · Malerweg · Rheinsteig · Eifelsteig · Heidschnuckenweg · Goldsteig · Westweg · Rennsteig · Königssee–Obersee · Zugspitze via Reintal · Drachenfels · Externsteine
**DK** Hærvejen · Gendarmstien · Møns Klint · Rubjerg Knude · Camønoen
**EE** Suur Munamägi · Viru bog boardwalk · Peraküla–Aegviidu–Ähijärve · Jägala waterfall
**ES** Ruta del Cares · Caminito del Rey · Teide Telesforo Bravo · Ordesa Cola de Caballo · Carros de Foc · Ruta de las Xanas · Camino de Santiago (Francés, Norte, Primitivo) · GR 11 · GR 131 · Pedraforca · Mulhacén · Masca Barranco · Roque Nublo · Camí de Cavalls
**FI** Karhunkierros · Hetta–Pallas · UKK · Kevo · Halti · Nuuksio
**FO** Sørvágsvatn/Trælanípa · Slættaratindur · Kalsoy Kallur lighthouse · Postrouten
**FR** **Sentier des Roches** · Cirque de Gavarnie · Brévent–Lac Blanc · Aiguilles Rouges · Calanques Sugiton/En-Vau · Tour du Mont Blanc · GR 20 · GR 34 sentier des douaniers · GR 5 · GR 10 · Tour des Écrins · Tour du Queyras · Chemin de Stevenson · Mont Aiguille · Pointe du Raz · Dune du Pilat · Cirque de Troumouse · Gorges du Verdon Blanc-Martel · Puy de Dôme · Pic du Midi d'Ossau tour
**GB** Ben Nevis Mountain Track · Snowdon/Yr Wyddfa Llanberis & Crib Goch · Helvellyn Striding Edge · Scafell Pike · Old Man of Coniston · Tryfan · Glyder Fach · Pen y Fan · West Highland Way · Pennine Way · Coast to Coast · Hadrian's Wall Path · Offa's Dyke · Cotswold Way · South West Coast Path · Pembrokeshire Coast Path · Giant's Causeway Cliff Path · Malham Cove · Old Harry Rocks · Seven Sisters
**GR** Samaria Gorge · Vikos Gorge · Mount Olympus Mytikas (E4) · Meteora · Menalon Trail · Corfu Trail · Imbros Gorge · Athos pilgrim paths · Zagori stone bridges · Santorini Fira–Oia
**HR** Plitvice lake paths · Premužić Trail · Paklenica Velika/Manita peć · Biokovo Sveti Jure · Velebit Zavižan · Krka falls · Dubrovnik city walls walk
**HU** Országos Kéktúra · Bükk Szalajka · Mátra Kékes · Balaton-felvidék Csobánc · Tihany
**IE** Wicklow Way · Kerry Way · Dingle Way · Causeway Coast Way · Cliffs of Moher Coastal Walk · Diamond Hill · Carrauntoohil Devil's Ladder · Glendalough Spinc
**IS** Laugavegur · Fimmvörðuháls · Reykjadalur · Glymur · Skógafoss–Fimmvörðuháls · Hornstrandir · Þakgil · Stórurð
**IT** Tre Cime di Lavaredo loop · Seceda–Col Raiser · Alpe di Siusi · Sentiero Azzurro Cinque Terre · Sentiero degli Dei · Selvaggio Blu · Alta Via 1 & 2 · Lago di Braies circuit · Tofana Astaldi · Sassolungo Friedrich August · Gran Paradiso Nivolet · Vesuvio Gran Cono · Stromboli summit · Via Francigena · Sentiero Italia
**LI** Fürstensteig · Drei Schwestern · Liechtenstein-Weg · Fürstin-Gina-Weg
**LT** Curonian Spit dunes · Aukštaitija lakes · Baltic Coastal Hiking Route · Camino Lituano
**LU** Mullerthal Trail · Escapardenne Lee Trail · Sentier du Nord · Schiessentümpel
**LV** Gauja Sigulda cliffs · Jūrtaka Baltic Coastal · Mežtaka Forest Trail · Kemeri bog boardwalk
**MD** Orheiul Vechi · Codrii reserve trails · Ţipova
**ME** Bobotov Kuk · Durmitor Ring · Ledena pećina · Kotor Ladder of Kotor · Peaks of the Balkans · Via Dinarica
**MK** High Scardus Trail · Matka Canyon · Vodno Millennium Cross · Titov Vrv · Golem Korab
**MT** Dingli Cliffs · Victoria Lines · Gozo Coastal Walk · Blue Grotto path
**NL** Pieterpad · Pelgrimspad · Trekvogelpad · Nationaal Park Veluwezoom Posbank · Drents-Friese Wold · Waddenwandelen · Zuid-Kennemerland dunes
**NO** Preikestolen · Trolltunga · Kjeragbolten · Besseggen · Romsdalseggen · Reinebringen · Segla · Galdhøpiggen · Hardangervidda crossings · Olavsleden · Rondane Rondvassbu · Ryten
**PL** Rysy · Morskie Oko · Orla Perć · Giewont · Śnieżka · Szczeliniec Wielki · Kasprowy Wierch–Świnica · Bieszczady Połonina Wetlińska · Ślęża
**PT** Pico Ruivo–Pico do Arieiro · Levada do Caldeirão Verde · Rota Vicentina Fishermen's Trail · Sete Cidades · Ponta de São Lourenço · Passadiços do Paiva · Gerês Cascata do Arado · Pico mountain climb · Fanal forest
**RO** Piatra Craiului ridge · Bucegi Sphinx/Babele · Făgăraş Moldoveanu · Retezat Bucura · Transilvanica · Cheile Turzii · Șapte Scări
**RS** Đerdap Veliki Štrbac · Tara Banjska stena · Stara Planina Midžor · Fruška Gora · Via Dinarica
**SE** Kungsleden · Sörmlandsleden · Skåneleden · Höga Kusten · Padjelantaleden · Abisko Kärkevagge · Bohusleden
**SI** Triglav via Kredarica · Vintgar Gorge · Velika Planina · Soča Trail · Tolmin Gorge · Savica Waterfall · Slovenska planinska pot · Juliana Trail · Logar Valley Rinka
**SK** Tatranská magistrála · Slovenský raj Suchá Belá · Rysy · Cesta hrdinov SNP · Veľký Rozsutec · Kvačianska dolina
**XK** Rugova Canyon · Peaks of the Balkans · Gjeravica · Mirusha waterfalls

Small countries (MC, SM, and the micro-regions) take whatever the registry
finds; the rule is coverage per region, and a region with genuinely nothing
famous logs `no_osm_data` rather than inventing something.

---

## 10. Definition of done

The job is finished when all of these are true, printed by one command:

```
python pipeline/trails/coverage_report.py --all --strict
python pipeline/trails/quality_report.py --all
python pipeline/trails/smoke_test.py --famous
```

1. **Coverage.** Every applicable NUTS3 region: its top three registry rows are
   matched, or each miss carries `no_osm_data` / `out_of_scope` with a note.
   Zero misses coded `way_only_not_derived`, `failed_continuity` or
   `below_quota`.
2. **Fixtures.** The 30-trail famous fixture set in `smoke_test.py` — including
   Sentier des Roches, Ruta del Cares, Hardergrat, Laugavegur, Rysy, Pico
   Ruivo, Seceda, Mount Olympus, Plitvice, Trolltunga, Ben Nevis, Samaria,
   Triglav, Tre Cime, Preikestolen — is published, each with a photo or render,
   a hook, a sane profile and a correct region.
3. **Parents.** 0 stage groups without a parent record.
4. **Names.** 0 published rows with a code-like or empty name.
5. **Media.** 100% of published rows have a photo scoring ≥7 or a 3D render;
   0 rows with an animal, vehicle or building as the hero.
6. **Numbers.** 0 rows failing the direction/elevation checks; 100% with
   `surface_est`; 100% with a hook.
7. **Routing.** Every published trail has a crawlable path URL in the sitemap,
   and the prerendered page carries its own title, description and OG image.
8. **Provenance.** Every row states whether it came from a relation, a derived
   way-chain, or composition; every composed row has a human reviewer.

If any of these cannot be met for a specific trail, the answer is a reason code
in the coverage report — never silence.
