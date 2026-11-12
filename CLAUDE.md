# Carta

<!-- crew loads the router and the owner's preferences automatically. This file holds only what is
     specific to Carta. Keep it under 200 lines; it is read by every session. -->

## What this project is
A Europe trip planner for independent travellers: a Python data pipeline at the repo root and a Vite + React app in `continent-app/`, both tracked in this one git repo (branch `main`). Who it is for and how it speaks: `PRODUCT.md`.

## Where things live
Start at `docs/project-map.md`: every part, area and doc, with the files to open. Then go straight to the files. Big docs are grep-only, never read whole: `docs/HANDBOOK.md` (how each feature works, 480 KB), `ROADMAP.md` (the plan, item IDs like `D24`), `DESIGN.md`, `docs/reference/`. Why the project works this way: `docs/decisions/`. Mistakes not to repeat: `docs/lessons.md`.

## Stack
- Pipeline: Python 3.11, `run_pipeline.py`, tasks in `pipeline/tasks/`.
- App: React + Vite (Node 22), MapLibre, Cloudflare Pages Functions and Workers, data on R2.
- Backend: Supabase (Postgres with RLS, Edge Functions). Runtime AI is Gemini only, through the `plan-day` and `parse-booking` Edge Functions and `continent-app/functions/api/ask.js`.
- Box: Hetzner (`infra/hetzner/`) runs scheduled pipeline tasks, scrapes and backups.

## Commands
| What | Command |
|---|---|
| Install app | `cd continent-app && npm ci` |
| Install pipeline | `python -m pip install -r requirements.txt -c constraints.txt` |
| Run app | `cd continent-app && npm run dev` (syncs data first) |
| App tests and lint | `npm test`, `npm run lint`, full chain `npm run ci` (in `continent-app/`) |
| Fast build (any number you promise) | `cd continent-app && FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs` (about 10 s; from a worktree set `CARTA_APP`) |
| Python lint | `ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests` |
| Python tests | `python -m pytest tests -q` minus the ids in `tests/quarantine.txt` (see `.github/workflows/ci.yml`) |
| Docs checks | `python -I scripts/docs/check_entry_points.py`, `python -I scripts/docs/drift.py` |
| A pipeline task | `python run_pipeline.py <task>` |
| Deploy (owner asks only) | `node scripts/ship.mjs` (dry run), then `--live` from `main`; `--live --from <step>` resumes. Data goes to R2 before the site. |

CI: `.github/workflows/ci.yml` runs on every push (app lint, tests, fast build; ruff, pytest, docs checks); the other workflows are path-triggered gates. Run `npm test` yourself before committing anyway.

## Conventions
- App paths in docs may start with `app/`, meaning `continent-app/`. The root `src/` is Python, not app code.
- Comments explain why. Name the `ROADMAP.md` item ID (`A4`, `D7`) in every report and commit message when there is one.
- Old task IDs (`T001` to `T1222`) in comments and docs are pre-crew tasks: `.work/INDEX.md` has a line and a `git show` command for each.
- Write files with the Edit or Write tool or a Python script, never a Bash heredoc or `sed -i` (they eat backslashes and turn CRLF files into LF).
- The data contract: schema version 20 is set in each layer's writer, pinned in `continent-app/scripts/ci/contract.mjs`, documented in `docs/SCHEMA.md` and `docs/wire.schema.json`. A contract change is tested end to end: pipeline run, artifact, wire build, app load. There is no `pipeline/schema.py`.
- Files that code reads by path must not move: see "Docs: what to read for what" in `docs/project-map.md`.
- A behaviour change updates its section in `docs/HANDBOOK.md` and its `ROADMAP.md` status in the same commit.

## Design
- Read `PRODUCT.md` before any screen or string. Grep `DESIGN.md`; never read `continent-app/src/i18n/en.js`, `continent-app/src/styles.css` or a wire file whole.
- `continent-app/src/styles.css` `:root` is the token source of truth; `DESIGN.md` records it. A token change updates `DESIGN.md` in the same commit.
- The carta-design skill wins over every other design source. Its look rules are defaults, not bans; accessibility, honest numbers, the copy rules and licensed photography always bind. Answer its seven questions before shipping a visual change. See `docs/decisions/0006-design-rules-are-defaults.md`.
- For anything a traveller sees, look at every touched screen at phone and desktop width (`npm run dev`). Prefer the DOM checks in `continent-app/scripts/verify_*.mjs` over screenshots. Screenshots go in the run folder and are never committed.

## Project overrides for crew
- Run reports are committed: `.work/<run>/report.md` and `.work/INDEX.md` are tracked, the rest of a run folder is not. Cloud sessions share only git. See `docs/decisions/0002-run-history-in-work-index.md`.
- Open items: an owner-only step goes into the right file in `docs/owner/`; an engineering follow-up goes into the matching `ROADMAP.md` item. Nothing else keeps a backlog. See `docs/decisions/0003-open-items-owner-steps-and-roadmap.md`.
- Branches are named `p15-<slug>`. Every report says how to undo it (normally `git revert`); data migrations say if they are one-way and schema changes carry a down migration. Production baseline: tag `prod-2026-09` (`8b53babed`).
- A ROADMAP research row (`C-R1`, `E-R3`) counts as the research for a tool choice.

## Shared checkout and disk
- Several sessions share this checkout: never `git reset --hard`, never switch its branch under another session, never `git stash` while worktrees exist (`refs/stash` is shared). When another session is active, work in a worktree.
- Worktrees go in `C:/Users/Gebruiker/Documents/Portfolio/wt/`, made and removed with `node scripts/worktree.mjs add <slug> [--link-node-modules]` and `node scripts/worktree.mjs remove <slug>`, which unlinks junctions first. Never delete through a `node_modules` or `public` junction, and never junction `public` into a sparse worktree.
- The disk runs full. Throwaway: `dist/`, `dist-data/`, `.fastbuild/`, screenshots. Never delete: `cache/`, `tools/`, `continent-app/public/`, `logs/` (see `.claude/protected-paths.txt`). The full build with `public/` needs about 1.3 GB free.
- `continent-app/.git` is a stale nested repo with no remote: never commit there; `git status` at the root is the truth.

## Never
- Never edit files listed in `.claude/protected-paths.txt` without asking.
- Never add an `anthropic` or `@anthropic-ai/*` SDK, an `ANTHROPIC_API_KEY` or a call to `api.anthropic.com` anywhere in the pipeline, the app or a function. See `docs/decisions/0005-runtime-ai-on-gemini.md`.
