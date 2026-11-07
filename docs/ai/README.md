# AI docs

What Carta's AI does, how it is checked and where it is weak. The public summary is the "How Carta uses AI" page in the app (`/?legal=ai`, `continent-app/src/components/AiPage.jsx`); a figure changed in a card changes there too (`continent-app/scripts/verify_ai_page.mjs` pins the figures).

| Doc | What |
|---|---|
| [model-card-ask.md](model-card-ask.md) | Ask Carta: models, checks, eval numbers, limits, EU AI Act reading (T1156) |
| [model-card-plan-day.md](model-card-plan-day.md) | plan-day: model chain, checks, eval, limits (T1156) |
| [model-card-suggest-city.md](model-card-suggest-city.md) | suggest-city (AI town suggestions): model chain, grounding, checks, eval, limits (T1215) |
| [model-card-parse-booking.md](model-card-parse-booking.md) | parse-booking (magic import): model chain, checks, eval and the failure-case set, limits (T1215) |
| [model-card-tagger.md](model-card-tagger.md) | The F2 place tagger: a stub until it exists (T1156) |
| [model-strategy.md](model-strategy.md) | Which model serves each AI feature, the options with price and quality, and the switch triggers; the numbers live in `continent-app/config/ai_models.json` (E8, T1138) |
| [taxonomy.md](taxonomy.md) | The F1 travel taxonomy (T1149) |
| [../data/coverage-parity.md](../data/coverage-parity.md) | The D6 parity table: coverage per country, region and language (T1145) |

Rules for the cards: every number comes from a task report and names it; "not measured" is written where it is true; no dash characters in prose; a new AI feature gets a card before it ships.

Rules of the features: the handbook sections "Ask Carta", "AI day plan (plan-day)", "AI town suggestions (suggest-city)" and "Magic import (parse-booking)" in [../HANDBOOK.md](../HANDBOOK.md). Runtime AI is Gemini behind the Edge Functions and open models on Workers AI for Ask, through one gateway (`supabase/functions/_shared/aiModels.mjs`, the pipeline's twin `pipeline/ai_gateway.py`); every prompt a model gets lives in the prompt registry, `prompts/` (HANDBOOK "Prompt registry"); never the Claude API.
