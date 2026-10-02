# Execution Report: T132

## Task ID

T132

## Date

2026-10-02

## What changed

Verified that no s2maps.eu cloudless Sentinel-2 tiles or Esri World Imagery are currently in use in the Carta codebase. The map infrastructure uses CartoDB's Voyager basemap style exclusively, which ships CartoDB's own raster tiles. No layer, pipeline stage or app component references the restricted tile sources identified in the licence audit.

## Files touched

**Modified:**
- None.

**Created:**
- None.

**Deleted:**
- None.

## Commands run

None. This task involved searching and verifying existing code, not making changes.

```
grep -r "s2maps" . --exclude-dir=node_modules --exclude-dir=.git --include="*.py" --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
grep -r "mapterhorn\|esri.*imagery\|sentinel" continent-app/src --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
grep -r "orthophoto\|imagery\|tile" pipeline/ --include="*.py"
grep -r "map.*style\|style.*json\|maplibre\|raster-dem" continent-app/src --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx"
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Result |
|---|---|
| s2maps.eu references found | 0 |
| Sentinel-2 cloudless tile references | 0 |
| Esri World Imagery references in app | 0 |
| Basemap source in use | CartoDB Voyager (cartocdn.com) |
| Terrain/DEM sources referenced | Copernicus DEM (pipeline only, not shipped) |
| View rendering code found | None (not implemented yet) |

## What broke and how it was fixed

No issues. No changes were made; verification only.

## What is still open

None. The current implementation has no licence trap. CartoDB's Voyager basemap style uses CartoDB's own raster imagery, which is appropriately licensed for commercial display.

Future work will implement synthetic view rendering as documented in carta-destinations-enhancement-spec.md section 2.3. That implementation will require careful sourcing of orthophoto layers per country (section 2.3 lists the open sources for each region). This task documents the current state so that future terrain-render and orthophoto-drape work starts from a clean baseline and applies the licence rules in section 2.3.

## Rollback procedure

Not applicable. No code or configuration was changed.

---

## Notes

The Sentinel-2 CloudLess free tiles at s2maps.eu carry a CC BY-NC-SA (non-commercial) licence. Shipping them would breach Carta's commercial distribution rights. The enhancement spec correctly identifies this as a trap to avoid, and names the solution: use raw Sentinel-2 imagery (free, commercial OK) or pay EOX for processed tiles.

Current state: safe. CartoDB Voyager uses CartoDB imagery. When view rendering is implemented (likely in Phase B imagery work), the sourcing rules in carta-destinations-enhancement-spec.md section 2.3, table rows, must be followed exactly: named orthophoto services for about twenty countries where open sources exist, raw Sentinel-2 for everywhere else. The trap is worth recording here because the free cloudless tiles are the obvious reach-for when building that feature.

Esri World Imagery is similarly restricted: it is licensed only for use inside Esri-approved applications. This is also not currently used and must not be introduced.
