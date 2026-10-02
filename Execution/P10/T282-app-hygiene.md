# T282: app hygiene

## Task ID

T282

## Date

2026-10-02

## What changed

Six open register rows are closed. The one remaining exhaustive-deps warning in `i18n/index.jsx` now carries a disable comment that gives the reason (`loaded` is the signal that the catalogue arrived), and `react-hooks/exhaustive-deps` is an error in `eslint.config.js`, so a new regression fails lint. The stale disable directive in `browse/CategoryRail.jsx` is gone. `PassModal` and `AiDayPlanModal` now use `useFocusTrap`, which moves focus in, keeps Tab inside the card, hands focus back on close and binds Escape on the capture phase of the shared escape stack. In `PassModal` the trap is switched off while the Terms page is open on top, because `TermsOfService` has no Escape of its own and would otherwise close the pass modal behind it. The Content tab in the admin panel now reads the trails index, which names the country field `country` and counts with `n_trips`, so trails can be browsed by country. `BagCheck.jsx` is deleted together with the eight `itin.bag*` keys (they existed in `en.js` only; the other five locales never had them). Git keeps the deleted file. `lib/baggagePolicies.js` stays; it is outside this task's scope and now has no reader.

## Files touched

**Modified (continent-app):**
- src/i18n/index.jsx
- src/i18n/en.js
- eslint.config.js
- src/browse/CategoryRail.jsx
- src/components/PassModal.jsx
- src/planner/AiDayPlanModal.jsx
- src/components/admin/ContentSection.jsx

**Deleted:**
- src/components/BagCheck.jsx

**Modified (root):**
- Execution/_OPEN.md (six rows set to closed by T282)

## Commands run

`npm run lint` in the app worktree: 0 errors, 70 warnings, none of them exhaustive-deps (before: the same count minus the two removed here, with exhaustive-deps at warn). Six i18n files parsed with the rule 8 loop. Browser check with Playwright on a temporary vite library bundle of both modals (see below); every temporary file removed before commit.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| exhaustive-deps level | warn | error | tightened |
| `itin.bag*` keys in en.js | 8 | 0 | -8 |
| lint errors | 0 | 0 | 0 |

## What broke and how it was fixed

No issues in the code. One tooling snag: `vite` dev hung in dependency optimisation on this machine (the page never reached domcontentloaded, three tries), so the two modals were checked from a one-off `vite build` library bundle with the real `styles.css`, mounted in headless Chromium. At 380px and 1280px, for both modals: focus lands inside the dialog on open, 40 Tab and 5 Shift+Tab presses never leave it, Escape calls onClose once, and focus returns to the opener. No page errors. The close button shows its focus ring. The admin Content tab country list was verified by reading `public/trails/index.json` and `AD.json` (field `country`, count `n_trips`, array `trips`), not in a browser. The temporary bundle and entry files were deleted.

## What is still open

T192-d stays open for T283 (audit of the remaining 76 disable comments). `lib/baggagePolicies.js` has no reader now; a later cleanup can delete it. `TermsOfService` has no Escape handler and no focus trap; it is outside this task. No new register rows.

## Rollback procedure

Revert the app commit on branch p10-app-hygiene (`git revert <hash>` in continent-app) and the root commit that carries this report and the register edit. Nothing else changed: no data, no migration.
