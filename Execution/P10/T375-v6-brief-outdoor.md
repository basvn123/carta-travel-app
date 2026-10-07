# T375: design brief, outdoor detail pages

## Task ID

T375 (design wave V1, session 6 of 10; set up by T369).

## Date

2026-10-08

## What changed

The outdoor detail pages now have a design brief: `docs/design-v6/briefs/outdoor.md`. It is the plan V3, V4 and V5 build the trail, cycling route, cycling tour, beach, lake and mountain pages from. No app code changed. The brief holds the seven parts the task asks for: the mode (Operate, because the traveller arrives to decide and hand off, not to read or be sold to), the walk, an inventory of every view, state, control and visual setting with a verdict, a critique and a technical audit, the traveller's job, a three-wave plan with a target-state table of every control, and eleven proposals that need a carta-design rule before they are built.

The main findings, in the order they matter. A shared cycling tour link crashes the whole app today (a P0, register row T375-a). The cycle route page says three different things about road bikes on one screen, and the mountain page says both "Alpine route" and "Cable car to the top" without reconciling them (T375-b). On a phone the two hand-offs a traveller came for, getting there and taking the route away, sit 1904 to 2273 px and 2031 to 2608 px down an 800 px screen, below a 56vh photo, a 44vh map, the signature figure and five to ten folded rows that all look alike. The facts a traveller decides on (walking time, ascent, the beach's EU bathing water class, the way in) are inside closed rows. The beach's signature figure is three "Not measured yet" tracks on every beach. The trails wire marks 11,046 of 17,619 trips as waymarked and 17,404 with a season, and the trail page shows neither as a fact. No outdoor page shows a cost, although the base town's receipt is one tap away.

The plan answers that with one structural move in V3: decision first (a key facts band and one Before you go block under the head), then the hand-off band with one primary per page in the same place on all six types (the file on routes, the priced trip to the base on places), then the map, the signature and at most five grouped rows. V4 makes it visual inside the palette: a shorter hero, a drawn placeholder instead of a blank map box, a profile and map that move one marker together, a photo track, and the typography scale fixed. V5 hardens edge cases, six languages, accessibility and performance.

How the work was done. impeccable context ran from the root worktree with a relative target naming `src/browse/DetailSkeleton.jsx` under the app repo's folder, which made it resolve the worktree as the project and load PRODUCT.md and DESIGN.md (a target path into the main checkout resolves the app repo, which has neither). The critique followed `reference/critique.md` as a dual run: Assessment A ran as an isolated sub-agent over the code and the phone screenshots and returned before the detector output was read; Assessment B was the bundled detector and my own Playwright walk with DOM measurements. The browser overlay injection was skipped, because the shared server took minutes per load and the session was told to keep one browser open. Where impeccable would have asked the owner (the shape interview, the critique's closing questions), the run took the option that keeps Carta's palette, type and identity, because the owner told every session to proceed without asking (2026-10-07) and this is refinement, not redesign.

## Files touched

**Created:**
- docs/design-v6/briefs/outdoor.md
- Execution/P10/T375-v6-brief-outdoor.md

**Modified:**
- Execution/_OPEN.md (six rows appended, T375-a to T375-f)

Outside both repos, never committed: six before screenshots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\outdoor\` (V1-trail-380.jpg, V1-beach-380.jpg, V1-lake-380.jpg, V1-mountain-380.jpg, V1-cycle-380.jpg, V1-tour-380.jpg; the last shows the crash screen).

## Commands run

From the root worktree `C:\Users\Gebruiker\Documents\Portfolio\wt\T375`:

```
sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target "<app repo folder>/src/browse/DetailSkeleton.jsx"   (relative to the worktree)
```

From the app repo of the main checkout, read-only:

```
sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" detect --json src/browse/DetailSkeleton.jsx src/browse/TrailPage.jsx src/browse/CyclePage.jsx src/browse/BeachPage.jsx src/browse/LakePage.jsx src/browse/MountainPage.jsx src/browse/Signature.jsx src/browse/DerivedModules.jsx src/browse/RouteFigures.jsx src/browse/RouteParts.jsx src/browse/BathingWater.jsx src/browse/PointMap.jsx src/components/WaterQualityBadge.jsx src/components/LayerPhoto.jsx src/components/KindGlyph.jsx
sh ".../impeccable" detect --json src/styles/28-detail-skeleton.css src/styles/29-signature.css src/styles/29-derived-modules.css
```

The walk was a scratch Playwright script outside both repos (`node walk.mjs <width> <views> [cold]` in the session scratchpad), against http://localhost:5199, opening each page by its share link (`#trail=20050&tc=AT`, `#beach=es-es-trenc-Q11919677&bc=ES`, `#lake=at-attersee-Q698516&lc=AT`, `#mtn=at-hoher-dachstein-Q686841&mc=AT`, `#cycle=1150&cc=AT`, `#tour=de-usedom-rundweg-relaxed`) and recording slot positions, controls with their sizes, headings, fonts and horizontal overflow. The waymarked and season counts came from a read-only node count over `public/trails/*.json` (the `trips` arrays, fields `f.way` and `f.se`) in the main checkout.

## Config and secrets set

None.

## Before/after measurements

V1 measures the before state; the after figures belong to V3 to V5.

| Metric | Before | After | Delta |
|---|---|---|---|
| Detector findings on the 15 surface files and 3 stylesheets | 0 | not built | |
| Heuristic score (Nielsen, of 40) | 25 | not built | |
| Technical audit score (of 20) | 15 | not built | |
| Getting there, top at 380 px (trail, beach, lake, mountain, cycle route) | 1904, 1924, 2212, 2273, 1935 px | V3 target under 1400 px | |
| Take it with you, top at 380 px (same order) | 2031, 2084, 2372, 2608, 2082 px | | |
| Page height at 380 px (same order) | 2601, 2496, 2784, 3020, 2252 px | | |
| Horizontal overflow at 380 px | 0 px on all five | | |
| Folded rows per page (trail, beach, lake, mountain, cycle route) | 7, 6, 5, 5, 5 on the walked pages; the trail page can draw 10 | V3 target at most 5 | |
| Accent-filled primaries per page | 1 on every walked page, in four different places | 1, in one place | |
| Rows in the inventory | 93 (81 views, states and controls, 12 visual settings) | target table removes 5 duplicate or dead doors, adds a key facts band, a tour GPX and a section rail | |
| Screens touched | 0 (brief only) | | |
| Surface harnesses run | 0 of 8 (shared server unusable, row T375-e) | | |

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Page loads timed out at 300 s and one script crashed with "Page crashed" | The shared dev server served ten V1 sessions at once on a laptop with 260 to 600 MB of free memory; a plain request took up to 288 s | Retried one view at a time with 300 s timeouts; six phone views captured, the 1280 px pass abandoned and handed to V3 (T375-e) |
| The first beach and lake captures showed the list, not the page | The page had not opened yet when the shot was taken | Waited for `.dsk-page` before shooting |
| A splash-screen shot was saved as V1-cycle-380.jpg | Saved before the page existed | Deleted and retaken once the page loaded |
| impeccable context reported no PRODUCT.md | A target path into the main checkout makes it resolve the app repo as the project | Re-ran with a relative target inside the worktree |
| The tour page could not be walked | App crash on the share link (`RangeError: invalid_argument`, `Intl.DisplayNames.of` in `src/browse/DestinationsTab.jsx`) | Not fixed (docs-only task); the crash screen is the before shot, register row T375-a |

## What is still open

The tour share link crash is the first thing V3 must fix: every `#tour=` link ends on the error screen, and the tour page cannot be designed or checked until it opens (T375-a). Next to it, the cycle route's three road-bike claims must read one field before any visual work lands on that page (T375-b).

Two items belong to the data lane, not to a design wave. Trail 20050 carries a loop flag its name contradicts (T375-c). And neither the trails nor the cycling wire has a public transport stop or frequency field, so the research's first ask for these pages, the nearest stop and how often it runs, cannot be shown honestly until the pipeline adds one; the brief has Getting there say so in its own voice until then (T375-d).

V1 could not run the eight surface harnesses or capture the 1280 px before set, because the shared server was unusable for most of the session. V3 does both first, from the V1 merge commit, so the before and after pairs and the harness baseline exist (T375-e).

T380 decides the eleven needs-a-rule proposals N1 to N11 in part 7 of the brief, and OWNERSHIP.md has to say who edits `BathingWater.jsx`, `WaterQualityBadge.jsx` and `KindGlyph.jsx`: the task lists them for this surface, but no outdoor page draws them (T375-f). Three existing rows the build waves can close on this surface are named in the brief's V5 list: T287-c, T286-d and T363-b.

No new strings were written, so no native-review row is needed for V1.

## Rollback procedure

Docs only. Revert the T375 commits on branch p10-v6-brief-outdoor (`git revert <hash>` for each, or drop the branch before merge). After a merge, `git revert -m 1 <merge commit>` removes the brief, this report and the six register rows together. The screenshots outside the repos can be deleted with the folder `design-v6-shots\outdoor`.

## Carta-design's seven questions

Not applicable in V1: no CSS, JSX or copy shipped. The brief applies them as constraints on every V3 to V5 item (no new token, no gradient, one accent, mono only for measured facts, one primary per view, sentence case, nothing decorative that carries nothing).
