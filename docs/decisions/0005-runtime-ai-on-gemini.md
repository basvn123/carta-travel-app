---
status: accepted
date: 2026-09-23
decided-by: Bas
---

# 0005 · Runtime AI on Gemini, never the Claude API

## Context
Carta uses AI at runtime (day plans, booking import, Ask Carta) and at authoring time (code, data review, writing). The owner works through Claude Code and Claude Cowork on a subscription. Per-token API billing is far more than that budget, and an API key is one more secret to own.

## Options considered
1. **Claude API for runtime features.** Best fit with authoring, but a per-token bill and a key.
2. **Gemini through Supabase Edge Functions and Pages Functions.** Already built, within budget.

## Decision
We chose **option 2**. Runtime AI runs on Gemini through `supabase/functions/plan-day/`, `supabase/functions/parse-booking/` and `continent-app/functions/api/ask.js`. Nothing in the pipeline, the app or a function may add the `anthropic` or `@anthropic-ai/*` SDK, an `ANTHROPIC_API_KEY` or a call to `api.anthropic.com`. Work that needs a model at authoring time happens inside a Claude Code session (subagents included, which are not API calls). If a task seems to need the Claude API, stop and propose a non-API route. Model choices per feature: `docs/ai/model-strategy.md`.

## Consequences
- Good: a predictable cost; one runtime AI provider to secure.
- Bad: Claude-only capabilities are not available at runtime.

## How we'll know it works
A grep for `anthropic` in `pipeline/`, `continent-app/` and `supabase/` finds nothing but this rule.
