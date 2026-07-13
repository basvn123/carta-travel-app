import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import { loadStandalonePlans, deleteStandalonePlan, loadAssignments } from '../planner/dayPlanStore.js';

// How many individual days of a trip plan have Day-planner picks on this
// device (assignments = { stopIdx: { dayIdx: [activityIdx...] } }).
function countPlannedDays(planId) {
  const a = loadAssignments(planId);
  return Object.values(a || {}).reduce(
    (n, days) => n + Object.values(days || {}).filter((l) => Array.isArray(l) && l.length).length,
    0,
  );
}

// Standalone Saved trips panel, opened from the bottom nav (the same list also
// lives inside AccountPanel; this gives it a one-tap home of its own). Every
// kind of "saved" trip lands here - single destinations saved from the map,
// multi-stop trips built in the Trip planner, and device-local day plans -
// rather than each flow keeping its own separate saved list.
export function SavedTripsPanel({ onClose, onLoadTrip, onLoadTripPlan, onOpenAuth, onOpenDayPlan }) {
  const { user, configured } = useAuth();

  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(!!user);
  const [error, setError] = useState('');
  const [tripPlans, setTripPlans] = useState([]);
  const [tripPlansLoading, setTripPlansLoading] = useState(!!user);
  // Device-local day plans, shown alongside the account trips so everything
  // saved lives in one overview.
  const [dayPlans, setDayPlans] = useState(() => loadStandalonePlans());

  const loadTrips = () => {
    setLoading(true);
    setError('');
    fetchSavedTrips(user.id)
      .then(setTrips)
      .catch((e) => setError(e.message || 'Could not load saved trips.'))
      .finally(() => setLoading(false));
  };

  const loadTripPlans = () => {
    setTripPlansLoading(true);
    fetchTripPlans(user.id)
      .then(setTripPlans)
      .catch(() => {})
      .finally(() => setTripPlansLoading(false));
  };

  useEffect(() => {
    if (!user) { setLoading(false); setTripPlansLoading(false); return; }
    loadTrips();
    loadTripPlans();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    try {
      await deleteTrip(id);
    } catch {
      loadTrips(); // roll back the optimistic removal on failure
    }
  };

  const handleDeleteTripPlan = async (id) => {
    setTripPlans((prev) => prev.filter((p) => p.id !== id));
    try {
      await deleteTripPlan(id);
    } catch {
      loadTripPlans(); // roll back the optimistic removal on failure
    }
  };

  const fmtDate = (s) => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

  return (
    <div className="panel open account-panel">
      <button className="panel-close" onClick={onClose} aria-label="Close">x</button>

      <div className="panel-header">
        <div className="panel-tag">Your shortlist</div>
        <h2 className="panel-city account-heading">Saved trips</h2>
      </div>

      {user ? (
        <div className="panel-section">
          {loading && <div className="footnote">Loading…</div>}
          {error && <div className="auth-error">{error}</div>}
          {!loading && !error && trips.length === 0 && (
            <div className="footnote">
              No saved trips yet. Open a destination and use "Save trip" to keep it here.
            </div>
          )}
          {!loading && trips.length > 0 && (
            <div className="saved-trip-list">
              {trips.map((t) => (
                <div className="saved-trip-item" key={t.id}>
                  <button
                    className="saved-trip-main"
                    onClick={() => onLoadTrip(t)}
                    title="Open this trip"
                  >
                    <span className="saved-trip-city">{t.city}</span>
                    <span className="saved-trip-meta">
                      {t.country}{t.depart_date && `, ${fmtDate(t.depart_date)} - ${fmtDate(t.return_date)}`}
                    </span>
                  </button>
                  <button
                    className="saved-trip-delete"
                    onClick={() => handleDelete(t.id)}
                    aria-label={`Remove ${t.city}`}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : configured ? (
        <div className="panel-section">
          <div className="footnote">Sign in to save trips and find them back here on any device.</div>
          <button className="account-signin-btn account-signin-spaced" onClick={onOpenAuth}>Sign in</button>
        </div>
      ) : (
        <div className="panel-section">
          <div className="footnote">Accounts aren't set up for this deployment, so trips can't be saved yet.</div>
        </div>
      )}

      {/* Multi-stop trips built in the Trip planner. Kept here instead of on the
          Trip planner tab itself, so every saved trip - single destination or
          multi-stop - lives in one place. */}
      {user && !tripPlansLoading && tripPlans.length > 0 && (
        <div className="panel-section">
          <div className="section-title">Your trip plans</div>
          <div className="saved-trip-list">
            {tripPlans.map((p) => {
              const plannedDays = countPlannedDays(p.id);
              return (
                <div className="saved-trip-group" key={p.id}>
                  <div className="saved-trip-item">
                    <button
                      className="saved-trip-main"
                      onClick={() => onLoadTripPlan && onLoadTripPlan(p.id)}
                      title="Open this trip"
                    >
                      <span className="saved-trip-city">{p.label || 'Untitled trip'}</span>
                      {p.updated_at && (
                        <span className="saved-trip-meta">Updated {fmtDate(p.updated_at.slice(0, 10))}</span>
                      )}
                    </button>
                    <button
                      className="saved-trip-delete"
                      onClick={() => handleDeleteTripPlan(p.id)}
                      aria-label={`Remove ${p.label || 'trip'}`}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                  {/* This trip's own day-by-day plans, made in the Day planner
                      (stored on this device, keyed by the trip). */}
                  <button
                    className="saved-trip-days"
                    onClick={() => onOpenDayPlan && onOpenDayPlan({ planId: p.id, stopIndex: 0, dayIndex: 0 })}
                    title="Plan this trip's days in the Day planner"
                  >
                    {plannedDays > 0
                      ? `${plannedDays} ${plannedDays === 1 ? 'day' : 'days'} planned, keep planning →`
                      : 'Plan its days in the Day planner →'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Day plans live on this device (they work without an account), but the
          overview of everything saved belongs here too. */}
      {dayPlans.length > 0 && (
        <div className="panel-section">
          <div className="section-title">Your day plans</div>
          <div className="saved-trip-list">
            {dayPlans.map((sp) => (
              <div className="saved-trip-item" key={sp.id}>
                <button
                  className="saved-trip-main"
                  onClick={() => onOpenDayPlan && onOpenDayPlan(sp.id)}
                  title="Open this day plan"
                >
                  <span className="saved-trip-city">{sp.label || 'Day plan'}</span>
                  <span className="saved-trip-meta">
                    {fmtDate(sp.startDate)}
                    {(sp.stops?.length || 1) > 1 && `, ${sp.stops.length} cities`}
                    {`, ${sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1} ${(sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1) === 1 ? 'day' : 'days'}`}
                  </span>
                </button>
                <button
                  className="saved-trip-delete"
                  onClick={() => setDayPlans(deleteStandalonePlan(sp.id))}
                  aria-label={`Remove ${sp.label || 'day plan'}`}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="footnote">Saved on this device. Open one to keep planning in the Day planner.</div>
        </div>
      )}
    </div>
  );
}
