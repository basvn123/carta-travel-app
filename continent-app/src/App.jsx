import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import { AppHeader } from './components/AppHeader.jsx';
import { CategoryRail } from './browse/CategoryRail.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { AnnouncementBar } from './components/AnnouncementBar.jsx';
import { MaintenanceGate } from './components/MaintenanceGate.jsx';
import { ExploreTab } from './browse/ExploreTab.jsx';
import { ExplorePanel } from './browse/ExplorePanel.jsx';
import { LifestylePanel } from './browse/LifestylePanel.jsx';
import { DestinationsTab } from './browse/DestinationsTab.jsx';
import Logo from './components/Logo.jsx';

// A failed dynamic import is almost always a stale bundle: the client is still
// running an old index.html whose chunk hashes no longer exist on the server
// (common on mobile Safari / installed PWAs after a redeploy). Safari reports
// this as "Importing a module script failed." Rather than surface that as a
// crash, force one hard reload to fetch the fresh manifest, guarding against a
// reload loop so a genuinely-broken chunk still eventually shows the error.
const CHUNK_RELOAD_KEY = 'continent.chunkReloaded.v1';
function lazyWithReload(factory) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try { window.sessionStorage.removeItem(CHUNK_RELOAD_KEY); } catch {}
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try { alreadyReloaded = !!window.sessionStorage.getItem(CHUNK_RELOAD_KEY); } catch {}
      if (!alreadyReloaded) {
        try { window.sessionStorage.setItem(CHUNK_RELOAD_KEY, '1'); } catch {}
        window.location.reload();
        // Never resolve: keep the Suspense fallback up until the reload lands,
        // so React doesn't render the error state in the meantime.
        return new Promise(() => {});
      }
      throw err;
    }
  });
}

// Code-split the two planner tabs (maplibre-gl rides along with them), so the
// first paint only ships the browse UI shell. The Explore tab itself no
// longer mounts a map at all.
const TripPlannerTab = lazyWithReload(() => import('./planner/TripPlannerTab.jsx').then((m) => ({ default: m.TripPlannerTab })));
const DayPlannerTab = lazyWithReload(() => import('./planner/DayPlannerTab.jsx').then((m) => ({ default: m.DayPlannerTab })));
// The back office. Lazy because it ships to one account in the whole user
// base, and every traveller would otherwise pay for its bytes.
const AdminPage = lazyWithReload(() => import('./admin/AdminPage.jsx').then((m) => ({ default: m.AdminPage })));

// A quiet placeholder while a lazy chunk downloads (fast; usually one frame).
function TabFallback() {
  return <div className="loading-screen"><div className="pulse" /></div>;
}
import { tripDaysBetween, DEFAULT_LIFESTYLE } from './lib/runtime_pricing.js';
import { computeCosts } from './lib/costIndex.js';
import { loadInitialState } from './lib/urlState.js';
import { readTripShareFromUrl, decodeTripShare } from './lib/shareLink.js';
import { readShareTokenFromUrl, stripShareTokenFromUrl } from './auth/tripShares.js';
import { readFriendHandleFromUrl, stripFriendHandleFromUrl } from './auth/friends.js';
import { readTrailFromUrl } from './lib/trails.js';
import { readBeachFromUrl } from './lib/beaches.js';
import { readLakeFromUrl } from './lib/lakes.js';
import { readMountainFromUrl } from './lib/mountains.js';
import { readTripFromUrl } from './lib/trips.js';
import { loadTripDraft } from './planner/tripDraftStore.js';
import { bindDayPlanCloud } from './planner/dayPlanSync.js';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { I18nProvider, useI18n } from './i18n/index.jsx';
import { AuthModal } from './auth/AuthModal.jsx';
import { AuthGate } from './auth/AuthGate.jsx';
import { SharedTripView } from './auth/SharedTripView.jsx';
import { ResetPasswordScreen } from './auth/ResetPasswordScreen.jsx';
import { AccountPanel } from './auth/AccountPanel.jsx';
import { SavedTripsPanel } from './auth/SavedTripsPanel.jsx';
import { PassModal } from './components/PassModal.jsx';
import { useEntitlement } from './hooks/useEntitlement.js';
import { originHome } from './lib/origins.js';
import { useAppData } from './hooks/useAppData.js';
import { useDestinationSearch } from './hooks/useDestinationSearch.js';
import { useAccountSync } from './hooks/useAccountSync.js';
import { useUrlSync } from './hooks/useUrlSync.js';
import { usePanelState } from './hooks/usePanelState.js';
import { useFilterState } from './hooks/useFilterState.js';
import { useReach } from './lib/reach.js';

// Once someone picks "continue without an account" on the entry gate, don't
// ask again on this device, only a fresh sign-in should bring accounts back.
const GUEST_KEY = 'continent.guestMode.v1';

// The pass picker, reachable from chrome (the header's "See pricing" and the
// account panel) rather than only from a spent allowance. Mounted only while
// open so the ai_status read happens when somebody actually looks at prices,
// not on every app load.
function GlobalPassModal({ signedIn, onClose, onSignIn }) {
  const entitlement = useEntitlement();
  return (
    <PassModal
      entitlement={entitlement}
      reason=""
      signedIn={signedIn}
      onClose={onClose}
      onSignIn={onSignIn}
    />
  );
}


export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        {/* Inside AuthProvider because the gate lets admins through, and it
            cannot know who is asking before the session resolves. */}
        <MaintenanceGate>
          <TravelApp />
        </MaintenanceGate>
      </AuthProvider>
    </I18nProvider>
  );
}

function TravelApp() {
  const { t } = useI18n();
  const {
    configured: authConfigured, user, recoveryMode,
    loading: authLoading, emailConfirmed, dismissEmailConfirmed,
  } = useAuth();
  // State carried in the URL / localStorage (shareable + survives reload).
  const [init] = useState(() => loadInitialState());

  // Grouped UI state (see usePanelState / useFilterState).
  const {
    authModalOpen, setAuthModalOpen,
    authModalMode, setAuthModalMode, accountOpen, setAccountOpen,
    savedTripsOpen, setSavedTripsOpen, lifestyleOpen, setLifestyleOpen,
  } = usePanelState();
  const {
    priceMode, setPriceMode, countryFilter, setCountryFilter,
    tripKinds, setTripKinds, ratingRange, setRatingRange, gemOnly, setGemOnly,
    unescoOnly, setUnescoOnly, topBeachOnly, setTopBeachOnly,
    bigOnly, setBigOnly,
    topPick, setTopPick, reachHours, setReachHours,
    sortKey, setSortKey, showFavOnly, setShowFavOnly,
  } = useFilterState(init);

  // Whether this visitor has already dismissed the entry gate as a guest.
  // Signing in overrides it automatically since `user` then takes priority.
  const [guestMode, setGuestMode] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(GUEST_KEY) === '1'
  );
  // The pass picker, opened from the header or the account panel.
  const [passOpen, setPassOpen] = useState(false);
  // Which spoke the account panel opens on. The header's Friends button is
  // its own door into the same panel, so it says where to land. The nonce
  // remounts the panel on every such open: initialView only seeds state, so
  // without it a second press while the panel already stands open would do
  // nothing at all.
  const [adminOpen, setAdminOpen] = useState(false);
  const [accountView, setAccountView] = useState('home');
  const [accountEntry, setAccountEntry] = useState(0);
  // Somebody's invite link (#friend=<handle>). Read once at startup, like
  // every other hash this app answers, and stripped from the bar right away.
  const [pendingFriend, setPendingFriend] = useState(() => readFriendHandleFromUrl());
  useEffect(() => {
    if (pendingFriend) stripFriendHandleFromUrl();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // An invite opens the friends page as soon as there is an account to open
  // it for. A guest lands on the account hub instead, which is where signing
  // in is, and the handle waits: dropping it would waste the one tap the
  // sender was trying to save.
  useEffect(() => {
    if (!pendingFriend) return;
    setSavedTripsOpen(false);
    setAccountView(user ? 'friends' : 'home');
    setAccountEntry((n) => n + 1);
    setAccountOpen(true);
  }, [pendingFriend, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const openAccountAt = (view) => {
    setSavedTripsOpen(false);
    setAccountView(view);
    setAccountEntry((n) => n + 1);
    setAccountOpen(true);
  };
  // Shown before any data/route decisions: sign in, create an account, or
  // continue as a guest. Skipped entirely when accounts aren't configured,
  // once already signed in, or once guest mode has been chosen before.
  const showGate = authConfigured && !authLoading && !user && !recoveryMode && !guestMode;

  // Day plans shadow to the account whenever someone is signed in (and fall
  // back to local-only for guests). Keyed on the id, not the user object,
  // so token refreshes with a fresh object don't re-run the merge.
  const dayPlanUserId = authConfigured && user ? user.id : null;
  useEffect(() => { bindDayPlanCloud(dayPlanUserId); }, [dayPlanUserId]);

  // A deliberate sign-out should bring the gate back (they may want to switch
  // accounts) rather than silently falling through to the guest bypass they
  // chose before they ever had an account.
  const prevUserRef = useRef(null);
  useEffect(() => {
    if (prevUserRef.current && !user) {
      localStorage.removeItem(GUEST_KEY);
      setGuestMode(false);
    }
    prevUserRef.current = user;
  }, [user]);

  // Which top-level section is showing: Destinations (the catalogue +
  // published trips), Map (the browse/search experience), Trip planner, or
  // Day planner. EVERY visit opens on Destinations, first or fiftieth: there
  // is no marketing front page in front of the app any more, so the first
  // thing anybody sees is real places. (The localStorage mirror's remembered
  // tab is deliberately ignored.)
  // A query string, though, means the view was shared or reloaded, so it
  // decides which tab opens. The encoder omits `tab` for the map (it is the
  // URL's implicit default), so a link carrying filters but no tab is a map
  // link. Links from the old front page (`tab=home`) land on Destinations,
  // which is what replaced it.
  const urlTab = typeof window !== 'undefined' && !!window.location.search
    ? (init.activeTab === 'home' ? 'places'
      : (['map', 'places', 'trip', 'day'].includes(init.activeTab) ? init.activeTab : 'map'))
    : null;
  const [activeTab, setActiveTab] = useState(urlTab || 'places');

  const [selectedId, setSelectedId] = useState(init.selectedId ?? null);

  // Pick any depart date and any return date. Trip length (nights) is derived
  // and synced into choices.trip_days for components that read it.
  const [departDate, setDepartDate] = useState(init.departDate ?? null);
  const [returnDate, setReturnDate] = useState(init.returnDate ?? null);

  const [choices, setChoices] = useState({
    group_size: init.group_size ?? 7,
    trip_days: 7,
    baggage_key: init.baggage_key ?? 'priority_10kg',
    baggage_per_direction_eur: 25,
    transport_mode: init.transport_mode ?? 'plane',  // 'plane' | 'car' (car only for trips <= max_drive_km)
    // How expensive to sleep: 'dorm'|'private'|'home'|'hotel3'|'hotel4'|'hotel5'.
    // Home (entire place) is the classic anchor; the rest price from measured
    // city tiers where they exist and honestly fall back where they don't.
    stay_tier: init.stay_tier ?? 'home',
    origin: init.origin ?? null,   // departure airport IATA; defaulted from data on load
    // Where a DRIVE starts: { name, lat, lon }, named by the traveller. Car
    // mode prices nothing until this is set, so a road trip is never quietly
    // costed from the departure airport (see needsDriveHome).
    drive_home: init.drive_home ?? null,
    lifestyle: { ...DEFAULT_LIFESTYLE, ...(init.lifestyle || {}) },
  });

  // Shortlist (favorites) + list controls, also persisted in the URL.
  const [favorites, setFavorites] = useState(() => new Set(init.favorites || []));

  // Planner tabs mount on first visit and then stay alive (hidden) so a quick
  // look at another tab never wipes an in-progress plan.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['map', urlTab || 'places']));
  useEffect(() => {
    setVisitedTabs((prev) => (prev.has(activeTab) ? prev : new Set([...prev, activeTab])));
  }, [activeTab]);
  // A day plan chosen from the Saved-trips overview: handed to DayPlannerTab,
  // which opens it and then clears this again.
  const [pendingDayPlanId, setPendingDayPlanId] = useState(null);
  // Same idea for a multi-stop trip plan chosen from the Saved-trips overview,
  // handed to TripPlannerTab.
  const [pendingTripPlanId, setPendingTripPlanId] = useState(null);
  // A shared link (URL query present at load) always wins over a signed-in
  // user's synced settings, so opening someone's link never gets silently
  // overridden by your own saved preferences.
  const [cameFromUrl] = useState(() => typeof window !== 'undefined' && !!window.location.search);

  // A whole TRIP shared as a link (see lib/shareLink.js): the hash payload is
  // captured synchronously before useUrlSync's first URL write would drop it,
  // decoded async, then offered in a confirm dialog rather than silently
  // replacing whatever plan is already in the recipient's planner.
  // A SAVED trip shared by token (#shared=<uuid>, see auth/tripShares.js).
  // Unlike #trip=, the payload is not in the link: the token is fetched
  // through get_shared_trip, which is what lets the owner withdraw it and what
  // keeps the ledger and the booking references out of the reader's hands.
  // Read once at startup for the same reason the trip hash is, and stripped
  // from the address bar right away so a reload does not reopen it.
  const [shareToken, setShareToken] = useState(() => readShareTokenFromUrl());
  useEffect(() => {
    if (shareToken) stripShareTokenFromUrl();
    // Once only: stripping the hash must not be able to re-trigger the read.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [sharedTripRaw] = useState(() => readTripShareFromUrl());
  const [sharedTrip, setSharedTrip] = useState(null);
  const [pendingSharedTrip, setPendingSharedTrip] = useState(null);
  useEffect(() => {
    if (!sharedTripRaw) return undefined;
    let live = true;
    decodeTripShare(sharedTripRaw).then((d) => { if (live && d) setSharedTrip(d); });
    return () => { live = false; };
  }, [sharedTripRaw]);

  // A single TRAIL shared as a link (#trail=63478&tc=AL, see lib/trailExport.js):
  // read once at startup and handed to the Destinations tab, which loads that
  // country's published trips and opens the trail's own page. The hash carries
  // nothing else, so the recipient's saved dates, origin and lifestyle survive
  // opening someone else's trail.
  const [pendingTrail, setPendingTrail] = useState(() => readTrailFromUrl());
  useEffect(() => {
    if (pendingTrail) setActiveTab('places');
  }, [pendingTrail]);

  // A single BEACH shared as a link (#beach=gr-navagio-Q1234&bc=GR, see
  // lib/beaches.js), read the same way and for the same reasons: the hash
  // carries nothing else, so opening someone else's beach leaves the
  // recipient's own dates, origin and lifestyle exactly where they were.
  const [pendingBeach, setPendingBeach] = useState(() => readBeachFromUrl());
  useEffect(() => {
    if (pendingBeach) setActiveTab('places');
  }, [pendingBeach]);

  // And a single LAKE (#lake=si-lake-bled-Q207302&lc=SI, see lib/lakes.js).
  // Same hash, same reasons.
  const [pendingLake, setPendingLake] = useState(() => readLakeFromUrl());
  useEffect(() => {
    if (pendingLake) setActiveTab('places');
  }, [pendingLake]);

  // And a single MOUNTAIN (#mtn=ch-matterhorn-Q1090&mc=CH, lib/mountains.js).
  const [pendingMountain, setPendingMountain] = useState(() => readMountainFromUrl());
  useEffect(() => {
    if (pendingMountain) setActiveTab('places');
  }, [pendingMountain]);

  // A shared TRIP link (#itin=at-salzburg-vienna-chain-5d, see lib/trips.js),
  // read once at startup and handed to the Destinations tab, exactly like a
  // shared trail, beach, lake or mountain. The hash carries nothing else, so
  // opening someone else's itinerary leaves the recipient's own dates, origin
  // and lifestyle where they were.
  const [pendingTrip, setPendingTrip] = useState(() => readTripFromUrl());
  useEffect(() => {
    if (pendingTrip) setActiveTab('places');
  }, [pendingTrip]);

  // A published itinerary handed to the trip planner, where every stop, night
  // and date stays editable. It goes in through the same door a shared trip
  // uses, so the planner needs no new code path for it.
  const openTripInPlanner = useCallback((trip) => {
    const stops = (trip.stops || [])
      .map((st) => ({ destinationId: st.dest, nights: st.nights, activities: [] }))
      .filter((st) => st.destinationId && st.nights);
    if (!stops.length) return;
    setPendingSharedTrip({
      stops,
      label: trip.name || '',
      transportPref: trip.transport === 'car' ? 'owncar' : 'public',
    });
    setActiveTab('trip');
  }, []);

  // Stable identity: this lands on every Explore card, so a fresh function
  // per render would defeat the card's React.memo.
  const toggleFav = useCallback((id) => setFavorites((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  // Sync trip_days into choices whenever the dates change
  useEffect(() => {
    const days = tripDaysBetween(departDate, returnDate);
    if (days > 0 && days !== choices.trip_days) {
      setChoices((prev) => ({ ...prev, trip_days: days }));
    }
  }, [departDate, returnDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Free-text location search (city / country). Ephemeral, not persisted in the
  // URL, and applied to the filtered set so the list AND map narrow together.
  const [locationQuery, setLocationQuery] = useState('');
  // Debounced for the actual filter/map pipeline so every keystroke doesn't
  // force the grid to reconcile hundreds of cards; the input stays instant since
  // it reads `locationQuery`, not this.
  const [debouncedLocationQuery, setDebouncedLocationQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLocationQuery(locationQuery), 180);
    return () => clearTimeout(t);
  }, [locationQuery]);


  // Escape closes the top-most dismissable surface (the shared-trip offer,
  // then Account / My trips, then the destination detail). Gives keyboard
  // users a way out that the click-outside backdrop alone never provided, and
  // it is the exit those two slide-overs rely on now that their cross is
  // desktop-only.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (sharedTrip) { setSharedTrip(null); return; }
      if (accountOpen) { setAccountOpen(false); return; }
      if (savedTripsOpen) { setSavedTripsOpen(false); return; }
      if (selectedId) { setSelectedId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sharedTrip, accountOpen, savedTripsOpen, selectedId]);

  // Stable so every Explore card's memo survives parent re-renders.
  const openDetail = useCallback((id) => {
    setSelectedId(id);
  }, []);

  // Fetch app_data.json, apply its defaults into `choices`, and derive the
  // fare-date bounds used to default/clamp the depart & return pickers.
  const { data, error, dateBounds } = useAppData(init, setChoices, departDate, setDepartDate, returnDate, setReturnDate, choices.origin);

  // Change the departure airport, reprices the whole app from the new origin,
  // and moves the drive-comparison's home to that airport so plane and car both
  // depart from the same place (no stale "fly from X but drive from Brussels").
  // Declared after `data` is available so the callback can read meta.origins.
  const setOrigin = useCallback((code) => setChoices((prev) => ({
    ...prev,
    origin: code,
    home: originHome(data, code) ?? prev.home,
  })), [data]);

  // The town a road trip sets off from ({ name, lat, lon } from the geocoder,
  // or null to ask again). Without it the engine cannot cost a drive at all,
  // so this is the one answer that empties the map on purpose.
  const setDriveHome = useCallback((point) => {
    setChoices((prev) => ({ ...prev, drive_home: point || null }));
  }, []);

  // Keep --filter-h in sync with the filter bar's real height. The bar uses
  // min-height + wraps its controls; everything below it is positioned at
  // top: var(--filter-h), so measuring the bar keeps the map/panels flush no
  // matter how many rows the filters wrap into. A callback ref (rather than an
  // effect keyed on some other state) so it attaches the instant the node
  // mounts, the loading/gate/data branches above can each be the one that
  // first renders the real filter bar, and only the ref attaching is a
  // reliable signal for that.
  const filterBarRoRef = useRef(null);
  const filterBarRef = useCallback((el) => {
    if (filterBarRoRef.current) {
      filterBarRoRef.current.disconnect();
      filterBarRoRef.current = null;
    }
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      document.documentElement.style.setProperty('--filter-h', `${el.offsetHeight}px`);
      // The category rail's own height, so the header's filter tray can drop
      // clear of it. The tray is trapped inside .app-header (backdrop-filter
      // makes it a stacking context AND a containing block), so it cannot
      // simply be told to sit under the whole bar.
      const rail = el.querySelector('.kind-rail');
      document.documentElement.style.setProperty('--kind-rail-h', `${rail ? rail.offsetHeight : 0}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    filterBarRoRef.current = ro;
  }, []);

  // A reference-stable view of `choices` for pricing: it only changes identity
  // when a field composeTrip actually reads changes. trip_days is display-only
  // (derived from the dates and synced back into choices), so excluding it stops
  // that write from triggering a SECOND full reprice of ~24,800 destinations on
  // every date change, on top of the one the date change itself already causes.
  const pricingChoices = useMemo(
    () => choices,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choices.group_size, choices.baggage_key, choices.baggage_per_direction_eur,
      choices.transport_mode, choices.stay_tier, choices.origin, choices.home, choices.lifestyle,
      choices.origin_pref, choices.car_model, choices.accommodation_model, choices.drive_home],
  );

  // The current origin's travel-time table (public/reach/{IATA}.json), or null
  // when that origin has none. Null keeps the reach filter inert AND tells the
  // filter bar to show its quiet "no data yet" state instead of dead chips.
  const reachMinutes = useReach(choices.origin);

  // Price every destination for the current dates/choices. The Explore tab
  // no longer reads fares at all; this keeps running for the Destinations
  // tab's price chips and the URL contract (priceRange restore).
  const {
    pricedAll, availableCountries, priceRange, setPriceRange, priceBounds,
  } = useDestinationSearch({
    data, departDate, returnDate, choices: pricingChoices,
    locationQuery: debouncedLocationQuery, countryFilter, priceMode, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes,
    initialPriceRange: init.priceRange,
  });

  // Keep the URL + localStorage in sync so the view is shareable and survives a
  // reload (debounced; runs only once data has loaded). See useUrlSync.
  useUrlSync(!!data, {
    departDate, returnDate, choices, priceMode, countryFilter,
    tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick, reachHours, activeTab,
  });

  // Sync a signed-in user's filter/lifestyle preferences with their account,
  // and expose the "save"/"load a saved trip" actions.
  const { handleLoadTrip } = useAccountSync({
    user, cameFromUrl,
    // A departure airport restored from the URL/local mirror must survive the
    // account-settings pull, so a changed "flying from" stays put app-wide.
    hasLocalOrigin: !!init.origin,
    choices, setChoices,
    priceMode, setPriceMode,
    countryFilter, setCountryFilter,
    tripKinds, setTripKinds,
    ratingRange, setRatingRange,
    gemOnly, setGemOnly,
    unescoOnly, setUnescoOnly,
    topBeachOnly, setTopBeachOnly,
    sortKey, setSortKey,
    selectedId, setSelectedId,
    departDate, setDepartDate,
    returnDate, setReturnDate,
    setAccountOpen, setAuthModalOpen,
  });

  const selectedDest = data && selectedId ? data.destinations[selectedId] : null;

  // The Explore page's two price-level indices, computed once per dataset and
  // shared by the grid and the open destination panel.
  // Recomputed whenever the Lifestyle panel changes a stay tier, a party
  // size or a single frequency. That is 3,038 destinations repriced in about
  // 7 ms, which is why there is no loading state anywhere near it: the grid
  // simply renders the new numbers on the next frame.
  const exploreIndices = useMemo(
    () => (data ? computeCosts(data.destinations, choices) : null),
    [data, choices],
  );

  if (recoveryMode) {
    return <ResetPasswordScreen />;
  }

  // A shared trip opens BEFORE the entry gate and before the session resolves,
  // and that ordering is the feature: a share whose first screen asks the
  // reader to sign up does not get opened. The token is the only credential
  // this screen needs, so it never waits on auth.
  if (shareToken) {
    return (
      <SharedTripView
        token={shareToken}
        destinations={data?.destinations}
        onDismiss={() => setShareToken(null)}
      />
    );
  }

  // Resolve whether there's an existing session before deciding whether to
  // show the entry gate, otherwise a returning signed-in user would flash
  // the gate for a moment on every load.
  if (authConfigured && authLoading) {
    return (
      <div className="loading-screen">
        <Logo size={56} />
        <div className="name">Carta</div>
        <div className="sub">{t('shell.tagline')}</div>
        <div className="pulse" />
      </div>
    );
  }

  if (showGate) {
    return (
      <>
        <AuthGate
          onSignIn={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
          onSignUp={() => { setAuthModalMode('signup'); setAuthModalOpen(true); }}
          onGuest={() => {
            localStorage.setItem(GUEST_KEY, '1');
            setGuestMode(true);
          }}
        />
        {authModalOpen && (
          <AuthModal initialMode={authModalMode} onClose={() => setAuthModalOpen(false)} />
        )}
      </>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <Logo size={56} />
        <div className="name">Carta</div>
        <div className="sub">{t('shell.loadErrorHelp')}</div>
        <button className="guide-next" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>
          {t('shell.retry')}
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <Logo size={56} />
        <div className="name">Carta</div>
        <div className="sub">{t('shell.tagline')}</div>
        <div className="pulse" />
      </div>
    );
  }

  return (
    <div className="app" onClick={() => setSelectedId(null)}>
      <div className="top-bar" ref={filterBarRef} onClick={(e) => e.stopPropagation()}>
        <AppHeader
          user={user}
          onOpenAccount={() => openAccountAt('home')}
          onOpenFriends={() => openAccountAt('friends')}
          friendsOpen={accountOpen && accountView === 'friends'}
          onSeePricing={() => setPassOpen(true)}
          onBrandClick={() => { setSavedTripsOpen(false); setActiveTab('places'); }}
          activeTab={activeTab}
          onChangeTab={(key) => { setSavedTripsOpen(false); setActiveTab(key); }}
          savedOpen={savedTripsOpen}
          onToggleSaved={() => { setAccountOpen(false); setSavedTripsOpen((v) => !v); }}
        />

        {/* Trip-kind categories as a full-width scrollable rail under the
            header, Explore tab only. Lives inside .top-bar so the
            ResizeObserver folds its height into --filter-h and the grid stays
            flush below. */}
        {activeTab === 'map' && (
          <CategoryRail tripKinds={tripKinds} setTripKinds={setTripKinds} />
        )}
      </div>

      {/* A trip arrived via share link: offer it, never silently apply it. */}
      {sharedTrip && (
        <div className="guide-overlay" onClick={() => setSharedTrip(null)}>
          <div className="guide-modal share-trip-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="guide-title">{t('share.tripTitle')}</h2>
            <p className="share-trip-name">
              <b>{sharedTrip.label || t('share.aTrip')}</b>
              {', '}
              {sharedTrip.stops.length} {t(sharedTrip.stops.length === 1 ? 'share.stopOne' : 'share.stopMany')}
            </p>
            <p className="fare-notice-text">{t('share.tripBody')}</p>
            {!!(loadTripDraft()?.stops?.length) && (
              <p className="fare-notice-text share-trip-warn">{t('share.replaceWarn')}</p>
            )}
            <div className="share-trip-actions">
              <button
                className="guide-next"
                onClick={() => {
                  setPendingSharedTrip(sharedTrip);
                  setSharedTrip(null);
                  setActiveTab('trip');
                }}
              >
                {t('share.open')}
              </button>
              <button className="share-trip-dismiss" onClick={() => setSharedTrip(null)}>
                {t('share.dismiss')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The Explore tab: the catalogue as a readable grid, no map and no
          fares. Keep-alive like the planners, so scroll position, the open
          panel and the loaded images survive a tab hop. */}
      {visitedTabs.has('map') && (
        <div className={activeTab === 'map' ? undefined : 'tab-keep-hidden'}>
          <div onClick={(e) => e.stopPropagation()}>
            <ExploreTab
              data={data}
              locationQuery={locationQuery}
              setLocationQuery={setLocationQuery}
              countryFilter={countryFilter}
              setCountryFilter={setCountryFilter}
              tripKinds={tripKinds}
              ratingRange={ratingRange}
              setRatingRange={setRatingRange}
              gemOnly={gemOnly}
              setGemOnly={setGemOnly}
              unescoOnly={unescoOnly}
              setUnescoOnly={setUnescoOnly}
              topBeachOnly={topBeachOnly}
              setTopBeachOnly={setTopBeachOnly}
              bigOnly={bigOnly}
              setBigOnly={setBigOnly}
              topPick={topPick}
              setTopPick={setTopPick}
              reachHours={reachHours}
              setReachHours={setReachHours}
              reachAvailable={!!reachMinutes}
              reachMinutes={reachMinutes}
              sortKey={sortKey}
              setSortKey={setSortKey}
              showFavOnly={showFavOnly}
              setShowFavOnly={setShowFavOnly}
              favorites={favorites}
              onToggleFav={toggleFav}
              selectedId={selectedId}
              onSelect={openDetail}
              indices={exploreIndices}
              choices={choices}
              onOpenLifestyle={() => setLifestyleOpen(true)}
              isMock={!!data.meta?.is_mock}
            />
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            <ExplorePanel
              destination={selectedDest}
              data={data}
              indices={exploreIndices}
              choices={choices}
              onOpenLifestyle={() => setLifestyleOpen(true)}
              onClose={() => setSelectedId(null)}
              onSelect={openDetail}
              isFavorite={selectedId ? favorites.has(selectedId) : false}
              onToggleFavorite={selectedId ? () => toggleFav(selectedId) : undefined}
            />
          </div>
        </div>
      )}

      {/* Lifestyle lives outside the tab blocks: where you sleep and how you
          eat price the map, the catalogue and the planners alike, so the panel
          has to open over whichever tab asked for it. */}
      {lifestyleOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          {/* On Explore the panel is a right-hand drawer over a scrim, so the
              grid it reprices stays visible behind it. Everywhere else it
              keeps the left-hand position the map layout was built around. */}
          {activeTab === 'map' && (
            <div className="lifestyle-scrim" onClick={() => setLifestyleOpen(false)} aria-hidden="true" />
          )}
          <LifestylePanel
            side={activeTab === 'map' ? 'right' : 'left'}
            choices={choices}
            setChoices={setChoices}
            onClose={() => setLifestyleOpen(false)}
            data={data}
          />
        </div>
      )}

      {/* The Destinations tab: the catalogue and the published trips as a
          browsable section of their own. Picking a place hands over to the
          map tab, where the detail panel already knows how to price it. */}
      {visitedTabs.has('places') && (
        <div className={activeTab === 'places' ? undefined : 'tab-keep-hidden'} onClick={(e) => e.stopPropagation()}>
          <DestinationsTab
            data={data}
            pricedAll={pricedAll}
            priceMode={priceMode}
            availableCountries={availableCountries}
            onSelectDest={(id) => { setActiveTab('map'); openDetail(id); }}
            stayTier={choices.stay_tier || 'home'}
            onOpenLifestyle={() => setLifestyleOpen(true)}
            origin={choices.origin}
            onChangeOrigin={setOrigin}
            transportMode={choices.transport_mode || 'plane'}
            driveHome={choices.drive_home}
            onChangeDriveHome={setDriveHome}
            openTrail={pendingTrail}
            onOpenTrailConsumed={() => setPendingTrail(null)}
            openBeach={pendingBeach}
            onOpenBeachConsumed={() => setPendingBeach(null)}
            openLake={pendingLake}
            onOpenLakeConsumed={() => setPendingLake(null)}
            openMountain={pendingMountain}
            onOpenMountainConsumed={() => setPendingMountain(null)}
            openTrip={pendingTrip}
            onOpenTripConsumed={() => setPendingTrip(null)}
            onOpenTripInPlanner={openTripInPlanner}
          />
        </div>
      )}

      {/* Planner tabs stay MOUNTED once visited and just hide: a quick hop to
          another tab and back keeps the open plan, picks and scroll intact.
          MapLibre (v4, ResizeObserver) resizes itself when shown again. */}
      {visitedTabs.has('trip') && (
        <div className={activeTab === 'trip' ? undefined : 'tab-keep-hidden'}>
          <Suspense fallback={<TabFallback />}>
            <TripPlannerTab
              data={data}
              user={user}
              authConfigured={authConfigured}
              onRequestAuth={() => setAuthModalOpen(true)}
              openPlanId={pendingTripPlanId}
              onOpenPlanConsumed={() => setPendingTripPlanId(null)}
              openSharedTrip={pendingSharedTrip}
              onSharedTripConsumed={() => setPendingSharedTrip(null)}
              origin={choices.origin}
              onChangeOrigin={setOrigin}
              lifestyle={choices.lifestyle}
              onOpenLifestyle={() => setLifestyleOpen(true)}
              stayTier={choices.stay_tier || 'home'}
              onPlanDay={(target) => {
                setPendingDayPlanId(target); // { planId|null, stopIndex, dayIndex }
                setActiveTab('day');
              }}
            />
          </Suspense>
        </div>
      )}
      {visitedTabs.has('day') && (
        <div className={activeTab === 'day' ? undefined : 'tab-keep-hidden'}>
          <Suspense fallback={<TabFallback />}>
            <DayPlannerTab
              data={data}
              user={user}
              authConfigured={authConfigured}
              openPlanId={pendingDayPlanId}
              onOpenPlanConsumed={() => setPendingDayPlanId(null)}
            />
          </Suspense>
        </div>
      )}

      <div onClick={(e) => e.stopPropagation()}>
        <BottomNav
          activeTab={activeTab}
          onChangeTab={(key) => { setSavedTripsOpen(false); setAccountOpen(false); setActiveTab(key); }}
          savedOpen={savedTripsOpen}
          onToggleSaved={() => { setAccountOpen(false); setSavedTripsOpen((v) => !v); }}
          accountOpen={accountOpen}
          onToggleAccount={() => (accountOpen ? setAccountOpen(false) : openAccountAt('home'))}
        />
      </div>

      {authConfigured && authModalOpen && (
        <AuthModal initialMode={authModalMode} onClose={() => setAuthModalOpen(false)} />
      )}
      {savedTripsOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <SavedTripsPanel
            data={data}
            onClose={() => setSavedTripsOpen(false)}
            onLoadTrip={(trip) => {
              handleLoadTrip(trip);
              setSavedTripsOpen(false);
              setActiveTab('map'); // the loaded trip opens as a map detail panel
            }}
            onOpenAuth={() => { setSavedTripsOpen(false); setAuthModalMode('signin'); setAuthModalOpen(true); }}
            /* An empty shelf offers the tab that fills it, so "nothing here
               yet" comes with somewhere to go. */
            onGoToTab={(key) => { setSavedTripsOpen(false); setActiveTab(key); }}
            onOpenDayPlan={(id) => {
              setSavedTripsOpen(false);
              setPendingDayPlanId(id);
              setActiveTab('day');
            }}
            onLoadTripPlan={(id) => {
              setSavedTripsOpen(false);
              setPendingTripPlanId(id);
              setActiveTab('trip');
            }}
          />
        </div>
      )}
      {accountOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <AccountPanel
            key={accountEntry}
            initialView={accountView}
            onViewChange={setAccountView}
            pendingFriendHandle={pendingFriend}
            destinations={data?.destinations}
            onClose={() => setAccountOpen(false)}
            onOpenAdmin={() => setAdminOpen(true)}
            onOpenAuth={() => { setAccountOpen(false); setAuthModalMode('signin'); setAuthModalOpen(true); }}
          />
        </div>
      )}

      {/* The back office, over everything. It renders only for accounts on
          the admin list, and every call it makes is re-checked server side,
          so this flag is a door rather than a permission. */}
      {adminOpen && (
        <Suspense fallback={<TabFallback />}>
          <div onClick={(e) => e.stopPropagation()}>
            <AdminPage onClose={() => setAdminOpen(false)} />
          </div>
        </Suspense>
      )}

      {passOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <GlobalPassModal
            signedIn={!!user && authConfigured}
            onClose={() => setPassOpen(false)}
            onSignIn={() => {
              setPassOpen(false);
              setAuthModalMode('signin');
              setAuthModalOpen(true);
            }}
          />
        </div>
      )}

      {/* The site notice from site_config, switched on from the admin panel.
          Renders nothing unless one is live, so it costs the layout nothing. */}
      <AnnouncementBar />

      {emailConfirmed && (
        <div className="confirm-toast" role="status" onClick={(e) => e.stopPropagation()}>
          <span className="confirm-toast-check">✓</span>
          {t('toast.emailConfirmed')}
          <button
            className="confirm-toast-close"
            onClick={dismissEmailConfirmed}
            aria-label={t('a11y.dismiss')}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
