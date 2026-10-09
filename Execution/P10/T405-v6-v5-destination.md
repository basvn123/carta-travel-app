# T405: harden, adapt and polish the Destination (town) page (design wave V5)

## Task ID

T405

## Date

2026-10-09

## What changed

The destination page is now safe to use with a thumb, in six languages, and when something goes wrong.

On a touch screen every control of this page is 44 px: the gallery arrows, the close cross, the bar buttons, the Wikipedia links on highlights, the parking Google Maps and Waze links, the festival links, the "Around here" tabs, the "Read more" links, the receipt's selects and dates (sized here for this page only) and the map attribution button. A fine pointer keeps its 28 to 32 px. The "Around here" layer tabs used to scroll sideways and hid the last one; they wrap now, so a swipe is never the only way.

The gallery height uses dvh. Held sideways it is 40 percent of the screen (137 of 342 px, was 200). The photo credit keeps a 44 px target even in a narrow slide, and its full text sits in a title.

Focus on open follows carta-design rule 10: on a mouse the place name takes focus and shows no ring (a heading with tabindex -1); on a phone the back arrow keeps it. The place name is the page's h1, folds are h2 (the existing `level` prop, Fold.jsx is untouched), subheads inside folds are h3.

A failed PDF now says "The PDF could not be made. Try again in a moment." in a polite status line under the bar. A blocked clipboard says "Your browser blocked copying. Copy the link yourself:" and shows the link, selectable. A dismissed share sheet no longer copies the link behind the traveller's back. The gallery arrows have translated screen reader labels (they were English only).

Neighbourhood nights, the tier lines and the bed-price summary go through `eurExact()` (to the cent, in the app's language). The `dest.tier*` and `dest.sleepSummary` strings lost their euro sign because the figure arrives formatted.

The PDF follows the page order (at a glance, cost, when to go, routes, around, things to do, must-sees, trips, sleep, tips, festivals, parking), prints tiers and neighbourhood nights to the cent, and reads its colours from the live tokens (it carried the pre-T363 accent and mute). The day figure matches the page: the page showed EUR 87 and the PDF printed EUR 87 in the facts, the cost total and the budget line.

verify_hero_images.mjs is repointed at the first gallery slide, with a comment (T385-g).

## Files touched

App (continent-app, branch p10-v6-polish-destination): src/browse/DestinationPage.jsx, Neighbourhoods.jsx, RoutesFromHere.jsx, src/lib/destinationPdf.js, src/styles/64-v6-destination.css, src/i18n/en, de, es, fr, it, nl, scripts/verify_hero_images.mjs. All belong to `destination` in OWNERSHIP.md; check_ownership passes.

Root: docs/design-v6/plans/V5-destination.md (committed before the first app commit; some app edits were already in the working tree by then, none committed), Execution/_OPEN.md, this report.

## Commands run

Plan: impeccable context (it resolves the app as root, so PRODUCT.md and DESIGN.md were read directly), the detector, the design lint, a phone walk. Build and `vite preview` on 5205 (the dev server hangs on the shared node_modules junction). Checks: six catalogues parse, `npm run lint`, `npm test`, design lint, check_ownership, detector, harnesses, scratch Playwright scripts in wt/_scratch/T405 (outside both repos). Preview stopped, dist/ and dist-data/ deleted.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Controls under 44 px on touch, all folds open, Pixel 5, Rome | 33 | 2 (the CARTO and OpenStreetMap attribution text links) |
| Same at 360 x 740, Rome, Valbona, Zungoli, six languages | not measured | 2 per page, same two links |
| Controls under 44 px, landscape 750 x 342 | 9 | 0 |
| Landscape gallery height | 200 of 342 px | 137 of 342 px (40 percent) |
| Horizontal scroll at 360 px | 0 | 0 in en, de, es, fr, it, nl |
| Heading outline | h2 city, h3 folds, h4 subheads | h1 city, h2 folds, h3 subheads |
| Focus on open (fine pointer) | Share or Back | the place name (h1) |
| detector, changed files | 0 | 0 |
| design lint new | 0 | 0 (166 baselined) |
| npm test | 367 | 368 of 368 |
| lint | 0 errors, 62 warnings | 0 errors, 62 warnings |

Harness results: verify_destination_page 58 PASS, no FAIL; verify_routes_block 19 of 19; verify_transport_links 43 of 43; verify_hero_images 7 of 7 (was 5 of 7); verify_keyboard 18 of 20, where every destination row passes at 380 and 1280 and the two failures are trip-planner (T405-f); verify_stay_tiers hung on an Explore control (T405-f); verify_quality_floor was not run (its last full run crashed this laptop, T395). Tiers on Rome print as EUR 31.05, 87.98 and 102.00.

Phone findings. No sideways scroll on the iPhone 13, Pixel 5, 360 x 740 or landscape. The T395 keyboard check (receipt Arrive focused, viewport 40 percent shorter) was not repeated; the receipt is unchanged apart from its 44 px sizing. Nothing depends on hover. Safe areas still emulate as 0 px (T405-e). Highlights scroll in a strip with a Show all button. WebKit hung when every fold was open (the map), so the iPhone was measured with folds closed.

Screenshots (JPEG 80, viewport only) are in C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destination\: V5-city-top-iphone, V5-city-receipt-iphone, V5-city-landscape-iphone, V5-month-android, V5-routes-fold-android, V5-town-empty-android, V5-city-top-desktop, V5-city-side-desktop, V5-routes-fold-desktop, V5-town-top-desktop. The landscape shot was taken before the final credit fix.

## What broke and how it was fixed

I ran `git stash` in my worktree to compare lint baselines. The stash is shared by every worktree, so it crossed with the shell session's (T401) and each tree received the other's changes. My work was already committed in 10443da, so nothing was lost; I restored my tree from a patch. The shell session's changes are in wt/_scratch/T405/theirs-shell.patch. Lesson: never stash in a wave.

The design lint flagged the new PDF palette hex lines; the palette is now read from tokens with the old object as fallback. The credit link squeezed to 6 px in a landscape slide; it now keeps a tap target.

## What is still open

Register rows T405-a to T405-g. Closed: T385-g (hero harness) and T395-h (landscape). T385-i is partly done (tier and bed prices exact); the closed cost summary stays whole euros because it is the same estimate as the day figure.

## Choices where impeccable would ask

Refinement only. Prices use two decimals as the brief says, so a whole-euro figure prints with .00. The day figure, an estimate, stays whole. The landscape gallery is exactly 40 percent, which leaves a thin photo; the rule won over the picture.

carta-design's seven questions: 1. No hex outside the PDF fallback (baselined). 2. No gradient, no new colour. 3. Ochre unchanged, no teal. 4. Mono only for measured prices and the position. 5. One primary still "Set your dates"; the notice is ink on paper-dim. 6. New strings are plain, with no em dashes or middots. 7. Removed: sideways scrolling tabs, the silent copy after a cancelled share, English-only labels, the old PDF colours.

## Rollback procedure

Revert the app commits on master after the merge (`git revert`, newest first), or drop the branch; revert the root report commit and the plan commit. No data, migration, storage key or production touched.
