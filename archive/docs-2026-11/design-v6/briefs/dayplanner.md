# Design brief: Day planner (key 'dayplanner')

Written by T378 in design wave V1, 2026-10-08. This is the brief that V3, V4 and V5 build the Day planner from. It plans; it builds nothing. App paths are in the app repo and are written as `src/...`. OWNERSHIP.md (written in V2 by T380) is the authority on who may edit a shared file; where this brief names a file another surface also draws, it says so.

The surface is the tab at `?tab=day`, labelled "Day planner" in the desktop header and reached on a phone through the bottom bar's plus. It has two halves. The landing is a four-step flow (Stay, When, Ideas, How) that forks into the Carta bot chat or the "Build it myself" builder. The workspace is an open plan: a map with a sheet under it (beside it on desktop) holding three tabs, Today's plan, Add more and Files, plus a floating Carta bot. The main file is `src/planner/DayPlannerTab.jsx` (4,232 lines; `wc -l`), which keeps all the state and renders both halves.

## 1. Setup and mode

Impeccable context was run once from the root worktree with a relative target (`impeccable context --target src/planner/DayPlannerTab.jsx`). Run from there it found PRODUCT.md and DESIGN.md at the repo root and loaded both; it found no surface brief (`surfaceBriefReason: not-found`), which is what this file now is. The target file itself lives in the app repo, so `targetExists` was false; the source was read from the main checkout. The impeccable references critique.md, audit.md, shape.md and operate.md were read, with the carta-design skill and `docs/design-v6/TRIP-PLANNING-RESEARCH.md`.

The run is unattended and the owner told every session to proceed (2026-10-07). This is the "user tells you to proceed" case of impeccable's AUTONOMY_DIRECTIVE_CHECK, so shape's discovery questions and critique's closing questions were answered from the brief, PRODUCT.md and the research instead of asked. Every such choice took the option that keeps Carta's palette, type and identity. This is refinement, not redesign: impeccable's "Refinement preserves" applies.

Mode: **Operate.** The traveller in the day planner is doing a task: building one day from real places around where they sleep, then following it on the day with a phone in one hand. Success is a day they can walk, at a cost they know, not a page that persuaded them. operate.md fits: scanability and consistency over expression, motion only for state, density as a feature, every component with its full set of states. PRODUCT.md already names it: "The day planner builds a clock-based day from the POI catalogue. Each is a table of measured numbers first and a picture second." Today the surface is a picture first and has no numbers about money at all.

## 2. The walk

The traveller is the one in TRIP-PLANNING-RESEARCH.md, at the day-planner moment: a hiker or budget city traveller who has picked a town and now plans one day there, often the evening before or on the morning itself (85% choose activities after arriving, research section 1; the trip itself happens on the phone, section 5). They want the map, the next stop, the walking time to it and what the day costs.

The walk ran with Playwright on the shared dev server (`http://localhost:5199/?tab=day&o=CRL`) at 380 x 800 and 1280 x 800: a cold start with empty storage, the full landing flow (Rome, Hotel Artemide, with the geocoder answered from a fixture as the harnesses do), the builder, and a returning visit with one saved day plan (Salzburg, four stops, seeded as `verify_day_workspace` seeds it). Measurements are in the scratch walk files (`walk-flow-380.json`, `walk-flow-1280.json`, `walk-ws-380.json`, `walk-ws-1280.json`, `walk-cold-*.json`) in the session scratchpad. The shared server was overloaded by ten sessions and stopped answering for about fifteen minutes; photos often did not load, so grey placeholders in the screenshots are not judged here.

Cold start, phone (V1-landing-380). No welcome overlay: the tab opens on step 1. Above the question sit the header, a "Stay, Step 1 of 4" line with a 44 px info circle, and the four-step rail; the question card ("Where does your day start?") starts about 195 px down. Under it, "Continue a trip" with an ochre-free but accent-tinted icon tile and a full-width terracotta "Sign in". That "Sign in" is the only accent-filled control on the screen (`walk-flow-380.json` accentFilled), so the page's visual answer to "what do I do here" is to sign in, not to type the address. Desktop (V1-landing-1280) is the same column centred, with the same lone terracotta "Sign in".

The flow (stay-results, stay-chosen, date, ideas, fork in the scratch set). Each step is one question with a Fraunces heading, and the chosen stay rides above later steps as a banner with a "Change" button. The date step offers Today, Tomorrow, This weekend and an inline calendar with 44 px days. The ideas step asks "Anything you already want to do?" with two large choices. The fork (V1-fork-380, fork-1280) shows two cards: "Let Carta plan it", filled `--accent-bg` with a terracotta icon tile, a filled "Recommended" pill, terracotta title and a terracotta button; and "Build it myself", which also wears an accent border. On a phone the first card is 390 px tall and the second starts at 762 px, under the bottom bar (`walk-flow-380.json` fork-380); its button sits under the bar's plus.

The builder (V1-builder-1280, builder-380, builder-tray-380/1280). From a Rome hotel the builder leads with "Beaches and lakes" and "Towns worth the trip"; cards say "87 km, about 154 min drive" with "Day trip, ~2h10" in mono. The step rail above still reads "How, Step 4 of 4". Picking Tivoli and Civita di Bagnoregio gives the tray "2 places, about 0 steps": a wrong figure set as a fact, because towns never reach the step count (`DayExploreBuilder.jsx` builds the tray's steps from POI picks only). Nothing says what the day costs, or that two towns 26 and 87 km apart do not fit one day without a car.

Returning visit (V1-returning-380). The returning traveller lands on step 1 again. Their saved "Salzburg day" sits under the sign-in card, below the fold on a phone; they must scroll past a question they already answered to reach their plan.

The workspace, phone (V1-workspace-380). Opening the plan resolves four stops in about 1.6 s on the dev server (`walk-ws-380.json` wsLoadMs). The map takes the top 330 px: 43 POI pins, most of them terracotta stars, plus the four numbered route pins, also terracotta. Over the map: "Staying / Add your stay" and a bulb button. The sheet then stacks the plan title in Fraunces with a green "Saved" chip, "Salzburg, 14 Oct" in mono, "4 stops | 3,000 steps on foot | done ~14:00" in mono, a city chip row ("Salzburg" in mono on `--accent-bg`, "+ City"), a day chip row ("Day 1" the same, "+ Day"), the three tabs, and a toolbar with an ink plus and a share button. The first stop row starts at about 670 px, under the terracotta "Carta" bot button, with the bottom bar at 725 px (`walk-ws-380.json` inViewNames). Ten controls sit above the first stop. The rows carry a photo, the name, the kind and three 26 px controls (up, down, remove). No row says when, how far to the next stop or what it costs. There is no h1 in the workspace (`walk-ws-380.json` h1 is empty).

The workspace, desktop (V1-workspace-1280). A 440 px left column holds the same stack; the map fills the rest. The first stop sits at about 375 px and all four rows fit. The Carta bot sits bottom right over the map attribution.

Add more (V1-add-380, tab1-1280). The filter card (All 43, Sights 27, Nature 14, Active 2, Any rating, Only my picks 4) opens over the map and covers half of it; the sheet shows Ready-made and Custom sub-tabs and "Use this day" cards, each filled terracotta (`walk-ws-380.json` tab1-380 accentFilled lists "Use this day" and "Carta").

Files (tab2-380, tab2-1280). Documents stay on the device and the panel says so plainly, which is good. Under it, the import drop zone and a URL field with an "Extract" button 29 px high.

Popovers and exports (pop0 to pop3, bot-380). The stay popover, the Local tips dialog (with "Austria Moderate prices €65-130/day" from CountryIntel), the plus menu and the share menu all work. On a phone the share menu opens downward under the Carta bot and the bottom bar, so "Download PDF", "Google My Maps (.kml)" and "Add to calendar (.ics)" are off the visible screen (pop3-380). The bot menu offers six prompts, one of which ("Put the stops in walking order") repeats the plus menu's "Reorder the route".

Where the traveller is sent away: to the destination page or Explore for anything about money (the day planner shows no euro figure except a day-trip fare in `DayTripTransport.jsx`); to Google Maps for walking times between stops and for opening hours; to the trip planner to see the stay. On the day itself, to Google Maps for everything, because the plan rows carry no time or distance.

Before screenshots, saved outside both repos in `C:\Users\Gebruiker\Documents\Portfolio\design-v6-shots\dayplanner\`: V1-landing-380, V1-landing-1280, V1-fork-380, V1-builder-1280, V1-returning-380, V1-workspace-380, V1-workspace-1280, V1-add-380 (.jpg). Build waves save their after set under the same view names.

## 3. Inventory

One row per view, state, control and visual setting. File is the file that draws it (`src/planner/` omitted unless another folder). The control rows come from a full sweep of the surface files (198 distinct controls counted once per repeated group, plus 36 empty, loading, error and info states); line numbers are from the main checkout on 2026-10-08. Verdicts: keep, move, merge, remove, rework.

### Views and states

| # | Item | What it does | Where | File | Verdict |
|---|---|---|---|---|---|
| F0 | Landing shell | Everything before a plan opens | Whole tab | DayPlannerTab.jsx 3240 | rework: a returning traveller's plans lead |
| F0a | Step rail and "Step N of 4" | Progress and back-navigation through the four questions | Top of the landing | DayPlannerTab.jsx 3305 | rework: hide in the chat and the builder (shows "Step 4 of 4" there) |
| F0b | Edit banner | Never shown: `editingPlanId` is only set to null | Landing | DayPlannerTab.jsx 3286 | remove (dead) |
| F1 | Step 1 "Where does your day start?" | Stay search, current location, trip and recent starts | Landing | DayPlannerTab.jsx 3385 | keep, make Find the primary |
| F1a | Continue a trip and Your day plans | Saved trips and standalone plans | Under step 1 | DayTripCards.jsx 236, 352 | move: above the question when plans exist |
| F1b | "Which day?" sheet | Picks a day of a saved trip | Sheet | DayTripCards.jsx 286 | keep |
| F2 | Step 2 "Which day are you visiting?" | Quick dates and inline calendar | Landing | DayPlannerTab.jsx 3522 | keep |
| F3 | Step 3 "Anything you already want to do?" | Yes or No, then idea search with a time of day | Landing | DayIdeasStep.jsx 230 | keep |
| F4 | Step 4 "How do you want to plan it?" | Fork: Carta bot or builder | Landing | DayPlannerTab.jsx 3582 | rework: equal cards |
| F0c | Destination banner | The chosen stay and date above steps 2 to 4 | Landing | DayPlannerTab.jsx 3362 | keep |
| F5 | Chat (Carta bot) | Up to six questions, then a proposed route | Landing | CartaChatPlanner.jsx 478 (planner surface shares it) | keep, see OWNERSHIP |
| F5a | Town question | Nearby, Search, Map, Ask Carta tabs | Chat | TownPickerStep.jsx 183 | keep |
| F6 | Builder | Rails of places around the stay, chips, list or map, tray | Landing | DayExploreBuilder.jsx 495 | rework: walks and sights before drives; honest tray |
| F6a | Tray sheet | Picked places, reorder, remove | Builder | DayExploreBuilder.jsx 645 | keep |
| F6b | Place detail sheet | Photo, facts, add, open full page | Builder | DayExploreBuilder.jsx 674 | keep |
| F7 | Workspace | Map plus sheet with three tabs | Whole tab | DayPlannerTab.jsx 3745 | rework: day before chrome |
| F7a | Today's plan tab | Ordered stops | Sheet | DayPlanPanel.jsx 85 | rework: add legs, time, cost |
| F7b | Add more tab | Ready-made days and a custom browser | Sheet | DayAddPanel.jsx 143 | keep, rename sub-tabs |
| F7c | Files tab | Device-local documents, group notes, import | Sheet | DayFilesPanel.jsx 49 | keep |
| M1 | AI day-plan modal | Form, busy, proposal, failure | Overlay | AiDayPlanModal.jsx; DayPlannerTab.jsx 3764 | keep, scrim per carta-design |
| M2 | "In your Saved trips" modal | Never shown: its opener is never called | Overlay | DayPlannerTab.jsx 3748 | remove (dead) |
| M3 | Stay popover | Change where the day starts | Map, top left | DayWorkspaceChrome.jsx 58 | keep |
| M4 | Local tips dialog | Carta on the city, the best walk, getting around | Map, top right | DayWorkspaceChrome.jsx 126 | rework: focus trap |
| M5 | Carta bot menu | Six prompts | Floating | DayWorkspaceChrome.jsx 213 | merge (see W22) |
| M6 | Plus menu and share menu | Add, ask, reorder; Maps, send, PDF, KML, ICS | Plan toolbar | DayPlanPanel.jsx 142, 171 | rework: share menu clipped on a phone |
| M7 | Map quality popover | Rating filter | Map card | DayPlannerTab.jsx 3895 | keep |
| M8 | Add-city row | City dropdown and Add | Day bar | DayPlannerTab.jsx 4084 | keep |
| M9 | Toast | Saved, KML and ICS hints | Top | DayPlannerTab.jsx 3747 | rework: ICS hint text is the trip's ("every flight and stay") |
| M10 | Saved plan card menu | Delete | Card corner | DayTripCards.jsx 331 | rework: confirm or undo |
| S1 to S36 | Empty, loading, error and info states | No address match; location off; trips loading, failed, empty; ideas loading and empty; chat failures and signed-out footer; town picker empties; builder skeletons and empty kind; tray empty; plan empty ("Plan day 1"); ready-made none; limited data; search empty; files unavailable, too big, full, failed; import busy, done, failed; AI busy, proposal, failure | Throughout | the files above | keep the copy; harden the visuals (V5) |

### Landing controls

| # | Item | What it does | Where | File, line | Verdict |
|---|---|---|---|---|---|
| L1 | "Cancel" in the edit banner | Dead | Edit banner | DayPlannerTab.jsx 3289 | remove |
| L2 | Info button "How this works" | Toggles a help card | Rail head | DayPlannerTab.jsx 3311 | rework: a text link beside the question, not a 44 px circle in the rail |
| L3 | Rail steps Stay, When, Ideas, How | Back to a done step | Rail | DayPlannerTab.jsx 3326 | keep |
| L4 | "Got it" | Closes the help card | Help card | DayPlannerTab.jsx 3347 | keep |
| L5 | Banner "Change" (title "Clear address") | Goes back to step 1 | Banner | DayPlannerTab.jsx 3373 | rework: title says what it does |
| L6 | Chosen-stay "Change" (25 px high) | Clears the stay | Step 1 | DayPlannerTab.jsx 3407 | rework: 44 px |
| L7 | Stay input | Address search, combobox | Step 1 | DayPlannerTab.jsx 3415 | keep |
| L8 | "Find" | Geocodes | Step 1 | DayPlannerTab.jsx 3429 | rework: the step's one primary |
| L9 | Result options | Sets the stay | Results | DayPlannerTab.jsx 3445 | keep |
| L10 | "Use my current location" | Geolocates | Quick starts | DayPlannerTab.jsx 3476 | keep |
| L11 | "From your trip" chips | Stay from a saved trip | Quick starts | DayPlannerTab.jsx 3488 | keep |
| L12 | "You started here before" chips | Recent starts | Quick starts | DayPlannerTab.jsx 3502 | keep |
| L13 | "Continue" (step 1) | Next step | Step 1 | DayPlannerTab.jsx 3513 | keep |
| L14 | "Sign in" in Continue a trip | Opens sign-in | Saved card | DayTripCards.jsx 263 | rework: secondary, not accent-filled |
| L15 | "Try again" (trips failed) | Retries | Saved card | DayTripCards.jsx 270 | keep |
| L16 | "Plan a trip" (no trips) | Opens the trip planner | Saved card | DayTripCards.jsx 274 | keep, secondary |
| L17 | Trip card with "Plan a day" | Opens the Which-day sheet | Cards | DayTripCards.jsx 127 | keep |
| L18 | Sheet close | Closes | Which-day sheet | SheetShell.jsx 108 (shared) | keep |
| L19 | Day chips in the sheet | Opens that day | Sheet | DayTripCards.jsx 197 | keep |
| L20 | Day-plan card with "Open" | Opens the plan | Your day plans | DayTripCards.jsx 365 | move: first on a returning visit |
| L21 | Card "More actions" (27 px) | Opens the card menu | Card corner | DayTripCards.jsx 322 | rework: 44 px |
| L22 | "Delete day plan" | Deletes at once, styled in `--accent` | Card menu | DayTripCards.jsx 333 | rework: `--danger`, undo toast |
| L23 | Quick date chips | Sets the date | Step 2 | DayPlannerTab.jsx 3528 | keep |
| L24 | Inline calendar | Sets the date | Step 2 | DateField (shared) | keep |
| L25 | "Continue" (step 2) | Next | Step 2 | DayPlannerTab.jsx 3557 | keep |
| L26 | "Yes, I have something in mind" | Opens the idea search | Step 3 | DayIdeasStep.jsx 239 | keep |
| L27 | "No, surprise me" | Skips to the fork | Step 3 | DayIdeasStep.jsx 249 | keep |
| L28 | Idea time segments Any, Morning, Afternoon, Evening (about 24 px) | Time of day per idea | Idea chip | DayIdeasStep.jsx 278 | rework: 44 px on touch |
| L29 | Idea remove x (26 px) | Removes the idea | Idea chip | DayIdeasStep.jsx 291 | rework: 44 px |
| L30 | Idea search input | Searches three pools | Step 3 | DayIdeasStep.jsx 307 | keep |
| L31 | Idea search clear (24 px) | Clears | Step 3 | DayIdeasStep.jsx 317 | rework: 44 px |
| L32 | Idea result rows | Adds an idea | Step 3 | DayIdeasStep.jsx 341 | keep |
| L33 | "Continue with N ideas" | Next | Step 3 | DayIdeasStep.jsx 370 | keep |
| L34 | Card "Let Carta plan it" | Opens the chat | Step 4 | DayPlannerTab.jsx 3590 | rework: equal weight, accent border and badge only |
| L35 | Card "Build it myself" | Opens the builder | Step 4 | DayPlannerTab.jsx 3618 | rework: no accent border |

### Chat and town picker controls

| # | Item | What it does | File, line | Verdict |
|---|---|---|---|---|
| C1 | Back (32 px) | Back a question | CartaChatPlanner.jsx 481 | rework: 44 px |
| C2 | Answer bubble "change" | Re-asks that question | CartaChatPlanner.jsx 497 | keep |
| C3 | Single-choice options (who, how much of the day, walking, food, been here) | Answers | CartaChatPlanner.jsx 635 | keep |
| C4 to C7 | Start time, avoid hills, bus or tram, diet chips (about 29 px) | Toggles | CartaChatPlanner.jsx 660 to 698 | rework: active is `--ink-fill`, 44 px |
| C8, C9 | Mood options (pick up to 3), Continue or No preference | Multi-select | CartaChatPlanner.jsx 592, 608 | keep |
| C10, C11 | Festivals and events, Avoid crowds | Toggles | CartaChatPlanner.jsx 532, 545 | keep |
| C12 to C15 | Preset chips, free-text input, "Build my route", "Skip" | Free text and go | CartaChatPlanner.jsx 558 to 582 | keep |
| C16 to C18 | Nudges, refine input, "Redo" | Regenerates | CartaChatPlanner.jsx 746 to 761 | keep |
| C19 to C21 | Sign in, Try again, Plan it myself instead | Failure recovery | CartaChatPlanner.jsx 774 to 776 | keep |
| C22 | "Import onto my map" | Opens the workspace with the route | CartaChatPlanner.jsx 785 | keep, the chat's primary |
| C23, C24 | Proposal stop rows and pins | Select a stop | AiPlanRoute.jsx 133, 84 | keep |
| T1 | Town tabs Nearby, Search, Map, Ask Carta | Switch | TownPickerStep.jsx 189 | keep |
| T2 to T14 | Nearby towns, empty doors, search input and matches, map search, research a town, use nearest, map pins, AI input, Ask, AI suggestions, AI empty | Pick the day's town | TownPickerStep.jsx 141 to 349 | keep |

### Builder controls

| # | Item | What it does | File, line | Verdict |
|---|---|---|---|---|
| B1 | Search icon | Opens the search row | DayExploreBuilder.jsx 509 | keep |
| B2 | "Change" | Back to step 1 | DayExploreBuilder.jsx 520 | keep |
| B3, B4 | Search input and clear | Filters the rails | DayExploreBuilder.jsx 526, 536 | keep |
| B5 | Chips All, Sights, Beaches and lakes, Nature and trails, Activities, Food, Towns nearby (7) | Filter; `All` drawn in `--accent-bg` | DayExploreBuilder.jsx 544 | rework: active is `--ink-fill`; walks first |
| B6 | List or Map | Switch view | DayExploreBuilder.jsx 554 | keep |
| B7 | Card body | Opens the detail sheet | DayExploreBuilder.jsx 102 | rework: car-free reach on the card |
| B8 | Card add or remove | Toggles the pick | DayExploreBuilder.jsx 131 | keep |
| B9 | "Show N more" (accent text) | Expands a rail | DayExploreBuilder.jsx 171 | rework: `--ink` link |
| B10 | Empty "Show all kinds" | Resets | DayExploreBuilder.jsx 577 | keep |
| B11 | Map pins and zoom | Highlight a card | DayExploreBuilder.jsx 616 | keep |
| B12 | Tray summary ("2 places, about 0 steps") | Opens the tray | DayExploreBuilder.jsx 630 | rework: count towns as rides, never print 0 steps |
| B13 | "Let Carta plan my day" or "the rest" | To the chat | DayExploreBuilder.jsx 636 | keep, secondary |
| B14 | "Open my day" | Creates the plan | DayExploreBuilder.jsx 639 | keep, primary |
| B15 to B18 | Tray close, tray up, down, remove (32 px), town remove, detail close | Tray and sheet | DayExploreBuilder.jsx 646 to 675 | rework: 44 px |
| B19, B20 | "Open full page" (place, feature) | Opens the page | DayExploreBuilder.jsx 688, 693 | keep |
| B21 | "Add to day" or "Remove from my days" | Toggles the pick | DayExploreBuilder.jsx 698 | keep |

### Workspace controls

| # | Item | What it does | Where | File, line | Verdict |
|---|---|---|---|---|---|
| W1, W2 | Saved modal close and "Keep planning here" | Dead | Modal | DayPlannerTab.jsx 3751, 3760 | remove |
| W3 | Map POI pins (43 on Salzburg, 19 px dots) | Add the place to the day | Map | TripMap via DayPlannerTab.jsx 3788 | rework: ink pins, route alone in accent |
| W4 | Route stop pins (26 px, terracotta) | Select the stop | Map | DayPlannerTab.jsx 3789 | keep in accent (the live route) |
| W5 | "Staying / Add your stay" | Opens the stay popover | Map, top left | DayWorkspaceChrome.jsx 44 | keep |
| W6 to W9 | Stay input, Find (30 px), results, "Clear this stay" | Edit the stay | Popover | DayWorkspaceChrome.jsx 62 to 86 | rework: Find 44 px; results as on the landing |
| W10, W11 | Day-trip "Compare" and Train, Bus, Car modes | Day-trip transport | Stay bar | DayTripTransport.jsx 101, 109 | keep |
| W12 | Booking links | External | Stay bar | DayTripTransport.jsx 134 | keep, warn prices may change |
| W13 | Local tips bulb (39 x 42 px on a phone) | Opens the tips dialog | Map, top right | DayWorkspaceChrome.jsx 116 | rework: 44 px, label on a phone |
| W14 to W17 | Tips close (26 px), intel add, walk add (28 px), CountryIntel | Tips | Tips dialog | DayWorkspaceChrome.jsx 130 to 194 | rework: 44 px, focus trap |
| W18 to W21 | Map chips All, Sights, Nature, Active, Food; Any rating; Only my picks; rating radios (32 px) | Filter pins on Add more | Map card | DayPlannerTab.jsx 3851 to 3900 | rework: card collapses to one row on a phone |
| W22 | Carta bot button (89 x 42 px, terracotta) | Opens six prompts | Floating | DayWorkspaceChrome.jsx 235 | merge: into the plan toolbar as a secondary "Ask Carta" |
| W23 | Bot prompts (6) | Plan, add more, reorder, less walking, rain, food | Bot menu | DayWorkspaceChrome.jsx 223 | keep the prompts, move into the merged menu |
| W24, W25 | Sheet grip and top card as drag handle | Resize the sheet (keyboard on narrow) | Sheet | DayPlannerTab.jsx 3940, 3969 | keep |
| W26 | "Back to trip" | Back to the trip | Top card | DayPlannerTab.jsx 3990 | keep |
| S21 | "Saved" span styled as a button | Says the plan saves itself | Top card | DayPlannerTab.jsx 4004 | rework: plain text status, not a chip |
| W27 | "Save day plan" | Saves a trip-based day | Top card | DayPlannerTab.jsx 4008 | keep |
| S22 | Stats "4 stops, 3,000 steps on foot, done ~14:00" | The day's figures | Top card | DayPlannerTab.jsx 4021 | rework: add the day cost; label the estimate |
| W28, W29 | City chips and remove x | Switch or remove a city | Day bar | DayPlannerTab.jsx 4047, 4054 | rework: city name in `--ui`, not mono |
| W30, W31 | "+ City" (two render branches) | Opens the add-city row | Day bar | DayPlannerTab.jsx 4064, 4077 | merge the branches; move into a "More" menu |
| W32, W33 | City dropdown and "Add" | Adds a city | Add-city row | DayPlannerTab.jsx 4086, 4093 | keep |
| W34 | "Day N" chips (30 px, mono, accent when active) | Switch day | Day bar | DayPlannerTab.jsx 4104 | rework: one day switcher with the date, `--ink-fill` active |
| W35 | "+ Day" | Adds a day | Day bar | DayPlannerTab.jsx 4113 | move: into the day switcher |
| W36 | Tabs Today's plan, Add more, Files (37 px) | Switch tab | Sheet | DayWorkspaceChrome.jsx 262 | rework: real tab pattern, 44 px |
| W37 | "Back to all day plans" | Closes the plan | Sheet foot | DayPlannerTab.jsx 4226 | keep |

### Today's plan, Add more and Files controls

| # | Item | What it does | File, line | Verdict |
|---|---|---|---|---|
| P1, P2 | Empty "Ask Carta" and "Browse places" | Empty day doors | DayPlanPanel.jsx 106, 109 | keep |
| P3 | "Use the ready-made {city} day" | Fills the day | DayPlanPanel.jsx 114 | keep |
| P4 | Plus (42 px, ink fill) | Opens the add menu | DayPlanPanel.jsx 134 | rework: labelled "Add" button, 44 px |
| P5 to P7 | Add more places, Ask Carta to plan it, Reorder the route | Add menu | DayPlanPanel.jsx 144 to 153 | keep, absorbs the bot prompts |
| P8 | Share (42 px) | Opens the share menu | DayPlanPanel.jsx 163 | rework: labelled, 44 px, menu opens into view |
| P9, P10 | Open in Google Maps, Send to friends ("Copied!") | Share | DayPlanPanel.jsx 174, 180 | keep; "Copied" without the exclamation |
| P11 to P13 | Download PDF, Google My Maps (.kml), Add to calendar (.ics) (30 px) | Exports | DayPlanPanel.jsx 188 to 194 | rework: 44 px, reachable on a phone |
| S24 | AI summary paragraph | The bot's one-line summary | DayPlanPanel.jsx 202 | keep |
| P14 to P16 | Move earlier, Move later, Remove (26 px) | Reorder and remove a stop | DayPlanPanel.jsx 69 to 71 | rework: 44 px; drag with these as the keyboard path |
| P17, P18 | Walk length Full, Half, Taste; remove walk (English only) | Pinned walk length | DayPlannerTab.jsx 1560, 1574 | rework: i18n |
| S25, S26 | "Today's walk" heading (English only); "Carta bot also spotted" | Walk block; AI finds | DayPlannerTab.jsx 1537; DayPlanPanel.jsx 226 | rework: i18n |
| A1 | Ready-made or Custom | Sub-tabs | DayAddPanel.jsx 182 | rework: "Whole days" and "Single places" |
| A2, A3 | "Use this day" (accent-filled, one per card) | Fills the day | DayAddPanel.jsx 211, 125 | rework: secondary; the accent stays for one primary |
| A4 | "Ask Carta instead" | Opens the AI modal | DayAddPanel.jsx 227 | merge into the toolbar's Ask Carta |
| A5, A6 | Search input and clear (28 px) | Searches places | DayAddPanel.jsx 240, 248 | rework: clear 44 px |
| A7 to A9 | Card main, "What is this?", "+ Add" (34 px) | Focus, read, add | DayAddPanel.jsx 59 to 92 | rework: add 44 px |
| A10 | Add "{q}" as your own stop | Custom place | DayAddPanel.jsx 269 | keep |
| A11 | Picks All, Sights, Nature, Active, Top rated (32 px) | Filters | DayAddPanel.jsx 283 | rework: 44 px; one filter row, not two (map card repeats them) |
| A12 | "Fits in today" rows | Add a nearby place | DayAddPanel.jsx 320 | keep: the best idea on the surface |
| A13, A14 | Empty "Show all"; "Show N more" | Reset; page | DayAddPanel.jsx 344, 354 | keep |
| D1, D2 | Drop zone and "Add files" | Add documents | DayFilesPanel.jsx 113, 128 | keep |
| D3, D4 | Save and Delete file (32 px; delete without confirm) | File actions | DayFilesPanel.jsx 150, 153 | rework: 44 px, undo |
| D5 | Notes textarea | Group notes | DayFilesPanel.jsx 171 | keep |
| D6 to D9 | Import drop zone, Browse files, URL input, "Extract" (29 px) | Import ideas | MagicImportZone.jsx 95 to 144 (shared with the trip extras) | rework: 44 px |
| D10, D11 | "+ Day N", remove idea | Stage imported ideas | DayPlannerTab.jsx 4209, 4217 | keep |

### AI modal controls

| # | Item | What it does | File, line | Verdict |
|---|---|---|---|---|
| M1, M2 | Overlay and close | Close | AiDayPlanModal.jsx 159, 161 | rework: scrim at 28 percent ink per carta-design |
| M3 to M5 | Date, fewer and more people | Inputs | AiDayPlanModal.jsx 181 to 199 | rework: date 44 px |
| M6 | Day-style tiles (English only, from `dayDraft.js` DAY_STYLES) | Vibe | AiDayPlanModal.jsx 210 | rework: i18n |
| M7 to M10 | Pace, avoid hills, festivals, free text | Inputs | AiDayPlanModal.jsx 137 to 241 | keep; checkboxes 44 px boxes |
| M11, M14, M20 | "See passes" (three places) | Paywall | AiDayPlanModal.jsx 257, 283, 383 | keep, one per state |
| M12, M13 | "Generate my day"; "Use Carta's built-in planner" | Go | AiDayPlanModal.jsx 266, 270 | keep |
| S34 | Busy text said twice to screen readers | Busy | AiDayPlanModal.jsx 293 | rework |
| M15 to M19 | Nudges, refine, Redo, "Import this day onto my map", "Change my answers" | Proposal | AiDayPlanModal.jsx 332 to 366 | keep |
| M21 to M23 | Try again, Back to the last plan, built-in planner | Failure | AiDayPlanModal.jsx 388 to 398 | keep |

### Exports

| # | Item | What it does | File | Verdict |
|---|---|---|---|---|
| X1 | PDF booklet | Opens a print window for the whole plan: cover, days, stops with blurbs, legs, Google Maps links | dayPlanPdf.js | rework: i18n, Carta's faces and tokens, the real domain, the day cost |
| X2 | KML | One folder per day, straight-line paths, English only | dayPlanKml.js, lib/kmlExport.js (shared) | rework: i18n; route geometry where the plan has it |
| X3 | ICS | One timed event per stop and a lunch event, English only, floating times | dayPlanIcs.js | rework: i18n; use the chosen start time |

### Visual settings

| # | Item | Today | File | Verdict |
|---|---|---|---|---|
| V1 | Accent outside the one primary | About 40 rules spend `--accent` on chips, tags, counts, hover borders and decoration (`.carta-plan-chip.on` solid fill, `.day-chip.active`, `.day-flow-card-tag`, `.dtcard-badge.now`, `.dtcard-go`, `.ai-sched-no`, `.dtmenu-item.danger`, the `.day-ideas-chip` left stripe) | 13-day-planner.css, 20-day-planner-flow.css, 24-destination-workspace.css | rework: active `--ink-fill`, links `--ink`, danger `--danger` |
| V2 | POI pins in accent | Every catalogue pin is a terracotta star; the route pins are terracotta too | TripMap styles, 20-day-planner-flow.css 10 to 34 | rework: ink pins, accent only on the route |
| V3 | Mono for names | City chips, day chips, "+ City", "+ Day" and the place in "Salzburg, 14 Oct" are mono | 13-day-planner.css 109, 11-trip-planner.css 200 | rework: names in `--ui`, figures in `--mono` |
| V4 | Pastel icon tiles | Fork card icons, the saved-trips sign-in tile | 20-day-planner-flow.css 1026, 1505 | remove (never-do 1) |
| V5 | Side stripe | `.day-ideas-chip` 3 px accent left border; dead `.day-tier-must` stripe | 20-day-planner-flow.css 1561, 13-day-planner.css 370 | remove |
| V6 | Overshoot easing | `.ai-sched-stop` entrance `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | 20-day-planner-flow.css 497 | rework: ease-out, no overshoot |
| V7 | Hover lifts | `translateY` on fork cards and idea choices | 20-day-planner-flow.css 1405, 1532 | remove (state, not decoration) |
| V8 | Gradient and shadows | One photo scrim gradient; seven shadow literals | 20-day-planner-flow.css 931 and others | rework: flat scrim, the three shadow tokens |
| V9 | Type sizes | 135 px font-size declarations, down to 9.5 px | 13-day-planner.css, 20-day-planner-flow.css | rework: the type scale, 11 px floor |
| V10 | Dead CSS | About 60 unused selectors in 13-day-planner.css and the carta-plan, carta-area, carta-route, ai-day-panel and day-ai-hero families in 20-day-planner-flow.css; app-header rules sitting in 13-day-planner.css 566 to 633 | the two files | remove |
| V11 | Floating stack on a phone | Bottom-bar plus, the ink plus, share, and the Carta bot within 200 px | DayPlanPanel.jsx, DayWorkspaceChrome.jsx | rework: one toolbar row |
| V12 | PDF palette and fonts | Its own hex palette, "Inter Tight" (not a Carta face) never loaded, an uppercase accent kicker | dayPlanPdf.js 158 to 196 | rework |

Count before: 198 distinct control types on the surface (repeated groups counted once) and 36 states. In the workspace at 380 px, 80 visible interactive elements, of which 72 are under 44 px: 43 POI pins, 4 route pins, 2 map credits and 23 controls (`walk-ws-380.json`). On the landing at 380 px, 16 controls and 1 under 44 px. No horizontal scroll at either width on any view walked.

## 4. Critique and technical audit

Method: dual-agent, as critique.md requires. Assessment A (design review) and Assessment B (detector and lint) ran as two isolated sub-agents; neither saw the other's output, and they met only in this synthesis. A worked from the source and the walk's screenshots without a browser, to keep the laptop to one browser.

### Design health

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | No running cost for the day; the tray prints "about 0 steps" for two towns 26 and 87 km out |
| 2 | Match with the real world | 3 | Steps, the hotel as the start, Today and Tomorrow fit; "Ready-made / Custom" and "Files" are app words |
| 3 | User control and freedom | 3 | "Change" one tap away at every step; deletes have no undo |
| 4 | Consistency and standards | 2 | Selection shown three ways (green pin, accent border, ink tick); four plus controls on one phone screen; "Reorder" offered twice |
| 5 | Error prevention | 2 | A 2 h 10 drive and another town go into one day without a warning |
| 6 | Recognition rather than recall | 3 | The stay rides along as a banner; on a phone the stops sit below the fold |
| 7 | Flexibility and efficiency | 3 | Two paths, ready-made days, bot shortcuts, keyboard sheet resize |
| 8 | Aesthetic and minimalist design | 2 | Ten controls and six bands above the first stop on a phone; the accent spent everywhere |
| 9 | Error recovery | 2 | Failure copy is good where it exists; the wrong step count and clipped share menu fail silently |
| 10 | Help and documentation | 2 | A help card in the rail; nothing explains steps, the tilde or where a figure comes from; no InfoDot |
| Total | | 24/40 | Acceptable |

Cognitive load: 4 of 8 checklist items fail (single focus, visual hierarchy, minimal choices, working memory: the traveller has to remember the day cost from another tab). Decision points over four options: builder chips 7, Add more filters 6, bot prompts 6, workspace head on a phone about 10 controls, the calendar (expected).

Design specificity: partly authored. The stay-first question ("Where does your day start?"), steps instead of km, "done ~14:00" in mono, Fraunces questions and the route sketch on the fork could only be Carta. The workspace (map, sheet, tabs, floating bot) could ship on any itinerary app, and the thing that defines Carta, the price with its pedigree, is absent: no euro figure for the day anywhere in the workspace or the builder.

### Priority issues

[P1] The day has no price. The workspace renders stops, steps and a finish time (`DayPlannerTab.jsx` 4021) and nothing about money; the builder tray neither. PRODUCT.md says the same figures carry through "to the hour-by-hour day planner, so no two screens can disagree about what dinner costs", and the research's day-planner line asks to "swap a stop in place and see the walking time and day cost update". Fix: the day's receipt, the existing `CostReceipt` from `src/components/CostSummary.jsx` in compact form, fed by the same cost index the destination page uses, one line in the top card that opens it, updating in place. Commands: clarify, layout.

[P1] On a phone the day sits under its own chrome. The first stop starts at about 670 px of 800, under a map, a title, two mono lines, two chip rows, three tabs and a toolbar, with the Carta bot over the first row (V1-workspace-380). The share menu opens under the bot and the bottom bar, so the three exports are off screen (pop3-380). Fix: one compact head (title, date and day switcher in one row, figures in one line), the plus, share and Ask Carta in one toolbar row, a default sheet height that shows two stops, menus that open into view. Commands: layout, distill.

[P1] Figures that are wrong or unlabelled. "2 places, about 0 steps" after picking two towns (builder-tray-380), because towns never reach the step count; "done ~14:00" and the steps are estimates with only a tilde. PRODUCT.md: "The product's only real asset is trust in its numbers." Fix: count towns as rides with their minutes and mode, never print a zero that is not measured, and mark every estimate with the tilde and "est." in text, with an InfoDot on its first use. Commands: harden, clarify.

[P2] The accent is spent everywhere, and the wrong things are primary. The fork's AI card is filled `--accent-bg` with a terracotta tile, title, pill and button, while carta-design says plan cards are equal weight and only the recommended one wears an accent border and badge (fork-1280). On the landing the one filled control is "Sign in" (V1-landing-380). Every catalogue pin is terracotta, so the live route does not stand out. "Delete day plan" uses the accent, not `--danger`. Fix: one primary per view (Find, Continue, Open my day, Import), equal fork cards, ink pins with the route alone in terracotta, `--ink-fill` for active chips, `--danger` for delete. Commands: quieter, polish.

[P2] Keyboard and screen reader semantics. The tab rail has `role="tablist"` without arrow keys, `aria-controls` or tab panels; the menus use `role="menu"` without moving focus or arrow keys; the Local tips dialog has no focus trap and does not return focus; the workspace has no h1; "Saved" is read with a literal tick. PRODUCT.md requires a trap and Escape on every modal overlay and one h1 per view. Fix: full patterns or plain buttons with `aria-pressed`, `useFocusTrap` on the tips, a visually hidden h1. Command: harden.

Persona red flags, in short. Casey on a phone in the city: stops below the fold, the bot over the first stop, the share menu clipped, three plus controls within 200 px, 26 px row controls, no "next stop, minutes on foot" anywhere. Sam on a keyboard: half-built tab and menu roles, a tips dialog without a trap, pins whose picked state is only a colour. Jordan the first-timer: the first filled button is "Sign in", "Ready-made / Custom" and "Files" unexplained, no word on whether the bot costs a credit before the click. The budget hiker on a weekend: no day cost, no fare line for a town 87 km out, "Nature and trails" ranks a drive beside walks with no car-free flag, the best walk in Local tips has no start reachable by bus.

Minor: the 44 px info circle outweighs the "Step 1 of 4" label; the stay name wraps in the banner at 380; the date is mono in one banner and `--ui` in the other; "Copied!" carries an exclamation; five `&` labels (`day.catBeach`, `day.mood*`); `day.depart800` shows a literal backslash ("it\'s") from `src/i18n/en.js` 792; two banned-word strings in the surface (`day.departEasy`, `ai.eventsNeedPass`); the toast for ICS reuses the trip's "every flight and stay" text; the KML always omits the stay pin.

### Detector and lint (Assessment B)

`impeccable detect --json` over the fifteen markup files (DayPlannerTab, DayWorkspaceChrome, DayPlanPanel, DayExploreBuilder, DayIdeasStep, DayActivityRows, DayAddPanel, DayFilesPanel, DayTripCards, DayTripTransport, AiDayPlanModal, AiPlanRoute, ExpenseLedger, MagicImportZone, DayExploreMap): exit 0, no findings, nothing suppressed. Over `13-day-planner.css` and `20-day-planner-flow.css`: exit 2, three findings, all verified, no false positives: side-tab at `13-day-planner.css:370` (dead rule) and `20-day-planner-flow.css:1561` (`.day-ideas-chip`), and bounce-easing at `20-day-planner-flow.css:497` (`.ai-sched-stop`, inside a no-preference block).

`node scripts/ci/design-lint.mjs` (read-only, main checkout): 213 violations, 213 in the baseline, 0 new. Inside this surface: seven shadow literals, one gradient (`20-day-planner-flow.css:931`), one `outline: none` with a background swap (`20-day-planner-flow.css:1323`), one middot in a code comment (`DayTripCards.jsx:159`), and two banned-word strings in `src/i18n/en.js` (794, 1745). No hex literals in the two stylesheets; the PDF builder carries its own hex palette in `dayPlanPdf.js`.

Hard-coded English the detector does not see: `DayPlannerTab.jsx` 1510 to 1514, 1537, 1558, 1577, 1578, 1615, 2071, 2791, 2811 and the fallback at 4059; `DayAddPanel.jsx` 370; `DayExploreMap.jsx` 89, 126, 192; the DAY_STYLES labels in `dayDraft.js`; and every string in the three exports. PRODUCT.md says six languages "on every surface including the PDF, KML and ICS exports".

### Technical audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 2 | 23 workspace controls and every map pin under 44 px at 380; tab and menu roles half built; tips dialog without a trap; no h1 in the workspace |
| 2 | Performance | 3 | Builder rails load lazily per layer; the four-stop plan resolves in about 1.6 s on a dev server; `DayPlannerTab.jsx` at 4,232 lines re-renders the whole surface for any state change |
| 3 | Responsive | 2 | No horizontal scroll at 380 or 1280; on a phone the day starts at about 670 px, the second fork card under the bottom bar, the share menu off screen |
| 4 | Theming | 2 | Tokens for colour, but the accent on about 40 non-primary rules, 135 px font sizes, rgba literals and the PDF's own palette |
| 5 | Implementation integrity | 2 | Three detector findings, dead flows (edit, saved modal), about 60 dead selectors, duplicated actions, English-only exports |
| Total | | 11/20 | Acceptable |

Harnesses, run read-only against the shared dev server from a scratch working directory (copies with the port set to 5199; their screenshots stayed in the scratchpad). Results on that loaded server are a before reading only, not a product verdict:

| Harness | Result | Note |
|---|---|---|
| verify_day_landing.mjs | pass, 51 checks | It asserts "tray: 1 place, about 0 steps" as ok: the harness encodes the tray bug of priority issue 3; V3 item 7 changes that assertion with a comment |
| verify_day_start_point.mjs | pass, 9 checks | |
| verify_day_dates.mjs | 15 of 16 | The one failure looks for the built chunk holding the AI date input; a dev server has no built chunks, so it needs a preview build |
| verify_day_ideas.mjs | 20 of 21 | "The catalogue pool answered nothing for a sight beside the stay" on the loaded server; re-run on a preview build |
| verify_day_steps.mjs | not completed | Timed out after 30 s waiting for the stay input on the loaded server |
| verify_day_workspace.mjs | cannot start | Waits for `.trip-saved-main`, which no longer exists (the cards are `.dtcard`); then hangs until killed (row T378-f, V3 item 11) |
| verify_day_overview.mjs | cannot start | Same stale selector (row T378-f) |

## 5. The traveller's job here

What they need first is the day itself on one screen: the stops in order with the walking time between them and the time they reach each, the next stop when the day is running, and what the day costs per person. On the day this is a phone in one hand: research section 5 has the trip itself on the phone, led by maps, restaurants and things to do (TripAdvisor 2015), and the research's day-planner line says "the map, the next stop, walking time to it and opening hours carry the screen". Today the stops sit at 670 px under chrome, the rows carry no time or distance (cut on purpose in the August workspace rebuild), and there is no cost.

Second, what it costs and whether it fits. Value for money is the first criterion for 3 in 5 European travellers (Booking.com 2024, research section 2), and the whole price up front is what earns trust (StubHub, Airbnb, research section 4). The day's cost is the bed for the night, food at the traveller's Lifestyle, local transport and any day-trip fare: the same chain the destination receipt already prices. Whether it fits is the finish time and the walking total, which exist, plus a plain warning when a pick cannot fit (a 2 h 10 drive).

Third, the swaps: add a place that "fits in today" (the Add more tab already has this, and it is the best idea on the surface), drop one, reorder, ask for a rain plan, and see the time and cost move in place. Constraints change mid-plan (arXiv 2609.26968, research section 1), so every input (stay, date, Lifestyle) stays editable inside the workspace.

What is missing: the day cost and its receipt; per-leg walking minutes and arrival times on the rows; a "next stop" line on the day; opening hours (the catalogue carries none, so this is data work, not design); car-free reach on builder cards (hikers, Wandermonitor 2024: a one-hour connection is their limit); a warning when the day does not fit; an offline-readable day (the PDF exists but is English-only and printed through a print window).

What sits in the wrong place: on a returning visit, the plans sit under a question already answered; on a phone, chrome sits above the day; "Sign in" is the primary of the first screen; the Carta bot floats over the content instead of sitting with the other ways to add; the exports hide in a menu that opens off screen; the filter chips for Add more live on the map card and again in the sheet.

What sends them away: Google Maps for walking times, opening hours and the day on the move; the destination page or Explore for any figure about money; the trip planner to see the nights around this day.

## 6. Plan (impeccable shape)

Brief in shape.md's terms. Job and audience: a budget traveller, often a hiker, planning one day in a town the evening before or that morning, on a phone first. Outcome: a day they can walk, in order, with minutes between stops, a finish time and a cost per person they trust, exportable for offline use. Direction: the incumbent world, untouched (paper, ink, one terracotta, Fraunces for the plan and place names, mono for measured figures). Structural thesis: the workspace is a timetable for one day, not a map with a list hung under it; the map shows where, the list says when and how much. Anti-goals: no new colours, no bento tiles, no hour grid that pretends to precision the catalogue does not have, no AI place that is not a catalogue POI (research: the OECD incident record), no decorative motion. Scope: every view in part 3; ExpenseLedger is not on this surface (it is drawn only by `TripItinerary.jsx`, the trip planner) and is left to that brief.

Items marked "rule N" depend on part 7 being accepted by T380 first; if T380 rejects a rule, the item drops and becomes a register row.

### V3: structure, information and flow

1. The day's cost (rule N1). The top card gets one figure line, "€NN.NN a person for the day" in `--mono`, with the estimate marked in text where a component is estimated, and a tap opens the compact `CostReceipt` with the cost bar (T362 rule): bed (one night of the stay tier), food (at the Lifestyle), local transport, and a day-trip fare line when the day has one. It reads the same cost index as the destination page, so the two can never disagree; it updates in place when the Lifestyle changes. The builder tray shows the same figure. Files: `src/planner/DayPlannerTab.jsx`, `src/planner/DayExploreBuilder.jsx`, `src/components/CostSummary.jsx` (use only), `src/lib/costIndex.js` (use only), `src/styles/68-v6-dayplanner.css`, six `src/i18n/*.js`. Command: clarify. Done when the Salzburg day at 380 and 1280 shows a euro figure with two decimals that equals the destination page's receipt for the same Lifestyle and night count, and changes when the Lifestyle changes.
2. Legs on the rows (rule N2). Between rows, one line in `--mono`: "12 min on foot, 0.9 km" from the route the workspace already computes (`route.segments`, `estimateWalkMinutes`); each row gets its arrival time from `buildDaySchedule` with a tilde and "est." on first use and an InfoDot. This reverses the August workspace rebuild, which cut clocks and leg distances on purpose, so it waits on the owner row T378-e. Files: `src/planner/DayPlanPanel.jsx`, `DayPlannerTab.jsx`, `68-v6-dayplanner.css`, i18n. Command: layout. Done when every pair of stops shows its leg and every row a time, and a reorder updates both without a layout jump.
3. One compact head on a phone. The title row holds the plan name and a day switcher ("Day 1, Wed 14 Oct" with previous and next, the day track rule's buttons); "+ Day" and "+ City" move into a "More" menu on that row; the city chip row shows only when the plan has two or more cities; the figures line holds stops, steps, finish and cost; the green "Saved" chip becomes a plain status word. Target: first stop row at or above 420 px at 380 x 800 (670 today). Files: `DayPlannerTab.jsx`, `src/planner/DayWorkspaceChrome.jsx`, `68-v6-dayplanner.css`. Command: distill. Done when the walk measures the first `.dayr-row` top at or under 420 px at 380 and both cities and days stay reachable by keyboard.
4. One toolbar, no floating bot (rule N3). The plan toolbar becomes one row of labelled buttons: "Add" (the plus menu, now also holding the bot's six prompts under "Ask Carta"), "Share" and, on desktop, "Export". The floating Carta bot button and its menu go; "Reorder the route" appears once. Files: `DayPlanPanel.jsx`, `DayWorkspaceChrome.jsx`, `DayPlannerTab.jsx`, `DayAddPanel.jsx` (its "Ask Carta instead" points at the same menu), i18n. Command: distill. Done when no view has two controls that run the same action, and the menus open fully on screen at 380 x 800.
5. Returning visit leads with the plans. When the device holds day plans or a running trip, the landing opens on them ("Your day plans", newest first, with "Plan a new day" as the primary) and the stay question follows on tap; a cold start keeps the question first. Files: `DayPlannerTab.jsx`, `src/planner/DayTripCards.jsx`, `20-day-planner-flow.css` or `68-v6-dayplanner.css`. Command: onboard. Done when a seeded returning visit shows the saved plan above the fold at 380 and a cold start still opens on step 1.
6. Primary per view. Step 1's primary is "Find" (then "Continue"); "Sign in" becomes a secondary button; the fork cards are equal weight, the recommended one marked by an accent border and the "Recommended" badge only (carta-design plan cards); "Use this day" on ready-made cards becomes secondary. Files: `DayPlannerTab.jsx`, `DayTripCards.jsx`, `DayAddPanel.jsx`, `20-day-planner-flow.css`, `68-v6-dayplanner.css`. Command: quieter. Done when the walk's accent-filled list holds at most one control per view.
7. The builder answers "on foot or not". Rails order: sights and walks near the stay first, then towns and beaches; every card states how you get there ("18 min on foot", "46 min by train", "46 min drive, no train") using the existing reach data where it exists; towns in the tray count as rides with their minutes, and the tray never prints "about 0 steps". When the picks add up to more than a day, the tray says so in one sentence. Files: `DayExploreBuilder.jsx`, `src/planner/dayExploreRails.js`, i18n. Command: harden. Done when Rome with Tivoli and Civita picked shows the two rides and a "does not fit one day" line, and no tray shows a zero.
8. The step rail belongs to the four questions. In the chat and the builder the rail gives way to a one-line back link ("Back to the questions"); the info circle becomes a text link under the question. Files: `DayPlannerTab.jsx`, `20-day-planner-flow.css`. Command: clarify. Done when no screen after the fork says "Step 4 of 4".
9. Exports in six languages. The PDF, KML and ICS builders take `t` and `lang` and translate every string; the PDF footer carries the real domain (carta-europetravel.com, not "carta.travel"); the ICS uses the plan's chosen start time; the toast for ICS gets its own day-plan text. Files: `src/planner/dayPlanPdf.js`, `src/planner/dayPlanKml.js`, `src/planner/dayPlanIcs.js`, `src/lib/kmlExport.js` (shared, through OWNERSHIP.md), `DayPlannerTab.jsx`, i18n. Command: harden. Done when the three exports of the Salzburg day in `de` and `fr` contain no English UI string.
10. Remove the dead. The edit flow (banner, Cancel, the editing branch, "Update plan"), the saved modal and its buttons, the unused imports and constants, the stale comments that name the timeline. Files: `DayPlannerTab.jsx`, `DayExploreBuilder.jsx`, `AiDayPlanModal.jsx`, `MagicImportZone.jsx`, `AiPlanRoute.jsx`, `DayTripTransport.jsx`. Command: distill. Done when lint is clean and the controls in parts 3 marked "remove (dead)" are gone.
11. Harness repair first. `verify_day_workspace` and `verify_day_overview` open the plan through `.trip-saved-main`, which no longer exists in the app (the cards are `.dtcard`); fix the selector with a comment saying why before any V3 change, so the build has a baseline. Files: `scripts/verify_day_workspace.mjs`, `scripts/verify_day_overview.mjs`. Command: none (harness). Done when both pass on a preview build before V3 touches the surface.

### V4: visual and dynamic, inside the palette

1. The route is the one terracotta thing on the map. Catalogue pins become ink dots and ink-bordered labels on `--bg-card`; picked ones carry an ink tick; the route line and its numbered pins stay `--accent` (DESIGN.md: the live route). Files: `src/map/TripMap.jsx` (shared with the trip planner, through OWNERSHIP.md), `src/map/DayExploreMap.jsx`, `20-day-planner-flow.css`, `68-v6-dayplanner.css`. Command: quieter. Done when a screenshot of the Salzburg day shows terracotta only on the four numbered pins and the line.
2. Accent spent once. Active chips (day, city, chat toggles, builder filter, Add more picks) to `--ink-fill` with `--on-fill` text; "Show N more" and card "go" arrows to `--ink`; the "Now" badge and stop-number dots in the AI proposal to ink; "Delete day plan" to `--danger`; the `.day-ideas-chip` stripe and the pastel icon tiles go. Files: `13-day-planner.css`, `20-day-planner-flow.css`, `24-destination-workspace.css` (the dayws, dayp, daya, dayr and dayf rules, through OWNERSHIP.md), `26-shortlist-extras.css` (dayex), `68-v6-dayplanner.css`. Command: quieter. Done when the detector's side-tab finding is gone and a grep finds `--accent` only on the primary, focus, the route and the recommended card border and badge.
3. Names in sans, figures in mono. City and day chips, "+ City", "+ Day" and the place name in the top card move to `--ui`; dates, times, minutes, steps and euros stay in `--mono` with tabular figures; the stats line loses its pipe separators for spacing. Files: `13-day-planner.css`, `18-detail-panel.css` (`.day-topcard-stats`, shared), `11-trip-planner.css` (`.trip-topcard-sub`, shared), `68-v6-dayplanner.css`. Command: typeset. Done when no mono run on the surface contains a place name.
4. A day you can see (rule N4). A thin day strip above the rows: one segment per stop and leg, proportional to minutes, stops in `--ink`, walks in `--rule`, the current or selected stop outlined; it doubles as the "where am I in the day" marker on the day itself. Files: `DayPlanPanel.jsx`, `68-v6-dayplanner.css`. Command: animate (layout first). Done when the strip's segments sum to the finish time and survive greyscale.
5. Motion that states change. A reorder slides the row (transform, 200 ms); a leg or cost figure changes in place with tabular figures; a stop added from the map flashes its row once (the existing `flashRow`) without the overshoot curve; fork cards and idea choices lose their hover lifts. Every one has a reduced-motion branch that jumps. Files: `DayPlanPanel.jsx`, `20-day-planner-flow.css`, `68-v6-dayplanner.css`. Command: animate. Done when the detector's bounce-easing finding is gone and reduced motion shows no transition.
6. Photos that carry the place. Row thumbs at 44 px with the number on the photo's corner (today it overlaps the edge), the builder's cards one ratio per rail, missing photos as the flag-and-name placeholder, never an `--accent-bg` box. Files: `src/planner/DayActivityRows.jsx` (PoiThumb), `DayExploreBuilder.jsx`, `13-day-planner.css`, `68-v6-dayplanner.css`. Command: polish. Done when no grey or pink empty box shows in the walk.
7. The PDF in Carta's own type. Self-hosted Fraunces, Plus Jakarta Sans and JetBrains Mono through the token values, no uppercase accent kicker, the receipt for the day on the cover, legs in mono. Files: `dayPlanPdf.js`. Command: typeset. Done when the printed Salzburg day uses the three faces and shows the day cost.

### V5: harden, adapt and polish

1. Tap targets. Row tools, chips, tabs, the info control, tips close and add, idea time segments and remove, search clears, file actions, import buttons, export menu items, the chat back button and toggles at 44 px on a coarse pointer (32 px allowed on a fine pointer only); map pins get a 44 px hit box around a smaller visual. Files: `68-v6-dayplanner.css`, `24-destination-workspace.css`, `26-shortlist-extras.css`, `21-chat-passes.css` (through OWNERSHIP.md). Command: adapt. Done when the walk counts zero controls under 44 px inside the workspace and landing at 380, map pins included by hit box (23 controls and 47 pins today).
2. Real patterns for tabs, menus and dialogs. The workspace tabs get arrow-key roving, `aria-controls` and tab panels; the plus and share menus move focus in and support arrow keys and Escape; the Local tips dialog uses `useFocusTrap` and returns focus; the AI modal's scrim follows carta-design; a visually hidden h1 names the plan. Files: `DayWorkspaceChrome.jsx`, `DayPlanPanel.jsx`, `DayPlannerTab.jsx`, `AiDayPlanModal.jsx`. Command: harden. Done when `scripts/verify_keyboard.mjs` (with a day-planner case added) passes and the walk finds one h1 in every view.
3. Undo for destruction. "Delete day plan", file delete and stop remove give an undo toast for a few seconds instead of a confirm; plan delete uses `--danger`. Files: `DayTripCards.jsx`, `DayFilesPanel.jsx`, `DayPlannerTab.jsx`. Command: harden. Done when each delete can be undone in the walk.
4. Strings. All hard-coded English in part 4 through i18n; "Copied" without the exclamation; the five `&` labels in words; `day.depart800` without the backslash; the two banned-word strings rewritten; the ICS toast. Six catalogues, one owner row for native review. Files: the files in part 4 and `src/i18n/*.js`. Command: clarify. Done when the design lint shows no banned word on this surface and the de walk at 360 px shows no English.
5. Long words and small screens. German and French labels in the compact head, the toolbar and the fork cards fit at 360 px (shrink before truncate); the stay name truncates on one line with the full name on focus; the sheet's default height shows two stops at 360 x 640. Files: `68-v6-dayplanner.css`. Command: adapt. Done when the de and fr walks at 360 and 1280 show every label whole.
6. Offline and failure. When the map style fails, the workspace keeps the list and says so in one line; when the catalogue file is slow (19 MB, per the workspace harness), rows show skeletons, not a partial day; when the AI is off, the toolbar's Ask Carta says it is off. Files: `DayPlannerTab.jsx`, `DayPlanPanel.jsx`, i18n. Command: harden. Done when blocking the style URL and throttling the activities file in Playwright show the line and the skeletons.
7. Clean-up. Delete the dead CSS listed in part 3 (V10), move the app-header rules out of `13-day-planner.css` to their owner, fold the minified one-line rules. Files: `13-day-planner.css`, `20-day-planner-flow.css`. Command: polish. Done when the design lint shows 0 new and the detector is clean on every changed file.
8. Harness updates. verify_day_workspace asserts the cost line, legs, the compact head and one toolbar; verify_day_landing asserts Find as primary and equal fork cards; verify_day_overview follows the new head; each changed assertion carries a comment saying why. Files: `scripts/verify_day_landing.mjs`, `scripts/verify_day_workspace.mjs`, `scripts/verify_day_overview.mjs`, `scripts/verify_day_ideas.mjs`, `scripts/verify_day_steps.mjs`, `scripts/verify_day_dates.mjs`, `scripts/verify_day_start_point.mjs` (as touched). Command: none. Done when all seven pass on a preview build.

### Target state: every button and control on the surface

| Control | Today | Target | Wave |
|---|---|---|---|
| Step rail, Step N of 4 | On every landing screen, chat and builder included | The four questions only; a back link after the fork | V3 |
| How this works | 44 px circle in the rail | Text link under the question | V3 |
| Stay input, Find | Find is a grey cell | Find is the step's primary | V3 |
| Use my location, trip starts, recent starts | Chips | Unchanged | none |
| Chosen stay Change | 25 px | 44 px | V5 |
| Continue (steps 1 to 3) | Primary | Unchanged | none |
| Banner Change | Title says "Clear address" | Title says what it does | V5 |
| Sign in (Continue a trip) | The only accent fill on step 1 | Secondary | V3 |
| Trip cards, Which-day sheet, day chips | As today | Unchanged | none |
| Day-plan cards and More actions | Under the question, 27 px menu | First on a returning visit, 44 px menu | V3, V5 |
| Delete day plan | Accent text, no undo | `--danger`, undo toast | V4, V5 |
| Quick dates, calendar | As today | Unchanged | none |
| Ideas Yes and No, search, rows | As today | Unchanged | none |
| Idea time segments, remove, clear | 24 to 26 px | 44 px | V5 |
| Fork cards | AI card accent-filled, both accent-bordered | Equal cards, recommended border and badge only | V3 |
| Chat back, toggles, chips | 29 to 32 px, active in solid accent | 44 px, active `--ink-fill` | V4, V5 |
| Chat questions, presets, Build my route, Import onto my map | As today | Unchanged | none |
| Town picker tabs and options | As today | Unchanged | none |
| Builder search, Change | As today | Unchanged | none |
| Builder chips (7) | `All` in accent tint, beaches first | `--ink-fill` active, walks and sights first | V3, V4 |
| Builder cards and add | Drive minutes only | Reach by foot, train or car | V3 |
| Show N more | Accent text | Ink link | V4 |
| Builder tray summary | "about 0 steps" for towns | Steps plus rides, fit warning | V3 |
| Let Carta plan my day, Open my day | Secondary, primary | Unchanged | none |
| Tray reorder and remove | 32 px | 44 px | V5 |
| Staying button and popover | Find 30 px, raw result labels | Find 44 px, results as on the landing | V5 |
| Day-trip modes and booking links | As today | Unchanged | none |
| Local tips | 39 px bulb, dialog without trap | 44 px, labelled, focus trap | V5 |
| Map filter card (Add more) | Two rows over half the map | One row on a phone | V3 |
| Map POI pins | Terracotta stars, 19 px | Ink, 44 px hit box | V4, V5 |
| Route pins and line | Terracotta | Unchanged, the only terracotta | none |
| Carta bot button and menu | Floating, accent-filled | Removed; prompts inside Add, under Ask Carta | V3 |
| Sheet grip | As today | Unchanged | none |
| Back to trip | As today | Unchanged | none |
| Saved chip | Green chip that looks like a button | Plain status word | V3 |
| Save day plan | As today | Unchanged | none |
| Day cost | Missing | Figure line plus compact receipt | V3 |
| Stats line | Mono with pipes | Mono figures, cost added, estimate marked | V3, V4 |
| City chips, + City | Mono, accent active, always shown | `--ui` names, shown for two or more cities, + City in More | V3, V4 |
| Day chips, + Day | Mono, 30 px, accent active | Day switcher with date, previous and next; + Day in More | V3 |
| Tabs | 37 px, half-built tab role | 44 px, full tab pattern | V5 |
| Add (plus) | Ink circle, icon only | Labelled Add, holds Ask Carta prompts | V3 |
| Share | Icon only, menu clipped on a phone | Labelled Share, menu on screen | V3 |
| Exports PDF, KML, ICS | 30 px items, English only | 44 px, six languages, cost on the PDF | V3, V4, V5 |
| Row up, down, remove | 26 px | 44 px; drag added, buttons stay as the keyboard path | V4, V5 |
| Legs between rows | Missing | Minutes and km in mono | V3 |
| Arrival times | Missing | Per row with tilde and est. | V3 |
| Day strip | Missing | Proportional strip | V4 |
| Walk length Full, Half, Taste | English only | i18n | V5 |
| Ready-made, Custom | App words | Whole days, Single places | V3 |
| Use this day | Accent-filled per card | Secondary | V3 |
| Ask Carta instead | Its own door | Points at the toolbar's Ask Carta | V3 |
| Add more search, picks, cards, add, Fits in today | 28 to 34 px | 44 px | V5 |
| Files drop, Add files, notes | As today | Unchanged | none |
| File save, delete | 32 px, no undo | 44 px, undo | V5 |
| Import zone, Browse, URL, Extract | 29 px | 44 px | V5 |
| AI modal controls | As today, scrim not per rule | Scrim per carta-design, date 44 px | V5 |
| Back to all day plans | As today | Unchanged | none |
| Edit banner, Cancel, saved modal | Dead | Removed | V3 |

## 7. Needs a rule

Each line is a proposal carta-design does not cover today, with the rule proposed. T380 accepts or rejects each one before anything in it is built.

N1. The day's receipt: a day plan carries one per-person figure for the day in `--mono` with two decimals, from the same cost index and Lifestyle as the destination receipt (bed for one night at the stay tier, food, local transport, plus a day-trip fare line when the day has one); a tap opens the compact receipt with its cost bar; it never adds an entry price Carta has not measured, and it never shows a flight.
N2. Legs and arrival times in a day list: between two stops one line in `--mono` gives minutes on foot (or by the ride's mode) and km; each stop carries an arrival time; both are estimates, so the first of each per view carries the tilde and "est." in text and an InfoDot; no hour grid, no fixed end time stated as fact.
N3. No floating action button: a planning surface puts its ways to add (places, ready-made days, Ask Carta prompts) in one labelled toolbar row inside the content; nothing floats over the list, and on a phone the bottom bar's plus is the only floating control.
N4. Day strip: a day plan may show one horizontal strip, 8 px high, full width of the list, one segment per stop (`--ink`) and per leg (`--rule`), widths proportional to minutes, the selected or current stop outlined 2 px `--ink`; no `--accent`, no legend, no figures on the strip (the rows carry them).
N5. Map pins on a planning map: catalogue places are ink (dot below a zoom threshold, an `--bg-card` label with an `--ink` icon above it); a picked place carries an ink tick; only the live route line and its numbered stop pins are `--accent`; every pin has a 44 px hit box whatever its visual size.
N6. Undo instead of confirm: a destructive action on the traveller's own data (a plan, a file, a stop) runs at once and shows a toast with "Undo" for at least five seconds; the button that started it uses `--danger`; no confirm dialog.
N7. Day switcher: inside one plan, days are switched with a single control, "Day N, weekday date" in `--ui` with the date in `--mono`, flanked by Previous and Next secondary buttons at `--tap`; adding a day lives in a menu, not as a chip in the row; it follows the day track rule's keyboard behaviour.

## Files the build waves will touch

App repo: `src/planner/DayPlannerTab.jsx`, `src/planner/DayWorkspaceChrome.jsx`, `src/planner/DayPlanPanel.jsx`, `src/planner/DayExploreBuilder.jsx`, `src/planner/dayExploreRails.js`, `src/planner/DayIdeasStep.jsx`, `src/planner/DayActivityRows.jsx`, `src/planner/DayAddPanel.jsx`, `src/planner/DayFilesPanel.jsx`, `src/planner/DayTripCards.jsx`, `src/planner/DayTripTransport.jsx`, `src/planner/AiDayPlanModal.jsx`, `src/planner/AiPlanRoute.jsx`, `src/planner/MagicImportZone.jsx` (shared with the trip extras, through OWNERSHIP.md), `src/planner/CartaChatPlanner.jsx` and `src/planner/TownPickerStep.jsx` (as far as the day planner draws them; ownership per OWNERSHIP.md), `src/planner/dayPlanPdf.js`, `src/planner/dayPlanKml.js`, `src/planner/dayPlanIcs.js`, `src/planner/dayDraft.js` (DAY_STYLES strings only), `src/lib/kmlExport.js` (shared), `src/map/DayExploreMap.jsx`, `src/map/TripMap.jsx` (shared with the trip planner, pin styling only, through OWNERSHIP.md), `src/components/CostSummary.jsx` (use only), `src/lib/costIndex.js` (use only), `src/components/InfoDot.jsx` and `src/lib/glossary.js` (use; new glossary terms for "est." on legs and times), the six `src/i18n/*.js`. Styles: `src/styles/68-v6-dayplanner.css` (created by T380), `src/styles/13-day-planner.css`, `src/styles/20-day-planner-flow.css`, and, for the rules of this surface that live there, `src/styles/24-destination-workspace.css` (dayws, dayp, daya, dayr, dayf), `src/styles/26-shortlist-extras.css` (dayex), `src/styles/21-chat-passes.css` (chat), `src/styles/18-detail-panel.css` (`.day-topcard-stats`, walk rows, import zone) and `src/styles/11-trip-planner.css` (`.trip-topcard-sub`), all through OWNERSHIP.md. Harnesses: `scripts/verify_day_landing.mjs`, `scripts/verify_day_workspace.mjs`, `scripts/verify_day_overview.mjs`, `scripts/verify_day_ideas.mjs`, `scripts/verify_day_steps.mjs`, `scripts/verify_day_dates.mjs`, `scripts/verify_day_start_point.mjs`, `scripts/verify_keyboard.mjs` (a day-planner case).

Not this surface: `src/planner/ExpenseLedger.jsx` is named in this surface's file list but is drawn only by `src/planner/TripItinerary.jsx` in the trip planner; OWNERSHIP.md should give it to that surface (row T378-b).

## Direction check (T380, V2)

What `docs/design-v6/DIRECTION.md` changes in this plan. All seven rules N1 to N7 are accepted, N6 as amended: undo covers every destructive action on the traveller's own data that the app can hold for six seconds (a stop, a file, a star, a day plan, a saved trip), and an inline confirm is kept only for an account, publishing and a public link; the account brief's narrower undo was widened to match. N2 is accepted as the house day-list rule, and its build still waits on the owner's answer to row T378-e, because it reverses the August workspace rebuild; V3-2 is built only after that row closes. N3 (no floating action button) and N7 (the day switcher) are house rules for every planning surface. N4 is the thin bar of the data drawings family. N5 is the map-sync rule for a planning map, with the 44 px hit box. Motion in V4-5: the reorder slide takes `--dur-2` with `--ease-in-out`, the figures settle through `settleFigure()` from `src/lib/figureChange.js`, and the `flashRow` overshoot curve in `20-day-planner-flow.css` goes. OWNERSHIP.md gives this surface the day planner components, the chat planner (`CartaChatPlanner.jsx`, `TownPickerStep.jsx`, `RouteBuildingStage.jsx`, `AiPlanRoute.jsx`), `DayExploreMap.jsx`, the day exports, `steps.js`, `cityResearch.js`, `citytrips.js`, `localIntel.js`, `scenicWalks.js`, `13-day-planner.css`, `20-day-planner-flow.css` and `21-chat-passes.css` (the pass half is overridden from `69-v6-account.css` and moved there by T390); `ExpenseLedger.jsx` and `MagicImportZone.jsx` are tripplanner's (row T378-b closed by this assignment), `TripMap.jsx` is tripplanner's (pin styling is a hand-off to T388), `kmlExport.js` and `glossary.js` are shell's (hand-offs to T381), and the `dayws`, `dayp`, `daya`, `dayr`, `dayf` and `dayex` rules in `24-destination-workspace.css` and `26-shortlist-extras.css` move into `68-v6-dayplanner.css` by T389 under OWNERSHIP.md rule 5.
