# T441: Explore map: fast, clear, prices from the first view (Explore redesign, step 6 of 9)

## Task ID

T441

## Date

2026-10-14

## What changed

The owner said of the map: "it loads too long, and then you only see numbers until you zoom". The map now opens quickly, draws every place at once and shows prices straight away.

**What the reader sees**
- **No number clusters.** Every place is a small ink dot from the first frame, sized by kind and darker for a better rating; unrated places recede. A dot is never brown, so it can't read as an action.
- **Prices from the opening view.** The best-rated places in view carry a label: the name, then the day cost (for example "Rome ~€87"). That is 14 labels on a 1440 px desktop and 10 on a phone, where before there were none until zoom 7.
  - Labels never overlap and never cross the frame's edge; a label that would is drawn as a dot.
  - A national stand-in figure carries the estimate tilde, which also appears in the tip, the card and the accessible name ("~€49 est.").
- **One cheapest in view.** It is the sun best-value marker, ink on yellow, and no longer the action colour.
- **The camera frames the list.** It opens on Europe, refits when a filter or search changes (an Italy filter frames Italy), and can't drift off the continent.
- **Filters apply on open.** Filters set before opening the map now apply there; previously they were skipped.
- **One place, one dot.** The map reads the same catalogue as the list. Airport gateways are merged, so Paris is one dot named "Paris", not three labelled "Paris (CDG)", "Paris (Orly)" and "Paris (Beauvais)".

**Speed**
- The canvas shows at the first style frame, not after every tile.
- The dots and labels go in when the style loads, not on `load`, which waits for the first complete render, tiles included.
- The map's code is fetched when the browser is idle after the first paint, and again when a pointer or focus reaches the Map switch. The basemap hosts are warmed at the same moment. This is skipped on Save-Data and 2G.
- The map stays mounted after its first open, so List then Map again is instant and keeps the camera.
- The source no longer carries a photo and a line for each of its 3,855 places; the card looks them up by id when it opens.

**Phone**
- The map view is full height and full width, from under the search row to the bottom nav. The sort and the guides strip leave the map view; the filter chips stay.
- The floating List/Map switch is the kit Segmented with a raised shadow, replacing the dark slab (closes T426-d).
- A tap on a price or a dot raises a peek card (photo, name, Score, day cost). A second tap, on the pin or the card, opens the place. The card sits above the labels, so a label under it can't catch the tap.

**Desktop:** the map stands beside the list from 769 px and is wider from 1440 px. Its whole frame fits under the top band.

**Cleanup:** 80 old map, card and switch rules were removed from 25 and 62. One new block on roles replaces them.

## Files touched

**Modified (app, mirrored in root):**
- continent-app/src/browse/ExploreMap.jsx (no clusters, ink dots, labels at every zoom, fit, style.load, peek card on touch, estimate tilde, `visible` and `framed` props)
- continent-app/src/browse/ExploreTab.jsx (kept-mounted map, prefetch and preconnect, kit switch for both places, `is-map` class, merged catalogue for the map)
- continent-app/src/styles/62-v6-explore.css (the T441 block; old map rules removed), 25-feature-pages.css (old map, card and switch rules removed)
- continent-app/scripts/verify_explore.mjs (map checks, a touch-phone map pass)
- continent-app/scripts/ci/design-lint.baseline.json

**Created (app, mirrored in root):** continent-app/scripts/measure_explore_map.mjs (the committed measurement method)

**Modified (root):** Execution/_OPEN.md. **Created (root):** this report.

## Commands run

```
npx vite build && npx vite preview --port 5231
node scripts/measure_explore_map.mjs 5231 after          (before: the same method on pre-T441 master, port 5232)
node scripts/verify_explore.mjs http://localhost:5231/   (84 of 84)
node scripts/verify_quality_floor.mjs t441 --port=5231 --only=explore
impeccable detect --json ExploreMap.jsx ExploreTab.jsx 62-v6-explore.css   ([])
node scripts/ci/design-lint.mjs (0 new); --meter; --update-baseline
<scratchpad>/t441shots.mjs   (1440 x 900, 1280 x 720 and 390 x 844, English and German: map, pin tip, phone peek card, Italy filter, reopen)
```

## Config and secrets set

None.

## Before/after measurements

Map open time is the median of three runs with `scripts/measure_explore_map.mjs`, timed from pressing Map. The phone runs at 4x CPU throttle.
- **Before:** master at the T440 merge, built from a worktree with the same data and served on port 5233.
- **After:** this branch on port 5231.
- The two were run back to back on the same machine.

An earlier baseline (1,876 ms and 5,816 ms) was taken while a five-minute build was running, so it is not used.

| Metric | Before | After |
|---|---|---|
| Map canvas visible, desktop | 613 ms | 278 ms |
| Map canvas visible, phone | 1,455 ms | 623 ms |
| First price on the map, desktop | never (prices from zoom 7 only) | 481 ms |
| First price on the map, phone | never | 1,122 ms |
| Price labels at the opening view, 1440 px and phone | 0 and 0 | 14 and 10 |
| Number clusters | yes, below zoom 6 | none |
| Dots for Paris | 3, labelled with airport codes | 1, "Paris" |
| Phone map height on a 390 x 844 screen | 100dvh minus nav minus 236 px | from under the search row to the nav (596 px) |
| Filters set before opening the map | ignored on the map | applied |
| List, then Map again | the map rebuilt | the same map, instant |
| Raw buttons: ExploreTab, ExploreMap | 4, 3 | 2, 2 |
| 62-v6-explore.css meter: font sizes, radii, legacy reads | 20, 7, 54 | 16, 5, 36 |
| 25-feature-pages.css meter: font sizes, radii, legacy reads | 247, 102, 513 | 238, 91, 488 |
| Lint baseline total | 9,885 | 9,813 |
| verify_explore checks | 73 | 84 |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The map opened on Iceland to Cyprus, below the label zoom, so no prices showed | An unfiltered list counted as a filter, because the map compared the list with the raw catalogue, which is larger | The map takes the list's own catalogue, and frames Europe unless a filter or search is on (`framed`) |
| Labels read "Paris (CDG)" and "Venice (Marco Polo)" | The map read the raw catalogue, where airport gateways are separate places | Same fix: the merged catalogue |
| The phone map drew no basemap and no dots | The canvas had a percentage height inside a flex box whose height is indefinite | The canvas is absolutely positioned in its frame |
| 3,868 grey dots read as noise on the phone | Dots too large at the opening zoom, with heavy white rings | Dots scale with zoom from 42 percent; thinner rings; unrated places recede |
| "Porto" and "Lisbon" were cut at the phone's left edge | The collision check ignored the frame | A label must sit wholly inside the frame |
| A tap on a price left the map for the page | Labels opened the place on any pointer | On touch the first tap raises the peek card |
| The tap on the peek card hit a label under it | The label layer painted above the popup | The popup sits above the labels |
| First price took 4 to 6 seconds | Our layers were added on `load`, which waits for every tile | Added on `style.load` |
| The phone map view had no h1 | Hiding the sort bar also hid the page's visually hidden title | Only the bar's tools hide |
| The desktop map ran 38 px below the screen | Its height ignored the top band above it | Height accounts for the band |
| A `sed` edit turned ExploreMap.jsx to LF | Known Git Bash gotcha | Restored CRLF; diffs checked against HEAD line endings |

## What is still open

- **T441-a.** In the `viewport` catalogue mode (`VITE_CATALOGUE=viewport`, off by default), the boot pins still include the merged-away airport gateways (Paris Orly, Beauvais). They would stay as unloaded dots. Filter the boot pins against the merged list if that mode is turned on.
- **T441-b.** The first price on a 4x throttled phone takes about 1.1 seconds, against 0.5 on desktop. Most of it is the basemap style and the GeoJSON parse. Possible next steps: cache the style JSON with the app, or draw the dots on a blank style while the basemap loads.
- **T441-c.** The INP of the List/Map switch was not measured here. T231-b and T200-c stay open for it.

Closed by this task: T426-d (the floating switch is the kit Segmented), T438-e (ink dots) and T383-f (there is no in-view count left to disagree with the labels).

## Rollback procedure

Revert the T441 commits in both repos. The clustered map, the dark floating switch, the old CSS and the map that unmounts on every switch come back. No data, schema or config changed.
