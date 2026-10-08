# T403: harden, adapt and polish: Explore (the map tab)

## Task ID

T403 (design wave V5, session 3 of 10). Branch `p10-v6-polish-explore` in both repos.

## Date

2026-10-08

## What changed

Explore now keeps the promises its controls make on a phone. The plan is docs/design-v6/plans/V5-explore.md, committed before the first app edit. Its audit was this session's own: the detector, the design lint and a Playwright scan on iPhone 13 (WebKit), Pixel 5 and 360 x 740 (Chromium) and 1280 x 800, in English, German and French. No sub-agent critique was run, because the V4 critique of the same surface is a day old and this wave refines it. Impeccable context again resolved the app repo and reported NO_PRODUCT_MD (row T372-g); PRODUCT.md and DESIGN.md were read directly. The run is unattended under the owner's instruction of 2026-10-07, so every open choice kept Carta's palette, type and identity.

Tap targets. On a touch pointer the card star is now a 44 px box in the card's corner with its 28 px disc drawn inside, the same construction the info control already had. Before, it was a 27 px disc with an invisible ring around it, so its own box did not match its hit area. The info control moved down to sit under it. "See all" has a real 44 px box, pulled back with negative margin so the rail head keeps its height. A mouse keeps 32 px.

Names are whole. Card names and rail card names wrap to a second line before they end in an ellipsis, with a two-line clamp so a card stays bounded. The country line no longer ends in an ellipsis. On a two-up phone card the country and the swim badge now share the place line, the badge wrapping under the country if it must, so Lisbon says "Portugal" again (row T393-k).

Map failure. If the basemap style never arrives (an error before the style loads, or 12 seconds without it) the frame says "The map did not load. The list still works." and offers "Back to the list", which switches the view. A tile error after the style has loaded is not a failure, because the pins are drawn from our own data. Six languages.

Labels from the drawn size. Price-label collision now measures the name and the figure in the label's own fonts through a canvas, instead of 6.6 px a character (row T393-g). The V4 result held: no overlapping pairs in verify_map_size_cards.

The desktop-width map frame uses dvh, not vh, so a collapsing address bar does not change it.

Checked and left alone because they were already right: chips read "Remove ...", the shortlist control says "Show only your shortlist, N saved", pins already say the day cost, the preview opens on focus only after 400 ms, the stale comment named in the brief is already gone, and the Lifestyle door is the shell's.

## Files touched

Root repo (`p10-v6-polish-explore`):

**Created:** docs/design-v6/plans/V5-explore.md, Execution/P10/T403-v6-v5-explore.md

**Modified:** Execution/_OPEN.md (rows T403-a to T403-e added; T393-a, T393-g, T393-i and T393-k closed by T403)

App repo (`continent-app/`, commit 8b79fea):

**Modified:** src/browse/ExploreMap.jsx, src/browse/ExploreTab.jsx (passes `onBack`), src/styles/62-v6-explore.css (a V5 block), src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (`explore.mapFailed`, `explore.mapBack`), scripts/verify_explore.mjs (two assertions, each with a comment).

Every app file is Explore's in OWNERSHIP.md; `node scripts/check_ownership.mjs` passes.

## Commands run

In the app worktree, with a scratch vite config that only moves `cacheDir` out of the shared node_modules (`wt\_scratch\T403\vite.t403.mjs`): vite on 5203; scratch Playwright scripts for the audit, the phone checks, the failure test and the screenshots; the harnesses with `CARTA_PORT=5203`; `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `node scripts/check_ownership.mjs`, `impeccable detect --json` over ExploreMap, ExploreTab and the v6 sheet, the six i18n parses, `vite build` with the scratch config, then `rm -rf dist dist-data`.

## Config and secrets set

None.

## Before/after measurements

Before is the merged V4 state on this worktree's dev server.

| Metric | Before | After |
|---|---|---|
| Interactive elements under 44 px inside `.explore-tab`, touch, iPhone 13, Pixel 5, 360 x 740 (own box) | 51 (48 stars, 3 "See all") | 0 |
| Fine pointer, 1280 x 800, elements under 32 px | 0 | 0 |
| Names ending in an ellipsis on the phone first screens | 11 distinct names | 0 |
| Lisbon card on a two-up phone shows the country | no | yes |
| Failed basemap | blank frame for ever | one line and a way back |
| Horizontal page scroll, any device or language | none | none |
| Impeccable detector findings, changed files | 0 | 0 |
| Design lint new violations | 0 (166 baseline) | 0 |
| npm run lint errors | 0 | 0 |
| npm test | 367 pass (T393) | 368 pass |
| verify_explore | 72/74 | 74/74 |
| verify_map_size_cards, verify_shortlist, verify_fare_provenance | pass | pass |
| verify_keyboard | 19/20 | 19/20 (journey @380 only, row T393-j) |
| Quality floor, explore flow | every check 0, 9 screens | every check 0, 9 screens; desktop targets under 44 px: 359, owner decision T193-b |

Phone checks (iPhone 13 WebKit, Pixel 5 and 360 x 740 Chromium):
- Landscape: no sideways scroll. At 851 x 393 the layout is the desktop split, and the map starts at 440 px, below the fold (row T403-a).
- On-screen keyboard: with the search field focused and the height cut by 40 percent the field's bottom stays at 154 px, inside viewports of 398, 436 and 444, and the bottom nav starts below it (312, 350, 358).
- Tap only: the popover opens from the info control by tap and a tap elsewhere closes it, on both engines. Nothing depends on hover. Rails page with arrows and keys, and every rail has "See all", so no action is swipe-only.
- Safe areas: the feed end padding still holds `env(safe-area-inset-bottom)` (84 px at rest).
- dvh: the phone map already used 100dvh; the desktop-width map frame moved from vh to dvh.
- Thumb reach: the List/Map switch stays at the bottom right.
- Six languages: German and French labels in the input row fit at 360; names wrap whole in de and fr. The other four languages were not walked beyond the catalogue parse.
- Reduced motion: the popover and chips run no animation.
- INP and LCP: not measured. The change adds nothing to the first paint path (the label measurement runs only on the map) and the css is one small block. perf/baseline_vitals.mjs was not run.

After screenshots (`design-v6-shots\explore\`, JPEG q80, viewport only): V5-filtered-android, V5-filtered-iphone, V5-filtered-desktop, V5-grid-android, V5-mapfailed-android.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first commit carried 1,331 lines of ExploreMap.jsx and two audit folders | My edit script wrote the wrong line endings into a CRLF file; the harnesses wrote keyboard-audit and quality-floor-audit into the worktree | Reset, restored CRLF, deleted the folders, recommitted (the diff is 55 lines) |
| verify_explore failed two destination-page checks | The destination page now opens "When to go" and holds its map in a shut fold | The two assertions follow the page, with comments (row T393-a closed) |
| The first quality floor run found no screens | Wrong argument form | Re-run with `--port=` and `--out=` |

## What is still open

Landscape on a phone gets the desktop split with the map below the fold (T403-a). The dead `.xgrid-count` rule and the sheet's count spacing belong to destinations files (T403-b). Native review of the five new string pairs (T403-c, user). Real-phone checks (T403-d, user). The journey page's ring-less stop at 380 stays with trips (T403-e, same as T393-j). T393-h stays open: the old Explore rules sit in 24-destination-workspace.css and 25-feature-pages.css, which OWNERSHIP.md does not give to Explore, so they could not be moved here. T393-d (the star's on colour), T393-b and T393-c remain for V6.

## Carta-design's seven questions

1. No hex value outside `:root`; the V5 block uses tokens only.
2. No gradient, no new colour, no second saturated hue.
3. Ochre, teal and `--danger` untouched; green unchanged.
4. Mono only for measured facts; the failure line is `--ui`.
5. The failed-map frame has one control, a secondary button; the quality floor counts 0 views with more than one filled primary.
6. New strings carry no em dash, no middot and no banned word.
7. Removed: the invisible 9 px hit ring on the star, the 22 px "See all" box held up by a pseudo-element, the ellipsis on names and countries, and the estimated label width.

## Rollback procedure

Nothing is deployed and no data or schema changed. Before merge, delete the branch `p10-v6-polish-explore` in both repos. After merge, revert the merge of the app branch (commit 8b79fea) in continent-app, and in the root repo revert the report commit and the plan commit; that reopens T393-a, T393-g, T393-i and T393-k. No URL key changed.
