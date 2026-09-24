# Carta, trips section enhancement spec

Scope: the trip detail page under Destinations (`JourneyPage.jsx`), the trip style index, and the data that feeds them (`continent-app/dist/journeys/journey/*.json`, 253 trips across 10 styles).

What I checked: the live pages on carta-europetravel.com, every section label in `src/i18n/en.js`, the render order in `JourneyPage.jsx`, and the full JSON of all 253 trips.

Each item below is: **title -> what to change and why.**

---

## A. Fix first, these are live defects

### A1. Number ranges are printed as comma lists, not ranges
209 of 253 trip files contain the pattern `€1,200, €1,850`. On the page this reads as two separate prices, or as a thousands separator, instead of "from €1,200 to €1,850". Same pattern in food lines ("Konoba mains €14, €22"), hotel lines ("€120, €180 double") and airport lines. The dataset has zero em dashes in it, so the range character was stripped at some point and never replaced. Store ranges as `{low, high}` objects in the JSON and render them with a single en dash or the word "to" in one place in the component, so this can never drift again. This is the single highest-value fix on the page: the product's whole claim is that its numbers are trustworthy, and right now the headline number is ambiguous.

### A2. Best months and avoid-months are printed as one long sentence
`Best months: April, May, June, September, October` followed by a second line of 30 words explaining July and August. Replace with a 12-cell month strip: twelve mono month initials, good months filled `--signal-wash` with `--signal` text, avoid months in `--ink-45` with a hairline strike, neutral months plain. The prose explanation moves behind an info icon on the strip. A traveller reads the strip in half a second; nobody reads the sentence.

### A3. Difficulty prints a 40-word justification inline
`Difficulty: Active, 3/5, the rail-trail itself is graded at railway gradients, but the hilltown spurs and the optional Vojak day are genuinely hard`. Show `Active 3/5` as a five-segment mono meter, and put `difficultyNote` behind the info icon. Same treatment for `fGateway`, which currently prints four airports and four transfer times in one unbroken line.

### A4. Two sections render empty for 60% of trips
`What to pack` (`packHead`) and `What could go wrong` (`wrongHead`) are built in the component but `packingNotes` and `whatCouldGoWrong` are empty arrays in 153 of 253 trip files. Either backfill them (see D1) or hide the section heading when the array is empty. Today the page silently drops two of its most useful modules on most trips, and a user who saw them on one trip and not the next reads it as broken.

### A5. Three data fields are populated but never rendered
`tags` is present on 223 trips, `basecamps` on 177, `snapshot` on 153. None of them appear on the page. `tags` in particular is free filtering and free scanability. Either surface them or strip them from the build so the JSON stops carrying dead weight.

---

## B. Hero and imagery

### B1. The hero image must show the activity, not the nearest city
This is the biggest credibility gap on the site and it is systemic, not occasional. Every one of the 253 heroes is a place photograph. A cycling week through the Istrian hilltowns opens on an aerial of Pula. "Kitesurfing and land yachting at De Panne" opens on a photo of Brussels. A trail running week in the Rila and Pirin opens on the village of Govedartsi. Rule: the hero for a cycling trip shows bikes on the surface the route actually uses, a trail running trip shows runners on that terrain, a ski trip shows that snowpack and that lift, a water sports trip shows that board and that wind. Add a required `hero.activityMatch` boolean to the build and fail validation when a trip of an active type has a hero whose `credit` is a settlement name.

### B2. Hero accuracy beats hero beauty
Do not show smooth tarmac on a route that is 40% loose gravel, or a paved path on a hut-to-hut with rock scrambling. An experienced cyclist or hiker spots the mismatch instantly and stops trusting every number below it. The design system already bans AI-generated European cityscapes for exactly this reason; extend that rule to activity mismatch.

### B3. Thirty heroes are below 1200px wide
30 of 253 hero images are under 1200px on the long edge, some as low as 800px. On a full-bleed hero on a modern laptop those visibly soften. Set a 1600px floor in the image pipeline and re-source anything below it.

### B4. Trip style index cards pull 500px thumbnails
The style index loads Wikimedia `500px-` derivatives into cards that render larger than that on desktop. Request the correct derivative width per breakpoint via `srcset`, not one fixed size.

### B5. Add three to five photographs of named highlights per trip
Right now each trip has exactly one image for a 2,000-word plan. Add a small gallery keyed to the things the itinerary actually names: the Motovun ramp, the Parenzana tunnels, the Livade truffle market, the Rovinj waterfront. Each photo carries the name of the thing in it, so the gallery doubles as a "what you will actually see" list. Source from Wikimedia Commons and Geograph as the pipeline already does, and store the commons filename plus licence in the trip JSON so attribution is automatic.

### B6. Store and serve images as AVIF with a WebP fallback
With five or six images per trip across 253 trips, payload becomes the constraint. Run every image through an automated pipeline that strips metadata, generates responsive widths, and encodes AVIF with WebP fallback. Serve from a CDN. This is the difference between a gallery that feels instant and one that makes the page feel heavy on a phone in a foreign country on 4G.

### B7. Lazy load everything below the fold, with placeholders and fixed aspect ratios
Defer off-screen images with an Intersection Observer. Show a low-quality blurred placeholder or a `--panel` skeleton at the exact final dimensions. Hardcode aspect ratios in CSS so nothing jumps as images arrive. Layout shift on a page whose job is to show numbers is disproportionately damaging.

---

## C. Page structure: less text, less scrolling, more expanding

### C1. Suitability strip pinned under the hero
Before any scrolling, a user must be able to answer three questions: how hard is this, what kind of week is it, what does it cost. Put a semi-transparent strip over the lower third of the hero carrying exactly three values: difficulty meter, style (one or two words, from `tags`), and total cost in mono. Nothing else. Everything currently in `The week at a glance` stays where it is, one scroll down.

### C2. Day by day becomes a horizontal swipe carousel
This is the change that most affects how the page feels. Today `Day by day` is seven stacked blocks, each of which expands into three more paragraphs, which makes the page enormous. Replace with one card per day in a horizontal track: day number, day title, a photo of that day's main feature, the `dayStats` line in mono, and the night's accommodation. Swipe left and right to move through the week. Keyboard arrows and visible prev/next controls for desktop, snap scrolling, and a seven-dot progress indicator so the user always knows where they are in the week.

### C3. Day detail opens in place, not as more page
Keep the `More about this day` control, but have it expand the card vertically with an accordion, or open a bottom sheet on mobile, revealing Morning, Afternoon and Evening. The user who wants the overview never triggers it; the user who wants the detail gets it without the page growing for everyone.

### C4. Every long section collapses by default, with a one-line preview
`Good to know` currently prints nine paragraphs of prose in a single column: transport rules, connectivity, money, booking windows, permits, weather, health, emergency. That is roughly 600 words in one block. Each becomes a collapsed row with its icon, its label, and a six-word summary; tap to expand one. Default state of the whole section is closed. The rule for the whole page: nothing over 60 words is visible without the user asking for it.

### C5. Good to know, pro tips and what could go wrong become swipeable flashcards
The three advisory sections are the ones users skip, and they contain the information most likely to save a trip. Convert each to a horizontal deck of small cards, one point per card, each with an icon that signals its category: a warning triangle for a real risk, a coin for money, a cloud for weather, a clock for booking timing. One idea per card, maximum 35 words. A user will swipe through eight cards in fifteen seconds and will not read eight paragraphs in three minutes.

### C6. What to pack becomes an icon grid
Not a bulleted list. A grid of 16 to 24 item icons: front light, tyre plugs, rain shell, trekking poles, adapter, padlock, dry bag. Tapping an icon shows a one-line tooltip explaining why that item is on this specific trip, for example "Two unlit tunnels over 100 m, phone torches are not adequate." Keep the icons in one 20px, 1.5px-stroke set, `--ink-70`, no tile behind them, per the design system.

### C7. Plain language, with the technical version behind an info icon
The page currently opens with "the rail-trail itself is graded at railway gradients" and "70% hardpack, 30% paved". Carta's audience includes people who do not know what hardpack is. Surface copy uses the simple word; the precise or technical version lives in the info icon next to it. Build one `<InfoDot>` component with a glossary keyed by term, so `hardpack`, `bora`, `hut-to-hut`, `singletrack`, `EHIC`, `vignette` and `TBE` explain themselves everywhere they appear, written once.

### C8. Avoid abbreviations in body copy
`TRS`, `PUY`, `LJU`, `VCE`, `HGSS`, `EHIC/GHIC`, `ENC`, `CAA`, `GPX` all appear unexpanded. Airport codes belong in mono as data and are fine; the rest get expanded on first use or moved into the glossary dot.

### C9. A sticky section rail, so the page can be navigated rather than scrolled
A thin horizontal strip that sticks under the header once the hero leaves the viewport: Why, Costs, Days, Sleep, Know, Pack. Tapping jumps to the section and opens it. This is what makes a 2,000-word plan feel like six short pages rather than one long one.

### C10. Keep one primary action per view
The page currently ends on `Price a trip to Trieste`. That should be the only filled `--signal` button anywhere on the trip page. Everything else, including GPX download and map view, is a bordered secondary.

---

## D. Content depth, per trip and at scale

### D1. Backfill packing notes and what-could-go-wrong for all 253 trips
Generate with an LLM against a strict JSON schema, never free prose. `packingNotes` becomes an array of `{icon, item, whyThisTrip}`. `whatCouldGoWrong` becomes an array of `{severity, trigger, consequence, whatToDo}`. The schema is what makes the output renderable without hand-editing, and what keeps the UI intact as the trip count grows.

### D2. Expand the number of trips with a generate-and-verify pipeline
Going from 253 to several hundred by hand is not realistic. Run generation as a scripted pipeline that emits the exact same JSON shape you already have, with `verifyFlags` set on every price, opening time and booking window. Keep `provenance` and `dataVintage` populated so nothing enters the site without a traceable source and a review date. Batch by region as the existing `provenance.batch` field already does. A human reviews only the flagged fields, not the whole file.

### D3. One trip type at a time, fill the type-specific data sheet
`typeSpecific` has slots for `distanceKm`, `elevationM`, `verticalM`, `technicalRating`, `transitPass`, `hutBooking`, `liftNetwork`, `snowReliability`, `windConditions`, `gpxReady`, `audience`, and nearly all are null on the trip I inspected while the raw data underneath is rich. Fill the numeric fields first, because they are what the visualisations in section E need.

### D4. Cap the prose and let the structure carry the load
Word counts run from about 1,000 to 4,500 per trip, and the long ones are not better, they are just longer. Target: `summary` under 120 words, each day's Morning/Afternoon/Evening under 45 words each, each pro tip under 35 words. What is lost in prose gets recovered by the meters, strips, icons and cards above.

---

## E. Make the numbers visual

### E1. Cost breakdown as a chart, not four rows
`What the week costs` is currently four label-value rows plus a total. Replace with a single horizontal stacked bar: accommodation, food, transport, activities, each segment proportional, each tappable for its exact figure and its note. One bar communicates "most of this week is beds" instantly; four rows do not.

### E2. A lifestyle slider that moves the total
Carta's differentiator is the all-in number. Let the user drag between budget, standard and premium and watch the total and the per-day figure recalculate in real time, with the mono numerals animating. Each trip already carries `budget.totalEur.low` and `.high` and `budget.perDayEur`, so the endpoints exist; the slider interpolates between them and the breakdown segments move with it. This turns a static price into the user's own price, and it is the clearest demonstration of what the product does.

### E3. Elevation profile for hiking, trail running and cycling
A small area chart of ascent and descent across the week, with the day boundaries marked. For these three types it communicates difficulty better than any adjective and it is what Komoot and AllTrails users expect to see. `dayStats` already carries per-day ascent, so a week-level profile is derivable today; a true profile needs the GPX from section F.

### E4. Surface mix as a segmented bar, for cycling and gravel
The Istria trip is "40% compacted limestone hardpack, 45% paved secondary road, 10% loose gravel, 5% cobbled setts". That is a four-segment bar, not a sentence. A cyclist decides whether their bike suits the route in one glance. Pair it with a traffic-exposure indicator, the share of route on roads shared with cars versus dedicated path.

### E5. Type-specific data sheet, per style
Each trip type leads with different numbers, and the data sheet should reorder itself accordingly. Cycling and gravel lead with surface mix and daily distance. Hiking leads with elevation profile and technical grade. Winter sports leads with snow reliability, vertical metres and lift network. Water sports leads with wind and swell by month. City trips lead with a transit score and a food-cost index. Culinary leads with seasonality of the produce. Nature escapes lead with remoteness and last-shop distance. The component reads `tripTypeSlug` and picks the field order; the JSON already has the slots.

### E6. Extreme-budget and slow-travel variants of the cost model
For the cheapest tier, show what the low number actually assumes: self-catering, hostel beds, municipal transport, free museum days. For longer stays, apply long-stay accommodation discounts. Both make the low figure believable rather than optimistic.

---

## F. Routes and maps, without building a routing engine

### F1. Do not build custom routing, integrate it
Building activity-specific routing, offline tiles and the backend behind them is tens of thousands of euros and an ongoing maintenance load. The right move is a hybrid: embed a specialist provider for the interactive route, keep your own visual language for everything around it.

### F2. Embed the route, do not link out
Komoot's embedding tools for publishers render an interactive map, elevation profile and route statistics inside your own page, with no third-party account required from the user. That keeps the user on Carta while borrowing world-class topographical data for hiking, cycling and trail running. Sending users to another site at the exact moment they are most engaged is the worst possible trade.

### F3. Or use Mapbox Outdoors if brand control matters more
Mapbox's Outdoors terrain style is built for hiking, cycling and outdoor recreation. Overlaying your own GPX tracks and your own markers on it keeps the map looking like Carta rather than like a guest. The trade-off is real: deeper integration means more development cost and more to maintain. Decide based on whether the map is a feature or the feature.

### F4. Offer a plain GPX download on every route
Runners, hikers and bikepackers navigate on Garmin and Wahoo hardware, not on a phone screen, and the loudest complaint in that community is platforms that paywall GPX exports. A free, frictionless GPX or FIT download buys more credibility with serious outdoor users than any amount of design polish, and it costs almost nothing to ship. `typeSpecific.gpxReady` already exists as a field; populate it and wire the button.

### F5. Per-day map thumbnails on the itinerary cards
Each day card in the carousel gets a small static map of that day's segment. Tapping opens the full interactive route with that day highlighted. This is what makes the carousel feel like a route rather than a list of text.

---

## G. How it should feel

### G1. Every tap gets visible feedback inside 100ms
100ms is the threshold at which an action feels instantaneous; past roughly one second, attention moves elsewhere. Carousel swipes, accordion chevrons, info dots, slider drags and packing icons must all change state on touch, before any data arrives: the control compresses, shifts shade, or fires a haptic. The perceived speed of the page is set by this, not by how fast the data actually loads.

### G2. Shared element transitions between overview and detail
When a day card opens into a full map or a full-screen photo, the card's thumbnail should expand into the new view's header rather than the page going blank and reloading. It preserves the user's sense of place and hides load time at the same time.

### G3. Skeletons, never spinners
Sections that are still loading show a `--panel` block at the final dimensions. A spinner says "waiting"; a skeleton says "arriving".

### G4. Respect the design system while doing all of this
No warm neutrals, no serif face, no gradients or shadows, no pastel tiles behind icons, no decorative uppercase mono. Mono is for measured facts only, so the meters, the cost bar labels, the `dayStats` line and the month strip are mono, and every heading and explanation is sans. One filled `--signal` button per view, and `--flag` yellow marks the cheapest thing in a view and nothing else. Check it at 380px wide with no horizontal scroll, and with `prefers-reduced-motion` honoured on every one of the new animations.

---

## H. Suggested order of work

### H1. Week one, correctness
A1 ranges, A4 empty sections, A2 month strip, A3 difficulty meter. Nothing here needs new content or new data, and A1 alone changes how trustworthy the page reads.

### H2. Week two, structure
C2 day carousel, C3 in-place day detail, C4 collapsed sections, C9 sticky rail. This is where the page stops feeling like a document.

### H3. Week three, the advisory and packing modules
C5 flashcards, C6 icon grid, D1 the backfill that feeds both, C7 the glossary dot.

### H4. Week four, imagery
B1 activity-matched heroes and B5 highlight galleries first, then B6 and B7 so the extra images do not cost page speed.

### H5. Then the numbers and the routes
E1, E2, E3, E4, then F2 or F3 and F4. These are the ones that turn the trip page from an article into an instrument.
