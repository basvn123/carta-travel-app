# Task T003: Tag and baseline the current production state

## Task ID

T003

## Date

2026-09-22

## What changed

Tagged the currently deployed production commit (8b53babed, "Dossier merge") as `prod-2026-09` and documented the branch convention in CLAUDE.md. This creates a named rollback point before infrastructure, schema, and payment code changes are introduced in the Carta rating_v4 and Explore rebuild phases. The tag is pushed to the remote repository and serves as the canonical baseline for all subsequent work. The branch naming convention {phase}-{slug} is now documented as the standard for per-task branches, ensuring each change remains independently revertible throughout the 150-task plan.

## Files touched

**Modified:**
- CLAUDE.md (added production baseline section and tag reference)

**Created:**
- Execution/P0/T003-git-baseline.md (this report)

## Commands run

```powershell
cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"
git tag -a prod-2026-09 8b53babed -m "Production baseline before Carta phase work (rating_v4, Explore rebuild)"
git push origin prod-2026-09
git add CLAUDE.md
git commit -m "Document production baseline tag and branch convention"
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Production baseline tagged | No | Yes | +1 |
| Branch convention documented | Implicit | Explicit | Standardized |
| Rollback procedure available | No | Yes | +1 |

## What broke and how it was fixed

No issues.

## What is still open

None. This task establishes the production baseline required before phase work begins.

## Rollback procedure

If the tag needs to be deleted and recreated:

```powershell
cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"
git push origin --delete prod-2026-09
git tag -d prod-2026-09
git tag -a prod-2026-09 8b53babed -m "Production baseline before Carta phase work (rating_v4, Explore rebuild)"
git push origin prod-2026-09
```

To restore the repository to production state at any point:

```powershell
cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"
git reset --hard prod-2026-09
```

---

## Implementation notes

The production baseline commit 8b53babed represents the state of the application immediately after the Dossier layer merge. This is the last commit before the Carta rating_v4 and Explore rebuild work begins. All tasks in phases P1–P15 will branch from main and build on top of this baseline.

The tag serves two purposes: as a named fallback point for emergency rollback, and as a clear marker in the git history of where major infrastructure and schema changes begin. The `prod-2026-09` naming scheme records the month (September 2026) and allows multiple production baselines to coexist if needed.

CLAUDE.md now explicitly documents the production baseline, the branch naming convention, and the rollback procedure. This makes it possible for any Claude Code session to follow the standard pattern without re-deriving these conventions.
