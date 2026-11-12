# Model card: Ask Carta

ROADMAP F8, T1156. Status: current as of 2026-11-06. Every number is from a task report; the report is named beside it. Public summary: the "How Carta uses AI" page (`/?legal=ai`, `continent-app/src/components/AiPage.jsx`).

## What it is

A chat where a traveller asks a question in plain words and gets (1) a facts answer written by code (places, prices, months) and (2) optionally a few written sentences that cite numbered notes. The model only rewords facts that code has put in the notes. Rules: [HANDBOOK, Ask Carta](../HANDBOOK.md#ask-carta).

## Models

| Role | Model | Provider | Where configured |
|---|---|---|---|
| Written answer, server | `@cf/qwen/qwen3-30b-a3b-fp8` | Cloudflare Workers AI (model by the Qwen team) | `WORKERS_AI_CHAIN` in `supabase/functions/_shared/aiModels.mjs`, copy `continent-app/functions/_lib/aiModels.js` |
| Written answer, fallback | `@cf/meta/llama-3.2-3b-instruct` | Cloudflare Workers AI (Meta) | same |
| Written answer, on device (opt in) | Qwen 2.5 1.5B (alternative Gemma 2 2B) | runs in the browser through WebLLM, files from Carta's data host | `continent-app/src/lib/ask/onDevice.js` |
| Question embedding | `minishlab/potion-multilingual-128M` (model2vec, distilled from BAAI/bge-m3) | runs in the Pages Function, no external call | `continent-app/functions/_lib/askEmbed.js` |

Prompt: `prompts/ask/` (registry, T1140). Never the Claude API.

## Intended use

Questions about places in Carta's catalogue (43 countries, 3,868 places at T1145), in en, nl, de, fr, es, it. Out of scope: anywhere outside Europe, live availability, booking, medical, legal or visa advice.

## How it is kept honest

- Code writes the first answer; the model never adds a number (T1136).
- Every sentence must cite an existing note; every figure must be in a note or the question; every catalogue place named must be in the notes and have a card on screen; verdicts ("cheaper") must cite a code-written comparison note (`verify.js`, `agree.js`).
- More than 30 percent of sentences failing, or none passing, withdraws the written answer.
- The AI guard scrubs the question and the notes (T1117); a daily cap protects the account (9,000 of 10,000 free Neurons).

## Evaluation

Set: `continent-app/scripts/eval/ask-set.json`, 200 questions in six languages (140 golden, 30 from the pipeline's multilingual set, 30 that must be refused). Gate: `.github/workflows/ask-eval.yml`, tolerance 2 points. Source: T1136, T1141, T1148.

| Measure | Value | Setting |
|---|---|---|
| hit@10 (one expected place in the top ten) | 0.930 | rules only |
| recall@10 | 0.568 | rules only |
| nDCG@10 | 0.600 | rules only |
| MRR | 0.828 | rules only |
| recall@10, MRR, nDCG@10 | 0.576, 0.838, 0.611 | BM25, rebuilt index (T1141) |
| Grounding | 0.996 of 689 checks | all retrievers run in CI |
| Abstention | 25 of 30 caught, 2 in-scope questions wrongly refused, correct 0.965 | |

Not measured: dense and hybrid retrieval (the index is not in git, T1136-a); a model-judged quality score of the written sentences; any per-language breakdown (the six languages are in one set; T1145-c asks for the split).

## Known limits and risks

- Dense retrieval alone is modest (recall@10 0.44, handbook limit); relevance weighs 0.1 in the ranking for that reason.
- Coverage is uneven: the parity table (below) names where the catalogue is thin, and answers about those places are thinner.
- The labelled set was written by the team and a session, not by independent travellers.
- `/api/ask/answer` takes notes as text, so inside the daily cap it could be used as a free model (T556-b).
- Written answers are English-notes-based and reworded by a small model into the question's language; wording quality per language is not measured.
- Prices are Carta's estimates, not quotes.

## Fairness: coverage parity

`docs/data/coverage-parity.md` (T1145, generated, 43 countries, 310 regions, 6 languages): 100 gaps, ranked in `docs/data/coverage-parity.csv` with IDs `D6-001` to `D6-100`. 10 country place gaps (556 places short; Germany, Austria, Bosnia and Herzegovina and Moldova under every weighting tried), 26 region gaps, 24 field gaps, 22 outdoor region gaps and 13 trail photo gaps, 5 language gaps (intro English only). The table says where Ask is likely to have less to say; it does not change a ranking.

## Data and privacy

The question (200 characters at most) and up to 14 notes go to Cloudflare Workers AI, unless the traveller uses the on-device model. Answers are cached in KV for 7 days by the hash of the pack. Chats are stored on the device and, signed in, in `ask_chats`. See the privacy policy and `docs/legal/ARTICLE30.md`.

## EU AI Act reading (team view, not legal advice)

A chatbot a person talks to: the transparency duty of Article 50 applies (Art 50(1): the person must know it is AI; Art 50(2): generated text must be marked, in a machine-readable way, as AI-generated). Not an Annex III high-risk use. Carta develops Ask and puts it into service under its own name, so Carta is the provider of this AI system (Art 3(3)) and also its deployer; the makers of the general-purpose models (Alibaba Cloud for Qwen, Meta for Llama) carry the separate model duties of Chapter V. The visible "Written by AI" line is built (`AiMark.jsx`, T1215); the machine-readable mark is a follow-up in ROADMAP F8, due before the public opening. Self-reviewed against Regulation (EU) 2024/1689 on 2026-11-12 (T1156-a).

## Report a problem

Email the support address with the question and what was wrong (a report button is planned, T1156-d). A reproducible case becomes a row in `ask-set.json`.

## Change log

- 2026-11-06 (T1156): first card.
