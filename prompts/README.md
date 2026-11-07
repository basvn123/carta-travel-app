# prompts: the prompt registry

Every prompt Carta sends a model lives here, not in code (T1140, ROADMAP E5). The full rules are in `docs/HANDBOOK.md`, bullet "Prompt registry".

## Why here

The prompts run in three places: the Supabase Edge Functions (Deno), the Cloudflare Pages Functions and the app (Vite), and the Python pipeline. The repository root is the only folder all three share, so the registry sits at the root, beside `evals/`. The Trips generator's pass prompts stay in `Trips/carta-unified/carta-unified/pipeline/prompts/`, where its golden set hashes them; the registry lists them in place.

## What is here

- `registry.json`: one entry per prompt id: the current `version` and `file`, the `sha256` of its text, where it runs (`bundle`, `node`, `python`), the `run.mjs` eval that guards it and its `lastScore`, or the other `guard` when no `run.mjs` eval exists.
- `<id>/v<N>.md`: one file per version. Front matter `id` and `version`, prose (purpose, callers, changelog), then fragments: a `### <name>` line, a `~~~` line, the text, a `~~~` line. Only the fragments reach a model; `{{name}}` is filled in by the caller.
- `_golden/`: the outputs of the code before the registry (commit 55a09c9c01), which the tests compare with the registry's output byte for byte.

## Changing a prompt

A committed version never changes. To change a prompt:

```bash
node scripts/prompts/registry.mjs bump plan-day
```

Edit the new `v<N+1>.md` (its fragments and its changelog line), then:

```bash
node scripts/prompts/registry.mjs record plan-day
```

```bash
node scripts/prompts/registry.mjs build
```

`record` hashes the new version, runs its eval through `continent-app/scripts/eval/run.mjs --check` and writes the score; `build` writes `supabase/functions/_shared/prompts.js` and its copy `continent-app/functions/_lib/prompts.js`. A change to a Trips pass prompt raises `version:` in that file instead, and the golden set is rebaselined.

`node scripts/prompts/registry.mjs check --base origin/main` is what CI runs (`.github/workflows/prompts.yml`).
