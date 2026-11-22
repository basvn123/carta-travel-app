# Run report: Uitgaven and the Reiskas (spend capture with a split)

- **Status:** paused (waiting for: the owner's review of the preview, then the owner steps: apply migration 077 and upload the OCR model to R2, then merge `p15-my-trips`)
- **Date:** 2026-11-22
- **Level and playbook:** L2 · feature plus design (deep task)
- **Run folder:** `.work/2026-11-21-spend-capture/`
- **ROADMAP item:** G15

## Summary
The owner asked for spend capture with a Tricount-style split, by speech and photo, as simple as possible and without Gemini. Today now has one quiet "Uitgaven" row. It opens a page with two tabs, Vandaag and Reiskas, and one add bar:
- type the amount;
- say it, read by a local parser in six languages;
- or scan a receipt, read on the device by Tesseract.

Every spend passes "Klopt dit?" before it is saved. Judge round 1 failed (3.39). Judge round 2 passed (4.00), and the optional polish from round 2 was applied after it.

## What was asked
- A Tricount-like kas with friends: who paid, who shares, uneven amounts, the fewest transfers, and a nudge to pay ("Por").
- Adding by keypad, speech or a receipt photo, with a confirm step for the totals.
- The trip page stays short: only a quiet "Uitgaven ›" row.
- Minimal text, dark brown (not the light brown), and a photo and an amount per person.
- No Gemini.
- Full brief: `brief.md`.

## What we did
1. **Intake and plan:** `brief.md`, and `plan.md` with an 8-criterion rubric.
2. **Explore:** five files, covering the current code, the market, Tricount, the tech (speech, OCR, quota) and nudging.
3. **Propose:** three directions (A keypad-first, B capture-first, C Reiskas-first).
4. **Critique:** four lenses (speed, money, privacy and accessibility, brand).
5. **Decide:** B in A's structure (`decision.md`). The owner then removed Gemini.
6. **Prototype and owner rounds:** 13 artifact versions (https://claude.ai/artifact/RA8F17Extp9NbdDq5gP5QL), with the owner's changes:
   - Por instead of a QR;
   - calmer rows;
   - Iedereen colours and winks;
   - the receipt as paper with tappable amount chips;
   - optical alignment.
   A 59 s demo video, `uitgaven-reiskas-demo.mp4`, was recorded for sharing.
7. **Build:** seven phases on `p15-my-trips` (`build-spec.md`, `progress.md`), to the owner's smoothness bar.
8. **Judge round 1:** FAIL, 3.39. The OCR hung on a missing model, tender lines were read as receipt totals, old rows split over too few people when the crew was partly named, and speech took the first number. All five fixes plus five optional items were applied.
9. **Judge round 2:** PASS, 4.00. Its five optional improvements were then applied.
10. **Documented:**
    - decision `docs/decisions/0014-spend-on-device.md`;
    - a project-map row;
    - the HANDBOOK section and the ROADMAP G15 row (in the branch);
    - this report and the `.work/INDEX.md` line.

## Why
Capture-first, with a fixed add bar, makes logging 3 taps plus the digits. The page holds everything, so the trip page stays short. Reading speech and receipts on the device without AI keeps the receipts private, works offline and costs no quota. The trade-off is weaker reading of crumpled receipts, which "Klopt dit?" always catches. Full reasoning: [`decision.md`](decision.md) and `docs/decisions/0014-spend-on-device.md` (branch).

## Files changed
All paths are in the worktree `C:/Users/Gebruiker/Documents/Portfolio/wt/my-trips`, branch `p15-my-trips`. Commits: `7b15b0e997`, `3263ba51c8`, `53535bba1e`, `413f224e71`, `05decef82c`, `4605cbaf7e`, `6e804d579c` and `dd5447a1de`.

| File | Change | Why |
|---|---|---|
| `continent-app/src/lib/spend/model.js` | New: cents, splits by person id, the remainder to the payer, `mineCents`, old rows as an equal split over the whole party, kas balances and transfers, the ledger bridge, `draftRateOf` | Money model |
| `continent-app/src/lib/spend/parse.js` | New: the speech parser in six languages (number words, which-amount pairs, count nouns, thousands) and receipt totals (tender lines excluded, last total wins) | Speech and receipts without AI |
| `continent-app/src/auth/mytrips/spend/SpendPage.jsx` | New: the page with tabs, rows, Reiskas, Iedereen and toasts with undo | The Uitgaven page |
| `continent-app/src/auth/mytrips/spend/SpendSheets.jsx` | New: the add, confirm, detail, all, Por, listen, which, scan and receipt sheets | Every flow |
| `continent-app/src/auth/mytrips/spend/parts.jsx` | New: faces, the "me" mark, the shared parts | Rows and Iedereen |
| `continent-app/src/auth/mytrips/spend/icons.jsx` | New: category and action icons (the plate with fork and knife) | Owner fix |
| `continent-app/src/auth/mytrips/spend/device.js` | New: haptics and speech feature detection | Smoothness, hide the mic where unsupported |
| `continent-app/src/auth/mytrips/spend/ocr.js` | New: lazy Tesseract with an error handler, a 30 s timeout and a worker reset | Receipts on the device, no hang |
| `continent-app/src/auth/mytrips/spend/ocr.worker.js` | New: the Tesseract worker entry | OCR off the main thread |
| `continent-app/src/auth/mytrips/spend/ocrGlobal.js` | New: the OCR model location | R2 model path |
| `continent-app/src/auth/mytrips/spend/receiptStore.js` | New: receipt photos in IndexedDB, re-encoded without EXIF | Privacy |
| `continent-app/src/auth/mytrips/TodayCard.jsx` | The spend block becomes one "Uitgaven" row that opens the page | Short trip page |
| `continent-app/src/auth/mytrips/savedMocks.js` | `?savedmock=spend` sample (Portugal, Sam, Jo, Lien) | Preview and verify |
| `continent-app/src/auth/SavedTripsPanel.jsx` | Road spend feeds Your Europe and the year card | One ledger |
| `continent-app/src/auth/pastTripMemory.js` | Per-category merge of logged and typed spend | No double count |
| `continent-app/src/planner/dayPlanStore.js` | `kas` key in the extras whitelist | Storage |
| `continent-app/src/styles/72-spend.css` | New: every spend style, reduced motion, the torn paper edge | Look and motion |
| `continent-app/src/styles/70-mytrips.css` | The old `.mt-spend` form replaced by the door row | Short trip page |
| `continent-app/src/styles/72-atlas.css` | Removed spend rules that moved | Clean-up |
| `continent-app/src/styles/01-tokens.css` | New token `--owe` (#b3402a) | Red minus in Iedereen |
| `DESIGN.md` | Records `--owe` | Token rule |
| `continent-app/src/i18n/nl.js`, `en.js`, `de.js`, `fr.js`, `it.js`, `es.js` | 120 new keys each | Six languages |
| `continent-app/package.json`, `continent-app/package-lock.json` | `tesseract.js` 7.0.0 | On-device OCR |
| `continent-app/tests/spendModel.test.mjs` | New tests: split, rounding, party padding, the bridge, the stored rate | Money correctness |
| `continent-app/tests/spendParse.test.mjs` | New tests: speech in six languages, ambiguity, counts, thousands, receipts in DE, IT, NL, FR, ES, PT and UK | Parser correctness |
| `continent-app/scripts/verify_spend.mjs` | New: 85 DOM checks at 360 to 1440 (overflow, 44 px, axe, no remount, CLS, reduced motion, alignment, the OCR 404 and happy paths) | Verification |
| `continent-app/scripts/fixtures/make-receipt.mjs`, `continent-app/scripts/fixtures/receipt-sample.png` | New: the receipt fixture | OCR check |
| `supabase/migrations/077_group_expenses_split.sql`, `supabase/migrations/077_group_expenses_split_down.sql` | New, not applied: extend 058 with shares, currency, category, client_id and a column update grant | Phase 2 kas by link |
| `docs/owner/supabase-migrations.md` | Owner step 5: apply 077 | Owner step |
| `docs/owner/cloudflare.md` | Owner step: upload `eng.traineddata.gz` to R2 at `ocr/4.0.0_best_int/` | Owner step |
| `docs/HANDBOOK.md` | New Uitgaven and Reiskas section (Betaal waits for phase 2) | Doc duty |
| `ROADMAP.md` | New row G15 with the phase 2 notes | Doc duty |
| `docs/decisions/0014-spend-on-device.md`, `docs/decisions/README.md` | New decision record and its index line | Lasting choice |
| `docs/project-map.md` | New "Uitgaven and the Reiskas" row | Map |
| `.work/INDEX.md` (main checkout) | Run line | History |

## How it fits together
```
Today (TodayCard) ── "Uitgaven ›" ──> SpendPage
   Vandaag tab ── rows from extras.expenses (model.js)
   Reiskas tab ── balances + transfers (model.js → together/settle.js)
   add bar: keypad | mic (Web Speech → parse.js) | camera (ocr.js → Tesseract, lazy → parse.js)
            └─> "Klopt dit?" ─> save (cents, split by id, mineCents) ─> extras (synced as today)
extras.expenses ──(bridge)──> pastTripMemory / SavedTripsPanel ──> Your Europe cost chart, year card
Phase 2: migration 077 on group_trip_expenses (058) for a kas shared by link
```

## How it was checked
- **Spend tests:** 28 pass, 0 fail. With the related suites (myTripsHub, flowMemory, togetherSettle), all pass.
- **Full `npm test`:** 2447 tests, 2418 pass, 16 fail. The 16 are the same names in every round (diffed). They are environment or pre-existing failures, none in spend code. The CSP test fails on its own `C:\C:\` path bug, so its rule was applied to the new files by hand: clean.
- **Lint:** eslint 0 errors. design-lint 0 new.
- **Token contrast:** clean with `--owe`.
- **Fast build:** builds. Tesseract is only in lazy chunks.
- **`verify_spend.mjs`:** 360, 390, 820, 1180 and 1440, with `--ocr`: 85 cells, 0 fail. The model missing (404) ends honestly in "type the amount"; the served model reads 9,60.
- **Docs:** `check_entry_points.py` OK. `drift.py` shows 4 pre-existing drifts, none in touched files.
- **Preview smoke check:** 390, sample data, Vandaag and Reiskas render with 0 page errors.
- **Judge round 1:** FAIL, 3.39 (`judgement-1.md`).
- **Judge round 2:** PASS, 4.00 (`judgement-2.md`).

| Criterion | Round 1 | Round 2 |
|---|---|---|
| 1 Speed to log | 4 | 4 |
| 2 Clean and minimal | 4 | 4 |
| 3 Split that works | 3 | 4 |
| 4 Speech and photo | 2 | 4 |
| 5 One ledger, honest numbers | 4 | 4 |
| 6 Feels Carta and alive | 4 | 4 |
| 7 Responsive and accessible | 4 | 4 |
| 8 Fits the codebase | 4 | 4 |

The round 3 polish (last number for a count, a clean name, the stored-rate test, the torn edge) was checked by the builder's runs only, not by a judge.

## Open issues and risks
- Migration 077 has not run against a database: not verified.
- Receipt reading does nothing in production until the OCR model is on R2. Until then a scan keeps the photo and asks for the amount.
- The OCR reads English only, so accents are lost ("Pasteis"). This is a G15 phase 2 note.
- Phase 1 is a local kas on one phone. Join by link, Betaal, extras sync merging by id, the "Hier" currency and "Deel stand" are G15 follow-ups.
- `tesseract.js` was unpacked into the shared `node_modules` without a full install, so other sessions' packages were not pruned. A later `npm ci` in main installs it properly.
- If a scan is closed while Tesseract is still loading, its thread ends only once it arrives.

## Next steps
1. **Owner:** review the preview at `http://127.0.0.1:5852/?tab=trips&savedmock=spend`, then tap Uitgaven on Today.
2. **Owner:** apply migration 077 (`docs/owner/supabase-migrations.md`, step 5) and upload the OCR model (`docs/owner/cloudflare.md`).
3. **Owner:** merge `p15-my-trips`, which also carries the My trips redesign (G12). Undo with `git revert` of each commit.
4. **Engineering, phase 2 (G15):**
   - kas by link;
   - Betaal;
   - row-level sync;
   - multi-language OCR.

## Where to find things
- Brief and plan: `brief.md`, `plan.md`
- Options considered: `proposal-A.md`, `proposal-B.md`, `proposal-C.md`, `critique-*.md`
- Approved prototype: `prototype/spend.template.html`; the artifact link is above
- Build log and checks: `build-spec.md`, `progress.md`, `checks.md`
- Judgements and screenshots: `judgement-1.md`, `judgement-2.md`, `judge-shots/`, `judge2-shots/`, `shots/`
- Demo video: `uitgaven-reiskas-demo.mp4`
- Lasting decision: `docs/decisions/0014-spend-on-device.md` (branch `p15-my-trips`)
