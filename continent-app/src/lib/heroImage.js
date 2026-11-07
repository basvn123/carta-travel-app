/**
 * heroImage.js, the one place that knows how to ask Wikimedia for a photo at
 * the size the layout actually needs, and which photos a card is not allowed
 * to show.
 *
 * Two problems this solves.
 *
 * SIZE. The wire ships every hero at Wikimedia's 960px rendering. A grid card
 * is ~300 css px and a phone card is ~170, so the grid was downloading three
 * to five times the bytes it drew, on the slowest connections, for 48 cards at
 * once. The fix is a srcset, and the catch is that Wikimedia no longer renders
 * an arbitrary width: it answers 400 for anything off a fixed list. Probed
 * against upload.wikimedia.org, the list that answers 200 is
 *
 *     250  330  500  960  1280  1920
 *
 * and 320 / 400 / 640 / 800 / 1024 / 1200 / 1600 all fail. Hand-writing any
 * other number silently breaks the image, which is why nothing outside this
 * file is allowed to build a thumb URL.
 *
 * DUPLICATES. Twelve Commons files are the hero of 29 destinations. Most of
 * that is not an error: London's skyline fronts Heathrow, Gatwick, Luton and
 * Stansted, the Eiffel Tower fronts all three Paris gateways, and those really
 * are one city with several airport records, which the grid already merges
 * into one card.
 *
 * What IS an error is the same photograph standing for two DIFFERENT places.
 * The shipped file does that twice: the Roman Baths at Bath front the Belgian
 * town of Spa (a name match, not a photograph of Spa), and one Devil's Bridge
 * borrows the other's picture across Bulgaria and Wales. There the repeat is a
 * lie about what a place looks like, and the placeholder is the better answer
 * because it at least says which place it is.
 *
 * "The same place" is decided twice over, and a photograph is only taken away
 * when both tests agree. The first is the key the grid's own gateway merge
 * uses, base city plus country. The second is distance, because the catalogue
 * carries the same town under two spellings often enough to matter: Rhodes and
 * Rodos are one harbour and share one photograph correctly, and no name
 * comparison was ever going to work that out.
 */

import { haversineKm } from './nearby.js';
import LADDER_MANIFEST from './heroLadder.json' with { type: 'json' };
import { ladderUrl, ladderOf } from './imageLadder.js';

// The only widths upload.wikimedia.org renders. Do not add to this list
// without probing: an unlisted width returns 400, not a resized image.
const WIKI_WIDTHS = [250, 330, 500, 960, 1280, 1920];

const THUMB_RE = /\/(\d+)px-/;

/** True for a Wikimedia thumb URL this file can re-size. */
export function isResizable(url) {
  return typeof url === 'string' && url.includes('/thumb/') && THUMB_RE.test(url);
}

/** The same photo at one of the widths Wikimedia will actually render. */
export function thumbAt(url, width) {
  if (!isResizable(url)) return url;
  // Snap to a width Commons renders (T435): a caller asking for 240 got a
  // 400 and a broken image on the day planner's plan cards.
  const w = WIKI_WIDTHS.find((x) => x >= width) || WIKI_WIDTHS[WIKI_WIDTHS.length - 1];
  return url.replace(THUMB_RE, `/${w}px-`);
}

/**
 * A srcset over the renderable widths that bracket what the layout needs.
 * `max` caps the ladder so a 300px card never offers the browser a 1920.
 */
export function srcSetFor(url, max = 960) {
  if (!isResizable(url)) return undefined;
  const widths = WIKI_WIDTHS.filter((w) => w <= max);
  if (widths.length < 2) return undefined;
  return widths.map((w) => `${thumbAt(url, w)} ${w}w`).join(', ');
}

/** The src a browser without srcset support should get. */
export const fallbackSrc = (url, width = 500) => thumbAt(url, width);

/*
 * OWN COPIES FIRST (H12, T1105). pipeline/photos/derive.py keeps every
 * published photograph as ladder_v1 (AVIF 320/640/1280, WebP 320/640) under
 * one content address, the SHA-1 of its canonical Commons title. A wire
 * record that already carries `ih` and `d` (the T052 join) uses them. Every
 * other record, which today is every destination hero and gallery photo,
 * has its address worked out here from its Wikimedia URL, exactly as
 * derive.canonical_title and sha1_of do it, and its rung sizes from the
 * wire's own w and h, exactly as derive.rung_dims does.
 *
 * Whether the copy is really on the CDN is not guessed: lib/heroLadder.json,
 * written by pipeline/photos/hero_ladder.py from derive.py's manifests,
 * says whether the ladder is live and lists the published photographs that
 * have no copy (`missing`), the ones re-uploaded under a new address (`rev`)
 * and the ones whose wire size disagrees with the copy's (`dims`). While it
 * says not live (no derive run has reached R2 yet) every photograph renders
 * from Wikimedia exactly as before. `?pic=off` forces that too, for an A/B
 * on one build, and a copy that fails to load drops back to Wikimedia in
 * the component (components/HeroImage.jsx).
 */

const LADDER_RUNGS = [320, 640, 1280];
const LADDER_WEBP = 2; // the WebP rungs are the first two
const SOURCE_WIDTH = 1920; // derive.SOURCE_WIDTH: what the copies are cut from
const KEY_LEN = 12;

/** Commons' own title folding (derive._fold_name). */
function foldName(raw) {
  let name = String(raw || '');
  if (name.includes('%')) {
    try { name = decodeURIComponent(name); } catch { /* keep it as it is */ }
  }
  name = name.replace(/[\s_]+/g, ' ').trim().normalize('NFC');
  if (name) {
    const first = String.fromCodePoint(name.codePointAt(0));
    const upper = first.toUpperCase();
    if ([...upper].length === 1) name = upper + name.slice(first.length);
  }
  return name;
}

const NS_PREFIX = /^(?:file|image)\s*:\s*/i;

/**
 * "File:<folded name>" for a Commons upload, thumb or file page URL, else
 * null (a Geograph photo or anything off Commons keeps its own URL).
 */
export function commonsTitle(url) {
  if (typeof url !== 'string' || !url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname;
  if (path.includes('/wiki/')) {
    let tail = path.split('/wiki/')[1];
    try { tail = decodeURIComponent(tail); } catch { /* keep it */ }
    if (!NS_PREFIX.test(tail)) return null;
    const name = foldName(tail.replace(NS_PREFIX, ''));
    return name ? `File:${name}` : null;
  }
  if (!host.includes('wikimedia.org')) return null;
  const segs = path.split('/').filter(Boolean);
  let i = segs.indexOf('commons');
  if (i < 0) return null;
  i += 1;
  if (segs[i] === 'thumb') i += 1;
  i += 2;
  if (i >= segs.length) return null;
  const name = foldName(segs[i]);
  return name ? `File:${name}` : null;
}

// SHA-1 of a UTF-8 string, hex. Small and synchronous on purpose: the
// address is needed during render, and crypto.subtle is asynchronous.
function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }
export function sha1Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const len = bytes.length;
  const words = new Uint32Array((((len + 8) >> 6) + 1) * 16);
  for (let i = 0; i < len; i += 1) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8);
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  words[words.length - 1] = len * 8;
  const w = new Uint32Array(80);
  let h0 = 0x67452301; let h1 = 0xefcdab89; let h2 = 0x98badcfe; let h3 = 0x10325476; let h4 = 0xc3d2e1f0;
  for (let b = 0; b < words.length; b += 16) {
    for (let t = 0; t < 16; t += 1) w[t] = words[b + t];
    for (let t = 16; t < 80; t += 1) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    let a = h0; let bb = h1; let c = h2; let d = h3; let e = h4;
    for (let t = 0; t < 80; t += 1) {
      let f; let k;
      if (t < 20) { f = (bb & c) | (~bb & d); k = 0x5a827999; }
      else if (t < 40) { f = bb ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (bb & c) | (bb & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = bb ^ c ^ d; k = 0xca62c1d6; }
      const tmp = (rotl(a, 5) + f + e + k + w[t]) | 0;
      e = d; d = c; c = rotl(bb, 30); bb = a; a = tmp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + bb) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }
  return [h0, h1, h2, h3, h4].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// Python's round(): halves go to the even neighbour, so a height computed
// here matches the one derive.py wrote to the bytes.
function pyRound(x) {
  const r = Math.round(x);
  return Math.abs(x - Math.trunc(x)) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** derive.rung_dims: a w x h source at `width`, never upscaled. */
function rungDims(w, h, width) {
  const rw = Math.min(width, w);
  return [rw, Math.max(1, pyRound((h * rw) / w))];
}

/** The [[w,h] x 3] sizes of the 320, 640 and 1280 rungs, from the wire's
 *  own measurement of the original. */
export function ladderDims(w, h) {
  if (!(w > 0 && h > 0)) return null;
  const src = rungDims(w, h, SOURCE_WIDTH);
  return LADDER_RUNGS.map((r) => rungDims(src[0], src[1], r));
}

function pageOff() {
  try {
    if (typeof window === 'undefined') return false;
    const v = new URLSearchParams(window.location.search).get('pic');
    return v != null && /^(off|none|0)$/i.test(v.trim());
  } catch {
    return false;
  }
}

/** Reads one manifest into what the lookup needs. Exported for the tests. */
export function readLadderManifest(m) {
  const live = !!m && m.schema === 'carta.hero-ladder.v1' && m.ladder === 'ladder_v1' && m.live === true;
  return {
    live,
    missing: new Set(live ? m.missing || [] : []),
    rev: (live && m.rev) || {},
    dims: (live && m.dims) || {},
  };
}

const ACTIVE = pageOff() ? readLadderManifest(null) : readLadderManifest(LADDER_MANIFEST);

/** True while the self-hosted ladder is live for this page load. */
export const heroLadderLive = () => ACTIVE.live;

function srcSetOf(ih, d, rungs, fmt) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < rungs; i += 1) {
    const w = d[i][0];
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(`${ladderUrl(ih, LADDER_RUNGS[i], fmt)} ${w}w`);
  }
  return out.join(', ');
}

// How many rungs a layout drawing at most `max` css px is offered: every
// rung up to the first one at least that wide, the way srcSetFor caps the
// Wikimedia list, so a 300 px card is never offered the 1280.
function rungsFor(max) {
  const i = LADDER_RUNGS.findIndex((r) => r >= max);
  return i < 0 ? LADDER_RUNGS.length : i + 1;
}

/**
 * Our own copy of a photograph, or null when it must come from Wikimedia.
 * `image` is a wire image record ({url, w, h} or {ih, d}) or a bare URL
 * (then it has no size and stays on Wikimedia). Returns {avif, webp, size,
 * src} where src is the copy's 640 WebP, the one every browser decodes.
 */
export function heroLadder(image, max = 960, manifest = ACTIVE) {
  if (!image || typeof image !== 'object') return null;
  const n = rungsFor(max);
  // Already joined on the wire (T052): the record knows its own address.
  if (image.ih) {
    if (!manifest.live) return null;
    const own = ladderOf(image);
    if (!own) return null;
    return {
      avif: srcSetOf(image.ih, image.d, n, 'avif'),
      webp: srcSetOf(image.ih, image.d, Math.min(n, LADDER_WEBP), 'webp'),
      size: own.size,
      src: ladderUrl(image.ih, LADDER_RUNGS[Math.min(n, LADDER_WEBP) - 1], 'webp'),
    };
  }
  if (!manifest.live) return null;
  const title = commonsTitle(image.url);
  if (!title) return null;
  const plain = sha1Hex(title);
  const key = plain.slice(0, KEY_LEN);
  if (manifest.missing.has(key)) return null;
  const d = manifest.dims[key] || ladderDims(image.w, image.h);
  if (!d) return null;
  const ih = manifest.rev[key] || plain;
  const webpN = Math.min(n, LADDER_WEBP);
  return {
    avif: srcSetOf(ih, d, n, 'avif'),
    webp: srcSetOf(ih, d, webpN, 'webp'),
    size: d[2],
    src: ladderUrl(ih, LADDER_RUNGS[webpN - 1], 'webp'),
  };
}


/**
 * Which destinations must NOT render their wire photo, because another
 * destination has a better claim to it. Returns a Set of dest ids.
 *
 * "Better claim" is fame (average daily Wikipedia pageviews, already on
 * dest.rating). It is the right tiebreak here for a blunt reason: when one
 * photo has to stand for one of several places, it should stand for the one
 * a reader is most likely to recognise it as.
 */
const placeKey = (d) => `${String(d?.city || '').replace(/\s*\([^)]*\)\s*$/, '').trim().toLowerCase()}|${d?.iso2 || ''}`;

// Two records this close together are one place under two names, whatever
// they are called. Comfortably wider than any city's spread of airports.
const SAME_PLACE_KM = 30;

export function duplicateHeroes(destinations) {
  const byUrl = new Map();
  for (const [id, d] of Object.entries(destinations || {})) {
    const url = d?.image?.url;
    if (!url) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(id);
  }
  const drop = new Set();
  for (const [, ids] of byUrl) {
    if (ids.length < 2) continue;
    // Several airport records for one city are allowed to share a photograph,
    // because they share a city. Only a second PLACE loses the picture.
    const keys = new Set(ids.map((id) => placeKey(destinations[id])));
    if (keys.size < 2) continue;
    // Fame decides who keeps it: when one photograph has to stand for one of
    // several places, it should stand for the one a reader will recognise it
    // as. (The Roman Baths belong to Bath, not to Spa.)
    let best = ids[0];
    for (const id of ids) {
      if ((destinations[id]?.rating?.fame ?? 0) > (destinations[best]?.rating?.fame ?? 0)) best = id;
    }
    const bestKey = placeKey(destinations[best]);
    const bd = destinations[best];
    for (const id of ids) {
      const d = destinations[id];
      if (placeKey(d) === bestKey) continue;
      if (haversineKm(d.city_lat ?? d.lat, d.city_lon ?? d.lon,
        bd.city_lat ?? bd.lat, bd.city_lon ?? bd.lon) < SAME_PLACE_KM) continue;
      drop.add(id);
    }
  }
  return drop;
}

/**
 * How much of a photograph survives the box a card pours it into, 0..1.
 *
 * Both are aspect ratios, and the crop throws away whichever axis is longer
 * relative to the box: a 3:2 photograph in a 4:3 card keeps 89 per cent, the
 * same photograph in a 4:1 strip keeps 37, and a PORTRAIT photograph in a 4:3
 * card keeps 50. That last case is the one this exists for. 150 of the
 * catalogue's 3,841 heroes are portrait or square, and centred in a landscape
 * card they show a doorway, a statue's midriff or somebody's balcony, which is
 * why a country's cover should prefer a landscape frame even when a portrait
 * one is better rated.
 *
 * Needs image.w and image.h, which pipeline/apply_image_dims.py puts on the
 * wire. A hero with no measurements returns null: unknown is not the same as
 * bad, and a caller should rank it below a measured good frame but above a
 * measured bad one rather than discarding it.
 */
export function frameKept(image, boxRatio) {
  const w = image?.w;
  const h = image?.h;
  if (!w || !h || !boxRatio) return null;
  const ar = w / h;
  return Math.min(ar, boxRatio) / Math.max(ar, boxRatio);
}

/** The two letters the placeholder shows when there is no usable photo. */
export function initials(city) {
  const words = String(city || '').replace(/\s*\([^)]*\)\s*$/, '').trim().split(/[\s'-]+/);
  if (!words[0]) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
