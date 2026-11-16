# The product in one page

<!-- impeccable:product-schema 1 -->

Read this before `DESIGN.md` and before any task that touches a screen, a string or a number the traveller sees. It is the durable product truth: who the app is for, what they are doing when they use it, how it speaks, the words it uses, and what it owes them. `DESIGN.md` holds the look (tokens, type, shape, graphics, motion); this file holds the reasons and the rules the look serves.

The file is name-free on purpose: it says "the app". The product name may change; it appears only where code, URLs or quoted UI need it.

## Platform

web. One web app (Vite and React, installable as a PWA) is also packaged for the App Store and Play Store as a wrapper of the same app (owner decisions 2026-10-02 and 2026-10-13), so there is one design language, the web's, and it works with a finger, a mouse and a keyboard alike.

## Mission

The owner's statement (2026-10-20), to reuse wherever the app explains what it does: a pitch, the home page, a store listing, an about page, a press note.

> Waar traditionele zoekmachines zoals Skyscanner en Google Flights uitsluitend zicht bieden op goedkope vliegtickets, lopen reizigers in de praktijk tegen een financiële muur aan wanneer een ogenschijnlijk goedkope vlucht leidt naar een bestemming met exorbitante kosten voor accommodatie, horeca en dagelijks levensonderhoud. Het fundamentele doel van het platform is het elimineren van deze onzekerheid.

In English: flight search engines such as Skyscanner and Google Flights only show the cheap ticket. In practice travellers hit a financial wall when a seemingly cheap flight leads to a place where the bed, eating out and daily living cost far more than they expected. The app exists to remove that uncertainty.

Short form, for a subtitle or a store line: a cheap flight is not a cheap trip; the app shows what the days there cost.

The app brings everything together: the flight, the bed and the days, in one total (owner, 2026-10-21, T511 to T519, reversing T272). When reusing the mission, keep the voice rules below: no superlatives, no claim the app cannot back with a figure, and never imply the flight price is the app's own: it is Google Flights' price, shown as theirs.

## What the app is

The one app for planning a trip anywhere in Europe. The owner's sentence (2026-10-21, T471-b): "Stop stitching trips together from five apps. [The app] plans the whole trip in one place, with what each day costs." It cuts the coordination and the logistics, replacing the stack of planning tools with one overview. For people who start from "what can I afford", it says what a day costs, per person or for the whole group, in every place in its catalogue.

- **It prices the ground** for every place in the catalogue: the bed and the food, a person a day. Local transport and tickets are not in the day figure yet (`costIndex.js` sums stay and food); they arrive as their own receipt lines (roadmap 2.14), and until then no copy may say the day figure includes them (roadmap 1.16).
- **It shows Google Flights' price** for the flight, with the airline, the times, when it was checked and a link to Google Flights; a fare the traveller types in replaces it. Bag fees per airline are the app's estimates.
- **It plans** the trip city by city and each day hour by hour; the same figures carry unchanged from the Explore row to the place receipt, the trip page and the day planner, so no two screens can disagree about what dinner costs.
- **Around the towns** sit walking routes, beaches, lakes, summits and cycling routes, each with a page; where a region is empty the page says so in one line.
- **It sells nothing.** It takes no booking and never ranks by what it earns; it prices, plans and hands the traveller to the operator. Some links pay the app a small fee at no cost to the traveller (I-e, owner ticks T461-d and T1047-a, 2026-11-12).

The catalogue is master data in `app_data/app_data.json` and grows with every ingest; never copy a count into the UI (read `meta`). Nothing on the map is live-searched; the pipeline precomputes everything and a CDN serves it as static JSON. Flight prices come from a sweep Worker that checks each route on a schedule; only the trip planner searches one day live. Live at carta-europetravel.com. Six languages: English, Dutch, French, German, Spanish and Italian, on every surface including the PDF, KML and ICS exports.

## Who it is for

The launch speaks to hikers first: the person who travels to a town to walk from it, for a day or a weekend first and hut to hut second (owner-confirmed 2026-10-02, T275). Then families looking for beaches, cyclists and bikepackers, budget city-break travellers, car-free travellers and trail runners.

People counting money. The core audience is budget-conscious travellers inside Europe: students, young workers, families on one income, retirees on a fixed one, anyone who starts from "what can I afford" rather than "where do I want to go". They fly low-cost carriers from secondary airports, take the bus from the airport, sleep in dorms, private rooms and small apartments, and care about the difference between €24.99 and €25. They are not a luxury audience; a premium feel comes from precision and honesty, not from the vocabulary of luxury travel.

Two secondary audiences shape the surfaces: travellers in the planner who already know the place and want the days and the legs priced, and returning travellers with a saved trip who want to see what changed.

## What they are doing

Comparing dense prices. The central act is reading many prices at once and finding the cheapest honest option for a fixed set of inputs (origin, dates, people, lifestyle). Each screen is a table of measured numbers first and a picture second: the map pins every place with its figure, the receipt itemises one total, the trip prices every leg, the day planner builds a day on a clock.

- **The inputs are always visible** and the figures update in place. Numbers line up in columns and do not jitter when they change.
- **Whole euros where many places are compared** (rows, cards, pins, filters), cents on every receipt, total and ledger (owner, 2026-10-13). A figure is never rounded to look tidier anywhere else.
- **Density is a feature.** About ten places fit one phone screen in a list (owner, 2026-10-13, T421); large photo cards are for rails and the home page, where inspiration leads.
- A month picked without dates starts on its first Saturday, on every screen (owner, 2026-11-12, T815-a, T795-a).

## The one rule the numbers follow

Every ground cost follows one chain: a real harvested figure first, then a cached third-party figure, then a model estimate, and never a blank. Ground costs are the bed, the food, the local transport and the airport transfer; the day figure holds the bed and the food, and local transport joins it once it is priced (owner B11, 2026-10-24), its own line until then. Each step is stored for what it is (measured, live, estimated, missing, with its source and date) by the price engine (`continent-app/src/lib/price/`) and shown in the admin Prices view; the traveller sees one amount and its unit, with no tilde, no "live" and no assumption line (owner, 2026-10-24, price plan rule 2). A tap on the amount lists the items in it with a switch each (rule 9). An estimate is never dressed up as a bookable price. Every external booking link warns that prices may have changed.

- **A missing figure is "Not yet"**, never a made-up number, and it stays out of every sum.
- **A total is the engine's own total** (`formatMoney()` of the unrounded sum). Where printed whole-euro lines do not add up to it, the receipt shows a "Rounding" line; the total is never a sum of rounded lines.
- **Every euro goes through `formatMoney()`** (`continent-app/src/lib/money.js`), on `Intl.NumberFormat` in the reader's locale, set in the interface face with tabular figures.
- A saved trip keeps the stay and Lifestyle it was saved with on every screen; the app-wide settings apply to new and unsaved trips (owner, 2026-11-12, T703-a).
- Bathing water: when several official test sites lie on one beach, the beach shows the worst class among them (owner, 2026-11-12, T1189-d).

**Flights follow their own order** (owner, 2026-10-21, T511 to T519). A fare the traveller typed in comes first, labelled as theirs. Then Google Flights' price: searched live in the trip planner for the exact day and chosen hours, or taken from the sweep for the same day (or the nearest day within 4 days, where the flight shows its own date). Then, for a date beyond the sweep's reach, a typical fare: the median of the route's swept fares, labelled "Typical for this route, not for your dates" next to the amount and on the receipt line, never presented as a fare found for those dates; the one owner exception to "one amount and its unit" (owner tick T882-b, 2026-11-12, ROADMAP D10). Then nothing. A swept price is shown while it is no older than its sweep cycle plus a day or two: 5 days for dates in the next two weeks (checked every 3 days), 16 days for later dates (checked every 2 weeks), 32 days for dates more than 181 days ahead (checked every 4 weeks) (T798, T780, `flights.max_age_days` in `config/pricing.json`). A flight price always shows the airline, the times, when it was checked and a link to Google Flights with "prices may have changed". Bag fees (10 kg cabin, 20 kg checked) are the app's estimates, stored as such, and the traveller's bag is priced on every flight (T691).

The product's only real asset is trust in its numbers. Every visual and copy choice follows from that.

## Product principles

1. **Prices and plans; never sells.** It never sells a ticket or a bed and never ranks by what it earns. Some links pay a small fee at no cost to the traveller (wording I-e, T1047-a, 2026-11-12).
2. **Never navigates** (owner, 2026-10-21, T471-b). No route guidance, no GPS, no turn-by-turn. Every day and every ride ends in a hand-over to the traveller's maps app, worded "Open in Google Maps" (or "Open Day 2 in Google Maps"), never "Navigate" or "Start route".
3. **Not entirely free, and never says it is.** Browsing, both planners, one saved trip, sharing and co-planners (owner T488-b) and GPX are free; a Trip Pass (60 days) or the Year Pass (12 months, paid once) adds every PDF, ICS and KML export, more saved trips, booking import and more AI plans (`lib/pricing.js` TIERS, gates in `hooks/usePaywall.jsx`). The sentence for it: "Planning is free. A Trip Pass adds exports, more saved trips and more AI plans." (`pass.freeSentence`); never "100% free" or "free forever". The pass appears at a paid moment, in Account, on /pricing and on the home page (T496, T497, D9).
4. **Private by default.** Documents saved in a trip's Notes (tickets, passport scans) stay on the device that added them. A booking the traveller imports is sent once to be read and is not stored; a failed read keeps only its kind and size, for 30 days (owner, 2026-11-12, T1015-a).
5. **Every function stays.** A visual change never removes a feature, a control, a flow step, a setting or a data field, and never changes what a button does (owner, 2026-11-13). A secondary control may move into a menu only if it stays reachable and behaves the same.
6. **Say less.** Every sentence on a page earns its place. No method sentences, no catalogue counts, no coverage notes, no unit sentences the context already gives (owner, 2026-10-13 and 2026-11-13: not "bed and food for one person a day"; say the unit once, in the column head or the label).

## Voice

The app sounds like a well made instrument, not a brochure: a trail sign, a timetable, an itemised receipt. When a copy decision is open, ask what a good waymark or receipt would say: the place, the time on foot, the price, nothing else.

- **Plain, specific, verb first.** Every headline carries a verb the traveller recognises or a number. "What the whole trip costs" works; "Everything the price tag usually hides" could sit on any product and so does not.
- **Short.** Labels are two or three words. The unit is said once per list or card ("A day, a person" in the column head), never under every figure.
- **Honest, in its own voice.** A flight price is named as Google Flights', with when it was checked; when the AI is off, the app says so. Ask's answers carry "AI, from our own figures. It can be wrong." No testimonials.
- **Sentence case everywhere.** No terminal punctuation on labels, buttons or headings; helper text and body copy take full stops. Contractions are fine. Active voice. A button that says "Save trip" produces "Trip saved".
- **Errors** say what happened and what to do, in one sentence, with no apology and no "Error:" prefix ("Type the fare you paid, in euros."). **Empty states** name the space and give the action ("No place fits", Clear all).
- **No em dashes and no en dashes**, anywhere: a comma, a colon or two sentences instead. `stripDashes()` in `continent-app/src/lib/format.js` enforces it on every shipped string; the rule applies to source, docs and reports too. Middle dots and bullet characters as separators are banned. Ranges use "to" ("€100 to €149").
- **No emojis.** No sparkle icon for AI: Ask carries a boxed "AI" tag.

Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.

### The vocabulary: one name per object

Decided 2026-11-15 by the house style run (G1). Use these words in every screen, all six catalogues, docs and reports. The i18n keys kept their names; their values follow this table.

| Object | The word | Not |
|---|---|---|
| A place the traveller keeps for later | **Saved** (verb: Save) | Shortlist, favourites, Keep, Kept |
| The traveller's own trips | **My trips** | Your trips |
| Trip states | **Upcoming**, **Planning**, **Past** | Coming up, Being planned |
| Trips the app made | **Ready-made trips** | the app's own trips, ready-made routes, guides |
| Explore's places area | **Places** (the tab itself is **Explore**) | Destinations |
| A figure the app does not have | **Not yet** | Price on request, Unknown, Not yet measured |
| The unit in lists | **A day, a person** (said once, in the column head) | bed and food for one person a day |
| The unit switch | **Per person** / **Whole group** | |
| Who travels | **People** | Travellers, Who, party |
| How the traveller spends | **Lifestyle** (stay and food style inside it) | How you'll spend |
| The quality figure | **Score** (out of 10) | rating, match %, stars |
| Getting to the place | **Getting there** | travel, transport to |
| The AI | **Ask** (with the boxed "AI" tag) | assistant, copilot, chat |

## The interaction promise

The app feels alive because it answers the traveller, not because it performs (`DESIGN.md` "Interaction"). Every selection, toggle, add, save, step and screen change has a designed response from one system: the control the finger touched gives a small spring, the chosen thing is painted in umber, a figure the traveller changed rolls to its new value once, a sheet follows the finger. On a phone that supports it, a commit gives a short haptic tick, with a "Vibrate on tap" setting. Motion never delays the task, never moves a price the traveller did not change, never plays at first paint, and under reduced motion shows the end state at once.

## Three angles

Every screen is designed and checked at three angles: phone (390 x 844, holding down to 360 with no horizontal scroll), tablet (820 x 1180 portrait and 1180 x 820 landscape, its own layout, never a stretched phone or a cramped desktop) and desktop (1440 x 900, and 1920). Touch and pointer both work everywhere; hover is never the only way to anything.

## Accessibility

These are not optional and are not announced in the UI.

- **Touch.** Every control is at least 44 by 44 px (`--tap`), including icon-only buttons; segmented buttons are 44 px high. Bottom-nav labels shrink before they truncate in the longest translations.
- **Contrast.** Every token pair the product uses as text clears WCAG AA 4.5:1, every mark and control edge 3:1; the ratios sit next to the tokens in `continent-app/src/styles/01-tokens.css` and `scripts/ci/token-contrast.mjs` checks them. Text never sits on a photo or on the relief's contours. Minimum text is 12 px.
- **Colour is never the only carrier.** A kind always has its pictogram and its word; a cost part its icon; a state its words.
- **Step-free** (owner, 2026-11-12, T433-n). The planner's step-free answer shortens walks; it never claims a place is step-free unless D21's facts say so.
- **Focus and keyboard.** Visible focus on every interactive element (a 3 px umber ring with an offset). Every `aria-modal` overlay traps focus and closes on Escape. Navigation is a real `<a>`, actions a real `<button>`, one `h1` per view.
- **Motion.** `prefers-reduced-motion: reduce` shows every end state at once. Motion animates transform and opacity only. No parallax, no scroll-triggered counters. Changing figures are announced once, politely, with the full value.
- **Language.** The document language follows the chosen UI language. Strings go through i18n keys, never concatenation.
- **Single theme.** The app is light-only; `theme-color` is the ground. Do not add a dark mode as a side effect of another task.

## Positioning

Every travel product shows a price; the app shows what the whole day costs, honestly. Each neighbouring category beats it on one axis and none can say the second half: route and trail products (Komoot, AllTrails) do not price the town the walk starts from; journey planners (Rome2Rio, Omio) price the leg but not the stay; flight discovery (Skyscanner, Google Flights) does not know what a bed and a day cost; itinerary planners (Wanderlog, TripIt) start from whatever the user types in; Google Maps is the best at getting there and knows neither what a bed costs nor how to build a trip; ViaMichelin prices the car leg (fuel, tolls, vignettes) and nothing else, no bed and no day. The app sits where cost and logistics meet, and hands over to the maps app at the last step.

## Operating context

A traveller plans at home or on the move, mostly on a phone: browsing places by what a day costs, saving a few, comparing them on the map, then turning one into a multi-city trip and its days. Acquisition is organic search on honest item and coverage pages; at about €0.17 of allowable spend per visitor no paid channel fits (`docs/GTM-ACQUISITION-CONSTRAINT.md`). Public opening Tuesday 9 March 2027, launch campaign Tuesday 4 May 2027 (`ROADMAP.md` sections 4 and 16). Success in the first year (owner, 2026-10-13): travellers buy Trip Passes, visitors arrive from search, and travellers trust the figures enough to save trips and come back. The admin Overview is where these are read (`docs/LAUNCH-METRICS.md`); visitors and priced-trip completions have no instrument yet.

## Evidence on hand

Real: the catalogue (`app_data/app_data.json`, read `meta` for counts), per-region coverage (`continent-app/public/coverage.json`), licensed photography with author and licence (`docs/tos/data_licenses.md`), the provenance on every receipt, share cards from `continent-app/scripts/og`. Absent, and never to be fabricated: testimonials, user counts, press, partner logos.

## Where the facts live

| Fact | Source of truth |
|---|---|
| The look: tokens, type, shape, graphics, motion, layout | `DESIGN.md`, tokens in `continent-app/src/styles/01-tokens.css` |
| Design rules a session applies, and the pre-ship questions | `.claude/skills/carta-design/SKILL.md` and its `references/` |
| Why the house style is what it is | `docs/decisions/0012-house-style.md` |
| General craft practice for any visual task | `docs/design/craft-guide.md` |
| Pass pricing | `continent-app/src/lib/pricing.js` TIERS |
| Catalogue size and schema | `app_data/app_data.json` `meta`, `docs/SCHEMA.md` |
| Provenance chain | `docs/1.CARTA.md` |
| Ground fare model | `docs/ESTIMATION.md` |
| Flight prices | `docs/SCHEMA.md` "Flight prices", `docs/PIPELINE.md` "Flights" |
| Licences and credits (data, photos, fonts) | `docs/tos/data_licenses.md`, `docs/tos/fonts.md` |

Last reviewed: 2026-11-15 (house style run, foundation lane: full rewrite, vocabulary, interaction promise, three angles; business facts moved, not changed). Earlier 2026-11-12 (owner decisions run), 2026-10-13 (T420) and 2026-10-01 (T195).
