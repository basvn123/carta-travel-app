# Surface brief: the landing page and the first run (key `landing`)

Design wave V1, task T371, written 2026-10-07. This is the brief that V3, V4 and V5 build this surface from. It changes no app code. Read it after PRODUCT.md, DESIGN.md, the carta-design skill and `docs/design-v6/TRIP-PLANNING-RESEARCH.md`; from V2 on, `docs/design-v6/DIRECTION.md` and `docs/design-v6/OWNERSHIP.md` sit above it, and where they disagree with this file they win.

App paths are written `src/...` (the app repo); root repo paths are written from the repo root.

## What the surface is

Two things that meet the same visitor in the same first minute.

The landing page is the home page (T209, T194; owner decision 2026-10-07 in T362). It opens for a first visit with no link (`src/lib/homeVisit.js`, `readFirstVisit`) and at `?tab=home`. It is drawn by `src/browse/LandingPage.jsx` with its arithmetic in `src/lib/landing.js` and its styles in `src/styles/39-landing.css`. Above the fold it shows a real receipt for one of three demo towns (Edinburgh, Chamonix, Porto: `DEMO_TOWNS` in `src/lib/landing.js`) with three inputs that reprice it in place. Below the fold: three proof points and the coverage section.

The first-run receipt is the first itemised total a visitor meets on a destination page or a trip page (T099, `docs/FIRST_RUN_RESULT.md`). It is drawn by `src/components/FirstRunReceipt.jsx`, priced by `src/lib/firstRun.js`, fed by `src/lib/firstRunContext.js`, styled by `src/styles/38-first-run.css`. It carries a four-cell input strip (people, stay, arrive, leave), the receipt card, the one primary "Set your dates" while the dates are Carta's, the flight door with its sheet, and the exclusions sentence. The pages that host it (DestinationPage, JourneyPage) belong to other surfaces; this surface owns the component, not where it sits.

## Part 1. Setup and mode

Impeccable context ran once from the root worktree with `--target` set to the app repo's `src/browse/LandingPage.jsx`, written relative to the root worktree. It loaded PRODUCT.md and DESIGN.md, found no surface brief (this file is the first), and reported `MANUAL_DETECTOR_REQUIRED`. Run against the main checkout path it resolved the app repo as the project root and found no PRODUCT.md, because the app repo is its own git tree; later waves should run it from their root worktree as this session did. References read: `reference/critique.md`, `reference/audit.md`, `reference/shape.md`, `reference/operate.md`. Impeccable's interview steps were not run: the owner told every session of this run to proceed without asking (2026-10-07), which is the case impeccable's AUTONOMY_DIRECTIVE_CHECK allows. Every point where impeccable would have asked took the option that keeps Carta's palette, type and identity, and says so where it happens below.

Mode. The landing page is **Persuade**: the visitor is deciding whether to trust Carta and then acts (find a town). It is a tool's landing page, which impeccable classes as Persuade even when the product is a tool. What makes Carta's version unusual is how it persuades: by letting the visitor operate the instrument, not by describing it. So the landing page takes Persuade's goal (earn trust, earn one action) with Operate's discipline inside the demonstration (consistent controls, figures that do not jitter, no decoration that carries nothing). carta-design caps what Persuade may do here: no hero photograph doing the persuading, no stat counters, no gradient, no testimonials.

The first-run receipt is **Operate**: it lives inside the destination and trip pages, the visitor is in a task (is this place affordable for us), and scanability and consistency with every other receipt outrank expression.

## Part 2. The walk, and the before screenshots

Walked on the shared dev server (`http://localhost:5199`, main checkout at app commit `3b3e5a8`) with Playwright at 380x800 and 1280x800, as the hiker in the research would: no destination in mind (59% of travellers start undecided, research section 1), counting money first (value for money leads for 3 in 5, research section 2).

Cold start: site storage cleared, then `/`. The app shows its loading screen (logo, "Carta", "Charting Europe", a pulse; `src/App.jsx` around line 955) until the catalogue arrives, then the landing page. On this laptop's dev server the receipt took about 40 seconds to appear (43.8 s at 380, 40.4 s at 1280). That is a dev build on a machine short of RAM and is not a product figure; it only says the loading screen is a real state that people see.

Returning visit: with `continent.homeSeen.v1` set, `/` opens Destinations on the Trips category. The landing page is not reachable again except by typing `?tab=home`: the brand mark is a button that opens Destinations, and no nav entry exists (by design, `src/lib/homeVisit.js` header; the owner has not yet ruled on it, register row T194-a).

Before screenshots, viewport only, JPEG quality 80, in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\landing\`:

| View | File | What it shows |
|---|---|---|
| home, phone | `V1-home-380.jpg` | Title, lede, town switch, strip, receipt; the receipt's footer line is under the bottom nav and the primary is off screen |
| home, desktop | `V1-home-1280.jpg` | Claim and primary on the left, the demonstration on the right; the left column is empty from about 400 px down |
| proof, phone | `V1-proof-380.jpg` | The three proof points as hairline-divided text, the coverage heading |
| proof, desktop | `V1-proof-1280.jpg` | Three text columns, then the coverage prose; the coverage table had not arrived yet |
| first result, phone | `V1-firstresult-380.jpg` | "Open Edinburgh" from the landing page: the destination page's first-run receipt |
| first result, desktop | `V1-firstresult-1280.jpg` | The same at desktop width, receipt in the right column |
| return, phone | `V1-return-380.jpg` | A return visit: Destinations, Trips category |
| return, desktop | `V1-return-1280.jpg` | The same at desktop width |

Measured on the walk (Playwright, `getBoundingClientRect`, against the rendered page):

| Measure | 380x800 | 1280x800 |
|---|---|---|
| Horizontal scroll | none | none |
| Visible `h1` | 1 (the Explore tab's `h1` is in the DOM but inside a hidden kept-alive tab) | 1 |
| Landing scroll height | 1,992 px | 1,314 px |
| Bottom edge of the receipt footer line | 726 px, under the bottom nav (its top is at 714 px) | 594 px |
| Top of the one primary, "Find a town to walk from" | 973 px into the page, below the fold | 343 px, in the first viewport |
| Height of the three select controls | 32 px (inside a 58 px label cell) | 32 px |
| Coverage table | arrives after the first screenful; at 20 s it was there | same |

The reprice works: switching Edinburgh to Chamonix moved the total from ~ €2,556.58 to ~ €1,708.04 in place. Picking "Dorm bed" in Chamonix changed nothing and the stay line said "No dorm bed measured here, entire place shown": honest, but the control offered a choice that does not exist there.

## Part 3. Inventory

Every view, state, control and visual setting on the surface. Line numbers are the main checkout at app commit `3b3e5a8`. Verdicts: keep, move, merge, remove, rework.

### Views and states

| Item | What it does | Where | Drawn by | Verdict |
|---|---|---|---|---|
| Loading screen | Logo, name, tagline, pulse until the catalogue loads | Full screen, before the app | `src/App.jsx` ~955 (shell) | Rework in V4: a receipt-shaped skeleton for a first visit is the landing's own; the shared screen stays the shell's |
| Load error screen | "Retry" primary and one help line | Full screen | `src/App.jsx` ~943 (shell) | Keep (shell surface) |
| Landing, first visit | Opens on a first visit with no link | Main area | `App.jsx` 320, `homeVisit.js` | Keep |
| Landing at `?tab=home` | The same page from a link | Main area | `App.jsx` 318 | Keep |
| Return visit | Opens Destinations; landing unreachable without the URL | Main area | `App.jsx` 320 | Rework only after the owner rules on T194-a |
| Landing without a priceable demo town | The demonstration is left out; title, lede and primary remain | Hero | `LandingPage.jsx` 152 | Rework in V5: a skeleton then a one-line reason, never a bare hero |
| Coverage load failure | The table is left out, the sentences stand | Coverage section | `LandingPage.jsx` 84 to 91 | Keep |
| Coverage loading | Nothing shows until `coverage.json` arrives (675,717 bytes on the dev server) | Coverage section | `LandingPage.jsx` 84 | Rework in V5: load when the section nears the viewport |
| Tier fallback on the landing receipt | Stay line says which tier stands in | Receipt stay line | `LandingPage.jsx` 100 to 112 | Keep the words; rework the control (see the Stay select) |
| First-run receipt, first run | Orientation line, full provenance rows | Destination and trip pages | `FirstRunReceipt.jsx` 358 to 364, 306 to 334 | Rework the orientation copy (see Part 4, issue 2) |
| First-run receipt, later runs | One short fact per line | Same | `FirstRunReceipt.jsx` 318, 332 | Keep; the full provenance goes behind the InfoDot (register row T099-e) |
| First-run receipt, dates are the visitor's | No primary; footer names a later week | Same | `FirstRunReceipt.jsx` 241, `firstRun.js` `receiptFooter` | Keep |
| First-run receipt, typed fare | A "Your flight" line first, title "{city} from {origin}" | Same | `FirstRunReceipt.jsx` 254, 412 | Keep |
| First-run receipt, nothing to price | Renders nothing; the host page shows what it showed before | Same | `FirstRunReceipt.jsx` 245 | Keep |
| Odd party in a double room | "N people book M rooms" foot line | Receipt foot | `FirstRunReceipt.jsx` 442 | Keep |

### Controls

| Control | What it does | Where | Drawn by | Verdict |
|---|---|---|---|---|
| Town toggles, Edinburgh, Chamonix, Porto | Switch the demonstrated town; `aria-pressed`, `--ink-fill` when on | Above the strip, one row of three | `LandingPage.jsx` 154 to 169, `.lp-town` | Rework: say what each town's receipt shows (measured, national, all measured); V4 photo version needs rule R2 |
| People select (1 to 6) | Party size for the demo | Strip cell 1 | `LandingPage.jsx` 172 to 177 | Rework: write the app's shared `group_size`, 44 px hit area |
| Nights select (2 to 14) | Length for the demo | Strip cell 2 | `LandingPage.jsx` 178 to 183 | Rework: write the shared trip dates (from the default start), 44 px hit area |
| Stay select (six tiers) | Stay tier for the demo | Strip cell 3 | `LandingPage.jsx` 184 to 190 | Rework: write the shared `stay_tier`; mark tiers not measured in the selected town |
| Receipt card | Itemised total, stay and food lines, sum, alternative | Under the strip | `LandingPage.jsx` 192 to 229 | Merge with the first-run receipt's card into one presentational component (register row T209-a) |
| Receipt footer line | "4 nights instead: ~ €1,607.70 in total." | Receipt foot, `--accent-bg` | `LandingPage.jsx` 228 | Keep; move above the phone fold |
| Orientation note | Says Carta picked the dates | Under the receipt | `LandingPage.jsx` 231 | Merge into the receipt sub line as one sentence, the way the first-run receipt does it |
| Flight note | Carta does not price flights | Under the receipt | `LandingPage.jsx` 232 | Merge: one sentence and one key shared with the first-run receipt |
| Exclusions note | What the total leaves out | Under the receipt | `LandingPage.jsx` 233 | Merge: one key shared with the first-run receipt (today `landing.notIn` and `receipt.notIn` list different things) |
| "Open {city}" secondary | Opens the town's destination page | Under the three notes | `LandingPage.jsx` 234 to 238 | Move: into the receipt, under the sum, as the receipt's own way through |
| "Find a town to walk from" primary | Opens Destinations on its walks | Phone: after the demo; desktop: left column under the lede | `LandingPage.jsx` 242 to 244 | Keep the one primary; move above the phone fold; DOM order to match the visual order on desktop |
| Proof points (three) | Three claims with an h3 each | Below the hero | `LandingPage.jsx` 247 to 257 | Rework in V4: each claim shows a live specimen from the receipt above it |
| Coverage sentences | Places, measured beds, measured food | Coverage section | `LandingPage.jsx` 259 to 266 | Keep; lift one of them into the hero as the running-instrument line |
| Coverage table | Per layer: published, listed, regions with none | Coverage section | `LandingPage.jsx` 267 to 291 | Keep; V4 visual needs rule R4 |
| Coverage key and trade sentence | How to read the table; no booking, no commission | Coverage section | `LandingPage.jsx` 292 to 293 | Keep |
| "See where every number comes from" link | Opens `/about/numbers` | Last line | `LandingPage.jsx` 294 | Keep |
| First-run strip: People, Stay, Arrive, Leave | Shared inputs; write app state | Above the first-run receipt | `FirstRunReceipt.jsx` 368 to 407 | Keep; align its label style with the landing strip (one of the two is wrong today: mono labels here, `--ui` labels on the landing) |
| "Set your dates" primary | Focuses and opens the Arrive date | Under the first-run card | `FirstRunReceipt.jsx` 450 to 452 | Keep |
| "Add your fare" or "Change your fare" secondary | Opens the "Your flight" sheet | Under the primary | `FirstRunReceipt.jsx` 454 to 463 | Keep |
| "Your flight" sheet | Airport picker, airline, amount paid, two dates; Save, Remove, close | Modal with scrim | `FirstRunReceipt.jsx` 75 to 167 | Keep; V5 replaces the literal scrim colour with a token expression |
| Sheet close button | Closes the sheet; focus target on open | Sheet head | `FirstRunReceipt.jsx` 103 | Keep |
| Sheet Save primary, Remove secondary | Store or forget the typed fare | Sheet foot | `FirstRunReceipt.jsx` 158 to 161 | Keep |

### Visual settings

| Setting | Value today | Drawn by | Verdict |
|---|---|---|---|
| Title | `--display`, 600, `clamp(30px, 7.4vw, 52px)`, two lines on a phone | `39-landing.css` `.lp-title` | Rework (fold budget on a phone) |
| Lede | 15 px phone, 18 px from 900 px, `--ink-soft` | `.lp-lede` | Keep; shorten if the fold needs it |
| Hero grid | One column; two from 900 px, demo 520 px wide | `.lp-hero` | Rework: fill the desktop left column |
| Receipt card | `--bg-card`, `--rule`, 10 px radius, `--paper-dim` head, 2 px `--ink` sum rule | `.lp-receipt`, `.frr-card` | Merge the two definitions |
| Sum figure | Landing `clamp(24px, 7vw, 34px)`; first run 34 px, 30 px under 420 px | `.lp-sum-fig`, `.frr-sum-eur` | Merge |
| Estimate marking | Landing: tilde only, "est." for screen readers; first run: tilde plus a visible "est." | `LandingPage.jsx` `Figure`, `FirstRunReceipt.jsx` `Figure` | Rework: the visible "est." everywhere (PRODUCT.md, "prefixed with a tilde, tagged est.") |
| Reprice motion | First run: 200 ms opacity settle on figures; landing: none | `38-first-run.css` `frr-reprice` | Merge: one motion on both, from T380's motion tokens |
| Strip labels | Landing `--ui` 12 px; first run `--mono` 11 px | `.lp-field-label`, `.frr-cell-label` | Merge to `--ui`: a label is not a measured fact (the mono rule) |
| Scrim | `rgba(15, 23, 42, 0.28)` literal | `38-first-run.css` `.frr-scrim` | Rework in V5 (a token expression, as DESIGN.md describes the scrim) |
| Off-scale sizes | 12.5 px sub lines, 10 px paddings, 6 px gaps | `39-landing.css` | Rework in V5 onto `--space-*` |

Totals: 15 views and states, 23 controls (counting the three town toggles and the four first-run strip cells once each as a group), 10 visual settings.

## Part 4. Critique and audit

DEGRADED: single-context (the walk, the detector and the design review ran in this one session, so only one browser was open on a laptop short of RAM; the detector found nothing, so it could not anchor the review). Questions skipped: unattended run, the owner told every session to proceed without asking (2026-10-07). The snapshot was not persisted to `.impeccable/critique/`; this brief is the archive.

### Design specificity

Authored for Carta, not interchangeable. The hero demonstrates with a real receipt for a real town, figures to the cent with their provenance in words, and the coverage section states where Carta is thin in numbers. No template would say "The other 2,868 use their country's figure and say so". The detector agrees: `impeccable detect --json` over `src/browse/LandingPage.jsx` and `src/components/FirstRunReceipt.jsx` returned an empty list (exit 0). The design lint is at 213 of 213 baseline violations, none of them in the landing or first-run files.

What holds it back is that it demonstrates one thing well and then stops. The page proves the receipt; it does not yet help the undecided visitor find a place, and below the hero it turns into text.

### Heuristic scores

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | The sum reprices in place with `aria-live`; the coverage table appears late with no placeholder |
| 2 | Match with the real world | 3 | The receipt is a familiar object; "national basket" and "entire place" need the glossary |
| 3 | User control and freedom | 2 | Inputs set on the landing are lost on the next tap; no way back to the home page once left |
| 4 | Consistency and standards | 2 | Two receipts that should be one: different "est." marking, a tilde missing on "each" in one, two flight sentences, two exclusion lists, two label styles |
| 5 | Error prevention | 2 | The Stay select offers tiers the town has not measured, then falls back |
| 6 | Recognition rather than recall | 3 | Inputs and defaults are on screen and labelled |
| 7 | Flexibility and efficiency | 2 | Three towns only; no way to price your own town or month from the first screen |
| 8 | Aesthetic and minimalist design | 3 | Calm and on-brand; three stacked notes and an empty desktop column dilute the hero |
| 9 | Error recovery | 3 | Fallbacks are explained in words; load error has a retry |
| 10 | Help and documentation | 2 | No InfoDot on measured, estimate or national figure; the proof section carries the explanation instead |
| | Total | 25/40 | Acceptable |

Cognitive load: two failures of eight (working memory, because the landing's inputs do not travel; minimal choices, because the Stay select offers six tiers where some are not real for the town). Moderate.

Emotional journey: the peak is the reprice, when the visitor changes a number and the total moves in place. The valley is the next tap: "Find a town to walk from" or "Open Edinburgh" and the inputs they set a moment ago are gone, so the instrument they trusted a second ago forgets them.

### Priority issues

1. [P1] The landing page's inputs do not carry. People, nights and stay are local state in `LandingPage.jsx` (lines 70 to 74). The first-run receipt writes the app's shared choices (`FirstRunReceipt.jsx` 276 to 284). Set one person and a dorm bed on the landing page, press "Open Porto", and the destination page prices two people in an entire place. That is a second truth on two adjacent screens, which PRODUCT.md rules out ("no two screens can disagree"). Fix: the landing strip reads and writes the same context the first-run receipt does. Command: `$impeccable onboard`.

2. [P1] Two honesty slips in the first-run receipt. The orientation line says "Priced for 2 people and 7 nights at Edinburgh's own rates" (`receipt.orientDefault`, rendered at `FirstRunReceipt.jsx` 362) while the food line on the same receipt is the national basket, an estimate. And the per-person line drops the tilde: `receipt.each` is passed `eurExact(receipt.each)` with no estimate mark (`FirstRunReceipt.jsx` 437), so "€1,278.29 each" reads as measured under a total marked "~ ... est." (seen in `V1-firstresult-380.jpg`; the landing page gets it right). Fix: an orientation sentence chosen by the receipt's levels, and the tilde on "each". Command: `$impeccable clarify`.

3. [P1] On a phone the first screen ends mid-receipt. At 380x800 the receipt's footer line ends at 726 px, under the bottom nav (714 px), and the one primary starts at 973 px. The visitor sees the claim and most of the demonstration but not the action or the "what one change would do" line. Fix: tighten the hero on a phone (title size, lede length, the towns label) and put the primary directly under the receipt, ahead of the notes. Command: `$impeccable layout` then `$impeccable adapt`.

4. [P2] Two receipts that should be one. The landing draws its own receipt beside `FirstRunReceipt` (register row T209-a), and they have drifted: estimate marking, the "each" tilde, the label style of the strip, the sum size, the flight sentence (`landing.noFlight` against `trip.flightNotPriced`) and the exclusions (`landing.notIn` names getting there and getting around; `receipt.notIn` names local transport and "anything you buy there"). Fix: one presentational receipt card both render. Command: `$impeccable extract`.

5. [P2] The undecided visitor gets three towns. The research's first finding for this page is that 59% start without a destination, and its first recommendation is a live list of places with their day cost under one input row. Today the only way forward is the primary, which leaves for another tab. Fix in V3, subject to rule R1: a short list of the cheapest towns to walk from for the current inputs, priced from the cost index the app already holds. Command: `$impeccable shape` (done here) then `$impeccable layout`.

### Persona red flags

Jordan, first-timer: "Entire place", "national basket" and "est." are unexplained on the first screen; the glossary dot exists (`src/components/InfoDot.jsx`) but the glossary has no entry for any of the three (`src/lib/glossary.js`).

Casey, phone, one hand: the primary is 260 px below the fold; the three selects are 32 px tall, under the 44 px floor, inside larger label cells that do not open them on every browser.

Riley, stress tester: picks "Dorm bed" in Chamonix and the total does not move; sets one person, opens Porto and finds two; reaches `/` again and cannot get back to the page they started on.

The hiker counting money (from PRODUCT.md): wants to know where they can walk for least; the page shows what Edinburgh costs and sends them to a grid of trip styles on the next tap if they choose the wrong door.

### Minor observations

The desktop tab order runs town toggles, selects, "Open Edinburgh", then the primary, while the primary sits above and left of the demonstration (WCAG 2.4.3 focus order). The coverage table is fetched on every first visit whether or not the visitor scrolls to it. The phone's "Get a pass" chip in the top bar is accent-washed and 38 px tall (`src/styles/10-shell.css` 302 to 311), against the secondary chrome rule; it belongs to the shell surface and is raised there (register row T371-e). The first-run footer says "Set your dates to reprice" directly above a primary that says "Set your dates".

### Technical audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Visible focus on every control, labelled selects, `aria-live` on the sum, focus trap and Escape on the sheet; the 32 px selects and the desktop focus order are the gaps |
| 2 | Performance | 2 | Client-rendered: nothing of the page exists until the catalogue loads (register row T209-c); `coverage.json` (675,717 bytes) loads on every first visit |
| 3 | Responsive | 3 | No horizontal scroll at 380 or 1280; the phone fold cuts the receipt and hides the primary |
| 4 | Theming | 3 | Tokens throughout; one literal scrim colour in `38-first-run.css`, off-scale 12.5 px and 10 px values in `39-landing.css` |
| 5 | Implementation integrity | 3 | Detector clean; two receipt implementations drifting apart |
| | Total | 14/20 | Good |

Harnesses. The three harnesses the wave prompt names for this surface do not test it. `scripts/verify_receipt.mjs` checks the planner receipt's Bag check, ground-link notes and expense ledger through a `#trip=` hash, on a `vite preview` of a build at port 4191. `scripts/verify_trip_landing.mjs` checks the trip planner's opening step; run from a scratch copy against the shared dev server it timed out before its first check, because it waits 3 s after load and the dev server needed about 40 s. `scripts/verify_prerender.mjs` checks a prerender build directory. None was run against a build in this session, because V1 builds nothing. The unit tests that do cover this surface pass: `node --test tests/landing.test.mjs tests/firstRun.test.mjs tests/homeVisit.test.mjs`, 25 of 25. V3 adds `scripts/verify_landing.mjs` (plan V3 item 12).

## Part 5. The traveller's job here

From the research (section "Landing and home", sections 1, 2 and 4) and PRODUCT.md, a visitor on this surface needs three things in this order.

First, what a day costs, with its pedigree, for inputs they can change. The page does this well: the receipt is above the fold on desktop and nearly so on a phone, every line says where it came from, and the total moves in place. Value for money is the first reason Europeans give for choosing a place (research section 2), and showing the whole cost up front is what earns trust (section 4, the StubHub and Airbnb findings).

Second, where they could go: the undecided majority needs places, not one place. The page offers three fixed towns and then a door to another tab. This is the biggest gap. The research puts it plainly: "the first screen is one input row and a live list of places with their day cost".

Third, why to believe it: the running instrument rather than claims. The page has the right material (measured beds in 1,000 of 3,868 places, food in 381, the coverage table) but holds it below the fold in prose. The research's pattern is one line in the hero: "Bed prices measured in N of M destinations", read from the data, with the catalogue's date.

Missing today: the month (weather and crowds now shape when 74% go, research section 2), and a way to price a place of their own choosing from the first screen. The month is a later-wave question for this surface; the first-run receipt already takes real dates on the destination page.

In the wrong place: the three notes sit between the receipt and the action on a phone; "Open {city}" sits below them, far from the receipt it opens; the proof points describe the receipt instead of pointing at it.

What sends them away: the primary sends them to Destinations (by design), and their inputs do not go with them. "Open {city}" sends them to a destination page where the receipt starts again from the app's defaults. A return visit can never come back here (T194-a, owner).

## Part 6. The plan (impeccable shape)

Planning step, written in planning mode before any build. Shape's discovery interview was not run (unattended, owner instruction); its questions are answered from PRODUCT.md, the research and the walk, and the assumptions are marked.

Job and audience: a first-time visitor, most often on a phone, most often without a destination, who counts money and who the launch addresses as a hiker. Outcome: they see a true day cost they can change, they find a place worth opening, and their inputs travel with them. Direction: refinement inside Carta's world (impeccable's "Refinement preserves"); no new palette, type or identity. The focal moment stays the reprice. Anti-goals: no hero photograph doing the persuading, no stat counters, no testimonials, no second primary, no modal on the first run, no change to which visits open on this page (that is T194-a, the owner's).

Assumption, marked: the shared trip dates are the right home for the landing page's nights (start stays Carta's default, the end moves). If T380 rules the landing page should not touch the app's dates, nights stays local and the landing hands its value to the destination page on "Open {city}" instead.

### V3: structure, information and flow

1. One set of inputs. The landing strip reads and writes the app's shared choices through `useFirstRun()` (people to `group_size`, stay to `stay_tier`, nights to the return date from the default start). Files: `src/browse/LandingPage.jsx`, `src/lib/landing.js`, `src/lib/firstRunContext.js` (read only unless the context needs a setter it lacks). Command: `$impeccable onboard`. Done when: set one person and a dorm bed on the landing page, open Porto, and the destination page's receipt prices one person in a dorm bed (`verify_landing.mjs` asserts it).

2. One receipt card (register row T209-a). Extract the card (head, lines, sum, foot) into `src/components/ReceiptCard.jsx`; `LandingPage.jsx` and `FirstRunReceipt.jsx` both render it and keep their own strip, primary and flight door. The "est." tag shows on both; the strip labels are `--ui` on both. Files: `src/components/ReceiptCard.jsx` (new), `src/components/FirstRunReceipt.jsx`, `src/browse/LandingPage.jsx`, `src/styles/38-first-run.css`, `src/styles/39-landing.css`, `src/styles/61-v6-landing.css`. Command: `$impeccable extract`. Done when: one card definition in CSS, the two pages render identical card markup for the same town and inputs, `tests/landing.test.mjs` and `tests/firstRun.test.mjs` pass.

3. Honest orientation and "each". The orientation line names the levels it has ("at Edinburgh's measured bed rate, with the national food basket" when mixed; "at the national figures for Chamonix" when none is measured); the per-person line keeps the tilde when the total is an estimate. Files: `src/components/FirstRunReceipt.jsx`, `src/lib/firstRun.js` (a pure helper that names the mix, with a test), six `src/i18n/*.js`. Command: `$impeccable clarify`. Done when: Edinburgh, Chamonix and Porto each show the right sentence and no estimate figure appears without its tilde (unit test plus harness).

4. One flight sentence, one exclusions sentence. The landing and the first-run receipt use the same keys; the exclusions list is the true one from the engine (stay and food are priced; local transport, getting there, entry tickets and insurance are not). Retire `landing.noFlight` and `landing.notIn` once nothing reads them. Files: `LandingPage.jsx`, `FirstRunReceipt.jsx`, six `src/i18n/*.js`. Command: `$impeccable clarify`. Done when: grep finds each retired key nowhere in `src/`, and both pages print the same two sentences.

5. The phone fold. At 380x800 a cold visitor sees the title, the strip, the receipt sum, the receipt's footer line and the primary without scrolling. Levers, in order: the primary directly under the receipt and ahead of the notes; the orientation note folded into the receipt's sub line; a smaller phone title step; a one-sentence lede. If the levers cannot meet it, rule R5 (a sticky phone primary) is the fallback and only once T380 accepts it. Files: `LandingPage.jsx`, `src/styles/61-v6-landing.css`. Command: `$impeccable layout`, `$impeccable adapt`. Done when: `verify_landing.mjs` at 380x800 finds the primary's bottom edge above the bottom nav's top edge on a cold load.

6. "Open {city}" belongs to the receipt. Move it into the card under the sum as a secondary that names the destination ("Open Edinburgh"), keeping one primary in the view. Files: `LandingPage.jsx`, `ReceiptCard.jsx` (a slot for a trailing action). Command: `$impeccable layout`. Done when: the secondary sits inside the receipt card at both widths.

7. Say what each demo town shows. Under each town toggle, one short line: "Bed measured", "National figures", "All measured", read from the town's levels rather than typed per town. Files: `LandingPage.jsx`, `src/lib/landing.js` (a pure level summary with a test), six `src/i18n/*.js`. Needs rule R7 (a toggle with a metadata line). Command: `$impeccable clarify`. Done when: the three lines match the three receipts' provenance rows.

8. No false choices in the Stay select. A tier the selected town has not measured is labelled "not measured here" in the option text (the existing fallback stays, and the stay line keeps saying so). Files: `LandingPage.jsx`, `src/lib/landing.js`. Command: `$impeccable harden`. Done when: in Chamonix every tier but the entire place carries the label.

9. The running instrument in the hero. One line under the lede, read from the data: measured beds in N of M places, measured food in F, and the catalogue's date from `meta.generated_at`. No new count is typed. Files: `LandingPage.jsx`, `src/lib/landing.js` (`catalogueFacts` already has the counts), six `src/i18n/*.js`. Command: `$impeccable clarify`. Done when: the line's figures equal the coverage section's figures on the same render.

10. A place for the undecided (rule R1 first). Under the receipt on a phone and in the desktop left column under the primary: the five cheapest towns to walk from for the current inputs, per person per day, each row a link to the town's page, with the provenance word on the figure and the tilde on an estimate. Priced from the cost index the app already holds (`FirstRunContext` carries `indices`), so it agrees with Explore to the cent. Files: `LandingPage.jsx`, `src/lib/landing.js` (pure ranking with a test), six `src/i18n/*.js`. Command: `$impeccable layout`. Done when: the five figures equal the Explore card figures for the same towns and inputs, and the list re-ranks when people or stay change.

11. Desktop composition and focus order. The left column carries claim, instrument line, primary and the list from item 10, so it has no empty band; DOM order equals reading order at every width (WCAG 1.3.2, 2.4.3). Files: `LandingPage.jsx`, `src/styles/61-v6-landing.css`. Command: `$impeccable layout`. Done when: at 1280x800 no column has an empty band taller than 120 px in the first viewport, and the Tab order follows top to bottom, left to right.

12. A harness for this surface. `scripts/verify_landing.mjs` at 380x800 and 1280x800: a cleared-storage first visit opens the landing page; one visible `h1`; one primary; no horizontal scroll; the receipt lines sum to the total to the cent; inputs carry to the destination page; the phone fold check from item 5; a return visit opens Destinations; the coverage table renders or is cleanly absent. It waits for `.lp-sum-fig` rather than a fixed delay, so a slow dev server does not fail it. Files: `scripts/verify_landing.mjs` (new). Command: `$impeccable audit`. Done when: it passes on the V3 branch.

13. Reconcile the onboarding document (register row T194-d). `docs/ONBOARDING_AND_EMPTY_STATES.md` Part 1 still says the app opens on Destinations; rewrite the first ninety seconds around the home page as built. Root repo file. Command: `$impeccable document`. Done when: the document describes the first visit, the return visit and the home page as the app does them.

Not in V3: any change to which visits open on the landing page, the brand mark or a nav entry. Those wait for the owner (register row T194-a). The demo towns stay as they are until the owner answers register row T209-e.

### V4: visual and dynamic, inside the palette

1. One reprice motion. Figures settle with the first-run receipt's opacity change on both pages (through `ReceiptCard`), durations and easing from T380's motion tokens, `transform` and `opacity` only, a `prefers-reduced-motion` branch that sets it to none. No counting up: numbers do not jitter (PRODUCT.md). Files: `src/styles/61-v6-landing.css`, `src/styles/38-first-run.css`. Command: `$impeccable animate`. Done when: one keyframe definition serves both, and the reduced-motion branch is present.

2. The cost bar above the receipt lines. Reuse `src/browse/CostBar.jsx` (rule exists, T362): one segment per receipt line in receipt order, the ink ramp, no accent, no legend. It shows at a glance how bed and food split, and it moves when the stay changes. Files: `ReceiptCard.jsx`, `src/styles/61-v6-landing.css`. Command: `$impeccable bolder` with `reference/visualize.md`. Done when: segments match the lines' order and proportions and the bar redraws on reprice.

3. Proof points that point. Each of the three proof points shows a live specimen from the receipt above it, set as a receipt line: the stay line's provenance row for "It names its source", the food line with its tilde and "est." for "It marks what is estimated", and the total for "It stays the same on every screen" beside the same town's Explore figure. Needs rule R8. Files: `LandingPage.jsx`, `src/styles/61-v6-landing.css`. Command: `$impeccable bolder`. Done when: every specimen is read from the current receipt, never typed.

4. The town picker as places, not words (rule R2 first). Each toggle carries the town's own photograph from the wire with its credit, the name under the photo, never over it. Files: `LandingPage.jsx`, `src/lib/landing.js`, `src/styles/61-v6-landing.css`. Command: `$impeccable bolder`. Done when: three licensed photos with credits, the pressed state still reads in greyscale, and the photos do not become the page's largest contentful paint (measure before and after).

5. Landing to town page as one motion (rule R3 first). "Open {city}" carries the receipt into the destination page's receipt through `src/lib/sharedElement.js`, so the visitor sees the same total arrive on the page. Files: `LandingPage.jsx`, `ReceiptCard.jsx`, `src/lib/sharedElement.js` (a named element that is not an image). Command: `$impeccable animate`. Done when: the transition runs where View Transitions exist, falls back to the plain open elsewhere and under reduced motion.

6. Type for the fold and the hierarchy. The phone title step that item V3.5 chose, set properly: `--display` 600, balanced lines; the sum in `--mono` at one size on both receipts; strip labels in `--ui`. Files: `src/styles/61-v6-landing.css`. Command: `$impeccable typeset`. Done when: one sum size, no mono label, no off-scale font size on the surface.

7. Coverage as a picture (rule R4 first). Each row of the coverage table carries a thin bar of published and listed against the regions where the layer applies, in the ink ramp, the numbers still in their cells. Files: `LandingPage.jsx`, `src/styles/61-v6-landing.css`. Command: `$impeccable bolder` with `reference/visualize.md`. Done when: the bars equal the cells, and the table reads the same with the bars removed.

8. Touch and hover feedback. Town toggles and strip cells use the shared touch feedback already in the product; strip cells take a `--paper-dim` hover; the receipt's secondary takes the Button component's states. Files: `src/styles/61-v6-landing.css`. Command: `$impeccable delight`. Done when: every control on the surface shows hover, focus, active and disabled where it can be disabled.

9. A receipt-shaped loading state. While the catalogue is partial on a first visit, the hero shows the strip and a receipt skeleton in `--paper-dim` lines, so the page has its shape before its figures (the detail skeleton already sets the pattern). Files: `LandingPage.jsx`, `src/styles/61-v6-landing.css`. Command: `$impeccable delight`. Done when: a throttled first visit shows the skeleton, then the receipt, with no layout shift of the primary.

### V5: harden, adapt and polish

1. Touch targets. The three strip selects fill their 58 px cell, so the hit area is at least 44 px; the 32 px compact size applies only under `pointer: fine` (DESIGN.md). Files: `src/styles/61-v6-landing.css`. Command: `$impeccable adapt`. Done when: every control on the surface measures at least 44 by 44 on a coarse pointer.

2. Long words and narrow screens. German, French and Dutch at 360 px: the title, the town toggles with their metadata line, the strip labels, the receipt lines and the list from V3.10 hold without truncation or horizontal scroll. Files: `src/styles/61-v6-landing.css`, six `src/i18n/*.js` if a string must shorten. Command: `$impeccable harden`. Done when: Playwright at 360x800 in six languages finds no overflow.

3. Edge cases. No demo town priceable; one person (no "each" line); 14 nights; a tier fallback; a typed fare on the first-run receipt; coverage that fails; a catalogue that is still partial. Each renders a sentence, never a hole. Files: `LandingPage.jsx`, `src/lib/landing.js`, `tests/landing.test.mjs`. Command: `$impeccable harden`. Done when: a unit test per case and `verify_landing.mjs` passes with each forced.

4. Load what is seen. `coverage.json` loads when the coverage section nears the viewport, not on first paint. Files: `LandingPage.jsx`. Command: `$impeccable optimize`. Done when: a first visit that does not scroll makes no request for `coverage.json` (network log in the harness), and the table still appears when scrolled to.

5. Tokens only. The scrim in `38-first-run.css` becomes a token expression; the 12.5 px, 10 px and 6 px literals in `39-landing.css` move to the type and `--space-*` scales or are retired with the merge. Files: `src/styles/38-first-run.css`, `src/styles/39-landing.css`, `src/styles/61-v6-landing.css`. Command: `$impeccable polish`. Done when: `node scripts/ci/design-lint.mjs` reports 0 new violations and grep finds no `rgba(` in the two files.

6. Prerendered home (register row T209-c), only if V5 has room: the hero sentence, the instrument line and the coverage section written into the prerender build the way `/about/numbers` is, so crawlers and share previews see the page. Files: `scripts/prerender/pages.mjs`, `scripts/prerender/html.mjs`. Command: `$impeccable optimize`. Done when: `verify_prerender.mjs` passes on a prerender build with the home page in it. If V5 has no room, the row stays open.

7. The finish. Run `impeccable detect --json` on every changed file, `node scripts/ci/design-lint.mjs` (0 new), `npm run lint` (0 errors), `npm test`, `scripts/verify_landing.mjs`, `scripts/verify_keyboard.mjs` (20 of 20), `scripts/verify_quality_floor.mjs`; answer carta-design's seven questions; save the "after" screenshots under the same eight view names. Command: `$impeccable polish`. Done when: all of that passes and the eight after shots exist.

### Target state of every button and control

| Control | Today | After V5 |
|---|---|---|
| Town toggles (three) | Name only, `--ink-fill` when pressed | Name and one provenance line (R7); photograph above the name if R2 is accepted; 44 px or more |
| People | Local state, 32 px select | Shared `group_size`; full-cell hit area |
| Nights | Local state, 32 px select | Shared trip length from the default start; full-cell hit area |
| Stay | Local state; unmeasured tiers offered silently | Shared `stay_tier`; unmeasured tiers labelled "not measured here" |
| Receipt card | Landing's own markup | `ReceiptCard`, shared with the first-run receipt, with the cost bar |
| Receipt footer line | Under the phone fold | Above the phone fold |
| Orientation, flight and exclusions notes | Three paragraphs, two of them worded differently from the first-run receipt | Orientation in the receipt's sub line; flight and exclusions sentences shared with the first-run receipt |
| "Open {city}" | Secondary under the notes | Secondary inside the receipt card; shared-element open if R3 is accepted |
| "Find a town to walk from" | The one primary, below the phone fold | The one primary, above the phone fold, in reading order |
| Cheapest towns list | Does not exist | Five priced rows, each a link (R1) |
| Instrument line | Does not exist | One line under the lede, from the data |
| Proof points | Three text blocks | Three claims, each with a live specimen (R8) |
| Coverage table | Numbers only, appears late, fetched on paint | Numbers with bars (R4), fetched near the viewport |
| "See where every number comes from" | Link | Link, unchanged |
| First-run strip (four cells) | Mono labels | `--ui` labels, full-cell hit areas |
| "Set your dates" | The one primary while dates are Carta's | Unchanged |
| "Add your fare" or "Change your fare" | Secondary | Unchanged |
| "Your flight" sheet and its Save, Remove, close | Modal with a literal scrim colour | Unchanged behaviour; scrim from tokens |

### Files the build waves will touch

App repo: `src/browse/LandingPage.jsx`, `src/lib/landing.js`, `src/components/FirstRunReceipt.jsx`, `src/lib/firstRun.js`, `src/lib/firstRunContext.js`, `src/components/ReceiptCard.jsx` (new), `src/styles/38-first-run.css`, `src/styles/39-landing.css`, `src/styles/61-v6-landing.css` (created by T380), `src/i18n/en.js`, `src/i18n/de.js`, `src/i18n/es.js`, `src/i18n/fr.js`, `src/i18n/it.js`, `src/i18n/nl.js`, `tests/landing.test.mjs`, `tests/firstRun.test.mjs`, `scripts/verify_landing.mjs` (new), and, if V5 reaches T209-c, `scripts/prerender/pages.mjs` and `scripts/prerender/html.mjs`.

Shared files this surface needs a change in, which OWNERSHIP.md must assign or route: `src/lib/glossary.js` and the glossary keys in the six catalogues (entries for measured, estimate and national figure, so the InfoDot can explain them; register row T099-e), `src/lib/sharedElement.js` (V4 item 5, if R3 is accepted), `src/browse/CostBar.jsx` (reused as is; a change only if it cannot take two segments).

Root repo: `docs/ONBOARDING_AND_EMPTY_STATES.md` (V3 item 13), and `docs/FIRST_RUN_RESULT.md` only if T380 or the owner changes the receipt's line labels (register row T099-d).

Not touched by this surface: `src/App.jsx` and `src/lib/homeVisit.js` (which visits open where is the owner's call, T194-a), the pages that host the first-run receipt (`src/browse/DestinationPage.jsx`, `src/browse/JourneyPage.jsx`), the top bar and bottom nav.

## Part 7. Needs a rule

Proposals carta-design does not cover today. T380 accepts or rejects each before anything is built from it.

R1. A short priced list on the landing page. Rule proposed: at most five rows under one heading with a verb or a number; each row is a real link, the name in `--ui`, the per-person per-day figure in `--mono` with its provenance word and the tilde on an estimate; hairlines between rows; ranked by the figure, cheapest first; no badge, no accent, no highlighted row; the same functions as the Explore cards, so the figures agree to the cent.

R2. A photograph on a toggle. Rule proposed: a toggle may carry a licensed photograph above its label, with the credit available on the page; never text over the photo; the pressed state is the `--ink-fill` label band under the photo, so the state survives greyscale; the photo is not the page's largest contentful paint.

R3. A shared-element transition for a non-image element. Rule proposed: the existing shared-element pattern (a card's photo grows into the page's header photo) may carry a receipt card into the receipt on the page it opens, only when the two show the same figures; same timing limits as every transition, a reduced-motion branch that opens without the morph.

R4. Bars in a coverage table. Rule proposed: a table row may carry one thin bar (at most 8 px) of its own counts against their denominator, in the ink ramp, under the numbers, never replacing them, no accent, no legend beyond the column headings.

R5. A sticky primary on a phone, only if V3 item 5 cannot meet the fold otherwise. Rule proposed: one primary may stick above the bottom nav on a phone on the landing page only, as a `--paper` band with a `--rule` top border and no shadow, hidden once the receipt's own primary position is in view.

R6. Motion tokens for a reprice. Rule proposed: a reprice settles in one duration and one easing from DESIGN.md's motion tokens (which T380 adds), opacity only, shared by every receipt.

R7. A toggle with a metadata line. Rule proposed: a toggle button may carry one line of metadata under its label in `--ui` at 12 px, `--ink-soft` (on paper) or `--on-fill` (pressed); the button stays at least `--tap` high and the label remains the accessible name with the metadata appended.

R8. A receipt fragment used to illustrate a claim. Rule proposed: a single receipt line may appear outside a receipt to illustrate a statement about receipts, only when it is read live from a receipt on the same page, set exactly as the receipt sets it, with no added emphasis.
