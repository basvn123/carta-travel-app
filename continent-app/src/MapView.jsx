import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

// Carto Voyager — clean, beige, no API key needed
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export function MapView({ priced, unreachable = [], priceMode = 'total', groupSize = 1, selectedId, onSelect, dealThreshold }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  // id -> { marker, root, pill, dot, kind } so we can reconcile (reuse DOM)
  // instead of tearing every marker down on each filter/search keystroke.
  const markersRef = useRef(new Map());
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  // onSelect is stable in App (useCallback), but read via ref so reused marker
  // click handlers never capture a stale reference.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Initialize map once
  useEffect(() => {
    if (mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [10, 51],     // central Europe
      zoom: 3.6,
      attributionControl: { compact: true },
      maxBounds: [[-30, 30], [50, 72]],   // soft Europe bounds
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Reconcile markers whenever the visible set / price display changes.
  // Existing markers are updated in place; only genuinely new ids create DOM and
  // only removed ids tear it down. This is what keeps searching/filtering smooth.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const cache = markersRef.current;
    const seen = new Set();

    // ── Priced destinations: price pill + dot ──
    for (const p of priced) {
      seen.add(p.id);
      const isDeal = dealThreshold != null && p.total <= dealThreshold;
      const isSelected = p.id === selectedRef.current;
      const displayVal = priceMode === 'pp' ? p.pp : p.total;
      const label = `€${formatPrice(displayVal)}`;

      let rec = cache.get(p.id);
      if (!rec || rec.kind !== 'priced') {
        if (rec) { rec.marker.remove(); cache.delete(p.id); }
        rec = createPriced(p, map, onSelectRef);
        cache.set(p.id, rec);
      }
      // Cheap in-place updates (text + classes only).
      if (rec.pill.textContent !== label) rec.pill.textContent = label;
      const gem = p.tier === 'gem';
      rec.pill.className = `price-pill ${isDeal ? 'is-deal' : ''} ${isSelected ? 'selected' : ''} ${gem ? 'is-gem' : ''}`;
      rec.dot.className = `pin-dot ${isDeal ? 'is-deal' : ''} ${isSelected ? 'selected' : ''} ${gem ? 'is-gem' : ''}`;
      rec.pill.title = `${p.city}, ${p.country}${gem ? ' (gem)' : ''}${priceMode === 'pp' ? ' (per person)' : ''}`;
    }

    // ── Unreachable destinations: a muted, clickable dot (no price) ──
    for (const p of unreachable) {
      seen.add(p.id);
      const isSelected = p.id === selectedRef.current;
      let rec = cache.get(p.id);
      if (!rec || rec.kind !== 'unreachable') {
        if (rec) { rec.marker.remove(); cache.delete(p.id); }
        rec = createUnreachable(p, map, onSelectRef);
        cache.set(p.id, rec);
      }
      styleUnreachableDot(rec.dot, isSelected);
    }

    // ── Drop markers no longer in the visible set ──
    for (const [id, rec] of cache) {
      if (!seen.has(id)) { rec.marker.remove(); cache.delete(id); }
    }
  }, [priced, unreachable, priceMode, dealThreshold]);

  // Selection styling only — a cheap class toggle on existing marker DOM, with
  // NO marker rebuild. Runs on every selection change.
  useEffect(() => {
    const cache = markersRef.current;
    for (const [id, rec] of cache) {
      const on = id === selectedId;
      if (rec.kind === 'priced') {
        rec.pill.classList.toggle('selected', on);
        rec.dot.classList.toggle('selected', on);
      } else {
        styleUnreachableDot(rec.dot, on);
      }
    }
  }, [selectedId]);

  // Pan to selected destination — ONLY when the selection itself changes.
  // We deliberately do NOT depend on priced/unreachable: those arrays get new
  // references on every filter tick (e.g. dragging the Beauty slider), and
  // re-running flyTo on each would keep yanking the map back to the selected pin,
  // making it impossible to pan/zoom by hand. Latest lists are read via refs.
  const pricedRef = useRef(priced);
  const unreachableRef = useRef(unreachable);
  pricedRef.current = priced;
  unreachableRef.current = unreachable;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const sel = pricedRef.current.find((p) => p.id === selectedId)
      || unreachableRef.current.find((p) => p.id === selectedId);
    if (!sel) return;
    map.flyTo({
      center: [sel.lon, sel.lat],
      zoom: Math.max(map.getZoom(), 5.2),
      // shift the centre so the marker sits left of the side panel
      offset: [-220, 0],
      duration: 700,
    });
  }, [selectedId]);

  return (
    <div className="map-wrap">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// Build a priced marker (price pill + dot). Position is fixed for the id, so the
// marker is created once and only its classes/text are updated afterwards.
function createPriced(p, map, onSelectRef) {
  const root = document.createElement('div');
  root.className = `marker-root ${p.tier === 'gem' ? 'is-gem' : 'is-airport'}`;

  const pill = document.createElement('div');
  root.appendChild(pill);

  const dot = document.createElement('div');
  root.appendChild(dot);

  root.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelectRef.current(p.id);
  });

  // anchor: 'bottom' — the dot lands exactly on the city, the pill floats above.
  const marker = new maplibregl.Marker({ element: root, anchor: 'bottom' })
    .setLngLat([p.lon, p.lat])
    .addTo(map);
  return { marker, root, pill, dot, kind: 'priced' };
}

function createUnreachable(p, map, onSelectRef) {
  const root = document.createElement('div');
  root.className = 'marker-root is-unreachable';
  root.style.cursor = 'pointer';

  const dot = document.createElement('div');
  root.appendChild(dot);
  root.title = `${p.city}, ${p.country} (unreachable via Ryanair)`;
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelectRef.current(p.id);
  });

  const marker = new maplibregl.Marker({ element: root, anchor: 'center' })
    .setLngLat([p.lon, p.lat])
    .addTo(map);
  return { marker, root, dot, kind: 'unreachable' };
}

function styleUnreachableDot(dot, isSelected) {
  Object.assign(dot.style, {
    width: isSelected ? '11px' : '8px',
    height: isSelected ? '11px' : '8px',
    borderRadius: '50%',
    background: 'rgba(120,120,120,0.45)',
    border: '1px solid rgba(90,90,90,0.6)',
    boxShadow: isSelected ? '0 0 0 3px rgba(120,120,120,0.25)' : 'none',
  });
}

function formatPrice(n) {
  if (n == null) return '-';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  return Math.round(n).toLocaleString('en-GB');
}
