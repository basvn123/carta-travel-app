# T057 Remove obsolete fare metadata from the payload

## Task ID

T057

## Date

2026-09-28

## What changed

Removed obsolete fare metadata that the app never reads, reducing both the shipped payload and the runtime memory footprint. Two parallel changes:

**Wire reduction (sync-data.mjs):** Per-day Travelpayouts metadata (out_o, ret_o, out_x, ret_x) is now stripped from the fares JSON files during wire building. These fields tracked which calendar days came from Travelpayouts cache quotes and when they expire—information needed only during pipeline merging, never read by the app. Removes 1.96 MB (8%) from the payload.

**Runtime cleanup (origins.js):** Removed five unused fields that were being added to route objects despite never being read:
- outbound_seen, return_seen: unused conditional spreads reading the now-deleted out_o/ret_o
- outbound_expires, return_expires: unused conditional spreads reading the now-deleted out_x/ret_x  
- fare_model: a hardcoded string added to every route but never read anywhere

The record-level contract-A fields (s, o for provenance; out_c, ret_c for source tracking) remain, as these are read by FareProvenance.jsx to show users how old a fare is and where it came from.

## Files touched

**Modified:**
- continent-app/scripts/sync-data.mjs (deletes out_o, ret_o, out_x, ret_x during wire build)
- continent-app/src/lib/origins.js (removes unused spread operators and fare_model)

**Regenerated:**
- continent-app/public/fares/*.json (all 286 origin slices)
- continent-app/public/app_data.json

**Created:**
- Execution/P3/T057-remove-obsolete-fare-metadata.md

**Modified:**
- Execution/_OPEN.md (no rows; this task raises no further work)

## Commands run

From continent-app/:

```bash
npm run data                     # sync-data.mjs: delete out_o/ret_o/out_x/ret_x from fares
npm run build                    # rebuild dist/ to verify origins.js cleanup compiles
```

sync-data.mjs runs as part of the Vite predev and prebuild hooks. It inverts the fares table into per-origin slices and deletes the four per-day provenance fields as it writes each slice to public/fares/{IATA}.json.

## Config and secrets set

None.

## Before/after measurements

**Wire payload (sync-data.mjs deletion of out_o/ret_o/out_x/ret_x):**

| Metric | Before | After | Delta |
|---|---|---|---|
| Fares payload size (raw) | 24.509 MB | 22.546 MB | −1.963 MB (−8.0%) |
| Fares payload size (gzipped est.) | ~6.9 MB | ~6.3 MB | −0.6 MB (−8.7%) |

**Runtime footprint (origins.js removal of unused fields):**

Eliminates five fields per route object (286 origins × number of anchor airports, ~3,000–4,000 routes total). Per-route savings: ~70 bytes (the five field definitions). Total: ~210–280 KB of in-memory route objects when all fares are hydrated.

**Proof of no-reads:** Grep of src/ and supabase/functions/ for `outbound_seen`, `return_seen`, `outbound_expires`, `return_expires`, and `fare_model` returns only their definition in origins.js, never a read. FareProvenance.jsx reads `o` (observed epoch) and `x` (expires epoch) on individual price records, which ship separately as part of contract-A provenance and are unaffected.

## What broke and how it was fixed

No issues. The changes are transparent to the app:

1. sync-data.mjs removes the four per-day fields from the wire before they ever reach origins.js. The wire is now smaller, nothing breaks.

2. origins.js previously hydrated these four fields with conditional spread operators (safe: reading absent fields returns undefined, so the spread returns an empty object). Now they're simply removed from the code since they read from fields that no longer exist in the source. Testing confirmed no code anywhere reads these five fields: grep found only their definition sites, not their usage sites.

All pricing queries (runtime_pricing.js, FareProvenance.jsx, trip_planner_pricing.js) continue to work unchanged. They read the fields that remain: outbound_fare, return_fare, outbound_estimate, return_estimate, outbound_time, return_time, outbound_carrier, return_carrier, anchor_airport, ground_transport_*.

## What is still open

None. This task completes the contract-A provenance work begun in earlier phases. The wire now ships only the fields the app actually reads: the slim, essential record-level provenance (s, o on merged prices; out_c/ret_c on daily sources) plus the pricing data itself. The per-day metadata (out_o/ret_o/out_x/ret_x) were internal pipeline bookkeeping, and the hardcoded fare_model was never used by any consumer.

## Rollback procedure

```bash
git revert 4b2d8e19f   # undoes origins.js cleanup (re-adds unused spread operators)
git revert 06f188541   # undoes sync-data.mjs field deletion
npm run build && npm run data
```

The fares will increase back to 24.5 MB, and the five fields (out_o, ret_o, out_x, ret_x, fare_model) will reappear in the wire and route objects. Since the app never reads them, there is no user-visible change in behaviour—just the payload overhead this task removed.
