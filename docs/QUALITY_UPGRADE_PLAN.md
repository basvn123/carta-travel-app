# Carta quality upgrade plan (open-data playbook, 2026-08-11)

Mapping of the "Carta Data Playbook" research document onto what the pipeline
already ships, and the concrete work plan. The catalogue today: 1,570
destinations, 134,657 POIs (items_full), all open-data sourced.

## What already exists (do not rebuild)

| Playbook ask | Existing asset |
|---|---|
| Drop proprietary ratings | Never used them; all signals are open data |
| Dest score from open signals | rating_layer.py rating_v2: 0.70 curated appeal + 0.15 beauty + 0.15 things, absolute 0-10, Michelin-style tiers |
| Wikipedia pageviews | harvest_pageviews.py: dest fame complete (1,570), POI pop cache ~17k of ~34k wiki POIs, NEVER applied to master |
| Wikidata sitelinks | dest-level fame proxy (harvest_osm_wikidata.py), backfill_landmarks rate threshold; NOT on POIs |
| Heritage signal | it.heritage flag on 18.7% of POIs |
| Wikivoyage | harvest_wikivoyage.py intro blurbs only; no See/Do listings, no Guide/Star status |
| Dedupe | UI-side only (canonicalPoiIndices in dayDraft.js), index-stable suppression; master never deduped |
| Audit | audit_gaps.py (field presence only); NEW audit_quality.py adds validity/dupes/rate-inflation/coverage |
| Orchestration | run_pipeline.py cadence tiers, scheduled task |
| Licence ledger | docs data_licenses.md + attribution.js + 24-credit footer |
| Human gold set | curated_appeal.json: all 1,570 dests hand-scored, 639 gems; rating_shadow_report.py review queue |

## The accuracy problem (audit findings 2026-08-11)

- POI `rate` (0-3) comes from OpenTripMap heuristics + Overture cap-2 + a
  sitelink backfill. 29% of ALL POIs are rate-3; 192 dests have >45% rate-3
  (gem:aiguestortes 90%). The top tier does not discriminate.
- 1,523 duplicate POI pairs across 792 dests (Park Guell twice, etc.).
- `pop` (pageviews) is consumed by the UI's poiScore but absent from the
  master: a harvested signal never applied.
- 3,465 rate-3 POIs have no image.
- Coords are clean (0 out-of-bbox, 0 null island).

## Plan

### Phase 1: audit + dedupe (index-stable)
- [x] pipeline/audit_quality.py, report in logs/audit_quality_report.json
- [ ] pipeline/dedupe_pois.py: same union-find rules as the UI, but at the
  master: merge signal fields (wiki, img, desc, heritage, pop) into the
  winner, tag losers `dup: true` (NO deletion or reordering; saved plans
  reference stable indices). Exports and scoring skip dup-tagged POIs.

### Phase 2: POI significance engine (replaces blind trust in OTM rate)
- [ ] 2a harvest_poi_sitelinks.py: wiki URL -> QID (prop=pageprops, batched
  50/req) -> sitelink count + heritage-designation flag (wbgetentities),
  cache/poi_sitelinks.json. Finish the POI pop harvest (resumable, exists).
- [ ] 2b harvest_wikivoyage_listings.py: en.wikivoyage wikitext per dest,
  parse {{see}}/{{do}} listings (name, coords, order) + article status
  (star/guide/usable); match to POIs by normalized name + geo proximity;
  cache/wikivoyage_listings.json.
- [ ] 2c score_significance.py: composite per POI
      s = w_pv*zlog(pop) + w_sl*zlog(sitelinks) + w_her*heritage
        + w_wv*wikivoyage_listing (order-weighted) + w_rate*(old rate prior)
      blend = 0.6 * per-dest percentile + 0.4 * Europe-wide percentile
      (playbook C: per-city normalisation keeps small-town tier-1s).
      New rate: quota per dest scaled by catalogue size (rate-3 capped
      ~top 15% locally with corroboration required, every dest with >= 6
      POIs keeps >= 1 rate-3). Components stored in cache/poi_significance.json
      (sidecar, keeps the wire lean); apply pass rewrites it.rate + it.pop
      in the master, idempotent.
- [ ] 2d validate: anchors gold set (UNESCO/heritage + curated gems +
  Wikivoyage star listings must land tier >= 2; known noise kinds must not
  be rate-3), Spearman old-vs-new per dest, review queue of biggest movers.
  Benchmark per playbook: precision >= ~0.8 on anchors before apply.

### Phase 3: dest rating hardening
- [ ] apply pop to master (enrich_activities apply path), verify wire.
- [ ] rating_layer things_to_do component recomputed from the new rates
  (dedupe + deflation changes the rate-3 counts it saturates on).
- [ ] rating_shadow_report.py refresh -> human review queue for curated
  appeal outliers (the 70% component stays human, per rating_v2 rationale).

### Phase 4: automation + hygiene
- [ ] run_pipeline tasks: audit_quality (report-only, every run),
  poi sitelinks/pageviews (monthly), wikivoyage listings (quarterly),
  score_significance apply behind the validation gate.
- [ ] data_licenses.md rows for the new call patterns (Wikidata CC0,
  Wikivoyage CC BY-SA listing-derived rates).
- [ ] no-FoP image review flag (BE FR GR IT LU + list): images.fop_flag on
  POIs in no-FoP countries whose subject is modern architecture kinds.

## Explicitly NOT doing (and why)
- Postgres medallion warehouse migration: trailslab PostGIS exists for
  trails; the dest master JSON + cache/ layer already gives staging/core/
  marts separation at this catalogue size. Revisit at the 24.8k expansion.
- Google/TripAdvisor/Foursquare: already excluded by design.
- LLM city cards: dest.guide + localIntel already grounded on Wikivoyage/
  Wikipedia; card prose regeneration is a separate content pass.
