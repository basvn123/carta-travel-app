# Plan rules (reference)

> Look rules for these screens are rewritten by the plan lane of the house style run (2026-11). Until then the look comes from `DESIGN.md` and the carta-design `SKILL.md`; the rules below are the product rules these screens keep (what they show, what each control does, how numbers behave). They bind.

Covers the plan flow, the wizard, the trip finder, "Trips for you", ready-made trips (trip styles) and journeys.

Numbers and money, flights and the typical fare (T882-b, never counted in "Fits" without its label), cost on cards, the "More" menu and a multi-step flow's chrome, copy and the quality floor: see shared-product-rules.md. The receipt and cost bar: see place.md. The planner workspace, day detail and the planned trip page: see trip.md. Trip style tiles in a list: see explore.md, Density. The five difficulty squares: see outdoors.md.

## Where Plan starts (T496)

Plan holds trip and day in one place; with nothing in progress it is a "Plan something new" page with two tiles, Trip and One day. Ask Carta has no door on Plan (T595: its one door is on Explore's overview).

## The persona question (owner decision 2026-10-30, T878)

The first screen built under the design-freedom decision is the persona question (`g:persona`): a colour world per persona with a drawn diagram of how that traveller moves (`PersonaMark.jsx`).

## Trips for you v2 (owner 2026-10-30, T879 to T884)

The owner reviewed the plan flow's results and trip page and freed Trips for you from the old look rules, asking that its colours stay subtle and fit the other tabs. These product rules hold there (`src/planner/finder/`):

- **A trip card** carries the name and the country; the top pick may take a whole row.
- **The match ring** shows the trip finder's ranked score (T884), never a quality rating.
- **Warnings** (over budget, Overvol, a missed like) read as warnings; best value marks only best value; the four cost colours are only in the cost card. No traffic-light scale.
- **The phone's primary may stick.** Under 1024 px a bar pinned above the nav holds the total and Plan this trip, and the price card's own button hides, so one primary shows at a time.
- **Wat het kost** is compact by default: the total, the price a person, the cost bar and the budget line, with one Breakdown (Opbouw) button at its top that folds the lines open.
- **The trips map** draws photo pins and curved lines from the home airport with the time there; the picked trip is the marked one.

## Ready-made trip page (T430, T431)

The trip page of a ready-made trip: gallery, head, fact band, Why this trip, the price card (a sticky side column from 1024 px), Is this week for you, Not quite right? straight after it, the week day by day, getting there, before you go. The suitability strip under a trip hero is retired (2026-10-15, T431): the page carries a fact band (days, distance, climb, highest point, where you sleep, start) and the difficulty as a status chip in the head (see outdoors.md, Difficulty).

A trip style's list is tiles: a week is chosen on its photographs and the places it visits (owner 2026-10-15, T431; see explore.md, Density). In a trip list whose length control already states the days, the card carries no length (owner 2026-10-15).
