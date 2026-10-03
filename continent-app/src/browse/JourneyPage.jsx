import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import {
  loadJourney, typeLabel, diffLabel, eurRange, boldSegments, lastCheckedMonth,
  dayStatsLine, riskText, stayPriceText, minutesText,
  figureLedger, anyEstimated, dayEstimated, monthLabel,
  hookLine, humanDetail, loadAllJourneyCards, journeyExits,
} from '../lib/journeys.js';
import { srcSetFor } from '../lib/heroImage.js';
import { trailheadDirectionsUrl } from '../lib/trailExport.js';
import { safeUrl } from '../lib/format.js';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { Fold } from './Fold.jsx';
import { PackGrid } from './PackGrid.jsx';
import { NotFor } from '../components/NotFor.jsx';
import { dataSheetRows } from '../lib/dataSheet.js';
import { notForLines } from '../lib/notFor.js';
import { BookingOrder } from './BookingOrder.jsx';
import { WeekPlan } from './WeekPlan.jsx';
import { JourneyRoute } from './JourneyRoute.jsx';
import { bookingOrder, bookingSource } from '../lib/bookingOrder.js';
import { MonthStrip } from '../components/MonthStrip.jsx';
import { DifficultyMeter, GatewayList } from '../components/FactMeter.jsx';
import { parseGateway } from '../lib/gateway.js';
import { railAlternative } from '../lib/railAlternative.js';
import { useFolds } from './useFolds.js';
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
 * word intact. A day is its title and its measured line, with the three parts
 * of the prose behind one disclosure.
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

/**
 * A six-word preview of a written block: its first words, markers and the
 * trailing punctuation removed, so a closed row says what is inside without
 * costing a tap. Cut at the first sentence when that is shorter.
 */
const PREVIEW_TAIL = /^(and|or|but|the|a|an|of|to|in|on|at|for|with|by|from|are|is|was|take|takes|only|between|that|which|as|into)$/i;

function previewWords(text, n = 6) {
  const plain = String(text || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const sentence = plain.split(/(?<=[.!?;:])\s/)[0];
  const words = sentence.split(' ').slice(0, n);
  // A preview that stops on a joining word reads as broken, so drop those.
  while (words.length > 2 && PREVIEW_TAIL.test(words[words.length - 1].replace(/[.,;:!?]+$/, ''))) words.pop();
  return words.join(' ').replace(/[\s.,;:!?-]+$/, '');
}

/**
 * One closed row of Good to know: icon, label and a six-word preview, the
 * full text one tap down. Each row opens on its own.
 */
function LogRow({ id, icon, label, text }) {
  const Icon = icon;
  const [open, setOpen] = React.useState(false);
  const preview = previewWords(text);
  return (
    <div className={`jpage-lrow ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="jpage-lrow-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${id}-body`}
      >
        <Icon size={20} className="jpage-lrow-icon" />
        <span className="jpage-lrow-label">{label}</span>
        {!open && preview && <span className="jpage-lrow-sum">{preview}</span>}
        <ChevronDownIcon size={13} className="jpage-lrow-chev" />
      </button>
      {open && (
        <div className="jpage-lrow-body" id={`${id}-body`}>
          <Prose text={text} className="jpage-log-text" />
        </div>
      )}
    </div>
  );
}

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
  const cells = journeyStripCells(trip, t, lang);
  return (
    <div className="jstrip" role="group" aria-label={t('journey.stripAria')}>
      {cells.map((c) => (
        <div key={c.key} className="jstrip-cell">
          {c.key === 'diff' && (
            <span
              className="jstrip-squares"
              role={c.level > 0 ? 'img' : undefined}
              aria-label={c.level > 0 ? t('journey.diffMeter', { n: c.level }) : undefined}
              aria-hidden={c.level > 0 ? undefined : true}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <span key={i} className={`jstrip-sq${i <= c.level ? ' is-on' : ''}`} />
              ))}
            </span>
          )}
          <span className={`jstrip-word${c.mono ? ' mono' : ''}`}>{c.word}</span>
        </div>
      ))}
    </div>
  );
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
 * One itinerary day: the title and the facts you plan around, with the three
 * parts of the written day behind "More about this day".
 *
 * The measured line (dayStats: the distance, the ascent, the realistic hours)
 * and where you sleep stay in front, because those are what a reader compares
 * between days. The prose is folded rather than shortened: it is authored
 * copy and every word of it is still on the page, one tap down.
 */
function Day({ day, t, lang, est }) {
  const [more, setMore] = React.useState(false);
  const panelId = React.useId();
  const parts = [['morning', day.morning], ['afternoon', day.afternoon], ['evening', day.evening]]
    .filter(([, text]) => text);
  return (
    <article className="jpage-day">
      <header className="jpage-day-head">
        <span className="jpage-day-n mono">{t('journey.dayN', { n: day.day })}</span>
        <h3>{day.title}</h3>
      </header>
      {day.dayStats && (
        <p className="jpage-day-stats mono">
          {dayStatsLine(day.dayStats, lang)}
          {est && <EstMark t={t} />}
        </p>
      )}
      {day.sleep && (
        <p className="jpage-day-sleep">
          <b>{t('journey.night')}</b>
          {' '}
          {day.sleep}
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

const BUDGET_ROWS = [
  ['accommodation', 'journey.bAccommodation'],
  ['food', 'journey.bFood'],
  ['transport', 'journey.bTransport'],
  ['activities', 'journey.bActivities'],
];

export function JourneyPage({ id, gatewayDest, railFrom = null, onClose, onSelectDest, onOpenJourney }) {
  const { t, lang } = useI18n();
  const [trip, setTrip] = useState(undefined);   // undefined = loading
  const { isOpen, toggle } = useFolds(OPEN_BY_DEFAULT, id);
  const scrollEl = useRef(null);
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const titleEl = useRef(null);
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

  const ledger = useMemo(() => figureLedger(trip), [trip]);
  const hook = useMemo(() => hookLine(trip), [trip]);
  const rail = useMemo(() => railAlternative(railFrom, trip), [railFrom, trip]);
  const detail = useMemo(() => humanDetail(trip), [trip]);
  const exits = useMemo(() => {
    if (!trip || !library?.length) return [];
    const me = library.find((c) => c.id === trip.id);
    return journeyExits(me || trip, library);
  }, [trip, library]);

  const facts = useMemo(() => {
    if (!trip) return [];
    const profile = trip.profile || {};
    const best = trip.bestPeriod || {};
    const budget = trip.budget || {};
    const yn = (v) => (v == null ? null : t(v ? 'journey.yes' : 'journey.no'));
    const notRecorded = t('journey.fNotRecorded');

    return [
      { key: 'days', label: t('journey.fDuration'), value: t('journey.nDays', { n: trip.durationDays || 7 }) },
      {
        key: 'best',
        label: t('journey.fBest'),
        ...(best.monthNames?.length ? {
          strip: {
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
  }, [trip, t, lang, ledger]);

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
        <div className="tpage-scroll"><p className="places-empty">{t('journey.gone')}</p></div>
      </div>
    );
  }

  const coords = trip.coordinates || {};
  const pinReal = coords.precision === 'source' || coords.precision === 'city';
  const budget = trip.budget || {};
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
              <span className="jpage-chip mono">{t('journey.nDays', { n: trip.durationDays || 7 })}</span>
              {trip.budgetTier && <span className="jpage-chip mono">{trip.budgetTierRaw || trip.budgetTier}</span>}
              {trip.profile?.difficultyLabel && (
                <span className="jpage-chip">{diffLabel(trip.profile.difficultyLabel, t)}</span>
              )}
            </div>
          </div>

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

          <figure className="bpage-gallery jpage-hero">
            {trip.hero?.url && (
              <img
                className="bpage-shot jpage-shot"
                src={trip.hero.url}
                srcSet={srcSetFor(trip.hero.url, 1280)}
                sizes="(max-width: 900px) 96vw, 720px"
                alt={trip.title}
              />
            )}
            <SuitabilityStrip trip={trip} t={t} lang={lang} />
            {trip.hero?.url && <HeroCredit hero={trip.hero} t={t} />}
          </figure>

          <Fold
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
            <Fold
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
          <JourneyRoute trip={trip} t={t} open={isOpen('route')} onToggle={() => toggle('route')} />

          {budget.breakdown && (
            <Fold
              id="sec-budget"
              icon={ReceiptIcon}
              title={t('journey.budgetHead')}
              open={isOpen('budget')}
              onToggle={() => toggle('budget')}
              className="jpage-budget"
            >
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
                        {eurRange({ low: row.lowEur, high: row.highEur }, lang)}
                        {anyEstimated(ledger, `budget.breakdown.${slot}`) && <EstMark t={t} />}
                      </span>
                    </li>
                  );
                })}
                {budget.totalEur && (
                  <li className="jpage-budget-total">
                    <span className="jpage-budget-label">{t('journey.budgetTotal')}</span>
                    <span className="jpage-budget-eur mono">
                      {eurRange(budget.totalEur, lang)}
                      {anyEstimated(ledger, 'budget.totalEur') && <EstMark t={t} />}
                    </span>
                  </li>
                )}
              </ul>
              <p className="bpage-note">
                {budget.totalNote || t('journey.fBudgetNote')}
              </p>
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
            <Fold
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
          <WeekPlan trip={trip} />

          {trip.itinerary?.length > 0 && (
            <Fold
              id="sec-itin"
              icon={CalendarIcon}
              title={t('journey.itinHead')}
              summary={t('journey.itinSummary', { n: trip.itinerary.length })}
              open={isOpen('itin')}
              onToggle={() => toggle('itin')}
              className="jpage-itin"
            >
              {trip.itinerary.map((day, i) => <Day key={day.day} day={day} t={t} lang={lang} est={dayEstimated(ledger, i)} />)}
            </Fold>
          )}

          {trip.accommodationStrategy?.length > 0 && (
            <Fold
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
            <Fold
              id="sec-log"
              icon={InfoIcon}
              title={t('journey.logHead')}
              open={isOpen('log')}
              onToggle={() => toggle('log')}
              className="jpage-log"
            >
              <div className="jpage-lrows">
                {logRows.map((row) => (
                  <LogRow key={row.slot} id={`log-${row.slot}`} icon={row.icon} label={row.label} text={row.text} />
                ))}
              </div>
            </Fold>
          )}

          {trip.proTips?.length > 0 && (
            <Fold
              id="sec-tips"
              icon={BulbIcon}
              title={t('journey.tipsHead')}
              open={isOpen('tips')}
              onToggle={() => toggle('tips')}
              className="jpage-tips"
            >
              <ul>
                {trip.proTips.map((tip, i) => (
                  <li key={i}><Prose text={tip} className="jpage-tip-text" /></li>
                ))}
              </ul>
            </Fold>
          )}

          <Fold
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
              <ul>
                {trip.whatCouldGoWrong.map((item, i) => (
                  <li key={i}>
                    <Prose
                      text={riskText(item, (text) => t('journey.wrongDo', { text }))}
                      className="jpage-tip-text"
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(trip.verifyFlagCount > 0 || trip.volatilePricing) && (
            <p className="jpage-verify" role="note">
              <AlertIcon size={13} />
              {trip.verifyFlagCount > 0
                ? t('journey.verifyNote', { n: trip.verifyFlagCount })
                : t('journey.volatileNote')}
            </p>
          )}

          {gatewayDest && (
            <button
              type="button"
              className="bpage-base"
              onClick={() => onSelectDest?.(gatewayDest.id)}
            >
              <span>{t('journey.ctaGateway', { city: gatewayDest.city })}</span>
              <ChevronRightIcon size={15} />
            </button>
          )}

          {exits.length > 0 && (
            <section className="jpage-exits" aria-labelledby="jpage-exits-h">
              <h2 id="jpage-exits-h">{t('journey.exitsHead')}</h2>
              <ul>
                {exits.map(({ kind, card }) => (
                  <li key={card.id}>
                    <button type="button" className="jpage-exit" onClick={() => onOpenJourney?.(card)}>
                      <span className="jpage-exit-kind">
                        {kind === 'easier' ? t('journey.exitEasier')
                          : kind === 'cheaper' ? t('journey.exitCheaper')
                            : t('journey.exitNearby')}
                      </span>
                      <span className="jpage-exit-title">{card.title}</span>
                      <span className="jpage-exit-meta mono">
                        {[t('journey.nDays', { n: card.days || 7 }),
                          card.eur ? eurRange(card.eur, lang) : null,
                          card.diffLabel ? diffLabel(card.diffLabel, t) : null,
                        ].filter(Boolean).join(', ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

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
