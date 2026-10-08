# T396: visual and dynamic on the outdoor detail pages (design wave V4)

## Task ID

T396 (design wave V4, session 6; surface key `outdoor`).

## Date

2026-10-08

## What changed

The trail, cycle route, cycle tour, beach, lake and mountain pages now answer the traveller and show the place before they explain it, inside the same palette and type. The plan (`docs/design-v6/plans/V4-outdoor.md`, committed before the first app edit) carried eleven items from the brief's V4 list; all eleven are done.

The hero is capped at 40 percent of the phone viewport (`40dvh`, `56dvh` from 900 px), so on an iPhone 13 the hook starts at 440 to 512 px instead of 555 to 615, and on the trail, beach, cycle route and tour the one primary (the GPX or "Price a trip to") now starts inside the first screen (its row at 763 to 829 px of 844, so the button's top edge shows and one short scroll brings it whole). The card-to-page shared element transition still lands on the hero photograph.

The map is never a blank box. While maplibre and the tiles load, the map frame shows the item's own line (trail, cycle route, tour) or point (beach, lake, mountain) drawn in ink from geometry the page already holds, with the place's name in the corner and "Loading the map" for a screen reader (`MapSketch` in `src/browse/DetailSkeleton.jsx`). The map canvas is transparent until maplibre reports `load` (the container then gets `is-live`, set by `markMapLive` in `src/lib/detailSkeleton.js`) and crossfades in over `--dur-3`. With the tile host blocked the drawing stays; that is the one-bar-of-signal case at a trailhead.

The profile and the map now talk both ways (rule N11). On the trail, a tap within 24 px of the route line moves the profile's marker and readout to that point and puts the scrub pin there. The cycle route's elevation profile became an instrument: `SlopeProfile` in `src/browse/RouteFigures.jsx` gained `plain` (one ink-ramp area, no slope shading, no slope key) and `markM` (a position set from the map), so the cycle profile scrubs by drag and arrow keys, its pin follows on the map, and a tap on the map line moves it back. The marker is the only accent in the figure.

The photographs left their tab strips. Beach, lake and mountain had 64 px thumbnails with `role=tab` and no tab panel; the trail hid each credit behind a tap. All four now render one photo track (`PhotoTrack` in `DetailSkeleton.jsx`, on the day track's index maths from `src/lib/dayTrack.js`): 3:2 frames at 85 percent of the column, scroll-snap, Previous and Next secondaries with the position in mono ("2 of 4"), arrow keys, Home and End, the credit (and on the trail the km marker) in a solid band under every photograph. The header keeps the first photograph, so the old tap-to-swap on the hero is gone with the tabs.

The six pages share one type scale: titles 28 px on a phone and 40 px from 769 px (they were three sizes: `clamp(21px, 4.4vw, 28px)`, `.bpage-name`, `.cycle-title`), slot heads 22 and 26 px (were 16), the hook 16 px (was 19, which outranked the heads). Shell's `SectionRail` is mounted on every page with Facts, Getting there, Map, Details and Nearby; it appears once the hero has scrolled away and its links are real anchors. Rows turn their chevron over `--dur-2` and fade their body in; rows, exits and the hand-off secondaries tint on hover in `--dur-1` on a fine pointer; the primary takes `--accent-press` on press; an exit's title underlines in ink on hover instead of turning terracotta. The trail's highlight chips are ink outlines, so at rest the accent on a trail page is the route line, the primary and focus. The lake's "You can swim" and the mountain's lift block lost their green containers: card ground, hairline, a 6 px `--status-success` dot before the words (rule N6). Every new rule sits in `src/styles/65-v6-outdoor.css` scoped to `.dsk-page`, from the motion tokens, with a reduced-motion branch.

No figure on these pages changes from a traveller's input (the cost line is still row T386-a), and the scrub readout changes continuously, where an opacity dip on every pixel of a drag would flicker; so `settleFigure` is not used here, by decision.

## Files touched

**Modified (app repo, branch p10-v6-visual-outdoor):**
- src/browse/DetailSkeleton.jsx (MapSketch, PhotoTrack, PlaceMap with the sketch, the section rail and the slot ids)
- src/browse/TrailPage.jsx, CyclePage.jsx, BeachPage.jsx, LakePage.jsx, MountainPage.jsx
- src/browse/RouteFigures.jsx (SlopeProfile `plain` and `markM`)
- src/browse/PointMap.jsx (children for the sketch, `is-live` on load)
- src/browse/KeyFacts.jsx (the rail anchor id)
- src/lib/detailSkeleton.js (`markMapLive`)
- src/styles/28-detail-skeleton.css (hero height, hook size, slot head size; changed in place, outdoor owns it)
- src/styles/65-v6-outdoor.css (the V4 rules)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (11 new `detail.*` keys each, inserted after `detail.factWayUp`; none changed or removed)
- scripts/verify_beaches.mjs, verify_lakes.mjs, verify_mountains.mjs, verify_trails.mjs (photo assertions read the track; one check added per place harness; each change commented)

**Modified (root repo):** Execution/_OPEN.md (rows T396-a to T396-g)

**Created (root repo):** docs/design-v6/plans/V4-outdoor.md (the plan), Execution/P10/T396-v6-v4-outdoor.md (this report)

**Deleted:** none. No new app file, so OWNERSHIP.md stays true without an edit.

## Commands run

All in `wt/T396` (root) and `wt/T396-app` (app); Vite on port 5206, stopped at the end (process 6744 killed after the background shell stopped).

```
sh ".../impeccable" context --target continent-app/src/browse/DetailSkeleton.jsx   # from wt/T396
npx vite --port 5206 --strictPort                                                   # background
node --import ./pwfix.mjs shoot.mjs <prefix> <iphone|android|android360|landscape|desktop> all [--save]
node --import ./pwfix.mjs look.mjs <view> <device>        # scratch, BLOCK=1 aborts the tile host
python wt/_scratch/T396/py/i18n_add.py
npm run lint; node scripts/ci/design-lint.mjs; npm test
sh ".../impeccable" detect --json <the twelve changed src files>
CARTA_PORT=5206 node scripts/verify_<trail_page|beaches|lakes|mountains|cycling|trail_free_gpx|trails>.mjs
node scripts/verify_keyboard.mjs --port 5206
node scripts/verify_quality_floor.mjs after --port=5206 --only=detail --out=wt/_scratch/T396/qf
npm run build; node scripts/verify_route_page.mjs; rm -r dist dist-data shots
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
```

Scratch scripts, logs and the measurement JSON are in `wt/_scratch/T396/`. The `pwfix.mjs` preload points Playwright at the cached browsers; the plain launch the orchestrator later enabled crashed WebKit 2311 once in this session, so the scratch shots kept the preload.

## Config and secrets set

None.

## Before/after measurements

Slot tops inside the page's scroll box, iPhone 13 (WebKit, 390 x 844, device descriptor), each page by its share link. Before is the merged V3 state at the start of this task (`pre-iphone.json`; the trail's before is T386's after figure, because the first cold run timed out on it); after is `after-iphone.json`.

| Page | Hook before | after | Key facts before | after | Hand-off (primary) before | after |
|---|---|---|---|---|---|---|
| trail 20050 | not measured | 440 | 574 | 479 | 912 | 829 |
| beach Es Trenc | 555 | 450 | 598 | 489 | 915 | 820 |
| lake Attersee | 555 | 450 | 598 | 489 | 1093 | 997 |
| mountain Hoher Dachstein | 594 | 489 | 663 | 552 | 1198 | 1098 |
| cycle route 1150 | 615 | 512 | 658 | 551 | 918 | 825 |
| tour Usedom | 555 | 450 | 598 | 489 | 858 | 763 |

| Metric | Before | After |
|---|---|---|
| Hero height on a 844 px phone | 56vh, about 470 px | 40dvh, 338 px |
| Pages whose primary row starts on the first iPhone screen | 0 of 6 | 4 of 6 (lake 997, mountain 1098) |
| Title sizes across the six pages | 3 | 1 (28 px phone, 40 px desktop) |
| Slot head size against the hook | 16 px under a 19 px hook | 22 px over a 16 px hook |
| `role=tab` on the six pages | 3 strips (beach, lake, mountain) | 0 |
| Photographs with a visible credit in the photo row | 0 (trail on tap only; place thumbnails none) | every frame |
| Map box with nothing drawn while loading | 6 of 6 | 0 of 6 |
| Profiles that drive the map / are driven by it | 1 / 0 | 2 / 2 (trail, cycle route) |
| Green containers (swim verdict, lift block) | 2 | 0 |
| Accent-filled controls per page | 1 | 1 on every page and every device |
| Controls added | none | photo track Previous and Next (2 per photo row), section rail (5 links) |
| impeccable detect over the changed files | 0 | 0 |
| Design lint new violations | 0 (194 baseline) | 0 (194 baseline) |
| `npm run lint` errors | 0 | 0 (no warning in a changed file) |
| `npm test` | 367 pass | 367 pass |

Harnesses, after (same server, port 5206). The failures named are the same before and after: the trail and lake baselines were run on this worktree with `src/` checked out at the V3 merge (`e2d9e1e`), and they fail the same checks.

| Harness | Result | Notes |
|---|---|---|
| verify_trail_page | 50 of 51 | "card is facts only" fails on the Destinations list card (it reads "Waymarked"), also on the V3 baseline; row T396-d. "city day lists its stops" failed once under load and passed on the rerun |
| verify_beaches | 68 of 68 | one check added (no tab roles) |
| verify_lakes | 81 of 82 | "the lake filter groups are offered [1 groups]" is the browse tab, same on the baseline; row T396-d |
| verify_mountains | 84 of 84 | one check added |
| verify_cycling | 75 of 78 | the two data checks of row T386-h, and "desktop: cycling has facet groups (2 groups)", the browse tab; row T396-d |
| verify_route_page | 13 of 13 | built dist |
| verify_trail_free_gpx | 18 of 18 | |
| verify_trails | 34 of 34 | |
| verify_keyboard | 19 of 20 | the journey page at 1280 px: `button.tl-btn "4 days"` shows no focus ring; trips' trip-length control, not this surface (row T396-c). The suite has no outdoor view |
| verify_quality_floor, detail views | every floor check 0 | 20 screens, 0 console errors, 0 phone targets under 44 px, 0 motion under reduced motion |

Phone checks (T414), with the device descriptors. Horizontal overflow 0 px on all six pages on iPhone 13, Pixel 5, 360 x 740 (isMobile, hasTouch) and iPhone 13 landscape (844 x 390); one accent-filled control on every page on every device. At 360 x 740 the hook sits at 480 to 573 px and the hand-off at 793 to 1170. In landscape the hero yields to its cap (156 px), the hook is at 284 to 348 px and the primary at 594 to 642, so it is on the first screen of a 390 px tall phone. Nothing depends on hover: every new `:hover` is inside `@media (hover: hover)`, the photo track's swipe is matched by Previous and Next and by the arrow keys, and the map tap that moves the marker is matched by dragging and the arrow keys on the profile. The hero uses `dvh`; the skeleton's bottom padding already reads `env(safe-area-inset-bottom)`; the section rail sits in the page's scroller under the page bar, which carries the top inset. Keyboard up (Pixel 5, viewport 60 percent high, the Report a problem field focused): the field is visible (224 to 323 px) and "Send report" starts at 436 px of a 436 px viewport, so it is just under the fold; that is shell's ReportProblem sheet and row T386-d, unchanged here. Tap targets: the rail links and the track buttons are `--tap` on a coarse pointer.

After screenshots, viewport only, JPEG 80, in `design-v6-shots/outdoor/`: `V4-<trail|beach|lake|mountain|cycle|tour>-iphone.jpg`, `V4-<trail|beach>-desktop.jpg`, `V4-cycle-android.jpg` (nine). They pair with the V3 set by view name.

## Choices where impeccable would have asked

The run is unattended (owner, 2026-10-07), so each open call kept Carta's palette, type and identity. The map sketch is ink on `--paper-dim` with no hue, because N8 says "ink" and the live line is the one place the accent belongs. The photo track replaced the tap-to-swap hero rather than sitting beside it, because two doors to the same photographs is the duplicate V3 removed elsewhere; the hero stays the first photograph. The cycle profile is plain rather than slope-shaded, so the figure keeps showing what V3 showed (the climb) and gains only the scrub; the plain area is `--rule`, not the old `--accent-bg`, so the marker is the only accent in it. The hook went to 16 px rather than staying at 19 with heads at 22, because DIRECTION's scale has no 19 px sans role. The rail labels are short nouns ("Facts", "Map"), the form shell's rail already uses on the journey page. Exits underline in ink on hover rather than turning terracotta, because an exit is navigation, not the page's action.

## carta-design's seven questions

1. Any hex value outside `:root`? No. Every new rule uses tokens; the design lint reports 0 new violations.
2. Any gradient, a colour not in DESIGN.md, a second saturated hue? No. Two uses of the accent left (the highlight chips, the cycle profile fill); none were added.
3. Ochre only for ratings, teal only for gems, `--danger` only for destruction? Yes; none of the three is touched. `--status-success` appears only as the 6 px dot.
4. Any mono text that is prose, or a column number in the sans? The new mono is the track position ("2 of 4"), the km marker ("at 15.4 km") and the existing figures; the credits, the rail labels and the sketch's name are in the sans. The quality floor counts 0 prose set in mono.
5. More than one primary in a view? No: one accent-filled control per page on every device, counted by the shot script and the quality floor.
6. Every headline with a verb or a number, no em dashes or banned words? No new headline; the new strings are labels, a position and two sentences ("Photographs from Wikimedia Commons, each under the licence shown with it.", the track's screen reader label). The diff has no em dash, no middot and none of the banned words.
7. Remove one thing: the trail's "Tap a picture for the credit." line, because every frame now shows its credit; it became one source sentence.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The photo credit checks of the three place harnesses failed | Every track frame carries its own `.bpage-credit`, so the bare locator matched four elements in strict mode | The checks read the hero's credit (`.dsk-hero-credit .bpage-credit`), with a comment |
| The cycle profile drew a pink area | The plain mode first reused `.tpage-elev-area`, whose fill is `--accent-bg` | Its own `.sig-plain-area` in `--rule` |
| The cycle profile's km axis touched the "Underfoot" label under it | The scrubbable profile ends on its axis with no margin | `margin-bottom: var(--space-4)` on the profile |
| `markMapLive` exported from `DetailSkeleton.jsx` raised a react-refresh lint warning | A non-component export in a component file | Moved to `src/lib/detailSkeleton.js` |
| Two uncommitted edits vanished when the V3 baseline was checked out into `src/` to compare harness results | `git checkout HEAD -- src` restored the committed state over them | Re-applied and committed; the comparison now runs only on a clean tree |
| WebKit 2311 closed the browser on the first launch | The orchestrator's newly installed build crashed under load in this session | The scratch shots kept the preload pointing at WebKit 2359 |

## What is still open

The 11 new strings in de, es, fr, it and nl were written by this session and need a native reader (row T396-a). What only a real phone can prove (row T396-b): scroll momentum and snap on the photo track, the map's crossfade on a real slow connection, how precisely a finger hits the route line for the map-to-profile tap (24 px tolerance), and iOS Safari's bottom bar with the section rail stuck under the page bar.

The keyboard suite's one failure is the trips surface's trip-length button on the journey page at 1280 px (row T396-c). Three browse-tab checks in the outdoor harnesses fail the same on the V3 baseline: the Destinations trail card now carries "Waymarked" though verify_trail_page asserts facts only, and the lake and cycle facet groups render one and two groups; they belong to the destinations surface (row T396-d).

Left for V5 with the reason: the focus ring that shows on Back after a pointer open is shell's `useFocusTrap` (brief V5-3; row T396-e); the hero beside the head from 1024 px is allowed by DIRECTION part 3 but was not in the V4 list (row T396-f); `ImageCredit` on the beach, lake and mountain pages sets a space before the comma ("DerPanscher , CC BY-SA 4.0") because `.bpage-credit` is a flex row with a gap (row T396-g). The cost line (T386-a) and the tour's per-day profile (T386-g) stay open as they were.

## Rollback procedure

Before the merge: delete the branch `p10-v6-visual-outdoor` in both repos. After the merge: in the app repo `git revert c25becf 11cdd03`; in the root repo `git revert` this report's commit and the plan's commit (`git log --oneline -- docs/design-v6/plans/V4-outdoor.md`). No data, schema or migration changed; the i18n keys go with the app revert.
