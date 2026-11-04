# V5 plan: Destinations browse (T404)

Written by T404 in design wave V5, 2026-10-08, before any app file changed. It carries out the V5 list of `docs/design-v6/briefs/destinations.md` part 6 (items 1 to 9) and the open rows aimed at this session (T384-l, T394-i, T397-e, T396-d, T394-a, T391-a), under `docs/design-v6/DIRECTION.md` and the file map of `docs/design-v6/OWNERSHIP.md`. Edits stay inside the files OWNERSHIP.md gives to `destinations`, `src/styles/63-v6-destinations.css`, the six i18n catalogues under this surface's prefixes and the surface harnesses.

## Audit and critique of the V4 result (impeccable audit, then critique)

Method: the built app (branch base, `vite build`, preview on 5204) driven with Playwright on iPhone 13 (WebKit), Pixel 5, 360 x 740 and desktop 1280, plus the detector and greps over the surface files. Impeccable ran `context` once from the root worktree (its PRODUCT.md note, a missing schema stamp, is a route for `init`, not part of this task). The run is unattended, so no decision page and no live mode were opened.

Baseline harnesses, built app, before any edit: verify_places_tab exit 0, verify_paging exit 0, verify_places_search exit 0, verify_country_cards 4 of 28 failing on Explore's guide cards (row T394-h, not this tab).

What the audit found on the built V4 result:

- Controls (P1). The facet chips (`.places-class`) are 27 px high on a phone and on desktop and are 999 px pills although they are filters, not status chips; the country picker is a 999 px pill at 38 px; the locate crosshair is 30 px (rows T384-l, T394-i; brief V5-1).
- Keyboard and screen reader (P1). A rail is a scroll box with no name and no arrow keys; the position of the strip is only dots (rule Rails, brief V5-2).
- Long words (P2). German and Dutch labels in the category buttons, the cut chips and the sheet were never looked at at 360 px (brief V5-3).
- Images (P2). Three icon photos load eagerly and none has a fetch priority; the first one is the LCP element (brief V5-4).
- Empty, error, slow (P1). Five lists end in a bare "No X matches that" paragraph that offers no way back; a slow layer shows a skeleton and nothing else (brief V5-5).
- Copy (P1). `places.diffEasy` reads "Easy" (a banned word) and the card scale is three words apart from the journey scale (row T397-e).
- Craft (P2). Card values set words in mono ("Sand", "W", "Excellent"); mono is for measured facts (row T394-i).

## Choices taken where impeccable would have asked

Refinement only. Facet chips stay chips (they are filters, so 6 px, not 999 px); the search field stays the house pill, the country picker and Filters become 6 px. The lake, beach and trail card shapes do not change. Brief V5-4 asked for six eager icon photos: on a phone only the first row of a two-column grid is near the fold, so more eager photos would compete with the LCP photograph; the plan keeps three, marks the first `fetchpriority="high"` and measures. Brief V5-7 (the middots in CountryPage) is Explore's file under OWNERSHIP.md rule 4 and goes to a register row, not an edit. Rows T396-d (assertions in the outdoor harnesses), T394-a (the cost line, which needs shell's cost map) and T391-a (the journey opener, which needs App.jsx or journeys.js) cross into other surfaces' files and stay register rows.

## The changes, in order

1. Control rules (brief V5-1, rows T384-l and T394-i). Facet chips 6 px radius, 32 px high on a fine pointer, `--tap` on a coarse one; the country picker 6 px and `--tap` on a coarse pointer; the locate crosshair `--tap` square on a coarse pointer; the active sort stays `--ink-fill`. Files: 63-v6-destinations.css, 23-places-pages.css (the two old pill rules deleted). Check: verify_quality_floor, a page query for any visible target under 44 px on the phones.
2. Values in the right face. A card value that is a measured number stays mono; one that is a word (Sand, W, Excellent) sets in the sans. Files: PlaceCard.jsx or cardFillings.js, 63. Check: page query of `.pcard-v-n` fonts.
3. Rails (brief V5-2, rule Rails). Each rail strip is a named group; ArrowLeft and ArrowRight move focus to the previous and next card and bring it into view; a mono "1 to 4 of 12" says where the strip is; the dots stay hidden from assistive technology. Files: SectionOpening.jsx, 63, six catalogues (`open.railPos`, `open.railLabel`). Check: scripts/verify_keyboard.mjs 20 of 20, a scratch keyboard probe.
4. Region page and sheet focus (brief V5-2). Confirm the region page traps focus and closes on Escape (verify_regions) and that the filter sheet returns focus to the button that opened it; fix what the probe finds. Files: RegionPage.jsx, PlacesFilterSheet.jsx.
5. Long words (brief V5-3). Category buttons, cut chips, count chips, card names and the sheet wrap or truncate with an ellipsis at 360 px in German and Dutch; no horizontal scroll. Files: 63. Check: de and nl screenshots at 360 px and a scroll-width query on every category.
6. Images (brief V5-4). First icon photo `fetchpriority="high"`, the rest of the eager three as they are, rails lazy. Files: SectionOpening.jsx. Check: LCP element and image bytes on the Lakes opening, before and after.
7. Empty, error and slow states (brief V5-5). The five bare "none match" paragraphs become the chips-empty module with a "Clear search" button; a skeleton still on screen after 5 seconds gets one status line; LayerError keeps the list under it. Files: DestinationsTab.jsx, CoverageEmpty.jsx if needed, 45-empty-states.css, six catalogues (`empty.clearSearch`, `layer.slow`). Check: every empty path renders one of the two modules.
8. Copy (brief V5-6, row T397-e). `places.diffEasy` and `places.diffHard` read Gentle and Demanding in six languages, taken from the journey scale (`journey.diffEasy`, `journey.diffDemanding`); every new string written in de, es, fr, it and nl, one owner row for native review. Files: six catalogues. Check: the catalogues parse.
9. Harnesses (brief V5-8). Update only assertions that encode the old design, each with a comment; add checks for the new empty module and the rail keys to verify_places_tab. Files: scripts/verify_places_tab.mjs.
10. Final pass: phone checks (iPhone 13, Pixel 5, 360 x 740, landscape, tap only, the keyboard at 40 percent shorter, safe areas, 100dvh, thumb reach, reduced motion), 360 to 1440 px, no layout shift from motion, INP and LCP no worse, ten JPEG screenshots named `V5-<view>-<device>.jpg`, the detector over every changed file, the seven questions.

## Checks

verify_places_tab, verify_paging, verify_places_search, verify_country_cards (4 known Explore failures), verify_regions (own preview, `CARTA_REPO_ROOT`), verify_category_rail (Explore's, known), `scripts/verify_keyboard.mjs`, `scripts/verify_quality_floor.mjs`, `npm test`, `npm run lint`, `node scripts/ci/design-lint.mjs` 0 new, `npm run build` then delete dist/ and dist-data/, the six catalogues parsed, `impeccable detect --json` over every changed file.
