# T1167: Generated reference and docs site (ROADMAP B6)

## Date

2026-11-06

## What changed

`docs/reference/` now holds four more generated files beside config.md (T1165) and evals.md (T1148): `python.md` (public API of the Python code), `app-lib.md` (every export of `continent-app/src/lib`), `tasks.md` (the 78 `run_pipeline.py` tasks: cadence, writes, flags, commands, wire fields owned) and `supabase.md` (67 public tables, 96 policies, 162 functions, 68 indexes, replayed from 66 migrations). One script writes them and checks them: `python -I scripts/docs/build_reference.py [--check [--strict]]`. `mkdocs.yml` builds the whole `docs/` tree as a MkDocs Material site with full-text search (local build 4 seconds, 2.7 MB search index, mermaid fences supported). `ci.yml` checks tasks.md and supabase.md; the new `docs-site.yml` regenerates, builds, checks the search index exists and uploads the site as an artifact. Nothing is deployed.

## Research

Subagent comparison (registries queried 2026-11-06).

| Choice | Options | Pick and reason |
|---|---|---|
| Site | MkDocs Material 9.8.0, Starlight 0.42.9 (Astro, Pagefind), Docusaurus 3.10.2 | MkDocs Material: the existing `docs/` markdown has no frontmatter and Starlight needs it; Docusaurus is heavy. Risk: Material is in maintenance mode since 2025-11-05 (fixes for about a year), mkdocs 2.0 is incompatible; Zensical reads the same mkdocs.yml, so the way out is cheap (register T1167-d). |
| Python API | pdoc 16.0.0, Sphinx 9.2.0, mkdocstrings 1.0.8 | None: a small `ast` generator. pdoc and mkdocstrings import modules; pipeline modules need heavy dependencies and some work on import, and pdoc writes a separate HTML site. The ast reader needs nothing installed and gives a diffable markdown file with a `--check`. |
| App library API | TypeDoc 0.28.20 (+ plugin-markdown), jsdoc-to-markdown 9.1.3, documentation.js | None yet: a text extractor (export name, kind, first comment line). Plain JS with sparse typing gives TypeDoc little, and it would add a devDependency and a lockfile change to the app. Re-test later (T1167-e). |
| Tables and policies | none | A text replay of the migrations (no Postgres in CI for this), the same files the RLS test applies. |

## Files touched

Created: `scripts/docs/build_reference.py`, `scripts/docs/reference_api.py`, `scripts/docs/reference_sql_tasks.py`, `docs/reference/{python,app-lib,tasks,supabase}.md`, `mkdocs.yml`, `requirements-docs.txt`, `.github/workflows/docs-site.yml`, `tests/test_docs_reference.py`. Modified: `.github/workflows/ci.yml` (one step), `docs/reference/README.md`, `docs/README.md` (one line), `.gitignore` (`.docs-site/`), `ROADMAP.md` (B6 status).

## Commands run

```
pip install mkdocs-material==9.8.0 pytest pyyaml
python -I scripts/docs/build_reference.py
python -I scripts/docs/build_reference.py --check
mkdocs build -d .docs-site
python -m pytest -q tests/test_docs_reference.py
python -I scripts/docs/check_entry_points.py
python -I scripts/docs/drift.py
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Generated reference files in docs/reference/ | 2 | 6 | +4 |
| Pipeline tasks catalogued | 0 | 78 | +78 |
| Public tables / policies listed | 0 | 67 / 96 | |
| Docs site build | none | 4 s, 2.7 MB search index | |

The API files' counts (modules, exports, documented share) are in the first line of each file.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| mkdocs.yml would not parse | a colon in the unquoted site_description | quoted it |
| SyntaxWarning noise from ast.parse | old regex strings in pipeline files | warnings silenced inside the generator |
| Em dash from a source comment reached the docs | copied header text | generator replaces em and en dashes |

## How to undo

`git revert` the T1167 commits. Nothing live changed.

## What is still open

Rows T1167-a to T1167-e in `Execution/_OPEN.md`. Not run in this container: the Cloudflare deploy, TypeDoc, the CI jobs themselves (the commands they run were run here). The `--check` of python.md and app-lib.md is advisory (a note) unless `--strict`, because any code edit changes them.

## Owner steps (for the checklist)

- [T1167-a] Create the private carta-docs site | the docs site only exists as a CI artifact until it is hosted behind a login | In Cloudflare Pages create project `carta-docs`; put Cloudflare Access (owner email only) in front of it; download the `carta-docs-site` artifact from a docs-site run (or build with `pip install -r requirements-docs.txt && mkdocs build -d .docs-site`) and run `npx wrangler pages deploy .docs-site --project-name carta-docs` | Execution/P15/T1167-docs-site.md
