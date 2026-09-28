/**
 * pictureFlag.js, the one door that decides which layers serve their
 * photographs from our own CDN as <picture> + srcset (T052).
 *
 * Rolled out one layer at a time, so a regression costs one section of the
 * product and not all of it. Two inputs, read once at module load:
 *
 *   VITE_PICTURE_LAYERS   the build's setting: "beaches", "beaches,lakes",
 *                         "all", or unset (off everywhere). This is the
 *                         production switch.
 *   ?pic=                 the same vocabulary in the page URL, plus "off".
 *                         When present it replaces the build's setting for
 *                         that page load. It exists so a harness (and the
 *                         owner, measuring on a preview) can compare flag
 *                         off and flag on against one build. It changes
 *                         only where a photograph is fetched from, never
 *                         what anyone may see, so unlike the ?xxxmock seams
 *                         it is not compiled out of production.
 *
 * With the flag on, a photograph still renders the old way whenever its wire
 * record has no copy on the CDN (no `ih`), and flips back to the old way if
 * the copy fails to load (components/LayerPhoto.jsx). So turning a layer on
 * before its derive run has finished is safe: the unfinished part simply
 * stays on Wikimedia.
 *
 * Before turning a layer on in production, the CDN host must be in the
 * CSP's img-src (vercel.json); see the T052 report.
 */

const ENV = (import.meta && import.meta.env) || {};

export const PICTURE_LAYERS = ['beaches', 'lakes', 'mountains'];

function parse(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text || text === 'off' || text === 'none' || text === '0') return new Set();
  if (text === 'all' || text === 'on' || text === '1') return new Set(PICTURE_LAYERS);
  return new Set(text.split(',').map((s) => s.trim()).filter((s) => PICTURE_LAYERS.includes(s)));
}

function fromQuery() {
  try {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.has('pic') ? parse(params.get('pic')) : null;
  } catch {
    return null;
  }
}

const ACTIVE = fromQuery() ?? parse(ENV.VITE_PICTURE_LAYERS);

/** True when `layer` serves its photographs from the CDN ladder. */
export function pictureOn(layer) {
  return ACTIVE.has(layer);
}
