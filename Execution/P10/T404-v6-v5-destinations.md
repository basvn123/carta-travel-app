# T404: harden, adapt and polish: Destinations browse

## Task ID

T404 (design wave V5, session 4 of 10; surface key `destinations`).

## Date

2026-10-09

## What changed

The Destinations tab is tighter at the edges. Facet chips and the country picker are 6 px controls, not 999 px pills. On a coarse pointer the chips, the picker, the locate crosshair and the sorts reach 44 px, in landscape too (rows T384-l and T394-i). The category buttons no longer cut a long German or Dutch label to "Radfah...": the label wraps and the button grows by a line. A card value that is a word (Sand, W, Excellent) is set in the sans and the mono is kept for numbers. The difficulty words on cards and the trail page read Gentle and Demanding (Easy and Hard were the old words) and match the journey scale in all six languages (row T397-e).

Rails can be walked with the keys. Each rail strip is a named group. ArrowLeft and ArrowRight on a focused card move to its neighbour and scroll it into view. Tab still walks every card. A mono line says where the strip is ("1 to 4 of 12") beside the dots, which stay hidden from screen readers.

Every emptied list now ends in the same module. The four bare "No beach, lake, mountain or cycle route matches that" lines became the chips-empty module with a "Clear search" button. A skeleton still on screen after five seconds adds one line, "Still loading. Your connection may be slow.", and the status region says so too. The load-failure message now names the layer for walks, cycle routes and composed trips, as it already did for beaches, lakes and mountains. The first icon photo on an opening carries `fetchpriority="high"`.

How it works, for whoever maintains it. `useStripPosition` in `SectionOpening.jsx` also returns the first and last whole card in view and the total, and `Rail` owns the arrow-key handler on its strip. `PlaceCardSkeletons` reads `useI18n` itself and owns the five-second timer, so no call site changed. `queryEmpty(msgKey)` in `DestinationsTab.jsx` is `chipsEmpty` with `setQuery('')`. The ellipsis rule on `.places-cat span` is deleted from 23-places-pages.css (the file is this surface's); the wrap rules are in 63.

Choices taken where impeccable would have asked, under the owner's instruction to proceed (2026-10-07), each keeping Carta's palette, type and identity. Refinement only. Facet chips are filters, so they take the 6 px control radius, not the pill; the search field stays the house pill. Brief V5-4 asked for six eager icon photos. On a phone only the first row of a two-column grid is near the fold, so more eager photos would compete with the photograph that matters, and the count stays at three. The trail's three-step difficulty is mapped onto the journey words Gentle, Moderate and Demanding rather than a fourth scale. Brief V5-7 (the middots in CountryPage.jsx lines 112 to 114) is Explore's file under OWNERSHIP.md and stays a register row.

## Files touched

App repo (branch `p10-v6-polish-destinations`, one commit `26d7725`):

**Modified:**
- src/browse/DestinationsTab.jsx (`queryEmpty`, three layer-specific load messages)
- src/browse/PlaceCard.jsx (`is-word` class, five-second skeleton status)
- src/browse/SectionOpening.jsx (arrow keys, group label, mono position, fetch priority)
- src/styles/23-places-pages.css (facet chip and country picker radius, the ellipsis rule on category labels deleted)
- src/styles/63-v6-destinations.css (the T404 section)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (7 new keys each: `open.railLabel`, `open.railPos`, `empty.clearSearch`, `layer.slow`, `cycle.loadFailed`, `trip.loadFailed`, `trails.loadFailed`; values changed for `places.diffEasy` and `places.diffHard`)
- scripts/verify_places_tab.mjs (five V5 checks added; no assertion changed, none deleted)

**Created:** none.

Root repo (branch `p10-v6-polish-destinations`):

**Created:**
- docs/design-v6/plans/V5-destinations.md (the plan, committed before the first app edit)
- Execution/P10/T404-v6-v5-destinations.md

**Modified:**
- Execution/_OPEN.md (rows T404-a to T404-e; T384-l, T394-i and T397-e closed)

## Commands run

In the app worktree, against the shared node_modules:

    node node_modules/vite/bin/vite.js build          (base, then after each edit batch; not npm run build, whose prebuild rewrites public/)
    node node_modules/vite/bin/vite.js preview --port 5204 --strictPort
    node --import <scratch>/pwfix.mjs scripts/verify_places_tab.mjs http://localhost:5204/   (and verify_paging, verify_places_search, verify_country_cards)
    node --import <scratch>/pwfix.mjs scripts/verify_keyboard.mjs --port 5204
    node --import <scratch>/pwfix.mjs scripts/verify_quality_floor.mjs t404 --port=5204 --only=pages
    CARTA_REPO_ROOT=<root worktree> node --import <scratch>/pwfix.mjs scripts/verify_regions.mjs   (PowerShell, its own preview)
    npm test
    npm run lint
    node scripts/ci/design-lint.mjs
    sh .claude/skills/impeccable/scripts/impeccable detect --json <every changed source file>
    for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
    rm -rf dist dist-data

`pwfix.mjs` is the same scratch preload as T394 (the installed Playwright 1.61.1 asks for browser builds the shared cache lacks; row T394-g). Screenshots and the phone checks came from scratch Playwright scripts outside both repos. WebKit's JPEG screenshot failed on this machine for some frames, so those were taken as PNG and re-encoded to JPEG at quality 80 in a Chromium canvas.

## Config and secrets set

None.

## Before/after measurements

Harnesses on the built app (before: the branch base; after: the final build):

| Harness | Before | After |
|---|---|---|
| verify_places_tab | exit 0 (39 checks in T394's count) | 44 of 44 PASS (five V5 checks added) |
| verify_paging | exit 0 | exit 0 |
| verify_places_search | exit 0 | 41 of 41 |
| verify_regions | not run on base | 30 of 30 |
| verify_country_cards | 4 of 28 fail (Explore's guide cards) | the same 4 (row T394-h, not this tab) |
| verify_keyboard | not run on base | 20 of 20 PASS |
| verify_quality_floor, pages | not run on base | Destinations views: phone small targets 0, h1 1, contrast 0, motion 0, gradients 0, mono prose 0 (T394 had 10 on dest-list); desktop 3 small targets on a fine pointer, as before. The one FAIL ("targets under 44 px, phone: 15") is on the destination page, another surface |
| npm test | 368 of 368 | 368 of 368 |
| eslint | 0 errors | 0 errors (62 warnings, none from this task's lines) |
| design lint | 165 in baseline | 165, 0 new |
| impeccable detect over the five changed source files | not run on base | `[]`, exit 0 |

The surface:

| Metric | Before | After | Source |
|---|---|---|---|
| Visible targets under 44 px on a phone, Lakes opening (facet chips) | 4 at 27 px | 0 | page query, iPhone 13, Pixel 5, 360 x 740 |
| Same, all six categories in en, de and nl at 360 px and iPhone 13 | not measured | 0 targets under 44 px, 0 page scroll, 0 category buttons or cut chips clipped (36 category views) | scratch probe |
| Country picker and facet chip radius | 999 px | 6 px | 23-places-pages.css |
| Bare "none match" lines | 4 | 0 (all four are the chips-empty module) | grep |
| Rails with arrow keys and a mono position | 0 | every rail on every opening | verify_places_tab |
| Banned word "Easy" in the surface's difficulty keys | 1 per language in en | 0 | en.js |
| Icon photos loaded eagerly on an opening | 3 | 3, the first with fetch priority high | SectionOpening.jsx |

LCP is not claimed as a gain. On a Pixel 5 the largest contentful paint is a paragraph on the Trips screen that shows before the category is switched, so the opening's photographs are not the LCP candidate in this flow. Three runs each on a loaded machine ranged 1.1 s to 2.8 s with and without the attribute, which is noise (row T404-d).

Phone checks. iPhone 13 (WebKit), Pixel 5 and 360 x 740: no horizontal scroll of the page or the tab in any category in English, German or Dutch. Landscape 844 x 390 (iPhone 13, Lakes): no scroll, no target under 44 px among the picker, crosshair, Filters and chips. Tap only: nothing new depends on hover; the arrow keys are a shortcut and Tab walks every card. The on-screen keyboard: with the search focused and the viewport 40 percent shorter (390 x 506), the field ends at 277 px and the bottom nav starts at 420 px. The filter sheet returns focus to the Filters button after Escape (checked on Pixel 5, Beaches). Safe areas and 100dvh: nothing new is fixed or full height. Thumb reach: the sheet's "Show N places" stays the one primary at the foot of the sheet. Swipe is never the only way: rails keep "See all", the arrow buttons on a fine pointer, and now the keys. Reduced motion: no new motion was added. What only a real phone can prove is row T404-b.

Screenshots (JPEG, quality 80, viewport only, six) in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destinations\`: V5-opening-iphone, V5-walks-android, V5-filters-android, V5-empty-android, V5-opening-desktop, V5-grid-desktop.

Carta-design's seven questions, over the diff. One: no hex, font name or literal duration added. Two: no gradient and no new colour. Three: ochre untouched; the accent appears only on focus rings. Four: mono now carries numbers only; the new position line "1 to 4 of 12" is a measured position in mono, every sentence is in the sans, and word values left the mono. Five: one primary per view, the sheet's "Show N places"; "Clear search" is a secondary. Six: the new strings are sentence case, have no dash, no middot and no banned word, and "Easy" left the surface. Seven, remove one thing: the ellipsis that cut "Radfahren" to "Radfah...", and the four bare dead-end lines.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| A new rule `.open-strip:focus-within { outline: none; }` failed the design lint | It was a no-op written from habit | Deleted; the card's own focus ring is the rule |
| The first German pass still cut "Radfahren" | An old `text-overflow: ellipsis` on `.places-cat span` in 23-places-pages.css | Deleted in place (the file is this surface's); the wrap is set in 63 |
| One full build exited silently after the transform step | Unknown, probably memory with other sessions running | Rebuilt, 3 minutes, exit 0 |

## What is still open

The phone opening's cut chips still stack one long label per line before Band 3 (row T404-c). The middots in CountryPage.jsx lines 112 to 114 belong to Explore, and the fetch priority is unmeasured (row T404-d). Rows T394-a (the cost line, needs shell's cost map), T391-a (the journey opener, needs journeys.js or App.jsx) and T396-d (assertions in verify_trail_page, verify_lakes and verify_cycling, files of the outdoor surface) are untouched because each needs another surface's file (row T404-e). Native review of the new strings and the two changed difficulty words (row T404-a). Real-phone checks (row T404-b).

## Rollback procedure

App repo: `git revert 26d7725` on master after the merge, or drop branch `p10-v6-polish-destinations` before it. The revert restores the pill radii, the clipped category labels, the bare empty lines and the old difficulty words in one step; nothing else depends on the seven new keys. Root repo: revert the plan commit and the report commit; reverting the report commit reopens T384-l, T394-i and T397-e. No data, schema or migration is involved.
