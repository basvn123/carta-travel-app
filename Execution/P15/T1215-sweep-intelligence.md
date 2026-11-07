# T1215: Register follow-up sweep, intelligence (ROADMAP register follow-up (intelligence), round 3 session S131, batch 16)

Branch `p15-s131-sweep-intelligence` from `origin/p15-round3`. Scope: the open `next task` rows raised by the round 2 tasks T1149, T1150, T1152, T1153, T1154, T1155 and T1156 (ROADMAP F1, F3, F4, F5, F7, F8).

## Date

2026-11-07

## What changed

The sweep closed 25 of the 36 open `next task` rows of the intelligence group, moved 1 to the owner and left 10 open with a reason. The taxonomy is now version 1.1.0, with labels in all six languages on every node (268 of 268, was 103) and synonyms in de, fr, es, it and nl on 168 nodes. A labeller agreement script exists (Krippendorff's alpha with MASI distance, Cohen's kappa per node). The tagger now reads trail detail files and other-language descriptions (seed R-precision at 5 0.477 to 0.503). It can tag journeys from their text on request, honours `CARTA_PUBLIC`, and has its first Intelligence API caller in the pipeline (`intel_tags`). The mapping test covers the trail highlight kinds, and `meta.categories` is rebuilt from the data on every write. The trip finder reads taste verdicts. Taste evidence rolls up to parents, a chip lists every item behind it, the admin has an acceptance card, and the taxonomy map loads lazily (My trips chunk 148,061 to 137,759 B). The place linker fixes both known misses (accuracy@1 on the 300-mention set 0.993 to 1.000). It now serves Ask and Destinations search behind its flag, has a CI workflow, and parse-booking has the linking logic. Every model-written text carries a "Written by AI" label. Ask turns and day plans have a Report button, backed by migration 074 (not live). suggest-city and parse-booking have model cards, and parse-booking has a 7-case failure set. The MCP server's `price_trip` prices legs and flights through `quoteTrip`. The Intelligence API's base images are pinned by digest and its requirements are audited. MAP.md has a row and an area doc for the whole area.

## Research

None chosen beyond what the rows named. Five choices came with a method:
- **T1149-f:** the row named Krippendorff's alpha with MASI distance. It is implemented in the standard library rather than through the `krippendorff` PyPI package, so no dependency is added.
- **T1154-e:** the row named pip-audit and a digest pin. pip-audit 2.10.1 matches the version `supply-chain.yml` already runs. The digests were read from Docker Hub's registry API on 2026-11-07.
- **T1153-g:** a hand-written sound-alike key (ph/f, th/t, ch/h, aa/a, oe/o, ou/u, y/i, double letters) instead of a phonetic library (Soundex, Metaphone). These spelling pairs are the Greek and Nordic variants the misses showed, and the linker stays dependency-free (T1153's choice). A w/v rule was tried and dropped because it sent "hawees" to Chaves.
- **T1152-c:** a bounded additive nudge (`TASTE_STEP` 0.02, cap 0.06). It follows T1152's research choice that rejection dampens and never bans.
- **T1156-d:** the storage follows migrations 037 and 072 (a private table, an anonymous RPC with per-source and global hourly limits, a salted hash, a 180-day prune).

## Files touched

Taxonomy and tagger (F1, F5):
- `pipeline/taxonomy/carta_taxonomy.yaml` (1.1.0), `taxonomy.py`, `tagger.py`, `tag_sources.py`, `mapping.yaml`
- new: `pipeline/taxonomy/agreement.py`, `pipeline/intel_client.py`, `pipeline/tasks/` (task `intel_tags`)
- `pipeline/pipeline_io.py`, `pipeline/apply_gem_categories.py`, `pipeline/apply_airport_categories.py`
- `cache/taxonomy/tags-sample.json`, `cache/taxonomy/seed-predictions.json`
- tests: `tests/test_taxonomy.py`, `tests/test_taxonomy_tagger.py`; new `tests/test_taxonomy_agreement.py`, `tests/test_intel_client.py`, `tests/test_meta_categories.py`
- `tests/fixtures/pipeline_tasks.json`
- `services/intelligence/` (`engines.py`, `README.md`, `Dockerfile`, `requirements.txt`), `.github/workflows/supply-chain.yml`
- `continent-app/config/ai_models.json`

Taste (F3):
- `continent-app/src/lib/taste/` (`profile.js`, `store.js`, `counts.js`; `taxonomyMap.js` regenerated)
- `continent-app/src/lib/recommend/rank.js` and the finder hook
- `continent-app/src/auth/SavedTripsPanel.jsx`, `continent-app/src/auth/mytrips/TasteChips.jsx`
- the admin Overview card `TasteAcceptance`
- `continent-app/src/styles/71-taste.css`, `continent-app/scripts/verify_taste_profile.mjs`
- tests: new `continent-app/tests/tasteRank.test.mjs`, `tasteAdmin.test.mjs`; updated `tasteProfile.test.mjs`
- 7 `taste.profile.*` keys in all six languages

Linking (F4):
- `continent-app/src/lib/linking/` (`fold.js`, `aliases.js`, `linker.js`)
- `continent-app/src/hooks/useDestinationSearch.js`, new `continent-app/src/hooks/usePlaceLink.js`
- `continent-app/src/lib/ask/intent.js`, `continent-app/src/browse/useAsk.js`, `continent-app/src/browse/ask/AskChat.jsx`
- `continent-app/scripts/eval/ask-eval.mjs` (`--link`), `continent-app/scripts/eval/linking/baseline.json` (re-blessed)
- `continent-app/tests/placeLinking.test.mjs`
- `supabase/functions/parse-booking/logic.mjs` and `README.md`
- new `.github/workflows/linking-eval.yml`

MCP and AI transparency (F7, F8):
- MCP server: `services/mcp/src/{tools,data,server}.js`, `README.md`; tests `tests/tools.test.mjs`, new `tests/price_trip.test.mjs`, new `tests/eval/price_trip.eval.json`
- AI label and Report button: new `continent-app/src/components/AiMark.jsx`, `continent-app/src/styles/95-ai-mark.css`, `continent-app/src/lib/aiReport.js`; the Ask, plan-day, day bot, day plan panel and town picker components that show model text
- 18 keys in all six languages; `aiPage.*` text
- tests: `continent-app/tests/aiPage.test.mjs`, new `continent-app/tests/aiReport.test.mjs`
- migration: new `supabase/migrations/074_ai_reports.sql` and `074_ai_reports_down.sql`
- `docs/legal/ARTICLE30.md` (row 15b, two section 2a lines), `docs/security/threat-model.md` (section 13)

Docs:
- `MAP.md` (one row), new `docs/areas/intelligence.md`, `docs/areas/README.md`, `docs/README.md`
- `docs/ai/taxonomy.md`, `docs/ai/taxonomy-labelling-guide.md`, `docs/ai/README.md`, `docs/ai/model-card-plan-day.md`, `docs/ai/model-card-tagger.md`
- new `docs/ai/model-card-suggest-city.md`, `docs/ai/model-card-parse-booking.md`
- new `continent-app/scripts/eval/parse-booking/failures.json`, new `continent-app/tests/parseBookingFailures.test.mjs`
- `docs/HANDBOOK.md` ("Taste profile with validation", "Place linking", "Travel taxonomy and tagging", "Carta MCP server", "Carta Intelligence API", "How Carta uses AI (public page)")
- `docs/reference/` (regenerated), `ROADMAP.md` (F1, F3, F4, F5, F7, F8 status)
- register: `Execution/_OPEN.md`, `Execution/_OPEN-CLOSED.md`, this report

Not touched: the router (S128), the files of S129, S130 and S132, the wire schema.

## Commands run

```
git fetch origin && git checkout -b p15-s131-sweep-intelligence origin/p15-round3
cd continent-app && npm ci ; pip install -r requirements.txt pytest ruff==0.14.3
git worktree add (five worktrees, one per row group, merged back with --no-ff)
python -I pipeline/taxonomy/taxonomy.py check
python -I continent-app/scripts/taste/build_taxonomy_map.py --check
python -I pipeline/taxonomy/tagger.py --items seed --out <scratch>/seed-tags.json --eval-out <scratch>/pred.json
cd continent-app && node scripts/eval/run.mjs taxonomy --predictions <scratch>/pred.json --json
python -I pipeline/taxonomy/tagger.py --sample 40 ; python -I pipeline/taxonomy/tagger.py --all --out <scratch>/full.json
node scripts/eval/linking/eval.mjs --verbose ; node scripts/eval/linking/eval.mjs --bless
node scripts/eval/ask-eval.mjs (with and without --link)
node scripts/eval/run.mjs parse-booking --check ; node --test tests/parseBookingFailures.test.mjs
python3 -I <scratch>/digest.py library/node:24-trixie-slim library/python:3.13-slim-trixie
pip-audit -r services/intelligence/requirements.txt --no-deps --disable-pip --progress-spinner off
local PostgreSQL 16: node scripts/admin/test_rls_policies.mjs ; node scripts/admin/test_privacy_gdpr.mjs ; 074 applied twice
cd services/mcp && npm ci && npm test
cd continent-app && npm test ; npm run lint ; node scripts/ci/design-lint.mjs
FAST_OUT=../.fastbuild node node_modules/vite/bin/vite.js build --config ../scripts/vite.fast.mjs
CHROMIUM_PATH=... node scripts/verify_csp.mjs --dist ../.fastbuild
python -m pytest tests -q (minus tests/quarantine.txt) ; python -m pytest services/intelligence/tests -q
ruff check --select E9,F63,F7,F82 pipeline src scripts run_pipeline.py tests
python -I scripts/docs/build_reference.py (then --check) ; build_lineage.py --check ; config_reference.py --check ; drift.py ; check_entry_points.py
```

## Config and secrets set

None set anywhere. New constants:
- taste: `TASTE_STEP` 0.02, `TASTE_CAP` 0.06 (`rank.js`); `ROLLUP_SHARE` 0.5 (`profile.js`); `MIN_DECISIONS` 10 (`counts.js`)
- linker: `LINK_DEFAULTS.sound` 0.9 (`linker.js`)

New environment variables read only by `pipeline/intel_client.py`: `INTEL_URL`, `INTEL_API_KEY`. Base images pinned by digest (`services/intelligence/Dockerfile`):
- `node:24-trixie-slim@sha256:0820eaa8...`
- `python:3.13-slim-trixie@sha256:09a17cad...`

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Open `next task` rows in the group | 36 | 10 (25 closed, 1 moved to the owner) | -26 |
| Taxonomy nodes labelled in six languages | 103 of 268 | 268 of 268 | +165 |
| Synonyms de / fr / es / it / nl | 0 / 0 / 0 / 0 / 0 | 270 / 251 / 244 / 244 / 245 | new |
| Tagger seed R-precision at 5 / P@5 / recall at 10 / micro F1 | 0.4767 / 0.4533 / 0.5161 / 0.4375 | 0.5033 / 0.4800 / 0.5250 / 0.4375 | +0.027 / +0.027 / +0.009 / 0 |
| Tagger full run (passages / wall time, container) | 210,353 / 24.6 s | 263,220 (306 other-language) / 35 to 40 s | +52,867 passages |
| Mapping test sources | 32 vocabularies | 33 (trail detail highlight kinds, 26) | +1 |
| Linking eval, 300 mentions: MRR / accuracy@1 / accuracy@1 without context | 0.997 / 0.993 / 0.967 | 1.000 / 1.000 / 0.973 | +0.003 / +0.007 / +0.006 |
| Ask eval (E1) with the linker on | rules r@10 57.2, MRR 82.8; bm25 r@10 58.1, MRR 83.8; abstain 30 of 30 | identical (the set has no misspelt place words) | 0 |
| 105 seeded typos asked as "when to visit <typo>", place read right | 1 | 91 | +90 |
| My trips chunk, fast build, raw / gzip | 148,061 / 44,574 B | 137,759 / 41,028 B | -10,302 / -3,546 B |
| Main index chunk, fast build, raw | 876,383 B | 877,535 B | +1,152 B (linker hook, verdict hook, AI mark) |
| Trip finder with no verdicts (`trip_finder_baseline.mjs --offline`) | baseline | identical apart from timings | 0 |
| Trip finder, Not me on Lake: Lake Como | 87, 2nd | 81, 4th | as designed |
| MCP `price_trip` (4 stops) | 1,373.76 EUR, stays only | 1,388.16 EUR with a 14.40 EUR train leg | legs now counted |
| MCP server tests | 11 | 18 | +7 |
| parse-booking failure cases | 0 | 7 (4 removed by the shipped path, 3 known gaps) | new |
| Model cards | 3 | 5 | +2 |
| `npm test` | 2,016 tests: 2,004 pass, 0 fail, 12 skipped | 2,047 tests: 2,035 pass, 0 fail, 12 skipped | +31 |
| Python tests (full, minus quarantine) | 2 failing (see What broke) | 1,137 pass, 2 fail (the same two), 12 skipped | +new tests, 0 new failures |
| Intelligence API tests | 90 | 90 | 0 |
| pip-audit, services/intelligence/requirements.txt | not run (a range line) | 0 advisories, a gate | new |
| RLS suite / privacy harness (local PG 16, with 074) | 856 / 69 | 946 of 946 / 69 of 69 | 074's probes |
| design-lint new violations | 0 | 0 | 0 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| "peru" linked Perugia in Ask once the linker was a fallback, and an abstention case broke | A complete question word was completed as a prefix | `ctx.whole` turns off prefix completion for whole mentions |
| A w/v sound rule sent "hawees" to Chaves | Too broad for the alias table | Rule dropped |
| The pipeline task snapshot test failed | A new task `intel_tags` | `tests/fixtures/pipeline_tasks.json` and the reference regenerated, as the test intends |
| `docs/reference/supabase.md`, `python.md`, `app-lib.md` stale after the merges | New functions and migration 074 | `python -I scripts/docs/build_reference.py`, then `--check` ok |
| `services/mcp` tests failed 1 of 14 on the merged branch | Its own `node_modules` were not installed in the main checkout | `npm ci` there; 18 of 18 |
| The first fast build ran past 300 s | It ran next to the full pytest run | Run alone: 3 s |
| Full pytest: `test_rating_inputs.py::test_beauty_v2_reads_no_register` and `test_rating_stability.py::test_adding_places_moves_nobody_else` fail | Not this task: both read rating input files (UNESCO, pageviews) this branch does not touch; T1154 reported the same two before this sweep | Left as they are; not quarantined by this task |
| `services/intelligence/tests` do not collect when run in one pytest call with `tests/` | Two `conftest` roots | Run separately, as `intelligence.yml` does |
| `ruff check pipeline/taxonomy/tagger.py` (full rules) reports I001 | Present on the base commit; CI runs only E9, F63, F7, F82 | Not touched |

Gotchas:
- In a worktree, `continent-app/node_modules` as a symlink shows as untracked. Stage by path, never `git add -A`.
- `useDestinationSearch.js` statically and dynamically imports `lib/ask/data.js`. Vite warns "INEFFECTIVE_DYNAMIC_IMPORT", which is harmless here.
- `taxonomyMap.js` must be regenerated (`build_taxonomy_map.py`) whenever the taxonomy YAML changes; a test fails otherwise.

## Screens checked

No browser check. The data host is blocked from the container, so the app stops at "We couldn't load Carta's travel data" (as in T1153 and T1156). The checks that did run:
- `verify_ai_page.mjs`: 40 of 40 on the page harness.
- The DOM and unit checks named above.
- The fast build and `verify_csp.mjs`.

The end check must look at these screens at 390 and 1440 px (row T1215-g):
- Ask chat: a list reply and an about/when answer with the AI line, and the Report form opened.
- The plan-day modal result.
- The day bot plan card.
- The day plan panel with an imported summary.
- The town picker AI tab.
- `?legal=ai`.
- My trips, Your Europe: the taste card loads lazily, and See all opens and closes.
- Admin Overview: the taste card.
- Help me choose after a Yes or Not me.

## Rows in the group

Count before: 36 open `next task` rows. After: 25 closed by T1215, 10 still open, 1 moved to the owner.

Closed (moved to `Execution/_OPEN-CLOSED.md`, Status `closed by T1215`):
- **T1149-c:** labels translated, 268 of 268 nodes in six languages; synonyms in five more languages. The native check is new owner row T1215-d.
- **T1149-e:** journeys tagged from their text (`--layers journey`, opt-in). Quality is new row T1215-c.
- **T1149-f:** `pipeline/taxonomy/agreement.py`, with 7 tests.
- **T1149-h:** the trail detail highlight kinds come from `pipeline/trails/scenic.py` `KINDS` and are mapped; a sampled test guards it.
- **T1149-i:** cause fixed in the writer (`atomic_write_json` sets `meta.categories` from the data; the two category scripts no longer append to the old list). The shipped data follows on the next pipeline write.
- **T1149-j:** already done by T1201 (commit a670181de9). It wrote the taxonomy eval to `data/reports/evals/` and `docs/reference/evals.md`. `docs/ai/README.md` and the docs tree row no longer call `docs/ai/` a stub, and the handbook has the "Travel taxonomy and tagging" section (T1150).
- **T1150-g:** trail detail files and other-language passages read.
- **T1150-h:** MAP.md row, area doc and the tagger in `docs/ai/taxonomy.md`.
- **T1152-c:** the trip finder ranking (`lib/recommend/rank.js`) reads `tasteWeights()`. Explore's separate For you sort is new row T1215-a.
- **T1152-d:** admin acceptance card on `admin_taste_weekly`. It says it needs 072 until 072 is live (T1152-a).
- **T1152-e:** parent roll-up and See all per chip.
- **T1152-g:** the card and map load lazily.
- **T1153-d:** Ask reads unknown place words through the linker behind the flag.
- **T1153-f:** `.github/workflows/linking-eval.yml`.
- **T1153-g:** both misses fixed, baseline re-blessed with no case worse.
- **T1153-h:** Destinations search reads the linker behind the flag. Whether the hook is still used is new row T1215-h.
- **T1154-b:** `pipeline/intel_client.py` and task `intel_tags`; service and local tagger agree on all 15 seed items.
- **T1154-d:** `taxonomy.py` takes the data root.
- **T1154-e:** digest pins and pip-audit (gate in `supply-chain.yml`).
- **T1154-g:** MAP.md row.
- **T1155-c:** `price_trip` through `quoteTrip`, with parity test and eval.
- **T1155-e:** MAP.md row, `docs/README.md` row and the area doc (the docs site serves `docs/` as it is).
- **T1156-c:** `AiMark` on every model-written text.
- **T1156-d:** Report button, migration 074, page reworded. The paste is new owner row T1215-b.
- **T1156-e:** two cards and the failure-case set.

Still open (`next task`), one line each:
- **T1149-d:** a score gate needs the owner's 400 labels (T1149-b); a gate on 15 session labels would be noise.
- **T1149-g:** the crosswalk needs verified QIDs, and wikidata.org is refused by the container's proxy (checked 2026-11-07).
- **T1150-c:** fitting weights needs the owner's labels (T1149-b).
- **T1150-d:** a wire schema change (version, `docs/SCHEMA.md`, `contract.mjs`) needs its own task with an end-to-end pipeline run. The data catalogue sweep (S130) runs beside this one in the same batch.
- **T1150-e:** narrowing the verifier band needs T1150-a's measurement of what the verifier adds.
- **T1150-f:** half done. The tagger's seed score is in `ai_models.json` (micro F1 0.4375, was today's tags 0.4309); the verifier's measured tokens per call wait for T1150-a.
- **T1153-b:** Wikidata labels need wikidata.org (refused here) and a pipeline run on the box.
- **T1154-c:** scoring `/similar` needs the owner's 400 labels.
- **T1154-f:** a shared rate-limit store is only needed once a second worker or a public route is decided (T1155-b, owner). With one worker the in-memory limit holds.
- **T1156-g:** none of T1136-a, T1148-a, T1148-e or D15 has landed, so no figure has changed.

Moved to the owner:
- **T1153-e:** the logic is in (`linkBookingPlace`, `linkBookingPlaces` in `logic.mjs`, injected linker, tested). Wiring `index.ts` needs a deploy choice: how the Edge Function loads `linker.js` and about 315 KB of alias data. See Owner steps.

## What is still open

Each is one row in `Execution/_OPEN.md`:
- T1215-a: Explore's For you sort (`lib/match.js`) does not read taste verdicts.
- T1215-b (user): paste migration 074.
- T1215-c: journey tagging is opt-in and unmeasured.
- T1215-d (user): native check of the translated taxonomy labels and synonyms.
- T1215-e: CLAUDE.md's workflow count is stale (outside this task's files).
- T1215-f: the MCP server's swept flight fares need the sweep files in its data dir.
- T1215-g: the browser end check of the touched screens.
- T1215-h: whether `useDestinationSearch.js` is still used.

Plus the 10 rows above that stay open and T1153-e with the owner.

The Claude API was not used and is not needed.

## Rollback procedure

`git revert` of the `T1215:` commits; the merge commits revert with `-m 1`. Nothing is one-way: no migration was applied, nothing was deployed, and no shipped data file changed (`meta.categories` follows only on the next pipeline write). If 074 was pasted, paste `supabase/migrations/074_ai_reports_down.sql`; that is one-way for the reports already stored. The register moves revert with the commit that made them.

## Owner steps (for the checklist)

- [T1215-b] Paste migration 074 (AI reports) | the Report button on Ask and day plans only stores a report once the table and the ai_report function exist; until then it offers the mail link | in the Supabase SQL editor paste supabase/migrations/074_ai_reports.sql after 073; look for "ai reports self-check passed"; if pg_cron is enabled paste it once more so the daily prune is scheduled; from continent-app/ run node scripts/verify_live_policies.mjs | supabase/migrations/074_ai_reports.sql
- [T1215-d] Check the translated taxonomy labels | 165 node labels and the synonyms in five languages were translated by a session and show in the taste card and to the tagger; a wrong word reads as a wrong interest | open pipeline/taxonomy/carta_taxonomy.yaml and read the nl labels and synonyms of nodes whose label_source says "translated by T1215"; fix any word in place (ids stay); ask a native speaker for de, fr, es, it; then run python -I pipeline/taxonomy/taxonomy.py check and python -I continent-app/scripts/taste/build_taxonomy_map.py | pipeline/taxonomy/carta_taxonomy.yaml
- [T1153-e] Decide how parse-booking loads the place linker | booking imports then carry the catalogue place id, so a booking lands on the right stop | choose: import continent-app/src/lib/linking/linker.js by relative path (check that supabase functions deploy bundles a file outside supabase/) or keep a copy in supabase/functions/_shared/ with a test that the two match; choose how the data loads (fetch search_index.json and search/ask/lexicon.json, about 315 KB, once per cold start); tell a session to wire linkBookingPlaces into index.ts and deploy | supabase/functions/parse-booking/logic.mjs, supabase/functions/parse-booking/README.md
