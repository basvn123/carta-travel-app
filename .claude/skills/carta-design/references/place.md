# Place rules (reference)

> Look rules for these screens are rewritten by the place lane of the house style run (2026-11). Until then the look comes from `DESIGN.md` and the carta-design `SKILL.md`; the rules below are the product rules these screens keep (what they show, what each control does, how numbers behave). They bind.

Covers the place (destination) page, the receipt, the cost card and cost bar, food, climate, the gallery, the rating, the region and country pages, and the flight sheet on the place.

Numbers and money (precision, units, the opened price, flights, one day-cost basis), cost on cards and pages, best value, ratings, data drawings (the month strip), tracks (the photo track), navigation and the page bar, copy and the quality floor: see shared-product-rules.md. The settings line and the Lifestyle control: see explore.md. The trip page's receipt and cost card: see trip.md.

## Flights on the place

Every flight rule (Google Flights' price never presented as Carta's own, the airline mark and times, the typed fare labelled as theirs, the sweep age limits, bag fees, the typical fare of T882-b): see shared-product-rules.md, "Numbers and money", Flights.

## The day sentence and the page tabs

What a day price includes is built from a list of parts, one key per part ("A bed plus food and drink."), so a transport estimate is one more part later (owner T491-h). The destination page tabs (Overview, Nearby, When to go, Practical) stick under the PageBar by the sticky-rail rule and change the URL without a history step.

## The receipt

Carta's signature object, wherever a total needs justifying: a head with destination and route, one hairline separated line per cost component with the figure right aligned in cents, a rule above the sum, the sum, and a footer showing what one changed input would do to the total. It is the page's one bounded object. On a trip page the trip's own budget is the receipt (cost bar, lines, total a person and for the party, the one Lifestyle control under it); a nearby town's receipt is a labelled second view and carries no stay select of its own. A day plan carries one per person figure for the day from the same cost index; a tap opens the compact receipt. A receipt line may appear outside the receipt only when read live from it and set exactly as it sets it.

## The cost bar

At most one stacked bar above a receipt's lines, never instead of them: 8 px, full width, no legend, no percentages. Owner decision 2026-10-29 (T845, "the colours must be distinct"): where the receipt is grouped (the trip page's four cost groups), the bar has one segment per group in its own colour, `--cost-travel`, `--cost-around`, `--cost-stay` and `--cost-food`, and each group's name carries a matching 8 px dot (the overview's tiles too), so the colour never stands alone. Those four colours are for the cost groups and nothing else. An ungrouped receipt keeps one segment per line.

## Fields with no data yet (owner decision 2026-10-23, T630 to T632)

The fields of the explore-completeness spec keep their slot on the Explore detail sheets even with no data, and show the shared placeholder `components/NotYet.jsx` ("Not available yet"). For those fields "a missing fact is left out" and "Say less" do not apply. The fact band itself (KeyFacts) still leaves a missing cell out; the slots live in the Facts rows and sections. See DESIGN.md "Fields with no data yet".

## Sources and credits on the page

A photo's credit sits under that photo (owner 2026-10-15). Item pages keep no "Where this comes from" fold: the data sources are one line of links at the foot of the page.
