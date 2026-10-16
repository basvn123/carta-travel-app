# T434 critique, Assessment B (after): detector and browser evidence

Surface: the rebuilt My trips. `continent-app/src/auth/SavedTripsPanel.jsx`, `src/auth/mytrips/{MyTripsTabs,TripCards,parts}.jsx`, `src/auth/TripSharePanel.jsx`, `src/community/GuidesPanel.jsx`, `src/styles/70-mytrips.css`, `src/lib/myTrips.js`.

Run 2026-10-16, about 20:10 to 20:45, on branch `p11-my-trips` (root `434a700ea`, app `05c36df`, T434 work uncommitted in the app tree). Evidence only, no design opinion. Read-only: no source was edited.

**Concurrency caveat.** Another session was still editing and rebuilding while this ran. The target sources changed at 20:26 (after my first read) and `dist/` was rebuilt at 20:09, 20:24 and 20:28:57. The browser pass ran against the 20:28:57 build. The eight target files have not changed since 20:26 (checked by byte comparison with a 20:30 snapshot), so the build and the line numbers below describe the same code. The preview on port 4191 answered 404 for every path: it was started before a rebuild and its file index was stale. It belongs to the other session, so I left it running and served `dist/` from my own preview on port 4377. I stopped that preview afterwards.

## 1. Impeccable detector CLI (static)

Command, from the repo root: `impeccable.cmd detect --json <file>`. Every file was run a second time with `--no-config`.

| File | Lines | Findings | With `--no-config` |
|---|---|---|---|
| auth/SavedTripsPanel.jsx | 921 | 0 (`[]`) | 0 |
| auth/mytrips/MyTripsTabs.jsx | 348 | 0 | 0 |
| auth/mytrips/TripCards.jsx | 163 | 0 | 0 |
| auth/mytrips/parts.jsx | 245 | 0 | 0 |
| auth/TripSharePanel.jsx | 429 | 0 | 0 |
| community/GuidesPanel.jsx | 343 | 0 | 0 |
| styles/70-mytrips.css | 457 | 0 | 0 |
| lib/myTrips.js | 193 | 0 | 0 |

**The detector works in this environment.** The before audit recorded that a deliberately bad control file also returned `[]`. That does not reproduce now:

- A control CSS file in the scratchpad (`#000`, 9 px, a gradient, `transition: all`, a 4 px coloured left border) returned 1 finding (`side-tab`) with exit code 2.
- A control HTML file returned `gray-on-color`, `low-contrast`, `undersized-ui-text` and more.

So the zeros above are a real result, but a weak one. The static CSS rules match little (the control CSS's 9 px and gradient went unflagged), and the JSX carries class names rather than styles. The browser pass in section 4 carries the weight.

## 2. Project lint meter (`scripts/ci/design-lint.mjs --meter`, read-only)

Run from `continent-app/`. `--update-baseline` was not run. The meter lists only files that have a hit. I checked that its file walk covers `src/auth/mytrips/` and `70-mytrips.css` (it walks every `.css`, `.js`, `.jsx` and `.mjs` under `src/`), so a zero row is a real zero, not an empty filter.

| Meter | raw-button | font-size | radius | legacy-token | money | Before |
|---|---|---|---|---|---|---|
| `SavedTrips` (SavedTripsPanel.jsx) | 0 | 0 | 0 | 0 | 0 | 24 raw buttons |
| `auth/mytrips` (3 new files) | 0 | 0 | 0 | 0 | 0 | new |
| `TripSharePanel` | 0 | 0 | 0 | 0 | 0 | 12 raw buttons |
| `GuidesPanel` | 0 | 0 | 0 | 0 | 0 | 8 raw buttons |
| `70-mytrips` (70-mytrips.css) | 0 | 0 | 0 | 0 | 0 | new |

Context from wider meters, which were not asked for:

- `auth/` falls from 125 raw buttons to 89. The rest are outside the target, led by AccountPanel (30) and PastTripForm (20), which still renders on the Visited tab.
- `17-saved` falls from 125 font-size, 72 radius and 366 legacy-token hits to 86, 42 and 235. It still holds the past-trip form and the full-size map rules.
- The full lint, `design-lint.mjs` with no flags, reports 8,125 violations, all in the baseline, 0 new.

Every `var(--…)` that 70-mytrips.css reads is defined in `01-tokens.css`.

## 3. Static notes on 70-mytrips.css and the files around it

- **No hex, gradient, literal font size, literal radius or legacy token.** The meter confirms this.
- **px literals that are not type or radius:**
  - `gap: 6px` at lines 30, 123, 154, 205, 294 and 361. Six is off the 4 px grid.
  - `gap: 2px` at 136 and 342.
  - `z-index: 55` at 403 (`.mt-loading`). This is a layer outside the `--z-*` scale.
  - `max-width: 1180px` at 409.
  - `min-height: 32px` on `.mt-flag` at 295. That is a non-interactive `<li>`, so it is fine.
- **Reduced motion:** the one transition (`.mt-bar > span`, 167) has its `prefers-reduced-motion` branch at 455 to 457.
- **`.mytrips { --bg-card: var(--surface) }` (line 11)** counters the old `69-v6-account.css:421` rule (`.saved-shell { --bg-card: var(--paper-dim) }`). That rule is still present. Both selectors have specificity (0,1,0), so 70 wins only because the lazy chunk's stylesheet loads after the main one.
- **Rules for this surface still in other files.** Selector counts:

  | Selector | Files |
  |---|---|
  | `.tshare` | 23-places-pages.css: 6; 25-feature-pages.css: 1; 69-v6-account.css: 5 |
  | `.saved-trips-panel` | 17-saved-trips.css: 7; 23-places-pages.css: 2; 25-feature-pages.css: 3; 69-v6-account.css: 1 |
  | `.savedmap-full` | 17-saved-trips.css: 7 |
  | `.undo-toast` | 69-v6-account.css: 5 |
  | `.gld-` | 25-feature-pages.css: 60; 69-v6-account.css: 9 |
  | `.modnote` | 23-places-pages.css |

  Read against 70, some old properties still apply because 70 never resets them:
  - `23-places-pages.css:2633` `.tshare { margin: -6px 0 2px }`
  - `23-places-pages.css:2686` `.tshare-list { gap: 6px; border-top }`
  - `69-v6-account.css:60` `.tshare-ask { border: 1px solid var(--rule) }`
  - `69-v6-account.css:74` `.tshare-ask button:focus-visible { outline-color: var(--accent) }`

  I could not render the share panel (see section 4), so these leaks come from reading the code, not from a measurement.
- **Dead strings:**
  - `saved.costNational` ("national"), which T438 retired, is still in all six i18n files (`en.js:1236` and the others) with no caller.
  - `SavedTripsPanel.jsx:672-676` still builds the Ctrl and Cmd cooperative-gesture strings. The record map no longer turns cooperative gestures on, so they are never shown.

## 4. Browser evidence (http://127.0.0.1:4377/?savedmock, dist built 20:28:57)

**Setup.**

- Scripts: `mytrips-after.mjs` and `mytrips-after2.mjs` in the scratchpad.
- Viewports:
  - 390x844 with `isMobile` and `hasTouch` (`pointer: coarse` matched).
  - 1440x900 (fine pointer).
  - 820x1180 with `hasTouch` (`pointer: coarse` matched).
- Each run opens `/?savedmock`, clicks "Continue without an account" if it shows, opens the visible "My trips" nav item, then walks role=tab "Trips", "Shortlist" and "Visited".
- Every measurement is scoped to `.mytrips`. Explore stays mounted behind it and is ignored.
- The tabs rendered as "Trips 2", "Shortlist 3" and "Visited 3".

**Live detector.**

- Started with `live-server --background` (port 8400, health ok; the process started 20:23:49 from this session).
- `detect.js` was added as a script tag, followed by a 3-second wait, the console lines and `impeccableDetectAsync()`. Each later tab got a rescan.
- Stopped with `live-server stop --keep-inject`.
- Nothing was injected into any HTML file: `continent-app/index.html` has no `8400`, `live.js` or `detect.js` string.
- The empty `continent-app/.impeccable/live/` folder the server made (created 20:23, 0 files) was removed. `continent-app/.impeccable/critique` and `surfaces` were already there and were left alone.

### Detector totals

| Viewport | Tab | Console "N anti-patterns" | Structured groups | Inside `.mytrips` | Outside |
|---|---|---|---|---|---|
| 390 | Trips | 15 | 15 | 0 | 15 |
| 390 | Shortlist | 28 | 48 | 10 | 38 |
| 390 | Visited | 10 | 17 | 1 | 16 |
| 1440 | Trips | 51 | 51 | 2 | 49 |
| 1440 | Shortlist | 79 | 151 | 10 | 141 |
| 1440 | Visited | 33 | 57 | 1 | 56 |
| 820 | Trips | 48 | 48 | 2 | 46 |
| 820 | Shortlist | 69 | 120 | 10 | 110 |
| 820 | Visited | 50 | 86 | 4 | 82 |

Before, the phone tabs had 3, 3 and 9 groups inside the shell. They held the real `undersized-ui-text` findings: tab labels at 10.5 px and flag names at 10 px.

### Findings that concern My trips

| Rule | Where | Verdict |
|---|---|---|
| skipped-heading | `<h1> "My trips"` followed by `<h3> "Portugal"` (Trips) and by `<h3> "Bruges"` (Shortlist), at every viewport. The detector pins it on `body`. | **True positive.** The focal card's title is an `h3` with no `h2` above it (`TripCards.jsx:81`). On Shortlist the kit Card rows put an `h3` straight under the `h1` (`MyTripsTabs.jsx:134-152`, `Card.jsx` renders `h3.card-title`). Visited is in order (h1, h2, h3). |
| text-occlusion | Card meta and price spans ("Belgium", "~€100", "est.", "a day", "In 75 days, Wed 30 Dec…", "Not priced yet", "Munich, Wed 7 Oct…") "100% covered by `button.card-open`" | **False positive.** The kit Card stretches its title button over the card with `::after` (one hit target per card), and the overlay is transparent. Every in-shell occlusion names `button.card-open` as the cover. |
| tiny-text | `div.maplibregl-ctrl-attrib-inner`, 11 px | Third-party MapLibre attribution, on Visited only. It meets the 11 px floor. |

`undersized-ui-text` no longer fires inside My trips at any viewport.

### Findings outside My trips (out of scope)

| Rule | Count per tab | What it is |
|---|---|---|
| text-occlusion | 9 to 134 | Explore text covered by My trips elements (`h1.saved-title`, `span.ui-tile-label`, `span.mt-filter-label`, `h3.mt-year-title` and others). This is the kept-alive Explore layer behind the page, which is `inert` (below). |
| edge-flush-cards | 3 or 4 | Explore `xrails-strip` cards |
| clipped-overflow-container | 2 | `#root`, `div.app` |
| text-overflow | 1 (820 only) | `span.gsearch-placeholder` overflows by 143 px. This is the header search pill at 820, which is app chrome and not this surface. |
| dark-glow | 1 | A zero-offset `#ffba00` glow on `body`. Probably the detector's own amber overlay picked up by the rescan, which is the same pattern as the before run. Not verified. |

### In-page facts (my measurements)

**Controls under 44x44 on touch** (390 and 820, coarse pointer; a kit Card is measured as the card):

| Tab | Under 44 |
|---|---|
| Trips | none (11 controls) |
| Shortlist | none (12 controls) |
| Visited | only map items |

- The Visited map items are three pins (`div.trip-pin`, 24x30), the MapLibre attribution toggle (24x24) and the attribution links (13 px tall).
- In the page flow on a coarse pointer, the pins sit under `.mt-map-shield`: a 356x285 transparent div at 390, `aria-hidden`, which opens the full-size map on a tap. So they are not touch targets in place.
- **In the full-size map dialog at 390** the pins are focusable `role="button"` with labels ("Munich", "Bruges", "Salzburg") and a 24x30 hit box. That is under the 44 px floor.
- In that dialog the zoom buttons are 44x44 and "Close the map" is 135x44.

Before, the phone rail tabs on a tablet were 181x36, the empty-state button was 126x33 and many form and share controls were 22 to 35 px.

**Controls on a fine pointer (1440)**, where the floor is 32 px for compact controls:

- At or above 32: year chips and the `btn-sm` controls "Edit", "Add a past trip" and "See them in Friends" (all 32 px), and "Read the statement" (34 px).
- Under 32:
  - The Shortlist sort Segmented: "Newest" 70x30 and "Cheapest" 81x30. The cause is the kit's `04-ui.css:130` `.seg-sm .seg-item { min-height: 30px }`.
  - The map pins (24x30), the MapLibre zoom buttons (29x29) and the attribution items.

**Text under 11 px:** none, on any tab at any viewport.

**Figures under 12 px:** none.

**Off-scale sizes rendered:**

| Size | Element | Owner |
|---|---|---|
| 11.9 px | "est." on Shortlist | Explore's `DayPrice` |
| 13.6 px | "est." on the focal card | |
| 12.5 px | "Read the statement" (`.gld-copy.modnote-toggle`) | ModerationNotice's legacy CSS |
| 11 px | pin labels and MapLibre attribution | |

**Contrast:** no text pair under 4.5:1 inside `.mytrips` at any viewport, measured from computed colours against the composited background.

**Horizontal overflow:**

| Viewport | `.saved-trips-panel` | `documentElement` |
|---|---|---|
| 390 | 390 / 390 | 390 / 390 |
| 820 | 604 / 604 | 820 / 820 |
| 1440 | 1176 / 1176 | 1440 / 1440 |

No element inside `.mytrips` passes the right edge (the sideways-scrolling chip rows and the map are excluded). Before, `documentElement` measured 587 to 1636 because of the Explore layer. It is now clean.

**One h1** ("My trips") on every tab at every width.

**Tabs and their panel:**

- Two `role="tablist"` groups are in the DOM, labelled "My trips". Only one is visible at a time: the side panel from 769 px, the top tiles below that.
- Every tab has `aria-controls="mytrips-panel"`, `aria-selected` and a roving `tabindex` (0 on the selected tab, -1 on the others).
- `#mytrips-panel` is `role="tabpanel"` with `aria-label` set to the current tab name. It has no `aria-labelledby`, and the tabs have no ids.
- Keys, starting from the selected tab:

  | Key | Focus and selection | Panel label |
  |---|---|---|
  | ArrowRight | Shortlist | Shortlist |
  | ArrowRight | Visited | Visited |
  | Home | Trips | Trips |
  | End | Visited | Visited |
  | ArrowLeft | Shortlist | Shortlist |

  Selection follows focus, and the results are the same at 390, 820 and 1440. Before: no `aria-controls`, no tabpanel, all three tabs were Tab stops, and the arrow keys did nothing.

**Focus order and visible focus** (36 Tab presses from the `h1`, Trips tab):

- Phone: Trips tab, More actions, Open trip, Plan days, Invite, Read the statement, Slovenia (row), More actions, See them in Friends, then out to the page chrome (brand, Get a pass, the bottom nav), then back to the Trips tab.
- At 820 and 1440 the side tablist comes before the `h1` in DOM order, so the walk from the `h1` reaches it after the header chrome. The order is logical.
- Every stop shows a 2 px solid `rgb(140, 90, 43)` (`--focus`) ring.
- The kit Card's title button draws its ring on the card. The button's own outline is transparent, and the card shows a 2 px `--focus` outline.
- **The Explore layer behind is inert:** 0 focusable elements outside `.mytrips` apart from the header and nav, and one `[inert]` wrapper. Before, this was only checked visually.

**The countries sheet** (button "Edit" on Visited, opened with Enter):

- It is a `role="dialog"`, `aria-modal="true"`, `aria-labelledby="mt-countries-title"`. Focus lands on "Close".
- Shift+Tab six times stays inside: Done, United Kingdom, Switzerland, Sweden, Spain, Slovenia.
- Escape closes it and focus returns to "Edit", with My trips still open.
- It holds 44 country chips, 3 of them disabled: the countries already recorded from a trip, `aria-pressed="true"`.
- The chips are 44 px tall on a coarse pointer and 32 px on a fine one.
- A disabled chip's explanation sits in a `title` ("On your record from a trip"). Keyboard and touch cannot reach it.

**The card menu** ("More actions" on the focal card):

- Enter opens it, sets `aria-expanded="true"` and focuses the first menu item.
- The focal card's menu has one item, "Remove Portugal" (212x44, `--danger`), so ArrowDown, End and Home stay on it.
- Escape closes it, focus returns to "More actions" and My trips stays open.
- **Tab leaves the menu and the menu stays open.** After Tab, focus is on "Open trip" with the menu still mounted and `aria-expanded` still true. After a second Tab it is still open. It closes on an outside `pointerdown` only.
- The results are the same at 390, 820 and 1440. This is the same as before (P2-7).

**The share panel** (focal card "Invite"):

- The click set `aria-expanded="true"` on Invite, but no panel rendered.
- `SavedTripsPanel.jsx:431` draws `TripSharePanel` only when `user` is set, and `?savedmock` has no user, while `toggleShare` lets the mock through.
- In production a signed-out tap opens sign-in instead, so this is a seam gap rather than a user-facing bug. It means the share panel cannot be exercised in a browser here.
- Static reading of what it uses:
  - The kit `Button size="sm"`: 32 px on a fine pointer, `--tap` on a coarse one (`03-button.css:61-63`).
  - The kit `Segmented size="sm"`: 30 px fine, `--tap` coarse (`04-ui.css:130-132`).
  - `IconButton` (always 44) and `Field`.
  - So on a touch device every share control should be 44 px. The option labels are short ("Only me", "My friends", "Anyone"; "7 days", "30 days", "No end date"; in German "Ohne Enddatum" is the longest), so the Segmented rows should fit inside the panel at 390. **Both are estimates, not measurements.**

**Does the record map re-render on a tab tap?**

Each pin was tagged with a data attribute, then I checked whether the same nodes survived each action:

| Action | Pins |
|---|---|
| Tap the already selected Visited tab | Kept (`orig0`, `orig1`, `orig2`) |
| Open a record row's "More actions" menu (a panel state change) | Kept |
| Pick a year chip (the record changes) | Replaced, as expected |
| Leave the tab and come back | Replaced, because the tab remounts its map |

Before, one tap on a card replaced every pin and re-ran `fitBounds`. The memoised `mapProps` (`SavedTripsPanel.jsx:680-694`) holds.

**The full-size map** (Enter on "Open the map"):

- It is a `role="dialog"`, `aria-modal`, labelled "Where you have been". Focus lands on the map canvas.
- Tab cycles inside: the three pins, zoom in and out, attribution, the two links.
- Escape closes it, focus returns to "Open the map" and My trips stays open.
- No cooperative-gesture screen at either width. At 1440 a mouse wheel over the map zooms with no "Hold ctrl" prompt. Before, it asked for Ctrl.

**Images:**

- The focal photo (`.mt-hero-media`, `aria-hidden`, opens on pointer only; the keyboard uses "Open trip") loads eager with `sizes="(min-width: 1024px) 440px, 100vw"`. It renders 356 px wide at 390 and 466 px wide at 1440.
- Row thumbnails render at 72 px with `sizes="72px"` and lazy loading. Before, every card fetched 360 to 500 px files for 44 px thumbnails.

**Page errors:** none at any viewport.

### Code splitting (dist built 20:28:57)

| Asset | Raw bytes | gzip |
|---|---|---|
| `index-BnN0nC8Z.js` (first paint) | 729,616 | 226,441 |
| `index-DtvGxpDv.css` (first paint) | 881,547 | 140,176 |
| `SavedTripsPanel-ih3yGAyB.js` (lazy) | 81,280 | 24,055 |
| `SavedTripsPanel-C7m8ZJQV.css` (lazy) | 13,221 | 2,814 |
| `GuidesPanel-CiQkt_yM.js` (lazy) | 11,986 | n/a |

- Before, the first-paint JS was 821,487 bytes (253,476 gzip) and the CSS 910,432 (144,110 gzip). That is 91,871 bytes less JS (27,035 gzip) and 28,885 bytes less CSS (3,934 gzip) on first paint, measured across the whole working tree.
- `mt-hero`, `tshare-block`, `pasttrip` and `coplan-ask` appear only in the SavedTripsPanel chunk, not in the main JS. `App.jsx:105` imports the panel lazily.
- The first-paint CSS still carries 127 `.pasttrip` selectors, 12 `.tshare`, 13 `.saved-trips-panel`, 7 `.savedmap-full`, 5 `.undo-toast` and 74 `.gld-`. All of them come from the old stylesheets.
- `.mt-loading`, the Suspense fallback in `App.jsx:1508`, is styled only in the lazy chunk's CSS. The fallback therefore renders unstyled while that chunk loads.

### Screenshots and raw data

All are in `C:\Users\GEBRUI~1\AppData\Local\Temp\claude\c--Users-Gebruiker-Documents-Portfolio-Travel-App\12c06964-b051-4c2a-9f63-fcc26a335957\scratchpad\out-after\`:

- `after-{390,820,1440}-{trips,shortlist,visited}.png`
- `after-{390,820,1440}-countries-sheet.png`
- `after-{390,1440}-map-full.png`
- JSON: `after-results-390.json`, `after-results-820.json`, `after-results-1440.json` and `after-results-probe2.json`

## Skipped or limited

- **The share panel was not rendered.** It needs a signed-in user, and `?savedmock` has none. Its sizes come from reading the kit CSS.
- **The past-trip form, the memory view and Guides were not opened.** Guides needs published guides from Supabase. PastTripForm and TripMemoryView are outside this target list, and the meter still counts 20 raw buttons in PastTripForm.
- **Contrast is mine, not the detector's.** I computed WCAG ratios from computed colours.
- **The accessibility tree** was not dumped. Focus, roles and ARIA were read from the DOM.
