# T400: V4 visual and dynamic for My trips, account, sharing, passes, guides and admin

## Task ID

T400 (design wave V4, session 10 of 10; surface key `account`). Branch `p10-v6-visual-account` in both repos.

## Date

2026-10-08

## What changed

Nothing sits on a photograph on My trips any more. The favourite cards and the journey cards keep their photograph at 3:2 and carry every word in a solid band flush under it: the name in the display face, the countdown with its number in mono, the dates in mono, the day cost, and on a record card the memory's one-line summary. The two dark gradients, the countdown chip, the rgba fills and the calendar or tick state mark that rode on the photo are gone; the flag stays on the photo as a picture on a solid `--paper` chip, and the bookmark and the card menu moved into the band's corner at `--tap`. Pressed, the band turns `--ink-fill` with `--on-fill` text. The photo no longer zooms on hover, and no card animates a shadow.

The next trip is the page's focal card. On Planned the first upcoming plan is drawn one size up (its name at 22 px on a phone and 26 px on desktop, the countdown number a step larger) and every later plan is a row with a 1:1 44 px thumbnail, name, countdown, dates and figure. On a phone the focal photograph is 2:1, so on an iPhone 13 with the install hint showing the card's name, countdown, "Plan its days" and Share all end at 648 px of a 664 px screen. From 769 px the photograph sits beside the band. The `?savedmock` seam holds a second upcoming plan (Ljubljana) so the row is drawn and checked.

Removal answers with Undo instead of asking first (carta-design "Undo, not confirm", register row T390-e). Letting a favourite go, removing a saved place, a day plan or a trip plan, and un-starring a shortlist row all happen at once and put one toast in the shell's bottom slot, "Lisbon removed" with an "Undo" secondary and the house close. The panel holds the removal for six seconds: the item is hidden, and the real delete runs only when the toast ends, when the next removal starts, when My trips closes or when the browser tab is hidden (`pagehide`). Undo drops the hold, so nothing has to be written back. A star is the one exception: the shared store lets it go at once and Undo stars it again. The toast is portalled into `.bottom-slot`, so it stacks with the other transient messages above the bottom nav; from 769 px the shell's slot sits at z-index 40 under the My trips and Account pages (z-index 56), so while this toast is in it the slot rises to 57 (scoped with `:has`, row T400-c for the general fix). The inline Keep or Remove went from those removals; the share panel's two asks (publish to the guides, withdraw a link) stay inline because nothing can be held back there.

The record reads as drawings in the one family. A memory's "What it cost" carries the shared CostBar above its lines, one segment per spend line in receipt order in the ink ramp. Two or more photographs run on the shared DayTrack: "Photo 2 of 3" in mono, Previous and Next, arrow keys, snap, no autoplay; one photograph stays a single figure. Both shared components are imported, not edited: each gets a `t` that swaps the journey page's keys for this surface's. The record card's footer button that did what a tap on the card does became the band's summary line, and the card menu's "Edit this trip" went because the memory view carries it (the second half of row T390-f).

The pass modal compares. Under the three plan cards one table puts the plans in columns and price, Carta bot day plans, live web searches and how long it lasts in rows, every figure in mono from TIERS through `formatPrice`; the header row and the row labels are sticky, and at 360, 390 and 393 px two plans are in view with the table scrolling sideways inside itself (no page scroll). The modal rises 8 px in `--dur-3`; the plan cards stopped staggering in and stopped lifting on hover. On the account hub the pass balance is "2 of 2 Carta bot plans left" with the figures in mono and an 8 px thin bar in the ink ramp under it, filled to the plans left over the period's cap.

Smaller answers. A copied share link reads "Copied" after a 6 px success dot for two seconds (was a tick for 2.5 s). A tab's content fades in and rises 8 px in `--dur-2`. The day cost on a saved card and the pass balance run `useSettledFigure()`, so a Lifestyle change or a spent plan dips the figure once instead of popping (the day cost is still dormant until App passes `costs`, row T390-a). The `.cheap-tip` accent stripe in 16-auth.css went. Every transition in 17-saved-trips.css now reads `--dur-1` and `--ease-out` (21 declarations were literal), with a reduced-motion branch for each.

## Plan and method

The plan is `docs/design-v6/plans/V4-account.md`, committed (root `67a230458`) before the first app edit. `impeccable context --target src/auth/SavedTripsPanel.jsx` ran from the root worktree and loaded PRODUCT.md and DESIGN.md. Impeccable critique ran dual-agent: Assessment A (design review from source and the V3 screenshots) and Assessment B (the detector and a stylesheet tally) as two isolated sub-agents, A finished before B's output entered the synthesis. No browser overlay was injected, to keep memory free for the seven sessions; this is a recorded gap in the critique, not a degraded single-context run. The synthesis is in the plan.

The run is unattended (owner instruction 2026-10-07); no question tool, decision page or live mode. Where impeccable would ask, the call that keeps Carta's identity was taken. The calls: the focal photograph is 2:1 on a phone instead of 3:2, because 3:2 put the actions 43 px under the first screen of an iPhone 13 with the install hint up and DIRECTION.md caps a hero at 40 percent of the height (2:1 is 179 px of 664); the row thumbnail is the house 1:1 at 44 px; the photo beside the band from 769 px rather than 1024, because a stacked 3:2 photo at a 700 px panel width would take 470 px; the toast's surface is `--bg-card` with a `--rule` border and `--shadow-2` (a popover's dress) rather than the email toast's ink fill, which would be a second dark object in the slot; the pass balance bar uses `--kind-city` filled and a `--rule` outline beyond, the thin bar's grammar. Animate's thesis: the one authored moment on this surface is the figure settling when the traveller's Lifestyle changes it; every other motion is feedback at `--dur-1` or a surface arriving at `--dur-2` or `--dur-3`. Bolder within the palette: the focal card is the one size step, nothing else got louder. Delight: none added; the Undo line is the humane answer at the one moment a traveller loses something.

## Files touched

Root repo (branch `p10-v6-visual-account`):

**Created:**
- docs/design-v6/plans/V4-account.md
- Execution/P10/T400-v6-v4-account.md

**Modified:**
- Execution/_OPEN.md (rows T400-a to T400-j; T390-e closed)

App repo (branch `p10-v6-visual-account`):

**Modified:**
- src/auth/SavedTripsPanel.jsx (caption band, focal card and rows, WhenText, the undo hold and UndoToast, the settling day cost, the memory summary in the band, the second upcoming plan in the seam; ConfirmRow and the favourite's inline ask removed)
- src/auth/TripMemoryView.jsx (CostBar above the receipt lines, DayTrack for two or more photographs)
- src/auth/TripSharePanel.jsx (Copied as a status for two seconds)
- src/auth/AccountPanel.jsx (PassBalance: mono figures, thin bar, settling)
- src/components/PassModal.jsx (the comparison table)
- src/styles/17-saved-trips.css (photo cards rewritten in place: no gradients, no rgba text over photos, no hover zoom, no shadow transition; the dead confirm rules removed; every transition on the tokens with its reduced-motion branch)
- src/styles/16-auth.css (the `.cheap-tip` accent stripe removed)
- src/styles/69-v6-account.css (the V4 section: pressed band, focal and row sizes, the toast and the scoped slot lift, the track frames, the table, the modal's token motion, the copied dot, the tab arrival, the pass bar; the V3 rules that inherited the caption colour over the photo removed)
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (13 keys appended to each: `saved.undoRemoved`, `saved.undo`, `saved.pastBarLabel`, `saved.pastBarHint`, `saved.pastPhotoPos`, `saved.pastPhotosLabel`, `pass.compareTitle`, `pass.comparePrice`, `pass.comparePlans`, `pass.compareSearches`, `pass.compareLasts`, `pass.compareDays`, `pass.compareForever`)
- scripts/verify_saved.mjs, scripts/verify_past_trip.mjs, scripts/verify_friends.mjs (each changed assertion carries a comment saying why)

App commits: `1eda4f5`, `813c675`, `f220383`, `2354814`.

## Commands run

In the app worktree: `npm run lint`, `npm test`, `node scripts/ci/design-lint.mjs` (also once with the three stylesheets checked out at `e2d9e1e` for the before figure, then restored), `node scripts/check_ownership.mjs ../T400/docs/design-v6/OWNERSHIP.md`, the six-catalogue parse of session rule 8, `node node_modules/vite/bin/vite.js build` twice, `node node_modules/vite/bin/vite.js --port 5210 --strictPort` (stopped: too slow under the shared load) and then `vite preview --port 5210 --strictPort` (stopped), `rm -rf dist dist-data`. From `wt/_scratch/T400/run`: `CARTA_PORT=5210 node <app>/scripts/verify_saved.mjs` and likewise verify_account_panel, verify_trip_share, verify_friends, verify_past_trip, verify_guides, verify_admin_panel and verify_record_map_crew; `CARTA_REPO_ROOT=<root worktree> node <app>/scripts/verify_paywall.mjs`; `node <app>/scripts/verify_keyboard.mjs --port 5210`; `node <app>/scripts/verify_quality_floor.mjs --port=5210`; the scratch phone walk `walk.mjs` (iPhone 13 WebKit, Pixel 5 and 360x740 Chromium, desktop 1280x800) and `memo.mjs` (a seeded memory with three photographs and a spend). `impeccable detect --json` over every changed src file.

## Config and secrets set

None committed. The main checkout's `continent-app/.env` (the public anon configuration, gitignored) was copied into the app worktree for the harness runs and deleted before the end.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Photographs carrying text on My trips (`?savedmock`, all tabs, every device) | every photo card (title, dates, chip, figure over a gradient) | 0 | text off every photo |
| Gradients drawn on My trips (computed backgrounds) | 2 rules (favourite and journey shades) | 0 | -2 |
| Design lint violations found (all baselined) | 194 | 192 | -2 (the two gradients) |
| impeccable detect, changed files (JSX and the three stylesheets) | 1 (`side-tab`, `.cheap-tip`) | 0 | -1 |
| Literal transition durations in 17-saved-trips.css | 21 | 0 | -21 |
| Transitions on `box-shadow` in the surface's photo and pass cards | 3 | 0 | -3 |
| Inline confirms on removals that can be held (favourite, saved place, day plan, trip plan) | 4 | 0, Undo for six seconds | -4 |
| Overlay controls on the focal card's photograph | 4 (menu, chip, flag, state mark) | 1 (the flag, a picture) | -3 |
| Focal card actions bottom, iPhone 13 with the install hint | about 43 px below the 664 px screen at 3:2 | 648 px | inside |
| Pass plans side by side in the comparison, 360 / 390 / 393 px | no table | 2 in view, table scrolls inside, page scroll 0 | added |
| Pass tiers staggering in and lifting on hover | 3 staggered, lift on hover | 0 | removed |
| Controls under 44 px on Planned and Favorites, phones | 0 | 0 | 0 |
| Harnesses of this surface passing | 8 of 8 (T390) | 8 of 8, plus verify_record_map_crew | 0 |
| verify_keyboard | 20/20 | 20/20 | 0 |
| Quality floor, My trips and Account screens (phone small targets, h1, contrast, primaries) | 0 failures | 0 failures | 0 |

The quality floor run still exits 1 for the whole app: 11 phone targets under 44 px and 7 contrast failures, all on other surfaces' screens; every My trips and Account screen reads one h1, 0 small phone targets, 0 contrast failures and at most one filled primary. Desktop targets (reported, not failing, owner row T335-b) read 1 on My trips and 8 on Account, the V5 touch-target item. The walk's own document-wide h1 count reads 2 on every device because it counts a hidden heading outside the panel; the floor, which counts visible headings per view, reads 1.

## Phone checks (T414)

iPhone 13 (WebKit), Pixel 5 and 360x740 (Chromium, mobile and touch), desktop 1280x800. Sideways scroll: 0 on Planned, Favorites, Visited and the pass modal on all four. Landscape: a fresh load at 851x393 draws the focal card 219 px tall with the photo beside the band; the walk's rotate-in-place measurement read the card taller because it measured before the layout settled, and the fresh-load figure is the one to trust. Tap only: every new hover rule sits inside `@media (hover: hover)`; the pressed band, the touch feedback and the toast work on tap. Keyboard: this wave adds no input; the T390 figures stand (sign-in field and submit visible; the past-trip form under the bottom nav is row T390-d). Safe areas and dvh: the toast lives in the shell's slot, which adds the bottom inset; no `100vh` was added. Thumb reach: the focal card's Plan its days and Share sit in the lower half of the first screen on all three phones (648, 553 and 536 px). Swipe: the photo track swipes, and Previous, Next and the arrow keys do the same; nothing else depends on a swipe. What only a real phone can prove is row T400-h.

## Screenshots

Nine "after" shots in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\account\`, JPEG 80, viewport only, never committed: V4-mytrips-planned-iphone, V4-mytrips-planned-android, V4-mytrips-planned-desktop, V4-mytrips-favorites-iphone, V4-mytrips-favorites-desktop, V4-mytrips-visited-iphone, V4-undo-iphone, V4-passes-iphone, V4-passes-desktop. They pair with the V3 set of the same view names.

## carta-design's seven questions

1. Hex outside `:root`: none; every new rule reads a token.
2. Gradients, colours outside DESIGN.md, a second saturated hue: the two gradients on My trips are gone and none was added. The rgba fills that carried text over photographs went with them.
3. Ochre, teal, `--danger`: unchanged; the menu's Remove stays `--danger` text; no ochre or teal touched. Success shows as the 6 px `--status-success` dot, never as text.
4. Mono: counts, dates, the countdown number, prices, the table's figures and the pass balance figures are mono with tabular figures; the words around them ("In", "days", "of", "Carta bot plans left", "Life of the account") are the UI face.
5. More than one primary in a view: at most one accent fill in view on every walked tab on all four devices (Favorites' one is "Browse the map"); the toast's Undo is a secondary.
6. Headlines and words: "{name} removed", "Undo", "Where the money went", "Photo {n} of {total}", "The three plans compared", "How long it lasts"; no em dash, no middot and no banned word in any added string (grep on the diff).
7. Remove one thing: the state mark on every journey card (a calendar or a tick that repeated the tab it sits on), and the small "Dates" and "Visited" labels over the dates.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| The Undo toast could not be clicked on desktop | The shell's bottom slot is z-index 40 and the desktop My trips and Account pages are z-index 56 (25-feature-pages.css), so every slot message sits under them | `.bottom-slot:has(> .undo-toast)` rises to 57 from 769 px in the v6 file; the general fix is the shell's (row T400-c) |
| verify_friends timed out on the desktop header | It looked for "Saved trips"; shell V3 renamed the header item "My trips" | Accepts either name, with a comment |
| The scratch walk missed the My trips nav item | The phone nav item now carries a count chip after its label | The walk matches the label's start |
| ESLint `no-control-regex` on the pass balance split | The figure slots were split with a regex of control characters | A plain character loop |
| The two-plans-in-view check read 1 at 360 and 393 px | The row label and plan columns were too wide for the modal's inner width | Narrower minimum widths and tighter cell padding under 720 px |
| The dev server timed out pages under the shared load | Seven sessions on one machine | Built once and ran the walks and harnesses against `vite preview` |

## What is still open

The shared element from a trip card into the planner (brief V4-3) is not built: the trip planner's header has no `claimShared` and that file is the tripplanner surface's, and without the claim the View Transition would be a bare crossfade (row T400-a). The record map in the ink ramp (brief V4-8) needs `src/map/TripMap.jsx`, which paints the country fills and pins in `--accent` and is not this surface's (row T400-b). The bottom slot sits under the desktop My trips and Account pages for every message, not only this one (row T400-c). After a removal from the card menu by keyboard, focus falls back to the page because the menu's card is gone; moving it to the toast's Undo or the next card is V5's focus item (row T400-d). A crew name on a record card is still removed at once with a letter x and no Undo (row T400-e). The design lint baseline still holds the two retired gradient entries for 17-saved-trips.css; pruning it in this session would collide with the parallel sessions' baselines (row T400-f). The account shell redefines `--bg-card` as `--paper-dim` for everything inside My trips and Account (24-destination-workspace.css:4507), so the caption bands and cards there are paper-dim rather than white; whether the surface keeps that is a V5 token call (row T400-g).

The 13 new strings in de, es, fr, it and nl were written by this session and need a native read (row T400-i). What only a real phone can prove is row T400-h. The 16-auth.css and 22-account-admin.css transitions (26 literal durations) and the 87 hover rules outside `(hover: hover)` across the surface's stylesheets are the brief's V5-3 motion audit and stay for T410 (row T400-j). Rows T390-a (App passes `costs`), T390-f's first half (the friends' ledger into the Friends spoke) and T390-i (the InfoDot for "national", which needs a glossary term in the shell's `src/lib/glossary.js`) stay open as they were.

## Rollback procedure

In the app repo: `git revert 2354814 f220383 813c675 1eda4f5` on the merged branch (or drop the branch before merge). In the root repo: revert the plan commit `67a230458` and the report commit. No data, schema, migration or stored key changed. The undo hold lives only in memory: a removal held at the moment of a rollback is either committed (the page closed) or never happened (Undo), so no stored state depends on it.
