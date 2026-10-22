# T563 to T566: Ask Carta, the four unverified items, checked with the owner

## Shared header

**Date:** 2026-10-22

**Why:** the T550 to T558 report left four items unverified: no real model had written an answer, the on-device install was untried, nothing ran on a Pages preview, and Home still handed old filters to Explore. The owner took them one at a time, approving each outward step in chat: Workers AI use on their account (three runs of 140 questions), the 845 MB model download into the in-app browser, the `carta-ask` KV namespace, and the Pages preview deploy.

**Branches:** app `p11-ask-carta` (wt/p11-ask-carta-app, commits `b315ff4` to `ec0a6ba`), root `p11-ask-carta` (the mirror and this report). Not merged, not pushed. Production is untouched: the only deploys went to the `preview` branch of `carta-app`, `cb340b43` (step 3) and `b7acb178` (step 4), both at https://preview.carta-app.pages.dev. No data went to R2.

**Checks:** `npm test` 623 of 623 (621 after T563's first commit), eslint clean on touched files, design-lint with no new Ask or Home violation, `npm run build:pages` PASS at 210 files. Browser checks in the in-app Chromium, on the dev server and on the preview.

**Workers AI used today:** about 6,400 Neurons (three 140-question runs, plus a few probes), inside the 10,000 free.

---

## T563: a real model writes the answers

### What changed
A real open model (`@cf/qwen/qwen3-30b-a3b-fp8` on Workers AI) wrote answers for all 140 golden questions through a local `wrangler pages dev` of the Functions: real AI binding, throwaway local KV.

The first run exposed a bug: Workers AI streams a lone digit as a JSON number, and the stream reader dropped every falsy piece, so "80" became "8". It is fixed in the Function and the browser reader, with a test.

Reading the kept sentences showed the keep rate hid real errors, so v2 moved reasoning out of the model:

- **Comparison notes written by code:** who is cheaper, drier, warmer or higher scored, with both figures.
- **Budget verdicts:** fits, or over and fits only by spending the buffer.
- **When answers:** the driest and warmest month, and what Carta does not know (crowds by month).
- **List answers:** Carta's order, and the cheapest, highest scored, warmest and driest among the places shown.
- **Two new check rules:**
  - a comparing or judging sentence must cite such a note, or a cited note that makes the same comparison;
  - a figure the notes give only as an estimate must keep its "~".
- **Prompt v2:**
  - cite every sentence;
  - compare only from a note;
  - name places in note order;
  - "Carta does not know" when the notes cannot answer.

`scripts/ask-eval-live.mjs` repeats the measurement against any endpoint.

### Files touched
Modified: `functions/api/ask/answer.js`, `src/lib/ask/{generate,context,verify}.js`, `src/browse/useAsk.js`, `tests/askGenerate.test.mjs`. Created: `scripts/ask-eval-live.mjs`.

### Commands run
`npx wrangler pages dev <static> --kv ASK --port 8799 --persist-to wt/.askdev/state` (the AI binding is remote); `node scripts/ask-eval-live.mjs --endpoint http://localhost:8799 --out wt/.askdev/eval-v{1,2,3}.json`.

### Config and secrets set
None. The local KV state lives in `wt/.askdev/`, outside both repos.

### Before/after measurements

| Metric | v1 | v2 | v3 (shipped) |
|---|---|---|---|
| Sentences the check keeps | 661/690, 95.8% | 588/720, 81.7% | 619/698, 88.7% |
| Answers withdrawn | 2/140 | 35/140 | 15/140 |
| Main drop reason | no citation (27) | unsupported comparison (106) | unsupported comparison (46), no citation (22) |
| Wrong kept sentences on a reading review of compare, budget and when answers | about 1 in 5 in compare; budget "San Sebastián fits"; Hallstatt "least crowded in January" | not reviewed | the v1 errors gone; soft judgements remain |
| First words / whole answer (median) | 0.28 s / 1.2 s | 0.28 s / 1.3 s | 0.26 s / 1.3 s |

v2 also re-scored offline after the refinements: 84.4%, 28 withdrawn. Mean pack cost stays at 14.9 Neurons, about 605 answers a day at the cap.

### What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| "80 euro" read as "8 euro", "of 10" as "of 1" | a streamed `{"response": 0}` failed `if (!p)` | `p == null`, pieces kept as strings |
| Kept sentences reversed a comparison | the model worked out comparisons itself | code writes them as notes; the check demands one |
| "best visited in June" dropped as a verdict | the compare rule read "best" | season phrases excluded in six languages |
| A guide's "quieter than Bled" dropped | the rule ignored the passage itself | a cited note making the comparison passes |
| A 3-way compare pack had 15 notes | comparison notes added after the table rows | they lead, and the pack is clamped to 14 |
| The compare word pattern lost its letter class | a shell heredoc ate a backslash | written with the Edit tool; eslint caught it |

### What is still open
T563-a (soft judgements still pass on a cited note, such as "Barcelona is the best option"; the score caveat for compare notes is not re-measured). T563-b (non-English packs mix English labels: "best months", "score", country names).

### Rollback procedure
`git revert 33cff15 b315ff4` in the app repo.

---

## T564: the on-device model, tried and turned off

### What changed
"Answer on this device" was tested end to end in the in-app Chromium 152 on this laptop's Intel Iris Xe (gen-12lp, shader-f16), with the model from Hugging Face through a temporary dev setting.

- **What worked:** nothing downloaded before the click; the 845 MB came down and loaded in about 2 to 3 minutes; the answer was written on the device with no server call; Remove emptied the three `webllm/*` caches and the opt-in.
- **What failed:** the answer was slow and wrong, so the check withdrew it (table below).

With the owner's choice, the offer is off for travellers: `VITE_ASK_ON_DEVICE=1` turns it back on, and the module is not even fetched without it. The code stays.

### Files touched
Modified: `src/browse/AskSearchFull.jsx`. A temporary `.env.development.local` (`VITE_ASK_MODEL_BASE=hf`, gitignored) was made and deleted.

### Commands run
Browser only.

### Config and secrets set
`VITE_ASK_ON_DEVICE` (unset means off).

### Before/after measurements

| Metric | On device (Qwen 2.5 1.5B q4f16, Iris Xe) | Server (Workers AI, T563 v3) |
|---|---|---|
| First words | 7.5 s | 0.26 s |
| Whole answer | 44 s (184 pieces) | 1.3 s |
| Check | 1 of 9 sentences kept, withdrawn | 88.7% kept |
| What went wrong | bullets, bold, one citation for all; "Porto has less rain (~31 mm)"; invented "higher average temperature" | none of these |

### What broke and how it was fixed
The progress line jumps backwards (74% to 34%), because WebLLM reports its download and its load as separate phases, and "Writing the answer" shows no progress for 45 s. Neither is fixed, since the offer is off.

### What is still open
T564-a (retry on-device when a small model writes to the format; Gemma 2 2B untried; the progress and waiting issues above).

### Rollback procedure
`git revert a287e00` turns the offer back on for everyone.

---

## T565: Ask Carta on a real Pages preview

### What changed
**Deploy layout fixed:** the production build sends every `search/` file to the R2 data bucket, where the Ask index was never uploaded. Now `search/ask/` stays with the Pages deploy:

- `dataHost.js` gains `PAGES_KEEP`, so the browser fetches the index same-origin;
- `stage-data.mjs` moves it back from `dist-data/`;
- the Function reads it from its own assets, and the R2 upload never carries it.

This closes T551-b.

**Bindings:** the `carta-ask` KV namespace is created (`d3eaced3f4c140efb5ff49afd9fd66e4`) and bound as `ASK`.

**Citations:** a sentence's citations show as one figure, "2, 3, 7", not "237".

**Deploy:** built with `npm run build:pages` (210 files) and deployed to the `preview` branch. Verified on the preview:

- `/api/ask` reads its own files ("lake village in Austria": St. Wolfgang, Altaussee);
- `/api/ask/answer` streamed in 1.55 s, the KV counter showed 4 Neurons and the answer was cached;
- in the browser: the Porto and Lisbon comparison, and €1,500 for two from the Brussels origin (Paris, Bruges and Antwerp fit; London, Köln and Utrecht are over);
- the CSP is live with `'wasm-unsafe-eval'` and no violations;
- Plan, My trips and the Porto page render;
- the dev-only hooks are absent;
- the only 404s are the known `status.json` and stays-live manifest on the data host.

### Files touched
Modified: `src/lib/dataHost.js`, `scripts/r2/stage-data.mjs`, `wrangler.toml`, `src/browse/AskSearchFull.jsx`. The worktree's `.env` (gitignored) was copied from the main checkout for the build.

### Commands run
`npx wrangler kv namespace create carta-ask`; `npm run build:pages`; `npx wrangler pages deploy dist --project-name carta-app --branch preview --commit-dirty=true`; `npx wrangler kv key list/get --namespace-id d3eaced3f4c140efb5ff49afd9fd66e4 --remote`.

### Config and secrets set
The KV namespace `carta-ask` on the owner's account. No secret was added.

### Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Pages deploy files | 210 (T558 fast build basis) | 210, 55.9 MiB, `search/` 36 files 45.3 MiB | |
| Written answer on Cloudflare | never run | 1.55 s, 4 Neurons, cached | |

### What broke and how it was fixed
`wrangler pages dev` could not open its SQLite store under the short `GEBRUI~1` temp path; the state moved under `wt/.askdev/`.

### What is still open
T565-a (Pages per-file limit is 25 MiB; the largest ask file is 8.9 MB, but a much larger index must shard).

### Rollback procedure
`git revert 5489f57`; delete the namespace with `npx wrangler kv namespace delete --namespace-id d3eaced3f4c140efb5ff49afd9fd66e4` if Ask is dropped; the preview alias is overwritten by the next preview deploy.

---

## T566: Home's search hands the typed question to Ask

### What changed
- **The pill is a field:** Home's pill is now Ask Carta's own field (a search form with an Ask button, same pill).
- **Typed question:** it opens Explore with the question already answered, through seed `{ question }` and `askSeed` into the panel. The question waits for the vocabulary like any early question.
- **Empty field:** Ask opens the panel.
- **Try suggestions:** the three ask their own words ("Hiking in the Alps in July") and keep their Explore links for a modifier click.

Verified on the dev server and on the preview (`b7acb178`).

### Files touched
Modified: `src/browse/home/HomePage.jsx`, `src/styles/61-v6-home.css`, `src/browse/ExploreTab.jsx`, `src/browse/AskSearch.jsx`, `src/browse/AskSearchFull.jsx`.

### Commands run
`npm test`; `npm run build:pages`; `npx wrangler pages deploy dist --project-name carta-app --branch preview --commit-dirty=true`.

### Config and secrets set
None.

### Before/after measurements

| Metric | Before | After |
|---|---|---|
| Home's search | a link that opened the panel empty | a field whose question is answered on arrival |
| Home's three Try questions | applied guided filters | asked in their own words |

### What broke and how it was fixed
No issues.

### What is still open
None.

### Rollback procedure
`git revert ec0a6ba`.
