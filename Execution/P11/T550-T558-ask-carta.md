# T550 to T558: Ask Carta, a free RAG search on open models

## Shared header

**Date:** 2026-10-22

**Branches:** root `p11-ask-carta` (worktree `.claude/worktrees/local-rag-setup-e544fa`), app `p11-ask-carta` (worktree `C:/Users/Gebruiker/Documents/Portfolio/wt/p11-ask-carta-app`, cut from app master `ac73e46`). Not merged, not pushed, not deployed. A dry-run merge onto the current app master (`c9d7ce3`, which gained T540 live bed prices from a parallel session meanwhile) is clean.

**Numbers:** T539 to T549 were left free for the parallel accommodation session (it took T540); this batch is T550 to T558.

**What the batch is.** The owner asked for one box where a traveller types any question and gets a detailed, modern answer, replacing the "Search by vibe, place or month" sheet and the "Search by total budget" card, free, robust, local or open models first, and a real RAG. Decisions taken with the owner in plan mode: a real RAG; written by an open model in the traveller's browser first, else an open model on Cloudflare Workers AI inside its free daily allowance, else the facts-only answer, which always shows first; both old features replaced, with their editors kept inside the answer; no Claude API anywhere.

**The pipeline, six stages, all pure modules in `continent-app/src/lib/ask/`:**

1. Understand (`intent.js`): rules over the guided vocabulary, widened to six languages and a reviewed lexicon, give one typed Intent.
2. Retrieve (`retrieve.js`, `functions/api/ask.js`): browser BM25 plus a pruned open embedding model in a Pages Function, prefiltered on country or place, fused by reciprocal rank.
3. Rank and price (`rank.js`): Explore's own predicates, budgetSearch and priceTrip, cartaRoute.
4. Context pack (`context.js`): numbered notes, fact rows from code first, then passages.
5. Generate (`generate.js`, `onDevice.js`, `functions/api/ask/answer.js`): WebLLM Qwen 2.5 1.5B on device, or Workers AI qwen3-30b-a3b under a hard Neurons cap.
6. Verify (`verify.js`): every sentence must cite a real note, use only figures in the notes and name no other place, or it is dropped; too many drops withdraw the answer.

**Why no Haystack, LlamaIndex, Qdrant or Chroma.** Carta has no app server, the Hetzner box is not built, and the corpus is 64,838 passages (9.8 MB model, about 20 MB of int8 vectors). Their ideas are kept (pluggable source adapters, metadata-first filtering, hybrid sparse plus dense, typed signatures checked on a golden set) behind one `retrieve()` interface that can move to Qdrant or Vectorize later.

**Checks run.** Per task: eslint on touched files, `npm test` (588 at the start, 620 at the end, all passing), `node scripts/ci/design-lint.mjs` (no new violation in any Ask file; three new ones in files this batch did not touch, unchanged from master), `node scripts/ci/token-contrast.mjs` (0 under the floor), fast NOPUBLIC builds with `wt/vite.t558.mjs`. One browser end check on the merged batch with `npm run dev` through the `ask-end-check` launch entry, at 375 px, the pane's 800 px and 1280 x 800: Explore empty state, budget, compare, when, plan, free text, German, Show all, the Plan start hand-off into the trip planner. Then one impeccable polish pass (under carta-design) and its confirming round.

**Agent notes folded in:** `Execution/P11/T551-notes.md` (index layer, by a delegated agent) and `Execution/P11/T557-notes.md` (on-device, by a delegated agent) carry the long-form detail for those two tasks.

### Carta-design seven questions, for the Ask panel

1. No hex outside the tokens: design-lint reports none in the Ask files.
2. No gradient, no colour outside DESIGN.md.
3. Brown only on actions (the one primary, quiet buttons, Ask); selections reuse the guided slots' tint and tick; no sun yellow; no danger.
4. Figures at 12 px or more and tabular; every euro through `formatMoney`/`formatEst`; estimates read "~€87 est.".
5. One primary per state of the panel; no text on a photograph (the rows are Explore's own).
6. The lead carries a number or names the place; no method or coverage lines; no dashes (stripDashes on every composed and model sentence), no banned words.
7. Removed: the written answer's card when there is nothing written to show (now one line), the sticky table header, the Clear button on a crowded phone footer.

---

## T550: golden set and eval harness

### What changed
Ask Carta has a measurable definition of "understood". `tests/fixtures/ask-golden.json` holds 140 questions in six languages across seven question types (find, budget, when, about, compare, near, plan) with the Intent each must produce, scored on only the keys a case names. `tests/fixtures/ask-heldout.json` holds 56 more, written after tuning and never tuned against. `tests/askIntent.test.mjs` gates both in `npm test`: the golden set at type 92% and slots 90% over at least 140 cases, the held-out set at 85% and 80% over at least 50. Every gate has a minimum count, so an empty set cannot pass.

### Files touched
Created: `continent-app/tests/askIntent.test.mjs`, `continent-app/tests/fixtures/ask-golden.json`, `continent-app/tests/fixtures/ask-heldout.json`.

### Commands run
`npm test`; `ASK_EVAL_VERBOSE=1 node --test tests/askIntent.test.mjs` prints every miss.

### Config and secrets set
None.

### Before/after measurements

| Metric | Before (guided parser alone) | After (Ask Intent) | Delta |
|---|---|---|---|
| Golden question type | 56.4% (79/140) | 100.0% (140/140) | +43.6pp |
| Golden slots | 62.6% (204/326) | 99.7% (325/326) | +37.1pp |
| Held-out question type | 48.2% (27/56) | 98.2% (55/56) | +50.0pp |
| Held-out slots | 55.2% (69/125) | 96.8% (121/125) | +41.6pp |

The golden figures are tuned on; the held-out ones are the honest ones.

### What broke and how it was fixed
No issues.

### What is still open
The five held-out misses stay unfixed on purpose: "uncrowded old towns in the czech republic" (vibe), "plan a two week road trip in norway" (14 read as 7), "wanneer naar kreta" (Crete is an area, not a place, so no when), "randonnee pas chere en ete" (sort), "borghi medievali in toscana" (village over old town). The rule: a fix moves a case into the golden set and a new held-out case is written (T550-a).

### Rollback procedure
`git revert 77e20a3` in the app repo.

---

## T551: ask index layer and embedder

### What changed
The catalogue can be searched by meaning. `pipeline/ask_index_layer.py` turns ten sources (one adapter each in one registry: dest, highlight, sight, trail, journey, beach, lake, peak, country, lexicon) into 64,838 passages with a payload, embeds them with `minishlab/potion-multilingual-128M` (a static model2vec model distilled from bge-m3, 101 languages, no GPU), pruned to 35,635 tokens and int8 (9.8 MB shipped), and writes int8 plus sign-bit vectors per source under `public/search/ask/`. `functions/_lib/askEmbed.js` is a pure JavaScript port of the encoder (cosine 1.0000 against Python on 50 queries), `askScore.js` the two-stage search. Adding a data type later is one adapter plus one manifest line. Detail in `T551-notes.md`.

### Files touched
Root, created: `pipeline/ask_index_layer.py`. Modified: `run_pipeline.py` (task `ask_index`, soft, guarded), `docs/SCHEMA.md` ("Ask Carta search wires"), `requirements-ml.txt`. App, created: `functions/_lib/askEmbed.js`, `askScore.js`, `askTerms.js`, `scripts/build-ask-bm25.mjs`, `tests/askEmbed.test.mjs`, `tests/fixtures/askEmbed.fixture.json`. Modified: `package.json` and lock (`minisearch`), `.gitignore` (built ask files ignored except `lexicon.json`).

### Commands run
`python pipeline/ask_index_layer.py --public <app>/public` (34 s), `--bakeoff`, `--fixture`; `node scripts/build-ask-bm25.mjs` (10 s).

### Config and secrets set
`model2vec==0.10.0`, `huggingface-hub>=0.34,<1.0` in `requirements-ml.txt` (pip had upgraded huggingface-hub to 1.33, which breaks `guided_search_layer.py`).

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Searchable passages by meaning | 0 | 64,838 | +64,838 |
| Dense recall@10, potion-base-8M / retrieval-32M / multilingual-128M (all questions) | none | 0.381 / 0.370 / 0.448 | multilingual chosen |
| Shipped model | none | 9.8 MB (8.2 MB gzip) | |
| Query embed / search all sources (node) | none | 0.23 ms / 7.4 ms | |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Every `gem:` dossier missed | the filename rule | uses `dossier_base()`, mirroring `dossierFileBase` |
| huggingface-hub 1.33 broke transformers | pip upgrade with model2vec | pinned below 1.0 |
| A dry run rewrote `data/derived/freshness_report.json` | the stage's side effect | restored |

### What is still open
T551-a (rebuild the index in the main checkout before a deploy), T551-b (after the R2 cutover /api/ask needs an R2 binding or a data-host fetch), T551-c (BM25 budget, closed by T554), T551-d (the parity fixture is tied to `manifest.built`), T551-e (root mirror, closed by this batch's sync), T551-f (4,331 trails with no destination).

### Rollback procedure
`git revert 93f754b` (app) and `git revert e3eba70fb` (root); delete `continent-app/public/search/ask/` except `lexicon.json`.

---

## T552: phrase lexicon in six languages

### What changed
Everyday words land on facets: "chill", "laid back", "rustig", "ruhiges" are quiet; "foodie", "mangiare", "tapas" are food; "gunstiger", "moins cher" are cheapest first; "Lissabon", "Oporto", "Nizza", "Krakau", "Salisburgo" are their places. `pipeline/ask_lexicon.py` holds the hand-reviewed tables (written in this session, a Claude Code session, which CLAUDE.md allows) and writes 710 phrases (416 vibe, 247 place exonyms checked against the catalogue, 25 sort, 22 extra) to `public/search/ask/lexicon.json`. The app reads them as exact keys, and T551 embeds them, so near words find their facet through the vectors ("chilled" matches quiet at cosine 0.998). `--ollama` asks a local Ollama model for more candidates for review only; it never writes the lexicon. Ollama was not installed, so the option was not run.

### Files touched
Root, created: `pipeline/ask_lexicon.py`. App, created: `public/search/ask/lexicon.json`.

### Commands run
`python pipeline/ask_lexicon.py --app <app>`.

### Config and secrets set
None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Golden question type (with Intent, lexicon off then on) | 96.4% | 100.0% | +3.6pp |
| Phrases beyond the guided vocabulary | 0 | 710 | +710 |

### What broke and how it was fixed
"crete" first mapped to Heraklion; Crete is an area, so the place row was removed.

### What is still open
T552-a: run `--ollama` once a local model is installed and review its candidates.

### Rollback procedure
`git revert c0672d5` (app) and `git revert faf2bd80d` (root).

---

## T553: the Intent parser

### What changed
`src/lib/ask/intent.js` reads a question into one typed Intent: the question type, Explore's own facets plus `warm`, a season as `monthRange`, and the trip around it: adults, children, family, days (nights + 1, weeks, long weekend), money as a total or a day budget, mode (train or bus, fly, car; "without a car" is read first), origin ("from Biarritz"), the place a when or about question is about, and the places of a compare. It runs on the guided search's `buildVocab`/`parseQuery`/`partsToFacets`, widened to every language's labels and words and the lexicon (`buildAskVocab`). `guidedSearch.js` only exports its word lists and `words`.

### Files touched
App, created: `src/lib/ask/intent.js`. Modified: `src/lib/guidedSearch.js` (exports only).

### Commands run
`npm test`.

### Config and secrets set
None.

### Before/after measurements
See T550: held-out type 48.2% to 98.2%, slots 55.2% to 96.8%.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Months and places at the end of a question were lost | parseQuery holds the last word back as a fragment while typing | the whole question gets a trailing space |
| "von Innsbruck" read as an origin | "von", "van", "da" are also "of" and "near" | removed from the origin words |
| "when to go to Bergen" read the Dutch for mountains | a place name that is also a word | after when, about or plan a name reads as the place |

### What is still open
None beyond T550-a.

### Rollback procedure
`git revert 11a80a5`.

---

## T554: hybrid retrieval

### What changed
`/api/ask` embeds the question with the T551 model and scores only the sources a question type needs, prefiltered on its country or places, and maps up to five unplaced words to lexicon facets (cosine at least 0.62). `src/lib/ask/retrieve.js` runs BM25 in the browser (MiniSearch over dest plus lexicon, 313 KB gzip) beside it and fuses both by reciprocal rank (k 60). Either half may be missing (dense times out at 1.2 s). A lexicon match fills an empty facet once, then the answer is asked again. Relevance weighs 0.1 in ranking, set by a sweep.

### Files touched
App, created: `functions/api/ask.js`, `src/lib/ask/retrieve.js`, `tests/askRetrieve.test.mjs`. Modified: `scripts/build-ask-bm25.mjs` (fallback dest + lexicon), `src/lib/ask/rank.js` (weight).

### Commands run
`node scripts/build-ask-bm25.mjs`; the weight sweep (a scratch copy of the test, deleted).

### Config and secrets set
None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| BM25 index in the browser | 1,196 KB gzip (dest + highlight + lexicon) | 313 KB gzip (dest + lexicon) | -883 KB |
| Recall@10 on the guided GOLDEN set (20 questions, 86 places), end to end | 48/86 = 0.558 (rules alone) | 50/86 = 0.581 (hybrid) | +2 places |
| Relevance weight sweep, hybrid recall | 0: 48, 0.05: 51, 0.1: 50, 0.2: 48, 0.35: 47 | 0.1 chosen | |

### What broke and how it was fixed
At the planned weight 0.35 the hybrid scored below the rules alone (47 against 48): on facet-shaped questions the vibe scores already carry the answer. The weight is 0.1, and the gain of the dense half is in free text and in the passages the written answer quotes.

### What is still open
T554-a: dense recall alone is modest (0.44); a stronger open embedder needs a runtime the Function does not have.

### Rollback procedure
`git revert ab110c7`; rebuild BM25 with `--sources dest,highlight,lexicon` if wanted.

---

## T555: rank, price and the facts-only answer

### What changed
`src/lib/ask/rank.js` turns an Intent into answer facts with Explore's own predicates, so an answer never disagrees with the list it opens.

- Find and near answers filter, then loosen in a fixed order when fewer than 3 match: quiet, budget, warm, month, close by, no car, vibe. The answer says what it loosened.
- Ranking uses relevance, vibe, month, rating and fame, with one row per city (two airports of Rome are one place).
- Total-budget answers run `budgetSearch` on `priceTrip`, ranked by season, vibe, Score and distance from the home town.
- When, about, compare and plan answers use the climate rows and the cheapest bed months. Plans are routed with `cartaRoute.planRoute`.

`src/lib/ask/compose.js` words it in six languages (55 `ask.*` keys): a lead that reads the question back with its count, reasons per place, a receipt, a month or comparison table, and honesty lines ("Getting there is not in the total yet.", the yearly crowd figure, "Carta can't search for ... yet").

### Files touched
App, created: `src/lib/ask/rank.js`, `src/lib/ask/compose.js`, `tests/askAnswer.test.mjs`. Modified: `src/i18n/{en,nl,de,fr,es,it}.js`.

### Commands run
`npm test`; a scratch printer of sample answers (scratchpad, not shipped).

### Config and secrets set
None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Golden questions with an answer | 0 | 140/140, 0 empty finds | +140 |
| Picks failing their own filters, budget totals over budget, dashes or unfilled slots | not measured | 0 | |

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Alps hiking led with an unknown village | no fame term | fame on a log scale |
| Budget picks repeated Rome by its airports | gateways per airport | `samePlace()` |
| From Biarritz by train ranked Rome first | origin unused | every 300 km away costs a Score point |

### What is still open
None.

### Rollback procedure
`git revert 63b28c4`.

---

## T556: the written answer, its cap, cache and check

### What changed
A written answer is possible on open models, free. `context.js` builds the pack (at most 14 numbered notes of at most 300 characters: the lead, one fact row per pick, table rows, honesty lines, then passages about the picks only). `verify.js` keeps a sentence only with a real citation, figures that appear in the notes or question, and no catalogue place the notes do not name; more than 30% failing withdraws the answer. `generate.js` streams through it, on device first, else the server. `functions/api/ask/answer.js` runs `@cf/qwen/qwen3-30b-a3b-fp8` (fallback `@cf/meta/llama-3.2-3b-instruct`) and:

- books the worst case on a KV Neurons counter before calling, and stops at 9,000 of the 10,000 free a day;
- caches each answered pack for a week;
- rate-limits each address;
- refuses to call a model at all without the counter binding, so an account on Workers Paid can never be billed overage by a missing counter.

### Files touched
App, created: `src/lib/ask/context.js`, `verify.js`, `generate.js`, `functions/api/ask/answer.js`, `tests/askGenerate.test.mjs`. Modified: `wrangler.toml` (`[ai] binding = "AI"`; the `ASK` KV block commented, with its create command).

### Commands run
`npm test`.

### Config and secrets set
`[ai] binding = "AI"` in `continent-app/wrangler.toml`. The `ASK` KV namespace is not created; see T556-a.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Neurons per answer, English golden packs | none | worst 15, mean 14.1 | |
| Answers a day inside the cap | 0 | about 636 | |

The faithfulness target (95% of real model sentences pass) was not measured: no real model answered in this batch (T558-b).

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| "est." and "9.1" cut sentences in two | an end mark followed by a space | "est." before a lower-case word is no end; mid-stream, a mark closes only once the next word starts |
| The final sentence never showed | the closing pass was not marked final | `feed(..., true)` |

### What is still open
T556-a (create the KV namespace, bind it, check Workers AI is on), T556-b (the endpoint takes notes as text, so within the cap it could be used as a free model by anyone).

### Rollback procedure
`git revert 13fe808`; remove the `[ai]` block from `wrangler.toml`.

---

## T557: the on-device model

### What changed
A traveller with WebGPU can choose "Answer on this device".

- **Model:** `src/lib/ask/onDevice.js` runs Qwen 2.5 1.5B Instruct q4f16 (845 MB) through `@mlc-ai/web-llm` 0.2.85 (Apache-2.0, pinned) in a Web Worker.
- **Loading:** WebLLM is never in the main bundle, and the model is never downloaded without the click.
- **Files:** read from Carta's own data host under `VITE_ASK_MODEL_BASE`.
- **Removal:** possible again from the panel.
- **CSP:** `script-src` gains `'wasm-unsafe-eval'`.

Detail, upload list and bake-off procedure in `T557-notes.md`.

### Files touched
App, created: `src/lib/ask/onDevice.js`, `src/lib/ask/onDevice.worker.js`, `tests/askOnDevice.test.mjs`. Modified: `package.json` and lock, `public/_headers`.

### Commands run
`npm install @mlc-ai/web-llm@0.2.85`; fast builds with `wt/vite.t557.mjs` (T557_PROBE 1 and 2).

### Config and secrets set
`VITE_ASK_MODEL_BASE` (default `https://data.carta-europetravel.com/ask/model/`; `hf` for a dev server), `VITE_ASK_MODEL` (`gemma` for the alternative).

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Entry chunk with the module imported dynamically | 255,534 B gzip | 255,579 B gzip | +45 B |
| WebLLM chunks, only after opting in | none | 2.12 MB + 2.15 MB gzip | |

### What broke and how it was fixed
The agent's `git worktree remove --force` emptied the app worktree's `node_modules` (a real folder there, not the junction the brief assumed); restored at once with `npm ci` from the lockfile, tests green.

### What is still open
T557-a (upload the 38 model files to R2), T557-b (review the CSP change), T557-c (closed by T558, dynamic import), T557-d (WebLLM ships on both sides once opted in), T557-e (a model credit line; Gemma's terms), T557-f (shader-f16 excludes some devices).

### Rollback procedure
`git revert 6001479`, `npm install`; if uploaded, `rclone purge R2:carta/ask/model`.

---

## T558: the Ask box on Explore and Plan, end check, polish

### What changed
The top-right search on Explore is now Ask Carta ("Ask Carta: a place, a vibe, a month or a budget"), at the top of the tab on a phone, and the total-budget card is gone from the page. Nothing either did is lost.

- **Before a question:** the panel offers eight suggested questions (each tested to answer well in all six languages), then the guided search's five slots, now a shared `GuidedSlots`.
- **The answer, in order:**
  - the lead;
  - the written answer, or one plain line saying why there is none;
  - Answer on this device, where supported;
  - the places as Explore's own rows, with a folded receipt for total-budget answers;
  - Show more places;
  - the month or comparison table;
  - the honesty lines;
  - Refine (party, days, money and mode for trip questions, plus the five slots).
- **The one primary:** Show all on Explore for find and near; Open the place for when and about; Plan this trip for plan, budget and compare, which opens the trip planner with the routed stops and nights through App's `openTripInPlanner`.
- **Plan start page:** "Plan something new" carries the same box, read as a plan.
- **Loading:** the panel loads on first open and then stays mounted.

### Files touched
App, created: `src/browse/AskSearch.jsx` (the door), `src/browse/AskSearchFull.jsx` (the panel), `src/browse/useAsk.js`, `src/lib/ask/data.js`, `src/planner/PlanAsk.jsx`, `src/styles/75-ask.css`. Modified: `src/browse/ExploreTab.jsx`, `src/browse/GuidedSearch.jsx` (slots extracted, no behaviour change), `src/planner/PlanStart.jsx`, `src/App.jsx`, `src/i18n/*.js` (41 more keys), `src/lib/ask/{compose,context,intent,rank}.js`, `tests/askAnswer.test.mjs`. `BudgetSearch.jsx` and the guided sheet stay in the tree, unmounted. Root: `.claude/launch.json` (`ask-end-check`), the `continent-app/` mirror of this branch.

### Commands run
`npm test`; fast builds with `wt/vite.t558.mjs`; `npm run dev` through `preview_start ask-end-check`; `node scripts/ci/design-lint.mjs`; `node scripts/ci/token-contrast.mjs`; `impeccable detect --json` on the three Ask files (no findings).

### Config and secrets set
None.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Entry chunk (fast build) | 822,683 B, 258,975 B gzip | 776,761 B, 243,180 B gzip | -15.8 KB gzip |
| Ask panel chunk, on first open | none | 56,076 B, 20,442 B gzip | |
| Suggested questions that answer, six languages | none | 48/48 | |
| Ways to search on Explore | 2 (sheet, budget card) | 1 | -1 |

The entry chunk shrank because the guided sheet, the budget card and its results left it along with Ask.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Budget answer in the browser found no place | Explore's rows are slim list records without beds or food baskets | price from the full records (`price.dests`), as the old card did |
| A question asked while the vocabulary loaded did nothing | `ask()` returned early | it waits and runs once ready |
| "Seaside town with great seafood" lost the sea | one vibe slot | a beach or lake word beside another vibe becomes the close-by extra |
| The lead named facets the answer had loosened | lead built from the raw Intent | the lead names what is still applied |
| Static import of the on-device module | +2 KB gzip on the entry | imported once the panel opens |
| Desktop rows covered the comparison table | `.explore-shell` is also Explore's absolute page from 769 px | overridden for the list in the sheet |
| Comparison header floated over the rows | sticky inside the sheet's scroll | not sticky |
| No written answer took a tall card above the places | one layout for every state | one plain line |
| Sticky field lost to `.gs-field` and showed text above it | equal specificity; the sheet's top padding | one more class; covers the padding |
| design-lint `outline-none` on the lead | a focus rule | removed; focus-visible keeps the ring |

### What is still open
T558-a (on-device bake-off Qwen against Gemma, not run), T558-b (the written answer against the real Workers AI and the faithfulness rate, not run), T558-c (Home's search still hands facets, not the typed text, to Explore), T558-d (merge and deploy are the owner's).

### Screens the end check looked at
Explore at 375 px, 800 px and 1280 x 800: the empty panel, a total budget answer with its receipt open, compare (Porto or Lisbon), when (Hallstatt), plan (Tuscany), free text ("chilled seaside town with great seafood in October"), German ("wandern in den alpen im juli"); Show all; the Plan start page and its hand-off into the trip planner (3 stops, 6 nights, ~€1,456.03 est. for 2). Not looked at: the written answer streaming from a real model, the on-device install, a Pages preview deploy (all T558-a/b, T557-a).

### Rollback procedure
`git revert fe1db76 7610256 b666837 57ed2e8 2c29d2a` restores the guided sheet and the budget card on Explore; nothing else depends on them. The whole batch: revert the app commits listed per task and the root commits `e3eba70fb faf2bd80d` plus this report's commit; no Supabase migration, no data change outside `public/search/ask/`.
