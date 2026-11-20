import { isGateway } from '../lib/rating.js';
import { MatchLine } from './WhyItMatches.jsx';
import React, { useEffect, useRef } from 'react';
import maplibregl from '../map/maplibre.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import { thumbAt } from '../lib/heroImage.js';
import { knownFor } from '../lib/knownFor.js';
import { tokenColour } from '../map/tokenColors.js';
import { formatMoney } from '../lib/money.js';
import { Button, IconButton } from '../components/ui/index.js';
import { CloseIcon } from '../components/Icons.jsx';
import { countryName } from '../lib/countryName.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { useDayView } from '../hooks/useDayView.js';
import { useSettings } from '../components/SettingsLine.jsx';
import { priceFigure } from '../lib/settings/prices.js';
import { houseBasemap } from '../map/houseBasemap.js';
import { cartaMapStyle } from '../lib/map/cartaMapStyle.js';
import { registerPmtiles, basemapFallback } from '../lib/map/pmtilesProtocol.js';
import {
  PIN_LAYERS, SEP, addPinImage, addPinLayers, pinAt, pinSize, pillWidth, setPinFilters,
} from './explore/mapPins.js';

/**
 * The Explore map (PLAN.md C7): the same list, spatially.
 *
 * G12 map view (.work/2026-11-20-map-view/decision.md "Pins"): the map draws
 * every pin itself (explore/mapPins.js). One GeoJSON source holds the
 * places the filters keep, each with its figure in the traveller's basis
 * (the cards' own priceFigure, whole euros) and its rank in the list's
 * sort. The best-ranked that fit carry a price pill (white, ink figure);
 * the map's collision keeps them apart and symbol-sort-key keeps the
 * better-ranked ones while zooming. Crowds at low zoom are count bubbles
 * (a tap zooms in); every other place is an 8 px umber dot with a 44 px
 * tap area. The cheapest place in view has a saffron dot on its pill. The
 * picked place is the one umber pill, with its name.
 *
 * Nothing sits under the floating chrome: after each move the pins whose
 * pill would reach under a control (the band, the chips, the List pill, the
 * tap card, the sheet, the zoom buttons, the credits; `chrome` names the
 * page's own) leave the pill layer and stay dots, and bubbles there leave
 * too. A settings or filter change re-prices and re-ranks the pins in place
 * and never moves the camera; only a new search frames its places (`fitKey`).
 *
 * T441 history: the dots were ink by rating with thirty DOM labels; T441
 * removed clusters. Both are back the other way round here: labels as map
 * layers (panning moved 30 buttons every frame, audit-map.md), crowds as
 * bubbles (3,800 dots of 2 px at Europe zoom covered the country names).
 *
 * Keyboard (T190). Over the canvas sits a layer of real buttons, one per
 * drawn pin up to KPIN_CAP, in reading order. They are placed when the map
 * settles and step out while it moves, so a pan touches no DOM. Focus shows
 * the same tip a hover shows, Escape dismisses it, Enter picks or opens.
 * `ringId` (a card under the pointer or in focus in the list) lifts its pin,
 * and `onPinLink(id)` tells the list which pin is under the pointer.
 *
 * Picking (T504). With `onPick` a tap on a pin picks the place, the caller
 * draws it (the phone's tap card, the desktop column), and a second tap on
 * the picked pin opens it (`onSelect`); a tap on the open map clears the
 * pick. Without `onPick` (the outdoor layers, OutdoorMap.jsx) the map keeps
 * its own card: on touch a peek card, with a mouse a card from zoom 8.
 *
 * Map colours are read from the tokens at paint time (tokenColour).
 */

// Where a pin stops being a tip and starts being a card (no onPick).
const CARD_FROM = 8;
// Europe, and how far the camera may wander from it (T441).
const EUROPE = [[-11, 35], [32, 62]];
const EUROPE_MAX = [[-40, 22], [60, 74]];
// How long the basemap style may take before the frame says the map failed.
const STYLE_WAIT_MS = 12000;
// The keyboard layer: at most this many pin stops, ordered in bands of this
// many pixels top to bottom, left to right within a band.
const KPIN_CAP = 30;
const KPIN_ROW = 64;
// A pill's half height plus a gap, for the chrome check.
const PILL_HALF_H = 17;
const EDGE_GAP = 4;
// How long the camera rests before the pins are chosen again and the list
// follows: longer than the pause between two strokes of one pan (up to about
// 0.6 s on a slowed phone, progress-3.md), so a run of strokes does that
// work once, after the last.
const PIN_REST_MS = 600;
// How long the pointer rests on a pin before the list outlines its card.
const LINK_REST_MS = 120;
// How long the pointer rests before the map looks for a pin under it.
const HOVER_REST_MS = 60;
// The map's own floating controls, always chrome for its pins.
const OWN_CHROME = '.maplibregl-ctrl-top-right .maplibregl-ctrl, .maplibregl-ctrl-bottom-right .maplibregl-ctrl, .maplibregl-ctrl-bottom-left .maplibregl-ctrl';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Route lines (T593) ───────────────────────────────────────────────────
// The lines of the Trails and Cycling lists, with a length pill at each
// start (the owner's AllTrails reference). Colours are read from the tokens
// at paint time: casing --surface, line --trail-pin (the trail domain), the
// hovered or ringed route --action. The pills are a stretchable image, so a
// label never needs a DOM node and maplibre keeps them from colliding.
const EMPTY_FC = { type: 'FeatureCollection', features: [] };
const dotsOpacity = new WeakMap();
// The basemap's glyph server has no Figtree; the stack CountryPickerMap
// already draws its labels in.
const PILL_FONT = ['Montserrat SemiBold', 'Open Sans Bold', 'Noto Sans Regular'];

/** The first point of a (Multi)LineString, or null. */
function lineStart(geometry) {
  const c = geometry?.coordinates;
  if (!Array.isArray(c) || !c.length) return null;
  const p = geometry.type === 'MultiLineString' ? c[0]?.[0] : c[0];
  return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : null;
}

function routeStarts(fc) {
  const features = [];
  for (const f of fc.features || []) {
    const p = lineStart(f.geometry);
    if (p) features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: f.properties });
  }
  return { type: 'FeatureCollection', features };
}

// A pill drawn once on a canvas: 40 x 20 at the device's pixel ratio, the
// middle stretched to fit the text, the round ends kept.
function pillImage(fill, edge) {
  const pr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
  const W = 40 * pr; const H = 20 * pr; const r = 10 * pr;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const inset = pr / 2;
  ctx.beginPath();
  ctx.moveTo(r, inset);
  ctx.lineTo(W - r, inset);
  ctx.arc(W - r, H / 2, H / 2 - inset, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(r, H - inset);
  ctx.arc(r, H / 2, H / 2 - inset, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (edge) { ctx.lineWidth = pr; ctx.strokeStyle = edge; ctx.stroke(); }
  return {
    data: ctx.getImageData(0, 0, W, H),
    opts: {
      pixelRatio: pr,
      stretchX: [[r, W - r]],
      stretchY: [[H / 2 - pr, H / 2 + pr]],
      content: [8 * pr, 3 * pr, W - 8 * pr, H - 3 * pr],
    },
  };
}

function addRouteLayers(map, fc, { open, hot }) {
  const surface = tokenColour('--surface');
  const line = tokenColour('--trail-pin');
  const action = tokenColour('--action');
  const text = tokenColour('--text');
  const onFill = tokenColour('--on-fill');
  for (const [name, fill, edge] of [['route-pill', surface, tokenColour('--border')], ['route-pill-hot', action, null]]) {
    const img = pillImage(fill, edge);
    if (img && !map.hasImage(name)) map.addImage(name, img.data, img.opts);
  }
  map.addSource('routes', { type: 'geojson', data: fc });
  map.addSource('route-starts', { type: 'geojson', data: routeStarts(fc) });
  const lineLayout = { 'line-cap': 'round', 'line-join': 'round' };
  map.addLayer({
    id: 'route-casing', type: 'line', source: 'routes', layout: lineLayout,
    paint: { 'line-color': surface, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 6, 14, 8], 'line-opacity': 0.9 },
  }, 'dest-dots');
  map.addLayer({
    id: 'route-line', type: 'line', source: 'routes', layout: lineLayout,
    paint: { 'line-color': line, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.5, 10, 3, 14, 4.5] },
  }, 'dest-dots');
  map.addLayer({
    id: 'route-hot', type: 'line', source: 'routes', layout: lineLayout,
    filter: ['==', ['get', 'id'], ''],
    paint: { 'line-color': action, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 3, 10, 4.5, 14, 6] },
  }, 'dest-dots');
  // A wide, unseen line under the pointer, so a 3 px route is easy to hover.
  map.addLayer({
    id: 'route-hit', type: 'line', source: 'routes', layout: lineLayout,
    paint: { 'line-color': line, 'line-width': 14, 'line-opacity': 0 },
  }, 'dest-dots');
  const pill = (id, image, colour, filter, overlap) => map.addLayer({
    id, type: 'symbol', source: 'route-starts', ...(filter ? { filter } : {}),
    layout: {
      'icon-image': image,
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [2, 3, 2, 3],
      'text-field': ['get', 'label'],
      'text-font': PILL_FONT,
      'text-size': 12,
      'symbol-sort-key': ['get', 'rank'],
      'icon-allow-overlap': overlap,
      'text-allow-overlap': overlap,
    },
    paint: { 'text-color': colour },
  });
  pill('route-pins', 'route-pill', text, null, false);
  pill('route-pin-hot', 'route-pill-hot', onFill, ['==', ['get', 'id'], ''], true);

  const hits = ['route-pin-hot', 'route-pins', 'route-hit'];
  const at = (e) => map.queryRenderedFeatures(e.point, { layers: hits.filter((l) => map.getLayer(l)) })[0];
  let pointing = false;
  map.on('mousemove', (e) => {
    const f = at(e);
    hot(f ? f.properties.id : null);
    if (f) { map.getCanvas().style.cursor = 'pointer'; pointing = true; }
    else if (pointing) { map.getCanvas().style.cursor = ''; pointing = false; }
  });
  map.on('click', (e) => {
    // A dot under the tap is the map's own business (its card, its open).
    if (map.queryRenderedFeatures(e.point, { layers: ['dest-dots'] }).length) return;
    const f = at(e);
    if (f) open(f.properties.id);
  });
}

function setRouteHot(map, id) {
  for (const l of ['route-hot', 'route-pin-hot']) {
    if (map.getLayer(l)) map.setFilter(l, ['==', ['get', 'id'], id || '']);
  }
}

const reducedMotion = () => typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarsePointer = () => typeof window.matchMedia === 'function'
  && window.matchMedia('(pointer: coarse)').matches;

/** The visible boxes of the chrome over the map, in canvas pixels. */
function chromeRects(map, selector) {
  const c = map.getCanvas().getBoundingClientRect();
  const sel = selector ? `${OWN_CHROME}, ${selector}` : OWN_CHROME;
  const out = [];
  let els = [];
  try { els = document.querySelectorAll(sel); } catch { return out; }
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const l = r.left - c.left; const t = r.top - c.top;
    const box = { l, t, r: l + r.width, b: t + r.height };
    if (box.r <= 0 || box.b <= 0 || box.l >= c.width || box.t >= c.height) continue;
    out.push(box);
  }
  return out;
}

export function ExploreMap({
  rows, all, pins = null, onSelect, onViewport, onNeedDetail, t, ringId = null, onPinLink = null,
  costs = null, onBack = null, visible = true, framed = false, lines = null,
  pickedId = null, onPick = null,
  // T600: 'score' labels a pin with its Score instead of the day figure
  // (beaches, lakes and mountains on their own tabs), and no pin is the
  // best value.
  pinFig = 'eur',
  // G12 map view: what else floats over the map (a CSS selector), where the
  // zoom buttons stand, and the key whose change frames the list anew (a
  // new search); filters and settings never move the camera.
  chrome = '', zoomAt = 'top-right', fitKey = '',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const popupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;
  const pickedRef = useRef(pickedId);
  pickedRef.current = pickedId;
  // A pin pick: a first tap picks, a tap on the picked pin opens (T504).
  const pickOrOpen = (id) => {
    if (pickedRef.current === id) onSelectRef.current?.(id);
    else onPickRef.current?.(id);
  };
  const pickOrOpenRef = useRef(pickOrOpen);
  pickOrOpenRef.current = pickOrOpen;
  const onViewportRef = useRef(onViewport);
  onViewportRef.current = onViewport;
  const onNeedDetailRef = useRef(onNeedDetail);
  onNeedDetailRef.current = onNeedDetail;
  // Tell the list only when the linked pin changes, not on every mouse move.
  const linkedRef = useRef(null);
  const onPinLinkRef = useRef(null);
  onPinLinkRef.current = (id) => {
    if (linkedRef.current === id) return;
    linkedRef.current = id;
    onPinLink?.(id);
  };
  const hoverRef = useRef(null);
  const ringRef = useRef(ringId);
  ringRef.current = ringId;
  const tRef = useRef(t);
  tRef.current = t;
  const pinFigRef = useRef(pinFig);
  pinFigRef.current = pinFig;
  // T694: the tip and the card name the cards' unit in the traveller's view.
  const view = useDayView();
  const unitRef = useRef(view.unit);
  unitRef.current = view.unit;
  // The figure on a pin is the cards' own (PlaceFigure): the basis the
  // traveller set (a day or the stay, a person or the group), whole euros.
  const model = useSettings()?.model || null;
  const [ready, setReady] = React.useState(false);
  // The pins are in (the first style.load): a pick that came with the page
  // (?xi=) is kept clear of the card from then on (judgement-2).
  const [pinsIn, setPinsIn] = React.useState(false);
  // V5 (T403, brief V5-5): the basemap style never arrived, so the frame
  // says so and offers the list instead of staying blank.
  const [failed, setFailed] = React.useState(false);
  // T444: on touch (no onPick) the card a pin raises docks at the bottom of
  // the map with a close control. A mouse keeps the popup.
  const [peek, setPeek] = React.useState(null);

  const source = all || rows;
  // Each place's rank in the list's current order: the pills keep the
  // better-ranked when they collide (symbol-sort-key, lower first).
  const rankOf = React.useMemo(() => {
    const m = new Map();
    rows.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [rows]);
  // What survives the filters. `null` means everything.
  // The same count is not the same places (a filter can swap one in for
  // another), so only the very same list means "everything".
  const keepIds = React.useMemo(() => {
    if (!all || rows === all) return null;
    return new Set(rows.map((p) => p.id));
  }, [rows, all]);
  const geojson = React.useMemo(() => {
    const costOf = (p) => costs?.get(p.id) || p.cost;
    const figOf = (p) => {
      if (pinFig === 'score') {
        const s = p.rating?.score;
        return { fig: s != null ? Number(s).toFixed(1) : '', eur: -1 };
      }
      const eur = priceFigure({ cost: costOf(p) }, model || {}).eur;
      return Number.isFinite(eur) ? { fig: formatMoney(eur), eur: Math.round(eur) } : { fig: '', eur: -1 };
    };
    const loaded = (p, lon, lat) => {
      const { fig, eur } = figOf(p);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: p.id,
          city: p.city,
          country: p.country,
          cc: p.iso2 || '',
          score: p.rating?.score ?? null,
          eur,
          fig,
          rank: rankOf.has(p.id) ? rankOf.get(p.id) : 1e6,
          ld: 1,
        },
      };
    };
    const drawable = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon);
    const kept = (id) => !keepIds || keepIds.has(id);
    const features = [];
    if (!pins) {
      for (const p of source) {
        if (drawable(p) && kept(p.id)) features.push(loaded(p, p.city_lon ?? p.lon, p.city_lat ?? p.lat));
      }
      return { type: 'FeatureCollection', features };
    }
    // Boot pins, upgraded to the full feature wherever the record is in. A
    // pin whose record has not arrived cannot be judged by a filter yet, so
    // it stays (a dot) until its country lands.
    const byId = new Map(source.map((p) => [p.id, p]));
    for (const b of pins) {
      const p = byId.get(b.id);
      // T755: a gateway airport is never a pin of its own; its city is.
      if (!drawable(b) || b.gateway || isGateway(p)) continue;
      if (p) {
        if (!kept(p.id)) continue;
        features.push(drawable(p) ? loaded(p, p.city_lon ?? p.lon, p.city_lat ?? p.lat) : loaded(p, b.lon, b.lat));
        continue;
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
        properties: { id: b.id, city: '', country: '', cc: '', score: null, eur: -1, fig: '', rank: 1e6, ld: 0 },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [source, pins, costs, model, keepIds, rankOf, pinFig]);
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;
  const featureById = useRef(new Map());
  featureById.current = React.useMemo(
    () => new Map(geojson.features.map((f) => [f.properties.id, f])), [geojson]);
  // The card's photograph and line are looked up by id when a card opens.
  const byIdRef = useRef(new Map());
  byIdRef.current = React.useMemo(() => new Map(source.map((p) => [p.id, p])), [source]);

  const cardRef = useRef(null);
  const popHelpers = React.useMemo(() => {
    const closePop = () => {
      popupRef.current?.remove();
      popupRef.current = null;
      cardRef.current = null;
      setPeek(null);
    };
    const popup = (map) => {
      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({
          closeButton: false, closeOnClick: false, offset: 18, maxWidth: 'none',
        });
        popupRef.current.on('close', () => { cardRef.current = null; });
      }
      return popupRef.current.addTo(map);
    };
    const eurHtml = (fig, cls) => (fig
      ? `<span class="${cls}"><span class="xmap-fig">${esc(fig)}</span> ${esc(unitRef.current)}</span>`
      : '');
    const showTip = (map, f) => {
      const { city, score, ld, fig, cc } = f.properties;
      if (ld === 0) { onNeedDetailRef.current?.(f.properties.id); return; }
      const country = countryName(cc, f.properties.country);
      const money = pinFigRef.current === 'score' ? '' : fig;
      const html = `<div class="xmap-pop"><strong>${esc(city)}</strong>`
        + (score != null ? `<span class="xmap-pop-score">${Number(score).toFixed(1)}</span>` : '')
        + `<br><span class="xmap-pop-sub">${esc(country)}</span>`
        + (money ? `<br>${eurHtml(money, 'xmap-pop-eur')}` : '')
        + '</div>';
      cardRef.current = null;
      popup(map).setLngLat(f.geometry.coordinates).setHTML(html);
    };
    const showCard = (map, f) => {
      const { id, city, score, fig, cc } = f.properties;
      const country = countryName(cc, f.properties.country);
      const rec = byIdRef.current.get(id);
      const img = rec ? (rec.image?.url || rec.image || '') : '';
      const lead = rec ? (knownFor(rec) || '') : '';
      const thumb = img ? thumbAt(img, 250) : '';
      const money = pinFigRef.current === 'score' ? '' : fig;
      if (coarsePointer()) {
        popupRef.current?.remove();
        popupRef.current = null;
        cardRef.current = id;
        setPeek({ id, city, country, score, fig: money, thumb, lead });
        return;
      }
      const html = `<button type="button" class="xmap-card-hit" data-id="${esc(id)}">`
        + '<div class="xmap-card">'
        + (thumb ? `<img class="xmap-card-img" src="${esc(thumb)}" alt="" loading="lazy">` : '')
        + '<div class="xmap-card-body"><div class="xmap-card-head">'
        + `<span class="xmap-card-name">${esc(city)}</span>`
        + (score != null ? `<span class="xmap-card-score">${Number(score).toFixed(1)}</span>` : '')
        + '</div>'
        + `<p class="xmap-card-sub">${esc(country)}</p>`
        + (money ? `<p class="xmap-card-eur">${eurHtml(money, 'xmap-card-eur-line')}</p>` : '')
        + (lead ? `<p class="xmap-card-lead">${esc(lead)}</p>` : '')
        + '</div></div></button>';
      cardRef.current = id;
      const p = popup(map).setLngLat(f.geometry.coordinates).setHTML(html);
      p.getElement()?.querySelector('.xmap-card-hit')
        ?.addEventListener('click', () => onSelectRef.current?.(id));
    };
    return { closePop, showTip, showCard };
  }, []);
  const { closePop, showTip, showCard } = popHelpers;

  // The keyboard layer (rebuilt when the map settles, hidden while it moves).
  const [kpins, setKpins] = React.useState([]);
  const kpinsBoxRef = useRef(null);
  const lastKpinRef = useRef(null);
  const collectKpins = React.useCallback((map) => {
    const canvas = map.getCanvas();
    const W = canvas.clientWidth; const H = canvas.clientHeight;
    if (!map.getLayer('dest-dots')) return [];
    const pinLayers = PIN_LAYERS.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none');
    const seen = new Set();
    const out = [];
    const add = (f, label) => {
      const pr = f.properties || {};
      if (pr.ld === 0 || seen.has(pr.id)) return;
      seen.add(pr.id);
      const pt = map.project(f.geometry.coordinates);
      if (pt.x < 0 || pt.y < 0 || pt.x > W || pt.y > H) return;
      out.push({
        key: `d${pr.id}`, id: pr.id, x: pt.x, y: pt.y, label,
        city: pr.city, country: pr.country, cc: pr.cc, score: pr.score, fig: pr.fig || '',
        w: label ? (pinSize(`xp${SEP}n${SEP}${pr.fig}`)?.[0] || pillWidth(pr.fig || pr.city || '')) : 0,
        feature: { geometry: { coordinates: f.geometry.coordinates }, properties: pr },
      });
    };
    if (pinLayers.length) for (const f of map.queryRenderedFeatures({ layers: pinLayers })) add(f, true);
    if (out.length < KPIN_CAP) {
      for (const f of map.queryRenderedFeatures({ layers: ['dest-dots'] })) {
        if (out.length >= KPIN_CAP) break;
        add(f, false);
      }
    }
    return out.slice(0, KPIN_CAP).sort((a, b) => (
      Math.floor(a.y / KPIN_ROW) - Math.floor(b.y / KPIN_ROW)) || (a.x - b.x));
  }, []);

  // The pin filters of this moment: what the chrome covers leaves, the best
  // value in view gets its dot, the hovered and the picked pins their own.
  const pinStateRef = useRef({ shown: [], hiddenClusters: [], best: '' });
  const applyPins = React.useCallback((map) => {
    if (!map?.getLayer('xpin')) return;
    setPinFilters(map, {
      ...pinStateRef.current,
      featureOf: (id) => featureById.current.get(id) || null,
      hot: hoverRef.current || ringRef.current || '',
      picked: pickedRef.current || '',
    });
  }, []);
  const refreshPins = React.useCallback((map) => {
    if (!map?.getLayer('xpin')) return;
    const cv = map.getCanvas();
    const W = cv.clientWidth; const H = cv.clientHeight;
    const rects = chromeRects(map, chromeRef.current);
    // The view plus a margin: a pill whose point is just off screen still
    // reaches into it, and must be judged (and hidden at the edge) too.
    const box = (x0, y0, x1, y1) => {
      const a = map.unproject([x0, y0]); const b = map.unproject([x1, y1]);
      return [Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)];
    };
    const inBox = ([lon, lat], [w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n;
    const near = box(-120, -40, W + 120, H + 40);
    // Half a view around it: pills a pan brings in are there before it ends.
    const ring = box(-W / 2, -H / 2, W * 1.5, H * 1.5);
    const fits = [];
    const outside = [];
    let best = null;
    const under = (pt, half) => (
      pt.x - half < EDGE_GAP || pt.x + half > W - EDGE_GAP || pt.y - PILL_HALF_H < EDGE_GAP || pt.y + PILL_HALF_H > H - EDGE_GAP
      || rects.some((r) => pt.x + half > r.l && pt.x - half < r.r && pt.y + PILL_HALF_H > r.t && pt.y - PILL_HALF_H < r.b));
    for (const f of geojsonRef.current.features) {
      const pr = f.properties;
      if (!pr.fig) continue;
      if (!inBox(f.geometry.coordinates, near)) {
        if (inBox(f.geometry.coordinates, ring)) outside.push(pr);
        continue;
      }
      const pt = map.project(f.geometry.coordinates);
      const half = (pinSize(`xp${SEP}n${SEP}${pr.fig}`)?.[0] || pillWidth(pr.fig)) / 2 + 6;
      if (under(pt, half)) continue;
      fits.push(pr);
      if (pinFigRef.current !== 'score' && pr.eur >= 0
        && (!best || pr.eur < best.eur || (pr.eur === best.eur && pr.rank < best.rank))) best = pr;
    }
    // A price pill for the best-ranked in view only (about one per 18,000
    // px of map, 10 to 40); the rest are bubbles and dots (decision.md).
    const cap = Math.max(10, Math.min(40, Math.round((W * H) / 18000)));
    const byRank = (a, c) => a.rank - c.rank;
    fits.sort(byRank);
    outside.sort(byRank);
    // The ring is twice the view's area beyond it: twice the cap.
    const shown = [...fits.slice(0, cap), ...outside.slice(0, cap * 2)].map((pr) => pr.id);
    const hiddenClusters = [];
    if (map.getSource('dests-c')) {
      for (const f of map.querySourceFeatures('dests-c', { filter: ['has', 'point_count'] })) {
        const pt = map.project(f.geometry.coordinates);
        if (under(pt, 22)) hiddenClusters.push(f.id ?? f.properties.cluster_id);
      }
    }
    pinStateRef.current = { shown, hiddenClusters, best: best?.id || '' };
    applyPins(map);
  }, [applyPins]);
  const refreshRef = useRef(refreshPins);
  refreshRef.current = refreshPins;

  // The count bubble's figure in the reader's language ("1.2k").
  const countLabel = React.useCallback((n) => {
    try {
      return new Intl.NumberFormat(tRef.current?.lang || undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    } catch { return String(n); }
  }, []);

  const fitRef = useRef(null);
  useEffect(() => {
    if (mapRef.current) return undefined;
    // G12: the Carta basemap from our own PMTiles; CARTO only if it fails.
    registerPmtiles(maplibregl);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: cartaMapStyle(),
      bounds: EUROPE,
      fitBoundsOptions: { padding: 16 },
      maxBounds: EUROPE_MAX,
      minZoom: 2.5,
      // A phone at 3x draws 2.25 times the pixels of 2x for a difference
      // the eye does not see on a map; capped, panning keeps its frames.
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      fadeDuration: 0,
      // The credit stays visible and small (decision.md "Base map").
      attributionControl: { compact: false },
    });
    houseBasemap(map);
    // A verify seam: data-basemap says which basemap drew (carta or carto).
    containerRef.current.dataset.basemap = 'carta';
    basemapFallback(map, { onFallback: () => { if (containerRef.current) containerRef.current.dataset.basemap = 'carto'; } });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), zoomAt);
    mapRef.current = map;
    // A verify seam: scripts/verify_map.mjs and verify_map_size_cards.mjs
    // move the camera through it.
    containerRef.current._cartaMap = map;
    const showCanvas = () => setReady(true);
    map.once('styledata', showCanvas);
    const readyTimer = setTimeout(showCanvas, 1500);
    let styleSeen = false;
    map.on('styledata', () => { styleSeen = true; });
    const fail = () => { if (!styleSeen) setFailed(true); };
    map.on('error', fail);
    if (import.meta.env?.DEV) map.on('error', (e) => console.warn('[map]', e?.error?.message || e));
    const styleTimer = setTimeout(fail, STYLE_WAIT_MS);

    // The pills and bubbles are drawn the first time a layer asks for one.
    map.on('styleimagemissing', (e) => { addPinImage(map, e.id, countLabel); });

    // The pins go in as soon as a style has loaded (not on 'load', which
    // waits for every tile, T441), and again after a basemap swap.
    map.on('style.load', () => {
      addPinLayers(map, geojsonRef.current);
      refreshRef.current(map);
      if (!readyRef.current) {
        readyRef.current = true;
        setPinsIn(true);
        fitRef.current?.(false);
      }
    });

    const isPicking = () => !!onPickRef.current;
    map.on('click', (e) => {
      const f = pinAt(map, e.point);
      if (!f) {
        if (isPicking()) { if (pickedRef.current) onPickRef.current(null); return; }
        if (coarsePointer() && cardRef.current) closePop();
        return;
      }
      const pr = f.properties;
      if (pr.point_count != null) {
        // A crowd: zoom in until it splits.
        Promise.resolve(map.getSource('dests-c')?.getClusterExpansionZoom(pr.cluster_id))
          .then((z) => map.easeTo({
            center: f.geometry.coordinates, zoom: Math.min((z ?? map.getZoom() + 2) + 0.2, 12),
            duration: reducedMotion() ? 0 : 420,
          }))
          .catch(() => {});
        return;
      }
      const id = pr.id;
      if (isPicking()) {
        if (pr.ld === 0) onNeedDetailRef.current?.(id);
        closePop();
        pickOrOpenRef.current(id);
        return;
      }
      if ((coarsePointer() || map.getZoom() >= CARD_FROM) && pr.ld !== 0 && cardRef.current !== id) { showCard(map, f); return; }
      onSelectRef.current?.(id);
    });
    let pointing = false;
    // The list's outline follows the hovered pin once the pointer rests: it
    // re-renders the whole tab, and a pointer crossing pins on its way to
    // start a drag made that drag's first frames late (fix round 3).
    let linkTimer = 0;
    const linkLater = (id) => {
      clearTimeout(linkTimer);
      linkTimer = setTimeout(() => { linkTimer = 0; onPinLinkRef.current?.(id); }, LINK_REST_MS);
    };
    // The hover hit test runs once the pointer rests a moment: a pointer on
    // its way to start a drag never pays for it (up to 170 ms at CPU 4x on
    // the drag's first frame, fix round 3).
    let hoverTimer = 0;
    map.on('mousedown', () => {
      clearTimeout(linkTimer); linkTimer = 0;
      clearTimeout(hoverTimer); hoverTimer = 0;
    });
    map.on('mousemove', (e) => {
      // A drag is a pan, not a hover: no hit test on every move of it, nor
      // while the map still glides after one (the pins slide under the
      // pointer; the next drag would start late).
      clearTimeout(hoverTimer);
      if (e.originalEvent?.buttons || map.isMoving()) return;
      const point = e.point;
      hoverTimer = setTimeout(() => { hoverTimer = 0; hoverAt(point); }, HOVER_REST_MS);
    });
    const hoverAt = (point) => {
      const f = pinAt(map, point, 8);
      const pr = f?.properties;
      const id = pr && pr.point_count == null && pr.ld !== 0 ? pr.id : null;
      if (f) { map.getCanvas().style.cursor = 'pointer'; pointing = true; }
      else if (pointing) { map.getCanvas().style.cursor = ''; pointing = false; }
      if (hoverRef.current !== id) {
        hoverRef.current = id;
        linkLater(id);
        applyPins(map);
      }
      if (!f || pr.point_count != null) {
        if (!cardRef.current && popupRef.current) closePop();
        return;
      }
      if (pr.ld === 0) { onNeedDetailRef.current?.(pr.id); return; }
      if (!isPicking() && map.getZoom() >= CARD_FROM) {
        if (cardRef.current !== pr.id) showCard(map, f);
      } else {
        showTip(map, f);
      }
    };
    map.getCanvas().addEventListener('mouseleave', () => {
      clearTimeout(hoverTimer); hoverTimer = 0;
      if (hoverRef.current) { hoverRef.current = null; linkLater(null); applyPins(map); }
      if (!cardRef.current) closePop();
    });
    map.on('zoomend', () => {
      if (!coarsePointer() && map.getZoom() < CARD_FROM && cardRef.current) closePop();
    });
    // While the camera moves the keyboard layer steps out, so a pan writes
    // nothing to the page; it is rebuilt once the map settles.
    // The list follows the view a moment after the map settles, so a quick
    // run of strokes re-renders it once, not after each.
    let viewTimer = 0;
    // The pins are chosen again once the camera has rested a moment: each new
    // choice lays out pill tiles in the worker, and done between the strokes
    // of a pan it cost the next stroke its frames (fix round 3, progress-3.md).
    let pinTimer = 0;
    map.on('movestart', () => {
      clearTimeout(viewTimer);
      clearTimeout(pinTimer);
      pinTimer = 0;
      kpinsBoxRef.current?.classList.add('is-moving');
    });
    // Tiles of a new zoom land after 'moveend': the bubbles there are
    // checked again once the map is idle.
    let dirty = false;
    map.on('moveend', () => {
      dirty = true;
      clearTimeout(pinTimer);
      pinTimer = setTimeout(() => { pinTimer = 0; refreshRef.current(map); }, PIN_REST_MS);
      kpinsBoxRef.current?.classList.remove('is-moving');
      clearTimeout(viewTimer);
      viewTimer = setTimeout(() => {
        const b = map.getBounds();
        onViewportRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
      }, PIN_REST_MS);
    });
    let firstIdle = true;
    map.on('idle', () => {
      if (dirty && !pinTimer) { dirty = false; refreshRef.current(map); }
      setKpins(collectKpins(map));
      if (firstIdle) {
        firstIdle = false;
        refreshRef.current(map);
        // A measure point for the map's open time (T441).
        try { performance.mark('carta:map-idle'); } catch { /* old browser */ }
      }
    });
    // The chrome moved (a card, the sheet): the pins under it step aside.
    const onChrome = () => requestAnimationFrame(() => refreshRef.current(map));
    window.addEventListener('carta:map-chrome', onChrome);
    window.addEventListener('resize', onChrome);
    return () => {
      clearTimeout(viewTimer);
      clearTimeout(pinTimer);
      clearTimeout(linkTimer);
      clearTimeout(hoverTimer);
      clearTimeout(readyTimer);
      clearTimeout(styleTimer);
      window.removeEventListener('carta:map-chrome', onChrome);
      window.removeEventListener('resize', onChrome);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // The map is built once: the helpers are memos with no dependencies, and
    // the zoom corner is fixed for a map's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closePop, showTip, showCard, collectKpins, applyPins, countLabel]);

  // T593: route lines (Trails and Cycling). The pins give way to the route
  // pills (their keyboard stops stay).
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const routeHotRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;
    const draw = () => {
      if (!map.getLayer('dest-dots')) return false;
      const data = linesRef.current;
      if (!data && !map.getSource('routes')) return true;
      const fc = data || EMPTY_FC;
      if (map.getSource('routes')) {
        map.getSource('routes').setData(fc);
        map.getSource('route-starts').setData(routeStarts(fc));
      } else {
        addRouteLayers(map, fc, {
          open: (id) => onSelectRef.current?.(id),
          hot: (id) => {
            const next = id || ringRef.current || '';
            if (routeHotRef.current === next) return;
            routeHotRef.current = next;
            setRouteHot(map, next);
          },
        });
      }
      if (!dotsOpacity.has(map)) dotsOpacity.set(map, map.getPaintProperty('dest-dots', 'circle-opacity') ?? 1);
      map.setPaintProperty('dest-dots', 'circle-opacity', data ? 0 : dotsOpacity.get(map));
      map.setPaintProperty('dest-dots', 'circle-stroke-opacity', data ? 0 : 1);
      for (const l of [...PIN_LAYERS, 'xcluster']) {
        if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', data ? 'none' : 'visible');
      }
      return true;
    };
    if (draw()) return undefined;
    const retry = () => { if (draw()) { map.off('styledata', retry); map.off('idle', retry); } };
    map.on('styledata', retry);
    map.on('idle', retry);
    return () => { map.off('styledata', retry); map.off('idle', retry); };
  }, [lines]);

  // The list's ringed card lifts its pin and lights its route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyPins(map);
    if (map.getLayer('route-hot')) {
      routeHotRef.current = ringId || '';
      setRouteHot(map, ringId || '');
    }
  }, [ringId, applyPins]);

  // A rebuild that dropped the focused pin hands focus to the canvas.
  useEffect(() => {
    const last = lastKpinRef.current;
    if (!last || kpins.some((k) => k.key === last)) return;
    lastKpinRef.current = null;
    const a = document.activeElement;
    if (!a || a === document.body) mapRef.current?.getCanvas().focus({ preventScroll: true });
  }, [kpins]);

  // The picked pin follows the pick, and the camera keeps it clear of the
  // chrome (the tap card, the band, the column), only when it is not (T504).
  useEffect(() => {
    const map = mapRef.current;
    if (!readyRef.current || !map) return undefined;
    applyPins(map);
    if (!pickedId) return undefined;
    const f = geojsonRef.current.features.find((x) => x.properties.id === pickedId);
    if (!f) return undefined;
    let tries = 0;
    let gone = false;
    const clear = () => {
      if (gone) return;
      const cv = map.getCanvas();
      const H = cv.clientHeight; const W = cv.clientWidth;
      let top = 0; let bottom = 0;
      for (const r of chromeRects(map, chromeRef.current)) {
        if (r.r - r.l < W * 0.5) continue;
        if (r.b < H / 2) top = Math.max(top, r.b); else bottom = Math.max(bottom, H - r.t);
      }
      const pt = map.project(f.geometry.coordinates);
      const margin = 48;
      // The picked pill carries the name, so it reaches further sideways.
      const pr = f.properties;
      const half = (pinSize(['xp', 'p', pr.city, pr.fig].join(SEP))?.[0] || 160) / 2 + 8;
      if (pt.x > half && pt.x < W - half && pt.y > top + margin && pt.y < H - bottom - margin) return;
      // At low zoom the map's bounds can stop the camera short (Cyprus under
      // the card at zoom 3, judgement-2): a second try zooms in a step.
      const zoom = tries > 0 ? Math.min(map.getZoom() + 1.5, 9) : map.getZoom();
      tries += 1;
      map.easeTo({
        center: f.geometry.coordinates,
        zoom,
        padding: { top, left: 0, right: 0, bottom },
        duration: reducedMotion() ? 0 : 480,
      });
      if (tries < 3) map.once('moveend', () => requestAnimationFrame(clear));
    };
    // A frame later, so a card that the pick raised is in the page; and again
    // once the card says it has settled (carta:map-chrome): on the first
    // frame it is still fading in at opacity 0 and counts as no chrome, which
    // left the picked pin under the card.
    const h = requestAnimationFrame(clear);
    const onChrome = () => requestAnimationFrame(clear);
    window.addEventListener('carta:map-chrome', onChrome);
    return () => { gone = true; cancelAnimationFrame(h); window.removeEventListener('carta:map-chrome', onChrome); };
  }, [pickedId, applyPins, pinsIn]);

  // New places or new figures: the same camera, the pins re-priced and
  // re-ranked in place (decision.md "Pins": settings and filters never move
  // the camera).
  useEffect(() => {
    const map = mapRef.current;
    if (!readyRef.current || !map?.getSource('dests-c')) return;
    map.getSource('dests-c').setData(geojson);
    refreshRef.current(map);
    map.once('idle', () => refreshRef.current(map));
  }, [geojson]);

  // The camera frames what the list holds on load and for a new search;
  // the whole of Europe when nothing narrows it.
  const fit = React.useCallback((animate) => {
    const map = mapRef.current;
    if (!readyRef.current || !map) return;
    let w = 180; let s = 90; let e = -180; let n = -90;
    let count = 0;
    for (const f of geojsonRef.current.features) {
      if (f.properties.ld === 0) continue;
      const [lon, lat] = f.geometry.coordinates;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      count++;
      if (lon < w) w = lon; if (lon > e) e = lon;
      if (lat < s) s = lat; if (lat > n) n = lat;
    }
    const pad = Math.round(Math.min(48, map.getCanvas().clientWidth * 0.06));
    const opts = { padding: { top: pad, bottom: pad, right: pad, left: pad }, maxZoom: 9, duration: animate && !reducedMotion() ? 480 : 0 };
    if (!framed || count === 0) {
      map.fitBounds(EUROPE, { ...opts, padding: 16 });
      return;
    }
    if (count === 1) { map.easeTo({ center: [w, s], zoom: 9, duration: opts.duration }); return; }
    map.fitBounds([[w, s], [e, n]], opts);
  }, [framed]);
  fitRef.current = fit;
  const lastFitKey = useRef(fitKey);
  useEffect(() => {
    if (lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    fitRef.current?.(true);
  }, [fitKey]);

  // Kept mounted after its first open (T441), the map is hidden while the
  // list shows; on coming back it re-measures its box.
  useEffect(() => {
    if (visible && readyRef.current) mapRef.current?.resize();
  }, [visible]);

  const kpinLabel = (k) => {
    const country = countryName(k.cc, k.country);
    const cost = k.fig && pinFig !== 'score' ? t('explore.pinCost', { eur: k.fig }) : '';
    if (k.score == null) return [k.city, country, cost].filter(Boolean).join(', ');
    const base = t('explore.pinAria', { city: k.city, country, score: Number(k.score).toFixed(1) });
    return cost ? `${base}, ${cost}` : base;
  };
  const kpinFocus = (k) => {
    lastKpinRef.current = k.key;
    onPinLinkRef.current?.(k.id);
    const map = mapRef.current;
    if (!map || cardRef.current === k.id) return;
    if (onPickRef.current || map.getZoom() < CARD_FROM) showTip(map, k.feature);
    else showCard(map, k.feature);
  };
  const kpinBlur = (e) => {
    if (e.relatedTarget) lastKpinRef.current = null;
    if (e.relatedTarget?.closest?.('.maplibregl-popup, .xmap-peek')) return;
    onPinLinkRef.current?.(null);
    closePop();
  };
  const kpinActivate = (k) => {
    if (onPickRef.current) { closePop(); pickOrOpen(k.id); return; }
    const map = mapRef.current;
    if (coarsePointer() && map && cardRef.current !== k.id) { showCard(map, k.feature); return; }
    onSelectRef.current?.(k.id);
  };

  return (
    <div className={`xmap${ready ? ' is-ready' : ''}`} role="region" aria-label={t('explore.mapAria')}>
      <div ref={containerRef} className="xmap-canvas" />
      {peek && (
        <div className="xmap-peek" role="group" aria-label={peek.city}>
          <a className="xmap-card-hit" href={`#dest=${encodeURIComponent(peek.id)}`}
            onClick={(e) => { e.preventDefault(); onSelectRef.current?.(peek.id); }}>
            <div className="xmap-card">
              {peek.thumb && <img className="xmap-card-img" src={peek.thumb} alt="" loading="lazy" />}
              <div className="xmap-card-body">
                <div className="xmap-card-head">
                  <span className="xmap-card-name">{peek.city}</span>
                  <ScoreChip rating={{ score: peek.score }} size="sm" />
                </div>
                <p className="xmap-card-sub">{peek.country}</p>
                <MatchLine place={source.find((p) => p.id === peek.id)} />
                {peek.fig && (
                  <p className="xmap-card-eur">
                    <span className="xmap-card-eur-line">
                      <span className="xmap-fig">{peek.fig}</span> {view.unit}
                    </span>
                  </p>
                )}
                {peek.lead && <p className="xmap-card-lead">{peek.lead}</p>}
              </div>
            </div>
          </a>
          <IconButton label={t('gs.close')} tone="surface" className="xmap-peek-close" onClick={closePop}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
      )}
      {failed && (
        <div className="xmap-failed" role="status">
          <p>{t('explore.mapFailed')}</p>
          {onBack && (
            <Button variant="secondary" onClick={onBack}>{t('explore.mapBack')}</Button>
          )}
        </div>
      )}
      {!failed && kpins.length > 0 && (
        <div ref={kpinsBoxRef} className="xmap-kpins" role="group" aria-label={t('explore.mapPinsAria')}>
          {kpins.map((k) => (
            <button
              key={k.key}
              type="button"
              className={`xmap-kpin${k.label ? ' is-pill' : ''}`}
              style={{ left: k.x, top: k.y, '--kpin-w': k.label ? `${Math.round(k.w)}px` : undefined }}
              // WCAG 2.5.3: the name starts with the words the pill shows
              // (the figure), then says the rest.
              aria-label={k.label && k.fig ? `${k.fig} ${k.city}, ${kpinLabel(k)}` : kpinLabel(k)}
              aria-pressed={onPick ? k.id === pickedId : undefined}
              onFocus={() => kpinFocus(k)}
              onBlur={kpinBlur}
              onKeyDown={(e) => { if (e.key === 'Escape' && popupRef.current) { e.stopPropagation(); closePop(); } }}
              onClick={() => kpinActivate(k)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
