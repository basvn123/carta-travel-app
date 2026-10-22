import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import { AppHeader } from './components/AppHeader.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { AnnouncementBar, PassExpiryBanner, BottomSlot } from './components/AnnouncementBar.jsx';
import { SettingsLine, SettingsContext } from './components/SettingsLine.jsx';
import { LoadingBlock } from './components/StateBlocks.jsx';
import { CloseIcon } from './components/Icons.jsx';
import { crossTab } from './lib/sharedElement.js';
import { usePresence, useDialogExit } from './lib/motion.js';
import { useFocusTrap } from './hooks/useFocusTrap.js';
import { readJourneyFromUrl } from './lib/journeys.js';
import { MaintenanceGate } from './components/MaintenanceGate.jsx';
import { ExploreTab } from './browse/ExploreTab.jsx';
import { DestinationPage } from './browse/DestinationPage.jsx';
import { LifestylePanel } from './browse/LifestylePanel.jsx';
import { DestinationsTab } from './browse/DestinationsTab.jsx';
import Logo from './components/Logo.jsx';
// The home page (T462). In the entry bundle, not lazy: it is what a first
// visit paints, and a lazy chunk cost that paint about 1.8 s on a slow
// phone (React suspends and renders the shell twice; T462 report).
import { HomePage } from './browse/home/HomePage.jsx';

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
// The Trip Pass prices, a place with its own address (T496, owner T488-d).
// The page itself is T497's; App only gives it a route.
const PricingPage = lazyWithReload(() => import('./pass/PricingPage.jsx'));

// A quiet placeholder while a lazy chunk downloads or the full catalogue
// arrives. It sits in the tab's own region, between the top bar and the
// bottom nav, so both stay usable while it shows (T381; carta-design
// "Loading"): it used to cover the whole window at z-index 100, which left no
// way to change tab until the chunk landed.
function TabFallback() {
  const { t } = useI18n();
  return (
    <div className="tab-fallback">
      <LoadingBlock label={t('state.loading')} rows={3} shape="card" />
    </div>
  );
}
import { tripDaysBetween, DEFAULT_LIFESTYLE } from './lib/runtime_pricing.js';
import { computeCosts } from './lib/costIndex.js';
import { loadStaysFor, setLiveBase, useStaysVersion } from './lib/staysData.js';
import { FirstRunContext } from './lib/firstRunContext.js';
import {
  loadInitialState, tabHref, routeFromSearch, placeOf, VIEW_KEYS, countryFromHash, countryHash,
} from './lib/urlState.js';
import { usePlaceRows } from './hooks/usePlaceRows.js';
import { countryName as localCountryName } from './lib/countryName.js';
import { PlanStart } from './planner/PlanStart.jsx';
import { PlanAsk } from './planner/PlanAsk.jsx';
import { readFavList, isFav, favDestIds, toggleFav as toggleFavKey } from './lib/favorites.js';
import { readTripShareFromUrl, decodeTripShare, readDayShareFromUrl } from './lib/shareLink.js';
import { readShareTokenFromUrl, stripShareTokenFromUrl } from './auth/tripShares.js';
import { readFriendHandleFromUrl, stripFriendHandleFromUrl } from './auth/friends.js';
import { IconButton } from './components/ui/index.js';
import { readCoplanTokenFromUrl, stripCoplanTokenFromUrl, holdCoplanToken, acceptCoplanLink } from './auth/coplanners.js';
import { readGuideIdFromUrl, stripGuideIdFromUrl } from './community/guides.js';

// The guides gallery streams in on demand: it is a whole browse surface
// plus the trip map, and most sessions never open it.
const GuidesPanel = lazy(() => import('./community/GuidesPanel.jsx').then((m) => ({ default: m.GuidesPanel })));
const RegionPage = lazy(() => import('./browse/RegionPage.jsx').then((m) => ({ default: m.RegionPage })));
const CountryPage = lazy(() => import('./browse/CountryPage.jsx').then((m) => ({ default: m.CountryPage })));
import { readTrailFromUrl } from './lib/trails.js';
import { readDestFromUrl, destFromHash } from './lib/dossier.js';
import { readBeachFromUrl } from './lib/beaches.js';
import { readRegionFromUrl, regionFromHash } from './lib/regions.js';
import { readLakeFromUrl } from './lib/lakes.js';
import { readMountainFromUrl } from './lib/mountains.js';
import { readCycleFromUrl } from './lib/cycling.js';
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
// My trips is its own chunk with its own stylesheet (T434): nothing of it is
// needed before the traveller opens it.
const SavedTripsPanel = lazy(() => import('./auth/SavedTripsPanel.jsx').then((m) => ({ default: m.SavedTripsPanel })));
import { PaywallProvider } from './hooks/usePaywall.jsx';
import { LegalFromUrl } from './components/LegalFromUrl.jsx';
import { originHome } from './lib/origins.js';
import { useAppData } from './hooks/useAppData.js';
import { Button } from './components/Button.jsx';
import { CATALOGUE_MODE, loadFullCatalogue } from './lib/appData.js';
import { readFirstVisit, markHomeSeen } from './lib/homeVisit.js';
import { useDestinationSearch } from './hooks/useDestinationSearch.js';
import { useAccountSync } from './hooks/useAccountSync.js';
import { useUrlSync } from './hooks/useUrlSync.js';
import { useKeyboardOpen } from './hooks/useKeyboardOpen.js';
import { usePanelState } from './hooks/usePanelState.js';
import { useFilterState } from './hooks/useFilterState.js';
import { useReach } from './lib/reach.js';

// Once someone picks "continue without an account" on the entry gate, don't
// ask again on this device, only a fresh sign-in should bring accounts back.
const GUEST_KEY = 'continent.guestMode.v1';
// A first visit with no link opens on the home page (T194, lib/homeVisit.js).
// Read here, once, at module load: a component initializer runs twice under
// StrictMode and the dossier reader strips the hash between the two passes,
// so a hash link would read as a first visit on the second pass.
const FIRST_VISIT = (() => {
  try { return readFirstVisit(window.localStorage, window.location.search, window.location.hash); } catch { return false; }
})();

// Whether a trip plan is open on this device: what a bare `?tab=plan` and the
// Plan door open (T496). A draft with stops, or a saved plan being edited.
function hasPlanOpen() {
  const d = loadTripDraft();
  return !!(d && (d.planId || d.stops?.length));
}

// The pass picker used to be mounted here, in the account panel and in the
// day planner, each opening it on its own terms. It now lives inside
// PaywallProvider (hooks/usePaywall.jsx), which is the single place that
// decides when a traveller is asked and how often.


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
  // The place the address names (T496, roadmap 1.15): read once at load,
  // old addresses included (LEGACY_TABS in lib/urlState.js). Null without a
  // query, when the visit's default decides.
  const [bootRoute] = useState(() => (typeof window !== 'undefined' && window.location.search
    ? routeFromSearch(window.location.search, { hasPlan: hasPlanOpen() })
    : null));
  // Read once at module load (FIRST_VISIT), marked seen by the effect.
  const firstVisit = FIRST_VISIT;
  useEffect(() => { try { markHomeSeen(window.localStorage); } catch { /* blocked */ } }, []);

  // Grouped UI state (see usePanelState / useFilterState).
  const {
    authModalOpen, setAuthModalOpen,
    authModalMode, setAuthModalMode, accountOpen, setAccountOpen,
    savedTripsOpen, setSavedTripsOpen, lifestyleOpen, setLifestyleOpen,
  } = usePanelState();
  // The Lifestyle dialog leaves in --dur-2 instead of vanishing (T391): it
  // stays mounted with a leaving class until its exit has run.
  const lifestyleSheet = usePresence(lifestyleOpen);
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
  // Whether this visitor has said "continue without an account" before. Since
  // the gate stopped fronting the app this no longer suppresses anything on
  // load; it is kept because signing out clears it, which is how the gate
  // knows a returning stranger from someone who just left an account.
  const [, setGuestMode] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(GUEST_KEY) === '1'
  );
  // Whether the entry gate has been asked for (see showGate below). False on
  // every cold start: browsing is the default.
  const [gateRequested, setGateRequested] = useState(false);
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
  }, [pendingFriend]);
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
  }, [pendingFriend, user, setAccountOpen, setSavedTripsOpen]);

  // An invite to plan a trip together (#coplan=<token>, migration 052, T434).
  // Held in session storage until it is used, so a guest can sign in or
  // create an account first (Google leaves the page and comes back). Signed
  // in, the link is answered once: the trip joins My trips, which opens on it,
  // and one line in the bottom slot says what happened.
  const [pendingCoplan, setPendingCoplan] = useState(() => readCoplanTokenFromUrl());
  const [coplanNote, setCoplanNote] = useState('');
  useEffect(() => {
    if (!pendingCoplan) return;
    stripCoplanTokenFromUrl();
    holdCoplanToken(pendingCoplan);
  }, [pendingCoplan]);
  useEffect(() => {
    if (!pendingCoplan || authLoading) return undefined;
    if (!user) {
      if (authConfigured) { setAuthModalMode('signup'); setAuthModalOpen(true); }
      return undefined;
    }
    let live = true;
    const done = (status, label) => {
      if (!live) return;
      holdCoplanToken(null);
      setPendingCoplan(null);
      const key = { joined: 'coplan.linkJoined', own: 'coplan.linkOwn', blocked: 'coplan.linkBlocked', too_many: 'coplan.linkTooMany' }[status]
        || 'coplan.linkGone';
      setCoplanNote(t(key, { trip: label || t('saved.fallbackTrip') }));
      if (status === 'joined' || status === 'own') { setAccountOpen(false); setSavedTripsOpen(true); }
    };
    acceptCoplanLink(pendingCoplan).then((r) => done(r.status, r.label)).catch(() => done('gone'));
    return () => { live = false; };
  }, [pendingCoplan, user, authLoading, authConfigured, setAuthModalMode, setAuthModalOpen, setAccountOpen, setSavedTripsOpen, t]);
  useEffect(() => {
    if (!coplanNote) return undefined;
    const id = setTimeout(() => setCoplanNote(''), 8000);
    return () => clearTimeout(id);
  }, [coplanNote]);

  // The published guides gallery, and a direct link to one of them
  // (#guide=<id>). Same rule as every other hash this app answers: read once
  // at startup, acted on, then stripped from the bar. A guide is readable
  // signed out, so this deliberately does not wait for an account.
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [pendingGuide, setPendingGuide] = useState(() => readGuideIdFromUrl());
  useEffect(() => {
    if (!pendingGuide) return;
    stripGuideIdFromUrl();
    setAccountOpen(false);
    setSavedTripsOpen(false);
    setGuidesOpen(true);
    // pendingGuide only ever moves to '' after this (openGuides, the gallery's
    // close), which returns early, so the link still opens the guide once.
  }, [pendingGuide, setAccountOpen, setSavedTripsOpen]);

  const openGuides = () => {
    setAccountOpen(false);
    setSavedTripsOpen(false);
    setPendingGuide('');
    setGuidesOpen(true);
  };

  // My trips and Account are places with an address (T496, roadmap 1.15):
  // opening one writes one history step, so Back, and a phone's swipe back,
  // close it onto the view under it instead of leaving Carta. A second press
  // on the door no longer closes it: a place is left by going to another
  // place or by Back, the way every section is.
  const pushOverlay = (key, opts) => {
    try {
      if (window.history.state?.cartaOverlay !== key) {
        window.history.pushState({ cartaOverlay: key }, '', tabHref(key, window.location.search, opts));
      }
    } catch { /* sandboxed: the page still opens */ }
  };
  const openAccountAt = (view) => {
    setGuidesOpen(false);
    setSavedTripsOpen(false);
    setLifestyleOpen(false);
    setAccountView(view);
    setAccountEntry((n) => n + 1);
    if (!accountOpen) pushOverlay('account', { view });
    setAccountOpen(true);
  };
  const openSaved = () => {
    setAccountOpen(false);
    setLifestyleOpen(false);
    setGuidesOpen(false);
    if (!savedTripsOpen) pushOverlay('trips');
    setSavedTripsOpen(true);
  };
  // Closed by its own control (Escape, a panel's close), a page steps back
  // over the entry its opening pushed, so the history holds no dead step;
  // the popstate handler below then closes it. Opened from an address, there
  // is no such entry and it simply closes.
  const closeOverlay = () => {
    if (window.history.state?.cartaOverlay && (accountOpen || savedTripsOpen)) {
      try { window.history.back(); return; } catch { /* sandboxed */ }
    }
    setAccountOpen(false);
    setSavedTripsOpen(false);
  };
  // My trips and the account hub cover the whole screen. The tab behind them
  // is inert while they are open, so Tab, a screen reader and the heading
  // outline stay inside the page the traveller is looking at (T186). React 18
  // has no boolean inert, so the attribute is written as an empty string.
  const behindPanel = savedTripsOpen || accountOpen ? '' : undefined;

  // One door into a section, whatever pressed it: the header tabs, the brand
  // mark, the phone's bottom bar and the empty-shelf links all land on the
  // tab AND clear whatever was standing over it. Account and My trips are
  // full-height pages on desktop (z-index 56, everything below the bar), so a
  // switch that left one open moved the underline to Explore while Explore
  // stayed hidden behind the account page: the tab said one thing and the
  // screen said another. Lifestyle goes with them, since every tab that can
  // reprice from it carries its own button.
  //
  // Stable: the handovers further down take it as a dependency, and every
  // setter it closes over is a useState setter.
  //
  // A section change also writes one history entry (T381, the navigation
  // rule), so the browser's and the phone's Back return to the previous
  // section instead of leaving Carta. `replace` is for the doors that open a
  // section at boot from a shared link: they must not add an entry the
  // traveller never asked for.
  const activeTabRef = useRef(null);
  // Whether My trips or Account stands over the view, for the stable door
  // below: leaving one for the view under it is still a step in the history.
  const overlayOpenRef = useRef(false);
  overlayOpenRef.current = accountOpen || savedTripsOpen;
  //
  // A real section change by the traveller moves (T391, rule R5): the new
  // tab fades in and rises 8 px through crossTab() in lib/sharedElement.js,
  // while the header and the bar stay put. A boot door (`replace`) and a
  // press on the section already showing change nothing on screen, so they
  // commit at once.
  const goToTab = useCallback((key, opts = {}) => {
    const from = activeTabRef.current;
    const commit = () => {
      setSavedTripsOpen(false);
      setAccountOpen(false);
      setLifestyleOpen(false);
      setActiveTab(key);
    };
    if (!opts.replace && from && (key !== from || overlayOpenRef.current)) {
      // The Explore category rides along (T498), so the address names the
      // layer on screen, not a default.
      try { window.history.pushState({ cartaTab: key }, '', tabHref(key, undefined, opts.cat ? { cat: opts.cat } : {})); } catch { /* sandboxed */ }
    }
    else if (opts.cat && key === from) {
      // One layer to another inside Explore: the same step, a new name.
      try {
        window.history.replaceState(window.history.state, '',
          `${tabHref(key, undefined, { cat: opts.cat })}${window.location.hash}`);
      } catch { /* sandboxed */ }
    }
    activeTabRef.current = key;
    if (opts.replace || !from || key === from) commit();
    else crossTab(commit);
  }, [setSavedTripsOpen, setAccountOpen, setLifestyleOpen]);
  // The entry gate is NOT a front door any more.
  //
  // It used to be the first thing every visitor saw: a full-screen sign-in
  // takeover in front of an app whose whole proposition is browsing real
  // places. That asked strangers to commit before they had seen anything,
  // and it is also what a crawler sees, so the catalogue read as login-walled
  // content. A first visit now lands straight on Destinations; signing in is
  // one press on the header's account button, and the surfaces that genuinely
  // need an account (saving, sharing, exporting) already ask for one at the
  // moment they are used, through PaywallProvider / AuthModal.
  //
  // The gate survives for the one case it was actually good at: a deliberate
  // sign-out, where the likely intent is to switch accounts rather than to
  // start browsing anonymously.
  const showGate = authConfigured && !authLoading && !user && !recoveryMode && gateRequested;

  // Day plans shadow to the account whenever someone is signed in (and fall
  // back to local-only for guests). Keyed on the id, not the user object,
  // so token refreshes with a fresh object don't re-run the merge.
  const dayPlanUserId = authConfigured && user ? user.id : null;
  useEffect(() => { bindDayPlanCloud(dayPlanUserId); }, [dayPlanUserId]);

  // A deliberate sign-out brings the gate up, because the likely next move is
  // signing into a different account rather than browsing anonymously. It is
  // the only thing that raises it; "continue without an account" lowers it and
  // the app carries on where it was.
  const prevUserRef = useRef(null);
  useEffect(() => {
    if (prevUserRef.current && !user) {
      localStorage.removeItem(GUEST_KEY);
      setGuestMode(false);
      setGateRequested(true);
    }
    prevUserRef.current = user;
  }, [user]);

  // Which top-level section is showing: Destinations (the catalogue +
  // published trips), Map (the browse/search experience), Trip planner, or
  // Day planner. A RETURN visit opens on Destinations, so the thing a
  // returning traveller sees is real places. A FIRST visit with no link opens
  // on the home page (`firstVisit`, T194), which is the landing page and
  // carries a live receipt. (The localStorage mirror's remembered tab is
  // deliberately ignored.)
  // A query string, though, means the view was shared or reloaded, so it
  // decides which tab opens. The encoder omits `tab` for the map (it is the
  // URL's implicit default), so a link carrying filters but no tab is a map
  // link. `tab=home` is the landing page (T209), which is also the home page
  // (owner decision 2026-10-07); a first visit with no link opens on it (T194).
  // T496: the places are Explore, Plan, My trips and Account; Explore opens
  // on Places (owner T489-h), so a return visit with no link lands there.
  const urlTab = bootRoute && VIEW_KEYS.includes(bootRoute.view) ? bootRoute.view : null;
  const [activeTab, setActiveTab] = useState(urlTab || (firstVisit ? 'home' : 'map'));
  if (activeTabRef.current === null) activeTabRef.current = activeTab;

  // An address that names My trips or Account opens that page over the
  // default view, once, at boot (`?tab=account&view=friends` lands on the
  // spoke it names).
  useEffect(() => {
    if (bootRoute?.overlay === 'account') {
      setAccountView(bootRoute.accountView || 'home');
      setAccountOpen(true);
    } else if (bootRoute?.overlay === 'trips') {
      setSavedTripsOpen(true);
    }
    // Once, at boot: bootRoute never changes.
  }, [bootRoute, setAccountOpen, setSavedTripsOpen]);

  // Plan remembers which of its views was last on screen (the start page,
  // the trip or the day), so the Plan door returns to it; with none yet it
  // opens the plan in progress, else the start page (T496, owner T490-a).
  const lastPlanViewRef = useRef(null);
  useEffect(() => {
    if (placeOf(activeTab) === 'plan') lastPlanViewRef.current = activeTab;
  }, [activeTab]);

  // The one door for a place or a view, whatever pressed it: the header, the
  // bottom nav, the logo, Account's "How Carta works" and the home page.
  // A view key (map, places, trip, day) passes straight to goToTab.
  const goTo = (key) => {
    if (key === 'trips') { openSaved(); return; }
    if (key === 'account') {
      // Pressing Account on Account goes back to its first page.
      if (accountOpen) { setAccountView('home'); setAccountEntry((n) => n + 1); return; }
      openAccountAt('home');
      return;
    }
    if (key === 'explore') { goToTab('map'); return; }
    if (key === 'plan') {
      const cur = activeTabRef.current;
      if (placeOf(cur) === 'plan') { goToTab(cur); return; }
      goToTab(lastPlanViewRef.current || (hasPlanOpen() ? 'trip' : 'planstart'));
      return;
    }
    goToTab(key);
  };

  const [selectedId, setSelectedId] = useState(init.selectedId ?? null);

  // Pick any depart date and any return date. Trip length (nights) is derived
  // and synced into choices.trip_days for components that read it.
  const [departDate, setDepartDate] = useState(init.departDate ?? null);
  const [returnDate, setReturnDate] = useState(init.returnDate ?? null);

  const [choices, setChoices] = useState({
    group_size: init.group_size ?? 2,   // two, stated wherever it applies (T100); data defaults no longer decide it
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
  //
  // A Set of `kind:id` KEYS, not bare ids: anything the app opens a page for
  // can be shortlisted, not only a priced destination. readFavList migrates
  // the old bare-id form (see lib/favorites.js), so a stored state or a link
  // written before this change still restores its places.
  const [favorites, setFavorites] = useState(() => readFavList(init.favorites || []));

  // Planner tabs mount on first visit and then stay alive (hidden) so a quick
  // look at another tab never wipes an in-progress plan.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['map', urlTab || (firstVisit ? 'home' : 'map')]));
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
    // Stripping the hash never re-reads it: the token is state read once at
    // startup, and its only later change (dismiss, to null) strips nothing.
  }, [shareToken]);

  const [sharedTripRaw] = useState(() => readTripShareFromUrl());
  const [sharedTrip, setSharedTrip] = useState(null);
  const [pendingSharedTrip, setPendingSharedTrip] = useState(null);
  // The offer is a dialog (T401): focus moves in, Tab stays inside, Escape
  // closes it, and every way out leaves in --dur-2.
  const shareOfferRef = useRef(null);
  const shareExit = useDialogExit(() => setSharedTrip(null));
  useFocusTrap(shareOfferRef, shareExit.close, { enabled: !!sharedTrip });

  // The hand-offs INTO the planners from a destination or feature page, and
  // their shareable forms (`?tab=trip&cc=BE`, `?tab=day&dest=BRU`,
  // `?tab=day&feat=trail:AT:63478`, see lib/urlState.js). Each is consumed by
  // the planner it names and cleared again, the same pattern as
  // pendingSharedTrip: the tab reads it once, does its thing, and calls back.
  //   tripSeed: { iso2 }
  //   daySeed:  { destId } | { feature: { kind, cc, id, name?, lat?, lon? } }
  const [pendingTripSeed, setPendingTripSeed] = useState(() => (
    init.tripSeedCc ? { iso2: init.tripSeedCc } : null
  ));
  const [pendingDaySeed, setPendingDaySeed] = useState(() => (
    init.daySeedDest ? { destId: init.daySeedDest }
      : init.daySeedFeat ? { feature: init.daySeedFeat } : null
  ));
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
    if (pendingTrail) goToTab('places', { replace: true });
  }, [pendingTrail, goToTab]);

  // A day plan shared as a link (#day=..., T433): read once at startup and
  // handed to the Day planner, which opens it as a plan of the recipient's own.
  const [sharedDayRaw, setSharedDayRaw] = useState(() => readDayShareFromUrl());
  useEffect(() => {
    if (sharedDayRaw) goToTab('day', { replace: true });
  }, [sharedDayRaw, goToTab]);

  // A single DESTINATION shared as a link (#dest=gem:valbona, see
  // lib/dossier.js): read once at startup, then the full-screen destination
  // page opens over whichever tab loads. Same contract as the trail hash: it
  // carries nothing else, so the recipient's own state survives.
  const [pendingDest] = useState(() => readDestFromUrl());
  useEffect(() => {
    if (pendingDest) setSelectedId(pendingDest);
    // Once, at boot: pendingDest has no setter, so it never changes, and the
    // hash was already stripped by the reader.
  }, [pendingDest]);

  // A single BEACH shared as a link (#beach=gr-navagio-Q1234&bc=GR, see
  // lib/beaches.js), read the same way and for the same reasons: the hash
  // carries nothing else, so opening someone else's beach leaves the
  // recipient's own dates, origin and lifestyle exactly where they were.
  const [pendingBeach, setPendingBeach] = useState(() => readBeachFromUrl());
  useEffect(() => {
    if (pendingBeach) goToTab('places', { replace: true });
  }, [pendingBeach, goToTab]);

  // And a single LAKE (#lake=si-lake-bled-Q207302&lc=SI, see lib/lakes.js).
  // Same hash, same reasons.
  const [pendingLake, setPendingLake] = useState(() => readLakeFromUrl());
  useEffect(() => {
    if (pendingLake) goToTab('places', { replace: true });
  }, [pendingLake, goToTab]);

  // And a single MOUNTAIN (#mtn=ch-matterhorn-Q1090&mc=CH, lib/mountains.js).
  const [pendingMountain, setPendingMountain] = useState(() => readMountainFromUrl());
  useEffect(() => {
    if (pendingMountain) goToTab('places', { replace: true });
  }, [pendingMountain, goToTab]);

  // And a single CYCLE ROUTE or TOUR (#cycle=63478&cc=GB, #tour=slug, see
  // lib/cycling.js). The reader has existed since the layer shipped and was
  // never called, so a shared cycle link opened the app on whatever tab the
  // recipient was last on and dropped the route. It is also the door a region
  // page needs: cycling is the largest layer on those pages.
  const [pendingCycle, setPendingCycle] = useState(() => readCycleFromUrl());
  useEffect(() => {
    if (pendingCycle) goToTab('places', { replace: true });
  }, [pendingCycle, goToTab]);

  // A shared REGION link (#region=COAST:ES-LUZ-CADIZ, see lib/regions.js).
  // Not a tab: the region page is a hoisted overlay like DestinationPage,
  // so it opens over whatever tab the recipient was on.
  const [pendingRegion, setPendingRegion] = useState(() => readRegionFromUrl());

  // A shared TRIP link (#itin=at-salzburg-vienna-chain-5d, see lib/trips.js),
  // read once at startup and handed to the Destinations tab, exactly like a
  // shared trail, beach, lake or mountain. The hash carries nothing else, so
  // opening someone else's itinerary leaves the recipient's own dates, origin
  // and lifestyle where they were.
  const [pendingTrip, setPendingTrip] = useState(() => readTripFromUrl());
  // One country, handed to the Destinations tab from the planner's brief.
  const [pendingCountry, setPendingCountry] = useState(null);
  // One category, handed to the Destinations tab from the home page's trip
  // kinds (T462) or a journey link.
  const [pendingCategory, setPendingCategory] = useState(() => bootRoute?.cat || null);
  // One search, handed to Explore from the home page (T462): { facets } is a
  // guided question, { open: true } opens the search panel itself.
  const [pendingExploreSeed, setPendingExploreSeed] = useState(null);
  const clearExploreSeed = useCallback(() => setPendingExploreSeed(null), []);
  const openExploreSearch = useCallback((seed) => {
    setPendingExploreSeed({ ...seed });
    goToTab('map');
  }, [goToTab]);
  useEffect(() => {
    if (pendingTrip) goToTab('places', { replace: true });
  }, [pendingTrip, goToTab]);

  // The six category tiles (T498, roadmap 1.3b A) and every door that names
  // a layer come through here. The country travels with the traveller
  // (rule 3): Italy on Places stays Italy on Beaches, and back again.
  const openExploreSection = useCallback((key, cc = undefined) => {
    if (key === 'places') {
      if (cc !== undefined) setCountryFilter(cc ? [cc] : []);
      goToTab('map');
      return;
    }
    setPendingCategory(key);
    // '' says "every country" (Places had none), null leaves it alone.
    if (cc !== undefined) setPendingCountry(cc ? String(cc).toUpperCase() : '');
    goToTab('places', { cat: key });
  }, [goToTab, setCountryFilter]);
  // The trip library inside Explore (owner T484-e, T489-a): "See all" on the
  // Trip styles row, one style from it, or a country's weeks.
  const [pendingStyle, setPendingStyle] = useState(null);
  const openTripStyles = useCallback((slug = null, cc = null) => {
    setPendingCategory('trips');
    setPendingStyle({ slug: slug || null });
    if (cc) setPendingCountry(String(cc).toUpperCase());
    goToTab('places', { cat: 'trips' });
  }, [goToTab]);

  // One journey (a week from the journeys library) to open, handed to
  // Destinations like the other pending items: a shared #journey=<id> link
  // at boot (T387 reads it in lib/journeys.js), or a starred week in My trips.
  // The id stays here until Destinations says the page is open (T474, row
  // T435-a), so a remount or React running an effect twice cannot drop it,
  // which is how the old take-once handover in JourneysSection lost it.
  const [pendingJourney, setPendingJourney] = useState(null);
  const clearPendingJourney = useCallback(() => setPendingJourney(null), []);
  const [bootJourney] = useState(() => readJourneyFromUrl());
  useEffect(() => {
    if (!bootJourney) return;
    setPendingCategory('trips');
    setPendingJourney({ id: bootJourney, fromLink: true });
    goToTab('places', { replace: true });
    // Once, at boot: the id is read once and never changes.
  }, [bootJourney, goToTab]);

  // A published itinerary handed to the trip planner, where every stop, night
  // and date stays editable. It goes in through the same door a shared trip
  // uses, so the planner needs no new code path for it.
  const openTripInPlanner = useCallback((trip) => {
    const stops = (trip.stops || [])
      .map((st) => ({ destinationId: st.dest, nights: st.nights, activities: [] }))
      .filter((st) => st.destinationId && st.nights);
    if (!stops.length) return;
    // The published trip already says how each hop is made: bus here, train
    // there, a ferry where there is water. That was thrown away at this door,
    // so a traveller who had just read "bus to Barcelona" arrived in the
    // planner and was asked how they were getting to Barcelona. The legs keep
    // their modes, keyed by leg index the way the planner keys them.
    const legModes = {};
    (trip.legs || []).forEach((leg, i) => {
      if (leg?.mode) legModes[i] = leg.mode === 'drive' ? 'car' : leg.mode;
    });
    setPendingSharedTrip({
      stops,
      label: trip.name || '',
      transportPref: trip.transport === 'car' ? 'owncar' : 'public',
      legModes,
      // Nobody has said when. The planner asks for the window itself rather
      // than inventing dates a published trip never carried.
      tripStart: '',
    });
    goToTab('trip');
  }, [goToTab]);

  /** Open one published trip's page from the planner. Stable, like every
   *  other callback handed to the two planner tabs: they stay mounted behind
   *  display:none, so a fresh arrow here re-renders 3,000 lines of component
   *  on every unrelated keystroke. */
  const openTripPage = useCallback((id) => {
    if (!id) return;
    setPendingTrip({ id: String(id) });
    goToTab('places');
  }, [goToTab]);

  /** "Plan a trip here" on a destination page: the trip wizard's Where step
   *  with that destination's country already picked. The wizard maps the
   *  iso2 onto the country name it keys its picks by. */
  const openTripForCountry = useCallback((iso2, destId = null) => {
    if (!iso2 || !/^[A-Za-z]{2}$/.test(String(iso2))) return;
    // T504 (row T498-b): a region page names its nearest priced town too.
    // The wizard reads only the country so far (GuidedTripWizard.jsx, the
    // seed effect); `destId` is there for it to take as the first stop.
    setPendingTripSeed(destId
      ? { iso2: String(iso2).toUpperCase(), destId: String(destId) }
      : { iso2: String(iso2).toUpperCase() });
    goToTab('trip');
  }, [goToTab]);

  /** "Plan a day here" on a destination page: the day flow, staying in that
   *  city, opened on the When question. */
  const openDayForDest = useCallback((id) => {
    if (!id) return;
    setPendingDaySeed({ destId: String(id) });
    goToTab('day');
  }, [goToTab]);

  /** "Add to a day plan" on a trail, beach, lake or mountain page: the day
   *  flow with that place as the first idea, staying in the nearest town.
   *  The page passes what it knows (name, point); a share link passes only
   *  kind, country and id, and the day tab resolves the rest. */
  const openDayForFeature = useCallback((kind, ref) => {
    if (!kind || !ref || ref.id == null) return;
    const k = kind === 'trails' ? 'trail' : kind === 'beaches' ? 'beach'
      : kind === 'lakes' ? 'lake' : kind === 'mountains' ? 'mountain' : kind;
    setPendingDaySeed({
      feature: {
        kind: k, cc: ref.cc || ref.country || '', id: String(ref.id),
        name: ref.name || '', lat: ref.lat, lon: ref.lon,
      },
    });
    goToTab('day');
  }, [goToTab]);

  /** "Back to trip" on a day plan that came out of a saved trip: reopen that
   *  trip in the planner. A null id means the still-unsaved draft, which the
   *  planner is already holding. */
  const openTripFromDay = useCallback((planId) => {
    if (planId) setPendingTripPlanId(planId);
    goToTab('trip');
  }, [goToTab]);

  /**
   * Open one feature layer's full-screen page, from anywhere.
   *
   * Three callers now hand the same {layer, ref} pair around - the region
   * page, the destination page and the shortlist - and each was spelling out
   * the same five-way branch. One function, so a new layer is added in one
   * place and the three can never disagree about what `cc` means.
   */
  const openFeature = useCallback((layer, ref) => {
    if (!ref || ref.id == null) return;
    if (layer === 'trails' || layer === 'trail') setPendingTrail({ id: Number(ref.id), country: ref.cc });
    else if (layer === 'beaches' || layer === 'beach') setPendingBeach({ id: String(ref.id), cc: ref.cc });
    else if (layer === 'lakes' || layer === 'lake') setPendingLake({ id: String(ref.id), cc: ref.cc });
    else if (layer === 'mountains' || layer === 'mountain') setPendingMountain({ id: String(ref.id), cc: ref.cc });
    else if (layer === 'cycling' || layer === 'cycle') setPendingCycle({ kind: 'route', id: Number(ref.id), country: ref.cc });
    else if (layer === 'trips' || layer === 'trip') setPendingTrip({ id: String(ref.id) });
    // A starred journey (T390-c): the week opens over the Trips category, the
    // list it belongs to, through the same door a shared link uses (T474,
    // closes row T391-a).
    else if (layer === 'journey' || layer === 'journeys') {
      setPendingCategory('trips');
      setPendingJourney({ id: String(ref.id) });
    }
    // A starred region (T478, row T474-a): its page is hoisted above the tabs,
    // so it opens over the Destinations tab the shortlist hops to.
    else if (layer === 'region' || layer === 'regions') setPendingRegion({ id: String(ref.id) });
    else return;
    goToTab('places');
  }, [goToTab]);

  // ── The country page and the region page (T498, roadmap 1.3b D and E) ──
  //
  // A country is a real page now: hoisted over every view like the region
  // and destination pages, with its own address (#country=IT, see
  // lib/urlState.js), so Explore, an outdoor layer, the planner's country
  // brief and a shared link all open the same page, and Back closes it.
  // Opening it pushes one history entry; closing it by its own control
  // steps back over that entry, the way a destination page does.
  const [countryPage, setCountryPage] = useState(
    () => (typeof window !== 'undefined' ? countryFromHash(window.location.hash) : null));
  const countryHandoffRef = useRef(false);
  const openCountryPage = useCallback((iso2) => {
    const cc = String(iso2 || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return;
    try {
      if (window.history.state?.cartaCountry !== cc) {
        window.history.pushState({ ...(window.history.state || {}), cartaCountry: cc }, '',
          `${window.location.pathname}${window.location.search}${countryHash(cc)}`);
      }
    } catch { /* sandboxed: the page still opens */ }
    setCountryPage(cc);
  }, []);
  const prevCountryRef = useRef(countryPage);
  useEffect(() => {
    const was = prevCountryRef.current;
    prevCountryRef.current = countryPage;
    const handoff = countryHandoffRef.current;
    countryHandoffRef.current = false;
    if (!was || countryPage) return;
    try {
      if (!handoff && window.history.state?.cartaCountry === was) window.history.back();
      else if (countryFromHash(window.location.hash)) {
        // Opened from an address, or left for another surface: the address
        // stops naming the country, so a reload does not bring it back.
        window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
      }
    } catch { /* sandboxed */ }
  }, [countryPage]);
  // Leaving the page for another surface (a layer, the planner, a week):
  // its history entry stays where it is, and nothing steps back over it.
  const leaveCountryPage = useCallback(() => {
    setCountryPage((cur) => {
      if (cur) countryHandoffRef.current = true;
      return null;
    });
  }, []);

  // The region page is a step in the history too (T504, row T498-d): Back on
  // a region page opened over a country page closes the region alone. Its
  // address keeps the country (#country=IT&region=...), so stepping back
  // lands on the country page, and its own close steps back over the entry.
  const regionPushedRef = useRef(false);
  const regionHandoffRef = useRef(false);
  const openRegionPage = useCallback((rid) => {
    const id = String(rid || '');
    if (!id) return;
    try {
      if (window.history.state?.cartaRegion !== id) {
        const cc = countryFromHash(window.location.hash);
        window.history.pushState({ ...(window.history.state || {}), cartaRegion: id }, '',
          `${window.location.pathname}${window.location.search}${cc ? `${countryHash(cc)}&` : '#'}region=${encodeURIComponent(id)}`);
        regionPushedRef.current = true;
      }
    } catch { /* sandboxed: the page still opens */ }
    setPendingRegion({ id });
  }, []);
  // Leaving the region page for another surface: its entry stays.
  const leaveRegionPage = useCallback(() => {
    setPendingRegion((cur) => {
      if (cur) regionHandoffRef.current = true;
      return null;
    });
  }, []);
  const prevRegionRef = useRef(pendingRegion?.id ?? null);
  useEffect(() => {
    const was = prevRegionRef.current;
    const now = pendingRegion?.id ?? null;
    prevRegionRef.current = now;
    const handoff = regionHandoffRef.current;
    regionHandoffRef.current = false;
    if (!was || now) return;
    try {
      if (!handoff && window.history.state?.cartaRegion === was) window.history.back();
    } catch { /* sandboxed */ }
  }, [pendingRegion]);

  // Where a page opened FROM the country or region page returns to (owner
  // note on T489-a: back paths land where you came from). The trail, beach
  // or week opens in the Explore view under these hoisted pages, so the
  // page it came from steps aside and comes back when that page closes.
  const [returnTo, setReturnTo] = useState(null);   // { kind, id, label }
  const openFeatureFrom = useCallback((from, layer, ref) => {
    setReturnTo(from);
    if (countryPage) leaveCountryPage();
    leaveRegionPage();
    openFeature(layer, ref);
  }, [openFeature, leaveCountryPage, leaveRegionPage, countryPage]);
  const onReturn = useCallback(() => {
    const r = returnTo;
    setReturnTo(null);
    if (!r) return;
    if (r.kind === 'country') openCountryPage(r.id);
    else if (r.kind === 'region') openRegionPage(r.id);
  }, [returnTo, openCountryPage, openRegionPage]);
  const destReturn = useMemo(
    () => (returnTo ? { label: returnTo.label, onReturn } : null),
    [returnTo, onReturn],
  );


  // Stable identity: this lands on every Explore card, so a fresh function
  // per render would defeat the card's React.memo.
  //
  // The kind defaults to 'dest' because the priced catalogue is where the
  // star started and where most of the call sites still are; a trail or a
  // beach page passes its own. One function, so there is one place that
  // knows how a wish is written down.
  // `cc` is required for the layers published one file per country (a trail,
  // a beach, a lake, a mountain, a cycle route); without it favKey refuses to
  // write a key it could never resolve again, and the star would do nothing.
  const toggleFav = useCallback(
    (id, kind = 'dest', cc = '') => setFavorites((prev) => toggleFavKey(prev, kind, id, cc)),
    [],
  );

  // The shortlist as the rest of the app asks about it: a membership test
  // that takes the pair, and the destination-only view the Explore surfaces
  // (cards, list rows, the compare panel) still filter by.
  const isFavorite = useCallback((id, kind = 'dest', cc = '') => isFav(favorites, kind, id, cc), [favorites]);
  const favDests = useMemo(() => new Set(favDestIds(favorites)), [favorites]);

  // Sync trip_days into choices whenever the dates change. trip_days is
  // derived from the dates, so a write from elsewhere (useAppData's data
  // default, for one) that disagrees with them is put back as well.
  const tripDays = choices.trip_days;
  useEffect(() => {
    const days = tripDaysBetween(departDate, returnDate);
    if (days > 0 && days !== tripDays) {
      setChoices((prev) => ({ ...prev, trip_days: days }));
    }
  }, [departDate, returnDate, tripDays]);

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


  const closeOverlayRef = useRef(closeOverlay);
  closeOverlayRef.current = closeOverlay;
  // Escape closes the top-most dismissable surface (the shared-trip offer,
  // then Account / My trips, then the destination detail). Gives keyboard
  // users a way out that the click-outside backdrop alone never provided, and
  // it is the exit those two slide-overs rely on now that their cross is
  // desktop-only.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (sharedTrip) { setSharedTrip(null); return; }
      if (guidesOpen) { setGuidesOpen(false); return; }
      if (accountOpen || savedTripsOpen) { closeOverlayRef.current(); return; }
      if (selectedId) { setSelectedId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sharedTrip, guidesOpen, accountOpen, savedTripsOpen, selectedId, setAccountOpen, setSavedTripsOpen]);

  // Back and Forward (T381, the navigation rule). goToTab writes one history
  // entry per section change; stepping through them restores that section and
  // closes whatever page stood over the tab, the same clearing goToTab does,
  // so the bar never marks one section while another shows.
  useEffect(() => {
    const onPop = () => {
      const route = routeFromSearch(window.location.search, { hasPlan: hasPlanOpen() });
      setLifestyleOpen(false);
      // A step that names a place (#dest=, T444) reopens it; any other step
      // closes the page.
      setSelectedId(destFromHash());
      // The country page follows its own step the same way (#country=, T498).
      setCountryPage(countryFromHash(window.location.hash));
      // And the region page (#region=, T504): its own step shows it; a step
      // of a page standing over it (a place, an item page) leaves it as it
      // is; any other step closes a region this session opened.
      const st = window.history.state || {};
      const rid = regionFromHash(window.location.hash);
      const ownStep = rid && st.cartaRegion === rid && !st.cartaPlaces && !st.cartaDest;
      setPendingRegion((cur) => {
        if (ownStep) return cur?.id === rid ? cur : { id: rid };
        if (rid && st.cartaRegion === rid) return cur;
        if (!regionPushedRef.current) return cur;
        regionPushedRef.current = false;
        return null;
      });
      // My trips and Account have their own steps (T496): stepping onto one
      // opens it over the view that was showing.
      setAccountOpen(route.overlay === 'account');
      setSavedTripsOpen(route.overlay === 'trips');
      if (route.overlay) return;
      if (route.cat) setPendingCategory(route.cat);
      activeTabRef.current = route.view;
      setActiveTab(route.view);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setSavedTripsOpen, setAccountOpen, setLifestyleOpen]);

  // Opening a place is one step in the history (T444, the Explore check):
  // Back, and a phone's swipe back, close the page onto the list it came
  // from instead of leaving Carta, and the address names the place (#dest=,
  // the deep link readDestFromUrl reads at boot), so it can be shared or
  // reopened. Stable, so every Explore card's memo survives parent renders.
  const openDetail = useCallback((id) => {
    try {
      if (id && window.history.state?.cartaDest !== id) {
        window.history.pushState({ ...(window.history.state || {}), cartaDest: id }, '',
          `${window.location.pathname}${window.location.search}#dest=${encodeURIComponent(id)}`);
      }
    } catch { /* sandboxed: the page still opens */ }
    setSelectedId(id);
  }, []);
  // Closed by its own controls (the back arrow, Escape, the backdrop), the
  // page steps back over the entry its opening pushed, so the history holds
  // no dead step. A hand-off to another tab has pushed its own entry first,
  // and Back itself has already moved, so neither steps back twice.
  const prevSelectedRef = useRef(selectedId);
  useEffect(() => {
    const was = prevSelectedRef.current;
    prevSelectedRef.current = selectedId;
    if (was && !selectedId && window.history.state?.cartaDest === was) {
      try { window.history.back(); } catch { /* sandboxed */ }
    } else if (was && !selectedId && destFromHash() === was) {
      // Opened from an address (T507): there is no step to go back over, so
      // the address stops naming the place and a reload does not reopen it.
      try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`); } catch { /* sandboxed */ }
    }
  }, [selectedId]);

  // Fetch app_data.json, apply its defaults into `choices`, and derive the
  // fare-date bounds used to default/clamp the depart & return pickers.
  const {
    data, error, dateBounds, needRecords, defaultDates,
  } = useAppData(init, setChoices, departDate, setDepartDate, returnDate, setReturnDate, choices.origin);

  // 'viewport' catalogue mode (T059, lib/catalogue.js): only the Explore
  // tab can work from the countries it has on screen, because its map lists
  // what the viewport holds. Every other tab ranks or searches the whole of
  // Europe, and a shared link can name a place anywhere, so either one asks
  // for the full catalogue. A place opened by id needs only its own country.
  // The deep-link states are read once at load, so this is decided once.
  const deepLinked = !!(pendingFriend || pendingCoplan || pendingGuide || shareToken || sharedTripRaw || sharedDayRaw
    || pendingTrail || pendingDest || pendingBeach || pendingLake || pendingMountain
    || pendingCycle || pendingRegion || pendingTrip || bootJourney || countryPage);
  useEffect(() => {
    if (CATALOGUE_MODE !== 'viewport') return;
    if (activeTab !== 'map' || deepLinked) loadFullCatalogue().catch(() => {});
  }, [activeTab, deepLinked]);

  // The partial catalogue of the default mode (T271, lib/appData.js): every
  // place has its rank-tier record, enough for the Destinations and Explore
  // screens to rank, filter, price and draw their cards, and the shards fill
  // in after the first paint. A session that arrived through a link waits
  // for the full catalogue, as it always did, because the page it opens can
  // read any place in full; so does a planner tab, which reads every place.
  // An opened place fetches its own shard first.
  const partial = !!data?.partial;
  const [linkedAtLoad] = useState(deepLinked);
  useEffect(() => {
    if (CATALOGUE_MODE !== 'all' || !partial) return;
    // The landing page (T209) prices from the rank tier too, so it is a
    // default screen in this sense and does not hold the shards up.
    if (linkedAtLoad || !['places', 'map', 'home', 'planstart', 'pricing'].includes(activeTab)) loadFullCatalogue().catch(() => {});
  }, [partial, activeTab, linkedAtLoad]);
  useEffect(() => {
    if (selectedId && (CATALOGUE_MODE === 'viewport' || partial)) needRecords([selectedId]).catch(() => {});
  }, [selectedId, partial, needRecords]);

  // Change the departure airport, reprices the whole app from the new origin,
  // and moves the drive-comparison's home to that airport so plane and car both
  // depart from the same place (no stale "fly from X but drive from Brussels").
  // Declared after `data` is available so the callback can read meta.origins.
  const setOrigin = useCallback((code) => setChoices((prev) => ({
    ...prev,
    origin: code,
    home: originHome(data, code) ?? prev.home,
  })), [data]);

  // Stable callback props for the two planner tabs. Both are memoized and both
  // stay mounted behind display:none, so a fresh arrow here re-rendered two
  // 3,000-line components (and up to four live MapLibre contexts) on every
  // lifestyle slider tick and every search keystroke.
  const openLifestyle = useCallback(() => setLifestyleOpen(true), [setLifestyleOpen]);
  // What a page opened over the shell names in its back control (carta-design
  // "Navigation": the back control names the list it returns to; T474): the
  // surface it closes back to.
  const backToLabel = savedTripsOpen ? t('nav.saved')
    : accountOpen ? t('nav.account')
      : ({ explore: t('nav.explore'), plan: t('nav.plan'), home: t('nav.home') }[placeOf(activeTab)]
        || t('detail.backToList'));
  const requestAuth = useCallback(() => setAuthModalOpen(true), [setAuthModalOpen]);
  // The day planner's two hand-offs, stable for the same reason (T192): as
  // inline arrows they gave DayPlannerTab new props on every App render.
  const planTripFromDay = useCallback(() => goToTab('trip'), [goToTab]);
  const clearPendingTripPlan = useCallback(() => setPendingTripPlanId(null), []);
  const clearPendingSharedTrip = useCallback(() => setPendingSharedTrip(null), []);
  const clearPendingDayPlan = useCallback(() => setPendingDayPlanId(null), []);
  const clearPendingTripSeed = useCallback(() => setPendingTripSeed(null), []);
  const clearPendingDaySeed = useCallback(() => setPendingDaySeed(null), []);
  const planDay = useCallback((target) => {
    setPendingDayPlanId(target); // { planId|null, stopIndex, dayIndex }
    goToTab('day');
  }, [goToTab]);

  // The drive start's setter went with the Destinations props that carried
  // it and that nothing read (T381, brief V3-10). choices.drive_home stays:
  // the URL key `dh` still restores it, and whether car trips come back
  // through the settings line or the path is removed is the owner's call
  // (register row T370-c).

  // Where you sleep, set from the trip page's Lifestyle slider (T173). The
  // same field the Lifestyle panel's tiles write, so the two never disagree.
  const setStayTier = useCallback((tier) => {
    setChoices((prev) => ({ ...prev, stay_tier: tier }));
  }, []);

  // How much width the scrollbar takes out of a tab panel. The panels
  // (.explore-tab, .places-tab) scroll and the top bar does not, so wherever
  // the scrollbar is a real gutter rather than a macOS-style overlay, the bar
  // was that much wider than the cards inside those panels and the Passes
  // chip overhung the toolbar's right edge.
  //
  // Measured off the panel that is actually on screen rather than a synthetic
  // probe: a detached test div reports the platform default, which is not
  // always what the panel gets, and the hidden panels behind a tab hop
  // measure zero. The panels reserve the gutter unconditionally
  // (scrollbar-gutter: stable), so the number does not move when a list grows
  // past one screen.
  //
  // Nothing measurable means nothing to write, rather than zero: the planner
  // tabs have no scrolling panel at all, and neither does the first render,
  // before the data lands. Writing 0 in those two cases made the bar's right
  // edge jump the gutter's width on every hop to a planner and back, and left
  // the Passes chip overhanging on the very first paint until the first tab
  // switch corrected it. `data` is in the deps for the second half of that:
  // the panels only exist once it has arrived.
  const dataReady = !!data;
  useEffect(() => {
    const apply = () => {
      let gutter = null;
      for (const el of document.querySelectorAll('.explore-tab, .places-tab')) {
        if (el.offsetWidth > 0) { gutter = el.offsetWidth - el.clientWidth; break; }
      }
      if (gutter === null) return;
      document.documentElement.style.setProperty('--sbw', `${gutter}px`);
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [activeTab, dataReady]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value key: the fields composeTrip reads, so a trip_days write does not reprice the catalogue
    [choices.group_size, choices.baggage_key, choices.baggage_per_direction_eur,
      choices.transport_mode, choices.stay_tier, choices.origin, choices.home, choices.lifestyle,
      choices.origin_pref, choices.car_model, choices.accommodation_model, choices.drive_home],
  );

  // The current origin's travel-time table (public/reach/{IATA}.json), or null
  // when that origin has none. Null keeps the reach filter inert AND tells the
  // filter bar to show its quiet "no data yet" state instead of dead chips.
  // Its only reader is Explore's filter rail (reachAvailable/reachHours live
  // there), so it stays unfetched on every other tab; a shared link with an
  // `rh` value still fetches straight away, wherever it lands.
  const wantReach = activeTab === 'map' || reachHours != null;
  const reachMinutes = useReach(wantReach ? choices.origin : null);

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
  // The bottom nav steps aside while a text field has focus on a phone (T401).
  useKeyboardOpen();
  useUrlSync(!!data, {
    departDate, returnDate, choices, priceMode, countryFilter,
    tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick, reachHours,
    // The address names the place on screen: a page over the view wins.
    activeTab: accountOpen ? 'account' : savedTripsOpen ? 'trips' : activeTab,
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
    favorites, setFavorites,
    selectedId, setSelectedId,
    departDate, setDepartDate,
    returnDate, setReturnDate,
    setAccountOpen, setAuthModalOpen,
  });

  // A lite record (T271) is not enough for the destination page: it opens
  // once the place's own shard is in, which the effect above asked for.
  const selectedRec = data && selectedId ? data.destinations[selectedId] : null;
  const selectedDest = selectedRec && !selectedRec._lite ? selectedRec : null;

  // The Explore page's two price-level indices, computed once per dataset and
  // shared by the grid and the open destination panel.
  // Recomputed whenever the Lifestyle panel changes a stay tier, a party
  // size or a single frequency. That is 3,038 destinations repriced in about
  // 7 ms, which is why there is no loading state anywhere near it: the grid
  // simply renders the new numbers on the next frame.
  // T534: the bed prices for the dates on screen, the traveller's own or
  // Carta's suggested week (night by night, so a week across July and August
  // pays both months); repriced when a country's stays arrive.
  const staysVersion = useStaysVersion();
  useEffect(() => {
    if (!data) return;
    setLiveBase(data.meta?.stays?.url, data.meta?.stays?.built);
    loadStaysFor(data.destinations);
  }, [data]);
  const datedStay = !!(departDate && returnDate);
  const exploreIndices = useMemo(
    () => (data && staysVersion >= 0 ? computeCosts(data.destinations, datedStay
      ? { ...choices, start: departDate, nights: Math.max(1, tripDaysBetween(departDate, returnDate)) }
      : choices) : null),
    [data, choices, staysVersion, datedStay, departDate, returnDate],
  );
  // The catalogue as rows, for the country and region pages (T498), computed
  // only while one of them shows.
  const placeRows = usePlaceRows(data, exploreIndices, !!(countryPage || pendingRegion));

  // What a first-run receipt reads and writes (T099, lib/firstRunContext.js):
  // given once here, so the destination page and the trip page price the
  // same trip from the same inputs without a prop chain through each tab.
  const firstRun = useMemo(() => ({
    data, choices, setChoices, setOrigin, indices: exploreIndices,
    departDate, returnDate, setDepartDate, setReturnDate, defaultDates, dateBounds,
  }), [data, choices, setOrigin, exploreIndices, departDate, returnDate, defaultDates, dateBounds]);

  // The settings line's values (T381, components/SettingsLine.jsx): every
  // global input a price depends on, given once so any surface can show or
  // read them. The dates count as the traveller's own only when they differ
  // from the pair Carta picked, which is also when there is a travel month.
  const setParty = useCallback((n) => {
    setChoices((prev) => ({ ...prev, group_size: Math.max(1, Math.round(n)) }));
  }, []);
  const ownDates = !!(departDate && returnDate && defaultDates
    && (departDate !== defaultDates.start || returnDate !== defaultDates.end));
  const settings = useMemo(() => ({
    data,
    origin: choices.origin,
    setOrigin,
    departDate, returnDate, setDepartDate, setReturnDate,
    defaultDates, dateBounds,
    ownDates,
    travelMonth: ownDates ? Number(String(departDate).slice(5, 7)) || null : null,
    party: choices.group_size,
    setParty,
    stayTier: choices.stay_tier || 'home',
    lifestyle: choices.lifestyle,
    openLifestyle,
  }), [data, choices.origin, setOrigin, departDate, returnDate, defaultDates, dateBounds,
    ownDates, choices.group_size, setParty, choices.stay_tier, choices.lifestyle, openLifestyle]);

  // Which parts of the settings line each tab shows. Explore and Destinations
  // price from every input. The Trip planner keeps its own origin, dates and
  // party, so the line there carries only what it reads from the shell. The
  // landing page demonstrates its own inputs, and nothing in the Day planner
  // reads these, so neither shows a line. Hidden under My trips and Account,
  // which are pages of their own.
  const settingsParts = savedTripsOpen || accountOpen ? null
    : activeTab === 'map' || activeTab === 'places' ? undefined
      // The Trip planner carries its Lifestyle on its own price card and its
      // Who step (T432), so the shell's line would only repeat it.
      : null;

  // The two nav badges (carta-design, count chip): the shortlist's size after
  // My trips, and a dot on the planner door while an unsaved trip plan with
  // stops is on this device. Re-read when the traveller moves between
  // sections, which is when the planner has just written its draft.
  const savedCount = favorites.size;
  // The place on screen, which the header and the bottom nav mark.
  const place = accountOpen ? 'account' : savedTripsOpen ? 'trips' : placeOf(activeTab);
  const planInProgress = useMemo(() => {
    const d = loadTripDraft();
    return !!(d && !d.planId && d.stops?.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a localStorage read, refreshed on a section change and when a page over the tab closes
  }, [activeTab, savedTripsOpen, accountOpen]);

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
        destinations={partial ? undefined : data?.destinations}
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
            setGateRequested(false);
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
        <Button variant="primary" style={{ marginTop: 18 }} onClick={() => window.location.reload()}>
          {t('shell.retry')}
        </Button>
      </div>
    );
  }

  if (!data || (partial && linkedAtLoad)) {
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
    /* Every paid surface in the app asks this provider for permission, and it
       owns the one pass modal. It sits inside TravelApp rather than beside
       AuthProvider because the sign-in handoff is TravelApp's own modal. */
    <PaywallProvider
      onSignIn={() => {
        setAuthModalMode('signin');
        setAuthModalOpen(true);
      }}
      /* "See all prices" in the pass sheet and Account's Your plan (T503,
         T497-a): the pricing page is a place, so it is a tab change. */
      onOpenPricing={() => goToTab('pricing')}
    >
    <FirstRunContext.Provider value={firstRun}>
    <SettingsContext.Provider value={settings}>
    <div className="app" onClick={() => setSelectedId(null)}>
      {/* The one way past the chrome for a keyboard (T496, 1.3a): first in
          the tab order, out of sight until it has focus. */}
      <a
        className="skip-link btn btn-secondary"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          document.getElementById('main')?.focus();
        }}
      >
        {t('a11y.skipToContent')}
      </a>
      <header className="top-bar" ref={filterBarRef} onClick={(e) => e.stopPropagation()}>
        <AppHeader
          user={user}
          place={place}
          onNavigate={goTo}
          savedCount={savedCount}
          planInProgress={planInProgress}
        />
        {settingsParts !== null && <SettingsLine parts={settingsParts} slot />}
      </header>

      {/* A trip arrived via share link: offer it, never silently apply it. */}
      {sharedTrip && (
        <div className={`guide-overlay shell-scrim${shareExit.leaving ? ' is-leaving' : ''}`} onClick={shareExit.close}>
          {/* One of the dialog family (T391): the one scrim, 12 px, the one
              close, and dialog semantics with its title as its name. */}
          <div
            className={`guide-modal share-trip-modal shell-dialog${shareExit.leaving ? ' is-leaving' : ''}`}
            ref={shareOfferRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-trip-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="shell-close" onClick={shareExit.close} aria-label={t('a11y.close')}>
              <CloseIcon size={16} />
            </button>
            <h2 className="guide-title" id="share-trip-title">{t('share.tripTitle')}</h2>
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
                  goToTab('trip');
                }}
              >
                {t('share.open')}
              </button>
              <button className="share-trip-dismiss" onClick={shareExit.close}>
                {t('share.dismiss')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The content landmark (T496, 1.3a): every view, so the skip link
          lands past the chrome. Pages laid over it (My trips, Account, a
          destination) are their own regions. */}
      <main id="main" className="app-main" tabIndex={-1}>
      {/* The Explore tab: the catalogue as a readable grid, no map and no
          fares. Keep-alive like the planners, so scroll position, the open
          panel and the loaded images survive a tab hop. */}
      {visitedTabs.has('map') && (
        <div className={activeTab === 'map' ? undefined : 'tab-keep-hidden'} inert={behindPanel}>
          <div onClick={(e) => e.stopPropagation()}>
            <ExploreTab
              data={data}
              isActive={activeTab === 'map'}
              /* A page standing over the tab (a destination, My trips,
                 Account) owns the one h1 (T411, rows T410-c and the quality
                 floor's two-h1 screens). */
              pageOver={!!selectedDest || savedTripsOpen || accountOpen || !!countryPage || !!pendingRegion}
              locationQuery={locationQuery}
              setLocationQuery={setLocationQuery}
              countryFilter={countryFilter}
              setCountryFilter={setCountryFilter}
              tripKinds={tripKinds}
              setTripKinds={setTripKinds}
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
              favorites={favDests}
              onToggleFav={toggleFav}
              selectedId={selectedId}
              onSelect={openDetail}
              indices={exploreIndices}
              choices={choices}
              onOpenLifestyle={openLifestyle}
              onOpenGuides={openGuides}
              onOpenCountry={openCountryPage}
              onPickCategory={openExploreSection}
              onOpenStyles={openTripStyles}
              seed={pendingExploreSeed}
              onSeedConsumed={clearExploreSeed}
              onPlanTrip={openTripInPlanner}
              isMock={!!data.meta?.is_mock}
            />
          </div>

        </div>
      )}

      {/* Lifestyle lives outside the tab blocks: where you sleep and how you
          eat price the map, the catalogue and the planners alike, so the panel
          has to open over whichever tab asked for it. */}
      {lifestyleSheet.mounted && (
        <div onClick={(e) => e.stopPropagation()}>
          {/* On Explore the panel is a right-hand drawer, so the grid it
              reprices stays visible behind it. Everywhere else it keeps the
              left-hand position the map layout was built around. Every modal
              dialog has a scrim (owner call, T362; carta-design Components),
              so the scrim shows on every tab and the page behind takes no
              clicks. */}
          <div className={`lifestyle-scrim${lifestyleSheet.leaving ? ' is-leaving' : ''}`} onClick={() => setLifestyleOpen(false)} aria-hidden="true" />
          {/* The trade-off sentence at its foot prices the open destination
              page when there is one (T391), else the catalogue's median. */}
          <LifestylePanel
            side={activeTab === 'map' ? 'right' : 'left'}
            choices={choices}
            setChoices={setChoices}
            onClose={() => setLifestyleOpen(false)}
            data={data}
            destination={selectedDest || null}
            leaving={lifestyleSheet.leaving}
          />
        </div>
      )}

      {/* The home page (T462, which replaced the T209 landing receipt): what
          Carta does, a live demo of it, and a door to each part. Not kept
          alive like the tabs: it holds nothing worth keeping. */}
      {activeTab === 'home' && (
        <div inert={behindPanel} onClick={(e) => e.stopPropagation()}>
          <HomePage
            data={data}
            indices={exploreIndices}
            pageOver={!!selectedDest || savedTripsOpen || accountOpen || !!countryPage || !!pendingRegion}
            onNavigate={goTo}
            onSearch={openExploreSearch}
            onCategory={openExploreSection}
            onOpenDest={openDetail}
            onOpenTrips={openSaved}
          />
        </div>
      )}

      {/* The Destinations tab: the catalogue and the published trips as a
          browsable section of their own. Picking a place hands over to the
          map tab, where the detail panel already knows how to price it. */}
      {visitedTabs.has('places') && (
        <div className={`explore-dest-view${activeTab === 'places' ? '' : ' tab-keep-hidden'}`} inert={behindPanel} onClick={(e) => e.stopPropagation()}>
          <DestinationsTab
            data={data}
            pricedAll={pricedAll}
            availableCountries={availableCountries}
            onSelectDest={openDetail}
            stayTier={choices.stay_tier || 'home'}
            lifestyle={choices.lifestyle}
            onOpenLifestyle={openLifestyle}
            onChangeStayTier={setStayTier}
            origin={choices.origin}
            openTrail={pendingTrail}
            onOpenTrailConsumed={() => setPendingTrail(null)}
            openBeach={pendingBeach}
            onOpenBeachConsumed={() => setPendingBeach(null)}
            openLake={pendingLake}
            onOpenLakeConsumed={() => setPendingLake(null)}
            openMountain={pendingMountain}
            onOpenMountainConsumed={() => setPendingMountain(null)}
            openCycle={pendingCycle}
            onOpenCycleConsumed={() => setPendingCycle(null)}
            openTrip={pendingTrip}
            onOpenTripConsumed={() => setPendingTrip(null)}
            onOpenTripInPlanner={openTripInPlanner}
            openCountry={pendingCountry}
            onOpenCountryConsumed={() => setPendingCountry(null)}
            openCategory={pendingCategory}
            onOpenCategoryConsumed={() => setPendingCategory(null)}
            openJourney={pendingJourney}
            onOpenJourneyConsumed={clearPendingJourney}
            isFavorite={isFavorite}
            onToggleFav={toggleFav}
            onAddToDay={openDayForFeature}
            isActive={activeTab === 'places'}
            onPickCategory={openExploreSection}
            onOpenCountryPage={openCountryPage}
            onOpenRegion={openRegionPage}
            openStyle={pendingStyle}
            onOpenStyleConsumed={() => setPendingStyle(null)}
            returnTo={destReturn}
            indices={exploreIndices}
          />
        </div>
      )}

      {/* Planner tabs stay MOUNTED once visited and just hide: a quick hop to
          another tab and back keeps the open plan, picks and scroll intact.
          MapLibre (v4, ResizeObserver) resizes itself when shown again. */}
      {visitedTabs.has('trip') && (
        <div className={activeTab === 'trip' ? undefined : 'tab-keep-hidden'} inert={behindPanel}>
          <Suspense fallback={<TabFallback />}>
            {/* The planners read every place in full, so a tab opened while
                the catalogue is still partial (T271) waits for the rest. */}
            {partial ? <TabFallback /> : <TripPlannerTab
              data={data}
              user={user}
              authConfigured={authConfigured}
              onRequestAuth={requestAuth}
              openPlanId={pendingTripPlanId}
              onOpenPlanConsumed={clearPendingTripPlan}
              openSharedTrip={pendingSharedTrip}
              onSharedTripConsumed={clearPendingSharedTrip}
              tripSeed={pendingTripSeed}
              onTripSeedConsumed={clearPendingTripSeed}
              origin={choices.origin}
              onChangeOrigin={setOrigin}
              lifestyle={choices.lifestyle}
              stayTier={choices.stay_tier || 'home'}
              favorites={favorites}
              onPlanDay={planDay}
              onOpenDest={openDetail}
              onOpenCountry={openCountryPage}
              onOpenTrip={openTripPage}
              onOpenLifestyle={openLifestyle}
            />}
          </Suspense>
        </div>
      )}
      {visitedTabs.has('day') && (
        <div className={activeTab === 'day' ? undefined : 'tab-keep-hidden'} inert={behindPanel}>
          <Suspense fallback={<TabFallback />}>
            {partial ? <TabFallback /> : <DayPlannerTab
              data={data}
              user={user}
              authConfigured={authConfigured}
              openPlanId={pendingDayPlanId}
              onOpenPlanConsumed={clearPendingDayPlan}
              favorites={favorites}
              onRequestAuth={requestAuth}
              onPlanTrip={planTripFromDay}
              onOpenDest={openDetail}
              onOpenFeature={openFeature}
              daySeed={pendingDaySeed}
              onDaySeedConsumed={clearPendingDaySeed}
              onOpenTrip={openTripFromDay}
              onOpenLifestyle={openLifestyle}
              costs={exploreIndices}
              stayTier={choices.stay_tier || 'home'}
              lifestyle={choices.lifestyle}
              groupSize={choices.group_size || 1}
              sharedDayRaw={sharedDayRaw}
              onSharedDayConsumed={() => setSharedDayRaw(null)}
            />}
          </Suspense>
        </div>
      )}

      {/* Plan with nothing in progress (T496, owner T490-a): two large
          tiles, Trip and One day. Not kept alive: it holds no state. */}
      {activeTab === 'planstart' && (
        <div inert={behindPanel} onClick={(e) => e.stopPropagation()}>
          <PlanStart
            pageOver={!!selectedDest || savedTripsOpen || accountOpen || !!countryPage || !!pendingRegion}
            onNavigate={goTo}
            ask={<PlanAsk data={data} onOpenPlace={openDetail} onPlanTrip={openTripInPlanner} />}
          />
        </div>
      )}

      {/* The Trip Pass prices, a place with its own address (T496). */}
      {activeTab === 'pricing' && (
        <div inert={behindPanel} onClick={(e) => e.stopPropagation()}>
          <Suspense fallback={<TabFallback />}>
            {/* A cold /pricing visit has no page to go back to: Back opens Explore. */}
            <PricingPage onBack={() => (window.history.length > 1 ? window.history.back() : goTo('explore'))} />
          </Suspense>
        </div>
      )}
      </main>

      {/* The full-screen region page, hoisted for the same reason the
          destination page is: a shared Costa de la Luz link opens over
          whatever tab the recipient happens to be on. */}
      {/* The country page (T498, roadmap 1.3b D): hoisted like the region
          and destination pages, so it opens over every view; the region and
          destination pages it opens stand over it, and closing them lands
          back on it. */}
      {countryPage && (
        <div onClick={(e) => e.stopPropagation()}>
          <Suspense fallback={null}>
            <CountryPage
              iso2={countryPage}
              rows={placeRows}
              backLabel={backToLabel}
              onClose={() => setCountryPage(null)}
              onSelect={openDetail}
              favorites={favDests}
              onToggleFav={toggleFav}
              onShowAll={(cc) => { leaveCountryPage(); openExploreSection('places', cc); }}
              onOpenLayer={(layer, cc) => { leaveCountryPage(); openExploreSection(layer, cc); }}
              onOpenRegion={openRegionPage}
              onPlanTrip={(cc) => { leaveCountryPage(); openTripForCountry(cc); }}
              onOpenJourney={(card) => openFeatureFrom(
                { kind: 'country', id: countryPage, label: localCountryName(countryPage) }, 'journey', { id: card.id })}
              onSeeAllWeeks={(cc) => { leaveCountryPage(); openTripStyles(null, cc); }}
            />
          </Suspense>
        </div>
      )}

      {/* The full-screen region page, hoisted for the same reason the
          destination page is: a shared Costa de la Luz link opens over
          whatever view the recipient happens to be on. Opened from a
          country page, its back names that country. */}
      {pendingRegion && (
        <div onClick={(e) => e.stopPropagation()}>
          <Suspense fallback={null}>
            <RegionPage
              id={pendingRegion.id}
              fav={isFavorite(pendingRegion.id, 'region')}
              onFav={() => toggleFav(pendingRegion.id, 'region')}
              backLabel={countryPage ? localCountryName(countryPage) : backToLabel}
              onClose={() => setPendingRegion(null)}
              onOpenRegion={openRegionPage}
              onOpenFeature={(layer, ref, name) => openFeatureFrom(
                { kind: 'region', id: pendingRegion.id, label: name || null }, layer, ref)}
              rows={placeRows}
              onSelectDest={openDetail}
              onPlanTrip={(cc, destId) => { leaveRegionPage(); leaveCountryPage(); openTripForCountry(cc, destId); }}
              onOpenJourney={(card, name) => openFeatureFrom(
                { kind: 'region', id: pendingRegion.id, label: name || null }, 'journey', { id: card.id })}
              onSeeAllLayer={(layer, cc) => { leaveRegionPage(); leaveCountryPage(); openExploreSection(layer, cc); }}
              favorites={favDests}
              onToggleFav={toggleFav}
            />
          </Suspense>
        </div>
      )}

      {/* The full-screen destination page, hoisted above the tab blocks so it
          opens over Explore AND Destinations without a tab hop. Renders from
          the dossier contract; the PDF export renders from the same file. */}
      {selectedDest && (
        <div onClick={(e) => e.stopPropagation()}>
          <DestinationPage
            destination={selectedDest}
            data={data}
            indices={exploreIndices}
            choices={choices}
            onOpenLifestyle={openLifestyle}
            onClose={() => setSelectedId(null)}
            backLabel={backToLabel}
            onSelect={openDetail}
            isFavorite={selectedId ? isFavorite(selectedId, 'dest') : false}
            onToggleFavorite={selectedId ? () => toggleFav(selectedId, 'dest') : undefined}
            onOpenFeature={(layer, ref) => { setSelectedId(null); openFeature(layer, ref); }}
            onOpenItin={(id) => {
              setSelectedId(null);
              setPendingTrip({ id });
              goToTab('places');
            }}
            onPlanTrip={selectedDest.iso2 ? () => { setSelectedId(null); openTripForCountry(selectedDest.iso2); } : undefined}
            onPlanDay={selectedId ? () => { setSelectedId(null); openDayForDest(selectedId); } : undefined}
          />
        </div>
      )}

      <div onClick={(e) => e.stopPropagation()}>
        <BottomNav
          user={user}
          place={place}
          onNavigate={goTo}
          savedCount={savedCount}
          planInProgress={planInProgress}
        />
      </div>

      {authConfigured && authModalOpen && (
        <AuthModal initialMode={authModalMode} onClose={() => setAuthModalOpen(false)} />
      )}
      {savedTripsOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <Suspense fallback={<div className="mt-loading" aria-busy="true" />}>
          <SavedTripsPanel
            data={data}
            onClose={closeOverlay}
            onLoadTrip={(trip) => {
              handleLoadTrip(trip);
              goToTab('map'); // the loaded trip opens as a map detail panel
            }}
            /* Signing in from My trips keeps My trips open behind the modal
               (T390-b), so the traveller is back on the shelf, not on the
               tab under it, once they are in. */
            onOpenAuth={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
            /* The day cost of every saved place and plan, from the same
               computeCosts() map Explore's cards print from (T390-a), and
               friends' trips as one line pointing at Friends. */
            costs={exploreIndices}
            stayTier={choices.stay_tier || 'home'}
            lifestyle={choices.lifestyle}
            onPlanTripCountry={openTripForCountry}
            onOpenFriends={() => openAccountAt('friends')}
            /* An empty shelf offers the tab that fills it, so "nothing here
               yet" comes with somewhere to go. */
            onGoToTab={goToTab}
            onOpenDayPlan={(id) => {
              setPendingDayPlanId(id);
              goToTab('day');
            }}
            onLoadTripPlan={(id) => {
              setPendingTripPlanId(id);
              goToTab('trip');
            }}
            /* The trip kept on this device (T503, T500-a) opens in Plan through
               the same hand-off, marked so the planner reads the device. */
            onOpenDeviceTrip={() => {
              setPendingTripPlanId({ device: true });
              goToTab('trip');
            }}
            /* The shortlist, which the Favorites tab now shows alongside the
               account's own saved destinations. Opening a row is the same
               door every other surface uses, so a starred trail lands on the
               trail page rather than a second, lesser version of it. */
            favorites={favorites}
            onToggleFav={toggleFav}
            onOpenFeature={(layer, ref) => { setSavedTripsOpen(false); openFeature(layer, ref); }}
            onOpenDest={(id) => { setSavedTripsOpen(false); openDetail(id); }}
          />
          </Suspense>
        </div>
      )}
      {guidesOpen && (
        <Suspense fallback={<TabFallback />}>
          <div onClick={(e) => e.stopPropagation()}>
            <GuidesPanel
              onClose={() => { setGuidesOpen(false); setPendingGuide(''); }}
              destinations={data?.destinations}
              openGuideId={pendingGuide || ''}
              onPublish={() => { setGuidesOpen(false); setPendingGuide(''); openSaved(); }}
            />
          </div>
        </Suspense>
      )}
      {accountOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <AccountPanel
            key={accountEntry}
            initialView={accountView}
            onViewChange={setAccountView}
            pendingFriendHandle={pendingFriend}
            destinations={data?.destinations}
            onClose={closeOverlay}
            onOpenAdmin={() => setAdminOpen(true)}
            /* Lifestyle is a dialog: it opens over Account, which stays the
               place on screen (and in the address) behind it. */
            onOpenLifestyle={() => setLifestyleOpen(true)}
            onOpenSaved={openSaved}
            onOpenGuides={openGuides}
            onOpenHome={() => goToTab('home')}
            stayTier={choices.stay_tier || 'home'}
            lifestyle={choices.lifestyle}
            /* For the read-only trip settings rows (T390-g, for T400). */
            origin={choices.origin}
            groupSize={choices.group_size}
            /* Signing in keeps Account open behind the dialog, so the
               traveller is back on Account once they are in. */
            onOpenAuth={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
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

      {/* One bottom slot for every transient message (T381, carta-design
          "Bottom slot"): above the bottom nav on a phone, bottom centre on
          desktop, newest on top, never over the nav or each other. Oldest
          first in the DOM; the slot stacks them in reverse. */}
      <BottomSlot>
        {/* The site notice from site_config, switched on from the admin
            panel. Renders nothing unless one is live. */}
        <AnnouncementBar />
        {/* A pass expires quietly by design, so the only warning is this one. */}
        <PassExpiryBanner />
        {coplanNote && (
          <div className="confirm-toast" role="status" onClick={(e) => e.stopPropagation()}>
            {coplanNote}
            <IconButton label={t('a11y.close')} className="confirm-toast-close" onClick={() => setCoplanNote('')}>
              <CloseIcon size={16} />
            </IconButton>
          </div>
        )}
        {emailConfirmed && (
          <div className="confirm-toast" role="status" onClick={(e) => e.stopPropagation()}>
            <span className="confirm-toast-check" aria-hidden="true">✓</span>
            {t('toast.emailConfirmed')}
            <button
              type="button"
              className="confirm-toast-close"
              onClick={dismissEmailConfirmed}
              aria-label={t('a11y.close')}
            >
              <CloseIcon size={16} />
            </button>
          </div>
        )}
      </BottomSlot>
    </div>
    </SettingsContext.Provider>
    </FirstRunContext.Provider>
    {/* ?legal=terms|privacy|imprint opens the matching text on load; the
        address Stripe Checkout and store forms point at. */}
    <LegalFromUrl />
    </PaywallProvider>
  );
}
