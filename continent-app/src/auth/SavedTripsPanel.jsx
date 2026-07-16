import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import { loadStandalonePlans, deleteStandalonePlan, loadAssignments } from '../planner/dayPlanStore.js';
import { MapPinIcon, RouteIcon, ListDayIcon, PencilIcon } from '../components/Icons.jsx';
import { CountryFlagStack } from '../components/CountryFlag.jsx';

// How many individual days of a trip plan have Day-planner picks on this
// device (assignments = { stopIdx: { dayIdx: [activityIdx...] } }).
function countPlannedDays(planId) {
  const a = loadAssignments(planId);
  return Object.values(a || {}).reduce(
    (n, days) => n + Object.values(days || {}).filter((l) => Array.isArray(l) && l.length).length,
    0,
  );
}

/** One labelled shelf of the overview: icon + name + count, an explainer of
 *  what lands here, then its cards. Three of these make the whole panel
 *  self-describing - no guessing which tab produced which entry. */
function SavedSection({ Icon, title, sub, count, children }) {
  return (
    <div className="panel-section saved-section">
      <div className="saved-section-head">
        <Icon size={14} />
        <span className="saved-section-title">{title}</span>
        {count != null && <span className="saved-section-count">{count}</span>}
      </div>
      {sub && <p className="saved-section-sub">{sub}</p>}
      {children}
    </div>
  );
}

/** One saved entry: visual tile (country flags / city photo / icon), title +
 *  meta, chevron, optional edit, delete. */
function SavedCard({ Icon, visual, title, meta, onOpen, openTitle, onEdit, editTitle, onDelete, deleteLabel }) {
  return (
    <div className="saved-card">
      <button className="saved-card-main" onClick={onOpen} title={openTitle}>
        <span className="saved-card-icon">{visual || <Icon size={15} />}</span>
        <span className="saved-card-text">
          <span className="saved-card-title">{title}</span>
          {meta && <span className="saved-card-meta">{meta}</span>}
        </span>
        <span className="saved-card-open" aria-hidden="true">›</span>
      </button>
      {onEdit && (
        <button
          className="saved-trip-edit"
          onClick={onEdit}
          aria-label={editTitle || 'Edit'}
          title={editTitle || 'Edit'}
        >
          <PencilIcon size={13} />
        </button>
      )}
      <button
        className="saved-trip-delete"
        onClick={onDelete}
        aria-label={deleteLabel}
        title="Remove"
      >
        ×
      </button>
    </div>
  );
}

// Standalone Saved trips panel, opened from the bottom nav (the same list also
// lives inside AccountPanel; this gives it a one-tap home of its own). Every
// kind of "saved" trip lands here - single destinations saved from the map,
// multi-stop trips built in the Trip planner, and device-local day plans -
// each in its own clearly-labelled section.
export function SavedTripsPanel({ data, onClose, onLoadTrip, onLoadTripPlan, onOpenAuth, onOpenDayPlan }) {
  const { user, configured } = useAuth();
  const destinations = data?.destinations || {};

  // A day plan's card shows the city it plans, not a generic agenda icon -
  // "Bruges" deserves a photo of Bruges. First stop's destination photo wins.
  const dayPlanVisual = (sp) => {
    const dest = destinations[sp.stops?.[0]?.destinationId];
    const url = dest?.image?.url;
    if (!url) return null;
    return <span className="saved-card-photo" style={{ backgroundImage: `url(${url})` }} aria-hidden="true" />;
  };

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
    <div className="panel open account-panel saved-trips-panel">
      <button className="panel-close" onClick={onClose} aria-label="Close">x</button>

      <div className="panel-header">
        <div className="panel-tag">Everything you kept</div>
        <h2 className="panel-city account-heading">Saved trips</h2>
      </div>

      {/* ── Destinations saved from the Map tab ── */}
      <SavedSection
        Icon={MapPinIcon}
        title="Destinations"
        sub="Single places saved from the map with their dates and prices."
        count={user ? trips.length : null}
      >
        {!user ? (
          configured ? (
            <>
              <div className="footnote">Sign in to save trips and find them back here on any device.</div>
              <button className="account-signin-btn account-signin-spaced" onClick={onOpenAuth}>Sign in</button>
            </>
          ) : (
            <div className="footnote">Accounts aren't set up for this deployment, so trips can't be saved yet.</div>
          )
        ) : loading ? (
          <div className="footnote">Loading…</div>
        ) : error ? (
          <div className="auth-error">{error}</div>
        ) : trips.length === 0 ? (
          <div className="saved-empty">
            Nothing here yet. Open a destination on the map and tap "Save trip".
          </div>
        ) : (
          <div className="saved-card-stack">
            {trips.map((t) => (
              <SavedCard
                key={t.id}
                Icon={MapPinIcon}
                title={t.city}
                meta={`${t.country || ''}${t.depart_date ? `, ${fmtDate(t.depart_date)} - ${fmtDate(t.return_date)}` : ''}`}
                onOpen={() => onLoadTrip(t)}
                openTitle="Open this destination on the map"
                onDelete={() => handleDelete(t.id)}
                deleteLabel={`Remove ${t.city}`}
              />
            ))}
          </div>
        )}
      </SavedSection>

      {/* ── Multi-stop routes built in the Trip planner ── */}
      {user && (
        <SavedSection
          Icon={RouteIcon}
          title="Trip plans"
          sub="Multi-stop routes built in the Trip planner, flights and stays priced."
          count={tripPlansLoading ? null : tripPlans.length}
        >
          {tripPlansLoading ? (
            <div className="footnote">Loading…</div>
          ) : tripPlans.length === 0 ? (
            <div className="saved-empty">
              No trip plans yet. Build one on the Trip planner tab and tap "Save trip".
            </div>
          ) : (
            <div className="saved-card-stack">
              {tripPlans.map((p) => {
                const plannedDays = countPlannedDays(p.id);
                return (
                  <div className="saved-card-stack" key={p.id}>
                    <SavedCard
                      Icon={RouteIcon}
                      visual={p.countries?.length ? <CountryFlagStack countries={p.countries} /> : null}
                      title={p.label || 'Untitled trip'}
                      meta={[
                        p.start_date ? `${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}` : '',
                        p.cities?.length ? `${p.cities.length} ${p.cities.length === 1 ? 'stop' : 'stops'}` : '',
                      ].filter(Boolean).join(', ')}
                      onOpen={() => onLoadTripPlan && onLoadTripPlan(p.id)}
                      openTitle="Open this trip in the Trip planner"
                      onEdit={() => onLoadTripPlan && onLoadTripPlan({ id: p.id, edit: true })}
                      editTitle="Edit this trip's stops and dates"
                      onDelete={() => handleDeleteTripPlan(p.id)}
                      deleteLabel={`Remove ${p.label || 'trip'}`}
                    />
                    {/* This trip's own day-by-day plans, made in the Day
                        planner (stored on this device, keyed by the trip). */}
                    <button
                      className="saved-card-footer"
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
          )}
        </SavedSection>
      )}

      {/* ── Day-by-day plans (device-local; they work without an account) ── */}
      <SavedSection
        Icon={ListDayIcon}
        title="Day plans"
        sub="Day-by-day sightseeing routes from the Day planner. Saved on this device."
        count={dayPlans.length}
      >
        {dayPlans.length === 0 ? (
          <div className="saved-empty">
            No day plans yet. Pick a city on the Day planner tab to start one.
          </div>
        ) : (
          <div className="saved-card-stack">
            {dayPlans.map((sp) => {
              const totalDays = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
              return (
                <SavedCard
                  key={sp.id}
                  Icon={ListDayIcon}
                  visual={dayPlanVisual(sp)}
                  title={sp.label || 'Day plan'}
                  meta={[
                    fmtDate(sp.startDate),
                    (sp.stops?.length || 1) > 1 ? `${sp.stops.length} cities` : '',
                    `${totalDays} ${totalDays === 1 ? 'day' : 'days'}`,
                  ].filter(Boolean).join(', ')}
                  onOpen={() => onOpenDayPlan && onOpenDayPlan(sp.id)}
                  openTitle="Open this day plan"
                  onDelete={() => setDayPlans(deleteStandalonePlan(sp.id))}
                  deleteLabel={`Remove ${sp.label || 'day plan'}`}
                />
              );
            })}
          </div>
        )}
      </SavedSection>
    </div>
  );
}
