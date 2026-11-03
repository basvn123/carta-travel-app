# Rating v5: finish Batch R4, merge R1 to R4, bring in the box fee data

Follow CLAUDE.md (batch rules, no em dashes, no Claude API, never `git stash`, stage files by
name, commits start `T{n}:`). The owner decided everything that needs them: make the
conservative call, write it down with a register row, and keep going. Do the work in the
foreground; do not use background agents or ScheduleWakeup (an earlier run lost two agents
that way). The owner says: when done, commit and merge everything.

Read first: `Execution/_queue/R4-rating-v5-screens.prompt.md` (the R4 brief, its task list, its
end check and its report shape), `Execution/P7/T761-T762-rating-v5-profile.md`, the `open`
rows in `Execution/_OPEN.md`, `PRODUCT.md`, `DESIGN.md`, the carta-design skill.

## Already done (do not redo)

- R1 to R3 (T754 to T762) are committed on `p7-rating-v5-foundation`, `-scoring`, `-profile`.
- R4 batch branch `p7-rating-v5-screens` (worktrees `wt/p7-rating-v5-screens-root` and
  `wt/p7-rating-v5-screens-app`) holds, in the app repo:
  - `52f95b2` T764: `lib/taste.js` (taste profile, sign-in merge, link form, learning question), unit tests
  - `2f2ab57` T765: `lib/match.js` (fit, forYou = Q + lambda (F - 0.5), 55% floor, 70% Strong match), config match block, unit tests
  - `f2c6423` T765: persona gate 7, `reports/persona_check_v5.md`: 87 of 120 sensible (72.5%), FAIL against 80%
- R4 root branch has no R4 commits yet (it sits at `416fa93ae`, the R3 decisions).

## 1. Finish Batch R4 (T763, rest of T764, T766)

Two agents were stopped mid-work and left uncommitted edits. Review them with `git diff`, keep
what is right, finish the rest yourself:

- `wt/p7-rating-v5-screens-app` (63 changed files): T763, one rating on every screen
  (App.jsx, browse/* cards, tiles, overview, destination page, practical, beach, cycle,
  around here, prerender pages, ...).
- `wt/p7-rating-v5-screens-t764-app` (branch `p7-rating-v5-screens-t764`, 21 changed files):
  T764's screens: onboarding / StartDialog, ExploreTab, AccountPanel, useAccountSync, the six
  i18n files. Commit there, then merge that branch into `p7-rating-v5-screens`.

Then T766 as the brief describes. T765 is committed but its gate fails: look at why (which
personas miss, which conflict or weight causes it) and fix it if a change stays within the
plan; otherwise leave it failing with a register row and the evidence. Run the static checks
per task, then the one end check on the merged batch branch (phone and desktop width, every
screen the tasks touched). Write `Execution/P7/T763-T766-rating-v5-screens.md` with its register
rows and commit them.

## 2. Merge R1 to R4

Take a task number for the merge (highest in `git log --all --oneline` and every worktree's
`Execution/`, plus one; at least T782).

- App repo `continent-app/` on `master`: merge `p7-rating-v5-foundation`, `-scoring`,
  `-profile`, `-screens` in that order, `--no-ff`, messages starting `T{n}:`.
- Root repo on `main` (the repo root itself): the same four, same order. The root tree has
  uncommitted changes that are not yours (`continent-app/src/planner/flow/CartaTrips.jsx`,
  `LifestyleStep.jsx`, `VisibilityChoice.jsx`, `data/derived/freshness_report.json`, untracked
  caches and queue files). Never discard, stash, reset or commit them. If a merge needs one of
  those files, `git merge --abort`, note it, and leave a register row for the owner.
  `_OPEN.md` conflicts keep every row with the latest status per ID.
- On the merged trees, do what the reports put at the merge: T754-a (re-score on the shared
  master), T756-b (refresh the place layer), then `build_dossier.py --all` (the page reads the
  dossier verdict, so dossiers must follow every re-score), then sync the root's
  `continent-app/` mirror once.
- Checks: rating pytest, `npm test`, the contract check, one fast NOPUBLIC build, one browser
  round on the merged app at phone and desktop width over R4's screens. Fix breakages as their
  own `T{n}:` commits.
- Push root `main` to `origin` (the box pulls from it); push app `master` if it has a remote.
  Do not deploy to Pages: add a register row "ready to deploy" with the gate 7 result next to it.
- Write `Execution/P7/T{n}-rating-v5-merge.md`, close the rows the merge resolved, commit report
  and register together on `main`. Remove merged worktrees only if they are clean; keep branches.

## 3. Box fee data (T761-a)

Box: `carta@46.225.237.75`, key `~/.ssh/carta_orchestrator_ed25519`, repo `/home/carta/carta`.
The harvest is `pipeline/harvest_poi_fees.py --wiki-only` (log `logs/t761_poi_fees.log`,
44,755 POIs, expected done around 06:00 on 2026-10-29).

- Check `pgrep -f harvest_poi_fees.py`. If it is still running, stop here: leave T761-a open
  with the exact steps below written in the row's report text, and say so in your final message.
- If it has finished: confirm it ended cleanly (log, count), `git pull` the merged `main` on the
  box (never discard the box's caches or data), run the `poi_significance` step that re-labels
  POIs with the fee tags plus what T761-a names, copy the results back, run `sync-data`, rebuild
  the dossiers, `npm test`, the contract check, one fast build, and look at one POI page that
  should now say Free. Commit on `main`, push, close T761-a, and write
  `Execution/P7/T{n}-rating-v5-box-fees.md` (its own task number). Do not deploy.

## Finish

Kill any dev or preview server you started. End with: what was committed and merged per repo,
the gate 7 result, what is left open and for whom.
