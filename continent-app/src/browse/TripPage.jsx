import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import '../styles/items.css';
import { ReportProblem } from '../components/ReportProblem.jsx';
import {
  RouteIcon, LoopIcon, BedIcon, TrainIcon,
  CarIcon, BusIcon, CalendarIcon, MapPinIcon, AlertIcon, CheckIcon,
  ClockIcon, ReceiptIcon, LinkIcon, MountainIcon, LakeIcon, BeachIcon,
  BootIcon, SunIcon, PlusIcon, ChevronDownIcon, CompassIcon, CameraIcon,
  BulbIcon,
} from '../components/Icons.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { GlossLine } from '../components/InfoDot.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { usePageArrival } from '../hooks/usePageArrival.js';
import { PageBar } from './PageBar.jsx';
import { eur, eurExact } from '../lib/format.js';
import { loadTrip, tripShareUrl } from '../lib/trips.js';
import { creditFor } from '../lib/imageCredit.js';
import { Fold } from './Fold.jsx';
import { NotFor } from '../components/NotFor.jsx';
import { notForLines } from '../lib/notFor.js';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useFolds } from './useFolds.js';
import { TripPractical } from './TripPractical.jsx';
import { TripDayPhotos } from './TripDayPhotos.jsx';
import { DayTrack } from './DayTrack.jsx';
import { dayShots } from './dayShots.js';
import { claimShared } from '../lib/sharedElement.js';
import {
  tripHeadline, transportLabel, seasonLabel, tripWhy, tripWarnings,
  dayTitle, themeLabel, cardThumb, countryNames,
} from '../lib/tripStory.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { destAnchor } from '../lib/origins.js';
import { FlightRow, AirlineMark } from '../components/flights/Flights.jsx';
import { homeFlightSetup, openJawNear, backDate, withEnds } from './cartaFlight.js';
import { useDayView } from '../hooks/useDayView.js';
import { quoteStay, seatsOf } from '../lib/price/index.js';

/**
 * One published trip as a page of its own.
 *
 * The order is the order a person reads a plan in, and each block answers one
 * question with data rather than with an adjective:
 *
 *   where does it go     the route on a real map, the stops numbered, the day
 *                        trips as pushpins around the base they belong to
 *   what is it           the shape, the days, the nights per stop, the months
 *   how do you move      every leg with its mode, its hours and its fare, all
 *                        of them labelled as estimates because they are
 *   what do you do       day by day, with a photograph of every named sight
 *   what does it cost    stay plus travel, for two people, per day
 *   what did we check    ten checks it passed, and every one it could not
 *
 * The last block is the one that makes the rest believable, so it is a
 * section rather than a footnote. Everything published here has been through
 * pipeline/trips/validate_trips.py; a trip that fails a hard check is not in
 * the wire at all, and a soft warning ships on the trip and prints here.
 *
 * Every section folds (the shared <Fold>, same grammar as the destination
 * page). Nothing was deleted to shorten this page: the practical sections open
 * because they are what you travel with, and the narrative ones are one tap
 * away with their prose intact. A day is a one-line header plus chips for the
 * facts, and its paragraph moves behind "More about this day" rather than
 * being cut.
 *
 * One grammar with the journey page (T387, brief item V3.11): the head is the
 * photograph with a caption band under it and never text on it, the days run
 * in the shared day track (DayTrack.jsx), and the cost fold is a receipt
 * whose estimated lines carry the tilde and "est." in words. Since T518 the
 * receipt adds Carta's flight from the home airport to the trip's start and
 * home from its end (Google Flights' fares, never estimated), when the sweep
 * has one near the app's dates; without one no line is a flight.
 *
 * The map is lazy twice over: maplibre is a large dependency, and the fold's
 * body does not mount while closed, so opening a trip costs no WebGL context
 * until somebody opens the route.
 */

const TripMap = lazy(() => import('../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));

const MODE_ICON = { rail: TrainIcon, car: CarIcon, mixed: BusIcon, train: TrainIcon, bus: BusIcon };
const AROUND_ICON = { mountain: MountainIcon, lake: LakeIcon, beach: BeachIcon, trail: BootIcon };
const SHAPE_ICON = { base: BedIcon, chain: RouteIcon, loop: LoopIcon };

/**
 * What opens on arrival: the sections you travel WITH. The route answers
 * "where does it go", practical answers "what do I have to arrange", the
 * day-by-day is the plan itself and the cost is the decision. The narrative
 * blocks (why this trip, the checks, the gallery) are one tap away with every
 * word still in them.
 */
const OPEN_BY_DEFAULT = ['route', 'practical', 'days', 'cost'];

/** One measured fact. `word` moves it out of the mono column: "By train" and
 *  "Best May to Sep" are prose, and the mono face is for figures only. */
function Fact({ icon: Icon, value, label, word = false }) {
  return (
    <div className="tpage-fact itin-fact">
      {Icon && <Icon size={14} className="itin-fact-icon" />}
      <span className={`tpage-fact-val ${word ? 'is-word' : ''}`}>{value}</span>
      <span className="tpage-fact-label">{label}</span>
    </div>
  );
}

/**
 * A sight's thumbnail, carrying its own credit. The photographs are CC
 * licensed and each owes its author a name: the tooltip names them the
 * way the destination page's slides do, and the image links its Commons
 * file page, which states the full licence. Credits come from the
 * poi_credits.json sidecar (lib/imageCredit.js), loaded lazily on the
 * first sight anybody actually sees.
 */
function SightImg({ img }) {
  const [credit, setCredit] = useState(null);
  useEffect(() => {
    let live = true;
    creditFor(img).then((c) => { if (live) setCredit(c); });
    return () => { live = false; };
  }, [img]);
  const label = credit && (credit.by || credit.lic)
    ? [credit.by, credit.lic].filter(Boolean).join(', ')
    : '';
  const image = (
    <img
      className="itin-sight-img"
      src={cardThumb(img)}
      alt=""
      loading="lazy"
      title={label}
    />
  );
  if (!credit || !credit.page) return image;
  return (
    <a
      style={{ display: 'contents' }}
      href={credit.page}
      target="_blank"
      rel="noopener noreferrer"
      title={label || 'Wikimedia Commons'}
      onClick={(e) => e.stopPropagation()}
    >
      {image}
    </a>
  );
}

/**
 * One named sight: its photograph, its one line, and a way to read more.
 *
 * The Wikipedia link was already in the wire and rendered nowhere, which made
 * it pure weight. It is the natural next question a day plan raises, so it
 * becomes the sight's name rather than being dropped.
 */
function Sight({ poi, t }) {
  return (
    <li className="itin-sight">
      {poi.img
        ? <SightImg img={poi.img} />
        : <span className="itin-sight-img itin-sight-noimg" aria-hidden="true" />}
      <span className="itin-sight-text">
        {poi.wiki ? (
          <a
            className="itin-sight-name itin-sight-link"
            href={poi.wiki}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={t('trip.readMore', { name: poi.name })}
          >
            {poi.name}
          </a>
        ) : (
          <span className="itin-sight-name">{poi.name}</span>
        )}
        {poi.desc && <span className="itin-sight-desc">{poi.desc}</span>}
      </span>
    </li>
  );
}

/* ── Legs and their figures ────────────────────────────────────────────

   A leg's fare is an estimate from per-country fare levels, never a ticket
   price, so wherever it prints it carries the tilde and "est." in words, set
   the same way in the route, in a day and in the receipt. A flight leg prints
   a figure only when it is Carta's own flight from or to the home airport
   (T518, `carta` set by cartaLegs below), at the party's fare plus bags; any
   other flight leg prints none and never reaches a total. */

const FLIGHT_MODES = new Set(['fly', 'flight', 'plane', 'air']);
const isFlightLeg = (leg) => FLIGHT_MODES.has(String(leg?.mode || '').toLowerCase());
/** A flight leg with no figure of its own (not Carta's home flight). */
const isUnpricedFlight = (leg) => isFlightLeg(leg) && !leg?.carta;

const IATA = /^[A-Z]{3}$/;
/** The airport a stop flies from: its destination's anchor, or the stop's
 *  own code when the stop is an airport. */
function stopAirport(stop, destinations) {
  const code = destAnchor(destinations?.[stop?.dest]);
  if (code) return code;
  return IATA.test(String(stop?.dest || '')) ? stop.dest : null;
}

/** Where the trip starts and ends by air: the first stop's airport (or a
 *  first leg that leaves from an airport), and the last leg's airport end
 *  (or the last stop's airport). */
function tripAirports(detail, destinations) {
  const stops = detail?.stops || [];
  const legs = detail?.legs || [];
  const firstFrom = legs[0]?.from;
  const lastTo = legs.length ? legs[legs.length - 1]?.to : null;
  return {
    start: stopAirport(stops[0], destinations) || (IATA.test(String(firstFrom || '')) ? firstFrom : null),
    end: (IATA.test(String(lastTo || '')) ? lastTo : null) || stopAirport(stops[stops.length - 1], destinations),
  };
}

/** The detail with Carta's figure on the flight legs that are its home
 *  flight: home to the start, or the end to home. */
function cartaLegs(detail, carta, home, ends) {
  if (!detail || !carta || !home) return detail;
  const legs = (detail.legs || []).map((leg) => {
    if (!isFlightLeg(leg)) return leg;
    if (leg.from === home && leg.to === ends.start) return { ...leg, eur: carta.outCost.total, est: false, carta: true };
    if (leg.from === ends.end && leg.to === home) return { ...leg, eur: carta.backCost.total, est: false, carta: true };
    return leg;
  });
  return { ...detail, legs };
}

/** "3 h 13" or "45 min", the same clock the day chips use. */
function legTime(leg, t) {
  const minutes = Number(leg.minutes) || 0;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? t('trip.legHm', { h, m: String(m).padStart(2, '0') }) : t('trip.legM', { m });
}

/** The mode as a word ("Train"), or nothing when the vocabulary has none. */
function modeWord(mode, t) {
  const m = String(mode || '');
  if (!m) return '';
  const key = `trip.mode${m.charAt(0).toUpperCase()}${m.slice(1)}`;
  const word = t(key);
  return word === key ? '' : word;
}

/** "~ €38.46 est." when the figure is an estimate, "€38.46" when it is not. */
function costFig(n, est, t) {
  const money = eurExact(n);
  return est ? t('itin.estFig', { eur: money }) : money;
}

/** One leg as words: mode, time and distance. The fare sits beside it. */
function legWords(leg, t) {
  const mode = modeWord(leg.mode, t);
  const km = Number.isFinite(leg.km) ? Math.round(leg.km) : null;
  if (mode && km != null) return t('itin.legRoute', { mode, time: legTime(leg, t), km });
  return [mode, legTime(leg, t), km != null ? `${km} km` : ''].filter(Boolean).join(', ');
}

/** The party the wire priced the trip for (two when it does not say). */
function tripGroup(detail) {
  const g = detail?.cost?.group;
  return Number.isFinite(g) && g > 0 ? g : 2;
}

/**
 * The trip's beds and days from the engine (T702, plan F6): every stop is
 * the destination's day price at the traveller's settings (party, stay,
 * Lifestyle), times its nights and the seats, the figure its own page shows.
 * Null when a stop is not a priced destination; the wire's stay figure then
 * stands in, as before.
 */
/** A stop's rating: the place's own wire rating (v5, so the trip page reads
 *  the same word as Explore and the destination page, T763), else the
 *  trip file's copy of the score. */
function stopRating(stop, destinations) {
  const r = destinations?.[stop?.dest]?.rating;
  if (r?.score != null) return r;
  return stop?.rating != null ? { score: stop.rating } : null;
}

function tripStays(detail, destinations, req) {
  const stops = detail?.stops || [];
  if (!stops.length || !destinations) return null;
  let beds = 0;
  let days = 0;
  let est = false;
  for (const s of stops) {
    if (!(s.nights > 0)) continue;
    const d = destinations[s.dest];
    const q = d ? quoteStay(d, s.nights, null, req, destinations) : null;
    if (!q?.day || q.day.dayEur == null) return null;
    beds += q.accomTotal;
    days += q.groundTotal;
    est = est || q.day.lines.some((l) => l.status === 'included' && l.quality !== 'measured' && l.quality !== 'live');
  }
  if (!(beds > 0)) return null;
  return { beds: Math.round(beds * 100) / 100, days: Math.round(days * 100) / 100, seats: seatsOf(req), est };
}

/**
 * The trip's own receipt, from the wire's cost block and its legs (the beds
 * and days from the engine since T702, `stays`).
 *
 * The stay is one line; each ground leg is its own line with its fare to the
 * cent, because a receipt that folds the legs into one rounded figure cannot
 * be checked against the route above it. When a leg carries no fare the
 * wire's legs total stands in as one line. The total is the sum of the lines
 * on screen, and the day figure is that total over the trip's days, labelled
 * as such: a figure for the whole party, not for one person.
 */
function tripReceipt(detail, t, flight = null, stays = null) {
  const cost = detail.cost || {};
  const group = stays ? stays.seats : tripGroup(detail);
  const anyEst = cost.est !== false;
  const lines = [];
  // Carta's flight first, there and home, each with its airline (T518).
  if (flight) {
    lines.push({
      k: 'flight-out',
      label: `${t('flight.flightLine')}, ${t('itin.fromTo', { a: flight.home, b: flight.start })}`,
      airline: flight.out.airline,
      eur: Math.round(flight.outCost.total * 100) / 100,
      est: false,
    });
    lines.push({
      k: 'flight-back',
      label: `${t('flight.flightLine')}, ${t('itin.fromTo', { a: flight.end, b: flight.home })}`,
      airline: flight.back.airline,
      eur: Math.round(flight.backCost.total * 100) / 100,
      est: false,
    });
  }
  if (stays) {
    lines.push({ k: 'stay', label: t('trip.costStay', { n: detail.nights }), eur: stays.beds, est: stays.est });
    if (stays.days > 0) lines.push({ k: 'food', label: t('receipt.ground'), eur: stays.days, est: stays.est });
  } else if (Number.isFinite(cost.stay_eur)) {
    lines.push({
      k: 'stay',
      label: t('trip.costStay', { n: detail.nights }),
      eur: cost.stay_eur,
      est: anyEst,
    });
  }
  const allLegs = detail.legs || [];
  const legs = allLegs.filter((leg) => !isFlightLeg(leg));
  const priced = legs.length > 0 && legs.every((leg) => Number.isFinite(leg.eur));
  const flights = allLegs.some(isFlightLeg);
  if (priced) {
    allLegs.forEach((leg, i) => {
      if (isFlightLeg(leg)) return;
      const from = detail.stops[i]?.city;
      const to = detail.stops[i + 1]?.city || detail.stops[0]?.city;
      const route = from && to ? t('itin.fromTo', { a: from, b: to }) : '';
      const mode = modeWord(leg.mode, t);
      lines.push({
        k: `leg-${i}`,
        label: [mode, route].filter(Boolean).join(', ') || t('trip.costTravel'),
        eur: leg.eur,
        est: leg.est !== false,
      });
    });
  } else if (!flights && Number.isFinite(cost.legs_eur) && cost.legs_eur > 0) {
    // The wire's legs total includes no flight only when no leg is a flight.
    lines.push({ k: 'legs', label: t('trip.costTravel'), eur: cost.legs_eur, est: anyEst });
  }
  // Flights alone are no receipt: the trip's own cost block prices it.
  if (lines.length === (flight ? 2 : 0)) return null;
  const total = lines.reduce((sum, l) => sum + l.eur, 0);
  const days = Number(detail.days) || 0;
  // "A day" stays the days there: the flight there and home is in the total,
  // not in the figure a day (the same basis as every card and pin).
  const onTheGround = lines.reduce((sum, l) => (l.k.startsWith('flight-') ? sum : sum + l.eur), 0);
  return {
    lines,
    group,
    est: lines.some((l) => l.est),
    total,
    perDay: days > 0 ? onTheGround / days : null,
    days,
  };
}

/**
 * One day, as a card in the day track: a header you can read in a glance,
 * the concrete facts as chips, the photographs of where it goes, and the
 * prose folded underneath.
 *
 * The header is the day number, the town and a headline of at most eight
 * words. The chips carry what a reader actually plans around: how far and how
 * long the move is, how many nights they are staying, what the day's main
 * sight is. Everything the page said before is still here; the paragraph is
 * behind one disclosure instead of in front of it, and it is not mounted
 * until the disclosure opens (the contract verify_trip_page.mjs checks).
 */
function DayCard({ day, detail, t }) {
  const [more, setMore] = React.useState(false);
  const panelId = React.useId();
  const stop = detail.stops[day.stop];
  const out = day.daytrip
    ? (detail.daytrips || []).find((x) => x.dest === day.daytrip) : null;
  const pool = out ? out.highlights : (stop?.highlights || []);
  const items = (day.items || [])
    .map((n) => pool.find((h) => h.name === n))
    .filter(Boolean);
  const leg = day.kind === 'travel' ? detail.legs[day.stop - 1] : null;
  const shots = dayShots(day, detail);

  // The chips. Each one is a measured fact or it is not rendered: no chip on
  // this row is composed, rounded up or guessed.
  const chips = [];
  if (leg) {
    const key = leg.mode === 'car' ? 'trip.dayChipDrive' : 'trip.dayChipTrain';
    chips.push({ k: 'time', icon: ClockIcon, text: t(key, { time: legTime(leg, t) }) });
    if (Number.isFinite(leg.km)) {
      chips.push({ k: 'km', icon: RouteIcon, text: t('trip.dayChipKm', { km: Math.round(leg.km) }) });
    }
  }
  if (out && Number.isFinite(out.minutes)) {
    chips.push({ k: 'out', icon: ClockIcon, text: t('trip.outTime', { min: out.minutes, km: out.km }) });
  }
  if (items.length > 0) {
    chips.push({ k: 'sight', icon: MapPinIcon, text: items[0].name });
  }
  if (day.kind !== 'travel' && day.kind !== 'depart' && stop?.nights) {
    chips.push({
      k: 'nights',
      icon: BedIcon,
      text: t(stop.nights === 1 ? 'trip.nightCountOne' : 'trip.nightCountMany', { n: stop.nights }),
    });
  }

  const prose = items.length > 0 || Boolean(leg) || day.kind === 'depart';

  return (
    <article className={`tday is-${day.kind}`}>
      <header className="tday-head">
        <h3 className="tday-title">{dayTitle(day, detail, t)}</h3>
      </header>

      {chips.length > 0 && (
        <ul className="tday-chips">
          {chips.map((c) => (
            <li key={c.k} className="tday-chip">
              <c.icon size={12} />
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      )}

      <TripDayPhotos shots={shots} />

      {prose && (
        <>
          <button
            type="button"
            className="tday-more"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            aria-controls={panelId}
          >
            <ChevronDownIcon size={13} className={more ? 'tday-more-chev is-open' : 'tday-more-chev'} />
            <span>{t('trip.moreAboutDay')}</span>
          </button>
          {/* Closed, the panel is empty: the prose mounts when the reader asks
              for it, so a closed day holds no hidden copy and no hidden links. */}
          <div id={panelId} className="tday-body">
            {more && (
              <div className="tday-prose">
                {leg && (
                  <p className="itin-day-leg">
                    <ClockIcon size={12} />
                    <span>{legWords(leg, t)}</span>
                    {!isUnpricedFlight(leg) && Number.isFinite(leg.eur) && (
                      <span className="itin-leg-fig mono">{costFig(leg.eur, leg.est !== false, t)}</span>
                    )}
                  </p>
                )}
                {items.length > 0 && (
                  <ul className="itin-sights">
                    {items.map((p) => <Sight key={p.name} poi={p} t={t} />)}
                  </ul>
                )}
                {items.length === 0 && day.kind === 'depart' && (
                  <p className="itin-day-note">{t('trip.departNote', { city: stop.city })}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}

export function TripPage({
  trip: card, data, onClose, onOpenInPlanner, onSelectDest, fav = false, onFav = null,
  // What the big button under the facts does, when the caller wants it to do
  // something other than "open in planner". The trip planner passes
  // {label, onClick} so its own copy reads "Choose this trip" and choosing
  // closes the page and moves the wizard on, rather than handing the trip to a
  // planner the traveller is already standing in.
  primaryAction = null,
}) {
  const { t } = useI18n();
  // This page had no focus management and no Escape at all, while still
  // telling a screen reader it was modal. See hooks/useFocusTrap.js.
  const pageRef = useRef(null);
  const backRef = useRef(null);
  const [rawDetail, setDetail] = useState(null);
  // Carta's flight (T518): home airport to the trip's start, its end to
  // home, near the app's leaving day and the trip's nights after it, for
  // the party the receipt prices. Null without a flight near those days.
  const ctx = useFirstRun();
  const fl = homeFlightSetup(ctx);
  const view = useDayView();
  const stays = useMemo(() => tripStays(rawDetail, data?.destinations, view.request), [rawDetail, data, view.request]);
  const ends = useMemo(() => tripAirports(rawDetail, data?.destinations), [rawDetail, data]);
  const flightBack = backDate(fl.from, rawDetail?.nights || ((rawDetail?.days || 2) - 1));
  const flight = useMemo(() => {
    if (!rawDetail) return null;
    const rt = openJawNear(fl.file, ends.start, ends.end, fl.from, flightBack,
      { paying: stays ? stays.seats : tripGroup(rawDetail), bagKey: fl.bagKey });
    return rt ? { ...rt, home: fl.file.from, start: ends.start, end: ends.end } : null;
  }, [rawDetail, fl.file, ends, fl.from, flightBack, fl.bagKey, stays]);
  const detail = useMemo(() => cartaLegs(rawDetail, flight, fl.file?.from, ends), [rawDetail, flight, fl.file, ends]);
  // Arrival focus follows the one page rule (hooks/usePageArrival.js, T474).
  const arrivalRef = usePageArrival(pageRef, detail?.id ?? null);
  useFocusTrap(pageRef, onClose, { initialFocusRef: arrivalRef });
  // The bar takes over the name once the caption band's heading has scrolled
  // away (PageBar), as on every other page.
  const scrollEl = useRef(null);
  const headEl = useRef(null);
  const [nameOn, setNameOn] = useState(false);
  useEffect(() => {
    const el = headEl.current;
    const root = scrollEl.current;
    if (!el || !root || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setNameOn(!entry.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [card.id]);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState(null);
  const [copied, setCopied] = useState(false);
  const { isOpen, toggle } = useFolds(OPEN_BY_DEFAULT, card.id);

  useEffect(() => {
    let live = true;
    setDetail(null);
    setFailed(false);
    loadTrip(card.id).then((d) => {
      if (!live) return;
      if (d) setDetail(d); else setFailed(true);
    });
    return () => { live = false; };
  }, [card.id]);

  const names = useMemo(() => countryNames(data), [data]);

  // Stops as numbered pins, day trips as photo pushpins around them. TripMap
  // reads {lat, lon, city, plain, img}: `plain` is the pushpin, which is what
  // a day out is, because it is not a place you sleep.
  const pins = useMemo(() => {
    if (!detail) return [];
    const stops = detail.stops.map((s) => ({
      lat: s.lat, lon: s.lon, city: s.city,
    }));
    const outs = (detail.daytrips || []).map((d) => ({
      lat: d.lat, lon: d.lon, city: d.city, plain: true, img: d.img ? cardThumb(d.img) : null,
    }));
    return stops.concat(outs);
  }, [detail]);

  const onShare = async () => {
    const url = tripShareUrl(card);
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ title: trip.name || card.id, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }
    } catch { /* the traveller cancelled the sheet */ }
  };

  const trip = detail || card;
  // A shared link carries only an id, so until the detail lands there is no
  // day count, no cost and no route to print. Everything above the fold reads
  // from `trip`, which is the card when there is one and the detail once it
  // arrives, and stays out of the way when it is neither.
  const ready = !!(detail || (card && card.days));
  const Shape = SHAPE_ICON[trip.archetype] || RouteIcon;
  const Mode = MODE_ICON[trip.transport] || TrainIcon;
  const why = detail ? tripWhy(detail, t) : [];
  const warnings = detail ? tripWarnings({ warned: detail.checks?.warned }, t) : [];
  const season = seasonLabel(detail
    ? { season: detail.season.best, seasonBasis: detail.season.basis }
    : (card.season ? card : { season: [] }), t);
  const seasonMonths = (detail ? detail.season?.best : card.season) || [];
  const notFor = ready ? notForLines('trip', {
    transport: trip.transport,
    archetype: trip.archetype,
    stops: (trip.cities || trip.stops || []).length,
    days: trip.days,
    seasonText: seasonMonths.length > 0 && seasonMonths.length < 12 ? fmtMonthRanges(seasonMonths, t) : '',
  }) : [];
  const themes = (trip.themes || []).map((x) => themeLabel(x, t)).filter(Boolean);
  // The card already carries the chosen photograph, so it paints
  // immediately and the detail does not change it.
  const hero = detail?.hero || card.img || null;
  // A closed section still answers its own question: the route reads out as
  // the towns it strings together, which is the one thing a reader wants from
  // it before they open anything.
  const routeSummary = detail
    ? detail.stops.map((s) => s.city).join(' - ')
    : null;
  // The receipt is the page's one source for a day figure: the fact row and
  // the cost fold's summary both read its day line, so the page never shows
  // two different figures for the same day. Until the detail lands, the card's
  // own rounded figure stands in, marked as an estimate the same way.
  const receipt = detail ? tripReceipt(detail, t, flight, stays) : null;
  let perDayText = null;
  if (receipt && Number.isFinite(receipt.perDay)) {
    perDayText = costFig(receipt.perDay, receipt.est, t);
  } else if (!detail && Number.isFinite(card.cost?.per_day_eur)) {
    perDayText = t('itin.estFig', { eur: eur(card.cost.per_day_eur) });
  }

  return (
    <div className="tpage itin-page" role="dialog" aria-modal="true"
      aria-label={ready ? tripHeadline(trip, t) : t('trip.loading')} ref={pageRef}>
      <PageBar
        t={t}
        backLabel={t('trip.back')}
        onBack={onClose}
        backRef={backRef}
        name={ready ? tripHeadline(trip, t) : t('trip.loading')}
        nameOn={nameOn}
        fav={fav}
        onFav={onFav}
        onShare={onShare}
        shareLabel={t('trip.shareLink')}
        copied={copied}
        copiedLabel={t('dest.linkCopied')}
      />

      <div className="tpage-scroll" ref={scrollEl}>
        {/* The photograph leads, and nothing is written on it (the caption
            band rule, T380): the name, the countries, the themes and the
            credit sit in a solid band flush under the photo, no scrim and no
            gradient. A map of two dots and a dashed line is a poor
            advertisement for a fortnight; it moves down to The route, where
            the reader has a question for it. */}
        <div className="itin-photohero">
          {hero ? (
            <img
              ref={(el) => claimShared(el, card.id)}
              className="itin-photohero-img"
              src={fallbackSrc(hero.url, 1280)}
              srcSet={srcSetFor(hero.url, 1280)}
              sizes="100vw"
              alt=""
            />
          ) : (
            <span className="itin-photohero-img itin-photohero-none" aria-hidden="true" />
          )}
        </div>
        <div className="itin-capband">
          <div className="itin-capband-in">
            <h1 className="itin-capband-title" ref={headEl}>
              {ready ? tripHeadline(trip, t) : t('trip.loading')}
            </h1>
            {((trip.countries || []).length > 0 || trip.score != null) && (
              <p className="itin-capband-sub">
                {(trip.countries || []).map((cc, i) => (
                  <React.Fragment key={cc}>
                    {i > 0 && ', '}
                    <span className="itin-country">
                      <CountryFlag country={cc} size={12} />
                      {names[cc] || cc}
                    </span>
                  </React.Fragment>
                ))}
                {trip.score != null && (
                  <span className="itin-capband-score mono">{trip.score.toFixed(1)}</span>
                )}
              </p>
            )}
            {themes.length > 0 && (
              <p className="itin-capband-themes">{themes.slice(0, 4).join(', ')}</p>
            )}
            {hero?.credit && (
              <p className="itin-capband-credit">{hero.credit}</p>
            )}
          </div>
        </div>

        <div className="tpage-col">
          {/* The card came from a list that has since been re-exported: the id
              it names no longer has a detail file. Nothing below can be drawn
              from a card alone, so the page stops here and offers the way
              back rather than half-rendering around the hole. */}
          {failed && (
            <div className="itin-gone">
              <p>{t('trip.detailGone')}</p>
              <button type="button" className="itin-gone-back" onClick={onClose}>
                {t('trip.back')}
              </button>
            </div>
          )}

          {ready && !failed && <NotFor lines={notFor} />}

          {ready && !failed && (
          <div className="tpage-facts itin-facts">
            <Fact icon={CalendarIcon} value={trip.days} label={t('trip.factDays')} />
            <Fact icon={BedIcon} value={trip.nights} label={t('trip.factNights')} />
            <Fact icon={Shape} value={(trip.cities || trip.stops || []).length}
              label={t('trip.factStops')} />
            <Fact icon={Mode} value={transportLabel(trip, t)} label={t('trip.factGetting')} word />
            {perDayText && (
              <Fact icon={ReceiptIcon} value={perDayText}
                label={t('trip.factPerDay')} />
            )}
            {season && <Fact icon={SunIcon} value={season} label={t('trip.factSeason')} word />}
          </div>
          )}

          {primaryAction && detail && (
            <button type="button" className="itin-use" onClick={() => primaryAction.onClick(detail || card)}>
              <CheckIcon size={15} />
              <span>{primaryAction.label}</span>
            </button>
          )}
          {!primaryAction && onOpenInPlanner && detail && (
            <button type="button" className="itin-use" onClick={() => onOpenInPlanner(detail || card)}>
              <PlusIcon size={15} />
              <span>{t('trip.openInPlanner')}</span>
            </button>
          )}
          {copied && <p className="itin-copied">{t('trip.linkCopied')}</p>}

          {/* The route: every stop with its nights, every leg with its mode,
              its hours and its fare. A trip that cannot show this is a list
              of cities, not an itinerary. */}
          {detail && (
            <Fold level={2}
              id="sec-route"
              icon={RouteIcon}
              title={t('trip.secRoute')}
              summary={routeSummary}
              open={isOpen('route')}
              onToggle={() => toggle('route')}
            >
              <div className="itin-map">
                <Suspense fallback={<div className="itin-map-wait" />}>
                  <TripMap
                    stops={pins}
                    padBottom={0}
                    fitPadding={40}
                    fitMaxZoom={9}
                    scrollZoom={false}
                    selectedIndex={selected}
                    onSelectStop={setSelected}
                  />
                </Suspense>
              </div>
              <ol className="itin-route">
                {detail.stops.map((s, i) => (
                  <React.Fragment key={s.dest}>
                    <li className={`itin-stop ${selected === i ? 'on' : ''}`}>
                      <button type="button" className="itin-stop-hit"
                        onClick={() => setSelected(selected === i ? null : i)}>
                        <span className="itin-stop-no">{i + 1}</span>
                        {s.img
                          ? <img className="itin-stop-img" src={cardThumb(s.img)} alt="" loading="lazy" />
                          : <span className="itin-stop-img itin-sight-noimg" aria-hidden="true" />}
                        <span className="itin-stop-text">
                          <span className="itin-stop-name">
                            {s.city}
                            <RatingBadge rating={stopRating(s, data?.destinations)} size="xs" showGem={false} />
                          </span>
                          <span className="itin-stop-meta">
                            <CountryFlag country={s.iso2} size={10} />
                            {/* Commas, not dots: dot and bullet separators
                                are banned (brief row V17). */}
                            <span>
                              {[
                                names[s.iso2] || s.iso2,
                                t(s.nights === 1 ? 'trip.nightCountOne' : 'trip.nightCountMany', { n: s.nights }),
                                s.walk_km ? t('trip.walkRadius', { km: s.walk_km }) : '',
                              ].filter(Boolean).join(', ')}
                            </span>
                          </span>
                        </span>
                      </button>
                      {onSelectDest && (
                        <button type="button" className="itin-stop-open"
                          onClick={() => onSelectDest(s.dest)}>
                          {t('trip.openPlace')}
                        </button>
                      )}
                      {selected === i && s.around?.length > 0 && (
                        <ul className="itin-around">
                          {s.around.map((a) => {
                            const Icon = AROUND_ICON[a.kind] || MapPinIcon;
                            return (
                              <li key={`${a.kind}-${a.id}`}>
                                <Icon size={12} />
                                <span>{a.name}</span>
                                <span className="itin-around-km">{t('trip.kmAway', { km: a.km })}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                    {detail.legs[i] && (
                      <li className="itin-leg">
                        {React.createElement(MODE_ICON[detail.legs[i].mode] || TrainIcon, { size: 13 })}
                        <span>{legWords(detail.legs[i], t)}</span>
                        {detail.legs[i].home && (
                          <span className="itin-leg-home">{t('trip.legHome')}</span>
                        )}
                        {/* The fare is an estimate, so it carries the tilde
                            and "est." in words, set as the receipt sets it.
                            A flight leg prints a figure only when it is
                            Carta's home flight (T518). */}
                        {!isUnpricedFlight(detail.legs[i]) && Number.isFinite(detail.legs[i].eur) ? (
                          <span className="itin-est itin-leg-fig mono">
                            {costFig(detail.legs[i].eur, detail.legs[i].est !== false, t)}
                          </span>
                        ) : (
                          <span className="itin-est">{t('trip.estimate')}</span>
                        )}
                      </li>
                    )}
                  </React.Fragment>
                ))}
              </ol>
            </Fold>
          )}

          {/* What has to be arranged, from data we already hold: where to
              park, what the drives are, what a bed costs, how to arrive
              without a car. Above the day-by-day because it is what decides
              whether the plan below is even possible. */}
          {detail && (
            <Fold level={2}
              id="sec-practical"
              icon={CompassIcon}
              title={t('trip.secPractical')}
              open={isOpen('practical')}
              onToggle={() => toggle('practical')}
            >
              <TripPractical detail={detail} t={t} />
            </Fold>
          )}

          {/* Day by day, in the shared day track (DayTrack.jsx, the journey
              page's grammar): one card per day, Previous and Next with the
              position above, the dots under. Each card is a line and a row of
              chips with the day's photographs; its prose and its sights stay
              behind "More about this day", closed until asked for. */}
          {detail && (
            <Fold level={2}
              id="sec-days"
              icon={CalendarIcon}
              title={t('trip.secDays')}
              summary={t('trip.nDays', { n: detail.days })}
              open={isOpen('days')}
              onToggle={() => toggle('days')}
              className="itin-days-sec"
            >
              <DayTrack label={t('itin.trackAria')} t={t}>
                {detail.plan.map((day) => (
                  <DayCard key={day.d} day={day} detail={detail} t={t} />
                ))}
              </DayTrack>
            </Fold>
          )}

          {/* Days out, for a trip that keeps one bed. */}
          {detail && detail.daytrips.length > 0 && (
            <Fold level={2}
              id="sec-outs"
              icon={LoopIcon}
              title={t('trip.outsTitle', { city: detail.stops[0].city })}
              summary={String(detail.daytrips.length)}
              open={isOpen('outs')}
              onToggle={() => toggle('outs')}
            >
              <div className="itin-outs">
                {detail.daytrips.map((d) => {
                  const Icon = MODE_ICON[d.mode] || TrainIcon;
                  return (
                    <div key={d.dest} className="itin-out">
                      {d.img
                        ? <img className="itin-out-img" src={cardThumb(d.img)} alt="" loading="lazy" />
                        : <span className="itin-out-img itin-sight-noimg" aria-hidden="true" />}
                      <div className="itin-out-body">
                        <div className="itin-out-head">
                          <span className="itin-out-name">{d.city}</span>
                          <RatingBadge rating={stopRating(d, data?.destinations)} size="xs" showGem={false} />
                        </div>
                        <div className="itin-out-meta">
                          <Icon size={12} />
                          <span>
                            {[
                              t('trip.outTime', { min: d.minutes, km: d.km }),
                              t('trip.outOnSite', { h: d.on_site_h }),
                            ].join(', ')}
                          </span>
                        </div>
                        <ul className="itin-out-sights">
                          {d.highlights.map((h) => (
                            <li key={h.name}>{h.name}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Fold>
          )}

          {/* What it costs, and for whom, as a receipt: one hairline line per
              cost with the figure right aligned in mono, a 2px ink rule above
              the total, and the day figure under it named for what it is (the
              total over the days, for the whole party). Every estimated line
              says so in words with the tilde. Carta's flight, when there is
              one, is its own two lines with the airline's mark (T518). */}
          {detail && (
            <Fold level={2}
              id="sec-cost"
              icon={ReceiptIcon}
              title={t('trip.secCost')}
              summary={perDayText || undefined}
              open={isOpen('cost')}
              onToggle={() => toggle('cost')}
            >
              {receipt && (
                <div className="itin-receipt">
                  <p className="itin-receipt-head">
                    <span className="itin-receipt-route">
                      {detail.stops.map((s) => s.city).join(', ')}
                    </span>
                    <span className="itin-receipt-days mono">{t('trip.nDays', { n: receipt.days })}</span>
                  </p>
                  <ul className="itin-cost">
                    {receipt.lines.map((line) => (
                      <li key={line.k}>
                        <span>
                          {line.airline && <><AirlineMark code={line.airline} size="sm" />{' '}</>}
                          {line.label}
                        </span>
                        <b className="mono">{costFig(line.eur, line.est, t)}</b>
                      </li>
                    ))}
                    <li className="itin-cost-sum">
                      <span>{t('itin.costTotal', { n: receipt.group })}</span>
                      <b className="mono">{costFig(receipt.total, receipt.est, t)}</b>
                    </li>
                    {Number.isFinite(receipt.perDay) && (
                      <li className="itin-cost-day">
                        <span>{t('itin.costDay', { n: receipt.group, d: receipt.days })}</span>
                        <b className="mono">{perDayText}</b>
                      </li>
                    )}
                  </ul>
                  {flight && (
                    <div className="itin-flights">
                      <FlightRow leg={withEnds(flight.out, flight.home, flight.start)} cost={flight.outCost}
                        dir="out" bagKey={fl.bagKey} wantedDate={fl.from} />
                      <FlightRow leg={withEnds(flight.back, flight.end, flight.home)} cost={flight.backCost}
                        dir="back" bagKey={fl.bagKey} wantedDate={flightBack} />
                    </div>
                  )}
                </div>
              )}
              <p className="tpage-credit">{t('trip.costNote')}</p>
              <ReportProblem priceOnly item={{ layer: 'trip', id: card.id, name: trip.name || card.name || card.id }} />
            </Fold>
          )}

          {why.length > 0 && (
            <Fold level={2}
              id="sec-why"
              icon={BulbIcon}
              title={t('trip.secWhy')}
              summary={why[0]?.line}
              open={isOpen('why')}
              onToggle={() => toggle('why')}
            >
              <ul className="itin-why">
                {why.map((w) => <li key={w.k}><GlossLine text={w.line} /></li>)}
              </ul>
              {detail?.follows && (
                <p className="itin-follows">
                  <LinkIcon size={12} />
                  <a href={detail.follows.url} target="_blank" rel="noopener noreferrer">
                    {detail.follows.title}
                  </a>
                </p>
              )}
            </Fold>
          )}

          {/* What we checked. The block that makes the rest believable. */}
          {detail && (
            <Fold level={2}
              id="sec-checks"
              icon={CheckIcon}
              title={t('trip.secChecks')}
              summary={t('trip.checksPassed', { n: (detail.checks?.passed || []).length })}
              open={isOpen('checks')}
              onToggle={() => toggle('checks')}
              className="itin-checks"
            >
              <p className="itin-check-pass">
                <CheckIcon size={13} />
                {t('trip.checksPassed', { n: (detail.checks?.passed || []).length })}
              </p>
              {warnings.length > 0 ? (
                <ul className="itin-warns">
                  {warnings.map((w) => (
                    <li key={w.code}><AlertIcon size={12} /><span>{w.line}</span></li>
                  ))}
                </ul>
              ) : (
                <p className="itin-check-clean">{t('trip.checksClean')}</p>
              )}
              <p className="tpage-credit">{t('trip.checksCredit')}</p>
            </Fold>
          )}

          {detail?.gallery?.length > 0 && (
            <Fold level={2}
              id="sec-gallery"
              icon={CameraIcon}
              title={t('trip.secGallery')}
              summary={String(detail.gallery.length)}
              open={isOpen('gallery')}
              onToggle={() => toggle('gallery')}
            >
              <div className="itin-gallery">
                {detail.gallery.map((g) => (
                  <figure key={g.url} className="itin-shot">
                    <img src={cardThumb(g.url)} alt="" loading="lazy" />
                    <figcaption>{g.name || g.city}</figcaption>
                  </figure>
                ))}
              </div>
              <p className="tpage-credit">{t('trip.galleryCredit')}</p>
            </Fold>
          )}
        </div>
      </div>
    </div>
  );
}
