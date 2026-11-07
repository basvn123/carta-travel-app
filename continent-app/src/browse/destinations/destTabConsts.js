import { SuitcaseIcon, BootIcon, BeachIcon, LakeIcon, MountainIcon, BikeIcon } from '../../components/Icons.jsx';

/**
 * The Destinations tab: the whole catalogue and every published trip as a
 * browsable section of its own, reachable from the bottom bar (mobile) and
 * the header tabs (desktop).
 *
 * Six categories share one search, one country filter and one sort row:
 *   General    every priced place as a photo card, and a country index of
 *              flag cards when nothing is filtered yet
 *   Trips      composed city days from the content lab
 *   Trails     drawn hikes from the content lab
 *   Beaches    the published beach layer (pipeline/beaches)
 *   Lakes      the published lake layer (pipeline/lakes): lakes, reservoirs,
 *              lagoons, tarns and crater lakes, each with a swimming verdict
 *   Mountains  the published mountain layer (pipeline/mountains): summits,
 *              volcanoes, ridges, sea cliffs and lowland high points, each
 *              with the way to the top on it. It used to be the
 *              mountain-flavoured slice of the published hikes, which meant
 *              the Mountains tab showed trails and never showed the
 *              Matterhorn.
 *
 * Trips are published one country at a time, so the four trip categories
 * browse country first: flag cards from the index until a country (or a
 * near-city search) is picked. Tapping any trip opens the TrailPage: the route
 * on a real map, what to expect, the exports, and live following.
 *
 * A hike now brings its own photograph and its own rating in the wire
 * (pipeline/trails/trail_images.py and rate.py); only a city day's picture and
 * every price still come from the catalogue join in lib/trailCards.js.
 *
 * Trails are the one category with no price, so the priced chrome stays off:
 * no priced-from origin, no stay tier, no price sort. What replaces it is the
 * chrome a walk actually needs, and only Trails shows it: length bands, a
 * loops-only chip, and rating/length/A-Z sorts.
 *
 * The search box answers two questions with one field. Typing filters the
 * catalogue as you go (local, instant) and offers the matching cities as
 * suggestions. Anything else, a village Carta does not price, a postcode, a
 * street and house number, is a location rather than a destination: Enter (or
 * the "search anywhere" row) geocodes it through Nominatim and the tab
 * switches to near-mode, listing the closest places and trips to that point
 * with the distance on every card. That is what makes "what can I reach from
 * my own front door" a question this tab can answer. The crosshair in the
 * field asks the browser the same question without the typing.
 */

export const PAGE = 36;

export const NEAR_MAX_ROWS = 80;

// T593: the What and Where bar and the quick filter row, per outdoor tab.
// What is one existing facet group (the tab's kinds); the quick row holds
// the groups a reader reaches for first, in the reference's order.
export const WHAT_GROUP = {
  trails: 'highlights', cycling: 'cycle-bike', beaches: 'beach-bestfor',
  lakes: 'lake-doing', mountains: 'mtn-kind',
};

export const QUICK_GROUPS = {
  trails: ['grade', 'length', 'climb', 'shape'],
  cycling: ['cycle-surface', 'cycle-length', 'cycle-climb'],
  beaches: ['beach-water', 'beach-substrate', 'beach-facilities'],
  lakes: ['lake-swim', 'lake-water', 'lake-setting'],
  mountains: ['mtn-acc', 'mtn-diff', 'mtn-ele'],
};

/** The first point of a route's (Multi)LineString, [lon, lat], or null. */
export function lineStartOf(geometry) {
  const c = geometry?.coordinates;
  if (!Array.isArray(c) || !c.length) return null;
  const p = geometry.type === 'MultiLineString' ? c[0]?.[0] : c[0];
  return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null;
}

// The Trips overview card reuses the same TripMap, lazily for the same
// reason: maplibre-gl stays out of the main bundle until a map is on screen.

// Framing margins for the trips overview map, module-level so their identity
// is stable: TripMap redraws every pin when `fitPadding` changes, and an
// inline object would change on every keystroke in the search field.

export const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l'); // l-with-stroke does not decompose

// How long the trip is, which is the first thing a traveller knows and the
// last thing the catalogue could answer. 1 is the drawn one-day city walk from
// the content lab; everything above it is a composed itinerary from
// pipeline/trips. `null` is "any length".
export const TRIP_DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14];

const TRIP_MAX_DAYS = 14;

// How hard the trip works, and how big the places on it are. Both are things
// the composer BUILT differently rather than labels over one set: relaxed and
// packed are different routes, and so are icons and hidden.
export const TRIP_PACES = [
  { key: 'relaxed', labelKey: 'trip.paceRelaxed' },
  { key: 'balanced', labelKey: 'trip.paceBalanced' },
  { key: 'packed', labelKey: 'trip.pacePacked' },
];

export const TRIP_SCALES = [
  { key: 'icons', labelKey: 'trip.scaleIcons' },
  { key: 'hidden', labelKey: 'trip.scaleHidden' },
];

/* 'general' - the priced city catalogue - used to lead this rail. It was the
 * same browse surface Explore already is, one tab away, so the two disagreed
 * about which one was "the places list". Destinations is now the published,
 * hand-checked content (trips, trails, beaches, lakes, mountains, cycling) and
 * Explore is the catalogue. The code behind `cat === 'general'` is now
 * unreachable and is queued for deletion; it is left in place here so this
 * change is a one-line revert. */
export const CATS = [
  { key: 'trips', Icon: SuitcaseIcon, labelKey: 'places.catTrips' },
  { key: 'trails', Icon: BootIcon, labelKey: 'places.catTrails' },
  { key: 'beaches', Icon: BeachIcon, labelKey: 'places.catBeaches' },
  { key: 'lakes', Icon: LakeIcon, labelKey: 'places.catLakes' },
  { key: 'mountains', Icon: MountainIcon, labelKey: 'places.catMountains' },
  { key: 'cycling', Icon: BikeIcon, labelKey: 'places.catCycling' },
];

/**
 * Chip filters for the three published layers, and the one shape all of them
 * share: a key, a label, and a predicate over one wire row.
 *
 * They are a model rather than markup because the same list has to render
 * twice, as the quick chip row under the toolbar and as the full set inside
 * the Filters sheet. A filter that exists in one of those and not the other
 * is the bug this shape prevents.
 *
 * Several chips selected means ALL of them hold, not any. "A volcano you can
 * walk up" is the question people actually ask; "a volcano or anything you
 * can walk up" is not one.
 */

// Mountains have their own model, in lib/mountainStory.js: brief 05 asks for
// seven filters rather than one row of chips, and the tests belong next to
// the code that reads the wire. MOUNTAIN_FACETS is the same shape as the
// lists below, grouped, with `toolbar` deciding which group is short enough
// for the row under the search field.

// Lakes have their own model too, in lib/lakeStory.js: brief 04 asks for
// nine filters rather than one row of four chips, and the tests belong next
// to the code that reads the wire. LAKE_FACETS is the same grouped shape as
// MOUNTAIN_FACETS, and `toolbar` picks the group short enough for the row
// under the search field (swimming, which is what a lake list is asked for
// first).

// Beaches keep their model in lib/beachStory.js too (BEACH_FACETS), the same
// grouped shape as LAKE_FACETS and MOUNTAIN_FACETS. Brief 03 section 4 asked
// for nine groups in place of the three chips that shipped, two of which read
// zero in every scope, and for the rule those two chips broke: a chip whose
// count is zero here is not rendered at all.

export const SORTS = [
  { key: 'rating', labelKey: 'places.sortRating', defaultDir: -1 },
  { key: 'price', labelKey: 'places.sortPrice', defaultDir: 1 },
  { key: 'az', labelKey: 'places.sortAZ', defaultDir: 1 },
];

/**
 * Sorts for the Trails category. A hike has no price, so the priced sorts do
 * not apply, but it now has a rating (pipeline/trails/rate.py) and the one
 * number every walker checks first: how far.
 *
 * Rating leads and is the default, which is also the order the wire arrives
 * in, so the list a country opens on is that country's best walks.
 */
export const TRAIL_SORTS = [
  { key: 'rating', labelKey: 'places.sortRating', defaultDir: -1 },
  { key: 'distance', labelKey: 'trails.sortDistance', defaultDir: 1 },
  { key: 'az', labelKey: 'places.sortAZ', defaultDir: 1 },
];

// The same three orderings for a cycle route, under the same labels.
export const CYCLE_SORTS = [
  { key: 'rating', labelKey: 'places.sortRating', defaultDir: -1 },
  { key: 'distance', labelKey: 'trails.sortDistance', defaultDir: 1 },
  { key: 'az', labelKey: 'places.sortAZ', defaultDir: 1 },
];
