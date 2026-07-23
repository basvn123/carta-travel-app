import React, { useMemo, useState } from 'react';
import { Dropdown } from '../components/Dropdown.jsx';
import { starterTripsFor } from '../lib/starterTrips.js';
import { eur } from '../lib/format.js';
import { SparkIcon, DiamondIcon } from '../components/Icons.jsx';

/**
 * Carta's ready-made trips: pick a country (optionally combine it with a
 * neighbour) and get four researched itineraries: Most beautiful, Best value
 * for money, Cheap but lovely, Hidden gems, each derived live from the
 * curated ratings and real stay anchors (see lib/starterTrips.js). Choosing
 * one loads it into the planner exactly like a wizard result, where every
 * stop, night and date stays editable.
 */
export function StarterTrips({ destinations, groupSize = 2, onPick }) {
  const [country, setCountry] = useState('');
  const [combo, setCombo] = useState('');

  const countryOptions = useMemo(() => {
    const names = [...new Set(Object.values(destinations || {}).map((d) => d?.country).filter(Boolean))].sort();
    return names.map((n) => ({ value: n, label: n }));
  }, [destinations]);

  const trips = useMemo(() => {
    if (!country) return [];
    const countries = combo && combo !== country ? [country, combo] : [country];
    return starterTripsFor(destinations, countries, { groupSize });
  }, [destinations, country, combo, groupSize]);

  return (
    <div className="trip-block starter-trips">
      <div className="trip-block-title"><DiamondIcon size={12} /> Ready-made trips</div>
      <p className="trip-note">
        Pick a country and Carta lays out its finest routes, built from the
        researched ratings. Choose one and make it yours: every stop and night
        stays editable.
      </p>
      <div className="starter-trips-pickers">
        <Dropdown
          value={country}
          onChange={setCountry}
          options={countryOptions}
          placeholder="Country"
          searchPlaceholder="Search countries"
        />
        <Dropdown
          value={combo}
          onChange={setCombo}
          options={[{ value: '', label: 'On its own' }, ...countryOptions.filter((o) => o.value !== country)]}
          placeholder="Combine with..."
          searchPlaceholder="Search countries"
          disabled={!country}
        />
      </div>
      {country && trips.length === 0 && (
        <p className="trip-note">Not enough catalogued places there yet for a ready-made route.</p>
      )}
      <div className="starter-trip-list">
        {trips.map((tp) => (
          <div key={tp.key} className="starter-trip">
            <div className="starter-trip-head">
              <b>{tp.title}</b>
              <span className={`score-chip rt-${tp.avgScore >= 7.6 ? 3 : tp.avgScore >= 6.5 ? 2 : 1} sm`} title={`Average destination rating ${tp.avgScore}/10`}>
                {tp.avgScore.toFixed(1)}
              </span>
            </div>
            <small className="starter-trip-desc">{tp.desc}</small>
            <div className="starter-trip-cities">
              {tp.cities.map((c) => (
                <span key={c.id} className="starter-trip-city">
                  {c.city} <b>{c.nights}n</b>
                </span>
              ))}
            </div>
            {tp.nightlyTotal != null && (
              <small className="starter-trip-price">~{eur(tp.nightlyTotal)} in stays for {groupSize} {groupSize === 1 ? 'person' : 'people'}, flights and travel on top</small>
            )}
            <button
              className="day-carta-btn starter-trip-use"
              onClick={() => onPick({
                startDate: '',
                stops: tp.stops,
                label: tp.label,
                groupSize,
                transport: 'public',
                pace: 'balanced',
              })}
            >
              <SparkIcon size={11} /> Start from this trip
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
