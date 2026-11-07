# Model card: suggest-city (AI town suggestions)

ROADMAP F8, register row T1156-e (T1215). Status: current as of 2026-11-07. Public summary: `/?legal=ai`. Rules: [HANDBOOK, AI town suggestions](../HANDBOOK.md#ai-town-suggestions-suggest-city).

## What it is

An Edge Function behind the day planner's town picker: the traveller describes a day trip ("a quiet coastal town, not touristy") and gets 3 to 5 towns within reach of their stay, each with one reason. Picks come from Carta's catalogue; a paying traveller with a search unit left can also get real towns beyond it through Google Search grounding.

## Model

| Role | Model | Provider | Where configured |
|---|---|---|---|
| Suggestions | the shared Gemini chain (`GEMINI_CHAIN`), in order on 429, 404, 5xx or timeout, 80 s budget | Google (Gemini API) | `supabase/functions/_shared/aiModels.mjs`; `AI_SUGGEST_CITY_PROVIDER` and `AI_SUGGEST_CITY_MODELS` switch it (T1137) |
| Towns beyond the catalogue | same, with Google Search grounding | Google | `AI_ENABLE_CITY_GROUNDING` (must be false on an unbilled key) |

Temperature 0.3, `maxOutputTokens` 8192. Without grounding the output is held to a strict schema; with grounding the shape is spelled out in the prompt and parsed loosely. Prompt: `prompts/suggest-city/` (prompt registry). Options and switch triggers: [model-strategy.md](model-strategy.md) and `continent-app/config/ai_models.json` (entry `suggest-city`). Never the Claude API.

## Intended use

Ideas for a day trip from where the traveller stays. Out of scope: routing, opening hours, prices, safety or accessibility claims, towns far from the stay.

## How it is kept honest

- A catalogue pick must be a real candidate id; a web discovery needs coordinates within 400 km of the stay; at most 5 (`sanitizeSuggestions` in `supabase/functions/suggest-city/logic.mjs`).
- `guardCityInput` scrubs the wish and drops injected candidates; `guardCityOutput` rejects an answer that is not `{suggestions[]}` and repairs names, countries and reasons; a cached payload passes `guardCityPayload` again (`_shared/aiGuard.mjs`).
- Any failure refunds the unit and the traveller keeps the normal town list.

## Evaluation

Source: T1206 (`continent-app/scripts/eval/suggest-city/`, run with `node scripts/eval/run.mjs suggest-city`).

| Measure | Value |
|---|---|
| Fixture decks | 6 cases |
| Cases meeting every rule, reference answers | 6 of 6 (this checks the prompt and the shipped path, not a model) |
| Planted bad picks dropped by the shipped path | 3 dropped, 1 repaired |
| Wish fit of live model answers | not measured (record live answers and pass `--answers`) |
| Facts in the one-line reasons | not measured |

## Known limits and risks

- The reasons are written by the model and are not checked against Carta's data; a reason can overstate a town.
- Grounded discoveries are real places by coordinates, but Carta has not researched them: no rating, no price.
- Grounding returned 429 on an unbilled key when tested (README, 2026-07-27); on a zero-billing key the feature answers from the catalogue only.
- The wish is not yet fenced as a data block in the prompt (row T1137-c).
- The candidates favour highly rated towns and the regions the catalogue holds most of (see the parity table in the Ask card).

## Data and privacy

Sent to Google per request: the candidate towns (ids, names, countries, up to 6 tags), the stay rounded to about 1 km, the wish (up to 160 characters), interests and the language. Cached 7 days in `ai_plan_cache`. Usage rows tie the call to the signed-in account for quota.

## EU AI Act reading (team view, not legal advice)

Not high-risk (a leisure suggestion with no legal or similar effect on a person). The traveller asked for AI suggestions; the reasons are model text (labelling them is register row T1156-c). Google carries the provider duties for the model. A lawyer's read is owner step T1156-a.

## Report a problem

From the support address on the public AI page. An in-app report button is register row T1156-d.

## Change log

- 2026-11-07 (T1215): first card.
