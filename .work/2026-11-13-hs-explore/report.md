# Report: explore lane of the house style (G1)

Status: done
Branch: `p15-hs-explore` (worktree `wt/hs-explore`), from `p15-housestyle` at `1bc221b9de`; commits `abffbf8e36`, `b49fc84f60`, `3aa3ee625c`, `3869dd3460`, `7650e2e273` and the report commit. ROADMAP: G1, with G10.

Explore and Destinations now wear the house style as "the walker's table": every focused list is a dense table of rows built from the house parts (the Score plate, the price formation, the day figure loudest), the map sits beside its list in a docked column on tablet and desktop, the rails are house rails of rail cards, and the overview opens on one search field with Ask beside it instead of a photo with text on it. Nothing the screens did was removed: `verify_explore` passes 102 of 102 (two checks new), every other verify failure fails the same way on the base build, and `npm test` shows only the 25 sparse-checkout failures it had before. Three fresh judges scored it 95, 106 and 109 of 135; the third passed every hard criterion and left one craft defect, fixed and verified after it (the lane's limit is three judges).

## What changed, per screen (before and after)

| Screen | Before (`shots-before/`) | After (`shots/`) |
|---|---|---|
| Focused list | Photo cards (3:2 photo, star Score pill on the photo, "a person a day" on every card): 4 places a screen at 390 and 820 | One row a place: photo, name with the ink Score plate, flag and country, the formation (getting there outlined, bed umber, food beige) and the day figure; the unit and dates said once in a head. 8 full rows at 390 x 844, 11 at 820. From 1024 the band word and the reason join the row |
| Overview | A photo band with "Where to next?" on the photo, a white pill field, star pills on rail photos, "Local transport" lines | The field with an ink edge and Ask as the one umber action (boxed AI mark), a quiet row (All filters, doors, Per person or Whole group, Map); rails on the house `Rail` with rail cards; the unit said once over the rails |
| Map | A floating panel from 1024, a 300 px column at 769 to 1023 cutting names to one letter; a beige picked pin | A column docked beside the map in one frame (340, 380 from 1200, 420 from 1440) with stacked rows and its own unit head; pins as paper price plates, the cheapest a beige plate with a diamond, the chosen pin the umber plate settling without overshoot |
| Phone dock | A gradient Ask disc with a saffron spark, pill field with shadows | A flat field with an ink edge and the kind's pictogram, Ask a solid umber tile, round paper Back and Filters doors |
| Toolbar | Pills scrolling past the edge; Countries ran off at 360 | Pills wrap and shrink with an ellipsis; on a phone the dock names the list, so the title is read, not drawn |
| Filters | Lagoon-era pane and sheet; the sheet rose from the bottom edge on a desktop | Ink section heads, rule hairlines, controls on the control edge; the sheet a centred dialog from 769 px |
| Destinations | Story cards with pills on the photo, old pictograms | House pictograms on the tabs, the ink-edged where field, rail cards with the Score beside the name |
| Travel styles, start dialog | Brown link-like choices, sun and lagoon discs, the AI mark on a travel style | Tiles on the control edge, one quiet disc, the pack for a style; the start dialog's taste button the pack too |
| States | The raw key "pkind.lake" on a chip | "Lakes"; the empty state carries the dashed blaze |

Screenshots: `.work/2026-11-13-hs-explore/shots/<screen>-<width>.png` for explore, explore-list, explore-cheap, explore-map, explore-map-pick, explore-filters, explore-sort, explore-empty, explore-search, dest-trails, dest-trails-list, dest-beaches, dest-trips, travel-styles, start-dialog at 390, 820 and 1440, plus 1180 for explore, explore-list, explore-map, explore-map-pick and dest-trails, plus `shots-extra/explore-map-1280.png`. Width sweep: `sweep.txt` (60 of 60 clean, six screens) and `sweep-final.txt` after the last fix (20 of 20, list and map). Not committed.

## Every function kept
The full control list is `explore-code.md` section 2 and `destinations-code.md` section 2. What moved or went, and why it is not a lost function:
- The overview photograph and its credit went with the photo (its headline sat on the photo; DESIGN.md: text never on a photo). The search, Ask routing, empty search and every quick chip stay.
- An Ask button now sits beside the field on tablet and desktop; it calls the same `openAskChat` as the phone dock's Ask.
- The rail lead facts and rail lines are not drawn (StoryRail had stopped drawing them in T968; the cards show the cheapest day, the month and the Score). See all, arrows, arrow keys and the 12-card cap are kept by the kit `Rail`.
- The list's photo cards became rows: the same link, `aria-current`, save outside the link, hover preview, price items press, month verdict and taste lines.

## Checks
See `checks.md`. Final: `npm test` 2,118 tests, 25 fail, exactly the sparse baseline; `npm run lint` 0 errors; fast build ok; design-lint 0 new (4,394, down from 4,409); token-contrast 0 under; css-routes all route-only; impeccable `[]`; docs checks ok apart from the old `docs/SCHEMA.md` drift; `verify_axe` 0 on Explore list, map and Destinations at 390, 820 and 1440; width sweep 60 of 60 clean; `verify_explore` 102/102; the other lane verify scripts fail exactly as they do on the base (stale selectors, the Dutch browser locale, CORS from the live data host, a sparse data file).

## Judges
- `judgement-1.md`: FAIL, 95 of 135. Fixed: units visible once over rails and the map column, narrow rows, one rail card grammar, house icons on the quick row, List or Map route motion and the sort and filter glide.
- `judgement-2.md`: FAIL, 106 of 135. Fixed: the map column at 1180 and 1440, the phone country beside a water mark, the unit head's inset, the route class ended by a child's animation.
- `judgement-3.md`: FAIL on one criterion only, 109 of 135; every hard criterion passes (accessibility 4, honest numbers 4, every function 5, every size 4). The one defect (place names cut in the 340 px docked column, caused by round 2) is fixed in `7650e2e273`: the name takes the full line, the day figure faces the country, long names wrap; a probe of 120 names and countries at 820, 1180, 1280 and 1440 finds none cut, `verify_explore` checks it (102/102), and the list and map sweep is clean (20 of 20). No fourth judge was spent; the orchestrator's judges should confirm craft.

## Departures from the house style, and why
- `PlaceScore` and `RowFormation` (`browse/explore/HouseParts.jsx`) are lane-built versions of the kit's `ScorePlate` and `Formation` on the same classes: the kit versions cannot say "about 8.1", "Not yet", the traveller's price view or the press that opens the price items. `foundation-requests.md` asks for the kit to absorb them.
- Phone rails keep DESIGN.md's 76 percent rail card (about one rail a screen), against the older owner note T968 (two across); recorded for the owner in `handbook-notes.md`.
- The phone quick row on Destinations and the active chips stay one swipe row (owner decisions T1038 and T474).
- Price bands on the cheapest sort (decision 0012, must-fix 1) are not built: the app has no such feature, and adding one is new behaviour.

## Final tokens
No token changed (the lane reads roles only). New screen-scoped classes: `.xrow-hs`, `.xlist-head`, `.xform`, `.xscore`, `.xrc-*`, `.xempty-mark`; the list container query `xlist`.

## Files changed
- `.claude/skills/carta-design/references/explore.md`: the lane's look rules (new first section)
- `continent-app/scripts/verify_explore.mjs`: selectors moved to the new markup, two checks added (country never cut)
- `continent-app/src/browse/ExploreCards.jsx`: the save control is the cairn and pops on the traveller's own press
- `continent-app/src/browse/ExploreCategories.jsx`: house pictograms
- `continent-app/src/browse/ExploreMap.jsx`: a pin's name starts with its visible text (WCAG 2.5.3)
- `continent-app/src/browse/ExploreRails.jsx`: the house `Rail` with rail cards
- `continent-app/src/browse/ExploreTab.jsx`: the hero photo prop dropped; house icons on the view toggle
- `continent-app/src/browse/MapPlacePanel.jsx`: rows and the Score plate from the house parts; the unit head
- `continent-app/src/browse/StartDialog.jsx`: the pack on the taste button
- `continent-app/src/browse/StoryRail.jsx`: Score and status under the photo; house arrows
- `continent-app/src/browse/TasteDoor.jsx`: the pack icon
- `continent-app/src/browse/TravelStylesSheet.jsx`: the pack on "How I travel now"
- `continent-app/src/browse/explore/ExploreCard.jsx`: draws `PlaceRow`
- `continent-app/src/browse/explore/ExploreContent.jsx`: the ledger, the unit heads, the empty mark, the route change and the reflow glide
- `continent-app/src/browse/explore/ExploreToolbar.jsx`: house icons
- `continent-app/src/browse/explore/HouseParts.jsx` (new): `PlaceScore`, `BandWord`, `RowFormation`
- `continent-app/src/browse/explore/OverviewHero.jsx`: the waymark top
- `continent-app/src/browse/explore/PlaceRow.jsx` (new): the row and `ListHead`
- `continent-app/src/browse/explore/SortMenu.jsx`: house icons
- `continent-app/src/browse/explore/kindLabel.js` (new): the size word for a chip, never a raw key
- `continent-app/src/browse/explore/useExploreChips.js`: reads `kindLabel`
- `continent-app/src/components/SearchDock.jsx`: house pictograms and icons
- `continent-app/src/i18n/de.js`: `explore.colUnit` ("A day, a person", the unit said once over a list) added under the `// lane:explore` marker; `styles.firstLead` shortened (owner rule: minimal text)
- `continent-app/src/i18n/en.js`: `explore.colUnit` ("A day, a person", the unit said once over a list) added under the `// lane:explore` marker; `styles.firstLead` shortened (owner rule: minimal text)
- `continent-app/src/i18n/es.js`: `explore.colUnit` ("A day, a person", the unit said once over a list) added under the `// lane:explore` marker; `styles.firstLead` shortened (owner rule: minimal text)
- `continent-app/src/i18n/fr.js`: `explore.colUnit` ("A day, a person", the unit said once over a list) added under the `// lane:explore` marker; `styles.firstLead` shortened (owner rule: minimal text)
- `continent-app/src/i18n/it.js`: `explore.colUnit` ("A day, a person", the unit said once over a list) added under the `// lane:explore` marker; `styles.firstLead` shortened (owner rule: minimal text)
- `continent-app/src/i18n/nl.js`: `explore.colUnit` ("A day, a person", the unit said once over a list) added under the `// lane:explore` marker; `styles.firstLead` shortened (owner rule: minimal text)
- `scripts/vite.fast.mjs.timestamp-1794815573413-ab52746a328978.mjs`: a temporary file Vite writes beside its config during a fast build and deletes after it; not committed and no longer on disk
- `continent-app/src/styles/14-filters-panels.css`: the sheet on roles, a centred dialog from 769 px
- `continent-app/src/styles/62-v6-explore.css`: the row grid, selected and linked rows, save, empty mark, tablet map toolbar
- `continent-app/src/styles/78-filter-pane.css`: the pane in the house style
- `continent-app/src/styles/79-travel-styles.css`: one tone, tiles
- `continent-app/src/styles/80-story-rail.css`: the rail grammar
- `continent-app/src/styles/81-map-panel.css`: the docked column and the pins
- `continent-app/src/styles/83-where-bar.css`: the ink-edged field
- `continent-app/src/styles/84-explore-overview.css`: the waymark top, the toolbar, rail card lines
- `continent-app/src/styles/96-search-dock.css`: the dock
- `continent-app/tests/hs-explore-parts.test.mjs` (new): 7 tests

## For the orchestrator
- `foundation-requests.md`: two non-blocking kit requests (ScorePlate with the rating's words; Formation with estimates and a pressable day).
- `handbook-notes.md`: ROADMAP lines (G1, G10; T457-e still open), optional Handbook wording, owner decisions (phone rails, price bands, "Local transport" once, start dialog's "0 nights", an always-on map), project-map lines for the three new files, keys, one lesson.
- The Ask chat (`76-ask-chat.css`) still draws `PlaceOverview` rows (place lane's component); it could adopt `PlaceRow` so Ask's places look like Explore's.
- Dead rules left in the place lane's `79-place-card.css` (`.xrows--cards`), no longer reached by Explore.

## Fix round 1 from the orchestrator's judges (2026-11-16)
The orchestrator's two judges (`judgement-orch-explore-1.md` 106 and `-2.md` 103 of 135, both "Merge: no", in the orchestrator's run folder) blocked on four items; all four are fixed in `5cf92e2ab5`, with the cheap integration items.

| # | Blocking item | What changed | Evidence |
|---|---|---|---|
| 1 | The docked map column and 600 to 1023 px lists hid the reason ("Best in Apr to May") and the column hid the region | The column and the phone drawer show the region with the country and the reason on every row; lists from 600 px keep the reason on its own line (from 1024 in its column) | `shots/explore-map-820.png`, `-1180`, `-1440`; `shots/explore-list-820.png`; `verify_explore` check "map column: rows show their reason and region" |
| 2 | The phone list showed the country only | The region and the country as two parts of one line in the language's order (`WhereLine` in `PlaceRow.jsx`), the country never shrinking; the phone row has three even lines so "Salzkammergut, Austria" shows whole. Still 8 full rows at 390 x 844 (rows 67 px, first at 244 px: the list's tabs at 46 px, the dock and head tighter); 7 at the 360 x 780 floor | `shots/explore-list-390.png`; probe of the first 10 regions: none cut; `verify_explore` "phone: rows show the region with the country" |
| 3 | "Local transport: not yet" under every rail card | Said once in the head over the rails (`ListHead` with `notes`), computed as the parts every shown card lacks; each card keeps only notes of its own (a thin bed). The head is readable to a screen reader; the unit beside it stays visual only | `shots/explore-390.png`, `explore-1440.png`; `tests/hs-explore-parts.test.mjs`; `tests/priceNotes.test.mjs` updated to this contract |
| 4 | No haptic on save | `SaveButton` calls `haptic(fav ? 'tick' : 'confirm')` after the toggle; `haptic()` plays only after a touch, behind the traveller's setting, never under reduced motion. Kit request for `IconButton` in `foundation-requests.md` item 3 | `ExploreCards.jsx`; test "saving a place commits with a haptic" |

Also done: the rail card's price row (a button) moved out of the card link; the wide list's parts take a fixed track (no drifting reason column); Travel styles fill the dialog (two rows of three); the empty state is one centred block. Left for integration with reasons: `handbook-notes.md`, section "Orchestrator fix round 1".

Checks after the round: `npm test` 2,122 tests, 25 fail, the baseline set (one timing test, "24 trips under 50 ms", failed once while the sweep loaded the machine and passed alone at 38.5 ms; the full rerun is clean); `npm run lint` 0 errors; design-lint 0 new; token-contrast 0 under; css-routes all route-only; impeccable `[]`; `verify_explore` 104/104; `verify_axe` 0 on Explore list, map and Destinations at 390, 820, 1440; width sweep of overview, list, map and travel styles at ten widths 40 of 40 clean (`sweep-r1.txt`). Shots retaken at 390, 820, 1180 and 1440 for explore, explore-list, explore-map, explore-map-pick; 390 for explore-filters and explore-empty; 820, 1180 and 1440 for travel-styles.

Files changed in this round: `.claude/skills/carta-design/references/explore.md` (rows, unit head, shared note), `continent-app/scripts/verify_explore.mjs` (reason, region, country checks), `continent-app/src/browse/ExploreCards.jsx` (save haptic), `continent-app/src/browse/ExploreRails.jsx` (shared note, price row out of the link), `continent-app/src/browse/explore/ExploreContent.jsx` (the rails' head moved into ExploreRails), `continent-app/src/browse/explore/PlaceRow.jsx` (`WhereLine`, notes in `ListHead`), `continent-app/src/styles/62-v6-explore.css` (row grids, empty state, rail head), `continent-app/src/styles/79-travel-styles.css` (grid), `continent-app/src/styles/84-explore-overview.css` (phone tabs and head), `continent-app/src/styles/96-search-dock.css` (dock gap in a list), `continent-app/tests/hs-explore-parts.test.mjs` (4 tests), `continent-app/tests/priceNotes.test.mjs` (the rail cards' notes contract).

## How to undo
`git revert 5cf92e2ab5 7650e2e273 3869dd3460 3aa3ee625c b49fc84f60 abffbf8e36` (newest first) on `p15-hs-explore`, plus the report commit. No data, schema, contract or token change.

## Next step
The orchestrator's own judges on `p15-hs-explore`, then the merge into `p15-housestyle`.
