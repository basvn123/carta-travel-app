# Destination (town) page: design brief

T374, design wave V1, 2026-10-07. Surface key `destination`. This brief is what V3 (structure), V4 (visual and dynamic) and V5 (harden and polish) build the page from. It changes no code. carta-design and DESIGN.md win over everything here; anything this brief proposes that carta-design does not cover is listed in part 7 and waits for T380 (V2) to accept or reject it.

App paths are written from the app repo root (`src/...`). Screenshots are outside both repos in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\destination\` and are named `V1-<view>-<width>.jpg`; the build waves save their "after" set under the same view names.

## Session plan (committed before the work)

1. Setup: impeccable context with `src/browse/DestinationPage.jsx` as the target; read critique, audit, shape and operate; pick the mode.
2. Walk `#dest=<id>` for a large city (Rome, `FCO`), a small town (Zungoli, `gem:zungoli`) and Valbona Valley (`gem:valbona`, which has routes) at 380 and 1280 px, cold and returning; save the before screenshots.
3. Inventory every control and state the page draws, with its file and a verdict.
4. Critique (design review and detector, kept apart) and a short technical audit from the existing harnesses.
5. The traveller's job on this page, against `docs/design-v6/TRIP-PLANNING-RESEARCH.md`.
6. Shape: three numbered build lists (V3, V4, V5) and a target-state control table.
7. Needs a rule: every proposal carta-design does not yet cover, one line each, for T380.

## 1. Setup and mode

`impeccable context --target src/browse/DestinationPage.jsx` ran from the root worktree and loaded PRODUCT.md and DESIGN.md. It found no surface brief (this file is the first) and no automatic detector hook, so the detector is run by hand. It printed the AUTONOMY_DIRECTIVE_CHECK; the owner's instruction of 2026-10-07 tells every session in this run to proceed without asking, so no question tool or decision page was opened, and every point where impeccable would ask took the option that keeps Carta's palette, type and identity. This is refinement, not redesign: the incumbent identity, behaviour and copy stay unless a finding below names them.

Mode: Operate, with Read inside two folds. The traveller arrives on this page with one question, "is this place for me and what will it cost me", and leaves by doing something: setting dates, saving the place, opening the planner, or opening a walk. The receipt with its editable strip is a working instrument, and PRODUCT.md calls the central act "comparing dense pricing matrices". That is Operate: scanability, consistency and the real usage scene outrank expression, and brand lives in precise details. The intro, the insider tips and the rating argument are read, so they take Read's measure and rhythm inside an Operate page. It is not Persuade: Carta sells nothing on this page, and the research says the traveller is mid-comparison, viewing 25 pages a day near the decision (TTG Asia on Expedia, in the research file). It is not Experience: the photographs support the decision; they are not the product.

## 2. The walk

Walked on the shared dev server (`http://localhost:5199`, the main checkout at app commit `3b3e5a8`) with Playwright from a scratch script outside both repos, storage seeded the way `verify_destination_page.mjs` seeds it (guest mode, home and map guide seen). Ten sessions shared that server, so a cold start took one to three minutes to boot; the boot splash seen in the first attempt is a property of the shared server, not of the page, and is not counted as a finding.

Screens saved (eight, the cap):

| View | 380 | 1280 | What it shows |
|---|---|---|---|
| city-top | V1-city-top-380.jpg | V1-city-top-1280.jpg | Rome on arrival: bar, rail, gallery, head, actions |
| city-receipt | V1-city-receipt-380.jpg | | Rome scrolled to the fact strip and the first-run receipt |
| routes-fold | V1-routes-fold-380.jpg | V1-routes-fold-1280.jpg | Valbona Valley after "Expand all", at Routes from here |
| town-empty | V1-town-empty-380.jpg | | Zungoli at Routes from here (the empty fold) |
| town-top | | V1-town-top-1280.jpg | Zungoli on arrival, a thin page |

As the traveller in the research (a hiker on a budget, undecided between places, phone first):

Cold start, phone, Rome. The first screen is a back arrow, a Share button, a section rail cut off at "Route" under the "Expand all" pill, a photograph captioned "Rome (Fiumicino)", the name with an ochre 9.8, two badges, a visit length, a five-line intro, and then the actions: "Plan a trip h..." and "Plan a day ..." truncated side by side, a full-width "Download PDF guide", then Shortlist, Share (the second Share on the screen), Open in Google Maps and Report a problem. No price is on the first screen. One screen down come the four-fact strip ("A day here €87", "Beds from €31") and then the first-run receipt, priced for 2 people and 7 nights in an entire place: €1,393.58, €696.79 each, which is €99.54 a person a day. The strip above said €87. Nothing on the screen explains the €12.54 gap: the strip reads the cost index at the traveller's lifestyle (`src/lib/costIndex.js`, `dayEur = stayEur + foodEur`), the receipt prices the stay tier in its own strip. Further down, inside "What a day here costs", a second receipt (`CostReceipt`) prices the day from the cost index again, with its own lifestyle line. Three presentations of the page's first answer, two bases.

Cold start, desktop, Rome. The gallery shows three photographs across with arrows, the head sits under it, five action buttons, a link and a report link run in one row, the fact strip spans the width, and the receipt starts at the top of the right column at about 700 px, under the fold of an 800 px window. The map is open on the left. On load the keyboard focus ring sits on the Share button in the bar (on the phone on the back arrow): `useFocusTrap` moves focus there, so a mouse user sees an accent ring on arrival.

Valbona Valley (routes). "Routes from here" carries its answer in the closed header ("6 on foot, 1 by bike"), which is the page's best idea. On the phone the folds sit in one column in source order: highlights, things to do, around, routes, trips, villages inside, then rating, when, sleep, getting there, cost, tips, festivals, weather, parking, webcams, what to bring, explore further. "When to go" and "Getting there and around", the second and third things the research says a traveller needs, sit below six folds on a phone. The climate chart colours its months dark and light green (ideal, good), salmon (mixed, drawn in `--accent-soft`) and blue-grey (cool or wet); a month's high, low and rain appear only on mouse hover (`ClimateStrip.jsx`, `onMouseEnter`).

Zungoli (thin town). On desktop the gallery has one photograph, and the strip still reserves three slots, so two thirds of the first band is an empty tinted field (V1-town-top-1280). The head says "Half a day is enough here" beside a strip that says "Sights 2 h": two answers to the same question. Below that the page holds together: the empty fold (Routes from here; Around holds one cycle route) says so in one line ("No waymarked walk or cycle route passes within 25 km of Zungoli."), which is the empty-state rule of T367 working; NearestLine names the nearest feature only when it finds one, and for Zungoli it named none. The trip cards below put the place name in `--accent` and "Open the page" in ochre, which gives ochre an action job carta-design reserves for ratings. Measured: after "Expand all" every fold opened except that empty one, because the button collects the ids of folds that have content (`has`) while the empty ones render from `show`. The first walk also showed that Expand all, pressed before the dossier arrives, leaves the later folds closed and keeps its "Expand all" label: it acts on the list it saw at the click.

Returning visit. The page keeps nothing of the last visit: every fold but the map closes again (`OPEN_BY_DEFAULT` on every destination change). The receipt keeps the dates and stay the traveller set (they live in the app's first-run context, which is right). Nothing says what changed since the last look; that is My trips' job first, but this page should at least not lose the traveller's place.

Measured on the walk (scratch script; controls are visible `button`, `a[href]`, `[role=tab]`, `summary`, `input` and `select` inside `.destp`; under 44 counts any side below 44 px):

| Place, width | Controls (folds closed) | Under 44 px | Controls (all open) | Under 44 px | Folds | Page height closed / open | Receipt top | Horizontal scroll |
|---|---|---|---|---|---|---|---|---|
| Rome, 380 | 76 | 9 | 132 | 37 | 16 | 3,498 / 11,898 px | 1,006 px | 0 |
| Rome, 1280 | 77 | 46 | 133 | 78 | 16 | 2,073 / 4,944 px | 685 px | 0 |
| Valbona Valley, 380 | 68 | 9 | 110 | 26 | 14 | 3,398 / 10,190 px | 1,018 px | 0 |
| Valbona Valley, 1280 | 69 | 40 | 111 | 62 | 14 | 1,919 / 4,341 px | 681 px | 0 |
| Zungoli, 380 | 45 | 9 | 66 | 21 | 12 | 2,974 / 7,504 px | 908 px | 0 |
| Zungoli, 1280 | 44 | 24 | 65 | 36 | 12 | 1,893 / 3,645 px | 656 px | 0 |

Every view had exactly one accent-filled control ("Set your dates"), so the one-primary rule holds today. The head carried the same seven controls on all six views. Headings: two h2 at the top ("Rome" and the receipt's "Rome (Fiumicino)") and no h1 inside the dialog. At 1280 px most of the under-44 controls are the 32 to 43 px desktop buttons the fine-pointer exception now allows; at 380 px the nine on the closed page are the three report links, the two receipt selects and two date inputs (their cells are taller than the control), the Change button and the Explore further links. The page did not scroll sideways at 380 px on the dev server; T281-a measured 52 px at 390 px on a built dist, which V5 rechecks. The returning-visit pass did not finish loading on the shared server within its wait, so the returning behaviour above is read from the code (`OPEN_BY_DEFAULT`, `src/lib/firstRunContext.js`), not measured. The honest footer said "0 of 4 figures here are measured, 1 calculated, 3 estimated" on all three places: it counts the four strip facts only, while the receipt a screen above says "Bed price measured in this town" for Rome.

## 3. Inventory

One row per view, state, control and visual setting on the page. "Where" is the region of the page; "File" is the file that draws it. Verdicts: keep, move, merge, remove, rework.

### Views and states

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| S1 | Page shell | Full-screen dialog (`role=dialog`, `aria-modal`), focus trap, Escape closes | whole page | src/browse/DestinationPage.jsx | keep |
| S2 | Boot by link | `#dest=<id>` opens the page at boot | whole page | src/App.jsx (read only) | keep |
| S3 | Loading | Gallery and head show at once; everything below the badges waits for the dossier and then appears in its final shape (the T271 layout-shift fix) | below the head | DestinationPage.jsx (`settled`) | rework: hold the region's height so the wait reads as loading, not as a short page |
| S4 | Dossier missing | `useDossier` answers null: the page renders from the record alone; sections with nothing are absent | whole page | DestinationPage.jsx, src/lib/dossier.js | keep; add one line saying the guide for this place is not built yet |
| S5 | Thin page | Few photos; empty folds say so with the nearest feature | folds | DestinationPage.jsx, src/browse/CoverageEmpty.jsx (NearestLine) | keep |
| S6 | Bar stuck | The place name appears in the bar after 160 px of scroll | top bar | DestinationPage.jsx (`stuck`) | keep |
| S7 | PDF building | The PDF button reads "Building" while jsPDF runs | head actions | DestinationPage.jsx, src/lib/destinationPdf.js | move with the PDF button |
| S8 | PDF gated | A guest meets the pass dialog instead of a download | dialog | src/hooks/usePaywall.jsx (read only) | keep |
| S9 | PDF failed | `console.error` only; the button goes back to idle with no word | head actions | DestinationPage.jsx (`exportPdf`) | rework: one error line under the button, in carta-design error copy |
| S10 | Link copied | Share falls back to the clipboard and says "Link copied" for 1.8 s | bar and head | DestinationPage.jsx (`share`) | keep, on one Share only |
| S11 | Member focus | `?dm=<name>` lands on a member village and scrolls it into view | Villages inside | src/browse/MemberPlaces.jsx | keep |
| S12 | Returning visit | Folds reset to the map only; receipt inputs persist | whole page | DestinationPage.jsx (`OPEN_BY_DEFAULT`) | rework: remember open folds within the session (rule needed) |
| S13 | Phone layout | One column, back arrow, no cross | whole page | styles 24, 25, 38 | rework (order, see V3) |
| S14 | Desktop layout | Two columns: main (map, do, around, routes, trips, villages) and side (receipt, rating, when, sleep, getting, cost, tips, festivals, weather, park, webcams, pack, further) | whole page | styles 24, 25 | rework (order, see V3) |
| S15 | Honest footer | "N of M figures here are measured, ..." plus the last-checked month | page end | src/browse/HonestFooters.jsx (FigureFooter) | keep; count the figures the page really shows after V3 |

### Top bar and section rail

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| B1 | Back arrow (button) | Closes the page; phone only; takes focus on open | bar, left | DestinationPage.jsx | keep |
| B2 | Place name in the bar | Shows once the head scrolls away | bar | DestinationPage.jsx | keep |
| B3 | Share (bar button) | Web Share or copy link | bar, right | DestinationPage.jsx | keep; the only Share |
| B4 | Close cross (button) | Closes the page; desktop only | bar, right | DestinationPage.jsx | keep |
| B5 | Section rail buttons (up to 9) | Opens a fold and scrolls to it | under the bar | DestinationPage.jsx (`.destp-subnav`) | rework onto src/browse/SectionRail.jsx (anchors, ink-fill pill, appears after the hero), register row T165-b |
| B6 | Expand all / Collapse all (button) | Opens or closes every fold with content | rail, right | DestinationPage.jsx | rework: include the empty folds, recompute after the dossier loads, stop covering the rail on a phone |

### Gallery

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| G1 | Slides | Scroll-snap photo strip; the first image takes the card's shared element | top | DestinationPage.jsx (GalleryStrip) | rework: with one or two photographs the band shrinks to them instead of leaving an empty field |
| G2 | Previous photo, Next photo (buttons) | Scroll one slide | gallery edges | GalleryStrip | keep; 44 px |
| G3 | Count "1/8" | Position | gallery, bottom right | GalleryStrip | keep, mono |
| G4 | Caption | Photo caption; Rome's first reads "Rome (Fiumicino)" | gallery, bottom left | GalleryStrip | rework: never show the airport qualifier |
| G5 | Credit link (12 px info icon) | Opens the Commons page; its title holds author and licence | each slide, bottom right | GalleryStrip | rework: author and licence as text (register row T227-a), 44 px target |
| G6 | Blank hero | HeroImage fallback when no photo exists | top | src/components/HeroImage.jsx | keep |

### Head

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| H1 | Place name (h2) | The page's name, Fraunces | head | DestinationPage.jsx | keep; make it the dialog's h1 |
| H2 | Score chip (button) | Ochre score; jumps to the rating fold | beside the name | src/components/RatingBadge.jsx (ScoreChip), src/components/GemRating.jsx | keep |
| H3 | Verdict label | "Worth the journey" in ochre | beside the score | DestinationPage.jsx | keep |
| H4 | Country and rank | "Italy, Top of Italy" | under the name | DestinationPage.jsx | keep |
| H5 | UNESCO badge | Designation; title holds the site name | badge row | DestinationPage.jsx | keep |
| H6 | Crowding badge | Annual tier | badge row | src/components/CrowdingBadge.jsx | move into the month block |
| H7 | Water quality badge | EEA bathing class where swimming matters | badge row | src/components/WaterQualityBadge.jsx | move into the month block |
| H8 | Visit length | "Worth about 2 days" | badge row | DestinationPage.jsx | keep; merge with the Sights fact |
| H9 | Short intro | Two or three sentences from Carta's facts | head | DestinationPage.jsx | keep; three lines on a phone with "More" |
| H10 | Read the full guide on Wikivoyage (link) | External guide | end of intro | DestinationPage.jsx | keep |
| H11 | Plan a trip here (button) | Leaves for the trip wizard with this country | head actions | DestinationPage.jsx, src/App.jsx | keep as the page's one primary once the dates are the traveller's |
| H12 | Plan a day here (button) | Leaves for the day planner | head actions | DestinationPage.jsx | keep, secondary |
| H13 | Download PDF guide (button) | jsPDF export, gated by the pass | head actions | DestinationPage.jsx, src/lib/destinationPdf.js | move to the page's end |
| H14 | Shortlist (button) | Saves the place | head actions | DestinationPage.jsx | keep, beside the primary |
| H15 | Share (head button) | A second Share | head actions | DestinationPage.jsx | remove (B3 stays) |
| H16 | Open in Google Maps (link) | External map | head actions | DestinationPage.jsx | move into the map fold |
| H17 | Report a problem (button) | Report dialog | head actions | src/components/ReportProblem.jsx | move to the page's end |

### Fact strip and receipt

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| F1 | Fact: Sights | Visit hours | strip | DestinationPage.jsx (`.dfacts`) | merge into the visit length line |
| F2 | Fact: Best months | From the climate record | strip | DestinationPage.jsx | move into the month block |
| F3 | Fact: A day here | Cost index day figure at the lifestyle | strip | DestinationPage.jsx | rework: the receipt's per person per day figure, the same number |
| F4 | Fact: Beds from | Dorm price | strip | DestinationPage.jsx | merge into the receipt's stay line note |
| R1 | Orientation line | "Priced for 2 people and 7 nights at ..." (first run only) | receipt | src/components/FirstRunReceipt.jsx | keep; drop the airport qualifier |
| R2 | People (select) | Party size | receipt strip | FirstRunReceipt.jsx | keep |
| R3 | Stay (select) | Stay tier | receipt strip | FirstRunReceipt.jsx | keep |
| R4 | Arrive (date input) | Start date | receipt strip | FirstRunReceipt.jsx | keep |
| R5 | Leave (date input) | End date | receipt strip | FirstRunReceipt.jsx | keep |
| R6 | Receipt card | Header, one line per cost with its provenance, 2 px rule, total | receipt | FirstRunReceipt.jsx | keep; add the cost bar above the lines |
| R7 | Set your dates (button) | The one primary while the dates are Carta's | under the receipt | FirstRunReceipt.jsx | keep |
| R8 | Your flight door (button) and FlightSheet (modal) | The one place the airport and the traveller's own fare are asked | under the receipt | FirstRunReceipt.jsx | keep |
| R9 | Footer line | What one changed input would do ("At the dorm bed rate it would be ...") | receipt foot | FirstRunReceipt.jsx | keep |
| R10 | Exclusions sentence | What the total leaves out | under the receipt | FirstRunReceipt.jsx | keep |
| R11 | Report a price problem (button) | Report dialog, price only | under the receipt | ReportProblem.jsx | keep, one copy |
| R12 | Cost fold "What a day here costs" | A second receipt (CostReceipt) at the lifestyle, the Change button, a report link, a trip total line | side column | DestinationPage.jsx, src/components/CostSummary.jsx | merge into R6: its lifestyle line and Change button become the receipt's lifestyle control; the fold goes |
| R13 | Change (lifestyle button) | Opens the Lifestyle panel | cost fold | CostSummary.jsx | move into the receipt (the one Lifestyle control rule) |
| R14 | Trip total line | "About €N for N days", rounded | cost fold | DestinationPage.jsx | remove (the receipt is the trip total, unrounded) |

### Folds (each has one toggle button inside an h3, a closed summary and a chevron, `src/browse/Fold.jsx`)

| # | Fold and its controls | What it does | File | Verdict |
|---|---|---|---|---|
| D1 | Highlights and map (toggle, open by default) | The one map and the numbered highlight tiles | DestinationPage.jsx, src/browse/DestMap.jsx | keep; move below walk and ride; title with a verb |
| D2 | Map layers: Highlights, Within 20 km, Day trips (tablist) | Switch the map layer; arrow keys move | DestinationPage.jsx | keep |
| D3 | Map pins and zoom buttons | Numbered pins; actionable pins are keyboard stops (T190) | DestMap.jsx | keep |
| D4 | Highlight tiles (button each) | Focus the pin, show the tile | DestinationPage.jsx | keep; sync both ways with the map |
| D5 | Wikipedia link per tile (11 px icon) | External article | DestinationPage.jsx | rework: 44 px target |
| D6 | Show all / Show less (highlights) | Expand the strip | DestinationPage.jsx | keep |
| D7 | Best things to do (toggle) | Cards grouped by how many guides agree | DestinationPage.jsx | keep; after walk and ride |
| D8 | Do card (link, button or static) | Opens the activity or the feature page | DestinationPage.jsx | keep |
| D9 | Evidence meter | Bar of guide agreement | DestinationPage.jsx | keep, in ink |
| D10 | Show all (things to do) | Expand | DestinationPage.jsx | keep |
| D11 | GetYourGuide, Viator (links) | Affiliate searches | DestinationPage.jsx | move to Explore further |
| D12 | Around {city} (toggle) | Outdoors within 20 km; tabs per layer; rows open pages | src/browse/AroundHere.jsx | keep; merge with D14 |
| D13 | Around tabs, rows, Show on map, More (buttons) | Switch layer, open a page, show on the map | AroundHere.jsx | keep |
| D14 | Routes from here (toggle) | Paths that pass the town, measured to the line | src/browse/RoutesFromHere.jsx | merge with D12 as one "walk and ride from here" fold |
| D15 | Route rows (buttons), credit fold (summary) | Open a stage; licence names | RoutesFromHere.jsx, src/browse/CreditFold.jsx | keep |
| D16 | Best trips from here (toggle), Show on map (button), trip cards (buttons) | Day trips with travel time | DestinationPage.jsx | keep |
| D17 | Villages and towns inside (toggle), member rows and links | Members of an area | MemberPlaces.jsx | keep; title with a number |
| D18 | Why it rates N (toggle) | Score, scale, four parts, confidence note, how long | src/browse/RatingBreakdown.jsx | keep; after the decision block |
| D19 | When to go (toggle) | Climate strip, cheap-stay months, crowd badge and year, bathing water | src/browse/ClimateStrip.jsx, CrowdCalendar.jsx, BathingWater.jsx | rework: one month block, second on the page |
| D20 | Climate month columns (hover tip) | High, low and rain on mouse hover only | ClimateStrip.jsx | rework: every month's figures readable by touch and keyboard |
| D21 | Climate legend (Ideal, Good, Mixed, Cool or wet) | Colour key | ClimateStrip.jsx | rework: colours off `--accent-soft` (rule needed) |
| D22 | Where to sleep (toggle) | Neighbourhood bars, tiers, 12-month price curve | src/browse/Neighbourhoods.jsx | keep; prices through Intl with two decimals |
| D23 | Getting there and around (toggle) | Airport and transfer, transit verdict, car, rhythm, book ahead, pairs | src/browse/GettingThere.jsx | rework: third on the page, car-free first |
| D24 | Pairs well with (buttons) | Opens a nearby place | DestinationPage.jsx | keep |
| D25 | Insider tips (toggle) | Rule-coded tips | DestinationPage.jsx | rework as a flashcard deck (rule exists) |
| D26 | Festivals and events (toggle), festival links | Dated events | DestinationPage.jsx | keep; title with a number |
| D27 | Weather this week (toggle) | Seven-day forecast | DestinationPage.jsx | merge into the month block |
| D28 | Where to park (toggle); Google Maps and Waze per spot; Search parking (link) | Parking with deeplinks and a provenance line | DestinationPage.jsx | keep; links 44 px |
| D29 | Webcams (toggle), frames, source link | Live provider frames | src/browse/WebcamEmbed.jsx | keep |
| D30 | What to bring (toggle), chips | Packing for the month | DestinationPage.jsx | keep, last before further |
| D31 | Explore {city} further (toggle); Google Flights, Skyscanner, Booking.com, Airbnb (links) | Handover searches | DestinationPage.jsx | keep; gains the activity links |
| D32 | Empty-fold line with the nearest feature (button) | "No waymarked walk ... within 25 km" plus the nearest | src/browse/CoverageEmpty.jsx | keep |

### Visual settings

| # | Setting | Where | File | Verdict |
|---|---|---|---|---|
| V1 | Each fold a bordered card | every fold | styles 24, 25 | rework: lists get hairlines, objects get borders; eighteen bordered cards read as eighteen objects |
| V2 | Fold icons in `--accent` | fold headers | styles 24 | rework: icons are `--ink-soft` (never-do 1 and the one accent) |
| V3 | Fold titles in Fraunces | fold headers | styles 24 | keep at display size only |
| V4 | Climate bar colours (`--leaf-ink`, `--climate-good`, `--accent-soft`, `--climate-poor`) | When to go | src/styles/17-saved-trips.css lines 2019 to 2022 | rework (rule needed) |
| V5 | Evidence meter and rating part fills | Do, Rating | styles 19, 24 | ochre stays for rating; evidence meter in ink |
| V6 | Fact strip as a bordered four-cell card | under the head | styles 24, 25 | merge into the receipt summary line |
| V7 | Destination rules spread over seven stylesheets | all | src/styles/17-saved-trips.css, 18-detail-panel.css, 19-guide-ratings.css, 24-destination-workspace.css, 25-feature-pages.css, 34-section-rail.css, 38-first-run.css | new rules go to src/styles/64-v6-destination.css only (created by T380) |

## 4. Critique and technical audit

Method: the two assessments were kept apart. Assessment B (the detector and the design lint) ran in its own sub-agent and returned its counts. Assessment A (the design review) was written in this session from the source and the screenshots, and finished before the detector result was read; a second browsing agent was not started because the laptop allows one Playwright browser at a time. Browser overlay injection was not attempted for the same reason.

### Design health score (Nielsen, 0 to 4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Strip €87 against receipt €99.54 a person a day, with no word on why; nothing shows while the dossier loads |
| 2 | Match system and real world | 3 | Folds answer in the traveller's words, though plurals break ("1 lakes", "1 cycling routes"); "Rome (Fiumicino)" leaks the airport into the place |
| 3 | User control and freedom | 3 | Close, Escape, folds and the rail work; Expand all skips the empty folds; the page forgets which folds were open |
| 4 | Consistency and standards | 2 | Two Share buttons, two receipts, two price report buttons; the rail is not the shared SectionRail; months drawn by ClimateStrip here and by MonthStrip on the journey and mountain pages |
| 5 | Error prevention | 3 | Dates are bounded inputs; the PDF is gated before it runs |
| 6 | Recognition rather than recall | 3 | Closed folds carry their answer; month figures need a mouse hover |
| 7 | Flexibility and efficiency | 3 | Keyboard map pins and tablist arrows; the phone rail is cut off |
| 8 | Aesthetic and minimalist design | 2 | Seven head actions before the first price; eighteen bordered fold cards with accent icons |
| 9 | Error recovery | 2 | A failed PDF says nothing |
| 10 | Help and documentation | 3 | Provenance lines per receipt line; the honest footer counts only the four strip facts ("0 of 4 measured" under a receipt that says measured); no InfoDot yet |
| | Total | 26/40 | Acceptable: significant work needed |

### Design specificity

The page is Carta's and could not sit in another product unchanged: the receipt with provenance per line, the closed fold that answers its own question, the evidence meter on things to do, the empty fold that names the nearest walk, the rating argued from its four parts. What makes it look interchangeable sits around those: a gallery and a pill row of seven actions on top, a rounded card per fold with a terracotta icon, a green to salmon weather chart. Those are category habits, and they push Carta's own instrument, the receipt, under the fold.

Deterministic scan: `impeccable detect --json` over 18 markup files of this surface (browse: DestinationPage, AroundHere, GettingThere, Neighbourhoods, ClimateStrip, CrowdCalendar, RatingBreakdown, RoutesFromHere, MemberPlaces, DestMap, WebcamEmbed, HonestFooters, Fold; components: HeroImage, RatingBadge, CrowdingBadge, FirstRunReceipt, CostSummary) returned `[]`, exit 0, zero findings. `node scripts/ci/design-lint.mjs` reports 213 violations, all 213 in the baseline, 0 new; none of the surface's JSX files is in the baseline. The baselined entries in the three named stylesheets: 18-detail-panel.css 4 shadow literals and 1 outline none; 19-guide-ratings.css about 38 shadow literals, 3 gradients and 1 outline none; 24-destination-workspace.css about 14 shadow literals (one a terracotta glow, `rgba(224, 90, 71, .32)`), 5 gradients and 4 outline none. Most of those belong to day planner rules that share the files. The detector agrees with the review that the JSX is clean; what it cannot see is the order, the duplication and the colour jobs, which is where the problems are.

### Priority issues

[P1] Two bases for "what does a day here cost". The strip and the cost fold read the cost index at the lifestyle; the first-run receipt prices its own stay tier; on Rome they differ by €12.54 a person a day on one page, without a word. Value for money is the first reason Europeans choose a place (3 in 5, Booking.com via Statista, in the research), and PRODUCT.md says no two screens may disagree about what dinner costs; here one screen does. Fix: one receipt (the first-run receipt) is the page's cost; the strip's day figure reads from it; the cost fold's lifestyle line and Change button move into that receipt; the cost fold goes. Command: `distill`, then `clarify`.

[P1] The price is below the fold and the head is a toolbar. On a phone the first price is a full screen down, under seven actions, two of them truncated. carta-design allows one primary per view and the research puts the per-day receipt first. Fix: one action row (primary, Shortlist, Plan a day), Share in the bar only, the PDF and Report at the page's end, Google Maps in the map fold, the receipt's summary line (day figure, nights, total) under the intro. Command: `layout`, `distill`.

[P1] The order does not follow the traveller. On a phone "When to go" is the 7th fold on Rome and the 8th on Valbona, and "Getting there and around" the 9th on both. The research order is cost, month (weather, crowds), getting there without a car, then what is there. Fix: receipt, month block, getting there, walk and ride, things to do, highlights and map, trips, the rest. Command: `layout`.

[P2] The month is drawn in the action colour and only for a mouse. Mixed months are `--accent-soft`, good months two greens; the figures appear on hover only, so a phone or keyboard user cannot read a month's temperature or rain. Fix: one month block with every month's figures readable without hover, in colours from a rule T380 writes (part 7). Command: `colorize` as a restraint pass, `adapt`.

[P2] The rail and Expand all. The rail is buttons, not SectionRail with anchors and the ink-fill pill (T165-b); on a phone "Expand all" covers the fourth link; Expand all skips the empty folds and acts on the list it saw at the click. Fix: SectionRail, Expand all as the rail's last item reading `show` after the dossier settles. Command: `harden`.

### Persona red flags

Hiker on a budget, phone, undecided between three valleys: the page answers "can I walk from here" well (routes and around carry counts in their headers), but she passes the gallery, seven buttons and six folds before she learns the month and the bus. She sees €87 in the strip and €696.79 each in the receipt and cannot tell whether the second includes something the first does not.

Returning planner on a laptop with dates set: the receipt is right, but every fold she opened last time is closed again, and nothing says the bed price moved since she shortlisted the place.

Keyboard user: the map pins and the layer tabs are reachable (T190), the climate months are not; on arrival the focus ring sits on Share, which reads as a selected button to anyone who opened the page with a mouse.

### Minor observations

The place name is an h2, the receipt title a second h2, and the dialog has no h1 of its own (heading order rule). The Around summary builds plurals by number alone: "1 lakes", "1 peaks", "1 cycling routes" (`summaryOf` in AroundHere.jsx). The What to bring summary ends in a colon ("For a trip in Apr:"). Fold titles "Highlights and map", "Insider tips", "Festivals and events" and "Villages and towns inside" carry no verb and no number (copy rule). Neighbourhood prices print `€${n.night_eur}` without Intl formatting or decimals (`Neighbourhoods.jsx`). The trip total line rounds (`Math.round(cost.dayEur * stayLen.n)`), which carta-design forbids on receipt figures. The PDF palette still carries the old accent `#e05a47` and mute `#7d8393` (`destinationPdf.js` line 40, register row T363-b). The gallery credit is a tooltip on a 12 px icon (T227-a). "Book ahead" uses a "!" in a coloured circle, an alert dressed as an icon. On Valbona (V1-routes-fold-1280) one route row has no name and starts at "passes 1.6 km south-west"; the Insider tips fold is filled in an ochre tint with ochre bullets, and the receipt's note writes "EUR 6" where the page elsewhere writes "€"; "What to bring" says "For a trip in Jun" in October, because it packs for the next best month (`packMonth` in src/lib/packing.js) rather than for the dates in the traveller's receipt.

### Questions to consider

What if the page opened on the receipt's one-line answer ("€99.54 a person a day, 7 nights, 2 people") with the first photograph beside it on desktop instead of above it? Does a town page need eighteen folds, or seven groups with the rest inside them? What would the page look like with no card borders at all, only hairlines and the receipt as the one object?

Questions skipped: the run is unattended (owner instruction 2026-10-07); the choices impeccable would ask about are taken in part 6 in favour of Carta's palette, type and identity.

### Technical audit (existing harnesses)

The page's own harnesses were run without building, because a V1 session writes nothing into the main checkout: `verify_transport_links.mjs` is plain node and passed 43 of 43; `verify_destination_page.mjs` ran as a scratchpad copy pointed at the shared dev server (port 5199, waits tripled, the method T312 used) and passed 48 of 58. All ten failures are the Rome and Paris block that follows an in-page hash change after the Explore card test; the copy's longer wait found the previous page's head and checked it, so those ten are an artefact of the copy, and the walk confirmed the same facts on fresh loads (Rome: festivals "4 events", parking "3 car parks, Park and ride", around "3 cycling routes", the intro names Rome). On the phone at 390 px the copy reported 0 px of horizontal scroll and a default page of 3,358 px. `verify_routes_block.mjs` and `verify_stay_tiers.mjs` spawn a vite preview of a built dist, `verify_hero_images.mjs`, `verify_keyboard.mjs` and `verify_quality_floor.mjs` write screenshots into the app repo; none of them was run here, and V5 runs all seven on a build in its app worktree. The open register rows that bear on this page: T281-a (52 px phone overflow on a built dist at 390 px, not reproduced on the dev server), T364-d (`verify_keyboard.mjs` reports the destination page STUCK, 16 of 20), T165-b (the rail), T227-a (photo credits), T231-b (destination page LCP 5,140 ms on the phone profile), T363-b (old colours in the PDF), T224-c (borrowed bed counts in the receipt's provenance line).

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Dialog with focus trap and Escape, keyboard map pins and tablist; month figures hover-only; no h1; focus ring on Share at a mouse open; 37 controls under 44 px at 380 px with all folds open |
| 2 | Performance | 2 | Folds mount their body only when open (good); LCP 5,140 ms on the phone profile (T231-b); the map and the forecast load on open |
| 3 | Responsive design | 3 | One column on a phone, two on desktop, no sideways scroll at 380 px on the dev server; head labels truncate; the rail is covered by Expand all |
| 4 | Theming | 3 | Tokens throughout the JSX (0 detector findings, 0 new lint); baselined shadow and gradient literals in the shared stylesheets; `--accent-soft` and ochre given jobs outside their rules |
| 5 | Implementation integrity | 3 | Coherent Carta system; duplication (two receipts, two Shares, two report buttons) and seven stylesheets for one page |
| | Total | 14/20 | Good: address the weak dimensions |

## 5. The traveller's job here

The research's order of need between places is: can I afford it, is it good in my month (weather, crowds), what is there for me, and can I get there and around without a car (TRIP-PLANNING-RESEARCH.md, section 2). Its destination-page section asks for the per-day receipt with provenance first, then the month strip, then getting there and around without a car, then things to do; every estimate as a labelled range; no dripped costs.

First, what does it cost me. The receipt exists and is good, but it is the third thing on a desktop and a screen down on a phone, and it disagrees with the strip above it. The day figure per person, the nights and the total belong in the first screen as the summary line of the one receipt. 59% of travellers start without a destination (TTG Asia on Expedia), so most arrive comparing; the figure is how they compare.

Second, is it good in my month. The month lives in four places today: the strip's best months, the When fold, the weather-this-week fold, and the crowd badge in the head. 74% weigh weather risk and 68% would go somewhere less crowded (Booking.com 2026 via Hospitality Net). One month block, second on the page: the twelve months with temperature and rain readable, the best months in words, the cheap-bed months, the crowd tier with its year, the water class, and this week's forecast.

Third, can I get there and around without a car. GettingThere carries the airport transfer, a transit verdict and a car verdict, but sits 9th on a phone. Nearly two thirds of German hikers would take public transport to a walk and name a one-hour gap as the limit (Wandermonitor 2024). The car-free line goes first in that block; the nearest station with its frequency is data the dossier does not carry (open item T374-c).

Then what is there for me. For the hiker Carta speaks to first (PRODUCT.md), that is the walks and rides: Around and Routes from here as one block, then things to do, then the highlights map.

Missing: a "best time" sentence that joins weather, crowds and bed price in one line; the car-free access fact with a station and a frequency; a way back to where the traveller was (folds remembered); what changed since the place was shortlisted (owned by My trips, shown here as one line when a change exists).

In the wrong place: the PDF, Report and Google Maps in the head; two Shares; the rating fold at the top of the side column (it argues the score after cost and month should have been answered); the cost fold at the bottom of the side column.

What sends the traveller away: Google Maps (head), Wikivoyage (intro), GetYourGuide and Viator (things to do), Google Flights, Skyscanner, Booking.com and Airbnb (Explore further), Google Maps and Waze per parking spot, foto-webcam.eu. All are honest handovers and stay, grouped in Explore further except those tied to a row (parking, webcams). The flight links are the one place a fare search lives, which is right: Carta does not price flights.

## 6. The plan (impeccable shape)

Assumptions, stated because the run is unattended: the palette, the three faces, the receipt and the fold grammar stay; nothing here invents a token; every item that depends on a part 7 rule is built only after T380 accepts that rule and is skipped otherwise. Selected direction: an instrument page. The receipt is the focal object; everything else is a list under hairlines, grouped by the traveller's three questions. Motion only conveys state: a fold opening, a figure repricing, the map focusing a pin.

### V3: structure, information and flow

1. One cost truth. Merge the cost fold (`CostReceipt`) into the first-run receipt: its lifestyle line and Change button become the receipt's lifestyle control (the one Lifestyle control rule); remove the cost fold, the trip total line and the second price report button; the strip's day figure reads the receipt's per person per day figure (rule 2). Files: src/browse/DestinationPage.jsx, src/components/FirstRunReceipt.jsx (shared with JourneyPage: additive props only), src/components/CostSummary.jsx (read only). Command: `distill`. The honest footer counts the figures the page shows after the merge, receipt lines included, with their own provenance (today it says "0 of 4 measured" under a receipt line that says measured). Files add src/browse/HonestFooters.jsx. Done when: the page shows one day figure, strip and receipt agree to the cent at 380 and 1280 for Rome, Valbona and Zungoli, the footer's count matches the receipt's labels, and `verify_stay_tiers.mjs` passes.
2. Reorder by the traveller's questions: head, receipt, month block, getting there, walk and ride from here, things to do, highlights and map, trips, villages inside, rating, sleep, tips, festivals, parking, webcams, what to bring, explore further. On desktop the receipt and the month block head the side column; the main column starts at walk and ride. Files: DestinationPage.jsx, src/styles/64-v6-destination.css. Command: `layout`. Done when: on a 380 px phone the month block's header sits within two screen heights of the top, and the rail lists the new order.
3. One action row. Primary: Set your dates while the dates are Carta's, then Plan a trip here; secondary: Shortlist and Plan a day here. Share only in the bar. PDF and Report move to a row before the footer (rule 4); Open in Google Maps moves into the map fold's aside. Files: DestinationPage.jsx, 64-v6-destination.css. Command: `distill`. Done when: the head holds at most three controls, none truncated at 380 px in English and German, one accent-filled control in view.
4. One month block. Merge When to go, Weather this week, the crowd badge, the water badge and the best-months fact into one fold whose closed summary answers ("Best Apr, May; quiet"), on the shared MonthStrip where its data contract fits, otherwise on ClimateStrip. Files: DestinationPage.jsx, src/browse/ClimateStrip.jsx, src/browse/CrowdCalendar.jsx, src/browse/BathingWater.jsx, src/components/MonthStrip.jsx, src/components/CrowdingBadge.jsx, src/components/WaterQualityBadge.jsx. Command: `layout`, `clarify`. Done when: each month's high, low and rain are readable without hover at 380 px, and the page has one place for the month.
5. Getting there leads with car-free. Rows in the order transit verdict, airport transfer, car verdict; book ahead and pairs after. Files: src/browse/GettingThere.jsx. Command: `clarify`. Done when: the fold's first line answers "can I do this without a car" for Valbona and Rome.
6. Walk and ride from here. Around and Routes from here become one fold: the routes list first where there are routes, the 20 km inventory under it, one empty line (NearestLine) where there is neither. Files: DestinationPage.jsx, src/browse/AroundHere.jsx, src/browse/RoutesFromHere.jsx. Command: `distill`. Done when: `verify_routes_block.mjs` passes and Zungoli shows one empty line, not two.
7. Section rail. Replace `.destp-subnav` with src/browse/SectionRail.jsx; Expand all becomes the rail's last item and reads `show`, recomputed after the dossier settles. Files: DestinationPage.jsx, SectionRail.jsx (no change expected), 64-v6-destination.css. Command: `harden`. Done when: T165-b closes, Expand all opens the empty folds, no rail link is covered at 380 px.
8. Remember the folds (rule 8). Open folds per destination kept in sessionStorage behind try/catch, restored on a return within the session. Files: DestinationPage.jsx. Command: `harden`. Done when: open, close, reopen restores the folds; a new destination starts on the defaults.
9. Copy pass on fold titles, summaries and empty lines, plurals through the i18n plural forms ("1 lake"): every title with a verb or a number ("See the highlights on the map", "Read the insider tips", "N festivals and events", "N villages inside"), all six catalogues. Files: src/i18n/en.js, de.js, es.js, fr.js, it.js, nl.js. Command: `clarify`. Done when: six catalogues parse and an owner row asks for native review.
10. Take the airport out of the place: `baseCity()` on every visible place name, the receipt title and the first photo caption included. Files: DestinationPage.jsx, FirstRunReceipt.jsx. Command: `clarify`. Done when: no "(Fiumicino)" anywhere on Rome's page.

### V4: visual and dynamic (within the palette)

1. Hairlines, not cards (rule 5). Folds become sections divided by `--rule-soft` hairlines with no shadow; the receipt is the one bordered object; fold icons `--ink-soft`. Files: 64-v6-destination.css. Command: `quieter`. Done when: one `--shadow-card` remains on the page (the receipt) and carta-design question 7 is answered.
2. The cost bar above the receipt lines (rule exists): one segment per line in the ink ramp. Files: FirstRunReceipt.jsx, src/browse/CostBar.jsx (no change), 64-v6-destination.css. Command: `visualize`. Done when: the segments follow the receipt lines in order and the bar has no legend.
3. Figures reprice in place: when people, stay or dates change, the total and the day figure update without layout shift, with a transform and opacity transition under 300 ms, a reduced-motion branch and tabular numbers. Files: FirstRunReceipt.jsx, 64-v6-destination.css. Command: `animate`. Done when: layout shift is 0 on a stay change.
4. Map and tiles in sync both ways (rule 6): focusing a tile lifts its pin, tapping a pin scrolls its tile (exists one way); the selected pin in `--accent`, the rest ink. Files: DestMap.jsx, DestinationPage.jsx, 64-v6-destination.css. Command: `animate`. Done when: both directions work by mouse, touch and keyboard.
5. The month block drawn as data: twelve columns, temperature in mono above, rain below, the best months marked by weight and a word, in the colours of rule 1. Files: ClimateStrip.jsx or MonthStrip.jsx, 64-v6-destination.css. Command: `visualize`. Done when: the strip reads the same in a greyscale screenshot.
6. Gallery (rule 9): on desktop the first photograph beside the head, the rest as a strip; captions and the credit as text. Files: DestinationPage.jsx (GalleryStrip), src/components/HeroImage.jsx, 64-v6-destination.css. Command: `layout`. Done when: the first price is above the fold at 1280 x 800 and the credit names author and licence.
7. InfoDot on the first "measured" and the first "est." in the receipt (rule exists), from the shared glossary. Files: FirstRunReceipt.jsx, src/components/InfoDot.jsx (no change). Command: `clarify`. Done when: one dot per term per view.
8. Insider tips as a flashcard deck (rule exists) with "Show all". Files: DestinationPage.jsx, src/browse/FlashDeck.jsx (no change). Command: `layout`. Done when: arrows and buttons move the deck and print shows the list.
9. A still placeholder of the final height while the dossier loads (rule 7). Files: DestinationPage.jsx, 64-v6-destination.css. Command: `harden`. Done when: layout shift stays 0 and the wait reads as loading.

### V5: harden, adapt and polish

1. Tap targets: gallery credit, highlight Wikipedia links, parking Google Maps and Waze links, report links and the rail at 44 px on touch, 32 px allowed on a fine pointer. Files: 64-v6-destination.css. Command: `adapt`. Done when: the walk script's under-44 count at 380 px is 0.
2. Phone overflow and truncation: no horizontal scroll at 360, 380 and 390 px in all six languages, no ellipsis on an action label. Command: `adapt`. Done when: `verify_destination_page.mjs` "no horizontal scroll on phone" passes and T281-a closes.
3. Focus on open (rule 10): on a mouse open the dialog heading takes focus without a ring; the back arrow keeps it on a phone. Files: DestinationPage.jsx. Command: `harden`. Done when: `verify_keyboard.mjs` reports 20 of 20 with the destination page not stuck (T364-d).
4. Headings: the place name is the dialog's h1, folds h2, inside folds h3. Files: DestinationPage.jsx, Fold.jsx (`level` prop only). Command: `harden`. Done when: the quality floor harness reports the page's heading order clean.
5. Errors: a PDF failure says what happened and what to do in one line; the Share fallback says when the clipboard is blocked. Six catalogues. Command: `harden`. Done when: a forced failure shows the line.
6. Numbers: neighbourhood and tier prices through Intl with two decimals in mono; no rounded figure left in a receipt-like line. Files: Neighbourhoods.jsx. Command: `polish`. Done when: grep finds no `€${` template in the surface's files.
7. PDF parity: the PDF follows the new order, prints the one cost figure the page shows, and reads its colours from the token mirror (T363-b). Files: src/lib/destinationPdf.js. Command: `polish`. Done when: the PDF's day figure matches the page.
8. Detector and lint: `impeccable detect --json` over every changed file, 0 findings or each answered; `node scripts/ci/design-lint.mjs` 0 new. Command: `polish`.
9. Harnesses: verify_destination_page, verify_routes_block, verify_hero_images, verify_transport_links, verify_stay_tiers, verify_keyboard (20 of 20), verify_quality_floor. An assertion that encodes the old design (the four-fact strip, the cost fold, `.destp-subnav-all`, "highlights open by default", "folding sections render >= 8") is updated with a comment saying why, never deleted.

### Target-state controls

| Region | Control | Kind | State after V5 |
|---|---|---|---|
| Bar | Back arrow | button | phone only, 44 px |
| Bar | Share | button, secondary | the only Share |
| Bar | Close | round icon button | desktop only |
| Rail | Section links | anchors | SectionRail, ink-fill pill on the section in view |
| Rail | Expand all / Collapse all | button | last rail item, includes empty folds |
| Gallery | Previous, Next | buttons | 44 px |
| Gallery | Credit | link, text | author and licence |
| Head | Score chip | button | jumps to the rating |
| Head | Read the full guide on Wikivoyage | link | end of the intro |
| Head | Set your dates, then Plan a trip here | button, primary | the one primary in view |
| Head | Shortlist | button, secondary | |
| Head | Plan a day here | button, secondary | |
| Receipt | People, Stay, Arrive, Leave | select, select, date, date | edit in place, reprice without shift |
| Receipt | Lifestyle | the one Lifestyle control | opens or embeds the Lifestyle panel |
| Receipt | Cost bar segments | buttons | ink ramp, show the line's figure |
| Receipt | Your flight | button, secondary | opens FlightSheet |
| Receipt | InfoDot on measured, est. | buttons | one per term |
| Receipt | Report a price problem | button | one copy |
| Folds | Fold toggle, one per fold | button in a heading | answers in the closed header |
| Month | Month columns | data, readable without hover | figures by touch and keyboard |
| Getting there | Pairs well with | buttons | open a place |
| Walk and ride | Layer tabs, rows, Show on map, More, route rows, credit | buttons, summary | one fold |
| Things to do | Cards, Show all | links or buttons | |
| Map | Layer tabs, pins, zoom, Open in Google Maps | tablist, keyboard pins, buttons, link | pin and tile in sync |
| Highlights | Tiles, Wikipedia links, Show all | buttons, links | links 44 px |
| Trips | Trip cards, Show on map | buttons | |
| Villages | Member rows, links | links | |
| Tips | Previous, Next, Show all | buttons | flashcard deck |
| Festivals | Festival links | links | |
| Parking | Google Maps, Waze, Search parking | links | 44 px |
| Webcams | Frames, source link | iframe, link | |
| Explore further | Google Flights, Skyscanner, Booking.com, Airbnb, GetYourGuide, Viator | links | grouped |
| Page end | Download PDF guide, Report a problem | buttons, secondary | with the PDF error line |

Counts this plan moves: head controls from 7 to 3; Share from 2 to 1; receipts from 2 to 1; price report buttons from 2 to 1; folds from at most 18 to at most 15 (cost removed, routes into walk and ride, weather into the month block); places a day cost is shown from 3 to 1 figure (the receipt, echoed once in its summary line).

### Every file the build waves touch

App (`src/`): browse/DestinationPage.jsx, browse/AroundHere.jsx, browse/RoutesFromHere.jsx, browse/GettingThere.jsx, browse/Neighbourhoods.jsx, browse/ClimateStrip.jsx, browse/CrowdCalendar.jsx, browse/BathingWater.jsx, browse/RatingBreakdown.jsx, browse/DestMap.jsx, browse/MemberPlaces.jsx, browse/WebcamEmbed.jsx, browse/HonestFooters.jsx, browse/CreditFold.jsx, browse/Fold.jsx (level prop only), browse/SectionRail.jsx, browse/CostBar.jsx, browse/FlashDeck.jsx, browse/CoverageEmpty.jsx, components/FirstRunReceipt.jsx (shared with JourneyPage: additive props only), components/CostSummary.jsx, components/HeroImage.jsx, components/RatingBadge.jsx, components/GemRating.jsx, components/CrowdingBadge.jsx, components/WaterQualityBadge.jsx, components/MonthStrip.jsx, components/InfoDot.jsx, components/ReportProblem.jsx, lib/destinationPdf.js, i18n/en.js, i18n/de.js, i18n/es.js, i18n/fr.js, i18n/it.js, i18n/nl.js, styles/64-v6-destination.css (new rules only, created by T380). Read but not edited: styles/17-saved-trips.css, 18-detail-panel.css, 19-guide-ratings.css, 24-destination-workspace.css, 25-feature-pages.css, 34-section-rail.css, 38-first-run.css, App.jsx, lib/costIndex.js, lib/dossier.js. Harnesses (`scripts/`): verify_destination_page.mjs, verify_routes_block.mjs, verify_hero_images.mjs, verify_transport_links.mjs, verify_stay_tiers.mjs, verify_keyboard.mjs, verify_quality_floor.mjs.

Named in the task's file list but not rendered by this page: browse/NearbyOutdoors.jsx (the beach, lake, mountain, trail and cycle pages use it), components/CountryIntel.jsx (the planners use it), and components/MonthStrip.jsx (the journey and mountain pages use it today). T380 should give them to the surface that renders them, and MonthStrip to this one only if V3 item 4 adopts it.

## 7. Needs a rule

Each line is a proposal carta-design does not cover today, with the rule proposed. T380 accepts or rejects each before anything is built; a rejected one is skipped.

1. Month colours: comfort is drawn as weight in the ink ramp (`--kind-*`), the best months add a word and a bold initial, never `--accent`, `--accent-soft` or `--rate`; `--climate-good` and `--climate-poor` stay only where the trip pages already use them.
2. One day figure: a destination page shows one per person per day figure, read from its one receipt; any other place on the page that names a day cost shows that same value.
3. Estimates as ranges: an estimated figure may show as "~ €80.00 to €95.00 est." in mono where the model gives a range, never on a measured figure; a total that sums ranges says it sums the midpoints.
4. Page-end utility row: download and report sit in one row of secondary buttons before the honest footer, never in the head.
5. Folds without card chrome: on a detail page a fold is a section under a `--rule-soft` hairline, no border box and no shadow; the receipt is the page's one bordered object; fold icons `--ink-soft`.
6. Map and list in sync: the selected item is `--accent` on the map and `--accent-bg` behind its list row; nothing else on that map uses `--accent`.
7. Loading placeholder: a region waiting for data holds its final height as a still `--paper-dim` block, no shimmer and no spinner, with "Loading" for screen readers only.
8. Remembered folds: a long page restores the folds the traveller opened within the same session, never across sessions, and never opens one the traveller did not.
9. Hero beside the head: from 1024 px a detail page's first photograph may sit beside the head instead of above it, so the first figure is above the fold; no text over the photograph.
10. Initial focus on a full-screen page: opened by mouse, focus goes to the page heading (tabindex -1, no visible ring); opened from the keyboard, the first control takes it.

## Direction check (T380, V2)

What `docs/design-v6/DIRECTION.md` changes in this plan. All ten rules are accepted, rule 6 as amended: the list side of the map sync uses a 2 px `--ink` outline on the tile, not `--accent-bg`, so that `--accent-bg` is never a selection colour anywhere; the selected pin stays the one `--accent` on the map (V4-4). Rule 1 is the house month strip and the month block (V3-4, V4-5) follows it; `MonthStrip.jsx` is shell's, so a data-contract change is a hand-off to T381 and `ClimateStrip.jsx` (this surface's) is where V3-4 builds if the contract does not fit. Rule 5 is the house detail-page grammar (folds under hairlines, the receipt the one bordered object). Rule 7 is the house loading block. Rule 8 is merged into the remembered-state rule. Rule 10 is the house focus rule for every full-screen page. The reprice in V4-3 is `settleFigure()` from `src/lib/figureChange.js` at `--dur-2`, no count-up. OWNERSHIP.md gives this surface the destination page and its parts, `CrowdingBadge.jsx`, `WaterQualityBadge.jsx`, `BathingWater.jsx`, `destinationPdf.js`, `18-detail-panel.css` and `24-destination-workspace.css`; `FirstRunReceipt.jsx` is landing's (V3-1 and V4-2 ask for additive props), `CostSummary.jsx` is explore's, `CostBar.jsx`, `SectionRail.jsx`, `FlashDeck.jsx`, `InfoDot.jsx`, `HeroImage.jsx`, `RatingBadge.jsx` and `GemRating.jsx` are shell's, `NearbyOutdoors.jsx` is outdoor's and `CountryIntel.jsx` tripplanner's (row T374-b closed by this assignment).
