import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { FilterBar } from './FilterBar.jsx';
import { MapView } from './MapView.jsx';
import { DetailPanel } from './DetailPanel.jsx';
import { LifestylePanel } from './LifestylePanel.jsx';
import { ResultsList } from './ResultsList.jsx';
import { ComparePanel } from './ComparePanel.jsx';
import Logo from './Logo.jsx';
import { cheapestTotal, tripDaysBetween, DEFAULT_LIFESTYLE } from './runtime_pricing.js';
import { matchesAnyKind } from './trip_kinds.js';
import { loadInitialState, persistState } from './urlState.js';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { AuthModal } from './auth/AuthModal.jsx';
import { ResetPasswordScreen } from './auth/ResetPasswordScreen.jsx';
import { AccountPanel } from './auth/AccountPanel.jsx';
import { saveTrip, fetchUserSettings, saveUserSettings } from './auth/tripStorage.js';

// Accent- and case-insensitive text key, so "malaga" matches "Málaga".
const normalize = (s) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export default function App() {
  return (
    <AuthProvider>
      <TravelApp />
    </AuthProvider>
  );
}

function TravelApp() {
  const { configured: authConfigured, user, recoveryMode } = useAuth();
  // State carried in the URL / localStorage (shareable + survives reload).
  const [init] = useState(() => loadInitialState());

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
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
  const [sortKey, setSortKey] = useState(init.sortKey ?? 'price');
  const [showFavOnly, setShowFavOnly] = useState(init.showFavOnly ?? false);
  const [compareOpen, setCompareOpen] = useState(false);

  // Accounts: sign-in modal + account panel visibility.
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  // A shared link (URL query present at load) always wins over a signed-in
  // user's synced settings, so opening someone's link never gets silently
  // overridden by your own saved preferences.
  const [cameFromUrl] = useState(() => typeof window !== 'undefined' && !!window.location.search);
  const settingsAppliedRef = useRef(false);

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

  // View toggles
  const [priceMode, setPriceMode] = useState(init.priceMode ?? 'pp');
  const [countryFilter, setCountryFilter] = useState(init.countryFilter ?? 'all');
  const [priceRange, setPriceRange] = useState(null);
  const [tripKinds, setTripKinds] = useState(init.tripKinds ?? []);
  // Beauty-index filters
  const [minBeauty, setMinBeauty] = useState(init.minBeauty ?? 1);   // min gems 1-5; 1 = off (Any)
  const [unescoOnly, setUnescoOnly] = useState(init.unescoOnly ?? false);
  const [topBeachOnly, setTopBeachOnly] = useState(init.topBeachOnly ?? false);
  // Quick "best of" shortcut: { by: 'price' | 'beauty', n } or null. Trims the
  // (already filtered) results down to the N best by that metric, in list + map.
  const [topPick, setTopPick] = useState(init.topPick ?? null);
  const [lifestyleOpen, setLifestyleOpen] = useState(false);

  // Mobile-only: which pane is in front (map vs the ranked list). On desktop both
  // show side-by-side, so this is ignored; the CSS only acts on it under 768px.
  const [mobileView, setMobileView] = useState('list');

  // Desktop: let the user collapse the left destinations list to give the map the
  // full width. (On mobile the bottom Map/List tabs already do this.)
  const [listCollapsed, setListCollapsed] = useState(false);

  // Stable so MapView's marker effect doesn't rebuild every render.
  const openDetail = useCallback((id) => setSelectedId(id), []);

  // Keep --filter-h in sync with the filter bar's real height. The bar uses
  // min-height + wraps its controls; everything below it is positioned at
  // top: var(--filter-h), so measuring the bar keeps the map/panels flush no
  // matter how many rows the filters wrap into.
  const filterBarRef = useRef(null);
  useEffect(() => {
    const el = filterBarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const apply = () => {
      document.documentElement.style.setProperty('--filter-h', `${el.offsetHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  // Load app data
  useEffect(() => {
    fetch('/app_data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => {
        setData(j);
        const def = j.meta?.defaults;
        if (def) {
          setChoices((prev) => {
            // URL/stored values (held in `init`) win over the data defaults.
            const baggageKey = init.baggage_key ?? def.baggage ?? prev.baggage_key;
            return {
              ...prev,
              group_size: init.group_size ?? def.group_size ?? prev.group_size,
              trip_days: def.trip_length_days ?? prev.trip_days,
              baggage_key: baggageKey,
              baggage_per_direction_eur:
                j.meta.baggage_options?.[baggageKey]?.per_direction_eur ?? prev.baggage_per_direction_eur,
              transport_mode: init.transport_mode ?? prev.transport_mode,
              lifestyle: { ...prev.lifestyle, ...(def.lifestyle || {}), ...(init.lifestyle || {}) },
              accommodation_model: j.meta.accommodation_model ?? prev.accommodation_model,
              car_model: j.meta.car_model ?? prev.car_model,
              home: j.meta.home ?? prev.home,
            };
          });
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  // Earliest outbound + latest return date found in any destination's routes.
  const dateBounds = useMemo(() => {
    if (!data) return null;
    let minOut = null;
    let maxRet = null;
    for (const d of Object.values(data.destinations)) {
      const routes = d.routes || {};
      for (const r of Object.values(routes)) {
        for (const x of Object.keys(r.outbound_fare || {})) {
          if (minOut == null || x < minOut) minOut = x;
        }
        for (const x of Object.keys(r.return_fare || {})) {
          if (maxRet == null || x > maxRet) maxRet = x;
        }
      }
    }
    return minOut && maxRet ? { min: minOut, max: maxRet } : null;
  }, [data]);

  // Default depart/return when data first loads
  useEffect(() => {
    if (!dateBounds) return;
    if (!departDate) setDepartDate(dateBounds.min);
    if (!returnDate && dateBounds.min) {
      const d = new Date(dateBounds.min + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 7);
      const candidate = d.toISOString().slice(0, 10);
      setReturnDate(candidate <= dateBounds.max ? candidate : dateBounds.max);
    }
  }, [dateBounds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute, in one pass, the priceable destinations (flight/drive + stay) and the
  // ones that can't be reached from home (no Ryanair route + not drivable). The
  // unreachable ones are still surfaced in the UI, just flagged - never silently
  // dropped.
  const { pricedAll, unreachableAll } = useMemo(() => {
    if (!data || !departDate || !returnDate || returnDate <= departDate) {
      return { pricedAll: [], unreachableAll: [] };
    }
    const reach = [], unreach = [];
    for (const [destId, d] of Object.entries(data.destinations)) {
      if (d.lat == null || d.lon == null) continue;
      const row = {
        id: destId,
        // Airports use their own IATA; gems fly to their anchor airport.
        iata: d.iata || d.anchor_airport,
        tier: d.tier,
        city: d.city,
        country: d.country,
        iso2: d.iso2,
        lat: d.lat,
        lon: d.lon,
        categories: d.categories || [],
        beauty: d.beauty || null,
      };
      const total = cheapestTotal(d, departDate, returnDate, choices);
      if (total == null) {
        unreach.push({ ...row, total: null, pp: null, reachable: false });
      } else {
        const pp = choices.group_size > 0 ? total / choices.group_size : total;
        reach.push({ ...row, total, pp, reachable: true });
      }
    }
    reach.sort((a, b) => a.total - b.total);
    unreach.sort((a, b) => a.city.localeCompare(b.city));
    return { pricedAll: reach, unreachableAll: unreach };
  }, [data, departDate, returnDate, choices]);

  const availableCountries = useMemo(() => {
    const map = new Map();
    for (const p of [...pricedAll, ...unreachableAll]) {
      if (!map.has(p.iso2)) map.set(p.iso2, p.country);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pricedAll, unreachableAll]);

  const priceBounds = useMemo(() => {
    if (pricedAll.length === 0) return null;
    const vals = pricedAll.map((p) => priceMode === 'pp' ? p.pp : p.total);
    return [Math.floor(Math.min(...vals)), Math.ceil(Math.max(...vals))];
  }, [pricedAll, priceMode]);

  // On the first time bounds are known, honor a shared price range; afterwards
  // (e.g. when the price mode flips) snap back to the full bounds.
  const initRangeApplied = useRef(false);
  useEffect(() => {
    if (!priceBounds) return;
    if (!initRangeApplied.current && init.priceRange) {
      initRangeApplied.current = true;
      setPriceRange(init.priceRange);
    } else {
      setPriceRange(priceBounds);
    }
  }, [priceBounds]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = useMemo(() => normalize(locationQuery), [locationQuery]);

  const filtered = useMemo(() => {
    return pricedAll.filter((p) => {
      if (q && !(normalize(p.city).includes(q) || normalize(p.country).includes(q))) return false;
      if (countryFilter !== 'all' && p.iso2 !== countryFilter) return false;
      if (priceRange) {
        const v = priceMode === 'pp' ? p.pp : p.total;
        if (v < priceRange[0] || v > priceRange[1]) return false;
      }
      if (tripKinds.length > 0) {
        if (!matchesAnyKind(p.categories, tripKinds)) return false;
      }
      if (minBeauty > 1 && (p.beauty?.gems ?? 0) < minBeauty) return false;
      if (unescoOnly && !p.beauty?.unesco) return false;
      if (topBeachOnly && !p.beauty?.top_beach) return false;
      return true;
    });
  }, [pricedAll, q, countryFilter, priceRange, priceMode, tripKinds, minBeauty, unescoOnly, topBeachOnly]);

  // "Top picks" trims the filtered set to the N best by price or beauty. Applied
  // here (not just in the list) so the map and stats reflect the shortlist too.
  const priced = useMemo(() => {
    if (!topPick) return filtered;
    const score = topPick.by === 'beauty'
      ? (p) => -(p.beauty?.score ?? 0)                       // most beautiful first
      : (p) => (priceMode === 'pp' ? p.pp : p.total);        // cheapest first
    return [...filtered].sort((a, b) => score(a) - score(b)).slice(0, topPick.n);
  }, [filtered, topPick, priceMode]);

  // Unreachable destinations to still surface (same country / trip-kind filters,
  // but no price filter - they have no price).
  const unreachable = useMemo(() => {
    return unreachableAll.filter((p) => {
      if (q && !(normalize(p.city).includes(q) || normalize(p.country).includes(q))) return false;
      if (countryFilter !== 'all' && p.iso2 !== countryFilter) return false;
      if (tripKinds.length > 0 && !matchesAnyKind(p.categories, tripKinds)) return false;
      if (minBeauty > 1 && (p.beauty?.gems ?? 0) < minBeauty) return false;
      if (unescoOnly && !p.beauty?.unesco) return false;
      if (topBeachOnly && !p.beauty?.top_beach) return false;
      return true;
    });
  }, [unreachableAll, q, countryFilter, tripKinds, minBeauty, unescoOnly, topBeachOnly]);

  const dealThreshold = useMemo(() => {
    if (priced.length === 0) return null;
    const idx = Math.floor(priced.length * 0.25);
    const sorted = [...priced].sort((a, b) => a.total - b.total);
    return sorted[idx]?.total ?? null;
  }, [priced]);

  const stats = useMemo(() => {
    if (priced.length === 0) return { priced: 0, min: null };
    const minVal = priceMode === 'pp'
      ? Math.min(...priced.map((p) => p.pp))
      : Math.min(...priced.map((p) => p.total));
    return { priced: priced.length, total: pricedAll.length, min: Math.round(minVal) };
  }, [priced, pricedAll, priceMode]);

  // Keep the URL + localStorage in sync so the view is shareable and survives a
  // reload. Only after data has loaded (so we don't clobber the shared link with
  // half-initialized state).
  useEffect(() => {
    if (!data) return;
    persistState({
      departDate, returnDate, choices, priceMode, countryFilter,
      tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
      minBeauty, unescoOnly, topBeachOnly, topPick,
    });
  }, [data, departDate, returnDate, choices, priceMode, countryFilter,
      tripKinds, priceRange, priceBounds, selectedId, favorites, sortKey, showFavOnly,
      minBeauty, unescoOnly, topBeachOnly, topPick]);

  // Pull the signed-in user's saved settings once, right after login (never
  // when a shared link is already driving the view - see cameFromUrl above).
  useEffect(() => {
    if (!user || cameFromUrl || settingsAppliedRef.current) return;
    settingsAppliedRef.current = true;
    fetchUserSettings(user.id).then((settings) => {
      if (!settings) return;
      if (settings.choices) setChoices((prev) => ({ ...prev, ...settings.choices }));
      if (settings.priceMode) setPriceMode(settings.priceMode);
      if (settings.countryFilter) setCountryFilter(settings.countryFilter);
      if (settings.tripKinds) setTripKinds(settings.tripKinds);
      if (settings.minBeauty) setMinBeauty(settings.minBeauty);
      if (settings.unescoOnly != null) setUnescoOnly(settings.unescoOnly);
      if (settings.topBeachOnly != null) setTopBeachOnly(settings.topBeachOnly);
      if (settings.sortKey) setSortKey(settings.sortKey);
    }).catch(() => {});
  }, [user, cameFromUrl]);

  // Keep the signed-in user's settings synced (debounced) so they carry over
  // to their next visit/device.
  useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      saveUserSettings(user.id, {
        choices, priceMode, countryFilter, tripKinds, minBeauty, unescoOnly, topBeachOnly, sortKey,
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [user, choices, priceMode, countryFilter, tripKinds, minBeauty, unescoOnly, topBeachOnly, sortKey]);

  const handleSaveTrip = useCallback(async (destination) => {
    if (!user) { setAuthModalOpen(true); throw new Error('Sign in to save trips'); }
    await saveTrip(user.id, {
      destinationId: selectedId,
      city: destination.city,
      country: destination.country,
      departDate, returnDate, choices,
    });
  }, [user, selectedId, departDate, returnDate, choices]);

  const handleLoadTrip = useCallback((trip) => {
    setSelectedId(trip.destination_id);
    if (trip.depart_date) setDepartDate(trip.depart_date);
    if (trip.return_date) setReturnDate(trip.return_date);
    if (trip.choices) setChoices((prev) => ({ ...prev, ...trip.choices }));
    setAccountOpen(false);
  }, []);

  const selectedDest = data && selectedId ? data.destinations[selectedId] : null;
  // Destination used for the lifestyle panel's live preview.
  const previewDest = selectedDest || (priced[0] && data.destinations[priced[0].id]) || null;

  if (recoveryMode) {
    return <ResetPasswordScreen />;
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
    <div className={`app mobile-${mobileView} ${listCollapsed ? 'list-collapsed' : ''}`} onClick={() => setSelectedId(null)}>
      <div onClick={(e) => e.stopPropagation()}>
        <FilterBar
          barRef={filterBarRef}
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
          lifestyleOpen={lifestyleOpen}
          onToggleLifestyle={() => setLifestyleOpen((v) => !v)}
          authConfigured={authConfigured}
          user={user}
          onOpenAuth={() => setAuthModalOpen(true)}
          onOpenAccount={() => setAccountOpen(true)}
        />
      </div>

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

      {/* Bottom tab bar — only rendered visible under 768px (see styles.css).
          The map and the ranked list overlap on a phone, so this switches which
          one is in front. */}
      <nav className="mobile-nav" onClick={(e) => e.stopPropagation()}>
        <button
          className={mobileView === 'list' ? 'on' : ''}
          onClick={() => setMobileView('list')}
          aria-pressed={mobileView === 'list'}
        >
          <span className="mobile-nav-label">List</span>
          <span className="mobile-nav-sub">{stats.priced} places</span>
        </button>
        <button
          className={mobileView === 'map' ? 'on' : ''}
          onClick={() => setMobileView('map')}
          aria-pressed={mobileView === 'map'}
        >
          <span className="mobile-nav-label">Map</span>
          <span className="mobile-nav-sub">explore</span>
        </button>
      </nav>

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

      {authConfigured && authModalOpen && (
        <AuthModal onClose={() => setAuthModalOpen(false)} />
      )}
      {authConfigured && accountOpen && user && (
        <div onClick={(e) => e.stopPropagation()}>
          <AccountPanel onClose={() => setAccountOpen(false)} onLoadTrip={handleLoadTrip} />
        </div>
      )}
    </div>
  );
}
