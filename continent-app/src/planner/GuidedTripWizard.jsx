import React, { useMemo, useState } from 'react';
import { DateField } from '../components/DateField.jsx';
import { GemIcon } from '../components/GemRating.jsx';
import { CountryPickerMap } from '../map/CountryPickerMap.jsx';
import {
  countriesFromData, cityInsight, activitiesForInterests, cityImage, flagUrl, isoToFlag,
} from '../lib/tripGuide.js';
import { carAdvice } from '../lib/transport.js';
import { useCountryInsights } from '../hooks/useCountryInsights.js';

const STEPS = ['Where', 'Cities', 'Enjoy', 'Visit', 'Travel', 'Arrange'];
const CITIES_PER_COUNTRY = 10;

// "How do you want to get between your stops?" options (Travel step). The
// planner prices every leg for the chosen style and stays overridable per leg.
const TRANSPORT_CHOICES = [
  { key: 'auto', icon: '✨', label: 'Carta picks', sub: 'Best mode per leg - cheapest sensible option' },
  { key: 'public', icon: '🚆', label: 'Train & bus', sub: 'No driving; operator links per country' },
  { key: 'car', icon: '🚗', label: 'Car', sub: 'One rental, fuel + tolls split by the group' },
];

// "How full should your days feel?" (Travel step) - used to suggest how many
// highlights to actually schedule per day.
const PACE_CHOICES = [
  { key: 'relaxed', icon: '🌿', label: 'Relaxed', sub: '1-2 sights a day, long lunches' },
  { key: 'balanced', icon: '⚖️', label: 'Balanced', sub: '2-3 sights, room to wander' },
  { key: 'packed', icon: '⚡', label: 'See it all', sub: '4+ sights, early starts' },
];

// The "What do you enjoy?" tiles. Picking these tailors the highlights shown on
// the Visit step (see activitiesForInterests) so the trip fits the traveller.
const INTERESTS = [
  { key: 'museums', label: 'Museums', icon: '🏛️' },
  { key: 'outdoors', label: 'Outdoors', icon: '🌲' },
  { key: 'food', label: 'Food & Dining', icon: '🍽️' },
  { key: 'shopping', label: 'Shopping', icon: '🛍️' },
  { key: 'nightlife', label: 'Nightlife', icon: '🌙' },
  { key: 'culture', label: 'Local Culture', icon: '🎭' },
  { key: 'photo', label: 'Photo Spots', icon: '📸' },
  { key: 'cafes', label: 'Cafés', icon: '☕' },
  { key: 'architecture', label: 'Architecture', icon: '🏰' },
  { key: 'beaches', label: 'Beaches', icon: '🏖️' },
  { key: 'sports', label: 'Sports', icon: '⚽' },
  { key: 'wellness', label: 'Wellness', icon: '🧘' },
];

// Real flag artwork (falls back to the emoji/letters if the image can't load).
function Flag({ iso2, className }) {
  const url = flagUrl(iso2, 40);
  if (!url) return <span className={className}>{isoToFlag(iso2)}</span>;
  return (
    <img
      className={className}
      src={url}
      srcSet={`${flagUrl(iso2, 80)} 2x`}
      alt=""
      loading="lazy"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

// A city's Wikipedia photo as a rounded thumbnail, with a lettered fallback
// when there's no image (mirrors the suggestion/nearby cards elsewhere).
function CityThumb({ dest, className }) {
  const url = cityImage(dest);
  return (
    <div className={className} style={url ? { backgroundImage: `url(${url})` } : undefined}>
      {!url && <span className="guide-thumb-fallback">{dest?.city?.slice(0, 1) || '?'}</span>}
    </div>
  );
}

/**
 * "Let us guide you" - a six-step builder that assembles an itinerary:
 *   1. Where are we going?      pick one or more countries (map or flag list)
 *   2. Which cities to stay?    pick cities + nights, with a line of insight
 *   3. What do you enjoy?       interests that tailor each city's highlights
 *   4. What would you like to visit?  pick things to do in each city
 *   5. How do you want to travel?     car vs public transport (with a
 *      data-driven car recommendation) + how full the days should feel
 *   6. Arrange + start date     reorder the stops, choose when you leave
 *
 * On finish it hands the parent { startDate, groupSize, transport, pace,
 * label, stops:[{destinationId, nights, activities}] } - the parent loads it
 * into the planner (all of it still editable) and offers to let Carta
 * optimise the route.
 */
export function GuidedTripWizard({ data, onCancel, onComplete }) {
  const destinations = data?.destinations || {};
  const dateMin = data?.meta?.start_date;
  const dateMax = data?.meta?.end_date;
  const allCountries = useMemo(() => countriesFromData(destinations), [destinations]);
  const countryInsights = useCountryInsights();

  const [step, setStep] = useState(1);
  const [countries, setCountries] = useState(() => new Set());
  const [nights, setNights] = useState({});      // { [id]: nights }
  const [order, setOrder] = useState([]);        // ordered included city ids
  const [interests, setInterests] = useState(() => new Set()); // enjoyed themes
  const [acts, setActs] = useState({});          // { [id]: string[] }
  const [startDate, setStartDate] = useState('');
  const [groupSize, setGroupSize] = useState(2);
  const [transport, setTransport] = useState('auto'); // 'auto' | 'public' | 'car'
  const [pace, setPace] = useState('balanced');
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

  const toggleInterest = (key) => {
    setInterests((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
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
    || (step === 3 && interests.size > 0)
    || step >= 4
  );

  // Data-driven "should this trip have a car?" verdict for the Travel step,
  // from the chosen cities' own transit data + each country's driving intel.
  const advice = useMemo(
    () => carAdvice(includedIds.map((id) => destinations[id]).filter(Boolean), groupSize, countryInsights),
    [includedIds, destinations, groupSize, countryInsights],
  );
  const drivingNotes = useMemo(() => {
    const notes = [];
    for (const c of selectedCountries) {
      const d = countryInsights?.[c.country]?.driving;
      if (!d) continue;
      if (d.side === 'left') notes.push(`${c.country} drives on the LEFT.`);
      if (d.vignette) notes.push(`${c.country}: ${d.vignette}`);
    }
    return notes;
  }, [selectedCountries, countryInsights]);

  const finish = () => {
    onComplete({
      startDate,
      groupSize,
      transport,
      pace,
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
              <p className="guide-sub">Tap countries on the map, or pick from the list. You can mix and match.</p>
              <CountryPickerMap countries={allCountries} selected={countries} onToggle={toggleCountry} />
              <div className="guide-country-grid">
                {allCountries.map((c) => (
                  <button
                    key={c.country}
                    className={`guide-country ${countries.has(c.country) ? 'on' : ''}`}
                    onClick={() => toggleCountry(c.country)}
                  >
                    <Flag iso2={c.iso2} className="guide-flag-img" />
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
                  <div className="guide-block-head"><Flag iso2={c.iso2} className="guide-flag-img-sm" /> {c.country}</div>
                  <div className="guide-city-list">
                    {c.cities.slice(0, CITIES_PER_COUNTRY).map(({ id, dest }) => (
                      <div key={id} className={`guide-city ${(nights[id] || 0) > 0 ? 'on' : ''}`}>
                        <CityThumb dest={dest} className="guide-city-thumb" />
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
              <h2 className="guide-title">What do you enjoy?</h2>
              <p className="guide-sub">Select all that interest you (at least one). We'll tailor each city's highlights to match.</p>
              <div className="guide-interest-grid">
                {INTERESTS.map((it) => (
                  <button
                    key={it.key}
                    className={`guide-interest ${interests.has(it.key) ? 'on' : ''}`}
                    onClick={() => toggleInterest(it.key)}
                    aria-pressed={interests.has(it.key)}
                  >
                    {interests.has(it.key) && <span className="guide-interest-check">✓</span>}
                    <span className="guide-interest-icon">{it.icon}</span>
                    <span className="guide-interest-label">{it.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="guide-title">What would you like to visit?</h2>
              <p className="guide-sub">Tuned to what you enjoy. Tap the highlights you'd like to work in - Carta fits them into your days.</p>
              {includedIds.map((id) => {
                const dest = destinations[id];
                if (!dest) return null;
                const items = activitiesForInterests(dest, interests);
                const heroUrl = cityImage(dest);
                const picked = (acts[id] || []).length;
                return (
                  <div key={id} className="guide-visit-block">
                    <div
                      className="guide-visit-hero"
                      style={heroUrl ? { backgroundImage: `url(${heroUrl})` } : undefined}
                    >
                      {!heroUrl && <span className="guide-visit-hero-fallback">{dest.city.slice(0, 1)}</span>}
                      <span className="guide-visit-hero-name">{dest.city}</span>
                      {picked > 0 && <span className="guide-visit-hero-count">{picked} picked</span>}
                    </div>
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

          {step === 5 && (
            <>
              <h2 className="guide-title">How do you want to travel?</h2>
              <p className="guide-sub">Between your stops, and how full the days should feel. Every leg stays adjustable later.</p>

              {(advice.verdict !== 'no' || drivingNotes.length > 0) && (
                <div className={`guide-car-advice ${advice.verdict}`}>
                  <div className="guide-car-advice-head">
                    {advice.verdict === 'yes' ? '🚗 We’d rent a car for this trip' : advice.verdict === 'maybe' ? '🚗 A car could be worth it here' : '🚆 Public transport covers this trip well'}
                  </div>
                  {advice.reasons.map((r, i) => <p key={i}>{r}</p>)}
                  {drivingNotes.map((n, i) => <p key={`d${i}`} className="guide-car-note">⚠️ {n}</p>)}
                </div>
              )}

              <div className="guide-transport-grid">
                {TRANSPORT_CHOICES.map((t) => (
                  <button
                    key={t.key}
                    className={`guide-transport ${transport === t.key ? 'on' : ''}`}
                    onClick={() => setTransport(t.key)}
                    aria-pressed={transport === t.key}
                  >
                    <span className="guide-transport-icon">{t.icon}</span>
                    <span className="guide-transport-label">{t.label}{advice.verdict === 'yes' && t.key === 'car' ? ' ✦' : ''}</span>
                    <span className="guide-transport-sub">{t.sub}</span>
                  </button>
                ))}
              </div>

              <h3 className="guide-subtitle">Your pace</h3>
              <div className="guide-transport-grid">
                {PACE_CHOICES.map((p) => (
                  <button
                    key={p.key}
                    className={`guide-transport ${pace === p.key ? 'on' : ''}`}
                    onClick={() => setPace(p.key)}
                    aria-pressed={pace === p.key}
                  >
                    <span className="guide-transport-icon">{p.icon}</span>
                    <span className="guide-transport-label">{p.label}</span>
                    <span className="guide-transport-sub">{p.sub}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 6 && (
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
                      <CityThumb dest={dest} className="guide-arrange-thumb" />
                      <div className="guide-arrange-main">
                        <div className="guide-arrange-city">{dest?.city}, {dest?.country}</div>
                        <div className="guide-arrange-sub">
                          {nights[id]} {nights[id] === 1 ? 'night' : 'nights'}
                          {(acts[id] || []).length > 0 && `, ${(acts[id] || []).length} to visit`}
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
                  {includedIds.length} {includedIds.length === 1 ? 'stop' : 'stops'}, {totalNights} nights
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="guide-foot">
          <div className="guide-foot-summary">
            {includedIds.length > 0 && `${includedIds.length} ${includedIds.length === 1 ? 'city' : 'cities'}, ${totalNights} nights`}
          </div>
          <div className="guide-foot-actions">
            {step > 1 && <button className="guide-back" onClick={() => setStep(step - 1)}>Back</button>}
            {step < 6 ? (
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
