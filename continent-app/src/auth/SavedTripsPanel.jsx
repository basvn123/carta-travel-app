import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import { loadStandalonePlans, deleteStandalonePlan, loadAssignments, subscribeDayPlanStore } from '../planner/dayPlanStore.js';
import { MapPinIcon, RouteIcon, ListDayIcon, PencilIcon, MoreIcon, TrashIcon, BookmarkIcon } from '../components/Icons.jsx';
import { CountryFlag, CountryFlagStack } from '../components/CountryFlag.jsx';
import { useI18n } from '../i18n/index.jsx';

// The mini map at the top of Planned trips rides on the same code-split chunk
// as the big map: opening the panel before the map tab must not stall on
// maplibre, so it streams in behind a quiet placeholder.
const SavedTripMap = lazy(() => import('../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));

// How many individual days of a trip plan have Day-planner picks on this
// device (assignments = { stopIdx: { dayIdx: [activityIdx...] } }).
function countPlannedDays(planId) {
  const a = loadAssignments(planId);
  return Object.values(a || {}).reduce(
    (n, days) => n + Object.values(days || {}).filter((l) => Array.isArray(l) && l.length).length,
    0,
  );
}

// Local calendar date as YYYY-MM-DD; all stored trip dates are plain date
// strings, so classification is a string comparison in the user's own day.
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysIso(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ?savedmock verify seam, same precedent as ?provmock on the price surfaces:
// fixture favorites and trip plans stand in for the Supabase tables so the
// account-only card shapes render in headless checks. Display only, never on
// for real users unless they type the flag themselves.
const SAVED_MOCK = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('savedmock');
const MOCK_FAVS = [
  { id: 'mf1', destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', depart_date: addDaysIso(34), return_date: addDaysIso(38) },
  { id: 'mf2', destination_id: 'OPO', city: 'Porto', country: 'Portugal', depart_date: addDaysIso(62), return_date: addDaysIso(65) },
  { id: 'mf3', destination_id: 'gem:bruges', city: 'Bruges', country: 'Belgium' },
];
const MOCK_PLANS = [
  { id: 'mp1', label: null, cities: ['Lisbon', 'Porto'], countries: ['Portugal'], start_date: addDaysIso(21), end_date: addDaysIso(27), destination_ids: ['LIS', 'OPO'] },
  { id: 'mp2', label: 'Autumn in Flanders', cities: ['Bruges'], countries: ['Belgium'], start_date: addDaysIso(-40), end_date: addDaysIso(-35), destination_ids: ['gem:bruges'] },
];

function daysUntil(dateStr, todayIso) {
  return Math.round((new Date(dateStr + 'T00:00:00') - new Date(todayIso + 'T00:00:00')) / 86400000);
}

// A standalone day plan's last calendar day, for past/upcoming sorting.
function dayPlanEndDate(sp) {
  if (!sp.startDate) return null;
  const total = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
  const d = new Date(sp.startDate + 'T00:00:00');
  d.setDate(d.getDate() + total - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** One labelled shelf of the overview: title + count, an explainer of what
 *  lands here, then its cards. */
function SavedSection({ title, sub, count, muted, children }) {
  return (
    <div className={`panel-section saved-section${muted ? ' is-muted' : ''}`}>
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

/** An empty shelf, as an invitation rather than a dashed drop zone. */
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

/** The shared "more" affordance: one quiet button, a popover with the card's
 *  secondary actions, and Remove always last, gated behind the caller's
 *  confirm-in-place state so a destructive tap never fires on the first try. */
function CardMenu({ actions = [], onAskRemove, removeLabel }) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  return (
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
            onClick={() => { setMenuOpen(false); onAskRemove(); }}
            aria-label={removeLabel}
          >
            <TrashIcon size={14} />
            {t('saved.remove')}
          </button>
        </div>
      )}
    </div>
  );
}

/** In-place removal question: the card becomes the dialog, the safe answer
 *  nearest the tap. Shared by every card shape in the panel. */
function ConfirmRow({ name, onKeep, onRemove, label }) {
  const { t } = useI18n();
  return (
    <div className="saved-card saved-card-confirm" role="alertdialog" aria-label={label}>
      <span className="saved-card-confirm-text">{t('saved.confirmRemove', { name })}</span>
      <button className="saved-card-confirm-keep" onClick={onKeep}>{t('saved.keep')}</button>
      <button className="saved-card-confirm-go" onClick={onRemove}>{t('saved.remove')}</button>
    </div>
  );
}

/** Compact bordered row: the day-plan card, and any saved thing that needs a
 *  small footprint. Unchanged anatomy from the previous panel. */
function SavedCard({ Icon, visual, visualKind = 'icon', title, meta, onOpen, openTitle, actions = [], onDelete, deleteLabel, footer }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return <ConfirmRow name={title} label={deleteLabel} onKeep={() => setConfirming(false)} onRemove={onDelete} />;
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
        <CardMenu actions={actions} onAskRemove={() => setConfirming(true)} removeLabel={deleteLabel} />
      </div>
      {footer && (
        <button className="saved-card-footer" onClick={footer.onClick} title={footer.title}>
          <span>{footer.label}</span>
          <span className="saved-card-footer-go" aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}

/** A favorite: one saved place, photo first. The bookmark mark in the corner
 *  is the saved state itself, so tapping it is how a favorite is let go
 *  (with the same in-place confirmation as everywhere else). */
function FavCard({ trip, img, dates, onOpen, openTitle, onDelete, deleteLabel }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="fav-card">
      <button className="fav-card-open" onClick={onOpen} title={openTitle}>
        <span
          className={`fav-card-photo${img ? '' : ' is-fallback'}`}
          style={img ? { backgroundImage: `url(${img})` } : undefined}
          aria-hidden="true"
        >
          {!img && <MapPinIcon size={22} />}
        </span>
        <span className="fav-card-shade" aria-hidden="true" />
        <span className="fav-card-text">
          <span className="fav-card-city">{trip.city}</span>
          <span className="fav-card-sub">
            {trip.country && <span className="fav-card-country">{trip.country}</span>}
            {dates && <span className="fav-card-dates">{dates}</span>}
          </span>
        </span>
      </button>
      <button
        className="fav-card-mark"
        onClick={() => setConfirming(true)}
        aria-label={deleteLabel}
        title={deleteLabel}
      >
        <BookmarkIcon size={13} />
      </button>
      {confirming && (
        <div className="fav-card-ask" role="alertdialog" aria-label={deleteLabel}>
          <span className="fav-card-ask-text">{t('saved.confirmRemove', { name: trip.city })}</span>
          <div className="fav-card-ask-row">
            <button className="saved-card-confirm-keep" onClick={() => setConfirming(false)}>{t('saved.keep')}</button>
            <button className="saved-card-confirm-go" onClick={onDelete}>{t('saved.remove')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** An upcoming trip: the biggest object in the panel. Full-width photo, the
 *  countdown worn on the sleeve, the day-planning handle kept as a footer. */
function UpcomingTripCard({ title, img, whenChip, dates, stopsLabel, countries, onOpen, openTitle, actions, onDelete, deleteLabel, footer }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return <ConfirmRow name={title} label={deleteLabel} onKeep={() => setConfirming(false)} onRemove={onDelete} />;
  }

  return (
    <div className="uptrip-card">
      <div className="uptrip-visual">
        <button className="uptrip-open" onClick={onOpen} title={openTitle}>
          <span
            className={`uptrip-photo${img ? '' : ' is-fallback'}`}
            style={img ? { backgroundImage: `url(${img})` } : undefined}
            aria-hidden="true"
          >
            {!img && <RouteIcon size={26} />}
          </span>
          <span className="uptrip-shade" aria-hidden="true" />
          {whenChip && <span className="uptrip-when">{whenChip}</span>}
          <span className="uptrip-text">
            <span className="uptrip-title">{title}</span>
            <span className="uptrip-meta">
              {dates && <span className="uptrip-dates">{dates}</span>}
              {stopsLabel && <span className="uptrip-stops">{stopsLabel}</span>}
              {countries?.length ? <CountryFlagStack countries={countries} size={14} /> : null}
            </span>
          </span>
        </button>
        <div className="uptrip-menu">
          <CardMenu actions={actions} onAskRemove={() => setConfirming(true)} removeLabel={deleteLabel} />
        </div>
      </div>
      {footer && (
        <button className="saved-card-footer" onClick={footer.onClick} title={footer.title}>
          <span>{footer.label}</span>
          <span className="saved-card-footer-go" aria-hidden="true">›</span>
        </button>
      )}
    </div>
  );
}

/** A past trip: a quiet hairline row in the record, not a card competing with
 *  the future. Thumbnail desaturated, dates carrying the year. */
function PastRow({ title, img, Icon, meta, onOpen, openTitle, actions = [], onDelete, deleteLabel }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return <ConfirmRow name={title} label={deleteLabel} onKeep={() => setConfirming(false)} onRemove={onDelete} />;
  }

  return (
    <div className="past-row">
      <button className="past-row-main" onClick={onOpen} title={openTitle}>
        <span
          className={`past-row-thumb${img ? '' : ' is-fallback'}`}
          style={img ? { backgroundImage: `url(${img})` } : undefined}
          aria-hidden="true"
        >
          {!img && Icon && <Icon size={14} />}
        </span>
        <span className="past-row-text">
          <span className="past-row-title">{title}</span>
          {meta && <span className="past-row-meta">{meta}</span>}
        </span>
      </button>
      <CardMenu actions={actions} onAskRemove={() => setConfirming(true)} removeLabel={deleteLabel} />
    </div>
  );
}

/** The travel ledger: what the record adds up to. Two bordered tiles, each a
 *  measured fact in mono, each opening its own list. Rendered only once there
 *  is at least one finished trip, a zero is not a story worth a dashboard. */
function TravelLedger({ visitedCountries, visitedCities, catalogueCountryCount }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(null); // 'countries' | 'cities' | null
  const toggle = (key) => setOpen((cur) => (cur === key ? null : key));

  return (
    <div className="saved-ledger">
      <div className="saved-ledger-row">
        <button
          className={`saved-ledger-tile${open === 'countries' ? ' is-open' : ''}`}
          onClick={() => toggle('countries')}
          aria-expanded={open === 'countries'}
        >
          <span className="saved-ledger-num">
            {visitedCountries.length}
            <span className="saved-ledger-of">/ {catalogueCountryCount}</span>
          </span>
          <span className="saved-ledger-label">{t('saved.countriesLabel')}</span>
        </button>
        <button
          className={`saved-ledger-tile${open === 'cities' ? ' is-open' : ''}`}
          onClick={() => toggle('cities')}
          aria-expanded={open === 'cities'}
        >
          <span className="saved-ledger-num">{visitedCities.length}</span>
          <span className="saved-ledger-label">{t('saved.citiesLabel')}</span>
        </button>
      </div>
      {open === 'countries' && (
        <div className="saved-ledger-detail">
          {visitedCountries.map((c) => (
            <span key={c} className="saved-ledger-chip">
              <CountryFlag country={c} size={13} />
              {c}
            </span>
          ))}
        </div>
      )}
      {open === 'cities' && (
        <div className="saved-ledger-detail">
          {visitedCities.map((c) => (
            <span key={c} className="saved-ledger-chip">{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Standalone Saved trips panel, opened from the bottom nav. Two states of
// travelling, two tabs: Favorites is the shortlist of single places saved from
// the map, Planned trips is the calendar, multi-stop routes and day plans
// sorted into upcoming and past by their own dates.
export function SavedTripsPanel({ data, onClose, onLoadTrip, onLoadTripPlan, onOpenAuth, onOpenDayPlan, onGoToTab }) {
  const { user, configured } = useAuth();
  const { t } = useI18n();
  const destinations = data?.destinations || {};
  const todayIso = localToday();

  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('carta.savedTripsTab') === 'favorites' ? 'favorites' : 'planned'; }
    catch { return 'planned'; }
  });
  const pickTab = (v) => {
    setTab(v);
    try { localStorage.setItem('carta.savedTripsTab', v); } catch { /* private mode */ }
  };

  // authed gates what needs an account behind it; the mock seam counts.
  const authed = !!user || SAVED_MOCK;
  const [trips, setTrips] = useState(SAVED_MOCK ? MOCK_FAVS : []);
  const [loading, setLoading] = useState(!!user && !SAVED_MOCK);
  const [error, setError] = useState('');
  const [tripPlans, setTripPlans] = useState(SAVED_MOCK ? MOCK_PLANS : []);
  const [tripPlansLoading, setTripPlansLoading] = useState(!!user && !SAVED_MOCK);
  // Day plans, local-first; account sync can rewrite them underneath this
  // panel (a pull from another device), so refresh on those changes.
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
    if (!user || SAVED_MOCK) { setLoading(false); setTripPlansLoading(false); return; }
    loadTrips();
    loadTripPlans();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id) => {
    setTrips((prev) => prev.filter((x) => x.id !== id));
    if (SAVED_MOCK) return;
    try {
      await deleteTrip(id);
    } catch {
      loadTrips(); // roll back the optimistic removal on failure
    }
  };

  const handleDeleteTripPlan = async (id) => {
    setTripPlans((prev) => prev.filter((p) => p.id !== id));
    if (SAVED_MOCK) return;
    try {
      await deleteTripPlan(id);
    } catch {
      loadTripPlans(); // roll back the optimistic removal on failure
    }
  };

  const fmtDate = (s) => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const fmtDateYear = (s) => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  // ── Temporal classification: the dates decide, nobody files anything. ──
  const upcomingPlans = useMemo(() => tripPlans
    .filter((p) => !p.end_date || p.end_date >= todayIso)
    .sort((a, b) => (a.start_date || '9999') < (b.start_date || '9999') ? -1 : 1),
  [tripPlans, todayIso]);
  const pastPlans = useMemo(() => tripPlans
    .filter((p) => p.end_date && p.end_date < todayIso)
    .sort((a, b) => (a.end_date < b.end_date ? 1 : -1)),
  [tripPlans, todayIso]);
  const upcomingDayPlans = useMemo(() => dayPlans
    .filter((sp) => { const end = dayPlanEndDate(sp); return !end || end >= todayIso; })
    .sort((a, b) => ((a.startDate || '9999') < (b.startDate || '9999') ? -1 : 1)),
  [dayPlans, todayIso]);
  const pastDayPlans = useMemo(() => dayPlans
    .filter((sp) => { const end = dayPlanEndDate(sp); return end && end < todayIso; })
    .sort((a, b) => (dayPlanEndDate(a) < dayPlanEndDate(b) ? 1 : -1)),
  [dayPlans, todayIso]);

  const destCoords = (id) => {
    const d = destinations[id];
    if (!d) return null;
    const lat = d.city_lat != null ? d.city_lat : d.lat;
    const lon = d.city_lon != null ? d.city_lon : d.lon;
    return lat != null && lon != null ? { lat, lon } : null;
  };
  const destImage = (id) => destinations[id]?.image?.url || null;

  // Pins for the mini map: every upcoming trip's first stop, numbered in
  // departure order, so the map answers "where am I going, and in what order".
  const heroItems = useMemo(() => {
    const items = [];
    upcomingPlans.forEach((p) => {
      const at = destCoords(p.destination_ids?.[0]);
      if (at) items.push({ ...at, city: p.cities?.[0] || p.label || t('saved.fallbackTrip'), start: p.start_date, open: () => onLoadTripPlan && onLoadTripPlan(p.id) });
    });
    upcomingDayPlans.forEach((sp) => {
      const at = destCoords(sp.stops?.[0]?.destinationId);
      if (at) items.push({ ...at, city: destinations[sp.stops[0].destinationId]?.city || sp.label, start: sp.startDate, open: () => onOpenDayPlan && onOpenDayPlan(sp.id) });
    });
    items.sort((a, b) => ((a.start || '9999') < (b.start || '9999') ? -1 : 1));
    return items.slice(0, 8);
  }, [upcomingPlans, upcomingDayPlans]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the record adds up to: distinct countries and cities out of finished
  // trips only. Favorites never count, a wish is not a visit.
  const visited = useMemo(() => {
    const countries = new Set();
    const cities = new Set();
    pastPlans.forEach((p) => {
      (p.countries || []).forEach((c) => countries.add(c));
      (p.cities || []).forEach((c) => cities.add(c));
    });
    pastDayPlans.forEach((sp) => (sp.stops || []).forEach((s) => {
      const d = destinations[s.destinationId];
      if (d?.country) countries.add(d.country);
      if (d?.city) cities.add(d.city);
    }));
    return { countries: [...countries].sort(), cities: [...cities] };
  }, [pastPlans, pastDayPlans, destinations]);
  const catalogueCountryCount = useMemo(
    () => new Set(Object.values(destinations).map((d) => d.country).filter(Boolean)).size,
    [destinations],
  );

  const whenLabel = (start, end) => {
    if (!start) return t('saved.noDatesYet');
    const n = daysUntil(start, todayIso);
    if (n < 0) return (!end || end >= todayIso) ? t('saved.underway') : '';
    if (n === 0) return t('saved.departsToday');
    return t(n === 1 ? 'saved.inDays1' : 'saved.inDaysN', { n });
  };

  const planTitle = (p) => {
    if (p.label) return p.label;
    const cs = p.cities || [];
    if (cs.length > 1) return `${cs[0]} → ${cs[cs.length - 1]}`;
    return cs[0] || t('saved.untitledTrip');
  };

  const dayPlanMeta = (sp) => {
    const totalDays = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
    return [
      fmtDate(sp.startDate),
      (sp.stops?.length || 1) > 1 ? t('saved.citiesN', { n: sp.stops.length }) : '',
      t(totalDays === 1 ? 'saved.days1' : 'saved.daysN', { n: totalDays }),
    ].filter(Boolean).join(', ');
  };

  const nextUp = heroItems.find((i) => i.start) || heroItems[0] || null;
  const plannedCount = upcomingPlans.length + upcomingDayPlans.length;
  const pastCount = pastPlans.length + pastDayPlans.length;

  // Both kinds of past trip interleave into one record, newest first.
  const pastRecord = useMemo(() => {
    const rows = [
      ...pastPlans.map((p) => ({ kind: 'plan', when: p.end_date, item: p })),
      ...pastDayPlans.map((sp) => ({ kind: 'day', when: dayPlanEndDate(sp), item: sp })),
    ];
    rows.sort((a, b) => (a.when < b.when ? 1 : -1));
    return rows;
  }, [pastPlans, pastDayPlans]);

  return (
    <div className="panel open account-panel saved-trips-panel">
      <button className="panel-close" onClick={onClose} aria-label={t('saved.close')}>x</button>

      <div className="panel-header saved-panel-header">
        <div className="panel-tag">{t('saved.tag')}</div>
        <h2 className="panel-city account-heading">{t('saved.title')}</h2>
        {/* One mutually exclusive choice between the two states of travelling:
            the shortlist of wishes, or the calendar of commitments. */}
        <div className="panel-segment saved-tabs" role="tablist" aria-label={t('saved.title')}>
          <button
            role="tab"
            aria-selected={tab === 'favorites'}
            className={tab === 'favorites' ? 'seg-on' : ''}
            onClick={() => pickTab('favorites')}
          >
            {t('saved.tabFavorites')}
            {authed && !loading && trips.length > 0 && <small>{trips.length}</small>}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'planned'}
            className={tab === 'planned' ? 'seg-on' : ''}
            onClick={() => pickTab('planned')}
          >
            {t('saved.tabPlanned')}
            {plannedCount > 0 && <small>{plannedCount}</small>}
          </button>
        </div>
      </div>

      {tab === 'favorites' ? (
        /* ── Favorites: places saved from the map, photo first. ── */
        <div className="panel-section saved-section">
          <p className="saved-section-sub">{t('saved.destinationsSub')}</p>
          {!authed ? (
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
            <div className="fav-grid">
              {trips.map((trip) => (
                <FavCard
                  key={trip.id}
                  trip={trip}
                  img={destImage(trip.destination_id)}
                  dates={trip.depart_date ? `${fmtDate(trip.depart_date)} → ${fmtDate(trip.return_date)}` : ''}
                  onOpen={() => onLoadTrip(trip)}
                  openTitle={t('saved.openDestination')}
                  onDelete={() => handleDelete(trip.id)}
                  deleteLabel={t('saved.removeItem', { name: trip.city })}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── The mini map: every upcoming trip pinned in departure order.
              Always on: with nothing to pin it rests on Europe, the empty
              map itself being the invitation. ── */}
          <div className="panel-section saved-section saved-map-section">
            <div className="saved-map">
              <Suspense fallback={<div className="saved-map-loading" aria-hidden="true" />}>
                <SavedTripMap
                  stops={heroItems.map((i) => ({ lat: i.lat, lon: i.lon, city: i.city }))}
                  showRoute={false}
                  scrollZoom={false}
                  easeToSelected={false}
                  padBottom={0}
                  fitMaxZoom={5.5}
                  fitPadding={{ top: 42, left: 42, right: 42, bottom: 42 }}
                  onSelectStop={(i) => heroItems[i]?.open()}
                />
              </Suspense>
            </div>
            {nextUp ? (
              <div className="saved-map-caption">
                <span className="saved-map-caption-label">{t('saved.nextUp')}</span>
                <span className="saved-map-caption-city">{nextUp.city}</span>
                <span className="saved-map-caption-when">{whenLabel(nextUp.start, null)}</span>
              </div>
            ) : (
              <p className="saved-map-empty">{t('saved.mapEmpty')}</p>
            )}
          </div>

          {/* ── The travel ledger, once there is a record to add up. Day
              plans are local-first, so the record works signed out too. ── */}
          {pastCount > 0 && (
            <div className="panel-section saved-section">
              <TravelLedger
                visitedCountries={visited.countries}
                visitedCities={visited.cities}
                catalogueCountryCount={catalogueCountryCount}
              />
            </div>
          )}

          {/* ── Upcoming trips: the heaviest objects in the panel. ── */}
          <SavedSection
            title={t('saved.upcoming')}
            sub={t('saved.tripPlansSub')}
            count={authed && !tripPlansLoading ? upcomingPlans.length : null}
          >
            {!authed ? (
              <SavedEmpty
                Icon={RouteIcon}
                text={configured ? t('saved.signInPrompt') : t('saved.notConfigured')}
                cta={configured ? t('saved.signIn') : null}
                onCta={configured ? onOpenAuth : null}
              />
            ) : tripPlansLoading ? (
              <div className="footnote">{t('saved.loading')}</div>
            ) : upcomingPlans.length === 0 ? (
              <SavedEmpty
                Icon={RouteIcon}
                text={t('saved.upcomingEmpty')}
                cta={t('saved.planFirstTrip')}
                onCta={() => onGoToTab && onGoToTab('trip')}
              />
            ) : (
              <div className="saved-card-stack">
                {upcomingPlans.map((p) => {
                  const plannedDays = countPlannedDays(p.id);
                  return (
                    <UpcomingTripCard
                      key={p.id}
                      title={planTitle(p)}
                      img={destImage(p.destination_ids?.[0])}
                      whenChip={whenLabel(p.start_date, p.end_date)}
                      dates={p.start_date ? `${fmtDate(p.start_date)} → ${fmtDate(p.end_date)}` : ''}
                      stopsLabel={p.cities?.length ? t(p.cities.length === 1 ? 'saved.stops1' : 'saved.stopsN', { n: p.cities.length }) : ''}
                      countries={p.countries || []}
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

          {/* ── Day plans: lighter commitments, lighter cards. ── */}
          <SavedSection
            title={t('saved.dayPlans')}
            sub={t('saved.dayPlansSub')}
            count={upcomingDayPlans.length}
          >
            {upcomingDayPlans.length === 0 ? (
              <SavedEmpty
                Icon={ListDayIcon}
                text={t('saved.dayPlansEmpty')}
                cta={t('saved.openDayPlanner')}
                onCta={() => onGoToTab && onGoToTab('day')}
              />
            ) : (
              <div className="saved-card-stack">
                {upcomingDayPlans.map((sp) => {
                  const url = destImage(sp.stops?.[0]?.destinationId);
                  const photo = url ? <span className="saved-card-photo" style={{ backgroundImage: `url(${url})` }} aria-hidden="true" /> : null;
                  return (
                    <SavedCard
                      key={sp.id}
                      Icon={ListDayIcon}
                      visual={photo}
                      visualKind={photo ? 'photo' : 'icon'}
                      title={sp.label || t('saved.dayPlanFallbackTitle')}
                      meta={dayPlanMeta(sp)}
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

          {/* ── The record: finished trips file themselves, newest first. ── */}
          {(pastCount > 0 || plannedCount > 0) && (
            <SavedSection
              title={t('saved.past')}
              sub={t('saved.pastSub')}
              count={pastCount}
              muted
            >
              {pastCount === 0 ? (
                <p className="saved-past-empty">{t('saved.pastEmpty')}</p>
              ) : (
                <div className="past-list">
                  {pastRecord.map((row) => (row.kind === 'plan' ? (
                    <PastRow
                      key={`p${row.item.id}`}
                      title={planTitle(row.item)}
                      img={destImage(row.item.destination_ids?.[0])}
                      Icon={RouteIcon}
                      meta={[
                        row.item.start_date ? `${fmtDate(row.item.start_date)} → ${fmtDateYear(row.item.end_date)}` : '',
                        row.item.cities?.length ? t(row.item.cities.length === 1 ? 'saved.stops1' : 'saved.stopsN', { n: row.item.cities.length }) : '',
                      ].filter(Boolean).join(', ')}
                      onOpen={() => onLoadTripPlan && onLoadTripPlan(row.item.id)}
                      openTitle={t('saved.openTripPlan')}
                      actions={[{
                        key: 'edit',
                        label: t('saved.edit'),
                        icon: <PencilIcon size={14} />,
                        onClick: () => onLoadTripPlan && onLoadTripPlan({ id: row.item.id, edit: true }),
                      }]}
                      onDelete={() => handleDeleteTripPlan(row.item.id)}
                      deleteLabel={t('saved.removeItem', { name: row.item.label || t('saved.fallbackTrip') })}
                    />
                  ) : (
                    <PastRow
                      key={`d${row.item.id}`}
                      title={row.item.label || t('saved.dayPlanFallbackTitle')}
                      img={destImage(row.item.stops?.[0]?.destinationId)}
                      Icon={ListDayIcon}
                      meta={fmtDateYear(row.item.startDate)}
                      onOpen={() => onOpenDayPlan && onOpenDayPlan(row.item.id)}
                      openTitle={t('saved.openDayPlan')}
                      onDelete={() => setDayPlans(deleteStandalonePlan(row.item.id))}
                      deleteLabel={t('saved.removeItem', { name: row.item.label || t('saved.fallbackDayPlan') })}
                    />
                  )))}
                </div>
              )}
            </SavedSection>
          )}
        </>
      )}
    </div>
  );
}
