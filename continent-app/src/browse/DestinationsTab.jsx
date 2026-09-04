import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { count, eur } from '../lib/format.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { PlacesFilterSheet } from './PlacesFilterSheet.jsx';
import { trailPath } from '../lib/trailShape.js';
import { srcSetFor } from '../lib/heroImage.js';
import { loadTrails, loadListedTrails, loadTrailsIndex } from '../lib/trails.js';
import {
  loadBeachIndex, loadBeaches, loadListedBeaches, loadTopBeaches,
} from '../lib/beaches.js';
import {
  beachTags, beachRating,
  BEACH_FACETS, applyBeachFacets, beachFacetCounts,
} from '../lib/beachStory.js';
import {
  loadLakeIndex, loadLakes, loadListedLakes, loadTopLakes,
} from '../lib/lakes.js';
import {
  lakeTags, lakeRating, lakeSwim, isHiddenGem,
  LAKE_FACETS, applyLakeFacets, lakeFacetCounts,
} from '../lib/lakeStory.js';
import {
  loadMountainIndex, loadMountains, loadListedMountains, loadTopMountains,
} from '../lib/mountains.js';
import {
  loadTripIndex, loadTrips, loadTopTrips, rankTrips,
} from '../lib/trips.js';
import { loadCyclingIndex, loadCycling } from '../lib/cycling.js';
import { countryPhrase, paceLine } from '../lib/cycleStory.js';
import {
  CYCLE_FACETS, applyCycleFacets, cycleFacetCounts, cycleRating, isListedRide,
  netLabelKey, bikeLabelKey, rideCentre,
} from '../lib/cycleCards.js';
import {
  tripHeadline, shapeLabel, transportLabel, seasonLabel, tripTags, cardThumb,
} from '../lib/tripStory.js';
import {
  mountainTags, mountainRating, isLiftServed, liftLabel,
  MOUNTAIN_FACETS, applyMountainFacets, mountainFacetCounts, floorNote,
  difficultyLabel, viewBandLabel,
  isHiddenGem as isMountainGem,
} from '../lib/mountainStory.js';
import {
  associateTrip, haversineKm, tripCentre, tripKindKey, tripThemes,
  DISTANCE_BANDS, tripBand, trailRating,
  ASCENT_BANDS, tripClimbBand, GRADES, tripGrade, gradeIsDerived,
  ROUTE_TYPES, tripRouteType, HIGHLIGHTS, tripHighlights,
  SUITABILITY, tripSuitability, suitabilityIsDerived, isListed,
} from '../lib/trailCards.js';
import { useI18n } from '../i18n/index.jsx';
import { geocodeAddress, reverseGeocode } from '../lib/geocode.js';
import { bandChip, bandBreak, scopeForRows } from '../lib/regions.js';
import {
  SearchIcon, ChevronRightIcon, RouteIcon, SuitcaseIcon, BootIcon,
  BeachIcon, MountainIcon, MapPinIcon, CrosshairIcon,
  LoopIcon, LakeIcon, FilterIcon,
  BikeIcon, ArrowLeftIcon, ClockIcon,
} from '../components/Icons.jsx';
import { LifestyleButton } from './LifestyleButton.jsx';
import { JourneysSection } from './JourneysSection.jsx';

/**
 * The Destinations tab: the whole catalogue and every published trip as a
 * browsable section of its own, reachable from the bottom bar (mobile) and
 * the header tabs (desktop).
 *
 * Six categories share one search, one country filter and one sort row
 * (the priced catalogue itself lives on Explore, so there is no General
 * category here any more):
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

// Lazy: the page imports maplibre-gl, which stays out of the main bundle.
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

const hoursText = (min) => {
  const h = min / 60;
  return h >= 10 ? String(Math.round(h)) : h.toFixed(1);
};

/**
 * How a geocoded hit reads on two lines: the place itself, then the rest of
 * the address that says which one it is.
 *
 * Nominatim names a town in `name` and leaves it empty for a street address,
 * where the label instead opens with a bare house number ("12, Kerkstraat,
 * Knesselare, Aalter, ..."). A title of "12" is no use to anyone, so a numeric
 * first part pulls the street and the town in with it.
 */
function geoLines(r) {
  const parts = String(r.label || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Bilingual country tails ("Belgie / Belgique / Belgien") are noise on a row
  // this narrow; the parsed country name says the same thing once.
  if (parts.length && r.country) parts[parts.length - 1] = r.country;
  const first = parts[0] || '';
  // The house rule runs first: for a street address the geocoder backfills the
  // empty name with that same bare number, so testing the name would hide it.
  if (/^\d/.test(first) && parts.length > 2) {
    return { title: parts.slice(0, 3).join(', '), rest: parts.slice(3).join(', ') };
  }
  const named = (r.name || '').trim();
  if (named && first.toLowerCase() === named.toLowerCase()) {
    return { title: named, rest: parts.slice(1).join(', ') };
  }
  return {
    title: parts.slice(0, 2).join(', ') || named || r.shortLabel || '',
    rest: parts.slice(2).join(', '),
  };
}

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

/**
 * How many days, as a slider with an axis that is actually a scale.
 *
 * The old one laid its four ticks out with space-between, which put "7" a
 * third of the way along a track where 7 of 14 days is the halfway point: the
 * label sat two days to the right of the value it named. Here every tick is
 * placed at its own value, in the same coordinates the thumb travels in, so
 * the number under the thumb is the number the thumb is on.
 *
 * The unit rides on the label rather than on every tick, because a scale that
 * repeats "days" four times is a scale nobody reads.
 */
function TripLengthSlider({ days, setDays, n, t }) {
  const value = days === null ? 0 : days;
  const valueWord = days === null
    ? t('trip.anyLength')
    : t(days === 1 ? 'trip.oneDay' : 'trip.nDays', { n: days });
  // The thumb's centre travels between half a thumb in from each end, which
  // is what the ticks have to follow to line up with it. 18px is the thumb.
  const at = (v) => `calc(${(v / TRIP_MAX_DAYS) * 100}% + ${9 - (v / TRIP_MAX_DAYS) * 18}px)`;
  // Three stops, not four: at 360px the 1 sits 25px from the "Any" that owns
  // the left end and the two labels touched. The readout above says exactly
  // where the thumb is, so the axis only has to say where the ends are.
  const ticks = [0, 7, TRIP_MAX_DAYS];
  // The head says what the slider is set to and nothing else. It used to
  // carry the size of the result set beside it ("283 trips"), which read as
  // a claim about the catalogue rather than a caption on a control, and the
  // list underneath already shows what survived the filter. The number stays
  // on the element as data-n: the component is the only thing that knows the
  // whole total (the list renders a page at a time), and the trips harness
  // reads it from here rather than counting cards against themselves.
  return (
    <label className="trip-slider" data-n={n}>
      <span className="trip-slider-head">
        <span className="trip-slider-label">
          {t('trip.lengthLabel')}
          <b>{valueWord}</b>
        </span>
      </span>
      <input
        type="range"
        className="trip-slider-input"
        min="0"
        max={TRIP_MAX_DAYS}
        step="1"
        value={value}
        aria-label={t('trip.askDays')}
        aria-valuetext={valueWord}
        onChange={(e) => {
          const v = Number(e.target.value);
          setDays(v === 0 ? null : v);
        }}
      />
      {/* 0 is "any length", so the scale starts at the word rather than at a
          number nobody asked for. */}
      <span className="trip-slider-ticks" aria-hidden="true">
        {ticks.map((v) => (
          <span
            key={v}
            className={`trip-slider-tick ${v === value ? 'on' : ''}`}
            style={{ left: at(v) }}
          >
            {v === 0 ? t('trip.anyShort') : v}
            {/* The unit rides on the last tick, said once. A floating label
                at the right edge sat on top of the 14 it was explaining. */}
            {v === TRIP_MAX_DAYS && ` ${t('trip.lengthUnit')}`}
          </span>
        ))}
      </span>
    </label>
  );
}

/**
 * The shape a country card crops to, and the three numbers that decide when a
 * better-shaped photograph is worth a lower-rated place.
 *
 * fitsBox() is the fraction of a photograph that survives object-fit: cover in
 * a given box: 1 when the two shapes agree, 0.38 for a 3:2 photograph in a 4:1
 * strip. COVER_FIT_OK is the point above which a cover is left alone whatever
 * else is available. COVER_FIT_GAIN is how much better a challenger has to be
 * before it is worth swapping (below it the swap costs rating and buys
 * nothing anyone would notice), and COVER_RATING_GIVE is how much rating the
 * swap may cost. That last one is deliberately mean: at 0.8 the rule handed
 * Italy to Mount Etna and Portugal to Sintra, which are better photographs of
 * places nobody thinks of first when they think of the country. A cover is an
 * identity before it is a picture.
 */
const COUNTRY_CARD_BOX = 2.6;
const COVER_FIT_OK = 0.62;
const COVER_FIT_GAIN = 0.12;
const COVER_RATING_GIVE = 0.35;
/* A cover under this keeps less than half its frame, which is not a crop any
   more, it is a fragment: Albania opened on a church with the top of its own
   tower cut off. At that point the rule stops defending the rating and starts
   defending the picture, so it may reach three times as far down the list. */
const COVER_FIT_BAD = 0.55;
const COVER_RATING_GIVE_BAD = 1.2;
const fitsBox = (ratio, box) => (ratio > box ? box / ratio : ratio / box);

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
const hasTag = (m, k) => (m.tags || []).includes(k);

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

/** Rows that satisfy every selected chip. */
function applyChips(rows, chips, on) {
  if (!on.length) return rows;
  const tests = on.map((k) => chips.find((c) => c.key === k)?.test).filter(Boolean);
  return rows.filter((row) => tests.every((fn) => fn(row)));
}

/**
 * How many rows each chip would leave, counted inside the pool the OTHER
 * selected chips already narrowed. That is what lets a chip carry its own
 * number and grey itself out instead of leading to an empty list, and what
 * keeps the number on a selected chip still while it is tapped.
 */
function chipCounts(pool, chips, on) {
  const out = new Map();
  if (!pool) return out;
  for (const c of chips) {
    const others = on.filter((k) => k !== c.key);
    const base = others.length ? applyChips(pool, chips, others) : pool;
    out.set(c.key, base.filter(c.test).length);
  }
  return out;
}

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
function TrailPicture({ tr, assoc }) {
  const shape = useMemo(
    () => (assoc.photoUrl ? null : trailPath(tr.geometry)),
    [assoc.photoUrl, tr.geometry],
  );
  if (assoc.photoUrl) {
    return (
      <>
        <img className="places-card-img" src={assoc.photoUrl} alt="" loading="lazy" />
        {assoc.photoOf && <span className="places-card-photoof">{assoc.photoOf}</span>}
      </>
    );
  }
  if (shape) {
    return (
      <span className="places-card-img places-card-shape" aria-hidden="true">
        <svg viewBox={shape.viewBox} preserveAspectRatio="xMidYMid meet">
          <path d={shape.d} />
        </svg>
      </span>
    );
  }
  return (
    <span className="places-card-img places-card-noimg" aria-hidden="true">
      <RouteIcon size={26} />
    </span>
  );
}

// The five published grades as label keys. The card prints the grade rather
// than validate.py's three-value effort class when there is one, because the
// grade is what the filter chip says and a card that disagrees with the chip
// that found it is the bug this replaces.
const GRADE_KEY = {
  easy: 'trails.gradeEasy', moderate: 'trails.gradeModerate',
  hard: 'trails.gradeHard', very_hard: 'trails.gradeVeryHard',
  alpine: 'trails.gradeAlpine',
};

// Highlight code to label key. Built from HIGHLIGHTS rather than written out
// again, so a code added to the model cannot go missing on the card.
const HIGHLIGHT_KEY = Object.fromEntries(
  HIGHLIGHTS.map(({ key, labelKey }) => [key, labelKey]));

function TripCard({ card, km, onOpen, t }) {
  const { tr, assoc, kindKey, price } = card;
  const isCityDay = tr.category === 'citytrip';
  const grade = tripGrade(tr);
  const diffKey = grade ? GRADE_KEY[grade]
    : tr.difficulty === 'easy' ? 'places.diffEasy'
      : tr.difficulty === 'moderate' ? 'places.diffModerate'
        : tr.difficulty === 'hard' ? 'places.diffHard' : null;
  // Up to two of the things on the line. The single most persuasive thing on
  // a trail card: "waterfall, castle" is a reason to go on Saturday and
  // "12.4 km, moderate" is a specification.
  const highlights = isCityDay ? [] : tripHighlights(tr).slice(0, 2);
  const listed = isListed(tr);
  const rating = isCityDay ? assoc.dest?.rating : trailRating(tr);
  // The photograph carries the picture and nothing else but the score and
  // the distance band. Every fact and every chip sits in a body strip under
  // it, where it is readable and where the same slot holds the same thing on
  // every card: the old overlay stacked kind, loop, highlights, grade and
  // rating over the photograph, and a card with two highlights and a card
  // with none put the grade in different places.
  return (
    <button className="places-tcard" onClick={() => onOpen(card)}>
      <span className="tcard-media">
        <TrailPicture tr={tr} assoc={assoc} />
        {km != null && (
          <span className="places-card-km">{bandChip(km, t)}</span>
        )}
        {/* The walk's own rating, not the nearest town's. Scored within its
            country from open signals only (pipeline/trails/rate.py). A
            listed row is verified to exist and deliberately not scored, and
            says so in the same slot rather than showing a number it never
            earned. */}
        {rating && (
          <span className="tcard-score">
            <RatingBadge rating={rating} size="xs" showGem={false} />
          </span>
        )}
        {listed && (
          <span className="tcard-score places-card-unrated">{t('trails.notScored')}</span>
        )}
      </span>
      <span className="tcard-body">
        <span className="tcard-name places-card-name">{tr.name}</span>
        <span className="tcard-facts places-card-facts">
          {tr.distance_m != null && (
            <span>{(tr.distance_m / 1000).toFixed(1).replace(/\.0$/, '')} km</span>
          )}
          {tr.duration_min != null && <span>{hoursText(tr.duration_min)} h</span>}
          {isCityDay && tr.n_stops != null && <span>{t('trails.stops', { n: tr.n_stops })}</span>}
          {!isCityDay && tr.ascent_m != null && <span>+{Math.round(tr.ascent_m)} m</span>}
          {isCityDay && price && (
            <span className="tcard-price">
              {eur(price.pp)}
              <small>/pp</small>
            </span>
          )}
        </span>
        <span className="tcard-meta places-card-kinds">
          <span className={`tcard-chip is-kind ${isCityDay ? 'city' : ''}`}>{t(kindKey)}</span>
          {/* Loop is the shape people filter for, so it is said on the card
              and not only behind the chip that found it. */}
          {!isCityDay && tr.is_loop && (
            <span className="tcard-chip places-card-loop">
              <LoopIcon size={11} />
              {t('trails.loop')}
            </span>
          )}
          {!isCityDay && diffKey && (
            <span
              className={`tcard-chip places-card-diff${gradeIsDerived(tr) ? ' est' : ''}`}
              title={gradeIsDerived(tr) ? t('trails.gradeDerived') : undefined}
            >
              {t(diffKey)}
              {gradeIsDerived(tr) ? <i aria-hidden="true">~</i> : null}
            </span>
          )}
          {highlights.map((code) => (
            <span key={code} className="tcard-chip is-hl places-card-hl">
              {t(HIGHLIGHT_KEY[code] || 'trails.hlSummit')}
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}

/**
 * The picture on a ride's card: its own photograph where the photo pass found
 * one (every rated row, a fifth of the listed rows in Britain), otherwise the
 * route drawn as itself from the geometry the card already carries. The
 * drawing is the honest picture: a grey hole would say "broken" and a
 * borrowed town would say something untrue about the road.
 */
function RidePicture({ row }) {
  const shape = useMemo(
    () => (row.img ? null : trailPath(row.geometry)),
    [row.img, row.geometry],
  );
  if (row.img) {
    return <img className="places-card-img" src={row.img} alt="" loading="lazy" />;
  }
  if (shape) {
    return (
      <span className="places-card-img places-card-shape" aria-hidden="true">
        <svg viewBox={shape.viewBox} preserveAspectRatio="xMidYMid meet">
          <path d={shape.d} />
        </svg>
      </span>
    );
  }
  return (
    <span className="places-card-img places-card-noimg" aria-hidden="true">
      <BikeIcon size={26} />
    </span>
  );
}

/**
 * One signed cycle route as a card, in the trail card's grammar: the picture
 * on top with the score in the corner, the measured facts in mono under the
 * name, and the chips that say what kind of riding it is. Rated and listed
 * rows are the same card; a listed row wears "Not scored yet" in the score's
 * slot rather than a number it never earned, and everything else about it
 * (length, climb, network, bike) is measured the same way.
 */
function CycleCard({ row, km, onOpen, t }) {
  const rating = cycleRating(row);
  const listed = isListedRide(row);
  const netKey = netLabelKey(row.net);
  const bikeKey = bikeLabelKey(row.bike);
  return (
    <button
      className="places-tcard"
      data-testid={listed ? 'cycle-listed-card' : 'cycle-card'}
      onClick={() => onOpen(row)}
    >
      <span className="tcard-media">
        <RidePicture row={row} />
        {km != null && (
          <span className="places-card-km">{bandChip(km, t)}</span>
        )}
        {rating && (
          <span className="tcard-score" data-testid="cycle-card-score">
            <RatingBadge rating={rating} size="xs" showGem={false} />
          </span>
        )}
        {listed && (
          <span className="tcard-score places-card-unrated">{t('trails.notScored')}</span>
        )}
      </span>
      <span className="tcard-body">
        <span className="tcard-name places-card-name">{row.name}</span>
        <span className="tcard-facts places-card-facts">
          {row.km != null && <span>{row.km} km</span>}
          {row.asc != null && <span>+{Math.round(row.asc)} m</span>}
          {row.ref && <span className="tcard-ref">{row.ref}</span>}
        </span>
        <span className="tcard-meta places-card-kinds">
          <span className="tcard-chip is-kind">{t(netKey || 'cycle.kindRoute')}</span>
          {row.loop && (
            <span className="tcard-chip places-card-loop">
              <LoopIcon size={11} />
              {t('trails.loop')}
            </span>
          )}
          {bikeKey && <span className="tcard-chip is-hl">{t(bikeKey)}</span>}
        </span>
      </span>
    </button>
  );
}

/**
 * One composed multi-day tour as a card. The same card as a route with the
 * day count where the score would be: a tour is not ranked against the
 * routes it is built over, it is the answer to a different question ("plan
 * me a week"), and its own page carries the day-by-day.
 */
function TourCard({ tour, onOpen, t }) {
  const shape = useMemo(() => trailPath(tour.geometry), [tour.geometry]);
  const towns = (tour.towns || []).filter(Boolean);
  return (
    <button
      className="places-tcard"
      data-testid="cycle-tourcard"
      onClick={() => onOpen(tour)}
    >
      <span className="tcard-media">
        {shape ? (
          <span className="places-card-img places-card-shape" aria-hidden="true">
            <svg viewBox={shape.viewBox} preserveAspectRatio="xMidYMid meet">
              <path d={shape.d} />
            </svg>
          </span>
        ) : (
          <span className="places-card-img places-card-noimg" aria-hidden="true">
            <BikeIcon size={26} />
          </span>
        )}
        <span className="tcard-score tcard-days">
          <ClockIcon size={11} />
          {t('cycle.days', { n: tour.days })}
        </span>
      </span>
      <span className="tcard-body">
        <span className="tcard-name places-card-name">{tour.title}</span>
        <span className="tcard-facts places-card-facts">
          <span>{Math.round(tour.km)} km</span>
          {tour.asc != null && <span>+{Math.round(tour.asc)} m</span>}
          {tour.days > 0 && <span>{t('cycle.perDay', { km: Math.round(tour.km / tour.days) })}</span>}
        </span>
        <span className="tcard-meta places-card-kinds">
          <span className="tcard-chip is-kind">{t('cycle.kindTour')}</span>
          {paceLine(tour.pace, t) && (
            <span className="tcard-chip">{paceLine(tour.pace, t).split(',')[0]}</span>
          )}
          {bikeLabelKey(tour.bike) && (
            <span className="tcard-chip is-hl">{t(bikeLabelKey(tour.bike))}</span>
          )}
        </span>
        {towns.length > 0 && (
          <span className="tcard-towns">{towns.join(' · ')}</span>
        )}
      </span>
    </button>
  );
}

/**
 * One published beach as a photo card.
 *
 * Different from every other card on this tab, because a beach is chosen for
 * different reasons: no price, no size glyph, no from-line. What it carries
 * instead is where it is (the pin, which is the question a beach photograph
 * always raises), the beauty score, and up to three of the reasons the index
 * scored it that way, so the list can be read as an argument rather than as a
 * gallery.
 */
function BeachCard({ beach, km, countryName, onOpen, t }) {
  const shot = beach.images?.[0];
  const tags = beachTags(beach, t, km == null ? 3 : 2);
  const place = [beach.region, countryName].filter(Boolean).join(', ');
  return (
    <button className="places-bcard" onClick={() => onOpen(beach)}>
      {shot
        ? <img className="places-card-img" src={shot.u} alt="" loading="lazy" />
        : <span className="places-card-img places-card-noimg" aria-hidden="true" />}
      <span className="places-card-scrim" aria-hidden="true" />
      {km != null && (
        <span className="places-card-km">{bandChip(km, t)}</span>
      )}
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">{beach.name}</span>
          <span className="places-bcard-where">
            <MapPinIcon size={12} />
            {place}
          </span>
          {tags.length > 0 && (
            <span className="places-bcard-tags">
              {tags.map((tag) => <span key={tag.code}>{tag.label}</span>)}
            </span>
          )}
        </span>
        <span className="places-card-right">
          <RatingBadge rating={beachRating(beach, t)} size="xs" showGem={false} />
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

/**
 * One published lake as a photo card.
 *
 * The beach card's shape, with one addition that is not decoration: the
 * swimming verdict rides in the corner, coloured, on every card. A list that
 * promises beautiful water has to say which of it you may get into, and
 * finding out on arrival that Plitvice or Morskie Oko forbids swimming is the
 * failure mode this whole layer was built to avoid. "yes" is the common case
 * and stays quiet; anything else earns the chip.
 */
function LakeCard({ lake, km, countryName, onOpen, t }) {
  const shot = lake.images?.[0];
  const tags = lakeTags(lake, t, km == null ? 3 : 2);
  const place = [lake.region, countryName].filter(Boolean).join(', ');
  const swim = lakeSwim(lake, t);
  return (
    <button className="places-bcard places-lcard" onClick={() => onOpen(lake)}>
      {shot
        ? <img className="places-card-img" src={shot.u} alt="" loading="lazy" />
        : <span className="places-card-img places-card-noimg" aria-hidden="true" />}
      <span className="places-card-scrim" aria-hidden="true" />
      {km != null && (
        <span className="places-card-km">{bandChip(km, t)}</span>
      )}
      {swim.rule !== 'yes' && (
        <span className={`places-lcard-swim swim-${swim.tone}`}>{swim.label}</span>
      )}
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">{lake.name}</span>
          <span className="places-bcard-where">
            <MapPinIcon size={12} />
            {place}
          </span>
          {tags.length > 0 && (
            <span className="places-bcard-tags">
              {tags.map((tag) => <span key={tag.code}>{tag.label}</span>)}
              {isHiddenGem(lake) && <span className="tag-gem">{t('lake.hiddenGem')}</span>}
            </span>
          )}
        </span>
        <span className="places-card-right">
          <RatingBadge rating={lakeRating(lake, t)} size="xs" showGem={false} />
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

/**
 * One published mountain as a photo card.
 *
 * The beach card's shape with two additions, and neither is decoration. The
 * height rides under the name in mono, because it is the first thing anybody
 * asks about a mountain and it is a measured fact. And a mountain you can
 * ride to the top of says so in the corner, in the same place the lake card
 * puts its swimming verdict, because "can I get up it without walking" is the
 * question that decides whether this is a morning out or an expedition.
 */
function MountainCard({ mountain, km, countryName, onOpen, t, lang }) {
  const shot = mountain.images?.[0];
  const tags = mountainTags(mountain, t, km == null ? 3 : 2);
  const place = [mountain.range, countryName].filter(Boolean).join(', ');
  const ride = isLiftServed(mountain);
  // The two v2 facets a card can carry without crowding: how hard the
  // easiest way up is, and how big the view is. Both are filterable, and a
  // filter whose answer is invisible once you stop filtering is a filter
  // people stop trusting.
  const hard = difficultyLabel(mountain, t);
  const view = viewBandLabel(mountain, t);
  return (
    <button className="places-bcard places-mcard" onClick={() => onOpen(mountain)}>
      {shot
        ? <img className="places-card-img" src={shot.u} alt="" loading="lazy" />
        : <span className="places-card-img places-card-noimg" aria-hidden="true" />}
      <span className="places-card-scrim" aria-hidden="true" />
      {km != null && (
        <span className="places-card-km">{bandChip(km, t)}</span>
      )}
      {ride && (
        <span className="places-lcard-swim places-mcard-way">{liftLabel(mountain, t)}</span>
      )}
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">{mountain.name}</span>
          <span className="places-bcard-where">
            <MapPinIcon size={12} />
            {place}
            {mountain.ele != null && (
              <span className="places-mcard-ele">
                {Math.round(mountain.ele).toLocaleString(lang)} m
              </span>
            )}
          </span>
          {(tags.length > 0 || hard || view) && (
            <span className="places-bcard-tags">
              {hard && <span className="places-mcard-diff">{hard}</span>}
              {view && <span>{view}</span>}
              {tags.map((tag) => <span key={tag.code}>{tag.label}</span>)}
              {isMountainGem(mountain) && <span className="tag-gem">{t('mtn.hiddenGem')}</span>}
            </span>
          )}
        </span>
        <span className="places-card-right">
          <RatingBadge rating={mountainRating(mountain, t)} size="xs" showGem={false} />
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

/** One country as a photo card: its best-rated place as the cover, the flag
 *  small beside the name. Real photography, never a stretched flag. */
function CountryCard({ cc, name, sub = null, img, onPick, onAskCover = null }) {
  useEffect(() => {
    if (!img && onAskCover) onAskCover(cc);
  }, [img, onAskCover, cc]);
  return (
    <button className="places-ccard" onClick={() => onPick(cc)}>
      {/* A 2.6:1 strip, ~360 css px wide and ~138 tall, so a retina screen
          wants 720 across. The ladder runs to 960 and the browser picks. */}
      <HeroImage
        url={img}
        city={name}
        iso2={cc}
        className="places-card-img"
        maxWidth={960}
        sizes="(max-width: 639px) 96vw, (max-width: 1180px) 48vw, 560px"
        ratio={[26, 10]}
      />
      <span className="places-card-scrim" aria-hidden="true" />
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">
            <CountryFlag country={cc} size={13} className="places-card-flag" />
            {name}
          </span>
          {/* No count line: "21 places" answered a question nobody browsing
              a wall of countries was asking, and the cleaner card reads
              better. The name and the photograph are the whole message. */}
          {sub && <span className="places-card-sub"><span>{sub}</span></span>}
        </span>
        <span className="places-card-right">
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

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
    <button className="places-icard" onClick={() => onOpen(tr)}>
      <span className="itin-card-media">
        {/* cardThumb alone pins this to the 500px rendering, which was right
            for a 132px strip and is soft in a 3:2 frame. The srcset lets a
            retina card take the 960 and leaves everything else on the 500. */}
        {tr.img
          ? (
            <img
              className="places-card-img"
              src={cardThumb(tr.img.url)}
              srcSet={srcSetFor(tr.img.url, 960)}
              sizes="(max-width: 639px) 96vw, (max-width: 1180px) 48vw, 560px"
              alt=""
              loading="lazy"
            />
          )
          : (
            <span className="places-card-img places-card-noimg" aria-hidden="true">
              <RouteIcon size={26} />
            </span>
          )}
        <span className="places-card-scrim" aria-hidden="true" />
        <span className="itin-card-badges">
          <span className="itin-card-days">
            <b>{tr.days}</b> {t(tr.days === 1 ? 'trip.dayWord' : 'trip.daysWord')}
          </span>
          {tr.nearFit && <span className="itin-card-near">{t('trip.nearFit')}</span>}
          {km != null && (
            <span className="itin-card-near">{bandChip(km, t)}</span>
          )}
        </span>
        <span className="itin-card-head">
          <span className="itin-card-name">{tripHeadline(tr, t)}</span>
          <span className="itin-card-score">{tr.score.toFixed(1)}</span>
        </span>
      </span>

      <span className="itin-card-body">
        <span className="itin-card-route">
          {tr.cities.map((c, i) => (
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
          <span className="itin-card-cost">{t('trip.perDay', { eur: eur(tr.cost.per_day_eur) })}</span>
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

export function DestinationsTab({
  data, pricedAll, availableCountries = [], onSelectDest,
  stayTier = 'home', lifestyle, onOpenLifestyle,
  openTrail = null, onOpenTrailConsumed,
  openBeach = null, onOpenBeachConsumed,
  openLake = null, onOpenLakeConsumed,
  openMountain = null, onOpenMountainConsumed,
  openTrip = null, onOpenTripConsumed, onOpenTripInPlanner,
}) {
  const { t, lang } = useI18n();
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  const [cat, setCat] = useState('trips');           // CATS key
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [country, setCountry] = useState('');        // ISO2 or '' for all
  // The point everything is measured from in near-mode. A catalogue city or
  // any geocoded location, so it carries a name and coordinates rather than a
  // destination id: { id|null, name, sub, iso2|null, lat, lon }.
  const [nearPlace, setNearPlace] = useState(null);
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
  const [countryCycling, setCountryCycling] = useState({});   // cc -> bundle
  const [cyclingLoading, setCyclingLoading] = useState(false);
  const [pageCycle, setPageCycle] = useState(null);
  // The ride chips, selected keys into CYCLE_FACETS, the same shape the
  // beach, lake and mountain layers keep.
  const [cycFacets, setCycFacets] = useState({});
  // Country cards on the cycling index: the cover is the country's best-rated
  // ride's own photograph, fetched per country the first time its card is
  // drawn, because a wall of catalogue town heroes over a cycling index says
  // nothing about the riding.
  const [cycleCovers, setCycleCovers] = useState({});
  const cycleCoverAsked = useRef(new Set());

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

  useEffect(() => {
    let live = true;
    loadTrailsIndex().then((idx) => { if (live) setTrailsIndex(idx); });
    return () => { live = false; };
  }, []);

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
      });
    return () => { live = false; };
  }, [isTripCat, trailsCountry]);

  // ISO2 -> display name, from the catalogue first (it matches the rows on
  // screen), the browser's region names for any code the catalogue lacks.
  const countryName = useMemo(() => {
    const map = new Map(availableCountries);
    let dn = null;
    try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { /* older engines */ }
    return (cc) => map.get(cc) || (dn ? dn.of(cc) : cc) || cc;
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

  const priceById = useMemo(() => {
    const m = new Map();
    for (const p of pricedAll) m.set(p.id, p);
    return m;
  }, [pricedAll]);

  /**
   * Country card covers.
   *
   * A country card is a strip, and a strip crops. Measured over the 3,021
   * heroes whose shape the wire now carries (pipeline/apply_image_dims.py),
   * the average photograph keeps 37 per cent of its frame in this box and
   * only 136 of them are 2:1 or wider, which is why picking the cover by
   * rating alone put a doorway, a roof and a stone shed on the index: those
   * ARE the best-rated places, photographed close up.
   *
   * So the cover is chosen for the box as well as for the place. The rule is
   * deliberately conservative, because the cover is also an identity: the
   * best-rated place keeps the card unless a near-peer survives the crop
   * MATERIALLY better, and then the highest-rated of those peers wins rather
   * than the widest. Bulgaria swaps a monastery arcade for the Seven Rila
   * Lakes; Slovenia keeps Lake Bled, because nothing near it is enough of an
   * improvement to be worth not being Lake Bled.
   *
   * Read from the whole catalogue rather than from the priced list, which is
   * what left Iceland with a grey card: it has twenty one photographed places
   * and no fare from this origin, so it was absent from `pricedAll` and the
   * cover lookup came back empty.
   */
  const countryCover = useMemo(() => {
    const byCc = new Map();
    for (const p of Object.values(data.destinations || {})) {
      // The catalogue carries the hero as an object, the priced rows carry it
      // as a bare URL (useExploreCatalog flattens it), and HeroImage wants the
      // URL.
      const url = p.image?.url || (typeof p.image === 'string' ? p.image : null);
      if (!url) continue;
      const w = p.image?.w;
      const h = p.image?.h;
      const row = {
        img: url,
        score: p.rating?.score ?? 0,
        // How much of the frame the strip keeps. Unknown shapes are scored as
        // the commonest one, 3:2, so a missing measurement neither wins nor
        // loses the card on its own.
        fit: fitsBox(w && h ? w / h : 1.5, COUNTRY_CARD_BOX),
      };
      const list = byCc.get(p.iso2);
      if (list) list.push(row); else byCc.set(p.iso2, [row]);
    }
    const out = new Map();
    for (const [cc, rows] of byCc) {
      // Rating first, then the crop: two places rated the same are ranked by
      // which of them survives the strip, which is how Cyprus stopped opening
      // on snowy trees when a harbour with the same 6.9 was sitting behind it.
      rows.sort((a, b) => (b.score - a.score) || (b.fit - a.fit));
      const top = rows[0];
      let pick = top;
      if (top.fit < COVER_FIT_OK) {
        const give = top.fit < COVER_FIT_BAD ? COVER_RATING_GIVE_BAD : COVER_RATING_GIVE;
        const better = rows.filter((r) => r.score >= top.score - give
          && r.fit >= top.fit + COVER_FIT_GAIN);
        if (better.length) pick = better[0];   // already rating-sorted
      }
      out.set(cc, pick);
    }
    return out;
  }, [data]);

  // Turkey and Ukraine publish walks and have no catalogue destination at all,
  // so no photograph of them exists anywhere in `data`. Their cover comes from
  // the layer being indexed instead: one country file, fetched only for the
  // cards that would otherwise be grey, and at most a handful at a time.
  const [wireCovers, setWireCovers] = useState({});
  const coverAsked = useRef(new Set());
  const askCover = (cc) => {
    if (!cc || coverAsked.current.has(cc)) return;
    coverAsked.current.add(cc);
    loadTrails(cc).then((rows) => {
      const hit = (rows || []).find((r) => r.img?.u);
      if (hit) setWireCovers((cur) => ({ ...cur, [cc]: hit.img.u }));
    }).catch(() => { /* a country with no file simply keeps its placeholder */ });
  };

  const q = useMemo(() => norm(debouncedQuery), [debouncedQuery]);

  const suggestions = useMemo(() => {
    if (!q) return [];
    const starts = [], includes = [];
    for (const d of destIndex) {
      const c = norm(d.city);
      if (c.startsWith(q)) starts.push(d);
      else if (c.includes(q)) includes.push(d);
      if (starts.length >= 6) break;
    }
    return [...starts, ...includes].slice(0, 6);
  }, [q, destIndex]);

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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isTripCat, trailsIndex, cat, countryName]);


  // ── Trips: the composed itineraries (pipeline/trips) ──────────────────
  //
  // Two artifacts on purpose, the same split the beach, lake and mountain
  // layers use: /trips/top.json is the Europe-wide ranking, capped per country
  // so one country cannot fill the page, and /trips/{CC}.json is everything
  // touching that country. Ranking the continent in the browser would mean
  // fetching forty three files before drawing a card.
  const isItinCat = isComposedTrips && itinDays !== 1;

  useEffect(() => {
    if (!isItinCat || itinIndex !== undefined) return undefined;
    let live = true;
    Promise.all([loadTripIndex(), loadTopTrips()]).then(([ix, top]) => {
      if (!live) return;
      setItinIndex(ix);
      setItinTop(top || []);
    });
    return () => { live = false; };
  }, [isItinCat, itinIndex]);

  const itinCountry = nearPlace ? nearPlace.iso2 : country;

  useEffect(() => {
    if (!isItinCat || !itinCountry) { setItinCountryRows(null); return undefined; }
    let live = true;
    setItinCountryRows(null);
    loadTrips(itinCountry).then((rows) => { if (live) setItinCountryRows(rows || []); });
    return () => { live = false; };
  }, [isItinCat, itinCountry]);

  // A shared #itin= link: open it once its detail is reachable. The card is
  // only a hint here, because TripPage loads the full trip by id anyway.
  useEffect(() => {
    if (!openTrip) return;
    setCat('trips');
    setJourneyView('composed');
    setItinDays(null);
    setPageItin({ id: openTrip.id });
    onOpenTripConsumed?.();
  }, [openTrip]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!isBeachCat || topBeaches) return undefined;
    let live = true;
    setBeachesLoading(true);
    Promise.all([loadBeachIndex(), loadTopBeaches()]).then(([idx, top]) => {
      if (!live) return;
      setBeachIndex(idx);
      setTopBeaches(top || []);
      setBeachesLoading(false);
    });
    return () => { live = false; };
  }, [isBeachCat, topBeaches]);

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
    if (!isBeachCat || !wantBeachCountry || countryBeaches[wantBeachCountry]) return undefined;
    let live = true;
    Promise.all([
      loadBeaches(wantBeachCountry),
      loadListedBeaches(wantBeachCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryBeaches((cur) => ({ ...cur, [wantBeachCountry]: rows || [] }));
      setListedBeaches((cur) => ({ ...cur, [wantBeachCountry]: listed || [] }));
    });
    return () => { live = false; };
  }, [isBeachCat, wantBeachCountry, countryBeaches]);

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
    });
    onOpenBeachConsumed?.();
  }, [openBeach, onOpenBeachConsumed]);

  // ── Lakes: the published lake layer ──────────────────────────────────
  //
  // The same three-artifact shape as beaches above, and the same trap avoided
  // the same way: `topLakes` is what says the work is done, never the loading
  // flag, because putting the flag in the dependency list makes the effect
  // re-run on its own state change and throw away its own reply.
  useEffect(() => {
    if (!isLakeCat || topLakes) return undefined;
    let live = true;
    setLakesLoading(true);
    Promise.all([loadLakeIndex(), loadTopLakes()]).then(([idx, top]) => {
      if (!live) return;
      setLakeIndex(idx);
      setTopLakes(top || []);
      setLakesLoading(false);
    });
    return () => { live = false; };
  }, [isLakeCat, topLakes]);

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
    if (!isLakeCat || !wantLakeCountry || countryLakes[wantLakeCountry]) return undefined;
    let live = true;
    Promise.all([
      loadLakes(wantLakeCountry),
      loadListedLakes(wantLakeCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryLakes((cur) => ({ ...cur, [wantLakeCountry]: rows || [] }));
      setListedLakes((cur) => ({ ...cur, [wantLakeCountry]: listed || [] }));
    });
    return () => { live = false; };
  }, [isLakeCat, wantLakeCountry, countryLakes]);

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
    });
    onOpenLakeConsumed?.();
  }, [openLake, onOpenLakeConsumed]);

  // ── Mountains: the published mountain layer ──────────────────────────
  //
  // Third layer, third time this shape, and the same trap avoided the same
  // way: `topMountains` is what says the work is done, never the loading flag.
  useEffect(() => {
    if (!isMountainCat || topMountains) return undefined;
    let live = true;
    setMountainsLoading(true);
    Promise.all([loadMountainIndex(), loadTopMountains()]).then(([idx, top]) => {
      if (!live) return;
      setMountainIndex(idx);
      setTopMountains(top || []);
      setMountainsLoading(false);
    });
    return () => { live = false; };
  }, [isMountainCat, topMountains]);

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
      || countryMountains[wantMountainCountry]) return undefined;
    let live = true;
    Promise.all([
      loadMountains(wantMountainCountry),
      loadListedMountains(wantMountainCountry),
    ]).then(([rows, listed]) => {
      if (!live) return;
      setCountryMountains((cur) => ({ ...cur, [wantMountainCountry]: rows || [] }));
      setListedMountains((cur) => ({ ...cur, [wantMountainCountry]: listed || [] }));
    });
    return () => { live = false; };
  }, [isMountainCat, wantMountainCountry, countryMountains]);

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

  // No fallback to the first country in the index: the tab used to open on
  // Andorra's one route because Andorra sorts first. With nothing chosen it
  // opens on the country index, the way Trails does.
  const wantCycleCountry = (country && cycleCountries.has(country) ? country : null)
    || queryCycleCountry
    || (nearPlace && cycleCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isCycleCat || cycleIndex) return undefined;
    let live = true;
    loadCyclingIndex().then((idx) => { if (live) setCycleIndex(idx); });
    return () => { live = false; };
  }, [isCycleCat, cycleIndex]);

  useEffect(() => {
    if (!isCycleCat || !wantCycleCountry || countryCycling[wantCycleCountry]) {
      return undefined;
    }
    let live = true;
    setCyclingLoading(true);
    loadCycling(wantCycleCountry).then((bundle) => {
      if (!live) return;
      setCountryCycling((cur) => ({ ...cur, [wantCycleCountry]: bundle || null }));
      setCyclingLoading(false);
    });
    return () => { live = false; };
  }, [isCycleCat, wantCycleCountry, countryCycling]);

  const cycleBundle = isCycleCat && wantCycleCountry
    ? countryCycling[wantCycleCountry] : null;

  // Every ride in the country, rated and listed, as ONE list of cards: the
  // rated rows first in score order, then the listed rows, which carry no
  // score key and so sort to the end of a rating sort by themselves (the
  // same rule the trails list keeps). A length or A-Z sort interleaves the
  // two, and the card says which is which. This is what "publish every
  // ride" means on screen: the 436 listed Belgian routes are cards with a
  // length, a climb, a surface and a page, not a footnote under the 19
  // rated ones.
  const cycleAll = useMemo(() => {
    if (!isCycleCat || !cycleBundle) return null;
    return [...(cycleBundle.routes || []), ...(cycleBundle.listed || [])];
  }, [isCycleCat, cycleBundle]);

  const cycleRows = useMemo(() => {
    if (!cycleAll) return null;
    let rows = applyCycleFacets(cycleAll, cycFacets);
    if (q && !queryCycleCountry) {
      rows = rows.filter((r) => norm(r.name || '').includes(q)
        || norm(r.ref || '').includes(q));
    }
    if (nearPlace) {
      return rows
        .map((r) => {
          const c = rideCentre(r);
          return c ? { r, km: haversineKm(nearPlace.lat, nearPlace.lon, c.lat, c.lon) } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    const out = rows.map((r) => ({ r, km: null }));
    const d = trailSort.dir;
    if (trailSort.key === 'distance') {
      out.sort((a, b) => d * ((a.r.km ?? Infinity) - (b.r.km ?? Infinity)));
    } else if (trailSort.key === 'az') {
      out.sort((a, b) => d * (a.r.name || '').localeCompare(b.r.name || ''));
    } else {
      out.sort((a, b) => d * ((a.r.score ?? -1) - (b.r.score ?? -1)));
    }
    return out;
  }, [cycleAll, cycFacets, q, queryCycleCountry, nearPlace, trailSort]);

  // The composed tours, above the rides: they answer "plan me a week" and are
  // not ranked against the routes they ride over.
  const cycleTours = useMemo(() => {
    if (!isCycleCat || !cycleBundle) return [];
    return (cycleBundle.tours || []).filter(
      (tr) => !q || queryCycleCountry || norm(tr.title || '').includes(q),
    );
  }, [isCycleCat, cycleBundle, q, queryCycleCountry]);

  const cycCounts = useMemo(
    () => cycleFacetCounts(cycleAll, cycFacets),
    [cycleAll, cycFacets],
  );

  // The country index for cycling: every country with anything published,
  // rated or listed, as a flag card, the way the trails index works.
  const cycleCountryCards = useMemo(() => {
    if (!isCycleCat || !cycleIndex) return [];
    return cycleIndex.countries
      .map((c) => ({ cc: c.country, name: countryName(c.country),
        n: (c.n_routes || 0) + (c.n_listed || 0) }))
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [isCycleCat, cycleIndex, countryName]);

  const askCycleCover = (cc) => {
    if (!cc || cycleCoverAsked.current.has(cc)) return;
    cycleCoverAsked.current.add(cc);
    loadCycling(cc).then((bundle) => {
      const hit = [...(bundle?.routes || []), ...(bundle?.listed || [])].find((r) => r.img);
      if (hit) setCycleCovers((cur) => ({ ...cur, [cc]: hit.img }));
    }).catch(() => { /* a country with no photograph keeps the catalogue cover */ });
  };

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
    });
    onOpenMountainConsumed?.();
  }, [openMountain, onOpenMountainConsumed]);

  // New filter result: collapse the window and go back to the top.
  const rowCount = isBeachCat ? (beachRows?.length ?? 0)
    : isLakeCat ? (lakeRows?.length ?? 0)
      : isMountainCat ? (mountainRows?.length ?? 0)
        : isCycleCat ? (cycleRows?.length ?? 0)
          : (tripRows?.length ?? 0);
  useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [cat, country, q, nearPlace, sort, trailSort, bands, loopsOnly,
    mtnFacets, lakeFacets, beachFacets, cycFacets, journeyView]);

  // Walk-shape filters belong to the Trails list and to nothing else. Leaving
  // them set while the traveller browses Trips would silently hide rows on a
  // tab whose chips are not even on screen to explain why.
  useEffect(() => {
    if (cat !== 'trails') { setBands([]); setLoopsOnly(false); }
    if (cat !== 'mountains') setMtnFacets({});
    if (cat !== 'lakes') setLakeFacets({});
    if (cat !== 'beaches') setBeachFacets({});
    if (cat !== 'cycling') setCycFacets({});
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

  const toggleSort = (key) => {
    setSort((s) => (s.key === key
      ? { key, dir: -s.dir }
      : { key, dir: SORTS.find((x) => x.key === key).defaultDir }));
  };

  const toggleBand = (key) => {
    setBands((cur) => (cur.includes(key)
      ? cur.filter((k) => k !== key)
      : [...cur, key]));
  };

  const toggleTrailSort = (key) => {
    setTrailSort((s) => (s.key === key
      ? { key, dir: -s.dir }
      : { key, dir: TRAIL_SORTS.find((x) => x.key === key).defaultDir }));
  };

  const fmt = (n) => n.toLocaleString(lang);

  const showCountryIndex = !q && !country && !nearPlace;
  const showTripRows = isTripCat && !trailsLoading && tripRows && tripRows.length > 0;
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
  // Cycling drops it too: a signed route is free and is ranked by its own
  // index, and a "priced from" origin over it answered nothing.
  const showPriceChrome = cat !== 'trails' && !isBeachCat && !isLakeCat
    && !isMountainCat && !isCycleCat && !isJourneyBrowse;

  // ── The filter model ──────────────────────────────────────────────────
  //
  // Which countries this tab can offer. Every layer publishes its own set,
  // and offering a country a layer has nothing in is worse than not offering
  // it: the list would empty and nothing on screen would say why.
  const countryOptions = useMemo(() => {
    const fromIndex = (idx) => (idx?.countries || [])
      .map((c) => [c.cc, countryName(c.cc)])
      .sort((a, b) => a[1].localeCompare(b[1], lang));
    if (isBeachCat) return fromIndex(beachIndex);
    if (isLakeCat) return fromIndex(lakeIndex);
    if (isMountainCat) return fromIndex(mountainIndex);
    // Trails and cycling publish per country too, so the picker offers the
    // countries their index names rather than every priced country: the
    // list used to offer Monaco's trails and Andorra's tours, and both are
    // empty.
    if (cat === 'trails') {
      return (trailsIndex?.countries || [])
        .filter((c) => (c.counts?.hike || 0) > 0)
        .map((c) => [c.country, countryName(c.country)])
        .sort((a, b) => a[1].localeCompare(b[1], lang));
    }
    if (isCycleCat) {
      return (cycleIndex?.countries || [])
        .map((c) => [c.country, countryName(c.country)])
        .sort((a, b) => a[1].localeCompare(b[1], lang));
    }
    return availableCountries;
  }, [cat, isBeachCat, isLakeCat, isMountainCat, isCycleCat, beachIndex, lakeIndex,
    mountainIndex, trailsIndex, cycleIndex, availableCountries, countryName, lang]);

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
    const fromDefs = (key, label, defs, on, counts, onToggle) => ({
      key,
      label,
      onToggle,
      options: defs.map((c) => {
        const n = counts.get(c.key) ?? 0;
        const isOn = on.includes(c.key);
        return { key: c.key, label: t(c.labelKey), n, on: isOn, disabled: !n && !isOn };
      }),
    });
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
      const fromCounts = (key, label, defs, on, counts, setter, toolbar = false) => {
        const options = defs
          .map((d) => {
            const n = counts.get(d.key) || 0;
            const isOn = on.includes(d.key);
            return { key: d.key, label: t(d.labelKey), n, on: isOn,
              disabled: !n && !isOn };
          })
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) return;
        out.push({ key, label, toolbar, onToggle: toggleChip(setter), options });
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
      // One group stands in the open under the toolbar, the one a walker
      // decides by first: how long. The other five live behind the Filters
      // door (and all six stand in the desktop side panel, which has the
      // height for them). Six rows of unlabelled chips in the open was the
      // "filters all over the place" the rebuild answers.
      out.push({
        key: 'length',
        label: t('trails.lengthLabel'),
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
    if (isCycleCat && cycleAll && cycleAll.length > 0) {
      // Six groups, the same rule as beaches: a chip whose count is zero in
      // this country is absent rather than greyed, a selected chip always
      // survives. Length and surface stand in the open row; the rest live
      // behind the Filters door.
      for (const group of CYCLE_FACETS) {
        const on = cycFacets[group.key] || [];
        const options = group.options
          .map((o) => ({
            key: o.key,
            label: t(o.labelKey),
            Icon: o.loop ? LoopIcon : undefined,
            cls: o.loop ? 'places-loopchip' : '',
            n: cycCounts.get(`${group.key}:${o.key}`) ?? 0,
            on: on.includes(o.key),
          }))
          .filter((o) => o.n > 0 || o.on);
        if (!options.length) continue;
        out.push({
          key: `cycle-${group.key}`,
          label: t(group.labelKey),
          toolbar: !!group.toolbar,
          onToggle: (k) => setCycFacets((cur) => {
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
  }, [cat, t, showCountryIndex, isItinCat, itinFacets,
    itinPace, itinScale, trailFacets, bands, loopsOnly,
    grades, climbs, shapes, hls, suits, isBeachCat, beachRows,
    beachFacets, beachCounts, isLakeCat, lakeRows, lakeFacets, lakeCounts,
    isMountainCat, mountainRows, mtnFacets, mtnCounts,
    isCycleCat, cycleAll, cycFacets, cycCounts]);

  // What the Filters badge counts, and what Clear all clears. The country is
  // one of them: it is the filter every tab now carries.
  const activeFilters = (country ? 1 : 0)
    + bands.length + (loopsOnly ? 1 : 0)
    + grades.length + climbs.length + shapes.length + hls.length + suits.length
    + Object.values(beachFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + Object.values(lakeFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + Object.values(mtnFacets).reduce((n, list) => n + (list?.length || 0), 0)
    + Object.values(cycFacets).reduce((n, list) => n + (list?.length || 0), 0)
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
    setCycFacets({});
    setItinDays(null);
    setItinPace(null);
    setItinScale(null);
  };

  // Which sorts this tab has, and whether there is a list for them to order.
  // Trails and cycling share one set of sorts (rating, length, A-Z): neither
  // has a price, both have a length and a rating.
  const isRouteCat = cat === 'trails' || isCycleCat;
  const sortDefs = isRouteCat ? TRAIL_SORTS : (showPriceChrome ? SORTS : []);
  const showSorts = cat === 'trails'
    ? (!showCountryIndex && !nearPlace && showTripRows)
    : isCycleCat
      ? (!showCountryIndex && !nearPlace && (cycleRows?.length ?? 0) > 0)
      : (!showCountryIndex && showPriceChrome);

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
  const isDesktop = useIsDesktop();

  // The same controls drawn twice, phone toolbar and desktop side panel:
  // one renderer each, so the two can never drift apart.
  const renderCats = (cls) => CATS.map(({ key, Icon, labelKey }) => (
    <button
      key={key}
      role="tab"
      aria-selected={cat === key}
      className={`${cls} ${cat === key ? 'on' : ''}`}
      onClick={() => switchCat(key)}
    >
      <Icon size={16} />
      <span>{t(labelKey)}</span>
    </button>
  ));

  const renderSortButtons = (cls) => sortDefs.map(({ key, labelKey }) => {
    const cur = isRouteCat ? trailSort : sort;
    const on = isRouteCat ? cur.key === key : (!nearPlace && cur.key === key);
    return (
      <button
        key={key}
        className={`${cls} ${on ? 'on' : ''}`}
        onClick={() => {
          if (isRouteCat) { toggleTrailSort(key); return; }
          setNearPlace(null);
          toggleSort(key);
        }}
      >
        {t(labelKey)}
        {on && <span className="places-sort-dir">{cur.dir === 1 ? '↑' : '↓'}</span>}
      </button>
    );
  });

  const renderCountry = (cls) => (
    <select
      className={cls}
      value={country}
      onChange={(e) => { setCountry(e.target.value); setNearPlace(null); }}
      aria-label={t('places.allCountries')}
    >
      <option value="">{t('places.allCountries')}</option>
      {countryOptions.map(([cc, name]) => (
        <option key={cc} value={cc}>{name}</option>
      ))}
    </select>
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

  // Every group is a LABELLED row: the label says what the chips narrow by,
  // which is what a run of "Flat 398, Rolling 231, Loop 543, Summit 47" had
  // stopped saying once six groups sat in one wrap. 'toolbar' renders only
  // the groups a tab marks for the open row (one or two); 'all' renders the
  // full set, which is what the desktop side panel has the height for.
  const renderFacetGroups = (only) => facetGroups
    .filter((g) => (only === 'toolbar' ? g.toolbar === true : true))
    .map((g) => (
    <div key={g.key} className="places-facet" role="group" aria-label={g.label}>
      <span className="places-facet-label">{g.label}</span>
      <div className="places-classes">
        {g.options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`places-class ${o.cls || ''} ${o.Icon ? '' : 'is-plain'} ${o.on ? 'on' : ''}`}
            aria-pressed={o.on}
            disabled={o.disabled}
            onClick={() => g.onToggle(o.key)}
          >
            {o.Icon && (
              <span className="places-class-dot" aria-hidden="true">
                <o.Icon size={16} />
              </span>
            )}
            <span className="places-class-label">{o.label}</span>
            {o.n != null && <span className="places-class-n">{fmt(o.n)}</span>}
          </button>
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
            ? <span className="places-locate-spin" aria-hidden="true" />
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

  return (
    <div className="places-shell">
      {/* Desktop-only left panel (CSS hides it under 769px): the categories
          as a card grid under the brand, then everything that narrows or
          orders the list, standing on the page ground with one hairline to
          its right. The phone keeps the toolbar card below instead. */}
      <aside className="side-panel places-side" aria-label={t('filter.filters')}>
        <div className="side-block">
          <p className="side-label">{t('side.categories')}</p>
          <div className="side-cats" role="tablist">{renderCats('side-cat')}</div>
        </div>
        <div className="side-block">
          <p className="side-label">
            {t('side.refine')}
            {activeFilters > 0 && (
              <button type="button" className="side-clear" onClick={resetAll}>
                {t('filter.reset')}
              </button>
            )}
          </p>
          {showSorts && sortDefs.length > 0 && (
            <div className="side-group" role="group" aria-label={t('places.sortLabel')}>
              <p className="side-sub">{t('places.sortLabel')}</p>
              <div className="side-sorts">{renderSortButtons('side-sort')}</div>
            </div>
          )}
          {countryOptions.length > 0 && (
            <div className="side-group">
              <p className="side-sub">{t('places.allCountries')}</p>
              {renderCountry('places-country side-country')}
            </div>
          )}
          {(facetGroups.length > 0 || isComposedTrips) && (
            <div className="side-group side-facets">
              {isComposedTrips && (
                <TripLengthSlider
                  days={itinDays}
                  setDays={setItinDays}
                  n={itinRows ? itinRows.length : 0}
                  t={t}
                />
              )}
              {renderFacetGroups('all')}
            </div>
          )}
          {/* No "Lifestyle" caption above it: the button says the word
              itself, and a heading that repeats its own button is text the
              reader has to skip. */}
          {showPriceChrome && onOpenLifestyle && (
            <div className="side-group">
              {renderLifestyle('side-lifestyle')}
            </div>
          )}
        </div>
      </aside>

      <div className="places-tab" ref={scrollRef}>
      <div className="places-wrap">
        {/* Desktop only: the search field at the head of the column, under
            the top bar and over the results it searches. The phone renders
            the same field inside the toolbar card below instead. One field,
            one place, never both: they share a ref. */}
        {isDesktop && <div className="places-searchrow">{searchField}</div>}

        {/* Every control in one card, the same instrument Explore carries:
            the category cards, then search, then the sorts and the one
            Filters door, then whatever chips this tab narrows by. Read apart
            they looked like five unrelated widgets sharing a background. */}
        <div className="places-toolbar">
        <div className="places-cats" role="tablist">
          {renderCats('places-cat')}
        </div>

        <div className="places-controls">
          {/* Inline on a phone; on desktop the same field heads the column
              above and this renders nothing. */}
          {!isDesktop && searchField}
          {/* Sorts, the Filters door, the country, where the prices start
              from and what they assume: one row, in that order. Filters
              leads because it is the one control that decides WHICH rows are
              listed; the sorts only reorder what it left. */}
          <div className="places-toolbar-right">
            {showSorts && sortDefs.length > 0 && (
              <div className="places-sorts" role="group" aria-label={t('places.sortLabel')}>
                {renderSortButtons('places-sort')}
              </div>
            )}

            <div className="places-chips">
              <button
                type="button"
                ref={filterBtnRef}
                className={`places-filter-btn ${activeFilters > 0 ? 'has-active' : ''}`}
                onClick={() => setSheetOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
              >
                <FilterIcon size={14} />
                <span>{t('filter.filters')}</span>
                {activeFilters > 0 && <span className="filter-tray-badge">{activeFilters}</span>}
              </button>

              {/* Every tab has a country now, including the three published
                  layers where the only way in used to be typing its name
                  into the search field and hoping the match landed. */}
              {countryOptions.length > 0 && renderCountry('places-country')}
          {/* No "priced from" chip any more, on any width: the origin still
              governs the prices (the map's From picker sets it), but naming
              it here was one control too many on the browse surface. */}
          {/* Every price on this tab is a whole trip at the traveller's own
              stay tier, so the tier it was priced at belongs on screen beside
              the numbers, and one tap opens the panel that changes it. */}
          {showPriceChrome && onOpenLifestyle && renderLifestyle('')}
            </div>
          </div>
        </div>

        {/* What this tab narrows by, in the same card and under a hairline,
            because a chip that changes WHICH rows are listed is the same kind
            of control as the search field above it. The model is built once
            (facetGroups) and rendered here and in the sheet. */}
        {(facetGroups.some((g) => g.toolbar === true) || isComposedTrips) && (
          <div className="places-facets">
            {isComposedTrips && (
              <TripLengthSlider
                days={itinDays}
                setDays={setItinDays}
                n={itinRows ? itinRows.length : 0}
                t={t}
              />
            )}
            {renderFacetGroups('toolbar')}
          </div>
        )}
        </div>

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
                  : cat === 'cycling' ? cycleRows
                    : cat === 'trips' ? itinRows
                      : null) || [];
          const scope = scopeForRows(kmRows.map((x) => ({
            km: x.km,
            region: (x.b || x.p || x.tr || x.r || (x.c && x.c.tr) || {}).region || null,
          })));
          const head = scope.scope === 'nearby' || scope.scope === 'none'
            ? t('places.nearHead', { city: nearPlace.name })
            : scope.scope === 'day_trip'
              ? t('scope.daytripHead', { city: nearPlace.name })
              : scope.regionName
                ? t('scope.farRegionHead', { city: nearPlace.name, region: scope.regionName })
                : t('scope.farHead', { city: nearPlace.name, km: Math.round(scope.km || 0) });
          return (
            <div className="places-nearhead" data-scope={scope.scope}>
              <span className="places-nearname">{head}</span>
              {nearPlace.sub && <span className="places-nearsub">{nearPlace.sub}</span>}
              <button className="places-nearclear" onClick={() => setNearPlace(null)}>
                {t('places.clearNear')}
              </button>
            </div>
          );
        })()}

        {/* Beaches. No country index in front of the list: the tab opens on
            the beaches themselves, ranked across Europe, because "show me a
            beach" is the request and a page of flags is not an answer to it.
            Typing a country's name swaps the capped European ranking for that
            country's full list. */}
        {isBeachCat && (
          <div className="places-list">
            {beachesLoading && <p className="places-empty">{'…'}</p>}

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
                          <span className="places-beachhead-note">
                            {t('beach.alsoNote')}
                          </span>
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
                              <span className="places-listedrow-chip">
                                {t('region.listedNote')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
                : (
                  <p className="places-empty">
                    {Object.values(beachFacets).some((l) => l?.length)
                      ? t('beach.noneChips')
                      : nearPlace
                        ? t('beach.noneNear', { city: nearPlace.name })
                        : t('beach.noneMatch')}
                  </p>
                )
            )}

            {!beachesLoading && !beachRows && (
              <p className="places-empty">{t('beach.notPublished')}</p>
            )}

            {visible < (beachRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {beachRows?.length > 0 && <p className="places-credit">{t('beach.credit')}</p>}
          </div>
        )}

        {/* Lakes. Same shape as beaches: no country index in front of the
            list, because "show me a lake" is the request and a page of flags
            is not an answer to it. Typing a country's name swaps the capped
            European ranking for that country's full list. */}
        {isLakeCat && (
          <div className="places-list">
            {lakesLoading && <p className="places-empty">{'…'}</p>}

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
                          <span className="places-beachhead-note">
                            {t('lake.alsoNote')}
                          </span>
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
                              <span className="places-listedrow-chip">
                                {t('region.listedNote')}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
                : (
                  <p className="places-empty">
                    {Object.values(lakeFacets).some((l) => l?.length)
                      ? t('lake.noneChips')
                      : nearPlace
                        ? t('lake.noneNear', { city: nearPlace.name })
                        : absentLakeCountry
                          ? t('lake.noneCountry', { country: countryName(absentLakeCountry) })
                          : t('lake.noneMatch')}
                  </p>
                )
            )}

            {!lakesLoading && !lakeRows && (
              <p className="places-empty">{t('lake.notPublished')}</p>
            )}

            {visible < (lakeRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {lakeRows?.length > 0 && <p className="places-credit">{t('lake.credit')}</p>}
          </div>
        )}

        {/* Mountains. Same shape as beaches and lakes: no country index in
            front of the list, because "show me a mountain" is the request and
            a page of flags is not an answer to it. Typing a country's name
            swaps the capped European ranking for that country's full list. */}
        {isMountainCat && (
          <div className="places-list">
            {mountainsLoading && <p className="places-empty">{'…'}</p>}

            {!mountainsLoading && mountainRows && (
              mountainRows.length > 0
                ? (
                  <>
                    {/* No "{n} mountains in {country}, best first" line any
                        more: the cards are the answer. What survives is the
                        one note that explains a SHORT list, where the floor
                        could not be reached: a reader sees "Lithuania's high
                        points are gentle, and this is every one we could
                        verify" rather than four mountains and no
                        explanation. */}
                    {wantMountainCountry && !nearPlace
                      && floorNote(mountainIndex, wantMountainCountry, t,
                        countryName(wantMountainCountry)) && (
                      <p className="places-beachhead">
                        {floorNote(mountainIndex, wantMountainCountry, t,
                          countryName(wantMountainCountry))}
                      </p>
                    )}
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
                          <span className="places-beachhead-note">
                            {t('mtn.alsoNote')}
                          </span>
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
                                <span className="places-listedrow-chip">
                                  {t('region.listedNote')}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}
                  </>
                )
                : (
                  <p className="places-empty">
                    {Object.values(mtnFacets).some((l) => l?.length)
                      ? t('mtn.noneChips')
                      : nearPlace
                        ? t('mtn.noneNear', { city: nearPlace.name })
                        : absentMountainCountry
                          ? t('mtn.noneCountry', { country: countryName(absentMountainCountry) })
                          : t('mtn.noneMatch')}
                  </p>
                )
            )}

            {!mountainsLoading && !mountainRows && (
              <p className="places-empty">{t('mtn.notPublished')}</p>
            )}

            {visible < (mountainRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {mountainRows?.length > 0 && <p className="places-credit">{t('mtn.credit')}</p>}
          </div>
        )}

        {/* Cycling. The same shape as Trails: a country index of flag cards
            until a country (or a near-search) is picked, then every ride in
            that country as one list of cards, tours first. Listed rows are
            cards too, with "Not scored yet" where the score would be: that
            is what keeps the coverage honest AND on the page. */}
        {isCycleCat && (
          <div className="places-list" data-testid="cycle-list">
            {showCountryIndex && (
              <>
                {/* EuroVelo families, on the index only: in OSM a EuroVelo
                    is one relation PER COUNTRY SECTION under a superroute,
                    so without this band the catalogue shows "EuroVelo 6
                    part Germany 3" and never the 6,308 km thing it belongs
                    to. A continental route belongs over the continent, not
                    inside one country's list. */}
                {(cycleIndex?.families || []).length > 0 && (
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
                    <p className="places-bandhead">{t('cycle.countriesTitle')}</p>
                  </>
                )}
                {cycleCountryCards.map((c) => (
                  <CountryCard
                    key={c.cc}
                    cc={c.cc}
                    name={c.name}
                    img={cycleCovers[c.cc] || countryCover.get(c.cc)?.img || null}
                    onAskCover={cycleCovers[c.cc] ? null : askCycleCover}
                    onPick={(cc) => setCountry(cc)}
                  />
                ))}
                {cycleIndex && cycleCountryCards.length === 0 && (
                  <p className="places-empty">{t('places.catEmpty')}</p>
                )}
                {!cycleIndex && <p className="places-empty">{'…'}</p>}
              </>
            )}

            {!showCountryIndex && cyclingLoading && <p className="places-empty">{'…'}</p>}

            {!showCountryIndex && !cyclingLoading && cycleRows && (
              <>
                {cycleTours.length > 0 && !nearPlace && (
                  <>
                    <p className="places-bandhead">{t('cycle.toursTitle')}</p>
                    {cycleTours.map((tr) => (
                      <TourCard
                        key={tr.slug}
                        tour={tr}
                        t={t}
                        onOpen={(tour) => setPageCycle({ tourSlug: tour.slug,
                          country: wantCycleCountry })}
                      />
                    ))}
                    {cycleRows.length > 0 && (
                      <p className="places-bandhead">{t('cycle.routesTitle')}</p>
                    )}
                  </>
                )}
                {cycleRows.slice(0, visible).map(({ r, km }, i) => (
                  <React.Fragment key={r.id}>
                    {bandBreak(cycleRows, i) && (
                      <p className="places-bandhead">{t(bandBreak(cycleRows, i))}</p>
                    )}
                    {/* The first listed row under a rating sort opens the
                        unscored tier: one divider says so once, in place of
                        a chip on every card saying it again. */}
                    {!nearPlace && trailSort.key === 'rating' && isListedRide(r)
                      && (i === 0 || !isListedRide(cycleRows[i - 1].r)) && (
                      <p className="places-bandhead" data-testid="cycle-listed-head">
                        {t('cycle.listedHeading')}
                      </p>
                    )}
                    <CycleCard
                      row={r}
                      km={km}
                      t={t}
                      onOpen={(row) => setPageCycle({ routeId: row.id,
                        country: wantCycleCountry })}
                    />
                  </React.Fragment>
                ))}
                {cycleRows.length === 0 && cycleTours.length === 0 && (
                  <p className="places-empty">
                    {Object.values(cycFacets).some((l) => l?.length)
                      ? t('cycle.noneChips')
                      : nearPlace
                        ? t('places.noneNear', { city: nearPlace.name })
                        : t('cycle.emptyCountry')}
                  </p>
                )}
              </>
            )}

            {!showCountryIndex && !cyclingLoading && !cycleRows && (
              <p className="places-empty">
                {nearPlace && !nearPlace.iso2
                  ? t('places.noneNear', { city: nearPlace.name })
                  : t('cycle.emptyCountry')}
              </p>
            )}

            {!showCountryIndex && visible < (cycleRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {cycleRows?.length > 0 && (
              <p className="places-credit" data-testid="cycle-credit-foot">
                {t('cycle.sourceNote')}
              </p>
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
            t={t}
            lang={lang}
          />
        )}

        {isComposedTrips && (
          <button
            type="button"
            className="jsec-back jsec-back-solo"
            onClick={() => {
              setJourneyView(null);
              setItinDays(null);
              setItinPace(null);
              setItinScale(null);
            }}
          >
            <ArrowLeftIcon size={14} />
            <span>{t('journey.backStyles')}</span>
          </button>
        )}

        {isItinCat && (
          <div className="places-list">
            {itinRows === null && <p className="places-empty">{'\u2026'}</p>}

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
              <p className="places-empty">
                {nearPlace
                  ? t('places.noneNear', { city: nearPlace.name })
                  : itinDays
                    ? t('trip.emptyDays', { n: itinDays })
                    : t('trip.emptyAll')}
              </p>
            )}

            {itinRows && visible < itinRows.length && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {itinRows?.length > 0 && <p className="places-credit">{t('trip.credit')}</p>}
          </div>
        )}

        {isTripCat && !isItinCat && (
          <div className="places-list">
            {showCountryIndex && (
              <>
                {tripCountries.map((c) => (
                  <CountryCard
                    key={c.cc}
                    cc={c.cc}
                    name={c.name}
                    img={countryCover.get(c.cc)?.img || wireCovers[c.cc] || null}
                    onAskCover={countryCover.get(c.cc) ? null : askCover}
                    onPick={(cc) => setCountry(cc)}
                  />
                ))}
                {trailsIndex && tripCountries.length === 0 && (
                  <p className="places-empty">{t('places.catEmpty')}</p>
                )}
              </>
            )}

            {!showCountryIndex && trailsLoading && <p className="places-empty">{'…'}</p>}

            {!showCountryIndex && !trailsLoading && tripRows && (
              tripRows.length > 0
                ? tripRows.slice(0, visible).map(({ c, km }, i) => (
                  <React.Fragment key={c.tr.id}>
                    {bandBreak(tripRows, i) && (
                      <p className="places-bandhead">{t(bandBreak(tripRows, i))}</p>
                    )}
                    <TripCard card={c} km={km} onOpen={setPageCard} t={t} />
                  </React.Fragment>
                ))
                : (
                  <p className="places-empty">
                    {nearPlace
                      ? t('places.noneNear', { city: nearPlace.name })
                      : t('places.trailsEmpty', { country: countryName(trailsCountry || country) })}
                  </p>
                )
            )}

            {!showCountryIndex && !trailsLoading && !tripRows && nearNoCountry && (
              <p className="places-empty">{t('places.noneNear', { city: nearPlace.name })}</p>
            )}

            {!showCountryIndex && visible < (tripRows?.length ?? 0) && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}

            {showTripRows && <p className="places-credit">{t('trails.credit')}</p>}
          </div>
        )}
      </div>

      {pageCard && (
        <Suspense fallback={null}>
          <TrailPage
            card={pageCard}
            onOpenNeighbour={openNeighbour}
            onClose={() => setPageCard(null)}
            onSelectDest={(id) => { setPageCard(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageJourney && (
        <Suspense fallback={null}>
          <JourneyPage
            id={pageJourney.id}
            gatewayDest={(() => {
              // The gateway airport code doubles as a catalogue id (BCN,
              // VIE...), which is what lets the page end on a priced CTA.
              const d = pageJourney.gw ? data.destinations[pageJourney.gw] : null;
              return d ? { id: pageJourney.gw, city: d.city } : null;
            })()}
            onClose={() => setPageJourney(null)}
            onSelectDest={(id) => { setPageJourney(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageItin && (
        <Suspense fallback={null}>
          <TripPage
            trip={pageItin}
            data={data}
            onClose={() => setPageItin(null)}
            onOpenInPlanner={onOpenTripInPlanner}
            onSelectDest={(id) => { setPageItin(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageBeach && (
        <Suspense fallback={null}>
          <BeachPage
            beach={pageBeach}
            onOpenNeighbour={openNeighbour}
            countryName={countryName(pageBeach.cc)}
            model={beachIndex?.model || null}
            onClose={() => setPageBeach(null)}
            onSelectDest={(id) => { setPageBeach(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageLake && (
        <Suspense fallback={null}>
          <LakePage
            lake={pageLake}
            onOpenNeighbour={openNeighbour}
            countryName={countryName(pageLake.cc)}
            warmC={lakeIndex?.model?.warm_c ?? 18}
            onClose={() => setPageLake(null)}
            onSelectDest={(id) => { setPageLake(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageCycle && pageCycle.familyRef && (
        <Suspense fallback={null}>
          <CycleFamilyPage
            familyRef={pageCycle.familyRef}
            onClose={() => setPageCycle(null)}
          />
        </Suspense>
      )}

      {pageCycle && !pageCycle.familyRef && (
        <Suspense fallback={null}>
          <CyclePage
            routeId={pageCycle.routeId}
            onOpenNeighbour={openNeighbour}
            tourSlug={pageCycle.tourSlug}
            country={pageCycle.country}
            countryName={countryName(pageCycle.country)}
            onClose={() => setPageCycle(null)}
          />
        </Suspense>
      )}

      {pageMountain && (
        <Suspense fallback={null}>
          <MountainPage
            mountain={pageMountain}
            onOpenNeighbour={openNeighbour}
            countryName={countryName(pageMountain.cc)}
            onClose={() => setPageMountain(null)}
            onSelectDest={(id) => { setPageMountain(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {/* The one Filters door, holding the country and the same facet groups
          the toolbar shows, so the sheet is the complete set rather than the
          leftovers. */}
      {sheetOpen && (
        <PlacesFilterSheet
          onClose={() => setSheetOpen(false)}
          anchorRef={filterBtnRef}
          groups={facetGroups}
          country={country}
          setCountry={(cc) => { setCountry(cc); setNearPlace(null); }}
          countryOptions={countryOptions}
          activeFilters={activeFilters}
          resetAll={resetAll}
          resultCount={rowCount}
        />
      )}
      </div>
    </div>
  );
}
