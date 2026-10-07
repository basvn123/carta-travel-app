# Execution Report: T364

## Task ID

T364: the owner's small interface calls (register row T362-b)

## Date

2026-10-07

## What changed

Seven of the eight calls in row T362-b are built; the eighth, removing the Stay step, was not, because its premise is wrong.

Filters on Explore (phone) is now a bordered secondary: white card ground, `--rule` border, `--ink` text, ink badge. The Lifestyle panel now sits over a scrim on every tab; the scrim was only drawn on Explore, so the left-hand variant was moved above it (z-index 41) and the scrim colour is now `--ink` at 28 percent through `color-mix`. `DualRange` is deleted from `FilterControls.jsx` (it had no caller). A thrown shared-trip fetch now shows a message and a "Try again" button; an unknown, withdrawn or expired link still shows the "gone" state, so a visitor learns nothing about the owner, and only a failure of the visitor's own connection is told apart. The fine-pointer exception is written into `docs/COMPONENT_ROLES.md` and applied: on a mouse at 769 px and wider, the compact Explore and trip planner controls that were under 32 px are now 32 px (country rows and their arrows, "See all", rail arrows, card star and info buttons, the month select, recap chips, length buttons, the start-over and show-any-length links). The Button `sm` size already did this. Colours in JavaScript: one module, `src/map/tokenColors.js`, holds the hex values copied from `01-tokens.css`; ExploreMap, CountryPickerMap, TripMap, DestMap, TrailPage and CyclePage use it (three private `token()` helpers became one `tokenColour`). The design lint has two new rules for it.

The Stay step was not removed. T312 said only a stored draft could open it. I walked the Trips step headless at 1280 px: the "build your own" card (and the empty state's button) calls `onBuildOwn('custom')`, and the Stay step with the city map opens. Removing it would remove a working feature, so I left the code and raised T364-a for the owner.

The lint edit is asked for by row T362-b, which names "one token-mirror module for JS colours and the lint check (T196-b)"; T196-b's row asks for a policy for hex colours in JS, and DESIGN.md (T362) says the lint is to check it once the module exists. One visual side effect: the trip route line and the country highlight on TripMap were the old terracotta `#c8501e` and now use the live `--accent`; the ferry line uses `--water-link`. The three Explore tier colours that have no token stay in the module under `MAP_ONLY_COLOURS`.

Carta-design questions: (1) the one primary action per screen: Explore has none, the Filters door is secondary; (2) tokens only, no new token, no hex outside the mirror; (3) fonts untouched; (4) 6 px radius on the new rules not applicable (the Filters pill keeps its 999px status shape from its existing rule); (5) copy: one new string, plain, no dash or middot; (6) touch targets: 44 px kept on touch, 32 px only under `pointer: fine` from 769 px; (7) states: loading, failure, gone and success of the shared trip checked.

## Files touched

App repo (`continent-app`, branch `p10-owner-ui-calls`):

**Modified:** `src/App.jsx`, `src/auth/SharedTripView.jsx`, `src/auth/tripShares.js` (a `?sharemock=fail` seam, dev only), `src/components/FilterControls.jsx`, `src/browse/ExploreMap.jsx`, `src/browse/DestMap.jsx`, `src/browse/TrailPage.jsx`, `src/browse/CyclePage.jsx`, `src/map/CountryPickerMap.jsx`, `src/map/TripMap.jsx`, `src/styles.css` (one import), `src/i18n/{en,de,es,fr,it,nl}.js` (one key each, `share.loadFailed`), `scripts/ci/design-lint.mjs`, `scripts/ci/design-lint.baseline.json`, `scripts/ci/fixtures/design-lint/bad/src/seeded.js`.

**Created:** `src/map/tokenColors.js`, `src/styles/46-owner-calls.css`, `scripts/ci/fixtures/design-lint/bad/src/map/tokenColors.js`, `scripts/ci/fixtures/design-lint/bad/src/styles/01-tokens.css`.

Root repo (branch `p10-owner-ui-calls`): `docs/COMPONENT_ROLES.md`, `DESIGN.md`, `Execution/_OPEN.md`, `Execution/P10/T364-owner-ui-calls.md`.

## Commands run

Vite dev server on 5217 with a config outside the repo and its own cache directory; Playwright scripts kept in `wt\T364-shots\` (outside the repo); `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs` (and `--self-test`, and `--update-baseline` once), `npm run build`, `vite preview` on 5217 for the keyboard audit, then the server was stopped and `dist/` deleted. The i18n files were parsed with the six-language loop after the edit.

## Config and secrets set

None. The Supabase environment variables were unset in every shell; nothing contacted a live project.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Explore controls under 32 px at 1280 px (measured on the idle Explore page) | 7 control types, 192 elements | 0 | -192 |
| Trip planner controls under 32 px at 1280 px (Booked to Trips steps) | 4 types (start over, recap chip, length button, show-any-length) | 0 | -4 types |
| design-lint baseline total | 204 | 213 | +9 |
| design-lint baseline, existing rules | 204 | 196 | -8 (middot 15 to 11, shadow-literal 129 to 126, gradient 24 to 23, stale entries dropped) |
| design-lint baseline, new rule js-hex-literal | not a rule | 17 | +17 |
| Hex literals in the six map files outside the mirror (grep) | present in all six | 0 | cleared |

The lint baseline needs a plain account. No existing rule gained an entry, and four counts shrank. The 17 are lines that already existed in `destinationPdf.js`, `tripExport.js` and `dayPlanPdf.js` (print and PDF colours) and are only now seen because the new rule exists; they were not hidden from review and not added by this change. I chose to baseline them rather than exempt the files, so they stay countable and shrink-only (row T364-b). Flag artwork (`CountryFlag.jsx`) and the Google mark (`GoogleButton.jsx`) are exempt by name in the lint, because they are artwork and not design tokens. If the orchestrator would rather not carry the 17, the alternative is to migrate those three files first.

The counts of controls come from `wt\T364-shots\measure.mjs` and `walk_trip.mjs` (visible buttons, links, selects and inputs with a box under 31.5 px; checkboxes measured through their label). The hex check is a grep for six-digit hex in the six files after the edit.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The left Lifestyle panel looked greyed under the new scrim | Its z-index was 15, under the scrim's 40 | `.accom-panel.lifestyle-panel { z-index: 41 }` in `46-owner-calls.css` |
| `npm run lint` showed two errors in `CyclePage.jsx` | The local `token()` was removed but the import was not added | Added the import |
| The shared-trip failure seam did not fail in dev | React StrictMode runs the effect twice, so a one-shot failure was swallowed | The seam fails the first two calls |
| `FilterControls.jsx` showed a whole-file diff | CRLF in the index; my first edit wrote LF | Restored CRLF |
| `verify_keyboard.mjs` reports 16 of 20 | Journey and destination pages report STUCK; identical on the untouched base (rebuilt and re-run with my changes stashed) | Not caused by this task; raised as T364-d |

## What is still open

T364-a: the Stay step removal needs the owner's answer, because the step is reachable (user). T364-b: tokens for the three tier colours, and migrating the 17 print and PDF hex lines out of the baseline (next task). T364-c: the dead `.dual-range` CSS and the checks in `verify_filter_sheet.mjs` that name it (next task). T364-d: `verify_keyboard.mjs` 16 of 20 on the base (next task). Also for T363: `--accent` and `--ink-mute` are not in the mirror on purpose, so changing them needs no mirror edit, but the other mirrored values do, and the lint will say so. Harness results: beaches, lakes, mountains, trail_page, explore all pass; places_tab fails one check, the same one as on master (37 of 38).

## Rollback procedure

Both repos are on branch `p10-owner-ui-calls`. Before a merge, delete the branch in each. After the merge, `git revert -m 1 <merge commit>` in each repo, app first. No migration, data or production state was touched. The filter-bar and scrim rules are all in `46-owner-calls.css`; removing its import from `styles.css` undoes the visual calls on their own.
