import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import { loadStandalonePlans, deleteStandalonePlan, loadAssignments, subscribeDayPlanStore } from '../planner/dayPlanStore.js';
import { MapPinIcon, RouteIcon, ListDayIcon, PencilIcon, TrashIcon, MoreIcon, BookmarkIcon, CalendarIcon, CheckIcon, PlusIcon, LinkIcon } from '../components/Icons.jsx';
import { PastTripForm } from './PastTripForm.jsx';
import { TripMemoryView } from './TripMemoryView.jsx';
import {
  savePastTripToAccount, savePastTripOnDevice, pastTripAsPlanRow, defaultPastLabel,
  updatePastTripInAccount, updatePastTripOnDevice,
} from './pastTrip.js';
import {
  loadMemory, saveMemory, clearMemory, coverPhoto, memoryPoints, spendSummary, SPEND_CATS,
} from './pastTripMemory.js';
import { CountryFlag, CountryFlagStack, COUNTRY_ISO2 } from '../components/CountryFlag.jsx';
import { crewLabel } from './tripCrew.js';
import { TripSharePanel } from './TripSharePanel.jsx';
import { FriendTripPanel } from './FriendTripPanel.jsx';
import { fetchFriendLinks, listFriendTrips } from './friends.js';
import { kindsForDest } from '../lib/trip_kinds.js';
import { eur } from '../lib/format.js';
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
  { id: 'mf1', destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', depart_date: addDaysIso(34), return_date: addDaysIso(38), created_at: addDaysIso(-12) },
  { id: 'mf2', destination_id: 'OPO', city: 'Porto', country: 'Portugal', depart_date: addDaysIso(62), return_date: addDaysIso(65), created_at: addDaysIso(-30) },
  { id: 'mf3', destination_id: 'gem:bruges', city: 'Bruges', country: 'Belgium', created_at: addDaysIso(-45) },
];
const MOCK_PLANS = [
  { id: 'mp1', label: null, cities: ['Lisbon', 'Porto'], countries: ['Portugal'], start_date: addDaysIso(21), end_date: addDaysIso(27), destination_ids: ['LIS', 'OPO'] },
  { id: 'mp2', label: 'Autumn in Flanders', cities: ['Bruges'], countries: ['Belgium'], start_date: addDaysIso(-40), end_date: addDaysIso(-35), destination_ids: ['gem:bruges'] },
  { id: 'mp3', label: null, cities: ['Salzburg'], countries: ['Austria'], start_date: addDaysIso(-11), end_date: addDaysIso(-9), destination_ids: ['SZG'] },
  { id: 'mp4', label: null, cities: ['Munich'], countries: ['Germany'], start_date: addDaysIso(-9), end_date: addDaysIso(-7), destination_ids: ['MUC'] },
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

// First-seen-order dedupe, dropping holes; keeps "Lisbon, Porto" in the order
// the trip actually visits them, unlike a Set spread of mixed sources.
function orderedUnique(list) {
  const out = [];
  for (const v of list) if (v && !out.includes(v)) out.push(v);
  return out;
}

/** One labelled shelf of the overview: title + count, an explainer of what
 *  lands here, then its cards. `big` promotes the title to the display face,
 *  for the one heading that names each tab's main list. `action` is the one
 *  thing you can do to the shelf itself, kept on the heading line. */
function SavedSection({ title, sub, count, muted, big, action, children }) {
  return (
    <div className={`panel-section saved-section${muted ? ' is-muted' : ''}${big ? ' is-big' : ''}`}>
      <div className="saved-section-head">
        <span className="saved-section-title">{title}</span>
        {count != null && (
          <span className={`saved-section-count${count > 0 ? ' on' : ''}`}>{count}</span>
        )}
        {action && <span className="saved-section-action">{action}</span>}
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
          {onAskRemove && (
            <button
              role="menuitem"
              className="saved-card-pop-item danger"
              onClick={() => { setMenuOpen(false); onAskRemove(); }}
              aria-label={removeLabel}
            >
              <TrashIcon size={14} />
              {t('saved.remove')}
            </button>
          )}
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

/** A favorite: one saved place, photo first, its country flag worn in the
 *  corner and the day it was kept in the caption. The bookmark mark is the
 *  saved state itself, so tapping it is how a favorite is let go (with the
 *  same in-place confirmation as everywhere else). */
function FavCard({ trip, img, dates, kind, savedOn, onOpen, openTitle, onDelete, deleteLabel }) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  // The corner flag already names the country; the text line only steps in
  // for a country the flag catalogue does not cover.
  const hasFlag = !!(trip.country && COUNTRY_ISO2[trip.country]);

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
        {hasFlag && (
          <span className="fav-card-flag" aria-hidden="true">
            <CountryFlag country={trip.country} size={13} />
          </span>
        )}
        <span className="fav-card-text">
          <span className="fav-card-city">{trip.city}</span>
          {(!hasFlag && trip.country) || dates ? (
            <span className="fav-card-sub">
              {!hasFlag && trip.country && <span className="fav-card-country">{trip.country}</span>}
              {dates && <span className="fav-card-dates">{dates}</span>}
            </span>
          ) : null}
          {(kind || savedOn) && (
            <span className="fav-card-kept">
              {kind && <span className="fav-card-kind">{kind}</span>}
              {savedOn && <span className="fav-card-savedon">{t('saved.savedOn', { date: savedOn })}</span>}
            </span>
          )}
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

/** The big journey card, shared by Planned and Visited: full-width photo, the
 *  country as the headline, its flag as a corner badge, dates under a small
 *  label, and one mark in the other corner saying which state it is in, a
 *  calendar for a commitment, a check for a memory. */
function JourneyCard({ title, sub, img, whenChip, countries = [], dateLabel, dates, visited, onOpen, openTitle, actions, onDelete, deleteLabel, footer }) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return <ConfirmRow name={title} label={deleteLabel} onKeep={() => setConfirming(false)} onRemove={onDelete} />;
  }

  return (
    <div className={`uptrip-card${visited ? ' is-visited' : ''}`}>
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
          {countries.length > 0 && (
            <span className="uptrip-flag" aria-hidden="true">
              <CountryFlagStack countries={countries} size={15} />
            </span>
          )}
          <span className="uptrip-text">
            <span className="uptrip-title">{title}</span>
            {sub && <span className="uptrip-sub">{sub}</span>}
            {dates && (
              <span className="uptrip-dateblock">
                {dateLabel && <span className="uptrip-datelabel">{dateLabel}</span>}
                <span className="uptrip-dates">{dates}</span>
              </span>
            )}
          </span>
          <span className="uptrip-state" aria-hidden="true">
            {visited ? <CheckIcon size={13} /> : <CalendarIcon size={13} />}
          </span>
        </button>
        {/* A card you do not own has nothing in this menu: no edits, and
            certainly no Remove, which would read as deleting somebody else's
            trip. Absent beats present-and-inert. */}
        {(actions.length > 0 || onDelete) && (
          <div className="uptrip-menu">
            <CardMenu
              actions={actions}
              onAskRemove={onDelete ? () => setConfirming(true) : null}
              removeLabel={deleteLabel}
            />
          </div>
        )}
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

/** What the record adds up to: countries against the whole European map, and
 *  cities, each card carrying its own evidence, flags with names, city chips.
 *  The denominator is the flag catalogue itself, every European country the
 *  app can show, so the fraction stays honest as coverage grows. */
function TravelLedger({ visitedCountries, visitedCities }) {
  const { t } = useI18n();
  const europeanTotal = useMemo(() => new Set(Object.values(COUNTRY_ISO2)).size, []);
  const europeanVisited = visitedCountries.filter((c) => COUNTRY_ISO2[c]).length;
  const MAX_FLAGS = 8;
  const MAX_CITIES = 6;
  const cityLine = visitedCities.slice(0, MAX_CITIES).join(', ')
    + (visitedCities.length > MAX_CITIES ? ` +${visitedCities.length - MAX_CITIES}` : '');

  return (
    <div className="ledger2">
      <div className="ledger2-card">
        <span className="ledger2-title">{t('saved.visitedCountries')}</span>
        <span className="ledger2-num">
          {europeanVisited}
          <span className="ledger2-of">/ {europeanTotal}</span>
        </span>
        <span className="ledger2-cap">{t('saved.europeanCountries')}</span>
        <div className="ledger2-flags">
          {visitedCountries.slice(0, MAX_FLAGS).map((c) => (
            <span key={c} className="ledger2-flagitem">
              <CountryFlag country={c} size={17} />
              <span className="ledger2-flagname">{c}</span>
            </span>
          ))}
          {visitedCountries.length > MAX_FLAGS && (
            <span className="ledger2-flagitem is-more">+{visitedCountries.length - MAX_FLAGS}</span>
          )}
        </div>
      </div>
      <div className="ledger2-card">
        <span className="ledger2-title">{t('saved.visitedCities')}</span>
        <span className="ledger2-num">{visitedCities.length}</span>
        <span className="ledger2-cap">{t('saved.citiesLabel')}</span>
        {cityLine && <span className="ledger2-cities">{cityLine}</span>}
      </div>
    </div>
  );
}

// Standalone Saved trips panel, opened from the bottom nav. Three states of
// travelling, three tabs: Favorites is the shortlist of single places saved
// from the map, Planned is the calendar of upcoming routes and day plans, and
// Visited is the record that finished trips file themselves into, with the
// country and city ledger on top.
export function SavedTripsPanel({ data, onClose, onLoadTrip, onLoadTripPlan, onOpenAuth, onOpenDayPlan, onGoToTab }) {
  const { user, configured } = useAuth();
  const { t, lang } = useI18n();
  const destinations = data?.destinations || {};
  const todayIso = localToday();

  const [tab, setTab] = useState(() => {
    try {
      const stored = localStorage.getItem('carta.savedTripsTab');
      return ['favorites', 'planned', 'visited'].includes(stored) ? stored : 'planned';
    } catch { return 'planned'; }
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

  // ── Adding a trip that already happened. It is written in the shape the
  // record already reads (an account trip plan when there is an account, a
  // device day plan when there is not), so it comes back through the same
  // classifier, card, map and ledger as every other finished trip. ──
  // `editing` is null when closed, { id } when a logged trip is being
  // rewritten, and {} when a new one is being told for the first time.
  const [pastOpen, setPastOpen] = useState(false);
  const [pastEdit, setPastEdit] = useState(null);
  const [pastBusy, setPastBusy] = useState(false);
  const [pastError, setPastError] = useState('');
  // Memories live outside React state (extras in localStorage, shadowed to the
  // account), so a save bumps this to re-read them.
  const [memTick, setMemTick] = useState(0);
  const [openMemory, setOpenMemory] = useState('');
  // Which trip has its share panel open. A trip plan only, never a device
  // day plan: a share token references trip_plans, so a guest's own local
  // trips have nothing to point at.
  const [openShare, setOpenShare] = useState('');
  // Friends, and the trips they have set to 'friends'. Both are account only
  // and both fail quietly: a project without migration 011 simply has neither,
  // which is not something the traveller can act on.
  const [friends, setFriends] = useState([]);
  const [friendTrips, setFriendTrips] = useState([]);
  const [openFriendTrip, setOpenFriendTrip] = useState('');
  // Visibility per own trip: local edits first, then the value the trip row
  // came back with. Never a bare 'private' default while a real value exists,
  // because a control that says "Only me" over a trip that is actually shown
  // to friends misstates a security setting.
  const [visById, setVisById] = useState({});

  useEffect(() => {
    if (!user) { setFriends([]); setFriendTrips([]); return undefined; }
    let live = true;
    fetchFriendLinks(user.id)
      .then((rows) => { if (live) setFriends(rows.filter((r) => r.kind === 'friend')); })
      .catch(() => {});
    listFriendTrips()
      .then((rows) => { if (live) setFriendTrips(rows); })
      .catch(() => {});
    return () => { live = false; };
  }, [user]);

  // Spend categories in the reader's language, so the ledger rows a memory
  // writes are readable rather than machine keys.
  const spendLabels = useMemo(
    () => Object.fromEntries(SPEND_CATS.map((c) => [c, t(`saved.pastSpend_${c}`)])),
    [t],
  );

  const openPastForm = (initial) => {
    setPastError('');
    setPastEdit(initial || null);
    setPastOpen(true);
  };

  const handleSavePastTrip = async (form) => {
    // An unnamed trip is named after its countries, which is what the record's
    // cards read as their headline.
    const payload = { ...form, label: form.label || defaultPastLabel(form.places) };
    const editId = pastEdit?.id || null;
    setPastBusy(true);
    setPastError('');
    try {
      let planId = editId;
      if (SAVED_MOCK) {
        planId = editId || `mock:${Date.now()}`;
        setTripPlans((prev) => [
          pastTripAsPlanRow(planId, payload),
          ...prev.filter((p) => p.id !== planId),
        ]);
      } else if (pastEdit?.local) {
        updatePastTripOnDevice(editId, payload);
        setDayPlans(loadStandalonePlans());
      } else if (editId && user) {
        await updatePastTripInAccount(user.id, editId, payload);
        setTripPlans((prev) => prev.map((p) => (p.id === editId ? pastTripAsPlanRow(editId, payload) : p)));
      } else if (user) {
        planId = await savePastTripToAccount(user.id, payload);
        // Optimistic: the record shows the trip at once, and the next fetch
        // replaces this row with the stored one.
        setTripPlans((prev) => [pastTripAsPlanRow(planId, payload), ...prev]);
      } else {
        const saved = savePastTripOnDevice(payload);
        planId = saved.id;
        setDayPlans(saved.plans);
      }
      // Everything a trip plan cannot hold rides alongside it, keyed by the
      // same id, so it survives an edit and syncs with the trip.
      if (payload.memory) saveMemory(planId, { ...payload.memory, places: payload.memory.places }, spendLabels);
      setMemTick((n) => n + 1);
      setPastOpen(false);
      setPastEdit(null);
    } catch (e) {
      setPastError(e.message || t('saved.pastSaveFailed'));
    } finally {
      setPastBusy(false);
    }
  };

  const handleDeleteTripPlan = async (id) => {
    setTripPlans((prev) => prev.filter((p) => p.id !== id));
    clearMemory(id);
    setMemTick((n) => n + 1);
    if (SAVED_MOCK) return;
    try {
      await deleteTripPlan(id);
    } catch {
      loadTripPlans(); // roll back the optimistic removal on failure
    }
  };

  const fmtDate = (s) => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const fmtDateYear = (s) => s ? new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  // Supabase timestamps come with a time part; trim to the calendar day.
  const fmtStamp = (s) => (s ? fmtDateYear(String(s).slice(0, 10)) : '');

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

  // The trip's own words, keyed by plan id, for every finished trip on show.
  // A trip with a memory was told by hand; one without was lived through the
  // app, and the record shows both the same way.
  const memories = useMemo(() => {
    const out = {};
    [...pastPlans.map((p) => p.id), ...pastDayPlans.map((sp) => sp.id)].forEach((id) => {
      const m = loadMemory(id);
      if (m) out[id] = m;
    });
    return out;
    // memTick is the point: memories live in localStorage, so a save has to
    // re-read them even though no prop changed.
  }, [pastPlans, pastDayPlans, memTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const destCoords = (id) => {
    const d = destinations[id];
    if (!d) return null;
    const lat = d.city_lat != null ? d.city_lat : d.lat;
    const lon = d.city_lon != null ? d.city_lon : d.lon;
    return lat != null && lon != null ? { lat, lon } : null;
  };

  // ── Images for everything. The direct lookup misses when a stop's id is a
  // researched town or an id that fell out of the catalogue, so every card
  // walks a fallback chain: its own destinations, then any catalogue entry in
  // the same city, then the best-rated photo of the same country. ──
  const imageLookup = useMemo(() => {
    const byCity = new Map();
    const byCountry = new Map();
    for (const d of Object.values(destinations)) {
      const url = d.image?.url;
      if (!url) continue;
      const score = d.rating?.score ?? d.beauty?.score ?? 0;
      const cityKey = (d.city || '').toLowerCase();
      const curCity = cityKey && byCity.get(cityKey);
      if (cityKey && (!curCity || score > curCity.score)) byCity.set(cityKey, { url, score });
      const curCountry = d.country && byCountry.get(d.country);
      if (d.country && (!curCountry || score > curCountry.score)) byCountry.set(d.country, { url, score });
    }
    return { byCity, byCountry };
  }, [destinations]);

  const resolveImage = ({ ids = [], cities = [], countries = [] }) => {
    for (const id of ids) {
      const u = destinations[id]?.image?.url;
      if (u) return u;
    }
    for (const c of cities) {
      const hit = imageLookup.byCity.get((c || '').toLowerCase());
      if (hit) return hit.url;
    }
    for (const c of countries) {
      const hit = imageLookup.byCountry.get(c);
      if (hit) return hit.url;
    }
    return null;
  };

  // A trip plan's places, from its stored arrays and its stops both, so a
  // plan saved before the arrays existed still knows where it went.
  const planCountries = (p) => orderedUnique([
    ...(p.countries || []),
    ...(p.destination_ids || []).map((id) => destinations[id]?.country),
  ]);
  const planCities = (p) => orderedUnique([
    ...(p.cities || []),
    ...(p.destination_ids || []).map((id) => destinations[id]?.city),
  ]);
  const dayPlanCountries = (sp) => orderedUnique((sp.stops || []).map((s) => destinations[s.destinationId]?.country));
  const dayPlanCities = (sp) => orderedUnique((sp.stops || []).map((s) => destinations[s.destinationId]?.city));

  // City name -> coordinates, best-rated entry wins the name, so a record that
  // stored "Munich" as plain text (no destination id) still lands on the map.
  const cityCoordIndex = useMemo(() => {
    const m = new Map();
    for (const d of Object.values(destinations)) {
      const key = (d.city || '').toLowerCase();
      const lat = d.city_lat != null ? d.city_lat : d.lat;
      const lon = d.city_lon != null ? d.city_lon : d.lon;
      if (!key || lat == null || lon == null) continue;
      const score = d.rating?.score ?? d.beauty?.score ?? 0;
      const cur = m.get(key);
      if (!cur || score > cur.score) m.set(key, { lat, lon, score });
    }
    return m;
  }, [destinations]);
  const cityCoords = (city) => cityCoordIndex.get((city || '').toLowerCase()) || null;

  // Every place in the record, pinned. Not first stops only: the map is the
  // record's own claim, so each city of each finished trip earns its pin, and
  // the countries underneath are painted from the same trips.
  const visitedItems = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (city, at, open, id) => {
      if (!at) return;
      const key = (city || '').toLowerCase() || `${at.lat},${at.lon}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        lat: at.lat,
        lon: at.lon,
        city: city || '',
        plain: true,
        // Zoomed in, the pin wears the place's own photograph.
        img: resolveImage({ ids: id ? [id] : [], cities: [city] }),
        open,
      });
    };
    pastPlans.forEach((p) => {
      const open = () => setOpenMemory((cur) => (cur === p.id ? '' : p.id));
      (p.destination_ids || []).forEach((id) => add(destinations[id]?.city, destCoords(id), open, id));
      (p.cities || []).forEach((c) => add(c, cityCoords(c), open));
      // A place off the catalogue pins from its own geocoded coordinates.
      memoryPoints(memories[p.id]).forEach((pt) => add(pt.city, pt, open, pt.id));
    });
    pastDayPlans.forEach((sp) => {
      const open = () => setOpenMemory((cur) => (cur === sp.id ? '' : sp.id));
      (sp.stops || []).forEach((s) => {
        add(destinations[s.destinationId]?.city, destCoords(s.destinationId), open, s.destinationId);
      });
      memoryPoints(memories[sp.id]).forEach((pt) => add(pt.city, pt, open, pt.id));
    });
    return out;
  }, [pastPlans, pastDayPlans, destinations, cityCoordIndex, memories]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the record adds up to: distinct countries and cities out of finished
  // trips only. Favorites never count, a wish is not a visit.
  const visited = useMemo(() => {
    const countries = new Set();
    const cities = new Set();
    pastPlans.forEach((p) => {
      planCountries(p).forEach((c) => countries.add(c));
      planCities(p).forEach((c) => cities.add(c));
    });
    pastDayPlans.forEach((sp) => {
      dayPlanCountries(sp).forEach((c) => countries.add(c));
      dayPlanCities(sp).forEach((c) => cities.add(c));
    });
    // Places the catalogue has never held count too: the traveller was there.
    Object.values(memories).forEach((m) => {
      (m.places || []).forEach((p) => {
        if (p.country) countries.add(p.country);
        if (p.city) cities.add(p.city);
      });
    });
    return { countries: [...countries].sort(), cities: [...cities] };
  }, [pastPlans, pastDayPlans, destinations, memories]); // eslint-disable-line react-hooks/exhaustive-deps

  // MapLibre states the cooperative-gesture rule in its own overlay, in the
  // traveller's language.
  const mapLocale = useMemo(() => ({
    'CooperativeGesturesHandler.WindowsHelpText': t('map.ctrlZoom'),
    'CooperativeGesturesHandler.MacHelpText': t('map.cmdZoom'),
    'CooperativeGesturesHandler.MobileHelpText': t('map.twoFingers'),
  }), [t]);

  // The same countries as ISO2, which is what the map paints by.
  const visitedIso = useMemo(
    () => visited.countries.map((c) => COUNTRY_ISO2[c]).filter(Boolean),
    [visited],
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

  // The journey card wears the country as its headline when the trip stays in
  // one, the cities beneath; a named or multi-country trip keeps its route.
  const journeyParts = (p) => {
    const countries = planCountries(p);
    const cities = planCities(p);
    if (p.label) return { title: p.label, sub: cities.join(', '), countries };
    if (countries.length === 1) return { title: countries[0], sub: cities.join(', '), countries };
    return { title: planTitle(p), sub: countries.join(', '), countries };
  };
  const dayJourneyParts = (sp) => {
    const countries = dayPlanCountries(sp);
    const cities = dayPlanCities(sp);
    if (sp.label && countries.length !== 1) return { title: sp.label, sub: cities.join(', '), countries };
    if (countries.length === 1) return { title: countries[0], sub: cities.join(', ') || sp.label, countries };
    return { title: sp.label || t('saved.dayPlanFallbackTitle'), sub: cities.join(', '), countries };
  };

  const dayPlanMeta = (sp) => {
    const totalDays = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
    return [
      fmtDate(sp.startDate),
      (sp.stops?.length || 1) > 1 ? t('saved.citiesN', { n: sp.stops.length }) : '',
      t(totalDays === 1 ? 'saved.days1' : 'saved.daysN', { n: totalDays }),
    ].filter(Boolean).join(', ');
  };

  // What a logged trip says on its own card, before it is opened: the marks
  // that were actually made, never a placeholder for the ones that were not.
  const memoryLine = (m) => {
    const spend = spendSummary(m);
    return [
      // Who came leads: it is the most concrete thing a trip can say about
      // itself, and the only line here that names anyone.
      crewLabel(m.crew, lang),
      m.rating != null ? t('saved.pastRatedN', { n: m.rating }) : '',
      spend.any ? eur(spend.total) : '',
      m.photos?.length ? t(m.photos.length === 1 ? 'saved.pastPhotos1' : 'saved.pastPhotosN', { n: m.photos.length }) : '',
      m.story?.trim() ? t('saved.pastStoryWritten') : '',
    ].filter(Boolean).join(', ') || t('saved.pastSeeTrip');
  };

  // "Share this trip" as a card menu action. Only for a saved trip plan, and
  // only when signed in: the token hangs off trip_plans, so there is nothing
  // for a guest's device-local trip to reference.
  const shareAction = (planId) => (user ? {
    key: 'share',
    label: t('share.menu'),
    icon: <LinkIcon size={14} />,
    onClick: () => setOpenShare((cur) => (cur === planId ? '' : planId)),
  } : null);

  const sharePanelFor = (planId) => (openShare === planId && user
    ? (
      <TripSharePanel
        userId={user.id}
        tripPlanId={planId}
        visibility={visById[planId]
          || tripPlans.find((tp) => tp.id === planId)?.visibility
          || 'private'}
        onVisibility={(id, v) => setVisById((cur) => ({ ...cur, [id]: v }))}
      />
    )
    : null);

  // Re-opening a logged trip in the form it was told in. The memory holds the
  // places (it is the only thing that knows an off-catalogue town), and the
  // trip itself holds the dates.
  const placesFromPlan = (p) => (p.cities || []).map((city, i) => ({
    id: (p.destination_ids || [])[i] || null,
    city,
    country: destinations[(p.destination_ids || [])[i]]?.country || '',
    lat: null,
    lon: null,
    nights: null,
  }));
  const editableFromPlan = (p, mem) => ({
    id: p.id,
    label: p.label || '',
    startDate: p.start_date,
    endDate: p.end_date,
    places: mem?.places?.length ? mem.places : placesFromPlan(p),
    memory: mem,
  });
  const editableFromDayPlan = (sp, mem) => ({
    id: sp.id,
    local: true,
    label: sp.label || '',
    startDate: sp.startDate,
    endDate: dayPlanEndDate(sp),
    places: mem?.places?.length ? mem.places : (sp.stops || []).map((s) => ({
      id: destinations[s.destinationId] ? s.destinationId : null,
      city: destinations[s.destinationId]?.city || s.city || '',
      country: destinations[s.destinationId]?.country || s.country || '',
      lat: s.lat ?? null,
      lon: s.lon ?? null,
      nights: null,
    })),
    memory: mem,
  });

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

  const signedOutEmpty = (
    <SavedEmpty
      Icon={RouteIcon}
      text={configured ? t('saved.signInPrompt') : t('saved.notConfigured')}
      cta={configured ? t('saved.signIn') : null}
      onCta={configured ? onOpenAuth : null}
    />
  );

  return (
    <div className="panel open account-panel saved-trips-panel">
      <button className="panel-close" onClick={onClose} aria-label={t('saved.close')}>x</button>

      <div className="panel-header saved-panel-header">
        <div className="panel-tag">{t('saved.tag')}</div>
        <h2 className="panel-city account-heading">{t('saved.title')}</h2>
        {/* Three states of travelling, one mutually exclusive choice: the
            shortlist of wishes, the calendar of commitments, the record. */}
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
          <button
            role="tab"
            aria-selected={tab === 'visited'}
            className={tab === 'visited' ? 'seg-on' : ''}
            onClick={() => pickTab('visited')}
          >
            {t('saved.tabVisited')}
            {pastCount > 0 && <small>{pastCount}</small>}
          </button>
        </div>
      </div>

      {tab === 'favorites' && (
        /* ── Favorites: places saved from the map, photo first. ── */
        <SavedSection title={t('saved.favsTitle')} big>
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
                  img={resolveImage({ ids: [trip.destination_id], cities: [trip.city], countries: [trip.country] })}
                  dates={trip.depart_date ? `${fmtDate(trip.depart_date)} → ${fmtDate(trip.return_date)}` : ''}
                  kind={(() => { const k = kindsForDest(destinations[trip.destination_id]?.categories)[0]; return k ? t(`kind.${k.key}`) : ''; })()}
                  savedOn={fmtStamp(trip.created_at)}
                  onOpen={() => onLoadTrip(trip)}
                  openTitle={t('saved.openDestination')}
                  onDelete={() => handleDelete(trip.id)}
                  deleteLabel={t('saved.removeItem', { name: trip.city })}
                />
              ))}
            </div>
          )}
        </SavedSection>
      )}

      {tab === 'planned' && (
        <>
          {/* ── Upcoming journeys: the heaviest objects in the panel. ── */}
          <SavedSection
            title={t('saved.upcomingJourneys')}
            count={authed && !tripPlansLoading ? upcomingPlans.length : null}
            big
          >
            {!authed ? signedOutEmpty : tripPlansLoading ? (
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
                  const parts = journeyParts(p);
                  return (
                    <div className="saved-record-row" key={p.id}>
                    <JourneyCard
                      title={parts.title}
                      sub={parts.sub}
                      countries={parts.countries}
                      img={resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries })}
                      whenChip={whenLabel(p.start_date, p.end_date)}
                      dateLabel={t('saved.datesLabel')}
                      dates={p.start_date ? `${fmtDate(p.start_date)} → ${fmtDateYear(p.end_date)}` : ''}
                      onOpen={() => onLoadTripPlan && onLoadTripPlan(p.id)}
                      openTitle={t('saved.openTripPlan')}
                      actions={[{
                        key: 'edit',
                        label: t('saved.edit'),
                        icon: <PencilIcon size={14} />,
                        onClick: () => onLoadTripPlan && onLoadTripPlan({ id: p.id, edit: true }),
                      }, shareAction(p.id)].filter(Boolean)}
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
                    {sharePanelFor(p.id)}
                    </div>
                  );
                })}
              </div>
            )}
          </SavedSection>

          {/* ── What friends are showing you. Their own trips, read only,
                 and only the ones they set to 'friends'. Absent entirely when
                 nobody has shared anything, rather than an empty shelf that
                 says the feature exists. ── */}
          {friendTrips.length > 0 && (
            <SavedSection
              title={t('friends.theirTrips')}
              sub={t('friends.theirTripsSub')}
              count={friendTrips.length}
            >
              <div className="saved-card-stack">
                {friendTrips.map((ft) => {
                  const showing = openFriendTrip === ft.tripPlanId;
                  const who = ft.ownerName || `@${ft.ownerHandle}`;
                  return (
                    <div className="saved-record-row" key={ft.tripPlanId}>
                      <JourneyCard
                        title={ft.label || (ft.cities || []).join(', ')}
                        sub={t('friends.byWhom', { who })}
                        countries={ft.countries || []}
                        img={resolveImage({
                          ids: ft.destinationIds || [],
                          cities: ft.cities || [],
                          countries: ft.countries || [],
                        })}
                        dateLabel={t('saved.datesLabel')}
                        dates={ft.startDate ? `${fmtDate(ft.startDate)} → ${fmtDateYear(ft.endDate)}` : ''}
                        onOpen={() => setOpenFriendTrip(showing ? '' : ft.tripPlanId)}
                        openTitle={t('friends.openTheirTrip')}
                        actions={[]}
                      />
                      {showing && <FriendTripPanel planId={ft.tripPlanId} />}
                    </div>
                  );
                })}
              </div>
            </SavedSection>
          )}

          {/* ── Day plans: lighter commitments, lighter cards. ── */}
          <SavedSection
            title={t('saved.dayPlans')}
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
                  const url = resolveImage({
                    ids: (sp.stops || []).map((s) => s.destinationId),
                    cities: dayPlanCities(sp),
                    countries: dayPlanCountries(sp),
                  });
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
        </>
      )}

      {tab === 'visited' && (
        <>
          {/* ── The map of the record: every country you finished a trip in
              painted, every city in it pinned. It belongs here and nowhere
              else, a map of plans would be a map of intentions. ── */}
          {pastCount > 0 && (
            <div className="panel-section saved-section saved-map-section">
              <div className="saved-map">
                <Suspense fallback={<div className="saved-map-loading" aria-hidden="true" />}>
                  <SavedTripMap
                    stops={visitedItems}
                    countryFills={visitedIso}
                    showRoute={false}
                    scrollZoom
                    cooperativeGestures
                    zoomControls
                    mapLocale={mapLocale}
                    photoZoom={6}
                    easeToSelected={false}
                    padBottom={0}
                    fitMaxZoom={7}
                    fitPadding={{ top: 24, left: 24, right: 24, bottom: 24 }}
                    onSelectStop={(i) => visitedItems[i]?.open()}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* ── The ledger, once there is a record to add up. Day plans are
              local-first, so the record works signed out too. ── */}
          {pastCount > 0 && (
            <div className="panel-section saved-section">
              <TravelLedger
                visitedCountries={visited.countries}
                visitedCities={visited.cities}
              />
            </div>
          )}

          {/* ── The record: finished trips file themselves, newest first. ── */}
          <SavedSection
            title={t('saved.travelRecord')}
            count={pastCount}
            big
            action={(
              <button
                className={`saved-add-past${pastOpen ? ' is-open' : ''}`}
                onClick={() => (pastOpen ? (setPastOpen(false), setPastEdit(null)) : openPastForm(null))}
                aria-expanded={pastOpen}
              >
                <PlusIcon size={13} />
                {t('saved.addPastTrip')}
              </button>
            )}
          >
            {/* Trips taken before Carta, or booked somewhere else, are told
                here rather than left out of the record. */}
            {pastOpen && (
              <PastTripForm
                friends={friends}
                key={pastEdit?.id || 'new'}
                destinations={destinations}
                todayIso={todayIso}
                busy={pastBusy}
                error={pastError}
                initial={pastEdit}
                onCancel={() => { setPastOpen(false); setPastEdit(null); }}
                onSave={handleSavePastTrip}
              />
            )}
            {pastCount === 0 && !pastOpen ? (
              <SavedEmpty
                Icon={CheckIcon}
                text={t('saved.pastEmpty')}
                cta={t('saved.addPastTrip')}
                onCta={() => openPastForm(null)}
              />
            ) : pastCount === 0 ? null : (
              <div className="saved-card-stack">
                {pastRecord.map((row) => {
                  if (row.kind === 'plan') {
                    const p = row.item;
                    const parts = journeyParts(p);
                    const mem = memories[p.id];
                    const showing = openMemory === p.id;
                    return (
                      <div className="saved-record-row" key={`p${p.id}`}>
                        <JourneyCard
                          visited
                          title={parts.title}
                          sub={parts.sub}
                          countries={parts.countries}
                          // Your own photograph outranks the catalogue's: it is
                          // the one picture of this trip that was actually there.
                          img={coverPhoto(mem)
                            || resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries })}
                          dateLabel={t('saved.visitedLabel')}
                          dates={p.start_date ? `${fmtDate(p.start_date)} → ${fmtDateYear(p.end_date)}` : ''}
                          onOpen={mem
                            ? () => setOpenMemory(showing ? '' : p.id)
                            : () => onLoadTripPlan && onLoadTripPlan(p.id)}
                          openTitle={mem ? t('saved.pastSeeTrip') : t('saved.openTripPlan')}
                          actions={[
                            mem && {
                              key: 'memory',
                              label: t('saved.pastEditTrip'),
                              icon: <PencilIcon size={14} />,
                              onClick: () => openPastForm(editableFromPlan(p, mem)),
                            },
                            {
                              key: 'edit',
                              label: mem ? t('saved.openTripPlanner') : t('saved.edit'),
                              icon: <RouteIcon size={14} />,
                              onClick: () => onLoadTripPlan && onLoadTripPlan({ id: p.id, edit: true }),
                            },
                            shareAction(p.id),
                          ].filter(Boolean)}
                          footer={mem ? {
                            label: memoryLine(mem),
                            title: t('saved.pastSeeTrip'),
                            onClick: () => setOpenMemory(showing ? '' : p.id),
                          } : null}
                          onDelete={() => handleDeleteTripPlan(p.id)}
                          deleteLabel={t('saved.removeItem', { name: p.label || t('saved.fallbackTrip') })}
                        />
                        {showing && mem && (
                          <TripMemoryView memory={mem} onEdit={() => openPastForm(editableFromPlan(p, mem))} />
                        )}
                        {sharePanelFor(p.id)}
                      </div>
                    );
                  }
                  const sp = row.item;
                  const parts = dayJourneyParts(sp);
                  const mem = memories[sp.id];
                  const showing = openMemory === sp.id;
                  return (
                    <div className="saved-record-row" key={`d${sp.id}`}>
                      <JourneyCard
                        visited
                        title={parts.title}
                        sub={parts.sub}
                        countries={parts.countries}
                        img={coverPhoto(mem) || resolveImage({
                          ids: (sp.stops || []).map((s) => s.destinationId),
                          cities: dayPlanCities(sp),
                          countries: parts.countries,
                        })}
                        dateLabel={t('saved.visitedLabel')}
                        dates={sp.startDate ? `${fmtDate(sp.startDate)} → ${fmtDateYear(dayPlanEndDate(sp))}` : ''}
                        onOpen={mem
                          ? () => setOpenMemory(showing ? '' : sp.id)
                          : () => onOpenDayPlan && onOpenDayPlan(sp.id)}
                        openTitle={mem ? t('saved.pastSeeTrip') : t('saved.openDayPlan')}
                        actions={mem ? [{
                          key: 'memory',
                          label: t('saved.pastEditTrip'),
                          icon: <PencilIcon size={14} />,
                          onClick: () => openPastForm(editableFromDayPlan(sp, mem)),
                        }] : []}
                        footer={mem ? {
                          label: memoryLine(mem),
                          title: t('saved.pastSeeTrip'),
                          onClick: () => setOpenMemory(showing ? '' : sp.id),
                        } : null}
                        onDelete={() => {
                          clearMemory(sp.id);
                          setMemTick((n) => n + 1);
                          setDayPlans(deleteStandalonePlan(sp.id));
                        }}
                        deleteLabel={t('saved.removeItem', { name: sp.label || t('saved.fallbackDayPlan') })}
                      />
                      {showing && mem && (
                        <TripMemoryView memory={mem} onEdit={() => openPastForm(editableFromDayPlan(sp, mem))} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SavedSection>
        </>
      )}
    </div>
  );
}
