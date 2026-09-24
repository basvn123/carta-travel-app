# Carta, Destinations enhancement spec

Scope: the five non-trip categories in the Destinations tab, **Trails, Cycling, Beaches, Lakes, Mountains**. The Trips category is covered by `carta-trips-enhancement-spec.md` and is not repeated here, but every rule in that document that is about *how a page behaves* (progressive disclosure, flashcards, icon grid, info dots, one primary button, mono for measured facts, honesty about coverage) is assumed to apply here too and is only restated where a section needs it differently.

What I checked: the built wire in `continent-app/dist/{trails,cycling,beaches,lakes,mountains}/*.json` across every country file, the five browse pages (`BeachPage`, `LakePage`, `MountainPage`, `CyclePage`, `TrailPage`) and their story libs, the category switch in `DestinationsTab.jsx`, and the design system in `.claude/skills/carta-design`. Then a web research pass per section on data sources and on what the best products in each field actually show.

Each item is: **title -> what to do and why.**

---

## Part 0. What the data actually says

This is the honest state of the five sections as built. Every number is counted from the shipped JSON, excluding the `top.json` roll-up files.

| Section | Published rows | Rows with no image | The shape of the problem |
| --- | --- | --- | --- |
| Trails | 17,619 | 14,065 (**79%**) | Huge but unrecognisable. Names are raw OSM tags. Famous walks missing. |
| Beaches | 2,746 | 50 (2%) | Good images, wrong geography. Spain 648 and Albania 5. |
| Lakes | 1,681 | 45 (2%) | Good images, wrong selection. Finland 34, Germany 182. |
| Mountains | 740 | 43 (6%) | An order of magnitude too small everywhere. |
| Cycling | 506 | 0 | **Italy 0. Iceland 0. Bosnia 0. North Macedonia 0.** Greece 1, Bulgaria 1, Lithuania 1, Spain 12, France 19, Great Britain 110. |

Two conclusions, and they point in opposite directions, which is why one enhancement plan cannot cover all five.

**Trails has a recall problem.** 17,619 rows and still no Ruta del Cares, no Sentier des Roches, no Orla Perć, no Laugavegur, no Hardergrat, no Pico Ruivo. The catalogue is full and yet the thing a user searched for is not in it.

**Cycling, Mountains, Lakes and Beaches have a selection problem.** They are small, and what is in them was chosen by whatever OSM and Wikidata happened to hold, not by what a traveller would want. Cycling at 506 routes for a continent is not a catalogue, it is a sample. Mountains at 740 is less than the number of named 2,000 m peaks in the Alps alone (1,599 with P≥300 m). Finland with 34 lakes is a rounding error against its 56,000 mapped lakes and ~300 designated bathing sites.

The fix for the first is a registry and a second ingest pass. The fix for the other four is a **candidate pool plus a scored gate**: pull everything, publish a quota, and be able to say why each one is in.

---

## Part A. Rules that apply to all five sections

These come first because five sections that each solve navigation and imagery their own way is how the tab starts to feel like five different products.

### A1. One card grammar, five fillings

Every card in Destinations, whatever the category, is the same object: **visual band, title, one-line hook, a mono stat row of exactly three values, and up to three terrain icons.** What changes per section is only which three stats sit in the mono row.

| Section | Stat 1 | Stat 2 | Stat 3 |
| --- | --- | --- | --- |
| Trails | distance | ascent | time |
| Cycling | distance | % traffic-free | surface headline |
| Beaches | water quality class | swim months | walk-in minutes |
| Lakes | swim season | altitude | area |
| Mountains | height | how you get up | prominence |

Three is the number because it is the most a person reads at a glance in a grid, and because a fixed count is what makes a grid scannable. Today the trail cards carry five or six values in a cramped strip and the eye has nowhere to land. Do not let a section add a fourth "because this one really needs it": if a fourth value matters, it belongs on the detail page or in the hook sentence.

### A2. The title rules, applied to all five

This is the complaint you raised about trails and it is not only a trails problem. `EuroVelo 6 - part Austria - leg 3 common (Ottensheim - St. Georgen)` is a cycling title. `Theth - Grag - Corrs` is a trail title. Both are raw data leaking into the interface.

Apply this ladder, in order, and stop at the first rule that produces something:

1. **Wikidata / Wikipedia label** in the user's language, where the row has a `wikidata` tag. This is what gives you "Orla Perć" and "Laugavegur" spelled the way the world spells them.
2. **The source name, if it is a name.** Test: contains at least one word of four or more letters, does not start with a digit, is not of the form `<word> <number>`. 1,295 of your trail names and a large share of cycling names fail this test.
3. **From → to**, built from the OSM `from`/`to`/`via` tags where present: `Gavarnie → Refuge des Espuguettes`.
4. **Landmark formula**, for the code-only cases: `<verb> to <nearest named peak, lake, hut or viewpoint within 500 m of the high point or the end point>`. This turns `Happurg 3` into `Ridge walk to Houbirg`.
5. **Shape plus place**, last resort: `9 km loop near Happurg`.

Then three hard constraints. **Titles cap at 42 characters** and truncate on a word boundary, because that is what fits one line in the card grid; 631 of your trail names are over 55 characters today and they wrap to three lines. **The original source string never disappears, it becomes a mono `ref` chip** next to the title, so a local user who is matching waymarks on a signpost can still do it. And **the region never goes in the title**, it goes in the subtitle line under it.

For cycling specifically, the parent route is the title and the leg is the subtitle: `EuroVelo 6` with `Austria, leg 3, Ottensheim to St. Georgen` beneath, never both jammed into one string.

### A3. The hero image ladder

You are right that a photo of the wrong thing is worse than no photo, and right that a photo is not always the best card visual. Replace "find a photo or show nothing" with a ladder, evaluated per row at build time, and store which rung was used so you can audit it.

1. **A curated photo**, when one scores well enough. Commons geosearch within a tight radius, the free filters first (reject `depicts` = animal, insect, plant, church, train, car, building, sign; reject "Fauna of…" and "Railway stations…" categories; landscape only, ≥1,600 px, prefer within 500 m of the feature), then the cheap Haiku vision pass on what survives. This is the pipeline already specced in the trail audit and it costs about $25 for the whole catalogue; it applies unchanged to beaches, lakes and mountains.
2. **A terrain render**, when no photo clears the bar. Copernicus GLO-30 elevation plus hillshade, the route or the feature drawn on it, rendered once at build time to a static WebP. Free tooling: `pymgl` (MapLibre GL Native, Python, BSD) or `mbgl-renderer`; terrain tiles from Mapterhorn, or self-host a PMTiles extract of Europe on R2. This is the rung that fixes 14,065 trails and it is not a compromise, it is often the better card.
3. **A route glyph**, for linear features where terrain adds nothing. The simplified geometry, stroked thick, centred on a flat `--panel` field, no basemap. Takes about 40 lines of SVG generation and zero dependencies. Its great virtue on a grid is that 17,000 shapes all look different, and it tells you loop versus out-and-back before you read a word.
4. **A data visual**, for point features with no photo: the 12-cell sea-temperature strip for a beach, the altitude-versus-prominence bar for a mountain, the swim-season bar for a lake. A card that shows real data instead of a stock landscape reads as an instrument, which is exactly the brand.

The rule that makes this work: **never borrow a photo of somewhere else.** Today a trail with no photo borrows the nearest place image and prints "Tirana" on the card. That is a wrong answer dressed as a right one; rung 2 or 3 is honest and looks better.

### A4. Per section, decide what the hero *should* show, not just that it exists

The four rungs are the fallback order. The intent is different per section and should be written into the image brief:

- **Trails:** the terrain the walk crosses, from the walk's own viewpoint. Not the town at the trailhead, not a summit seen from 8 km away.
- **Cycling:** the surface. A photo of tarmac on a route that is 40% loose gravel is the single fastest way to lose a cyclist's trust, and it is the same rule as B2 in the trips spec.
- **Beaches:** the sand and the water entry, shot along the beach so the length is legible. A drone shot of the bay is pretty and tells you nothing about walking into the sea.
- **Lakes:** the shore and the water colour. Turquoise glacial water is the whole reason someone picks one lake over another.
- **Mountains:** the mountain's own profile from a distance for the card, and the view *from* the summit on the detail page. Two different jobs, two different photos.

### A5. The 3D view, and where it earns its place

You like the 3D view and you are right to. What 3D actually adds is that **it makes steepness and exposure legible**, which a 2D line cannot do: it is the difference between knowing Orla Perć is 4.5 km and understanding that it is a knife edge. Strava bought FATMAP for exactly this and PeakVisor built a whole product on stylised terrain renders with no photographs at all.

Use it in three distinct places and nowhere else:

- **As a static render on the card**, rung 2 above. Pre-rendered, no runtime cost, works on a phone on 4G.
- **As a toggle on the detail page**, MapLibre `setTerrain` plus a pitch, 2D by default on mobile and terrain on tap, with `maxPitch` and a tile cap. You already have MapLibre and Mapterhorn, so this is UI work, not a new dependency.
- **As the section hero**, one 3D terrain map per country or region with the features clustered on it, and a Photo ⇄ 3D toggle. Click a cluster, the grid filters to it. This is the thing that makes the tab feel like a map product rather than a list.

Do not put a live 3D canvas in a grid cell. Sixty WebGL contexts on one page is how a mid-range Android phone stops responding.

### A6. Open on the good stuff, not on the alphabet

Right now a user lands on a section and gets whatever sorted first. The opening screen of every section should be built, not defaulted, and it is the same three-band structure in all five:

**Band 1, the icons everyone knows.** Six to nine named features with a real photo, big, before any filter UI: for Mountains that is Mont Blanc, Matterhorn, Zugspitze, Triglav, Olympus; for Beaches it is Praia da Marinha, Zlatni Rat, Cala Mariolu; for Lakes it is Bled, Braies, Plitvice, Hallstätter See. If the section cannot fill this band from its own data, the section's coverage is broken and this band is the fastest way to notice.

**Band 2, the useful cuts.** Four to six horizontal rails with honest titles that answer a real intent, not a genre: "Reachable without a car", "Swimmable in June", "Cable car to the top", "Traffic-free the whole way", "Under two hours from a Ryanair airport". These are computed, not hand-picked, and each is a saved filter the user can open.

**Band 3, the full grid**, with filters. Which is what exists today, and should stay where it is, one scroll down.

The sticky section rail from the trips spec (C9) applies: once the hero leaves the viewport, a thin strip with the band names lets the user jump instead of scroll.

### A7. Say how good the coverage is, per country, in the product's own voice

Every section has countries where it is thin and some where it is empty. A user who filters to Italy in Cycling currently gets nothing and no explanation, which reads as broken software rather than as an honest gap. Two rules:

- Under the country filter, a mono line: `Italy, 0 routes published. OSM maps the Bicitalia network as superroutes, which the importer does not yet read.` Then three nearby alternatives.
- On the section header, the real count and the last build date, not an adjective: `506 routes across 36 countries, last rebuilt 13 Sep 2026`.

This is the same argument as K3 in the trips spec. Stating the gap is what makes the covered parts believable.

### A8. Label derived and estimated values, everywhere

Most of what this document asks you to add is computed, not measured: surface splits inferred from `highway` class, prominence from a 30 m surface model, sea temperature from a climatology, walk-in time from a path length. All of it is legitimate and all of it must be labelled. Use the trips spec's three-value model, `sourced` / `derived` / `estimated`, with a small mono marker, and a per-section footer that states the split. "Surface unknown on 34% of this route" beats a fabricated 100%.

---

## Part B. Trails

Your instruction was coverage first, and coverage here means recall, not volume. 17,619 rows is already more than AllTrails shows for most European regions. The problem is that the rows are the wrong 17,619.

### B1. Build a famous-trail registry per region, from evidence, before touching any UI

For every NUTS3 region and every GMBA mountain range, assemble candidate named walks from four independent sources and store them as `data/trails/famous_registry.json`, one row per trail with name, region, source and an evidence score:

- **Wikidata SPARQL**, `?t wdt:P31/wdt:P279* wd:Q2143825` with `wdt:P625`. Pull `P402` (the OSM relation id, which joins straight to rows you already have), `P2043` length and `P18` image. CC0, no key, free. This is the highest-value single source because it gives you the trail's name in ten languages *and* a licensed photo.
- **Wikipedia pageviews**, the REST metrics API, per article, monthly, summed across language editions. This is your fame ranking and it is what correctly places Laugavegur above `Happurg 3`.
- **OSM `wikipedia` / `wikidata` tags** on both relations and ways, from a Geofabrik extract filtered with `osmium tags-filter`.
- **National open portals** where they exist: Norway's Turrutebasen from Kartverket is the best in Europe and ships GPX, GML and PostGIS under NLOD; Switzerland's Wanderland on opendata.swiss; France's IGN BD TOPO under Open Licence 2.0; refuges.info for huts, springs and summits under CC BY-SA with no key.

Then a **coverage gate in CI**: after curation, every region must either publish its top three registry entries or emit a reason code for each miss, one of `no_osm_data`, `way_only_not_derived`, `failed_continuity`, `below_quota`, `out_of_scope`. The build fails on an unexplained miss. This is the mechanism that means you never again ship a Vosges page headed by a vineyard loop.

### B2. Run the named-ways ingest everywhere, not just in five countries

`ingest_osm_routes.py` reads route relations. `derive_routes.py` reads named ways but only for the countries with no relation culture. That restriction is what makes Sentier des Roches structurally unreachable: Overpass shows about twenty ways named `Sentier des Roches [secteur 1..8]`, every one tagged `sac_scale=demanding_mountain_hiking` and `wikipedia=fr:Sentier des Roches`, and no relation anywhere.

Run the derivation in every country. Chain named ways into one route by **normalised name** (strip `[secteur N]`, `Etappe N`, `Abschnitt N`, `tappa N`) **or by a shared `wikipedia`/`wikidata` tag**. Ruta del Cares and Hardergratweg come back the same way. Tolerate gaps with a snapping radius of about 250 m and mark them as gaps rather than silently joining across them.

### B3. Publish parent pages for stage families

1,635 rows are stages and only 313 parents exist; 540 of 594 stage groups have no parent at all, which is 37,507 km of trail that no page represents. The England Coast Path, the Goldsteig and the GR 5 Vosges are all in the data and none of them is searchable under its own name.

A parent page carries total distance and climb, a stage list with per-stage GPX, and is **exempt from the single-line continuity gate** because it never offers one file. The gate in `curate.py` is right for a GPX and wrong for a parent page: a long path is an itinerary of stages, not one continuous line.

### B4. Compose the walk when the data holds it only as fragments

`carta_compose` already builds 215 city walks. Use the same machinery for a famous walk that OSM holds as unnamed path segments: route between the known waypoints with the Valhalla instance, label the row `source: carta_compose` with its waypoints and a reviewer, and require human approval before it publishes. Provenance order, always visible: harvested relation, then derived way-chain, then composed route. A composed route must never be presented as if it came from an official waymarked relation.

### B5. When it truly is not possible, hand the user the GPX and say so

Your instinct here is right and it should be a designed state, not a failure. For a registry entry that cannot be built, publish a **stub page** with the name, the region, the fame evidence, what is known (length, ascent, season) and an honest line: `No open route data exists for this walk yet. Here is where to get the track.` Then an outbound link, and an "upload a GPX" affordance.

Do the deep-link honestly: **Komoot has no public API** and offers only iframe embeds and a free partner profile; **AllTrails has no developer API** and is bot-protected by DataDome, so ingesting it is both a ToS breach and a database-right breach; **Wikiloc's user GPX is licensed to Wikiloc, not open**. All three are deep-link-only. **Outdooractive is the one commercial route API you can actually buy**, but its terms require view-tracking calls, a specific attribution string and `noindex` on third-party content, which destroys its SEO value. So: link out, never ingest.

The GPX upload path is worth building for another reason. It is the same moderation surface you will need for user photos, and it is the cheapest route to exclusive content.

### B6. Stop asking a photo to carry the card

79% of trails have no photo and a good share of the remaining 21% show a snail, a heron, a moth, a locomotive or an ISS photo of Earth. Apply the ladder in A3, and for trails specifically make **rung 2 the default and rung 1 the exception**: a hillshaded terrain render with the route drawn on it, the elevation sparkline overlaid bottom-left and the grade chip top-right. It is unique per trail, it is honest, it shows the thing the user is deciding about, and it is free to generate once.

Composite recommendation for the trail card: terrain render as the band, route glyph inset at the corner for shape, three mono stats, three terrain icons.

### B7. Fix the five data bugs that are visible to users

These undermine everything else. Mount Korab (9) is stored summit-to-village and shows **+7 m** of climb on a line that drops 1,400 m; orient one-way routes uphill or show both climb and descent. `difficulty: moderate` and `f.g: very_hard` disagree on the same row and the UI prints the second. The Korab (9/1) trailhead is in Radomirë, Albania and the page says "Mavrovo National Park, North Macedonia"; derive the region label from the start point. Highlights render in Macedonian Cyrillic when `name:en` and `name:sq` both exist; prefer `name:en`, then local Latin, then other scripts. And "12.1 km, a comfortable day out" sits next to 1,568 m of climb and a Very hard grade, which is the copy generator ignoring the numbers.

### B8. Derive Underfoot instead of printing "not mapped"

Only 7.6% of Korab's member ways carry a `surface` tag, so the bar shows 92% unknown. The median across the catalogue is 63%, so Korab is the bad tail, not the norm, but mountain routes will always be the worst case. Derive the split from `highway`, `tracktype`, `smoothness`, `sac_scale` and `trail_visibility` plus DEM roughness, using cycle.travel's inference approach (cycleway → tarmac, track → gravel, bridleway → dirt, adjusted regionally), and label the result "estimated". Keep the unknown share visible: an honest 12% unknown is fine, a fabricated 100% is not.

### B9. Sort the listing by fame, not by rating

Of 1,367 regions, the top-rated trail has no photo in 54% of cases, is a stage or a national/international route rather than a local walk in 22%, and has a code for a name in 7%. The rating is measuring data completeness, not desirability. Introduce a **fame score** as the default sort: `0.5·log(pageviews across languages) + 0.2·(has Wikidata item) + 0.15·(named in ≥3 language Wikipedias) + 0.15·(OSM completeness: name, distance, sac_scale, ref)`. Keep the existing rating as a secondary sort the user can choose.

---

## Part C. Cycling

This is the weakest section in the tab and the easiest to fix, because the data exists and the extractor is the bottleneck.

### C1. Italy is zero because the importer does not read superroutes

Italy is not unmapped. The OSM wiki tracks the whole Bicitalia BI-1 to BI-22 network as relations with a completeness percentage per route, and Alpe Adria is at 100%. The near-certain cause of zero is that **long Italian ciclovie are modelled as `type=superroute`** whose members are other relations, not ways, so an importer that reads `type=route` with way members finds nothing. The secondary cause is a continuity requirement that drops partially mapped routes.

Fix: read `type=route` **and** `type=superroute`, flatten superroutes into a parent with stage children, and publish partially-mapped routes with a `state` field rather than dropping them. Green Velo in Poland is a single well-formed OSM relation (id 5141547) and you have one Polish route for every 111 km of it, which is the same bug.

### C2. Group by `cycle_network`, not by `network`

`network=icn|ncn|rcn|lcn` is only a hierarchy level. **`cycle_network`** carries the operator namespace: `EuroVelo`, `UK:National Cycle Network`, `DE:D-Netz`, `IT:Bicitalia`, `BE-VLG:*`, `AT:*`. Group by `cycle_network` plus `ref` plus the parent superroute and you get one `EuroVelo 6` object with country and stage children, which is both the correct data model and the fix for the title problem in A2.

### C3. Ingest EuroVelo directly, it went open in 2024

EuroVelo GPX tracks are explicitly **open data under ODbL** since October 2024, per route and per stage, with two variants: the full route and the developed sections only. That "developed versus planned" flag is itself a field worth surfacing, because it is exactly what a tourer needs to know and nobody shows it. There is no bulk endpoint, so collect the 17 routes' stages from the route pages or ask the EuroVelo Management Team for a feed. Roughly 90,000 km, ODbL-compatible with what you already ship.

### C4. Add the national networks that publish openly

In rough order of value per hour of work:

| Country | Source | Licence | What you get |
| --- | --- | --- | --- |
| Switzerland | ASTRA/SchweizMobil Veloland on opendata.swiss | Open, attribution | National routes 1–9 plus ~60 regional, WMS/WMTS and geo.admin REST, plus a live closures dataset |
| UK | Sustrans NCN on ArcGIS Hub | OGL-style | The NCN with its **own traffic-free / on-road classification**, richer than OSM. Re-cut your 110 GB routes to Sustrans numbering |
| Belgium | Toerisme Vlaanderen cycling node network; Wallonia RAVeL and véloroutes on the Géoportail | Open | ~1,500 km of RAVeL rail-trail, ideal "easy, car-free" product |
| France | ON3V, the national véloroute scheme, on data.gouv.fr | Licence Ouverte | The ~60 numbered V-routes. France has 19 rows today |
| Germany | Radnetz Deutschland per-route GPX; BALM network geodata on request | Open | The 12 D-Routen, though these are also well tagged in OSM |
| Spain | Vías Verdes layer at CNIG | CC BY | ~2,900 km of rail-trail. Spain has 12 rows today |
| Italy | Bicitalia route pages with GPX; the Acquedotto Pugliese official track | Mixed | Fix C1 first, then fill the gaps from here |

Netherlands is the exception: the authoritative Routedatabank is a licensed B2B product, but OSM's node network coverage there is excellent, so use OSM.

### C5. Do not ingest node networks as routes

Knooppunten, Knotenpunkte and points-nœuds in the Netherlands, Belgium, north-west Germany and northern France are not named routes. Each node pair is its own tiny relation with a `ref` like `04-35`. Ingesting them raw would add tens of thousands of three-kilometre fragments and destroy the catalogue. Either build a routable node graph and let users generate their own loop, or leave them out and say so. A "build a loop from node 42" feature is a genuinely good product later; it is not a listing.

### C6. Show what a cyclist actually decides on

Distance and ascent are table stakes. The four things that decide a cycling trip, all derivable from what you have:

- **Surface mix** from `surface`, `tracktype` and `smoothness`, with class-based defaults where the tag is missing and an explicit unknown share. Render as one 100%-wide stacked bar with kilometres per class, the way Komoot does. Your `paved` fraction is already computed; this is making it legible and honest.
- **Traffic exposure** from `highway` class plus `maxspeed` plus the presence of a parallel segregated cycleway: % traffic-free, % quiet lane, % main road. Sustrans has this natively for Great Britain. This is the single most decision-relevant number for a family or a nervous rider, and your `safe` score already gestures at it without showing its working.
- **Gradient**, not just total ascent. Sample Copernicus GLO-30 every 25–50 m: max gradient, and kilometres above 4%. Total ascent hides a 12% wall.
- **Logistics**: stations within 2 km of the line, whether it is a loop (`roundtrip=yes` or start/end within 2 km), longest gap without water or a shop, bike shops, campsites, e-bike charging. "Ends 40 km from a station that takes bikes" kills a trip, and no open dataset holds national bike-carriage rules, so curate that one table by hand from Seat61 and the national operators.

### C7. Difficulty per bike type, not one number

Komoot rates difficulty separately for Bike, Road, Gravel, MTB, **E-Bike** and E-Road, because an e-bike changes the answer on the same route. Your `bike` field already guesses a type; turn it into a small matrix instead, and default the display to whatever the user last picked. Bikepacking.com's three-axis model is the other one worth copying: technical difficulty, physical demand, and **resupply and logistics** as a separate axis, because the third is what touring sites always omit and what you can compute for free.

### C8. Prevailing wind by month, as the differentiating module

Nobody shows this and it matters enormously on a long flat route. Take the Global Wind Atlas or ERA5 monthly means, compute the dominant direction against the route bearing, and print one line: `Ride west to east in May, the wind is behind you 6 days in 10.` For EuroVelo 6 or the Danube that line is worth more than any photograph.

### C9. Cards for cycling: the route glyph plus the surface bar

Cycling is the section where the photo matters least and the data visual matters most. Card band: the route glyph on `--panel`, with the surface stacked bar as a 6 px strip along the bottom edge and the elevation sparkline behind it at low opacity. Mono row: distance, % traffic-free, surface headline. It will read as a specification, which is what a cyclist is looking for.

---

## Part D. Beaches

Images are good here and the detail page is already the strongest of the five. The problem is that the list is Iberian.

### D1. Rebuild the candidate list on the EEA bathing water dataset

The Bathing Water Directive dataset is the spine and it is exactly what you need: **22,010 designated bathing waters in the EU-27 for the 2025 season, 14,861 of them coastal**, plus 119 in Albania and 160 in Switzerland. Every row carries a stable `bathingWaterIdentifier`, the national name, water category, NUTS region, **coordinates**, and **a classification for every season from 1990 to 2025**. Bulk download as XLSX from the EEA Datahub, **CC BY 4.0**, commercial reuse allowed with attribution.

That single file takes Greece from 178 to roughly 1,600 defensible sites, Italy from 176 to several thousand, Albania from 5 to 119. Join each EEA point to the nearest OSM `natural=beach` polygon within about 300 m to pick up geometry, `surface`, `nudism`, `dog`, `wheelchair` and services.

Montenegro and Bosnia are not in the dataset because they do not report to the EEA, so those two need national sources or stay honestly thin.

Realistic target after the join: **18,000 to 20,000 coastal rows, of which 6,000 to 8,000 deserve a full detail page.**

### D2. Show the water quality history, because you will be the only one who does

You have, free, a per-site classification going back to 1990. Render the last ten seasons as a **ten-cell horizontal strip**, one cell per year, coloured on the official EEA scale (excellent, good, sufficient, poor, not classified), about 90 × 12 px so it fits on the card. A beach that has been excellent for a decade and a beach that was poor twice in the last three years currently look identical in your product. Nobody else shows the trend; Blue Flag and Tripadvisor both show a single badge.

Use the EEA's own colour semantics so the badge reads as the official scale rather than as a Carta invention.

### D3. Sea temperature by month, as the swim-season answer

Sample Copernicus Marine's OSTIA L4 reanalysis at the nearest sea pixel and store **twelve integers per beach**. Render as twelve small vertical bars with a **threshold line at 20 °C**, bars above it filled and below it hollow, only the current month labelled. The same array drives the one-line summary on the card: `swimmable Jun to Oct`. This is one build-time job and it answers the question people actually type into a search box.

### D4. Beach orientation, the cheapest distinctive feature in this document

Take the beach polygon or the coastline segment and compute the outward normal azimuth. West to north-west facing, 250° to 320°, is a sunset beach. East facing gets morning sun and afternoon cliff shade. North facing in the Mediterranean is exposed to the Mistral and the Tramontana.

Render it as a 24 px compass rosette with a filled wedge, and a small sun glyph on the wedge when it faces sunset. It costs one geometry calculation, it is unique per beach, it is instantly understood, and no beach directory in Europe does it.

### D5. Walk-in time and descent, instead of "difficult access"

Measure the path from the nearest parking or road to the beach polygon, take its length and its elevation delta from Copernicus GLO-30, and print `8 min walk, 60 m descent, steps`. This is the highest-value derived field after water quality, because the difference between a beach you park at and a beach that is a twenty-minute scramble down a cliff is the entire decision for a family. Render as a tiny 60 × 16 px descent wedge with a minutes badge.

### D6. Wave exposure, which splits the swim beach from the surf beach

Copernicus Marine's wave products give you mean significant wave height per month. Derive **% of days with Hs > 1 m** and you have, in one number, the distinction between a calm family bay and an Atlantic surf beach, plus a free kite-and-surf filter. Show it as a two-tone sparkline with a shaded calm band under 0.5 m.

### D7. The three-strip detail page, aligned on one month axis

Stack the sea-temperature strip, the wave strip and a crowding estimate strip as three twelve-cell rows on the same month axis. Reading down a single column answers "what is August like here" in one look. That alignment is the signature of the page and it costs nothing extra once the three arrays exist.

Crowding has no open source, so estimate it from population within 10 km, parking capacity divided by beach length, hotel count nearby and Commons photo density, present it as three bands (quiet, busy, packed), never a number, and label it `estimated`.

### D8. Blue Flag as a badge with a year, not as a dataset

Blue Flag has no bulk download and no open licence. Spain had 747 flags in 2024, Greece 624 in 2026, Italy 525 beaches plus 87 marinas and 23 lakes. Treat it as a per-country scrape refreshed annually, stored as a boolean with a year stamp, and rendered as a small chip that says `Blue Flag 2026`. A badge with no year is the kind of claim that quietly goes stale.

### D9. Surface as a mix, not three competing booleans

Sand, pebble and rock is a spectrum and many beaches are two of them. One six-segment bar running sand-beige to pebble-grey to rock-slate with a marker at this beach's position, plus a 40 × 40 px texture swatch cropped from a Commons photo. OSM `surface` covers maybe half of them and Spain's MITECO Guía de Playas covers ~3,500 Spanish beaches with composition, length, width, occupancy, access type and parking, so Spain can be near-complete.

---

## Part E. Lakes

Lakes is the section with the clearest curation problem: Germany has 182 rows and Finland has 34, which is backwards.

### E1. Build the pool from HydroLAKES, publish from a scored gate

**HydroLAKES v1.0** gives you 1.4 million lakes worldwide above 10 ha as polygons, CC BY 4.0, with area, shoreline length, average depth, volume, residence time, elevation, and a `Lake_type` flag for natural versus reservoir versus controlled. Europe's share is roughly 250,000 to 300,000 polygons. **GLOBathy** adds modelled maximum depth and a depth–area–volume curve keyed on the same `Hylak_id`, also CC BY 4.0.

That is the pool. Do not publish it. Publish a quota per country, chosen by a gate:

**Hard anchors, any one of which admits a lake:** it carries at least one EEA-designated bathing site; or it has a Wikipedia article in two or more languages; or it is 5 km² or larger, or sits inside a national park or a Natura 2000 site.

**Then rank within the quota** on: log Wikipedia pageviews across languages; Wikidata sitelink count; Commons photo density within 2 km via the MediaWiki geosearch API; bathing-site count and best classification; OSM amenity density within 500 m of the shore (beach, swimming area, boat rental, slipway, marina, alpine hut, ferry route, shore path length); and access distance to parking, a station or a bus stop.

**Add a diversity penalty**: cap three lakes per 50 km cell. Without it, Italy returns twenty Lombardy lakes and Slovenia returns Bled five times over.

Finland's quota should be filled from Järviwiki, which auto-generates a page for every Finnish lake over 1 ha (about 56,000) under CC BY 4.0, with citizen observations of water temperature, cyanobacteria blooms, ice-on and ice-off, and Secchi clarity. Norway's NVE Innsjødatabase holds about 243,000 lakes under NLOD. Sweden's SMHI SVAR holds about 95,000.

### E2. Use the inland half of the EEA bathing water dataset

Of the 22,289 designated bathing waters in 2025, **7,428 are inland** and about 84% of those are lakes, so roughly **6,200 lake bathing sites** with coordinates, names and classification. Germany alone has 1,893 lake bathing waters. The field to filter on is `specialisedZoneType = lakeBathingWater`.

This does three things at once: it is your recall anchor, it is your "is it actually swimmable" answer, and it gives you the same ten-year quality strip as the beaches section, which is how the two sections end up feeling like one product.

### E3. Compute the swim season and make it the headline number

Take the Copernicus Lake Surface Water Temperature product (1 km, 10-daily, Sentinel-3, 2016 onward) or ERA5-Land's lake temperature variable, count the days at or above 18 °C, and you have a real number: `swim season 71 days, Jun 20 to Aug 30, peak 21.4 °C`. Validate against Switzerland's BAFU stations and against Järviwiki's citizen readings.

This is the single most useful derived field the lakes section does not have, it is directly sortable ("longest swim season"), and it explains at a glance why an alpine lake at 1,800 m is 14 °C in August. Render as the same twelve-cell month strip as beaches, with cells at or above 18 °C filled.

### E4. The depth-versus-area glyph, so a mountain tarn and the Bodensee fit on one grid

A 12 ha Bergsee and a 536 km² lake cannot share a linear scale. Draw a small wedge whose width is √area and whose height is max depth on a shared log scale. It sits in the card's stat area, it is unique per lake, and it encodes two numbers that people genuinely compare. On the detail page, expand it into the hypsometric cross-section from GLOBathy's depth–area–volume curve, which is far more honest than a single "max depth 169 m".

### E5. Shore walkability, computed from OSM

Buffer the shoreline, measure the length of `highway=path|footway|track` inside the buffer, divide by the shoreline length: `68% of the shore has a path`. Render as a small donut or as a ring drawn around the shoreline glyph. This is what decides whether a lake is a place you walk around or a place you look at from a car park, and nobody publishes it.

Pair it with the shoreline development index, `Shore_len / (2√(π·area))`, straight out of HydroLAKES. A high value means a fjord-like, many-bayed shore, which correlates strongly with an interesting shore walk.

### E6. Motorboats, altitude and colour, the three things that change the feel

- **Motorboat rules** are mostly national or regional law, not per-lake tags. Austria and Bavaria ban combustion motors on most lakes. Encode as a country/region rule with per-lake overrides, and show it as a single icon, because "no motorboats" is exactly what someone looking for a quiet swim wants to know.
- **Altitude** comes free from HydroLAKES. Show it as a tiny 0–3,000 m ribbon with a tick, colour-banded lowland, mid, alpine.
- **Turquoise glacial colour** is the reason someone picks Braies over the lake next to it. Derive it from a Sentinel-2 green-to-blue reflectance ratio, or approximate from `Lake_type` plus elevation above 1,500 m plus a glacier in the catchment. Even the approximation, labelled `estimated`, is worth a chip.

### E7. Keep the hazards field and add algae

You already carry hazards, which is more than most lake directories do. Add blue-green algae as a seasonal warning where a source exists: Järviwiki for Finland, the Länder atlases for Germany. There is no pan-European feed, so state coverage honestly rather than showing an empty field on 1,600 lakes.

---

## Part F. Mountains

740 rows for a continent. The Alps alone hold 61,584 named peaks and 1,599 two-thousanders with 300 m of prominence. This section needs both more rows and a different unit.

### F1. Three entities, not one

A traveller asks "which mountain area do I go to", then "which lift or viewpoint do I ride", and only sometimes "which summit do I climb". Every good mountain product is three-tier: PeakVisor is range → subrange → peak, SummitPost is areas and ranges above mountains above routes, Outdooractive makes huts and cable cars first-class pages, and Switzerland Tourism sells the mountain *railway*, not the mountain.

Build:

- **MountainArea**, the primary browse unit, roughly 250 to 400 across Europe, keyed on GMBA ids (which you already carry) but **labelled with SOIUSA or AVE names**, because those are what hikers actually use: SOIUSA has 36 sections and 132 subsections for the Alps, AVE is what Austrian and German hikers say out loud. GMBA is a science delineation, good for polygons, poor for names.
- **Mountain**, your existing row, expanded.
- **Viewpoint**, a new lightweight entity: lift top stations, passes, panorama terraces, rack-railway summits. This is what most of your traffic actually wants, and it is the one thing none of the competitors publish openly.

The MountainArea hero is the range polygon with peaks, huts and lift top stations plotted as three distinct mark types. That view, "which area do I go to", is the thing nobody outside PeakVisor does well.

### F2. Target 3,000 to 5,000 mountains, from named lists plus computed prominence

Not 740, and not 60,000. Assemble:

- All **126 European ultras** (P ≥ 1,500 m) as an editorial checklist from peaklist.org, so you can verify you have every one.
- All **82 Alpine 4,000ers** (Switzerland 48, Italy 38, France 25 by the UIAA list).
- All **416 Alpine 3,000ers with P ≥ 300 m**, and as much of the 1,599 two-thousander list as the quota allows.
- Every national and regional highpoint.
- Every peak with a lift, rack railway or road pass reaching it or near it, roughly 600 to 900 in the Alps alone.
- The British lists, curated rather than complete: 282 Munros, 222 Corbetts, and a selected few hundred of the 2,009 Marilyns. Great Britain currently has 59 rows against 282 Munros.
- The Tatra, Balkan, Pyrenean, Scandinavian, Icelandic and Canarian equivalents.

For prominence, do not rely on Wikidata's `P2660`, which is thinly populated. **Andrew Kirmse's `akirmse/mountains` is MIT-licensed C++ that computes prominence and isolation directly from Copernicus GLO-30**, and his published worldwide dataset holds about 7.8 million peaks with prominence above 100 ft. His 2023 GLO-30 re-run found 24% more P300 peaks than the previous SRTM pass. One caveat he states himself: values under about 300 ft outside the US are unreliable because GLO-30 is a surface model that includes trees and buildings, so set your floor above that.

### F3. "How you get up" as the primary badge, computed not curated

For a travel app this is the most decision-relevant attribute in the whole table, and it is fully derivable from OSM: `aerialway=cable_car|gondola|chair_lift|funicular`, `railway=funicular`, `railway=rack`, `aerialway=station`, plus `mountain_pass=yes` on a road way and the highest road node within a radius.

Derive a four-value field: **drive-up / lift-up / hike-up / technical**. Then render it as a four-slot icon row, filled or ghosted, with the vertical metres left on foot after the last mechanical assist: `cable car to 2,600 m, then 340 m on foot, T3`. That replaces your hand-curated `lift` field with something that works across all of Europe, and it is the badge that belongs on the card.

For the lifts themselves, OpenSkiMap publishes OSM-derived ski-area and lift GeoJSON dumps under ODbL, and OpenSkiStats publishes per-area computed metrics under CC BY 4.0.

### F4. The horizon silhouette, your signature asset

Compute the horizon from the summit on Copernicus GLO-30 (for each azimuth, walk the ray and track the maximum elevation angle), then intersect it with your own peak table to name what sets the skyline. Render as a static SVG polyline with five to eight labelled peaks and their distances.

This is unique per mountain, cheap to generate once, works in dark mode, compresses to a 60 px card footer with three labels, and it is exactly what PeakVisor and udeuschle.de charge for. udeuschle documents its method openly: refraction coefficient 0.13, sight range to 750 km, labels from OSM and GeoNames. HeyWhatsThat is the other reference implementation. Neither is open source but the algorithm is trivial.

It also answers the only question that matters on a mountain page for a traveller: **what will I actually see from up there.** Gornergrat is sold on "29 peaks above 4,000 m", not on its own height.

### F5. Make the view score objective with a viewshed

Your `views` component is currently 0.324 on the Dachstein, which is a number with no visible reasoning. Replace it: run GRASS `r.viewshed` on GLO-30 from the summit, take total visible area within 100 km, and add 360° horizon openness from `r.horizon`. A cheap proxy that correlates well, if the full viewshed is too slow for 5,000 peaks: elevation minus mean elevation within 20 km, combined with prominence. Either way, print the reasoning: `sees 3,100 km² within 100 km, open in 340° of 360`.

### F6. The altitude-versus-prominence glyph

A small vertical bar where the total height is elevation and the solid portion is prominence. A 1,000 m hill with 950 m of prominence reads instantly as a real mountain; a 3,000 m subsidiary top with 60 m of prominence reads as a bump on a ridge. It is the best way to explain prominence without a paragraph, it sits in the card stat area, and it makes your lists defensible.

Add the comparison scale bar on the detail page: this mountain's profile next to Mont Blanc at 4,808 m, or next to the highest peak in the reader's own country if you know their origin airport, which you do.

### F7. Comparative rankings, free and disproportionately engaging

You already store range, country and height. `3rd highest in the Julian Alps`, `17th highest in Austria`, `highest point of the Dachstein Mountains` are three fields of pure sort-and-count, and PeakVisor leads with them because people read them. Add them.

### F8. Snow line and lift window as one strip

Twelve cells, colour-coded snow / shoulder / clear at summit altitude, with the lift's operating window drawn over it as a bracket. It answers "can I actually do this in April" in one glance, and the answer is often no in a way the current page does not communicate. Derive the snow band from elevation, aspect and latitude and label it `estimated`; lift opening dates are not open data, so link to the operator rather than guessing.

### F9. Link out for live conditions, do not try to own them

Lift prices, hut booking availability, avalanche status and current webcams are not derivable and go stale fast. Bergfex already does live weather, webcams and snow across the Alps; foto-webcam.eu runs 400+ high-resolution Alpine cams on a stable URL pattern (check their terms before hotlinking); Panomax and Roundshot do 360° panoramas. A "check conditions" row of three outbound links is honest and useful. A stale price printed as fact is not.

---

## Part G. The item page skeleton, shared by all five

All five detail pages should stack in the same order, so a user who learns one has learned all five. Only the module contents change.

1. **Hero**, with the title, the ref chip, the region breadcrumb and the three-value mono stat row overlaid on the lower third. Nothing else. This is C1 from the trips spec.
2. **The one-sentence hook** with a verb or a number in it: `A hanging valley trail that gains 1,568 m in 12 km to a 2,764 m summit on the Albanian border.` Not the 130-word summary.
3. **Who this is not for**, two lines, in the user's interest. `Not for you if you are uncomfortable on loose scree, or if you want to be back by lunch.` Nothing on the site currently does this and it is the fastest trust-builder available.
4. **The map**, sticky in a 60/40 grid on desktop, stacking under the hero on mobile, with the 3D toggle and a flyover for linear features.
5. **The measured module**, section-specific: elevation profile for trails and cycling, the three aligned month strips for beaches, the swim season and depth glyph for lakes, the horizon silhouette for mountains.
6. **The intelligence bento**: what to expect, underfoot or surface, water, season, weather, safety, getting there. Each collapsed to a row with an icon, a label and a six-word summary. Nothing over 60 words visible without the user asking.
7. **Getting there and away**, which is the weakest dimension across all five today: nearest station, nearest bus stop with GTFS frequency, parking with capacity, drive time from the nearest airport you already price.
8. **Take it with you**: GPX, a printable checklist, send to phone. People plan across devices and over weeks, and currently nothing leaves the page.
9. **Three ways out**, computed not hand-picked: easier, cheaper, nearby. A detail page with no exit is a dead end, and with 17,000 trails and 2,700 beaches you have the data to make these genuinely good.

One primary `--signal` button per page. Everything else, including GPX download, is a bordered secondary.

---

## Part H. Order of work

### H1. Week one, the extractor bugs

Cycling superroutes and `cycle_network` grouping (C1, C2), the trails named-ways pass everywhere (B2), the five visible trail data bugs (B7), and the title ladder applied across all five sections (A2). None of this needs new data or new UI and all of it is currently making the product look broken.

### H2. Week two, the two open datasets that change the shape of two sections

EEA bathing water for beaches and lakes (D1, E2), and HydroLAKES plus GLOBathy for lakes (E1). These are two file downloads and two join jobs, and between them they take beaches from 2,746 to roughly 18,000 candidates and give lakes a defensible selection rule for the first time.

### H3. Week three, the image ladder

The free Commons filters and the cheap Haiku scoring pass (A3 rung 1), then the terrain render pipeline (rung 2) and the route glyph generator (rung 3). Do the renders first: once every row has an honest visual, the pressure to find a photo for a remote trail disappears, and 14,065 trails stop looking unfinished.

### H4. Week four, the registry and the coverage gate

The famous-trail registry and the CI gate (B1), the mountain target lists and Kirmse prominence (F2), the EuroVelo and national cycling ingests (C3, C4). This is the work that makes "coverage is big" a true statement you can check on every build rather than a hope.

### H5. Then the derived modules and the signature visuals

Beach orientation and walk-in time (D4, D5), sea and lake temperature strips (D3, E3), surface and traffic exposure for cycling (C6), the horizon silhouette and how-you-get-up row for mountains (F3, F4), shore walkability for lakes (E5). These are what turn five listings into five instruments, and each one is independently shippable.

### H6. Last, the opening screens and the 3D heroes

A6 and A5. Do these last on purpose: an opening screen that showcases the best of a section is only worth building once the section has a best to show.

---

## Part I. Data source appendix

Everything named above, with its licence and what it actually gives you.

| Source | Sections | Licence | What you get |
| --- | --- | --- | --- |
| [EEA Bathing Water Directive dataset](https://www.eea.europa.eu/en/datahub/datahubitem-view/c3858959-90da-4c1b-b9ca-492db0e514df) | Beaches, Lakes | CC BY 4.0 | 22,289 designated sites, 1990–2025 classification history, coordinates, coastal/lake/river type |
| [HydroLAKES](https://www.hydrosheds.org/products/hydrolakes) | Lakes | CC BY 4.0 | 1.4 M lake polygons ≥10 ha with area, shore length, volume, elevation, natural/reservoir flag |
| [GLOBathy](https://www.nature.com/articles/s41597-022-01132-9) | Lakes | CC BY 4.0 | Modelled max depth and depth–area–volume curves on HydroLAKES ids |
| [Copernicus GLO-30 DEM](https://registry.opendata.aws/copernicus-dem/) | All | Free, attribution | 30 m elevation for profiles, prominence, viewsheds, terrain renders, walk-in descent |
| [Mapterhorn terrain tiles](https://protomaps.com/blog/mapterhorn-terrain/) | All | Open, attribution | Terrarium WebP tiles and a planet PMTiles archive you can extract by bbox |
| [akirmse/mountains](https://github.com/akirmse/mountains) | Mountains | MIT | Prominence and isolation computed from any DEM; a published 7.8 M peak dataset |
| [GMBA Mountain Inventory v2](http://www.earthenv.org/mountains) | Mountains | CC BY 4.0 | 8,327 mountain range polygons, 10-level hierarchy |
| [EuroVelo GPX](https://pro.eurovelo.com/news/2024-10-09_eurovelo-gpx-tracks-go-open-data) | Cycling | ODbL | 17 routes, ~90,000 km, per stage, full and developed-sections variants |
| [Sustrans NCN](https://data-sustrans-uk.opendata.arcgis.com/) | Cycling | OGL-style | The UK network with its own traffic-free classification |
| [Veloland Schweiz, opendata.swiss](https://opendata.swiss/en/dataset/langsamverkehr-veloland-schweiz) | Cycling | Open | National and regional cycle routes plus a live closures feed |
| [ON3V véloroutes](https://www.data.gouv.fr/datasets/velo-routes-on3v) | Cycling | Licence Ouverte | France's ~60 numbered V-routes |
| [Vías Verdes at CNIG](https://www.cartografiadigital.es/2022/09/vias-verdes-en-el-centro-de-descargas.html) | Cycling | CC BY | ~2,900 km of Spanish rail-trail |
| [Kartverket Turrutebasen](https://www.kartverket.no/en/api-and-data/friluftsliv) | Trails | NLOD | Norway's national trail database as GPX, GML, PostGIS |
| [Wanderland, opendata.swiss](https://opendata.swiss/en/dataset/langsamverkehr-wanderland-schweiz) | Trails | Open, attribution | Swiss national, regional and local hiking routes |
| [refuges.info API](https://www.refuges.info/api/doc/) | Trails, Mountains | CC BY-SA 2.0 | Huts, springs, summits as GeoJSON/GPX, no key |
| [Järviwiki](https://www.jarviwiki.fi) | Lakes | CC BY 4.0 | Every Finnish lake >1 ha, with citizen temperature, algae, ice and clarity observations |
| [NVE Innsjødatabase](https://www.nve.no/kart/kartdata/vassdragsdata/innsjoedatabase/) | Lakes | NLOD | ~243,000 Norwegian lakes |
| [Copernicus Lake Surface Water Temperature](https://land.copernicus.eu/en/products/temperature-and-reflectance/lake-surface-water-temperature-near-real-time-v1-0-1km) | Lakes | Copernicus free | 1 km, 10-daily lake temperature, 2016 onward |
| [Copernicus Marine OSTIA SST](https://data.marine.copernicus.eu/product/SST_GLO_SST_L4_REP_OBSERVATIONS_010_011/services) | Beaches | Free, registration | Sea surface temperature for the monthly climatology |
| [MITECO Guía de Playas](https://datos.gob.es/es/catalogo/e0dat0002-servicio-wms-web-map-service-guia-de-playas-de-espana) | Beaches | Spanish reuse, attribution | ~3,500 Spanish beaches with composition, length, width, access, parking, services |
| [Wikidata SPARQL](https://query.wikidata.org/) | All | CC0 | Names in 20 languages, coordinates, elevation, area, OSM relation ids (P402), Commons images |
| [Wikipedia pageviews API](https://wikitech.wikimedia.org/wiki/Analytics/AEM/Pageviews) | All | Free | The fame ranking that fixes every "best in region" list |
| [Commons geosearch](https://www.mediawiki.org/wiki/API:Geosearch) | All | Per-file CC | Photo candidates and photo density as a scenery proxy |
| [OpenSkiMap](https://openskimap.org/) | Mountains | ODbL | OSM-derived ski areas and lifts as GeoJSON |
| [Global Wind Atlas](https://globalwindatlas.info) | Cycling | Open | Prevailing wind by month for the tailwind module |
| [GRASS r.viewshed](https://grass.osgeo.org/grass83/manuals/r.viewshed.html) | Mountains | GPL | Computable view quality from the summit |
| [pymgl](https://github.com/brendan-ward/pymgl) | All | BSD | Server-side MapLibre static renders for the terrain hero pipeline |

Deep-link only, never ingest: **Komoot** (no public API, iframe embeds only), **AllTrails** (no API, bot-protected, scraping breaches ToS and database right), **Wikiloc** (user GPX licensed to Wikiloc), **Blue Flag** (no bulk download, annual scrape as a year-stamped badge), **peakbagger / peaklist** (editorial checklist only). **Outdooractive** is the one buyable route API, but its terms require view-tracking calls, a fixed attribution string and `noindex` on third-party content, which removes its SEO value.

---

## Part J. Open decisions

- **Trails scope:** run the registry and coverage gate across all 47 countries at once, or prove it on three countries (Albania, France, Poland) first? The gate is only useful once it fails the build, so it needs a country where you are willing to be blocked.
- **Beaches volume:** publish all ~18,000 EEA-joined coastal rows, or gate them to the ~6,000 that clear a photo-and-services bar? The first is better for search, the second is better for browsing.
- **Mountains unit:** build the MountainArea entity now, or expand the peak list first and add areas later? Areas first makes the peak expansion easier to navigate; peaks first ships something visible sooner.
- **Image budget:** Haiku pass only (~$25 for the catalogue) or Haiku plus a Sonnet re-score of the top two per row (~$75)? Either way, the terrain render pipeline is the bigger lever and costs only compute.
- **Cycling node networks:** leave them out, or build the routable node graph and offer "make me a 40 km loop from node 42"? The second is a real product, not a listing, and should be scoped separately.
