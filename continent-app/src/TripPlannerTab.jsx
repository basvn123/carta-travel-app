import React, { useEffect, useState } from 'react';
import { Dropdown } from './Dropdown.jsx';
import { DateField } from './DateField.jsx';
import { GemIcon } from './GemRating.jsx';
import { eur } from './format.js';
import { useTripPlanner } from './hooks/useTripPlanner.js';

const REASON_LABELS = {
  no_shared_origin: 'These two destinations don’t share a Ryanair origin airport (one only flies from Brussels, the other only from Charleroi, or similar) — there’s no single flight plan connecting them. Try flying home and out again, or pick a different first/last stop.',
  no_fare_for_date: 'No fare is stored for one of these exact dates yet. Try a nearby date.',
  missing_input: 'Add an arrival date for the first stop and a departure date for the last stop to price the flights.',
};

function StopSuggestions({ suggestions, onPick }) {
  if (!suggestions.length) return null;
  return (
    <>
      <div className="section-title" style={{ marginTop: 18 }}>Good next stops</div>
      <div className="nearby-grid">
        {suggestions.map((s) => (
          <button
            key={s.id}
            className="nearby-card"
            onClick={() => onPick(s)}
            title={`${s.city}, ${s.country} · ~${s.km} km away, from ${s.shared_origin}`}
          >
            <div className="nearby-thumb" style={s.image ? { backgroundImage: `url(${s.image})` } : undefined}>
              {!s.image && <span className="nearby-thumb-fallback">{s.city.slice(0, 1)}</span>}
            </div>
            <div className="nearby-meta">
              <span className="nearby-city">{s.city}</span>
              <span className="nearby-sub">
                {s.km} km
                {s.gems ? <> · <GemIcon size={9} /> {s.gems}</> : null}
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export function TripPlannerTab({ data, user, authConfigured, onRequestAuth }) {
  const tp = useTripPlanner(data);
  const destinations = data?.destinations || {};
  const dateMin = data?.meta?.start_date;
  const dateMax = data?.meta?.end_date;

  const [pendingDestId, setPendingDestId] = useState('');
  const [pendingArrive, setPendingArrive] = useState('');
  const [pendingDepart, setPendingDepart] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (user) tp.loadSavedPlans(user.id);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const destOptions = Object.entries(destinations)
    .map(([id, d]) => ({ value: id, label: `${d.city}, ${d.country}` }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const lastStop = tp.stopDetails[tp.stopDetails.length - 1];

  const pickSuggestion = (s) => {
    setPendingDestId(s.id);
    setPendingArrive(lastStop?.departDate || '');
    setPendingDepart('');
  };

  const canAddStop = pendingDestId && pendingArrive && pendingDepart && pendingDepart > pendingArrive;

  const handleAddStop = () => {
    if (!canAddStop) return;
    tp.addStop(pendingDestId, pendingArrive, pendingDepart);
    setPendingDestId('');
    setPendingArrive('');
    setPendingDepart('');
  };

  const handleSave = async () => {
    setSaveError('');
    if (!user) {
      onRequestAuth && onRequestAuth();
      return;
    }
    try {
      await tp.savePlan(user.id);
      tp.loadSavedPlans(user.id);
    } catch (e) {
      setSaveError(e?.message || 'Could not save this trip.');
    }
  };

  return (
    <div className="tab-panel trip-planner">
      <div className="trip-planner-inner">
        <div className="section-title">Trip planner</div>
        <p className="trip-planner-intro">
          Add stops in the order you’ll visit them. Flights use the real fares already
          in the map — flying into your first stop and out of your last — and the ground
          transport between stops is an estimate (no live train/bus pricing exists to pull from).
        </p>

        <div className="trip-planner-groupsize">
          <label className="filter-label">People</label>
          <input
            type="number" min={1} max={20}
            value={tp.groupSize}
            onChange={(e) => tp.setGroupSize(Math.min(20, Math.max(1, +e.target.value || 1)))}
          />
        </div>

        {tp.stopDetails.length > 0 && (
          <div className="trip-stop-list">
            {tp.stopDetails.map((s, i) => (
              <React.Fragment key={i}>
                <div className="trip-stop-card">
                  <div className="trip-stop-index">{i + 1}</div>
                  <div className="trip-stop-main">
                    <div className="trip-stop-city">{s.dest ? `${s.dest.city}, ${s.dest.country}` : 'Unknown destination'}</div>
                    <div className="trip-stop-dates">
                      {s.arriveDate || '?'} → {s.departDate || '?'}
                      {s.nights > 0 && <span> · {s.nights} {s.nights === 1 ? 'night' : 'nights'}</span>}
                    </div>
                  </div>
                  <button className="trip-stop-remove" onClick={() => tp.removeStop(i)} aria-label="Remove stop" title="Remove stop">
                    ×
                  </button>
                </div>
                {i < tp.legs.length && (
                  <div className="trip-leg">
                    {tp.legs[i] ? (
                      <span>
                        ⤷ ~{tp.legs[i].road_km} km overland, est. {eur(tp.legs[i].ground_eur_per_person)}/person, ~{tp.legs[i].hours}h
                        {tp.legs[i].long_haul && ' — long overland leg, consider flying instead'}
                      </span>
                    ) : (
                      <span>⤷ Ground transport estimate unavailable for this leg</span>
                    )}
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        <StopSuggestions suggestions={tp.nextStopSuggestions} onPick={pickSuggestion} />

        <div className="section-title" style={{ marginTop: 18 }}>
          {tp.stopDetails.length === 0 ? 'Where do you want to start?' : 'Add another stop'}
        </div>
        <div className="trip-add-stop">
          <div className="filter">
            <label className="filter-label">Destination</label>
            <Dropdown
              value={pendingDestId}
              onChange={setPendingDestId}
              options={destOptions}
              placeholder="Search a city or country..."
              searchPlaceholder="Search..."
            />
          </div>
          <div className="filter">
            <label className="filter-label">Arrive</label>
            <DateField value={pendingArrive} min={dateMin} max={dateMax} onChange={setPendingArrive} />
          </div>
          <div className="filter">
            <label className="filter-label">Depart</label>
            <DateField value={pendingDepart} min={pendingArrive || dateMin} max={dateMax} onChange={setPendingDepart} />
          </div>
          <button className="trip-add-stop-btn" onClick={handleAddStop} disabled={!canAddStop}>
            Add stop
          </button>
        </div>

        {tp.stopDetails.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 24 }}>Trip total</div>

            {tp.flight?.combinable ? (
              <div className="total-row">
                <span className="label">
                  Flights ({tp.flight.into_anchor} in · {tp.flight.out_anchor} out, via {tp.flight.origin})
                  <small>{eur(tp.flight.fare_per_person)}/person + transfers</small>
                </span>
                <span className="val">{eur(tp.flight.fare_total + tp.flight.ground_total)}</span>
              </div>
            ) : tp.flight ? (
              <p className="footnote" style={{ color: 'var(--accent)' }}>
                {REASON_LABELS[tp.flight.reason] || 'Flights for this trip could not be priced.'}
              </p>
            ) : null}

            {tp.legs.some(Boolean) && (
              <div className="total-row">
                <span className="label">
                  Ground transport between stops
                  <small>estimated, not a live fare</small>
                </span>
                <span className="val">
                  {eur(tp.legs.reduce((sum, l) => sum + (l ? l.ground_total : 0), 0))}
                </span>
              </div>
            )}

            {tp.stopDetails.map((s, i) => tp.stayCosts[i] && (
              <div className="total-row" key={i}>
                <span className="label">
                  {s.dest?.city} · accommodation + on the ground
                  <small>{s.nights} {s.nights === 1 ? 'night' : 'nights'}</small>
                </span>
                <span className="val">{eur(tp.stayCosts[i].total)}</span>
              </div>
            ))}

            <div className="total-row grand">
              <span className="label">Total<small>{tp.groupSize} {tp.groupSize === 1 ? 'person' : 'people'}</small></span>
              <span className="val">{eur(tp.grandTotal)}</span>
            </div>

            <div className="trip-save-row">
              <input
                type="text"
                className="trip-plan-label-input"
                placeholder="Name this trip (optional)"
                value={tp.planLabel}
                onChange={(e) => tp.setPlanLabel(e.target.value)}
              />
              <button className="account-signin-btn" onClick={handleSave} disabled={tp.saveState === 'saving'}>
                {tp.saveState === 'saving' ? 'Saving…' : tp.saveState === 'saved' ? 'Saved' : 'Save trip'}
              </button>
            </div>
            {saveError && <p className="footnote" style={{ color: 'var(--accent)' }}>{saveError}</p>}
            {!authConfigured && (
              <p className="footnote">Accounts aren’t configured for this deployment, so trips can’t be saved.</p>
            )}
          </>
        )}

        {authConfigured && user && tp.savedPlans.length > 0 && (
          <>
            <div className="section-title" style={{ marginTop: 28 }}>Your saved trips</div>
            <div className="saved-trip-list">
              {tp.savedPlans.map((p) => (
                <div className="saved-trip-item" key={p.id}>
                  <button className="saved-trip-main" onClick={() => tp.loadPlan(p.id)} title="Open this trip">
                    <span className="saved-trip-city">{p.label || 'Untitled trip'}</span>
                  </button>
                  <button className="saved-trip-delete" onClick={() => tp.removeSavedPlan(p.id)} aria-label="Remove trip" title="Remove">
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
