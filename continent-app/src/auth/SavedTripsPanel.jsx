import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import { loadStandalonePlans, deleteStandalonePlan, loadAssignments, subscribeDayPlanStore } from '../planner/dayPlanStore.js';
import { MapPinIcon, RouteIcon, ListDayIcon, PencilIcon } from '../components/Icons.jsx';
import { CountryFlagStack } from '../components/CountryFlag.jsx';
import { useI18n } from '../i18n/index.jsx';

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
 *  self-describing, no guessing which tab produced which entry. */
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
 *  meta, chevron, optional edit, delete.
 *
 *  Delete asks first. The × used to sit a few pixels from the chevron that
 *  opens the trip, so one mis-tap threw away work that took real effort to
 *  build; now it swaps the card for a confirm strip instead of deleting on
 *  the spot. The two tools also live in their own cluster, fenced off from
 *  the open affordance, so "open" and "destroy" no longer read as neighbours. */
function SavedCard({ Icon, visual, title, meta, onOpen, openTitle, onEdit, editTitle, onDelete, deleteLabel }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className="saved-card saved-card-confirm" role="alertdialog" aria-label={deleteLabel}>
        <span className="saved-card-confirm-text">{t('saved.confirmRemove', { name: title })}</span>
        <button className="saved-card-confirm-keep" onClick={() => setConfirming(false)}>
          {t('saved.keep')}
        </button>
        <button className="saved-card-confirm-go" onClick={onDelete}>
          {t('saved.remove')}
        </button>
      </div>
    );
  }

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
      <div className="saved-card-tools">
        {onEdit && (
          <button
            className="saved-trip-edit"
            onClick={onEdit}
            aria-label={editTitle || t('saved.edit')}
            title={editTitle || t('saved.edit')}
          >
            <PencilIcon size={13} />
          </button>
        )}
        <button
          className="saved-trip-delete"
          onClick={() => setConfirming(true)}
          aria-label={deleteLabel}
          title={t('saved.remove')}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// Standalone Saved trips panel, opened from the bottom nav (the same list also
// lives inside AccountPanel; this gives it a one-tap home of its own). Every
// kind of "saved" trip lands here, single destinations saved from the map,
// multi-stop trips built in the Trip planner, and device-local day plans, // each in its own clearly-labelled section.
export function SavedTripsPanel({ data, onClose, onLoadTrip, onLoadTripPlan, onOpenAuth, onOpenDayPlan }) {
  const { user, configured } = useAuth();
  const { t } = useI18n();
  const destinations = data?.destinations || {};

  // A day plan's card shows the city it plans, not a generic agenda icon,   // "Bruges" deserves a photo of Bruges. First stop's destination photo wins.
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
  // Day plans, shown alongside the account trips so everything saved lives
  // in one overview. Local-first; account sync can rewrite them underneath
  // this panel (a pull from another device), so refresh on those changes.
  const [dayPlans, setDayPlans] = useState(() => loadStandalonePlans());
  useEffect(() => subscribeDayPlanStore(({ remote }) => {
    if (remote) setDayPlans(loadStandalonePlans());
  }), []);

  const loadTrips = () => {
    setLoading(true);
    setError('');
    fetchSavedTrips(user.id)
      .then(setTrips)
      .catch((e) => setError(e.message || t('saved.errLoad')))
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
      <button className="panel-close" onClick={onClose} aria-label={t('saved.close')}>x</button>

      <div className="panel-header">
        <div className="panel-tag">{t('saved.tag')}</div>
        <h2 className="panel-city account-heading">{t('saved.title')}</h2>
      </div>

      {/* ── Destinations saved from the Map tab ── */}
      <SavedSection
        Icon={MapPinIcon}
        title={t('saved.destinations')}
        sub={t('saved.destinationsSub')}
        count={user ? trips.length : null}
      >
        {!user ? (
          configured ? (
            <>
              <div className="footnote">{t('saved.signInPrompt')}</div>
              <button className="account-signin-btn account-signin-spaced" onClick={onOpenAuth}>{t('saved.signIn')}</button>
            </>
          ) : (
            <div className="footnote">{t('saved.notConfigured')}</div>
          )
        ) : loading ? (
          <div className="footnote">{t('saved.loading')}</div>
        ) : error ? (
          <div className="auth-error">{error}</div>
        ) : trips.length === 0 ? (
          <div className="saved-empty">
            {t('saved.destinationsEmpty')}
          </div>
        ) : (
          <div className="saved-card-stack">
            {trips.map((trip) => (
              <SavedCard
                key={trip.id}
                Icon={MapPinIcon}
                title={trip.city}
                meta={`${trip.country || ''}${trip.depart_date ? `, ${fmtDate(trip.depart_date)} - ${fmtDate(trip.return_date)}` : ''}`}
                onOpen={() => onLoadTrip(trip)}
                openTitle={t('saved.openDestination')}
                onDelete={() => handleDelete(trip.id)}
                deleteLabel={t('saved.removeItem', { name: trip.city })}
              />
            ))}
          </div>
        )}
      </SavedSection>

      {/* ── Multi-stop routes built in the Trip planner ── */}
      {user && (
        <SavedSection
          Icon={RouteIcon}
          title={t('saved.tripPlans')}
          sub={t('saved.tripPlansSub')}
          count={tripPlansLoading ? null : tripPlans.length}
        >
          {tripPlansLoading ? (
            <div className="footnote">{t('saved.loading')}</div>
          ) : tripPlans.length === 0 ? (
            <div className="saved-empty">
              {t('saved.tripPlansEmpty')}
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
                      title={p.label || t('saved.untitledTrip')}
                      meta={[
                        p.start_date ? `${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}` : '',
                        p.cities?.length ? t(p.cities.length === 1 ? 'saved.stops1' : 'saved.stopsN', { n: p.cities.length }) : '',
                      ].filter(Boolean).join(', ')}
                      onOpen={() => onLoadTripPlan && onLoadTripPlan(p.id)}
                      openTitle={t('saved.openTripPlan')}
                      onEdit={() => onLoadTripPlan && onLoadTripPlan({ id: p.id, edit: true })}
                      editTitle={t('saved.editTripPlan')}
                      onDelete={() => handleDeleteTripPlan(p.id)}
                      deleteLabel={t('saved.removeItem', { name: p.label || t('saved.fallbackTrip') })}
                    />
                    {/* This trip's own day-by-day plans, made in the Day
                        planner (stored on this device, keyed by the trip). */}
                    <button
                      className="saved-card-footer"
                      onClick={() => onOpenDayPlan && onOpenDayPlan({ planId: p.id, stopIndex: 0, dayIndex: 0 })}
                      title={t('saved.planDaysTitle')}
                    >
                      {plannedDays > 0
                        ? t(plannedDays === 1 ? 'saved.plannedDays1' : 'saved.plannedDaysN', { n: plannedDays })
                        : t('saved.planItsDays')}
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
        title={t('saved.dayPlans')}
        sub={t('saved.dayPlansSub')}
        count={dayPlans.length}
      >
        {dayPlans.length === 0 ? (
          <div className="saved-empty">
            {t('saved.dayPlansEmpty')}
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
                  title={sp.label || t('saved.dayPlanFallbackTitle')}
                  meta={[
                    fmtDate(sp.startDate),
                    (sp.stops?.length || 1) > 1 ? t('saved.citiesN', { n: sp.stops.length }) : '',
                    t(totalDays === 1 ? 'saved.days1' : 'saved.daysN', { n: totalDays }),
                  ].filter(Boolean).join(', ')}
                  onOpen={() => onOpenDayPlan && onOpenDayPlan(sp.id)}
                  openTitle={t('saved.openDayPlan')}
                  onDelete={() => setDayPlans(deleteStandalonePlan(sp.id))}
                  deleteLabel={t('saved.removeItem', { name: sp.label || t('saved.fallbackDayPlan') })}
                />
              );
            })}
          </div>
        )}
      </SavedSection>
    </div>
  );
}
