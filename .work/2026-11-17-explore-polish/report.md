# Explore polish (G12, D10)

- Status: done, pushed on branch `p15-explore-polish` (not merged, not deployed)
- Dates: 2026-11-17 to 2026-11-18
- Level: L2, design playbook through deep-task
- Base: `origin/p15-housestyle` (the production house style; the owner's screenshots were of it, not of `main`)
- Judge: round 1 FAIL 52/80, round 2 PASS 64/80 (every criterion at 4, no blockers)

## What the owner asked (nine points) and what changed
1. **Sloppy text.** "A day, a person" and "Local transport: not yet" are off the Explore list, rails, cards and the map list (`ListHead` and `explore.colUnit` retired). The transport gap now lives in the price sheet's "In this price" tab.
2. **Price clarity.** The figure carries its unit ("/day", or "/day for {n}" in group view, never "total"). Bed and food sit joined; the plus shows only when the rounded euros add up. The return flight stands apart.
3. **Trip dock.** Under the category tabs on the right: a tune glyph (plane over a slider) and a chevron. Holds Travelling as, From, When, and a person or the whole group. On desktop it replaces the header settings line on Explore and Destinations.
4. **Row icon.** The save control is a bookmark that fills when saved, with a tick; the cairn stays the My trips mark. "Save" / "Saved" word beside it from 1100 px.
5. **Style dock.** Bottom-left disc in the style's colour, replaces the header style door. Opens to the style list and the two halves (how you stay: who, stay, food, way; how you explore). Pane text cut. Same component and motion as the Trip dock; one open at a time.
6. **Tap a price part.** The figure and each chip open a price sheet: Flight (the real legs as route cards, a cheapest-by-day bar strip, the flights on a chosen day, a difference pill, "View on Google Flights", and a "flights + bags (our estimate)" line so the sums add up), Stay and Food (one basis line, "Change your stay/food settings" opens the Style dock on that row), In this price. Copy written by a humanizer pass in six languages.
7. **States.** The phone toolbar is one row: Sort, chips with a sticky Clear all and an edge fade, the Trip dock. Strong match is a chip that counts and clears. Checked 900/900 over 11 states, 4 widths and 6 languages.
8. **Search.** A field: magnifier and "Choose where to go", no trip line; applied, Back and Share inside, Filters outside.
9. **Header and sign-in.** Together pill with a people glyph and its word, a Sign in pill, and for guests an account icon beside it (Account stays reachable). One `requestAuth(mode)`. The bug: a build without `VITE_SUPABASE_*` rendered no sign-in dialog, so the press did nothing; now it opens, or says sign-in is off.

## Decisions made on the way
- Two docks, no row in both (critique: two editors of the same rows confused).
- Phone docks and sheet are real modals; desktop are popovers.
- CSS motion on tokens only (the Motion library is only in the home chunk).
- Guest header keeps an account icon (a redesign must not remove the way to Account).

## Checks
- Lint 0 errors (13 baseline warnings); design-lint 0 new; fast build passes.
- `npm test`: no failing assertion beyond the base. The base fails 28 of 2157; this branch's quiet run fails 24 of 2207, all in the base list or the intermittent vite 60 s SSR timeout (each rerun alone passes, or times out on the base too).
- `verify_docks` 77/77, `verify_explore_states` 900/900, `verify_together_signin` 14/14 configured and 10/10 auth off; older verify scripts match or beat the base on the same setup (table in the run folder's `checks.md`).
- Docs: `check_entry_points` passes; `drift.py` flags only the SCHEMA wire table, as on the base.

## Not verified
- The owner's production build variables (if they are set, the owner's sign-in case had another cause).
- Home airport chips (dev data has one airport), the ground-way flight tab, reduced motion on a device.
- The desktop empty state is off-centre on the base too; left as is.

## Changed files (32 commits)
App: `src/components/dock/` (Dock, dockStore, TripDock, StyleDock), the price sheet and Flight tab under `src/components/price/`, `src/lib/flights/fareDays.js`, `src/lib/price/rowFigures.js`, `src/lib/price/priceSheet.js`, `HouseParts.jsx`, `PlaceRow.jsx`, `ExploreCards.jsx`, `ExploreRails.jsx`, `MapPlacePanel.jsx`, `ExploreToolbar.jsx`, `useExploreChips.js`, `chipRules.js`, `OverviewHero.jsx`, `SearchDock.jsx`, `AppHeader.jsx`, `HouseIcons.jsx`, `App.jsx`, `shell/AppOverlays.jsx`, `TravelStylesSheet.jsx`, `DestinationsTab.jsx`, `SettingsLine.jsx`, styles `62`, `84`, `86`, `89`, `90`, `96`, six i18n catalogues; tests `dock`, `requestAuth`, `rowFigures`, `priceSheet`, `fareDays`, `exploreChips`, `searchField`, `headerPills` and updates; scripts `verify_docks`, `verify_explore_states`, `verify_together_signin` and selector updates in six older verify scripts. Docs: `docs/HANDBOOK.md`, `DESIGN.md`, `ROADMAP.md` (G12, D10), `docs/project-map.md`, `docs/lessons.md`. Full list: `git diff --stat origin/p15-housestyle p15-explore-polish`.

## Undo
Revert the merge of `p15-explore-polish` once it is merged (`git revert -m 1 <merge>`), or revert single commits; each step is its own commit. No data, schema or migration change; settings and URL keys unchanged.

## Run folder
Brief, plan, nine explorer files, proposal, four critiques, decision, copy deck, flight tab spec, judgements, checks and screenshots stay in the main checkout's `.work/2026-11-17-explore-polish/` (untracked, per decision 0002). The approved mock: https://claude.ai/artifact/FJfwsjFhpeqc4yZQpLT8ZD
