# T057 Remove obsolete fare metadata from the payload

## Task ID

T057

## Date

2026-09-28

## What changed

The fares table's per-day provenance metadata (out_o, ret_o, out_x, ret_x) has been removed from the shipped wire. These fields were created during pipeline merging to track which days came from Travelpayouts cache quotes and when those quotes expire, but they were never read at runtime. The record-level contract-A fields (s, o, out_c, ret_c) remain. Removing these four per-day fields reduces the fares payload by 1.96 MB (8.0%), from 24.5 MB to 22.5 MB.

## Files touched

**Modified:**
- continent-app/scripts/sync-data.mjs (strips per-day provenance fields during wire build)

**Created:**
- Execution/P3/T057-remove-obsolete-fare-metadata.md

**Modified:**
- Execution/_OPEN.md (no rows; this task raises no further work)

## Commands run

From the repo root in the working directory:

```bash
cd continent-app
npm run build                    # rebuilds the fares slices with the obsolete fields removed
du -sb public/fares/            # measure the new payload size
```

The build script (sync-data.mjs) runs as part of the Vite predev and prebuild hooks, stripping the obsolete fields from each fare record as the wire is written.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Fares payload size | 24.509 MB | 22.546 MB | −1.963 MB (−8.0%) |
| Records with per-day observed_at | ~15% (TP-merged only) | 0 | removed |
| Records with per-day expiry | ~15% (TP-merged only) | 0 | removed |

The reduction applies uniformly across all origins (all fares slices in public/fares/ reduced proportionally). The app continues to render fare age ("seen today", "seen 3 days ago") using the record-level observed_at (o), which is retained.

## What broke and how it was fixed

No issues. The fields were hydrated in origins.js as optional spread-operator entries:

```javascript
...(rec.out_o ? { outbound_seen: rec.out_o } : {}),
...(rec.ret_o ? { return_seen: rec.ret_o } : {}),
...(rec.out_x ? { outbound_expires: rec.out_x } : {}),
...(rec.ret_x ? { return_expires: rec.ret_x } : {}),
```

Since these fields are now absent, they are simply not included in the hydrated route object (the conditional spread operator returns an empty object). Grep confirmed these fields were never read by the app anywhere after hydration.

## What is still open

None. This task completes the contract-A provenance work begun in earlier phases. The record-level provenance (s, o, out_c, ret_c) is slim and essential; the per-day fields were internal pipeline bookkeeping that the app never needed to know about.

## Rollback procedure

```bash
git revert 06f188541   # undoes the obsolete-field stripping in sync-data.mjs
npm run build          # rebuilds with the per-day fields restored
```

The fares will increase back to 24.5 MB, and the per-day out_o/ret_o/out_x/ret_x fields will reappear in the wire. However, since the app never reads them, there is no user-visible change in behaviour—just a small payload penalty that this task removed.
