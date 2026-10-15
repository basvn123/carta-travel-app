import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoadingBlock, ErrorBlock } from '../components/StateBlocks.jsx';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { CountryPicker } from '../components/CountryPicker.jsx';
import { count, eur, stripDashes } from '../lib/format.js';
import { countryName as localCountryName } from '../lib/countryName.js';
import { needsCountry } from '../lib/favorites.js';
import { railOrigin } from '../lib/railAlternative.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { PlacesFilterSheet } from './PlacesFilterSheet.jsx';
import { FilterChips } from './FilterChips.jsx';
import { trailPath } from '../lib/trailShape.js';
import { srcSetFor } from '../lib/heroImage.js';
import { HeroPreload } from '../components/LayerPhoto.jsx';
import { loadTrails, loadListedTrails, loadTrailsIndex } from '../lib/trails.js';
import {
  loadBeachIndex, loadBeaches, loadListedBeaches, loadTopBeaches,
} from '../lib/beaches.js';
import {
  beachRating,
  BEACH_FACETS, applyBeachFacets, beachFacetCounts,
} from '../lib/beachStory.js';
import {
  loadLakeIndex, loadLakes, loadListedLakes, loadTopLakes,
} from '../lib/lakes.js';
import {
  lakeRating,
  LAKE_FACETS, applyLakeFacets, lakeFacetCounts,
} from '../lib/lakeStory.js';
import {
  loadMountainIndex, loadMountains, loadListedMountains, loadTopMountains,
} from '../lib/mountains.js';
import {
  loadTripIndex, loadTrips, loadTopTrips, rankTrips,
} from '../lib/trips.js';
import { loadCyclingIndex, loadCycling, loadTopCycling } from '../lib/cycling.js';
import {
  countryPhrase,
} from '../lib/cycleStory.js';
import {
  cycleRating, routeTitle,
  CYCLE_FACET_GROUPS, cycleMatchesFacets, cycleFacetCounts, isLocalNetworkRow,
} from '../lib/cycleStory.js';
import {
  tripHeadline, shapeLabel, transportLabel, seasonLabel, tripTags, cardThumb,
} from '../lib/tripStory.js';
import {
  mountainRating, isLiftServed, liftLabel,
  MOUNTAIN_FACETS, applyMountainFacets, mountainFacetCounts,
} from '../lib/mountainStory.js';
import {
  associateTrip, haversineKm, tripCentre, tripKindKey, tripThemes,
  DISTANCE_BANDS, tripBand, trailRating,
  ASCENT_BANDS, tripClimbBand, GRADES, tripGrade,
  ROUTE_TYPES, tripRouteType, HIGHLIGHTS, tripHighlights,
  SUITABILITY, tripSuitability, isListed,
} from '../lib/trailCards.js';
import { useI18n } from '../i18n/index.jsx';
import { geocodeAddress, reverseGeocode, geoLines } from '../lib/geocode.js';
import { rankPlaces } from '../lib/placeSearch.js';
import { bandChip, bandBreak, scopeForRows } from '../lib/regions.js';
import {
  SearchIcon, ChevronRightIcon, RouteIcon, SkylineIcon, SuitcaseIcon, BootIcon,
  BeachIcon, MountainIcon, MapPinIcon, CrosshairIcon,
  CityIcon, TownIcon, VillageIcon, AreaIcon, LoopIcon, LakeIcon, FilterIcon,
  BikeIcon, ArrowLeftIcon,
} from '../components/Icons.jsx';
import { LifestyleButton } from './LifestyleButton.jsx';
import { JourneysSection } from './JourneysSection.jsx';
import CreditFold from './CreditFold.jsx';
import { openShared } from '../lib/sharedElement.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { useTravelMonth } from '../components/SettingsLine.jsx';
import { monthName } from '../lib/dates.js';
import { CoverageEmpty } from './CoverageEmpty.jsx';
import { MICROSTATES, countryGeo, pointGeo } from '../lib/coverageEmpty.js';
import { loadStubs } from '../lib/stubs.js';
import { CardStrip } from './CardStrip.jsx';
import {
  PlaceCard, PlaceCardPhoto, PlaceCardNoPhoto, PlaceCardSkeletons,
} from './PlaceCard.jsx';
import {
  trailFilling, cycleFilling, cycleTourFilling, beachFilling, lakeFilling, mountainFilling,
  GRADE_KEY, placeLine, displayName,
} from '../lib/cardFillings.js';
import { SectionOpening, SectionHead, Strip } from './SectionOpening.jsx';
import { CountryGalleryCard } from './CountryGallery.jsx';
import { SECTION_PHOTOS, countryKnownKey, countryPhotos } from '../lib/countryGallery.js';
import { Button, Chip, Field, Tabs } from '../components/ui/index.js';
import { createPortal } from 'react-dom';
import { pickIcons, buildRails, photoOf } from '../lib/openingScreen.js';
import { okPhoto, firstOkImage } from '../lib/photoVeto.js';
import { offeredStayTiers } from '../lib/runtime_pricing.js';

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

const PAGE = 36;
const NEAR_MAX_ROWS = 80;

/**
 * Remembered browse state (T384, brief V3-8, rule N10): the category, the
 * country and the near place of the last visit, per viewer, in this
 * browser. A convenience and nothing more: every read and write is in a
 * try/catch (a private window, blocked storage or a thumbnail capture can
 * all throw or come back empty), anything malformed is ignored, and the tab
 * is correct without it. A link that names a category, a country or a place
 * still wins, because those arrive through their own effects after this.
 */
const MEMORY_KEY = 'carta.places.v1';
function readMemory() {
  try {
    const raw = window.localStorage.getItem(MEMORY_KEY);
    const m = raw ? JSON.parse(raw) : null;
    if (!m || typeof m !== 'object') return null;
    const near = m.near && typeof m.near === 'object'
      && typeof m.near.name === 'string'
      && Number.isFinite(m.near.lat) && Number.isFinite(m.near.lon)
      ? {
        id: typeof m.near.id === 'string' ? m.near.id : null,
        name: m.near.name,
        sub: typeof m.near.sub === 'string' ? m.near.sub : '',
        iso2: typeof m.near.iso2 === 'string' && /^[A-Z]{2}$/.test(m.near.iso2) ? m.near.iso2 : null,
        lat: m.near.lat,
        lon: m.near.lon,
      }
      : null;
    return {
      cat: typeof m.cat === 'string' ? m.cat : null,
      country: typeof m.country === 'string' && /^[A-Z]{2}$/.test(m.country) ? m.country : '',
      near,
    };
  } catch {
    return null;
  }
}
/** The section (dc) and country (dn) a link names, or nothing (T428). */
function readUrlBrowse() {
  try {
    const p = new URLSearchParams(window.location.search);
    const cat = p.get('dc');
    const cc = (p.get('dn') || '').toUpperCase();
    return { cat: cat || null, country: /^[A-Z]{2}$/.test(cc) ? cc : '' };
  } catch {
    return { cat: null, country: '' };
  }
}
function writeMemory(m) {
  try { window.localStorage.setItem(MEMORY_KEY, JSON.stringify(m)); } catch { /* storage refused: nothing to keep */ }
}

// Lazy: the page imports maplibre-gl, which stays out of the main bundle.
const StubPage = lazy(() => import('./StubPage.jsx').then((m) => ({ default: m.StubPage })));
const TrailPage = lazy(() => import('./TrailPage.jsx').then((m) => ({ default: m.TrailPage })));
// Lazy for symmetry, not for weight: the beach page carries no map, but it is
// only ever reached by tapping a card, so it can arrive then.
const BeachPage = lazy(() => import('./BeachPage.jsx').then((m) => ({ default: m.BeachPage })));
const LakePage = lazy(() => import('./LakePage.jsx').then((m) => ({ default: m.LakePage })));
const MountainPage = lazy(() => import('./MountainPage.jsx').then((m) => ({ default: m.MountainPage })));
const CyclePage = lazy(() => import('./CyclePage.jsx').then((m) => ({ default: m.CyclePage })));
const CycleFamilyPage = lazy(
  () => import('./CyclePage.jsx').then((m) => ({ default: m.CycleFamilyPage })),
);
// The itinerary page mounts TripMap, and TripMap pulls in maplibre-gl.
const TripPage = lazy(() => import('./TripPage.jsx').then((m) => ({ default: m.TripPage })));
// The curated week's page: no map, but only ever reached by tapping a card.
const JourneyPage = lazy(() => import('./JourneyPage.jsx').then((m) => ({ default: m.JourneyPage })));
// The Trips overview card reuses the same TripMap, lazily for the same
// reason: maplibre-gl stays out of the main bundle until a map is on screen.

// Framing margins for the trips overview map, module-level so their identity
// is stable: TripMap redraws every pin when `fitPadding` changes, and an
// inline object would change on every keystroke in the search field.

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/ł/g, 'l'); // l-with-stroke does not decompose

// How long the trip is, which is the first thing a traveller knows and the
// last thing the catalogue could answer. 1 is the drawn one-day city walk from
// the content lab; everything above it is a composed itinerary from
// pipeline/trips. `null` is "any length".
const TRIP_DAYS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14];
const TRIP_MAX_DAYS = 14;

// How hard the trip works, and how big the places on it are. Both are things
// the composer BUILT differently rather than labels over one set: relaxed and
// packed are different routes, and so are icons and hidden.
const TRIP_PACES = [
  { key: 'relaxed', labelKey: 'trip.paceRelaxed' },
  { key: 'balanced', labelKey: 'trip.paceBalanced' },
  { key: 'packed', labelKey: 'trip.pacePacked' },
];
const TRIP_SCALES = [
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
const CATS = [
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

const SORTS = [
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
const TRAIL_SORTS = [
  { key: 'rating', labelKey: 'places.sortRating', defaultDir: -1 },
  { key: 'distance', labelKey: 'trails.sortDistance', defaultDir: 1 },
  { key: 'az', labelKey: 'places.sortAZ', defaultDir: 1 },
];
// The same three orderings for a cycle route, under the same labels.
const CYCLE_SORTS = [
  { key: 'rating', labelKey: 'places.sortRating', defaultDir: -1 },
  { key: 'distance', labelKey: 'trails.sortDistance', defaultDir: 1 },
  { key: 'az', labelKey: 'places.sortAZ', defaultDir: 1 },
];


/**
 * One published trip as a photo card: the name, the measured facts, the kind.
 *
 * No description here. The wire's summary was clamped to two lines and broke
 * mid-sentence on every card, which reads as a bug rather than a teaser; the
 * whole explanation now lives on the trail page, one tap away.
 */
/**
 * The picture on a walk's card, in three tiers, because a third of the walks
 * in the wire have no photograph and a grey hole in a list of photographs
 * reads as a broken card.
 *
 *   1. Its own Commons photograph.
 *   2. The nearest catalogue town's hero, within 25 km, WITH the town named
 *      on the picture. Labelled, it is a photograph of the country the walk
 *      is in; unlabelled it would be a claim about the path, which is why
 *      this used to be refused outright.
 *   3. The walk drawn as itself, from the geometry the card already carries.
 *      No photograph exists, so the honest picture is the shape of the path.
 */
/**
 * The photo on a banner card (.places-bcard and friends).
 *
 * Every one of these used to be a bare `<img src={shot.u} loading="lazy" />`:
 * no srcset, no sizes, no intrinsic dimensions. The wire ships Wikimedia heroes
 * at their 960px rendering, so a 375px phone card downloaded three to five
 * times the bytes it drew - on six card types at once - and every card
 * reflowed as its photo landed. lib/heroImage.js has owned the fix since the
 * destination grid got it (it knows the six widths Wikimedia will actually
 * render); the published layers - beaches, lakes, mountains, cycling, trails -
 * simply never went through it.
 *
 * width/height are the ASPECT, not pixels: CSS sizes the element, and the pair
 * is what reserves the box before the bytes arrive.
 */
/*
 * What a card's photograph is ACTUALLY drawn at, measured rather than guessed.
 *
 * .places-list is 1 column below 640, 2 up to 1039, and 3 above it, and on a
 * desktop the list sits beside the left panel rather than filling the window.
 * Measured against the built app, the photo comes out at:
 *
 *      375 -> 159    640 -> 292    1040 -> 230    1440 -> 363
 *      480 -> 212    768 -> 356    1280 -> 310    1920 -> 369
 *
 * so it is a hair under 46vw while the grid is 2-up, about 25vw once it is
 * 3-up, and never wider than ~370 css px. The previous value claimed 96vw on a
 * phone and 560px on a desktop, both roughly three times the truth, which is
 * how a 310px card ended up downloading the 960px rendering: `sizes` is a
 * promise the browser believes, and over-promising costs the bytes the srcset
 * was added to save.
 *
 * Stated as vw rather than px so it stays true inside the panel layout, and
 * capped at 370px so a very wide window does not climb a rung for nothing.
 */
const CARD_SIZES = '(max-width: 1039px) 47vw, min(26vw, 370px)';

/*
 * The five sections' cards (T179, spec 5.1). One frame, browse/PlaceCard.jsx,
 * five fillings, lib/cardFillings.js. What stays here is only what each
 * section adds to the frame: its seal, its strip, and the small facts that
 * lead the hook line (how far from a searched place, a swimming verdict, a
 * lift to the top, whose photograph it is). Since T394 none of them sits on
 * the photograph but the strip.
 */

/** A walk's photograph: its own, the nearest town's (labelled as such), the
 *  line drawn as itself, or plain paper. */
function TrailMedia({ tr, assoc }) {
  const photo = okPhoto(assoc.photoUrl);
  const shape = useMemo(
    () => (photo ? null : trailPath(tr.geometry)),
    [photo, tr.geometry],
  );
  if (photo) return <PlaceCardPhoto url={photo} />;
  if (shape) {
    return (
      <span className="places-card-img places-card-shape" aria-hidden="true">
        <svg viewBox={shape.viewBox} preserveAspectRatio="xMidYMid meet">
          <path d={shape.d} />
        </svg>
      </span>
    );
  }
  return <PlaceCardNoPhoto><RouteIcon size={26} /></PlaceCardNoPhoto>;
}

const TripCard = React.memo(function TripCard({ card, km, onOpen, t, countryName }) {
  const { tr, assoc, price } = card;
  const isCityDay = tr.category === 'citytrip';
  const fill = useMemo(() => trailFilling(card, { t, countryName }), [card, t, countryName]);
  // The walk's own rating, not the nearest town's: scored within its country
  // from open signals only (pipeline/trails/rate.py). A city day carries its
  // town's. A listed row says it is not scored rather than showing a number
  // it never earned.
  const rating = isCityDay ? assoc.dest?.rating : trailRating(tr);
  const seal = rating
    ? <RatingBadge rating={rating} size="sm" showGem={false} />
    : (!isCityDay && isListed(tr) ? <span className="places-card-unrated">{t('trails.notScored')}</span> : null);
  // The small facts lead the hook line in the body (T394): nothing but the
  // strip sits on the photograph any more.
  const lead = [
    km != null ? { key: 'km', cls: 'places-card-km', text: bandChip(km, t) } : null,
    assoc.photoUrl && assoc.photoOf ? { key: 'photoof', cls: 'places-card-photoof', text: assoc.photoOf } : null,
  ];
  // Carta does not price flights (T273): a flying row's figure is the stay
  // and the ground, and its title says the flight is not in it.
  const foot = isCityDay && price ? (
    <span className="places-card-price"
      title={price.mode === 'plane' ? t('places.priceNoFlight') : undefined}>
      {eur(price.pp)}
      <small> {t('money.perPerson')}</small>
    </span>
  ) : null;
  return (
    <PlaceCard
      className="places-tcard"
      onClick={() => onOpen(card)}
      sharedKey={isCityDay ? null : tr.id}
      media={<TrailMedia tr={tr} assoc={assoc} />}
      seal={seal}
      strip={isCityDay ? null : <CardStrip kind="trail" row={tr} />}
      lead={lead}
      fill={fill}
      hookClass="places-card-kinds"
      foot={foot}
    />
  );
});

/** A ranked or listed cycle route. A listed row has no score, and says so in
 *  the seal's place rather than leaving a gap. */
const CycleCard = React.memo(function CycleCard({ r, countryName, onOpen, t }) {
  const rating = r.score != null ? cycleRating(r, t) : null;
  const fill = useMemo(() => cycleFilling(r, { t, countryName }), [r, t, countryName]);
  return (
    <PlaceCard
      className={`places-bcard cycle-card${rating ? '' : ' cycle-card-listed'}`}
      testId={rating ? 'cycle-card' : 'cycle-listed-card'}
      onClick={() => onOpen(r)}
      sharedKey={r.id}
      media={okPhoto(r.img) ? <PlaceCardPhoto url={r.img} /> : <PlaceCardNoPhoto />}
      seal={rating
        ? <RatingBadge rating={rating} size="sm" showGem={false} />
        : <span className="cycle-card-unrated">{t('cycle.notScored')}</span>}
      strip={<CardStrip kind="cycle" row={r} />}
      fill={fill}
    />
  );
});

/** A composed tour: days, length and the day's ride as the values, pace and
 *  bike as the hook, the overnight towns as where it is. No score exists. */
const CycleTourCard = React.memo(function CycleTourCard({ tr, countryName, onOpen, t }) {
  const fill = useMemo(() => cycleTourFilling(tr, { t, countryName }), [tr, t, countryName]);
  return (
    <PlaceCard
      className="places-bcard cycle-tourcard"
      testId="cycle-tourcard"
      onClick={() => onOpen(tr)}
      sharedKey={tr.slug}
      media={tr.img ? <PlaceCardPhoto url={tr.img} /> : <PlaceCardNoPhoto />}
      fill={fill}
    />
  );
});

const BeachCard = React.memo(function BeachCard({ beach, km, countryName, onOpen, t }) {
  const shot = firstOkImage(beach.images);
  const fill = useMemo(() => beachFilling(beach, { t, countryName }), [beach, t, countryName]);
  return (
    <PlaceCard
      className="places-bcard"
      onClick={() => onOpen(beach)}
      sharedKey={beach.id}
      media={shot ? <PlaceCardPhoto url={shot.u} /> : <PlaceCardNoPhoto />}
      seal={<RatingBadge rating={beachRating(beach, t)} size="sm" showGem={false} />}
      lead={km != null ? [{ key: 'km', cls: 'places-card-km', text: bandChip(km, t) }] : null}
      fill={fill}
    />
  );
});

/**
 * A lake. The swimming verdict leads the card's hook whenever it is not a
 * plain yes: a list that promises beautiful water has to say which of it you
 * may get into, and finding out on arrival that Plitvice forbids swimming is
 * the failure this layer was built to avoid.
 */
/** A count that settles in place when it changes (DIRECTION.md 2.3, the
 *  figure-in-place moment): one opacity dip through figureChange.js, no
 *  count-up, nothing under reduced motion. */
function SettledCount({ value, className, children }) {
  const ref = useRef(null);
  useSettledFigure(ref, value);
  return <span ref={ref} className={className}>{children}</span>;
}

/**
 * The month on a lake card (T394, carta-design "Month"): one fact from the
 * wire's monthly water temperatures (an estimate from the climate record,
 * so its title says so), shown only when the traveller has a month of their
 * own on the settings line. The month is a measured fact, in mono.
 */
function LakeMonthFact({ lake, month, warmC, t, lang }) {
  const temps = lake.swim?.temps;
  const v = Array.isArray(temps) && temps.length === 12 ? Number(temps[month - 1]) : NaN;
  if (!Number.isFinite(v)) return null;
  const warm = v >= warmC;
  const [a, b = ''] = (warm
    ? t('places.monthSwim')
    : t('places.monthCold', { c: Math.round(warmC) })).split('{month}');
  return (
    <span className={`pcard-month ${warm ? 'is-warm' : 'is-cold'}`} title={t('card.estimate')}>
      {a}<span className="pcard-month-m">{monthName(month, lang)}</span>{b}
    </span>
  );
}

const LakeCard = React.memo(function LakeCard({ lake, km, countryName, onOpen, t, month = null, warmC = 18, lang }) {
  const shot = firstOkImage(lake.images);
  const fill = useMemo(() => lakeFilling(lake, { t, countryName }), [lake, t, countryName]);
  const { swim } = fill;
  // The swimming verdict leads the hook whenever it is not a plain yes, the
  // distance before it in near mode (T394: off the photograph, into the
  // body, keeping the classes verify_lakes reads).
  const lead = [
    km != null ? { key: 'km', cls: 'places-card-km', text: bandChip(km, t) } : null,
    swim.rule !== 'yes' ? { key: 'swim', cls: `places-lcard-swim swim-${swim.tone}`, text: swim.label } : null,
  ];
  return (
    <PlaceCard
      className="places-bcard places-lcard"
      onClick={() => onOpen(lake)}
      sharedKey={lake.id}
      media={shot ? <PlaceCardPhoto url={shot.u} /> : <PlaceCardNoPhoto />}
      seal={<RatingBadge rating={lakeRating(lake, t)} size="sm" showGem={false} />}
      strip={<CardStrip kind="lake" row={lake} warmC={warmC} month={month} />}
      lead={lead}
      note={month ? <LakeMonthFact lake={lake} month={month} warmC={warmC} t={t} lang={lang} /> : undefined}
      fill={fill}
    />
  );
});

/**
 * A mountain. A mountain you can ride to the top of says so first in the
 * hook, in the place the lake card puts its swimming verdict, because
 * "can I get up it without walking" decides whether this is a morning out or
 * an expedition.
 */
const MountainCard = React.memo(function MountainCard({ mountain, km, countryName, onOpen, t }) {
  const shot = firstOkImage(mountain.images);
  const fill = useMemo(() => mountainFilling(mountain, { t, countryName }), [mountain, t, countryName]);
  const ride = isLiftServed(mountain);
  const lead = [
    km != null ? { key: 'km', cls: 'places-card-km', text: bandChip(km, t) } : null,
    ride ? { key: 'lift', cls: 'places-lcard-swim places-mcard-way', text: liftLabel(mountain, t) } : null,
  ];
  return (
    <PlaceCard
      className="places-bcard places-mcard"
      onClick={() => onOpen(mountain)}
      sharedKey={mountain.id}
      media={shot ? <PlaceCardPhoto url={shot.u} /> : <PlaceCardNoPhoto />}
      seal={<RatingBadge rating={mountainRating(mountain, t)} size="sm" showGem={false} />}
      strip={<CardStrip kind="mountain" row={mountain} />}
      lead={lead}
      fill={fill}
    />
  );
});

/**
 * One composed itinerary as a card.
 *
 * The photograph is the town the trip OPENS in, so a grid of Italian trips
 * does not lead with the Trevi Fountain three times. The line under the route
 * is what you would actually stand in front of rather than a composed
 * sentence: with a reason vocabulary this small the sentences came out
 * identical on every card, and the named sights never do.
 */
/**
 * One composed itinerary as a card, in this tab's own photo-card grammar.
 *
 * The photograph is the town the trip OPENS in, so a list of Italian trips
 * does not lead with the Trevi Fountain three times. The line above the cost
 * is what you would actually stand in front of rather than a composed
 * sentence: with a reason vocabulary this small the sentences came out
 * identical on every card, and the named sights never do.
 *
 * A trip carries more facts than a beach, so unlike .places-tcard it is not
 * all laid over the photograph: the name, the length and the score sit on the
 * image, everything else in a body strip under it, where it stays readable.
 */
const ItinCard = React.memo(function ItinCard({ tr, km, onOpen, t }) {
  const tags = tripTags(tr, t, 2);
  const season = seasonLabel(tr, t);
  const warned = (tr.warned || []).length;
  return (
    <button className="places-icard" onClick={(e) => openShared(e.currentTarget, tr.id, () => onOpen(tr))}>
      <span className="itin-card-media">
        {/* cardThumb alone pins this to the 500px rendering, which was right
            for a 132px strip and is soft in a 3:2 frame. The srcset lets a
            retina card climb and leaves everything else lower. */}
        {tr.img
          ? (
            <img
              className="places-card-img"
              src={cardThumb(tr.img.url)}
              srcSet={srcSetFor(tr.img.url, 960)}
              sizes={CARD_SIZES}
              alt=""
              loading="lazy"
            />
          )
          : (
            <span className="places-card-img places-card-noimg" aria-hidden="true">
              <RouteIcon size={26} />
            </span>
          )}
      </span>

      {/* The name and the score in the body, under the photograph (T394,
          caption band): they lay on the picture over a scrim before. */}
      <span className="itin-card-body">
        <span className="itin-card-head">
          <span className="itin-card-name">{tripHeadline(tr, t)}</span>
          {Number.isFinite(tr.score) && (
            <span className="itin-card-score">{tr.score.toFixed(1)}</span>
          )}
        </span>
        <span className="itin-card-badges">
          <span className="itin-card-days">
            <b>{tr.days}</b> {t(tr.days === 1 ? 'trip.dayWord' : 'trip.daysWord')}
          </span>
          {tr.nearFit && <span className="itin-card-near">{t('trip.nearFit')}</span>}
          {km != null && (
            <span className="itin-card-near">{bandChip(km, t)}</span>
          )}
        </span>
        <span className="itin-card-route">
          {(tr.cities || []).map((c, i) => (
            <React.Fragment key={`${c.city}-${i}`}>
              {i > 0 && <span className="itin-card-arrow" aria-hidden="true">&rsaquo;</span>}
              <span className="itin-card-city">
                <CountryFlag country={c.cc} size={10} />
                {c.city}
                <span className="itin-card-n">{c.n}</span>
              </span>
            </React.Fragment>
          ))}
        </span>
        <span className="itin-card-meta">
          <span className="itin-card-chip">{transportLabel(tr, t)}</span>
          <span className="itin-card-chip">{shapeLabel(tr, t)}</span>
          {tags.map((tag) => (
            <span key={tag.code} className="itin-card-chip on">{tag.label}</span>
          ))}
        </span>
        {tr.sights?.length > 0 && (
          <span className="itin-card-sights">{tr.sights.join(', ')}</span>
        )}
        <span className="itin-card-foot">
          {Number.isFinite(tr.cost?.per_day_eur) && (
            <span className="itin-card-cost">{t('trip.perDay', { eur: eur(tr.cost.per_day_eur) })}</span>
          )}
          {tr.alsoDays?.length > 0 && (
            <span className="itin-card-also">
              {t('trip.alsoDays', { days: tr.alsoDays.join(', ') })}
            </span>
          )}
          {season && <span>{season}</span>}
          <span className={`itin-card-checks ${warned ? 'warn' : ''}`}>
            {warned
              ? t(warned === 1 ? 'trip.checkOne' : 'trip.checkMany', { n: warned })
              : t('trip.checkClean')}
          </span>
        </span>
      </span>
    </button>
  );
});

/**
 * A layer that could not be LOADED, as opposed to one with nothing published.
 *
 * The distinction is the whole point: "nothing here matches" is a claim about
 * the catalogue and it was being made on the strength of a dropped request.
 * This says what actually happened and offers the way back, in the tone the
 * geolocation failure already uses: no blame, one button.
 */
/**
 * Where everything on the section comes from, in one closed row at its end
 * (T428). The credit sentences used to sit under every list with a coverage
 * footer beside them; the owner asked for no text the traveller does not
 * need, and a licence still has to be honoured, so the words wait here: the
 * section's data credit, then every photograph on screen that is not a
 * place's own (the section's head, the country galleries), each with its
 * author, licence and file page.
 */
const SECTION_CREDIT = {
  trails: ['trails.credit'],
  beaches: ['beach.credit'],
  lakes: ['lake.credit'],
  mountains: ['mtn.credit'],
  cycling: ['cycle.sourceNote', 'credit.licence.cycle'],
};

function PhotoCredit({ p }) {
  return (
    <li>
      {p.place}: <a href={p.page} target="_blank" rel="noreferrer">{p.author}</a>, {p.licence}
    </li>
  );
}

function SourcesFold({ cat, isComposedTrips, sectionHead, countries, t }) {
  const keys = cat === 'trips'
    ? [isComposedTrips ? 'trip.credit' : 'journey.credit']
    : (SECTION_CREDIT[cat] || []);
  const photos = [];
  if (sectionHead?.photo) photos.push(sectionHead.photo);
  for (const cc of countries || []) photos.push(...countryPhotos(cc));
  if (!keys.length && !photos.length) return null;
  return (
    <div className="dtab-sources">
      <CreditFold t={t} licenceKeys={keys}>
        {photos.length > 0 && (
          <>
            <p className="dtab-sources-head">{t('dtab.photoCredits')}</p>
            <ul className="dtab-sources-list">
              {photos.map((p) => <PhotoCredit key={p.u} p={p} />)}
            </ul>
          </>
        )}
      </CreditFold>
    </div>
  );
}

function LayerError({ onRetry, t, msg = 'layer.loadFailed' }) {
  return (
    <div className="places-empty places-loaderr" role="status">
      <ErrorBlock message={t(msg)} onRetry={onRetry} retryLabel={t('layer.retry')} />
    </div>
  );
}

export function DestinationsTab({
  data, pricedAll, availableCountries = [], onSelectDest,
  stayTier = 'home', lifestyle, onOpenLifestyle, origin = null,
  // Sets the Lifestyle panel's "Where you sleep" answer, for the trip
  // page's Lifestyle slider (T173).
  onChangeStayTier = null,
  openTrail = null, onOpenTrailConsumed,
  openBeach = null, onOpenBeachConsumed,
  openLake = null, onOpenLakeConsumed,
  openMountain = null, onOpenMountainConsumed,
  openCycle = null, onOpenCycleConsumed,
  openTrip = null, onOpenTripConsumed, onOpenTripInPlanner,
  // One country, asked for from somewhere else in the app (the planner's
  // country brief). Just the filter, in whatever category is showing: no
  // layer to wait for and nothing to open once it lands.
  openCountry = null, onOpenCountryConsumed,
  // One category (a CATS key), asked for from the landing page (T209): its
  // primary action opens the walks. The country filter survives, as it does
  // when the category tabs are pressed.
  openCategory = null, onOpenCategoryConsumed,
  // The shortlist, as the pair-aware pair App keeps: isFavorite(id, kind)
  // and onToggleFav(id, kind). Every full-screen feature page below wears the
  // same star from them, so a trail is kept exactly the way a city is.
  isFavorite = null, onToggleFav = null,
  // "Add to a day plan" on the four feature pages: (kind, { id, cc, name, lat, lon }).
  onAddToDay = null,
  // T428: whether this tab is the one on screen (both browse tabs stay
  // mounted), so only the active one claims the header's search slot.
  isActive = true,
  // T428: "See places in {country}" opens Explore filtered to that country.
  onExploreCountry = null,
}) {
  const { t, lang } = useI18n();
  // The traveller's own month from the settings line, or null while the
  // dates are Carta's pair (T381): lake cards say one month fact only then.
  const travelMonth = useTravelMonth();
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);
  const stayTiers = useMemo(() => offeredStayTiers(data?.meta), [data?.meta]);

  // Read once per mount, before the first state is set (see readMemory).
  const memory = useRef(undefined);
  if (memory.current === undefined) memory.current = readMemory();
  // T428: the URL wins over the memory, so a shared or reloaded link opens
  // the section and the country it names (dc, dn), the way Explore's x* keys do.
  const fromUrl = useRef(undefined);
  if (fromUrl.current === undefined) fromUrl.current = readUrlBrowse();
  const [cat, setCat] = useState(() => {
    const want = fromUrl.current.cat || memory.current?.cat;
    return CATS.some((c) => c.key === want) ? want : 'trips';   // CATS key
  });
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [country, setCountry] = useState(() => fromUrl.current.country
    || (fromUrl.current.cat ? '' : memory.current?.country) || '');   // ISO2 or '' for all
  // Written back while this tab is on screen, keeping the hash (#dest=, a
  // feature page) and history.state, which App's Back handling reads.
  useEffect(() => {
    if (!isActive) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('dc', cat);
      if (country) url.searchParams.set('dn', country); else url.searchParams.delete('dn');
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
    } catch { /* sandboxed: the tab still works, the address just does not follow */ }
  }, [cat, country, isActive]);
  // The point everything is measured from in near-mode. A catalogue city or
  // any geocoded location, so it carries a name and coordinates rather than a
  // destination id: { id|null, name, sub, iso2|null, lat, lon }.
  const [nearPlace, setNearPlace] = useState(() => memory.current?.near || null);
  useEffect(() => {
    writeMemory({ cat, country, near: nearPlace });
  }, [cat, country, nearPlace]);
  const [sort, setSort] = useState({ key: 'rating', dir: -1 });
  // Trails filter their own way: by how long the walk is, and by whether it
  // ends where it started. Kept out of `classes` because they filter a
  // different list and would otherwise survive a category switch.
  const [bands, setBands] = useState([]);            // DISTANCE_BANDS keys, [] = any
  // The five filters the brief added beside length. Every one is an array of
  // codes with [] meaning "any", and the two rules are worth stating once:
  // WITHIN a group the selection is a union (two lengths means either length,
  // which is how "an afternoon or a whole day" is one thought), ACROSS groups
  // it is an intersection. Highlights and suitability are the exceptions and
  // are unions inside themselves too, because "a waterfall or a lake" is what
  // somebody scanning a list of chips actually means; asking for both at once
  // is a search, not a filter.
  const [grades, setGrades] = useState([]);          // GRADES keys
  const [climbs, setClimbs] = useState([]);          // ASCENT_BANDS keys
  const [shapes, setShapes] = useState([]);          // ROUTE_TYPES keys
  const [hls, setHls] = useState([]);                // HIGHLIGHTS keys
  const [suits, setSuits] = useState([]);            // SUITABILITY keys
  const [loopsOnly, setLoopsOnly] = useState(false);
  const [trailSort, setTrailSort] = useState({ key: 'rating', dir: -1 });
  const [visible, setVisible] = useState(PAGE);
  const [pageCard, setPageCard] = useState(null);    // enriched trip card or null
  // The Trips category opens on the curated library, browsed style first:
  // null is the ten-style grid, a slug is one style's list, and 'composed'
  // is the door into the machine-composed itineraries below.
  const [journeyView, setJourneyView] = useState(null);
  const [pageJourney, setPageJourney] = useState(null);   // { id, gw } or null
  // The composed itineraries ask one question: how many days. 1 means the
  // drawn city walks, 2 and up mean a composed itinerary, null means any.
  const [itinDays, setItinDays] = useState(null);
  const [itinPace, setItinPace] = useState(null);     // null = any pace
  const [itinScale, setItinScale] = useState(null);   // null = both
  const [itinIndex, setItinIndex] = useState(undefined);   // undefined = loading
  const [itinTop, setItinTop] = useState(null);
  const [itinCountryRows, setItinCountryRows] = useState(null);
  const [pageItin, setPageItin] = useState(null);
  // A shared #trail= link: { id, country } until the country file has loaded
  // and the card it names can be opened.
  const [wantedTrail, setWantedTrail] = useState(null);

  // Free-text location search. The catalogue suggestions below are local and
  // instant; this one is a network call to Nominatim, so it fires on an
  // explicit action (Enter, or the "search anywhere" row), never per
  // keystroke, which is what its fair-use policy asks for.
  const [suggOpen, setSuggOpen] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHits, setGeoHits] = useState(null);      // null until this term was searched
  const geoSeq = useRef(0);
  const searchRef = useRef(null);

  // "Near me". The button is only rendered where the browser can answer at
  // all: geolocation is undefined outside a secure context, and chrome for a
  // capability that is not there is worse than no chrome.
  const canLocate = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState('');

  // Trails data: the country index (which countries have anything), and the
  // one country file the current selection needs.
  const [trailsIndex, setTrailsIndex] = useState(null);
  const [countryTrips, setCountryTrips] = useState(null);
  const [trailsLoading, setTrailsLoading] = useState(false);

  // Which layers failed to LOAD, as opposed to having nothing published.
  // Every loader used to swallow a network error into null and every consumer
  // coerced that to [], so a dropped connection rendered "nothing here
  // matches" - a claim about the catalogue - and the re-fetch guards read
  // `if (rows) return;` where [] is truthy, so the tab never tried again for
  // the life of the session. A layer in here has an error state and a retry
  // button instead, in the tone the geolocation failure beside countryOptions
  // already uses: say what happened, offer the way back.
  const [layerError, setLayerError] = useState({});   // layer -> true
  const [retryTick, setRetryTick] = useState(0);
  const failLayer = useCallback((layer) => (e) => {
    // Only a LayerFetchError is a failure. Anything else is a bug in our own
    // then-chain and should not be dressed up as a network problem.
    if (e?.name !== 'LayerFetchError') throw e;
    setLayerError((cur) => (cur[layer] ? cur : { ...cur, [layer]: true }));
  }, []);
  const retryLayer = useCallback((layer) => {
    setLayerError((cur) => {
      if (!cur[layer]) return cur;
      const next = { ...cur };
      delete next[layer];
      return next;
    });
    setRetryTick((n) => n + 1);
  }, []);

  // Beaches: the capped Europe wide ranking the tab opens on, the index that
  // says which countries have any, and whichever country files a search or a
  // location has pulled in on top of them.
  const [beachIndex, setBeachIndex] = useState(null);
  const [topBeaches, setTopBeaches] = useState(null);
  const [countryBeaches, setCountryBeaches] = useState({});   // cc -> rows
  const [beachesLoading, setBeachesLoading] = useState(false);
  const [pageBeach, setPageBeach] = useState(null);

  // Lakes: the same three artifacts as beaches, held separately because they
  // are a separate layer with a separate gate. The index also carries the
  // model's warm-water threshold, which the lake page's month strip colours by.
  const [lakeIndex, setLakeIndex] = useState(null);
  const [topLakes, setTopLakes] = useState(null);
  const [countryLakes, setCountryLakes] = useState({});     // cc -> rows
  const [lakesLoading, setLakesLoading] = useState(false);
  // The listed tier, held apart from the ranked rows on purpose: a
  // screen has to opt in to showing water bodies that carry no score.
  const [listedLakes, setListedLakes] = useState({});
  // The listed tier for beaches, held apart from the rated rows for the same
  // reason: one has been scored and one has only been verified to exist, and
  // nothing in this file may let them mix.
  const [listedBeaches, setListedBeaches] = useState({});
  const [pageLake, setPageLake] = useState(null);

  // Mountains: the same three artifacts again.
  const [mountainIndex, setMountainIndex] = useState(null);
  const [topMountains, setTopMountains] = useState(null);
  const [countryMountains, setCountryMountains] = useState({});   // cc -> rows
  const [mountainsLoading, setMountainsLoading] = useState(false);
  // The listed tier, per country. Held apart from the rated rows because the
  // two are different claims: one has been measured and one has only been
  // verified to exist, and nothing in this file may let them mix.
  const [listedMountains, setListedMountains] = useState({});
  const [pageMountain, setPageMountain] = useState(null);

  // Cycling: routes and the tours composed over them. Two lists rather than
  // one, because a listed row carries no score and must never interleave into
  // a ranked list (master spec section 3).
  const [cycleIndex, setCycleIndex] = useState(null);
  const [cycleTop, setCycleTop] = useState(null);
  const [cycleFacets, setCycleFacets] = useState({});
  const [cycleShowLocal, setCycleShowLocal] = useState(false);
  const [cycleSort, setCycleSort] = useState({ key: 'rating', dir: -1 });
  const [countryCycling, setCountryCycling] = useState({});   // cc -> bundle
  const [cyclingLoading, setCyclingLoading] = useState(false);
  const [pageCycle, setPageCycle] = useState(null);

  // The chip filters each published layer carries, as selected keys into
  // MOUNTAIN_FACETS / LAKE_FACETS / BEACH_FACETS. Held per layer rather than in
  // one bag because they filter different lists and a chip that survived a
  // category switch would silently empty the next tab.
  // One object rather than one array: eight groups, each holding its own
  // selection. Inside a group the chips are OR (the bands are mutually
  // exclusive), across groups they are AND.
  const [mtnFacets, setMtnFacets] = useState({});
  const [lakeFacets, setLakeFacets] = useState({});
  const [beachFacets, setBeachFacets] = useState({});
  // The Filters door. One sheet on every width, the same as Explore's.
  const [sheetOpen, setSheetOpen] = useState(false);
  // The Filters sheet hangs off this button on a pointer screen.
  const filterBtnRef = useRef(null);
  // Which door opened the sheet (T384): the toolbar's Filters hangs it off
  // the button; the desktop panel's "All filters" sits low in a tall column,
  // where a hanging panel would run off the screen, so it opens the sheet
  // centred, the way the shared filter sheet stands on a wide screen.
  const [sheetFrom, setSheetFrom] = useState('toolbar');

  useEffect(() => {
    if (layerError.trails) return undefined;
    let live = true;
    loadTrailsIndex().then((idx) => { if (live) setTrailsIndex(idx); })
      .catch((e) => { if (live) failLayer('trails')(e); });
    return () => { live = false; };
  }, [layerError.trails, retryTick, failLayer]);

  // A shared link names one trip in one country: browse that country's trails
  // so the card exists, then open its page (below, once the file has landed).
  useEffect(() => {
    if (!openTrail) return;
    setCat('trails');
    setQuery('');
    setNearPlace(null);
    setCountry(openTrail.country);
    setWantedTrail(openTrail);
    onOpenTrailConsumed?.();
  }, [openTrail, onOpenTrailConsumed]);

  useEffect(() => {
    if (!openCountry) return;
    setQuery('');
    setNearPlace(null);
    setCountry(openCountry);
    onOpenCountryConsumed?.();
  }, [openCountry, onOpenCountryConsumed]);

  useEffect(() => {
    if (!openCategory) return;
    if (CATS.some((c) => c.key === openCategory)) {
      setCat(openCategory);
      setQuery('');
      setJourneyView(null);
      scrollRef.current?.scrollTo?.(0, 0);
    }
    onOpenCategoryConsumed?.();
  }, [openCategory, onOpenCategoryConsumed]);

  // Debounce only the 24.8k-row filter, never the input itself.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);

  // Geocoded hits answer one exact term. A changed term retires them, and the
  // bumped sequence retires any reply still in flight for the old one, so a
  // slow answer can never land under a query the traveller has moved past.
  useEffect(() => {
    geoSeq.current += 1;
    setGeoHits(null);
    setGeoBusy(false);
    setLocErr('');
  }, [query]);

  // Click away and the suggestion list closes. It overlays the cards, so it
  // cannot be left open behind a tap that was meant for the list underneath.
  useEffect(() => {
    if (!suggOpen) return undefined;
    const onDoc = (e) => { if (!searchRef.current?.contains(e.target)) setSuggOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [suggOpen]);

  // Beaches are their own layer now, not a slice of the published trips, so
  // they are deliberately NOT a trip category: no country index, no origin,
  // no stay tier, no price sorts. Everything on that tab is about the beach.
  const isBeachCat = cat === 'beaches';
  const isLakeCat = cat === 'lakes';
  const isMountainCat = cat === 'mountains';
  const isCycleCat = cat === 'cycling';
  // The Trips tab's curated library (style grid or one style's list). The
  // composed itineraries and the drawn city walks live behind its
  // 'composed' door and keep every behaviour they had.
  const isJourneyBrowse = cat === 'trips' && journeyView !== 'composed';
  const isComposedTrips = cat === 'trips' && journeyView === 'composed';
  const isTripCat = cat === 'trails' || isComposedTrips;
  const trailsCountry = nearPlace ? nearPlace.iso2 : country;
  useEffect(() => {
    if (!isTripCat || !trailsCountry) { setCountryTrips(null); return undefined; }
    if (layerError.trails) return undefined;
    let live = true;
    setTrailsLoading(true);
    // Rated and listed in one go, concatenated in that order. A listed row
    // carries no rating key at all, so it sorts to the end of a rating sort by
    // itself and renders with a "not scored yet" chip rather than a number.
    Promise.all([loadTrails(trailsCountry), loadListedTrails(trailsCountry)])
      .then(([trips, listed]) => {
        if (!live) return;
        setCountryTrips([...(trips || []), ...(listed || [])]);
        setTrailsLoading(false);
      }).catch((e) => {
        if (!live) return;
        setTrailsLoading(false);
        failLayer('trails')(e);
      });
    return () => { live = false; };
  }, [isTripCat, trailsCountry, layerError.trails, retryTick, failLayer]);

  // ISO2 -> display name in the reader's language (T451, the T444 rule:
  // lib/countryName.js, so a German screen says "Albanien"), the catalogue's
  // own name only for a code the engine does not know. A shared #tour= link
  // carries no country, and Intl.DisplayNames.of throws on an empty or
  // malformed code, which took the whole app down (row T375-a): no code
  // names no country, and a code the engine refuses is shown as itself.
  const countryName = useMemo(() => {
    const map = new Map(availableCountries);
    return (cc) => {
      if (!cc) return '';
      try { return localCountryName(cc, map.get(cc) || cc, lang); } catch { return map.get(cc) || cc; }
    };
  }, [availableCountries, lang]);

  // City suggestions for the near-search, deduped so London's four gateway
  // entries offer one London. Also the index every hike is joined against.
  const destIndex = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const [id, d] of Object.entries(data.destinations)) {
      const key = `${d.city}|${d.iso2}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id, city: d.city, country: d.country, iso2: d.iso2,
        lat: d.city_lat ?? d.lat, lon: d.city_lon ?? d.lon,
      });
    }
    return out;
  }, [data]);

  // Where each destination actually is, city centre first. Some rows are
  // anchored on their airport, and measuring "how far is this from my street"
  // against a runway 40 km out of town orders the nearest list wrong.

  const priceById = useMemo(() => {
    const m = new Map();
    for (const p of pricedAll) m.set(p.id, p);
    return m;
  }, [pricedAll]);

  // Country cards draw their own photographs since T428 (lib/countryGallery.js,
  // T449); the old cover took the first photograph of the best-rated trail.

  const q = useMemo(() => norm(debouncedQuery), [debouncedQuery]);

  // Exact name, then prefix, then word start, then inside a word (T384,
  // brief V3-7; lib/placeSearch.js says why and what it cannot find).
  const suggestions = useMemo(() => rankPlaces(destIndex, q, 6), [q, destIndex]);

  const term = query.trim();
  // Nominatim's own floor is 3 characters; below it the row would promise a
  // search that returns nothing.
  const canGeo = term.length >= 3;

  const pickNear = (place) => {
    setNearPlace(place);
    setQuery('');
    setCountry('');
    setSuggOpen(false);
  };

  const pickDest = (d) => pickNear({
    id: d.id, name: d.city, sub: d.country, iso2: d.iso2, lat: d.lat, lon: d.lon,
  });

  // A geocoded location: the place reads as the heading, the rest of the
  // address stays on the line beside it, so the header says which of the
  // several Gents on earth this is.
  const pickGeo = (r) => {
    const { title, rest } = geoLines(r);
    pickNear({ id: null, name: title, sub: rest, iso2: r.iso2, lat: r.lat, lon: r.lon });
  };

  const runGeoSearch = async () => {
    if (!canGeo) return;
    const seq = geoSeq.current + 1;
    geoSeq.current = seq;
    setGeoBusy(true);
    setSuggOpen(true);
    const hits = await geocodeAddress(term, { limit: 8 });
    if (geoSeq.current !== seq) return;   // the term moved on while we waited
    setGeoHits(hits);
    setGeoBusy(false);
  };

  // Enter takes the best answer already on screen and only reaches for the
  // network when there is none: a hit if the map was searched, otherwise the
  // top catalogue city, otherwise search the map. Typing an address matches no
  // city, so an address falls straight through to the search.
  const onSearchEnter = () => {
    if (geoHits?.length) pickGeo(geoHits[0]);
    else if (suggestions.length) pickDest(suggestions[0]);
    else runGeoSearch();
  };

  /**
   * The same anchor, straight from the browser. The device answers with a
   * coordinate and Nominatim turns that into a name and a country (the trails
   * wire is published per country), but the ranking only ever uses the
   * coordinate, so a reverse lookup that fails still leaves a working anchor
   * under a plain "My location" heading.
   */
  const useMyLocation = () => {
    if (!canLocate || locBusy) return;
    setLocErr('');
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos?.coords?.latitude;
        const lon = pos?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          setLocBusy(false);
          setLocErr(t('places.locateFailed'));
          return;
        }
        const hit = await reverseGeocode(lat, lon);
        const lines = hit ? geoLines(hit) : null;
        setLocBusy(false);
        pickNear({
          id: null,
          name: lines?.title || t('places.myLocation'),
          sub: lines?.rest || '',
          iso2: hit?.iso2 || null,
          lat,
          lon,
        });
      },
      (err) => {
        setLocBusy(false);
        // Code 1 is a refusal, which is a setting to change rather than a
        // failure to retry; everything else is "it did not come through".
        setLocErr(err?.code === 1 ? t('places.locateDenied') : t('places.locateFailed'));
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 },
    );
  };

  // ── General: the priced catalogue ─────────────────────────────────────


  // How many places each size holds under the country/search filter, so a chip
  // can say "42" and can grey itself out rather than leading to an empty list.

  // The country index for General: every priced country as a flag card.

  // ── Trip categories: the published wire, joined to the catalogue ──────

  const tripCards = useMemo(() => {
    if (!isTripCat || !countryTrips) return null;
    return countryTrips.map((tr) => {
      const assoc = associateTrip(tr, data.destinations, destIndex);
      return {
        tr,
        assoc,
        kindKey: tripKindKey(tr, assoc.dest),
        themes: tripThemes(tr, assoc.dest),
        price: assoc.destId ? priceById.get(assoc.destId) || null : null,
      };
    });
  }, [isTripCat, countryTrips, data, destIndex, priceById]);

  // A neighbour card on any layer page opens that layer's own page (brief
  // 08's cross-layer blocks). One page at a time: opening a neighbour closes
  // the page it was found on, so Escape and the back cross keep one meaning.
  /**
   * The star props for one feature page: {fav, onFav}.
   *
   * Every page below is opened from a row that already knows its own id, so
   * the only thing this adds is the KIND, which is what turns a bare id into
   * a shortlist key (see lib/favorites.js). Returns empty props when the host
   * passed no shortlist, which is how FavStar knows to render nothing rather
   * than an inert control.
   */
  const favProps = (kind, id, cc = '') => {
    if (!isFavorite || !onToggleFav || id == null || id === '') return {};
    // A country-kind with no country cannot be written down at all (favKey
    // refuses it), so the star stays absent rather than inert-but-present.
    if (needsCountry(kind) && !/^[A-Za-z]{2}$/.test(String(cc || ''))) return {};
    return {
      fav: isFavorite(String(id), kind, cc),
      onFav: () => onToggleFav(String(id), kind, cc),
    };
  };

  // The coverage empty-state module (T124 for the seven microstates of
  // destinations spec 1.6, T367 for every country and every searched place;
  // docs/ONBOARDING_AND_EMPTY_STATES.md). A list that is empty because of
  // WHERE it is, with no chip narrowing it, says how many are published,
  // why, and which three are nearest across the border.
  //
  // The country a list is empty for: one whose name the traveller typed (any
  // country, not only the ones a layer publishes, which is the point:
  // "monaco" on the lakes tab), else the one picked in the toolbar. A typed
  // word that names no country names no empty country: the list is empty
  // because of the word, and saying "Luxembourg, 0 cycling routes" over a
  // search miss would be false.
  const typedCc = useMemo(() => {
    if (q) {
      if (q.length < 2) return null;
      const codes = [...availableCountries.map(([cc]) => cc), ...Object.keys(MICROSTATES)];
      return codes.find((c) => norm(c) === q || norm(countryName(c)).startsWith(q)) || null;
    }
    return country || null;
  }, [country, q, availableCountries, countryName]);
  // Where each country sits and which countries it borders, from the
  // catalogue's own towns. Built once per country asked about: the empty
  // states are rare, the pairwise distance scan is not free.
  const geoCache = useRef({ towns: null, byCc: new Map() });
  const geoOf = useCallback((cc) => {
    if (!cc) return null;
    const cache = geoCache.current;
    if (cache.towns !== destIndex) { cache.towns = destIndex; cache.byCc = new Map(); }
    if (!cache.byCc.has(cc)) cache.byCc.set(cc, countryGeo(destIndex, cc));
    return cache.byCc.get(cc);
  }, [destIndex]);
  const nearGeo = useMemo(
    () => (nearPlace ? pointGeo(destIndex, nearPlace, nearPlace.iso2 || null) : null),
    [nearPlace, destIndex],
  );
  const countryEmpty = (layer, cc, onOpen = openNeighbour) => (
    <CoverageEmpty
      layer={layer}
      cc={cc}
      geo={geoOf(cc)}
      countryName={countryName}
      onOpen={onOpen}
      onSeeOther={(c) => { setCat(c); setQuery(''); setCountry(cc); }}
      onShowAll={() => { setQuery(''); setCountry(''); }}
    />
  );
  const radiusEmpty = (layer, onOpen = openNeighbour) => (
    <CoverageEmpty
      layer={layer}
      cc={nearPlace.iso2 || null}
      city={nearPlace.name}
      geo={nearGeo}
      countryName={countryName}
      onOpen={onOpen}
      onShowAll={() => setNearPlace(null)}
    />
  );
  // A list a chip or a filter emptied: say so, and offer the one button that
  // undoes it. Never the coverage module, which would blame the catalogue.
  const chipsEmpty = (msgKey, onClear, labelKey = 'empty.clearChips', vars = undefined) => (
    <div className="places-empty empty-act">
      <p>{t(msgKey, vars)}</p>
      <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={onClear}>{t(labelKey)}</Button>
    </div>
  );

  // A list the typed words emptied (no chip, no country, no place set): the
  // same module as a chip-emptied list, with the one button that undoes it
  // (brief V5-5: every empty path is one of the two modules).
  const queryEmpty = (msgKey) => chipsEmpty(msgKey, () => setQuery(''), 'empty.clearSearch');

  // The honest stubs of the walks list (T124): famous walks Carta cannot
  // build, loaded for the country the list is answering for.
  const [stubs, setStubs] = useState([]);
  const [stubsAll, setStubsAll] = useState(false);
  const [pageStub, setPageStub] = useState(null);
  // Back steps out of the tab's own layers (T451, the navigation rule T381
  // set and T444 gave Explore): a style's list, then a page over it, each
  // push one history entry, so Back and a phone's swipe back close the top
  // layer onto the one beneath instead of leaving Carta. The trip page
  // (JourneyPage) and the destination page (#dest=) push their own.
  const placesLevel = (journeyView ? 1 : 0)
    + ((pageCard || pageItin || pageBeach || pageLake || pageMountain || pageCycle || pageStub) ? 1 : 0);
  const pushedLevel = useRef(0);
  useEffect(() => {
    if (!isActive) return;
    try {
      if (placesLevel > pushedLevel.current) {
        for (let l = pushedLevel.current + 1; l <= placesLevel; l++) {
          window.history.pushState({ ...(window.history.state || {}), cartaPlaces: l }, '', window.location.href);
        }
      } else if (placesLevel < pushedLevel.current) {
        // Closed by its own control: step back over the entries the layer
        // pushed, but only while they are still the top of the history (a
        // place opened from the page has pushed its own on top).
        const st = window.history.state || {};
        if (st.cartaPlaces === pushedLevel.current && !st.cartaDest && !st.journey) {
          window.history.go(placesLevel - pushedLevel.current);
        }
      }
    } catch { /* sandboxed: the layers still open and close */ }
    pushedLevel.current = placesLevel;
  }, [placesLevel, isActive]);
  useEffect(() => {
    const onPop = (e) => {
      const st = e.state || {};
      const l = st.cartaPlaces ?? (st.journey ? pushedLevel.current : 0);
      if (l >= pushedLevel.current) return;
      if (l < 2) {
        setPageCard(null); setPageItin(null); setPageBeach(null); setPageLake(null);
        setPageMountain(null); setPageCycle(null); setPageStub(null);
      }
      if (l < 1) setJourneyView(null);
      pushedLevel.current = l;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    setStubsAll(false);
    if (cat !== 'trails' || !trailsCountry) { setStubs([]); return undefined; }
    let live = true;
    loadStubs(trailsCountry).then((r) => { if (live) setStubs(r); }).catch(() => { if (live) setStubs([]); });
    return () => { live = false; };
  }, [cat, trailsCountry]);

  const openNeighbour = (layer, row) => {
    setPageCard(null); setPageBeach(null); setPageLake(null);
    setPageMountain(null); setPageCycle(null);
    if (layer === 'beach') setPageBeach(row);
    else if (layer === 'lake') setPageLake(row);
    else if (layer === 'peak') setPageMountain(row);
    else if (layer === 'cycle') {
      setPageCycle({ routeId: row.id, country: row.cc || country });
    } else if (layer === 'trail') {
      const assoc = associateTrip(row, data.destinations, destIndex);
      setPageCard({
        tr: row,
        assoc,
        kindKey: tripKindKey(row, assoc.dest),
        themes: tripThemes(row, assoc.dest),
        price: assoc.destId ? priceById.get(assoc.destId) || null : null,
      });
    }
  };

  // The shared link's trip, as soon as its country file has been joined. It
  // opens whatever it is: a city day arriving through a trail link still gets
  // its own page rather than an empty Trails list.
  useEffect(() => {
    if (!wantedTrail || !tripCards) return;
    const hit = tripCards.find((c) => String(c.tr.id) === String(wantedTrail.id));
    if (hit) {
      setPageCard(hit);
      setWantedTrail(null);
    } else if (countryTrips) {
      setWantedTrail(null); // published list no longer carries it
    }
  }, [wantedTrail, tripCards, countryTrips]);

  const tripRows = useMemo(() => {
    if (!tripCards) return null;
    let rows = tripCards.filter((c) => (
      cat === 'trips' ? c.tr.category === 'citytrip'
        : cat === 'trails' ? c.tr.category !== 'citytrip'
          : cat === 'beaches' ? c.themes.has('beach')
            : c.themes.has('mountains')
    ));
    if (q) rows = rows.filter((c) => norm(c.tr.name).includes(q));
    // Walk-shape filters, Trails only. A band set is a union: tapping two
    // chips asks for either length, which is how somebody with "an afternoon
    // or a full day" actually thinks.
    if (cat === 'trails') {
      if (bands.length) rows = rows.filter((c) => bands.includes(tripBand(c.tr)));
      if (grades.length) rows = rows.filter((c) => grades.includes(tripGrade(c.tr)));
      if (climbs.length) rows = rows.filter((c) => climbs.includes(tripClimbBand(c.tr)));
      if (shapes.length) rows = rows.filter((c) => shapes.includes(tripRouteType(c.tr)));
      if (hls.length) {
        rows = rows.filter((c) => {
          const on = tripHighlights(c.tr);
          return hls.some((k) => on.includes(k));
        });
      }
      if (suits.length) {
        rows = rows.filter((c) => {
          const on = tripSuitability(c.tr);
          return suits.some((k) => on.includes(k));
        });
      }
      if (loopsOnly) rows = rows.filter((c) => c.tr.is_loop);
    }
    if (nearPlace) {
      return rows
        .map((c) => {
          const ctr = tripCentre(c.tr);
          return ctr ? { c, km: haversineKm(nearPlace.lat, nearPlace.lon, ctr.lat, ctr.lon) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    const out = rows.map((c) => ({ c, km: null }));
    // Trails have their own sorts, because they have no price. The wire
    // already arrives in rating order, so the default costs nothing and the
    // list a country opens on is that country's best walks.
    if (cat === 'trails') {
      const d = trailSort.dir;
      if (trailSort.key === 'distance') {
        out.sort((a, b) => d * ((a.c.tr.distance_m ?? Infinity) - (b.c.tr.distance_m ?? Infinity)));
      } else if (trailSort.key === 'az') {
        out.sort((a, b) => d * a.c.tr.name.localeCompare(b.c.tr.name));
      } else {
        out.sort((a, b) => d * ((a.c.tr.rating ?? -1) - (b.c.tr.rating ?? -1)));
      }
      return out;
    }
    const dir = sort.dir;
    if (sort.key === 'rating') {
      out.sort((a, b) => dir * ((a.c.assoc.dest?.rating?.score ?? -1) - (b.c.assoc.dest?.rating?.score ?? -1)));
    } else if (sort.key === 'price') {
      const v = (c) => c.price?.pp ?? Infinity;
      out.sort((a, b) => dir * (v(a.c) - v(b.c)));
    } else {
      out.sort((a, b) => dir * a.c.tr.name.localeCompare(b.c.tr.name));
    }
    return out;
  }, [tripCards, cat, q, nearPlace, sort, trailSort, bands, loopsOnly,
    grades, climbs, shapes, hls, suits]);

  // How many walks each length band holds in this country, and how many of
  // them loop, so a chip can carry its own count and grey itself out instead
  // of leading to an empty list.
  //
  // Counted BEFORE the band and loop filters are applied (but after the search
  // text), which is what lets the counts stay still while chips are tapped. A
  // count that changed every tap would be describing the filter rather than
  // the country.
  const trailFacets = useMemo(() => {
    if (cat !== 'trails' || !tripCards) return null;
    const rows = tripCards.filter((c) => c.tr.category !== 'citytrip'
      && (!q || norm(c.tr.name).includes(q)));
    const tally = (defs) => new Map(defs.map((d) => [d.key, 0]));
    const bump = (map, key) => {
      if (key != null && map.has(key)) map.set(key, map.get(key) + 1);
    };
    const byBand = tally(DISTANCE_BANDS);
    const byGrade = tally(GRADES);
    const byClimb = tally(ASCENT_BANDS);
    const byShape = tally(ROUTE_TYPES);
    const byHl = tally(HIGHLIGHTS);
    const bySuit = tally(SUITABILITY);
    let loops = 0;
    let listed = 0;
    for (const c of rows) {
      bump(byBand, tripBand(c.tr));
      bump(byGrade, tripGrade(c.tr));
      bump(byClimb, tripClimbBand(c.tr));
      bump(byShape, tripRouteType(c.tr));
      for (const k of new Set(tripHighlights(c.tr))) bump(byHl, k);
      for (const k of new Set(tripSuitability(c.tr))) bump(bySuit, k);
      if (c.tr.is_loop) loops += 1;
      if (isListed(c.tr)) listed += 1;
    }
    return { byBand, byGrade, byClimb, byShape, byHl, bySuit,
      loops, listed, total: rows.length };
  }, [cat, tripCards, q]);

  // The country index for trip categories: published countries as flag cards.
  const tripCountries = useMemo(() => {
    if (!isTripCat || !trailsIndex) return [];
    return trailsIndex.countries
      .map((c) => {
        const n = cat === 'trips' ? (c.counts?.citytrip || 0)
          : cat === 'trails' ? (c.counts?.hike || 0)
            : c.n_trips;
        return { cc: c.country, name: countryName(c.country), n };
      })
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name, lang));
  }, [isTripCat, trailsIndex, cat, countryName, lang]);


  // ── Trips: the composed itineraries (pipeline/trips) ──────────────────
  //
  // Two artifacts on purpose, the same split the beach, lake and mountain
  // layers use: /trips/top.json is the Europe-wide ranking, capped per country
  // so one country cannot fill the page, and /trips/{CC}.json is everything
  // touching that country. Ranking the continent in the browser would mean
  // fetching forty three files before drawing a card.
  const isItinCat = isComposedTrips && itinDays !== 1;

  useEffect(() => {
    if (!isItinCat || itinIndex !== undefined || layerError.trips) return undefined;
    let live = true;
    Promise.all([loadTripIndex(), loadTopTrips()]).then(([ix, top]) => {
      if (!live) return;
      setItinIndex(ix);
      setItinTop(top || []);
    }).catch((e) => { if (live) failLayer('trips')(e); });
    return () => { live = false; };
  }, [isItinCat, itinIndex, layerError.trips, retryTick, failLayer]);

  const itinCountry = nearPlace ? nearPlace.iso2 : country;

  useEffect(() => {
    if (!isItinCat || !itinCountry) { setItinCountryRows(null); return undefined; }
    if (layerError.trips) return undefined;
    let live = true;
    setItinCountryRows(null);
    loadTrips(itinCountry).then((rows) => { if (live) setItinCountryRows(rows || []); })
      .catch((e) => { if (live) failLayer('trips')(e); });
    return () => { live = false; };
  }, [isItinCat, itinCountry, layerError.trips, retryTick, failLayer]);

  // A shared #itin= link: open it once its detail is reachable. The card is
  // only a hint here, because TripPage loads the full trip by id anyway.
  useEffect(() => {
    if (!openTrip) return;
    setCat('trips');
    setJourneyView('composed');
    setItinDays(null);
    setPageItin({ id: openTrip.id });
    onOpenTripConsumed?.();
    // The callback is a fresh arrow from App, but App only re-renders it after
    // clearing openTrip, so the hand-off still runs once per link.
  }, [openTrip, onOpenTripConsumed]);

  const itinRows = useMemo(() => {
    if (!isItinCat) return null;
    const source = itinCountry ? itinCountryRows : itinTop;
    if (!source) return null;
    let rows = rankTrips(source, {
      days: itinDays, pace: itinPace, scale: itinScale,
    });
    if (q) {
      rows = rows.filter((tr) => norm(tr.cities.map((c) => c.city).join(' ')).includes(q)
        || tr.cities.some((c) => norm(c.city).includes(q)));
    }
    if (nearPlace) {
      return rows
        .map((tr) => ({ tr, km: haversineKm(nearPlace.lat, nearPlace.lon, tr.lat, tr.lon) }))
        .filter((r) => Number.isFinite(r.km))
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    return rows.map((tr) => ({ tr, km: null }));
  }, [isItinCat, itinCountry, itinCountryRows, itinTop, itinDays, itinPace,
    itinScale, q, nearPlace]);

  // Which day counts can actually be answered here, so a length nobody
  // composed is greyed out rather than offered and returning nothing.
  const itinFacets = useMemo(() => {
    const pace = new Map();
    const scale = new Map();
    const source = itinCountry ? itinCountryRows : itinTop;
    for (const tr of source || []) {
      if (itinDays && !rankTrips([tr], { days: itinDays }).length) continue;
      pace.set(tr.pace, (pace.get(tr.pace) || 0) + 1);
      scale.set(tr.scale, (scale.get(tr.scale) || 0) + 1);
    }
    return { pace, scale };
  }, [itinCountry, itinCountryRows, itinTop, itinDays]);

  // ── The trips overview map: every listed trip as a pin ────────────────
  //
  // Built from the SAME filtered rows the cards below render, so the country
  // filter, the day rail, the pace chips and a near-search all filter the
  // ── Beaches: the published beach layer ───────────────────────────────

  // Deliberately NOT guarded on beachesLoading, and beachesLoading is
  // deliberately not a dependency. Setting it re-renders, a re-render with it
  // in the dependency list re-runs the effect, the cleanup marks the first
  // fetch stale, and the reply that arrives is thrown away by a run that has
  // already returned early: the list would sit on its loading dots forever.
  // `topBeaches` is the only thing that says the work is done.
  useEffect(() => {
    if (!isBeachCat || topBeaches || layerError.beaches) return undefined;
    let live = true;
    setBeachesLoading(true);
    Promise.all([loadBeachIndex(), loadTopBeaches()]).then(([idx, top]) => {
      if (!live) return;
      setBeachIndex(idx);
      setTopBeaches(top || []);
      setBeachesLoading(false);
    }).catch((e) => {
      if (!live) return;
      setBeachesLoading(false);
      failLayer('beaches')(e);
    });
    return () => { live = false; };
  }, [isBeachCat, topBeaches, layerError.beaches, retryTick, failLayer]);

  // Which countries have beaches at all. The tab never offers one that does
  // not: the export gate decides, so Andorra cannot appear here by having a
  // trip published in it, which is exactly how it used to.
  const beachCountries = useMemo(() => {
    const set = new Set((beachIndex?.countries || []).map((c) => c.cc));
    return set;
  }, [beachIndex]);

  // The country a typed word points at, so "croatia" or "HR" widens the list
  // from the capped European ranking to all 120 Croatian beaches. This is what
  // replaces the country dropdown on this tab.
  const queryCountry = useMemo(() => {
    if (!isBeachCat || !q || q.length < 2) return null;
    for (const cc of beachCountries) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isBeachCat, q, beachCountries, countryName]);

  // Full country files are pulled in only when something asks for one: the
  // country picked in the toolbar, one named in the search, or the country a
  // searched address sits in.
  const wantBeachCountry = (country && beachCountries.has(country) ? country : null)
    || queryCountry
    || (nearPlace && beachCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isBeachCat || !wantBeachCountry || countryBeaches[wantBeachCountry]
      || layerError.beaches) return undefined;
    let live = true;
    Promise.all([
      loadBeaches(wantBeachCountry),
      loadListedBeaches(wantBeachCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryBeaches((cur) => ({ ...cur, [wantBeachCountry]: rows || [] }));
      setListedBeaches((cur) => ({ ...cur, [wantBeachCountry]: listed || [] }));
    }).catch((e) => { if (live) failLayer('beaches')(e); });
    return () => { live = false; };
  }, [isBeachCat, wantBeachCountry, countryBeaches, layerError.beaches, retryTick, failLayer]);

  const beachRows = useMemo(() => {
    if (!isBeachCat || !topBeaches) return null;
    // One country asked for wins outright: its own file is the complete list
    // for that country, where the European ranking only ever held its best.
    const loaded = wantBeachCountry ? countryBeaches[wantBeachCountry] : null;
    let pool = loaded || topBeaches;
    // Measuring from an address is the one case where the country file is not
    // the whole answer: a beach 30 km away can be over a border, and "nearest
    // beaches to here" that stops at customs is a worse answer than a longer
    // list. The European ranking is folded in, deduped by id.
    if (loaded && nearPlace) {
      const have = new Set(loaded.map((b) => b.id));
      pool = [...loaded, ...topBeaches.filter((b) => !have.has(b.id))];
    }
    let rows = applyBeachFacets(pool, beachFacets);
    if (q && !queryCountry) {
      rows = rows.filter((b) => norm(b.name).includes(q)
        || norm(b.nameLocal || '').includes(q)
        || norm(b.region || '').includes(q)
        || norm(countryName(b.cc)).includes(q));
    }
    if (nearPlace) {
      return rows
        .map((b) => ({ b, km: haversineKm(nearPlace.lat, nearPlace.lon, b.lat, b.lon) }))
        .sort((x, y) => x.km - y.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    return rows.map((b) => ({ b, km: null }));
  }, [isBeachCat, topBeaches, countryBeaches, wantBeachCountry, q, queryCountry,
    nearPlace, countryName, beachFacets]);

  const beachCounts = useMemo(() => beachFacetCounts(
    (wantBeachCountry ? countryBeaches[wantBeachCountry] : null) || topBeaches,
    beachFacets,
  ), [topBeaches, countryBeaches, wantBeachCountry, beachFacets]);

  // A shared #beach= link, opened once its country file has landed.
  useEffect(() => {
    if (!openBeach) return;
    setCat('beaches');
    setQuery('');
    setNearPlace(null);
    loadBeaches(openBeach.cc).then((rows) => {
      const hit = (rows || []).find((b) => b.id === openBeach.id);
      if (hit) setPageBeach(hit);
      setCountryBeaches((cur) => ({ ...cur, [openBeach.cc]: rows || [] }));
    }).catch(failLayer('beaches'));
    onOpenBeachConsumed?.();
  }, [openBeach, onOpenBeachConsumed, failLayer]);

  // ── Lakes: the published lake layer ──────────────────────────────────
  //
  // The same three-artifact shape as beaches above, and the same trap avoided
  // the same way: `topLakes` is what says the work is done, never the loading
  // flag, because putting the flag in the dependency list makes the effect
  // re-run on its own state change and throw away its own reply.
  useEffect(() => {
    if (!isLakeCat || topLakes || layerError.lakes) return undefined;
    let live = true;
    setLakesLoading(true);
    Promise.all([loadLakeIndex(), loadTopLakes()]).then(([idx, top]) => {
      if (!live) return;
      setLakeIndex(idx);
      setTopLakes(top || []);
      setLakesLoading(false);
    }).catch((e) => {
      if (!live) return;
      setLakesLoading(false);
      failLayer('lakes')(e);
    });
    return () => { live = false; };
  }, [isLakeCat, topLakes, layerError.lakes, retryTick, failLayer]);

  const lakeCountries = useMemo(
    () => new Set((lakeIndex?.countries || []).map((c) => c.cc)),
    [lakeIndex],
  );

  const queryLakeCountry = useMemo(() => {
    if (!isLakeCat || !q || q.length < 2) return null;
    for (const cc of lakeCountries) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isLakeCat, q, lakeCountries, countryName]);

  const wantLakeCountry = (country && lakeCountries.has(country) ? country : null)
    || queryLakeCountry
    || (nearPlace && lakeCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isLakeCat || !wantLakeCountry || countryLakes[wantLakeCountry]
      || layerError.lakes) return undefined;
    let live = true;
    Promise.all([
      loadLakes(wantLakeCountry),
      loadListedLakes(wantLakeCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryLakes((cur) => ({ ...cur, [wantLakeCountry]: rows || [] }));
      setListedLakes((cur) => ({ ...cur, [wantLakeCountry]: listed || [] }));
    }).catch((e) => { if (live) failLayer('lakes')(e); });
    return () => { live = false; };
  }, [isLakeCat, wantLakeCountry, countryLakes, layerError.lakes, retryTick, failLayer]);

  const lakeRows = useMemo(() => {
    if (!isLakeCat || !topLakes) return null;
    const loaded = wantLakeCountry ? countryLakes[wantLakeCountry] : null;
    let pool = loaded || topLakes;
    // Measuring from an address is the one case where the country file is not
    // the whole answer: Lake Constance is 20 km from a German address and sits
    // in three countries, and a nearest-first list that stops at customs is a
    // worse answer than a longer one.
    if (loaded && nearPlace) {
      const have = new Set(loaded.map((l) => l.id));
      pool = [...loaded, ...topLakes.filter((l) => !have.has(l.id))];
    }
    let rows = applyLakeFacets(pool, lakeFacets);
    if (q && !queryLakeCountry) {
      rows = rows.filter((l) => norm(l.name).includes(q)
        || norm(l.nameLocal || '').includes(q)
        || norm(l.region || '').includes(q)
        || norm(countryName(l.cc)).includes(q));
    }
    if (nearPlace) {
      return rows
        .map((l) => ({ b: l, km: haversineKm(nearPlace.lat, nearPlace.lon, l.lat, l.lon) }))
        .sort((x, y) => x.km - y.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    return rows.map((l) => ({ b: l, km: null }));
  }, [isLakeCat, topLakes, countryLakes, wantLakeCountry, q, queryLakeCountry,
    nearPlace, countryName, lakeFacets]);

  const lakeCounts = useMemo(() => lakeFacetCounts(
    (wantLakeCountry ? countryLakes[wantLakeCountry] : null) || topLakes,
    lakeFacets,
  ), [topLakes, countryLakes, wantLakeCountry, lakeFacets]);

  // A country the traveller typed that has NO published water. `absent` is
  // written by the export gate and carries the difference between "nothing
  // cleared the gate here" and "there is no inland water in this country",
  // which is a real distinction and the reason the empty state does not just
  // say "no match". Monaco is the only country in the second category.
  const absentLakeCountry = useMemo(() => {
    if (!isLakeCat || !q || q.length < 2 || !lakeIndex) return null;
    for (const cc of Object.keys(lakeIndex.absent || {})) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isLakeCat, q, lakeIndex, countryName]);

  // A shared #lake= link, opened once its country file has landed.
  useEffect(() => {
    if (!openLake) return;
    setCat('lakes');
    setQuery('');
    setNearPlace(null);
    loadLakes(openLake.cc).then((rows) => {
      const hit = (rows || []).find((l) => l.id === openLake.id);
      if (hit) setPageLake(hit);
      setCountryLakes((cur) => ({ ...cur, [openLake.cc]: rows || [] }));
    }).catch(failLayer('lakes'));
    onOpenLakeConsumed?.();
  }, [openLake, onOpenLakeConsumed, failLayer]);

  // ── Mountains: the published mountain layer ──────────────────────────
  //
  // Third layer, third time this shape, and the same trap avoided the same
  // way: `topMountains` is what says the work is done, never the loading flag.
  useEffect(() => {
    if (!isMountainCat || topMountains || layerError.mountains) return undefined;
    let live = true;
    setMountainsLoading(true);
    Promise.all([loadMountainIndex(), loadTopMountains()]).then(([idx, top]) => {
      if (!live) return;
      setMountainIndex(idx);
      setTopMountains(top || []);
      setMountainsLoading(false);
    }).catch((e) => {
      if (!live) return;
      setMountainsLoading(false);
      failLayer('mountains')(e);
    });
    return () => { live = false; };
  }, [isMountainCat, topMountains, layerError.mountains, retryTick, failLayer]);

  const mountainCountries = useMemo(
    () => new Set((mountainIndex?.countries || []).map((c) => c.cc)),
    [mountainIndex],
  );

  const queryMountainCountry = useMemo(() => {
    if (!isMountainCat || !q || q.length < 2) return null;
    for (const cc of mountainCountries) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isMountainCat, q, mountainCountries, countryName]);

  const wantMountainCountry = (country && mountainCountries.has(country) ? country : null)
    || queryMountainCountry
    || (nearPlace && mountainCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isMountainCat || !wantMountainCountry
      || countryMountains[wantMountainCountry] || layerError.mountains) return undefined;
    let live = true;
    Promise.all([
      loadMountains(wantMountainCountry),
      loadListedMountains(wantMountainCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryMountains((cur) => ({ ...cur, [wantMountainCountry]: rows || [] }));
      setListedMountains((cur) => ({ ...cur, [wantMountainCountry]: listed || [] }));
    }).catch((e) => { if (live) failLayer('mountains')(e); });
    return () => { live = false; };
  }, [isMountainCat, wantMountainCountry, countryMountains, layerError.mountains,
    retryTick, failLayer]);

  const mountainRows = useMemo(() => {
    if (!isMountainCat || !topMountains) return null;
    const loaded = wantMountainCountry ? countryMountains[wantMountainCountry] : null;
    let pool = loaded || topMountains;
    // Measuring from an address is the one case where the country file is not
    // the whole answer: a border summit sits in two countries and a
    // nearest-first list that stops at customs is a worse answer.
    if (loaded && nearPlace) {
      const have = new Set(loaded.map((m) => m.id));
      pool = [...loaded, ...topMountains.filter((m) => !have.has(m.id))];
    }
    let rows = applyMountainFacets(pool, mtnFacets);
    if (q && !queryMountainCountry) {
      rows = rows.filter((m) => norm(m.name).includes(q)
        || norm(m.nameLocal || '').includes(q)
        || norm(m.range || '').includes(q)
        || norm(countryName(m.cc)).includes(q));
    }
    if (nearPlace) {
      return rows
        .map((m) => ({ b: m, km: haversineKm(nearPlace.lat, nearPlace.lon, m.lat, m.lon) }))
        .sort((x, y) => x.km - y.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    return rows.map((m) => ({ b: m, km: null }));
  }, [isMountainCat, topMountains, countryMountains, wantMountainCountry, q,
    queryMountainCountry, nearPlace, countryName, mtnFacets]);

  const mtnCounts = useMemo(() => mountainFacetCounts(
    (wantMountainCountry ? countryMountains[wantMountainCountry] : null) || topMountains,
    mtnFacets,
  ), [topMountains, countryMountains, wantMountainCountry, mtnFacets]);

  // ---------------------------------------------------------------- cycling
  //
  // Two lists, never one. `routes` are rated and carry a score; `listed` rows
  // are verified to exist and correctly named but have NO score key at all,
  // so they live under their own heading and a screen has to opt in to
  // showing them. `tours` are the composed multi-day plans, which are the
  // reason the layer exists: nothing about them is generated when a reader
  // asks, and each one passed ten hard checks before it was published.
  const cycleCountries = useMemo(
    () => new Set((cycleIndex?.countries || []).map((c) => c.country)),
    [cycleIndex],
  );

  const queryCycleCountry = useMemo(() => {
    if (!isCycleCat || !q || q.length < 2) return null;
    for (const cc of cycleCountries) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isCycleCat, q, cycleCountries, countryName]);

  const wantCycleCountry = (country && cycleCountries.has(country) ? country : null)
    || queryCycleCountry
    || (nearPlace && cycleCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null)
    // No country chosen means the Europe-wide top file, never the first
    // country in the index: that default opened the tab on one Andorran
    // route under a picker that said "All countries".
    || null;

  // Stable per-card handler. CycleCard already hands its own row back to
  // onOpen, so the inline arrow each card used to get bought nothing and
  // defeated the memo on every keystroke.
  const openCycleRoute = React.useCallback((r) => {
    setPageCycle({ routeId: r.id, country: r.cc || wantCycleCountry });
  }, [wantCycleCountry]);
  const openCycleTour = React.useCallback((tr) => {
    setPageCycle({ tourSlug: tr.slug, country: tr.cc || wantCycleCountry });
  }, [wantCycleCountry]);

  useEffect(() => {
    if (!isCycleCat || cycleIndex || layerError.cycling) return undefined;
    let live = true;
    loadCyclingIndex().then((idx) => { if (live) setCycleIndex(idx); })
      .catch((e) => { if (live) failLayer('cycling')(e); });
    return () => { live = false; };
  }, [isCycleCat, cycleIndex, layerError.cycling, retryTick, failLayer]);

  useEffect(() => {
    if (!isCycleCat || wantCycleCountry || cycleTop || layerError.cycling) return undefined;
    let live = true;
    setCyclingLoading(true);
    loadTopCycling().then((top) => {
      if (!live) return;
      setCycleTop(top || { routes: [], listed: [], tours: [] });
      setCyclingLoading(false);
    }).catch((e) => {
      if (!live) return;
      setCyclingLoading(false);
      failLayer('cycling')(e);
    });
    return () => { live = false; };
  }, [isCycleCat, wantCycleCountry, cycleTop, layerError.cycling, retryTick, failLayer]);

  useEffect(() => {
    if (!isCycleCat || !wantCycleCountry || countryCycling[wantCycleCountry]
      || layerError.cycling) {
      return undefined;
    }
    let live = true;
    setCyclingLoading(true);
    loadCycling(wantCycleCountry).then((bundle) => {
      if (!live) return;
      setCountryCycling((cur) => ({ ...cur, [wantCycleCountry]: bundle || null }));
      setCyclingLoading(false);
    }).catch((e) => {
      if (!live) return;
      setCyclingLoading(false);
      failLayer('cycling')(e);
    });
    return () => { live = false; };
  }, [isCycleCat, wantCycleCountry, countryCycling, layerError.cycling, retryTick, failLayer]);

  const cycleBundle = !isCycleCat ? null
    : wantCycleCountry ? countryCycling[wantCycleCountry] : cycleTop;

  // Every row in scope before the facets, for the chip counts: a count is
  // what the chip would leave on screen, so it is taken over the rows the
  // query leaves and nothing else.
  const cycleScope = useMemo(() => {
    if (!isCycleCat || !cycleBundle) return [];
    const inQuery = (r) => !q || queryCycleCountry
      || norm(r.name || '').includes(q) || norm(r.ref || '').includes(q);
    return [...(cycleBundle.routes || []), ...(cycleBundle.listed || [])].filter(inQuery);
  }, [isCycleCat, cycleBundle, q, queryCycleCountry]);
  const cycleCounts = useMemo(() => cycleFacetCounts(cycleScope), [cycleScope]);

  const cycleRows = useMemo(() => {
    if (!isCycleCat || !cycleBundle) return null;
    const match = (r) => (!q || queryCycleCountry
      || norm(r.name || '').includes(q) || norm(r.ref || '').includes(q))
      && cycleMatchesFacets(r, cycleFacets);
    const d = cycleSort.dir;
    const title = (r) => routeTitle(r, t);
    const sortRows = (rows) => {
      const arr = [...rows];
      if (cycleSort.key === 'distance') {
        arr.sort((a, b) => d * ((a.km || 0) - (b.km || 0)));
      } else if (cycleSort.key === 'az') {
        arr.sort((a, b) => d * title(a).localeCompare(title(b), lang));
      } else {
        arr.sort((a, b) => d * ((a.score || 0) - (b.score || 0)));
      }
      return arr;
    };
    const listedAll = (cycleBundle.listed || []).filter(match);
    const localN = listedAll.filter(isLocalNetworkRow).length;
    const listed = cycleShowLocal ? listedAll : listedAll.filter((r) => !isLocalNetworkRow(r));
    return {
      tours: (cycleBundle.tours || []).filter(
        (tr) => !q || queryCycleCountry || norm(tr.title || '').includes(q),
      ),
      routes: sortRows((cycleBundle.routes || []).filter(match)),
      listed: sortRows(listed),
      localHidden: cycleShowLocal ? 0 : localN,
    };
  }, [isCycleCat, cycleBundle, q, queryCycleCountry, cycleFacets, cycleShowLocal,
    cycleSort, lang, t]);

  // Cycling renders three stacked lists off one scroll, so its row count is
  // their sum and the paging window is spent across them in order: the tours
  // first, then whatever is left goes to the routes, then to the listed ones.
  // Slicing each list at `visible` on its own would mount three pages at a
  // time and the sentinel would never be reached.
  const cycleTotal = cycleRows
    ? cycleRows.tours.length + cycleRows.routes.length + cycleRows.listed.length
    : 0;
  const cycleWindow = useMemo(() => {
    if (!cycleRows) return null;
    const tours = Math.min(cycleRows.tours.length, visible);
    const routes = Math.min(cycleRows.routes.length, Math.max(0, visible - tours));
    // Capped by what there is: uncapped, an empty listed tier still drew its
    // heading over nothing, right above the empty state (T367).
    const listed = Math.min(cycleRows.listed.length, Math.max(0, visible - tours - routes));
    return { tours, routes, listed };
  }, [cycleRows, visible]);

  const absentMountainCountry = useMemo(() => {
    if (!isMountainCat || !q || q.length < 2 || !mountainIndex) return null;
    for (const cc of Object.keys(mountainIndex.absent || {})) {
      if (norm(cc) === q || norm(countryName(cc)).startsWith(q)) return cc;
    }
    return null;
  }, [isMountainCat, q, mountainIndex, countryName]);

  // A shared #mtn= link, opened once its country file has landed.
  useEffect(() => {
    if (!openMountain) return;
    setCat('mountains');
    setQuery('');
    setNearPlace(null);
    loadMountains(openMountain.cc).then((rows) => {
      const hit = (rows || []).find((m) => m.id === openMountain.id);
      if (hit) setPageMountain(hit);
      setCountryMountains((cur) => ({ ...cur, [openMountain.cc]: rows || [] }));
    }).catch(failLayer('mountains'));
    onOpenMountainConsumed?.();
  }, [openMountain, onOpenMountainConsumed, failLayer]);

  // A shared #cycle= / #tour= link, or a cycling card on a region page.
  // Simpler than the others: CyclePage loads the route or tour by id itself,
  // so there is no country file to wait for here.
  useEffect(() => {
    if (!openCycle) return;
    setCat('cycling');
    setQuery('');
    setNearPlace(null);
    if (openCycle.kind === 'tour' && openCycle.slug) {
      setPageCycle({ tourSlug: openCycle.slug });
    } else if (openCycle.id) {
      setPageCycle({ routeId: openCycle.id, country: openCycle.country });
    }
    onOpenCycleConsumed?.();
  }, [openCycle, onOpenCycleConsumed]);

  // How many rows the open category actually has. Two arms were missing:
  // cycling and the composed itineraries both fell through to tripRows,
  // which is null with no country selected. That gave rowCount 0, and two
  // things read it. The IntersectionObserver only grows `visible` while
  // `visible < rowCount`, so the itinerary list was capped at one page
  // forever while its sentinel scrolled by loading nothing; and the filter
  // sheet renders its apply button from the same number, so Cycling said
  // "show no results" over hundreds of routes.
  const rowCount = isBeachCat ? (beachRows?.length ?? 0)
      : isLakeCat ? (lakeRows?.length ?? 0)
        : isMountainCat ? (mountainRows?.length ?? 0)
          : isCycleCat ? cycleTotal
            : isItinCat ? (itinRows?.length ?? 0)
              : (tripRows?.length ?? 0);

  // New filter result: collapse the window and go back to the top. Every
  // filter that can change what the list holds belongs in these deps -
  // ticking one that was missing left you mid-page in a four-row result.
  useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [cat, country, q, nearPlace, sort, trailSort, bands, loopsOnly,
    mtnFacets, lakeFacets, beachFacets, journeyView,
    grades, climbs, shapes, hls, suits,
    itinDays, itinPace, itinScale,
    cycleFacets, cycleSort, cycleShowLocal]);

  // Walk-shape filters belong to the Trails list and to nothing else. Leaving
  // them set while the traveller browses Trips would silently hide rows on a
  // tab whose chips are not even on screen to explain why.
  useEffect(() => {
    if (cat !== 'trails') { setBands([]); setLoopsOnly(false); }
    if (cat !== 'mountains') setMtnFacets({});
    if (cat !== 'lakes') setLakeFacets({});
    if (cat !== 'beaches') setBeachFacets({});
    if (cat !== 'cycling') { setCycleFacets({}); setCycleShowLocal(false); }
  }, [cat]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setVisible((v) => (v < rowCount ? v + PAGE : v));
    }, { root: scrollRef.current, rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rowCount]);

  const switchCat = (next) => {
    if (next === cat) return;
    setCat(next);
    setQuery('');
    setJourneyView(null);
    // The country deliberately survives the switch: "I am looking at Albania,
    // now show me its trails" is the whole point of a shared filter. It is
    // dropped only when the tab that arrives cannot offer it, by the effect
    // beside countryOptions, which has to wait for that layer's index.
    scrollRef.current?.scrollTo?.(0, 0);
  };

  const toggleChip = (setter) => (key) => setter(
    (cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const toggleBand = (key) => {
    setBands((cur) => (cur.includes(key)
      ? cur.filter((k) => k !== key)
      : [...cur, key]));
  };

  const fmt = (n) => n.toLocaleString(lang);

  const showCountryIndex = !q && !country && !nearPlace;
  const showTripRows = isTripCat && !trailsLoading && tripRows && tripRows.length > 0;
  // Anything the traveller set that narrows the walks list: when it empties
  // the list, the list says so and offers to clear them, rather than calling
  // the country empty.
  const trailFiltersOn = !!q || bands.length > 0 || grades.length > 0 || climbs.length > 0
    || shapes.length > 0 || hls.length > 0 || suits.length > 0 || loopsOnly;
  const clearTrailFilters = () => {
    setQuery(''); setBands([]); setGrades([]); setClimbs([]);
    setShapes([]); setHls([]); setSuits([]); setLoopsOnly(false);
  };
  // A geocoded point with no country (an ocean, a border way) has no trails
  // file to read, so the trip categories say so rather than render nothing.
  const nearNoCountry = isTripCat && nearPlace && !nearPlace.iso2;
  // Trails carry no price and no rating: a hike is free and is not scored, so
  // the origin, the stay tier and the rating/price/A-Z sorts have nothing to
  // act on here. Distance from a searched city still orders them.
  //
  // Beaches drop the same chrome and the country dropdown with it. A beach is
  // not priced, is not slept in, and is ranked by its own index, so a "priced
  // from Brussels" line and a "dorm bed" tier over the list would be answering
  // a question nobody asked on this tab. The country a traveller wants is
  // reachable by typing its name into the one search field.
  //
  // Lakes and mountains drop it too, and for the same reasons: neither is
  // priced, neither is slept in, and both are ranked by their own index.
  // The curated trip library drops it too: its budgets are editorial ranges
  // for the whole week, not fares priced from the traveller's airport.
  const showPriceChrome = cat !== 'trails' && !isBeachCat && !isLakeCat
    && !isMountainCat && !isCycleCat && !isJourneyBrowse;

  // ── The filter model ──────────────────────────────────────────────────
  //
  // Which countries this tab can offer. Every layer publishes its own set,
  // and offering a country a layer has nothing in is worse than not offering
  // it: the list would empty and nothing on screen would say why.
  const countryOptions = useMemo(() => {
    // Beaches, lakes and mountains key the country as `cc`; cycling keys it
    // as `country`. Both are read here rather than in one caller, so a layer
    // whose index spells it the other way cannot silently produce a list of
    // undefined entries.
    const fromIndex = (idx) => (idx?.countries || [])
      .map((c) => c.cc || c.country)
      .filter(Boolean)
      .map((cc) => [cc, countryName(cc)])
      .sort((a, b) => a[1].localeCompare(b[1], lang));
    if (isBeachCat) return fromIndex(beachIndex);
    if (isLakeCat) return fromIndex(lakeIndex);
    if (isMountainCat) return fromIndex(mountainIndex);
    // Cycling publishes its own country set too. Falling through to the
    // priced catalogue offered countries with no cycling at all, which is
    // exactly what the note above says is worse than not offering them.
    if (isCycleCat) return fromIndex(cycleIndex);
    return availableCountries.map(([cc]) => [cc, countryName(cc)])
      .sort((a, b) => a[1].localeCompare(b[1], lang));
  }, [isBeachCat, isLakeCat, isMountainCat, isCycleCat, beachIndex, lakeIndex,
    mountainIndex, cycleIndex, availableCountries, countryName, lang]);

  // A country the tab that just opened does not publish. Cleared rather than
  // left set, because the picker would show a country the list is not
  // filtered by: every layer has its own set, and Andorra has no beaches.
  useEffect(() => {
    if (!country || countryOptions.length === 0) return;
    if (!countryOptions.some(([cc]) => cc === country)) setCountry('');
  }, [country, countryOptions]);

  // One description of what narrows THIS tab, rendered twice: as the chip row
  // in the toolbar and as the full set inside the Filters sheet. Built here
  // rather than in either of them so the two cannot drift apart.
  const facetGroups = useMemo(() => {
    const out = [];
    if (isItinCat) {
      out.push({
        key: 'pace',
        label: t('trip.askPace'),
        toolbar: true,
        onToggle: (k) => setItinPace((cur) => (cur === k ? null : k)),
        options: TRIP_PACES.map(({ key, labelKey }) => {
          const n = itinFacets.pace.get(key) || 0;
          const isOn = itinPace === key;
          return { key, label: t(labelKey), n, on: isOn, disabled: !n && !isOn };
        }),
      });
      out.push({
        key: 'scale',
        label: t('trip.askScale'),
        toolbar: true,
        onToggle: (k) => setItinScale((cur) => (cur === k ? null : k)),
        options: TRIP_SCALES.map(({ key, labelKey }) => {
          const n = itinFacets.scale.get(key) || 0;
          const isOn = itinScale === key;
          return { key, label: t(labelKey), n, on: isOn, disabled: !n && !isOn };
        }),
      });
    }
    if (cat === 'trails' && !showCountryIndex && trailFacets && trailFacets.total > 0) {
      // Six groups, in the order a walker decides in: how long have I got,
      // how hard do I want it, how much climb, where does it leave me, what
      // will I see, who is coming. A group with nothing to offer in this
      // country is not rendered at all rather than rendered empty.
      const fromCounts = (key, label, defs, on, counts, setter) => {
        const options = defs
          .map((d) => {
            const n = counts.get(d.key) || 0;
            const isOn = on.includes(d.key);
            return { key: d.key, label: t(d.labelKey), n, on: isOn,
              disabled: !n && !isOn };
          })
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) return;
        out.push({ key, label, onToggle: toggleChip(setter), options });
      };

      const lengthOpts = DISTANCE_BANDS.map(({ key, labelKey }) => {
        const n = trailFacets.byBand.get(key) || 0;
        const isOn = bands.includes(key);
        return { key, label: t(labelKey), n, on: isOn, disabled: !n && !isOn };
      });
      if (trailFacets.loops > 0) {
        lengthOpts.push({
          key: 'loop',
          Icon: LoopIcon,
          // Its own class because it is not a length: it rides at the end of
          // the same rail, since "two hours, and a loop" is one thought.
          cls: 'places-loopchip',
          label: t('trails.loopsOnly'),
          n: trailFacets.loops,
          on: loopsOnly,
        });
      }
      out.push({
        key: 'length',
        label: t('trails.lengthLabel'),
        // The one walk group inline: how long have I got is the first
        // question (T384, brief V3-1); the other five live in the sheet.
        toolbar: true,
        onToggle: (k) => (k === 'loop' ? setLoopsOnly((v) => !v) : toggleBand(k)),
        options: lengthOpts,
      });
      fromCounts('grade', t('trails.gradeLabel'), GRADES, grades,
        trailFacets.byGrade, setGrades);
      fromCounts('climb', t('trails.climbLabel'), ASCENT_BANDS, climbs,
        trailFacets.byClimb, setClimbs);
      fromCounts('shape', t('trails.shapeLabel'), ROUTE_TYPES, shapes,
        trailFacets.byShape, setShapes);
      fromCounts('highlights', t('trails.hlLabel'), HIGHLIGHTS, hls,
        trailFacets.byHl, setHls);
      fromCounts('suitability', t('trails.suitLabel'), SUITABILITY, suits,
        trailFacets.bySuit, setSuits);
    }
    if (isCycleCat && cycleRows && cycleScope.length > 0) {
      // Six groups, in the order a rider decides in. Same contract as the
      // beach chips: a count is the rows it would leave, a zero chip is not
      // rendered, and a chip already on survives at zero.
      for (const group of CYCLE_FACET_GROUPS) {
        const on = cycleFacets[group.key] || [];
        const options = group.options
          .map((o) => ({
            key: o.key,
            label: t(o.labelKey),
            n: cycleCounts.get(`${group.key}:${o.key}`) ?? 0,
            on: on.includes(o.key),
          }))
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) continue;
        out.push({
          key: `cycle-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setCycleFacets((cur) => {
            const was = cur[group.key] || [];
            return { ...cur,
              [group.key]: was.includes(k) ? was.filter((x) => x !== k) : [...was, k] };
          }),
          options,
        });
      }
    }
    if (isBeachCat && beachRows) {
      // Nine groups (brief 03 section 4). Every chip carries a count, and a
      // chip whose count is zero in this scope is NOT RENDERED: not greyed
      // out, absent. A disabled control still occupies the rail and still
      // reads as something that ought to work, which is exactly the
      // impression "Nothing built on it 0" gave. A chip the reader has
      // already selected always survives, even at zero, or tapping it would
      // strand them in an empty list with no way back out.
      for (const group of BEACH_FACETS) {
        const on = beachFacets[group.key] || [];
        const options = group.options
          .map((o) => ({
            key: o.key,
            label: t(o.labelKey),
            n: beachCounts.get(`${group.key}:${o.key}`) ?? 0,
            on: on.includes(o.key),
          }))
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) continue;
        out.push({
          key: `beach-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setBeachFacets((cur) => {
            const was = cur[group.key] || [];
            return { ...cur,
                     [group.key]: was.includes(k) ? was.filter((x) => x !== k)
                                                  : [...was, k] };
          }),
          options,
        });
      }
    }
    if (isLakeCat && lakeRows) {
      // Nine filters (brief 04 section 4), and its one hard rule: NEVER
      // render a chip with a zero count. A chip offering "Sufficient water"
      // over a list that holds none of it is a promise the list cannot keep,
      // and greying it out still puts the word on screen. So a zero option is
      // dropped outright, and a group whose every option is zero never
      // renders. A SELECTED chip survives its own zero, because the way back
      // out of an empty list is the chip you tapped to get there.
      for (const group of LAKE_FACETS) {
        const on = lakeFacets[group.key] || [];
        const options = group.options
          .map((o) => {
            const n = lakeCounts.get(`${group.key}:${o.key}`) ?? 0;
            return { key: o.key, label: t(o.labelKey), n, on: on.includes(o.key) };
          })
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) continue;
        out.push({
          key: `lake-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setLakeFacets((cur) => {
            const was = cur[group.key] || [];
            return { ...cur,
                     [group.key]: was.includes(k) ? was.filter((x) => x !== k)
                                                  : [...was, k] };
          }),
          options,
        });
      }
    }
    if (isMountainCat && mountainRows) {
      // Seven filters, plus the kind chips v1 already had. Every one of them
      // carries a count, and a chip with a zero count in this scope renders
      // disabled rather than leading to an empty list (brief 05 section 4).
      for (const group of MOUNTAIN_FACETS) {
        const on = mtnFacets[group.key] || [];
        const options = group.options.map((o) => {
          const n = mtnCounts.get(`${group.key}:${o.key}`) ?? 0;
          const isOn = on.includes(o.key);
          return { key: o.key, label: t(o.labelKey), n, on: isOn,
                   disabled: !n && !isOn };
        });
        if (!options.some((o) => o.n || o.on)) continue;
        out.push({
          key: `mtn-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setMtnFacets((cur) => {
            const was = cur[group.key] || [];
            return { ...cur,
                     [group.key]: was.includes(k) ? was.filter((x) => x !== k)
                                                  : [...was, k] };
          }),
          options,
        });
      }
    }
    return out;
  }, [isCycleCat, cycleRows, cycleScope, cycleCounts, cycleFacets, cat, t, showCountryIndex, isItinCat, itinFacets,
    itinPace, itinScale, trailFacets, bands, loopsOnly,
    grades, climbs, shapes, hls, suits, isBeachCat, beachRows,
    beachFacets, beachCounts, isLakeCat, lakeRows, lakeFacets, lakeCounts,
    isMountainCat, mountainRows, mtnFacets, mtnCounts]);

  // What the Filters badge counts, and what Clear all clears. The country is
  // one of them: it is the filter every tab now carries.
  const activeFilters = (country ? 1 : 0)
    + Object.values(cycleFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + bands.length + (loopsOnly ? 1 : 0)
    + grades.length + climbs.length + shapes.length + hls.length + suits.length
    + Object.values(beachFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + Object.values(lakeFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + Object.values(mtnFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + (itinDays != null ? 1 : 0) + (itinPace ? 1 : 0) + (itinScale ? 1 : 0);

  const resetAll = () => {
    setCountry('');
    setBands([]);
    setLoopsOnly(false);
    setGrades([]);
    setClimbs([]);
    setShapes([]);
    setHls([]);
    setSuits([]);
    setBeachFacets({});
    setLakeFacets({});
    setMtnFacets({});
    setCycleFacets({});
    setCycleShowLocal(false);
    setItinDays(null);
    setItinPace(null);
    setItinScale(null);
  };

  // Every filter that is on, as one removable chip (T384, brief V3-2, rule
  // N6), drawn by shell's FilterChips, the component Explore uses. The
  // country is a chip because it narrows the list like any other; the near
  // place is not, because its own heading already carries its Clear, and two
  // buttons that undo one thing are one too many.
  const activeChips = [];
  if (country) {
    activeChips.push({ key: `cc-${country}`, label: countryName(country), remove: () => setCountry('') });
  }
  for (const g of facetGroups) {
    for (const o of g.options) {
      if (o.on) activeChips.push({ key: `${g.key}-${o.key}`, label: o.label, remove: () => g.onToggle(o.key) });
    }
  }
  // Clear all puts the section back at rest, which is where its opening is.
  const clearAllChips = () => { resetAll(); setQuery(''); setNearPlace(null); };

  // Which sorts this tab has, and whether there is a list for them to order.
  const sortDefs = cat === 'trails' ? TRAIL_SORTS
    : isCycleCat ? CYCLE_SORTS
      : (showPriceChrome ? SORTS : []);
  const showSorts = cat === 'trails'
    ? (!showCountryIndex && !nearPlace && showTripRows)
    : isCycleCat
      ? Boolean(cycleRows && (cycleRows.routes.length + cycleRows.listed.length) > 0)
      : (!showCountryIndex && showPriceChrome);

  // ── The section opening screen (spec 5.3, T183) ──────────────────────
  //
  // Bands 1 and 2 show only while a section is at rest: nothing typed, no
  // place searched, no country picked, no chip on. The first filter of any
  // kind (a rail's "See all" included) folds them away and leaves the grid,
  // which is Band 3; clearing it brings them back. Trails are the exception
  // in scope: their wire is one file per country with no Europe-wide ranking
  // (beaches, lakes, mountains and cycling each ship a top.json), so the
  // trail bands open on a country, and the country index says why.
  const facetsOff = (f) => !Object.values(f).some((l) => l?.length);
  const trailChipsOn = bands.length > 0 || grades.length > 0 || climbs.length > 0
    || shapes.length > 0 || hls.length > 0 || suits.length > 0 || loopsOnly;
  const atRest = !q && !query.trim() && !nearPlace;
  const openingLayer = !atRest ? null
    : isBeachCat ? (!country && facetsOff(beachFacets) && topBeaches?.length ? 'beach' : null)
      : isLakeCat ? (!country && facetsOff(lakeFacets) && topLakes?.length ? 'lake' : null)
        : isMountainCat ? (!country && facetsOff(mtnFacets) && topMountains?.length ? 'mountain' : null)
          : isCycleCat ? (!country && facetsOff(cycleFacets) && cycleTop?.routes?.length ? 'cycle' : null)
            : cat === 'trails' ? (country && !trailChipsOn && tripCards?.length ? 'trail' : null)
              : null;

  const opening = useMemo(() => {
    if (!openingLayer) return null;
    const rows = openingLayer === 'beach' ? topBeaches
      : openingLayer === 'lake' ? topLakes
        : openingLayer === 'mountain' ? topMountains
          : openingLayer === 'cycle' ? (cycleTop?.routes || [])
            : (tripCards || []).map((c) => c.tr).filter((tr) => tr.category !== 'citytrip');
    return { layer: openingLayer, icons: pickIcons(openingLayer, rows), rails: buildRails(openingLayer, rows) };
  }, [openingLayer, topBeaches, topLakes, topMountains, cycleTop, tripCards]);

  // A rail's "See all": its saved filter, put on the grid's own chips.
  const applyRail = (layer, f) => {
    if (layer === 'beach') setBeachFacets(f);
    else if (layer === 'lake') setLakeFacets(f);
    else if (layer === 'mountain') setMtnFacets(f);
    else if (layer === 'cycle') setCycleFacets(f);
    else if (layer === 'trail') {
      setBands(f.bands || []);
      setHls(f.hls || []);
      setSuits(f.suits || []);
      setLoopsOnly(!!f.loopsOnly);
      setGrades([]);
      setClimbs([]);
      setShapes([]);
    }
  };

  const openFromBand = (row) => {
    const layer = opening?.layer;
    if (layer === 'beach') setPageBeach(row);
    else if (layer === 'lake') setPageLake(row);
    else if (layer === 'mountain') setPageMountain(row);
    else if (layer === 'cycle') openCycleRoute(row);
    else if (layer === 'trail') {
      const card = (tripCards || []).find((c) => c.tr.id === row.id);
      if (card) setPageCard(card);
    }
  };

  // One tile's words: the name, where it is, one measured fact and the
  // Score (T428: the same tile Explore's rails draw, through the kit Card).
  const describeRow = (row) => {
    const layer = opening?.layer;
    const km = (v, digits) => `${Number(v).toLocaleString(lang, { maximumFractionDigits: digits })} km`;
    if (layer === 'trail') {
      const grade = tripGrade(row);
      return {
        name: row.name,
        where: grade && GRADE_KEY[grade] ? t(GRADE_KEY[grade]) : null,
        fact: row.distance_m != null ? km(row.distance_m / 1000, 1) : null,
        factLabel: t('card.vLength'),
        rating: trailRating(row),
      };
    }
    if (layer === 'cycle') {
      return {
        name: routeTitle(row, t),
        where: countryName(row.cc),
        fact: row.km != null ? km(row.km, 0) : null,
        factLabel: t('card.vLength'),
        rating: row.score != null ? cycleRating(row, t) : null,
      };
    }
    if (layer === 'mountain') {
      return {
        name: displayName(row.name),
        where: placeLine(row.range, countryName(row.cc)),
        fact: row.ele != null ? `${Math.round(row.ele).toLocaleString(lang)} m` : null,
        factLabel: t('card.vHeight'),
        rating: mountainRating(row, t),
      };
    }
    if (layer === 'lake') {
      const a = row.size?.areaKm2;
      return {
        name: displayName(row.name),
        where: placeLine(row.region, countryName(row.cc)),
        factLabel: t('card.vArea'),
        fact: a != null ? `${a.toLocaleString(lang, { maximumFractionDigits: a < 10 ? 1 : 0 })} km²` : null,
        rating: lakeRating(row, t),
      };
    }
    return {
      name: displayName(row.name),
      where: placeLine(row.region, countryName(row.cc)),
      factLabel: t('card.vLength'),
      fact: row.lengthM != null ? `${Math.round(row.lengthM).toLocaleString(lang)} m` : null,
      rating: beachRating(row, t),
    };
  };

  // ── The section's head, rails and starters (T428) ─────────────────────
  //
  // The head is one photograph of people doing the thing and one title with
  // a verb; it shows while the section is at rest and no country is picked
  // (a picked country gets its own band instead). The best-known set that
  // used to sit under "Europe's 6 best-known mountains" is the first rail
  // now, then the saved cuts: four rails on a desktop, three on a phone, and
  // every cut beyond that is a "Try one" starter that applies the same
  // filter. A starter is offered only where its filter leaves at least
  // RAIL_MIN places (lib/openingScreen.js), so none of them leads nowhere.
  const SECTION_KEY = { trails: 'trails', beaches: 'beaches', lakes: 'lakes', mountains: 'mountains', cycling: 'cycling' };
  const sectionHead = SECTION_KEY[cat] && !country && !nearPlace && !q
    ? { photo: SECTION_PHOTOS[SECTION_KEY[cat]] || null, title: t(`dtab.head.${cat}`) }
    : null;
  const isDesktop = useIsDesktop();
  const railCap = isDesktop ? 4 : 3;
  const openingRails = useMemo(() => {
    if (!opening) return { rails: [], starters: [] };
    const all = [];
    if (opening.icons.length >= 3) {
      all.push({
        key: 'best',
        title: opening.layer === 'trail'
          ? t('dtab.railBestTrail', { country: countryName(country) })
          : t(`dtab.railBest.${opening.layer}`),
        rows: opening.icons,
        onSeeAll: null,
      });
    }
    // A place is shown once across the rails where it can be (row T444-d:
    // Voidokilia stood in three of them); a rail that would drop under four
    // keeps its own order rather than go thin.
    const seen = new Set(all.flatMap((r) => r.rows.map((x) => x.id)));
    for (const r of opening.rails) {
      const fresh = r.rows.filter((x) => !seen.has(x.id));
      const rows = fresh.length >= 4 ? fresh : r.rows;
      rows.forEach((x) => seen.add(x.id));
      all.push({
        key: r.def.key,
        title: t(r.def.titleKey),
        rows,
        onSeeAll: () => applyRail(opening.layer, r.def.facets),
      });
    }
    return {
      rails: all.slice(0, railCap),
      starters: all.slice(railCap).filter((r) => r.onSeeAll)
        .map((r) => ({ key: r.key, title: r.title, onPick: r.onSeeAll })),
    };
    // applyRail only calls the setters, which are stable.
  }, [opening, railCap, t, country, countryName]);

  // ── Desktop chrome ────────────────────────────────────────────────────
  //
  // On a desktop screen this tab's controls leave the toolbar card and take
  // the shape a reader of paper maps expects: everything that narrows the
  // list stands in a panel on the left under the brand, and the search field
  // heads the main column, directly under the top bar and directly over the
  // results it searches. It used to portal into the header instead, which
  // put this page's own question up in the app's chrome, sharing a row with
  // the account and the pass. On a phone nothing moves: the toolbar card
  // stays exactly as it was, and CSS shows one arrangement or the other.

  // ── The tab's chrome (T428) ──────────────────────────────────────────
  //
  // Explore's grammar, so the two browse tabs read as one product:
  //   - the six sections as one row of kit Tabs under the top bar, sticky
  //     while the page scrolls (it was a 2 x 3 grid of buttons on a phone and
  //     a second grid in the desktop panel);
  //   - the search field, in the header's slot on a desktop like Explore's
  //     guided search, beside one Filters button on a phone;
  //   - one refine row over the list: the sort as one select (three toggle
  //     buttons with an arrow before), the country, the Lifestyle door;
  //   - the desktop panel keeps only what narrows the list.
  // No figure rides a chip any more: the list under it is the answer.
  const catTabs = (
    <Tabs
      className="dtab-cats"
      label={t('places.sideBrowse')}
      tabs={CATS.map(({ key, Icon, labelKey }) => ({
        id: key,
        label: (
          <>
            <Icon size={18} />
            <span>{t(labelKey)}</span>
          </>
        ),
      }))}
      value={cat}
      onChange={switchCat}
      panelId="dtab-panel"
    />
  );

  const sortCur = cat === 'trails' ? trailSort : isCycleCat ? cycleSort : sort;
  const pickSort = (key) => {
    if (!key) return;
    if (cat === 'trails') {
      setTrailSort({ key, dir: TRAIL_SORTS.find((x) => x.key === key).defaultDir });
      return;
    }
    if (isCycleCat) {
      setCycleSort({ key, dir: CYCLE_SORTS.find((x) => x.key === key).defaultDir });
      return;
    }
    setNearPlace(null);
    setSort({ key, dir: SORTS.find((x) => x.key === key).defaultDir });
  };
  const renderSort = (cls, hideLabel) => (showSorts && sortDefs.length > 0 ? (
    <Field
      as="select"
      className={cls}
      label={t('places.sortLabel')}
      hideLabel={hideLabel}
      value={sortCur.key}
      onChange={(e) => pickSort(e.target.value)}
    >
      {sortDefs.map(({ key, labelKey }) => (
        <option key={key} value={key}>{t(labelKey)}</option>
      ))}
    </Field>
  ) : null);

  const renderCountry = (cls) => (
    <CountryPicker
      className={cls}
      value={country}
      options={countryOptions}
      onChange={(cc) => { setCountry(cc); setNearPlace(null); }}
      label={t('places.allCountries')}
    />
  );

  // The same door Explore draws, from the same component: this tab prices
  // every card at the traveller's own bed and habits, so the control that
  // sets them cannot look different here.
  const renderLifestyle = (cls) => (
    <LifestyleButton
      stayTier={stayTier}
      lifestyle={lifestyle}
      onClick={onOpenLifestyle}
      className={cls}
    />
  );

  const renderFacetGroups = (only) => facetGroups
    // Inline only the short set flagged `toolbar`, or a group with a chip
    // on (an opening's "See all" can switch on a chip from any group);
    // every other group lives in the Filters sheet (T384, brief V3-1).
    .filter((g) => (only === 'toolbar'
      ? g.toolbar === true || g.options.some((o) => o.on)
      : true))
    .map((g) => (
      <div key={g.key} className="dtab-facet">
        <p className="dtab-facet-label">{g.label}</p>
        <div className="dtab-chips" role="group" aria-label={g.label}>
          {g.options.map((o) => (
            <Chip
              key={o.key}
              kind="filter"
              selected={!!o.on}
              disabled={o.disabled}
              className={o.cls || ''}
              onClick={() => g.onToggle(o.key)}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </div>
    ));

  // The search field, built once. It renders inline in the phone toolbar and
  // portals into the app header on desktop; the suggestion list rides with it.
  const searchField = (
    <div className="places-search" ref={searchRef}>
      <SearchIcon size={15} className="places-search-icon" />
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setSuggOpen(true); }}
        onFocus={() => setSuggOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSearchEnter(); }
          else if (e.key === 'Escape') setSuggOpen(false);
        }}
        placeholder={t('places.searchDest')}
        aria-label={t('places.searchDest')}
      />
      {canLocate && (
        <button
          type="button"
          className="places-locate"
          onClick={useMyLocation}
          disabled={locBusy}
          aria-busy={locBusy || undefined}
          title={t('places.useMyLocation')}
          aria-label={t('places.useMyLocation')}
        >
          {locBusy
            ? <span className="state-pulse"><CrosshairIcon size={16} /></span>
            : <CrosshairIcon size={16} />}
        </button>
      )}
      {suggOpen && (suggestions.length > 0 || canGeo) && (
        <div className="places-sugg" role="listbox">
          {/* Two groups, headed only once the second one exists: the
              places Carta prices, then anywhere else on the map. */}
          {suggestions.length > 0 && geoHits && geoHits.length > 0 && (
            <p className="places-sugg-head">{t('places.suggCatalogue')}</p>
          )}
          {suggestions.map((d) => (
            <button key={d.id} className="places-sugg-item" onClick={() => pickDest(d)}>
              <span className="places-sugg-city">{d.city}</span>
              <span className="places-sugg-country">{d.country}</span>
            </button>
          ))}
          {canGeo && !geoHits && (
            <button
              type="button"
              className="places-sugg-item places-sugg-any"
              onClick={runGeoSearch}
              disabled={geoBusy}
            >
              <span className="places-sugg-city">
                <MapPinIcon size={13} />
                {geoBusy ? t('places.searchingAny') : t('places.searchAny', { q: term })}
              </span>
              {!geoBusy && <span className="places-sugg-country">{t('places.searchAnyHint')}</span>}
            </button>
          )}
          {geoHits && geoHits.length > 0 && (
            <>
              <p className="places-sugg-head">{t('places.suggAnywhere')}</p>
              {geoHits.map((r, i) => {
                const { title, rest } = geoLines(r);
                return (
                  <button
                    key={`${r.lat},${r.lon},${i}`}
                    className="places-sugg-item is-geo"
                    onClick={() => pickGeo(r)}
                  >
                    <span className="places-sugg-city">
                      <MapPinIcon size={13} />
                      {title}
                    </span>
                    <span className="places-sugg-country">{rest}</span>
                  </button>
                );
              })}
            </>
          )}
          {geoHits && geoHits.length === 0 && (
            <p className="places-sugg-note">{t('places.anywhereNone')}</p>
          )}
        </div>
      )}
    </div>
  );

  // The header's search slot belongs to whichever browse tab is on screen
  // (both stay mounted), the way ExploreTab claims it.
  const [headerSlot, setHeaderSlot] = useState(null);
  useEffect(() => {
    if (isDesktop && isActive) setHeaderSlot(document.getElementById('header-search-slot'));
    else setHeaderSlot(null);
  }, [isDesktop, isActive]);

  const filtersButton = facetGroups.length > 0 ? (
    <Button
      ref={filterBtnRef}
      variant="secondary"
      className="dtab-filters"
      iconStart={<FilterIcon size={16} />}
      onClick={() => { setSheetFrom('toolbar'); setSheetOpen(true); }}
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
    >
      {t('filter.filters')}
      {activeFilters > 0 && <Chip kind="count" className="dtab-count">{fmt(activeFilters)}</Chip>}
    </Button>
  ) : null;

  // How long the composed trip is: a stepped select (T428, row T199-a: the
  // slider re-ranked the whole list on every step, 864 to 1,360 ms on a
  // throttled phone).
  const tripLength = isComposedTrips ? (
    <Field
      as="select"
      className="dtab-length"
      label={t('trip.lengthLabel')}
      // The whole result set, for the trips harness: the list renders a page
      // at a time, and the number is never said on screen (2026-09-02).
      data-n={itinRows ? itinRows.length : 0}
      value={itinDays == null ? '' : String(itinDays)}
      onChange={(e) => setItinDays(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">{t('trip.anyLength')}</option>
      {TRIP_DAYS.map((d) => (
        <option key={d} value={d}>{t(d === 1 ? 'trip.oneDay' : 'trip.nDays', { n: d })}</option>
      ))}
    </Field>
  ) : null;

  const countryControl = countryOptions.length > 0 ? renderCountry('places-country dtab-country-pick') : null;
  const lifestyleControl = showPriceChrome && onOpenLifestyle ? renderLifestyle('dtab-lifestyle') : null;
  const sortControl = renderSort('dtab-sort', true);
  const refineRow = (sortControl || countryControl || lifestyleControl || tripLength) ? (
    <div className="dtab-refine">
      {tripLength}
      {sortControl}
      {countryControl}
      {lifestyleControl}
    </div>
  ) : null;

  // A picked country, said once over the list with the one line it is known
  // for, and the door to its places on Explore (T428).
  // A country typed into the search counts too (typedCc), the way the old
  // "Beaches in Sweden" line followed the field.
  const bandCc = nearPlace ? null : (typedCc || null);
  const countryBand = bandCc ? (
    <div className="dtab-countryband">
      <CountryFlag country={bandCc} size={18} className="dtab-countryband-flag" />
      <div className="dtab-countryband-text">
        <h2 className="dtab-countryband-name">{countryName(bandCc)}</h2>
        {countryKnownKey(bandCc) && <p className="dtab-countryband-line">{t(countryKnownKey(bandCc))}</p>}
      </div>
      {onExploreCountry && (
        <Button variant="quiet" size="sm" className="dtab-countryband-go"
          iconEnd={<ChevronRightIcon size={14} />} onClick={() => onExploreCountry(bandCc)}>
          {t('dtab.exploreCountry', { country: countryName(bandCc) })}
        </Button>
      )}
    </div>
  ) : null;

  const pickCountry = (cc) => {
    setCountry(cc);
    setNearPlace(null);
    scrollRef.current?.scrollTo?.(0, 0);
  };
  // The countries this section can open, as gallery cards (T428).
  const countryTrack = countryOptions.length > 0 ? (
    <Strip id={`dtab-bycountry-${cat}`} title={t('dtab.byCountry')} t={t} className="dtab-bycountry">
      {countryOptions.map(([cc, name]) => (
        <li key={cc} className="dtab-item dtab-item-country">
          <CountryGalleryCard cc={cc} name={name} onPick={pickCountry} t={t}
            href={`?tab=places&dc=${cat}&dn=${cc}`}
            sizes="(max-width: 768px) 80vw, 320px" />
        </li>
      ))}
    </Strip>
  ) : null;

  // T451: on a phone the section row scrolls sideways; the section a link
  // or a starter opened is brought into view, never left off-screen.
  useEffect(() => {
    if (!isActive) return;
    const el = document.querySelector('.dtab-cats [aria-selected="true"]');
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [cat, isActive]);

  return (
    <div className="places-shell">
      {/* The page's one h1 (T186): the tab has no visible title, so the name
          is for assistive technology. It steps aside while a dialog (a detail
          page, a sheet) is open, so that dialog's own h1 is the only one. */}
      <h1 className="sr-only tab-h1">{t('nav.places')}</h1>
      {/* Desktop only (CSS hides it under 769px): everything that narrows
          the list, on the page ground with one hairline to its right. */}
      <aside className="side-panel places-side" aria-label={t('places.sideAria')}>
        <div className="side-block">
          <p className="side-label">
            {t('places.sideRefine')}
            {activeFilters > 0 && (
              <Button variant="quiet" size="sm" className="side-clear" onClick={resetAll}>
                {t('filter.reset')}
              </Button>
            )}
          </p>
          {tripLength && <div className="side-group">{tripLength}</div>}
          {showSorts && sortDefs.length > 0 && (
            <div className="side-group">{renderSort('dtab-sort-side', false)}</div>
          )}
          {countryOptions.length > 0 && (
            <div className="side-group">
              <p className="side-sub">{t('day.country')}</p>
              {renderCountry('places-country side-country')}
            </div>
          )}
          {facetGroups.length > 0 && (
            <div className="side-group side-facets">
              {renderFacetGroups('toolbar')}
              <Button
                variant="secondary"
                block
                className="side-allfilters"
                iconStart={<FilterIcon size={16} />}
                onClick={() => { setSheetFrom('side'); setSheetOpen(true); }}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
              >
                {t('places.allFilters')}
                {activeFilters > 0 && <Chip kind="count" className="dtab-count">{fmt(activeFilters)}</Chip>}
              </Button>
            </div>
          )}
          {showPriceChrome && onOpenLifestyle && (
            <div className="side-group">
              {renderLifestyle('side-lifestyle')}
            </div>
          )}
        </div>
      </aside>

      <div className="places-tab" ref={scrollRef}>
      <div className="places-wrap">
        <div className="dtab-bar">{catTabs}</div>
        {headerSlot
          ? createPortal(searchField, headerSlot)
          : (
            <div className="dtab-top">
              {searchField}
              {!isDesktop && filtersButton}
            </div>
          )}

        <div className="dtab-panel" id="dtab-panel" role="tabpanel"
          aria-label={t((CATS.find((c) => c.key === cat) || CATS[0]).labelKey)}>
        {/* A refused or failed location fix, said once, under the field that
            asked for it. Cleared as soon as anything is typed. */}
        {locErr && <p className="places-locate-err" role="status">{locErr}</p>}

        {nearPlace && (() => {
          // The scope ladder: the header is composed from the scope that
          // actually answered, decided by the NEAREST row. "Near Knokke"
          // only ever sits above things that are near Knokke; when the
          // closest result is a day out, or three regions over, the header
          // says so instead. Rows themselves carry band chips, and band
          // rules divide the list, so a far row can never render under a
          // near heading.
          const kmRows = (cat === 'beaches' ? beachRows
            : cat === 'lakes' ? lakeRows
              : cat === 'mountains' ? mountainRows
                : cat === 'trails' ? tripRows
                  : cat === 'trips' ? itinRows
                    : null) || [];
          const scope = scopeForRows(kmRows.map((x) => ({
            km: x.km,
            region: (x.b || x.p || x.tr || (x.c && x.c.tr) || {}).region || null,
          })));
          const head = scope.scope === 'nearby' || scope.scope === 'none'
            ? t('places.nearHead', { city: nearPlace.name })
            : scope.scope === 'day_trip'
              ? t('scope.daytripHead', { city: nearPlace.name })
              : scope.regionName
                ? t('scope.farRegionHead', { city: nearPlace.name, region: scope.regionName })
                // Floored, so "nothing within 84 km" stays true of a
                // nearest row 84.6 km out.
                : t('scope.farHead', { city: nearPlace.name, km: Math.floor(scope.km || 0) });
          return (
            <div className="places-nearhead" data-scope={scope.scope}>
              <span className="places-nearname">{head}</span>
              {nearPlace.sub && <span className="places-nearsub">{nearPlace.sub}</span>}
              <Button variant="quiet" size="sm" className="places-nearclear" onClick={() => setNearPlace(null)}>
                {t('places.clearNear')}
              </Button>
            </div>
          );
        })()}


        {countryBand}

        {cat === 'trips' && !journeyView && !country && (
          <h2 className="dtab-title dtab-title-solo">{t('dtab.head.trips')}</h2>
        )}

        {/* Trails at rest: the head, then the countries (a walk is ranked
            within its country, so the section opens on them). */}
        {cat === 'trails' && sectionHead && !opening && (
          <SectionHead photo={sectionHead.photo} title={sectionHead.title} id="dtab-head-trails" />
        )}

        {/* The section's opening while it is at rest (T183, rebuilt T428):
            the head, Try one, the rails, the countries; then the list. */}
        {opening && (
          <>
            <SectionOpening
              layer={opening.layer}
              head={sectionHead}
              rails={openingRails.rails}
              starters={openingRails.starters}
              describe={describeRow}
              photo={(row) => photoOf(opening.layer, row)}
              onOpen={openFromBand}
              sharedKey={(row) => row.id}
              t={t}
            >
              {opening.layer !== 'trail' && countryTrack}
            </SectionOpening>
            <h2 className="open-gridhead dtab-gridhead">{t('open.gridHead')}</h2>
          </>
        )}

        {!isJourneyBrowse && !(cat === 'trails' && showCountryIndex) && refineRow}

        {activeChips.length > 0 && (
          <FilterChips t={t} chips={activeChips} onClearAll={clearAllChips} />
        )}

        {/* Beaches. No country index in front of the list: the tab opens on
            the beaches themselves, ranked across Europe, because "show me a
            beach" is the request and a page of flags is not an answer to it.
            Typing a country's name swaps the capped European ranking for that
            country's full list. */}
        {isBeachCat && (
          <div className="places-list pcard-grid">
            {layerError.beaches && (
              <LayerError onRetry={() => retryLayer('beaches')} t={t} msg="beach.loadFailed" />
            )}

            {beachesLoading && <PlaceCardSkeletons label={t('card.loading')} />}

            {!beachesLoading && beachRows && (
              beachRows.length > 0
                ? (
                  <>
                    {beachRows.slice(0, visible).map(({ b, km }, i) => (
                      <React.Fragment key={b.id}>
                        {bandBreak(beachRows, i) && (
                          <p className="places-bandhead">{t(bandBreak(beachRows, i))}</p>
                        )}
                        <BeachCard
                          beach={b}
                          km={km}
                          countryName={countryName(b.cc)}
                          onOpen={setPageBeach}
                          t={t}
                        />
                      </React.Fragment>
                    ))}
                    {/* The listed tier, under its own heading and never
                        interleaved: these rows carry no score key at all, so
                        they cannot be ranked and must not look as if they
                        were. Shown once the ranked list has run out, which is
                        where "what else is here" is the actual question, and
                        it is what keeps a stretch of coast from looking empty
                        because nobody has photographed it yet. */}
                    {wantBeachCountry && !nearPlace
                      && (listedBeaches[wantBeachCountry] || []).length > 0
                      && beachRows.length <= visible && (
                      <div className="places-alsohere">
                        <p className="places-beachhead">
                          {t('beach.alsoHead', {
                            country: countryName(wantBeachCountry),
                          })}
                        </p>
                        <ul className="places-listedrows">
                          {(listedBeaches[wantBeachCountry] || []).map((b) => (
                            <li key={b.id} className="places-listedrow">
                              <span className="places-listedrow-name">
                                {b.name}
                              </span>
                              {b.region && (
                                <span className="places-listedrow-ele">
                                  {b.region}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
                : Object.values(beachFacets).some((l) => l?.length)
                  ? chipsEmpty('beach.noneChips', () => setBeachFacets({}))
                  : nearPlace
                    ? radiusEmpty('beach')
                    : typedCc
                      ? countryEmpty('beach', typedCc)
                      : queryEmpty('beach.noneMatch')
            )}

            {/* Not loaded yet (the first frame, before the fetch starts): the
                same skeleton the fetch shows. A failed fetch is LayerError
                above, never a claim that the layer has not shipped. */}
            {!beachesLoading && !beachRows && !layerError.beaches && (
              <PlaceCardSkeletons label={t('card.loading')} />
            )}

            {visible < (beachRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

          </div>
        )}

        {/* Lakes. Same shape as beaches: no country index in front of the
            list, because "show me a lake" is the request and a page of flags
            is not an answer to it. Typing a country's name swaps the capped
            European ranking for that country's full list. */}
        {isLakeCat && (
          <div className="places-list pcard-grid">
            {layerError.lakes && (
              <LayerError onRetry={() => retryLayer('lakes')} t={t} msg="lake.loadFailed" />
            )}

            {lakesLoading && <PlaceCardSkeletons label={t('card.loading')} />}

            {!lakesLoading && lakeRows && (
              lakeRows.length > 0
                ? (
                  <>
                    {lakeRows.slice(0, visible).map(({ b, km }, i) => (
                      <React.Fragment key={b.id}>
                        {bandBreak(lakeRows, i) && (
                          <p className="places-bandhead">{t(bandBreak(lakeRows, i))}</p>
                        )}
                        <LakeCard
                          lake={b}
                          km={km}
                          countryName={countryName(b.cc)}
                          onOpen={setPageLake}
                          t={t}
                          month={travelMonth}
                          warmC={lakeIndex?.model?.warm_c ?? 18}
                          lang={lang}
                        />
                      </React.Fragment>
                    ))}
                    {/* The listed tier, under its own heading and never
                        interleaved: these rows carry no score key at all, so
                        they cannot be ranked and must not look as if they
                        were. Shown once the ranked list has run out, which is
                        where "what else is here" is the actual question. */}
                    {wantLakeCountry && !nearPlace
                      && (listedLakes[wantLakeCountry] || []).length > 0
                      && lakeRows.length <= visible && (
                      <div className="places-alsohere">
                        <p className="places-beachhead">
                          {t('lake.alsoHead', {
                            country: countryName(wantLakeCountry),
                          })}
                        </p>
                        <ul className="places-listedrows">
                          {(listedLakes[wantLakeCountry] || []).map((l) => (
                            <li key={l.id} className="places-listedrow">
                              <span className="places-listedrow-name">
                                {l.name}
                              </span>
                              {l.region && (
                                <span className="places-listedrow-ele">
                                  {l.region}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
                : Object.values(lakeFacets).some((l) => l?.length)
                  ? chipsEmpty('lake.noneChips', () => setLakeFacets({}))
                  : nearPlace
                    ? radiusEmpty('lake')
                    : (absentLakeCountry || typedCc)
                      ? countryEmpty('lake', absentLakeCountry || typedCc)
                      : queryEmpty('lake.noneMatch')
            )}

            {!lakesLoading && !lakeRows && !layerError.lakes && (
              <PlaceCardSkeletons label={t('card.loading')} />
            )}

            {visible < (lakeRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

          </div>
        )}

        {/* Mountains. Same shape as beaches and lakes: no country index in
            front of the list, because "show me a mountain" is the request and
            a page of flags is not an answer to it. Typing a country's name
            swaps the capped European ranking for that country's full list. */}
        {isMountainCat && (
          <div className="places-list pcard-grid">
            {layerError.mountains && (
              <LayerError onRetry={() => retryLayer('mountains')} t={t} msg="mtn.loadFailed" />
            )}

            {mountainsLoading && <PlaceCardSkeletons label={t('card.loading')} />}

            {!mountainsLoading && mountainRows && (
              mountainRows.length > 0
                ? (
                  <>
                    {/* The listed tier, under its own heading and never
                        inside the ranked list. These rows carry no score
                        key at all, so there is nothing to sort them by and
                        nothing to render as a rating: they say the mountain
                        exists, is named correctly and is in this region,
                        which is the honest answer where the gates could not
                        say more. */}
                    {mountainRows.slice(0, visible).map(({ b, km }, i) => (
                      <React.Fragment key={b.id}>
                        {bandBreak(mountainRows, i) && (
                          <p className="places-bandhead">{t(bandBreak(mountainRows, i))}</p>
                        )}
                        <MountainCard
                          mountain={b}
                          km={km}
                          countryName={countryName(b.cc)}
                          onOpen={setPageMountain}
                          t={t}
                          lang={lang}
                        />
                      </React.Fragment>
                    ))}
                    {wantMountainCountry && !nearPlace
                      && (listedMountains[wantMountainCountry] || []).length > 0
                      && mountainRows.length <= visible && (
                      <div className="places-alsohere">
                        <p className="places-beachhead">
                          {t('mtn.alsoHead', {
                            country: countryName(wantMountainCountry),
                          })}
                        </p>
                        <ul className="places-listedrows">
                          {(listedMountains[wantMountainCountry] || [])
                            .map((m) => (
                              <li key={m.id} className="places-listedrow">
                                <span className="places-listedrow-name">
                                  {m.name}
                                </span>
                                {m.ele != null && (
                                  <span className="places-listedrow-ele">
                                    {Math.round(m.ele).toLocaleString(lang)} m
                                  </span>
                                )}
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
                : Object.values(mtnFacets).some((l) => l?.length)
                  ? chipsEmpty('mtn.noneChips', () => setMtnFacets({}))
                  : nearPlace
                    ? radiusEmpty('mountain')
                    : (absentMountainCountry || typedCc)
                      ? countryEmpty('mountain', absentMountainCountry || typedCc)
                      : queryEmpty('mtn.noneMatch')
            )}

            {!mountainsLoading && !mountainRows && !layerError.mountains && (
              <PlaceCardSkeletons label={t('card.loading')} />
            )}

            {visible < (mountainRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

          </div>
        )}

        {/* Cycling. Tours first, because a tour is the answer to "plan me a
            cycling trip" and a route is the catalogue entry underneath it.
            Listed routes sit under their own heading with no score, which is
            what makes the coverage honest rather than merely large. */}
        {isCycleCat && (
          <div className="places-list pcard-grid" data-testid="cycle-list">
            {layerError.cycling && (
              <LayerError onRetry={() => retryLayer('cycling')} t={t} msg="cycle.loadFailed" />
            )}

            {cyclingLoading && <PlaceCardSkeletons label={t('card.loading')} />}

            {/* EuroVelo families. In OSM a EuroVelo is one relation PER
                COUNTRY SECTION under a superroute, so without this band the
                catalogue shows "EuroVelo 6 part Germany 3" and never the
                6,308 km thing it belongs to. The manifest is the same
                membership the harvest stamps; the geometry stays in the
                per-route files. */}
            {!cyclingLoading && (cycleIndex?.families || []).length > 0 && (
              <>
                <p className="places-bandhead">{t('cycle.familiesTitle')}</p>
                <div className="cycle-famrow">
                  {(cycleIndex.families || []).map((f) => (
                    <button
                      type="button"
                      key={f.ref}
                      className="cycle-famchip"
                      data-testid="cycle-famchip"
                      onClick={() => setPageCycle({ familyRef: f.ref })}
                    >
                      <span className="cycle-famchip-ref">{f.ref}</span>
                      <span className="cycle-famchip-meta">
                        {t('cycle.familyMeta', {
                          km: count(f.km),
                          countries: countryPhrase(f.countries.length, t),
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {!cyclingLoading && cycleRows && (
              <>
                {cycleWindow.tours > 0 && (
                  <>
                    <p className="places-bandhead">{t('cycle.toursTitle')}</p>
                    {cycleRows.tours.slice(0, cycleWindow.tours).map((tr) => (
                      <CycleTourCard
                        key={tr.slug}
                        tr={tr}
                        t={t}
                        countryName={countryName(tr.cc || wantCycleCountry)}
                        onOpen={openCycleTour}
                      />
                    ))}
                  </>
                )}

                {cycleWindow.routes > 0 && (
                  <>
                    <p className="places-bandhead">{t('cycle.routesTitle')}</p>
                    {cycleRows.routes.slice(0, cycleWindow.routes).map((r) => (
                      <CycleCard
                        key={r.id}
                        r={r}
                        t={t}
                        countryName={countryName(r.cc || wantCycleCountry)}
                        onOpen={openCycleRoute}
                      />
                    ))}
                  </>
                )}

                {cycleWindow.listed > 0 && (
                  <>
                    <p className="places-bandhead"
                      data-testid="cycle-listed-head">
                      {t('cycle.listedHeading')}
                    </p>
                    {cycleRows.listed.slice(0, cycleWindow.listed).map((r) => (
                      <CycleCard
                        key={r.id}
                        r={r}
                        t={t}
                        countryName={countryName(r.cc || wantCycleCountry)}
                        onOpen={openCycleRoute}
                      />
                    ))}
                  </>
                )}

                {wantCycleCountry && (cycleRows.localHidden > 0 || cycleShowLocal) && (
                  <Button
                    variant="quiet"
                    size="sm"
                    className="cycle-localtoggle"
                    data-testid="cycle-local-toggle"
                    onClick={() => setCycleShowLocal((v) => !v)}
                  >
                    {cycleShowLocal
                      ? t('cycle.hideLocal')
                      : t('cycle.showLocal')}
                  </Button>
                )}

                {!cycleRows.tours.length && !cycleRows.routes.length
                  && !cycleRows.listed.length && !cycleRows.localHidden && (
                  Object.values(cycleFacets).some((l) => l?.length)
                    ? chipsEmpty('cycle.noneChips', () => setCycleFacets({}))
                    : nearPlace
                      ? radiusEmpty('cycling')
                      : typedCc
                        ? countryEmpty('cycling', typedCc)
                        : queryEmpty('cycle.noneMatch')
                )}

                {visible < cycleTotal && (
                  <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
                )}
              </>
            )}

            {!cyclingLoading && !cycleRows && !layerError.cycling && (
              <PlaceCardSkeletons label={t('card.loading')} />
            )}

          </div>
        )}

        {isJourneyBrowse && (
          <JourneysSection
            q={debouncedQuery}
            country={country}
            view={journeyView}
            onView={setJourneyView}
            onOpen={(card) => setPageJourney({ id: card.id, gw: card.gw || null })}
            onComposed={() => setJourneyView('composed')}
            countryName={countryName}
            geoOf={geoOf}
            onAllCountries={() => { setCountry(''); setQuery(''); }}
            onClearSearch={() => setQuery('')}
            t={t}
            lang={lang}
          />
        )}

        {isComposedTrips && (
          <Button
            variant="quiet"
            size="sm"
            className="jsec-back jsec-back-solo"
            iconStart={<ArrowLeftIcon size={14} />}
            onClick={() => {
              setJourneyView(null);
              setItinDays(null);
              setItinPace(null);
              setItinScale(null);
            }}
          >
            {t('journey.backStyles')}
          </Button>
        )}

        {isItinCat && (
          <div className="places-list">
            {layerError.trips && (
              <LayerError onRetry={() => retryLayer('trips')} t={t} msg="trip.loadFailed" />
            )}

            {/* itinRows === null is this list's loading state, which is also
                exactly where a failed fetch leaves it: without the guard the
                dots spun forever on a dropped connection. Still blocks of a
                card's size, not an ellipsis (T394, carta-design "Loading"). */}
            {itinRows === null && !layerError.trips && <PlaceCardSkeletons n={3} label={t('card.loading')} />}

            {itinRows && itinRows.length > 0 && (
              <>
                {/* No count line here: the slider already carries the number,
                    and saying it twice was one sentence too many. */}
                {itinRows.slice(0, visible).map(({ tr, km }, i) => (
                  <React.Fragment key={tr.id}>
                    {bandBreak(itinRows, i) && (
                      <p className="places-bandhead">{t(bandBreak(itinRows, i))}</p>
                    )}
                    <ItinCard tr={tr} km={km} onOpen={setPageItin} t={t} />
                  </React.Fragment>
                ))}
              </>
            )}

            {itinRows && itinRows.length === 0 && (
              nearPlace
                ? radiusEmpty('itin', (layer, row) => setPageItin(row))
                // A country with no composed trip at all, nothing else set:
                // the coverage module, not "nothing matches those filters".
                : (itinCountry && !itinDays && !itinPace && !itinScale && !q)
                  ? countryEmpty('itin', itinCountry, (layer, row) => setPageItin(row))
                  : itinDays
                  ? (
                    <div className="places-empty empty-act">
                      <p>{t('trip.emptyDays', { n: itinDays })}</p>
                      {/* The two lengths either side, where anything was
                          composed at them; a button that led to another
                          empty list would only move the dead end. */}
                      {[itinDays - 1, itinDays + 1]
                        .filter((n) => n >= 2 && rankTrips(itinCountry ? itinCountryRows : itinTop,
                          { days: n, pace: itinPace, scale: itinScale }).some((tr) => tr.days === n))
                        .map((n) => (
                          <Button key={n} variant="secondary" size="sm" className="cov-empty-btn" onClick={() => setItinDays(n)}>
                            {t('journey.nDays', { n })}
                          </Button>
                        ))}
                    </div>
                  )
                  : chipsEmpty('trip.emptyAll', () => {
                    setItinDays(null); setItinPace(null); setItinScale(null); setQuery('');
                  }, 'empty.clearFilters')
            )}

            {itinRows && visible < itinRows.length && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

          </div>
        )}

        {isTripCat && !isItinCat && (
          <div className={`places-list${showCountryIndex ? ' dtab-trail-index' : ' pcard-grid'}`}>
            {showCountryIndex && (
              <>
                {/* A way in without a country (T384, brief V3-10): the
                    locate the search field already has, said in words where
                    the walker is choosing. */}
                {cat === 'trails' && tripCountries.length > 0 && canLocate && (
                  <div className="places-nearme">
                    <Button variant="secondary" size="sm" className="places-nearme-btn"
                      iconStart={<CrosshairIcon size={16} />} onClick={useMyLocation} loading={locBusy}>
                      {t('places.walksNearMe')}
                    </Button>
                  </div>
                )}
                {/* T451: a track like every other section's "By country", not a
                    grid of forty galleries that ran fourteen thousand pixels. */}
                {tripCountries.length > 0 && (
                  <Strip id="dtab-trail-countries" title={t('dtab.chooseCountry')} t={t} className="dtab-bycountry">
                    {tripCountries.map((c) => (
                      <li key={c.cc} className="dtab-item dtab-item-country">
                        <CountryGalleryCard
                          cc={c.cc}
                          name={c.name}
                          onPick={pickCountry}
                          t={t}
                          href={`?tab=places&dc=${cat}&dn=${c.cc}`}
                          sizes="(max-width: 768px) 80vw, 320px"
                        />
                      </li>
                    ))}
                  </Strip>
                )}
                {trailsIndex && tripCountries.length === 0 && (
                  <CoverageEmpty layer="trail" cc="" countryName={countryName} onOpen={openNeighbour} />
                )}
              </>
            )}

            {!showCountryIndex && layerError.trails && (
              <LayerError onRetry={() => retryLayer('trails')} t={t} msg="trails.loadFailed" />
            )}

            {!showCountryIndex && trailsLoading && !layerError.trails && <PlaceCardSkeletons label={t('card.loading')} />}

            {!showCountryIndex && !trailsLoading && tripRows && (
              tripRows.length > 0
                ? tripRows.slice(0, visible).map(({ c, km }, i) => (
                  <React.Fragment key={c.tr.id}>
                    {bandBreak(tripRows, i) && (
                      <p className="places-bandhead">{t(bandBreak(tripRows, i))}</p>
                    )}
                    <TripCard card={c} km={km} onOpen={setPageCard} t={t} countryName={countryName} />
                  </React.Fragment>
                ))
                : trailFiltersOn
                  ? chipsEmpty('places.noneFilters', clearTrailFilters, 'empty.clearFilters')
                  : cat !== 'trails'
                    ? (nearPlace
                      ? chipsEmpty('places.noneNear', () => setNearPlace(null), 'cov.showAll', { city: nearPlace.name })
                      : (
                        <div className="places-empty empty-act">
                          <p>{t('places.cityWalksEmpty', { country: countryName(trailsCountry || country) })}</p>
                          <Button variant="secondary" size="sm" className="cov-empty-btn" onClick={() => { setQuery(''); setCountry(''); }}>
                            {t('cov.showAll')}
                          </Button>
                        </div>
                      ))
                    : nearPlace
                      ? radiusEmpty('trail')
                      : countryEmpty('trail', trailsCountry || country)
            )}

            {!showCountryIndex && !trailsLoading && !tripRows && nearNoCountry
              && !layerError.trails && (
              cat === 'trails'
                ? radiusEmpty('trail')
                : chipsEmpty('places.noneNear', () => setNearPlace(null), 'cov.showAll', { city: nearPlace.name })
            )}

            {!showCountryIndex && visible < (tripRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {showTripRows && (
              <>
                {stubs.length > 0 && (
                  <div className="stub-list" data-testid="stub-list">
                    <h2 className="stub-list-head">{t('stub.listHead')}</h2>
                    <ul>
                      {(stubsAll ? stubs : stubs.slice(0, 6)).map((st) => (
                        <li key={st.id}>
                          <button type="button" className="stub-row" onClick={() => setPageStub(st)}>
                            <span className="stub-row-name">{stripDashes(st.name)}</span>
                            <span className="stub-row-meta">
                              {st.region ? `${st.region}` : ''}
                              {Number.isFinite(st.km) && (
                                <span className="mono">{st.region ? ' ' : ''}{fmt(Math.round(st.km))} km</span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {!stubsAll && stubs.length > 6 && (
                      <Button variant="quiet" size="sm" className="stub-more" onClick={() => setStubsAll(true)}>
                        {t('stub.showAll')}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <SourcesFold cat={cat} isComposedTrips={isComposedTrips} sectionHead={sectionHead}
          countries={cat === 'trails' && showCountryIndex ? tripCountries.map((c) => c.cc)
            : (opening && opening.layer !== 'trail' ? countryOptions.map(([cc]) => cc) : (country ? [country] : []))}
          t={t} />
        </div>
      </div>

      {pageCard && (
        <Suspense fallback={null}>
          <TrailPage
            card={pageCard}
            {...favProps('trail', pageCard.tr?.id, pageCard.tr?.cc || pageCard.tr?.country)}
            onAddToDay={onAddToDay ? (f) => onAddToDay('trail', f) : null}
            dests={data?.destinations}
            onOpenNeighbour={openNeighbour}
            onClose={() => setPageCard(null)}
            onSelectDest={(id) => { setPageCard(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageStub && (
        <Suspense fallback={null}>
          <StubPage stub={pageStub} countryName={countryName} onClose={() => setPageStub(null)} />
        </Suspense>
      )}

      {pageJourney && (
        <Suspense fallback={null}>
          <JourneyPage
            id={pageJourney.id}
            railFrom={railOrigin(data, origin)}
            stayTier={stayTier}
            stayTiers={stayTiers}
            onChangeStayTier={onChangeStayTier}
            gatewayDest={(() => {
              // The gateway airport code doubles as a catalogue id (BCN,
              // VIE...), which is what lets the page end on a priced CTA.
              const d = pageJourney.gw ? data.destinations[pageJourney.gw] : null;
              return d ? { id: pageJourney.gw, city: d.city } : null;
            })()}
            onClose={() => setPageJourney(null)}
            onSelectDest={(id) => { setPageJourney(null); onSelectDest(id); }}
            onOpenJourney={(card) => setPageJourney({ id: card.id, gw: card.gw || null })}
          />
        </Suspense>
      )}

      {pageItin && (
        <Suspense fallback={null}>
          <TripPage
            trip={pageItin}
            {...favProps('trip', pageItin.id)}
            data={data}
            onClose={() => setPageItin(null)}
            onOpenInPlanner={onOpenTripInPlanner}
            onSelectDest={(id) => { setPageItin(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageBeach && (
        <>
          {/* Starts the hero's download while the page chunk is still in
              flight (T052); renders nothing when the layer's flag is off. */}
          <HeroPreload layer="beaches" image={pageBeach.images?.[0]} />
          <Suspense fallback={null}>
            <BeachPage
              beach={pageBeach}
              {...favProps('beach', pageBeach.id, pageBeach.cc)}
              onAddToDay={onAddToDay ? (f) => onAddToDay('beach', f) : null}
              onOpenNeighbour={openNeighbour}
              countryName={countryName(pageBeach.cc)}
              model={beachIndex?.model || null}
              onClose={() => setPageBeach(null)}
              onSelectDest={(id) => { setPageBeach(null); onSelectDest(id); }}
            />
          </Suspense>
        </>
      )}

      {pageLake && (
        <>
          {/* Starts the hero's download while the page chunk is still in
              flight (T052); renders nothing when the layer's flag is off. */}
          <HeroPreload layer="lakes" image={pageLake.images?.[0]} />
          <Suspense fallback={null}>
            <LakePage
              lake={pageLake}
              {...favProps('lake', pageLake.id, pageLake.cc)}
              onAddToDay={onAddToDay ? (f) => onAddToDay('lake', f) : null}
              onOpenNeighbour={openNeighbour}
              countryName={countryName(pageLake.cc)}
              warmC={lakeIndex?.model?.warm_c ?? 18}
              onClose={() => setPageLake(null)}
              onSelectDest={(id) => { setPageLake(null); onSelectDest(id); }}
            />
          </Suspense>
        </>
      )}

      {pageCycle && pageCycle.familyRef && (
        <Suspense fallback={null}>
          <CycleFamilyPage
            familyRef={pageCycle.familyRef}
            onClose={() => setPageCycle(null)}
            onOpenRoute={(sec) => setPageCycle({ routeId: sec.id, country: sec.cc })}
          />
        </Suspense>
      )}

      {pageCycle && !pageCycle.familyRef && (
        <Suspense fallback={null}>
          <CyclePage
            routeId={pageCycle.routeId}
            {...favProps('cycle', pageCycle.routeId ?? pageCycle.tourSlug, pageCycle.country)}
            onOpenNeighbour={openNeighbour}
            tourSlug={pageCycle.tourSlug}
            country={pageCycle.country}
            countryName={countryName(pageCycle.country)}
            onClose={() => setPageCycle(null)}
          />
        </Suspense>
      )}

      {pageMountain && (
        <>
          {/* Starts the hero's download while the page chunk is still in
              flight (T052); renders nothing when the layer's flag is off. */}
          <HeroPreload layer="mountains" image={pageMountain.images?.[0]} />
          <Suspense fallback={null}>
            <MountainPage
              mountain={pageMountain}
              {...favProps('mountain', pageMountain.id, pageMountain.cc)}
              onAddToDay={onAddToDay ? (f) => onAddToDay('mountain', f) : null}
              onOpenNeighbour={openNeighbour}
              countryName={countryName(pageMountain.cc)}
              onClose={() => setPageMountain(null)}
              onSelectDest={(id) => { setPageMountain(null); onSelectDest(id); }}
            />
          </Suspense>
        </>
      )}

      {/* The one Filters door, holding the country and the same facet groups
          the toolbar shows, so the sheet is the complete set rather than the
          leftovers. */}
      {sheetOpen && (
        <PlacesFilterSheet
          onClose={() => setSheetOpen(false)}
          anchorRef={sheetFrom === 'side' ? null : filterBtnRef}
          groups={facetGroups}
          country={country}
          setCountry={(cc) => { setCountry(cc); setNearPlace(null); }}
          countryOptions={[]}
          activeFilters={activeFilters}
          resetAll={resetAll}
          resultCount={rowCount}
        />
      )}
      </div>
    </div>
  );
}
