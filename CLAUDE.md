# Claude Code working rules for Carta

This document establishes the conventions for executing the Carta Explore rebuild and rating_v4 plan across many Claude Code sessions. Every task must follow these rules.

## Task numbering scheme

Tasks are numbered `T001`, `T002`, etc., scoped to phase folders `P0` through `P15`.

- `P0` — Execution setup and foundational rules (this task)
- `P1–P7` — Phase A: Rating model v4 (seven steps)
- `P8–P12` — Phase B: Coverage and findability (five steps)
- `P13–P15` — Phase C opening: Explore page (three of nine steps)

Each task has its own branch, its own report, and a clear entry point in the prompt. The phase prefix lets reports be scanned by workstream, and the number makes each report revertible and findable.

## Every task writes its report before the next task starts

A report documents what changed, what broke, what is still open, and how to rollback. Reports live in `Execution/P{n}/T{n:03d}-{slug}.md` and follow the template in `Execution/_TEMPLATE.md` exactly.

The report is written at the end of the task, before the branch is merged and before the next task begins. The next task reads the report to understand what is still open and what side effects to watch for.

A report is never updated after the task is closed. If a bug is discovered later, a new task investigates and fixes it, which may mean a new report that references the original.

## Carta-design wins over every other design source

The [carta-design skill](https://github.com/anthropics/claude-code/skills/carta-design) documents Carta's visual language: the colour palette, typography, layout, components, copy rules, and the ten things never to do.

When a design question arises and another source (a layout sketch, a browser screenshot, a wireframe) gives a different answer, carta-design wins. If carta-design does not explicitly cover a case, the question belongs in the next phase or a separate task — do not make a design call without a written rule.

Before shipping any visual change, answer the seven questions at the end of the carta-design brief.

## Never use the Claude API

The Claude (Anthropic) API is not available to this project. All Claude work happens through Claude Code or Claude Cowork sessions, never through a paid API call.

Do not add the `anthropic` or `@anthropic-ai/*` SDKs, do not introduce an `ANTHROPIC_API_KEY` or any Anthropic secret, and do not call `api.anthropic.com` from a pipeline script, a Supabase Edge Function, or the app.

Runtime AI features stay on the existing non-Anthropic route: the Gemini-backed `plan-day` and `parse-booking` Edge Functions. If a task appears to require the Claude API, stop and say so in "What is still open" and propose a non-API route instead of wiring one up.

## No task touches files outside its declared scope

The prompt names the files to touch. Do not edit, create or delete files the task does not name, and do not move code across file boundaries to avoid touching the named files.

This rule keeps tasks revertible. If a file has bugs that belong to a different task, leave them for that task. If a refactoring would make the task easier, note it in "What is still open" and file it as a separate task.

One exception: schema migrations, data migrations, and database changes affect multiple files and are expected to be atomic. The prompt will mark these clearly.

## One branch per task

Create a branch `{phase}-{slug}` for each task where `{phase}` is P0, P1, etc., and `{slug}` is a short kebab-case name from the task title. Example: `p7-explore-cards`, `p3-urban-beauty`.

Commit the task's work to that branch, write the report, and then merge or hand off. Do not stack tasks on one branch. Do not merge the task before the report is written.

If a task has no code changes (e.g., a pure research or audit task), the commit is the report itself.

## Production baseline and tagging

The production baseline for this work is tagged `prod-2026-09` at commit `8b53babed` (Dossier merge). All work proceeds from this point. If any task requires rollback to production, use `git reset --hard prod-2026-09`.

## How to run a task

1. Read the prompt completely. Know what files it names and what the done condition is.
2. Read the most recent related task report (if one exists) to catch dependencies and surprises.
3. Create a branch for the task.
4. Do the work.
5. Test the changes the way the prompt specifies (e.g., "run the app and verify").
6. Write the report in `Execution/P{n}/T{n:03d}-{slug}.md`.
7. Commit the report.
8. Hand the branch back to the user or mark it ready for merge.

## Measurements

Every prompt that implies a number must include a before/after measurement in the report. "Before" is the state at the start of the task. "After" is the state when the task finishes. Only include metrics the task promises to move.

If a task is pure code cleanup or infrastructure, there may be no measurements — that is fine. Write "Not measured" and move on.

## Rollback is always possible

Every task must include a rollback procedure. Before writing code, think about what would need to undo it. Data migrations must be reversible or explicitly documented as one-way. Schema changes must include a down migration.

If rollback is impossible (e.g., deleting production data), the task must state that plainly and be reviewed carefully before any changes are committed.

## Known gotchas and side effects

Report these clearly so the next task does not spend time rediscovering them:

- The schema versioning is in `pipeline/schema.py` and in `SCHEMA.md`. Changes propagate to the wire format and the app's hydration. Schema changes are slow.
- Pipeline runs are orchestrated by `run_pipeline.py`. Any change to the data contract (a new column, a removed field, a renamed key) must be tested end to end: pipeline run, data artifact, wire build, app load.
- The app is Vite + React. The dev server watches the `public/` directory and reloads. The built dist is deployed to the CDN.
- Tests are not wired to CI. Run `npm run dev` in `continent-app/` and look at every screen a prompt touches before committing.
- Git is set up. Commit between prompts so each one is revertible. The repo root has commit history but the app root (`continent-app/`) is its own git tree.

---

**Last updated:** 2026-09-22
**Production tag:** prod-2026-09 (commit 8b53babed)
