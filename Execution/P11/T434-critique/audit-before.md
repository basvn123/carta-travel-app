# T434 My trips: technical audit, before the rebuild

Audit run 2026-10-16 against the working tree on `p11-my-trips` (root `434a700ea`, app `05c36df`), dev server on port 4260, following `impeccable/reference/audit.md`. Read only: no source was edited.

Scope: `src/auth/SavedTripsPanel.jsx`, `PastTripForm.jsx`, `TripMemoryView.jsx`, `TripSharePanel.jsx`, `src/community/GuidesPanel.jsx`; CSS `src/styles/17-saved-trips.css`, `69-v6-account.css`, `25-feature-pages.css` lines 8 to 219. Where a finding lives in a file outside that list (the surface's CSS is spread wider, see Patterns), the file is named.

Rules measured against: carta-design SKILL.md (44 px on coarse pointers, nothing functional under 11 px, figures 12 px or more, reduced-motion branch, visible focus, aria-modal traps focus, one h1, real links for navigation, no horizontal scroll at 360 px), PRODUCT.md "Accessibility constraints", DESIGN.md tokens.

## Evidence gathered

| Source | Result |
|---|---|
| `node scripts/verify_past_trip.mjs` (CARTA_PORT=4260) | PASS, 20 of 20 checks |
| `node scripts/verify_saved.mjs` (CARTA_PORT=4260) | FAIL. (1) Stale assertion: it demands the selected tab be `--ink-fill` rgb(43, 52, 70), a dark-filled selection that carta-design "Never do this" 1 bans; the page correctly draws the tint rgb(246, 231, 211). (2) Then `page.goto('/?savedmock')` timed out at 30 s waiting for the `load` event on the dev server, so sections 3 onward never ran. The harness needs updating with the rebuild, not the page. |
| `impeccable detect --json` on all eight target files, with and without `--no-config` | `[]`, zero findings. A deliberately bad control file (`#000`, 9 px text, a gradient) also returned `[]`, so the detector is not producing findings in this environment. No deterministic scan is available; every finding below is from code reading plus the browser probe. |
| Browser probe (Playwright, read only, scratchpad script) at 390x844 and 360x780 (touch, coarse), 820x1180 (touch, coarse), 1440x900 (fine), `?savedmock` plus seeded day plans and one memory | Results quoted per finding. Summary: one h1 on every tab at every width; no horizontal scroll at 360, 390, 820 or 1440; no text pair under 4.5:1 found by the approximate contrast walk; focus ring present on every stop of a 22-stop keyboard walk. |
| Screenshots in `Execution/P11/T434-shots/before/` | Only phone (390) and iPad (820) sets exist; there is no 1440x900 set in that folder. The 1440 state was probed live instead. |
| Concurrent edits | While this audit ran, another session began the rebuild in the app tree (uncommitted: `SavedTripsPanel.jsx`, `TripSharePanel.jsx`, `App.jsx`, `coplanners.js`, `tripPlanStorage.js`, `useAccountSync.js`, new `src/auth/mytrips/`, `src/lib/myTrips.js`; latest write 18:51). Every file:line below is checked against app `HEAD` 05c36df (line counts and quoted lines match exactly). The probe's DOM carried the HEAD class names and structure throughout, so its measurements describe the before state; the dev server's HMR reloads from that session may have contributed to `verify_saved.mjs`'s 30 s `load` timeout. |

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | The three tabs are `role="tab"` with no tabpanel, no `aria-controls`, no roving tabindex and no arrow keys; several form fields have no label; Guides is a full-screen overlay with no dialog semantics or trap |
| 2 | Performance | 2 | The record map tears down every pin and re-frames the camera on every parent render (measured); localStorage is read and parsed per card per render |
| 3 | Responsive Design | 2 | No sideways scroll anywhere, but many controls sit under 44 px on coarse pointers (tablet rail tabs 36 px, form controls 22 to 35 px, share options about 30 px) and the phone tab labels are 10.5 px |
| 4 | Theming | 2 | Colours are tokens (three rgba literals), motion is tokenised, but about 120 literal px font sizes, legacy aliases throughout, literal radii, and `--bg-card` is redefined to the sunken grey for the whole page |
| 5 | Implementation Integrity | 2 | The day-cost line prints "national" and no estimate mark, the rating picker fills a chip in `--rate`, navigation is buttons with no URL, and the surface's CSS is a seven-file override stack |
| **Total** | | **10/20** | **Acceptable (significant work needed)** |

## Implementation Integrity Verdict

**Conditional fail.** The intent is product specific and good: dates file trips into Planned and Visited without anyone filing them, Undo replaces confirm, the record is a map plus a ledger plus the traveller's own words, and the comments carry the reasoning for nearly every rule. What fails is the expression against the written system:

- Money: the card figure carries the word "national" and no `~ est.` mark (`SavedTripsPanel.jsx:324-345`, i18n `saved.costNational`), which T438 retired explicitly. For a product whose "only real asset is trust in the numbers", this is the most important drift.
- Marks: the past-trip rating picker fills the chosen number in `--rate` (`17-saved-trips.css:1078-1082`), the banned "filled rating chip"; the share panel's selected options are tint only, with no mark.
- Navigation: every card that opens a page is a `<button>`, and My trips itself has no URL and writes no history entry.
- Structure: the surface is styled from seven stylesheets layered by load order, and the file named for it (`17-saved-trips.css`) also carries the itinerary extras, the expense ledger and climate bars.
- The detector produced nothing (see Evidence), so this verdict rests on code and probe evidence only; no detector false positives to discount.

## Executive Summary

- Audit Health Score: **10/20** (Acceptable)
- Issues: **P0 0, P1 9, P2 14, P3 6**
- Top issues:
  1. The record map rebuilds all pins and re-runs `fitBounds` on every render of the panel, so a traveller who pans the map and then taps a trip card has the map snap back (measured: all 3 original pin nodes replaced, 6 pin inserts after one tap, 3 more after the next).
  2. Silent data loss path: trip photographs are stored as base64 data URLs in localStorage (budget 1.6 MB per trip), and `persistTripExtras` swallows the quota error, so the form closes as if saved while the memory never lands.
  3. The tabs look like tabs and announce as tabs but do not behave like tabs (no arrow keys, no tabpanel); the kit `Tabs` already does this.
  4. The day-cost figure breaks the money rules (no estimate mark, the "national" word, no "a person").
  5. Touch and type floors: 10 and 10.5 px tab text on a phone, 10 px flag names, and a long list of controls under 44 px on touch devices, concentrated in the past-trip form and the share panel.
- Recommended next steps: rebuild the panel on the kit (Tabs, Card, Field, Segmented, IconButton, Money) with one stylesheet for the surface; memoise the map props and move storage reads out of render; give My trips and its cards real URLs; move photographs out of localStorage or make quota failure visible.

## Detailed Findings by Severity

### P1 Major

**[P1-1] The record map is rebuilt and re-framed on every render**
- Location: `SavedTripsPanel.jsx:1336-1353` (`visitedMapProps` is a fresh object each render, with an inline `fitPadding` literal at 1351 and an inline `onSelectStop` at 1352), `:1953` (the full-screen copy passes another inline `fitPadding`); `src/map/TripMap.jsx:525-757` (the draw effect lists `fitPadding` in its dependencies, removes every marker, rebuilds them, then calls `fitBounds` with `duration: 700`).
- Category: Performance
- Impact: Any state change in the panel (opening a trip's memory, the Undo toast, opening Share, a crew edit, a new `costs` map from App) destroys and recreates every marker and animates the camera back to the frame. Measured at 1440: after panning, one tap on a visited card replaced all 3 pin nodes (0 of the tagged originals left) and inserted 6 pins; the second tap inserted 3 more. With a long record this is hundreds of DOM markers rebuilt per tap, and the traveller's own pan or zoom is thrown away.
- Recommendation: Hoist the two padding objects to module constants, build `visitedMapProps` in a `useMemo` keyed on `visitedItems`, `visitedIso` and `mapLocale`, and pass `onSelectStop` through a stable callback (TripMap already reads it through a ref, so a `useCallback` over `visitedItems` is enough).
- Suggested command: $impeccable optimize

**[P1-2] localStorage reads and JSON parsing inside render**
- Location: `SavedTripsPanel.jsx:45-51` `countPlannedDays` called per upcoming plan in render (`:1757`); `:1418-1421` `crewFor` (calls `loadTripExtras`, a `getItem` plus `JSON.parse`) called per visited card through `crewBarFor` (`:2065`, `:2107`) on every render and again inside its handlers; `:1161-1170` `memories` re-parses every finished trip's extras whenever `pastPlans` changes, which includes every Undo hold; `:1717` `kindsForDest` in an inline IIFE per favourite.
- Category: Performance
- Impact: Measured 10 `localStorage.getItem` calls for a single card-tap render with the mock data (4 visited, 2 upcoming). The extras blob holds the memory, including photographs as data URLs, so each read can parse up to 1.6 MB per trip (`PastTripForm.jsx:58`), synchronously, on the main thread, on every render.
- Recommendation: Read crews and planned-day counts once into a map keyed by plan id inside a `useMemo` on `[plan ids, memTick]`, and keep photographs out of the blob that render reads (see P1-3).
- Suggested command: $impeccable optimize

**[P1-3] Trip photographs can be lost silently when storage is full**
- Location: `PastTripForm.jsx:53-58, 62-85, 263-291` (photos downscaled to base64 JPEG, up to 1.6 MB a trip); `pastTripMemory.js:140-152` `saveMemory`; `planner/dayPlanStore.js:243-250` `persistTripExtras` (`catch { /* ignore */ }`); `SavedTripsPanel.jsx:1108-1111` (closes the form after `saveMemory` as success).
- Category: Performance / Implementation Integrity (harden)
- Impact: Browsers cap localStorage at about 5 MB per origin, shared with the day plans, extras and caches. Two or three photo-heavy trips fill it; the next save throws `QuotaExceededError`, which is swallowed, the form closes as if saved, and the story, spend and photos are gone. Nothing on screen says so.
- Recommendation: Let the quota error surface (`persistTripExtras` returns a result, `handleSavePastTrip` shows `saved.pastSaveFailed`), and move photographs to IndexedDB or the account's storage so the memory blob stays small.
- Suggested command: $impeccable harden

**[P1-4] The three tabs are not a working tablist**
- Location: `SavedTripsPanel.jsx:1587-1599` (`renderTabs`), `:1612` and `:1628` (two `role="tablist"`, CSS shows one), content at `:1637-2130` has no `role="tabpanel"`.
- Category: Accessibility
- Impact: Measured: `aria-controls` null on all three tabs, 0 tabpanels, no `tabindex` management (all three are Tab stops), ArrowDown on the first tab moves neither focus nor selection. A screen reader announces "tab, 1 of 3" and then the documented tab keys do nothing, and the content is not tied to its tab. Carta-design "Tabs" requires tablist semantics with arrow, Home and End keys.
- WCAG/Standard: 4.1.2 Name, Role, Value; WAI-ARIA APG Tabs pattern
- Recommendation: Use the kit `Tabs` (it has the brown underline, roving tabindex and keys), give the content a `role="tabpanel"` with `aria-labelledby`, and render one arrangement rather than two twinned lists.
- Suggested command: $impeccable harden

**[P1-5] Form fields with no label, and two date fields with the same name**
- Location: `SavedTripsPanel.jsx:594-600` (crew name input: placeholder "A name" only, no `aria-label`, measured); `PastTripForm.jsx:520-527` (companion name rows, placeholder only); `:710-716` (existing highlight rows, no label at all); `:438-456` (both `DateField` triggers are named "Pick a date", measured; the "First day" and "Last day" spans are not tied to them); `:350-351`, `:435-436`, `:465-466` (group labels are bare spans).
- Category: Accessibility
- Impact: A screen reader user meets unnamed edit fields in the crew popover and the companions fold, and cannot tell the first-day picker from the last-day picker. The required pair (where and when) is not marked required, and Save is disabled with no reason given.
- WCAG/Standard: 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions, 4.1.2
- Recommendation: Build the form from the kit `Field` (visible label, help, error tied by `aria-describedby`); pass `aria-labelledby` to `DateField`; say under the Save button what is still missing.
- Suggested command: $impeccable harden

**[P1-6] Functional text under 11 px on a phone**
- Location: `25-feature-pages.css:180` (`.saved-cat` labels 10.5 px: measured "Planned", "Shortlist", "Visited" at 10.5 px on 390 and 360); `17-saved-trips.css:606-608` (`.saved-tabs button small` 10 px, measured on the phone tab counts; it outranks the 11 px in `69-v6-account.css:50-57` by specificity); `17-saved-trips.css:675-681` (`.ledger2-flagname` 10 px, measured at every width); `17-saved-trips.css:1062-1070` (rating picker figures 11.5 px, under the 12 px figure floor).
- Category: Accessibility / Responsive
- Impact: The page's primary navigation on a phone is set below the system's own floor (carta-design "Never do this" 10); country names under the flags are 10 px.
- Recommendation: Labels at `--text-label` (13 px) or at least `--text-micro`; counts at `--text-micro`; figures at `--text-caption`. Write the tokens, not px.
- Suggested command: $impeccable typeset

**[P1-7] Touch targets under 44 px on coarse pointers**
- Location and measurements (touch contexts):
  - Desktop rail tabs on a touch tablet at 820 px: 181x36 (`25-feature-pages.css:122-128`); the rail appears from 769 px whatever the pointer.
  - Past-trip form: fold heads 35 px tall (`17-saved-trips.css:972-985`), "ghost" buttons 28 px (`:934-951`, add companion, add photos, find anywhere), transport mode buttons 32x30 (`:1014-1027`), rating numbers 28x28 (`:1062-1071`), photo cover and remove buttons 22x22 over the photo (`:1106-1118`).
  - Crew name input 37 px (`17-saved-trips.css:1666-1678`) and its Add button.
  - Share panel: Make a link, Copy, Withdraw, the duration and visibility options, all about 30 px (`23-places-pages.css:2725-2801`, `:3132-3141`, `:3485-3495`); none of them is in the coarse list at `69-v6-account.css:605-650`.
  - Empty-state button on a tablet: 126x33 (`.saved-empty-cta`).
  - Record map: plain pins 24x30 (carta-design "Every pin has a 44 px hit box"), MapLibre zoom buttons 29x29 on the tablet.
- Category: Responsive
- Impact: These are the controls a traveller uses with a thumb on a train: logging a trip, rating it, sharing it. Mis-taps on 22 px photo buttons sitting over the image delete or re-cover photos.
- WCAG/Standard: 2.5.8 Target Size (AA, 24 px) met in most places; carta-design 44 px floor not met
- Recommendation: Rebuild on kit `Button` sm/md, `IconButton` (always 44 px), `Chip` and `Segmented`, whose coarse-pointer sizes are already right; stop maintaining a per-class coarse list.
- Suggested command: $impeccable adapt

**[P1-8] Guides is a full-screen overlay without dialog behaviour**
- Location: `GuidesPanel.jsx:283-293` (a `div.panel.open` at `z-index: 1200`, `25-feature-pages.css:237`, no `role="dialog"`, no `aria-modal`, no `useFocusTrap`); `App.jsx:261` (`behindPanel` inerts the tabs only for My trips and Account, not Guides); `GuidesPanel.jsx:357` and `:303` (opening a guide or going back unmounts the focused control, focus falls to `body`).
- Category: Accessibility
- Impact: Keyboard and screen reader users are not moved into the guides page, can Tab into the hidden page behind it, and lose their place each time they open or leave a guide. There is no h1 on the page (the title is an `h2`, `:292`).
- WCAG/Standard: 2.4.3 Focus Order, 1.3.1; PRODUCT.md "Every aria-modal overlay traps focus"
- Recommendation: Either make Guides a page with its own URL and h1 (preferred, matches "Navigation" in carta-design), or give it the dialog family: `useFocusTrap`, `inert` behind, focus to the heading on open and back to the card on return.
- Suggested command: $impeccable harden

**[P1-9] The day-cost line breaks the money rules**
- Location: `SavedTripsPanel.jsx:324-345` (`SavedCost`), i18n `en.js:1234-1236` (`saved.costDay` "{eur} a day", `saved.costNational` "national"); styles `69-v6-account.css:84-101`.
- Category: Implementation Integrity
- Impact: Cards read "From €69 a day" (screenshot `before-mytrips-trips-phone.png`) and, for a stand-in figure, "€69 a day national". Carta-design (T438): a stand-in carries `~€69 est.` and nothing else about its source, never the word "national"; the price line is "a person". A family reading "€69 a day" cannot tell if it is per head or for the party.
- Recommendation: Render through `<Money est>` / `formatEst()` with the per-person phrase from i18n, the same component Explore's cards use, and delete `saved.costNational` in all six languages.
- Suggested command: $impeccable clarify

### P2 Minor

**[P2-1] My trips has no URL and writes no history**
- Location: `App.jsx:306-310` (`toggleSaved` flips state only), `components/AppHeader.jsx:178-190`, `components/BottomNav.jsx:117-127` (buttons); `App.jsx:736-748` (popstate closes it).
- Category: Implementation Integrity / Accessibility
- Impact: On a phone, the Back gesture from My trips goes to the previous section's history entry, or out of Carta; the page cannot be linked or restored on reload. The header comment says this was deliberate ("a page laid over the tab, not a section"); carta-design "Navigation" now says a view change is an `<a href>` that pushes one entry. This is an owner call for the rebuild.
- Recommendation: Give My trips a `tabHref`-style URL (with the tab as a parameter) and route it through `goToTab`.
- Suggested command: $impeccable shape

**[P2-2] Cards that open a page are buttons, not links**
- Location: `SavedTripsPanel.jsx:357` (`SavedCard`), `:394` (`FavCard`), `:475-494` (`ShortlistRow`), `:661` (`JourneyCard`); `GuidesPanel.jsx:49` (`GuideCard`).
- Category: Implementation Integrity / Accessibility
- Impact: No open-in-new-tab, no copyable address, and a Visited card behaves two ways under one look: it navigates to the planner when the trip has no memory and expands the memory in place when it has one (`:2048-2051`, `:2102-2104`), with no `aria-expanded` on the expanding case.
- Recommendation: Kit `Card` with one stretched `<a href>` for navigation; a separate disclosure button with `aria-expanded` for the memory.
- Suggested command: $impeccable harden

**[P2-3] The panel and its CSS ship in the first paint for every visitor**
- Location: `App.jsx:101` (static `import { SavedTripsPanel }`), so `PastTripForm`, `TripMemoryView`, `TripSharePanel`, `ModerationNotice`, `FriendTripPanel`, `InstallHint` and their helpers ride in the main chunk; `styles.css:19, 27, 61` import 17, 25 and 69 into the one first-paint stylesheet.
- Category: Performance
- Measurement: built `dist/assets/index-DRmS7XA4.js` is 821,487 bytes (253,476 gzip) and contains all of them (one hit each for `saved-trips-panel`, `pasttrip-form`, `tshare-scopes`, `memo-recline`); the source family is about 220 KB. `dist/assets/index-DWYucrtA.css` is 910,432 bytes (144,110 gzip); 17 plus 69 plus 25:8-219 are 102 KB raw (23.8 KB gzip) of it, before the My trips rules in 23, 24 and 26.
- Positive: the record map is lazy (`:41`) and only one MapLibre instance lives at a time; `GuidesPanel` is already lazy (`App.jsx:82`).
- Recommendation: `lazyWithReload` the panel like the planners; split the surface CSS into a file imported by the lazy chunk.
- Suggested command: $impeccable optimize

**[P2-4] `sizes` does not match the rendered photo widths**
- Location: `SavedTripsPanel.jsx:445` (`SHOT_SIZES = '(min-width: 769px) 360px, 50vw'`) used by every card.
- Category: Performance
- Measurement at 1440: the focal photo renders 495 px wide from a 360 px-natural source (soft, worse at 2x), while the 44 px row thumbnails and the 44 px day-plan photo fetch the same 360 to 500 px file.
- Recommendation: One `sizes` per variant (focal, card, row, favourite), or the kit Card's media slot.
- Suggested command: $impeccable optimize

**[P2-5] Pressed caption band turns its text white on a light tint**
- Location: `69-v6-account.css:328-337`.
- Category: Accessibility / Theming
- Impact: On press the band takes `--select-bg` (umber 100) but the secondary lines are set to `--on-fill` (white), about 1.2:1 for the length of a long press. The comment still describes the retired `--ink-fill` press.
- Recommendation: Keep `--select-ink` for every line on the pressed tint.
- Suggested command: $impeccable polish

**[P2-6] Inputs drop the house focus ring for a 1 px border change**
- Location: `17-saved-trips.css:866, 879, 893, 1134` (`outline: none; border-color: var(--accent)`), `:1679` (crew input: `border-color: var(--ink-soft)`, near invisible).
- Category: Accessibility
- Impact: Carta-design: inputs add the brown border on top of the 2 px ring, not instead of it. The crew input's focus is barely visible.
- WCAG/Standard: 2.4.7 Focus Visible (met weakly), 2.4.13 Focus Appearance (AAA)
- Suggested command: $impeccable polish

**[P2-7] The card menu stays open when focus leaves it**
- Location: `SavedTripsPanel.jsx:211-297` (`CardMenu` closes on outside `mousedown` and Escape only).
- Category: Accessibility
- Measurement: Enter on "More actions" focuses the first menu item (good); Tab then leaves the menu, which stays open (1 popover still mounted).
- Recommendation: Close on focusout outside the menu, and on Tab.
- Suggested command: $impeccable harden

**[P2-8] The friends comparison is a table drawn with divs, legend last**
- Location: `SavedTripsPanel.jsx:772-789` (`FriendLedger`).
- Category: Accessibility
- Impact: A screen reader reads "You 3 3, Sofie Vermeulen 2 3 ..." and only then the column names. The visual legend is also under the rows (`before-mytrips-visited-ipad.png`).
- Recommendation: A `<table>` with a header row and `scope`.
- Suggested command: $impeccable harden

**[P2-9] Rating picker draws a filled rating chip**
- Location: `PastTripForm.jsx:683-696`; `17-saved-trips.css:1062-1082` (`.pasttrip-rate.on` fills `--rate` with `--paper` text).
- Category: Implementation Integrity / Theming
- Impact: Carta-design bans a fill behind a rating; ten 28 px number buttons also miss the touch and figure floors (P1-6, P1-7).
- Recommendation: Kit `ChipGroup` choice chips (tint plus tick), or a stepped Segmented of the ten values.
- Suggested command: $impeccable polish

**[P2-10] Selected share options carry colour only; the form's error is brown**
- Location: `TripSharePanel.jsx:293-329, 404-418` with `23-places-pages.css:2674, 3141, 3495` (tint, no mark); `17-saved-trips.css:963` (`.pasttrip-error { color: var(--accent) }`).
- Category: Accessibility / Implementation Integrity
- Impact: "Selection never rests on colour alone" (carta-design) is not met for scope, duration and visibility; the save error reads in the action colour instead of `--danger`.
- Recommendation: Kit `Segmented` (lifted white thumb) and `ChipGroup`; errors through `Field` in `--danger`.
- Suggested command: $impeccable colorize

**[P2-11] The record map asks for Ctrl to zoom**
- Location: `SavedTripsPanel.jsx:1925` (`cooperativeGestures`), `:1320-1324` (the Ctrl and Cmd strings).
- Category: Implementation Integrity
- Impact: Carta-design: "Maps on a page never ask for Ctrl or Cmd: a two-finger trackpad swipe pans, a pinch zooms, a mouse wheel zooms". The harness even asserts the Ctrl message.
- Suggested command: $impeccable adapt

**[P2-12] Transport mode in the memory view has no accessible name**
- Location: `TripMemoryView.jsx:40-48` (`Leg`: the mode is only a `title` on a span around an icon).
- Category: Accessibility
- Impact: "Train", "Ferry" and so on are invisible to screen readers and to touch users (no hover).
- Recommendation: Visible word or `aria-label` plus `role="img"`.
- Suggested command: $impeccable harden

**[P2-13] Theming drift across the surface**
- Location: `69-v6-account.css:667` (`.saved-shell { --bg-card: var(--paper-dim) }` repaints every card sunken grey); literal px font sizes (about 60 in 17, 30 in 69, 4 in 25:8-219, for example `25-feature-pages.css:99, 127, 137, 180`); legacy aliases (`--ink`, `--ink-soft`, `--ink-mute`, `--paper`, `--paper-dim`, `--rule`, `--accent`, `--mono`, `--display`) in nearly every rule; literal radii 6, 8, 9 and 999 px (`69-v6-account.css:68, 151, 161, 384, 401`; `17-saved-trips.css:1022, 1067, 1095, 1667`); literal `.15s` transitions (`25-feature-pages.css:103, 183`); three rgba literals (`17-saved-trips.css:95`, `25-feature-pages.css:143, 219`, the last two dead after 69's overrides).
- Category: Theming
- Impact: Cards read as grey on grey (`before-mytrips-visited-ipad.png`) where carta-design puts white `--surface` cards on the warm grey ground; type does not follow the scale, so the page's hierarchy is hand-tuned per class. Single theme by decision, so no dark mode is expected.
- Recommendation: Rebuild on role tokens and the type scale; delete the `--bg-card` override.
- Suggested command: $impeccable colorize, then $impeccable typeset

**[P2-14] The surface is styled from seven stylesheets**
- Location: rules for `.saved-*`, `.uptrip`, `.fav-card`, `.slist`, `.pasttrip`, `.memo`, `.tshare`, `.gld-`, `.coplan` live in `11-trip-planner.css`, `17-saved-trips.css`, `23-places-pages.css`, `24-destination-workspace.css`, `25-feature-pages.css`, `26-shortlist-extras.css` and `69-v6-account.css` (plus `62-v6-explore.css` for guides). `17-saved-trips.css` also holds the itinerary extras, the expense ledger and climate bars (for example lines 200 to 445, 2023).
- Category: Implementation Integrity
- Impact: Specificity and load order decide what renders (P1-6's 10 px count is a 17 rule beating a later 69 rule), comments describe states that no longer render, and a rebuild cannot be reverted cleanly file by file.
- Recommendation: One surface stylesheet owned by the rebuild; delete the old rules in the same commit (OWNERSHIP rule 5).
- Suggested command: $impeccable distill

### P3 Polish

**[P3-1]** `PastTripForm.jsx:126-134`: the stepper's names are built by concatenation (`${label} -1`) and its glyphs are hyphen-minus; use i18n "Fewer nights in {city}" / "More nights in {city}" and the Icon set. ($impeccable clarify)

**[P3-2]** `TripMemoryView.jsx:72`: a non-euro amount is printed with `n.toFixed(2)` plus the currency code, outside `formatMoney` (carta-design "Never do this" 9). ($impeccable clarify)

**[P3-3]** Date ranges use "→" (`SavedTripsPanel.jsx:1716, 1770, 1848, 2047, 2101`) and the footer uses "›" (`:370, :705`); carta-design copy: ranges use the word "to", icons through `<Icon>`. ($impeccable clarify)

**[P3-4]** Focus is dropped after a control removes itself: Withdraw link (`TripSharePanel.jsx:273-282`), "Add details" (`PastTripForm.jsx:477-483`, which also hard-codes `aria-expanded={false}`). The copy button carries `aria-live` on itself (`TripSharePanel.jsx:358`); Guides' "Copied" has no live region (`GuidesPanel.jsx:167-170`). ($impeccable harden)

**[P3-5]** `GuidesPanel.jsx:52`: guide card photos use the raw catalogue URL with no `srcSet`/`sizes` (unlike `ShotPhoto`); the country filter is single-choice but uses `aria-pressed` toggles (`:311-331`) rather than radio semantics. ($impeccable optimize)

**[P3-6]** Out-of-scope note: `TripMap.jsx:719, 728, 735, 747` frame with a literal `duration: 700` (above `--dur-4`); MapLibre skips it under reduced motion, so this is a token issue only. The `verify_saved.mjs` selected-tab assertion (line 113) and its 30 s `load` wait need updating with the rebuild. ($impeccable polish)

## Patterns and Systemic Issues

- **Per-class sizing instead of the kit.** Touch size, type size and selection marks are re-solved class by class (a coarse-pointer list in `69-v6-account.css:605-650` that already misses the form and share controls). The kit's `Button`, `IconButton`, `Chip`, `Segmented`, `Tabs`, `Field` and `Card` would close P1-4, P1-5, P1-6, P1-7, P2-9 and P2-10 together.
- **Derived data computed in render.** Storage reads, image lookups, kind lookups and the map props are recomputed per render; the one memo with a deliberate trigger (`memTick`) re-parses everything.
- **Override stack.** Seven stylesheets, specificity fights, stale comments ("the selected tab is --ink-fill"); the harness inherited the stale belief.
- **Buttons for navigation.** Every card, the page itself and the Guides page lack URLs.

## Positive Findings

- One h1 ("My trips") on every tab at every width, headings in order (h1, h2, h3 for the moderation notice).
- No horizontal scroll at 360, 390, 820 or 1440 (measured).
- A visible 2 px `--focus` ring on every stop of a 22-stop keyboard walk, from the zero-specificity floor in `02-base.css:95-98`.
- The full-screen record map is a real `role="dialog"` with `aria-modal` and `useFocusTrap` (`:198-206`), portalled out of the transformed panel, with a capture-phase Escape that does not close the page behind (`:1051-1060`).
- The card menu is a proper menu: focus moves in, arrows, Home and End, Escape returns focus to its button (`:217-254`).
- Undo instead of confirm, with focus handed to Undo only when focus was lost (`:171-193`); the confirm halves that cannot be undone (publish, withdraw) put focus on the safe answer (`TripSharePanel.jsx:181-193`).
- `ShotPhoto` is a real `<img>` with `srcSet`, `loading="lazy"`, `decoding="async"` and an aspect pair (`:447-462`); TripMemoryView filters foreign photos to `data:` URLs so a shared trip cannot carry a tracking pixel (`TripMemoryView.jsx:58-64`).
- Only one MapLibre instance at a time, lazy loaded, with a still placeholder (`:1919-1927`).
- Every transition in `17-saved-trips.css` reads the duration tokens; the app-wide reduced-motion floor (`02-base.css:110`) lands every animation on its end state.
- Loading and error states are separate (`tripPlansError` is not shown as "no trips", `:895-900`); inputs are 16 px on a phone (no iOS zoom).

## Recommended Actions

1. **[P1] `$impeccable optimize`**: memoise `visitedMapProps` and constant paddings (P1-1); move crew, planned-day and kind lookups out of render (P1-2); lazy-load the panel and its CSS (P2-3); per-variant `sizes` (P2-4).
2. **[P1] `$impeccable harden`**: kit `Tabs` with a tabpanel (P1-4); `Field` labels and named date pickers (P1-5); Guides as a page or a trapped dialog (P1-8); surface quota failures and move photos out of localStorage (P1-3); menu focusout, ledger table, mode names, links for navigation (P2-2, P2-7, P2-8, P2-12).
3. **[P1] `$impeccable clarify`**: the price line through `<Money est>` with "a person" and no "national" (P1-9); stepper names, "to" in ranges, `formatMoney` for foreign amounts (P3-1 to P3-3).
4. **[P1] `$impeccable adapt`**: 44 px on coarse pointers across the form, share panel, rail and pins; no Ctrl-to-zoom on the record map (P1-7, P2-11).
5. **[P1] `$impeccable typeset`**: tab labels, counts, flag names and rating figures onto the type tokens (P1-6, P2-13).
6. **[P2] `$impeccable colorize`**: one selected state with a mark for share options and the rating picker; errors in `--danger`; drop the `--bg-card` override (P2-9, P2-10, P2-13).
7. **[P2] `$impeccable shape`**: owner call on a URL for My trips and for each card (P2-1).
8. **[P2] `$impeccable distill`**: one surface stylesheet, old rules deleted, harness updated (P2-14, P3-6).
9. **`$impeccable polish`**: pressed-band contrast, input focus rings, remaining P3 items (P2-5, P2-6, P3-4, P3-5).

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit` after fixes to see your score improve.
