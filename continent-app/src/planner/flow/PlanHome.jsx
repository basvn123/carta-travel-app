import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadJourneyIndex, splitAround } from '../../lib/journeys.js';
import Logo from '../../components/Logo.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { Button, Chip, IconButton } from '../../components/ui/index.js';
import {
  ArrowRightIcon, CalendarIcon, ChevronRightIcon, CloudIcon, HeartIcon, MapPinIcon, MoonIcon, MoreIcon, RouteIcon, TrashIcon,
} from '../../components/Icons.jsx';
import { useBcp47 } from './flowHooks.js';
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

/** The trip's dates, its months, or nothing yet. */
function whenLine(t, trip, bcp47) {
  const day = (iso) => new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));
  if (trip.start && trip.end) return t('pf.home.tripDates', { start: day(trip.start), end: day(trip.end) });
  if (trip.start) return day(trip.start);
  if (trip.months?.length) {
    const fmt = new Intl.DateTimeFormat(bcp47, { month: 'long' });
    return trip.months.map((m) => fmt.format(new Date(2026, m - 1, 1))).join(', ');
  }
  return t('pf.home.noDates');
}

/**
 * The trip's "More" (T809): one Delete, which asks once in place (the
 * owner asked for a confirm: a trip on this device has no Undo to hold).
 * Escape, a tap outside or tabbing out closes it; Escape returns focus.
 */
function TripMore({ name, onDelete }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const boxRef = useRef(null);
  const btnRef = useRef(null);
  const close = (refocus = true) => {
    setOpen(false);
    setAsking(false);
    if (refocus) btnRef.current?.focus();
  };
  useEffect(() => {
    if (!open) return undefined;
    boxRef.current?.querySelector(asking ? '.pf-trip-keep' : '[role="menuitem"]')?.focus();
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) close(false); };
    // Capture phase, and the key stops here: App keeps its own Escape stack.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, asking]);
  const label = t('pf.home.tripMore', { name });
  return (
    <div className="pf-trip-more" ref={boxRef}
      onBlur={(e) => { if (open && !boxRef.current?.contains(e.relatedTarget)) close(false); }}>
      <IconButton ref={btnRef} tone="photo" label={label}
        aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <MoreIcon size={18} />
      </IconButton>
      {open && !asking && (
        <div className="pf-trip-pop" role="menu" aria-label={label}>
          <Button variant="quiet" role="menuitem" className="pf-trip-item is-danger"
            iconStart={<TrashIcon size={16} />} onClick={() => setAsking(true)}>
            {t('pf.home.delete')}
          </Button>
        </div>
      )}
      {open && asking && (
        <div className="pf-trip-pop pf-trip-ask" role="group" aria-label={t('pf.home.deleteAsk')}>
          <p className="pf-trip-ask-text">{t('pf.home.deleteAsk')}</p>
          <div className="pf-trip-ask-row">
            <Button variant="secondary" size="sm" className="pf-trip-keep" onClick={() => close()}>{t('pf.cancel')}</Button>
            <Button variant="danger" size="sm" onClick={() => { close(false); onDelete(); }}>{t('pf.home.delete')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One trip on the Plan home (T809): its photo, name, dates or months, the
 * nights and stops with their icons and a status pill, the whole card one
 * link that opens it. An account trip carries a small cloud.
 */
function TripCard({ trip, onOpen, onDelete }) {
  const { t } = useI18n();
  const bcp47 = useBcp47();
  return (
    <li className="pf-trip">
      <a className="pf-trip-link" href={tabHref('trip')} onClick={door(onOpen)}>
        <span className="pf-trip-media">
          {trip.cover
            ? <HeroImage url={trip.cover} city={trip.name} className="pf-trip-img" maxWidth={500} ratio={[3, 2]}
              sizes="(min-width: 1024px) 320px, 64px" />
            : <span className="pf-trip-blank" aria-hidden="true"><RouteIcon size={24} /></span>}
        </span>
        <span className="pf-trip-body">
          <span className="pf-trip-name">
            <span className="pf-trip-name-text">{trip.name}</span>
            {trip.account && (
              <span className="pf-trip-cloud" role="img" aria-label={t('pf.home.inAccount')} title={t('pf.home.inAccount')}>
                <CloudIcon size={16} />
              </span>
            )}
          </span>
          <span className="pf-trip-when">{whenLine(t, trip, bcp47)}</span>
          <span className="pf-trip-facts">
            {trip.nights > 0 && (
              <span className="pf-trip-fact">
                <MoonIcon size={16} />
                {t(trip.nights === 1 ? 'pf.home.nightsOne' : 'pf.home.nightsMany', { n: trip.nights })}
              </span>
            )}
            {trip.stopCount > 0 && (
              <span className="pf-trip-fact">
                <MapPinIcon size={16} />
                {t(trip.stopCount === 1 ? 'pf.home.stopsOne' : 'pf.home.stopsMany', { n: trip.stopCount })}
              </span>
            )}
            <Chip kind="status" tone={trip.status === 'planned' ? 'positive' : 'neutral'} className="pf-trip-status">
              {t(trip.status === 'planned' ? 'pf.home.planned' : 'pf.home.planning')}
            </Chip>
          </span>
        </span>
        <span className="pf-trip-go" aria-hidden="true"><ChevronRightIcon size={20} /></span>
      </a>
      {onDelete && <TripMore name={trip.name} onDelete={onDelete} />}
    </li>
  );
}

/**
 * PlanHome (T743 to T747, T809), the Plan place's first page, every time
 * the Plan door is pressed from another place. The headline and the two
 * actions that matter, Start planning and Carta's own trips; under them
 * (from 1024 px: beside them) Carta's own recommended trips as a fan of
 * photographs with one button. With trips on this device (or in the
 * account) "Your trips" lists them: rows under the actions on a phone, a
 * grid of cards under the whole opening from 1024 px, and the page then
 * scrolls. With none the page stays the one screen it was.
 *
 *   trips                [{ id, name, cover, start, end, months, nights,
 *                          stopCount, status, account }], ready to draw
 *   onStart()            a new trip: the trip-kind sheet
 *   onOpenTrip(trip)     that trip, in the trip planner
 *   onDeleteTrip(trip)   a device trip, after its confirm
 *   onOpenTrips()        Carta's own trips (T752)
 *   onOpenKept()         My trips on the kept trips (T807)
 *
 * A trip kept from the trip finder whose flight got cheaper since (T807)
 * shows as one line under the actions, the biggest drop only.
 */
export function PlanHome({ titleTag = 'h1', trips = [], onStart, onOpenTrip, onDeleteTrip, onOpenTrips, onOpenKept = null }) {
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
    <div className={`pf-open${trips.length ? ' has-trips' : ''}`}>
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

      {trips.length > 0 && (
        <section className="pf-trips" aria-labelledby="pf-trips-title">
          <h2 className="pf-trips-title" id="pf-trips-title">{t('pf.home.yourTrips')}</h2>
          <ul className="pf-trips-list">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} onOpen={() => onOpenTrip(trip)}
                onDelete={trip.account ? null : () => onDeleteTrip(trip)} />
            ))}
          </ul>
        </section>
      )}

      {fan !== null && (
        <div className="pf-open-stage">
          <TripCollection fan={fan} onOpen={onOpenTrips} />
        </div>
      )}
    </div>
  );
}
