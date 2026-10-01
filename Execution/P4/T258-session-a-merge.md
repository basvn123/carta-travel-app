# T258: Every task branch merged into main, in both repositories

## Task ID

T258

## Date

2026-10-01

## What changed

Since the `prod-2026-09` baseline, every task from T001 to T077 had lived on
its own stacked branch, and `main` (both locally and on `origin`) had fallen
behind. This task is step 8 of `_OPEN-MASTER.md` stage 1: merge them all, then
add session A's own fixes (T253 to T257) on top.

Root repository. The p0 to p4 stack was linear: every task branch was already
an ancestor of `p4-open-master-rewrite` except three side branches holding
only reports. `main` was fast-forwarded to the stack tip. Then
`p2-stripe-price-audit` (T030) and `p2-stripe-purchase-e2e` (T031) were merged
with `--no-ff`, because their reports and `supabase/functions/checkout/test_purchase_e2e.md`
were missing from the stack. So was `p0-arm64-coverage-audit` (T006), whose
report was already present with identical content. Session A's branches were
then merged one by one: T253, T254, T255 (twice, the second a register fix),
T257, T256. `main` is now 193 commits ahead of `origin/main` (`8b53babed`):
179 commits and 14 merges. Every local branch whose name starts with `p` is
an ancestor of `main`.

`explore-v4` was not merged. It predates the Execution plan, it is not one of
the p0 to p4 task branches, and it differs from `main` in 17,074 files. It is
on `origin` as it is.

App repository (`continent-app/`, its own git tree, no remote). Its `master`
was fast-forwarded to `p4-override-diff-viewer` (T077's tip), which already
contained every branch. Session A's app branches (T254, T257, T256) were then
merged into it. Every branch is an ancestor of `master`. The root's tracked
copy of `continent-app/` matches the app repository's tree in content. 276
files differ only in line endings, checked file by file with CRs stripped.

`npm run build` passes from root `main` (`built in 45.71s`). ESLint is clean
on `src/i18n/en.js`, the duplicate key T074-f flagged being gone.

Commit `4b2d8e19f` still carries eight tasks' work under a T057 message. It
stays in history as a recorded attribution defect (T062-a), as the plan says.

## Files touched

**Created:**
- Execution/P4/T258-session-a-merge.md

**Modified:**
- Execution/_OPEN.md (P2-merge closed)

No code: the merges carry the task branches' own commits.

## Commands run

```
git checkout main && git merge --ff-only p4-open-master-rewrite
git merge --no-ff p2-stripe-price-audit
git merge --no-ff p2-stripe-purchase-e2e
git merge --no-ff p0-arm64-coverage-audit
git -C continent-app checkout master && git -C continent-app merge --ff-only p4-override-diff-viewer
# then, per session A task: git merge --no-ff p4-<slug> in each repository it touched
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/p*); do
  git merge-base --is-ancestor $b main || echo "outside: $b"; done      # prints nothing
cd continent-app && npm run build
```

The push is separate and waits for the owner's yes (stage 1 step 9):
`git push origin main`. The app repository has no remote, so nothing is
pushed for it.

## Config and secrets set

None. The Stripe code from P2 merges in inert. It does nothing until stage 10
gives it secrets.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Root task branches not in main | about 60 | 0 | all |
| App branches not in master | 41 | 0 | all |
| Commits main is ahead of origin/main | 0 (main at 75ade49c5 locally) | 193 | +193 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Checking out a branch in one repository left the other with 3 to 66 "modified" files | Both repositories track `continent-app/`; one writes LF where the other wrote CRLF | Each time, confirmed `git diff --ignore-cr-at-eol` is empty, then stashed. The app repository holds three such stashes (named "session A: CRLF-only ..."); they carry no content change and can be dropped |

## What is still open

Three owner rows close on the push and the deploy, not on this merge, so they
stay open until the owner confirms them:

- **T046-b** (the box needs a branch with `infra/hetzner/`) closes once
  `origin/main` carries it.
- **T074-a** also needs migration 043 pasted with the T074 build deployed,
  which is stage 2.
- **P2-merge** is done here and closed.

The Vercel Preview of `main` exists only after the push. Promotion to
Production is stage 2.1 step 1.

## Rollback procedure

Before the push: `git checkout main && git reset --hard 75ade49c5` in the root
(main's old position) and `git -C continent-app reset --hard <old master>`;
the task branches are untouched by the merges. After the push, revert the
merge commits, because `origin/main` must not be rewritten.
