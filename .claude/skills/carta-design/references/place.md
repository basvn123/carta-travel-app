# Place rules (reference)

Covers the place (destination) page, the receipt, the cost card and cost bar, food, climate, the gallery, the rating, the region and country pages, and the flight sheet on the place. The look rules come first (the place lane of the house style run, 2026-11-16), then the product rules these screens keep (what they show, what each control does, how numbers behave). Both bind.

## The look (house style)

**One job, one order.** The place page answers "is it affordable and good for me": photos, the name, one meta row (flag and country, the Score plate and its word), the standing as beige tags, then **the cost post**, then the jump bar and the sections. The day a person is the first figure after the photo and the name at every angle.

**The cost post** (`DestPriceCard.jsx`, `.dpc-wrap` and `.tcard` in `88-place-template.css`): paper, 1 px `--border`, `--radius-panel`, no shadow, no coloured edge, no visible title (an sr-only heading "Costs").
1. The dates and party pills: outlined (`--stroke-edge` `--edge`), 44 px; open takes the selected grammar.
2. The day row, the loudest figure on the page: `.tcard-each .money` at `--text-display`, the `PriceItems` popover on it, the unit once ("a person a day"), then the `Formation` with the day's parts only (the bed umber, food beige; its own day figure hidden because the day is printed above). The return fare is not a wagon here: it is a different unit and the ways list right below says it. Each wagon is rounded on its own, so bed plus food may differ from the day by a euro; the day is the engine's figure.
3. The stay for the party on one signpost `Plate` (place variant): name "7 nights, 2 people", second line "€1,087 a person", the figure the engine's total through `Figure` (rolls only within 1 s of the traveller's own change; `still` otherwise). Never a second total plate.
4. The primary and "Or plan one day here" (the primary hides below 1024 px, where the foot bar holds it).
5. "Getting there from X" with "Return, a person" said once in the head; ways as leg `Plate`s in a radio group (roving tab stop, arrow keys, Home and End), Cheapest and Fastest as word tags (best value is the beige mark with its word).
6. "Where you sleep" as kit choice chips (`ChipGroup`).
7. The receipt as kit `CostRow`s in `dl.costrows.has-leaders`: Bed and Food stay buttons that open the Lifestyle (44 px hit area on touch), a "Rounding" line when the printed whole euros do not add up to the engine's total, the total as `CostSum` ("Total"), parts without a figure as "Not yet" under the total, outside the sum.
8. Things to do switches, the price alert, the prices refreshed line.

**Angles.** Phone (to 768): photos as an inset swipe track (88 % slides, 16 px corners, at most 228 px high), the post inline after the head, the foot bar with the inputs and the primary; the foot bar's figure and its date and people line show only once the post's day row has scrolled away (`is-post-in-view`), so the dates are never said twice in one view. Tablet (769 to 1023): the post is a two-column card (inputs, day and plate left; ways, stay and receipt right), the foot bar stays. Desktop (1024 up, `useWide`): the photos sit in the main column and the post is a 380 px sticky column from the top of the page beside them, with its own scroll when taller than the screen.

**Sections.** Titles `--text-title` 800 on hairlines; the jump bar is anchor links with the umber 3 px paint bar under the section in view (never pills); key facts and practical cards on the band; Around tiles put the photo above and the kind and count under it (text never on a photo); the relief band (`ReliefBand`, cut at 0 % with the cut line and its blaze hidden because there is no flat side, 136 to 168 px) heads the Around section only when the dossier has peaks with a height; climate bars, stay prices by month and the price-feel scale are one umber ramp (height, temperature and words carry the meaning too); the month in view takes the beige wash and the umber edge; a sight without a photo is the world tint.

**The Score** is the ink plate everywhere: `ScoreChip` keeps its markup (`data-band`, `data-score`, the star svg for the readers) but the star is hidden and the figure sits on `--plate`. The rating sheet: the plate and the word, the why line, the standing as receipt rows (label left, words right, hairlines), the parts as rows with the figure as text and a thin umber bar that draws once on open.

**Region and country pages.** The skeleton of the place page: photo (16 px corners, 228 / 360 / 420 px high), the name at `--text-headline` 800, then the decision block on paper (the post's look): the day as a signpost `Plate` that names the place the price belongs to (region: the priced town; country: the country, under "Typical day" and its info dot, which stays a visible control), best months (country: the month strip, good months on the beige wash with the umber bar), getting around, the one primary at `--tap-main`. From 1024 px the block is a sticky column that starts beside the photo. The rails inside use the explore lane's rail look.

**Motion.** Signature moment: a way picked, the leg plate paints (umber edge, beige wash) and the plate's total rolls once with its delta note and one polite announcement; a touch commit ticks (`haptic('tick')`). Chips tick through the kit; sheets and folds use `.hs-reveal`; the dock's figure rises in on `--dur-2`. Nothing at first paint; reduced motion shows the end state.

Numbers and money (precision, units, the opened price, flights, one day-cost basis), cost on cards and pages, best value, ratings, data drawings (the month strip), tracks (the photo track), navigation and the page bar, copy and the quality floor: see shared-product-rules.md. The settings line and the Lifestyle control: see explore.md. The trip page's receipt and cost card: see trip.md.

## Flights on the place

Every flight rule (Google Flights' price never presented as Viantra's own, the airline mark and times, the typed fare labelled as theirs, the sweep age limits, bag fees, the typical fare of T882-b): see shared-product-rules.md, "Numbers and money", Flights.

## The day sentence and the page tabs

What a day price includes is built from a list of parts, one key per part ("A bed plus food and drink."), so a transport estimate is one more part later (owner T491-h). The destination page tabs (Overview, Nearby, When to go, Practical) stick under the PageBar by the sticky-rail rule and change the URL without a history step.

## The receipt

The app's signature object, wherever a total needs justifying: a head with destination and route, one hairline separated line per cost component with the figure right aligned in cents, a rule above the sum, the sum, and a footer showing what one changed input would do to the total. It is the page's one bounded object. On a trip page the trip's own budget is the receipt (cost bar, lines, total a person and for the party, the one Lifestyle control under it); a nearby town's receipt is a labelled second view and carries no stay select of its own. A day plan carries one per person figure for the day from the same cost index; a tap opens the compact receipt. A receipt line may appear outside the receipt only when read live from it and set exactly as it sets it.

## The cost bar

At most one stacked bar above a receipt's lines, never instead of them: 8 px, full width, no legend, no percentages. Owner decision 2026-10-29 (T845, "the colours must be distinct"): where the receipt is grouped (the trip page's four cost groups), the bar has one segment per group in its own colour, `--cost-travel`, `--cost-around`, `--cost-stay` and `--cost-food`, and each group's name carries a matching 8 px dot (the overview's tiles too), so the colour never stands alone. Those four colours are for the cost groups and nothing else. An ungrouped receipt keeps one segment per line.

## Fields with no data yet (owner decision 2026-10-23, T630 to T632)

The fields of the explore-completeness spec keep their slot on the Explore detail sheets even with no data, and show the shared placeholder `components/NotYet.jsx` ("Not available yet"). For those fields "a missing fact is left out" and "Say less" do not apply. The fact band itself (KeyFacts) still leaves a missing cell out; the slots live in the Facts rows and sections. A missing fact says "Not available yet" (`components/NotYet.jsx`, `data.notYet`); a missing price says "Not yet" (the kit `NotYet`, `price.notMeasured`). Both share one look (`.not-yet` and `.hs-notyet`)..

## Sources and credits on the page

A photo's credit sits under that photo (owner 2026-10-15). Item pages keep no "Where this comes from" fold: the data sources are one line of links at the foot of the page.
