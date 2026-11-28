# Viantra brand

What Viantra promises, who it talks to, how it sounds and how it looks at first sight. This file owns the promise, the positioning, the voice and the brand lines. `PRODUCT.md` owns the product truth (users, jobs, number rules, banned words, the vocabulary); `DESIGN.md` owns the look (tokens, components). When they disagree on voice, this file wins; on a fact about the product, `PRODUCT.md` wins.

Master language: English. The other five languages follow it, written by a native speaker, not translated word for word.

## The promise

**Tell us what you love. We'll show you Europe.**

The "only" sentence, for us, not for the page: Viantra is the only Europe trip planner that shows what a day costs in each place, the bed and the food, before you book anything.

## Who it is for

Everyone travelling in Europe, on any budget. Viantra is a tool to explore with:
- **Every way of planning:** a ready-made trip, planned day by day; a route or road trip built yourself; or no plan at all, only the urge to explore.
- **Every interest:** hikers, beach families, cyclists, food lovers, city breakers, each looking for spots that fit what they like.
- **Every budget:** from the student counting every euro to the traveller who books the 5-star hotel.
- **Before and during the trip:** choosing where to go, or already there and planning tomorrow.

What they share: they want to see what a place is like and what the days there cost, before they go and while they are there. Cost is what sets Viantra apart, not the only reason to use it.

## Where we sit

What these travellers use today, and what each one misses:

| They use | It is good at | It does not tell them |
|---|---|---|
| A spreadsheet and a few blogs | Their own numbers | What a day costs in a place they have not been |
| Skyscanner, Google Flights | The cheapest fare | What the bed and the food cost once they land |
| Booking.com, Airbnb | The bed | The food, the day, the next town |
| Google Maps | Getting there | What anything costs, or how to build a trip |
| Wanderlog, Polarsteps, TripIt | Organising a trip they already chose | Which place their budget fits |
| Komoot, AllTrails | The walk | The town the walk starts from |
| Rome2Rio, Omio | The leg | The stay |
| ViaMichelin | The car leg: fuel, tolls, vignettes | The bed and the day |

Viantra starts one step earlier: explore the places that fit you, see what the days there cost, then plan the trip, or let it be planned. None of about 14 competitor home pages read on 2026-11-26 shows a cost per day. "One app for everything" is already said by most of them, so we never say it.

## Brand lines

| Where | Line |
|---|---|
| Home headline | Tell us what you love. We'll show you Europe. |
| Budget filter, ads for budget travellers | Tell us your budget. We'll show you Europe. |
| Under the headline, page title, share text | Your way through Europe, priced. |
| Tagline (next to the logo, footer, social bio) | Wander more, worry less. |
| Map first screen and place pages | Choose where. We'll tell you what it costs. |
| Ads, social posts, the step after a flight is chosen | Booked the €19 flight? Good. Now the hard part. |
| Later, once a whole-trip budget exists | Where can €500 take you? |

Rules for the lines:
- **Every line is true today.** The home headline works because the map filters by interest (trails, beaches, lakes, trip style); the budget line works because it filters by a budget a day. "Where can €500 take you?" waits for a whole-trip budget.
- **A number in a line is a real number.** The €19 in an ad is a fare we saw; a figure on a share card is that trip's figure.
- **The day figure is the bed and the food.** No line may suggest it includes the flight, local transport or tickets.
- The home headline and the €19 hook go into a five-second test (plan step C2) before page 1 is signed off. If the test says otherwise, the test wins.

## Voice

Direct, warm and a bit cheeky. We talk to you, not about travellers. You do the fun part; we do the sums.

- **Talk to one person.** "Tell us your budget", not "Travellers can set a budget".
- **Two beats.** You, then us: "Choose where. We'll tell you what it costs."
- **Name the money.** "€19", "€500", "a day": real amounts beat the word "price".
- **Cheeky about the travel industry, never about the traveller.** Cheap flights can "fool you"; a traveller is never silly for falling for one.

The voice by moment:

| Moment | Sound | Before | After |
|---|---|---|---|
| First visit | Confident, a little playful | A cheap flight is not a cheap trip. | Tell us what you love. We'll show you Europe. |
| Browsing the map | Helpful, quick | Narrow the map: budget, country, rating, trip style | Choose where. We'll tell you what it costs. |
| A figure | Plain, exact | (no change: the number speaks) | €62 a day |
| Nothing fits | Kind, with a way out | No place fits | Nothing fits that budget yet. Stretch it a little? |
| An error | Calm, one fix | Something went wrong. | That didn't load. Try again. |
| Sharing a trip | Proud, inviting | Shared trip | I worked out what this trip costs. Your turn. |

The mechanics (length, sentence case, no dashes, no emojis, the banned words, one word per object) and the honesty rules are in `PRODUCT.md`, because code checks them.

## The name

**Viantra**, said vee-AN-tra: *via* (the way) and *tra* (Italian for between, through), "the way through" (`docs/decisions/0018-name-viantra.md`). Clearance search and filing are owner steps (`docs/owner/accounts-and-signups.md`).

## The logo

**Gate V**: an arch whose opening is a V, the way through. Wordmark in Fraunces (SIL OFL 1.1), opsz 144, weight 600, SOFT 100. Every file and where it goes: `continent-app/brand/viantra/README.md`.

- The mark is terracotta, lighter on dark grounds; the exact values are in `continent-app/brand/viantra/svg/colours.md` and `DESIGN.md` ({colors.brand-mark}).
- The arch is the brand sign: the header, the app icons, the share cards, the PDFs and the press kit. The blaze (the painted path mark) stays in the app as a UI mark for "chosen" and "here", never as the logo.

## Colour

Two calm colours and one that pops.
- **Calm:** stone, the ground, and ink, the text. Quiet, so the photographs and the figures carry the warmth.
- **The pop:** terracotta, and only terracotta: the logo, the main action, links and every chosen thing. Because it is the only colour, it always means "this one" or "do this".
- **Everything else is ink:** delete, warnings, best value and money owed say what they are in words, an icon, an outline or a sign, never a second colour.

The values and contrast live in `DESIGN.md` (generated from `continent-app/src/styles/01-tokens.css`); this file only tells the story.

## Boilerplate

- **One line:** Viantra shows what a day costs across Europe, then plans the trip.
- **Store subtitle:** Your way through Europe, priced.
- **Press, 50 words:** Viantra is a Europe trip planner to explore with. Tell it what you like and what you can spend, and it shows the places that fit, with what a bed and a day's food cost in each. Plan the route and the days yourself, a road trip included, or let Viantra plan them for you. It sells no travel and takes no booking.

## Where else

- Market, launch language options and the old name checks: `docs/brand/POSITIONING.md`.
- The research behind this file: `docs/research/2026-11-26-brand-system-toolkit.md`.
