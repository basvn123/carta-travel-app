# The product in one page

<!-- impeccable:product-schema 1 -->

The product truth: who it is for, the number rules, the principles, the voice mechanics and the vocabulary. `BRAND.md` owns the promise and tone, `DESIGN.md` the look. Say "the app", not the name.

## Platform

web

One web app (Vite, React, PWA), also wrapped for the App Store and Play Store.

## Product purpose

A trip planner to explore Europe with: find the places that fit what you like, see what a day there costs (the bed and the food, before anything is booked), then plan the trip yourself or have it planned. A cheap flight is not a cheap trip, so the flight, the bed and the days add up to one total.

- **Ground prices** for every place in the catalogue, a person a day. Local transport and tickets are not in the day figure yet, and no copy may say they are.
- **Google Flights' price** for the flight, with airline and times; a fare the traveller types replaces it.
- **Plans** city by city and hour by hour; the same figure carries from Explore to the receipt, the trip and the day planner.
- **Walks, beaches, lakes, summits and cycling routes** around the towns, each with a page.

Six languages (English, Dutch, French, German, Spanish, Italian) on every surface. Never copy a catalogue count into the UI (read `meta` in `app_data/app_data.json`).

## Users

Everyone travelling in Europe, on any budget:
- **Every way of planning:** ready-made, built yourself, or no plan at all.
- **Every interest:** hikers, beach families, cyclists, food lovers, city breakers, car-free travellers, trail runners.
- **Every budget:** from the student counting every euro to the 5-star traveller. The tone is never luxury.
- **Before and during the trip:** choosing where, or already there and planning tomorrow.

They find the place that fits, then compare many prices for one set of inputs (origin, dates, people, Lifestyle).

- Inputs stay visible; figures update in place and line up in columns.
- Whole euros where places are compared; cents on every receipt and total.
- About ten places per phone screen in a list; big photo cards only on rails.
- A month without dates starts on its cheapest week (the cheapest flights there and back), else its first Saturday.

## The number rules

Every ground cost follows one chain: harvested, then cached third party, then a model estimate, never a blank (`continent-app/src/lib/price/` stores each with source and date). The traveller sees one amount and its unit; a tap lists what is in it. **Coverage first:** measured sources (the Google Flights sweep, Airbnb, hostels, food prices) cover as many places as possible, model estimates as few as possible (ROADMAP D10).

- A missing figure is **"Not yet"**, outside every sum.
- A total is the engine's total; a "Rounding" line closes any gap.
- Every euro goes through `formatMoney()` (`continent-app/src/lib/money.js`).
- A saved trip keeps its stay and Lifestyle; settings apply to new trips.
- A beach shows the worst bathing class of its test sites.
- **Flights, in order:** the traveller's fare; Google Flights' (live in the planner, or the sweep for that day or within 4 days, showing its date); beyond the sweep a typical fare, labelled "Typical for this route, not for your dates"; then nothing. Freshness: `flights.max_age_days` in `config/pricing.json`. Bag fees are estimates, and the traveller's bag is always priced.
- Every booking link says prices may have changed.

## Product principles

1. **Prices and plans, never sells:** no bookings, no ranking by earnings; some links pay a small fee at no cost to the traveller.
2. **Never navigates:** every day ends in "Open in Google Maps", never "Navigate".
3. **Free for now:** no screen offers a pass (`PASSES_ON = false` in `lib/pricing.js`, ROADMAP I-g); AI plans keep the server's allowance and a spent one is said, not sold. Never "free forever".
4. **Private by default:** Notes documents stay on the device; an imported booking is read once and not stored.
5. **Every function stays:** a visual change never removes a feature or changes what a button does.
6. **Say less:** every sentence earns its place; the unit once.
7. **Honest claims:** never call a place step-free unless D21's facts say so; no testimonials, user counts, press or partner logos.

## Voice

Tone: `BRAND.md` (human, catchy, short, clear). Figures and labels stay plain and exact. The mechanics, several checked in code:

- Headlines under ten words; labels and buttons two or three.
- Sentence case. Labels and buttons take no full stop; a two-beat line keeps its stops ("Choose where. We'll tell you what it costs.").
- Errors: one calm fix, no apology ("That didn't load. Try again."). Empty states offer a way out.
- The flight price is Google Flights'.
- **No em or en dashes** anywhere, docs included (`stripDashes()` in `continent-app/src/lib/format.js`); ranges use "to". No middle dots, no emojis, no AI sparkle.
- Banned words: seamless, unlock, effortless, elevate, leverage, empower, curated, simply, just, easy.

### Vocabulary

One word per object, on every screen, in all six languages and in docs.

| Object | The word | Not |
|---|---|---|
| A place kept for later | **Saved** (Save) | Shortlist, favourites, Keep |
| The traveller's trips | **My trips** | Your trips |
| Trip states | **Upcoming**, **Planning**, **Past** | Coming up, Being planned |
| Trips the app made | **Ready-made trips** | guides, ready-made routes |
| Explore's places | **Places** (tab: **Explore**) | Destinations |
| A missing figure | **Not yet** | Unknown, Price on request |
| The unit in lists | **A day, a person** | bed and food for one person a day |
| The unit switch | **Per person** / **Whole group** | |
| Who travels | **People** | Travellers, party |
| How they spend | **Lifestyle** | How you'll spend |
| The quality figure | **Score** (out of 10) | rating, stars, match % |
| Getting to the place | **Getting there** | transport to |
| The AI | **Ask** (boxed "AI" tag) | assistant, copilot, chat |

## Operating context

Mostly on a phone: browse by what a day costs, save a few, compare on the map, turn one into a trip. Growth is organic search; no paid channel fits (`docs/GTM-ACQUISITION-CONSTRAINT.md`). Public opening 9 March 2027, campaign 4 May 2027. Success: visitors from search, trips saved and revisited (`docs/LAUNCH-METRICS.md`). Live at carta-europetravel.com until the Viantra domain (owner step K1-a).

## Where the facts live

- Promise, voice, logo: `BRAND.md`
- The look: `DESIGN.md`, part specs in `docs/design/components.md`, rules in `.claude/skills/carta-design/`
- Provenance chain: `docs/1.CARTA.md`; fare model: `docs/ESTIMATION.md`; catalogue and flights: `docs/SCHEMA.md`
- Licences and credits: `docs/tos/`
