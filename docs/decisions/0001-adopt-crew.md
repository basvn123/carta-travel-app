---
status: accepted
date: 2026-11-11
decided-by: Bas, with Claude
run: .work/2026-11-11-crew-alignment/
---

# 0001 · Run all Claude work through crew

## Context
Carta grew its own way of working over 1,222 tasks: reserved task numbers (`T001` to `T1222`), phase folders `Execution/P0` to `P15` with one report per task, phase digests, a 2,106-row open-items register, batch rules and session plans. It worked, but every session paid for it: `CLAUDE.md` was 14 KB of process, and the files it pointed at (register, roadmap, handbook, handover) added up to 1.7 MB. Task-number collisions between parallel sessions cost a whole renumbering task (T477). The owner built crew, a Claude Code plugin with a router (L0, L1, L2), five roles, hooks and a fixed documentation model, and wants every project to work the same way.

## Options considered
1. **Keep the Carta system and add crew on top.** Two report formats, two histories, conflicting rules.
2. **Adopt crew fully and keep Carta specifics as project overrides.** One way of working; `CLAUDE.md` holds only what crew can't know.
3. **Drop the process and work ad hoc.** Loses traceability, the owner's top priority.

## Decision
We chose **option 2**. crew owns routing, run folders, reports, decision records and lessons. `CLAUDE.md` keeps Carta facts, commands, protected paths and a short "Project overrides for crew" list. Task numbers stop; run folder names (`.work/<date>-<slug>/`) replace them.

## Consequences
- Good: every session starts from about 100 lines instead of 14 KB of process; no number reservations to collide; the same habits as every other project.
- Bad: old reports moved out of the tree (see 0002), unmerged branches that edit `Execution/` will conflict, and the prepared session plans (rounds 2 and 3) no longer match the repo.

## How we'll know it works
Retros show sessions finding files from `docs/project-map.md` without reading big docs, and no report missing a changed file.

## More information
- Run report: `.work/2026-11-11-crew-alignment/report.md`
- crew's own reasoning: its decisions 0004 (effort levels) and 0007 (documentation model) in the crew repo.
