# Generated reference

Generated files only: never edit them by hand, change the source and regenerate.

| File | What | Generator | CI |
|---|---|---|---|
| [config.md](config.md) | Every key of `continent-app/config/` and `scripts/quality/rules.yaml`: type, value, unit, the code that reads it, what it changes for a traveller, the handbook section; dead keys listed (ROADMAP B4, T1165) | `python -I scripts/docs/config_reference.py` | `ci.yml` python job, `--check`: fails when a key is added or removed without regenerating |

Still to come with ROADMAP B6: the Python API, the app library API, the task catalogue, OpenAPI, Supabase tables and policies. Until then, read the code and [../SCHEMA.md](../SCHEMA.md).
