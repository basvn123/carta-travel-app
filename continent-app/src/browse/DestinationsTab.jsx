import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { eur } from '../lib/format.js';
import { fareProv, estPrefix } from '../components/FareProvenance.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { loadTrails, loadTrailsIndex } from '../lib/trails.js';
import { loadBeachIndex, loadBeaches, loadTopBeaches } from '../lib/beaches.js';
import { beachTags, beachRating } from '../lib/beachStory.js';
import { loadLakeIndex, loadLakes, loadTopLakes } from '../lib/lakes.js';
import { lakeTags, lakeRating, lakeSwim, isHiddenGem } from '../lib/lakeStory.js';
import {
  loadMountainIndex, loadMountains, loadTopMountains,
} from '../lib/mountains.js';
import {
  loadTripIndex, loadTrips, loadTopTrips, rankTrips,
} from '../lib/trips.js';
import {
  tripHeadline, shapeLabel, transportLabel, seasonLabel, tripTags, cardThumb,
} from '../lib/tripStory.js';
import {
  mountainTags, mountainRating, isLiftServed, liftLabel,
  isHiddenGem as isMountainGem,
} from '../lib/mountainStory.js';
import {
  associateTrip, haversineKm, tripCentre, tripKindKey, tripThemes,
  DISTANCE_BANDS, tripBand, trailRating,
} from '../lib/trailCards.js';
import { useI18n } from '../i18n/index.jsx';
import { OriginPicker } from '../components/OriginPicker.jsx';
import { geocodeAddress, reverseGeocode } from '../lib/geocode.js';
import {
  SearchIcon, ChevronRightIcon, RouteIcon, SkylineIcon, SuitcaseIcon, BootIcon,
  BeachIcon, MountainIcon, BedIcon, MapPinIcon, CrosshairIcon,
  CityIcon, TownIcon, VillageIcon, AreaIcon, LoopIcon, LakeIcon,
} from '../components/Icons.jsx';

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

// Lazy: the page imports maplibre-gl, which stays out of the main bundle.
const TrailPage = lazy(() => import('./TrailPage.jsx').then((m) => ({ default: m.TrailPage })));
// Lazy for symmetry, not for weight: the beach page carries no map, but it is
// only ever reached by tapping a card, so it can arrive then.
const BeachPage = lazy(() => import('./BeachPage.jsx').then((m) => ({ default: m.BeachPage })));
const LakePage = lazy(() => import('./LakePage.jsx').then((m) => ({ default: m.LakePage })));
const MountainPage = lazy(() => import('./MountainPage.jsx').then((m) => ({ default: m.MountainPage })));
// The itinerary page mounts TripMap, and TripMap pulls in maplibre-gl.
const TripPage = lazy(() => import('./TripPage.jsx').then((m) => ({ default: m.TripPage })));

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

const CATS = [
  { key: 'general', Icon: SkylineIcon, labelKey: 'places.catGeneral' },
  { key: 'trips', Icon: SuitcaseIcon, labelKey: 'places.catTrips' },
  { key: 'trails', Icon: BootIcon, labelKey: 'places.catTrails' },
  { key: 'beaches', Icon: BeachIcon, labelKey: 'places.catBeaches' },
  { key: 'lakes', Icon: LakeIcon, labelKey: 'places.catLakes' },
  { key: 'mountains', Icon: MountainIcon, labelKey: 'places.catMountains' },
];

/**
 * Place classes, in rising order of size (dest.place.class, written by
 * place_layer.py). The rail exists to answer the question the rating cannot:
 * a traveller looking at 1,570 priced places needs to know which ones are a
 * base and which ones are an afternoon, and "Bruges 8.8" does not say.
 *
 * `metro` is folded into `city` here. Five sizes is a taxonomy; four chips is
 * a decision, and nobody browsing has ever needed to separate a 300,000-person
 * city from a 90,000-person one before choosing where to sleep.
 */
const CLASSES = [
  { key: 'city', Icon: CityIcon, labelKey: 'places.classCity', match: ['city', 'metro'] },
  { key: 'town', Icon: TownIcon, labelKey: 'places.classTown', match: ['town'] },
  { key: 'village', Icon: VillageIcon, labelKey: 'places.classVillage', match: ['village'] },
  { key: 'area', Icon: AreaIcon, labelKey: 'places.classArea', match: ['area'] },
];
const CLASS_OF = new Map(CLASSES.flatMap((c) => c.match.map((m) => [m, c.key])));

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

/** One catalogue place as a photo card: hero image, name, rating, from-price.
 *  The size glyph rides in the corner so the distinction the rail filters on
 *  is still readable once you have stopped filtering and started scrolling. */
function DestCard({ p, km, priceMode, onSelect, t }) {
  const prov = fareProv(p.prov || p);
  const cls = CLASSES.find((c) => c.key === CLASS_OF.get(p.place?.class));
  return (
    <button className="places-dcard" onClick={() => onSelect(p.id)}>
      {/* One column on a phone, two above 640px, and the card is 150px tall.
          Asking for the wire's 960px rendering meant every card downloaded
          three to five times the pixels it drew. lib/heroImage.js owns the
          width list, because Wikimedia answers 400 for anything off it. */}
      <HeroImage
        url={p.image}
        city={p.city}
        iso2={p.iso2}
        className="places-card-img"
        maxWidth={960}
        sizes="(max-width: 639px) 96vw, (max-width: 1180px) 48vw, 560px"
        ratio={[16, 8]}
      />
      <span className="places-card-scrim" aria-hidden="true" />
      {km != null && (
        <span className="places-card-km">{t('places.kmAway', { km: Math.round(km) })}</span>
      )}
      {cls && (
        <span className="places-card-class" role="img" aria-label={t(cls.labelKey)}>
          <cls.Icon size={14} />
        </span>
      )}
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">{p.city}</span>
          <span className="places-card-sub">
            <span>{p.country}</span>
            <RatingBadge rating={p.rating} size="xs" showGem={false} />
          </span>
        </span>
        <span className="places-card-right">
          <span className="places-card-price">
            {`${estPrefix(prov)}${eur(priceMode === 'pp' ? p.pp : p.total)}`}
            {priceMode === 'pp' && <small>/pp</small>}
          </span>
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
      </span>
    </button>
  );
}

/**
 * One published trip as a photo card: the name, the measured facts, the kind.
 *
 * No description here. The wire's summary was clamped to two lines and broke
 * mid-sentence on every card, which reads as a bug rather than a teaser; the
 * whole explanation now lives on the trail page, one tap away.
 */
function TripCard({ card, km, onOpen, t }) {
  const { tr, assoc, kindKey, price } = card;
  const isCityDay = tr.category === 'citytrip';
  const diffKey = tr.difficulty === 'easy' ? 'places.diffEasy'
    : tr.difficulty === 'moderate' ? 'places.diffModerate'
      : tr.difficulty === 'hard' ? 'places.diffHard' : null;
  return (
    <button className="places-tcard" onClick={() => onOpen(card)}>
      {assoc.photoUrl
        ? <img className="places-card-img" src={assoc.photoUrl} alt="" loading="lazy" />
        : (
          <span className="places-card-img places-card-noimg" aria-hidden="true">
            <RouteIcon size={26} />
          </span>
        )}
      <span className="places-card-scrim" aria-hidden="true" />
      {km != null && (
        <span className="places-card-km">{t('places.kmAway', { km: Math.round(km) })}</span>
      )}
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">{tr.name}</span>
          <span className="places-card-facts">
            {tr.distance_m != null && (
              <span>{(tr.distance_m / 1000).toFixed(1).replace(/\.0$/, '')} km</span>
            )}
            {tr.duration_min != null && <span>{hoursText(tr.duration_min)} h</span>}
            {isCityDay && tr.n_stops != null && <span>{t('trails.stops', { n: tr.n_stops })}</span>}
            {!isCityDay && tr.ascent_m != null && <span>+{Math.round(tr.ascent_m)} m</span>}
          </span>
          <span className="places-card-kinds">
            <span className={`places-card-kind ${isCityDay ? 'city' : ''}`}>{t(kindKey)}</span>
            {/* Loop is the shape people filter for, so it is said on the card
                and not only behind the chip that found it. */}
            {!isCityDay && tr.is_loop && (
              <span className="places-card-kind places-card-loop">
                <LoopIcon size={11} />
                {t('trails.loop')}
              </span>
            )}
          </span>
        </span>
        <span className="places-card-right">
          {isCityDay && assoc.dest?.rating && (
            <RatingBadge rating={assoc.dest.rating} size="xs" showGem={false} />
          )}
          {/* The walk's own rating, not the nearest town's. Scored within its
              country from open signals only (pipeline/trails/rate.py). */}
          {!isCityDay && trailRating(tr) && (
            <RatingBadge rating={trailRating(tr)} size="xs" showGem={false} />
          )}
          {!isCityDay && diffKey && (
            <span className="places-card-diff">{t(diffKey)}</span>
          )}
          {isCityDay && price && (
            <span className="places-card-price">
              {eur(price.pp)}
              <small>/pp</small>
            </span>
          )}
          <ChevronRightIcon size={15} className="places-card-chev" />
        </span>
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
        <span className="places-card-km">{t('places.kmAway', { km: Math.round(km) })}</span>
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
        <span className="places-card-km">{t('places.kmAway', { km: Math.round(km) })}</span>
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
  return (
    <button className="places-bcard places-mcard" onClick={() => onOpen(mountain)}>
      {shot
        ? <img className="places-card-img" src={shot.u} alt="" loading="lazy" />
        : <span className="places-card-img places-card-noimg" aria-hidden="true" />}
      <span className="places-card-scrim" aria-hidden="true" />
      {km != null && (
        <span className="places-card-km">{t('places.kmAway', { km: Math.round(km) })}</span>
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
          {tags.length > 0 && (
            <span className="places-bcard-tags">
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
function CountryCard({ cc, name, sub, img, onPick }) {
  return (
    <button className="places-ccard" onClick={() => onPick(cc)}>
      {/* 92px tall and ~360 css px wide: the 960px rendering the wire carries
          is roughly nine times the pixels this draws. */}
      <HeroImage
        url={img}
        city={name}
        iso2={cc}
        className="places-card-img"
        maxWidth={500}
        sizes="(max-width: 639px) 96vw, (max-width: 1180px) 48vw, 560px"
        ratio={[16, 4]}
      />
      <span className="places-card-scrim" aria-hidden="true" />
      <span className="places-card-overlay">
        <span className="places-card-main">
          <span className="places-card-name">
            <CountryFlag country={cc} size={13} className="places-card-flag" />
            {name}
          </span>
          <span className="places-card-sub"><span>{sub}</span></span>
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
        {tr.img
          ? <img className="places-card-img" src={cardThumb(tr.img.url)} alt="" loading="lazy" />
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
            <span className="itin-card-near">{t('trip.kmAway', { km: Math.round(km) })}</span>
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
  data, pricedAll, priceMode = 'total', availableCountries = [], onSelectDest,
  stayTier = 'home', onOpenLifestyle,
  origin, onChangeOrigin, transportMode = 'plane', driveHome = null, onChangeDriveHome,
  openTrail = null, onOpenTrailConsumed,
  openBeach = null, onOpenBeachConsumed,
  openLake = null, onOpenLakeConsumed,
  openMountain = null, onOpenMountainConsumed,
  openTrip = null, onOpenTripConsumed, onOpenTripInPlanner,
}) {
  const { t, lang } = useI18n();
  const scrollRef = useRef(null);
  const sentinelRef = useRef(null);

  const [cat, setCat] = useState('general');         // CATS key
  const [classes, setClasses] = useState([]);        // CLASSES keys, [] = all sizes
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
  const [loopsOnly, setLoopsOnly] = useState(false);
  const [trailSort, setTrailSort] = useState({ key: 'rating', dir: -1 });
  const [visible, setVisible] = useState(PAGE);
  const [pageCard, setPageCard] = useState(null);    // enriched trip card or null
  // The Trips category asks one question: how many days. 1 means the drawn
  // city walks, 2 and up mean a composed itinerary, null means any length.
  const [itinDays, setItinDays] = useState(null);
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
  const [pageLake, setPageLake] = useState(null);

  // Mountains: the same three artifacts again. `liftOnly` is this layer's one
  // filter, and it exists because it is the question the tab is most often
  // opened with: show me the mountains I can ride to the top of.
  const [mountainIndex, setMountainIndex] = useState(null);
  const [topMountains, setTopMountains] = useState(null);
  const [countryMountains, setCountryMountains] = useState({});   // cc -> rows
  const [mountainsLoading, setMountainsLoading] = useState(false);
  const [pageMountain, setPageMountain] = useState(null);
  const [liftOnly, setLiftOnly] = useState(false);

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
  const isTripCat = cat !== 'general' && !isBeachCat && !isLakeCat && !isMountainCat;
  const trailsCountry = nearPlace ? nearPlace.iso2 : country;
  useEffect(() => {
    if (!isTripCat || !trailsCountry) { setCountryTrips(null); return undefined; }
    let live = true;
    setTrailsLoading(true);
    loadTrails(trailsCountry).then((trips) => {
      if (!live) return;
      setCountryTrips(trips || []);
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

  // Where each destination actually is, city centre first. Some rows are
  // anchored on their airport, and measuring "how far is this from my street"
  // against a runway 40 km out of town orders the nearest list wrong.
  const centreById = useMemo(() => {
    const m = new Map();
    for (const [id, d] of Object.entries(data.destinations)) {
      m.set(id, [d.city_lat ?? d.lat, d.city_lon ?? d.lon]);
    }
    return m;
  }, [data]);

  const priceById = useMemo(() => {
    const m = new Map();
    for (const p of pricedAll) m.set(p.id, p);
    return m;
  }, [pricedAll]);

  // Country card covers: the best-rated place of each country supplies the
  // photo, so the index shows real photography rather than a stretched flag.
  const countryCover = useMemo(() => {
    const m = new Map();
    for (const p of pricedAll) {
      if (!p.image) continue;
      const score = p.rating?.score ?? 0;
      const cur = m.get(p.iso2);
      if (!cur || score > cur.score) m.set(p.iso2, { img: p.image, score });
    }
    return m;
  }, [pricedAll]);

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

  // ── General: the priced catalogue ─────────────────────────────────────

  const destRows = useMemo(() => {
    if (cat !== 'general') return [];
    const wantClass = classes.length ? new Set(classes) : null;
    const filtered = pricedAll.filter((p) => {
      if (country && p.iso2 !== country) return false;
      if (q && !(norm(p.city).includes(q) || norm(p.country).includes(q))) return false;
      // A destination with no place block predates the class layer, so it is
      // shown under every size rather than hidden by a filter it never saw.
      if (wantClass && p.place?.class && !wantClass.has(CLASS_OF.get(p.place.class))) return false;
      return true;
    });
    if (nearPlace) {
      return filtered
        .map((p) => {
          const c = centreById.get(p.id);
          return { p, km: haversineKm(nearPlace.lat, nearPlace.lon, c?.[0] ?? p.lat, c?.[1] ?? p.lon) };
        })
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAR_MAX_ROWS);
    }
    const rows = filtered.map((p) => ({ p, km: null }));
    const dir = sort.dir;
    if (sort.key === 'rating') {
      rows.sort((a, b) => dir * ((a.p.rating?.score ?? -1) - (b.p.rating?.score ?? -1)));
    } else if (sort.key === 'price') {
      const v = (p) => (priceMode === 'pp' ? p.pp : p.total) ?? Infinity;
      rows.sort((a, b) => dir * (v(a.p) - v(b.p)));
    } else {
      rows.sort((a, b) => dir * a.p.city.localeCompare(b.p.city));
    }
    return rows;
  }, [cat, pricedAll, country, q, nearPlace, centreById, sort, priceMode, classes]);

  // How many places each size holds under the country/search filter, so a chip
  // can say "42" and can grey itself out rather than leading to an empty list.
  const classCounts = useMemo(() => {
    if (cat !== 'general') return null;
    const counts = new Map(CLASSES.map((c) => [c.key, 0]));
    for (const p of pricedAll) {
      if (country && p.iso2 !== country) continue;
      if (q && !(norm(p.city).includes(q) || norm(p.country).includes(q))) continue;
      const key = CLASS_OF.get(p.place?.class);
      if (key) counts.set(key, counts.get(key) + 1);
    }
    // Inert until the place layer is in the wire: a catalogue with no classes
    // yet would otherwise show a rail of four disabled zeros. Same rule the
    // reach filter follows (see components/ReachFilter.jsx).
    let any = false;
    for (const n of counts.values()) if (n > 0) any = true;
    return any ? counts : null;
  }, [cat, pricedAll, country, q]);

  // The country index for General: every priced country as a flag card.
  const generalCountries = useMemo(() => {
    if (cat !== 'general') return [];
    const agg = new Map();
    for (const p of pricedAll) {
      const a = agg.get(p.iso2) || { n: 0, min: Infinity };
      a.n += 1;
      const v = priceMode === 'pp' ? p.pp : p.total;
      if (v != null && v < a.min) a.min = v;
      agg.set(p.iso2, a);
    }
    return availableCountries
      .map(([cc, name]) => ({ cc, name, ...agg.get(cc) }))
      .filter((c) => c.n > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cat, pricedAll, availableCountries, priceMode]);

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
  }, [tripCards, cat, q, nearPlace, sort, trailSort, bands, loopsOnly]);

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
    const byBand = new Map(DISTANCE_BANDS.map((b) => [b.key, 0]));
    let loops = 0;
    for (const c of rows) {
      const band = tripBand(c.tr);
      if (band != null) byBand.set(band, (byBand.get(band) || 0) + 1);
      if (c.tr.is_loop) loops += 1;
    }
    return { byBand, loops, total: rows.length };
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
  const isItinCat = cat === 'trips' && itinDays !== 1;

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
    setItinDays(null);
    setPageItin({ id: openTrip.id });
    onOpenTripConsumed?.();
  }, [openTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  const itinRows = useMemo(() => {
    if (!isItinCat) return null;
    const source = itinCountry ? itinCountryRows : itinTop;
    if (!source) return null;
    let rows = rankTrips(source, { days: itinDays });
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
  }, [isItinCat, itinCountry, itinCountryRows, itinTop, itinDays, q, nearPlace]);

  // Which day counts can actually be answered here, so a length nobody
  // composed is greyed out rather than offered and returning nothing.
  const itinDayCounts = useMemo(() => {
    const out = new Map();
    if (cat !== 'trips') return out;
    // 1 is the city walks, which the trails index counts separately.
    const walks = (trailsIndex?.countries || []).reduce((n, c) => (
      n + (itinCountry && c.country !== itinCountry ? 0 : (c.counts?.citytrip || 0))), 0);
    if (walks) out.set(1, walks);
    const source = itinCountry ? itinCountryRows : itinTop;
    for (const tr of source || []) out.set(tr.days, (out.get(tr.days) || 0) + 1);
    return out;
  }, [cat, itinCountry, itinCountryRows, itinTop, trailsIndex]);

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

  // Full country files are pulled in only when something asks for one: a
  // country named in the search, or the country a searched address sits in.
  const wantBeachCountry = queryCountry
    || (nearPlace && beachCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isBeachCat || !wantBeachCountry || countryBeaches[wantBeachCountry]) return undefined;
    let live = true;
    loadBeaches(wantBeachCountry).then((rows) => {
      if (!live) return;
      setCountryBeaches((cur) => ({ ...cur, [wantBeachCountry]: rows || [] }));
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
    let rows = pool;
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
    nearPlace, countryName]);

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

  const wantLakeCountry = queryLakeCountry
    || (nearPlace && lakeCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isLakeCat || !wantLakeCountry || countryLakes[wantLakeCountry]) return undefined;
    let live = true;
    loadLakes(wantLakeCountry).then((rows) => {
      if (!live) return;
      setCountryLakes((cur) => ({ ...cur, [wantLakeCountry]: rows || [] }));
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
    let rows = pool;
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
    nearPlace, countryName]);

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

  const wantMountainCountry = queryMountainCountry
    || (nearPlace && mountainCountries.has(nearPlace.iso2) ? nearPlace.iso2 : null);

  useEffect(() => {
    if (!isMountainCat || !wantMountainCountry
      || countryMountains[wantMountainCountry]) return undefined;
    let live = true;
    loadMountains(wantMountainCountry).then((rows) => {
      if (!live) return;
      setCountryMountains((cur) => ({ ...cur, [wantMountainCountry]: rows || [] }));
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
    let rows = pool;
    if (liftOnly) rows = rows.filter(isLiftServed);
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
    queryMountainCountry, nearPlace, countryName, liftOnly]);

  // How many of the rows on screen you can ride to the top of, so the chip can
  // carry its own count and grey itself out instead of leading to an empty
  // list. Counted BEFORE the chip is applied, which is what lets the number
  // stay still while it is tapped.
  const liftCount = useMemo(() => {
    if (!isMountainCat || !topMountains) return 0;
    const loaded = wantMountainCountry ? countryMountains[wantMountainCountry] : null;
    return (loaded || topMountains).filter(isLiftServed).length;
  }, [isMountainCat, topMountains, countryMountains, wantMountainCountry]);

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
  const rowCount = cat === 'general' ? destRows.length
    : isBeachCat ? (beachRows?.length ?? 0)
      : isLakeCat ? (lakeRows?.length ?? 0)
        : isMountainCat ? (mountainRows?.length ?? 0)
          : (tripRows?.length ?? 0);
  useEffect(() => {
    setVisible(PAGE);
    scrollRef.current?.scrollTo?.(0, 0);
  }, [cat, country, q, nearPlace, sort, classes, trailSort, bands, loopsOnly,
    liftOnly]);

  // Walk-shape filters belong to the Trails list and to nothing else. Leaving
  // them set while the traveller browses Trips would silently hide rows on a
  // tab whose chips are not even on screen to explain why.
  useEffect(() => {
    if (cat !== 'trails') { setBands([]); setLoopsOnly(false); }
    if (cat !== 'mountains') setLiftOnly(false);
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
    setClasses([]);
    scrollRef.current?.scrollTo?.(0, 0);
  };

  const toggleClass = (key) => {
    setClasses((cur) => (cur.includes(key)
      ? cur.filter((k) => k !== key)
      : [...cur, key]));
  };

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
  const showPriceChrome = cat !== 'trails' && !isBeachCat && !isLakeCat
    && !isMountainCat;
  const showCountryPicker = !isBeachCat && !isLakeCat && !isMountainCat;

  return (
    <div className="places-tab" ref={scrollRef}>
      <div className="places-wrap">
        <div className="places-cats" role="tablist">
          {CATS.map(({ key, Icon, labelKey }) => (
            <button
              key={key}
              role="tab"
              aria-selected={cat === key}
              className={`places-cat ${cat === key ? 'on' : ''}`}
              onClick={() => switchCat(key)}
            >
              <Icon size={17} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>

        <div className="places-controls">
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
          {showCountryPicker && (
            <select
              className="places-country"
              value={country}
              onChange={(e) => { setCountry(e.target.value); setNearPlace(null); }}
              aria-label={t('places.allCountries')}
            >
              <option value="">{t('places.allCountries')}</option>
              {availableCountries.map(([cc, name]) => (
                <option key={cc} value={cc}>{name}</option>
              ))}
            </select>
          )}
          {/* Where the trip starts: the flight (or the drive) is the biggest
              line in every price on this tab, and it changes with the airport,
              so the origin these figures were priced from is named here and
              switchable without a trip to the map. */}
          {showPriceChrome && onChangeOrigin && (
            <OriginPicker
              data={data}
              origin={origin}
              onChangeOrigin={onChangeOrigin}
              mode={transportMode === 'car' ? 'car' : 'plane'}
              driveHome={driveHome}
              onChangeDriveHome={onChangeDriveHome}
              fromLabel={t('places.pricedFrom')}
            />
          )}
          {/* Every price on this tab is a whole trip at the traveller's own
              stay tier, so the tier it was priced at belongs on screen beside
              the numbers, and one tap opens the panel that changes it. */}
          {showPriceChrome && onOpenLifestyle && (
            <button
              type="button"
              className="places-lifestyle"
              onClick={onOpenLifestyle}
              title={t('filter.setLifestyleTitle')}
            >
              <BedIcon size={15} />
              <span className="places-lifestyle-label">{t('filter.lifestyle')}</span>
              <b>{t(`stay.${stayTier}`)}</b>
            </button>
          )}
        </div>

        {/* A refused or failed location fix, said once, under the field that
            asked for it. Cleared as soon as anything is typed. */}
        {locErr && <p className="places-locate-err" role="status">{locErr}</p>}

        {/* Size rail. Sits above the sorts because it changes WHICH places are
            on screen, where the sorts only change their order. Hidden on the
            country index, where there are no places to size yet. */}
        {cat === 'general' && !showCountryIndex && classCounts && (
          <div className="places-classes" role="group" aria-label={t('places.classLabel')}>
            {CLASSES.map(({ key, Icon, labelKey }) => {
              const n = classCounts.get(key) || 0;
              const on = classes.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`places-class ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  disabled={!n && !on}
                  onClick={() => toggleClass(key)}
                >
                  <span className="places-class-dot" aria-hidden="true">
                    <Icon size={17} />
                  </span>
                  <span className="places-class-label">{t(labelKey)}</span>
                  <span className="places-class-n">{fmt(n)}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* How long a walk, and does it come back. Above the sorts for the
            same reason the size rail is: these change WHICH walks are on
            screen, the sorts only change their order.

            The loop chip sits at the end of the same rail rather than in a
            row of its own, because "two hours, and a loop" is one thought.
            It is hidden entirely in a country that has no loops published, so
            the chip never offers an empty list. */}
        {/* The Trips category's one question: how long have you got. 1 is a
            drawn city walk, everything above it a composed itinerary. */}
        {cat === 'trips' && (
          <div className="places-classes places-days" role="group" aria-label={t('trip.askDays')}>
            <button
              type="button"
              className={`places-class ${itinDays === null ? 'on' : ''}`}
              aria-pressed={itinDays === null}
              onClick={() => setItinDays(null)}
            >
              <span className="places-class-label">{t('trip.anyLength')}</span>
            </button>
            {TRIP_DAYS.map((n) => {
              const count = itinDayCounts.get(n) || 0;
              const on = itinDays === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`places-class ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  disabled={!count && !on}
                  onClick={() => setItinDays(on ? null : n)}
                >
                  <span className="places-class-label places-days-n">{n}</span>
                  <span className="places-class-n">{fmt(count)}</span>
                </button>
              );
            })}
          </div>
        )}

        {cat === 'trails' && !showCountryIndex && trailFacets && trailFacets.total > 0 && (
          <div className="places-classes places-bands" role="group" aria-label={t('trails.lengthLabel')}>
            {DISTANCE_BANDS.map(({ key, labelKey }) => {
              const n = trailFacets.byBand.get(key) || 0;
              const on = bands.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={`places-class ${on ? 'on' : ''}`}
                  aria-pressed={on}
                  disabled={!n && !on}
                  onClick={() => toggleBand(key)}
                >
                  <span className="places-class-label">{t(labelKey)}</span>
                  <span className="places-class-n">{fmt(n)}</span>
                </button>
              );
            })}
            {trailFacets.loops > 0 && (
              <button
                type="button"
                className={`places-class places-loopchip ${loopsOnly ? 'on' : ''}`}
                aria-pressed={loopsOnly}
                onClick={() => setLoopsOnly((v) => !v)}
              >
                <span className="places-class-dot" aria-hidden="true">
                  <LoopIcon size={16} />
                </span>
                <span className="places-class-label">{t('trails.loopsOnly')}</span>
                <span className="places-class-n">{fmt(trailFacets.loops)}</span>
              </button>
            )}
          </div>
        )}

        {cat === 'trails' && !showCountryIndex && !nearPlace && showTripRows && (
          <div className="places-sorts" role="group" aria-label={t('places.sortLabel')}>
            {TRAIL_SORTS.map(({ key, labelKey }) => (
              <button
                key={key}
                className={`places-sort ${trailSort.key === key ? 'on' : ''}`}
                onClick={() => toggleTrailSort(key)}
              >
                {t(labelKey)}
                {trailSort.key === key && (
                  <span className="places-sort-dir">{trailSort.dir === 1 ? '↑' : '↓'}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {!showCountryIndex && showPriceChrome && (
          <div className="places-sorts" role="group" aria-label={t('places.sortLabel')}>
            {SORTS.map(({ key, labelKey }) => (
              <button
                key={key}
                className={`places-sort ${!nearPlace && sort.key === key ? 'on' : ''}`}
                onClick={() => { setNearPlace(null); toggleSort(key); }}
              >
                {t(labelKey)}
                {!nearPlace && sort.key === key && (
                  <span className="places-sort-dir">{sort.dir === 1 ? '↑' : '↓'}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {nearPlace && (
          <div className="places-nearhead">
            <span className="places-nearname">{t('places.nearHead', { city: nearPlace.name })}</span>
            {nearPlace.sub && <span className="places-nearsub">{nearPlace.sub}</span>}
            <button className="places-nearclear" onClick={() => setNearPlace(null)}>
              {t('places.clearNear')}
            </button>
          </div>
        )}

        {cat === 'general' && (
          <div className="places-list">
            {showCountryIndex
              ? generalCountries.map((c) => (
                <CountryCard
                  key={c.cc}
                  cc={c.cc}
                  name={c.name}
                  sub={t('places.placesCount', { n: fmt(c.n) })}
                  img={countryCover.get(c.cc)?.img || null}
                  onPick={(cc) => setCountry(cc)}
                />
              ))
              : (
                <>
                  {destRows.slice(0, visible).map(({ p, km }) => (
                    <DestCard key={p.id} p={p} km={km} priceMode={priceMode} onSelect={onSelectDest} t={t} />
                  ))}
                  {/* Nothing matched the text, which is exactly the case where
                      the typed thing is a location rather than a destination:
                      offer the map search instead of a dead end. Not while the
                      suggestion list is open, which carries the same offer a
                      few pixels higher. */}
                  {destRows.length === 0 && (
                    <div className="places-empty">
                      <p>{t('places.emptyDest')}</p>
                      {canGeo && !geoHits && !suggOpen && (
                        <button
                          type="button"
                          className="places-empty-cta"
                          onClick={runGeoSearch}
                          disabled={geoBusy}
                        >
                          <MapPinIcon size={14} />
                          {geoBusy ? t('places.searchingAny') : t('places.searchAny', { q: term })}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            {visible < destRows.length && (
              <div ref={sentinelRef} className="places-sentinel" aria-hidden="true" style={{ height: 1 }} />
            )}
          </div>
        )}

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
                    {!q && !nearPlace && beachIndex && (
                      <p className="places-beachhead">
                        {t(beachIndex.countries.length === 1
                          ? 'beach.listHead1' : 'beach.listHead', {
                          n: fmt(beachIndex.total),
                          countries: beachIndex.countries.length,
                        })}
                      </p>
                    )}
                    {queryCountry && !nearPlace && (
                      <p className="places-beachhead">
                        {t('beach.countryHead', {
                          country: countryName(queryCountry),
                          n: fmt(beachRows.length),
                        })}
                      </p>
                    )}
                    {beachRows.slice(0, visible).map(({ b, km }) => (
                      <BeachCard
                        key={b.id}
                        beach={b}
                        km={km}
                        countryName={countryName(b.cc)}
                        onOpen={setPageBeach}
                        t={t}
                      />
                    ))}
                  </>
                )
                : (
                  <p className="places-empty">
                    {nearPlace
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
                    {!q && !nearPlace && lakeIndex && (
                      <p className="places-beachhead">
                        {t(lakeIndex.countries.length === 1
                          ? 'lake.listHead1' : 'lake.listHead', {
                          n: fmt(lakeIndex.total),
                          countries: lakeIndex.countries.length,
                        })}
                      </p>
                    )}
                    {queryLakeCountry && !nearPlace && (
                      <p className="places-beachhead">
                        {t('lake.countryHead', {
                          country: countryName(queryLakeCountry),
                          n: fmt(lakeRows.length),
                        })}
                      </p>
                    )}
                    {lakeRows.slice(0, visible).map(({ b, km }) => (
                      <LakeCard
                        key={b.id}
                        lake={b}
                        km={km}
                        countryName={countryName(b.cc)}
                        onOpen={setPageLake}
                        t={t}
                      />
                    ))}
                  </>
                )
                : (
                  <p className="places-empty">
                    {nearPlace
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

        {/* One chip, and it is the question this tab is most often opened
            with: show me the mountains I can ride to the top of. It carries
            its own count and greys itself out rather than leading to an empty
            list, the same rule the trail length chips follow. */}
        {isMountainCat && mountainRows && liftCount > 0 && (
          <div className="places-classes places-bands" role="group" aria-label={t('mtn.chipLabel')}>
            <button
              type="button"
              className={`places-class ${liftOnly ? 'on' : ''}`}
              aria-pressed={liftOnly}
              onClick={() => setLiftOnly((v) => !v)}
            >
              <span className="places-class-label">{t('mtn.chipLift')}</span>
              <span className="places-class-n">{fmt(liftCount)}</span>
            </button>
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
                    {!q && !nearPlace && mountainIndex && (
                      <p className="places-beachhead">
                        {t(mountainIndex.countries.length === 1
                          ? 'mtn.listHead1' : 'mtn.listHead', {
                          n: fmt(mountainIndex.total),
                          countries: mountainIndex.countries.length,
                        })}
                      </p>
                    )}
                    {queryMountainCountry && !nearPlace && (
                      <p className="places-beachhead">
                        {t('mtn.countryHead', {
                          country: countryName(queryMountainCountry),
                          n: fmt(mountainRows.length),
                        })}
                      </p>
                    )}
                    {mountainRows.slice(0, visible).map(({ b, km }) => (
                      <MountainCard
                        key={b.id}
                        mountain={b}
                        km={km}
                        countryName={countryName(b.cc)}
                        onOpen={setPageMountain}
                        t={t}
                        lang={lang}
                      />
                    ))}
                  </>
                )
                : (
                  <p className="places-empty">
                    {liftOnly
                      ? t('mtn.noneLift')
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

        {isItinCat && (
          <div className="places-list">
            {itinRows === null && <p className="places-empty">{'\u2026'}</p>}

            {itinRows && itinRows.length > 0 && (
              <>
                {!q && !nearPlace && (
                  <p className="places-beachhead">
                    {itinCountry
                      ? t('trip.countryHead', {
                        country: countryName(itinCountry), n: fmt(itinRows.length),
                      })
                      // The count is what is ON SCREEN, not what the wire
                      // holds: reporting the catalogue total here said "1,525
                      // trips" over a list of twenty eight.
                      : t('trip.europeHead', { n: fmt(itinRows.length) })}
                  </p>
                )}
                {itinRows.slice(0, visible).map(({ tr, km }) => (
                  <ItinCard key={tr.id} tr={tr} km={km} onOpen={setPageItin} t={t} />
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
                    sub={t('places.tripsCount', { n: fmt(c.n) })}
                    img={countryCover.get(c.cc)?.img || null}
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
                ? tripRows.slice(0, visible).map(({ c, km }) => (
                  <TripCard key={c.tr.id} card={c} km={km} onOpen={setPageCard} t={t} />
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
            onClose={() => setPageCard(null)}
            onSelectDest={(id) => { setPageCard(null); onSelectDest(id); }}
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
            countryName={countryName(pageBeach.cc)}
            onClose={() => setPageBeach(null)}
            onSelectDest={(id) => { setPageBeach(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageLake && (
        <Suspense fallback={null}>
          <LakePage
            lake={pageLake}
            countryName={countryName(pageLake.cc)}
            warmC={lakeIndex?.model?.warm_c ?? 18}
            onClose={() => setPageLake(null)}
            onSelectDest={(id) => { setPageLake(null); onSelectDest(id); }}
          />
        </Suspense>
      )}

      {pageMountain && (
        <Suspense fallback={null}>
          <MountainPage
            mountain={pageMountain}
            countryName={countryName(pageMountain.cc)}
            onClose={() => setPageMountain(null)}
            onSelectDest={(id) => { setPageMountain(null); onSelectDest(id); }}
          />
        </Suspense>
      )}
    </div>
  );
}
