import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadJourneyIndex, splitAround } from '../../lib/journeys.js';
import Logo from '../../components/Logo.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { Button } from '../../components/ui/index.js';
import { ArrowRightIcon, CalendarIcon, ChevronRightIcon, HeartIcon, RouteIcon } from '../../components/Icons.jsx';
import { useKept, useKeptDrops } from '../../lib/recommend/keptStore.js';
import { formatMoney } from '../../lib/money.js';
import { loadFlightFile } from '../../lib/flights/flightData.js';

/** A plain click stays in the app; a modified click opens the address. */
function door(go) {
  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}

// The style at the centre of the fan, by month: what a week in Europe is for
// then. The others are the library's next styles with a photograph.
const SEASON = {
  1: 'winter-sports', 2: 'winter-sports', 3: 'city', 4: 'hiking', 5: 'hiking', 6: 'hiking',
  7: 'water-sports', 8: 'water-sports', 9: 'hiking', 10: 'hiking', 11: 'city', 12: 'winter-sports',
};
const FAN = ['city', 'water-sports', 'cycling', 'cozy-towns', 'hiking', 'culinary', 'rail'];
// Places in the fan, centre first: offset step and stacking order.
const SLOTS = [0, -1, 1, -2, 2];

/** Five style photographs for the fan, the month's style in the middle. */
function loadFan(month) {
  return loadJourneyIndex().then((ix) => {
    const bySlug = new Map((ix?.types || []).filter((tp) => tp.hero?.url).map((tp) => [tp.slug, tp]));
    const order = [...new Set([SEASON[month], ...FAN, ...bySlug.keys()])].filter((s) => bySlug.has(s)).slice(0, SLOTS.length);
    return order.length >= 3 ? order.map((s) => bySlug.get(s)) : null;
  }).catch(() => null);
}

/**
 * Carta's own recommended trips: a fan of trip-style photographs, Carta's
 * mark, one title and one button, all one link to the planned trips. The fan
 * opens once when the page arrives and spreads a little on hover.
 */
function TripCollection({ fan, onOpen }) {
  const { t } = useI18n();
  return (
    <a className="pf-coll" href={tabHref('places')} onClick={door(onOpen)}>
      <span className="pf-coll-fan" aria-hidden="true">
        {(fan || SLOTS.map(() => null)).map((tp, i) => (
          <span key={tp?.slug || i} className={`pf-coll-photo${tp ? '' : ' is-wait'}`}
            style={{ '--k': SLOTS[i], '--z': SLOTS.length - Math.abs(SLOTS[i]), '--i': i }}>
            {tp && <HeroImage url={tp.hero.url} city={tp.name} className="pf-coll-img" maxWidth={500}
              sizes="(max-width: 768px) 30vw, 200px" ratio={[3, 4]} />}
          </span>
        ))}
      </span>
      <span className="pf-coll-foot">
        <Logo size={32} className="pf-coll-mark" />
        <span className="pf-coll-title">{t('pf.promo.title')}</span>
        <span className="pf-coll-go">
          {t('pf.promo.link')}
          <ArrowRightIcon size={16} />
        </span>
      </span>
    </a>
  );
}

/**
 * PlanHome (T743 to T747), the Plan place with nothing open: one screen, no
 * scroll. The headline and the two actions that matter, Start planning and
 * Carta's own trips; under them (from 1024 px: beside them) Carta's own
 * recommended trips as a fan of photographs with one button.
 *
 *   onStart()            the trip-kind sheet
 *   onContinue()         the trip in progress, in the trip planner
 *   onOpenTrips()        Carta's own trips (T752)
 *   onOpenKept()         My trips on the kept trips (T807)
 *
 * A trip kept from the trip finder whose flight got cheaper since (T807)
 * shows as one line under the actions, the biggest drop only.
 */
export function PlanHome({ titleTag = 'h1', hasTrip, tripName, onStart, onContinue, onOpenTrips, onOpenKept = null }) {
  const { t, lang } = useI18n();
  const kept = useKept();
  const drops = useKeptDrops(kept, loadFlightFile);
  const dropped = kept.filter((r) => drops[r.id]).sort((a, b) => drops[b.id].perPerson - drops[a.id].perPerson)[0] || null;
  const Title = titleTag;
  const [fan, setFan] = useState(undefined);

  useEffect(() => {
    let live = true;
    loadFan(new Date().getMonth() + 1).then((v) => { if (live) setFan(v); });
    return () => { live = false; };
  }, []);

  const accent = t('pf.home.titleAccent');
  const [lead, , tail] = splitAround(t, 'pf.home.title', { accent }, 'accent');

  return (
    <div className="pf-open">
      <div className="pf-open-text">
        <Title className="pf-title pf-open-title" tabIndex={-1}>
          {lead}<span className="pf-open-accent">{accent}</span>{tail}
        </Title>
        <div className="pf-open-actions">
          <Button variant="primary" className="pf-open-start" iconEnd={<ArrowRightIcon size={20} />} onClick={onStart}>
            {t('pf.home.start')}
          </Button>
          <Button variant="secondary" className="pf-open-browse" iconStart={<CalendarIcon size={20} />}
            onClick={onOpenTrips}>
            {t('pf.home.browse')}
          </Button>
        </div>
        {hasTrip && (
          <a className="pf-open-resume" href={tabHref('trip')} onClick={door(onContinue)}>
            <span className="pf-open-resume-icon" aria-hidden="true"><RouteIcon size={18} /></span>
            <span className="pf-open-resume-text">
              <span className="pf-open-resume-label">{t('pf.home.continuePlan')}</span>
              <span className="pf-open-resume-name">{tripName || t('pf.home.yourTrip')}</span>
            </span>
            <ChevronRightIcon size={18} />
          </a>
        )}
        {dropped && onOpenKept && (
          <a className="pf-open-resume pf-open-drop" href={tabHref('trips')} onClick={door(onOpenKept)}>
            <span className="pf-open-resume-icon" aria-hidden="true"><HeartIcon size={18} /></span>
            <span className="pf-open-resume-text">
              <span className="pf-open-resume-label">{t('pf.home.cheaper')}</span>
              <span className="pf-open-resume-name">
                {t('pf.home.cheaperBy', { name: dropped.name || dropped.country, price: formatMoney(drops[dropped.id].perPerson, { locale: lang }) })}
              </span>
            </span>
            <ChevronRightIcon size={18} />
          </a>
        )}
      </div>

      {fan !== null && (
        <div className="pf-open-stage">
          <TripCollection fan={fan} onOpen={onOpenTrips} />
        </div>
      )}
    </div>
  );
}
