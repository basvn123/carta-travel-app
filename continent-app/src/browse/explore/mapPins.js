/*
 * Explore's pins as map layers (G12, map view: decision.md "Pins"). The map
 * draws them, not the page: a price pill, a count bubble and a dot are
 * symbols and circles over one GeoJSON source, so panning moves no DOM and
 * the map's own collision keeps pills apart, the best-ranked first.
 *
 *   dest-dots    every place not in a bubble: an 8 px umber dot, white ring
 *   xcluster     a crowd at low zoom: a round count bubble, tap to zoom in
 *   xpin         a price pill (white, ink figure) for the best-ranked places
 *                that fit; symbol-sort-key is the rank in the list's sort.
 *                Its source `dests` holds only the pills chosen to show (a
 *                hundred at most), set again once the camera has rested and
 *                only when the set changed: a new filter on the source of
 *                every place made MapLibre lay out all of its tiles again,
 *                which cost the pan its frames (fix round 3, progress-3.md)
 *   xpin-best    the best value in view: the same pill with a saffron dot
 *   xpin-hot     the pin of the card under the pointer: lifted, umber edge
 *   xpin-picked  the picked place: umber, its name before the figure
 *
 * The pills are canvas images made on demand (`styleimagemissing`), drawn
 * in the page's own face (Overpass) from the tokens, so the map needs no
 * glyph server for them and a basemap swap keeps them. An image id says
 * everything the drawing needs: `xp<TAB>kind<TAB>text[<TAB>figure]`,
 * `xc<TAB>count`.
 */
import { tokenColour } from '../../map/tokenColors.js';

export const SEP = '\t';
const EMPTY = { type: 'FeatureCollection', features: [] };
// What each one-feature source holds now, so an unchanged hover sets nothing.
const held = new WeakMap();
// Top first: the order a hit test asks in.
export const PIN_LAYERS = ['xpin-picked', 'xpin-hot', 'xpin-best', 'xpin'];
export const HIT_LAYERS = [...PIN_LAYERS, 'xcluster'];
// Where crowds stop being bubbles, and how close counts as a crowd.
const CLUSTER_MAX_ZOOM = 6;
const CLUSTER_RADIUS = 46;

const KINDS = {
  // height, horizontal padding, figure size, edge width
  n: { h: 26, px: 9, fs: 13, edge: 1 },
  b: { h: 26, px: 9, fs: 13, edge: 1 },
  h: { h: 28, px: 10, fs: 14, edge: 2 },
  p: { h: 30, px: 11, fs: 14, edge: 0 },
};
// Room around the pill for its shadow.
const SHADOW = 4;

let fontCache = null;
function face() {
  if (!fontCache) {
    fontCache = (typeof document !== 'undefined'
      && getComputedStyle(document.documentElement).getPropertyValue('--font').trim()) || 'sans-serif';
  }
  return fontCache;
}
// The map draws at 2x at most (ExploreMap.jsx); a 3x image is half again
// as many bytes for every tile's icon atlas, for nothing the eye sees.
const ratio = () => Math.min(2, Math.max(1, Math.round((typeof window !== 'undefined' && window.devicePixelRatio) || 1)));

/** A token hex as rgba with this alpha (canvas shadows want a soft colour). */
function alpha(colour, a) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(colour).trim());
  if (!m) return colour;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

// The drawn width of each pill in CSS pixels, by image id, so the chrome
// check knows how far a pill reaches from its point.
const sizes = new Map();
export const pinSize = (id) => sizes.get(id) || null;

let measure = null;
function textW(text, weight, size) {
  if (!measure) measure = document.createElement('canvas').getContext('2d');
  if (!measure) return text.length * size * 0.6;
  measure.font = `${weight} ${size}px ${face()}`;
  return measure.measureText(text).width;
}

/** The width a normal pill with this text will have (CSS px, no shadow). */
export function pillWidth(text) {
  const k = KINDS.n;
  return Math.ceil(textW(String(text), 800, k.fs) + 2 * k.px);
}

function canvas(w, h) {
  const pr = ratio();
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * pr);
  cv.height = Math.ceil(h * pr);
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.scale(pr, pr);
  return { cv, ctx, pr };
}

function drawPill(kind, text, fig) {
  const k = KINDS[kind] || KINDS.n;
  const name = kind === 'p' && fig ? text : '';
  const figure = kind === 'p' ? (fig || text) : text;
  const nameW = name ? textW(name, 600, k.fs) + 5 : 0;
  const figW = textW(figure, 800, k.fs);
  const dot = kind === 'b' ? 7 + 5 : 0;
  const w = Math.ceil(2 * k.px + dot + nameW + figW);
  const W = w + 2 * SHADOW;
  const H = k.h + 2 * SHADOW + 2;
  const c = canvas(W, H);
  if (!c) return null;
  const { ctx } = c;
  const surface = tokenColour('--surface');
  const ink = tokenColour('--text');
  const action = tokenColour('--action');
  ctx.save();
  ctx.shadowColor = alpha(tokenColour('--umber-800'), 0.32);
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  roundRect(ctx, SHADOW, SHADOW, w, k.h, k.h / 2);
  ctx.fillStyle = kind === 'p' ? action : surface;
  ctx.fill();
  ctx.restore();
  if (k.edge) {
    roundRect(ctx, SHADOW + k.edge / 2, SHADOW + k.edge / 2, w - k.edge, k.h - k.edge, (k.h - k.edge) / 2);
    ctx.lineWidth = k.edge;
    ctx.strokeStyle = kind === 'h' ? action : tokenColour('--border-soft');
    ctx.stroke();
  }
  let x = SHADOW + k.px;
  const mid = SHADOW + k.h / 2;
  if (dot) {
    ctx.beginPath();
    ctx.arc(x + 3.5, mid, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = tokenColour('--sun-400');
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = tokenColour('--sun-800');
    ctx.stroke();
    x += dot;
  }
  ctx.textBaseline = 'middle';
  const onFill = tokenColour('--on-fill');
  if (name) {
    ctx.font = `600 ${k.fs}px ${face()}`;
    ctx.fillStyle = onFill;
    ctx.fillText(name, x, mid + 1);
    x += nameW;
  }
  ctx.font = `800 ${k.fs}px ${face()}`;
  ctx.fillStyle = kind === 'p' ? onFill : ink;
  ctx.fillText(figure, x, mid + 1);
  return { c, w: W, h: H };
}

function drawCount(label) {
  const fs = 12;
  const d = Math.max(30, Math.ceil(textW(label, 800, fs) + 16));
  const W = d + 2 * SHADOW;
  const H = 30 + 2 * SHADOW + 2;
  const c = canvas(W, H);
  if (!c) return null;
  const { ctx } = c;
  ctx.save();
  ctx.shadowColor = alpha(tokenColour('--umber-800'), 0.3);
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  roundRect(ctx, SHADOW, SHADOW, d, 30, 15);
  ctx.fillStyle = tokenColour('--surface');
  ctx.fill();
  ctx.restore();
  roundRect(ctx, SHADOW + 1, SHADOW + 1, d - 2, 28, 14);
  ctx.lineWidth = 2;
  ctx.strokeStyle = tokenColour('--umber-300');
  ctx.stroke();
  ctx.font = `800 ${fs}px ${face()}`;
  ctx.fillStyle = tokenColour('--umber-800');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, SHADOW + d / 2, SHADOW + 16);
  return { c, w: W, h: H };
}

/** Draws the image a layer asked for and adds it to the map; false when the
 *  id is not one of ours. `countLabel` formats a crowd's count. */
export function addPinImage(map, id, countLabel = (n) => String(n)) {
  if (!id || map.hasImage(id)) return true;
  const parts = String(id).split(SEP);
  let out = null;
  if (parts[0] === 'xp') out = drawPill(parts[1], parts[2] || '', parts[3] || '');
  else if (parts[0] === 'xc') out = drawCount(countLabel(Number(parts[1]) || 0));
  else return false;
  if (!out) return true;
  const { c, w, h } = out;
  sizes.set(id, [w - 2 * SHADOW, h - 2 * SHADOW]);
  map.addImage(id, c.ctx.getImageData(0, 0, c.cv.width, c.cv.height), { pixelRatio: c.pr });
  return true;
}

/** The pin sources and layers, added once per style (a basemap swap drops
 *  and re-adds them). `data` is the FeatureCollection to start from. */
export function addPinLayers(map, data) {
  if (map.getSource('dests')) return;
  map.addSource('dests', { type: 'geojson', data: EMPTY });
  // The hovered and the picked place each get a one-feature source: a new
  // filter on the big source did not always re-place its symbols until the
  // camera moved (the pick at 820 px drew nothing); new data always does.
  map.addSource('dests-hot', { type: 'geojson', data: EMPTY });
  map.addSource('dests-pick', { type: 'geojson', data: EMPTY });
  held.delete(map);
  map.addSource('dests-c', {
    type: 'geojson', data, cluster: true, clusterMaxZoom: CLUSTER_MAX_ZOOM, clusterRadius: CLUSTER_RADIUS,
  });
  map.addLayer({
    id: 'dest-dots', type: 'circle', source: 'dests-c',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 4, 12, 5],
      'circle-color': tokenColour('--umber-500'),
      'circle-stroke-width': 1.5,
      'circle-stroke-color': tokenColour('--surface'),
    },
  });
  const symbol = (id, source, filter, image, extra = {}, paint = undefined) => map.addLayer({
    id, type: 'symbol', source, filter,
    layout: {
      'icon-image': image,
      'icon-allow-overlap': false,
      'icon-padding': 2,
      ...extra,
    },
    ...(paint ? { paint } : {}),
  });
  // A bubble under the floating chrome fades by feature state: a filter on
  // this source would lay out every dot again on each pan.
  symbol('xcluster', 'dests-c', ['has', 'point_count'],
    ['concat', `xc${SEP}`, ['to-string', ['get', 'point_count']]], {},
    { 'icon-opacity': ['case', ['boolean', ['feature-state', 'under'], false], 0, 1] });
  // Fixed filters: which pills show is the source's data, never a filter.
  symbol('xpin', 'dests', ['!=', ['get', 'best'], 1],
    ['concat', `xp${SEP}n${SEP}`, ['get', 'fig']],
    { 'symbol-sort-key': ['get', 'rank'] });
  symbol('xpin-best', 'dests', ['==', ['get', 'best'], 1],
    ['concat', `xp${SEP}b${SEP}`, ['get', 'fig']]);
  symbol('xpin-hot', 'dests-hot', ['has', 'id'],
    ['concat', `xp${SEP}h${SEP}`, ['case', ['!=', ['get', 'fig'], ''], ['get', 'fig'], ['get', 'city']]],
    { 'icon-allow-overlap': true });
  symbol('xpin-picked', 'dests-pick', ['has', 'id'],
    ['concat', `xp${SEP}p${SEP}`, ['get', 'city'], SEP, ['get', 'fig']],
    { 'icon-allow-overlap': true });
}

/** The pins of this moment: `shown` (ids) are the pills that fit (none under
 *  the floating chrome); the best, the hot and the picked pin each draw in
 *  their own layer and nowhere else; bubbles under the chrome leave. Sources
 *  and filters are set only when they changed. */
export function setPinFilters(map, { shown = [], hiddenClusters = [], best = '', hot = '', picked = '', featureOf = () => null }) {
  if (!map.getLayer('xpin')) return;
  const bf = best && best !== hot && best !== picked ? featureOf(best) : null;
  if (bf && typeof document !== 'undefined' && map.hasImage) addPinImage(map, ['xp', 'b', bf.properties.fig].join(SEP));
  const pills = [];
  for (const pid of shown) {
    if (pid === hot || pid === picked) continue;
    const f = featureOf(pid);
    if (!f?.properties.fig) continue;
    pills.push({ ...f, properties: { ...f.properties, best: pid === best ? 1 : 0 } });
  }
  if (bf && !shown.includes(best)) pills.push({ ...bf, properties: { ...bf.properties, best: 1 } });
  const keyOf = ({ properties: p }) => `${p.fig}${SEP}${p.best}${SEP}${p.rank}`;
  const next = new Map(pills.map((f) => [f.properties.id, keyOf(f)]));
  const clusterKey = hiddenClusters.join(',');
  const h0 = held.get(map) || {};
  const prev = h0.pills;
  const changed = !prev || prev.size !== next.size
    || [...next].some(([pid, key]) => prev.get(pid) !== key);
  if (changed) {
    held.set(map, { ...h0, pills: next });
    // Each pill's image goes in before the data: a pill laid out before its
    // image existed stayed blank (2 of 9 drawn at 390 px).
    if (typeof document !== 'undefined' && map.hasImage) {
      for (const f of pills) addPinImage(map, ['xp', f.properties.best ? 'b' : 'n', f.properties.fig].join(SEP));
    }
    const src = map.getSource?.('dests');
    // New data, not updateData: a diff reloaded only some tiles and left
    // pills out (2 of 9 drawn at 390 px, progress-3.md).
    src?.setData({ type: 'FeatureCollection', features: pills });
  }
  const one = (src, pid) => {
    const f = pid ? featureOf(pid) : null;
    // The figure is part of the key: a new price redraws the same place.
    const key = f ? `${pid}${SEP}${f.properties.fig}` : '';
    const h = held.get(map) || {};
    if (h[src] === key) return;
    held.set(map, { ...h, [src]: key });
    // The pill's image goes in before the data: a pill laid out before its
    // image existed stayed blank until the next relayout (the pick at 820 px).
    if (f && typeof document !== 'undefined' && map.hasImage) {
      const pr = f.properties;
      addPinImage(map, src === 'dests-pick'
        ? ['xp', 'p', pr.city, pr.fig].join(SEP) : ['xp', 'h', pr.fig || pr.city].join(SEP));
    }
    map.getSource?.(src)?.setData(f ? { type: 'FeatureCollection', features: [f] } : EMPTY);
  };
  one('dests-hot', hot && hot !== picked ? hot : '');
  one('dests-pick', picked || '');
  const h1 = held.get(map) || {};
  if (h1.clusters !== clusterKey && map.getSource?.('dests-c')) {
    held.set(map, { ...h1, clusters: clusterKey });
    map.removeFeatureState?.({ source: 'dests-c' });
    for (const id of hiddenClusters) map.setFeatureState?.({ source: 'dests-c', id }, { under: true });
  }
}

/** Whether a bubble is faded under the floating chrome (not a tap target). */
export function isUnder(map, f) {
  return f?.layer?.id === 'xcluster' && f.id != null
    && !!map.getFeatureState?.({ source: 'dests-c', id: f.id })?.under;
}

/** The pin (or bubble, or nearest dot within `slop` px) under a point. */
export function pinAt(map, pt, slop = 22) {
  const layers = HIT_LAYERS.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none');
  const top = layers.length ? map.queryRenderedFeatures([pt.x, pt.y], { layers }).find((f) => !isUnder(map, f)) : null;
  if (top) return top;
  if (!map.getLayer('dest-dots')) return null;
  const dots = map.queryRenderedFeatures([[pt.x - slop, pt.y - slop], [pt.x + slop, pt.y + slop]], { layers: ['dest-dots'] });
  let best = null; let bestD = Infinity;
  for (const f of dots) {
    const p = map.project(f.geometry.coordinates);
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d < bestD) { best = f; bestD = d; }
  }
  return best && bestD <= slop ? best : null;
}
