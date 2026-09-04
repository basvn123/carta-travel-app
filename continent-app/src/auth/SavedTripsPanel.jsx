import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import { loadStandalonePlans, deleteStandalonePlan, loadAssignments, subscribeDayPlanStore } from '../planner/dayPlanStore.js';
import { MapPinIcon, RouteIcon, ListDayIcon, PencilIcon, MoreIcon, TrashIcon } from '../components/Icons.jsx';
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

/** One labelled shelf of the overview: title + count, an explainer of what
 *  lands here, then its cards. Three of these make the whole panel
 *  self-describing, no guessing which tab produced which entry.
 *
 *  The heading used to be tracked-out uppercase mono, which fought the serif
 *  page title above it; it now sits in the UI face at sentence case, and the
 *  count is a tinted pill rather than a grey chip that read as unstyled. */
function SavedSection({ title, sub, count, children }) {
  return (
    <div className="panel-section saved-section">
      <div className="saved-section-head">
        <span className="saved-section-title">{title}</span>
        {count != null && (
          <span className={`saved-section-count${count > 0 ? ' on' : ''}`}>{count}</span>
        )}
      </div>
      {sub && <p className="saved-section-sub">{sub}</p>}
      {children}
    </div>
  );
}

/** An empty shelf, as an invitation rather than a dashed drop zone: soft
 *  filled panel, one line of guidance, one button that goes and does it.
 *  The signed-out and unconfigured states borrow the same panel, so the three
 *  shelves never disagree about what "nothing here" looks like. */
function SavedEmpty({ Icon, text, cta, onCta }) {
  return (
    <div className="saved-empty">
      <span className="saved-empty-mark"><Icon size={16} /></span>
      <p className="saved-empty-text">{text}</p>
      {cta && onCta && (
        <button className="saved-empty-cta" onClick={onCta}>{cta}</button>
      )}
    </div>
  );
}

/** One saved entry. The whole card opens it; everything else it can do lives
 *  behind one quiet "more" button.
 *
 *  This used to carry a fenced-off pair of circular edit / delete buttons on
 *  every row, which ate the width the trip's own details needed and put a
 *  destructive control a few pixels from the thing that opens the trip. Now
 *  the tools collapse into a menu, and Remove still asks first: the card
 *  becomes the question in place, with the safe answer nearest the tap. */
function SavedCard({ Icon, visual, visualKind = 'icon', title, meta, onOpen, openTitle, actions = [], onDelete, deleteLabel, footer }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // A menu that outlives the tap that opened it is a menu in the way: close
  // on any click elsewhere, and on Escape for the keyboard.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

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
    <div className={`saved-card${footer ? ' has-footer' : ''}`}>
      <div className="saved-card-row">
        <button className="saved-card-main" onClick={onOpen} title={openTitle}>
          <span className={`saved-card-icon is-${visualKind}`}>{visual || <Icon size={16} />}</span>
          <span className="saved-card-text">
            <span className="saved-card-title">{title}</span>
            {meta && <span className="saved-card-meta">{meta}</span>}
          </span>
        </button>
        <div className="saved-card-menu" ref={menuRef}>
          <button
            className="saved-card-more"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t('saved.actions')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={t('saved.actions')}
          >
            <MoreIcon size={16} />
          </button>
          {menuOpen && (
            <div className="saved-card-pop" role="menu">
              {actions.map((a) => (
                <button
                  key={a.key}
                  role="menuitem"
                  className="saved-card-pop-item"
                  onClick={() => { setMenuOpen(false); a.onClick(); }}
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
              <button
                role="menuitem"
                className="saved-card-pop-item danger"
                onClick={() => { setMenuOpen(false); setConfirming(true); }}
                aria-label={deleteLabel}
              >
                <TrashIcon size={14} />
                {t('saved.remove')}
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Kept inside the card's own border instead of branching off it on a
          connector line: one saved trip should read as one object. */}
      {footer && (
        <button className="saved-card-footer" onClick={footer.onClick} title={footer.title}>
          <span>{footer.label}</span>
          <span className="saved-card-footer-go" aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}

// Standalone Saved trips panel, opened from the bottom nav (the same list also
// lives inside AccountPanel; this gives it a one-tap home of its own). Every
// kind of "saved" trip lands here, single destinations saved from the map,
// multi-stop trips built in the Trip planner, and device-local day plans, // each in its own clearly-labelled section.
export function SavedTripsPanel({ data, onClose, onLoadTrip, onLoadTripPlan, onOpenAuth, onOpenDayPlan, onGoToTab, onPlanTripFrom, onPlanDayIn }) {
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
        title={t('saved.destinations')}
        sub={t('saved.destinationsSub')}
        count={user ? trips.length : null}
      >
        {!user ? (
          <SavedEmpty
            Icon={MapPinIcon}
            text={configured ? t('saved.signInPrompt') : t('saved.notConfigured')}
            cta={configured ? t('saved.signIn') : null}
            onCta={configured ? onOpenAuth : null}
          />
        ) : loading ? (
          <div className="footnote">{t('saved.loading')}</div>
        ) : error ? (
          <div className="auth-error">{error}</div>
        ) : trips.length === 0 ? (
          <SavedEmpty
            Icon={MapPinIcon}
            text={t('saved.destinationsEmpty')}
            cta={t('saved.browseMap')}
            onCta={() => onGoToTab && onGoToTab('map')}
          />
        ) : (
          <div className="saved-card-stack">
            {trips.map((trip) => (
              <SavedCard
                key={trip.id}
                Icon={MapPinIcon}
                title={trip.city}
                meta={[
                  trip.country || '',
                  trip.depart_date ? `${fmtDate(trip.depart_date)} → ${fmtDate(trip.return_date)}` : '',
                ].filter(Boolean).join(', ')}
                onOpen={() => onLoadTrip(trip)}
                openTitle={t('saved.openDestination')}
                /* A saved place is a starting point for both planners. */
                actions={[
                  ...(onPlanTripFrom ? [{
                    key: 'trip',
                    label: t('saved.planTripFrom'),
                    icon: <RouteIcon size={14} />,
                    onClick: () => onPlanTripFrom(trip),
                  }] : []),
                  ...(onPlanDayIn ? [{
                    key: 'day',
                    label: t('saved.planDayIn'),
                    icon: <ListDayIcon size={14} />,
                    onClick: () => onPlanDayIn(trip),
                  }] : []),
                ]}
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
          title={t('saved.tripPlans')}
          sub={t('saved.tripPlansSub')}
          count={tripPlansLoading ? null : tripPlans.length}
        >
          {tripPlansLoading ? (
            <div className="footnote">{t('saved.loading')}</div>
          ) : tripPlans.length === 0 ? (
            <SavedEmpty
              Icon={RouteIcon}
              text={t('saved.tripPlansEmpty')}
              cta={t('saved.openTripPlanner')}
              onCta={() => onGoToTab && onGoToTab('trip')}
            />
          ) : (
            <div className="saved-card-stack">
              {tripPlans.map((p) => {
                const plannedDays = countPlannedDays(p.id);
                return (
                  <SavedCard
                    key={p.id}
                    Icon={RouteIcon}
                    visual={p.countries?.length ? <CountryFlagStack countries={p.countries} size={17} /> : null}
                    visualKind={p.countries?.length ? 'flag' : 'icon'}
                    title={p.label || t('saved.untitledTrip')}
                    meta={[
                      p.start_date ? `${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}` : '',
                      p.cities?.length ? t(p.cities.length === 1 ? 'saved.stops1' : 'saved.stopsN', { n: p.cities.length }) : '',
                    ].filter(Boolean).join(', ')}
                    onOpen={() => onLoadTripPlan && onLoadTripPlan(p.id)}
                    openTitle={t('saved.openTripPlan')}
                    actions={[{
                      key: 'edit',
                      label: t('saved.edit'),
                      icon: <PencilIcon size={14} />,
                      onClick: () => onLoadTripPlan && onLoadTripPlan({ id: p.id, edit: true }),
                    }]}
                    onDelete={() => handleDeleteTripPlan(p.id)}
                    deleteLabel={t('saved.removeItem', { name: p.label || t('saved.fallbackTrip') })}
                    /* This trip's own day-by-day plans, made in the Day
                       planner (stored on this device, keyed by the trip). */
                    footer={{
                      label: plannedDays > 0
                        ? t(plannedDays === 1 ? 'saved.plannedDays1' : 'saved.plannedDaysN', { n: plannedDays })
                        : t('saved.planItsDays'),
                      title: t('saved.planDaysTitle'),
                      onClick: () => onOpenDayPlan && onOpenDayPlan({ planId: p.id, stopIndex: 0, dayIndex: 0 }),
                    }}
                  />
                );
              })}
            </div>
          )}
        </SavedSection>
      )}

      {/* ── Day-by-day plans (device-local; they work without an account) ── */}
      <SavedSection
        title={t('saved.dayPlans')}
        sub={t('saved.dayPlansSub')}
        count={dayPlans.length}
      >
        {dayPlans.length === 0 ? (
          <SavedEmpty
            Icon={ListDayIcon}
            text={t('saved.dayPlansEmpty')}
            cta={t('saved.openDayPlanner')}
            onCta={() => onGoToTab && onGoToTab('day')}
          />
        ) : (
          <div className="saved-card-stack">
            {dayPlans.map((sp) => {
              const totalDays = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
              const photo = dayPlanVisual(sp);
              return (
                <SavedCard
                  key={sp.id}
                  Icon={ListDayIcon}
                  visual={photo}
                  visualKind={photo ? 'photo' : 'icon'}
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
