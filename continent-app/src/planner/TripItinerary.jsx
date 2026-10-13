import React, { useState, useEffect, useRef } from 'react';
import { eur, eurExact, fmtHours, safeUrl } from '../lib/format.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { CostBar } from '../browse/CostBar.jsx';
import { TripExtras } from './TripExtras.jsx';
import { ExpenseLedger } from './ExpenseLedger.jsx';
import { loadTripExtras, persistTripExtras, subscribeDayPlanStore } from './dayPlanStore.js';
import { flightReasonLabel } from '../lib/trip_planner_pricing.js';
import { googleMapsDirUrl } from '../lib/routing.js';
import { cityCoords } from '../lib/runtime_pricing.js';
import { shareTrip, downloadTripPdf } from '../lib/tripExport.js';
import { tripKml, downloadKml } from '../lib/kmlExport.js';
import { tripIcs, downloadIcs } from '../lib/icsExport.js';
import { buildTripShareUrl } from '../lib/shareLink.js';
import { groundLinkFor } from '../lib/groundLinks.js';
import { fareProv, estPrefix, FareTag, BookingNote } from '../components/FareProvenance.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { SparkIcon, TrainIcon, BusIcon, CarIcon, FerryIcon, BedIcon, ReceiptIcon, ShareIcon, DownloadIcon, MapPinIcon, RouteIcon, CalendarIcon, LinkIcon, ChevronDownIcon, CloseIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';

// How the traveller told us they get there and home. Carta prices none of it,
// so these two helpers exist to say what THEY said rather than assume a plane:
// the wizard has asked for the mode since it stopped picking flights, and a
// trip saved before that carries no mode, which is what 'fly' means here.
const OWN_TRAVEL_ICON = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon,
};

function OwnTravelIcon({ mode, size = 12 }) {
  const Icon = OWN_TRAVEL_ICON[mode] || PlaneIcon;
  return <Icon size={size} />;
}

/** "Train, Trenitalia", or just "Train" when no operator was named. */
function ownTravelHow(flight, t) {
  const how = t(TRAVEL_MODE_LABEL[flight?.mode] || 'trip.modeFly');
  const who = (flight?.airline || '').trim();
  return who ? `${how}, ${who}` : how;
}

/** "Fri 18 Sep" in the interface language (T388: the month and weekday
 *  names were English in every language). The document language follows the
 *  chosen UI language (PRODUCT.md), so it is the locale to format with. */
const LONG_FMT = new Map();
function fmtLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const loc = (typeof document !== 'undefined' && document.documentElement.lang) || 'en-GB';
  if (!LONG_FMT.has(loc)) {
    LONG_FMT.set(loc, new Intl.DateTimeFormat(loc, { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }));
  }
  return LONG_FMT.get(loc).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "Fri 18 Sep, 19:45-21:45", the date plus the priced flight's local dep/arr
 *  hours, when the times harvest covers this leg (just the date otherwise). */
const LEG_ICONS = {
  train: TrainIcon, bus: BusIcon, car: CarIcon, fly: PlaneIcon, ferry: FerryIcon,
  public: BusIcon, taxi: CarIcon, rental: CarIcon,
};

// "~1 h 50 min by X" wording per leg mode. Airport transfers use the honest
// public/taxi/rental trio (we know a transfer exists, not which vehicle), so
// they must never be labelled "by train" - the old fall-through did exactly
// that for every transfer, taxis included.
const BY_MODE_KEY = {
  train: 'itin.byTrain', bus: 'itin.byBus', car: 'itin.byCar',
  fly: 'itin.byFlight', ferry: 'itin.byFerry',
  public: 'itin.byPublic', taxi: 'itin.byTaxi', rental: 'itin.byRental',
};

// Airport-transfer modes: how you get from the plane to where you sleep.
const TRANSFER_META = {
  public: { Icon: BusIcon, labelKey: 'transfer.public' },
  taxi: { Icon: CarIcon, labelKey: 'transfer.taxi' },
  rental: { Icon: CarIcon, labelKey: 'transfer.rental' },
};

/** One control for every airport transfer on the trip: the fly-in/out hops
 *  folded into the flight (flightTransfer) and any anchor-city transfers, each
 *  priced per mode so the traveller sees exactly what public transport vs a
 *  taxi vs driving their rental costs, and the total follows the choice. */
export function TransferModePicker({ flightTransfer, anchorIn, anchorOut, setTransferMode }) {
  const { t } = useI18n();
  if (!setTransferMode) return null;
  const sources = [flightTransfer, anchorIn, anchorOut].filter((s) => s && s.modes);
  if (!sources.length) return null;
  // Only offer modes available on EVERY transfer, so a compared total is whole.
  const modes = ['public', 'taxi', 'rental'].filter((m) => sources.every((s) => s.modes[m]));
  if (modes.length < 2) return null;
  const totals = {};
  for (const m of modes) totals[m] = sources.reduce((sum, s) => sum + (s.modes[m]?.eur_total || 0), 0);
  // This picker sets EVERY transfer at once, so it only highlights a mode when
  // all of them (both directions) currently agree; after a per-leg override in
  // the route view the directions diverge and nothing is highlighted here.
  const inUse = new Set([
    flightTransfer?.mode_in || flightTransfer?.mode,
    flightTransfer?.mode_out || flightTransfer?.mode,
    anchorIn?.mode, anchorOut?.mode,
  ].filter(Boolean));
  const active = inUse.size === 1 ? inUse.values().next().value : null;
  const recommended = flightTransfer?.recommended || anchorIn?.recommended || anchorOut?.recommended;
  return (
    <div className="transfer-picker">
      <div className="transfer-picker-title"><PlaneIcon size={11} /> {t('transfer.pickTitle')}</div>
      <div className="transfer-picker-modes">
        {modes.map((m) => {
          const { Icon, labelKey } = TRANSFER_META[m];
          return (
            <button
              key={m}
              type="button"
              className={`transfer-mode ${active === m ? 'on' : ''}`}
              onClick={() => setTransferMode(m)}
              title={recommended === m ? t('transfer.cartaPick') : undefined}
            >
              <span className="transfer-mode-lbl"><Icon size={12} /> {t(labelKey)}{recommended === m && <SparkIcon size={9} />}</span>
              <b>{eurExact(totals[m])}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** An airport-transfer row in the route view (fly-in airport city to the first
 *  stay, or the last stay back to the fly-home airport). Tappable like the
 *  inter-stop legs: it opens the same public / taxi / rental comparison the
 *  receipt's picker offers, so the mode is a visible choice right where the
 *  journey is shown, not an assumption. */
function AnchorTransferLeg({ leg, from, to, onMode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!leg) return null;
  const Icon = LEG_ICONS[leg.mode] || BusIcon;
  const canPick = Boolean(onMode && leg.modes && Object.keys(leg.modes).length > 1);
  return (
    <div className="itin-transfer">
      <button
        type="button"
        className="itin-flight-row itin-transfer-main"
        onClick={() => canPick && setOpen(!open)}
        aria-expanded={canPick ? open : undefined}
        disabled={!canPick}
        title={canPick ? t('itin.legChangeTitle') : undefined}
      >
        <Icon size={12} />
        <span>{t('itin.then')} <b>{from} → {to}</b></span>
        <small>~{fmtHours(leg.hours)} {t(BY_MODE_KEY[leg.mode] || 'itin.byPublic')}</small>
        {canPick && <span className="itin-leg-change">{open ? t('itin.legClose') : t('itin.legChange')}</span>}
      </button>
      {open && (
        <div className="itin-leg-modes itin-transfer-modes">
          {Object.entries(leg.modes).map(([m, o]) => {
            const meta = TRANSFER_META[m];
            const MIcon = meta?.Icon || BusIcon;
            return (
              <button
                key={m}
                type="button"
                className={`trip-leg-mode itin-leg-mode ${leg.mode === m ? 'on' : ''}`}
                onClick={() => onMode(m)}
                aria-pressed={leg.mode === m}
                title={leg.recommended === m ? t('transfer.cartaPick') : undefined}
              >
                <span><MIcon size={12} /> {t(meta?.labelKey || m)}{leg.recommended === m && <SparkIcon size={9} />}</span>
                <b>{`${estPrefix(fareProv(o))}${eurExact(o.eur_total)}`}</b>
                <small>~{fmtHours(o.hours)}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A curated secondary-hub note under a flight row: which named shuttle
 *  actually bridges "Charleroi" and Brussels (or "Bergamo" and Milan), how
 *  long it takes, how often it runs, and the buffer to plan around. Only
 *  renders for airports in the curated table, so it never speculates. */
function GroundLinkNote({ iata, dir }) {
  const { t } = useI18n();
  const gl = groundLinkFor(iata);
  if (!gl) return null;
  const freq = gl.everyMin ? t('itin.groundLinkEvery', { n: gl.everyMin }) : '';
  return (
    <div className="itin-groundlink">
      <BusIcon size={11} />
      <span>
        {t(dir === 'to' ? 'itin.groundLinkTo' : 'itin.groundLinkFrom', {
          airport: gl.airport, service: gl.service, hub: gl.hub, min: gl.minutes,
        })}{freq}. {t('itin.groundLinkBuffer', { buffer: gl.bufferMin })}
      </span>
    </div>
  );
}

/**
 * The planned itinerary: Overview + one tab per day.
 *
 * The Overview mirrors the Map tab's grouped receipt (flights / ground / stays,
 * then the grand total) so "Estimated total" is inspectable here too, and lists
 * every day with a jump into that day's tab. Each day keeps a light highlight
 * list (the pace cap) and hands fine-tuning to the Day planner via onPlanDay.
 */
// Traveller-facing names for the leg modes (shared with the mode buttons).
const MODE_LABEL_KEY = {
  train: 'trip.modeTrain', bus: 'trip.modeBus', car: 'trip.modeCar',
  fly: 'trip.modeFly', ferry: 'trip.modeFerry',
};

/** What a leg's figure buys, in words (T398, brief V4-6): a fare a person for
 *  the party on public transport, fuel and tolls for a car. A leg the
 *  traveller booked says so already, and a flight hop has no figure of
 *  Carta's, so both return nothing. */
const LEG_INCL_KEY = { train: 'trip.inclTrain', bus: 'trip.inclBus', ferry: 'trip.inclFerry' };
function legIncl(leg, t) {
  const o = leg?.modes?.[leg?.mode];
  if (!leg || !o || o.own) return '';
  if (leg.mode === 'car') return t('trip.inclCar');
  const key = LEG_INCL_KEY[leg.mode];
  const pp = o.eur_pp ?? leg.ground_eur_per_person;
  if (!key || !(pp > 0)) return '';
  return t(key, { pp: `${estPrefix(fareProv(o) || fareProv(leg))}${eurExact(pp)}` });
}

/** The connector between two consecutive stops in the route view: how you get
 *  from stay to stay, as a first-class part of the itinerary (not a line
 *  buried in the receipt). Tapping it opens the train/bus/car comparison so
 *  the mode can be changed right where the journey is shown. */
function ItinLeg({ leg, onMode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!leg) return null;
  if (leg.no_road || !leg.mode) {
    return (
      <div className="itin-leg itin-leg-noroad">
        <span className="itin-leg-rail" aria-hidden="true" />
        <span className="itin-leg-text"><small>{leg.note || t('trip.noOverland')}</small></span>
      </div>
    );
  }
  const Icon = LEG_ICONS[leg.mode] || TrainIcon;
  const chosen = leg.modes[leg.mode];
  // Provenance flags ride on the chosen mode option or the leg itself
  // (contract A fields, or the ground resolver's est/src).
  const legProv = fareProv(chosen) || fareProv(leg);
  return (
    <div className={`itin-leg ${open ? 'open' : ''}`}>
      <span className="itin-leg-rail" aria-hidden="true" />
      <button
        className="itin-leg-main"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={t('itin.legChangeTitle')}
      >
        <span className="itin-leg-glyph"><Icon size={12} /></span>
        <span className="itin-leg-text">
          {t(MODE_LABEL_KEY[leg.mode])}
          <FareTag prov={chosen?.own ? null : legProv} />
          <small>
            {chosen?.own
              // Their own booking: Carta has no km or duration for it, only
              // the fare they told us, so it must not pretend to an estimate.
              // Nor to a fare, when they left the price blank: EUR 0.00 there
              // reads as "this hop was free", which is not what they said.
              ? (leg.ground_total > 0 ? `${t('trip.legBooked')}, ${eurExact(leg.ground_total)}` : t('trip.legBookedNoPrice'))
              : `${t('itin.legStats', { km: leg.road_km, hours: fmtHours(chosen?.hours ?? leg.hours) })}, ${estPrefix(legProv)}${eurExact(leg.ground_total)}`}
          </small>
          {/* What the figure buys is words, so it is set in --ui under the
              mono facts, not in mono (the mono rule). */}
          {!chosen?.own && legIncl(leg, t) && <small className="itin-leg-incl">{legIncl(leg, t)}</small>}
        </span>
        <span className="itin-leg-change">{open ? t('itin.legClose') : t('itin.legChange')}</span>
      </button>
      {open && leg.sea_crossing && chosen?.note && (
        <div className="itin-leg-text"><small>{chosen.note}</small></div>
      )}
      {open && (
        <div className="itin-leg-modes">
          {Object.entries(leg.modes).map(([m, o]) => {
            const MIcon = LEG_ICONS[m] || TrainIcon;
            return (
              <button
                key={m}
                type="button"
                className={`trip-leg-mode itin-leg-mode ${leg.mode === m ? 'on' : ''}`}
                onClick={() => onMode?.(m)}
                aria-pressed={leg.mode === m}
                title={leg.recommended === m ? t('trip.cartaPick') : undefined}
              >
                <span><MIcon size={12} /> {t(MODE_LABEL_KEY[m])}{leg.recommended === m && !o.own && <SparkIcon size={9} />}</span>
                <b>{o.own && !(o.eur_total > 0) ? '-' : `${o.own ? '' : estPrefix(fareProv(o))}${eurExact(o.eur_total)}`}</b>
                <small>{o.own ? t('trip.legBooked') : `~${fmtHours(o.hours)}`}</small>
              </button>
            );
          })}
        </div>
      )}
      {open && chosen?.links?.length > 0 && (
        <div className="trip-leg-links itin-leg-links">
          {chosen.links.map((l, j) => (
            <a key={j} href={safeUrl(l.url)} target="_blank" rel="noreferrer">{l.label} ↗</a>
          ))}
          <BookingNote />
        </div>
      )}
    </div>
  );
}

/** One titled group of the chronological receipt (Getting there / each stop /
 *  Getting home / For the whole trip), its rows under a header that carries
 *  the group subtotal, so the receipt reads like the journey.
 *
 *  The subtotal is dropped when the group holds a single priced row: repeating
 *  the same number twice, once in the header and once right under it, was the
 *  main thing making the receipt feel cluttered. */
function BreakdownSection({ title, sub, total, children }) {
  // An unpriced flight row (T273) is a route line, not a figure, so it does
  // not count towards the "more than one priced row" rule for the subtotal.
  const pricedRows = React.Children.toArray(children).filter(
    (c) => typeof c?.props?.className === 'string' && c.props.className.includes('trip-total-row')
      && !c.props.className.includes('unpriced'),
  ).length;
  return (
    <section className="itin-bd-sec">
      <header className="itin-bd-sec-head">
        <span className="itin-bd-sec-title">
          {title}
          {sub && <small className="itin-bd-sec-sub">{sub}</small>}
        </span>
        {total > 0 && pricedRows > 1 && <span className="itin-bd-sec-total">{eurExact(total)}</span>}
      </header>
      <div className="itin-bd-sec-rows">{children}</div>
    </section>
  );
}

/** A home<->first/last-stop drive row for own-car trips: the journey starts at
 *  the traveller's door, and the route view should say so. Stacked (title
 *  over the km/time), not crammed onto one line like the short flight rows -
 *  "Drive out: home to Monaco" plus its distance never fit next to each
 *  other without wrapping one word per line. */
function ItinDriveRow({ leg, labelKey, city, from }) {
  const { t } = useI18n();
  if (!leg) return null;
  return (
    <div className="itin-drive-row">
      <span className="itin-drive-icon"><CarIcon size={14} /></span>
      <span className="itin-drive-main">
        <span className="itin-drive-label">{t(labelKey, { city })}{from ? <b> ({from})</b> : null}</span>
        <span className="itin-drive-sub">{t('trip.driveSub', { km: leg.road_km, hours: fmtHours(leg.hours) })}</span>
      </span>
    </div>
  );
}

export function TripItinerary({
  dayPlan, stopDetails, grandTotal, groupSize, onSetGroupSize = null, flight, label = '',
  legs = [], setLegMode = null, anchorLegs = null, flightTransfer = null,
  driveLegs = null, stayCosts = [], carRental = null, vignettes = null,
  tripHasCar = false,
  transferMode = 'auto', setTransferMode = null,
  activeStopIndex, onSelectStop, onPlanDay, isDayPlanned = null,
  sharePayload = null, extrasPlanId = null,
}) {
  // Whether a day already has Day-planner picks (drives "Plan" vs "Modify").
  const dayPlanned = (d) => Boolean(isDayPlanned && isDayPlanned(d.stopIndex, d.dayOfStay));
  const { t } = useI18n();
  const [tab, setTab] = useState('overview');
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [shareState, setShareState] = useState('');

  // Bookings / notes / packing list, keyed by the plan id (or the draft id
  // before the trip is saved) and stored on the day-plan sync rails: local
  // first, shadowed to the account when signed in.
  const [extras, setExtras] = useState(() => loadTripExtras(extrasPlanId));
  useEffect(() => { setExtras(loadTripExtras(extrasPlanId)); }, [extrasPlanId]);
  useEffect(() => subscribeDayPlanStore(({ planId, remote }) => {
    if (remote && planId === extrasPlanId) setExtras(loadTripExtras(extrasPlanId));
  }), [extrasPlanId]);
  const saveExtras = (next) => {
    setExtras(next);
    persistTripExtras(extrasPlanId, next);
  };

  // The trip's bookable elements, each with our estimate so a real booked
  // price can be judged against it at a glance. A flight has no estimate:
  // Carta does not price flights (T273).
  const bookingRows = [];
  if (flight?.combinable) {
    bookingRows.push({ key: 'flight-out', label: `${t('extras.flightOut')}: ${t('itin.fromTo', { a: flight.origin, b: flight.into_anchor })}`, estimate: null });
    bookingRows.push({ key: 'flight-home', label: `${t('extras.flightHome')}: ${t('itin.fromTo', { a: flight.out_anchor, b: flight.origin })}`, estimate: null });
  } else if (flight?.own) {
    bookingRows.push({ key: 'flight', label: `${t('itin.ownTravelIn')}: ${ownTravelHow(flight, t)}`, estimate: flight.cost_total || null });
  }
  stopDetails.forEach((s, i) => {
    if (!s.dest) return;
    bookingRows.push({ key: `stay-${i}`, label: t('extras.stayIn', { city: s.dest.city }), estimate: stayCosts[i]?.accomTotal ?? null });
  });
  if (carRental) bookingRows.push({ key: 'car', label: t('extras.car'), estimate: carRental.eur_total ?? null });

  // Everything the share text / printable PDF needs, in one bag.
  const exportPayload = {
    label, stopDetails, dayPlan, flight, flightTransfer, legs, anchorLegs, stayCosts, carRental, vignettes,
    tripHasCar, driveLegs, grandTotal, groupSize,
    extras, bookingRows,
  };

  // Files need a pass; links do not. Sharing a trip is how somebody else
  // first hears about Carta, so gating it would tax the only marketing this
  // product has. See hooks/usePaywall.jsx.
  const paywall = usePaywall();

  // A note under the export row (copy feedback, My Maps import steps, ...).
  const exportNote = (msg, ms = 2500) => {
    setShareState(msg);
    if (msg) window.setTimeout(() => setShareState(''), ms);
  };

  const handleKml = () => {
    if (!paywall.require('export')) return;
    downloadKml(label || 'carta-trip', tripKml({ label, stopDetails, dayPlan, fmtDate: fmtLong }));
    exportNote(t('export.myMapsHint'), 15000);
  };

  const handleIcs = () => {
    if (!paywall.require('export')) return;
    const ics = tripIcs(exportPayload);
    if (!ics) return;
    downloadIcs(label || 'carta-trip', ics);
    exportNote(t('export.calendarHint'), 6000);
  };

  // Same escalation as shareTrip: the native share sheet on phones (a URL
  // shares fine there), the clipboard on desktop.
  const handleCopyLink = async () => {
    const url = await buildTripShareUrl(sharePayload);
    if (!url) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: label || t('itin.myTrip'), url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // user closed the sheet
        // fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      exportNote(t('export.linkCopied'), 4000);
    } catch {
      exportNote(t('export.linkFailed'), 4000);
    }
  };

  // Anchor-city connections ("fly into Bergamo, then on to Como"): shown as
  // route rows around the stops and as receipt rows around the flights.
  const anchorIn = anchorLegs?.in && anchorLegs.in.ground_total ? anchorLegs.in : null;
  const anchorOut = anchorLegs?.out && anchorLegs.out.ground_total ? anchorLegs.out : null;
  // The fly-in and fly-home airports can be different cities, so label each
  // transfer with its own (falling back to the shared anchor for older data).
  const anchorInCity = anchorLegs?.inCity || anchorLegs?.anchor?.city;
  const anchorOutCity = anchorLegs?.outCity || anchorLegs?.anchor?.city;
  // Receipt-row icons for the transfers (the route-view rows carry their own).
  const AnchorInIcon = anchorIn ? (LEG_ICONS[anchorIn.mode] || BusIcon) : null;
  const AnchorOutIcon = anchorOut ? (LEG_ICONS[anchorOut.mode] || BusIcon) : null;

  const pickDay = (day) => {
    setTab(day.dayNum);
    onSelectStop?.(day.stopIndex);
  };

  const activeDay = typeof tab === 'number' ? dayPlan.find((d) => d.dayNum === tab) : null;
  const activeIdx = activeDay ? dayPlan.indexOf(activeDay) : -1;
  // The day switcher (T398, rule "Day list"): Previous and Next move one day,
  // as the pills did, and the arrow keys do the same while it has focus.
  const stepDay = (dir) => {
    const next = dayPlan[(activeIdx < 0 ? 0 : activeIdx) + dir];
    if (next) pickDay(next);
  };
  const onDayKeys = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); stepDay(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepDay(1); }
  };

  // The receipt's total settles in place when an input moves it (T398, rule
  // "Figure in place"): one opacity dip, no count-up.
  const totalRef = useRef(null);
  const ppRef = useRef(null);
  useSettledFigure(totalRef, grandTotal);
  useSettledFigure(ppRef, groupSize > 0 ? grandTotal / groupSize : null);

  // The whole trip as a Google Maps driving route (city to city, in order).
  // Route through each city CENTRE, never the raw dest coordinate: for
  // airport-tier stops that raw point is the runway, so cityCoords keeps the
  // pins downtown where the traveller actually stays.
  const gmapsUrl = googleMapsDirUrl(
    stopDetails.filter((s) => s.dest?.lat != null).map((s) => cityCoords(s.dest)),
    'driving',
  );

  // Chronological receipt subtotals: getting there, then each stop with the
  // leg to the next one, then getting home, then the round-trip items that
  // belong to the whole journey (airport transfers, rental, vignettes). A
  // flight Carta routed adds nothing: Carta does not price flights (T273), so
  // only the traveller's own fare (flight.own) is a flight figure here. The
  // airport transfers count for both, an own fare included (T278).
  const transferTotal = (flight?.combinable || flight?.own)
    ? (flightTransfer ? flightTransfer.ground_total : (flight.ground_total || 0)) : 0;
  const getThereTotal = (flight?.own ? (flight.cost_total || 0) : 0)
    + (driveLegs?.out?.ground_total || 0)
    + (anchorIn?.ground_total || 0);
  const getHomeTotal = (driveLegs?.home?.ground_total || 0)
    + (anchorOut?.ground_total || 0);
  const wholeTripTotal = transferTotal
    + (carRental?.eur_total || 0) + (vignettes?.eur_total || 0);

  // The cost bar's segments, in receipt order, each the sum of lines the
  // receipt prints below it (T398, rule "The cost bar").
  const sumStays = stayCosts.reduce((s, c) => s + (c?.accomTotal || 0), 0);
  const sumDaily = stayCosts.reduce((s, c) => s + (c?.groundTotal || 0), 0);
  const sumLegs = legs.reduce((s, l, i) => s + (i < stopDetails.length - 1 && l?.ground_total > 0 ? l.ground_total : 0), 0);
  const costSegments = [
    { slot: 'there', label: t('itin.secGetThere'), value: getThereTotal + getHomeTotal },
    { slot: 'stays', label: t('itin.secSleep'), value: sumStays },
    { slot: 'daily', label: t('itin.secDaily'), value: sumDaily },
    { slot: 'legs', label: t('travel.secBetween'), value: sumLegs },
    { slot: 'whole', label: t('itin.secWholeTrip'), value: wholeTripTotal },
  ].filter((s) => s.value > 0).map((s) => ({ ...s, weight: s.value, figure: eurExact(s.value) }));

  // The receipt's footer: what one changed input would do (carta-design, the
  // receipt). One more night at the last stop, read from that stop's own
  // lines in this receipt, so the figure is the receipt's and nobody else's.
  const lastIdx = stopDetails.length - 1;
  const lastStay = lastIdx >= 0 ? stayCosts[lastIdx] : null;
  const lastNights = lastIdx >= 0 ? stopDetails[lastIdx]?.nights : 0;
  const oneMoreNight = lastStay && lastNights > 0
    ? ((lastStay.accomTotal || 0) + (lastStay.groundTotal || 0)) / lastNights : 0;

  return (
    <div className="itin">
      {/* Two views, Overview and Day by day, then one day switcher instead of
          a pill per day that ran off the screen on a phone (T398, rule "Day
          list"). Every day stays reachable as a link from Your days. */}
      <div className="itin-tabs">
        <button
          type="button"
          className={`itin-tab ${tab === 'overview' ? 'active' : ''}`}
          aria-pressed={tab === 'overview'}
          onClick={() => { setTab('overview'); }}
        >
          {t('itin.overview')}
        </button>
        {dayPlan.length > 0 && (
          <button
            type="button"
            className={`itin-tab ${activeDay ? 'active' : ''}`}
            aria-pressed={Boolean(activeDay)}
            onClick={() => pickDay(activeDay || dayPlan[0])}
          >
            {t('trip.dayByDay')}
          </button>
        )}
      </div>
      {activeDay && (
        <div className="itin-dayswitch" role="group" aria-label={t('trip.dayByDay')} onKeyDown={onDayKeys}>
          <button
            type="button"
            className="itin-dayswitch-btn"
            onClick={() => stepDay(-1)}
            disabled={activeIdx <= 0}
          >
            {t('journey.trackPrev')}
          </button>
          <span className="itin-dayswitch-now" aria-live="polite">
            <span className="itin-dayswitch-pos">{t('journey.trackPos', { n: activeIdx + 1, total: dayPlan.length })}</span>
            <span className="itin-dayswitch-date">{fmtLong(activeDay.date)}</span>
          </span>
          <button
            type="button"
            className="itin-dayswitch-btn"
            onClick={() => stepDay(1)}
            disabled={activeIdx >= dayPlan.length - 1}
          >
            {t('journey.trackNext')}
          </button>
        </div>
      )}

      {tab === 'overview' ? (
        <div className="itin-overview">
          {/* The total comes first (T388, brief item 6): a money-first
              traveller looks for what the trip costs before the route, so
              the receipt sits under the top card and the route under it. */}
          {/* Estimated total, expandable into the same grouped receipt the Map
              tab shows: flights, ground legs, rental, stay per city. */}
          <div className={`itin-breakdown ${breakdownOpen ? 'open' : ''}`}>
            {/* The receipt's head (T398, brief V4-3): the label in --ui, the
                party and the sums in --mono to the cent, the figure a person
                beside the party's. Never Fraunces on a number. */}
            <button
              className="itin-overview-total itin-breakdown-toggle"
              onClick={() => setBreakdownOpen((v) => !v)}
              aria-expanded={breakdownOpen}
            >
              <span className="itin-total-lbl">
                {t('itin.estimatedTotal')} <small>{groupSize} {groupSize === 1 ? t('itin.personOne') : t('itin.personMany')}</small>
              </span>
              <span className="itin-total-figs">
                <strong ref={totalRef}>{eurExact(grandTotal)}</strong>
                {groupSize > 1 && (
                  <small ref={ppRef}>{t('itin.perPersonLine', { price: eurExact(grandTotal / groupSize) })}</small>
                )}
              </span>
              <span className={`itin-breakdown-caret ${breakdownOpen ? 'open' : ''}`} aria-hidden="true"><ChevronDownIcon size={14} /></span>
            </button>

            {breakdownOpen && (
              <div className="itin-breakdown-body">
                {/* One stacked bar over the lines, in the ink ramp (rule "The
                    cost bar"); every figure stays in the lines below. */}
                <CostBar t={t} segments={costSegments} />
                {flight && !flight.combinable && !flight.own && !flight.driving && !tripHasCar && (
                  <p className="trip-note">{flightReasonLabel(flight.reason)}</p>
                )}

                {/* The flight Carta routed is not in the total (T273). Said
                    once, before the receipt rows, so the sum reads honestly. */}
                {flight?.combinable && (
                  <p className="trip-note itin-flight-note">{t('itin.flightNotPriced')}</p>
                )}

                {/* 1. Getting there, in journey order. */}
                {(getThereTotal > 0 || flight?.combinable) && (
                  <BreakdownSection title={t('itin.secGetThere')} total={getThereTotal}>
                    {flight?.combinable && (
                      <div className="trip-total-row itin-flight-unpriced">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('itin.flightOut')}
                          <small>{flight.origin} → {flight.into_anchor}, {groupSize} {groupSize === 1 ? t('itin.seatOne') : t('itin.seatMany')}</small>
                        </span>
                      </div>
                    )}
                    {flight?.own && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <OwnTravelIcon mode={flight.mode} size={11} /> {ownTravelHow(flight, t)}
                          <small>
                            {flight.out_date ? `${fmtLong(flight.out_date)}${flight.ret_date ? ` → ${fmtLong(flight.ret_date)}` : ''}, ` : ''}
                            {flight.cost_total ? t('itin.bookedOtherGroup') : t('itin.bookedOtherNoFare')}
                          </small>
                        </span>
                        <span className="val">{flight.cost_total ? eurExact(flight.cost_total) : '…'}</span>
                      </div>
                    )}
                    {flight?.driving && driveLegs?.out && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <CarIcon size={11} /> {t('trip.driveOut', { city: stopDetails[0]?.dest?.city || '' })}
                          <small>{driveLegs.from ? `${driveLegs.from}, ` : ''}{t('trip.driveSub', { km: driveLegs.out.road_km, hours: fmtHours(driveLegs.out.hours) })}</small>
                        </span>
                        <span className="val">{eurExact(driveLegs.out.ground_total)}</span>
                      </div>
                    )}
                    {anchorIn && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <AnchorInIcon size={11} /> {anchorInCity} → {stopDetails[0]?.dest?.city}
                          <small>{t('itin.legStats', { km: anchorIn.road_km, hours: fmtHours(anchorIn.hours) })}</small>
                        </span>
                        <span className="val">{`${estPrefix(fareProv(anchorIn))}${eurExact(anchorIn.ground_total)}`}</span>
                      </div>
                    )}
                  </BreakdownSection>
                )}

                {/* 2. Each stop in visiting order: sleeping + daily life under
                       the stop's own header, the leg to the NEXT stop as the
                       connector between them. Chronology you can read. */}
                {stopDetails.map((s, i) => {
                  const sc = stayCosts[i];
                  const stopTotal = (sc?.accomTotal || 0) + (sc?.groundTotal || 0);
                  const l = i < stopDetails.length - 1 ? legs[i] : null;
                  const LegIcon = l && l.mode ? (LEG_ICONS[l.mode] || TrainIcon) : null;
                  return (
                    <React.Fragment key={`sec-${i}`}>
                      <BreakdownSection
                        title={`${i + 1}. ${s.dest?.city || t('itin.unknown')}`}
                        sub={s.arriveDate ? `${fmtLong(s.arriveDate)} → ${fmtLong(s.departDate)}` : null}
                        total={stopTotal}
                      >
                        {sc && sc.accomTotal > 0 && (
                          <div className="trip-total-row">
                            <span className="lbl">
                              <BedIcon size={11} /> {t('itin.secSleep')}
                              <small>{s.nights === 1 ? t('itin.accomOne', { n: s.nights }) : t('itin.accomMany', { n: s.nights })}</small>
                            </span>
                            <span className="val">{eurExact(sc.accomTotal)}</span>
                          </div>
                        )}
                        {sc && sc.groundTotal > 0 && (
                          <div className="trip-total-row">
                            <span className="lbl">
                              <ReceiptIcon size={11} /> {t('itin.secDaily')}
                              <small>{t('itin.onGroundSub')}</small>
                            </span>
                            <span className="val">{eurExact(sc.groundTotal)}</span>
                          </div>
                        )}
                      </BreakdownSection>
                      {l && l.ground_total > 0 && LegIcon && (
                        <div className="itin-bd-leg">
                          <span className="lbl">
                            <LegIcon size={11} /> {s.dest?.city} → {stopDetails[i + 1]?.dest?.city}
                            <small>
                              {t(MODE_LABEL_KEY[l.mode])}, {l.modes?.[l.mode]?.own
                                ? t('trip.legBooked')
                                : [t('itin.legStats', { km: l.road_km, hours: fmtHours(l.hours) }), legIncl(l, t)].filter(Boolean).join(', ')}
                            </small>
                          </span>
                          <span className="val">{l.modes?.[l.mode]?.own
                            ? eurExact(l.ground_total)
                            : `${estPrefix(fareProv(l.modes?.[l.mode]) || fareProv(l))}${eurExact(l.ground_total)}`}</span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* 3. Getting home. */}
                {(getHomeTotal > 0 || flight?.combinable) && (
                  <BreakdownSection title={t('itin.secGetHome')} total={getHomeTotal}>
                    {anchorOut && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <AnchorOutIcon size={11} /> {stopDetails[stopDetails.length - 1]?.dest?.city} → {anchorOutCity}
                          <small>{t('itin.legStats', { km: anchorOut.road_km, hours: fmtHours(anchorOut.hours) })}</small>
                        </span>
                        <span className="val">{`${estPrefix(fareProv(anchorOut))}${eurExact(anchorOut.ground_total)}`}</span>
                      </div>
                    )}
                    {flight?.driving && driveLegs?.home && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <CarIcon size={11} /> {t('trip.driveHome', { city: stopDetails[stopDetails.length - 1]?.dest?.city || '' })}
                          <small>{t('trip.driveSub', { km: driveLegs.home.road_km, hours: fmtHours(driveLegs.home.hours) })}</small>
                        </span>
                        <span className="val">{eurExact(driveLegs.home.ground_total)}</span>
                      </div>
                    )}
                    {flight?.combinable && (
                      <div className="trip-total-row itin-flight-unpriced">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('itin.flightHome')}
                          <small>{flight.out_anchor} → {flight.origin}, {groupSize} {groupSize === 1 ? t('itin.seatOne') : t('itin.seatMany')}</small>
                        </span>
                      </div>
                    )}
                  </BreakdownSection>
                )}

                {/* 4. Round-trip items that belong to the whole journey. An
                       own-car trip has none of them, so the group is skipped
                       entirely there rather than framing a lone sentence. */}
                {wholeTripTotal > 0 && (
                  <BreakdownSection title={t('itin.secWholeTrip')} total={wholeTripTotal}>
                    {(flight?.combinable || flight?.own) && flight.ground_total > 0 && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('itin.airportTransfers')}
                          <small>{t('itin.transfersSub')}</small>
                        </span>
                        <span className="val">{eurExact(flightTransfer ? flightTransfer.ground_total : flight.ground_total)}</span>
                      </div>
                    )}
                    {carRental && (
                      <div className="trip-total-row">
                        <span className="lbl"><CarIcon size={11} /> {t('itin.rentalCar')} <small>{carRental.cars > 1 ? t('itin.rentalSubCars', { days: carRental.days, cars: carRental.cars }) : t('itin.rentalSub', { days: carRental.days })}</small></span>
                        <span className="val">{eurExact(carRental.eur_total)}</span>
                      </div>
                    )}
                    {vignettes && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <CarIcon size={11} /> {t('itin.vignettes')}
                          <small>{t('itin.vignettesSub', { countries: vignettes.items.map((v) => v.iso2).join(', ') })}</small>
                        </span>
                        <span className="val">{eurExact(vignettes.eur_total)}</span>
                      </div>
                    )}
                  </BreakdownSection>
                )}

                <TransferModePicker
                  flightTransfer={flightTransfer}
                  anchorIn={anchorIn}
                  anchorOut={anchorOut}
                  setTransferMode={setTransferMode}
                />

                <div className="itin-bd-grand">
                  <span className="itin-bd-grand-lbl">{t('itin.estimatedTotal')}</span>
                  <span className="itin-bd-grand-val">{eurExact(grandTotal)}</span>
                </div>
                {groupSize > 1 && (
                  <div className="itin-bd-pp">{t('itin.perPersonLine', { price: eurExact(grandTotal / groupSize) })}</div>
                )}
                {/* Party size sits under the figure it multiplies. The wizard
                    asks it once on its summary card; changing it afterwards
                    belongs here, where the total moves as you press. */}
                {onSetGroupSize && (
                  <div className="itin-bd-party">
                    <span className="itin-bd-party-lbl">{t('wizard.summaryTravellers')}</span>
                    <div className="guide-people">
                      <button type="button" onClick={() => onSetGroupSize(groupSize - 1)} disabled={groupSize <= 1} aria-label={t('trip.fewer')}>-</button>
                      <span>{groupSize}</span>
                      <button type="button" onClick={() => onSetGroupSize(groupSize + 1)} disabled={groupSize >= 20} aria-label={t('trip.more')}>+</button>
                    </div>
                  </div>
                )}
                {flight?.driving && (
                  <p className="itin-bd-foot-note">{t('trip.ownCarNote')}</p>
                )}
                {oneMoreNight > 0 && (
                  <p className="itin-bd-what-if">
                    {t('trip.oneMoreNight', { city: stopDetails[lastIdx]?.dest?.city || '' })}{' '}
                    <span className="mono">+{eurExact(oneMoreNight)}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* The journey starts with a flight - show it as part of the route,
              not only as a cost line in the breakdown. */}
          {flight?.combinable && (
            <>
              <div className="itin-flight-row">
                <PlaneIcon size={12} />
                <span>{t('itin.fly')} <b>{flight.origin} → {flight.into_anchor}</b></span>
                <small>{fmtLong(stopDetails[0]?.arriveDate)}</small>
              </div>
              <GroundLinkNote iata={flight.origin} dir="to" />
              <GroundLinkNote iata={flight.into_anchor} dir="from" />
            </>
          )}
          {flight?.own && (
            <div className="itin-flight-row">
              <OwnTravelIcon mode={flight.mode} size={12} />
              <span>
                {t('itin.ownTravelIn')} <b>{ownTravelHow(flight, t)}</b>
              </span>
              <small>{fmtLong(flight.out_date || stopDetails[0]?.arriveDate)}</small>
            </div>
          )}
          {anchorIn && (
            <AnchorTransferLeg
              leg={anchorIn}
              from={anchorInCity}
              to={stopDetails[0]?.dest?.city}
              onMode={setTransferMode ? (m) => setTransferMode(m, 'in') : null}
            />
          )}
          {flight?.driving && (
            <ItinDriveRow leg={driveLegs?.out} labelKey="trip.driveOut" city={stopDetails[0]?.dest?.city || ''} from={driveLegs?.from} />
          )}
          {stopDetails.map((s, i) => (
            <React.Fragment key={i}>
              <button
                className={`itin-stop ${activeStopIndex === i ? 'active' : ''}`}
                onClick={() => onSelectStop?.(i)}
              >
                <span className="itin-stop-idx">{i + 1}</span>
                <span
                  className="itin-stop-thumb"
                  style={s.dest?.image?.url ? { backgroundImage: `url(${s.dest.image.url})` } : undefined}
                >
                  {!s.dest?.image?.url && <span className="itin-stop-thumb-fallback">{s.dest?.city?.slice(0, 1) || '?'}</span>}
                </span>
                <span className="itin-stop-main">
                  <span className="itin-stop-city">{s.dest?.city || t('itin.unknown')}, {s.dest?.country}</span>
                  <span className="itin-stop-sub">
                    {fmtLong(s.arriveDate)} → {fmtLong(s.departDate)}, {s.nights} {s.nights === 1 ? t('itin.nightOne') : t('itin.nightMany')}
                  </span>
                </span>
              </button>
              {/* How you get to the NEXT stay: the leg is part of the route,
                  with its mode changeable in place. */}
              {i < stopDetails.length - 1 && (
                <ItinLeg leg={legs[i]} onMode={setLegMode ? (m) => setLegMode(i, m) : null} />
              )}
            </React.Fragment>
          ))}
          {flight?.driving && (
            <ItinDriveRow leg={driveLegs?.home} labelKey="trip.driveHome" city={stopDetails[stopDetails.length - 1]?.dest?.city || ''} />
          )}

          {anchorOut && (
            <AnchorTransferLeg
              leg={anchorOut}
              from={stopDetails[stopDetails.length - 1]?.dest?.city}
              to={anchorOutCity}
              onMode={setTransferMode ? (m) => setTransferMode(m, 'out') : null}
            />
          )}
          {flight?.combinable && (
            <>
              <GroundLinkNote iata={flight.out_anchor} dir="to" />
              <div className="itin-flight-row">
                <PlaneIcon size={12} />
                <span>{t('itin.flyHome')} <b>{flight.out_anchor} → {flight.origin}</b></span>
                <small>{fmtLong(stopDetails[stopDetails.length - 1]?.departDate)}</small>
              </div>
            </>
          )}
          {flight?.own && (
            <div className="itin-flight-row">
              <OwnTravelIcon mode={flight.mode} size={12} />
              <span>
                {t('itin.ownTravelHome')} <b>{ownTravelHow(flight, t)}</b>
              </span>
              <small>{fmtLong(flight.ret_date || stopDetails[stopDetails.length - 1]?.departDate)}</small>
            </div>
          )}

          {/* Every day, one tap from its plan - and one more into the Day
              planner to properly shape it. */}
          <div className="itin-days-list">
            <div className="trip-block-title">{t('itin.yourDays')}</div>
            {dayPlan.map((d) => {
              const placed = extras.dayExtras?.[d.dayNum] || [];
              return (
                <div className="itin-day-row" key={d.dayNum}>
                  <button className="itin-day-row-main" onClick={() => pickDay(d)}>
                    <span className="itin-day-row-num">{t('itin.dayN', { n: d.dayNum })}</span>
                    <span className="itin-day-row-meta">
                      {d.stop.dest?.city}{d.date ? `, ${fmtLong(d.date)}` : ''}
                      {dayPlanned(d) && `, ${t('itin.planned')}`}
                    </span>
                  </button>
                  {onPlanDay && (
                    <button
                      className="itin-day-plan-btn"
                      onClick={() => onPlanDay(d)}
                      title={t(dayPlanned(d) ? 'itin.changeDayTitle' : 'itin.shapeDayTitle', { n: d.dayNum })}
                    >
                      <SparkIcon size={11} /> {dayPlanned(d) ? t('itin.editPlan') : t('itin.plan')}
                    </button>
                  )}
                  {/* Activities routed here from the import inbox: pinned to
                      the day, removable where they are shown. */}
                  {placed.length > 0 && (
                    <div className="itin-day-extras">
                      {placed.map((a) => (
                        <span className="itin-day-extra" key={a.id}>
                          {a.name}
                          {a.eur != null && <small>{eur(a.eur)}</small>}
                          <button
                            onClick={() => saveExtras({
                              ...extras,
                              dayExtras: {
                                ...extras.dayExtras,
                                [d.dayNum]: placed.filter((x) => x.id !== a.id),
                              },
                            })}
                            aria-label={t('extras.removeTitle')}
                            title={t('extras.removeTitle')}
                          ><CloseIcon size={16} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bookings, notes, the packing list and the spend book: the trip's
              life admin, saved with the plan (and synced to the account when
              signed in). One fold, closed until asked for (T388, brief item
              6): it used to stand open between the days and the exports and
              made the sheet 2,546 px tall at 380. */}
          <div className={`trip-block trip-admin ${adminOpen ? 'open' : ''}`}>
            <h2 className="trip-fold-h">
              <button className="day-collapse-head" onClick={() => setAdminOpen((v) => !v)} aria-expanded={adminOpen}>
                <span className="day-collapse-headline">
                  <span className="day-collapse-title">{t('trip.adminTitle')}</span>
                  <span className={`day-collapse-caret ${adminOpen ? 'open' : ''}`} aria-hidden="true"><ChevronDownIcon size={14} /></span>
                </span>
                {!adminOpen && <span className="day-collapse-summary">{t('trip.adminSummary')}</span>}
              </button>
            </h2>
          {adminOpen && (
          <>
          <TripExtras
            rows={bookingRows}
            extras={extras}
            onChange={saveExtras}
            days={dayPlan.map((d) => ({ n: d.dayNum, city: d.stop.dest?.city || '', date: d.date }))}
            importContext={{
              stops: stopDetails.filter((s) => s.dest).map((s) => ({
                city: s.dest.city,
                country: s.dest.country,
                arrive: s.arriveDate || '',
                nights: s.nights,
              })),
              groupSize,
            }}
          />

          {/* Who paid for what, in any currency, and who owes whom: the
              group's shared-spend book, on the same save/sync rails. */}
          <ExpenseLedger extras={extras} onChange={saveExtras} groupSize={groupSize} />
          </>
          )}
          </div>

          {/* Take the trip with you: share it, keep a PDF copy, or open the
              route straight in Google Maps. The Maps link is built from city
              coordinates, names failed to geocode for many smaller places.
              Collapsed behind one toggle - a row of up to six buttons each
              wrapping onto their own lines was the ugliest part of the
              overview, and it's the same list every trip needs once. */}
          <div className={`itin-export ${exportOpen ? 'open' : ''}`}>
            <button
              className="itin-export-toggle"
              onClick={() => setExportOpen((v) => !v)}
              aria-expanded={exportOpen}
            >
              <span><ShareIcon size={13} /> {t('export.exportAndShare')}</span>
              <span className={`itin-breakdown-caret ${exportOpen ? 'open' : ''}`} aria-hidden="true"><ChevronDownIcon size={14} /></span>
            </button>
            {exportOpen && (
              <div className="itin-export-menu">
                <button
                  className="itin-export-item"
                  onClick={async () => {
                    const r = await shareTrip(exportPayload);
                    setShareState(r === 'copied' ? t('export.copied') : '');
                    if (r === 'copied') window.setTimeout(() => setShareState(''), 2500);
                  }}
                  title={t('export.shareTripTitle')}
                >
                  <ShareIcon size={13} /> {t('export.shareTrip')}
                </button>
                <button
                  className="itin-export-item"
                  onClick={() => {
                    if (!paywall.require('export')) return;
                    downloadTripPdf(exportPayload);
                  }}
                  title={t('export.downloadPdfTitle')}
                >
                  <DownloadIcon size={13} /> {t('export.downloadPdf')}
                </button>
                {gmapsUrl && (
                  <a
                    className="itin-export-item"
                    href={gmapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={t('export.openRoute')}
                  >
                    <MapPinIcon size={13} /> {t('export.openInGmaps')}
                  </a>
                )}
                <button
                  className="itin-export-item"
                  onClick={handleKml}
                  title={t('export.myMapsTitle')}
                >
                  <RouteIcon size={13} /> {t('export.myMaps')}
                </button>
                <button
                  className="itin-export-item"
                  onClick={handleIcs}
                  title={t('export.calendarTitle')}
                >
                  <CalendarIcon size={13} /> {t('export.calendar')}
                </button>
                {sharePayload && (
                  <button
                    className="itin-export-item"
                    onClick={handleCopyLink}
                    title={t('export.copyLinkTitle')}
                  >
                    <LinkIcon size={13} /> {t('export.copyLink')}
                  </button>
                )}
              </div>
            )}
          </div>
          {shareState && <p className="itin-export-note">{shareState}</p>}
        </div>
      ) : activeDay ? (
        <div className="itin-day">
          {/* The photograph carries nothing; the day's head sits in the
              paper band under it (T398, rule "Caption band"). */}
          {activeDay.stop.dest?.image?.url && (
            <div
              className="itin-day-hero"
              style={{ backgroundImage: `url(${activeDay.stop.dest.image.url})` }}
              aria-hidden="true"
            />
          )}
          <div className="itin-day-head itin-day-cap">
            <div className="itin-day-date">{fmtLong(activeDay.date)}</div>
            <div className="itin-day-city">
              {t('itin.stayingIn', { city: activeDay.stop.dest?.city })}
              <span className="itin-day-of">{t('itin.dayOf', { a: activeDay.dayOfStay, b: activeDay.staysOfCity })}</span>
            </div>
          </div>
          {activeDay.activities.length === 0 ? (
            <p className="itin-day-empty">
              {dayPlanned(activeDay)
                ? t('itin.dayPlannedNote')
                : t('itin.freeDay', { city: activeDay.stop.dest?.city })}
            </p>
          ) : (
            <ol className="itin-visit-list">
              {activeDay.activities.map((name, idx) => {
                const item = (activeDay.stop.dest?.activities?.items || []).find((x) => x.name === name);
                return (
                  <li key={name} className="itin-visit">
                    <span className="itin-visit-idx">{idx + 1}</span>
                    <span className="itin-visit-main">
                      <span className="itin-visit-name">{name}</span>
                      {item?.kind && <span className="itin-visit-kind">{item.kind}</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {activeDay.overflowCount > 0 && (
            <p className="itin-day-overflow">
              {activeDay.overflowCount === 1
                ? t('itin.overflowOne', { n: activeDay.overflowCount })
                : t('itin.overflowMany', { n: activeDay.overflowCount })}
            </p>
          )}
          {onPlanDay && (
            <button className="itin-day-planner-btn" onClick={() => onPlanDay(activeDay)}>
              <SparkIcon size={12} /> {dayPlanned(activeDay) ? t('itin.editDayBtn') : t('itin.planDayBtn')}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
