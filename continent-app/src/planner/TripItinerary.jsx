import React, { useState, useEffect } from 'react';
import { eur, fmtHours, flightTimes } from '../lib/format.js';
import { TripExtras } from './TripExtras.jsx';
import { loadTripExtras, persistTripExtras, subscribeDayPlanStore } from './dayPlanStore.js';
import { flightReasonLabel, baggageLabel } from '../lib/trip_planner_pricing.js';
import { googleMapsDirUrl } from '../lib/routing.js';
import { cityCoords } from '../lib/runtime_pricing.js';
import { shareTrip, downloadTripPdf } from '../lib/tripExport.js';
import { tripKml, downloadKml } from '../lib/kmlExport.js';
import { tripIcs, downloadIcs } from '../lib/icsExport.js';
import { buildTripShareUrl } from '../lib/shareLink.js';
import { carrierName } from '../lib/carriers.js';
import { useI18n } from '../i18n/index.jsx';
import { SparkIcon, TrainIcon, BusIcon, CarIcon, BedIcon, ReceiptIcon, ShareIcon, DownloadIcon, LuggageIcon, MapPinIcon, RouteIcon, CalendarIcon, LinkIcon, ChevronDownIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

/** "Fri 18 Sep, 19:45-21:45", the date plus the priced flight's local dep/arr
 *  hours, when the times harvest covers this leg (just the date otherwise). */
function fmtFlightWhen(iso, time) {
  const ft = flightTimes(time);
  if (!ft) return fmtLong(iso);
  return `${fmtLong(iso)}, ${ft.dep}${ft.arr ? `-${ft.arr}` : ''}`;
}

const LEG_ICONS = { train: TrainIcon, bus: BusIcon, car: CarIcon, public: BusIcon, taxi: CarIcon, rental: CarIcon };

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
  const active = flightTransfer?.mode || anchorIn?.mode || anchorOut?.mode;
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
              <b>{eur(totals[m])}</b>
            </button>
          );
        })}
      </div>
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
const MODE_LABEL_KEY = { train: 'trip.modeTrain', bus: 'trip.modeBus', car: 'trip.modeCar' };

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
            {t('itin.legStats', { km: leg.road_km, hours: fmtHours(chosen?.hours ?? leg.hours) })}, {eur(leg.ground_total)}
          </small>
        </span>
        <span className="itin-leg-change">{open ? t('itin.legClose') : t('itin.legChange')}</span>
      </button>
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
                <span><MIcon size={12} /> {t(MODE_LABEL_KEY[m])}{leg.recommended === m && <SparkIcon size={9} />}</span>
                <b>{eur(o.eur_total)}</b>
                <small>~{fmtHours(o.hours)}</small>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One titled group of the chronological receipt (Getting there / each stop /
 *  Getting home / For the whole trip), its rows indented under a header that
 *  carries the group subtotal, so the receipt reads like the journey. */
function BreakdownSection({ Icon, title, sub, total, children }) {
  return (
    <section className="itin-bd-sec">
      <header className="itin-bd-sec-head">
        <span className="itin-bd-sec-title">
          <Icon size={11} /> {title}
          {sub && <small className="itin-bd-sec-sub">{sub}</small>}
        </span>
        {total > 0 && <span className="itin-bd-sec-total">{eur(total)}</span>}
      </header>
      <div className="itin-bd-sec-rows">{children}</div>
    </section>
  );
}

/** A home<->first/last-stop drive row for own-car trips: the journey starts at
 *  the traveller's door, and the route view should say so. */
function ItinDriveRow({ leg, labelKey, city, from }) {
  const { t } = useI18n();
  if (!leg) return null;
  return (
    <div className="itin-flight-row">
      <CarIcon size={12} />
      <span>{t(labelKey, { city })}{from ? <b> ({from})</b> : null}</span>
      <small>{t('trip.driveSub', { km: leg.road_km, hours: fmtHours(leg.hours) })}</small>
    </div>
  );
}

export function TripItinerary({
  dayPlan, stopDetails, grandTotal, groupSize, flight, label = '',
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
  // price can be judged against it at a glance.
  const bookingRows = [];
  if (flight?.combinable) {
    bookingRows.push({ key: 'flight-out', label: `${t('extras.flightOut')}: ${t('itin.fromTo', { a: flight.origin, b: flight.into_anchor })}`, estimate: (flight.into_fare_eur || 0) * groupSize });
    bookingRows.push({ key: 'flight-home', label: `${t('extras.flightHome')}: ${t('itin.fromTo', { a: flight.out_anchor, b: flight.origin })}`, estimate: (flight.out_of_fare_eur || 0) * groupSize });
  } else if (flight?.own) {
    bookingRows.push({ key: 'flight', label: flight.airline ? `${t('extras.ownFlight')}: ${flight.airline}` : t('extras.ownFlight'), estimate: flight.cost_total || null });
  }
  stopDetails.forEach((s, i) => {
    if (!s.dest) return;
    bookingRows.push({ key: `stay-${i}`, label: t('extras.stayIn', { city: s.dest.city }), estimate: stayCosts[i]?.accomTotal ?? null });
  });
  if (carRental) bookingRows.push({ key: 'car', label: t('extras.car'), estimate: carRental.eur_total ?? null });

  // Everything the share text / printable PDF needs, in one bag.
  const exportPayload = {
    label, stopDetails, dayPlan, flight, legs, anchorLegs, stayCosts, carRental, vignettes,
    tripHasCar, driveLegs, grandTotal, groupSize,
    extras, bookingRows,
  };

  // A note under the export row (copy feedback, My Maps import steps, ...).
  const exportNote = (msg, ms = 2500) => {
    setShareState(msg);
    if (msg) window.setTimeout(() => setShareState(''), ms);
  };

  const handleKml = () => {
    downloadKml(label || 'carta-trip', tripKml({ label, stopDetails, dayPlan, fmtDate: fmtLong }));
    exportNote(t('export.myMapsHint'), 15000);
  };

  const handleIcs = () => {
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
  const AnchorInIcon = anchorIn ? (LEG_ICONS[anchorIn.mode] || TrainIcon) : null;
  const AnchorOutIcon = anchorOut ? (LEG_ICONS[anchorOut.mode] || TrainIcon) : null;

  const pickDay = (day) => {
    setTab(day.dayNum);
    onSelectStop?.(day.stopIndex);
  };

  const activeDay = typeof tab === 'number' ? dayPlan.find((d) => d.dayNum === tab) : null;

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
  // belong to the whole journey (bags, airport transfers, rental, vignettes).
  const transferTotal = flight?.combinable
    ? (flightTransfer ? flightTransfer.ground_total : (flight.ground_total || 0)) : 0;
  const getThereTotal = (flight?.combinable ? (flight.into_fare_eur || 0) * groupSize : 0)
    + (flight?.own ? (flight.cost_total || 0) : 0)
    + (driveLegs?.out?.ground_total || 0)
    + (anchorIn?.ground_total || 0);
  const getHomeTotal = (flight?.combinable ? (flight.out_of_fare_eur || 0) * groupSize : 0)
    + (driveLegs?.home?.ground_total || 0)
    + (anchorOut?.ground_total || 0);
  const wholeTripTotal = (flight?.combinable ? (flight.bag_total || 0) + transferTotal : 0)
    + (carRental?.eur_total || 0) + (vignettes?.eur_total || 0);

  return (
    <div className="itin">
      <div className="itin-tabs">
        <button className={`itin-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => { setTab('overview'); }}>
          {t('itin.overview')}
        </button>
        {dayPlan.map((d) => (
          <button
            key={d.dayNum}
            className={`itin-tab ${tab === d.dayNum ? 'active' : ''} ${activeStopIndex === d.stopIndex && tab === d.dayNum ? 'in-city' : ''}`}
            onClick={() => pickDay(d)}
          >
            {t('itin.dayN', { n: d.dayNum })}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="itin-overview">
          {/* The journey starts with a flight - show it as part of the route,
              not only as a cost line in the breakdown. */}
          {flight?.combinable && (
            <div className="itin-flight-row">
              <PlaneIcon size={12} />
              <span>{t('itin.fly')} <b>{flight.origin} → {flight.into_anchor}</b></span>
              <small>{fmtFlightWhen(stopDetails[0]?.arriveDate, flight.into_time)}</small>
            </div>
          )}
          {flight?.own && (
            <div className="itin-flight-row">
              <PlaneIcon size={12} />
              <span>{flight.airline ? <>{t('itin.flyInWith')} <b>{flight.airline}</b></> : <b>{t('itin.ownFlightIn')}</b>}</span>
              <small>{fmtLong(flight.out_date || stopDetails[0]?.arriveDate)}</small>
            </div>
          )}
          {anchorIn && (
            <div className="itin-flight-row">
              <AnchorInIcon size={12} />
              <span>{t('itin.then')} <b>{anchorInCity} → {stopDetails[0]?.dest?.city}</b></span>
              <small>~{fmtHours(anchorIn.hours)} {t(anchorIn.mode === 'car' ? 'itin.byCar' : anchorIn.mode === 'bus' ? 'itin.byBus' : 'itin.byTrain')}</small>
            </div>
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
            <div className="itin-flight-row">
              <AnchorOutIcon size={12} />
              <span>{t('itin.then')} <b>{stopDetails[stopDetails.length - 1]?.dest?.city} → {anchorOutCity}</b></span>
              <small>~{fmtHours(anchorOut.hours)} {t(anchorOut.mode === 'car' ? 'itin.byCar' : anchorOut.mode === 'bus' ? 'itin.byBus' : 'itin.byTrain')}</small>
            </div>
          )}
          {flight?.combinable && (
            <div className="itin-flight-row">
              <PlaneIcon size={12} />
              <span>{t('itin.flyHome')} <b>{flight.out_anchor} → {flight.origin}</b></span>
              <small>{fmtFlightWhen(stopDetails[stopDetails.length - 1]?.departDate, flight.out_of_time)}</small>
            </div>
          )}
          {flight?.own && (
            <div className="itin-flight-row">
              <PlaneIcon size={12} />
              <span>{flight.airline ? <>{t('itin.flyHomeWith')} <b>{flight.airline}</b></> : <b>{t('itin.ownFlightHome')}</b>}</span>
              <small>{fmtLong(flight.ret_date || stopDetails[stopDetails.length - 1]?.departDate)}</small>
            </div>
          )}

          {/* Estimated total, expandable into the same grouped receipt the Map
              tab shows: flights, ground legs, rental, stay per city. */}
          <div className={`itin-breakdown ${breakdownOpen ? 'open' : ''}`}>
            <button
              className="itin-overview-total itin-breakdown-toggle"
              onClick={() => setBreakdownOpen((v) => !v)}
              aria-expanded={breakdownOpen}
            >
              <span>
                <ReceiptIcon size={12} /> {t('itin.estimatedTotal')} <small>{groupSize} {groupSize === 1 ? t('itin.personOne') : t('itin.personMany')}</small>
              </span>
              <strong>{eur(grandTotal)}</strong>
              <span className={`itin-breakdown-caret ${breakdownOpen ? 'open' : ''}`} aria-hidden="true"><ChevronDownIcon size={14} /></span>
            </button>

            {breakdownOpen && (
              <div className="itin-breakdown-body">
                {flight && !flight.combinable && !flight.own && !flight.driving && !tripHasCar && (
                  <p className="trip-note">{flightReasonLabel(flight.reason)}</p>
                )}

                {/* 1. Getting there, in journey order. */}
                {getThereTotal > 0 && (
                  <BreakdownSection Icon={PlaneIcon} title={t('itin.secGetThere')} total={getThereTotal}>
                    {flight?.combinable && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('itin.flightOut')}
                          <small>{carrierName(flight.into_carrier)}, {flight.origin} → {flight.into_anchor}{flightTimes(flight.into_time) ? `, ${t('itin.departs', { time: flightTimes(flight.into_time).dep })}` : ''}, {groupSize} {groupSize === 1 ? t('itin.seatOne') : t('itin.seatMany')}</small>
                        </span>
                        <span className="val">{eur(flight.into_fare_eur * groupSize)}</span>
                      </div>
                    )}
                    {flight?.own && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('itin.flight')}{flight.airline ? ` (${flight.airline})` : ''}
                          <small>
                            {flight.out_date ? `${fmtLong(flight.out_date)}${flight.ret_date ? ` → ${fmtLong(flight.ret_date)}` : ''}, ` : ''}
                            {flight.cost_total ? t('itin.bookedOtherGroup') : t('itin.bookedOtherNoFare')}
                          </small>
                        </span>
                        <span className="val">{flight.cost_total ? eur(flight.cost_total) : '…'}</span>
                      </div>
                    )}
                    {flight?.driving && driveLegs?.out && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <CarIcon size={11} /> {t('trip.driveOut', { city: stopDetails[0]?.dest?.city || '' })}
                          <small>{driveLegs.from ? `${driveLegs.from}, ` : ''}{t('trip.driveSub', { km: driveLegs.out.road_km, hours: fmtHours(driveLegs.out.hours) })}</small>
                        </span>
                        <span className="val">{eur(driveLegs.out.ground_total)}</span>
                      </div>
                    )}
                    {anchorIn && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <AnchorInIcon size={11} /> {anchorInCity} → {stopDetails[0]?.dest?.city}
                          <small>{t('itin.legStats', { km: anchorIn.road_km, hours: fmtHours(anchorIn.hours) })}</small>
                        </span>
                        <span className="val">{eur(anchorIn.ground_total)}</span>
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
                        Icon={BedIcon}
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
                            <span className="val">{eur(sc.accomTotal)}</span>
                          </div>
                        )}
                        {sc && sc.groundTotal > 0 && (
                          <div className="trip-total-row">
                            <span className="lbl">
                              <ReceiptIcon size={11} /> {t('itin.secDaily')}
                              <small>{t('itin.onGroundSub')}</small>
                            </span>
                            <span className="val">{eur(sc.groundTotal)}</span>
                          </div>
                        )}
                      </BreakdownSection>
                      {l && l.ground_total > 0 && LegIcon && (
                        <div className="itin-bd-leg">
                          <span className="lbl">
                            <LegIcon size={11} /> {s.dest?.city} → {stopDetails[i + 1]?.dest?.city}
                            <small>{t(MODE_LABEL_KEY[l.mode])}, {t('itin.legStats', { km: l.road_km, hours: fmtHours(l.hours) })}</small>
                          </span>
                          <span className="val">{eur(l.ground_total)}</span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* 3. Getting home. */}
                {getHomeTotal > 0 && (
                  <BreakdownSection Icon={PlaneIcon} title={t('itin.secGetHome')} total={getHomeTotal}>
                    {anchorOut && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <AnchorOutIcon size={11} /> {stopDetails[stopDetails.length - 1]?.dest?.city} → {anchorOutCity}
                          <small>{t('itin.legStats', { km: anchorOut.road_km, hours: fmtHours(anchorOut.hours) })}</small>
                        </span>
                        <span className="val">{eur(anchorOut.ground_total)}</span>
                      </div>
                    )}
                    {flight?.driving && driveLegs?.home && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <CarIcon size={11} /> {t('trip.driveHome', { city: stopDetails[stopDetails.length - 1]?.dest?.city || '' })}
                          <small>{t('trip.driveSub', { km: driveLegs.home.road_km, hours: fmtHours(driveLegs.home.hours) })}</small>
                        </span>
                        <span className="val">{eur(driveLegs.home.ground_total)}</span>
                      </div>
                    )}
                    {flight?.combinable && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('itin.flightHome')}
                          <small>{carrierName(flight.out_of_carrier)}, {flight.out_anchor} → {flight.origin}{flightTimes(flight.out_of_time) ? `, ${t('itin.departs', { time: flightTimes(flight.out_of_time).dep })}` : ''}, {groupSize} {groupSize === 1 ? t('itin.seatOne') : t('itin.seatMany')}</small>
                        </span>
                        <span className="val">{eur(flight.out_of_fare_eur * groupSize)}</span>
                      </div>
                    )}
                  </BreakdownSection>
                )}

                {/* 4. Round-trip items that belong to the whole journey. */}
                {(wholeTripTotal > 0 || flight?.driving) && (
                  <BreakdownSection Icon={ReceiptIcon} title={t('itin.secWholeTrip')} total={wholeTripTotal}>
                    {flight?.combinable && flight.bag_total > 0 && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <LuggageIcon size={11} /> {t('itin.baggage')}
                          <small>{baggageLabel(flight.baggage)}, {t('itin.outPlusHome')}, {groupSize} {groupSize === 1 ? t('itin.personOne') : t('itin.personMany')}</small>
                        </span>
                        <span className="val">{eur(flight.bag_total)}</span>
                      </div>
                    )}
                    {flight?.combinable && flight.ground_total > 0 && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> {t('itin.airportTransfers')}
                          <small>{t('itin.transfersSub')}</small>
                        </span>
                        <span className="val">{eur(flightTransfer ? flightTransfer.ground_total : flight.ground_total)}</span>
                      </div>
                    )}
                    {carRental && (
                      <div className="trip-total-row">
                        <span className="lbl"><CarIcon size={11} /> {t('itin.rentalCar')} <small>{carRental.cars > 1 ? t('itin.rentalSubCars', { days: carRental.days, cars: carRental.cars }) : t('itin.rentalSub', { days: carRental.days })}</small></span>
                        <span className="val">{eur(carRental.eur_total)}</span>
                      </div>
                    )}
                    {vignettes && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <CarIcon size={11} /> {t('itin.vignettes')}
                          <small>{t('itin.vignettesSub', { countries: vignettes.items.map((v) => v.iso2).join(', ') })}</small>
                        </span>
                        <span className="val">{eur(vignettes.eur_total)}</span>
                      </div>
                    )}
                    {flight?.driving && (
                      <p className="trip-note itin-owncar-note">{t('trip.ownCarNote')}</p>
                    )}
                    <TransferModePicker
                      flightTransfer={flightTransfer}
                      anchorIn={anchorIn}
                      anchorOut={anchorOut}
                      setTransferMode={setTransferMode}
                    />
                  </BreakdownSection>
                )}

                <div className="itin-bd-grand">
                  <span className="itin-bd-grand-lbl">{t('itin.estimatedTotal')}</span>
                  <span className="itin-bd-grand-val">{eur(grandTotal)}</span>
                </div>
                {groupSize > 1 && (
                  <div className="itin-bd-pp">{t('itin.perPersonLine', { price: eur(grandTotal / groupSize) })}</div>
                )}
                <p className="itin-bd-note">{t('itin.estimateNote')}</p>
              </div>
            )}
          </div>

          {/* Every day, one tap from its plan - and one more into the Day
              planner to properly shape it. */}
          <div className="itin-days-list">
            <div className="trip-block-title">{t('itin.yourDays')}</div>
            {dayPlan.map((d) => (
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
              </div>
            ))}
          </div>

          {/* Bookings, notes and the packing list: the trip's life admin,
              saved with the plan (and synced to the account when signed in). */}
          <TripExtras rows={bookingRows} extras={extras} onChange={saveExtras} />

          {/* Take the trip with you: share it, keep a PDF copy, or open the
              route straight in Google Maps. The Maps link is built from city
              coordinates, names failed to geocode for many smaller places. */}
          <div className="itin-export-row">
            <button
              className="itin-export-btn"
              onClick={async () => {
                const r = await shareTrip(exportPayload);
                setShareState(r === 'copied' ? t('export.copied') : '');
                if (r === 'copied') window.setTimeout(() => setShareState(''), 2500);
              }}
              title={t('export.shareTripTitle')}
            >
              <ShareIcon size={12} /> {t('export.shareTrip')}
            </button>
            <button
              className="itin-export-btn"
              onClick={() => downloadTripPdf(exportPayload)}
              title={t('export.downloadPdfTitle')}
            >
              <DownloadIcon size={12} /> {t('export.downloadPdf')}
            </button>
            {gmapsUrl && (
              <a
                className="itin-export-btn"
                href={gmapsUrl}
                target="_blank"
                rel="noreferrer"
                title={t('export.openRoute')}
              >
                <MapPinIcon size={12} /> {t('export.openInGmaps')}
              </a>
            )}
            <button
              className="itin-export-btn"
              onClick={handleKml}
              title={t('export.myMapsTitle')}
            >
              <RouteIcon size={12} /> {t('export.myMaps')}
            </button>
            <button
              className="itin-export-btn"
              onClick={handleIcs}
              title={t('export.calendarTitle')}
            >
              <CalendarIcon size={12} /> {t('export.calendar')}
            </button>
            {sharePayload && (
              <button
                className="itin-export-btn"
                onClick={handleCopyLink}
                title={t('export.copyLinkTitle')}
              >
                <LinkIcon size={12} /> {t('export.copyLink')}
              </button>
            )}
          </div>
          {shareState && <p className="itin-export-note">{shareState}</p>}
        </div>
      ) : activeDay ? (
        <div className="itin-day">
          <div
            className="itin-day-hero"
            style={activeDay.stop.dest?.image?.url ? { backgroundImage: `url(${activeDay.stop.dest.image.url})` } : undefined}
          >
            <div className="itin-day-hero-grad" />
            <div className="itin-day-head">
              <div className="itin-day-date">{fmtLong(activeDay.date)}</div>
              <div className="itin-day-city">
                {t('itin.stayingIn', { city: activeDay.stop.dest?.city })}
                <span className="itin-day-of">{t('itin.dayOf', { a: activeDay.dayOfStay, b: activeDay.staysOfCity })}</span>
              </div>
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
