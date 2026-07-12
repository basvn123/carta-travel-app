import React, { useState } from 'react';
import { eur } from './format.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

/**
 * The planned itinerary: Overview + one tab per day, mirroring the reference's
 * day-by-day breakdown. Since catalogued attractions have no coordinates we
 * show them as an ordered checklist per day (not map pins with walk times), but
 * the stays themselves are the numbered pins on the map above.
 */
export function TripItinerary({ dayPlan, stopDetails, grandTotal, groupSize, flight, activeStopIndex, onSelectStop }) {
  const [tab, setTab] = useState('overview');

  const pickDay = (day) => {
    setTab(day.dayNum);
    onSelectStop?.(day.stopIndex);
  };

  const activeDay = typeof tab === 'number' ? dayPlan.find((d) => d.dayNum === tab) : null;

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
          {stopDetails.map((s, i) => (
            <button
              key={i}
              className={`itin-stop ${activeStopIndex === i ? 'active' : ''}`}
              onClick={() => onSelectStop?.(i)}
            >
              <span className="itin-stop-idx">{i + 1}</span>
              <span className="itin-stop-main">
                <span className="itin-stop-city">{s.dest?.city || 'Unknown'}, {s.dest?.country}</span>
                <span className="itin-stop-sub">
                  {fmtLong(s.arriveDate)} – {fmtLong(s.departDate)}, {s.nights} {s.nights === 1 ? 'night' : 'nights'}
                  {(s.activities?.length || 0) > 0 && `, ${s.activities.length} to visit`}
                </span>
              </span>
            </button>
          ))}
          <div className="itin-overview-total">
            <span>Estimated total <small>{groupSize} {groupSize === 1 ? 'person' : 'people'}</small></span>
            <strong>{eur(grandTotal)}</strong>
          </div>
        </div>
      ) : activeDay ? (
        <div className="itin-day">
          <div className="itin-day-head">
            <div className="itin-day-date">{fmtLong(activeDay.date)}</div>
            <div className="itin-day-city">
              Staying in {activeDay.stop.dest?.city}
              <span className="itin-day-of">Day {activeDay.dayOfStay} of {activeDay.staysOfCity}</span>
            </div>
          </div>
          {activeDay.activities.length === 0 ? (
            <p className="itin-day-empty">A free day in {activeDay.stop.dest?.city}: wander, eat well, no plans. Add highlights any time by editing the trip.</p>
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
        </div>
      ) : null}
    </div>
  );
}
