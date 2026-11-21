/*
 * Explore's pins as map layers (G12, map view: decision.md "Pins"; round 2,
 * .work/2026-11-20-map-view-2/proposal.md section 1). The map draws them,
 * not the page: photo pins, price pills, count bubbles and dots are symbols
 * and circles over GeoJSON sources, so panning moves no DOM.
 *
 *   dest-halo    a soft umber halo under every dot
 *   dest-dots    every place not in a bubble: an umber 600 dot, paper ring
 *   xcluster     a crowd at low zoom (to zoom 4): a count bubble, tap to zoom
 *   xpin         a price pill (paper, ink figure, a 5 px point under it) for
 *                the best-ranked places that fit and have no photo pin.
 *                Its source `dests` holds only the pills chosen to show, set
 *                again once the camera has rested and only when the set
 *                changed: a new filter on the source of every place made
 *                MapLibre lay out all of its tiles again (fix round 3)
 *   xpin-best    the best value in view as a pill: a saffron dot in it
 *   xpin-photo   a photo pin: the place's own photograph in a paper ring,
 *                the Score as an ink plate on its corner and a label with
 *                the figure (and the name when it fits); the best-ranked
 *                places in view, how many by zoom (ExploreMap.jsx). Each is
 *                one canvas image, drawn once its photograph is in.
 *   xpin-hot     the pin of the card under the pointer: an umber edge
 *   xpin-picked  the picked place: umber ring and label with its name
 *
 * Every pin stands on its point: the image's bottom centre (less its shadow
 * room) is the tip of its 5 px point.
 *
 * The images are drawn in the page's own face (Overpass) from the tokens, so
 * the map needs no glyph server for them and a basemap swap keeps them. An
 * image id says everything the drawing needs:
 *   xp<TAB>kind<TAB>text[<TAB>figure]       a pill (kinds n, b, h, p)
 *   xp<TAB>face<TAB>id<TAB>score<TAB>fig<TAB>name
 *                                           a photo pin; face is fs (44 px)
 *                                           or fn (56 px, named), then b
 *                                           (best value), h (hot) or p
 *                                           (picked)
 *   xc<TAB>count                            a bubble
 * The map asks for a missing one through setMissingStyleImageResolver
 * (MapLibre 6: a styleimagemissing listener can no longer answer the
 * request that raised it, which left "xc 23" blank with a console warning).
 */
import { tokenColour } from '../../map/tokenColors.js';

export const SEP = '\t';
const EMPTY = { type: 'FeatureCollection', features: [] };
// What each one-feature source holds now, so an unchanged hover sets nothing.
const held = new WeakMap();
// Top first: the order a hit test asks in.
export const PIN_LAYERS = ['xpin-picked', 'xpin-hot', 'xpin-photo', 'xpin-best', 'xpin'];
export const HIT_LAYERS = [...PIN_LAYERS, 'xcluster'];
// Crowds are bubbles below zoom 5 only (proposal: photo pins take over from
// the country zoom); how close counts as a crowd.
const CLUSTER_MAX_ZOOM = 4;
const CLUSTER_RADIUS = 46;

const KINDS = {
  // height, horizontal padding, figure size, edge width
  n: { h: 26, px: 9, fs: 13, edge: 1 },
  b: { h: 26, px: 9, fs: 13, edge: 1 },
  h: { h: 28, px: 10, fs: 14, edge: 2 },
  p: { h: 30, px: 11, fs: 14, edge: 0 },
};
// Room around a pin for its shadow; the point under a pin.
export const SHADOW = 4;
const POINT = 5;
// Photo pins: the photo's size and corner, the label's figure size.
const FACES = { s: { size: 44, r: 11, fs: 12 }, n: { size: 56, r: 13, fs: 13 } };
const RING = 2.5;
const PLATE_H = 20;
const PLATE_OUT = 6;
const LABEL_H = 24;
const LABEL_OVER = 6;
const LABEL_PX = 9;
// A name wider than this keeps its photo pin without the name: a name is
// never cut, so it is drawn whole or not at all.
export const NAME_MAX = 170;

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

// A pill and its point as one outline, so the shadow and the edge run round both.
function pillPath(ctx, x, y, w, h, point) {
  const r = h / 2;
  const cx = x + w / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(cx + point, y + h);
  ctx.lineTo(cx, y + h + point);
  ctx.lineTo(cx - point, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
  ctx.closePath();
}

// The drawn size of each pin in CSS pixels (no shadow room; its point
// included), by image id, so the chrome check and the keyboard layer know
// how far a pin reaches above and beside its point.
const sizes = new Map();
export const pinSize = (id) => sizes.get(id) || null;

let measure = null;
function textW(text, weight, size) {
  if (!measure && typeof document !== 'undefined') measure = document.createElement('canvas').getContext('2d');
  if (!measure) return String(text).length * size * 0.6;
  measure.font = `${weight} ${size}px ${face()}`;
  return measure.measureText(text).width;
}

/** The width a normal pill with this text will have (CSS px, no shadow). */
export function pillWidth(text) {
  const k = KINDS.n;
  return Math.ceil(textW(String(text), 800, k.fs) + 2 * k.px);
}
/** A pill's height with its point. */
export const PILL_H = KINDS.n.h + POINT;

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

function bestDot(ctx, x, mid) {
  ctx.beginPath();
  ctx.arc(x + 3.5, mid, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = tokenColour('--sun-400');
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = tokenColour('--sun-800');
  ctx.stroke();
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
  const H = k.h + POINT + 2 * SHADOW;
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
  pillPath(ctx, SHADOW, SHADOW, w, k.h, POINT);
  ctx.fillStyle = kind === 'p' ? action : surface;
  ctx.fill();
  ctx.restore();
  if (k.edge) {
    pillPath(ctx, SHADOW + k.edge / 2, SHADOW + k.edge / 2, w - k.edge, k.h - k.edge, POINT - k.edge / 2);
    ctx.lineWidth = k.edge;
    ctx.strokeStyle = kind === 'h' ? action : tokenColour('--border-soft');
    ctx.stroke();
  }
  let x = SHADOW + k.px;
  const mid = SHADOW + k.h / 2;
  if (dot) { bestDot(ctx, x, mid); x += dot; }
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

// ── Photo pins ──────────────────────────────────────────────────────────

/** The image id of a photo pin. `kind` is fs or fn, then b, h or p. */
export function faceId(kind, pr) {
  const named = kind[1] === 'n';
  return ['xp', kind, pr.id, pr.score ?? '', pr.fig || '', named ? pr.city || '' : ''].join(SEP);
}

const scoreText = (score) => (score === '' || score == null || !Number.isFinite(Number(score)) ? '' : Number(score).toFixed(1));

/** A photo pin's parts and its drawn size (CSS px, no shadow room). */
export function faceDims(kind, score, fig, name) {
  const f = FACES[kind[1]] || FACES.s;
  const fs = f.fs;
  const best = kind.includes('b');
  const nameW = name ? Math.ceil(textW(name, 700, fs)) : 0;
  const figW = fig ? Math.ceil(textW(fig, 800, fs)) : 0;
  const label = !!(nameW || figW);
  const labelW = label ? 2 * LABEL_PX + (best ? 12 : 0) + nameW + (nameW && figW ? 5 : 0) + figW : 0;
  const outer = f.size + 2 * RING;
  const plate = scoreText(score);
  const plateW = plate ? Math.max(26, Math.ceil(textW(plate, 800, 12) + 12)) : 0;
  const w = Math.ceil(Math.max(outer + 2 * PLATE_OUT, labelW));
  const h = Math.ceil(PLATE_OUT + outer + (label ? LABEL_H - LABEL_OVER : 0) + POINT);
  return { f, fs, best, nameW, figW, label, labelW, outer, plate, plateW, w, h, nameFits: nameW <= NAME_MAX };
}

function drawFace(kind, id, score, fig, name) {
  const pic = photos.get(id);
  if (!pic) return null;
  pic.at = Date.now();
  const d = faceDims(kind, score, fig, name);
  const W = d.w + 2 * SHADOW;
  const H = d.h + 2 * SHADOW;
  const c = canvas(W, H);
  if (!c) return null;
  const { ctx } = c;
  const picked = kind.includes('p');
  const hot = kind.includes('h');
  const surface = tokenColour('--surface');
  const action = tokenColour('--action');
  const ink = tokenColour('--text');
  const onFill = tokenColour('--on-fill');
  const shade = alpha(tokenColour('--umber-800'), 0.3);
  const cx = W / 2;
  const top = SHADOW + PLATE_OUT;
  const left = cx - d.outer / 2;
  const bottom = top + d.outer;
  // The ring and its warm shadow.
  ctx.save();
  ctx.shadowColor = shade;
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  roundRect(ctx, left, top, d.outer, d.outer, d.f.r + RING);
  ctx.fillStyle = picked || hot ? action : surface;
  ctx.fill();
  ctx.restore();
  // The photograph, cut square from its middle.
  ctx.save();
  roundRect(ctx, left + RING, top + RING, d.f.size, d.f.size, d.f.r);
  ctx.clip();
  ctx.drawImage(pic.img, left + RING, top + RING, d.f.size, d.f.size);
  ctx.restore();
  // The point, then the label over it, so the two read as one shape.
  const tip = SHADOW + d.h;
  if (d.label) {
    const lw = d.labelW;
    const lx = cx - lw / 2;
    const ly = bottom - LABEL_OVER;
    ctx.save();
    ctx.shadowColor = shade;
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1.5;
    pillPath(ctx, lx, ly, lw, LABEL_H, POINT);
    ctx.fillStyle = picked ? action : surface;
    ctx.fill();
    ctx.restore();
    if (!picked) {
      pillPath(ctx, lx + 0.5, ly + 0.5, lw - 1, LABEL_H - 1, POINT - 0.5);
      ctx.lineWidth = 1;
      ctx.strokeStyle = hot ? action : tokenColour('--border-soft');
      ctx.stroke();
    }
    let x = lx + LABEL_PX;
    const mid = ly + LABEL_H / 2;
    if (d.best) { bestDot(ctx, x, mid); x += 12; }
    ctx.textBaseline = 'middle';
    if (d.nameW) {
      ctx.font = `700 ${d.fs}px ${face()}`;
      ctx.fillStyle = picked ? onFill : ink;
      ctx.fillText(name, x, mid + 1);
      x += d.nameW + (d.figW ? 5 : 0);
    }
    if (d.figW) {
      ctx.font = `800 ${d.fs}px ${face()}`;
      ctx.fillStyle = picked ? onFill : ink;
      ctx.fillText(fig, x, mid + 1);
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(cx - POINT, bottom - 1);
    ctx.lineTo(cx, tip);
    ctx.lineTo(cx + POINT, bottom - 1);
    ctx.closePath();
    ctx.fillStyle = picked || hot ? action : surface;
    ctx.fill();
  }
  // The Score: an ink plate over the photo's top right corner.
  if (d.plate) {
    const pw = d.plateW;
    const px = Math.min(left + d.outer + PLATE_OUT - pw, W - SHADOW - pw);
    const py = SHADOW;
    roundRect(ctx, px - 1.5, py - 1.5, pw + 3, PLATE_H + 3, 7.5);
    ctx.fillStyle = surface;
    ctx.fill();
    roundRect(ctx, px, py, pw, PLATE_H, 6);
    ctx.fillStyle = tokenColour('--plate');
    ctx.fill();
    ctx.font = `800 12px ${face()}`;
    ctx.fillStyle = onFill;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(d.plate, px + pw / 2, py + PLATE_H / 2 + 1);
    ctx.textAlign = 'start';
  }
  return { c, w: W, h: H };
}

// The photographs, by place: a square cut from the middle at the 56 px
// pin's size at 2x (so about 50 KB each), the last use, the images drawn
// from it (removed when it is evicted).
const photos = new Map();
const failed = new Set();
const faceImages = new Map();
const queue = [];
const queued = new Set();
let inFlight = 0;
// At most this many photographs kept, and this many loading at once.
export const PHOTO_CAP = 48;
const IN_FLIGHT = 6;
const PHOTO_PX = 112;

export const hasPhoto = (id) => photos.has(id);
export const photoFailed = (id) => failed.has(id);

async function fetchSquare(urls) {
  for (const url of urls) {
    try {
      // CORS, or the canvas would be tainted and the map could not take it.
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) continue;
      const bmp = await createImageBitmap(await res.blob());
      const side = Math.min(bmp.width, bmp.height);
      const cv = document.createElement('canvas');
      cv.width = PHOTO_PX; cv.height = PHOTO_PX;
      const ctx = cv.getContext('2d');
      if (!ctx) { bmp.close?.(); continue; }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX);
      bmp.close?.();
      return cv;
    } catch { /* the next source, else none */ }
  }
  return null;
}

function pump(onLoad) {
  while (inFlight < IN_FLIGHT && queue.length) {
    const { id, urls } = queue.shift();
    inFlight += 1;
    fetchSquare(urls).then((img) => {
      inFlight -= 1;
      queued.delete(id);
      if (img) photos.set(id, { img, at: Date.now() });
      else failed.add(id);
      onLoad?.(id, !!img);
      pump(onLoad);
    });
  }
}

/** Starts loading the photographs of these places (in this order), at most
 *  six at a time; `urlsOf(id)` gives the sources to try in order. `onLoad`
 *  hears each one that lands or fails. A place whose photo failed stays a
 *  pill and is not asked again. */
export function loadPhotos(ids, urlsOf, onLoad) {
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function') return;
  for (const id of ids) {
    if (photos.has(id) || failed.has(id) || queued.has(id)) continue;
    const urls = urlsOf(id).filter(Boolean);
    if (!urls.length) { failed.add(id); continue; }
    queued.add(id);
    queue.push({ id, urls });
  }
  pump(onLoad);
}

/** Keeps the newest PHOTO_CAP photographs (never one in `keep`), removing
 *  the images drawn from the rest. */
export function evictPhotos(map, keep) {
  if (photos.size <= PHOTO_CAP) return;
  const old = [...photos].filter(([id]) => !keep.has(id)).sort((a, b) => a[1].at - b[1].at);
  for (const [id] of old) {
    if (photos.size <= PHOTO_CAP) break;
    photos.delete(id);
    for (const img of faceImages.get(id) || []) {
      sizes.delete(img);
      if (map.hasImage?.(img)) map.removeImage(img);
    }
    faceImages.delete(id);
  }
}

/** Draws the image a layer asked for and adds it to the map; false when the
 *  id is not one of ours. `countLabel` formats a crowd's count. A photo pin
 *  whose photograph is gone draws as the pill it stands for, never blank. */
export function addPinImage(map, id, countLabel = (n) => String(n)) {
  if (!id || map.hasImage(id)) return true;
  const parts = String(id).split(SEP);
  let out = null;
  let pad = SHADOW;
  if (parts[0] === 'xp' && parts[1]?.[0] === 'f') {
    const [, kind, pid, score, fig, name] = parts;
    out = drawFace(kind, pid, score, fig, name);
    if (out) {
      if (!faceImages.has(pid)) faceImages.set(pid, new Set());
      faceImages.get(pid).add(id);
    } else {
      out = drawPill(kind.includes('p') ? 'p' : kind.includes('h') ? 'h' : kind.includes('b') ? 'b' : 'n',
        kind.includes('p') ? name || fig : fig || name || ' ', kind.includes('p') ? fig : '');
    }
  } else if (parts[0] === 'xp') out = drawPill(parts[1], parts[2] || '', parts[3] || '');
  else if (parts[0] === 'xc') out = drawCount(countLabel(Number(parts[1]) || 0));
  else return false;
  if (!out) return true;
  const { c, w, h } = out;
  sizes.set(id, [w - 2 * pad, h - 2 * pad]);
  map.addImage(id, c.ctx.getImageData(0, 0, c.cv.width, c.cv.height), { pixelRatio: c.pr });
  return true;
}

/** The pin sources and layers, added once per style (a basemap swap drops
 *  and re-adds them). `data` is the FeatureCollection to start from. */
export function addPinLayers(map, data) {
  if (map.getSource('dests')) return;
  map.addSource('dests', { type: 'geojson', data: EMPTY });
  map.addSource('dests-photo', { type: 'geojson', data: EMPTY });
  // The hovered and the picked place each get a one-feature source: a new
  // filter on the big source did not always re-place its symbols until the
  // camera moved (the pick at 820 px drew nothing); new data always does.
  map.addSource('dests-hot', { type: 'geojson', data: EMPTY });
  map.addSource('dests-pick', { type: 'geojson', data: EMPTY });
  held.delete(map);
  map.addSource('dests-c', {
    type: 'geojson', data, cluster: true, clusterMaxZoom: CLUSTER_MAX_ZOOM, clusterRadius: CLUSTER_RADIUS,
  });
  const dot = ['!', ['has', 'point_count']];
  map.addLayer({
    id: 'dest-halo', type: 'circle', source: 'dests-c', filter: dot,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5.5, 8, 7, 12, 8.5],
      'circle-color': tokenColour('--umber-600'),
      'circle-opacity': 0.16,
      'circle-blur': 0.6,
    },
  });
  map.addLayer({
    id: 'dest-dots', type: 'circle', source: 'dests-c', filter: dot,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 4, 12, 5],
      'circle-color': tokenColour('--umber-600'),
      'circle-stroke-width': 2,
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
  // Every pin stands on its point: bottom centre, less its shadow room.
  const stand = { 'icon-anchor': 'bottom', 'icon-offset': [0, SHADOW] };
  // A bubble under the floating chrome fades by feature state: a filter on
  // this source would lay out every dot again on each pan.
  symbol('xcluster', 'dests-c', ['has', 'point_count'],
    ['concat', `xc${SEP}`, ['to-string', ['get', 'point_count']]], {},
    { 'icon-opacity': ['case', ['boolean', ['feature-state', 'under'], false], 0, 1] });
  // Fixed filters: which pins show is the sources' data, never a filter.
  symbol('xpin', 'dests', ['!=', ['get', 'best'], 1],
    ['concat', `xp${SEP}n${SEP}`, ['get', 'fig']],
    { 'symbol-sort-key': ['get', 'rank'], ...stand });
  // The best value draws past MapLibre's collision: the chooser
  // (ExploreMap.jsx refreshPins) gives it room and names it only then, and
  // MapLibre's boxes, shadow room included, hid it beside a photo pin that
  // stood clear of it (integration check, 2026-11-21).
  symbol('xpin-best', 'dests', ['==', ['get', 'best'], 1],
    ['concat', `xp${SEP}b${SEP}`, ['get', 'fig']], { 'icon-allow-overlap': true, 'icon-ignore-placement': true, ...stand });
  symbol('xpin-photo', 'dests-photo', ['has', 'img'], ['get', 'img'],
    { 'symbol-sort-key': ['get', 'rank'], ...stand });
  symbol('xpin-hot', 'dests-hot', ['has', 'img'], ['get', 'img'],
    { 'icon-allow-overlap': true, ...stand });
  symbol('xpin-picked', 'dests-pick', ['has', 'img'], ['get', 'img'],
    { 'icon-allow-overlap': true, ...stand });
}

/** The image a picked or hovered place draws as: its photo pin, named, once
 *  its photograph is in; else its pill. */
export function oneImage(role, pr) {
  if (hasPhoto(pr.id)) return faceId(role === 'pick' ? 'fnp' : 'fnh', pr);
  return role === 'pick' ? ['xp', 'p', pr.city, pr.fig].join(SEP) : ['xp', 'h', pr.fig || pr.city].join(SEP);
}

/** The pins of this moment: `shown` (ids) are the pills that fit and
 *  `photos` ([{ id, kind }]) the photo pins (none under the floating
 *  chrome); the best, the hot and the picked pin each draw in their own
 *  layer and nowhere else; bubbles under the chrome leave. Sources and
 *  filters are set only when they changed. */
export function setPinFilters(map, {
  shown = [], photos: faces = [], hiddenClusters = [], best = '', hot = '', picked = '', featureOf = () => null,
}) {
  if (!map.getLayer('xpin')) return;
  const canDraw = typeof document !== 'undefined' && map.hasImage;
  const faceIds = new Set(faces.map((x) => x.id));
  const bf = best && best !== hot && best !== picked && !faceIds.has(best) ? featureOf(best) : null;
  if (bf && canDraw) addPinImage(map, ['xp', 'b', bf.properties.fig].join(SEP));
  const pills = [];
  for (const pid of shown) {
    if (pid === hot || pid === picked || faceIds.has(pid)) continue;
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
    if (canDraw) {
      for (const f of pills) addPinImage(map, ['xp', f.properties.best ? 'b' : 'n', f.properties.fig].join(SEP));
    }
    // New data, not updateData: a diff reloaded only some tiles and left
    // pills out (2 of 9 drawn at 390 px, progress-3.md).
    map.getSource?.('dests')?.setData({ type: 'FeatureCollection', features: pills });
  }
  // The photo pins, the same way: images first, data only when it changed.
  const photoFeats = [];
  for (const { id: pid, kind } of faces) {
    if (pid === hot || pid === picked) continue;
    const f = featureOf(pid);
    if (!f) continue;
    const k = pid === best ? `${kind}b` : kind;
    photoFeats.push({ ...f, properties: { ...f.properties, img: faceId(k, f.properties) } });
  }
  const pkey = photoFeats.map((f) => `${f.properties.img}${SEP}${f.properties.rank}`).join('\n');
  const h1 = held.get(map) || {};
  if (h1.photos !== pkey) {
    held.set(map, { ...h1, photos: pkey });
    if (canDraw) for (const f of photoFeats) addPinImage(map, f.properties.img);
    map.getSource?.('dests-photo')?.setData({ type: 'FeatureCollection', features: photoFeats });
  }
  const one = (src, pid, role) => {
    const f = pid ? featureOf(pid) : null;
    const img = f ? oneImage(role, f.properties) : '';
    // The image is part of the key: a new price or a photo now in redraws it.
    const key = f ? `${pid}${SEP}${img}` : '';
    const h = held.get(map) || {};
    if (h[src] === key) return;
    held.set(map, { ...h, [src]: key });
    // The pin's image goes in before the data: a pin laid out before its
    // image existed stayed blank until the next relayout (the pick at 820 px).
    if (f && canDraw) addPinImage(map, img);
    map.getSource?.(src)?.setData(f ? { type: 'FeatureCollection', features: [{ ...f, properties: { ...f.properties, img } }] } : EMPTY);
  };
  one('dests-hot', hot && hot !== picked ? hot : '', 'hot');
  one('dests-pick', picked || '', 'pick');
  const h2 = held.get(map) || {};
  if (h2.clusters !== clusterKey && map.getSource?.('dests-c')) {
    held.set(map, { ...h2, clusters: clusterKey });
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
