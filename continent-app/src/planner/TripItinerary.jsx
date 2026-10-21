import React, { useState, useEffect } from 'react';
import { eur, eurExact, fmtHours, safeUrl } from '../lib/format.js';
import { fmtDate } from '../lib/dates.js';
import { TripExtras } from './TripExtras.jsx';
import { ExpenseLedger } from './ExpenseLedger.jsx';
import { loadTripExtras, persistTripExtras, subscribeDayPlanStore } from './dayPlanStore.js';
import { googleMapsDirParts, GMAPS_STOPS_PHONE, GMAPS_STOPS_DESKTOP } from '../lib/routing.js';
import { cityCoords } from '../lib/runtime_pricing.js';
import { shareTrip, downloadTripPdf } from '../lib/tripExport.js';
import { tripKml, downloadKml } from '../lib/kmlExport.js';
import { tripIcs, downloadIcs } from '../lib/icsExport.js';
import { buildTripShareUrl } from '../lib/shareLink.js';
import { groundLinkFor } from '../lib/groundLinks.js';
import { fareProv, estPrefix, FareTag, BookingNote } from '../components/FareProvenance.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money, Segmented } from '../components/ui/index.js';
import { cityLabel } from '../lib/placeName.js';
import { PlanTotal, PaidField } from './PlanTotal.jsx';
import { scrollBehavior } from '../lib/motion.js';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { SparkIcon, TrainIcon, BusIcon, CarIcon, FerryIcon, BedIcon, ReceiptIcon, ShareIcon, DownloadIcon, MapPinIcon, RouteIcon, CalendarIcon, LinkIcon, ChevronDownIcon, CloseIcon, TicketIcon, LuggageIcon, PencilIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { TRAVEL_MODE_LABEL, legLinks, stayDatesLink } from '../lib/transportLinks.js';
import { SheetShell } from '../browse/SheetShell.jsx';

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
// One date style across the planner (T458): the same stamp as every other
// planner date, in the reader's language.
function fmtLong(iso) {
  return iso ? fmtDate(iso, true) : '';
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

/** The way from the plane to the first bed and from the last bed back to the
 *  plane (T458): a plain row in the route with its mode and its estimate, so
 *  the journey reads whole. The mode is chosen on the picker under the route. */
function FlightTransferRow({ label, mode, eur }) {
  const { t } = useI18n();
  if (!(eur > 0)) return null;
  const meta = TRANSFER_META[mode] || TRANSFER_META.public;
  const Icon = meta.Icon;
  return (
    <li className="itin-hop itin-airport-hop">
      <span className="itin-airport-hop-icon" aria-hidden="true"><Icon size={16} /></span>
      <span className="itin-airport-hop-main">
        <b>{label}</b>
        <small>{t('plan.transfer')}, {t(meta.labelKey)}</small>
      </span>
      <span className="itin-airport-hop-eur"><Money value={eur} est precision="cents" /></span>
    </li>
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
          <small>
            {chosen?.own
              // Their own booking: Carta has no km or duration for it, only
              // the fare they told us, so it must not pretend to an estimate.
              ? (leg.ground_total > 0 ? <>{t('trip.legBooked')}, <Money value={leg.ground_total} precision="cents" /></> : t('trip.legBookedNoPrice'))
              : <>{t('plan.legKmTime', { km: leg.road_km, hours: fmtHours(chosen?.hours ?? leg.hours) })}, <Money value={leg.ground_total} est precision="cents" /></>}
          </small>
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
  dayPlan, stopDetails, grandTotal, groupSize, flight, label = '',
  legs = [], setLegMode = null, anchorLegs = null, flightTransfer = null,
  driveLegs = null, stayCosts = [], carRental = null, vignettes = null,
  tripHasCar = false,
  setTransferMode = null,
  activeStopIndex, onSelectStop, onPlanDay, isDayPlanned = null,
  sharePayload = null, extrasPlanId = null,
  // T432: the one priced trip (lib/tripTotal.js) and the traveller's own
  // figures, each typed where the thing it paid for is shown.
  priced = null, ownFlight = null, onTravelPaid = null, onOwnLeg = null, onOwnStay = null,
  mapSlot = null, beforeSlot = null, onPdf = null, party = null, onSetParty = null,
}) {
  // Whether a day already has Day-planner picks (drives "Plan" vs "Modify").
  const dayPlanned = (d) => Boolean(isDayPlanned && isDayPlanned(d.stopIndex, d.dayOfStay));
  const { t } = useI18n();
  const [tab, setTab] = useState('overview');
  const [toolOpen, setToolOpen] = useState('');
  const [moreExports, setMoreExports] = useState(false);
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
    bookingRows.push({
      key: `stay-${i}`, label: t('extras.stayIn', { city: s.dest.city }), estimate: stayCosts[i]?.accomTotal ?? null,
      findUrl: stayDatesLink({
        city: s.dest.city, country: s.dest.country, checkin: s.arriveDate, checkout: s.departDate,
        adults: party?.adults || groupSize, children: party?.children || 0,
      }),
      findLabel: t('plan.findStay'),
    });
    // The hop to the next stop is a booking too: a train or a bus ticket.
    const leg = i < stopDetails.length - 1 ? legs[i] : null;
    const next = stopDetails[i + 1]?.dest;
    if (leg && leg.mode && !leg.no_road && next && leg.mode !== 'car') {
      const link = legLinks({ from: { city: s.dest.city, iso2: s.dest.iso2 }, to: { city: next.city, iso2: next.iso2 }, mode: leg.mode, date: next ? stopDetails[i + 1].arriveDate : '' })[0];
      bookingRows.push({
        key: `leg-${i}`, label: t('plan.legBooking', { a: s.dest.city, b: next.city }), estimate: leg.ground_total ?? null,
        findUrl: link?.url || null, findLabel: t('plan.findTickets'),
      });
    }
  });
  if (carRental) bookingRows.push({ key: 'car', label: t('extras.car'), estimate: carRental.eur_total ?? null });

  // Everything the share text / printable PDF needs, in one bag.
  const exportPayload = {
    label, stopDetails, dayPlan, flight, flightTransfer, legs, anchorLegs, stayCosts, carRental, vignettes,
    tripHasCar, driveLegs, grandTotal, groupSize,
    extras, bookingRows,
  };

  // The four tools and what each holds now, for its tile.
  const doneBookings = bookingRows.filter((r) => extras.bookings?.[r.key]?.done).length;
  const packed = (extras.checklist || []).filter((c) => c.done).length;
  const tools = [
    { key: 'bookings', Icon: TicketIcon, title: t('plan.toolBookings'), state: t('plan.toolBookedOf', { n: doneBookings, of: bookingRows.length }) },
    { key: 'packing', Icon: LuggageIcon, title: t('plan.toolPacking'), state: (extras.checklist || []).length ? t('plan.toolPackedOf', { n: packed, of: extras.checklist.length }) : t('plan.toolEmpty') },
    { key: 'notes', Icon: PencilIcon, title: t('plan.toolNotes'), state: (extras.notes || '').trim() ? t('plan.toolWritten') : t('plan.toolEmpty') },
    { key: 'expenses', Icon: ReceiptIcon, title: t('plan.toolExpenses'), state: (extras.expenses || []).length ? t('plan.toolEntries', { n: extras.expenses.length }) : t('plan.toolEmpty') },
  ];
  const openTool = tools.find((x) => x.key === toolOpen) || null;

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

  // The whole trip as a Google Maps driving route (city to city, in order).
  // Route through each city CENTRE, never the raw dest coordinate: for
  // airport-tier stops that raw point is the runway, so cityCoords keeps the
  // pins downtown where the traveller actually stays. A phone's browser takes
  // 3 stops a link, so there the route comes in parts, each ending where the
  // next begins; nothing is dropped (T487-a).
  const gmapsPhone = typeof window !== 'undefined'
    && !!window.matchMedia?.('(max-width: 768px), (pointer: coarse)').matches;
  const gmapsParts = googleMapsDirParts(
    stopDetails.filter((s) => s.dest?.lat != null).map((s) => ({ ...cityCoords(s.dest), city: s.dest.city })),
    'driving',
    gmapsPhone ? GMAPS_STOPS_PHONE : GMAPS_STOPS_DESKTOP,
  );

  // The traveller's own figures for the way there and home (T432): an older
  // trip carries one total for the pair, which reads as the way there.
  const split = ownFlight && (ownFlight.costOut != null || ownFlight.costBack != null);
  const paidOut = ownFlight ? (split ? Number(ownFlight.costOut) || 0 : Number(ownFlight.costTotal) || 0) : 0;
  const paidBack = ownFlight && split ? Number(ownFlight.costBack) || 0 : 0;
  const travelMode = flight?.driving ? 'car' : (flight?.mode || 'fly');
  const firstCity = stopDetails[0]?.dest?.city || '';
  const lastCity = stopDetails[stopDetails.length - 1]?.dest?.city || '';
  // A flight lands at an airport, not at a town without one (T458): with a
  // transfer on the trip, the flight row names the airports it joins.
  const inIata = flightTransfer ? stopDetails[0]?.dest?.anchor_airport : null;
  const outIata = flightTransfer ? stopDetails[stopDetails.length - 1]?.dest?.anchor_airport : null;
  const flyIn = inIata ? t('plan.howTo', { how: ownTravelHow(flight, t), place: inIata }) : '';
  const flyOut = outIata ? t('plan.howFrom', { how: ownTravelHow(flight, t), place: outIata }) : '';
  const thereText = flight?.driving
    ? [driveLegs?.from, driveLegs?.out ? t('trip.driveSub', { km: driveLegs.out.road_km, hours: fmtHours(driveLegs.out.hours) }) : ''].filter(Boolean).join(', ')
    : flight?.combinable
      ? `${t('itin.fromTo', { a: flight.origin, b: flight.into_anchor })}, ${fmtLong(stopDetails[0]?.arriveDate)}`
      : [flyIn || ownTravelHow(flight, t), flyIn ? '' : firstCity, fmtLong(flight?.out_date || stopDetails[0]?.arriveDate)].filter(Boolean).join(', ');
  const homeText = flight?.driving
    ? (driveLegs?.home ? t('trip.driveSub', { km: driveLegs.home.road_km, hours: fmtHours(driveLegs.home.hours) }) : '')
    : flight?.combinable
      ? `${t('itin.fromTo', { a: flight.out_anchor, b: flight.origin })}, ${fmtLong(stopDetails[stopDetails.length - 1]?.departDate)}`
      : [flyOut || ownTravelHow(flight, t), flyOut ? '' : lastCity, fmtLong(flight?.ret_date || stopDetails[stopDetails.length - 1]?.departDate)].filter(Boolean).join(', ');
  const datesText = stopDetails[0]?.arriveDate
    ? t('plan.dateRange', { a: fmtLong(stopDetails[0].arriveDate), b: fmtLong(stopDetails[stopDetails.length - 1]?.departDate) })
    : '';
  const partyText = groupSize === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: groupSize });
  const jumpToFare = () => {
    const el = typeof document !== 'undefined' ? document.getElementById('paid-out') : null;
    if (!el) return;
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    el.focus({ preventScroll: true });
  };

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
      {dayPlan.length > 0 && (
        <Segmented
          block
          className="itin-tabs"
          label={t('trip.dayByDay')}
          value={tab === 'overview' ? 'overview' : 'days'}
          onChange={(v) => (v === 'overview' ? setTab('overview') : pickDay(activeDay || dayPlan[0]))}
          options={[
            { value: 'overview', label: t('itin.overview') },
            { value: 'days', label: t('trip.dayByDay') },
          ]}
        />
      )}
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
            <span className="itin-dayswitch-pos">{t('itin.dayN', { n: activeIdx + 1 })}</span>
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
          <PlanTotal
            priced={priced}
            dates={datesText}
            party={party}
            onParty={onSetParty}
            onAddFare={onTravelPaid ? jumpToFare : null}
            variant="card"
            title={t('plan.tripTotal')}
            footer={oneMoreNight > 0 ? (
              <p className="plan-whatif">
                {t('trip.oneMoreNightAdds', { city: stopDetails[lastIdx]?.dest?.city || '' })}{' '}
                <b><Money value={oneMoreNight} est precision="cents" /></b>
              </p>
            ) : null}
          />

          {/* The trip's tools, one tap each (T458): what is booked, what is
              packed, notes, who paid what. They used to sit in one long fold
              at the foot of the page. */}
          <section className="itin-tools" aria-labelledby="itin-tools-h">
            <h2 className="itin-h" id="itin-tools-h">{t('plan.toolsTitle')}</h2>
            <div className="itin-tool-grid">
              {tools.map((tool) => (
                <Button key={tool.key} variant="secondary" className="itin-tool" onClick={() => setToolOpen(tool.key)}
                  aria-haspopup="dialog">
                  <span className="itin-tool-icon" aria-hidden="true"><tool.Icon size={24} /></span>
                  <span className="itin-tool-name">{tool.title}</span>
                  <span className="itin-tool-state">{tool.state}</span>
                </Button>
              ))}
            </div>
          </section>

          {mapSlot}

          {/* The route as one timeline (T432): the way there, every bed and
              every hop, the way home. Each part carries its figure, and the
              place to put what was paid sits on the part it paid for. */}
          <section className="itin-route" aria-labelledby="itin-route-h">
            <h2 className="itin-h" id="itin-route-h">{t('plan.yourRoute')}</h2>
            <ol className="itin-steps">
              <li className="itin-end" id="itin-fare-out">
                <span className="itin-end-icon"><OwnTravelIcon mode={travelMode} size={16} /></span>
                <span className="itin-end-main">
                  <b>{t('itin.secGetThere')}</b>
                  <small>{thereText}</small>
                </span>
                {onTravelPaid && (
                  <PaidField
                    id="paid-out"
                    value={paidOut}
                    estimate={flight?.driving ? driveLegs?.out?.ground_total ?? null : null}
                    label={t('plan.yourFareFor', { people: partyText })}
                    addLabel={t('plan.addYourFare')}
                    onChange={(n) => onTravelPaid('out', n)}
                    folded
                    hint={false}
                  />
                )}
              </li>
              {!anchorIn && flightTransfer && (
                <FlightTransferRow
                  label={t('plan.transferIn', { city: cityLabel(stopDetails[0]?.dest?.city || '') })}
                  mode={flightTransfer.mode_in || flightTransfer.mode}
                  eur={flightTransfer.in_total}
                />
              )}
              {anchorIn && (
                <li className="itin-hop">
                  <AnchorTransferLeg
                    leg={anchorIn}
                    from={anchorInCity}
                    to={stopDetails[0]?.dest?.city}
                    onMode={setTransferMode ? (m) => setTransferMode(m, 'in') : null}
                  />
                </li>
              )}
              {stopDetails.map((s, i) => {
                const sc = stayCosts[i];
                const leg = i < stopDetails.length - 1 ? legs[i] : null;
                const legOwn = leg?.modes?.[leg?.mode]?.own;
                return (
                  <React.Fragment key={`stop-${i}`}>
                    <li className={`itin-stopcard ${activeStopIndex === i ? 'active' : ''}`}>
                      <Button variant="quiet" className="itin-stop" onClick={() => onSelectStop?.(i)}>
                        <span className="itin-stop-idx">{i + 1}</span>
                        <span
                          className="itin-stop-thumb"
                          style={s.dest?.image?.url ? { backgroundImage: `url(${s.dest.image.url})` } : undefined}
                        >
                          {!s.dest?.image?.url && <span className="itin-stop-thumb-fallback">{s.dest?.city?.slice(0, 1) || '?'}</span>}
                        </span>
                        <span className="itin-stop-main">
                          <span className="itin-stop-city">{s.dest?.city || t('itin.unknown')}</span>
                          <span className="itin-stop-sub">
                            {t(s.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: s.nights })}
                            {s.arriveDate ? `, ${fmtLong(s.arriveDate)}` : ''}
                          </span>
                        </span>
                      </Button>
                      {sc && (
                        <div className="itin-bed">
                          <span className="itin-bed-lbl">
                            {t('plan.lineBeds')}
                            <span className="itin-bed-fig">
                              {sc.ownAccom
                                ? <span className="plan-line-yours"><Money value={sc.accomTotal} precision="cents" /><small>{t('plan.yours')}</small></span>
                                : <Money value={sc.accomTotal} est precision="cents" />}
                            </span>
                          </span>
                          <span className="itin-bed-acts">
                            {!sc.ownAccom && (
                              <a
                                className="btn btn-quiet btn-sm itin-find"
                                href={stayDatesLink({
                                  city: s.dest.city, country: s.dest.country, checkin: s.arriveDate, checkout: s.departDate,
                                  adults: party?.adults || groupSize, children: party?.children || 0,
                                })}
                                target="_blank"
                                rel="noreferrer noopener"
                              >
                                <span className="btn-label">{t('plan.findStay')}</span>
                              </a>
                            )}
                            {onOwnStay && (
                              <PaidField
                                id={`paid-bed-${i}`}
                                value={sc.ownAccom ? sc.accomTotal : 0}
                                estimate={sc.estAccomTotal ?? sc.accomTotal}
                                label={t('plan.bookingPrice')}
                                addLabel={t('plan.addBookingPrice')}
                                onChange={(n) => onOwnStay(s.destinationId, n)}
                                folded
                                hint={false}
                              />
                            )}
                          </span>
                        </div>
                      )}
                    </li>
                    {leg && (
                      <li className="itin-hop">
                        <ItinLeg leg={leg} onMode={setLegMode ? (m) => setLegMode(i, m) : null} />
                        <span className="itin-hop-acts">
                          {!legOwn && leg.mode && leg.mode !== 'car' && !leg.no_road && (() => {
                            const next = stopDetails[i + 1];
                            const link = legLinks({
                              from: { city: s.dest?.city, iso2: s.dest?.iso2 },
                              to: { city: next?.dest?.city, iso2: next?.dest?.iso2 },
                              mode: leg.mode, date: next?.arriveDate || '',
                            })[0];
                            return link ? (
                              <a className="btn btn-quiet btn-sm itin-find" href={link.url} target="_blank" rel="noreferrer noopener">
                                <span className="btn-label">{t('plan.findTicketsOn', { site: link.label })}</span>
                              </a>
                            ) : null;
                          })()}
                          {onOwnLeg && leg.mode && !leg.no_road && (
                            <PaidField
                              id={`paid-leg-${i}`}
                              value={legOwn ? leg.ground_total : 0}
                              estimate={legOwn ? null : leg.ground_total}
                              label={t('plan.youPaidFor', { people: partyText })}
                              addLabel={t('plan.addTicketPrice')}
                              onChange={(n) => onOwnLeg(i, n > 0 ? leg.mode : null, n)}
                              folded
                              hint={false}
                            />
                          )}
                        </span>
                      </li>
                    )}
                  </React.Fragment>
                );
              })}
              {anchorOut && (
                <li className="itin-hop">
                  <AnchorTransferLeg
                    leg={anchorOut}
                    from={stopDetails[stopDetails.length - 1]?.dest?.city}
                    to={anchorOutCity}
                    onMode={setTransferMode ? (m) => setTransferMode(m, 'out') : null}
                  />
                </li>
              )}
              {!anchorOut && flightTransfer && (
                <FlightTransferRow
                  label={t('plan.transferOut', { city: cityLabel(stopDetails[stopDetails.length - 1]?.dest?.city || '') })}
                  mode={flightTransfer.mode_out || flightTransfer.mode}
                  eur={flightTransfer.out_total}
                />
              )}
              <li className="itin-end">
                <span className="itin-end-icon"><OwnTravelIcon mode={travelMode} size={16} /></span>
                <span className="itin-end-main">
                  <b>{t('itin.secGetHome')}</b>
                  <small>{homeText}</small>
                </span>
                {onTravelPaid && (
                  <PaidField
                    id="paid-back"
                    value={paidBack}
                    estimate={flight?.driving ? driveLegs?.home?.ground_total ?? null : null}
                    label={t('plan.yourFareFor', { people: partyText })}
                    addLabel={t('plan.addYourFare')}
                    onChange={(n) => onTravelPaid('back', n)}
                    folded
                    hint={false}
                  />
                )}
              </li>
            </ol>
            <TransferModePicker
              flightTransfer={flightTransfer}
              anchorIn={anchorIn}
              anchorOut={anchorOut}
              setTransferMode={setTransferMode}
            />
            {(carRental || vignettes) && (
              <dl className="itin-extras">
                {carRental && (
                  <div><dt>{t('itin.rentalCar')}</dt><dd><Money value={carRental.eur_total} est precision="cents" /></dd></div>
                )}
                {vignettes && (
                  <div><dt>{t('itin.vignettes')}</dt><dd><Money value={vignettes.eur_total} est precision="cents" /></dd></div>
                )}
              </dl>
            )}
          </section>

          {/* Every day, one row: the day, where, and the way into the Day
              planner. A day with nothing planned says nothing more. */}
          <section className="itin-days-list" aria-labelledby="itin-days-h">
            <h2 className="itin-h" id="itin-days-h">{t('itin.yourDays')}</h2>
            <ol className="itin-day-rows">
              {dayPlan.map((d) => {
                const placed = extras.dayExtras?.[d.dayNum] || [];
                const planned = dayPlanned(d);
                return (
                  <li className={`itin-day-row ${planned ? 'is-planned' : ''}`} key={d.dayNum}>
                    <Button variant="quiet" className="itin-day-row-main" onClick={() => pickDay(d)}>
                      <span className="itin-day-row-num">{t('itin.dayN', { n: d.dayNum })}</span>
                      <span className="itin-day-row-meta">
                        <b>{d.stop.dest?.city}</b>
                        {d.date ? <small>{fmtLong(d.date)}</small> : null}
                      </span>
                    </Button>
                    {onPlanDay && (
                      <Button
                        size="sm"
                        variant={planned ? 'quiet' : 'secondary'}
                        className="itin-day-plan-btn"
                        onClick={() => onPlanDay(d)}
                        title={t(planned ? 'itin.changeDayTitle' : 'itin.shapeDayTitle', { n: d.dayNum })}
                      >
                        {planned ? t('itin.editPlan') : t('itin.plan')}
                      </Button>
                    )}
                    {placed.length > 0 && (
                      <div className="itin-day-extras">
                        {placed.map((a) => (
                          <span className="itin-day-extra" key={a.id}>
                            {a.name}
                            {a.eur != null && <small>{eur(a.eur)}</small>}
                            <button
                              type="button"
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
                  </li>
                );
              })}
            </ol>
          </section>

          {beforeSlot}

          {/* Take the trip with you: the PDF first, then the rest, all in
              view as one grid of equal buttons (T432). */}
          <section className="itin-export" aria-labelledby="itin-export-h">
            <h2 className="itin-h" id="itin-export-h">{t('export.exportAndShare')}</h2>
            <div className="itin-export-grid">
              <Button
                variant="secondary"
                iconStart={<DownloadIcon size={20} />}
                onClick={() => {
                  if (!paywall.require('export')) return;
                  if (onPdf) onPdf(exportPayload); else downloadTripPdf(exportPayload);
                }}
                title={t('export.downloadPdfTitle')}
              >
                {t('export.downloadPdf')}
              </Button>
              <Button
                variant="secondary"
                iconStart={<ShareIcon size={20} />}
                onClick={async () => {
                  const r = await shareTrip(exportPayload);
                  setShareState(r === 'copied' ? t('export.copied') : '');
                  if (r === 'copied') window.setTimeout(() => setShareState(''), 2500);
                }}
                title={t('export.shareTripTitle')}
              >
                {t('export.shareTrip')}
              </Button>
              {sharePayload && (
                <Button variant="secondary" iconStart={<LinkIcon size={20} />} onClick={handleCopyLink} title={t('export.copyLinkTitle')}>
                  {t('export.copyLink')}
                </Button>
              )}
              {gmapsParts.map((p, i) => (
                <a key={i} className="btn btn-secondary itin-export-link" href={p.url} target="_blank" rel="noreferrer" title={t('export.openRoute')}>
                  <span className="btn-icon" aria-hidden="true"><MapPinIcon size={20} /></span>
                  <span className="btn-label">
                    {gmapsParts.length === 1
                      ? t('export.openInGmaps')
                      : t('day.gmapsPart', { i: i + 1, from: p.from.city || '', to: p.to.city || '' })}
                  </span>
                </a>
              ))}
            </div>
            <Button variant="quiet" size="sm" className="itin-export-more" aria-expanded={moreExports}
              onClick={() => setMoreExports((v) => !v)}
              iconEnd={<ChevronDownIcon size={16} className={moreExports ? 'plan-chev is-open' : 'plan-chev'} />}>
              {t('plan.moreExports')}
            </Button>
            {moreExports && (
              <div className="itin-export-grid">
                <Button variant="secondary" iconStart={<RouteIcon size={20} />} onClick={handleKml} title={t('export.myMapsTitle')}>
                  {t('export.myMaps')}
                </Button>
                <Button variant="secondary" iconStart={<CalendarIcon size={20} />} onClick={handleIcs} title={t('export.calendarTitle')}>
                  {t('export.calendar')}
                </Button>
              </div>
            )}
            {shareState && <p className="itin-export-note" role="status">{shareState}</p>}
          </section>
        </div>
      ) : activeDay ? (
        <div className="itin-day">
          {/* The photograph carries nothing; the day's head sits in the
              paper band under it (T398, rule "Caption band"). */}
          {activeDay.stop.dest?.image?.url && (
            <img className="itin-day-hero" src={activeDay.stop.dest.image.url} alt="" loading="lazy" decoding="async" />
          )}
          <div className="itin-day-head itin-day-cap">
            <div className="itin-day-date">{fmtLong(activeDay.date)}</div>
            <div className="itin-day-city">
              {t('itin.stayingIn', { city: activeDay.stop.dest?.city })}
            </div>
          </div>
          {activeDay.activities.length === 0 ? (
            dayPlanned(activeDay) && <p className="itin-day-empty">{t('itin.dayPlannedNote')}</p>
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
            <Button variant="secondary" className="itin-day-planner-btn" onClick={() => onPlanDay(activeDay)}>
              {dayPlanned(activeDay) ? t('itin.editDayBtn') : t('itin.planDayBtn')}
            </Button>
          )}
        </div>
      ) : null}

      {openTool && (
        <SheetShell title={openTool.title} onClose={() => setToolOpen('')} className="itin-tool-sheet" labelId="itin-tool-sheet-title">
          {openTool.key === 'expenses' ? (
            <ExpenseLedger extras={extras} onChange={saveExtras} groupSize={groupSize} />
          ) : (
            <TripExtras
              only={openTool.key}
              rows={bookingRows}
              extras={extras}
              onChange={saveExtras}
              days={dayPlan.map((d) => ({ n: d.dayNum, city: d.stop.dest?.city || '', date: d.date }))}
              importContext={{
                stops: stopDetails.filter((s) => s.dest).map((s) => ({
                  city: s.dest.city, country: s.dest.country, arrive: s.arriveDate || '', nights: s.nights,
                })),
                groupSize,
              }}
            />
          )}
        </SheetShell>
      )}
    </div>
  );
}
