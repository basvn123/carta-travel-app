---
status: accepted
date: 2026-11-11
decided-by: Bas, with Claude
run: .work/2026-11-11-crew-alignment/
---

# 0004 · Keep the always-loaded context lean

## Context
Context is a limited attention budget: irrelevant lines measurably lower answer quality, and key facts in the middle of long input are used worst (Liu et al. 2023, "Lost in the middle"; Shi et al. 2023; Chroma 2025, "Context rot"; summarised in the owner's prompt guide, 2026-11-11). Every Carta session loaded a 14 KB `CLAUDE.md` and a 48-line memory index, and was told to open `MAP.md`, the register (523 KB), `ROADMAP.md` (145 KB), the handbook (480 KB) and a handover file.

## Options considered
1. **Leave it.** Every session pays before it starts.
2. **Split big docs into many small ones.** More files to find; code and CI read several by fixed path (`docs/HANDBOOK.md` headings, `docs/SCHEMA.md`).
3. **A short entry layer that points, and big docs that are grepped.**

## Decision
We chose **option 3**:
- `CLAUDE.md` holds only Carta facts, commands, conventions and overrides (crew shape, under 200 lines).
- `docs/project-map.md` is the one map; it replaced `MAP.md`, `docs/README.md`, the 28 `docs/areas/` pages and `docs/reading-guide.md`. `scripts/docs/check_entry_points.py` fails CI on any dead path in it, in `CLAUDE.md` and in `docs/lessons.md`.
- `docs/HANDBOOK.md`, `ROADMAP.md`, `DESIGN.md` and `docs/reference/` stay whole and are grep-only.
- Rules that must always hold go in tooling, not prose: `.claude/protected-paths.txt` (crew hook), CI checks.
- Facts that lived only in Claude's private memory (owner taste, business rules) moved into `docs/decisions/`, so every session and machine sees them.

## Consequences
- Good: a session reads about 100 lines before work; pointers are machine-checked.
- Bad: a session must grep instead of skim; a missed grep can miss a rule. The project map's "what to read for what" table is the guard.

## How we'll know it works
`CLAUDE.md` stays under 200 lines and the entry-point check stays green.
