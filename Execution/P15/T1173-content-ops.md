# T1173: Content operations, runbook, pipeline overrides and the admin Overrides tab (ROADMAP I13, round 2 session S89)

## Date

2026-11-06

## What changed

Hand corrections to the catalogue now have a written procedure and a durable path. `docs/runbooks/content-ops.md` says who updates which content (place facts, intros, photos, beaches, lakes and mountains, trail text, food, bed and flight prices), from which source, how often (the `cadence` of each `run_pipeline.py` task), and what a correction looks like step by step. `data/overrides/{dest,beach,lake,mountain}.json` (versioned in git, empty today) hold corrections as entries `{id, patch, who, when, why, source, review_by?}`; `pipeline/apply_overrides.py` refuses a file whole when an entry lacks who, when, why or source, sets a computed price or score field, changes the id, carries an en or em dash, or sets one field twice, and otherwise writes each patch into the master `app_data/app_data.json` (dest) or the served layer files (country file plus the summary copies in `index.json` and `top.json`). `run_pipeline.py` runs it after the task loop and before the ship in every run, so a correction survives a rerun of the task that owns the field (test). The admin page has a new Overrides tab that lists every entry with its last outcome (applied, unchanged, orphan, bad path) and drafts a new one under the same rules, giving the layer file to download, the same change as an RFC 6902 JSON Patch, and the pull request text; it writes no database row and needs no migration. The existing mechanism was found and reused rather than replaced: `content_overrides` (migrations 018 and 043) stays the live, no-deploy path in the Content tab; the new file uses its layer names and wire ids, so a live patch is promoted by copying it into the file.

## Research

Existing override mechanisms, found before adding one:
- `content_overrides` table (migrations 018, 043), merged by the app at load (`continent-app/src/lib/overrides.js`), edited in the admin Content tab. Live, whitelisted to name, image, blurb, hidden and featured, with status, review date and reason. It is not a pipeline step and changes no shipped data, so it cannot be "applied last by the pipeline"; it was kept as the live path and its vocabulary (layers, wire ids, `patch`) reused.
- Domain lists in code: `pipeline/gem_category_overrides.py` (gem categories), `FAME_ARTICLE_OVERRIDES` (`run_pipeline.py`), `TITLE_OVERRIDES` (`pipeline/harvest_images.py`), trail curation in `pipeline/trails/curate.py`. Each covers one field of one task and carries no who, when, why or source; none generalises.

Chosen: one JSON file per layer (data, reviewable in a pull request, no code change per correction), applied by one step at the end of the run. The admin side follows T1142's pattern (a build-time snapshot, English only, owner only). Output formats: the whole layer file (drop-in) plus RFC 6902 (https://www.rfc-editor.org/rfc/rfc6902) for tools that apply patches. No library added.

## Files touched

- Created: `docs/runbooks/content-ops.md`, `data/overrides/dest.json`, `data/overrides/beach.json`, `data/overrides/lake.json`, `data/overrides/mountain.json`, `pipeline/apply_overrides.py`, `tests/test_apply_overrides.py` (19 tests), `continent-app/src/components/admin/PipelineOverrides.jsx`, `continent-app/src/components/admin/pipelineOverrides.js`, `continent-app/src/admin/pipelineOverrides.json` (the snapshot), `continent-app/tests/pipelineOverrides.test.mjs` (6 tests), this report.
- Modified: `run_pipeline.py` (the hook only, before the ship), `continent-app/src/admin/AdminPage.jsx` (section `overrides` and its route), `continent-app/src/i18n/en.js` (one key, `admin.nav.overrides`), `continent-app/src/styles/admin/22-account-admin.css` (five rules for the form and its output, tokens only), `docs/runbooks/README.md` (index row), `docs/HANDBOOK.md` (new section "Hand corrections (pipeline overrides)" and its contents line), `ROADMAP.md` (I13 status), `Execution/_OPEN.md` (rows T1173-a to T1173-i appended).

## Commands run

```
python -I pipeline/apply_overrides.py --check                       # overrides OK: 0 entries in 4 layers
python -I pipeline/apply_overrides.py                               # no overrides
python -m pytest tests/test_apply_overrides.py -q                   # 19 passed
ruff check pipeline/apply_overrides.py tests/test_apply_overrides.py run_pipeline.py
# real-data check on a scratch copy of public/{beaches,lakes,mountains} (deleted after):
python -I pipeline/apply_overrides.py --root <scratch> --snapshot   # lake: 1 applied, 0.25 s
python -I pipeline/apply_overrides.py --root <scratch>              # lake: 1 unchanged
cd continent-app && npm test                                        # 1617 pass, 0 fail
npx eslint src/components/admin/ src/admin/AdminPage.jsx tests/pipelineOverrides.test.mjs
node scripts/ci/design-lint.mjs                                     # 0 new
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
node scripts/css-routes.mjs --check ../.fastbuild/assets            # 942 route selectors, none overridable
python -I scripts/docs/check_entry_points.py                        # 199 paths OK
python -I scripts/docs/drift.py                                     # 0 drift
python -I scripts/docs/config_reference.py --check                  # OK
```

The before figures come from a detached worktree of `origin/p15-round2` with the same fast build and `npm test` (removed after).

## Config and secrets set

None. New optional variable: `CARTA_REPO_ROOT` (or `--root`) points `apply_overrides.py` at another tree, as `scripts/docs/drift.py` does.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Pipeline override path with who, when, why and source per entry | none | `data/overrides/` (4 layers), applied last each run | new |
| Overrides in the files | n/a | 0 (no correction was invented) | 0 |
| Override survives a rerun of the owning task | no mechanism | yes (`test_override_wins_and_survives_a_rerun`, `test_layer_files_and_their_summary_copies`) | new |
| Apply step time on the shipped beaches, lakes and mountains (one lake override) | n/a | 0.25 s | new |
| Served file after the apply, apart from the patched field | n/a | byte-identical (`lakes/AT.json`, `lakes/top.json`) | 0 |
| Admin tabs | 10 | 11 (Overrides) | +1 |
| Admin chunk `AdminPage-*.js` (fast build) | 139,548 B (30,605 B gzip) | 153,457 B (34,641 B gzip) | +13,909 B (+4,036 B gzip) |
| Admin sheet `AdminPage-*.css` (fast build) | 12,651 B | 13,405 B | +754 B |
| `npm test` passing | 1611 | 1617 | +6 |
| Override pytest | 0 | 19 passed | +19 |
| Runbooks | 8 | 9 | +1 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `python -I pipeline/apply_overrides.py` could not import `pipeline_io` | `-I` drops the script folder from `sys.path` | the module adds its own folder when run as a script |
| design-lint failed: raw `<button>`, `--paper-dim`, a literal radius and font size, and en and em dash characters | the file writer turned the unicode escapes for the two dashes into the characters themselves; admin views must use `ui/Button` and current tokens | escapes restored; `Button` for every action; the layer filter is a `<select>` instead of a raw radio segment; `--surface-sunken`, `--radius-control`, `--text-caption` |
| `css-routes --check` flagged `.adminpage-err` against `.adminpage-fine` | the field error span carried both classes, and the two rules live in sheets whose order differs | the error span carries `adminpage-err` only |
| Two primary buttons in one view | Check draft and Download were both primary | Download is secondary |
| `tests/test_pipeline_code_fixes.py` does not collect here | `psycopg` and `osmium` are missing in this container | not related to this task; CI installs `requirements.txt` |

## Screens checked

Admin, Overrides tab, at 1440 x 900 and 390 x 844, in Chromium on the dev server with the panel mounted alone inside `.adminpage .adminpage-body` and the real stylesheets (the full app cannot load data in this container, see T1142-e). DOM check at both widths: 1 listed override from a fixture, 6 field problems named on an empty "Check draft", after filling the form `data-draft="ready"`, the entry shown, "Download lake.json" saves a file with `layer: lake` and one entry, "Download JSON Patch" saves `[{op: add, ...}]`, the layer filter set to Lakes shows the empty state, buttons 44 px tall, no sideways page scroll, no page errors. Screenshots stayed in the scratch folder. `continent-app/tests/pipelineOverrides.test.mjs` renders the list, the orphan state, a ready and a failing draft, and checks the route and nav key. For the end check: the Overrides tab through the real admin flow at phone and desktop width, where the data host is reachable.

## What is still open

- T1173-a: MAP.md does not name the new step, files or tab; MAP.md was outside this task's files.
- T1173-b: trails and cycle routes have no pipeline override file; the trail pipeline was out of scope (S97 works there).
- T1173-c: the dossier, search and Ask indexes are built from the master earlier in the run, so a new dest correction reaches them one run later.
- T1173-d: `verify_admin_panel.mjs` has no Overrides step, and cannot run in this container anyway.
- T1173-e: the nav label is English only in the five other catalogues (falls back), as `admin.nav.health` is.
- T1173-f (owner): decide which live `content_overrides` rows to promote into the files.
- T1173-g: the tab reads a build-time snapshot, which the box's weekly reset puts back (as T1142-d).
- T1173-h: the tab does not flag entries past `review_by` and does not show the live rows beside the file entries.
- T1173-i (owner): ROADMAP I13 asks for an editor that writes; this task only drafts (the brief ruled out database writes and migrations). How a write should land (a pull request opened from the admin page, or a staging table the pipeline reads) is a product decision.

## Rollback procedure

`git revert` the T1173 commit. Nothing is one-way: no wire, schema, migration or deploy changed, and the override files are empty, so no shipped data differs. Reverting removes the hook, so a later run no longer applies any override added after this task; corrections already written into the master or the layer files stay until the owning task rewrites them.

## Owner steps (for the checklist)

- [T1173-f] Promote lasting live corrections | live `content_overrides` rows hold fixes that vanish if the table is reset and are not in git | in the admin Content tab, list the rows; for each that should hold for good, draft it in the Overrides tab, merge the pull request, run the pipeline and push the data, then clear the live row | docs/runbooks/content-ops.md section 2
- [T1173-i] Decide how an admin edit should be written | ROADMAP I13 asks for an editor that writes, this task drafts only | choose: a pull request opened from the admin page (needs a GitHub token on an Edge Function), or a staging table the pipeline reads at run time (needs a migration) | ROADMAP.md I13
