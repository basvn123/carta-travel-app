import React, { useMemo, useRef } from 'react';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { eur } from '../lib/format.js';
import { trailPath } from '../lib/trailShape.js';
import { srcSetFor } from '../lib/heroImage.js';
import { beachRating } from '../lib/beachStory.js';
import { lakeRating } from '../lib/lakeStory.js';
import { cycleRating } from '../lib/cycleStory.js';
import {
  tripHeadline, shapeLabel, transportLabel, seasonLabel, tripTags, cardThumb,
} from '../lib/tripStory.js';
import { mountainRating, isLiftServed, liftLabel } from '../lib/mountainStory.js';
import { trailRating, isListed } from '../lib/trailCards.js';
import { bandChip } from '../lib/regions.js';
import { RouteIcon } from '../components/Icons.jsx';
import { openShared } from '../lib/sharedElement.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { monthName } from '../lib/dates.js';
import { CardStrip } from './CardStrip.jsx';
import { PlaceCard, PlaceCardPhoto, PlaceCardNoPhoto } from './PlaceCard.jsx';
import {
  trailFilling, cycleFilling, cycleTourFilling, beachFilling, lakeFilling, mountainFilling,
} from '../lib/cardFillings.js';
import { okPhoto, firstOkImage } from '../lib/photoVeto.js';

/*
 * The outdoor layers' cards and the composed trip card (T498, split out of
 * DestinationsTab.jsx at the 1.3b merge, owner answer T484-c: cohesive
 * modules where the merge touches the file, no rewrite). One frame,
 * browse/PlaceCard.jsx, five fillings, lib/cardFillings.js.
 *
 * T700 (price plan section 5, V12): the beach, lake, mountain, walk and ride
 * cards carry no town price. A stay price stands only at or towards a
 * destination; the place page's button to its base town carries it.
 */

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

export const TripCard = React.memo(function TripCard({ card, km, onOpen, t, countryName }) {
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
  // A flying row's figure a person includes the return flight when the
  // home airport's sweep has one near the dates (T518, composeTrip); only
  // without one is it the stay and the ground, and its title says so.
  const foot = isCityDay && price ? (
    <span className="places-card-price"
      title={price.mode === 'plane' && !price.flight ? t('places.priceNoFlight') : undefined}>
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
export const CycleCard = React.memo(function CycleCard({ r, countryName, onOpen, t }) {
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
export const CycleTourCard = React.memo(function CycleTourCard({ tr, countryName, onOpen, t }) {
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

export const BeachCard = React.memo(function BeachCard({ beach, km, countryName, onOpen, t }) {
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

export const LakeCard = React.memo(function LakeCard({ lake, km, countryName, onOpen, t, month = null, warmC = 18, lang }) {
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
export const MountainCard = React.memo(function MountainCard({ mountain, km, countryName, onOpen, t }) {
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
export const ItinCard = React.memo(function ItinCard({ tr, km, onOpen, t }) {
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

