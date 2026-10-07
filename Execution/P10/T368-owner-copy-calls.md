# Execution Report: T368

## Task ID

T368: the owner's receipt and copy calls (register rows T362-c and T362-f)

## Date

2026-10-07

## What changed

Five calls are built. First, the accuracy figure (88% within EUR 6 a day, from `src/lib/accuracy.js`) is now an answer in the account FAQ, "How accurate are the prices?", in the second group; it stays off the Explore card. Second, the compact receipt in the Explore card preview marks each figure "City" or "Country" (with a hover title that says what that means). Third, the Explore preview shows "About 3 h 23 min by train or bus from where you start" when the traveller's origin has a reach table and the place is in it; the card itself is unchanged. Fourth, My trips shows the install hint: one line, one secondary "Add to home screen" button and a dismiss cross, only on a phone browser that is not the installed app, only after a trip, plan or day plan is saved, and never again once dismissed. On Chromium it calls the browser's install prompt (the event is captured when the app loads, because it fires early); on iOS Safari, which has no prompt, the button swaps the line for "Tap Share, then Add to Home Screen". Fifth, row T362-f: the prerender page builders for destinations, trips and journeys take `ctx.lang`; for any language but English the Wikivoyage intro, the composer hook, the journey hook, summary and day titles are left out and the page opens with sentences derived from the structured fields through the six catalogues (`scripts/prerender/derived.mjs`, eight new `prerender.*` keys). English output is unchanged.

The fifth call is the rule, not the full wave. The build still writes English only and the page chrome (headings, fact labels, country names) is English, so no non-English page exists yet; that is T222-b and T225 and is raised as T368-a.

Carta-design questions: (1) one primary per screen: the install hint is a secondary button and the FAQ and receipt add none; (2) tokens only, no new token, no hex; (3) fonts untouched, no uppercase mono eyebrow (the marker is 10.5 px sentence-case ui text); (4) 6 px control radius through Button, 10 px on the hint card; (5) copy: every string is in six catalogues, verb first on the button, no dash or middot; (6) targets: the hint's buttons are 44 px on touch; (7) states: hint hidden when installed, dismissed, or no install path; marker only where a level exists; reach row only where a table exists.

## Files touched

App repo (`continent-app`, branch `p10-owner-copy-calls`, on top of `p10-owner-ui-calls`):

**Modified:** `src/auth/AccountPanel.jsx`, `src/auth/SavedTripsPanel.jsx`, `src/browse/ExploreTab.jsx`, `src/components/CostSummary.jsx`, `src/styles/46-owner-calls.css`, `src/i18n/{en,de,es,fr,it,nl}.js` (new keys: `account.faq15Q`, `account.faq15A`, `cost.levelCity`, `cost.levelCountry`, `cost.levelCityTitle`, `cost.levelCountryTitle`, `explore.reachFrom`, `install.hint`, `install.add`, `install.ios`, `install.dismiss`, and eight `prerender.*`), `scripts/prerender/pages.mjs`, `scripts/verify_account_panel.mjs` (FAQ count 13 to 14, accuracy answer check).

**Created:** `src/auth/InstallHint.jsx`, `scripts/prerender/derived.mjs`, `tests/prerenderDerived.test.mjs`.

Root repo: `Execution/_OPEN.md`, `Execution/P10/T368-owner-copy-calls.md`.

## Commands run

Dev server on 5217 (config outside the repo, own cache directory); Playwright scripts in `wt\T364-shots\` (outside the repo); `node scripts/prerender/build.mjs --data public --out <outside> --only dest,trip,journey --sample 5` before and after the page edit, then `diff -r` of the two output trees; `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, the six-language i18n parse, `npm run build`; harnesses `verify_explore.mjs`, `verify_places_tab.mjs`, `verify_saved.mjs`. The server was stopped and `dist/` deleted afterwards. The Supabase variables were unset; nothing contacted a live project.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| FAQ questions in the account panel | 13 | 14 | +1 |
| Explore card receipt rows carrying a provenance marker (preview, Rome) | 0 of 2 | 2 of 2 | +2 |
| English prerendered pages that differ from before (15 sampled pages: 5 destinations, 5 trips, 5 journeys) | n/a | 0 (the HTML trees are identical; only `generated_at` in the two manifest files differs) | 0 |
| Unit tests | 316 | 325 | +9 (`tests/prerenderDerived.test.mjs`) |

The sample is the first five pages of each kind the builder wrote, not the whole catalogue.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A first `add` of an i18n key failed to find its anchor | The Explore keys use single quotes in a different block of each catalogue | The helper (outside the repo) now matches either quote style |
| `verify_account_panel.mjs` fails at its first check | Fails the same way on the base without T368 (checked by stashing and checking out the commit before T364) | Not fixed; raised as T368-c |
| `verify_saved.mjs` reports one failure (selected tab colour) | Same on the base; the tab is ink fill, the check wants accent | Not fixed; raised as T368-c |

## What is still open

T368-a: no `--lang` in `build.mjs` and the page chrome is English, so no non-English page is written yet (next task, with T222-b and T225). T368-b: the Chromium install path needs a real Android phone (user). T368-c: two pre-existing harness failures, and the account harness's new FAQ check has not run past its first step (next task). The Chromium `beforeinstallprompt` path and the iOS text were not both exercised: only iOS Safari was emulated.

## Rollback procedure

Branch `p10-owner-copy-calls` in both repos sits on `p10-owner-ui-calls`. Before a merge, delete the branch in each. After the merge, `git revert -m 1 <merge commit>` in each repo, app first. The English build is unchanged by this work, so no deployed page needs regenerating. No migration, data or production state was touched.
