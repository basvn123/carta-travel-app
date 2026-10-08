# T391: shell V4, visual and dynamic

## Task ID

T391 (design wave V4, session 1 of 10; surface key `shell`). Root branch `p10-v6-visual-shell`, app branch `p10-v6-visual-shell`.

## Date

2026-10-08

## What changed

The shell's chrome now recedes and answers the traveller's input with motion from the shared tokens. Before this wave every phone screen carried three or four accent objects in the chrome (an accent-tinted pass chip, an accent wordmark, accent text and an accent tick on the active tab, an accent ring on the plus, accent tiles in the Lifestyle dialog, an accent avatar on desktop, an accent underline under the desktop tab). Now the only accent left in the header and the bar is the pass chip's ticket glyph, which the T360 owner call keeps and verify_top_bar asserts. The section showing is one `--ink-fill` pill on both widths (behind the icon on the phone, behind the label on desktop), and that pill slides between items by transform when the section changes. A section change itself moves: the new tab fades in and rises 8 px in `--dur-2` through a View Transition, while the header row and the bottom nav are named in that transition and do not animate, so they never move. The bottom nav sits on `--paper` with one `--rule` hairline and no blur or shadow, and the plus now sits inside the bar instead of rising 26 px over it, so it no longer covers whatever sits just above the nav (the landing primary at 380 x 800, rows T381-g and T382-c).

Every dialog the shell draws is now one family: the one scrim (`--ink` at 28 percent through `color-mix`, no blur) on the Lifestyle dialog, the plan chooser, the share-trip offer, the three legal texts and the filter sheets; one close (`.shell-close`, CloseIcon 16 px in a `--tap` box, translated label) where there was a letter "x" on a grey disc; 12 px dialogs, 12 px sheet tops, 10 px popovers, `--shadow-2` only; arrival in `--dur-3` and, for the chooser and Lifestyle, an exit in `--dur-2` through a new `usePresence()` hook in `src/lib/motion.js`. The share-trip offer gained `role="dialog"`, `aria-modal` and its title as its name.

The Lifestyle dialog became a priced instrument. Selected tiles and hotel grades are `--ink-fill`, and the grade row sits on `--paper-dim` instead of the accent tint. Its foot states the trade-off with a computed figure: the next cheaper way to sleep (or the next dearer one on the cheapest), for the destination page that is open, or as the median of the same per-person, per-night difference over every place where both tiers were measured in the town itself. On the build of this session that read "Private room instead: €6 more a night per person, the median over 276 places." at the default Entire place, and "Dorm bed instead: €13 less ..." after picking Private room (device walk). The figure comes from `computeCosts()` at the two tiers and is set with `eurDay()`, the cards' formatter, so it agrees with them; it dips once through `useSettledFigure()` when it changes. The foot also holds the dialog's one primary, Done. On a phone the dialog is a bottom sheet above the bar in z-order, with a grab handle whose swipe is a shortcut for the close and Done; the bar no longer covers its last row.

Smaller items. Every icon in `src/components/Icons.jsx` draws at a 1.5 px stroke (five values before). The settings line's values settle in place through `useSettledFigure()`, which is also the door every other surface uses for its own figures. In `14-filters-panels.css` the price pill's overshoot curve is gone (the detector's `bounce-easing`), the four `transition: all` name their properties, the sheet and drawer motion reads the tokens, three shadow literals became `--shadow-2`, and the accent side stripe on `.hostel-note` is gone (the detector's `side-tab`, rule R11). FilterChips are drawn as carta-design's filter chips on both browse tabs (`--paper-dim`, ink, `--rule`, CloseIcon, "Remove <filter>" as the name; row T384-d). The Lifestyle door lost its tint and accent glyph.

Hand-offs from V3 taken: a `#journey=<id>` link now boots Destinations on the Trips category (App boot reader, `pathToLegacyHash` case for `/journeys/<id>`, and `persistState` keeps that one hash so a reload reopens the week; T387-a). SavedTripsPanel gets `costs` and `onOpenFriends` (T390-a). Signing in from My trips keeps My trips open, and `nav.saved` reads "My trips" in six catalogues (T390-b). AccountPanel gets `origin` and `groupSize` for T400 (T390-g). `openFeature` has a `journey` case that lands on the Trips category; opening the week itself needs trips' or destinations' half (T390-c stays open, row T391-a). T388-d was already done by T381 (TripPlannerTab receives `onOpenLifestyle`) and is closed.

Choices taken where impeccable would have asked (unattended run, owner instruction 2026-10-07), each keeping Carta's palette, type and identity: the tab motion uses View Transitions rather than a transform on the tab wrapper, because every tab root is `position: fixed` inside a `display: contents` shell and a transformed ancestor collapses them; the phone's active pill sits behind the icon only, so the five labels keep their width; the pass chip keeps its accent glyph (T360); the trade-off median counts only towns with both tiers measured in the town, which is why it says 276 places and not the whole catalogue; Done is the Lifestyle dialog's one accent object.

The work was done in three runs of this session (two stopped on a usage limit and an orchestrator restart); each run reviewed the uncommitted work it found before carrying on.

## Files touched

**Created (root):**
- docs/design-v6/plans/V4-shell.md (the plan, its own commit before the first app edit)
- Execution/P10/T391-v6-v4-shell.md

**Modified (root):**
- Execution/_OPEN.md (rows T391-a to T391-f; T381-g, T382-c, T384-d, T387-a, T388-d, T390-a, T390-b, T390-g closed by T391)

**Modified (app, continent-app/):**
- src/App.jsx
- src/browse/FilterChips.jsx, src/browse/LifestylePanel.jsx
- src/components/AppHeader.jsx, BottomNav.jsx, Icons.jsx, Imprint.jsx, PrivacyPolicy.jsx, SettingsLine.jsx, TermsOfService.jsx
- src/lib/motion.js (usePresence, useNavMarker), src/lib/sharedElement.js (crossTab), src/lib/urlScheme.js, src/lib/urlState.js
- src/styles/10-shell.css, 14-filters-panels.css, 60-v6-shell.css
- src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (5 new `lifestyle.*` keys; `nav.saved` changed)
- scripts/verify_desktop_shell.mjs, verify_tab_switching.mjs, verify_lifestyle.mjs (assertion updates, each with a comment)

**Deleted:** none.

## Commands run

In the app worktree `wt/T391-app` (node_modules is the junction to the main checkout's install):

```
npx eslint <changed files>; npm run lint
npm test
node scripts/ci/design-lint.mjs
node scripts/check_ownership.mjs C:/Users/Gebruiker/Documents/Portfolio/wt/T391/docs/design-v6/OWNERSHIP.md
for l in en de es fr it nl; do node --input-type=module -e "import('./src/i18n/'+'$l'+'.js')"; done
npx vite --port 5201 --strictPort            # critique and first look, stopped before the build
npx vite build                               # not npm run build: its prebuild sync-data reads app_data/, absent from the sparse root worktree (as T381)
npx vite preview --port 5201 --strictPort
CARTA_PORT=5201 node scripts/verify_bottom_nav.mjs   (and verify_desktop_shell, verify_top_bar, verify_tab_switching, verify_filter_sheet)
node scripts/verify_lifestyle.mjs ; node scripts/verify_focus_trap.mjs     (own servers on 4192 and 4197)
node scripts/verify_keyboard.mjs --port 5201
node scripts/verify_quality_floor.mjs after --port=5201 --vp=mobile --out=<wt/_scratch/T391/qf>
node scripts/verify_quality_floor.mjs afterd2 --port=5201 --vp=desktop --only=explore,trip,day --out=<wt/_scratch/T391/qf>
sh ".../impeccable/scripts/impeccable" context --target continent-app/src/App.jsx   (from wt/T391)
sh ".../impeccable/scripts/impeccable" detect --json <every changed file>
rm -rf dist dist-data
```

The critique ran as two isolated sub-agents (design review on eleven screenshots and the source; detector and lint). The device walk is `wt/_scratch/T391/walk.mjs` (outside both repos): iPhone 13 on WebKit, Pixel 5 and 360 x 740 (isMobile, hasTouch) on Chromium, 1280 x 800 desktop, and Pixel 5 under reduced motion. Early in the session the shared node_modules expected older browser builds than the cache held, so the scratch scripts and harnesses ran with a scratch preload that pointed Playwright at the installed builds; the orchestrator later installed the matching builds and the final harness runs used plain Playwright. Every server started here was stopped (ports 5201, 4192, 4197) and dist and dist-data deleted.

## Config and secrets set

None.

## Before/after measurements

| Metric | Before | After | Delta |
|---|---|---|---|
| Accent objects in the phone and desktop chrome (critique A's list, shell-owned items) | 8 (pass chip fill, wordmark, active tab text and tick, plus ring, Lifestyle tiles, chooser icons, avatar disc, desktop underline) | 1 (pass chip glyph, T360) | -7 |
| Accent fills inside the Lifestyle dialog (device walk) | 2 (selected tiles) | 1 (Done, the one primary) | -1 |
| Scrim values across the shell's dialogs | 3 (ink 28 percent, ink 44 percent, black 36 to 42 percent with blur on the share and legal overlays) | 1 (ink 28 percent, no blur) | -2 |
| Close controls drawn as a letter "x" (Lifestyle, three legal texts) | 4 | 0 | -4 |
| Plus position against the bar's top edge (device walk, all three phones) | 26 px above | 18 px inside | no overlap |
| Stroke widths in Icons.jsx | 5 (1.6 to 2) | 1 (1.5) | -4 |
| `transition: all` in shell stylesheets | 4 | 0 | -4 |
| Impeccable detector, changed files | 2 warnings (bounce-easing, side-tab) | 0 | -2 |
| Design lint | 194 found, 194 baselined, 0 new | 191 found, 191 baselined, 0 new | -3 |
| npm run lint | 0 errors | 0 errors, 61 warnings, none new in changed lines | 0 |
| npm test | | 367 pass, 0 fail | |
| verify_bottom_nav | 0 failed (T381) | 0 failed | 0 |
| verify_desktop_shell | 36 of 41 at the start of this session (five assertions encoded designs the V3 explore and destinations builds changed) | 41 of 41 | +5 |
| verify_top_bar | 0 failed | 0 failed | 0 |
| verify_tab_switching | 74 of 74 (T381) | 75 of 75 (one check added) | +1 |
| verify_filter_sheet | 30 of 30 | 30 of 30 | 0 |
| verify_lifestyle | OK (T381) | OK (failed at the start of this session: Explore v5 had removed its side-panel door) | |
| verify_focus_trap | all | all | 0 |
| verify_keyboard | 20 of 20 | 20 of 20 | 0 |
| verify_quality_floor, phone, text under 4.5:1 | 12 (T381) | 3 (all trip planner: `.wtrip-len.on`, `.itin-day-plan-btn`, a `small` on the booked step) | -9 |
| verify_quality_floor, phone, targets under 44 px | 8 (T381) | 16 (none shell's: costbar segment 39 px wide on the journey page, the destination page's selects and date inputs, Explore's rail chips counted behind the legal dialog) | +8 |
| verify_quality_floor, desktop explore, trip and day flows, text under 4.5:1 | 3 in T381's flows plus 28 header-label hits this session's first build introduced | 3 (all trip planner, as above) | 0 against T381 |
| verify_quality_floor, h1, heading order, more than one primary, horizontal scroll, reduced motion | 0 | 0 | 0 |

Figures: harness counts from their own output in `wt/_scratch/T391/h/`; quality floor from `wt/_scratch/T391/qf/{after,afterd,afterd2}/audit.json`; T381's figures from Execution/P10/T381-v6-v3-shell.md; the trade-off sentences, plus offset, scrim colour and accent counts from `wt/_scratch/T391/walk.log`; the critique counts from the two sub-agents' reports, recorded in docs/design-v6/plans/V4-shell.md. The phone target count rose because the harness now also walks screens other surfaces built in V3; none of the sixteen is a shell control.

The phone walk (what the prompt asks the report to say):

Portrait. No horizontal scroll on any tab on iPhone 13, Pixel 5 or 360 x 740; no shell control under 44 px; no page errors. A tap on a tab ran one View Transition (`tab-vt` on html) and the pill slid on WebKit. Tap only: the plus opens and closes the chooser by tap, the chooser's scrim is ink at 28 percent, the Lifestyle part opens the sheet by tap, a tile tap re-prices the trade-off sentence, Done closes it. Nothing depends on hover: every hover rule written or touched here sits under `@media (hover: hover)`, and each control has an `:active` state instead.

The Lifestyle sheet. It runs from 40 px to the bottom of the screen on all three phones, stands over the bar (the bar's first item is not hit-testable while it is up) and keeps its foot and Done (82 x 44) in the thumb zone at the bottom. A swipe on the grab handle is a shortcut; the close and Done do the same.

Landscape (844 x 390). Above 768 px the app uses the desktop chrome: no bottom nav, header tabs 31 to 33 px tall and the pass chip and avatar 38 px on a touch screen (row T381-d, V5). The Lifestyle drawer runs 110 to 390 px with Done at 334 to 378, fully on screen.

On-screen keyboard. The shell's phone chrome in portrait has no text input (origin drops out of the settings line, the other parts use buttons), so there is nothing for the keyboard to cover; the landscape origin search was measured visible by T381 and is unchanged.

Safe areas and dvh. The Lifestyle sheet adds the left and right insets and pads its foot by the bottom inset; its height is capped with `100dvh` (80 dvh in landscape). The chooser now sits above the nav plus the bottom inset. Windows WebKit cannot exercise the insets; they are on the owner's real-phone row T391-b.

Reduced motion. Under `prefers-reduced-motion: reduce` a tab tap started no View Transition and the marker's transition computed to the global floor; every rule written here carries its own reduced-motion branch.

## What broke and how it was fixed

| What | Cause | Fix |
|---|---|---|
| Edited files showed as rewritten whole in git | The patch scripts wrote LF over files committed with CRLF | A scratch script restores each file's committed line ending before every commit |
| verify_top_bar: the bar wrapped to two rows at 800 px | The first desktop pill padding (8 x 12 px plus margins) widened the five tabs | 8 x 10 px with 1 px margins, narrower than before |
| verify_desktop_shell 36 of 41 | Five assertions encoded designs the V3 explore and destinations builds changed (accent sort, kind-rail chips, sideways category row, accent tile tick, `.explore-toolbar`) and one encoded the accent bottom tab this wave removes | Updated with a comment each: ink-fill sort, `.xrail-toggle`, the 2 x 3 grid, no tick, `.xinputs`, the ink pill |
| verify_tab_switching timed out on the phone | The Lifestyle sheet now stands over the bar, so the harness's tap on Destinations through it hit the sheet | Asserts the sheet covers the bar, closes it with Done, then taps the tab; comment says why |
| verify_lifestyle: no Explore door | Explore v5 dropped its side-panel door; the assertion also required the accent tint this wave removes | Finds the first visible door (Explore's row or the settings line), asserts no tint, closes with the shared close; comments say why |
| Quality floor: 28 desktop header labels at 1.08:1 | The first build drew the active desktop pill only as the sliding marker, so the label sat on a transparent item over paper as far as the contrast check could see | The active tab takes the same ink fill as the pill arrives (the fill waits out the slide like the colour), so its words always sit on ink |
| Detector still flagged `side-tab` after the stripe turned `--rule` | A 3 px one-side border is the pattern, whatever its colour | The stripe is gone; the tinted note box stands alone |
| The plan chooser looked shut in one screenshot | The scratch script tapped the plus while the Lifestyle sheet was still leaving | Not a bug: a probe on WebKit and Chromium opened and closed it by tap |

## What is still open

Plan items 1 to 10 are done, with these limits. A starred journey lands on the Trips category but cannot open the week itself until trips or destinations adds a door JourneysSection reads after mount (row T391-a; T390-c stays open with it). The accent rules this wave overrides still sit in 24-destination-workspace.css and 16-auth.css, other surfaces' files, for the V6 pass to move or delete (row T391-d). The SheetShell sheets, the share-trip offer and the legal dialogs arrive with motion but leave at once, because their open state lives in their callers (row T391-e, V5). The trade-off figure rounds to whole euros like every card, which follows `costIndex.js` but not carta-design's two decimals; that is the owner's call for all day and night figures (row T391-f). The new strings need a native reader (row T391-c) and the phone-only checks need a real phone (row T391-b).

Not taken, with their reasons: T390-d (the bar hiding while an input in a page has focus) is ordered for V5; T381-a (an overflow for the phone settings line) needs a DIRECTION rule first; T381-c and T381-d are V5; T389-e (an unused `dayPlanKml()` in `src/lib/kmlExport.js`) was not in this wave's plan and stays for the shell's V5.

## Rollback procedure

App: before the merge, drop branch `p10-v6-visual-shell` in the app repo; after it, `git -C continent-app revert <T391 app merge commit>`, which restores the seventeen source files, the six catalogues and the three harnesses (commits e14cab6, b080b74, 5a165f9). Root: revert the plan commit and the report commit (`git revert <report commit> <plan commit>`), which removes the plan and the report and reopens the eight register rows. The two halves are independent: no other surface imports `usePresence`, `useNavMarker` or `crossTab` yet. No data, schema or migration is involved.

## carta-design's seven questions

1. Hex values outside `:root`: none. The scrim is `color-mix(in srgb, var(--ink) 28%, transparent)`; harness comments name the old and new colours as rgb.
2. Gradients, colours outside DESIGN.md, a second saturated hue: none. The changes use `--ink`, `--ink-fill`, `--on-fill`, `--ink-soft`, `--paper`, `--paper-dim`, `--bg-card`, `--rule`, `--rule-soft`, and `--accent` only on Done and focus rings.
3. Ochre, teal, `--danger` out of role: the filter chips moved off the ochre `--rate-bg`; nothing new uses them.
4. Mono as prose: no. Mono carries the trade-off figure and the settings line's figures; the sentences around them are `--ui`.
5. More than one primary in a view: no (quality floor 0); Done is the Lifestyle dialog's one primary, and the dialog stands over a scrim.
6. Headlines with a verb or a number, em dashes and banned words: the wave adds no headline; the new strings are a label and one sentence with a figure. No em dash, no middot and no banned word in any changed line.
7. Remove one thing: the accent tick on the phone tab, and with it six other accent marks in the chrome; the plus's rise over the bar went too.

## Direction check

Rules used: R4 (active section, ink pill both widths), R5 (section change and the sliding marker), R6 (bottom slot arrival), R7 (one close), R8 (selected tiles in ink), R10 (dialog family), R11 (no decorative accent marks), DIRECTION.md part 2 (tokens, exits in `--dur-2`, no overshoot, transform and opacity with colour at `--dur-1`), part 7 (phone sheet, safe areas, dvh, tap targets, hover under `(hover: hover)`), part 9 ("no tint on the Lifestyle door"), and carta-design's Lifestyle control (one sentence with the figure). No pattern was built without a rule.
