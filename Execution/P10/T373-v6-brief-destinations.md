# T373: design brief, Destinations browse

## Task ID

T373 (design wave V1, session 4 of 10; raised by T369, no mind-map prompt).

## Date

2026-10-08

## What changed

The Destinations tab now has a written design brief, `docs/design-v6/briefs/destinations.md`, which V3, V4 and V5 build from. It holds the seven parts the task asks for: the impeccable setup and the mode (Operate, because the traveller is narrowing a catalogue to a few places to open, not being persuaded); a walk of the tab at 380 and 1280 px from a cold start and a returning visit; an inventory of 66 views, states, controls and visual settings with a verdict on each; a critique with heuristic scores and a short technical audit; the traveller's job in the research's order of need; a plan of 13 V3 items, 9 V4 items and 9 V5 items, each with files, command and check, ending in a target-state table of every control; and 10 proposals that need a carta-design rule before they are built (N1 to N10). No app file changed. Eight "before" screenshots are saved outside both repos.

The brief's main findings, so a reader of this report has them without opening it. The section openings are very long: 18,479 to 19,593 px at 380 px with 159 to 171 visible buttons, from nine icons, six rails and a 36-card page in each of Beaches, Lakes, Mountains and Cycling. On a desktop the Filters button is hidden and the side panel shows only the short facet set, so eight of nine beach facet groups have no door at the width where comparison happens. No card on the tab carries a cost, although value for money is the first thing the research says travellers weigh. Two gradient scrims and a radial gradient ship on this surface against the "no gradients" rule. Search matches substrings, so "Gent" offers Agrigento and never Ghent. The tab remembers nothing between visits. A `#region=` deep link did not open the region page on the dev server, and nothing inside the tab links to a region page.

## Files touched

**Created:**
- docs/design-v6/briefs/destinations.md
- Execution/P10/T373-v6-brief-destinations.md

**Modified:**
- Execution/_OPEN.md (rows T373-a to T373-j appended)

Outside the repos, never committed: eight JPEGs in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destinations\` (V1-opening-380, V1-opening-1280, V1-grid-380, V1-grid-1280, V1-walks-380, V1-search-380, V1-filters-380, V1-empty-1280).

## Commands run

From the T373 root worktree:

    sh "C:/Users/Gebruiker/Documents/Portfolio/Travel App/.claude/skills/impeccable/scripts/impeccable" context --target src/browse/DestinationsTab.jsx

Scratch Playwright scripts outside the repos (one browser at a time) walked `http://localhost:5199/?tab=places` at 380 x 800 and 1280 x 800 and saved the before set as JPEG quality 80, viewport only.

Assessment B, a read-only sub-agent, ran the detector over the twelve surface components in the app repo main checkout and the design lint:

    sh ".../impeccable/scripts/impeccable" detect --json <DestinationsTab, SectionOpening, PlaceCard, CardStrip, PlacesFilterSheet, CoverageEmpty, CountryPage, RegionPage, StubPage, CategoryRail, FilterChips, HonestFooters>
    node scripts/ci/design-lint.mjs    (in the app repo, without --update-baseline)

The six surface harnesses ran one after another against the dev server, with the working directory in a scratch folder so their screenshots did not land in the main checkout:

    node <app repo>/scripts/verify_places_tab.mjs http://localhost:5199/
    (and verify_category_rail, verify_places_search, verify_regions, verify_country_cards, verify_paging)

Then `git add` and `git commit` in the T373 worktree.

## Config and secrets set

None.

## Before/after measurements

This task builds nothing, so every figure is a "before" for V3 to V5 to move. Sources: the Playwright walk (DOM counts), the detector and lint output, and the harness logs.

| Metric | Before (V1) | Target named in the brief |
|---|---|---|
| Opening scroll height at 380 px, Beaches / Lakes / Mountains / Cycling | 18,479 / 18,659 / 18,744 / 19,593 px | under 8,000 px |
| Visible buttons on an opening, 380 px | 159 to 171 | under 90 |
| Visible buttons on an opening, 1280 px | 141 to 167 | not set |
| Beach facet groups reachable on desktop | 1 of 9 (the sheet holds Water quality, Underfoot, Setting, How wild, Size, Facilities, Naturist, Protected, Best for) | 9 of 9 |
| Category tabs visible at 380 px | 4 of 6 | 6 of 6 |
| Gradients in the surface's stylesheets (fills, not masks) | 3 (23-places-pages.css:581, 624, 634) | 0 |
| Cards carrying a cost | 0 | every outdoor card, if N1 is accepted |
| Heuristic score (critique) | 23/40 | not set |
| Audit health score | 11/20 | not set |
| Impeccable detector findings, 12 components | 0 | 0 |
| Design lint on the surface | 3 baseline `middot` (CountryPage.jsx:112-114), 0 new | 0 |
| First Beaches load on the dev server | 34 s at 380, 48 s at 1280 (cold Vite transform, not production) | measure on the built app in V5 |
| Screens walked | 2 widths, 6 categories, search, anywhere, near, filter sheet, country, coverage empty; the region page did not open | |

Harness results on the dev server at 5199, 2026-10-08:

| Harness | Result | Reading |
|---|---|---|
| verify_places_tab | 25 pass, 13 fail | Fails include "beaches category shows published beaches [0 cards]" (the 34 s first load outran the wait), the composed-door and trip-page chain, and "carries the country picker" on Beaches and Mountains, which the T183 opening moved down to the grid |
| verify_category_rail | 2 pass, 6 fail, then a timeout on `.explore-filter-btn` | It drives Explore's rail; Explore's filter button has a new class |
| verify_places_search | timeout | It waits for a "General" category, which was removed in UX pass 1; the assertion encodes the old design |
| verify_regions | 3 pass, 8 fail | Run from a scratch folder, so it could not find `docs/REGIONS.md` or the region index; not a product reading. Needs CARTA_REPO_ROOT and the app folder as working directory |
| verify_country_cards | timeout on `.guide-next` | The first-run guide it dismisses was not shown |
| verify_paging | timeout on page load (30 s) | The dev server was slow under the walk |

None of these is a clean baseline: the dev server is slow and shared, and three harnesses encode screens that have since changed. V3 must rerun all six on a built app (`vite preview`) before changing anything (row T373-a).

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The walk script could not write its file | The scratchpad is shared with the other V1 sessions and held another session's walk.mjs | Moved to a T373 subfolder |
| Category screenshots showed only skeletons | The first layer load took 34 to 48 s on the dev server | Waited for the first real card, up to 90 s |
| `#region=` never opened the region page | Not found. The hash was stripped and no `.rgnp` rendered within 20 s, for AT32 and for the harness's own COAST:BE-BELGIAN-COAST | Left open as row T373-d |
| verify_regions could not read its files | Run from a scratch working directory so its screenshots stayed out of the main checkout | Recorded, not rerun; row T373-a |

## What is still open

T380 has to accept or reject the ten proposals in part 7 of the brief (N1 to N10) before V3 and V4 build anything that depends on them. The cost line on cards (N1) is the largest. It also needs a join from each outdoor row to the nearest priced town, and the brief does not decide where that join lives.

The harness baseline is not clean (see the table above). V3 starts by running the six harnesses on a built app and updating, with a comment, the assertions that encode removed screens: the General category and the country picker at the head of an opening.

The `#region=` deep link did not open the region page on the dev server, and the tab has no link to a region page. The first needs an investigation (verify_regions has the check). The second is plan item V3-9.

Two items are the owner's decisions. The first is which category the tab opens on cold. Today it is Trips, while PRODUCT.md says Carta speaks to the hiker first. The second is the wording of the coverage line once it states the aim.

Two items are data gaps that a design wave cannot close. The trails wire has no Europe-wide ranking file, so walks have to open on a country. No trail start carries a public-transport fact, so the research's "start reachable by public transport" filter cannot exist yet. Both need the data lane, which the owner starts.

Three smaller items:
- Photo QA on Band 1. Two of the top cycling icons are a warehouse and an information board.
- The water-quality chip counts sum to 237 while the sheet says 240. The sheet should say how many rows have no reading.
- The phone "Get a pass" chip is tinted with the accent against the T360 rule. That belongs to the shell brief (T370).

Ownership, for T380's OWNERSHIP.md. CategoryRail, FilterChips and CountryPage are rendered by Explore, not by this tab. 44-tags.css styles the trip library's tag filter. 67 desktop rules for this tab live in 24-destination-workspace.css, which the destination surface owns. HonestFooters, which this tab renders, is also on the destination surface's list.

Every item above is a row in `Execution/_OPEN.md`, T373-a to T373-j.

## Rollback procedure

The task added two documents and ten register rows. To undo it, revert the two commits on the branch:

    git revert <report commit> <brief commit>

Or, before the merge, delete the branch p10-v6-brief-destinations. The screenshots sit outside both repos and can be deleted with the `destinations` folder under design-v6-shots. Nothing in the app, the data or production changed.

## Seven questions

No visual change shipped, so the seven questions apply to the plan and not to a diff:
1. The plan adds no hex.
2. It removes three gradients and adds none.
3. Ochre stays for ratings only, and teal and `--danger` are untouched.
4. Mono stays for figures. The new cost and count lines are figures.
5. The Filters button stops being a primary, so the tab has no competing primary.
6. Every new heading the plan names carries a verb or a number, and the brief has no dash and no banned word.
7. The thing to remove is the red tick over each category tab.
