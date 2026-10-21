import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/items.css';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { usePageArrival } from '../hooks/usePageArrival.js';
import {
  loadJourney, typeLabel, diffLabel, boldSegments, riskText, minutesText,
  hookLine, loadAllJourneyCards, journeyExits, journeyHash, journeyShareUrl,
  tripHighlights, tripGallery, tripPhoto,
} from '../lib/journeys.js';
import { stripDashes, safeUrl } from '../lib/format.js';
import { keyFactCells, capFirst } from '../lib/detailSkeleton.js';
import { weekStats } from '../lib/dayStats.js';
import { haversineKm } from '../lib/nearby.js';
import { SHORT, WEEK, pageLength, readTripLength, tripLengths, writeTripLength } from '../lib/tripLength.js';
import { bookingOrder, bookingSource } from '../lib/bookingOrder.js';
import { packCells, resolvePackCell } from '../lib/packGrid.js';
import { railAlternative } from '../lib/railAlternative.js';
import { parseGateway } from '../lib/gateway.js';
import { formatMoney } from '../lib/money.js';
import { Button, Chip, Money } from '../components/ui/index.js';
import { InfoDot } from '../components/InfoDot.jsx';
import { MonthStrip } from '../components/MonthStrip.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { PageBar } from './PageBar.jsx';
import { SectionRail } from './SectionRail.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { KeyFacts } from './KeyFacts.jsx';
import { Track } from './Track.jsx';
import { ItemHead, HighlightCard, AlternativeCard, SourcesLine } from './ItemParts.jsx';
import { TripPriceCard, TripLengthChoice } from './TripPriceCard.jsx';
import { WeekClimb, DayCard } from './TripWeek.jsx';
import { BookingOrder } from './BookingOrder.jsx';
import { PackGrid } from './PackGrid.jsx';
import { useItemPdf } from '../hooks/useItemPdf.js';
import {
  AlertIcon, CalendarIcon, CarIcon, ChevronRightIcon, CloudIcon,
  FamilyIcon, FriendsIcon, HeartIcon, InfoIcon, PiggyIcon, PlugIcon, ShieldIcon, TicketIcon,
  TrainIcon, BulbIcon, LuggageIcon,
} from '../components/Icons.jsx';

const TripDayMap = React.lazy(() => import('./TripDayMap.jsx'));

/**
 * The trip page (T431, rebuilt on the item pages' system of T430; owner
 * decisions of 2026-10-15 in carta-design "Detail page grammar").
 *
 * Show first what makes the traveller want to go, then what decides it:
 *
 *   gallery       every photograph the trip carries, named and credited
 *   head          the full title, where, the style, the difficulty with a
 *                 dot that explains it with this week's own hours and climbs,
 *                 and one line that sells the week (lib/journeys.js hookLine)
 *   fact band     days, distance, climb, high point, the beds, the start
 *   Why this trip the trip's highlights as photo cards, or its named places
 *   price card    the week at the traveller's choices (TripPriceCard), a
 *                 sticky side column from 1024 px
 *   Is this week for you   the months, who it suits, the car, children
 *   Not quite right?       easier, cheaper or nearby weeks as photo cards
 *   the week      the climb chart, the day map, the day cards with tonight
 *   getting there the gateways as rows, the train instead, the start town's
 *                 day prices only when the trip starts within 30 km of it
 *   before you go the risks first, then good to know, the tips, the booking
 *                 order and the packing grid, as cards that swipe
 *   one line of sources
 *
 * The page keeps its address (#journey=<id>, pushed so Back closes it), its
 * save and share, and the length choice shared with the list.
 */

const START_KM = 30;
// The styles whose days are walked, run, ridden or skied.
const OUTDOOR = new Set(['hiking', 'trail-running', 'nature-escape', 'cycling', 'pilgrim', 'winter-sports']);

/** The rail's stops: the section ids in page order and their labels. */
const RAIL = [
  ['why', 'sec-why', 'journey.railWhy'],
  ['budget', 'sec-budget', 'journey.railPrice'],
  ['fit', 'sec-fit', 'journey.railForYou'],
  ['itin', 'sec-itin', 'journey.railWeek'],
  ['ends', 'sec-ends', 'detail.gettingThere'],
  ['prep', 'sec-prep', 'go.head'],
];

// logistics slot -> label key and icon, in reading order.
const LOG_SLOTS = [
  ['transportRules', 'journey.logTransport', TicketIcon],
  ['money', 'journey.logMoney', PiggyIcon],
  ['connectivity', 'journey.logConnectivity', PlugIcon],
  ['permits', 'journey.logPermits', ShieldIcon],
  ['weather', 'journey.logWeather', CloudIcon],
  ['health', 'journey.logHealth', HeartIcon],
  ['emergency', 'journey.logEmergency', AlertIcon],
];

/** Authored prose with its **bold** honoured and no dashes, never as HTML. */
function Prose({ text, className = 'tprose' }) {
  if (!text) return null;
  return (
    <p className={className}>
      {boldSegments(stripDashes(String(text))).map((seg, i) => (seg.bold
        ? <b key={i}>{seg.text}</b>
        : <React.Fragment key={i}>{seg.text}</React.Fragment>))}
    </p>
  );
}

/** One card of a before-you-go track: an icon, a short title and the words,
 *  three lines until "More" opens the rest. */
function GoCard({ icon = InfoIcon, title, text, tone = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const long = String(text || '').length > 150;
  return (
    <article className={`gocard${tone ? ` is-${tone}` : ''}`}>
      <span className="gocard-icon" aria-hidden="true">{React.createElement(icon || InfoIcon, { size: 20 })}</span>
      {title && <h3 className="gocard-title">{title}</h3>}
      <div className={`gocard-text${long && !open ? ' is-clamped' : ''}`}><Prose text={text} className="tprose" /></div>
      {long && (
        <Button variant="quiet" size="sm" className="gocard-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t('detail.showLess') : t('item.railMore')}
        </Button>
      )}
    </article>
  );
}

/** The difficulty as the five squares and the word, with a dot that says
 *  what it means for this week: the hours a day, the hardest climb, the high
 *  point and the writer's own note. */
function DifficultyChip({ profile, stats }) {
  const { t, lang } = useI18n();
  const level = Math.max(0, Math.min(5, Math.round(Number(profile?.difficulty) || 0)));
  if (!level || !profile?.difficultyLabel) return null;
  const word = diffLabel(profile.difficultyLabel, t);
  const n = (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });
  const note = String(profile.difficultyNote || '').replace(/^\s*\d\s*\/\s*5\s*[,.:;-]?\s*/, '').trim();
  const rows = [
    stats?.hoursTypical != null && t('journey.diffHours', { time: minutesText(Math.round(stats.hoursTypical * 60)) }),
    stats?.biggest && t('journey.diffClimb', { n: stats.biggest.day, m: n(stats.biggest.up) }),
    stats?.high != null && t('journey.diffHigh', { m: n(stats.high) }),
  ].filter(Boolean);
  return (
    <span className="tdiff">
      <span className="tdiff-squares" role="img" aria-label={t('journey.diffMeter', { n: level })}>
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`tdiff-sq${i <= level ? ' is-on' : ''}`} />)}
      </span>
      <span className="tdiff-word">{word}</span>
      <InfoDot title={t('journey.diffWhatTitle', { word })}>
        <ul className="tdiff-list">
          <li>{t(`journey.diffScale${level}`)}</li>
          {rows.map((r) => <li key={r}>{r}</li>)}
        </ul>
        {note && <Prose text={note} className="infodot-text" />}
      </InfoDot>
    </span>
  );
}

/** Still blocks at the final size of the page head (rule "Loading"). */
function PageSkeleton({ t }) {
  return (
    <div className="ipage-wrap tskel" role="status" aria-busy="true">
      <span className="sr-only">{t('journey.loadingWeek')}</span>
      <span className="tskel-photo" aria-hidden="true" />
      <span className="tskel-line is-title" aria-hidden="true" />
      <span className="tskel-line" aria-hidden="true" />
    </div>
  );
}

export function JourneyPage({
  id, gatewayDest, railFrom = null, onClose, onSelectDest, onOpenJourney,
  // stayTier, stayTiers and onChangeStayTier are still passed by the host;
  // the price card prices the trip's own bed range instead (T430 critique).
  fav = false, onFav = null,
}) {
  const { t, lang } = useI18n();
  // undefined = loading, null = not published, 'failed' = the load failed.
  const [trip, setTrip] = useState(undefined);
  const [tries, setTries] = useState(0);
  const scrollEl = useRef(null);
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const headEl = useRef(null);
  const galleryEl = useRef(null);
  const [titleGone, setTitleGone] = useState(false);
  const [library, setLibrary] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selDay, setSelDay] = useState(1);

  useEffect(() => {
    let live = true;
    setTrip(undefined);
    setSelDay(1);
    loadJourney(id)
      .then((row) => { if (live) setTrip(row); })
      .catch(() => { if (live) setTrip('failed'); });
    return () => { live = false; };
  }, [id, tries]);

  // The week's address (rule "Navigation", T376-e): opening the page pushes
  // one history entry carrying #journey=<id>, so the browser Back closes it;
  // a jump to another week replaces it.
  const pushed = useRef(false);
  const afterPop = useRef(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = `${window.location.pathname}${window.location.search}${journeyHash(id)}`;
    try {
      if (!pushed.current) {
        window.history.pushState({ journey: id }, '', url);
        pushed.current = true;
      } else {
        window.history.replaceState({ journey: id }, '', url);
      }
    } catch { /* the page still works; only the address bar stays put */ }
  }, [id]);
  useEffect(() => {
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      onClose();
      const go = afterPop.current;
      afterPop.current = null;
      if (go) go();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onClose]);
  const close = useCallback(() => {
    if (pushed.current) {
      try { window.history.back(); return; } catch { /* fall through */ }
    }
    onClose();
  }, [onClose]);
  // Leaving for another surface goes back through the entry the page pushed
  // first, so no stale entry is left (row T387-g).
  const leaveTo = useCallback((go) => {
    if (pushed.current) {
      afterPop.current = go;
      try { window.history.back(); return; } catch { afterPop.current = null; }
    }
    go();
  }, []);

  // Arrival focus follows the one page rule (hooks/usePageArrival.js, rule
  // "Navigation", T474). The trip arrives after the trap focused the bar on
  // the loading view, so the hook moves focus to its title once it is there.
  const readyId = trip && trip !== 'failed' ? trip.id : null;
  const arrivalRef = usePageArrival(pageRef, readyId);
  useFocusTrap(pageRef, close, { initialFocusRef: arrivalRef });
  useEffect(() => { scrollEl.current?.scrollTo?.(0, 0); }, [id]);

  const tripReady = trip && trip !== 'failed' ? trip : null;
  const [railReady, setRailReady] = useState(null);
  useEffect(() => { setRailReady(tripReady ? tripReady.id : null); }, [tripReady]);

  useEffect(() => {
    const el = headEl.current;
    const root = scrollEl.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [tripReady?.id]);

  useEffect(() => {
    let live = true;
    loadAllJourneyCards().then((rows) => { if (live) setLibrary(rows); });
    return () => { live = false; };
  }, []);

  // Trip length (T101): the whole trip or its short version, remembered per
  // viewer and shared with the list (lib/tripLength.js).
  const [length, setLength] = useState(() => pageLength(readTripLength()));
  const pickLength = (next) => { setLength(next); writeTripLength(next); setSelDay(1); };
  const lengths = useMemo(() => (tripReady ? tripLengths(tripReady) : null), [tripReady]);
  const isShort = length === SHORT && !!lengths && lengths.short.days < lengths.week.days;
  const view = lengths ? (isShort ? lengths.short : lengths.week) : null;
  const viewTrip = useMemo(() => {
    if (!tripReady || !view || !isShort) return tripReady;
    return {
      ...tripReady,
      durationDays: view.days,
      budget: view.budget,
      itinerary: view.indexes.map((at, k) => ({ ...tripReady.itinerary[at], day: k + 1 })),
    };
  }, [tripReady, view, isShort]);
  const viewDays = view?.days || tripReady?.durationDays || 7;

  const stats = useMemo(() => weekStats(viewTrip), [viewTrip]);
  const hook = useMemo(() => hookLine(tripReady), [tripReady]);
  // The hook is the first highlight's line when the trip has highlights, so
  // Why this trip starts at the second and never says it twice.
  const highlights = useMemo(() => {
    const all = tripHighlights(tripReady);
    return hook?.source === 'highlight' && all.length > 2 ? all.slice(1) : all;
  }, [tripReady, hook]);
  const gallery = useMemo(() => tripGallery(tripReady), [tripReady]);
  const rail = useMemo(() => railAlternative(railFrom, tripReady), [railFrom, tripReady]);
  const railItems = useMemo(() => RAIL.map(([key, sid, label]) => ({ key, id: sid, label: t(label) })), [t]);
  const { onPdf: download, pdfBusy } = useItemPdf('trip', tripReady, { viewTrip, stats });

  const exits = useMemo(() => {
    if (!tripReady || !library?.length) return [];
    const me = library.find((c) => c.id === tripReady.id);
    return journeyExits(me || tripReady, library);
  }, [tripReady, library]);

  const onShare = async () => {
    const url = journeyShareUrl(tripReady?.id || id);
    try {
      if (navigator.share) { await navigator.share({ title: tripReady?.title || id, url }); return; }
    } catch { return; /* the traveller closed the share sheet */ }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { /* no clipboard: the address bar carries the link */ }
  };

  const name = tripReady?.title || '';
  const bar = (label) => (
    <PageBar
      t={t}
      backLabel={label}
      onBack={close}
      backRef={backRef}
      name={name}
      nameOn={titleGone}
      fav={fav}
      onFav={tripReady ? onFav : null}
      onShare={tripReady ? onShare : null}
      shareLabel={t('journey.shareLink')}
      copied={copied}
      copiedLabel={t('dest.linkCopied')}
    />
  );
  const shell = (label, body) => (
    <div className="tpage dsk-page ipage jpage" role="dialog" aria-modal="true" aria-label={label} ref={pageRef}
      data-testid="journey-page">
      {bar(label)}
      <div className="tpage-scroll" ref={scrollEl}>{body}</div>
    </div>
  );

  if (trip === undefined) return shell(t('journey.backStyles'), <PageSkeleton t={t} />);
  if (trip === 'failed') {
    return shell(t('journey.backStyles'), (
      <div className="ipage-wrap tpage-pad">
        <ErrorBlock message={t('journey.pageFailed')} onRetry={() => setTries((n) => n + 1)} retryLabel={t('layer.retry')} />
      </div>
    ));
  }
  if (!trip) {
    return shell(t('journey.backStyles'), (
      <div className="places-empty empty-act">
        <p>{t('journey.gone')}</p>
        <Button variant="secondary" onClick={close}>{t('empty.trips')}</Button>
      </div>
    ));
  }

  const n1 = (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });
  const where = [trip.subRegion, ...(trip.countries?.length ? trip.countries.map((c) => c.name) : [trip.country])]
    .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  const stays = trip.accommodationStrategy || [];
  const bedWord = stays[0]?.style ? capFirst(stripDashes(stays[0].style)) : '';
  const firstPlace = (trip.dayPlaces || [])[0]?.name || null;

  // The fact band: what the week asks of you and where it starts. Distance
  // and climb are effort on a walking or riding week and the length of the
  // line on a rail journey; on a beach, island, city or hostel week they are
  // bus and ferry kilometres, which say nothing about the week, so they hide.
  const moving = OUTDOOR.has(trip.tripTypeSlug) || trip.tripTypeSlug === 'rail';
  const climbing = OUTDOOR.has(trip.tripTypeSlug);
  const facts = keyFactCells([
    { key: 'days', label: t('journey.fDays'), value: t('journey.nDays', { n: viewDays }) },
    { key: 'km', label: t('trails.factDistance'), value: moving && stats.km != null ? `${n1(Math.round(stats.km))} km` : '' },
    { key: 'climb', label: t('journey.fClimb'), value: climbing && stats.up != null && stats.up > 0 ? `${n1(Math.round(stats.up))} m` : '' },
    { key: 'high', label: t('trails.factHigh'), value: climbing && stats.high != null ? `${n1(stats.high)} m` : '' },
    { key: 'sleep', label: t('journey.fSleep'), value: bedWord },
    { key: 'start', label: t('journey.fStart'), value: firstPlace || '' },
  ], t);

  // Getting there: the gateways as rows.
  const gateRows = Array.isArray(trip.gateways) && trip.gateways.length
    ? trip.gateways
    : parseGateway(trip.gatewayAirport).rows.map((r) => ({ ...r, transferMin: null }));
  const startPoint = (trip.dayPlaces || [])[0] || (trip.coordinates?.precision === 'source' || trip.coordinates?.precision === 'city' ? trip.coordinates : null);
  const townNear = gatewayDest && startPoint && Number.isFinite(gatewayDest.lat) && Number.isFinite(startPoint.lat)
    && haversineKm(startPoint.lat, startPoint.lon, gatewayDest.lat, gatewayDest.lon) <= START_KM;

  // Is this week for you: the months, then who it suits, the car, children.
  const profile = trip.profile || {};
  const best = trip.bestPeriod || {};
  const fitRows = [
    trip.typeSpecific?.audience && { key: 'suits', icon: FriendsIcon, text: t('journey.fitSuits', { who: stripDashes(trip.typeSpecific.audience) }) },
    profile.carRequired === true && { key: 'car', icon: CarIcon, text: t('journey.fitCarYes') },
    profile.carRequired === false && { key: 'car', icon: TrainIcon, text: t('journey.fitCarNo') },
    profile.familyFriendly === true && { key: 'kids', icon: FamilyIcon, text: t('journey.fitKids') },
    profile.familyFriendly === false && { key: 'kids', icon: FamilyIcon, text: t('journey.fitNoKids') },
    profile.crowdLevel && { key: 'crowd', icon: FriendsIcon, text: `${t('journey.fCrowds')}: ${t(`journey.crowd${profile.crowdLevel}`).toLocaleLowerCase(lang)}` },
  ].filter(Boolean);

  // Before you go: the risks first (never folded away), then good to know,
  // the tips, the booking order and the packing grid.
  const risks = (trip.whatCouldGoWrong || []).map((item, i) => ({
    key: `risk-${i}`, text: riskText(item, (text) => t('journey.wrongDo', { text })),
  }));
  const bookSource = bookingSource(trip);
  const bookSteps = bookSource ? bookingOrder(bookSource).steps.length > 0 : false;
  const logRows = LOG_SLOTS
    .map(([slot, key, icon]) => (trip.logistics?.[slot] ? { key: slot, title: t(key), text: trip.logistics[slot], icon } : null))
    .filter(Boolean)
    .concat((trip.logistics?.other || []).filter((r) => r?.text)
      .map((r, i) => ({ key: `other-${i}`, title: r.label || '', text: r.text, icon: InfoIcon })));
  const tips = (trip.proTips || []).map((text, i) => ({ key: `tip-${i}`, text }));

  const sources = [
    ...(Array.isArray(trip.sources) ? trip.sources : [])
      .map((s) => (typeof s === 'string' ? { label: s.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], href: safeUrl(s) } : (s?.url ? { label: s.title || s.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], href: safeUrl(s.url) } : null)))
      .filter(Boolean).slice(0, 6),
    { label: 'Wikimedia Commons', href: 'https://commons.wikimedia.org' },
  ];

  // The booklet (lib/tripPdf.js) prints what this page shows, in its order
  // and its words; the price card adds its own figures at the tap.
  const n0 = (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });
  const dayFacts = (st) => [
    st?.km != null ? `${n0(st.km)} km` : '',
    st?.up ? t('journey.chartUp', { m: n0(st.up) }) : '',
    st?.down ? t('journey.chartDown', { m: n0(st.down) }) : '',
    st?.high != null ? t('journey.chartHigh', { m: n0(st.high) }) : '',
    st?.minutes != null ? minutesText(st.minutes) : '',
  ].filter(Boolean).join(', ');
  const pdfModel = (price) => ({
    name: trip.title,
    where,
    tags: [typeLabel(trip.tripTypeSlug, t, trip.tripType), profile.difficultyLabel ? diffLabel(profile.difficultyLabel, t) : ''].filter(Boolean).join(', '),
    hook: hook ? (hook.built ? t('journey.hookBuilt', hook.built) : hook.line) : '',
    photos: gallery,
    facts: facts.map((c) => ({ label: c.label, value: c.value })),
    why: highlights.map((h) => ({ title: h.title, line: h.line })),
    price,
    fit: [
      best.months?.length ? `${t('journey.fBest')}: ${best.months.map((mo) => new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2026, mo - 1, 1))).join(', ')}` : '',
      ...fitRows.map((r) => r.text),
    ].filter(Boolean),
    days: viewTrip.itinerary.map((d, k) => {
      const stay = stays.find((x) => x.rank === d.sleepRef) || null;
      return {
        n: d.day,
        title: d.title,
        facts: dayFacts(stats.days[k]),
        tonight: [d.sleep, stay?.style].filter(Boolean).join(', '),
        photo: tripPhoto(d.photo),
        parts: [['morning', d.morning], ['afternoon', d.afternoon], ['evening', d.evening]]
          .filter(([, x]) => x).map(([when, x]) => ({ when: t(`journey.${when}`), text: x })),
      };
    }),
    gateways: [
      ...gateRows.slice(0, 3).map((g) => [g.name, g.code].filter(Boolean).join(', ')
        + (Number.isFinite(g.transferMin) && g.transferTo ? `: ${t('journey.gatewayTransfer', { time: minutesText(g.transferMin), place: g.transferTo })}` : '')),
      trip.logistics?.gettingThere || '',
    ].filter(Boolean),
    book: bookSteps ? bookingOrder(bookSource).steps.map((x) => x.text) : [],
    risks: risks.map((r) => ({ text: r.text })),
    good: logRows.map((r) => ({ title: r.title, text: r.text })),
    tips: tips.map((r) => ({ text: r.text })),
    pack: packCells(trip).map((c) => resolvePackCell(c, t, lang).label).filter(Boolean),
    url: journeyShareUrl(trip.id),
  });

  const dayMap = (trip.dayPlaces || []).length > 0 && !isShort;
  const outdoor = OUTDOOR.has(trip.tripTypeSlug);
  const dayIndex = Math.max(0, viewTrip.itinerary.findIndex((d) => d.day === selDay));

  return (
    <div className="tpage dsk-page ipage jpage" role="dialog" aria-modal="true" aria-label={trip.title} ref={pageRef}
      data-testid="journey-page" data-sample={trip.sample ? 'true' : undefined}>
      {bar(typeLabel(trip.tripTypeSlug, t, trip.tripType))}

      <div className="tpage-scroll" ref={scrollEl}>
        <SectionRail items={railItems} scrollRef={scrollEl} heroRef={galleryEl} ready={railReady}
          ariaLabel={t('journey.railAria')} />
        <div className="dsk ipage-wrap">
          <div className="ipage-gallery" data-slot="hero" ref={galleryEl}>
            <PhotoGallery photos={gallery} label={trip.title} claimKey={trip.id}
              fallback={{ city: trip.title, iso2: trip.countryCode }} />
          </div>

          <div className="dsk-grid ipage-grid has-side jpage-grid">
            <header className="dsk-head ipage-head" data-slot="head" ref={headEl}>
              <ItemHead
                title={trip.title}
                iso2={trip.countryCode}
                where={where}
                chips={(
                  <>
                    <Chip kind="status" className="tstyle-chip">{typeLabel(trip.tripTypeSlug, t, trip.tripType)}</Chip>
                    <DifficultyChip profile={profile} stats={stats} />
                  </>
                )}
              />
              {hook && (
                <p className="dsk-hook ipage-hook" data-slot="hook">
                  {hook.built ? t('journey.hookBuilt', hook.built) : stripDashes(hook.line)}
                </p>
              )}
            </header>

            <KeyFacts cells={facts} />

            {highlights.length > 0 && (
              <section className="ipage-why" id="sec-why" data-slot="why" aria-labelledby="jwhy-h">
                {highlights.some((h) => h.photo) ? (
                  <Track title={t('journey.whyTrip')} headingId="jwhy-h" size="third">
                    {highlights.map((h) => (
                      <HighlightCard key={h.key} photo={tripPhoto(h.photo)} title={h.title} line={h.line}
                        meta={h.day ? t('journey.dayN', { n: h.day }) : ''} iso2={trip.countryCode} />
                    ))}
                  </Track>
                ) : (
                  <>
                    <h2 id="jwhy-h">{t('journey.whyTrip')}</h2>
                    <ul className="iwhy">
                      {highlights.map((h) => (
                        <li key={h.key} className="iwhy-row">
                          <span className="iwhy-t">{h.title}</span>
                          <span className="iwhy-s">{h.day ? `${t('journey.dayN', { n: h.day })}: ${h.line}` : h.line}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            <div className="ipage-side jpage-side" data-slot="side">
              <TripPriceCard
                trip={trip}
                budget={viewTrip.budget}
                days={viewDays}
                lengthControl={<TripLengthChoice lengths={lengths} value={isShort ? SHORT : WEEK} onChange={pickLength} />}
                onPdf={download ? (price) => download(pdfModel(price)) : null}
                pdfBusy={pdfBusy}
              />
            </div>

            <section className="tfit" id="sec-fit" data-slot="fit" aria-labelledby="jfit-h">
              <h2 id="jfit-h">{t('journey.fitHead')}</h2>
              {(best.months?.length > 0) && (
                <div className="tfit-months">
                  <span className="tfit-label"><CalendarIcon size={16} aria-hidden="true" /> {t('journey.fBest')}</span>
                  <MonthStrip good={best.months || []} avoid={best.avoidMonths || []} />
                </div>
              )}
              {fitRows.length > 0 && (
                <ul className="ibyg-list tfit-rows">
                  {fitRows.map((r) => (
                    <li key={r.key} className="ibyg-row">
                      <span className="iicon" aria-hidden="true"><r.icon size={20} /></span>
                      <span className="ibyg-text"><span className="ibyg-t">{r.text}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {exits.length > 0 && (
              <section className="ipage-alts" aria-labelledby="jalts-h">
                <Track title={t('item.notQuite')} headingId="jalts-h" size="third">
                  {exits.map(({ kind, card }) => {
                    const myMid = trip.budget?.totalEur ? (trip.budget.totalEur.low + trip.budget.totalEur.high) / 2 : null;
                    const theirMid = card.eur ? ((card.eur.low ?? card.eur.high) + (card.eur.high ?? card.eur.low)) / 2 : null;
                    const less = myMid && theirMid && myMid - theirMid >= 50 ? Math.round((myMid - theirMid) / 10) * 10 : null;
                    const fact = kind === 'easier' && card.diffLabel ? diffLabel(card.diffLabel, t)
                      : kind === 'cheaper' && less ? t('journey.lessPp', { eur: `~${formatMoney(less, { locale: lang })}` })
                        : (card.visits || []).slice(0, 2).join(', ');
                    return (
                      <AlternativeCard
                        key={card.id}
                        kind={kind === 'easier' ? t('journey.exitEasier') : kind === 'cheaper' ? t('journey.exitCheaper') : t('journey.exitNearby')}
                        title={card.title}
                        photoUrl={card.hero?.url || null}
                        iso2={card.cc}
                        where={card.country || ''}
                        fact={fact}
                        price={card.eur ? (
                          <span className="jcap-fig">
                            <Money low={card.eur.low} high={card.eur.high} est />
                            {' '}
                            {t('journey.pricePp')}
                          </span>
                        ) : null}
                        onOpen={() => onOpenJourney?.(card)}
                      />
                    );
                  })}
                </Track>
              </section>
            )}

            {viewTrip.itinerary?.length > 0 && (
              <section className="tweek" id="sec-itin" data-slot="week" aria-labelledby="jweek-h">
                <h2 id="jweek-h">{t('journey.grpWeek')}</h2>
                {(climbing || moving) && <WeekClimb days={stats.days} sel={selDay} onPick={setSelDay} />}
                {dayMap && (
                  <div className="tweek-map">
                    <React.Suspense fallback={<div className="dsk-map-frame" />}>
                      <TripDayMap places={trip.dayPlaces} sel={selDay} onPick={setSelDay} relief={outdoor}
                        label={t('journey.mapAria', { name: trip.title })} />
                    </React.Suspense>
                  </div>
                )}
                <Track label={t('journey.trackAria')} size="half" index={dayIndex}
                  onSelect={(i) => setSelDay(viewTrip.itinerary[i]?.day ?? i + 1)} className="tweek-days">
                  {viewTrip.itinerary.map((day, k) => {
                    const stay = stays.find((s) => s.rank === day.sleepRef) || null;
                    const photo = tripPhoto(day.photo)
                      || tripPhoto((trip.highlights || []).find((h) => h.day === day.day && h.photo)?.photo);
                    return (
                      <DayCard key={`${length}-${day.day}`} day={day} stats={stats.days[k]} stay={stay} photo={photo} />
                    );
                  })}
                </Track>
              </section>
            )}

            {(gateRows.length > 0 || rail || townNear) && (
              <section className="dsk-sec tgo" id="sec-ends" data-slot="getting-there" aria-labelledby="jends-h">
                <h2 id="jends-h">{t('detail.gettingThere')}</h2>
                <ul className="igo-list">
                  {gateRows.slice(0, 3).map((g) => (
                    <li key={`${g.code}-${g.name}`} className="igo-row">
                      <span className="iicon" aria-hidden="true"><LuggageIcon size={20} /></span>
                      <span className="igo-main">
                        <span className="igo-name">{[g.name, g.code].filter(Boolean).join(', ')}</span>
                        {Number.isFinite(g.transferMin) && g.transferTo && (
                          <span className="igo-sub">{t('journey.gatewayTransfer', { time: minutesText(g.transferMin), place: g.transferTo })}</span>
                        )}
                      </span>
                    </li>
                  ))}
                  {rail && (
                    <li className="igo-row">
                      <span className="iicon" aria-hidden="true"><TrainIcon size={20} /></span>
                      <span className="igo-main">
                        <span className="igo-name">{t('journey.railLabel')}</span>
                        <span className="igo-sub">
                          {t('journey.railLine', {
                            eur: formatMoney(rail.eurPp, { precision: 'whole', locale: lang }),
                            time: minutesText(Math.round(rail.hours * 60)),
                            from: rail.from,
                          })}
                        </span>
                      </span>
                    </li>
                  )}
                </ul>
                {trip.logistics?.gettingThere && <Prose text={trip.logistics.gettingThere} className="tprose tgo-note" />}
                {townNear && (
                  <Button variant="secondary" className="tgo-town" onClick={() => leaveTo(() => onSelectDest?.(gatewayDest.id))}
                    iconEnd={<ChevronRightIcon size={20} />}>
                    {t('journey.ctaPricesIn', { city: gatewayDest.city })}
                  </Button>
                )}
              </section>
            )}

            <section className="tprep" id="sec-prep" data-slot="beforego" aria-labelledby="jprep-h">
              <h2 id="jprep-h">{t('go.head')}</h2>
              {risks.length > 0 && (
                <Track title={t('journey.wrongHead')} headingId="jrisk-h" size="third" className="tprep-risks" showAll>
                  {risks.map((r) => <GoCard key={r.key} icon={AlertIcon} text={r.text} tone="risk" />)}
                </Track>
              )}
              {logRows.length > 0 && (
                <Track title={t('journey.logHead')} headingId="jlog-h" size="third" showAll>
                  {logRows.map((r) => <GoCard key={r.key} icon={r.icon} title={r.title} text={r.text} />)}
                </Track>
              )}
              {tips.length > 0 && (
                <Track title={t('journey.tipsHead')} headingId="jtips-h" size="third" showAll>
                  {tips.map((r) => <GoCard key={r.key} icon={BulbIcon} text={r.text} />)}
                </Track>
              )}
              {bookSteps && (
                <div className="tprep-book">
                  <BookingOrder tripId={trip.id} source={bookSource} bestMonths={trip.bestPeriod?.months} notes={false} />
                </div>
              )}
              <div className="tprep-pack">
                <h3 className="itrack-title">{t('journey.packHead')}</h3>
                <PackGrid trip={trip} />
              </div>
            </section>

            <SourcesLine items={sources} />
          </div>
        </div>
      </div>
    </div>
  );
}

