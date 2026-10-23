# Carta, the product in one page

<!-- impeccable:product-schema 1 -->

Read this before DESIGN.md and before any task that touches a screen, a string or a number the traveller sees. It is the durable product truth: who Carta is for, what they are doing when they use it, how it speaks and what it owes them. CLAUDE.md points here so every session starts from the same facts instead of guessing them.

DESIGN.md holds the tokens. This file holds the reasons the tokens look the way they do.

## Platform

web. One web app (Vite + React, installable as a PWA) is also packaged for the App Store and Play Store as a wrapper of the same app (owner decisions 2026-10-02 and 2026-10-13), so there is one design language, the web's.

## Mission

The owner's statement (2026-10-20), to reuse wherever Carta explains what it does: a pitch, the home page, a store listing, an about page, a press note.

> Waar traditionele zoekmachines zoals Skyscanner en Google Flights uitsluitend zicht bieden op goedkope vliegtickets, lopen reizigers in de praktijk tegen een financiële muur aan wanneer een ogenschijnlijk goedkope vlucht leidt naar een bestemming met exorbitante kosten voor accommodatie, horeca en dagelijks levensonderhoud. Het fundamentele doel van het platform is het elimineren van deze onzekerheid.

In English: flight search engines such as Skyscanner and Google Flights only show the cheap ticket. In practice travellers hit a financial wall when a seemingly cheap flight leads to a place where the bed, eating out and daily living cost far more than they expected. Carta exists to remove that uncertainty.

Short form, for a subtitle or a store line: a cheap flight is not a cheap trip; Carta shows what the days there cost.

Carta brings everything together: the flight, the bed and the days, in one total. (Owner request 2026-10-21, batch T511-T519, reversing T272.)

When reusing it, keep the voice rules below: no superlatives, no claim Carta cannot back with a figure, and never imply the flight price is Carta's own: it is Google Flights' price, shown as theirs.

## What Carta is

Carta is the one app for planning a trip anywhere in Europe: Stop stitching trips together from five apps. Carta plans the whole trip in one place, with what each day costs. It cuts the coordination and the logistics, replacing the stack of planning tools with one overview. For people who start from "what can I afford", it says what a day costs, per person, in every place in its catalogue, and marks every estimate as one. (Owner, 2026-10-21, T471-b.)

Every travel product shows a price. Carta shows what the whole day costs, honestly. A bed and a day of eating out are priced at the town's own rates where they were measured there; a figure that stands in for a town not yet measured carries the estimate mark (`~€87 est.`). The method stays in the data, not on the page (owner decision 2026-10-13, T438: no method sentences, no catalogue counts, no coverage notes as page furniture). The same figures carry through unchanged from the Explore card to the destination receipt, the multi-city planner and the hour-by-hour day planner, so no two screens can disagree about what dinner costs. Around the towns sit walking routes, beaches, lakes, summits and cycling routes, each with a page, and where a region is empty the page says so in one line rather than showing a blank grid. Carta takes no booking and no commission on travel; it prices, plans and hands the traveller to the operator. (Positioning from T201, in full in `Execution/P12/T201-positioning.md`. The counts are the 2026-10-02 measurement; read `meta` for today's.)

A price transparency and trip planning tool for Europe. Carta prices the ground for every destination in the catalogue: the bed and the food, per person per day. Local transport and tickets are not in the day figure yet (`costIndex.js` sums stay and food); they arrive as their own receipt lines with roadmap 2.14, and until then no copy may say the day figure includes them (roadmap 1.16). For the flight it shows Google Flights' price for the route and day, with the airline, the times, when it was checked and a link to Google Flights; a fare the traveller types in replaces it. Bag fees per airline are Carta's estimates. Carta still sells nothing and takes no commission. Carta then plans the trip city by city and each day hour by hour, and it marks the figures that are estimates.

The catalogue is master data in `app_data/app_data.json` and grows with every ingest (3,868 destinations in 43 countries on 2026-10-01; do not copy that figure into UI, read `meta` instead). The app is Vite + React in `continent-app/`, served as static JSON from a CDN. Nothing on the map is live-searched; everything is precomputed by the pipeline and cached. Flight prices come from a sweep Worker that checks each route on a schedule and publishes per-airport files; only the trip planner searches one day live.

Live at carta-europetravel.com. Six languages: English, Dutch, French, German, Spanish and Italian, on every surface including the PDF, KML and ICS exports.

## Who it is for

The launch speaks to hikers first: the person who travels to a town to walk from it, for a day or a weekend first and hut to hut second (owner-confirmed 2026-10-02, T275; order and reasons in `Execution/P12/T203-audience-order.md`). Then families looking for beaches, cyclists and bikepackers, budget city-break travellers, car-free travellers and trail runners. The people described next are who Carta is for; the hiker is who it says its first sentence to.

People counting money. The core audience is budget-conscious travellers inside Europe: students, young workers, families on one income, retirees on a fixed one, anyone who starts from "what can I afford" rather than "where do I want to go". They fly low-cost carriers from secondary airports, they take the bus from the airport, they sleep in dorms, private rooms and small apartments, and they care about the difference between €24.99 and €25.

They are not a luxury audience and Carta does not pretend otherwise. A premium feel comes from precision and honesty, not from the vocabulary of luxury travel.

Two secondary audiences shape the surfaces: travellers in the planner who already know the destination and want the days and the ground legs priced, and returning users with a saved trip who want to see what changed since last time.

## What they are doing

Comparing dense pricing matrices. The central act is reading many prices at once and finding the cheapest honest option for a fixed set of inputs (origin, dates, group size, lifestyle). That decides the operational context.

The map shows every destination pinned with its total for the traveller's inputs. The receipt itemises one total line by line. The planner prices every leg of a multi-city route by mode. The day planner builds a clock-based day from the POI catalogue. Each is a table of measured numbers first and a picture second.

Prices change meaning with the inputs, so the inputs are always visible and the figures update in place. Numbers must line up in columns and must not jitter when they change. A figure is never rounded to look tidier, with one owner-decided exception (2026-10-13): where many places are compared at once (cards, pins, lists, filters) the day figure is shown in whole euros, and every receipt, total and ledger shows cents.

Density is a feature. The traveller wants to see forty prices on one phone screen and still tell them apart. Whitespace is spent on separating groups, not on making a card feel generous. Owner decision 2026-10-13 (T421): Explore and Destinations open as compact rows with a small photo, so about ten places fit one phone screen; large photo cards are for rails and the home page, where inspiration leads.

## The one rule the numbers follow

Every ground cost follows one chain: a real harvested figure first, then a cached third-party figure, then a model estimate, and never a blank. Ground costs are the bed, the food, the local transport and the airport transfer. Each step is labelled for what it is. A harvested figure shows its source and age. A cached figure carries its expiry. An estimate is prefixed with a tilde and never dressed up as a bookable price (the "est." tag left the screen on 2026-10-22, T590, owner: "keep it simple"; a screen reader says "about"). Every external booking link warns that prices may have changed.

Flights follow their own order (owner request 2026-10-21, batch T511-T519, reversing the 2026-10-02 decision). A fare the traveller typed in comes first, labelled as theirs. Then Google Flights' price: searched live in the trip planner for the exact day and chosen hours, or taken from the sweep for the same day (or the nearest day within 3 days, where the flight shows its own date). Then nothing. A price checked more than 3 days ago is never shown. A flight price is Google Flights' figure, not Carta's estimate, so it carries no tilde; it always shows the airline, the times, when it was checked and a link to Google Flights with "prices may have changed". Bag fees (10 kg cabin, 20 kg checked) are Carta's estimates and carry the tilde and "est." like every other estimate.

The product's only real asset is trust in its numbers. Every visual and copy choice follows from that.

## Brand voice

Carta should sound like an instrument, not a brochure. Reference world: rail timetables, boarding passes, departure boards, itemised receipts, survey maps. When a copy decision is open, ask what a well made timetable would say.

Plain, specific, verb first. Every headline carries a verb the traveller recognises or a number. "What the whole trip actually costs" works; "Everything the price tag usually hides" could sit on any product and so does not.

Say less (owner, 2026-10-13). Every sentence on a page earns its place for the traveller. A figure they need beats a claim; a method note, a coverage statement or a catalogue count ("3,855 places") is not page furniture.

Honest, in its own voice. An estimate is marked as one; a flight price is named as Google Flights', with when it was checked; when the AI is off, the app says it is off. Carta has no testimonials.

Sentence case everywhere. No terminal punctuation on labels, buttons or headings; helper text and body copy take full stops. Contractions are fine. Active voice. A button that says "Save trip" produces "Trip saved."

Errors say what happened and what to do, in one sentence, with no apology and no "Error:" prefix. Empty states are an invitation, not an apology: name the space and give the action.

No em dashes and no en dashes, anywhere, ever: a comma, a colon or two sentences instead. `stripDashes()` in `continent-app/src/lib/format.js` enforces this at build time on every shipped string, and the rule applies equally to source, docs and reports. Middle dots and bullet characters as separators are banned too.

Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.

## Visual brand commitment

Decided by the owner on 2026-10-13 (T419), after two rounds of invented visual worlds were refused: Carta looks like a top-tier travel app, measured against Airbnb, Polarsteps and Wanderlog. Photography leads, the feel is warm and inviting, and the craft bar is theirs. Carta's own mark on that familiar structure is the honest price line under every photo. The chosen rendition is "Lagoon" (white surfaces on a warm light grey, blue-grey ink, sun yellow for best value); on 2026-10-13 its teal became one warm brown, so the app has two base colours, the ink and the brown (T438); its direction contract is in `continent-app/.impeccable/surfaces/continent-app.md`, and its tokens land in DESIGN.md from T420. The voice above (plain, specific, short) is unchanged; only the look moves from instrument to inviting.

## Positioning

The owner's sentence (2026-10-21, T471-b): "Stop stitching trips together from five apps. Carta plans the whole trip in one place, with what each day costs." It says two things at once: logistics (one place for the route, the stays and the days, instead of five apps) and cost (what each day costs). Carta plans any trip in Europe, with honest prices (owner, 2026-10-17, T462): find a place, see what a day there costs a person, plan the trip and each day of it, and share it. The home page leads with that sentence; the hiker stays the first audience the product's defaults serve. Every travel product shows a price; Carta shows what the whole day costs, honestly (T201, `Execution/P12/T201-positioning.md`; restated 2026-10-13 when the method left the page, T438). Each neighbouring category beats Carta on one axis and none can say the second half: route and trail products (Komoot, AllTrails) do not price the town the walk starts from; journey planners (Rome2Rio, Omio) price the leg but not the stay; flight discovery (Skyscanner, Google Flights) does not know what a bed and a day cost; itinerary planners (Wanderlog, TripIt) start from whatever the user types in (T202); Google Maps is the best at getting there and the worst at planning, since it knows neither what a bed or a day costs nor how to build a trip; ViaMichelin prices the car leg (fuel, tolls, vignettes) and nothing else, no bed and no day. Carta sits where cost and logistics meet: what the whole trip costs and how the days fit together, in one plan, handing over to the maps app at the last step. The daily price is a bed plus food and drink; local transport is not in it yet (roadmap 1.16).

## Operating Context

A traveller plans at home or on the move, mostly on a phone: browsing places by what a day costs, saving a few, comparing them on the map, then turning one into a multi-city trip and its days. Their inputs (dates, people, lifestyle, origin) stay visible and change the figures in place. Carta hands them to operators for booking and warns that prices may have changed. Acquisition is organic search on honest item and coverage pages; at about €0.17 of allowable spend per visitor no paid channel fits (`docs/GTM-ACQUISITION-CONSTRAINT.md`). Launch is set for 4 May 2027 (`Roadmap/Carta roadmap.md`).

Success in the first year, as the owner states it (2026-10-13): travellers buy Trip Passes, visitors arrive from search, and travellers trust the figures enough to save trips and come back. The admin Overview is where these are read (`docs/LAUNCH-METRICS.md`); visitors and priced-trip completions have no instrument yet.

## Evidence on Hand

Real: the catalogue (`app_data/app_data.json`, read `meta` for counts), per-region coverage (`continent-app/public/coverage.json`), licensed photography with credits (`docs/tos/data_licenses.md`), the provenance sentences on every receipt, share cards from `continent-app/scripts/og`. Absent, and never to be fabricated: testimonials, user counts, press, partner logos. Flight prices are real but are Google Flights' figures with a check time, never presented as Carta's.

## Product Principles

Carta prices and plans; it never sells. No booking, no commission on travel: it hands the traveller to the operator (owner-confirmed 2026-10-13). It shows Google Flights' price for the flight and links there to book; it sells no ticket (2026-10-21, T511-T519).

Carta never navigates (owner, 2026-10-21, T471-b). No route guidance, no GPS, no turn-by-turn of its own. Carta plans and prices; the traveller's maps app takes them there. Every day and every ride therefore ends in a hand-over to that app, worded "Open in Google Maps" (or "Open Day 2 in Google Maps"), never "Navigate" or "Start route".

Carta is not entirely free, and never says it is. Browsing, both planners, one saved trip, sharing and co-planners (owner T488-b) and GPX are free; a Trip Pass (60 days) or the yearly plan adds every PDF, ICS and KML export, more saved trips, booking import and more AI plans (`lib/pricing.js` TIERS, gates in `hooks/usePaywall.jsx`). The sentence for it is "Planning is free. A Trip Pass adds exports, more saved trips and more AI plans." (`pass.freeSentence`, roadmap 1.15); never "100% free" or "free forever". The pass appears at a paid moment, in Account and on /pricing (T496, T497), and on the home page, where a visitor deciding whether to trust Carta sees the three plans as plain columns (owner decision D9, 2026-10-23, T606).

## Accessibility constraints

These are not optional and are not announced in the UI.

Touch. Every control is at least 44 by 44 px (`--tap`), including icon-only buttons whose glyph is 15 px. Phones are first-class: the layout holds down to 360 px wide with no horizontal scroll, and bottom-nav labels shrink before they truncate in the longest translations.

Contrast. Body text is `--ink` on `--paper`. Secondary text is `--ink-soft`; `--ink-mute` is for metadata at small sizes and never for body copy. Every token pair the product uses as text or fill clears WCAG AA 4.5:1, and the ratios are written next to the tokens in `continent-app/src/styles.css`. Ratings use ochre, not the action red, so a measure is never read as an alarm.

Colour is never the only carrier. The place-kind hierarchy is an ink-density ramp so it survives greyscale and colour-blind viewing. Estimates carry a tilde in text, spoken as "about", not only a colour. Good news in data (`--green`) and destructive actions (`--danger`) are each backed by words.

Focus and keyboard. Visible focus on every interactive element, `outline: 2px solid var(--accent)` with an offset. `outline: none` is never shipped without a replacement. Every `aria-modal` overlay traps focus through `useFocusTrap` and closes on Escape. Navigation is a real `<a>`, actions are a real `<button>`, headings stay in order with one `h1` per view.

Motion. `prefers-reduced-motion: reduce` is honoured on every transition and animation. Animations stay under 300 ms and animate only transform and opacity. No parallax, no scroll-triggered counters, no bounce. The home page carries the one owner-approved exception (T462, widened by T606 on 2026-10-23, DESIGN.md "Home page exception v2"): a film of real places that fills the first screen edge to edge under the header on a flat see-through bar, with the slogan, one line and Ask Carta on it under one even tint (T620, T621; the owner chose no pause control, register T620-a), recordings of the app that play in view, tabs that move on until touched, a route that draws itself once, and sections that arrive once; under reduced motion it all stands still and shows at once.

Language. The document language follows the chosen UI language. Strings are never built by concatenation; they go through the i18n keys so word order survives translation.

Numbers. Prices are formatted through one money formatter on `Intl.NumberFormat` in the reader's locale, whole euros in comparison contexts and cents on receipts, set in the interface typeface with `font-variant-numeric: tabular-nums`, never raw float output. A separate monospaced face for figures is retired (owner decision 2026-10-13, T420); an estimate is written `~€87 est.`.

Single theme. The app is deliberately light-only: there are no `prefers-color-scheme` or `data-theme` blocks, and `theme-color` is `--paper`. Do not add a dark mode as a side effect of another task.

## Where the facts live

| Fact | Source of truth |
|---|---|
| Design tokens | `continent-app/src/styles.css` `:root`, recorded in DESIGN.md |
| Design rules, copy rules, the "never do this" list | `.claude/skills/carta-design/SKILL.md` |
| Pass pricing | `continent-app/src/lib/pricing.js` TIERS |
| Catalogue size and schema | `app_data/app_data.json` `meta`, `docs/SCHEMA.md` |
| Provenance chain | `docs/1.CARTA.md` |
| Ground fare model | `docs/ESTIMATION.md` |
| Flight prices (route list, sweep files, live search) | `docs/SCHEMA.md` "Flight prices", `docs/PIPELINE.md` "Flights" |
| Licences and credits | `docs/tos/data_licenses.md` |

Last reviewed: 2026-10-13 (T420, impeccable init on the legacy file; earlier 2026-10-01, T195).
