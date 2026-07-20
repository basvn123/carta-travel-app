import React, { useState } from 'react';
import { eur, fmtHours, flightTimes } from '../lib/format.js';
import { flightReasonLabel, baggageLabel } from '../lib/trip_planner_pricing.js';
import { googleMapsDirUrl } from '../lib/routing.js';
import { shareTrip, downloadTripPdf } from '../lib/tripExport.js';
import { useI18n } from '../i18n/index.jsx';
import { SparkIcon, TrainIcon, BusIcon, CarIcon, BedIcon, ReceiptIcon, ShareIcon, DownloadIcon, LuggageIcon, MapPinIcon } from '../components/Icons.jsx';
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

const LEG_ICONS = { train: TrainIcon, bus: BusIcon, car: CarIcon };

/**
 * The planned itinerary: Overview + one tab per day.
 *
 * The Overview mirrors the Map tab's grouped receipt (flights / ground / stays,
 * then the grand total) so "Estimated total" is inspectable here too, and lists
 * every day with a jump into that day's tab. Each day keeps a light highlight
 * list (the pace cap) and hands fine-tuning to the Day planner via onPlanDay.
 */
export function TripItinerary({
  dayPlan, stopDetails, grandTotal, groupSize, flight, label = '',
  legs = [], anchorLegs = null, stayCosts = [], carRental = null,
  activeStopIndex, onSelectStop, onPlanDay, isDayPlanned = null,
}) {
  // Whether a day already has Day-planner picks (drives "Plan" vs "Modify").
  const dayPlanned = (d) => Boolean(isDayPlanned && isDayPlanned(d.stopIndex, d.dayOfStay));
  const { t } = useI18n();
  const [tab, setTab] = useState('overview');
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [shareState, setShareState] = useState('');

  // Everything the share text / printable PDF needs, in one bag.
  const exportPayload = {
    label, stopDetails, dayPlan, flight, legs, anchorLegs, stayCosts, carRental, grandTotal, groupSize,
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
  const gmapsUrl = googleMapsDirUrl(
    stopDetails.filter((s) => s.dest?.lat != null).map((s) => ({
      lat: s.dest.lat,
      lon: s.dest.lon,
      // "City, Country" makes Google label the stop instead of dropping a
      // nameless pin at the coordinates (which are the runway for
      // airport-tier destinations anyway).
      name: [s.dest.city, s.dest.country].filter(Boolean).join(', '),
    })),
    'driving',
  );

  const groundTotal = legs.reduce((sum, l) => sum + (l && l.ground_total ? l.ground_total : 0), 0);

  return (
    <div className="itin">
      <div className="itin-tabs">
        <button className={`itin-tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => { setTab('overview'); }}>
          Overview
        </button>
        {dayPlan.map((d) => (
          <button
            key={d.dayNum}
            className={`itin-tab ${tab === d.dayNum ? 'active' : ''} ${activeStopIndex === d.stopIndex && tab === d.dayNum ? 'in-city' : ''}`}
            onClick={() => pickDay(d)}
          >
            Day {d.dayNum}
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
              <span>Fly <b>{flight.origin} → {flight.into_anchor}</b></span>
              <small>{fmtFlightWhen(stopDetails[0]?.arriveDate, flight.into_time)}</small>
            </div>
          )}
          {anchorIn && (
            <div className="itin-flight-row">
              <AnchorInIcon size={12} />
              <span>Then <b>{anchorInCity} → {stopDetails[0]?.dest?.city}</b></span>
              <small>~{fmtHours(anchorIn.hours)} by {anchorIn.mode}</small>
            </div>
          )}
          {stopDetails.map((s, i) => (
            <button
              key={i}
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
                <span className="itin-stop-city">{s.dest?.city || 'Unknown'}, {s.dest?.country}</span>
                <span className="itin-stop-sub">
                  {fmtLong(s.arriveDate)} → {fmtLong(s.departDate)}, {s.nights} {s.nights === 1 ? 'night' : 'nights'}
                </span>
              </span>
            </button>
          ))}

          {anchorOut && (
            <div className="itin-flight-row">
              <AnchorOutIcon size={12} />
              <span>Then <b>{stopDetails[stopDetails.length - 1]?.dest?.city} → {anchorOutCity}</b></span>
              <small>~{fmtHours(anchorOut.hours)} by {anchorOut.mode}</small>
            </div>
          )}
          {flight?.combinable && (
            <div className="itin-flight-row">
              <PlaneIcon size={12} />
              <span>Fly home <b>{flight.out_anchor} → {flight.origin}</b></span>
              <small>{fmtFlightWhen(stopDetails[stopDetails.length - 1]?.departDate, flight.out_of_time)}</small>
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
                <ReceiptIcon size={12} /> Estimated total <small>{groupSize} {groupSize === 1 ? 'person' : 'people'}</small>
              </span>
              <strong>{eur(grandTotal)}</strong>
              <span className="itin-breakdown-caret" aria-hidden="true">{breakdownOpen ? '−' : '+'}</span>
            </button>

            {breakdownOpen && (
              <div className="itin-breakdown-body">
                {flight && !flight.combinable && (
                  <p className="trip-note">{flightReasonLabel(flight.reason)}</p>
                )}
                {flight?.combinable && (
                  <>
                    <div className="trip-total-row">
                      <span className="lbl">
                        <PlaneIcon size={11} /> Flight out
                        <small>{flight.origin} → {flight.into_anchor}{flightTimes(flight.into_time) ? `, departs ${flightTimes(flight.into_time).dep}` : ''}, {groupSize} {groupSize === 1 ? 'seat' : 'seats'}</small>
                      </span>
                      <span className="val">{eur(flight.into_fare_eur * groupSize)}</span>
                    </div>
                    <div className="trip-total-row">
                      <span className="lbl">
                        <PlaneIcon size={11} /> Flight home
                        <small>{flight.out_anchor} → {flight.origin}{flightTimes(flight.out_of_time) ? `, departs ${flightTimes(flight.out_of_time).dep}` : ''}, {groupSize} {groupSize === 1 ? 'seat' : 'seats'}</small>
                      </span>
                      <span className="val">{eur(flight.out_of_fare_eur * groupSize)}</span>
                    </div>
                    {flight.bag_total > 0 && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <LuggageIcon size={11} /> Baggage
                          <small>{baggageLabel(flight.baggage)}, out + home, {groupSize} {groupSize === 1 ? 'person' : 'people'}</small>
                        </span>
                        <span className="val">{eur(flight.bag_total)}</span>
                      </div>
                    )}
                    {flight.ground_total > 0 && (
                      <div className="trip-total-row">
                        <span className="lbl">
                          <PlaneIcon size={11} /> Airport transfers
                          <small>to and from the airports, whole group</small>
                        </span>
                        <span className="val">{eur(flight.ground_total)}</span>
                      </div>
                    )}
                  </>
                )}
                {anchorIn && (
                  <div className="trip-total-row">
                    <span className="lbl">
                      <AnchorInIcon size={11} /> {anchorInCity} → {stopDetails[0]?.dest?.city}
                      <small>{anchorIn.road_km} km, ~{fmtHours(anchorIn.hours)}, estimate</small>
                    </span>
                    <span className="val">{eur(anchorIn.ground_total)}</span>
                  </div>
                )}
                {anchorOut && (
                  <div className="trip-total-row">
                    <span className="lbl">
                      <AnchorOutIcon size={11} /> {stopDetails[stopDetails.length - 1]?.dest?.city} → {anchorOutCity}
                      <small>{anchorOut.road_km} km, ~{fmtHours(anchorOut.hours)}, estimate</small>
                    </span>
                    <span className="val">{eur(anchorOut.ground_total)}</span>
                  </div>
                )}
                {legs.map((l, i) => {
                  if (!l || !l.ground_total) return null;
                  const Icon = LEG_ICONS[l.mode] || TrainIcon;
                  const a = stopDetails[i]?.dest?.city;
                  const b = stopDetails[i + 1]?.dest?.city;
                  return (
                    <div className="trip-total-row" key={`leg-${i}`}>
                      <span className="lbl">
                        <Icon size={11} /> {a} → {b}
                        <small>{l.road_km} km, ~{fmtHours(l.hours)}, estimate</small>
                      </span>
                      <span className="val">{eur(l.ground_total)}</span>
                    </div>
                  );
                })}
                {carRental && (
                  <div className="trip-total-row">
                    <span className="lbl"><CarIcon size={11} /> Rental car <small>{carRental.days} days{carRental.cars > 1 ? `, ${carRental.cars} cars` : ''}, whole group</small></span>
                    <span className="val">{eur(carRental.eur_total)}</span>
                  </div>
                )}
                {stopDetails.map((s, i) => stayCosts[i] && (
                  <React.Fragment key={`stay-${i}`}>
                    <div className="trip-total-row">
                      <span className="lbl">
                        <BedIcon size={11} /> {s.dest?.city}
                        <small>{s.nights} {s.nights === 1 ? 'night' : 'nights'} accommodation</small>
                      </span>
                      <span className="val">{eur(stayCosts[i].accomTotal)}</span>
                    </div>
                    <div className="trip-total-row">
                      <span className="lbl">
                        <ReceiptIcon size={11} /> {s.dest?.city}
                        <small>on the ground: food, transport, fun</small>
                      </span>
                      <span className="val">{eur(stayCosts[i].groundTotal)}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>

          {/* Every day, one tap from its plan - and one more into the Day
              planner to properly shape it. */}
          <div className="itin-days-list">
            <div className="trip-block-title">Your days</div>
            {dayPlan.map((d) => (
              <div className="itin-day-row" key={d.dayNum}>
                <button className="itin-day-row-main" onClick={() => pickDay(d)}>
                  <span className="itin-day-row-num">Day {d.dayNum}</span>
                  <span className="itin-day-row-meta">
                    {d.stop.dest?.city}{d.date ? `, ${fmtLong(d.date)}` : ''}
                    {dayPlanned(d) && ', planned'}
                  </span>
                </button>
                {onPlanDay && (
                  <button
                    className="itin-day-plan-btn"
                    onClick={() => onPlanDay(d)}
                    title={`${dayPlanned(d) ? 'Change' : 'Shape'} day ${d.dayNum} in the Day planner`}
                  >
                    <SparkIcon size={11} /> {dayPlanned(d) ? 'Edit plan' : 'Plan'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Take the trip with you: share it, keep a PDF copy, or open the
              route straight in Google Maps. The Maps link is built from place
              names ("City, Country"), so Google shows the real listings rather
              than dropping nameless pins at the coordinates. */}
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
                Staying in {activeDay.stop.dest?.city}
                <span className="itin-day-of">Day {activeDay.dayOfStay} of {activeDay.staysOfCity}</span>
              </div>
            </div>
          </div>
          {activeDay.activities.length === 0 ? (
            <p className="itin-day-empty">
              {dayPlanned(activeDay)
                ? `This day is planned in the Day planner - open it below to see the route or change it.`
                : `A free day in ${activeDay.stop.dest?.city}: wander, eat well, no plans. Shape it in the Day planner any time.`}
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
              {activeDay.overflowCount} more {activeDay.overflowCount === 1 ? 'pick doesn’t' : 'picks don’t'} fit
              a day at this pace. Shape the day to choose what stays.
            </p>
          )}
          {onPlanDay && (
            <button className="itin-day-planner-btn" onClick={() => onPlanDay(activeDay)}>
              <SparkIcon size={12} /> {dayPlanned(activeDay) ? 'Edit this day\'s plan in the Day planner' : 'Plan this day in the Day planner'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
