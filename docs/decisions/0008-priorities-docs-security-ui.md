---
status: accepted
date: 2026-11-04
decided-by: Bas
---

# 0008 · Documentation, security and UI come first

## Context
While planning the launch the owner named three priorities: documentation, security and UI (`ROADMAP.md` tracks B, C and G).

## Options considered
1. **Features first.** More to show, but more to document and secure later.
2. **Docs, security and UI first.**

## Decision
We chose **option 2**. When choosing or scoping a task, favour work that leaves the docs true (`docs/HANDBOOK.md`, `docs/project-map.md`), closes a security gap, or lifts what a traveller sees. A task that changes behaviour updates its docs in the same commit.

## Consequences
- Good: the product stays explainable and safe as it grows.
- Bad: some features wait.

## How we'll know it works
The docs checks in CI stay green, and `ROADMAP.md` tracks B, C and G move first.
