# The product in one page

<!-- impeccable:product-schema 1 -->

The product truth: who the app is for, what it does, the number rules, the voice mechanics and the vocabulary. Read it before any screen, string or figure. `BRAND.md` owns the promise and the tone; `DESIGN.md` owns the look. The file says "the app", not the product name.

## Platform

web

One web app (Vite and React, installable as a PWA), also wrapped for the App Store and Play Store. One design language, for finger, mouse and keyboard alike.

## Mission

"Tell us what you love. We'll show you Europe." (`BRAND.md`). The app finds the places that fit what a traveller likes, then shows what a day there costs, the bed and the food, before anything is booked.

Why it exists: flight search shows the cheap ticket, then the bed, the food and the days cost far more than expected. A cheap flight is not a cheap trip; the app removes that surprise and adds the flight, the bed and the days into one total.

Public lines (pitch, home page, store listing, press) come from `BRAND.md`. The flight price is always Google Flights', shown as theirs.

## What the app is

A trip planner to explore Europe with: find the places that fit, see what the days cost, then plan the trip yourself or have it planned.

- **It prices the ground** in every place in the catalogue: the bed and the food, a person a day. Local transport and tickets are not in the day figure yet (`costIndex.js` sums stay and food), and no copy may say they are.
- **It shows Google Flights' price**, with the airline, the times, when it was checked and a link. A fare the traveller types replaces it. Bag fees are the app's estimates.
- **It plans** city by city and hour by hour. The same figure carries from the Explore row to the receipt, the trip and the day planner.
- **Around the towns** sit walks, beaches, lakes, summits and cycling routes, each with a page. An empty region says so in one line.
- **It sells nothing.** No bookings, no ranking by what it earns. Some links pay the app a small fee at no cost to the traveller.

Data: the catalogue is `app_data/app_data.json`; never copy a count into the UI (read `meta`). Everything on the map is precomputed and served as static JSON; only the trip planner searches one day of flights live. Live at carta-europetravel.com until the Viantra domain (owner step K1-a). Six languages (English, Dutch, French, German, Spanish, Italian) on every surface and export.

## Who it is for

Everyone travelling in Europe, on any budget (`BRAND.md` has the brand version):
- **Every way of planning:** a ready-made trip, a route or road trip built yourself, or no plan at all.
- **Every interest:** hikers, beach families, cyclists and bikepackers, food lovers, city breakers, car-free travellers, trail runners.
- **Every budget:** from the student counting every euro to the traveller in a 5-star hotel.
- **Before and during the trip:** choosing where to go, or already there and planning tomorrow.

The cost of a day sets the app apart, whatever someone spends. For a tight budget that means low-cost carriers, the airport bus, dorms and small apartments, and the gap between €24.99 and €25. The tone is never luxury: premium comes from precision and honesty.

Two surfaces serve travellers who already know where: the planner prices their days and legs, and a saved trip shows a returning traveller what changed.

## What they are doing

Finding the place that fits, then reading what it costs. The traveller narrows Europe down by what they like, then compares many prices for one set of inputs (origin, dates, people, Lifestyle). Lists, the map and receipts are numbers first, picture second; the home page and rails let inspiration lead.

- **Inputs stay visible**; figures update in place, line up in columns and never jitter.
- **Whole euros** where many places are compared (rows, cards, pins, filters); **cents** on every receipt, total and ledger. Never round to look tidy.
- **Density is a feature:** about ten places per phone screen in a list. Large photo cards only on rails and the home page.
- A month picked without dates starts on its first Saturday.

## The one rule the numbers follow

Every ground cost (bed, food, local transport, airport transfer) follows one chain: a harvested figure, then a cached third-party figure, then a model estimate, never a blank. The price engine (`continent-app/src/lib/price/`) stores each step for what it is, with source and date. The traveller sees one amount and its unit: no tilde, no "live", no assumption line. A tap on the amount lists what is in it, with a switch each. An estimate is never dressed up as a bookable price; every booking link warns that prices may have changed.

**Coverage first:** measured sources (the Google Flights sweep, Airbnb, hostels, food prices) cover as many places as possible, and model estimates stay as few as possible (ROADMAP D10).

- **A missing figure is "Not yet"**, never invented, and stays out of every sum.
- **A total is the engine's total**, never a sum of rounded lines; a "Rounding" line closes any gap.
- **Every euro goes through `formatMoney()`** (`continent-app/src/lib/money.js`), in the reader's locale, with tabular figures.
- A saved trip keeps its own stay and Lifestyle; app settings apply to new trips.
- A beach with several test sites shows the worst bathing water class.

**Flights, in order:** the traveller's own fare, labelled as theirs. Then Google Flights' price: live in the trip planner, or from the sweep for that day (or the nearest day within 4 days, showing its date). Then, beyond the sweep, a typical fare (the route's median), labelled "Typical for this route, not for your dates". Then nothing. A swept price shows while it is fresh: 5 days for the next two weeks, 16 days for later dates, 32 days beyond 181 days (`flights.max_age_days` in `config/pricing.json`). Every flight shows the airline, the times and a Google Flights link with "prices may have changed". Bag fees (10 kg cabin, 20 kg checked) are estimates, and the traveller's bag is priced on every flight.

Trust in the numbers is the product's only real asset.

## Product principles

1. **Prices and plans, never sells.** No tickets, no beds, no ranking by earnings.
2. **Never navigates.** No GPS or turn-by-turn. Every day ends in "Open in Google Maps" ("Open Day 2 in Google Maps"), never "Navigate" or "Start route".
3. **Not entirely free, and never says it is.** Browsing, both planners, one saved trip, sharing, co-planners and GPX are free. A Trip Pass (60 days) or Year Pass (12 months) adds PDF, ICS and KML exports, more saved trips, booking import and more AI plans (`lib/pricing.js` TIERS, `hooks/usePaywall.jsx`). The line: "Planning is free. A Trip Pass adds exports, more saved trips and more AI plans." Never "100% free" or "free forever". The pass shows at a paid moment, in Account, on /pricing and on the home page.
4. **Private by default.** Documents in a trip's Notes stay on the device. An imported booking is read once and not stored; a failed read keeps only its kind and size, for 30 days.
5. **Every function stays.** A visual change never removes a feature, control, step, setting or field, and never changes what a button does. A secondary control may move into a menu if it stays reachable.
6. **Say less.** Every sentence earns its place. No method notes, catalogue counts or coverage notes; say the unit once.

## Voice

`BRAND.md` sets the tone: human, catchy, short and clear. Figures, labels and receipts stay plain and exact. These are the mechanics, several checked in code:

- **Short.** Headlines under ten words; labels and buttons two or three. The unit once per list ("A day, a person" in the column head). Cut any line that could sit on any product.
- **Honest.** The flight price is Google Flights'. When the AI is off, say so. Ask's answers carry "AI, from our own figures. It can be wrong." No testimonials.
- **Sentence case.** Labels, buttons and section heads take no full stop; a two-beat line keeps its stops ("Choose where. We'll tell you what it costs."). Active voice: "Save trip" produces "Trip saved".
- **Errors and empty states:** one calm fix, no apology, no "Error:" prefix ("That didn't load. Try again."). An empty state offers a way out ("Nothing fits that budget yet. Stretch it a little?").
- **No em or en dashes**, anywhere, docs included: use a comma, a colon or two sentences. `stripDashes()` (`continent-app/src/lib/format.js`) enforces it. No middle dots or bullets as separators. Ranges use "to" ("€100 to €149").
- **No emojis**, and no sparkle icon for AI: Ask carries a boxed "AI" tag.

Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.

### The vocabulary: one name per object

Use these words on every screen, in all six languages, in docs and reports. i18n keys keep their names; their values follow this table.

| Object | The word | Not |
|---|---|---|
| A place kept for later | **Saved** (verb: Save) | Shortlist, favourites, Keep, Kept |
| The traveller's own trips | **My trips** | Your trips |
| Trip states | **Upcoming**, **Planning**, **Past** | Coming up, Being planned |
| Trips the app made | **Ready-made trips** | the app's own trips, ready-made routes, guides |
| Explore's places area | **Places** (the tab is **Explore**) | Destinations |
| A figure the app does not have | **Not yet** | Price on request, Unknown, Not yet measured |
| The unit in lists | **A day, a person** (once, in the column head) | bed and food for one person a day |
| The unit switch | **Per person** / **Whole group** | |
| Who travels | **People** | Travellers, Who, party |
| How the traveller spends | **Lifestyle** (stay and food style inside it) | How you'll spend |
| The quality figure | **Score** (out of 10) | rating, match %, stars |
| Getting to the place | **Getting there** | travel, transport to |
| The AI | **Ask** (with the boxed "AI" tag) | assistant, copilot, chat |

## The interaction promise

The app feels alive because it answers, not because it performs (`DESIGN.md` "Interaction"). Every tap, toggle, save, step and screen change gets a designed response: a small spring on the control, umber paint on the chosen thing, a changed figure rolling once to its new value, a sheet that follows the finger, and on supporting phones a short haptic tick ("Vibrate on tap" setting). Motion never delays the task, never moves a price the traveller did not change, never plays at first paint, and under reduced motion shows the end state at once.

## Three angles

Every screen is designed and checked on phone (390 x 844, down to 360 with no horizontal scroll), tablet (820 x 1180 and 1180 x 820, its own layout) and desktop (1440 x 900 and 1920). Touch and pointer work everywhere; hover is never the only way.

## Accessibility

Always on, never announced.

- **Touch:** every control at least 44 by 44 px (`--tap`), segmented buttons 44 px high. Bottom nav labels shrink before they truncate.
- **Contrast:** text pairs clear WCAG AA 4.5:1, marks and control edges 3:1 (ratios in `01-tokens.css`, checked by `scripts/ci/token-contrast.mjs`). No text on photos or relief contours. Text at least 12 px.
- **Colour is never alone:** a kind has its pictogram and word, a cost part its icon, a state its words.
- **Step-free:** the planner's step-free answer shortens walks; it never calls a place step-free unless D21's facts say so.
- **Focus and keyboard:** a visible 3 px umber focus ring with an offset. Every `aria-modal` traps focus and closes on Escape. Links are `<a>`, actions `<button>`, one `h1` per view.
- **Motion:** reduced motion shows end states at once. Animate transform and opacity only. No parallax, no scroll-triggered counters. Changed figures are announced once, politely.
- **Language:** the document language follows the UI language. Strings go through i18n keys, never concatenation.
- **Light only:** `theme-color` is the ground. No dark mode as a side effect of another task.

## Positioning

The competitors are in `BRAND.md`, "Where we sit". The app sits where exploring, cost and logistics meet, and hands over to the maps app at the last step.

## Operating context

Travellers plan at home or on the move, mostly on a phone: browse places by what a day costs, save a few, compare them on the map, then turn one into a trip and its days. Acquisition is organic search on honest item and coverage pages; at about €0.17 allowable spend per visitor, no paid channel fits (`docs/GTM-ACQUISITION-CONSTRAINT.md`). Public opening Tuesday 9 March 2027, launch campaign Tuesday 4 May 2027 (`ROADMAP.md`). First-year success: Trip Passes sold, visitors from search, trips saved and revisited, read in the admin Overview (`docs/LAUNCH-METRICS.md`); visitors and priced-trip completions have no instrument yet.

## Evidence on hand

Real: the catalogue (read `meta` for counts), per-region coverage (`continent-app/public/coverage.json`), licensed photos with author and licence (`docs/tos/data_licenses.md`), provenance on every receipt, share cards (`continent-app/scripts/og`). Never fabricate testimonials, user counts, press or partner logos.

## Where the facts live

| Fact | Source |
|---|---|
| Promise, positioning, voice, logo | `BRAND.md` |
| The look | `DESIGN.md`, tokens in `continent-app/src/styles/01-tokens.css` |
| Design rules and pre-ship questions | `.claude/skills/carta-design/SKILL.md` and `references/` |
| Why the house style is what it is | `docs/decisions/0012-house-style.md` |
| Craft practice for visual tasks | `docs/design/craft-guide.md` |
| Pass pricing | `continent-app/src/lib/pricing.js` TIERS |
| Catalogue size and schema | `app_data/app_data.json` `meta`, `docs/SCHEMA.md` |
| Provenance chain | `docs/1.CARTA.md` |
| Ground fare model | `docs/ESTIMATION.md` |
| Flight prices | `docs/SCHEMA.md` "Flight prices", `docs/PIPELINE.md` "Flights" |
| Licences and credits | `docs/tos/data_licenses.md`, `docs/tos/fonts.md` |
