# Run report: owner sweep, review lane

- **Status:** done. Some checks were not reached; they are listed under Open issues.
- **Date:** 2026-11-12
- **Level and playbook:** L2 · deep-task, as one lane of the owner sweep (`Travel App/.work/2026-11-12-owner-sweep/`)
- **Run folder:** `.work/2026-11-12-owner-review/` (the ledger is `ledger.json`; working files are untracked)
- **Branch:** `p15-owner-review`
- **ROADMAP items:** A3, I8, D13, D15, D9, I5, G14, E6

## Summary
The lane checked every step in its walkthrough slice (229) and every row of `docs/owner/owner-checks.md` (81) and `docs/owner/translation-review.md` (46).

- **owner-checks.md:** 25 steps are left, down from 81 rows. What remains needs a dashboard, a real account, real invoices, a community login, or a data run on the box, plus four checks this sweep did not reach.
- **translation-review.md:** 5 native-read steps are left, one per language, down from 46 per-task rows. A scripted audit and a proofreading pass fixed what a non-native reviewer can fix.

Ledger counts (270 unique ids): human 137, handoff 73, decided 26, obsolete 24, already-done 7, done 3. The handoffs include:
- 8 checks that were finished here but whose row lives in another lane's file (`done_here` in the ledger)
- 12 Claude-doable checks this lane did not reach

Most "human" entries are walkthrough rows in other lanes' files: real phones, gold labels, legal and dashboard steps.

## The 49 rows closed in owner-checks.md
- **Already done:**
  - T083-c: rls-policies is green on main.
  - T382-h, T384-a: node_modules is healthy.
  - T877-e: disk is free.
  - T536-b: the stays manifest answers 200.
  - T162-c: TripPage uses DayTrack.
- **Done here:**
  - T517-a: the bag fees hold.
  - T151-g: the week totals are fixed.
  - T804-a: the fares reach 2027.
- **Decided:**
  - T062-a: no history rewrite.
  - T802-d: no renumber.
  - T394-g: Chromium is aligned and nothing uses WebKit.
  - T101-b: two lengths stay.
  - T153-f: the fallback is built; K8 was never found.
  - T557-b: accept `'wasm-unsafe-eval'`.
  - T391-f: whole euros.
  - T395-g: keep as built.
  - T444-a, T444-b: keep the two doors and no new rails.
  - T502-e: keep the counts.
  - T506-b: yes, recorded in D13.
  - T507-e: keep the locale month names.
  - T579-b: the party shares hold.
  - T582-b: "Any way" is the default.
  - T589-a: keep the switch rows.
  - T610-a: keep the letterbox.
  - T621-d: already recorded.
  - T630-f: the paces hold.
  - T812-a: five options are allowed.
  - T877-c, T884-a: keep the first calibration.
  - T1015-a: no identity documents on the server (I5).
  - T459-f, T433-c, T433-l: recorded in ROADMAP D15 part 3.
- **Obsolete:**
  - T970-a: CLAUDE.md now records it.
  - T532-b: the scrape runs on the box.
  - T043-b: folded into T043-c.
  - T089-b: replaced by F1.
  - T175-a: same step as T102-b.
  - T642-e: an engineering proposal.
  - T1018-c: recorded as a HANDBOOK limit.
  - T989-a: G11 covers it.
  - T313-a: retired; its look is folded into step 24.
  - T393-d: DESIGN.md gives the brown to both action and selection.
  - T183-b: the T380 rail rule covers it.
  - T401-c: Fraunces is gone.
- **Moved to translation-review.md:** T156-b and T158-c, now the I8 steps (T158-c's thresholds are kept as built).
- **Moved to ROADMAP D9:** T377-f.

## What we did
1. **Translations (I8).** Audited all six catalogues (10,219 keys each). No keys are missing, no strings are empty, and no English is left in a translation apart from loanwords. Fixed:
   - 837 strings that had lost their accents, ß or the opening ¿ (de 127, es 283, fr 346, it 67, nl 14). Each change was checked to touch the diacritics only. The judge found two verb slips in the accent pass, both fixed: fr `ai.lead` "composé" became "compose", and `beach.whyWaterUnknownNoSource` "ne publié" became "ne publie". It also found 63 more Spanish values, now fixed. The scan works from word lists, so a native reader may still find a few.
   - French register: decided vous everywhere and rewrote 104 tu strings. Typed example queries stay in the traveller's own voice.
   - One shortlist word per language (T411-n).
   - Every "Fix these first" and borderline row of `docs/i18n/review.md`, and the gender-neutral Italian `notfor.*` lines.
   - The parity test passes.
2. **Data reviews** (sub-agent, then reviewed here):
   - T151-g: four trips' week totals now match their own day lines.
   - T431-a to T431-e: the five sample trips were audited against official sources, with 22 sourced fixes in `sample_trips.py` and the trip files. The `sample` flag stays because bed prices are still unverified.
   - T1193-a: the EuroVelo reference list was rebuilt from eurovelo.com.
   - Bag fees (T517-a), party shares (T579-b) and walking paces (T630-f) were checked against published ranges and hold.
3. **Live read-only checks:**
   - **Edge Function auth probes (T1164-b):** plan-day and parse-booking answer 401 with no token, a forged JWT, or the publishable key alone.
   - **Preview `/about/numbers` (T318-a):** answers 200 with HSTS and CSP.
   - **Ask Carta (T565-b, T583-a):** works in production, with 2 or 3 plain sentences.
   - **Sitemap (T222-c):** still the placeholder, and the cost pages answer 404. Both wait on the prerender upload.
4. **Browser checks:**
   - `verify_csp` on the dev server: 28 painted screens at phone and desktop width, 0 CSP violations.
   - `verify_account_panel`: passes.
   - Phone and desktop screenshots of home, on dev and live.
5. **Decisions** (each with one line of reasoning in the ledger):
   - T062-a, T802-d: no history rewrite and no renumber.
   - T391-f: whole euros for estimates.
   - T395-g, T589-a, T610-a: keep as built.
   - T444-a, T444-b, T502-e: keep.
   - T506-b: yes, recorded in D13.
   - T507-e: keep the locale month names.
   - T582-b: confirm "Any way".
   - T812-a: allow five options.
   - T877-c, T884-a: keep the first calibration.
   - T1015-a: no identity documents on Carta's servers (I5).
   - T557-b: accept `'wasm-unsafe-eval'`.
   - T393-d, T183-b: obsolete under the current DESIGN.md.
6. **Repo-state steps** (sub-agent, read-only):
   - Already done: T083-c, T382-h, T384-a, T877-e, T536-b, T162-c, T1088-a.
   - Handed to the orchestrator: the main-checkout clean-ups T252-a, T1040-d, T1040-e and T1034-f.
7. **ROADMAP follow-ups:**
   - D9: cheapTips.json in six languages (T377-f).
   - D15 part 3: the Baths of Diocletian duplicate (T459-f), 74 "Fondali" seabed POIs (T433-c), and wrong kinds and dwell times such as the Colosseum filed as a theatre for 25 min (T433-l). Fix them in `normalize_poi_kinds.py` (mark `^Fondali\b` as noise) and `dedupe_pois.py`, then rerun on the box. `cache/activities.json` is protected.
   - D13: T506-b. I5: T1015-a. I8: status.
   - G14: the phone home double header.

## Findings the orchestrator should see
- **Phone home shows two brand bars** (live and dev, 375 px). The white app header (mark, Together, account) sits above the film, and the film's own mark and Log in sit under it. DESIGN.md says the film's top line lies on the one bar. This was not fixed here, because the phone's account entry now lives in that header (the bottom nav has 3 slots). It is recorded in G14.
- **Ask on live names places that are not on its cards.** In 2 of the 3 answers read: "Castel Gandolfo" for an Italian-lake question, "Lake Bohinj" for a Slovenian hike. It also passed over a budget ("under 80 euros a day" answered with €117). The E6 fix (`19f8f03c17`, 2026-11-06) is newer than the live build, so re-run T1101-b after the ship. If it still happens, E6 is not done.
- **stripe-webhook answers 503 "not configured"** on live (supabase lane: webhook secret).
- **The live stays manifest says `"schema": 18`.** The contract is 20 (deploy lane).
- **`python -I scripts/docs/drift.py`** reports one drift: `docs/SCHEMA.md` wire table. It is untouched by this branch; fix with `node continent-app/scripts/ci/wire-table.mjs --write`.
- **Cycling validation coverage** drops from 0.420 to 0.392 with the official EuroVelo country lists. It is a soft warning, and the baseline was not rewritten. Run `python -I scripts/validation/runner.py cycling --write --write-baseline` if accepted.
- **Two figures read through fetch summaries:** the Biokovo park price and the Kotor walls opening hours. Check both on the official sites.

## Post-ship checks for the orchestrator
After `ship.mjs --live`, check these on the live site:
- T1101-b: five Ask questions, the answer names only the first three cards.
- T887-b: hire car delta.
- T883-b: Map view on the trip finder.
- T227-b: legal page dates.
- T222-c, T224-a, T1076-f, T1113-d: sitemap index, cost pages 200 with `x-carta-prerender`, noindex on thin pages. These need the prerender upload.

## Live-system changes
None. Every live action was a read-only GET, or a probe that should be refused: the Edge Function auth probes, five Ask questions on the live site (about five Gemini calls), and curl of the site, preview and data host.

## Files changed

| File | Change | Why |
|---|---|---|
| `continent-app/src/i18n/{de,es,fr,it,nl}.js` | About 1,080 values (diacritics, vous, shortlist word, review fixes) | I8 |
| `docs/i18n/review.md` | Audit section; fix lists marked resolved | I8 |
| `docs/owner/translation-review.md` | 46 rows to 5 language steps | A3, I8 |
| `docs/owner/owner-checks.md` | 81 rows to 25 steps | A3 |
| `docs/owner/README.md` | Counts | A3 |
| `ROADMAP.md` | I8, D9, D13, D15, I5 and G14 statuses | follow-ups |
| `Trips/carta-unified/carta-unified/data/...` (11 files), `pipeline/journeys/sample_trips.py`, `data/reports/validation/cycling/reference/eurovelo.csv` | Data fixes | T151-g, T431, T1193-a |

## Checks
- `node --test tests/i18nParity.test.mjs`: 21 of 21 pass.
- `npm test` (full run, under load from a parallel judge run): 2,067 tests, 2,012 pass, 49 fail. Each failing file was rerun alone; the results are in the Checks addendum below.
- ruff: clean.
- `pytest tests -k "journey or sample or trip or fill_type or cycling or validation"`: pass.
- `check_entry_points`: OK.
- `drift.py`: 1 drift in SCHEMA.md, which predates this branch.

### Checks addendum: npm test failures, file by file
The full run on this Windows machine had 49 failures; the judge's runs ran in parallel. Each failing file was rerun alone:
- **6 files pass alone**: dataHealth, linkHealth, passMoment, pipelineOverrides, priceNotes, slo, sectionBoundary. They failed only under load.
- **askDocs failed because of this branch.** My `docs/i18n/review.md` text pushed `runbooks/refund.md` to rank 2 for one question (recall@1 0.792, base 0.813, baseline 0.833, tolerance 0.02). The text is reworded, and the gate passes again at 0.813, the same as base (checked with `runAskDocsEval({docsDir})` on `git archive b6a5237190 docs`). Other lanes' docs edits can move this number too, so rerun it after the merge.
- **Not from this branch.** This branch touches none of these files' inputs:
  - cspHashes, pagesAuth, motion-tokens and sharedParts: a Windows path bug (`scandir 'C:\C:\...'`).
  - pressKit and promptRegistry: CRLF checkout.
  - taxonomyEval: the Python `yaml` module is missing.
  - aiGateway: the Python attack-set scan.
  - wire-contract: the SCHEMA.md drift, which predates this branch.
  - placeLinking: built from the worktree's untracked `public/app_data.json`.
  - aiEvents, costCardUmber, rankTier, seasonStrip and shareAssets: Vite transport and DOM timeouts.
- CI on Linux is the authority. See the CI line in the final hand-back.

## Open issues
- **Claude-doable steps not reached** (kept with exact steps):
  - owner-checks: T286-e, T335-c, T430-a, T168-b.
  - unsorted, now handoffs: T1176-a, T1181-a, T1199-a, T1204-a, T1189-j, T1197-b, T1194-a and T1194-c.
  - Walkthrough rows, recorded as `human` with "not reached": T1114-a, T1117-b, T1125-a, T1164-a, T1203-b, T1206-e, T405-c and T695-b.
- **No `checks.md`:** the live-check results are in the ledger evidence and in this report, not in a separate file.
- **Most `verify_*.mjs` scripts did not run cleanly here.** Each has its own CLI, and the Vite dev server re-optimises dependencies mid-run ("504 Outdated Optimize Dep"). A shared runner that warms the server, or a stable preview build with the data, would make these checks usable by sessions.
- **The other lanes must delete these rows from their own files:** the walkthrough rows in other lanes' files that are now covered or obsolete, listed as `handoff_to` in `ledger.json`. The unsorted lane holds the translation rows (now the I8 steps), the T431 audit rows and the live checks done here.

## How to undo
`git revert` the commits on `p15-owner-review` (`git log b6a5237190..p15-owner-review`): translations, data reviews, decisions and owner-checks, judge fixes. Nothing here is one-way.
