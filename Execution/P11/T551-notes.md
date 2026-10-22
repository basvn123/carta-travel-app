# T551 notes: the Ask Carta retrieval index (for the T550-T558 batch report)

Branch `p11-ask-carta` in both repos. App commit `93f754b`, root commit is
the one carrying this file. Nothing pushed, deployed or merged.

## What changed

Root repo:

- `pipeline/ask_index_layer.py` (new). Ten source adapters in one registry
  (`SOURCES`: dest, highlight, sight, trail, journey, beach, lake, peak,
  country, lexicon). Adding a data type later means one adapter and one
  registry line. The layer writes passages, int8 and sign-bit vectors, and a
  pruned, quantised copy of `minishlab/potion-multilingual-128M` into
  `<public>/search/ask/`. Its modes: `--check` (recall on GOLDEN and MULTI
  with the shipped files and the two-stage scorer), `--bakeoff` (the three
  models, float, full vocabulary) and `--fixture` (the JS test fixture).
  `--public` points it at any `public/` folder; the default is
  `continent-app/public`.
- `run_pipeline.py`: a new task `ask_index` (cadence `after` dossier, beaches,
  lakes, mountains and trails_rate; soft; writes a wire) with
  `guard_ask_index`, which skips the task when model2vec or minisearch is
  missing or `public/app_data.json` is absent. That makes it a no-op on the
  Linux orchestrator, which never installs the ML requirements. The task runs
  the layer and then `continent-app/scripts/build-ask-bm25.mjs`. It sits just
  before `photo_sources`, which stays last.
- `docs/SCHEMA.md`: a new section, "Ask Carta search wires (T551)", with a
  wire table, placed before "Wire contract". The CI contract parser only reads
  the "Wire contract" section, so `check-contract` still passes.
- `requirements-ml.txt`: adds `model2vec==0.10.0` and
  `huggingface-hub>=0.34,<1.0` (see "What broke").

App repo (`93f754b`):

- `functions/_lib/askEmbed.js`: `loadModel({vocab, emb, scale})`,
  `embed(model, text)`, `tokenize`, `pretokenize` and `createEmbedder(files)`
  (which gives `.embed(text)`). Pure ESM with no node APIs.
- `functions/_lib/askScore.js`: `search(qvec, {b1, i8, n, D}, {k1: 500, k: 50,
  filter})`. It returns `[{i, score}]`, where score is about the cosine. It
  also exports `signBits`. Stage 1 is Hamming on the sign bits, with a
  counting select that is O(n) and breaks ties by row order. Stage 2 is the
  int8 dot product.
- `functions/_lib/askTerms.js`: `ASK_BM25_OPTIONS` (fields name, tags, text;
  id = pid; nothing stored; lower-cased, accent-folded terms), plus
  `ASK_BM25_BOOST` {name 3, tags 2, text 1} and `bm25Doc(row)`. The browser
  must load `bm25.json` with these options:
  `MiniSearch.loadJSON(text, ASK_BM25_OPTIONS)`.
- `scripts/build-ask-bm25.mjs`: builds `bm25.json` and writes `manifest.bm25`
  (sources, n, bytes, gzip). `--sources a,b` overrides the source list.
- `tests/askEmbed.test.mjs` with 5 tests, and
  `tests/fixtures/askEmbed.fixture.json` (50 KB, 50 queries).
- `package.json` and `package-lock.json`: `minisearch ^7.2.0` (MIT), and only
  that hunk is committed. The web-llm lines in the same files belong to the
  main session and are left unstaged.
- `.gitignore`: `public/search/ask/*` with `!public/search/ask/lexicon.json`.
  The built files are not committed.

## The contract as built

`manifest.json` holds `{version: 1, model: "minishlab/potion-multilingual-128M",
dims: 256, built, sources: {<src>: {n, passages, i8, b1}}, model_files:
{vocab: "model/vocab.json", emb: "model/emb.i8", scale: "model/scale.f32"},
bm25: {file, fields, boost, sources, n, bytes, gzip, options}}`.

The `scale` file is the one addition the tokenizer needs. `emb.i8` rows are
quantised per row (row / max abs x127), and `scale.f32` holds each row's max
abs. A query vector is the mean over tokens of `emb[id] x scale[id] / 127`,
then L2-normalised.

`ref.type` names what a hit opens:

- `dest` for the dest, highlight and sight sources.
- `trail`, `journey`, `beach`, `lake`, `peak` or `country` for the others.

Other conventions in the payload:

- Highlight pids are `highlight:<destId>/<hl id>`.
- Sight pids are `sight:<destId>/<name slug>`.
- Lexicon pids are `lexicon:<row index>`.
- Text has no em or en dashes (`strip_dashes` mirrors
  `format.js stripDashes`).

## Measurements

Corpus: 64,838 passages over 3,868 destinations (built from the app
worktree's `public/`).

| source | n | passages | i8 | b1 |
|---|---:|---:|---:|---:|
| dest | 3,868 | 1,294 KB (228 gz) | 967 KB | 121 KB |
| highlight | 16,179 | 4,360 KB (745 gz) | 4,045 KB | 506 KB |
| sight | 21,162 | 5,294 KB (729 gz) | 5,290 KB | 661 KB |
| trail | 17,505 | 4,274 KB (664 gz) | 4,376 KB | 547 KB |
| journey | 258 | 137 KB | 64 KB | 8 KB |
| beach | 2,745 | 863 KB | 686 KB | 86 KB |
| lake | 1,628 | 562 KB | 407 KB | 51 KB |
| peak | 740 | 230 KB | 185 KB | 23 KB |
| country | 43 | 14 KB | 11 KB | 1 KB |
| lexicon | 710 | 54 KB | 178 KB | 22 KB |

- **Shipped model:** 35,635 of 500,353 tokens kept. 34,767 come from the
  corpus, the six-language word list and lower-cased place and country names.
  The other 868 are single Latin, Greek and Cyrillic characters, kept so that
  an unknown word still splits into known pieces. `emb.i8` is 8,909 KB,
  `scale.f32` 139 KB and `vocab.json` 722 KB: **9.8 MB in all** (8.2 MB gzip).
- **Whole folder:** 49.9 MB, 34 files. The largest is `model/emb.i8` at
  8.9 MB, under the 25 MiB Pages limit per file.
- **BM25 over every source:** 15.4 MB, gzip 3,689 KB. That is over the
  400 KB budget, so the index falls back to **dest + highlight + lexicon:
  20,757 passages, 4,736 KB, gzip 1,196 KB. This is still 3x the budget.**
  For comparison, dest + lexicon alone is 313 KB gzip and dest alone 299 KB.
  The main session has to choose (open item T551-c).
- **Build time:** layer 34 s (model load 11 s, passages 9 s, pruning 2 s,
  embedding 6 s), BM25 10 s.
- **JS (node, one core):** `loadModel` 31 ms; `embed` 0.23 ms per query;
  `search` 1.1 ms on dest (3,868 rows), 1.6 ms on sight (21,162) and 7.4 ms
  over all ten sources (64,838). Python's two-stage scorer takes 32 ms per
  query.
- **JS vs Python on the 50 fixture queries:** the worst cosine is **1.0000**
  (the fixture stores int16), and all 50 have the same top ten. Tokens were
  also compared on 3,528 strings: 400 random passages per source plus tricky
  Unicode such as control and zero-width characters, ligatures, Greek,
  Cyrillic, CJK, emoji and punctuation. **3,528 of 3,528 are identical.**

### Bake-off

Recall@10 is dense only, over the dest passages, with the country or area
filter applied (the filter stands in for the intent slots). The GOLDEN text is
"<vibe label> in <country or area>". MULTI is 30 questions, 5 per app
language, written before any run (`MULTI` in the layer). The expected places
are scored only when the catalogue holds them, as in `guided_search_layer
--check`.

| model | dims | GOLDEN (72) | MULTI (109) | all | encode 3,868 |
|---|---:|---:|---:|---:|---:|
| potion-base-8M | 256 | 37 = 0.514 | 32 = 0.294 | 0.381 | 0.2 s |
| potion-retrieval-32M | 512 | 39 = 0.542 | 28 = 0.257 | 0.370 | 0.3 s |
| **potion-multilingual-128M** | 256 | 33 = 0.458 | **48 = 0.440** | **0.448** | 0.3 s |
| shipped (pruned, int8, two-stage) | 256 | 32 = 0.444 | 48 = 0.440 | 0.442 | |

The multilingual model wins on MULTI by 50 to 70 percent and overall. The two
English models are only slightly ahead on GOLDEN, which is English. Pruning,
quantisation and the two-stage scorer cost 1 GOLDEN hit and no MULTI hits.

Weak spots of dense-only retrieval: "romantic in France" (0/4), "castles in
Germany" (1/3), "food and wine in Italy" (1/5), "scenic views in Norway" (0/4;
the model returns the fjords themselves, such as Geirangerfjord, rather than
the towns). These are meant to be lifted by BM25 fusion and by the fact rank
in T555.

## Checks

- `npm test` in the app worktree: **607 tests, 607 pass, 0 skipped**, my 5
  included. The baseline of 588 plus the main session's own new tests.
- `node scripts/ci/check-contract.mjs` with
  `CARTA_REPO_ROOT=<root worktree>`: **passed**. Without that variable it
  fails, because in a `wt/` checkout it looks for `../docs/SCHEMA.md`. That is
  an environment quirk, not this task.
- ESLint (`js.configs.recommended`, node and browser globals; the app config
  covers `src/` only) on the five JS files: clean. One `no-control-regex` is
  disabled by design.
- Python: pyflakes on the layer is clean. `pytest tests/test_pipeline_code_fixes.py
  tests/test_data_licences.py`: 60 passed, and `photo_sources` is still last.
  `run_pipeline.py --list` and `--dry-run --only ask_index` both list the
  task.
- No browser check: this task touches no screen.

## What broke

- `pip install model2vec` upgraded huggingface-hub to 1.33. That breaks
  transformers 4.57, the version sentence-transformers and
  `guided_search_layer.py` use. I downgraded the hub to 0.36.2 (model2vec
  works with it) and pinned `<1.0` in `requirements-ml.txt`.
- Installing minisearch: `node_modules` in the app worktree is a junction into
  the main checkout. `npm install` there would reconcile, and possibly prune,
  the main checkout's tree. Instead, `package.json` and the lock were edited
  with `--package-lock-only`, and the registry tarball (`npm pack`, integrity
  checked) was copied as one new folder, `node_modules/minisearch`. That
  folder is additive: nothing else in the shared `node_modules` was touched.
  The main checkout will see it as extraneous until this branch merges.
- The first build found no dossier for the 3,608 `gem:` destinations, because
  the file name is `gem-<slug>.json`. The layer now uses `dossier_base()`,
  which mirrors `src/lib/dossier.js dossierFileBase`.

## Open items (for the register)

- **T551-a (owner, before any deploy):** the built files are not in git. After
  the merge, run `python pipeline/ask_index_layer.py` and then
  `node continent-app/scripts/build-ask-bm25.mjs` in the main checkout (or
  `run_pipeline.py --only ask_index`), then build. With `VITE_DATA_BASE`
  unset, as in production today, they ship in `dist/search/ask/` on Pages
  (49.9 MB, 34 files, all under 25 MiB).
- **T551-b (next task):** once `VITE_DATA_BASE` is set (the R2 cutover),
  `public/search` is in `R2_TIER`. `stage-data.mjs` then moves `search/ask/`
  off Pages, and `push-data.mjs` uploads it to R2. The Pages Function
  (`functions/api/ask.js`) then cannot read the model and vectors through
  `env.ASSETS`. It needs an R2 binding or a fetch from the data host, and the
  owner needs a `push-data` run that includes `search/ask/`.
- **T551-c (next task, product call):** `bm25.json` is 1,196 KB gzip, 3x the
  400 KB budget, even after the fallback the brief named. dest + lexicon fits
  at 313 KB (`node scripts/build-ask-bm25.mjs --sources dest,lexicon`), and
  dense retrieval still covers highlights. The alternative is to accept 1.2 MB
  as a lazy download after the first keystroke.
- **T551-d (next task):** the parity fixture is pinned to `manifest.built`.
  After any rebuild, the two JS-vs-Python tests skip with a message until
  `python pipeline/ask_index_layer.py --fixture` is run and the fixture is
  committed again.
- **T551-e (next task):** the root mirror of `continent-app/` is not synced,
  per the once-per-batch rule. The `ask_index` task calls
  `continent-app/scripts/build-ask-bm25.mjs`, which only exists in the root
  checkout once the mirror sync adds `functions/_lib/ask*.js`,
  `scripts/build-ask-bm25.mjs`, the test and the fixture. Mirror commits must
  add new app files.
- **T551-f (next task):** 4,331 of 17,505 trails have `destId` null, because
  no destination in the same country is within 25 km. They are still found by
  vector search, but a destination filter drops them.

## Rollback

- App: `git -C wt/p11-ask-carta-app revert 93f754b`. That removes the three
  `_lib` modules, the BM25 script, the test, the fixture, minisearch and the
  ignore lines. Then delete `public/search/ask/*` except `lexicon.json`: built
  data, and nothing else reads it.
- Root: `git revert <this commit>`. That removes the layer, the task, the
  SCHEMA section and the requirements lines.
- Optionally `pip uninstall model2vec` and remove
  `continent-app/node_modules/minisearch`.
- No data migration, no `app_data.json` change and no schema bump: rollback
  is complete and lossless.
