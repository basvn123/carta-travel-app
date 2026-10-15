## Task ID

T430

## Date

2026-10-15

## What changed

The five outdoor item pages (trail, beach, lake, mountain, cycle route and tour) and their section openings on the Destinations tab were rebuilt on one shared system, in the order the owner decided on 2026-10-15 and recorded in carta-design ("Detail page grammar"): show first what makes the traveller want to go, then what decides it. Every item page now opens on a swipeable, credited photo gallery (the destination page's gallery, lifted into `PhotoGallery.jsx` so there is one gallery in the app), then a head with the full name, the Score and band, where it is and one hook line that sells the place, then a fact band of four to six measured facts with an icon each (a missing fact is left out, never "Not recorded"), Why go as photo cards or short rows, the map with its climb in a sticky side column from 1024 px, Before you go as at most four icon rows with safety first (`lib/beforeGo.js`), one hand-off row (one primary, a cost line for a night and a day in the base town, directions, add to a day and the page's only Download PDF), getting there, at most three folds, "Not quite right?" as large photo cards, nearby and one line of sources. The "Where this comes from" fold, the suitability strip, the long not-for prose, "Carta has no bus or train stop data", "Three other places to try" and the method sentences are gone. Maps no longer ask for Ctrl or Cmd: a two-finger trackpad swipe pans, a pinch or mouse wheel zooms, and on a phone the map in the page stays still until Expand opens it full screen (`lib/mapGestures.js`, `MapShell.jsx`). Trail, cycle and mountain maps offer a 2D and 3D choice under the map: 3D drapes the route on Mapterhorn terrain with a hillshade in token colours, off by default and never moving by itself (`lib/terrain3d.js`, CSP and credits added). The section openings lost their hero photograph, take Explore's head scale, carry a "Walks near me" style door in the head, show full titles, and their rail tiles swipe up to four photographs before a tap. Every item page has a clean PDF in the app's own face (Figtree static instances with tabular figures) that prints the page's own words in the page's order, its photographs with credits, and its route and climb as flat vectors (`lib/pdfKit.js`, `lib/itemPdf.js`). `docs/ITEM_PAGE_DATA_CONTRACT.md` lists every slot, its field and shape, today's fill and the empty behaviour, for the owner to hand to a data model. The trip page work is reported in T431.

Research behind the order (summarised from the planning pass; full notes in the plan file): hikers choose on scenery first (Wandermonitor 2024: 85% scenery, 47% path quality, 37% food on the way, 29% public transport), cyclists on getting to the route (ADFC Radreiseanalyse 2025: a quarter of those who do not go name the journey to the start), beach goers on clean, shallow, calm water and lifeguards; the leading hiking apps (AllTrails, Komoot, Outdooractive) open on a gallery, then the facts, then a route preview with a 3D option, and keep the planning tools one tap away. Carta's mark on that structure stays the one calm price line and the estimate mark.

## Files touched

**Created:**
- continent-app/src/browse/PhotoGallery.jsx (gallery and tile photos), Track.jsx (one swipe track), ItemParts.jsx (head, Before you go, highlight and alternative cards, included list, sources line), MapShell.jsx (map frame, 2D/3D, Expand)
- continent-app/src/lib/mapGestures.js, terrain3d.js, beforeGo.js, itemPhotos.js, pdfKit.js, itemPdf.js
- continent-app/src/hooks/useBaseDay.js, useItemPdf.js
- continent-app/src/styles/70-item-pages.css
- continent-app/public/fonts/Figtree-Regular.ttf, Figtree-SemiBold.ttf, Figtree-Bold.ttf, Figtree-OFL.txt
- continent-app/scripts/measure_item_pages.mjs, verify_item_pdf.mjs
- continent-app/tests/mapGestures.test.mjs
- docs/ITEM_PAGE_DATA_CONTRACT.md
- Execution/P11/T430-shots/ (before and after shots, PDF contact sheets), Execution/P11/T430-critique/ (impeccable snapshots), Execution/P11/T430-unused-keys.txt

**Modified:**
- .claude/skills/carta-design/SKILL.md (owner decisions of 2026-10-15)
- continent-app/src/browse/DetailSkeleton.jsx (DetailPage rewritten), BeachPage.jsx, LakePage.jsx, MountainPage.jsx, TrailPage.jsx, CyclePage.jsx, StubPage.jsx, Signature.jsx, KeyFacts.jsx, PointMap.jsx, DestMap.jsx, DestinationPage.jsx, DestinationsTab.jsx, SectionOpening.jsx
- continent-app/src/components/ui/Card.jsx (`wrap`), components/InfoDot.jsx (a dot with its own title and body)
- continent-app/src/lib/detailSkeleton.js, beachStory.js, lakeStory.js, mountainStory.js, trailStory.js, openingScreen.js, glossary.js
- continent-app/src/hooks/usePlaceExits.js, map/tokenColors.js, data/attribution.js
- continent-app/src/styles.css, styles/04-ui.css, 30-section-opening.css, 63-v6-destinations.css
- continent-app/src/i18n/{en,de,nl,fr,es,it}.js
- continent-app/public/_headers, continent-app/vercel.json, docs/tos/data_licenses.md
- continent-app/scripts/verify_beaches.mjs, verify_lakes.mjs, verify_mountains.mjs, verify_trails.mjs, verify_trail_page.mjs, verify_destinations.mjs, verify_places_tab.mjs
- continent-app/tests/outdoorV3.test.mjs

## Commands run

```
cd continent-app && npm ci && node scripts/sync-data.mjs --split-only
npx vite build && npx vite preview --port 5298 &
CARTA_PORT=5298 node scripts/measure_item_pages.mjs --label=before --shots=../Execution/P11/T430-shots
pip install fonttools brotli pypdf
python3 (instantiateVariableFont on google/fonts Figtree[wght].ttf at 400, 600, 700; tnum frozen into cmap; PostScript names Figtree-Regular, -SemiBold, -Bold)
npm test; npx eslint <touched files>; node scripts/ci/design-lint.mjs
CARTA_PORT=5298 node scripts/verify_{beaches,lakes,mountains,trails,trail_page,cycling,destinations,destination_page,places_tab,item_pdf,explore,keyboard,quality_floor}.mjs
CARTA_PORT=5298 node scripts/measure_item_pages.mjs --label=after --shots=../Execution/P11/T430-shots
sh .claude/skills/impeccable/scripts/impeccable context|detect|critique-storage
git push -u origin claude/item-pages-visual-redesign-f8gvad
```

## Config and secrets set

None. The CSP in `public/_headers` and `vercel.json` gained `https://tiles.mapterhorn.com` in connect-src and img-src for the 3D terrain tiles.

## Before/after measurements

Measured by `scripts/measure_item_pages.mjs` on the production build, before (tag `before`, 2026-10-15) and after. "Words" counts visible words on the first screen; "sentences" counts prose sentences on the whole page; "height" is the page's scroll height in px. The sandbox blocks external photographs and map tiles, so the after gallery renders its placeholder and "photos in the first screen" reads 0 where the page now leads with a gallery (before, a broken hero still counted as one image).

| Page (view) | Sentences before | after | Height before | after | Clipped titles before | after |
|---|---|---|---|---|---|---|
| Mountain Korab (desktop) | 21 | 5 | 2,532 | 2,261 | 0 | 0 |
| Lake Bled (desktop) | 19 | 11 | 2,577 | 2,230 | 0 | 0 |
| Beach Es Trenc (desktop) | 13 | 6 | 2,179 | 2,024 | 0 | 0 |
| Trail 20050 (desktop) | 10 | 2 | 2,410 | 2,391 | 0 | 0 |
| Cycle route 10 LU (desktop) | 11 | 0 | 2,712 | 2,263 | 0 | 0 |
| Tour Ammer-Amper (desktop) | 9 | 0 | 2,635 | 2,098 | 0 | 0 |
| Mountain Korab (phone) | 21 | 5 | 2,842 | 3,192 | 0 | 0 |

On a phone the item pages grew by 300 to 530 px: the reasons, Before you go and the alternatives are now photo cards and icon rows rather than one line each, and the gallery leads. Photographs available to the gallery: beaches 4 each, lakes 4 to 5, mountains up to 6 (85% have 6), trails 21% have any. Section rail tiles swipe up to four photographs. Controls under 44 px on a phone: the map's 2D/3D segment (40 px wide) was found by the after measure and fixed in the closing commit.

Impeccable critique (dual-agent, Nielsen heuristics /40), item pages: before 22/40; after: see "Impeccable after" below.

Harnesses after the close-out (production build, port 5298; failures marked "as before" match the baseline run of 2026-10-15 and come from the sandbox's blocked photo and tile hosts or from earlier data rows): beaches, mountains, trail_page, destinations, destination_page and journeys pass; trails 33/33 (exit 1 only on network console errors, as before); lakes fails only GB and IE lake counts (T456-e, as before); cycling 75/78 (as before); places_tab fails only "every card carries a picture" (as before); trip_page 58/60 (as before); verify_item_pdf 27/27 (new); explore 96/101 (map price labels and a photo, tile hosts blocked; Explore code untouched); quality floor: every item, trip and list screen passes, the two failures are day-planner screens; keyboard: the trip page's day track moves by arrow keys and keeps focus, the destinations lists report stops without a visible ring (row T430-i, no pre-change baseline to compare).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Item pages crashed on the stub page | SourcesLine got `sources={false}` | Guard with Array.isArray |
| DetailPage used alternatives before declaring them | Rail readiness read the merged list | Count the two inputs instead |
| Cycle GPX button rendered white | Legacy .cycle-gpx and .tpage-primary classes beat the kit | Classes removed |
| tourGpxText deleted by an over-wide edit | A search for the last `/**` cut the function | Restored from git |
| A summit reason claimed a peak higher than the route reached | trailReasons trusted the nearby-peak list | Skip summits above the route's high point plus 60 m; a loop claim needs ends within 1 km |
| "Ctrl + scroll to zoom" on every map | cooperativeGestures: true in PointMap | Off, with the trackpad and phone handling in mapGestures.js |
| Harness selectors for the strip, credit fold and old classes failed | The owner retired those parts | Harnesses moved to the new markup with a T430 note at each change |
| PDF check said "not Figtree" | jsPDF lists its 14 built-in faces in every page's resources | The harness counts embedded Figtree fonts (3 per file) |

## What is still open

The galleries, the 3D terrain, the swiped tiles and the PDF photographs could not be looked at with real images: the sandbox blocks upload.wikimedia.org and the tile hosts, so the layouts were judged around placeholders (row T430-a). The new copy in German, Dutch, French, Spanish and Italian was written in this session and wants a native read (T430-b). The destination PDF still uses the old faces and should move onto `lib/pdfKit.js` (T421-b, still open). 101 i18n keys are no longer referenced by any screen (list in this report's folder, `T430-unused-keys.txt`) and can be deleted after a check that no harness reads them (T430-c). Trails carry photographs on 21% of routes and highlights on 70%; the data contract names the fields (T430-d). The research starters "Good with children" and "Swim in {month}" were held back as facets because no layer carries the fields (T430-e). The critique's remaining findings are listed under "Impeccable after" and in rows T430-f to T430-h. The keyboard harness reports stops without a visible ring on the Destinations lists and had no run from before this task to compare against (T430-i). The before and after showcase is a private artifact: https://claude.ai/artifact/LkhGGZMfLhuMVR2vc9EnFV

## Rollback procedure

All work is on branch `claude/item-pages-visual-redesign-f8gvad` in commits 19478764 to the closing commit. To undo: `git revert --no-edit <closing>..19478764` on the branch, or do not merge it. No data migration and no schema change touches production data in T430; the CSP addition is harmless if left.

## Impeccable after

Dual-agent critique (an independent design review and an independent detector and browser pass), snapshots in `Execution/P11/T430-critique/`. Item pages scored 22/40 before and 26/40 after (Acceptable). The CLI detector found nothing in the eleven page files; the in-page overlay's findings were mostly the list under the full-screen page (false positives). Fixed in the close-out commit, then confirmed in one round: distance first in the trail fact band, one size for every hand-off secondary on one grid, the cost line reads "a person a day", focus lands on the page title instead of Back, nothing under 12 px on the item pages, the 2D/3D segment and the trip's night pins take a full 44 px tap, and the compact list rows show full titles. Held as register rows: hooks that do not sell (T430-f), method and licence prose (T430-g), and the day cost moving under the head (T430-h, the critique's question for the owner: if the price line is Carta's one mark, why does it sit under the map?). Questions skipped: the owner asked for one uninterrupted run; the open questions are rows T430-h and T431-k.
