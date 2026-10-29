# T852: merge trip page v4 (Batches A to D), no deploy

## Task ID

T852

## Date

2026-10-29

## What changed

The owner chose "Merge, no deploy" in chat. The four stacked batch branches of the trip page v4 are merged:
- continent-app `p15-trip-page-v4-d` into `master`, as `faa4958`;
- root `p15-trip-page-v4-d` into `main`, as `722e6ca42`.

Both are `--no-ff` merges. The branch carries Batches A to D (T835 to T851, with T844 and T848) on top of the board (T834), so every task stays its own commit and can be reverted alone. Neither base had moved since the batches branched (app `effacb5`, root `6dfa7a734`), so nothing conflicted.

Nothing was pushed and nothing was deployed: `origin` and Pages production are as T833 left them (Pages `f88ea7bc`).

## Files touched

No file was edited in this task; the merges bring in the batches' files (see the four batch reports). Created:
- `Execution/P15/T852-merge-trip-page-v4.md`
- `Execution/P15/T852-walk/walk-*.json`

## Commands run

- `git -C continent-app checkout master` and `git merge --no-ff p15-trip-page-v4-d`.
- In the root: `git checkout main` and `git merge --no-ff p15-trip-page-v4-d`. The first checkout refused, because the root saw the app files the app checkout had just rewritten as changed. `git diff` showed no content difference, only stale stats. A `git add` of exactly the batch files refreshed the stats and staged nothing (`git diff --cached` empty). Then the checkout and merge ran.
- On merged master:
  - `npm test`: 1029 of 1029.
  - The NOPUBLIC fast build: 136 assets.
  - `token-contrast`: 0 under the floor.
- The four batch walks on that build plus `public/` (`serve-a.mjs`, port 5840), at 390, 1024 and 1440 px. Results, no page or console errors in any:
  - walk A (Batch A): 109 of 109;
  - walk B: 81 of 81;
  - walk C: 69 of 69;
  - walk D: 48 of 48;
  - 307 of 307 in all.

  Walk D first missed one step at 1440 px, "kept after a reload". The walk waited a fixed 3 s after the reload, and at that width the trip page came back a little later. The walk now waits for the trip page (up to 20 s). The rerun passed at all three widths; the app was not changed.

## Config and secrets set

None.

## Before/after measurements

Not measured.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The root's `git checkout main` refused, naming 28 app files as local changes | The app repo's checkout rewrote those files' line endings, and the root's stats went stale; their content was unchanged (`git diff` empty) | `git add` of exactly those files refreshed the stats and staged nothing; the checkout then ran |

Also in "What broke": walk D's reload step (see Commands run), a walk timing, fixed in the walk.

## What is still open

- **T852-a, before any deploy.**
  - `css-routes --check` on the merged build reports 45 problems in the planner route sheets (29 in `planners/11-trip-planner.css`, which holds the removed editor's styles). T833 had brought this to 1.
  - The deploy step must remove the dead editor rules (with T838-b) or hold the flagged ones with `css-routes --hold`, as T833 did, and then prove it.
- **T852-b.** `npm run ci:routes` (the URL-state check, `scripts/ci/check-routes.mjs`) fails on `pm`, `pr`, `pv`, `px` and `ty` (price mode and range keys that neither `encodeState` nor `seedQuery` produce). No commit in this merge touches `urlState.js` or that script, so it predates the trip page work. It belongs to the price work that added those keys.
- **Optional.** The batch branches `p15-trip-page-v4-a` to `-d` stay in both repos until the owner wants them removed.

Earlier rows stay as written; the four batch reports hold their reasoning.

## Rollback

- continent-app: `git -C continent-app reset --hard effacb5` on master. Nothing is pushed, so nothing else needs undoing.
- Root: `git reset --hard 6dfa7a734` on main. That also rewrites the root's mirror of the app files, so reset the app first.
- One task alone: `git revert` its commit, or `git revert -m 1` the merge commits for the whole of v4.
