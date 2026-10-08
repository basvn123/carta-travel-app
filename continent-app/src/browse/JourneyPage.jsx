import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import {
  loadJourney, typeLabel, diffLabel, eurRange, boldSegments, lastCheckedMonth,
  dayStatsParts, figureRuns, splitAround, riskText, stayPriceText, minutesText,
  figureLedger, anyEstimated, dayFigureEstimated, monthLabel, accuracySignals,
  hookLine, humanDetail, loadAllJourneyCards, journeyExits, journeyHash, journeyShareUrl,
} from '../lib/journeys.js';
import { srcSetFor } from '../lib/heroImage.js';
import { scrollBehavior } from '../lib/motion.js';
import { claimShared } from '../lib/sharedElement.js';
import { trailheadDirectionsUrl } from '../lib/trailExport.js';
import { safeUrl } from '../lib/format.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { DetailStrip, DetailExits } from './DetailSkeleton.jsx';
import { previewWords } from '../lib/detailSkeleton.js';
import { Fold } from './Fold.jsx';
import { FlashDeck, CoinIcon } from './FlashDeck.jsx';
import { buildCards } from '../lib/flashcards.js';
import { FavStar } from '../components/FavStar.jsx';
import { ErrorBlock } from '../components/StateBlocks.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { CostBar } from './CostBar.jsx';
import { PackGrid } from './PackGrid.jsx';
import { NotFor } from '../components/NotFor.jsx';
import { dataSheetRows } from '../lib/dataSheet.js';
import { notForLines } from '../lib/notFor.js';
import { BookingOrder } from './BookingOrder.jsx';
import { WeekShapeBlock, EndsBlock, WeatherBlock } from './WeekPlan.jsx';
import { DayTrack } from './DayTrack.jsx';
import { LengthPicker } from './LengthPicker.jsx';
import { weekShape, tripEnds, weatherPlan, CONDITION_TYPES, BED_IN_TITLE } from '../lib/weekShape.js';
import { JourneyRoute } from './JourneyRoute.jsx';
import { bookingOrder, bookingSource } from '../lib/bookingOrder.js';
import { MonthStrip } from '../components/MonthStrip.jsx';
import { catalogue } from '../lib/appData.js';
import { priceRow, MAX_KM } from '../lib/priceMonths.js';
import { DifficultyMeter, GatewayList } from '../components/FactMeter.jsx';
import { parseGateway } from '../lib/gateway.js';
import { railAlternative } from '../lib/railAlternative.js';
import { nearestPricedDest } from '../lib/firstRun.js';
import { FirstRunReceipt } from '../components/FirstRunReceipt.jsx';
import { useFolds } from './useFolds.js';
import { SectionRail } from './SectionRail.jsx';
import { LifestyleSlider, SettledEur } from './LifestyleSlider.jsx';
import { offeredSleepGroups, tierForGroup } from '../lib/sleepGroups.js';
import { stopIndexFor, stopShare, tripFigures, eurCents } from '../lib/lifestyleSlider.js';
import { SHORT, readTripLength, tripLengths, writeTripLength } from '../lib/tripLength.js';
import {
  ArrowLeftIcon, MapPinIcon, ChevronRightIcon, CameraIcon, AlertIcon,
  ChevronDownIcon, CalendarIcon, ReceiptIcon, BedIcon,
  InfoIcon, BackpackIcon, CompassIcon, TrainIcon, PlugIcon,
  TicketIcon, ClockIcon, CloudIcon, HeartIcon, ShieldIcon, PiggyIcon,
  LuggageIcon, ShareIcon,
} from '../components/Icons.jsx';

/**
 * The journey page: one curated week, and the whole written plan.
 *
 * The same page grammar as the beach, lake and mountain pages (tpage/bpage
 * classes, no maplibre), with the blocks a written itinerary carries that a
 * summit does not: the seven days, the budget as an itemised range, where to
 * sleep, and the honest advisories the writers put in (what could go wrong,
 * what to re-check before booking).
 *
 * Editorial prose stays in its authored English, the same rule the POI
 * descriptions follow: it follows the data, not the UI language. Only the
 * chrome translates.
 *
 * Every section folds (P2.2, the shared <Fold>). Nothing is removed: the week
 * at a glance, the budget and the day-by-day open because they are what you
 * travel with, and the written blocks (why, the data sheet, good to know, the
 * tips, the packing list, the advisories) are one tap away with every authored
 * word intact. A day is one card of the day track (T162): its title, its
 * measured line and its night, with the three parts of the prose behind one
 * disclosure.
 *
 * The coordinate row renders ONLY when the schema says the pin is real
 * (precision source/city). A capital-city fallback pin is a map pin rather
 * than a location, and printing it under a heading would present it as one.
 *
 * T387 (v6 trips brief, V3 items 2, 4, 5, 6, 7, 8 and 10) reordered the page
 * into the traveller's order. The head is the title, the photograph, the
 * suitability strip with the price a person, the length control, the hook,
 * the not-for lines and the location as one fact line; the four chips that
 * repeated the strip are gone. The eighteen sections are seven groups, each
 * an h2 on the rail: Fit, Cost, Getting there, The week, Sleep, Prepare and
 * Risks (never folded). Cost leads with the trip's own itemised budget (rule
 * "Receipt, extended"); the nearest town's first-run receipt is a labelled
 * second view, offered only when the week has one base. From 1024 px the
 * Cost group is a sticky side column. The page has an address
 * (#journey=<id>, pushed onto history so the browser Back closes it), a
 * Share button and, when the host passes onFav, the save star.
 */

const fmtCoord = (n) => (Number.isFinite(n) ? n.toFixed(4) : '');

/** What opens on arrival: the sections you travel with. */
const OPEN_BY_DEFAULT = ['fit', 'budget', 'ends', 'itin'];

/** Authored prose with its **bold** markers honoured, never as HTML. */
function Prose({ text, className = 'bpage-prose' }) {
  if (!text) return null;
  return (
    <p className={className}>
      {boldSegments(text).map((seg, i) => (seg.bold
        ? <b key={i}>{seg.text}</b>
        : <React.Fragment key={i}>{seg.text}</React.Fragment>))}
    </p>
  );
}

/** The most words a block may show before the reader asks for it (T164, spec C4). */
const BLOCK_WORD_LIMIT = 60;
const wordCount = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

/** Prose that shows a six-word preview and a control when it is over the limit. */
function LongProse({ text, className, t }) {
  const [open, setOpen] = React.useState(false);
  if (!text) return null;
  if (wordCount(text) <= BLOCK_WORD_LIMIT || open) {
    return (
      <>
        <Prose text={text} className={className} />
        {open && (
          <button type="button" className="tday-more" onClick={() => setOpen(false)} aria-expanded>
            <ChevronDownIcon size={13} className="tday-more-chev is-open" />
            <span>{t('journey.showLess')}</span>
          </button>
        )}
      </>
    );
  }
  return (
    <>
      <p className={className}>{previewWords(text, 14)}</p>
      <button type="button" className="tday-more" onClick={() => setOpen(true)} aria-expanded={false}>
        <ChevronDownIcon size={13} className="tday-more-chev" />
        <span>{t('journey.readMore')}</span>
      </button>
    </>
  );
}

/* The mark on a figure the trip's own ledger calls an estimate (T146, spec
   K3): small, mono, with the plain-words reason for a screen reader. Sourced
   and derived figures carry no mark; the footer states the whole split. */
function EstMark({ t }) {
  return (
    <sup className="jpage-est mono" aria-label={t('journey.estAria')} title={t('journey.estAria')}>
      {t('journey.estMark')}
    </sup>
  );
}

/* The gateway airports. The wire carries them as rows (trip.gateways, written
   by build_wire.py since T143): code, name, transfer minutes and place, and a
   short note. gatewaysPartial means the hand-written v2.0 string did not split
   cleanly, so the first airport is shown and the whole text opens from the
   info button. A wire built before T143 has no rows, and the string is split
   here by parseGateway, the same reader the build now runs. */
function gatewayFact(trip, t) {
  if (Array.isArray(trip.gateways) && trip.gateways.length) {
    const rows = trip.gateways.map((g) => {
      const transfer = Number.isFinite(g.transferMin) && g.transferTo
        ? t('journey.gatewayTransfer', { time: minutesText(g.transferMin), place: g.transferTo })
        : '';
      return { code: g.code, name: g.name || '', detail: [transfer, g.note].filter(Boolean).join(', ') };
    });
    return { rows, more: trip.gatewaysPartial ? (trip.gatewayAirport || null) : null };
  }
  const text = trip.gatewayAirport;
  const code = trip.gatewayAirportCode;
  const { rows, complete } = parseGateway(text);
  if (rows.length && complete) return { rows, more: null };
  const first = rows[0] ? { code: rows[0].code, name: rows[0].name, detail: '' } : { code: code || '', name: '', detail: '' };
  return { rows: [first], more: text };
}

/* The note opens with the score again ("4/5, ..."), which the meter already
   shows, and sometimes says nothing more than the label. Both go. */
function difficultyNoteText(note, label) {
  if (!note) return null;
  const text = note.replace(/^\s*\d\s*\/\s*5\s*[,.:;-]?\s*/, '').trim();
  if (!text || text.toLowerCase() === String(label || '').toLowerCase()) return null;
  return text;
}

/* The suitability strip (T360, DESIGN.md "Suitability strip"): exactly three
   cells in fixed order, difficulty, style, total cost. A trip missing a value
   shows a placeholder word, so the count is three on every trip. Style is the
   first tag of one or two words (a tag is a hyphenated slug, so "slow-travel"
   reads "slow travel"; "hut-to-hut" is three words and is skipped). */
function journeyStripCells(trip, t, lang) {
  const profile = trip.profile || {};
  const level = Math.max(0, Math.min(5, Math.round(Number(profile.difficulty) || 0)));
  const word = profile.difficultyLabel && level > 0
    ? diffLabel(profile.difficultyLabel, t) : t('journey.stripUnrated');
  let style = '';
  for (const tag of trip.tags || []) {
    const w = String(tag).replace(/-/g, ' ').trim();
    if (w && w.split(/\s+/).length <= 2) { style = w; break; }
  }
  const range = trip.budget?.totalEur ? eurRange(trip.budget.totalEur, lang) : '';
  // The range in mono, "a person" in sans (T397, the mono rule).
  const [pre, fig, post] = range ? splitAround(t, 'journey.stripCostPp', { range }, 'range') : [];
  const cost = range
    ? <>{pre}<span className="mono">{fig}</span>{post}</>
    : '';
  return [
    { key: 'diff', level, word },
    { key: 'style', word: style || t('journey.stripMixed') },
    { key: 'cost', word: cost || t('journey.stripPrice') },
  ];
}

function SuitabilityStrip({ trip, t, lang }) {
  return <DetailStrip cells={journeyStripCells(trip, t, lang)} label={t('journey.stripAria')} />;
}

function HeroCredit({ hero, t }) {
  const page = safeUrl(hero?.page);
  if (!hero?.credit) return null;
  return (
    <p className="bpage-credit">
      <CameraIcon size={12} />
      <span className="lpage-credit-line">
        {page
          ? (
            <a href={page} target="_blank" rel="noopener noreferrer">
              {t('journey.photoOf', { name: hero.credit })}
            </a>
          )
          : <span>{t('journey.photoOf', { name: hero.credit })}</span>}
      </span>
    </p>
  );
}

/**
 * The first of the week's good months still ahead (this month counts), as
 * 1 to 12, or null. Seeds the town receipt's dates (T397, row T387-c; the
 * prop is FirstRunReceipt's, added by T392 for landing).
 */
function nextGoodMonth(months) {
  const list = (months || []).map(Number).filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (!list.length) return null;
  const now = new Date().getMonth() + 1;
  return list.find((m) => m >= now) ?? list[0];
}

/* The photograph of the day's main feature, when the wire carries one as
   itinerary[i].photo {url, w, h, name, credit, page}. No trip carries it yet:
   the named-highlight photos are T140's work, and until then the card shows
   no picture rather than borrowing the hero for every day. */
function DayPhoto({ photo, title, t }) {
  if (!photo?.url) return null;
  const page = safeUrl(photo.page);
  const credit = photo.credit && t('journey.photoOf', { name: photo.credit });
  return (
    <figure className="jpage-day-shot">
      <img
        src={photo.url}
        srcSet={srcSetFor(photo.url, 640)}
        sizes="(max-width: 1023px) 85vw, 240px"
        width={photo.w || undefined}
        height={photo.h || undefined}
        loading="lazy"
        decoding="async"
        alt={photo.name || title}
      />
      {credit && (
        <figcaption className="jpage-day-credit">
          {page ? <a href={page} target="_blank" rel="noopener noreferrer">{credit}</a> : credit}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * One itinerary day, as one card of the day track (T162): the number, the
 * title, the day's photograph when there is one, the measured line and the
 * night, with the three parts of the written day behind "More about this day".
 *
 * The measured line (dayStats: the distance, the ascent, the realistic hours)
 * and where you sleep stay in front, because those are what a reader compares
 * between days. The figures of the line are mono and its words are sans
 * (dayStatsParts), and an estimate mark sits on the one figure the ledger
 * calls an estimate. The night is the day's own sleep line ("Night:") and
 * nothing else: the "Base:" line read from the week plan is gone (T387, rule
 * "Derived copy stays silent"), because on a hut circuit it put the valley
 * town under every day that ends at a hut. The prose is folded
 * rather than shortened: it is authored copy and every word of it is still on
 * the page, one tap down, opening inside the card (T163).
 */
function Day({ day, index, night, t, lang, ledger }) {
  const [more, setMore] = React.useState(false);
  const panelId = React.useId();
  const parts = [['morning', day.morning], ['afternoon', day.afternoon], ['evening', day.evening]]
    .filter(([, text]) => text);
  const stats = dayStatsParts(day.dayStats, lang);
  return (
    <article className="jpage-day" id={`jday-${day.day}`}>
      <header className="jpage-day-head">
        <span className="jpage-day-n mono">{t('journey.dayN', { n: day.day })}</span>
        <h4>{day.title}</h4>
      </header>
      <DayPhoto photo={day.photo} title={day.title} t={t} />
      {stats.length > 0 && (
        <p className="jpage-day-stats">
          {stats.map((part) => (
            <React.Fragment key={part.key}>
              {part.sep}
              <span className={part.mono ? 'jpage-day-figs' : 'jpage-day-note'}>
                {/* Figures in mono, the words between them in sans (T397,
                    brief V4.4): "1,300 m" is a measure, "ascent" is a word. */}
                {part.mono
                  ? figureRuns(part.text).map((run, r) => (run.mono
                    ? <span key={r} className="mono">{run.text}</span>
                    : <React.Fragment key={r}>{run.text}</React.Fragment>))
                  : part.text}
                {part.mono && dayFigureEstimated(ledger, index, part.key) && <EstMark t={t} />}
              </span>
            </React.Fragment>
          ))}
        </p>
      )}
      {night && (
        <p className="jpage-day-sleep">
          <b>{t('journey.night')}</b>
          {' '}
          {night}
        </p>
      )}
      {parts.length > 0 && (
        <>
          <button
            type="button"
            className="tday-more"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            aria-controls={panelId}
          >
            <ChevronDownIcon size={13} className={more ? 'tday-more-chev is-open' : 'tday-more-chev'} />
            <span>{t('journey.moreAboutDay')}</span>
          </button>
          <div id={panelId} className={more ? 'tday-panel is-open' : 'tday-panel'}>
            <div className="tday-panel-in">
              {/* Mounted only while open, so a closed day carries no hidden
                  prose (verify_trip_page's journey check, T387). */}
              {more && (
                <div className="tday-prose">
                  {parts.map(([part, text]) => (
                    <div key={part} className="jpage-day-part">
                      <span className="jpage-day-when">{t(`journey.${part}`)}</span>
                      <Prose text={text} className="jpage-day-text" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </article>
  );
}

// logistics slot -> label key, in reading order. `other[]` rows carry their
// own labels from the source and render after these.
const LOG_SLOTS = [
  ['gettingThere', 'journey.logGetting'],
  ['transportRules', 'journey.logTransport'],
  ['connectivity', 'journey.logConnectivity'],
  ['money', 'journey.logMoney'],
  ['bookingWindows', 'journey.logBooking'],
  ['permits', 'journey.logPermits'],
  ['weather', 'journey.logWeather'],
  ['health', 'journey.logHealth'],
  ['emergency', 'journey.logEmergency'],
];

// logistics slot -> the row's icon; `other` rows fall back to the info mark.
const LOG_ICONS = {
  gettingThere: TrainIcon, transportRules: TicketIcon, connectivity: PlugIcon,
  money: PiggyIcon, bookingWindows: ClockIcon, permits: ShieldIcon,
  weather: CloudIcon, health: HeartIcon, emergency: AlertIcon,
};

// The sticky rail's stops (T165; seven groups since T387): the fold key each
// one opens, the section id it jumps to, and the label key. Page order.
const RAIL = [
  ['fit', 'sec-fit', 'journey.railFit'],
  ['budget', 'sec-budget', 'journey.railCosts'],
  ['ends', 'sec-ends', 'journey.railGetThere'],
  ['itin', 'sec-itin', 'journey.railWeek'],
  ['sleep', 'sec-sleep', 'journey.railSleep'],
  ['prep', 'sec-prep', 'journey.railPrepare'],
  ['wrong', 'sec-wrong', 'journey.railRisks'],
];

const BUDGET_ROWS = [
  ['accommodation', 'journey.bAccommodation'],
  ['food', 'journey.bFood'],
  ['transport', 'journey.bTransport'],
  ['activities', 'journey.bActivities'],
];

/** Still blocks at the final size of the page head (rule "Loading"). */
function PageSkeleton({ t }) {
  return (
    <div className="bpage-wrap jpage-skel" role="status" aria-busy="true">
      <span className="sr-only">{t('journey.loadingWeek')}</span>
      <span className="jskel-line is-title" aria-hidden="true" />
      <span className="jskel-photo is-hero" aria-hidden="true" />
      <span className="jskel-line" aria-hidden="true" />
      <span className="jskel-line is-short" aria-hidden="true" />
    </div>
  );
}

export function JourneyPage({
  id, gatewayDest, railFrom = null, onClose, onSelectDest, onOpenJourney,
  // The Lifestyle panel's "Where you sleep" answer and the tiers the dataset
  // offers (T173). With a setter the receipt gets the stepped slider; without
  // one it stays the authored range it always was.
  stayTier = 'home', stayTiers = null, onChangeStayTier = null,
  // The save star (rule "Navigation": every detail page has a star and a
  // share in its bar). FavStar renders nothing until the host passes onFav.
  fav = false, onFav = null,
}) {
  const { t, lang } = useI18n();
  const firstRun = useFirstRun();
  // undefined = loading, null = not published, 'failed' = the load failed.
  const [trip, setTrip] = useState(undefined);
  const [tries, setTries] = useState(0);
  const { isOpen, toggle, setOpen } = useFolds(OPEN_BY_DEFAULT, id);
  const scrollEl = useRef(null);
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const titleEl = useRef(null);
  const heroEl = useRef(null);
  const [titleGone, setTitleGone] = useState(false);
  const [library, setLibrary] = useState(null);   // every card, for the exits
  const [copied, setCopied] = useState(false);
  const [townOpen, setTownOpen] = useState(false);

  useEffect(() => {
    let live = true;
    setTrip(undefined);
    setTownOpen(false);
    loadJourney(id)
      .then((row) => { if (live) setTrip(row); })
      .catch(() => { if (live) setTrip('failed'); });
    return () => { live = false; };
  }, [id, tries]);

  // The week's address (rule "Navigation", T376-e). Opening the page pushes
  // one history entry carrying #journey=<id>, so the browser Back closes the
  // page; a jump to another week replaces it. The app's boot reader and the
  // URL writer are the shell's (register rows); this keeps the page's half.
  const pushed = useRef(false);
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
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [onClose]);
  // Every way out of the page (the back control, Escape) goes through the
  // history entry the page pushed, so Back and close are one action.
  const close = useCallback(() => {
    if (pushed.current) {
      try { window.history.back(); return; } catch { /* fall through */ }
    }
    onClose();
  }, [onClose]);

  // Focus management for the dialog: initial focus, a Tab cycle and focus
  // restoration, not just Escape. See hooks/useFocusTrap.js.
  useFocusTrap(pageRef, close, { initialFocusRef: backRef });

  useEffect(() => { scrollEl.current?.scrollTo?.(0, 0); }, [id]);

  const tripReady = trip && trip !== 'failed' ? trip : null;
  // The rail reads the page's sections once they are in the DOM and the
  // scroller's ref is attached: an effect runs after both, a layout effect
  // in the rail itself runs before the parent's ref (T387).
  const [railReady, setRailReady] = useState(null);
  useEffect(() => { setRailReady(tripReady ? tripReady.id : null); }, [tripReady]);

  useEffect(() => {
    const el = titleEl.current;
    const root = scrollEl.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting),
      { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [tripReady?.id]);

  useEffect(() => {
    let live = true;
    loadAllJourneyCards().then((rows) => { if (live) setLibrary(rows); });
    return () => { live = false; };
  }, []);

  // The price row under the weather strip (T103): the stay-price curve of the
  // nearest destination that has one. undefined while loading, null if none.
  const [priceDests, setPriceDests] = useState(undefined);
  useEffect(() => {
    let live = true;
    setPriceDests(undefined);
    const c = tripReady?.coordinates;
    if (!tripReady || !Number.isFinite(c?.lat) || !Number.isFinite(c?.lon)) {
      if (tripReady) setPriceDests(null);
      return undefined;
    }
    catalogue.ensureNear(c.lat, c.lon, MAX_KM)
      .then(() => { if (live) setPriceDests(catalogue.snapshot()?.destinations || null); })
      .catch(() => { if (live) setPriceDests(null); });
    return () => { live = false; };
  }, [tripReady]);
  const price = useMemo(() => {
    if (priceDests === undefined) return undefined;
    const c = tripReady?.coordinates;
    return priceDests ? priceRow(priceDests, c?.lat, c?.lon, tripReady?.bestPeriod?.months) : null;
  }, [priceDests, tripReady]);

  // The town the week could be priced at (T099): the nearest catalogue
  // destination with a bed and a food figure. Since T387 it is a second view
  // of the cost, never in place of the trip's own budget.
  const priceAt = useMemo(() => {
    const c = tripReady?.coordinates;
    return priceDests ? nearestPricedDest(priceDests, c?.lat, c?.lon, MAX_KM) : null;
  }, [priceDests, tripReady]);
  // True while the town receipt's "Set your dates" is the page's one primary.
  const [frrPrimary, setFrrPrimary] = useState(false);

  // Trip length (T101, spec I2): the whole week as written, or its short
  // version, a run of the best three or four days with its own total. The
  // length is remembered per viewer and shared with the browse filter.
  const [length, setLength] = useState(readTripLength);
  // The card's photograph grows into this hero (rule "List to detail",
  // lib/sharedElement.js; JourneysSection starts it). A no-op unless a card
  // opened this page inside a view transition.
  const claimHero = useCallback((el) => claimShared(el, id), [id]);
  const [swaps, setSwaps] = useState(0);
  const pickLength = (next) => { setLength(next); writeTripLength(next); setSwaps((n) => n + 1); };
  const lengths = useMemo(() => (tripReady ? tripLengths(tripReady) : null), [tripReady]);
  const isShort = length === SHORT && !!lengths && lengths.short.days < lengths.week.days;
  const view = lengths ? (isShort ? lengths.short : lengths.week) : null;
  // The trip as the page shows it at this length: the kept days, renumbered
  // from 1 so "Day 1 of 4" matches the card, and the budget at that length.
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

  const ledger = useMemo(() => figureLedger(tripReady), [tripReady]);
  const signals = useMemo(() => accuracySignals(tripReady, ledger), [tripReady, ledger]);
  const railItems = useMemo(
    () => RAIL.map(([key, sid, label]) => ({ key, id: sid, label: t(label) })), [t]);
  const hook = useMemo(() => hookLine(tripReady), [tripReady]);
  const rail = useMemo(() => railAlternative(railFrom, tripReady), [railFrom, tripReady]);
  const detail = useMemo(() => humanDetail(tripReady), [tripReady]);

  // The three readings of the week (T170), placed in the groups below.
  const shape = useMemo(() => weekShape(viewTrip), [viewTrip]);

  // The day in view on the day track is the selected day of the whole week
  // (T397, brief V4.1): the week shape's bar and the climb profile's marker
  // follow it, and a day number under the week shape brings that day onto
  // the track. DayTrack is the shell's and has no onSelect yet (register
  // row), so its position is read from its own dots, which it keeps on the
  // card in view, and a pick scrolls the track the way its buttons do.
  const [daysNode, setDaysNode] = useState(null);
  const [selIdx, setSelIdx] = useState(0);
  useEffect(() => {
    if (!daysNode) return undefined;
    const read = () => {
      const dots = [...daysNode.querySelectorAll('.dtrack-dot')];
      const i = dots.findIndex((d) => d.classList.contains('is-on'));
      if (i >= 0) setSelIdx(i);
    };
    read();
    const watch = new MutationObserver(read);
    watch.observe(daysNode, { subtree: true, attributes: true, attributeFilter: ['class'] });
    return () => watch.disconnect();
  }, [daysNode]);
  const selDay = viewTrip?.itinerary?.[selIdx]?.day ?? null;
  const pickDay = useCallback((dayNo) => {
    const card = daysNode?.querySelector(`#jday-${dayNo}`);
    const track = card?.parentElement;
    if (!card || !track) return;
    const first = track.children[0]?.offsetLeft || 0;
    track.scrollTo({ left: card.offsetLeft - first, behavior: scrollBehavior() });
  }, [daysNode]);
  const ends = useMemo(() => tripEnds(viewTrip, parseGateway), [viewTrip]);
  const plan = useMemo(() => weatherPlan(viewTrip), [viewTrip]);
  const conditions = CONDITION_TYPES.has(viewTrip?.tripTypeSlug) && !!plan?.groups;
  const weatherShows = !!plan?.show && plan.days.some((d) => d.fallback || d.swap);
  // One base all week and no night at a hut: only then is a week based in
  // the nearest town the same trip, so only then is it offered.
  const oneBase = shape.bases.runs.length === 1
    && !(viewTrip?.itinerary || []).some((d) => BED_IN_TITLE.test(String(d.title || '')));

  // The Lifestyle slider (T173): the stops are the panel's sleep groups, and
  // the stop the traveller is on places every receipt figure on its range.
  const sleepStops = useMemo(() => offeredSleepGroups(stayTiers), [stayTiers]);
  const stopAt = stopIndexFor(sleepStops, stayTier);
  const slides = !!onChangeStayTier && sleepStops.length > 1 && !!viewTrip?.budget?.totalEur;
  const figs = useMemo(() => (slides
    ? tripFigures(viewTrip.budget, stopShare(stopAt, sleepStops.length), viewDays)
    : null), [slides, viewTrip, viewDays, stopAt, sleepStops.length]);
  const pickStop = (i) => {
    const g = sleepStops[i];
    if (g && onChangeStayTier) onChangeStayTier(tierForGroup(g, stayTier));
  };

  const exits = useMemo(() => {
    if (!tripReady || !library?.length) return [];
    const me = library.find((c) => c.id === tripReady.id);
    return journeyExits(me || tripReady, library);
  }, [tripReady, library]);

  // The week at a glance, as the Fit group reads it: the three rows a
  // traveller decides by lead (the months, the difficulty, the car), then the
  // rest. The length, the budget and the gateway live in their own places
  // (the length control, the Cost group, Getting there) and are not repeated.
  const facts = useMemo(() => {
    if (!tripReady) return [];
    const profile = tripReady.profile || {};
    const best = tripReady.bestPeriod || {};
    const yn = (v) => (v == null ? null : t(v ? 'journey.yes' : 'journey.no'));
    const notRecorded = t('journey.fNotRecorded');

    return [
      {
        key: 'best',
        label: t('journey.fBest'),
        ...(best.monthNames?.length || price ? {
          strip: {
            price,
            good: best.months || [],
            avoid: best.avoidMonths || [],
            info: (best.note || best.avoid) && (
              <>
                {best.note && <p>{best.note}</p>}
                {best.avoid && <p>{best.avoid}</p>}
              </>
            ),
          },
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      {
        key: 'diff',
        label: t('journey.fDifficulty'),
        ...(profile.difficultyLabel ? {
          meter: {
            level: profile.difficulty,
            label: diffLabel(profile.difficultyLabel, t),
            note: difficultyNoteText(profile.difficultyNote, profile.difficultyLabel),
          },
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      {
        key: 'car',
        label: t('journey.fCar'),
        ...(profile.carRequired != null ? {
          value: yn(profile.carRequired),
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      {
        key: 'crowd',
        label: t('journey.fCrowds'),
        ...(profile.crowdLevel ? {
          value: t(`journey.crowd${profile.crowdLevel}`),
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      {
        key: 'family',
        label: t('journey.fFamily'),
        ...(profile.familyFriendly != null ? {
          value: yn(profile.familyFriendly),
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      {
        key: 'lang',
        label: t('journey.fLanguages'),
        ...(tripReady.languages?.length ? {
          value: tripReady.languages.join(', '),
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      tripReady.emergencyNumber && {
        key: 'sos',
        label: t('journey.fEmergency'),
        value: String(tripReady.emergencyNumber),
        mono: true,
      },
    ].filter(Boolean);
  }, [tripReady, t, price]);

  const onShare = async () => {
    const url = journeyShareUrl(tripReady?.id || id);
    try {
      if (navigator.share) {
        await navigator.share({ title: tripReady?.title || id, url });
        return;
      }
    } catch { return; /* the traveller closed the share sheet */ }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { /* no clipboard: the address bar carries the link */ }
  };

  const bar = (title) => (
    <div className="tpage-bar">
      <button type="button" className="tpage-back" onClick={close} ref={backRef}>
        <ArrowLeftIcon size={15} />
        <span>{title}</span>
      </button>
      <span className={`tpage-bar-title ${titleGone ? 'on' : ''}`}>{tripReady?.title || ''}</span>
      {tripReady && (
        <div className="jpage-bar-acts">
          <FavStar on={fav} onToggle={onFav} />
          <button type="button" className="tpage-bar-act jpage-share" onClick={onShare}
            aria-label={t('journey.shareLink')}>
            <ShareIcon size={15} />
          </button>
          <span className="sr-only" role="status">{copied ? t('trip.linkCopied') : ''}</span>
          {copied && <span className="jpage-copied" aria-hidden="true">{t('trip.linkCopied')}</span>}
        </div>
      )}
    </div>
  );

  if (trip === undefined) {
    return (
      <div className="tpage bpage jpage" role="dialog" aria-modal="true"
        aria-label={t('journey.backStyles')} ref={pageRef}>
        {bar(t('journey.backStyles'))}
        <div className="tpage-scroll"><PageSkeleton t={t} /></div>
      </div>
    );
  }
  if (trip === 'failed') {
    return (
      <div className="tpage bpage jpage" role="dialog" aria-modal="true"
        aria-label={t('journey.backStyles')} ref={pageRef}>
        {bar(t('journey.backStyles'))}
        <div className="tpage-scroll">
          <div className="bpage-wrap">
            <ErrorBlock message={t('journey.pageFailed')}
              onRetry={() => setTries((n) => n + 1)}
              retryLabel={t('layer.retry')} />
          </div>
        </div>
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="tpage bpage jpage" role="dialog" aria-modal="true"
        aria-label={t('journey.backStyles')} ref={pageRef}>
        {bar(t('journey.backStyles'))}
        <div className="tpage-scroll">
          <div className="places-empty empty-act">
            <p>{t('journey.gone')}</p>
            <button type="button" className="cov-empty-btn" onClick={close}>{t('empty.trips')}</button>
          </div>
        </div>
      </div>
    );
  }

  const coords = trip.coordinates || {};
  const pinReal = coords.precision === 'source' || coords.precision === 'city';
  const budget = viewTrip.budget || {};
  // The booking order (T169) carries every booking-window clause, so the three
  // slots it reads are not printed a second time when it has steps to show.
  const bookSource = bookingSource(trip);
  const bookSteps = bookSource ? bookingOrder(bookSource).steps.length > 0 : false;
  const BOOK_SLOTS = ['bookingWindows', 'bookingTimeline', 'hutBooking'];
  // The data sheet reorders itself by trip type (T175, spec E5).
  const specRows = dataSheetRows(trip, { skip: bookSteps ? BOOK_SLOTS : [] });
  const logRows = LOG_SLOTS
    .filter(([slot]) => !(bookSteps && BOOK_SLOTS.includes(slot)))
    .map(([slot, key]) => (trip.logistics?.[slot]
      ? { slot, label: t(key), text: trip.logistics[slot], icon: LOG_ICONS[slot] } : null))
    .filter(Boolean)
    .concat((trip.logistics?.other || [])
      .filter((row) => row?.text)
      .map((row, i) => ({ slot: `other-${i}`, label: row.label || '', text: row.text, icon: InfoIcon })));

  // The three advisory sections run as decks of cards, 35 words at most (T167).
  const logCards = buildCards(logRows.map((row) => ({
    key: row.slot, text: row.text, label: row.label,
    icon: row.slot === 'money' ? CoinIcon : row.icon,
  })), 'tip');
  const tipCards = buildCards((trip.proTips || []).map((text, i) => ({ key: `tip-${i}`, text })), 'tip');
  const riskCards = buildCards((trip.whatCouldGoWrong || []).map((item, i) => ({
    key: `risk-${i}`, text: riskText(item, (text) => t('journey.wrongDo', { text })),
  })), 'risk');

  // Who the week is not for, from the trip's own facts only: the generic
  // "check today's conditions" fallback says nothing about this week.
  const notFor = notForLines('journey', {
    carRequired: trip.profile?.carRequired,
    familyFriendly: trip.profile?.familyFriendly,
    label: trip.profile?.difficultyLabel,
    word: trip.profile?.difficultyLabel ? diffLabel(trip.profile.difficultyLabel, t) : '',
  }).filter((l) => l.key !== 'notfor.conditions');

  // The rest of the authored hook and summary, after the one-line hook.
  const fromHook = hook?.source === 'hook';
  const fromSummary = hook?.source === 'summary';
  const hookText = fromHook ? hook.rest : trip.hook;
  const sumText = fromSummary ? hook.rest : trip.summary;
  const party = Math.max(1, Number(firstRun?.choices?.group_size) || 1);
  const totalPp = figs?.total != null ? figs.total : null;
  const eurExact = (n) => eurCents(n, lang);
  const partyFigure = party > 1 && budget.totalEur
    ? (totalPp != null
      ? eurExact(totalPp * party)
      : eurRange({ low: budget.totalEur.low * party, high: budget.totalEur.high * party }, lang))
    : '';
  const gateway = (trip.gateways?.length || trip.gatewayAirport) ? gatewayFact(trip, t) : null;

  return (
    <div className="tpage bpage jpage" role="dialog" aria-modal="true" aria-label={trip.title} ref={pageRef}>
      {bar(typeLabel(trip.tripTypeSlug, t, trip.tripType))}

      <div className="tpage-scroll" ref={scrollEl}>
        <SectionRail
          items={railItems}
          scrollRef={scrollEl}
          heroRef={heroEl}
          ready={railReady}
          ariaLabel={t('journey.railAria')}
          onJump={(key) => setOpen((o) => new Set([...o, key]))}
        />
        <div className="bpage-wrap jpage-wrap">
          <div className="bpage-head" ref={titleEl}>
            <h1 className="bpage-name">
              <CountryFlag country={trip.countryCode} size={15} className="bpage-flag" />
              {trip.title}
            </h1>
          </div>

          <figure className="bpage-gallery jpage-hero" ref={heroEl}>
            {trip.hero?.url && (
              <img
                className="bpage-shot jpage-shot"
                ref={claimHero}
                src={trip.hero.url}
                srcSet={srcSetFor(trip.hero.url, 1280)}
                sizes="(max-width: 900px) 96vw, 720px"
                alt={trip.title}
              />
            )}
            <SuitabilityStrip trip={viewTrip} t={t} lang={lang} />
            {trip.hero?.url && <HeroCredit hero={trip.hero} t={t} />}
          </figure>

          {lengths && lengths.short.days < lengths.week.days && (
            <LengthPicker lengths={lengths} value={isShort ? SHORT : length} onChange={pickLength} t={t} />
          )}

          {hook && (
            hook.built
              ? <p className="bpage-lede jpage-hook">{t('journey.hookBuilt', hook.built)}</p>
              : <Prose text={hook.line} className="bpage-lede jpage-hook" />
          )}

          <NotFor lines={notFor} />

          <p className="jpage-loc">
            <MapPinIcon size={15} className="jpage-loc-pin" />
            <span className="jpage-loc-text">{[trip.subRegion, trip.country].filter(Boolean).join(', ')}</span>
            {pinReal && (
              <>
                <span className="jpage-loc-coord mono">{fmtCoord(coords.lat)}, {fmtCoord(coords.lon)}</span>
                <a
                  className="jpage-loc-link"
                  href={trailheadDirectionsUrl(coords.lat, coords.lon)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('journey.directions')}
                </a>
              </>
            )}
          </p>

          <div className="jpage-body">
            <Fold level={2}
              id="sec-fit"
              icon={InfoIcon}
              title={t('journey.grpFit')}
              open={isOpen('fit')}
              onToggle={() => toggle('fit')}
              className="jpage-fit"
            >
              {facts.length > 0 && (
                <dl className="jpage-facts">
                  {facts.map((fact) => (
                    <div key={fact.key} className={`bpage-fact ${fact.className || ''}`}>
                      <dt>{fact.label}</dt>
                      <dd className={fact.mono ? 'mono' : ''}>
                        {fact.strip ? (
                          <MonthStrip {...fact.strip} />
                        ) : fact.meter ? (
                          <DifficultyMeter {...fact.meter} note={fact.meter.note && <Prose text={fact.meter.note} className="" />} />
                        ) : (
                          <>
                            {fact.value}
                            {fact.note && <small>{fact.note}</small>}
                          </>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {(hookText || (sumText && !trip.summaryGenerated) || trip.tags?.length > 0) && (
                <div className="jblock jpage-why" id="jb-why">
                  <h3 className="jblock-h">{t('journey.whyHead')}</h3>
                  {hookText && <Prose text={hookText} />}
                  {sumText && !trip.summaryGenerated && <Prose text={sumText} />}
                  {trip.tags?.length > 0 && (
                    <ul className="bpage-tags jpage-tags">
                      {trip.tags.slice(0, 6).map((tag) => (
                        <li key={tag}>{String(tag).replace(/-/g, ' ')}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {specRows.length > 0 && (
                <div className="jblock jpage-spec" id="jb-spec">
                  <h3 className="jblock-h">{t('journey.specHead')}</h3>
                  <dl>
                    {specRows.map((row, i) => (
                      <div key={row.field} className={`bpage-fact dsheet-row${i < 3 ? ' dsheet-lead' : ''}`}>
                        <dt>{t(row.labelKey)}</dt>
                        <dd className={row.kind === 'num' || row.kind === 'eur' ? 'mono' : ''}>
                          {row.kind === 'num' && (
                            <>
                              {new Intl.NumberFormat(lang).format(row.value)} {row.unit}
                              {row.perDay > 0 && <small>{t('journey.dsPerDay', { n: row.perDay })}</small>}
                            </>
                          )}
                          {row.kind === 'eur' && (
                            <>
                              {eurRange({ low: row.low, high: row.high }, lang)}
                              <small>{t('journey.dsFoodNote')}</small>
                            </>
                          )}
                          {row.kind === 'months' && <MonthStrip good={row.good} avoid={row.avoid} />}
                          {row.kind === 'text' && row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </Fold>

            <Fold level={2}
              id="sec-budget"
              icon={ReceiptIcon}
              title={isShort ? t('journey.budgetHeadShort', { n: viewDays }) : t('journey.budgetHead')}
              summary={budget.totalEur ? t('journey.stripCostPp', { range: eurRange(budget.totalEur, lang) }) : ''}
              open={isOpen('budget')}
              onToggle={() => toggle('budget')}
              className="jpage-budget jpage-side"
            >
              {/* The trip's own itemised budget is the receipt (rule
                  "Receipt, extended", T376-b): the cost bar, the lines with
                  their est marks, the total a person, the party, and the one
                  Lifestyle control under it. */}
              {budget.breakdown ? (
                <div className="jrcpt">
                  <CostBar t={t} segments={BUDGET_ROWS.map(([slot, key]) => {
                    const row = budget.breakdown[slot];
                    if (!row || (row.lowEur == null && row.highEur == null)) return null;
                    const lo = row.lowEur ?? row.highEur;
                    const hi = row.highEur ?? row.lowEur;
                    return { slot, label: t(key), note: row.note, weight: Math.max(0, (lo + hi) / 2), figure: eurRange({ low: row.lowEur, high: row.highEur }, lang) };
                  }).filter(Boolean)} />
                  <ul className="jpage-budget-rows">
                    {BUDGET_ROWS.map(([slot, key]) => {
                      const row = budget.breakdown[slot];
                      if (!row || (row.lowEur == null && row.highEur == null)) return null;
                      return (
                        <li key={slot}>
                          <span className="jpage-budget-label">
                            {t(key)}
                            {row.note && <small>{row.note}</small>}
                          </span>
                          <span className="jpage-budget-eur mono">
                            {figs?.rows[slot] != null
                              ? <SettledEur value={figs.rows[slot]} lang={lang} />
                              : eurRange({ low: row.lowEur, high: row.highEur }, lang)}
                            {anyEstimated(ledger, `budget.breakdown.${slot}`) && <EstMark t={t} />}
                          </span>
                        </li>
                      );
                    })}
                    {budget.totalEur && (
                      <li className="jpage-budget-total">
                        <span className="jpage-budget-label">{t('journey.budgetTotalPp')}</span>
                        <span className="jpage-budget-eur mono">
                          {totalPp != null
                            ? <SettledEur value={totalPp} lang={lang} />
                            : eurRange(budget.totalEur, lang)}
                          {anyEstimated(ledger, 'budget.totalEur') && <EstMark t={t} />}
                        </span>
                      </li>
                    )}
                    {partyFigure && (
                      <li className="jpage-budget-party">
                        <span className="jpage-budget-label">{t('journey.budgetParty', { n: party })}</span>
                        <span className="jpage-budget-eur mono">{partyFigure}</span>
                      </li>
                    )}
                  </ul>
                  <p className="bpage-note">
                    {budget.totalNote || t('journey.fBudgetNote')}
                  </p>
                  {/* Where you sleep, as a stepped slider (T173): it moves every
                      figure above and says in words what that figure buys. */}
                  {figs && (
                    <LifestyleSlider
                      stops={sleepStops}
                      index={stopAt}
                      onPick={pickStop}
                      figures={figs}
                      t={t}
                      lang={lang}
                    />
                  )}
                </div>
              ) : budget.totalEur ? (
                <ul className="jpage-budget-rows">
                  <li className="jpage-budget-total">
                    <span className="jpage-budget-label">{t('journey.budgetTotalPp')}</span>
                    <span className="jpage-budget-eur mono">
                      {eurRange(budget.totalEur, lang)}
                      {anyEstimated(ledger, 'budget.totalEur') && <EstMark t={t} />}
                    </span>
                  </li>
                </ul>
              ) : (
                <p className="bpage-note">{t('journey.budgetNone')}</p>
              )}
              <ReportProblem priceOnly item={{ layer: 'trip', id: trip.id, name: trip.title }} />
              {rail && (
                <div className="jpage-rail">
                  <span className="jpage-rail-label">{t('journey.railLabel')}</span>
                  <p className="jpage-rail-line">
                    {t('journey.railLine', {
                      eur: new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(rail.eurPp),
                      time: minutesText(Math.round(rail.hours * 60)),
                      from: rail.from,
                    })}
                    {rail.est && <EstMark t={t} />}
                  </p>
                  <p className="bpage-note">{t('journey.railNote')}</p>
                </div>
              )}
              {/* The nearest town's receipt (T099), a labelled second view
                  for a week spent in one base. Its own stay select and its
                  default dates are the landing surface's to change (register
                  row); nights are the week's nights, days minus one. */}
              {priceAt && oneBase && (
                <div className="jpage-town">
                  <button
                    type="button"
                    className="jpage-town-btn"
                    aria-expanded={townOpen}
                    onClick={() => {
                      setTownOpen((v) => !v);
                      if (townOpen) setFrrPrimary(false);
                    }}
                  >
                    <ChevronDownIcon size={14} className={townOpen ? 'is-open' : ''} />
                    <span>{t('journey.townView', { city: priceAt.dest.city })}</span>
                  </button>
                  {townOpen && (
                    <div className="jpage-town-body">
                      <p className="bpage-note">{t('journey.townNote', { city: priceAt.dest.city })}</p>
                      <FirstRunReceipt
                        dest={priceAt.dest}
                        receiptKey={`journey:${trip.id}`}
                        headingLevel={3}
                        nights={Math.max(1, viewDays - 1)}
                        hideStay
                        seedMonth={nextGoodMonth(trip.bestPeriod?.months)}
                        onPrimaryChange={setFrrPrimary}
                      />
                    </div>
                  )}
                </div>
              )}
            </Fold>

            {(ends || gateway) && (
              <Fold level={2}
                id="sec-ends"
                icon={LuggageIcon}
                title={t('journey.grpGetThere')}
                summary={ends?.arrive?.landBy && ends?.arrive?.timed
                  ? t('journey.endsSummary', { time: ends.arrive.landBy, code: ends.arrive.timed.code })
                  : (gateway?.rows || []).map((r) => r.code).filter(Boolean).join(', ')}
                open={isOpen('ends')}
                onToggle={() => toggle('ends')}
                className="jpage-getthere"
              >
                {ends ? <EndsBlock ends={ends} /> : (
                  <dl>
                    <div className="bpage-fact">
                      <dt>{t('journey.fGateway')}</dt>
                      <dd>
                        <GatewayList
                          rows={gateway.rows}
                          more={gateway.more && <Prose text={gateway.more} className="" />}
                        />
                      </dd>
                    </div>
                  </dl>
                )}
              </Fold>
            )}

            {trip.itinerary?.length > 0 && (
              <Fold level={2}
                id="sec-itin"
                icon={CalendarIcon}
                title={t('journey.grpWeek')}
                summary={isShort ? t('journey.itinSummaryShort', { n: viewDays, all: trip.itinerary.length }) : t('journey.itinSummary', { n: trip.itinerary.length })}
                open={isOpen('itin')}
                onToggle={() => toggle('itin')}
                className="jpage-itin"
              >
                <WeekShapeBlock shape={shape} sel={daysNode ? selDay : null} onPick={daysNode ? pickDay : null} />
                {/* The climb day by day and, on a ride, the surface and
                    traffic (T174): drawn with the trail pages' components. */}
                <JourneyRoute trip={viewTrip} t={t} sel={daysNode ? selDay : null} />
                <WeatherBlock plan={plan} conditions={conditions} show={weatherShows} />
                <div className="jblock jpage-days" id="jb-days" ref={setDaysNode}>
                  <h3 className="jblock-h">{t('journey.itinHead')}</h3>
                  {/* A new length is a new set of days: the track is mounted
                      afresh (on Day 1) and fades in over --dur-2, so the
                      change is seen, not only read (T397, brief V4.5). */}
                  <div key={swaps} className={swaps ? 'jpage-days-swap' : undefined}>
                  <DayTrack label={t('journey.trackAria')} t={t}>
                    {viewTrip.itinerary.map((day, k) => (
                      <Day
                        key={`${length}-${day.day}`}
                        day={day}
                        index={view.indexes[k] ?? k}
                        night={day.sleep || null}
                        t={t}
                        lang={lang}
                        ledger={ledger}
                      />
                    ))}
                  </DayTrack>
                  </div>
                </div>
              </Fold>
            )}

            {trip.accommodationStrategy?.length > 0 && (
              <Fold level={2}
                id="sec-sleep"
                icon={BedIcon}
                title={t('journey.sleepHead')}
                open={isOpen('sleep')}
                onToggle={() => toggle('sleep')}
                className="jpage-sleep"
              >
                {trip.accommodationStrategy.map((stay) => (
                  <article key={`${stay.rank}-${stay.name}`} className="jpage-stay">
                    <header>
                      <h3>{stay.name}</h3>
                      <span className="jpage-stay-kind">
                        {[stay.style, stay.location].filter(Boolean).join(', ')}
                      </span>
                    </header>
                    {stay.description && <LongProse text={stay.description} className="jpage-stay-desc" t={t} />}
                    {(stay.booking || stayPriceText(stay, lang)) && (
                      <p className="jpage-stay-book">
                        {stayPriceText(stay, lang) && <span className="mono">{stayPriceText(stay, lang)}</span>}
                        {stayPriceText(stay, lang) && stay.booking ? '. ' : ''}
                        {stay.booking && (
                          <span>
                            {t('journey.bookBy')}
                            {' '}
                            {stay.booking}
                          </span>
                        )}
                      </p>
                    )}
                  </article>
                ))}
              </Fold>
            )}

              <Fold level={2}
                id="sec-prep"
                icon={BackpackIcon}
                title={t('journey.grpPrepare')}
                open={isOpen('prep')}
                onToggle={() => toggle('prep')}
                className="jpage-prep"
              >
                {bookSteps && (
                  <BookingOrder tripId={trip.id} source={bookSource} bestMonths={trip.bestPeriod?.months} />
                )}
                <div className="jblock jpage-pack" id="jb-pack">
                  <h3 className="jblock-h">{t('journey.packHead')}</h3>
                  <PackGrid trip={trip} />
                </div>
                {logRows.length > 0 && (
                  <div className="jblock jpage-log" id="jb-log">
                    <h3 className="jblock-h">{t('journey.logHead')}</h3>
                    <FlashDeck id="deck-log" cards={logCards} label={t('journey.logHead')} t={t} />
                  </div>
                )}
                {trip.proTips?.length > 0 && (
                  <div className="jblock jpage-tips" id="jb-tips">
                    <h3 className="jblock-h">{t('journey.tipsHead')}</h3>
                    <FlashDeck id="deck-tips" cards={tipCards} label={t('journey.tipsHead')} t={t} />
                  </div>
                )}
              </Fold>

            {/* Deliberately NOT folded. Everything else on this page may be one
                tap away; a safety advisory that a reader has to discover is a
                safety advisory that does not work. */}
            {trip.whatCouldGoWrong?.length > 0 && (
              <section className="lpage-hazards jpage-risks" id="sec-wrong">
                <h2>
                  <AlertIcon size={15} />
                  {t('journey.wrongHead')}
                </h2>
                <FlashDeck id="deck-wrong" cards={riskCards} label={t('journey.wrongHead')} t={t} />
              </section>
            )}

            {/* T093: the count and the wording come from the same ledger the
                figure footer counts, so the two can never contradict each
                other. A trip with nothing to check says nothing here. */}
            {signals.count > 0 && (
              <p className="jpage-verify" role="note">
                <AlertIcon size={13} />
                {t(signals.count === 1
                  ? (signals.volatile ? 'journey.verifyNoteOne' : 'journey.verifyNoteOneNoPrice')
                  : (signals.volatile ? 'journey.verifyNote' : 'journey.verifyNoteNoPrice'), { n: signals.count })}
              </p>
            )}

            {gatewayDest && (
              <button
                type="button"
                className={`bpage-base${frrPrimary ? ' is-quiet' : ''}`}
                onClick={() => onSelectDest?.(gatewayDest.id)}
              >
                <span>{t('journey.ctaPricesIn', { city: gatewayDest.city })}</span>
                <ChevronRightIcon size={15} />
              </button>
            )}

            <DetailExits
              head={t('journey.exitsHead')}
              headId="jpage-exits-h"
              exits={exits.map(({ kind, card }) => ({
                key: card.id,
                kindLabel: kind === 'easier' ? t('journey.exitEasier')
                  : kind === 'cheaper' ? t('journey.exitCheaper')
                    : t('journey.exitNearby'),
                title: card.title,
                meta: [t('journey.nDays', { n: card.days || 7 }),
                  card.eur ? t('journey.rangePp', { range: eurRange(card.eur, lang) }) : null,
                  card.diffLabel ? diffLabel(card.diffLabel, t) : null,
                ].filter(Boolean).join(', '),
                onOpen: () => onOpenJourney?.(card),
              }))}
            />

            <section className="bpage-sources">
              <h2>{t('journey.sourcesHead')}</h2>
              {ledger && (
                <p className="bpage-attrib jpage-figures">
                  {t('journey.figureFooter', {
                    sourced: ledger.sourced,
                    total: ledger.total,
                    derived: ledger.derived,
                    estimated: ledger.estimated,
                    month: monthLabel(ledger.checkedAt, lang) || lastCheckedMonth(trip, lang) || trip.dataVintage || 2026,
                  })}
                </p>
              )}
              <p className="bpage-attrib">
                {lastCheckedMonth(trip, lang) && !ledger
                  ? t('journey.vintageChecked', { year: trip.dataVintage || 2026, month: lastCheckedMonth(trip, lang) })
                  : t('journey.vintage', { year: trip.dataVintage || 2026 })}
              </p>
              {detail && (
                <p className="bpage-attrib jpage-detail">
                  <b>{t('journey.detailHead')}</b>
                  {' '}
                  {detail}
                </p>
              )}
              <p className="bpage-attrib">{t('journey.credit')}</p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
