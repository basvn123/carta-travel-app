# V5 plan: outdoor detail pages (T406)

Written by T406 in design wave V5, 2026-10-08, before the first app edit. It carries out the V5 list of `docs/design-v6/briefs/outdoor.md` part 6 (harden, adapt and polish) under `docs/design-v6/DIRECTION.md`. App paths are in the app repo and written as `src/...`. Mode stays Read inside Operate. This is refinement: palette, type and identity stay, and impeccable's "Refinement preserves" applies. The run is unattended, so where impeccable would ask, the plan takes the option that keeps Carta's palette, type and identity and says so in the report.

## Audit and critique of the V4 result (impeccable audit, critique and the T414 phone list)

Looked at on the dev server (port 5206) with the device descriptors, each page opened by its share link: trail 20050, beach Es Trenc, lake Attersee, mountain Hoher Dachstein, cycle route 1150, tour de-usedom-rundweg-relaxed. Scratch results are in `wt/_scratch/T406/`. Slot tops on the iPhone 13 viewport (WebKit, 390 x 844) match the V4 report: hook at 440 (trail), 489 (mountain) and 512 (cycle route), the primary row at 829, 1098 and 825. Horizontal overflow is 0 px on all six pages at 390 and at 360 x 740, in English, German and Dutch, and with a 100 character German name forced into the title on the trail, cycle route and tour (the title wraps to five lines at 360 px and nothing is clipped). The impeccable detector over the 16 surface files returns 0 findings; the design lint reports 0 new violations (166 in the baseline).

What works and stays: the V3 order, one accent-filled primary per page, the key facts band, the profile and map talking both ways, the ink map sketch, the photo track, the section rail, the single type scale, status dots instead of green containers.

What the V5 list should fix, most important first:

1. Two pages can render an empty map wrapper. `BeachPage`, `LakePage` and `MountainPage` pass `map` as an element even when the record has no finite point; `PlaceMap` then returns null inside a `.dsk-map` box that still has margins, and the rail keeps a Map link to an empty anchor (brief V5-1: "no map point, map slot and rail link gone").
2. The cycle page shows a bare "…" while its route loads, in a `places-empty` box with no status role. A traveller on one bar of signal reads that as broken. It needs the word the product already uses (`state.loading`) in a live region.
3. The derived trail grade ends in a "~" explained only by a `title` attribute, which touch cannot reach. Brief V5-3 wants a visible word.
4. Maplibre's attribution toggle is 24 x 24 px on a coarse pointer, under the `--tap` floor; the zoom buttons already take `--tap`.
5. The map frame height uses `44vh`, not `44dvh`: with a collapsing address bar the frame changes size under the reader's thumb (design wave rule on full-height layouts).
6. The trail and cycle heroes are raw single-size Commons images, the largest content on the page and the LCP element. The place pages already ship a ladder. Wikimedia's thumb list is owned by `src/lib/heroImage.js` (`srcSetFor`), so the two route pages can offer 500, 960 and 1280 px without a new rule.
7. The beach credit line sets a space before the comma ("DerPanscher , CC BY-SA 4.0"); the lake and mountain already fixed it with one inline item (row T396-g).
8. Inherited code is left over from V3: the unused `MountainWayUp` component and its helpers, 12 catalogue keys no page reads (row T386-i), and `compassPoint` written twice (`src/lib/signature.js` and `src/lib/derivedModules.js`).
9. Desktop at 1280 and 1440 is not yet checked in V5: the 56dvh hero pushes the head to about 500 px, and the first photograph may sit beside the head from 1024 px (row T396-f). Decided after the desktop screenshots.

Nielsen scores after V4: visibility of system status 3 (the cycle loading line is the gap), consistency 3, flexibility and efficiency 3 (rail), error recovery 3, aesthetic and minimal 3.

## The changes, in order

1. Maps only when there is a point (finding 1). `BeachPage.jsx`, `LakePage.jsx`, `MountainPage.jsx` pass `map` only when latitude and longitude are finite; the rail drops the Map link by itself. A fixture check in each place harness.
2. A named loading state on the cycle page (finding 2). `CyclePage.jsx` replaces the bare "…" with `state.loading` in a `role=status` paragraph. No new key.
3. A visible reason for "~" (finding 3). `KeyFacts.jsx` gains an optional `foot` line and `DetailPage` passes it as `keyFactsFoot`; `TrailPage.jsx` sets it to "~ " plus the existing `trails.gradeDerived` sentence when the grade is derived. The `title` stays as a hint on a fine pointer. No new key.
4. Touch and viewport (findings 4, 5). `65-v6-outdoor.css`: a `--tap` hit box on the attribution toggle on a coarse pointer (a pseudo-element, the box does not move); `28-detail-skeleton.css`: `44dvh` for the map frame with the same 240 and 420 px bounds.
5. Hardened text (brief V5-1, V5-2). `65-v6-outdoor.css`: titles and the ref chip wrap on long unbroken names (`overflow-wrap: anywhere`, `text-wrap: balance`), the strip words and key fact values hyphenate in German and Dutch, rows and exits keep two-line previews. Checked at 360 and 390 px in German and Dutch.
6. Heroes with a ladder (finding 6). `TrailPage.jsx` and `CyclePage.jsx` build `srcSet` and `sizes` for the hero from `src/lib/heroImage.js` and set `fetchpriority="high"`. A URL Wikimedia cannot resize keeps its single `src`. LCP is measured before and after with `scripts/perf/baseline_vitals.mjs` where it covers the surface, otherwise by a Playwright `PerformanceObserver` on the same server.
7. Cleanup (finding 7, 8). Beach credit as one inline item; `compassPoint` keeps its maths in `src/lib/signature.js` and `derivedModules.js` wraps it in lower case, so the tested API stays; `MountainWayUp` and its helpers go, with the 12 unused keys in the six catalogues (grep first; every catalogue parsed after). `factLine` in `TrailPage.jsx` stays: `trailKml` uses it for a city day with no distance.
8. Desktop pass (finding 9). Screenshots at 1280 and 1440. The hand-off band side by side, the sticky map and the rail are checked; the hero beside the head is built only if DIRECTION part 3 already covers the layout, otherwise it is a register row.
9. Harnesses. One edge fixture per place harness (no point, long title); each changed assertion carries a comment.
10. Final pass and report: all six languages at 360, the phone list of T414 on the iPhone 13 (WebKit), Pixel 5, 360 x 740, landscape 844 x 390, keyboard at 60 percent height, safe areas, tap targets, no swipe-only path; keyboard 20 of 20 and quality floor; the seven carta-design questions; the after screenshots as `V5-<view>-<iphone|android|desktop>.jpg`.

Not in this wave, with the reason: the cost line (row T386-a; it needs the Lifestyle choices passed in by destinations or shell); the focus ring on Back after a pointer open (shell's `useFocusTrap`, row T396-e); the month strip's "i" button (shell's `MonthStrip.jsx`); the unused `.lpage-months` rules and the `.bpage-scorebtn` rules (they live in `23-places-pages.css` and `26-shortlist-extras.css`, which the destination and trips surfaces share); the tour's per-day profile (no tour elevation on the wire, row T386-g).

## Checks

`npm test`, `npm run lint` (0 errors), `node scripts/ci/design-lint.mjs` (0 new), `npm run build` then delete `dist/` and `dist-data/`; the six catalogues parsed; impeccable `detect --json` over every changed file; the surface harnesses (verify_trail_page, verify_beaches, verify_lakes, verify_mountains, verify_cycling, verify_route_page, verify_trail_free_gpx, verify_trails) and the floors (verify_keyboard 20 of 20, verify_quality_floor on the detail views).
