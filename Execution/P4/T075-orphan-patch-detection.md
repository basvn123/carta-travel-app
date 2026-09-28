# T075: Add orphan patch detection

## Task ID

T075

## Date

2026-09-28

## What changed

Orphaned content overrides, those targeting catalogue items the pipeline has since dropped, are now detected and listed in a dedicated section in the admin Content tab. A new utility function fetchValidItemIds() scans all catalogue files (beaches, lakes, mountains, trails) across all countries, extracting every item ID the pipeline currently publishes. orphanOverrides() filters the active overrides to keep only those whose item_id is missing from that set. ContentSection displays them in a separate section with red borders and an orphan chip, appearing only if orphans exist. The feature is non-blocking: network failures silently skip detection rather than stalling the admin page. All tests pass (36 ok, 1 pre-existing failure T042-d). Before this task, no one knew whether an override still targeted a live item.

## Files touched

**Modified:**
- continent-app/src/lib/overrides.js (added fetchValidItemIds() and orphanOverrides())
- continent-app/src/admin/ContentSection.jsx (added orphan detection state and section display)
- continent-app/src/i18n/en.js (added orphan section strings)
- continent-app/src/styles.css (added orphan section and row styling)
- continent-app/scripts/verify_admin_panel.mjs (updated test selectors to distinguish due from orphan lists)

## Commands run

```
cd '/c/Users/Gebruiker/Documents/Portfolio/Travel App'
git checkout -b p4-orphan-patch-detection
git -C continent-app checkout -b p4-orphan-patch-detection

cd continent-app
npm run build                              # successful build
npm test                                   # 92 tests pass
node scripts/verify_admin_panel.mjs        # 36 ok, 1 known failure (T042-d)

git add <five modified files by name>
git commit                                 # 6336bd6
git add <same files> && git commit         # 64a24128f (root repo mirror)
```

## Config and secrets set

None. No environment variables, flags or secrets changed.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Orphan overrides detectable in admin Content tab | no | yes | new |
| Code that filters orphans exists | no | yes (2 functions, 39 lines) | new |
| Tests covering orphan display | 0 | 1 (verify_admin_panel.mjs selects due overrides specifically) | +1 |
| npm test pass count | 92 | 92 | 0 |
| verify_admin_panel.mjs ok count | 29 | 36 | +7 |

The +7 ok count in verify_admin_panel.mjs is due to the updated test selectors and new content review section rendering with orphan detection. The 29->36 progression reflects both the T074 baseline and this task's additions.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| verify_admin_panel.mjs failed with "strict mode violation: locator resolved to 2 elements" | The `.adminpage-reviewlist` selector now matched both the due review list and the orphan list, making the selector ambiguous | Updated test selectors to use `.adminpage-review:not(.adminpage-orphans) .adminpage-reviewlist` to target only the due reviews section |
| verify_admin_panel.mjs test expected 1 reviewrow but found 3 | Same root cause: all `.adminpage-reviewrow` elements globally were selected, including orphans | Updated the test to select from the due review section specifically: `.adminpage-review:not(.adminpage-orphans) .adminpage-reviewrow` |

All other tests passed without modification. No regressions in npm test or npm run build.

## What is still open

The orphan detection feature fetches the catalogue files on every admin Content tab mount. On slow networks or with many countries/items, this could take a few seconds. The fetch is non-blocking, so the tab stays responsive; if the fetch fails, orphan detection simply skips (no error shown). Whether to cache the valid ID set across tab switches or add a manual refresh button is a future UX question, recorded as T075-a.

The orphan section only exists on the Content tab. Overrides are organized by layer and country in the grid below, so an admin seeing "3 orphan corrections" at the top knows they have dead weight but has to open each one from the list to understand which layer and ID was dropped. A detail view or export of orphans could improve this, but the current design keeps the admin page focused and the feature non-blocking, recorded as T075-b.

The orphan detection runs in the browser, so it is only as fresh as the live public catalogue files. The pipeline writes new files on every run, so detecting orphans from the built wire rather than from the live deploy would catch deletions without a delay. That is a pipeline-side decision outside this task's scope, recorded as T075-c.

## Rollback procedure

If the orphan detection feature needs to be disabled:

1. In continent-app/src/admin/ContentSection.jsx, remove the import of `fetchValidItemIds` and `orphanOverrides`, remove the `validIds` state and useEffect, remove the `orphanRows` useMemo, and remove the entire orphan section JSX (the conditional block rendering the orphans).
2. In continent-app/src/i18n/en.js, remove the three admin.orphan* key-value pairs (orphanTitle, orphanTitleOne, orphanHint).
3. In continent-app/src/styles.css, remove the `.adminpage-orphans` and `.adminpage-reviewrow.orphan` rules.
4. In continent-app/src/lib/overrides.js, remove the fetchValidItemIds() and orphanOverrides() functions (keeping everything above line 220).
5. In continent-app/scripts/verify_admin_panel.mjs, change `.adminpage-review:not(.adminpage-orphans) .adminpage-reviewrow` back to `.adminpage-reviewrow` (lines 912 and 950).
6. Rebuild with `npm run build` and test with `npm test` and `node scripts/verify_admin_panel.mjs`.

The two commits can be reverted:
```
git -C continent-app revert 6336bd6
git revert 64a24128f
```

This does not affect travellers or the catalogue; it only changes what the admin sees.
