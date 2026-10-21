# Claude Code working rules for Carta

This document establishes the conventions for executing the Carta Explore rebuild and rating_v4 plan across many Claude Code sessions. Every task must follow these rules.

## Task numbering scheme

Tasks are numbered `T001`, `T002`, etc., scoped to phase folders `P0` through `P15`.

- `P0`: Execution setup and foundational rules (this task)
- `P1` to `P7`: Phase A: Rating model v4 (seven steps)
- `P8` to `P12`: Phase B: Coverage and findability (five steps)
- `P13` to `P15`: Phase C opening: Explore page (three of nine steps)

Each task has its own branch, its own report, and a clear entry point in the prompt. The phase prefix lets reports be scanned by workstream, and the number makes each report revertible and findable.

## Every task writes its report before the next task starts

A report documents what changed, what broke, what is still open, and how to rollback. Reports live in `Execution/P{n}/T{n:03d}-{slug}.md` and follow the template in `Execution/_TEMPLATE.md` exactly.

The report is written at the end of the task, before the branch is merged and before the next task begins. The next task reads the report to understand what is still open and what side effects to watch for.

A report is never updated after the task is closed. If a bug is discovered later, a new task investigates and fixes it, which may mean a new report that references the original.

## Batches: one report and one test round for several tasks

When one prompt names several tasks, they run as a batch (owner decision, 2026-10-21, to spend fewer tokens without doing shallower work). The depth of the work stays the same: the same audit, the same measurements, the same rollback, one register row per open item. What a batch drops is repetition.

- **Numbers.** Before taking a task number, take the highest number in `git log --all --oneline` and in every worktree's `Execution/` folder, and count up from there. Two sessions that both took T470 cost a whole renumber task (T477).
- **Branches and commits.** One batch branch in the root repo and one in `continent-app/`. Tasks that run in parallel each get their own app branch and worktree, merged into the batch branch at the end. Every task is still its own commit (or its own few commits), with a message starting `T{n}:`, so any one task can be undone with `git revert` without touching the others. Never run `git stash` while parallel worktrees are in use: `refs/stash` is shared by every worktree, and in T480 one agent's pop took another agent's edits. For a clean baseline, use `git worktree add` on `master` or `git diff > file.patch` instead.
- **One report.** The batch writes one report at the end, `Execution/P{n}/T{first}-T{last}-{slug}.md`. It has a short shared header, then one section per task with the template's headings, each kept to what is true for that task. Register rows are still one per open item with the task's own ID (`T479-a`), written in the same commit as the report.
- **Checks per task: static only.** Lint the files the task touched, run the node unit tests (`npm test`), and when the task promises a number, run the fast build below and measure. No dev server, no browser and no screenshots per task. Each task instead writes down which screens and states the end check must look at.
- **One end check.** The browser round runs once, on the merged batch, before the report is written. It covers every screen any task touched, at phone and desktop width, using each task's checklist. If something fails, the per-task commits show which task caused it; fix it on the batch branch and note it under that task's "What broke".
- **Fast build.** Measure with a NOPUBLIC build (an outside vite config with `publicDir: false`, as in `wt/vite.t474.mjs`). It takes about 10 seconds and its `assets/` and `index.html` are the same as a full build's. The full build with `public/` is only for a deploy.
- **Fewer tokens per step.** Search first, then read only the lines you need. Never read `src/i18n/en.js`, `styles.css` or a wire file whole. Hand broad searches and independent tasks to subagents on the task's model, and give them the baseline already measured so they do not build it again. Prefer the DOM checks in `scripts/verify_*.mjs` over screenshots; take one screenshot per touched screen and width, and only where the look is the point. Sync the root repo's copy of `continent-app/` once per batch, not after every task.

## Every open item also goes into the register

The "What is still open" section of a report is prose, and prose across many reports is where open work gets lost. So every open item is also written as one row in `Execution/_OPEN.md`, the structured register, at the same moment the report is written.

One row per item. Columns: `ID` (the task number plus a letter, `T031-a`), `Raised by` (the task), `Item` (one sentence, what is open and why), `Owner` (`user` for anything only the owner can do such as a Dashboard step, a secret, a migration paste or a product decision; otherwise `next task`), `Status` (`open`, or `closed by T{n}`), `Order` (a number only when the item must happen before or after another; blank otherwise).

Rules for the register:

- Append at report time, before the commit that carries the report. A task that raises nothing writes nothing.
- A task that resolves an earlier item does not delete the row. It changes `Status` to `closed by T{n}` in its own commit, so the register carries history the same way reports do.
- The row is a pointer, not the argument. The reasoning, the candidate fixes and the evidence stay in the report; the row says what and who.
- When a batch of tasks produces an ordered procedure for the user (as T030 to T034 did for the Stripe launch), the procedure lives in a sibling file named `Execution/P{n}/_OPEN-{slug}.md` and the register rows link to it, so the order is written once.
- Before starting a task, read the `open` rows owned by `next task` and take the ones the prompt covers. A row left open with no task claiming it is a gap in `_ORDER.md`, not something to do quietly.

## Read PRODUCT.md and DESIGN.md first

Two files at the repo root are the durable context every session reads before touching anything a traveller sees. `PRODUCT.md` states who Carta is for, what they are doing when they use it, the brand voice and the accessibility constraints. `DESIGN.md` records the locked design tokens, copied exactly from the `:root` of `continent-app/src/styles.css`, with the one job each token has. Read them at the start of any task that touches a screen, a string, a colour, a font or a spacing, so the design is executed from written values rather than guessed each session.

`styles.css` is the source of truth for the tokens and `DESIGN.md` is its record. A task that changes a token in `:root` updates `DESIGN.md` in the same commit. A task that finds the two disagreeing fixes `DESIGN.md`, never the stylesheet, unless the prompt says otherwise.

## Carta-design wins over every other design source

The [carta-design skill](https://github.com/anthropics/claude-code/skills/carta-design) documents Carta's visual language: the colour palette, typography, layout, components, copy rules, and the ten things never to do.

When a design question arises and another source (a layout sketch, a browser screenshot, a wireframe) gives a different answer, carta-design wins. If carta-design does not explicitly cover a case, the question belongs in the next phase or a separate task: do not make a design call without a written rule.

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

Commit the task's work to that branch, write the report, and then merge or hand off. Do not stack tasks on one branch. Do not merge the task before the report is written. A batch (see above) is the one exception: its tasks share a batch branch, each as its own commit, and the batch merges after its one report.

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
7. Add one row per open item to `Execution/_OPEN.md`, and mark any earlier row this task closed.
8. Commit the report and the register together.
9. Hand the branch back to the user or mark it ready for merge.

In a batch, steps 3 to 5 repeat for each task with static checks only. The end check (step 5 in the browser), the report (6), the register (7) and the commit (8) then happen once for the whole batch.

## Measurements

Every prompt that implies a number must include a before/after measurement in the report. "Before" is the state at the start of the task. "After" is the state when the task finishes. Only include metrics the task promises to move.

If a task is pure code cleanup or infrastructure, there may be no measurements, and that is fine. Write "Not measured" and move on.

## Rollback is always possible

Every task must include a rollback procedure. Before writing code, think about what would need to undo it. Data migrations must be reversible or explicitly documented as one-way. Schema changes must include a down migration.

If rollback is impossible (e.g., deleting production data), the task must state that plainly and be reviewed carefully before any changes are committed.

## Known gotchas and side effects

Report these clearly so the next task does not spend time rediscovering them:

- The schema versioning is in `pipeline/schema.py` and in `SCHEMA.md`. Changes propagate to the wire format and the app's hydration. Schema changes are slow.
- Pipeline runs are orchestrated by `run_pipeline.py`. Any change to the data contract (a new column, a removed field, a renamed key) must be tested end to end: pipeline run, data artifact, wire build, app load.
- The app is Vite + React. The dev server watches the `public/` directory and reloads. The built dist is deployed to the CDN.
- Tests are not wired to CI. Run `npm run dev` in `continent-app/` and look at every screen a prompt touches before committing (in a batch, once before the batch report).
- Git is set up. Commit between prompts so each one is revertible. The repo root has commit history but the app root (`continent-app/`) is its own git tree.

---

**Last updated:** 2026-10-21
**Production tag:** prod-2026-09 (commit 8b53babed)
