# V5 plan: Trips (the journeys library and the trip page)

Written by T407 (design wave V5, 2026-10-09) before the first app edit. This is the planning step the wave asks for: impeccable audit and critique of the V4 result as merged (app master 592db0d), then the changes in order, the files and the checks. The brief is `docs/design-v6/briefs/trips.md` (V5 list, part 6, and its Direction check); the rules are `docs/design-v6/DIRECTION.md` and the carta-design skill. Ownership is `docs/design-v6/OWNERSHIP.md`: this session edits only the files it gives to 'trips', `src/styles/66-v6-trips.css`, the i18n keys under the trips prefixes, and the trips harnesses.

## Audit and critique of the V4 result (impeccable, unattended)

Impeccable context was run once from the root worktree with `JourneyPage.jsx` as target. As in V3 and V4 it loaded PRODUCT.md and DESIGN.md but resolved the project root to the app worktree; init was not run. The owner's instruction of 2026-10-07 answers the AUTONOMY_DIRECTIVE_CHECK: no decision page, live mode or question tool. Questions skipped: unattended run.

The audit is a Playwright walk of a production build of the merged base on Pixel 5 (Chromium) with every fold opened, over four weeks (hiking, cycling, city, water sports), plus a German and a French walk at 360 px and the keyboard harness. What it found, against the V5 list of the brief:

1. Tap targets (V5.1): zero buttons, links or selects under 44 px inside `.jpage` or the list on a coarse pointer. Only the 22 px booking checkboxes show; they sit in whole-row labels, so the row is the target (to be measured as the row, and pinned with a rule).
2. Names (V5.2): no `p` inside `p` (the hook is one paragraph since V3), no validateDOMNesting message in the console, every control has a name, the headings run H1, seven H2 groups, H3 and H4 without a skip. One failure remains: "More about this day" is the name of seven buttons on a week. The decks' Previous, Next and Show all repeat across decks (FlashDeck and DayTrack are the shell's; a register row).
3. Escape and back (V5.3): Escape closes the page and focus returns to the opening card on all four weeks. A stale history entry stays when the traveller leaves through "See day prices in <town>" (row T387-g).
4. Long words (V5.4): in German and French at 360 px the page and the library have no sideways scroll and no clipped label, except the page bar: its small serif title is cut to "And..." beside a long back label, which tells the traveller nothing. The photo credit line overruns its box by 4 px.
5. Print (V5.5): there is no print block for the page. A fold's body mounts only while open, so a printed page shows only the folds that happen to be open.
6. Harnesses (V5.6): verify_keyboard is 20 of 20 on the base (the journey walk exists); the quality floor already walks the journey page.
7. Clean-up (V5.7): `jpage-chip` and `jcomposed-icon` have no uses left in src. The old composed-page rules in `24-destination-workspace.css` are not this surface's file (row T387-h stays).

Heuristic read, V4 result: status 3, real world 3, control 3, consistency 3, error prevention 3, recognition 3, flexibility 3, minimal 3, recovery 3, help 3 (the V4 critique gave 25 of 40; the selected day, the card press and the settled figures lifted it). The remaining weakness is not visual: it is what a phone cannot show (a printed plan, the name of a repeated button, a long label).

## The changes, in order

1. Tap targets and rows (brief V5.1). A rule in the v6 sheet pins the booking row's label to `--tap` and makes the whole row the target on a coarse pointer, and the measure runs on every state (folds open, the town receipt, both lengths). Files: `66-v6-trips.css`. Check: Playwright scan, zero under 44 px on a coarse pointer inside `.jpage` and the list at 360 and 393.
2. Names (brief V5.2). The day card's disclosure is named "More about day {n}" through `aria-label` (visible text unchanged); one new key in the six catalogues. Files: `JourneyPage.jsx`, six `src/i18n/*.js`. Check: no two buttons in `.jpage` share a name except the shell's deck and track controls.
3. Escape and back (brief V5.3, row T387-g). Leaving through "See day prices in <town>" first goes back through the entry the page pushed, then runs the exit; Escape inside an open InfoDot or a deck keeps closing that first (confirmed, not changed). Files: `JourneyPage.jsx`. Check: after the exit, one Back press leaves the Destinations tab's own history, not a blank step; Playwright counts `history.length` before and after.
4. Long words and six languages (brief V5.4). The page bar gives its title the room: the back label takes at most 45 percent of the bar and shrinks first, the title takes the rest on one line with an ellipsis only after that; the credit line wraps instead of overrunning. Files: `66-v6-trips.css`. Check: de and fr at 360 and 1280 show every label whole (the bar title shows at least ten characters).
5. Print (brief V5.5). A print block: the page prints as the plan (strip, receipt, the days as a list, booking order, pack list); no rail, no bar, no hero scrim, no day-track arrows; the days print one under another, not sideways. Fold bodies mount only while open, so the page opens every fold when the print dialog is asked for (`beforeprint`) and puts the folds back on `afterprint`. Files: `JourneyPage.jsx`, `66-v6-trips.css`. Check: `page.emulateMedia({ media: 'print' })` shows the rail, bar and arrows hidden and the days stacked; a PDF of the hut circuit has no empty page.
6. Harness updates (brief V5.6). `verify_journeys` adds: the booking rows are `--tap` high, "More about day" names are distinct, leaving through the town exit leaves no stale entry, and the print media hides the rail. Each new assertion carries a comment saying why. Files: `scripts/verify_journeys.mjs`.
7. Clean-up (brief V5.7). Confirm the retired chip and icon rules are gone (done in V3/V4) and that the page shows its hero credit once; nothing in `24-destination-workspace.css` is touched (not this surface's).

Not built, with the reason, each also a register row:

- The map of the week and the day track's `onSelect` (rows T397-a and T397-b): the shell's `DayTrack.jsx` change lands in T401, parallel to this session and not merged; the wire has no day coordinates.
- Distinct names for the decks' and track's Previous, Next and Show all: the shell's files.
- The journey case of `openFeature` (row T390-c) and the boot reader (row T387-a): `App.jsx` is the shell's.

## Checks at the end

`npm run lint` 0 errors; `npm test`; `node scripts/ci/design-lint.mjs` 0 new; the six i18n catalogues parse; `npm run build`, then dist/ and dist-data/ deleted; `node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md`; the four trips harnesses (verify_journeys, verify_trips, verify_trip_page, verify_pack_grid), verify_keyboard 20 of 20 and verify_quality_floor on a preview build; `impeccable detect --json` over every changed file; the after screenshots (at most ten, JPEG 80, viewport only, named V5-<view>-<device>) on iPhone 13 WebKit, Pixel 5 and desktop 1280 x 800, with the 360 x 740 floor, landscape, keyboard, safe areas, dvh, thumb reach and tap targets checked on the phones; carta-design's seven questions in the report.
