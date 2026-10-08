# T385: structure, information and flow on the Destination (town) page (design wave V3)

## Task ID

T385

## Date

2026-10-08

## What changed

The destination page now runs in the order a traveller asks their questions. On a phone it goes: head, fact strip, receipt, cost at your Lifestyle, the month block, getting there, walk and ride from here, things to do, the highlights map, trips, villages inside, rating, sleep, tips, festivals, parking, webcams, what to bring, explore further, a page-end utility row, and then the honest footer. From 1020 px the receipt, cost, month and getting there sit at the top of the right column, and the main column starts at walk and ride.

The head has one row of three actions: Plan a trip here, Shortlist and Plan a day here. There were seven. Share is only in the bar now. Download PDF guide and Report a problem moved to the page-end row (DIRECTION.md "destination 4"). Open in Google Maps moved into the map fold. The fact strip keeps the two cost facts, each named for its basis ("A day at your Lifestyle", "Beds from"). The sights hours joined the visit line ("Worth about 2 days, about 17 h of sights"), and the best months moved into the month block.

The month block is one fold. It holds When to go, this week's forecast, the crowd badge and the water badge. Its closed summary gives the answer ("best Apr, May, quiet"). ClimateStrip prints each month's high, low and rain as text in mono, so a phone needs no hover, and it outlines the receipt's month at 2 px `--ink` (carta-design "Month"). Getting there leads with the car-free answer: transit verdict first, then the airport transfer, then the car.

Routes from here and Around are now one fold, "Walk and ride from here". Routes come first, then the 20 km inventory under them, and one empty line when there is neither. The shared SectionRail replaces `.destp-subnav` (closes T165-b). Expand all moved to the page bar. It still has the class `destp-subnav-all`, and it also opens the empty folds. Open folds are remembered per destination for the session, in sessionStorage behind try/catch (DIRECTION.md "Remembered state"). Fold titles now carry a verb or a number, the Around summary uses singulars ("1 lake"), and the pack summary lost its colon. That added 22 `dest.*` strings in six catalogues. The airport qualifier is gone from the receipt's place and from the first caption ("Rome", not "Rome (Fiumicino)"). What to bring now packs for the receipt's arrive month.

Both day-cost bases stay on the page, each with its label, because T374-d is still the owner's decision. The cost fold lost its rounded trip total and its second price report button.

The first run stopped on a usage limit after the plan commit and the main app commit. This run found the app worktree clean and checked all eleven plan items against the code. It ran every check and harness, and found one regression: the German cost fold title ran 2 px wide at 360 px. A wrap rule fixed it (app commit 0f7aee5). Then the ten after screenshots were taken again on the final build.

## Files touched

All app paths are in `continent-app/` (branch p10-v6-build-destination, commits e994422 and 0f7aee5). Every src file is owned by `destination` in docs/design-v6/OWNERSHIP.md. `node scripts/check_ownership.mjs` passes.

**Modified (app):**
- src/browse/DestinationPage.jsx (order, action row, month block, walk and ride fold, SectionRail, remembered folds, baseCity, pack month, utility row)
- src/browse/ClimateStrip.jsx (`month` and `figures` props: every month's high, low and rain as text, the chosen month outlined)
- src/browse/GettingThere.jsx (transit verdict first)
- src/browse/AroundHere.jsx (singular summaries)
- src/styles/64-v6-destination.css (all new rules: the desktop grid placement, the action row, the utility row, the subheads, the month figures, safe areas, wrapping fold titles)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (22 `dest.*` keys each)
- scripts/verify_destination_page.mjs, scripts/verify_routes_block.mjs, scripts/verify_stay_tiers.mjs (CARTA_PORT; the assertions that encoded the old default fold and the old empty-routes rule were updated with comments, none deleted)

No line of src/styles/24-destination-workspace.css or 18-detail-panel.css changed, so this branch cannot conflict with T384's move of the `.places-*` rules out of 24.

**Modified (root):**
- docs/design-v6/plans/V3-destination.md (the plan, commit 79b5a9820)
- Execution/_OPEN.md (rows T385-a to T385-i; T165-b and T281-a closed)

**Created (root):**
- Execution/P10/T385-v6-v3-destination.md

## Commands run

In the app worktree, with the private install from wt/_scratch/T385/deps behind the node_modules junction:

```
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
node scripts/check_ownership.mjs ../T385/docs/design-v6/OWNERSHIP.md
node scripts/ci/design-lint.mjs
npm run lint
npm test
npm run build
npx vite preview --port 5205 --strictPort
CARTA_PORT=5205 node scripts/verify_destination_page.mjs
CARTA_PORT=5205 node scripts/verify_routes_block.mjs
CARTA_PORT=5205 node scripts/verify_stay_tiers.mjs
node scripts/verify_transport_links.mjs
node scripts/verify_hero_images.mjs http://127.0.0.1:5205/
node scripts/verify_keyboard.mjs --port 5205
node scripts/verify_quality_floor.mjs T385 --port=5205 --out=<wt/_scratch/T385/qf>
sh .../impeccable detect --json src/browse/DestinationPage.jsx src/browse/ClimateStrip.jsx src/browse/GettingThere.jsx src/browse/AroundHere.jsx src/styles/64-v6-destination.css
```

The phone walk and the screenshots came from scratch scripts outside both repos: wt/_scratch/T385/measure2.mjs and phone2.mjs. They use Playwright device descriptors: iPhone 13 on WebKit, Pixel 5, 360x740 with isMobile and hasTouch, iPhone 13 landscape, and desktop 1280x800. After each build, the preview was stopped and dist/ and dist-data/ were deleted.

## Config and secrets set

None. One new browser key, `carta.destFolds.v1` in sessionStorage. It is a per-viewer convenience, and the page opens on its defaults without it.

## Before/after measurements

Before figures come from the V1 walk in docs/design-v6/briefs/destination.md, part 2: Rome at 380 px and 1280 px, folds closed. After figures come from this session's walk on the built preview, with Rome (FCO) on an iPhone 13 (390 px) and at 1280 px. The phone widths differ by 10 px.

| Metric | Before | After | Delta |
|---|---|---|---|
| Controls in the head | 7 | 3 | -4 |
| Share buttons on the page | 2 | 1 | -1 |
| Report buttons on the page | 3 | 2 | -1 |
| Folds, Rome | 16 | 14 | -2 |
| Controls on the closed page, Rome phone | 76 | 39 | -37 |
| Under 44 px on the closed page, Rome phone | 9 | 4 | -5 |
| Receipt top, Rome phone | 1,006 px | 683 px | -323 px |
| Receipt top, Rome 1280 | 685 px | 536 px | -149 px |
| Closed page height, Rome phone | 3,498 px | 2,980 px | -518 px |
| Month block header, Rome phone | not measured | 1,571 px (2.6 screens of 611 px) | |
| Head labels cut off at 360 px, English and German | labels truncated (brief) | 0 | |
| Sideways scroll at 360 px, six languages | 52 px at 390 on a built dist (T281-a) | 0 px in all six | closed |
| verify_keyboard.mjs | 20 of 20 (T364) | 20 of 20 | 0 |
| impeccable detect on the five changed files | 0 | 0 | 0 |
| design-lint new violations | 0 | 0 | 0 |

Harness results on the final build: verify_destination_page all checks passed (58 PASS lines), verify_routes_block 19 of 19, verify_transport_links 43 of 43, verify_stay_tiers OK (its tier-chip block reports SKIP as it did before: the page has no `.cost-group`), verify_keyboard 20 of 20, `npm test` 341 of 341, `npm run lint` 0 errors (70 warnings, none new; the unused `credits` in DestinationPage.jsx was already there). verify_hero_images fails 2 of 7, which was already the case (row T385-g). verify_quality_floor: on the destination screens the four 28 px receipt controls (FirstRunReceipt.jsx, landing), the Change button (CostSummary.jsx, explore) and one 4.46:1 summary on the ochre tips tint (25-feature-pages.css) are all in files this surface does not own (row T385-h). The other 35 usage contrast fails and the other phone screens belong to other surfaces.

Phone findings. There is no sideways scroll on the iPhone 13, the Pixel 5, at 360x740 or in landscape (844x390 class, 750x342 viewport). Nothing needs a hover: the climate figures are text, and the hover tip only remains where `figures` is off. With the receipt's Arrive input focused and the viewport 40 percent shorter, the input stays in view and on top on all three phones. The bottom nav sits behind the full-screen page and never covers it. The page is `position: fixed; inset: 0`, so it follows the dynamic viewport without any 100vh. The bar and the scroll area now pad by `env(safe-area-inset-*)`. Emulation reports 0 px insets, so a real phone has to prove them (T385-f). Exactly one accent-filled control is in view ("Set your dates"), at 1,258 px on the iPhone. Every head action is 44 px tall in English and German. A swipe is never the only way: the gallery has Previous and Next buttons, and the rail has anchors.

Screenshots (after, JPEG quality 80, viewport only) are in C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destination\: V3-city-top-iphone, V3-city-top-desktop, V3-city-receipt-iphone, V3-city-side-desktop, V3-city-landscape-iphone, V3-month-android, V3-routes-fold-android, V3-routes-fold-desktop, V3-town-empty-android (Zungoli at 360) and V3-town-top-desktop.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The German page scrolled 2 px sideways at 360 px | The new title "Was ein Tag mit deinem Lifestyle kostet" is `white-space: nowrap` (.dsec-title in 25-feature-pages.css), so it pushed the chevron past the edge | `.destp .dsec-title` wraps in 64-v6-destination.css (app 0f7aee5); 0 px in all six languages, expanded too |
| verify_destination_page expected the map open by default | The old design opened Highlights first; the month block is now the one default-open fold | Assertion updated with a comment; the map checks run after Expand all |
| verify_routes_block expected no `#sec-routes` on an empty place | Around is now inside that fold | It now asserts no route row, with a comment |

## What is still open

Brief V3-1, one cost truth, is not built. The page keeps both day figures and labels each one, because T374-d is the owner's decision. The merge would also need additive props on FirstRunReceipt.jsx (landing) and a recount in HonestFooters.jsx (destinations) (T385-a).

SectionRail has no trailing slot, so Expand all sits in the bar and is not the rail's last item (T385-b).

The month block header lands at 2.6 phone screens, not the brief's two, because the receipt (about 800 px, landing's) and the cost fold sit above it (T385-c).

MonthStrip (shell) was not adopted because its contract has no high, low or rain. ClimateStrip carries the house month rule instead (T385-d).

Native review of the 22 new strings is open (T385-e). So are the real-phone checks (T385-f). The hero harness was already broken (T385-g). The quality floor items sit on other surfaces' files (T385-h). Small copy, rounding and focus leftovers are in T385-i.

T380-e: the settings line (T381) was not in this branch. The page reads the month from the receipt's shared dates (`useFirstRun()`), which the settings line will set. The page never had its own month select, so there was none to keep.

Choices made where impeccable would have asked (the owner's proceed instruction of 2026-10-07): refinement, never a new direction. The month block built on ClimateStrip and not MonthStrip, to stay inside this surface's files. The cost fold stays as a labelled Lifestyle view and does not fold into the receipt, because picking one basis is T374-d. The page-end row and the remembered folds follow DIRECTION.md part 9 (destination 4 and 8, accepted).

carta-design's seven questions, answered on the diff 61449ab..0f7aee5:

1. No hex value. Every colour in 64-v6-destination.css is a token.
2. No gradient, no new colour, no second saturated hue. The month outline is `--ink`.
3. Ochre stays on the score and verdict, the tips tint was already there, and there is no teal or `--danger` in the diff.
4. Mono carries only measured facts: each month's high, low and rain. The climate key above them is prose in `--ui`.
5. One primary in every view measured ("Set your dates"). Plan a trip here, Shortlist and Plan a day here are secondaries.
6. The fold titles carry a verb or a number ("Walk and ride from here", "See the highlights on the map", "Read the insider tips", "N festivals and events", "What a day costs at your Lifestyle"). The subhead "This week's forecast" does not, and is filed in T385-i. The diff has no em dashes, no middots and no banned words.
7. Removed: the head Share, the head PDF and report, the rounded trip total, the second price report button, the Sights fact and the Best months fact.

## Rollback procedure

App: `git -C continent-app revert 0f7aee5 e994422` on master after the merge (or drop the branch before it). Root: `git revert` the report commit and 79b5a9820. After the revert, the T165-b and T281-a rows read open again and the T385 rows go away. Nothing touches data, migrations or production. The sessionStorage key goes unused after a rollback and is harmless.
