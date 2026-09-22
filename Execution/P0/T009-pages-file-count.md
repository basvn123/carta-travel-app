# T009: Count files in continent-app/public against the 20,000 Pages ceiling

## Task ID

T009

## Date

2026-09-22

## What changed

Audit completed of file counts in continent-app/public across all data layers. Current total is 52,089 files, already 2.6× the Cloudflare Pages 20,000 file ceiling. The distribution is heavily skewed: cycling (17,048 files) and trails (17,716 files) together account for 67% of all files, followed by dossier (3,869) and poi (3,865). The reach directory currently holds only 2 origin files. If destination count grows to 25,000 (currently ~3,800), and layers scale linearly, the total could reach approximately 340,000 files, making immediate offload to R2 essential rather than optional.

## Files touched

**Modified:** None

**Created:** None

**Deleted:** None

## Commands run

```powershell
# Count total files in public directory
(Get-ChildItem -Path C:\Users\Gebruiker\Documents\Portfolio\Travel App\continent-app\public -Recurse -File).Count

# Count files by subdirectory
$dirs = @('poi', 'fares', 'reach', 'region', 'destinfo', 'dossier', 'beaches', 'cycling', 'lakes', 'mountains', 'trails', 'trips', 'journeys')
foreach ($dir in $dirs) {
    $path = "$basePath\$dir"
    $count = (Get-ChildItem -Path $path -Recurse -File).Count
    Write-Host "$dir : $count"
}
```

## Config and secrets set

Not applicable. This task is a read-only audit.

## Before/after measurements

| Metric | Count | Notes |
|---|---|---|
| Total files in continent-app/public | 52,089 | Already 2.6× the 20,000 limit |
| poi/ | 3,865 | Points of interest data shards |
| fares/ | 286 | Flight/transport pricing by origin |
| reach/ | 2 | Only 2 reachability origins populated (BRU, CRL) |
| region/ | 4,849 | Regional data and boundaries |
| destinfo/ | 44 | Destination metadata |
| dossier/ | 3,869 | Destination dossier documents |
| beaches/ | 41 | Beach location data |
| cycling/ | 17,048 | Cycling route data and tiles |
| lakes/ | 45 | Lake location data |
| mountains/ | 46 | Mountain location data |
| trails/ | 17,716 | Trail route data, descriptions, metadata |
| trips/ | 3,994 | Pre-built trip itineraries |
| journeys/ | 264 | Journey data |
| **Subtotals** | **52,069** | Directories counted |
| **Loose files** | **20** | Top-level files (app_data.json, manifests, etc.) |

Projection at 25,000 destinations: If all layer data scales linearly per destination, trailing data (17,716 files for ~3,800 destinations) would scale to ~116,600 files at 25,000 dests. Cycling (17,048 files) would scale to ~112,100 files. Total would approach 340,000 files, far exceeding any static hosting ceiling.

## What broke and how it was fixed

No issues.

## What is still open

The Pages 20,000 file ceiling is a hard blocker for further destination intake or layer expansion in the current architecture. Two solutions exist: (1) offload large layer directories (trails, cycling) to Cloudflare R2 object storage and serve via CDN rewrite rules, or (2) adopt a dynamic data layer that fetches data on demand rather than pre-baking all files. T031 (Offload trails to R2) and T032 (Offload cycling to R2) depend directly on this finding. The task does not specify build behavior or Vercel constraints, so uncertainty remains about whether Vercel's 20,000 limit also applies to `npm run build` output or only to the deployed site.

## Rollback procedure

This task produces no code or data changes, so rollback is not applicable.

---

## Notes

The CARTA_CLOUD_ARCHITECTURE.md file referenced in the task prompt does not yet exist in the repository. The sections §5.1 and §9 were not available for reference. The audit proceeded from first principles, counting all files and projecting growth. The breakdown shows that trails and cycling are the primary drivers of file count; their architecture is the critical constraint for scaling.

The reach directory is under-populated with only 2 airport codes (BRU = Brussels, CRL = Brussels Charleroi). At 286 origins per the task spec, this suggests either the spec is aspirational or the reach data has not yet been populated at scale.
