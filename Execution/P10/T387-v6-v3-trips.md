# T387: design wave V3, Trips (structure, information and flow)

## Task ID

T387 (design wave V3, surface key 'trips'; plan in `docs/design-v6/plans/V3-trips.md`).

## Date

2026-10-08

## What changed

The trips surface now puts what a traveller needs in the order they need it. The library's ten style cards carry a caption band under the photograph with a from-price a person and its length ("From €255 a person, 7 days" for hiking), hiking comes first, and the honest coverage line sits above the grid instead of after it. A style's list has one filter row: the length as a two-segment control (the short version first, as on the page), one Filters button that opens the shared filter sheet with cost, month, tag and the sort, and removable chips for whatever is narrowing the list; Clear all no longer resets the length. The journey page opens on the title, the photograph, the suitability strip with the price "a person", the length control, the hook, the not-for lines and a location line; the four chips that repeated the strip are gone. Its eighteen sections are seven h2 groups that all sit on the sticky rail (Fit, Cost, Getting there, The week, Sleep, Prepare, Risks). The Cost group leads with the trip's own itemised budget, cost bar and Lifestyle slider on every trip, where before the nearest town's first-run receipt replaced it whenever a priced town was near; that town receipt is now a labelled second view, offered only for a week spent in one base, with nights equal to days minus one. From 1024 px the Cost group is a sticky side column beside the plan. The page has an address (`#journey=<id>` pushed onto history, so the browser Back closes it), a Share button, and the save star once its host passes `onFav`. Generated sentences now stay silent where they would contradict the authored week: no "Base:" line under days that end at huts, no "One base all week" over hut nights, no weather block or "Fallback for 0 of 7" when no day has a fallback, and no hook that opens on an orphan clause. Booking steps say the month to book by. The pack grid names every cell distinctly and translates its derived labels. The composed route page takes the same grammar: a caption band under its photo, commas instead of dot separators, its days in the shared day track with the prose behind "More about this day", and a cost receipt with the tilde and "est." on estimated legs.

How it works, for the next person. The library cards are `.jcap-card` (JourneysSection.jsx), drawn by 66-v6-trips.css; the from-price is `styleFromPrice()` in lib/journeys.js over `loadAllJourneyCards()`, the cheapest card's low end at the remembered length, in the chosen country when there is one. The filter row is TripFilters.jsx; it reuses the destinations surface's PlacesFilterSheet and the shell's FilterChips and Dropdown unchanged, and the month and sort logic is `filterByMonth`, `monthCounts` and `sortCards` in lib/tripFilters.js. The journey page's groups are Folds at level 2; WeekPlan.jsx, BookingOrder.jsx and JourneyRoute.jsx no longer render folds of their own but blocks under an h3, and JourneyPage places them. The address is `journeyHash`, `journeyShareUrl`, `readJourneyFromUrl` and `takePendingJourney` in lib/journeys.js (read once at import, before the URL writer drops the hash); JourneyPage pushes one history entry on open and routes every close (back control, Escape) through `history.back()`. The one-base test is `otherBedInTitles()` and `BED_IN_TITLE` in lib/weekShape.js, which gives a new source `'unsure'` (no claim) when one basecamp is listed but a day title ends at a hut. Loads now fail out loud: lib/journeys.js rejects on a network error or a 5xx (and drops the failed promise from its cache, so a retry refetches) and resolves null only when a file is absent; the list and the page show still blocks while loading and ErrorBlock with a retry when a load fails. The pack grid and the composed page were built by two delegated agents inside this session and reviewed here; their strings and CSS were merged by this session.

## Files touched

App repo (continent-app, branch p10-v6-build-trips), all owned by 'trips' in docs/design-v6/OWNERSHIP.md or listed as this surface's harnesses:

**Modified:**
- src/browse/JourneysSection.jsx, src/browse/TripFilters.jsx, src/browse/LengthPicker.jsx
- src/browse/JourneyPage.jsx, src/browse/WeekPlan.jsx, src/browse/BookingOrder.jsx, src/browse/JourneyRoute.jsx, src/browse/PackGrid.jsx
- src/browse/TripPage.jsx, src/browse/TripPractical.jsx, src/browse/TripDayPhotos.jsx
- src/lib/journeys.js, src/lib/tripFilters.js, src/lib/weekShape.js, src/lib/bookingOrder.js, src/lib/packGrid.js
- src/styles/66-v6-trips.css (707 lines added), src/styles/25-feature-pages.css (the library, list head, composed door and page chip rules moved out to the v6 sheet; the `.jweek-bed.is-move` side stripe removed), src/styles/43-trip-length.css (the old stacked filter rules moved out)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (183 new keys each under journey.* and itin.*, two reworded: journey.composedSub, journey.diffEasy)
- scripts/verify_journeys.mjs, scripts/verify_trips.mjs, scripts/verify_trip_page.mjs, scripts/verify_pack_grid.mjs, scripts/verify_keyboard.mjs, scripts/verify_quality_floor.mjs (each changed assertion carries a comment saying why)

**Created:**
- scripts/verify_journey_claims.mjs

Root repo (branch p10-v6-build-trips):

**Created:**
- docs/design-v6/plans/V3-trips.md (the plan, committed before the first app edit)
- Execution/P10/T387-v6-v3-trips.md (this report)

**Modified:**
- Execution/_OPEN.md (rows T376-a, b, e, f, g, h, i closed; rows T387-a to T387-l added)

No new src file, so OWNERSHIP.md needed no row; `node scripts/check_ownership.mjs <root>/docs/design-v6/OWNERSHIP.md` printed "OK: every file under src/ is owned by exactly one surface."

## Commands run

In the app worktree, in this order: `npm run build` on the merged base, `npx vite preview --port 5207 --strictPort`, then `node scripts/verify_pack_grid.mjs`, `CARTA_PORT=5207 node scripts/verify_journeys.mjs`, `CARTA_PORT=5207 node scripts/verify_trips.mjs` and `node scripts/verify_trip_page.mjs` (row T376-h, before any change). Impeccable context once (`impeccable context --target ../T387-app/src/browse/JourneyPage.jsx` from the root worktree). After the changes: `node <scratch>/merge-i18n.mjs T387-app` to merge the three i18n scratch files, the six-catalogue parse of session rule 8, `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs`, `node scripts/verify_journey_claims.mjs`, `node scripts/verify_pack_grid.mjs`, `npm run build`, the preview on 5207, `verify_journeys`, `verify_trips`, `node scripts/verify_keyboard.mjs --port 5207`, `node scripts/verify_quality_floor.mjs t387 --port=5207 --only=pages --out=<scratch>`, `verify_trip_page`, `impeccable detect --json <every changed file>`, and the scratch Playwright walk (`wt/_scratch/T387/walk.mjs`, `land.mjs`). dist/ and dist-data/ were deleted after the last build; every server started was stopped.

## Config and secrets set

None.

## Before/after measurements

Before figures are T376's (docs/design-v6/briefs/trips.md, parts 2 and 3) unless marked; after figures are this session's walk on the preview build (Pixel 5 393 x 851 unless a width is named).

| Metric | Before | After | Delta |
|---|---|---|---|
| First trip card top on the list, phone | 804 px (380 x 800) | 448 px (393 x 851, 360 x 740, iPhone 13) | -356 px; about 350 px of it is the Destinations tab chrome (row T387-d) |
| Suitability strip top (the first price), phone | 900 px (380 x 800) | 397 px Pixel 5, 395 px iPhone 13, 375 px at 360 x 740 | -503 px, under the 560 target |
| Suitability strip top, desktop 1280 x 800 | 907 px | 570 px | -337 px, under the 800 target |
| Style cards with a euro figure | 0 of 10 | 10 of 10 | +10 |
| Sections on the journey page | 18 | 7 groups (h2) | -11 |
| Sections on the sticky rail | 6 | 7 of 7 | +1 |
| Price figures on the page's first screen | 0 | 1 (the strip, "a person") | +1 |
| Journey page head chips | 4 | 0 | -4 |
| Library filter controls drawn on the list | 2 length + 4 cost + up to 13 tag buttons, stacked | 2 length segments + 1 Filters button (cost, month, tag, sort inside the sheet) | 19 visible to 3 |
| Weeks claiming one base over another bed | 4 (my scan, at least those with a hut in a day title) | 0 (verify_journey_claims) | -4 |
| Weeks showing "Fallback for 0 of N" | 92 (verify_journey_claims) | 0, the block is hidden | -92 |
| Trips repeating a pack label | 66 (42 counting "Day pack" only, as the brief did) | 0 (verify_pack_grid) | -66 |
| Cells labelled "Day pack" | 307 | 179 (standard-kit fill, at most one per trip, or notes that say day pack) | -128 |
| Written and derived pack cells | 715 and 3,333 | 715 and 3,333 | 0 (the fill already stops at 16 cells; only more written notes can move it) |
| Detector findings on the surface files | 1 (side-tab, 25-feature-pages.css) | 0 | -1 |
| Design lint | 213 violations, 213 baseline (T376) | 212, 212 baseline, 0 new | 0 new |
| verify_journeys | 35 of 36 (the itemised receipt failed) | 42 of 42 | receipt fixed, 6 assertions added |
| verify_trips | 42 of 42 | 42 of 42 | three selectors follow the composed day track |
| verify_trip_page | 47 of 51 | 61 of 61 | four day-prose failures fixed, ten assertions added |
| verify_pack_grid | pass | pass, with distinct labels, the written half and missing keys added | |
| verify_keyboard | 20 of 20 (T380 floor) | 20 of 20 | the destinations case waits for `.jstyle-card` too |
| Quality floor, journey screens, phone targets under 44 px | not measured | 1 found (the hero credit link, 13 px), fixed in CSS after the run | |

Lint: 0 errors, 69 warnings (none in the changed files). `npm test`: 341 of 341 pass.

## The phone (T414)

Landscape (iPhone 13 landscape, WebKit, 750 x 342 CSS px as Playwright reports it): no sideways scroll on the journey page; the hero holds 137 px (the 40dvh cap) so the strip still sits on the first screen at 262 px; the filter sheet is 315 of 342 px high with its Show button visible. Tap only: every hover rule written here is inside `@media (hover: hover)`; nothing on the surface opens on hover. The on-screen keyboard: the journey page has no text field (ticks only) and the list's only field is the sheet's month and sort Dropdowns, which are lists, not text inputs (their search box only appears past 99 options); the town receipt's date fields are the landing surface's and only appear on one-base weeks. Safe areas and dvh: the hero cap uses `40dvh` and `60dvh`, the sticky cost column `100dvh`; no new fixed bar was added, and the page bar is the shell's `.tpage-bar`. Thumb reach: the page's one primary ("See day prices in <town>", or "Set your dates" while the town view is open) sits in the content near the end, not in the top bar; the Cost group is open on arrival. Tap targets: every new control is `--tap` on a coarse pointer and 32 px only under `pointer: fine`; the scan inside `.jpage` found one under 44 px (the hero credit link, now 44). Swipe is never the only way: the day track and decks keep Previous and Next, the sheet keeps its close. No sideways scroll at 360, 390, 393 or 1280. What only a real phone can prove is row T387-f.

Screenshots (after set, JPEG 80, viewport only, ten) in `design-v6-shots/trips/`: V3-styles-android, V3-list-android, V3-page-android, V3-receipt-android, V3-days-android, V3-list-iphone, V3-page-iphone, V3-styles-desktop, V3-page-desktop, V3-receipt-desktop. The desktop receipt pair was taken before the last CSS commit removed the receipt's second border inside the Cost fold.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The sticky rail did not render on the new page | SectionRail reads the sections in a layout effect, which runs before the parent's scroller ref is attached on the first loaded render | JourneyPage hands the rail a `ready` value set in an effect, after refs attach |
| The composed page's days failed four verify_trip_page checks on the base | Both pages kept every day's prose mounted inside a panel hidden only by CSS | The prose mounts only while "More about this day" is open, on both pages |
| verify_keyboard and verify_quality_floor waited for `.places-ccard` on the Destinations tab | The Trips category's style cards were `.places-ccard`; they are `.jcap-card` now | Both waits accept `.jstyle-card` too, with a comment |
| verify_trips counted `.itin-day` rows | The composed days run in the day track as `.tday` | Three selectors updated, with comments |
| A failed style or journey load showed "no trips" or "not published" | lib/journeys.js resolved null for every failure and cached it | Network errors and 5xx reject and leave the cache; ErrorBlock with a retry |
| Three files showed whole-file diffs | Their committed blobs carry CRLF and the first commit normalised them to LF | A second commit restores CRLF in the index for them |

## Design decisions taken unattended

Impeccable's shape would have asked; the owner's instruction of 2026-10-07 to proceed covers it, and each call keeps Carta's palette, type and identity. Context loading resolved the project root to the app worktree and so found no PRODUCT.md or DESIGN.md; they were read directly from the root worktree and init was not run. The sort went into the Filters sheet rather than beside the button, because a fourth control on the row wrapped to a second line at 393 px and pushed the list down 60 px. Trip and style cards run two abreast on a phone at 16:10 (DIRECTION part 3), one aspect per row. The level-one difficulty word is "Gentle" (rule R10 needs a word off the banned list; V4 item 6 settles the full scale). The receipt total shows "for 2 people" from the shared party size, the authored figures multiplied, because the authored budget is per person. The page-end primary reads "See day prices in <town>", saying where it goes. The composed day photos are a two-column grid inside each day card rather than a second scroller inside the day track (row T387-i).

## Carta-design's seven questions

1. No hex value outside `:root`: the v6 sheet and every touched rule use tokens only (design lint 0 new).
2. No gradient, no colour outside DESIGN.md, no second saturated hue: the scrim on the library cards and the composed hero is gone; the only accent left on the page is the primary, the focus ring and the existing Lifestyle slider.
3. Ochre stays on the composed page's score only, teal is untouched, `--danger` is untouched.
4. Mono carries figures only in the new rules: the from-price and range lines, the counts, the coordinates; "0 of 1 booked" moved to `--ui`. Known mono-on-words left for V4 item 4: the day stats line and the strip's "a person" unit inside the mono cost cell.
5. One primary per view: the quality floor found 0 views with more than one filled primary; the Filters button is secondary chrome, not the accent pill the Destinations toolbar uses.
6. Every headline has a verb or a number ("Is this week for you", "What the week costs", "Prepare before you go"); no em dash, en dash, middot or banned word in the diff (the pack and composed strings were checked by their agents and again here).
7. Removed: the four head chips, the composed door's icon tile, the beds strip's side stripe, the second photo credit in the sources, the "Base:" line, the stacked filter rows, and the receipt's border inside the already bordered Cost fold.

## What is still open

Each item is also a row in Execution/_OPEN.md.

The address is half built (T387-a): the page writes the hash and the list opens a pending one, but the shell must read `#journey=` at boot, map `/journeys/<id>`, and keep the hash through its URL writer before a reload or a cold link always reopens the week. The star needs account's journey kind and destinations' favProps (T387-b). The town receipt still shows its own Stay select and default dates until landing adds props (T387-c). The 360 px list target is held by the tab chrome above the list (T387-d). Native review of the new strings (T387-e) and real-phone checks (T387-f) are the owner's. Leaving the page through a forward link leaves one dead Back step (T387-g). Old composed-page CSS in 24-destination-workspace.css should be moved into the v6 sheet and deleted (T387-h). The composed day photos depart from the Photo track rule (T387-i). The composed list card's €58 does not match the page's ~ €58.08 (T387-j). verify_trip_page leaks its preview server on Windows (T387-k). Some note-derived pack names read rough (T387-l). Already registered and not repeated: the car-free filter waits on the wire rebuild (T376-c), a compare of weeks (T376-d), MovingEur's count-up and whole-euro rounding (T380-b, trips V4).

## Rollback procedure

App: `git -C continent-app revert <the two T387 commits>` after the merge, or before it delete the branch p10-v6-build-trips. Root: revert the plan commit and the report commit; the register rows can stay with their history or be reverted with the report. No data, migration or deploy was touched, so rollback is code only. If only the address behaviour misbehaves, removing the two history effects in JourneyPage.jsx (the `pushed` ref and the popstate listener) and pointing `close` back at `onClose` restores the old dialog behaviour without touching the layout.
