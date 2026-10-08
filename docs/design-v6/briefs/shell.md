# Design brief: app shell, navigation and shared components (surface key `shell`)

Written by T370 (design wave V1, 2026-10-08) for the three build waves that change this surface: T381 (V3, structure, information and flow), T391 (V4, visual and dynamic) and T401 (V5, harden, adapt and polish). T380 (V2) reads it first and rules on every item in part 7 before anything is built.

App paths are written as `src/...` and refer to the app repo. Nothing in this brief changes code. Where a figure appears, the file it came from is named next to it.

This brief also carries the cross-surface layer, because the shell is the only surface that sees the whole app: the navigation model, every global setting, the shared component inventory, and the motion, imagery and data visualisation the app has today. That layer is part 5b and is written for T380's direction.

## 1. Setup and mode

Impeccable v4.3.1 (project copy) ran `context --target src/App.jsx` from the root worktree. It loaded PRODUCT.md and DESIGN.md, found no surface brief (this file is the first), and reported no active detector hook, so the detector was run by hand (part 4). Its autonomy check asks for one interview probe; the owner told every session in this run to proceed without asking (2026-10-07), so no question tool and no decision page were opened. Where impeccable would ask, this brief takes the answer that keeps Carta's palette, type and identity, and says so.

Mode: Operate. The shell is where a traveller completes tasks: moving between sections, setting the inputs every price is computed from, opening and closing panels. Success is that nobody notices it. Operate's rules apply directly: earned familiarity over expression, one vocabulary for buttons, sheets and closes, every component with all of its states, motion that carries state and nothing else, and modals as the last resort. Read applies only to the three legal pages, which keep their prose measure.

This is refinement, not redesign. The incumbent identity (paper and ink, one terracotta accent, Fraunces, Plus Jakarta Sans, JetBrains Mono for measured figures, the receipt) is preserved; the old look is not evidence to be thrown away.

## 2. The walk

The surface was walked on the shared dev server (http://localhost:5199, main checkout, read-only) with Playwright at 380x800 and 1280x800, as the traveller in docs/design-v6/TRIP-PLANNING-RESEARCH.md: undecided on a destination (59 percent start that way, section 1), counting money first (section 2), dreaming on the phone and comparing on a laptop (section 5).

Cold start, phone. The first visit opens on the landing page (`tab=home`, `src/lib/homeVisit.js`): a Fraunces headline with a number, three town buttons, People, Nights and Stay selects and a live receipt. It is the best screen in the app. Its People, Nights and Stay selects are local state in `src/browse/LandingPage.jsx` (lines 71 to 73), so a traveller who picks three people and a hotel there finds two people and an entire place everywhere else. The one primary ("Find a town to walk from") goes to Destinations, Trails. After that the landing page is gone: it has no nav entry, the brand mark goes to Destinations (`src/App.jsx` 987), and a reload opens Destinations because `homeSeen` is now set.

Returning visit, phone. Destinations opens on the Trips category: a 4-tile category strip, a search field, a country select, then photo tiles of trip styles. No price, no Lifestyle control, no origin, no dates and no party size are on the screen (the Lifestyle button only renders when `showPriceChrome` is true, `src/browse/DestinationsTab.jsx` 2196 and 2824). The traveller whose first criterion is value for money (3 in 5, research section 2) sees no money.

Explore, phone. Category tiles, search, the Lifestyle button (terracotta tint, the bed and the vibe), a star counter, Filters, a sort select, then a rail of the highest-rated places. A floating List and Map toggle sits over the rail. The cards carry a rating, not a price: the price arrives only on the destination page.

Planners, phone. The plus in the bottom nav opens a two-item chooser (Trip planner, "Route, flights and costs"; Day planner, "Hour by hour in one city") over a scrim. "Flights" is wrong: Carta does not price flights (PRODUCT.md). The Trip planner opens on step 1 of 7 ("What have you booked already?") with nothing from the traveller's earlier browsing carried in; the Day planner opens on step 1 of 4 with a start-address field, then a "Continue a trip" card whose icon sits on a pastel tile (carta-design never list item 1) and whose Sign in button is a second accent fill on the screen.

My trips and Account, phone. Both are full pages reached from the bottom nav. My trips shows Favorites, Planned and Visited tiles and two empty states, each with a pill-shaped accent button (radius 999px, against the 6px rule). Account opens on "Preferences": sign in, a pastel accent card ("Plan the next one together"), the Lifestyle row with its value in accent text, then Language, below the fold. Language is the only place in the app where the language can be changed (`src/auth/AccountPanel.jsx` 925 to 939).

Lifestyle, phone. Opened from Explore, the panel fills the screen, and the bottom nav (z-index 50) draws over its lower edge, because the panel sits at z-index 41 (`src/styles/46-owner-calls.css` 41). The selected sleep tile and the selected profile tile are both filled in `--accent`, so the dialog shows two accent fills, against "an active toggle is `--ink-fill`". The close control is the letter "x" on a grey disc.

Filters, phone. The Explore filter sheet is the best-made overlay in the app: a grab handle, a Fraunces title, folds, chips, Clear all and one accent primary that states the count ("Show 3,855 places", in mono). It is the pattern the other overlays should converge on.

Desktop. One header row: the logo and wordmark, five text tabs (Destinations, Explore, Trip planner, Day planner, Saved trips), the "Get a pass" chip and an accent-filled avatar. The phone calls the same section "My trips"; the desktop calls it "Saved trips" (`src/i18n/en.js` 56 and 61). The active tab is an ink-fill pill on desktop and terracotta text with a terracotta tick on the phone (`src/styles/10-shell.css` 125 and 745 to 758). The Trip planner on desktop is a seven-step rail over a mostly empty page. The legal pages open as modals over a blurred scrim with an "x" close; the pass modal opens over the same kind of scrim with a different close.

Screens that could not be reached from a guest browser on the dev server, and are read from source instead: the maintenance screen (`src/components/MaintenanceGate.jsx`), the crash screen (`src/components/ErrorBoundary.jsx`), the email-confirmed toast (`src/App.jsx` 1353 to 1365), the site notice and the pass expiry banner (`src/components/AnnouncementBar.jsx`), the sign-out gate and the friends button (signed in only).

Before screenshots, saved as JPEG quality 80, viewport only, in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\shell\` (outside both repos, never committed). The after sets in V3 to V5 reuse these view names:

| File | View |
|---|---|
| V1-home-380.jpg | Cold start, the landing page, phone |
| V1-places-380.jpg | Returning visit, Destinations, phone |
| V1-places-1280.jpg | Returning visit, Destinations, desktop |
| V1-explore-1280.jpg | Explore, desktop |
| V1-trip-1280.jpg | Trip planner step 1, desktop |
| V1-day-380.jpg | Day planner step 1, phone |
| V1-plan-chooser-380.jpg | The plus chooser open, phone |
| V1-lifestyle-380.jpg | The Lifestyle dialog from Explore, phone |

## 3. Inventory

One row per view, state and control on the shell. Source: the shell files named in the task, read line by line. Verdicts: keep, move, merge, remove, rework. "Raw button" means a `<button>` that does not use the shared `Button`.

### 3.1 Views and states

| Item | What it does | Where | File | Verdict |
|---|---|---|---|---|
| Boot loading screen | Logo, wordmark, tagline and a pulse while auth and data resolve | Both, full screen | src/App.jsx 914 to 923, 957 to 966 | Rework: role="status" and words for screen readers; the pulse animates width (src/styles/14-filters-panels.css 658 to 665), make it transform |
| TabFallback | Placeholder while a lazy planner chunk or the full catalogue loads | Both, `position: absolute; inset: 0; z-index: 100` | src/App.jsx 51 to 53 | Rework: render inside the tab region as a LoadingBlock; today it covers the header and the bottom nav, so no tab can be changed while it shows (it blocked verify_bottom_nav, part 4) |
| Load-error screen | Says the data could not load, Retry reloads | Both, full screen | src/App.jsx 944 to 955 | Rework: ErrorBlock, role="alert", no inline style |
| Sign-out gate (AuthGate) | Sign in, sign up or continue as a guest, only after a deliberate sign-out | Both, full screen | src/App.jsx 925 to 942 | Keep |
| Maintenance screen | Says the app is down, Retry | Both, full screen | src/components/MaintenanceGate.jsx 38 to 49 | Keep, polish to the StateBlocks voice |
| Maintenance admin strip | Tells an admin the gate is on | Both | src/components/MaintenanceGate.jsx 27 to 31 | Keep |
| Crash screen | Reload the app or Try again | Both, full screen | src/components/ErrorBoundary.jsx 70 to 87 | Rework: every string is hard-coded English and it prints the raw error message in a `<pre>`, which StateBlocks forbids |
| Landing page (home) | First-visit receipt, three towns, People, Nights, Stay | Both | src/browse/LandingPage.jsx (owned by landing) | Move: give it a way back (part 6, V3-1); wire its inputs to the global settings (V3-3) |
| Explore, Destinations, Trip planner, Day planner | The four tabs, kept alive once visited | Both | src/App.jsx 1032 to 1213 | Keep the keep-alive; tab content belongs to other briefs |
| Share-trip offer modal | "Open this shared trip?" with Open and Dismiss | Both, centred over a scrim | src/App.jsx 997 to 1027 | Rework: no dialog role, no aria-modal, no focus trap, borrows the wizard's `guide-next` class |
| Destination and region pages | Full-screen pages hoisted over any tab | Both | src/App.jsx 1218 to 1256 | Keep (owned by destination and outdoor) |
| My trips page | Saved trips over the current tab | Both | src/App.jsx 1272 to 1303 | Keep as a page; rework its dialog semantics with the account brief |
| Account page | Account hub over the current tab | Both | src/App.jsx 1316 to 1334 | Keep as a page; on desktop the header button is its only close, keep that but add Escape to the hint |
| Guides gallery, Admin | Full-screen panels | Both | src/App.jsx 1304 to 1345 | Keep (owned by account) |
| Lifestyle dialog | Where you sleep and how you eat, reprices everything | Both; right drawer on Explore, left elsewhere | src/browse/LifestylePanel.jsx, mounted at src/App.jsx 1082 to 1099 | Rework: above the bottom nav on a phone; selected tiles in `--ink-fill`; one close glyph; a sticky footer with the trade-off sentence and the figure (carta-design Lifestyle rule) |
| Lifestyle scrim | Closes Lifestyle on click | Both | src/App.jsx 1090 | Keep (the one scrim already on the owner rule) |
| Site notice (AnnouncementBar) | An admin-set notice, dismissible | Both, fixed bottom centre | src/components/AnnouncementBar.jsx 46 to 53 | Rework: one bottom slot shared with the toast and the expiry banner, stacking instead of overlapping |
| Pass expiry banner | Seven days or less left on a pass, Extend | Both, same slot | src/components/AnnouncementBar.jsx 90 to 107 | Merge into the same slot manager |
| Email-confirmed toast | "Email confirmed. Welcome to Carta." | Both, fixed bottom centre, z 80 | src/App.jsx 1353 to 1365 | Rework: on a phone it sits on the bottom nav (no phone offset, src/styles/16-auth.css 392 to 425); the tick glyph is not aria-hidden |
| Legal pages (privacy, terms, imprint) | The three texts as modals, also from `?legal=` | Both | src/components/PrivacyPolicy.jsx, TermsOfService.jsx, Imprint.jsx, LegalFromUrl.jsx | Rework: one close control, a language note (the texts are English only by design, TermsOfService.jsx 9 to 12), Imprint still shows "[Awaiting T015 ...]" placeholders (Imprint.jsx 22 to 30) |
| Plan chooser | Trip planner or Day planner | Phone, over a scrim above the plus | src/components/BottomNav.jsx 36 to 55 | Rework: aria-modal and the focus trap, or make it a menu; fix "flights" in its subtitle |

### 3.2 Controls

| Control | What it does | Where | File | Verdict |
|---|---|---|---|---|
| Brand mark and wordmark | Goes to Destinations | Desktop header, left (hidden on phone) | src/components/AppHeader.jsx 67 to 78 | Rework: a real `<a href="/?tab=places">`; on the phone the logo shows but is not the same button |
| Header tab Destinations | Opens Destinations | Desktop header | src/components/AppHeader.jsx 86 to 95 | Rework: `<a>` with aria-current |
| Header tab Explore | Opens Explore | Desktop header | same | Rework as above |
| Header tab Trip planner | Opens the Trip planner | Desktop header | same | Rework as above |
| Header tab Day planner | Opens the Day planner | Desktop header | same | Rework as above |
| Header tab Saved trips | Toggles the My trips page | Desktop header | src/components/AppHeader.jsx 97 to 105 | Rework: rename to "My trips" (one name), aria-current like the others instead of aria-pressed |
| Header nav landmark | `<nav aria-label="Sections">` | Desktop | src/components/AppHeader.jsx 84 | Rework: the label is hard-coded English |
| Get a pass chip | Opens the price table | Both, header right | src/components/AppHeader.jsx 116 to 124 | Rework: on the phone it is `--accent-bg` with an `--accent` border (src/styles/10-shell.css 302 to 317) against DESIGN.md's secondary chrome rule; 38px high, under `--tap` |
| Header search slot | Portal target for Explore's search | Desktop header | src/components/AppHeader.jsx 132 | Keep |
| Friends button | Opens the friends spoke | Both, signed in only | src/components/AppHeader.jsx 137 to 147 | Keep |
| Account avatar | Toggles the account page | Desktop header right | src/components/AppHeader.jsx 28 to 38 | Rework: an accent-filled disc for a guest spends the accent on chrome; secondary like the pass chip |
| Bottom nav Destinations | Opens Destinations | Phone bar | src/components/BottomNav.jsx 59 to 67 | Rework: `<a>`; active state per V2 rule |
| Bottom nav Explore | Opens Explore | Phone bar | src/components/BottomNav.jsx 69 to 77 | Rework as above |
| Bottom nav plus | Opens the plan chooser; marked active on a planner tab | Phone bar, centre, raised | src/components/BottomNav.jsx 79 to 87 | Keep the shape; add aria-current when a planner is showing |
| Plan chooser: Trip planner | Opens the Trip planner | Phone, chooser | src/components/BottomNav.jsx 40 to 46 | Keep; subtitle copy fix |
| Plan chooser: Day planner | Opens the Day planner | Phone, chooser | src/components/BottomNav.jsx 47 to 53 | Keep |
| Plan chooser backdrop | Closes the chooser | Phone | src/components/BottomNav.jsx 38 | Rework: `--ink` at 28 percent (it is a slate rgba today) |
| Bottom nav My trips | Toggles My trips | Phone bar | src/components/BottomNav.jsx 89 to 97 | Keep; label matches desktop after the rename |
| Bottom nav Account | Toggles Account | Phone bar | src/components/BottomNav.jsx 99 to 107 | Keep |
| Share-trip Open | Hands the trip to the Trip planner | Modal | src/App.jsx 1011 to 1020 | Rework: shared `Button variant="primary"` |
| Share-trip Dismiss | Drops the offer | Modal | src/App.jsx 1021 to 1023 | Rework: shared `Button` |
| Toast close | Dismisses the toast | Toast | src/App.jsx 1357 to 1363 | Rework: `--tap` box, CloseIcon |
| Site notice dismiss | Remembers the dismissed text | Banner | src/components/AnnouncementBar.jsx 49 to 51 | Rework: 30x30 today (src/styles/22-account-admin.css 1868 to 1881), `--tap` |
| Expiry banner Extend | Opens the price table | Banner | src/components/AnnouncementBar.jsx 101 to 103 | Keep (shared ghost Button) |
| Expiry banner dismiss | Hides until the next expiry | Banner | src/components/AnnouncementBar.jsx 104 to 106 | Rework: `--tap` |
| Maintenance Retry | Reloads | Maintenance screen | src/components/MaintenanceGate.jsx 45 to 47 | Keep |
| Crash Reload the app | Reloads | Crash screen | src/components/ErrorBoundary.jsx 79 to 81 | Keep, translate |
| Crash Try again | Clears the error | Crash screen | src/components/ErrorBoundary.jsx 82 to 84 | Keep, translate |
| Load-error Retry | Reloads | Load-error screen | src/App.jsx 950 | Keep inside an ErrorBlock |
| Legal close | Closes the legal modal | Legal modals | Imprint.jsx 41, PrivacyPolicy.jsx 28, TermsOfService.jsx 63 | Rework: the shared close (CloseIcon, `--tap`, translated aria-label; "Close" is hard-coded) |
| Legal mail links | mailto | Legal modals | Imprint.jsx 57, PrivacyPolicy.jsx 139, TermsOfService.jsx 474 | Keep |
| Lifestyle button | Opens Lifestyle, shows bed and vibe | Explore toolbar and side panel; Destinations toolbar and side panel on priced categories | src/browse/LifestyleButton.jsx 26 to 38 | Rework: secondary fill, not an accent tint; aria-label built by concatenation, move to one i18n key; shown on every priced surface |
| Lifestyle close | Closes the dialog | Dialog top right | src/browse/LifestylePanel.jsx 176 | Rework: the shared close |
| Sleep tiles (dorm, private, entire place, hotel) | Set the stay tier | Lifestyle | src/browse/LifestylePanel.jsx 187 to 200 | Rework: selected in `--ink-fill`, not `--accent`; icon size 22 |
| Hotel grade chips (3, 4, 5 star) | Set the hotel grade | Lifestyle, when Hotel is on | src/browse/LifestylePanel.jsx 204 to 217 | Keep, selected in `--ink-fill` |
| Profile tiles (six presets) | Set the eating and going-out profile | Lifestyle | src/browse/LifestylePanel.jsx 226 to 242 | Rework: selected in `--ink-fill`; icon size 20 against 22 for the sleep tiles, make one |
| Fine-tune disclosure | Opens the steppers | Lifestyle | src/browse/LifestylePanel.jsx 250 to 258 | Keep; add aria-controls |
| Per week / per day toggle | Switches the stepper cadence | Lifestyle, fine-tune | src/browse/LifestylePanel.jsx 263 to 264 | Rework: a labelled group; `type="button"` |
| Six steppers (dinners out, casual meals, fast food, cook at home, drinks at bars, club nights) | Fine-tune the profile | Lifestyle, fine-tune | src/browse/LifestylePanel.jsx 266 to 304 | Merge: one shared Stepper (three private copies exist, part 5b) |
| Fold toggle | Opens and closes a section | Detail and trip pages | src/browse/Fold.jsx 34 to 45 | Rework: aria-controls points at a body that is not mounted while closed |
| Sheet scrim, grab handle, close | Close the sheet by tap, drag or button | Every SheetShell sheet | src/browse/SheetShell.jsx 85 to 116 | Keep the pattern; swap the hand-written trap for useFocusTrap; the close's aria-label borrows `legend.closeMethod`, give it its own key |
| InfoDot | Opens the glossary popover | Mountain page, route figures, trip page | src/components/InfoDot.jsx 95 to 118 | Keep (three consumers only today) |
| Dropdown trigger, search, options | Pick one or many | Planners, filter sheets | src/components/Dropdown.jsx 109 to 156 | Rework: aria-expanded, aria-haspopup, option roles, arrow keys, translated "Select", "Search" and "N selected" |
| DateField trigger, month arrows, day cells | Pick a date | Planners, past trips | src/components/DateField.jsx 244 to 348 | Rework: English month and weekday names are hard-coded and the week starts on Sunday (line 23) in a European app; use Intl and Monday |
| CountryPicker trigger, search, options | Pick a country | Destinations | src/components/CountryPicker.jsx 47 to 93 | Rework: the listbox holds an input and a paragraph (invalid); return focus on close |
| OriginPicker trigger, search, options, drive search, drive results, Change | Pick the departure airport or the drive start | Trip planner, first-run receipt | src/components/OriginPicker.jsx 101 to 199 | Rework: the same listbox problem; car mode is unreachable (part 5b) |
| FilterControls Stepper and NumberField | Shared stepper and number input | Nowhere | src/components/FilterControls.jsx | Merge: it has no importers; make it the one Stepper the Lifestyle panel, the trip planner and the past-trip form use, or delete it |
| StateBlocks LoadingBlock, ErrorBlock | Skeleton and error states | 16 files | src/components/StateBlocks.jsx | Keep; add an EmptyBlock in the T367 voice so the empty states stop being ad hoc |
| Button (primary, secondary, ghost, danger; md, sm) | The shared button | 14 files, 29 uses | src/components/Button.jsx | Keep; adopt across the shell first |
| Logo | The compass mark | Header, loading screens | src/components/Logo.jsx | Keep |
| Icons | 104 icons, viewBox 24, stroke currentColor | Everywhere | src/components/Icons.jsx | Rework: one stroke width (1.6 in the Glyph helper, 1.7 to 2 in the standalone icons, against carta-design's 1.5); decorative Glyph icons announce a hard-coded English label |

### 3.3 Visual settings on the shell

| Setting | Today | File | Verdict |
|---|---|---|---|
| Active section, desktop | `--ink-fill` pill with paper text | src/styles/10-shell.css 125 | Keep, and make the phone match (rule needed, part 7) |
| Active section, phone | `--accent` text and a 3px `--accent` tick | src/styles/10-shell.css 745 to 758 | Rework to the desktop state |
| Bottom nav ground | `rgba(245, 241, 232, 0.985)` with a 14px backdrop blur and a fourth shadow `0 -3px 16px` | src/styles/10-shell.css 714 to 727 | Rework: `--paper` and a `--rule` top border; the colour is not a token and the shadow is not one of the three |
| Bottom nav labels | `--ui` 10.5px, 600 | src/styles/10-shell.css 761 to 776 | Keep; check the six languages (labels must shrink before they truncate) |
| Pass chip | Desktop: `--paper`, `--rule`, 999px; phone: `--accent-bg`, `--accent` border | src/styles/16-auth.css 72 to 98; src/styles/10-shell.css 302 to 317 | Rework both to DESIGN.md: transparent, `--rule`, 6px, `--tap` |
| Scrims | Four colours at three opacities: `rgba(26,26,26,.36)` with blur, `rgba(26,26,26,.42)` with blur, `rgba(15,23,42,.44)`, `rgba(15,23,42,.28)` | src/styles/16-auth.css, 12-guided-trip.css, 14-filters-panels.css 1416, 10-shell.css 805 | Merge: one scrim, `--ink` at 28 percent, as the owner rule says |
| Close glyphs | ASCII "x" (Lifestyle, Account, My trips, legal, auth), "×" (toast), CloseIcon (sheet, banner) | as listed | Merge: CloseIcon in a `--tap` box everywhere |
| Header shadow literals | Four shadow literals in the shell CSS, one `outline: none` | src/styles/10-shell.css (design-lint baseline) | Rework to the three shadows |

## 4. Critique and audit

Method: dual-agent, as reference/critique.md requires. Assessment A (design review from source and the 22 screenshots of part 2) and Assessment B (the detector and the project design lint) ran as two isolated sub-agents and did not see each other's output. Assessment B did not inject the detector overlay into a browser: the laptop is short on memory and the run allows one browser at a time, so the CLI scan stands in for it. No critique snapshot was persisted to `.impeccable/critique/` (it is gitignored and this brief is the record).

### Design specificity

The content is Carta's; the shell is not. The landing receipt (a `--paper-dim` header, mono line items, "Bed price from 3,768 stays in Edinburgh, captured June 2026", a tilde and "est." on the food line, the 2px rule above the total, "Carta does not price flights") could belong to no other product. The chrome around it could: a five-slot bottom bar with a raised plus, an upgrade chip and an avatar disc top right, photo cards with white serif titles on the picture, pastel icon tiles, a grey disc with a lowercase "x". The shell never carries the instrument. Nothing in it reads like a timetable header, and after the first visit no figure appears in the chrome. Where the rules were followed (a secondary plus, a secondary desktop pass chip) the shell is inoffensive rather than authored.

### Heuristic scores (Operate, all ten apply)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | The active section is marked, but the inputs every price depends on (origin, dates, party, Lifestyle) are not visible in the shell, against PRODUCT.md's "the inputs are always visible" |
| 2 | Match between system and real world | 3 | Plain, verb-first copy; but Destinations and Explore are both "browse places" with no stated difference, "Easygoing" is house jargon, and the chooser says "flights" (src/i18n/en.js 63) |
| 3 | User control and freedom | 2 | No `pushState` anywhere in src (only `replaceState`), so the browser or Android Back button leaves Carta from any tab; the landing page cannot be reached again |
| 4 | Consistency and standards | 2 | "Saved trips" against "My trips"; the pass chip styled two ways; three scrim recipes and three close glyphs; accent-filled selected tiles against `--ink-fill` toggles; 29 shared Button uses against about 772 raw buttons |
| 5 | Error prevention | 3 | The filter sheet previews its count before you commit; Lifestyle reprices every figure without showing what moved |
| 6 | Recognition rather than recall | 2 | Origin only in the Trip planner and the first-run receipt, no global dates control; the traveller must remember what each tab's prices assume |
| 7 | Flexibility and efficiency | 2 | Navigation is buttons: no middle click, no new tab, no copied link; tab changes write no history |
| 8 | Aesthetic and minimalist design | 3 | Calm desktop; on a phone Explore stacks seven controls before the first card and three accent-tinted objects in the first 250px |
| 9 | Error recovery | 3 | StateBlocks says what failed and offers one retry; the crash screen breaks it (English only, prints the raw error) |
| 10 | Help and documentation | 3 | InfoDot, "How the score works", FAQ and data sources exist; on a phone the help sits in Account, not in context |
| | Total | 25/40 | Acceptable: a solid base with significant work before travellers are happy |

Cognitive load: 5 of 8 checklist items fail (single focus, chunking, visual hierarchy on the phone, minimal choices, working memory), which is high. Decision points over four options: the desktop bar (five sections, pass chip, avatar), the phone bar (five slots, one opening two more), Explore's nine trip-style tiles, the Lifestyle profile tiles (six), the account language grid (six), the phone Explore toolbar (seven controls).

Emotional journey: the peak is the landing receipt, the trust moment the product is built on. The valleys follow it: the receipt never returns, Destinations opens on photos with counts and no money, phone Explore is a wall of controls with ratings but no day cost, the planner asks for the origin at step 2 after the traveller has already seen prices computed from an origin they never chose, and a guest's My trips ends on two accent "Sign in" and "Open the Day planner" pills. Peak-end: the last thing a guest sees is a login prompt, not their trip.

### What works

The receipt as the front door: line items, provenance in plain sentences, the tilde and "est.", the exclusions sentence, "Carta picked the dates" said out loud. It is the template the shell should copy. Overlay discipline in the main dialogs: LifestylePanel and the legal pages use useFocusTrap with aria-modal and initial focus on close, SheetShell handles Escape and focus return, the filter sheet previews its result, and `goToTab` is one door that clears every page laid over a tab, so the bar never lies about what is on screen. Desktop restraint: ink on paper, one marker for the current section, a secondary pass chip, a quiet planner stepper.

### Priority issues

[P1] Navigation has no history and no links. Every section door is a `<button>` (src/components/AppHeader.jsx 86, src/components/BottomNav.jsx 59) and no code pushes a history entry, so Back exits the app and no section can be opened in a new tab or shared. Fix: anchors with the view's URL, `goToTab` pushes an entry, a `popstate` handler restores the tab and closes overlays (V3-2). Command: harden.

[P1] The inputs that set every price are invisible in the shell. Fix: the settings line (V3-3, rule R2), one quiet timetable-style line of origin, dates, party, Lifestyle and language, figures in mono, no accent, each part opening the control that sets it; it absorbs the tinted Lifestyle pill. Command: clarify, then layout.

[P1] The Lifestyle dialog, which sets every euro, shows no euros. carta-design's Lifestyle rule asks for one sentence stating the trade-off with the figure; the panel has none, its selected tiles are accent-filled, and on the phone the bottom nav covers its last row (src/browse/LifestylePanel.jsx 168 to 258, z-index 41 under the nav's 50). Fix: V4-6. Command: clarify, then polish.

[P2] The accent is spent on chrome. The phone pass chip (accent tint and border, src/styles/10-shell.css 302 to 311), the Lifestyle pill, the accent tick on every unselected category tile (`.places-cat::before`, src/styles/24-destination-workspace.css 5025; `.saved-cat::before`, src/styles/25-feature-pages.css 186), which is also the bottom nav's "you are here" mark, the accent wordmark on the phone against ink on desktop, the accent avatar disc, the accent Lifestyle value in Account, and two accent pills in one My trips view. Fix: V4-1 and rule R4; the tile ticks and My trips buttons are hand-offs to destinations and account. Command: quieter.

[P2] Overlays are not one system: four scrim colours, three close glyphs on a 38px disc, a plan chooser that claims role=dialog without a trap, a share-trip modal with no dialog role, a Lifestyle close that hangs half outside the panel on desktop. Fix: V4-5, V5-1 and rules R7, R10. Command: harden, then polish.

Persona red flags. Casey, on a phone in one hand: Back exits the app; either planner is two taps behind the plus; the loudest object on every screen is the pass chip in the hardest corner to reach; the List and Map pill covers a card's rating row; the last Lifestyle row hides under the bar; the bar labels are 10.5px. Jordan, first time: the landing page is excellent, then two browse tabs with no stated difference and no price on their cards, "Get a pass" before Jordan knows what Free covers, "Lifestyle" and "Easygoing" with no figure, and three names for one place (Account in the bar, "Preferences" as its heading, "Overview" in its desktop rail). Sam, with a screen reader: navigation is buttons; tabs announce aria-current while My trips and Account announce aria-pressed in the same bar; the landmark says "Sections" in English in all six languages; focus can leave the plan chooser; the closes are 38px; the legal close label is not translated; the toast reads out "✓" and "×". The hiker counting money: "Find a town to walk from" is the right promise, then no day cost appears in the chrome again; there is no global origin to anchor "can I get there without a car"; the chooser promises flights to someone taking the train.

Minor observations: the landing says 3,868 places and the Explore filter sheet "Show 3,855 places" with nothing selected (filters-380), two numbers for "everything"; on the phone the raised plus overlaps the landing receipt's total row; the trip planner on desktop floats its question under about 200px of empty paper and repeats "Booked, Step 1 of 7" over its own stepper; `header.seePricing` ("See pricing") is the chip's title while its label reads "Get a pass"; the legal modal's initial focus draws the accent ring on the close on load, correct for keyboards but read as an alarm on touch; Account's "Account" and "Language" labels are small letterspaced eyebrows. Hand-offs, not shell work: prices in Fraunces in the pass modal (account), the pastel icon tile in the day planner's "Continue a trip" card (dayplanner), white Fraunces titles on photographs (destinations).

Questions for T380. The receipt is Carta's whole argument: why does the shell show it once and never again? Destinations and Explore are two ways to look at places without a price: is one of them the dreaming surface and the other the comparison table the research describes? Should the control be called "Lifestyle", a word to learn, or be named for what it moves?

### Detector and lint (Assessment B)

`impeccable detect --json` over the 23 shell markup files: 0 findings (exit 0). The detector is pattern based and mostly reads Tailwind and inline styles, so a clean JSX result says nothing about tap targets, traps, scrims or link semantics; those come from the manual read above. Over the seven shell stylesheets: 2 findings, both true positives. `side-tab` at src/styles/14-filters-panels.css 2659 (`border-left: 3px solid var(--accent)` on `.hostel-note`, a class no JSX file uses, so probably dead CSS) and `bounce-easing` at src/styles/14-filters-panels.css 267 (`cubic-bezier(.2,.9,.3,1.2)` on the price pill hover).

`node scripts/ci/design-lint.mjs`: 213 violations, all 213 in the baseline, 0 new (shadow-literal 126, gradient 23, js-hex-literal 17, outline-none 14, banned-word 12, middot 11, em-dash 9, font-literal 1). In the shell files: 19, all CSS: src/styles/10-shell.css 5 (four shadow literals, one `outline: none` on `.origin-search`) and src/styles/14-filters-panels.css 14 (thirteen shadow literals, one `outline: none` on the filter select). None in the shell JSX.

### Technical audit (reference/audit.md)

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | Navigation by button; dialogs without traps (plan chooser, DateField, share-trip, day-saved overlay); hard-coded English in landmarks, DateField, Dropdown, the crash screen, Glyph icon labels; DateField starts the week on Sunday |
| 2 | Performance | 3 | Tabs are lazy and kept alive; the boot index (T271) paints early; but TabFallback covers the whole viewport at z-index 100 while a planner chunk loads, and the loading pulse animates width |
| 3 | Responsive design | 2 | No horizontal scroll at 380 or 1280 on any view walked; but the Lifestyle dialog sits under the bottom nav, the toast sits on the bottom nav, three bottom-centre messages overlap, the pass chip is 38px |
| 4 | Theming | 3 | Every colour is a token except the bottom nav ground, the scrims and 17 shadow literals in the shell CSS; single theme as decided |
| 5 | Implementation integrity | 2 | The shared Button, StateBlocks, Stepper and Fold exist and are bypassed (part 5b); FilterControls has no importer; car mode and transport mode are unreachable |
| | Total | 12/20 | Acceptable |

Harnesses, run against the shared dev server (they are written for `vite preview` of a built dist; this task builds nothing). verify_bottom_nav stopped at the Day planner step: the TabFallback loading screen covered the plus and intercepted the click for 30 seconds, which is the V3-6 issue seen from a test. verify_desktop_shell stopped on a stale assertion: it looks for a "General" category tile, expects seven tiles and the pre-T363 accent `rgb(224, 90, 71)` (V5-7). verify_top_bar timed out on the first page load (45s) on the loaded dev server. verify_tab_switching timed out waiting for the Destinations header tab while the loading screen stood over it. verify_filter_sheet waits for `.mobile-seg-btn`, a class the phone Explore no longer renders. verify_keyboard and verify_quality_floor: results in the T370 report. verify_lifestyle and verify_focus_trap start their own `vite preview` on a fixed port and need a built dist, so they were not run; T381 runs all nine from its app worktree on a preview build and records the baseline before changing anything.

## 5. The traveller's job here

The shell does not answer a question about a place; it carries the traveller between the places that do. The research gives the order in which they need things.

First, the inputs every price is computed from, visible and editable on every priced screen. The research is direct: prices change meaning with the inputs (PRODUCT.md), constraints change throughout planning (the 2026 interview study, research section 1) and value for money is the first criterion for 3 in 5 European travellers (Booking.com 2024, research section 2). Today the inputs are scattered: Lifestyle is a button on Explore and on some Destinations categories, party size and dates are set only on the first-run receipt, the origin only inside the Trip planner, the language only at the bottom of Account, and the landing page's own People, Nights and Stay never leave it. A traveller who changes one of them cannot see that the others exist.

Second, where they are in the journey and how to get back. Google's four moments (dreaming, planning, booking, experiencing, research section 1) map onto Carta as Destinations and Explore (dreaming and choosing), the destination page (budgeting), the two planners (planning) and My trips (keeping). The shell names sections by tool, not by step, so the bar does not say where the traveller is in that sequence, and two of the tools (the planners) hide behind a plus. The landing page, the one screen that explains Carta, is unreachable after the first visit.

Third, that their work is safe. People keep tabs open because "as soon as something went out of sight, it was gone" (CMU, research section 1). Carta keeps tabs alive in memory (`src/App.jsx` 355 to 360), but nothing in the chrome says so: no count on My trips, no sign that a plan is in progress in a planner, no confirmation in the bar when a place is saved.

What is missing: one place that shows the traveller's settings (origin, dates, party, Lifestyle, language) as a single readable line and lets them change any of it; a way back to the landing page; a count or a dot on My trips; a "plan in progress" mark on the plus; a shared bottom slot for toasts and notices.

What sits in the wrong place: language at the bottom of the account page; the origin inside the Trip planner only; the pass chip as the most colourful object in the header on a phone; the two planners behind a chooser while My trips and Account take full slots.

What sends the traveller elsewhere: no flight price (by design, and stated on the landing page but not in the planner chooser, which says "flights"); no link the traveller can copy for a section, because every navigation item is a `<button>` and only `?tab=` in the address bar carries the view; and the legal texts, which are English only.

## 5b. Cross-surface layer (for T380)

### The navigation model today

Five top-level places: home (first visit only), Destinations (`places`), Explore (`map`), Trip planner (`trip`), Day planner (`day`); and two pages laid over them: My trips and Account. One door changes the tab, `goToTab` in `src/App.jsx` 257 to 262, which also closes My trips, Account and Lifestyle. It is called from 20 places in App.jsx (the header, the bottom nav, the brand, every hand-off between surfaces). Six deep-link effects call `setActiveTab` directly and bypass it (`src/App.jsx` 421, 441, 448, 454, 464, 484), so a shared trail link opened while Account is open leaves Account standing over Destinations.

The journey and where it breaks:

| Step | Surface that owns it | How the traveller gets there | Where it breaks |
|---|---|---|---|
| Dream | Landing, Destinations, Explore | First visit lands on the landing page; later visits on Destinations | The landing page has no door back; Destinations opens on trip styles without a price |
| Choose | Explore, Destinations, outdoor pages | Tabs; cards open full-screen pages over the tab | Two browse tabs with overlapping jobs (both list places, both have category tiles); the difference is not named in the bar |
| Budget | Destination page receipt | A card opens it over any tab | The receipt's inputs (party, dates, origin) are not editable from the chrome |
| Plan | Trip planner, Day planner | The plus chooser on a phone; two tabs on desktop | The planners start empty; nothing chosen while browsing is offered unless the traveller used a specific hand-off button |
| Keep | My trips | The bookmark slot | No count, no "what changed since you saved"; desktop calls it Saved trips |

### Every global setting

| Setting | State | Where it is set | Where it is shown | Gap |
|---|---|---|---|---|
| Language | `lang`, src/i18n/index.jsx 82 to 114 | Account, language grid (src/auth/AccountPanel.jsx 925 to 939), only | The same grid | Nowhere in the chrome; the legal pages ignore it |
| Departure airport (origin) | `choices.origin`, src/App.jsx 339 | Trip planner OriginPicker (src/planner/TripPlannerTab.jsx 926); first-run receipt (src/components/FirstRunReceipt.jsx 110); URL and account restore | The OriginPicker button; the Destinations rail line (src/browse/DestinationsTab.jsx 3713) | Not settable on Explore or Destinations; the prop passed to Destinations is unused |
| Drive start (drive home) | `choices.drive_home`, src/App.jsx 343 | No reachable control: OriginPicker's car mode is never mounted with `mode="car"` | Nowhere | Dead path; decide to wire it or remove it |
| Transport mode | `choices.transport_mode`, src/App.jsx 334 | URL `t` only | Nowhere | No control; pricing reads it (src/lib/runtime_pricing.js) |
| Dates | `departDate`, `returnDate`, src/App.jsx 326 to 327 | First-run receipt native date inputs (src/components/FirstRunReceipt.jsx 385 to 405); data defaults; saved-trip load. The planners keep their own dates | The first-run receipt only | No chrome readout; two date systems (global and per planner) |
| Party size | `choices.group_size`, default 2, src/App.jsx 330 | First-run receipt select (src/components/FirstRunReceipt.jsx 371 to 375); URL `g` | The first-run receipt | The landing page's People select is local and does not write it |
| Lifestyle (stay tier and profile) | `choices.stay_tier`, `choices.lifestyle` | Lifestyle dialog; first-run receipt stay select; the journey page stay slider | LifestyleButton; Account row; destination page line | Missing on Destinations' unpriced categories and in both planners (the planners get no opener prop) |
| Baggage | `choices.baggage_key` | URL `b` only | Nowhere | Leftover from fare pricing; remove with the flight work |
| Currency | none, EUR only | n/a | n/a | State it once in the settings line ("Prices in EUR") rather than adding a control |

### Shared components, and how consistently they are used

Counts from grep over `src/` (full method in the T370 report):

| Component | Used by | Bypassed by |
|---|---|---|
| Button | 14 files, 29 uses | About 772 raw `<button>` elements in 121 files; the main families are adminpage-btn, cov-empty-btn, auth-submit, guide-next, panel-close, xrail-toggle |
| StateBlocks (LoadingBlock, ErrorBlock) | 16 files, about 30 uses | Ad-hoc empty markup in 18 files, loading markup in 11, error markup in 26 (15 of them admin) |
| SheetShell | 6 files | PlacesFilterSheet duplicates it by design and carries its own focus trap |
| Fold | 9 files | src/auth/PastTripForm.jsx defines its own |
| InfoDot | 3 files | Every other glossary term on the detail pages |
| LifestyleButton | Explore, Destinations | Account draws its own row |
| Dropdown | 4 files (planners, filter sheet) | Native selects on the landing page and first-run receipt |
| DateField | 4 files | The first-run receipt uses native date inputs |
| FilterControls (Stepper, NumberField) | No importer | Three private steppers (LifestylePanel, PastTripForm, TripPlannerTab) |
| useFocusTrap | 14 files | SheetShell and PlacesFilterSheet hand-write traps; the plan chooser, DateField popup, day-saved overlay (aria-modal without a trap), share-trip modal and five other dialogs have none |
| Scrim | Eight overlay classes | Four colours, three opacities; two on the owner rule |
| Close control | CloseIcon in sheets and banners | ASCII "x" in five panels, "×" in the toast |

### Motion today, surface by surface

Counts from `src/styles/*.css` (40 `@keyframes`, about 377 transition declarations). A global reduced-motion floor in `src/styles/02-base.css` sets every duration to 0.01ms, so nothing escapes it, but about 230 transitions animate colour, background, border or shadow, and a few animate layout (height, width, max-width, grid-template-rows, four `transition: all` in 14-filters-panels.css and three in 15-map-overlays.css), against the current rule of transform and opacity only.

| Surface | What moves today | Source |
|---|---|---|
| Shell | Plan chooser rises (180ms); plus rotates to a cross; press scale on nav items; toast slides in; loading pulse (animates width) | src/styles/10-shell.css 797 to 853; 16-auth.css 421; 14-filters-panels.css 662 |
| Explore and Destinations | Card photo grows into the page header (View Transitions, `src/lib/sharedElement.js`); rail arrows scroll; filter sheet slides up with its scrim | src/lib/sharedElement.js; 14-filters-panels.css 1443 to 1468 |
| Destination page | Shared hero; preview cards fade in | 24-destination-workspace.css 441 to 457 |
| Trip page | Day track scroll-snap, flashcards slide, sticky rail | src/browse/DayTrack.jsx, FlashDeck.jsx, 32-day-carousel.css, 33-flashcards.css |
| Trip planner (wizard) | Steps slide forward and back; the estimate bumps and sweeps when it changes | 19-guide-ratings.css 2566 to 2567; 12-guided-trip.css 637 to 651 |
| Day planner | AI schedule rows fade in | 20-day-planner-flow.css 507 |
| Passes and chat | Pass cards rise; chat cursor blinks; route draws | 21-chat-passes.css |
| First-run receipt | The total reprices with a short flash | 38-first-run.css 165 |
| Touch | `:active` opacity and scale everywhere; a vibrate tick on toggles where supported | 02-base.css; src/lib/touchFeedback.js |

There are no motion tokens: every duration and easing is a literal, and the price-pill hover uses an overshooting curve the detector flags as a bounce (14-filters-panels.css 267).

### Imagery today

Photographs carry Destinations (category tiles with Fraunces titles over the photo), Explore (rail cards), the destination, outdoor and trip pages (heroes, licensed, credited through the photo contract), and nothing in the planners, My trips or Account. The landing page carries no photograph and leads with the receipt, which is right for Carta. Maps: MapLibre on Explore's map view, the destination page (DestMap), the detail skeleton (PointMap) and TripMap in the planners, My trips, guides and the trip page. The shell itself carries no imagery beyond the logo; the empty states of My trips and the planners are text on a `--paper-dim` card.

### Data visualisation today

The receipt (landing page, first-run receipt, destination page) is the signature and is consistent. Beside it: the cost bar (journey page only, src/browse/CostBar.jsx), MonthStrip (journey and mountain pages), ClimateStrip and CrowdCalendar (destination page), RatingBreakdown (destination page), the tier legend (Explore), WeekProfile, MixBar and TrafficBar (journey route), SlopeProfile (trail page), DifficultyMeter (journey page) and the price pins on Explore's map. They were built one surface at a time: no shared scale, axis or label style, and no data visualisation anywhere in the planners, where the traveller decides between legs and days. The shell shows no figure at all, which is correct, but it should show the settings those figures depend on.

## 6. The plan (impeccable shape)

The brief impeccable's shape step asks for, in short. Job and audience: a budget traveller in Europe moving between dreaming, choosing, budgeting, planning and keeping one trip, on a phone first and a laptop second. Outcome: they always see what the prices on screen are computed from, always know where they are, and never lose what they found. Direction: refinement inside the locked palette and type; the shell recedes, the active section and the settings line are its only emphasis, and the accent is left to each page's one primary action. Boundaries: no new tab, no new colour, no redesign of any tab's content (that belongs to the other nine briefs). Assumptions taken without asking (impeccable would ask): the five-slot phone bar stays; the plus stays the door to the planners; the landing page stays the first-visit home.

Every item names the files, the impeccable command that guides it and how to check it. Items that need a rule from part 7 say so and wait for T380.

### V3: structure, information and flow (T381)

1. One name per section and a way home. Rename "Saved trips" to "My trips" on desktop (`nav.saved`), and give the landing page a door back: the brand mark on desktop and the logo on the phone go to `tab=home` instead of Destinations, and the landing page's primary stays the way into the app. Needs rule R1. Files: src/components/AppHeader.jsx, src/components/BottomNav.jsx, src/App.jsx (brand handler, 987), the six i18n catalogues (shell keys). Command: clarify, then layout. Done when verify_bottom_nav and verify_desktop_shell pass with the new labels and a click on the logo from any tab lands on the landing page.
2. Navigation as links. Every section door becomes an `<a href>` carrying its `?tab=` URL, with `aria-current="page"` on the section showing; clicks still go through `goToTab` (preventDefault), so a middle click opens a new tab and a long press copies the link. `goToTab` pushes a history entry and a `popstate` handler restores the tab and closes the pages over it, so the phone's Back button moves between sections instead of leaving Carta (today nothing in src calls `pushState`). My trips and Account keep toggle behaviour but use aria-current while open. Translate the two `aria-label="Sections"`. Files: src/components/AppHeader.jsx, src/components/BottomNav.jsx, src/lib/urlState.js (read only, for the href builder; if it must change, ask OWNERSHIP.md's owner). Command: harden. Done when the keyboard harness (verify_keyboard 20 of 20) still passes, every nav item is an anchor in the DOM, and Back after Destinations then Explore returns to Destinations. Needs rule R9.
3. The settings line. One compact, always-visible readout of the inputs every price uses: origin, dates (or "Any dates"), party, Lifestyle (bed and vibe), language, with "Prices in EUR". On desktop it sits in the header row after the tabs; on the phone it is one row under the header on the priced tabs (Destinations, Explore) and collapses to the Lifestyle button alone when space runs out. Each part opens the control that sets it: OriginPicker, DateField, a party Stepper, the Lifestyle dialog, the language list. The landing page's People, Nights and Stay write the same global state. Needs rule R2. Files: new src/components/SettingsLine.jsx, src/App.jsx (wire the setters), src/components/AppHeader.jsx, src/components/OriginPicker.jsx, src/components/FilterControls.jsx (the Stepper), src/browse/LifestyleButton.jsx; the landing page wiring is a hand-off to T382 (src/browse/LandingPage.jsx is landing's). Command: shape, then layout. Done when a party size changed on the landing page shows on Explore, and every global setting in the part 5b table has one place where it is set and is shown wherever a price depends on it.
4. Lifestyle on every priced surface, and in the planners. Pass `onOpenLifestyle` to both planner tabs (the prop exists in App.jsx 716 but is not passed) and show the LifestyleButton on every Destinations category that prices anything. Files: src/App.jsx; the button placement inside the planners is a hand-off to T388 and T389. Command: layout. Done when verify_lifestyle passes and the button is reachable on all four tabs.
5. One door for every tab change. Route the six deep-link effects through `goToTab` (src/App.jsx 421 to 484) so a shared link always clears the pages laid over the tab. Command: harden. Done when verify_tab_switching passes and a `#trail=` link opened with Account open shows the trail page, not the account page.
6. Loading inside the tab, never over the chrome. Replace TabFallback and the planners' partial-catalogue fallback with a LoadingBlock inside the tab region, so the header and the bottom nav stay usable while a chunk loads. Files: src/App.jsx, src/components/StateBlocks.jsx. Command: harden. Done when verify_bottom_nav passes against the dev server (it timed out on the overlaying loading screen in this task).
7. One bottom slot. Toasts, the site notice and the pass expiry banner share one stack above the bottom nav on a phone and bottom centre on desktop, newest on top, never overlapping. Files: src/components/AnnouncementBar.jsx, src/App.jsx (toast), new src/components/BottomSlot.jsx if needed. Needs rule R6. Command: layout. Done when all three can show together without covering the nav or each other at 380 and 1280.
8. The plan chooser's copy and semantics. Subtitle "Route, stops and ground costs" instead of "Route, flights and costs"; a plan-in-progress dot on the plus when a draft exists (`loadTripDraft()` or an open day plan). Needs rule R3 for the dot. Files: src/components/BottomNav.jsx, i18n. Command: clarify. Done when the chooser names no flight and the dot shows only with a draft.
9. My trips count. A mono count beside My trips when the shortlist or saved trips are not empty. Needs rule R3. Files: src/components/AppHeader.jsx, src/components/BottomNav.jsx. Command: clarify. Done when the count matches the My trips page.
10. Retire dead state. Remove the unused `onChangeOrigin`, `transportMode`, `driveHome` and `onChangeDriveHome` props passed to Destinations, and either wire car mode through the settings line or record its removal (owner row). Files: src/App.jsx. Command: distill. Done when lint is clean and nothing reads the removed props.

### V4: visual and dynamic (T391)

1. The chrome recedes. Bottom nav ground to `--paper` with a `--rule` top border and no blur or fourth shadow; the active section is the same on both widths (`--ink-fill` pill or ink weight, per rule R4); the pass chip and the avatar become secondary chrome (transparent, `--rule`, 6px, `--tap`). Files: src/styles/60-v6-shell.css (overrides 10-shell.css and 16-auth.css from the v6 file). Command: quieter. Done when the only accent fill in the header and bar is gone and each screenshot's one accent is the page's primary.
2. Motion tokens in the shell. Use T380's duration and easing tokens for the plan chooser, sheets, the Lifestyle drawer, the toast stack and the nav press state; transform and opacity only (or what T380 relaxes); a reduced-motion branch for each. Remove the overshoot on the price pill only if T380 assigns it here (14-filters-panels.css is shell-owned). Files: src/styles/60-v6-shell.css, src/styles/14-filters-panels.css. Command: animate. Done when no shell transition names a colour, background, border or shadow, and the detector's bounce finding is gone.
3. Section change that reads as movement. When the tab changes, the new tab's content fades and rises 8px (opacity and transform, one duration token), and the active marker slides between items instead of jumping. Needs rule R5. Files: src/styles/60-v6-shell.css, src/App.jsx (a class on the tab block). Command: animate. Done when it runs under 300ms (or T380's token) and is absent under reduced motion.
4. Figures that update in place. When a setting in the settings line changes, the figures it drives use T380's in-place number transition (tabular mono, no layout shift). The shell provides the trigger; each surface applies it to its own figures. Command: animate. Done when changing Lifestyle on Explore shows the change without a jump in any card height.
5. One dialog family. One scrim (`--ink` at 28 percent, no blur), one close (CloseIcon in a `--tap` box, top right, translated label), one corner radius for dialogs and sheets, `--shadow-2` only. Applies to the Lifestyle dialog, the plan chooser, the share-trip modal, the legal modals, the toast and the SheetShell sheets. Files: src/styles/60-v6-shell.css, src/browse/LifestylePanel.jsx, src/browse/SheetShell.jsx, the three legal components, src/App.jsx. Command: polish. Done when part 3.3's scrim and close rows are each one value.
6. Lifestyle dialog as a priced instrument. Selected tiles in `--ink-fill`; a sticky footer with the carta-design trade-off sentence and the figure it moves (shape: "A private room instead: <figure> less a night in <town>", the figure computed, never written by hand), taken from the current destination where there is one; the bottom nav never covers it (z-order above the nav, or the nav hides while it is open). Files: src/browse/LifestylePanel.jsx, src/styles/60-v6-shell.css. Command: colorize (to remove colour), then polish. Done when the dialog shows one accent object at most and the trade-off sentence updates with the selection.
7. Icons in one weight. One stroke width across src/components/Icons.jsx (carta-design says 1.5; the Glyph helper uses 1.6), decorative icons aria-hidden. Command: polish. Done when every exported icon draws at the same stroke.

### V5: harden, adapt and polish (T401)

1. Every dialog traps focus and closes on Escape: the plan chooser (or turn it into a menu with menu semantics), the DateField popup, the share-trip modal, the day-saved overlay that claims aria-modal; SheetShell and PlacesFilterSheet move to useFocusTrap. Files: src/components/BottomNav.jsx, src/components/DateField.jsx, src/App.jsx, src/browse/SheetShell.jsx (PlacesFilterSheet and the day planner overlay are hand-offs to their owners). Command: harden. Done when verify_focus_trap passes and a keyboard walk of every dialog in part 3 never leaves it.
2. Strings through i18n. The crash screen, the nav landmarks, the legal close label, Dropdown's placeholders and "N selected", DateField's months and weekdays (Intl, Monday first), the Glyph icon labels. Six catalogues, with one owner row for native review. Command: harden. Done when a grep for English literals in the shell files finds only brand names.
3. Tap targets. Pass chip, toast close, banner dismiss, the bottom-nav plus while rotated: at least `--tap` on a coarse pointer, 32px only under `pointer: fine`. Command: adapt. Done when verify_quality_floor reports no shell target under the floor at 380.
4. Phone edges. Safe areas on the header, the bottom nav and the bottom slot; full-height panels on 100dvh; landscape at 844x390 keeps the bar and the settings line; the on-screen keyboard never lifts the bottom nav over a focused input. Command: adapt. Done when the V5 phone checks in T380's direction pass on iPhone 13 and Pixel 5 descriptors.
5. Lint and detector. Move the shell's shadow literals to the three tokens, drop the `outline: none` in 10-shell.css (origin search) for a border swap, remove the four `transition: all` in 14-filters-panels.css. Command: polish. Done when the design-lint baseline loses the shell's 19 entries and the detector reports nothing on the shell files.
6. Crash and maintenance in Carta's voice. ErrorBoundary says what happened and what to do in one sentence, never prints `error.message`, uses ErrorBlock; maintenance uses the same block. Command: clarify. Done when no raw error text renders anywhere in the shell.
7. Harness repairs. verify_desktop_shell still expects a "General" category, seven category tiles and the pre-T363 accent `rgb(224, 90, 71)`; update those assertions with a comment saying why (T363 and the category change), never delete them. Command: audit. Done when the harness runs to the end.

### Target state: every button and control on the shell

| Control | Today | Target | Wave |
|---|---|---|---|
| Brand mark (desktop), logo (phone) | Button to Destinations; phone logo inert | Link to the landing page, both widths | V3 (R1) |
| Header tabs Destinations, Explore, Trip planner, Day planner | Buttons, aria-current | Links with aria-current, translated landmark | V3 |
| Header My trips | "Saved trips", aria-pressed | "My trips", aria-current, count | V3 (R3) |
| Bottom nav Destinations, Explore | Buttons, accent active state | Links, the R4 active state | V3, V4 |
| Bottom nav plus | Button, active ring in accent | Same button, plan-in-progress dot, aria-current on a planner | V3 (R3), V4 |
| Plan chooser items | Buttons, "flights" subtitle | Buttons, ground-cost subtitle, focus trapped or menu semantics | V3, V5 |
| Plan chooser backdrop | Slate rgba | The one scrim | V4 |
| Bottom nav My trips, Account | Buttons, aria-pressed | Same, count on My trips | V3 |
| Get a pass chip | Accent tint on phone, 38px | Secondary chrome, `--tap` | V4, V5 |
| Account avatar | Accent-filled disc | Secondary round button | V4 |
| Friends button | Secondary | Unchanged | none |
| Settings line: origin, dates, party, Lifestyle, language | Does not exist | One line, each part opens its control | V3 (R2) |
| Lifestyle button | Accent tint pill | Part of the settings line, secondary | V3, V4 |
| Lifestyle close | "x" on a grey disc | Shared close | V4 |
| Lifestyle sleep, grade and profile tiles | Accent fill when selected | `--ink-fill` when selected | V4 |
| Lifestyle fine-tune, cadence, steppers | Private stepper, raw buttons | Shared Stepper, labelled group | V3 (merge), V5 |
| Lifestyle trade-off footer | Does not exist | Sentence with the figure | V4 |
| Share-trip Open, Dismiss | Wizard classes, no dialog role | Shared Button, dialog semantics | V4, V5 |
| Toast close | "×", under 32px | Shared close, `--tap`, in the bottom slot | V3 (R6), V5 |
| Site notice and expiry dismiss | 30px | `--tap`, in the bottom slot | V3, V5 |
| Expiry Extend | Ghost Button | Unchanged | none |
| Maintenance Retry, crash Reload and Try again, load-error Retry | Mixed, crash in English | ErrorBlock voice, translated | V5 |
| Legal close | "x", "Close" hard-coded | Shared close | V4, V5 |
| Legal mail links | Anchors | Unchanged | none |
| Sheet close, grab handle | CloseIcon, own trap | Unchanged look, useFocusTrap | V5 |
| Fold toggle | aria-controls to an unmounted id | Body always in the DOM (hidden), or no aria-controls | V5 |
| InfoDot | Correct | Unchanged | none |
| Dropdown trigger, search, options | No popup semantics, English strings | Listbox semantics, arrow keys, translated | V5 |
| DateField trigger, arrows, days | English, Sunday first | Intl names, Monday first, popup focus | V5 |
| CountryPicker, OriginPicker | Invalid listbox content | Valid listbox, focus return | V5 |
| Shared Button | 29 uses | Every shell button above | V3 to V5 |

### Files the build waves touch

Shell-owned (subject to OWNERSHIP.md from V2): src/App.jsx; src/components/AppHeader.jsx, BottomNav.jsx, Button.jsx, Icons.jsx, StateBlocks.jsx, Dropdown.jsx, DateField.jsx, FilterControls.jsx, CountryPicker.jsx, OriginPicker.jsx, AnnouncementBar.jsx, MaintenanceGate.jsx, ErrorBoundary.jsx, InfoDot.jsx, Logo.jsx, Imprint.jsx, PrivacyPolicy.jsx, TermsOfService.jsx, LegalFromUrl.jsx; src/browse/Fold.jsx, SheetShell.jsx, LifestyleButton.jsx, LifestylePanel.jsx; src/styles/02-base.css, 03-button.css, 10-shell.css, 14-filters-panels.css, 27-states.css, 31-infodot.css, 46-owner-calls.css and 60-v6-shell.css; the six catalogues src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js (shell prefixes only: `nav.`, `header.`, `shell.`, `toast.`, `a11y.`, `lifestyle.`, `settings.`); scripts/verify_bottom_nav.mjs, verify_desktop_shell.mjs, verify_top_bar.mjs, verify_tab_switching.mjs, verify_filter_sheet.mjs, verify_lifestyle.mjs, verify_focus_trap.mjs (assertion updates with a comment only).

New files proposed: src/components/SettingsLine.jsx (V3-3), src/components/BottomSlot.jsx (V3-7, only if the slot cannot live in AnnouncementBar.jsx). src/hooks/useFocusTrap.js is read, not changed, unless T380 assigns it here.

Hand-offs to other surfaces (the shell asks, the owner builds): src/browse/LandingPage.jsx writes the global People, Nights and Stay (T382); src/browse/DestinationsTab.jsx shows the Lifestyle button on every priced category and drops the accent tile tick in src/styles/24-destination-workspace.css (T384); src/browse/PlacesFilterSheet.jsx moves to useFocusTrap (T383 or T384, whichever owns it); src/planner/TripPlannerTab.jsx and src/planner/DayPlannerTab.jsx place the Lifestyle opener and drop the private Stepper (T388, T389), and the day planner's aria-modal overlay at DayPlannerTab.jsx 3749 gets a trap (T389); src/auth/AccountPanel.jsx, src/auth/SavedTripsPanel.jsx and src/auth/PastTripForm.jsx (language list behind the settings line, the accent pills and tile tick in src/styles/25-feature-pages.css, the private Fold and Stepper) and src/components/PassModal.jsx (prices in mono) go to T390.

## 7. Needs a rule

Each line is a proposal carta-design does not cover today, with the rule proposed. T380 accepts or rejects each before anything is built.

R1. Home in the navigation: the landing page is the home of the app; the brand mark (desktop) and the logo (phone) link to it on every screen, and it takes no slot in the nav.

R2. The settings line: one line per priced view shows every input its prices depend on (origin, dates, party, Lifestyle, language, currency as a fixed word), each as `--ui` 13px `--ink-soft` with the value in `--ink`, figures such as dates and party size in `--mono`; each part is a `--tap` button that opens the control that sets it; no accent; it never wraps to more than one line on a phone and drops parts from the left, keeping Lifestyle.

R3. Badges on navigation: a count is `--mono` 11px in `--ink` on `--paper-dim`, `999px` radius, set after the label, never in `--accent`; a state dot (plan in progress) is 6px `--ink-fill`, with an aria-label on the item that says what it means. No badge on a tab whose content has nothing new.

R4. The active section: on both widths the section showing is an `--ink-fill` pill with `--on-fill` text and icon (the desktop state today), never `--accent`, matching the sticky rail's in-view rule; aria-current="page" on it.

R5. Section change motion: changing tabs fades the new content in and moves it up 8px with a transform, one duration token, no motion on the outgoing tab, nothing under reduced motion; the active marker may slide between items with a transform.

R6. The bottom slot: transient messages (toasts, the site notice, the pass expiry banner) stack in one slot above the bottom nav on a phone and bottom centre on desktop, newest on top, at most three, each with a `--tap` close, never over the bottom nav and never over a sheet's primary action.

R7. One close control: every dismissible surface (dialog, sheet, panel, toast, banner) closes with CloseIcon at 16px in a `--tap` box, top right (inline right on a toast), transparent ground and `--ink-soft` glyph, translated label "Close"; no letter "x".

R8. Selected tiles and chips: a selected tile or chip in a settings dialog is `--ink-fill` with `--on-fill` text, the same as an active toggle; `--accent` is not a selection colour (today the Lifestyle tiles use it).

R9. Navigation is a link and leaves history: every element that changes the view (tabs, the brand, a card that opens a page, a breadcrumb or back) is an `<a href>` with the view's URL, a section change pushes one history entry, and the browser Back button returns to the previous section; `<button>` is for actions that change state. carta-design names real links under the quality floor but not how a single-page app satisfies it.

R11. Decorative accent marks: no accent tick, stripe or dot on a control that is not selected or acting; the small accent tick on every category tile (destinations and My trips) and the accent side stripe on `.hostel-note` are removed, so that an accent mark always means "this one".

R10. Dialog family: the visual rules of the modal dialog (one radius, `--shadow-2`, the R7 close, the scrim already ruled) and the rule that a choice of two items opened from the bottom nav is a menu, not a dialog.

## Direction check (T380, V2)

What `docs/design-v6/DIRECTION.md` changes in this plan. All eleven rules R1 to R11 are accepted; the table in DIRECTION.md part 9 names the house rule each became. Three things move. The Lifestyle door in the settings line (V3-3) is secondary chrome with no `--accent-bg` tint (accent marks rule), so item V4-1's "only accent fill gone" includes it. The count beside My trips (V3-9) and the plan-in-progress dot (V3-8) follow the count chip rule as written in R3; the account brief's `--rule` outline chip was folded into it. The section-change motion (V4-3) and the shell's other transitions (V4-2) take `--dur-2` and `--dur-3` with `--ease-out` from `01-tokens.css`, never a literal, and the overshoot on the price pill (`14-filters-panels.css`, shell-owned) goes in V4-2. The in-place figure (V4-4) is `settleFigure()` in `src/lib/figureChange.js`; the shell triggers it from the settings line and each surface applies it. OWNERSHIP.md gives the shell every shared component named in part 5b plus MonthStrip, FilterChips, SectionRail, DayTrack, FlashDeck, CostBar, ReportProblem and the shared helpers in `src/lib/`; the i18n prefixes are the ones listed there (`settings.*` is new). Phone first (DIRECTION.md part 7) adds to V5-4: `100dvh` on every full-height panel, safe-area insets on the header, the nav and the bottom slot, the nav hiding while an input in a sheet or page has focus, and `@media (hover: hover)` around hover rules.
