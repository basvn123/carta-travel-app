import React, { useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapLegend } from './MapLegend.jsx';
import { hasLngLat } from './coords.js';
import { fareProv, fareAgeText } from '../components/FareProvenance.jsx';
import { useI18n } from '../i18n/index.jsx';

// Carto Voyager, clean, beige, no API key needed
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// The same glyphs as the "Travel by" toggle (TransportIcons.jsx). The path
// bodies are shared between the DOM markup (selected pin, hover card) and the
// rasterised map images used by the WebGL price labels (addTransportIcons).
const PLANE_PATH = '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>';
const CAR_PATH = '<path d="M4 13l1.4-4.1A2 2 0 0 1 7.3 7.5h9.4a2 2 0 0 1 1.9 1.4L20 13"/><path d="M3 13h18v3.5a1 1 0 0 1-1 1h-1.5"/><path d="M5.5 17.5H4a1 1 0 0 1-1-1V13"/><path d="M8.5 17.5h7"/><circle cx="7" cy="17.5" r="1.6"/><circle cx="17" cy="17.5" r="1.6"/>';
const SVG_OPEN = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const PLANE_SVG = `${SVG_OPEN}${PLANE_PATH}</svg>`;
const CAR_SVG = `${SVG_OPEN}${CAR_PATH}</svg>`;
// Glyph SVG for baking into the price pills. Matches the legend's line glyphs
// (TransportIcons.jsx): 1.7 stroke on the 24 viewBox, rendered at its exact
// device size so the browser rasterises the vector 1:1 (no upscaling blur).
// Solid black stroke is only the alpha mask - tintGlyph() recolours it.
const iconSvg = (inner, px) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${px}" height="${px}" fill="none" stroke="#000" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
// A baked pill per (mode, deal): rounded border + a legend-matched transport
// glyph on the left, with a 9-slice stretch band so icon-text-fit sizes it to
// the €-price. Mirrors .price-pill (paper/ink, rust for deals). Dims are LOGICAL
// px; PR supersamples the bitmap so the glyph stays crisp on hi-dpi screens.
const PILL = { PR: 3, h: 18, r: 4, b: 1, padL: 6, glyph: 13, gap: 4, padR: 8 };
const pillName = (mode, deal) => `pill-${mode}${deal ? '-deal' : ''}`;
// Faceted diamond, matching GemRating.jsx, for the hover card's hidden-gem tag.
const GEM_SVG = '<svg viewBox="0 0 24 24" width="9" height="9" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 L19 9 L12 21 L5 9 Z"/></svg>';

// The app palette, mirrored for the WebGL layers (CSS vars can't reach them).
// Keep in lockstep with styles.css :root (--ink / --paper / --accent): the
// pill bitmaps are canvas-baked from these, so a token change must be
// mirrored here by hand.
const INK = '#0f172a';
const PAPER = '#f8f6f0';
const ACCENT = '#e05a47';

const SRC_PRICED = 'carta-priced';
const SRC_DOTS = 'carta-dots';
const LYR_PRICED_DOT = 'carta-priced-dot';
const LYR_PRICED_LABEL = 'carta-priced-label';
const LYR_PRICED_LABEL_FAR = 'carta-priced-label-far';
const LYR_DOTS = 'carta-dots-layer';

// Continental-zoom label gate. Symbol collision runs on the main thread and
// scales with the number of CANDIDATE labels, not the number that fit, so a
// 25k-destination catalogue blocks panning for seconds even though collision
// hides all but a few hundred pills. Below FAR_ZOOM the far label layer only
// admits the cheapest FAR_KEEP destinations per FAR_CELL_DEG-degree grid cell
// (grid rank `gr`, computed per rebuild); collision culls to roughly that
// density anyway, so the visible result is unchanged while placement stays
// O(what fits on screen). From FAR_ZOOM up the ungated layer takes over and
// zooming keeps revealing every price.
const FAR_ZOOM = 6;
const FAR_KEEP = 6;
const FAR_CELL_DEG = 2;
const FAR_GATE = ['<', ['get', 'gr'], FAR_KEEP];

// Cards that open themselves. Past CARD_ZOOM the map is no longer a continent
// of prices, it is a handful of candidates, and a €-pill is a poor way to
// choose between them. From there the best-rated few open their hover card
// unprompted: photo, name, rating, how you get there, price. Zoom back out and
// they close again, because at that scale they would cover the map they are
// meant to explain. Kept deliberately small: these are DOM popups over a WebGL
// map, and the whole reason the pins are layers is that DOM does not scale.
const CARD_ZOOM = 8;
const CARD_MAX = 4;
// The card's own box (see .tip-card: 226px wide, ~200px tall with its photo),
// plus a gutter. Used to keep two cards from covering each other.
const CARD_W = 226 + 10;
const CARD_H = 200 + 10;
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
  // The cards that open themselves once you are zoomed in far enough, by dest
  // id, and the function that recomputes which ones those are.
  const autoCardsRef = useRef(new Map());
  const refreshCardsRef = useRef(() => {});
  // The hover card is plain DOM built inside a once-only map handler, so it
  // reads the translator through a ref to follow live language switches.
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

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

    map.on('load', async () => {
      await addPricePills(map);   // must exist before the label layer references them
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
    for (const layer of [LYR_PRICED_LABEL, LYR_PRICED_LABEL_FAR, LYR_PRICED_DOT, LYR_DOTS]) {
      map.on('click', layer, pick);
      map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; tip.remove(); });
      map.on('mousemove', layer, (e) => {
        const f = e.features?.[0];
        if (!f?.properties?.tCity) return;
        // This one already has a card open on the map; a second copy of it
        // under the cursor is just the same card twice.
        if (autoCardsRef.current.has(f.properties.id)) { tip.remove(); return; }
        const [lon, lat] = f.geometry?.coordinates || [];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
        // renderTip builds the card from DOM nodes + textContent - data never
        // reaches the page as markup, so third-party place names stay inert.
        renderTip(tipEl, f.properties, tRef.current);
        tip.setLngLat([lon, lat]).addTo(map);
      });
    }

    mapRef.current = map;
    // Verify seam: the headless map checks need to put the view at an exact
    // zoom, and wheel gestures land wherever they land. Same idea as the
    // ?provmock / ?savedmock seams elsewhere, scoped to this container rather
    // than hung on window.
    if (containerRef.current) containerRef.current._cartaMap = map;
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
            ...tipProps(p, {
              transport: 'No flight from your airport, drivable',
              mode: 'car',
            }),
          },
        });
        continue;
      }
      const isDeal = dealThreshold != null && p.total <= dealThreshold;
      const displayVal = priceMode === 'pp' ? p.pp : p.total;
      // Provenance, when the priced object carries it (contract A fields or a
      // prov bag): an estimated total gets the tilde right on the pin.
      const prov = fareProv(p.prov || p);
      pricedFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          id: p.id,
          label: `${prov?.est ? '~' : ''}€${formatPrice(displayVal)}`,
          deal: isDeal ? 1 : 0,
          gem: p.rating?.hidden_gem ? 1 : 0,
          top: (p.rating?.tier ?? 0) === 3 ? 1 : 0,
          // Cheaper wins the collision fight, so the decluttered far-out view
          // is "the best deals across Europe", not an arbitrary subset.
          sort: displayVal ?? 99999,
          ...tipProps(p, {
            transport: transportLine(p, p.mode === 'car'),
            mode: p.mode === 'car' ? 'car' : 'plane',
            price: `€${formatPrice(displayVal)}`,
            priceNote: priceMode === 'pp' ? 'per person' : 'total',
            prov,
          }),
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
          ...tipProps(p, { transport: 'No flight, too far to drive', dim: 1 }),
        },
      });
    }
    // Grid rank for the far label layer: cheapest first within each cell.
    const byCell = new Map();
    for (const f of pricedFeatures) {
      const [lon, lat] = f.geometry.coordinates;
      const key = `${Math.floor(lon / FAR_CELL_DEG)}:${Math.floor(lat / FAR_CELL_DEG)}`;
      let cell = byCell.get(key);
      if (!cell) byCell.set(key, cell = []);
      cell.push(f);
    }
    for (const cell of byCell.values()) {
      cell.sort((a, b) => a.properties.sort - b.properties.sort);
      cell.forEach((f, i) => { f.properties.gr = i; });
    }

    const pricedFC = { type: 'FeatureCollection', features: pricedFeatures };
    const dotsFC = { type: 'FeatureCollection', features: dotFeatures };
    dataRef.current = { pricedFC, dotsFC };

    const map = mapRef.current;
    if (map && map.getSource(SRC_PRICED)) {
      map.getSource(SRC_PRICED).setData(pricedFC);
      map.getSource(SRC_DOTS).setData(dotsFC);
      // A filter change can remove the very destinations the open cards are
      // for. Wait for the new frame, then recompute against what is actually
      // drawn (querying before idle reads the old features back).
      map.once('idle', () => refreshCardsRef.current());
    }
  }, [priced, unreachable, priceMode, dealThreshold, transportMode]);

  // Zoomed-in cards. Everything here is screen-space, so it re-runs whenever
  // the view settles (moveend covers pan, zoom and flyTo) and never per frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const live = autoCardsRef.current;

    const closeAll = () => {
      for (const popup of live.values()) popup.remove();
      live.clear();
    };

    const refresh = () => {
      if (!map.getLayer(LYR_PRICED_DOT)) return;
      if (map.getZoom() < CARD_ZOOM) { closeAll(); return; }

      // Rendered features only, so this is bounded by what is on screen, not
      // by the catalogue. The circle layer (not the labels) is the source: a
      // price pill that lost a collision is still a destination worth a card.
      const seen = new Set();
      const ranked = [];
      for (const f of map.queryRenderedFeatures({ layers: [LYR_PRICED_DOT] })) {
        const id = f.properties?.id;
        if (!id || seen.has(id) || !f.properties.tCity) continue;
        seen.add(id);
        ranked.push(f);
      }
      // Best first. A card is an editorial object, so the rating leads and the
      // price breaks ties, unlike the pins, where cheapest always wins.
      ranked.sort((a, b) =>
        (b.properties.tScore - a.properties.tScore) || (a.properties.sort - b.properties.sort));

      const el = map.getContainer();
      const w = el.clientWidth;
      const h = el.clientHeight;
      // The map's own furniture, in container coordinates. A card that lands on
      // the legend or the From picker hides a control to show a suggestion,
      // which is the wrong way round.
      const base = el.getBoundingClientRect();
      const reserved = [];
      for (const sel of ['.map-toolrow', '.map-legend', '.map-guide']) {
        const node = document.querySelector(sel);
        if (!node) continue;
        const b = node.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        reserved.push({
          left: b.left - base.left, right: b.right - base.left,
          top: b.top - base.top, bottom: b.bottom - base.top,
        });
      }
      const clearsFurniture = (pt) => !reserved.some((r) =>
        pt.x + CARD_W / 2 > r.left && pt.x - CARD_W / 2 < r.right
        && pt.y > r.top && pt.y - CARD_H < r.bottom);
      const placed = [];
      const keep = new Map();
      for (const f of ranked) {
        if (keep.size >= CARD_MAX) break;
        const [lon, lat] = f.geometry?.coordinates || [];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const pt = map.project([lon, lat]);
        // The whole card has to fit: one sliding under the header or off the
        // left edge reads as a rendering fault, not as information.
        if (pt.x - CARD_W / 2 < 0 || pt.x + CARD_W / 2 > w) continue;
        if (pt.y - CARD_H < 0 || pt.y > h) continue;
        if (!clearsFurniture(pt)) continue;
        if (placed.some((q) => Math.abs(q.x - pt.x) < CARD_W && Math.abs(q.y - pt.y) < CARD_H)) continue;
        placed.push(pt);
        keep.set(f.properties.id, { props: f.properties, lon, lat });
      }

      // Reuse whatever is still wanted: a pan that keeps a card must not blink
      // it off and on again.
      for (const [id, popup] of live) {
        if (!keep.has(id)) { popup.remove(); live.delete(id); }
      }
      for (const [id, { props, lon, lat }] of keep) {
        if (live.has(id)) continue;
        const card = document.createElement('div');
        renderTip(card, props, tRef.current);
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current(id);
        });
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 16,
          anchor: 'bottom',        // fixed, so the collision maths above holds
          className: 'map-tip map-tip-auto',
          focusAfterOpen: false,   // opening a card must never steal the keyboard
        }).setDOMContent(card).setLngLat([lon, lat]).addTo(map);
        live.set(id, popup);
      }
    };

    refreshCardsRef.current = refresh;
    map.on('moveend', refresh);
    if (map.isStyleLoaded()) refresh();
    return () => {
      map.off('moveend', refresh);
      closeAll();
    };
  }, []);

  // Latest lists via refs for the selection effects below (the arrays get new
  // identities on every filter tick; the effects must not re-run on those).
  const pricedRef = useRef(priced);
  const unreachableRef = useRef(unreachable);
  pricedRef.current = priced;
  unreachableRef.current = unreachable;
  const displayCtxRef = useRef({ priceMode, dealThreshold, transportMode });
  displayCtxRef.current = { priceMode, dealThreshold, transportMode };

  // The selected destination's own price (value, not array identity). Used as a
  // dependency below so the pill refreshes when THIS dest is repriced (date /
  // group-size change) but NOT on every filter tick, where priced gets a new
  // array identity yet the selected dest's price is unchanged.
  const selPrice = useMemo(() => {
    if (!selectedId) return null;
    const p = priced.find((x) => x.id === selectedId) || unreachable.find((x) => x.id === selectedId);
    if (!p) return null;
    return priceMode === 'pp' ? p.pp : p.total;
  }, [selectedId, priced, unreachable, priceMode]);

  // Selection: hide the selected feature from the layers and float a single
  // full DOM pill (glyph, hover, tooltip) in its place. Keyed on what actually
  // changes the pill (selection, price mode, transport mode, this dest's price),
  // NOT on priced/unreachable/dealThreshold identity, which churn every filter
  // tick and used to tear down + rebuild the pill mid-slider-drag (flicker).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getLayer(LYR_PRICED_LABEL)) return;
      const keep = ['!=', ['get', 'id'], selectedId ?? '___none___'];
      map.setFilter(LYR_PRICED_LABEL, keep);
      // The far layer's grid-rank gate is part of its identity, re-compose it
      // here or deselecting would silently drop it.
      map.setFilter(LYR_PRICED_LABEL_FAR, ['all', FAR_GATE, keep]);
      map.setFilter(LYR_PRICED_DOT, keep);
      map.setFilter(LYR_DOTS, keep);
      // The selected destination is hidden from the layers and gets its own DOM
      // pill, so its auto card has to go (and come back on deselect). Selecting
      // flies the map, but deselecting does not, so ask for the recount here.
      map.once('idle', () => refreshCardsRef.current());
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
        ? createDot(p, map, onSelectRef, 'caronly', `${p.city}, ${p.country}: no flight from your airport; drivable`, true)
        : createPriced(p, map, onSelectRef, pm, deal);
      return;
    }
    const u = unreachableRef.current.find((x) => x.id === selectedId);
    if (u && hasLngLat(u)) {
      selectedMarkerRef.current = createDot(u, map, onSelectRef, 'unreachable', `${u.city}, ${u.country} - no flight and too far to drive`, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, priceMode, transportMode, selPrice]);

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

  // The €-price inside a bordered pill (mirrors .price-pill: [plane|car] €price,
  // ink on paper, rust for deals). The pill background is a 9-slice image that
  // icon-text-fit sizes to the price; the glyph is baked into its left edge, so
  // the whole thing is one collision unit and one big click target.
  // Two zoom-banded copies of the same style: the far one carries the grid-rank
  // gate (see FAR_GATE), the near one is ungated. min/maxzoom means only one
  // builds buckets and places symbols at any given zoom.
  const labelLayer = (id, extra) => ({
    id,
    type: 'symbol',
    source: SRC_PRICED,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': LABEL_FONT,
      'text-size': 11.5,
      'icon-image': ['case',
        ['==', ['get', 'tMode'], 'car'],
          ['case', ['==', ['get', 'deal'], 1], pillName('car', true), pillName('car', false)],
          ['case', ['==', ['get', 'deal'], 1], pillName('plane', true), pillName('plane', false)]],
      'icon-text-fit': 'width',      // pill height stays native; width grows to the price
      'icon-text-fit-padding': [0, 0, 0, 0],
      // Raise the pill above its dot; the baked glyph offsets the text-fit box
      // leftward so the price still reads centred over the point.
      'text-offset': [0.5, -1.35],
      'symbol-sort-key': ['get', 'sort'],
      'text-padding': 1,
      // The defaults, stated: collision must stay on, it is the declutter.
      'text-allow-overlap': false,
      'icon-allow-overlap': false,
    },
    paint: {
      'text-color': ['case', ['==', ['get', 'deal'], 1], PAPER, INK],
    },
    ...extra,
  });
  map.addLayer(labelLayer(LYR_PRICED_LABEL_FAR, { maxzoom: FAR_ZOOM, filter: FAR_GATE }));
  map.addLayer(labelLayer(LYR_PRICED_LABEL, { minzoom: FAR_ZOOM }));
}

// Bake one stretchable pill image per (mode, deal) and register it. Full-colour
// (not SDF) so the border, paper/rust fill and tinted glyph all coexist.
async function addPricePills(map) {
  const S = PILL.PR;                       // logical -> device supersample
  const H = PILL.h * S, R = PILL.r * S, B = PILL.b * S;
  const padL = PILL.padL * S, glyph = PILL.glyph * S, gap = PILL.gap * S, padR = PILL.padR * S;
  const leftFixed = padL + glyph + gap;    // device px reserved for the glyph
  const band = 8 * S;                      // min stretchable content width
  const W = leftFixed + band + padR;
  const content = [leftFixed, B, leftFixed + band, H - B];
  const stretchX = [[leftFixed + S, leftFixed + band - S]];
  const stretchY = [[Math.round(H / 2 - 3 * S), Math.round(H / 2 + 3 * S)]];
  const opts = { pixelRatio: S, content, stretchX, stretchY };

  for (const mode of ['plane', 'car']) {
    // Render the glyph at its exact device size -> crisp 1:1 vector raster.
    const raw = await loadSvgImage(iconSvg(mode === 'car' ? CAR_PATH : PLANE_PATH, glyph));
    if (!raw) continue;
    for (const deal of [false, true]) {
      const name = pillName(mode, deal);
      if (map.hasImage(name)) continue;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      roundRectPath(ctx, B / 2, B / 2, W - B, H - B, R);
      ctx.fillStyle = deal ? ACCENT : PAPER;
      ctx.fill();
      ctx.lineWidth = B;
      ctx.strokeStyle = deal ? ACCENT : INK;
      ctx.stroke();
      // Full-strength glyph, like the legend (no opacity knock-down).
      const g = tintGlyph(raw, glyph, deal ? PAPER : INK);
      ctx.drawImage(g, padL, Math.round((H - glyph) / 2), glyph, glyph);
      map.addImage(name, ctx.getImageData(0, 0, W, H), opts);
    }
  }
}

// SVG markup -> loaded HTMLImageElement (null if the browser can't decode it).
function loadSvgImage(svg) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

// Recolour a rasterised glyph to `color` on its own canvas (source-in keeps the
// alpha shape, repaints it solid).
function tintGlyph(img, size, color) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  return cv;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
  // Same tilde the WebGL pins carry: an estimated total never reads exact.
  val.textContent = `${fareProv(p.prov || p)?.est ? '~' : ''}€${formatPrice(displayVal)}`;
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

// One-line "how you'd get there", for the hover card's transport row.
function transportLine(p, byCar) {
  if (byCar) return 'Drive';
  if (p.viaAirport) {
    const leg = p.viaAirport.kind === 'rental' ? 'rental car' : 'shuttle';
    return `Fly to ${p.viaAirport.city} (${p.viaAirport.iata}), ${p.viaAirport.road_km} km by ${leg}`;
  }
  return 'Fly';
}

// Flat, primitive-only bag of everything renderTip() reads back on hover.
// MapLibre round-trips feature properties through the GeoJSON source, so these
// stay scalars (no nested objects). Every hoverable feature carries them.
function tipProps(p, { transport, price = '', priceNote = '', mode = '', dim = 0, prov = null }) {
  const r = p.rating || {};
  return {
    tCity: p.city || '',
    tCountry: p.country || '',
    tImg: p.image || '',
    tScore: r.score ?? 0,
    tLabel: r.label || '',
    tTier: r.tier ?? 0,
    tGem: r.hidden_gem ? 1 : 0,
    tTransport: transport || '',
    tMode: mode,
    tPrice: price,
    tPriceNote: priceNote,
    tDim: dim,
    // Fare provenance as scalars: observed_at in epoch days (-1 = unknown)
    // and the estimate flag, translated back to text at hover time.
    tProvO: prov?.o ?? -1,
    tProvEst: prov?.est ? 1 : 0,
  };
}

// Build the hover card from DOM nodes - place names go in via textContent, so
// third-party data never reaches the page as markup. Mirrors the app's card
// language: hero image, serif city name, the rating score-chip, a muted
// transport line.
function renderTip(el, pr, t) {
  el.className = `tip-card${pr.tDim ? ' is-dim' : ''}${pr.tImg ? '' : ' no-img'}`;
  el.replaceChildren();

  if (pr.tImg) {
    const media = document.createElement('div');
    media.className = 'tip-media';
    const img = document.createElement('img');
    img.className = 'tip-img';
    img.decoding = 'async';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    // A dead thumbnail shouldn't leave an empty band: drop to text-only.
    img.onerror = () => { media.remove(); el.classList.add('no-img'); };
    img.src = pr.tImg;
    media.appendChild(img);
    if (pr.tPrice) media.appendChild(priceChip(pr, true, t));
    el.appendChild(media);
  }

  const body = document.createElement('div');
  body.className = 'tip-body';

  const head = document.createElement('div');
  head.className = 'tip-head';
  const city = document.createElement('div');
  city.className = 'tip-city';
  city.textContent = pr.tCity;
  head.appendChild(city);
  if (pr.tPrice && !pr.tImg) head.appendChild(priceChip(pr, false, t));
  body.appendChild(head);

  if (pr.tCountry) {
    const country = document.createElement('div');
    country.className = 'tip-country';
    country.textContent = pr.tCountry;
    body.appendChild(country);
  }

  if (pr.tScore || pr.tGem) {
    const meta = document.createElement('div');
    meta.className = 'tip-meta';
    if (pr.tScore) {
      const chip = document.createElement('span');
      chip.className = `tip-score rt-${pr.tTier || 0}`;
      chip.textContent = `${pr.tScore}/10`;
      meta.appendChild(chip);
      if (pr.tLabel) {
        const lab = document.createElement('span');
        lab.className = `tip-rlabel rt-${pr.tTier || 0}`;
        lab.textContent = pr.tLabel;
        meta.appendChild(lab);
      }
    }
    if (pr.tGem) {
      const gem = document.createElement('span');
      gem.className = 'tip-gem';
      gem.innerHTML = GEM_SVG;
      const gt = document.createElement('span');
      gt.textContent = 'Hidden gem';
      gem.appendChild(gt);
      meta.appendChild(gem);
    }
    body.appendChild(meta);
  }

  if (pr.tTransport) {
    const row = document.createElement('div');
    row.className = 'tip-transport';
    if (pr.tMode) {
      const ic = document.createElement('span');
      ic.className = 'tip-tico';
      ic.innerHTML = pr.tMode === 'car' ? CAR_SVG : PLANE_SVG;
      row.appendChild(ic);
    }
    const txt = document.createElement('span');
    txt.textContent = pr.tTransport;
    row.appendChild(txt);
    body.appendChild(row);
  }

  // When we know when this fare was last seen, say so: freshness is the
  // honest half of a cached price.
  if (t && pr.tProvO >= 0) {
    const fresh = document.createElement('div');
    fresh.className = 'tip-fresh';
    fresh.textContent = fareAgeText(t, { o: pr.tProvO });
    body.appendChild(fresh);
  }

  el.appendChild(body);
}

// The €-price, as an overlay chip on the image or an inline chip in the
// header. Discovery phrasing: a live-quote total reads "from €X"; an
// estimated one reads "~€X" with a small est. marker instead.
function priceChip(pr, overlay, t) {
  const chip = document.createElement('div');
  chip.className = `tip-price${overlay ? ' is-overlay' : ' is-inline'}`;
  const est = !!pr.tProvEst;
  if (!est && t) {
    const from = document.createElement('span');
    from.className = 'prov-from';
    from.textContent = t('prov.fromWord');
    chip.appendChild(from);
  }
  chip.appendChild(document.createTextNode(`${est ? '~' : ''}${pr.tPrice}`));
  if (est && t) {
    const mark = document.createElement('span');
    mark.className = 'tip-est';
    mark.textContent = t('prov.est');
    mark.title = t('prov.estTitle');
    chip.appendChild(mark);
  }
  if (pr.tPriceNote === 'per person') {
    const note = document.createElement('span');
    note.className = 'tip-price-note';
    note.textContent = 'pp';
    chip.appendChild(note);
  }
  return chip;
}

function formatPrice(n) {
  if (n == null) return '-';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  return Math.round(n).toLocaleString('en-GB');
}
