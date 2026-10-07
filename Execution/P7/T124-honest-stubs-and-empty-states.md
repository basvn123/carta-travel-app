# T124: the honest stub and the not_applicable empty state

## Task ID

T124 (mind-map number T120).

## Date

2026-10-07

## What changed

Two things that did not exist now do. A famous walk that Carta cannot build from open data has a page of its own, and a microstate that truly has nothing in a layer says so, with the reason, three real places across the border and a way onward.

The stub page is built on the shared detail skeleton, so it opens, closes and traps focus like the beach, lake and trail pages. It prints the name and region, the one honest line ("No open route data exists for this walk yet. Here is where to get the track."), the few facts the registry holds (length when there is one, Wikipedia readers a month, Wikipedia languages, whether OpenStreetMap has the relation), one outbound link and the same GPX upload door the trail page has. The skeleton's hero, map and rating slots stay empty on purpose: nothing is scored or drawn because nothing is known. The stubs of a country sit under the walks list as a short list with a Show all button, under the coverage footer that already says "we cannot yet map 19 of them".

The microstate empty state is a module, CoverageEmpty, written to be reused. It shows the count line in mono ("Monaco, 0 lakes published"), the reason as prose in ink, the three nearest published rows under hairlines (name, then country and distance in mono, each a button that opens that row's page) and one secondary button ("See Monaco's beaches"). The reasons are the approved document's own, keyed by country and layer in `src/lib/coverageEmpty.js`: no lake over five hectares, no coast, no relief, too small for a cycling route, cycle routes that belong to the neighbours' networks, no route published yet, river beaches not in a register. Where the contract's wire carries a reason code the module prefers it; today it does not (T160-a), so the table's code is used. A nearest row further than 300 km is not listed (the Faroes); the module says where it is instead.

## How it works

Stub data. `pipeline/trails/export_stubs.py` reads `data/trails/famous_registry.json` and writes `/trails/stubs/{CC}.json`. A row is a stub when it is a trail with fame at or above 0.4 (the same bar coverage.py holds a country to), no published trail matches it by OSM relation id or folded name, and `data/reports/trails_coverage.json` judges it unbuildable (reasons no_osm_data, unresolved_seed, way_only_not_derived, failed_continuity). Reasons that mean "we have not got to it" (below_quota, unplaced, composed) are not stubs, because the honest line would be false of them. If the report is missing, the fallback is the registry's own evidence: only a row with no OpenStreetMap relation at all counts. Every stub keeps the code it was judged on. The one outbound link is, in order, the Waymarked Trails page of the relation, the OpenStreetMap relation, the Wikipedia article. Never Komoot, AllTrails or Wikiloc, for the licence reasons in spec 6.5. The app reads the file through the same cached fetch as every layer, and a country with no file is an empty list.

Empty state. `DestinationsTab` computes the microstate the traveller picked or typed (`microCc`) and, in the beach, lake, mountain and cycling "no rows" branches, tries the module first and falls back to the old sentence. The module renders nothing for a country and layer the table does not name, so it can never claim a reason it does not hold. It is also gated on the list actually being empty and on no chips being on, which is why San Marino's mountains never show it: the wire publishes Monte Titano, so I took that case out of the table (T124-d).

The upload door gained two optional props, `initialKind` and `openKey`, so the stub can open it on "track" with the label "Upload a GPX". Nothing else about it changed.

## Files touched

Root repo, branch p7-honest-stub.

Created:
- pipeline/trails/export_stubs.py
- Execution/P7/T124-honest-stubs-and-empty-states.md

Modified:
- Execution/_OPEN.md (rows T124-a to T124-e)

App repo, branch p7-honest-stub.

Created:
- src/browse/StubPage.jsx
- src/browse/CoverageEmpty.jsx
- src/lib/stubs.js
- src/lib/coverageEmpty.js
- src/styles/45-empty-states.css

Modified:
- src/browse/DestinationsTab.jsx (stub list and page, microEmpty in four branches)
- src/community/UploadForm.jsx (two optional props)
- src/styles.css (one import line at the end)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (29 keys each, after cov.why.not_applicable; all six parse, the diff is additions only)

## Commands run

```
python pipeline/trails/export_stubs.py --out <scratch>/stubs     (CARTA_DATA_ROOT = the main checkout, read only; nothing written to public/)
npx eslint <touched files>; npm run lint; npm test; node scripts/ci/design-lint.mjs
npm run build
vite on port 5212 with a config outside the repo and its own cacheDir, then vite preview on 5212; both stopped
node scripts/verify_beaches.mjs, verify_lakes, verify_mountains, verify_trail_page, verify_places_tab, verify_cycling  (url http://localhost:5212/)
a Playwright script in wt/T124-shots/ at 380 and 1280 px, with the stub files served by route interception so no generated file touched the worktree
```

## Config and secrets set

None. The shell's Supabase variables were unset in every session and nothing contacted the live project. No migration, no dependency.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Stub records the exporter builds from the registry as it stands | 0 | 488 in 42 countries | +488 |
| Of those, by code | none | failed_continuity 412, way_only_not_derived 43, no_open_data 33 | |
| Of those, by outbound link | none | OpenStreetMap 361, Wikipedia 75, Waymarked Trails 52 | |
| Stubs that carry a length | none | 10 of 488 | |
| Microstate layer cases with a true reason and nearest three | 0 | 13 | +13 |

The 488 comes from a scratch run against the main checkout's registry, wire and `data/reports/trails_coverage.json` (file listing in the first command). It is a measure of what the exporter would publish, not of what production serves; nothing is live (T124-a). Only 10 stubs have a length because the registry holds `expected_km` for 14 of its 893 famous rows; ascent and season are not in the registry and are not printed.

Checks: npm run lint 0 errors (71 warnings, the existing baseline), npm test 316 of 316, design-lint 196 found, 196 in the baseline, 0 new, build passes. Harnesses: beaches, lakes, mountains and trail_page all pass in full, places_tab 37 of 38 (the one failure, "every card carries a picture", is a lake image that fails to load offline, the same as master), cycling 70 of 72 as on master. The browser script passed every check at 380 and 1280 px with no page errors and no horizontal scroll: stub list, stub page, upload dialog, and the module for lakes (Monaco), mountains (Monaco), beaches (Liechtenstein) and cycling (Monaco), a nearest row opening its page, and the see-other button switching category. Screenshots are in wt/T124-shots/shots/.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The first screenshot run could not find the category buttons at 1280 px | On desktop the categories are `.side-cat` in the left rail, not `.places-cat` | The script selects both |
| Monaco's mountains showed the same summit twice | A border peak is published once per country | `nearestThree` keeps the nearer of rows with the same name |
| San Marino mountains never showed the module | The wire publishes Monte Titano, so the list is not empty | Removed that case from the table (T124-d) |
| styles.css showed 57 changed lines for one added import | The file has mixed line endings and the shell rewrote them | Rebuilt from the original blob bytes plus one line, 1 line in the diff |

## The seven carta-design questions

Answered from the diff and from the screenshots in wt/T124-shots/shots (stub-list, stub-page, stub-upload, empty-lakes, empty-mountains, empty-beaches, empty-cycling, each at 380 and 1280 px).

1. Hex values outside :root. None. 45-empty-states.css uses tokens only, and the two pages carry no inline colour.

2. Gradients, colours not in DESIGN.md, a second saturated hue. None. The only accent use is the focus outline on the new buttons and rows. The module is prose on paper with hairlines and one bordered button, no card, no tile, no shadow.

3. Ochre, teal and danger. Not used. No rating appears on a stub or in the module, because nothing there is scored.

4. Mono. Mostly right: the facts on the stub page (readers, languages, length), the km on the stub rows and the distances on the nearest rows are measured facts in mono with tabular numbers. Two things break the mono rule and are raised as T124-f: the module's count line ("Monaco, 0 lakes published") is a sentence set in mono, which the approved onboarding document asked for but the carta-design rule rejects (a number inside a sentence is --ui); and the nearest rows set the country name in mono beside the distance, where only the distance is a measured fact. No number in a column is set in sans.

5. Primary buttons. None on either page. The stub page has an outbound link styled as the existing secondary action and the upload door, which is a secondary; the module has one secondary button. The upload dialog's send button is the one primary in view while it is open, which is T333's design.

6. Headlines and banned words. The stub list head carries a number ("39 famous walks we cannot map yet"), the section heads carry verbs ("What we know", "Where to get the track"), and the page title is the walk's name. The diff is free of em dashes, middots and the banned words. Walk names are passed through stripDashes, so a registry name like "E4: Ada - Zrenjanin" shows with a comma.

7. Remove one thing. Candidates seen on screen: the "Mapped on OpenStreetMap, Yes" row, which tells the reader little when the link beside it already says so; and two skeleton leftovers that carry nothing on a stub, the "Getting there" section with its fallback note ("The data has no start point for this one yet. Search its name in your maps app.", which is generic and not about a stub) and an empty "Where this comes from" fold that opens onto nothing but one credit line. The skeleton leftovers are raised as T124-f; the Yes row stays because it is one of the few things the registry knows.

## What is still open

The stubs are not live until the exporter runs in the data lane and the wire is rebuilt, which is an owner step (T124-a). A stub has no URL of its own and is not in the search index, so a share link and a search for "Peaks of the Balkans" do not reach it yet (T124-b). The list shows under the walks listing only (T124-c). The onboarding document's microstate table gives San Marino a mountain sentence the wire contradicts (T124-d). The upload door's use of a registry id as item id needs a check against begin_upload once its migration is pasted (T124-e); T333-d, the door on the other four layers, stays open.

Row T111-b (the not_applicable empty state of spec 1.6) is already marked closed by T160 in the register; its not_applicable half is what this task built, and the inline coverage sentence is T160's.

What T367 must know. `CoverageEmpty` takes `layer`, `cc`, `countryName`, `onOpen` and `onSeeOther`, and returns null for anything `microCase` does not name; widen it by adding cases to `CASES` and `cov.reason.*` keys, and the other six codes' sentences (`no_open_data`, `below_quota` and so on) have no keys yet. `loadNearest(layer, cc)` serves beach, lake, mountain and cycling only and takes its neighbours from the `MICROSTATES` table, so a region or radius empty state needs a different centre and neighbour source. The tab's `microEmpty(layer, facets)` is the call site pattern. Styles for the module are in `src/styles/45-empty-states.css`; extend that file. The desktop category buttons are `.side-cat`. Harnesses that open the root must seed `continent.homeSeen.v1`.

## Rollback procedure

Revert the app commit on p7-honest-stub (git revert, or reset the branch to the master it was cut from) and the root commit that carries this report, the exporter and the register rows. Nothing was written to data, public/, the database or any migration, so there is nothing else to undo. Removing only the exporter's output (`public/trails/stubs/`) hides the stubs without touching code.
