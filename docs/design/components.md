# Components and patterns

The detail behind `DESIGN.md`: how each part looks and behaves today. Read the section for the part you build; `DESIGN.md` "Fixed rules and free choices" says what may change (all of this, within the fixed rules). Change a part in `continent-app/src/components/ui/` and its demo at `/?styleguide`, then update its section here.

## Signature components

All in `src/components/ui/` (exported from `index.js`), styled in `src/styles/05-house.css` with the `hs-` prefix.

**Blaze** (`<Blaze size="sm|md|lg|xl" state="painted|rest|blank" kind=…/>`): 16 x 10, 24 x 14, 40 x 22, 72 x 40. Only for chosen or here: the current nav place, the chosen map pin, a sheet grip, the relief cut, the chosen row of a single-pick `ChoiceRows` and the chosen plan in the pass sheet (both painted in on the pick). As the waiting path: three painting blazes while loading, a dashed one in an empty state, a resting one on the missing-photo tile. Never on headings, bullets, plates, ordinary pins or panels.

**Plate** (`<Plate variant="place|leg|total|mark" …/>`):
- **Place:** ink plate, pointed end, the name in the plate face, a beige second line, the figure right in Overpass 800.
- **Leg:** paper in a 1.5 px edge. With `checked` it is a radio (umber edge, umber 50 fill); the caller wraps the group in `role="radiogroup"` and handles arrow keys, as `ChipGroup` does.
- **Total:** a label over a 40 to 54 px figure, the engine's own total. One per screen.
- **Mark:** the small umber plate for "you chose this" (a chosen row's price, the chosen pin).
- Price bands ("€100 to €149", count on the tip) are place plates, shown only when sorting by cheapest day. A plate is never an ordinary card.

**Score plate** (`<ScorePlate value={9.7} label="Score" />` or `rating={place.rating}`): ink, a white figure out of 10, right after the name. No stars, no coloured scores. An estimate is spoken "about 8.1", no score shows "Not yet", the accessible name carries the band word ("Score 9.7, Exceptional"). Explore's `PlaceScore` is this.

**PlateGroup** (`<PlateGroup label=…>`): one radio group of leg plates: one tab stop, arrows, Home and End, the touch tick on a pick.

**Formation** (`<Formation go={{mode, amount}} bed food day weighted? size="lg"? />`): the price row of every row and card.
- Getting there is an outlined umber pill with its mode icon: a return fare outside the day. Outlined means "outside the day figure" and nothing else.
- The bed is a solid umber wagon, food and drink a beige wagon, coupled with 2 px gaps, then the day figure, always the loudest.
- A part without a figure is a dashed "Not yet" wagon outside the sum; a place without a split shows the day figure alone.
- Wagons are content-sized in rows; `weighted` sizes them by euros on cards and the cost post. Heights 24 (rows, cards) and 36 (`size="lg"`).
- It formats, never sums. Props: `est` (true or per part, spoken as an estimate, draws nothing), `dayWrap`, `figure={false}` (no day slot), `around` (a getting around wagon, umber 200), `extras` (more wagons, flights on sunken paper) for a trip total.

**Rail and RailCard:** the section labelled by its heading; arrows "Scroll back" and "Scroll forward", disabled at the ends; ArrowLeft and ArrowRight move focus card to card; "See all" a real button (a link only with an href).
- **Head:** a 28 px line, the title left, "See all" in umber 700 with a 24 px beige arrow disc (painted on hover, the arrow nudges 2 px; 44 px target; named "See all: {rail}"), two round outlined arrows right from 1024 px (touch scrolls).
- **Card:** a 4:3 photo at 16 px corners, the name with its Score plate, flag and country (the Hidden gem diamond in umber 700), the weighted formation, a paper save disc on the photo. 76 % wide to 599 px, about two across from 600, four and a quarter from 1024 (`max(256px, ...)`).
- **Explore's card** (`ExploreRails.jsx`, `styles/85-explore-rails.css`): a column with the name and Score plate (wraps, never cut), flag and country under it, room for the strip's longest name (`--xrc-name-lines`, `.xrc-top`), then at the foot the figure (`--text-title`, 800) with its basis under it (caption, dotted `--umber-300` underline). A travel style's match mark sits at the foot's end in the same grid cell (`.xrc-body`), adding no height. Cards stretch, so a strip's figures share one line. No sign after the figure. The photo is the link. Each strip ends on a photo-sized See all tile: beige, three round photo faces of the next places, "See all", the rail's name and the umber 44 px arrow disc.
- **Rhythm:** title to strip 12 px (16 from 1024), rail to rail 40 px (56 from 1024).
- Only the photo, name and country sit in the link; the formation and the `body`, `foot` and `mark` slots render after it, so no button nests in a link. No `href` or `onOpen`: a static card.

**List row** (`browse/explore/PlaceRow.jsx`): one grid per container width.
- **Under 600 px:** three lines (name with Score and water mark; flag, region and country; the figure with its basis), a 44 px photo, about 7 rows above the bar at 390 x 844.
- **From 600:** one line with a 56 px photo, the figure in its own column, the reason under it; from 1024 the reason gets its own column.
- Nothing is cut in any language: name, region and country wrap, and on a phone the figure never shares their line.
- The water mark is the house `water` icon in `--umber-700` (16 px), its class in the accessible name; no teal pill.
- The figure sits over its basis, no wagons: one button (44 px) that opens the receipt sheet; the basis has a dotted `--umber-300` underline. The unit sits on the figure ("€149 /day", "/day for 2"; never "total").
- Selected: the umber 50 wash and the umber price mark, never a side stripe. The link and buttons are siblings in the `.xrow` grid. Save is the bookmark at the row's end.

**Dock** (`components/dock/Dock.jsx`, `dockStore.js`, `styles/89-dock.css`): a trigger that grows in place into a card; today only the corner style disc uses it, and a tap opens the Style Studio.
- **Corners:** the heart and, on a phone, Map (`MapCorner.jsx`) sit in two fixed 48 px slots 12 px above the bottom nav. Desktop: the heart alone, 24 px from the corner. From 769 to 1023 px the Explore list ends on an 80 px foot bar that holds the disc; from 1024 it floats and may cover a photo's corner, never a name, figure or control. Scrollers end with `--corner-room` (checked by `scripts/verify_band.mjs`).
- One store, so at most one card is open. Below 769 px the card is a modal (full width, `aria-modal`, inert app, scrim, focus kept, returned to the trigger); from 769 a non-modal popover (Escape, a press outside or focus leaving closes it). Escape in a drilled row steps back first.
- Rows full width, 52 px, hairlines between (`DockRowButton`, `DockRowField`).
- Motion, CSS only: the card scales from 0.92 at its corner on `--dur-2`, rows 24 ms apart, the chevron turns, the `tune` plane glides on `--dur-3`, knobs swap on `--dur-tick` / `--ease-tick`. Depth `--elev-1` and `--elev-2`.

**Receipt sheet** (`components/price/PriceSheet.jsx`, `styles/86-price-items.css`, prefix `rcp-`): opened from a figure. One sheet, no tabs:
- The place name (800) with flag and country; the total at display size with its basis; at most one insight line with an umber arrow; the settings chips (the style chip in the selected wash, 13 px chevrons).
- Three rows, Bed, Food and drink and the way there, each a 36 px icon tile (radius 8, 1.5 px edge, umber 800 ink): bed 16 % umber 600 with an umber 600 edge, food umber 100 with an umber 500 edge, way umber 50 with an umber 600 edge. A row opens in place to its lever (options with wash and tick).
- The total line, then one sticky primary, Plan this trip. Phone: the modal bottom sheet. From 769: a non-modal popover off the tapped figure.
- **Flights screen** (`components/price/FlightTab.jsx`, `styles/87-flights-screen.css`, prefix `fls-`), behind a back button, "Flights to {place}": the return a person at headline size; the two legs as plates in a radio group; day bars in `--sun-400` with a `--sun-800` cap (cheapest saffron, the shown day umber 600, a break mark over long gaps); the hours segment; the day's rows (an airline badge with the IATA code in the airline's colour under its logo, times, name, length, stops, fare, a saffron "Cheapest" tag), skeletons while loading; one primary, Book on Google Flights, with a 48 px info button; Change airport or dates as the quiet button (primary only when no airport has data).

**Style Studio** (`browse/styles/`, `styles/79-style-studio.css`): the one sheet for travel styles, full height on a phone, a 560 px dialog from 769.
- **Overview:** an explainer card on `--home-ground-deep` in `--home-ink-on-deep`, then style cards in a radiogroup (the one in use: a 2 px umber edge and "In use" with a tick disc; meta as icon and word items, no separators), a More menu per card, a dashed New tile.
- **Wizard:** one question a step. A ten-step bar in two labelled groups (done and current `--action`, the current ringed, to come `--umber-100`); titles as questions at `--text-plate` / 800, no sub-text; choice tiles with the selected look (umber edge, `--umber-50`, a tick disc top right); a sticky foot with Back and one primary.
- Steps slide in on `SPRING.surface` from the side they came from; a new card rises and its figure counts up once.

**Band and Settings** (`browse/band/`, `styles/80-band.css`; `browse/settings/`, `styles/81-settings.css`): the top of Explore.
- **Grid:** row 1, 48 px (phone 44): the field, Ask Viantra and on desktop Places Settings. Row 2: the settings line on the field's text edge, 32 px items 16 px apart. Row 3: the tabs, 48 px, the underline as wide as the word. Rows 16 px apart, ink to ink. On desktop the band is one height on every tab.
- **Search field:** radius 8 (never a pill), a 1.5 px umber 300 edge, text 16 px 600 inset 16; on desktop Filters inside after a hairline (icon, word, count disc); the umber search button closes the right end; a back arrow inside the left end in a searched list; no left magnifier.
- **Ask Viantra:** outlined in umber, lit while its panel is open.
- **Rail arrows:** 44 px rounds at the photos' middle over the first and last visible photo's outer edges, mouse and keyboard only, dimmed at the ends.
- **Settings line:** icon and word items, no separators: the heart (the style door, always `HeartIcon`, a saffron dot while a trip holds the style), a flag, a calendar, the way glyph, the euro. Desktop: one line under the field. Phone: a sideways chip row under the tabs (scroll snap, edge fade, full words, 44 px), pinned while the field and tabs fold away on scroll.
- **Settings sheet:** the Style Studio's shell, "Your settings", five rows (icon disc, label, value, chevron), one question a step with Back. The When step's range grid has one tab stop and a round umber range; month cards say the full month and "from" a figure only where one exists. Phone: a modal sheet at 88 %; tablet: a 560 px dialog; desktop: a panel docked right that pads the band and list (`html.has-settings-dock`, `--settings-dock-w`). Brown and saffron only.

**Receipt** (`CostRow`, `CostSum`, `.costrows.has-leaders`): a dotted leader to each figure on wide receipts; the engine's own total; a "Rounding" line where lines do not add up; "Not yet" parts outside the sum.

**Journey line** (`planner/trip/JourneyLine.jsx`): stops as umber pills as long as their nights, legs as a 2 px ink line (dashed for flights) with a mode icon, home ends as ink discs.

**My trips ink parts** (`auth/mytrips/atlas/Ink.jsx`, `styles/73-mytrips-ink.css`; the atlas in `72-atlas.css`, classes `atlas-*`; decision 0016): line and ink, no beige wash, no sunken fill.
- **`SectHead`:** a title at 19/800 ink, its count as a plain `--text-3` figure, one action at the end.
- **`Frame2`:** the two-way choice (Per day | Whole trip, By year | By grade, Per day | Per trip; Today | Trip kitty as tabs on Spending): a 1.5 px `--umber-800` frame at `--radius-sm`, the chosen cell `--action` with paper text at 800, the other transparent in `--text-2`, a 1 px `--umber-300` rule between, 44 px tall.
- **`MoveInk`:** a price move on its own line, a 14 px arrow and 12/700 words, lower in `--umber-700`, higher in `--text-2`; no pill, no tint.
- **`NoPrice`:** "No price yet" at 13/600 `--text-2` after an 11 px dashed `--edge` square; never wraps, outside every sum.
- **Chips** (inside `.mt-panel` only): unchosen a 1.5 px `--edge`; chosen a 2.5 px `--umber-800` edge, umber 800 words at 800 and the tick, no fill; a count as a plain `--text-3` figure ("All" has none); the row wraps.
- **Photo card** (Saved and Past trips): two across on a phone (gap 22 by 14), three from 820 and beside the map from 1100. A 4:3 photo at `--radius-card`, the menu a 32 px paper disc (44 px target) top right, in Choose the select disc top left (`aria-pressed`; chosen: a 3 px `--action` ring). The name at 16/800, two lines at most, with its flag; one line with the Score plate and today's figure at 18/800 and its unit at 12 (or `NoPrice`); a non-place kind says its word above it; `MoveInk` and the note (a pencil, `--text-2`, no box) under it.
- **Following tile:** a 1.5 px `--border` edge at `--radius-panel`, the chart an ink 1.5 px line with 4 px square weekly points and the latest a 6 px `--umber-800` square, no fill; the price at `--text-figure-lg`.
- **Lists:** each cover a 2 x 2 mosaic in a 1.5 px `--umber-800` frame with 1 px paper rules; the chosen list a 3 px `--action` ring and a tick; New list dashed.
- **Country head:** a picked country heads the list with its silhouette, name, count and Show all; places are not regrouped.
- **Past trips:** the same card, three across in the left 7/12 from 1024; the name, flags and "7 nights, Aug" (the year when ranked by grade). The grade: ten 9 x 14 px cells in a 1.5 px `--umber-800` frame, filled to n in `--action` (the best trip `--umber-800`), "9/10" printed; no grade: dashed cells and "Give a grade", which opens the ten taps under the card. Year heads: the year and its nights on a 1.5 px `--umber-800` rule.
- **Charts:** nights per year as solid bars in the year ramp on one `--edge` baseline, the figure above, the year under, a picked year ringed in `--umber-800`, others never dimmed; months as twelve slim bars, an empty month a 2 px tick, the busiest `--umber-800`, the rest `--action`; no helper line.
- **Extremes:** four ruled rows N, E, S, W, each a 22 px framed letter tile, the name at 16/800 and the degrees at 12 in `--text-3`; one column on a phone, two by two from 768. No compass rose.
- **Cost:** a solid `--action` bar on a 1 px `--border` baseline, the average a 2 px ink notch (its key "average" carries the notch), the figure right; a tight 36 px ledger. Milestones keep their stamps; locked is a dashed `--edge` ring.
- **Spending:** Today | Trip kitty in the frame; food against the plan as ten connected tiles in one `--umber-800` frame, each a tenth of the plan, filled in `--action` with a part fill on the last, "€38 of €50" above; keypad keys a 1.5 px `--border` edge; no row wash (the name underlines); a new row an 8 px `--action` square fading over `--dur-note`; a disabled Go a dashed frame; pills, chips and the currency button outlined.

**Friends parts** (`together/home/VriendenHome.jsx`, `together/home/timeline.js`, `together/circle/`, `styles/91-vrienden.css`; decision 0017): the My trips ink parts on stone; no white card stacks, no beige. Every control 44 px.
- **Timeline:** one spine, a 1.5 px `--umber-300` rule in a 44 px gutter. A date plate: the day in the plate face at 26/800 over the month at 12/700 `--text-2`; an undated moment an 11 px dot ringed 2 px `--umber-600` (filled for Now); band heads at 12/800 uppercase `--text-2`. From 1100 px a three-across grid with the plate above each card and a sticky month ruler (month at 14/700, a 5 px `--umber-600` dot per moment).
- **Moment card:** a 3:2 photo at `--radius-card`, no border or shadow (no place: `--surface-sunken` with a 40 px face); faces under it at 24 px overlapping 6 px, 3 then +n; the title 16/700, wrapping; one fact at 14 `--text-2` (`--umber-700` at 700 when it includes you); at most one primary plus Later. Row scale: a 96 x 64 photo at `--radius-control` on the left. The soonest overlap spans two columns at 2:1 from 1100.
- **Face strip:** 44 px faces with a 12/700 name; You ringed `--umber-800`, Asked an outlined disc, a circle a `--umber-800` rounded square.
- **Status line:** 48 px, 16/800, the count in the plate face at 24/800 `--umber-800`, a hairline under; the only sticky element on a phone.
- **Motion exception** (decision 0017): the timeline rises in once per page load (`--dur-4`, `--ease-out`) when Friends opens through the door; never on a deep link or under reduced motion.
- **Overlap lanes:** two 16 px bars (you `--umber-600`, the friend `--umber-800`) on a day scale, shared days framed 2.5 px `--sun-400`, the one saffron mark on the home.
- **Milestone rings:** 56 px, a 2 px `--border` ring filling in `--umber-600`; earned a solid `--umber-800` disc with a paper icon.
- **Step tiles:** three in one 1.5 px `--umber-800` frame at `--radius-panel` (one column from 1100), each result in the plate face at 20/800; chosen `--umber-600` with paper text.
- **Heat calendar:** day cells at `--radius-control`, figures in the plate face; levels: a `--border` hairline, a 1.5 px `--umber-300` outline, then `--umber-300`, `--umber-600`, `--umber-700`, `--umber-800` fills (paper figures on the dark three); the best window framed 3 px `--sun-400`.
- **Fare table:** a member row (face and a framed IATA tile), a column per top proposal with a 4:3 photo head, each cell the return with a 4 px `--umber-600` bar, `NoPrice` where none; the average under a 1.5 px `--umber-800` rule; Fairest framed 2.5 px `--umber-800` with a solid tag; it scrolls in its own region when it cannot fit.
- **Stamp:** the place at 38/800 and the dates at 20/800 in the plate face, in a 3 px `--umber-800` frame at `--radius-panel`, tilted 4 degrees (upright and small on the ring).
- **Your Europe extremes:** as in My trips.

**States** (`StateBlock`, `Skeleton`, `NotYet`, `WorldTile`): loading is three painting blazes, announced politely, plus still bands the size of what comes. Empty: a dashed blaze and a way out (`PRODUCT.md` "Voice"). Error: one calm fix, no apology. Missing figure: "Not yet", outside every sum.

**Figure** (`<Figure value precision mine delta />`): see "Numbers that move honestly".

## The kit

`src/components/ui/`. A screen that needs a missing variant files a foundation request; it never restyles a kit class locally.

- `Button`: primary umber, default paper with a 1.5 px ink edge, quiet umber text, danger; 44 px. Disabled always reads unavailable (sunken paper, its edge, muted text), never dim umber.
- `IconButton`: round 44 px; `surface` with an edge, `photo` a paper disc.
- `Chip`, `ChipGroup`: pills, 1.5 px edge, the selected wash with a springing tick.
- `Segmented`: a pill, the chosen segment painted, 44 px high.
- `Tabs`: a 3 px umber bar strokes in under the chosen tab.
- `Switch`: umber when on, the thumb springs.
- `Field`: 8 px radius, 1.5 px edge, 16 px text, the error under it.
- `ChoiceRows`: one ruled list on the ground; the chosen row takes the wash, an umber outline and the blaze; multi-pick keeps the ticked square.
- `DialogSheet`: a bottom sheet on a phone, a centred dialog from 700 px; plays its exit, then closes; no entrance under reduced motion.
- Also `Card`, `Tile`, `CostRow`, `Money` (every euro through `formatMoney()`), `CarouselArrows`, `StepRail`, `AiTag` (the boxed "AI" on Ask, `.ai-tag`, sized in em; never a sparkle).
- The facts board (`.pt-page .pt-facts`: a 1 px frame, two columns on a phone, three from 820) is one part for place, journey and outdoor pages.

## Icons

`src/components/HouseIcons.jsx` via `<Icon as={HouseIcon.signpost} />`: a 24 px grid, 1.75 stroke, square caps, mitred joins, currentColor, decorative (the control carries the name).

- **Places:** signpost (Explore), route (Plan), ticket (My trips, dashed perforation in butt caps).
- **Actions:** bookmark (save, fills when saved), pack (travel style), people (Friends and every friend surface), invite (a person and a plus, only on Invite), voteUp, voteDown, tune (a plane over two slider lines, never a gear), fader (Settings), euro (prices shown).
- **Explore tabs**, on one ground line: Places a small town, Trails a switchback to a waymark post, Beaches a half sun over a wave, Lakes a shore with a fir, Mountains two peaks with a snow line, Cycling wheels.
- **The rest:** ret (a return fare), borders (no globe), car, train, bus, ferry, flight, bed, food, walk, the kinds and the standard actions.
- Never: a sparkle for AI, a compass rose, a plane with a dashed trail, emoji. `SparkIcon` draws the boxed AI mark, only where the thing is AI. Old glyphs in `Icons.jsx` stay where used; new work uses the house set.

## Background graphics: the relief

The one background graphic.

1. **Only from real ground:** drawn from the peaks in the place's dossier (`nearby.mountains[]`: name, km, bearing, `elev_m`; `reliefPeaks()` in `src/lib/relief.js`). No peak, flat band. Prices are never drawn as terrain.
2. **Prints a real height:** at least one tag ("Grand Combin 4,309 m") on paper (15.8).
3. **Where:** the "Around" band on place and outdoor pages, the trip header, the home page's story band, print and share covers. Never on Explore, list headers, or behind figures, rows, fields, focus rings or map labels. At most two per screen.
4. **Clear zone:** text sits on the flat side, ending `--space-6` before the cut, a thin umber line (`--stroke-edge`) with a blaze on top.
5. **Contrast:** lit lines white 95 %, shade lines ink 20 %, on the band; `aria-hidden`.
6. **Light** from the north-west; east-west at true scale, north-south squeezed.
7. **Motion:** none, except one `--dur-4` fade when its data changes; instant under reduced motion.
8. **Forced colours:** dropped.
9. **Missing photo:** a world tint with a resting blaze (`WorldTile`), never stock.

Check: `node scripts/verify_relief.mjs --port <port> --pages "/?styleguide,<your page>"` fails on a relief without a height, text in the zone, or text under 4.5.

Use: `<ReliefBand mountains={dossier.nearby.mountains} seed={place.id} cut="55%">…flat-side text…</ReliefBand>`.

**The opening screen** breaks rules 3 to 5 and 7 on purpose. A deep umber ground (`--umber-800`, a soft `--umber-700` glow) with the relief of Chamonix's peaks (`gem:chamonix`) in its bottom 40 % and one tag, "Mont Blanc 4,806 m"; no cut, the zone fades in over its top third and the words centre above it. Lit lines `--umber-100` at 42 %, shade ink 38 %. It rises once (a 1.4 s clip from the bottom), the blaze paints itself (halo, stripe, heel), the name lifts letter by letter, then `.hs-wait` shows. When the app is ready the screen lifts away like a curtain with rounded bottom corners. Reduced motion: at rest, gone at once. Files: `continent-app/index.html`, `src/styles/06-boot-splash.css`, `src/lib/bootSplash.js`, `src/components/LoadingScreen.jsx`; HANDBOOK "Opening screen".

## Motion patterns

### Primitives

| Primitive | Response | Haptic |
|---|---|---|
| Press | shrink and shade on `--dur-press`, spring back on the tick | none |
| Select | fill over `--dur-1`, the mark springs in | tick |
| Toggle | the thumb springs; pressed it stretches from its resting side | tick |
| Add / save | outline to filled on the pop; a toast with Undo | confirm |
| Remove | fade over `--dur-1`, neighbours settle; Undo toast 6 s or more | tick |
| Reveal | opacity and 4 px over `--dur-2`; popovers scale from 0.96 | none |
| Count | only the changed figure rolls (`Figure`); others dip once together | on the stepper, never the figure |
| Reflow | staying rows glide on settle, entering rows fade; up to 24 rows, no stagger | none |
| Sheet | rises on the sheet curve; drag 1 to 1, closes past 30 % or a fling | optional tick at the threshold |
| Route | the new view fades and rises 8 px; a drill-in shares the photo | none |
| Error | the field group shakes once, the message shows, focus moves | warn |

Without Motion, the classes in `05-house.css` do the same, added at the traveller's own act and flat under reduced motion: `.hs-pop`, `.hs-leave`, `.hs-reveal`, `.hs-sheet-in`, `.hs-sheet-out`, `.hs-dialog-in`, `.hs-route-in`, `.hs-shake`, `.hs-settle-in`, `.hs-couple-in`, `.hs-couple-out`, `.hs-paint`. `Button` takes `haptic="confirm"` for a commit. The style guide shows each live.

Signature moments: on Explore a chosen pin and its row paint and the price settles into an umber plate; on a place a chosen way there rolls the total; on a trip the hire car couples in and the total rolls with its delta note.

### Haptics

`src/lib/haptics.js`: `haptic('tick' | 'confirm' | 'warn')`, via Android `navigator.vibrate` (10 ms; 10, 60, 14; 20, 80, 20), the Capacitor Haptics plugin, or iOS Safari's switch tick. Only after a touch, at most one per 50 ms, only on a commit; never on pointerdown, navigation, opening a sheet, scroll, load or a timer. Chip, Segmented and Switch call it; screens never call `navigator.vibrate` (a test checks). The "Vibrate on tap" setting wins; by default it is on, except under reduced motion.

### Numbers that move honestly

A figure animates only within a second of the traveller's own change (`mine` windows of 1000 ms in `TripSummary.jsx` and `DestPriceCard.jsx`): only that figure, once, from the side it moved to, with a delta note. Refreshes, a co-planner's edit and first paint never move a figure. Many at once share one dip. Screen readers hear the new value once, politely. List order changes only from the traveller's own sort or filter.

### What never animates

A price the traveller did not change, list order while reading, anything at first paint (except the opening screen), the map camera on its own, the relief (beyond its fade), hover beyond a colour change, focus rings, loops other than a real loading indicator, blur, confetti, sparkles, sound.

## Map

MapLibre on the CARTO Voyager style, repainted by `src/map/houseBasemap.js` (land `--map-land`, water `--map-water`, borders `--map-border`). Routes umber on a white halo, dotted for flights. Ordinary pins: an ink head on a post with a paper price plate; clusters "+n"; the chosen pin the umber plate with the blaze, no overshoot. Labels are measured after the fonts load and never cover a post or another label. The pin drop plays only when the traveller opens the map. The coastline is the app's own (`public/europe_map.json`, Natural Earth).

The Explore map uses its own Protomaps basemap (`src/lib/map/cartaMapStyle.js`, `BASEMAP_COLOURS` in `src/map/tokenColors.js`), CARTO as fallback: land #f4efe6, sea and lakes #dfe6e6, borders #d9c6ae, roads from zoom 10 #e8dccb, parks #d6dccd, labels #465049 with a land halo, countries in spaced capitals, Noto Sans glyphs.

### Map page

- **Phone:** the map fills the page above the bottom nav. Floating on it: the search field with the umber search button and the Ask button (44 px, `--elev-2`), then chip rows: the style chip (umber 100) pinned left, then the settings; then Filters (umber edge, count disc 8 px from its word) and the quick chips (paper, the selected wash when on) in one sideways line with a 32 px end fade. Applied chips take their own line when they do not fit beside Filters; Clear all is bare words 8 px from its neighbours. Chip rows are transparent, keeping the chips' shadows whole. The header, category tabs, heart and zoom step aside (pinch). An ink "List of {n}" pill bottom centre opens the list sheet (peek with the count, Sort, List and the legend; half; full with a paper Map pill), which follows the finger and moves one stop per flick. A picked place is a 342 px tap card above the nav (a 120 px photo with Save, Close a 36 px sunken disc, the List pill 12 px above it, neighbours peeking); a swipe down, the map or Escape puts it away.
- **Tablet, 769 to 1023 px:** the phone model inside the frame: tap card and half sheet at most 560 px centred, the full sheet two columns. Tab gaps 16 px (12 px from 769 to 799) so six tabs fit; an overflowing row slides with the 32 px fade. Share sits in the search field. The settings line says the short words ("Create a style", "A day, each") and fades where it still overflows.
- **Desktop:** the band stays, List | Map on the tab row, Share (18 px glyph, 44 px target) 8 px before it from 1024. A column of compact cards on stone beside the map (380 px, 440 from 1440), headed by the count and the legend; a card under the pointer lifts its pin and the reverse. The anchored card from 1024: 320 px (288 below 1440), a 16:9 photo, `--elev-3`. Zoom 40 px bottom right with the credit under it; the heart 16 px in from the map's bottom left, never over the column and with no pin under it.
- **From 769 px:** with no filter on there is no applied row; a quick filter shows once, checked in the quick row; Clear all is quiet words (label size, 700, action umber) after the checked chips, on paper at the map's top edge (28 px, pill radius, no edge), always in view. The match explanation is a 360 px paper popover (hairline, `--radius-panel`, `--elev-3`), no backdrop.
- **Map rows** (`MapRow`): a 112 x 96 photo (128 x 96 in the desktop column), three lines that wrap, never cut, the short basis with the match mark level with the figure; rows one height.
- **Match mark:** a 24 px saffron pill (sun 100 ground, sun 400 edge, sun 800 text, the heart filled sun 400); its explanation stacks umber 600 to 200 bars, conflicts hatched saffron.
- **Icons beside words** sit on the capitals: the word's box is trimmed to cap height (`text-box: trim-both cap alphabetic` in `03-button.css`) in chips, kit buttons, the band's Settings, List | Map, Together, the tabs from 769 and the header nav from 1280.
- **Pins** are MapLibre layers, never DOM (`src/browse/explore/mapPins.js`). Photo pins: 44 px (56 named), radius 11 and 13, a 2.5 px paper ring, the Score as a 20 px ink plate top right, a 24 px paper label (name 700, figure 800), the picked one ringed and labelled umber; every pin on a 5 px point. Price pills: white with the ink figure (Overpass 800, the cards' `priceFigure` in the traveller's basis, whole euros); a saffron dot on the cheapest in view ("Best value in view"), never over a bubble or pill; the picked place an umber pill with its name. Count bubbles (umber 300 edge) to zoom 4.5, a tap zooms in; then 8 px umber dots with a white ring and a 44 px tap area. About one pill per 18,000 px of map (10 to 40), best-ranked first, collision on, none under the floating chrome. Settings and filters re-price in place; the camera moves only for a new search or a pick under the chrome.

## Colours being retired

- `--danger` `#a12a1c` (6.43 on stone): destructive actions and errors, always with words.
- `--owe` `#b3402a` (4.9 on stone, 5.7 on paper): only the Trip kitty balance a person still pays, always with its sign.
- Best value is a beige mark (`--best` umber 200, `--best-bg` umber 50, `--best-ink` umber 800) with its word ("Cheapest", "Best value"). No yellow.
- Retiring, no new readers: `--sun-*` (share images via `src/lib/share/draw.js`, the cost card `92-cost-card.css`, the taste chip, the search dock's Ask tile and beaches tab, one place template tag, the trip art), `--cost-*` (the trip summary bar's four groups, `TripSummary.css`), `--ai-violet` (the day planner's AI marks, `20-day-planner-flow.css`, `planners-held.css`).
- "Domain colours" in the token file are single-job (water quality, climate, crowds, cost groups).
- Legacy names (`--paper`, `--ink`, `--accent`, `--rule` and the rest) alias the roles; new rules read roles (the lint flags legacy names).
