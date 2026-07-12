import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AppHeader } from './AppHeader.jsx';
import { FilterBar } from './FilterBar.jsx';
import { MapView } from './MapView.jsx';
import { DetailPanel } from './DetailPanel.jsx';
import { LifestylePanel } from './LifestylePanel.jsx';
import { ResultsList } from './ResultsList.jsx';
import { ComparePanel } from './ComparePanel.jsx';
import { TripPlannerTab } from './TripPlannerTab.jsx';
import { DayPlannerTab } from './DayPlannerTab.jsx';
import Logo from './Logo.jsx';
import { tripDaysBetween, DEFAULT_LIFESTYLE } from './runtime_pricing.js';
import { loadInitialState, persistState } from './urlState.js';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { AuthModal } from './auth/AuthModal.jsx';
import { AuthGate } from './auth/AuthGate.jsx';
import { ResetPasswordScreen } from './auth/ResetPasswordScreen.jsx';
import { AccountPanel } from './auth/AccountPanel.jsx';
import { useAppData } from './hooks/useAppData.js';
import { useDestinationSearch } from './hooks/useDestinationSearch.js';
import { useAccountSync } from './hooks/useAccountSync.js';

// Once someone picks "continue without an account" on the entry gate, don't
// ask again on this device - only a fresh sign-in should bring accounts back.
const GUEST_KEY = 'continent.guestMode.v1';

export default function App() {
  return (
    <AuthProvider>
      <TravelApp />
    </AuthProvider>
  );
}

function TravelApp() {
  const {
    configured: authConfigured, user, recoveryMode,
    loading: authLoading, emailConfirmed, dismissEmailConfirmed,
  } = useAuth();
  // State carried in the URL / localStorage (shareable + survives reload).
  const [init] = useState(() => loadInitialState());

  // Whether this visitor has already dismissed the entry gate as a guest.
  // Signing in overrides it automatically since `user` then takes priority.
  const [guestMode, setGuestMode] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(GUEST_KEY) === '1'
  );
  const [authModalMode, setAuthModalMode] = useState('signin');
  // Shown before any data/route decisions: sign in, create an account, or
  // continue as a guest. Skipped entirely when accounts aren't configured,
  // once already signed in, or once guest mode has been chosen before.
  const showGate = authConfigured && !authLoading && !user && !recoveryMode && !guestMode;

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
  // Trip planner, or Day planner.
  const [activeTab, setActiveTab] = useState(init.activeTab ?? 'map');

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
    lifestyle: { ...DEFAULT_LIFESTYLE, ...(init.lifestyle || {}) },
  });

  // Shortlist (favorites) + list controls - also persisted in the URL.
  const [favorites, setFavorites] = useState(() => new Set(init.favorites || []));
  const [sortKey, setSortKey] = useState(init.sortKey ?? 'beauty');
  const [showFavOnly, setShowFavOnly] = useState(init.showFavOnly ?? false);
  const [compareOpen, setCompareOpen] = useState(false);

  // Accounts: sign-in modal + account panel visibility.
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // A shared link (URL query present at load) always wins over a signed-in
  // user's synced settings, so opening someone's link never gets silently
  // overridden by your own saved preferences.
  const [cameFromUrl] = useState(() => typeof window !== 'undefined' && !!window.location.search);

  const toggleFav = (id) => setFavorites((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Sync trip_days into choices whenever the dates change
  useEffect(() => {
    const days = tripDaysBetween(departDate, returnDate);
    if (days > 0 && days !== choices.trip_days) {
      setChoices((prev) => ({ ...prev, trip_days: days }));
    }
  }, [departDate, returnDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Free-text location search (city / country). Ephemeral — not persisted in the
  // URL — and applied to the filtered set so the list AND map narrow together.
  const [locationQuery, setLocationQuery] = useState('');
  // Debounced for the actual filter/map pipeline so every keystroke doesn't
  // force MapView to reconcile markers; the input itself stays instant since
  // it reads `locationQuery`, not this.
  const [debouncedLocationQuery, setDebouncedLocationQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLocationQuery(locationQuery), 180);
    return () => clearTimeout(t);
  }, [locationQuery]);

  // View toggles
  const [priceMode, setPriceMode] = useState(init.priceMode ?? 'pp');
  const [countryFilter, setCountryFilter] = useState(init.countryFilter ?? 'all');
  const [tripKinds, setTripKinds] = useState(init.tripKinds ?? []);
  // Beauty-index filters
  const [minBeauty, setMinBeauty] = useState(init.minBeauty ?? 1);   // min gems 1-5; 1 = off (Any)
  const [unescoOnly, setUnescoOnly] = useState(init.unescoOnly ?? false);
  const [topBeachOnly, setTopBeachOnly] = useState(init.topBeachOnly ?? false);
  // Quick "best of" shortcut: { by: 'price' | 'beauty', n } or null. Trims the
  // (already filtered) results down to the N best by that metric, in list + map.
  const [topPick, setTopPick] = useState(init.topPick ?? null);
  const [lifestyleOpen, setLifestyleOpen] = useState(false);

  // Let the user collapse the destinations list to give the map the full width.
  // On phones (<=768px) it starts collapsed so the map opens as big as possible;
  // a "Destinations" pill (top-left) expands it back over the map. Desktop starts
  // expanded since there's room for both side-by-side.
  const [listCollapsed, setListCollapsed] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768
  );

  // Stable so MapView's marker effect doesn't rebuild every render.
  const openDetail = useCallback((id) => setSelectedId(id), []);

  // Fetch app_data.json, apply its defaults into `choices`, and derive the
  // fare-date bounds used to default/clamp the depart & return pickers.
  const { data, error, dateBounds } = useAppData(init, setChoices, departDate, setDepartDate, returnDate, setReturnDate);

  // Keep --filter-h in sync with the filter bar's real height. The bar uses
  // min-height + wraps its controls; everything below it is positioned at
  // top: var(--filter-h), so measuring the bar keeps the map/panels flush no
  // matter how many rows the filters wrap into. A callback ref (rather than an
  // effect keyed on some other state) so it attaches the instant the node
  // mounts - the loading/gate/data branches above can each be the one that
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

  // Price every destination for the current dates/choices, then narrow that
  // down through the location search, filter bar, and "top picks" shortcut.
  const {
    pricedAll, unreachableAll, availableCountries, priceBounds,
    priceRange, setPriceRange,
    priced, unreachable, dealThreshold, stats,
  } = useDestinationSearch({
    data, departDate, returnDate, choices,
    locationQuery: debouncedLocationQuery, countryFilter, priceMode, tripKinds,
    minBeauty, unescoOnly, topBeachOnly, topPick,
    initialPriceRange: init.priceRange,
  });

  // Keep the URL + localStorage in sync so the view is shareable and survives a
  // reload. Only after data has loaded (so we don't clobber the shared link with
  // half-initialized state).
  useEffect(() => {
    if (!data) return;
    persistState({
      departDate, returnDate, choices, priceMode, countryFilter,
      tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
      minBeauty, unescoOnly, topBeachOnly, topPick, activeTab,
    });
  }, [data, departDate, returnDate, choices, priceMode, countryFilter,
      tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
      minBeauty, unescoOnly, topBeachOnly, topPick, activeTab]);

  // Sync a signed-in user's filter/lifestyle preferences with their account,
  // and expose the "save"/"load a saved trip" actions.
  const { handleSaveTrip, handleLoadTrip } = useAccountSync({
    user, cameFromUrl,
    choices, setChoices,
    priceMode, setPriceMode,
    countryFilter, setCountryFilter,
    tripKinds, setTripKinds,
    minBeauty, setMinBeauty,
    unescoOnly, setUnescoOnly,
    topBeachOnly, setTopBeachOnly,
    sortKey, setSortKey,
    selectedId, setSelectedId,
    departDate, setDepartDate,
    returnDate, setReturnDate,
    setAccountOpen, setAuthModalOpen,
  });

  const selectedDest = data && selectedId ? data.destinations[selectedId] : null;
  // Destination used for the lifestyle panel's live preview.
  const previewDest = selectedDest || (priced[0] && data.destinations[priced[0].id]) || null;

  if (recoveryMode) {
    return <ResetPasswordScreen />;
  }

  // Resolve whether there's an existing session before deciding whether to
  // show the entry gate - otherwise a returning signed-in user would flash
  // the gate for a moment on every load.
  if (authConfigured && authLoading) {
    return (
      <div className="loading-screen">
        <Logo size={56} />
        <div className="name">Carta</div>
        <div className="sub">Charting Europe</div>
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
        <div className="sub" style={{ color: 'var(--accent)' }}>Failed to load: {error}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-mute)', maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
          The app expects <code>/app_data.json</code> at the site root.
          Run notebook 05 to regenerate it from your pipeline cache.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-screen">
        <Logo size={56} />
        <div className="name">Carta</div>
        <div className="sub">Charting Europe</div>
        <div className="pulse" />
      </div>
    );
  }

  return (
    <div className={`app ${listCollapsed ? 'list-collapsed' : ''}`} onClick={() => setSelectedId(null)}>
      <div className="top-bar" ref={filterBarRef} onClick={(e) => e.stopPropagation()}>
        <AppHeader
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          user={user}
          onOpenAccount={() => setAccountOpen(true)}
        />
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
            minBeauty={minBeauty}
            setMinBeauty={setMinBeauty}
            unescoOnly={unescoOnly}
            setUnescoOnly={setUnescoOnly}
            topBeachOnly={topBeachOnly}
            setTopBeachOnly={setTopBeachOnly}
            topPick={topPick}
            setTopPick={setTopPick}
          />
        )}
      </div>

      {activeTab === 'map' && (
        <>
          <div onClick={(e) => e.stopPropagation()}>
            <ResultsList
              priced={priced}
              unreachable={topPick ? [] : unreachable}
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
              onOpenCompare={() => setCompareOpen(true)}
              reachableCount={pricedAll.length}
              totalCount={Object.keys(data.destinations).length}
              homeCity={data.meta?.home_city || 'Brussels'}
              transportMode={choices.transport_mode || 'plane'}
              onCollapse={() => setListCollapsed(true)}
            />
          </div>

          {/* Reopen tab — only visible (via CSS) when the list is collapsed. */}
          <div onClick={(e) => e.stopPropagation()}>
            <button
              className="list-reopen"
              onClick={() => setListCollapsed(false)}
              title="Show the destinations list"
              aria-label="Show the destinations list"
            >
              <span className="chev">›</span>
              <span>Destinations</span>
            </button>
          </div>

          <MapView
            priced={priced}
            unreachable={topPick ? [] : unreachable}
            priceMode={priceMode}
            groupSize={choices.group_size}
            selectedId={selectedId}
            onSelect={openDetail}
            dealThreshold={dealThreshold}
          />

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
                data={data}
                choices={choices}
                setChoices={setChoices}
                previewDest={previewDest}
                departDate={departDate}
                returnDate={returnDate}
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
        </>
      )}

      {activeTab === 'trip' && (
        <TripPlannerTab
          data={data}
          user={user}
          authConfigured={authConfigured}
          onRequestAuth={() => setAuthModalOpen(true)}
        />
      )}
      {activeTab === 'day' && <DayPlannerTab />}

      {authConfigured && authModalOpen && (
        <AuthModal initialMode={authModalMode} onClose={() => setAuthModalOpen(false)} />
      )}
      {accountOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <AccountPanel
            onClose={() => setAccountOpen(false)}
            onLoadTrip={handleLoadTrip}
            onOpenAuth={() => { setAccountOpen(false); setAuthModalMode('signin'); setAuthModalOpen(true); }}
            onOpenLifestyle={() => { setAccountOpen(false); setLifestyleOpen(true); }}
          />
        </div>
      )}

      {emailConfirmed && (
        <div className="confirm-toast" role="status" onClick={(e) => e.stopPropagation()}>
          <span className="confirm-toast-check">✓</span>
          Email confirmed — welcome to Carta.
          <button
            className="confirm-toast-close"
            onClick={dismissEmailConfirmed}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
