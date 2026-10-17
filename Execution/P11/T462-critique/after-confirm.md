# T462 critique: confirming round after the fix batch

Method: one confirming reviewer, after `after-a.md` (design review, 28/40) and `after-b.md` (technical audit, 16/20), per `impeccable/reference/critique.md` and `audit.md`, against PRODUCT.md, DESIGN.md ("Home page exception (T462)") and the carta-design skill. No project file was edited. Persuade mode; all ten heuristics scored (none n/a), so the maximum is 40.

Evidence:
- Final shots in `Execution/P11/T462-shots/after/` (full pages and folds at 360, 390, 768, 1024 and 1440 en, de 360 and 1440, scenes 1 to 4 at 1440 and 390, `probe.json`).
- A live Playwright probe of http://localhost:5202/ with fresh storage: 360, 390, 768 (touch), 1024, 1280, 1440, de 360, de 1024; the accessibility tree of `.home-page`; a 30 stop keyboard walk at 1440; an 11 second opacity timeline of the four scenes sampled every 40 ms; Pause and Play under a still pointer; the hiking chip by click and by its `href` in a new tab; reduced motion at 390. Scripts and output in the session scratchpad, `critique-confirm/` (`probe.mjs`, `probe.json`, `share360.mjs`, `share-360-en.png`, `share-360-de.png`, `trip-360-de.png`, `hiking-1440.png`, `hiking-newtab.png`).
- `impeccable detect --json` on `HomePage.jsx`, `HomeDemo.jsx`, `useDemoClock.js`, `homeDemo.js`, `61-v6-home.css`: `[]`, exit 0.
- `node --test tests/home.test.mjs`: 15 of 15 pass.
- 0 console errors and 0 page errors in every run.

## Measured

| Measure | after-a / after-b | Now |
|---|---|---|
| Scroll height at 390 | 3,265 px | 2,408 px |
| Scroll height at 360 | 3,322 px | 2,510 px |
| Scroll height at 1440 | 1,966 px | 1,649 px |
| `h1` lines at 1024, en | 3 | 2 |
| `h1` lines at 360, de | 3 | 3 |
| Primary above the nav, 360 en / de | yes / yes | yes (378 vs 654) / yes (412 vs 654) |
| Wrong accessible names | 8 | 0 |
| Chips whose `href` carries the question | 0 of 3 | 3 of 3 (`?tab=map&xe=hiking&xa=alps&xm=7`, a new tab lands on Explore with the question) |
| Kind tiles whose `href` carries the kind | 0 of 6 | 0 of 6 |
| Samples with two scenes visible at once (11 s, 40 ms steps) | ghosting seen | 0 of about 200 |
| Play under a still pointer resumes | no | yes (`data-turning=true`, next scene within 6 s; hovering again after leaving pauses it again) |
| Share scene right edge vs demo right edge, 360 en | 365 vs 344 | 365 vs 344 (still cut by 21 px; de 23 px) |
| Stage vs scene heights, 390 | stage 505; search 310, share 218 | stage 430; search 342, place 337, trip 430, share 250 |
| Stage vs scene heights, 1024 | not measured | stage 492; search 358, place 390, trip 492, share 266 |
| Stage vs scene heights, 1440 | stage 494; search 310, share 218 | stage 358; search 358, place 206, trip 302, share 266 |
| Figures in the demo carrying "est." | 9 of 9 | 9 of 9 (Lake Bled ~€77, Lake Bohinj ~€60, Zell am See ~€87; Ljubljana ~€126.52, Bled ~€232.14, Bohinj ~€119.52, total ~€478.18, sum exact) |

## Nielsen heuristics

| # | Heuristic | Before fix batch | Now | Key issue |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | 3 | The progress line now runs along the panel foot, away from the tab underline, so only one brown mark says "selected". Prices still show without their inputs (owner rule: no settings caption). The foot door changes about 340 ms before its scene appears (new, P3). |
| 2 | Match between system and real world | 3 | 3 | Method note gone, de "Zum Beispiel" reads naturally, the hiker's question comes first. Leaks left: the f2 door is a town name ("Lake Bled") under "See what a day really costs"; "Lake Bled" stays English in German (data). |
| 3 | User control and freedom | 3 | 4 | Pause first, Play now resumes under a still pointer, a pick stops rotation, every scene has one real door under it reachable by keyboard and screen reader. |
| 4 | Consistency and standards | 3 | 3 | Card inside a card gone. Left: `--radius-sheet` on a resting panel, f4 and the Share door are `<button>` "My trips" beside `<a href>` doors, the 1180 px column starts at x 139 at 1440 while the header starts at x 32, "Pick what the trip is for" vs Destinations' heading. |
| 5 | Error prevention | 3 | 3 | Fallback story, still block while loading, solo hero; stale Explore open request now cleared when Explore goes inactive (`ExploreTab.jsx`). |
| 6 | Recognition rather than recall | 3 | 3 | Doors are labelled and visible; the day planner and export remain words only (owner rule: no invented Day scene). |
| 7 | Flexibility and efficiency | 3 | 3 | The hiker has a first question that returns Alpine walking bases today; question links survive a new tab. Kind tiles still lose the kind on a modifier click or a copied link. |
| 8 | Aesthetic and minimalist design | 2 | 3 | Proof column gone, features two by two on desktop, passes compact on phones (81, 126, 105 px), kinds as a rail, no ghosting, phone page 26 percent shorter. Still: three of four scenes leave a blank band at the stage foot at every width, and the Share scene is cut at 360. |
| 9 | Error recovery | 3 | 3 | Unchanged: photo fallback, story fallback, nothing fails loudly. |
| 10 | Help and documentation | 2 | 2 | Unchanged: no FAQ path, "Plan it with friends" never explained. |
| **Total** | | **28/40** | **30/40** | **Good.** Both heuristics 7 and 10 scored, maximum 40. |

### Cognitive load

Single focus still fails on desktop (the moving demo beside the primary) and minimal choices is borderline: the first viewport at 1440 holds 11 targets (search, three chips, primary, pause, four tabs, the demo door), and the demo door repeats chip 2 word for word with the same `href`. Chunking, grouping, hierarchy, working memory and progressive disclosure pass. 2 of 8 failed: moderate, unchanged.

### Emotional journey

The first frame a phone visitor sees is now full: the field and three priced lakes, Lake Bled at ~€77 under the "€80 a day" chip beside it, so the price no longer argues against the promise. The peak is the place scene's photo of Bled. The valleys left are the half empty Share scene, the thin end of the page (passes, then a closed "Photo credits"), and on a 360 phone a Share scene whose trip name, "Link copied" and "Trip Pass" are cut at the right edge.

## Audit

| # | Dimension | after-b | Now | Key finding |
|---|---|---|---|---|
| 1 | Accessibility | 3 | 3 | Fixed: 0 wrong names (icons wrapped `aria-hidden`), Play resumes. Left: focus goes Pause at x 1238 then the Search tab at x 653; the tablist and the region share one name ("How Carta plans a trip"); every slide reads the same summary sentence; the demo door duplicates chip 2 (same name, same `href`). |
| 2 | Performance | 4 | 4 | Transform and opacity only, frozen off screen, 0 running animations under reduced motion; guided data now prefetched on idle (`requestIdleCallback`, 4 s timeout) and cancelled on unmount. |
| 3 | Responsive | 3 | 3 | Phone page 2,408 px at 390, no sideways scroll anywhere, `h1` two lines at 1024. Left: the Share scene still overflows the demo at 360 (en 21 px, de 23 px); stage foot bands (below); de `h1` three lines at 360. |
| 4 | Theming | 3 | 3 | Tokens throughout; literals left (1180 px, 2 px rules, 6 px dot, 8 px rise, 2 px icon nudge, letter-spacing), `--radius-sheet` on a resting panel, `linear` on the progress fill, `home-pick` and `home-press` animate colour at `--dur-2`/`--dur-3` where DESIGN.md says `--dur-1`. |
| 5 | Implementation integrity | 3 | 3 | Question `href`s now say what the click does, every scene has a real door, the story is chosen to sit under the hero's own budget. Left: kind tile `href`s drop the kind, one fix reported as done did not land (Share at 360), every demo figure is still a national estimate. |
| **Total** | | **16/20** | **16/20** | **Good.** The fixes closed real defects in four dimensions, but each still carries the issue named above, so no dimension moves to 4. |

Implementation integrity verdict: pass. Detector clean at source, tests green, the demo is the app's own parts fed by `buildDemo()` over the shipped catalogue.

## Earlier findings: fixed

| Finding | Source | Evidence now |
|---|---|---|
| Stage empty above the first frame (top band) | A1, B P2 | `.home-scene { align-content: start }`; phone first frame 342 of 430 px, content from the top |
| Page longer than the one it replaced | A2 | 390: 3,265 to 2,408 px; proof column deleted; passes 81 to 126 px each on a phone; target of 2,400 missed by 8 px |
| First price the dearest town | A3 (part) | Opened place Lake Bled ~€77, under the €80 chip |
| Two brown lines under the tabs | A4 | Progress at `.home-demo-progress`, panel foot |
| Crossfade ghosting | A5, B P3 | 0 overlapping samples; old out over `--dur-2`, new in after it |
| Demo is a dead end | A6, B P2 | `.home-demo-foot` door per scene, outside the `aria-hidden` block |
| No question for the hiker | A7 | "Hiking in the Alps in July" first; opens Explore on "Hiking base, Alps, July" with results (Berchtesgaden, Tre Cime di Lavaredo, Ortisei and more) |
| Method note `home.lineNote` | A12 | Key and element gone |
| Card inside a card in the place scene | A13 (part) | Place drawn flat on the demo surface |
| Ken Burns zoom `home-settle` | A14 (part) | Gone |
| "€0.00" for Free | A16, B P3 | "€0" |
| de "Probier" | A18 (part) | "Zum Beispiel" |
| Decorative icons in names | B P1 | 0 wrong names in the tree |
| Play under a still pointer | B P2 | `hoverHold` until the pointer leaves; measured |
| Chip `href` drops the question | B P2 (part) | `exploreHref(facets)`; new tab lands on the question |
| `h1` three lines at 1024 | B P2 (part) | 1fr / 1fr from 1024, 5fr / 7fr from 1280; two lines |
| Stale Explore open request | B P3 | Cleared when `isActive` turns false |
| Guided data only on hover | B | Idle prefetch |

## Earlier findings: still open

| Pri | Finding | Element | Fix |
|---|---|---|---|
| P1 | **Share scene still cut at 360 (reported as fixed, it is not).** Measured `.home-share`, `.home-share-link`, `.home-share-rows` right edge 365 against the demo's 344 in en (367 in de): the trip name reads "Ljubljana, Lake Bled and Lake Bohi", "Link copied" and "Trip Pass" are cut (`share-360-en.png`). Root cause: `.home-share` is a grid item with `min-width: auto` and its own implicit `auto` column, so its minimum is the min-content of `.home-share-link`: the nowrap URL plus the Copy button, 332 px in a 296 px column. `minmax(0, 1fr)` on `.home-scene` and `.home-sc` does not reach it. | `61-v6-home.css:415` `.home-share`, `:423` `.home-share-link` | `.home-share { grid-template-columns: minmax(0, 1fr); min-width: 0; }` and `.home-share-link, .home-share-row { min-width: 0; }`. Recheck at 360 en and de that the share scene's right edge is at most the demo's. |
| P2 | **Blank band at the stage foot.** Scenes now top align, so the empty space moved from the top to the bottom, but the stage is still the tallest scene's height: 1440 place 206 of 358 (42 percent empty), share 266 of 358; 390 share 250 of 430 (42 percent), place 337; 768 place 219 of 342; 1024 search 358 of 492 (27 percent, inside the first viewport) and share 266 of 492 (46 percent). | `61-v6-home.css:212-230`, `:305-311`, `:415` | Make each scene fill the stage instead of ending early: `.home-scene { grid-template-rows: minmax(0, 1fr); }`, `.home-sc { height: 100%; }`; in the place scene let the photo take the free height (`.home-place-photo { aspect-ratio: auto; min-height: 100%; }` at 520 px and up, `flex: 1` on phones); in the share scene add the three stops' own catalogue photos as a 48 px strip above the link (real data, not invented people). Target every scene within 10 percent of the stage at 390, 1024 and 1440. |
| P2 | **Kind tiles drop the kind in their `href`.** All six `href` are `?tab=places&...` with no kind, so a modifier click, a long press or a copied link opens Destinations on nothing. | `HomePage.jsx:72` | Build the `href` from the same kind the click applies (the Destinations URL key for the category, as `exploreHref` does for Explore). |
| P2 | **Every demo figure is an estimate** (owner call). 9 of 9 carry "est.", Ljubljana included. The page promising "honest prices" never shows a measured figure. | `homeDemo.js:21-27` | Owner: accept, or pick stops priced at city level; if accepted, record it in the T462 report so the next review does not raise it again. |
| P3 | Focus order right to left in the demo bar (Pause x 1238, then Search x 653). | `61-v6-home.css:187` | Put the pause control at the start of the bar (drop `order: 2`). |
| P3 | Tablist and region share the name "How Carta plans a trip"; every slide reads the same summary. | `HomeDemo.jsx:311`, `:337`, `:356` | Name the tablist "Scenes"; one sentence per scene. |
| P3 | f2 door is a town name; f4 and the Share scene door are `<button>` "My trips", empty for a first visitor. | `HomePage.jsx:99`, `:107`, `:241` | f2 "See a day in Lake Bled"; point the share doors at the trip planner or the FAQ entry on sharing, as `<a href>`. |
| P3 | Share URL ends in `#trip=`, which reads as broken. | `HomeDemo.jsx:237` | Add a short sample id after `=` or show the domain alone; add `translate="no"`. |
| P3 | de `h1` three lines at 360. | `61-v6-home.css:64` | Accept, or `--text-title` for the de `h1` under 400 px; owner's call on German line length. |
| P3 | `--radius-sheet` on the resting demo panel; `linear` on the progress fill; colour animated at `--dur-2`/`--dur-3`. | `61-v6-home.css:169`, `:209`, `:561-574` | `--radius-card`; `--ease-in-out`; colour steps at `--dur-1`. |
| P3 | Column starts at x 139 at 1440 while the header starts at x 32. | `61-v6-home.css:33` | Use the browse gutter, or say in DESIGN.md's home exception that the reading cap is deliberate. |
| P3 | Credits uneven: catalogue photos link to a Wikipedia article and name no author or licence. | `HomePage.jsx:171-199` | Author and licence from the image metadata when present. |
| P3 | Kind photo `sizes` misses 769 to 1023 px; chip row and kind rail have no `overscroll-behavior-x: contain`. | `HomePage.jsx:76`, `61-v6-home.css:122`, `:587` | Add a `(max-width: 1023px) 31vw` step; `overscroll-behavior-x: contain` on both scrollers. |
| P3 | `go()` on the shown scene does not start it over; `month: 'short'` would print "Sept" beside "Jun" in en-GB (latent: Bled's months stop at Aug). | `useDemoClock.js:39`, `HomeDemo.jsx:91` | As in after-b. |
| P3 | DESIGN.md "Sections reveal once" describes motion that is not built; heading "Pick what the trip is for" vs Destinations' "Pick a kind of trip"; no closing moment at the page end. | DESIGN.md, `home.kindsTitle` | Align the record with the code; one heading; optional closing search band. |
| Owner | Inputs behind the prices, a Day scene, friends in the share scene. | | Deliberately not done under owner rules; not scored as defects in this round. |

## New defects introduced by the batch

| Pri | Defect | Element | Fix |
|---|---|---|---|
| P2 | **The 1024 to 1279 split stacks the wide scenes again.** The new 1fr / 1fr hero gives the stage about 470 px, under the 520 px container break, so place and trip stack and the stage grows to 492 px: the search scene a visitor sees first at 1024 has a 134 px blank band inside the first viewport (`en-1024-fold.png`), and the share scene is 46 percent empty. At 1280 and up the same scenes sit side by side and the stage is 358 px. | `61-v6-home.css:308`, `:361` (`@container (min-width: 520px)`), `:782` | Lower both container queries to `min-width: 440px` so the side by side layouts apply from 1024; recheck that the 390 phone (stage 358 px wide) still stacks. |
| P3 | The foot door switches label about 340 ms before its scene is visible, and the stage is blank for about 120 ms between scenes, so for a moment the door says "Lake Bled" over an empty panel. | `HomeDemo.jsx:368-382`, `61-v6-home.css:227-229` | Fade the door with the scene: key `.home-demo-foot` by scene and give it the same delayed opacity transition as `.home-scene.is-on`. |
| P3 | The Search scene's door is a second "Lakes in the Alps in July" link with the same `href` as chip 2, a few centimetres away in the first viewport. | `HomePage.jsx:234-238` | Label it as an action on the scene ("Open this search") with a new i18n key in the six catalogs. |
| P3 | In the side by side trip scene the sum label wraps to two lines beside the total ("Bed and food, a / person" at 1440; "Bett und Essen, pro / Person" in de 360). | `61-v6-home.css:362`, `:403-412` | Give the receipt the wider column (`minmax(0, 1fr) minmax(0, 1.15fr)`), or `flex-wrap: wrap` on `.home-sum` with the total pushed right. |
| P3 | f3 body opens a sentence with a numeral ("2 AI day plans are free.") and at 1440 the "2" ends a line alone. | `home.f3` in the six catalogs | "The first {n} AI day plans are free.", with a non-breaking space after `{n}`. |

No P0. One P1 (carried, not new).

## Fixes worth doing now

1. [P1] Share scene at 360: `minmax(0, 1fr)` and `min-width: 0` on `.home-share`, `min-width: 0` on `.home-share-link`; recheck en and de.
2. [P2] Lower the 520 px container queries to 440 px so 1024 to 1279 matches 1440.
3. [P2] Fill the stage in every scene (place photo takes the free height, share gains the stops' photo strip).
4. [P2] Put the kind in the kind tiles' `href`.
5. [P2, owner] Accept or replace the all estimate story and record the decision.
