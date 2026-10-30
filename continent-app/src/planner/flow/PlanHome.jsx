import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadAllJourneyCards, loadJourneyIndex, splitAround } from '../../lib/journeys.js';
import { cardPerDay } from '../../lib/tripFilters.js';
import { WEEK, cardAtLength } from '../../lib/tripLength.js';
import { useSavedJourneys, toggleSavedJourney } from '../../lib/journeySaves.js';
import { TripPlaceCard } from '../../browse/TripPlaceCard.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { Button, Chip, IconButton } from '../../components/ui/index.js';
import { countdownText } from '../trip/tripHead.js';
import {
  ArrowRightIcon, CalendarIcon, ChevronRightIcon, CloudIcon, HeartIcon, MoreIcon, PlusIcon, SparkIcon, TrashIcon,
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
function TripMore({ name, onDelete, tone = 'photo' }) {
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
      <IconButton ref={btnRef} tone={tone} label={label}
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

/** Today as YYYY-MM-DD, the device's own date. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A trip's place on the home (T903): past, upcoming (dated) or planning. */
export function tripState(trip, today = todayISO()) {
  const end = trip.end || trip.start;
  if (end && end < today) return 'past';
  if (trip.start) return 'upcoming';
  return 'planning';
}

/** "Edited 2 days ago" from a time in ms, or ''. */
function editedText(t, ms, lang) {
  if (!ms) return '';
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days < 1) return t('pf.home.editedToday');
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const text = days < 7 ? rtf.format(-days, 'day') : days < 30 ? rtf.format(-Math.round(days / 7), 'week') : rtf.format(-Math.round(days / 30), 'month');
  return t('pf.home.edited', { when: text });
}

/** The trip's cover: its photo, else its first letter on one of four colours. */
function Cover({ trip, className, sizes, ratio }) {
  if (trip.cover) return <HeroImage url={trip.cover} city={trip.name} className={className} maxWidth={720} ratio={ratio} sizes={sizes} />;
  const n = [...(trip.id || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  return <span className={`${className} pfh-initial is-c${n}`} aria-hidden="true">{(trip.name || '?').trim().charAt(0).toUpperCase()}</span>;
}

/**
 * Up next (T903, the owner's Plan home board): the nearest dated trip, else
 * the last one worked on, as one wide card: the photo with the countdown,
 * the name, the dates, nights and places, and Open trip.
 */
function UpNext({ trip, onOpen }) {
  const { t } = useI18n();
  const bcp47 = useBcp47();
  const cd = trip.start ? countdownText(t, trip.start, trip.end) : '';
  const facts = [
    whenLine(t, trip, bcp47),
    trip.nights > 0 ? t(trip.nights === 1 ? 'pf.home.nightsOne' : 'pf.home.nightsMany', { n: trip.nights }) : '',
    trip.stopCount > 0 ? t(trip.stopCount === 1 ? 'tp.places1' : 'tp.placesN', { n: trip.stopCount }) : '',
  ].filter(Boolean).join(', ');
  return (
    <a className="pfh-next" href={tabHref('trip')} onClick={door(onOpen)} aria-labelledby={`pfh-next-${trip.id}`}>
      <span className="pfh-next-media">
        <Cover trip={trip} className="pfh-next-img" ratio={[16, 9]} sizes="(min-width: 1024px) 640px, 100vw" />
        {cd && <span className="pfh-next-cd">{cd}</span>}
      </span>
      <span className="pfh-next-body">
        <span className="pfh-eyebrow">{t(trip.start ? 'pf.home.upNext' : 'pf.home.continuePlan')}</span>
        <span className="pfh-next-name" id={`pfh-next-${trip.id}`}>{trip.name}</span>
        <span className="pfh-next-facts">{facts}</span>
        <span className="pfh-next-go btn btn-primary">{t('pf.home.openTrip')}<ChevronRightIcon size={18} /></span>
      </span>
    </a>
  );
}

/** A dated trip (upcoming or past): Trips for you's card, the countdown on the photo. */
function OwnCard({ trip, onOpen, onDelete }) {
  const { t } = useI18n();
  const bcp47 = useBcp47();
  const cd = trip.start ? countdownText(t, trip.start, trip.end) : '';
  return (
    <li className="pfh-card">
      <a className="pfh-card-hit" href={tabHref('trip')} onClick={door(onOpen)}>
        <span className="pfh-card-media">
          <Cover trip={trip} className="pfh-card-img" ratio={[4, 5]} sizes="(min-width: 1024px) 260px, 46vw" />
          {cd && <span className="pfh-card-cd">{cd}</span>}
          <span className="pfh-card-over">
            <span className="pfh-card-when">{whenLine(t, trip, bcp47)}</span>
            <span className="pfh-card-name">{trip.name}</span>
          </span>
        </span>
        <span className="pfh-card-meta">
          {[trip.nights > 0 ? t(trip.nights === 1 ? 'pf.home.nightsOne' : 'pf.home.nightsMany', { n: trip.nights }) : '',
            trip.stopCount > 0 ? t(trip.stopCount === 1 ? 'tp.places1' : 'tp.placesN', { n: trip.stopCount }) : ''].filter(Boolean).join(', ')}
        </span>
      </a>
      {onDelete && <span className="pfh-card-more"><TripMore name={trip.name} onDelete={onDelete} /></span>}
    </li>
  );
}

/** A trip being planned: one row, newest first (lists suit what is managed). */
function DraftRow({ trip, onOpen, onDelete }) {
  const { t, lang } = useI18n();
  const bcp47 = useBcp47();
  const meta = [
    whenLine(t, trip, bcp47),
    trip.nights > 0 ? t(trip.nights === 1 ? 'pf.home.nightsOne' : 'pf.home.nightsMany', { n: trip.nights }) : '',
  ].filter(Boolean).join(', ');
  const edited = editedText(t, trip.updatedAt, lang);
  return (
    <li className="pfh-row">
      <a className="pfh-row-hit" href={tabHref('trip')} onClick={door(onOpen)}>
        <Cover trip={trip} className="pfh-row-img" ratio={[1, 1]} sizes="56px" />
        <span className="pfh-row-txt">
          <span className="pfh-row-name">
            {trip.name}
            {trip.account && <CloudIcon size={14} className="pfh-row-cloud" />}
          </span>
          <span className="pfh-row-meta">{meta}</span>
        </span>
        <span className="pfh-row-end">
          <Chip kind="status" tone="neutral">{t(trip.stopCount ? 'pf.home.planning' : 'pf.home.empty')}</Chip>
          {edited && <span className="pfh-row-edited">{edited}</span>}
        </span>
      </a>
      {onDelete && <TripMore name={trip.name} onDelete={onDelete} tone="plain" />}
    </li>
  );
}

/** Carta's trips in season this month, cheapest a person a day first. */
function useSeasonCards(n) {
  const [cards, setCards] = useState(null);
  useEffect(() => {
    let live = true;
    loadAllJourneyCards().then((all) => { if (live) setCards(all || []); }).catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, []);
  return useMemo(() => {
    if (!cards) return { list: [], total: 0 };
    const month = new Date().getMonth() + 1;
    const at = (c) => cardPerDay(c, WEEK) ?? Infinity;
    const week = cards.filter((c) => cardAtLength(c, WEEK));
    const list = week.filter((c) => (c.months || []).includes(month)).sort((a, b) => at(a) - at(b)).slice(0, n);
    return { list, total: week.length };
  }, [cards, n]);
}

const TABS = ['upcoming', 'planning', 'past'];

/**
 * T904: the drafts with nothing in them (no places, no dates, on this
 * device) can go in one step, asked once in place.
 */
function ClearEmpty({ trips, onDelete }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  if (!trips.length) return null;
  const n = trips.length;
  return (
    <div className="pfh-clear">
      {asking ? (
        <>
          <span>{t(n === 1 ? 'pf.home.clearAskOne' : 'pf.home.clearAsk', { n })}</span>
          <Button variant="secondary" size="sm" onClick={() => setAsking(false)}>{t('pf.cancel')}</Button>
          <Button variant="danger" size="sm" onClick={() => { setAsking(false); trips.forEach(onDelete); }}>{t('pf.home.delete')}</Button>
        </>
      ) : (
        <Button variant="quiet" size="sm" className="pfh-clear-btn" iconStart={<TrashIcon size={16} />} onClick={() => setAsking(true)}>
          {t(n === 1 ? 'pf.home.clearOne' : 'pf.home.clear', { n })}
        </Button>
      )}
    </div>
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
export function PlanHome({ titleTag = 'h1', trips = [], onStart, onOpenTrip, onDeleteTrip, onOpenTrips, onOpenKept = null, onOpenJourney = null }) {
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

  // T903 (owner, Plan home board 2026-10-30): with trips, the page is where
  // you come back to: your trips first, the slogan and the fan only greet a
  // first visit.
  const byState = useMemo(() => {
    const today = todayISO();
    const out = { upcoming: [], planning: [], past: [] };
    for (const trip of trips) out[tripState(trip, today)].push(trip);
    out.upcoming.sort((a, b) => a.start.localeCompare(b.start));
    out.past.sort((a, b) => (b.end || b.start).localeCompare(a.end || a.start));
    out.planning.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return out;
  }, [trips]);
  const [tab, setTab] = useState(() => TABS.find((k) => byState[k].length) || 'planning');
  const next = byState.upcoming[0] || byState.planning[0] || null;
  const season = useSeasonCards(2);
  const saved = useSavedJourneys();
  const savedSet = useMemo(() => new Set(saved), [saved]);
  const monthNow = new Date().getMonth() + 1;

  if (trips.length > 0) {
    const del = (trip) => (trip.account ? null : () => onDeleteTrip(trip));
    const list = byState[tab];
    return (
      <div className="pfh">
        <header className="pfh-head">
          <Title className="pf-title pfh-title" tabIndex={-1}>{t('pf.home.yourTrips')}</Title>
          <div className="pfh-acts">
            <Button variant="primary" iconStart={<PlusIcon size={18} />} onClick={onStart}>{t('pf.home.newTrip')}</Button>
            <Button variant="secondary" iconStart={<SparkIcon size={18} />} onClick={onOpenTrips}>{t('pf.home.browse')}</Button>
          </div>
        </header>

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

        {next && <UpNext trip={next} onOpen={() => onOpenTrip(next)} />}

        <div className="pfh-split">
          <section className="pfh-mine" aria-labelledby="pfh-tabs-h">
            <h2 className="sr-only" id="pfh-tabs-h">{t('pf.home.yourTrips')}</h2>
            <div className="pfh-tabs" role="tablist" aria-label={t('pf.home.yourTrips')}>
              {TABS.map((k) => (
                <Button key={k} variant="quiet" role="tab" aria-selected={tab === k} id={`pfh-tab-${k}`} aria-controls="pfh-panel"
                  className={`pfh-tab${tab === k ? ' is-on' : ''}`} onClick={() => setTab(k)}>
                  {t(`pf.home.tab.${k}`)}
                  <span className="pfh-tab-n">{byState[k].length}</span>
                </Button>
              ))}
            </div>
            <div id="pfh-panel" role="tabpanel" aria-labelledby={`pfh-tab-${tab}`}>
              {list.length === 0 ? (
                <p className="pfh-none">{t(`pf.home.none.${tab}`)}</p>
              ) : tab === 'planning' ? (
                <>
                  <ul className="pfh-rows">
                    {list.map((trip) => <DraftRow key={trip.id} trip={trip} onOpen={() => onOpenTrip(trip)} onDelete={del(trip)} />)}
                  </ul>
                  <ClearEmpty trips={list.filter((x) => !x.account && !x.stopCount && !x.start)} onDelete={onDeleteTrip} />
                </>
              ) : (
                <ul className="pfh-cards">
                  {list.map((trip) => <OwnCard key={trip.id} trip={trip} onOpen={() => onOpenTrip(trip)} onDelete={del(trip)} />)}
                </ul>
              )}
            </div>
          </section>

          {season.list.length > 0 && (
            <aside className="pfh-carta" aria-labelledby="pfh-carta-h">
              <div className="pfh-carta-head">
                <h2 className="pfh-h2" id="pfh-carta-h">{t('pf.home.cartaInSeason')}</h2>
                <Button variant="quiet" size="sm" className="pfh-all" onClick={onOpenTrips}>{t('pf.home.seeAll', { n: season.total })}</Button>
              </div>
              <div className="pfh-carta-row">
                {season.list.map((c) => (
                  <TripPlaceCard key={c.id} card={c} length={WEEK} month={monthNow} saved={savedSet.has(c.id)}
                    onToggleSave={toggleSavedJourney} onOpen={(card) => (onOpenJourney ? onOpenJourney(card.id) : onOpenTrips())} t={t} lang={lang} sizes="(min-width: 1100px) 170px, 46vw" />
                ))}
              </div>
            </aside>
          )}
        </div>
      </div>
    );
  }

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
