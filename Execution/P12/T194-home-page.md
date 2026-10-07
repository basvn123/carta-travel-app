# T194 The home page

## Task ID

T194 (mind-map T347). Wave 16b, session 9, second of two tasks. It builds on T209, which made the landing page. The owner decision of 2026-10-07 (T362, `Execution/_OWNER-RUNBOOK.md` block A, row "T194, T209") says the home page and the landing page are one page.

## Date

2026-10-07

## What changed

The page T209 built is now the home page of the app. A first visit with no link opens on it, and everything else opens where it always did.

A visit counts as a first visit when the address has no query string and no hash, and this browser has no `continent.homeSeen.v1` mark in localStorage. That logic is `src/lib/homeVisit.js`. A link always wins: `?tab=trip`, `#dest=LIS` and every other shared view open on what they name. A return visit opens on Destinations, as before. The mark is written by an effect on every load, so the home page opens once per browser, and reloading after leaving it does not bring it back. If storage throws (private window, blocked site data) the visit is treated as a return visit, which is the old behaviour and never a loop.

One trap cost time and is worth knowing. The first version read the flag inside a component `useState` initializer. React StrictMode runs initializers twice in development, and the dossier reader strips the `#dest=` hash between the two passes, so a hash link read as a first visit on the second pass and opened the home page under the destination page. The flag is now read once at module load (`FIRST_VISIT` in `App.jsx`), before any reader touches the hash.

`activeTab` starts as `urlTab || (firstVisit ? 'home' : 'places')`, and the visited-tab set follows the same rule. The comment that said every visit opens on Destinations is rewritten to say what is true now. The harness `scripts/verify_tab_switching.mjs` seeds the new mark so it still starts on Destinations.

No user-facing string was added, so the six catalogues are untouched, and all six still parse.

## The four decisions

1. Which visits open on home. First visits only, with no link. Sources: T362 says T194 "makes the app's home that same page", which settles that it opens but not for whom. `docs/ONBOARDING_AND_EMPTY_STATES.md` Part 1 designs the first ninety seconds and says nothing about return visits, so the least change is that return visits keep opening on Destinations. Register row T194-a asks the owner to confirm.
2. The "EVERY visit opens on Destinations" comment in `App.jsx`. Rewritten, since it was no longer true. The localStorage mirror's remembered tab is still ignored.
3. The brand mark. Unchanged, it still calls `goToTab('places')`. The written decisions and the document do not say what it does, so the least change keeps it. Row T194-a.
4. A nav entry for home. None. `AppHeader` and `BottomNav` show no active tab on home, as T209 left them. The approved document adds no tab and the five-slot bar is a locked layout. Row T194-a. The consequence is that after leaving the home page a visitor can come back to it only by its address (`?tab=home`).

One conflict is worth stating. The onboarding document says "the app still opens on the Destinations tab" with the h1 above its first band, and the owner's decision says one page. Taking the owner's decision, the h1 and the receipt live on the home page that a first visit opens on, and Destinations opens on walks as T209 arranged. The document needs reconciling (row T194-d).

## Files touched

App repository (`continent-app/`, branch `p10-home-page`, commit be4311d): `src/App.jsx`, `scripts/verify_tab_switching.mjs` (one seed line), and new `src/lib/homeVisit.js` and `tests/homeVisit.test.mjs`.

Root repository (branch `p10-home-page`): `Execution/P12/T194-home-page.md` and `Execution/_OPEN.md` (rows T194-a to T194-d, and T209-b marked closed by T194).

Helper scripts, the Vite log and screenshots are outside both repositories, in `C:\Users\Gebruiker\Documents\Portfolio\wt\T194-shots\`.

## Commands run

In the app worktree, with `CARTA_SUPABASE_URL` and `CARTA_SUPABASE_SERVICE_KEY` unset: `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, the six-catalogue parse loop, `npm run build` (then `dist` and `dist-data` deleted), the Vite server on 5209 with the config in `T209-shots` (stopped afterwards), `node ../T194-shots/visit.mjs`, and `node scripts/verify_tab_switching.mjs http://127.0.0.1:5209/`.

## Config and secrets set

None. No migration, no data write, nothing deployed.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| What a first visit with no link opens on | Destinations | the home page, live receipt visible at 380 and 1280 px |
| What a return visit opens on | Destinations | Destinations |
| App tests | 268 pass (T209 report) | 273 pass, 0 fail (4 are new here, the rest came with merged tasks) |
| Main JS, gzip | 332.16 kB (T209 report) | 332.56 kB (`T194-shots/build.log`) |
| Main CSS, gzip | 114.97 kB | 114.97 kB |
| design-lint | 0 new | 0 new (196 in the baseline) |
| lint | 0 errors | 0 errors, 71 warnings |

The browser check (`visit.mjs`, 380 and 1280 px) passed. A first visit shows the home page with no horizontal scroll. The brand mark then opens Destinations. The next visit in the same browser opens Destinations. `#dest=LIS` opens the Lisbon page and no home page, `?tab=trip` opens the planner, `?tab=home` opens the home page, and there were no page errors. Two lines in that script print FAIL, "deep-dest selector". They come from my own selector (`text=Lisbon` matched a hidden node), not from the app, and the screenshots `m380-deep-dest.png` and `d1280-deep-dest.png` show the Lisbon page. Screenshots are `m380-` and `d1280-` with `first-visit`, `brand`, `return-visit`, `deep-dest`, `deep-trip` and `deep-home`.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A hash link opened the home page | The flag was read in a StrictMode-doubled initializer, after the hash reader had stripped the hash | Read once at module load |
| `verify_tab_switching.mjs` reports 4 failed checks of 69 | Not this task. The same 4 fail with `App.jsx` reverted: header search field portalled in on first paint, one search field in the header, scroll survives the hop, search field comes back once | Left alone, raised as T194-c |

## What is still open

All four rows are in `Execution/_OPEN.md`. T194-a asks the owner to confirm first-visit-only, the brand mark and the nav. T194-b: 53 other harnesses seed `mapGuideDismissed` and will open on the home page on a first visit until they also seed `homeSeen`. T194-c: the four pre-existing tab-switching failures. T194-d: the onboarding document. T209-b is closed by this task. T209-a, c, d and e stay open.

## The seven carta-design questions

1. No colour, token or hex added, and no CSS touched.
2. No gradient or new hue. Nothing visual changed on the page.
3. No ochre, teal or danger used.
4. No type change. Every figure is still mono as T209 left it.
5. The page keeps its one primary, "Find a town to walk from". This task adds no control.
6. No string added, so no headline or copy to check. No em dash, en dash or middot in the code, the tests or this report.
7. Removed: the old rule that every visit opens on Destinations, as a comment and as behaviour for first visits.

## Rollback procedure

App repository: `git revert be4311d` on the merged branch, or delete branch `p10-home-page` before merge. First visits then open on Destinations again and `?tab=home` still works. Root repository: revert the single report commit. A browser keeps its `continent.homeSeen.v1` mark, which is harmless.
