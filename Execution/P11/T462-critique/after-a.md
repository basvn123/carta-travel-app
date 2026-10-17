# T462 critique: the home page AFTER the rebuild, reviewer A

Method: independent reviewer A, Assessment A only (design review), Persuade mode (a home page for first-time visitors), per `impeccable/reference/critique.md`. No detector output was read before this was written. No project file was edited.

Target: `continent-app/src/browse/home/HomePage.jsx`, `HomeDemo.jsx`, `useDemoClock.js`, `src/lib/homeDemo.js`, `src/styles/61-v6-home.css`, `home.*` in `src/i18n/en.js` (and the same keys in de, es, fr, it, nl).

Evidence:
- `Execution/P11/T462-shots/after-r1/` (all widths, en and de, the eight scene shots, `probe.json`), compared with `../before/` and `before.md` (22/40).
- A live Playwright probe of http://localhost:5202/ with fresh storage at 390 x 844, 1440 x 900 and 360 x 740 (touch on the phones), a 22 second timeline of the demo at 1440, the keyboard tab order, a hover check, a reduced-motion run, and the Explore, Destinations and Trip planner tabs at 1440 and 390 with `continent.homeSeen.v1` set. Files in the session scratchpad, `critique-after-a/` (`probe.mjs`, `probe.json`, `live-*.png`, `tab-*.png`).

Measured (en):

| Measure | Before | After |
|---|---|---|
| Visible words in the page | 613 | 435 |
| Catalogue counts | 22 | 0 (the probe's 9 "counts" are prices, ratings and pass prices) |
| Images | 0 | 13 |
| Scroll height at 390 | 2,779 px | 3,265 px (4.66 of the 701 px scroll viewport) |
| Scroll height at 360 | not measured | 3,322 px (5.56 of the 597 px scroll viewport) |
| Scroll height at 1440 | 1,780 px | 1,966 px (2.35 viewports) |
| Primary above the nav, de 360 | no | yes |
| `h1` / primaries | 1 / 1 | 1 / 1 |
| Horizontal overflow at 360 | none | none |
| Console errors | 0 | 0 |
| Demo stage height vs scene content, 1440 | n/a | stage 494 px; search 310, place 446, trip 294, share 218 |
| Demo stage height vs scene content, 390 | n/a | stage 505 px; search 310, place 362, trip 473, share 218 |
| Figures in the demo carrying "est." | n/a | 9 of 9 |

## Verdict in one paragraph

A real step up. The page now says the owner's sentence in the `h1`, offers the real search, three real questions and one primary inside the first viewport at every width and in German, and shows the product moving through search, place, trip and share with the catalogue's own figures, a pause control and a reduced-motion still. Catalogue counts and method furniture are gone and photography is back. What holds it below "excellent" is execution, not direction: the demo stage is up to half empty in three of its four scenes (including the very first frame a phone visitor sees), the page tells the same four-beat story three times (sub line, demo, feature list, plus a proof column that repeats the demo's search results row for row), so on a phone it is now longer than the page it replaced, and the figures it chose argue against the promise: the first price is the dearest town at `~€113 est. a day`, every one of nine figures carries "est.", and none of the three questions speaks to the hiker, who is the launch's first audience.

## Design specificity

LLM assessment: the skeleton is the category-standard SaaS landing (split hero with a product widget on the right, a row of category tiles, a list of four icon-and-sentence features with quiet links, three pricing cards). That skeleton could carry any product. What makes it Carta is the content poured into it: the tilde-and-"est." prices, the Score, a per-person receipt in cents that adds up exactly, real licensed photographs, the real guided search. The demo is the strongest authored element and is clearly this product. The feature list is the most interchangeable section on the page and is also the one that repeats the demo. The missed opportunity is the hiker: the product's first audience gets one tile ("Trails") and nothing in the hero.

## Nielsen heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Scene tabs, a progress line and a pause/play glyph show where the demo is. The 2 px brown progress line runs straight under the tab row, so the selected tab's brown underline merges with it and at 360 the wrong tab looks underlined. Prices show with no visible inputs (party, Lifestyle). |
| 2 | Match between system and real world | 3 | Plain, verb-first copy. Leaks: a door labelled "Hallstatt" under "See what a day really costs"; "Lines join the towns; the trip planner prices each leg." (a method sentence); a kind tile called "Trips" under "Pick what the trip is for"; de "Probier" as a bare fragment. |
| 3 | User control and freedom | 3 | Pause comes first in the demo's tab order, hover and focus stop the turning, picking a tab stops rotation, off screen and hidden tab freeze it. The demo is a dead end: tapping Hallstatt or "Add to trip" does nothing and there is no door from a scene to its real surface. |
| 4 | Consistency and standards | 3 | Kit Card rows, Money, ScoreChip, Tabs, IconButton and tokens throughout. Drift: a card inside a card in the place scene, `--radius-sheet` on a resting panel, a door that navigates as a `<button>` (f4) beside three `<a href>` doors, a centred 1180 px column at 1440 while Explore and Destinations run on the header's 32 px gutter, "Pick what the trip is for" here vs "Pick a kind of trip" on Destinations for the same six tiles. |
| 5 | Error prevention | 3 | Fallback story when the story towns are missing, a still block while loading, a solo hero when nothing prices, modifier clicks open new tabs. Nothing destructive here. |
| 6 | Recognition rather than recall | 3 | Search, kinds and four features are visible with labelled doors. The day planner and export exist only as words; the demo never shows a day. |
| 7 | Flexibility and efficiency | 3 | Many doors: search, three questions, primary, six kinds, four feature doors, three place rows. A modifier click is respected. None of the three questions serves the hiker. |
| 8 | Aesthetic and minimalist design | 2 | Clean surfaces and good photography, but the story is told three times, the proof column duplicates the demo, the demo stage is 37 to 56 percent empty in three scenes, and the phone page is 4.66 screens, longer than before. |
| 9 | Error recovery | 3 | Missing photo falls back to the icon tile; missing story falls back to the best rated country; nothing on the page can fail loudly. |
| 10 | Help and documentation | 2 | The page is itself the explainer, but there is no path to the FAQ or to what a pass includes beyond "Compare passes", and "Plan it with friends" is never explained. |
| **Total** | | **28/40** | **Good (low).** With 7 and 10 scored n/a as Persuade mode allows: 23/32, 72 percent, also Good. Before: 22/40. |

### Cognitive load

Checklist failures: single focus (the moving demo sits beside the primary and competes with it on desktop; on a phone it fills the screen right under it) and minimal choices (the hero offers search, three questions and the primary, plus four scene tabs and pause in the demo: 10 targets in one viewport). Chunking, grouping, hierarchy, working memory and progressive disclosure pass. 2 of 8 failed: moderate.

### Emotional journey

The peak is the Hallstatt photograph in the place scene, which is genuinely inviting. The valley is the first frame: at 390 the demo opens on a white panel with roughly 95 px of nothing above the search field. The second dip is the price: `~€113 est. a day` is the first figure, beside a chip that says "under €80 a day". The end of the page is three pricing cards and a closed "Photo credits" disclosure, so the last moment is a price list and a footnote; there is no closing invitation.

## What works

- **The first viewport does its job at every width.** One `h1` that is the owner's positioning verbatim, the real guided search shaped like the field it opens, three real questions as deep links, one primary, all above the nav from 360 to 1440 and in German at 360 (the before page failed de 360).
- **The demo is the product, honestly built.** Real towns, real day costs from the same cost index as Explore, a receipt in cents that sums exactly (`201.62 + 338.46 + 174.60 = 714.68`), a pause control first in the tab order, freezing off screen, in a hidden tab, under a page and on hover or focus, reduced motion holding the finished trip frame with no pause control to confuse, and one screen-reader sentence carrying the same figures.
- **Say less, achieved.** 22 catalogue counts to 0, 613 words to 435, no method appendix, no coverage table; photography leads in the six kind tiles, with labels in the solid pills the exception allows.

## Defects, prioritised

### P1

1. **The demo stage is half empty, starting with the first frame.**
   Element: `.home-stage` / `.home-scene` (`61-v6-home.css` lines 208 to 223). All four scenes share one grid cell, so the stage takes the tallest scene's height (place 446 px at 1440, trip 473 px at 390) and `align-content: center` floats the others in it. Measured: search 310 of 494 px (37 percent empty), trip 294 of 494, share 218 of 494 (56 percent empty) at 1440; search 310 of 505 at 390, the frame a phone visitor sees first, with about 95 px of white above the field (`en-390-fold.png`, `live-360-fold.png`).
   Fix: design the four scenes to one height instead of centring them. Target every scene within 10 percent of a stage of about 420 px on a phone and 400 px at 1440: search shows four results (or three plus the "See all" door); at 1440 the place scene uses a 21:9 photo or a side-by-side photo and body so it stops setting the height; on a phone the trip scene puts the route drawing at about 120 px tall or drops it for the receipt alone; share gains a trip card (three 48 px photos of the stops, the total) above the link. Then set `.home-scene { align-content: start; }` so any leftover sits at the bottom, not at the top.

2. **Not compact on a phone: the page is longer than the one it replaced.**
   Element: `HomeFeatures` (`HomePage.jsx` lines 120 to 181) and `HomePasses`. 3,265 px at 390 (before 2,779 px), 5.56 scroll viewports at 360. The four feature rows retell the demo's four scenes in the same order (search, day cost, trip, share), and `.home-proof` re-renders the demo's search scene row for row (Hallstatt ~€113, Zell am See ~€87, Lake Bled ~€77, same order, same figures). The three pass cards stack to about 600 px.
   Fix: delete `.home-proof` (it is the demo again). Cut the feature list to four single-line rows (title and door, no body sentence) or fold each feature's door into the demo as the scene's own link (see P2 defect 6) and drop the section. On phones, render the passes as one bordered list with three hairline rows (name, price, one line) instead of three cards. Target: under 2,400 px at 390.

3. **The figures argue against the promise.**
   Element: `STORY` in `src/lib/homeDemo.js` lines 18 to 24. The opened place is the dearest of the three results (`~€113 est. a day`), shown in the first viewport beside the chip "Beaches in Portugal under €80 a day"; the trip receipt totals `~€714.68 est.` a person; all 9 figures in the demo carry "est.", so a page that promises "honest prices" and "what a day really costs" never shows one measured figure. A budget visitor reads "expensive and approximate" in two seconds.
   Fix: choose the story by data, not by name: sort the results by day cost so the picked and opened town is the cheapest of the three (Lake Bled ~€77 today), give it the best-value marker once, and require that the opened place and at least two trip stops price at city level (`isEstimate(cost) === false`) so the receipt shows measured lines with one estimate among them. If the Alpine lakes cannot meet that, change the story to a region that can. Add a `tests/home.test.mjs` assertion for both rules so a future data refresh cannot regress it.

### P2

4. **Two brown lines under the scene tabs.**
   Element: `.home-demo-progress-fill` (`background: var(--select-border)`, directly under `.home-demo-tabs`). The selected tab's 2 px brown underline sits on a 2 px brown line that spans most of the row, so the underline loses its meaning; at 360 the progress line under "Search" reads as the selected mark while "Place" is selected (`live-360-fold.png`). Brown on a progress meter is also brown spent on something that is not an action or a selection.
   Fix: draw the progress in the selected tab's own underline (scale the `.ui-tab[aria-selected=true]` underline with `--home-scene-ms`) and remove the separate line; or keep a separate line in `--text-3` at the bottom edge of the stage, away from the tabs.

5. **Crossfade ghosting between scenes.**
   Element: `.home-scene` opacity transition (line 218). The outgoing and incoming scenes are both partly visible for 320 ms, text over text: the after-r1 full page shot caught "Hallstatt" and "Austria" over a faded "Lake Bled ~€77 est. a day" and "8.5" (`en-1440.png`, `en-390.png`).
   Fix: hide the outgoing scene first and fade the incoming one in after it: `.home-scene { transition: opacity var(--dur-2) var(--ease-out); } .home-scene.is-on { transition-duration: var(--dur-3); transition-delay: var(--dur-2); }`.

6. **The demo is a dead end.**
   Element: `.home-scenes` (`aria-hidden`, `pointer-events: none`), `.home-add`. On a phone, a tap on Hallstatt or on "Add to trip" does nothing, and nothing in the panel leads to the surface being shown.
   Fix: one quiet link under the stage that changes with the scene: "Open this search" (Explore with the story's facets), "Open Hallstatt" (`#dest=`), "Open the trip planner", "See how sharing works" (My trips or the FAQ entry). A real `<a href>` outside the `aria-hidden` block, so it is reachable by keyboard and screen reader.

7. **The hiker, the first audience, has no door in the hero.**
   Element: `SEARCHES` in `homeDemo.js` lines 29 to 33 and the story. The three questions are lakes, beaches and old towns; the demo is a lake-town week. PRODUCT.md: "the hiker is who it says its first sentence to".
   Fix: make one of the three questions a walking one that returns results today (for example "Walks from a town in the Dolomites in September" with `vibe: 'hiking'` or the trails facet Explore exposes), and put it first.

8. **Day planner and export are words only.**
   Element: the demo's four scenes and `home.f4`, `home.pdf`. The brief lists "plan the trip and each day" and "export"; the demo never shows a day, and export is "Take it along as a PDF" with a "Trip Pass" tag. GPX, KML and calendar export exist and are what a hiker looks for.
   Fix: add a fifth scene "Day" (Hallstatt: three stops with arrival times and walking minutes, the per-person day figure) or merge Share and Export into one scene and add Day. Rename `home.pdf` to name the formats ("Take it along as a PDF, GPX or calendar file") if all are offered.

9. **Feature doors that mislead.**
   Element: `HomeFeatures` rows f2 and f4. The f2 door reads "Hallstatt", a town name standing in for "see a day's cost"; the f4 door "My trips" opens an empty list for a first-time visitor and is a `<button>` while the other three doors are `<a href>` (navigation must be a link with a URL, carta-design "Navigation").
   Fix: f2 door "See a day in Hallstatt" (`#dest=`); f4 door to the trip planner or the demo trip's share page, as `<a href>` with `tabHref(...)`.

10. **Prices with no visible inputs.**
    Element: every price on the page. `~€113 est. a day` is priced at the app defaults (2 people, Entire place, Easygoing, visible on Explore's settings line), but the home page shows none of them. PRODUCT.md: "Prices change meaning with the inputs, so the inputs are always visible."
    Fix: one caption under the demo's stage or the search results, read from the same settings source: "For 2 people, entire place, Easygoing" with the Lifestyle words as a link that opens the one Lifestyle control. This is an input, not a method sentence.

11. **The group organiser sees nothing of the group.**
    Element: `ShareScene`. "Plan it with friends" is one bare row; the receipt is "Bed and food, a person" only; the share URL is a literal `carta-europetravel.com/#trip=` ending in `=`, which reads as a broken link.
    Fix: show two or three initials discs joining the trip and a second total line "For 4 people" from the same figures; render the URL as `carta-europetravel.com/#trip=` plus a short sample id, or drop the URL and show the "Link copied" state alone.

### P3

12. **"Lines join the towns; the trip planner prices each leg."** (`home.lineNote`, all six languages) is a method note under a receipt, which T438 removed everywhere. Delete it.
13. **Card inside a card and the wrong radius.** `.home-place` is a bordered card inside the bordered `.home-demo`, which uses `--radius-sheet` (sheets and dialogs). Give `.home-demo` `--radius-card`, and draw the place scene borderless on the demo's surface.
14. **Motion off the tokens.** `.home-demo-progress-fill` uses `linear`, not a token easing; `home-settle` zooms the photo over 4.8 s (`calc(var(--dur-4) * 10)`), a Ken Burns move outside every token's job; `home-pick` and `home-press` animate `background-color` at `--dur-2`/`--dur-3` where colour changes take `--dur-1`. Drop the zoom, use `--ease-in-out` for the progress, colour at `--dur-1`.
15. **"Pick what the trip is for" vs "Pick a kind of trip".** Same six tiles, two headings. Use Destinations' heading. The first tile "Trips" is vague under either; the Trails tile's 4:5 crop cuts the path and walkers out of the Zermatt photo so it reads as Mountains: set `object-position: center bottom` on that tile or choose a photo with the path in the lower half.
16. **"Free €0.00".** The free card prints a price in cents for nothing. Print "€0" or omit the price line and keep "Free".
17. **"Best in May, Jun, Jul, Aug and Sept".** Mixed abbreviations from `Intl.DateTimeFormat` short months in en-GB. Use full month names, or `month: 'short'` with the locale fixed for consistent forms.
18. **German.** `home.tryLabel` "Probier" is a bare fragment ("Zum Beispiel" reads naturally); "Lake Bled" stays English in German (data name, flag it to the data task).
19. **Column alignment at 1440.** The home column starts at x 139 while the header brand and the Explore and Destinations content start at x 32. Either use the browse gutter for the hero row, or accept the reading-page cap and say so in DESIGN.md's home exception.
20. **Credits only in a closed disclosure.** Destination photos list only a title, without author and licence; carta-design puts a credit under the photo. Add author and licence from the image metadata, and keep the disclosure.
21. **No closing moment.** The page ends on pricing and a footnote. A last compact band with the search pill again (not a second primary) gives the end of the journey an action.

## Personas

**First-time budget traveller on a phone (390 x 844, a student with about €40 a day in mind).** Reads the `h1` and the sub in one glance and understands "plan a trip in Europe, see costs": the core promise lands. Sees the search pill and the first question chip; the second chip ("Beaches in Portugal under €80 a day") is cut at the edge, the third is off screen. Below the primary the demo opens on a mostly white panel, then the first price is `~€113 est. a day` for Hallstatt: Carta looks expensive and approximate. Taps Hallstatt in the demo: nothing happens. Scrolls past six photo tiles (good), four feature rows that repeat what the demo just showed, then the same three towns and prices again, then three stacked pass cards. Learns "Plan for free" only on the fourth screen. Never sees what inputs made €113. Will likely tap the beaches chip, which is the right door, but by luck rather than by design.

**Hiker on desktop (1440 x 900, planning a walking weekend).** The hero names no walk, none of the three questions is a walk, the demo is a lake-town week, the proof column is the same lake towns. The only signal is the "Trails" tile in the second section, whose photo reads as mountain scenery, and the word "trails" inside the f1 sentence. No elevation, no trail page, no GPX, no day plan on screen; "draft each day hour by hour" is a sentence, not a picture. The hiker will likely click Trails and find the product, but the home page did nothing to tell them Carta beats Komoot plus a booking site, which is the positioning PRODUCT.md asks it to say.

**Group organiser who wants to share (desktop then phone).** The share scene is the thinnest of the four: a title, a link field that ends in `#trip=`, "Plan it with friends" as a bare row, and a PDF tagged "Trip Pass" with no word on whether sharing itself is free. The receipt prices one person, so the organiser cannot see what the group pays. The feature row "Share it with friends" leads to "My trips", empty on a first visit. They do not learn how friends join, whether friends need an account, or what the group total is.

## Owner brief check (2026-10-17)

| Brief asks | After |
|---|---|
| Super clear value proposition: plan any trip in Europe | Yes, the `h1` verbatim. |
| Explore and search places | Yes: search pill, three questions, the search scene. |
| Beaches, lakes, mountains, trails, cycling | Yes as six photo tiles; trails is weak (photo reads as mountains, no question chip). |
| Real day costs | Shown, but all 9 figures are estimates and the first is the dearest. |
| Plan the trip | Yes, trip scene with a receipt in cents. |
| Plan each day | Words only (f3). |
| Share with friends | Thin scene, no group shown. |
| Export | PDF only, in words. |
| No catalogue counts, no filler, no em dashes | Counts 0, dashes 0; one filler line (`home.lineNote`). |
| Same styling as Explore, Destinations, Trip planner | Mostly: kit cards, tokens, chips; column alignment and the demo panel radius differ. |
| Dynamic, professional, clean, structured, modern | Yes. |
| Compact | No on phones: 3,265 px at 390, longer than before. |
| Human | Partly: warm photos, but no people, no friends, no group anywhere. |
| Clean on desktop and mobile | Desktop yes apart from the demo's empty stage; mobile long and the demo panel half empty at first. |

## Top fixes, in order

1. [P1] Make the four demo scenes one height and top-align them; no empty first frame.
2. [P1] Delete the proof column and shrink the feature list and passes so the phone page is under 2,400 px.
3. [P1] Pick the story by data: cheapest town opened and marked best value, measured figures in the receipt.
4. [P2] Fix the two brown lines under the scene tabs and the crossfade ghosting.
5. [P2] Give each scene a real door, and put a walking question first for the hiker.
6. [P2] Show a day and the export formats, show the inputs behind the prices, and show the group in the share scene.
