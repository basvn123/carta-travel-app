import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { tabHref } from '../../lib/urlState.js';
import { loadJourneyIndex, splitAround } from '../../lib/journeys.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { TripArt } from '../../components/TripArt.jsx';
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

/**
 * Carta's own trips as a door (T988, after Explore's folder, T964): the
 * umber band, the name, then three trip-style photographs fanned at its
 * end (T1044: the same order at every width, no arrow; the deck is the
 * sign). The deck opens a little further on hover.
 */
function CartaDoor({ fan, onOpen }) {
  const { t } = useI18n();
  const deck = (fan || []).slice(0, 3);
  return (
    <a className="pfh-door" href={tabHref('places')} onClick={door(onOpen)}>
      <span className="pfh-door-name">{t('pf.home.browse')}</span>
      <span className="pfh-door-deck" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className="pfh-door-photo" style={{ '--i': i }}>
            {deck[i] && <HeroImage url={deck[i].hero.url} city={deck[i].name} className="pfh-door-img" maxWidth={240} sizes="64px" ratio={[3, 4]} />}
          </span>
        ))}
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
 * T989: a blur with no next focus (Safari does not focus a tapped button)
 * no longer closes it, so the tap on Delete lands; a tap outside still does.
 * An account trip's ask says it leaves the account, not this device.
 */
function TripMore({ name, onDelete, tone = 'photo', account = false }) {
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
      onBlur={(e) => { if (open && e.relatedTarget && !boxRef.current?.contains(e.relatedTarget)) close(false); }}>
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
        <div className="pf-trip-pop pf-trip-ask" role="group" aria-label={t(account ? 'pf.home.deleteAskAccount' : 'pf.home.deleteAsk')}>
          <p className="pf-trip-ask-text">{t(account ? 'pf.home.deleteAskAccount' : 'pf.home.deleteAsk')}</p>
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
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
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

/** The trip's cover: its photo, else TripArt (T990) on the trip's own ground. */
function Cover({ trip, className, sizes, ratio, compact = false }) {
  if (trip.cover) return <HeroImage url={trip.cover} city={trip.name} className={className} maxWidth={720} ratio={ratio} sizes={sizes} />;
  return <TripArt seed={trip.id} compact={compact} className={`${className} pfh-art`} />;
}

/**
 * Up next (T903, the owner's Plan home board; T988 made it the page's
 * photograph): the nearest dated trip, else the last one worked on. The
 * cover fills the card and drifts slowly, the name and the dates sit on it,
 * the countdown is a chip and the round arrow says the card opens the trip.
 * A trip with no photo yet stands on TripArt (T990), its own ground.
 */
function UpNext({ trip, onOpen }) {
  const { t } = useI18n();
  const bcp47 = useBcp47();
  const cd = trip.start ? countdownText(t, trip.start, trip.end) : '';
  // T1044: the dates and, when the trip has them, its nights.
  const facts = [
    whenLine(t, trip, bcp47),
    trip.nights > 0 ? t(trip.nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: trip.nights }) : '',
  ].filter(Boolean).join(', ');
  return (
    <a className={`pfh-next${trip.cover ? '' : ' is-blank'}`} href={tabHref('trip')} onClick={door(onOpen)} aria-labelledby={`pfh-next-${trip.id}`}>
      <span className="pfh-next-media" aria-hidden="true">
        {trip.cover
          ? <HeroImage url={trip.cover} city={trip.name} className="pfh-next-img" maxWidth={1280} ratio={[16, 9]} sizes="(min-width: 1240px) 1200px, 100vw" />
          : <TripArt seed={trip.id} className="pfh-next-img" />}
      </span>
      {cd && <span className="pfh-next-cd"><CalendarIcon size={14} />{cd}</span>}
      <span className="pfh-next-body">
        <span className="pfh-next-txt">
          <span className="pfh-next-name" id={`pfh-next-${trip.id}`}>{trip.name}</span>
          <span className="pfh-next-facts">{facts}</span>
        </span>
        <span className="pfh-next-go" aria-hidden="true"><ArrowRightIcon size={20} /></span>
      </span>
    </a>
  );
}

/**
 * A dated trip (upcoming or past) as Explore's rail cards are drawn (T988):
 * the photograph with its corners and a solid chip for the countdown, the
 * name and the dates on the page under it. Nights and places stay on the
 * trip itself.
 */
function OwnCard({ trip, onOpen, onDelete }) {
  const { t } = useI18n();
  const bcp47 = useBcp47();
  const cd = trip.start ? countdownText(t, trip.start, trip.end) : '';
  return (
    <li className="pfh-card">
      <a className="pfh-card-hit" href={tabHref('trip')} onClick={door(onOpen)}>
        <span className="pfh-card-media">
          <Cover trip={trip} className="pfh-card-img" ratio={[1, 1]} sizes="(min-width: 1024px) 280px, 46vw" />
          {cd && <span className="pfh-card-cd">{cd}</span>}
        </span>
        <span className="pfh-card-name">{trip.name}</span>
        <span className="pfh-card-when">{whenLine(t, trip, bcp47)}</span>
      </a>
      {onDelete && <span className="pfh-card-more"><TripMore name={trip.name} onDelete={onDelete} account={trip.account} /></span>}
    </li>
  );
}

/** A trip being planned: one row, newest first (lists suit what is managed). */
function DraftRow({ trip, onOpen, onDelete }) {
  const { t, lang } = useI18n();
  const bcp47 = useBcp47();
  const meta = whenLine(t, trip, bcp47);
  const edited = editedText(t, trip.updatedAt, lang);
  return (
    <li className="pfh-row">
      <a className="pfh-row-hit" href={tabHref('trip')} onClick={door(onOpen)}>
        <Cover trip={trip} className="pfh-row-img" ratio={[1, 1]} sizes="56px" compact />
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
      {onDelete && <TripMore name={trip.name} onDelete={onDelete} tone="plain" account={trip.account} />}
    </li>
  );
}

const TABS = ['upcoming', 'planning', 'past'];

/**
 * T904: the drafts with nothing in them (no places, no dates, on this
 * device) can go in one step. T989: a quiet line under the list; pressed, it
 * becomes one small card that asks, with Cancel and Delete side by side.
 */
function ClearEmpty({ trips, onDelete }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);
  const cardRef = useRef(null);
  useEffect(() => { if (asking) cardRef.current?.querySelector('.pfh-clear-keep')?.focus(); }, [asking]);
  if (!trips.length) return null;
  const n = trips.length;
  if (!asking) {
    return (
      <div className="pfh-clear">
        <Button variant="quiet" size="sm" className="pfh-clear-btn" iconStart={<TrashIcon size={16} />} onClick={() => setAsking(true)}>
          {t(n === 1 ? 'pf.home.clearOne' : 'pf.home.clear', { n })}
        </Button>
      </div>
    );
  }
  return (
    <div className="pfh-clear-card" role="group" aria-labelledby="pfh-clear-q" ref={cardRef}>
      <span className="pfh-clear-icon" aria-hidden="true"><TrashIcon size={20} /></span>
      <p className="pfh-clear-q" id="pfh-clear-q">{t(n === 1 ? 'pf.home.clearAskOne' : 'pf.home.clearAsk', { n })}</p>
      <div className="pfh-clear-acts">
        <Button variant="secondary" className="pfh-clear-keep" onClick={() => setAsking(false)}>{t('pf.cancel')}</Button>
        <Button variant="danger" onClick={() => { setAsking(false); trips.forEach(onDelete); }}>{t('pf.home.clearGo')}</Button>
      </div>
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

  // T903 (owner, Plan home board 2026-10-30): with trips, the page is where
  // you come back to: your trips first, the slogan and the fan only greet a
  // first visit. T988: no in-season rail; Carta's trips are the door under
  // the head, its deck from the same fan.
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

  if (trips.length > 0) {
    const del = (trip) => () => onDeleteTrip(trip);
    // T988: a tab with no trips is not drawn, so no "No past trips yet".
    const tabs = TABS.filter((k) => byState[k].length);
    const on = tabs.includes(tab) ? tab : tabs[0];
    const list = byState[on] || [];
    return (
      <div className="pfh">
        <header className="pfh-head">
          {/* T989 (owner): no visible title; the page's name stays for screen readers. */}
          <Title className="pf-title sr-only" tabIndex={-1}>{t('pf.home.yourTrips')}</Title>
          <Button variant="quiet" className="pfh-new" onClick={onStart}
            iconStart={<span className="pfh-new-plus"><PlusIcon size={20} /></span>}>
            {t('pf.home.newTrip')}
          </Button>
          <CartaDoor fan={fan} onOpen={onOpenTrips} />
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

        <section className="pfh-mine" aria-labelledby="pfh-tabs-h">
          <h2 className="sr-only" id="pfh-tabs-h">{t('pf.home.yourTrips')}</h2>
          <div className="pfh-tabs" role="tablist" aria-label={t('pf.home.yourTrips')}>
            {tabs.map((k) => (
              <Button key={k} variant="quiet" role="tab" aria-selected={on === k} id={`pfh-tab-${k}`} aria-controls="pfh-panel"
                className={`pfh-tab${on === k ? ' is-on' : ''}`} onClick={() => setTab(k)}>
                {t(`pf.home.tab.${k}`)}
                <span className="pfh-tab-n">{byState[k].length}</span>
              </Button>
            ))}
          </div>
          <div id="pfh-panel" role="tabpanel" aria-labelledby={`pfh-tab-${on}`}>
            {on === 'planning' ? (
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
