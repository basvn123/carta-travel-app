# Explore rules (reference)

> Look rules for these screens are rewritten by the explore lane of the house style run (2026-11). Until then the look comes from `DESIGN.md` and the carta-design `SKILL.md`; the rules below are the product rules these screens keep (what they show, what each control does, how numbers behave). They bind.

Covers Explore (overview and focused view), the map and list, rails, filters, the category tabs (Destinations), search, the settings line and the Lifestyle control, and Trip styles as a row.

Numbers and money, cost on cards, best value, ratings, copy, photography licensing, controls and the quality floor: see shared-product-rules.md. Ask Carta's chat: see account.md, section "Ask Carta". The site footer: see home.md. The item pages behind the outdoor tabs: see outdoors.md. The place page: see place.md.

## Destinations line up with Explore (T457, owner 2026-10-16)

Both browse tabs share one side panel grammar and one full-width content column. Destinations' six sections are kit tiles with tab semantics. A section's head carries "Highlights | Full list" where Explore's carries List | Map: the full list is one choice from the top. The rails take Explore's tile widths and lines, and the countries track counts as one of the rails. (The permanent side panel was later removed, T601: see Explore v8.)

## Explore v6 (owner decisions 2026-10-22, T584 to T594)

The owner reviewed Explore against Komoot, Kayak, AllTrails, Airbnb, Hostelworld and Rightmove on a reference board and decided the following. Where an older rule disagrees, these win; v7 and v8 below amend them.

- **Explore opens as an overview** (T586): a headline with a verb, a What and Where bar (a select of Places, the five categories and Trip styles, a search field, a secondary Search), a quiet "Tell Carta what you want" door, the category pill row, then the story rails, ending with "Show all places" and the map toggle. No side pane and no list on the overview. Any See all, chip, search or Show all opens the focused view, one history step; its "Explore" link and the browser's Back return to the overview. The settings line's countries do not end the overview. A Where search shows as a chip.
- **The category choice is one row** (kit Tiles with tab semantics, with a tick) at the top of the content on Explore and every category tab, never in a side pane.
- **The focused view's toolbar** (T588): the title with the live count under it, then pill buttons: Share (copies the link, "Link copied"), Sort (a menu), Filters (opens and closes the desktop pane, the sheet on a phone, with its count), Saved, Countries on a phone, and the view toggle last. (The count line was dropped by T598, see v7.)
- **One view toggle** (T592): a secondary pill naming where it goes, "Map" or "List", never a List | Map Segmented. Desktop: in the toolbar, and on the outdoor tabs after Search in the What and Where bar. Phone: floating above the bottom nav, and in the map drawer's strip.
- **The map, the Kayak way** (T592): on a desktop a panel floats on the map's left (at most 400 px), listing the places on the map or holding the picked one: photo, name with the Score and band, region, a "Your trip" box (dates or month, nights, the way there, bed and food and drink for the nights, one total a person, the one primary "Open {place}"), then a short why-go. The camera keeps pins clear of the panel. Price pins read the figure first, then the name. This replaces "a map never draws a second card of its own".
- **Browse cards** (T590, T587): in a focused list from 769 px the places are photo cards in an auto-fill grid; on a phone a horizontal card (a photo, then name, dates, prices).
- **Prices with icons** (T590): `PriceParts` shows the way there (plane, train, bus or car), the bed and the food and drink as icons with whole-euro figures, next to one day total (the house price formation, DESIGN.md); the unit is said once, in the column head ("A day, a person"). Dates show only when the traveller set them.
- **Story rails** (T587, the owner's Komoot reference, "for every tab"): a lead card holding the rail's heading, one line, at most three icon facts from its rows (no catalogue counts) and See all; then photo cards. On those photos only, a status pill ("Good in Nov", a difficulty) and the Score pill; the title stays under the photo. A card's pill never repeats the rail's heading. The rails name the month the settings line shows. Class prefix `.storyr` (`.srail` is the sticky section rail).
- **The filter pane** (T589, the owner's Hostelworld reference): a head with the live count and Clear all; Kind of place as small chips with icons; Good for (A base for the week, A day trip, A stop on the way) high and never folded; Budget a day as a stepped two-thumb range (0 to 160 and Any, a floor and a ceiling, filters only); the month as twelve letter chips plus Any; Size in plain words (Big city, City, Town, Village, Countryside), no glyphs; Rating, Flight up to and Max travel time as short Segmented controls (up to five options), Any first; Good to know as icon, word and Switch rows. Country, Browse and the shortlist are not in the pane. The desktop pane is 320 px wide.
- **The outdoor tabs** (T593): a What and Where bar; a quick filter row ("All filters" and at most four dropdown chips); Trails and Cycling maps draw each route as its line (the hovered one marked) with a length pill at its start.
- **The start dialog** (T585): from 1024 px, once per device on the first Explore visit, never over a link that carries a view: "What matters most on this trip?", a labelled field that goes to Ask Carta, From, Where to, When and Who rows that open the settings line's parts, one primary "Show places".
- **The preview** (T591): the card's hover preview holds the hook line, one month verdict chip, one plan sentence ("2 days, about {price} a person") and "Open {place}". It opens on hover, and on a keyboard focus only where there is hover.

## Explore v7 (owner review 2026-10-22, T595 to T600)

- **The overview's top is one compact block** (T595): "Where to next?"; Ask Carta as a field-like door with an example question (the chat's one door: none in the header, none on Plan); one bar of What, Where (it works for every kind: Places searches places, a category opens its tab with the text, a country name on Trails or Cycling picks that country), Search and the Map toggle; then one row of the category pills and the quick chips (the rails' doors, Countries on a phone, All filters, Show all places). Nothing waits at the foot of the overview; rails draw no doors of their own.
- **The focused head is one row** (T598): a round arrow back and the title on the left, the pills on the right; under it the quick filter chips (Kind of place, Budget, Month, Good for, Rating, Flight time), each a popover on the pane's own state, then the active chips. No count line. The desktop map fills the screen under the chips. On a phone the arrow and the title share a row and the pills scroll under it.
- **Every outdoor tab has a map** (T600): Beaches, Lakes, Mountains and Cycling Europe-wide, Trails with each country's best walks until a country is picked. The head is the pill row, one What and Where row with the Map or List pill, the quick chips, then the content; the quick chips show on every width and the desktop pane keeps every group. Beach, lake and mountain pins carry the Score; routes carry their length.
- **Lead cards show what the rail holds** (T599): title, an optional short line, the rail's first three photographs (decorative), one large figure, at most two small icon facts, See all. A rail line shows only where it says something the heading does not.
- **Lifestyle holds Getting there** (T597): the five ways as tiles bound to the same setting as the settings line; with Plane chosen only flights are priced, and a place with no flight shows no total.
- **Fewer words** (T596): no place counts on screen (they stay for screen readers), no help line under Good for, no positioning sentence in the footer.

## Explore v8 (owner review 2026-10-22, T601 to T604)

- **The overview hero** (T601): one licensed Commons photograph across the content width (the first place of the month's or the top-rated rail), a panel over its lower edge holding "Where to next?", a small secondary Ask Carta pill (no example caption) and one joined search field (What | Where | Search, Search the overview's one primary), the Map pill after it; the photo credit under the photo.
- **Three levels under it:** the categories as kit Tabs (icon and word, the current one marked) on every browse tab, then quiet quick chips.
- **No permanent left panel on any browse tab** (T601, T602): filters live on top (quick chips, All filters or Filters, Sort); on a desktop the 320 px filter pane slides in only when Filters is pressed, closed by default, on a phone the sheet. Country is never a filter control: it comes from the settings line's Countries (one country in Only these) or from a country typed in Where, and shows as the band and a removable chip.
- **Chips and pane are one control** (T604): each quick chip's popover draws the pane's own section; a set chip shows its value with a tick. Action pills (icon first) and filter chips (chevron last) share one height.
- **No count on the map panel** (T603).

## One overview per place (T504, roadmap 1.5)

A place says the same thing in the list and on the map, because both draw `browse/PlaceOverview.jsx` and read `lib/placeOverview.js`: a photo, the name with the Score, the flag with the region and country ("Tuscany, Italy", else the country), one reason (a guided answer, else the month's own sentence, else "Good in October", else "Best in May to Sep"; never two), the day price in whole euros through `<Money est>` in the house price formation (the unit said once, "A day, a person", in the list's column head), and the save control outside the link. With a month the Score is the month's score once the wire carries it, else the base Score. A pin picks, it does not open: the picked pin is the one selected state on the map, the picked row is marked, and the overview opens the place. List | Map changes the view only; filters, sort and the pick stay (`xi=`). Desktop docks the picked overview at the foot of the map with a close; a phone's map lies under the MapDrawer, whose strip holds List | Map and the handle and whose body lists the places on the map as the same overview rows, the picked one first. (The "a map never draws a second card of its own" part is superseded 2026-10-22 by the floating place panel, T592: see Explore v6.)

## Density (owner decisions 2026-10-13, T421 and T438; 2026-10-15, T431)

A filtered or searched list on Explore and Destinations is compact rows (a small photo, name, the Score, the price line, a save control), about ten to a phone screen. Sections (rails) and the home page use large photo tiles, where inspiration leads. A trip style's list is tiles too (owner 2026-10-15, T431): a week is chosen on its photographs and the places it visits, so each trip is a tile with a photo, the full title, the places visited, the best months and the price.

A gallery may run on a list tile (owner 2026-10-15): up to four photos that swipe inside the tile's media, the first loaded at once and the rest on first touch, arrows only on hover, the tile still one link. Not on the compact rows of a filtered list.

## Budget search (T506, roadmap 1.19)

One band at the top of Explore (not on Home; the owner places Home): "How much do you have?" first, the only required field, whole euros; under it one sentence states every other input ("2 people, 5 days in October, from Brussels by train or bus") with one quiet Change that opens Who, How long, When, From where and how, and Buffer in place. The search button is a secondary (the one primary belongs in the lower half). Every figure comes from `priceTrip()` through `lib/budgetSearch.js`; no second formula. The answer is "Places that fit {price}", then two groups only, Fits (the total with the buffer is within the budget) and Tight (it fits only by spending the buffer), as compact rows: the total for the group as the headline price, the day price a person under it (bed plus food, no buffer, the card's own basis), then what is left; too dear is one sentence ("3 places are a little over. With {price} more, they fit."), never a list, and no counts beside the headings. Its receipt is the receipt (see place.md) in whole euros (owner 1.8): Bed, Food and drink, "Buffer, 10%" as its own line (on by default, T475-d), the total, then a "Not in the total yet" head with getting there (named by the chosen way), local transport and tickets, each reading "Not priced yet" with no amount, tilde or dash, never summed. Inline under its row on a phone, a sticky column beside the list from 1024 px.

## Price pins

From zoom 4, at most 30 DOM labels, the best rated in view: name and figure; the cheapest in view takes the best-value marker; every other place is a dot sized by place kind, drawn from the first frame. No number clusters (T438). Every pin has a 44 px hit box.

## Map and list in sync

A card under the pointer or in focus rings its pin, and a pin under the pointer outlines its card. The committed selection (the chosen day, the chosen place) is the one marked item on that map. While a map loads its box shows the geometry on hand as a still drawing, then crossfades. Multi-day and planning maps: see trip.md.

## Settings line (T577 to T582, owner 2026-10-22)

A full-width band on every priced view, under the header and on the same gutter as the content, shows every input its prices depend on, like a booking bar: From, When, People, Lifestyle, Countries and Getting there as equal segments, label over value. Each part is a `--tap` button that opens its control; Getting there is one button that steps through Any way (a pin), Plane, Train, Bus and Car, each with its icon, and every price under it follows. From names a town, never an airport or an airport code: one search field without a placeholder, "Use my location", the countries that open their towns, and a search of all of Europe on press; the flight leaves from the priced airport nearest the town. When is Dates, Month or Any time over a Nights stepper, with no note about who picked the dates. People is three rows, Adults, Children (2 to 11) and Babies (under 2), each with its stepper and nothing else. Countries is Only these or All but these over a searchable list of tick rows; its chips read "Not France" in the second mode. On a phone the line is one sentence (the dates or month and a head count, never the nights), the bed and the way icon, and Countries is a door beside Filters. Language and currency are not here (they live in Account).

## Lifestyle control

There is one: the Lifestyle panel. A surface that changes how the traveller travels opens or embeds it and never builds a second slider. Shown as a slider it is stepped, one labelled stop per level, and the figures update in place. The panel carries no sentences of its own (owner 2026-10-22, T580): a one-line title, the tiles, the fold and Done, and it fits a desktop screen without scrolling.

## Filters

Removable filter chips in one row above a filtered list, each named "Remove <filter>", ending in "Clear all", the same on every browse tab. At most one sticky refine row per list (`--tap` high) holding Filters, sort, country and the active chips. Up to six categories on a phone are a 2 x 3 grid of equal buttons. The budget is a stepped two-thumb range (owner 2026-10-22, T589: a floor and a ceiling on 0, 20, 40, 60, 80, 100, 130, 160 and Any, a day, a person, ground only), never a free slider; it filters and does not re-price. A month select holds the twelve months plus "Any"; with a month, a card may carry one measured month fact ("Swim season includes July"), never a forecast.

## Rails and cuts

A rail has a heading (a figure, a verb, or a plain section name such as "Hidden gems"), "See all" without a number, arrows on a fine pointer, arrow keys when focused, dots hidden from screen readers, scroll-snap, one aspect, no autoplay or loop; no subtitle and no position figure (T438). Desktop shows at most four rails and a phone three (a countries track counts as one); further cuts are one row of door buttons (secondary, small) right over the list they narrow (T457, Explore's doors). The first browse rail may be a cost cut ("Under {price} a day in <month>") sorted by day cost with countries interleaved.

## Comparison table

The comparison table puts items as columns, one row per attribute, sticky headers, two columns visible on a phone.
