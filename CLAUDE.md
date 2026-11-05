# Claude Code working rules for Carta

Carta is a Europe trip planner: a Python data pipeline in this repo and a Vite + React app in `continent-app/`, both tracked in this one git repo (branch `main`). Every session follows these rules. They are short on purpose: read this file whole, read everything else only in the lines you need.

**Start here:** this file, then `MAP.md`, which maps each product area (Explore, Plan, prices, trails...) to its app code, pipeline code, handbook section and latest task reports. To understand how a feature works (its rules, formulas and thresholds), read its section in `docs/HANDBOOK.md`. Then go straight to the files; do not browse folders, `archive/` or old reports to find your way. The plan of record is `ROADMAP.md`: name its item ID (`A4`, `D7`) in every report.

## Where things are

| Path | What |
|---|---|
| `MAP.md` | Area to files map: open it first for any feature. |
| `ROADMAP.md` | The plan to production: phases with quality gates (section 4), then tracks A to K with item IDs. |
| `docs/HANDBOOK.md` | Every feature and how it works, with the config key or constant behind each number. Grep for the feature; never read it whole (2,500 lines). |
| `docs/AUDIT-2026-11.md` | The pain points found on 2026-11-04 (`P-01` to `P-59`), each mapped to a roadmap item. |
| `PRODUCT.md`, `DESIGN.md` | Who Carta is for and the locked design tokens. Read before touching anything a traveller sees (see Design). |
| `run_pipeline.py`, `pipeline/` | The data pipeline. The data contract is `docs/SCHEMA.md` (CI reads its "Wire contract" table) plus each layer's writer; there is no `pipeline/schema.py`. |
| `continent-app/` | The app, tracked by this repo. Its old nested `.git` (stuck at T915, no remote) is stale: never commit there. `public/` is shipped data and images: never delete it. |
| `cache/`, `tools/trailslab/`, `tools/brouter/` | Pipeline inputs and routing tools. Hours to rebuild: never delete them for space. |
| `Execution/_OPEN.md` | The register of open items. |
| `Execution/P{n}/_DIGEST.md` | One file per finished phase: what each task changed and what broke. Search it, do not read it whole. |
| `Execution/P15/` | The active phase, full reports. |
| `Execution/_TEMPLATE.md` | The report template. |
| `docs/` | Index in `docs/README.md` (what to read for what). Tree: `HANDBOOK.md`, `areas/` (one doc per MAP row), `architecture/`, `data/`, `runbooks/`, `glossary.md`, stubs `logic/`, `ai/`, `reference/`, `security/` (Track C), plus `AUDIT-2026-11.md`, `research/`, `legal/ARTICLE30.md`. Four files code reads must stay where they are: `SCHEMA.md`, `tos/data_licenses.md` (generated), `REGIONS.md`, `LAKES.md`. New docs follow the tree in ROADMAP item B2. |
| `archive/` | Retired code, finished plans and the old docs (`archive/docs-2026-11/`, `archive/roadmap-2026-10/`). Nothing there runs or binds; do not read it to find your way. |
| `scripts/vite.fast.mjs` | The fast build (see Checks). |

Full old reports and screenshots up to 2026-11-03 are in git under the tag `archive/execution-full-2026-11-03`; each digest entry gives the `git show` command for its report.

## Task numbers

Tasks are numbered `T001`, `T002`, and so on, and filed under phase folders `P0` to `P15`. Before taking a number, take the highest one in `git log --all --oneline` and in `Execution/`, check `ListAgents` for sessions that reserved a range, and count up from there. Two sessions that took the same number once cost a whole renumber task (T477).

## How to run a task

1. Read the prompt completely: the files it names and its done condition.
2. Grep `Execution/_OPEN.md` for `| next task | open` together with the feature's words (do not read the file whole) and take the rows the prompt covers. For history, grep `Execution/P*/_DIGEST.md` and `Execution/P15/` for the latest task IDs `MAP.md` names, and read only that report.
3. Make a branch `p{n}-{slug}` (for example `p15-explore-cards`) in this repo; it carries app changes too.
4. Do the work. Touch only the files the prompt names. A bug or refactor outside that scope becomes a line in "What is still open", not an edit. Schema and data migrations are the one exception, and the prompt marks them.
5. Check it (see Checks).
6. Write the report `Execution/P{n}/T{n:03d}-{slug}.md` from `_TEMPLATE.md`, and add one register row per open item. If the task changed how a feature works, update that feature's section in `docs/HANDBOOK.md` in the same commit, and set the item's Status in `ROADMAP.md`.
7. Commit the report and the register together, then merge or hand the branch back. Never merge before the report exists.

A task with no code changes commits only its report.

## Batches

When one prompt names several tasks, they run as a batch: the same depth of work, less repetition (owner, 2026-10-21).

- One batch branch. Every task is still its own commit (or a few), each message starting `T{n}:`, so any one task can be reverted alone.
- Tasks that run in parallel each get a worktree, merged into the batch branch at the end. Never `git stash` while worktrees exist: `refs/stash` is shared, and one agent's pop once took another agent's edits (T480).
- Checks per task are static: lint the touched files, `npm test`, and the fast build when the task promises a number. No dev server or screenshots per task; each task writes down which screens the end check must look at.
- One end check in the browser on the merged batch, at phone and desktop width, covering every screen any task touched. A failure is fixed on the batch branch and noted under that task's "What broke".
- One report, `Execution/P{n}/T{first}-T{last}-{slug}.md`: a short shared header, then one section per task with the template's headings. Register rows stay one per item with the task's own ID (`T479-a`).
- Hand broad searches and independent tasks to subagents, and give them the baseline already measured.

## Checks

- GitHub Actions: `ci.yml` runs on every push and pull request (app lint, `npm test`, fast build; Python ruff, pytest minus `tests/quarantine.txt`, the entry-point check), plus 12 path-triggered workflows (contract, design lint, RLS, rating tests, licences and more). Run `npm test` in `continent-app/` yourself before committing anyway; a test you fix comes off `tests/quarantine.txt`. Run `python -I scripts/docs/check_entry_points.py` after editing CLAUDE.md or MAP.md. For anything a traveller sees, run `npm run dev` and look at every touched screen before committing (in a batch, once at the end).
- Prefer the DOM checks in `continent-app/scripts/verify_*.mjs` over screenshots. Take one screenshot per touched screen and width, only where the look is the point.
- **Screenshots are never committed.** Save them under `Execution/P{n}/T{n}-shots/` (gitignored); the report names the screens checked and what was seen.
- **Fast build** for any number a task promises: `cd continent-app && FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs`. About 10 seconds, with `publicDir` off; its `assets/` and `index.html` match a full build's. From an app worktree, set `CARTA_APP` to that worktree. The full build with `public/` is only for a deploy and needs about 1.3 GB free.
- **Deploy** (only when the owner asks), from `continent-app/`: `VITE_E2E_SEAMS= npm run build:pages`, `node scripts/css-routes.mjs --check dist/assets`, `node scripts/r2/push-data.mjs --live` (data first), `npx wrangler pages deploy dist --project-name carta-app --branch preview`, then `--branch main`, then `push-data.mjs --live --prune`. The header of `scripts/build-pages.mjs` explains each step.
- Every number the task implies gets a before and an after in the report. If none is implied, write "Not measured".
- A change to the data contract (a new column, a removed or renamed key) is tested end to end: pipeline run (`run_pipeline.py`), data artifact, wire build, app load.

## The register: Execution/_OPEN.md

Report prose is where open work gets lost, so every open item is also one row in `Execution/_OPEN.md`, written in the same commit as the report.

- Columns: `ID` (task plus a letter, `T031-a`), `Raised by`, `Item` (one sentence: what is open and why), `Owner` (`user` for anything only the owner can do, such as a Dashboard step, a secret, a migration paste or a product decision; otherwise `next task`), `Status`, `Order` (a number only when sequence matters).
- `_OPEN.md` holds only `open` rows. A task that closes a row moves it, with `Status` set to `closed by T{n}`, to `Execution/_OPEN-CLOSED.md` in its own commit. Rows are never deleted.
- The row is a pointer; the reasoning stays in the report.
- An ordered owner procedure lives once in `Execution/P{n}/_OPEN-{slug}.md`, and the rows link to it.
- An open row that no prompt covers is reported to the owner, not done quietly.

## Design

- Read `PRODUCT.md` before any screen or string. For `DESIGN.md` (80 KB), grep for the token or component you need rather than reading it whole. Never read `src/i18n/en.js`, `styles.css` or a wire file whole either.
- `continent-app/src/styles.css` `:root` is the source of truth for tokens and `DESIGN.md` records it. A task that changes a token updates `DESIGN.md` in the same commit. If the two disagree, fix `DESIGN.md`, not the stylesheet, unless the prompt says otherwise.
- The carta-design skill wins over every other design source (sketches, screenshots, wireframes). Since 2026-10-30 (owner, T878) its look rules are defaults, not bans: a screen may go further (colour, gradients, illustration, richer motion) where that makes it modern and top notch. Accessibility, honest numbers, the copy rules and licensed photography still bind. Where the skill is silent, the question becomes its own task: no design call without a written rule.
- Before shipping a visual change, answer the seven questions at the end of the carta-design brief.

## Never use the Claude API

All Claude work happens in Claude Code or Cowork sessions. Do not add the `anthropic` or `@anthropic-ai/*` SDKs, an `ANTHROPIC_API_KEY`, or any call to `api.anthropic.com`, from a pipeline script, an Edge Function or the app. Runtime AI stays on the Gemini-backed `plan-day` and `parse-booking` Edge Functions. If a task seems to need the Claude API, stop, say so in "What is still open" and propose a non-API route.

## Rollback

Every report says how to undo the task, normally `git revert` of its commits. Data migrations are reversible or say plainly that they are one-way; schema changes carry a down migration. The production baseline is the tag `prod-2026-09` (commit `8b53babed`), kept for reference only. Several sessions share this checkout: never `git reset --hard` it and never switch its branch under another session; when another session is active, work in a worktree.

## Disk and worktrees

The disk runs full; keep it clean.

- Worktrees go in `C:/Users/Gebruiker/Documents/Portfolio/wt/`. Remove a task's worktree once its branch is merged, then `git worktree prune`.
- Before removing one, delete its junctions on their own (`cmd /c rmdir <link>`, never with `/s`). The `node_modules` and `public/*` links point into the live app, and a recursive delete through them once wiped real files. Never junction `public` into a sparse worktree.
- Build output (`dist/`, `dist-data/`, `.fastbuild/`) and screenshots are throwaway. `cache/`, `continent-app/public/` and `tools/` are not.

## Known gotchas

- `continent-app/.git` is a stale nested repo (no remote, `master` at T915): `git -C continent-app status` there shows hundreds of false changes. Commit app work in this repo; `git status` here is the truth.
- Schema version 19 is set in each layer's writer, pinned in `continent-app/scripts/ci/contract.mjs` and documented in `docs/SCHEMA.md`; changes reach the wire format and the app's hydration, so they are slow.
- The dev server watches `public/` and reloads.
- `reports/` at the root is not scratch: `rating_reference_v5.json` is the frozen rating calibration and the coverage CI gate reads `coverage_contract.json`. Only the dated `coverage_backlog_*.csv` files are untracked.
- Windows Task Scheduler runs `logs/run_*.cmd`, and `logs/pipeline_state.json` is pipeline state: never clean `logs/` wholesale.

---

**Last updated:** 2026-11-04 (T1051)
