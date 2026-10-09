# T406: harden, adapt and polish the outdoor detail pages (design wave V5)

## Task ID

T406 (design wave V5, session 6; surface key `outdoor`).

## Date

2026-10-09

## What changed

The trail, cycle route, tour, beach, lake and mountain pages were already ordered, drawn and animated by V3 and V4, so V5 hardened them and fixed what a phone on one bar of signal meets. The plan (`docs/design-v6/plans/V5-outdoor.md`) was committed before the first app edit.

The biggest change is a download. The cycle route's hero used `url`, the original Commons file, as its source: 15,410,466 bytes for route 1150. It now takes the 1280 px `thumb` the wire already carries (392,695 bytes) and a srcset over Wikimedia's renderable widths, with `fetchpriority="high"`. The tour hero goes from 1,647,281 to 359,463 bytes. The trail hero already shipped a 1280 px image, so it only gains a srcset that lets a small phone fetch 500 or 960 px, never more than before.

Other fixes. The cycle page's bare "..." while a route loads is now "Loading" in a status line. A grade estimated from the elevation model ("Very hard ~") now has its reason as a visible line under the key facts band, not only in a `title` that touch cannot reach. The beach credit no longer shows a space before the comma. The map frame height uses `dvh`. The map attribution toggle gets a 44 px hit box on a coarse pointer. Long names and German or Dutch compounds wrap (`overflow-wrap`, `hyphens`, balanced titles). The beach, lake and mountain pages pass no map when the record has no point. Inherited code went: the unused `MountainWayUp` component and its styles, ten catalogue keys no page reads (in all six languages), and the second `compassPoint` (now a wrapper over `signature.js`, so the maths lives once).

## Files touched

**Modified (app repo, branch p10-v6-polish-outdoor):**
- src/browse/CyclePage.jsx, TrailPage.jsx, BeachPage.jsx, LakePage.jsx, MountainPage.jsx, DetailSkeleton.jsx (`keyFactsFoot`), KeyFacts.jsx (`foot`), DerivedModules.jsx
- src/lib/derivedModules.js
- src/styles/28-detail-skeleton.css, 29-derived-modules.css, 65-v6-outdoor.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (ten keys removed, none added)
- scripts/verify_beaches.mjs, verify_lakes.mjs, verify_mountains.mjs (two edge fixtures each)

**Modified (root repo):** Execution/_OPEN.md (rows T406-a to T406-f; T386-i and T396-g closed)

**Created (root repo):** docs/design-v6/plans/V5-outdoor.md, Execution/P10/T406-v6-v5-outdoor.md

**Deleted:** none.

## Commands run

In `wt/T406` (root) and `wt/T406-app` (app). The dev server on 5206 stalled under load, so the checks ran on `npm run build` plus `vite preview --port 5206`, stopped at the end.

```
sh ".../impeccable" context --target continent-app/src/browse/DetailSkeleton.jsx
npm run build; npx vite preview --port 5206 --strictPort
node <scratch shoot, probe, phone and lcp scripts>   # iPhone 13 WebKit, Pixel 5, 360 x 740, landscape, 1280
CARTA_PORT=5206 node scripts/verify_<trail_page|cycling|trail_free_gpx|trails|lakes|mountains|beaches>.mjs
node scripts/verify_route_page.mjs; node scripts/verify_keyboard.mjs --port 5206
node scripts/verify_quality_floor.mjs after --port=5206 --only=detail
npm test; npm run lint; node scripts/ci/design-lint.mjs
sh ".../impeccable" detect --json <changed src files>
rm -r dist dist-data keyboard-audit
```

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After |
|---|---|---|
| Cycle route 1150 hero download | 15,410,466 bytes (original file) | 392,695 bytes (1280 px thumb) |
| Tour de-usedom hero download | 1,647,281 bytes | 359,463 bytes |
| Trail 20050 largest image | 325,068 bytes | 388,695 bytes (a DPR 2.75 phone picks 1280, as the shipped src did) |
| LCP, Pixel 5, 4x CPU, throttled network, 3 runs | trail 21.7 to 28.8 s, cycle 19.4 to 21.3 s, tour 15.4 to 21.2 s | trail 23.9 to 25.3 s, cycle 18.8 to 22.0 s, tour 20.3 to 28.5 s |
| Bare "..." loading text on the cycle page | 2 places | 0 |
| Derived grade reason reachable by touch | no | yes, a visible line |
| Unused catalogue keys, `compassPoint` copies | 10, 2 | 0, 1 |
| Slot tops, iPhone 13 (hook, key facts, primary), trail | 440, 479, 829 | 440, 479, 829 |
| Horizontal overflow at 390, 360 and 844 x 390 | 0 px | 0 px on all six pages |
| Accent-filled controls per page | 1 | 1 |
| impeccable detect, design lint new violations | 0, 0 | 0, 0 (166 in the baseline) |
| npm test | 367 pass | 368 pass |

The LCP runs are noise: on this machine the LCP element is a small thumbnail, not the hero, and the spread between runs is wider than any difference, so LCP is no worse within noise and the byte counts are the measured gain (scripts/perf/baseline_vitals.mjs does not cover trail, cycle or tour pages).

Harnesses on the final build: verify_trail_page 50 of 51, verify_beaches 70 of 70, verify_lakes 83 of 84, verify_mountains 86 of 86, verify_cycling 75 of 78, verify_trail_free_gpx 18 of 18, verify_trails 34 of 34, verify_route_page 13 of 13. The five failures are those of rows T396-d and T386-h, the same as before this task. Each place harness gained two edge fixtures: a record with no point (the loaders drop it, so no page opens; the check passes on that and would fail on an empty map box), and a 100 character name at 360 px (asserted to really be the long title, so it cannot pass vacuously; service workers are blocked so the changed record reaches the page). verify_keyboard 19 of 20; I deleted its audit JSON before reading which surface failed, so I cannot say it is the trips journey page of row T396-c, though no outdoor view is in that suite. verify_quality_floor on the detail views: 20 screens, 0 console errors, 0 prose in mono, 0 bare Loading text.

Phone checks (T414). iPhone 13 WebKit, Pixel 5 and 360 x 740: no overflow; German and Dutch at 360 px with nothing clipped, and a 100 character title wrapping to five lines inside the column. Landscape (750 x 342 in the WebKit descriptor): no overflow, hero 137 px, but the primary is 594 to 853 px down, so it is not on the first landscape screen (V4's report said it was; that was measured against 390 px). Nothing depends on hover, and every swipe has Previous and Next. Keyboard (Pixel 5, viewport 60 percent): the Report a problem sheet is shell's and puts its field at 438 to 537 px and "Send report" at 649 px of a 436 px viewport, so both sit below the fold (row T386-d, still open). Tap targets: credit and source links keep the 16 px hit box of `26-shortlist-extras.css`; the attribution toggle now has 44 px.

After screenshots in `design-v6-shots/outdoor/`: `V5-<trail|beach|lake|mountain|cycle|tour>-iphone.jpg`, `V5-cycle-android.jpg`, `V5-trail-desktop.jpg`, `V5-beach-desktop.jpg` (nine).

## Choices where impeccable would have asked

The hero stays full bleed on desktop and the photograph does not move beside the head (rule destination 9 allows it from 1024 px). That needs the hero, the head and the sticky map to share one grid on six pages and is better built once with the destination page in the V6 consistency pass (row T406-c). The "~" reason is a footnote line in `--ink-mute`, not an InfoDot, because the glossary has no term for it and a new term needs a rule. `factLine` in `TrailPage.jsx` stays: `trailKml` uses it for a city day with no distance.

## carta-design's seven questions

1. Any hex value outside `:root`? No; the design lint reports 0 new.
2. Any gradient, colour not in DESIGN.md, or second saturated hue? No.
3. Ochre, teal and `--danger` kept to their jobs? Yes, untouched.
4. Any mono text that is prose? No. The new foot line is in the sans.
5. More than one primary in a view? No; one accent-filled control on every page and device.
6. Every headline with a verb or a number, no em dashes or banned words? No new headline; the only text shown that is new reuses `trails.gradeDerived` and `state.loading`.
7. Remove one thing: the four-slot way-up picture and ten dead strings.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| CyclePage failed to parse | A scripted import was inserted inside a multi-line import | Moved it; lint clean |
| Edge fixtures passed with no effect | A service worker answered the data requests, so the changed record never arrived | Contexts block service workers; the title check asserts the long name |
| Dev server stopped answering | Vite held about 1 GB after hours of HMR | Restarted, then ran on build and preview |
| A first srcset cap of 960 px would have lowered the trail hero | The trail wire already ships 1280 px | Cap raised to 1280 |

## What is still open

Rows T406-a to T406-f in the register: real-phone checks; landscape first screen; the hero beside the head and the cost line (T386-a, still waiting on a Lifestyle hook); shell's Report a problem sheet below the fold with the keyboard up; unused rules in files other surfaces share; and the cycle wire's `url` field, which holds a 15 MB original. No string was added, so no native review is owed. Rows T386-i and T396-g are closed by this task.

## Rollback procedure

Before the merge, delete branch `p10-v6-polish-outdoor` in both repos. After the merge, `git revert` the app commit and the root commits (plan, report). No data, schema or migration changed.
