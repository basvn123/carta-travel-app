# Design brief: Trip planner, the multi-city wizard and the planned trip (key 'tripplanner')

Written by T377 in design wave V1, 2026-10-08. This is the brief that V3, V4 and V5 build the trip planner from. It plans and does not build: no app file changed in V1. T380 (V2) accepts or rejects every proposal in part 7 before anything that depends on it is built, and OWNERSHIP.md (V2) is the authority on file ownership from V2 on.

App paths are written as `src/...` and are paths in the app repo. The "before" screenshots are in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\tripplanner\` (outside both repos, never committed). A figure in this brief names the screenshot, the walk or the file it came from. The walk's DOM counts come from a scratch Playwright script run against the shared dev server at app commit 3b3e5a8.

Precedence for every item: carta-design and DESIGN.md first, then impeccable's craft floor, then `docs/design-v6/TRIP-PLANNING-RESEARCH.md`, then taste.

## 1. Setup and mode

Impeccable v4.3.1 (the project copy) ran `context --target src/planner/TripPlannerTab.jsx` from the T377 root worktree. It loaded PRODUCT.md and DESIGN.md, found no surface brief (this file is the first) and reported no automatic detector hook, so the detector was run by hand (part 4). Its AUTONOMY_DIRECTIVE_CHECK was answered by the owner's standing instruction of 2026-10-07 to proceed without asking: no question tool, decision page or live mode was opened. Its critique asks for two isolated assessments; they ran as two read-only sub-agents (an inventory and design read of the source, and Assessment B: detector, design lint and static checks), and the walk in part 2 is the browser evidence. Read for this brief: reference/critique.md, audit.md, shape.md and operate.md.

Mode: Operate. The traveller here is doing a job with a defined end: turning a window of nights, a home airport and a budget into a priced route of two or three towns, then saving it and moving on to the days. Success is a finished, saved trip whose total they trust. That is Operate by impeccable's definition (the visitor completes a task in app UI). It is not Persuade, even on the first step: the landing page persuades (T371), and the wizard must not sell. It is not Read, although the country brief inside the Where step reads like a guide: it serves a choice and closes. The consequences for the build waves: scanability, one control vocabulary across the seven steps and the planned view, the inputs always visible and editable, figures updating in place without jitter, and the brand carried by precise details (the receipt, the mono figures, the honest "est." labels), not by decoration. This is refinement, not redesign: impeccable's "Refinement preserves" applies, so the palette, the three faces, the step-by-step wizard, the map with its sheet and the receipt stay. What changes is order, what each step shows, how many things compete for the accent, and what the traveller sees first.

## 2. The walk

Walked at 380 x 800 and 1280 x 800 as the traveller in the research: undecided about where (59 percent start that way, research section 1), money first (3 in 5 name value first, section 2), with a week in October and Charleroi as the nearest airport. The path was the default one: Nothing booked yet, From, When (flexible, 7 nights, October), Where through the quiz (Hidden gems and Hiking, Shoestring, Fly in then trains and buses, Anywhere in Europe, A few stops), the country brief, Choose by hand, Trips, Getting there, Finish, the planned trip, and a reload. At 1280 the walk reached the Where step and the country brief; its reload in the middle of Where did not repaint within 240 s, and a second 1280 run could not load the page at all as the shared server slowed further, so the 1280 Trips step, the build-your-own Stay step and the planned view at 1280 are described from the code, not from a screenshot. Every view was entered as an entitled traveller (`?paymock`), as the existing harness does, so the paywall does not interrupt.

The dev server was shared and loaded: from empty storage the walk's first wait ended after 183 s at 380 and 51 s at 1280 with the splash still showing, and the seeded reload reached the first wizard step after 141 s and 128 s. These are dev-server figures (a cold Vite transform on a laptop short of memory), not production ones, and every timing in this brief is a "before" reading only.

Step 1, Booked (screenshot V1-booked-380). "What have you booked already?" with three cards: Travel there, Where you sleep, Nothing yet. Nothing yet is preselected, drawn as an `--accent-bg` card with an accent border and an accent tick, and the primary "Next: From" sits in a footer above the bottom nav. The step rail says "Step 1 of 7" with a terracotta progress bar. Nothing on this screen tells the traveller what the planner will give them at the end, and nothing is priced. On a phone the header, the rail and the footer take the top 152 px and the bottom 145 px (the footer plus the bottom nav) of 800.

Step 2, From. A search field, a Search button and six "Airports within reach" chips with codes and distances in mono (CRL 0 km, BRU 49 km, EIN 128 km). The chips are display only: they look like choices and are not buttons (`GuidedTripWizard.jsx:2531`). From this step on a "Planning around:" recap band joins the stack with chips for what has been answered.

Step 3, When (V1-when-380). A segmented "I know my dates / I'm flexible", a nights stepper ("7 nights" in mono) and 16 month chips as 999 px pills; the chosen month is an accent-bg pill. The note under the months says "Carta will pick the cheapest departure with real stored budget fares." Carta stopped pricing flights on 2026-10-02 (PRODUCT.md), so this line now promises something the product does not do. The same is true of the "±2 days if it's cheaper" chip and of the phone launcher's "prices the flights" (en.js 374, 1386, 1387). At 380 the recap chip "7 nights, Oct 2026" renders larger than its neighbour and runs off the right edge; the cause is `font: inherit` on `.guide-recap-chip.is-link` (`src/styles/19-guide-ratings.css:2178`), which overrides the 10.5 px of the base chip.

On a laptop the same steps run as a centred column under a named seven-step rail (Booked, From, When, Where, Trips, Getting there, Finish), with Back and Next at the bottom right and Start over at the left. Up to Where the screen holds no map and no figure; the wide steps (Where, Trips, Stay) use the full width, the others a narrow form column with most of the 1280 px empty.

Step 4, Where (V1-where-380 and V1-where-1280). Two tabs, "Help me choose" and "Choose by hand". The quiz asks six questions one under another; each answered one folds to a row with a pencil. With the first question open the step body is 4,208 px tall at 380 (walk metrics), with 54 visible controls. After the quiz the step shows "Recommended for you": a photo card per country with a match line ("Hiking, best in October"), three counts as a bulleted list ("1276 rated trails, 61 rated peaks, 395 hidden gems", with no thousands separator), three place thumbnails with ochre rating chips, "+ Add" and "What's there". No match card carries a day cost, although value for money is the first thing the research says travellers weigh, and Carta has that figure for every town. "Choose by hand" shows a Grid / Map toggle nested under the Help / By hand toggle, and a 43-country photo grid with the white country name over a dark gradient scrim (`src/styles/19-guide-ratings.css:1312`); 102 controls are visible at 380 and 109 at 1280. Neither the grid nor the map card shows a cost or a month fact.

The country brief (opened from "What's there"). On a phone it is a sheet: a large photo, then "At a glance" in accent text with an accent icon, a 12-month strip where the good months are `--accent-bg` (`src/styles/24-destination-workspace.css:2323`), "October is one of the best months here." in green, a paragraph, and a definition list ending in "Budget: Mid-priced", a word where Carta has the figure. A sticky accent "+ Add Italy" closes it. At 1280 it is a drawer beside the cards. The month strip uses the accent for data, which carta-design gives to actions.

Step 5, Trips (V1-trips-380). "Pick a trip", the country chip, "Trips for Albania 15", then trip cards that are mostly photograph: at 380 the first card's photo fills the visible area and its route and buttons are below the fold. Every card has its own accent-filled "Choose" (`src/styles/24-destination-workspace.css:2757`): 12 accent fills were visible at once in the walk, plus the primary Next. No trip card carries a cost. The recap band now holds four chips and scrolls sideways. On a phone the footer grows to two rows ("Start over" above Back and Next), so the stack of chrome is about 210 px at the top and 210 px at the bottom: the step itself has about 380 px of an 800 px screen.

Step 6, Getting there (V1-getting-380). The first euro figure of the whole flow appears here, at step 6 of 7: "Estimate so far, 2 travellers, €586" in a new band under the rail. "2 travellers" is set in mono (prose in the measured-facts face) and the figure has no tilde or "est.", although the label calls it an estimate. The step lists the picked trip's stops with mono dates, a journey strip, "Move the whole trip" by a day, and three leg sections (Getting there, Between your stops, Getting home), each with a mode row and outbound links (Google Flights, Skyscanner, Rome2rio, Google Maps). "Travel you have entered: nothing yet" closes it, with "nothing yet" in mono. The trip is "7 days" and six nights while the traveller asked for seven nights; nothing says that one night of the window is unplanned.

Step 7, Finish. "Last touches", a paragraph on who books what, the legs summary with Edit, the travellers stepper and the facts. The primary is "Let Carta arrange it".

The planned trip (V1-planned-380). On a phone a bottom sheet covers all but a sliver of the map. Its top card holds a close cross, the trip name in Fraunces and "08 Oct 2026 → 14 Oct 2026 2 stops" in mono. Under it a pill row: Overview, Day 1 to Day 6, running off the right edge. The overview lists Getting there, Berat (3 nights), a bus leg ("93 km, ~1 h 58 min, estimate, ~€6", correctly marked "est."), Gjirokastër, Getting home, then "Estimated total, 2 people, €771". The wizard said €586 one screen earlier for the same trip: the two totals are computed by different code (the wizard's own `runningEstimate`, `GuidedTripWizard.jsx:1424`, counts stays and daily spend; the planned view's grand total from `src/hooks/useTripPlanner.js` adds legs and transfers) and neither says why they differ. PRODUCT.md's promise is that "no two screens can disagree about what dinner costs"; here two consecutive screens disagree about the trip. The footer is four buttons stacked: "Plan your days" (primary), "Save trip", "Edit stops" and "Start over". The sheet's own scroll is 2,546 px; under the total come "Your days" with a Plan per day, Your bookings with the import zone, notes, packing, the expense ledger, Export and share, then "Travel cheaper" and "Know before you go". The cross in the top card clears the plan without asking (`TripPlannerTab.jsx:430`, which calls `tp.clearPlan()`), while its own code comment says nothing is deleted; "Start over" at least confirms.

Returning visit (read from the code: the walk's reload after the planned view had not repainted after its wait on the loaded server). A reload after the planned view brings the planned trip back, because it lives in `tripDraftStore` (`carta.tripDraft.v1`), which stores `planned`. A reload in the middle of the wizard (read from the code: the walk's own mid-Where reload at 1280 did not repaint within 240 s on the loaded dev server) resumes the step number from `plannerStore` (`carta.plannerDraft.v1`) but not the booked answers, nights, order or pace, so on a path where "booked" changes the step list the number can land on a different step, and picked cities on the build-your-own path come back empty (inventory, from `plannerStore.js` and `GuidedTripWizard.jsx:1754-1806`). Nothing on the first screen of a return says "you were here, this is what you had".

The chat planner. It is in this surface's file list but is not reachable from the trip tab: `CartaChatPlanner`, `TownPickerStep` and `RouteBuildingStage` are mounted only by `src/planner/DayPlannerTab.jsx:3677`. It was inventoried from the code, not walked, and the brief recommends that OWNERSHIP.md moves it to the day planner surface (row T377-h).

The build-your-own path (read from the code). The Trips step offers "Build your own route" (`ReadyTripsStep.jsx:363`), which swaps step 5 for Stay: a city map and list with filters, tier pills, a side panel with Add to trip, and a three-question "Pick my cities" quiz. After it, Getting there shows only "No trip chosen yet. Go back a step and pick one." (`GuidedTripWizard.jsx:2355`), because the legs are built only from a picked ready-made trip. The step is dead on every path but the ready-made one, against its own comment at line 491.

## 3. Inventory

One row per view, state and control. Verdicts: keep, move, merge, remove, rework. "W" is `src/planner/GuidedTripWizard.jsx`, "TPT" is `src/planner/TripPlannerTab.jsx`. Line numbers are from app commit 3b3e5a8. Repeated controls of one kind (twelve trip cards, sixteen month chips) are one row.

### Views and states

| # | View or state | What it is | Drawn by | Verdict |
|---|---|---|---|---|
| 1 | Empty planner: the wizard as the page | No stops and not planned; inline under the app header | TPT 709 | keep |
| 2 | Wizard as a modal over the map | Opened by the launcher or a seed | TPT 1345, W 1915 | rework: no role="dialog", no focus trap, no Escape |
| 3 | Map layout with sheet (phone) or left panel (desktop) | Any trip with stops | TPT 731 | keep |
| 4 | Phone launcher card | Unplanned trip with stops, sheet closed | TPT 746 | remove: its button opens a new wizard instead of the trip it sits on |
| 5 | Planned view | `tp.planned` | TPT 834 | rework (part 6) |
| 6 | Editor ("Edit stops") | Planned is off, trip has stops | TPT 887 | keep, rework controls |
| 7 | Guide call to action with gradient | `!planned && !hasTrip`, never reached because row 1 catches it first | TPT 1303, 11-trip-planner.css:650 | remove (dead code and a gradient) |
| 8 | Know before you go (CountryIntel) | Stops and insights exist | TPT 1316 | merge into the country facts of the planned view |
| 9 | Save toast | After save | TPT 1341 | keep |
| 10 | Load and save errors | "Could not open this trip...", "Your trip did not save..." | TPT 1293, 1335 | keep |
| 11 | Guest and paywall gates | Save as guest asks to sign in; second free save hits the paywall; first planned view nudges the pass | TPT 307, 616, 626 | keep, but the celebrate nudge never covers the total |
| 12 | Step 1 Booked | Three cards | W 2421 | keep, rework selection colour |
| 13 | Step 2 From, plus "Where do you land?" when travel is booked | Origin search, airports, arrival city, outbound mode | W 2474 | keep |
| 14 | Step 3 When | Dates or flexible nights and month | W 2630 | keep, fix copy |
| 15 | Step 4 Where: quiz tab | WhereQuiz and CountryMatchCards | W 2086, WhereQuiz.jsx, CountryMatchCards.jsx | rework (shorter, priced) |
| 16 | Step 4 Where: by hand tab, grid or map | Country grid or CountryPickerMap | W 2160, CountryPickerMap.jsx | rework |
| 17 | Country brief | Sheet on a phone, drawer from 1024 px | CountryBrief.jsx 813 | keep, rework glance |
| 18 | Step 5 Trips | ReadyTripsStep | W 2326 | rework (cost, one accent) |
| 19 | Trip page overlay | Lazy TripPage with "Choose this trip" | W 3497 | keep (journey surface owns the page) |
| 20 | Step 5 Stay (build your own) | City map, list, side panel, quiz | W 2819, CityPickerMap.jsx | keep, rework |
| 21 | Step 5 Stays (beds booked) | Booked route list | W 2738 | keep |
| 22 | Step 6 Getting there | Trip stops, journey strip, legs | W 2351, TravelLegsSection.jsx | rework: works only on the ready-made path |
| 23 | Step 7 Finish | Summary, travellers, facts | W 3240 | keep, merge with the receipt |
| 24 | Steps sheet "Your steps" (phone) | All steps with Edit on done ones | W 3462 | keep |
| 25 | Estimate band | From step 6 only | W 2010 | move: from the first step that has a place |
| 26 | Recap band "Planning around" | Answer chips that jump back | W 2061 | keep, fix chip size |
| 27 | Chat planner (day tab only) | Bot questions, building stage, result, import | CartaChatPlanner.jsx, RouteBuildingStage.jsx, TownPickerStep.jsx | move to the day planner surface |
| 28 | Draft restore | plannerStore and tripDraftStore | plannerStore.js, tripDraftStore.js | rework (restore the whole answer set) |

### Wizard shell and footer

| # | Control | What it does | Where | Drawn by | Verdict |
|---|---|---|---|---|---|
| 29 | Close cross (modal only) | Cancel, confirms discard | Wizard head | W 1927 | keep, 44 px |
| 30 | Step title and "Step x of n" | Names the step | Head | W 1935 | keep |
| 31 | Phone rail button with progress bar | Opens the steps sheet | Head, under 769 px | W 1953 | keep; bar to `--ink-fill` (accent is for actions) |
| 32 | Desktop step rail, seven named steps | Jump back to a done step | Head | W 1975 | keep |
| 33 | Estimate band: figure, delta chip, line chips, Details or Hide | Running total and its lines | Under head | W 2010 | rework: tilde and "est.", same figure as the planned total, no sweep gradient |
| 34 | Estimate breakdown region | Lines and "Total so far" | Band | W 2040 | rework as a receipt |
| 35 | Recap chips | Jump to the step that owns the answer | Under band | W 2065 | keep, fix size |
| 36 | Start over (underlined text) | Confirms, clears the draft | Footer left | W 3403 | keep |
| 37 | Footer status line | "2 cities, 6 nights" or the picked trip with two middots | Footer | W 3408, en.js 3895 | rework: no middots, say unplanned nights |
| 38 | Back | Previous step | Footer | W 3434 | keep |
| 39 | Next: {step} | Next step, disabled until complete | Footer | W 3440 | keep, the one primary |
| 40 | Let Carta arrange it | Finish, hand over to the planned view | Footer | W 3449 | keep |

### Steps 1 to 3

| # | Control | What it does | Drawn by | Verdict |
|---|---|---|---|---|
| 41 | Booked cards (Travel there, Where you sleep, Nothing yet) | Toggle, `aria-pressed` | W 2431, 2447 | rework: selected state `--ink-fill` border and tick, not accent-bg |
| 42 | Booked note | Explains the choice | W 2464 | keep |
| 43 | Origin: chosen place and Change | Shows and resets the origin | W 2486 | keep |
| 44 | Origin search field and Search | Geocodes on explicit action | W 2494, 2503 | keep; 999 px field to 6 px |
| 45 | Origin results | Set origin | W 2514 | keep |
| 46 | Airports within reach chips | Display only, look like buttons | W 2531 | rework: plain mono list, or real choices |
| 47 | Where do you land: city, Change, search, results, empty line | Booked-travel path | W 2555 to 2599 | keep |
| 48 | Outbound mode buttons (Flight, Train, Bus, Car, Ferry) | `aria-pressed` | W 2606 | keep |
| 49 | Dates mode segmented control | Dates or flexible, no `aria-pressed` | W 2638 | rework ARIA, active `--ink-fill` |
| 50 | Range head: Start, End, nights, Clear | Shows the chosen range | W 2655 | keep |
| 51 | Two-pane calendar and "Change the dates" | Picks the range | W 2680, 2691 | keep |
| 52 | "±2 days if it's cheaper" chip and note | Promises fare search Carta does not do | W 2697, en.js 1387 | remove or reword (owner copy call) |
| 53 | Nights stepper | 1 to 21 nights; 24 px buttons | W 2714 | rework to `--tap` |
| 54 | Month chips (Any month plus 15) | Pick a month; no `aria-pressed` | W 2722 | rework: radio group, 6 px, active `--ink-fill` |
| 55 | Flex note | Promises fares | W 2729, en.js 1386 | reword |

### Step 4, Where

| # | Control | What it does | Drawn by | Verdict |
|---|---|---|---|---|
| 56 | Picked country chips with cross | Remove a country | W 2098 | keep |
| 57 | Clear | Clear all countries | W 2109 | keep |
| 58 | Help me choose / Choose by hand tabs | Real tablist with arrow keys | W 2115 | keep, active `--ink-fill` |
| 59 | Quiz question 1 chips in four groups, Done | Pick up to three types | WhereQuiz.jsx 159, 174 | keep; Done is an accent pill: secondary |
| 60 | Quiz questions 2 to 5 (spend, around, distance, pace) | Radio chips without arrow keys | WhereQuiz.jsx 186 to 241 | rework: real radio groups |
| 61 | Quiz question 6 (avoid) | Optional multi-select | WhereQuiz.jsx 257 | keep |
| 62 | Answered question rows with pencil | Reopen a question | WhereQuiz.jsx 47 | keep; collapse the five into one summary line |
| 63 | "Using October, from your dates" | States the month input | WhereQuiz.jsx 272 | keep |
| 64 | Match card: photo, match line, three counts, places, Add, What's there, Show more | Recommend countries | CountryMatchCards.jsx 27 to 136 | rework: day cost line, counts formatted, no bullets |
| 65 | Empty match line | Nothing matches | W 2155 | keep |
| 66 | "Not sure where to go yet?" Google Flights Explore link | Sends the traveller off Carta for fares | W 2163 | keep, but after the countries |
| 67 | Grid / Map toggle | No `aria-pressed`; nested under the tabs | W 2167 | rework |
| 68 | From your shortlist chips | Toggle, accent fill when on | W 2178 | rework: on state `--ink-fill` |
| 69 | Country photo card with name over a scrim | Toggle country | W 2208, 19-guide-ratings.css:1312 | rework: caption band under the photo, no gradient |
| 70 | Round info button on the card | Open the brief | W 2249 | keep |
| 71 | CountryPickerMap: fills, legend, touch card with Add, What's there, cross | Map choice | CountryPickerMap.jsx 226 to 316 | keep; touch card not `role="dialog"`; label font from a token |
| 72 | Brief: close, folds (At a glance to Costs) | Country guide | CountryBrief.jsx 611 to 845 | keep |
| 73 | Brief month strip and verdict | Good months as accent-bg | CountryBrief.jsx 163 | rework: data in ink weight, not accent |
| 74 | Brief "Budget: Mid-priced" | A word in place of the figure | CountryBrief.jsx 209 | rework: the day cost range for the country |
| 75 | Brief place rail, See all, trip rows, Plan this trip | Into a place or a trip | CountryBrief.jsx 231 to 372 | keep |
| 76 | Brief Check flights link | External fare search | CountryBrief.jsx 558 | keep |
| 77 | Brief sticky Add country | Accent primary | CountryBrief.jsx 769 | keep, the one primary of the sheet |
| 78 | Brief skeletons, layer failure and Try again | Loading and error | CountryBrief.jsx 115 to 128 | keep |

### Step 5, Trips, Stay and Stays

| # | Control | What it does | Drawn by | Verdict |
|---|---|---|---|---|
| 79 | Country chips with cross | Remove a country; accent fill on hover | ReadyTripsStep.jsx 288 | rework hover |
| 80 | Loading, error and Try again, empty with Show any length and Build your own | States | ReadyTripsStep.jsx 301 to 316 | keep |
| 81 | Heading "Trips for {countries}" and count | h2 | ReadyTripsStep.jsx 322 | keep |
| 82 | Trip card: days badge, star, route, photo | A ready-made trip | ReadyTripsStep.jsx 150 | rework: shorter photo, cost line |
| 83 | Length chips | Swap variant, `aria-pressed` | ReadyTripsStep.jsx 180 | keep |
| 84 | Choose / Chosen on every card | Pick the trip; accent fill on each | ReadyTripsStep.jsx 194, 24-destination-workspace.css:2757 | rework: secondary, selected state `--ink-fill` |
| 85 | What's there | Open the trip page | ReadyTripsStep.jsx 197 | keep |
| 86 | Show more, other lengths line, Show any length, Back to my days | Paging and widening | ReadyTripsStep.jsx 343 to 358 | keep |
| 87 | Build your own route card | Switch to Stay | ReadyTripsStep.jsx 363 | keep |
| 88 | Back to ready-made trips | Switch back | W 2827 | keep |
| 89 | Carta's route panel and Share out the nights | Suggested order and nights | W 2843 to 2871 | keep |
| 90 | Stay style toggle (change stays / one base) | No `aria-pressed` | W 2894 | rework ARIA |
| 91 | Route templates (two-city, triangle, grand tour) | Apply a template | W 2919 | keep |
| 92 | Pick my cities and its three quiz questions | Design quiz | W 2942 to 2980 | keep; chips get `aria-pressed` |
| 93 | Design my route | Runs the design; accent fill | W 2989 | keep only when it is the one primary in view |
| 94 | City search (English placeholder), Rating and Stay price selects, Clear | Filter the cities | W 3003 to 3037 | rework: i18n |
| 95 | Map / List toggle | No `aria-pressed` | W 3044 | rework |
| 96 | CityPickerMap pills, "Fly here" flag, zoom | Focus a city; accent fill when on | CityPickerMap.jsx 85 to 112 | rework: on state `--ink-fill`, i18n |
| 97 | Side panel idle and focused city: facts, nights stepper, Remove, Add to trip | Choose and size a stop | W 3065 to 3151 | keep; Add to trip is the step's primary |
| 98 | Tier legend | Must-visit, Great stop, Worth a look | W 3168 | keep |
| 99 | List groups and Show all | Cities, gems, beyond, your stops (English titles) | W 3180 to 3235, 1679 | rework: i18n |
| 100 | Stays list: nights stepper, remove, add a stop search, results, empty | Booked beds path | W 2761 to 2812 | keep, steppers to `--tap` |
| 101 | StayRow parts: "you land here" badge, tier chip, price, info button, nights stepper, facts | One city row | GuidedTripWizardParts.jsx 56 to 120 | rework: info button aria-label, badge not an accent fill |

### Steps 6 and 7

| # | Control | What it does | Drawn by | Verdict |
|---|---|---|---|---|
| 102 | "No trip chosen yet" empty line | Shown on every non-ready path | W 2355 | rework: legs from the stops on every path |
| 103 | Your trip, name, Pick another | Un-pick and go back | W 2360 | keep |
| 104 | Opening the trip, error, Try again | States | W 2370 | keep |
| 105 | Stop list and not-in-catalogue line | The trip's stops | W 2378, 2390 | keep |
| 106 | Journey strip (buttons with `role="listitem"`) | Open a leg | TravelLegsSection.jsx 265 | rework: the role hides the button |
| 107 | Move the whole trip, -1 and +1 | Shift the start | TravelLegsSection.jsx 333 | keep |
| 108 | Leg sections and open-jaw hint | Getting there, between, home | TravelLegsSection.jsx 345 | keep |
| 109 | Leg head (route, date, booked tag, mode, figure) | Expand a leg | TravelLegsSection.jsx 213 | keep |
| 110 | Leg mode buttons, Fly into airports, Check on links | Choose mode, go and book | TravelLegsSection.jsx 108 to 153 | keep; say what a leg price includes |
| 111 | Add what you paid, cost and who-with inputs | The traveller's own fare | TravelLegsSection.jsx 159 to 191 | keep |
| 112 | Travel you have entered foot | Sum of own fares | TravelLegsSection.jsx 366 | rework: "nothing yet" in `--ui` |
| 113 | Finish: legs summary with Edit, car advice | Review | W 3251 to 3284 | keep |
| 114 | Finish: travellers and children steppers, children note | Party size, asked only at the end | W 3306 to 3324 | move: the party is asked at From, priced from the start |
| 115 | Finish: facts and cost lines, Estimated total | Summary | W 3326 to 3369 | merge with the receipt (row 34) |

### Planned trip, editor and map

| # | Control | What it does | Drawn by | Verdict |
|---|---|---|---|---|
| 116 | Sheet grip (`role="separator"`) | Drag or key to resize | TPT 764 | keep |
| 117 | Top card cross | Clears the plan without asking | TPT 804 | rework: closes only; clearing stays with Start over |
| 118 | Trip name input | Rename; no focus ring (11-trip-planner.css:199) | TPT 816 | rework focus |
| 119 | Dates and stop count line | Mono facts | TPT 820 | keep |
| 120 | Overview and Day tabs | Plain buttons, pill row runs off screen | TripItinerary.jsx 485 | rework: tablist with arrow keys, or the day track rule |
| 121 | Flight and own-travel rows | Getting there and home | TripItinerary.jsx 504 to 592 | keep |
| 122 | Airport transfer rows, Change, transfer mode buttons | Transfer choice | TripItinerary.jsx 136 to 155 | keep |
| 123 | Stop card (index, thumb, city, dates) | Select stop | TripItinerary.jsx 537 | keep; index badge accent on accent-bg fails contrast (T363-a) |
| 124 | Leg connector with Change, mode buttons, booking links | Between stops | TripItinerary.jsx 234 to 286 | keep |
| 125 | Estimated total toggle and breakdown | The receipt | TripItinerary.jsx 597 to 795 | move up: the first thing under the top card |
| 126 | TransferModePicker | No `aria-pressed` | TripItinerary.jsx 79 | rework ARIA |
| 127 | Travellers stepper in the receipt | 24 px buttons | TripItinerary.jsx 799 | rework to `--tap`; the Lifestyle control beside it |
| 128 | Your days rows with Plan or Edit plan | Into the day planner | TripItinerary.jsx 818 to 832 | keep |
| 129 | Placed extra cross | Remove | TripItinerary.jsx 848 | keep |
| 130 | Your bookings: import zone, booking rows, checkbox, inputs, link, remove, add another | Record what was booked | TripExtras.jsx 43 to 228, MagicImportZone | rework: labels for inputs, aria-labels on icon buttons |
| 131 | Discovered activities inbox | Place found activities on a day | TripExtras.jsx 235 | keep |
| 132 | Trip notes, packing list, add item, add the basics | Notes | TripExtras.jsx 257 to 303 | keep; textarea gets a label |
| 133 | Expense ledger | Spend against the plan | ExpenseLedger.jsx (planned view) | keep |
| 134 | Export and share menu: share, PDF, Google Maps, KML, ICS, copy link | Take the trip out | TripItinerary.jsx 897 to 965 | keep |
| 135 | Day tab: hero with photo scrim, visits, Plan this day | One day | TripItinerary.jsx 969 to 1012, 12-guided-trip.css:1199 | rework: no text on the photo, no gradient; Plan this day secondary |
| 136 | Travel cheaper (tips) | Money advice per country | CheapTipsSection.jsx | rework: i18n (labels and the 103 KB tip file are English only) |
| 137 | Footer: Plan your days, Save trip, Edit stops, Replan route, Start over | Next actions | TPT 663 to 699 | rework: one row, Start over into a menu |
| 138 | Editor: date fields, origin picker, nights ring, stop rows with drag, info, up, down, remove, nights stepper | Edit the route | TPT 910 to 994 | keep; info gets an aria-label, steppers to `--tap` |
| 139 | Editor: transport segmented control, Reorder, add stop dropdowns and Add | Route choices | TPT 1031 to 1092 | rework ARIA |
| 140 | Editor: own fare fields, Remove your fare, Save, Start over, On to getting there | Totals and save | TPT 1120 to 1289 | keep; one primary |
| 141 | Editor: suggestion and shortlist cards | Add a next stop | TPT 220 to 287 | keep; reason chip off-token rgba |
| 142 | Editor leg rows with mode buttons and links | Leg choice | TPT 111 to 154 | keep, `aria-pressed` |
| 143 | TripMap: route line, numbered pins, ferry line, country fill | The trip on a map | src/map/TripMap.jsx | keep; pin titles in English (i18n) |
| 144 | Launcher "Plan your trip" | Accent primary over the map | TPT 752 | remove (row 4) |

### Visual settings

| # | Setting | Where | Verdict |
|---|---|---|---|
| 145 | Four gradients: guide CTA (11:650), estimate sweep (12:633), two photo scrims (12:1140, 1199); one more on the country card (19-guide-ratings.css:1312) | Surface stylesheets | remove all five |
| 146 | 18 shadows that are not `--shadow-1`, `--shadow-2` or `--shadow-card` (11: 9, 12: 7, 21: 2) | Stylesheets | rework to the three tokens |
| 147 | Old accent hue `rgba(200,80,30)` and `rgba(196,90,43)` in five places (11:748, 12:351, 373, 633, 21:417) | Stylesheets | rework to tokens |
| 148 | 22 uses of `border-radius: 999px` (11: 5, 12: 13, 21: 4) | Stylesheets | rework: 999 px only on status chips and round icon buttons |
| 149 | 70 font sizes under 12 px, as small as 9 px (11:394, 833; 12:329) | Stylesheets | rework: 12 px floor for text, 11 px for mono codes |
| 150 | Accent used for data and decoration: icon tints, the month strip, nights and counts in accent text, "At a glance" heading | 11, 12, 21, 24 | rework: accent for actions, the live route and focus only |
| 151 | `.daytrip-reco` accent side stripe (11:746) | Planned view | remove the stripe |
| 152 | Phone chrome stack: header, rail, estimate band, recap band at the top, two-row footer and bottom nav at the bottom | Wizard | rework: about 380 px of 800 is left for the step |
| 153 | Selection colours: accent-bg cards, accent fills, ink fills and accent text on white all mean "selected" | All steps | rework: one selected state, `--ink-fill` with `--on-fill` |
| 154 | Mono for words ("2 travellers", "nothing yet", "7 nights" stepper label) | 12-guided-trip.css, TravelLegsSection | rework: mono only on the figure |

## 4. Critique and technical audit

Method: dual-agent, as reference/critique.md asks (Assessment A: a read-only inventory and design read of the 18 source files; Assessment B: a read-only detector, lint and static check run), with the walk in part 2 as the browser evidence. The overlay injection of critique's Assessment B was not run: it needs a live server of impeccable's own and a mutable tab, and RAM allowed one browser at a time; the CLI detector stands in. Questions skipped: the run is unattended by the owner's instruction.

### Design health

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | The first euro figure appears at step 6 of 7, and the planned total (€771) differs from the wizard's (€586) with no word on why |
| 2 | Match with the real world | 3 | Steps follow how people plan (dates, place, route, legs); "Booked" first is a planner's question, not a traveller's |
| 3 | User control and freedom | 2 | The top-card cross deletes an unsaved trip; a mid-wizard reload loses answers; the recap chips and rail let people go back well |
| 4 | Consistency and standards | 2 | Five looks for "selected", three segmented-control styles, English strings in six places, the chat planner on another tab |
| 5 | Error prevention | 2 | Getting there is dead on the build-your-own path; a 6-night trip fills a 7-night window silently |
| 6 | Recognition rather than recall | 3 | The recap band and the folded quiz answers keep choices visible |
| 7 | Flexibility and efficiency | 2 | Seven steps for everyone; no way to start from a place already found in Explore except the seed link; keyboard reorder only by arrows |
| 8 | Aesthetic and minimalist design | 2 | Twelve accent "Choose" buttons; photographs fill the phone screen while figures are absent; a four-button footer |
| 9 | Recognise and recover from errors | 3 | Every load has a "Try again"; errors say what to do |
| 10 | Help and documentation | 2 | No InfoDot on "est." or on the estimate; the money tips are English only |
| | Total | 23/40 | Acceptable: significant work needed |

Design specificity verdict: partly authored. The receipt in the planned view, the mono leg lines with "est.", the honest "Carta does not sell any of it" Finish copy and the step names are Carta's own. The step pages around them (photo cards with names over scrims, pill chips everywhere, a recommendation quiz) could belong to any travel wizard, and the one thing only Carta can show, the priced day, is held back until the end.

### Priority issues

1. [P1] The price arrives last and disagrees with itself. The research's order of need is "can I afford it" first (section 2), and Carta has a day cost for every town, but no figure appears until step 6, and the planned view's total differs from the wizard's for the same trip. Fix: one running total computed by one function, shown from the first step that has a place (an estimate range per country on the match cards and the brief, per trip on the trip cards), carried unchanged into the planned receipt. Commands: clarify, then layout. Evidence: V1-getting-380, V1-planned-380, `GuidedTripWizard.jsx:1424` against `useTripPlanner.js`.
2. [P1] The accent is spent on everything. Twelve accent-filled "Choose" buttons on Trips, accent-bg selected cards and month chips, accent month strip in the brief, accent text for counts and headings, accent progress bar. carta-design gives the accent to actions, alerts, the live route and focus, with one primary per view. Fix: one selected state in `--ink-fill`, secondaries for per-card actions, the accent only on Next and the live route. Commands: quieter, then polish. Evidence: V1-trips-380 (12 fills counted by the walk), V1-when-380, V1-booked-380.
3. [P1] Phone space goes to chrome, and photographs take the rest. At 380 the header, rail, estimate band, recap band, two-row footer and bottom nav leave about 380 px of 800 for the step; on Trips the first card's photo fills it. Fix: fold the rail and the recap into one line on a phone, a single-row footer, trip and country cards with a short photo and the figures beside it. Commands: distill, adapt. Evidence: V1-trips-380, V1-getting-380.
4. [P1] Destructive and dead paths. The planned view's cross clears the trip without asking (`TripPlannerTab.jsx:430`); Getting there shows "No trip chosen yet" on every path but the ready-made one (`GuidedTripWizard.jsx:2355`); a reload mid-wizard restores the step number without the answers that decide the step list. Fix in V3 before any visual work. Command: harden.
5. [P2] Copy that promises fare search. "prices the flights", "the cheapest departure with real stored budget fares" and "±2 days if it's cheaper" (en.js 374, 1386, 1387) contradict the owner's decision of 2026-10-02. Fix: reword in six languages; the owner approves the words (row T377-c). Command: clarify.

Persona red flags. The first-time undecided traveller (Jordan) answers six quiz questions and still has not seen a price. The phone user on a train (Casey) loses the trip with one tap on the cross. The keyboard user (Sam) cannot leave the modal wizard with Escape and does not see focus on the trip name. The power user (Alex) who found Berat in Explore must still click through Booked, From and When before the place they came with appears.

### Detector and lint (Assessment B)

The impeccable detector found nothing in the 18 JSX files (exit 0; a seeded probe file proved it parses JSX). Over the three surface stylesheets it found three: a side-tab accent stripe at `11-trip-planner.css:746` (true), and layout transitions on the sheet height (:232, partly true) and the grip width (:250, trivial). The design lint reported 213 violations, all in its baseline, 0 new; 23 baseline entries are on this surface (11-trip-planner.css: nine shadow literals, one `outline: none`, one gradient; 12-guided-trip.css: seven shadow literals, three gradients; 21-chat-passes.css: one shadow literal) plus three in en.js (the middots of `ready.footPicked`, and two banned words in the chat keys `chat.compSolo` and `chat.stepsEasy`). No em dash, en dash or middot in the 18 JSX files. Most of the wizard's control styles live outside the three named stylesheets, in 19-guide-ratings.css, 24-destination-workspace.css, 26-shortlist-extras.css, 17-saved-trips.css, 18-detail-panel.css and 20-day-planner-flow.css (row T377-i).

### Technical audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | The modal wizard has no dialog role, focus trap or Escape; the trip name has no focus ring; TownPickerStep tabs and the itinerary tabs have no keyboard model; at least eight segmented toggles lack `aria-pressed`; the planned view's sections are `div` titles, not headings |
| 2 | Performance | 2 | The wizard is one 3,511-line component that re-renders every step; the planned sheet mounts bookings, ledger, tips and intel at once (2,546 px); not measured on a build in V1 |
| 3 | Responsive | 2 | No horizontal scroll at 380 (walk: 0 px on every step), but the recap chip overflows, the day pills run off screen, steppers are 24 to 26 px, and the step gets about 380 px of 800 |
| 4 | Theming | 2 | Tokens for colour and type everywhere, but 18 off-token shadows, five gradients, the old accent hue in five rgba values, and a literal font stack in `CountryPickerMap.jsx:196` |
| 5 | Implementation integrity | 2 | Two cost computations for one trip; an unreachable call to action and launcher; English strings in CheapTipsSection, TripMap, CityPickerMap, TripItinerary month names and four wizard lines |
| | Total | 10/20 | Acceptable: significant work needed |

Harness results on the shared dev server, 2026-10-08, are in the T377 report (Execution/P10/T377-v6-brief-tripplanner.md) and are a "before" reading only: the server took two to three minutes per load, longer than most harness waits. `verify_booked_route.mjs` and `verify_handoffs.mjs` serve `dist/` through `vite preview` and need a build, so they were not run in V1. V3 reruns all ten on a built app (`vite preview`) before changing anything (row T377-a).

Positive findings to keep: the step rail with named steps and "Step x of 7"; the recap chips that jump back to the step that set them; the Where tabs as a correct tablist with arrow keys; every leg estimate marked "est." with a tilde; the "Carta does not sell any of it" voice on Finish; skeletons and "Try again" in the brief and the trip list; images with honest empty `alt`; reduced motion covered by the global floor in `src/styles/02-base.css:98`.

## 5. The traveller's job here

The traveller arrives with a window of nights, a home airport and a budget, and usually without a destination (59 percent, research section 1). What they need, in order:

First, what it costs, from the first place they look at. Value for money is the leading factor for 3 in 5 European travellers (section 2), and the research's planner note asks that "the total re-prices in place without layout jitter, because constraints change mid-plan" (the 2026 interview study, section 1). Today the figure arrives at step 6 and changes at the hand-over. A country card, a match card and a trip card should each say what a day there costs per person at the traveller's Lifestyle, with "est." where it is an estimate.

Second, whether it is good in their month. 74 percent weigh weather risk and 68 percent avoid crowds (section 2). The brief's month strip has this, but in the accent and behind a "What's there" tap; the match line "best in October" is the right idea on the card itself.

Third, how they get there and around without a car, leg by leg with time and price by mode, and in words what a leg price includes (section 3, Rome2Rio's fuel-only car estimates). Getting there does this well on the ready-made path and not at all on the build-your-own path.

Then the route itself: reorder cities by drag with a keyboard and button alternative, nights as a stepper, and the gap between legs shown as time (research, trip planner note). The editor has the arrows and the steppers; the planned view shows legs but not the gaps.

What is missing: a price on every choice card; one total that is the same on every screen; the party size asked when it starts to matter (it is asked on Finish while the estimate has used "2 travellers" since step 2); a word about unplanned nights; the Lifestyle control near the total (carta-design: there is one Lifestyle control, opened from here, never a second slider).

What sits in the wrong place: "Booked" as the first question (it decides the path, but a traveller who has booked nothing is the common case, and the research says most start undecided); the travellers stepper on Finish; the receipt below the route and above "Your days" in the planned view, when it is the first thing a money-first traveller looks for; "Know before you go" and "Travel cheaper" at the end of a 2,546 px sheet.

What sends them away: Google Flights Explore from the Where step ("Not sure where to go yet?"), Google Flights, Skyscanner and Rome2rio on every leg, and Google Flights from the brief. These are honest (Carta does not price flights) and should stay, but the traveller should leave knowing what Carta already priced: the ground cost of the trip should be on screen when they click out. The chat planner, which the surface list names, is on the Day tab: someone looking for "ask Carta to plan it" on the trip tab will not find it.

## 6. Plan (impeccable shape)

Brief per reference/shape.md. Job and audience: one budget traveller, hiker first, planning one holiday of a few towns, mostly on a phone for choosing and on a laptop for comparing (research section 5); Operate. Outcome: a priced, saved route whose total is the same on every screen, with the cost visible at every choice. Direction: refinement inside Carta's world; the stepped wizard, the map with its sheet, the receipt and the mono "est." voice stay. Boundaries: no new token, no new colour, no gradient, no second Lifestyle control, no flight figure of Carta's, nothing in part 7 built before T380 accepts it, the trip page itself stays with the journey surface and the chat planner with the day planner. States: cold first run, returning with a draft, returning with a planned trip, entitled and guest, each step's empty, loading and error, the three paths (ready-made, build your own, beds booked), the planned view, the editor, a shared link. Assumptions, stated because no human answered: the step order stays seven steps in V3 (the owner may later cut Booked into a question inside From, row T377-d); the copy for the fare-promise lines is the owner's call (row T377-c).

Every item names the change, the files, the impeccable command and the check. Files are app repo paths. `src/styles/67-v6-tripplanner.css` is the v6 stylesheet T380 creates; new rules go there, and an old rule is deleted from its file in the same commit that replaces it.

### V3: structure, information and flow

1. Fix what loses or misleads before anything else. The top-card cross only closes the overview (no `clearPlan`); Getting there builds its legs from the stops on every path, not only from a picked trip; the draft stores and restores `booked`, `nights`, `order`, `travelValues`, `arrivalId` and `pace`, so a reload lands on the same named step with the same answers. Files: `src/planner/TripPlannerTab.jsx` (`handleExitOverview`), `src/planner/GuidedTripWizard.jsx` (Getting step, persistence effect), `src/planner/plannerStore.js`, `tests/plannerStore.test.mjs` (new). Command: harden. Check: the cross never empties a trip; the build-your-own path reaches Finish with legs; a reload on Stay shows the picked cities; verify_planner_v2_flow and verify_booked_route pass.
2. One total, one function. The wizard's running estimate and the planned view's grand total come from one pricing function (the planner hook's), so the figure on Getting there equals the figure in the receipt for the same inputs; the band shows a tilde and "est." and the per-person figure beside the group figure. Files: W (`runningEstimate`), `src/hooks/useTripPlanner.js` (exported pure total, read only by W), `tests/` (a unit test that both views agree). Command: clarify. Check: the walk's €586 and €771 become one figure; a test pins it.
3. The price from the first place. The estimate band appears from the first step that has a place; match cards, the country grid and the brief show the country's day cost per person at the traveller's Lifestyle; trip cards show the trip's ground total for the party. Every figure from the same pricing source as Explore's, in mono, with "est." where it is an estimate. Files: `src/planner/CountryMatchCards.jsx`, `src/planner/CountryBrief.jsx` (Budget row becomes the figure), `src/planner/ReadyTripsStep.jsx`, W (grid cards), `src/lib/costIndex.js` (read only), six i18n catalogues. Command: clarify. Check: no choice card without a figure; the Albania trip card's figure equals the receipt after picking it. Needs N1.
4. Ask the party with the origin. The travellers and children steppers move from Finish to From ("Who is going, from where"), so every estimate prices the real party from the start; the recap chip stops saying "2 travellers" before anyone was asked. Files: W (From and Finish steps), six catalogues. Command: layout. Check: changing travellers on From moves the band's figure; Finish shows the party read-only with Edit.
5. Say the unplanned nights. When the picked trip is shorter than the window, the footer status and the receipt say so in words ("6 of 7 nights planned. One night is free."), and the footer status drops its middots. Files: W footer, en.js and five more catalogues (`ready.footPicked`). Command: clarify. Check: no middot in the planner strings (design lint baseline loses the entry).
6. A calm planned view in the research's order. Under the top card: the receipt (total first, per person beside it, the Lifestyle button and the travellers stepper beside it), then the route with legs and the time gap between legs, then Your days, then bookings, notes and packing folded, then "Know before you go" and "Travel cheaper" merged into one country facts fold, then Export. Files: TPT, `src/planner/TripItinerary.jsx`, `src/planner/TripExtras.jsx`, `src/planner/CheapTipsSection.jsx`, 67-v6-tripplanner.css. Command: distill, then layout. Check: the total is in the first 400 px of the sheet at 380; sheet height down from 2,546 px with the folds closed; verify_planner_v2 passes.
7. One footer row. The planned footer becomes Plan your days (primary) and Save trip (secondary) in one row, with Edit stops, Replan route and Start over in a "More" menu; the wizard footer on a phone is one row (Start over moves into the steps sheet). Files: TPT `plannedActionButtons`, W footer and steps sheet, 67-v6-tripplanner.css. Command: distill. Check: the phone footer is at most 64 px above the bottom nav on every step.
8. Shorter Where. The five answered quiz rows fold into one summary line with one Edit ("Hidden gems, hiking, shoestring, trains and buses, anywhere, a few stops"); the match cards appear right under it; the Google Flights Explore link moves under the cards. Files: `src/planner/WhereQuiz.jsx`, W, six catalogues. Command: distill. Check: at 380 the first match card starts within the first screen after the last answer; verify_where_quiz passes (update, with a comment, any assertion that counts the answered rows).
9. Trip cards that read as a choice. A shorter photo (no more than a third of the card), route, days, the ground total and Choose as a secondary; the selected card gets the `--ink-fill` selected state. Files: ReadyTripsStep.jsx, 24-destination-workspace.css (old `.wtrip-*` rules out), 67-v6-tripplanner.css. Command: layout. Check: two trip cards visible at 380; zero accent fills on cards; verify_ready_trips passes.
10. Remove what nobody reaches. The unreachable guide call to action (TPT 1303 and its gradient at 11-trip-planner.css:650) and the phone launcher that opens a new wizard over an existing trip (TPT 746). Files: TPT, 11-trip-planner.css. Command: distill. Check: grep finds neither class; a restored unplanned trip opens the editor.
11. Copy that matches the product. The three fare-promise strings reworded to what Carta does (it prices the ground; the traveller adds their fare), in six languages, owner-approved words. Files: six catalogues. Command: clarify. Check: no planner string says Carta finds or prices fares. Owner row T377-c.
12. English strings into the catalogues: CheapTipsSection labels and summary lines, the wizard's stays line and list group titles and city search placeholder, TripMap's pin titles, CityPickerMap's "Fly here", TripItinerary's month and weekday names through `Intl.DateTimeFormat`. The tip texts themselves (103 KB of English in `src/lib/cheapTips.json`) need a translation pass that is data work, not design (row T377-f). Files: the named components, six catalogues. Command: harden. Check: switching to de shows no English label on the surface.
13. Ownership hand-offs written into OWNERSHIP.md by T380, not built here: the chat planner (CartaChatPlanner, TownPickerStep, RouteBuildingStage, the chat half of 21-chat-passes.css) to the day planner surface; the wizard's control styles in 19-guide-ratings.css, 24-destination-workspace.css (`.wtrip`, `.cbrief`, `.mcard`, `.guide-booked`), 26-shortlist-extras.css, 17-saved-trips.css, 18-detail-panel.css and 20-day-planner-flow.css to this surface, moved into 67-v6-tripplanner.css by the V3 session that owns it.

### V4: visual and dynamic, inside the palette

1. One selected state. Every choice on the surface (booked cards, month chips, quiz chips, shortlist chips, country cards, trip cards, city pills, segmented controls, day tabs) shows selection the same way: `--ink-fill` with `--on-fill` text for chips and segments, a `2px solid var(--ink)` border and an ink tick for cards. The accent is left to Next, Add to trip, the brief's Add and the live route. Files: 67-v6-tripplanner.css (the old rules removed from 12, 19, 24, 26), W, WhereQuiz.jsx, CountryMatchCards.jsx, ReadyTripsStep.jsx, CityPickerMap.jsx. Command: quieter. Check: the walk counts at most one accent fill per view on every step (Trips today: 12); seven questions, question 5.
2. Photographs under captions, no gradients. Country cards, the trip hero and the day hero put the name on a `--paper` caption band under the photograph, the PlaceCard pattern; the scrims at 19-guide-ratings.css:1312 and 12-guided-trip.css:1140 and 1199, the estimate sweep at 12:633 and the guide CTA at 11:650 are deleted. Files: W, TripItinerary.jsx, ReadyTripsStep.jsx, 67-v6-tripplanner.css. Command: quieter. Check: `grep -n gradient` over the surface's stylesheets returns only the two solid rule lines at 19-guide-ratings.css:1587 and 1690 (or none, if those become borders). Needs N5.
3. The receipt as the hero of the planned view. The planned total is set as carta-design's receipt: `--paper-dim` header with the route, one hairline line per component (stays, daily life, legs, transfers, the traveller's own fare when entered) with the figure right-aligned in mono, the `2px solid var(--ink)` rule, the sum, and an `--accent-bg` footer saying what one changed input would do ("One more night in Berat: +€41.20"). A cost bar may sit above it (carta-design's cost bar rule). Files: TripItinerary.jsx (breakdown), 67-v6-tripplanner.css. Command: typeset. Check: no rounded line items; the footer sentence carries a figure.
4. The total moves, the layout does not. When an input changes, the figure updates in place with tabular numerals and a 150 ms opacity change on the changed digits' container, and the delta chip says "+€12.40" in words beside it; no sweep, no bump scale. Reduced motion: no transition. Files: W band, TripItinerary.jsx, 67-v6-tripplanner.css. Command: animate. Check: no layout shift when the figure changes (the box keeps its width); transitions on opacity and transform only, under 300 ms. Needs N2.
5. The route draws itself once. In the planned view the route line on TripMap appears stop by stop when the view opens (stroke-dashoffset or a staged reveal under 300 ms per leg, total under 900 ms), the live leg in the accent and the others in ink; reduced motion shows it whole. Files: `src/map/TripMap.jsx`, 67-v6-tripplanner.css. Command: animate. Check: reduced motion shows the full route on first paint. Needs N3.
6. Legs with time between them. Between stops the leg connector shows the gap as time and the mode as a word and icon, and the leg price says what it includes ("bus fare, per person, est."). Files: TripItinerary.jsx, TravelLegsSection.jsx, six catalogues. Command: clarify. Check: every leg line has a time, a mode and an inclusion phrase.
7. Day by day as the day track. The Overview and Day pills become the carta-design day track (one card per day, scroll-snap, "Day 3 of 6" in mono, Previous and Next, arrow keys, dots), with Overview staying a separate tab. Files: TripItinerary.jsx, 67-v6-tripplanner.css. Command: layout. Check: every day reachable from Your days as a link; verify_planner_v2 day tab checks pass.
8. Match cards that read like an instrument. Counts formatted through `Intl.NumberFormat` ("1,276 walks"), as a run of labelled mono values like PlaceCard's three, not a bulleted list; the month verdict and the day cost on the card; ochre rating chips stay. Files: CountryMatchCards.jsx, 67-v6-tripplanner.css. Command: typeset. Check: no bullet glyph on the surface; every figure labelled.
9. The country brief's glance as data. Months in the ink ramp with the traveller's month outlined and the verdict in words; "At a glance" in `--ink`; the budget as the day cost range. Files: CountryBrief.jsx, 24-destination-workspace.css (rules moved), 67-v6-tripplanner.css. Command: colorize (restraint). Check: no accent on the month strip. Needs N4.
10. Shared element into the planned view. The picked trip card or the last step's summary card becomes the planned view's top card through the existing shared-element helper, so the hand-over reads as one object continuing. Files: W, TPT, `src/lib/sharedElement.js` (read only unless its owner agrees). Command: animate. Check: reduced motion jumps; the keyboard path lands focus on the top card's heading.

### V5: harden, adapt and polish

1. Dialogs and focus. The modal wizard gets `role="dialog"`, `aria-modal`, `useFocusTrap`, Escape (through the shared escape stack in the capture phase) and a `--ink` 28 percent scrim per the modal rule; the CountryPickerMap touch card becomes a plain region; the trip name gets a visible focus border. Files: W, `src/map/CountryPickerMap.jsx`, TPT, 67-v6-tripplanner.css. Command: harden. Check: scripts/verify_keyboard.mjs 20 of 20; Escape closes the modal and focus returns to its opener.
2. Real controls for every toggle. `aria-pressed` on the eight segmented and chip toggles that lack it; radio groups with arrow keys for the quiz's single-choice questions and the month chips; the itinerary tabs as a tablist with arrow keys or the day track of V4-7; the journey strip's buttons keep their button role. Files: W, WhereQuiz.jsx, TripItinerary.jsx, TravelLegsSection.jsx, TPT. Command: harden. Check: screen reader announces state on every toggle; verify_when_step passes.
3. Headings. The planned view's section titles become h2 and h3 in order under the one h1; RouteBuildingStage's title stays with the day planner. Files: TPT, TripItinerary.jsx, TripExtras.jsx. Command: harden. Check: one h1 per view, no skipped level.
4. Tap targets and small type. Every stepper, cross and move button reaches `--tap` on a coarse pointer (32 px allowed on a fine pointer); text under 12 px goes to 12 px except mono codes at 11 px. Files: 11-trip-planner.css, 12-guided-trip.css, 26-shortlist-extras.css (rules moved), 67-v6-tripplanner.css. Command: polish. Check: shoot-planners.mjs reports zero small targets at 375; the 70 sub-12 px declarations drop to the mono-code exceptions.
5. Tokens only. The 18 off-token shadows become `--shadow-1`, `--shadow-2` or `--shadow-card`; the five old-accent rgba values become tokens; 999 px radii stay only on status chips and round icon buttons; the side stripe at 11:746 goes; CountryPickerMap's label font comes from a token mirror. Files: 11, 12, 21 (planner half), 67-v6-tripplanner.css, CountryPickerMap.jsx. Command: polish. Check: the design lint baseline loses the 23 surface entries and gains none.
6. Labels on inputs. TripExtras' booking fields, the notes textarea, the packing input and the city search get visible or `aria-label` labels; the icon-only info and remove buttons get `aria-label`s naming their object. Files: TripExtras.jsx, TPT, GuidedTripWizardParts.jsx, W. Command: harden. Check: no unlabelled input in an axe pass on the planned view.
7. Long words and narrow screens. German and Dutch step names, quiz chips and footer buttons wrap without overflow at 360 px; the recap band never runs off the edge. Files: 67-v6-tripplanner.css. Command: adapt. Check: screenshots in de and nl at 360 px, no horizontal scroll, the recap chip fix holds.
8. Weight. Split the planned view's folds so bookings, ledger, tips and intel mount when opened; measure the planned view's first render and the wizard's step change on a build before and after. Files: TPT, TripItinerary.jsx. Command: optimize. Check: before and after figures in the V5 report.
9. Harness upkeep. Rerun the ten harnesses on a built app; an assertion that encodes the old design (accent Choose buttons, the answered quiz rows, the travellers stepper on Finish) is updated with a comment, never deleted. Files: the harnesses under `scripts/`. Command: audit. Check: all ten green on a build.

### Target state: every button and control on the surface

| Control | Today | Target |
|---|---|---|
| Next: {step} | Accent primary | Accent primary, the one per view |
| Let Carta arrange it | Accent primary | Accent primary |
| Back | Secondary | Secondary |
| Start over (wizard) | Underlined text in the footer | Item in the steps sheet and the desktop footer, confirms |
| Close cross (modal wizard) | 30 px, no Escape | 44 px, Escape, focus returns |
| Phone rail button and steps sheet | Accent progress bar | `--ink-fill` bar |
| Desktop step rail | Named steps, done ones clickable | Keep |
| Estimate band and Details | From step 6, own computation, no "est." | From the first place, one computation, tilde and "est.", per person beside group |
| Recap chips | Linked chip oversized | One size, `--tap` on a phone |
| Booked cards (3) | Accent-bg selected | Ink border and tick |
| Origin search and Search | 999 px field | 6 px field |
| Airports within reach | Chips that are not buttons | Plain mono list |
| Party steppers (travellers, children) | On Finish, 24 px | On From, `--tap` |
| Outbound mode buttons | `aria-pressed` | Keep, ink selected state |
| Dates mode segmented control | No `aria-pressed`, accent text | `aria-pressed`, `--ink-fill` |
| Calendar, Change the dates, Clear | Keep | Keep |
| ±2 days chip | Promises fare search | Removed or reworded (owner) |
| Nights stepper | 24 px | `--tap` |
| Month chips (16) | Accent-bg pills, no state | Radio group, `--ink-fill`, 6 px |
| Help me choose / Choose by hand | Tablist, accent text | Tablist, `--ink-fill` |
| Quiz chips and Done | Accent Done pill | Secondary Done; radio groups for single choice |
| Answered quiz rows (5) | Five rows with pencils | One summary line with Edit |
| Match card Add / What's there / Show more | Add, What's there | Add (secondary, ink when on), What's there, plus the day cost |
| Google Flights Explore link | Above the countries | Below the countries |
| Grid / Map toggle | No `aria-pressed` | Segmented with `aria-pressed` |
| Shortlist chips | Accent fill when on | `--ink-fill` when on |
| Country photo card and info button | Name on scrim | Caption band, day cost, info button kept |
| CountryPickerMap touch card Add / What's there / cross | Accent Add, `role="dialog"` | Secondary Add, region, 44 px cross |
| Brief close, folds, place rail, See all, trip rows, Plan this trip, Check flights | Keep | Keep |
| Brief Add country (sticky) | Accent primary | Accent primary |
| Picked country chips and Clear | Keep | Keep |
| Trip card Choose | Accent fill on every card | Secondary; selected card ink border |
| Trip card What's there, length chips, Show more, Show any length, Build your own | Keep | Keep |
| Stay step: templates, Share out the nights, stay style toggle, Pick my cities, quiz chips | Toggles without state | `aria-pressed`, ink selected |
| Design my route | Accent fill | Accent only when it is the view's one primary |
| City search, Rating, Stay price, Clear, Map / List | English placeholder, no state | Translated, `aria-pressed` |
| City pills on the map | Accent fill when on | `--ink-fill` when on |
| Add to trip / Make this my base, Remove, nights stepper | Accent Add | Accent Add as the step's primary, stepper `--tap` |
| Stays list stepper, remove, add a stop | 26 px | `--tap` |
| Getting there: Pick another, journey strip, Move the whole trip | Strip buttons hidden as list items | Buttons with their role |
| Leg mode buttons, Fly into, Check on links, Add what you paid | Keep | Keep, with an inclusion phrase on each price |
| Finish Edit | Keep | Keep |
| Planned top card cross | Clears the plan | Closes the overview only |
| Trip name input | No focus ring | Focus border |
| Overview and Day tabs | Pills off screen | Overview tab plus the day track |
| Transfer Change and mode buttons | No `aria-pressed` on the picker | `aria-pressed` |
| Leg connector Change, mode buttons, booking links | Keep | Keep |
| Estimated total toggle | Below the route | The receipt, first under the top card |
| Receipt travellers stepper | 24 px | `--tap`, beside the Lifestyle button |
| Lifestyle button | Not on the planned view | The shared Lifestyle control, opened from the receipt |
| Your days Plan / Edit plan | Keep | Keep |
| Bookings: import, checkbox, inputs, link, remove, add another | Unlabelled inputs, title-only icons | Labels and aria-labels |
| Discovered activities, notes, packing | Keep | Keep, folded |
| Export and share menu (6 items) | Keep | Keep |
| Plan this day in the Day planner | Accent fill (second primary) | Secondary |
| Travel cheaper toggle | English | Translated, merged into country facts |
| Plan your days | Accent primary | Accent primary |
| Save trip / Update trip | Secondary under it | Secondary in the same row |
| Edit stops, Replan route, Start over (planned) | Three stacked buttons | A "More" menu; Start over confirms |
| Editor: dates, origin, stop row tools, info, steppers, transport control, Reorder, add stop, Add, own fare fields, Save, On to getting there | Mixed states and sizes | `aria-pressed`, `--tap`, one primary |
| Editor suggestion and shortlist cards | Off-token reason chip | Token chip |
| Map pins and route | English titles | Translated titles; route draws once (V4-5) |
| Phone launcher Plan your trip | Opens a new wizard | Removed |
| Guide call to action | Unreachable, gradient | Removed |

## 7. Needs a rule

Each proposal below is something carta-design does not cover today. T380 accepts or rejects each before anything that depends on it is built.

N1. Cost on choice cards. Rule: a card that offers a place or a trip as a choice carries one mono line with the day cost per person at the traveller's Lifestyle (or the trip's ground total for the party), from the same source as Explore and the receipt, with a tilde and "est." where it is an estimate, and no figure when the data is too thin.

N2. Reprice motion. Rule: when an input changes a total, the figure updates in place in tabular mono with at most a 150 ms opacity change and a delta in words ("+€12.40") beside it for three seconds; no count-up, no scale bump, no sweep; none under reduced motion.

N3. Route reveal. Rule: a trip map may draw its route once, leg by leg, when a planned trip first opens: under 300 ms per leg and 900 ms in all, the live leg in the accent and the others in ink, never on scroll and never repeated; reduced motion shows it whole.

N4. Month strip. Rule: a twelve-month strip shows good months in the ink ramp (filled `--ink-fill` or `--kind-town` weight), the traveller's month outlined in `--ink`, the verdict in words beside it; never the accent, never green as the only carrier.

N5. Captions under photographs. Rule: on a choice card, the name and any figure sit on a `--paper` caption band under the photograph, never on the photograph; the photograph takes at most a third of the card's height on a phone.

N6. One selected state. Rule: a selected chip, segment or tab is `--ink-fill` with `--on-fill` text; a selected card has a `2px solid var(--ink)` border and an ink tick; `--accent-bg` is never a selected state.

N7. Wizard chrome on a phone. Rule: a multi-step flow on a phone keeps its fixed chrome (rail, running total, recap, footer) to at most 200 px of an 800 px screen together, the footer in one row.

N8. "More" menu for secondary actions. Rule: when a view has more than two secondary actions in its footer, the rest go into one "More" menu button (secondary, `--tap`), and a destructive item in it is `--danger` text with a confirm.

## Files the build waves will touch

App repo, by wave. V3: `src/planner/TripPlannerTab.jsx`, `src/planner/GuidedTripWizard.jsx`, `src/planner/GuidedTripWizardParts.jsx`, `src/planner/plannerStore.js`, `src/planner/WhereQuiz.jsx`, `src/planner/CountryMatchCards.jsx`, `src/planner/CountryBrief.jsx`, `src/planner/ReadyTripsStep.jsx`, `src/planner/TravelLegsSection.jsx`, `src/planner/TripItinerary.jsx`, `src/planner/TripExtras.jsx`, `src/planner/CheapTipsSection.jsx`, `src/planner/PlannerSection.jsx`, `src/hooks/useTripPlanner.js` (one exported total), `src/lib/costIndex.js` (read), the six catalogues `src/i18n/{en,de,es,fr,it,nl}.js`, `src/styles/67-v6-tripplanner.css`, `src/styles/11-trip-planner.css`, `src/styles/24-destination-workspace.css` (the `.wtrip`, `.cbrief`, `.mcard` and `.guide-booked` rules out), `tests/plannerStore.test.mjs` (new) and a new pricing agreement test under `tests/`. V4: the same components plus `src/map/TripMap.jsx`, `src/map/CityPickerMap.jsx`, `src/map/CountryPickerMap.jsx`, `src/lib/sharedElement.js` (read), `src/styles/12-guided-trip.css`, `src/styles/19-guide-ratings.css`, `src/styles/26-shortlist-extras.css`. V5: the same plus `src/styles/21-chat-passes.css` (the planner rules only, if any remain after the chat half moves), `src/styles/17-saved-trips.css`, `src/styles/18-detail-panel.css`, `src/styles/20-day-planner-flow.css` (only the planner rules found there) and the harnesses `scripts/verify_planner_v2.mjs`, `verify_planner_v2_flow.mjs`, `verify_planner_t8.mjs`, `verify_where_quiz.mjs`, `verify_when_step.mjs`, `verify_ready_trips.mjs`, `verify_country_brief.mjs`, `verify_booked_route.mjs`, `verify_handoffs.mjs`, `shoot-planners.mjs` (assertions updated with a comment, never deleted). Not touched by this surface: `src/planner/CartaChatPlanner.jsx`, `src/planner/TownPickerStep.jsx`, `src/planner/RouteBuildingStage.jsx` (to the day planner surface, row T377-h), the trip page (journey surface) and the Lifestyle panel (shell surface).
