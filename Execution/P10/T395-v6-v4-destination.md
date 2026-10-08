# T395: visual and dynamic on the Destination (town) page (design wave V4)

## Task ID

T395

## Date

2026-10-08

## What changed

The destination page now looks like one instrument. It no longer reads as a stack of cards. The folds are sections under a `--rule-soft` hairline, with no box, no radius and no shadow. Their icons are `--ink-soft`. Their titles take the 19 px row-name size, and a hover underlines the title in ink instead of turning it terracotta. When a fold opens, its chevron turns and its body fades and rises 4 px in `--dur-2`. Both moves have a reduced-motion branch. The receipt is again the page's one bordered object. The tips fold lost its ochre fill, because a tip is not a rating.

The fact strip is a timetable row now: the label sits over the value, with hairlines between the cells and the figure in tabular mono. The day figure settles in place through `useSettledFigure()` when the Lifestyle reprices it. That is one opacity dip in `--dur-2`, with no count-up.

The map and the highlight tiles now follow each other both ways (carta-design "Map and list in sync"). A tile under the pointer or in keyboard focus rings its pin 2 px `--ink`. A pin under the pointer or in focus outlines its tile. A click or tap on either one commits the selection. That highlight's number badge is the only accent on the map, mirrored on its tile, and the camera eases to it with `durationMs('--dur-4')` when it is out of frame. All the other badges are `--ink-fill`. The town dot and the trip dots are ink. The map's fit duration reads the token instead of `450`.

Building the sync turned up an older fault. Every hover on a tile rebuilt all the map markers, because the parent passed new arrays and new callbacks on every render. DestMap now reads its rows and callbacks through refs and rebuilds the markers only when their content changes. Without that fix, a pin lost keyboard focus the moment it took it.

The month strip is drawn as data in the ink ramp. Comfort is shown by the bar's height and its weight (`--ink`, `--kind-town`, `--kind-village`, `--rule`). The best months get a bold initial and the existing "Best weather" words. There is no hue, no ring, no hover filter and no four-dot legend. The key line above the strip says what the shade means. The chosen month keeps its 2 px ink outline.

Every photograph has a solid paper caption band flush under it. The band holds the place name, the position in mono ("1 of 8") and the credit as text ("Diliff, CC BY 3.0", linked to the Commons file). No pill, count or disc sits on a photo any more. The band is `--tap` high on a coarse pointer, so the credit is a real target. The photo track takes the arrow keys when it has focus. A single photograph now fills the whole band instead of leaving two thirds of it empty (Zungoli).

The small marks share one family. The evidence meter is an ink thin bar. The do-type chips, the season line, the festival month chip and the UNESCO chip are ink on `--paper-dim`. "Book ahead" is an amber caution with the AlertIcon, where it used to be an ochre note with a "!" disc. The city's own parking check is ink with a status dot instead of a green box, and a parking restriction is amber instead of `--danger`. Ochre stays on the score, the verdict word, the rank and the rating fold.

The insider tips run on the shared flashcard deck, with Previous, Next, the position, the arrow keys, Show all, and the list on print. While the dossier loads, a still `--paper-dim` block holds the place of the receipt and folds, with "Loading" for screen readers only. Link and card hovers go to ink, never to the accent, and only inside `@media (hover: hover)`. The do-card hover lift is gone. Presses keep the global touch feedback from 02-base.css.

## Files touched

App paths are in `continent-app/`, branch p10-v6-visual-destination, commits bb4adaf and ed86cd3. Every src file belongs to `destination` in docs/design-v6/OWNERSHIP.md or is an i18n catalogue, and `node scripts/check_ownership.mjs` passes.

**Modified (app):**
- src/browse/DestinationPage.jsx (hover and selection state for the highlights, the settling day figure, the caption band and the photo-track keys, the tips deck, the loading block, the book-ahead icon)
- src/browse/DestMap.jsx (hover ring and committed accent, pin hover and focus call back to the tiles, the camera eases to the selection, token durations, markers rebuilt only on a content change)
- src/browse/ClimateStrip.jsx (no legend when the figures are drawn)
- src/styles/64-v6-destination.css (all the new rules, under "T395 (V4)")
- src/styles/24-destination-workspace.css (rules this surface owns, edited in place: pin badge and dot in ink, the UNESCO and festival chips in ink, the photo disc, the count and the old ochre tips list deleted)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (`dest.climateKey` reworded: what the shade means)
- scripts/verify_destination_page.mjs (two assertions updated with a comment: the tips are deck cards now, and the Explore tab is a link since the shell's V3)

**Modified (root):**
- docs/design-v6/plans/V4-destination.md (the plan, commit b9ef53398)
- Execution/_OPEN.md (rows T395-a to T395-i)

**Created (root):**
- Execution/P10/T395-v6-v4-destination.md

## Commands run

In the root worktree: `impeccable context --target ../T395-app/src/browse/DestinationPage.jsx`. It resolved the app repo as the project root and so found no PRODUCT.md or DESIGN.md, so both were read directly. Then the critique ran as two isolated sub-agents. A was the design review, and finished before B was read. B was `impeccable detect --json` over 17 files plus the design lint.

In the app worktree:

```
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
node scripts/check_ownership.mjs ../T395/docs/design-v6/OWNERSHIP.md
node scripts/ci/design-lint.mjs
npm run lint
npm test
npm run build
npx vite preview --port 5205 --strictPort --host 127.0.0.1
CARTA_PORT=5205 node scripts/verify_destination_page.mjs
CARTA_PORT=5205 node scripts/verify_routes_block.mjs
CARTA_PORT=5205 node scripts/verify_stay_tiers.mjs
node scripts/verify_transport_links.mjs
node scripts/verify_hero_images.mjs http://127.0.0.1:5205/
node scripts/verify_keyboard.mjs --port 5205
node scripts/verify_quality_floor.mjs T395 --port=5205 --out=<wt/_scratch/T395/qf>
sh .../impeccable detect --json src/browse/DestinationPage.jsx src/browse/DestMap.jsx src/browse/ClimateStrip.jsx src/styles/64-v6-destination.css src/styles/24-destination-workspace.css
```

Before the orchestrator installed the matching browsers, the harnesses ran with a scratch preload, wt/_scratch/T395/pwfix.mjs, which points Playwright at the cached builds. The final runs needed no preload. The phone walk (phone.mjs), the map sync check (sync.mjs) and the screenshots (shots.mjs) are scratch scripts in wt/_scratch/T395, outside both repos. The dev server, the preview and every browser were stopped, and dist/ and dist-data/ were deleted.

## Config and secrets set

None.

## Before/after measurements

Before is the merged V3 state: the screenshots in wt/_scratch/T395/before and the code at app e2d9e1e. After is the final build, measured on Rome (FCO) unless a row says otherwise.

| Metric | Before | After | Delta |
|---|---|---|---|
| Folds drawn as a shadowed, rounded card | every fold (14 on Rome, T385 count) | 0 (phone walk, `foldShadows`) | -14 |
| Accent marks on the map at rest, highlights layer | 13 (12 number badges and the town dot, `.dmap-pin-n` and DestMap's inline accent) | 0 | -13 |
| Accent marks on the map with one highlight chosen | 13 | 1 | -12 |
| Hues in the month strip | 4 plus a four-dot legend | 0 (four steps of the ink ramp), no legend | -4 |
| Text drawn on a photograph, per slide | 3 (caption pill, count, credit disc) | 0 (`onPhoto` 0 on all four phones) | -3 |
| Photo credit shown as text | 0 (tooltip on a 12 px icon) | author and licence on every slide | |
| Map and list linked | one way (a pin click scrolls a tile) | both ways, by mouse, touch and keyboard (sync.mjs: tile hover rings pin 1, pin hover outlines tile 3, pin focus outlines tile 5, Enter selects it) | |
| Ochre on non-rating marks | 8 (UNESCO, festival month, festival type, season, evidence meter, book ahead, tips fill, tips icon) | 0 | -8 |
| impeccable detect, changed files | 0 | 0 | 0 |
| impeccable detect, the 17 surface files | 7 (side-tab, all in 18-detail-panel.css) | 7 (not touched, T395-d) | 0 |
| design-lint new violations | 0 | 0 | 0 |
| verify_keyboard.mjs | 20 of 20 (T385) | 20 of 20 | 0 |
| Receipt top, iPhone 13 | 683 px (T385) | 692 px | +9 px |
| Month block top, iPhone 13 | 1,571 px (T385) | 1,572 px | +1 px |

Harness results on the final build: verify_destination_page all checks passed (58 PASS lines), verify_routes_block 19 of 19, verify_transport_links 43 of 43, verify_stay_tiers OK, verify_keyboard 20 of 20, `npm test` 367 of 367, `npm run lint` 0 errors (61 warnings, none new), design lint 0 new (194, all baselined). verify_hero_images still fails 2 of 7, as it did before (row T385-g). verify_quality_floor on the destination screens reports small=4 and 5, which are the receipt's 28 px selects and dates (T385-h, landing's file). It reports contrast=0 where T385 had 1, because the ochre tips tint is gone, and monoProse=1. The full quality-floor run stopped at the trip planner on desktop with "Page crashed", a memory limit on this laptop with five sessions running, which is not this surface.

Phone findings. There is no sideways scroll on the iPhone 13, the Pixel 5, at 360x740 or in landscape (750x342 viewport). The page has exactly one accent-filled control, "Set your dates", at 1,285 px on the iPhone. With the receipt's Arrive input focused and the viewport 40 percent shorter, the input stays in view and is the top element on all four phones. The bottom nav's box overlaps it geometrically but lies under the full-screen page, as before. Nothing depends on hover. The map sync works on a tap, because a tap selects. The tile ring is a hover-and-focus aid. Gestures are shortcuts only: the gallery and the tips deck both have Previous and Next buttons and arrow keys. The caption band is 44 px on a coarse pointer. Emulated safe-area insets are 0 px, so a real phone still has to prove them (T395-f). Landscape counts 9 controls under 44 px against 4 in portrait: the gallery arrows (38 px) and the map layer tabs (28 px) show from 721 px wide. The landscape gallery is 200 of 342 px tall, above the 40 percent hero rule. Both are V5 adapt items (T395-h).

After screenshots (JPEG quality 80, viewport only) are in C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destination\, with the V3 view names: V4-city-top-iphone, V4-city-receipt-iphone, V4-city-landscape-iphone, V4-month-android, V4-routes-fold-android, V4-town-empty-android, V4-city-top-desktop, V4-city-side-desktop (the highlights map, expanded), V4-routes-fold-desktop and V4-town-top-desktop.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Focusing a map pin lost the focus at once, and hover could flicker | DestMap rebuilt every marker on each parent render: the parent passes new arrays and new callback arrows, and the hover state re-renders the parent | Rows and callbacks are read through refs; markers rebuild on a content key (`rowsKey`) only |
| verify_keyboard 19 of 20: the gallery track had no visible ring at 380 px | The scroller's own outline sits under the photographs and at the screen edges | The ring is drawn as a `::after` frame over the gallery while the track has focus; 20 of 20 |
| verify_destination_page failed "Explore card opens the full-screen page" | The harness clicked `button:has-text("Explore")`, and the shell's V3 made the header tab an `<a>` | The selector takes `a` or `button`, with a comment; 58 PASS |
| The tips deck sat on an ochre band | An old `.destp-tips` ochre rule in 24-destination-workspace.css (this surface's) still matched the deck's wrapper | Deleted, with the bullet-list rules the deck replaced |
| Zungoli's single photo left two thirds of the band empty and cut its caption to "Zung..." | A slide is as wide as its photo on desktop | `.destp-slide:only-child` fills the band (app ed86cd3) |
| design lint flagged an `outline: none` I wrote | My first try at the gallery ring | Removed; the outline stays and the frame draws over it |

## What is still open

The receipt is `FirstRunReceipt.jsx`, which is landing's file. Its settle on the total, the cost bar above its lines and the InfoDot on "measured" and "est." (brief V4-2, V4-3 and V4-7) need landing to add props or build them there (T395-a).

`Fold.jsx` (shell's) draws the fold icons at 14 px against the 20 px icon rule. The flashcard track in 33-flashcards.css (shell's) still uses a literal `0.25s ease` (T395-b).

The outdoor pins on the "Within 20 km" layer still take a hue per layer (`LAYER_COLOR`, tokens shared with the outdoor pages), each with its name beside it. Whether those become ink shapes is a V6 consistency call with outdoor (T395-c).

The detector's 7 side-tab findings sit in 18-detail-panel.css, on rules for the day planner and the guide (`.day-intel`, `.day-walk`, `.guide-car-advice` and others). OWNERSHIP rule 5 says their owners move them; this surface does not edit rules it does not move (T395-d).

Native review of the reworded `dest.climateKey` in five languages is open (T395-e). So are the real-phone checks (T395-f).

Brief V4-6, the photograph beside the head from 1024 px, is not built, and this was a choice. The first price is already above the fold at 1280x800 (the fact strip at about 520 to 575 px on Rome, screenshot V4-city-top-desktop), and the three-photo strip is the most visual band on the page; one photo beside the head would make the page less visual. The owner may overrule this (T395-g).

Landscape tap targets and the landscape gallery height go to V5 (T395-h).

Dead rules for classes the page no longer renders sit in 25-feature-pages.css, which is trips' file: `.destp-v2 .destp-gallery-count`, `.destp-v2 .destp-tip-list li`, the old `.dsec-tips` and `.destp-slide-cap` (overridden in 64) (T395-i).

Still open from earlier rows: T385-g (the hero harness, 2 of 7) and T385-h. The ochre-tint contrast item of T385-h is fixed by this task; the receipt controls in it stay landing's.

Choices made where impeccable would have asked (the owner's proceed instruction of 2026-10-07): refinement, never a new direction. The palette, the three faces and the receipt stay. Fold titles took the 19 px row-name size rather than the 22/26 px section size, because the folds are the page's collapsed row list and a 22 px serif title pushes the closed summary out on a 360 px phone. The hero stays above the head (T395-g). The month comfort shades use `--ink`, `--kind-town`, `--kind-village` and `--rule`, so that the four steps stay apart in greyscale.

carta-design's seven questions, answered on the diff e2d9e1e..ed86cd3:

1. No hex value. Every colour is a token, and the rgba discs were deleted.
2. No gradient, no colour outside DESIGN.md, and no second saturated hue. The diff removes green, salmon and ochre from data and chrome.
3. Ochre is now only on the score, the verdict, the rank and the rating fold. There is no teal in the diff. `--danger` left the parking restriction, which is now amber.
4. Mono carries only measured facts: the day figure, the bed price, each month's figures and the photo position. The credit and the captions are `--ui`.
5. One primary in view: "Set your dates". The map's single accent marks a selection, not a button.
6. No headline was added. The diff has no em dashes, no middots and no banned words.
7. Removed: the fold card chrome (14 boxes and shadows), the climate legend, the ring on the best months, the three overlays on each photo, the "!" disc, the do-card hover lift, and twelve accent badges on the map.

## Rollback procedure

App: `git -C continent-app revert ed86cd3 bb4adaf` on master after the merge, or drop the branch before it. Root: `git revert` the report commit and b9ef53398. Nothing touches data, migrations, storage keys or production. After the revert the T395 rows go away, and the V3 look of T385 returns unchanged.
