# T1141: Ask retrieval upgrades, measured on E1 (ROADMAP E2 with research E-R2, round 2 session S57)

## Date

2026-11-06

## What changed

Ask's BM25 now reads every question in English, also searches the server's beach, lake and peak passages, and is fused with the rules by rank instead of by a small weight. A question in Dutch, German, French, Spanish or Italian used to reach the English passages with almost no matching words (BM25 list recall@10 was 0 on most non-English questions). `src/lib/ask/query.js` now turns the question into English search words using only Carta's own vocabularies: stop words, months and trip words go, other-language vibe words bring their English words, and the vibe, area and country read by the rules are added. The browser's search now uses the field boosts the index was built for (they were never passed) and drops hits outside the country the question names (`bm25.json` stores the country code). `/api/ask` takes the BM25 words and searches `bm25-<src>.json` for beaches, lakes and peaks beside the dense half (`functions/_lib/askSparse.js`), built on the box by `build-ask-bm25.mjs`. In `rank.js` a find, near or plan answer fuses the rules order with the retrieved order by reciprocal rank (k 10, w 0.5), counting the retrieved rank among the places that pass the filters. Before, every relevance weight tried with the new query fell below the rules alone. On E1 the bm25 retriever went from recall@10 0.569 to 0.576, recall@5 0.569 to 0.585, MRR 0.802 to 0.838 and nDCG@10 0.596 to 0.611, and its own list from recall@10 0.323 to 0.413. With the server sources (offline index, retriever `sparse`): recall@5 0.598, MRR 0.847, nDCG@10 0.613. Latency per question stays a few milliseconds, well within the 1,200 ms budget. The reranker is a no-go for now (E-R2). The baseline is re-blessed with the higher scores.

## Research

E-R2, run by a research subagent with web search only (developers.cloudflare.com, huggingface.co and sbert.net did not resolve from the container, so facts come from search results and mirrors; the owner should confirm points 1 and 3 on the official pages).

| Option | Quality signal | Latency and cost | Fit for Carta |
|---|---|---|---|
| Workers AI `@cf/baai/bge-reranker-base` (the only reranker found on Workers AI) | BGE base cross-encoder; trained on English and Chinese only | about 1 neuron per call of 30 passages (3,500 tokens; 283 neurons per million tokens); latency not published, estimate 100 to 300 ms with the `env.AI` binding | language mismatch for NL, DE, FR, ES, IT; usable only on English passages with an English query |
| bge-reranker-v2-m3 (568M, multilingual) | BEIR nDCG@10 53.94 (Mixedbread table) | 3.05 s per query on an A100 in that table; not on Workers AI | too slow, needs its own server |
| jina-reranker-v2-base-multilingual | BEIR 54.35 (Mixedbread) or 57.06 (Jina) | Jina says 15 times faster than bge-v2-m3; int8 ONNX on a 2 to 4 vCPU box estimated 150 to 400 ms for 30 pairs | the only multilingual option near the budget, as a new self-hosted service |
| MiniLM-L6 cross-encoder (CPU, ONNX) | English only | about 15 ms for 30 pairs on 14 cores (Qdrant) | English only |
| Inside a Worker | n/a | 128 MB isolate, 10 MB script: a 278M model is about 280 MB even in int8 | not possible |

Evidence on when it helps: reranking BM25 with monoT5 lifts DBpedia-Entity nDCG@10 from 0.318 to 0.419, but a fielded BM25 is among the strongest baselines on entity catalogues, and a text reranker sees only passage text. Carta's weakest E1 questions ("quiet village by a lake", "warm in late October") turn on catalogue facts (crowding, climate, lakes nearby) that are not in the passages. The rules already answer those; a reranker could demote a right place whose blurb never names the fact.

Chosen: no reranker now (no-go). Sentence-Transformers' two-stage pattern (fast retriever, cross-encoder on the top 30 to 100) stays the shape if T1141-a says go. The live comparison needs Workers AI, which the container cannot reach, so it is owner step T1141-a with the command below. Go only if nDCG@10 rises at least 0.03 on free-text questions, no facet question drops, and added p95 stays under 300 ms.

For BM25 and fusion: MiniSearch BM25 (already in the app) on the server as well. Reciprocal rank fusion (Cormack et al. 2009) between the rules order and the BM25 order, because a weighted score mixes scales that do not compare. No query model: the six-language vibe vocabulary already in `guidedSearch.js` translates the words that matter.

Sources: https://developers.cloudflare.com/changelog/2025-03-17-new-workers-ai-models, https://developers.cloudflare.com/workers-ai/platform/pricing, https://developers.cloudflare.com/ai-search/configuration/reranking, https://developers.cloudflare.com/workers/platform/limits/, https://bge-model.com/tutorial/5_Reranking/5.2.html, https://sbert.net/examples/applications/retrieve_rerank/README.html, https://mixedbread.com/blog/mxbai-rerank-v2, https://qdrant.tech/blog/oxidizing-cross-encoders/, https://arxiv.org/pdf/2212.06121, https://arxiv.org/pdf/2010.03496, https://arxiv.org/abs/2305.07614. The Claude API was never used.

## Files touched

- Created: `continent-app/src/lib/ask/query.js` (the English BM25 query), `continent-app/functions/_lib/askSparse.js` (server BM25: sources, search, filters), `continent-app/tests/askRetrievalE2.test.mjs` (5 tests), this report.
- Modified: `continent-app/src/lib/ask/retrieve.js` (query words, boosts, country filter, `b` to `/api/ask`, server sparse hits fused in; askTerms imported statically), `continent-app/src/lib/ask/rank.js` (`REL`, `localRanks`, rank fusion in `findFacts`), `continent-app/functions/api/ask.js` (`b` parameter, `sparse` answer), `continent-app/functions/_lib/askTerms.js` (`cc` stored), `continent-app/scripts/build-ask-bm25.mjs` (server indexes, duplicate ids skipped), `continent-app/scripts/eval/ask-eval.mjs` (`cc` in the rebuilt dest passages as the pipeline writes them, retriever `sparse`, `--ask-dir`), `continent-app/scripts/eval/ask-baseline.json` (re-blessed), `docs/HANDBOOK.md` (Ask Carta: items 2, 3, 12, data, limits), `ROADMAP.md` (E2 status, E-R2 answer), `Execution/_OPEN.md` (rows T1141-a to T1141-i appended).
- Not touched: `answer.js` and every prompt line, the model gateway, `intent.js`, `docs/SCHEMA.md` (T1141-f), the pipeline.

## Commands run

```
git fetch origin && git checkout -b p15-s57-retrieval origin/p15-round2
cd continent-app && npm ci
node scripts/eval/ask-eval.mjs --check                       # baseline reproduced: rules r@10 0.568, bm25 list r@10 0.323
# sweeps (scratch scripts, deleted): relevance weight 0.05 to 0.3, scale 5 to 20, RRF k 5 to 60 and w 0.3 to 1,
# query parts on and off, scored on all 142 labelled questions and on the even and odd halves apart
python3 -I <scratch>/dump_passages.py <scratch>/passages.json   # the pipeline's own src_* adapters, no model
node scripts/build-ask-bm25.mjs --dir <scratch>/askdir           # browser and server indexes from that dump
node scripts/eval/ask-eval.mjs --ask-dir <scratch>/askdir        # rules, bm25, sparse
node <scratch>/lat.mjs <tree> rules|bm25|sparse                  # latency, before (origin/p15-round2 worktree) and after
node scripts/eval/ask-eval.mjs --bless
node scripts/eval/ask-eval.mjs --check                           # pass
node scripts/eval/ask-eval.mjs --seed-drop --check               # FAIL, as it must
node scripts/eval/run.mjs ask --check                            # eval runner: pass
npx eslint --no-ignore src/lib/ask/query.js src/lib/ask/retrieve.js src/lib/ask/rank.js functions/_lib/askSparse.js functions/_lib/askTerms.js functions/api/ask.js scripts/build-ask-bm25.mjs scripts/eval/ask-eval.mjs tests/askRetrievalE2.test.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
npm test
```

## Config and secrets set

None. New constants: `REL` (rank.js), `SPARSE_SOURCES`, `SPARSE_PER_SOURCE` (askSparse.js), `AREA_WORDS` (query.js).

## Before/after measurements

E1 set, 142 labelled questions, CI configuration (BM25 index rebuilt from the catalogue). `sparse` uses an index folder built here from the pipeline's own passage adapters (no vectors).

| Metric | Before | After | Delta |
|---|---|---|---|
| rules: recall@5 / recall@10 / MRR / nDCG@10 | 0.579 / 0.568 / 0.828 / 0.600 | 0.579 / 0.568 / 0.828 / 0.600 | 0 (no retrieval) |
| bm25 cards: recall@5 | 0.569 | 0.585 | +1.6 points |
| bm25 cards: recall@10 | 0.569 | 0.576 | +0.7 |
| bm25 cards: MRR | 0.802 | 0.838 | +3.6 |
| bm25 cards: nDCG@10 | 0.596 | 0.611 | +1.5 |
| bm25 cards: hit@10 | 0.908 | 0.923 | +1.5 |
| bm25 own list: recall@10 / MRR / nDCG@10 | 0.323 / 0.360 / 0.303 | 0.413 / 0.502 / 0.404 | +9.0 / +14.2 / +10.1 |
| bm25 cards recall@10, even / odd half | 0.591 / 0.545 (rules) | 0.607 / 0.545 | +1.6 / 0 |
| sparse (browser + server beach, lake, peak): recall@5 / recall@10 / MRR / nDCG@10 | not built | 0.598 / 0.576 / 0.847 / 0.613 | new |
| sparse with trails and sights too (not shipped, T1141-h) | not built | recall@10 0.587, nDCG@10 0.621 | measured only |
| dense, hybrid | not measured (no model in the container, T1136-a) | not measured | |
| Grounding (689 checks), abstention correct | 0.996, 0.965 | 0.996, 0.965 | 0 |
| Latency per question, retrieve plus ranking, p50 / p95 (Node, warm, 340 runs): rules | 1.5 / 71.2 ms | 1.5 / 66.2 ms | about 0 |
| Same, bm25 | 6.1 / 75.9 ms | 3.8 / 66.9 ms | faster (fewer, better words) |
| Same, sparse (server half in process) | n/a | 7.1 / 71.7 ms | +3 ms p50 over bm25 |
| Server BM25: cold load of beach, lake, peak indexes / memory | n/a | about 40 ms / about 10 MB | new |
| Browser bm25.json, dest passages, gzip | 299 KB | 312 KB | +13 KB (cc stored) |
| Latency budget | client gives up after `DENSE_TIMEOUT_MS` 1,200 ms; reranker budget 300 ms p95 | all within | |
| `npm test` | 1,623 tests (1,628 minus the 5 new) | 1,628: 1,616 pass, 0 fail, 12 skipped | +5 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The English query first lowered the cards (MRR 0.802 to 0.747) while the list rose | Relevance came in as a weighted score over a rank counted across all of Europe; with sharper BM25 a place named "... Castle" in another country outranked Germany's castles | Hits outside the asked country dropped, retrieved rank counted among the filtered candidates, rules and BM25 fused by reciprocal rank |
| "when to go to bergen" lost Bergen from the list | "bergen" is the Dutch vibe word for mountains and was replaced | The typed word stays beside its English words |
| The browser search ignored the field boosts | `retrieve.js` never passed `ASK_BM25_BOOST` (MiniSearch defaults to 1 per field) | Passed |
| The server BM25 build crashed: "duplicate ID sight:BOJ/x" | The pipeline writes some passage ids twice | The builder keeps the first row; the source fix is T1141-e |
| Vite warned that askTerms.js was imported both ways | retrieve.js loaded it dynamically and now also statically | One static import |

Gotcha: `MiniSearch.search(q, { boost: undefined })` throws; pass `{}` or leave the key out.

## Screens checked

None. The cards Ask shows can change order (that is the point), but no screen, string or style changed. The end check of the batch should open Ask at phone and desktop width with "kastelen in duitsland" and "quiet village in the dolomites" and see sensible cards.

## What is still open

- T1141-a: the reranker live check on Workers AI (owner, command below).
- T1141-b: rebuild the Ask index on the box so the stored country code and the server indexes ship, check the gzip budget, then bless sparse, dense and hybrid (with T1136-a).
- T1141-c: E2 item 3, contextual passages, needs the embedding model.
- T1141-d: E2 item 4, the index staleness check.
- T1141-e: duplicate passage ids in the pipeline.
- T1141-f: docs/SCHEMA.md Ask wires out of date (not in this brief's files).
- T1141-g: highlights gave no passages here; measure BM25 over them on the box.
- T1141-h: trails and sights on the server BM25 cost 55 MB; revisit leaner.
- T1141-i: the weakest questions are rule bound (`meer` read as the sea; quiet lake villages, warm late October).

## Rollback procedure

`git revert` of the T1141 commit. Nothing is one-way. An index built with the new builder still works with the old code (the extra files are ignored, the stored cc is harmless), and the new code works with an old index (no `cc`, no server files: nothing is filtered, no sparse hits).

## Owner steps (for the checklist)

- [T1141-a] Reranker live check (E-R2) | Workers AI is not reachable from the cloud container | for 20 E1 questions per language, take the top 30 passages of the current path, then run `curl -s -o out.json -w '%{time_total}\n' https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/ai/run/@cf/baai/bge-reranker-base -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" -d '{"query":"quiet lake village","contexts":[{"text":"<passage 1>"},{"text":"<passage 2>"}],"top_k":10}'` (check the response wrapper on the first call), re-order, score nDCG@10 and recall@5 with `scripts/eval/ask-eval-lib.mjs`; time p50 and p95 over 200 calls from a deployed Worker with `env.AI.run`, since curl adds your own link. Go only on +0.03 nDCG@10 for free-text questions, no drop on facet questions, added p95 at most 300 ms | Execution/P15/T1141-retrieval.md
- [T1141-b] Rebuild and bless the full index | the index is not in git or the container | in the main checkout `python run_pipeline.py ask_index` (it runs `build-ask-bm25.mjs`), confirm the log line for `bm25.json` stays under 400 KB gzip and lists `bm25-beach.json`, `bm25-lake.json`, `bm25-peak.json`, then `cd continent-app && node scripts/eval/ask-eval.mjs --check` (expect sparse, dense and hybrid to run) and `--bless`, and commit `scripts/eval/ask-baseline.json` | continent-app/public/search/ask/, continent-app/scripts/eval/ask-baseline.json
