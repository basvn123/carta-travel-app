# T434 My trips: technical audit, after the rebuild

This audit was run on 2026-10-16, about 20:10 to 20:45, against the working tree on `p11-my-trips` (root `434a700ea`, app `05c36df` plus the uncommitted T434 work). It follows `impeccable/reference/audit.md`, the same playbook as `audit-before.md`, so the scores compare like with like. Read only: no source was edited.

**Scope.** The audit covers:

- `src/auth/SavedTripsPanel.jsx`
- `src/auth/mytrips/MyTripsTabs.jsx`, `TripCards.jsx` and `parts.jsx`
- `src/auth/TripSharePanel.jsx`
- `src/community/GuidesPanel.jsx`
- `src/styles/70-mytrips.css`
- `src/lib/myTrips.js`

Where a finding lives in a file outside that list, the file is named.

**Rules measured against.** Carta-design SKILL.md: 44 px on coarse pointers and 32 px for compact controls on fine ones, nothing functional under 11 px, figures at 12 px or more, one h1 with headings in order, `aria-modal` traps focus and closes on Escape, real links for navigation, no Ctrl-to-zoom, no horizontal scroll. Also PRODUCT.md and DESIGN.md.

## Evidence gathered

| Source | Result |
|---|---|
| `impeccable detect --json` on the 8 target files, with and without `--no-config` | `[]` on every file. A control file now does produce findings (1 for the bad CSS, several for the bad HTML). The before audit's note that "the detector is not producing findings" no longer holds, so these zeros are real but weak. |
| `design-lint.mjs --meter` for SavedTrips, auth/mytrips, TripSharePanel, GuidesPanel and 70-mytrips | 0 on every rule (raw-button, font-size, radius, legacy-token, money). Before: 24, 12 and 8 raw buttons in the three rewritten files. The full lint reports 0 new violations against the baseline. |
| Live detector at 390, 820 and 1440 on the three tabs | Inside `.mytrips`, after verification: 1 true positive (skipped heading), 1 false-positive pattern (text occlusion by the stretched card title) and MapLibre's 11 px attribution. Before: `undersized-ui-text` on the phone tabs (10.5 px) and the flag names (10 px). Details in `assessment-b-after.md`. |
| Playwright probe on `dist/` built at 20:28:57 (my own preview on 4377; the shared 4191 preview served a stale index) | See below. |
| `dist/assets` | `SavedTripsPanel-ih3yGAyB.js` (81,280 B) and `SavedTripsPanel-C7m8ZJQV.css` (13,221 B) are their own chunks. First-paint JS is 91,871 B smaller and first-paint CSS 28,885 B smaller than before. |

What the probe found at 390x844 (touch, coarse), 820x1180 (touch, coarse) and 1440x900 (fine):

- No text under 11 px and no figure under 12 px.
- No text pair under 4.5:1.
- No sideways scroll in `.saved-trips-panel` or the document.
- One h1.
- Every control is at least 44 px on touch, except the map pins and MapLibre's attribution.
- A visible 2 px `--focus` ring on every keyboard stop.
- The Explore layer behind the page is `inert`.

**Concurrency caveat.** Another session edited the target files at 20:26 and rebuilt `dist/` three times while this audit ran. The files have not changed since 20:26 and the measured build is from 20:28:57, so the line numbers and the browser evidence agree.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | The tabs are now a working tablist and every overlay traps focus and closes on Escape. What remains: the card menu stays open when Tab leaves it, and the Trips and Shortlist tabs skip from h1 to h3 |
| 2 | Performance | 3 | Lazy chunk for JS and CSS, a memoised record map (measured: pins survive a panel state change) and storage reads moved out of render. What remains: a full localStorage fails silently on a past-trip save, and the guide map re-frames on "Copy link" |
| 3 | Responsive Design | 3 | 44 px on every touch control (measured at 390 and 820) and no overflow anywhere. What remains: 24x30 pins in the full-size map on a phone, and 30 px sort segments on a fine pointer (a kit default) |
| 4 | Theming | 3 | The new stylesheet is all roles and the type scale (meter at 0). What remains: old `.tshare`, `.modnote` and `--bg-card` rules in 23, 25 and 69 still apply under the new ones, and a few px literals |
| 5 | Implementation Integrity | 3 | The price is now `~€1,343 est. for 2` through `<Money est>`, there is no Ctrl-to-zoom and every control comes from the kit. What remains: navigation is still buttons with no URL (an owner call), and dead strings |
| **Total** | | **15/20** | **Good (address weak dimensions)** |

Before: 10/20 (2, 2, 2, 2, 2).

## Implementation Integrity Verdict

**Pass, with isolated gaps.** The rebuild expresses the written system rather than working around it:

- **Kit.** The three rewritten files and the new folder carry no raw `<button>`. The tabs, rows, chips, segments, icon buttons, fields and money all come from the kit (`Tile`, `Card`, `Chip`, `Segmented`, `IconButton`, `Field`, `Money`), so touch size, type size and selection marks are solved once.
- **Money.** The focal card prints `~€1,343 est. for 2` (screenshot `after-390-trips.png`) through `TripPrice` and `<Money est>` (`parts.jsx:142-155`), and the shortlist rows reuse Explore's `DayPrice`. The word "national" no longer renders.
- **Maps.** The record map no longer asks for Ctrl. On a touch screen it stays still until it is expanded (`MyTripsTabs.jsx:275`), as carta-design's "3D terrain map" paragraph says.
- **Styles.** One surface stylesheet (`70-mytrips.css`) ships with the lazy chunk, and the old files lost about 1,580 lines (`git diff --stat`: 87 added, 1,582 deleted across 17, 23, 24, 25, 26 and 69).

The gaps are isolated:

- Leftover rules in the old files still apply under the new ones (P2-5).
- Cards and the page itself still navigate with buttons and have no URL (P2-6).
- Two dead string sets remain (P3-3).
- The detector's only true positive is the heading skip (P2-2). Its in-shell `text-occlusion` hits are false positives from the kit Card's stretched title.

## Executive Summary

- Audit Health Score: **15/20** (Good). Before: 10/20.
- Issues: **P0 0, P1 1, P2 7, P3 5**. Before: P0 0, P1 9, P2 14, P3 6.
- Top issues:
  1. **[P1] Silent loss of a past trip's story and photos when browser storage is full.** This is carried over (before P1-3) and is the one P1 left.
  2. The card menu stays open when Tab leaves it (before P2-7, unchanged, measured at every width).
  3. A heading skip from h1 to h3 on Trips and Shortlist (the detector flags it, and I confirmed it in the DOM).
  4. Map pins have a 24x30 hit box in the full-size map on a phone.
  5. The share panel's old rules still apply under the new ones, and the panel cannot be exercised under `?savedmock`, so no browser check covers it.
- Recommended next steps:
  - Make the save path report a storage failure.
  - Close the menu on focus leaving it.
  - Give the focal card and the shortlist an `h2`.
  - Give TripMap pins a 44 px hit box.
  - Delete the leftover `.tshare`, `.modnote` and `--bg-card` rules in 23 and 69.
  - Give the `?savedmock` seam a mock user so the share panel can be verified.

## What the rebuild closed (before finding: status, evidence)

| Before | Status | Evidence |
|---|---|---|
| P1-1 map rebuilt on every render | **Closed** | `mapProps` is memoised (`SavedTripsPanel.jsx:680-694`) and `MAP_PAD` and `FULL_PAD` are constants. Measured: pins survived a same-tab tap and a menu open; they are replaced only when the record changes (year chip) or the tab remounts. |
| P1-2 storage reads in render | **Closed** | `planLocal` is memoised on the plan list and `memTick` (`SavedTripsPanel.jsx:462-471`); the crew bar reads storage only for the one open memory. |
| P1-3 photos lost when storage is full | **Open** | See P1-1 below. |
| P1-4 tabs not a tablist | **Closed** | Kit `TileGroup kind="tabs"`; `aria-controls`, a tabpanel, roving tabindex, and arrows, Home and End all measured working. |
| P1-5 unlabelled fields | **Partly closed** | The crew name is now a kit `Field` with a label (`parts.jsx:226`) and the co-planner select is a `Field` (`TripSharePanel.jsx:206-218`). PastTripForm was not re-audited. |
| P1-6 text under 11 px | **Closed** | Measured: none at 390, 820 or 1440. |
| P1-7 touch targets | **Mostly closed** | Measured: none under 44 on touch except the map pins and attribution (P2-3). The share panel uses kit sizes, read from code. |
| P1-8 Guides without dialog behaviour | **Closed in code** | `role="dialog"`, `aria-modal`, `aria-labelledby`, `useFocusTrap` and an `h1` (`GuidesPanel.jsx:244, 281-283`). Not opened in the browser. |
| P1-9 money rules | **Closed** | `~€1,343 est. for 2` on the focal card; shortlist rows read `~€100 est. a day`. |
| P2-3 panel in first paint | **Closed** | Lazy chunk for JS and CSS (numbers above). |
| P2-4 `sizes` mismatch | **Closed** | Rows use `sizes="72px"` and render 72 px. |
| P2-7 menu stays open on Tab | **Open** | P2-1 below. |
| P2-10 share options colour only, brown error | **Closed in code** | Kit `Segmented` (a lifted white thumb as the mark); `.tshare-error` uses `--danger` (`70-mytrips.css:363`). |
| P2-11 Ctrl to zoom | **Closed** | Measured: no cooperative-gesture screen, and the wheel zooms. |
| P2-13 theming drift | **Mostly closed** | 70 is clean; leftovers are in P2-5. |
| P2-14 seven-file stack | **Reduced** | The main surface is in 70; the share panel, the moderation note, the full-size map, the toast and Guides still draw on 17, 23, 25 and 69 (P2-5). |
| P2-1, P2-2 no URL, buttons for navigation | **Open** | P2-6 below (an owner call). |

## Detailed Findings by Severity

### P1 Major

**[P1-1] A past trip's story and photos can be lost silently when storage is full** (carried over, before P1-3)
- **Location:**
  - `SavedTripsPanel.jsx:249-282` (`handleSavePastTrip`: `saveMemory` at 273, then the form closes at 275 as if saved).
  - `planner/dayPlanStore.js:243-250` (`persistTripExtras`: `catch { /* ignore */ }`).
  - `auth/pastTripMemory.js:140-152` (`saveMemory` returns nothing).
  - `auth/PastTripForm.jsx:58` (`PHOTO_BUDGET_BYTES = 1_600_000`, photos as base64).
- **Category:** Implementation Integrity (harden)
- **Impact:** localStorage is about 5 MB per origin, so two or three photo-heavy trips fill it. The next save throws `QuotaExceededError`, which is swallowed. The form closes, and the story, spend and photos are gone with nothing on screen to say so. For a page whose Visited tab is the traveller's record, this is the most costly failure left.
- **Recommendation:**
  - Make `persistTripExtras` return success or failure and `saveMemory` pass it on.
  - Have `handleSavePastTrip` keep the form open and show `saved.pastSaveFailed` when the write fails.
  - Later, move photographs to IndexedDB or account storage.
- **Suggested command:** $impeccable harden

### P2 Minor

**[P2-1] The card menu stays open when focus leaves it** (carried over, before P2-7)
- **Location:** `auth/mytrips/parts.jsx:33-49` (`CardMenu` closes on an outside `pointerdown` and on Escape only).
- **Category:** Accessibility
- **Measurement:** at 390, 820 and 1440, Enter opens the menu and focuses its first item, and Escape returns focus to "More actions" (both good). But Tab moved focus to "Open trip" while the menu stayed mounted with `aria-expanded="true"`, and a second Tab did not close it either.
- **Impact:** A keyboard user leaves a floating menu over the card behind them. A screen reader still announces the button as expanded.
- **Recommendation:** Close on `focusout` when `relatedTarget` is outside `boxRef`, and close on Tab from inside the menu (the APG menu-button pattern).
- **Suggested command:** $impeccable harden

**[P2-2] Headings skip from h1 to h3 on Trips and Shortlist**
- **Location:**
  - `auth/mytrips/TripCards.jsx:81` (the focal card's title is an `h3` with no section heading above it).
  - `auth/mytrips/MyTripsTabs.jsx:134-152` (Shortlist rows are kit Cards, whose title is `h3.card-title` in `components/ui/Card.jsx`, straight under the `h1`).
- **Category:** Accessibility
- **Measurement:** the detector reports `skipped-heading: <h1> "My trips" followed by <h3> "Portugal"` (Trips) and `"Bruges"` (Shortlist) at every viewport, and the DOM walk agrees. Visited is in order (h1, h2, h3).
- **WCAG/Standard:** 1.3.1 (best practice); carta-design quality floor "headings in order".
- **Recommendation:** Wrap the focal card in a `Section` with an `h2` ("Next trip"; it may be visually quiet), and give the shortlist list an `h2`, or let `Card` take a heading level.
- **Suggested command:** $impeccable harden

**[P2-3] Map pins have a 24x30 hit box where they can be tapped**
- **Location:** `src/map/TripMap.jsx` (`div.trip-pin`, `role="button"`, `tabindex="0"`), used by the full-size map in `MyTripsTabs.jsx:281-292`.
- **Category:** Responsive
- **Measurement:**
  - In the full-size dialog at 390 (coarse), "Munich", "Bruges" and "Salzburg" are 24x30.
  - At 1440 the in-page pins are 24x30 and the MapLibre zoom buttons 29x29.
  - In the page flow on a touch screen the pins sit under `.mt-map-shield` and are not targets, which is correct.
- **Impact:** Carta-design says "Every pin has a 44 px hit box"; Never-do 10 says no touch target under 44 on a coarse pointer. WCAG 2.5.8 (24 px) is met.
- **Recommendation:** Give the pin a transparent 44x44 hit area centred on the drawn pin, in TripMap, so every map on the site gains it. This is outside the T434 file list.
- **Suggested command:** $impeccable adapt

**[P2-4] The guide map re-frames on every "Copy link"**
- **Location:** `community/GuidesPanel.jsx:180` (`fitPadding={{ top: 26, left: 26, right: 26, bottom: 26 }}`, a new object on each render). `map/TripMap.jsx:757` lists `fitPadding` in the draw effect's dependencies.
- **Category:** Performance
- **Impact:** `copied` flips twice per copy (`setCopied(true)`, then false after 2.5 s), so each copy re-pins and animates the camera back to the frame twice. It throws away a reader's pan. This is the same mechanism as before P1-1 on the record map. Found by reading the code; not measured, because Guides needs live data.
- **Recommendation:** Hoist the padding to a module constant, as `MAP_PAD` and `FULL_PAD` already are in My trips.
- **Suggested command:** $impeccable optimize

**[P2-5] Old share-panel and note rules still apply under 70-mytrips.css**
- **Location:**
  - `23-places-pages.css:2633-2643`: `.tshare { margin: -6px 0 2px; border-top: none }`. 70 resets the border but not the margin.
  - `23-places-pages.css:2686-2692`: `.tshare-list { gap: 6px; border-top }`. The border leaks.
  - `69-v6-account.css:60-74`: `.tshare-ask { border: 1px solid var(--rule) }` (leaks) and `.tshare-ask button:focus-visible { outline: … var(--accent) }`.
  - `69-v6-account.css:421`: `.saved-shell { --bg-card: var(--paper-dim) }`. It is countered by `70-mytrips.css:11` only because the lazy stylesheet loads later.
  - `.modnote` in `23-places-pages.css` (legacy tokens, 13.5 px and 12.5 px literals, `--accent` focus) for the moderation note shown on Trips.
- **Category:** Theming / Implementation Integrity
- **Impact:**
  - The share panel draws partly from rules written for the old attached-under-the-card look: a -6 px pull-up, an extra hairline over the link list, and a bordered sunken confirm.
  - Load order, not specificity, decides the card ground.
  - The first-paint stylesheet still carries 12 `.tshare`, 127 `.pasttrip` and 7 `.savedmap-full` selectors.
  - Found by reading the code. The share panel could not be rendered under `?savedmock`.
- **Recommendation:** Delete the `.tshare*` rules in 23 and 69 and the `--bg-card` line in 69:421 in the commit that owns them; move `.savedmap-full`, `.undo-toast` and `.modnote` into 70 or onto the kit dialog and toast.
- **Suggested command:** $impeccable distill

**[P2-6] My trips and its cards still navigate with buttons and have no URL** (carried over, before P2-1 and P2-2)
- **Location:**
  - `SavedTripsPanel.jsx:492` (`onOpen: () => onLoadTripPlan?.(p.id)`).
  - `MyTripsTabs.jsx:135-142` (kit Card with `onOpen`, which renders a `<button>`).
  - `App.jsx` (`toggleSaved`, no history entry).
- **Category:** Implementation Integrity
- **Impact:** Back on a phone does not return to My trips, a trip cannot be opened in a new tab, and My trips cannot be linked or restored on reload. Carta-design "Navigation" asks for `<a href>`. The kit Card already takes `href`.
- **Recommendation:** An owner call (the before audit filed it as `$impeccable shape`). Give My trips a `tabHref` URL with the tab as a parameter, and pass `href` to the cards.
- **Suggested command:** $impeccable shape

**[P2-7] The past-trip form was not migrated with the page** (not re-measured)
- **Location:** `auth/PastTripForm.jsx` (20 raw `<button>` by the meter) and `17-saved-trips.css` (127 `.pasttrip` selectors in first-paint CSS).
- **Category:** Accessibility / Responsive
- **Impact:** "Add a past trip" on the Visited tab opens a form that the before audit found with unlabelled fields, two date pickers both named "Pick a date", 22 to 35 px controls on touch and a filled rating chip (before P1-5, P1-7 and P2-9). It is outside this audit's file list and was not opened, so these are presumed open, not re-measured.
- **Recommendation:** Rebuild the form on `Field`, `ChipGroup` and `Segmented` as the rest of the page now is.
- **Suggested command:** $impeccable harden

### P3 Polish

**[P3-1]** The share panel cannot be verified under `?savedmock`.
- `SavedTripsPanel.jsx:431` renders it only with `user`, but `toggleShare` lets the mock through. So Invite reports `aria-expanded="true"` over nothing, and no harness can see the panel.
- Give the seam a mock user and stub `fetchTripShares` and `listTripCoplanners`, so the share panel's 44 px and fit-at-390 claims can be measured.
- ($impeccable harden)

**[P3-2]** The kit's compact Segmented is 30 px on a fine pointer, under the 32 px compact floor.
- Measured: Shortlist "Newest" 70x30 and "Cheapest" 81x30 at 1440.
- Source: `components/ui` CSS `04-ui.css:130`. A kit fix, not a T434 one.
- ($impeccable polish)

**[P3-3]** Dead strings.
- `saved.costNational` is still in all six i18n files with no caller.
- `SavedTripsPanel.jsx:672-676` builds the Ctrl and Cmd cooperative-gesture strings for a map that no longer uses them.
- ($impeccable distill)

**[P3-4]** px literals and a layer outside the scale in `70-mytrips.css`.
- `gap: 6px` at 30, 123, 154, 205, 294 and 361 (off the 4 px grid).
- `z-index: 55` at 403 (between `--z-sheet` and `--z-modal`).
- `max-width: 1180px` at 409.
- `.mt-loading` (403), the Suspense fallback in `App.jsx:1508`, is defined only in the lazy chunk's CSS, so the fallback paints unstyled while that chunk loads. Move the one rule to the first-paint sheet, or use `TabFallback` as Guides does.
- ($impeccable polish)

**[P3-5]** Small render and storage costs remain.
- `memories` (`SavedTripsPanel.jsx:309-316`) re-parses every finished trip's extras whenever `pastPlans` changes. Because `shownPlans` filters on `heldKey`, that includes every Undo hold and its expiry, even for a shortlist star.
- On Visited, the same chain renews `visitedItems`, so the map re-pins when an Undo toast for something that is not on the map comes or goes.
- Key `memories` on the plan ids rather than the filtered arrays.
- ($impeccable optimize)

## Patterns and Systemic Issues

- **The kit closed most of the before list in one move.** Moving to `TileGroup`, `Card`, `Chip`, `Segmented`, `IconButton`, `Field` and `Money` closed the tablist, touch-size, type-size, selection-mark and money findings together. The issues left sit where the kit was not used (PastTripForm), where the kit itself is short (Segmented sm on a fine pointer, Card's fixed `h3`) and in TripMap's pins.
- **Leftover rules from earlier files.** The rebuild deleted about 1,580 lines from the old stylesheets but left the `.tshare`, `.modnote`, `.savedmap-full` and `.undo-toast` families and the `--bg-card` override behind. Where 70 does not restate a property, the old value still applies.
- **The test seam lags the account-only parts.** `?savedmock` fakes the data but not the user, so the share panel, co-planning and publishing (the account-only half of the page) cannot be checked in a browser.

## Positive Findings

- **Tabs.** Measured at all three widths: `aria-controls`, `role="tabpanel"`, roving tabindex, and arrows, Home and End with selection following focus.
- **Overlays.** Every overlay on the surface keeps the dialog contract. Measured on the countries sheet and the full-size map; read from code for Guides:
  - `role="dialog"`, `aria-modal`, a name;
  - focus moves in, and Tab and Shift+Tab stay inside;
  - Escape closes only the overlay;
  - focus returns to the control that opened it ("Edit", "Open the map").
- **The page behind is `inert`.** The 36-stop keyboard walk never entered Explore.
- **Visible focus.** A 2 px `--focus` ring on every stop; the kit Card draws its ring on the whole card.
- **Type.** No text under 11 px and no figure under 12 px at any width (before: 10 and 10.5 px tab text and 10 px flag names).
- **Touch.** Every control is 44 px or more on touch at 390 and 820 (before: rail tabs at 36 px, an empty-state button at 33 px and form controls at 22 to 35 px).
- **Layout.** No sideways scroll at 390, 820 or 1440, inside or outside the panel. Before, the document was 587 to 1636 px wide because of the Explore layer.
- **The record map** keeps its pins and camera through panel state changes, opens full size on a tap on a phone, and never asks for Ctrl.
- **Money.** It reads "~€1,343 est. for 2" through `<Money est>`. The shortlist prints the same figure Explore prints.
- **Bundle.** The panel and its stylesheet are a lazy chunk (81 KB JS and 13 KB CSS raw); first-paint JS is 92 KB smaller and first-paint CSS 29 KB smaller.
- **Undo, not confirm.** Removals are held six seconds behind one toast in the shell's bottom slot. Undo takes focus only when the removal took focus with it (`parts.jsx:111-114`).
- **Shared-trip privacy.** The share panel says once what a link never carries. Publishing and withdrawing a link ask inline with the safe answer focused, and Escape keeps (`TripSharePanel.jsx:47-65`).

## Recommended Actions

1. **[P1] `$impeccable harden`**: make a failed past-trip save visible and keep the form open (P1-1). Close the card menu on focus leaving it (P2-1). Add `h2`s for the focal card and the shortlist (P2-2). Give `?savedmock` a mock user so the share panel can be measured (P3-1). Rebuild PastTripForm on the kit (P2-7).
2. **[P2] `$impeccable adapt`**: 44 px hit boxes for TripMap pins (P2-3).
3. **[P2] `$impeccable optimize`**: hoist Guides' `fitPadding` (P2-4); key `memories` on plan ids (P3-5).
4. **[P2] `$impeccable distill`**: delete the leftover `.tshare*`, `.modnote` and `--bg-card` rules in 23 and 69; move `.savedmap-full` and `.undo-toast`; drop the dead strings (P2-5, P3-3).
5. **[P2] `$impeccable shape`**: owner call on URLs for My trips and its cards (P2-6).
6. **`$impeccable polish`**: the 30 px kit segment, the px gaps, `z-index: 55` and the unstyled lazy fallback (P3-2, P3-4).

You can ask me to run these one at a time, all at once, or in any order you prefer.

Re-run `$impeccable audit` after fixes to see your score improve.
