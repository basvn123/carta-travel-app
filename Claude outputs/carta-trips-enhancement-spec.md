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

---
---

# Part two

Added after a second pass over the 253 trip files, your prompt, and the UX blueprint markdown.

---

## I. The strategic gap I would fix before anything else

### I1. The trip page does not price the trip
This is the largest single finding in the whole review, larger than any layout item above. Carta's reason to exist is one honest all-in number from the user's own departure airport. The trip page shows `€1,200 to €1,850 per person, excl. international flights`, and then hands the user off to a different tool with `Price a trip to Trieste`. So the page that sells the week is the one page on the site that does not do the thing the site is for. Ask for the departure airport once, at the top, remember it, and show the real total: flights from Charleroi, cabin bag, transfers, beds, food, local transport, bike hire. The number stops being a guide-book estimate and becomes Carta's number. Everything in section E gets more valuable once this is true, because the lifestyle slider is then moving a figure the user could actually pay.

### I2. Every trip is exactly seven days, all 253 of them
There is no 3-day version, no long weekend, no 10-day version, not one exception across ten trip styles. Meanwhile the city planner on the same site advertises "itineraries of 2 to 14 days". Most people booking a European trip are booking four nights, not seven, and a seven-day-only catalogue filters out the largest segment of your audience before they read a word. Every trip should carry at least a short version (the 3 or 4 best days of the week, with its own total) and ideally a long version. The data supports this cheaply: the itinerary is already seven discrete day objects, so a short version is a chosen subset plus a recalculated cost, not new content.

### I3. Prices assume two people sharing and never say so
`€120, €180 double` throughout. A solo traveller pays close to the double rate for the room, so the real per-person total for a solo week is materially higher than the number shown. Add a party-size control next to the lifestyle slider, defaulting to two, and recalculate. Solo travel is a large share of hiking, trail running and cycling demand specifically.

### I4. No rail alternative, on a continent where rail is often the answer
For a Belgian user, Istria is reachable by train, and for hundreds of the trips in the catalogue rail is competitive on time and price once airport transfers are counted. Carta is a European travel price tool that only prices flying. A "by train instead" line on the cost breakdown, even as a rough figure with a flag on it, is both a real user need and a genuine differentiator against every flight aggregator.

### I5. Weather months and cheap months are treated as the same thing
`Best months` answers "when is it pleasant". It does not answer "when is it cheap", and those are different months, which is precisely the insight a budget travel product should own. Add a second row to the month strip: price index by month. Shoulder season is where those two rows disagree, and that disagreement is the most useful thing Carta can tell a budget traveller.

---

## J. More problems found in the data

### J1. Sixty-one trips are geolocated to the wrong place
`coordinates.precision` is `country capital fallback` on 61 of 253 trips. The Istria cycling week is pinned at Zagreb, 200 km away. 54 more are pinned at their gateway airport. Only 30 have a real source coordinate. Anything that depends on position, a map pin, a "near you", a distance-from-airport figure, a nearby-trails link, is silently wrong on 45% of the catalogue. Geocode against the first named place in the itinerary rather than the country.

### J2. Twenty-six hero images are reused across 53 trips
The Kraków Rynek panorama appears on three different trips. Malmedy appears on both a cross-country skiing week and a trail running week. A user browsing a style index sees the same photograph twice and concludes the catalogue is padded. Enforce uniqueness of hero URL across the build.

### J3. The "week at a glance" table has a different number of rows on almost every trip
`crowdLevel`, `familyFriendly` and `carRequired` are null on 153 of 253 trips; `currency` and `languages` are null on 70. So the comparison table that should let a user compare two trips side by side has nine rows on one and five on the next. Either fill every field or fix the row set and show a clear "not recorded" state. A comparison table that changes shape cannot be compared.

### J4. The accuracy signals contradict each other
`verifyFlagCount` is 0 on 200 trips, yet `volatilePricing` is true on 83, and only 70 trips have anything in `sources.verified` while 123 have `confidenceNotes`. So a trip can simultaneously claim zero items needing checking and volatile pricing, with no sources recorded. The footer line the user reads, "Prices in this plan change often, check them before you book", is therefore driven by a field that does not agree with the other two. Pick one model (see K3) and make the three fields consistent.

### J5. Only 70 of 253 trips record what was verified
`sources.verified` is empty on 72% of the catalogue. For a product whose stated asset is trust in its numbers, that is the number to fix. It does not require citations in the UI; it requires that a human or a checking pass has recorded, per trip, which facts were confirmed and against what.

### J6. Bold emphasis appears in half the catalogue and not the other half
241 files contain `**bold**` markers, honoured by the Prose component, but they are concentrated: 139 trips have bold in logistics, 113 in the data sheet, and the Istria trip has none at all. So some trips read as heavily annotated and others as flat prose. Either apply it by rule (only on the operative fact in a paragraph) or drop it, since the design system already says structure should carry emphasis rather than weight.

### J7. Coverage is lopsided and the index does not admit it
France has 16 trips, San Marino has 1, and 19 of 39 countries have fewer than five of the ten styles. That is fine and normal, but the country filter will hand users empty results with no explanation. The existing `emptyCountry` string is the right instinct; pair it with "nothing written in Albania for winter sports yet, here are three nearby" rather than a dead end.

### J8. Nothing tells the user how old the numbers are
`dataVintage` is 2026 and `provenance.ingestedAt` carries a real date, but the page says only "Planning figures for 2026". Print the actual month the trip was last checked. A product built on freshness should show freshness, and a date is more convincing than any adjective.

---

## K. Using LLMs to build and verify the content

### K1. Generate into a schema, never into prose
You already have the right shape: the pipeline emits `md with a metadata bullet block` into a JSON object per trip. Keep that and tighten it. The model should never be asked for "a description of the trip"; it should be asked to fill named fields with typed values: `budget.breakdown.food.low` as an integer, `itinerary[3].dayStats.ascentM` as an integer, `packingNotes[]` as `{icon, item, whyThisTrip}`. Validate the output against a JSON Schema before it is written to disk and reject the file on failure. Structured output is what let the current 253 trips render without hand-adjustment, and it is the only thing that keeps the frontend intact as you go to 600.

### K2. Split generation into three passes with different jobs
One prompt asked to produce a whole trip will produce confident, uneven output. Instead: pass one is the **skeleton**, which decides route, days, bases and the named places, and is the only pass that needs real judgement. Pass two is the **prose**, which writes Morning, Afternoon and Evening for each day from the skeleton and nothing else, with a hard word cap. Pass three is the **numbers**, which fills costs, distances, ascent, surface split and booking windows, and is run with web search enabled and forbidden from inventing a figure it cannot source. Three cheap passes with narrow jobs beat one expensive pass with a wide one, and only pass three needs careful checking.

### K3. Make every number carry its own confidence, and show it
Give each numeric field a sibling `confidence` of `sourced`, `derived` or `estimated`, plus a `sourceUrl` where it exists. `sourced` means the model found it and the URL resolves. `derived` means it was computed from sourced values (a weekly bike hire from a daily rate). `estimated` means the model produced it from general knowledge, which is legitimate for a food budget and not legitimate for a museum entry fee. Then render it: a small mono marker on estimated figures, and a footer that says "9 of 14 figures on this page are sourced, 3 derived, 2 estimated, last checked March 2026". This is the honest-about-coverage move the design system already asks for, and it converts the accuracy problem from something you must solve perfectly into something you can state plainly.

### K4. Run a separate adversarial checking pass, with a different prompt and no memory of the writing
Take the finished trip JSON and hand it to a second model whose only instruction is to find what is wrong: figures that contradict each other, a total that does not equal the sum of its parts, ascent that does not match the described terrain, a hotel that does not exist, a museum price that is three years stale, a claim that a road is open to bikes. Have it return a list of disputed fields with reasons, which become `verifyFlags`. A writer model checking its own work will agree with itself; a separate critic with a different instruction will not. This is the cheapest accuracy gain available to you.

### K5. Check the things that are cheap to check, mechanically
Not everything needs a model. A script can confirm that `budget.breakdown` sums to `budget.totalEur`, that `perDayEur` equals total divided by days, that every place named in the itinerary geocodes inside the stated country, that every hero URL resolves and is over 1600px, that accommodation named in `accommodationStrategy` also appears in at least one day's `sleep`, that surface percentages add to 100, and that no `€x, €y` comma range survives. Run it in CI on every build. Roughly half the defects in this review would have been caught by twenty lines of validation.

### K6. Ground the volatile facts in retrieval, and mark them as perishable
Prices, opening hours, lift-pass costs, ferry schedules and booking lead times are the fields that rot. Fetch those with search at generation time, store the source URL and the fetch date alongside the value, and set a per-field expiry: food and accommodation ranges 12 months, museum and lift prices 6 months, ferry and transport timetables 3 months. A nightly job lists what has expired. This is what makes "last checked March 2026" a true statement rather than a decoration.

### K7. Use a human review budget on flags only
At 253 trips and growing, whole-file human review does not scale and is not needed. Review only fields the critic flagged, fields marked `estimated` above a value threshold, and anything in a brand-new country or style. Everything else ships on the automated checks. Keep a reviewer note in `sources.confidenceNotes`, which you are already doing on 123 trips, and make it a required field rather than an optional one.

### K8. Keep a golden set and re-run it when you change the prompts
Pick ten trips across ten styles where you know the ground truth, and re-generate them every time the prompt or model changes. Diff the numbers. This is how you find out that a prompt tweak quietly made every food budget 20% higher, before it ships to 600 trips. Without it, prompt changes are unfalsifiable.

### K9. Use the same pipeline to backfill what is missing, not just to add trips
Before generating trip 254, run the pipeline in fill mode over the existing 253: `packingNotes` and `whatCouldGoWrong` on the 153 that lack them, `typeSpecific` numerics, `crowdLevel` and `carRequired`, real coordinates, `sources.verified`. Completing what exists makes the whole catalogue feel finished and is a smaller job than it looks. Expanding on top of a catalogue that is 40% complete just multiplies the gaps.

### K10. Let the model write the packing and risk modules, because they are the most schema-friendly content you have
`{icon, item, whyThisTrip}` and `{severity, trigger, consequence, whatToDo}` are exactly the shapes an LLM produces reliably and a human writes slowly. They are also the two modules currently missing on most trips and the two that section C turns into the best parts of the page. Start the backfill there.

---

## L. What I think of your prompt and the blueprint markdown

### L1. The blueprint's core UX argument is right and worth following
Progressive disclosure, horizontal exploration instead of endless scroll, flashcards for advisory content, an icon grid for packing, activity-specific hero imagery, next-gen image formats and lazy loading: all of that is sound and I have kept it. The reasoning about cognitive load on a dense trip page is correct and it matches what I found on the live page.

### L2. The citations do not support the claims
Source 2, attached to a claim about three-second attention benchmarks, is a page titled "Tricks for sales funnel aesthetic" on an unrelated Brazilian domain. Source 4 is a web design agency homepage. Source 13, attached to the point about high-quality photographs, is a Shutterstock search results page. Source 19 is an explainer on Algolia, source 21 a bicycle bag market report. The document reads as researched but most of its references are decorative. That matters because you will be tempted to quote its figures. Treat the blueprint as a good design argument and none of its numbers as evidence.

### L3. The Doherty threshold figure is conflated
The blueprint says 100ms is the Doherty threshold. The 100ms figure is the separate, older "feels instantaneous" bound; Doherty and Thadhani's 1982 IBM result is 400ms, the point at which productivity stops improving. Both are real, they are different numbers, and the document merges them. The practical instruction is unaffected, give feedback on touch, but do not repeat the attribution.

### L4. The Sankey diagram recommendation is wrong for your data
A Sankey shows flow through multiple stages with splits and merges. Your budget has one source and four flat categories, which is a stacked bar. A Sankey here would be four parallel ribbons doing the work of four rectangles, harder to read, harder to make accessible, and heavier to render. This is the one substantive place I would ignore the blueprint.

### L5. The blueprint's trip modalities do not match your catalogue
It designs in depth for six types: city, hiking, cycling, extreme sports, digital nomad, and budget backpacker. You ship ten, and two of its six do not exist in your catalogue at all, while four of yours are not covered: cozy towns, road trips and scenic drives, culinary and wine tours, and nature escapes and cabin stays. Those four are 104 of your 253 trips, 41% of the catalogue, and they are the ones with no type-specific design guidance anywhere in the document. They also happen to be the types where the current generic layout hurts least, which is probably why nobody noticed.

### L6. Parts of the blueprint contradict your own design system
It recommends reserving "elegant serif fonts for destination titles" and describes a premium editorial aesthetic. Your carta-design skill bans serif faces outright, bans warm neutrals, and explicitly identifies the cream-plus-serif-plus-terracotta combination as the generated look the project is escaping. Where the two documents disagree, the design system wins; it was written against this specific failure and the blueprint was not.

### L7. Your routing analysis is the strongest part of the input, with one practical catch
Embed rather than build, offer free GPX, and do not paywall exports: all correct, and the GPX point especially. The catch is that komoot's embed works by embedding a komoot tour, which means somebody has to author 253 tours in a komoot account before there is anything to embed, and komoot's commercial and copyright terms for publisher use need reading before you build a dependency on them. Budget the authoring work, and check the terms first. An alternative worth pricing: hold your own GPX files, render them on Mapbox Outdoors, and skip the third-party account entirely. That keeps the map looking like Carta and removes a platform dependency, at the cost of building the elevation profile yourself, which is a small job when you already have the track.

### L8. Your mindmap is stronger than the blueprint on one point
"Make the text simple, not too many abbreviations and difficult words, you can always add the explanation in information icons" is the single most useful line in either input, and the blueprint never says it. It is also the thing the live page most obviously violates. I have made it C7 and C8 and I would treat it as a rule for all new content, not a fix for the old.

### L9. What neither input covers
Neither the blueprint nor the mindmap mentions: that the trip page does not use your own pricing engine (I1), that every trip is seven days (I2), that prices assume two people (I3), that 61 trips are geolocated wrongly (J1), or that two whole sections are empty on most trips (A4). Those are worth more than most of the visual work.

---

## M. What a trip should actually contain, my own view

The user is making three decisions in order: is this week for me, can I do it, can I afford it. Everything on the page should serve one of those three, and anything that serves none should go.

### M1. An honest "who this is not for"
Two lines, near the top, in the user's interest rather than yours. "Not for you if you have never ridden on gravel, or if you want to be off the bike by 2pm." It costs you the wrong bookings and buys you the right ones, and it is the fastest trust-builder available on a page full of your own claims. Nothing on the site currently does this.

### M2. The shape of the week, not just its contents
How many times do I change hotel? How many days are hard and how many are easy? Is there a rest day? The Istria week has three bases and one optional queen stage, and you can only learn that by reading seven day cards. A single strip showing base changes and daily effort tells you the shape of the week in one glance, and hotel changes are one of the top things people actually care about.

### M3. Day zero and day eight
Every trip starts with an arrival and ends with a departure, and both are where trips go wrong. When does the bike hire open. What happens if the flight lands at 23:00. Is there a left-luggage option on the last day. Currently day 1 begins with "transfer from Trieste and take delivery of the bike" as if the flight were somebody else's problem, which is odd on a site built around flights.

### M4. A booking order, not a booking paragraph
You already have `bookingWindows` on every trip, and it is prose: beds three to four months out, restaurants two to four weeks, bikes three to four weeks. That is a checklist wearing a paragraph. Render it as an ordered list with lead times in mono, in the order the user should act, and let them tick items off. This is the single highest-utility module you could add that requires no new data at all.

### M5. What happens when the weather ruins a day
`whatCouldGoWrong` was built for this and is empty on 153 trips. Every outdoor week needs a named fallback per day: if the bora blows, this is the alternative. Extreme-condition trips need it most, and for those the day cards should stop being "Day 1, Day 2" and become condition-dependent options, which is the one genuinely original idea in the blueprint and applies to your winter sports and water sports trips directly.

### M6. The trade-off you are asking the user to make
Every budget number hides a choice. €1,200 for this week means hostel-equivalent beds, cooking some meals, and skipping the tasting menu. €1,850 means the opposite. Say which is which as the lifestyle slider moves, in words, not only in the number. That is the difference between a price and an explanation of a price, and the explanation is the product.

### M7. One sentence on why this trip exists
Not the 130-word `summary`, which is good writing but is a paragraph. One sentence above it, with a verb or a number in it, that says why this week is worth a week. "An abandoned railway gives you 78 km of car-free gravel and four walled hilltowns, at railway gradients." A reader who stops after one line should still know what they were offered.

### M8. Where it sits against the others
A trip page with no exit is a dead end. Three "if this is too hard, try this" and "if you want this but cheaper, try this" links at the foot, computed from difficulty, cost and region, not hand-picked. With 253 trips and 39 countries you have the data to make these genuinely useful, and they are how a browsing user sees more than one page.

### M9. Something to take away
A GPX per route, a packing checklist, and the booking order as a printable or savable thing. People plan trips over weeks and across devices. Currently nothing leaves the page.

### M10. Evidence that a human was involved
The footer says "Written by the Carta content lab", which is true and unprovable. A named last-checked month, a count of sourced versus estimated figures, and the specific detail that only someone who went there would know, the 3.5 m cobbled lane with delivery vans that cannot reverse, do more than the byline does. You already write those details well. Surface them.

---

## N. What to add to your XMind

Nodes to add under **Trips**, phrased as you would write them:

### N1. Under a new top node, "Price the trip on the trip page"
Children: ask for departure airport once; include flights, bag and transfers in the total; remember the airport across trips; show a train alternative; show price by month, not only weather by month; party size, solo versus two people.

### N2. Under a new top node, "Trip lengths"
Children: every trip has a short version of 3 or 4 days; some trips get a 10 to 14 day version; the short version reuses the best days and recalculates cost.

### N3. Under "Expand the nr of trips", replacing the bare "Claude cowork?"
Children: schema-first generation, never prose; three passes, skeleton then prose then numbers; separate adversarial checking pass; mechanical validation in CI; confidence label per number; golden set of ten trips re-run on every prompt change; backfill the existing 253 before adding new ones.

### N4. Under a new top node, "Accuracy and freshness"
Children: sourced, derived or estimated on every figure; source URL and fetch date; per-field expiry, 3, 6 or 12 months; show the last-checked month on the page; state the sourced-versus-estimated split honestly; human review only on flagged fields.

### N5. Under "Adapt structure of the trips page", additions to what you have
Children: suitability strip on the hero, three values only; sticky section rail; nothing over 60 words visible without asking; plain word on the surface, technical word in the info dot; glossary component shared across the site; one primary button per page.

### N6. Under "Good to know & Pro-tips & What could go wrong", additions
Children: one idea per card, 35 words max; category icons, warning, money, weather, timing; booking order as a ticklist with lead times; weather fallback per day; condition-dependent day cards for winter and water sports.

### N7. Under "What to pack", additions
Children: icon grid not a list; tooltip says why this item on this trip; one icon set, 20px, 1.5px stroke, no tile; backfill packing data for the 153 trips that have none.

### N8. Under "Trip types hero images", additions
Children: hero shows the activity, not the nearest city; hero must match the real surface and terrain; 1600px minimum; no hero reused across two trips; build fails validation when an active-type hero is a settlement photo.

### N9. Under "Add pictures of the nicest things", additions
Children: three to five named highlights per trip; store commons filename and licence in the trip JSON; AVIF with WebP fallback; responsive srcset; lazy load with fixed aspect ratios and a placeholder; serve from a CDN.

### N10. A new top node, "Data defects"
Children: comma ranges on 209 trips; 61 trips geolocated to the wrong place; 26 heroes reused across 53 trips; glance table has a different row count per trip; verifyFlags, volatilePricing and sources disagree; two sections render empty on 153 trips; tags, basecamps and snapshot populated but never shown.

### N11. A new top node, "What every trip must answer"
Children: who this is not for; the shape of the week, bases and effort; day zero and day eight; what you give up at the low price; one sentence on why this week exists; three ways out to other trips; something to take away, GPX and checklist.

### N12. A new top node, "Routing"
Children: embed, do not build; komoot embed needs 253 authored tours, check commercial terms; alternative, own GPX on Mapbox Outdoors; free GPX and FIT download on every trip, never behind the pass; per-day map thumbnail on each day card.
