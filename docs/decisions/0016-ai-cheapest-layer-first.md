---
status: accepted
date: 2026-11-19
decided-by: Bas (approved the AI north-star plan, 2026-11-17)
---

# 0016 · AI: cheapest layer first, proven by paired tests

## Context
Two research runs reviewed Carta's AI in November 2026: `.work/2026-11-17-gemini-rag/` (Gemini and Ask Carta: models, cost, accuracy, revenue) and `.work/2026-11-17-ai-north-star/` (the plan for every AI surface, approved by the owner). They found that model choice is not where the money is (a day plan costs about EUR 0.003 in tokens, a Trip Pass nets about EUR 5.40), but the setup leaked money and trust: live chains on `-latest` aliases and an uncontrolled thinking model, telemetry that mis-priced calls and missed thinking tokens, and a shared 200-a-day ceiling that counted cache hits and could refuse paying travellers. Several "1.0" eval scores tested the reference planner or hand-written answers, not Gemini.

## Options considered
1. **Move everything to Gemini** (one provider). Dearer for Ask under every scenario and adds embedding lock-in with no measured gain.
2. **Tiered routing with a paid Ask path.** Built before the owner decision and before any conversion data; tiers accuracy.
3. **Code first, measure first, then the cheapest model that passes.** Keep Ask on Workers AI and Gemini for plan-day, suggest-city, parse-booking and batch; fix hygiene, telemetry and capacity now; change models or retrieval only on a measured gain.

## Decision
We chose **option 3**, as approved in the north-star `decision.md`:
- **Cheapest layer first:** code, then precomputed files, then a live model. No model writes a digit a traveller sees; the verifier must find each figure in a cited note.
- **Hygiene before any switch (S1 to S4):** pinned model ids with no `-latest` alias in a live chain, thinking `minimal` on the Gemini features, one price table in `continent-app/config/ai_models.json` that the code is generated from, telemetry with thinking, cached and grounded counts, capacity that never refuses a Pass holder at the shared ceiling (cache hits free of it, a per-user daily limit the same for everyone, a breaker that cuts guests, then free users), and funnel events from Ask to the Pass.
- **Every saving or accuracy change is proven by a paired test:** a cheaper model, a cache, a reranker or new embeddings ships only when a paired non-inferiority (or superiority) test on recorded runs passes, with zero hard-rule violations. A planted-error set must stay 100% dropped by the verifier.
- **Free is never less true:** retrieval, the verifier, the note count and the facts answer are not tiered.
- Runtime AI stays off the Claude API (0005).

## Consequences
- Good: cost and quality claims rest on telemetry and recorded evals, not guesses; payers are not refused by a shared ceiling.
- Bad: gates need owner work (labels, key-backed runs, the live thinking check), so several stay open until the owner runs them (`docs/owner/ai.md`).
- Follow-ups: the build lanes in `ROADMAP.md` E1, E3, E4, E7 and the backlog of the ai fix program.

## How we'll know it works
`ai_model_events` shows no `-latest` model and a thought-token share per feature; `ai_cap_events` shows no `global_cap` refusal of a Pass tier; `funnel_counts` shows `ask_answer` and `ask_to_plan`; every model or retrieval change in the history names its paired test.
