# Rating v5: merge batches R1 to R4 (owner order, 2026-10-28)

You are running unattended, started by `Execution/_queue/chain_rating_r4b.ps1` after Batch R4's
report was committed. Nobody can answer a question. Never stop to ask: make the conservative
call and write it down. The owner said: "if done commit, merge everything". This overrides the
"do not merge" line in the R4 prompt.

Follow CLAUDE.md (batch rules, no em dashes, no Claude API, never `git stash`). Take one task
number for this merge: the highest in `git log --all --oneline` and every worktree's
`Execution/` folder, plus one (expected T782 or higher).

Do the work yourself, in the foreground. Do not hand work to background agents and do not use
ScheduleWakeup: a headless run stops background agents ten minutes after the turn ends.

## Steps

1. Read the four batch reports in `Execution/P7/` (T754-T756, T757-T760, T761-T762, T763-T766)
   and the `open` rows they raised in `Execution/_OPEN.md`, especially T754-a, T756-b, T761-a.
2. App repo (`continent-app/`, branch `master`): merge `p7-rating-v5-foundation`,
   `p7-rating-v5-scoring`, `p7-rating-v5-profile`, `p7-rating-v5-screens` in that order
   (merge commits, `--no-ff`, message starting `T{n}:`). Any leftover task branch such as
   `p7-rating-v5-screens-t764` is merged only if it holds commits not already in the batch
   branch.
3. Root repo (branch `main`, in the repo root): the same four branches, same order.
   The root working tree has uncommitted changes that are not yours (planner flow files,
   `data/derived/freshness_report.json`, untracked caches). Never discard, stash, reset or
   commit them. If a merge would touch one of those files, stop the merge (`git merge --abort`),
   write why in the report, and leave a register row for the owner.
   Resolve conflicts by keeping both sides' intent; `_OPEN.md` conflicts keep every row, with
   the latest status per ID.
4. On the merged trees do what the reports scheduled for the merge: T754-a (re-score on the
   shared master), T756-b (refresh the place layer), rebuild dossiers after the re-score
   (`build_dossier.py --all`), run `run_pipeline.py` tasks as the reports name them, then
   sync the root repo's `continent-app/` mirror once.
5. Checks: `pytest` on the rating tests, `npm test` in `continent-app/`, the contract check,
   one fast NOPUBLIC build. One browser round on the merged app at phone and desktop width over
   the screens R4's report lists (Playwright, `serviceWorkers: 'block'`). Fix breakages on
   main/master as their own `T{n}:` commits.
6. Push root `main` to `origin` (the box pulls from it). Push `continent-app` `master` only if
   it has a remote. Do not deploy to Pages: deploying is the owner's call; leave a register
   row saying the merge is ready to deploy, with the persona gate 7 result next to it.
7. Write one report `Execution/P7/T{n}-rating-v5-merge.md` from `Execution/_TEMPLATE.md`,
   close the rows this merge resolved, add rows for what is left (T761-a stays open until the
   box stage finishes), and commit report and register together on `main`.
8. Remove the worktrees of the merged branches (`git worktree remove`) only when they have no
   uncommitted changes; keep the branches.
