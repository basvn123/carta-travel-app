# T484 to T494: design batch (roadmap 1.3, 1.3a to 1.3d, 1.4, 1.15) and the fixes it found

Batch of the seven design and audit tasks from the owner's week list (T484, T485, T488, T489, T490, T491, T492), run on the batch branch `p11-design-batch` in the root repo. Each task ran as its own agent in parallel, reading `PRODUCT.md`, `DESIGN.md`, the carta-design skill, its T370 to T379 brief and the code, and wrote one Dutch design document in `Roadmap/` next to the existing roadmap files. Each design is a sketch for the owner to approve: ASCII wireframes at 390 px and 1440 px for every main state, an element table (keep, change, new or remove, with the source file:line, token, tap size and exact copy), "Open vragen voor de eigenaar" and "Wat de bouw nodig heeft". No design task changed app code. T494 is the one code task: the small, clear defects the agents found, fixed on `p11-design-batch` in `continent-app/`. Larger defects and anything that needs an owner call went into the register. T486, T487 and T483 (the code half of the same list) shipped earlier in T483 to T487 and T493.

Models: T484 on Sonnet (audit), the six design tasks on Opus, T494 by the lead.

Shared end check (one round, on the merged batch): for the design tasks, the owner reads each document's sketches against the end check list in that task's section. For T494, a dev server at 390 px (touch), 1180 px (touch) and desktop width, with DOM measurements instead of screenshots (below).

---

## T484: per-tab inventory (roadmap 1.3)

### Task ID
T484

### Date
2026-10-21

### What changed
`Roadmap/1.3-tabs-inventaris.md` now covers all ten tabs (shell, Home, Explore, Destinations, the destination page, outdoor pages, trip library and My trips, trip planner, day planner, account and pass). Each tab has three parts: what is there now (with file:line), every V3, V4 and V5 rule from its brief marked done, partly done, not done, dropped or not checked, and a keep, remove and new table. A table up front puts each tab on the T473 three places (Explore, Plan, My trips, account icon), and a table at the end lists the seams between tabs. Findings: most V3 rules are built; what is left is V5 polish plus the structural 1.15 and 1.17 work. The T371 landing brief is obsolete because Home replaced `LandingPage.jsx`, and the T438 removals are marked as dropped, not as gaps.

### Files touched
**Created:** `Roadmap/1.3-tabs-inventaris.md`

### Commands run
None beyond reading. Commit `29c0493b8`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues. One defect was found and filed, not fixed: the literal "Mock data" string (T484-i).

### What is still open
T484-a to T484-i in the register. About 40 rules are marked "niet nagekeken" because the result depends on CSS or behaviour that the code alone does not prove (T484-h).

### End check list
Header at 1440 px; bottom nav and the plus chooser at 390 px; Home on a first visit; Explore list and map; Destinations tiles at 380 px; a destination page; a trail page and a beach page; a journey page; My trips; the trip wizard and the planned view; the day planner; Account and the pass modal.

---

## T485: app shell (roadmap 1.3a)

### Task ID
T485

### Date
2026-10-21

### What changed
`Roadmap/1.3a-app-schil.md` sets the shell around the three places. The desktop header is 64 px: the logo (the way to Home), Explore, Plan, My trips, Explore's search slot and a 44 px account icon. Home, Destinations, the Trip planner, the Day planner and "Get a pass" leave the header. The phone gets four 48 px slots (Explore, Plan, My trips, Account), and the plus button and chooser go. A `--tap-main: 48px` token is proposed, subject to the owner's call. The phone settings bar becomes one sentence button ("Prices for 14 to 21 Nov, 2 people") plus the bed button, and opens one SheetShell with a Nights stepper and "Done". The desktop booking bar loses "Any dates" and shows "Suggested dates" when Carta picked them. The empty 56 px phone header row goes. The doc also has a nine-layer z table built from the T474 values, landmarks and focus order (the app has no `main`, `header` or skip link today), and the new i18n keys. The doc has sketches for phone states T1 to T5 and desktop states D1 to D4.

### Files touched
**Created:** `Roadmap/1.3a-app-schil.md`

### Commands run
Commit `9736e9fbe`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
The agent found two shell defects. T494 fixed both: the bottom bar was too short on a notched phone, and the header tabs were under `--tap` on touch tablets. Dead `.header-pricing-btn` CSS and px font sizes are filed as T485-j and T485-l.

### What is still open
T485-a to T485-l. T485-a, T490-h and T492-b are the same 48 px call.

### End check list
Phone T1 (Explore, logged out, bar collapsed), T2 (the settings sheet open), T3 (logged in, Plan active, plan dot), T4 (a sub-page with PageBar), T5 (keyboard open in the sheet). Desktop D1 to D4. The layer, focus and landmark tables.

---

## T488: navigation design (roadmap 1.15)

### Task ID
T488

### Date
2026-10-21

### What changed
`Roadmap/1.15-navigatie-ontwerp.md` decides the information architecture.

- **Places.** The order is Explore (Destinations' six categories as tiles with a `cat=` filter), Plan, My trips, Account. Account is an icon on desktop and the fourth slot on phone. Home is the logo on desktop, and on phone a "How Carta works" row in Account.
- **Addresses.** New tab keys `explore`, `plan`, `trips` and `account`, plus `v=map`, `cat=`, `mode=day`, `pday=N`, `view=` and `/pricing`. My trips and Account get their own address and a history step.
- **Old links.** A `LEGACY_TABS` table maps every old entry point to its new place: every old tab key, every hash (`#trip=`, `#day=`, `#shared=`, `#coplan=`, `#friend=`, the item hashes), `?legal=`, `?pass=ok` and `?styleguide`.
- **Plan.** There is no trip and day toggle. Plan opens on the plan in progress or on "Plan something new" (Trip and One day tiles). A day opens inside its trip.
- **Paid actions.** Eleven rows, each with its trigger at file:line, its gate and the sheet heading and subline. Every sheet uses "Trip Pass" with `{price}`. The `celebrate` nudge is removed.
- **Free sentence.** It is placed in exactly six spots (home, FAQ, the pass sheet, Account Your plan for guests too, `/pricing`, the store and meta text) as one i18n key.
- **Badges.** A dot on Plan for an unsaved plan, the count on My trips, an initial on Account and never a pass in the bars.

### Files touched
**Created:** `Roadmap/1.15-navigatie-ontwerp.md`. The T472 audit `1.15-navigatie-pass-prijsweergave.md` is unchanged.

### Commands run
Commit `877a7c52c`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
T494 fixed one defect the agent found: `?tab=destinations` silently opened the map. Filed, not fixed: item and journey PDFs never call the export gate (an owner call, T488-a); My trips and Account have no history step (T488-k, built with 2.18); PassModal preselects the yearly plan at a hard gate (T488-g). "Get a pass" stays visible to Trip Pass holders (`AppHeader.jsx:141`), which is moot because 2.18 removes the button.

### What is still open
T488-a to T488-k. Roadmap 1.15's done condition also asks for the free sentence in carta-design. That edit was outside this batch's scope and is T488-i.

### End check list
Phone and desktop Explore without a Destinations tab; Plan start with and without a draft; the pass sheet at the PDF tap; guest Account on phone; the desktop header without "Get a pass"; the legacy-link table; the eleven paid-action rows and the six places for the free sentence.

---

## T489: Destinations inside Explore (roadmap 1.3b)

### Task ID
T489

### Date
2026-10-21

### What changed
`Roadmap/1.3b-destinations.md` makes Destinations the browse and list side of Explore.

- **Tiles.** Six category tiles: Places, Trails, Beaches, Lakes, Mountains and Cycling. They are a 3 by 2 grid on phone and two across in the desktop panel. Six is carta-design's maximum.
- **Trip library.** It is not a seventh tile. It is reached from a "Trip styles" row on Places, "Weeks in {country}", "Weeks here" and the existing `#journey=` links. It loses its own filter bar, and its cards show "From ~€X est. a person".
- **Price sentence.** The T486 sentence sits behind one `day-price` InfoDot instead of a line under every list.
- **Country page.** It becomes a real page: PageBar, its own URL, a fact band with "a person a day" and a month strip, one primary "Plan a trip in {country}", and rows for the best of, weeks, cities and outdoors.
- **Region page.** Photo first, then "Bed and food in {city}:", best months, layer rows, towns and nearby regions.
- **Empty result.** One shared block: the cause, "Remove {filter}" and "Clear all".

### Files touched
**Created:** `Roadmap/1.3b-destinations.md`

### Commands run
Commit `73ab8a90f`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
T494 fixed one defect: the country page's day figure read "~€87 est. a day", and it now reads "a person a day". Journey cards showing a range is filed as T489-k, with 1.18.

### What is still open
T489-a to T489-k.

### End check list
Explore opening on Places (phone and desktop); Beaches picked; filters open (the phone sheet, the desktop panel and the "All filters" dialog); the trip library and one style; the Italy country page; the Amalfi Coast region page; the empty result on an outdoor layer (phone) and on Places in map view (desktop).

---

## T490: trip planner (roadmap 1.3c)

### Task ID
T490

### Date
2026-10-21

### What changed
`Roadmap/1.3c-tripplanner.md` keeps the T458 wizard order (Booked, From, Who, When, Where, Stay/Trips/Your stays, Getting there, Review) and puts it in the 1.17 workspace.

- **Desktop.** The step sits left at 55% and the right side shows PlanTotal, then the map from Where on. The rail breakpoint moves from 1100 to 1024 px.
- **Phone.** The map card page and the drag sheet become one `PlanDrawer` with three states and a 48 px handle button.
- **Total bar.** A new `TripTotalBar` reads only `priceTrip()` and opens the receipt. The edit view's own receipt goes.
- **Planned list.** The order is name, receipt, route, days, kit, then Export & share. The Overview/Day by day tab goes.
- **Day hand-off to T492.** `onPlanDay({planId, stopIndex, dayIndex})` opens the day inside the workspace with city, date, party and Lifestyle filled in.
- **Save without account.** A new `deviceTripStore` with "Saved on this device" and a private-mode error state.
- **Country card.** Its accessible name becomes "Italy, from about €87 a person a day".

### Files touched
**Created:** `Roadmap/1.3c-tripplanner.md`

### Commands run
Commit `a2ca22df3`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
T494 fixed one defect: the "→" between the two dates is now `aria-hidden` in the wizard and the planner. Filed as T490-i: the country card's spoken name needs new keys in six languages, a 1.16 follow-up. Also filed: the edit view's own sum (T490-j), the drag-only sheet (T490-k) and the unlabelled arrival search (T490-l).

### What is still open
T490-a to T490-l.

### End check list
The wizard frame on phone and desktop; every step on phone; Where with the country card; Review; the planned trip with the drawer in three states and the desktop list, map and total bar; the edit mode; the save moment with and without an account; the day opening in the trip; the empty states (blank Plan, draft restore, no price, no match, unpriced flight) and the error states (account save, device save, library load, route not drawable).

---

## T491: destination page (roadmap 1.4)

### Task ID
T491

### Date
2026-10-21

### What changed
`Roadmap/1.4-bestemmingspagina.md` replaces the six open sections and the sticky section rail with four tabs: Overview, Nearby, When to go and Practical. The tabs use the kit `Tabs`, stick under PageBar and change the URL without a history step.

Overview has five blocks:
- key facts;
- "Things to do", or "What to see" when the place has no do items;
- "Around {city}", with one chip per category that has items and one sentence for the empty ones;
- the year (ClimateStrip) and the MET 7-day forecast;
- "Take {city} with you", which opens the pass sheet.

The head carries "~€87 est. a person a day" and "A bed plus food and drink."

The design is checked against three real cases from the wire: Rome (metro, rich), Zungoli (village: no do items and no outdoor except one ride and seven day trips) and Valbona (area: 30 walks and 5 peaks). It is also checked against catalogue counts: 71% of villages have no beach, 34% have no do items, and 13,188 of 14,650 do items link nowhere before 4.1.

### Files touched
**Created:** `Roadmap/1.4-bestemmingspagina.md`

### Commands run
Commit `f88f06bff`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
Filed, not fixed, because each is larger than a one-line fix:
- the destination PDF ignores `nearby` and hardcodes English units (T491-k);
- NearestLine and the outdoor tiles use buttons instead of links (T491-l);
- two false outdoor items near Rome (T491-m).

### What is still open
T491-a to T491-m.

### End check list
Rome Overview on phone (first screens and further down) and on desktop with the sticky price card; Zungoli's thin-data Overview on phone; Valbona's left column on desktop; the sticky tab bar with German labels; the four download states.

---

## T492: day planner (roadmap 1.3d)

### Task ID
T492

### Date
2026-10-21

### What changed
`Roadmap/1.3d-dagplanner.md` keeps the questions (Start, Days, Ideas, How, then the fork). A day opened from a trip starts at What.

- **Builder.** It keeps Where then What, with search and List|Map on What's row and "Add to day" at 48 px.
- **AI and sign-in.** The AI stays on `plan-day` (Gemini). The guest gate moves to the last tap ("Sign in to plan"), and the answers must survive sign-in.
- **Bands.** The planned day gets three bands above the clock: Morning until 12:00, Afternoon until 17:00 and Evening after that. Lunch heads Afternoon and a new Dinner row heads Evening; meals carry no amount.
- **Tap only.** Each band has an "Add" button. Reordering is "Move earlier" and "Move later"; there is no drag.
- **Tickets.** "Ticket €12" counts toward the total. "Ticket, price not known" shows no figure and counts nothing.
- **Desktop.** The list sits left and the map right, with a fixed `DayCostBar`.
- **Phone.** A three-state `MapDrawer`, shared with T490, keeps "~€108 est. a person a day" in the strip, and the T487 Google Maps parts sit in the drawer.
- **Day inside a trip.** It opens in place, with PageBar "Back to {trip}".

### Files touched
**Created:** `Roadmap/1.3d-dagplanner.md`

### Commands run
Commit `9bfcd3c35`.

### Config and secrets set
None.

### Before/after measurements
Not measured.

### What broke and how it was fixed
No issues. T283-b (the middot in DayIdeasStep.jsx) was already fixed. That file now has 0 middots and joins with a comma, so the row is closed by T492. Filed: the day figure opens Lifestyle instead of the receipt (T492-k), and `DAY_PHASES` is dead code with four phases (T492-l).

### What is still open
T492-a to T492-l. 4.19 needs a data lane first (OSM `fee` and `charge`, T492-h).

### End check list
The builder; the Carta chat as a guest (the last button reads "Sign in to plan"); the planned day on desktop (three bands, Lunch and Dinner, both ticket states, Add buttons, cost bar); the phone drawer in three states; an empty day; a day opened from a trip.

---

## T494: fixes found by the design batch

### Task ID
T494

### Date
2026-10-21

### What changed
Four small defects the design agents found are fixed in the app, each one line or one rule:

- **Bottom nav on a notched phone.** `--bottom-nav-h` now includes the home-indicator inset (`calc(86px + env(safe-area-inset-bottom, 0px))`). Before, the bar was 86 px in all, with the inset taken from the inside, so on an iPhone with a 34 px inset the four items had about 34 px instead of 68. Toasts, the snackbar and the Explore float added the inset a second time and left a gap; they now stop at the token. With a zero inset nothing changes.
- **Header tabs on touch tablets.** The tabs were 36 px high on coarse pointers from 1024 px up; they now have `min-height: var(--tap)`.
- **Old link.** `?tab=destinations` opens the places tab instead of the map. Roadmap 2.18 counts on that link.
- **Copy and screen readers.** The country page's day figure says "a person a day" (`dest.priceDayUnit`, present in all six languages) instead of "a day". The "→" between the trip dates is hidden from screen readers in the wizard and the planner.

### Files touched
**Modified (continent-app):**
- `src/styles/01-tokens.css`
- `src/styles/10-shell.css`
- `src/styles/60-v6-shell.css`
- `src/styles/62-v6-explore.css`
- `src/lib/urlState.js`
- `src/browse/CountryPage.jsx`
- `src/planner/GuidedTripWizard.jsx`
- `src/planner/TripPlannerTab.jsx`

**Modified (root):** `DESIGN.md` (the `--bottom-nav-h` row, same commit as the report, because the token changed)

### Commands run
```
git -C continent-app checkout -b p11-design-batch
npx eslint src/lib/urlState.js src/browse/CountryPage.jsx   # 0 errors, 1 old warning (selectedId unused, line 42)
npm test                                                   # 463 pass, 0 fail
npx vite --port 5199                                       # end check
```
App commits: `258ce05` (nav height and header tabs), `853777b` (`?tab=destinations`), `fa053d5` (country unit and arrows).

### Config and secrets set
None.

### Before/after measurements
| Metric | Before | After | Delta |
|---|---|---|---|
| Header tab height, 1180 px touch | 36 px | 44 px | +8 px |
| Bottom nav item height, 390 px, inset 0 | 67 px | 67 px | 0 |
| Bottom nav item height, 34 px inset (computed) | about 34 px | 68 px | +34 px |
| `?tab=destinations` opens | map | places (Destinations active) | fixed |
| Unit tests | 463 pass | 463 pass | 0 |

### What broke and how it was fixed
| What | Cause | Fix |
|---|---|---|
| The first sed edit of urlState.js rewrote every line ending | Git Bash sed strips CRLF (known gotcha) | Reverted the file and made the edit with the Edit tool; the diff is 6 lines |
| The first coarse-pointer rule landed inside the `.header-nav-item` block | sed inserted the rule at a line number in the middle of the block | Removed it and placed the rule after the closing brace |

### What is still open
T494-a: the inset was measured only at zero. A real notched iPhone should confirm the 68 px items and that no gap shows under toasts.

### End check list
Done in this batch: `?tab=destinations` at desktop width; the header at 1180 px touch; the bottom nav at 390 px touch. Not reachable by URL: the country page unit. It is a one-key swap to a key present in six languages and still wants a look on a country page.

---

## Rollback

- Design tasks: `git revert` the task's commit in the root repo (each document is its own commit). No other file depends on them.
- T494: `git -C continent-app revert fa053d5 853777b 258ce05`, then revert the `DESIGN.md` row in the report commit. Redeploy the app from the reverted `master`.
- Roadmap statuses and register rows: revert the report commit.
