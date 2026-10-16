# T434 critique, Assessment B (before): detector and browser evidence

Surface: My trips. `continent-app/src/auth/SavedTripsPanel.jsx` and what it renders in `src/auth/` (PastTripForm, TripMemoryView, TripSharePanel, InstallHint, FriendTripPanel, ModerationNotice) plus `src/community/GuidesPanel.jsx`. CSS: `src/styles/17-saved-trips.css` (lines 1-620 and 1338-1830) and `src/styles/69-v6-account.css`.

Run 2026-10-16, about 18:15 to 18:50, against branch `p11-my-trips` at `434a700ea`. Evidence only, no design opinion.

**Concurrency caveat.** Another session was editing the app while this ran. When it started, the app repo showed only `tripPlanStorage.js` and `useAccountSync.js` modified. When it finished, it also showed `App.jsx` and `TripSharePanel.jsx` modified (TripSharePanel: 865 lines changed) and a new `src/auth/mytrips/` folder. Steps 1 to 3 ran before TripSharePanel changed, so they describe HEAD. The browser pass (step 4) ran against the dev server while those edits were landing, so it may include some of them. `SavedTripsPanel.jsx` stayed unmodified the whole time.

## 1. Impeccable detector CLI (static)

Command, run from the repo root: `impeccable.cmd detect --json <file>`. I also ran every file a second time with `--no-config`, which ignores the project config and inline ignores. Neither the target files nor the CSS contain any `impeccable-disable` comments.

| File | Exit | Findings | With `--no-config` |
|---|---|---|---|
| auth/SavedTripsPanel.jsx | 0 | 0 (`[]`) | 0 |
| auth/PastTripForm.jsx | 0 | 0 | 0 |
| auth/TripMemoryView.jsx | 0 | 0 | 0 |
| auth/TripSharePanel.jsx (HEAD) | 0 | 0 | 0 |
| auth/InstallHint.jsx | 0 | 0 | 0 |
| auth/FriendTripPanel.jsx | 0 | 0 | 0 |
| auth/ModerationNotice.jsx | 0 | 0 | 0 |
| community/GuidesPanel.jsx | 0 | 0 | 0 |
| styles/17-saved-trips.css | 0 | 0 | 0 |
| styles/69-v6-account.css | 0 | 0 | 0 |

The CLI accepts CSS files and reports them clean. Read this static pass as weak evidence. The JSX carries class names, not styles, so the static rules have almost nothing to match. The browser pass in section 4 is where the detector finds things.

## 2. Project lint meter (`scripts/ci/design-lint.mjs --meter`, read-only)

Run from `continent-app/`. `--update-baseline` was not run.

| Meter | raw-button | font-size | radius | legacy-token | money |
|---|---|---|---|---|---|
| `SavedTrips` (SavedTripsPanel.jsx) | 24 | 0 | 0 | 0 | 0 |
| `auth/` (all 15 files listed) | 125 | 0 | 0 | 0 | 0 |
| `community/` | 19 | 0 | 0 | 0 | 0 |
| `17-saved` (17-saved-trips.css, whole file) | 0 | 125 | 72 | 366 | 0 |
| `69-v6` (69-v6-account.css) | 0 | 26 | 14 | 86 | 0 |

Raw `<button>` counts for the target files:

| File | Raw buttons |
|---|---|
| SavedTripsPanel | 24 |
| PastTripForm | 20 |
| TripSharePanel | 12 |
| ModerationNotice | 4 |
| InstallHint | 1 |
| TripMemoryView | 1 |
| FriendTripPanel | 0 (not listed by the meter) |
| GuidesPanel | 8 |
| **Target total** | **70** |

Files in the `auth/` meter that are outside the target: AccountPanel 30, FriendsSpoke 13, AuthModal 7, AuthGate 4, ResetPasswordScreen 3, SharedTripView 3, and one each in FriendBadges, GoogleButton and PasswordField.

The CSS meter counts whole files. The `17-saved` totals include the planner extras and expense rules (about lines 200-450) and everything from line 620 to the end, which are not all My trips.

## 3. Static evidence by grep

### CSS in scope (17-saved-trips.css lines 1-620 and 1338-1830; 69-v6-account.css whole file)

I parsed the CSS with postcss and skipped rules inside reduced-motion blocks. The script is `css-scan.mjs` in the scratchpad.

- **Raw hex or rgba colours: 1.** `17:95 .country-flag { box-shadow: 0 0 0 1px rgba(31, 42, 51, 0.12) }`. 69-v6 has none.
- **Gradients: 0.**
- **Border and box-shadow on the same rule: 2.**
  - `17:125 .saved-card-pop { border: 1px solid var(--rule); box-shadow: var(--shadow-2) }`
  - `69:393 .undo-toast { border: 1px solid var(--rule); box-shadow: var(--shadow-2) }`
  - Both are floating layers (a pop-over menu and a toast), so they may be intended.
- **Font size under 11px: 8, all in 17-saved-trips.css.**
  - On the My trips surface: `608 .saved-tabs button small { font-size: 10px }`. This is the tab count badge, and the browser confirms it renders at 10px on the phone (section 4).
  - Planner rules that sit inside the requested range but render in `planner/TripExtras.jsx`, `ExpenseLedger.jsx` and `TripItinerary.jsx`, not on My trips: `229 .extras-count 10.5px`, `280 .extras-inbox-count 10.5px`, `326 .itin-day-extra small 10px`, `339 .extras-est 10.5px`, `412 .exp-row-main small 10.5px`, `422 .exp-sharers-lbl 10.5px`, `444 .exp-rate-note 10px`.
- **Font size from 11px up to 12px: 12.**
  - 17-saved-trips.css: `30 .saved-section-count 11px` and `1599 .uptrip-crew-dot var(--text-micro)` (11px) are on My trips. The planner rules are 217, 273, 288, 300, 306, 323, 372 and 426, at 11px or 11.5px.
  - 69-v6-account.css: `56 .saved-cat small …` (11px, the tab counts) is on My trips. `657 .adminpage-sparkfig` (11.5px) belongs to the admin page.
- **Font sizes outside the ranges but on My trips** (the browser found them):
  - `17:675 .ledger2-flagname { font-size: 10px }`, the country names in the Visited ledger.
  - `17:665 .ledger2-cap 11px`
  - `17:689 .ledger2-cities 11.5px`
  - `25-feature-pages.css:180` (phone media block) `.saved-cat { font-size: 10.5px }`, the phone tab labels.
  - 25-feature-pages.css also has raw `rgba(255,255,255,0.7)` and `rgba(255,255,255,0.22)` on `.saved-cat.on` at lines 219-220.
- **Literal font sizes in range:** most are px literals, not `--text-*` tokens. Counts:

  | Size | Rules |
  |---|---|
  | 12px | 19 |
  | 12.5px | 11 |
  | 13px | 10 |
  | 11px | 5 |
  | 10.5px | 5 |
  | 16px | 4 |
  | 11.5px | 4 |
  | 10px | 3 |
  | 21px, 19px, 17px, 15px and 14px | 1 each |
  | `var(--text-micro)` | 1 |

  The token scale is 11, 12, 13, 14, 16, 20, 28 and 40. The 10.5, 11.5, 12.5, 15, 17, 19 and 21 values are off-scale.
- **Transitions:** 17 in 17-saved-trips.css and 4 in 69-v6-account.css. Every one has its selector repeated in a local `@media (prefers-reduced-motion: reduce)` block: 17:1330, 17:1838, 69:312 and 69:584. The global floor at `02-base.css:110` also zeroes every transition and animation. **Uncovered: 0.**
- **`transition: all`: 0.**
- **`text-transform: uppercase`: 0.**
- **Letter-spacing: 6.** All are small optical tracking on titles or a digit:
  - `17:20 .saved-section-title -0.01em`
  - `17:452 .saved-card-title -0.01em`
  - `17:1600 .uptrip-crew-dot 0.02em`
  - `17:1826 .saved-section.is-big .saved-section-title -0.015em`
  - `69:31 .saved-title -0.015em`
  - `69:264 .pass-price-eur -0.01em`

### Strings

I scanned 204 `saved.*` and `fav.*` keys in `src/i18n/en.js`, plus every key the eight target JSX files call through `t()`. That is 239 keys used, 311 checked in total. The prefixes used are `saved`, `share`, `moderation`, `guides`, `coplan`, `friends`, `install`, `state`, `map`, `fav`, `layer`, `account` and `a11y`. Every key exists in en.js. Two of them (`a11y.close` and `guides.publishCta`) use single quotes, so a grep for double-quoted keys alone misses them.

| Check | Hits |
|---|---|
| Em dash or en dash | 0 |
| Middot or bullet | 0 |
| Spaced hyphen used as a separator | 0 |
| Banned words (seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy, easily) | 0 |
| Exclamation marks | 0 |
| Ellipsis character | 4: `saved.loading` "Loading…", `saved.pastSaving` "Saving…", `saved.pastLooking` "Looking…", `account.pleaseWait` "Please wait…" |

The ellipses are progress strings. Whether they are allowed is a copy-rule call I am not making.

Hard-coded English in the JSX:

- **0 in rendered markup.** No literal text nodes or literal `aria-label`, `title`, `placeholder` or `alt` values.
- The only English literals are in the `?savedmock` fixture data in SavedTripsPanel.jsx (lines 81 and 89, such as "Alpine summer" and "Lisbon and Porto") and in code comments.
- No em dash, en dash or middot characters in any of the eight JSX files.

## 4. Browser evidence (http://localhost:4260/?savedmock)

Setup:

- Live server: started from the repo root (`live-server --background`, port 8400, health ok), then stopped with `stop --keep-inject`. Nothing was injected into any HTML file. The empty `continent-app/.impeccable/live/` folders it created were removed afterwards.
- Script: Playwright in the scratchpad (`mytrips-detect.mjs`, then `mytrips-detect2.mjs`). It opens the page, clicks "Continue without an account" when shown, then opens the visible "My trips" nav item.
- Clicks: Playwright's own clicks timed out on the second run, so the nav item and tabs were clicked through `element.click()` in the page.
- Tabs and viewports: Planned, Shortlist and Visited at 390x844 (`hasTouch` and `isMobile` on, coarse pointer) and at 1440x900. The tabs rendered as "Planned 2", "Shortlist 3" and "Visited 3".
- Detector: `detect.js` added as a script tag (it scans on its own), a 3-second wait, console lines collected, then `window.impeccableDetectAsync()` called for structured findings. Each finding's element was checked for whether it sits inside `.saved-shell`.

### Detector totals

| Viewport | Tab | Total groups (console) | Inside `.saved-shell` | Outside the shell |
|---|---|---|---|---|
| 390 | Planned | 22 (22) | 3 | 19 |
| 390 | Shortlist | 22 (14) | 3 | 19 |
| 390 | Visited | 37 (22) | 9 (1 is detector self-noise) | 28 |
| 1440 | Planned | 75 (75) | 0 | 75 |
| 1440 | Shortlist | 114 (63) | 0 | 114 |
| 1440 | Visited | 97 (94) | 8 (1 is detector self-noise) | 88 |

Console counts come from the first run and structured counts from the second, which is why some differ.

### Findings inside My trips (true positives about this surface)

| Rule | Where | Value | Viewports and tabs | CSS source |
|---|---|---|---|---|
| undersized-ui-text | phone tab labels "Planned", "Shortlist", "Visited" (`button.saved-tab.saved-cat > span`) | 10.5px | 390, all three tabs | `25-feature-pages.css:180` `.saved-cat { font-size: 10.5px }` |
| undersized-ui-text | Visited ledger country names (`span.ledger2-flagname`: "Austria", "Belgium", "Germany") | 10px | 390 and 1440, Visited | `17-saved-trips.css:675` |
| tiny-text | Visited ledger city list (`span.ledger2-cities`) | 11.5px | 390 and 1440, Visited | `17-saved-trips.css:689` |
| tiny-text | MapLibre attribution (`div.maplibregl-ctrl-attrib-inner`) | 11px | 390 and 1440, Visited | MapLibre default (third party) |
| clipped-overflow-container | `div.saved-map`, `div.trip-map.maplibregl-map` | n/a | 1440, Visited | Map containers clip on purpose |

Small text the detector did not flag, measured in the page:

- Phone tab count badges (`.saved-tabs button small`) render at 10px. The cause is `17-saved-trips.css:608`. Its specificity (0,1,2) beats `69-v6:50 .saved-cat small` (11px) and `25-feature-pages .saved-cat small` (`--text-micro`). The 11px rule only wins on `.seg-on`. The selected tab's badge also rendered at 10px on the phone, for example "small 2" on Shortlist.
- Desktop tab counts render at 11px.
- Other text at 11px: `.saved-section-count`, `.ledger2-cap` ("European countries", "Cities visited"), `.fledger-num` and `.fledger-num.is-soft` (the legend row, `--text-micro`).

### Findings outside My trips (out of scope, most likely false positives here)

Every other finding sits on elements outside `.saved-shell`. They belong to the Explore page, which stays mounted behind My trips (`xrails-*` rails, `.gsearch` search, the `.xbar` title, and the side-panel filters: Trip type, Budget a day, Month, Rating and Good to know).

| Rule | Count per tab | What it says |
|---|---|---|
| text-occlusion | 13 to 107 | Explore text is "100% covered" by My trips elements such as `h1.saved-title`, `button.saved-tab.saved-cat` and `aside.saved-side` |
| edge-flush-cards | 3 or 4 | Explore `xrails-strip` cards |
| clipped-overflow-container | 2 | `#root`, `div.app` |
| layout-transition | 1 | `transition: height` |
| dark-glow | 1 | |

One fact about the kept-alive Explore layer: `checkVisibility({checkOpacity, checkVisibilityCSS})` returns true for those elements. They are hidden by being covered, not by `display:none`, `visibility:hidden` or `inert`, as far as this check can tell. Whether they stay in the accessibility tree was not checked.

Detector self-noise: the Visited tab (both viewports) reports one `text-occlusion` on a span reading "undersized functional te…". That span is the detector's own overlay label from the first auto-scan, picked up by the second scan. Discard it.

### In-page facts (my measurements)

**Controls under 44x44:**

- 390 (coarse pointer):
  - Planned and Shortlist: none.
  - Visited: six items, all inside the map. Three map pins (`div.trip-pin`, 24x30, "Munich", "Salzburg", "Bruges"), the attribution toggle (24x24) and the two attribution links "CARTO" and "OpenStreetMap" (13px tall).
  - The coarse-pointer `--tap` rules (69-v6 around line 305, plus the V5 block) hold for every My trips control at 390.
- 1440 (fine pointer):
  - Every tab: the three side tabs `button.saved-tab.side-cat` are 217x36.
  - Planned: `button.modnote-toggle` "Read the statement" is 141x34.
  - Shortlist: `button.saved-empty-cta` "Browse the map" is 126x33.
  - Visited: `button.saved-map-expand` is 30x30, `button.saved-add-past` "Add a past trip" is 119x26, and three `button.uptrip-crew-add` "Add who came" are 28x28 each. The MapLibre zoom buttons are 29x29, and the pins and attribution links are as above.
  - The 69-v6 comment says a fine pointer keeps 32px rows on purpose. Even so, `saved-add-past` (26px) and `uptrip-crew-add` (28px) are under that 32px floor.

**Text under 11px:**

| Viewport | Tab | Elements |
|---|---|---|
| 390 | Planned, Shortlist | 5: three tab labels at 10.5px, two count badges at 10px |
| 390 | Visited | 8: those five plus three `ledger2-flagname` at 10px |
| 1440 | Planned, Shortlist | 0 |
| 1440 | Visited | 3 `ledger2-flagname` at 10px |

**Smallest text and its contrast** (WCAG, measured against the composited background):

| Text | Colour | Contrast |
|---|---|---|
| Phone tab labels and counts, unselected | `rgb(68,81,92)` | 7.02:1 |
| Phone tab label, selected | `rgb(116,72,32)` | 6.43:1 |
| `ledger2-flagname`, 10px | `rgb(68,81,92)` | 7.02:1 |
| Desktop tab counts, 11px | `rgb(31,42,51)` | 12.59:1 |

The only text below 4.5:1 is MapLibre's gesture hint ("Use two fingers to move the map" or "Hold ctrl and scroll to zoom the map"), at 3.24:1 and about 16.8px. It is MapLibre's own overlay, shown while the map waits for a gesture.

**Horizontal overflow:**

- `documentElement.scrollWidth` is larger than the viewport on every tab: 587 to 611 at 390, and 1629 to 1636 at 1440.
- `html` and `body` are both `overflow-x: hidden`.
- At 390, `scrollTo(9999)` leaves `scrollX` at 0. At 1440, on Shortlist and Visited, it reaches `scrollX` 196.
- The widest visible elements all belong to the Explore layer behind the page (`article.card.xtile` in an `xrails-strip`, right edge at 584 or 1529). None are in `.saved-shell`, which has no elements past the right edge.
- So the user cannot scroll sideways by swiping or with the wheel. A script call or a focus-scroll could still shift the page at 1440, and the cause is outside this surface.

### Screenshots

These are top-of-viewport shots taken after each scan, so they include the detector overlay. They are in `C:\Users\GEBRUI~1\AppData\Local\Temp\claude\c--Users-Gebruiker-Documents-Portfolio-Travel-App\12c06964-b051-4c2a-9f63-fcc26a335957\scratchpad\out\`: `shot-390-planned.png`, `shot-390-shortlist.png`, `shot-390-visited.png`, `shot-1440-planned.png`, `shot-1440-shortlist.png` and `shot-1440-visited.png`. The raw JSON is `browser-results.json` and `browser-results2.json` in the same folder.

## Skipped or limited

- **Sheets and overlays not opened.** PastTripForm, TripMemoryView, TripSharePanel, FriendTripPanel, InstallHint and GuidesPanel were not opened in the browser. Only the three tabs at rest were scanned (the moderation notice showed on Planned). Section 4 therefore does not cover the sheets.
- **Contrast is mine, not the detector's.** I computed WCAG contrast from computed colours and composited backgrounds. I did not run the detector's visual-contrast pass separately.
- **Accessibility tree** of the kept-alive Explore layer: not checked.
