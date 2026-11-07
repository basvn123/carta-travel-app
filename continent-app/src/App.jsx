import React, { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore, Suspense } from 'react';
import { AppHeader } from './components/AppHeader.jsx';
import { setFooterNavigate } from './components/SiteFooter.jsx';
import { AnnouncementBar, PassExpiryBanner, BottomSlot } from './components/AnnouncementBar.jsx';
import { SettingsLine, SettingsContext } from './components/SettingsLine.jsx';
import { CloseIcon } from './components/Icons.jsx';
import { crossTab } from './lib/sharedElement.js';
import { usePresence, useDialogExit } from './lib/motion.js';
import { useFocusTrap } from './hooks/useFocusTrap.js';
import { SectionBoundary } from './components/ErrorBoundary.jsx';
import { MaintenanceGate } from './components/MaintenanceGate.jsx';
import { ExploreTab } from './browse/ExploreTab.jsx';
import { LifestylePanel } from './browse/LifestylePanel.jsx';
import { TasteSheetHost } from './browse/TasteDoor.jsx';
import { DestinationsTab } from './browse/DestinationsTab.jsx';
import Logo from './components/Logo.jsx';
// The home page (T462). In the entry bundle, not lazy: it is what a first
// visit paints, and a lazy chunk cost that paint about 1.8 s on a slow
// phone (React suspends and renders the shell twice; T462 report).
import { HomePage } from './browse/home/HomePage.jsx';
// T1209 (G14): the new home, behind its flag (off until T1111-a); its own chunk.
import { homeVariant } from './browse/home/homeVariant.js';
const HomeG14 = React.lazy(() => import('./browse/home/HomeG14.jsx'));
const homeVariantNow = () => {
  let store = null;
  try { store = window.sessionStorage; } catch { store = null; }
  return homeVariant(window.location.search, store);
};



import { tripDaysBetween, DEFAULT_LIFESTYLE } from './lib/runtime_pricing.js';
import { priceDays, priceRequest } from './lib/price/index.js';
import { loadStaysFor, setLiveBase, useStaysVersion } from './lib/staysData.js';
import { FirstRunContext } from './lib/firstRunContext.js';
import { normalizeTaste } from './lib/taste.js';
import { loadInitialState, tabHref, routeFromSearch, placeOf, VIEW_KEYS, countryFromHash } from './lib/urlState.js';
import { usePlaceRows } from './hooks/usePlaceRows.js';
import { readFavList, isFav, favDestIds, favKey, toggleFav as toggleFavKey } from './lib/favorites.js';
import { noteSaved, noteUnsaved, loadSavedLists } from './lib/savedLists.js';
import { trackFunnel, stepOfTab } from './lib/funnelCounts.js';
import { readTripShareFromUrl, decodeTripShare, readDayShareFromUrl } from './lib/shareLink.js';
import { readShareTokenFromUrl, stripShareTokenFromUrl } from './auth/tripShares.js';
import { readFriendHandleFromUrl, stripFriendHandleFromUrl } from './auth/friends.js';
import { IconButton } from './components/ui/index.js';
import { readCoplanTokenFromUrl, stripCoplanTokenFromUrl, holdCoplanToken, acceptCoplanLink } from './auth/coplanners.js';
import { readGuideIdFromUrl, stripGuideIdFromUrl } from './community/guides.js';

import { readTrailFromUrl } from './lib/trails.js';
import { readDestFromUrl, destFromHash } from './lib/dossier.js';
import { readBeachFromUrl } from './lib/beaches.js';
import { readRegionFromUrl, regionFromHash } from './lib/regions.js';
import { readLakeFromUrl } from './lib/lakes.js';
import { readMountainFromUrl } from './lib/mountains.js';
import { readCycleFromUrl } from './lib/cycling.js';
import { readTripFromUrl } from './lib/trips.js';
import { loadTripDraft } from './planner/tripDraftStore.js';
import { tripsStore } from './planner/tripsStore.js';
import { loadDeviceTrip } from './planner/deviceTripStore.js';
import { bindDayPlanCloud } from './planner/dayPlanSync.js';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { I18nProvider, useI18n } from './i18n/index.jsx';
import { AuthModal } from './auth/AuthModal.jsx';
import { AuthGate } from './auth/AuthGate.jsx';
import { SharedTripView } from './auth/SharedTripView.jsx';
import { ResetPasswordScreen } from './auth/ResetPasswordScreen.jsx';
import { PaywallProvider } from './hooks/usePaywall.jsx';
import { LegalFromUrl } from './components/LegalFromUrl.jsx';
import { originHome, nearestOrigin } from './lib/origins.js';
import { airportsNear, originsWithin, DEFAULT_REACH } from './lib/airportReach.js';
import { loadSweptOrigins } from './lib/flights/flightData.js';
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
import { resolveWhen, whenMonth, xmFromSearch } from './lib/when.js';
import { gatewayCity } from './lib/rating.js';
import { reportPriceDrops, mayAsk } from './lib/priceDrop.js';
import { loadEmailPrefs } from './auth/account/emailPrefs.js';
import { SearchDock } from './components/SearchDock.jsx';
import { useIsDesktop } from './hooks/useIsDesktop.js';
import { requestShowAll } from './browse/searchDockStore.js';
import { TabFallback } from './shell/TabFallback.jsx';
import { DayPlannerTab, PlanFlow, PricingPage, TripPlannerTab } from './shell/lazyScreens.js';
import { AppOverlays } from './shell/AppOverlays.jsx';
import { useAppOpeners } from './shell/useAppOpeners.js';
import { useAppSettingsValue } from './shell/useAppSettingsValue.js';

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
  if (d && (d.planId || d.stops?.length)) return true;
  // T656: a trip made in the new flow is open from Create trip on, before it
  // has a route: the Plan door reopens its page, not the opening screen.
  try {
    const raw = window.localStorage.getItem('carta.plannerDraft.v1');
    return Boolean(raw && JSON.parse(raw)?.settings?.trip?.created);
  } catch { return false; }
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
    priceMode, setPriceMode, countryFilter, setCountryFilter, countryNot, setCountryNot,
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
  // Together (T928): a page over the view like My trips and Account, with
  // its own sub-screen (tv=) and the friend or group it is about (tg=).
  const [togetherOpen, setTogetherOpen] = useState(false);
  const [togetherView, setTogetherView] = useState({ view: 'home', id: '' });
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
  // T928: the link opens Together's Add screen, the handle looked up there.
  useEffect(() => {
    if (!pendingFriend) return;
    setSavedTripsOpen(false);
    setAccountOpen(false);
    setTogetherView({ view: user ? 'add' : 'home', id: '' });
    setTogetherOpen(true);
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

  // A shortlist to decide on together (#together=<code>, T808,
  // lib/recommend/together.js TOGETHER_HASH): read once at startup, stripped
  // from the bar, opened as a sheet over whatever tab shows. No account: the
  // whole shortlist is in the code. Read here by hand so the first load does
  // not carry the shortlist code.
  const [togetherCode, setTogetherCode] = useState(() => {
    const h = typeof window === 'undefined' ? '' : window.location.hash || '';
    return h.startsWith('#together=') ? h.slice('#together='.length) : null;
  });
  useEffect(() => {
    if (togetherCode && window.location.hash.startsWith('#together=')) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, at startup

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
    setTogetherOpen(false);
    setGuidesOpen(true);
    // pendingGuide only ever moves to '' after this (openGuides, the gallery's
    // close), which returns early, so the link still opens the guide once.
  }, [pendingGuide, setAccountOpen, setSavedTripsOpen]);

  const openGuides = () => {
    setAccountOpen(false);
    setSavedTripsOpen(false);
    setTogetherOpen(false);
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
    // The old Friends spoke lives on Together now (T928).
    if (view === 'friends') { openTogether('home'); return; }
    setGuidesOpen(false);
    setSavedTripsOpen(false);
    setTogetherOpen(false);
    setLifestyleOpen(false);
    setAccountView(view);
    setAccountEntry((n) => n + 1);
    if (!accountOpen) pushOverlay('account', { view });
    setAccountOpen(true);
  };
  // T933: a section change inside Account writes one history step, so its
  // address names the section and Back walks out of it. A step Back or
  // Forward already moved to is not written again.
  const onAccountView = useCallback((v) => {
    setAccountView(v);
    try {
      const cur = routeFromSearch(window.location.search, { hasPlan: hasPlanOpen() });
      if (cur.overlay === 'account' && (cur.accountView || 'home') !== v) {
        window.history.pushState({ cartaOverlay: 'account', av: v }, '', tabHref('account', window.location.search, { view: v }));
      }
    } catch { /* sandboxed: the section still shows */ }
  }, []);
  const openSaved = () => {
    setAccountOpen(false);
    setTogetherOpen(false);
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
    if (window.history.state?.cartaOverlay && (accountOpen || savedTripsOpen || togetherOpen)) {
      try { window.history.back(); return; } catch { /* sandboxed */ }
    }
    setAccountOpen(false);
    setSavedTripsOpen(false);
    setTogetherOpen(false);
  };
  // Together (T928) and its sub-screens: the page is one history step, and
  // each sub-screen one more, so Back walks out of a friend's page onto the
  // page, then off the page.
  function openTogether(view = 'home', id = '') {
    setGuidesOpen(false);
    setSavedTripsOpen(false);
    setAccountOpen(false);
    setLifestyleOpen(false);
    const next = { view: view || 'home', id: id || '' };
    try {
      const st = window.history.state || {};
      if (st.cartaOverlay !== 'together' || st.tv !== next.view || (st.tg || '') !== next.id) {
        window.history.pushState({ cartaOverlay: 'together', tv: next.view, tg: next.id },
          '', tabHref('together', window.location.search, next));
      }
    } catch { /* sandboxed: the page still opens */ }
    setTogetherView(next);
    setTogetherOpen(true);
  }
  // My trips and the account hub cover the whole screen. The tab behind them
  // is inert while they are open, so Tab, a screen reader and the heading
  // outline stay inside the page the traveller is looking at (T186). React 18
  // has no boolean inert, so the attribute is written as an empty string.
  const behindPanel = savedTripsOpen || accountOpen || togetherOpen ? '' : undefined;

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
  overlayOpenRef.current = accountOpen || savedTripsOpen || togetherOpen;
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
      setTogetherOpen(false);
      setLifestyleOpen(false);
      setActiveTab(key);
    };
    if (!opts.replace && from && (key !== from || overlayOpenRef.current)) {
      // The Explore category rides along (T498), so the address names the
      // layer on screen, not a default.
      try { window.history.pushState({ cartaTab: key }, '', tabHref(key, undefined, opts.cat ? { cat: opts.cat, q: opts.q } : {})); } catch { /* sandboxed */ }
    }
    else if (opts.cat && key === from) {
      // One layer to another inside Explore: the same step, a new name.
      try {
        window.history.replaceState(window.history.state, '',
          `${tabHref(key, undefined, { cat: opts.cat, q: opts.q })}${window.location.hash}`);
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
    } else if (bootRoute?.overlay === 'together') {
      setTogetherView({ view: bootRoute.togetherView || 'home', id: bootRoute.togetherId || '' });
      setTogetherOpen(true);
    }
    // Once, at boot: bootRoute never changes.
  }, [bootRoute, setAccountOpen, setSavedTripsOpen]);

  // T809 (owner 2026-10-29): the Plan door from another place always opens
  // the Plan home, which lists every trip on this device; pressed inside
  // Plan it keeps the view on screen. (It used to return to the last Plan
  // view or the plan in progress, T496.)
  // The trip open in the planner, from the device's list of trips: the two
  // planner tabs remount when it changes, since they read their draft once.
  const activeTripId = useSyncExternalStore(tripsStore.subscribe, tripsStore.getActiveId);
  /** Load an account plan (or the device's kept trip) into the list: its own
   *  entry when it has one, else a new trip, never over another trip. */
  const openPlanInList = useCallback((planId) => {
    if (planId && typeof planId === 'object' && planId.device) {
      const key = loadDeviceTrip()?.key;
      tripsStore.openOrStart((m) => Boolean(key) && m.deviceKey === key);
    } else if (planId) {
      tripsStore.openOrStart((m) => m.planId === planId);
    }
    setPendingTripPlanId(planId);
    goToTab('trip');
  }, [goToTab]);

  // The one door for a place or a view, whatever pressed it: the header, the
  // bottom nav, the logo, Account's "How Carta works" and the home page.
  // A view key (map, places, trip, day) passes straight to goToTab.
  const goTo = (key) => {
    if (key === 'trips') { openSaved(); return; }
    if (key === 'together') { openTogether('home'); return; }
    if (key === 'account') {
      // Pressing Account on Account goes back to its first page.
      if (accountOpen) { setAccountView('home'); setAccountEntry((n) => n + 1); return; }
      openAccountAt('home');
      return;
    }
    if (key === 'explore') { goToTab('map'); return; }
    // T895 (owner, plan days board 2026-10-30): Plan always opens the Plan
    // overview, from inside a trip or a day too, so it is never a dead end.
    if (key === 'plan') { goToTab('planstart'); return; }
    goToTab(key);
  };
  // The site footer's links (T594) go through this same door: a place or view
  // key, an Explore category (opts.cat) or the FAQ in Account.
  useEffect(() => {
    setFooterNavigate((key, opts) => {
      if (key === 'faq') { openAccountAt('faq'); return; }
      if (key === 'places') { goToTab('places', { cat: opts?.cat }); return; }
      goTo(key);
    });
  });

  const [selectedId, setSelectedId] = useState(init.selectedId ?? null);

  // Pick any depart date and any return date. Trip length (nights) is derived
  // and synced into choices.trip_days for components that read it.
  const [departDate, setDepartDate] = useState(init.departDate ?? null);
  const [returnDate, setReturnDate] = useState(init.returnDate ?? null);
  // T578: how fixed the dates are. null: these dates; 'month': any days in
  // the month of departDate; 'any': whenever is cheapest. The dates stay set
  // either way, so every screen that needs a pair still has one.
  const [dateFlex, setDateFlex] = useState(init.dateFlex ?? null);
  // T663 (B7): the Explore month filter (xm) is the app's "when" while it is
  // on, so the destination page and every price follow the month the cards
  // show. ExploreTab owns the control and reports it here.
  const [exploreMonth, setExploreMonth] = useState(() => xmFromSearch(window.location.search));

  const [choices, setChoices] = useState({
    group_size: init.group_size ?? 2,   // two, stated wherever it applies (T100); data defaults no longer decide it
    // T579: of those seats, how many are children (2 to 11); babies (under 2)
    // sit on a lap and are counted apart (lib/travelWay.js partyOf).
    children: init.children ?? 0,
    babies: init.babies ?? 0,
    trip_days: 7,
    baggage_key: init.baggage_key ?? 'priority_10kg',
    baggage_per_direction_eur: 25,
    // 'any' | 'plane' | 'train' | 'bus' | 'car' (T582: the settings line's
    // way button; any way prices the cheapest that reaches a place).
    transport_mode: init.transport_mode ?? 'any',
    // How expensive to sleep: 'dorm'|'private'|'home'|'hotel3'|'hotel4'|'hotel5'.
    // Home (entire place) is the classic anchor; the rest price from measured
    // city tiers where they exist and honestly fall back where they don't.
    stay_tier: init.stay_tier ?? 'home',
    origin: init.origin ?? null,   // departure airport IATA; defaulted from data on load
    // Where a DRIVE starts: { name, lat, lon }, named by the traveller. Car
    // mode prices nothing until this is set, so a road trip is never quietly
    // costed from the departure airport (see needsDriveHome).
    drive_home: init.drive_home ?? null,
    // T860: the home airports the traveller would fly from (IATA codes the
    // sweep covers), and how they were chosen: a reach in hours (1, 2, 3)
    // or 'pick'. Empty until the reach question is answered; the flight
    // then leaves from `origin` alone, as before.
    origins: Array.isArray(init.origins) ? init.origins : [],
    airport_hours: init.airport_hours ?? null,
    lifestyle: { ...DEFAULT_LIFESTYLE, ...(init.lifestyle || {}) },
    // T694: every price per person ('pp') or for the whole group ('total').
    price_view: init.price_view === 'total' ? 'total' : 'pp',
    // T695: the items switched off in the opened price (lib/price PRICE_ITEMS).
    price_excluded: Array.isArray(init.price_excluded) ? init.price_excluded : [],
    // T764: the taste profile (lib/taste.js); null answers are "No preference".
    taste: normalizeTaste(init.taste),
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
    trackFunnel(stepOfTab(activeTab));
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

  const {
    openExploreSection, pendingStyle, setPendingStyle, planOpen, planInner, setPlanInner,
    openTripStyles, onJourneyClosed, pendingJourney, clearPendingJourney, bootJourney,
    openTripInPlanner, openTripPage, openTripForCountry, openDayForDest, openDayForFeature,
    openTripFromDay, openFeature, openJourneyPage, countryPage, setCountryPage, openCountryPage,
    leaveCountryPage, regionPushedRef, regionHandoffRef, openRegionPage,
  } = useAppOpeners({
    goToTab, setCountryFilter, setPendingBeach, setPendingCategory, setPendingCountry,
    setPendingCycle, setPendingDaySeed, setPendingLake, setPendingMountain, setPendingRegion,
    setPendingSharedTrip, setPendingTrail, setPendingTrip, setPendingTripPlanId,
    setPendingTripSeed,
  });
  // Leaving the region page for another surface: its entry stays.
  const leaveRegionPage = useCallback(() => {
    setPendingRegion((cur) => {
      if (cur) regionHandoffRef.current = true;
      return null;
    });
  }, [regionHandoffRef]);
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
  }, [pendingRegion, regionHandoffRef]);

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
  // T925: a save records the day price Carta shows at that moment, so My
  // trips can say how it moved since (lib/savedLists.js); an unsave keeps
  // the record a minute for an Undo.
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;
  const dayPricesRef = useRef(null);
  const toggleFav = useCallback((id, kind = 'dest', cc = '') => {
    const key = favKey(kind, id, cc);
    if (key) {
      if (favoritesRef.current?.has(key)) noteUnsaved(key);
      else noteSaved(key, kind === 'dest' ? dayPricesRef.current?.get?.(id)?.dayEur ?? null : null);
    }
    setFavorites((prev) => toggleFavKey(prev, kind, id, cc));
  }, []);

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
      // T933: each Account section is a step of its own.
      if (route.overlay === 'account') setAccountView(route.accountView || 'home');
      setSavedTripsOpen(route.overlay === 'trips');
      setTogetherOpen(route.overlay === 'together');
      if (route.overlay === 'together') setTogetherView({ view: route.togetherView || 'home', id: route.togetherId || '' });
      if (route.overlay) return;
      if (route.cat) setPendingCategory(route.cat);
      activeTabRef.current = route.view;
      setActiveTab(route.view);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setSavedTripsOpen, setAccountOpen, setLifestyleOpen, setCountryPage, regionPushedRef]);

  // Opening a place is one step in the history (T444, the Explore check):
  // Back, and a phone's swipe back, close the page onto the list it came
  // from instead of leaving Carta, and the address names the place (#dest=,
  // the deep link readDestFromUrl reads at boot), so it can be shared or
  // reopened. Stable, so every Explore card's memo survives parent renders.
  const openDetail = useCallback((id) => {
    if (id) trackFunnel('place_opened');
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
  } = useAppData(init, setChoices, departDate, setDepartDate, returnDate, setReturnDate, choices.origin,
    choices.origins?.length ? choices.origins : null, choices.drive_home);
  // T860: which home airports the sweep has prices for (IATA -> priced days).
  const [sweptOrigins, setSweptOrigins] = useState(null);
  useEffect(() => {
    let alive = true;
    loadSweptOrigins().then((o) => { if (alive) setSweptOrigins(o); });
    return () => { alive = false; };
  }, []);

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
  // T577: where the traveller starts, any town in Europe or their own
  // location: it becomes the start of every road and rail way, and the
  // nearest priced airport becomes the flight's origin.
  const setFrom = useCallback((placePt) => setChoices((prev) => {
    if (!placePt || !Number.isFinite(placePt.lat) || !Number.isFinite(placePt.lon)) {
      return { ...prev, drive_home: null };
    }
    const code = nearestOrigin(data, placePt) || prev.origin;
    // T860: a new town ticks its own airports at the reach already chosen
    // (a hand-picked list belonged to the old town: the default reach).
    const hours = prev.airport_hours === 'pick' ? DEFAULT_REACH : prev.airport_hours;
    const origins = hours
      ? originsWithin(airportsNear(data?.meta, placePt, { covered: sweptOrigins }), hours)
      : prev.origins;
    return {
      ...prev,
      origin: code,
      home: { lat: placePt.lat, lon: placePt.lon },
      drive_home: { name: placePt.name || '', lat: placePt.lat, lon: placePt.lon, iso2: placePt.iso2 || null, country: placePt.country || '' },
      origins: origins || [],
      airport_hours: hours || null,
    };
  }), [data, sweptOrigins]);
  // T860: the airports in reach, as the reach question and the settings
  // line's From set them: a reach in hours or 'pick', and the ticked codes.
  const setAirports = useCallback((codes, hours) => setChoices((prev) => ({
    ...prev,
    origins: Array.isArray(codes) ? [...new Set(codes)] : [],
    airport_hours: hours ?? prev.airport_hours ?? null,
  })), []);

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
  // T659: Plan's "Add a past trip" opens My trips on the past-trip form.
  const [pastAtOpen, setPastAtOpen] = useState(false);
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
      choices.children, choices.babies,
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
    locationQuery: debouncedLocationQuery, countryFilter, countryNot, priceMode, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick,
    reachHours, reachMinutes,
    initialPriceRange: init.priceRange,
  });

  // Keep the URL + localStorage in sync so the view is shareable and survives a
  // reload (debounced; runs only once data has loaded). See useUrlSync.
  // The bottom nav steps aside while a text field has focus on a phone (T401).
  useKeyboardOpen();
  useUrlSync(!!data, {
    departDate, returnDate, choices, priceMode, countryFilter, countryNot, dateFlex,
    tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, bigOnly, topPick, reachHours,
    // The address names the place on screen: a page over the view wins.
    activeTab: accountOpen ? 'account' : savedTripsOpen ? 'trips' : togetherOpen ? 'together' : activeTab,
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

  // T755: a gateway airport (#dest=CIA, a card of flight search) opens its
  // city (FCO, Rome); the address is rewritten in place, no history step.
  useEffect(() => {
    if (!data?.destinations || !selectedId) return;
    const to = gatewayCity(selectedId, data.destinations);
    if (to === selectedId) return;
    try {
      if (window.location.hash.startsWith('#dest=')) {
        window.history.replaceState({ ...(window.history.state || {}), cartaDest: to }, '',
          `${window.location.pathname}${window.location.search}#dest=${encodeURIComponent(to)}`);
      }
    } catch { /* sandboxed: the page still opens */ }
    setSelectedId(to);
  }, [data, selectedId]);

  // The Explore page's two price-level indices, computed once per dataset and
  // shared by the grid and the open destination panel.
  // Recomputed whenever the Lifestyle panel changes a stay tier, a party
  // size or a single frequency. That is 3,038 destinations repriced in about
  // 7 ms, which is why there is no loading state anywhere near it: the grid
  // simply renders the new numbers on the next frame.
  // T534: the bed prices night by night for the traveller's own dates (a
  // week across July and August pays both months); repriced when a
  // country's stays arrive. T663: every price on every screen comes from one
  // price request (lib/price/), so Carta's suggested week reads as any time,
  // a month as that month, and the Explore month filter wins (B5, B7, V7).
  const staysVersion = useStaysVersion();
  useEffect(() => {
    if (!data) return;
    setLiveBase(data.meta?.stays?.url, data.meta?.stays?.built);
    loadStaysFor(data.destinations);
  }, [data]);
  const ownDates = !!(departDate && returnDate && defaultDates
    && (departDate !== defaultDates.start || returnDate !== defaultDates.end));
  const request = useMemo(
    () => priceRequest({ choices, departDate, returnDate, dateFlex, ownDates, xm: exploreMonth }),
    [choices, departDate, returnDate, dateFlex, ownDates, exploreMonth],
  );
  const exploreIndices = useMemo(
    () => (data && staysVersion >= 0 ? priceDays(data.destinations, request) : null),
    [data, request, staysVersion],
  );
  dayPricesRef.current = exploreIndices;
  // T944: a saved place whose day price fell clearly since it was saved is
  // reported to the notify function, only for an account with price drops
  // on, at most once a day from this device (lib/priceDrop.js). Quiet.
  useEffect(() => {
    if (!user?.id || !exploreIndices || !data?.destinations || !favorites?.size || !mayAsk()) return undefined;
    let live = true;
    const timer = setTimeout(async () => {
      const res = await loadEmailPrefs(user.id);
      if (!live || res.state !== 'ok' || !res.prefs.price_drops) return;
      reportPriceDrops({
        favorites,
        meta: loadSavedLists().meta,
        priceOf: (id) => exploreIndices.get?.(id)?.dayEur ?? null,
        nameOf: (id) => data.destinations[id]?.city || '',
      });
    }, 4000);
    return () => { live = false; clearTimeout(timer); };
  }, [user?.id, exploreIndices, data, favorites]);
  // The catalogue as rows, for the country and region pages (T498), computed
  // only while one of them shows.
  const placeRows = usePlaceRows(data, exploreIndices, !!(countryPage || pendingRegion));

  // What a first-run receipt reads and writes (T099, lib/firstRunContext.js):
  // given once here, so the destination page and the trip page price the
  // same trip from the same inputs without a prop chain through each tab.
  const firstRun = useMemo(() => ({
    data, choices, setChoices, setOrigin, indices: exploreIndices, priceRequest: request,
    departDate, returnDate, setDepartDate, setReturnDate, defaultDates, dateBounds,
  }), [data, choices, setOrigin, exploreIndices, request, departDate, returnDate, defaultDates, dateBounds]);

  // The settings line's values (T381, components/SettingsLine.jsx): every
  // global input a price depends on, given once so any surface can show or
  // read them. The dates count as the traveller's own only when they differ
  // from the pair Carta picked, which is also when there is a travel month.
  const setParty = useCallback((n) => {
    setChoices((prev) => ({ ...prev, group_size: Math.max(1, Math.round(n)) }));
  }, []);
  // T579: the party as adults, children and babies. The seats (adults plus
  // children) stay group_size, which every price already reads.
  const setPartyParts = useCallback(({ adults, children, babies }) => {
    setChoices((prev) => {
      const kids = Math.max(0, Math.round(children ?? prev.children ?? 0));
      const grown = Math.max(1, Math.round(adults ?? ((prev.group_size || 2) - (prev.children || 0))));
      return { ...prev, group_size: grown + kids, children: kids, babies: Math.max(0, Math.round(babies ?? prev.babies ?? 0)) };
    });
  }, []);
  const setTransportMode = useCallback((mode) => {
    setChoices((prev) => ({ ...prev, transport_mode: mode }));
  }, []);
  const setPriceView = useCallback((view) => {
    setChoices((prev) => ({ ...prev, price_view: view === 'total' ? 'total' : 'pp' }));
  }, []);
  const setPriceExcluded = useCallback((list) => {
    setChoices((prev) => ({ ...prev, price_excluded: Array.isArray(list) ? list : [] }));
  }, []);
  // T649: the one reader of the traveller's "when" (lib/when.js); travelMonth
  // is its start month, `when` the whole answer (exact, month or any). T663:
  // the Explore month filter takes part, as it does in the price request.
  const when = useMemo(
    () => resolveWhen({ dateFlex, departDate, returnDate, ownDates, xm: exploreMonth }),
    [dateFlex, departDate, returnDate, ownDates, exploreMonth],
  );
  const travelMonth = whenMonth(when);
  const { settings } = useAppSettingsValue({
    availableCountries, choices, countryFilter, countryNot, data, dateBounds, dateFlex,
    defaultDates, departDate, exploreMonth, openLifestyle, ownDates, request, returnDate,
    setAirports, setCountryFilter, setCountryNot, setDateFlex, setDepartDate, setExploreMonth,
    setFrom, setOrigin, setParty, setPartyParts, setPriceExcluded, setPriceView, setReturnDate,
    setTransportMode, sweptOrigins, travelMonth, when,
  });

  // Which parts of the settings line each tab shows. Explore and Destinations
  // price from every input. The Trip planner keeps its own origin, dates and
  // party, so the line there carries only what it reads from the shell. The
  // landing page demonstrates its own inputs, and nothing in the Day planner
  // reads these, so neither shows a line. Hidden under My trips and Account,
  // which are pages of their own.
  // T961: on a phone, Explore and its five layers search from the dock (one
  // pill and Ask Carta) in place of the line's four buttons. A search moves
  // to the kind's view with the Where text; Places with none opens every
  // place, as its overview's empty Search did.
  const isDesktopShell = useIsDesktop();
  const dockSearch = useCallback(({ kind, q }) => {
    if (kind === 'places') {
      openExploreSection('places');
      setLocationQuery(q);
      if (!q) requestShowAll();
      return;
    }
    openExploreSection(kind, undefined, q);
  }, [openExploreSection]);
  const settingsParts = savedTripsOpen || accountOpen || togetherOpen ? null
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
  const place = accountOpen ? 'account' : savedTripsOpen ? 'trips' : togetherOpen ? 'together' : placeOf(activeTab);
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
      <header className={`top-bar${place === 'plan' && planInner ? ' is-hidden' : ''}`} ref={filterBarRef} onClick={(e) => e.stopPropagation()}>
        <AppHeader
          user={user}
          place={place}
          onNavigate={goTo}
          savedCount={savedCount}
          planInProgress={planInProgress}
        />
        {settingsParts !== null && (settingsParts === undefined && !isDesktopShell
          ? <SearchDock onSearch={dockSearch} />
          : <SettingsLine parts={settingsParts} slot />)}
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
          <SectionBoundary name="explore">
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
              countryNot={countryNot}
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
              onOpenLifestyle={openLifestyle}
              onOpenGuides={openGuides}
              onOpenCountry={openCountryPage}
              onPickCategory={openExploreSection}
              onOpenStyles={openTripStyles}
              seed={pendingExploreSeed}
              onSeedConsumed={clearExploreSeed}
              onPlanTrip={openTripInPlanner}
              onShowExplore={() => goToTab('map')}
              isMock={!!data.meta?.is_mock}
            />
          </div>

          </SectionBoundary>
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
          <SectionBoundary name="home">
          {homeVariantNow() === 'g14' ? (
            <Suspense fallback={<TabFallback />}>
              <HomeG14
                data={data}
                choices={choices}
                pageOver={!!selectedDest || savedTripsOpen || accountOpen || !!countryPage || !!pendingRegion}
                onNavigate={goTo}
                onOpenDest={openDetail}
                onOpenJourney={openJourneyPage}
              />
            </Suspense>
          ) : (
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
          )}
          </SectionBoundary>
        </div>
      )}

      {/* The Destinations tab: the catalogue and the published trips as a
          browsable section of their own. Picking a place hands over to the
          map tab, where the detail panel already knows how to price it. */}
      {visitedTabs.has('places') && (
        <div className={`explore-dest-view${activeTab === 'places' ? '' : ' tab-keep-hidden'}`} inert={behindPanel} onClick={(e) => e.stopPropagation()}>
          <SectionBoundary name="places">
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
            onJourneyClosed={onJourneyClosed}
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
          </SectionBoundary>
        </div>
      )}

      {/* Planner tabs stay MOUNTED once visited and just hide: a quick hop to
          another tab and back keeps the open plan, picks and scroll intact.
          MapLibre (v4, ResizeObserver) resizes itself when shown again. */}
      {visitedTabs.has('trip') && (
        <div className={activeTab === 'trip' ? undefined : 'tab-keep-hidden'} inert={behindPanel}>
          <SectionBoundary name="trip">
          <Suspense fallback={<TabFallback />}>
            {/* The planners read every place in full, so a tab opened while
                the catalogue is still partial (T271) waits for the rest. */}
            {partial ? <TabFallback /> : <TripPlannerTab
              key={activeTripId}
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
              onOpenJourney={openJourneyPage}
              onOpenLifestyle={openLifestyle}
              onPlanHome={() => goToTab('planstart')}
            />}
          </Suspense>
          </SectionBoundary>
        </div>
      )}
      {visitedTabs.has('day') && (
        <div className={activeTab === 'day' ? undefined : 'tab-keep-hidden'} inert={behindPanel}>
          <SectionBoundary name="day">
          <Suspense fallback={<TabFallback />}>
            {partial ? <TabFallback /> : <DayPlannerTab
              key={activeTripId}
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
              onPlanHome={() => goToTab('planstart')}
              onOpenLifestyle={openLifestyle}
              costs={exploreIndices}
              priceRequest={request}
              stayTier={choices.stay_tier || 'home'}
              lifestyle={choices.lifestyle}
              groupSize={choices.group_size || 1}
              sharedDayRaw={sharedDayRaw}
              onSharedDayConsumed={() => setSharedDayRaw(null)}
            />}
          </Suspense>
          </SectionBoundary>
        </div>
      )}

      {/* Plan with nothing in progress (T654, replacing the two tiles of
          T496): the opening, the trip-kind sheet and the setup questions.
          Not kept alive: its answers live in the planner draft. */}
      {activeTab === 'planstart' && (
        <div inert={behindPanel} onClick={(e) => e.stopPropagation()}>
          <SectionBoundary name="planstart">
          <Suspense fallback={<TabFallback />}>
            <PlanFlow
              pageOver={!!selectedDest || savedTripsOpen || accountOpen || !!countryPage || !!pendingRegion}
              onNavigate={goTo}
              onCreated={() => goTo('trip')}
              onAddPast={() => { setPastAtOpen(true); goTo('trips'); }}
              onOpenJourney={(id) => openFeature('journey', { id })}
              onOpenPlan={openPlanInList}
              openAt={planOpen}
              destinations={data?.destinations}
              onInnerChange={setPlanInner}
            />
          </Suspense>
          </SectionBoundary>
        </div>
      )}

      {/* The Trip Pass prices, a place with its own address (T496). */}
      {activeTab === 'pricing' && (
        <div inert={behindPanel} onClick={(e) => e.stopPropagation()}>
          <SectionBoundary name="pricing">
          <Suspense fallback={<TabFallback />}>
            {/* A cold /pricing visit has no page to go back to: Back opens Explore. */}
            <PricingPage onBack={() => (window.history.length > 1 ? window.history.back() : goTo('explore'))} />
          </Suspense>
          </SectionBoundary>
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
      <AppOverlays
        accountEntry={accountEntry} accountOpen={accountOpen} accountView={accountView}
        adminOpen={adminOpen} authConfigured={authConfigured} authModalMode={authModalMode}
        authModalOpen={authModalOpen} backToLabel={backToLabel} choices={choices}
        closeOverlay={closeOverlay} countryPage={countryPage} data={data}
        exploreIndices={exploreIndices} favDests={favDests} favorites={favorites} goTo={goTo}
        goToTab={goToTab} guidesOpen={guidesOpen} handleLoadTrip={handleLoadTrip}
        isFavorite={isFavorite} leaveCountryPage={leaveCountryPage}
        leaveRegionPage={leaveRegionPage} onAccountView={onAccountView}
        openDayForDest={openDayForDest} openDetail={openDetail}
        openExploreSection={openExploreSection} openFeature={openFeature}
        openFeatureFrom={openFeatureFrom} openGuides={openGuides} openLifestyle={openLifestyle}
        openPlanInList={openPlanInList} openRegionPage={openRegionPage} openSaved={openSaved}
        openTogether={openTogether} openTripForCountry={openTripForCountry}
        openTripInPlanner={openTripInPlanner} openTripStyles={openTripStyles}
        pastAtOpen={pastAtOpen} pendingFriend={pendingFriend} pendingGuide={pendingGuide}
        pendingRegion={pendingRegion} place={place} placeRows={placeRows}
        planInProgress={planInProgress} savedCount={savedCount} savedTripsOpen={savedTripsOpen}
        selectedDest={selectedDest} selectedId={selectedId} setAdminOpen={setAdminOpen}
        setAuthModalMode={setAuthModalMode} setAuthModalOpen={setAuthModalOpen}
        setCountryPage={setCountryPage} setGuidesOpen={setGuidesOpen}
        setLifestyleOpen={setLifestyleOpen} setPastAtOpen={setPastAtOpen}
        setPendingDayPlanId={setPendingDayPlanId} setPendingGuide={setPendingGuide}
        setPendingRegion={setPendingRegion} setPendingTrip={setPendingTrip}
        setSavedTripsOpen={setSavedTripsOpen} setSelectedId={setSelectedId}
        setTogetherCode={setTogetherCode} togetherCode={togetherCode}
        togetherOpen={togetherOpen} togetherView={togetherView} toggleFav={toggleFav}
        user={user}
      />

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
      {/* T947: the one "Your travel style" sheet every door opens. */}
      <TasteSheetHost />
    </div>
    </SettingsContext.Provider>
    </FirstRunContext.Provider>
    {/* ?legal=terms|privacy|imprint opens the matching text on load; the
        address Stripe Checkout and store forms point at. */}
    <LegalFromUrl />
    </PaywallProvider>
  );
}
