/**
 * imageLadder.js, the one place that knows where our own copies of a
 * photograph live and how to ask for one at the size the layout needs.
 *
 * pipeline/photos/derive.py (T049) writes every published photograph once,
 * as 3 AVIF and 2 WebP rungs under a content address:
 *
 *     {IMG_BASE}/{ih[0:2]}/{ih[2:4]}/{ih}/{320,640,1280}.avif
 *     {IMG_BASE}/{ih[0:2]}/{ih[2:4]}/{ih}/{320,640}.webp
 *
 * and the layer export (pipeline/photos/wire_ladder.py, T052) joins three
 * facts into each wire image record it holds a copy of: `ih` (the sha1, the
 * whole address), `d` (the real pixel size of the 320, 640 and 1280 rungs)
 * and, on a row's hero only, `ph` (a 24 character placeholder). A record
 * without `ih` has no copy yet and renders exactly as it did before.
 *
 * IMG_BASE is the only place the CDN host is written. A build can point it
 * at a local static server with VITE_IMG_BASE (T052 measured that way,
 * because cdn.carta-europetravel.com does not resolve yet), and
 * lib/imageCredit.js reads the host from here, so a credit lookup and an
 * image URL can never disagree about which host is ours.
 *
 * Why the srcset descriptor is the width in `d` and not the rung's name: a
 * source narrower than a rung is written at its own width, never upscaled,
 * so "1280.avif" of a 1024 px Geograph photo is 1024 px wide. Two rungs of
 * the same real width would give the browser two candidates with one
 * descriptor, which the srcset rules call an error, so the second is
 * dropped.
 */

const ENV = (import.meta && import.meta.env) || {};

export const IMG_BASE = String(ENV.VITE_IMG_BASE || 'https://cdn.carta-europetravel.com/img')
  .replace(/\/+$/, '');

export const CDN_HOST = (() => {
  try { return new URL(IMG_BASE).hostname.toLowerCase(); } catch { return ''; }
})();

// derive.py's LADDER. Changing a rung is a new ladder (LADDER_V there), not
// an edit here.
const AVIF_RUNGS = [320, 640, 1280];
const WEBP_RUNGS = [320, 640];

const SHA1 = /^[0-9a-f]{40}$/;

export function ladderUrl(ih, width, fmt) {
  return `${IMG_BASE}/${ih.slice(0, 2)}/${ih.slice(2, 4)}/${ih}/${width}.${fmt}`;
}

function validDims(d) {
  return Array.isArray(d) && d.length === 3
    && d.every((x) => Array.isArray(x) && x[0] > 0 && x[1] > 0);
}

function srcSet(ih, d, rungs, fmt) {
  const seen = new Set();
  const out = [];
  rungs.forEach((rung, i) => {
    const w = d[i][0];
    if (seen.has(w)) return;
    seen.add(w);
    out.push(`${ladderUrl(ih, rung, fmt)} ${w}w`);
  });
  return out.join(', ');
}

/**
 * {avif, webp, size} for a wire image record that has a copy on our CDN,
 * else null. `size` is the [width, height] of the largest rung, which is
 * the photograph's own shape: what an <img> should carry as width and
 * height so the browser can reserve the box before a byte arrives.
 */
export function ladderOf(image) {
  const ih = image?.ih;
  if (typeof ih !== 'string' || !SHA1.test(ih) || !validDims(image.d)) return null;
  return {
    avif: srcSet(ih, image.d, AVIF_RUNGS, 'avif'),
    webp: srcSet(ih, image.d, WEBP_RUNGS, 'webp'),
    size: image.d[2],
  };
}

/**
 * The hero placeholder as six flat colours, top row then bottom row, or
 * null. The wire carries them as 18 bytes of RGB in base64url (24
 * characters; see wire_ladder.encode_placeholder).
 */
export function placeholderColours(ph) {
  if (typeof ph !== 'string' || !/^[A-Za-z0-9_-]{24}$/.test(ph)) return null;
  let raw;
  try {
    raw = atob(ph.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  if (raw.length !== 18) return null;
  const out = [];
  for (let i = 0; i < 18; i += 3) {
    out.push(`rgb(${raw.charCodeAt(i)} ${raw.charCodeAt(i + 1)} ${raw.charCodeAt(i + 2)})`);
  }
  return out;
}

// Where each of the six blocks sits: a 3 x 2 grid.
const PH_POS = ['0% 0%', '50% 0%', '100% 0%', '0% 100%', '50% 100%', '100% 100%'];

/**
 * An inline style that paints the placeholder behind a photograph: six
 * hard-edged blocks, no blend between them, no blur, no motion. Each block
 * is a CSS image of one colour (`linear-gradient(c, c)` is the only way CSS
 * has to make a sized block of flat colour), so nothing here is a gradient
 * a reader can see. It is deliberately not a url() image: a background with
 * a url() is an LCP candidate and would report the placeholder's paint as
 * the page's largest paint, hiding a slow photograph behind a fast number.
 */
export function placeholderStyle(ph) {
  const colours = placeholderColours(ph);
  if (!colours) return undefined;
  return {
    backgroundImage: colours.map((c) => `linear-gradient(${c}, ${c})`).join(', '),
    // A hair over a third and a half, so neighbouring blocks overlap by a
    // fraction of a pixel instead of leaving a rounding seam between them.
    backgroundSize: '34% 51%',
    backgroundPosition: PH_POS.join(', '),
    backgroundRepeat: 'no-repeat',
  };
}
