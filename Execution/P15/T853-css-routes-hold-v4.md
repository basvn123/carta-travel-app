# T853: keep the CSS route split proven for the trip page v4 deploy

## Task ID

T853

## Date

2026-10-29

## What changed

The owner asked, in chat ("Yes, get it ready"), to make the merged trip page v4 ready to deploy without deploying it.

- **The problem.** The merge (T852) left 45 `css-routes` problems in the planner route sheets. Most were in `planners/11-trip-planner.css`, where the removed editor's rules now load after rules that could override them.
- **The fix.** `css-routes --check --hold` held the 33 flagged route selectors in the first paint (`src/styles/planners-held.css`), the same proven fix T833 used. 108 lines moved and none changed.
- **The result.** The check is back to the one problem T833 left (`88-pf2-wizard.css`, register row T833-a), and the production Pages build passes.

Nothing was pushed or deployed.

## Files touched

**Modified (continent-app):**
- `src/styles/planners-held.css`
- `src/styles/planners/11-trip-planner.css`
- `src/styles/planners/12-guided-trip.css`
- `src/styles/planners/13-day-planner.css`
- `src/styles/planners/18-detail-panel.css`
- `src/styles/planners/19-guide-ratings.css`
- `src/styles/planners/67-v6-tripplanner.css`

**Created (root):**
- `Execution/P15/T853-css-routes-hold-v4.md`
- `Execution/P15/T853-walk/walk-*.json`

**Commits:**
- continent-app: `49ee3fd` on `p15-trip-page-v4-routes`, merged into `master` as `d195640`.
- Root: the sync and this report on `main`.

## Commands run

1. `node scripts/css-routes.mjs --check <NOPUBLIC build>/assets --hold`: held 33 route selectors.
2. The NOPUBLIC build again, then `--check`: 1 problem (T833-a).
3. `npm test`: 1029 of 1029.
4. `npm run build:pages`: PASS, 277 files (19,723 under the ceiling), the largest file within 25 MiB.
5. `node scripts/css-routes.mjs --check dist/assets` on that build: 1 problem (T833-a).
6. The four trip page v4 walks on the held build plus `public/` at 390, 1024 and 1440 px: 109, 81, 69 and 48, so 307 of 307, with no page or console errors.
7. **The commit.** `git checkout -b` could not write `.git/HEAD`: another process held it open ("in use by another process"). So the commit and the merge were made without moving HEAD: `write-tree`, `commit-tree` and `update-ref`, as T833 did. The index already matched the committed tree, so the working tree is clean.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| `css-routes` problems | 45 (after the T852 merge) | 1 (T833-a, pre-existing) |
| Pages files | not built | 277 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| `git checkout -b` and `git checkout` failed with "unable to write symref for HEAD" | Another process held `.git/HEAD` open | The commit and merge made with `commit-tree` and `update-ref`, which do not write HEAD |

## What is still open

- The held rules include the dead editor styles. Removing them stays with T838-b, which a later css-routes run can prove.
- `design-lint` counts more legacy-token lines in `planners-held.css`, because the moved rules carry their old tokens. design-lint is not part of `npm run ci`.
- T852-b (the URL-state check) is unchanged and predates this work.
- **To deploy** (the owner's call): push app `master` and root `main`, then `npm run build:pages` and the Pages upload, as T833 did.

## Rollback

`git -C continent-app reset --hard faa4958` on master, and revert the T853 commit in the root. Nothing is pushed.
