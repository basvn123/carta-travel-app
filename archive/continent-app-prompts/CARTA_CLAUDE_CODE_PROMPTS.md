# Carta — Claude Code prompt pack

Prompts for the UX/content items not yet implemented. Written to be pasted into
Claude Code one at a time, in the repo root (`continent-app/`).

**Before you start:** the repo now has git (`be4541c` is the latest commit, `c46f783`
is the pre-optimization baseline). Commit between prompts so each one is revertible.
There is no test runner wired to CI and no dev server was available during the audit,
so **run `npm run dev` and look at every screen a prompt touches before committing it.**

Line numbers are from commit `be4541c`. Re-grep before editing — several files are
3,000+ lines and shift easily.

---

## Already done (do not redo)

`be4541c` and `6fd3eba` shipped: the General tab removal, the six copy removals, the
Explore count line and `.xbar` rule, the Explore Filters button + shared sheet, the
duplicate country control, `CardPhoto` (srcSet on the five card layers), the gallery
shot srcSet, the transit reason rewrite (pipeline + a render-time shim), the i18n and
maplibre bundle splits, `Cache-Control`, `robots.txt`, canonical/OG, the dev-only
`?*mock` seams, and the removal of the full-screen entry gate.

---

## P1 — correctness. Do these first; they are bugs, not polish.

### Prompt 1.1 — Pagination is broken on two whole categories

```
In src/browse/DestinationsTab.jsx, `rowCount` (around line 2227) has no arm for the
cycling category or for composed itineraries, so both fall through to `tripRows`,
which is null when no country is selected.

Two consequences I have confirmed by reading the code:
  - The composed-itinerary list renders from `itinRows` and its sentinel is gated on
    `visible < itinRows.length`, but the IntersectionObserver only grows `visible`
    while `visible < rowCount`. With rowCount 0 the list is permanently capped at 36
    cards and the sentinel scrolls forever loading nothing.
  - PlacesFilterSheet receives `resultCount={rowCount}`, so on Cycling the apply
    button renders `is-empty` and the words t('filter.showNone') - "show no results" -
    with hundreds of routes behind it.

Fix rowCount to cover every category. Cycling's total is
cycleRows.routes.length + cycleRows.listed.length + cycleRows.tours.length.

Then fix two more things in the same file:
  - The cycling lists at ~3404, ~3421 and ~3441 each slice at Math.max(visible, 60)
    and the cycling block renders NO sentinel element at all. So 60 cards mount on
    first paint regardless of viewport and a country with 300 routes shows 60 with no
    way to reach the rest. Add a sentinel and slice at `visible`.
  - The scroll-reset effect at ~2232 omits these deps: grades, climbs, shapes, hls,
    suits, itinDays, itinPace, itinScale, cycleFacets, cycleSort, cycleShowLocal.
    Ticking any of those after scrolling leaves you mid-page in a 4-row result.

Verify by running the app, opening Cycling and the composed-trip list, scrolling past
36 and 60 cards, and watching the filter sheet's apply button say a real number.
```

### Prompt 1.2 — A dropped connection reads as "nothing published"

```
Every published-layer loader swallows network errors: src/lib/beaches.js:34,
lakes.js:35, mountains.js:37, trails.js:33, trips.js:46, cycling.js:56 are all
`.catch(() => null)`. Every consumer in src/browse/DestinationsTab.jsx then coerces to
[] (e.g. `setTopBeaches(top || [])` around line 1806).

Two bugs fall out of that:
  1. The UI renders t('beach.noneMatch') - a factual claim that the catalogue is empty
     - when the real cause was a dropped request.
  2. The re-fetch guard is `if (!isBeachCat || topBeaches) return;` and [] is truthy,
     so the tab NEVER retries for the life of the session.

Make the loaders distinguish three outcomes: data, `null` for "this layer is not
published for that country" (the file legitimately 404s / is served as the SPA index),
and a thrown error for a network failure. Keep a per-layer `error` state in
DestinationsTab and render a real error state with a retry button instead of the empty
state. Do not store [] on failure.

The same shape repeats for lakes (~1890), mountains (~1996), cycling (~2107, ~2119),
trails (~1216) and trips (~1690) - fix all six. src/browse/DestinationsTab.jsx around
line 1424 already handles geolocation failure correctly (it distinguishes a refusal
from a failure); mirror that tone.
```

### Prompt 1.3 — Three small crashes and a dead catch

```
Fix these four, each is self-contained:

1. src/browse/DestinationsTab.jsx ~946 and ~987: ItinCard does `tr.score.toFixed(1)`
   and `tr.cost.per_day_eur` unguarded. Every other card in the file guards
   (`tr.rating?.score ?? -1`). One malformed trip row takes the whole tab down through
   the error boundary. Use optional chaining.

2. src/browse/RegionPage.jsx ~141: the share handler calls
   navigator.clipboard.writeText() inside a synchronous try/catch. writeText rejects
   ASYNCHRONOUSLY, so the catch never fires: the button says "Copied" on a permission
   denial and the rejection is unhandled. Make it async/await.

3. src/browse/RegionPage.jsx ~113: `data` starts undefined, so during the fetch the
   page renders a container with only a back button in it - a blank screen. Only
   `data === null` gets a message. Add a loading state.

4. src/planner/TripPlannerTab.jsx ~515: `AnchorLegRow` is a component defined INSIDE
   the render body. A new component type every render means React unmounts and
   remounts that subtree on every render of the trip planner. Hoist it to module scope.
```

---

## P2 — Trips. The biggest block of the user's feedback.

### Prompt 2.1 — Hero images: views, not maps

```
Audit the hero image on every published trip and journey. The source files are under
public/trips/ and public/journeys/ (per-country index files plus per-item detail
files); the exporter lives in ~/../pipeline.

Write a script (scripts/audit-trip-heroes.mjs) that, for every trip and journey:
  - resolves the hero image URL it currently uses
  - flags it when the Wikimedia filename or its Commons categories suggest it is NOT a
    view: map, plan, karte, carte, mappa, diagram, schema, coat of arms, wappen, logo,
    flag, sign, plaque, monument-detail, interior, portrait, aerial-survey
  - flags it when the image is missing, below 800px on the long edge, or has an aspect
    ratio outside 1.2:1 - 2.4:1 (it will be cropped to 25:12 on a card)
  - flags it when the same file is the hero of more than one trip

Write the report to a JSON file listing trip id, current hero, and reason flagged.
Then, for each flagged trip, pick a replacement from the images already available on
its stops' destination records (dest.image, and the dossier gallery under
public/dossier/{id}.json which carries several per place) preferring landscape,
outdoor, wide views. Emit the replacements as a patch file the exporter can apply -
do NOT hand-edit the generated JSON under public/.

Report how many trips were flagged and how many could be auto-replaced before making
any changes, and show me the list first.
```

### Prompt 2.2 — Make the trip page compact without losing anything

```
Open src/browse/TripPage.jsx (and JourneyPage.jsx, which is the same shape). The page
is long and reads as a description rather than something to travel with.

Restructure it around a disclosure pattern, not deletion. Nothing may be removed:

1. Every section becomes collapsible. Use the existing <Fold> component from
   src/browse/DestinationPage.jsx (extract it to its own file first - it is currently
   local to that file and both pages need it).

2. Default state: the practical sections OPEN (route, transport, where to sleep, cost),
   the narrative sections CLOSED (the per-day prose, background, the "why this trip").

3. The day-by-day is the worst offender. Rewrite each day as:
     - a one-line header: Day N, the town, nights, and the day's headline in <= 8 words
     - beneath it, chips for the concrete facts: distance, drive/train time, main sight
     - the existing prose moves behind "More about this day"
   The prose must be preserved verbatim, just folded.

4. Merge these pairs into one section each, with the second as a sub-fold:
     - "Getting there" + "Getting around"
     - "Best time" + "Weather"
     - "Budget" + "Cost breakdown"

Keep every string. Take a before/after screenshot at 375px and show me both.
```

### Prompt 2.3 — Practical information travellers actually need

```
Trip pages are descriptive but not usable. Add a "Practical" section to
src/browse/TripPage.jsx, built from data we already have rather than invented:

  - Parking at each stop: public/destinfo/{CC}.json already carries an OSM parking
    harvest (see src/lib/destInfo.js). Surface the nearest car park to each stop's
    centre, with its fee if known, and a directions link.
  - Driving between stops: distance and time are already computed for the leg; add
    toll cost where dest.driving_toll exists.
  - Where to sleep: the stay tier and per-night figure already exist on each stop.
  - Getting in without a car: the anchor airport and transfer leg already exist on
    each destination (getting.airport, getting.transfer_min).

Rules:
  - Never invent a fact. If the data is absent, omit the row - do not write "unknown".
  - Every figure names its source the way src/components/CostSummary.jsx does.
  - Put this section ABOVE the day-by-day.

Then loosen the day-by-day: the current copy prescribes an itinerary hour by hour.
Rewrite the generator so each day offers 2-3 options rather than a fixed schedule,
and label the one thing that is genuinely time-bound (an opening time, a ferry).
```

### Prompt 2.4 — More images, and the route

```
On the trip page, add:
  - A photo strip per day, drawn from the images already attached to that day's stops
    and sights (dossier gallery, activities_full POI images). 3-4 per day, lazy, via
    the CardPhoto pattern in src/browse/DestinationsTab.jsx (srcSet + sizes + intrinsic
    dimensions - do NOT write a bare <img src>).
  - The route drawn on a map. TripMap already exists (src/map/TripMap.jsx) and the
    trip already has ordered stops with coordinates. Mount it lazily behind the fold so
    maplibre-gl does not load until the section is opened.

Caption each photo with what it shows, from the POI name - never a generic caption.
```

---

## P3 — Trails, beaches, lakes, mountains

### Prompt 3.1 — The stats block is messy and overlaps the hero

```
On src/browse/TrailPage.jsx the hero image has statistics overlaid on it that collide
with each other and with the title. Same pattern on BeachPage / LakePage /
MountainPage.

Two changes:

1. Take the stats OFF the hero. The hero carries the title and the back/share controls
   only. Move length / difficulty / ascent / descent / duration into a single compact
   stat bar directly below the hero: one row, mono figures, icon + value + unit, no
   labels longer than one word.

2. Put the detail behind one control. A "Route detail" button opens the existing sheet
   shell (src/browse/PlacesFilterSheet.jsx's fsheet-* markup, or extract that shell to
   a shared <Sheet>) holding the full profile: the elevation chart, surface breakdown,
   waymarking, seasonality, hazards.

Design the stat bar as a real component with its own tokens, not inline styles. It has
to survive 375px with 5 stats in it - let it scroll horizontally rather than wrap into
two ragged lines.
```

### Prompt 3.2 — Trail photographs

```
Same shape as prompt 2.1, for trails. public/trails/ holds per-country files and
per-trail details; src/browse/DestinationsTab.jsx's TrailPicture falls back to a drawn
SVG of the trail's geometry when there is no photo, which is the right fallback.

Audit every trail's photo: flag maps, signage, waymark close-ups, car parks, trailhead
signs, and anything under 800px. Prefer a wide view along the trail or of the summit /
valley it reaches. Where no good photo exists, prefer the drawn geometry over a bad
photo - it at least tells the reader the shape of the walk.

Show me the counts before changing anything.
```

---

## P4 — Explore

### Prompt 4.1 — The destination card label

```
In src/browse/ExploreTab.jsx, the Explore cards (ExploreCard, and the mosaic packer
`packRows` around line 110) have three problems the user raised:

1. The label strip under each photo is a different height per card, so the grid is
   ragged. Give the label a fixed height and clamp the title to one line and the
   subtitle to one line.

2. The photo is too small relative to the white label area. Shift the ratio: the image
   should take clearly more of the card. Adjust the aspect ratio and the label padding.

3. The small score badge is plain. Redesign it: a filled pill in the tier colour
   (--rate / --rate-soft / the gem teal are already tokens in src/styles.css), the
   number in mono, and the tier's glyph. It should read as a rating at a glance rather
   than as a dot.

Apply the same three fixes to the "Best trips from here" cards on the destination page
(src/browse/DestinationPage.jsx) - the user called out the same problems there.

Screenshot the grid at 375px and 1280px before and after.
```

### Prompt 4.2 — "The 41" and the score explainer

```
Two clarity problems on Explore:

1. The editorial rails (src/browse/ExploreRails.jsx, fed from ExploreTab) produce a
   rail titled "The 41". A reader has no idea what 41 means. Find where that title is
   built and give every rail a self-explaining title - "The 41 highest-rated places in
   Europe", or whatever it actually is - plus a one-line subtitle saying how the list
   was chosen.

2. The "?" that explains the score (TierLegend, src/browse/TierLegend.jsx) is
   misaligned and visually weak. Rebuild it: the trigger is a proper icon button
   aligned to the legend row's baseline, and the explanation opens in the shared sheet
   shell rather than as inline text that reflows the legend.
```

### Prompt 4.3 — Whitespace and touch targets

```
On a 375px screen the Explore and destination pages waste vertical space and several
controls are too small to hit.

1. Audit every section's vertical rhythm on Explore at 375px. Reduce the gaps so the
   first screen is mostly content. The stylesheet has 8,699 raw px literals and no
   spacing scale (see CARTA_OPTIMIZATION.md §8 C4) - introduce --space-1..8 tokens for
   the rules you touch here rather than hand-tuning more pixels.

2. On the destination page, the shortlist / share / open-in-Google-Maps buttons are too
   small. Give them at least 44x44px of hit area and more horizontal padding. Check
   every icon-only button on that page for the same problem.

3. "Highlights and map" on the destination page is misaligned - the map and the
   highlight list do not share a baseline or a gutter. Rebuild that section as one grid
   with a single gutter token.
```

### Prompt 4.4 — Collapse by default, and images on "Best things to do"

```
1. On src/browse/DestinationPage.jsx, every <Fold> should default CLOSED. Right now
   several open by default and the page is a wall. Exception: keep the first section
   (the verdict / why go) open.

2. "Best things to do" is text-only. Each item has a POI behind it in
   activities_full.json (being sharded to public/poi/{destId}.json - see
   CARTA_OPTIMIZATION.md §2.2), and many of those carry an `img`. Add a thumbnail per
   item, via the CardPhoto pattern. Where there is no image, do not leave a hole - fall
   back to the kind glyph (src/components/KindGlyph.jsx).

3. "More ways in" should collapse and expand the way the Destinations folds do - same
   <Fold> component, same chevron, same animation.
```

### Prompt 4.5 — The Explore map

```
src/browse/ExploreMap.jsx currently renders price/score pins with clusterMaxZoom 5.
The user wants: zoom in far enough and a pin becomes a small card - hero image, a short
line, and the rating.

Implement it as a maplibre popup (not a DOM overlay you position yourself):
  - below zoom ~8, keep the current pins
  - at zoom >= 8, on hover (pointer) or tap (touch), open a popup with the destination's
    hero thumbnail at 250px via thumbAt() from src/lib/heroImage.js, the city and
    country, the ScoreChip, and one line of `knownFor` (src/lib/knownFor.js)
  - clicking the popup opens the destination page

While you are in this file, fix the performance problem: the GeoJSON FeatureCollection
is rebuilt from the whole filtered set (up to 3,868 features) on every filter change.
Build it once from `all` and express the filter as a maplibre `filter` expression on
the layer instead.
```

---

## P5 — Favourites, saved trips, planners

### Prompt 5.1 — Wire favourites through to the planners

```
Favourites exist (src/App.jsx ~324, a Set persisted into the URL) and the Saved Trips
panel has a "favorites" tab (src/auth/SavedTripsPanel.jsx ~1201). But grepping
`favorites` in src/planner/TripPlannerTab.jsx and src/planner/DayPlannerTab.jsx returns
nothing - the shortlist is a dead end.

Close the loop:

1. Anything openable should be favouritable, not just priced destinations: trips,
   trails, beaches, lakes, mountains, cycle routes. Today `favorites` holds destination
   ids only. Change it to hold {kind, id} pairs and migrate the stored/URL format with
   a fallback that reads the old bare-id form as {kind:'dest', id}.

2. Surface all of them in the Saved Trips "favorites" tab, grouped by kind.

3. In the trip planner, add "Add from shortlist" to the stop picker, listing favourited
   destinations first.

4. In the day planner, add favourited POIs and places to the day's add-panel
   (src/planner/DayAddPanel.jsx) under a "Your shortlist" heading.

5. Favourites currently live in the URL and localStorage. For a signed-in user they
   should sync like day plans do - see src/planner/dayPlanSync.js and
   src/auth/tripPlanStorage.js for the existing pattern. Guests keep local-only.
```

### Prompt 5.2 — My trips: the travel record and the map

```
In src/auth/SavedTripsPanel.jsx:

1. The "my travel record" images are inconsistent - different aspect ratios and sizes.
   Route every one through the CardPhoto pattern (srcSet, sizes, intrinsic dimensions)
   and give them one fixed aspect ratio.

2. The map at the top of the Visited tab is small and fights the user: it intercepts
   page scroll, so the browser shows "use two fingers to move the map".

   Make it taller (at least 240px on a phone, 360 on desktop) and set maplibre's
   `cooperativeGestures` so one-finger drag scrolls the page and two fingers pan the
   map WITHOUT the browser's own nag - or, better for a record view, disable map
   dragging entirely and make the whole map a button that opens a full-screen version.
   A static record does not need to be pannable in place.

   Also pick a basemap that suits a "places I have been" view: the CARTO Positron
   no-labels style reads better for a dot map than Voyager. The tile URL is in
   src/lib/mapTile.js.
```

---

## P6 — Content accuracy

### Prompt 6.1 — Hallucination and validity sweep

```
This is an audit task, not an edit task. Do not change content until I have seen the
report.

Across every published layer (public/trips, journeys, trails, beaches, lakes,
mountains, cycling, region, dossier), check:

1. Every item is in the right category: a "beach" that is a lake, a "mountain" that is
   a hill or a building, a "trail" that is a road, a "cycle route" with no geometry.

2. Every factual claim that can be cross-checked against a source IS checked. Where an
   item carries a Wikidata id, verify the coordinates agree within 5km, and that the
   Wikidata instance-of is compatible with the layer it sits in.

3. Every item has a usable image (see prompts 2.1 and 3.2) and every image's licence
   and author are recorded in the credits payload.

4. Editorial prose that was generated rather than harvested: find it, and flag any
   sentence making a specific verifiable claim (an opening time, a price, a distance, a
   superlative like "the largest in Europe") that is not backed by a field in the data.

Write scripts/audit-content.mjs, emit one JSON report per layer under reports/, and
give me a summary table: items per layer, items flagged, and the top 5 failure modes.

Note: 11 dossier slugs collide (e.g. italy/lampedusa from both LMP.json and
gem-lampedusa.json) - include those in the report; they also block the SEO work.
```

---

## P7 — Carried over from the performance audit

These are in `CARTA_OPTIMIZATION.md` with full measurements. In priority order:

```
1. Shard public/activities_full.json (33 MB) into public/poi/{destId}.json.
   src/planner/DayPlannerTab.jsx ~523 downloads all 33 MB on an unconditional mount
   effect - a 4-8 second main-thread freeze on a phone. See §2.2.

2. Split public/app_data.json (13 MB) into app_core.json + dest_detail/{iso2}.json and
   drop the 9 fields nothing reads. Measured: 2.18 MB gzip -> 0.52 MB. See §2.1.

3. React.memo the planner tabs and the 7 card components; useCallback their props;
   debounce `choices` and persistTripDraft. See §5.1, 5.2, 5.4.

4. Real path routing + prerendered HTML. 1 indexable page today; ~20,000 achievable.
   See §3. Blocked on the 11 duplicate slugs.

5. useFocusTrap across the seven aria-modal overlays that have no focus management;
   combobox semantics on the search popover; aria-hidden the 14 hardcoded English
   aria-labels in src/components/Icons.jsx. See §7.

6. Delete the ~3,900 dead JS lines and 686 dead CSS classes; split styles.css. See §8.

7. Delete the now-unreachable `cat === 'general'` code path in
   src/browse/DestinationsTab.jsx (destRows, classCounts, generalCountries,
   countryCover, DestCard, CountryCard, the CLASSES size facet, the JSX block around
   ~2996). It was left in place deliberately so the tab removal is a one-line revert -
   remove it once you are happy the tab is gone for good.

8. After the next pipeline export, delete the LEGACY_REASON map in
   src/browse/GettingThere.jsx - it exists only to rewrite the three old transit
   strings still in the current export.
```

---

## Open questions for you

1. **Attribution.** The per-destination credits paragraph is gone from the page.
   OpenStreetMap (ODbL) and Wikimedia Commons (CC BY-SA) both require attribution to
   remain reachable. It is still in the PDF export and in the map's own attribution
   control, which is probably enough — but if you want it fully off the product, that
   needs a licence decision, not a code change.

2. **Cost provenance.** The national-fallback lines are gone; the measured lines stay
   ("measured in Rome, 234 listings, 2026-03"). So some places now show a provenance
   line and some show nothing. If you would rather it were all-or-nothing, say which.

3. **The General tab.** Destinations now opens on Trips and the priced city catalogue
   lives only in Explore. If you wanted the catalogue to stay reachable from
   Destinations under a different name, that is a one-line revert — tell me.
