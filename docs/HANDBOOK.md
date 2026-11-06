# Carta Handbook

Every feature of Carta, what it does for a traveller, and exactly how it works: the rules, formulas, thresholds and fallbacks, with the config key or constant each number comes from.

Written 2026-11-04 (T1045) from the code, config and migrations on `main` at commit `944c4ef0e8`. Where code and older docs disagreed, the code was followed. Where the code does not decide something, the text says "Not found in code" rather than guessing.

## How to use this handbook

- **Find a feature** in the contents below. Each one has the same five parts:
  - **What it does**: the traveller's view, in plain words.
  - **How it works**: the actual logic, step by step, with real numbers and the config key or constant in `backticks`.
  - **Data behind it**: which data files, pipeline task and sources feed it, and how fresh they are.
  - **Where it lives**: app, pipeline and backend files.
  - **Limits**: known gaps, with register IDs (`T504-d`) where one exists.
- **Paths** are relative to the repo root. App paths start with `continent-app/`.
- **To change a number**, change it where the handbook says it lives (usually `continent-app/config/rating.json` or `pricing.json`), not in this file.
- **Keeping it true**: a task that changes a feature updates its section in the same commit (ROADMAP.md, items B1 and B7). Every rule will get a logic ID linking it to the code (item B3).
- **Related docs**: [MAP.md](../MAP.md) maps areas to files, [PRODUCT.md](../PRODUCT.md) says who Carta is for, [docs/SCHEMA.md](SCHEMA.md) holds the data contract, [ROADMAP.md](../ROADMAP.md) holds the plan.

## Contents

1. [Discover](#discover)
   - [Home page](#home-page)
   - [Explore (map, cards, filters, rails, sort)](#explore-map-cards-filters-rails-sort)
   - [Search dock](#search-dock)
   - [Month and "any time" selection](#month-and-any-time-selection)
   - [From town](#from-town)
   - [Destinations search](#destinations-search)
   - [Place page](#place-page)
   - [Place photos](#place-photos)
   - [Day trips](#day-trips)
   - [Nearby outdoors (Around)](#nearby-outdoors-around)
   - [Place PDF](#place-pdf)
   - [Region page](#region-page)
   - [Country page](#country-page)
   - [Shortlist (saving places)](#shortlist-saving-places)
2. [Scores, ranking and seasons](#scores-ranking-and-seasons)
   - [Place rating (Carta rating v5)](#place-rating-carta-rating-v5)
   - [Appeal: hand scores and the rubric](#appeal-hand-scores-and-the-rubric)
   - [Beauty](#beauty)
   - [Depth](#depth)
   - [Designations and recognition](#designations-and-recognition)
   - [Fame and hidden gems](#fame-and-hidden-gems)
   - [Rating breakdown sheet](#rating-breakdown-sheet)
   - [Country and class standing](#country-and-class-standing)
   - [POI significance and labels (must-see, recommended, worth a look)](#poi-significance-and-labels-must-see-recommended-worth-a-look)
   - [Nature ratings on the place ladder (beaches, lakes, peaks, walks, cycle routes)](#nature-ratings-on-the-place-ladder-beaches-lakes-peaks-walks-cycle-routes)
   - [Trail rating (0 to 10)](#trail-rating-0-to-10)
   - [Vibe scores](#vibe-scores)
   - [Place taste profile](#place-taste-profile)
   - [Personal match and "For you"](#personal-match-and-for-you)
   - [Climate strip and best months](#climate-strip-and-best-months)
   - [When logic (the traveller's month) and When to go](#when-logic-the-travellers-month-and-when-to-go)
   - [Crowds by month and the crowd calendar](#crowds-by-month-and-the-crowd-calendar)
   - [Sea temperature](#sea-temperature)
3. [Prices and logistics](#prices-and-logistics)
   - [The price request (one question for every screen)](#the-price-request-one-question-for-every-screen)
   - [Group size and the party](#group-size-and-the-party)
   - [Lifestyle levels](#lifestyle-levels)
   - [Food and drink per day](#food-and-drink-per-day)
   - [Bed price per night](#bed-price-per-night)
   - [The day price and the five price bands](#the-day-price-and-the-five-price-bands)
   - [Local transport](#local-transport)
   - [Activities and things to do](#activities-and-things-to-do)
   - [Destination price card ("What a day costs")](#destination-price-card-what-a-day-costs)
   - [Trip total (planner)](#trip-total-planner)
   - [The buffer (Ask budget search)](#the-buffer-ask-budget-search)
   - [Money formatting](#money-formatting)
   - [Food and drink prices (pipeline) and the Eat and drink section](#food-and-drink-prices-pipeline-and-the-eat-and-drink-section)
   - [Stays: the Booking and Hostelworld scrape](#stays-the-booking-and-hostelworld-scrape)
   - [Live stays (Xotelo, tonight's hotel prices)](#live-stays-xotelo-tonights-hotel-prices)
   - [Flight sweep (the Worker)](#flight-sweep-the-worker)
   - [Flights and fares in the app (swept and live)](#flights-and-fares-in-the-app-swept-and-live)
   - [Airports in reach from home and the way to the airport](#airports-in-reach-from-home-and-the-way-to-the-airport)
   - [Airport transfer per mode (airport to the place)](#airport-transfer-per-mode-airport-to-the-place)
   - [Driving your own car: fuel and tolls](#driving-your-own-car-fuel-and-tolls)
   - [Car hire](#car-hire)
   - [Train, bus and travel between places](#train-bus-and-travel-between-places)
   - [Price map and price feel labels](#price-map-and-price-feel-labels)
4. [Planning](#planning)
   - [Carta's own trips (the curated journeys library)](#cartas-own-trips-the-curated-journeys-library)
   - [Ready-made composed trips (the trips layer)](#ready-made-composed-trips-the-trips-layer)
   - [Trip finder ("Trips for you")](#trip-finder-trips-for-you)
   - [Plan home and the plan flow](#plan-home-and-the-plan-flow)
   - [The traveller's trip page](#the-travellers-trip-page)
   - [Day planner](#day-planner)
   - [AI day plan (plan-day)](#ai-day-plan-plan-day)
   - [AI town suggestions (suggest-city)](#ai-town-suggestions-suggest-city)
   - [Magic import (parse-booking)](#magic-import-parse-booking)
   - [Past trips](#past-trips)
   - [Together and shared trips](#together-and-shared-trips)
5. [Outdoors and imagery](#outdoors-and-imagery)
   - [Trails: finding and choosing walks](#trails-finding-and-choosing-walks)
   - [Trail routing and repair tools (trailslab, brouter)](#trail-routing-and-repair-tools-trailslab-brouter)
   - [Trail difficulty](#trail-difficulty)
   - [Trail distance, climb and walking time](#trail-distance-climb-and-walking-time)
   - [Trail page](#trail-page)
   - [Cycling routes and the cycle page](#cycling-routes-and-the-cycle-page)
   - [Beaches](#beaches)
   - [Lakes](#lakes)
   - [Mountains and peaks](#mountains-and-peaks)
   - [Shared outdoor page pattern](#shared-outdoor-page-pattern)
   - [Image ladder (sized copies)](#image-ladder-sized-copies)
   - [Licensed photo sources and credits](#licensed-photo-sources-and-credits)
   - [Hero image choice](#hero-image-choice)
   - [Photo gallery](#photo-gallery)
   - [Image audits](#image-audits)
   - [When there is no photo (map and placeholder fallback)](#when-there-is-no-photo-map-and-placeholder-fallback)
6. [Ask Carta, accounts and platform](#ask-carta-accounts-and-platform)
   - [Ask Carta](#ask-carta)
   - [Sign-in and account](#sign-in-and-account)
   - [My trips (saving and storage)](#my-trips-saving-and-storage)
   - [Together, sharing and collaborative trips](#together-sharing-and-collaborative-trips)
   - [The Pass, paywall and Stripe checkout](#the-pass-paywall-and-stripe-checkout)
   - [Languages](#languages)
   - [Admin panel, moderation and telemetry](#admin-panel-moderation-and-telemetry)
   - [The data wire (pipeline to app)](#the-data-wire-pipeline-to-app)
   - [Deploy (Cloudflare Pages, R2, prerender, SEO)](#deploy-cloudflare-pages-r2-prerender-seo)
   - [The build box (Hetzner scheduled runs)](#the-build-box-hetzner-scheduled-runs)
   - [CI and checks](#ci-and-checks)
7. [Appendix: what writing this handbook found](#appendix-what-writing-this-handbook-found)

---

## Discover

Discover is the part of Carta where a traveller finds a place: the home page, Explore with its map, cards and filters, the search tools, and the pages for a place, a region and a country. Every figure on these screens comes from the shipped data files or the app's own price engine, and a block with no data is left out rather than shown empty.

### Home page

**What it does.** The home page opens a first visit with a full-screen film of real places, the line "A cheap flight is not a cheap trip" and an Ask Carta field. Scrolling down, it shows what a week really costs at one place (flight, bed, food), a short tour of the app, a budget slider over real places, and the three plans. Anything typed in the field opens Carta's chat on Explore, already asking.

**How it works.**
1. When it opens: only on a first visit, meaning no query string, no hash and no earlier visit mark in this browser (`readFirstVisit`, key `continent.homeSeen.v1`). The mark is written on every load, so it shows once per browser. If storage throws, the visit counts as a return visit. A return visit opens on Explore instead.
2. Hero film: five licensed clips (`FILM` in `lib/homeDemo.js`: Bled, Lagos, Dubrovnik, Porto, Hallstatt), each shown 9 seconds (`useAutoAdvance(..., { ms: 9000 })`) with a crossfade. Only the current and next clip are loaded. The film stops when off screen (20 percent visibility threshold), in a hidden tab, or under reduced motion, where the first poster stands still. There is no pause button (owner decision).
3. Boarding pass: under the field, for the place on screen, the cheapest return flight from the traveller's home airport in any month (`cheapestReturnAnyMonth`), with airline and the date the price was checked. Shown only when the flight sweep has a fare; never guessed.
4. Ask field: max 200 characters. Text is sent as `{ question }`; an empty submit sends `{ open: true }`, which opens the chat empty. Pointing at the field preloads the chat code and the guided search data.
5. The real cost (`HomeCost`): the story place is Bled (`STORY_PLACE = 'gem:bled'`) for 7 nights (`STORY_NIGHTS`). The week is `weekSum`: bed = `stayEur` x nights, food = `foodEur` x nights, total = bed + food + flight (flight only if the sweep has one). The day prices come from the traveller's Lifestyle through the price engine. If the place has no price, the section is not shown.
6. The proof (`HomeProof`): two bars on one scale, "what a flight site shows" (the flight alone) against "what Carta shows" (flight, bed, days). Hidden when there is no flight in the sweep.
7. The tour (`HomeTour`): five chapters as tabs (Ask, Explore, Plan, My trips, Together), each with a screen recording. It plays through once while in view; a tap on a tab takes over and loops that clip; after one round it rests on the first chapter.
8. Try it (`HomeTry`): the film's places sorted by day price, 5 on wide screens and 4 on a phone. The slider runs from the cheapest minus 10 euros to the dearest plus 20, rounded to 5. It starts at the third cheapest. Places under the budget are lit; the cheapest that fits is marked best value. The section hides when fewer than 3 places have a price. The foot opens Explore with that budget as a filter.
9. Plans (`HomePlans`): the three tiers from `TIERS` and `TIER_ORDER` (billing), with prices and a short list each.
10. While the film sits under the top bar, the bar turns transparent (root attribute `data-home-film="under"`).

**Data behind it.** The catalogue (`public/boot.json`, `public/dest/{cc}.json`), the day prices from the price engine (`lib/price/`, `config/pricing.json`), and the flight sweep fares (`data/flights/` on R2, written by the flight-sweep Worker). Clips and posters are static files under `public/home/`. No pipeline task builds the home page itself.

**Where it lives.** continent-app/src/browse/home/HomePage.jsx, continent-app/src/browse/home/HomeHero.jsx, continent-app/src/browse/home/HomeStory.jsx, continent-app/src/browse/home/HomeCost.jsx, continent-app/src/browse/home/HomeProof.jsx, continent-app/src/browse/home/HomeTour.jsx, continent-app/src/browse/home/HomeTry.jsx, continent-app/src/browse/home/HomePlans.jsx, continent-app/src/lib/homeDemo.js, continent-app/src/lib/homeVisit.js. Docs: 1.CARTA.md (root). Latest reports: T998, T988.

**Limits.**
- Without a sweep fare from the home airport, the boarding pass and the proof section do not show, and the cost headline drops the flight.
- The story place and the film places are fixed in code, not chosen per traveller.
- The design-lint check fails on the approved gradients (register T998-a, owner decision pending).

### Explore (map, cards, filters, rails, sort)

**What it does.** Explore is the catalogue of places as a photo grid and a map. Each card shows the name, the Score, the country, and what a day there costs one person, plus the way there. At rest it shows themed rails ("Best in October", "Hiking bases"); any filter or search turns it into one filtered list. On a desktop the map sits beside the list and both show the same places.

**How it works.**
1. Rows: every destination with coordinates, one card per city. Extra airports of the same city (`gateway_of`) are dropped, and "Rome (Fiumicino)" becomes "Rome" (`dedupeGateways`). If two places share one photograph, only one keeps it.
2. Day price: each row carries `cost.dayEur` (bed plus food and drink a person, at the traveller's Lifestyle) from the price engine (`priceDays`, default request `DEFAULT_PRICE_REQUEST`: 2 adults, any time, `stay: 'home'`). A national stand-in figure carries the estimate tilde.
3. Way there: under the travel mode (`TRAVEL_MODES = ['any','plane','train','bus','car']`), each place gets the cheapest return a person: a flight from the home airport sweep (with the traveller's bag), or train, coach or car priced from the From point (`wayFor` in `lib/travelWay.js`). "Any" takes the cheapest way. Ground ways over 20 hours one way are dropped (`MAX_GROUND_HOURS = 20`). Party rules: a child pays a full plane seat, half a train or coach ticket; a baby flies on a lap for a small fee; the car is shared. A place the chosen ground way cannot reach leaves the list; in plane mode a place without a flight keeps its row.
4. Filters, first pass (`useExploreCatalog`): text search, countries (kept, or left out with `countryNot`), trip kinds, rating range, hidden gems, UNESCO, top beach, big place, saved only, travel time reach (hours x 60 minutes), and Strong match.
5. Filters, second pass (`taxRows` in ExploreTab), all kept in the URL: kind of place (`xk`: metro, city, town, village, area), rating band and up (`xv`), good for (`xr`), month (`xm`, the month must be in `climate.best`), no car (`noCarOk`, from `local_transport.mobility.car_free` good or ok), budget ceiling (`xb`, day price at or under) and floor (`xbm`), flight up to (`xfh`, hours; outbound flight longer than the limit drops the place; no flight drops it only in plane mode), not crowded (`quietOk`, the month's crowd tier), best of country (`country_badge`), near the sea (category beach, coast or island), and the guided facets (vibe `xe`, area `xa`, near `xn`, close by `xd`).
6. Filter pane values (`ExploreFilterRail.jsx`): budget stops `BUDGET_STOPS = [0, 20, 40, 60, 80, 100, 130, 160]` euros a day; flight `FLIGHT_HOURS = [2, 3, 4, 6]`; reach `REACH_HOURS = [2, 3, 4, 5]`; rating steps `FILTER_BANDS = ['good','very_good','excellent']`. Band cutoffs from `config/rating.json` `bands.cutoffs`: exceptional 9, excellent 8.3, very good 7.6, good 6.9, pleasant 6. An old link with `xp=e` lands on a 70 euro ceiling (`LEGACY_CHEAP`).
7. Good for (role) rules (`ROLE_RULES` in `lib/taxonomy.js`, `visit_h` = hours to see the highlights): under 3 h is a stop; 8 h or more with base suitability 0.6 or more is a base; 5 to 8 h with at least 4 other places within 45 km is a basecamp; 3 to 6 h with good or excellent transit is a day trip; otherwise 6.5 h or more is a base, else a day trip.
8. Sort (`SORTS`): Rating (default, by `rating.score`), Cheapest (day price ascending, places with no price last, ties by rating), A to Z, Country (then rating). "For you" is offered once the traveller has a taste profile; it is not the default because `match.for_you_default` is `false`. For you = month score + `lambda` x (fit minus 0.5), with `lambda = 2`, so the match moves a place by at most one point. Fit shows from 55 percent (`show_min`), Strong match is 70 percent (`strong_min`).
9. Guided order: under a vibe the list sorts by vibe score, then fame, then rating; around a place ("near") it sorts nearest first. The default sort then reads "Best match".
10. Rails (overview only, `ExploreRails.jsx`), capped at 12 tiles each (`CAP`), round-robin by country (`interleaveByCountry`): Your shortlist; Best in {month} (in season and Very good or better); Under {ceiling} in {month} (Good or better, in season, under a ceiling that is the traveller's budget or the cheapest third of the catalogue rounded up to 5 euros, at most 2 per country in the first 12, sorted by price); Top rated (Excellent and up); Hiking bases (hiking vibe 80 or more); Beach season (beach vibe 80 or more and in season); Hidden gems; No car needed; Quiet in high season (only June to September). The rail month is the month filter, else the traveller's travel month, else the current month. Strips drawn: 4 on desktop, 3 on a phone; the rest become quick chips. A rail needs at least 4 places to show. "See all" applies the same filter to the list.
11. Grid: 48 cards a page, more on scroll (`PAGE = 48`). Hovering a card for 150 ms (focus 400 ms) opens a preview popover up to 320 px wide, beside or under the card, never over its photo.
12. Map (`ExploreMap.jsx`): one GeoJSON layer, no clusters. Dot size by kind (`KIND_RADIUS`: metro 9, city 7, area 7, town 5.5, village 4.5), darker ink for a better rating. The thirty best rated in view carry name and day price labels; the cheapest is placed first and a label that would collide stays a dot. The cheapest in view gets the best-value marker. The camera fits the list inside Europe (`EUROPE` bounds, west -11 to east 32, south 35 to north 62). A hover card shows from zoom 8 (`CARD_FROM`). A keyboard layer holds up to 30 pin buttons (`KPIN_CAP`). While the map is up, the list and count show only places inside the viewport. The map code (maplibre) loads only when first asked for. Every map imports maplibre-gl 6 through `src/map/maplibre.js`, which hands it the URL of its bundled worker; never import `maplibre-gl` directly (T1066).
13. Overview card (`lib/placeOverview.js`): name, region (a named area from the guided data, region before coast before range, else the country), the month score when a month is set, one reason (guided answer, then the month's own sentence, then "good in {month}", then the best months), the day price, the save control.
14. Start dialog: the first time Explore opens on a wide screen it asks one question and shows From, Where to, When, Who. Shown once per device, never on a shared link or under a test driver. Below 1024 px a first visit with no taste opens the taste questions instead.

**Data behind it.** `public/boot.json` (boot index, 3,868 records), `public/dest/{cc}.json` and `public/dest/_rank.json`, split from `app_data/app_data.json` by `continent-app/scripts/sync-data.mjs` (runs with `npm run dev` and the build). Ratings from `python run_pipeline.py fame` and `rating_v5_profile`; climate from `climate`; crowds from `crowding`. Guided vibes, areas and nearby distances from `public/search/guided.json`, built by hand with `python pipeline/guided_search_layer.py` (not a scheduled task; the file on disk is dated 2026-10-29). Flight fares from the flight sweep (R2 `data/flights/`).

**Where it lives.** continent-app/src/browse/ExploreTab.jsx, continent-app/src/browse/ExploreMap.jsx, continent-app/src/browse/ExploreCards.jsx, continent-app/src/browse/ExploreRails.jsx, continent-app/src/browse/ExploreFilterRail.jsx, continent-app/src/browse/PlaceOverview.jsx, continent-app/src/browse/StartDialog.jsx, continent-app/src/hooks/useExploreCatalog.js, continent-app/src/lib/guidedSearch.js, continent-app/src/lib/taxonomy.js, continent-app/src/lib/placeOverview.js, continent-app/src/lib/match.js, continent-app/src/lib/travelWay.js, continent-app/config/rating.json. Pipeline: pipeline/guided_search_layer.py, pipeline/explore_overlay.py. Latest reports: T980 to T983, T968, T1038.

**Limits.**
- For you stays off as a default until the persona gate passes (`_for_you_default` note in `config/rating.json`).
- Guided facets (vibe, area, near) hold the list empty until the guided data has loaded.
- A lite record (before the country shards arrive) lacks the sights line in the preview and map tip (register T271-a).
- Several DOM check scripts still expect the old phone top line (register T961-b).

### Search dock

**What it does.** On a phone, one search pill at the top replaces the settings buttons and the search field. Tapping it opens a sheet where the traveller picks what to look for (a place, a walk, a beach, a lake, a summit or a ride), where, when, from, who, stay and transport. A round button beside it opens Ask Carta.

**How it works.**
1. Kinds (`DOCK_KINDS`): places, trails, beaches, lakes, mountains, cycling.
2. The trip inputs (when, from, who, stay, transport) save the moment they change, to the same settings the desktop line uses. Where and What wait for Search.
3. After a search the pill shows Back before it and one Filters button after it, in place of Ask.
4. A submit with no Where text opens every place.
5. Text that looks like a question goes to Ask Carta (`isQuestion`): it ends with "?", contains a digit or the euro sign, or has 4 or more words.
6. Recent searches: the last 5, this device only, each up to 80 characters (`carta.dock.recent` in localStorage).

**Data behind it.** No data file of its own; it drives Explore and the outdoor lists.

**Where it lives.** continent-app/src/components/SearchDock.jsx, continent-app/src/browse/searchDockStore.js, continent-app/src/components/SettingsLine.jsx. Latest report: Execution/P15/T960-T966-search-dock.md.

**Limits.** Phone only; whether desktop gets it is an owner decision (register T961-c).

### Month and "any time" selection

**What it does.** The traveller can say when they travel: exact dates, a month, or any time. Explore also has its own month filter. Every screen that speaks of "the month" (crowds, quiet flag, rails, month score, bed prices) reads the same answer.

**How it works.**
1. `resolveWhen` in `lib/when.js` returns one of three kinds: `exact` (start month, plus the end month if the trip spans two), `month`, or `any` (no month, yearly pattern).
2. The Explore month filter (`xm`, 1 to 12) wins over everything else.
3. `dateFlex: 'any'` gives `any`. Carta's own default dates are not treated as the traveller's choice: without `ownDates` they also read as `any`.
4. The destination page reads `xm` from the address, so it follows the filter the traveller came from.
5. With a month set, card bed prices use that month's measured price curve, and the flight is the month's cheapest; with any time, the year's cheapest.

**Data behind it.** Climate best months (`climate.best`) and crowd tiers per month on each record (`climate`, `crowding` pipeline tasks); stay price curves from the stays scrape (`python run_pipeline.py stays`).

**Where it lives.** continent-app/src/lib/when.js, continent-app/src/components/SettingsLine.jsx, continent-app/src/browse/ExploreTab.jsx, continent-app/src/lib/crowdMonth.js.

**Limits.** With default dates the place price card prices the year's cheapest flight (January) while the dates pill shows other dates (register T1019-a, owner decision).

### From town

**What it does.** The traveller says where the trip starts as a town, not an airport. Carta then prices a plane, train, coach and car from there.

**How it works.**
1. The picker shows countries first; a country opens its towns. Typing filters countries and towns, plus one row that looks the words up anywhere in Europe on OpenStreetMap (Nominatim), only on that press. "Use my location" uses the device position.
2. Every pick gives `{ name, lat, lon, country, iso2 }`. Road and rail ways start from that point.
3. The flight starts from the nearest priced airport (`nearestOrigin` in `lib/origins.js`, straight-line distance to every origin in `meta.origins`).
4. A country picked without a town stands for its town with airports nearest the capital; without a known capital, the town nearest the median of its towns.
5. If no town is set, the start is the town of the home airport (`homePoint`).

**Data behind it.** `meta.origins` in the boot index (the airports with sweep fares); Nominatim for free text.

**Where it lives.** continent-app/src/components/FromPicker.jsx, continent-app/src/lib/origins.js, continent-app/src/lib/travelWay.js.

**Limits.** The rail start in some planner views is the departure airport city, not the home town (register T102-c).

### Destinations search

**What it does.** Two search fields find places. In Explore, typing a name narrows the list, finding accented names, local names, villages inside an area and whole regions. In the outdoor lists (trips, trails, beaches, lakes, mountains, cycling), the field suggests towns, and pressing Enter on anything else (a village, a postcode, a street) finds that spot and lists what is closest to it.

**How it works.**
1. Explore search: plain match on city or country name (accent and case blind), plus the fold-and-alias index (`querySearchIndex` in `lib/searchIndex.js`). The index is used for queries of 3 characters or more. Passes in order: exact key, prefix, substring, then edit distance 1 for queries of 5 or more characters. A region term (Tuscany, Provence, Cyclades) returns a bounding box that filters the list. A member name (Positano) finds its parent (Amalfi Coast) and opens it with the member named (`?dm=`). With no hit, the 3 nearest keys are offered as suggestions.
2. Fold: NFKD plus a table for letters NFKD leaves alone (l with stroke, o with slash, ae, oe, eszett, eth, thorn), hyphens and apostrophes to spaces.
3. Outdoor list suggestions (`rankPlaces` in `lib/placeSearch.js`, 6 suggestions): rank 0 whole name equals the term, 1 name starts with it, 2 a word inside starts with it, 3 the term sits inside a word; then shorter name first, then alphabet.
4. Near mode: Enter geocodes through Nominatim (at least 3 characters). The list then shows the closest items to that point, up to 80 (`NEAR_MAX_ROWS`), with the distance on each card. The crosshair asks the browser for the device location instead.
5. The last category, country and near place are remembered in this browser (try/catch, a link always wins).

**Data behind it.** `public/search_index.json`, built by hand with `python pipeline/search_index_layer.py` (not a scheduled task; file dated 2026-10-29). It holds folded names, parenthetical names, a curated endonym and exonym table (checked against the catalogue at build time), member names and region boxes. Nominatim (OpenStreetMap) for free text.

**Where it lives.** continent-app/src/lib/searchIndex.js, continent-app/src/lib/placeSearch.js, continent-app/src/lib/geocode.js, continent-app/src/browse/DestinationsTab.jsx, continent-app/src/hooks/useExploreCatalog.js. Pipeline: pipeline/search_index_layer.py.

**Limits.**
- `rankPlaces` matches only the one catalogue name per town, so "Gent" does not find Ghent in the outdoor list suggestions (code comment in `placeSearch.js`); the Explore index has an alias table for this.
- The trips list in the Destinations tab is no longer reachable but its code remains (register T1030-a).

### Place page

**What it does.** Opening a place shows one long page: photographs, the name, country and Score, a short intro, key facts, then sections for Overview, What to see, Around, When to go, Where to stay, Getting there and Practical, with similar places at the foot. A price card shows what a day costs a person, what the trip comes to, and one button, "Plan a trip here". The page can be saved, shared and downloaded as a PDF.

**How it works.**
1. Source: the dossier contract `public/dossier/{id}.json` (`loadDossier`; `gem:bruges` is stored as `gem-bruges`, and DOS device names get a trailing underscore). The address is `#dest={id}`; an old `&tab=` scrolls to the matching section (`TAB_SECTION`).
2. Head: name, flag and country, the Score (tap opens the rating sheet), tags (hidden gem, class rank, "top of country" or "#n in country", UNESCO), the personal match line. The intro's first sentence leads; the intro shows in English only and is hidden in other languages.
3. Jump bar under the name: Overview, What to see, Around, When to go, Where to stay, Getting there (only when the place has no day price, since the price card then carries the ways there), Practical. A section without data is not drawn and its jump link goes with it.
4. Key facts row: best months, crowds, hours of sights (`visit_h`), getting around (or "no car needed"), the airport.
5. Overview: insider tips (rule codes), a steep-streets row, local dishes and drinks beside how dear eating out is (price feel against the Europe norm).
6. What to see: numbered sights with photo, kind and distance, the same numbers on a map from 700 px; "A day on foot" (top sights within 2.5 km, 3 to 7 stops, in walking order, at 4.5 km/h with a 1.3 detour factor); then things to do.
7. Around: one photo tile per kind with something in reach (walks, rides, peaks, lakes, beaches; `AROUND_KINDS`, up to 16 per kind in the app, `AROUND_CAP`), each opening that kind's own page; then day trips; inside an area, its villages.
8. When to go: the best months in one line with why; a twelve-month strip (comfort band, daytime high, crowd dots, festival marks); crowds against Europe (visitor nights per km2); hostel, hotel and entire-place prices by month from the scrape; festivals.
9. Where to stay: one row per stay type the scrape found here, with links to the sites that sell it, searched for the traveller's dates and party.
10. Practical: quick facts, airport, getting around, rhythm, links out, why it rates, the match, parking, packing, sources and photo credits.
11. Price card: the day figure is the same price engine row the Explore card and map pin show; the total is that day times the nights and the party (`lib/price/nights.js`), plus the way there. Dates, travellers and Lifestyle edit the app's shared settings, so every card behind the page moves too. From 1024 px it is a sticky right column; below, it sits in the page and a foot bar carries the price, the dates and party, and the primary button.
12. Places like this (`d.similar`, up to 6 shown): same or adjacent class, score at most 1.5 below, category overlap (Jaccard 0.34 or more) or taste cosine 0.9 or more, at least 100 km away, at most 3 per country. Rank = 0.6 x Jaccard + 0.4 x cosine + 0.03 x score difference minus 0.08 per 1,000 km. Tagged "cheaper" when the plain day cost is at most 85 percent, "quieter" when the crowd tier is lower.
13. Opened folds are remembered for the session (`carta.destFolds.v2`).

**Data behind it.** `public/dossier/{id}.json` (3,869 files, dated 2026-10-31 on disk), built monthly by `python run_pipeline.py dossier` (harvest landmarks, city intros, event dates, research, then build, fill licences, build again, audit; previous dossiers are put back when the audit fails). Sources: Wikivoyage, Wikidata, Wikimedia Commons, OpenTripMap, OpenStreetMap (parking), the beach, lake, mountain, trail and cycling wires. POI items come from `public/poi/{id}.json`. Day prices come from the runtime price engine, not the dossier.

**The intro body (T1095, D9).** `intro.body` is a Wikivoyage lead, cut at 700 characters (`trim_sentences`). For the top 300 places of FR, RS and IT (136, 28 and 136 by Carta score, `select_targets`), `pipeline/dossier/harvest_place_intros.py` builds a longer one into `cache/dossier/place_intros.json`: the Wikivoyage lead, then Wikipedia lead sentences that are not near-duplicates (Jaccard 0.6) until the text passes 135 words, never above 230. Only whole source sentences are used; the one clean-up is dropping citation marks and pronunciation brackets, and `check_grounded` proves every sentence is a verbatim source sentence. Each record stores per source the title, URL, revision id, licence (CC BY-SA 4.0) and fetch date. Checks: 25 words or more, English (stop-word ratio), no disambiguation, stub, list or airport lead, article title matches the place, article coordinates within 30 km (no coordinates: the lead must name the place or country). A failing record is stored as `status: rejected` with its reasons and never merged. `build_dossier.compose_intro` takes an `ok` record when it is longer than the Wikivoyage body and sets `intro.grounding` to both sources. `meets_bar` is words >= 120, the prerender `PLACE_MIN_WORDS`; short sources are never padded, so a village with a 60 word Wikipedia lead stays under the bar. No model writes any of it. Run: `python pipeline/dossier/harvest_place_intros.py` (needs en.wikipedia.org and en.wikivoyage.org), then `python pipeline/dossier/build_dossier.py --all`; `--report` prints the stored counts.

**Where it lives.** continent-app/src/browse/DestinationPage.jsx, continent-app/src/browse/DestOverview.jsx, continent-app/src/browse/DestNearby.jsx, continent-app/src/browse/DestWhen.jsx, continent-app/src/browse/DestPractical.jsx, continent-app/src/browse/DestPriceCard.jsx, continent-app/src/browse/RatingSheet.jsx, continent-app/src/browse/KeyFacts.jsx, continent-app/src/browse/NearPage.jsx, continent-app/src/lib/dossier.js, continent-app/src/lib/destOverview.js. Pipeline: pipeline/dossier/build_dossier.py, pipeline/dossier/derive_place_page.py, pipeline/place_layer.py. Docs: archive/docs-2026-11/ITEM_PAGE_DATA_CONTRACT.md. Latest reports: T1019, T1022, T1024 to T1039.

**Limits.**
- The intro exists in English only (register T1024-a).
- Intro length: only the top 300 places of FR, RS and IT get the longer grounded body; every other place keeps the 700 character Wikivoyage body (register T1095-c). The page credits the first grounding source only (register T1095-d).
- Two sources of visit hours disagree on some places, for example Rome (register T1024-d).
- No highlight ships its `fact` line; things to do often have no photo of their own (registers T1032-a, T1032-b).
- About 22 percent of walk rows carry a photo, so most walk and ride tiles show a map (register T1033-a).
- A kind's page ("Walks near Geneva") has no address of its own (register T1035-a).
- Train, bus and car lines in the price card are estimates with nothing saying so (register T1026-b, owner decision).

### Place photos

**What it does.** The top of the place page shows its photographs: a swipe carousel on a phone and one large photo with four small ones from 700 px. Every photo carries its credit in the all-photos view.

**How it works.**
1. The gallery comes from the dossier (`d.gallery`), composed in the pipeline from the hero, highlight and nearby-feature photos (stage S2, at least 5 when available), each with title, author, source and licence.
2. A licence gate refuses photos that cannot be printed; `ok_print` marks the ones the PDF may use.
3. With no gallery, the catalogue hero image is used; with nothing, a typographic placeholder.

**Gallery pass (T1096, D9).** `pipeline/photos/place_gallery.py` finds places below `GALLERY_TARGET = 5` photos in GB, RO, FR and IT (emptiest first), asks Commons for photographs near each (one geosearch per place, radius by class from 2 km for a village to 8 km for an area, 1 s pace) and stores up to `STORE_MAX = 6` in `cache/dossier/place_gallery.json`. Only licensed photography: licence must pass `trails/photo_licence.reusable` (CC0, CC BY, CC BY-SA, public domain), a name must be present when the licence owes one (`credit.owes_credit`), the file must be a jpeg, png or webp of at least 500 px on the short edge and 800 on the long one, not a map, logo or sign, at most 2 per author. Author, licence, licence URL and file page are kept. `compose_gallery` appends these last, behind its own candidates and the same licence and not-a-photograph gates. `python pipeline/photos/place_gallery.py --report` prints coverage per country with no network.

**POI descriptions (T1096, D9).** `pipeline/poi_descriptions.py` gives each must_see and recommended POI of GB, RO, FR and IT the first one to three whole sentences (at most 340 characters) of its English Wikipedia lead, verbatim, with title, URL, revision, licence (CC BY-SA 4.0) and fetch date; nothing is written by a model and `check_grounded` proves it. Disambiguation pages, lists, boilerplate, non-English text, leads under 12 words and articles more than 30 km from the POI are rejected and never merged. `apply` writes `desc` and `desc_src` into `items_full` only over a missing or clearly shorter description that is not itself grounded. The page does not print `desc_src` yet (register T1096-d).
4. A caption that is the record's airport name ("Rome (Fiumicino)") names the town.

**Data behind it.** `public/dossier/{id}.json` gallery, built by `python run_pipeline.py dossier` (`fill_licences.py` reads Commons metadata). Hero images from the `images` and `image_audit` tasks.

**Where it lives.** continent-app/src/browse/PhotoGallery.jsx, continent-app/src/browse/DestinationPage.jsx (`GalleryStrip`), continent-app/src/components/HeroImage.jsx, continent-app/src/lib/heroImage.js. Pipeline: pipeline/dossier/build_dossier.py, pipeline/dossier/fill_licences.py. Docs: archive/docs-2026-11/PHOTOS.md, archive/docs-2026-11/IMAGE_BRIEF.md.

**Limits.** Four photo carousels style their own arrows (register T1024-c). Many surfaces still load Wikimedia images at fixed widths (register T052-f).

### Day trips

**What it does.** Each place page lists the best day trips from it: other places in reach, with travel time and mode, score, distance and how long each wants, and sometimes one multi-day route that passes through.

**How it works (pipeline, `compose_trips`).**
1. Candidates: catalogue places within 110 km (`TRIP_RADIUS_KM`), not closer than 3 km.
2. A candidate needs tier 1 or a score of 6.5 or more, unless Wikivoyage lists it as "go next".
3. Travel time from the trip model; the fastest mode is used; over 210 minutes is dropped; no travel time means no trip.
4. Rank = score x 0.5^(minutes / 70), x 1.6 for a "go next" place.
5. Reasons: editorial route, higher rated (more than 0.4 above this place), coast hop (both coastal), else "worth the ride".
6. If at least 7 candidates score 7.0 or more, weaker ones are dropped. At most 3 per main category, 7 places in total (`TRIP_CAP = 8` minus one).
7. Plus the best composed multi-day trip whose centre is within 30 km.

**Data behind it.** Dossier `trips` block, `python run_pipeline.py dossier`; travel times from `pipeline/trips/trip_model.py`; ready-made trips from `python run_pipeline.py trips`.

**Where it lives.** continent-app/src/browse/DestNearby.jsx (`DayTrips`), continent-app/src/lib/nearby.js. Pipeline: pipeline/dossier/build_dossier.py.

**Limits.** The mode is the fastest way, not whether a car is needed, so there is no "no car needed" filter (register T1036-a). The PDF and the page use different titles (register T1036-c).

### Nearby outdoors (Around)

**What it does.** For each place the page shows walks, rides, peaks, lakes and beaches in reach, each kind as one tile that opens a list.

**How it works (pipeline).**
1. `compose_around`: items from the trails, cycling, mountains, lakes and beaches wires within 20 km (`AROUND_KM`), up to 24 per layer (`AROUND_CAP`), scored items first.
2. `join_nearby`: radius depends on the place's class (`NEARBY_RULES`): beaches 15 km for a village or town, 25 for a city, 35 for a metro or area, up to 6; lakes 20/30/40, up to 4; mountains 25/40/60, up to 5. A feature closer than 0.8 km counts as a highlight, not a neighbour.
3. Waymarked routes come from `data/derived/routes_attach.json`, measured to the line, not the box centre.
4. The app merges the three readings per kind; the first reading wins and later ones only fill missing fields.

**Data behind it.** Dossier `around`, `nearby` and `routes` blocks, `python run_pipeline.py dossier`, after `beaches`, `lakes`, `mountains`, `trails_*`, `cycling_*` and `routes_attach`.

**Where it lives.** continent-app/src/browse/DestNearby.jsx (`DestAround`), continent-app/src/lib/destOverview.js, continent-app/src/browse/NearPage.jsx. Pipeline: pipeline/dossier/build_dossier.py.

**Limits.** The reach is fixed by the pipeline, which limits the distance steps the app can offer (register T1033-b).

### Place PDF

**What it does.** A traveller with a pass can download a place guide as a PDF from the page bar. It follows the page: cover, at a glance, what to see, around, when and stay, practical, with every photo credit and source.

**How it works.**
1. Gated: `paywall.require('export')`, a hard gate. Every PDF needs a pass. If the entitlement read fails or is still loading, the gate opens (fails open).
2. Renders from the same dossier as the page, with the shared PDF kit (`pdfKit.js`, jsPDF, Figtree font).
3. Cover: the first gallery photo with `ok_print === true` and its credit, the name, country, Score with words and rank, UNESCO, the day price a person, up to four facts, and a QR code back to the live page.
4. The rest is text and vector drawings that print in black and white: a plain map with numbered pins (no tiles), the month table with best months shaded.
5. Three-month rule: climate normals yes, forecast no; day cost at the traveller's Lifestyle yes, live fares no. The footer carries the date prices were estimated.
6. A section without data is left out.

**Data behind it.** `public/dossier/{id}.json` plus the runtime day price; built by `python run_pipeline.py dossier`.

**Where it lives.** continent-app/src/lib/destinationPdf.js, continent-app/src/lib/pdfKit.js, continent-app/src/browse/DestinationPage.jsx (`exportPdf`), continent-app/src/hooks/usePaywall.jsx.

**Limits.** The rendered PDF was not checked with a pass in at least one task (register T286-e). The day figure in the PDF header has no provenance level (register T098-c).

### Region page

**What it does.** A region page covers one coastal stretch, mountain range or NUTS2 region. It shows photos, what kind of region it is, the day price of the nearest priced town, the best months and "Plan a trip here", then rails of beaches, trails, lakes, mountains and rides, the towns there, the weeks through it, unscored items and neighbouring regions.

**How it works.**
1. Reads `public/region/{ID}.json` as exported. The address is `#region=...`.
2. Rails per layer in order: beach, trail, lake, mountain, cycling, up to 12 items each (`RAIL_MAX`). Editorial picks are pinned first; rated rows ranked by their score; listed rows carry a "Not scored yet" chip.
3. Region centre: the mean of the items that carry coordinates (beaches, lakes, mountains; trails and cycle routes carry none).
4. Towns here: catalogue towns of the same country within 25 km of any item (`TOWN_KM`), best rated first, up to 12. No item with coordinates means no towns.
5. Day price: the nearest priced town within 40 km of the centre (`PRICE_KM`), same country first, then any. None in reach means no price shown.
6. Best months: only when at least half the towns have climate data, then the months at least half of them name as best.
7. Weeks through it: journeys within 60 km (`WEEKS_KM`).
8. A card opens the layer's own page, the same page as everywhere else.

**Data behind it.** `public/region/` (4,849 files, dated 2026-10-29), from `python run_pipeline.py regions` (quarterly: `build_regions.py --skip-fetch`, `coverage.py`, `export_regions.py --all`). Sources: NUTS, ITL, geoBoundaries, coastal stretches, GMBA mountain ranges, basins, biogeographic regions. Towns, climate and prices come from the catalogue in the app.

**Where it lives.** continent-app/src/browse/RegionPage.jsx, continent-app/src/lib/regions.js. Pipeline: pipeline/regions/. Docs: docs/REGIONS.md, archive/docs-2026-11/COVERAGE.md. Latest reports: T450, T456.

**Limits.** No coverage footer on the region page, since its ids do not match the NUTS3 keys in `coverage.json` (register T160-e). `coverage.json` lacks its contract block until `coverage.py` runs again (registers T160-a, T211-c).

### Country page

**What it does.** A country page shows the photos it is known for, one line of what it is known for, a typical day price a person, the best months, how people get around, and "Plan a trip in {country}". Then three rails (its best, its weeks, its cities), doors to its outdoor layers, coasts and ranges, and every place on Places.

**How it works.**
1. Address `#country={ISO2}`, shown over any view.
2. Typical day: the median `dayEur` of the country's places. It is marked as an estimate when half or more of those figures are national stand-ins.
3. Best months: each place votes for its best months; months with at least 60 percent of the top vote count are shown.
4. Getting around: share of places with `car_needed`: over 0.6 says most need a car, over 0.3 some, else few.
5. Its best: places with a `country_badge`, sorted by `country_rank`. Its cities: metro or city places not already in the best rail, up to 12. A place shows once on the page.
6. A section with no content is not drawn.

**Data behind it.** The catalogue rows Explore holds (ratings and `country_rank` from `python run_pipeline.py fame`), `public/country_insights.json`, journeys from `public/journeys/`, region index from `public/region/`.

**Where it lives.** continent-app/src/browse/CountryPage.jsx, continent-app/src/browse/CountryGallery.jsx. Pipeline: pipeline/regions/, pipeline/intake/. Docs: docs/REGIONS.md, archive/docs-2026-11/COVERAGE.md.

**Limits.** Five places are not reachable by links from any country page (register T225-a). No share card image for country pages (register T212-c).

### Shortlist (saving places)

**What it does.** A save control on cards and pages keeps a place, trip, journey, region, trail, beach, lake, mountain or cycle route. Saved places lead Explore as "Your shortlist", and a Saved toggle shows only them. Saves can be put into named lists with notes, and Carta remembers the day price at the moment of saving.

**How it works.**
1. A save is a key `kind:id` (`FAV_KINDS = ['dest','trip','journey','region','trail','beach','lake','mountain','cycle']`). Trails, beaches, lakes, mountains and cycle routes use `kind:cc/id`, because their files are per country. A bare id in an old link reads as a destination.
2. Saves live in the URL (`fav=`, joined by dots; `favonly=1` for the Saved view), in local state (`continent.state.v1`), and sync to the account inside `user_settings` (`useAccountSync`).
3. On save, the destination's day price at that moment is stored (`noteSaved`); on unsave the record is kept 60 seconds for an Undo (`REVIVE_MS = 60_000`).
4. Lists (`carta.savedLists.v1`): up to 30 lists (`MAX_LISTS`), names up to 60 characters, notes up to 140 (`MAX_NOTE`). A key may sit in several lists; "All saved" is every favourite and is not stored.
5. Saving a place is free; the `save` paywall gate is used for saving trips in the planner, not for this control.
6. After a new save, Carta may ask one taste question learned from the saved places (`learnFacet`).

**Data behind it.** No pipeline data; browser storage, the URL and the Supabase `user_settings` row.

**Where it lives.** continent-app/src/lib/favorites.js, continent-app/src/lib/savedLists.js, continent-app/src/App.jsx (`toggleFav`), continent-app/src/hooks/useAccountSync.js, continent-app/src/hooks/useFavoriteItems.js, continent-app/src/browse/ExploreRails.jsx.

**Limits.** `saved_trips` and `user_settings` have no row-level security test fixture (register T082-b).

---

## Scores, ranking and seasons

This section explains every number Carta puts on a place, a sight or a walk, and how lists are ordered by them. It also covers the month logic: climate, crowds, best months and sea temperature.

Every rating number lives in one file, `continent-app/config/rating.json` (version `v5.0-r3`). The pipeline reads it through `pipeline/rating_config.py` and the app imports the same file in `continent-app/src/lib/rating.js`, so the two cannot drift. All calibrations (class curves, percentile breakpoints, fallback fit) are measured once and frozen in `reports/rating_reference_v5.json`. A normal run refits nothing, so adding a place moves no other place's score. Changing a number is a model change: bump `version`, then run `apply_rating_layer.py --recalibrate --version <new>`.

---

### Place rating (Carta rating v5)

**What it does.** Every place gets one score from 0 to 10 with one decimal, and a band word such as "Excellent". The score answers "is this worth the trip, for a place of this kind?". A village is compared with villages, not with Paris, so size and fame do not buy points. The same score and word appear on cards, the place page, the map pins, the PDF and the planner.

**How it works.**
1. Four parts, each on 0 to 10, are blended into a raw score Q (`weights_v5`):

   | Part | Weight | What it measures |
   | --- | --- | --- |
   | Appeal (A) | 0.60 | A judgement of the place as a whole: a hand score, else a rubric score (see "Appeal"). Read through the per-class appeal scale. |
   | Beauty (B) | 0.15 | What you see within 5 km (see "Beauty"). |
   | Depth (D) | 0.15 | How much there is to do within about 30 minutes (see "Depth"). |
   | Recognition (R) | 0.10 | Membership of juried registers such as UNESCO (see "Designations"). |

   `Q = 0.60 A + 0.15 B + 0.15 D + 0.10 R`.
2. A place with no hand and no rubric appeal uses a frozen least squares fit instead: `Q = c1 x recognition + c2 x beauty + c3 x depth + c4`, coefficients in the reference (`fallback`, needs at least `fallback.min_n` = 200 curated places to fit). Its output is then read off the class's frozen anchor curve (`appeal_scale.apply_anchor_curves`).
3. Golden pair guard: where `tests/golden_ratings.json` says a hand-scored place beats an estimated one, the estimated score is clamped to 0.1 below it.
4. Class curve (`class_curve`): Q runs lower than the appeal scale, so each class (metro, city, town, village, area) reads Q through its own frozen four-knot curve. Lowest Q maps to the class's lowest appeal, median Q to the median appeal, the Q at the top `top_share` = 2.5% to `top_score` = 9.0, and the highest Q to the class ceiling (`appeal_scale.class_ceiling`: metro 10.0, city 9.7, area 9.7, town 9.6, village 9.6). Above the last knot the top slope is extended, then capped at the ceiling. The curve is monotone, so it never reorders places.
5. The score is rounded to one decimal. A place with no hand or rubric appeal is capped at `estimated.cap` = 8.9, so an estimate can never read Exceptional.
6. Band from `bands.cutoffs` (best first, `bandForScore` in `rating.js`):

   | Band | Lower cutoff |
   | --- | --- |
   | Exceptional | 9.0 |
   | Excellent | 8.3 |
   | Very good | 7.6 |
   | Good | 6.9 |
   | Pleasant | 6.0 |
   | (no band) | under 6.0 |

7. Confidence (v5): `curated` (hand score), `rubric` (rubric score) or `estimated` (fallback). The app maps curated and rubric to "measured" and shows an estimate as "about 8.1" (`ratingWords`, key `rating.about`).
8. Gateways: in a multi-airport city only one row is rated. The other airport rows get `gateway_of` and lose their rating, so no list shows a city twice (`isGateway`, `gatewayCity`).
9. Validation gate (`apply_rating_layer.py validate`): the run refuses to write if a named place falls under its expected scaled appeal (`appeal_scale.EXPECTED`), a famous place falls under its `FAMOUS_FLOOR`, an airport town reaches its `AIRPORT_TOWN_CEILING`, a non-gateway row has no rating, or an estimated place scores 8.5 or more with very low fame and no corroborating register.
10. Legacy keys still on the wire: `tier` 3/2/1 with cutoffs 8.7/7.8/6.9 and labels "Worth the journey", "Worth a detour", "Worth a visit" (`tiers`). Old shared links with `mt=1..3` or `xv=1..3` map to Good, Very good and Excellent (`LEGACY_TIER_BAND`).
11. In the app: the Explore rating filter offers three "and up" steps, Good, Very good, Excellent (`FILTER_BANDS`). Map pins and star colours use three ink steps: Exceptional and Excellent darkest, Very good next, Good and Pleasant lightest (`inkStep`). The default Explore sort is by `rating.score`, falling back to `beauty.score` (`useExploreCatalog.js`).

**Data behind it.** `dest.rating` = `{score, tier, label, hidden_gem, confidence, inputs_present, fame, components, source, band, why}` in `app_data/app_data.json`, mirrored to `continent-app/public/app_data.json` and shipped by `continent-app/scripts/sync-data.mjs`. Inputs: `app_data/curated_appeal.json` (hand scores), the rubric scores file, `cache/dest_pageviews.json`, `cache/urban_fabric.json`, POI lists, the nature wires. Run by `python run_pipeline.py --only fame` (monthly: pageviews, designations, beauty, place class, rating) and again at the end of `poi_significance` (monthly).

**Where it lives.** App: `continent-app/src/lib/rating.js`, `continent-app/config/rating.json`, `continent-app/src/components/RatingBadge.jsx`. Pipeline: `pipeline/rating_layer.py`, `pipeline/apply_rating_layer.py`, `pipeline/appeal_scale.py`, `pipeline/rating_config.py`. Docs: `archive/docs-2026-11/RATING_RUBRIC.md`.

**Limits.**
- `rating_layer.py`'s module docstring still describes rating v4 (weights 0.70/0.13/0.06/0.11). That is the rollback path (`formula: "v4"`), not what runs.
- `rating.month_scores` (a score per month) is read by `lib/match.js` and `lib/placeOverview.js` but no pipeline code writes it, so the base score is always used. Not found in code (register T504-d).
- POI lists are cut at 52 items for 1,674 places, which skews depth for large places (T761-c).
- Catalogue problems flagged by scorers (wrong classes, duplicate rows, airport rows standing for cities) are open (T755-a, T758-d, T760-b).

---

### Appeal: hand scores and the rubric

**What it does.** Appeal is the judgement part of the rating, 60% of the score. It says how strong a place is for its class, the way a guidebook editor would.

**How it works.**
1. Source order (`load_appeal`): a hand score in `app_data/curated_appeal.json` always wins; else a rubric score (`source: rubric`).
2. Rubric (`archive/docs-2026-11/RATING_RUBRIC.md`): applied by Claude in Claude Code sessions, never through an API, one fact card at a time. Classes: metro (300,000 people or more), city (50,000 or more), town (8,000 or more), village (under 8,000), area (no centre, or nature-tagged under 1,200). Five criteria scored 0 to 10 for the record (setting, character, signature sights, atmosphere, uniqueness). The band test decides the band; anchors in `continent-app/config/rating_anchors.json` place the score inside it. Low-confidence cards stay at 7.5 or below unless a source shows more.
3. Drift check: each shard holds five hidden hand-scored controls; their rubric scores must sit within 0.5 of the hand scores on average, else the shard is rescored. `pipeline/validate_rubric_scores.py` checks schema, ranges, band match, six languages and no em dash.
4. Per-class appeal scale (`appeal_scale.rescale`): appeal at or below the class median is unchanged. Above it, `t = min(1, (a - median) / (best - median))` and `out = median + (ceiling - median) x t^gamma`, with `gamma` = 0.7 and the class ceilings above. Median and best per class are frozen in the reference.
5. Reason sentence: one English sentence per place (`rating.why`, hand reason first, then rubric reason), at most 25 words. Other languages are lazy files `public/app_data/why_i18n/<lang>.json`, loaded by `loadRatingWhy`.

**Data behind it.** `app_data/curated_appeal.json` (about 1,570 hand scores per the rubric doc), `data/rating/rubric_scores/shard_XX.json`, `data/rating/fact_cards/`, `app_data/curated_why_i18n.json`.

**Where it lives.** `pipeline/rating_layer.py` (`load_appeal`, `load_why_en`), `pipeline/appeal_scale.py`, `pipeline/validate_rubric_scores.py`, `archive/docs-2026-11/RATING_RUBRIC.md`, `continent-app/config/rating_anchors.json`.

**Limits.** The rubric needs a Claude Code session per shard; new places arrive as estimates until scored. The owner spot-checks 5% of each round (`reports/rubric_spotcheck_v5.md`).

---

### Beauty

**What it does.** Beauty measures what you see within 5 km of the centre: the built town, the natural setting, the water and famous views. It is 15% of the score and is also shown as 1 to 5 gems.

**How it works.** Beauty v2 (`compute_beauty_v2`, live because `beauty.live` = true):

| Component | Weight | Measure |
| --- | --- | --- |
| urban | 0.35 | Built fabric from `cache/urban_fabric.json`: `0.30 x pedestrian core + 0.40 x heritage density + 0.30 x ensemble + 0.12 if city walls`, capped at 1. Ensemble = 0.40 square + 0.30 canals + 0.30 bridges. Saturation points: `URBAN_PED_KM` 0.5, `URBAN_HER_DENSITY` 25, `URBAN_CANAL_M` 900, `URBAN_BRIDGES` 3. |
| nature | 0.35 | `1 - (1 - tags) x (1 - peaks)`: scenic tags (`NATURE_TAG_WEIGHTS`, e.g. fjord 1.0, alps 0.9) summed and saturated at 2.0, ignoring the register tags `national-park` and `unesco`; peaks = best two rated peaks within 5 km. |
| beach (water) | 0.20 | Best two rated beaches and lakes within 5 km. |
| iconic | 0.10 | The curated famous-view list only (`ICONIC_CURATED`, e.g. Santorini 1.0). |
| heritage | 0.0 | UNESCO proximity, still measured for the UNESCO filter and the culture match, but counted in recognition instead. |

- Item value: a nature item scored 5.0 is worth 0, 9.0 is worth 1 (`item_floor` 5.0, `item_span` 4.0). "Best two" = best item in full, the second closes 25% of the gap (`second_item_share`).
- `score01 = min(1, max(0.06, base + 0.20 x standout))`, where standout is the largest component other than urban and heritage (`standout_bonus` 0.20, `score_floor` 0.06). Displayed as `score01 x 10`, one decimal.
- Gems (`assign_gems`): frozen quantile cutoffs from the reference: 1 gem bottom 20%, 2 gems 20 to 45%, 3 gems 45 to 72%, 4 gems 72 to 90%, 5 gems top 10%.
- Multi-airport cities share one beauty block (`dedupe_multi_airport_cities`).

**Data behind it.** `cache/urban_fabric.json` (OSM), rated nature rows in `continent-app/public/{beaches,lakes,mountains}/??.json`, UNESCO cache. Run inside `python run_pipeline.py --only fame` via `pipeline/apply_beauty_layer.py`.

**Where it lives.** `pipeline/beauty_layer.py`, `pipeline/apply_beauty_layer.py`.

**Limits.** A comment block in `beauty_layer.py` still says beauty v2 is "NOT LIVE"; the config switch says it is, and the code follows the config. The comment also records that v2 measured beauty vs log population at +0.152 against a 0.12 gate.

---

### Depth

**What it does.** Depth says how much there is to do in and around a place, across eight kinds of activity. Variety counts more than volume, so ten churches do not beat a mix of sights, nature and food.

**How it works.** (`depth_items`, `depth_raw`, `depth_map` in `rating_layer.py`, `depth.live` = true)
1. Items counted:
   - POIs labelled must-see (weight 1.0) or recommended (0.5) within the place's own radius (`poi_own_km`: metro 15 km, city 10, town 5, village 5, area unlimited). Each POI weight is also multiplied by `sig / 3` (`poi_weight_by_sig`).
   - Rated beaches, lakes and peaks scored 7.6 or more (`nature_min_score`) between 5 km (beauty's radius) and 25 km (`reach_km`, about 30 minutes: 25 km x 1.3 detour at 65 km/h).
   - Hiking and cycling routes rated 7.6 or more within 25 km, in the "active" category, weight 1.0.
   - A nature POI within 0.3 km of a counted nature item is skipped, so no fact counts twice.
2. Items are sorted into the eight categories of `poi_categories` (sights, museums, nature, food_drink, active, family, nightlife, markets).
3. Within a category the i-th best item counts `weight / i`, up to 4 items (`per_category_max`). Each category covered adds 0.25 (`category_bonus`).
4. The raw sum is read as a percentile within the place class on frozen breakpoints (201 knots), giving 0 to 1, shown as 0 to 10. Written to `rating.components.highlights` (renamed `depth` in the app via `PART_ALIASES`).

**Data behind it.** `activities.items_full` in the master, nature wires, route lists. Same pipeline tasks as the rating.

**Where it lives.** `pipeline/rating_layer.py`.

**Limits.** No shipped POI kind is food, drink or market, so those categories are empty (T761-f). The 52-item POI cap truncates big cities (T761-c).

---

### Designations and recognition

**What it does.** Recognition credits places that an outside jury has already picked: UNESCO World Heritage, "most beautiful villages" associations, heritage towns, national parks and similar. It is 10% of the score and also powers lines on the place page.

**How it works.**
1. `apply_designations.py` attaches `dest.designations` = `[{kind, registry, name, qid, match_km}]`. A designation lands on a place within 4 km, or within 12 km when the names also agree. A UNESCO site in open country attaches to the nearest place.
2. Register weights (`recognition.weights`): unesco_whc 1.00, beautiful_village 0.95, heritage_town 0.72, spa_town 0.68, national_park 0.62, capital_of_culture 0.55, unesco_tentative 0.50, eden 0.50, cittaslow 0.45, blue_flag 0.35, unesco_geopark 0.30, market_town 0.25, biosphere_reserve 0.25; any other kind 0.40 (`default`).
3. Formula (`acclaim01`): start from the best register's weight; each further register (up to 3, `extra_max`) adds `(1 - score) x 0.18 x its weight` (`extra`). Capped at 1, shown as 0 to 10.
4. Corroborating registers (`corroborating`: unesco_whc, beautiful_village, heritage_town, spa_town, national_park) let a high-scoring low-fame place pass the validation gate.

**Data behind it.** Register harvests via `pipeline/place_registries.py`; `python run_pipeline.py --only fame` (monthly) and `--only unesco` (quarterly).

**Where it lives.** `pipeline/apply_designations.py`, `pipeline/place_registries.py`, `pipeline/rating_layer.py` (`acclaim01`).

**Limits.** Matching is by coordinate and name; a misplaced register entry can credit a neighbour (flagged in T758-d).

---

### Fame and hidden gems

**What it does.** Fame is how much the world reads about a place. It never changes the score. It decides the "hidden gem" flag: a place that rates high but few people look up.

**How it works.**
1. Fame = average daily Wikipedia pageviews over a rolling 12 months (`cache/dest_pageviews.json`), stored as `rating.fame`.
2. The fame percentile is read on frozen breakpoints per city slot (`fame.knots` 201), so new places do not move it.
3. Hidden gem (`hidden_gem` config, using the legacy v4 tier): tier 2 or 3 and fame percentile at most 0.40; or tier 1 and at most 0.20; or curated as a gem with score at least 7.0 and fame percentile at most 0.6.
4. Fame is also used by the taste profile ("hidden" like, and the food rule: metro or city with fame 1,200 or more) and by the validation gate's obscure-star check.

**Data behind it.** Wikipedia pageviews API via `pipeline/harvest_pageviews.py dests`, after `pipeline/resolve_dest_articles.py --all`. `python run_pipeline.py --only fame`, monthly.

**Where it lives.** `pipeline/rating_layer.py`, `pipeline/apply_rating_layer.py`.

**Limits.** Places whose name resolves to no single article (Keswick, Richmond) have no fame measurement and score fame 0. The hidden gem rule still reads the v4 tiers, not the v5 bands.

---

### Rating breakdown sheet

**What it does.** Tapping the score in a place page's head opens a sheet that explains it: the score and band, one reason sentence, where the place stands in its country and in Europe, and the four parts with a bar each.

**How it works.**
- Reason: `ratingWhy` loads the reader's language file, English as fallback.
- In Europe: from `rating.class_rank.pct`. Inside the top 10% (`CLASS_RANK_MIN_PCT` 90) it reads "Top n% of villages" with `n = max(1, round(100 - pct))`; otherwise "above n%".
- In the country: `share = country_rank / country_n`. Rank 1 reads "best in the country"; share at most 0.1 reads "top n%"; otherwise "above (1 - share) x 100%".
- Parts in order appeal, depth, beauty, recognition, each value out of 10 (`ratingPart`). Labels carry the reach: beauty 5 km, depth 30 minutes (`PART_REACH`).
- No "Measured" word is shown.

**Data behind it.** `dest.rating` plus `country_rank`, `country_n`, `rating.class_rank` from the country context layer.

**Where it lives.** `continent-app/src/browse/RatingSheet.jsx`, `continent-app/src/lib/rating.js`.

**Limits.** MAP.md names `RatingBreakdown.jsx`; that file does not exist. The sheet is `RatingSheet.jsx`.

---

### Country and class standing

**What it does.** Next to the absolute score, each place knows its rank in its own country and its percentile within its class across Europe. This keeps a country with few high scorers readable ("one of the best in Finland").

**How it works.** (`country_context_layer.py`)
- One slot per city (airports share it), slot score = best score of its rows.
- Competition ranking, ties share a rank.
- `country_percentile = round(100 x (n - rank) / (n - 1))`.
- `country_badge`: `top_of_country` for rank 1, `best_of_country` for ranks up to `max(3, round(0.08 x slots))` (`MIN_BADGED`, `TOP_SHARE`).
- `class_percentile` the same formula within the place class, also written as `rating.class_rank = {class, pct, scope: "europe"}`.
- The layer reads `rating.score` only and refuses to write if any score moved.

**Data behind it.** `python run_pipeline.py --only country_context`, weekly.

**Where it lives.** `pipeline/country_context_layer.py`, `continent-app/src/lib/rating.js` (`classRank`, `classRankLine`).

**Limits.** None found beyond those of the score itself.

---

### POI significance and labels (must-see, recommended, worth a look)

**What it does.** Every sight in a place gets one of three labels: Must-see, Recommended or Worth a look. Travellers see which few things not to miss, rather than a score on 150,000 sights.

**How it works.**
1. Significance (`score_significance.py compute`). For each live POI (duplicates and noise excluded), a composite score from open signals (`significance.weights`):

   | Signal | Weight |
   | --- | --- |
   | Wikipedia pageviews (log, z-scored on frozen mean and spread) | 0.30 |
   | Wikidata sitelinks (log, z-scored) | 0.30 |
   | Heritage designation (1, or up to 1.5 from visitor counts: `0.5 + log10(visitors) / 6`) | 0.15 |
   | Wikivoyage See/Do listing, weighted by listing position | 0.15 |
   | Old harvest rate / 3 (prior) | 0.10 |
   | Documentation: 0.5 for an image + 0.5 for a description | 0.06 |

   Articles about a town, admin area or station have their views and sitelinks zeroed. POIs without a wiki link can borrow sitelinks from `cache/wikidata_landmarks.json` (shared name within 160 m, or any name within 70 m).
2. `sig = 3 x Europe-wide percentile` on frozen breakpoints (401 knots): the absolute 0 to 3 significance.
3. Local quotas (an intermediate `rate`): `blend = 0.6 x percentile within the place + 0.4 x Europe percentile`. Rate 3 for the top 12% (at least 1 when the place has 6 or more items, at most 12), only if corroborated (wiki link, heritage, Wikivoyage or landmark match). Rate 2 for the next 28%. Rate 1 for the rest. Heritage POIs with 15 or more sitelinks are lifted to at least rate 2.
4. Labels (`poi_labels.py`, which runs after significance and sets the final rate):
   - POIs inside the place (`depth.poi_own_km` radius) are sorted by `sig`.
   - Must-see: the top ones with at least national recognition (a heritage listing, or Wikipedia in 3 or more languages, `national_min_wiki_languages`), up to the class cap (`must_see_cap`: metro 8, city 5, town 3, village 2, area 3; default 3).
   - Recommended: the next POIs by sig, up to 3 x the cap (`recommended_factor`).
   - Worth a look: every other POI. Duplicates get no label.
   - `rate` is then derived: must_see 3, recommended 2, worth_a_look 1 (`label_rate`).
   - Each POI also gets a category from `poi_categories.kind_category` and a `free` tag only where OSM fee data exists.
5. In the app, `poiLabel()` reads `label`, or falls back to `rate` (3, 2, 1) for POIs from live city research.
6. The run refuses to write if the anchor validation gate fails (`gate_min_anchor_recall` 0.80).

**Data behind it.** `cache/poi_significance.json`, `logs/significance_report.json`, pageview, Wikidata and Wikivoyage caches; shipped as `public/poi/{id}.json`. `python run_pipeline.py --only poi_significance`, monthly.

**Where it lives.** `pipeline/score_significance.py`, `pipeline/poi_labels.py`, `continent-app/src/lib/rating.js` (`poiLabel`, `POI_LABELS`). Doc: `archive/docs-2026-11/2.SIGNIFICANCE.md`.

**Limits.** The significance weights sum to 1.06, not 1. "A must-see closed in the chosen month becomes recommended" needs opening months no source carries; not built. The 52-item POI cap applies here too.

---

### Nature ratings on the place ladder (beaches, lakes, peaks, walks, cycle routes)

**What it does.** Beaches, lakes, peaks, walks and cycle routes get a 0 to 10 score and the same five band words as places. Each also gets a rank line such as "Best walk in the region" or "#2 of 41 lakes in Austria".

**How it works.** (`nature_tiers.py`)
1. Each kind keeps its own parts and weights from its scorer module (beaches `beauty_index`, lakes `lake_index`, peaks `peak_index`, trails `rate`, cycling `cycle_index`).
2. Blend: `score01 = sum(w x part) + bonus x standout`, capped at 1. A missing part counts at the kind's frozen median, never renormalised.
3. Measured share below 0.5 (`min_measured_share`) gives no score (`confidence: unscored`; the app shows a NotYet placeholder). All parts measured gives `measured`; otherwise `partial`.
4. `score01` is placed on a frozen Europe-wide percentile within the kind, then onto the ladder (`nature.shares`, `nature.ladder`): top 3% Exceptional, next 9% Excellent, next 18% Very good, next 25% Good, next 25% Pleasant, rest no band. Ladder points: percentile 0 = 4.0, 0.20 = 6.0, 0.45 = 6.9, 0.70 = 7.6, 0.88 = 8.3, 0.97 = 9.0, 1.0 = 9.8, linear in between, floored (not rounded) to one decimal.
5. Rank line: the smallest scope with at least 5 scored items of that kind (`rank_min_items`): NUTS 2 region first, then country. Ties share a place.
6. Facts (difficulty, km, climb, Blue Flag, water class, way up, paved share...) sit beside the score, never inside it.

**Data behind it.** Writes `v5 = {score, band, rank, facts, confidence}` on every rated row of `continent-app/public/{kind}/{CC}.json` and `top.json`. `python run_pipeline.py --only rating_v5_profile`, weekly.

**Where it lives.** `pipeline/nature_tiers.py`, `continent-app/src/lib/rating.js` (`natureRating`, `natureRankLine`, `natureFacts`).

**Limits.** Most fact fields are empty (peak difficulty and season 100%, Blue Flag 99%, trail SAC 83%, T761-e). The old `score`/`rating`/`tier` keys stay on the rows beside `v5` until R4 (T761-g).

---

### Trail rating (0 to 10)

**What it does.** Every published walk has a 0 to 10 score and a list of reasons ("three named summits, the highest at 2,410 m"). It is built only from open data a reader could check: no reviews are used.

**How it works.**
1. Eight raw parts (`rate.py RAW`, weights `WEIGHTS`, model `open-signals-v2`):

   | Part | Weight | Raw measure |
   | --- | --- | --- |
   | scenery | 0.22 | Weighted scenic features (summits, viewpoints, waterfalls, lakes, castles, huts) / (km + 1) |
   | relief | 0.16 | `1.6 x ln(1 + ascent per km) + 0.5 x ln(1 + top height) + 0.6 x ln(1 + height spread)` |
   | shape | 0.15 | Loop or figure eight 1.0, point to point 0.55, out and back 0.40 |
   | prominence | 0.14 | `0.6 x (has wikidata/wikipedia) + 0.4 x popularity / 100` |
   | designation | 0.13 | Network: iwn 1.0, nwn 0.85, rwn 0.6, lwn 0.35, lcn 0.3, else 0.2 |
   | photos | 0.12 | Count of usable Commons photos on the line |
   | variety | 0.05 | Number of distinct highlight kinds |
   | surface | 0.03 | Surface quality minus road share (0.5 when unknown) |

   Length is deliberately not a quality term.
2. Score the app shows (v5, see "Nature ratings"): each raw part is placed on a frozen Europe-wide percentile, blended with the weights above, then read onto the place ladder. The app reads `row.v5` through `trailRating` = `natureRating`.
3. Older published `rating` (still written): each part is a percentile within the walk's NUTS 3 region if it has at least 20 rows (`REGION_MIN_ROWS`), else within the country. The weighted composite is stretched per country: `rating = 4.0 + 5.8 x (0.12 + 0.88 x (c - min) / (max - min))` (`FLOOR` 4.0, `CEILING` 9.8, `PAD` 0.12). The wire order is this rating order.
4. Reasons are codes, not prose, with thresholds such as 3 summits (`MANY_SUMMITS`), 800 m climb (`BIG_CLIMB_M`), 45 m per km steep, 1,800 m high, 4 photos, 1.2 scenic weight per km, 3 kinds for variety, 20% road share warning; "good day out" needs climb at most 800 m and at most 360 minutes.

**Data behind it.** The trails lab Postgres (`tools/trailslab/`, Docker), Copernicus DEM, Commons photos, OSM. `python run_pipeline.py --only trails_rate` runs after `trails_curate`, `trails_scenic`, `trails_images`, `trails_attributes`, then exports the wire; `rating_v5_profile` adds `v5`.

**Trail photographs and their credit (T1093, D7 and K2).** `trails_images` (`pipeline/trails/trail_images.py`) searches Commons by coordinate along each route line and keeps a hero plus a gallery. Only licences that allow reuse with credit are kept: CC0, CC BY, CC BY-SA (any version) and public domain (`pipeline/trails/photo_licence.py`, `reusable()`), tested at three points: `pick()` (a forbidden file never takes a slot), `store()` and the export (`export_wire.credited()`, together with the T280 name gate). The card's `img` carries `lic`, `by`, `licUrl`, `page` and the trail page credits it under the photograph (`PhotoGallery`: author, licence, link to the file page). The harvest is resumable (a finished route is stored or marked empty, and the per-route candidate cache sits in `cache/trails/photos/`), shares one request limiter across workers (`REQUEST_PACE_S` 0.8 s, `--pace`), can run emptiest country first (`--worst-first`, from the shipped wire) and stops cleanly after `--max-minutes`. The author is Commons `Attribution` when set, else `Artist`.

**Where it lives.** `pipeline/trails/rate.py`, `pipeline/trails/export_wire.py`, `pipeline/nature_tiers.py`, `continent-app/src/lib/trailCards.js`, `continent-app/src/browse/TrailPage.jsx`. Docs: `archive/docs-2026-11/TRAILS.md`, `archive/docs-2026-11/TRAILS_DATA_QUALITY.md`.

**Limits.** Relief reads stored ascent per km, so 488 routes drawn downhill under-score (T286-c). The lab still runs on the laptop (T784-a). The worker does not rerun rate.py after way tag refreshes (T647-e).

---

### Vibe scores

**What it does.** Each place gets a 0 to 100 score for up to eight of twenty vibes (quiet, old town, food, romantic, family, beach, island, mountain, hiking, lake, castles, art, nightlife, nature, views, spa, city, village, unesco, adventure). They power Explore's guided search and seed the taste profile.

**How it works.** (`guided_search_layer.py build`)
1. Facts first: for a vibe with a distance rule, a matching category tag plus the thing within its distance scores 100, the thing close alone 80, the tag alone 70. Without a distance rule a tag scores 100. Hiking needs a minimum count of trail ends and is not given to cities.
2. Text second: each place's description (city, country, blurb, categories, tags, Wikivoyage lead, sight names) is embedded locally with `thenlper/gte-small` and compared to each vibe's one-line description. Only the top 10% by similarity scores, mapped to 55 to 75; descriptions under 80 characters score nothing. Text never outranks a fact.
3. Merge: the higher of fact and text; keep the top 8 vibes scoring at least 55.
4. The same file holds `nb` (km to the nearest rated beach, trail start, lake and peak within 25 km) and named areas.

**Data behind it.** `continent-app/public/search/guided.json`, embeddings cached in `cache/guided/vibes.npz`. Manual: `python pipeline/guided_search_layer.py`; not a `run_pipeline.py` task.

**Where it lives.** `pipeline/guided_search_layer.py`, `continent-app/src/lib/guidedSearch.js`.

**Limits.** The docstring says text counts in the "top fifth"; the code uses the top tenth. New places have no vibe until the script is rerun by hand (T439-b). Golden-set misses are vibe data (T442-c).

---

### Place taste profile

**What it does.** Each place gets a 0 to 1 value for each of the twelve "what do you like" answers of the planner: beach, hiking, lakes, culture, city, food, nightlife, hidden, cycling, ski, wellness, islands. These feed the personal match and the "why it fits" bars. They never change the place's own score.

**How it works.** (`place_taste_profile.py raw_values`)
1. A fact value per like:
   - beach (within 20 km), hiking, lakes, cycling (within 25 km): `0.7 x band value of the best item + 0.3 x min(Very-good-or-better count, 5) / 5`; band values Exceptional 1.0, Excellent 0.85, Very good 0.7, Good 0.5, Pleasant 0.
   - culture: max of designation (UNESCO 1.0, heritage town 0.7, capital of culture or tentative 0.5) and `0.5 x min(heritage POIs, 20)/20 + 0.5 x min(museums, 10)/10`.
   - city: class value (metro 1.0, city 0.7, town 0.3, village and area 0).
   - food: `0.5 x min(food POIs, 5)/5 + 0.5 x min(markets, 3)/3`; a food, wine or beer tag counts as a full food vibe, a metro or city with fame 1,200 or more as 0.6.
   - nightlife: `max(0.6 x class value, 0.6 x min(venues, 3)/3) + 0.4 x min(venues, 5)/5`.
   - hidden: 1.0 if hidden gem, else `max(0, 0.5 - fame percentile)`.
   - ski: `0.6 x min(ski POIs, 3)/3 + 0.4 x min(lift peaks within 25 km, 3)/3`.
   - wellness: 1.0 for a spa town, else `min(bath POIs, 3)/3`, times 0.2 in a metro or city.
   - islands: 1.0 if tagged island.
2. Combine with the vibe from `guided.json` (max of the mapped vibes / 100). A fact under 0.25 (`WEAK_FACT`) with a vibe under 0.5 counts as 0. A vibe with no fact behind it gives 0 (except food). Otherwise `raw = 0.5 x vibe + 0.5 x fact`, or the fact alone when there is no vibe.
3. Food and nightlife with neither vibe nor venues ship as null (not measured), and the match leaves them out.
4. Raw values are read as frozen percentiles (201 knots), so 0.9 means the same everywhere.
5. Carried along: `size`, `crowd_by_month`, `car_need`, `cost_level` (mid-range meal price), `tmax_by_month`.

**Data behind it.** `dest.taste = {likes: {key: [value, fact]}, size, crowd_by_month, car_need, cost_level, tmax_by_month}`. `python run_pipeline.py --only rating_v5_profile`, weekly, after `nature_tiers.py`.

**Where it lives.** `pipeline/place_taste_profile.py`, `continent-app/src/lib/taste.js`, `continent-app/src/lib/match.js`.

**Limits.** No food source exists, so food relies on tags and fame (T761-f). The persona gate shows culture and city reading like defaults (T786-a). Taste facts added about 0.25 MB to first paint (T789-a).

---

### Personal match and "For you"

**What it does.** When a traveller has set their likes, Carta shows how well each place fits ("82% match") and offers a "For you" sort in Explore. In Help me choose it ranks whole priced trips by fit, quality and budget.

**How it works.**
1. Fit of one place (`match.js fit`): `F = sum(w x p) / sum(w) x product(conflicts)`, clamped 0 to 1.
   - w = 1 per chosen like (`like_weight`), 0.5 for size (`size_weight`) and 0.5 for quiet or lively (`quiet_weight`).
   - p = the place's taste value; for size, the `size_fit` table (e.g. a city lover: metro 1, city 0.85, town 0.4, village 0.1); for quiet, `1 - crowd tier / 3` in the month (or the year's mean); for lively, the nightlife value.
   - Conflicts: busy month (tier 2 or more) for a quiet traveller x0.8; car needed for a no-car traveller x0.75; month high over 30 C when avoiding heat x0.85 (Help me choose only).
   - No weighable answer returns null and the screen keeps its quality order.
2. The match shows from F = 0.55 (`show_min`); the Strong match filter needs 0.70 (`strong_min`).
3. Explore "For you" (`forYou`, `sortForYou`): `Q + lambda x (F - 0.5)`, with `lambda` = 2, so the match moves a place by at most one point. Q is the month score if present, else the score. Unscored places keep their quality order below. With no taste the sort is the rating order.
4. `for_you_default` = false: For you is a sort the traveller picks, never the default, and the "Picked for you" rail stays off until persona gate 7 passes.
5. Trips for you (`recommend/rank.js rankTrips`, `config/recommend.json`):
   - Answers = F mixed with the persona fit P: `0.75 x F + 0.25 x P` (`persona_w` 0.25).
   - `blend = 0.6 x answers + 0.4 x quality / 10` (`answers_w`, `quality_w`); either side alone when the other is missing.
   - Budget sink: minus `0.3 x (euros over budget) / 100` points out of 10 (`sinkPer100`), divided by 10 on the 0 to 1 scale.
   - Flight lever: trips sorted by the chosen flight preference sink by up to 1.5 points (`FLIGHT_PULL = 5 x 0.3`); ties share; trips with no flight facts sit in the middle.
   - A trip qualifies when its strongest chosen like reads at least 0.5 (`mainLikeMin`) where measured and no hard conflict (`car`) stands.
   - Sort: qualified first, then score, then id. Badge = `round(score x 100)`, capped at 99, hidden when under 55.
   - Up to 3 reasons per card (`reasons.max`), persona reason first, plus one catch.

**Data behind it.** `dest.taste`, `dest.rating`, the traveller's saved taste and Help me choose answers.

**Where it lives.** `continent-app/src/lib/match.js`, `continent-app/src/lib/taste.js`, `continent-app/src/lib/recommend/rank.js`, `continent-app/src/lib/recommend/reasons.js`, `continent-app/src/lib/recommend/persona.js`, `continent-app/src/hooks/useExploreCatalog.js`, `continent-app/config/rating.json` (`match`), `continent-app/config/recommend.json`.

**Limits.** Persona gate 7 fails (85 of 120), so For you stays opt-in (T786-a). Explore has no avoid-heat answer (T787-a). The persona does not touch Explore's For you (T877-d). The T879 to T884 Trips for you batch had not run on the real catalogue at report time (T884-b).

---

### Climate strip and best months

**What it does.** Each place shows twelve months as bars: taller and darker means more comfortable weather for sightseeing, with the daytime high above each bar and the best months named. A second block lists rain days, wind, sunshine hours, water temperature and temperature at altitude.

**How it works.**
1. Monthly normals from NASA POWER (2001 to 2020), lapse-corrected from the model cell's height to the place's height at 6.5 C per km, capped at 5 C (`LAPSE_C_PER_KM`, `MAX_LAPSE_C`).
2. Comfort index 0 to 100 (`_comfort`): `0.60 x temp + 0.25 x dry + 0.15 x sun` (`COMFORT_W`).
   - temp: 100 for a daytime high of 20 to 27 C; below 20 falls by 100/14 per degree (0 at 6 C); above 27 falls by 100/11 per degree (0 at 38 C).
   - dry: `100 - precip_mm x 100 / 130`, floor 0.
   - sun: `(radiation_kJ - 4000) x 100 / 20000`, clamped 0 to 100.
3. Best months (`summary.best_months`, shipped as `climate.best`): every month with comfort at least peak comfort minus 8.
4. Bar colour (`comfortTier`): 78 or more great, 60 or more good, 45 or more mixed, else poor. Bar height: `20% + 80% x (c - min) / (max - min)` over the place's own year.
5. Extras: rain days = mean days with at least 1 mm (`RAIN_DAY_MM`); wind = mean 10 m wind; sunshine hours are modelled from radiation (marked as an estimate); water temperature from sea temperature (below).
6. The traveller's month is outlined on the strip.

**Data behind it.** `cache/climate.json`, `cache/climate_power_raw.json`, `cache/climate_power_daily.json`; `dest.climate`. `python run_pipeline.py --only climate` (backfill) and `--only climate_daily` (quarterly).

**Where it lives.** `continent-app/src/browse/ClimateStrip.jsx`, `continent-app/src/lib/whenGuide.js`, `continent-app/src/lib/waterFacts.js`, `pipeline/harvest_climate_power.py`, `pipeline/apply_climate.py`.

**Limits.** Month initials on the strip are English only (T1022-a). Elevation still comes from the Open-Meteo API, non-commercial tier (T470-b). An i18n string still says 30 years of normals (T469-i).

---

### When logic (the traveller's month) and When to go

**What it does.** Every screen that talks about "the month" reads it from one rule, so the crowd stat, the quiet filter, the match and the climate strip never disagree. The place page's When to go section turns climate and crowds into a written recommendation.

**How it works.**
1. `resolveWhen` (`when.js`), first match wins:
   - Explore month filter `xm` (1 to 12) set: that month.
   - `dateFlex = 'any'`, or no departure date: any time (no month).
   - `dateFlex = 'month'`: the departure month.
   - Carta's own default dates (not `ownDates`): any time.
   - Exact dates: the start month, plus the end month if the trip spans two.
2. `busiestMonth`: for a trip over two months, the one with the larger crowd share.
3. `whenVerdict` (`whenGuide.js`): best = `climate.best`, else months tiered great or good; quieter = pleasant months outside best with crowd tier at most 1; hot = months with a high of 31 C or more (`when.guide.hot_c` in `config/pricing.json`) and busy or unknown crowds; cold = poor months under 31 C.
4. `crowdStanding`: the share of Europe's places with fewer visitor nights per km2 than this one.

**Data behind it.** `dest.climate`, `dest.crowding`, the traveller's settings.

**Where it lives.** `continent-app/src/lib/when.js`, `continent-app/src/lib/whenGuide.js`, `continent-app/src/browse/DestWhen.jsx`.

**Limits.** A per-month price total for When to go is not built (T881-a).

---

### Crowds by month and the crowd calendar

**What it does.** Carta says how crowded a place is: Quiet, Moderate, Busy or Crowded. With a month chosen it gives that month's level; with no month it names the quiet and busy months. A "Not crowded" filter keeps quiet and moderate places.

**How it works.**
1. Annual tier (`harvest_tourism_density.py`): tourism density = Eurostat nights spent / land area per NUTS 3 region. Regions are tiered by the 25th, 50th and 75th percentiles of `ln(1 + density)`: 0 quiet, 1 moderate, 2 busy, 3 crowded.
2. Monthly tier (`month_tier`, rule `t649-v1`): month share = that month's fraction of the year's nights (NUTS 2 region, else country; averaged over the complete years among the last three). `shift = round(3 x log2(12 x share))` (`SEASON_GAIN` 3), set to 0 when under 0.5 (`SEASON_DEAD_BAND`), limited to at most +1 (`SEASON_MAX_UP`) and -2 (`SEASON_MAX_DOWN`). `tier = annual tier + shift`, clamped 0 to 3.
3. App (`crowdMonth.js crowdFor`): with a month, that month's tier (none if no monthly series; never the annual tier dressed as the month). With no month: a pattern (months at the lowest and highest tier), or one flat tier.
4. Quiet flag (`quietFor`): tier at most 1 (`QUIET_MAX_TIER`); a month with no series falls back to the yearly tier; missing data never passes.
5. Crowd calendar badge on the place page (`CrowdCalendar.jsx`): shows the tier and the data year, only for tier 0 or 3 (`crowdBadgeWorthShowing`).

**Data behind it.** Eurostat `tour_occ_nin3` and `tour_occ_nin2m`, GISCO NUTS 2021 boundaries; `cache/eurostat_nights_nuts3.json`, `cache/eurostat_nights_nuts2_monthly.json`; `dest.crowding = {nights_per_km2, tier, label, nuts3, region, year, monthly: {share, tier, geo}}`. `python run_pipeline.py --only crowding`, quarterly (Eurostat updates about yearly).

6. Places Eurostat does not cover (T1098, `harvest_uk_crowds.py`, task `crowding_uk`, runs after `crowding`): Great Britain by ONS ITL1 region (12), and Bosnia (BA), Faroes (FO), Moldova (MD), Kosovo (XK) as one region per country. Same method: density = newest complete year's nights / land area, tier against the Eurostat cutoffs in `meta.crowding_model` (so tiers mean the same everywhere), monthly tier by `month_tier` (rule `t649-v1`) from the average month share of the last three complete years. Output shape is the same `dest.crowding`; `source` is `ons_visitbritain_itl1` or `national_statistics_office`. A place with an Eurostat block is never overwritten. The input is `cache/uk_crowds_nights.csv` (`geo,name,year,month,nights`; geo = ITL1 code or iso2) plus `cache/uk_itl1_boundaries.geojson` (ONS Open Geography Portal, ITL1 boundaries, Open Government Licence v3.0); the owner prepares both (no network from the build tooling), and the task does nothing while the CSV is absent. Land areas for the four countries are fixed in `COUNTRY_AREA_KM2`.

**Where it lives.** `pipeline/harvest_tourism_density.py`, `pipeline/harvest_uk_crowds.py`, `continent-app/src/lib/crowdMonth.js`, `continent-app/src/browse/CrowdCalendar.jsx`, `continent-app/src/components/CrowdingBadge.jsx`.

**Limits.** The doc comment in `CrowdCalendar.jsx` still says no monthly data exists; it does now. That comment also says 54% of the catalogue, including all of the UK, has no crowding measurement; the UK stays that way until the owner runs the T1098 loader (524 of 526 GB places had no monthly crowds at the 2026-11-04 audit). The monthly shape is regional (NUTS 2 or country), not per place. Guided search's Not crowded filter keeps only tier 1 and drops Quiet places (T475-f). Layer rows (beaches, walks) carry no crowding (T181-c, T183-c).

---

### Sea temperature

**What it does.** Coastal places and beaches show the mean water temperature for each month, so a traveller can see when the sea is warm enough to swim.

**How it works.**
1. Source: NASA JPL MUR SST v4.1 monthly means via NOAA CoastWatch ERDDAP (`jplMURSST41mday`), one call per 1 degree tile, sampled every 0.03 degrees (about 3 km).
2. Climatology: per cell, the calendar-month mean over `YEAR_FROM` to `YEAR_TO` = 2017 to 2022. A cell counts only if all twelve months are valid.
3. A point takes the nearest valid cell within 6 km for a beach (`BEACH_MAX_KM`) or 20 km for a destination (`DEST_MAX_KM`). Lakes are in the product too, so a lake beach gets the lake surface temperature.
4. `apply_climate.py` writes it as `climate.water_c` (twelve values); the climate extras block shows it as "Water temperature". It reads the rows of `cache/sea_temp_dest.json` (the overlay file wraps them as `{_meta, rows}`; before T1097 it read the wrapper and found nothing).
5. The beach export writes the beach's twelve figures as the wire key `sea_temp` (T1097; it was `sst`, which no screen read). `BeachPage.jsx` draws them through `seaByMonth` in `waterFacts.js`: twelve finite numbers or no strip, the three warmest months highlighted.
6. Pace and resume (T1097): one ERDDAP call at most every `DEFAULT_DELAY_S` = 1.5 s (`--delay`), each tile cached atomically in `cache/sea_temp/`, `--fixture DIR` reads recorded CSV (`<lat>_<lon>.csv`) instead of the network for a dry run. Tests: `tests/test_sea_temp_fixture.py`, `continent-app/tests/seaTemp.test.mjs`.

**Data behind it.** `cache/sea_temp/` tiles, `cache/sea_temp_beaches.json` (read by the beach export), `cache/sea_temp_dest.json` (read by `apply_climate.py`). `python run_pipeline.py --only sea_temp`, quarterly, with a 6 hour budget; unfinished tiles resume next run (exit code 3).

**Where it lives.** `pipeline/harvest_sea_temp.py`, `pipeline/apply_climate.py`, `continent-app/src/browse/ClimateStrip.jsx` (`ClimateExtras`), `continent-app/src/lib/waterFacts.js`.

**Limits.** The method note in `apply_climate.py` says 2003 to 2022 and "within 20 km"/"within 25 km"; the harvester code uses 2017 to 2022 and 20 km for places. Register rows T181-a and T287-a say beaches have no month data on their wire; whether the beach export now ships it could not be confirmed from the files read.

---

## Prices and logistics

Carta prices a trip from four parts: a bed, food and drink, getting there, and getting around. Every screen asks one price engine the same question, so a place costs the same on Explore, on its page, in the planner and in Ask.

All rules that move a price live in one file, `continent-app/config/pricing.json`. Each rule there carries its value, unit, kind (measured, sourced or estimate), source, date and review date. The app reads it through `rule(key)` in `continent-app/src/lib/price/config.js`, and the pipeline reads it through `pipeline/pricing_config.py`. An unknown key throws at load.

---

### The price request (one question for every screen)

**What it does.** Every price in Carta answers the same question: when, how many nights, who travels, where they sleep, how they eat and how they get there. Change one choice and every card, pin and total moves together.

**How it works.**
1. `priceRequest()` builds one object from the app state: `when`, `nights`, `group` (adults, children, babies), `stay` (tier), `lifestyle`, `transport`, `origin`, `baggage`, `view`, `excluded`, `activities`.
2. The default request (owner decision B5) is two adults, an entire place (`stay: 'home'`), the Easygoing lifestyle, the year's average, `request.default_nights` = 7 nights, bag `request.default_bag` = `priority_10kg` (a 10 kg cabin bag).
3. `when` has three modes and they never mix: `exact` (the traveller's own dates), `month` (the Explore month filter; flights use the next such month), `any` (the year's average bed and the year's cheapest return flight).
4. Nights come from the date pair in every mode; without a pair, 7.
5. Seats are adults plus children (`seatsOf`); babies sit on a lap and take no seat and no bed.
6. `view` is `pp` (per person, default) or `total`. The engine always prices per person per day; the total view only multiplies: a day figure times seats times nights, a way there times seats (`viewFactor`, `wayFactor`). So filters and sorts give the same order in both views.
7. `excluded` holds items the traveller switched off in the opened price (bed, food, transport, car, activities, events, flight). An excluded line leaves the total.

**Data behind it.** No data file. Defaults from `request.default_nights`, `request.default_bag`, `lifestyle.default`, `party.limits` in `pricing.json`.

**Where it lives.** `continent-app/src/lib/price/request.js`, `continent-app/src/lib/price/display.js`, `continent-app/src/lib/when.js`, `continent-app/src/lib/party.js`.

**Limits.** A traveller who picks exactly Carta's suggested week reads as "not own dates", so the price falls back to the year's average (register row T663-c). Under "any time" the flight is the year's cheapest return, and filters drop places afterwards rather than choosing the cheapest period that passes every filter (T667-a).

---

### Group size and the party

**What it does.** You say how many adults, children and babies travel. Children eat less and pay less for trains and buses; babies fly on a lap for a small fee and need no bed.

**How it works.**
1. Limits (`party.limits`): default 2 seats, at most 20 seats, at most 4 babies. One cap for every screen.
2. Shares of an adult (`party.shares`): child food 0.6, baby food 0.15, child train or bus ticket 0.5.
3. Food share per seat: `(adults + 0.6 x children + 0.15 x babies) / seats` (`foodShare`).
4. Ticket share per seat: `(adults + 0.5 x children) / seats` (`ticketShare`). Planes charge a child the full adult fare.
5. Baby lap fee: `party.baby_lap_fee_leg` = EUR 30 per baby per flight leg. On Explore it is spread over the seats: `perSeat + babies x 30 x 2 / seats` (`flightPerSeat`).
6. Beds: a room sleeps `stay.people_per_room` = 2. A dorm bed counts a child as `stay.dorm_child_weight` = 0.5 of a bed (two children share one).
7. Cars: a party pays for as many cars as it fills, `car_capacity` = 4 seats (seven people are two cars). This is the one place a bigger party pays more per person.

Worked example: 2 adults and 1 child. Seats = 3. Food share = (2 + 0.6) / 3 = 0.867, so each seat's food line is 86.7% of an adult day. Ticket share = (2 + 0.5) / 3 = 0.833.

**Data behind it.** `pricing.json` rules `party.limits`, `party.shares`, `party.baby_lap_fee_leg`, `stay.people_per_room`, `stay.dorm_child_weight`. All marked estimate.

**Where it lives.** `continent-app/src/lib/party.js`, `continent-app/src/lib/price/request.js`, `continent-app/src/lib/travelWay.js`.

**Limits.** All shares are Carta estimates, not measured. Party size lives in the URL and app state, not across sessions (T100-b).

---

### Lifestyle levels

**What it does.** The Lifestyle panel says how you eat, drink and go out: how many dinners, lunches, drinks, coffees and club nights, and how many days you cook. Presets fill these in; you can move each one. Food prices and the price bands follow it.

**How it works.**
1. Six presets in `lifestyle.profiles` (per week; coffees per day):

| Preset | Dinners | Lunches | Fast food | Drinks | Club nights | Coffees/day | Self-catered days |
|---|---|---|---|---|---|---|---|
| Backpacker | 1 | 3 | 4 | 4 | 0 | 0 | 5 |
| Easygoing (default) | 5 | 4 | 2 | 7 | 1 | 1 | 2 |
| Foodie | 7 | 5 | 0 | 5 | 0 | 1 | 0 |
| Cafe & culture | 3 | 5 | 1 | 3 | 0 | 1 | 2 |
| Nightlife | 3 | 2 | 4 | 12 | 3 | 1 | 1 |
| Family | 2 | 4 | 3 | 2 | 0 | 1 | 5 |

2. A club night is the entry plus `lifestyle.club_drinks_per_night` = 3 cocktails.
3. There are no "budget / mid / comfort" levels for food. The stay tier (below) is a separate choice.
4. A changed slider that matches no preset reads as Custom.

**Data behind it.** `lifestyle.default`, `lifestyle.profiles`, `lifestyle.club_drinks_per_night` in `pricing.json` (estimates, set T474, coffees by owner decision B8 on 2026-10-24).

**Where it lives.** `continent-app/src/browse/LifestylePanel.jsx`, `continent-app/src/lib/runtime_pricing.js` (`DEFAULT_LIFESTYLE`).

**Limits.** A lifestyle saved before B8 (no coffee field) now reads Custom (T692-d). A dining level (cheap eats to fine dining) was deferred by the owner (T514-b).

---

### Food and drink per day

**What it does.** Shows what one person spends a day on food and drink at a place, for the way they said they travel. The same figure is in the Explore card, the place page, the trip total and the day planner.

**How it works.**
1. Each place carries eight prices in `dest.costs`: `meal_mid_eur` (dinner), `meal_cheap_eur` (casual meal), `fastfood_eur`, `drink_out_eur` (beer), `cocktail_eur`, `coffee_eur`, `grocery_day_eur` (a day of groceries), `club_entry_eur`.
2. `groundSpendPerPerson(dest, nights, lifestyle)` computes, with `periods = nights / 7` (weekly cadence):
   - dinners = dinners_per_week x periods x meal_mid
   - lunches = lunches_per_week x periods x meal_cheap
   - fast food = fastfood_per_week x periods x fastfood
   - drinks = drinks_per_week x periods x drink_out
   - coffees = coffees_per_day x nights x coffee
   - groceries = self_catered_days_per_week x periods x grocery_day
   - clubbing = club_nights_per_week x periods x (club_entry + 3 x cocktail)
   - total = the sum, each part rounded to cents.
3. The day food figure is that total for 1 night, times the party's food share (`foodShare`).
4. A place with no `costs` block, or a total of 0, has no food price. The day is then unpriced, never cheaper.

Worked example at the catalogue's frozen median prices (`bands.ref_prices`: dinner 32.80, casual meal 15, fast food 10, beer 5, cocktail 12, coffee 3.45, groceries 12.42, club entry 11.08), Easygoing, one adult, one week:
- dinners 5 x 32.80 = 164.00
- lunches 4 x 15 = 60.00
- fast food 2 x 10 = 20.00
- drinks 7 x 5 = 35.00
- groceries 2 x 12.42 = 24.84
- clubbing 1 x (11.08 + 3 x 12) = 47.08
- coffees 7 x 3.45 = 24.15
- week = 375.07, so about EUR 53.58 a day.

**Data behind it.** `dest.costs` in `app_data.json`, written by `pipeline/apply_food_prices.py` (see Food and drink prices below).

**Where it lives.** `continent-app/src/lib/runtime_pricing.js` (`groundSpendPerPerson`), `continent-app/src/lib/costIndex.js` (`foodPerDay`), `continent-app/src/lib/price/priceDay.js` (`foodBreakdown`).

**Limits.** No food season: the owner decided there is no seasonal ground cost (T103-c), which the plan's F10 contradicts (T716-b, open for the owner). The trip page receipt follows the stay but not the eating preset in one older path (T173-c).

---

### Bed price per night

**What it does.** Prices one person's share of a bed per night at the stay type you chose (dorm, room, entire place, hotel by stars), for your party and your dates or month. It includes Airbnb style fees for an entire place, weekend nights and peak weeks.

**How it works.**
1. Tiers, cheapest first (`STAY_TIERS`): `dorm` (one hostel bed), `private` (hostel or guesthouse double), `room` (private room in a home), `home` (entire place), `hotel2` to `hotel5` (a double room by star class). Old ids `hotel`, `bnb_home`, `bnb_room` map to `hotel3`, `home`, `room`.
2. A tier the town cannot price (no hostel, no 5 star hotel, supply flag false) is not offered. The engine then falls back to `home`, else the first tier offered, and says so (`fallback: true`).
3. Units: a dorm is priced per sleeper; rooms per `ceil(people / 2)`; an entire place picks the smallest measured place that sleeps the group from caps `stay.home_caps` = 2, 4, 6, 8, else the largest, and books `ceil(people / cap)` of them.
4. Night by night (`nightFor`):
   - base = that month's measured price from the stays wire, else the annual median in `dest.accommodation.beds`.
   - One traveller in a hotel pays `base x min(1, single.hotel)` where a single room ratio was measured.
   - Friday and Saturday nights (`stay.weekend_nights` = UTC weekdays 5, 6) are multiplied by the place's `weekend` factor when it is above 1.
   - Peak weeks (`stay.peaks`): Christmas 23 Dec to 1 Jan, mid August 12 to 17 Aug, Easter Sunday minus 3 days to plus 1 day. A night in one is multiplied by the place's measured `peak` factor when above 1.
5. Entire place fees (`stay.fees`): 7 nights or more get an 8% weekly discount (`weekly_discount_pct`, `min_nights_for_weekly`); cleaning = 0.5 x one annual night (`cleaning_fee_frac_of_night`); service fee = 14% of (lodging + cleaning) (`service_fee_pct`). The pipeline may ship its own copy as `meta.stays.fees`, which wins.
6. Per person per night = total / heads / nights.
7. Sanity bounds per person per night (`stay.bounds_pp_night`): dorm EUR 6 to 150, hotel5 EUR 6 to 900, every other tier EUR 6 to 500.
8. A scraped bed outside its bounds borrows the median of its country's places for the same tier, party and dates (`stay.repair`). A place the scrape never reached has no bed price ("Not available yet"), never a borrowed one (T1021).
9. Without dates the bed is the month (Explore month filter) or the annual figure.
10. Thin tiers (T1075): a tier whose `src[tier].n` is `stay.thin_obs` = 2 or fewer is flagged `thin` on the bed line (with `basis.observations`); 2,684 of 12,696 priced tiers are thin today, and 5 places are thin in every tier. `python scripts/missing_beds.py` writes the re-scrape target list (the 515 places with no bed price grouped by country, FR 94, IT 77, GB 56, GR 40, and the thin places) to `cache/stays/missing_beds.json`. Local transport fares wait on the owner's source choice (T714-b); the table is not built.

Worked example: an entire place for two, annual price EUR 90 a night, 7 nights, no measured month curve.
- lodging = 7 x 90 = 630.00; weekly discount 8% gives 579.60
- cleaning = 0.5 x 90 = 45.00
- service = 14% x (579.60 + 45.00) = 87.44
- total = 712.04 for the party; per person 356.02; per person per night 50.86.

**Data behind it.** `dest.accommodation` (`beds`, `q`, `captured`, `supply`) baked into the first paint, plus the stays wire per country (month curves, weekend and peak factors, single ratio), loaded by `staysData.js`. See Stays below.

**Where it lives.** `continent-app/src/lib/stayPrice.js` (`bedPrice`, `tiersAt`, `monthRates`, `cheapestMonths`, `seasonCurve`), `continent-app/src/lib/costIndex.js` (`stayAtTier`, `countryStayMedians`, `costRow`).

**Limits.** The scrape prices an entire place for two only, so groups book several two person places. 173,754 Booking hotel rows have no star class and price no tier (T1021-c). 515 places have no scrape (T1021-d). Peak windows are Carta estimates; the pipeline measures single days (T690-c). Hostelworld prices may leave out city tax (T643-c).

---

### The day price and the five price bands

**What it does.** The headline figure on cards and pins: what one day at a place costs one person, bed plus food and drink (plus local transport once a place has a fare). A five step word (Very cheap to Very pricey) sits beside it.

**How it works.**
1. `priceDay(dest, req)` returns one line per item: `bed`, `food`, `transport`, `car`, `activities`, `events`, each with `status` (`included`, `optional`, `not_included`, `excluded`), `eur` per person per day in whole cents, and `quality` (`live`, `measured`, `modelled`, `missing`).
2. `dayEur` = the sum of included lines. If any included line has no price, the day is unpriced (rule 8: never counted as zero).
3. Included by default: bed and food, and local transport when a fare exists. Car hire is never in the day (driving on Explore means your own car, priced as the way there). Activities and events are optional and off.
4. So for any stay: total = dayEur x seats x nights.
5. Bands use fixed euro cut points per person per day (`bands.cuts`): day 65 / 80 / 100 / 125, stay 22 / 30 / 40 / 55, food 40 / 50 / 62 / 78. Below the first cut is band 0, at or above the last is band 4. Words: Very cheap, Cheap, Mid-priced, Pricey, Very pricey (`cost.band0` to `cost.band4`).
6. The cuts scale with the lifestyle and stay tier, so a Backpacker does not see all of Europe as cheap:
   - food scale = refDayFood(lifestyle) / refDayFood(Easygoing), at the frozen `bands.ref_prices`
   - stay scale = `bands.ref_stay[tier]` / `bands.ref_stay.home` (31.25)
   - day scale = the two blended by food's default share, food ref / (food ref + 31.25)
   - each scale is clamped to `bands.scale_clamp` = 0.25 to 4.

Worked example: Easygoing, entire place, bed 50.86 + food 53.58 = day EUR 104.44. Scale is 1. 104.44 is at least 100 and under 125, so band 3, "Pricey".

**Data behind it.** `bands.cuts`, `bands.ref_prices`, `bands.ref_stay`, `bands.scale_clamp` (frozen 2026-09-14, review 2026-12-31).

**Where it lives.** `continent-app/src/lib/price/priceDay.js`, `continent-app/src/lib/costIndex.js` (`bandFor`, `bandPos`, `bandScale`), `continent-app/src/lib/price/display.js`.

**Limits.** The cuts are frozen and due a re-cut (T514-a, T534-a); food model v2 moved day bands cheaper. Local transport is in the code but 0 of 3,868 places have a fare, so the line is always missing today (T714-b).

---

### Local transport

**What it does.** Adds the cost of getting around town (metro, bus or tram rides, or a day pass) to the day price once a place has a fare.

**How it works.**
1. Reads `dest.local_transport.fare` (`ride_eur`, `day_pass_eur`, `currency`, `source`, `date`, `quality`). Only euro fares count.
2. Rides per day by place class (`transport.rides_per_day`): metro 3, city 2, town 1, village 1, area 1.
3. Adult day = min(ride_eur x rides, day_pass_eur); either alone if only one exists.
4. Per seat = adult day x ticket share (children 0.5).
5. No fare means the line is `missing` and the day is bed and food only.

**Data behind it.** `local_transport.fare` on each destination. No pipeline layer writes it yet.

**Where it lives.** `continent-app/src/lib/price/priceDay.js` (`transportLine`).

**Limits.** No place has a fare (T714-b, owner to choose a source). The receipt still labels the days line "Food and drink" (T714-d).

---

### Activities and things to do

**What it does.** On the place page's calculator you can switch on things to do that have a known entry price; the total grows by that price for each person.

**How it works.**
1. A price record is `{ value, unit, currency, source, date, quality }` (`doPrice.js`).
2. Only euro records count; other currencies are not converted.
3. A zero shows "Free" only for sights, beaches and activities; elsewhere a zero shows nothing. An unknown price shows a placeholder, never a number.
4. In `quoteNights`, switched on activities add `sum(eur) x people`. Off by default.

**Data behind it.** Pipeline price records from `harvest_poi_fees.py` (`price`, OSM charge tags) and `harvest_lift_hours.py` (`lift.fare`).

**Where it lives.** `continent-app/src/lib/price/doPrice.js`, `continent-app/src/lib/price/nights.js`, `continent-app/src/browse/DestPriceCard.jsx`.

**Limits.** Only OSM tagged prices exist; lidos, ferries and entry tickets show placeholders (T701-a). The switches were not seen with data in a browser (T715-a). Events have no price data at all.

---

### Destination price card ("What a day costs")

**What it does.** On a place page, a card shows what a day costs a person, split into bed and food, then the trip at your dates and party: nights, flights with the airline, and the total for everyone. You can change dates and travellers on the card, open the Lifestyle, add your own fare, or start planning.

**How it works.**
1. The day figure is the same engine row as the Explore card (`priceDay`), shown inside a half arc that draws the day's split.
2. `quoteNights(costRow, nights, people, fare, carta, activities, way)` builds the receipt lines:
   - way there: a picked train, bus or car (`way.total`), else a typed fare (`fare.costTotal`), else Carta's swept return flight (`carta.total`)
   - stay = bed per person per day x nights x people (unless excluded)
   - food = food per person per day x nights x people (unless excluded)
   - car and local transport lines when included
   - activities = sum x people
3. Each line is rounded to cents; the total is the sum of the rounded lines, so it adds up on screen. `each` = total / people when more than one.
4. The flight comes from `flightLegs` on the request's date mode (see Flights) and `flightQuote` with the party and the bag.
5. Dates and travellers are the app's own state, so a change here moves every card and pin.
6. Returns nothing when the bed or food figure is missing.
7. Honest gaps (T1075): a part with no figure yet gets its own row, "Not yet measured" (`price.notMeasured`), under the lines and above the total, never a zero and never padded into the total. Today that is local transport, until a place has a fare (`unmeasuredParts` in `lib/price/display.js`). A bed priced from `stay.thin_obs` = 2 scraped properties or fewer shows "Few listings measured" (`price.bedThin`) under its figure; the figure itself is unchanged (`bedIsThin`). The count is the wire's `src[tier].n`. 8. One rule, one component (T1114, D10, owner decision 2 of 2026-11-05): `priceNotes(row | rows)` in `lib/price/notes.js` decides when the notes show (a thin bed, a part with no figure) and `components/PriceNotes.jsx` draws them (`ThinBedNote`, `NotMeasuredValue`, and `PriceNotes`, a quiet caption line). The destination price card, the trip page cost card (merged over every stop's row, once each), the Plan day receipt, the Ask place card and the Explore cards (grid and rails) all use them: "Bed price: few listings measured" and "Local transport: not yet measured" (`price.noteBed`, `price.noteMissing`). The notes carry their own classes, never `.not-yet`, so the destination page's rule that hides empty slots (2026-10-30) gives way for price parts only. A row with no engine lines says nothing. No figure or total moves.

Worked example: bed 50.86, food 53.58, 7 nights, 2 people, a swept return of EUR 276 for both (two legs at 49 + cabin bag 20 per seat, see Flights):
- flight 276.00
- stay 50.86 x 7 x 2 = 712.04
- food 53.58 x 7 x 2 = 750.12
- total 1,738.16; each 869.08.

**Data behind it.** The cost row, the home airport's swept flight file, the typed fare (stored by `firstRun.js` `readOwnFare` / `writeOwnFare`).

**Where it lives.** `continent-app/src/browse/DestPriceCard.jsx`, `continent-app/src/lib/price/nights.js`, `continent-app/src/lib/price/flight.js`, `continent-app/src/components/CostCardKit.jsx`, `continent-app/src/browse/placeWays.js`. Latest report: `Execution/P15/T1019-dest-price-card.md`.

**Limits.** With Carta's default dates the card prices the year's cheapest return while its pill shows the default dates (T1019-a). `verify_destination_page.mjs` still reads removed class names (T1019-c). The same leg pairing exists twice (T1019-d).

---

### Trip total (planner)

**What it does.** For a planned trip with one or more stops, adds up everything: flights or the drive, the way to your home airport, airport transfers, travel between stops, a hire car, day trips, beds and days. It shows four tiles that always sum to the total.

**How it works.**
1. `quoteTrip(state, { data })` takes the planner state. Party: adults (12+), children (3 to 11), babies (0 to 2), capped by `party.limits`.
2. Each stop is `quoteStay`: the day price at that stop's own dates, so `accomTotal = bed x nights x seats` and `groundTotal = (food + local transport) x nights x seats`. A stop may have its own stay tier. A bed you typed as paid replaces Carta's bed for that stop.
3. Parts (all rounded to cents):
   - `travel`: what you typed for getting there and home
   - `flights`: Carta's flight each way you did not type, bags and baby lap fees included
   - `airport`: home to the airport and back, only when you set an airport reach and a leg is priced
   - `transfers`: runway to bed and back, plus a named arrival to the first stop
   - `drive`: your own car there and home (half the round trip each way)
   - `between`: travel between stops
   - `car`: hire car plus vignettes
   - `daytrips`: there and back for each day trip
   - `beds`, `days`
4. `grandTotal` = sum of parts; `perPerson` = grandTotal / (adults + children).
5. Tiles (`costTiles`): Flights or Driving (`travel`, `flights`, `airport`, plus `drive` when driving), Getting around (`transfers`, `between`, `car`, `daytrips`, plus `drive` when flying), Stay (`beds`), Food (`days`). A way with no price says so (`missing`), a tile with nothing says it is not needed rather than EUR 0.
6. Public modes (train, bus, ferry) between stops are scaled by the ticket share; cars and taxis are not.

Worked example: one stop, 2 adults, 7 nights, entire place, Easygoing, flights 276, no airport reach set, flown straight in:
- flights 276.00, beds 712.04, days 750.12
- grand total 1,738.16; per person 869.08.

**Data behind it.** Destinations, `meta.car_model`, the swept flight files, live flight answers, `meta.home_airports`.

**Where it lives.** `continent-app/src/lib/price/trip.js`, `continent-app/src/lib/price/stay.js`, `continent-app/src/lib/price/tiles.js`, `continent-app/src/lib/tripTotal.js`, `continent-app/src/lib/transport.js`.

**Limits.** My trips prices a saved trip with its saved stay and Lifestyle while the planner uses the app's settings (T703-a, owner). The trip page's legs still come from the wire budget, not the engine (T710-a). Inline numbers in `transport.js` (taxi and transfer speeds) are not yet in `pricing.json` (T690-d).

---

### The buffer (Ask budget search)

**What it does.** When you ask "we have EUR 1,500 for five days, where can we go", Carta adds a safety margin on top of the priced parts and says whether each place fits, is tight or is over.

**How it works.**
1. Each place is priced with `quoteTrip` for a one stop trip: beds, days and, when flying, the swept return flight plus airport transfers. Parts are rounded to whole euros.
2. `core = beds + days + there`.
3. `buffer = round(core x q.buffer)`. Default `BUFFER_DEFAULT` = 0.10 (10%); allowed steps `BUFFER_STEPS` = 0, 0.05, 0.10, 0.15, 0.20.
4. `total = core + buffer`.
5. Verdict: fits if total is at most the budget; tight if the buffer is on and core alone fits; else over.
6. `dayPp = (beds + days) / people / nights`, without the buffer and the flight.

Worked example: core 1,738, buffer 10% = 174, total 1,912. Budget 1,800: core fits, total does not, so "tight".

**Data behind it.** As the trip total. The buffer constants are in code, not in `pricing.json`.

**Where it lives.** `continent-app/src/lib/budgetSearch.js`, used by `continent-app/src/lib/ask/compose.js`, `continent-app/src/lib/ask/rank.js`, `continent-app/src/browse/AskSearchFull.jsx`.

**Limits.** Getting there by car, train or bus, local transport and tickets are not priced in the budget search; they show as lines without an amount. The buffer is not a golden test cell yet (T711-a). The buffer applies only here, not to the planner or place card totals.

---

### Money formatting

**What it does.** Every euro on screen is written one way, in the reader's language. Estimates look the same as any other figure.

**How it works.**
1. `formatMoney(value, { precision, locale, missing })` uses `Intl.NumberFormat` with currency EUR.
2. `precision: 'whole'` (default) rounds with `Math.round` and shows no decimals: cards, pins, lists, filters. `'cents'` shows two decimals: receipts, totals, ledgers, pass prices, exports.
3. The locale decides symbol position and digit grouping ("€1,268" in English, "1.268 €" in German). Falls back to `en-GB` if the locale fails.
4. A non finite value prints `missing` (default "-"), so "€NaN" never shows.
5. No tilde: since 2026-10-24 (price plan rule 2) `formatApprox` and `formatEst` return the plain figure. Whether a price is live, measured or modelled is stored with it and shown only in the internal view.
6. Ranges use the house join "€40 to €60" (`formatMoneyRange`).
7. i18n strings never hold a euro sign; templates take a formatted figure.

**Data behind it.** None.

**Where it lives.** `continent-app/src/lib/money.js`, `continent-app/src/lib/format.js`.

**Limits.** The bag fee comment in `bagFees.js` still describes a "~€25 est." display that the rule has since removed. Prerendered cost pages and the OG card still print source lines (T689-a).

---

### Food and drink prices (pipeline) and the Eat and drink section

**What it does.** Gives every place its own prices for a dinner, a casual meal, fast food, a beer, a cocktail, a coffee, a day of groceries and a club entry. The place page turns them into a "price feel": how dear eating out is here, and which things are cheaper or dearer than usual.

**How it works (pipeline, `apply_food_prices.py`, model `carta_food_v2`).**
1. price = country base x local tilt.
2. Country base per item per month: a measured June 2026 country basket (24 countries), or Europe reference x the Eurostat price level of the item's category, or a blend with what measured cities imply, or the legacy June basket where Eurostat has no level (microstates, Moldova).
3. Rolled forward by the local currency HICP index of the category (ECOICOP 2) to the latest month, through the monthly exchange rate.
4. Local tilt, each factor capped, product capped to 0.80 to 1.60:
   - income: (NUTS3 income per head / country income per head) ^ e, ratio clipped 0.6 to 2.0; e = 0.15 eating out, 0.08 chains, 0.05 groceries
   - tourism: hand set premium where set; else +8% eating out in the top 5% of NUTS3 regions by tourist nights per km2, +4% in the top 15%
   - size: eating out +6% at 1M people or more, +3% at 300k or more, minus 4% under 5k; groceries +3% under 5k
   - receipts (groceries only): weighted median of Open Prices matched products within 15 km, shrunk toward 1 by n / (n + 80), needs n of 40 or more
5. A place within 15 km of one of 22 measured cities takes that city's basket, rolled forward, with no tilt (level `city`).
6. Level is `city`, `region` or `country`. Publish gate (`gate.food`): a country's median basket may move at most 25% against the current wire unless explained in `pipeline/stays/gate_explain.json`.
7. Idempotent: computed from caches only; `--restore` puts back the June 2026 baskets.

**How it works (price feel, `priceFeel` in `costIndex.js`).**
1. Each priced item is compared with the frozen catalogue median (`bands.ref_prices`): `ratio = price / median - 1`.
2. More than `bands.feel.gap` = 10% off counts as cheaper or dearer than usual. At most `rows` = 4 such items are drawn, furthest first. Items within 10% are listed once as "About usual".
3. A bar fills its half width at `reach` = 50% off the norm.
4. With fewer than `min_items` = 3 priced items, only the verdict shows.
5. The verdict is the food band word (Very cheap to Very pricey) and a pin on the five step scale at the traveller's lifestyle.

**Data behind it.** `dest.costs` in `app_data.json`; inputs `cache/food_price_inputs.json`, `cache/costs.json`, `cache/nuts3_2021.geojson`, `cache/eurostat_nights_nuts3.json`. Task `python run_pipeline.py --only food` (monthly; runs `harvest_food_prices.py` then `apply_food_prices.py`; Eurostat publishes around the 17th). Sources: Eurostat price levels and HICP, Open Prices.

**Where it lives.** `pipeline/apply_food_prices.py`, `pipeline/harvest_food_prices.py`, `continent-app/src/browse/DestFood.jsx`, `continent-app/src/lib/costIndex.js`. Latest report: `Execution/P15/T1018-price-feel.md`.

**Limits.** The feel compares with the Europe norm only, not your home town (T1018-d). An item cut by the four row cap shows in no group (T1018-c). The old FoodFold in `DestFood.jsx` has no caller (T1018-a).

---

### Stays: the Booking and Hostelworld scrape

**What it does.** Gives each place measured bed prices per stay type, how prices move through the year, and how much dearer weekends are. These feed every bed price in the app.

**How it works.**
1. The owner's laptop scrapes Booking.com and Hostelworld (Booking blocks datacenter addresses). One plain browser tab, 3 to 6 seconds between pages, cookie banner declined, a 403, 429 or challenge stops that source for 20 hours. No proxies and no CAPTCHA solving. Planned twice a year (March and September).
2. Booking: per place and probe date, one search for 2 adults (25 to 50 cards with price, star class, unit) and one hostel search for 1 adult; extra star class searches on the first date. Lean mode uses 6 probe dates (January, March, May, August and October Tuesdays, one May Friday).
3. Hostelworld: the city list for 1 guest, "Dorms from" per bed and "Privates from". A private price per person is doubled to a room (`stays.model.hw_private_unit` = person, `hw_private_guests` = 2).
4. The laptop uploads `journal_scrape.sqlite` to a private R2 bucket. Each month the build box (`box_stays.py`) downloads it and runs `build_stays.py --gate`:
   - drops rows that break the contract (not EUR, not one night, wrong adults, no price, unknown unit), and observations older than `max_age_days` = 400
   - divides each property's prices by its own median; monthly medians of those ratios form the season curve, bounded `curve_min` 0.5 to `curve_max` 2.2; a price more than `outlier` = 2.5 times off is dropped; one vote per source
   - a month not scraped takes the nearest scraped month (season_q marks `m` measured, `f` filled)
   - weekend factor: Friday against the Tuesday of the same week, same property
   - hotel2 to hotel5 only where at least 2 hotels of that class were priced (`gate.stays.min_star_props`)
   - entire place: Booking apartments for two, as `bnb_home {"2": ...}`
   - a place the scrape did not reach gets no record
5. Gate (`gate.stays`): at most 5% rejected rows, 25% move per country and tier, 40% per destination, 2% coverage drop. A failed gate keeps the previous files live (exit 2).
6. On a pass the country files go to `data/stays-live/v1/` on R2. The app loads each country's file when needed; between the baked copy and the live copy, the newer `built` stamp wins, and URLs carry the build (`?b=`) so caches never serve an old build.

**Data behind it.** `r2:carta-stays-state/state/journal_scrape.sqlite`, `data/stays-live/v1/{cc}.json` and `manifest.json`; baked `dest.accommodation` in `app_data.json`. Task `python run_pipeline.py --only stays` (monthly, soft, needs the rclone `r2` remote). To bake a build into the app instead: `build_stays.py --gate`, then `apply_stays.py`.

**Where it lives.** `pipeline/stays/scrape_booking.py`, `pipeline/stays/scrape_hostelworld.py`, `pipeline/stays/build_stays.py`, `pipeline/stays/box_stays.py`, `pipeline/stays/apply_stays.py`, `continent-app/src/lib/staysData.js`, `continent-app/src/planner/wizard/StepStays.jsx`. Owner steps: `Execution/P15/_OPEN-stays-box.md`. Latest report: `Execution/P15/T1021-stays-scrape-only.md`.

**Scraper health (T1074).** `python scripts/stays_health.py` reads the `session:` lines of `logs/stays_<source>.log` and the scrape journal and writes `cache/stays/stays_health.json`: a yield alert when the latest run's prices per page fall below 70% of the median of the previous 7 runs (no verdict with fewer than 2 earlier runs), and a drift alert when a place's median price per bed kind moves more than 25% from the run before (at least 3 observations in each). Exit 0 clean, 1 alerts, 2 nothing readable. The Hostelworld "677 pages, 0 prices" sessions were villages with no Hostelworld list, not a parser fault; the session line now also counts `pages with no cards`. Booking has been paused since 30 October (blocked); it is left paused, with no evasion. Box steps: `Execution/P15/_OPEN-scraper-health.md`.

**Limits.** The monthly box build is not switched on yet (T1021-a, owner). The licence ledger and attribution still credit Inside Airbnb, Xotelo and Eurostat for stays (T1021-e). The Hostelworld per person verdict rests on one signal (T643-a). 591 places carried a dorm rate over EUR 150 in an older wire (T692-b).

---

### Live stays (Xotelo, tonight's hotel prices)

**What it does.** Removed in T1074. Carta was built to check tonight's hotel prices in the town through Xotelo and nudge a stay's bed price for festival or quiet weeks. The scrape only build (T1021) stopped writing the keys it needed, so it had been inert; the function, the app module, the `stay.live` rule and the test are deleted.

**What stays.** The bed price is the model from the scrape: `bedPrice` in `continent-app/src/lib/stayPrice.js`. A country's stays arriving still reprices screens, through `useStaysVersion`.

**Leftovers.** Removed in T1082: the `stay.live` strings in the six catalogues, `stayLive` in `costIndex.js`, the `live` bed quality in `priceDay.js`, `liveBed` (and the bed quote it alone read) in `AskTripCard.jsx`, and `xk` in `docs/SCHEMA.md`. The `live` quality stays for flights.

---

### Flight sweep (the Worker)

**What it does.** A background job checks Google Flights around the clock for every European route Carta knows, and keeps the cheapest flight per route and day. The app reads these prices for cards, pins and trips.

**How it works.**
1. Route list: `pipeline/flights/build_routes.py` builds `data/flights/_routes.json` from Eurostat airport pair tables. A month counts when it had enough departures; a pair is kept when it counts in enough of the last twelve months; the return direction is filled in; routes outside Europe are dropped. Each route stores a month bitmask so the sweep skips off season months.
2. The Cloudflare Worker `flight-sweep` runs every minute (`* * * * *`) and publishes every 10 minutes (`*/10 * * * *`). It runs one search at a time (`PARALLEL` = 1) with a 300 to 900 ms gap, and starts no new search after 50 seconds.
3. Tiers (`plan.mjs`):
   - near: days 1, 5, 9, 13 ahead, each route every 3 days (`NEAR_CYCLE` 4,320 minutes)
   - far: weeks 3 to 26, one day a week, each route every 2 weeks (`FAR_CYCLE` 20,160)
   - late: weeks 27 to 45, each route every 4 weeks, run on the Hetzner box and sent in through `/ingest`
   - find: Carta airport pairs with no route, 21 days out, direct flights only, at least 150 km apart, each pair every 90 days (`FIND_CYCLE` 129,600)
4. A route's turn is its index modulo the cycle, in half minute slots: two per minute by day, one per minute from 22:00 to 05:00 UTC (T1043).
5. A route with no direct flight on 6 checks in a row is dormant (`DORMANT_AFTER`); only the find tier looks again.
6. Guard: the first refusal from Google stops the minute and pauses the sweep for 1 hour, doubling while refusals keep coming (reset after 2 hours quiet), at most 24 hours.
7. Publish gate (`gate.sweep`): a one way fare is dropped if it is 0 or less, or above max(250, 150 + 0.5 x km); with no distance known, above 1,500. Example: a 1,000 km route allows up to EUR 650.
8. Output per home airport, `data/flights/{IATA}.json`: `to` (way out) and `back` (way home) per airport per day: `[price, airline, dep, arr, stops, checked minute]`, price in EUR for one adult one way. A searched day with no flight is `null`.

**Data behind it.** D1 database `carta_flights`, R2 bucket `carta`, read at `data.carta-europetravel.com/data/flights/`. Route list task `python run_pipeline.py --only flight_routes` (monthly). Source: Google Flights pages, Eurostat (CC BY 4.0), OurAirports.

**Where it lives.** `continent-app/workers/flight-sweep/src/index.mjs`, `plan.mjs`, `publish.mjs`, `ingest.mjs`, `continent-app/workers/shared/flightSearch.mjs`, `pipeline/flights/build_routes.py`. Latest reports: `Execution/P15/T1043-sweep-night-half.md`, T1042, T1020.

**Limits.** Google's terms do not allow automated reading; the owner accepted the risk (T518-c). The night half speed is not deployed yet (T1043-a). The late tier's first cycle is still being watched (T798-b). UK and Czech gaps were found (T915-a, T915-b).

---

### Flights and fares in the app (swept and live)

**What it does.** Shows a return flight from your home airport with the airline, times, the day it is for and when it was checked. The planner checks your exact days live; other screens use the sweep. You can also type a fare you paid.

**How it works.**
1. A leg is `{ date, price, airline, dep, arr, stops, checked, source }`, source `swept` or `live`.
2. Freshness (`flights.max_age_days`): a fare for a date up to 14 days ahead may be 5 days old; later dates 16 days; dates more than 181 days ahead 32 days. Older fares are ignored, never shown as current.
3. Date modes (`flightLegs`):
   - exact: the swept day nearest each wanted day, within `flights.nearest_day_spread` = 4 days, the cheaper when two are equally near; the way home must be after the way out. The leg keeps its own date on screen.
   - month: the cheapest pair with the way out in that month and the way home in that month or the next, home after out; of equal prices the shorter trip.
   - any: the cheapest such pair over every month.
4. Live (`/api/flights?o=&d=&date=`): every flight that day from Google Flights, cheapest first, one adult, EUR. Up to 330 days ahead. Edge cache 1 hour, browser 10 minutes; the app shares an answer for 10 minutes. A failure answers 502 `{"error": "upstream"}` and the app uses the swept price; a miss in the edge cache is limited to 20 live searches a minute per address (429, T1079).
5. Picking a leg (`pickLeg`): the first live flight in the wanted hours and preferences, in rank order; else the swept one if it fits. Hours: morning 05 to 12, midday 12 to 17, evening 17 to 24. Preferences: direct only, depart after or before an hour.
6. Ranks: `price` (cheapest first); `balanced` adds EUR 35 a stop and EUR 25 for an unsocial hour; `comfort` adds EUR 120 and EUR 70. Unsocial: departs before 07:00 or from 22:00, or lands before 06:30 or from 23:30.
7. Cost of a leg (`legCost`): fare x paying seats + bag fee x seats. Babies on a lap pay `party.baby_lap_fee_leg` (EUR 30) per leg in the planner.
8. Bag fees (`flights.bag_fees`, EUR per person per direction, read 2026-10-21): for example Ryanair (FR) cabin 20, checked 35; Wizz Air (W6) 25 / 35; easyJet (U2) 15 / 30; Vueling (VY) 18 / 25. Full service airlines (SN, KL, AF, LH, BA and others) include the cabin bag and charge 35 for a checked bag. An unknown airline adds 0 and the screen says bags may cost extra. Default bag `priority_10kg` is the cabin tier.
9. A typed fare (`FlightSheet`: airline, amount above 0 and up to 99,999, dates, origin) wins over Carta's price. A flight the traveller booked is never replaced by Google's fare.
10. In the planner with an airport reach set, every ticked home airport is priced door to door (fare plus the way to the airport) and the cheapest whole wins; a pinned airport is kept; with no fare anywhere, the first airport the sweep covers.

Worked example: 2 adults, cabin bag, Ryanair EUR 49 out and EUR 49 back: each leg 49 x 2 + 20 x 2 = 138; return 276 for both, 138 per seat.

**Data behind it.** `data/flights/{IATA}.json` (sweep), `/api/flights` (live), `flights.bag_fees`, `flights.max_age_days`.

**Where it lives.** `continent-app/src/lib/flights/flights.js`, `bagFees.js`, `flightData.js`, `useLiveFlights.js`, `flightText.js`, `continent-app/src/lib/price/flight.js`, `continent-app/functions/api/flights.js`, `continent-app/src/components/FlightSheet.jsx`, `continent-app/src/components/flights/Flights.jsx`.

**Limits.** Explore cards and place pages still price from the one nearest origin; ticked airports only feed the finder and planner (T860-b). The bag table was not checked row by row (T517-a). The date mode on Explore was tested in node only because of CORS on localhost (T663-b).

---

### Airports in reach from home and the way to the airport

**What it does.** You say how far you would drive to an airport (1, 2 or 3 hours). Carta ticks every airport the sweep covers inside that reach and adds the cost of getting to the airport and back to the trip.

**How it works.**
1. Drive estimate (`origins.airport_access`): road km = straight km x 1.3 (`road_factor`), at 85 km/h (`drive_kmh`). Reach choices `hours` = 1, 2, 3, default 2.
2. Every airport within the longest reach is listed nearest first. If none is covered by the sweep, the list runs out to the nearest covered one, so it is never empty.
3. A reach ticks every covered airport within those hours; with none inside, the nearest covered one.
4. Way to the airport and back (`accessCost`), the cheaper of:
   - car: per km = consumption 6.5 l/100 km x fuel EUR 1.81/l + toll 2.2/100 km; cars x road km x 2 + parking `parking_eur_per_day` = 12 x (nights + 1) x cars
   - public: fare per seat each way = min(60, max(10, 0.15 x straight km x 1.3)) (`ground.transfer_public`), x seats x ticket share x 2
5. Added only when the reach answer exists and a flight leg is priced or typed.

Worked example: an airport 100 road km away, 2 adults, 7 nights. Car: 0.1397 per km x 100 x 2 = 27.93, parking 12 x 8 = 96, total 123.93. Public: straight 76.9 km, fare max(10, 0.15 x 76.9 x 1.3) = 15.00, x 2 seats x 2 ways = 60.00. Public wins at EUR 60.

**Data behind it.** `meta.origins` (airports with coordinates), the sweep index for coverage, `meta.home_airports`.

**Where it lives.** `continent-app/src/lib/airportReach.js`, `continent-app/src/lib/price/trip.js`.

**Limits.** All figures are estimates made without the owner (T860-a): straight line times 1.3 at 85 km/h, parking EUR 12 a day.

---

### The way there: which mode a card opens on (D13)

**What it does.** Where Carta prices several ways to reach a place (the place page's trip card, an Explore card under "any way", the Places list under "any way"), it opens on one. It used to open on the cheapest, which showed a car to Bergen or a 512 euro train to Taormina while flights existed (audit P-31). It now opens on the way that is sensible door to door; every way stays listed with its own price and the cheapest keeps its "Cheapest" mark.

**How it works.** `lib/wayChoice.js` `chooseWay`, numbers in `way.choice`:
1. Door-to-door hours, one way. A train, coach or car: the leg estimator's own hours (they already count stations, ferries and the town ends). A flight: the air time from the leg's clock times (or straight km / `plane_kmh` 750 + `plane_taxi_hours` 0.5), plus `plane_overhead_hours` 3 (to the home airport, check-in and security, out at the other end), plus the transfer from the landing airport (0 for a place with its own airport, the stored transfer for a gem, else `unknown_transfer_hours` 1).
2. Far means fly: when the straight line from the traveller's start to the place is at least `fly_km` 700 and a flight has a fare, the flight is the pick (reason `distance`), unless a ground way is both faster door to door and no dearer (reason `beats_flight`).
3. Near means time and money: otherwise the way with the lowest return price a person + `eur_per_hour` 15 x 2 x door-to-door hours wins (reason `time_cost`).
4. A flight without a fare is never a candidate. In the Places list (`price/compose.js`, any way) a route with no swept fare is priced only when nothing else reaches, as before (T511); it no longer wins as "cheapest" by leaving the flight out.
5. "Fastest" on the trip card is door to door too. When the card opens on a dearer way than the cheapest, one caption says why in hours (`destx.wayPickWhy`); it hides once the traveller picks a way.
6. A mode the traveller chose (the settings line) is always honoured. `fly_km` is also the planner prefill's distance (`gettingThere.js FLY_KM`).

Worked example: Brussels to Annecy (566 km), no fare. Train EUR 180 return, 7.0 h; coach EUR 93, 10.6 h; car EUR 103, 8.1 h. Scores: train 180 + 30 x 7.0 = 390; coach 93 + 30 x 10.6 = 411; car 103 + 30 x 8.1 = 346. The card opens on the car; the coach keeps "Cheapest".

**Data behind it.** The flight sweep (`data/flights/{IATA}.json`), the leg estimator (`lib/transport.js`), `transfer.transfer_minutes_one_way` on gems, `way.choice`.

**Where it lives.** `continent-app/src/lib/wayChoice.js`, `src/lib/travelWay.js` (`wayFor`), `src/browse/placeWays.js` (`waysThere`), `src/lib/price/compose.js`, `src/browse/DestPriceCard.jsx`; check `scripts/way_choice_pairs.mjs`, tests `tests/wayChoice.test.mjs`.

**Limits.** The 50-pair check (5 homes x 10 places) ran on fixture fares, a distance stand-in; the run on the real sweep is an owner step (T1100-a). The values in `way.choice` are estimates, not measured (T1100-b). Local clock times make a flight across a time zone read an hour off.

---

### Airport transfer per mode (airport to the place)

**What it does.** Tells you which airports serve a place, how long the transfer takes by car or public transport, and what the transfer costs your party, so a place without its own airport can still be flown to.

**How it works (pipeline, `airport_access.py`).**
1. Candidates: airports within `MAX_STRAIGHT_KM` = 110 km, nearest first, at most `MAX_AIRPORTS` = 4; the anchor airport is always kept.
2. Road option: straight km x 1.3 at 65 km/h, mode `car`, source `road_estimate`.
3. Public option only where a GTFS feed covers both ends: earliest arrival scan on a typical weekday, departures every 30 minutes from 07:00 to 21:00, median door to door time, capped at 240 minutes. Access legs: bus 25 km/h plus 8 minutes wait, walking 4.5 km/h under 1.2 km.
4. Headline mode: public transport if within 1.25 x the road time (`PT_SLACK`), else the road.
5. No data means no options; the app shows a placeholder.

**How it works (app).**
1. Plane reach: a place with no route of its own can use a served airport within `ground.plane_reach_km` = 200 km.
2. Last leg (`lastLegEstimate`): road km = straight x 1.3; minutes at 65 km/h; EUR per person one way = round(min(60, max(10, 0.15 x road km))). If the place needs a car, the hire drives it and the shuttle costs 0.
3. In the planner (`transferModesFromKm`):
   - public: the stored per person fare, else the transfer band; hours = km / 42 + 0.35
   - taxi: per cab of 4, max(14, 4 + 2.0 x km); only up to 90 km; 55 km/h
   - rental: fuel only, when the trip hires a car; 70 km/h
   - recommended: rental if hired, else public, else taxi. No public option where either end has poor transit.

Worked example: an airport 50 km straight from the town. Road 65 km, 60 minutes, fare max(10, 9.75) = EUR 10 per person each way; 2 people return = EUR 40.

**Data behind it.** `dest.airports[]` (`iata`, `straight_km`, `road_km`, `options`, `transfer_min`, `transfer_mode`, `transfer_source`). Task `python run_pipeline.py --only airports` (quarterly; runs `apply_airport_anchors.py --airports-only`). Feed: Trenord (Regione Lombardia open data, IODL 2.0).

**Where it lives.** `pipeline/airport_access.py`, `pipeline/apply_airport_anchors.py`, `continent-app/src/lib/runtime_pricing.js` (`airRoute`, `airportLastLeg`, `nearbyAirportIndex`), `continent-app/src/lib/transport.js` (`airportTransferOptions`, `transferModesFromKm`).

**Limits.** Public transport times exist for 83 places (Trenord only) and are upper bounds in Milan (T642-b). 264 airport tier places have no `airports[]` (T651-b). `apply_airport_anchors.py` steps 1 to 4 crash on current data; only `--airports-only` is safe (T640-d).

---

### Driving your own car: fuel and tolls

**What it does.** If you drive from home, Carta prices fuel and tolls there and back for the cars your group fills, and shows the drive time. Islands and places beyond the driving limit are not drivable.

**How it works (`drivingEstimate`).**
1. Start: the town you named; else your home airport's town. Car mode waits for one of them.
2. Not drivable if `local_transport.road_connected` is false, or road km is over `max_drive_km` = 3,500.
3. road km = straight km (to the town centre, not the airport) x `road_detour_factor` 1.3; round trip = 2 x road km.
4. cars = ceil(group / 4).
5. fuel = cars x round trip km x 6.5 / 100 x fuel price; fuel price is the destination country's (`car.fuel_by_country`, e.g. NL 2.30, DE 1.96, ES 1.55) else 1.81.
6. tolls: when the drive starts within `car.toll_corridor_start_km` = 30 km of the pipeline's home point, the destination's corridor figure `driving_toll.total_rt_eur` x cars; otherwise the flat cars x round trip km / 100 x 2.2 (`toll_eur_per_100km`).
7. hours one way = road km / 90 (`avg_speed_kmh`).
8. In the planner, each way is half the round trip; vignettes for countries crossed by car legs come from `meta.car_model.toll_model.vignettes_eur`, times cars.
9. You can type your own figure for the drive; it replaces the estimate.

Worked example: 600 km straight, 2 people, flat toll, fuel 1.81. Road 780 km, round trip 1,560 km. Fuel 1,560 x 0.065 x 1.81 = 183.53. Tolls 15.6 x 2.2 = 34.32. Total 217.85 (108.93 each), 8.7 hours each way.

**Data behind it.** `meta.car_model` (from `pipeline/car_layer.py` `CAR_MODEL`, applied by `pipeline/apply_car_layer.py` inside task `transit_lines`), `dest.driving_toll` from `pipeline/toll_layer.py` and `pipeline/apply_toll_layer.py` (per country rates: distance tolls, vignettes, crossings such as Brenner and the Storebaelt and Oresund bridges; sources tolls.eu, autovig.eu, tollguru.com, asfinag.at, July 2026). Fuel from the EC Weekly Oil Bulletin of 1 June 2026 (EU) and globalpetrolprices.com (non EU). No `run_pipeline.py` task for the toll layer was found.

**Where it lives.** `continent-app/src/lib/runtime_pricing.js` (`drivingEstimate`, `driveOrigin`), `continent-app/src/lib/price/trip.js` (`driveLegs`, `vignettes`), `continent-app/src/lib/price/compose.js`.

**Limits.** Toll corridors are measured from Brussels only (T716-a). `car.model` and fuel are due review on 2026-11-24.

---

### Car hire

**What it does.** When you plan a trip with a hire car, or a place you fly to really needs one, Carta adds a rental for the trip at that country's day rate and season.

**How it works (`rentalEstimate`).**
1. rate = `car.rental_by_country[iso2]` (e.g. PT 26, ES 30, IT 52, CH 69, IS 82) else `rental_eur_per_day_default` = 39.
2. Season: x `rental_seasonality[month]` of the start date (January 0.85 up to July and August 1.25); no date gives 1.
3. total = rate x days x cars; 7 days or more take 15% off (`rental_weekly_discount_pct`).
4. In the planner the hire is added only when transport is car hire; on Places only when the plane trip lands at a place with `car_needed`. Never in the day price.

Worked example: Italy, 7 days in July, 2 people: 52 x 1.25 = 65 a day, x 7 = 455, minus 15% = 386.75 for one car.

**Data behind it.** `car.model`, `car.rental_by_country` (economy or compact rates from tripbudgetcalculator.com and Rick Steves 2026 midpoints at USD x 0.862).

**Where it lives.** `continent-app/src/lib/price/car.js`, `continent-app/src/lib/price/trip.js`, `continent-app/src/lib/price/compose.js`.

**Limits.** The owner has not confirmed the car reading (T702-a). Several screens still read `car_needed` directly (T650-d).

---

### Train, bus and travel between places

**What it does.** Prices a train, coach, ferry or car journey from your home to a place, between stops of a trip, and for day trips, so you can compare it with flying.

**How it works.**
1. `resolveGroundFare`: a stored quote wins. Otherwise distance is the routed km, or straight km x 1.3.
2. Train: a calibrated fare where a cell exists (only Spain: base 3.03 + 0.064 per km, from a Renfe archive); else rate = average of the two countries' `railEur`, fare = max(4, rate x 40, rate x km) (`ground.overland_floors`).
3. Bus: rate = average `busEur`, fare = max(3, rate x km). A zero rate (Luxembourg's free transit) prices zero.
4. Sea crossings (`ground.sea_bands`): Channel train 0.26/km, floor 59, cap 220; bus 0.085/km, floor 29; car ferry 95. Irish Sea train 0.12/km, floor 45, cap 120; bus 0.08/km, floor 35; car ferry 130. Other island gaps are left unpriced.
5. Country profiles (`ground.country_profiles`) give rail quality (excellent to none), speeds and overhead hours, for example DE rail 110 km/h at 0.13/km, CH 0.28/km.
6. Public fares are scaled by the party's ticket share. In "any way" mode Places takes the cheapest of plane, car, train and bus that reaches.
7. Day trips cost twice the chosen one way.

**Data behind it.** `ground.*` rules in `pricing.json`; `ground.calibration` from `data/derived/ground_fare_calibration.json` (generated 2026-08-05).

**Where it lives.** `continent-app/src/lib/groundFares.js`, `continent-app/src/lib/countryTransport.js`, `continent-app/src/lib/transport.js` (`legTransportOptions`), `continent-app/src/lib/travelWay.js`, `continent-app/src/browse/placeWays.js`.

**Limits.** Calibration covers one cell (Spain, train) (T691-b). Rail time and fare are a straight line model (T102-a). The rail start is the airport city, not the home town (T102-c).

---

### Price map and price feel labels

**What it does.** Explore colours and labels places by how dear a day is (Very cheap to Very pricey), and the place page's Eat and drink says whether eating out is cheaper or dearer than usual.

**How it works.** Both come from the five fixed bands (see "The day price and the five price bands") and `priceFeel` (see "Food and drink prices"). There is no separate cheap / normal / pricey label set in code. "When to go" also reads stay prices: if the dearest scraped month is within 1.1 x the cheapest (`when.guide.stay_flat`), it says prices hardly change through the year; a month at 31 C or more with busy crowds is "hot and busy" (`when.guide.hot_c`).

**Data behind it.** `bands.cuts`, `bands.feel`, `when.guide` in `pricing.json`; `dest.costs`; stays month curves.

**Where it lives.** `continent-app/src/lib/costIndex.js`, `continent-app/src/browse/DestFood.jsx`, `continent-app/src/lib/whenGuide.js`. A separate "price map" view: Not found in code under that name beyond the Explore bands; `PRICEMAP_CHUNKS.md` is on the list of docs to distrust.

**Limits.** Price map phone INP was measured at 608 ms against a 200 ms target (T200-c). Comfort cut points in `whenGuide.js` are a hand copy of the pipeline's (T1022-b).

---

## Planning

Planning is everything that turns "I want to go somewhere" into a dated, priced trip with days: ready-made trips, the trip finder, the plan flow, the trip page and the day planner. Three AI helpers (plan-day, suggest-city, parse-booking) sit on top, and every one of them falls back to a non-AI path when it fails.

### Carta's own trips (the curated journeys library)

**What it does.** A library of hand-written week-long trips in 15 styles (city, hiking, rail, beach week, culinary, cycling, hostel, cozy towns, road trip, winter sports, nature escape, water sports, trail running, pilgrim, island hopping). The traveller browses them on Plan under "Carta's own trips", filters them, opens one to read the whole week day by day, and can switch to a shorter version. "Plan this trip" carries the trip's country into the planner.

**How it works.**
1. `pipeline/journeys/build_wire.py` reads the unified dataset (`Trips/carta-unified`, schema v2.0: one 7-day itinerary per record, all editorial) and writes three artifacts: an index of styles, one card file per style, one full file per trip.
2. The dataset has no photos, so the script takes one hero per trip and per style from the Wikipedia API (lead images that are Commons files), only from places the record names. A trip pinned to a gateway or capital never takes that pin's photo. Results are cached in `cache/journey_images.json`.
   Every hero clears `HERO_FLOOR = 1600` px on its long edge (the validator's `HERO_MIN_W`, spec B3) and ships at `HERO_W = 1920` (T1077). The script reads each photo's original size from the Commons API (cached in `cache/journey_image_sizes.json`). A photo whose original is too small is swapped for the trip's next unused candidate that clears the floor, then for a photo from one of its own places' articles whose file name carries the place's name (`cache/journey_gallery.json`); `HERO_FILE_PINS` holds the hand-picked ones. A photo between 1600 and 1919 px ships as the original file. The journey page gallery gets a srcset up to 1920 (`tripPhoto` in `lib/journeys.js`), so a phone loads 500 or 960.
3. Every shipped string goes through the house text rules: em and en dashes become a hyphen or a comma, `[VERIFY: ...]` markers are lifted.
4. `pipeline/journeys/sample_trips.py` adds five sample trips for the five newer styles (hostel, beach week, rail, pilgrim, island hopping). They carry `sample: true`, which keeps them out of the sitemap and prerender until the owner audits them.
5. In the app, `CartaTrips.jsx` lists the cards: in season this month first, then cheapest a person a day. Pages of `PAGE = 24` cards, an in-season band of `FEATURED = 8` when no filter is on. Filters: month, cost band, tags, style, country.
6. Short version (`lib/tripLength.js`): 4 days, or 3 when difficulty is 4 or 5 (`shortDayCount`). It is one unbroken run of days chosen by `dayScore` (named places, bold items, figures, day stats), ties go to the later run. Each budget line scales by days / 7 (`scaleBudget`); the per-day range stays the same.
7. `lib/journeyTrips.js` also offers journeys as ready trips inside the trip wizard. A town name is resolved to the best-rated catalogue place of that name in the trip's countries; a journey whose towns cannot be found is not offered.
8. Saved journeys are kept in `carta.savedJourneys.v1` (`lib/journeySaves.js`).

**Data behind it.** `continent-app/public/journeys/index.json`, `type/{slug}.json`, `journey/{id}.json`. Current index: `journeys_v1`, 258 trips, 15 types, generated 2026-10-15. Built by hand (`build_wire.py` is "Tier: Manual"), not on a schedule.

**Where it lives.** App: `continent-app/src/planner/flow/CartaTrips.jsx`, `continent-app/src/browse/JourneyPage.jsx`, `continent-app/src/browse/TripPlaceCard.jsx`, `continent-app/src/lib/journeys.js`, `continent-app/src/lib/tripLength.js`, `continent-app/src/lib/journeyTrips.js`. Pipeline: `pipeline/journeys/build_wire.py`, `pipeline/journeys/sample_trips.py`, `pipeline/journeys/credits.py`. Docs: `archive/docs-2026-11/ITEM_PAGE_DATA_CONTRACT.md`. Latest: `Execution/P15/T1030-one-carta-trips.md`.

**Limits.**
- Every curated trip is 7 days; the short version is derived, not authored. Getting to the start sits inside the transport line and scales with it, which understates a short trip.
- On 42 of 253 trips the budget line lows do not add up to the total low (row T173-f).
- 61 trips are still pinned at a capital in the shipped wire because the wire was not rebuilt after a fix (row T102-b).
- Journey GPX and route tracks are not built (rows T177-b, T206-f).
- Saved journeys are on the device only (row T831-a).

### Ready-made composed trips (the trips layer)

**What it does.** About four thousand generated 2 to 14 day trips across Europe, each one checked before it ships. The planner's Trips step offers the ones that fit the traveller's countries and days, and each opens on its own page with stops, legs, day trips and photos.

**How it works.**
1. `python run_pipeline.py trips` runs `pipeline/trips/build_trips.py` in three cached, deterministic stages: harvest, compose, export.
2. Harvest (`harvest_routes.py`) reads Wikivoyage: the "Go next" links as a graph of real onward journeys, the "Get in" section as a coarse mode check (rail, ferry, road), and itinerary articles as human routes to corroborate against. Only links, classes and coordinates are stored, never prose.
3. Compose (`compose_trips.py`) builds three shapes:
   - base: one bed, day trips out, `BASE_DAYS = [2, 3, 4, 5, 6]`
   - chain: two to five bases by train or coach, `CHAIN_DAYS = [4, 5, 6, 7, 8, 10, 12, 14]`
   - loop: a car route back to the start, `LOOP_DAYS = [6, 7, 8, 10, 12, 14]`
4. Key rules: a base needs a score of at least `MIN_BASE_SCORE = 6.2` (floor `THIN_BASE_SCORE = 4.2` for a country with fewer than 4 bases), a trip opens on a place scoring at least `MIN_SEED_SCORE = 7.2`, at least `MIN_NIGHTS_PER_BASE = 2`, bases at least `BASE_SEPARATION_KM = 55` apart, chain legs at most `CHAIN_MAX_LEG_H = 5.0` hours, loop legs at most `LOOP_MAX_LEG_H = 3.5` and on average `LOOP_MAX_DAILY_DRIVE_H = 2.6` a day. Chains use a beam search (`BEAM_WIDTH = 8`), and `KEEP_PER_CELL = 3` trips are kept per country, shape, length, scale and pace.
5. Three paces (relaxed, balanced, packed) change the shape, not a label: relaxed builds fewer bases with at least 3 nights each. Two scales: "icons" (metro and city seeds, `min_seed` 7.2) and "hidden" (town, village and area seeds, `min_seed` 6.6).
6. Day trips (`trip_model.py`): 12 to 150 km away (`DAYTRIP_MIN_KM`, `DAYTRIP_MAX_KM`), a door-to-door day of at most `DAY_LENGTH_H = 11.0` hours, at least `MIN_ON_SITE_H = 4.0` hours on site (5.0 by car), at most `MAX_DAYTRIPS_PER_BASE = 4`, spread at least `DAYTRIP_BEARING_SPREAD = 55` degrees apart. Legs use a Python port of the app's own transport estimator, so a trip and the planner agree on travel times.
7. Export (`export_trips.py`) runs 11 hard checks from `validate_trips.py` (stops, no repeats, nights, legs, loop closes, day trips, plan, enough to do, hero, images, cost). A failing trip is dropped and counted. Soft checks add a warning (`warned`) and trim the score. `top.json` keeps `TOP_PER_COUNTRY = 9` (at most 3 per pace, 6 per scale), `TOP_TOTAL = 400`.
8. In the app, `ReadyTripsStep.jsx` filters to the ticked countries and the traveller's days, and folds the same route at several lengths into one card with length chips.

**Data behind it.** `continent-app/public/trips/index.json`, `top.json`, `{CC}.json` (cards, about 600 bytes each), `trip/{id}.json` (about 12 KB). Current index: model `trips_v1`, 3,984 trips, 19 dropped, 43 countries, generated 2026-09-15. Inputs: `app_data/app_data.json`, `cache/wikivoyage.json`, `cache/trips/routes.json`, `cache/dest_pageviews.json`, `cache/eurostat_nights_nuts3.json`.

**Where it lives.** App: `continent-app/src/lib/trips.js`, `continent-app/src/planner/ReadyTripsStep.jsx`, `continent-app/src/browse/TripPage.jsx` (the library trip page). Pipeline: `pipeline/trips/` (`build_trips.py`, `harvest_routes.py`, `compose_trips.py`, `trip_model.py`, `validate_trips.py`, `export_trips.py`, `trip_sources.py`). Docs: `archive/docs-2026-11/trips_layer.md`.

**Limits.**
- `ReadyTripsStep` and the wizard's picked-trip load have no failure state (row T189-b).
- Explore's own trip list in `DestinationsTab` still exists but no door leads to it since T1030.
- Opening hours and live train timetables are not checked; legs are the estimator's figures.

### Trip finder ("Trips for you")

**What it does.** The traveller answers a short run of "Help me choose" questions, and Carta builds and prices real candidate trips that fit: a country, one to three places, a gateway airport, a month and dates. Each card shows a total, a match figure, up to three reasons and one catch. The traveller can sort, filter, compare up to four side by side, pull levers (cheaper flight, eat in or out, one base or several), keep trips and watch their price, and share a shortlist to decide together.

**How it works.**
1. Questions (`flowGraph.js` `GUIDE`): persona (how they like to travel), shape, likes, weather, reach (how far), around (how they get around), avoid, budget, pick (question 7: which price lines Carta may choose), how (whole trip or flights first), then the trips screen. Questions drop out when answers make them moot: reach goes when flights are booked or the way there is train or car, weather and reach go when places are named, likes goes when a town is named, around goes with their own car or a booked rental.
2. Candidates (`lib/recommend/candidates.js`, numbers in `continent-app/config/recommend.json`): up to `candidates.max = 24` trips, at least `min = 6`, from up to 8 countries and 12 places a country.
   - shapes: one place; "towns" (2 or 3 places, at least 3 nights each, 30 to 150 km apart); "road" (a hire car, at least 2 nights each, 40 to 250 km apart)
   - gateway: the airport of the first place with a swept fare from the origin (`nearKm: 150`, `nearMax: 3`)
   - dates: the setup dates, else `nights: 7` starting on a Saturday (`startWeekday: 6`) in the best month for the weather answer (warm 27 C, mild 21 C, snow 3 C day highs), looking 12 months ahead
   - named places: when the traveller named towns or countries, only those are used
3. Pricing (`lib/recommend/trips.js`): each candidate is priced in full by one `quoteTrip` call, the same engine the planner uses, and cut into the slots of `config/slots.json`: flight, stay (private, home or hotel3 by the priority answer), food (cook, mix, out), local (public or car), activities (status `notYet`, never in a sum). The total is the sum of slots that have a figure. Trip ids are a stable hash of country, places, gateway, nights and month, so the same answers give the same trips.
4. Ranking (`lib/recommend/rank.js`):
   - fit first: a trip qualifies when its strongest chosen like reads at least `mainLikeMin = 0.5` and there is no hard conflict (`hardConflicts: ["car"]`)
   - score = blend of answers and quality: `answers_w 0.6` x answers + `quality_w 0.4` x (place month score / 10); answers mixes the fit F with the persona fit P at `persona_w 0.25`
   - budget sink: `sinkPer100 = 0.3` points (of 10) for each 100 euros over the typed budget
   - the match badge is round(score x 100), capped at 99, shown only while it reads at least `show_min = 0.55` (`config/rating.json`)
5. Personas (`lib/recommend/persona.js`): ten ids (cities, hubtrips, outside, towns, coast, nature, hidden, slow, lively, mix), up to three picks, one may be "most you". Each place gets a persona fit from its features; `weight = 3` moves a place by up to 1.5 points.
6. Reasons and catch (`reasons.js`): at most 3 reasons, at most 2 from likes; a catch names a transfer over 120 minutes, a flight over 300 minutes, or a crowd tier of 2 or more.
7. List screen (`TripsForYou.jsx`): 6 cards a page (`PAGE = 6`), sorts match, cheapest, shortest, warmest, quietest; quick filters direct, within budget, quiet, warm (day high 25 C or more), one place. The cheapest whole total gets a "best value" pin. From 1024 px a map stands beside the list. With no trips, it offers to widen the budget or the reach answer first.
8. Compare (`compare.js`): up to `MAX_COMPARE = 4` trips; rows total, flight, stay, days, match, door to door, weather, crowds, budget. One best cell per row, never on a tie, a missing figure, or a total that leaves a slot out.
9. Levers (`recommend.json` `levers`): flight (cheapest, quickest, times), food (cook, mix, out), bases (one or several). A lever only switches an existing setting; the flight lever re-ranks by swept flights.
10. Kept trips (`kept.js`, `keptStore.js`): a snapshot of the card. "If it gets cheaper" looks the same flight up in the newest swept file and reports a drop of at least `dropMin = 10` euros a person.
11. Decide together (`together.js`): a shortlist of up to 8 trips and 8 people rides in a `#together=` link hash. Each person keeps or skips trips; trips everyone kept rise. No account or server is involved.

**Data behind it.** The catalogue (`boot.json` and place shards), place taste profiles, the price engine (`continent-app/config/pricing.json`), swept flight files from the flight sweep (`data/flights/` on R2), `config/recommend.json`, `config/slots.json`. Kept trips in `carta.keptTrips.v1`, skips in the device store. Nothing is stored server side.

**Where it lives.** App: `continent-app/src/planner/finder/` (`FindingTrips.jsx`, `TripsForYou.jsx`, `TripCard.jsx`, `TripCompare.jsx`, `TripPage.jsx` for one found trip, `TripsMap.jsx`, `TogetherSheet.jsx`, `finderText.js`, `finderHooks.js`), `continent-app/src/lib/recommend/`. Latest: T879 to T884 (rating and For you), T792 to T808 (TF1 to TF4) reports in `Execution/P15/`.

**Limits.**
- "Several countries" and "one way from A to B" are built as a few towns in one country (row T793-a).
- The flight sweep looks about six weeks ahead, so trips further out show no flight figure (row T795-c).
- Kept trips and skips are on the device only (row T806-a).
- Someone opening a shared shortlist cannot keep its trips (row T808-b).
- The compare table's match, day highs and crowds rows were never seen filled in a browser (row T802-b).

### Plan home and the plan flow

**What it does.** Plan's first page shows "New trip", a door to Carta's own trips, the next upcoming trip ("Up next" with a countdown and nights), and the traveller's trips grouped as upcoming, planning and past. Starting a trip (T1103, G12) opens four one-question screens: a free "Tell Carta" sentence, who goes, when and from where. The trip is then made and opens straight on its priced trips; everything else (what is booked, where to sleep, priority, the way there, the airports, and the help-me-choose questions) refines those trips from there.

**How it works.**
1. Home (`PlanHome.jsx`): a trip is "past" when its end is before today, "upcoming" when it has a start date, else "planning" (`tripState`). Drafts with nothing in them can be cleared in one step. The Carta's own trips door shows a fan of style photos with the month's style in the middle (`SEASON` map, for example July and August water sports). Kept trips with a price drop link to My trips.
2. Tell Carta (`lib/plan/parseTrip.js`): the sentence is read on the device with no model and no network. It reads places from the catalogue, month or dates, nights, adults, children and babies, likes, origin, budget (a person or the group, the trip or a day), what is booked, stay type and way of travel, in 6 languages. Each answer keeps `from: 'words'`; a screen answer always wins over the words (`tellChips.js`). Files dropped here go to parse-booking.
3. First run (T1103, `flowGraph.js` `FIRST_SETUP`, `firstSetup`): a new trip asks tell, who, when, from. Start planning goes straight to Tell; the "what do you want to plan" sheet shows only while a device trip is under way today (`tripUnderWay`). After From the trip is made with its defaults (no name, cover or buddies; all in the trip settings gear) and `quickStart.js` marks it, so `TripFlow` opens on the priced trips with no Create screen, no trip home and no questions. The trips show a refine card (`RefineCard.jsx`): "Where you sleep" (the sleep screen, back to the trips) and "Fit these to me" (the help-me-choose questions; back on the first returns to the trips). With "What are you up for" never asked the finder ranks by `BROAD_TYPES` (city, culture, food) in `lib/recommend/candidates.js` `broadWhenUnasked`; no like is written or shown. Measured with `scripts/verify_plan_short.mjs`: 23 screens and 31 taps to the first priced trip before, 5 and 6 after.
4. Full setup order (`flowGraph.js` `SETUP`, still the trip settings' list and a trip under way's run): tell, booked, who, sleep, priority, when, from, way, airports. When drops out when bookings fix the dates; from and way drop out when flights are booked; airports is asked only when the way there may fly. A trip already under way uses `NOW_SETUP` (where now, until when) and keeps its Create screen.
5. Continue always goes to the next screen; it only skips a screen the words answered and the traveller has not seen.
6. Create (a trip under way, or the trip settings), then four doors (`TRIP_DOORS`): guide (Help me choose, the trip finder), flight (find my flight first), know (I know where), booked. With stays booked the flow goes straight to the stays.
7. Planning steps (`wizard/wizardSteps.js`), prefixed `p:`: plain path Where, then Stay or Trips, then Getting there, then Finish. Travel booked adds From; beds booked puts Your stays in place of Where; travel and beds booked drops Getting there.
8. Where: pick countries and places, or a link to Google Flights Explore from the departure airport.
9. Stay step (`StepStay.jsx`): the traveller picks cities and `lib/cartaRoute.js` orders them (nearest neighbour, then 2-opt and Or-opt) and shares out the nights by a decaying value per extra night, so a city with more to do keeps more nights. Distances are straight lines x `ROAD_FACTOR = 1.25`. It offers one base or changing stays, and curated route shapes fitted to the trip's nights.
10. Your stays step (`StepStays.jsx`): with beds booked, one card per stay with its nights, dates, a search for the town and the price paid.
11. When step: exact dates on a two-month calendar or nights in a month, up to `MAX_TRIP_NIGHTS = 60`.
12. Getting there: one card per leg (out, between stops, home), priced on the flight Carta found or by the traveller.
13. Finish / Ready to book: the route as a timeline and the receipt lines from `lib/tripTotal.js`.

**Data behind it.** Device trips in `carta.trips.v1` (`tripsStore.js`), one trip planned at a time in the planner draft keys; signed-in trips in Supabase `trip_plans` and `trip_plan_stops` (migration 002). Prices from the price engine and the flight sweep.

**Where it lives.** App: `continent-app/src/planner/flow/` (`PlanFlow.jsx`, `PlanHome.jsx`, `QuestionScreen.jsx`, `setupScreens.jsx`, `questions.js`, `flowGraph.js`, `tellChips.js`, `tripSettings.js`), `continent-app/src/planner/GuidedTripWizard.jsx`, `continent-app/src/planner/wizard/`, `continent-app/src/lib/plan/parseTrip.js`, `continent-app/src/lib/cartaRoute.js`, `continent-app/src/planner/tripsStore.js`. Latest: `Execution/P15/T1103-plan-flow-short.md`, `T1044-plan-home-head.md`, `T1002-door-fit.md`.

**Limits.**
- The wizard clamps a stop's nights to 21 while a trip may have 60 (row T812-b).
- One month starts on three different days across Explore, the wizard and the finder (row T815-a); the minimum trip date also differs (row T815-c).
- An account trip opened from Plan home while signed out opens empty (row T809-b).
- Saving without an account keeps one trip while the home lists many (row T809-c).
- The wizard's header comment still describes a Ryanair fare map; the live fare source is the flight sweep.
- "Add a past trip" now sits only in My trips for most travellers (it lived on the trip-kind sheet, now shown only while a trip is under way) (row T1103-c).
- The help-me-choose walk that refines the trips is still ten questions (row T1103-d).

### The traveller's trip page

**What it does.** One page for a planned trip, in tabs: Overview (what it costs, the route, a map), Itinerary (stays, hops, fares, tools, export, before you go), Costs (the receipt), Days and Notes. The traveller can rename the trip, change dates, people and origin, change a flight, swap a city, add or remove stops, move nights, mark what is booked, add what they paid, share and export, and undo any change.

**How it works.**
1. Tabs (`TripPlannerTab.jsx` `TRIP_TABS`): overview, itinerary, costs, days, notes. The tab rides in the URL as `?tt=`. From 1024 px the map and the tools stay in a side column.
2. Totals: every figure comes from the price engine through `lib/tripTotal.js` `tripLines`; the page adds no price of its own. The cost card (`CostCard.jsx`) shows the total and four groups: flights, getting around, stay, food. Stay and food open the Lifestyle sheet. `BudgetCard.jsx` sets the total against the person's budget.
3. Editing:
   - undo and redo for every change (`editHistory.js`): up to `HISTORY_CAP = 50` steps, repeated changes within `COALESCE_MS = 900` ms are one step, a 6-second Undo message
   - change trip (`changeTrip.js`): the three start days before and after, none in the past, each with what it does to the total
   - change flight (`changeFlight.js`): every flight of that day from the live search that fits the flight preferences, cheapest first, priced for the party against the current one
   - swap city (`swapCity.js`): search by name, or "Help me choose" ranked the way Explore's For you ranks, within 60, 150 or 400 km (`REACH_KM`)
   - nights difference (`Balance.jsx`, `lib/tripBalance.js`): where added or removed nights go, each option with its effect on the total
4. Ready to book (`ReadyToBook.jsx`, `BookPasses.jsx`): the flight there, each stay, each hop, the flight home, each with a link out and "Add what you paid". Unbooked parts show as swipeable passes.
5. Days tab (`TripDays.jsx`): one card a day with its place, first planned stops, activities from bookings and the traveller's own ideas. No price on a day.
6. Own ideas and notes (`ownIdeas.js`, `TripNotes.jsx`): ideas up to `IDEA_MAX = 140` characters, day notes up to `NOTE_MAX = 400`.
7. Share (`ShareSheet.jsx`): who can see it, copy link, PDF (behind the pass), calendar and maps export.

**Data behind it.** `trip_plans` and `trip_plan_stops` for signed-in travellers, the device draft for guests; trip extras (ideas, notes, expenses, imported bookings, photos) in the `day_plans` payload (migration 004) and in localStorage. Live flights from `/api/flights`.

**Where it lives.** App: `continent-app/src/planner/TripPlannerTab.jsx`, `continent-app/src/planner/TripSummary.jsx`, `continent-app/src/planner/TripItinerary.jsx`, `continent-app/src/planner/PlanTotal.jsx`, `continent-app/src/planner/trip/`. Note: `MAP.md` names `planner/finder/TripPage.jsx` for this page, but that file is the trip finder's page for one found trip; the planned trip page is `TripPlannerTab.jsx` with `TripSummary.jsx`. Docs: `archive/docs-2026-11/ITEM_PAGE_DATA_CONTRACT.md`. Latest: `Execution/P15/T1001-new-trip-trip-bar.md` to `T1017-days-prompt-names.md`.

**Limits.**
- Deleting a trip on Plan home asks for a confirm rather than an Undo (row T809-a).
- The old planned-trip workspace is still reached with zero stops (row T821-a).
- A trip rebuilt from storage sums its slots on a swap instead of one fresh quote (row T818-a).

### Day planner

**What it does.** The traveller plans what to do each day in each town: where they start, which days, ideas they already have, and then either let Carta plan, chat with the Carta bot, or pick places from a map and list. Each day becomes a timed walking route with stops, walking legs, lunch, and costs.

**How it works.**
1. Steps (`DayPlannerTab.jsx`): stay (where the day starts), when (which days), ideas (places they want), how (Carta plans, the chat, or pick yourself).
2. The candidate deck (`dayDraft.js` `pickerDeck`): quality-ranked catalogue places within `MAX_POI_KM_FROM_CITY = 20` km of the town, with transport hubs, municipalities and shops filtered out. Must see is capped at 8 and "worth adding" at 16. Places the traveller named are always on the deck.
3. Draft limits (`feasibilityLimits`):
   - paces: relaxed 4 stops and 5.5 hours, balanced 6 and 7 hours, packed 8 and 8.5 hours
   - day length: half (4 h, 3 stops), full (7 h, 6), long (9 h, 8)
   - walking: light keeps stops within 1.2 km of the day's centre, moderate 2.5 km, lots 4.5 km
   - visit style scales each stop's time: quick x0.7, standard x1, deep x1.45
   - visit times by kind (`KIND_DWELL`), for example museum 90, cathedral 40, viewpoint 25 minutes; 40 when unknown
4. Several days (`lib/daySpread.js`): seeds start from the most important place, then the place furthest from every seed; k-medoids groups places by neighbourhood; days are balanced by minutes (a day a third over its share hands its edge place to a lighter day); day 1 is the nearest group; each day is walked in the shortest open path (nearest neighbour, then 2-opt).
5. Routing (`lib/dayRoute.js`, `lib/routing.js`): every leg is routed on footpaths by OSRM (`routing.openstreetmap.de/routed-foot`). A leg is ok, long (over `PACE_LEG_KM` 1.5, 2.2 or 3 km by pace; 0.9 km step-free), detour (path over 2.5 times the straight line and 1.5 km longer), unrouted, far (over `FAR_KM = 18` from the start), ferry, or unreachable (an end over 350 m from any path). Only ok and long are drawn as walks.
6. Schedule (`daySchedule.js`): day starts 09:30, measured to 18:00, lunch of 45 minutes after 12:30, dinner of 75 minutes from 18:00. A stay over 2.5 km from the first stop is drawn as a ride, not a walk.
7. Walking budget in steps (`lib/steps.js`): the traveller answers in steps (5,000 to 20,000), converted at `STEPS_PER_KM = 1350` to `maxWalkKm` for plan-day.
8. DayRail ("Your trip" card, `DayRail.jsx`): what a day costs one person at the traveller's Lifestyle, the answers that shape the day, and on the Places step one line a day with the places in walking order.
9. "Let Carta plan them" (`days/AutoPlanBar.jsx`): plans every day one by one with plan-day, shows progress, and on a failure says how far it got and offers the rest again or the Trip Pass.
10. Export: calendar file (`dayPlanIcs.js`), KML (`dayPlanKml.js`), and Google Maps directions (up to 3 stops on a phone, 9 on desktop).

**Data behind it.** Place POIs from `public/poi` shards. Day plans in localStorage `carta.dayplans.v1` (guests included), documents in IndexedDB (`dayFileStore.js`), synced for signed-in travellers to Supabase `day_plans` (migration 004) with newest-wins merging and delete tombstones.

**Where it lives.** App: `continent-app/src/planner/DayPlannerTab.jsx`, `continent-app/src/planner/DayRail.jsx`, `continent-app/src/planner/days/`, `continent-app/src/planner/dayDraft.js`, `continent-app/src/planner/daySchedule.js`, `continent-app/src/planner/dayPlanStore.js`, `continent-app/src/planner/dayPlanSync.js`, `continent-app/src/lib/daySpread.js`, `continent-app/src/lib/dayRoute.js`, `continent-app/src/lib/routing.js`, `continent-app/src/lib/steps.js`. Latest: `Execution/P15/T1015-notes-tab.md`, `T1016-notes-lines.md`.

**Limits.**
- Opening hours are not in the catalogue; each stop says "Check hours" instead.
- The open day (`carta.dayOpen.v1`) is not part of a trip snapshot, so switching trips keeps the other trip's open day (row T809-e).
- Co-planners do not share the day plan (migration 020).

### AI day plan (plan-day)

**What it does.** "Let Carta plan" turns a town and the traveller's answers into a walking day (or up to 7 days) chosen from Carta's own researched places, with one line on why each stop fits. The traveller can ask for a change ("fewer steps", "more food") and get a new plan.

**How it works.**
1. Input: the client builds a deck of up to 24 catalogue places (`buildAiCandidates`, default 22) with id, name, kind, category, rating, must see, visit minutes, coordinates and a 150-character description. Named places are forced onto the deck as must see. Payload also carries date, group size (1 to 20), pace, vibe, avoid hills, free text (280 characters), language, the stay, days (1 to 7), a whitelisted chat profile (companions, start time, steps 1,000 to 40,000, moods, food, diet, crowds, indoor, step-free, weather) and up to 8 must-include places.
2. Auth: a signed-in user is required (401 `auth` otherwise). Fewer than 3 candidates returns `too_few`.
3. Server trims the deck (`sanitizeCandidates` keeps the first 28; `selectCandidates` keeps must-see and named places, then ranks the rest by rating minus 0.15 a km past 5 km from the day's centre, up to 30 + 12 per extra day). `PROMPT_TRIM=false` turns the trim off.
4. Quota before cache (`ai_consume` RPC, kind `plan`): free tier 2 plans that never refill (migrations 021, 044), Trip Pass 60 plans and 40 grounded over 60 days (007, 053), Year Pass 300 plans and 120 grounded over 365 days, global ceiling `AI_GLOBAL_DAILY_CAP` 200 a day. Refused calls return 429 `user_cap` or `global_cap` and are logged to `ai_cap_events`. Two free refines per plan within 24 hours (`REFINES_FREE = 2`), proven by an HMAC-signed token.
5. Cache: `ai_plan_cache`, SHA-256 of the request (model chain, place, month, date, answers, trimmed deck, refine, profile, days), key version `CACHE_KEY_VERSION = 6`, valid 7 days. A hit still costs a unit. Hits and misses go to `ai_cache_events`.
6. Model: Gemini `generateContent` with structured output (`RESPONSE_SCHEMA`: summary, stops with id, name, arrive, dwellMin, why, inCatalog, isEvent). Temperature 0.25 (0.45 for a refine), `maxOutputTokens: 8192`. Chain `DEFAULT_MODEL_CHAIN`: `gemini-flash-lite-latest`, `gemini-3.5-flash-lite`, `gemini-flash-latest`, `gemini-3.1-flash-lite`, overridable by `GEMINI_MODEL` and `GEMINI_MODELS`. It falls over on 429, 404 or 5xx, within one budget of 80 s (first try 40 s, later 25 s, minimum 8 s).
7. Prompt rules: every stop must be a candidate id; minimise backtracking; summer heat puts indoor stops between 13:00 and 16:00; large groups (5+) walk about 20 percent slower; profile lines are added only for answers given; named places must all appear; output in the traveller's language with no em or en dashes. Prompt version is not labelled beyond the cache key version.
8. Events: with "events" ticked and a `ground` unit left, Google Search grounding runs and up to 2 festivals or markets come back, listed beside the day as "confirm this year's dates", never routed. Free tier has 0 grounded units; `AI_ENABLE_GROUNDING=false` turns it off.
9. Validation (`sanitizeAiStops`): a stop must reference a real id from the trimmed deck (name and coordinates come from Carta, not the model); duplicates and fake ids are dropped; at most `10 x days` stops (max 40). Non-catalogue stops are never routed. Fewer than 2 stops returns `ai_bad_output`.
10. Re-timing (`scheduleDay`, one day only): order kept unless 2-opt is over 12 percent and 400 m shorter; walking budget `DEFAULT_MAX_WALK_KM = 12` or the traveller's own; a leg over `MAX_LEG_KM = 6.5` or a stop past the budget is dropped (`farDropped`); lunch 75 minutes after 12:30. Several days are split and routed by the app (`daySpread.js`). Fewer than 2 timed stops returns `too_few`.
11. Failure: any failure after quota refunds the unit. The client maps every code (`no_auth_config`, `auth`, `user_cap`, `global_cap`, `no_ai`, `too_few`, `ai_busy`, `ai_error`, `ai_timeout`, `ai_bad_output`, `network`) to the built-in deterministic planner.

**Data behind it.** Supabase tables `plan_tiers`, `ai_usage` (RPC `ai_consume`, `refund`), `ai_plan_cache`, `ai_cache_events`, `ai_cap_events`, model events (migration 028). Secrets: `GEMINI_API_KEY` (from a Google Cloud project with billing, required for EEA users), `GEMINI_MODEL`, `GEMINI_MODELS`, `AI_GLOBAL_DAILY_CAP`, `PROMPT_TRIM`, `AI_ENABLE_GROUNDING`.

**Where it lives.** Backend: `supabase/functions/plan-day/index.ts`, `supabase/functions/plan-day/logic.mjs`, `supabase/functions/_shared/passes.mjs`, `supabase/migrations/006_ai_day_planner.sql`, `007_passes.sql`, `021_free_tier_once.sql`, `044_payments_quota.sql`, `053_pass_subscriptions.sql`. App: `continent-app/src/planner/aiDayPlan.js`, `continent-app/src/planner/AiDayPlanModal.jsx`, `continent-app/src/planner/CartaChatPlanner.jsx`, `continent-app/src/planner/days/AutoPlanBar.jsx`. Docs: `supabase/functions/plan-day/README.md`.

**Limits.**
- The server keeps only the first 28 candidates, so the trim limit of 30 or more never binds (observed in code).
- The cache key does not include whether a plan was grounded, so an ungrounded events plan can be served to a paying traveller (row T327-a).
- `ai_plan_cache` rows are never deleted (row T319-c).
- "Let Carta plan them" on a 7-day trip spends up to 7 plans and was only walked with the mock seam (row T823-a).
- The live refund path is unchecked (row T037-b).

### AI town suggestions (suggest-city)

**What it does.** In the day planner's town picker the traveller describes what they want ("a quiet coastal town, not touristy") and gets 3 to 5 towns for a day trip from their stay, each with one reason. Paying travellers can get real places beyond Carta's catalogue through live search.

**How it works.**
1. The client builds candidates from catalogue towns within `SUGGEST_TOWN_KM = 300` km of the stay, top rated first, capped at 150 (`SUGGEST_TOWN_CAP`), then `buildCityCandidates` keeps 120. Gateways are excluded. Chat moods are translated to suggest-city's focus (nature or city) and interests.
2. Server: signed-in user required; at least 3 candidates; free text up to 160 characters; up to 8 interests; candidates cut to 150 with up to 6 tags each.
3. Grounding: on by default (`AI_ENABLE_CITY_GROUNDING`), used only when the traveller has a `ground` unit left (`resolveTier`). A free user gets a catalogue-only answer.
4. Quota before cache: one `ground` unit if grounded, else one `plan` unit, from the same allowance as plan-day. If a `ground` consume loses a race it degrades to `plan` and ungrounded.
5. Cache: `ai_plan_cache`, valid 7 days; the stay is rounded to about 1 km in the key.
6. Model: same chain helper as plan-day, temperature 0.3, `maxOutputTokens: 8192`. Ungrounded calls use a strict `responseSchema`; grounded calls cannot combine search with a schema, so the JSON shape is spelled out in the prompt and parsed defensively (direct parse, fenced block, outer braces).
7. Validation (`sanitizeSuggestions`): at most 5; a catalogue pick must be a real candidate id; a web discovery needs coordinates within 400 km of the stay.
8. Failure refunds the unit; the client keeps the normal town list.

**Data behind it.** Same Supabase tables and secrets as plan-day; the catalogue's towns and ratings.

**Where it lives.** Backend: `supabase/functions/suggest-city/index.ts`, `supabase/functions/suggest-city/logic.mjs`, `supabase/functions/suggest-city/README.md`. App: `continent-app/src/planner/aiCitySuggest.js`, `continent-app/src/planner/DayPlannerTab.jsx` (`suggestCityAi`).

**Limits.**
- The README's `AI_USER_DAILY_CAP` of 10 predates per-tier quotas; caps now come from `plan_tiers`.
- Grounding returned 429 on an unbilled key when tested (README, 2026-07-27).
- Whether a discovery store would pay is unmeasured (row T327-b).

### Magic import (parse-booking)

**What it does.** The traveller drops booking confirmations (PDF, photo, text), pastes text, or gives a link, on a trip or in Tell Carta. Carta reads them once and fills the trip's booking rows (confirmation code, amount paid, manage-booking link) and puts any activities into an inbox to assign to days. It only fills blanks; it never overwrites what the traveller typed.

**How it works.**
1. Client (`bookingImport.js`, `bookingImportLogic.js`): at most `MAX_IMPORT_FILES = 4` files, `MAX_IMPORT_BYTES` 4 MB each, `MAX_IMPORT_TOTAL_BYTES` 6 MB a request; PDF, PNG, JPEG, WebP, plain text. The trip's stops, dates and group size go along as context.
2. Server: signed-in user required. Pasted text up to 20,000 characters. A link is fetched server side before quota is spent (an unreachable link costs nothing); HTML is stripped to text, a PDF link joins the files, private hosts are refused.
3. Quota: one `plan` unit (`ai_consume`), the same allowance as a day plan. No grounding.
4. Cache: `ai_plan_cache`, keyed on file hashes, text, context and language, but valid only 24 hours because it holds booking codes.
5. Model: same chain helper, temperature 0.1, `maxOutputTokens: 8192`, structured output: bookings (kind: flight_out, flight_home, flight, stay, car, transfer, activity, other; title, city, code, eur, amount, currency, link, date) and activities (name, city, eur, durationMin, note, day).
6. Prompt: report only what is printed; never construct a link; no names, emails, phones or addresses; text below the documents marker is untrusted data, never instructions.
7. Validation (`sanitizeParsed` in `logic.mjs`) drops constructed URLs. Nothing found returns `nothing_found` and refunds the unit.
8. Folding: `applyParsedBookings` matches each booking to a trip row by city (a one-stop trip needs no city) and turns unmatched ones into labelled custom rows; `toInboxItems` adds activities not already named.

**Data behind it.** `ai_plan_cache`, `ai_usage`; parse failures table (migration 042). Results land in the trip extras (`day_plans` payload) and the trip settings' imports.

**Where it lives.** Backend: `supabase/functions/parse-booking/index.ts`, `supabase/functions/parse-booking/logic.mjs`, `supabase/functions/parse-booking/README.md`. App: `continent-app/src/planner/bookingImport.js`, `continent-app/src/planner/bookingImportLogic.js`, `continent-app/src/planner/MagicImportZone.jsx`, `continent-app/src/planner/flow/BookedDoor.jsx`, `continent-app/src/planner/flow/importStays.js`, `continent-app/src/auth/mytrips/AddBookingSheet.jsx`.

**Limits.**
- Cache rows holding booking codes are read for 24 hours but never deleted (row T319-c).
- Request cost of an AI session against Supabase limits is unmeasured (row T231-e).

### Past trips

**What it does.** The traveller can log a trip taken before they used Carta: places, dates, who came, how they travelled, where they slept, what it cost, a rating, a story, a tip for friends and up to 8 photos. It then shows in My trips and the travel record exactly like a lived trip.

**How it works.**
1. Skeleton (`pastTrip.js`): signed in, it is saved as a normal trip plan with stops dated in the past; as a guest, as a device day plan. Nights are split over the places (`splitNights`) and can be moved one at a time.
2. A place not in the catalogue is geocoded on request with OpenStreetMap Nominatim and stored with a `past:` id and its own coordinates.
3. Memory (`pastTripMemory.js`, `MEMORY_VERSION = 1`): spend categories flights, stay, food, transport, activities, other; modes fly, train, bus, car, ferry, bike, walk; stay kinds hotel, apartment, hostel, camping, friends, own, other. The spend also writes rows into the trip's expense ledger tagged `src: 'memory'`; re-saving replaces only those rows.
4. Photos: at most `MAX_PHOTOS = 8`, resized to a 1,000 px edge, JPEG quality 0.72, about 1.6 MB budget, stored as data URLs.
5. The friends tip shows only on a trip shown to friends while the Tips switch in Together is on (migration 056).

**Data behind it.** `trip_plans` and `trip_plan_stops` (signed in) or `carta.dayplans.v1` (guest); the memory in trip extras, synced through `day_plans`.

**Where it lives.** App: `continent-app/src/auth/pastTrip.js`, `continent-app/src/auth/PastTripForm.jsx`, `continent-app/src/auth/pastTripMemory.js`, `continent-app/src/auth/TripMemoryView.jsx`, `continent-app/src/auth/tripCrew.js`, `continent-app/src/lib/geocode.js`.

**Limits.**
- Photos live in localStorage or the synced payload, so the size budget is tight by design.
- A saved trip with photos cannot be shared by a hash link; it needs a trip share token (migration 009).

### Together and shared trips

**What it does.** Travellers can plan with other people: invite a co-planner to edit the itinerary, share a read-only link, decide a group trip by voting on dates and places with private budgets, split costs, and send a trip finder shortlist for others to keep or skip.

**How it works.**
1. Co-planners (migration 020): a co-planner gets the itinerary (name, stops, cities, dates, nights, transport), not the day plan, expenses, notes or photos. Stops always carry the plan owner's user id.
2. Invite by link (migration 052): a 64-character token, valid 7 days, at most 5 live links per plan, 20 accept tries an hour per account. Opening it while signed in joins the trip and makes the two friends.
3. Read-only shares (migration 009): a revocable token for a saved trip; one function (`project_trip_payload`) whitelists what leaves. An unsaved draft is shared with no backend: JSON, deflated, base64url in the URL hash (`lib/shareLink.js`).
4. Group trips (migration 055): accepted friends of the owner are invited; each member gets one vote on when and one on where, and a private maximum for the whole trip a person that no one else can read. Expenses and settle-up use migration 058.
5. Decide together: the trip finder's `#together=` link (see Trip finder).
6. Together page rules: add by exact handle or link only, no browsing of people, no follower counts; declining and removing are silent.

**Data behind it.** Supabase `trip_collaborators`, `coplan_links`, `coplan_link_attempts`, `trip_shares`, `group_trips`, `group_trip_members`, `group_trip_options`, `group_trip_votes`, `group_trip_budgets`, `group_trip_expenses`, `group_trip_settlements`, `trip_join_requests`.

**Where it lives.** App: `continent-app/src/together/` (`TogetherPage.jsx`, `GroupTrips.jsx`, `SettleUp.jsx`, `useTogether.js`), `continent-app/src/planner/trip/ShareSheet.jsx`, `continent-app/src/planner/finder/TogetherSheet.jsx`, `continent-app/src/lib/recommend/together.js`. Backend: `supabase/migrations/009_trip_shares.sql`, `020_coplanners.sql`, `052_coplan_links.sql`, `055_group_trips.sql`, `057_join_requests.sql`, `058_group_expenses.sql`.

**Limits.**
- Co-planners do not share day plans (migration 020).
- Decide together runs on a link, not on accounts or a vote table (row T808-a).
- Migrations 055 to 058 are applied by the owner by hand; their state on the live database is Not found in code.

---

## Outdoors and imagery

Carta shows walks, bike routes, beaches, lakes and peaks on their own pages. Each kind comes from open data and goes through a pipeline gate before it ships. Every photo on those pages, and on place pages, comes from a licensed open source and carries a credit.

### Trails: finding and choosing walks

**What it does.** Carta lists marked walking routes across Europe, so a traveller can pick a walk near where they stay. Each country gets a spread of short and long walks, loops and famous routes, instead of every path on the map.

**How it works.**
1. **Ingest.** `pipeline/trails/ingest_osm_routes.py` reads per-country Geofabrik `.osm.pbf` extracts (`GEOFABRIK_BASE`). Overpass is never used for bulk reads.
   - It keeps relations with `type=route|superroute` and `route` in `ROUTE_VALUES` (`hiking`, `foot`, `walking`).
   - `passes_first_filter` keeps a relation that is in `MAJOR_NETWORKS` (`iwn`, `nwn`, `rwn`) or has a name. It drops node-network edges.
   - Member ways are stitched in relation order. The upsert key is `(source, source_ref)`. When a route appears in two extracts, the longest geometry wins.
2. **Extra routes.** `derive_routes.py` builds routes from named or graded paths and tracks, for every country with an extract (MD, XK, MK, MT and AL are the control group whose counts must not move). These rows are marked `derived_route=true` and `source=osm_ways`. A derived route that is mostly the same line as a real relation, both ways (`DUPLICATE_SHARE = 0.5`, `DUPLICATE_SHARE_BACK = 0.5`), is rejected.
   - Four passes, strongest first: `fame` (ways citing the same wikidata or wikipedia article), `base-name` (the same name with its stage marker stripped), `same-name`, `any-named`. The first two chain ends up to `NEAR_ENDPOINT_M = 50` apart, bridge at most `BRIDGE_MAX_TOTAL_M = 200` in total, and refuse a chain that branches.
   - T1094 added three rules to the strong passes. Article pairs: a way citing only a Wikipedia title joins ways citing the wikidata id that another way in the extract pairs with that title (`fame_keys`). Lone famous way: one way that cites an article, carries `sac_scale` or a waymark key, is a path, track or bridleway, is not a bridge or tunnel, and is at least `MIN_M_STRONG = 600` m is derived on its own (`lone_walk`). Main line: a branching strong chain ships its longest continuous line when that line carries at least `chain.SPINE_SHARE_MIN = 0.80` of the chain; the variant or spur set aside is recorded in `gap_info.spine_set_aside_m`.
3. **Gap repair.** `splice.py` bridges breaks with a straight line when every gap is under 300 m, there are at most 8 gaps, and the total is under 750 m and 5% of the route. The bridged parts ship as `bridges`. `repair.py` routes larger gaps with a local Valhalla graph (see the next feature).
   - T1094 reorder pass: a route the stored order refuses is tried again with its parts in walking order and direction (`chain.best_chain`, every part used, nothing dropped), under the same limits, stored as `ordered-splice`. When every break is under `TINY_GAP_M = 25` m the count cap rises to `TINY_MAX_GAPS = 30`; nothing else is relaxed.
4. **Duplicates.** `dedup.py` marks two routes `co_located` when the shorter is at least `LEN_RATIO_MIN = 0.5` of the longer and `SHARE = 0.8` of it lies inside a `BUFFER_M = 30` corridor. Routes under `MIN_LEN_M = 200` are skipped. Route families (same title, Wikipedia article or E-path) collapse to one slot.
5. **Selection** in `curate.py`:
   - The route must be one continuous line, or one repaired by a splice.
   - Length runs from `MIN_M = 2_000` to `MAX_M = 45_000`. Longer treks get in only as famous routes, up to `TREK_SHARE = 0.08` of the slots and `TREK_MAX_M = 400_000`.
   - Each NUTS3 region gets a quota of `4 + 8 x protected_share + 6 x relief_norm`, clamped to 3 to 45 (`pipeline/regions/quotas.py`). The country floor is `COUNTRY_FLOOR = 150`.
   - Slots fill in this order: famous routes (`FAMOUS_SHARE = 0.30`), loops (`LOOP_SHARE = 0.40`), distance bands (`BAND_SHARE`: under 5, 5 to 10, 10 to 20, 20 to 40 and over 40 km take 16, 26, 30, 20 and 8 percent), then the best of the rest.
   - Spread: at most `CELL_CAP = 3` routes per `GRID_DEG = 0.35` grid cell, and at most `SERIES_CAP = 4` from one series.
   - Ranking weights (`WEIGHTS`): network 0.24, quality 0.22, popularity 0.34, loop 0.20.
   - E-paths E1 to E12 are matched by `ref` (`EPATH_REF_RE`) and count as famous.
   - A second "listed" tier allows up to `LISTED_PER_REGION_MAX = 3` per region, 2 to 60 km long.
6. **Rating.** The 0 to 10 trail score comes from `pipeline/trails/rate.py` (task `trails_rate`, model `open-signals-v2`). The formula is covered in the Ratings section.

**Data behind it.**
- Sources: OpenStreetMap route relations (ODbL 1.0, credited "Trail data (c) OpenStreetMap contributors, ODbL").
- Coverage checks only: Waymarked Trails INT and NAT groups (`waymarked.py`, ids and names only), Wikidata, pageviews and national portals (`famous_registry.py`). Portal licences include swisstopo OGD, Kartverket CC BY 4.0, IGN Etalab 2.0, BVV CC BY 4.0 and Natural England OGL v3.0. WDPA is refused.
- Tasks, in chain order: `trails_ingest` (quarterly), `trails_elevation`, `trails_validate`, `trails_popularity` (monthly), `trails_registry` (monthly), `trails_splice` (monthly), `trails_regionize`, `trails_derive_routes` (quarterly), `trails_hierarchy`, `trails_curate`, `trails_forests` (quarterly), `trails_scenic`, `trails_images`, `trails_way_tags`, `trails_attributes`, `trails_rate` (which also exports the wire). Run each with `python run_pipeline.py <task>`. All except `trails_registry` need the trailslab database up (`guard_trailslab_up`).
- Wire: `continent-app/public/trails/index.json` (generated 2026-09-13) lists 45 country entries, 17,619 rated trails and 51 listed. Scope is 43 countries; TR and UA only with `curate.py --include TR,UA`.
- Country: a row is staged under the country of the extract it came from. At export, a walk under 30 km whose owning region (the midpoint) lies in another catalogue country is filed there (T456, `place_truth.trail_country`), and a row the Ireland extract staged whose owning region is in Northern Ireland is filed GB whatever its length (T1094, `export_wire.EXTRACT_QUIRKS`). Longer cross-border paths stay where they were staged.

**Where it lives.** `pipeline/trails/` (`ingest_osm_routes.py`, `derive_routes.py`, `chain.py`, `splice.py`, `recover_walks.py`, `repair.py`, `dedup.py`, `hierarchy.py`, `curate.py`, `famous_registry.py`, `waymarked.py`, `rate.py`, `export_wire.py`), `pipeline/regions/quotas.py`, `continent-app/src/lib/trails.js`. Docs: `archive/docs-2026-11/TRAILS.md`, `archive/docs-2026-11/TRAILS_DATA_QUALITY.md`.

**Limits.**
- The ingest reads relations only. Path-only routes are derived for just 5 countries.
- Sweep of 2026-09-18 (TRAILS_DATA_QUALITY): 15,943 walk candidates, 1,630 published (10.2%). 8,893 were lost as `way_only_not_derived` and 3,518 as `failed_continuity`. 14 of 30 famous test routes were published; the worst miss is Orla Perc.
- T1094 sizing (`recover_walks.py`, `data/reports/trails_recovery.md`, from the committed registry and coverage files): of the 8,891 `way_only_not_derived` rows, 8,621 carry no trail signal (streets, squares, bridges, lakes the Phase 1 classifier filed as trails) and leave the gate only when the registry is re-harvested; 246 carry walk evidence, and at most 190 of those are derivable walks. Of the 4,555 `failed_continuity` rows, 251 repeat a relation filed under a second country, 126 are parents of a published stage and 9 are already published; the remaining 4,169 need the lab to tell a break from a quota or length loss. The famous-route check reads 15 of 30 on the 2026-09-13 wire; the new rules are expected to add Sentier des Roches, Ruta del Cares and Orla Perc, and Laugavegur only if its breaks are order artefacts. None of this is measured on the box yet.
- Baseline of 2026-09-13: 1,282 rows with code names and 114 with empty names; 540 of 594 stage groups have no parent record; 162 of 1,367 NUTS3 regions have 2 or fewer trails.
- France portal agreement is 49.5%.

### Trail routing and repair tools (trailslab, brouter)

**What it does.** These are local tools the pipeline uses to stage, review and repair routes. The traveller never sees them, but they decide whether a broken route can still ship.

**How it works.**
- **trailslab** (`tools/trailslab/README.md`) is a local Docker PostGIS plus pgRouting database on port 5433. It never touches Supabase.
  - Each route moves through draft, needs_review, approved, published or rejected.
  - A FastAPI review screen runs on 127.0.0.1:8011.
  - Its `valhalla/` stack (port 8002, one country graph at a time) lets `repair.py` route across gaps over 50 m with pedestrian costing. It also routes legs for composed day trips.
- **brouter** (`tools/brouter/prepare.py`; there is no README) stages 5 by 5 degree `.rd5` tiles for one country and serves on 127.0.0.1:17777.
  - Profiles: `carta-touring`, `carta-gravel` (track grades 1 to 3) and `carta-scenic`.
  - Used only by the `cycling_bridge` task (`bridge_gaps.py --countries GB --min-km 100`). It tries the touring profile first, then stock `trekking`, which knows ferries.
  - It refuses a single break over 40 km, a bridge longer than 3 times its straight line, or more than 25% of a route bridged.

**Data behind it.** OSM-derived routing graphs (Valhalla tiles, BRouter segments from brouter.de). Not found in code: a refresh schedule for these graphs.

**Where it lives.** `tools/trailslab/`, `tools/brouter/prepare.py`, `pipeline/trails/repair.py`, `pipeline/cycling/bridge_gaps.py`, `archive/docs-2026-11/CYCLING.md`.

**Limits.** Only GB has BRouter tiles staged. Valhalla holds one country graph at a time. Both folders are large and slow to rebuild, so they must not be deleted for disk space.

### Trail difficulty

**What it does.** Every trail shows a grade (easy, moderate, hard, very hard or alpine) and a T1 to T6 step, so a traveller can tell a stroll from a scramble. When the grade is worked out rather than tagged, the page says it is estimated.

**How it works.** `pipeline/trails/attributes.py`:
1. **Tagged grade.** `SAC_GRADE` maps OSM `sac_scale`:
   - hiking to easy, mountain_hiking to moderate, demanding_mountain_hiking to hard;
   - alpine_hiking to very_hard;
   - demanding_alpine_hiking and difficult_alpine_hiking to alpine.
   The tag counts only when it covers at least `MIN_GRADE_COVER = 0.15` of the line. The worst segment wins, with a noise floor of `WORST_MIN_M = 200` m or `WORST_MIN_SHARE = 0.02` (`way_tags.py`).
2. **Floors.** `VIS_FLOOR`: bad visibility means at least moderate; horrible or none means at least hard. `FERRATA_FLOOR`: via ferrata grade 0 means hard, 1 to 2 very_hard, 3 or more alpine.
3. **Terrain from the DEM** when there is no tag (`DEM_LADDER`, max sustained gradient in percent, or ascent in m per km):
   - alpine 40 / 250;
   - very_hard 30 / 180;
   - hard 22 / 120;
   - moderate 14 / 70;
   - otherwise easy.
   A derived alpine grade needs a high point of at least `DERIVED_ALPINE_MIN_TOP_M = 1500`, or it drops to very_hard. A derived grade above moderate needs at least `DERIVED_HARD_MIN_RELIEF_M = 200` m between the lowest and highest point, or it drops to moderate (`relief_capped` in `grade_parts`): one steep 90 m span on a route whose top is a 112 m dune is not hard ground (T1092).
4. **Effort, per day of walking** (`pipeline/trails/difficulty.py`, T1092, ROADMAP D7). Length sets how many days a walk takes; the grade reads one of those days.
   - Hours by DIN 33466, the same rule as the walking time: `FLAT_KMH = 4`, `UP_MH = 300`, `DOWN_MH = 500`, the slower of flat and vertical time in full plus half the faster, on the route read uphill.
   - Days: up to `DAY_MAX_H = 10` hours is one day; longer walks are split into stages of `STAGE_H = 6` hours, `days = ceil(hours / 6)`.
   - One day's hours and climb against `DAY_LADDER` (hours over, or climb over): very_hard 8 h / 1,500 m; hard 6 h / 1,000 m; moderate 3.5 h / 500 m; otherwise easy.
   - Worked example: the Veluwe Zwerfpad (NL, 285,992 m, 2,888 m up) is 79.2 h, so 14 days of 5.7 h and 206 m of climb: moderate. It used to ship very_hard (the old rule made anything over 40 km very hard).
   - A walk of `LONG_MIN_DAYS = 2` or more days ships its days as `f.d` on the country row and the detail file (`export_wire.days_of_trip`).
5. **Final grade** = the harder of terrain and effort (`grade_of`).
6. Routes drawn downhill are read uphill (`DOWNHILL_MIN_M = 300`, `DOWNHILL_RATIO = 2`).
7. **Page step.** The page shows the SAC tag as T1 to T6 when present. Otherwise it uses `GRADE_STEP[grade]`, marked estimated (`TrailPage.jsx`, `GradeCard` in `OutdoorParts.jsx`).
   **Long.** When `f.d` is 2 or more and the grade is moderate or easier, the card, the nearby rows and the PDF say "Long" (`trails.gradeLong`) instead of the grade, and the page's grade fact says "Long, 14 days" (`trails.gradeLongDays`), unless the route carries a SAC tag (`isLongWalk`, `trailDays` in `continent-app/src/lib/trailStory.js`). A long walk on hard, very hard or alpine ground keeps its grade. The filter chips still filter on `f.g`.
8. **Publish gate.** `difficulty_gate.py` fails the export if any row's `difficulty` differs from `f.g`, or if row count or ids differ from the previous wire. Exit 1 means the previous wire is kept. `validate.py` also flags tag versus terrain contradictions.

**Data behind it.** OSM `sac_scale`, `trail_visibility` and via ferrata tags. Copernicus GLO-30 DEM. Task `trails_attributes`.

**Where it lives.** `pipeline/trails/attributes.py`, `pipeline/trails/difficulty.py`, `pipeline/trails/way_tags.py`, `pipeline/trails/difficulty_gate.py`, `pipeline/trails/validate.py`, `continent-app/src/browse/TrailPage.jsx`, `continent-app/src/browse/OutdoorParts.jsx`, `continent-app/src/lib/trailStory.js`. Tests: `tests/test_trail_difficulty_names.py`, `continent-app/tests/trailLong.test.mjs`.

**Limits.** Grades on untagged routes are estimates from the terrain model. Not found in code: a check against official national grades. The stage length is one number for every walk; a route's own published stages are not read yet.

### Trail names

**What it does.** A trail is called by a name a traveller can read and say, not by its route code or a script they cannot match to a signpost. The name the source used is kept beside it.

**How it works.** `pipeline/trails/names.py`:
1. **Title ladder** (`title_ladder`, run by `attributes.py`): Wikidata label, then the relation's name (`name:en`, a Latin `name`, the local language per `LOCAL_LANGS`, `int_name`, any Latin `name:*`), then from and to, then the best landmark passed, then shape and place. A code in the name moves to the ref chip (`split_code`).
2. **Network prefixes** (`strip_network`, T1092): "European long distance path E7, Andorra" becomes "E7, Andorra"; the E-path phrase in English, German, Dutch, French, Polish, Czech, Hungarian, Slovak, Spanish, Italian, Portuguese, Danish and Norwegian folds to its code, "Sentier de Grande Randonnee 10" to "GR 10", and "- part Poland" to ", Poland".
3. **Transliteration** (`transliterate`, T1092), only when no Latin name exists in the tags: Serbian Latin for RS, ME, BA and XK; the same caron letters for MK (with gj, kj, dz); the Bulgarian streamlined system (sht, a for the hard sign); the Ukrainian national system (h for ge); a BGN-style base table otherwise; Greek by ELOT 743 without its rarer rules.
4. **Shorten** (`cap_title`): at most `TITLE_MAX = 42` characters, cut between segments or words, never mid bracket, no ellipsis.
5. **On the wire** (`export_wire.py`): `name` is `wire_name(title, country)` (steps 2 to 4 again, idempotent, so a wire built before the ladder re-ran still reads clean). `src_name` (country row and detail file) is the relation's own `name` tag, at most `ORIGINAL_MAX = 64` characters, present only when it differs from `name`. The page prints it under the title as "Also called ..." (`trails.alsoCalled`).

**Where it lives.** `pipeline/trails/names.py`, `pipeline/trails/attributes.py` (`title_of`), `pipeline/trails/export_wire.py`, `continent-app/src/browse/TrailPage.jsx`. Tests: `tests/test_trail_titles.py`, `tests/test_trail_difficulty_names.py`.

**Limits.** On the wire of 2026-09-13, 643 of 17,619 rated rows are titled in Cyrillic or Greek, 37 carry an E-path phrase and 1,925 are over 42 characters; `wire_name` brings these to 1, 0 and 0 (2,523 names change), but only once the owner reruns `trails_attributes` and the export (T1092-a). Transliteration is by letter, so a name follows the national system, not always the spelling on the local signpost.

### Trail distance, climb and walking time

**What it does.** Each trail shows its length, metres up and down, the highest point, a height profile and a walking time.

**How it works.** `pipeline/trails/elevation.py`:
1. **Sampling.** The line is sampled every `SAMPLE_STEP_M = 30` m from the Copernicus GLO-30 DEM with bilinear interpolation. SRTM is not used, because it stops at 60 degrees north.
2. **Cleaning.**
   - Runs of zeros at the coast are interpolated away (`COAST_RUN_MAX = 3`, `COAST_LAND_M = 5`).
   - Missing values are filled linearly.
   - Over `MAX_NODATA_FRAC = 0.2` missing, the metrics are left empty (`low_coverage`).
3. **Climb.** A `SMOOTH_WINDOW = 3` moving average, then a `CLIMB_THRESHOLD_M = 5.0` hysteresis on local highs and lows. It was calibrated on 272 Swiss routes; computed versus tagged median is 0.94.
4. **Steepness.** Max grade over `GRADE_SPAN_STEPS = 3` (about 90 m). Shares steeper than 10% and 15% are kept. The profile has `PROFILE_POINTS = 200` points.
5. **Walking time** (`duration_min_din33466`, the DIN 33466 rule):
   - speeds are 4 km/h on the flat, 300 m/h up and 500 m/h down;
   - the slower of the flat time and the climb time counts in full, the faster one counts half.
6. Spliced routes get their distance fixed by a later `--sync-only` splice step.

**Data behind it.** Copernicus GLO-30 DSM (credited "Copernicus GLO-30 (c) ESA and Airbus"). Task `trails_elevation`, run after `trails_ingest`.

**Where it lives.** `pipeline/trails/elevation.py`, `pipeline/trails/elevation_validate.py`, `HeightProfile` in `continent-app/src/browse/OutdoorParts.jsx`.

**Limits.** Routes with more than 20% missing DEM have no climb or time. Walking time ignores terrain and grade.

### Trail page

**What it does.** A trail opens a full page: photos, the key facts, a map with a height profile, a GPX download, and what to know before going. It ends with how to get there and other walks nearby.

**How it works.** `continent-app/src/browse/TrailPage.jsx` uses the shared outdoor page (see below).
- **Head.** The name without the route number (the number becomes a badge), the rating, a rank line, and a lead from the first `why` reason or the story.
- **Six facts.** Grade, length, time (`duration_min`), climb up and down (`ascent`, `descent_m`), high point (`elevation.ele_max_m`), and route type (from the wire, else the `is_loop` test).
- **Forecast.** `RouteRainWarning` warns about rain.
- **Route.** Map plus height profile, GPX download, "Follow on the map".
- **Before you go.**
  - `GradeCard`, then season ("typically" when estimated), and waymarking with the ref.
  - Water points and up to 3 huts.
  - Dogs and permit.
  - Who the walk is not for (`notForLines`), then `SafetyBlock`.
- **Getting there.** Start name and height, nearest town, `access.parking`, and up to 3 `access.transit` stops.
- **Along the way.** Up to 6 highlights, each with the nearest photo within 1.5 km, plus stages, bases, stops and the parent route ("part of X, n stages").
- **Other walks nearby.** Nearby trails, peaks, lakes and beaches.
- **Side card.** Grade, length, time, climb and route, plus GPX, directions and a stay line.
- **Sources.** `attribution_text`, else "OpenStreetMap", plus upload and report-a-problem forms.
- **Photos.** Detail images, then the card image, then the nearest destination's photo, labelled as a photo nearby.
- **Loading.** `lib/trails.js` loads `/trails/{CC}.json`, `/trails/trip/{id}.json` and `index.json`. It checks the content type, because the app's fallback page answers with HTML.

**Data behind it.** The trails wire from `trails_rate`, plus outdoor page fields from `outdoor_pages` (see below).

**Where it lives.** `continent-app/src/browse/TrailPage.jsx`, `continent-app/src/lib/trails.js`, `continent-app/src/browse/OutdoorParts.jsx`, `pipeline/trails/export_wire.py`, `pipeline/outdoor/derive_outdoor_pages.py`. Latest report: `Execution/P15/T918-T922-outdoor-pages.md`.

**Limits.**
- Photos on 3,554 of 17,670 rows (20%) and summaries on 459 (2.6%) at the 2026-09-13 baseline. 739 (54%) of region top trails had no photo.
- `access.transit` is empty in every layer (T918-a).
- Dogs, permit and hut season are placeholders (T918-d).
- Parking only exists within about 1.5 km of a Carta destination (964 trails).
- Tagged suitability is thin: 6 routes for wheelchairs, 83 for dogs.
- Outdoor page data is not yet pushed to R2 (T954-a).

**Trail address and cards (T1102, G13).** An open walk writes `#trail=ID&tc=CC` on the history entry its layer pushed (`trailHash` in `src/lib/routeLinks.js`, effect in `DestinationsTab.jsx`), so it can be shared, bookmarked and reached with Back; closing it takes only those two params off. A city day has no trail page and writes none. The top-band rail tile ("Top-rated walks in ...") shows length, walking time and climb in one line (`trailFigures` in `src/lib/cardFillings.js`); the list card shows the same three as badges. A place page's "Around here" rows are real links to the feature's own address (`featureHref`), and the trail page's "Stay nearby" line links back to the town.

### Cycling routes and the cycle page

**What it does.** Carta lists bike routes and multi-day tours with surface, traffic, stages and ride time. A traveller can see how much is paved and traffic-free, and where each stage ends with beds.

**How it works.**
1. **Harvest.** `harvest_cycling.py` reads OSM `route=bicycle` relations with `icn`, `ncn`, `rcn` or `lcn` networks, or a name, from the same Geofabrik extracts.
   - Node-network edges go to `cycle_node_edges`.
   - Superroutes are kept only as membership (`carta:family_ref`).
   - Geometry is cross-checked against EuroVelo GPX and national portals (`AGREE_TOL_M = 40`).
2. **Surface.** Length-weighted `way_spans` with a `known_share`. `BIKE_ALLOWS`: touring allows only tracktype grade1, gravel allows grade1 to 3, mtb allows all.
3. **Safety.** A house metric: 10 minus the mean penalty.
4. **Stage planner** (`stage_planner.py`, `cycle_tour_v1`):
   - `PACES`: relaxed 45 to 65 km with up to 600 m climb; balanced 65 to 95 km, up to 1,000 m; strong 95 to 130 km, up to 1,600 m.
   - Tours run 120 to 1,200 km (`MIN_TOUR_M`, `MAX_TOUR_M`) with 3 to 14 stages.
   - Stage ends snap to a service town (`BAND_STRETCH = 0.18`, retried at `BAND_WIDEN = 0.35`). Each end needs `MIN_BEDS = 3` and a bailout within `BAILOUT_KM = 20`.
   - Up to `MAX_CHAIN = 3` routes can chain when their ends are within `CHAIN_JOIN_M = 2000`.
   - Season from climatology: high at least 11 C, low at least minus 2 C, rain at most 160 mm.
5. **Ten hard checks** (`validate_cycling.py`):
   - continuity, stage budget, real overnights, no repeats, surface fit;
   - safety floor (`SAFETY_FLOOR = 4.0`, `TRUNK_LIMIT_M = 2000`);
   - water and food (`DRY_LIMIT_M = 40000`), bailout;
   - images (`TOUR_IMAGES_MIN = 4`), season.
6. **Export** (`export_cycling.py`):
   - The rated tier needs `SCORE_GATE = 5.4` and `PHOTOS_RATED_MIN = 2`, with `COUNTRY_CEILING = 900`.
   - Score weights: scenic 0.26, safety 0.20, surface 0.16, designation 0.14, services 0.14, shape 0.10 (`cycle_index.py`, `cycle_index_v1`).
   - Ride time uses `RIDE_FLAT_KMH = 18` plus `RIDE_MIN_PER_100M = 10` minutes per 100 m of climb.
7. **Cycle page** (`CyclePage.jsx`).
   - Six facts, and a card with length, time, percent paved, percent traffic-free, GPX, and bike trains or directions.
   - Sections: Route (map and elevation), Surface and traffic (two bars), Stages (previous and next, or the tour's stages with season), Getting there, Along the way (facilities, towns), Other routes.

**Data behind it.**
- Sources: OSM (ODbL, kept in a separate `osm` block from Carta's own `carta` block), EuroVelo GPX, national portals, Natura 2000, Emerald and the EEA coastline (CC BY 4.0). Photos come from Commons and Geograph within 400 m.
- Tasks: `cycling_harvest` (quarterly), `cycling_enrich`, `cycling_photos`, `cycling_bridge`, `cycling_publish`, or `python pipeline/cycling/build_cycling.py` for all.
- Wire of 2026-10-23: 513 rated, 16,460 listed, 16 tours, 39 countries.

**Where it lives.** `pipeline/cycling/` (`harvest_cycling.py`, `stage_planner.py`, `validate_cycling.py`, `cycle_index.py`, `export_cycling.py`, `cycle_images.py`, `bridge_gaps.py`), `continent-app/src/browse/CyclePage.jsx`, `continent-app/src/lib/cycling.js`, `archive/docs-2026-11/CYCLING.md`.

**Limits.**
- In GB, 95 of 103 tour candidates fail continuity.
- The Hebridean Way scores 3.9, because safety reads road class.
- 26 tours were refused by the image gate.
- Cycle pages have no "Stay nearby", because rows carry no `base` (T922-a).
- Bike trains are a placeholder (T918-d).

### Beaches

**What it does.** A beach page tells a traveller how clean the water is, how warm the sea gets by month, what the beach is made of, which way it faces and what is on it. It then shows how to get there and other beaches nearby.

**How it works.**
1. **Spine.** The EEA bathing water register (`pipeline/beaches/eea_spine.py`), 22,289 designated sites. Sea sites are `SEA_TYPES` (`Coastal`, `Transitional`); inland sites are `INLAND_TYPES` (`Lake`, `River`).
   - An EEA site joins an existing beach within `MERGE_KM = 1.2` when the names agree, or `SAME_PLACE_KM = 0.2` without a name match.
   - `_ISO_ALIAS` maps EL to GR and UK to GB. Without it, Greece's 1,734 sites were lost.
2. **Harvest.** OSM from Geofabrik extracts: `natural=beach|shingle|sand` and `leisure=beach_resort|swimming_area`.
   - Unnamed beaches borrow the nearest bay or village name (`nameSrc: osm_near`).
   - Length is read from the geometry. Wikidata adds names, images and sitelinks.
3. **Water quality.** Classes are `CLASSES` (Excellent, Good, Sufficient, Poor) for `YEAR = 2025` (`harvest_bathing_water.py`).
   - In the score (`WATER_VALUE`): Excellent 1.0, Good 0.7, Sufficient 0.35, Poor 0.0. An unmeasured beach gets `WATER_DEFAULT = 0.62`.
   - The page shows the class as four named steps, with its year and sampling site (`WaterClass`).
4. **Sea temperature** (`harvest_sea_temp.py`).
   - Source: NASA JPL MUR SST v4.1 monthly through NOAA CoastWatch ERDDAP, sampled every 0.03 degrees.
   - A cell counts only if all 12 months are valid. The nearest valid cell must be within `BEACH_MAX_KM = 6.0`, with values inside `PLAUSIBLE` (minus 2 to 32 C).
   - `derive_outdoor_pages.py` writes `sea_temp` (12 values). The page draws a 12-month strip with the three warmest months highlighted.
   - Not found in code: a "comfortable to swim" threshold for sea temperature.
5. **Score** (`beauty_index.py`, `beach_beauty_v2`).
   - Weights: setting 0.24, acclaim 0.18, water 0.16, sand 0.14, wildness 0.14, comfort 0.10, space 0.06, photo 0.06. They sum to 1.08 and are normalised.
   - A `STANDOUT_BONUS = 0.15` applies for setting, sand, wildness or space.
   - Size classes: a cove is up to `COVE_MAX_M = 200`, a strand at least `STRAND_MIN_M = 2000`.
6. **Gate** (`export_beaches.py`):
   - a name test, then `MIN_SCORE = 5.6` for the rated tier;
   - at least 4 images with an evidenced lead photo;
   - beaches that fail fall to the listed tier instead of being dropped;
   - dedupe within 150 m, a quota per coastal stretch, and floors of at least 1 per NUTS3 and 3 per coastal stretch;
   - `PUBLISH_MAX = 900`.
7. **Swim bans.** `harvest_swim_bans.py` finds OSM `swimming=no` or `bathing=no` within `RADIUS_KM = 5.0` of a destination (`KEEP = 6`). This feeds the place page, not single beaches. No row means nothing is mapped, not that swimming is allowed.
8. **Page sections** (`BeachPage.jsx`).
   - Facts: water class, surface, lifeguard, length, facing, access.
   - The water: class steps, sea by month, waves, facing, lifeguard season.
   - On the beach: facilities, including shade, sunbeds, step-free, dogs, naturist.
   - Getting there; other beaches, with nearby trails and bike routes.
   - There is no route map or GPX.

**Data behind it.**
- Sources: EEA bathing water (EEA re-use terms), UK Defra (`uk_bathing.py`, OGL v3), OSM (ODbL), Wikidata (CC0), Natura 2000 and Emerald (CC BY 4.0, 29,749 polygons, `protection.py`), NASA MUR SST (public domain).
- Tasks: `bathing_water`, `beaches`, `sea_temp`, `beach_context` (all quarterly), `dest_overlays` for swim bans.
- Wire: `public/beaches/index.json` (2026-10-29) holds 2,745 rated and 3,873 listed beaches.

**Where it lives.** `pipeline/beaches/`, `pipeline/harvest_bathing_water.py`, `pipeline/harvest_sea_temp.py`, `pipeline/harvest_swim_bans.py`, `continent-app/src/browse/BeachPage.jsx`, `archive/docs-2026-11/BEACHES.md`.

**Limits.**
- Sea temperature reaches no beach yet: `sea_temp` is filled on 0 rows (the chain is fixed and tested on a recorded ERDDAP fixture in T1097; the real box run is T1097-a). The first run stopped after 12.7 hours on an ERDDAP HTTP 503 and now resumes in 6-hour slices (T918-b).
- Defra England and Wales returns HTTP 403, so GB beaches have no water class. Scotland (SEPA) and Northern Ireland (DAERA) are not connected, and Northern Ireland beaches are dropped.
- No Blue Flag data.
- Shade, sunbeds, lifeguard season and waves are placeholders (T918-d); step-free is known for 33 beaches, parking for 522.
- The four-photo pass has not run to completion.

### Lakes

**What it does.** A lake page leads with whether you can swim there and how warm the water likely is by month. It then covers the shore, how to get there and other lakes nearby.

**How it works.**
1. **Selection.**
   - Wikidata lakes, reservoirs and lagoons: `FAME_N = 700` by fame plus `AREA_N = 250` by area per country.
   - OSM water bodies of at least `MIN_AREA_HA = 5.0` (`osm_water.py`).
   - A shore path counts when a path runs within `PATH_BUFFER_M = 50` of the shore for at least `PATH_MIN_M = 300`.
2. **Swim verdict** (`lake_index.swim_rule()`), first match wins:
   1. a curated seed value;
   2. a prohibition (OSM `swimming=no`, `access=no|private`, or a ban phrase in Wikipedia) gives `no`, or `limited` if the lake also has EEA sites;
   3. EEA lake or river bathing sites on the shore give `yes`;
   4. a mapped swimming place gives `yes`;
   5. a drinking water reservoir gives `limited`;
   6. otherwise `unknown`.
3. **Water temperature is modelled.**
   - It starts from CHELSA V2.1 monthly air normals (1981 to 2010).
   - `water_temp_estimate` adds thermal lag (half of the previous month), solar gain up to about 2 C, and corrections for depth and altitude above about 800 m.
   - Every series carries `swim.est: true`. Geothermal lakes get no estimate.
   - Thresholds: `SWIM_WARM_C = 18.0`, `SWIM_GOOD_C = 20.0`.
4. **Score** (`lake_index_v2`).
   - Weights: scenery 0.25, swimming 0.20, activity 0.14, acclaim 0.13, water 0.10, wildness 0.08, photo 0.06, shore 0.04.
   - `SWIM_VALUE`: yes 1.0, limited 0.55, unknown 0.4, no 0.
5. **Gate** (`export_lakes.py`):
   - `MIN_SCORE = 5.4`, `MIN_IMAGES = 4`, `PUBLISH_MAX = 400`, `DUPLICATE_KM = 1.2`;
   - at least `COUNTRY_FLOOR = 4` per country (score at least `FLOOR_MIN_SCORE = 4.0`) and `BASIN_FLOOR = 2` per basin.
6. **Page sections** (`LakePage.jsx`).
   - The swim verdict is the first fact.
   - Swimming: source, lifeguard season, water class, modelled month strip, hazards.
   - Around the shore; Getting there; other lakes, with nearby trails and peaks.

**Data behind it.**
- Sources: Wikidata (CC0), OSM (ODbL), EEA bathing water, CHELSA (CC BY 4.0), Wikipedia (CC BY-SA, facts only).
- Tasks: `lakes` and `lake_detail` (quarterly). They need the EEA cache and the CHELSA file (`guard_lakes`).
- Wire: 1,628 rated and 1,048 listed lakes.

**Where it lives.** `pipeline/lakes/` (`harvest_lakes.py`, `osm_water.py`, `lake_climate.py`, `lake_index.py`, `export_lakes.py`), `continent-app/src/browse/LakePage.jsx`, `docs/LAKES.md`.

**Limits.**
- Water temperature is an estimate, not a measurement. Lake Como reads 0 C in January and February (T641-d).
- Photo pass rates are low in the north: Norway 13% of 867 lakes, Ireland 12% of 641, Iceland 16% of 197.
- Entry price, rentals and lifeguard season are placeholders (T918-d). Parking is filled for 72 lakes, altitude for 964.

### Mountains and peaks

**What it does.** A mountain page shows how high and prominent a peak is, which walks reach the top, which lifts help, and which months are snow-free. It ends with safety notes and other peaks nearby.

**How it works.**
1. **Sources.**
   - Wikidata: 247,164 mountains in 43 countries, 171,183 of them in Norway.
   - OSM (`osm_spine.py`): `natural=peak|volcano|saddle` and `mountain_pass=yes` nodes, ridges, aretes and cliffs over 500 m, and plateaus.
   - OSM and Wikidata are matched by the `wikidata` tag, else within `OSM_MATCH_M = 150`.
   - Extra Wikidata passes add country high points (P610), plus hills and volcanoes for countries under `THIN_POOL = 900` rows.
   - Not found in code: a minimum prominence or height for selection.
2. **Terrain** (`terrain.py`, `terrain_v1`, Copernicus GLO-30).
   - Prominence by flooding (`promSrc: "dem_min"` marks a lower bound) and isolation.
   - A height check that flags a gap over 30 m.
   - A viewshed to `VIEW_RADIUS_KM = 30`.
   - Ascent slope bands (`SLOPE_BANDS`).
3. **Score** (`peak_index_v2`). Weights: scenery 0.24, access 0.20, acclaim 0.18, stature 0.16, experience 0.14, views 0.06, photo 0.02.
4. **Season** (`season.py`, `peak_season_v1`).
   - NASA POWER climatology, corrected to summit height at 6.5 C per km.
   - Snow lies below minus 2 C and none lies above 4 C.
   - Good months have snow under `BEST_MAX_SNOW = 35` percent and temperature over `BEST_MIN_TEMP_C = 3`. If no month qualifies, the 3 warmest are named and the peak is marked `snowbound`.
   - The page marks snow months at 75 percent or more and storm months at 30 percent or more.
5. **Lifts.** `harvest_lift_hours.py` reads OSM `opening_hours` and `charge` on aerialways or funiculars within `LIFT_M = 2500` of peaks already marked lift-served. `NEAR_LIFT_M = 3000`. The fare is recorded but not shown.
6. **Routes to the top.** `derive_outdoor_pages.py` lists trails that pass within `SUMMIT_M = 150` of the summit and within `SUMMIT_DZ = 60` m of its height, up to `ROUTES_MAX = 4`.
7. **Gate** (`export_peaks.py`):
   - `MIN_SCORE = 5.0`, `MIN_IMAGES = 4`, `PUBLISH_MAX = 300`, `DUPLICATE_KM = 1.0`;
   - at least `COUNTRY_FLOOR = 8` per country and `RANGE_FLOOR = 2` per GMBA range;
   - tiers are rated, listed and editorial.
8. **Page sections** (`MountainPage.jsx`): routes to the top, huts and lifts, when to go, before you go (hazards, slope, safety), other peaks. The page never writes a route description.

**Data behind it.** Wikidata (CC0), OSM (ODbL), Copernicus GLO-30, NASA POWER. ERA5 is written but needs `CDSAPI_KEY`. Tasks: `mountains` and `peak_context` (quarterly). They need the Wikidata cache (`guard_mountains`). The wire holds 728 rated peaks.

**Where it lives.** `pipeline/mountains/` (`osm_spine.py`, `harvest_peaks.py`, `terrain.py`, `season.py`, `peak_index.py`, `harvest_lift_hours.py`, `export_peaks.py`), `continent-app/src/browse/MountainPage.jsx`, `archive/docs-2026-11/MOUNTAINS.md`.

**Limits.**
- Photos are the binding constraint: Norway passes 23.4% against 36.8% for the whole layer.
- Monaco's floor cannot be met (only 2 rows).
- Routes to the top are found for 275 of 2,143 peaks. Lift and hut info are placeholders (T918-d).
- Storm and crowd data are open (T921-a).
- `SUMMIT_LIFT_M` is 250 in `peak_index.py` and 700 in `enrich_peaks.py`.

### Shared outdoor page pattern

**What it does.** Trail, cycle, beach, lake and mountain pages share one layout: photos, head, facts, a jump bar, sections, a score section and sources. A traveller learns the layout once and finds the same things in the same place.

**How it works.**
- **Components.** `OutdoorParts.jsx` (class prefix `.ox-`) exports:
  - `OutdoorPage`: page bar, a 1 plus 4 photo mosaic, head, 4 to 6 facts, a sticky jump bar, sections, a "why it rates" section and sources. From 1024 px a side card with "Add to a day plan" appears; below that, a foot bar.
  - Building blocks: `StayLine`, `RouteBlock`, `HeightProfile`, `GradeCard` (6 SAC steps), `CheckRows`, `Facilities`, `WaterClass` (4 steps), `MonthStrip` (12 bars), `SafetyBlock` (112 and the weather), `MapSpot`, `AlongCards`, `OtherNearby`.
  - Helpers: `outdoorPdfModel`, `plainName`, `monthIndex`, `accessRows`, `pointRow`.
- **Empty sections.** A section without data is not drawn, and its jump link is dropped.
- **Derived fields.** `pipeline/outdoor/derive_outdoor_pages.py` (task `outdoor_pages`, weekly) adds fields. It is idempotent, and hand-filled values in `cache/outdoor/{layer}.json` win over derived ones.
  - Beaches: `sea_temp`, parking within `PARKING_M = 500`, and `step_free` (OSM `wheelchair=yes` gives true, steps give false).
  - Lakes: `alt_m` from Wikidata, else a trail DEM point within `ALT_TRAIL_M = 150`, and parking within 500 m.
  - Mountains: routes to the top (see Mountains).
  - Trails: parking within 400 m.
  - All layers: up to 3 transit stops.
- **Nearby outdoors.** `NearbyOutdoors.jsx` reads build-time `nb` ids from `pipeline/joins/neighbours.py`. Radii (`NB_RADIUS_KM`):
  - beach to trail 5 km, to beach 15, to cycle route 3;
  - lake to trail 4, to peak 15;
  - peak to trail 6, to peak 20;
  - trail to beach 3, to lake 2, to peak 3;
  - cycle route to anything 5.
  A row without an `nb` block renders nothing.

**Data behind it.** Built from the layer wires above, plus OSM parking and transit. Task `outdoor_pages`.

**Where it lives.** `continent-app/src/browse/OutdoorParts.jsx`, `continent-app/src/browse/OutdoorMap.jsx`, `continent-app/src/browse/NearbyOutdoors.jsx`, `pipeline/outdoor/derive_outdoor_pages.py`, `pipeline/joins/neighbours.py`. Report: `Execution/P15/T918-T922-outdoor-pages.md`.

**Limits.**
- Many fields are placeholders until harvests exist (T918-d), and transit is empty in every layer (T918-a).
- Parking is found only within about 1.5 km of a destination.
- The derived data is not yet pushed to R2 (T954-a).

### Image ladder (sized copies)

**What it does.** Photos should load fast at the right size on a phone or a desktop. Carta has two paths: resized links to Wikimedia, and its own AVIF and WebP copies, which are built but not live.

**How it works.**
1. **Live path: Wikimedia links.** `lib/heroImage.js` uses `WIKI_WIDTHS = [250, 330, 500, 960, 1280, 1920]`, the only widths Wikimedia renders; other widths answer 400.
   - `srcSetFor(url, max = 960)` builds the srcset, and `fallbackSrc` defaults to 500.
   - `HeroImage.jsx` defaults to `maxWidth = 960`, a 4:3 ratio, and lazy loading unless `eager`.
2. **Own copies (`ladder_v1`).** `pipeline/photos/derive.py` makes `LADDER`: AVIF at 320, 640 and 1280, plus WebP at 320 and 640 (`WIDTHS`). There is no JPEG rung.
   - The source is fetched at `SOURCE_WIDTH = 1920`, never upscaled, converted to sRGB, and stripped of metadata.
   - Quality: `AVIF_Q = 50`, `WEBP_Q = 75`.
   - Address: `{IMG_BASE}/{ih[0:2]}/{ih[2:4]}/{ih}/{w}.{fmt}`, where `ih` is the sha1 of the file title.
3. **App side.** `lib/imageLadder.js` (`IMG_BASE` from `VITE_IMG_BASE`, default `https://cdn.carta-europetravel.com/img`).
   - The srcset uses the real width from `d`. `ladderOf()` needs a 40-character `ih` and valid dimensions.
   - `ph` is a 24-character placeholder: 6 colour blocks in a 3 by 2 grid (`wire_ladder.py`). It is painted as a CSS gradient so it never becomes the largest paint.
4. **Rendering.** `LayerPhoto.jsx` renders `<picture>`: AVIF, then WebP, then an `<img>` with the Wikimedia URL.
   - Sizes: `HERO_SIZES = '(min-width: 769px) 860px, 100vw'`, `THUMB_SIZES = '(min-width: 769px) 215px, 25vw'`.
   - The hero loads eagerly with high priority and an AVIF preload. On error it falls back to the plain image.
5. **Switch.** `lib/pictureFlag.js`: `PICTURE_LAYERS = ['beaches', 'lakes', 'mountains']`, turned on by `VITE_PICTURE_LAYERS` or `?pic=`. It is off when unset.

**Data behind it.** R2 bucket `carta` behind `cdn.carta-europetravel.com`. Objects are cached for a year as immutable; manifests for 300 seconds. Garbage collection (`derive.py gc`) waits 14 days and refuses to delete over 25% of the bucket without `--force`. Transcoding runs as `image_transcode` on a Hetzner CAX41.

**Where it lives.** `pipeline/photos/derive.py`, `pipeline/photos/wire_ladder.py`, `continent-app/src/lib/imageLadder.js`, `continent-app/src/lib/heroImage.js`, `continent-app/src/lib/pictureFlag.js`, `continent-app/src/components/LayerPhoto.jsx`, `continent-app/src/components/HeroImage.jsx`, `archive/docs-2026-11/PHOTOS.md`.

**Limits.**
- The CDN is not live: open rows T049-a to T049-d, T052-a and T235-d.
- Nothing joins the manifest into the wire, so production has no `ih` or `d` (T052-d).
- Every surface except beach, lake and mountain pages still links to Wikimedia directly (T052-f).

### Licensed photo sources and credits

**What it does.** Carta only shows photos whose licence allows reuse, and it credits the author and licence under each photo. A photo that owes a credit Carta cannot give is not shown.

**How it works.**
1. **Sources.**
   - Wikimedia Commons: category walk to `CAT_DEPTH = 2`, and geosearch up to 10,000 m (`commons.py`).
   - Wikipedia lead images: `harvest_images.py`, `pithumbsize = 900`.
   - Wikidata P18, plus view properties P4640 panorama, P8592 aerial, P5252 winter (mountains) and P3451 night (`wikidata_views.py`).
   - Geotagged Commons and name-matched Wikipedia images for points of interest (`enrich_images_commons.py`, `enrich_images_web.py`).
   - Geograph for GB and IE (CC BY-SA, within `MAX_DISTANCE_KM = 20`).
   - Mapillary (CC BY-SA), only for rows with no other image, and never as the main photo.
2. **Refused.** Flickr (its delete-on-request terms).
3. **Licence gates.**
   - `derive.py` `NOT_STORABLE` refuses NC, ND, fair use, non-free, all rights reserved and empty licences.
   - `harvest_image_licenses.py` (`_BAD_LICENSE_RE`) refuses NC, ND and "by permission". It writes `ok:false` to `cache/poi_image_licenses.json`.
   - CC BY, CC BY-SA, CC0 and public domain pass. Licence data comes from Commons `extmetadata`.
4. **Credit text** (`photos/credit.py`).
   - The author comes from `Attribution`, then `Artist`, then `Credit`, with HTML stripped, capped at `MAX_LEN = 120`.
   - Public domain, CC0 and `AttributionRequired=false` need no credit.
   - `owes_credit()` blocks a CC photo with no author at export.
5. **Display.** `"Photo: {author, licence}"` as a caption line under the photos, linked to the source page. Before T1024 it sat on the image.
   - `lib/imageCredit.js` `creditFor()` handles Commons (via `public/poi_credits.json`, loaded on demand), Geograph and CDN copies (via `img/manifest/<layer>.json`). With no manifest it returns nothing and never guesses.
6. **Takedown** (`photos/takedown.py`).
   - Steps, in order: a ledger entry, a wire scrub, deletion of the 5 R2 copies, a Cloudflare cache purge, then a manifest rewrite. Each step reports ok, failed or skipped.
   - `derive.py` refuses to run if the ledger has fewer rows than the last manifest recorded.
7. **Home film.** The home film uses Pexels clips. Their licence needs no credit, so none is shown (T621). The source of each clip is kept in `src/lib/homeDemo.js`.

**Data behind it.** Commons (licence per file), Wikidata (CC0), Wikipedia, Geograph, Mapillary, Pexels. Task `photo_sources` runs after the outdoor layers (`derive.py sources ... --upload auto`). Tasks `poi_images_wikidata` and `poi_images` are backfills.

**Where it lives.** `pipeline/photos/` (`commons.py`, `geograph.py`, `mapillary.py`, `wikidata_views.py`, `credit.py`, `takedown.py`, `derive.py`), `pipeline/harvest_images.py`, `pipeline/harvest_image_licenses.py`, `pipeline/enrich_images_commons.py`, `pipeline/enrich_images_web.py`, `continent-app/src/lib/imageCredit.js`, `archive/docs-2026-11/PHOTOS.md`.

**Limits.**
- 22 photos owe a credit nobody can supply.
- The no-attribution waiver does not reach the wire.
- The Geograph dumps and key (`CARTA_GEOGRAPH_KEY`) and the Mapillary token are not set up.
- Day-plan photo strips (`TripDayPhotos.jsx`) show the place name but no credit.

### Hero image choice

**What it does.** Each place, beach, lake, peak or trail gets one lead photo. It should be sharp, show the subject itself and look good, and the same photo should not stand for two places.

**How it works.**
1. **Ranking** (`selection.py`, `photo_rank_v1`).
   - Beauty = 0.45 aesthetic + 0.20 Commons assessment + 0.15 NIMA + 0.10 technical + 0.10 season. Missing parts are dropped and the weights renormalised.
   - Commons assessment: Featured or Picture of the Year 1.0, Quality Image 0.75, Valued Image 0.6.
   - `P18_BONUS = 0.10`.
   - The hero is the highest beauty among `HERO_TIERS` (p18, title, viewcat, category, name). Tiers `geo` and `street` never become heroes (`NEVER_HERO`).
   - `GALLERY_MAX = 5` photos follow the hero. Close calls within `NEAR_TIE = 0.05` go to a review queue.
2. **Technical floor** (`technical.py`).
   - Short edge at least `HERO_MIN_EDGE = 800` for a hero and `GALLERY_MIN_EDGE = 500` for the gallery.
   - Blur is rejected below `BLUR_REJECT_BELOW = 25.0` (Laplacian variance).
3. **Aesthetics.** CLIP `ViT-L-14` with the LAION aesthetic head, scaled from `AESTHETIC_LO = 3.0` to `AESTHETIC_HI = 7.5` (`aesthetics.py`).
4. **Relevance.** A CLIP check (`relevance.py`, `MARGIN = 0.02`) can veto a photo but never admit one. P18 images are exempt.
5. **Duplicates.** `dedupe.py` treats `PHASH_SAME = 6` or `COSINE_SAME = 0.93` as the same image, and keeps one per cluster.
6. **Season.** The month comes from EXIF, metadata or the filename (`season.py`). The overcast probe is disabled (`CONDITION_ENABLED = False`).
7. **Brief.** `archive/docs-2026-11/IMAGE_BRIEF.md` lists hard rejects: animal or plant close-ups, vehicles, interiors, maps or diagrams, satellite images, people or markers as the subject, and views from more than 2 km away unless framed "seen from".
8. **Destination heroes** (`audit_hero_images.py`).
   - Rejects `BAD_PATTERNS` (map, satellite, emblem, diagram, collage, document).
   - Checks the 12:5 frame (`HERO_FRAME_AR`) and flags narrow images.
   - `duplicateHeroes()` in `heroImage.js` withholds a photo used for two places within `SAME_PLACE_KM = 30`; the more famous place keeps it.

**Data behind it.** The sources above. Tasks `photo_sources`, `clip_sweep` (Hetzner), `images` and `hero_audit`.

**Where it lives.** `pipeline/photos/selection.py`, `technical.py`, `aesthetics.py`, `relevance.py`, `dedupe.py`, `season.py`, `vision_prompt.py`, `pipeline/audit_hero_images.py`, `continent-app/src/lib/heroImage.js`, `archive/docs-2026-11/IMAGE_BRIEF.md`.

**Limits.**
- The NIMA model is not converted, so its weight drops out.
- Only 29 of about 800 evaluation rows are labelled.
- Some beaches, such as Langevelderslag and Laguna Beach, have only building photos.

### Photo gallery

**What it does.** Place, journey and outdoor pages open with a set of photos. On a phone they swipe; on a desktop one large photo sits beside four small ones, with a button to see them all.

**How it works.** `continent-app/src/browse/PhotoGallery.jsx` has three variants.
- **Mosaic** (`layout="mosaic"`), used on `DestinationPage`, `JourneyPage` and `OutdoorParts`:
  - On a phone, a swipe carousel with round arrows, arrow keys and an "N photos" button. Since T1025 it runs edge to edge at 3:2, at most 36% of the screen height.
  - From 700 px wide, one large photo plus 4 small (`imgs.slice(0, 5)`). Each opens "Show all N photos" (`AllPhotos`), a dialog with focus trap, Escape to close, and every photo with caption and credit.
  - The first image loads eagerly with high priority; the rest load lazily.
- **Strip**: arrows, swipe and arrow keys, with the credit in the caption.
- **TilePhotos** on list tiles: the first photo loads at once, the rest on first touch, hover or swipe. Dots sit under the photo, and a tap opens the tile.
- **Order** is kept as given; the pipeline puts the hero first.
- **Broken images** are added to a `failed` set and removed. If none are left, the placeholder shows.
- **Day plans.** `TripDayPhotos.jsx` shows up to `MAX_PER_DAY = 4` photos per day at 3:2.

**Data behind it.** Image lists from each layer's wire, built by the photo pipeline above.

**Where it lives.** `continent-app/src/browse/PhotoGallery.jsx`, `continent-app/src/browse/TripDayPhotos.jsx`, `continent-app/src/browse/OutdoorParts.jsx`. Reports: `Execution/P15/T1024-place-head.md`, `Execution/P15/T1025-place-head-compact.md`.

**Limits.** The four-photos-per-row target is not met everywhere. Most trails have no photo of their own (see Trail page).

### Image audits

**What it does.** Scheduled checks catch broken, badly framed, unlicensed or duplicated photos before travellers see them. Nothing in the app changes from this directly; it feeds fixes.

**How it works.**
1. **`image_audit`** (weekly, `pipeline/images/audit_all.py`, after `fix_url_queries.py`, with `--probe 20`). It checks:
   - URL shape: https, a known host, no query, a valid width, no SVG or `Special:FilePath`. The allowed hosts in `images/checks.py` are Wikimedia only.
   - Frame fit against the card CSS (`FIT_WEAK = 0.62`, `FIT_BAD = 0.55`) and size floors.
   - The licence, credit and evidence contract, coverage and country covers.
   - Duplicates more than `DUPE_KM = 30` apart.
   - An HTTP probe that checks content type, because the app's fallback answers 200 with HTML.
   Output: `data/reports/image_audit.json` and `image_audit_sheet.html`.
2. **`hero_audit`** (monthly, `audit_hero_images.py`, after `images`). It checks destination heroes, fixes them (the article's own images first, then a Commons geosearch), and runs a `dupes` pass. Output: `data/reports/hero_images_audit.json` and a contact sheet for review by eye.
3. **`drop_dead_files.py`** clears a URL only after the Commons API confirms the file is missing.
4. **`apply_image_dims.py`** writes `image.w` and `image.h` from `cache/hero_image_meta.json`.

**Data behind it.** The image wire files, the Commons API and the HTTP probe.

**Where it lives.** `pipeline/images/audit_all.py`, `pipeline/images/checks.py`, `pipeline/images/drop_dead_files.py`, `pipeline/images/fix_url_queries.py`, `pipeline/audit_hero_images.py`, `pipeline/apply_image_dims.py`.

**Limits.** The latest `image_audit.json` is from 2026-08-26, so its numbers may be stale:

| Layer | Entries | No image | Heroes flagged |
|---|---|---|---|
| destinations | 3,038 | 0 | 86 |
| features | 7,069 | 606 | 0 |
| beaches | 1,191 | 0 | 10 |
| lakes | 1,061 | 0 | 47 |
| mountains | 687 | 0 | 25 |
| trips | 5,524 | 0 | 432 (poor fit) |
| trails | 5,243 | 1,631 | 183 |

It also found 200 cross-layer duplicates. The hero audit of 2026-08-25 found images on 3,035 of 3,038 destinations, flagged 115 and fixed 647.

### When there is no photo (map and placeholder fallback)

**What it does.** When Carta has no photo it may publish, it says so plainly and shows a map or a neutral placeholder, instead of a wrong or unlicensed image.

**How it works.**
- **Outdoor rows.** The pipeline ships `{"k": "no_photo_map_card"}`.
  - Lakes and mountains show "No photograph we can publish yet, so here is the map" (`photo.mapCard`).
  - Beaches show "No photograph yet" (`beach.mapCard`).
- **Places.** `HeroImage` with no URL shows `hero-blank`: two initials and the country flag. Place cards use `PlaceCardNoPhoto`, a plain sunken ground. Route cards get a route icon.
- **Trails.** A trail without a photo uses the nearest destination's photo, labelled as a photo nearby.
- Not found in code: a static map tile image used in place of a photo.

**Data behind it.** The image lists in each wire. An empty list triggers the fallback.

**Where it lives.** `continent-app/src/components/HeroImage.jsx`, `continent-app/src/browse/PlaceCard.jsx`, `continent-app/src/browse/PhotoGallery.jsx`, `continent-app/src/browse/TrailPage.jsx`, `continent-app/src/browse/OutdoorParts.jsx`.

**Limits.** Trails rely on this fallback most: 1,631 of 5,243 trail entries had no image at the 2026-08-26 audit.

---

## Ask Carta, accounts and platform

This section covers the parts of Carta that sit around the travel content: the Ask Carta chat, accounts and saved trips, planning with friends, the paid Pass, languages, the back office, and the machinery that moves pipeline data to the live site. Every number below was read from code, config or migrations on 2026-11-04; where the code does not say something, the text says so.

### Ask Carta

**What it does.** A chat box where a traveller types a question in plain words, such as "warm beach in October under 80 euros a day" or "Porto or Lisbon?", in any of the six app languages. Carta answers first with a facts answer built by code (a short list of places, prices, months), then may add a few written sentences that cite numbered notes. Chats are kept on the device and, when signed in, in the account. Ask Carta is free: no paywall gate was found on it.

**How it works.**
1. **Intent (no model, no network).** `src/lib/ask/intent.js` `parseIntent` reads the question against the guided search's closed vocabulary and returns one Intent. Types: `find`, `budget`, `when`, `about`, `compare`, `near`, `plan`. It also pulls out party (adults, children, couple, solo, family), days or nights, total or per-day money (`BUDGET_STEPS` = 40, 60, 80, 100, 130 euros), travel mode, origin, month or season, no-car, quiet and warm. Words it cannot place go into `unknown`. Languages: `LANGS` = en, nl, de, fr, es, it. A follow-up ("and in May?") is bound to the previous turn by `followup.js`. A place outside Europe ("Dubai") is caught by `outside.js` so the answer says Carta does not cover it.
2. **Retrieval, hybrid (`src/lib/ask/retrieve.js`).**
   - Sparse: BM25 in the browser with MiniSearch over `public/search/ask/bm25.json` (names, tags, text). Prefix match for terms over 3 letters, fuzzy 0.2 for terms over 5 letters, top 60 destinations.
   - Dense: `GET /api/ask` (`functions/api/ask.js`). The question (at most 200 characters) is embedded with `minishlab/potion-multilingual-128M`, a static model2vec model distilled from BAAI/bge-m3, 256 dims, pruned to the corpus vocabulary. Scoring is two stage: sign bits first, then int8 (`functions/_lib/askScore.js`). It can filter by country (`cc`, up to 12) or place (`d`, up to 12) before scoring. Hits per source (`PER_SOURCE`): dest 50, highlight 24, sight 16, trail 12, beach 10, lake 10, journey 8, peak 8, country 4. Up to 5 unknown words are matched to a lexicon of facets, accepted only at cosine `LEX_MIN` = 0.62 or higher. Responses are edge cached for 1 hour (`HOLD` = 3600). The client gives up after `DENSE_TIMEOUT_MS` = 1200 ms.
   - Sources searched depend on intent type (`SOURCES` in retrieve.js), for example `plan` uses dest, highlight and trail.
   - Fusion: reciprocal rank fusion with `RRF_K` = 60. Either half may be missing; the answer then stands on the other half or on the rules alone.
3. **Ranking (`src/lib/ask/rank.js`).** Uses the same filter and price code as Explore (guidedSearch, budgetSearch, tripTotal) so an answer cannot disagree with the list it opens. Weights `W`: relevance 0.1, vibe 0.25, month 0.1, rating 0.15, fit 0.15. An answer leads with `PICKS` = 6 places. "Warm" means at least `WARM_C` = 20 C. When nothing fits, facets are relaxed in a fixed order (`RELAX`: quiet, budget, warm, month, nb, nocar, vibe) and the answer says which were relaxed.
4. **Facts answer (`compose.js`).** Code writes the first answer. The model only rewords facts; it never adds numbers.
5. **Context pack (`context.js`).** Numbered notes: one fact row per pick written by code, then retrieved passages. Limits: `MAX_NOTES` = 14, `MAX_NOTE_CHARS` = 300, `MAX_QUESTION_CHARS` = 200, `MAX_ANSWER_TOKENS` = 380, `PROMPT_VERSION` = 4. Comparison verdicts get their own code-written notes (`comparisonNotes`).
6. **Written answer, two back ends (`generate.js`), tried in order:**
   - On device, if the traveller switched it on and the model is loaded (see below).
   - Server: `POST /api/ask/answer` (`functions/api/ask/answer.js`) on Cloudflare Workers AI. Models in order: `@cf/qwen/qwen3-30b-a3b-fp8`, then fallback `@cf/meta/llama-3.2-3b-instruct`. Temperature 0.2, streamed as server sent events. The client waits at most `FIRST_TOKEN_MS` = 12000 ms for the first piece.
7. **Caps and cache on the server.**
   - Daily Neurons cap: `CAP` = 9000 of the free 10,000 a day (resets 00:00 UTC), counted in KV binding `ASK` under `n:<date>`. The worst case is booked before the call and settled to the real cost after. Past the cap the answer is `429 cap` and the facts answer stays.
   - Without the `ASK` KV binding the Function refuses to call the model (`503 nocap`), so a paid account cannot be billed by a missing counter. Without the `AI` binding: `503 off`.
   - Body at most 8192 bytes. Rate: `RATE` = 8 answers a minute per IP, per isolate (best effort).
   - Cache: the same pack is answered once and kept in KV for 7 days (`CACHE_TTL`).
8. **Verification (`verify.js`).** Every sentence is checked before it shows: it must cite at least one existing note; every figure must appear in a note or the question; every catalogue place named must be in the notes; comparisons and verdicts ("cheaper", "best") must cite a code-written comparison note; an estimate keeps its "~"; dashes are stripped and `<think>` blocks removed. A failing sentence is dropped.
8b. **Answer and cards agree (`agree.js`, T1101, ROADMAP E6).** `writeAnswer` gets the cards on screen (the first `SHOWN_PLACES` = 3 picks) and drops a sentence that names a catalogue place without a visible card, puts a figure beside a place that no cited note about that place (or about no one place) carries, or names a month that no cited note or the question names. Where the answer ranks places (types find, budget, when, plan, near; `RANKED`) the text must name them in the cards' order, or the written answer is withdrawn; a comparison keeps the order the traveller asked. Dropped sentences count toward the `WITHDRAW` rule. Test: `tests/askAgree.test.mjs` (20 questions with recorded model answers).
9. **Withdrawal rule.** If more than `WITHDRAW` = 0.3 (30 percent) of sentences fail, or none pass, the whole written answer is withdrawn and only the facts answer stays.
10. **On-device option (`onDevice.js`).** Opt in only, stored at `carta.ask.onDevice.v1`. Needs WebGPU with shader-f16 and 4 GB memory when known. Default model Qwen 2.5 1.5B (`Qwen2.5-1.5B-Instruct-q4f16_1-MLC`, about 845 MB); alternative Gemma 2 2B (about 1429 MB). Runs WebLLM 0.2.85 in a Web Worker, loaded only after a click. Files come from Carta's data host (`DEFAULT_MODEL_BASE`). Private, no quota, works offline once cached.
11. **Chats.** `sessions.js` keeps chats in `carta.ask.chats.v1`: at most `MAX_CHATS` = 30 chats and `MAX_TURNS` = 40 turns each, title up to 60 characters. Reopening a chat redraws facts from the catalogue without asking the model again. Signed in, chats sync to the `ask_chats` table (`src/auth/askChatCloud.js`), and the first sign-in merges the device's chats.

**Data behind it.** Pipeline task `ask_index` (`pipeline/ask_index_layer.py`, tier Manual, about a minute) writes `public/search/ask/`: `manifest.json`, `passages-<src>.json` (text 1 to 3 sentences, at most 300 characters), `vectors-<src>.i8` and `.b1`, and the pruned model under `model/`. Then `continent-app/scripts/build-ask-bm25.mjs` writes `bm25.json`. Supabase table `ask_chats` (migration `054_ask_chats.sql`). Freshness: rebuilt by hand after an ingest or dossier build.

**Where it lives.** App: `continent-app/src/browse/ask/` (AskChat.jsx, AskTurn.jsx, AskTripCard.jsx, askChatStore.js), `continent-app/src/lib/ask/`. Backend: `continent-app/functions/api/ask.js`, `continent-app/functions/api/ask/answer.js`, `continent-app/functions/_lib/askEmbed.js`, `askScore.js`, `askTerms.js`. Pipeline: `pipeline/ask_index_layer.py`. Docs: `docs/SCHEMA.md` ("Ask Carta search wires").

**Limits.**
- The index (about 50 MB) is not in git and must be rebuilt in the main checkout before a build (T551-a).
- Dense retrieval alone is modest (recall@10 0.44), which is why relevance weighs only 0.1 (T554-a).
- `/api/ask/answer` accepts notes as text, so within the daily cap anyone could use it as a free model (T556-b).
- 4,331 trails have no destination within 25 km, so a place filter drops them (T551-f).
- Five held-out questions still miss, for example "two week" read as 7 days (T550-a).
- The CSP gained `'wasm-unsafe-eval'` for WebLLM and awaits owner review (T557-b).

### Sign-in and account

**What it does.** A traveller can create an account with email and password or continue with Google. The account keeps trips, preferences, Ask chats and day plans across devices. The Account panel also holds the plan (Pass), travel preferences, AI allowance, FAQ, feedback, email preferences, data export and account deletion.

**How it works.**
- Auth is Supabase (`AuthContext.jsx`): `signUp`, `signInWithPassword`, `signInWithOAuth({ provider: 'google' })`, `resetPasswordForEmail`. When Supabase env vars are missing, auth is inert and the app runs signed out.
- Passwords need at least `MIN_PASSWORD_LENGTH` = 8 characters plus the rules in `lib/passwordStrength.js`. A Google-only account is never asked for a current password (`hasPasswordIdentity`).
- Changing sensitive details re-checks the current password with `signInWithPassword`.
- Preferences (filters, lifestyle, favourites, visited countries, saved lists, taste) sync through `hooks/useAccountSync.js`: pulled once after login, pushed back debounced, stored in `user_settings.settings`.
- Accounts that keep your work (T1104, ROADMAP I5): kept trips (`carta.keptTrips.v1`), bookmarked Carta trips (`carta.savedJourneys.v1`), trips in progress (`carta.trips.v1`) and the device trip (`carta.deviceTrip.v1`) sync through `auth/accountSync.js` to table `account_things` (migration 065), one row per thing with `deleted_at` as a tombstone. `AuthContext` loads the module only once someone is signed in and calls `bindAccountSync`: one sync at sign-in, then again 2 seconds (`DEBOUNCE_MS`) after a local change and when the tab comes back into view. The merge rule, per thing: on this device only and never synced, moved to the account; in the account only, brought here; on both and different, the newer change wins (the thing's own time, `keptAt`, `updatedAt` or `savedAt`; a change without its own time counts as now); removed here since the last sync, a tombstone, unless the account copy changed later; a tombstone over a copy this device changed later loses. A signed-out device's work is added to the account, never replaced. The trip open in the planner is never overwritten (the newer copy arrives once another trip is open), and the one device trip slot keeps its own trip (an empty slot takes the account's newest). The state `carta.accountSync.v1` remembers which account the device last synced with: signing in as another account removes the previous account's things from the device (the open trip's planner keys too) and does not copy them into the new one, while work made signed out since moves to the new one. Without the table (PGRST205, 42P01) or after 3 failures in a row (`MAX_FAILURES`) the sync turns off for the visit and the things stay on the device. Each sync dispatches `carta:account-sync` with `{ moved, movedByKind, pulled, pushed, removed, dropped }`. Data export adds the rows as `accountThings` (tombstones left out).
- Data export calls the `export_user_data` RPC; deletion calls `delete_user`, which cascades through what the account owns.
- Sign out asks first whether this device's copy of the traveller's things goes too (T1054, audit P-09): "Sign out and remove", "Sign out, keep them here" or Cancel. Remove clears every key the cookies page lists under "your things" (trips, drafts, day plans, bookings, lists, crew, Ask chats) from local and session storage, deletes the `carta-files` database and reloads; settings and one-off notes stay. The list is `DEVICE_THING_KEYS` in `lib/deviceData.js`, tied to the cookies page by `tests/deviceData.test.mjs`. It asks rather than always clearing because device trips (`carta.trips.v1`) are not all in the account.
- Opt-in emails (trip reminders, price drops on saved places) are off by default and stored in `email_prefs`; the `notify` Edge Function sends them through Resend.

**Data behind it.** Supabase `auth.users`, `saved_trips` and `user_settings` (`supabase/schema.sql`), `trip_plans`, `trip_plan_stops`, `day_plans` (migrations 002 to 004), `profiles` (010), `user_achievements` (013), export RPC (024, widened in 048), `email_prefs` (060), `account_things` (065: kinds `kept`, `journey`, `trip`, `device_trip`; owner-only RLS, no anon grant; at most 1000 rows per account and 256 KB per body).

**Where it lives.** `continent-app/src/auth/AuthContext.jsx`, `AuthModal.jsx`, `AuthGate.jsx`, `GoogleButton.jsx`, `ResetPasswordScreen.jsx`, `AccountPanel.jsx`, `continent-app/src/auth/account/`, `continent-app/src/hooks/useAccountSync.js`, `continent-app/src/auth/accountSync.js`, `continent-app/src/auth/accountThingsCloud.js`, `continent-app/src/lib/passwordStrength.js`, `supabase/functions/notify/`. Tests: `continent-app/tests/accountSync.test.mjs` (two devices, one stubbed account); the 065 fixture and section in `scripts/admin/test_rls_policies.mjs`.

**Limits.**
- Google sign-in needs the provider enabled in the Supabase dashboard (code comment in AuthContext.jsx).
- Emails send nothing until the owner sets `RESEND_API_KEY`, `NOTIFY_FROM` and `NOTIFY_SECRET` and deploys `notify` (T944-b), and until 060's cron job is confirmed (T985-a).
- Register row T077-b lists several migrations (021, 022, 024 to 027, 029 to 043) as recorded unapplied, so the live project may not match every migration.
- Account sync needs migration 065 pasted (T1104-a); until then it turns itself off at the first read. A trips list or Plan home already on screen shows pulled trips at its next render: `tripsStore` has no outside change signal, and the open planner is not told when another account's open trip is removed (T1104-c). There is no traveller-facing "3 trips moved" notice yet, only the event (T1104-d).

### My trips (saving and storage)

**What it does.** My trips lists every trip a traveller has started or kept: trips planned in Plan, trips kept from the trip finder, saved places and lists, shared lists and past trips. Without an account, trips stay in the browser. With an account, saved trips live in the database and open on any device.

**How it works.**
- Trips in progress on this device: `planner/tripsStore.js`, key `carta.trips.v1`, record `{ v: 1, activeId, trips: [...] }`. Each entry snapshots the planner keys (`carta.plannerDraft.v1`, `carta.tripDraft.v1`, day plan sidecars). Guests included.
- "Save trip" without an account: one trip in `carta.deviceTrip.v1` (`planner/deviceTripStore.js`). A second device trip opens the `save` paywall gate. A private window or full store says the trip was not kept.
- "Save trip" with an account (`planner/TripPlannerTab.jsx` `handleSave`): a free traveller keeps one account trip; a second new trip opens the `save` gate. Saving over an existing trip is never gated.
- Account trips: `auth/tripPlanStorage.js` reads `trip_plans` without a user filter; row level security decides what is visible, including co-planned trips (flagged `coplan`).
- Trips kept from the trip finder: `lib/recommend/keptStore.js`, key `carta.keptTrips.v1`. Signed in, kept trips, bookmarked Carta trips, trips in progress and the device trip follow the account (`auth/accountSync.js`, table `account_things`, see Sign-in and account).
- Day plans sync between device and account (`auth/dayPlanCloud.js`, table `day_plans`).

**Data behind it.** `trip_plans`, `trip_plan_stops`, `day_plans` (migrations 002 to 004, 008), `saved_trips` and `user_settings` (`supabase/schema.sql`), `shared_lists`, `shared_list_members`, `shared_list_items`, `shared_list_votes` (059). Device keys listed above.

**Where it lives.** `continent-app/src/auth/mytrips/` (MyTripsTabs.jsx, TripCards.jsx, KeptTrips.jsx, SavedTab.jsx, SharedList.jsx, YourEurope.jsx, YearRecap.jsx), `continent-app/src/auth/SavedTripsPanel.jsx`, `continent-app/src/auth/tripStorage.js`, `continent-app/src/auth/tripPlanStorage.js`, `continent-app/src/planner/tripsStore.js`, `continent-app/src/planner/deviceTripStore.js`.

**Limits.** Signed out, trips kept from the trip finder stay on the device only; signed in they sync once migration 065 is live (T1104). The paywall's device gates can be bypassed with devtools by design (usePaywall.jsx comment). Not found in code: any server-side cap on the number of account trips.

### Together, sharing and collaborative trips

**What it does.** Travellers can share a trip by link, invite friends to plan a trip with them, see what friends choose to show, ask to join a friend's trip, decide a group trip by voting on dates and places, share saved lists, and split costs. The Together page gathers all of this and counts only what waits on you.

**How it works.**
- **Share by link, no backend:** `lib/shareLink.js` puts the whole draft in the URL hash (JSON, deflate, base64url). No expiry, nothing uploaded.
- **Revocable share of a saved trip:** `trip_shares` (009) holds a token, read through an RPC that decides what leaves the account; optional `expires_at`.
- **Profiles and friends:** a handle matching `^[a-z0-9_]{3,24}$` (010) is the only lookup; exact handle only, no email search, no listing. Friend lists are private (011). Cross-table checks go through one security definer function, `friend_link_status`.
- **Co-planners (020):** share the itinerary (name, stops, dates, nights, transport) but not the day plan, expenses, bookings, notes or photos. A co-planner may edit the route but not delete, publish or change visibility.
- **Invite by link (052):** a 64-character random token that expires after 7 days; whoever opens it signed in becomes a co-planner and a friend of the owner.
- **Friends see (056):** one switch per kind. Defaults (`DEFAULT_VISIBILITY`): countries on, saves off, tips on, meet on. Trips are shown one by one (`trip_plans.visibility = 'friends'`).
- **Ask to join (057):** a yes adds the friend as a co-planner through `trip_collaborators`.
- **Group trips (055):** members vote on date options and place options, one vote each. Each member may set a private maximum for the whole trip (`max_trip`, 1 to 99999 euros). The shared band ("what fits everyone") shows only once at least 3 members have set one, rounded down to 10 euros, so no single maximum can be inferred.
- **Settle up (058):** members log what they paid; `src/together/settle.js` works out the fewest transfers in the browser. Payment happens outside Carta (Tikkie, bunq.me, Revolut link); Carta never moves money.
- **Shared saved lists (059):** owner shares a list with accepted friends; members add items, write notes and vote once per item.
- **Public guides (019):** an author can publish a trip as a public guide under their handle. Nobody can list accounts or browse people.
- Planning together and a second share link are free (usePaywall.jsx comment, T488-b).
- **Who sees what is tested:** every table above has an isolation fixture in `continent-app/scripts/admin/test_rls_policies.mjs` (`rls-policies.yml`): a stranger and a signed-out visitor read, change, delete and forge nothing, an accepted friend reads the sharing switches, a joined co-member reads the group's options, votes and ledger but never another member's maximum, and a list member reads the list (T1078). The group and list policies ask one helper each, `group_role` and `shared_list_role`; since 063 `anon` may execute both (they answer null without a signed-in caller), so a signed-out read returns no rows instead of a permission error, and `group_all_joined` answers false unless the caller is the owner or a joined member of that group.

**Data behind it.** Migrations 009, 010, 011, 012, 019, 020, 023, 046, 052, 055 to 059 and 063 (055 to 059 and 063 have down migrations). 052 to 060 were applied live by T985; 063 is written, not applied (T1078-a).

**Where it lives.** `continent-app/src/together/` (TogetherPage.jsx, useTogether.js, GroupTrips.jsx, SettleUp.jsx, AskJoin.jsx, Privacy.jsx, settle.js, overlaps.js), `continent-app/src/auth/` (friends.js, coplanners.js, groupTrips.js, joinRequests.js, groupExpenses.js, sharedLists.js, tripShares.js, friendVisibility.js, profiles.js, SharedTripView.jsx, TripSharePanel.jsx), `continent-app/src/lib/shareLink.js`.

**Limits.**
- Shared day planning is not built; co-planners get the itinerary only (020 comment).
- Together emails are not queued until 060's cron job is confirmed (T985-a).
- `friendsMock.js` provides a mock mode (`IS_FRIENDS_MOCK`) for previews. Not found in code: a cap on group size.

### The Pass, paywall and Stripe checkout

**What it does.** Most of Carta is free. A Pass unlocks exports (PDFs, calendar and map files), imports, more than one saved trip, and more AI day plans with live (grounded) search. There are two paid options: a one-off Trip Pass and a yearly plan that renews until cancelled.

**How it works.**
- **Tiers** (`public.plan_tiers`, mirrored for display in `src/lib/pricing.js` `TIERS`):

  | Tier | Price | AI plans | Grounded searches | Period |
  |---|---|---|---|---|
  | free | 0 | 2, once for the life of the account (migration 021) | 0 | never refills |
  | trip | 699 cents (EUR 6.99), one-off | 60 | 40 | 60 days (migration 053) |
  | year | 1499 cents (EUR 14.99), renews yearly | 300 | 120 | 365 days |

- Server is the authority: quotas are enforced by the `ai_consume` RPC (`supabase/functions/_shared/passes.mjs` `consume`); a failed AI call refunds the unit (`refund`). The plan-day function also has a shared daily ceiling, `AI_GLOBAL_DAILY_CAP` (default 200). Refusals are logged to `ai_cap_events` without a user id.
- **usePaywall** (`hooks/usePaywall.jsx`) is the one client gate. Hard gates (always open the Pass panel): `export`, `exportCal`, `exportMap`, `import`, `save`, `plans`, `ground`, `browse`. Soft gates (offers): `plansLow`, `expiring`, shown at most once a session (`carta.paywall.softShown.v1`), snoozed 30 days per reason (`SNOOZE_DAYS`), never for a payer.
- **Checkout** (`supabase/functions/checkout/index.ts`): the browser sends only a tier id; the amount comes from the Stripe Price named by `STRIPE_PRICE_TRIP` or `STRIPE_PRICE_YEAR`. Trip Pass uses mode `payment`, the yearly plan mode `subscription` (`checkoutModeFor`). `automatic_tax` is on. Before opening a session, `pass_can_buy` refuses a purchase that would not extend the pass, and refuses a second yearly plan (reason `subscribed`).
- **Withdrawal waiver:** Stripe shows a required checkbox with Carta's text (`waiverText`): the buyer asks for immediate start and accepts losing the 14-day EU right of withdrawal. This only runs when `CHECKOUT_TERMS_URL` is set.
- **Webhook** (`stripe-webhook`): grants a pass through `grant_pass`; for the yearly plan, every paid invoice with `billing_reason` `subscription_create` or `subscription_cycle` grants a year, keyed on the invoice id so replays do nothing (`grantFromInvoice`). Subscription state goes to `entitlements` via `set_subscription_state`. The `billing` function and Stripe's Customer Portal handle cancelling.
- The gate reason (letters only, up to 32) rides in session metadata for the paywall funnel.

**Data behind it.** `plan_tiers`, `entitlements`, `pass_grants`, `ai_usage` (007), free tier once (021), `paywall_events` (022, 027), withdrawal waiver (025), OSS threshold (026), payments quota (044), subscriptions (053).

**Where it lives.** App: `continent-app/src/pass/PricingPage.jsx`, `continent-app/src/components/PassModal.jsx`, `continent-app/src/hooks/usePaywall.jsx`, `continent-app/src/hooks/useEntitlement.js`, `continent-app/src/lib/pricing.js`, `continent-app/src/lib/billing.js`, `continent-app/src/lib/passMoments.js`. Backend: `supabase/functions/checkout/`, `supabase/functions/stripe-webhook/`, `supabase/functions/billing/`, `supabase/functions/_shared/passes.mjs`. Docs: `archive/docs-2026-11/REFUND_SOP.md`, `Execution/P2/_OPEN-stripe-launch.md`, `Execution/P11/_OPEN-pass-subscription.md`.

**Limits.**
- Stripe is not live: Prices, secrets, the Terms URL, the webhook deploy and a real test purchase are open owner steps (T030-a, T030-b, T032-a, T032-c), and 044 must be pasted before the function deploys (T265-a).
- Migration 022 (paywall events) was never applied, so the funnel cannot run live (T034-a).
- Checkout from an installed home-screen app is untested on real phones (T246-c).
- Client gates are bypassable by design; only AI spend is enforced server side.

### Languages

**What it does.** The interface is available in English, Dutch, German, French, Spanish and Italian. A traveller picks a language once and Carta remembers it. Place names stay in their original language so they match street signs and maps.

**How it works.**
- `src/i18n/index.jsx`: flat key to string catalogs with `{var}` interpolation. English is the source of truth. A missing key falls back to English, then to the key itself.
- First visit is always English (browser language is not matched). The choice is stored at `continent.lang.v1`.
- Non-English catalogs load lazily per language. English is split at build time (`scripts/i18n/enSplit.mjs`) into keys the first paint needs and a lazy rest chunk; `check-en-split.mjs` checks the split.
- What is not translated: POI names, pipeline descriptions, taglines and guides (English editorial data), and city or country names (used as data keys).
- Dash stripping: `stripDashes` in `src/lib/format.js` turns em and en dashes into "to" between money figures, a hyphen in number ranges and tight word joins, and a comma in prose. It is used in 17 source files, and Ask Carta's verifier applies it to model text. The pipeline's Ask index removes them too (`_DASH` in ask_index_layer.py).
- Ask Carta's model prompt names the answer language (`LANG_NAME` in context.js).

**Data behind it.** `src/i18n/en.js` (about 10,100 lines) and five catalogs of about 9,500 lines each. No pipeline input.

**Where it lives.** `continent-app/src/i18n/`, `continent-app/scripts/i18n/`, `continent-app/src/lib/format.js`. Docs: `archive/docs-2026-11/SEO.md` (hreflang across six languages).

**Limits.** The five non-English catalogs are about 600 lines shorter than en.js, so some strings fall back to English. Not found in code: an automated key parity test across all six catalogs.

### Admin panel, moderation and telemetry

**What it does.** The owner has a full-page back office to see accounts, change live site config, review feedback, handle reports on public guides, follow AI usage, model fallbacks, cache hit rate, margins, launch counts, pipeline health and edge errors. Travellers can report a public guide and contest a moderation decision.

**How it works.**
- **Access:** membership is in `public.admin_users`, which has RLS on and no policies, so only a hand-run INSERT in the SQL editor makes an admin (014). Every admin function re-checks `is_admin()`. The client hook `useIsAdmin` is a hint only.
- **Rate guard:** `admin_guard` (015, 051) caps overall admin calls at 60 a minute, a `live` tier at 20 config, override or feedback saves in 60 seconds, and destructive actions at 10.
- **MFA:** every admin RPC requires an `aal2` session, meaning a verified TOTP factor: `admin_guard` checks membership, then `auth.jwt() ->> 'aal'` (a missing claim counts as not `aal2`), then the rate budget, and answers `mfa_required` (062, T1071; before 062 only delete, ban and set tier asked, 032, 045, 051). A non-admin still hears `forbidden`. The admin page shows the step-up box (`MfaStepUp`, `useMfa`) right after the password lock and loads nothing until the session is `aal2`. The admin read policy on the upload bucket needs `aal2` too.
- **Audit log:** `admin_audit_log` is who (`actor`), `action`, `target` (`user:<id>`, `config:<key>`, `override:<layer>/<item>`, `plan:<id>`, `report:<id>`, `statement:<id>`, `upload:<id>`, `feedback:<id>`, `infra:<month>/<item>`), `reason` and at (`created_at`), plus `target_user`, `detail`, `ip`, `agent`; no foreign keys, so the trail survives deletions; rollback support in 033. A trigger (`audit_log_fill`, 062) fills target and reason from the detail. Every state-changing (VOLATILE) admin RPC writes a row (`admin_set_infra_cost` since 062); reads write none, because the rate budget counts audit rows. A refusal at the guard writes no row either.
- **Reasons for account actions (064, T1081):** suspending, deleting and changing a pass take a required `p_reason` (3 to 500 characters after trimming); anything shorter answers `reason_required` before the account is read, and the reason lands in `admin_audit_log.reason`. The user detail screen asks for it beside Apply, Suspend and Delete and keeps each button off until it is long enough. The app and 064 go live together: in between, these three actions answer PGRST202 and change nothing.
- **Moderation (DSA):** anyone can report a public guide (`report_guide`, 037). A takedown writes a statement of reasons (039). The owner sees it in Saved trips and may contest once per statement within six months, free (`contest_moderation_decision`, `src/auth/moderation.js`).
- **Launch counters (048):** `src/lib/launchEvents.js` sends three ticks only: `trip_priced`, `affiliate_click`, `ai_call`. Per-day counts, no device id, session id, page path or time of day, so no consent banner. Repeats within `DEDUPE_MS` = 1500 ms count once. Fire and forget.
- **Channel counts (K12, T1109, pending migration):** `src/lib/channelCounts.js` reads only `utm_source` and `utm_medium` on landing and sends one `channel_visit(p_channel, p_medium)` tick per page load, from `main.jsx`. Channel = lower-cased `[a-z0-9_-]`, 32 characters at most, or `none`; medium is one of email, social, paid, referral, organic, other, none. **Counted:** visits per channel per day. **Not counted or stored:** utm_campaign, utm_content, utm_term, the referrer, the URL or path, any cookie, localStorage or sessionStorage value, any device, session or account id, IP, time of day. A reload counts again (over-count by design, nothing remembers a visitor). Server: per-day table `channel_counts` with ceilings of 500 keys and 100,000 ticks per day, no client grants; reader `admin_channel_weekly(p_weeks)` (Monday weeks) feeds the `ChannelCounts` card on the admin Overview. SQL is in `supabase/migrations/067_channel_counts.sql` until the orchestrator numbers it.
- **Edge error logging (040):** `log_edge_error` records failures of `plan-day`, `suggest-city` and `parse-booking` with a closed list of codes (`ai_timeout`, `ai_bad_output`, `url_unreachable`, `ai_error`), origin `edge` or `client`, and HTTP status. No model output or free text. Caps: 100 a day per account, 50,000 a day overall. Chosen over Sentry to keep data first party.
- **Other telemetry:** paywall events (022), model fallback events (028), cache hit instrumentation (029), AI usage rollup (030), margin dashboard (031), pipeline health (041), parse failures (042).

**Data behind it.** Migrations 014 to 018, 022, 028 to 043, 045, 048, 051, 062, 064. Tables include `admin_users`, `admin_audit_log`, `site_config`, `content_overrides`, `content_reports`, `moderation_statements`, `launch_counts`, `edge_errors`, `edge_error_daily_total`, `ai_model_events`, `ai_cap_events`.

**Where it lives.** `continent-app/src/admin/AdminPage.jsx`, `continent-app/src/components/admin/` (Overview, UsersList, UserDetail, ConfigManager, AuditLog, ContentReports, ModerationComplaints, FeedbackInbox, AiUsage, AiModelFallbacks, CacheHitRate, Margin, LaunchMetrics, EdgeErrors, PipelineHealth, PaywallFunnel, PriceProvenance), `continent-app/src/auth/admin.js`, `continent-app/src/auth/moderation.js`, `continent-app/src/lib/launchEvents.js`, `continent-app/src/planner/edgeFailure.js`, `continent-app/src/hooks/useIsAdmin.js`. Docs: `archive/docs-2026-11/LAUNCH-METRICS.md`, `archive/docs-2026-11/INCIDENT_RUNBOOK.md`.

**Limits.**
- Several admin migrations are recorded as unapplied: 022, 027, 029, 031 and others (T034-a, T039-d, T043-a, T077-b); their cards show nothing until pasted. Whether 041 is live is unconfirmed (T235-h).
- `prune_paywall_events` (180 days) is called by nothing (T319-b).
- 062 (MFA on every admin RPC, audit target and reason) is not applied live until the owner enrols a TOTP factor and pastes it (`Execution/P15/_OPEN-auth-settings.md`). 064 (reasons for ban, delete and set tier) is written, not applied (T1081-a); until then those three rows carry no reason.
- Ask Carta failures are not written to `edge_errors` (the table only accepts the three Supabase functions).

### Photo and track uploads

**What it does.** A signed-in walker shares a photo or a GPX track of a trail from the trail page ("Add a photo or track"), under a licence they pick (Carta only, CC BY 4.0, CC BY-SA 4.0), with a credit and, for a track, an OpenStreetMap yes or no. Nothing is public until a person publishes it.

**How it works.**
- **On the device (T333):** `lib/stripImageMeta.js` drops a photo's EXIF, XMP, IPTC and trailers and the form re-encodes it at most 2,560 px; `lib/gpxPrivacy.js` keeps a track's geometry only and hides every point within `PRIVACY_RADIUS_M` (500 m) plus up to `PRIVACY_JITTER_M` (250 m) of its start and end.
- **Send (`community/uploads.js` `submitUpload`):** `begin_upload` checks the target, licence, credit (2 to 80 characters), the Terms version (`UPLOAD_TERMS_VERSION`, `v_terms` in 061), the OSM tick version and the size (photo 25 MB, track 10 MB), holds 20 reservations a day per account (2,000 overall) under an advisory lock, writes a `reserved` row and answers `{ id, path }` with path `{uid}/{id}.jpg|.gpx`. The file goes into the private bucket `user-uploads` at that path; `finish_upload` checks the file exists with an allowed type and size and sets the row `pending`.
- **Storage policies (061):** insert only into your own folder and only at one of your own reserved paths; read for the owner and an admin, and for anyone once the row is `published`; no update or delete from a client.
- **Server privacy pass:** the `upload-scan` Edge Function (every 15 minutes through pg_cron) re-runs both modules on each pending upload (copies in `supabase/functions/_shared`, kept byte-identical by `tests/uploadScan.test.mjs`). A photo with metadata left is stripped and rewritten, a track is trimmed again and rewritten, an unreadable file is removed. `admin_decide_upload` will not publish an upload the pass has not cleared.
- **Review:** `admin_list_uploads` is the queue; `admin_decide_upload(id, action, ground, statement)` publishes, declines or removes behind `admin_guard('live')`. A decline or removal needs a ground (`illegal` or `terms`) and a statement of reasons (10 to 2,000 characters), sets a six-month contest date, answers open notices on the upload and writes one audit row.
- **Notices:** `report_content('upload', id, ...)` takes a notice on a published upload with `report_guide`'s validation and shared rate limits; `content_reports` carries `target_kind` and `target_id`. Guide reports still go through `report_guide`; the admin Reports tab lists guide reports only.
- **Removal:** `remove_my_upload` withdraws an upload on request. Deleting an account queues its `{uid}/` folder; reserved rows without a finish are swept after a day; declined and removed files go after their contest date. The queue (`upload_purge_queue`) is emptied through the Storage API by `upload-scan`.

**Data behind it.** Migration 061: `user_uploads`, `upload_purge_queue`, bucket `user-uploads`, columns `target_kind`, `target_id` on `content_reports`.

**Where it lives.** `continent-app/src/community/uploads.js`, `continent-app/src/community/UploadForm.jsx`, `continent-app/src/lib/stripImageMeta.js`, `continent-app/src/lib/gpxPrivacy.js`, `supabase/migrations/061_user_uploads.sql`, `supabase/functions/upload-scan/`. Latest report: `Execution/P15/T1070-upload-migration.md`.

**Limits.**
- 061 and `upload-scan` are not applied or deployed until the owner does it (`Execution/P15/_OPEN-uploads.md`); until then a send answers "did not send, nothing was stored".
- Published uploads are not shown on pages yet and the admin page has no review list (T333-c); `list_published_uploads` and `admin_list_uploads` are ready for it.
- Only the trail page has the door (T333-d). The legal wording waits on the J4 review (T333-b).

### The data wire (pipeline to app)

**What it does.** The Python pipeline writes one master dataset. The wire step splits it into small files the app loads fast: a boot index first, then one file per country, then heavy details only when a screen needs them. A contract check stops a build if the data shape drifts.

**How it works.**
1. The pipeline writes `app_data/app_data.json` (master). Layers raise `meta.schema_version` with `max(...)`; the live contract is 19 (`EXPECTED_SCHEMA_VERSION` = 19 in `continent-app/scripts/ci/contract.mjs`, and `docs/SCHEMA.md`).
2. `continent-app/scripts/sync-data.mjs` runs on `predev` and `prebuild`. It writes `public/app_data.json` (core, without `activities.items_full` and `image.hires`; input to the contract check only), `public/boot.json` (boot index), `public/dest/{cc}.json` (one per country), `public/dest/_rank.json` (fields the default screens rank and price on), `public/poi/{destId}.json` (one town's full POI list), and copies `country_insights.json`. If the master is missing it warns and keeps what is in `public/`.
3. Boot index shape (`src/lib/bootIndex.js`): `{ v: 1, meta, top, cols, d: [[id, lat, lon, cc, f, r]], chunks, tiles }`, with flags as a bitfield and `r` the rating band. Split and merge share this one file so they cannot drift.
4. In the browser, `src/lib/appData.js` starts the boot download at module load, then country shards (all at once or by viewport), with `_rank.json` for first paint. POIs and country insights load lazily.
5. `src/lib/dataHost.js`: `VITE_DATA_BASE` decides where shards come from. In production it is `https://data.carta-europetravel.com/data` (R2). The `R2_TIER` list (dest, poi, reach, region, destinfo, dossier, beaches, lakes, mountains, trails, cycling, trips, journeys, search, stays, stays-live and some root files) is the single source for both the app and the build.
6. Contract check (`scripts/ci/check-contract.mjs`): the real `public/app_data.json` must pass, a minimal fixture must pass, and every seeded break (schema bump, dropped meta, string coordinates, empty catalogue, reserved filename escape) must be rejected. It also checks the documented key table in `docs/SCHEMA.md`.

**Data behind it.** `app_data/app_data.json`, `public/boot.json`, `public/dest/`, `public/poi/`, plus every layer folder in `R2_TIER`. Freshness follows the pipeline runs (weekly on the build box, or by hand).

**Where it lives.** `run_pipeline.py`, `pipeline/pipeline_io.py`, `pipeline/joins/`, `continent-app/scripts/sync-data.mjs`, `continent-app/src/lib/bootIndex.js`, `continent-app/src/lib/appData.js`, `continent-app/src/lib/dataHost.js`, `continent-app/scripts/ci/check-contract.mjs`, `continent-app/scripts/ci/contract.mjs`. Docs: `docs/SCHEMA.md`, `archive/docs-2026-11/PIPELINE.md`, `archive/docs-2026-11/JOINS.md`.

**Limits.** `pipeline/schema.py`, named in CLAUDE.md as holding the contract, was not found in code; the version lives in each layer's writer, `contract.mjs` and `docs/SCHEMA.md`. Pin tiles are deferred (dataHost.js comment).

**Freshness and stamps (T1099, D12).** Every wire carries the moment its writer ran: `generated_at` (`meta.generated_at` in `app_data.json`, `computed_at` in `reach/<ORIGIN>.json`, `built` in `search/ask/manifest.json`). A writer reads the clock (`datetime.now`, `time.gmtime` or `pipeline/wire_stamp.py` `build_stamp()`), never a literal. `apply_rating_layer.py` now stamps `app_data.json` and the served copy on each run (the stamp was 2026-06-07 on a build that carried schema 19). `python -I scripts/freshness_report.py [--out freshness_wires.json] [--strict]` lists per wire the built-at stamp, the source date where the file records one (trips: `harvested_at`), the age in days and whether it is over its cadence (`WIRES` in the script: 35 days for the monthly wires, 45 for the layers, 90 for reach; the owner tunes them). A missing, unparseable or constant stamp (date only, or a known placeholder) is a problem row; `--strict` exits 1 on any problem or over-cadence wire. `tests/test_wire_stamps.py` fails when a writer has a literal stamp or never reads the clock, and when the report misses a missing or constant stamp. The H9 schedule and the R2 push of `freshness_wires.json` are owner steps (`Execution/P15/T1099-freshness.md`).

### Deploy (Cloudflare Pages, R2, prerender, SEO)

**What it does.** The app shell is served by Cloudflare Pages, the data files by Cloudflare R2 behind `data.carta-europetravel.com`, and about 32,000 prerendered pages for search engines from a private R2 bucket. A deploy happens only when the owner asks.

**How it works.**
1. `npm run build:pages` (`scripts/build-pages.mjs`): builds with `VITE_DATA_BASE` set, `stage-data.mjs` moves shards from `dist/` to `dist-data/`, writes `404.html` (a copy of `index.html`, so unknown paths return a real 404), then `check-pages-limits.mjs` enforces 20,000 files per site and 25 MiB per file.
2. `node scripts/css-routes.mjs --check dist/assets` checks per-route CSS.
3. `node scripts/r2/push-data.mjs --live`: phase 1, `rclone copy`, adds and replaces, deletes nothing, so the old site keeps working.
4. `npx wrangler pages deploy dist --project-name carta-app --branch preview` (the only preview origin the data host's CORS admits), then `--branch main` for production.
5. `push-data.mjs --live --prune`: phase 2, `rclone sync`, removes stale objects after production is live. It refuses to prune from an empty listing and never prunes prefixes other writers own, such as `data/flights/` (T1042), or the owner's top-level files `status.json` (the outage line the app reads on every boot), `.keep` and `_test` (`OWNER_FILES`, T1056). Before the top-level deletes it prints every name it would remove and goes on only after a typed `delete` or `--yes`; with no terminal and no `--yes` (the Hetzner box's unattended run) it stops there, leaves the old objects and exits 1 (T1056).
- Bindings in `continent-app/wrangler.toml`: R2 `PRERENDER` (bucket `carta-prerender`), Workers AI `AI`, KV `ASK`. Compatibility date 2026-09-23.
- **Response headers and API hardening (T1079, C5):** `public/_headers` `/*` sets the CSP (script-src `'self' 'wasm-unsafe-eval'`, no inline script; style-src `'self'` plus two sha256 hashes and no `'unsafe-inline'` since T1090: the app styles from the bundled sheets and through the CSSOM, React style props and MapLibre included, which no style-src governs, and the only two `<style>` blocks it writes, the print view's `PRINT_CSS` in `src/lib/tripExport.js` and the prerender reading column's `STYLE` in `scripts/prerender/html.mjs`, are allowed by hash; `node scripts/csp-hashes.mjs --write` refreshes the hashes, `tests/cspHashes.test.mjs` fails on a stale one or on a `style=""` string, `setAttribute('style')` or new `<style>` in `src/`, and the CI job `csp` runs `scripts/verify_csp.mjs`, which serves the fast build under the real header and fails on any refusal on 20 screens at phone and desktop width), `X-Frame-Options: DENY`, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS two years with preload, `Cross-Origin-Opener-Policy: same-origin-allow-popups` (the print view opens a popup) and a Permissions-Policy that allows only `geolocation=(self)` and denies camera, microphone, payment, usb, bluetooth, serial, hid, accelerometer, gyroscope, magnetometer, display-capture and browsing-topics. `continent-app/tests/securityHeaders.test.mjs` pins all of it, including that connect-src holds no websocket host and every wildcard host is on a reviewed list. Pages Functions validate every query string in `functions/_lib/guard.js` (lat and lon plain decimals; IATA codes and a real date 0 to 330 days ahead; Ask lists bounded), answer 405 with `Allow` to other methods, and refuse with `{"error": code}` only. A per-address limit applies to `/api/flights` (20 a minute, on a cache miss), `/api/forecast` (60), `/api/ask` (60) and `/api/ask/answer` (8); it asks a Workers Rate Limiting binding named `RATE_LIMIT` when the account has one, and always keeps a per-isolate window. Edge Functions are wrapped by `supabase/functions/_shared/http.mjs` `withCors`: only the app origins (production, Pages previews, localhost, plus `ALLOWED_ORIGINS`) get an Allow-Origin, a body is read with a byte cap (4 KB billing, 8 KB checkout, 64 KB notify, 400 KB plan-day and suggest-city, 9 MB parse-booking; 413 beyond) and no response carries a Stripe or database message. The Stripe webhook verifies the signature on the raw body first and grants keyed on the session or invoice id. Owner steps: `Execution/P15/_OPEN-web-hardening.md`.
- **AI guard (T1117, C8):** every model call goes through `supabase/functions/_shared/aiGuard.mjs` (copied to `continent-app/functions/_lib/aiGuard.js` for Ask; `tests/aiGuard.test.mjs` fails when the copies differ). Input: `scanInjection` (16 rule families, folded for accents, look-alike letters, invisible characters, leetspeak and spaced letters) and `scrubData`, which drops the injected sentences of a field. Ask refuses an injected question with `400 unsafe` before any Neurons are booked and withholds an injected note; plan-day scrubs the wish, the refine request, previous stops, named places and the client-sent deck (an injected city is `400 bad_dest`), parse-booking the pasted, fetched and text-file input and the trip stops, all before the cache key and the quota. Data is fenced between per-call `<<<DATA nonce LABEL>>>` markers; `systemRules(nonce)` (with the canary `cg-k7q2-ward`) goes in Gemini `systemInstruction` and the Workers AI system message. Output: `guardPlanOutput` rejects a plan that is not `{summary, stops[]}` and drops a mistyped stop; `repairText` strips URLs, Markdown links, HTML, e-mail addresses and `+`/`00` phone numbers, and empties a field with a prompt leak (a six-word run of the system text), the canary, chat-template tokens or an echoed injection; parse-booking with text-only input clears a link or code not in that text. The Ask stream is released sentence by sentence through `makeStreamGuard` (a severe sentence ends it, `guard: withdrawn` on `event: done`; cut at 2,400 characters; only what was shown is cached, under a key with `GUARD_VERSION`). Cached rows (`ai_plan_cache`, Ask KV) pass the same payload check; an off-schema row is a miss. Limits in `LIMITS` (plan-day prompt 60,000 characters, parse-booking 80,000, model output 64 KB). `meta.guard` on plan-day and parse-booking answers lists what was scrubbed or repaired. Attack set: `evals/injection/attacks.json` (50 attacks with stubbed outputs, plus a benign set); live pass: `continent-app/scripts/ai/redteam_live.mjs` (owner). OWASP LLM map: `docs/security/threat-model.md` section 12.
- **Prerender:** `scripts/prerender/build.mjs` reads the wire and writes one HTML page per indexable path (country, section, dest, cost, days, trail, cycle, tour, beach, lake, mountain, region, trip, journey, receipt) into R2, with a manifest, canonicals and an optional share card. The one Pages Function `functions/[[path]].js` serves them for routes in `public/_routes.json`, keeps the shell's CSP and security headers, refuses to serve without a CSP, and falls through to the static app on any miss.
- **SEO:** titles, descriptions, JSON-LD, canonicals, hreflang across six languages and sitemaps are set out in `archive/docs-2026-11/SEO.md`.
- **Indexable and the quality bar (T1076, K2):** every prerendered page carries a canonical. A page is indexable only when it clears two gates. The page floor (`prerender/floor.mjs`: title, coordinates, a licensed image, three facts) and the quality bar (`prerender/quality.mjs`, from the research file's "Page quality gate"). The bar for a **place**: a licensed photo, an intro of at least 120 words (`PLACE_MIN_WORDS`), a bed price and a food price, twelve months of climate, a rating, and at least five internal links (`PLACE_MIN_LINKS`). The bar for a **trail**: a licensed photo, at least 60 words of prose (`TRAIL_MIN_WORDS`), length, climb, difficulty, a bounding box for the map, a destination page that links to it, and a season. A page below either gate is still written, with `<meta name="robots" content="noindex,follow">` (and the Pages Function adds `x-robots-tag: noindex, follow`), and stays out of the sitemap. T1113 adds the bars for the other kinds. A **beach, lake or mountain**: a licensed photo, 60 words of page prose (`LAYER_MIN_WORDS`), the layer's seasonal or measured fact (beach: bathing water class; lake: swim season or swimming; mountain: snow-free season; the wire has no twelve-month series for them), a parent place (the Nearest town fact, which links to a destination page), a Carta score and three internal links (`LAYER_MIN_LINKS`). A **cycling route**: a licensed wire photo, 60 words, distance, climb, a score and three links. A **trip**: at least one stop that links to a destination page, a cost per day, a season and four internal links. **Near-duplicate trips**: trips of one country that visit the same set of towns (any nights, pace or order) share one page, the best scored then the shortest id, and the others carry its canonical (`canonicalTrips`); they are not also noindex and the sitemap skips them as `canonical is another page`. Cost pages keep the floor alone. **Trail pages** now carry an "About this walk" paragraph written only from the measured fields the row has, and a "Places to stay near it" list of the destination pages whose dossier links the trail (`trailAbout`, `placesOfTrail`); the bar and the sitemap are unchanged for trails. There is no wire key: `indexable` and the per-test `bar` result live in `_manifest.json`, so a page promotes itself on the next prerender when its data clears the bar. Today no trail passes because the wire image has no licence field; `bar_headroom.trail.okIfPhotoLicensed` in the manifest says how many would pass with one.
- **Sitemaps:** `/sitemap.xml` is an index over one file per page type (site, countries and other hubs, destinations, costs, trails, cycling, beaches, lakes, mountains, trips, journeys), so Search Console reports indexation per type. Only indexable, self-canonical pages are listed; `_sitemap.json` counts what was left out and why (`below the page floor`, `below the quality bar`, `noindex`). Hubs (countries, section lists, NUTS2 regions, trip-length pages) are always indexed. Weekly Search Console review and the 30 percent pause rule: `Execution/P15/_OPEN-search-console.md`.

**Data behind it.** `dist/` (app shell), `dist-data/` (R2 data), `dist-prerender/` (about 32,000 files, deleted after upload).

**Where it lives.** `continent-app/scripts/build-pages.mjs`, `continent-app/scripts/r2/` (stage-data.mjs, push-data.mjs, verify-data.mjs, data-cors.json), `continent-app/scripts/prerender/`, `continent-app/functions/[[path]].js`, `continent-app/wrangler.toml`, `continent-app/public/_headers`, `continent-app/public/_routes.json`. Docs: `archive/docs-2026-11/SEO.md`, `archive/docs-2026-11/BACKUP.md`.

**Limits.** The full build needs about 1.3 GB free disk (CLAUDE.md). Per-deploy hash URLs cannot read R2 because of CORS (build-pages.mjs comment). Ask Carta's index is not in git and must exist before the build (T551-a).

### The build box (Hetzner scheduled runs)

**What it does.** A small always-on Linux server runs the pipeline every week, rebuilds the wire, pushes data to R2 and can deploy the site itself. It also runs the late flight sweep. Heavy jobs go to short-lived larger servers.

**How it works.**
- Server: CAX11 (arm64, 2 vCPU, 4 GB RAM, 40 GB disk, EUR 5.99 a month), or CX23 x86 when ARM is out of stock (`CARTA_SERVER_TYPE=cx23`, EUR 6.64). Set up by `provision.sh` and `cloud-init.yaml`: key-only SSH, firewall with port 22 only, unattended security upgrades, pinned and checksum-checked tools. The `anthropic` package is filtered out.
- Schedule (systemd, since T1107 every task in a tier; the table is `infra/hetzner/cron/schedule.py`): `carta-weekly.timer` Monday 09:00, `carta-monthly.timer` the first Saturday of the month 03:00, `carta-quarterly.timer` the third Saturday of January, April, July and October 03:00, all Europe/Brussels and `Persistent=true`. Each unit sets `CARTA_TIER`, passed as `--max-cadence`, so a run also takes the faster tiers' due tasks (a quarterly run is a full run). `after` tasks run in the run that runs what they follow, so never in a weekly run. The ten `backfill` tasks stay manual, each with its written reason in `schedule.py`'s `MANUAL` (several are null-risk patch writers, T261). `python infra/hetzner/cron/schedule.py --dry-run --check` prints every task in its tier and exits 1 when a task is in no tier or a unit disagrees with the table; `tests/test_box_schedule.py` enforces both. Timeouts 48, 84 and 120 hours. `carta-reboot.timer` Sunday 04:00, skipped while any tier's run (or one waiting for the lock) or the lock is live.
- Cadence slack (`CADENCE_SLACK_DAYS` in `run_pipeline.py`): a task is due once its interval less 1.5 days (weekly), 4 (monthly) or 10 (quarterly) has passed, because `last_success` is stamped at the end of a task while the timers fire on fixed days (28 days between two first Saturdays, 84 at the shortest between two third Saturdays of a quarter). Before T1107 a weekly task that finished at 11:00 was not due at the next Monday's 09:00 and ran every other week.
- `weekly.sh` runs `run_pipeline.sh` only when `CARTA_PIPELINE_ENABLED=1`. It first takes `logs/carta-run.lock`, waiting up to `CARTA_LOCK_WAIT` (6 h weekly, 36 h monthly and quarterly) for another run, so the code update never resets the checkout under a running pipeline; a run that cannot get the lock exits 75 and its tasks stay due. Then: venv re-sync, R2 pull of the master (and, in a quarterly run, the beach, mountain, lake, region and overlay caches), `run_pipeline.py` at the `CARTA_TIER` ceiling (`CARTA_MAX_CADENCE` for a hand run), encrypted dumps, pushes, and the R2 data upload.
- Status after every run (T1107): `infra/hetzner/cax11/push_status.py` writes the wire freshness report (`scripts/freshness_report.py`, T1099) and a `last_run.json` (tier, exit, start, end, commit) to `logs/status/`, and copies them with `logs/pipeline_state.json` and `data/derived/freshness_report.json` to `r2:carta/status/` (plus one `status/runs/<stamp>-<tier>.json` per run). Good and failed runs alike: no box pulls `status/`; `archive/state/` still moves only with the master after a good run.
- Since T992 to T996: old raw downloads are pruned, `npm ci` reruns when packages change, the box pulls code itself, and with `CARTA_DEPLOY=1` it deploys `dist/` to Pages after a data publish.
- Late flight sweep: `carta-late-sweep.service` runs `continent-app/workers/late-sweep/run.mjs` for weeks 27 to 45; `carta-late-fill.service` did the one-time fill.
- On-demand workers: CAX41 at EUR 0.056 an hour, and a CPX42 trailslab worker every 28 days (about EUR 0.65 a run, unverified).

**Data behind it.** Pulls `app_data/app_data.json` and `data/history` from R2; writes the wire and pushes to R2. Ordered steps in `infra/hetzner/cax11/weekly_tasks.txt`.

**Where it lives.** `infra/hetzner/README.md`, `infra/hetzner/cax11/` (provision.sh, cloud-init.yaml, run_pipeline.sh, weekly.sh, verify.sh, verify_tasks.sh, weekly_tasks.txt), `infra/hetzner/cax41/`, `infra/hetzner/cron/`, `infra/hetzner/jobs/`, `scripts/stays_scrape_task.ps1`, `run_pipeline.bat`. Owner steps: `Execution/P3/_OPEN-hetzner.md`.

**Limits.** Hetzner backups are off; the box holds nothing not in git or R2. An IPv6-only box cannot work (README section). The raw mirror writes about 5.3 GB against a 40 GB disk.

### CI and checks

**What it does.** A set of GitHub workflows checks data, security and design rules on every push to the GitHub repository, and one checks uptime every 15 minutes. Locally, `npm run ci` runs the full app chain.

**How it works.**
- `npm run ci` (continent-app/package.json): `lint`, `test` (node unit tests, 168 files in `tests/`), `verify` (affiliate, Omio, paywall checks), `ci:routes`, `ci:contract`, `build`, `ci:css-routes`, `ci:smoke`, `build:pages`. Also `test:browser` and `test:quota` (plan tiers, global cap, AI quota, passes).
- GitHub workflows in `.github/workflows/`:
  - `ci.yml` (T1057, every push and pull request): app `npm ci`, `npm run lint` (errors fail, warnings do not), `npm test`, the fast build; Python ruff on the error rules `E9,F63,F7,F82` (the whole repo passes), pytest with the IDs in `tests/quarantine.txt` deselected (58 on 2026-11-05; the list may only shrink, T1057-a), and the entry-point check. Actions are pinned to commit SHAs. mypy is not run: no config yet.
  - `schema-contract.yml`: `check-contract.mjs` plus database checks.
  - `rls-policies.yml` and `admin-rpc-security.yml`: row level security and admin RPCs against a throwaway Postgres. Since T1087 `test_rls_policies.mjs` also asserts that every SECURITY DEFINER function in every non-system schema (120 on 2026-11-05, discovered from `pg_proc`) pins a `search_path` with no `$user` and no schema `anon` or `authenticated` may create in, with two planted controls that must be caught.
  - `admin-harnesses.yml` (T1087, C4; migrations, `schema.sql`, `continent-app/scripts/admin/`, `src/planner/`): the other 14 per-migration harnesses in `continent-app/scripts/admin/` through `run_harnesses.mjs`, on one Postgres 18 service container, in sequence. A harness that exits non-zero or prints `SKIPPED` fails the job. Run all 16 locally with `PGPORT=<port> node continent-app/scripts/admin/run_harnesses.mjs`.
  - `secret-scan.yml`: secret scan, `npm ci`, lint and build.
  - `design-lint.yml`: `scripts/ci/design-lint.mjs`.
  - `golden-set.yml`, `rating-tests.yml`, `coverage-contract.yml`, `trip-validator.yml`, `data-licences.yml`: pipeline data checks.
  - `uptime.yml`: cron `*/15 * * * *`, `scripts/monitor/check.py`.
  - `supply-chain.yml` (T1080, T1088, C6; pull requests touching a lockfile or requirements file, Mondays 05:17 UTC, manual): gates, all fail the build: `npm audit --omit=dev --audit-level=critical` and `npm audit --audit-level=high` (whole tree) in `continent-app`, `npm audit --audit-level=high` in `tools/trailslab/review`, `pip-audit` of `constraints.txt` (any advisory), and OSV-Scanner on both lockfiles and `constraints.txt`. `pip-audit` of `requirements-ml.txt` stays report only (its huggingface-hub range cannot be audited). On tags (`v*`, `prod-*`), releases and manual runs it also builds CycloneDX SBOMs with `scripts/ci/sbom.sh` (npx and pip in CI only) and uploads them as the artifact `sbom-<sha>`.
  - `.github/dependabot.yml` (T1080): weekly npm (`continent-app`, `tools/trailslab/review`), pip (root, `infra/hetzner/jobs`) and github-actions updates, minor and patch grouped, 2 to 3 open PRs per ecosystem. Dependabot, not Renovate: no app install.
  - Every workflow action is pinned to a full commit SHA with the tag in a trailing comment, and every workflow declares `permissions: contents: read` (T1080). The app installs with `npm ci`, so the lockfile is enforced.

**Data behind it.** `public/app_data.json`, fixtures under `continent-app/scripts/ci/`, pipeline golden sets.

**Where it lives.** `.github/workflows/`, `continent-app/package.json`, `continent-app/scripts/ci/`, `continent-app/tests/`, `tests/test_*.py`.

**Limits.** `npm run ci` (verify, routes, smoke, `build:pages`) still runs only by hand. 58 Python tests are quarantined because they fail on today's data (T1057-a). `coverage-contract.yml` is red until `reports/coverage_contract.json` is generated on the build box and committed (T1057-b). Branch protection on `main` is an owner setting (T1057-c).

---

### Secrets and owner accounts

**What it does.** Lists every secret Carta depends on and every owner account that can reach production, with where each lives, what reads it and what a leak would cost. Names only, never values.

**How it works.** `docs/security/SECRETS.md` is the inventory (T1059, ROADMAP C2), built from the workflows, the Edge Functions, the Workers, the `wrangler.toml` files and the example env files, plus a search of all git history for secret-shaped strings (none found). `secret-scan.yml` guards the tree and the built bundle. The owner's rotation and MFA order is `Execution/P15/_OPEN-secrets-rotation.md`.

**Data behind it.** None; it is a document. Secrets live in Supabase secrets, Cloudflare (Pages env, Worker secrets), GitHub secrets, the Hetzner box `.env` and the laptop `.env` files, which git ignores.

**Where it lives.** `docs/security/SECRETS.md`, `.github/workflows/secret-scan.yml`, `src/ingestion/CREDENTIALS.md` (how to get each data source key).

**Limits.** Rotation dates are mostly not recorded yet. The leaked R2 admin token (T291-b) is not rolled. Cloudflare, R2 and Resend keys have no fixed shape, so the scan cannot catch them.

---

### Waitlist and newsletter (double opt-in)

Built in T1110 (ROADMAP K3). A short form (`src/components/WaitlistForm.jsx`, shown on the Home page after the closing question) posts one e-mail address to the `waitlist` Edge Function (`supabase/functions/waitlist`). The address is stored lower-cased and unconfirmed in `waitlist_signups` (migration 066, RLS on, no policy, no grant to the API roles) and a confirmation mail goes out through Resend. The mail holds a confirm link and an unsubscribe link, each an HMAC of action, address and expiry with `WAITLIST_SECRET` (`logic.mjs` `linkToken`). A confirm link lasts 7 days (`CONFIRM_TTL_MS`); an unsubscribe link never expires, and is also sent as `List-Unsubscribe` with the one-click POST. Clicking confirm sets `confirmed_at`; clicking unsubscribe sets `unsubscribed_at` (the row is kept so a later import cannot mail an address that opted out). The only way to read the list for use is `waitlist_audience()`: confirmed and not unsubscribed. A repeat sign-up within 10 minutes sends nothing; an already confirmed address gets the same "check your mail" answer as a new one, so the form cannot probe who is on the list. Signing up again after an unsubscribe starts over, unconfirmed. `waitlist_purge(days)` (minimum 7) deletes addresses never confirmed; nothing schedules it yet. The form copy is in English and Dutch (the other languages fall back to English). Without the three secrets the function stores and sends nothing and the form says it cannot sign up right now.

## Appendix: what writing this handbook found

Reading every feature against its code turned up places where the docs, the comments or the map no longer match what runs. None of these were changed by T1045; each is a register row (`T1045-a` onwards) for a later task.

| Finding | Where | Register |
|---|---|---|
| CLAUDE.md names `pipeline/schema.py` as the data contract; it does not exist. Schema version 19 is set in each layer's writer, in `continent-app/scripts/ci/contract.mjs` and in `docs/SCHEMA.md` | CLAUDE.md | T1045-a |
| MAP.md lists `RatingBreakdown.jsx`; the rating sheet is `continent-app/src/browse/RatingSheet.jsx` | MAP.md, Ratings row | T1045-b |
| MAP.md points "Trip page" at `planner/finder/TripPage.jsx`, which is the trip finder's page for one found trip. The traveller's planned trip is `TripPlannerTab.jsx` with `TripSummary.jsx` | MAP.md, Trip page row | T1045-b |
| `rating.month_scores` is read by the app (`lib/match.js`, `lib/placeOverview.js`) but no pipeline code writes it, so the base score is always used | Scores, Place rating | T504-d (existing) |
| `rating_layer.py`'s docstring describes rating v4 weights; v5 is what runs | Scores, Place rating | T1045-c |
| Comments that contradict the code: beauty v2 "NOT LIVE", vibe text "top fifth" (code uses the top tenth), CrowdCalendar "no monthly data", sea temperature metadata years and radius | Scores | T1045-c |
| The 10% budget buffer exists only in Ask's budget search, not in the planner total or the place card | Prices, Ask budget buffer | T1045-d |
| No place has a local transport fare yet | Prices | T1045-d |
| The toll layer has no `run_pipeline.py` task; `search_index_layer.py` and `guided_search_layer.py` are run by hand, not from the registry | Prices, Discover | T1045-e |
| plan-day keeps only the first 28 candidates on the server, so the trim limit of 30 never applies; no prompt version beyond `CACHE_KEY_VERSION = 6` | Planning, plan-day | T1045-f |
| No test checks that the six language files have the same keys; the five non-English files are about 600 lines shorter than English | Platform, Languages | T1045-g |
| No GitHub workflow runs `npm test` | Platform, CI | ROADMAP H1 |
| Which Supabase migrations are live (022, 027, 029, 031, 044, 055 to 058 and others) cannot be read from the code | Platform, Planning | ROADMAP A3, H6 |
| Wire dates: trips 2026-09-15, journeys 2026-10-15, with no refresh schedule in code; image audit counts from 2026-08-26, trail counts from 2026-09-13 | Planning, Outdoors | ROADMAP D2 (freshness rules) |
| Own AVIF and WebP image copies are built but not live; production still links photos from Wikimedia | Outdoors, Image ladder | T1045-h |
