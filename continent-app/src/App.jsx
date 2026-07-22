import React, { useState, useEffect, useRef, useCallback, useMemo, Suspense, lazy } from 'react';
import { AppHeader } from './components/AppHeader.jsx';
import { FilterBar } from './browse/FilterBar.jsx';
import { BottomNav } from './components/BottomNav.jsx';
import { DetailPanel } from './browse/DetailPanel.jsx';
import { LifestylePanel } from './browse/LifestylePanel.jsx';
import { ResultsList } from './browse/ResultsList.jsx';
import { ComparePanel } from './browse/ComparePanel.jsx';
import { InfoIcon } from './components/Icons.jsx';
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

// Code-split the map (maplibre-gl is by far the heaviest dependency) and the
// two planner tabs, so the first paint only ships the browse UI shell.
const MapView = lazyWithReload(() => import('./map/MapView.jsx').then((m) => ({ default: m.MapView })));
const TripPlannerTab = lazyWithReload(() => import('./planner/TripPlannerTab.jsx').then((m) => ({ default: m.TripPlannerTab })));
const DayPlannerTab = lazyWithReload(() => import('./planner/DayPlannerTab.jsx').then((m) => ({ default: m.DayPlannerTab })));

// A quiet placeholder while a lazy chunk downloads (fast; usually one frame).
function TabFallback() {
  return <div className="loading-screen"><div className="pulse" /></div>;
}
import { tripDaysBetween, DEFAULT_LIFESTYLE } from './lib/runtime_pricing.js';
import { loadInitialState } from './lib/urlState.js';
import { readTripShareFromUrl, decodeTripShare } from './lib/shareLink.js';
import { loadTripDraft } from './planner/tripDraftStore.js';
import { bindDayPlanCloud } from './planner/dayPlanSync.js';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { I18nProvider, useI18n } from './i18n/index.jsx';
import { AuthModal } from './auth/AuthModal.jsx';
import { AuthGate } from './auth/AuthGate.jsx';
import { ResetPasswordScreen } from './auth/ResetPasswordScreen.jsx';
import { AccountPanel } from './auth/AccountPanel.jsx';
import { SavedTripsPanel } from './auth/SavedTripsPanel.jsx';
import { originHome } from './lib/origins.js';
import { useAppData } from './hooks/useAppData.js';
import { useDestinationSearch } from './hooks/useDestinationSearch.js';
import { useAccountSync } from './hooks/useAccountSync.js';
import { useUrlSync } from './hooks/useUrlSync.js';
import { usePanelState } from './hooks/usePanelState.js';
import { useFilterState } from './hooks/useFilterState.js';

// Once someone picks "continue without an account" on the entry gate, don't
// ask again on this device, only a fresh sign-in should bring accounts back.
const GUEST_KEY = 'continent.guestMode.v1';


export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <TravelApp />
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
    compareOpen, setCompareOpen, authModalOpen, setAuthModalOpen,
    authModalMode, setAuthModalMode, accountOpen, setAccountOpen,
    savedTripsOpen, setSavedTripsOpen, lifestyleOpen, setLifestyleOpen,
  } = usePanelState();
  const {
    priceMode, setPriceMode, countryFilter, setCountryFilter,
    tripKinds, setTripKinds, ratingRange, setRatingRange, gemOnly, setGemOnly,
    unescoOnly, setUnescoOnly, topBeachOnly, setTopBeachOnly,
    topPick, setTopPick, sortKey, setSortKey, showFavOnly, setShowFavOnly,
  } = useFilterState(init);

  // Whether this visitor has already dismissed the entry gate as a guest.
  // Signing in overrides it automatically since `user` then takes priority.
  const [guestMode, setGuestMode] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(GUEST_KEY) === '1'
  );
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

  // Which top-level section is showing: Map (the browse/search experience),
  // Trip planner, or Day planner. Always open on the map, regardless of which
  // tab was showing on the last visit.
  const [activeTab, setActiveTab] = useState('map');

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
    origin: init.origin ?? null,   // departure airport IATA; defaulted from data on load
    lifestyle: { ...DEFAULT_LIFESTYLE, ...(init.lifestyle || {}) },
  });

  // Shortlist (favorites) + list controls, also persisted in the URL.
  const [favorites, setFavorites] = useState(() => new Set(init.favorites || []));

  // Planner tabs mount on first visit and then stay alive (hidden) so a quick
  // look at another tab never wipes an in-progress plan.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(['map']));
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
  const [sharedTripRaw] = useState(() => readTripShareFromUrl());
  const [sharedTrip, setSharedTrip] = useState(null);
  const [pendingSharedTrip, setPendingSharedTrip] = useState(null);
  useEffect(() => {
    if (!sharedTripRaw) return undefined;
    let live = true;
    decodeTripShare(sharedTripRaw).then((d) => { if (live && d) setSharedTrip(d); });
    return () => { live = false; };
  }, [sharedTripRaw]);

  // Stable identity: this lands on every ResultsList row, so a fresh function
  // per render would defeat the list's React.memo.
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
  // force MapView to reconcile markers; the input itself stays instant since
  // it reads `locationQuery`, not this.
  const [debouncedLocationQuery, setDebouncedLocationQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLocationQuery(locationQuery), 180);
    return () => clearTimeout(t);
  }, [locationQuery]);


  // Persistent guidance pill anchored to the top bar. It's always available on
  // the map tab so first-timers can re-open the "how this works" tip any time.
  // The tip is collapsed to a small pill by default so it never crowds the map;
  // tapping the pill expands the text in a popover that overlays the map rather
  // than pushing it down.
  const [mapGuideOpen, setMapGuideOpen] = useState(false);
  // Once the visitor has clicked any destination they have "started": the
  // START HERE pill has done its job and must not keep floating over the map.
  // Persisted so it stays gone on the next visit too.
  const [mapGuideDone, setMapGuideDone] = useState(() => {
    try { return localStorage.getItem('carta.mapGuideDone') === '1'; } catch { return false; }
  });

  // Greet the FIRST visit with the "built for Ryanair budget travel" notice so
  // it's clear other airlines aren't in the data yet, then stay quiet: the
  // Ryanair context remains available via the persistent "start here" guide
  // pill and the per-price confidence pills. Persisted so a returning visitor
  // isn't re-interrupted on every map visit.
  const [fareNoticeDismissed, setFareNoticeDismissed] = useState(() => {
    try { return localStorage.getItem('carta.fareNoticeSeen') === '1'; } catch { return false; }
  });
  const dismissFareNotice = () => {
    setFareNoticeDismissed(true);
    try { localStorage.setItem('carta.fareNoticeSeen', '1'); } catch { /* private mode */ }
  };

  // Escape closes the top-most dismissable surface (fare notice, then the
  // shared-trip offer, then the destination detail). Gives keyboard users a way
  // out that the click-outside backdrop alone never provided.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (!fareNoticeDismissed) { dismissFareNotice(); return; }
      if (sharedTrip) { setSharedTrip(null); return; }
      if (selectedId) { setSelectedId(null); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fareNoticeDismissed, sharedTrip, selectedId]);

  // Let the user collapse the destinations list to give the map the full width.
  // On phones (<=768px) it starts collapsed so the map opens as big as possible;
  // a "Destinations" pill (top-left) expands it back over the map. Desktop starts
  // expanded since there's room for both side-by-side.
  const [listCollapsed, setListCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  // Stable so MapView's marker effect doesn't rebuild every render.
  const openDetail = useCallback((id) => {
    setSelectedId(id);
    setMapGuideOpen(false);
    setMapGuideDone(true);
    try { localStorage.setItem('carta.mapGuideDone', '1'); } catch { /* private mode */ }
  }, []);
  const collapseList = useCallback(() => setListCollapsed(true), []);
  const openCompare = useCallback(() => setCompareOpen(true), []);
  // "Top picks" hides the unreachable set; a fresh [] every render would
  // re-render the memoized list/map for nothing, so keep one empty constant.
  const noUnreachable = useRef([]).current;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [choices.group_size, choices.baggage_key, choices.baggage_per_direction_eur,
      choices.transport_mode, choices.origin, choices.home, choices.lifestyle,
      choices.origin_pref, choices.car_model, choices.accommodation_model],
  );

  // Price every destination for the current dates/choices, then narrow that
  // down through the location search, filter bar, and "top picks" shortcut.
  const {
    pricedAll, unreachableAll, availableCountries, priceBounds,
    priceRange, setPriceRange,
    priced, unreachable, dealThreshold, stats,
  } = useDestinationSearch({
    data, departDate, returnDate, choices: pricingChoices,
    locationQuery: debouncedLocationQuery, countryFilter, priceMode, tripKinds,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, topPick,
    initialPriceRange: init.priceRange,
  });

  // Keep the URL + localStorage in sync so the view is shareable and survives a
  // reload (debounced; runs only once data has loaded). See useUrlSync.
  useUrlSync(!!data, {
    departDate, returnDate, choices, priceMode, countryFilter,
    tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
    ratingRange, gemOnly, unescoOnly, topBeachOnly, topPick, activeTab,
  });

  // Sync a signed-in user's filter/lifestyle preferences with their account,
  // and expose the "save"/"load a saved trip" actions.
  const { handleSaveTrip, handleLoadTrip } = useAccountSync({
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

  if (recoveryMode) {
    return <ResetPasswordScreen />;
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
    <div className={`app ${listCollapsed ? 'list-collapsed' : ''}`} onClick={() => setSelectedId(null)}>
      <div className="top-bar" ref={filterBarRef} onClick={(e) => e.stopPropagation()}>
        <AppHeader
          user={user}
          onOpenAccount={() => setAccountOpen(true)}
          isHome={activeTab === 'map'}
          onGoHome={() => setActiveTab('map')}
          activeTab={activeTab}
          onChangeTab={(key) => { setSavedTripsOpen(false); setActiveTab(key); }}
          savedOpen={savedTripsOpen}
          onToggleSaved={() => setSavedTripsOpen((v) => !v)}
          data={data}
          origin={choices.origin}
          onChangeOrigin={setOrigin}
        >
          {activeTab === 'map' && (
            <FilterBar
              data={data}
              choices={choices}
              setChoices={setChoices}
              departDate={departDate}
              setDepartDate={setDepartDate}
              returnDate={returnDate}
              setReturnDate={setReturnDate}
              dateBounds={dateBounds}
              stats={stats}
              priceMode={priceMode}
              setPriceMode={setPriceMode}
              countryFilter={countryFilter}
              setCountryFilter={setCountryFilter}
              availableCountries={availableCountries}
              priceRange={priceRange}
              setPriceRange={setPriceRange}
              priceBounds={priceBounds}
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
              topPick={topPick}
              setTopPick={setTopPick}
              onOpenLifestyle={() => setLifestyleOpen(true)}
            />
          )}
        </AppHeader>

        {/* Guidance tip: a small floating pill anchored to the bottom-right of
            the header. It's absolutely positioned, so its height is NOT folded
            into --filter-h - the map fills the space right under the header and
            the expanded text overlays the map instead of pushing it down.
            Hidden while a slide-over panel is up: it would float on top of the
            panel with nothing behind it to point at. */}
        {activeTab === 'map' && !accountOpen && !savedTripsOpen && !mapGuideDone && (
          <div className={`map-guide ${mapGuideOpen ? 'open' : ''}`} role="note">
            <button
              className="map-guide-toggle"
              onClick={() => setMapGuideOpen((v) => !v)}
              aria-expanded={mapGuideOpen}
            >
              <InfoIcon size={13} />
              <span>{t('guide.startHere')}</span>
              <span className="map-guide-caret" aria-hidden="true">▾</span>
            </button>
            {mapGuideOpen && (
              <div className="map-guide-pop">
                <p className="map-guide-text">
                  {t('guide.text')}
                </p>
                <button className="map-guide-dismiss" onClick={() => setMapGuideOpen(false)}>
                  {t('common.gotIt')}
                </button>
              </div>
            )}
          </div>
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

      {/* Every open: the fares-source notice, front and centre over the map.
          It waits while a shared-trip offer is on screen (one dialog at a time,
          and the deep link is what the visitor came for). */}
      {activeTab === 'map' && !fareNoticeDismissed && !sharedTrip && (
        <div className="guide-overlay fare-notice-overlay" onClick={dismissFareNotice}>
          <div className="guide-modal fare-notice" onClick={(e) => e.stopPropagation()}>
            <h2 className="guide-title">{t('fareNotice.title')}</h2>
            <p className="fare-notice-text">
              {t('fareNotice.body1')}
            </p>
            <p className="fare-notice-text">
              {t('fareNotice.body2')}
            </p>
            <button className="guide-next fare-notice-btn" onClick={dismissFareNotice}>{t('common.gotIt')}</button>
          </div>
        </div>
      )}

      {/* The map tab gets the same keep-alive as the planners: destroying it
          on every tab hop meant a full MapLibre teardown + rebuild (style,
          tiles, WebGL context, ~1500 markers) on every return to Home. The
          wrapper div is unpositioned, so the absolutely-placed panels inside
          keep anchoring to .app exactly as before. */}
      {visitedTabs.has('map') && (
        <div className={activeTab === 'map' ? undefined : 'tab-keep-hidden'}>
          <div onClick={(e) => e.stopPropagation()}>
            <ResultsList
              priced={priced}
              unreachable={topPick ? noUnreachable : unreachable}
              locationQuery={locationQuery}
              setLocationQuery={setLocationQuery}
              priceMode={priceMode}
              dealThreshold={dealThreshold}
              selectedId={selectedId}
              onSelect={openDetail}
              favorites={favorites}
              onToggleFav={toggleFav}
              sortKey={sortKey}
              setSortKey={setSortKey}
              showFavOnly={showFavOnly}
              setShowFavOnly={setShowFavOnly}
              onOpenCompare={openCompare}
              reachableCount={pricedAll.length}
              totalCount={Object.keys(data.destinations).length}
              homeCity={data.meta?.origins?.[data.meta?.selected_origin]?.city || data.meta?.home_city || 'your airport'}
              transportMode={choices.transport_mode || 'plane'}
              onCollapse={collapseList}
            />
          </div>

          {/* Reopen tab - only visible (via CSS) when the list is collapsed. */}
          <div onClick={(e) => e.stopPropagation()}>
            <button
              className="list-reopen"
              onClick={() => setListCollapsed(false)}
              title={t('results.showListTitle')}
              aria-label={t('results.showListTitle')}
            >
              <span className="chev">›</span>
              <span>{t('results.destinations')}</span>
            </button>
          </div>

          <Suspense fallback={null}>
            <MapView
              priced={priced}
              unreachable={topPick ? noUnreachable : unreachable}
              priceMode={priceMode}
              groupSize={choices.group_size}
              selectedId={selectedId}
              onSelect={openDetail}
              dealThreshold={dealThreshold}
              transportMode={choices.transport_mode || 'plane'}
            />
          </Suspense>

          {data.meta?.is_mock && (
            <div style={{
              position: 'absolute', top: 'calc(var(--filter-h) + 12px)',
              left: 'calc(var(--panel-w) + 16px)',
              fontFamily: 'var(--mono)', fontSize: 10,
              background: 'var(--accent-bg)', color: 'var(--accent)',
              padding: '4px 10px', borderRadius: 999,
              textTransform: 'uppercase', letterSpacing: '0.12em',
              zIndex: 5, pointerEvents: 'none',
            }}>
              Mock data
            </div>
          )}

          {lifestyleOpen && (
            <div onClick={(e) => e.stopPropagation()}>
              <LifestylePanel
                choices={choices}
                setChoices={setChoices}
                onClose={() => setLifestyleOpen(false)}
              />
            </div>
          )}

          <div onClick={(e) => e.stopPropagation()}>
            <DetailPanel
              destination={selectedDest}
              departDate={departDate}
              returnDate={returnDate}
              choices={choices}
              setChoices={setChoices}
              priceMode={priceMode}
              onClose={() => setSelectedId(null)}
              onOpenLifestyle={() => setLifestyleOpen(true)}
              onSelect={openDetail}
              data={data}
              isFavorite={selectedId ? favorites.has(selectedId) : false}
              onToggleFavorite={selectedId ? () => toggleFav(selectedId) : undefined}
              onSaveTrip={authConfigured ? handleSaveTrip : undefined}
              onShiftDates={(depart, ret) => { setDepartDate(depart); setReturnDate(ret); }}
            />
          </div>

          {compareOpen && favorites.size >= 2 && (
            <div onClick={(e) => e.stopPropagation()}>
              <ComparePanel
                data={data}
                favorites={favorites}
                departDate={departDate}
                returnDate={returnDate}
                choices={choices}
                priceMode={priceMode}
                onClose={() => setCompareOpen(false)}
                onSelect={(id) => { setCompareOpen(false); openDetail(id); }}
                onToggleFav={toggleFav}
              />
            </div>
          )}
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
          onChangeTab={(key) => { setSavedTripsOpen(false); setActiveTab(key); }}
          savedOpen={savedTripsOpen}
          onToggleSaved={() => setSavedTripsOpen((v) => !v)}
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
            onClose={() => setAccountOpen(false)}
            onOpenAuth={() => { setAccountOpen(false); setAuthModalMode('signin'); setAuthModalOpen(true); }}
          />
        </div>
      )}

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
