import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { fetchSavedTrips, deleteTrip } from './tripStorage.js';
import { fetchTripPlans, deleteTripPlan } from './tripPlanStorage.js';
import {
  loadStandalonePlans, deleteStandalonePlan, loadAssignments, subscribeDayPlanStore,
  loadTripExtras, persistTripExtras,
} from '../planner/dayPlanStore.js';
import { CalendarIcon, BookmarkIcon, CheckIcon, RouteIcon, LinkIcon } from '../components/Icons.jsx';
import { TileGroup, Tile, Chip, Button } from '../components/ui/index.js';
import { loadDeviceTrip, clearDeviceTrip } from '../planner/deviceTripStore.js';
import { PastTripForm } from './PastTripForm.jsx';
import { TripMemoryView } from './TripMemoryView.jsx';
import {
  savePastTripToAccount, savePastTripOnDevice, pastTripAsPlanRow, defaultPastLabel,
  updatePastTripInAccount, updatePastTripOnDevice,
} from './pastTrip.js';
import {
  loadMemory, saveMemory, clearMemory, coverPhoto, memoryPoints, spendSummary, SPEND_CATS,
} from './pastTripMemory.js';
import { COUNTRY_ISO2 } from '../components/CountryFlag.jsx';
import { crewLabel, crewInitials, namedCrew, readCrew, writeCrew, MAX_CREW } from './tripCrew.js';
import { TripSharePanel } from './TripSharePanel.jsx';
import { ModerationNotice } from './ModerationNotice.jsx';
import { fetchMyStatements, contestStatement, latestByPlan } from './moderation.js';
import { fetchFriendLinks, listFriendTrips } from './friends.js';
import { ownersOf } from './useFriendTrips.js';
import { formatMoney } from '../lib/money.js';
import { countryName } from '../lib/countryName.js';
import { useI18n } from '../i18n/index.jsx';
import { activeLocale } from '../lib/localeState.js';
import { useFavoriteItems } from '../hooks/useFavoriteItems.js';
import { FAV_KINDS, parseFavKey } from '../lib/favorites.js';
import { E2E_SEAMS } from '../lib/e2eSeams.js';
import { DayPrice } from '../browse/ExploreCards.jsx';
import '../styles/70-mytrips.css';
import { InstallHint } from './InstallHint.jsx';
import {
  localToday, addDaysIso, classifyTrips, whenParts, dayPlanEndDate, orderedUnique,
  nightsBetween, tripFigure, visitedRecord, yearOf, deviceTripAsPlan,
} from '../lib/myTrips.js';
import { useVisitedCountries, toggleVisitedCountry } from '../lib/visitedCountries.js';
import { UNDO_MS, UndoToast, CrewBar, TripPrice, whenText } from './mytrips/parts.jsx';
import { SiteFooter } from '../components/SiteFooter.jsx';
import {
  TripsTab, ShortlistTab, ShortlistFilters, VisitedTab, YearFilter, VisitedCountriesSheet,
} from './mytrips/MyTripsTabs.jsx';

/**
 * My trips (T434). Three tabs, one page:
 *   Trips      the next trip as the focal card with what it costs the party
 *              now, the weather, the days planned and who is going; later
 *              trips, drafts and day plans as rows.
 *   Shortlist  everything starred anywhere, priced as Explore prices it, with
 *              a kind and an order filter and "Plan a trip" from it.
 *   Visited    the record: a map, the figures it adds up to, the countries
 *              (with the ones marked by hand), the trips by year.
 *
 * This file keeps the state, the data and the undo; the tabs and cards are
 * drawn in ./mytrips/. Dates decide what is upcoming and what is past
 * (lib/myTrips.js); nobody files anything.
 */

// How many individual days of a trip plan have Day planner picks on this
// device (assignments = { stopIdx: { dayIdx: [activityIdx...] } }).
function countPlannedDays(planId) {
  const a = loadAssignments(planId);
  return Object.values(a || {}).reduce(
    (n, days) => n + Object.values(days || {}).filter((l) => Array.isArray(l) && l.length).length,
    0,
  );
}

// ?savedmock verify seam: fixture rows stand in for the Supabase tables so
// the account-only shapes render in headless checks. Never on in production.
const SAVED_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('savedmock');
const MOCK_FAVS = [
  { id: 'mf1', destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', depart_date: addDaysIso(34), return_date: addDaysIso(38), created_at: addDaysIso(-12) },
  { id: 'mf2', destination_id: 'OPO', city: 'Porto', country: 'Portugal', depart_date: addDaysIso(62), return_date: addDaysIso(65), created_at: addDaysIso(-30) },
  { id: 'mf3', destination_id: 'gem:bruges', city: 'Bruges', country: 'Belgium', created_at: addDaysIso(-45) },
];
const MOCK_FRIEND_TRIPS = [
  { ownerId: 'u-sofie', ownerHandle: 'sofie_v', ownerName: 'Sofie Vermeulen', tripPlanId: 'ft1', label: 'Two weeks in Portugal', startDate: addDaysIso(-90), endDate: addDaysIso(-80), cities: ['Lisbon', 'Porto'], countries: ['Portugal'], destinationIds: ['LIS', 'OPO'] },
  { ownerId: 'u-sofie', ownerHandle: 'sofie_v', ownerName: 'Sofie Vermeulen', tripPlanId: 'ft2', label: 'Alpine summer', startDate: addDaysIso(-200), endDate: addDaysIso(-193), cities: ['Innsbruck'], countries: ['Austria'], destinationIds: ['INN'] },
  { ownerId: 'u-jonas', ownerHandle: 'jonas', ownerName: 'Jonas Peeters', tripPlanId: 'ft3', label: 'A week in Rome', startDate: addDaysIso(-150), endDate: addDaysIso(-143), cities: ['Rome'], countries: ['Italy'], destinationIds: ['FCO'] },
];
const MOCK_STATEMENTS = [
  { id: 1, plan_id: 'mp1', plan_label: 'Lisbon and Porto', source: 'notice', notice_count: 2, facts: 'The guide copies a chapter of a published travel book word for word.', automated: false, created_at: addDaysIso(-3), contest_until: addDaysIso(180), complaint_status: 'none', complaint_note: null, reinstated: false, ground: 'terms', ground_ref: 'c6' },
];
// Stops carry their own windows so the seam can price the trips the way a
// real account's rows are priced (choices on the first stop, T434).
const mockStops = (list) => list.map(([id, a, b]) => ({ destination_id: id, city: '', country: '', arrive_date: addDaysIso(a), depart_date: addDaysIso(b) }));
const MOCK_PLANS = [
  { id: 'mp1', label: null, cities: ['Lisbon', 'Porto'], countries: ['Portugal'], start_date: addDaysIso(21), end_date: addDaysIso(27), destination_ids: ['LIS', 'OPO'], stops: mockStops([['LIS', 21, 24], ['OPO', 24, 27]]), choices: { groupSize: 2 } },
  { id: 'mp2', label: 'Autumn in Flanders', cities: ['Bruges'], countries: ['Belgium'], start_date: addDaysIso(-40), end_date: addDaysIso(-35), destination_ids: ['gem:bruges'] },
  { id: 'mp3', label: null, cities: ['Salzburg'], countries: ['Austria'], start_date: addDaysIso(-380), end_date: addDaysIso(-377), destination_ids: ['SZG'] },
  { id: 'mp4', label: null, cities: ['Munich'], countries: ['Germany'], start_date: addDaysIso(-9), end_date: addDaysIso(-7), destination_ids: ['MUC'] },
  { id: 'mp5', label: null, cities: ['Ljubljana'], countries: ['Slovenia'], start_date: addDaysIso(75), end_date: addDaysIso(79), destination_ids: [] },
];

const MAP_PAD = { top: 24, left: 24, right: 24, bottom: 24 };
const TAB_KEY = 'carta.savedTripsTab';
const SORT_KEY = 'carta.mytrips.sort';
const readStored = (key, allowed, fallback) => {
  try { const v = localStorage.getItem(key); return allowed.includes(v) ? v : fallback; } catch { return fallback; }
};
const writeStored = (key, v) => { try { localStorage.setItem(key, v); } catch { /* private mode */ } };

export function SavedTripsPanel({
  data, onLoadTripPlan, onOpenAuth, onOpenDayPlan, onGoToTab,
  favorites = null, onToggleFav = null, onOpenFeature = null, onOpenDest = null,
  // The day-cost map Explore prints from, and the Lifestyle the trip planner
  // prices with, so every figure here is the figure there.
  costs = null, stayTier = 'home', lifestyle = null,
  onOpenFriends = null, onPlanTripCountry = null, onOpenDeviceTrip = null,
  // T659: Plan's "Add a past trip" opens My trips on the past-trip form.
  startWithPast = false, onPastStarted = null,
}) {
  const { user, configured } = useAuth();
  const { t, lang } = useI18n();
  const destinations = useMemo(() => data?.destinations || {}, [data]);
  const todayIso = localToday();

  const [tab, setTab] = useState(() => readStored(TAB_KEY, ['favorites', 'planned', 'visited'], 'planned'));
  const pickedRef = useRef(false);
  const pickTab = (v) => { pickedRef.current = true; setTab(v); writeStored(TAB_KEY, v); };

  const authed = !!user || SAVED_MOCK;
  const [trips, setTrips] = useState(SAVED_MOCK ? MOCK_FAVS : []);
  const [loading, setLoading] = useState(!!user && !SAVED_MOCK);
  const [tripPlans, setTripPlans] = useState(SAVED_MOCK ? MOCK_PLANS : []);
  const [tripPlansLoading, setTripPlansLoading] = useState(!!user && !SAVED_MOCK);
  // A list that cannot be read is not a traveller with no trips (020 lesson).
  const [tripPlansError, setTripPlansError] = useState('');
  const [statements, setStatements] = useState(SAVED_MOCK ? MOCK_STATEMENTS : []);
  const [dayPlans, setDayPlans] = useState(() => loadStandalonePlans());
  // The one trip kept on this device without an account (T500, carta.
  // deviceTrip.v1), read once per opening of My trips (T503, owner T500-a).
  const [deviceStored, setDeviceStored] = useState(() => (SAVED_MOCK ? null : loadDeviceTrip()));
  const devicePlan = useMemo(() => deviceTripAsPlan(deviceStored, destinations), [deviceStored, destinations]);
  useEffect(() => subscribeDayPlanStore(({ remote }) => {
    if (remote) setDayPlans(loadStandalonePlans());
  }), []);

  const loadTrips = () => {
    setLoading(true);
    fetchSavedTrips(user.id).then(setTrips).catch(() => {}).finally(() => setLoading(false));
  };
  const loadTripPlans = () => {
    setTripPlansLoading(true);
    setTripPlansError('');
    fetchTripPlans(user.id)
      .then((rows) => { setTripPlans(rows); setTripPlansError(''); })
      .catch((e) => {
        console.error('trip plans failed to load', e);
        setTripPlans([]);
        setTripPlansError(t('saved.errLoad'));
      })
      .finally(() => setTripPlansLoading(false));
  };
  const loadStatements = () => {
    fetchMyStatements().then(setStatements).catch((e) => console.error('statements of reasons failed to load', e));
  };
  useEffect(() => {
    if (!user || SAVED_MOCK) { setLoading(false); setTripPlansLoading(false); return; }
    loadTrips();
    loadTripPlans();
    loadStatements();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed on the account id; the loaders are rebuilt each render

  const handleDelete = async (id) => {
    setTrips((prev) => prev.filter((x) => x.id !== id));
    if (SAVED_MOCK) return;
    try { await deleteTrip(id); } catch { loadTrips(); }
  };

  // ── A trip that already happened, told by hand. ──
  const [pastOpen, setPastOpen] = useState(false);
  const [pastEdit, setPastEdit] = useState(null);
  const [pastBusy, setPastBusy] = useState(false);
  const [pastError, setPastError] = useState('');
  const [memTick, setMemTick] = useState(0);
  const [openMemory, setOpenMemory] = useState('');
  const [openShare, setOpenShare] = useState('');
  const [friends, setFriends] = useState([]);
  const [friendTrips, setFriendTrips] = useState(SAVED_MOCK ? MOCK_FRIEND_TRIPS : []);
  const [visById, setVisById] = useState({});
  const [mapFull, setMapFull] = useState(false);
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState(() => readStored(SORT_KEY, ['recent', 'cheap'], 'recent'));
  const pickSort = (v) => { setSort(v); writeStored(SORT_KEY, v); };
  const [year, setYear] = useState('all');
  const [countriesOpen, setCountriesOpen] = useState(false);
  const countriesRef = useRef(null);
  const manualCountries = useVisitedCountries();

  // ── Undo, not confirm: a removal hides the thing at once and is held for six
  // seconds behind one toast; only then does `commit` run. ──
  const [undo, setUndo] = useState(null);
  const undoRef = useRef(null);
  const flushUndo = useCallback(() => {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    window.clearTimeout(u.timer);
    setUndo(null);
    u.commit?.();
  }, []);
  const removeWithUndo = useCallback(({ key, label, commit, restore }) => {
    flushUndo();
    const timer = window.setTimeout(flushUndo, UNDO_MS);
    undoRef.current = { key, commit, restore, timer };
    setUndo({ key, label });
  }, [flushUndo]);
  const undoRemoval = () => {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    window.clearTimeout(u.timer);
    setUndo(null);
    u.restore?.();
  };
  useEffect(() => {
    window.addEventListener('pagehide', flushUndo);
    return () => { window.removeEventListener('pagehide', flushUndo); flushUndo(); };
  }, [flushUndo]);
  const heldKey = undo?.key || '';

  useEffect(() => {
    if (SAVED_MOCK) return undefined;
    if (!user) { setFriends([]); setFriendTrips([]); return undefined; }
    let live = true;
    fetchFriendLinks(user.id).then((rows) => { if (live) setFriends(rows.filter((r) => r.kind === 'friend')); }).catch(() => {});
    listFriendTrips().then((rows) => { if (live) setFriendTrips(rows); }).catch(() => {});
    return () => { live = false; };
  }, [user]);

  // Escape leaves the full-screen map first, in the capture phase, so one
  // press does not also close the page behind it.
  useEffect(() => {
    if (!mapFull) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setMapFull(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mapFull]);

  const spendLabels = useMemo(
    () => Object.fromEntries(SPEND_CATS.map((c) => [c, t(`saved.pastSpend_${c}`)])),
    [t],
  );
  const openPastForm = (initial) => { setPastError(''); setPastEdit(initial || null); setPastOpen(true); };
  useEffect(() => {
    if (!startWithPast) return;
    // The form lives on the Visited tab.
    pickTab('visited');
    openPastForm(null);
    onPastStarted && onPastStarted();
  }, [startWithPast]); // eslint-disable-line react-hooks/exhaustive-deps -- a one-shot hand-off from Plan

  const handleSavePastTrip = async (form) => {
    const payload = { ...form, label: form.label || defaultPastLabel(form.places) };
    const editId = pastEdit?.id || null;
    setPastBusy(true);
    setPastError('');
    try {
      let planId = editId;
      if (SAVED_MOCK) {
        planId = editId || `mock:${Date.now()}`;
        setTripPlans((prev) => [pastTripAsPlanRow(planId, payload), ...prev.filter((p) => p.id !== planId)]);
      } else if (pastEdit?.local) {
        updatePastTripOnDevice(editId, payload);
        setDayPlans(loadStandalonePlans());
      } else if (editId && user) {
        await updatePastTripInAccount(user.id, editId, payload);
        setTripPlans((prev) => prev.map((p) => (p.id === editId ? pastTripAsPlanRow(editId, payload) : p)));
      } else if (user) {
        planId = await savePastTripToAccount(user.id, payload);
        setTripPlans((prev) => [pastTripAsPlanRow(planId, payload), ...prev]);
      } else {
        const saved = savePastTripOnDevice(payload);
        planId = saved.id;
        setDayPlans(saved.plans);
      }
      if (payload.memory) saveMemory(planId, { ...payload.memory, places: payload.memory.places }, spendLabels);
      setMemTick((n) => n + 1);
      setPastOpen(false);
      setPastEdit(null);
    } catch {
      setPastError(t('saved.pastSaveFailed'));
    } finally {
      setPastBusy(false);
    }
  };

  const handleDeleteTripPlan = async (id) => {
    setTripPlans((prev) => prev.filter((p) => p.id !== id));
    clearMemory(id);
    setMemTick((n) => n + 1);
    if (SAVED_MOCK) return;
    try { await deleteTripPlan(id); } catch { loadTripPlans(); }
  };

  const fmtDay = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString(activeLocale(), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
  const fmtDate = (s) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
  const fmtRange = (a, b) => {
    if (!a) return '';
    if (!b || a === b) return fmtDay(a);
    return t('saved.dateRange', { from: fmtDay(a), to: fmtDay(b) });
  };

  // ── What is on show: the lists without the one removal Undo holds. ──
  const shownPlans = useMemo(
    () => (devicePlan ? [...tripPlans, devicePlan] : tripPlans).filter((p) => `plan:${p.id}` !== heldKey),
    [tripPlans, devicePlan, heldKey],
  );
  const shownDayPlans = useMemo(() => dayPlans.filter((sp) => `day:${sp.id}` !== heldKey), [dayPlans, heldKey]);
  const shownTrips = useMemo(() => trips.filter((x) => `fav:${x.id}` !== heldKey), [trips, heldKey]);
  const { upcomingPlans, pastPlans, upcomingDayPlans, pastDayPlans } = useMemo(
    () => classifyTrips({ plans: shownPlans, dayPlans: shownDayPlans, todayIso }),
    [shownPlans, shownDayPlans, todayIso],
  );

  const memories = useMemo(() => {
    const out = {};
    [...pastPlans.map((p) => p.id), ...pastDayPlans.map((sp) => sp.id)].forEach((id) => {
      const m = loadMemory(id);
      if (m) out[id] = m;
    });
    return out;
  }, [pastPlans, pastDayPlans, memTick]); // eslint-disable-line react-hooks/exhaustive-deps -- memTick re-reads localStorage

  const destCoords = useCallback((id) => {
    const d = destinations[id];
    if (!d) return null;
    const lat = d.city_lat != null ? d.city_lat : d.lat;
    const lon = d.city_lon != null ? d.city_lon : d.lon;
    return lat != null && lon != null ? { lat, lon } : null;
  }, [destinations]);

  // Images: a stop's own photo, then any catalogue entry in the same city,
  // then the best-rated photo of the same country.
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
  const resolveImage = useCallback(({ ids = [], cities = [], countries = [] }) => {
    for (const id of ids) { const u = destinations[id]?.image?.url; if (u) return u; }
    for (const c of cities) { const hit = imageLookup.byCity.get((c || '').toLowerCase()); if (hit) return hit.url; }
    for (const c of countries) { const hit = imageLookup.byCountry.get(c); if (hit) return hit.url; }
    return null;
  }, [destinations, imageLookup]);

  const planCountries = useCallback((p) => orderedUnique([
    ...(p.countries || []), ...(p.destination_ids || []).map((id) => destinations[id]?.country),
  ]), [destinations]);
  const planCities = useCallback((p) => orderedUnique([
    ...(p.cities || []), ...(p.destination_ids || []).map((id) => destinations[id]?.city),
  ]), [destinations]);
  const dayPlanCountries = useCallback((sp) => orderedUnique((sp.stops || []).map((s) => destinations[s.destinationId]?.country)), [destinations]);
  const dayPlanCities = useCallback((sp) => orderedUnique((sp.stops || []).map((s) => destinations[s.destinationId]?.city)), [destinations]);

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
  const cityCoords = useCallback((city) => cityCoordIndex.get((city || '').toLowerCase()) || null, [cityCoordIndex]);

  // The trip's headline: the country when it stays in one, else its label or route.
  const journeyParts = useCallback((p) => {
    const countries = planCountries(p);
    const cities = planCities(p);
    if (p.label) return { title: p.label, sub: cities.join(', '), countries };
    if (countries.length === 1) return { title: countryName(COUNTRY_ISO2[countries[0]], countries[0]), sub: cities.join(', '), countries };
    const cs = p.cities || [];
    const title = cs.length > 1 ? t('saved.routeTitle', { from: cs[0], to: cs[cs.length - 1] }) : (cs[0] || t('saved.untitledTrip'));
    return { title, sub: countries.map((c) => countryName(COUNTRY_ISO2[c], c)).join(', '), countries };
  }, [planCountries, planCities, t]);
  const dayJourneyParts = useCallback((sp) => {
    const countries = dayPlanCountries(sp);
    const cities = dayPlanCities(sp);
    if (sp.label && countries.length !== 1) return { title: sp.label, sub: cities.join(', '), countries };
    if (countries.length === 1) return { title: countryName(COUNTRY_ISO2[countries[0]], countries[0]), sub: cities.join(', ') || sp.label, countries };
    return { title: sp.label || t('saved.dayPlanFallbackTitle'), sub: cities.join(', '), countries };
  }, [dayPlanCountries, dayPlanCities, t]);

  const memoryLine = (m) => {
    const spend = spendSummary(m);
    return [
      crewLabel(m.crew, lang),
      m.rating != null ? t('saved.pastRatedN', { n: m.rating }) : '',
      spend.any ? formatMoney(spend.total) : '',
      m.photos?.length ? t(m.photos.length === 1 ? 'saved.pastPhotos1' : 'saved.pastPhotosN', { n: m.photos.length }) : '',
    ].filter(Boolean).join(', ');
  };

  // ── Who came, editable from the record (the same list the ledger splits by). ──
  const crewFor = (planId) => { const extras = loadTripExtras(planId); return readCrew(extras, { memory: extras.memory }); };
  const writeCrewFor = (planId, next) => { persistTripExtras(planId, writeCrew(loadTripExtras(planId), next)); setMemTick((n) => n + 1); };
  const crewBarFor = (planId) => (
    <CrewBar
      crew={crewFor(planId)}
      friends={friends}
      onAdd={(member) => {
        const cur = crewFor(planId);
        if (namedCrew(cur).length >= MAX_CREW) return;
        writeCrewFor(planId, [...cur, member]);
      }}
      onRemove={(i) => {
        const before = crewFor(planId);
        const name = before[i]?.name?.trim() || '';
        writeCrewFor(planId, before.filter((_, j) => j !== i));
        removeWithUndo({ key: `crew:${planId}:${before[i]?.id}`, label: name, restore: () => writeCrewFor(planId, before) });
      }}
    />
  );

  const statementByPlan = useMemo(() => latestByPlan(statements), [statements]);
  const statementFor = (planId) => (statementByPlan[planId] ? (
    <ModerationNotice
      statement={statementByPlan[planId]}
      contest={SAVED_MOCK ? async () => ({ ok: true, status: 'open' }) : contestStatement}
      onContested={SAVED_MOCK ? undefined : loadStatements}
    />
  ) : null);
  const sharePanelFor = (planId, title) => (openShare === planId && user ? (
    <TripSharePanel
      userId={user.id}
      tripPlanId={planId}
      title={title}
      visibility={visById[planId] || tripPlans.find((tp) => tp.id === planId)?.visibility || 'private'}
      onVisibility={(id, v) => setVisById((cur) => ({ ...cur, [id]: v }))}
      canInvite={!tripPlans.find((tp) => tp.id === planId)?.coplan}
    />
  ) : null);
  const toggleShare = (planId) => {
    if (!user && !SAVED_MOCK) { onOpenAuth?.(); return; }
    const opening = openShare !== planId;
    setOpenShare(opening ? planId : '');
    // The panel opens under the card: bring it into view and give it focus,
    // so a phone user is not left looking at a button that did nothing.
    if (opening) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.getElementById(`tshare-${planId}`);
        el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        el?.focus({ preventScroll: true });
      }));
    }
  };

  // ── Trips: view models for the focal card and the rows. ──
  const priceFor = useCallback((p) => tripFigure(p, { data, stayTier, lifestyle }), [data, stayTier, lifestyle]);
  const isoFor = (countries) => COUNTRY_ISO2[countries?.[0]] || '';

  // Browser storage is read once per plan list and per edit, never per render
  // (T434 audit, P1-2): days planned on this device and who is coming.
  const planLocal = useMemo(() => {
    const out = {};
    upcomingPlans.forEach((p) => {
      out[p.id] = {
        planned: countPlannedDays(p.id),
        crew: crewInitials(crewFor(p.id), MAX_CREW).map((c) => ({ id: c.id, name: c.name, initials: c.initials })),
      };
    });
    return out;
  }, [upcomingPlans, memTick]); // eslint-disable-line react-hooks/exhaustive-deps -- memTick re-reads storage after an edit
  const figures = useMemo(() => {
    const out = {};
    upcomingPlans.forEach((p) => { out[p.id] = priceFor(p); });
    return out;
  }, [upcomingPlans, priceFor]);

  const planModel = (p, i) => {
    const parts = journeyParts(p);
    const nights = nightsBetween(p.start_date, p.end_date);
    const { planned, crew } = planLocal[p.id] || { planned: 0, crew: [] };
    const when = whenParts(p.start_date, p.end_date, todayIso);
    const figure = figures[p.id] || null;
    const removeLabel = t('saved.removeItem', { name: parts.title });
    // The trip on this device says where it is kept; signing in is offered
    // only as the way to have it on a second device (T503, owner T500-a).
    const device = !!p.device;
    const onRemove = p.coplan ? null : device
      ? () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => { clearDeviceTrip(); setDeviceStored(null); } })
      : () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => handleDeleteTripPlan(p.id) });
    const below = device ? (
      <p className="mt-device-line">
        <span>{t(!user && configured ? 'saved.deviceLine' : 'saved.deviceLineShort')}</span>
        {!user && configured && (
          <Button variant="quiet" size="sm" onClick={onOpenAuth}>{t('saved.signIn')}</Button>
        )}
      </p>
    ) : <>{statementFor(p.id)}{sharePanelFor(p.id, parts.title)}</>;
    const common = {
      id: p.id,
      title: parts.title,
      img: resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      onOpen: device ? () => onOpenDeviceTrip?.() : () => onLoadTripPlan?.(p.id),
      onRemove,
      removeLabel,
      below,
    };
    if (i === 0) {
      return {
        ...common,
        sub: parts.sub,
        countries: parts.countries,
        when,
        dates: fmtRange(p.start_date, p.end_date),
        nights,
        figure,
        dest: destinations[(p.destination_ids || [])[0]] || null,
        start: p.start_date,
        planned,
        // A trip of six nights is seven days to plan.
        days: Math.max(nights + 1, planned),
        people: crew,
        party: figure?.party || null,
        coplanBy: p.coplan ? (p.ownerName || '') : '',
        // A day plan and a share link belong to a trip in an account; the
        // device trip opens in Plan, where its days begin.
        onPlanDays: device ? null : () => onOpenDayPlan?.({ planId: p.id, stopIndex: 0, dayIndex: 0 }),
        onInvite: p.coplan || device ? null : () => toggleShare(p.id),
        inviteOpen: openShare === p.id,
      };
    }
    return {
      ...common,
      meta: [whenText(t, when), fmtRange(p.start_date, p.end_date)].filter(Boolean).join(', '),
      figure: figure ? <TripPrice figure={figure} /> : <span className="mt-muted">{t('saved.factNoPrice')}</span>,
      menuActions: device ? [] : [
        { key: 'days', label: t('saved.planDays'), icon: <CalendarIcon size={16} />, onClick: () => onOpenDayPlan?.({ planId: p.id, stopIndex: 0, dayIndex: 0 }) },
        ...(p.coplan ? [] : [{ key: 'share', label: t('saved.shareInvite'), icon: <LinkIcon size={16} />, onClick: () => toggleShare(p.id) }]),
      ],
    };
  };

  const dayPlanMeta = (sp) => {
    const total = sp.stops?.reduce((n, s) => n + (s.days || 1), 0) || 1;
    return [
      sp.startDate ? fmtDay(sp.startDate) : t('saved.noDatesYet'),
      t(total === 1 ? 'saved.days1' : 'saved.daysN', { n: total }),
    ].join(', ');
  };
  const dayPlanModel = (sp) => {
    const parts = dayJourneyParts(sp);
    const first = (sp.stops || [])[0]?.destinationId;
    const cost = first ? costs?.get?.(first) : null;
    const label = sp.label || t('saved.fallbackDayPlan');
    return {
      id: sp.id,
      title: sp.label || parts.title,
      img: resolveImage({ ids: (sp.stops || []).map((s) => s.destinationId), cities: dayPlanCities(sp), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      meta: dayPlanMeta(sp),
      figure: cost ? <DayPrice cost={cost} t={t} /> : null,
      onOpen: () => onOpenDayPlan?.(sp.id),
      onRemove: () => removeWithUndo({ key: `day:${sp.id}`, label, commit: () => setDayPlans(deleteStandalonePlan(sp.id)) }),
      removeLabel: t('saved.removeItem', { name: label }),
    };
  };

  const nextModel = upcomingPlans.length ? planModel(upcomingPlans[0], 0) : null;
  const laterModels = upcomingPlans.slice(1).map((p, i) => planModel(p, i + 1));
  const dayModels = upcomingDayPlans.map(dayPlanModel);

  // ── Shortlist: the starred things and the account's saved places, one list. ──
  const shortlist = useFavoriteItems(favorites, destinations);
  const favOrder = useMemo(() => {
    const m = new Map();
    [...(favorites || [])].forEach((k, i) => m.set(k, i));
    return m;
  }, [favorites]);
  const shortRows = useMemo(() => {
    const rows = shortlist.sections.flatMap((s) => s.rows)
      .filter((r) => `star:${r.key}` !== heldKey)
      .map((r) => ({ ...r, order: favOrder.get(r.key) ?? -1 }));
    const destIds = new Set(rows.filter((r) => r.kind === 'dest').map((r) => r.id));
    if (authed) {
      shownTrips.filter((x) => !destIds.has(x.destination_id)).forEach((x) => {
        rows.push({
          key: `acct:${x.id}`, account: x, kind: 'dest', id: x.destination_id,
          cc: COUNTRY_ISO2[x.country] || destinations[x.destination_id]?.iso2 || '',
          name: x.city, sub: x.country,
          img: resolveImage({ ids: [x.destination_id], cities: [x.city], countries: [x.country] }),
          order: -1 - new Date(x.created_at || 0).getTime() / 1e13,
        });
      });
    }
    return rows;
  }, [shortlist.sections, favOrder, heldKey, authed, shownTrips, destinations, resolveImage]);
  const kinds = useMemo(() => FAV_KINDS.filter((k) => shortRows.some((r) => r.kind === k)), [shortRows]);
  const kindNow = kinds.includes(kind) ? kind : 'all';
  const shownShort = useMemo(() => {
    const list = shortRows.filter((r) => kindNow === 'all' || r.kind === kindNow);
    const dayEur = (r) => (r.kind === 'dest' ? costs?.get?.(r.id)?.dayEur : null);
    return list.sort((a, b) => {
      if (sort === 'cheap') {
        const x = dayEur(a); const y = dayEur(b);
        if (x != null || y != null) return (x ?? Infinity) - (y ?? Infinity);
      }
      return b.order - a.order;
    });
  }, [shortRows, kindNow, sort, costs]);
  // "Plan a trip" from the shortlist: the country holding the most starred
  // places, handed to the trip wizard's Where step (the same seed a
  // destination page's "Plan a trip here" uses).
  const planCountry = useMemo(() => {
    const by = new Map();
    shortRows.filter((r) => r.kind === 'dest' && r.cc).forEach((r) => by.set(r.cc, (by.get(r.cc) || 0) + 1));
    let best = null;
    by.forEach((n, cc) => { if (!best || n > best.n) best = { cc, n }; });
    return best;
  }, [shortRows]);
  const planCountryName = planCountry
    ? (Object.entries(COUNTRY_ISO2).find(([, iso]) => iso === planCountry.cc)?.[0] || '')
    : '';
  const openShortlisted = (row) => {
    if (row.kind === 'dest') { onOpenDest?.(row.id); return; }
    onOpenFeature?.(row.kind, { id: row.id, cc: row.cc });
  };
  const dropShortlisted = (row) => {
    if (row.account) {
      removeWithUndo({ key: `fav:${row.account.id}`, label: row.name, commit: () => handleDelete(row.account.id) });
      return;
    }
    const parsed = parseFavKey(row.key);
    if (!parsed) return;
    onToggleFav?.(parsed.id, parsed.kind, parsed.cc);
    removeWithUndo({ key: `star:${row.key}`, label: row.name || row.id, restore: () => onToggleFav?.(parsed.id, parsed.kind, parsed.cc) });
  };

  // ── Visited: years, the record and the map, filtered by the chosen year. ──
  const pastYear = (p) => yearOf(p.end_date || p.start_date);
  const dayYear = (sp) => yearOf(dayPlanEndDate(sp));
  const years = useMemo(() => {
    const ys = new Set([...pastPlans.map(pastYear), ...pastDayPlans.map(dayYear)].filter(Boolean));
    return [...ys].sort((a, b) => b - a);
  }, [pastPlans, pastDayPlans]); // eslint-disable-line react-hooks/exhaustive-deps -- the year helpers are pure
  const yearNow = years.includes(year) ? year : 'all';
  const inYear = (y) => yearNow === 'all' || y === yearNow;
  const yPlans = useMemo(() => pastPlans.filter((p) => inYear(pastYear(p))), [pastPlans, yearNow]); // eslint-disable-line react-hooks/exhaustive-deps
  const yDays = useMemo(() => pastDayPlans.filter((sp) => inYear(dayYear(sp))), [pastDayPlans, yearNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only the chosen year's memories count towards the chosen year.
  const yMemories = useMemo(() => {
    const ids = new Set([...yPlans.map((p) => p.id), ...yDays.map((sp) => sp.id)]);
    return Object.fromEntries(Object.entries(memories).filter(([id]) => ids.has(id)));
  }, [memories, yPlans, yDays]);
  const record = useMemo(() => visitedRecord({
    pastPlans: yPlans, pastDayPlans: yDays, memories: yMemories, destinations,
    manualCountries: yearNow === 'all' ? manualCountries : [],
  }), [yPlans, yDays, yMemories, destinations, manualCountries, yearNow]);
  const allRecord = useMemo(() => visitedRecord({ pastPlans, pastDayPlans, memories, destinations }), [pastPlans, pastDayPlans, memories, destinations]);

  const visitedItems = useMemo(() => {
    const out = [];
    const seen = new Set();
    const add = (city, at, open, id) => {
      if (!at) return;
      const key = (city || '').toLowerCase() || `${at.lat},${at.lon}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ lat: at.lat, lon: at.lon, city: city || '', plain: true, img: resolveImage({ ids: id ? [id] : [], cities: [city] }), open });
    };
    yPlans.forEach((p) => {
      const open = () => setOpenMemory((cur) => (cur === p.id ? '' : p.id));
      (p.destination_ids || []).forEach((id) => add(destinations[id]?.city, destCoords(id), open, id));
      (p.cities || []).forEach((c) => add(c, cityCoords(c), open));
      memoryPoints(memories[p.id]).forEach((pt) => add(pt.city, pt, open, pt.id));
    });
    yDays.forEach((sp) => {
      const open = () => setOpenMemory((cur) => (cur === sp.id ? '' : sp.id));
      (sp.stops || []).forEach((s) => add(destinations[s.destinationId]?.city, destCoords(s.destinationId), open, s.destinationId));
      memoryPoints(memories[sp.id]).forEach((pt) => add(pt.city, pt, open, pt.id));
    });
    return out;
  }, [yPlans, yDays, destinations, memories, resolveImage, destCoords, cityCoords]);

  const mapLocale = useMemo(() => ({
    'CooperativeGesturesHandler.WindowsHelpText': t('map.ctrlZoom'),
    'CooperativeGesturesHandler.MacHelpText': t('map.cmdZoom'),
    'CooperativeGesturesHandler.MobileHelpText': t('map.twoFingers'),
  }), [t]);
  const visitedIso = useMemo(() => record.countries.map((c) => COUNTRY_ISO2[c]).filter(Boolean), [record]);
  // One object per change of the record, never per render: TripMap re-frames
  // and re-pins whenever its props change identity (T434 audit, P1-1).
  const mapProps = useMemo(() => ({
    stops: visitedItems,
    countryFills: visitedIso,
    basemap: 'record',
    showRoute: false,
    scrollZoom: true,
    zoomControls: true,
    mapLocale,
    photoZoom: 6,
    easeToSelected: false,
    padBottom: 0,
    fitMaxZoom: 7,
    fitPadding: MAP_PAD,
    onSelectStop: (i) => { setMapFull(false); visitedItems[i]?.open(); },
  }), [visitedItems, visitedIso, mapLocale]);

  const placesFromPlan = (p) => (p.cities || []).map((city, i) => ({
    id: (p.destination_ids || [])[i] || null, city,
    country: destinations[(p.destination_ids || [])[i]]?.country || '', lat: null, lon: null, nights: null,
  }));
  const editableFromPlan = (p, mem) => ({
    id: p.id, label: p.label || '', startDate: p.start_date, endDate: p.end_date,
    places: mem?.places?.length ? mem.places : placesFromPlan(p), memory: mem,
  });
  const editableFromDayPlan = (sp, mem) => ({
    id: sp.id, local: true, label: sp.label || '', startDate: sp.startDate, endDate: dayPlanEndDate(sp),
    places: mem?.places?.length ? mem.places : (sp.stops || []).map((s) => ({
      id: destinations[s.destinationId] ? s.destinationId : null,
      city: destinations[s.destinationId]?.city || s.city || '',
      country: destinations[s.destinationId]?.country || s.country || '',
      lat: s.lat ?? null, lon: s.lon ?? null, nights: null,
    })),
    memory: mem,
  });

  const recordGroups = useMemo(() => {
    const rows = [
      ...yPlans.map((p) => ({ kind: 'plan', when: p.end_date, item: p })),
      ...yDays.map((sp) => ({ kind: 'day', when: dayPlanEndDate(sp), item: sp })),
    ].sort((a, b) => (a.when < b.when ? 1 : -1));
    const groups = [];
    rows.forEach((r) => {
      const y = yearOf(r.when);
      let g = groups.find((x) => x.year === y);
      if (!g) { g = { year: y, items: [] }; groups.push(g); }
      g.items.push(r);
    });
    return groups;
  }, [yPlans, yDays]);

  const recordRow = (row) => {
    if (row.kind === 'plan') {
      const p = row.item;
      const parts = journeyParts(p);
      const mem = memories[p.id];
      const showing = openMemory === p.id;
      const line = mem ? memoryLine(mem) : '';
      return {
        id: `p${p.id}`,
        title: parts.title,
        img: coverPhoto(mem) || resolveImage({ ids: p.destination_ids || [], cities: planCities(p), countries: parts.countries }),
        iso2: isoFor(parts.countries),
        meta: [parts.sub, fmtRange(p.start_date, p.end_date), line].filter(Boolean).join(', '),
        onOpen: mem ? () => setOpenMemory(showing ? '' : p.id) : () => onLoadTripPlan?.(p.id),
        menuActions: [
          { key: 'edit', label: t('saved.openTripPlanner'), icon: <RouteIcon size={16} />, onClick: () => onLoadTripPlan?.({ id: p.id, edit: true }) },
          ...(user || SAVED_MOCK ? [{ key: 'share', label: t('saved.shareTrip'), icon: <LinkIcon size={16} />, onClick: () => toggleShare(p.id) }] : []),
        ],
        onRemove: () => removeWithUndo({ key: `plan:${p.id}`, label: parts.title, commit: () => handleDeleteTripPlan(p.id) }),
        removeLabel: t('saved.removeItem', { name: parts.title }),
        below: (
          <>
            {showing && mem && <TripMemoryView memory={mem} onEdit={() => openPastForm(editableFromPlan(p, mem))} />}
            {showing && crewBarFor(p.id)}
            {statementFor(p.id)}
            {sharePanelFor(p.id, parts.title)}
          </>
        ),
      };
    }
    const sp = row.item;
    const parts = dayJourneyParts(sp);
    const mem = memories[sp.id];
    const showing = openMemory === sp.id;
    const line = mem ? memoryLine(mem) : '';
    return {
      id: `d${sp.id}`,
      title: parts.title,
      img: coverPhoto(mem) || resolveImage({ ids: (sp.stops || []).map((s) => s.destinationId), cities: dayPlanCities(sp), countries: parts.countries }),
      iso2: isoFor(parts.countries),
      meta: [parts.sub, fmtRange(sp.startDate, dayPlanEndDate(sp)), line].filter(Boolean).join(', '),
      onOpen: mem ? () => setOpenMemory(showing ? '' : sp.id) : () => onOpenDayPlan?.(sp.id),
      onRemove: () => removeWithUndo({
        key: `day:${sp.id}`,
        label: parts.title,
        commit: () => { clearMemory(sp.id); setMemTick((n) => n + 1); setDayPlans(deleteStandalonePlan(sp.id)); },
      }),
      removeLabel: t('saved.removeItem', { name: parts.title }),
      below: showing && mem ? (
        <>
          <TripMemoryView memory={mem} onEdit={() => openPastForm(editableFromDayPlan(sp, mem))} />
          {crewBarFor(sp.id)}
        </>
      ) : null,
    };
  };
  const groups = recordGroups.map((g) => ({ year: g.year, rows: g.items.map(recordRow) }));

  const plannedCount = upcomingPlans.length + upcomingDayPlans.length;
  const pastCount = pastPlans.length + pastDayPlans.length;

  // Land on Trips once a trip ahead is known, unless a tab was picked this visit.
  useEffect(() => {
    if (!pickedRef.current && plannedCount > 0 && tab !== 'planned') setTab('planned');
  }, [plannedCount]); // eslint-disable-line react-hooks/exhaustive-deps -- runs when the plans arrive

  const TABS = [
    { key: 'planned', Icon: CalendarIcon, label: t('saved.tabTrips'), n: plannedCount },
    { key: 'favorites', Icon: BookmarkIcon, label: t('saved.tabFavorites'), n: shortRows.length },
    { key: 'visited', Icon: CheckIcon, label: t('saved.tabVisited'), n: pastCount },
  ];
  const renderTabs = (cls) => (
    <TileGroup label={t('saved.title')} kind="tabs" columns={1} className={cls}>
      {TABS.map(({ key, Icon, label, n }) => (
        <Tile
          key={key}
          kind="tab"
          selected={tab === key}
          icon={<Icon size={20} />}
          aria-controls="mytrips-panel"
          onClick={() => pickTab(key)}
        >
          {label}
          {n > 0 && <Chip kind="count" className="mt-tab-n">{n}</Chip>}
        </Tile>
      ))}
    </TileGroup>
  );

  const shortFilters = (compact) => (
    <ShortlistFilters kinds={kinds} kind={kindNow} onKind={setKind} sort={sort} onSort={pickSort} compact={compact} />
  );
  const yearFilter = (compact) => <YearFilter years={years} year={yearNow} onYear={setYear} compact={compact} />;
  const sideFilters = tab === 'favorites' && shortRows.length > 0 ? shortFilters(false)
    : tab === 'visited' ? yearFilter(false) : null;
  const phoneFilters = tab === 'favorites' && shortRows.length > 1 ? shortFilters(true)
    : tab === 'visited' && years.length > 1 ? yearFilter(true) : null;

  const pastForm = pastOpen ? (
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
  ) : null;

  return (
    <div className="saved-shell mytrips">
      <aside className="side-panel saved-side" aria-label={t('saved.title')}>
        <div className="side-block">
          <span className="mt-filter-label">{t('saved.showLabel')}</span>
          {renderTabs('mt-tiles is-side')}
        </div>
        {sideFilters && <div className="side-block mt-side-filters">{sideFilters}</div>}
      </aside>

      <div className="panel open account-panel saved-trips-panel">
        <div className="panel-header saved-panel-header">
          <h1 className="saved-title">{t('saved.title')}</h1>
          {renderTabs('mt-tiles is-top')}
          {phoneFilters && <div className="mt-refine">{phoneFilters}</div>}
        </div>

        <InstallHint hasSavedTrip={trips.length > 0 || tripPlans.length > 0 || dayPlans.length > 0 || !!devicePlan} />

        <div className="mt-panel" id="mytrips-panel" role="tabpanel" aria-labelledby="mytrips-panel-title">
          {/* The section's name as the page's h2, for the heading outline; the
              tile above already shows it. */}
          <h2 className="sr-only" id="mytrips-panel-title">{TABS.find((x) => x.key === tab)?.label}</h2>
          {tab === 'planned' && (
            <TripsTab
              authed={authed}
              configured={configured}
              loading={tripPlansLoading}
              error={tripPlansError}
              onRetry={loadTripPlans}
              next={nextModel}
              later={laterModels}
              dayPlans={dayModels}
              friendsShared={friendTrips.length}
              friendFaces={ownersOf(friendTrips)}
              onOpenFriends={onOpenFriends}
              onPlanTrip={() => onGoToTab?.('trip')}
              onSignIn={onOpenAuth}
              signInLine={!devicePlan}
              todayIso={todayIso}
            />
          )}
          {tab === 'favorites' && (
            <ShortlistTab
              rows={shownShort}
              showKind={kinds.length > 1 && kindNow === 'all'}
              costs={costs}
              loading={shortlist.loading || (authed && loading)}
              onOpen={openShortlisted}
              onRemove={dropShortlisted}
              planCountryName={planCountryName}
              onPlanTrip={onPlanTripCountry && planCountry ? () => onPlanTripCountry(planCountry.cc) : null}
              onBrowse={() => onGoToTab?.('places')}
            />
          )}
          {tab === 'visited' && (
            <VisitedTab
              record={record}
              mapProps={mapProps}
              hasMap={visitedItems.length > 0 || visitedIso.length > 0}
              mapFull={mapFull}
              onMapFull={setMapFull}
              groups={groups}
              pastForm={pastForm}
              onAddPast={() => openPastForm(null)}
              error={tripPlansError}
              onEditCountries={() => setCountriesOpen(true)}
              countriesRef={countriesRef}
            />
          )}
        </div>

        {countriesOpen && (
          <VisitedCountriesSheet
            fromTrips={allRecord.fromTrips}
            manual={manualCountries}
            onToggle={(c) => toggleVisitedCountry(c)}
            onClose={() => { setCountriesOpen(false); countriesRef.current?.focus(); }}
          />
        )}
        {undo && <UndoToast key={undo.key} label={undo.label} onUndo={undoRemoval} onClose={flushUndo} />}
        <SiteFooter />
      </div>
    </div>
  );
}
