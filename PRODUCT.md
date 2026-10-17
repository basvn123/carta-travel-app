# Carta, the product in one page

<!-- impeccable:product-schema 1 -->

Read this before DESIGN.md and before any task that touches a screen, a string or a number the traveller sees. It is the durable product truth: who Carta is for, what they are doing when they use it, how it speaks and what it owes them. CLAUDE.md points here so every session starts from the same facts instead of guessing them.

DESIGN.md holds the tokens. This file holds the reasons the tokens look the way they do.

## Platform

web. One web app (Vite + React, installable as a PWA) is also packaged for the App Store and Play Store as a wrapper of the same app (owner decisions 2026-10-02 and 2026-10-13), so there is one design language, the web's.

## What Carta is

Carta is a price transparency tool for budget travel in Europe: for people who start from "what can I afford", it says what a day costs, per person, in every place in its catalogue, and marks every estimate as one.

Every travel product shows a price. Carta shows what the whole day costs, honestly. A bed and a day of eating out are priced at the town's own rates where they were measured there; a figure that stands in for a town not yet measured carries the estimate mark (`~€87 est.`). The method stays in the data, not on the page (owner decision 2026-10-13, T438: no method sentences, no catalogue counts, no coverage notes as page furniture). The same figures carry through unchanged from the Explore card to the destination receipt, the multi-city planner and the hour-by-hour day planner, so no two screens can disagree about what dinner costs. Around the towns sit walking routes, beaches, lakes, summits and cycling routes, each with a page, and where a region is empty the page says so in one line rather than showing a blank grid. Carta takes no booking and no commission on travel; it prices, plans and hands the traveller to the operator. (Positioning from T201, in full in `Execution/P12/T201-positioning.md`. The counts are the 2026-10-02 measurement; read `meta` for today's.)

A price transparency tool for budget travel in Europe. Carta prices the ground for every destination in the catalogue: the bed, food and local transport, per person per day. It does not price flights. A traveller who has a fare types in what they paid, and only then does the full-trip total include the flight, as their own figure. Carta then plans the trip city by city and each day hour by hour, and it marks the figures that are estimates.

The catalogue is master data in `app_data/app_data.json` and grows with every ingest (3,868 destinations in 43 countries on 2026-10-01; do not copy that figure into UI, read `meta` instead). The app is Vite + React in `continent-app/`, served as static JSON from a CDN. Nothing on the map is live-searched; everything is precomputed by the pipeline and cached.

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

Every ground cost follows one chain: a real harvested figure first, then a cached third-party figure, then a model estimate, and never a blank. Ground costs are the bed, the food, the local transport and the airport transfer. Each step is labelled for what it is. A harvested figure shows its source and age. A cached figure carries its expiry. An estimate is prefixed with a tilde, tagged "est." and never dressed up as a bookable price. Every external booking link warns that prices may have changed.

Carta does not price flights (owner decision, 2026-10-02). No fare harvest has been live since 2026-10-01, and none is planned. The only flight figure in a total is one the traveller typed in, labelled as theirs. No screen shows or sums a flight figure of Carta's (T273 removed the last of them), so no flight carries a tilde or "est." any more. The tilde and "est." stay for every other estimate.

The product's only real asset is trust in its numbers. Every visual and copy choice follows from that.

## Brand voice

Carta should sound like an instrument, not a brochure. Reference world: rail timetables, boarding passes, departure boards, itemised receipts, survey maps. When a copy decision is open, ask what a well made timetable would say.

Plain, specific, verb first. Every headline carries a verb the traveller recognises or a number. "What the whole trip actually costs" works; "Everything the price tag usually hides" could sit on any product and so does not.

Say less (owner, 2026-10-13). Every sentence on a page earns its place for the traveller. A figure they need beats a claim; a method note, a coverage statement or a catalogue count ("3,855 places") is not page furniture.

Honest, in its own voice. An estimate is marked as one; Carta does not price flights; when the AI is off, the app says it is off. Carta has no testimonials.

Sentence case everywhere. No terminal punctuation on labels, buttons or headings; helper text and body copy take full stops. Contractions are fine. Active voice. A button that says "Save trip" produces "Trip saved."

Errors say what happened and what to do, in one sentence, with no apology and no "Error:" prefix. Empty states are an invitation, not an apology: name the space and give the action.

No em dashes and no en dashes, anywhere, ever: a comma, a colon or two sentences instead. `stripDashes()` in `continent-app/src/lib/format.js` enforces this at build time on every shipped string, and the rule applies equally to source, docs and reports. Middle dots and bullet characters as separators are banned too.

Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.

## Visual brand commitment

Decided by the owner on 2026-10-13 (T419), after two rounds of invented visual worlds were refused: Carta looks like a top-tier travel app, measured against Airbnb, Polarsteps and Wanderlog. Photography leads, the feel is warm and inviting, and the craft bar is theirs. Carta's own mark on that familiar structure is the honest price line under every photo. The chosen rendition is "Lagoon" (white surfaces on a warm light grey, blue-grey ink, sun yellow for best value); on 2026-10-13 its teal became one warm brown, so the app has two base colours, the ink and the brown (T438); its direction contract is in `continent-app/.impeccable/surfaces/continent-app.md`, and its tokens land in DESIGN.md from T420. The voice above (plain, specific, short) is unchanged; only the look moves from instrument to inviting.

## Positioning

Carta plans any trip in Europe, with honest prices (owner, 2026-10-17, T462): find a place, see what a day there costs a person, plan the trip and each day of it, and share it. The home page leads with that sentence; the hiker stays the first audience the product's defaults serve. Every travel product shows a price; Carta shows what the whole day costs, honestly (T201, `Execution/P12/T201-positioning.md`; restated 2026-10-13 when the method left the page, T438). Each neighbouring category beats Carta on one axis and none can say the second half: route and trail products (Komoot, AllTrails) do not price the town the walk starts from; journey planners (Rome2Rio, Omio) price the leg but not the stay; flight discovery (Skyscanner, Google Flights) does not know what a bed and a day cost; itinerary planners (Wanderlog, TripIt) start from whatever the user types in (T202).

## Operating Context

A traveller plans at home or on the move, mostly on a phone: browsing places by what a day costs, saving a few, comparing them on the map, then turning one into a multi-city trip and its days. Their inputs (dates, people, lifestyle, origin) stay visible and change the figures in place. Carta hands them to operators for booking and warns that prices may have changed. Acquisition is organic search on honest item and coverage pages; at about €0.17 of allowable spend per visitor no paid channel fits (`docs/GTM-ACQUISITION-CONSTRAINT.md`). Launch is set for 4 May 2027 (`Roadmap/Carta roadmap.md`).

Success in the first year, as the owner states it (2026-10-13): travellers buy Trip Passes, visitors arrive from search, and travellers trust the figures enough to save trips and come back. The admin Overview is where these are read (`docs/LAUNCH-METRICS.md`); visitors and priced-trip completions have no instrument yet.

## Evidence on Hand

Real: the catalogue (`app_data/app_data.json`, read `meta` for counts), per-region coverage (`continent-app/public/coverage.json`), licensed photography with credits (`docs/tos/data_licenses.md`), the provenance sentences on every receipt, share cards from `continent-app/scripts/og`. Absent, and never to be fabricated: testimonials, user counts, press, partner logos, live flight fares.

## Product Principles

Carta prices and plans; it never sells. No booking, no commission on travel, no flight pricing: it hands the traveller to the operator (owner-confirmed 2026-10-13).

## Accessibility constraints

These are not optional and are not announced in the UI.

Touch. Every control is at least 44 by 44 px (`--tap`), including icon-only buttons whose glyph is 15 px. Phones are first-class: the layout holds down to 360 px wide with no horizontal scroll, and bottom-nav labels shrink before they truncate in the longest translations.

Contrast. Body text is `--ink` on `--paper`. Secondary text is `--ink-soft`; `--ink-mute` is for metadata at small sizes and never for body copy. Every token pair the product uses as text or fill clears WCAG AA 4.5:1, and the ratios are written next to the tokens in `continent-app/src/styles.css`. Ratings use ochre, not the action red, so a measure is never read as an alarm.

Colour is never the only carrier. The place-kind hierarchy is an ink-density ramp so it survives greyscale and colour-blind viewing. Estimates carry a tilde and "est." in text, not only a colour. Good news in data (`--green`) and destructive actions (`--danger`) are each backed by words.

Focus and keyboard. Visible focus on every interactive element, `outline: 2px solid var(--accent)` with an offset. `outline: none` is never shipped without a replacement. Every `aria-modal` overlay traps focus through `useFocusTrap` and closes on Escape. Navigation is a real `<a>`, actions are a real `<button>`, headings stay in order with one `h1` per view.

Motion. `prefers-reduced-motion: reduce` is honoured on every transition and animation. Animations stay under 300 ms and animate only transform and opacity. No parallax, no scroll-triggered counters, no bounce. The home page carries the one owner-approved exception (T462, T463, DESIGN.md "Home page exception"): a pinned phone of real app captures whose screen crossfades to the chapter in view, and sections that may reveal once; reduced motion swaps and shows at once.

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
| Fare model | `docs/ESTIMATION.md` |
| Licences and credits | `docs/tos/data_licenses.md` |

Last reviewed: 2026-10-13 (T420, impeccable init on the legacy file; earlier 2026-10-01, T195).
