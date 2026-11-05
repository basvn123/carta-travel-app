# Carta positioning, one page (draft)

Draft by T1060 (ROADMAP K1) on 2026-11-05, for the owner to decide. It restates `PRODUCT.md` (the durable product truth) for launch and adds the checks K1 asks for: name, domains, handles, market and assets. K-R1 (5 to 8 traveller interviews) should test the words below before anything is printed; where the interviews disagree, they win.

## Who it is for

People who start from "what can I afford", planning a trip inside Europe: students, young workers, families on one income. The first sentence is said to hikers: someone who travels to a town to walk from it for a day or a weekend.

## The problem

A cheap flight is not a cheap trip. Flight search shows the ticket; the bed, eating out and daily living at the other end are where the budget breaks, and the traveller finds out late. Planning the rest means stitching five apps together.

## The promise

**Carta shows what a day costs in every place it knows, then plans the whole trip in one place.**

Short form, for a subtitle or a store line (owner, `PRODUCT.md`): a cheap flight is not a cheap trip; Carta shows what the days there cost.

## Three proof points the app backs today

1. **A day figure per place.** A bed plus food and drink per person per day, for every place in the catalogue, the same figure on the card, the receipt and the planner (HANDBOOK, Prices). Local transport is not in it yet, so no copy may say it is.
2. **Flight, bed and days in one total.** The flight is Google Flights' price with its airline, times and check time; the ground is Carta's; the planner adds them city by city and day by day (HANDBOOK, Prices and Planning).
3. **A rating that says why.** Every place carries a 0 to 10 score built from appeal, beauty, depth and recognition, with the parts shown (HANDBOOK, Scores).

No user counts, testimonials, press or partner logos exist, and none may be implied.

## What Carta is not

- Not a booking site: it takes no commission on travel and hands over to the operator.
- Not a navigation app: every day ends with "Open in Google Maps".
- Not free forever: planning is free; a Trip Pass adds exports, more saved trips and more AI plans.
- Not a flight seller: the flight price is Google Flights', shown as theirs.

## Where it sits

Read from each product's own home page on 2026-11-05. None of the readable ones shows a daily bed plus food cost per destination, which is the gap Carta's promise fills.

| Product | Its own line | Daily cost per place |
|---|---|---|
| Wanderlog | "One app for all your travel planning needs" | No (a budget and expense splitter) |
| Polarsteps | "One travel app for all your adventures" | No |
| Komoot | "Explore beyond the map" | No |
| Rome2Rio | "Discover how to get anywhere" | No (transport only) |
| Mindtrip | "Travel that gets you." | No (flight and hotel alerts) |
| Layla | AI trip planning with a human expert | No (a per-night minimum, not a per-place cost) |
| TripIt, Skyscanner | itinerary organiser; flight search | No (pages only partly readable) |

Sources: wanderlog.com, polarsteps.com, komoot.com, rome2rio.com, mindtrip.ai, layla.ai, tripit.com, skyscanner.net.

## Launch market and language (decision K-a)

| Option | For | Against |
|---|---|---|
| **A. Belgium and the Netherlands, Dutch and English** (the roadmap's default) | The owner's own market and language; small enough to reach by hand; Ryanair and Transavia from BRU, CRL, EIN and AMS fit the cheap-flight story | Small search volume |
| B. English first, Europe-wide | Biggest search volume; every page already exists in English | Hardest SEO competition; no home advantage |
| C. Belgium and the Netherlands, then Germany | A large hiking audience close by (not measured here; K-R1 can check) | German copy and SEO need native review first |

**Recommendation: A**, with English pages indexed from day one so search can find them, and the UK next as the roadmap says. K-R1 interviews should be with Dutch-speaking travellers.

## Name check (2026-11-05, read-only searches)

**Trademark registers could not be read automatically** (TMview, EUIPO eSearch and the BOIP register are JavaScript-only or refused). Run these by hand before spending anything on the brand:
- TMview, https://www.tmdn.org/tmview/: query `carta`, offices EM, BX and WO, Nice classes 9, 39 and 42, status filed and registered, once "exact" and once "contains".
- EUIPO eSearch, https://euipo.europa.eu/eSearch/: the same, classes 9, 39 and 42.
- BOIP, https://register.boip.int: `carta`, classes 9, 39 and 42.

What public search did show:
- **Carta, Inc.** (the cap-table software company) holds US CARTA marks in classes 9 and 42 and is well funded. A real opposition risk if Carta files in 9 or 42. Lower risk in 39 (travel).
- **carta.app** is restaurant menu and reservation software: close to class 42 or 43.
- **CARTA** is also the Chattanooga transit agency's name and trip planner (US only): low EU risk, but it competes in app store search.
- Karta GPS (offline maps) sounds close. carta.eu is a German PR agency (no risk).
- No travel planner named exactly Carta turned up, and no EU or Benelux CARTA mark in class 39 appeared in search results. That is not proof none exists.

**Read:** filing "Carta" alone in class 39 may be possible; filing in 9 or 42 invites trouble from Carta, Inc. A word plus logo mark ("Carta Europe Travel") in class 39 is the cheaper, safer route. Decide after the TMview search.

**Domains:** carta-europetravel.com is live (Cloudflare). carta.travel and cartatravel.com are parked (cartatravel.com looks for sale), carta.eu and carta.app are in use, getcarta.app looks free (registry says not found). Nothing was bought or reserved.

**Handles:** @carta is taken on X and TikTok. @cartatravel and @cartaeurope look free on X and TikTok (not found, which a suspended account would also show). Instagram could not be read without signing in: check instagram.com/cartatravel and /cartaeurope by hand.

**If the name has to change**, three candidates with the same quick checks (trademark search still to run by hand):
- **Etapa**: a stage of a journey in Spanish and Portuguese, close to the French étape and the Dutch and German Etappe; fits hikers. etapa.travel and etapatravel.com have no DNS records; @etapatravel looks free on X and TikTok. The strongest of the three.
- **Tappa**: Italian for a stage; short, but "tap" reads as a bar in Dutch.
- **Viatica**: from viaticum, Latin for travel money, which fits the cost promise; harder to say.

## Assets

Already in the app: `continent-app/public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon-maskable.svg`, `manifest.webmanifest`, and `public/og/site.png` (the share card), with per-page share cards generated by `continent-app/scripts/og/`. There is no press-ready logo file (wordmark plus mark, SVG, on light and dark).

Press kit shot list, to take after the P1 visual work (phone 390 px and desktop 1440 px each):
1. Home, first screen.
2. Explore, a row list with day figures.
3. A place page with its day figure and rating.
4. The rating sheet open.
5. The trip planner with a multi-city route and its total.
6. A day plan, hour by hour.
7. A trail page.
8. The receipt for one place (the flight, the bed, the days).

## Decisions for the owner

- **K-a:** launch market and language (recommended A).
- **Name:** run the three register searches above; keep Carta (class 39, word plus logo) or switch before any spend.
- **Handles:** claim @cartatravel (or the chosen name) on Instagram, TikTok and X; that needs your own accounts.
- **K-b:** waitlist reward (the roadmap's default: a free Trip Pass at 3 referrals, the founding yearly price at 10), unchanged by this draft.
