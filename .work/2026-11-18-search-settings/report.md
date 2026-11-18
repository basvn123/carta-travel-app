# Run report: Explore top (search, Settings and style as one system)

- **Status:** done; judge 3 FAIL on two 3-scores, every listed fix then made and verified by scripts (owner asked to ship when done)
- **Date:** 2026-11-18 to 2026-11-19 · L2 · crew:design via deep-task, the session orchestrated only · ROADMAP G12, D10
- **Proposal the owner approved:** https://claude.ai/artifact/LfaMcva8X1URJJjNv76q82 (v4, plus owner changes recorded in `decision.md`)
- **Branch:** `p15-search-settings` from main 5eae65fc5a, 40 commits, merged to main by fast-forward
- **Undo:** `git revert` the run's commits (2082aeea5d to the report commit); data: the gazetteer shards under `public/search/places/` are new files (delete to undo); no schema change

## Summary
Explore's top is one calm system. A search field finds any country, region, town or village in Europe in six languages (GeoNames, 101,773 towns, 20 lazy shards); a place Carta does not cover shows "Near {place}" with Carta's places by distance, and feature words become tokens. On a phone a quiet settings strip sits under the search and above the category tabs (the heart with your style, From, When, Getting there, Prices shown), swipes sideways with every word in full, and pins at the top while the list scrolls. On desktop a Settings button (fader glyph) and a one-line summary sit in the sticky band. Settings is a Style Studio-style sheet of five rows: Start (your current location, any town, every country A to Z), When (dates, a month, any time, cheapest, nights), Getting there, Style, Prices shown (a day or the whole trip, each person or the group). The heart is always the style button, bottom left, sliding away while the list scrolls. The "(likely)" chips, the whole old filter pane and its doors, Priced for, the Trip dock, the old phone search sheet and "All filters" on the other tabs are gone. Six house tab icons replace the stock pictograms; sections sit closer together.

## What was asked
`brief.md` and the APPROVED block in `decision.md`; later owner asks: no Settings button on phones but the swipe strip, the strip above the tabs, less space between sections, the heart bottom left.

## What we did
1. Four explorers (search, settings logic, style and layout, outside references), three proposers, four critics, a data measurement (`measure.md`), the decision, the proposal artifact and four owner revisions.
2. Build in parallel lanes on disjoint files with a shared contract (`contract.md`): engine, Settings sheet, search and gazetteer, band and icons; then integration and removals.
3. Four flow checkers (band, Settings, search, interactions and price truth): 1 blocker, 19 majors; one fix round over all lanes.
4. Owner's band and spacing changes with the impeccable layout reference.
5. Judges: round 1 FAIL (3 criteria at 3), round 2 FAIL (2), round 3 FAIL (2); every listed fix made; the last round's fixes verified by script, not by a fourth judge.

## Why
- Settings decides how prices are worked out, the style who travels and how, search where you look: three controls that each show the other two, so nothing is asked twice.
- "Cheapest" means the cheapest checked dates: measured coverage of checked fares is 21 to 56 % of places by origin; elsewhere a labelled typical fare (median of checked fares) or "No flight checked yet".
- Rows never disappear: a missing way price says "not known yet"; the order holds while Settings is open.

## Files changed
`git diff --stat 5eae65fc5a...p15-search-settings`: about 142 files, 9,800 added, 4,400 removed. Main ones:

| Area | Files |
|---|---|
| Engine | `src/lib/settings/*` (model, setters, summary, priceFigure, grandTotal, monthFrom, nearestTown), `src/lib/price/*`, `src/lib/flights/*`, `src/hooks/useExploreRows.js`, `src/lib/urlState.js` |
| Settings sheet | `src/browse/settings/*`, `src/styles/81-settings.css` |
| Search | `pipeline/gazetteer_layer.py` + task, `src/lib/search/*`, `src/browse/search/SearchPanel.jsx`, `src/styles/82-search-panel.css`, `useExploreCatalog.js` |
| Band and icons | `src/browse/band/*`, `src/styles/80-band.css`, `ExploreCategories.jsx`, `HouseIcons.jsx`, `StyleDock.jsx`, `discClear.js`, `89-dock.css`, `85-explore-rails.css` |
| Removed | filter pane and doors, WhyChips on cards, PricedFor, Strong match, TripDock, SearchDock, WhereBar "All filters", dead DestinationsTab filter code, about 70 i18n keys (retired list in `tests/home.test.mjs`) |
| Checks | new `scripts/verify_band.mjs`; rewritten verify_desktop_shell, verify_destinations, verify_trails, verify_trail_page; tests for engine, sheet, search, gazetteer, band |
| Docs | HANDBOOK (Explore top, settings, search, price basis, style door, spacing), DESIGN (icons, band, sheet), project map, ROADMAP G12/D10, PRICE-003, generated reference |

## How it was checked
`checks.md`. Final full npm test: 2333 tests, 2303 pass, 17 fail (one ours, fixed in 985cd07230; the rest the base set on this Windows machine: path, CRLF, promptRegistry, timeouts). verify_band 84/84, verify_destinations 98/98, verify_trails 48/48, verify_trail_page 36/36, verify_desktop_shell 21/21, eslint 0 errors, fast build OK.

| Criterion | J1 | J2 | J3 |
|---|---|---|---|
| Owner asks | 4 | 3 | 4 |
| Nothing old left | 3 | 4 | 4 |
| Interaction | 4 | 4 | 3 |
| Honest numbers | 4 | 4 | 4 |
| Craft | 3 | 3 | 3 |
| Accessibility | 4 | 4 | 4 |
| Checks and docs | 3 | 4 | 4 |

Judge 3's fixes (library search in six languages, disc clear of body text, unit line wraps) are in fd35918c5e and verified by the scripts above.

## Open issues and risks
- On the empty French results screen the heart disc covers 6 px of the city-route door's label.
- Lakes and other water bodies are not in the gazetteer ("Comer See"): ROADMAP G12 follow-up.
- Ground ways for a country start use the capital's town (no station data for "best connected").
- Month cards show a figure only where a checked return flight of the trip length exists that month.
- The gazetteer task must run in the main checkout before shipping so R2 gets the shards.

## Next steps
The search results page and how results look (the owner's next prompt).
