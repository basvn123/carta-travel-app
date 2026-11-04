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

### Phase 1: audit + dedupe (index-stable) - DONE 2026-08-11
- [x] pipeline/audit_quality.py, report in logs/audit_quality_report.json
  (+ FoP no-freedom-of-panorama image review queue, 8,542 flagged)
- [x] pipeline/dedupe_pois.py: UI union-find rules ported but STRICTER
  (name-token corroboration for img/geo keys, document-frequency filter,
  distinct-year guard): 7,202 dups tagged, 507 fields merged into winners.
  Index-stable (saved plans keep speaking in original indices).
- [x] normalize_poi_kinds.py finally applied: 1,957 commercial-noise POIs
  demoted rate 0 + noise:1; writer hardened to atomic_write_json.

### Phase 2: POI significance engine - DONE 2026-08-12 (applied)
- [x] 2a harvest_poi_wikidata.py: 26k wiki URLs -> QID -> sitelinks,
  heritage P1435, visitors P1174, PLUS admin/settlement/station class flags
  (6,568 POIs were riding their TOWN's article fame - the class flags zero
  those signals). cache/poi_wikidata.json. POI pop harvest completed:
  34,464 URLs.
- [x] 2b harvest_wikivoyage_listings.py: 1,010 articles, 13,248 See/Do
  listings + status ladder (4 star, 103 guide). cache/wikivoyage_listings.json.
- [x] 2c score_significance.py: composite per POI
      s = w_pv*zlog(pop) + w_sl*zlog(sitelinks) + w_her*heritage
        + w_wv*wikivoyage_listing (order-weighted) + w_rate*(old rate prior)
      blend = 0.6 * per-dest percentile + 0.4 * Europe-wide percentile
      (playbook C: per-city normalisation keeps small-town tier-1s).
      New rate: LOCAL quota (top ~12% = 3 with corroboration required,
      next ~28% = 2), heritage floor (designated + >= 15 sitelinks never
      falls below 2). Ledger in cache/poi_significance.json; apply rewrote
      63,674 rates + set pop on 22,386 POIs. Rate-3 share 29.8% -> 9.9%,
      inflated dests 192 -> 0.
- [x] 2d validated + gated: famous-heritage anchors recall 1.0 (1,392),
  Wikivoyage top listings 0.957 (2,347), zero uncorroborated rate-3s,
  median per-dest Spearman(old,new) 0.75. Gate (min recall 0.80) is
  enforced INSIDE `score_significance.py apply` - it refuses to write on
  failure. Movers ledger in logs/significance_report.json.

### Phase 3: dest rating hardening - DONE 2026-08-12
- [x] pop applied via score_significance apply; wire re-synced.
- [x] rating_layer: dup/noise excluded from things_to_do,
  THINGS_SATURATION recalibrated 28 -> 19 (median raw moved to ~25;
  keeps the median component at the calibrated ~0.73). Tier counts held
  steady (40/150/413) through apply_rating_layer's own validation gate.
- [x] rating_shadow_report.py: fixed silently-dead guide component
  (read guide.blurb, master has guide.text), added the Wikivoyage
  star/guide/usable status ladder, refreshed the review queue.

### Phase 4: automation + hygiene - DONE 2026-08-12
- [x] run_pipeline tasks: `poi_significance` (monthly chain: pageviews ->
  wikidata -> wv listings -> dedupe -> normalize -> gated apply -> rating)
  and `audit` (monthly report-only).
- [x] data_licenses.md rows extended (harvest_poi_wikidata,
  harvest_wikivoyage_listings call patterns).
- [x] no-FoP image review queue in audit_quality.py (report-only).
- [x] SCHEMA.md: stale rating_v1 stanza replaced with rating_v2; new POI
  fields (rate v15.1 semantics, dup, noise) documented.
- [x] verify: npm run data synced, build + smoke-nav green, top-sight
  spot checks (BRU/KRK/Hallstatt/CRL) correct on the served wire.

### Known follow-ups
- 514 residual fuzzy dup pairs (deliberately unmerged; UI suppression
  covers them) - e.g. KRK "Polish Aviation Museum"/"Muzeum Lotnictwa".
- 409 rate-3 POIs still imageless -> run must_descs/poi_images backfill.
- 8,542 FoP-flagged images await a human review policy.
- Big-city Wikivoyage listings live in district articles (not followed);
  small towns, where the signal matters most, are covered.

## Explicitly NOT doing (and why)
- Postgres medallion warehouse migration: trailslab PostGIS exists for
  trails; the dest master JSON + cache/ layer already gives staging/core/
  marts separation at this catalogue size. Revisit at the 24.8k expansion.
- Google/TripAdvisor/Foursquare: already excluded by design.
- LLM city cards: dest.guide + localIntel already grounded on Wikivoyage/
  Wikipedia; card prose regeneration is a separate content pass.
