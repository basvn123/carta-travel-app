# T1135: model and hosting research per AI feature (E-R3)

ROADMAP E-R3, input to E7. Round 2 session S51, branch `p15-s51-model-research` from `origin/p15-round2`.

## Date

2026-11-06

## What changed

New research doc `docs/research/E-R3-models-and-hosting.md`: tokens per call estimated from the current prompts for Ask, plan-day, suggest-city, parse-booking and four batch jobs. It prices 13 API options (Gemini, Workers AI, Scaleway, OVHcloud, IONOS, Mistral, Nebius) plus CPU on the box, a Hetzner GPU and on device. It has a cost table per 1,000 calls per option and feature, a monthly cost at 1,000, 10,000 and 100,000 MAU, a quality, licence and EU residency table, and a proposed switch point per feature for E7. Findings:
- Today's split (Ask on Workers AI, the rest on Gemini 3.5 Flash-Lite) costs about EUR 13 a month at 1,000 MAU and about EUR 1,180 at 100,000, grounding included.
- Open models through an API are 3 to 7 times cheaper than Gemini Flash-Lite per call.
- A Hetzner GEX45 GPU (EUR 214 a month) only beats the cheapest open APIs at about 165,000 MAU, and beats Gemini at about 25,000 MAU. The proposed order is Gemini, then an open model through an API, then a GPU.
- Batch jobs fit the box's CPU now: under 20 hours and under EUR 1 per full run.
- parse-booking's switch is set by the EU residency question, not by volume.

No code changed.

## Research

The research is the deliverable: `docs/research/E-R3-models-and-hosting.md` holds every option, price, link and reason. In short:
- **Options compared:**
  - Gemini 3.5 Flash-Lite, 3.6 Flash and 2.5 Flash-Lite, with grounding and batch mode.
  - Workers AI: Qwen3-30B-A3B, gpt-oss-20b, Mistral Small 3.1, Gemma 3 12B, Llama 3.2 3B.
  - Scaleway: Qwen 3.6 35B-A3B, Gemma 4 26B-A4B, Llama 3.3 70B.
  - OVHcloud: Mistral Small 3.2, gpt-oss-20b, Qwen 3.6 27B.
  - IONOS: Qwen3.5-9B.
  - Mistral La Plateforme and Nebius.
  - llama.cpp on the Hetzner CAX41 CPU, vLLM on a Hetzner GEX45 or GEX63 GPU, and WebLLM on device.
- **Chosen (proposed, for E7 to confirm with E1 scores):**
  - Ask stays on Workers AI Qwen3-30B-A3B.
  - plan-day and the ungrounded suggest-city path move to an open model through an API (Qwen3-30B-A3B on Workers AI, or Mistral Small 3.2 on OVHcloud where EU residency is wanted) once plan-day's Gemini spend passes EUR 50 a month for two months and the open model passes E1. Gemini stays as fallback.
  - Grounded calls stay on Gemini.
  - parse-booking stays on Gemini until the C9 review decides on EU residency. Then it moves to Vertex AI EU or Scaleway Gemma 4.
  - Batch jobs move to llama.cpp on the box's CPU now, job by job.
  - A GPU waits until the spend it replaces passes EUR 320 a month (1.5 times the GEX45) for two months.
- **Why:** at Carta's volume the token bill is small next to a GPU's fixed cost and operations time, so the cheaper step (an open model behind an API) comes first. EU residency matters only where personal data is involved.
- **Limits:**
  - The primary price pages (`ai.google.dev`, `developers.cloudflare.com`) were blocked by this session's network policy. Prices come from web search results that quote them, each linked and to be verified (T1135-a).
  - Quality is expected, not measured, because E1 does not exist yet (T1135-b).

## Files touched

- Created: `docs/research/E-R3-models-and-hosting.md`, `Execution/P15/T1135-model-research.md`
- Modified: `Execution/_OPEN.md` (rows T1135-a to T1135-i appended), `ROADMAP.md` (E-R3 output cell marked done)

## Commands run

```
git fetch origin p15-round2
git checkout -b p15-s51-model-research origin/p15-round2
node scratchpad/sz.mjs        # systemRules length, 926 characters
python3 -I scratchpad/cost.py # the cost tables in sections 5 and 6
```

The two scratch scripts are not committed; their method is written out in the doc (sections 2, 3 and 5).

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| AI features with a cost per 1,000 calls for at least three options | 0 of 5 | 5 of 5 (estimated, not measured) | +5 |
| AI features with a proposed switch point | 0 | 5 plus grounding | +6 |

Quality per option is not measured (E1 does not exist yet).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| WebFetch of the Gemini and Workers AI price pages failed | The session's network policy does not allow `ai.google.dev` or `developers.cloudflare.com` | Prices taken from web search results quoting them, each linked; verification is row T1135-a |
| Static prompt length from `awk` came out far too short | The range ended at the first line starting with `}` (`}) {` of the signature) | Counted the line ranges with `sed -n` instead |

## Screens checked

None: no change a traveller sees.

## What is still open

- **T1135-a:** every price in the doc is quoted through search results. Verify each against the primary page before E7 relies on it: the Gemini pricing page, the Workers AI pricing page, Scaleway, OVHcloud, IONOS and Hetzner. The same check should confirm whether Workers AI can keep requests in the EU on Carta's plan. Needs a session whose network allows those hosts.
- **T1135-b:** the quality column is expected, not measured. E7 (S54) runs E1, and F6 for tagging, on at least three options per feature.
- **T1135-c:** the call rates per user (6 Ask, 1.4 plan-day, 0.5 suggest-city and 0.3 parse-booking a month, 10 percent grounded) are assumptions. Replace them with E4 and K12 data and recompute the triggers.
- **T1135-d (owner):** decide whether booking documents must be processed in the EU (C9, ARTICLE30). If yes, parse-booking moves to Gemini on Vertex AI in an EU region, or to an EU vision model that passes E1.
- **T1135-e:** `DEFAULT_MODEL_CHAIN` and `rewrite_intros.py` use `-latest` aliases. An alias moves to a new model with a new price without notice, so the triggers cannot be checked against a stable price. Pin the ids in the E3 model-access module.
- **T1135-f:** CPU speed on the CAX41 is inferred from Ampere A1 figures. Run `llama-bench` with Qwen3-30B-A3B Q4_K_M on the box before moving batch jobs.
- **T1135-g (owner):** CLAUDE.md says runtime AI stays on the Gemini-backed Edge Functions. Moving plan-day or suggest-city to an open model at the proposed trigger is the owner's decision, and CLAUDE.md changes with it.
- **T1135-h (owner):** Ask's free Workers AI Neurons cover about 560 answers a day (about 2,800 MAU). Past that, Ask needs the Workers paid plan or it answers with facts only.
- **T1135-i (owner):** at about 10,000 MAU grounded searches pass 80 percent of Gemini's free 5,000 a month. Review the grounded allowance per tier in `plan_tiers` against USD 14 per 1,000 searches.

## Owner steps (for the checklist)

1. Decide on EU residency for booking documents (T1135-d).
2. When Ask nears 560 answers a day, switch on the Workers paid plan (T1135-h).
3. When the plan-day trigger fires, decide whether to move it to an open model, and update CLAUDE.md in the same change (T1135-g).
4. At about 10,000 MAU, review the grounded allowance per tier (T1135-i).

## Rollback procedure

`git revert` of the T1135 commit. Documentation only; nothing is one-way.
