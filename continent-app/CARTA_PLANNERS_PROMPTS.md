# Carta — Trip planner & Day planner prompt pack

Prompts to paste into Claude Code **one at a time**, from the repo root (`continent-app/`).
They finish the Trip planner and Day planner the same way Explore and Destinations were
finished (`CARTA_CLAUDE_CODE_PROMPTS.md`).

Written from a read of the source (snapshot of 17 Sep 2026) plus a walk through the live
site. Line numbers are approximate. **Always re-grep before editing:** `GuidedTripWizard.jsx`
(~3,000 lines) and `DayPlannerTab.jsx` (~3,800 lines) shift easily.

---

## 0. How to use this pack

1. Paste **the shared context block (section 1)** as the first message of every new
   Claude Code session. Then paste one prompt.
2. Run the prompts in order. Each phase builds on the one before.
3. Commit after every prompt (`git commit -am "planner: <prompt id>"`) so each one can be
   reverted on its own.
4. After each prompt, run `npm run dev` and look at every screen it touched at **375×812**
   and **1280×800** before you commit. Prompt Q1 adds a script that captures these screenshots.

| Phase | Prompts | What you get |
|---|---|---|
| A: groundwork | A1–A2 | Bugs fixed, spacing system, shared helpers |
| B: Trip planner | T1–T8 | New Where step, country brief, trips, getting there, flights |
| C: Day planner | D1–D7 | New stay/date/idea steps, better bot, manual builder |
| D: Integration | I1–I2 | Hand-offs between Destinations, Explore, favourites and both planners |
| E: QA | Q1 | Mobile/desktop screenshot audit |

### The target flows

```
TRIP PLANNER (today)                         TRIP PLANNER (target)
1 Booked                                     1 Booked
2 From                                       2 From      (+ "Where can I fly cheaply?" → Google Flights Explore)
3 When                                       3 When
4 Who travels, and in what style   ──✕──     4 Where     [Help me choose | Choose by hand]
5 Where (grid + search + map)                            quiz → recommended countries (no prices)
6 Trips (ready | build, 2 columns)                       country brief = folded sheet with photos
  └ picked trip + legs rendered BELOW list   5 Trips     one list of Destinations trips, compact cards,
7 Finish                                                 "What's there" opens the real TripPage
                                             6 Getting there  (NEW step: flights, transfers, return)
                                             7 Finish    (+ "Plan your days" hand-off)

DAY PLANNER (today)                          DAY PLANNER (target)
1 Stay  (+ popular cities, saved trips)      1 Start point  "Where does your day start?"
2 When  (past dates allowed)                             continue-a-trip cards (visual), my location
3 How   (small cards)                        2 When         today onward only, trip-aware
  ├ Carta bot (10 questions, km)             3 Ideas        "Anything already in mind?" (NEW)
  └ Plan myself (map-first explorer)         4 How          big, clear choice
                                               ├ Carta bot  adaptive questions, steps not km
                                               └ Build it myself  rails of nearby places + tray
                                                              + "Let Carta plan the rest"
```

---

## 1. Shared context block (paste first in every session)

```
You are working on Carta, a React 18 + Vite travel app (repo root: continent-app/).
No TypeScript. MapLibre for maps, Supabase for auth and edge functions. Styles live in one
big src/styles.css (~1 MB). Grep it and never rewrite it wholesale. Add new rules in a clearly
commented block near the related section.

House rules for this work:
- i18n: every user-facing string goes through t('key'). Add every new key to ALL SIX
  locale files: src/i18n/en.js, nl.js, de.js, fr.js, es.js, it.js. Write real translations,
  not English copies. When you remove UI, remove its now-unused keys from all six files.
- Reuse existing primitives. Don't invent parallel ones:
    browse/Fold.jsx + browse/useFolds.js   collapsible sections (.dsec-*)
    browse/SheetShell.jsx                  bottom sheet / anchored popover (focus trap, swipe)
    components/HeroImage.jsx               image with srcSet/sizes/ratio (+ lib/heroImage.js)
    CardPhoto in browse/DestinationsTab.jsx (~line 388): extract to components/ if you need it
    components/RatingBadge.jsx (ScoreChip), components/FavStar.jsx, components/DateField.jsx
    lib/nearby.js haversineKm, lib/regions.js bandChip/travelBand
    lib/trips.js (loadTripsFor, loadTrip, rankTrips), browse/TripPage.jsx
- Wikimedia thumbnails only exist at widths 250/330/500/960/1280/1920 (lib/heroImage.js
  WIKI_WIDTHS). Any other width returns HTTP 400.
- Design tokens: --space-1..8 (4,8,12,16,22,30,40,56px), --tap 44px, --paper, --ink,
  --ink-soft, --ink-mute, --rule, --accent, --accent-bg, --rate, --display (Fraunces),
  --ui (Plus Jakarta Sans), --mono. The main breakpoint is max-width:768px / min-width:769px.
- Mobile is a first-class target. Every change must work at 375px wide with no horizontal
  scroll, tap targets of at least 44px, sticky footers that don't cover content (respect
  env(safe-area-inset-bottom) and --bottom-nav-h), and nothing that relies on hover.
- Planner tabs stay mounted and hidden with .tab-keep-hidden (App.jsx). Don't assume
  unmount on tab switch.
- Copy tone: short, concrete, no filler sentences. If a line explains what the UI already
  shows, delete it.
- Before finishing: npm run lint, npm run build, then run npm run dev and check the screens
  you touched at 375x812 and 1280x800. Report what you checked and anything you could not
  verify.
```

---

## PHASE A: Groundwork

### Prompt A1: Small bugs and dead code found in the audit

```
Fix these, each is self-contained. Re-grep for each one, since line numbers are approximate.

1. src/i18n/en.js ~1418: "wizard.planYourTrip": "|| 'Plan your trip" is corrupt. It should
   be "Plan your trip". Check the same key in the other five locales.

2. The trip picked in the wizard shows airport suffixes in city names ("Paris (CDG)" in
   the "Your trip" stop list, GuidedTripWizard.jsx ~1947-1988). Strip a trailing
   " (XXX)" IATA suffix wherever a city name is rendered in the planners. The day planner
   already does this for popularStays (DayPlannerTab.jsx ~2020-2047). Extract that logic
   into one helper in src/lib/format.js (or a new src/lib/placeName.js) and use it in both
   planners.

3. Ready-made trip cards list a city as a "sight" (the card for "Bruges and Paris" lists
   "Madonna of Bruges, Paris, Groeningemuseum"). In planner/ReadyTripsStep.jsx and
   anywhere tripStory.js builds sights, filter out sights whose normalised name equals a
   stop's city name.

4. Unused imports in planner/GuidedTripWizard.jsx: OriginPicker, FlightPickerMap,
   BAGGAGE_OPTIONS. Also PACE_CHOICES (~144) is never rendered. Remove them. Confirm
   planner/StarterTrips.jsx is imported nowhere, and delete it (and lib/starterTrips.js if
   nothing else imports it).

5. Nothing persists wizard progress. plannerStore.js only restores adults/children/
   lifestyle/origin, so a reload loses countries, dates, step and trip pick. Persist and
   restore: step, countries, date range / flex, quiz answers (added later in T2),
   tripPick id and buildMode. Keep the carta.plannerDraft.v1 key and bump to a v2 shape
   with a migration. Drafts older than 30 days, or with a start date in the past, restore
   to step 1 with countries kept.

Run lint and build. List every file changed.
```

### Prompt A2: Spacing system for both planners (the "too little whitespace" complaint)

```
Titles in the trip wizard sit right on top of their content. For example, "Where are we
going?" touches the "Let Carta pick the countries" button, and "Who travels, and in what
style?" touches its card. The cause is in src/styles.css:
  - `* { margin:0 }` reset (~line 97)
  - .guide-title (~1985) has no margin. Only .guide-sub (~1986) adds spacing, and
    most steps (Where, Trips, Booked, From, When) render no .guide-sub
  - .guide-where-tools, .wmode, .guide-card and .guide-picklist-head add no top margin

Create a single, predictable vertical rhythm for the planner surfaces:

1. Add a commented block "/* Planner rhythm */" with:
   .guide-canvas > .guide-title      margin-bottom: var(--space-5)   (22px)
   .guide-canvas > .guide-title + .guide-sub  margin-top: calc(-1 * var(--space-3)); margin-bottom: var(--space-5)
   .guide-section + .guide-section   margin-top: var(--space-7)   (40px; 30px under 768px)
   .guide-section-title              font: var(--display) 18px/1.25; margin-bottom: var(--space-3)
   .trip-field-label (inside guide-*) margin-bottom: var(--space-2)
   Mirror this for the day planner: .day-flow-q gets margin-bottom var(--space-5), and
   .day-flow-panel > * + * gets consistent gaps.
2. Introduce a tiny wrapper component planner/PlannerSection.jsx:
   <PlannerSection title sub? aside?>{children}</PlannerSection>, rendering
   <section class="guide-section"><header>…</header>{children}</section>. Use it for every
   captioned block inside the wizard steps and the day-flow steps, replacing ad-hoc
   title + div pairs.
3. Remove the now-conflicting one-off margins (.guide-picklist-head margin:4px 0 12px,
   the zeroed top in .guide-where-col, .wready-col-sub, etc.). Don't leave dead rules.
4. Check the short-laptop overrides (max-height:840px / 700px on the When step, and
   max-height:830px in the day flow). Tighten them proportionally. Don't remove them.

Take before/after screenshots of every wizard step and every day-flow step at 375 and 1280
wide, and show me the pairs.
```

---

## PHASE B: Trip planner

### Prompt T1: Remove "Who travels, and in what style?" safely

```
Remove the "Who" step (GuidedTripWizard.jsx ~2315-2371, title wizard.partyLabel) from the
trip wizard. It sets values that are consumed downstream, so remove it safely:

State today: adults (~312), kids (~313), groupSize = adults + kids (~314),
travelStyle (~317), effectiveStayTier = STYLE_BY_KEY[travelStyle]?.stayTier || stayTier (~385).

Consumers to rewire:
  - BASICS_STEPS (~123) and canNext (~860-878)
  - nightlyFor (~1068-1076) → accommodationPerPerson(..., groupSize, effectiveStayTier)
  - groundLegs (~1097-1161) uses groupSize
  - runningEstimate (~1170-1238): the "Food & fun, ${travelStyle} style" label is hardcoded
    English. Remove that label.
  - carAdvice(..., groupSize) (~951-954)
  - recap chip "{n} travellers, {style}" (~1447-1450)
  - plannerStore travelers write (~1498)
  - TravelLegsSection adults prop (~1979, ~2881) → Skyscanner adults
  - Finish summary wizard.summaryTravellers (~2927-2930)
  - finish() → onComplete({groupSize, stayTier}) → TripPlannerTab handleWizardComplete
    (~395-404) → tp.setStayTier / loadFromWizard setGroupSize
  - startOver resets (~939-941)

New behaviour:
  - Travel style is no longer asked as its own step. In prompt T2 it becomes a
    "How do you like to spend?" answer in the Where quiz, which sets travelStyle and so
    effectiveStayTier. Until T2 lands, default travelStyle to the app lifestyle/stayTier
    prop.
  - Group size: default to 2 adults, or the last value restored from plannerStore. Move a
    compact "Travellers: – 2 +" stepper (adults plus an optional children stepper behind
    "+ children") into the Finish step's summary card, and keep it in the planned view,
    where the planner already uses groupSize. Keep wizard.childrenNote but show it only
    when children > 0.
  - Update the step rail labels, stepOf counts and the booked.stays path.

Verify: pricing on Finish and in the planned view still multiplies by group size, and the
Skyscanner link still carries adults. Remove unused i18n keys (wizard.partyLabel,
wizard.styleLabel, etc.) only if nothing else uses them. Grep all locales.
```

### Prompt T2: "Where are we going?": guided recommendations and choosing by hand

```
Rebuild the Where step (GuidedTripWizard.jsx ~1731-1926). Today it is a "Let Carta pick the
countries" toggle with 6 vibe tiles (VIBES ~133-140, countrySuggestions ~673-735), a search
box, a Map/List toggle and a price-labelled country grid. Target:

LAYOUT
  Title "Where are we going?", with sub "Tell Carta what kind of trip this is, or pick
  countries yourself."
  A two-tab segmented control directly under it (reuse .guide-datemode styling or build
  a proper tablist with role="tablist" and arrow-key support):
     [ Help me choose ]  [ Choose by hand ]
  Default tab: "Help me choose" when no country is picked yet. Otherwise "Choose by hand".
  Picked countries show as a chip row above both tabs, so the selection is shared.
  Remove the search input (input.guide-search, wizard.countrySearchPlaceholder) and the
  "Let Carta pick the countries" toggle.

TAB 1: HELP ME CHOOSE (a short quiz on one scrolling screen, not a modal)
  Each question is a PlannerSection with large tappable chips (min 44px, 2 columns on
  mobile). Show one question at a time, revealing the next with a smooth scroll. Answered
  questions collapse to a one-line summary that can be edited.

  Q1 "What kind of trip is this?" (multi-select, up to 3). Chips grouped with small
      group labels:
      Unwind   · Beach & relax · Wellness & spa · Lakes & slow travel
      Explore  · City break · Culture & heritage · Food & wine · Nightlife · Romantic
               · Hidden gems
      Active   · Hiking · Trail running · Cycling · Water sports · Ski & snow · Road trip
      Who/how  · Budget backpacking · Family with kids · Island hopping · Festivals
  Q2 "How do you like to spend?" (single). This replaces the removed style step
      and sets travelStyle / stayTier. No prices anywhere:
      Shoestring (hostels, street food, free sights) → 'budget'
      Smart mid-range (apartments, local restaurants) → 'standard'
      Hotels & comfort (good hotels, sit-down dinners) → 'luxury'
  Q3 "How do you want to get around?" (single): Fly in, then trains & buses ·
      Road trip by car · Train only, no flights · No preference
  Q4 "How far from home?" (single): Short hop (≤ 2 h) · Anywhere in Europe.
      Use the From-step origin coords. For "train only" or "road trip", filter by drive or
      rail reach from the origin with lib/regions.js driveHoursEstimate.
  Q5 "Pace" (single): One base with day trips · A few stops · Keep moving
  Q6 optional "Anything to avoid?" (multi): Crowds · Heat · Needing a car ·
      Long travel days
  The month is already known from the When step. Use it and don't ask again.

SCORING: create src/lib/countryMatch.js, pure and node-runnable like
lib/countryBrief.js, with a small test in tests/countryMatch.test.js.
  matchCountries({ destinations, insights, layerIndexes, answers, month, origin })
    → [{ iso2, country, score, reasons: [{key, vars}], topPlaces: [destId…] }]
  Signals to use (all real data, nothing invented):
    - destination categories/beauty/rating per country (THEME_GROUPS in
      lib/countryBrief.js already maps tags → themes; extend it for the new trip types)
    - published layer indexes: /trails/index.json (countries[].n_trips), beaches index
      (countries[].n, best), lakes, mountains, cycling indexes, through their loaders
      in lib/*.js. Trail running = trails + mountains weight. Water sports = beaches +
      lakes. Ski = mountains AND month in Dec–Apr.
    - country_insights: best_months (month fit), budget_level (spend fit), rail/bus
      (train-only fit), driving (road-trip fit)
    - crowding tier per destination for "avoid crowds"; climate best months for "heat"
    - distance from origin for Q4
  Every reason must come from a signal, e.g. {key:'match.trails', vars:{n:148}} →
  "148 rated trails". Never say "great for X" without a number or fact behind it.

RESULTS (under the quiz, updating live)
  "Recommended for you": the top 6 as large photo cards (see T3 for image rules). Each card:
    - photo, flag + country name
    - a match line naming the user's top trip type, e.g. "Trail running · best in October"
    - 2–3 reason bullets from matchCountries
    - a row of 3 small thumbnails of topPlaces (name + ScoreChip)
    - actions: [ + Add ] (toggles selection) and [ What's there ] (opens the brief, T4)
  NO PRICES on these cards. Below the results, a quiet link "Show 6 more".
  Also below, a flights helper card (built in T7): "Not sure where to fly? See what's
  cheap from {origin} in {month} on Google Flights ↗".

TAB 2: CHOOSE BY HAND
  A Grid | Map toggle (grid default on mobile, map default on desktop ≥1100px).
  Grid: the country cards from T3, alphabetical, with favourites-first sorting when the
  user has favourites in a country (badge "3 on your shortlist", via lib/favorites.js
  groupFavs / favDestIds).
  Map: see the map requirements below.

MAP (map/CountryPickerMap.jsx): make it look good
  Today: Carto Voyager + one flag+name pin per centroid, flags only below zoom 4.4.
  Target:
    - Check public/ for a countries GeoJSON (grep for "geojson" / "countries" in public and
      pipeline). If one exists, or a light Natural Earth 1:50m Europe file under ~300 KB can
      be added, render country FILL polygons: neutral fill, hover (pointer) → --accent-bg,
      selected → --accent at 35% with a 1.5px --accent outline, and recommended (from Tab 1)
      → a subtle dotted outline. Clicking a polygon toggles it.
    - Without polygons, restyle the pins as pill chips (flag, name, and a check when
      selected), with a selected state in --accent, a collision-aware dense mode, and a larger
      hit area (44px).
    - A muted basemap (lower label density, desaturated). Fit to the European bounds on first
      load, with padding for the chip row.
    - Tapping a country on mobile opens a small bottom card (photo, name, Add / What's
      there), not a hover tooltip.
    - Height: 62vh on mobile (min 380px), calc(100vh - header - footer) on desktop.
    - A legend: Selected · Recommended.

Remove: VIBES, countrySuggestions, wizard.pickCountriesBtn/Sub, wizard.vibeQuestion,
the search input and its keys, if nothing else uses them. Persist quiz answers in the
plannerStore (A1). canNext stays "countries.size > 0".

Show me screenshots of both tabs at 375 and 1280, with 3 different quiz answers
(e.g. Trail running + Shoestring; Beach & relax + Hotels; City break + Train only).
```

### Prompt T3: Country card images: optimised, and no price overlay

```
Country cards in the Where step (GuidedTripWizard.jsx ~1865-1905) render a plain
<img className="guide-ccard-img" src={img}> with no srcSet, no sizes and no width/height, so
they download the full 960px Wikimedia file on phones. The overlay shows
t('brief.cardDay') "€99 a day, 48 places" or t('brief.cardPlaces').

1. Remove the price/places line entirely (.guide-ccard-n). Delete brief.cardDay and
   brief.cardPlaces from all locales if unused.
2. Render the photo with components/HeroImage.jsx, matching the Destinations CountryCard
   (DestinationsTab.jsx ~782-817):
     <HeroImage url={img} city={country} iso2={iso2} className="guide-ccard-img"
                maxWidth={960} ratio={[4,3]}
                sizes="(max-width: 480px) 46vw, (max-width: 768px) 30vw, 240px" />
   Recommended cards in T2 are larger: sizes="(max-width: 768px) 92vw, 380px",
   ratio [16,10].
3. Image choice (countryCovers memo ~218-232): keep the rating sort and the NON_PHOTO_IMG
   filter (~53). Also prefer landscape images, skip any url already used by another
   country card (lib/heroImage.js duplicateHeroes), and prefer the country's top-rated
   destination that has a photo over "famous but ugly" airport gateways (tier==='airport').
   Add object-position using the existing --card-focus convention.
4. Card layout: photo with a bottom scrim, flag + name (15px display), and nothing else on
   the photo. The selected state is an accent ring plus a check badge top-right.
5. Grid: minmax(170px,1fr) desktop; 2 columns at ≤768px with a 12px gap; the whole card is
   the selection tap target. The "What's there" button moves (see T4).
Verify in the network panel that phones load the 330/500 widths.
```

### Prompt T4: "What's there": a folded, photo-rich country brief

```
Rework planner/CountryBrief.jsx (+ lib/countryBrief.js) and how it opens.

POSITION & ENTRY
  - Today .guide-ccard-info sits top-left on the photo, and at ≤900px the brief renders
    ABOVE the grid (order:-1), pushing everything down. Replace this:
    * Button: a 36px round "i" button bottom-right inside the card (a 44px hit area via a
      pseudo-element), aria-label "What's there in {country}". Stop propagation so it
      doesn't toggle selection. On recommended cards (T2) it is a labelled text button.
    * Desktop (≥1024px): a right-hand drawer, 420px, sticky, with its own scroll and a
      close button. The grid reflows to make room, as .guide-where.has-brief does today.
    * Tablet/mobile: SheetShell bottom sheet, max-height 88dvh, swipe to close. Never inject
      it into the grid flow.
  - Sheet header: country photo strip (HeroImage 16:9, 500w on mobile), flag, name, and a
    sticky footer with [ Add {country} ] / [ On your list ✓ ].

CONTENT: every section is a <Fold> (browse/Fold.jsx, useFolds keyed by iso2)
  1. At a glance (OPEN): best months (with the user's travel month marked as good,
     ok or off-season), getting around (rail/bus/car needed), currency, languages, and a
     budget level as a WORD ("Budget-friendly / Mid-priced / Pricey"), not a euro amount.
  2. Top places (OPEN): the 6 best-rated destinations, as a horizontal photo rail
     (HeroImage 4:3, name, ScoreChip, one-line knownFor(dest)). Tapping one opens the
     DestinationPage overlay (App openDetail; pass an onOpenDest prop down). "See all
     {n} places" opens the Destinations tab filtered to the country.
  3. Best trips (OPEN): top 3 published trips for this country, via lib/trips.js
     loadTrips(cc) → rankTrips(…, {days: windowNights+1}). Compact cards (photo, route,
     days). Tapping one opens TripPage (see T5 for mounting). "Plan this trip" preselects
     it on the Trips step.
  4. Things to do (closed): REAL items, not counts. Today themes[] only stores
     {key,labelKey,n}, so change buildCountryBriefs to also keep the top rows per group
     ({id,d}, sorted by rating), then render sub-rails:
        Beaches → loadBeaches(cc) top 4 (images[0].u, score)
        Hiking & trail running → loadTrails(cc) top 4 (img.u, km, ascent, rating)
        Lakes / Mountains → loadLakes / loadMountains top 4
        Heritage → destinations with unesco / heritage categories, top 4
        Food & wine towns → top 4 destinations in the food group
        Festivals & events → insights.events, with month badges, highlighting events in
                             the travel month
     Show only groups relevant to the user's quiz answers first, then the others. Each
     item has a photo (FeaturePhoto from browse/AroundHere.jsx falls back to a map tile,
     so use it) and a name.
  5. Eat & drink (closed): insights.food as chips.
  6. Your shortlist here (closed, only if any): favourites in this country
     (useFavoriteItems rows filtered by cc / iso2).
  7. Getting there (closed): nearest arrival airports to the top places (wizardTransit
     nearbyAirports), typical airport→city transfer from the top destination's dossier
     practical.getting_there, and a Google Flights link from origin (T7 helper).
  8. Worth knowing (closed): insights tips (all, not 2), driving rules
     (vignette/tolls from insights.driving), city taxes if present.
  9. Costs (closed, LAST): bed and eating-out figures only (brief.bed, brief.aNight, etc.).
     REMOVE the "Median of {n} priced places" line (brief.pricedAll / brief.pricedFrom) and
     "The country guide says €{lo} to €{hi} a day." (brief.guideSays). Delete those keys.

Loading: the brief opens instantly with the synchronous sections. Layer-backed rails show
skeleton cards. The loaders already cache (publishedJson makeCache). A null layer hides the
sub-rail; a thrown LayerFetchError shows a small retry.

Mobile check: at 375px the sheet shows the photo, "At a glance" and the first rail above
the fold, and nothing overflows horizontally except the intended rails (scroll-snap).
```

### Prompt T5: Trips step: one clean list of Destinations trips

```
The Trips step (GuidedTripWizard.jsx ~1932-1990, planner/ReadyTripsStep.jsx) is too busy.
Live, it shows a Ready-made / Build-your-own mode switch, country chips, a Map/List toggle,
two columns ("Across your countries" with "Routes that cross a border, with the nights split
between them." and "Inside one country" with "One country, in more depth."), and dense cards
with transport, shape, tags, sights, €/day and season. Many cards are the same route at
5, 6 and 7 days.

The trips already come from the same published data as Destinations → Trips
(lib/trips.js loadTripsFor + rankTrips). Keep that source. Change the presentation:

1. REMOVE: the multi/single split (.wready-split, ready.multiTitle/multiSub/singleTitle/
   singleSub/noMulti/noSingle), the Map/List toggle and the .wready-map CountryPickerMap,
   and the subtitles. Remove the i18n keys from all locales.
2. ONE LIST, ranked: favourited trips first (lib/favorites 'trip' kind), then trips
   covering more of the picked countries, then score. Title: "Trips for {countries}".
   Keep the removable country chips in a slim row.
3. GROUP near-duplicates: trips with the same ordered city sequence collapse into one
   card, with length chips "5 · 6 · 7 days". The chip closest to the user's window is
   preselected, and choosing a chip swaps the trip id. Put this logic in lib/trips.js
   (groupTripVariants(trips, days)) with a node test.
4. CARD (rewrite TripCard ~36-81). Show ONLY:
     - photo (see 5)
     - duration badge "6 days" on the photo
     - route: city names with flags, joined by "→" (strip airport suffixes, A1)
     - length chips if grouped
     - two buttons: [ Choose ] and [ What's there ]
   Drop transport/shape/tag chips, sights, €/day and season from the card. Those live in the
   detail page.
5. HERO IMAGE: today .wtrip-media is a fixed height:128px with cardThumb (500px, no
   srcSet), so it crops badly. Use the CardPhoto pattern from DestinationsTab (~388:
   fallbackSrc 500, srcSetFor 960, width 25 height 12) with aspect-ratio: 16/10 and
   sizes="(max-width: 768px) 92vw, (max-width: 1200px) 45vw, 380px". Image choice: use
   trip.img. If lib/heroImage flags it as non-photo, or it duplicates another card in the
   list, fall back to the first stop's destination image
   (data.destinations[stop.dest].image.url). Grid: 1 column mobile, 2 at ≥769px, 3 at
   ≥1200px.
6. WHAT'S THERE: open the exact TripPage used by Destinations (browse/TripPage.jsx,
   props {trip:{id}, data, onClose, onSelectDest, fav, onFav}). It is position:fixed,
   z-index 240, so it works from the planner. Lazy-import it in GuidedTripWizard or lift a
   `tripPageId` state into TripPlannerTab. Add an optional prop to TripPage,
   `primaryAction={{label, onClick}}`. In the planner, pass "Choose this trip", which
   selects the trip, closes the page and advances. The default keeps "Open in planner".
7. BUILD YOUR OWN: remove the big BuildModeSwitch (~61-86) from the top. Instead, end the
   list with a quiet card: "Nothing quite right? Build your own route →", which switches
   buildMode to 'custom' (the Stay step with CityPickerMap stays as is). In custom mode,
   show a small "← Back to ready-made trips" link.
8. Empty/edge states keep the existing logic (ready.noneFit, showAnyLength, hiddenByLength),
   rewritten as one short line plus a button each.
9. SELECTING a trip no longer renders the .wpicked panel below the list. It is ~3,700px down
   the page live. Choose → mark the card selected, show a sticky footer summary
   ("Bruges → Paris · 6 days · Next: getting there"), and Next goes to the new Getting
   there step (T6).
```

### Prompt T6: New step "Getting there": flights, transfers, return

```
Move how-to-get-there out of the Trips step into its own wizard step, "Getting there",
between Trips (or Stay, in custom mode) and Finish. Today TravelLegsSection
(planner/TravelLegsSection.jsx) is rendered inside .wpicked under the trip grid
(GuidedTripWizard ~1947-1988) and again on Finish (~2877). travelLegs memo ~587-615.

STEP LAYOUT (PlannerSection blocks; mobile = accordion per leg)
  Title "Getting there"
  Summary strip: origin → stop 1 → … → stop n → origin, with dates. Tap a node to jump to
  its leg.

  1. Outbound: {origin city} → {first stop}, {date}
     - Suggested arrival airports: wizardTransit nearbyAirports(meta, firstStop.lat/lon)
       with transfer time from the dossier practical.getting_there
       (transfer_min, transfer_mode) where available.
     - "Fly into {A}, home from {B}" open-jaw hint when the last stop has a closer airport
       than the first.
     - Mode buttons (fly/train/bus/car/ferry), prefilled: fly if > 700 km, otherwise train
       where the country isn't NO_RAIL, and "car" if the quiz said road trip.
     - Links per mode from legLinks(). ADD Google Flights (T7) as the first flight link.
  2. Between stops: one row per detail.legs[i]. PREFILL the mode from the published trip's
     detail.legs[i].mode, with minutes/km shown ("2 h 10 by train"). Today these are ignored
     in the wizard; TripPage shows them via legLine. Reuse legLine.
  3. Return: {last stop} → {origin}, {return date}.
  Keep "Move the whole trip −1/+1", "What it cost" and "Who with" inputs, but collapse
  "What it cost / Who with" behind "Add what you paid" so the default view is scannable.
  Delete the long paragraph "Carta sells no tickets and holds no fares…" and replace it with a
  one-line hint at most.

  Remove TravelLegsSection from Finish. Finish shows a compact read-only summary of the legs
  with an "Edit" link back to this step.

State: legModes / ownLegs already flow into finish() → onComplete. Keep that contract.
Make sure the booked.travel path (the user already booked travel) shows the booked leg as
confirmed, not as a question.
canNext: always true, since the step is informational.
```

### Prompt T7: Google Flights where it helps

```
There is no Google Flights link builder anywhere in src (only DestinationPage ~1228 uses a
precomputed links.flights_google). Add one and put it where a traveller naturally looks for
flights.

1. src/lib/transportLinks.js: add
   googleFlightsLink({ fromIata, toIata, toCity, date, returnDate, adults=1 })
     → https://www.google.com/travel/flights?q=<encoded>
       q = "Flights from {fromIata} to {toIata||toCity} on {YYYY-MM-DD}"
           + (returnDate ? " through {YYYY-MM-DD}" : "") + (adults>1 ? " for {n} adults" : "")
       plus &curr=EUR and &hl={app lang}
   googleFlightsExploreLink({ fromIata, fromCity, month? })
     → https://www.google.com/travel/explore?q=<encoded "Flights from {fromIata}"> plus
       &curr=EUR&hl={lang}
   Google doesn't document the q-parameter format. Open each generated URL in a real browser
   (Playwright is a devDependency) for 3 sample routes and confirm the search is
   prefilled. If explore ignores q, fall back to the plain /travel/explore URL. Add these to
   scripts/verify_transport_links.mjs if it exists. Otherwise create a small verify script.
2. Add 'google' as the first entry for mode 'fly' in legLinks(). Label "Google Flights".
3. Placement:
   a. From step (under "Airports within reach"): a card "Not sure where to go yet? See where
      you can fly cheaply from {airport}, Google Flights Explore ↗", using the nearest
      airport chip the user selected.
   b. Where step, below the recommendations (T2), the same Explore card, month-aware.
   c. Country brief (T4), in the "Getting there" fold: "Flights from {origin} to {country's
      main airport} ↗", dated if dates are known.
   d. Getting there step (T6), per flight leg, dated.
   e. Day planner doesn't need it.
   Every external link opens in a new tab with rel="noopener" and a ↗ glyph. Keep the
   existing Skyscanner/Aviasales affiliate links next to it. Don't remove revenue links.
```

### Prompt T8: Flow polish, favourites and hand-offs inside the trip planner

```
Tie the trip planner into the rest of the app and smooth the flow:

1. Step rail on mobile: .wiz-steps shows 7 steps and overflows at 375px. Below 769px,
   render "Step 4 of 6 · Where" with a thin progress bar instead of the full rail, and
   let a tap open a small sheet listing the steps (done steps clickable).
2. Sticky footer (Back / Next): check it respects env(safe-area-inset-bottom) and the
   bottom nav height. Next is labelled by destination ("Next: trips", "Next: getting
   there").
3. The estimate band (.guide-estimate-band ~1665-1720) has hardcoded English ("Estimate so
   far", "Details", "Hide", "Total so far"). Move it to i18n. On the Where step, hide
   it entirely (no prices at the start). Show it from Trips onward, collapsed by default on
   mobile.
4. Favourites:
   - Where → Choose by hand: countries with shortlisted items show a badge, and a "From your
     shortlist" row of those countries sits above the grid.
   - Trips: favourited trips first, with a star.
   - Planned view: ShortlistStops (TripPlannerTab ~255/556/975) already exists. Keep it.
5. Entry from Destinations: App.openTripInPlanner (~445-458) drops detail.legs[].mode, dates
   and anchors. Pass legModes from the trip detail so the Getting there step is prefilled.
   Instead of skipping the whole wizard, land on the Getting there step with the trip
   preselected when dates are unknown (ask When first, then return).
6. Finish → after "Arrange it", the planned view shows a primary CTA "Plan your days" that
   calls onPlanDay({planId, stopIndex:0, dayIndex:0}) (App.planDay ~566).
7. Recap chips (.guide-recap "Planning around:") become tappable shortcuts to edit that
   step.
```

---

## PHASE C: Day planner

### Prompt D1: Start point step: works on holiday and at home; remove "popular cities"

```
Day planner landing step 1 (DayPlannerTab.jsx ~2759-2831, day.whereStaying "Where are you
staying?").

1. Copy: question "Where does your day start?", sub "Your hotel, holiday rental or home
   address". Placeholder "Hotel, address or town". Update all locales.
2. REMOVE the popular-city block (~2807-2822, day.popularStays "Or start from a popular
   city, with its traveller rating"), the popularStays memo (~2020-2047),
   POPULAR_STAY_MIN_POP, pickPopularStay (~2049) and their CSS (.day-flow-suggest*,
   ~15770-15790 and the mobile grid ~16296, plus the stale comment about map pins). Keep
   the base-city-name helper if A1 moved it to lib.
3. Add quick starts under the search (chips, 44px):
   - "Use my current location": navigator.geolocation with the same no-blame failure copy
     used in DestinationsTab (~936, ~1026). Label the point "Current location", or reverse-
     geocode if lib/geocode.js has a reverse function (check).
   - Upcoming trip stays: for signed-in users, a chip for each stop city of saved trips
     whose dates include today or the next 14 days ("Bruges · your trip, from 12 Oct").
     Picking one also presets the date in step 2 (D3).
   - Recent start points: the last 3 stayPoints from standalone plans in dayPlanStore
     (dedupe by label).
4. Search results: show a type icon (hotel / address / town) and the town + country on a
   second line. Results must be keyboard-navigable (arrow keys + Enter).
5. Mobile: the input is 48px high, results are a full-width list, and the Continue button sits
   in a sticky footer.
```

### Prompt D2: "Plan a day from a saved trip": make it visual

```
The saved-trip list under step 1 (DayPlannerTab.jsx ~2924-3000, day.planFromSavedTrip,
day.yourDayPlans) is a plain bordered list: 46px thumb, label, "DD Mon → DD Mon, N stops".
Redesign it as "Continue a trip":

1. A horizontal scroll-snap rail on mobile (cards 82vw), a 2–3 column grid on desktop.
   Card:
   - cover photo: HeroImage of the first stop's destination image, ratio 16:9,
     sizes "(max-width:768px) 82vw, 320px", with a scrim
   - on the photo: trip label (display font) and a status badge: "Now" (today inside the
     range), "In 12 days", or "Past" (past trips sort last and render muted)
   - body: date range, and stop chips with flags ("Bruges 2n → Paris 3n")
   - CTA "Plan a day →"
   fetchTripPlans rows only carry p.cities / p.destination_ids[0]. If more stops are
   needed for chips/images, use fetchTripPlanWithStops lazily for the first 6 cards only.
2. Tapping a card opens a SheetShell: "Which day?" as day chips grouped by stop
   ("Day 1 · Mon 12 Oct · Bruges"). Past days are disabled. Picking one calls
   openPlan(p.id) with {stopIndex, dayIndex}. The openPlanId object form already exists
   (~409-433). This skips the stay and when steps, since the trip knows both.
3. "Your day plans" (standalone) uses the same card style, with a smaller photo (4:3) and a
   delete action behind a ⋯ menu instead of the bare × button.
4. Signed out: replace the note day.signInNote with a card showing an illustration/icon,
   "Plan days from your saved trips", and a "Sign in" button that calls onRequestAuth (the
   DayPlannerTab needs the prop; App passes it to TripPlannerTab already).
5. Loading state: 2 skeleton cards. Empty state (signed in, no trips): one line plus a
   "Plan a trip" button that switches to the Trip tab.
6. Placement: put "Continue a trip" ABOVE the search when the user has an active or
   upcoming trip (status Now or within 7 days). Otherwise keep it below.
```

### Prompt D3: Date step: no past dates

```
Step 2 (DayPlannerTab.jsx ~2833-2872) renders <DateField inline value rangeStart rangeEnd
onChange> with NO min, so past days are selectable. newStartDate defaults to todayISO()
once (~301), and it goes stale if the tab stays open past midnight.

1. Use useToday() from lib/dates.js. Pass min={today} to DateField. Also pass
   max={addDays(today, 365)}.
2. If newStartDate < today (stale state, restored plan), clamp it to today with laterISO.
3. quickDates (~2067): "This weekend" must not resolve to a past day. On Saturday it means
   today, on Sunday today. Rename it "Tomorrow" duplicates away as the code already does.
4. When the start point came from a saved trip (D1/D2), limit the calendar to the trip's
   date range ∩ [today, …], and show the trip's days as chips instead of the generic
   Today/Tomorrow/Weekend.
5. Same fix in planner/AiDayPlanModal.jsx (~165): the native <input type="date"
   className="ai-plan-date"> gets min={today}.
6. Check the rest of the app for date inputs without min: grep DateField and
   type="date" usages in planner/ and components/. For the trip wizard's When step, confirm
   departure can't be in the past either.
7. DateField: disabled days need a visible disabled style and aria-disabled, and keyboard
   navigation must skip them.
```

### Prompt D4: New step "Anything already in mind?"

```
Add a step between When and How in the day-flow (FLOW ~2646-2713 becomes
stay → when → ideas → how).

Question: "Anything you already want to do?"
Sub: "Add a place, or skip and Carta will suggest things."

UI
  Two large choice buttons first:
    [ Yes, I have something in mind ]   [ No, surprise me ]
  "No" → go straight to How, with ideas = [].
  "Yes" → reveals a search field (autofocus): "A sight, beach, trail, restaurant or town"
    Suggestions while typing, grouped:
      Near your start point: POIs from the same pipeline as explorePois (~2141) and
        exploreTowns (~2097), matched with lib/textSearch.js
      Your shortlist: useShortlistPoints(favorites) within 60 km
      Anywhere: geocodeAddress fallback, capped at 80 km from the stay
    Picked ideas show as removable chips with thumb, name and distance ("12 min walk" /
    "8 km").
    Optional "When?" per chip: Morning / Afternoon / Evening / Any (default Any).
    CTA "Continue with {n} idea(s)".

DATA MODEL
  ideas: [{ key, name, lat, lon, destId?, poiIdx?, kind, cat, timeOfDay }]
  Persist in the landing state. Both planning modes consume it:
    - Carta bot (D5): ideas become hard must-includes, and the town question is skipped
      when all ideas resolve to one town (resolveNearestTown ~1959).
    - Build it myself (D6): ideas are pre-added to the day tray.

Rail/progress: "Step 3 of 4". On mobile the two choice buttons are full width, min-height
72px, with icon + label + one-line helper.
```

### Prompt D5: The Carta bot: better questions, better order, steps not km

```
Rework planner/CartaChatPlanner.jsx QUESTIONS (~37-125) and runChatAi
(DayPlannerTab.jsx ~2512-2563). Today there are 10 fixed questions: focus, interests, town,
known, distance (km), terrain, dayLength, food, events, extra.

PRINCIPLES (from how good human guides and the better AI planners onboard)
  - Hard constraints before preferences: who's coming and how much time/energy decide what's
    even possible. Interests only rank inside those limits.
  - Never ask what is already known: stay, date, ideas (D4), forecast, the town from ideas.
  - At most 6 taps to a plan. Every question has a "No preference" or skip.
  - Show progress as "3 of 6", and let the user tap a past answer to change it.

NEW ORDER (adaptive; skip a question when its answer is inferable)
  1 companions  "Who's coming?"         Just me · Partner · Friends · Family with kids ·
                                        Group
               → sets groupSize defaults, kid-friendly filter, pace hint
  2 window      "How much of the day?"  Morning · Afternoon · Full day ·
                                        Full day + evening
               + start chips: Early (8:00) · Normal (9:30) · Late (11:00)
               → replaces dayLength. Feed startTime to buildDaySchedule (DAY_START_MIN).
  3 steps       "How much walking?"     Easy · about 5,000 steps
                                        Normal · about 10,000 steps
                                        Active · about 15,000 steps
                                        Big day · 20,000+ steps
               + toggles: "Avoid steep hills" (replaces terrain) ·
                          "Happy to take a bus/tram for longer hops"
  4 mood        "What are you in the mood for?" (multi, max 3)
                Must-see sights · Museums & art · Parks & nature · Beach & water ·
                Active (hike, trail run, bike, kayak) · Food & markets ·
                Hidden gems & local life · Viewpoints · Shopping ·
                Nightlife (only when window includes evening)
                Pre-tick moods implied by ideas (a beach idea → Beach & water).
               → merges the old focus + interests
  5 town        (ONLY if ideas don't fix the town AND the stay's town has < 12 walkable
                candidates, OR the user picked Active/Beach and better options are nearby)
                "Stay around {town}, or go somewhere?" → TownPickerStep, as today, with
                travel time instead of plain km
  6 food        "Food plan?"  Sit-down lunch · Quick bites · Picnic · I'll sort it
                + optional chips: Vegetarian · Vegan · Gluten-free · Cheap eats · Treat
                ourselves
  7 known       "Been to {town} before?" (ONLY for towns with ≥ 5 must-see POIs)
  8 extras      One final screen, all optional: events toggle (default on when dossier
                festivals match the date), "Avoid crowds" toggle, free text.
                If lib/weather.js reports rain or > 30°C for the date and stay, show a
                one-line note ("Rain likely after 14:00, indoor options added") and set the
                flag automatically instead of asking.

STEPS INSTEAD OF KM
  - Add src/lib/steps.js:
      STEPS_PER_KM = 1350   // adult walking average ≈ 1,300–1,400 steps/km
      kmToSteps(km) → rounded to the nearest 500
      stepsToKm(steps)
      formatSteps(n, lang) → "≈ 9,500 steps" using Intl.NumberFormat
  - The walk option values become step budgets. Convert to maxWalkKm = stepsToKm(steps)
    for the plan-day payload, so the server contract stays compatible.
  - Replace km with steps in: chat.stageFit "Fitting the day inside {km} km on foot",
    ai.totals "About {km} km on foot, done around {t}." (CartaChatPlanner ~376,
    AiDayPlanModal ~289), day.statWalk (DayPlannerTab ~3564), dayws.readyKm (DayAddPanel
    ~119, ~208), day.readyMadeSub (DayPlanPanel ~117), dayws.walkKm
    (DayWorkspaceChrome ~176), and the hardcoded "~{x} km of {y} km" (DayPlannerTab ~1360).
    Keep km for distance-to-a-town strings (chat.kmAway, chat.townClosest, day.kmAway*),
    but show "{n} min walk" when under 1.5 km.

PAYLOAD (requestAiDayPlan, planner/aiDayPlan.js ~53)
  Extend profile with: companions, startTime, steps, avoidHills, transitOk, moods,
  food, diet[], known, avoidCrowds, weather: {rain, hot}, and a top-level
  mustInclude: ideas (name, lat, lon, candidate id when matched, timeOfDay).
  Ensure every idea that matched a POI is in candidates with mustSee:true, even when it
  would fall outside the top 24 (buildAiCandidates ~25).
  The plan-day Supabase Edge Function source isn't in src/. Find it (search the repo and the
  parent folder for "plan-day", e.g. supabase/functions/plan-day). If found, update its
  prompt to (a) always include mustInclude stops, respecting timeOfDay, (b) keep total
  walking under steps, (c) honour companions/startTime/food/diet. If NOT found, stop and
  tell me. Meanwhile, encode the new fields into freeText so the current function still
  benefits.

RESULT SCREEN
  Stats line: "7 stops · ≈ 11,000 steps · back around 18:30".
  Keep the refine NUDGES and change "Less walking" to "Fewer steps".
  Mobile: the route map preview is 40vh, the stop list below, "Import onto my map" in a
  sticky footer.

Remove now-unused keys (chat.qFocus, chat.dist2/5/9/15, chat.qTerrain, chat.qDayLength)
from all locales once nothing references them.
```

### Prompt D6: "Build it myself": recommendations around the stay, with Carta to finish

```
The manual landing (DayPlannerTab.jsx ~3024-3300) is map-first: a search box, 4 filter
chips, DayExploreMap (clamp(480px,68vh,760px)), a 400px side panel and a picks list, then
"Start planning". It feels unstructured. Replace it with a guided builder.

LAYOUT
  Header: start-point banner (photo of the nearest town, name, date, "Change").
  Filter chips (sticky under the header, horizontal scroll on mobile):
     All · Sights · Beaches & lakes · Nature & trails · Activities · Food · Towns nearby
  A List | Map toggle. Mobile defaults to List. Desktop ≥1100px shows list left (min 520px)
  and map right, in sync (hover card → highlight pin; tap pin → scroll card into view).
  The search input moves to a search icon in the header that opens a full-width field.

RAILS (List view, "All" filter; each rail is a PlannerSection, horizontal scroll-snap cards
on mobile, a 3-column grid on desktop with "Show more")
  1. "Your ideas": from D4, if any (already in the tray)
  2. "Top sights near you": explorePois cat sight, isMustSee first, sorted by poiScore
     then distance
  3. "Beaches & lakes": loadBeaches(cc) / loadLakes(cc) rows within 40 km of the stay
     (the haversine + sort pattern from DestinationsTab ~1763), with the bathing water badge
     when present
  4. "Nature & trails": loadTrails(cc) within 30 km (tripCentre/bboxCentre from
     lib/trailCards.js), showing km_len and ascent_m, good for hikers and trail runners.
     Then nature POIs.
  5. "Things to do": the nearest destination's dossier `do` items (DestinationPage uses
     them, with useDoPhotos) plus active POIs
  6. "From your shortlist": useShortlistPoints(favorites) within 40 km, snapped to POIs as
     in shortlistDeck (~812-838)
  7. "Towns worth the trip": exploreTowns (~2097) with travel band (lib/regions bandChip)
     and rating
  8. "On this day": dossier festivals whose dates or month match the chosen date (only if
     any)
  Filters show a single full list for that category instead of rails.

CARD
  Photo (HeroImage/FeaturePhoto 4:3, 330/500 srcSet), name, ScoreChip, a distance line
  ("12 min walk" under 1.5 km, otherwise "8 km · ~15 min drive"), and a round [+] button
  (44px) that toggles into the tray with a check state. Tapping the card body opens a
  SheetShell detail: bigger photo, description (desc / knownFor / dossier fact), rating,
  "Open full page" (DestinationPage via openDetail, or beach/trail pages via
  App.openFeature(layer, ref)), and Add to day.

DAY TRAY (the key interaction)
  Mobile: a sticky bottom bar above the bottom nav:
     "3 places · ≈ 8,500 steps"   [ Let Carta plan the rest ]  [ Open my day ]
  Tapping the bar expands a sheet with the picked list (reorder with ↑/↓, remove).
  Desktop: a right column card with the same content.
  Steps estimate: optimizeOrder from the stay plus haversine × 1.25 street factor → steps.
  "Open my day" = the existing startExplorePlanning (~2371).
  "Let Carta plan the rest" = open the Carta bot (D5) with ideas = tray items as
  mustInclude, and skip questions already implied (mood, town). The generated plan must
  keep every tray item.
  The "Let Carta plan the rest" button is ALWAYS visible, even with 0 picks (then it reads
  "Let Carta plan my day").

Remove: the old .day-explore-side briefing panel, and CartaGuidePanel if its mood/range
logic is fully absorbed by the filters (check other usages first). Keep DayExploreMap for
the Map view, restyled to match the trip map (T2): muted basemap, pins by category colour
(--kind-* tokens), the selected pin in accent.

Performance: rails load lazily as they scroll into view (IntersectionObserver). Layer
loaders are cached. Nothing blocks the first paint of rail 2.
```

### Prompt D7: How step: a clear choice

```
Step "How do you want to plan it?" (DayPlannerTab.jsx ~2874-2922, .day-flow-cards CSS
~15869-15954). The two cards are ~279px wide inside a 640px .day-flow-split, and
.day-flow-split-wide has no CSS rule, so they read small.

1. Add the missing .day-flow-split-wide rule: max-width 920px.
2. Cards: min-height 220px desktop, 150px mobile; padding var(--space-6); title 20px
   display; sub 14px; icon 52px. The whole card is the button, with a visible focus ring.
3. Content (rename to match D5/D6):
   Card 1 (recommended): "Let Carta plan it", sub "Answer up to 6 quick questions and get
   a walking route". Points: "A full day in about 30 seconds" · "Fits your steps, time and
   food" · "Change anything after". If ideas exist: "Includes your {n} idea(s)".
   Card 2: "Build it myself", sub "Browse the best places around {town} and pick". Points:
   "Sights, beaches, trails and towns nearby" · "Photos, ratings and distance" · "Let Carta
   finish it any time".
4. Add a tiny preview image at the top of each card (a mini route line SVG / a 3-thumb
   collage from the top nearby POIs) so the difference is visual.
5. Mobile: stacked, full width, the recommended card first, no horizontal clipping.
```

---

## PHASE D: Integration

### Prompt I1: Hand-offs between tabs

```
Wire the planners into Destinations, Explore and favourites using the existing App.jsx
handlers (goToTab ~234, openDetail ~539, openTripInPlanner ~445, openFeature ~466,
planDay ~566, toggleFav ~488).

Add these entry points (each is a button or link using existing components):
1. DestinationPage (browse/DestinationPage.jsx):
   - "Plan a trip here" → Trip tab, Where step with the destination's country preselected
     (new App handler openTripForCountry(iso2), passed as pendingTripSeed to TripPlannerTab,
     same pattern as pendingSharedTrip).
   - "Plan a day here" → Day tab with stayPoint = the destination's city_lat/city_lon
     (fall back to lat/lon) and landingStep 'when' (new pendingDaySeed prop on
     DayPlannerTab).
2. Trail / Beach / Lake / Mountain pages: "Add to a day plan" → Day tab with stayPoint
   near the feature and ideas = [that feature] (D4 model), landing on 'when'.
3. Explore cards / DestinationPage favourite star: no change, but favourites now feed:
   Where badges (T8), the Trips order (T5), the country brief shortlist fold (T4), day
   ideas suggestions (D4) and the day rail "From your shortlist" (D6).
4. Trip planner planned view → "Plan your days" (T8.6). Day planner workspace top card →
   "Back to trip" when the plan came from a saved trip (planId set).
5. TripPage opened from the planner uses primaryAction "Choose this trip" (T5). Opened
   from Destinations it keeps "Open in planner", which now lands on Getting there with legs
   prefilled (T8.5).
6. URL: add optional deep-link params for the seeds (e.g. tab=trip&cc=BE, tab=day&dest=<id>)
   in lib/urlState.js OWN_KEYS so the hand-offs are shareable and survive reload.
List every new prop and handler in your summary.
```

### Prompt I2: Traveller types, end to end

```
Carta must work well for three core traveller types. Walk through each scenario in the
running app and fix whatever breaks or feels off. Change code only where the scenario
exposes a real gap.

A. Budget backpacker: origin CRL, 7 nights in October, no fixed destination.
   Where quiz: Hidden gems + Hiking, Shoestring, Fly then trains & buses, A few stops.
   Expect: recommended countries lean to budget_level low/mid with real reasons; the Trips
   list favours rail/bus trips; the Getting there step suggests cheap airports and shows the
   Google Flights Explore link; stays use the 'budget' tier (hostels/private). Day
   planner: Normal steps, Quick bites + Cheap eats, and free sights ranked up where data
   allows (POIs with no fee or parks).

B. Hotel/comfort couple: 5 nights in May, Beach & relax + Food & wine, Hotels & comfort, Fly.
   Expect: coastal countries with best months fitting May; hotel tier 'hotel4' pricing on
   Finish; the day planner defaults to Partner, Late start, Easy steps, Sit-down lunch.

C. Trail runner: 4 nights in September, Trail running + Road trip, Smart mid-range,
   Keep moving.
   Expect: countries ranked by trails + mountains counts, with numbers in the reasons; the
   country brief "Hiking & trail running" rail is first; the day planner's "Nature & trails"
   rail shows trails with distance and ascent; the bot with mood Active and Big day steps
   produces a route including a trail.

For each scenario, save 375px screenshots of every step to shots/scenarios/<A|B|C>/, and
write a short findings list. Fix blocking issues, and list the non-blocking ones for me.
```

---

## PHASE E: QA

### Prompt Q1: Mobile and desktop screenshot audit script

```
Create scripts/shoot-planners.mjs using Playwright (a devDependency; don't run playwright
install if a browser is already present). Against `npm run dev` (or a --url argument), it
captures:
  Trip planner: each wizard step (Booked, From, When, Where both tabs + quiz answered,
  brief open, Trips, TripPage from planner, Getting there, Finish, planned view)
  Day planner: Start point, Continue-a-trip sheet, When, Ideas (yes with 2 ideas), How,
  bot at question 3, bot result, Build it myself (list, map, tray expanded)
at 375x812 (mobile UA, touch) and 1280x800, saved to shots/planners/<viewport>/<name>.png.

On every screen, also assert and report:
  - document.documentElement.scrollWidth <= innerWidth (no horizontal scroll)
  - every visible button/a/[role=button] is at least 44x44 on mobile (list offenders
    by text)
  - no console errors
  - sticky footers don't overlap the last focusable element
Use the ?*mock seams in lib/e2eSeams.js for data/auth where needed. Add
"shoot:planners" to package.json scripts. Run it and give me the offender list.
```

---

## Appendix: research notes behind these prompts

**Day-plan question order.** Good local guides, and the stronger AI planners compared in 2026
reviews (Layla, Mindtrip, Wanderlog), converge on the same pattern: settle fixed anchors
first (where you are, when), then hard constraints (who's coming, time window, how much
walking), then preferences (mood/interests, food), and only then optional extras. Asking
interests first (the current order) produces plans that fail on time or energy. Questions
that can be inferred (forecast, town from a named place, events on the date) should be
skipped, not asked.

**Steps instead of km.** Adults take roughly 1,250–1,550 steps per km at a comfortable
pace. About 1,300–1,400 is typical, which is why `STEPS_PER_KM = 1350` is used, rounded to 500
for display (getsteps.app, omnicalculator). Keep km internally for the routing and AI
contract.

**Google Flights.** Google Flights accepts a natural-language `q` parameter on
`google.com/travel/flights`. Explore (`google.com/travel/explore`) shows a price map from an
origin and is most useful with flexible dates. Neither format is officially documented,
which is why prompt T7 makes Claude Code verify the links in a real browser.

**Trip-type taxonomy.** The Where quiz groups (Unwind / Explore / Active / Who-how) mirror the
data Carta already publishes (beaches, lakes, trails, mountains, cycling, heritage and food
categories, country insights). Every recommendation reason can then cite a real number
instead of a generic claim.

**Issues confirmed on the live site (17 Sep 2026)**
- After choosing a trip, "Your trip" and the legs render ~3,700px below the top of the step.
- Ready-made trips show the same route at 5, 6 and 7 days as separate cards.
- A stop label shows "Paris (CDG)", and "Paris" appears in a trip's sights list.
- The Where step titles sit directly on the content below them.
- The Day planner landing shows the "popular city" chips (Rome 9.8, Paris 9.6, …) to
  signed-out users with no other guidance.

Sources: [getsteps.app: steps per km](https://getsteps.app/blog/how-many-steps-in-a-kilometer),
[Omni steps-to-km](https://www.omnicalculator.com/sports/steps-to-km),
[Going: Google Flights Explore](https://www.going.com/guides/google-flights-explore),
[Layla: AI trip planner tier list](https://layla.ai/blog/news-and-tips/ai-trip-planners-tier-list),
[Voyaige: Wanderlog vs Layla](https://voyaige.to/blog/best-ai-travel-planner-2026).
