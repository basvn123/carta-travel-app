import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import {
  loadJourney, typeLabel, diffLabel, eurRange, boldSegments, lastCheckedMonth,
  dayStatsParts, riskText, stayPriceText, minutesText,
  figureLedger, anyEstimated, dayFigureEstimated, monthLabel, accuracySignals,
  hookLine, humanDetail, loadAllJourneyCards, journeyExits,
} from '../lib/journeys.js';
import { srcSetFor } from '../lib/heroImage.js';
import { trailheadDirectionsUrl } from '../lib/trailExport.js';
import { safeUrl } from '../lib/format.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { DetailStrip, DetailExits } from './DetailSkeleton.jsx';
import { previewWords } from '../lib/detailSkeleton.js';
import { Fold } from './Fold.jsx';
import { FlashDeck, CoinIcon } from './FlashDeck.jsx';
import { buildCards } from '../lib/flashcards.js';
import { CostBar } from './CostBar.jsx';
import { PackGrid } from './PackGrid.jsx';
import { NotFor } from '../components/NotFor.jsx';
import { dataSheetRows } from '../lib/dataSheet.js';
import { notForLines } from '../lib/notFor.js';
import { BookingOrder } from './BookingOrder.jsx';
import { WeekPlan } from './WeekPlan.jsx';
import { DayTrack } from './DayTrack.jsx';
import { LengthPicker } from './LengthPicker.jsx';
import { weekBases } from '../lib/weekShape.js';
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
import { LifestyleSlider, MovingEur } from './LifestyleSlider.jsx';
import { offeredSleepGroups, tierForGroup } from '../lib/sleepGroups.js';
import { stopIndexFor, stopShare, tripFigures } from '../lib/lifestyleSlider.js';
import { SHORT, readTripLength, tripLengths, writeTripLength } from '../lib/tripLength.js';
import {
  ArrowLeftIcon, MapPinIcon, ChevronRightIcon, CameraIcon, AlertIcon,
  LinkIcon, ChevronDownIcon, CalendarIcon, ReceiptIcon, BedIcon,
  InfoIcon, BulbIcon, BackpackIcon, CompassIcon, TrainIcon, PlugIcon,
  TicketIcon, ClockIcon, CloudIcon, HeartIcon, ShieldIcon, PiggyIcon,
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
 */

const fmtCoord = (n) => (Number.isFinite(n) ? n.toFixed(4) : '');

/** What opens on arrival: the sections you travel with. */
const OPEN_BY_DEFAULT = ['facts', 'route', 'budget', 'itin', 'sleep'];

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
  const cost = trip.budget?.totalEur ? eurRange(trip.budget.totalEur, lang) : '';
  return [
    { key: 'diff', level, word },
    { key: 'style', word: style || t('journey.stripMixed') },
    { key: 'cost', word: cost || t('journey.stripPrice'), mono: Boolean(cost) },
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
 * calls an estimate. The night is the day's own sleep line ("Night:"). When
 * the day names none, the card shows the base the week plan reads for that
 * night (weekBases, one basecamp or basecamps placed from the prose) under
 * "Base:", because a base is what the trip says and the bed of that one night
 * may be elsewhere (a hut night out of a valley base). The prose is folded
 * rather than shortened: it is authored copy and every word of it is still on
 * the page, one tap down, opening inside the card (T163).
 */
function Day({ day, index, night, nightIsBase, t, lang, ledger }) {
  const [more, setMore] = React.useState(false);
  const panelId = React.useId();
  const parts = [['morning', day.morning], ['afternoon', day.afternoon], ['evening', day.evening]]
    .filter(([, text]) => text);
  const stats = dayStatsParts(day.dayStats, lang);
  return (
    <article className="jpage-day" id={`jday-${day.day}`}>
      <header className="jpage-day-head">
        <span className="jpage-day-n mono">{t('journey.dayN', { n: day.day })}</span>
        <h3>{day.title}</h3>
      </header>
      <DayPhoto photo={day.photo} title={day.title} t={t} />
      {stats.length > 0 && (
        <p className="jpage-day-stats">
          {stats.map((part) => (
            <React.Fragment key={part.key}>
              {part.sep}
              <span className={part.mono ? 'mono' : 'jpage-day-note'}>
                {part.text}
                {part.mono && dayFigureEstimated(ledger, index, part.key) && <EstMark t={t} />}
              </span>
            </React.Fragment>
          ))}
        </p>
      )}
      {night && (
        <p className="jpage-day-sleep">
          <b>{t(nightIsBase ? 'journey.dayBase' : 'journey.night')}</b>
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
              <div className="tday-prose">
                {parts.map(([part, text]) => (
                  <div key={part} className="jpage-day-part">
                    <span className="jpage-day-when">{t(`journey.${part}`)}</span>
                    <Prose text={text} className="jpage-day-text" />
                  </div>
                ))}
              </div>
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

// The sticky rail's six stops (T165): the fold key each one opens, the section
// id it jumps to, and the label key. Order is the page's order.
const RAIL = [
  ['why', 'sec-why', 'journey.railWhy'],
  ['budget', 'sec-budget', 'journey.railCosts'],
  ['itin', 'sec-itin', 'journey.railDays'],
  ['sleep', 'sec-sleep', 'journey.railSleep'],
  ['log', 'sec-log', 'journey.railKnow'],
  ['pack', 'sec-pack', 'journey.railPack'],
];

const BUDGET_ROWS = [
  ['accommodation', 'journey.bAccommodation'],
  ['food', 'journey.bFood'],
  ['transport', 'journey.bTransport'],
  ['activities', 'journey.bActivities'],
];

export function JourneyPage({
  id, gatewayDest, railFrom = null, onClose, onSelectDest, onOpenJourney,
  // The Lifestyle panel's "Where you sleep" answer and the tiers the dataset
  // offers (T173). With a setter the receipt gets the stepped slider; without
  // one it stays the authored range it always was.
  stayTier = 'home', stayTiers = null, onChangeStayTier = null,
}) {
  const { t, lang } = useI18n();
  const [trip, setTrip] = useState(undefined);   // undefined = loading
  const { isOpen, toggle, setOpen } = useFolds(OPEN_BY_DEFAULT, id);
  const scrollEl = useRef(null);
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const titleEl = useRef(null);
  const heroEl = useRef(null);
  const [titleGone, setTitleGone] = useState(false);
  const [library, setLibrary] = useState(null);   // every card, for the exits

  useEffect(() => {
    let live = true;
    setTrip(undefined);
    loadJourney(id).then((row) => { if (live) setTrip(row); });
    return () => { live = false; };
  }, [id]);

  // Focus management for the dialog: initial focus, a Tab cycle and focus
  // restoration, not just Escape. See hooks/useFocusTrap.js.
  useFocusTrap(pageRef, onClose, { initialFocusRef: backRef });

  useEffect(() => { scrollEl.current?.scrollTo?.(0, 0); }, [id]);

  useEffect(() => {
    const el = titleEl.current;
    const root = scrollEl.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting),
      { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [trip?.id]);

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
    const c = trip?.coordinates;
    if (!trip || !Number.isFinite(c?.lat) || !Number.isFinite(c?.lon)) {
      if (trip) setPriceDests(null);
      return undefined;
    }
    catalogue.ensureNear(c.lat, c.lon, MAX_KM)
      .then(() => { if (live) setPriceDests(catalogue.snapshot()?.destinations || null); })
      .catch(() => { if (live) setPriceDests(null); });
    return () => { live = false; };
  }, [trip]);
  const price = useMemo(() => {
    if (priceDests === undefined) return undefined;
    const c = trip?.coordinates;
    return priceDests ? priceRow(priceDests, c?.lat, c?.lon, trip?.bestPeriod?.months) : null;
  }, [priceDests, trip]);

  // The town the week is priced at (T099): the nearest catalogue destination
  // with a bed and a food figure, from the same nearby shards the price row
  // above just loaded. None within reach means the written budget stays.
  const priceAt = useMemo(() => {
    const c = trip?.coordinates;
    return priceDests ? nearestPricedDest(priceDests, c?.lat, c?.lon, MAX_KM) : null;
  }, [priceDests, trip]);
  // True while the receipt's "Set your dates" is the page's one primary.
  const [frrPrimary, setFrrPrimary] = useState(false);

  // Trip length (T101, spec I2): the whole week as written, or its short
  // version, a run of the best three or four days with its own total. The
  // length is remembered per viewer and shared with the browse filter.
  const [length, setLength] = useState(readTripLength);
  const pickLength = (next) => { setLength(next); writeTripLength(next); };
  const lengths = useMemo(() => (trip ? tripLengths(trip) : null), [trip]);
  const isShort = length === SHORT && !!lengths && lengths.short.days < lengths.week.days;
  const view = lengths ? (isShort ? lengths.short : lengths.week) : null;
  // The trip as the page shows it at this length: the kept days, renumbered
  // from 1 so "Day 1 of 4" matches the card, and the budget at that length.
  const viewTrip = useMemo(() => {
    if (!trip || !view || !isShort) return trip;
    return {
      ...trip,
      durationDays: view.days,
      budget: view.budget,
      itinerary: view.indexes.map((at, k) => ({ ...trip.itinerary[at], day: k + 1 })),
    };
  }, [trip, view, isShort]);
  const viewDays = view?.days || trip?.durationDays || 7;

  const ledger = useMemo(() => figureLedger(trip), [trip]);
  const signals = useMemo(() => accuracySignals(trip, ledger), [trip, ledger]);
  const bases = useMemo(() => weekBases(viewTrip), [viewTrip]);
  const railItems = useMemo(
    () => RAIL.map(([key, sid, label]) => ({ key, id: sid, label: t(label) })), [t]);
  const hook = useMemo(() => hookLine(trip), [trip]);
  const rail = useMemo(() => railAlternative(railFrom, trip), [railFrom, trip]);
  const detail = useMemo(() => humanDetail(trip), [trip]);

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
    if (!trip || !library?.length) return [];
    const me = library.find((c) => c.id === trip.id);
    return journeyExits(me || trip, library);
  }, [trip, library]);

  const facts = useMemo(() => {
    if (!trip) return [];
    const profile = trip.profile || {};
    const best = trip.bestPeriod || {};
    const budget = viewTrip.budget || {};
    const yn = (v) => (v == null ? null : t(v ? 'journey.yes' : 'journey.no'));
    const notRecorded = t('journey.fNotRecorded');

    return [
      { key: 'days', label: t('journey.fDuration'), value: t('journey.nDays', { n: viewDays }) },
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
        key: 'budget',
        label: t('journey.fBudget'),
        ...(budget.totalEur ? {
          value: `${eurRange(budget.totalEur, lang)} ${trip.budgetTierRaw || trip.budgetTier || ''}`.trim(),
          note: t('journey.fBudgetNote'),
          mono: true,
          est: anyEstimated(ledger, 'budget.totalEur'),
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      {
        key: 'perday',
        label: t('journey.fPerDay'),
        ...(budget.perDayEur ? {
          value: eurRange(budget.perDayEur, lang),
          mono: true,
          est: anyEstimated(ledger, 'budget.perDayEur'),
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
        key: 'car',
        label: t('journey.fCar'),
        ...(profile.carRequired != null ? {
          value: yn(profile.carRequired),
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      {
        key: 'gateway',
        label: t('journey.fGateway'),
        ...((trip.gateways?.length || trip.gatewayAirport) ? {
          gateway: gatewayFact(trip, t),
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      {
        key: 'lang',
        label: t('journey.fLanguages'),
        ...(trip.languages?.length ? {
          value: trip.languages.join(', '),
        } : { value: notRecorded, className: 'bpage-fact-empty' }),
      },
      trip.emergencyNumber && {
        key: 'sos',
        label: t('journey.fEmergency'),
        value: String(trip.emergencyNumber),
        mono: true,
      },
    ].filter(Boolean);
  }, [trip, viewTrip, viewDays, t, lang, ledger, price]);

  if (trip === undefined) {
    return (
      <div className="tpage bpage jpage" role="dialog" aria-modal="true"
        aria-label={t('journey.backStyles')} ref={pageRef}>
        <div className="tpage-bar">
          <button type="button" className="tpage-back" onClick={onClose} ref={backRef}>
            <ArrowLeftIcon size={15} />
            <span>{t('journey.backStyles')}</span>
          </button>
        </div>
        <div className="tpage-scroll"><p className="places-empty">{'…'}</p></div>
      </div>
    );
  }
  if (!trip) {
    return (
      <div className="tpage bpage jpage" role="dialog" aria-modal="true"
        aria-label={t('journey.backStyles')} ref={pageRef}>
        <div className="tpage-bar">
          <button type="button" className="tpage-back" onClick={onClose} ref={backRef}>
            <ArrowLeftIcon size={15} />
            <span>{t('journey.backStyles')}</span>
          </button>
        </div>
        <div className="tpage-scroll">
          <div className="places-empty empty-act">
            <p>{t('journey.gone')}</p>
            <button type="button" className="cov-empty-btn" onClick={onClose}>{t('empty.trips')}</button>
          </div>
        </div>
      </div>
    );
  }

  const coords = trip.coordinates || {};
  const pinReal = coords.precision === 'source' || coords.precision === 'city';
  const budget = viewTrip.budget || {};
  const spec = trip.typeSpecific || {};
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

  return (
    <div className="tpage bpage jpage" role="dialog" aria-modal="true" aria-label={trip.title} ref={pageRef}>
      <div className="tpage-bar">
        <button type="button" className="tpage-back" onClick={onClose} ref={backRef}>
          <ArrowLeftIcon size={15} />
          <span>{typeLabel(trip.tripTypeSlug, t, trip.tripType)}</span>
        </button>
        <span className={`tpage-bar-title ${titleGone ? 'on' : ''}`}>{trip.title}</span>
      </div>

      <div className="tpage-scroll" ref={scrollEl}>
        <SectionRail
          items={railItems}
          scrollRef={scrollEl}
          heroRef={heroEl}
          ready={trip.id}
          ariaLabel={t('journey.railAria')}
          onJump={(key) => setOpen((o) => new Set([...o, key]))}
        />
        <div className="bpage-wrap">
          {pinReal ? (
            <a
              className="bpage-where"
              href={trailheadDirectionsUrl(coords.lat, coords.lon)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MapPinIcon size={15} />
              <span className="bpage-where-text">
                {[trip.subRegion, trip.country].filter(Boolean).join(', ')}
              </span>
              <span className="bpage-where-coord">
                {fmtCoord(coords.lat)}, {fmtCoord(coords.lon)}
              </span>
              <ChevronRightIcon size={14} />
            </a>
          ) : (
            <p className="bpage-where jpage-where-flat">
              <MapPinIcon size={15} />
              <span className="bpage-where-text">
                {[trip.subRegion, trip.country].filter(Boolean).join(', ')}
              </span>
            </p>
          )}

          <div className="bpage-head" ref={titleEl}>
            <h1 className="bpage-name">
              <CountryFlag country={trip.countryCode} size={15} className="bpage-flag" />
              {trip.title}
            </h1>
            <div className="bpage-scorerow jpage-chips">
              <span className="jpage-chip">{typeLabel(trip.tripTypeSlug, t, trip.tripType)}</span>
              <span className="jpage-chip mono">{t('journey.nDays', { n: viewDays })}</span>
              {trip.budgetTier && <span className="jpage-chip mono">{trip.budgetTierRaw || trip.budgetTier}</span>}
              {trip.profile?.difficultyLabel && (
                <span className="jpage-chip">{diffLabel(trip.profile.difficultyLabel, t)}</span>
              )}
            </div>
          </div>

          {lengths && lengths.short.days < lengths.week.days && (
            <LengthPicker lengths={lengths} value={isShort ? SHORT : length} onChange={pickLength} t={t} />
          )}

          {hook && (
            <p className="bpage-lede jpage-hook">
              {hook.built ? t('journey.hookBuilt', hook.built) : <Prose text={hook.line} className="" />}
            </p>
          )}

          <NotFor lines={notForLines('journey', {
            carRequired: trip.profile?.carRequired,
            familyFriendly: trip.profile?.familyFriendly,
            label: trip.profile?.difficultyLabel,
            word: trip.profile?.difficultyLabel ? diffLabel(trip.profile.difficultyLabel, t) : '',
          })} />

          <figure className="bpage-gallery jpage-hero" ref={heroEl}>
            {trip.hero?.url && (
              <img
                className="bpage-shot jpage-shot"
                src={trip.hero.url}
                srcSet={srcSetFor(trip.hero.url, 1280)}
                sizes="(max-width: 900px) 96vw, 720px"
                alt={trip.title}
              />
            )}
            <SuitabilityStrip trip={viewTrip} t={t} lang={lang} />
            {trip.hero?.url && <HeroCredit hero={trip.hero} t={t} />}
          </figure>

          <Fold level={2}
            id="sec-why"
            icon={BulbIcon}
            title={t('journey.whyHead')}
            open={isOpen('why')}
            onToggle={() => toggle('why')}
          >
            {(() => {
              // The one-line hook above already said its sentence; the fold
              // carries the rest of whichever text it came from.
              const fromHook = hook?.source === 'hook';
              const fromSummary = hook?.source === 'summary';
              const hookText = fromHook ? hook.rest : trip.hook;
              const sumText = fromSummary ? hook.rest : trip.summary;
              return (
                <>
                  {hookText && <Prose text={hookText} className="bpage-lede" />}
                  {sumText && !trip.summaryGenerated && <Prose text={sumText} />}
                </>
              );
            })()}
            {trip.tags?.length > 0 && (
              <ul className="bpage-tags jpage-tags">
                {trip.tags.slice(0, 6).map((tag) => (
                  <li key={tag}>{String(tag).replace(/-/g, ' ')}</li>
                ))}
              </ul>
            )}
          </Fold>

          {facts.length > 0 && (
            <Fold level={2}
              id="sec-facts"
              icon={InfoIcon}
              title={t('journey.factsHead')}
              open={isOpen('facts')}
              onToggle={() => toggle('facts')}
            >
              <dl>
                {facts.map((fact) => (
                  <div key={fact.key} className={`bpage-fact ${fact.className || ''}`}>
                    <dt>{fact.label}</dt>
                    <dd className={fact.mono ? 'mono' : ''}>
                      {fact.strip ? (
                        <MonthStrip {...fact.strip} />
                      ) : fact.meter ? (
                        <DifficultyMeter {...fact.meter} note={fact.meter.note && <Prose text={fact.meter.note} className="" />} />
                      ) : fact.gateway ? (
                        <GatewayList
                          rows={fact.gateway.rows}
                          more={fact.gateway.more && <Prose text={fact.gateway.more} className="" />}
                        />
                      ) : (
                        <>
                          {fact.value}
                          {fact.est && <EstMark t={t} />}
                          {fact.note && <small>{fact.note}</small>}
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </Fold>
          )}

          {/* The climb day by day and, on a ride, the surface and traffic
              (T174): drawn with the trail and cycling pages' components. */}
          <JourneyRoute trip={viewTrip} t={t} open={isOpen('route')} onToggle={() => toggle('route')} />

          {(budget.breakdown || priceAt) && (
            <Fold level={2}
              id="sec-budget"
              icon={ReceiptIcon}
              title={isShort ? t('journey.budgetHeadShort', { n: viewDays }) : t('journey.budgetHead')}
              open={isOpen('budget')}
              onToggle={() => toggle('budget')}
              className="jpage-budget"
            >
              {/* The priced, itemised week (T099, spec I1): Carta's own
                  engine at the nearest catalogue town, in place of the
                  written range. The written range stays where no town is
                  close enough to price. */}
              {priceAt ? (
                <FirstRunReceipt
                  dest={priceAt.dest}
                  receiptKey={`journey:${trip.id}`}
                  headingLevel={3}
                  nights={viewDays}
                  onPrimaryChange={setFrrPrimary}
                />
              ) : (
              <>
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
                          ? <MovingEur value={figs.rows[slot]} lang={lang} />
                          : eurRange({ low: row.lowEur, high: row.highEur }, lang)}
                        {anyEstimated(ledger, `budget.breakdown.${slot}`) && <EstMark t={t} />}
                      </span>
                    </li>
                  );
                })}
                {budget.totalEur && (
                  <li className="jpage-budget-total">
                    <span className="jpage-budget-label">{t('journey.budgetTotal')}</span>
                    <span className="jpage-budget-eur mono">
                      {figs?.total != null
                        ? <MovingEur value={figs.total} lang={lang} />
                        : eurRange(budget.totalEur, lang)}
                      {anyEstimated(ledger, 'budget.totalEur') && <EstMark t={t} />}
                    </span>
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
              </>
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
            </Fold>
          )}

          {specRows.length > 0 && (
            <Fold level={2}
              id="sec-spec"
              icon={CompassIcon}
              title={t('journey.specHead')}
              open={isOpen('spec')}
              onToggle={() => toggle('spec')}
              className="jpage-spec"
            >
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
            </Fold>
          )}

          {/* The shape of the week, day zero and the day after the last, and
              the weather plan (T170): read from the days, shown before them. */}
          <WeekPlan trip={viewTrip} />

          {trip.itinerary?.length > 0 && (
            <Fold level={2}
              id="sec-itin"
              icon={CalendarIcon}
              title={t('journey.itinHead')}
              summary={isShort ? t('journey.itinSummaryShort', { n: viewDays, all: trip.itinerary.length }) : t('journey.itinSummary', { n: trip.itinerary.length })}
              open={isOpen('itin')}
              onToggle={() => toggle('itin')}
              className="jpage-itin"
            >
              <DayTrack label={t('journey.trackAria')} t={t}>
                {viewTrip.itinerary.map((day, k) => (
                  <Day
                    key={`${length}-${day.day}`}
                    day={day}
                    index={view.indexes[k] ?? k}
                    night={day.sleep || bases.nights[k] || null}
                    nightIsBase={!day.sleep && Boolean(bases.nights[k])}
                    t={t}
                    lang={lang}
                    ledger={ledger}
                  />
                ))}
              </DayTrack>
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

          {bookSteps && (
            <BookingOrder
              tripId={trip.id}
              source={bookSource}
              open={isOpen('book')}
              onToggle={() => toggle('book')}
            />
          )}

          {logRows.length > 0 && (
            <Fold level={2}
              id="sec-log"
              icon={InfoIcon}
              title={t('journey.logHead')}
              open={isOpen('log')}
              onToggle={() => toggle('log')}
              className="jpage-log"
            >
              <FlashDeck id="deck-log" cards={logCards} label={t('journey.logHead')} t={t} />
            </Fold>
          )}

          {trip.proTips?.length > 0 && (
            <Fold level={2}
              id="sec-tips"
              icon={BulbIcon}
              title={t('journey.tipsHead')}
              open={isOpen('tips')}
              onToggle={() => toggle('tips')}
              className="jpage-tips"
            >
              <FlashDeck id="deck-tips" cards={tipCards} label={t('journey.tipsHead')} t={t} />
            </Fold>
          )}

          <Fold level={2}
            id="sec-pack"
            icon={BackpackIcon}
            title={t('journey.packHead')}
            open={isOpen('pack')}
            onToggle={() => toggle('pack')}
            className="jpage-pack"
          >
            <PackGrid trip={trip} />
          </Fold>

          {/* Deliberately NOT folded. Everything else on this page may be one
              tap away; a safety advisory that a reader has to discover is a
              safety advisory that does not work. */}
          {trip.whatCouldGoWrong?.length > 0 && (
            <section className="lpage-hazards">
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
              <span>{t('journey.ctaGateway', { city: gatewayDest.city })}</span>
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
                card.eur ? eurRange(card.eur, lang) : null,
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
            {trip.hero?.page && safeUrl(trip.hero.page) && (
              <ul>
                <li>
                  <a href={safeUrl(trip.hero.page)} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={12} />
                    {t('journey.photoOf', { name: trip.hero.credit })}
                  </a>
                </li>
              </ul>
            )}
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
  );
}
