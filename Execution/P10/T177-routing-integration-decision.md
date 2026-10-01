# T177 Routing integration: komoot embed or own GPX

## Task ID

T177

## Date

2026-10-02

## What changed

Nothing in the app or the pipeline. This task is the decision the spec's F1 to F3 and L7 asked for, with the terms check done and the authoring work budgeted. The decision is recorded here as recommended, pending the owner's confirmation, and nothing was built on it.

The recommendation is the second path from L7, adjusted for what Carta actually runs: hold our own track per route trip, in the same wire shape the trail pages already use, and render it on the app's own MapLibre map with the elevation chart that already exists. Not komoot's embed, and not Mapbox Outdoors, because the app has no Mapbox dependency and does not need one. The reasoning is below, followed by the terms check, the budget, and what the implementing task has to build.

## The decision

Build on our own track data. Reasons, in the order they weighed.

The authoring work is the same size on both paths, so it does not decide anything. Today zero of the 253 trips carry any geometry. The 75 route trips (24 hiking, 25 trail running, 26 cycling) have 525 itinerary days, and on 519 of them `dayStats` is a prose string such as "8 km / 450 m ascent / La Massana 1,230 m / Sorteny refuge 1,970 m / 3 h realistic", not numbers. `typeSpecific.gpxReady` is true on 30 trips and there is no file behind any of them. Whichever path is chosen, somebody has to decide where each of the 525 days starts, passes and ends, and run a router over it. Komoot's planner does the routing for free in a browser; Carta's pipeline already runs Valhalla (pedestrian costing, `tools/trailslab/valhalla`, used by `pipeline/trails/repair.py`) and BRouter (the cycling stage planner). The spec's "somebody has to author 253 tours" catch applies equally to the own-GPX path, it only changes which tool the author sits in front of.

The elevation profile, which L7 counts as the cost of the own-GPX path, is already built. `pipeline/trails/elevation.py` samples the Copernicus GLO-30 model at 30 m along any staged geometry and writes a 200-point profile with min, max, grade and steepness fields. `ElevationChart` in `continent-app/src/browse/TrailPage.jsx` draws that profile as an SVG with the walker's live position on it. The trail detail wire (`/trails/trip/{id}.json`, 17,670 files) carries `geometry` as a MultiLineString and `elevation.profile` as `[along_m, ele_m]` pairs. A journey track in exactly that shape gets the map, the profile, the GPX and KML export (`trailExport.js`), the hike-time estimate and the attribution line for nothing. T181 is about to make that profile the slope-coloured signature visual for trails and cycling; a journey that ships the same data shape inherits it, an iframe cannot.

The map is the feature on these three styles, which is the test the spec sets. Hiking, trail running and cycling weeks are sold by the line on the map and the shape of the climb. carta-design bans new hues and sets the type, the paper colour and the one accent; a komoot iframe brings its own green, its own fonts, its own chrome and a mandatory komoot link under the map. It cannot be themed from outside. On the one section where the map matters most, the page would look like a guest.

The embed is a third-party frame in the user's browser. It loads komoot's JavaScript, and komoot's cookies and analytics come with it. The telemetry decision (T071 to T073) was deliberately first-party with no cookie banner; a komoot frame on every route trip page reopens that under GDPR and the ePrivacy consent rule, and the honest fix is a consent gate in front of the map, which is a bad first impression on the page's main feature. Our own map loads Carto tiles the app already loads everywhere.

The dependency is real and one-sided. Clause 6 of komoot's terms lets them change or stop the service; clause 13 grants komoot a non-exclusive licence on everything authored in the account, and 13.2 says that licence survives termination. Clause 1.4 prohibits distributing tours by any means other than komoot's own export function, which puts the free GPX download the spec insists on (F4, task T176) on the wrong side of a line if the only copy of the route lives in a komoot tour. With our own track, T176 is `trailGpx()` on the journey file and nothing else.

What komoot would have bought is topographic cartography and a routing engine. Carta already has the engine in the pipeline and has shipped 17,670 trails on Carto Voyager, so the only thing missing from the own-track path is hillshade, and that is a basemap choice, not an integration (see open item c).

Mapbox Outdoors specifically is rejected. The app is MapLibre on Carto's hosted styles (`basemaps.cartocdn.com`, seven map components). Mapbox's hosted styles and tiles are licensed for use through Mapbox's own SDK with a token, billed per map load above 50,000 a month, and the task rules bar a new dependency. "Mapbox Outdoors" in the spec should be read as "an outdoor basemap under our own line", and the line is the part that matters.

## Terms check

Komoot's support articles are behind a Cloudflare challenge and could not be fetched from this session; what follows is from `komoot.com/terms-of-service`, `komoot.com/b2b/embed` and `komoot.business`, which could, plus search-engine excerpts of the two support articles. The owner should read the two support articles in a browser before relying on any of it (open item a).

| Source | What it says | Effect on Carta |
|---|---|---|
| komoot.com/b2b/embed | Embeds are free for personal and commercial sites, no API key, no rate limit, no expiry. Only public content renders. Every embed links back to komoot with a canonical URL. Layouts: classic (map, stats, profile), map only, compact card, photo strip. `width="100%"` for responsive. | Cost is zero and commercial use is permitted. The link back is mandatory. |
| komoot.business partner profile | Free. For tourism regions, brands, hotels and the like. Tours and collections authored there can be embedded on the partner's website. | A Carta partner profile would be the authoring account. |
| Terms of service 1.4 | "The user is explicitly prohibited to export, distribute or publish tours in other ways than with the offered export function." | A Carta-served GPX of a komoot-authored tour needs komoot's export, not our file. Conflicts with F4 unless the route is ours. |
| Terms of service 6 | komoot may change, reduce or stop services. | No contractual continuity for an embed on 75 pages. |
| Terms of service 12.3 | Use the platform only within the package overview options. | Partner profile package covers website embeds. |
| Terms of service 13.1 and 13.2 | Non-exclusive licence to komoot on uploaded content, surviving termination and deletion. | Routes authored in komoot are komoot's to show forever. |
| Terms of service 8 | Liability capped at the greater of 100 euro or twelve months' fees. | Nothing to lean on if the embed breaks. |
| Copyright guidelines (support 8241634224794, via excerpt) | Each publication must carry "Maplibre, (c) komoot, Map data (c) OpenStreetMap Contributors" at least once, preferably on the map; each route must link to its komoot page in the same font size as the description; linked tours must stay public and must not be deleted or set private. | Attribution and link-back on every route page, permanently. |

Our own path has one licence question and it is already answered in the codebase: a GPX of OSM-derived geometry is a database extract under ODbL, and `continent-app/src/lib/cycling.js` (`gpxCredit()`) and `trailExport.js` already write the required credit into the file. Legal.md section 12 holds the produced-work versus extract table. The Copernicus GLO-30 credit for the elevation is in `data_licenses.md` already.

## Budget for the authoring work

525 day stages across 75 trips. The work per stage is choosing a start, the vias and the end against the day's prose (the prose names the places and the distances already), routing it, and checking the result against the stated distance and ascent. Either tool: 10 to 20 minutes per stage once the first trip's pattern is set, so 90 to 175 hours of authoring, plus the trip-level checks. That is the same number on both paths. On our path the author writes a small stage spec per day (place names or coordinates plus a profile: hike, run, road, gravel) into a file beside the journey JSON, and a new pipeline step routes it, samples elevation, measures distance and ascent, and exports the track wire; around two days of pipeline work on top of what exists. On the komoot path the author clicks in komoot's planner and pastes a tour id per trip into the journey JSON; around one day of app work for a lazy, consent-gated iframe with the attribution line.

Where a journey day coincides with a published trail or cycling section (the Istria cycling week rides a route the cycling layer already holds), the stage spec points at that id instead of re-authoring, and the track is a reference. This will cut the 525 by some fraction that only the authoring pass can measure; it is noted so the implementing task looks for it before routing anything.

The six remaining route-day measurements that the profile replaces (distance, ascent, descent, high point, grade, time) become measured values from the track instead of transcribed prose, which also closes the E3 gap and most of A5 for these three styles.

## What the implementing task builds

Named here so the next task does not re-decide it. Not built in T177.

One new wire per route trip, `public/journeys/track/{id}.json`, in the trail detail shape: `geometry` (MultiLineString, one segment per day), `elevation` (profile, min, max, grades, source `copernicus_glo30`), `stages` (one per day, with `along_m` start and end so the day cards and T178's thumbnails can cut the line), `distance_m`, `ascent_m`, `descent_m`, `attribution_text`, `license`. Written by a new `pipeline/journeys/track.py` step from a stage spec file per trip, routing through the local Valhalla and BRouter, elevation through `pipeline/trails/elevation.py`. Nothing changes on the 178 non-route trips.

In the app, `JourneyPage.jsx` lazily mounts a map and `ElevationChart` for route styles only, from the track wire, with the same lazy maplibre pattern `DestinationsTab.jsx` uses for `TrailPage`. The day cards highlight their stage on the line. T176 serves `trailGpx()` of the track. T178 draws its thumbnails from the same track. The ElevationChart and the map line take whatever T181 settles for trails, so they stay one family.

Basemap stays Carto Voyager until the owner decides on hillshade (open item c). MapLibre can draw a hillshade layer from a terrain tile source without a new package; the choice is which tile host and its credit line, which is a licence decision.

## Files touched

**Modified:**
- Execution/_OPEN.md (register rows T177-a to T177-d)

**Created:**
- Execution/P10/T177-routing-integration-decision.md

No app files, no pipeline files, no data.

## Commands run

```
python Execution/_queue/xmind_prompt.py T181
python - <<EOF   # counts over continent-app/public/journeys/journey/*.json
# tripTypeSlug, typeSpecific.gpxReady, coordinates.precision, dayStats type per route day
EOF
python - <<EOF   # keys and elevation block of continent-app/public/trails/trip/10.json
EOF
```

Web reads: komoot.com/terms-of-service, komoot.com/b2b/embed, komoot.business/en/partner-opportunities/partner-profile and /komoot-embeds, search excerpts of support.komoot.com articles 8241634224794 and 4410064124698 (both 403 behind Cloudflare), a Mapbox pricing summary for 2026.

## Config and secrets set

None.

## Before/after measurements

The task decides rather than builds, so the figures are the baseline the implementing task starts from.

| Metric | Before | After | Delta |
|---|---|---|---|
| Trips with a route track in the wire | 0 of 253 | 0 of 253 | 0 |
| Route-style trips needing a track | 75 (24 hiking, 25 trail running, 26 cycling) | 75 | 0 |
| Day stages to author | 525 | 525 | 0 |
| Route days with numeric dayStats | 0 of 525 (519 prose strings, 6 null) | 0 of 525 | 0 |
| Trips claiming gpxReady with no file | 30 | 30 | 0 |
| Published trails with geometry and profile already in the wire | 17,670 | 17,670 | 0 |

## What broke and how it was fixed

No issues. The only obstacle was that komoot's support centre refuses non-browser clients, so the two guideline articles are quoted from search excerpts and flagged for the owner to read live.

## What is still open

The decision needs the owner's confirmation; until then it is recommended, not taken. Before confirming, the owner should open the two komoot support articles in a browser, because the attribution and link-back rules above come from excerpts, and confirm nothing has changed in 1.4 and 13 (T177-a).

The build itself is a new task: stage specs, `pipeline/journeys/track.py`, the track wire, and the JourneyPage map and profile, in that order, ahead of T176 (GPX button) and T178 (thumbnails), which both read the track (T177-b).

The basemap question is separate from the integration and needs a licence decision: stay on Carto Voyager with no relief, or add a hillshade layer from a terrain tile host with its own credit line (T177-c).

The route-day numbers are prose on 519 of 525 days. The track makes them measurable, but until the track exists E3 and A5 cannot be met for these styles from the data; the implementing task should write the measured figures back into `dayStats` as numbers rather than parsing the strings (T177-d).

## Rollback procedure

Nothing to roll back. Reverting this commit removes the report and the four register rows; no code or data depends on it.
