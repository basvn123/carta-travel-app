# Task T002: Write CLAUDE.md working rules for the plan

## Task ID

T002

## Date

2026-09-22

## What changed

Created CLAUDE.md at the repository root to document the working conventions for executing the Carta rating_v4 and Explore rebuild plan across 150+ tasks and many Claude Code sessions. The document establishes five core rules: task numbering (T001–T150 across phases P0–P15), the requirement that every task writes its report before the next starts, the rule that carta-design wins over all other design sources, the discipline that tasks touch only named files, and the one-branch-per-task convention. It also specifies measurement requirements, rollback procedures, and known gotchas (schema versioning, pipeline orchestration, no CI tests). The file becomes the single source of truth for how all subsequent work is structured, tested and documented.

## Files touched

**Created:**
- CLAUDE.md (working rules document)
- Execution/P0/T002-claude-code-working-rules.md (this report)

## Commands run

```powershell
cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"
git add CLAUDE.md
git commit -m "Add CLAUDE.md: working rules for multi-session task execution"
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Working rules documented | 0 | 1 | +1 |
| Task numbering scheme | Implicit | Explicit | Standardized |
| Report template enforcement | Ad-hoc | Mandatory | Structured |

## What broke and how it was fixed

No issues.

## What is still open

None. This task establishes the foundation for all subsequent work.

## Rollback procedure

```powershell
cd "C:\Users\Gebruiker\Documents\Portfolio\Travel App"
git revert 4b8c7d996
Remove-Item "Execution/P0/T002-claude-code-working-rules.md"
```

---

## Implementation notes

The CLAUDE.md document codifies five rules drawn from the Execution folder template (T001) and the carta-design skill. It is structured to be read in full once and then consulted by reference during task execution. Each section states a rule and explains why it matters, so future task prompts can simply say "follow CLAUDE.md" rather than re-stating conventions.

The key design choices:

- **Task numbering is two-part**: phase (P0–P15) and task number (T001–T150). This allows reports to be scanned by phase for architectural dependencies while remaining individually revertible.
- **Reports are written at task end, not at merge time**. This makes dependencies between tasks visible and gives the next task a concrete record of what was open when the previous one finished.
- **Carta-design is the design authority**. The skill covers palette, type, layout, components and copy. By making it the tiebreaker, design decisions no longer require back-and-forth with the user for every choice that the skill already covers.
- **Scope discipline prevents accidents**. One task touching files outside its scope can break another task's assumptions. The rule is simple: only named files.
- **One branch per task keeps git history readable**. Merging `p7-explore-cards` tells a future reader what that work did. Stacking five tasks on one branch loses that signal.

The CLAUDE.md document is intentionally short (83 lines) so it stays usable as a reference guide during implementation, not a lengthy onboarding document that nobody re-reads.
