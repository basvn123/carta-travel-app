import React, { useEffect, useRef, useMemo } from 'react';
import maplibregl from 'maplibre-gl';

// Carto Voyager — clean, beige, no API key needed
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export function MapView({ priced, unreachable = [], priceMode = 'total', groupSize = 1, selectedId, onSelect, dealThreshold }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

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
    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render markers whenever the priced list changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Add new markers
    // Structure:
    //   <div.marker-root>            ← MapLibre positions this; we don't style its width
    //     <div.price-pill>€XXX</div> ← the visible label (inline-block, hugs content)
    //     <div.pin-dot/>             ← tiny circle at the exact lat/lon
    //   </div>
    for (const p of priced) {
      const root = document.createElement('div');
      root.className = `marker-root ${p.tier === 'gem' ? 'is-gem' : 'is-airport'}`;

      const isDeal = dealThreshold != null && p.total <= dealThreshold;
      const isSelected = p.id === selectedId;

      // Display value depends on priceMode (and uses pp value pre-computed in App)
      const displayVal = priceMode === 'pp' ? p.pp : p.total;

      const pill = document.createElement('div');
      pill.className = `price-pill ${isDeal ? 'is-deal' : ''} ${isSelected ? 'selected' : ''} ${p.tier === 'gem' ? 'is-gem' : ''}`;
      pill.textContent = `€${formatPrice(displayVal)}`;
      pill.title = `${p.city}, ${p.country}${p.tier === 'gem' ? ' · gem' : ''}${priceMode === 'pp' ? ' · per person' : ''}`;
      root.appendChild(pill);

      const dot = document.createElement('div');
      dot.className = `pin-dot ${isDeal ? 'is-deal' : ''} ${isSelected ? 'selected' : ''} ${p.tier === 'gem' ? 'is-gem' : ''}`;
      root.appendChild(dot);

      root.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(p.id);
      });

      // anchor: 'bottom' means the marker_root's bottom-center sits on lat/lon
      // → the dot lands exactly on the city, the pill floats above it
      const marker = new maplibregl.Marker({ element: root, anchor: 'bottom' })
        .setLngLat([p.lon, p.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }

    // Unreachable destinations: shown as a muted, clickable dot (no price) so they
    // still appear on the map but read clearly as "can't get there via Ryanair".
    for (const p of unreachable) {
      const root = document.createElement('div');
      root.className = 'marker-root is-unreachable';
      root.style.cursor = 'pointer';

      const dot = document.createElement('div');
      const isSelected = p.id === selectedId;
      Object.assign(dot.style, {
        width: isSelected ? '11px' : '8px',
        height: isSelected ? '11px' : '8px',
        borderRadius: '50%',
        background: 'rgba(120,120,120,0.45)',
        border: '1px solid rgba(90,90,90,0.6)',
        boxShadow: isSelected ? '0 0 0 3px rgba(120,120,120,0.25)' : 'none',
      });
      root.appendChild(dot);
      root.title = `${p.city}, ${p.country} (unreachable via Ryanair)`;
      root.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelect(p.id);
      });

      const marker = new maplibregl.Marker({ element: root, anchor: 'center' })
        .setLngLat([p.lon, p.lat])
        .addTo(map);
      markersRef.current.push(marker);
    }
  }, [priced, unreachable, priceMode, selectedId, dealThreshold, onSelect]);

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

function formatPrice(n) {
  if (n == null) return '-';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  return Math.round(n).toLocaleString('en-GB');
}
