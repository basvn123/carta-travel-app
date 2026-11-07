# Generated reference

Generated files only: never edit them by hand, change the source and regenerate.

| File | What | Generator | CI |
|---|---|---|---|
| [config.md](config.md) | Every key of `continent-app/config/` and `scripts/quality/rules.yaml`: type, value, unit, the code that reads it, what it changes for a traveller, the handbook section; dead keys listed (ROADMAP B4, T1165) | `python -I scripts/docs/config_reference.py` | `ci.yml` python job, `--check`: fails when a key is added or removed without regenerating |

| [evals.md](evals.md) | Latest score and trend of every eval (F6, T1148) | `node continent-app/scripts/eval/run.mjs --write --dashboard` | its own eval jobs |
| [python.md](python.md) | Public functions and classes of `pipeline/`, `scripts/`, `src/` and `run_pipeline.py`, from `ast` (B6, T1167) | `python -I scripts/docs/build_reference.py` | `docs-site.yml` regenerates it; `--check --strict` fails when stale |
| [app-lib.md](app-lib.md) | Every export of `continent-app/src/lib` with its first comment line (B6) | same | same |
| [tasks.md](tasks.md) | Every `run_pipeline.py` task: cadence, writes, flags, commands (B6) | same | `ci.yml` and `docs-site.yml`, `--check`: fails when stale |
| [openapi.md](openapi.md) | Operations and schemas of the Intelligence API, from `services/intelligence/openapi.json` (F5, T1154) | `python -I scripts/docs/build_reference.py` (after `python -m intelligence.openapi_dump` in `services/intelligence/`) | `ci.yml`, `docs-site.yml` and `intelligence.yml`, `--check`: fails when stale |
| [supabase.md](supabase.md) | Tables, columns, RLS state, policies, functions and indexes replayed from `supabase/migrations` (B6) | same | same |

The site: `mkdocs.yml` at the repo root builds `docs/` with MkDocs Material and full-text search (`pip install -r requirements-docs.txt && mkdocs build -d .docs-site`).
