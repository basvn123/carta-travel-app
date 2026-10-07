# T209 The landing page

## Task ID

T209 (mind-map M09). Wave 16b, session 9, first of two tasks; T194 follows in the same worktrees and makes this page the app's home.

## Date

2026-10-07

## What changed

Carta has a landing page, and by the owner's decision of 2026-10-07 (T362, `Execution/_OWNER-RUNBOOK.md` block A2) it is also the home page. It lives in the app at `?tab=home` as a pseudo-tab, rendered by `src/browse/LandingPage.jsx` with its arithmetic in `src/lib/landing.js` and its styles in `src/styles/39-landing.css`. Nothing makes it the default screen yet; that is T194's job.

The page demonstrates rather than describes. The h1 is the positioning claim from PRODUCT.md and T201 in the shortened form the approved onboarding document uses: "What a day costs, per person, in 3,868 places", with the count read from `meta.n_destinations` at run time, never typed. Under it sits the onboarding document's sentence for hikers: "Pick a town to walk from. Carta says what the bed and the day cost there, and where each figure came from." Beside it on desktop, and under it on a phone, is a working receipt for a real town: three town buttons ("Price a stay in" Edinburgh, Chamonix, Porto), an input strip (people, nights, stay), and the receipt itself, which reprices in place on every change. The total is above the fold at 380 px and at 1280 px, in English and in German.

The three towns were chosen for what their receipts show, because the provenance rows are the point. Edinburgh has its bed measured from 3,768 Inside Airbnb listings in Edinburgh and its food from the national basket, so one receipt shows a measured line and an estimate side by side, and the total wears a tilde because it holds an estimate. Chamonix is all national figures, so every line carries its tilde, and picking a dorm bed shows the fallback sentence. Porto has bed, food, dorm beds and private rooms all measured in the city, so its receipt has no estimate at all. All three are places people walk from, which keeps the hikers-first order of T203. If a later catalogue drops one, it is skipped; if all three go, the measured town with the most listings stands in, so the demonstration is never empty.

The receipt is T099's first-run receipt. T099 merged into app master while this task was running (a26ed6e), and on the coordinator's instruction this branch merged master and moved its arithmetic onto `src/lib/firstRun.js`: `landing.js` calls `priceReceipt` and `receiptFooter` there, and the page uses the `receipt.*`, `cost.stayMeasuredN`, `cost.stayNational`, `cost.foodMeasured` and `prov.*` keys T099 and earlier tasks put in the six catalogues. A test asserts that the landing receipt equals the first-run receipt line for line, so the landing page and the first result on a destination page cannot disagree by a cent. What the landing page keeps of its own is small. The dates are Carta's (the first Saturday at least four weeks out, the onboarding document's rule) and are not an input here, so the footer names a cheaper or dearer stay the town actually measures, the first-run footer's own choice, or, where the town measures no other bed, a shorter or longer stay; it never says "Set your dates", because this page has no dates control. The markup is the landing page's own because `FirstRunReceipt` carries its own primary button and the flight door, and a second primary would break the one-primary rule; that duplication is register row T209-a.

The primary action is "Find a town to walk from". It opens Destinations on its walks through a new one-shot hand-off, `openCategory`, built the way the existing `openCountry` hand-off is. A secondary button under the receipt opens the demo town's own destination page.

Under the hero sit the three proof points and the coverage. The proof points are three short paragraphs under hairlines, not a row of counters: the figure names its source, it marks what is estimated, and it is the same on every screen. The coverage section says in sentences what the catalogue measures and what it does not, then gives one table for the five layers around the towns, with a key that explains published and listed, and a link to `/about/numbers` (T318). It ends with the plain trade statement from PRODUCT.md: no booking, no commission, the ground priced and the traveller handed to the operator. Every coverage figure is counted at run time from the records in hand and from `public/coverage.json`, with the same definitions `scripts/explainer/numbers.mjs` uses, so this page and `/about/numbers` cannot disagree.

The figures on the page as rendered on 2026-10-07, and the file each comes from:

| Figure on the page | Value | Source |
|---|---|---|
| Places | 3,868 | `continent-app/public/boot.json` and `public/app_data.json`, `meta.n_destinations` |
| Countries | 43 | distinct `iso2` over `public/app_data.json` `destinations` |
| Places whose bed price is measured from listings | 1,000 | `accommodation.level == 'city'` in `public/app_data.json` |
| Places using their country's bed figure | 2,868 | the remainder, 3,868 less 1,000 |
| Places with their own food prices | 381 | `costs.level == 'city'` in `public/app_data.json` |
| Regions counted | 2,077 | `public/coverage.json` `regions`, generated 2026-09-04 |
| Walks: published, listed, regions with none | 17,554; 51; 684 of 2,077 | `public/coverage.json`, `trail` r, l, status empty, status not na |
| Cycle routes | 476; 16,440; 849 of 2,077 | same, `cycling` |
| Beaches | 815; 3,517; 763 of 1,377 | same, `beach` |
| Lakes | 1,662; 1,080; 8 of 1,436 | same, `lake` |
| Summits | 753; 1,321; 273 of 794 | same, `mountain` |
| Edinburgh listings | 3,768, captured June 2026 | `EDI.accommodation.n_listings`, `captured` in `public/app_data.json` |
| Default receipt, Edinburgh, 2 people, 7 nights from 7 Nov 2026, entire place | about €2,556.58, €1,278.29 each | computed in the browser by `firstRun.priceReceipt` from the files above and the app's default lifestyle |

## Files touched

App repository (`continent-app/`, branch `p12-landing-page`):

**Modified:**
- src/App.jsx (import; `tab=home` now opens the landing page instead of mapping to Destinations; the landing page does not force the full catalogue; the `pendingCategory` hand-off; the render block)
- src/browse/DestinationsTab.jsx (the `openCategory` and `onOpenCategoryConsumed` props and their effect)
- src/styles.css (one `@import` of 39-landing.css, last in the list)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (36 `landing.*` keys each, inserted after `common.gotIt`; additions only)

**Created:**
- src/browse/LandingPage.jsx
- src/lib/landing.js
- src/styles/39-landing.css
- tests/landing.test.mjs

Root repository (branch `p12-landing-page`):

**Created:**
- Execution/P12/T209-landing-page.md

**Modified:**
- Execution/_OPEN.md (rows T209-a to T209-e)

Helper scripts, the Vite config, logs and screenshots are outside both repositories, in `C:\Users\Gebruiker\Documents\Portfolio\wt\T209-shots\`.

## Commands run

All in the app worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T209-app` unless noted, with `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` unset in every shell.

```
npm run build > ../T209-shots/build-before.log      # baseline at f05e901, then rm -rf dist dist-data
python ../T209-shots/i18n_insert.py                 # the landing.* keys, BOM and CRLF kept
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
node --test tests/landing.test.mjs
node node_modules/vite/bin/vite.js --config ../T209-shots/vite.config.mjs   # port 5209, own cacheDir
node ../T209-shots/shots.mjs                        # the browser check and screenshots
git commit                                          # bf8c9fe
git merge master                                    # T099 and wave 16b, styles.css import conflict resolved; d64909f
git commit                                          # 55f6408, arithmetic onto firstRun.js
npm run lint; npm test; node scripts/ci/design-lint.mjs
git checkout --detach master; npm run build > ../T209-shots/build-master.log; rm -rf dist dist-data; git checkout p12-landing-page
npm run build > ../T209-shots/build-after.log; rm -rf dist dist-data
```

In the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T209`: `git merge main` (a fast-forward to b30225de8), then this report and the register rows in one commit.

## Config and secrets set

None. No migration, no data write, no secret, nothing deployed.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Screens that show an itemised priced total with no tap and no input | 0 | 1 (`?tab=home`) | +1 |
| Receipt total on screen without scrolling, 380 x 800, English | no such page | yes, bottom at 660 px of 714 px visible above the bottom bar | |
| Same, 380 x 800, German | no such page | yes, 695 px of 714 px | |
| Same, 1280 x 800, English and German | no such page | yes, 527 px and 545 px of 800 px | |
| Coverage figures on the page typed by hand | n/a | 0 (all counted at run time) | |
| Primary buttons on the page | n/a | 1 | |
| Main JS chunk, gzip (master a26ed6e against this branch) | 328.43 kB | 332.16 kB | +3.73 kB |
| Main CSS, gzip (same) | 114.02 kB | 114.97 kB | +0.95 kB |
| New i18n keys per catalogue | 0 | 36 | +36 |
| App test suite | 258 pass | 268 pass | +10 tests, 0 failures |
| design-lint new violations | 0 | 0 | 0 |

The like-for-like size baseline is a build of app master at a26ed6e, made in this worktree after the merge; the earlier baseline at f05e901 (315.05 kB JS and 111.82 kB CSS gzip) predates seven merged tasks and is not comparable. The page is mounted in the main chunk on purpose, because T194 makes it the first screen; lazy-loading it would add a round trip to the first paint.

The browser check (`T209-shots/shots.mjs`, against the dev server on 5209) passed every assertion at both widths: one h1, one primary, no page errors, no horizontal scroll before or after changing inputs, the five coverage rows, people and nights repricing the total, Porto with no tilde and its measured sentences, Chamonix with the dorm fallback sentence and both national rows, keyboard focus moving between the town buttons, and the primary opening Destinations with Trails pressed. Screenshots are in `C:\Users\Gebruiker\Documents\Portfolio\wt\T209-shots\`: `m380-*` and `d1280-*`, each with `top`, `porto`, `chamonix`, `proof`, `coverage`, `after-cta` and `full`, plus `m380-de-top` and `d1280-de-top`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The receipt total fell below the fold on a 380 px phone (880 px against 714 visible) | A two-row input strip, the orientation sentence above the card and generous paddings | One row of three fields at every width with the people and nights selects showing bare numbers (the labels already say what they count), the orientation sentence moved under the card, shorter month names in the header, tighter receipt paddings |
| The German selects truncated ("2 Person", "Ganze Unterku") | Equal columns too narrow for the longer words | Columns of 0.8, 0.8 and 2 fractions, so the stay word has the room |
| The first fold check measured against the window, not the space above the bottom bar | `offsetParent` is null for a fixed element, so the bar looked hidden | The harness reads the bar's computed display instead |
| `styles.css` conflicted when merging master | Wave 16b added imports 31 to 38 at the same place | Kept all of master's imports, 39-landing.css after them |
| A parallel receipt implementation in `landing.js` | Built before T099 was merged | Replaced by calls into `firstRun.js`, with a line-for-line equality test; 17 duplicate `landing.*` keys removed from all six catalogues |

## What is still open

The receipt is drawn twice. The arithmetic and the words are now shared with T099, but the markup is not: `FirstRunReceipt` owns its own primary ("Set your dates") and the flight door, so it could not sit on a page whose one primary is "Find a town to walk from". The fix is a presentational receipt (header, lines, sum, footer) that both components render, with the strip, the door and the primary left to each caller. T209-a.

The page is reachable only at `?tab=home`. T194 makes it the app's home: which visits open on it (every first visit, or every visit without a link), what the brand mark and the nav do, and the old "EVERY visit opens on Destinations" comment in `App.jsx` that will then be wrong. T194 is the next session in these worktrees and claims this row. T209-b.

The page is client-rendered. A crawler, the share preview and the static prerender (T221) see none of it, and the site's front door is the one URL that most needs to be indexable. `/about/numbers` shows the pattern: a static page built at build time from the same files. A static or prerendered hero and coverage section is a separate task. T209-c.

"Measured" is more generous in the data than in a reader's head. Of the 1,000 places with `accommodation.level == 'city'`, only 35 have a `source_place` equal to their own name in `public/app_data.json`; the rest borrow the listings of a nearby city, for example Cromford, Bakewell and Hathersage priced from 4,119 Manchester listings. The page's sentence says the receipt "names the place they were measured in", which is true, and the destination receipt prints that place, but the count of 1,000 is a count of measured figures, not of towns measured in themselves. Whether borrowed listings should keep the `city` level, and how far a borrowed measurement may travel, is a data and wording decision for the owner. T209-d.

The three demo towns (Edinburgh, Chamonix, Porto), the default (Edinburgh, entire place, two people, seven nights) and the order are this task's product call, made for what each receipt shows. The owner may prefer a cheaper or a better-known default; the list is one constant, `DEMO_TOWNS` in `src/lib/landing.js`. No stranger has been shown the page yet; the first-run test protocol in `docs/FIRST_RUN_RESULT.md` (row T187-b) applies to it unchanged. T209-e.

App master moved again after the merge (T100 at 94cf43a); a dry-run merge of this branch with it is clean, and T100 touches none of this task's files.

## The seven carta-design questions

1. No hex value anywhere in the diff; every colour in 39-landing.css is a token. design-lint reports 0 new violations.
2. No gradient, no new colour, no second saturated hue. `--accent` appears on the one primary button, the focus rings and the `--accent-bg` receipt footer, nothing else.
3. No ochre, teal or `--danger` on the page, because nothing on it is a rating, a gem or a deletion.
4. Mono carries only measured facts: the receipt figures, the header's dates and counts, the per-day multiplication, the per-person line and the table's counts. Every sentence, label and heading is `--ui`; the h1, the section headings and the town name are `--display` at display sizes.
5. One primary, "Find a town to walk from". The town buttons are toggles (`--ink-fill` when pressed), "Open Edinburgh" is a secondary, and the inputs are fields.
6. Every headline has a number or a verb: "What a day costs, per person, in 3,868 places", "Three reasons to trust a figure", "What Carta covers, and where it is thin", and the three proof headings ("It names its source", "It marks what is estimated", "It stays the same on every screen"). No em dash, en dash or middot in any string, file or this report; none of the banned words.
7. Removed: the words inside the people and nights selects ("2 people", "7 nights"), which repeated the field labels; taking them out is also what brought the receipt total above the fold on a phone. Earlier, the orientation sentence left its place above the card for the same reason.

## Rollback procedure

App repository: `git revert 55f6408 bf8c9fe` on the merged branch (the merge commit d64909f only brings master in and needs no revert), or, before the branch is merged, delete branch `p12-landing-page`. That removes the page, the hand-off and the 36 keys per catalogue, and puts `tab=home` back to opening Destinations. Root repository: revert the single report commit, which removes this file and rows T209-a to T209-e. No data, schema or deploy to undo.
