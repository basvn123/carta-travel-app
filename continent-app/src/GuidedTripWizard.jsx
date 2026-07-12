import React, { useMemo, useState } from 'react';
import { DateField } from './DateField.jsx';
import { GemIcon } from './GemRating.jsx';
import { countriesFromData, cityInsight, cityActivities } from './tripGuide.js';

const STEPS = ['Where', 'Cities', 'Visit', 'Arrange'];
const CITIES_PER_COUNTRY = 10;

/**
 * "Let us guide you" — a four-step builder that assembles an itinerary:
 *   1. Where are we going?      pick one or more countries (with flags)
 *   2. Which cities to stay?    pick cities + nights, with a line of insight
 *   3. What would you like to visit?  pick things to do in each city
 *   4. Arrange + start date     reorder the stops, choose when you leave
 *
 * On finish it hands the parent { startDate, label, stops:[{destinationId,
 * nights, activities}] } — the parent loads it into the planner and offers to
 * let Carta optimise it.
 */
export function GuidedTripWizard({ data, onCancel, onComplete }) {
  const destinations = data?.destinations || {};
  const dateMin = data?.meta?.start_date;
  const dateMax = data?.meta?.end_date;
  const allCountries = useMemo(() => countriesFromData(destinations), [destinations]);

  const [step, setStep] = useState(1);
  const [countries, setCountries] = useState(() => new Set());
  const [nights, setNights] = useState({});      // { [id]: nights }
  const [order, setOrder] = useState([]);        // ordered included city ids
  const [acts, setActs] = useState({});          // { [id]: string[] }
  const [startDate, setStartDate] = useState('');
  const [groupSize, setGroupSize] = useState(2);
  const [dragId, setDragId] = useState(null);

  const selectedCountries = allCountries.filter((c) => countries.has(c.country));
  const includedIds = order.filter((id) => (nights[id] || 0) > 0);
  const totalNights = includedIds.reduce((sum, id) => sum + (nights[id] || 0), 0);

  const toggleCountry = (name) => {
    setCountries((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const setCityNights = (id, n) => {
    const v = Math.max(0, Math.min(21, n));
    setNights((prev) => ({ ...prev, [id]: v }));
    setOrder((prev) => {
      const has = prev.includes(id);
      if (v > 0 && !has) return [...prev, id];
      if (v === 0 && has) return prev.filter((x) => x !== id);
      return prev;
    });
  };

  const toggleActivity = (id, name) => {
    setActs((prev) => {
      const cur = prev[id] || [];
      return { ...prev, [id]: cur.includes(name) ? cur.filter((a) => a !== name) : [...cur, name] };
    });
  };

  const moveOrder = (id, dir) => {
    setOrder((prev) => {
      const arr = prev.filter((x) => (nights[x] || 0) > 0);
      const i = arr.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= arr.length) return prev;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return arr;
    });
  };

  const dropOn = (targetId) => {
    if (dragId == null || dragId === targetId) return;
    setOrder((prev) => {
      const arr = prev.filter((x) => (nights[x] || 0) > 0);
      const from = arr.indexOf(dragId);
      const to = arr.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      const [m] = arr.splice(from, 1);
      arr.splice(to, 0, m);
      return arr;
    });
    setDragId(null);
  };

  const canNext = (
    (step === 1 && countries.size > 0)
    || (step === 2 && includedIds.length > 0)
    || step === 3
    || step === 4
  );

  const finish = () => {
    onComplete({
      startDate,
      groupSize,
      label: selectedCountries.map((c) => c.country).slice(0, 2).join(' & '),
      stops: includedIds.map((id) => ({
        destinationId: id,
        nights: nights[id],
        activities: acts[id] || [],
      })),
    });
  };

  return (
    <div className="guide-overlay" onClick={onCancel}>
      <div className="guide-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header + progress */}
        <div className="guide-head">
          <button className="guide-close" onClick={onCancel} aria-label="Close">×</button>
          <div className="guide-steps">
            {STEPS.map((label, i) => (
              <div key={label} className={`guide-step-dot ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}>
                <span>{i + 1}</span>{label}
              </div>
            ))}
          </div>
        </div>

        <div className="guide-body">
          {step === 1 && (
            <>
              <h2 className="guide-title">Where are we going?</h2>
              <p className="guide-sub">Pick one or more countries. You can mix and match.</p>
              <div className="guide-country-grid">
                {allCountries.map((c) => (
                  <button
                    key={c.country}
                    className={`guide-country ${countries.has(c.country) ? 'on' : ''}`}
                    onClick={() => toggleCountry(c.country)}
                  >
                    <span className="guide-flag">{c.flag}</span>
                    <span className="guide-country-name">{c.country}</span>
                    <span className="guide-country-n">{c.cities.length} cities</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="guide-title">Which cities would you like to stay in?</h2>
              <p className="guide-sub">Set the nights for each city you want. Skip the rest.</p>
              {selectedCountries.map((c) => (
                <div key={c.country} className="guide-country-block">
                  <div className="guide-block-head"><span className="guide-flag">{c.flag}</span> {c.country}</div>
                  <div className="guide-city-list">
                    {c.cities.slice(0, CITIES_PER_COUNTRY).map(({ id, dest }) => (
                      <div key={id} className={`guide-city ${(nights[id] || 0) > 0 ? 'on' : ''}`}>
                        <div className="guide-city-info">
                          <div className="guide-city-name">
                            {dest.city}
                            {dest.beauty?.gems ? <span className="guide-city-gems"><GemIcon size={9} /> {dest.beauty.gems}</span> : null}
                          </div>
                          <div className="guide-city-insight">{cityInsight(dest)}</div>
                        </div>
                        <div className="guide-nights">
                          <button onClick={() => setCityNights(id, (nights[id] || 0) - 1)} disabled={(nights[id] || 0) <= 0} aria-label="Fewer nights">–</button>
                          <span className="guide-nights-val">
                            {(nights[id] || 0) === 0 ? <span className="guide-nights-zero">add</span> : <><b>{nights[id]}</b> {nights[id] === 1 ? 'night' : 'nights'}</>}
                          </span>
                          <button onClick={() => setCityNights(id, (nights[id] || 0) + 1)} aria-label="More nights">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="guide-title">What would you like to visit?</h2>
              <p className="guide-sub">Optional — tap the highlights you'd like to work in. Carta fits them into your days.</p>
              {includedIds.map((id) => {
                const dest = destinations[id];
                const items = cityActivities(dest);
                if (!dest) return null;
                return (
                  <div key={id} className="guide-country-block">
                    <div className="guide-block-head">{dest.city} <span className="guide-visit-count">{(acts[id] || []).length} picked</span></div>
                    {items.length === 0 ? (
                      <p className="guide-empty">No highlights catalogued for {dest.city} yet.</p>
                    ) : (
                      <div className="guide-chips">
                        {items.map((a) => (
                          <button
                            key={a.name}
                            className={`guide-chip ${(acts[id] || []).includes(a.name) ? 'on' : ''}`}
                            onClick={() => toggleActivity(id, a.name)}
                          >
                            <span className="guide-chip-name">{a.name}</span>
                            {a.kind && <span className="guide-chip-kind">{a.kind}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="guide-title">Arrange your trip</h2>
              <p className="guide-sub">Drag to reorder your stops, then pick when you'll set off.</p>
              <div className="guide-arrange">
                {includedIds.map((id, i) => {
                  const dest = destinations[id];
                  return (
                    <div
                      key={id}
                      className={`guide-arrange-item ${dragId === id ? 'dragging' : ''}`}
                      onDragOver={(e) => { if (dragId != null) e.preventDefault(); }}
                      onDrop={(e) => { e.preventDefault(); dropOn(id); }}
                    >
                      <div
                        className="guide-arrange-idx"
                        draggable
                        onDragStart={() => setDragId(id)}
                        onDragEnd={() => setDragId(null)}
                        title="Drag to reorder"
                      >{i + 1}</div>
                      <div className="guide-arrange-main">
                        <div className="guide-arrange-city">{dest?.city}, {dest?.country}</div>
                        <div className="guide-arrange-sub">
                          {nights[id]} {nights[id] === 1 ? 'night' : 'nights'}
                          {(acts[id] || []).length > 0 && ` · ${(acts[id] || []).length} to visit`}
                        </div>
                      </div>
                      <div className="guide-arrange-tools">
                        <button onClick={() => moveOrder(id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                        <button onClick={() => moveOrder(id, 1)} disabled={i === includedIds.length - 1} aria-label="Move down">↓</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="guide-start">
                <label className="trip-field">
                  <span className="trip-field-label">Starting when?</span>
                  <DateField value={startDate} min={dateMin} max={dateMax} onChange={setStartDate} placeholder="Departure date" />
                </label>
                <label className="trip-field">
                  <span className="trip-field-label">People</span>
                  <div className="guide-people">
                    <button type="button" onClick={() => setGroupSize(Math.max(1, groupSize - 1))} disabled={groupSize <= 1} aria-label="Fewer people">–</button>
                    <span>{groupSize}</span>
                    <button type="button" onClick={() => setGroupSize(Math.min(20, groupSize + 1))} disabled={groupSize >= 20} aria-label="More people">+</button>
                  </div>
                </label>
                <div className="guide-start-summary">
                  {includedIds.length} {includedIds.length === 1 ? 'stop' : 'stops'} · {totalNights} nights
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="guide-foot">
          <div className="guide-foot-summary">
            {includedIds.length > 0 && `${includedIds.length} ${includedIds.length === 1 ? 'city' : 'cities'} · ${totalNights} nights`}
          </div>
          <div className="guide-foot-actions">
            {step > 1 && <button className="guide-back" onClick={() => setStep(step - 1)}>Back</button>}
            {step < 4 ? (
              <button className="guide-next" onClick={() => setStep(step + 1)} disabled={!canNext}>Next</button>
            ) : (
              <button className="guide-next" onClick={finish} disabled={includedIds.length === 0}>Create trip</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
