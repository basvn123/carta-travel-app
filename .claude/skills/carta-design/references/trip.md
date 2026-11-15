# Trip rules (reference)

> Look rules for these screens are rewritten by the trip lane of the house style run (2026-11). Until then the look comes from `DESIGN.md` and the carta-design `SKILL.md`; the rules below are the product rules these screens keep (what they show, what each control does, how numbers behave). They bind.

Covers the planned trip page, the day planner and workspace, stays, and flights in a trip.

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
