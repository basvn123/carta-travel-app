import React, { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapLegend } from './MapLegend.jsx';
import { hasLngLat } from './coords.js';

// Carto Voyager, clean, beige, no API key needed
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// The same glyphs as the "Travel by" toggle (TransportIcons.jsx), inlined as
// markup for the single selected-destination DOM marker.
const SVG_OPEN = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const PLANE_SVG = `${SVG_OPEN}<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`;
const CAR_SVG = `${SVG_OPEN}<path d="M4 13l1.4-4.1A2 2 0 0 1 7.3 7.5h9.4a2 2 0 0 1 1.9 1.4L20 13"/><path d="M3 13h18v3.5a1 1 0 0 1-1 1h-1.5"/><path d="M5.5 17.5H4a1 1 0 0 1-1-1V13"/><path d="M8.5 17.5h7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/></svg>`;

// The app palette, mirrored for the WebGL layers (CSS vars can't reach them).
const INK = '#1a1a1a';
const PAPER = '#f5f1e8';
const ACCENT = '#c8501e';

const SRC_PRICED = 'carta-priced';
const SRC_DOTS = 'carta-dots';
const LYR_PRICED_DOT = 'carta-priced-dot';
const LYR_PRICED_LABEL = 'carta-priced-label';
const LYR_DOTS = 'carta-dots-layer';
// Carto Voyager ships Montserrat glyphs; the fallbacks cover style changes.
const LABEL_FONT = ['Montserrat Medium', 'Open Sans Regular', 'Noto Sans Regular'];

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/**
 * The browse map. Up to ~1,600 destinations are visible at once, so everything
 * except the SELECTED destination renders as WebGL layers (a circle per city,
 * a collision-managed €-price symbol above it) instead of per-destination DOM
 * markers, DOM markers cost a style recalculation per marker per frame while
 * panning, which is exactly the "map feels heavy" cliff. The selected
 * destination alone gets the full DOM pill (transport glyph, tooltip, hover),
 * floated above the layers. A welcome side effect of symbol collision: the map
 * self-declutters at low zoom and reveals more prices as you zoom in.
 */
export function MapView({
  priced, unreachable = [], priceMode = 'total', groupSize = 1,
  selectedId, onSelect, dealThreshold, transportMode = 'plane',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const selectedMarkerRef = useRef(null); // the one DOM marker (selected dest)
  const dataRef = useRef({ pricedFC: EMPTY_FC, dotsFC: EMPTY_FC });
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

    map.on('load', () => {
      ensureLayers(map);
      map.getSource(SRC_PRICED)?.setData(dataRef.current.pricedFC);
      map.getSource(SRC_DOTS)?.setData(dataRef.current.dotsFC);
    });

    // Feature interactions. stopPropagation on the ORIGINAL event: the app
    // root's click handler clears the selection, and without it a tap that
    // selects a pin would bubble up and instantly deselect it again.
    const pick = (e) => {
      const f = e.features?.[0];
      if (!f) return;
      e.originalEvent?.stopPropagation();
      onSelectRef.current(f.properties.id);
    };
    const tipEl = document.createElement('div');
    const tip = new maplibregl.Popup({
      closeButton: false, closeOnClick: false, offset: 14, className: 'map-tip',
    }).setDOMContent(tipEl);
    for (const layer of [LYR_PRICED_LABEL, LYR_PRICED_DOT, LYR_DOTS]) {
      map.on('click', layer, pick);
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; tip.remove(); });
      map.on('mousemove', layer, (e) => {
        const f = e.features?.[0];
        if (!f?.properties?.tip) return;
        const [lon, lat] = f.geometry?.coordinates || [];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        // Third-party-ish data goes in as text, never markup.
        tipEl.textContent = f.properties.tip;
        tip.setLngLat([lon, lat]).addTo(map);
      });
    }

    mapRef.current = map;
    return () => {
      tip.remove();
      selectedMarkerRef.current?.marker.remove();
      selectedMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Rebuild the GeoJSON whenever the visible set / price display changes.
  // setData on ~1,600 points is a couple of milliseconds, the expensive
  // "reconcile 1,600 DOM nodes" path this replaces is gone entirely.
  useEffect(() => {
    const pricedFeatures = [];
    const dotFeatures = [];
    for (const p of priced) {
      if (!hasLngLat(p)) continue;
      // Travelling by plane, but this one has no flight? The engine still
      // prices it, quietly, as a drive, and a €-label would read as a fare.
      // It drops to a hollow dot: still there, still clickable.
      const carOnly = transportMode === 'plane' && !p.planeOk;
      if (carOnly) {
        dotFeatures.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: {
            id: p.id, kind: 'caronly',
            tip: `${p.city}, ${p.country} - no flight from your airport; drivable`,
          },
        });
        continue;
      }
      const isDeal = dealThreshold != null && p.total <= dealThreshold;
      const displayVal = priceMode === 'pp' ? p.pp : p.total;
      pricedFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          id: p.id,
          label: `€${formatPrice(displayVal)}`,
          deal: isDeal ? 1 : 0,
          gem: p.rating?.hidden_gem ? 1 : 0,
          top: (p.rating?.tier ?? 0) === 3 ? 1 : 0,
          // Cheaper wins the collision fight, so the decluttered far-out view
          // is "the best deals across Europe", not an arbitrary subset.
          sort: displayVal ?? 99999,
          tip: tooltip(p, p.mode === 'car', priceMode),
        },
      });
    }
    for (const p of unreachable) {
      if (!hasLngLat(p)) continue;
      dotFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          id: p.id, kind: 'unreach',
          tip: `${p.city}, ${p.country} - no flight and too far to drive`,
        },
      });
    }
    const pricedFC = { type: 'FeatureCollection', features: pricedFeatures };
    const dotsFC = { type: 'FeatureCollection', features: dotFeatures };
    dataRef.current = { pricedFC, dotsFC };

    const map = mapRef.current;
    if (map && map.getSource(SRC_PRICED)) {
      map.getSource(SRC_PRICED).setData(pricedFC);
      map.getSource(SRC_DOTS).setData(dotsFC);
    }
  }, [priced, unreachable, priceMode, dealThreshold, transportMode]);

  // Latest lists via refs for the selection effects below (the arrays get new
  // identities on every filter tick; the effects must not re-run on those).
  const pricedRef = useRef(priced);
  const unreachableRef = useRef(unreachable);
  pricedRef.current = priced;
  unreachableRef.current = unreachable;
  const displayCtxRef = useRef({ priceMode, dealThreshold, transportMode });
  displayCtxRef.current = { priceMode, dealThreshold, transportMode };

  // Selection: hide the selected feature from the layers and float a single
  // full DOM pill (glyph, hover, tooltip) in its place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getLayer(LYR_PRICED_LABEL)) return;
      const keep = ['!=', ['get', 'id'], selectedId ?? '___none___'];
      map.setFilter(LYR_PRICED_LABEL, keep);
      map.setFilter(LYR_PRICED_DOT, keep);
      map.setFilter(LYR_DOTS, keep);
    };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);

    selectedMarkerRef.current?.marker.remove();
    selectedMarkerRef.current = null;
    if (!selectedId) return;

    const { priceMode: pm, dealThreshold: deal, transportMode: tm } = displayCtxRef.current;
    const p = pricedRef.current.find((x) => x.id === selectedId);
    if (p && hasLngLat(p)) {
      const carOnly = tm === 'plane' && !p.planeOk;
      selectedMarkerRef.current = carOnly
        ? createDot(p, map, onSelectRef, 'caronly', `${p.city}, ${p.country} - no flight from your airport; drivable`, true)
        : createPriced(p, map, onSelectRef, pm, deal);
      return;
    }
    const u = unreachableRef.current.find((x) => x.id === selectedId);
    if (u && hasLngLat(u)) {
      selectedMarkerRef.current = createDot(u, map, onSelectRef, 'unreachable', `${u.city}, ${u.country} - no flight and too far to drive`, true);
    }
  }, [selectedId, priced, unreachable, priceMode, dealThreshold, transportMode]);

  // Pan to selected destination, ONLY when the selection itself changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedId) return;
    const sel = pricedRef.current.find((p) => p.id === selectedId)
      || unreachableRef.current.find((p) => p.id === selectedId);
    if (!sel || !hasLngLat(sel)) return;
    map.flyTo({
      center: [sel.lon, sel.lat],
      zoom: Math.max(map.getZoom(), 5.2),
      // shift the centre so the marker sits left of the side panel
      offset: [-220, 0],
      duration: 700,
    });
  }, [selectedId]);

  // Only meaningful in plane mode, see the carOnly branch above.
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

// Sources + layers, idempotent (guarded by getSource). Order matters: dots
// under priced dots under labels.
function ensureLayers(map) {
  if (map.getSource(SRC_PRICED)) return;
  map.addSource(SRC_PRICED, { type: 'geojson', data: EMPTY_FC });
  map.addSource(SRC_DOTS, { type: 'geojson', data: EMPTY_FC });

  // Muted dots: hollow ring = drivable-but-no-flight, filled grey = unreachable
  // (mirrors .pin-dot.is-caronly / .is-unreach).
  map.addLayer({
    id: LYR_DOTS,
    type: 'circle',
    source: SRC_DOTS,
    paint: {
      'circle-radius': 3.5,
      'circle-color': ['case', ['==', ['get', 'kind'], 'caronly'], PAPER, 'rgba(120,120,120,0.45)'],
      'circle-stroke-width': ['case', ['==', ['get', 'kind'], 'caronly'], 1.5, 1],
      'circle-stroke-color': ['case', ['==', ['get', 'kind'], 'caronly'], 'rgba(120,120,120,0.75)', 'rgba(90,90,90,0.6)'],
    },
  });

  // The city dot under each price (mirrors .pin-dot: ink, rust for deals,
  // hollow for hidden gems).
  map.addLayer({
    id: LYR_PRICED_DOT,
    type: 'circle',
    source: SRC_PRICED,
    paint: {
      'circle-radius': ['case', ['==', ['get', 'gem'], 1], 2.5, 3],
      'circle-color': ['case',
        ['==', ['get', 'gem'], 1], PAPER,
        ['==', ['get', 'deal'], 1], ACCENT,
        INK],
      'circle-stroke-width': ['case', ['==', ['get', 'gem'], 1], 1.5, 1.5],
      'circle-stroke-color': ['case',
        ['==', ['get', 'gem'], 1], ['case', ['==', ['get', 'deal'], 1], ACCENT, INK],
        PAPER],
    },
  });

  // The €-price, floating above its dot (mirrors .price-pill: ink on paper,
  // rust for deals; gems italic). Symbol collision keeps the view legible.
  map.addLayer({
    id: LYR_PRICED_LABEL,
    type: 'symbol',
    source: SRC_PRICED,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': LABEL_FONT,
      'text-size': 11.5,
      'text-offset': [0, -1.05],
      'text-anchor': 'bottom',
      'symbol-sort-key': ['get', 'sort'],
      'text-padding': 1,
    },
    paint: {
      'text-color': ['case',
        ['==', ['get', 'deal'], 1], ACCENT,
        ['==', ['get', 'top'], 1], INK,
        INK],
      'text-halo-color': PAPER,
      'text-halo-width': 1.6,
    },
  });
}

// The selected destination's full DOM pill (price + transport glyph + dot),
// identical to the old per-destination markers, now built exactly once.
function createPriced(p, map, onSelectRef, priceMode, dealThreshold) {
  const isDeal = dealThreshold != null && p.total <= dealThreshold;
  const gem = !!p.rating?.hidden_gem;
  const top = (p.rating?.tier ?? 0) === 3;
  const byCar = p.mode === 'car';
  const displayVal = priceMode === 'pp' ? p.pp : p.total;

  const root = document.createElement('div');
  root.className = `marker-root ${p.tier === 'gem' ? 'is-gem' : 'is-airport'}`;

  const pill = document.createElement('div');
  pill.className = `price-pill selected ${isDeal ? 'is-deal' : ''} ${gem ? 'is-gem' : ''} ${top ? 'is-top' : ''}`;
  pill.title = tooltip(p, byCar, priceMode);
  const icon = document.createElement('span');
  icon.className = 'pill-ico';
  icon.innerHTML = byCar ? CAR_SVG : PLANE_SVG;
  const val = document.createElement('span');
  val.textContent = `€${formatPrice(displayVal)}`;
  pill.append(icon, val);
  root.appendChild(pill);

  const dot = document.createElement('div');
  dot.className = `pin-dot selected ${isDeal ? 'is-deal' : ''} ${gem ? 'is-gem' : ''} ${top ? 'is-top' : ''}`;
  root.appendChild(dot);

  root.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelectRef.current(p.id);
  });

  // anchor: 'bottom', the dot lands exactly on the city, the pill floats above.
  const marker = new maplibregl.Marker({ element: root, anchor: 'bottom' })
    .setLngLat([p.lon, p.lat])
    .addTo(map);
  return { marker };
}

// A bare clickable dot for a selected car-only/unreachable destination.
function createDot(p, map, onSelectRef, kind, title, selected = false) {
  const root = document.createElement('div');
  root.className = `marker-root is-${kind}`;
  root.style.cursor = 'pointer';
  root.title = title;

  const dot = document.createElement('div');
  dot.className = `pin-dot ${kind === 'caronly' ? 'is-caronly' : 'is-unreach'} ${selected ? 'selected' : ''}`;
  root.appendChild(dot);

  root.addEventListener('click', (e) => {
    e.stopPropagation();
    onSelectRef.current(p.id);
  });

  const marker = new maplibregl.Marker({ element: root, anchor: 'center' })
    .setLngLat([p.lon, p.lat])
    .addTo(map);
  return { marker };
}

// Say how the price is made up, so a label is never ambiguous on hover.
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
