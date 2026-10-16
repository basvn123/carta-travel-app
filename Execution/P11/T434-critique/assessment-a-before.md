# T434 critique, Assessment A (design review), My trips before state

Scope: `continent-app/src/auth/SavedTripsPanel.jsx` (2,137 lines), `src/styles/17-saved-trips.css`, `69-v6-account.css`, `25-feature-pages.css` lines 8 to 219. Tabs Planned, Shortlist, Visited.
Evidence: `Execution/P11/T434-shots/before/before-mytrips-{empty,trips,shortlist,visited}-{phone,ipad}*.png` (no desk shots had arrived; the iPad shots at 820 px already show the desktop layout with the side panel). Compared against `T457-shots/after-d-explore.jpg`, `after-m-explore.jpg` and `T458-shots/overview-laptop.png`.
Rules applied: PRODUCT.md, DESIGN.md, `.claude/skills/carta-design/SKILL.md` (these win over generic taste). The detector was not run and its output was not read.

## Verdict in one paragraph

My trips is the one surface that still looks like the app before Lagoon. Explore, Destinations and the Trip planner put white bordered cards on the warm grey ground, use kit tiles, kit tabs and the estimate mark; My trips paints every card in the sunken grey on purpose (`.saved-shell { --bg-card: var(--paper-dim) }`, 69-v6-account.css:667), switches views with three oversized tinted tiles, prints its figures without the estimate mark and with the retired word "national", and explains itself in sentences the owner already called AI-written. The plumbing underneath is good (undo, menus, focus trap, the date filing), so this is a redesign of the skin and the information order, not a rewrite of the logic. The highest risk is not visual: the figures on this page disagree with the rest of the app about what a trip costs and whether it is an estimate, which is the one asset PRODUCT.md says Carta has.

## Nielsen's 10 heuristics

| # | Heuristic | Score | Why |
|---|---|---|---|
| 1 | Visibility of system status | 2 | The countdown ("In 21 days") is the right lead fact. But counts disagree: the Planned tile says 3 while its heading says 2 (the tile adds day plans, the heading does not); the Shortlist tile says 3 while the section under it says "Nothing starred yet". The Visited map is a blank grey box while it loads, at 240 to 360 px the biggest object on the tab. |
| 2 | Match between system and real world | 2 | The shortlist copy says "Tap the star", but the control on every Explore card is a bookmark, and in Carta the star is the rating mark. "Find them back" is a Dutch calque. One page uses trips, journeys, plans, day plans, travel record and shortlist for overlapping things. |
| 3 | User control and freedom | 3 | Remove runs at once with Undo for six seconds and focus handed to Undo; card menus close on Escape and return focus; the full map is a trapped dialog. Missing: no way to sort or narrow a long record or shortlist. |
| 4 | Consistency and standards | 1 | Card fill, tab control, section type sizes, date ranges ("6 Nov arrow 12 Nov" here, "Fri 16 Oct to Thu 22 Oct" in the Trip planner and "Ranges use the word to" in the rules), the estimate mark, the save control's grammar (white disc on the photo in Explore, ink bookmark in the caption here) and the use of the side panel all differ from the surfaces the owner wants this aligned with. |
| 5 | Error prevention | 3 | Co-planned trips hide Remove (the delete policy is owner-only), and undo replaces confirms. The visited crew input loses its focus ring, which invites typing into the wrong field. |
| 6 | Recognition rather than recall | 2 | Two stores of saved things (the shortlist and "Saved to your account") with different icons and no stated difference. A planned trip card does not show what the Trip planner already knows (bookings, packing, days planned), so the traveller must open the planner to remember. |
| 7 | Flexibility and efficiency of use | 2 | No sort, filter or search on any tab. The tablist has no arrow key support. On desktop a 200 px column holds three buttons and nothing else. |
| 8 | Aesthetic and minimalist design | 2 | Captions that repeat the heading ("Visited cities" over "3" over "Cities visited"), a catalogue denominator ("3 / 43", "European countries"), "City" and "Saved 4 Oct 2026" on every shortlist tile, a sentence apologising for the friend table, an empty Day plans shelf with its own paragraph, "Add who came along" on every visited card. |
| 9 | Help users recognise, diagnose, recover from errors | 3 | `ErrorBlock` with retry on both account lists; one sentence errors. The Visited tab drops to a bare `auth-error` div rather than the same block. |
| 10 | Help and documentation | 2 | Empty states try to teach, but one teaches the wrong gesture and two stack on one tab for a guest. |
| | **Total** | **22 / 40** | Solid behaviour, weak consistency and information order. |

## What works (keep these)

1. **The interaction plumbing is mature.** Undo instead of confirm, with focus moved to Undo when the removed card took focus with it (`UndoToast`); the card menu is a real menu (arrow keys, Home, End, Escape in capture phase so the page behind stays open); the full screen map is portalled, labelled and focus trapped; only one MapLibre instance lives at a time. A redesign should keep every one of these behaviours.
2. **Dates file the trips.** Upcoming becomes Visited on its own, the first upcoming trip is a focal card with a countdown, and past trips accept memories, photos and companions. That is the right model for Polarsteps-level "what I did" without manual archiving.
3. **Honest social defaults.** The friends block is absent when nobody shared anything, a co-planned trip shows who owns it and offers no Remove, and friend numbers are computed only from what friends chose to show. The intent is right even where the presentation (below) is not.

## Priority issues

### P0. The figures on My trips break the money rules the rest of the app follows

- **What:** `SavedCost` (SavedTripsPanel.jsx:324) prints `eurDay()` with no tilde and no "est.", and appends the word "national" when the stay or food is a country stand-in (`saved.costNational`). Screens: "From €69 a day" on the Portugal card, "€100 a day national" on Bruges. Explore prints the same kind of figure as "~€69 est. a day". A planned trip shows the cheapest town's day rate ("From €69 a day"), while the Trip planner prints the trip's own total ("~€791.80 est.", `lib/tripTotal.js` priceTrip). The second upcoming trip (Slovenia, row variant) carries no figure at all.
- **Why it matters:** carta-design "The estimate mark is the whole pedigree on the page... no national word after a figure" (T438), and PRODUCT.md "The same figures carry through unchanged from the Explore card to the destination receipt, the multi-city planner". A returning traveller who opens their saved trip and sees a different kind of number, unmarked, has been given a reason to doubt every number. Trust is named as the product's only asset.
- **Fix:** Route every figure through `formatEst()` / `<Money est>` with the same `isNational()` test Explore uses; delete `saved.costNational`. A planned trip card shows the trip total per person from `priceTrip` (the planner's figure, marked as it marks it), not a day rate; a shortlisted place shows the day rate exactly as its Explore card does. Every card variant carries its figure.
- **Suggested command:** `/impeccable harden` (data correctness across surfaces), then `/impeccable audit` on the money path.

### P1. The surface is built in a different design system from Explore, Destinations and the planners

- **What:** (a) 69-v6-account.css:667 repaints every card on this page in `--paper-dim` (the sunken grey), so cards sit grey on grey; everywhere else cards are `--surface` white with a `--border` edge. (b) The view switch is three 112 px tinted tiles with an icon, a label and a corner count (phone), and three full-width tinted pills in an otherwise empty side panel (desktop); the kit has Tabs (brown underline) for exactly this. (c) Type sizes are literals outside the scale: h1 40 px on desktop (that is `--text-display`, reserved for a destination on a hero; Explore's page title is the 28 px headline), section titles 22 / 26 px, ledger figure 27 px, empty text 12.5 px, phone tile label 10.5 px in 25-feature-pages.css (under the 11 px floor unless a later rule wins). (d) Radii 14 px and 11 px, transitions `.15s`, `rgba(255,255,255,0.22)`, and legacy aliases (`--mono`, `--display`, `--accent`, `--paper`, `--ink`) throughout three files that override each other (17, 25, 69). (e) The empty-state button is a brown fill with a 1 px ink edge and a 6 px radius, not the kit Button. (f) Date ranges use an arrow; the planner writes "to".
- **Why it matters:** The owner's first two wishes are "top tier" and "align with Explore, Destinations, Trip planner, Day planner". Side by side with `after-d-explore.jpg` and `overview-laptop.png`, My trips reads as an older, heavier, greyer app. carta-design: "a new local button, chip or card style is a regression"; "No other radius"; "Write the token, never a px".
- **Fix:** Delete the `--bg-card` override and rebuild on the kit: `Card` (row and tile layouts, white, bordered), `Tabs` under the h1 for Planned, Shortlist, Visited (counts, if kept, as count chips beside the label, matching the content's own count), `Button` for every call to action, 28 px headline for the h1, `--text-title` 20 px for section heads. Collapse the three stylesheet layers into one file owned by this surface so the cascade stops deciding the design.
- **Suggested command:** `/impeccable redesign` (structure and components), then `/impeccable polish`.

### P1. Shortlist is two lists, explained wrongly, with an empty state that contradicts its own tab

- **What:** The tab holds "Your shortlist" (device store, filled by the bookmark on Explore and Destinations) and "Saved to your account" (older saved places with dates). With the fixture, the tile says 3, the first section says "Nothing starred yet. Tap the star on any place, walk, beach, lake, mountain or cycle route to keep it here." with a brown primary "Browse the map", and the three saved places sit underneath as large photo tiles with "City" and "Saved 4 Oct 2026". The two halves use two grammars (compact rows for the shortlist, 3:2 tiles for account saves) and two remove controls.
- **Why it matters:** A first-timer is told to look for a star that does not exist on the cards, and in Carta the star means "rating". A returning user sees "nothing" and "three things" on the same screen. The density rule says a list is compact rows, about ten to a phone screen; here three places take a screen and a half.
- **Fix:** One shortlist. Merge the account store into it (or show its rows inline with no second heading), compact rows with the 72 px photo, name, Score, the price line and the same bookmark control as Explore. Group or filter by kind (Places, Walks, Beaches, Lakes, Mountains, Cycle routes); on desktop these become kit Tiles in the side panel, two across, exactly like Explore's "Trip type", which is what finally makes the panel a filter pane. Empty state: one line naming the gesture with the bookmark icon inline, one primary.
- **Suggested command:** `/impeccable redesign` for the merge, `/impeccable clarify` for the copy.

### P1. Visited does not give "a clear view of what was visited"

- **What:** Top to bottom on a phone: a 240 px map frame that is a blank grey box until MapLibre arrives; two stat cards ("Visited countries 3 / 43 European countries" with flags, "Visited cities 3 Cities visited" with a pill of names); "Alongside your friends" with the sentence "Counting only the trips each friend chose to show you, so this is not a ranking." and a table sorted by countries; only then "My travel record" with large focal-sized cards, each with an "Add who came along" row. The record starts more than two phone screens down.
- **Why it matters:** The traveller's question is "where have I been, and when". The answer (the trips) is last, and the space above it is spent on a loading box, a catalogue denominator (a catalogue count is banned page furniture) and captions that restate their headings. A table sorted by countries is a ranking whatever the sentence under it says; the sentence exists to apologise for the design.
- **Fix:** Map first, at most a third of the phone viewport, with visited countries painted in the ink ramp and the cities pinned, drawn as a still ink drawing from the geometry on hand while it loads (carta-design "Map and list in sync"). Under it one fact band in the label-over-value grammar: countries, cities, nights away, and kilometres if the data holds them; no denominator. Then the trips, grouped by year, as compact rows (photo, title, dates "to", the places). Friends become a toggle on the map ("Show friends' trips") or a row of faces on the trips you shared, not a leaderboard. "Who came" lives inside the trip's memory view.
- **Suggested command:** `/impeccable redesign` (Visited information order), `/impeccable distill` (captions).

### P2. Planned does not serve a returning traveller with two trips coming up

- **What:** On a phone the focal card's 2:1 photo takes more than half the card and, with the moderation notice band attached under it, the whole first screen; the second trip is below the fold. The card carries title, places, countdown, dates and a day rate, then a footer row "Plan its days in the Day planner" with a typed `›`. It does not carry what the Trip planner already computes for that trip: the trip kit (bookings "0 of 4 booked", packing list, notes, expenses, T458), days planned against days in the trip, or who is coming. The friends line ("Friends showed you 3 trips." plus "See them in Friends") sits between trips and day plans as a band of its own; the empty Day plans shelf prints a paragraph and a button.
- **Why it matters:** carta-design caps a phone choice card's photo at a third of its height, and "the first upcoming one may be one size larger, never a bento". The owner asked to modernise upcoming trips and reuse information from other tabs; Wanderlog and Airbnb Trips lead with "what is left to do" for the next trip, and Carta already has those figures.
- **Fix:** Focal card with the photo at a third, then title, countdown, dates with "to", the trip total marked as the planner marks it, and one status line from the kit ("2 of 4 booked, 3 of 7 days planned") that opens the planner on that part. Later trips as rows with the same figure. Co-planners and companions as an avatar stack on the card. Friends' upcoming trips as one rail with faces, only when there are some. Day plans as rows under the trips, absent when empty (the file already applies "absent beats present and empty" to friends).
- **Suggested command:** `/impeccable shape` for the card content, then `/impeccable redesign`.

## Copy audit (owner asked for the AI-written captions to go)

| Where | Now | Proposed |
|---|---|---|
| Planned, signed out | "Sign in to save trips and find them back here on any device." + Sign in (primary) | No sentence. Section empty state: "No trips planned", primary "Plan a trip", quiet "Sign in" beside it. |
| Day plans, empty | "No day plans yet. Shape a day in a city and it stays on this device." + Open the Day planner | Remove the shelf when empty. |
| Planned, signed in, empty | "No trips on the calendar. Build a route with a few stops and it lands here with its dates." | "No trips planned" + "Plan a trip". |
| Shortlist, empty | "Nothing starred yet. Tap the star on any place, walk, beach, lake, mountain or cycle route to keep it here." | "Tap [bookmark icon] on a place, walk or beach to keep it here." (one line, the real icon) |
| Shortlist, account empty | "Nothing saved yet. Save a place from the map and it waits for you here." | Gone with the merge. |
| Visited, empty | "Nothing here yet. Finish a trip and it is kept here, or add one you have already taken." | "No trips taken yet" + "Add a past trip". |
| Visited stats | "3 / 43", "European countries", "Cities visited", "Munich, Salzburg, Bruges" pill | "Countries 3", "Cities 3", "Nights 9" as one fact band; the names are on the map and in the list. |
| Friends | "Counting only the trips each friend chose to show you, so this is not a ranking." | Remove with the table. |
| Headings | "Your upcoming journeys", "My travel record", "Saved to your account", "Your shortlist" | "Upcoming", "Trips taken" (or year headings), one "Shortlist"; the tab already says which view this is. |
| Card footer | "Plan its days in the Day planner", "3 days planned, keep planning" | "Plan the days", "3 of 7 days planned". |
| Shortlist tiles | "City", "Saved 4 Oct 2026" | Remove both. |
| Visited cards | "Add who came along" on every card | Move into the memory view. |
| Friends line | "Friends showed you 3 trips." + "See them in Friends" | Faces plus "Sofie and Jonas shared trips", or a rail. |
| Map control | aria "See the map bigger" | "Expand map". |

Also: `saved.notConfigured` is developer copy shown to travellers; `fav.snapped` "You starred {name}" carries the same star error.

## Accessibility and states

- Tabs are `role="tab"` buttons with no `tabpanel`, no `aria-controls`, no roving tabindex and no arrow keys (the kit Tabs has all of these). Two tablists with the same label are rendered, one per layout, and hidden by CSS.
- The friend table is divs: its column headers are a "legend" row at the bottom, so a screen reader hears "You 3 3, Sofie Vermeulen 2 3" with no headers. Use a real table or label each figure.
- Country is lost for screen readers on cards: the flag is `aria-hidden` and the country text renders only when no flag exists (`FavCard`, `JourneyCard`, `ShortlistRow`).
- Card open buttons rely on `title` and the concatenated inner text for their name (title, places, countdown, dates and price read as one run). Opening a trip changes the view, so by the navigation rule it should be an `<a href>`.
- `.uptrip-crew-input:focus { outline: none; border-color: var(--ink-soft) }` removes the ring without the house replacement (`--action` edge plus ring). `.uptrip-crew-save:disabled { opacity: 0.45 }` is a paler live button, which the kit forbids.
- `.saved-section-sub` sets sentences in `--ink-mute` (`--text-3`) at 12 px; `--text-3` is for metadata, never prose.
- The map loading state is an empty `--paper-dim` box; the rule asks for a still drawing of the geometry on hand.
- The moderation notice uses a US date ("Oct 13, 2026") beside day-first dates on the same card.
- Counts on tabs: the selected tile draws its count in a disc and the others bare, so the count reads as a state mark.

## Responsive

- Phone 360 to 390: h1 plus tile row costs about 230 px before content; with the 44 px bottom nav and header, the first trip's photo is the only thing on the first screen. Tabs in place of tiles return about 70 px.
- 820 px (tablet, desktop layout): the side panel is 200 px holding three buttons; content is a single column 560 px wide with empty space right of short cards. Either give the panel real filters (Shortlist kinds, Visited years and countries) or drop it and use the width: upcoming trips left, map right from 1024 px.
- The focal card switches to a row with the photo at 44 percent from 769 px, which works; the moderation band beneath it does not take the same structure.

## Persona red flags

**Casey, phone, one hand.** The view switch is at the top of the screen, as far from the thumb as it can be. The first upcoming trip fills the screen, so the second trip needs a scroll she did not know she needed. On Shortlist the bookmark that removes a place sits at the bottom right of each tile, exactly where a thumb rests while scrolling (Undo saves her, but she has to notice the toast). The map on Visited swallows vertical scrolls only when cooperative gestures are off; in the page it needs two fingers, one hand cannot.

**Jordan, first-timer, signed out.** Planned shows two grey boxes: a brown "Sign in" and a quiet "Open the Day planner", each with a sentence; nothing shows what a saved trip looks like or why to sign in. Shortlist tells him to tap a star; he looks for one and finds bookmarks. The page uses trips, journeys, plans and day plans; he cannot tell which button leads where.

**Sam, keyboard and screen reader.** Tab key walks through all three tabs one by one with no arrow keys and no panel association; a duplicate tablist may be announced if the CSS hiding is not `display: none` on both breakpoints. Each card announces one long run of text. Flags are silent, so countries vanish. The friend table has no headers. Good: the card menu, the map dialog and Undo focus all behave.

**Returning hiker with two upcoming trips.** She opens My trips to check what is left to do before the Dolomites. She sees a countdown and a day rate for the first trip only; the second needs a scroll and shows no figure. Nothing says whether the huts are booked, whether the packing list is started, or which shortlisted walks are near the towns on the route. The price she sees (a day rate, unmarked) is not the trip total the planner showed her last week (marked est.), so she reopens the planner to check, which is the job My trips should have done.

## Minor observations

- The selected state is the tint plus a brown edge; on a tile the kit adds a tick, on a tab an underline. Pick the kit control and its mark.
- `saved-card-footer-go` is a typed `›`; use the chevron `Icon`.
- "Read the statement" in the moderation band is a pill-shaped button; buttons take `--radius-control`.
- The flag sits on the photo as a white chip. The no-text-on-photo rule permits icon buttons only; a flag chip is borderline. Moving the flag beside the country name under the photo matches Explore.
- The shortlist's account tiles have a filled ink bookmark; Explore's saved state is a bookmark in a white disc over the photo. Same control, two looks.
- The section count chips repeat the tab counts.
- `Loading…` is fine, but the Visited tab's error path is a raw `auth-error` div, not `ErrorBlock`.
- `acc-rise` re-animates every section on each tab change (8 px rise); fine under the motion rules, but with three sections it reads as busy. One fade on the panel is enough.
- Many comments in the CSS still describe the retired system ("mono", "display face", "--ink-fill"), which will mislead the next session.

## Provocative questions

1. Why does a planned trip show a day rate at all, when the planner knows what the whole trip costs? Is the trip total the number this page exists to keep?
2. Is Shortlist a tab, or the inbox that feeds Planned: should a shortlisted walk be assignable to an upcoming trip in one tap, and then show on that trip's card?
3. On Visited, is the map the index? A tap on a painted country could filter the list below, which would remove the need for stat cards entirely.
4. What is the friends feature for: comparing counts, or knowing that Sofie is in Porto the same week? The second is a reason to come back; the first is a scoreboard with a disclaimer.
5. Does the desktop side panel earn 200 px holding three buttons? If it cannot hold filters, the alignment with Explore is better served by the same Tabs and content width than by the same empty column.
6. Should the next trip's countdown live outside My trips (the header or the top of Explore) for a returning traveller, so My trips becomes the place for detail rather than the only place the trip is remembered?
