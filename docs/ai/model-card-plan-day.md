# Model card: plan-day (Let Carta plan)

ROADMAP F8, T1156. Status: current as of 2026-11-06. Public summary: `/?legal=ai`. Rules: [HANDBOOK, AI day plan](../HANDBOOK.md#ai-day-plan-plan-day).

## What it is

An Edge Function that turns a town and a traveller's answers into a walking day (up to 7 days) chosen from up to 24 of Carta's own places, with one line on why each stop fits. The sister functions suggest-city (town suggestions) and parse-booking (booking import) use the same gateway and chain and are covered in the public page; they do not have their own card yet (T1156-e).

## Model

| Role | Model | Provider | Where configured |
|---|---|---|---|
| Day plan | chain `gemini-flash-lite-latest`, `gemini-3.5-flash-lite`, `gemini-flash-latest`, `gemini-3.1-flash-lite`, in order on 429, 404, 5xx or timeout | Google (Gemini API; the key must come from a billed Google Cloud project for EEA users) | `GEMINI_CHAIN` in `supabase/functions/_shared/aiModels.mjs`; `AI_PLAN_DAY_PROVIDER` and `AI_PLAN_DAY_MODELS` switch it (T1137) |
| Events (paid tiers, "events" ticked) | same, with Google Search grounding, up to 2 festivals or markets | Google | `AI_ENABLE_GROUNDING` |

Temperature 0.25 (0.45 for a refine). Structured output (`RESPONSE_SCHEMA`). Prompt: `prompts/plan-day/` (T1140). Never the Claude API. A change of provider needs the owner's decision (T1135-g).

## Intended use

A walkable day in one town of the catalogue. Out of scope: multi-town routing (the app does that), opening-hour guarantees, accessibility certification, anything outside Carta's deck.

## How it is kept honest

- A stop must be an id in the deck; name and coordinates come from Carta, not the model. Fake ids and duplicates are dropped; fewer than 2 stops is an error (`sanitizeAiStops`).
- Code re-times the day (2-opt, 12 km walking budget, legs over 6.5 km dropped, lunch rule). Events are never routed and are labelled "confirm this year's dates".
- Any failure falls back to the deterministic planner and refunds the plan unit.
- The AI guard (T1117) scrubs free text and the profile; quota is checked before the cache.

## Evaluation

Source: T1148 (`continent-app/scripts/eval/plan-day/`, run with `node scripts/eval/run.mjs`).

| Measure | Value |
|---|---|
| Test cases | 20 towns, 240 candidate places |
| Reference plans meeting every rule | 20 of 20 |
| Calibration sample | 40 plans, 22 pass and 18 fail the rules |
| Session judge against the rules, rubric 1 | kappa 0.604 (0.359 to 0.849), agreement 0.80 |
| Session judge against the rules, rubric 2 | kappa 0.898 (0.760 to 1), agreement 0.95 |
| Judge against human labels | not measured (labels are T1148-a) |
| Quality of live model plans | not measured (the live generate step is T1148-c) |

So there is no honest quality score for the model's plans yet. The rule checks that bound its output are tested; how good a plan feels is not.

## Known limits and risks

- The deck is Carta's ranking, so a plan favours highly rated places and the places the catalogue holds most of. See the parity table in the Ask card; the same gaps apply.
- The server keeps the first 28 candidates (handbook limit); the cache key does not include grounding (T327-a); cache rows are never deleted (T319-c).
- Free text goes to a third party (Google). It is scrubbed for injection, not for personal data; travellers are told on the public page not to type any.
- Multi-day plans were only walked with the mock seam (T823-a).

## Data and privacy

Sent to Google per request: the deck (ids, names, categories, ratings, coordinates, 150-character descriptions), the date, group size, pace, the stay, the free text and profile answers. Cached 7 days in `ai_plan_cache` by the hash of the request. Usage rows tie the call to the signed-in account for quota. See the privacy policy and `docs/legal/ARTICLE30.md`.

## EU AI Act reading (team view, not legal advice)

Not high-risk (a leisure suggestion with no legal or similar effect on a person). A traveller knows they asked an AI to plan; the plan summary does not yet say which lines the model wrote (T1156-c). Google carries the provider duties for the model.

## Report a problem

Email the support address with the town, date and what was wrong (a report button is planned, T1156-d).

## Change log

- 2026-11-06 (T1156): first card.
