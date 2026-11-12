# E-R3: models and hosting per AI feature

Research for ROADMAP E-R3, input to E7 (model strategy). Task T1135, 2026-11-06. No code was changed.

**Question.** Which model, hosted where, answers each Carta AI feature best per euro, now and at 1,000, 10,000 and 100,000 monthly active users (MAU)?

**Short answer.**
1. At today's volume every option costs a few euros a month or less. Price does not decide anything yet; quality on the E1 eval, EU data residency and operations time do.
2. Moving live features from Gemini 3.5 Flash-Lite to an open model behind a pay-per-token API (Workers AI, OVHcloud, Scaleway) cuts the token bill by about 3 to 7 times. That move pays before any self-hosting does.
3. A self-hosted GPU (Hetzner GEX45, EUR 214 a month) only beats the cheapest open APIs at about 165,000 MAU across all live features. It beats Gemini Flash-Lite at about 25,000 MAU. The order is therefore: Gemini, then an open model through an API, then a GPU, never Gemini straight to a GPU.
4. The pipeline batch jobs (intros, tagging, trail summaries, blog drafts) fit the build box's CPU now: under 20 CPU hours for the biggest full run, less than one euro of on-demand CAX41 time.
5. At 100,000 MAU the biggest Gemini line is not tokens but Google Search grounding (about EUR 400 a month at the assumptions below). That is a pricing question for the paid tiers, not a model question.
6. parse-booking is the one feature that handles personal data (names, booking codes, emails in the documents). Its switch point is set by the legal review (C9, ARTICLE30), not by volume.

## 1. How each feature calls a model today

Read from the code on `p15-round2`, 2026-11-06.

| Feature | Where | Model chain today | Output form |
|---|---|---|---|
| Ask | `continent-app/functions/api/ask/answer.js` | Workers AI `@cf/qwen/qwen3-30b-a3b-fp8`, then `@cf/meta/llama-3.2-3b-instruct`; opt-in on device Qwen 2.5 1.5B (WebLLM, `src/lib/ask/onDevice.js`) | Streamed prose, at most 380 tokens (`MAX_ANSWER_TOKENS`), checked sentence by sentence |
| plan-day | `supabase/functions/plan-day/index.ts` | `DEFAULT_MODEL_CHAIN` in `plan-day/logic.mjs`: `gemini-flash-lite-latest`, `gemini-3.5-flash-lite`, `gemini-flash-latest` | JSON through `responseSchema`; optional Google Search grounding (own quota) |
| suggest-city | `supabase/functions/suggest-city/index.ts` | Same chain | JSON through `responseSchema`, or prompted JSON when grounded (the two cannot be combined) |
| parse-booking | `supabase/functions/parse-booking/index.ts` | Same chain | JSON through `responseSchema`; PDF and images sent as `inline_data` |
| Batch: intros | `pipeline/dossier/rewrite_intros.py` | `gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3.5-flash-lite` | Text, ten destinations per call |
| Batch: tagging, summaries, blog drafts | F1, D7, D9, D24, K14 (planned) | None yet | Labels, short text, Markdown |

## 2. Tokens per call, estimated from the prompts

Counted from the prompt builders (`buildPrompt` in each Edge Function, `systemRules` in `_shared/aiGuard.mjs`, `systemPrompt` and `userPrompt` in `src/lib/ask/context.js`) at about 3.5 characters per token for prose and 3 for JSON. Real counts come from E4 observability; these are planning figures.

| Feature | Input tokens | Output tokens | How the input adds up |
|---|---|---|---|
| Ask | about 1,500 | about 300 (cap 380) | system rules 926 characters, system prompt, up to 14 notes of 300 characters, a question of at most 200 |
| plan-day, one day | about 4,500 | about 900 | system rules, about 2,500 characters of rules that apply, 30 candidates of about 300 characters each (`selectCandidates` limit 30, `desc` up to 150) |
| plan-day, three days | about 8,000 | about 1,500 | 30 + 12 per extra day candidates |
| suggest-city | about 8,000 | about 400 | up to 150 town candidates with up to six tags each (`sanitizeTownCandidates`) |
| parse-booking | about 4,000 | about 1,000 | about 900 tokens of rules plus a typical two to three page confirmation or pasted email (limit 80,000 characters) |
| Thinking models | | plus 1,700 to 2,200 | measured in `suggest-city/index.ts` for `gemini-flash-latest`; billed as output |

Batch jobs, one full run:

| Job | Calls or items | Input | Output |
|---|---|---|---|
| Destination intros (3,868 places, ten per call) | about 390 calls | about 4.7 M tokens | about 0.6 M |
| Tagging (F1, about 20,000 items) | 20,000 | about 12 M | about 1.6 M |
| Trail summaries (D24 top band, about 3,000) | 3,000 | about 4.5 M | about 0.6 M |
| Blog drafts (K14, about ten posts a month) | 10 | about 0.08 M | about 0.015 M |

## 3. Call rates per user (assumptions)

No users yet, so these are assumptions to be replaced by E4 and K12 data (register row T1135-c).

| Feature | Billed calls per MAU per month | Reasoning |
|---|---|---|
| Ask | 6 | a few questions per planning session |
| plan-day | 1.4 | two plans, about 30 percent served from `ai_plan_cache` |
| suggest-city | 0.5 | one in two users asks for a day trip idea |
| parse-booking | 0.3 | a minority uploads bookings |
| Grounded searches | 0.38 | 10 percent of plan-day and suggest-city calls grounded, about two searches each (paid tiers only) |

## 4. Prices

**Sources and their state.** This session's network blocks the primary price pages (`ai.google.dev`, `developers.cloudflare.com` did not resolve), so every price below comes from web search results that quote them, with the link given. Register row T1135-a verifies each one against the primary page before E7 relies on it. Dollar prices are converted at 0.87 EUR per USD (an assumption). All prices exclude VAT.

| Option | Model | Input per M tokens | Output per M tokens | Source |
|---|---|---|---|---|
| Gemini API | Gemini 3.5 Flash-Lite | USD 0.30 | USD 2.50 (thinking included) | [Maximem, read from Google's page of 2026-10-27](https://www.maximem.ai/blog/gemini-api-pricing-2026), [pricepertoken](https://pricepertoken.com/pricing-page/model/google-gemini-3.5-flash-lite), [OpenRouter](https://openrouter.ai/google/gemini-3.5-flash-lite) |
| Gemini API | Gemini 3.6 Flash | USD 0.75 to 31 Dec 2026, then 1.50 | USD 3.75, then 7.50 | [guptadeepak](https://guptadeepak.com/ai-models/google/gemini-3-6-flash/), [pricepertoken](https://pricepertoken.com/pricing-page/model/google-gemini-3.6-flash), [modelcompare](https://modelcompare.dev/models/google/gemini-3-6-flash) |
| Gemini API | Gemini 2.5 Flash-Lite (older, retirement risk) | USD 0.10 | USD 0.40 | [morphllm](https://www.morphllm.com/gemini-api-pricing) |
| Gemini API | Batch mode | half price | half price | [Maximem](https://www.maximem.ai/blog/gemini-api-pricing-2026) |
| Gemini API | Grounding with Google Search (Gemini 3) | 5,000 prompts a month free, then USD 14 per 1,000 search queries | | [Google pricing page snippet](https://ai.google.dev/pricing?hl=hu), [Google forum](https://discuss.ai.google.dev/t/grounding-free-quota-clarifying-2026-rules-for-gemini-2-5-flash-paid-tier-1/144593) |
| Workers AI | `@cf/qwen/qwen3-30b-a3b-fp8` (Ask today) | USD 0.051 (4,625 Neurons) | USD 0.335 (30,475 Neurons) | [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/), matches `answer.js` |
| Workers AI | `@cf/openai/gpt-oss-20b` | USD 0.20 | USD 0.30 | [Cloudflare pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) via search |
| Workers AI | `@cf/mistralai/mistral-small-3.1-24b-instruct` | USD 0.351 | USD 0.555 | same |
| Workers AI | `@cf/google/gemma-3-12b-it` | USD 0.345 | USD 0.556 | same |
| Workers AI | Neurons | USD 0.011 per 1,000 Neurons; 10,000 Neurons a day free | | same |
| Scaleway Generative APIs (Paris) | `qwen3.6-35b-a3b` | EUR 0.25 | EUR 1.50 | [Scaleway](https://www.scaleway.com/generative-apis/) |
| Scaleway | `gemma-4-26b-a4b-it` (text and vision) | EUR 0.25 | EUR 0.50 | same |
| Scaleway | `llama-3.3-70b-instruct` | EUR 0.90 | EUR 0.90 | same; 1 M free tokens, Batches API discount |
| OVHcloud AI Endpoints (France) | Mistral-Small-3.2-24B | USD 0.09 | USD 0.28 | [Maxim calculator](https://www.getmaxim.ai/bifrost/llm-cost-calculator/provider/ovhcloud/model/mistral-small-3.2-24b-instruct-2506), [OVHcloud billing doc](https://docs.ovhcloud.com/fr/guides/public-cloud/ai-machine-learning/ai-endpoints-billing.md) |
| OVHcloud | gpt-oss-20b | USD 0.05 | USD 0.18 | [computeprices](https://computeprices.com/providers/ovhcloud/models/gpt-oss-20b) |
| OVHcloud | Qwen 3.6 27B | USD 0.47 | USD 3.19 | [computeprices](https://computeprices.com/providers/ovhcloud/models/qwen-3-6-27b) |
| IONOS AI Model Hub (Germany) | Qwen3.5-9B | EUR 0.10 | EUR 0.15 | [IONOS price list](https://docs.ionos.com/cloud/support/general-information/price-list/ionos-cloud-eur-en), [AI Model Hub](https://cloud.ionos.com/managed/ai-model-hub) |
| Mistral La Plateforme (EU) | Mistral Small, Ministral 8B | USD 0.10 to 0.15 | USD 0.15 to 0.60 | [aicostcheck](https://aicostcheck.com/provider/mistral), [benchlm](https://www.benchlm.ai/mistral/api-pricing); one source says the API is business customers only since 2026-08 ([agentdeals](https://agentdeals.dev/mistral-api-pricing-2026)) |
| Nebius Token Factory | Qwen3-32B | USD 0.10 | USD 0.30 | [Nebius prices](https://nebius.com/prices-ai-studio); EU data centre not confirmed |

Hardware:

| Option | Spec | Price | Source |
|---|---|---|---|
| Hetzner CAX41 (ARM CPU, the on-demand box) | 16 vCPU Ampere, 32 GB | EUR 31.49 a month (new orders after 2026-06-15 may be EUR 40.99), billed hourly | [privatedevops](https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do), [heise](https://heise.de/-11333037) |
| Hetzner GEX45 (GPU) | RTX PRO 4000 Blackwell SFF, 24 GB | EUR 214 a month plus EUR 209 setup | [Hetzner press release](https://www.hetzner.com/pressroom/hetzner-expands-its-gpu-portfolio-with-the-gex45/) |
| Hetzner GEX63 (GPU) | RTX PRO 6000 Blackwell Max-Q, 96 GB | about EUR 999 a month plus setup | [wz-it](https://wz-it.com/blog/hetzner-gpu-server-vergleich/) |
| GEX44 | RTX 4000 SFF Ada, 20 GB | no longer orderable | same |

Throughput used for the self-hosting numbers:
- **CPU:** about 18 to 22 tokens a second generation and about 420 tokens a second prompt processing for a 7B Q4 model on Ampere Altra cores ([llama.cpp Ampere guide](https://gist.github.com/andrewginns/cf95867c2d79458bd894c07b9e7d5cbd), [Phoronix llama.cpp](https://openbenchmarking.org/test/pts/llama-cpp&eval=6ec440762e0ebc1af4c8a53ca2fae5a7403dd9fd)). Qwen3-30B-A3B is a mixture of experts with about 3B active parameters, so it should generate at least as fast while answering like a much larger model; its Q4 file (about 18 GB) fits the CAX41's 32 GB. To be measured on the box (T1135-f).
- **GPU:** vLLM with Qwen3-8B on one A10 (24 GB): 100 tokens a second at 4 concurrent users, 348 at 16, 851 at 64 ([TrueFoundry vLLM benchmark](https://www.truefoundry.com/de/blog/vllm-benchmark)). The GEX45 card has similar memory and bandwidth, so about 300 to 800 tokens a second aggregate is the planning figure.

## 5. Cost per 1,000 calls (EUR)

From the token estimates in section 2 and the prices in section 4. Thinking models add 2,000 output tokens per call; gpt-oss adds 300 for its reasoning.

| Option | Ask | plan-day | suggest-city | parse-booking |
|---|---|---|---|---|
| Gemini 3.5 Flash-Lite (today's first choice) | 1.04 | 3.13 | 2.96 | 3.22 |
| Gemini 3.6 Flash, thinking, intro price | 8.48 | 12.40 | 13.05 | 12.40 |
| Gemini 3.6 Flash, thinking, from 2027 | 16.97 | 24.80 | 26.10 | 24.80 |
| Gemini 2.5 Flash-Lite | 0.24 | 0.71 | 0.84 | 0.70 |
| Workers AI Qwen3-30B-A3B (Ask today) | 0.15 | 0.46 | 0.47 | 0.47 (text only) |
| Workers AI gpt-oss-20b | 0.42 | 1.10 | 1.58 | 1.04 (text only) |
| Workers AI Mistral Small 3.1 24B | 0.60 | 1.81 | 2.64 | 1.70 |
| Workers AI Gemma 3 12B | 0.60 | 1.79 | 2.60 | 1.68 |
| Scaleway Qwen 3.6 35B-A3B | 0.83 | 2.48 | 2.60 | 2.50 |
| Scaleway Gemma 4 26B-A4B | 0.53 | 1.58 | 2.20 | 1.50 (vision) |
| OVHcloud Mistral Small 3.2 24B | 0.19 | 0.57 | 0.72 | 0.56 |
| OVHcloud gpt-oss-20b | 0.16 | 0.38 | 0.46 | 0.38 (text only) |
| IONOS Qwen3.5-9B | 0.20 | 0.59 | 0.86 | 0.55 (text only) |
| CPU on the box (llama.cpp) | not live | not live | not live | not live |
| GPU (GEX45, vLLM) | fixed EUR 214 a month, about zero per call | | | |
| On device (WebLLM) | 0 | not offered | not offered | not offered |

Grounding on top, plan-day and suggest-city only: EUR 12.18 per 1,000 grounded searches past the free 5,000 prompts a month.

## 6. Cost per month by user count (EUR)

All four live features on one option, at the call rates in section 3. Workers AI subtracts nothing for its free daily Neurons here; those cover Ask up to about 560 answers a day (16 Neurons each), about 2,800 MAU.

| Option | 1,000 MAU | 10,000 MAU | 100,000 MAU |
|---|---|---|---|
| Gemini 3.5 Flash-Lite | 13 | 131 | 1,309 |
| Gemini 3.6 Flash, intro price | 79 | 785 | 7,850 |
| Gemini 3.6 Flash, from 2027 | 157 | 1,570 | 15,699 |
| Gemini 2.5 Flash-Lite | 3 | 30 | 302 |
| Workers AI Qwen3-30B-A3B | 2 | 20 | 195 |
| Workers AI gpt-oss-20b | 5 | 51 | 514 |
| Scaleway Gemma 4 26B-A4B | 7 | 69 | 690 |
| Scaleway Qwen 3.6 35B-A3B | 10 | 105 | 1,046 |
| OVHcloud Mistral Small 3.2 24B | 2 | 25 | 247 |
| OVHcloud gpt-oss-20b | 2 | 18 | 183 |
| IONOS Qwen3.5-9B | 3 | 26 | 258 |
| GPU GEX45, one card | 214 plus operations | 214 plus operations | 214 to 428 plus operations (one card near its limit, see below) |
| Grounding, any Gemini option | 0 (inside the free 5,000) | 0 | about 402 |

Today's actual split (Ask on Workers AI, the rest on Gemini 3.5 Flash-Lite), at 100,000 MAU: Ask EUR 92, plan-day EUR 439, suggest-city EUR 148, parse-booking EUR 97, grounding EUR 402, about EUR 1,180 a month.

**GPU capacity check.** At 100,000 MAU the four features need about 356 M output and 2 billion input tokens a month. One GEX45 at about 400 tokens a second aggregate gives about 1 billion output tokens a month at full load, about 310 M at a realistic 30 percent average (traffic peaks in the evening). So one card is near its limit at 100,000 MAU and a second is needed for headroom and failover. A GPU also adds operations time (updates, monitoring, on-call when it breaks), estimated at four hours a month.

**Batch jobs, one full run (EUR).**

| Job | Gemini 3.5 Flash-Lite, batch mode | Gemini 3.6 Flash, batch, 2027 | Workers AI Qwen3-30B-A3B | CAX41 CPU, hours | CAX41 CPU, EUR |
|---|---|---|---|---|---|
| Intros | 1.27 | 5.03 | 0.38 | about 7 | 0.31 |
| Tagging | 3.31 | 13.06 | 1.00 | about 19 | 0.81 |
| Trail summaries | 1.24 | 4.90 | 0.37 | about 7 | 0.30 |
| Blog drafts, a month | 0.03 | 0.11 | 0.01 | under 1 | 0.01 |

The CPU hours assume two parallel llama.cpp slots at 1.6 times one stream's speed. Every option is cheap; the CPU wins on having no quota, no rate limit and no data leaving Carta's own box.

## 7. Quality, licence and data residency per option

The quality column is an expectation from model class and features, not a measurement: the E1 eval (T1136) does not exist yet. E7 (T1138) fills it with E1 and F6 scores (T1135-b).

| Option | Expected quality for Carta | Structured JSON | PDF and images | Dutch and English | Licence | EU data residency |
|---|---|---|---|---|---|---|
| Gemini 3.5 Flash-Lite | High for plan-day, suggest-city and parse-booking; proven in production | Yes, `responseSchema` | Yes, native PDF | Strong | Proprietary, Gemini API terms | Gemini API processes globally. EU regions (Eemshaven, Frankfurt, Paris) only through Vertex AI ([Google data residency](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency?hl=en)). Paid-tier prompts are not used for training ([waimakers](https://www.waimakers.com/en/resources/ai-data-security/gemini-google)) |
| Gemini 3.6 Flash (thinking) | Highest of the list, slowest; worth it only where Flash-Lite fails E1 | Yes | Yes | Strong | Proprietary | As above |
| Workers AI Qwen3-30B-A3B | Good for Ask (in use); likely good for plan-day and suggest-city with JSON mode; to be measured | JSON mode on supported models | No (text model) | Good | Apache 2.0 | Runs on Cloudflare's global network; no EU pin on the standard plan (to verify, T1135-a) |
| Workers AI gpt-oss-20b | Good reasoning, weaker prose in Dutch (to measure) | JSON mode | No | Fair | Apache 2.0 | As above |
| Workers AI Mistral Small 3.1, Gemma 3 12B | Good; Gemma 3 12B reads images | JSON mode | Gemma 3: images | Good | Apache 2.0 (Mistral); Gemma terms (Gemma 3) | As above |
| Workers AI Llama 3.2 3B (Ask fallback) | Weak; fallback only | Limited | No | Weak in Dutch | Llama Community Licence (attribution, 700 M MAU clause) | As above |
| Scaleway Gemma 4 26B-A4B | Good, multimodal: the open candidate for parse-booking | OpenAI-compatible structured output | Yes (vision) | Good | Apache 2.0 since Gemma 4 ([implicator](https://www.implicator.ai/google-releases-gemma-4-under-apache-2-0-dropping-its-custom-ai-license/)) | Paris, French company |
| Scaleway Qwen 3.6 35B-A3B | Good, newest Qwen MoE | Yes | Vision variant listed | Good | Check the model card: newer Qwen releases may carry tighter terms ([urandom](https://urandom.io/blog/2026-04-05-gemma-4-apache-license-matters-more-than-benchmarks)) | Paris |
| OVHcloud Mistral Small 3.2 24B | Good, cheapest strong EU option | Yes | No (text) | Good (French company model) | Apache 2.0 | France |
| IONOS Qwen3.5-9B | Fair; small | Yes | No | Fair | Apache 2.0 (to verify per card) | Germany ([IONOS](https://cloud.ionos.com/managed/ai-model-hub)) |
| Mistral La Plateforme | Good | Yes | Pixtral and newer for images | Good | Apache 2.0 for Small; proprietary for Medium and Large | EU by default; zero retention on request ([wavect](https://wavect.io/blog/eu-data-residency-ai-apps-2026/)) |
| CPU on the box (llama.cpp, Qwen3-30B-A3B Q4) | Same model as Ask's Workers AI path, slightly lower after 4-bit quantisation; to measure | Grammar-constrained JSON (GBNF) | No | Good | Apache 2.0 | Hetzner, Germany or Finland, Carta's own box |
| GPU on Hetzner (vLLM) | Any model up to about 30B in 4-bit on 24 GB | Guided decoding | With a vision model | Good | Per model | Carta's own box |
| On device (WebLLM Qwen 2.5 1.5B, Gemma 2 2B) | Low; acceptable only behind verify.js for short Ask answers | No | No | Fair | Apache 2.0 (Qwen 2.5 1.5B); Gemma terms (Gemma 2) | Never leaves the device |

Personal data per feature:
- **parse-booking:** high. Booking documents carry names, codes, addresses and emails; the prompt tells the model to drop them, but the model still reads them. EU residency matters here first.
- **plan-day:** low to medium. The free-text wish and the profile, no identifiers.
- **Ask, suggest-city:** low. A question, a stay position, interests.
- **Batch jobs:** none. Catalogue and public sources only.

## 8. Proposed switch points for E7

The general rule, from the ROADMAP E7 form: move live traffic to a self-hosted GPU when the API spend that a GPU would replace has been above 1.5 times the GPU server's monthly cost (1.5 times EUR 214 = about EUR 320) for two months in a row, and the self-hosted model scores within the E1 tolerance. Move back if quality drops or volume falls. The steps below apply that rule per feature, with the earlier, cheaper step (an open model through an API) in front of it.

| Feature | Now (0 to about 3,000 MAU) | Step 1: open model through an API | Step 2: self-hosted GPU | Fallback kept |
|---|---|---|---|---|
| **Ask** | Stay on Workers AI Qwen3-30B-A3B inside the free Neurons; keep on device as opt-in | Already there. Above about 2,800 MAU the free Neurons run out: switch on the Workers paid plan (T1135-h), cost about EUR 1 per 1,000 MAU a month | When Ask's Workers AI spend passes EUR 320 a month for two months (about 350,000 MAU for Ask alone at today's call rate; about 165,000 MAU if every live feature runs on the same model), or earlier if plan-day already runs on a Carta GPU and Ask can share it | Llama 3.2 3B on Workers AI, then the facts answer |
| **plan-day** | Stay on Gemini 3.5 Flash-Lite; pin the model ids instead of `-latest` aliases (T1135-e) | When plan-day's Gemini spend passes EUR 50 a month for two months (about 11,000 MAU) and an open model (Qwen3-30B-A3B on Workers AI, or Mistral Small 3.2 on OVHcloud for EU residency) scores within the E1 tolerance with schema-checked JSON: make it first in the chain | When the open-model spend of all features that can share one model passes EUR 320 a month for two months | Gemini 3.5 Flash-Lite behind the open model |
| **suggest-city** | Stay on Gemini; the ungrounded path is a candidate for the same open model as plan-day | Same trigger and model as plan-day, ungrounded calls only. Grounded calls stay on Gemini: no open option has Google Search | Only together with plan-day | Gemini |
| **Grounding** (plan-day and suggest-city) | Inside the free 5,000 prompts a month | When grounded searches pass about 4,000 a month (80 percent of the free 5,000, about 10,000 MAU at the assumptions), review the grounded allowance per tier in `plan_tiers` against USD 14 per 1,000 searches (owner, T1135-i) | Not applicable | Ungrounded plan, as today (`groundingSkipped`) |
| **parse-booking** | Stay on Gemini 3.5 Flash-Lite: native PDF reading and the best expected accuracy | Volume never forces a move before 100,000 MAU (about EUR 97 a month). The trigger is legal: when the C9 review says booking documents must stay in the EU, move to Gemini on Vertex AI in an EU region, or to Gemma 4 26B on Scaleway if it passes E1 (owner decision, T1135-d) | Not before 100,000 MAU; it needs a vision model, which costs more GPU memory | Gemini |
| **Batch jobs** (intros, tagging, trail summaries, blog drafts) | Move to llama.cpp on the box's CPU now, job by job, as each passes its eval (E1 for intros, F6 for tagging) | Not needed | Not needed: a GPU only shortens a run that already fits overnight | Gemini batch mode at half price |
| **On device** | Keep as opt-in for Ask | Not applicable | Not applicable | Server Ask |

Watch points for the monthly review (E7):
- **Price changes.** Gemini 3.6 Flash is reported to double on 2027-01-01. `gemini-flash-latest` is the third model in today's chain, so its share of calls (the `fellBack` rate in the admin panel) times the new price is the number to watch. Aliases also move to new models with new prices without warning (T1135-e).
- **Thinking tokens.** A thinking model costs four to eight times a lite model per call here because its thoughts are billed as output. A feature should only use one when the lite model fails E1.
- **Hetzner prices.** Hetzner changed prices three times in 2026 ([webhosting.today](https://webhosting.today/2026/05/29/hetzner-has-now-raised-prices-three-times-in-2026-this-one-is-different/)); the EUR 320 trigger follows the GEX45 price.

## 9. What this research did not settle

- Every price is quoted through search results, not read from the primary page (T1135-a).
- Quality is expected, not measured; E1 and F6 decide (T1135-b).
- Call rates per user are assumptions (T1135-c).
- CPU speed on the CAX41 is inferred from Ampere A1 figures (T1135-f).
- Whether Workers AI can keep requests in the EU on Carta's plan was not confirmed (T1135-a).
