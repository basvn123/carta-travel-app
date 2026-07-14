import React, { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapLegend } from './MapLegend.jsx';

// Carto Voyager - clean, beige, no API key needed
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// The same glyphs as the "Travel by" toggle (TransportIcons.jsx), inlined as
// markup because markers are hand-built DOM, not React. currentColor keeps them
// legible on every pill state - default, deal (white on rust), selected.
const SVG_OPEN = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const PLANE_SVG = `${SVG_OPEN}<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;
const CAR_SVG = `${SVG_OPEN}<path d="M4 13l1.4-4.1A2 2 0 0 1 7.3 7.5h9.4a2 2 0 0 1 1.9 1.4L20 13"/><path d="M3 13h18v3.5a1 1 0 0 1-1 1h-1.5"/><path d="M5.5 17.5H4a1 1 0 0 1-1-1V13"/><path d="M8.5 17.5h7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg>`;

export function MapView({
  priced, unreachable = [], priceMode = 'total', groupSize = 1,
  selectedId, onSelect, dealThreshold, transportMode = 'plane',
}) {
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

      // Travelling by plane, but this one has no flight? The engine still prices
      // it - quietly, as a drive - and a €-pill would read as a flight fare. So
      // it drops to a hollow dot: still on the map, still clickable, just never
      // labelled with a price you can't actually fly for.
      const carOnly = transportMode === 'plane' && !p.planeOk;
      if (carOnly) {
        let rec = cache.get(p.id);
        if (!rec || rec.kind !== 'caronly') {
          if (rec) { rec.marker.remove(); cache.delete(p.id); }
          rec = createDot(p, map, onSelectRef, 'caronly',
            `${p.city}, ${p.country} - no flight from your airport; drivable`);
          cache.set(p.id, rec);
        }
        rec.dot.className = `pin-dot is-caronly ${p.id === selectedRef.current ? 'selected' : ''}`;
        continue;
      }

      const isDeal = dealThreshold != null && p.total <= dealThreshold;
      const isSelected = p.id === selectedRef.current;
      const displayVal = priceMode === 'pp' ? p.pp : p.total;
      const label = `€${formatPrice(displayVal)}`;
      const byCar = p.mode === 'car';

      let rec = cache.get(p.id);
      if (!rec || rec.kind !== 'priced') {
        if (rec) { rec.marker.remove(); cache.delete(p.id); }
        rec = createPriced(p, map, onSelectRef);
        cache.set(p.id, rec);
      }
      // Cheap in-place updates (text + classes only). The icon is only rewritten
      // when the mode actually flips, so it isn't re-parsed on every keystroke.
      if (rec.val.textContent !== label) rec.val.textContent = label;
      if (rec.mode !== p.mode) {
        rec.icon.innerHTML = byCar ? CAR_SVG : PLANE_SVG;
        rec.mode = p.mode;
      }
      const gem = !!p.rating?.hidden_gem;
      const top = (p.rating?.tier ?? 0) === 3;
      rec.pill.className = `price-pill ${isDeal ? 'is-deal' : ''} ${isSelected ? 'selected' : ''} ${gem ? 'is-gem' : ''} ${top ? 'is-top' : ''}`;
      rec.dot.className = `pin-dot ${isDeal ? 'is-deal' : ''} ${isSelected ? 'selected' : ''} ${gem ? 'is-gem' : ''} ${top ? 'is-top' : ''}`;
      rec.pill.title = tooltip(p, byCar, priceMode);
    }

    // ── Unreachable destinations: a muted, clickable dot (no price) ──
    for (const p of unreachable) {
      seen.add(p.id);
      let rec = cache.get(p.id);
      if (!rec || rec.kind !== 'unreachable') {
        if (rec) { rec.marker.remove(); cache.delete(p.id); }
        rec = createDot(p, map, onSelectRef, 'unreachable',
          `${p.city}, ${p.country} - no flight and too far to drive`);
        cache.set(p.id, rec);
      }
      rec.dot.className = `pin-dot is-unreach ${p.id === selectedRef.current ? 'selected' : ''}`;
    }

    // ── Drop markers no longer in the visible set ──
    for (const [id, rec] of cache) {
      if (!seen.has(id)) { rec.marker.remove(); cache.delete(id); }
    }
  }, [priced, unreachable, priceMode, dealThreshold, transportMode]);

  // Selection styling only - a cheap class toggle on existing marker DOM, with
  // NO marker rebuild. Runs on every selection change.
  useEffect(() => {
    const cache = markersRef.current;
    for (const [id, rec] of cache) {
      const on = id === selectedId;
      rec.dot.classList.toggle('selected', on);
      if (rec.pill) rec.pill.classList.toggle('selected', on);
    }
  }, [selectedId]);

  // Pan to selected destination - ONLY when the selection itself changes.
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

  // Only meaningful in plane mode - see the carOnly branch above.
  const carOnlyCount = useMemo(
    () => (transportMode === 'plane' ? priced.filter((p) => !p.planeOk).length : 0),
    [priced, transportMode],
  );

  return (
    <div className="map-wrap">
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <MapLegend
        transportMode={transportMode}
        counts={{ carOnly: carOnlyCount, unreachable: unreachable.length }}
      />
    </div>
  );
}

// Build a priced marker (price pill + dot). Position is fixed for the id, so the
// marker is created once and only its classes/text are updated afterwards.
function createPriced(p, map, onSelectRef) {
  const root = document.createElement('div');
  root.className = `marker-root ${p.tier === 'gem' ? 'is-gem' : 'is-airport'}`;

  const pill = document.createElement('div');
  // The transport glyph rides inside the pill, so how you'd get there is legible
  // at a glance without spending the colour axis (already taken by "deal").
  const icon = document.createElement('span');
  icon.className = 'pill-ico';
  const val = document.createElement('span');
  pill.appendChild(icon);
  pill.appendChild(val);
  root.appendChild(pill);

  const dot = document.createElement('div');
  root.appendChild(dot);

  root.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelectRef.current(p.id);
  });

  // anchor: 'bottom' - the dot lands exactly on the city, the pill floats above.
  const marker = new maplibregl.Marker({ element: root, anchor: 'bottom' })
    .setLngLat([p.lon, p.lat])
    .addTo(map);
  return { marker, root, pill, icon, val, dot, mode: null, kind: 'priced' };
}

// A bare clickable dot, no price: either "drivable but no flight" (plane mode) or
// "can't get there at all". Styling lives in CSS, keyed off the dot's class.
function createDot(p, map, onSelectRef, kind, title) {
  const root = document.createElement('div');
  root.className = `marker-root is-${kind}`;
  root.style.cursor = 'pointer';
  root.title = title;

  const dot = document.createElement('div');
  root.appendChild(dot);

  root.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelectRef.current(p.id);
  });

  const marker = new maplibregl.Marker({ element: root, anchor: 'center' })
    .setLngLat([p.lon, p.lat])
    .addTo(map);
  return { marker, root, dot, kind };
}

// Say how the price is made up, so a pill is never ambiguous on hover.
function tooltip(p, byCar, priceMode) {
  const bits = [`${p.city}, ${p.country}`];
  if (p.rating?.score != null) {
    bits.push(p.rating.label
      ? `${p.rating.score}/10, ${p.rating.label.toLowerCase()}`
      : `${p.rating.score}/10`);
  }
  if (p.rating?.hidden_gem) bits.push('hidden gem');
  if (byCar) {
    bits.push('drive');
  } else if (p.viaAirport) {
    const leg = p.viaAirport.kind === 'rental' ? 'rental car' : 'shuttle';
    bits.push(`fly to ${p.viaAirport.city} (${p.viaAirport.iata}), ${p.viaAirport.road_km} km by ${leg}`);
  } else {
    bits.push('fly');
  }
  if (priceMode === 'pp') bits.push('per person');
  return `${bits[0]} (${bits.slice(1).join(', ')})`;
}

function formatPrice(n) {
  if (n == null) return '-';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  return Math.round(n).toLocaleString('en-GB');
}
