# T434 critique, Assessment A after the rebuild (design review)

Date: 2026-10-16. Reviewer: Assessment A, isolated. I did not run the detector or read its output, and I did not read the T434 report, so this judges the code and the screenshots alone.

Read first: PRODUCT.md, DESIGN.md (tokens), `.claude/skills/carta-design/SKILL.md`, `before.md`.

Evidence: `continent-app/src/auth/SavedTripsPanel.jsx`, `src/auth/mytrips/{MyTripsTabs,TripCards,parts}.jsx`, `src/auth/TripSharePanel.jsx`, `src/community/GuidesPanel.jsx`, `src/styles/70-mytrips.css`, `src/lib/myTrips.js`, `src/lib/visitedCountries.js`, the English strings in `src/i18n/en.js`, the screenshots in `Execution/P11/T434-shots/after/` (p360, phone, ipad, desk, plus German) and the harness shots `continent-app/scripts/shots/saved-mock-*.png` and `saved-mobile-*.png` and `saved-visited-full.png`.

How current the shots are: `70-mytrips.css` was saved at 20:17, after the last screenshot (20:14). That edit made the desktop side tiles one column. So the side panel in the shots is the older three-across layout, and the new one has not been seen in a screenshot. The p360 empty and p360 shortlist captures timed out (`measure-after.json`), so those two states have no evidence at 360 px. The `saved-menu.png` and `saved-confirm.png` harness shots predate the rebuild, so I set them aside.

## Score

| # | Heuristic | Before | After | Key issue now |
|---|---|---|---|---|
| 1 | Visibility of system status | 2 | 3 | Counts now agree with their sections and the countdown chip works well. The Visited map is an empty sunken box until it loads, and in every after shot it never does. "Days planned" counts this device only |
| 2 | Match with the real world | 2 | 3 | Trips, Shortlist and Visited read in plain words ("In 21 days", "Nights away"). In German the country names stay English, a sun icon stands for a climate average, and "Friends showed you 3 trips." sounds off |
| 3 | User control and freedom | 3 | 3 | Undo instead of confirm, Escape stacks, menus return focus. Each tap of "Copy invite link" makes a new link, up to a cap of five |
| 4 | Consistency and standards | 1 | 3 | Built on the kit: Tiles as tabs, Card rows, Chip, Segmented, Money, and Explore's own DayPrice and SaveButton. Exceptions: brown pins and brown country fills on the record map, English country names, and leftover px and z-index literals |
| 5 | Error prevention | 3 | 2 | The party is priced at 2 by default while the card says "Only you". An invite link quietly makes the joiner a friend. The year filter still counts places from other years' memories |
| 6 | Recognition rather than recall | 2 | 3 | The focal card shows the trip's cost for the party, the weather, the days planned and who is going. Later rows show only when and the price. Shortlist rows lack the Score that Explore rows carry |
| 7 | Flexibility and efficiency | 2 | 3 | Type, order and year filters, Plan a trip from the shortlist, Keep planning days. "Plan a trip in Portugal" picks one country for the traveller. Arrow keys in the side tablist are broken by the one-column CSS |
| 8 | Aesthetic and minimalist design | 2 | 3 | Much calmer, with one stylesheet on roles. Leftovers: an empty 300 to 360 px map slab, a fourth fact column left empty, count chips on single-row sections, and a moderation notice glued under the hero |
| 9 | Error recovery | 3 | 3 | ErrorBlock with retry. Co-plan and visibility errors are specific and use the hint codes from migration 051 |
| 10 | Help and documentation | 2 | 2 | Nothing says what an invite link lets its holder do. The reason a country is locked lives only in a `title` tooltip |
| | **Total** | **22/40** | **28/40** | **Good (low end)** |

## Design-specificity verdict

**It reads as Carta, not a template.** The page now has the house grammar: kit tiles as tabs, a refine row on the phone and the side panel on desktop, white bordered rows on the warm grey, and one brown primary. Carta's own mark sits where it should, an honest figure under the photo: "~€1,343 est. for 2" on the trip, and "~€100 est. a day" beside "€69 a day" on the shortlist, from the same `DayPrice` Explore uses. The focal trip card is the familiar Airbnb Trips and Wanderlog structure, which the owner asked for, and its four label-over-value facts make it more useful than theirs.

Visited is the least specific part. As shot it is a blank slab, then a four-figure band, then country pills, which is Polarsteps' layout without its warmth. When the map does render (`saved-mobile-visited.png`), every pin and every visited country is brown, which is decoration under carta-design's one-action-colour rule.

## What works (strengths)

1. **The money is right, and it is the planner's money.** `tripFigure()` (`lib/myTrips.js:136-149`) runs the trip through `priceTrip`, the function the Trip planner uses. `TripPrice` (`mytrips/parts.jsx:142-155`) prints it through `<Money est>` with the party after it and settles it through `useSettledFigure`. The shortlist borrows Explore's `DayPrice` and `SaveButton` (`MyTripsTabs.jsx:148-149`), so a saved place shows the figure its Explore card shows. The "national" word and the bare `€69 a day` are gone. This closes the before critique's P0.
2. **One grammar with Explore and Destinations.**
   - `TileGroup kind="tabs"` with `aria-controls`, and a real `role="tabpanel"` (`SavedTripsPanel.jsx:783-799, 843`). At each breakpoint only one of the two tablists is displayed: the side panel is `display:none` on a phone, and `.mt-tiles.is-top` is hidden from 769 px.
   - Filters sit in the side panel on desktop and in one refine row on the phone.
   - One 457-line stylesheet on roles replaces seven. Nothing in the measured shots falls under the type floor (`smallCount` 0 for text).
3. **The next trip answers the returning traveller's questions in one card.**
   - It has the countdown chip, the dates with "to", and four facts (cost for the party, weather, days planned, who is going) laid out as hairline label-over-value cells, not a card inside a card.
   - It has one primary, "Open trip".
   - Undo instead of confirm goes through a toast portalled into the shell's one bottom slot (`parts.jsx:108-124`).
   - The audit's two performance findings are fixed: `mapProps` is memoised (`SavedTripsPanel.jsx:662-676`), and browser storage is read once per plan list (`:451-460`).

## Priority issues

### [P1] The focal card contradicts itself about the party and the days

**What:**
- The price reads "~€1,343 est. for 2" and the cell beside it reads "Going: Only you" (`trips-phone-full.png`, `trips-desk-full.png`, and the German shot as "für 2" beside "Nur du").
- The party comes from `plannerStateFromPlan`, which defaults to `groupSize: c.groupSize || 2` (`lib/myTrips.js:116`). "Going" comes from the crew list in this device's trip extras (`SavedTripsPanel.jsx:456`, `TripCards.jsx:112-116`).
- Fri 6 Nov to Thu 12 Nov is seven days, yet the card says "Days planned 0 of 6", because `days: Math.max(nights, planned)` counts nights (`SavedTripsPanel.jsx:498`).

**Why it matters:** two facts on one card disagree about the same trip. On a product whose only asset is trust in its figures, a traveller who sees that cannot tell which number to believe.

**Fix:**
- Derive "Going" from the same party the price uses (`figure.party`). Show the named crew as faces and the rest as a count, for example "You and 1 more".
- If the party was never set, say so on the price ("for 2, change") rather than assuming two in silence.
- Count days the way the Day planner does (nights + 1, or the planner's own day count), or label the fact "Nights planned".

**Command:** `clarify`, `harden`.

### [P1] Invite by link mints a link on every tap and quietly makes the joiner a friend

**What:**
- `inviteByLink` calls `createCoplanLink` on every press (`TripSharePanel.jsx:107-122`). A traveller who copies the link twice, or shares it to two chats, burns links until the error "Five invite links are already live. Stop them first." (`en.js:6913`).
- The component's own comment says joining by link "also makes them friends" (`TripSharePanel.jsx:72-73`). No string says so: not `coplan.sub` (`en.js:2205`), not `coplan.linkCopied`, not `coplan.linkJoined`.
- Nothing says that whoever holds a forwarded link can edit the route.

**Why it matters:** this is the owner's new feature, and its two consequences, a new friendship and edit rights for anyone holding the link, are invisible. That breaks consent and error prevention, and it will produce "who is this person on my trip?" support cases.

**Fix:**
- Keep one live link per trip. "Copy invite link" copies the existing one, and a quiet "Stop the invite link" withdraws it. That also retires the cap message.
- Add one sentence under "Plan together": "Anyone with the link can sign in and join. Joining makes you friends."

**Command:** `harden`, `clarify`.

### [P1] Visited leads with a map that shows nothing, and colours the record brown when it does

**What:**
- In every after shot (phone, desk, German) the record map is a blank 300 to 360 px box: `visited-phone-full.png`, `visited-desk-full.png`, `visited-desk-de-full.png`.
- The Suspense fallback is an empty `.mt-map-wait` (`MyTripsTabs.jsx:264`, css `:251`). carta-design asks for "the geometry on hand as a still ink drawing" while a map loads, and that geometry is on hand here (`visitedIso`, the item coordinates).
- On a coarse pointer, `.mt-map-shield` (css `:254-265`) covers the map while the + and - zoom controls stay drawn (`zoomControls: true`, `SavedTripsPanel.jsx:668`). They look tappable and are not.
- When the map does render (`saved-mobile-visited.png`), every pin is brown and every visited country is filled with the umber tint and a brown edge. Brown should mark only what acts, is live or is selected, and a data drawing stays on the ink ramp.

**Why it matters:** the owner asked for "a clear Visited view (map, figures, countries...)". The view's lead object is either empty or decorative.

**Fix:**
- Render the visited countries as an inline SVG silhouette in `--kind-*` ink, used both as the loading state and as the state when WebGL is absent, then crossfade in `--dur-3`.
- Turn off `zoomControls` for the inline map on a coarse pointer, leaving only the expand control.
- Draw record pins in ink and country fills in the ink ramp. Make brown only the places of the trip that is open (`openMemory`).

**Command:** `harden`, `polish` (colour pass with `colorize` restraint).

### [P2] Casey cannot reach the next trip's actions on one phone screen

**What:**
- At 360 px the four facts collapse to one column (`70-mytrips.css:450-453`), so "Open trip" falls below the fold (`trips-p360-full.png`). At 390 px "Plan days" and "Invite" sit under the bottom nav (`trips-phone-full.png`).
- "Invite" opens a three-block panel (Plan together, View-only link, Who sees it) below the card and below any moderation notice. Nothing scrolls it into view, and the button has `aria-expanded` but no `aria-controls` (`TripCards.jsx:125-129`, `SavedTripsPanel.jsx:430-443`).

**Fix:**
- Keep the facts 2 x 2 at 360 px. The labels are one or two words, and the value can wrap under the label.
- Put the action row directly under the dates, or give the phone a 3:1 photo, so the primary sits in the first screen.
- When the share panel opens, scroll it to its heading and move focus there, and wire up `aria-controls`.

**Command:** `adapt`, `layout`.

### [P2] German and keyboard regressions on the new parts

**What:**
- **English names in the German UI.** Country chips, the Visited flags, the countries sheet and trip titles print English names in the German UI ("Austria, Belgium, Germany", "Portugal" as a title, "Slovenia"): `MyTripsTabs.jsx:236, 313`, `SavedTripsPanel.jsx:378`. The sheet also sorts by the English name.
- **German price overflow.** "~1.343 € gesch. für 2" overruns its fact cell into the divider at 1440 px, because `.mt-price { white-space: nowrap }` (css `:196`) sits in a four-column grid (`trips-desk-de-full.png`).
- **Side tablist keys.** The side tablist is built with `columns={3}` (`SavedTripsPanel.jsx:784`), but the 20:17 CSS makes it one column (`70-mytrips.css:411`). `TileGroup` steps ArrowDown and ArrowUp by `columns` (`Tile.jsx:72`), and (i + 3) mod 3 lands on the same tile, so Up and Down do nothing in a list that now runs vertically.

**Fix:**
- Display names through `Intl.DisplayNames([lang], { type: 'region' })` keyed on `COUNTRY_ISO2`, and keep the English name only as the storage key.
- Let `.mt-price-unit` wrap under the figure.
- Pass `columns={1}` for the side variant, or derive it from the layout.

**Command:** `adapt`, `harden`.

## Persona red flags

**Casey, phone, one hand.**
- On a 360 px phone, "Open trip" sits below the fold. "Plan days" and "Invite" are hidden by the bottom nav even at 390 px.
- The inline map's zoom buttons look tappable but the shield takes the tap.
- The invite panel opens off screen.
- In the share panel, two Segmented controls (scope and duration) sit side by side at 360 px; this needs a shot.
- The year chips are a good size, and the refine row scrolls sideways without a scrollbar.

**Jordan, first time.**
- The empty Trips tab is right: "No trips yet", "Plan a trip", "Sign in", with no apology.
- After saving Bruges, Porto and Lisbon, the loudest object on Shortlist is a brown "Plan a trip in Portugal" above the list (`MyTripsTabs.jsx:125-131`). Bruges is dropped without a word, and the page has made the choice for them.
- A trip they planned alone says "for 2".
- "Friends showed you 3 trips." (`en.js:1239`) and "See the map bigger" (`en.js:2350`) read as translated, not written.

**Sam, keyboard and screen reader.**
- Up and Down do nothing in the desktop side tablist (see above).
- In the countries sheet, countries that come from a trip are disabled chips (`MyTripsTabs.jsx:227-237`). Disabled chips cannot be focused, and the reason ("On your record from a trip") is only a `title`, so Sam never learns why Austria cannot be unticked.
- Rows open pages through a `<button>` (the kit's `Card` with `onOpen`), not an `<a href>` as the navigation rule asks.
- The tabpanel takes `aria-label` and not `aria-labelledby` the active tab. This is acceptable.
- Faces are `aria-hidden` and the count text carries the meaning. This is good.

**A returning hiker with two trips.**
- The first trip is excellent: countdown, cost for the party, weather, days planned.
- The second trip is a row with only "In 75 days, Wed 30 Dec to Sun 3 Jan". It has no price and no "Not priced yet" (the focal card says it, the row says nothing), and no days planned or companions.
- If the first trip carries a moderation notice, the notice is glued flush under the hero as a second full-width bordered box (`trips-desk-full.png`). It reads as part of the card and pushes "Later" below the fold.

## Minor observations

- `70-mytrips.css:399` `.mt-loading { z-index: 55 }`: a literal layer outside `--z-*`.
- `70-mytrips.css:120` `.mt-hero-title` is weight 700 on the 20 px title step, which the token sets at 600.
- Leftover px literals: 72 and 64 px tile heights, 6 px gaps, 28 and 32 px faces, a 220 px menu, 200, 300, 360 and 520 px map and sheet heights, and 34vh.
- `70-mytrips.css:167` the days bar animates at `--dur-3`. A figure settling is `--dur-2`.
- `TripCards.jsx:65` a climate normal draws `SunIcon` ("Usually 17°" with a sun), which claims a sky the data does not know. Use a thermometer, or no icon.
- `70-mytrips.css:432` with three facts (no weather) the four-column grid leaves the fourth column empty and the hairlines stop short. On the phone, "Going" sits alone in its row with a half-width rule. Let the grid follow the count (`repeat(auto-fit, ...)`).
- Count chips on "Later 1" and "Day plans 1" repeat what the tab count and the single row already say.
- `SavedTripsPanel.jsx:624-627` with a year chosen, `visitedRecord` still receives every memory, so places named in a 2026 memory count toward 2025's countries and cities.
- `mytrips/parts.jsx:226` the CrewBar name field hides its label and uses the same text as its placeholder.
- `community/GuidesPanel.jsx:62` passes `guide.countries[0]`, a country name, as `iso2` to `HeroImage`, so the no-photo placeholder loses its flag. The guide's back control (`:133`, `:151`) is a Button where navigation should be a link.
- Shortlist rows omit the Score that Explore's compact rows carry (photo, name, Score, price, save).
- "for 2" alone is ambiguous (two days? two people?). "for 2 people" costs one word.
- The iPad shot breaks "Shortlis/t" mid-word in the three-across side tiles. The 20:17 CSS should fix it, but no screenshot shows that yet.
- The record map keeps `scrollZoom: true` on desktop, so a wheel over it while scrolling the page zooms the map. carta-design allows this, but it is worth watching on a long Visited page.
