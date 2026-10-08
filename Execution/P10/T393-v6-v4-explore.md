# T393: visual and dynamic: Explore (the map tab)

## Task ID

T393 (design wave V4, session 3 of 10). Branch `p10-v6-visual-explore` in both repos.

## Date

2026-10-08

## What changed

Explore now answers the traveller's input and shows more prices per screen, inside the locked palette. The plan is docs/design-v6/plans/V4-explore.md, committed before the first app edit (1624381c1). Its critique of the V3 result ran dual-agent as impeccable's critique.md requires: a design review and a detector pass in two isolated sub-agents, plus this session's own browser walk. It scored 26 of 40 (23 in V1). The detector found nothing; the debt was in the older stylesheets: animated shadows, hover lifts, photo zoom, literal durations and accent on non-actions.

The card preview is now a paper popover, not an ink panel over the photograph. It is `--bg-card` with a `--rule` border, 10 px radius and `--shadow-2`, and is 320 px wide. It sits beside the card where the column has room, otherwise under it. It opens on hover after 150 ms, on focus after 400 ms (so a Tab walk no longer strobes) and on the info control at once. Escape or a tap elsewhere closes it, and a tap-opened popover scrolls itself into view. It no longer repeats the name and score the card shows. It adds a twelve-cell month strip from the shared MonthStrip, with best months filled `--ink` and the chosen month outlined 2 px `--ink`. It also adds a thin cost bar (bed and food in the ink ramp, 8 px) above the compact receipt. Length of stay is one line (the role is now its short word).

Every grid card is one size at 3:2 (16:10 on the phone two-up), four across at 1280. A filtered desktop screen now shows 8 priced cards instead of 2. The plan's two-size mosaic was tried first and dropped: the rating sort leads with exactly the large cards, so the first screen held 3 figures. The verdict seal leaves rail cards and grids already filtered to a tier. Fraunces sizes are on the house scale: card and rail card names 19 px, rail titles 22/26 px, desktop h1 40 px.

The accent is spent once:
- Filter chips are `--paper-dim` with ink and a rule border.
- "See all" and the side "Clear all" are ink underlined links.
- The gauge is ink, with only the cheapest band green.
- A selected card has a 2 px ink edge.
- Fold and Filters counts are the house count chip.
- The open preview's info control is `--ink-fill`.

Explore's own Lifestyle door is gone, because the shell's settings line (T381) now carries Lifestyle on both widths. The month select now defaults to the month of the traveller's own dates from the settings line.

Motion now states change and nothing else:
- The count and every card and rail figure settle in place through `useSettledFigure` when they change, for example after a Lifestyle change.
- The grid dims to 0.6 while a filter change is pending (`useDeferredValue`, no spinner).
- Chips enter with opacity and scale over `--dur-1`.
- The map canvas crossfades in over `--dur-3` once its style has drawn.
- A pin that becomes the cheapest settles from scale 0.9 over `--dur-1`.
- Labels now follow the zoom at `zoomend` rather than waiting for the tiles.
- Cards and rail cards no longer lift, zoom or animate a shadow. Hover is a border colour inside `@media (hover: hover)`.
- Every rule has a reduced-motion branch.

Price labels no longer overlap. They are placed cheapest first, then by rating, and a label that would collide stays a dot that is still a keyboard stop. Rails show their position ("1 to 4 of 12") in mono: in the head on desktop, under the strip on a phone. They snap per card, Left and Right move focus card to card, and the arrows disable at the ends.

On autonomy: impeccable ran unattended under the owner's instruction of 2026-10-07, so critique's closing questions were skipped. Every open choice kept Carta's palette, type and identity, and is written in the plan. Impeccable context resolved the app repo as the project and reported NO_PRODUCT_MD (row T372-g). PRODUCT.md and DESIGN.md were read directly.

## Files touched

Root repo (`p10-v6-visual-explore`):

**Created:**
- docs/design-v6/plans/V4-explore.md (commit 1624381c1)
- Execution/P10/T393-v6-v4-explore.md

**Modified:**
- Execution/_OPEN.md (rows T393-a to T393-k; T383-a, T383-c, T383-e and T370-g closed by T393)

App repo (`continent-app/`, `p10-v6-visual-explore`, commit 66c6344):

**Modified:**
- src/browse/ExploreTab.jsx, src/browse/ExploreMap.jsx, src/browse/ExploreRails.jsx
- src/components/CostSummary.jsx
- src/styles/62-v6-explore.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (two keys each: `explore.bestMonths`, `rail.position`)
- scripts/verify_explore.mjs: the Lifestyle check reads the settings line; two new popover checks.
- scripts/verify_keyboard.mjs: the lifestyle case's selector moved to the settings line part.
- Each changed assertion carries a comment; none was deleted.

Every app file is owned by 'explore' in docs/design-v6/OWNERSHIP.md, apart from the i18n files (explore prefixes) and harnesses. `node scripts/check_ownership.mjs` passes. No new src file.

## Commands run

In the app worktree, with a scratch vite config that only moves `cacheDir` out of the shared node_modules (`wt\_scratch\T393\vite.t393.mjs`):

```
npx vite --config ../_scratch/T393/vite.t393.mjs --port 5203 --strictPort      # before walk and build iterations
npx vite build --config ../_scratch/T393/vite.t393.mjs
npx vite preview --config ../_scratch/T393/vite.t393.mjs --port 5203 --strictPort --host 127.0.0.1
npm test; npm run lint; node scripts/ci/design-lint.mjs
node scripts/check_ownership.mjs "C:/Users/Gebruiker/Documents/Portfolio/wt/T393/docs/design-v6/OWNERSHIP.md"
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
sh ".../impeccable/scripts/impeccable" detect --json <ExploreTab, ExploreMap, ExploreRails, CostSummary, 62-v6-explore.css>
rm -rf dist dist-data
```

The harnesses ran from `wt\_scratch\T393\h\`, a copy of the scripts beside a junction to the T383 scratch install of playwright 1.63 (row T393-i). The shared install's playwright 1.61 wants a browser build the cache does not hold. The runs were verify_explore, verify_shortlist, verify_map_size_cards, verify_fare_provenance, verify_keyboard (`--port 5203`) and verify_quality_floor (`--only=explore`). The scratch scripts are look.mjs (the before and after measures and the screenshots), phone.mjs (the phone checks) and top.mjs (the first priced card).

## Config and secrets set

None.

## Before/after measurements

Before is the merged V3 state (app master e2d9e1e) on this worktree's dev server; after is this branch.

| Metric | Before | After | Delta |
|---|---|---|---|
| Euro figures inside the first screen, filtered grid (`?xb=80`), 1280 x 800 | 2 | 8 | +6 |
| Euro figures inside the first screen, filtered grid, Pixel 5 / 360 x 740 | 4 / 4 | 4 / 4 | 0 |
| Preview area over the card's photograph, 1280 | 162,518 px² (all of it) | 0 | removed |
| Preview area over the photograph, Pixel 5 / iPhone 13 | 23,100 / 22,707 px² | 0 / 0 | removed |
| Preview fill | rgb(13, 18, 30) | `--bg-card` | paper |
| Month strip and cost bar in the preview | no / no | yes / yes | +2 |
| Price labels at zoom 8 near Venice, overlapping pairs | 19 labels, 8 pairs | 13 labels, 0 pairs | -8 pairs |
| Pins emphasised as cheapest | 1 | 1 | 0 |
| Grid photo shapes in use | 4 (21:9, 16:10, 4:3, 1:1 in the CSS) | 1 per width (3:2; 16:10 on the phone two-up) | -3 |
| Fraunces sizes off the house scale on Explore selectors | 10 (assessment B) | 0 on cards, rail cards, rail titles and the h1 | -10 |
| Accent on non-actions on the idle grid | chips, See all, Clear all, dearest gauge band, selected card, open info control | none | -6 |
| Lifestyle doors on Explore | 2 (settings line and the input row) | 1 (settings line) | -1 |
| First priced card top, Pixel 5 | 281 px in V3 (before the settings line) | 327 px (the shell's settings line adds 45 px) | +46 |
| Impeccable detector findings, changed files | 0 | 0 | 0 |
| Design lint new violations | 0 (194 baseline) | 0 | 0 |
| npm run lint errors | 0 | 0 | 0 |
| npm test | 367 pass (base count not re-run) | 367 pass | |
| verify_explore | 72/72 in V3 | 72/74 | +2 new popover checks; the 2 failures are on the destination page (row T393-a) |
| verify_map_size_cards | 17/17 in V3 | 17/17 | the zoom-5 check passed only after labels followed `zoomend` |
| verify_shortlist | all passed | all passed | 0 |
| verify_fare_provenance | OK | OK | 0 |
| verify_keyboard | 20/20 in V3 | 19/20 | all four Explore cases and lifestyle pass; journey @380 fails, trips surface (row T393-j) |
| Quality floor, explore flow | | every floor check 0 (9 screens); desktop targets under 44 px 359, owner decision T193-b, fine pointer | |

Phone checks were run on iPhone 13 (WebKit), Pixel 5 (Chromium) and 360 x 740 (Chromium with touch).
- **Scroll and landscape.** No sideways page scroll in portrait or in landscape (844 x 390 class).
- **On-screen keyboard.** With the search field focused and the height cut by 40 percent, the field stays visible: its bottom at 154 px against viewports of 398, 436 and 444. The bottom nav starts below it (312, 350 and 358 px).
- **Tap only.** The popover opens from the info control and a tap elsewhere closes it, on both engines. Nothing depends on hover.
- **Tap targets.** In the first screen of `.explore-tab`, the only controls under 44 px are the two "See all" links (61 x 22). Their 44 px tap box is a pseudo-element in 25-feature-pages.css, and the quality floor counts 0 phone targets under 44.
- **Safe area and thumb reach.** The feed's end padding includes `env(safe-area-inset-bottom)` (84 px at rest). The List/Map switch stays in thumb reach at the bottom.
- **Swipe.** No swipe-only action: rails also page with arrows and keys, and every rail has "See all".

Desktop and motion checks:
- **Rail keys.** Five presses of Right on a rail moved focus to card 6 and the position from "1 to 4 of 12" to "2 to 5 of 12".
- **Reduced motion.** With `prefers-reduced-motion: reduce`, the popover and the chips run no animation.

The after screenshots are in `design-v6-shots\explore\`, nine in all, JPEG at q80, viewport only:
- grid: V4-grid-iphone, V4-grid-android, V4-grid-desktop
- filtered: V4-filtered-android, V4-filtered-desktop
- preview: V4-preview-android, V4-preview-desktop
- map: V4-map-desktop, V4-map-iphone

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Phone grid tracks grew to 257 and 346 px | A card with `overflow: visible` (needed so the popover can sit outside it) sizes its grid track to its content | Tracks are `minmax(0, 1fr)`, cards `min-width: 0`, the split view re-declared |
| Phone popover opened to the side of the card | `.xpop--below` lost to the base popover rule on specificity | The side rules carry `.xcard-preview` too |
| verify_map_size_cards: 18 labels still on the map at zoom 5 | Labels followed `idle`, which took over 2.5 s at 1500 x 980 on a loaded machine | The zoom state also updates on `zoomend` |
| Two-size mosaic gave 3 figures at 1280 | The rating sort leads with the large cards | One size, 3:2 (recorded above) |
| Phone rail head grew to two lines of subtitle | The position took a column beside it | On a phone the position sits under the strip |
| The session was cut off once mid-harness | Orchestrator restart | Resumed: rebuilt, re-ran every harness |

## What is still open

The two destination-page checks in verify_explore fail on this build: the first section is not the one that opens, and there is no map canvas on the page. No destination file is in this diff; the destination surface should confirm against master (T393-a).

Some sheet and chip motion belongs to other surfaces. Chips leave without motion because the exit needs FilterChips, the shell's file (T393-b). The sheet rise and fall belong to PlacesFilterSheet (destinations) and the Lifestyle dialog (shell) (T393-c).

The shortlist star still fills with the accent, here and wherever FavStar draws it. That conflicts with the selected-state rule, and it needs a house decision (T393-d, owner).

Two items need the owner. The de, es, fr, it and nl strings for the two new keys need a native read (T393-e). The real-phone list goes into one row (T393-f): the popover scroll under real momentum, rail snap momentum, the system reduced-motion setting on iOS and Android, and the 100dvh map against the real address bar.

The label collision box is estimated from the text length. Measuring would be exact, and V5 can also make the map count and the labels count one set (T393-g, with T383-f).

The old Explore rules in 24-destination-workspace.css and 25-feature-pages.css are overridden from the v6 sheet, not moved. Moving and deleting them under OWNERSHIP rule 5 is V5 clean-up (T393-h).

The shared node_modules carries a playwright whose browser build is not installed (T393-i). The journey page has one ring-less stop at 380 (T393-j, trips). A long country name on a phone two-up card can drop to the flag alone (T393-k, V5-4).

Row T381-b stays open for its Destinations part; Explore's half is done here. Row T385-h is answered for its CostSummary part only: "Change" now has a 44 px box on a coarse pointer, from 62-v6-explore.css. The rest of that row belongs to other surfaces.

## Carta-design's seven questions

1. No hex value outside `:root`. The v6 sheet uses tokens only, including the cost bar's `--kind-metro` and `--kind-city`.
2. No gradient, no new colour, no second saturated hue. The accent now marks only the cheapest pin and focus rings on this surface.
3. Ochre stays on scores and seals, teal on gems, and `--danger` is unused. Green appears only as the cheapest gauge band, as good news in data.
4. Mono is used for measured facts only: the count, figures, the rail position and the month strip initials. "Best in May", "a day" and "national" are `--ui`.
5. One primary per view at most; the quality floor counts 0 views with more than one.
6. The new strings ("Best in {months}", "{from} to {to} of {n}") carry no em dash, no middot and no banned word. The rail headline "Under €85 a day in Oct" carries a number.
7. Removed: the ink preview panel and its row cascade, Explore's second Lifestyle door, the seals on rails and tier-filtered grids, card and rail-card hover lifts and photo zoom, three mosaic shapes, and six accent uses.

## Rollback procedure

Nothing is deployed and no data or schema changed. Before merge, delete the branch `p10-v6-visual-explore` in both repos. After merge, revert the merge of the app branch (or commit 66c6344) in continent-app. In the root repo, revert the report commit and 1624381c1; that also reopens T383-a, T383-c, T383-e and T370-g in `_OPEN.md`. URLs are unchanged: no URL key was added or removed.
