# Carta, Destinations enhancement spec

**Version 2.** Rewritten to answer four things the first draft left open: how every single point gets solved for *all of Europe*, how to get images that show the view you will actually get, whether 3D is in or out, and what each page should look like.

Scope: the five non-trip categories in the Destinations tab, **Trails, Cycling, Beaches, Lakes, Mountains**. Trips is covered by `carta-trips-enhancement-spec.md`. Every behaviour rule in that document applies here too: progressive disclosure, flashcards, icon grid, info dots, plain words on the surface with the technical word behind the dot, nothing over 60 words visible without asking, one primary button per view, mono for measured facts only, honesty about coverage.

What I checked: every country file in `continent-app/dist/{trails,cycling,beaches,lakes,mountains}/`, all five browse pages and their story libs, the category switch in `DestinationsTab.jsx`, the design tokens in `src/styles.css`, and the design system in `.claude/skills/carta-design`. Then four research passes: data sources per section, view-direction imagery, 3D stacks and pricing, and the remaining coverage gaps in the Balkans, Baltics and Turkey.

Each item is **title -> what to do and why**, and every coverage item carries a line marked **Europe:** that says exactly how the requirement is met in all 47 countries, not just the easy ones.

---

# Part 0. The coverage picture

## 0.1. Every country, every section, as shipped today

Counted from the built JSON, excluding the `top.json` roll-ups.

| CC | Country | Trails | Cycling | Beaches | Lakes | Mountains | Total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DE | Germany | **4,674** | 32 | 156 | 182 | 44 | 5,088 |
| GB | United Kingdom | 1,854 | 110 | 118 | 60 | 59 | 2,201 |
| IT | Italy | 1,276 | **0** | 176 | 149 | 61 | 1,662 |
| FR | France | 970 | 19 | 237 | 144 | 57 | 1,427 |
| ES | Spain | 533 | 12 | 648 | 118 | 51 | 1,362 |
| PL | Poland | 868 | 18 | 94 | 129 | 29 | 1,138 |
| GR | Greece | 555 | 1 | 178 | 49 | 23 | 806 |
| NL | Netherlands | 617 | 15 | 63 | 66 | 4 | 765 |
| AT | Austria | 570 | 24 | 12 | 97 | 44 | 747 |
| PT | Portugal | 242 | 7 | 413 | 68 | 9 | 739 |
| BE | Belgium | 659 | 20 | 16 | 27 | 6 | 728 |
| CH | Switzerland | 401 | 15 | 25 | 79 | 48 | 568 |
| CZ | Czechia | 401 | 24 | 31 | 53 | 35 | 544 |
| SE | Sweden | 311 | 25 | 89 | 48 | 9 | 482 |
| NO | Norway | 275 | 13 | 19 | 42 | 27 | 376 |
| FI | Finland | 179 | 15 | 83 | 34 | 15 | 326 |
| SI | Slovenia | 241 | 14 | 28 | 17 | 26 | 326 |
| BG | Bulgaria | 255 | 1 | 13 | 22 | 12 | 303 |
| HR | Croatia | 165 | 12 | 88 | 18 | 15 | 298 |
| RO | Romania | 244 | 4 | 11 | 18 | 14 | 291 |
| IE | Ireland | 163 | 23 | 57 | 27 | 11 | 281 |
| HU | Hungary | 194 | 19 | 21 | 23 | 16 | 273 |
| DK | Denmark | 155 | 12 | 49 | 34 | 2 | 252 |
| SK | Slovakia | 167 | 18 | 12 | 22 | 33 | 252 |
| RS | Serbia | 226 | 2 | 1 | 11 | 9 | 249 |
| LV | Latvia | 151 | 16 | 22 | 25 | 2 | 216 |
| EE | Estonia | 152 | 10 | 19 | 29 | 3 | 213 |
| AL | Albania | 170 | **0** | 5 | 10 | 6 | 191 |
| LU | Luxembourg | 155 | 8 | 5 | 4 | 2 | 174 |
| CY | Cyprus | 104 | 3 | 14 | 11 | 2 | 134 |
| LT | Lithuania | 108 | 1 | 1 | 15 | 2 | 127 |
| LI | Liechtenstein | 111 | 0 | 0 | 0 | 3 | 114 |
| IS | Iceland | 86 | **0** | 3 | 7 | 17 | 113 |
| XK | Kosovo | 100 | 1 | 0 | 5 | 6 | 112 |
| ME | Montenegro | 77 | 4 | 12 | 12 | 6 | 111 |
| BA | Bosnia | 70 | **0** | 1 | 8 | 7 | 86 |
| MK | North Macedonia | 69 | **0** | 2 | 6 | 8 | 85 |
| MT | Malta | 35 | 2 | 21 | 6 | 1 | 65 |
| MD | Moldova | 24 | 0 | 0 | 4 | 2 | 30 |
| AD | Andorra | 10 | 1 | 0 | 1 | 6 | 18 |
| UA | Ukraine | **0** | 4 | 0 | 0 | 5 | 9 |
| FO | Faroes | 1 | 0 | 1 | 1 | 2 | 5 |
| MC | Monaco | 1 | 0 | 2 | 0 | 0 | 3 |
| SM | San Marino | 0 | 0 | 0 | 0 | 1 | 1 |
| TR | Turkey | **0** | 1 | **0** | **0** | **0** | 1 |

**Twenty-three cells are zero.** Turkey is effectively absent from the product. Ukraine has five mountains and nothing else. Iceland, Bosnia, North Macedonia, Albania and Italy have no cycling at all.

## 0.2. The single most important number in this document

**Germany holds 4,674 of 17,619 trails, 27% of the entire European hiking catalogue.** Italy, a country with the Dolomites, the Alta Via routes, Cinque Terre and the Sentiero degli Dei, has 1,276. Turkey, with the Lycian Way, has zero.

That ratio is not a statement about where the good walking is. It is a statement about where German `Wanderverein` clubs have exhaustively tagged every local `Rundweg` as an OSM route relation. **The catalogue currently measures OSM tagging culture and calls it coverage.** Every coverage fix in this document exists to break that dependency.

## 0.3. Three different failure modes, three different fixes

| Failure mode | Sections | Symptom | Fix |
| --- | --- | --- | --- |
| **Recall failure** | Trails | 17,619 rows, and the walk the user searched for is not one of them | A registry built from evidence, plus a second ingest pass over named ways, plus a CI gate that fails the build |
| **Extractor failure** | Cycling | Italy is zero although the Bicitalia network is fully mapped | Read `type=superroute`, group by `cycle_network`, publish partial routes with a state |
| **Selection failure** | Beaches, Lakes, Mountains | Small, arbitrary, skewed to whoever tagged most | A large candidate pool from authoritative open datasets, plus a published quota chosen by a scored gate |

## 0.4. The coverage contract

This is the promise the product makes, and the thing CI checks on every build. It is what turns "big coverage" from an aspiration into a test.

> **For every one of the 47 countries and every one of the five sections, Carta either publishes at least the country floor, or prints a reason code saying why it cannot.**

Country floors, by section:

| Section | Floor per country | Additional per-region rule |
| --- | --- | --- |
| Trails | Every registry entry with a fame score above the threshold, minimum 12 | Every NUTS3 region publishes its top 3 registry entries or gives each miss a reason code |
| Cycling | Every national and international route in the country, minimum 8 | Every region with a named route publishes it |
| Beaches | Every EEA designated coastal bathing water, minimum 10 where a coast exists | Every coastal NUTS3 region publishes at least 5 |
| Lakes | Every lake clearing the hard anchors, minimum 15 where lakes exist | Max 3 per 50 km cell, so no region monopolises |
| Mountains | Every ultra, every national and regional highpoint, every lift-served summit, minimum 10 where relief exists | Every GMBA range with a peak over 1,000 m publishes its 3 highest |

Reason codes, printed in the UI and in the build report: `no_open_data`, `way_only_not_derived`, `failed_continuity`, `below_quota`, `not_applicable` (Monaco has no lakes and that is fine), `licence_blocked`, `pending_partnership`.

The point of the reason code is that **a gap stops being a bug and becomes a stated fact**, which is the same argument as K3 in the trips spec. `Turkey, 0 hiking routes published, reason: pending_partnership with Culture Routes Society` is a product that knows itself. A blank grid is not.

---

# Part 1. How every country gets covered, country by country

This is the direct answer to "how are you going to solve the requirement for all of Europe". The countries group into six tiers by what actually blocks them, and each tier has one fix.

## 1.1. Tier A, already dense in OSM, fix the extractor only

**Germany, Netherlands, Belgium, Czechia, Austria, Poland, Slovakia, Hungary, Switzerland, Denmark, United Kingdom, Ireland, Luxembourg, Slovenia, Estonia, Latvia, Lithuania.**

These countries have strong OSM route-relation coverage. Nothing new needs importing. What they need is: read superroutes, group by `cycle_network`, apply the title ladder, publish partially mapped routes with a state flag, and in the case of Germany **reduce** the trail count by applying a fame threshold, because 4,674 local `Rundwege` is noise rather than coverage.

**Europe:** one extractor change, seventeen countries fixed, zero new licences.

## 1.2. Tier B, a national open dataset exists and should be ingested directly

| Country | Dataset | What it unblocks |
| --- | --- | --- |
| Switzerland | Wanderland and Veloland on opendata.swiss (open, attribution), plus the live closures feed | Hiking and cycling, national + regional + local, plus closure warnings nobody else shows |
| Norway | Kartverket Turrutebasen (NLOD, GPX/GML/PostGIS), NVE Innsjødatabase (243,000 lakes) | Trails and lakes, the best national outdoor dataset in Europe |
| France | IGN Géoplateforme BD TOPO (Licence Ouverte 2.0), ON3V véloroutes on data.gouv.fr, refuges.info (CC BY-SA) | Cycling from 19 to ~60 named V-routes, huts and springs Europe-wide-ish |
| Spain | CNIG Vías Verdes layer (CC BY), MITECO Guía de Playas (~3,500 beaches with composition, length, access, parking) | Cycling from 12 to ~2,900 km of rail-trail, near-complete Spanish beaches |
| UK | Sustrans NCN on ArcGIS Hub (OGL-style), with its own traffic-free classification; DoBIH for hills | Cycling re-cut to real route numbering, mountains from 59 toward 282 Munros |
| Germany | Radnetz Deutschland per-route GPX, BALM network geodata | The 12 D-Routen properly named |
| Finland | Järviwiki (CC BY 4.0, every lake over 1 ha, ~56,000, with citizen temperature, algae, ice and clarity readings) | Lakes from 34 to a real Finnish section |
| Sweden | SMHI SVAR lake register (~95,000), Lantmäteriet open orthophotos (CC0) | Lakes and imagery |
| Belgium | Toerisme Vlaanderen cycling node network, Wallonia RAVeL and véloroutes on the Géoportail | ~1,500 km of car-free rail-trail, the best "easy family cycling" product in the catalogue |
| Italy | Bicitalia GPX, the Acquedotto Pugliese official track, regional sentieri open data (Lombardia, Trentino, Alto Adige) | Cycling from 0 to the full BI-1..BI-22 network |
| Netherlands | OSM node network is better than the licensed Routedatabank | Nothing to buy |

**Europe:** eleven countries, eleven ingest jobs, all open licences, no negotiation needed.

## 1.3. Tier C, EU-wide datasets that cover everyone at once

These are the ones that fix twenty-seven countries in a single download, and they are why beaches and lakes are the cheapest sections to make complete.

- **EEA Bathing Water Directive dataset**, CC BY 4.0, XLSX bulk, 1990 to 2025. **22,289 designated sites in 2025: 14,861 coastal and 7,428 inland, of which roughly 6,200 are lake sites.** Carries a stable id, name, coordinates, water category and a classification for every season back to 1990. Non-EU reporters included: Albania 119 sites, Switzerland 160.
- **HydroLAKES** (CC BY 4.0), 1.4 M lake polygons above 10 ha with area, shore length, average depth, volume, elevation, and a natural-versus-reservoir flag. Europe's share is roughly 250,000 to 300,000.
- **GLOBathy** (CC BY 4.0), modelled max depth and depth–area–volume curves keyed to the same `Hylak_id`.
- **Copernicus DEM GLO-30**, free for commercial use with attribution, on AWS Open Data. Elevation profiles, prominence, viewsheds, terrain renders, walk-in descent, horizon panoramas.
- **Natura 2000** (EEA, vector end-2024, SHP and GeoPackage), for protected-area context. **Use this rather than WDPA: Protected Planet's terms prohibit commercial redistribution and require a signed request.** That is the one licence in this whole document most likely to cause a problem, so it is out.
- **GHSL population grids** (JRC, free), for the crowding estimate.
- **CLC+ Backbone** (Copernicus, 10 m, annual), for "what is around this place": forest, water, urban and beach fractions in a 500 m buffer.
- **Overture Maps**, and note the licence split, because it matters: the **places** theme is CDLA-Permissive-2.0 and Apache-2.0 and CC0, **not ODbL and no share-alike**, which makes it the clean way to get commercial POI data. Divisions, transportation, buildings and base are ODbL. Overture adds little for trails, so keep OSM there.
- **Mobility Database** (6,000+ GTFS feeds, 99+ countries) and **Transitous / MOTIS** (free, no API key, merged European feeds) for the "can I get there without a car" badge.

**Europe:** one download each, all 47 countries served, nothing per-country to maintain.

## 1.4. Tier D, the Balkans, where nothing is openly licensed

Albania, Bosnia, North Macedonia, Montenegro, Serbia, Kosovo, Bulgaria, Romania, Croatia.

The honest research finding is blunt: **almost every named long-distance trail in this region publishes a free GPX under all-rights-reserved terms.** Via Dinarica, Peaks of the Balkans, Via Transilvanica, Via Adriatica, the Juliana Trail (which is actually an Outdooractive-powered portal) — none of them carry an open licence.

So the plan has three parts, in order:

1. **OSM plus Waymarked Trails is the geometry layer.** Via Dinarica's White Trail, Peaks of the Balkans, Kom–Emine and the Juliana Trail all exist as OSM relations. Waymarked Trails is the only pan-European open trail aggregator with route-relation elevation profiles, and its open API is the fastest way to find out what *should* exist per country and diff it against what you publish.
2. **Partnership requests, to NGOs first.** Tășuleasa Social runs Via Transilvanica and Culture Routes Society runs the Lycian Way; both are non-profits and both are realistic yeses. Peaks of the Balkans has a UNDP lineage. These are emails, not contracts, and each one unlocks a flagship route.
3. **Publish the stub page in the meantime** (see 6.5): the name, the region, the fame evidence, what is known, an honest line that no open route data exists yet, and an outbound link. A user who searches "Peaks of the Balkans" and finds a Carta page that knows what it is and says where to get the track is better served than one who finds nothing.

There is a citable OSM quality study for Slovenia and Bosnia (ISO 19157-1:2023, *International Journal of Cartography*, 2026) which is exactly the evidence you need to put a per-country confidence label in the UI rather than pretending all countries are equal.

**Europe:** nine countries, covered by OSM today, flagged honestly, upgraded by partnership over time.

## 1.5. Tier E, Turkey and Ukraine, the two real holes

**Turkey** has one cycling route and nothing else, and it is the single biggest missing market in the product: the Lycian Way, St Paul Trail, Phrygian Way and Carian Trail, plus the entire Turquoise Coast. The Culture Routes Society is the de facto authority, is a non-profit, ships GPX with its guidebooks and apps, and runs a live route-updates feed that would make an excellent "current closures" module. This is one partnership email.

**Ukraine** has five mountains. The Carpathians are real and OSM coverage is reasonable; this is an extractor scope question, not a data question. Turn the country on and apply the same gates as everyone else.

**Europe:** two countries, one email and one config change.

## 1.6. Tier F, the microstates, where "not applicable" is the correct answer

Monaco, San Marino, Liechtenstein, Andorra, Faroes, Malta, Moldova.

Monaco has no lakes. San Marino has one mountain and that is the correct number. The fix here is not data, it is the **`not_applicable` reason code and a good empty state**: name the space, give the action, and offer the three nearest alternatives across the border. The trips spec's `emptyCountry` instinct is right; make it a real module.

**Europe:** seven countries, solved by admitting the truth well.

## 1.7. The coverage dashboard

Build `reports/coverage.html` from the build, one row per country per section, showing published count, floor, pass or fail, and the reason code for every miss. Look at it every build. This is the artefact that makes the phrase "coverage needs to be really big" checkable rather than aspirational, and it is about a day of work.

---

# Part 2. Images: showing the view you will actually get

This is the part you asked for and it changes the imagery brief completely. A photo of a mountain is not the same as a photo of **the view from that mountain**. A photo of a trail sign is not the same as **what you see at kilometre 6**. The second kind is what makes someone want to go.

## 2.1. The rule: every image answers "what will I see", not "what does it look like"

Write this into the image brief and into the vision-scoring prompt:

| Section | The hero answers | The gallery answers |
| --- | --- | --- |
| Mountains | What you see **from** the summit | What the mountain looks like from the valley, the hut, the last 100 m |
| Trails | The **best viewpoint on the route**, looking outward | Three named moments along the way, in walking order |
| Cycling | The **surface under the tyre** with the landscape beyond | The two or three named features the route passes |
| Beaches | The beach **along its length** from water level, so you can read the entry and the sand | The view from the beach outward, and the walk down to it |
| Lakes | The **shore looking across the water**, so the colour and the far side are visible | The swimming entry, the shore path, the view from above |

Hard rejects stay as they are: animals and plants in close-up, vehicles, interiors, maps and diagrams, satellite images, identifiable people as the main subject. Add two: **no image whose subject is a signpost or a trail marker**, and **no image taken more than 2 km from the feature unless it is explicitly framed as "seen from"**.

## 2.2. Where view-direction images come from, in priority order

**Rung 1, Commons and Flickr with a known camera bearing.** Commons preserves original EXIF including `GPSImgDirection` and `GPSImgDirectionRef`. Pull it with `action=query&prop=imageinfo&iiprop=url|metadata|commonmetadata|extmetadata`. Structured Data on Commons is the cleaner route: **P1259** is the coordinates of the point of view, **P9149** the coordinates of the depicted place, and **P7787 `heading`** is the qualifier that gives you the bearing in degrees. Query it via `wbgetentities` on the `M<pageid>` entity, or via the Commons Query Service SPARQL endpoint.

The honest caveat: only a minority of files carry a compass value, because many uploads are stripped or re-encoded. So the fallback chain is: P1259 + P7787, then EXIF `GPSImgDirection`, then the `{{Location|lat|lon|heading:SW}}` wikitext template, then **compute the bearing from camera coordinate to depicted-object coordinate**, which is often better than the compass value anyway. Flickr is the better source for actual scenic panoramas, because people photograph summit views, not trail surfaces: `flickr.photos.search` with `has_geo=1`, `bbox`, `license=1,2,4,5,7,9,10` and `extras=geo,url_l,license,owner_name`.

**Rung 2, Mapillary, for the view along a route.** API v4, `compass_angle` and the SfM-refined `computed_compass_angle` are exactly the "which way was the camera pointing" field, and `is_pano=true` marks 360° images, **which you can reproject to any bearing yourself**. That last capability is the single most useful thing in this whole section: from one panorama at kilometre 6 you can generate "looking ahead along the trail" and "looking back down the valley" as two different images. Licence is CC BY-SA 4.0, commercial display allowed with attribution. The bbox limit is under 0.01° square, so tile the route corridor.

The coverage truth: Mapillary is overwhelmingly road-following dashcam capture. Expect good coverage on Alpine valley approaches, popular Dolomites, Chamonix and Tatra trails, and nearly every European long-distance cycle route, and near-zero on remote Scandinavian, Balkan, Carpathian and Pyrenean trails. **So Mapillary is a strong answer for Cycling and a partial one for Trails.**

**Rung 3, Panoramax.** IGN plus OpenStreetMap France, STAC-compliant API, heading exposed as `view:azimuth`. Over 105 million images by May 2026 from 2,100 contributors and twelve instances, and the **IGN instance is etalab-2.0, which is permissive and commercial-friendly** — cleaner than Mapillary's share-alike. Still France-dominated, so it is the right long-term bet rather than today's answer.

**Rung 4, the synthetic view, which is the only rung that covers all 47 countries.** This is the important one and it is covered next.

**Explicitly excluded: Google Street View.** The Static API does take `heading`, `pitch` and `fov`, and the metadata endpoint is free, but the policy prohibits pre-fetching, indexing, storing or caching anything except place and panorama IDs. You cannot pre-render 17,600 trail images into your CDN. At $7 per 1,000 live requests with essentially no hiking coverage, it is out.

## 2.3. The synthetic view render, and why it is the actual answer

For most of the 17,619 trails and 740 mountains, no photograph facing the right way exists anywhere. So generate one.

**What it is:** Copernicus GLO-30 or better national LiDAR terrain, with an open national orthophoto draped on it, rendered from the viewpoint's coordinate at the viewpoint's bearing, with the named peaks on the horizon labelled from your own peak table.

**How the horizon labels work:** for each azimuth, walk the DEM ray outward and track the maximum elevation angle; whatever sets the skyline is what you name. `dkogan/horizonator` is an open-source LGPL implementation that renders equirectangular panoramas headlessly to PNG from SRTM, and udeuschle.de documents the method openly (refraction coefficient 0.13, sight range to 750 km). Neither PeakVisor nor udeuschle is open source but the algorithm is trivial and you already have the peak table.

**The orthophoto drape, per country, all open and commercial-safe:**

| Country | Layer | Resolution | Licence |
| --- | --- | --- | --- |
| Switzerland | swisstopo SWISSIMAGE (WMTS) | 10 cm | OGD, attribution |
| France | IGN Géoplateforme `ORTHOIMAGERY.ORTHOPHOTOS` | 20 cm | Licence Ouverte 2.0 |
| Netherlands | PDOK luchtfoto | 8 cm | CC BY / public domain |
| Austria | basemap.at `bmaporthofoto30cm` | 30 cm | CC BY 4.0 |
| Spain | IGN PNOA WMS | 25–50 cm | IGN open |
| Norway | Kartverket / Norge i bilder WMTS | varies | CC BY 4.0 |
| Sweden | Lantmäteriet orthophotos | varies | CC0 since 2022 |
| Portugal, Luxembourg, Italy, Denmark, Poland, Czechia, Slovenia, Estonia, Belgium, England, Scotland | national WMS/WMTS | varies | open, attribution |
| Everywhere else | raw Sentinel-2 | 10 m | Copernicus, commercial OK |

**One licence trap to avoid:** the free Sentinel-2 cloudless tiles at s2maps.eu are **CC BY-NC-SA, non-commercial**. Do not ship those. Use raw Sentinel-2 or pay EOX. Esri World Imagery is likewise only licensed inside Esri-approved apps.

**Europe:** this rung has no gaps. Terrain exists everywhere, an open ortho exists in about twenty countries and Sentinel-2 covers the rest, so **every single row in all five sections can have a view image**, and the Balkans and Turkey are not second-class.

## 2.4. Picking which view to render

Do not render "the view from the middle". Pick the viewpoint from data:

- **OSM `tourism=viewpoint`** within 150 m of the route or the feature. The `direction` tag supports ranges, `330-30` meaning a 60° panorama around north, `0-360` meaning full panorama, which is exactly the caption you want. Also index `natural=peak`, `man_made=survey_point` and `man_made=tower` with `tower:type=observation`.
- If none, **the high point of the route**, or the point of maximum viewshed if you are already computing viewsheds for Mountains.
- For a beach, **water level at the midpoint looking along the shore**. For a lake, **the most-photographed shore point**, which you get free from Commons photo density.
- Cross-check the chosen bearing against a DEM viewshed so you never caption a view that faces a rock wall.

Rank candidates by: has `name` and `direction` > has `ele` near the route maximum > has an OSM `image` or `wikimedia_commons` tag > has a Mapillary `is_pano` image nearby.

## 2.5. Caption every view image with what it shows

This is what turns an image into information. `Looking north-west from the Kanzel viewpoint at km 6.2, Dachstein on the skyline, 14 km away.` The bearing, the place, the named horizon peak and the distance are all things you computed anyway. Nobody else in the category does this and it is the most Carta-ish thing in the document: a photograph turned into a measured fact.

## 2.6. The gallery is a walk, not a pile

Order gallery images **by `along_m`**, so scrolling the gallery is walking the route. Each thumbnail links to its position on the map and on the elevation profile, using the shared `highlightAt(along_m)` API. For beaches and lakes, order is walk-down, water entry, view out. For mountains, order is valley view, approach, summit view.

## 2.7. Live conditions come from webcams, as embeds only

foto-webcam.eu runs 400+ high-resolution Alpine cameras with multi-year archives; Panomax and Roundshot do 360° panoramas. Terms differ per camera and per operator and none of them permit bulk archival reuse. **Embed them live on the detail page, never store the frames.** "What the summit looks like right now" is excellent content and legally simplest as an iframe.

## 2.8. Let users add the photo you cannot find

A remote Balkan trail will never have a good Commons photo. The upload path is the answer, and it is the same moderation surface you need anyway. What it legally requires: a licence grant in the terms that is worldwide, non-exclusive, royalty-free, perpetual, irrevocable, **transferable and sublicensable** (those last two are the ones people forget); a warranty and indemnity from the uploader; an attribution commitment, because moral rights are inalienable in France, Germany, Spain and Italy and a US-style waiver is simply void there; EXIF stripping on by default, and start-and-end-point trimming on uploaded GPX, because a track starting at someone's front door is a home-address disclosure under GDPR; and DSA notice-and-action, statements of reasons and an internal complaints route, which apply to any hosting service offering in the EU regardless of size.

One genuine differentiator: **offer uploaders a public licence choice, CC BY or CC BY-SA, on top of your platform licence.** It costs nothing, it distinguishes you from AllTrails and Komoot, and it makes contributing back to OSM legally clean — which is exactly the community you need in order to fill the Balkan gap.

---

# Part 3. 3D: yes, it is in, and here is exactly how

The short answer is **yes**, on all five sections, at a cost of roughly **€5 a month** plus a one-off render job of about **€10**. The long answer is that the free stack is not a compromise here; it is the same technique the paid products use.

## 3.1. What every competitor actually does, and what it costs them

FATMAP is now Strava's proprietary Map Rendering Engine: high-resolution satellite imagery draped over terrain, plus derived layers (avalanche gradient, slope angle, aspect, winter style). PeakVisor runs a custom engine with 3D satellite maps that work offline. Komoot puts 3D behind Premium at €59.99 a year. AllTrails puts it behind AllTrails+ and disables it in navigation mode. Outdooractive bundles a 3D flyover into Pro.

**Nobody ships photorealistic mesh.** It is all DEM plus draped imagery, and everyone paywalls it as an *inspiration* feature. The differentiator is not the 3D itself, it is the derived analytics drawn on it. That is good news: you can match the technique for free and win on the analytics.

## 3.2. The stack

**MapLibre GL JS 6.10+**, which is where the terrain work of the last year landed. Specifically:

- `raster-dem` source pointed at Mapterhorn, `encoding: "terrarium"`, `tileSize: 512`, `maxzoom: 13`, then `setTerrain({exaggeration: 1.3})`.
- `setSky()` for atmosphere, and a `color-relief` or `hillshade` layer under the basemap for depth.
- **Pitch beyond 60° is supported.** The default `maxPitch` is 60 and the validity ceiling is 180; 72–80° is the sweet spot for a FATMAP-style oblique. 6.8.0 added mipmapped trilinear filtering on the terrain drape specifically to stop the shimmering that made high-pitch views look crunchy, which is what makes this look professional rather than amateur.
- `symbol-height-offset` and `symbol-height-anchor` (6.6.0) float hut and summit labels above the slope instead of sinking into it.
- 6.10.0 replaced per-marker GPU depth readback with a CPU ray-walk over the DEM, which is the difference between 20 fps and 60 fps on a phone when you have fifty pins on a route.
- Mobile: 2D by default, terrain on tap, cap DEM `maxZoom` at 12–13 and let MapLibre overzoom, never ship globe plus terrain plus 3D buildings at once.

**Terrain tiles: Mapterhorn, and it is better than you think.** `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`, terrarium WebP, 512 px, z0–z17, BSD-3 code. Its European coverage is not Copernicus, it is **national LiDAR**: France LiDAR HD and RGE ALTI, swissALTI3D, Austrian per-Land 1 m DGM, Spanish MDT02/MDT05, Italian TINITALY, Norwegian DTM, Dutch AHN5, Finnish 2 m, Swedish, Danish, Czech DMR 4G, Polish NMT, Slovenian, Slovak, Estonian, Portuguese, Belgian, English and Scottish LiDAR, with Copernicus GLO-30 as the global fill. That is genuinely better DEM quality over the Alps and Pyrenees than Mapbox sells.

**The one risk, and the mitigation:** Mapterhorn publishes no SLA, rate limit or fair-use policy anywhere. So mirror the Europe PMTiles to your own R2 bucket before launch. On Cloudflare R2 at $0.015 per GB-month, 100 GB of European terrain costs **about $1.50 a month**, with free egress and Class B reads inside the free tier at your traffic. Budget a weekend for the tile build, not an afternoon: a published 2026 benchmark converted 116 GB of GeoTIFF into 60.7 M tiles in 14 hours on a multi-core box.

## 3.3. Google Photorealistic 3D Tiles: ruled out, and not only on price

Since 8 July 2025 the Google Map Tiles API **returns HTTP 403 for satellite 2D tiles, Photorealistic 3D Tiles and Street View Tiles to projects created after that date under an EEA billing address.** A Belgian-billed project is squarely in scope. Even setting that aside: billing is per session at $6 per 1,000, so 50,000 page views is roughly **$294 a month**; caching beyond the session is not permitted; attribution must be walked out of the glTF asset copyright and rendered; and coverage is city-biased, so Alpine countryside falls back to coarse aerial and looks worse than a good DEM render.

Cesium ion is not a cheaper path to the same tiles: Community includes 1,000 Google root tiles a month and Commercial at $149 a month includes 5,000, neither of which is near 50,000 page views.

MapTiler's bundled 3D terrain is tilt-capped at 65°, which alone disqualifies it for the look you want.

## 3.4. Pre-rendered 3D card heroes, the sub-$10 job

The native static renderers do not work for this: **pymgl states outright that it does not support 3D terrain**, `mbgl-renderer` is Mapbox-GL-native based and equally terrain-less, and MapLibre Native has no shipped 3D terrain. So the answer is headless Chrome running MapLibre GL JS.

Puppeteer or Playwright, a local HTML page with your style and your terrain source, force real WebGL with `--use-gl=angle --use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist`, wait for `idle` **and** a terrain-specific settle because DEM tiles arrive after vector tiles, then screenshot. Keep one browser and one tab and `jumpTo` between shots, which avoids recompiling the style per image and is the big win.

Framing rule, computed per row: centre on the bbox, bearing perpendicular to the dominant axis (or, better, the bearing of the chosen viewpoint from 2.4), pitch 72°, zoom to fit, 1600×900 WebP.

Throughput and cost: roughly 0.6–1.5 s per image on a GPU instance, 4–8 s on SwiftShader. **Twenty thousand images is about seven hours on one GPU spot instance, roughly $1.30 to $4.20.** Re-render only when the style changes. For the top 50 to 200 rows, re-render in Blender with GDAL for real sun, shadows and atmospheric scattering at 20–60 s a frame; those become the flagship heroes on the opening screens.

## 3.5. Where 3D appears in the product

| Place | Form | Cost |
| --- | --- | --- |
| Card hero | Pre-rendered static WebP, oblique, route or feature drawn on it | One-off render |
| Detail page map | Live MapLibre with a 3D toggle, 2D default on mobile | Free |
| "Fly the route" | Turf-sampled camera path along the LineString, ~25 s, `queryTerrainElevation` feeding `setCenterElevation` so the camera clears ridgelines, `prefers-reduced-motion` respected | Free |
| Section hero | One MapLibre instance, globe at low zoom easing into a terrain flyover across a few curated European locations, autoplays once then freezes, lazy-loaded below the fold, still image on mobile and on `save-data` | Free |
| Summit horizon | Not a map at all: the computed horizon rendered as a labelled SVG | Free |

**Never** put a live 3D canvas in a grid cell. Sixty WebGL contexts on one page is how a mid-range Android stops responding.

## 3.6. The derived layers are where you win

Strava's advantage is not the 3D, it is the analytics drawn on it. You already have the DEM, so draw: **slope angle bands** on the terrain for trails and mountains, **surface colouring** on the route line for cycling, **the viewshed from the summit** as a translucent overlay for mountains, and **water depth shading** for lakes from GLOBathy. Each is a shader or a data-driven line colour, not a new dependency, and each one makes the 3D view informative rather than decorative.

---

# Part 4. Making it user-oriented, not technical

You asked for this explicitly and it is the line from the trips spec I would treat as a rule for everything new, not a fix for the old: *make the text simple, not too many abbreviations and difficult words, you can always add the explanation in information icons.*

## 4.1. Build one `<InfoDot>` and one glossary, shared by all five sections

Every technical term appears once in a glossary keyed by term, written once, reused everywhere. The surface copy uses the plain word; the precise word lives in the dot. Minimum starting set for Destinations:

`singletrack`, `hardpack`, `fire road`, `scree`, `via ferrata`, `sac_scale` / T1–T6, `prominence`, `isolation`, `col`, `massif`, `hut-to-hut`, `bothy`, `refuge`, `traverse`, `out-and-back`, `loop`, `waymarking`, `GR`, `EuroVelo`, `knooppunt` / node network, `rail-trail`, `greenway`, `traffic-free`, `gravel bike`, `bathing water classification`, `Blue Flag`, `Secchi depth`, `blue-green algae`, `shoulder season`, `snow line`, `Natura 2000`, `GPX`, `Hs` / significant wave height, `thermocline`.

## 4.2. Translate every number into a sentence a person would say

Keep the number in mono, and put the meaning next to it in sans. This is the difference between a database and a product.

| Instead of | Say |
| --- | --- |
| `sac_scale T4` | Hands needed in places. Not for a first mountain day. |
| `prominence 2,136 m` | Rises 2,136 m above the lowest col linking it to anything higher, so it stands alone rather than sitting on a ridge. |
| `70% hardpack, 30% paved` | Mostly firm gravel, some tarmac. A gravel bike is ideal, a road bike will struggle. |
| `max grade 36%` | One very steep pitch, briefly. Most of the climb is gentler. |
| `bathing water: excellent, 10 of last 10 seasons` | Clean every year they have measured it, ten years running. |
| `Hs > 1 m on 41% of August days` | Often choppy in August. Good for surfing, less good for small children. |
| `swim season 71 days` | Warm enough to swim from about 20 June to 30 August. |
| `lift-served, 340 m on foot` | A cable car does most of it. The last 340 m up are on your own legs, about an hour. |

## 4.3. Banned from the surface

No raw tag names. No field names. No `f.g`, no `sac_scale` printed bare, no `NUTS3`, no `OSM relation`, no `GLO-30`, no `ODbL` outside the attribution footer. No unexpanded abbreviations in body copy except airport codes, which are legitimately mono data. Provenance and licences live in a collapsed "Where this comes from" row at the foot of the page, which is honest without being in the way.

## 4.4. Answer the three questions in order, on every page

A user browsing Destinations is asking, in this order: **is this for me, can I do it, how do I get there.** Every module on the page serves one of those three, and anything that serves none should be moved to the collapsed provenance row or deleted.

- *Is this for me* → the hook sentence, the view image, "who this is not for", the best-months strip.
- *Can I do it* → difficulty in plain words, the three mono stats, the elevation or depth or temperature visual, hazards, season.
- *How do I get there* → trailhead, parking, nearest station with real GTFS frequency, drive time from an airport you already price, GPX.

## 4.5. "Who this is not for", on all five sections

Two lines, near the top, in the user's interest. It costs the wrong visits and buys the right ones, and nothing on the site currently does it.

- Mountain: *Not for you if you are uneasy with exposure. There is a 200 m section with a cable and a drop on one side.*
- Beach: *Not for you if you need shade in the afternoon, or if carrying a cool box down 140 steps sounds like a problem.*
- Lake: *Not for you in July if you want quiet. The car park fills by nine.*
- Cycling route: *Not for you on a road bike. A third of it is loose gravel.*
- Trail: *Not for you before mid-June. Snow lies in the north-facing gully into early summer.*

## 4.6. State the honest coverage inline, in plain words

Not `verifyFlagCount: 0`. Instead, at the foot of every listing: *We publish 12 walks in Albania. We know of 31 more that people write about and we cannot yet map 19 of them, because no open route data exists for them.* And at the foot of every detail page: *Nine of fourteen figures here are measured, three are calculated, two are estimates. Last checked September 2026.*

---

# Part 5. How each page should look

The shipped app runs the warm alabaster palette from `src/styles.css`, not the cool-grey landing palette. Everything below uses those tokens: `--paper #f8f6f0`, `--paper-dim`, `--bg-card #ffffff`, `--ink #0f172a`, `--ink-soft`, `--ink-mute`, `--rule`, `--rule-soft`, `--accent #e05a47` terracotta for actions and the live route, `--rate #8f5a0c` ochre for ratings as a measure, `--gem-ink #2c6e63` teal for hidden gems and nothing else, `--green` for good news in data, `--danger` for destructive only. Type: `--display` Fraunces for headings, `--ui` Plus Jakarta Sans for everything else, `--mono` JetBrains Mono **for measured facts only**, with `font-variant-numeric: tabular-nums` on every number in a column. Spacing on the `--space-1..8` scale, `--tap: 44px` floor on every control.

## 5.1. The one card, five fillings

```
┌──────────────────────────────────────┐
│                                      │  ← 16:9 visual band
│        view image or 3D render       │     rounded top corners only
│                                      │     ochre rating seal, top right
│  [ ▂▄▆█▆▃ ]            ⟨8.8⟩        │     data strip bottom-left, 6px tall
├──────────────────────────────────────┤
│  Hoher Dachstein            [DAC-1] │  ← Fraunces 19px, ref chip in mono
│  Dachstein Mountains, Austria        │  ← Plus Jakarta 13px --ink-mute
│                                      │
│  A cable car takes you to 2,700 m,   │  ← the hook, one line, 15px
│  the last 300 m are on foot.         │
│                                      │
│  2,995 m · lift-served · P 2,136 m   │  ← mono 12.5px, exactly three values
│  ⛰ 🚡 ❄                              │  ← up to 3 icons, 20px, 1.5px, --ink-soft
└──────────────────────────────────────┘
```

Card: `--bg-card` fill, `1px solid var(--rule-soft)`, radius 10px, padding `var(--space-4)`. Hover scales the image to 1.05 inside a clipped frame, never the card. The 6 px data strip at the bottom of the image band is the section's signature visual: an elevation sparkline for trails and cycling, the surface bar for cycling, the sea-temperature strip for beaches, the swim-season bar for lakes, the altitude-versus-prominence bar for mountains.

**Three mono values, never four.** A fixed count is what makes a grid scannable.

## 5.2. The grid

Bento, not uniform. First card in view is double-width and double-height and carries the highest-ranked item, with a larger hook and a fourth stat. Then a 3-up grid on desktop, 2-up on tablet, 1-up under 640 px. Lazy images with `srcset` at 500/960/1280, fixed aspect ratios in CSS so nothing jumps, and a `--paper-dim` skeleton at final dimensions rather than a spinner.

## 5.3. The section opening screen, same three bands in all five

**Band 1, the icons.** Full-bleed, six to nine named features with a real photograph, before any filter UI. Heading in Fraunces, one line, with a number in it: *The nine mountains people come to Europe for.* If a section cannot fill this band from its own data, its coverage is broken, and this band is how you notice.

**Band 2, the useful cuts.** Four to six horizontal rails, each a saved filter, each titled by intent rather than genre. Card height 220 px, snap scrolling, visible prev/next on desktop, a dot indicator. Titles: *Reachable without a car*, *Swimmable in June*, *A cable car to the top*, *Traffic-free the whole way*, *Under two hours from an airport we price*, *Quiet in August*.

**Band 3, the full grid** with the filter rail, which is roughly what exists today.

Above it all, once the hero leaves the viewport, a **sticky section rail**: a thin `--paper-dim` strip with the band names and a count. Tapping jumps and opens.

## 5.4. The detail page, shared skeleton

Desktop is a 60/40 grid with a `position: sticky` map column. Mobile stacks the map under the hero. Order, top to bottom:

1. **Hero**, the view image full-bleed at 56vh, with a semi-transparent strip across the lower third carrying exactly three things: difficulty in plain words, the one-word type, and the headline number. Title in Fraunces over it, ref chip in mono, region breadcrumb beneath.
2. **The hook**, one sentence with a verb or a number, 19px, `--ink-soft`.
3. **Who this is not for**, two lines, in a `--paper-dim` block with a hairline top and bottom, no icon, no colour. Its plainness is the point.
4. **The map**, sticky, with the 3D toggle top-right and "Fly the route" as a bordered secondary.
5. **The signature visual**, section-specific and full width of the left column: the slope-coloured scrubbable profile, the three aligned month strips, the horizon silhouette, the depth section.
6. **The bento**, six to eight collapsed rows, each an icon at 20px and 1.5px stroke with no tile, a label, and a six-word summary. Tap expands one. Default state closed.
7. **Getting there**, always present, never collapsed.
8. **Take it with you**: GPX, checklist, send to phone. Bordered secondaries.
9. **Three ways out**, computed: easier, cheaper, nearby.
10. **Where this comes from**, collapsed: sources, licences, last checked month, and the sourced/derived/estimated split.

**One `--accent` filled button on the page.** Everything else is a `--rule` bordered secondary. `--gem-ink` teal appears only on a genuine hidden gem. The ochre `--rate` seal appears only on ratings.

## 5.5. Per-section visual identity, within one system

Each section gets **one signature visual and one accent behaviour**, so the five feel related but not identical. No new hues: the differentiation is in form, not colour.

| Section | Signature visual | Card data strip | Map line treatment |
| --- | --- | --- | --- |
| **Trails** | Slope-coloured elevation profile, scrubbable, with the marker driven by `highlightAt(along_m)` | Elevation sparkline | `--accent` route line with a white casing, slope bands on 3D |
| **Cycling** | 100%-wide surface bar with kilometres per class, plus the traffic-exposure bar beneath it on the same axis | Surface bar, 6 px, three or four segments | Line coloured by surface class, dashed where unpaved |
| **Beaches** | Three twelve-cell month strips aligned on one axis: sea temperature, wave height, crowding | Sea-temperature strip, bars above 20 °C filled | No line; a shore polygon and a compass rosette for orientation |
| **Lakes** | Depth-versus-area wedge expanding into the hypsometric cross-section | Swim-season bar with peak temperature at the crest | Shore polygon with a walkability ring showing the share of shore with a path |
| **Mountains** | 360° horizon silhouette with five to eight named peaks and their distances | Altitude bar with the prominence portion solid | Summit marker with a translucent viewshed overlay |

The rule that keeps them a family: **every one of these is the same 12-cell or 100%-wide geometry, in mono labels, on `--paper-dim`, with one hairline axis.** Read them side by side and they are obviously the same instrument.

## 5.6. Motion and feel

Every tap changes state on touch, before any data arrives: the control compresses, shifts shade, or fires a haptic. Carousel swipes, accordion chevrons, info dots, filter chips. Shared element transition when a card opens into the detail page, the card's image expanding into the hero rather than the page going blank. Skeletons at final dimensions, never spinners. `prefers-reduced-motion` honoured on all of it, including the flyover, which becomes a static oblique when reduced motion is set.

## 5.7. The quality floor, unchanged

380 px wide with no horizontal scroll. Visible keyboard focus. Headings in order, one `h1`, real `<a>` and real `<button>`. Text contrast at least 4.5:1, and `--ink-mute` only for metadata at 12–14px. The EU Accessibility Act has applied since June 2025, so **EN 301 549 / WCAG 2.1 AA is a legal requirement, not a nicety**, for an app sold into the EU.

---

# Part 6. Trails

Current: 17,619 rows, 79% with no image, Germany holding 27% of them, Turkey and Ukraine at zero.

### 6.1. Build a famous-trail registry per region, from evidence rather than memory

Assemble candidates for every NUTS3 region and every GMBA range from four independent sources, and store `data/trails/famous_registry.json` with name, region, source and evidence score: **Wikidata** (`?t wdt:P31/wdt:P279* wd:Q2143825` with `wdt:P625`, pulling `P402` the OSM relation id, `P2043` length and `P18` image; CC0, no key); **Wikipedia pageviews** summed across language editions as the fame ranking; **OSM `wikipedia` and `wikidata` tags** on both relations and ways, from a Geofabrik extract filtered with `osmium tags-filter`; and **national open portals** where they exist.

**Europe:** Wikidata and Wikipedia are global and language-agnostic, so this step covers all 47 countries identically on day one, including Turkey and Ukraine. The national portals are an accuracy upgrade in about ten countries, not a prerequisite.

### 6.2. Run the named-ways derivation everywhere, not in five countries

`derive_routes.py` currently runs only where relation culture is weak. That restriction is exactly why Sentier des Roches cannot exist: about twenty ways named `Sentier des Roches [secteur 1..8]`, every one tagged `sac_scale=demanding_mountain_hiking` and `wikipedia=fr:Sentier des Roches`, and no relation anywhere. Chain named ways by normalised name (strip `[secteur N]`, `Etappe N`, `Abschnitt N`, `tappa N`) or by a shared `wikipedia`/`wikidata` tag. Snap across gaps under 250 m and mark them as gaps rather than joining silently.

**Europe:** one flag change, all 47 countries. This is the single highest-recall-per-hour change in the document. It recovers Ruta del Cares in Spain, Hardergratweg in Switzerland, and the equivalent in every country where the local mapping habit is "name the path" rather than "build a relation".

### 6.3. Publish parent pages for stage families

1,635 rows are stages and only 313 parents exist. 540 of 594 stage groups have no parent at all: **37,507 km of trail that no page represents**, including the England Coast Path, the Goldsteig and GR 5 Vosges. A parent page carries total distance and climb, a stage list with per-stage GPX, and is exempt from the continuity gate, because a long path is an itinerary of stages and never offers one file.

**Europe:** stage families exist in every country with long-distance paths. The E-paths E1 to E12 all exist as OSM super-relations and Wikidata items, so this also gives you twelve pan-European parent pages for free.

### 6.4. Compose the route when the data holds only fragments

`carta_compose` already builds 215 city walks. Use the same machinery for a famous walk OSM holds as unnamed segments: route between known waypoints with the Valhalla instance, label `source: carta_compose` with waypoints and reviewer, require human approval before publishing. Provenance order stays visible: harvested relation, then derived way-chain, then composed route. A composed route is never presented as an official waymarked relation.

**Europe:** this is the mechanism that closes the last mile in the Balkans and Turkey, where the official GPX is all-rights-reserved but the waypoints are public knowledge.

### 6.5. Ship the honest stub when it truly is not possible

For a registry entry that cannot be built: the name, the region, the fame evidence, what is known (length, ascent, season), and a line in the user's own language: *No open route data exists for this walk yet. Here is where to get the track.* Then one outbound link and an "upload a GPX" affordance.

Link out honestly, because ingesting is not an option: **Komoot has no public API**, only iframe embeds and a partner profile; **AllTrails has no developer API** and is DataDome-protected, so scraping breaches both the terms and the database right; **Wikiloc's user GPX is licensed to Wikiloc**, and the 2010 OSM–Wikiloc correspondence is the canonical example of why those licences do not chain into an ODbL-derived product. **Outdooractive** is the one buyable route API, but its terms require view-tracking calls, a fixed attribution string and `noindex` on third-party content, which removes its SEO value entirely.

**Europe:** the stub is what makes the coverage contract truthful in the twelve countries where partnership is still pending, rather than a blank grid.

### 6.6. Apply the title ladder

Wikidata label → a real source name → `from` → `to` → landmark formula → shape plus place. Cap at 42 characters on a word boundary. The original string becomes a mono `ref` chip. Region goes in the subtitle, never the title.

**Europe:** 1,295 code-only names, 443 starting with a digit and 631 over 55 characters are distributed across every country; the ladder is language-agnostic and the Wikidata rung gives correct diacritics and local spellings automatically.

### 6.7. Make the view render the default hero, not the fallback

Terrain render with the route drawn on it, elevation sparkline overlaid, grade chip top-right, plus the view image from Part 2 wherever a viewpoint exists on the route. For trails, rung 2 is the default and rung 1 the exception, because a hillshaded render of the actual terrain is more useful than a borrowed photograph of the nearest town.

**Europe:** terrain covers 100% of rows in 100% of countries. This is the only imagery approach that does.

### 6.8. Fix the five user-visible data bugs

Mount Korab (9) is stored summit-to-village and shows **+7 m** on a line dropping 1,400 m: orient one-way routes uphill or show both climb and descent. `difficulty: moderate` and `f.g: very_hard` disagree on the same row and the UI prints the second. The Korab (9/1) trailhead is in Radomirë, Albania and the page says North Macedonia: derive the region from the start point. Highlights render in Macedonian Cyrillic when `name:en` and `name:sq` both exist: prefer `name:en`, then local Latin, then other scripts. And "12.1 km, a comfortable day out" sits next to 1,568 m of climb: the copy generator must read the numbers it is describing.

### 6.9. Derive Underfoot instead of printing "not mapped"

Median surface coverage is 63%, so Korab's 8% is the tail, not the norm. Derive the split from `highway`, `tracktype`, `smoothness`, `sac_scale` and `trail_visibility` plus DEM roughness, using cycle.travel's inference approach with regional adjustment, label it estimated, and keep the unknown share visible.

**Europe:** `sac_scale` is sparsely tagged outside DACH and Slovenia, which compounds the Balkan gap, so the DEM-roughness term has to carry more weight there. Say so in the label rather than hiding it.

### 6.10. Sort by fame, not by rating

The top-rated trail in a region has no photo 54% of the time, is a stage or a national route 22% of the time, and has a code for a name 7% of the time. The rating is measuring data completeness. Default sort becomes `0.5·log(pageviews) + 0.2·(has Wikidata) + 0.15·(≥3 language Wikipedias) + 0.15·(OSM completeness)`, with the existing rating available as a secondary sort.

### 6.11. Cap Germany, uncap everyone else

Apply the fame threshold hard in over-covered countries. Germany at 4,674 should publish perhaps 800 and hold the rest as searchable-but-unlisted, and the honest line under the filter is *We map 4,674 waymarked walks in Germany and list the 800 people actually travel for.* This is not deleting data, it is admitting that a 3 km `Rundweg` outside Happurg is not a destination.

---

# Part 7. Cycling

Current: 506 routes for a continent, with five countries at zero.

### 7.1. Read superroutes, which is why Italy is zero

Italy is not unmapped: the OSM wiki tracks BI-1 to BI-22 as relations with a completeness percentage, Alpe Adria at 100%. The near-certain cause of zero is that long Italian ciclovie are modelled as **`type=superroute`** whose members are other relations, not ways. Read `type=route` **and** `type=superroute`, flatten into a parent with stage children, and publish partial routes with a `state` field rather than dropping them. Green Velo in Poland is one well-formed relation (id 5141547) and you have one Polish route per 111 km of it, which is the same bug.

**Europe:** one extractor change fixes Italy, Iceland, Bosnia, North Macedonia and Albania, and materially improves Poland, Greece, Bulgaria and Lithuania. It is the highest-value single change in the whole document measured in countries per hour.

### 7.2. Group by `cycle_network`

`network=icn|ncn|rcn|lcn` is only a hierarchy level. `cycle_network` carries the operator namespace: `EuroVelo`, `UK:National Cycle Network`, `DE:D-Netz`, `IT:Bicitalia`, `BE-VLG:*`, `AT:*`. Group by `cycle_network` + `ref` + parent, and you get one `EuroVelo 6` with country and stage children, which is both the right model and the fix for `EuroVelo 6 - part Austria - leg 3 common (Ottensheim - St. Georgen)`.

### 7.3. Ingest EuroVelo, which went open in 2024

EuroVelo GPX went **open under ODbL in October 2024**, per route and per stage, in two variants: full route and developed sections only. Surface the developed-versus-planned flag, because it is precisely what a tourer needs and nobody shows it. No bulk endpoint, so collect the 17 routes' stages or ask the EuroVelo Management Team.

**Europe:** roughly 90,000 km across every country EuroVelo touches, which is most of them, under a licence compatible with what you already ship.

### 7.4. Add the national networks, in value order

Switzerland (opendata.swiss, national + regional + live closures), UK (Sustrans, with its own traffic-free classification), Belgium (Toerisme Vlaanderen node network, Wallonia RAVeL ~1,500 km), France (ON3V, ~60 numbered V-routes against your 19), Germany (Radnetz D-Routen), Spain (CNIG Vías Verdes layer, ~2,900 km), Italy (Bicitalia GPX and the Acquedotto Pugliese ~500 km aqueduct road, which is near-perfect Carta content). Netherlands stays on OSM because the node network is excellent there and Routedatabank is a licensed B2B product.

**Europe:** seven national ingests, all open, closing the seven largest remaining holes after the extractor fix.

### 7.5. Do not ingest node networks as routes

Knooppunten and Knotenpunkte in NL, BE, north-west DE and northern FR are not routes: each node pair is a tiny relation with a `ref` like `04-35`. Ingesting them raw adds tens of thousands of 3 km fragments and destroys the catalogue. Either build a routable node graph and offer "make me a 40 km loop from node 42" as a separate feature, or leave them out and say so.

### 7.6. Show what a cyclist actually decides on

**Surface mix** from `surface`, `tracktype`, `smoothness`, with class-based defaults where the tag is missing and an explicit unknown share, rendered as one 100% stacked bar with kilometres per class. **Traffic exposure** from `highway` class, `maxspeed` and parallel segregated cycleways: % traffic-free, % quiet lane, % main road. **Gradient** from GLO-30 sampled every 25–50 m: max gradient and kilometres above 4%, because total ascent hides a 12% wall. **Logistics**: stations within 2 km, loop or one-way, longest gap without water or a shop, bike shops, campsites, e-bike charging.

**Europe:** all four are derived from OSM tags that exist everywhere; the only curated table is national bike-carriage rules on trains, which has no open source anywhere and is a one-off manual table of about 30 rows.

### 7.7. Difficulty per bike type

Komoot rates separately for Bike, Road, Gravel, MTB, E-Bike and E-Road because an e-bike changes the answer on the same route. Turn the `bike` field into a small matrix and default to the user's last choice. Add Bikepacking.com's third axis, **resupply and logistics**, because it is what touring sites always omit and you can compute it for free.

### 7.8. Prevailing wind by month

Global Wind Atlas or ERA5 monthly means, dominant direction against route bearing, one line: *Ride west to east in May, the wind is behind you six days in ten.* On the Danube or EuroVelo 6 that sentence is worth more than any photograph, and nobody publishes it.

**Europe:** ERA5 is global, free and explicitly permits commercial use with attribution, so this works identically in all 47 countries.

### 7.9. The card is a specification, not a postcard

Route glyph on `--paper-dim`, surface bar as the 6 px strip, elevation sparkline behind it at low opacity, mono row of distance, % traffic-free and the surface headline. Cycling is the section where Mapillary view images work best, so use them for the gallery: the actual surface at kilometre 12, looking forward.

---

# Part 8. Beaches

Current: 2,746 rows, good images, Iberian bias, Turkey absent.

### 8.1. Rebuild the candidate list on the EEA dataset

**14,861 coastal designated bathing waters in the EU-27 for 2025**, plus 119 in Albania and 160 in Switzerland, each with a stable id, name, water category, NUTS region, coordinates and a classification for every season since 1990. XLSX bulk, CC BY 4.0, commercial reuse with attribution. Join each point to the nearest OSM `natural=beach` polygon within 300 m for geometry, `surface`, `nudism`, `dog`, `wheelchair` and services.

**Europe:** this takes Greece from 178 toward ~1,600, Italy from 176 toward several thousand, Albania from 5 to 119, Croatia and Bulgaria and Romania to their real numbers, all from one download. Montenegro, Bosnia and Turkey do not report to the EEA, so they need national sources or an honest `no_open_data` code — and Turkey in particular deserves a national effort because the Turquoise Coast is a headline destination.

Realistic target after the join: **18,000 to 20,000 coastal rows, of which 6,000 to 8,000 deserve a full detail page.**

### 8.2. Show the water quality history, because you will be the only one

Ten cells, one per season, on the official EEA colour scale, about 90 × 12 px so it fits on the card. A beach that has been excellent for a decade and one that was poor twice in three years currently look identical in your product. Blue Flag and Tripadvisor both show a single badge; you would show the trend.

### 8.3. Sea temperature by month

Sample Copernicus Marine OSTIA L4 at the nearest sea pixel, store twelve integers, render as twelve bars with a threshold line at 20 °C, bars above filled and below hollow, only the current month labelled. Drives the card line *swimmable Jun to Oct*.

**Europe:** global product, every European coastline, one build-time job.

### 8.4. Beach orientation, the cheapest distinctive feature here

Compute the outward normal azimuth from the beach polygon or the coastline segment. 250°–320° is a sunset beach. East-facing gets morning sun and afternoon shade. North-facing in the Mediterranean is exposed to the Mistral and the Tramontana. Render as a 24 px compass rosette with a filled wedge and a sun glyph when it faces sunset.

**Europe:** pure geometry on OSM coastline, which is complete for every European country. No gaps, no licence, no cost.

### 8.5. Walk-in time and descent

Path length from the nearest parking or road to the beach polygon, plus elevation delta from GLO-30: *8 min walk, 60 m descent, steps.* Rendered as a 60 × 16 px descent wedge with a minutes badge. The difference between a beach you park at and a twenty-minute cliff scramble is the whole decision for a family.

### 8.6. Wave exposure

Copernicus Marine wave products give mean significant wave height per month; derive **% of days with Hs > 1 m**. That single number splits the calm family bay from the Atlantic surf beach and gives you a free surf-and-kite filter. Two-tone sparkline with a shaded calm band under 0.5 m.

### 8.7. Three strips on one month axis

Sea temperature, wave height and crowding, stacked and aligned, so reading down a single column answers *what is August like here*. Crowding has no open source: estimate from GHSL population within 10 km, parking capacity over beach length, nearby hotel count and Commons photo density, show three bands, never a number, and label it estimated.

### 8.8. Blue Flag as a year-stamped badge

FEE publishes no bulk download and no open licence; Spain had 747 flags in 2024, Greece 624 in 2026, Italy 525 beaches plus 87 marinas and 23 lakes. Annual per-country scrape, stored as a boolean plus a year, rendered as `Blue Flag 2026`. A badge with no year is a claim that quietly goes stale.

### 8.9. Surface as a mix

Sand, pebble and rock is a spectrum. One six-segment bar from sand-beige to rock-slate with a marker, plus a 40 × 40 px texture swatch cropped from a Commons photo. OSM `surface` covers perhaps half; Spain's MITECO Guía de Playas covers ~3,500 beaches with composition, length, width, occupancy, access type and parking, so Spain can be near-complete and is the model for what the others should look like.

---

# Part 9. Lakes

Current: 1,681 rows, with Germany at 182 and Finland at 34, which is backwards.

### 9.1. Pool from HydroLAKES, publish from a scored gate

HydroLAKES gives 1.4 M lakes above 10 ha with area, shore length, average depth, volume, elevation and a natural-versus-reservoir flag; GLOBathy adds modelled max depth and a depth–area–volume curve on the same key. That is the pool, and you do not publish it.

**Hard anchors, any one admits a lake:** at least one EEA designated bathing site on it; or a Wikipedia article in two or more languages; or area ≥5 km²; or inside a national park or Natura 2000 site.

**Rank within the quota** on log Wikipedia pageviews across languages, Wikidata sitelink count, Commons photo density within 2 km via the MediaWiki geosearch API, bathing-site count and best classification, OSM amenity density within 500 m of the shore, and access distance to parking, a station or a bus stop.

**Diversity penalty:** maximum three lakes per 50 km cell, or Italy returns twenty Lombardy lakes and Slovenia returns Bled five times.

**Europe:** HydroLAKES, Wikidata, Wikipedia and Commons are global, so the gate behaves identically in all 47 countries. Finland fills from Järviwiki (every lake over 1 ha, ~56,000, CC BY 4.0) and its ~300 EEA lake bathing sites; Norway from NVE's 243,000; Sweden from SMHI's ~95,000. Germany's 182 falls out naturally once the gate applies, because most of them will not clear it.

### 9.2. Use the inland half of the EEA dataset

7,428 inland sites, about 84% of them lakes, so roughly **6,200 lake bathing sites** with coordinates, names and classification; the filter is `specialisedZoneType = lakeBathingWater`. Germany alone has 1,893. This is your recall anchor, your swimmability answer and the same ten-year quality strip as beaches, all at once, which is how the two sections end up feeling like one product.

### 9.3. Compute the swim season and lead with it

Copernicus Lake Surface Water Temperature (1 km, 10-daily, Sentinel-3, 2016 onward) or ERA5-Land's lake temperature variable, counting days at or above 18 °C: *swim season 71 days, 20 Jun to 30 Aug, peak 21.4 °C.* Validate against BAFU's ~80 Swiss stations and Järviwiki's citizen readings. Directly sortable as "longest swim season", and it explains why an alpine lake at 1,800 m is 14 °C in August.

### 9.4. The depth-versus-area wedge

A 12 ha Bergsee and a 536 km² lake cannot share a linear scale. A wedge whose width is √area and whose height is max depth on a shared log scale puts both on one grid. On the detail page, expand into the hypsometric cross-section from GLOBathy, which is far more honest than a single "max depth 169 m".

### 9.5. Shore walkability

Buffer the shoreline, measure `highway=path|footway|track` length inside it, divide by shore length: *68% of the shore has a path.* Render as a ring around the shoreline glyph. This decides whether a lake is somewhere you walk around or somewhere you look at from a car park, and nobody publishes it. Pair it with the shoreline development index, `Shore_len / (2√(π·area))`, straight from HydroLAKES: a high value means a many-bayed shore, which correlates with an interesting walk.

### 9.6. Motorboats, altitude, colour

Motorboat rules are mostly national or regional law, not per-lake tags: Austria and Bavaria ban combustion motors on most lakes. Encode as a country or region rule with per-lake overrides and show one icon, because "no motorboats" is exactly what a quiet-swim seeker wants. Altitude comes free from HydroLAKES as a 0–3,000 m ribbon. Turquoise glacial colour, the actual reason someone picks Braies over the lake next door, comes from a Sentinel-2 green-to-blue reflectance ratio, or approximately from lake type plus elevation above 1,500 m plus a glacier in the catchment; even the approximation, labelled estimated, is worth a chip.

### 9.7. Hazards and algae

You already carry hazards, which is more than most lake directories. Add blue-green algae where a source exists: Järviwiki for Finland, the Länder atlases for Germany. There is no pan-European feed, so state the coverage honestly rather than showing an empty field on 1,600 lakes.

---

# Part 10. Mountains

Current: 740 rows for a continent whose Alps alone hold 61,584 named peaks.

### 10.1. Three entities, not one

A traveller asks *which mountain area*, then *which lift or viewpoint*, and only sometimes *which summit*. Build **MountainArea** (roughly 250 to 400 across Europe, keyed on GMBA ids you already carry but labelled with SOIUSA or AVE names, because those are what hikers say out loud: SOIUSA has 36 sections and 132 subsections for the Alps), **Mountain** (your existing row, expanded), and **Viewpoint** (lift top stations, passes, panorama terraces, rack-railway summits). The third is what most of your traffic actually wants and it is the one thing no competitor publishes openly.

The MountainArea hero is the range polygon with peaks, huts and lift top stations as three distinct mark types. That "which area do I go to" view is what nobody outside PeakVisor does well.

### 10.2. Target 3,000 to 5,000 mountains

Not 740, not 60,000. Assemble: all **126 European ultras** (P ≥ 1,500 m) from peaklist.org as an editorial checklist; all **82 Alpine 4,000ers**; all **416 Alpine 3,000ers with P ≥ 300 m** and as much of the **1,599 two-thousander** list as the quota allows; every national and regional highpoint; every peak with a lift, rack railway or road pass reaching or near it, roughly 600 to 900 in the Alps alone; the British lists curated rather than complete (282 Munros against your 59, 222 Corbetts, a selected few hundred of 2,009 Marilyns); and the Tatra, Balkan, Pyrenean, Scandinavian, Icelandic and Canarian equivalents.

For prominence, do not rely on Wikidata's `P2660`, which is thin. **`akirmse/mountains` is MIT-licensed and computes prominence and isolation directly from Copernicus GLO-30**; the published worldwide dataset holds about 7.8 M peaks above 100 ft of prominence, and the 2023 GLO-30 re-run found 24% more P300 peaks than the previous SRTM pass. Set the floor above 300 ft outside well-surveyed areas, because GLO-30 is a surface model that includes trees and buildings.

**Europe:** GLO-30 and the prominence tool are global, so Turkey, Ukraine, the Balkans and Iceland are computed on exactly the same basis as Switzerland. The named lists are a Wikipedia read, not a licence negotiation. This is the section where the "all of Europe" requirement is easiest to genuinely meet.

### 10.3. "How you get up" as the primary badge, computed not curated

Fully derivable from OSM: `aerialway=cable_car|gondola|chair_lift|funicular`, `railway=funicular`, `railway=rack`, `aerialway=station`, plus `mountain_pass=yes` and the highest road node within a radius. Derive four values: **drive-up / lift-up / hike-up / technical**. Render as a four-slot icon row, filled or ghosted, with the vertical metres left on foot after the last mechanical assist: *cable car to 2,600 m, then 340 m on foot, about an hour.* This replaces the hand-curated `lift` field with something that works in every country, and it is the badge that belongs on the card.

OpenSkiMap publishes OSM-derived ski area and lift GeoJSON under ODbL; OpenSkiStats publishes computed per-area metrics under CC BY 4.0.

### 10.4. The horizon silhouette, the signature asset

Compute the horizon from the summit on GLO-30 and intersect it with your peak table to name what sets the skyline. Static SVG polyline with five to eight labelled peaks and their distances. Unique per mountain, cheap to generate once, dark-mode safe, compresses to a 60 px card footer with three labels.

It answers the only question that matters to a traveller on a mountain page: **what will I actually see from up there.** Gornergrat is sold on "29 peaks above 4,000 m", not on its own height.

**Europe:** DEM plus your own peak table, so it works identically everywhere, including where no photograph exists. This is the mountains section's version of the synthetic view render.

### 10.5. Make the view score objective

Your `views` component is 0.324 on the Dachstein, a number with no visible reasoning. Replace it: GRASS `r.viewshed` on GLO-30 from the summit, total visible area within 100 km, plus 360° openness from `r.horizon`. A cheap proxy if the full viewshed is too slow across 5,000 peaks: elevation minus mean elevation within 20 km, combined with prominence. Either way print the reasoning: *sees 3,100 km² within 100 km, open in 340° of 360.*

### 10.6. The altitude-versus-prominence glyph

A vertical bar where total height is elevation and the solid portion is prominence. A 1,000 m hill with 950 m of prominence reads instantly as a real mountain; a 3,000 m top with 60 m of prominence reads as a bump on a ridge. Best way to explain prominence without a paragraph. On the detail page, add the comparison scale bar: this mountain next to Mont Blanc at 4,808 m, or next to the highest peak in the country of the user's departure airport, which you already know.

### 10.7. Comparative rankings, free and engaging

You store range, country and height. *3rd highest in the Julian Alps*, *17th highest in Austria*, *highest point of the Dachstein Mountains* are pure sort-and-count. PeakVisor leads with these because people read them.

### 10.8. Snow line and lift window as one strip

Twelve cells, snow / shoulder / clear at summit altitude, with the lift's operating window as a bracket over it. Answers *can I actually do this in April*. Derive the snow band from elevation, aspect and latitude and label it estimated; lift opening dates are not open data.

### 10.9. Link out for live conditions

Lift prices, hut booking, avalanche status and current webcams are not derivable and go stale fast. Bergfex already does live weather, webcams and snow across the Alps; foto-webcam.eu, Panomax and Roundshot do panoramas. A "check conditions" row of three outbound links is honest and useful; a stale price printed as fact is not.

---

# Part 11. Order of work

### 11.1. Week one, the extractor and the titles

Cycling superroutes and `cycle_network` grouping (7.1, 7.2). The trails named-ways pass everywhere (6.2). The five visible trail data bugs (6.8). The title ladder across all five sections (6.6, and its cycling variant). No new data, no new UI, and between them they fix five zero-countries and every ugly title in the product.

### 11.2. Week two, the two downloads that reshape two sections

EEA bathing water for beaches and lakes (8.1, 9.2). HydroLAKES plus GLOBathy (9.1). Two files, two join jobs, and beaches goes from 2,746 to ~18,000 candidates while lakes gets a defensible selection rule for the first time.

### 11.3. Week three, the imagery system

The free Commons filters and the Haiku scoring pass. Then the terrain render pipeline and the route glyph generator. Then the **view render** from Part 2, starting with mountains, where the horizon silhouette and the summit view are the same computation. Do the renders before hunting photographs: once every row has an honest visual, the pressure to find a photo for a remote Balkan trail disappears.

### 11.4. Week four, 3D and the registry

MapLibre 6.10 terrain toggle and the flyover (3.2, 3.5). The pre-rendered card heroes (3.4). In parallel, the famous-trail registry and the CI coverage gate (6.1, 0.4), the mountain target lists and Kirmse prominence (10.2), and the EuroVelo and national cycling ingests (7.3, 7.4).

### 11.5. Week five, the derived modules

Beach orientation and walk-in time (8.4, 8.5). Sea and lake temperature strips (8.3, 9.3). Surface and traffic exposure (7.6). The horizon silhouette and how-you-get-up row (10.3, 10.4). Shore walkability (9.5). Each is independently shippable and each one turns a listing into an instrument.

### 11.6. Week six, the user-facing layer

The `<InfoDot>` and glossary (4.1). The plain-language number translations (4.2). "Who this is not for" (4.5). The honest coverage lines (4.6). The detail-page skeleton (5.4) and the per-section signature visuals (5.5).

### 11.7. Last, the opening screens

Bands 1 to 3 (5.3) and the 3D section heroes. Deliberately last: a screen that showcases the best of a section is only worth building once the section has a best to show.

### 11.8. Ongoing, the partnerships

Email, in this order: Culture Routes Society (Turkey, unlocks the Lycian Way and the whole Turkish section), Tășuleasa Social (Via Transilvanica), the Via Dinarica programme, HPS for Via Adriatica, and the Greek NECCA national trail registry once its certified trails become downloadable. All are NGOs or public bodies and all are realistic yeses.

---

# Part 12. Data source appendix

| Source | Sections | Licence | What it gives |
| --- | --- | --- | --- |
| [EEA Bathing Water Directive](https://www.eea.europa.eu/en/datahub/datahubitem-view/c3858959-90da-4c1b-b9ca-492db0e514df) | Beaches, Lakes | CC BY 4.0 | 22,289 sites, 1990–2025 classification history, coordinates, coastal/lake/river type |
| [HydroLAKES](https://www.hydrosheds.org/products/hydrolakes) | Lakes | CC BY 4.0 | 1.4 M lake polygons ≥10 ha, area, shore length, volume, elevation, natural/reservoir |
| [GLOBathy](https://www.nature.com/articles/s41597-022-01132-9) | Lakes | CC BY 4.0 | Modelled max depth and depth–area–volume curves on HydroLAKES ids |
| [Copernicus DEM GLO-30](https://registry.opendata.aws/copernicus-dem/) | All | Free, attribution | Profiles, prominence, viewsheds, horizons, terrain renders, walk-in descent |
| [Mapterhorn](https://mapterhorn.com/data-access/) | All | BSD-3 code, open data | Terrarium terrain tiles built from national LiDAR across Europe, planet PMTiles |
| [akirmse/mountains](https://github.com/akirmse/mountains) | Mountains | MIT | Prominence and isolation from any DEM; a published 7.8 M peak dataset |
| [GMBA Inventory v2](http://www.earthenv.org/mountains) | Mountains | CC BY 4.0 | 8,327 range polygons, 10-level hierarchy |
| [SOIUSA / AVE](https://en.wikipedia.org/wiki/SOIUSA) | Mountains | Wikipedia, CC BY-SA | The range names hikers actually use: 36 sections, 132 subsections in the Alps |
| [EuroVelo GPX](https://pro.eurovelo.com/news/2024-10-09_eurovelo-gpx-tracks-go-open-data) | Cycling | ODbL | 17 routes, ~90,000 km, per stage, full and developed variants |
| [Sustrans NCN](https://data-sustrans-uk.opendata.arcgis.com/) | Cycling | OGL-style | UK network with its own traffic-free classification |
| [Veloland / Wanderland](https://opendata.swiss/en/dataset/langsamverkehr-veloland-schweiz) | Cycling, Trails | Open, attribution | Swiss national, regional and local routes plus live closures |
| [ON3V véloroutes](https://www.data.gouv.fr/datasets/velo-routes-on3v) | Cycling | Licence Ouverte | France's ~60 numbered V-routes |
| [Vías Verdes at CNIG](https://www.cartografiadigital.es/2022/09/vias-verdes-en-el-centro-de-descargas.html) | Cycling | CC BY | ~2,900 km of Spanish rail-trail |
| [Toerisme Vlaanderen node network](https://data.toerismevlaanderen.be/tourist/routes/cycling_node_network_v2) | Cycling | Open | Flemish cycling node network |
| [RAVeL, Géoportail Wallonie](https://geoportail.wallonie.be/) | Cycling | Open Walloon | ~1,500 km of car-free rail-trail |
| [Kartverket Turrutebasen](https://www.kartverket.no/en/api-and-data/friluftsliv) | Trails | NLOD | Norway's national trail database, GPX/GML/PostGIS |
| [IGN Géoplateforme](https://geoservices.ign.fr) | Trails, Imagery | Licence Ouverte 2.0 | BD TOPO paths, RGE ALTI, 20 cm orthophotos |
| [refuges.info](https://www.refuges.info/api/doc/) | Trails, Mountains | CC BY-SA 2.0 | Huts, springs, summits as GeoJSON/GPX, no key |
| [Waymarked Trails](https://hiking.waymarkedtrails.org/) | Trails, Cycling | Open API, OSM | The only pan-European open route aggregator; use it to diff what should exist per country |
| [Järviwiki](https://www.jarviwiki.fi) | Lakes | CC BY 4.0 | Every Finnish lake >1 ha with citizen temperature, algae, ice and clarity |
| [NVE Innsjødatabase](https://www.nve.no/kart/kartdata/vassdragsdata/innsjoedatabase/) | Lakes | NLOD | ~243,000 Norwegian lakes |
| [SMHI SVAR](https://vattenwebb.smhi.se/ladda-ner-data-svenskt-vattenarkiv) | Lakes | Open | ~95,000 Swedish lakes |
| [Copernicus LSWT](https://land.copernicus.eu/en/products/temperature-and-reflectance/lake-surface-water-temperature-near-real-time-v1-0-1km) | Lakes | Copernicus free | 1 km, 10-daily lake temperature, 2016 onward |
| [Copernicus Marine OSTIA](https://data.marine.copernicus.eu/) | Beaches | Free, registration | Sea surface temperature and wave height climatologies |
| [MITECO Guía de Playas](https://datos.gob.es/es/catalogo/e0dat0002-servicio-wms-web-map-service-guia-de-playas-de-espana) | Beaches | Spanish reuse | ~3,500 Spanish beaches with composition, length, access, parking |
| [Wikidata SPARQL](https://query.wikidata.org/) | All | CC0 | Names in 20+ languages, coordinates, elevation, area, OSM relation ids (P402), Commons images |
| [Wikipedia pageviews](https://wikitech.wikimedia.org/wiki/Analytics/AEM/Pageviews) | All | Free | The fame ranking that fixes every "best in region" list |
| [Commons API + SDC](https://commons.wikimedia.org/wiki/Commons:Structured_data/Modeling/Location) | All | Per-file CC | Photos, **P1259 point of view, P9149 depicted place, P7787 heading** |
| [Mapillary API v4](https://www.mapillary.com/developer/api-documentation) | All | CC BY-SA 4.0 | Street and path-level imagery with `compass_angle` and 360° `is_pano` |
| [Panoramax](https://docs.panoramax.fr/) | All | etalab-2.0 (IGN instance) | 105 M+ open street-level images, STAC API, `view:azimuth` |
| [Flickr API](https://www.flickr.com/services/api/) | All | Per-photo CC | Geotagged scenic panoramas, the best source of actual view photographs |
| [Natura 2000](https://www.eea.europa.eu/en/datahub/datahubitem-view/6fc8ad2d-195d-40f4-bdec-576e7d1268e4) | All | EEA reuse | Protected-area context. **Use instead of WDPA** |
| [GHSL population](https://human-settlement.emergency.copernicus.eu/datasets.php) | Beaches, Lakes | Free, JRC | The crowding estimate |
| [CLC+ Backbone](https://land.copernicus.eu) | All | Copernicus free | 10 m annual land cover: what is around this place |
| [Overture Maps](https://docs.overturemaps.org/attribution/) | All | **Places CDLA-Permissive**, rest ODbL | 60 M+ deduplicated confidence-scored POIs with no share-alike |
| [Mobility Database](https://mobilitydatabase.org) | All | Free | 6,000+ GTFS feeds, 99+ countries |
| [Transitous / MOTIS](https://transitous.org) | All | Free / AGPL | "Can I get there without a car", no API key |
| [ERA5 / Copernicus CDS](https://cds.climate.copernicus.eu/) | All | Explicitly commercial-OK | The best-months climatology, wind, snow |
| [Open-Meteo](https://open-meteo.com/en/pricing) | All | Free non-commercial; $10/mo Standard, **$50/mo Professional** for historical | Live 7–16 day forecast only |
| [GRASS r.viewshed / r.horizon](https://grass.osgeo.org/grass83/manuals/r.viewshed.html) | Mountains | GPL | Objective view quality and the horizon line |
| [horizonator](https://github.com/dkogan/horizonator) | Mountains, Trails | LGPL | Headless DEM panorama rendering |
| [OpenSkiMap](https://openskimap.org/) | Mountains | ODbL | OSM-derived ski areas and lifts |
| [Global Wind Atlas](https://globalwindatlas.info) | Cycling | Open | Prevailing wind by month |

**Deep-link only, never ingest:** Komoot (no public API, embeds only), AllTrails (no API, DataDome-protected, ToS and database right), Wikiloc (user GPX licensed to Wikiloc; the 2010 OSM–Wikiloc correspondence is why those licences do not chain), Blue Flag (annual scrape as a year-stamped badge), peakbagger and peaklist (editorial checklist), Google Street View (storage prohibited), foto-webcam / Panomax / Roundshot (live embed only).

**Do not use:** WDPA / Protected Planet (commercial redistribution prohibited without a signed request; Natura 2000 is the substitute), EOX Sentinel-2 cloudless free tiles (CC BY-NC-SA), Esri World Imagery (licensed only inside Esri-approved apps), Google Photorealistic 3D Tiles (403 for EEA-billed projects since July 2025).

**Buyable if you choose:** Outdooractive route API (view-tracking calls, fixed attribution, `noindex` on third-party content), Open-Meteo Professional at $50/mo for the historical endpoints, EOX Sentinel-2 cloudless commercial licence.

---

# Part 13. Completeness check

What this document covers, so you can see what it does not.

| Requirement | Where | Status |
| --- | --- | --- |
| Cover all of Europe, per point | Part 0.4 contract, Part 1 tiers, plus a **Europe:** line on every coverage item | Covered |
| Country-by-country plan | Part 1, six tiers, all 47 countries assigned | Covered |
| Images showing the view you get | Part 2, five rungs, with the synthetic render as the 100%-coverage answer | Covered |
| Is 3D added | Part 3, yes, MapLibre 6.10 + Mapterhorn, ~€5/month, ~€10 one-off | Covered |
| More data sources | Part 12, 40 sources with licences and verdicts | Covered |
| User-oriented, not technical | Part 4, glossary, number translations, banned surface terms, three questions | Covered |
| Visual design per page | Part 5, card, grid, opening screen, detail skeleton, per-section signature visual, all on the shipped tokens | Covered |
| Titles | 6.6 ladder, applied to all five sections | Covered |
| Navigation and first impression | 5.3 three bands, sticky rail, and the useful cuts | Covered |
| Honest coverage in the UI | 0.4 reason codes, 4.6 plain-language lines, 1.7 coverage dashboard | Covered |

**Not covered here, deliberately:** the Trips category, which has its own spec. Pricing and the departure-airport flow, which belong to the trips work but should eventually reach Destinations too, because "drive time and cost from your airport" is a natural stat on a mountain or beach page. Search and the global search index. The Trip Planner integration beyond "Add to day". Offline use. Anything about accounts, saved lists or notifications.

**The one thing I would add next that is not in here:** once the departure airport is remembered (item I1 in the trips spec), every Destinations card can carry *how far this is from where you fly into and what that leg costs*, which is the only thing in this whole product that no competitor can copy.

---

# Part 14. Open decisions

- **Trails scope.** Run the registry and coverage gate across all 47 countries at once, or prove it on three (Albania, France, Poland) first? The gate is only useful once it fails the build, so it needs a country you are willing to be blocked by.
- **Germany.** Cap the published trail list at roughly 800 by fame threshold, or keep all 4,674 and fix it with sorting alone? Capping makes the catalogue feel curated; keeping makes it feel large. I would cap and say so.
- **Beaches volume.** Publish all ~18,000 EEA-joined coastal rows, or gate to the ~6,000 that clear a photo-and-services bar? First is better for search, second is better for browsing.
- **Mountains unit.** Build MountainArea now, or expand the peak list first? Areas first makes the peak expansion navigable; peaks first ships something visible sooner.
- **Imagery licence posture.** Mapillary is CC BY-SA, which is fine for displaying a credited photo but share-alike bites if you composite its pixels into a derived image. Panoramax's IGN instance is etalab-2.0 and cleaner but thinner outside France. Decide whether view images may ever be composited, because that decision determines which source is primary.
- **Cycling node networks.** Leave them out, or build the routable node graph and offer "make me a 40 km loop from node 42"? The second is a real product and should be scoped separately.
- **Partnerships.** Who sends the Culture Routes Society and Tășuleasa emails, and what is being offered in return? A credit line and a link is usually enough for an NGO, but it should be decided before the first email rather than after.
