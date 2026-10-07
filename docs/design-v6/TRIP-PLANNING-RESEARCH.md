# How people plan leisure trips, and what it means for Carta

Desk research, 7 October 2026. Every number below comes from a page that was opened while writing, linked inline. Where a source is old or covers a market other than Europe, the sentence says so.

Project docs read first: `PRODUCT.md`, `DESIGN.md`, and under `additional docs/Carta/Plan/`: `Data Quality/Travel App UX Blueprint.md`, `Data Quality/carta-trips-enhancement-spec.md`, `Data Quality/carta-destinations-enhancement-spec.md` (Part 4 in full, the rest by heading) and `Frontend Design/Frontend Design Tools Research.md` (headings only). Those already propose a lifestyle control that moves the total, a cost chart, an elevation profile, a day-by-day carousel and the "is this for me, can I do it, how do I get there" order. This file adds the behavioural evidence and what those docs do not cover.

## Summary

Trip planning is long and scattered: hours across many sites, most people undecided on a destination at the start, and a spike of effort right before booking. Value for money is the first reason Europeans give for choosing a place, and weather risk and crowds now shape when they go. Hikers want short to mid-length walks they can reach by public transport, and they trust waymarks over screens. Prices earn trust when the whole cost is shown up front and uncertainty is shown as a range. Dreaming and the trip itself happen on the phone; dense comparison still leans on a laptop.

For Carta this means: let the traveller start without a destination, keep the inputs editable on every screen, show the full day cost with its pedigree before anything else, show estimates as labelled ranges, make the month (weather, crowds) and car-free access first-class filters, and make saving and returning the spine of the product rather than a side feature.

## 1. How people plan: phases, sources and friction

- Google frames the journey as four kinds of moments: dreaming, planning, booking and experiencing, and says preferences are shaped and decisions made in each ([Think with Google infographic, 2016](https://www.thinkwithgoogle.com/_qs/documents/594/travel-infographic-mobile-shapes-customer-journey-c.pdf)).
- In Expedia Group's path to purchase study across seven countries, travellers spent 303 minutes with travel content and viewed 141 pages in the 45 days before booking, rising from about 2.5 page views a day early on to 25 on the day of purchase ([TTG Asia on Expedia Group research](https://www.ttgasia.com/2023/07/27/uncovering-the-path-travellers-take-when-booking-travel-expedia-group/)).
- Nearly three in five travellers (59%) had no specific destination or were weighing several when they started; in the UK it was 62% ([TTG Asia](https://www.ttgasia.com/2023/07/27/uncovering-the-path-travellers-take-when-booking-travel-expedia-group/)).
- The sources they juggle: online travel agencies 80%, search engines 61%, social media 58%, airline sites 54% and metasearch 51%; social media inspires 77% ([TTG Asia](https://www.ttgasia.com/2023/07/27/uncovering-the-path-travellers-take-when-booking-travel-expedia-group/)).
- A 2026 interview study of eight travellers and nine travel agents found constraints and preferences surface and change throughout planning, across 11 distinct actions, so tools that expect fixed goals at step one misfit how people work ([arXiv 2609.26968](https://arxiv.org/abs/2609.26968)).
- Carnegie Mellon's study of browser tabs found people keep tabs open as reminders because "as soon as something went out of sight, it was gone", and about 25% had a browser or computer crash from too many tabs ([CMU, tab overload](https://www.scs.cmu.edu/news/2021/overcoming-tab-overload)).
- 70% of US vacation bookers called booking stress-inducing in YouGov's 2025 report ([YouGov travel stress report 2025](https://yougov.com/en-us/reports/51330-us-travel-stress-report-2025)).
- In Google/Ipsos data from 2015 (US), 85% of leisure travellers decided on activities only after arriving ([Think with Google infographic, 2016](https://www.thinkwithgoogle.com/_qs/documents/594/travel-infographic-mobile-shapes-customer-journey-c.pdf)).
- On holiday, travellers used their phone for maps (67%), restaurants (56%), things to do (51%) and reviews (47%) in TripAdvisor's 2015 TripBarometer of 34,016 consumers ([TripAdvisor TripBarometer 2015](https://tripadvisor.mediaroom.com/2015-06-30-Global-travel-report-reveals-rise-of-the-Connected-Traveller)).
- After the trip, Polarsteps turns the tracked route into a timeline and a printed book; App Store reviewers complain of gaps in tracked routes and no shared planning ([Polarsteps on the App Store](https://apps.apple.com/us/app/polarsteps/id947925763)).

## 2. What travellers rank first

- In a Booking.com survey of 12,900 European travellers (2024), good value for money was the leading factor in choosing a destination for 3 in 5, ahead of natural scenery, good food and warmer weather ([Statista, Booking.com data](https://www.statista.com/chart/amp/32515/influencing-factors-on-european-traveler-destination-decisions)).
- Booking.com's 2026 report (32,500 travellers, 35 countries) found 74% weigh extreme weather risk when choosing both place and timing, and 55% say unpredictable weather makes it hard to know when to go ([Hospitality Net on Booking.com research](https://www.hospitalitynet.org/news/4132046/bookingcom-research-reveals-how-climate-uncertainty-is-reshaping-peak-season-travel)).
- The same report: 42% now plan to travel outside traditional peak months, and 68% are more likely to visit less popular places to avoid crowds ([Hospitality Net](https://www.hospitalitynet.org/news/4132046/bookingcom-research-reveals-how-climate-uncertainty-is-reshaping-peak-season-travel)).
- Among German hikers (Wandermonitor 2024, more than 1,100 respondents), naturalness, scenery and signposting are the three most valued features of a hiking region, and nearly two thirds prefer routes of 5 to 15 km ([Ostfalia, Wandermonitor 2024](https://www.ostfalia.de/en/university/press/press-releases/press-release/23-05-2025_wandermonitor-2024-wandertrend-bleibt-ungebrochen-ansprueche-an-oepnv-und-wanderwege-wachsen-mit)).
- Nearly two thirds of those hikers would use public transport to reach a walk, but a third oppose it, citing poor connections, lack of flexibility and time; a gap of one hour between connections was named as the acceptable maximum. Over three quarters still prefer signposts at junctions for route finding ([Wandermonitor 2024](https://www.ostfalia.de/en/university/press/press-releases/press-release/23-05-2025_wandermonitor-2024-wandertrend-bleibt-ungebrochen-ansprueche-an-oepnv-und-wanderwege-wachsen-mit)).
- Among long-haul visitors to Europe surveyed for the European Travel Commission, the share relying mainly on trains, public transit, walking, cycling or electric transport rose from 13% in 2024 to 18% in 2025, driven by the experience more than by climate concern ([Skift, March 2026](https://skift.com/2026/03/12/europe-travelers-swap-planes-for-trains-but-climate-isnt-the-driver/)).

Read together, the order of need between places is: can I afford it, is it good in my month (weather, crowds), what is there for me, and can I get there and around without a car.

## 3. Patterns that make planning feel visual and in control

- **Price on the map, filtered live.** KAYAK Explore takes an origin, dates, a budget and a maximum flight time, and the price pins on the map change as the sliders move ([KAYAK Explore](https://www.nz.kayak.com/news/explore)).
- **Map discovery by interest and season.** Google's 2021 Explore redesign added smaller cities and national parks, interest filters such as outdoors, beaches and skiing, and a "best time to visit" for each destination ([Google blog, April 2021](https://blog.google/products/travel/helpful-tools-when-youre-ready-travel/)).
- **Maps are not lists.** Airbnb's ranking team found that assumptions built for ranked lists break down for maps, because people browse pins by place and clustering, and had to rank map pins differently ([Learning to Rank for Maps at Airbnb](https://arxiv.org/abs/2407.00091)).
- **Itinerary on a map, by day, with the gaps shown.** Wanderlog lays the trip on a map colour-coded by day, shows time and distance between stops, offers route optimisation, a budget with bill splitting, real-time co-planning and offline download ([Wanderlog](https://wanderlog.com/trip-planner-mobile-app)). A competitor's comparison credits its drag-and-drop map and calls its packing lists unconnected to the itinerary ([Stippl vs Wanderlog, competitor source](https://www.stippl.io/blog/stippl-vs-wanderlog)).
- **The profile carries the route.** Komoot's planner shows a detailed elevation profile and a surface type breakdown, with offline maps ([Komoot features](https://www.komoot.com/features)).
- **Conditions next to the trail.** AllTrails lists over 500,000 trails with ground conditions, weather, air quality and UV index, offline area downloads and saved collections; App Store reviewers complain the elevation graph takes too much screen while recording ([AllTrails on the App Store](https://apps.apple.com/ca/app/alltrails-hike-bike-run/id405075943)).
- **All modes, priced as ranges.** Rome2Rio shows every mode with time and an estimated price; a reviewer notes the ranges can be very wide, driving costs cover fuel only, and the app cannot plan multi-stop routes ([Going, Rome2Rio guide](https://going.com/guides/how-to-use-rome2rio-for-easier-route-planning)).
- **Comparison tables.** NN/g says comparison tables serve decisions between relatively few alternatives (five or fewer), need complete and consistent attributes, sticky headers and a way to highlight differences, and on phones may show two items at a time ([NN/g, comparison tables](https://www.nngroup.com/articles/comparison-tables/)).
- **Maps on detail pages are often missing.** In Baymard's tours research, 57% of sites do not always show a map on the tour details page and 40% lack the filters specific to their industry ([Baymard, travel site UX](https://baymard.com/research-articles/travel-site-ux-best-practices)).
- **What fails.** Generated itineraries can invent places: OECD's AI incident monitor logged tourists sent to a non-existent "Sacred Canyon of Humantay" in the Peruvian Andes ([OECD.AI incident](https://oecd.ai/en/incidents/2025-09-29-8b4f)).

## 4. Budget travellers: comparing, uncertainty and trust

- In a StubHub field experiment with several million users (Marketing Science), people shown fees only at checkout spent about 21% more and were 14% more likely to buy, because hidden fees make comparison hard ([Deceptive Design summary](https://deceptive.design/articles/price-salience-and-product-choice)). Showing the whole price up front costs sales and buys honest comparison.
- The UK government found 46% of 525 online providers drip at least one fee, rising to 72% in transport, costing UK consumers an estimated £595 million to £3.5 billion a year ([GOV.UK, drip pricing, September 2023](https://www.gov.uk/government/publications/estimating-the-prevalence-and-impact-of-drip-pricing)).
- Airbnb made the total price with fees and taxes the default on 21 April 2025; before that nearly 17 million guests had switched the total price view on, and around 300,000 listings cut or removed fees ([ABC7](https://abc7.com/post/airbnb-will-now-show-total-prices-default/16216095/)).
- Across eight experiments with 5,323 participants, people rated an app more favourably when it gave a range rather than a single estimate, even against a cautious point estimate at the top of the range ([Hu, Gaertig and Dietvorst, Management Science 2025](https://ideas.repec.org/a/inm/ormnsc/v71y2025i9p7497-7515.html)).
- Google Flights labels a price low, typical or high against past averages for the route, and only shows its timing advice "for searches with reliable trend data" ([Google blog, Flights deals](https://blog.google/products/travel/google-flights-find-deals/)). Comparing to a stated baseline, and withholding the claim when data is thin, is the trust pattern.

## 5. Mobile and desktop

- In 2016 Google data (US), about 60% of destination information searches came from mobile, while 31% of leisure travellers had booked on a smartphone ([Think with Google infographic](https://www.thinkwithgoogle.com/_qs/documents/594/travel-infographic-mobile-shapes-customer-journey-c.pdf)). Dreaming moved to the phone first.
- In a 2019 YouGov survey (US), nearly seven in ten used a laptop for planning and booking and a little over one in ten a smartphone, while 71% used the phone to board their flight ([Statista, YouGov data](https://www.statista.com/chart/amp/18942/travel-tech-usage)).
- Booking is now shifting too: Booking Holdings said the mobile app share of its room nights was "in the mid-50% range" over the four quarters to Q3 2025, up from the low 50s a year earlier ([Motley Fool transcript, Q3 2025](https://www.fool.com/earnings/call-transcripts/2025/10/29/booking-bkng-q3-2025-earnings-call-transcript/)).

The pattern, old and new: inspiration on the phone, dense comparison more often on a larger screen, booking moving to the phone, and the trip itself on the phone, in the 2015 TripBarometer led by maps, restaurants and things to do. A trip started on one device has to be waiting on the other.

## What this means for Carta, surface by surface

Each item respects Carta's rules: one terracotta accent, no gradients, every figure labelled for where it came from, mono for measured facts, no invented social proof, no AI photos.

### Landing and home

- Open on the question most people bring: no destination yet (59% undecided). The first screen is one input row (from, month, nights, lifestyle) and a live list of places with their day cost, not a hero image.
- Proof is the running instrument, not testimonials: "Bed prices measured in N of M destinations, refreshed 2 hours ago", read from `meta`.
- Say what Carta does not do in one line: it prices the ground, not the flight.

### Explore

- Map and list in sync both ways: tap a row and its pin turns terracotta; pan the map and the list re-filters. Rank pins separately from the list and show fewer at low zoom (Airbnb's finding).
- A budget ceiling control that moves the pins live, as KAYAK does, but over the ground cost per person per day, with the traveller's own fare added only when typed.
- Make the month a first-class input with two measured facts per place: typical daytime temperature and crowding, each with its source. 74% weigh weather and 68% avoid crowds.
- A "reachable without a car" filter for hikers and car-free travellers, using station distance and service frequency, with the one-hour interval as the default threshold.
- A compare tray of up to four places as NN/g describes: places as columns, the same rows for each (day cost split, month weather, crowding, walks nearby, access), sticky headers, differences marked in text and weight, two at a time on phones.

### Destinations browse

- Filters that match how hikers choose: length bands with 5 to 15 km as the default view, waymarked or not, start reachable by public transport, season open. Baymard finds 40% of travel sites miss industry-specific filters.
- Keep the honest coverage line under every listing, as the destinations spec proposes; it answers the "is this everything?" doubt that keeps tabs open.

### Destination page

- First fold: the per-day receipt with provenance, because value for money is the first criterion. Then the month strip (weather, crowds), then getting there and around without a car, then things to do.
- Show every estimate as a labelled range with a tilde and "est.", and keep measured figures as single numbers in mono. Where the data is too thin for a claim, make none, as Google Flights does.
- No dripped costs: the total for the traveller's nights includes everything Carta prices, and the receipt lists what it excludes in words.

### Outdoor detail pages (trails, beaches, lakes, summits, cycling)

- Always a map on the page (Baymard's 57% gap) and an elevation profile with a surface breakdown for walks and rides, collapsible on phones so it does not eat the screen as AllTrails users complain.
- Start and finish with the nearest stop, the line and how often it runs; that is the hiker's main barrier.
- Conditions only from measured sources with dates (bathing water class, season length). No community condition reports until Carta has real ones, and no invented ones.
- GPX and offline exports one tap away, and whether the route is waymarked, because hikers rely on signs.

### Trip page (the 253 week-long journeys)

- A day selector over one map: the selected day's route in terracotta, other days in ink, numbered by day rather than coloured by day, which keeps the one-accent rule and survives greyscale.
- Per day: a few options with walking time between them rather than a fixed hour-by-hour plan, since 85% choose activities on arrival.
- The budget receipt totals with the lifestyle input visible beside it; the booking order is a checklist the traveller can tick and save.

### Trip planner

- Inputs stay editable at every step and the total re-prices in place without layout jitter, because constraints change mid-plan (the 2026 interview study).
- Show each leg's time and price by mode, and say in words what a leg price includes; Rome2Rio's fuel-only car estimates show how a silent exclusion misleads.
- Reorder cities by drag with a keyboard and button alternative, nights as a stepper, and the gap between legs shown as time.

### Day planner

- Phone first, used on the day: the map, the next stop, walking time to it and opening hours carry the screen.
- Swap a stop in place and see the walking time and day cost update. Keep the day readable offline.
- Never place a POI that is not in the catalogue; the AI incident record is the reason the Gemini output must stay bound to real IDs.

### My trips and sharing

- Saving is the core, not a side feature: people keep tabs open because they fear losing what they found. A save button on every card, a note per saved item, and lists that group places into a trip.
- "What changed since you saved": price moves in measured figures, with the old and new figure and the capture date.
- A read-only share link and co-planners with edit rights; Polarsteps reviewers miss shared planning.
- After the trip, keep the record (route, days, what it cost) without public feeds or follower counts.

### Account

- Store the defaults every screen prices from (home station or airport, group size, lifestyle, currency, language), each also editable from the screen that uses it.
- The same saved state on phone and laptop, since a trip moves between them.
- A plain data freshness page and the export the GDPR work already provides.

## Sources

- Think with Google, "How mobile shapes the customer journey" (2016 PDF): https://www.thinkwithgoogle.com/_qs/documents/594/travel-infographic-mobile-shapes-customer-journey-c.pdf
- TTG Asia, Expedia Group path to purchase research (2023): https://www.ttgasia.com/2023/07/27/uncovering-the-path-travellers-take-when-booking-travel-expedia-group/
- arXiv 2609.26968, How constraints and preferences shape travel planning (2026): https://arxiv.org/abs/2609.26968
- CMU School of Computer Science, tab overload study (2021): https://www.scs.cmu.edu/news/2021/overcoming-tab-overload
- YouGov, US travel stress report 2025: https://yougov.com/en-us/reports/51330-us-travel-stress-report-2025
- TripAdvisor TripBarometer, Connected Traveller (2015): https://tripadvisor.mediaroom.com/2015-06-30-Global-travel-report-reveals-rise-of-the-Connected-Traveller
- Polarsteps on the App Store: https://apps.apple.com/us/app/polarsteps/id947925763
- Statista, Booking.com data on European destination decisions (2024): https://www.statista.com/chart/amp/32515/influencing-factors-on-european-traveler-destination-decisions
- Hospitality Net, Booking.com 2026 Travel and Sustainability research: https://www.hospitalitynet.org/news/4132046/bookingcom-research-reveals-how-climate-uncertainty-is-reshaping-peak-season-travel
- Ostfalia, Wandermonitor 2024: https://www.ostfalia.de/en/university/press/press-releases/press-release/23-05-2025_wandermonitor-2024-wandertrend-bleibt-ungebrochen-ansprueche-an-oepnv-und-wanderwege-wachsen-mit
- Skift, European Travel Commission mode shift (2026): https://skift.com/2026/03/12/europe-travelers-swap-planes-for-trains-but-climate-isnt-the-driver/
- KAYAK Explore: https://www.nz.kayak.com/news/explore
- Google blog, Explore redesign (2021): https://blog.google/products/travel/helpful-tools-when-youre-ready-travel/
- Learning to Rank for Maps at Airbnb: https://arxiv.org/abs/2407.00091
- Wanderlog mobile app: https://wanderlog.com/trip-planner-mobile-app
- Stippl vs Wanderlog (competitor source): https://www.stippl.io/blog/stippl-vs-wanderlog
- Komoot features: https://www.komoot.com/features
- AllTrails on the App Store: https://apps.apple.com/ca/app/alltrails-hike-bike-run/id405075943
- Going, Rome2Rio guide: https://going.com/guides/how-to-use-rome2rio-for-easier-route-planning
- NN/g, comparison tables: https://www.nngroup.com/articles/comparison-tables/
- Baymard, travel site UX best practices: https://baymard.com/research-articles/travel-site-ux-best-practices
- OECD.AI incident monitor, AI travel hallucination (2025): https://oecd.ai/en/incidents/2025-09-29-8b4f
- Deceptive Design, price salience and product choice (StubHub): https://deceptive.design/articles/price-salience-and-product-choice
- GOV.UK, estimating the prevalence and impact of drip pricing (2023): https://www.gov.uk/government/publications/estimating-the-prevalence-and-impact-of-drip-pricing
- ABC7, Airbnb total price by default (2025): https://abc7.com/post/airbnb-will-now-show-total-prices-default/16216095/
- Hu, Gaertig and Dietvorst, Management Science 2025: https://ideas.repec.org/a/inm/ormnsc/v71y2025i9p7497-7515.html
- Google blog, Google Flights deals and price insights: https://blog.google/products/travel/google-flights-find-deals/
- Statista, YouGov travel tech usage (2019): https://www.statista.com/chart/amp/18942/travel-tech-usage
- Motley Fool, Booking Holdings Q3 2025 earnings call: https://www.fool.com/earnings/call-transcripts/2025/10/29/booking-bkng-q3-2025-earnings-call-transcript/
