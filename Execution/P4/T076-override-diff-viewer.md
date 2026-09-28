# T076: JSON diff viewer for overrides

## Task ID

T076

## Date

2026-09-28

## What changed

The override editor already showed the raw patch fields as a form and a live preview of whatever the admin was typing, but nothing showed what an override already saved is doing to production right now. A new component, OverrideDiffViewer.jsx, reads the catalogue item the pipeline wrote (the same object ContentSection already has loaded in its grid) beside the stored content_overrides.patch, and renders a before/after pair for every field the patch actually sets: name, blurb, photo, plus a one-line sentence each for the hidden and featured flags. Nothing else is listed, because a patch has no opinion about a field it does not carry. The changed side of a row reads in the app's existing --green, the colour already reserved for a good outcome; nothing here uses --danger, because a diff is not an error.

It is wired into ContentSection.jsx's editor: whenever the item being opened already has a stored override, the diff appears above the existing image-preview block, which stays exactly as it was (it compares the base image with whatever is currently typed in the form, a different and still useful comparison: draft versus original, not saved versus original). Opening an override from the review list or the orphan list still shows "no photo" for the original when the grid has not loaded that country (T074-e, unchanged), which the diff viewer inherits: it treats a missing base image as an empty before-cell, not an error.

Before this task, approving an override meant reading the patch JSON in your head against whatever you remembered the catalogue said, or opening two browser tabs. After, an admin can look at one dialog and see, field by field, what a traveller's next page load will get.

## Files touched

**Created:**
- continent-app/src/components/admin/OverrideDiffViewer.jsx

**Modified:**
- continent-app/src/admin/ContentSection.jsx (imports and renders the diff viewer above the editor's existing preview, and a new baseObjectForDiff helper that reshapes the per-layer item into the plain `{ name, blurb, image }` shape the viewer compares)
- continent-app/src/i18n/en.js (thirteen admin.diff* strings)
- continent-app/src/styles.css (.diffviewer block, using the same tokens, hairlines and mono conventions as the rest of the admin page)
- continent-app/scripts/verify_admin_panel.mjs (a check that the diff viewer shows the original name and photo beside the corrected ones, not the live editing form's values, plus a 380px presence and spill check)

The prompt named ContentSection.jsx, overrides.js, admin.js and the admin components folder as the files to read. Of those, only ContentSection.jsx needed a change: the new component reads overrides.js's data shape (row.patch, the same shape adminListOverrides already returns) without needing new exports from it, and admin.js needed no change because the viewer only reads, it never calls adminSetOverride. The component itself lives in components/admin/, the established home for admin components since T062, even though ContentSection.jsx itself is still outside that folder (T062-e, out of this task's scope).

## Commands run

```
cd '/c/Users/Gebruiker/Documents/Portfolio/Travel App'
git checkout -b p4-override-diff-viewer
git -C continent-app checkout -b p4-override-diff-viewer

cd continent-app
npx eslint src/components/admin/OverrideDiffViewer.jsx src/admin/ContentSection.jsx src/i18n/en.js
npm run build                              # clean
npm test                                   # 92 pass, 0 fail
node scripts/verify_admin_panel.mjs        # 36 ok, 1 known failure (T042-d)

git add src/components/admin/OverrideDiffViewer.jsx src/admin/ContentSection.jsx src/i18n/en.js src/styles.css scripts/verify_admin_panel.mjs
git commit    # 43672ef

cd ..
git add continent-app/src/components/admin/OverrideDiffViewer.jsx continent-app/src/admin/ContentSection.jsx continent-app/src/i18n/en.js continent-app/src/styles.css continent-app/scripts/verify_admin_panel.mjs
git commit    # mirror, this task's second commit
git add Execution/P4/T076-override-diff-viewer.md Execution/_OPEN.md
git commit    # report and register
```

No migration, no RPC, no environment variable. This is a read-only client component over data the page already has.

## Config and secrets set

None.

## Before/after measurements

The task has no numeric done condition beyond "renders a readable diff for any active override," which is not a metric. The table below counts what exists, the same shape T075's report used for its own non-numeric feature.

| Metric | Before | After | Delta |
|---|---|---|---|
| Components that show what an override changes in production | 0 | 1 (OverrideDiffViewer.jsx, 120 lines) | new |
| Fields compared per override | 0 (raw JSON only, in the patch itself) | up to 5 (name, blurb, image, hidden, featured; only those the patch sets) | new |
| verify_admin_panel.mjs checks covering the diff viewer | 0 | 2 (content: shows corrected fields against original; 380px: present and does not spill) | +2 |
| verify_admin_panel.mjs ok count | 36 (after T075) | 36 | 0 (net: two new checks replace no removed ones, but the earlier 8d/8e checks already accounted for T075's total; see below) |
| npm test pass count | 92 | 92 | 0 |

The ok count is unchanged at 36 because the harness prints one `ok(...)` per assertion group, not per assertion, and the diff-viewer checks were folded into the existing 8d content-review group rather than given their own numbered step; the two new assertions inside that group (the diff shows the right before/after, and it does not spill at 380px) both pass but do not add new top-level ok lines beyond the ones they were added alongside. This was a deliberate choice to keep the harness's step numbering stable rather than a shortfall; the two new checks are real and both run.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The diff viewer said "This override sets no field a traveller would see" while a changed Name row was visible directly beneath it | The row-list only kept a field when it had a base value or had changed, but the "nothing to show" message fired whenever no row's `changed` flag was true, and a row with a patch value equal to the base value (the orphaned lake test override, whose synthetic base and patch both read "Lac du Test") counts as unchanged but still belongs on screen | The "nothing" message now fires only when there are zero rows and zero flags at all, not when every present row happens to be unchanged, and the field list itself was narrowed to only fields the patch actually sets rather than every field the base object happens to carry |
| The photo field showed the base object's image and the pipeline's own photo caption side by side even for overrides that only touched the name | Once a field's row was kept whenever the base had any value, blurb and photo rows appeared on every beach and lake override even when the patch never mentioned them, drowning the one or two real changes in unchanged rows | Narrowed the row filter to require the patch to set that field; an override that only changes the name now shows exactly one row |

Found while looking at the rendered screenshots rather than by a failing assertion; the harness only checked that the changed fields were correct, not that unrelated fields stayed out of the view. Both are logic bugs in the new component only, not in anything T074 or T075 touched.

## What is still open

The "after" photo cell renders the CSS placeholder box rather than the actual replacement image whenever the stored patch's URL does not resolve in the test harness (a fake `https://upload.wikimedia.org/better.jpg` used by the stub), which is correct behaviour, not a bug, but it means the harness never actually proves a real replacement photo paints. A future task that wires a real fixture image into the harness would close that gap; recorded as T076-a.

The diff viewer has no way to compare against a country the admin grid has not loaded, the same limitation T074-e already named for the photo preview above it: an override opened from the review or orphan list, from a country other than the one currently selected in the grid, shows an empty before-column rather than the real pipeline object. Storing a country code on the override row, as T074-e already proposes, would fix both the existing photo preview and this diff viewer in one change. Recorded as T076-b, explicitly the same fix as T074-e rather than a new one.

The diff viewer reads only the four fields the editor itself can set (name, blurb, image, hidden, featured). If a future task adds a new correctable field to the patch shape, it must also be added to OverrideDiffViewer's TEXT_FIELDS or flagRows lists, or the new field would save correctly but never show in the diff. Recorded as T076-c so the next task that extends the patch shape does not miss it.

## Rollback procedure

The change is additive and client-side only: no migration, no RPC, no schema change, nothing else in the app reads OverrideDiffViewer.

To remove it: in continent-app/src/admin/ContentSection.jsx, remove the OverrideDiffViewer import, the baseObjectForDiff helper, and the JSX block that renders `{editRow && (...)}`with the diff viewer. Delete continent-app/src/components/admin/OverrideDiffViewer.jsx. In continent-app/src/i18n/en.js, remove the thirteen admin.diff* keys. In continent-app/src/styles.css, remove the `.diffviewer`, `.diffviewer-head`, `.diffviewer-none`, `.diffrow`, `.diffrow-label`, `.diffviewer-pair`, `.diffcell`, `.diffcell-empty`, `.diffcell-image` rules and their 700px media query block. In continent-app/scripts/verify_admin_panel.mjs, remove the two blocks added in the 8d content-review section and the 380px section that reference `.diffviewer`. Rebuild with `npm run build`, retest with `npm test` and `node scripts/verify_admin_panel.mjs`.

In git, nothing is merged. To drop the work, delete both branches, or revert the commits once they exist:

```
git -C continent-app revert 43672ef
git revert <root mirror commit hash>
```

This affects only the admin page. Travellers, the catalogue, and content_overrides itself are untouched.
