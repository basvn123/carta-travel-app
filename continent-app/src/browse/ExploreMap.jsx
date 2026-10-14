import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { kindOf } from '../lib/taxonomy.js';
import { thumbAt } from '../lib/heroImage.js';
import { knownFor } from '../lib/knownFor.js';
import { TOKEN_COLOURS as TC, MAP_ONLY_COLOURS as MC } from '../map/tokenColors.js';
import { eurDay } from '../lib/costIndex.js';
import { formatApprox, formatEst } from '../lib/money.js';
import { isNational } from '../components/CostSummary.jsx';
import { Button } from '../components/ui/index.js';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

/**
 * The Explore map (PLAN.md C7): the same list, spatially.
 *
 * One GeoJSON source and a circle layer, not 3,868 DOM markers. The source
 * is built once from the whole catalogue, with no photo or "known for" line
 * on it (the card looks them up by id), and the filters are a layer filter
 * over an id set, which the GPU applies to tiles it already has.
 *
 * T441 (the owner's review of 2026-10-13: "it loads too long, then you only
 * see numbers"): no clusters. Every place is an ink dot sized by its kind,
 * darker for a better rating, from the first frame, and the thirty
 * best-rated in view carry their name and day cost as a label from the
 * opening view, so the map answers "where can I afford" at once. Labels
 * never overlap: the cheapest is placed first, then the better-rated, and a
 * label that would collide stays a dot. The cheapest in view is the sun
 * best-value marker. A national stand-in figure carries the estimate tilde.
 * The camera fits the filtered list inside Europe's bounds and refits when
 * the filters change; the canvas shows at its first style frame; the
 * filters set before the switch apply on load.
 *
 * Map colours are literals mirroring the :root tokens (src/map/tokenColors.js):
 * a map style sheet cannot read CSS custom properties.
 *
 * Hovering shows a tip, a card from zoom 8; on a phone a tap shows the card
 * at any zoom and a second tap opens the place. Panning calls
 * onViewport(bounds, zoom). In the 'viewport' catalogue mode (T059,
 * lib/catalogue.js) `pins` holds the whole of Europe from the boot index and
 * `all` the countries loaded so far; a pin whose record has not arrived
 * (`ld` 0) draws at the default size, ignores the filters it cannot be
 * judged on yet, and asks for its country through onNeedDetail when hovered.
 *
 * Keyboard (T190). Over the canvas sits a layer of real buttons, one per pin
 * in view up to KPIN_CAP (the best-rated, plus the cheapest), in reading
 * order; the labels are those buttons. Focus shows the same tip or card a
 * hover shows, Escape dismisses it, Enter opens the place. `ringId` (a card
 * under the pointer or in focus in the list) rings its pin 2 px in ink, and
 * `onPinLink(id)` tells the list which pin is under the pointer or in focus.
 */

// The Score drawn as a string for the map card (T437, RatingBadge.jsx): the
// star is filled from the second tier up, outlined below.
const STAR_SVG = (filled) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.8l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8L12 3.4z" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

const KIND_RADIUS = { metro: 9, city: 7, area: 7, town: 5.5, village: 4.5 };
// Ink by rating, darkest for the top tier (T441): a pin is never the brown
// action colour or the rating star, and the order survives greyscale.
const TIER_FILL = ['match', ['get', 'tier'],
  3, TC['--ink'],
  2, MC.tier2,
  1, MC.tier1,
  /* 0 */ MC.tier0];

// Where a pin stops being a dot and starts being a card.
const CARD_FROM = 8;
// Europe, and how far the camera may wander from it (T441).
const EUROPE = [[-11, 35], [32, 62]];
const EUROPE_MAX = [[-40, 22], [60, 74]];
// The price label's box, estimated for collision (the 12 px name at 500,
// the 12 px figure at 600, the gap and the padding; see 62-v6-explore.css).
// V5 (T403, row T393-g): the text is measured in the label's own font; the
// per-character width is only the fallback where a canvas is not available.
const LABEL_CHAR_W = 6.6;
const LABEL_H = 24;
// Padding 2 x 8, border 2 x 1, and the gap between the name and the figure.
const LABEL_BOX_W = 18;
const LABEL_GAP_W = 4;
// How long the basemap style may take before the frame says the map failed.
const STYLE_WAIT_MS = 12000;
let measureCtx = null;
let measureFont = null;
function textWidth(text, figure) {
  try {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    if (!measureFont) {
      measureFont = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
    }
    measureCtx.font = `${figure ? 600 : 500} 12px ${measureFont}`;
    const w = measureCtx.measureText(text).width;
    if (w > 0) return w;
  } catch { /* fall through to the estimate */ }
  return text.length * (figure ? 7.2 : LABEL_CHAR_W);
}
// The keyboard layer: at most this many pin stops, ordered in bands of this
// many pixels top to bottom, left to right within a band.
const KPIN_CAP = 30;
const KPIN_ROW = 64;

// The day figure as the cards print it, whole euros, a national stand-in
// marked as an estimate: the label carries the tilde alone, the tip, the
// card and the accessible name the tilde and the estimate word (T441).
const dayFig = (eur, est, estWord) => {
  if (!est) return eurDay(eur);
  return estWord ? formatEst(eur, estWord, { precision: 'whole' }) : formatApprox(eur, { precision: 'whole' });
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function ExploreMap({
  rows, all, pins = null, onSelect, onViewport, onNeedDetail, t, ringId = null, onPinLink = null,
  costs = null, onBack = null, visible = true, framed = false,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const popupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
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
  const ringRef = useRef(ringId);
  ringRef.current = ringId;
  // The popups are HTML strings built in memoised helpers; they read the
  // translator through a ref so a language switch reaches them.
  const tRef = useRef(t);
  tRef.current = t;
  // The canvas crossfades in over --dur-3 at its first style frame (T441;
  // V4 waited for 'load'), from the still sunken frame, instead of popping
  // in half drawn. A slow style still shows its frame after 1.5 seconds.
  const [ready, setReady] = React.useState(false);
  // V5 (T403, brief V5-5): the basemap style never arrived, so the frame
  // says so and offers the list instead of staying blank.
  const [failed, setFailed] = React.useState(false);

  // The whole catalogue, serialised once. `all` is the unfiltered set; when
  // a caller does not pass one, the current rows stand in and the map
  // behaves exactly as it did before.
  const source = all || rows;
  const geojson = React.useMemo(() => {
    // The day cost at the traveller's Lifestyle, from the same cost index
    // the cards read (`costs`, destId to cost row); -1 when there is none,
    // because a null property does not survive into a maplibre feature.
    const costOf = (p) => costs?.get(p.id) || p.cost;
    const dayOf = (p) => {
      const eur = costOf(p)?.dayEur;
      return eur != null ? Math.round(eur) : -1;
    };
    const loaded = (p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.city_lon ?? p.lon, p.city_lat ?? p.lat] },
      properties: {
        id: p.id,
        city: p.city,
        country: p.country,
        tier: p.rating?.tier ?? 0,
        score: p.rating?.score ?? null,
        gem: p.rating?.hidden_gem ? 1 : 0,
        r: KIND_RADIUS[kindOf(p)] || 5.5,
        eur: dayOf(p),
        est: isNational(costOf(p)) ? 1 : 0,
        ld: 1,
      },
    });
    const drawable = (p) => Number.isFinite(p.lat) && Number.isFinite(p.lon);
    if (!pins) return { type: 'FeatureCollection', features: source.filter(drawable).map(loaded) };
    // Boot pins, upgraded to the full feature wherever the record is in.
    const byId = new Map(source.map((p) => [p.id, p]));
    return {
      type: 'FeatureCollection',
      features: pins.filter(drawable).map((b) => {
        const p = byId.get(b.id);
        if (p) return drawable(p) ? loaded(p) : loaded({ ...p, lat: b.lat, lon: b.lon });
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
          properties: {
            id: b.id, city: '', country: '', tier: b.band, score: null,
            gem: b.hiddenGem ? 1 : 0, r: 5.5, eur: -1, est: 0, ld: 0,
          },
        };
      }),
    };
  }, [source, pins, costs]);
  // The map's load handler seeds its source from the payload current at load
  // time, not the one current when the map was created: the catalogue can
  // grow in between, and the setData effect below skips until the map is ready.
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;
  // The card's photograph and line are looked up here, by id, when a card
  // opens (T441): carrying them on all 3,868 features cost the payload.
  const byIdRef = useRef(new Map());
  byIdRef.current = React.useMemo(() => new Map(source.map((p) => [p.id, p])), [source]);

  // What survives the filters, as an expression rather than a new payload.
  // `null` means "everything", which is also what an absent `all` means.
  const keepIds = React.useMemo(() => {
    // Nothing filtered out is no filter: the camera then frames Europe,
    // not the catalogue's outliers (Iceland, the Canaries, Cyprus).
    if (!all || rows === all || rows.length === all.length) return null;
    return rows.map((p) => p.id);
  }, [rows, all]);

  // Which destination the open popup is a CARD for, or null when the popup
  // is the plain name tip (or closed). The distinction decides whether
  // leaving the pin dismisses it.
  const cardRef = useRef(null);
  const applyFilterRef = useRef(null);

  const popHelpers = React.useMemo(() => {
    const closePop = () => {
      popupRef.current?.remove();
      popupRef.current = null;
      cardRef.current = null;
    };
    const popup = (map) => {
      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({
          closeButton: false, closeOnClick: false, offset: 14, maxWidth: 'none',
        });
        popupRef.current.on('close', () => { cardRef.current = null; });
      }
      return popupRef.current.addTo(map);
    };
    // The day cost as the cards print it ("€87 a day"); -1 is "no figure".
    const eurHtml = (eur, est, cls) => (eur != null && eur >= 0
      ? `<span class="${cls}"><span class="xmap-fig">${esc(dayFig(eur, est, tRef.current('money.est')))}</span> ${esc(tRef.current('cost.perDay'))}</span>`
      : '');
    const showTip = (map, f) => {
      const { city, country, score, tier, ld, eur, est } = f.properties;
      // No record yet: ask for its country; the tip shows once it lands.
      if (ld === 0) { onNeedDetailRef.current?.(f.properties.id); return; }
      const html = `<div class="xmap-pop"><strong>${esc(city)}</strong>`
        + (score != null ? `<span class="xmap-pop-score rt-${tier}">${Number(score).toFixed(1)}</span>` : '')
        + `<br><span class="xmap-pop-sub">${esc(country)}</span>`
        + (eur >= 0 ? `<br>${eurHtml(eur, est === 1, 'xmap-pop-eur')}` : '')
        + '</div>';
      cardRef.current = null;
      popup(map).setLngLat(f.geometry.coordinates).setHTML(html);
    };
    const showCard = (map, f) => {
      const { id, city, country, score, tier, eur, est } = f.properties;
      const rec = byIdRef.current.get(id);
      const img = rec ? (rec.image?.url || rec.image || '') : '';
      const lead = rec ? (knownFor(rec) || '') : '';
      const thumb = img ? thumbAt(img, 250) : '';
      const html = `<button type="button" class="xmap-card-hit" data-id="${esc(id)}">`
        + '<div class="xmap-card">'
        + (thumb ? `<img class="xmap-card-img" src="${esc(thumb)}" alt="" loading="lazy">` : '')
        + '<div class="xmap-card-body"><div class="xmap-card-head">'
        + `<span class="xmap-card-name">${esc(city)}</span>`
        + (score != null ? `<span class="xmap-card-score rt-${tier}">${STAR_SVG(tier >= 2)}${Number(score).toFixed(1)}</span>` : '')
        + '</div>'
        + `<p class="xmap-card-sub">${esc(country)}</p>`
        + (eur >= 0 ? `<p class="xmap-card-eur">${eurHtml(eur, est === 1, 'xmap-card-eur-line')}</p>` : '')
        + (lead ? `<p class="xmap-card-lead">${esc(lead)}</p>` : '')
        + '</div></div></button>';
      cardRef.current = id;
      const p = popup(map).setLngLat(f.geometry.coordinates).setHTML(html);
      // The card is a button: clicking anywhere on it opens the place.
      p.getElement()?.querySelector('.xmap-card-hit')
        ?.addEventListener('click', () => onSelectRef.current?.(id));
    };
    return { closePop, showTip, showCard };
  }, []);
  const { closePop, showTip, showCard } = popHelpers;

  // The keyboard layer. `kpins` is what React renders; the move handler
  // repositions the same buttons through kpinElsRef without a render.
  const [kpins, setKpins] = React.useState([]);
  const kpinsRef = useRef(kpins);
  kpinsRef.current = kpins;
  const kpinElsRef = useRef(new Map());
  // The pin that last held focus, so a rebuild that drops it (the map moved
  // it out of view) can hand focus to the canvas instead
  // of losing it to the page body.
  const lastKpinRef = useRef(null);

  const collectKpins = React.useCallback((map) => {
    const canvas = map.getCanvas();
    const W = canvas.clientWidth; const H = canvas.clientHeight;
    const layers = ['dest-dots'].filter((l) => map.getLayer(l));
    if (!layers.length) return [];
    const seen = new Set();
    const out = [];
    for (const f of map.queryRenderedFeatures({ layers })) {
      const pr = f.properties || {};
      const key = `d${pr.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // A pin whose record has not arrived has no name to read out yet; it
      // joins the layer on the idle after its country lands.
      if (pr.ld === 0) continue;
      const lngLat = f.geometry.coordinates;
      const pt = map.project(lngLat);
      if (pt.x < 0 || pt.y < 0 || pt.x > W || pt.y > H) continue;
      out.push({
        key, lngLat, x: pt.x, y: pt.y,
        id: pr.id, city: pr.city, country: pr.country, score: pr.score, tier: pr.tier ?? 0,
        eur: pr.eur != null && pr.eur >= 0 ? pr.eur : null, est: pr.est === 1,
        r: pr.r || 5.5,
        feature: { geometry: { coordinates: lngLat }, properties: pr },
      });
    }
    out.sort((a, b) => (b.tier - a.tier) || ((b.score ?? -1) - (a.score ?? -1)));
    // The cheapest place in view always gets a stop (and so a label): it is
    // the one pin the map emphasises, so it cannot be left a bare dot because
    // thirty better-rated places outranked it.
    const set = out.slice(0, KPIN_CAP);
    let cheapest = null;
    for (const k of out) {
      if (k.eur != null && (!cheapest || k.eur < cheapest.eur)) cheapest = k;
    }
    if (cheapest && !set.includes(cheapest)) set[set.length - 1] = cheapest;
    return set.sort((a, b) => (
      Math.floor(a.y / KPIN_ROW) - Math.floor(b.y / KPIN_ROW)) || (a.x - b.x));
  }, []);

  useEffect(() => {
    if (mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds: EUROPE,
      fitBoundsOptions: { padding: 16 },
      maxBounds: EUROPE_MAX,
      minZoom: 2.5,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    // A verify seam: scripts/verify_map_size_cards.mjs moves the camera to an
    // exact zoom through it (a wheel gesture lands wherever it lands).
    containerRef.current._cartaMap = map;
    // T441: the canvas shows at the first style frame, not after every tile
    // and glyph has arrived ('load'); the dots are our own data and draw as
    // soon as the source is in.
    const showCanvas = () => setReady(true);
    map.once('styledata', showCanvas);
    const readyTimer = setTimeout(showCanvas, 1500);
    // Tile and glyph errors after the style has arrived are not a failed
    // map (the pins are drawn from our own data); a style that never
    // arrives is.
    let styleSeen = false;
    map.on('styledata', () => { styleSeen = true; });
    const fail = () => { if (!styleSeen) setFailed(true); };
    map.on('error', fail);
    const styleTimer = setTimeout(fail, STYLE_WAIT_MS);

    // T441: our dots and labels go in as soon as the style has loaded, not
    // on 'load', which waits for the first complete render, tiles included
    // (four to six seconds before the first price on a throttled phone).
    map.once('style.load', () => {
      map.addSource('dests', { type: 'geojson', data: geojsonRef.current });
      // T441: one dot per place, in ink, sized by kind (house rule "Price
      // pins": every place that is not a label is a dot). Better-rated places
      // draw a touch darker, so the eye finds them; the price labels on top
      // carry the rest.
      map.addLayer({
        id: 'dest-dots', type: 'circle', source: 'dests',
        paint: {
          // Small at the opening zoom, where 3,868 places share one screen,
          // growing to full size by the time they spread apart.
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            3, ['*', ['get', 'r'], 0.42], 6, ['*', ['get', 'r'], 0.75], 9, ['get', 'r'], 12, ['*', ['get', 'r'], 1.4]],
          'circle-color': TIER_FILL,
          // Unrated places recede; the rated ones carry the picture.
          'circle-opacity': ['match', ['get', 'tier'], 0, 0.55, 0.92],
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1],
          'circle-stroke-color': TC['--bg-card'],
        },
      });
      // The list-to-map ring: the pin of the card under the pointer or in
      // focus, 2 px --ink, never the accent (explore N5).
      map.addLayer({
        id: 'dest-ring', type: 'circle', source: 'dests',
        filter: ['==', ['get', 'id'], ringRef.current || ''],
        paint: {
          'circle-radius': ['+', ['get', 'r'], 4],
          'circle-color': TC['--ink'],
          'circle-opacity': 0,
          'circle-stroke-width': 2,
          'circle-stroke-color': TC['--ink'],
        },
      });

      // A tap opens the card first and waits (touch has no hover, and the
      // card is the thing worth reading: on a phone at any zoom, T441, a peek
      // card over the map); a second tap of the same pin, or a click with a
      // mouse past the card zoom, opens the place.
      const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
      map.on('click', 'dest-dots', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const id = f.properties.id;
        if ((coarse || map.getZoom() >= CARD_FROM) && f.properties.ld !== 0 && cardRef.current !== id) { showCard(map, f); return; }
        onSelectRef.current?.(id);
      });
      map.on('mouseenter', 'dest-dots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'dest-dots', () => {
        map.getCanvas().style.cursor = '';
        onPinLinkRef.current?.(null);
        // The card is hoverable (WCAG 1.4.13): travelling into it to read
        // the line or click it must not dismiss it, so only the plain name
        // tip closes on leaving the pin.
        if (!cardRef.current) closePop();
      });
      map.on('mousemove', 'dest-dots', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        if (f.properties.ld !== 0) onPinLinkRef.current?.(f.properties.id);
        if (map.getZoom() >= CARD_FROM && f.properties.ld !== 0) {
          if (cardRef.current !== f.properties.id) showCard(map, f);
        } else {
          showTip(map, f);
        }
      });
      map.on('zoomend', () => {
        // Zooming back out turns an open card back into the plain map.
        if (!coarse && map.getZoom() < CARD_FROM && cardRef.current) closePop();
      });
      map.on('moveend', () => {
        const b = map.getBounds();
        onViewportRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], map.getZoom());
      });
      // Keyboard layer: follow the pins every frame, rebuild when settled.
      map.on('move', () => {
        for (const k of kpinsRef.current) {
          const el = kpinElsRef.current.get(k.key);
          if (!el) continue;
          const pt = map.project(k.lngLat);
          el.style.left = `${pt.x}px`;
          el.style.top = `${pt.y}px`;
        }
      });
      // The labels are placed on the first frame that draws our dots, not
      // after every basemap tile has arrived ('idle' took 4 to 6 seconds on
      // a throttled phone, T441); 'idle' then refines them as usual.
      const early = () => {
        if (!map.isSourceLoaded('dests')) return;
        map.off('render', early);
        setKpins(collectKpins(map));
      };
      map.on('render', early);
      let firstIdle = true;
      map.on('idle', () => {
        setKpins(collectKpins(map));
        // A measure point for the map's open time (T441).
        if (firstIdle) { firstIdle = false; try { performance.mark('carta:map-idle'); } catch { /* old browser */ } }
      });
      readyRef.current = true;
      // T441: the filters set before the switch apply now (they were skipped
      // while the map loaded), and the camera frames what the list holds.
      applyFilterRef.current?.();
      fitRef.current?.(false);
    });
    return () => {
      clearTimeout(readyTimer);
      clearTimeout(styleTimer);
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // The map is built once: the popup helpers and collectKpins are memos
    // with no dependencies, so listing them never rebuilds it.
  }, [closePop, showTip, showCard, collectKpins]);

  // A rebuild that dropped the focused pin hands focus to the canvas, so the
  // keyboard stays on the map instead of falling to the top of the page.
  useEffect(() => {
    const last = lastKpinRef.current;
    if (!last || kpins.some((k) => k.key === last)) return;
    lastKpinRef.current = null;
    const a = document.activeElement;
    if (!a || a === document.body) mapRef.current?.getCanvas().focus({ preventScroll: true });
  }, [kpins]);

  // The ring follows the card the reader is on in the list.
  useEffect(() => {
    const map = mapRef.current;
    if (readyRef.current && map?.getLayer('dest-ring')) {
      map.setFilter('dest-ring', ['==', ['get', 'id'], ringId || '']);
    }
  }, [ringId]);

  const kpinLabel = (k) => {
    const cost = k.eur != null ? t('explore.pinCost', { eur: dayFig(k.eur, k.est, t('money.est')) }) : '';
    if (k.score == null) return [k.city, k.country, cost].filter(Boolean).join(', ');
    const base = t('explore.pinAria', { city: k.city, country: k.country, score: Number(k.score).toFixed(1) });
    return cost ? `${base}, ${cost}` : base;
  };
  // At every zoom the place pins are price labels (T441), and the cheapest
  // of them is the one emphasised pin in view.
  let best = null;
  for (const k of kpins) {
    if (k.eur != null && (!best || k.eur < best.eur)) best = k;
  }
  const cheapestKey = best?.key ?? null;
  // V4 (T393, row T383-c): labels never sit on each other. They are placed
  // in priority order, the cheapest first, then the better-rated; a label
  // that would overlap one already placed stays a dot (still a keyboard
  // stop, with its name and cost in its accessible name). The box is an
  // estimate from the text length, which is all a pin knows before it draws.
  const dotOnly = new Set();
  {
    const placed = [];
    // A label must sit wholly inside the frame (T441: the phone cut
    // "Porto" and "Lisbon" at its left edge); one that would not is a dot.
    const cv = mapRef.current?.getCanvas();
    const W = cv?.clientWidth || Infinity;
    const H = cv?.clientHeight || Infinity;
    const order = [...kpins].sort((a, b) => (
      Number(b.key === cheapestKey) - Number(a.key === cheapestKey))
      || (b.tier - a.tier) || ((b.score ?? -1) - (a.score ?? -1)));
    for (const k of order) {
      const name = String(k.city || '');
      const w = LABEL_BOX_W + textWidth(name, false)
        + (k.eur != null ? LABEL_GAP_W + textWidth(dayFig(k.eur, k.est), true) : 0);
      const box = { l: k.x - w / 2, r: k.x + w / 2, t: k.y - LABEL_H / 2, b: k.y + LABEL_H / 2 };
      const outside = box.l < 4 || box.t < 4 || box.r > W - 4 || box.b > H - 4;
      if (outside || placed.some((o) => box.l < o.r && o.l < box.r && box.t < o.b && o.t < box.b)) {
        dotOnly.add(k.key);
      } else {
        placed.push(box);
      }
    }
  }
  const kpinFocus = (k) => {
    lastKpinRef.current = k.key;
    onPinLinkRef.current?.(k.id);
    const map = mapRef.current;
    if (!map) return;
    // The card a tap raised stays up when the same pin is touched again.
    if (cardRef.current === k.id) return;
    if (map.getZoom() >= CARD_FROM) showCard(map, k.feature);
    else showTip(map, k.feature);
  };
  const kpinBlur = (e) => {
    // Focus moving to a real element clears the memory; a blur with no
    // target is the button being removed under focus (see the effect above).
    if (e.relatedTarget) lastKpinRef.current = null;
    // Focus moving into the pin's own card (a tap on it) keeps the card.
    if (e.relatedTarget?.closest?.('.maplibregl-popup')) return;
    onPinLinkRef.current?.(null);
    closePop();
  };
  // On touch a first tap raises the peek card (photo, name, Score, price)
  // and a second tap, on the pin or the card, opens the place (T441), the
  // same as a tap on a dot; a mouse or the keyboard opens it at once.
  const kpinActivate = (k) => {
    const map = mapRef.current;
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && map && cardRef.current !== k.id) { showCard(map, k.feature); return; }
    onSelectRef.current?.(k.id);
  };

  // The payload is serialised once (the memo above depends on `all`, which
  // does not change while the user filters), so this fires on mount and
  // then only if the catalogue itself is replaced.
  useEffect(() => {
    if (readyRef.current) mapRef.current?.getSource('dests')?.setData(geojson);
  }, [geojson]);

  /**
   * Filters changed: a layer filter over the one payload, never a new one.
   * maplibre keeps the tiles it has and re-evaluates a match instead of
   * re-parsing up to 3,868 features on every keystroke. With no clusters
   * (T441) there is no count to keep true, so this is the whole story.
   */
  const applyFilter = React.useCallback(() => {
    const map = mapRef.current;
    if (!readyRef.current || !map || !map.getLayer('dest-dots')) return;
    // A boot pin without its record cannot be judged by a filter yet, so it
    // stays until its country arrives and the real answer replaces it.
    const kept = ['in', ['get', 'id'], ['literal', keepIds || []]];
    map.setFilter('dest-dots', keepIds
      ? (pins ? ['any', ['==', ['get', 'ld'], 0], kept] : kept)
      : null);
  }, [keepIds, pins]);

  applyFilterRef.current = applyFilter;
  useEffect(() => { applyFilter(); }, [applyFilter]);

  // The camera frames what the list holds (T441): on load, and again when
  // the filters change; the whole of Europe when nothing narrows it
  // (`framed` false: no filter and no search).
  const fit = React.useCallback((animate) => {
    const map = mapRef.current;
    if (!readyRef.current || !map) return;
    let w = 180; let s = 90; let e = -180; let n = -90;
    const keep = keepIds && new Set(keepIds);
    let count = 0;
    for (const f of geojsonRef.current.features) {
      if (keep && !keep.has(f.properties.id)) continue;
      const [lon, lat] = f.geometry.coordinates;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      count++;
      if (lon < w) w = lon; if (lon > e) e = lon;
      if (lat < s) s = lat; if (lat > n) n = lat;
    }
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // A phone's map is narrow: the frame keeps a gutter, not a fixed 48 px.
    const pad = Math.round(Math.min(48, map.getCanvas().clientWidth * 0.06));
    const opts = { padding: pad, maxZoom: 9, duration: animate && !reduce ? 480 : 0 };
    if (!keep || !framed || count === 0) { map.fitBounds(EUROPE, { ...opts, padding: 16 }); return; }
    if (count === 1) { map.easeTo({ center: [w, s], zoom: 9, duration: opts.duration }); return; }
    map.fitBounds([[w, s], [e, n]], opts);
  }, [keepIds, framed]);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const firstFit = useRef(true);
  useEffect(() => {
    // The load handler frames the first view; after that, a change of filters.
    if (firstFit.current) { firstFit.current = false; return; }
    fit(true);
  }, [fit]);

  // Kept mounted after its first open (T441), the map is hidden while the
  // list shows; on coming back it re-measures its box.
  useEffect(() => {
    if (visible && readyRef.current) mapRef.current?.resize();
  }, [visible]);

  return (
    <div className={`xmap${ready ? ' is-ready' : ''}`} role="region" aria-label={t('explore.mapAria')}>
      <div ref={containerRef} className="xmap-canvas" />
      {failed && (
        <div className="xmap-failed" role="status">
          <p>{t('explore.mapFailed')}</p>
          {onBack && (
            <Button variant="secondary" onClick={onBack}>{t('explore.mapBack')}</Button>
          )}
        </div>
      )}
      {!failed && kpins.length > 0 && (
        <div className="xmap-kpins" role="group" aria-label={t('explore.mapPinsAria')}>
          {kpins.map((k) => {
            const label = !dotOnly.has(k.key);
            const cls = `xmap-kpin${label ? ' is-label' : ''}`
              + `${k.key === cheapestKey ? ' is-cheapest' : ''}${k.id === ringId ? ' is-ringed' : ''}`;
            return (
              <button
                key={k.key}
                type="button"
                ref={(el) => { if (el) kpinElsRef.current.set(k.key, el); else kpinElsRef.current.delete(k.key); }}
                className={cls}
                style={{ left: k.x, top: k.y, '--kpin-d': `${Math.round(k.r * 2 + 4)}px` }}
                aria-label={kpinLabel(k)}
                onFocus={() => kpinFocus(k)}
                onBlur={kpinBlur}
                onPointerEnter={label ? () => kpinFocus(k) : undefined}
                onPointerLeave={label ? (e) => {
                  // Travelling into the pin's own card keeps the link and the
                  // card (WCAG 1.4.13: hoverable); anywhere else drops both.
                  if (e.relatedTarget?.closest?.('.maplibregl-popup')) return;
                  onPinLinkRef.current?.(null);
                  if (!cardRef.current) closePop();
                } : undefined}
                onKeyDown={(e) => { if (e.key === 'Escape' && popupRef.current) { e.stopPropagation(); closePop(); } }}
                onClick={() => kpinActivate(k)}
              >
                {/* The label is drawn for the eye; the button's name above
                    already says the same, so the label is hidden from it. */}
                {label && (
                  <span className="xmap-kpin-label" aria-hidden="true">
                    <span className="xmap-kpin-name">{k.city}</span>
                    {k.eur != null && <span className="xmap-kpin-eur">{dayFig(k.eur, k.est)}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
