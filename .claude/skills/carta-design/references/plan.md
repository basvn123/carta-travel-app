# Plan rules (reference)

> Look rules below were written by the plan lane of the house style run (2026-11); they sit on `DESIGN.md` and the carta-design `SKILL.md`. The product rules after them (what each screen shows, what each control does, how numbers behave) bind as before.

Covers the plan flow, the wizard, the trip finder, "Trips for you", ready-made trips (trip styles) and journeys.

Numbers and money, flights and the typical fare (T882-b, never counted in "Fits" without its label), cost on cards, the "More" menu and a multi-step flow's chrome, copy and the quality floor: see shared-product-rules.md. The receipt and cost bar: see place.md. The planner workspace, day detail and the planned trip page: see trip.md. Trip style tiles in a list: see explore.md, Density. The five difficulty squares: see outdoors.md.

## Look rules (house style, plan lane 2026-11)

- **Wayfinding is the layout.** A multi-step flow always shows the route so far. On a phone the step head carries a slim path: a walked step is an umber disc with its tick, the step in hand carries the small blaze, the rest wait as rings on one hairline, and the "x of n" text stays visible beside it. From 769 px the step list (`FlowRail`) is a trail pane on the stone ground: waymarks on one line, each answer under its step, the step in hand on the selected row (`--select-row`, umber 800, weight 800) with the blaze; the head path and its text step back there, so the position is said once. Your trip so far (`FlowSide`) is a third column from 1100 px and the fold over the question below that. The wizard's head stepper uses the same waymarks in a row.
- **One question, one Continue.** The question is a paper pane, flat on a hairline beside the trail; its reading column is `--w-read` (persona and likes, `is-wide`, up to `--w-detail`) and centres in the pane from 1280 px. The title is left aligned in `--text-headline` 800. Continue is pinned: a sticky foot above the nav on a phone (paper, hairline, `--elev-2`), the pane's foot from 769 px. The blaze on the step mark paints in only after the traveller's own step, never on the flow's first paint.
- **Plan home** shows its name ("Your trips", `pf.home.tripsTitle`) over New trip and the Ready-made trips door. Empty, it opens on the house page head "Plan a trip" (`pf.home.planTitle`, `--text-headline` 800, ink, no umber second line) with Start planning and Ready-made trips; from 1024 px the head and the two actions share one row and the collection runs under them across the width as one row of flat photo tiles.
- **The trip finder** keeps the phone list with the floating map switch (a paper pill with an ink edge, never an ink slab) and the list beside the map from 1024 px. Its card follows the rail-card grammar: the photo carries only the photo and the paper save disc; under it the name, the match, the place, the top pick's label and reasons, the facts, the figure (loudest), its unit. The match is an ink arc on the hairline track with its words ("89% match"): never a Score plate, never umber. Quick filters and answer chips are pills with a 1.5 px edge; on a phone their row fades at the right edge as the scroll hint.
- **Trip pages** (found trip, library trip, journey) share the page grammar: the photo with 16 px corners, the head under it (never on it), fact tiles (paper on a hairline, label then value), sections on hairlines, and a cost post: flat on a hairline beside the content from 769 px (journey: from 1024 px, where `PageTemplate` switches), a sticky foot with the figure and the one action on a phone. Only the phone foot casts a shadow.
- **The library trip page** keeps its folds and its pinned classes (`.itin-photohero` then the flush `.itin-capband` with the one h1, `.itin-facts`, `.dsec`, `.itin-cost*`); the Score is the `ScorePlate`, the missing photo the world tile, the gone state the error `StateBlock`.
- **The found trip's cost bar** uses the wagon paint (getting there outlined umber, around sunken with an edge, stay solid umber, food beige with its edge), 2 px gaps, words on every line. It is the trip's cost bar, not a `Formation` (that part prices a day).
- **Warnings** (over budget, a missed like, busy crowds) read in `--danger` with a word or icon; there is no amber. A cheapest-total mark says "Cheapest" (`tf.card.best`).
- **Ready-made trip cards** (`.ctc`) carry the name, countries and "In season" under the photo; difficulty is a neutral tag whose word carries the meaning.
- **No sparkle**: the wizard's design and templates doors use the route mark.

- **Totals on the signpost plate.** The found trip's total and the library trip's total (the receipt's own sum) sit on `Plate variant="total"`, as the trip page's total does; the library post shows the total, the facts show the day figure, so each figure is said once. A total moves only after the traveller's own change (`Figure`, `mine` only then).
- **Card prices.** A finder card's price is the house `Formation`: the stay and food wagons, then the trip total; getting there is the outlined pill only when the total leaves the flight out. Ready-made, trip-style and country cards print "From €124" (`pf.fromEur`), and the list says the unit once ("A day, a person", class `pl-unit-head`), right-aligned in the title row of the first section that shows figures (Ready-made: `.pf-carta-hrow`). A Ready-made card (`.ctc`) follows the rail-card grammar: photo, name in `--text-lead` 700, flag and country in `--text-body`, the figure loudest in `--text-figure` 800 after a quiet "From".
- **Photos in a collection** are a flat row of rounded tiles (16 px corners, no tilt, no white frame, no shadow); never a fanned or polaroid stack.
- **Motion.** A step change settles the question in (`useStepIn`, `pl-step-in`, settle curve, no overshoot); the chosen row's mark ticks in on the tick spring; the step blaze paints only after the traveller's own step (`usePaintOnStep`); a save pops (`.hs-pop`) at the tap. Reduced motion shows the end state.
- **A Continue that is not ready** reads unavailable (band fill, `--text-3`), never as an umber button.

## Where Plan starts (T496)

Plan holds trip and day in one place; with nothing in progress it is a "Plan something new" page with two tiles, Trip and One day. Ask Carta has no door on Plan (T595: its one door is on Explore's overview).

## The persona question (owner decision 2026-10-30, T878)

The first screen built under the design-freedom decision is the persona question (`g:persona`): a colour world per persona with a drawn diagram of how that traveller moves (`PersonaMark.jsx`).

## Trips for you v2 (owner 2026-10-30, T879 to T884)

The owner reviewed the plan flow's results and trip page and freed Trips for you from the old look rules, asking that its colours stay subtle and fit the other tabs. These product rules hold there (`src/planner/finder/`):

- **A trip card** carries the name and the country; the top pick may take a whole row.
- **The match ring** shows the trip finder's ranked score (T884), never a quality rating.
- **Warnings** (over budget, Overvol, a missed like) read as warnings; best value marks only best value; the four cost colours are only in the cost card. No traffic-light scale.
- **The phone's primary may stick.** Up to 768 px a bar pinned above the nav holds the total and Plan this trip, and the price card's own button hides, so one primary shows at a time. From 769 px the cost post sits beside the page with its own button (plan lane, 2026-11).
- **Wat het kost** is compact by default: the total, the price a person, the cost bar and the budget line, with one Breakdown (Opbouw) button at its top that folds the lines open.
- **The trips map** draws photo pins and curved lines from the home airport with the time there; the picked trip is the marked one.

## Ready-made trip page (T430, T431)

The trip page of a ready-made trip: gallery, head, fact band, Why this trip, the price card (a sticky side column from 1024 px on the journey page; the library trip's post sits beside the page from 769 px), Is this week for you, Not quite right? straight after it, the week day by day, getting there, before you go. The suitability strip under a trip hero is retired (2026-10-15, T431): the page carries a fact band (days, distance, climb, highest point, where you sleep, start) and the difficulty as a status chip in the head (see outdoors.md, Difficulty).

A trip style's list is tiles: a week is chosen on its photographs and the places it visits (owner 2026-10-15, T431; see explore.md, Density). In a trip list whose length control already states the days, the card carries no length (owner 2026-10-15).
