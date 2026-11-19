# Run report · AI fix program wave 1: Gemini hygiene, truthful telemetry, capacity that never refuses payers, funnel events (E1, E3, E4, E7)
Status: built on p15-fix-ai (08e05f9302), judged by the program session before merge. Items A0, A0b, A1. Source: gemini-rag decision S1 to S4, north-star lane 1.

Changed: live chain pinned (3.5 then 3.1 Flash-Lite), thinking minimal with a guarded retry; ai_models.json live_chain, batch_chain, prices, thinking, capacity generated into aiConfig.mjs (two copies by continent-app/scripts/ai/gen_ai_config.mjs); events record thought, cached, grounded counts and thinking (migration 078); ai_consume_v2 (cache hits free of the shared count, per-user daily limit 20 plans and 10 grounded for every tier, free refused at the ceiling, Pass never), cache peek before quota, cache-aware refund, capacity triggers; funnel.js with ask_answer and ask_to_plan; docs/owner/ai.md (AI-1 to AI-10), decision 0013, ROADMAP E1/E3/E4/E7, INDEX lines.

Gates: price test passed (19); SQL 37 checks on a throwaway Postgres passed; live thinking field, 078 apply and deploy open-owner; guests in the breaker deferred to lane 6 (A6).

Cross-program: AskSearchFull.jsx one call line (logic); tests/test_ai_gateway.py two assertions on the pinned chain (data). Requests: intros via Gateway.batch (data); admin funnel card shows ask_answer and ask_to_plan (logic).

Undo: git revert 08e05f9302. If 078 was applied, run 078_ai_hygiene_down.sql: it deletes the Ask funnel counts, the day_cap rows and the cached split. Cache keys include the chain, so every cached plan starts fresh once.
