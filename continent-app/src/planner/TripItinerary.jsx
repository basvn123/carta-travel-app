import React, { useState } from 'react';
import { eur } from '../lib/format.js';
import { googleMapsDirUrl } from '../lib/routing.js';
import { SparkIcon, TrainIcon, BusIcon, CarIcon, BedIcon, ReceiptIcon } from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
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
  dayPlan, stopDetails, grandTotal, groupSize, flight,
  legs = [], stayCosts = [], carRental = null,
  activeStopIndex, onSelectStop, onPlanDay, isDayPlanned = null,
}) {
  // Whether a day already has Day-planner picks (drives "Plan" vs "Modify").
  const dayPlanned = (d) => Boolean(isDayPlanned && isDayPlanned(d.stopIndex, d.dayOfStay));
  const [tab, setTab] = useState('overview');
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const pickDay = (day) => {
    setTab(day.dayNum);
    onSelectStop?.(day.stopIndex);
  };

  const activeDay = typeof tab === 'number' ? dayPlan.find((d) => d.dayNum === tab) : null;

  // The whole trip as a Google Maps driving route (city to city, in order).
  const gmapsUrl = googleMapsDirUrl(
    stopDetails.filter((s) => s.dest?.lat != null).map((s) => ({ lat: s.dest.lat, lon: s.dest.lon })),
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
              <small>{fmtLong(stopDetails[0]?.arriveDate)}</small>
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

          {flight?.combinable && (
            <div className="itin-flight-row">
              <PlaneIcon size={12} />
              <span>Fly home <b>{flight.out_anchor} → {flight.origin}</b></span>
              <small>{fmtLong(stopDetails[stopDetails.length - 1]?.departDate)}</small>
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
                {flight?.combinable && (
                  <div className="trip-total-row">
                    <span className="lbl">
                      <PlaneIcon size={11} /> Flights
                      <small>{flight.into_anchor} in, {flight.out_anchor} out, via {flight.origin}</small>
                    </span>
                    <span className="val">{eur(flight.fare_total + flight.ground_total)}</span>
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
                        <small>{l.road_km} km, ~{l.hours}h, estimate</small>
                      </span>
                      <span className="val">{eur(l.ground_total)}</span>
                    </div>
                  );
                })}
                {carRental && (
                  <div className="trip-total-row">
                    <span className="lbl"><CarIcon size={11} /> Rental car <small>{carRental.days} days, whole group</small></span>
                    <span className="val">{eur(carRental.eur_total)}</span>
                  </div>
                )}
                {stopDetails.map((s, i) => stayCosts[i] && (
                  <div className="trip-total-row" key={`stay-${i}`}>
                    <span className="lbl">
                      <BedIcon size={11} /> {s.dest?.city}
                      <small>{s.nights} {s.nights === 1 ? 'night' : 'nights'}, stay + on the ground</small>
                    </span>
                    <span className="val">{eur(stayCosts[i].total)}</span>
                  </div>
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
                    <SparkIcon size={11} /> {dayPlanned(d) ? 'Modify' : 'Plan'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {gmapsUrl && (
            <a className="itin-gmaps" href={gmapsUrl} target="_blank" rel="noreferrer">
              Open the route in Google Maps ↗
            </a>
          )}
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
              <SparkIcon size={12} /> {dayPlanned(activeDay) ? 'Modify this day in the Day planner' : 'Plan this day in the Day planner'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
