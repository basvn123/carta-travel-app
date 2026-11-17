# Trip rules (reference)

> The look rules below ("The look") were written by the trip lane of the house style run (2026-11-16, G1). The product rules after them are what these screens keep (what they show, what each control does, how numbers behave). Both bind; `DESIGN.md` and the carta-design `SKILL.md` win on anything not said here.

Covers the planned trip page, the day planner and workspace, stays, and flights in a trip.

## The look (house style, 2026-11)

The trip and the day are drawn as a walk: one path, the stops on it as signposts, the legs as the line you travel.

**Trip page head.** The name (`--text-headline`, 800), the where button (flag, country, places) and two status chips (countdown, "n of m booked" with a ring that fills with the paint) stand on the page; the first stop's photo sits beside them from 769 px (3:2, `--radius-card`, 18 to 22 rem wide) and above them on a phone (5:2). Never text on the photo.

**Journey line** (`trip/JourneyLine.jsx`, `.tpg-line`), under the head on every tab: home ends as 12 px ink discs, legs as a 40 px (24 under 420) ink line with the mode's icon in a 20 px paper disc, dashed for a flight, stops as umber pills (28 px high) whose flex-grow is their nights; a pill shows its number and, where its container is 88 px or wider, its name; "N nights" at the end. Static: no buttons, no scroll, no motion (it always fits its width).

**Trip bar.** One paper bar on the `--elev-1` hairline, `--radius-panel`; cells label (12, 600, `--text-2`) over value (14, 700) over the sub line; the pencil in `--text-3` stays as the edit cue.

**The footpath** (`Journey.jsx`, Overview "Your route"). Each step is three columns: the day stamp (36 px, 44 from 420), the path column (24, 28) with its node, the part (max 38 rem). The path is drawn per step: beside a stay the umber route (`--stroke-route`, `--map-route`), under a flight a 2 px dashed ink line, under a hop or drive a 2 px solid ink line, toward the car advice a dotted `--wagon-none-edge` line. Nodes: a stay's number on an umber disc (the same number as its journey-line pill), a leg's mode on a paper disc with an edge ring, home a 14 px ink disc, the car advice a dashed ring. A stay is a place plate (`Plate`, photo lead 40 px at `--radius-sm`, the town in the plate face, "3 Jul to 5 Jul, 2 nights", the figure); a flight, drive or hop is a leg plate on one line (the two codes and times joined by a hairline, or "Bus to Lake Bled" with "From Ljubljana"), the figure right. Under every plate one quiet row: the carrier, stops and Change for a flight, then To book or Booked, then Book at the end. The car advice is words and one secondary button, no box. Every rule is scoped under `.tpg` (the place page shares `.jr-*`).

**Still to book.** Paper panels (`--radius-panel`, hairline), no ticket drawing: the two ends large joined by a plain hairline, the foot a hairline then the figure and a secondary Book. The pager: to book `--border`, booked `--text-2`, the one in view painted (`--action`, `--dur-paint`).

**The cost post** (the arc `CostCard` that ships; `COST_CARD_UMBER` stays off). Paper on the hairline, `--radius-panel`. Head "What it costs" and Group / Per person (kit `Segmented`). The total is the screen's one total plate (`Plate variant="total"`, its unit as the label, `Figure` for the number). Under it the train (`.ccard-arc.ccard-train`): the trip's four parts as 32 px wagons weighted by their euros, each with its house icon: flights `--surface-sunken`, getting around umber 200, stay `--wagon-bed`, food `--wagon-food`; nothing outlined (every part is inside the total); a part without a figure is the dashed "Not yet" wagon after the train. The budget as one line with its bar (`--action`, over budget `--danger`); the four rows with umber house icons, no coloured discs; the notes; Costs and Add what you paid as quiet umber doors. The Costs receipt's group keys use the same four fills.

**Layout.** Phone: head, journey line, bar, tabs, then the cost post first in the Overview, Still to book, the route, the map, the tools; the dock (Change your trip, Plan your days) over the bottom nav, never a figure. Tablet 769 to 1023: the Overview is two columns, the route left and the cost post right (19 rem; sticky from 900 px of height); the dock keeps its buttons at their own width on the right. From 1024: a side column (22 rem, 24 from 1280) with the cost post, the tools and the map; Plan your days is the top row's primary beside Change your trip.

**Day planner.** The drawer strip is the day's place plate (the day's name, "4 stops, 09:30 to 15:30", the day figure as the receipt button). In the drawer layout the h1 is visually hidden (the strip says it); Saved is a tick and the word. The switcher: round 44 px buttons with an edge ring and the date in a pill. Start your day and the day in numbers are two flat paper panels; Start your day carries no day cost (the strip and the cost bar do). "Your day" sits on its own line, Detail, Fill this day and Best order under it. The list is on the path: a walk is the umber route, a ride a dashed ink line, the start and end thin ink, a stop's number an umber disc (its map pin's number). On a tablet the kit, the town guide and the exports stand in a 16 rem column beside the day (`.dayws-aside`). Rules live in `planner/days/DayHouse.css`, scoped under `.day-ws`.

**Itinerary and Costs tabs.** The Itinerary's stops and legs hang on one path column (the umber route, a solid ink line through a hop, ink ends, a dashed node for Add a stop); each stop is a paper panel on the hairline with its number on the umber disc. The Costs receipt is a paper panel; a group with no figure says "Not yet", never 0.00.

**Motion.** Tabs paint; Segmented ticks; a total the traveller just changed (the hire car, Apply in Change your trip) rolls with its delta note within 1.5 s of the act, any other change swaps in place (`Figure mine`/`still`); a wagon that arrives with the hire car couples in. The day's one signature: after Best order the rows glide to their new places on `--dur-settle`/`--ease-settle`. Nothing animates at first paint (the day list's entrance is off). Haptics only through the kit.

Numbers and money (flights, one day-cost basis, a saved trip keeps its stay and Lifestyle, T703-a), tracks (the day track), the bottom slot and undo, the hand-over copy ("Open Day 2 in Google Maps"), copy and the quality floor: see shared-product-rules.md. The receipt and the cost bar with its four cost groups (T845): see place.md. The 3D terrain map on a trip day: see outdoors.md. Trips for you and the ready-made trip page: see plan.md.

## The trip page v5 (owner 2026-10-30, T885 to T890)

The planned trip's page (`TripSummary.jsx`) follows the free direction of Trips for you. One photo carries the name (the places, never a bare country), the country and two pills: the countdown and "1 of 3 booked". Under it the trip bar holds every input of the price as label over value with a pencil. The total shows once, in the compact cost card (side column from 1024 px, Overview on a phone), with the budget line inside it and Breakdown at its top. The route is the one booking list: each part says Booked or To book (a neutral chip, never the best-value marker) with its link. Change your trip is one sheet; a change shows old total, new total and the difference before Apply. The phone dock holds Change your trip and Plan your days, never a figure.

On a trip page the trip's own budget is the receipt (cost bar, lines, total a person and for the party, the one Lifestyle control under it); see place.md, The receipt.

## Workspace (T500, T501)

Desktop: list left, map right, a fixed total bar at the foot that reads only `priceTrip()`, opens the receipt and never holds the primary; inside a trip it shows the trip first, then the day. Phone: the map fills the screen under one MapDrawer with three states (a strip, half, up to under the header); the amount is always in the strip; the handle is a button, so dragging is never required; the bottom nav hides when the drawer is full. Picked countries on a map are marked.

## Day detail (T501, owner T492-c)

The traveller picks how detailed a day is with one quiet Detail control: List (default), Parts of the day (Morning, Afternoon, Evening heads, not cards; Lunch and Dinner rows without amounts) or By the hour. Adding never reorders the day; "Best route" asks first. A ticket counts per person only where its price is known, else "Ticket, price not known" and no figure.

## Day list

Between two stops one line gives minutes and km by the leg's mode; each stop carries an arrival time; both are estimates, so the first of each per view carries the tilde, "est." and an InfoDot. No hour grid, no end time stated as fact. Days are switched with one control, "Day N, weekday date", flanked by Previous and Next. Ways to add live in one labelled toolbar row inside the content; nothing floats over the list.

(This rule predates the price plan of 2026-10-24, which removed the tilde and "est." from prices only; the old text did not say whether that reaches times and distances.)

## Multi-day and planning maps

On a multi-day map stops are numbered by day, the selected day's line is marked and every other day is not, beds are drawn apart from stops, and a line that is not the measured path says so under the map. On a planning map catalogue places are quiet, a picked place carries a tick, and only the live route and its numbered stops are marked. The committed selection (the chosen day) is the one marked item on that map.

## A day plan's figure

A day plan carries one per person figure for the day from the same cost index; a tap opens the compact receipt.
