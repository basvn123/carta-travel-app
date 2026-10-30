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
import { SLOTS } from '../lib/tripPrice.js';
import { Button, Chip, Money } from '../components/ui/index.js';
import { InfoDot } from '../components/InfoDot.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { PageBar } from './PageBar.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { KeyFacts } from './KeyFacts.jsx';
import { Track } from './Track.jsx';
import { HighlightCard, AlternativeCard } from './ItemParts.jsx';
import { TripPriceCard, TripLengthChoice } from './TripPriceCard.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { homeFlightSetup, journeyAirports } from './cartaFlight.js';
import { BookingOrder } from './BookingOrder.jsx';
import { PackGrid } from './PackGrid.jsx';
import { JourneyRoute, routeStops } from './JourneyRoute.jsx';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { waysThere } from './placeWays.js';
import { homePoint, partyOf, groundReturn, GROUND_MODES } from '../lib/travelWay.js';
import { useItemPdf } from '../hooks/useItemPdf.js';
import { JumpBar, PSection, PBlock, PriceDock, scrollToSection, useWide } from './PageTemplate.jsx';
import {
  AlertIcon, BedIcon, BulbIcon, BusIcon, CarIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon,
  CloseIcon, CloudIcon, FamilyIcon, FriendsIcon, HeartIcon, InfoIcon, LuggageIcon, PiggyIcon,
  PlugIcon, RouteIcon, ShieldIcon, TicketIcon, TrainIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * Carta's trip page, v2 (T913, on the place and trip template of the owner's
 * approved spec of 2026-10-30; v1 was T431 on the item pages' system).
 *
 * The same family as the place page (DestinationPage.jsx): the photographs
 * (PhotoGallery's mosaic), the head (the title, its subtitle after a colon,
 * the flag and the region, the style, the difficulty and the best months as
 * badges, the hook), the facts row, then one long page under the same
 * sticky jump bar: Overview (good to know, who it suits, why this trip),
 * Route (the map with numbered stops and the legs), Day by day (an
 * accordion, day 1 open, Open all), Costs (the four ranges as bars and the
 * total), Where you sleep, Getting there and back (from the traveller's home
 * by the same travel models as the place page), Practical (the risks, the
 * logistics, the tips, the booking order, the packing grid, the sources).
 * Not quite right? (easier, cheaper or nearby weeks) closes the page.
 *
 * The price card is the place page's shell: the range a person, the start,
 * the travellers and the stay level, the four cost ranges, "Total for N",
 * ONE primary (Plan this trip) and Save and PDF as two secondaries; a sticky
 * right column from 1024 px, inline below it with the same foot bar.
 *
 * The page keeps its address (#journey=<id>, pushed so Back closes it), its
 * save and share, and the length choice shared with the list.
 */

const START_KM = 30;
// The styles whose days are walked, run, ridden or skied.
const OUTDOOR = new Set(['hiking', 'trail-running', 'nature-escape', 'cycling', 'pilgrim', 'winter-sports']);

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

const LINE_KEY = {
  accommodation: 'journey.bAccommodation',
  food: 'journey.bFood',
  transport: 'journey.bTransport',
  activities: 'journey.bActivities',
};
const WAY_ICON = { plane: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon };

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

/** The difficulty as the five squares and the word, with a dot that says
 *  what it means for this week. */
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
    <div className="pt-wrap tskel" role="status" aria-busy="true">
      <span className="sr-only">{t('journey.loadingWeek')}</span>
      <span className="tskel-photo" aria-hidden="true" />
      <span className="tskel-line is-title" aria-hidden="true" />
      <span className="tskel-line" aria-hidden="true" />
    </div>
  );
}

/** One day of the accordion: the number tile, the title and tonight's bed
 *  on the button; the morning, afternoon and evening and the day's figures
 *  inside. */
function DayRow({ day, open, onToggle, stats, t, lang }) {
  const bodyId = `pt-day-${day.day}-body`;
  const parts = [['morning', day.morning], ['afternoon', day.afternoon], ['evening', day.evening]].filter(([, x]) => x);
  const n0 = (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });
  const chips = [
    stats?.km != null ? `${n0(stats.km)} km` : null,
    stats?.up ? t('journey.chartUp', { m: n0(stats.up) }) : null,
    stats?.minutes != null ? minutesText(stats.minutes) : null,
    ...String(day.dayStats || '').split(/\s\/\s/).map((s) => stripDashes(s.trim())),
  ].filter(Boolean);
  return (
    <li className={`pt-day${open ? ' is-open' : ''}`} id={`jday-${day.day}`}>
      <Button variant="quiet" block className="pt-day-btn" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="pt-day-n" aria-hidden="true">
          <span className="pt-day-n-l">{t('jx.dayShort')}</span>
          <b>{day.day}</b>
        </span>
        <span className="pt-day-t">
          <span className="sr-only">{t('journey.dayN', { n: day.day })}: </span>
          <b>{stripDashes(day.title || '')}</b>
          {day.sleep && (
            <small><BedIcon size={13} /> {stripDashes(day.sleep)}</small>
          )}
        </span>
        <ChevronDownIcon size={18} className="pt-day-chev" />
      </Button>
      <div className="pt-day-body" id={bodyId} hidden={!open}>
        {open && (
          <>
            {parts.map(([when, text]) => (
              <div className="pt-part" key={when}>
                <small>{t(`journey.${when}`)}</small>
                <Prose text={text} className="pt-part-text" />
              </div>
            ))}
            {chips.length > 0 && (
              <ul className="pt-daychips">
                {chips.map((c, i) => <li key={`${i}:${c}`}>{c}</li>)}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function JourneyPage({
  id, gatewayDest, railFrom = null, onClose, onSelectDest, onOpenJourney,
  // stayTier, stayTiers and onChangeStayTier are still passed by the host;
  // the price card prices the trip's own bed range instead (T430 critique).
  fav = false, onFav = null,
  // T504 (row T498-c): opened from a country or region page, the back
  // names that page instead of the trip's own list.
  backLabel = '',
  // T913: the page's one primary. Without a host handler it opens the trip
  // planner on the trip's country (the address the planner reads).
  onPlanTrip = null,
}) {
  const { t, lang, languages } = useI18n();
  // undefined = loading, null = not published, 'failed' = the load failed.
  const [trip, setTrip] = useState(undefined);
  const [tries, setTries] = useState(0);
  const scrollEl = useRef(null);
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const headEl = useRef(null);
  const [titleGone, setTitleGone] = useState(false);
  const [library, setLibrary] = useState(null);
  const [copied, setCopied] = useState(false);
  const [selDay, setSelDay] = useState(1);
  const [openDays, setOpenDays] = useState(() => new Set([1]));
  const [cardSignal, setCardSignal] = useState(0);
  const wide = useWide();

  useEffect(() => {
    let live = true;
    setTrip(undefined);
    setSelDay(1);
    setOpenDays(new Set([1]));
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

  // Arrival focus follows the one page rule (hooks/usePageArrival.js, T474).
  const readyId = trip && trip !== 'failed' ? trip.id : null;
  const arrivalRef = usePageArrival(pageRef, readyId);
  useFocusTrap(pageRef, close, { initialFocusRef: arrivalRef });
  useEffect(() => { scrollEl.current?.scrollTo?.(0, 0); }, [id]);

  const tripReady = trip && trip !== 'failed' ? trip : null;

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
  const pickLength = (next) => { setLength(next); writeTripLength(next); setSelDay(1); setOpenDays(new Set([1])); };
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
  const highlights = useMemo(() => {
    const all = tripHighlights(tripReady);
    return hook?.source === 'highlight' && all.length > 2 ? all.slice(1) : all;
  }, [tripReady, hook]);
  const gallery = useMemo(() => tripGallery(tripReady), [tripReady]);
  const rail = useMemo(() => railAlternative(railFrom, tripReady), [railFrom, tripReady]);
  const firstRun = useFirstRun();
  const settings = useSettings();
  const fl = homeFlightSetup(firstRun);
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
    <div className="tpage jpage jpage-v2 pt-page" role="dialog" aria-modal="true" aria-label={label} ref={pageRef}
      data-testid="journey-page">
      {bar(label)}
      <div className="tpage-scroll pt-scroll" ref={scrollEl}>{body}</div>
    </div>
  );

  if (trip === undefined) return shell(t('journey.backStyles'), <PageSkeleton t={t} />);
  if (trip === 'failed') {
    return shell(t('journey.backStyles'), (
      <div className="pt-wrap tpage-pad">
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
  // A title with a colon is a name and a subtitle ("Douro Field Blends:
  // Quintas, Tawnies and the Pocinho Line").
  const fullTitle = stripDashes(trip.title || '');
  const colon = fullTitle.indexOf(': ');
  const title = colon > 0 ? fullTitle.slice(0, colon) : fullTitle;
  const subtitle = colon > 0 ? fullTitle.slice(colon + 2) : '';
  const where = [trip.subRegion, ...(trip.countries?.length ? trip.countries.map((c) => c.name) : [trip.country])]
    .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  const stays = trip.accommodationStrategy || [];
  const bedWord = stays[0]?.style ? capFirst(stripDashes(stays[0].style)) : '';
  const firstPlace = (trip.dayPlaces || [])[0]?.name || null;
  const profile = trip.profile || {};
  const best = trip.bestPeriod || {};
  const bestText = best.months?.length ? fmtMonthRanges(best.months, t) : '';
  const stops = routeStops(trip.dayPlaces);
  const bases = [...new Set([
    ...stops.map((s) => s.name),
    ...stays.map((s) => s.location).filter(Boolean),
  ])].slice(0, 3);
  const gateRows = Array.isArray(trip.gateways) && trip.gateways.length
    ? trip.gateways
    : parseGateway(trip.gatewayAirport).rows.map((r) => ({ ...r, transferMin: null }));
  const gateCodes = journeyAirports(trip);

  // The facts row: the length, the bases, the best time, the effort on a
  // moving week, the airport. A missing fact is left out.
  const moving = OUTDOOR.has(trip.tripTypeSlug) || trip.tripTypeSlug === 'rail';
  const climbing = OUTDOOR.has(trip.tripTypeSlug);
  const facts = keyFactCells([
    { key: 'days', label: t('journey.fDays'), value: t('journey.nDays', { n: viewDays }) },
    { key: 'bases', label: t('jx.fBases'), value: bases.join(', ') || bedWord || firstPlace || '' },
    { key: 'best', label: t('journey.fBest'), value: bestText },
    { key: 'km', label: t('trails.factDistance'), value: moving && stats.km != null ? `${n1(Math.round(stats.km))} km` : '' },
    { key: 'climb', label: t('journey.fClimb'), value: climbing && stats.up != null && stats.up > 0 ? `${n1(Math.round(stats.up))} m` : '' },
    { key: 'fly', label: t('destx.fact.fly'), value: gateCodes.join(', ') },
  ], t).slice(0, 5);

  // Good to know: the first pro tip as the lead, the months to avoid, then
  // who the week suits, the car and children.
  const tipsAll = (trip.proTips || []).filter(Boolean);
  const goodRows = [
    tipsAll[0] && { key: 'tip', Icon: BulbIcon, text: tipsAll[0], lead: true },
    best.avoid && { key: 'avoid', Icon: AlertIcon, title: t('jx.avoid'), text: best.avoid },
    trip.typeSpecific?.audience && { key: 'suits', Icon: FriendsIcon, text: t('journey.fitSuits', { who: stripDashes(trip.typeSpecific.audience) }) },
    profile.carRequired === true && { key: 'car', Icon: CarIcon, text: t('journey.fitCarYes') },
    profile.carRequired === false && { key: 'car', Icon: TrainIcon, text: t('journey.fitCarNo') },
    profile.familyFriendly === true && { key: 'kids', Icon: FamilyIcon, text: t('journey.fitKids') },
    profile.familyFriendly === false && { key: 'kids', Icon: FamilyIcon, text: t('journey.fitNoKids') },
  ].filter(Boolean);
  const fitGood = (trip.fit?.good || []).filter((x) => typeof x === 'string' && x);
  const fitLess = (trip.fit?.less || []).filter((x) => typeof x === 'string' && x);

  // Practical: the risks first, then the logistics, the other tips.
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
  const tips = tipsAll.slice(1).map((text, i) => ({ key: `tip-${i}`, text }));
  const packing = packCells(trip).length > 0;

  const sources = [
    ...(Array.isArray(trip.sources) ? trip.sources : [])
      .map((s) => (typeof s === 'string' ? { label: s.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], href: safeUrl(s) } : (s?.url ? { label: s.title || s.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0], href: safeUrl(s.url) } : null)))
      .filter(Boolean).slice(0, 6),
  ];
  const photoCredits = gallery.filter((g) => g.author || g.licence);

  // The booklet (lib/tripPdf.js) prints what this page shows, in its order.
  const fitRowsText = goodRows.filter((r) => r.key !== 'tip' && r.key !== 'avoid').map((r) => r.text);
  const dayFacts = (st) => [
    st?.km != null ? `${n1(st.km)} km` : '',
    st?.up ? t('journey.chartUp', { m: n1(st.up) }) : '',
    st?.down ? t('journey.chartDown', { m: n1(st.down) }) : '',
    st?.high != null ? t('journey.chartHigh', { m: n1(st.high) }) : '',
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
      ...fitRowsText,
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

  const outdoor = OUTDOOR.has(trip.tripTypeSlug);
  const startPoint = (trip.dayPlaces || [])[0] || (trip.coordinates?.precision === 'source' || trip.coordinates?.precision === 'city' ? trip.coordinates : null);
  const lastPoint = stops.length > 1 ? stops[stops.length - 1] : null;
  const townNear = gatewayDest && startPoint && Number.isFinite(gatewayDest.lat) && Number.isFinite(startPoint.lat)
    && haversineKm(startPoint.lat, startPoint.lon, gatewayDest.lat, gatewayDest.lon) <= START_KM;

  // Getting there and back, from the traveller's home, by the place page's
  // travel models: the return flight to the cheapest gateway with one, the
  // train, coach and car to where the week starts; and, when the week ends
  // far from where it starts, the ground way home from its last stop.
  const homeChoices = settings
    ? { drive_home: settings.fromPlace, origin: settings.origin }
    : { drive_home: firstRun?.choices?.drive_home, origin: firstRun?.choices?.origin };
  const party = partyOf(settings
    ? { group_size: settings.party, children: settings.children, babies: settings.babies }
    : firstRun?.choices);
  const home = homePoint(homeChoices, firstRun?.data || null);
  const request = settings?.priceRequest || firstRun?.priceRequest || null;
  const bagKey = request?.baggage || fl.bagKey;
  const startDest = startPoint && Number.isFinite(startPoint.lat)
    ? { lat: startPoint.lat, lon: startPoint.lon, city_lat: startPoint.lat, city_lon: startPoint.lon, iso2: trip.countryCode, country: trip.country }
    : null;
  let ways = null;
  for (const code of gateCodes.length ? gateCodes : [null]) {
    const w = waysThere({ dest: startDest || { iso2: trip.countryCode }, anchor: code, home: startDest ? home : null, party, flights: fl.file, request, bagKey });
    const plane = w?.rows.find((r) => r.mode === 'plane');
    const bestPlane = ways?.rows.find((r) => r.mode === 'plane');
    if (w && (!ways || (plane && (!bestPlane || plane.perPerson < bestPlane.perPerson)))) ways = w;
  }
  const backWays = lastPoint && startPoint && Number.isFinite(lastPoint.lat) && home
    && haversineKm(lastPoint.lat, lastPoint.lon, startPoint.lat, startPoint.lon) > START_KM
    ? GROUND_MODES.map((mode) => {
      const r = groundReturn({ lat: lastPoint.lat, lon: lastPoint.lon, city_lat: lastPoint.lat, city_lon: lastPoint.lon, iso2: trip.countryCode, country: trip.country }, home, mode, party);
      return r && r.perPerson > 0 ? { mode, oneWay: r.perPerson / 2, hours: r.hours } : null;
    }).filter(Boolean)
    : [];

  const planTrip = onPlanTrip || (trip.countryCode ? () => {
    const url = `${window.location.pathname}?tab=trip&cc=${encodeURIComponent(trip.countryCode)}`;
    leaveTo(() => window.location.assign(url));
  } : null);

  const priceCard = (
    <TripPriceCard
      trip={trip}
      budget={viewTrip.budget}
      days={viewDays}
      lengthControl={<TripLengthChoice lengths={lengths} value={isShort ? SHORT : WEEK} onChange={pickLength} />}
      onPdf={download ? (price) => download(pdfModel(price)) : null}
      pdfBusy={pdfBusy}
      onPlan={planTrip}
      fav={fav}
      onFav={onFav}
      openSignal={cardSignal}
    />
  );

  const ranges = SLOTS.map((slot) => {
    const row = viewTrip.budget?.breakdown?.[slot];
    return row && Number.isFinite(row.lowEur) && Number.isFinite(row.highEur)
      ? { slot, low: row.lowEur, high: row.highEur, note: row.note || '' } : null;
  }).filter(Boolean);
  const rangeMax = Math.max(1, ...ranges.map((r) => r.high));
  const total = viewTrip.budget?.totalEur || null;

  const jumps = [
    ['overview', 'pt-overview'], ['route', 'pt-route'], ['days', 'pt-days'], ['costs', 'pt-costs'],
    ['sleep', 'pt-sleep'], ['getting', 'pt-getting'], ['practical', 'pt-practical'],
  ].map(([key, sid]) => ({ key, id: sid, label: t(`jx.jump.${key}`) }));

  const allOpen = viewTrip.itinerary.every((d) => openDays.has(d.day));
  const toggleDay = (n) => {
    setSelDay(n);
    setOpenDays((s) => { const next = new Set(s); if (next.has(n)) next.delete(n); else next.add(n); return next; });
  };

  const bcp47 = languages?.find?.((l) => l.code === lang)?.bcp47 || 'en-GB';
  const shortDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch { return iso; }
  };
  const people = Math.max(1, Math.round(firstRun?.choices?.group_size || 1));
  const peopleText = people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: people });
  const dockInputs = fl.from
    ? t('jx.dockInputs', { n: viewDays, date: shortDate(fl.from), people: peopleText })
    : peopleText;
  const openCard = () => {
    scrollToSection(scrollEl.current, 'pt-cost');
    setCardSignal((n) => n + 1);
  };
  const wayUnit = t('card.unitReturn');

  return (
    <div className="tpage jpage jpage-v2 pt-page" role="dialog" aria-modal="true" aria-label={trip.title} ref={pageRef}
      data-testid="journey-page" data-sample={trip.sample ? 'true' : undefined}>
      {bar(backLabel || typeLabel(trip.tripTypeSlug, t, trip.tripType))}

      <div className="tpage-scroll pt-scroll" ref={scrollEl}>
        <div className="pt-wrap">
          <PhotoGallery layout="mosaic" photos={gallery} label={trip.title} claimKey={trip.id}
            fallback={{ city: trip.title, iso2: trip.countryCode }} />

          <div className="pt-body">
            <div className="pt-main">
              <header className="pt-head" ref={headEl}>
                <h1 className="pt-title" tabIndex={-1}>{title}</h1>
                {subtitle && <p className="pt-subtitle">{subtitle}</p>}
                {where && (
                  <p className="pt-where">
                    {trip.countryCode && <CountryFlag country={trip.countryCode} size={15} />}
                    <span>{where}</span>
                  </p>
                )}
                <div className="pt-badges">
                  <Chip kind="status" className="pt-badge">{typeLabel(trip.tripTypeSlug, t, trip.tripType)}</Chip>
                  <DifficultyChip profile={profile} stats={stats} />
                  {bestText && <Chip kind="status" className="pt-badge">{t('jx.bestIn', { months: bestText })}</Chip>}
                </div>
                {hook && (
                  <p className="pt-lead">{hook.built ? t('journey.hookBuilt', hook.built) : stripDashes(hook.line)}</p>
                )}
              </header>

              <KeyFacts cells={facts} className="pt-facts" />

              <JumpBar items={jumps} scrollRef={scrollEl} ready={`${trip.id}:${length}`} label={t('journey.railAria')} />

              {(goodRows.length > 0 || fitGood.length > 0 || fitLess.length > 0 || highlights.length > 0) && (
                <div className="pt-group" id="pt-overview">
                  {(goodRows.length > 0 || fitGood.length > 0 || fitLess.length > 0) && (
                    <PSection id="pt-good" title={t('destx.goodToKnow')}>
                      {goodRows.length > 0 && (
                        <ul className="pt-tips">
                          {goodRows.map(({ key, Icon, title: head, text, lead }) => (
                            <li key={key} className={lead ? 'is-lead' : undefined}>
                              <span className="pt-tip-icon" aria-hidden="true"><Icon size={16} /></span>
                              <span>
                                {head && <b>{head}</b>}
                                <Prose text={text} className="pt-tip-text" />
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {(fitGood.length > 0 || fitLess.length > 0) && (
                        <div className="pt-fit">
                          {fitGood.length > 0 && (
                            <div>
                              <b>{t('jx.goodFor')}</b>
                              <ul>
                                {fitGood.map((x) => <li key={x}><CheckIcon size={14} /><span>{stripDashes(x)}</span></li>)}
                              </ul>
                            </div>
                          )}
                          {fitLess.length > 0 && (
                            <div className="is-less">
                              <b>{t('jx.lessGood')}</b>
                              <ul>
                                {fitLess.map((x) => <li key={x}><CloseIcon size={14} /><span>{stripDashes(x)}</span></li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </PSection>
                  )}
                  {highlights.length > 0 && (
                    <PSection id="pt-why" title={t('journey.whyTrip')}>
                      {highlights.some((h) => h.photo) ? (
                        <Track label={t('journey.whyTrip')} size="third">
                          {highlights.map((h) => (
                            <HighlightCard key={h.key} photo={tripPhoto(h.photo)} title={h.title} line={h.line}
                              meta={h.day ? t('journey.dayN', { n: h.day }) : ''} iso2={trip.countryCode} />
                          ))}
                        </Track>
                      ) : (
                        <ul className="iwhy">
                          {highlights.map((h) => (
                            <li key={h.key} className="iwhy-row">
                              <span className="iwhy-t">{h.title}</span>
                              <span className="iwhy-s">{h.day ? `${t('journey.dayN', { n: h.day })}: ${h.line}` : h.line}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </PSection>
                  )}
                </div>
              )}

              {!wide && (
                <PSection id="pt-cost" title={t('jx.whatItCosts')} className="pt-inlinecost">
                  {priceCard}
                </PSection>
              )}

              <JourneyRoute trip={trip} t={t} itinerary={viewTrip.itinerary} stats={stats} sel={selDay}
                onPick={(n) => { setSelDay(n); setOpenDays((s) => new Set([...s, n])); }}
                chart={climbing || moving} map={!isShort} relief={outdoor} />

              {viewTrip.itinerary?.length > 0 && (
                <PSection id="pt-days" title={t('jx.jump.days')}
                  note={viewTrip.itinerary.length > 1 ? (
                    <Button variant="quiet" size="sm" onClick={() => setOpenDays(allOpen ? new Set() : new Set(viewTrip.itinerary.map((d) => d.day)))}>
                      {allOpen ? t('jx.closeAll') : t('jx.openAll')}
                    </Button>
                  ) : null}>
                  <ol className="pt-days">
                    {viewTrip.itinerary.map((day, k) => (
                      <DayRow key={`${length}-${day.day}`} day={day} open={openDays.has(day.day)}
                        onToggle={() => toggleDay(day.day)} stats={stats.days[k]} t={t} lang={lang} />
                    ))}
                  </ol>
                </PSection>
              )}

              {ranges.length > 0 && (
                <PSection id="pt-costs" title={t('jx.jump.costs')} note={t('jx.costsNote', { n: viewDays })}>
                  <div className="pt-ranges">
                    {ranges.map((r) => (
                      <div className="pt-rg" key={r.slot}>
                        <span className="pt-rg-name">
                          {t(LINE_KEY[r.slot])}
                          {r.note && (
                            <InfoDot title={t(LINE_KEY[r.slot])}>
                              <Prose text={r.note} className="infodot-text" />
                            </InfoDot>
                          )}
                        </span>
                        <span className="pt-rg-track" aria-hidden="true">
                          <i style={{ left: `${(r.low / rangeMax) * 100}%`, right: `${100 - (r.high / rangeMax) * 100}%` }} />
                        </span>
                        <b className="pt-rg-fig"><Money low={r.low} high={r.high} /></b>
                      </div>
                    ))}
                    {total && Number.isFinite(total.low) && Number.isFinite(total.high) && (
                      <div className="pt-rg-total">
                        <span>{t('jx.costsTotal', { n: viewDays })}</span>
                        <b><Money low={total.low} high={total.high} /></b>
                      </div>
                    )}
                  </div>
                </PSection>
              )}

              {stays.length > 0 && (
                <PSection id="pt-sleep" title={t('jx.jump.sleep')}>
                  <ul className="pt-stays">
                    {stays.map((s, i) => (
                      <li key={`${s.rank ?? i}:${s.name}`} className="pt-stay">
                        {s.location && <small className="pt-cell-label">{stripDashes(s.location)}</small>}
                        <b>{stripDashes(s.name || '')}</b>
                        {s.style && <span className="pt-stay-style">{capFirst(stripDashes(s.style))}</span>}
                        {s.description && <Prose text={s.description} className="pt-cell-text" />}
                      </li>
                    ))}
                  </ul>
                </PSection>
              )}

              {(ways?.rows?.length > 0 || backWays.length > 0 || gateRows.length > 0 || rail || townNear || trip.logistics?.gettingThere) && (
                <PSection id="pt-getting" title={ways?.from ? t('jx.gettingFrom', { place: ways.from }) : t('jx.jump.getting')}
                  note={ways?.rows?.length ? t('jx.gettingNote') : null}>
                  {ways?.rows?.length > 0 && (
                    <ul className="pt-ways">
                      {ways.rows.map((w) => {
                        const Icon = WAY_ICON[w.mode];
                        const cheapest = ways.rows.length > 1 && w.mode === ways.cheapest;
                        const sub = w.mode === 'plane'
                          ? [w.dep && w.arr ? t('destx.flightTimes', { dep: w.dep, arr: w.arr }) : null, Number.isFinite(w.minutes) ? minutesText(w.minutes) : null].filter(Boolean).join(', ')
                          : (Number.isFinite(w.hours) ? t('destx.aboutTime', { time: minutesText(Math.round(w.hours * 60)) }) : '');
                        return (
                          <li key={w.mode} className="pt-way">
                            <span className="pt-way-icon" aria-hidden="true"><Icon size={18} /></span>
                            <span className="pt-way-main">
                              <span className="pt-way-name">
                                {w.mode === 'plane' ? t('destx.flyToIata', { iata: w.iata }) : t(`way.${w.mode}`)}
                                {cheapest && <span className="pt-best">{t('destx.cheapest')}</span>}
                              </span>
                              {sub && <small>{sub}</small>}
                            </span>
                            <span className="pt-way-fig">
                              <b>{formatMoney(w.perPerson, { precision: 'whole', locale: lang })}</b>
                              <small>{wayUnit}</small>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {backWays.length > 0 && (
                    <PBlock title={t('jx.homeFrom', { place: lastPoint.name })}>
                      <ul className="pt-ways">
                        {backWays.map((w) => {
                          const Icon = WAY_ICON[w.mode];
                          return (
                            <li key={w.mode} className="pt-way">
                              <span className="pt-way-icon" aria-hidden="true"><Icon size={18} /></span>
                              <span className="pt-way-main">
                                <span className="pt-way-name">{t(`way.${w.mode}`)}</span>
                                {Number.isFinite(w.hours) && <small>{t('destx.aboutTime', { time: minutesText(Math.round(w.hours * 60)) })}</small>}
                              </span>
                              <span className="pt-way-fig">
                                <b>{formatMoney(w.oneWay, { precision: 'whole', locale: lang })}</b>
                                <small>{t('jx.oneWay')}</small>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </PBlock>
                  )}
                  {(gateRows.length > 0 || rail) && (
                    <ul className="pt-cells is-icons pt-gates">
                      {gateRows.slice(0, 3).map((g) => (
                        <li key={`${g.code}-${g.name}`} className="pt-cell">
                          <span className="pt-cell-icon" aria-hidden="true"><LuggageIcon size={16} /></span>
                          <b className="pt-cell-title">{[g.name, g.code].filter(Boolean).join(', ')}</b>
                          {(Number.isFinite(g.transferMin) && g.transferTo) ? (
                            <p className="pt-cell-text">{t('journey.gatewayTransfer', { time: minutesText(g.transferMin), place: g.transferTo })}</p>
                          ) : g.note ? <p className="pt-cell-text">{stripDashes(g.note)}</p> : null}
                        </li>
                      ))}
                      {rail && (
                        <li className="pt-cell">
                          <span className="pt-cell-icon" aria-hidden="true"><TrainIcon size={16} /></span>
                          <b className="pt-cell-title">{t('journey.railLabel')}</b>
                          <p className="pt-cell-text">
                            {t('journey.railLine', {
                              eur: formatMoney(rail.eurPp, { precision: 'whole', locale: lang }),
                              time: minutesText(Math.round(rail.hours * 60)),
                              from: rail.from,
                            })}
                          </p>
                        </li>
                      )}
                    </ul>
                  )}
                  {trip.logistics?.gettingThere && <Prose text={trip.logistics.gettingThere} className="tprose tgo-note" />}
                  {townNear && (
                    <Button variant="secondary" className="tgo-town" onClick={() => leaveTo(() => onSelectDest?.(gatewayDest.id))}
                      iconEnd={<ChevronRightIcon size={20} />}>
                      {t('journey.ctaPricesIn', { city: gatewayDest.city })}
                    </Button>
                  )}
                </PSection>
              )}

              <PSection id="pt-practical" title={t('jx.jump.practical')}>
                {risks.length > 0 && (
                  <PBlock title={t('journey.wrongHead')}>
                    <ul className="pt-cells is-icons">
                      {risks.map((r) => (
                        <li key={r.key} className="pt-cell is-risk">
                          <span className="pt-cell-icon" aria-hidden="true"><AlertIcon size={16} /></span>
                          <Prose text={r.text} className="pt-cell-text" />
                        </li>
                      ))}
                    </ul>
                  </PBlock>
                )}
                {logRows.length > 0 && (
                  <ul className="pt-cells is-icons">
                    {logRows.map((r) => (
                      <li key={r.key} className="pt-cell">
                        <span className="pt-cell-icon" aria-hidden="true"><r.icon size={16} /></span>
                        {r.title && <b className="pt-cell-title">{r.title}</b>}
                        <Prose text={r.text} className="pt-cell-text" />
                      </li>
                    ))}
                  </ul>
                )}
                {tips.length > 0 && (
                  <PBlock title={t('journey.tipsHead')}>
                    <ul className="pt-tips">
                      {tips.map((r) => (
                        <li key={r.key}>
                          <span className="pt-tip-icon" aria-hidden="true"><BulbIcon size={16} /></span>
                          <Prose text={r.text} className="pt-tip-text" />
                        </li>
                      ))}
                    </ul>
                  </PBlock>
                )}
                {bookSteps && (
                  <div className="tprep-book">
                    <BookingOrder tripId={trip.id} source={bookSource} bestMonths={trip.bestPeriod?.months} notes={false} />
                  </div>
                )}
                {packing && (
                  <PBlock title={t('journey.packHead')} className="tprep-pack">
                    <PackGrid trip={trip} />
                  </PBlock>
                )}
                {(sources.length > 0 || photoCredits.length > 0) && (
                  <details className="pt-fold">
                    <summary>{t('destx.sources')}</summary>
                    <ul>
                      {photoCredits.map((g) => {
                        const href = safeUrl(g.page);
                        const text = [g.caption, [g.author, g.licence].filter(Boolean).join(', ')].filter(Boolean).join(': ');
                        return <li key={g.url}>{href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text}</li>;
                      })}
                      {sources.map((s) => (
                        <li key={s.label}>{s.href ? <a href={s.href} target="_blank" rel="noreferrer">{s.label}</a> : s.label}</li>
                      ))}
                      <li><a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">Wikimedia Commons</a></li>
                    </ul>
                  </details>
                )}
              </PSection>

              {exits.length > 0 && (
                <PSection id="pt-alts" title={t('item.notQuite')}>
                  <Track label={t('item.notQuite')} size="third">
                    {exits.map(({ kind, card }) => {
                      const myMid = trip.budget?.totalEur ? (trip.budget.totalEur.low + trip.budget.totalEur.high) / 2 : null;
                      const theirMid = card.eur ? ((card.eur.low ?? card.eur.high) + (card.eur.high ?? card.eur.low)) / 2 : null;
                      const less = myMid && theirMid && myMid - theirMid >= 50 ? Math.round((myMid - theirMid) / 10) * 10 : null;
                      const fact = kind === 'easier' && card.diffLabel ? diffLabel(card.diffLabel, t)
                        : kind === 'cheaper' && less ? t('journey.lessPp', { eur: formatMoney(less, { locale: lang }) })
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
                              <Money low={card.eur.low} high={card.eur.high} />
                              {' '}
                              {t('journey.pricePp')}
                            </span>
                          ) : null}
                          onOpen={() => onOpenJourney?.(card)}
                        />
                      );
                    })}
                  </Track>
                </PSection>
              )}
            </div>
            {wide && <aside className="pt-side" aria-label={t('jx.whatItCosts')}>{priceCard}</aside>}
          </div>
        </div>
      </div>

      {!wide && (
        <PriceDock
          price={total && Number.isFinite(total.low) && Number.isFinite(total.high)
            ? <Money low={total.low} high={total.high} /> : null}
          unit={t('journey.pricePp')}
          inputs={dockInputs}
          inputsLabel={t('destx.dockInputs', { what: dockInputs })}
          onInputs={openCard}
          primary={planTrip ? (
            <Button variant="primary" className="pt-dock-cta" iconStart={<RouteIcon size={18} />} onClick={planTrip}>
              {t('brief.planThisTrip')}
            </Button>
          ) : null}
        />
      )}
    </div>
  );
}
