/**
 * Per-file credit for any Commons-hosted image the app shows.
 *
 * The layer galleries carry their credits in the wire. POI thumbnails do
 * not: items_full[].img is a bare URL, so their credits ship separately
 * in public/poi_credits.json (pipeline/photos/export_poi_credits.py) and
 * this module joins the two on the Commons filename, which survives
 * every thumbnail width.
 *
 * The sidecar is a megabyte-class file, so it loads lazily: nothing is
 * fetched until the first credit is actually asked for, and never twice.
 * A miss answers null and the caller falls back to linking the Commons
 * file page, which every upload.wikimedia URL can produce offline.
 *
 * Three kinds of URL, since T051:
 *
 *   upload.wikimedia.org   the Commons filename is in the path, so the
 *                          file page is known offline and the sidecar
 *                          supplies author and licence
 *   geograph.org.uk        the photo id is in the path; the page is
 *                          geograph.org.uk/photo/<id>
 *   cdn.carta-europetravel.com/img/{ab}/{cd}/{sha1}/{w}.{fmt}
 *                          our own copy, made by pipeline/photos/derive.py.
 *                          The URL is a hash and names nothing, so the
 *                          credit comes from the layer's image manifest
 *                          (img/manifest/<layer>.json, carta.img-manifest.v1):
 *                          files[title].h is the sha1, credits[c] is
 *                          [licence, author] and page[kind] is the page URL
 *                          template. The manifest is the only door: a
 *                          stored CC BY-SA copy is OUR redistribution, so it
 *                          must never render without the author the file
 *                          arrived with, and nothing here asks Wikimedia at
 *                          render time. No manifest, no credit: the answer
 *                          is null, never a guess.
 */

// The host is configured once, in lib/imageLadder.js (T052), so a build
// pointed at a stand-in CDN credits the same URLs it serves.
import { CDN_HOST } from './imageLadder.js';
import { dataUrl } from './dataHost.js';

export { CDN_HOST };

let creditsPromise = null;

/** "https://upload.wikimedia.org/.../thumb/a/ab/Name.jpg/500px-Name.jpg"
 *  -> "Name.jpg" (decoded, underscores to spaces), or '' off-host. */
export function commonsFilename(url) {
  if (!url || !url.includes('upload.wikimedia.org')) return '';
  const m = /\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//.exec(url)
    || /\/[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/.exec(url);
  if (!m) return '';
  try {
    return decodeURIComponent(m[1]).replace(/_/g, ' ');
  } catch {
    return m[1].replace(/_/g, ' ');
  }
}

/** The Commons file page for any upload.wikimedia URL, or ''. The page
 *  names the author and licence even when the sidecar misses, so a
 *  credit link is always possible. */
export function commonsPageUrl(url) {
  const name = commonsFilename(url);
  if (!name) return '';
  return 'https://commons.wikimedia.org/wiki/File:'
    + encodeURIComponent(name.replace(/ /g, '_'));
}

/** The Geograph photo id in a geograph.org.uk page or image URL, or ''.
 *  Same pattern as derive.py's GEOGRAPH_ID, matched on the host only. */
export function geographId(url) {
  if (!url) return '';
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return ''; }
  if (!host.endsWith('geograph.org.uk')) return '';
  const m = /geograph\.org\.uk\/(?:photo\/|geophotos\/(?:[0-9a-f]+\/)*)(\d+)/i
    .exec(url);
  return m ? m[1] : '';
}

export function geographPageUrl(url) {
  const id = geographId(url);
  return id ? `https://www.geograph.org.uk/photo/${id}` : '';
}

/** The sha1 in one of our CDN image URLs, or ''. Path shape is
 *  derive.py's base_key: img/{h[0:2]}/{h[2:4]}/{h}/{w}.{fmt}. */
export function cdnHash(url) {
  if (!url) return '';
  let u;
  try { u = new URL(url); } catch { return ''; }
  if (u.hostname.toLowerCase() !== CDN_HOST) return '';
  const m = /^\/img\/([0-9a-f]{2})\/([0-9a-f]{2})\/([0-9a-f]{40})\/\d+\.(?:avif|webp)$/
    .exec(u.pathname);
  if (!m || m[3].slice(0, 2) !== m[1] || m[3].slice(2, 4) !== m[2]) return '';
  return m[3];
}

/** The Creative Commons deed for a short licence name ("CC BY-SA 4.0",
 *  "CC BY 3.0 de"), or '' for anything else. The manifest keeps the name
 *  only; the wire's licUrl is this same deed for every CC file. */
export function licenceUrl(lic) {
  const m = /^cc[ -](by(?:-sa)?)[ -](\d\.\d)(?:[ -]([a-z]{2}))?$/i
    .exec(String(lic || '').trim());
  if (!m) return '';
  const port = m[3] ? `${m[3].toLowerCase()}/` : '';
  return `https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${port}`;
}

// sha1 -> title, built once per manifest object.
const byHash = new WeakMap();

function hashIndex(manifest) {
  let ix = byHash.get(manifest);
  if (!ix) {
    ix = new Map();
    for (const [title, e] of Object.entries(manifest.files || {})) {
      if (e && e.h) ix.set(e.h, title);
    }
    byHash.set(manifest, ix);
  }
  return ix;
}

/** The page URL for a canonical manifest title, from the manifest's own
 *  templates: "File:<Name>" fills {title} (underscored and encoded the way
 *  commonsPageUrl does), "geograph:<id>" fills {id}. */
function manifestPage(manifest, title) {
  const tpl = manifest.page || {};
  if (title.startsWith('geograph:')) {
    const id = title.slice('geograph:'.length);
    return tpl.geograph ? tpl.geograph.replace('{id}', encodeURIComponent(id)) : '';
  }
  if (!title.startsWith('File:') || !tpl.commons) return '';
  const name = title.slice('File:'.length).replace(/ /g, '_');
  return tpl.commons.replace('{title}', `File:${encodeURIComponent(name)}`);
}

/**
 * {by, lic, licUrl, page, title} for a CDN image URL, read from the
 * layer manifest that describes it, or null when the URL is not ours or
 * the manifest does not list it. Synchronous: T052 decides whether the
 * manifest arrives joined into the wire or fetched; this only reads it.
 */
export function creditFromManifest(url, manifest) {
  const h = cdnHash(url);
  if (!h || !manifest || !manifest.files) return null;
  const title = hashIndex(manifest).get(h);
  if (!title) return null;
  const pair = (manifest.credits || [])[manifest.files[title].c];
  if (!Array.isArray(pair)) return null;
  const lic = String(pair[0] || '').trim();
  const by = String(pair[1] || '').trim();
  return { by, lic, licUrl: licenceUrl(lic), page: manifestPage(manifest, title), title };
}

/** The credit as the sight thumbnail's tooltip prints it: author, then
 *  licence, whichever the file carries. */
export function creditLine(credit) {
  if (!credit) return '';
  return [credit.by, credit.lic].filter(Boolean).join(', ');
}

async function loadCredits() {
  if (!creditsPromise) {
    creditsPromise = fetch(dataUrl('/poi_credits.json'))
      .then((r) => (r.ok ? r.json() : { files: {} }))
      .catch(() => ({ files: {} }));
  }
  return creditsPromise;
}

/**
 * {by, lic, page} for an image URL, or null when nothing is known.
 * `page` is always present on a Commons or Geograph URL, credit or not.
 * A CDN URL needs `opts.manifest` (the layer's carta.img-manifest.v1) and
 * answers null without it.
 */
export async function creditFor(url, opts = {}) {
  if (cdnHash(url)) return creditFromManifest(url, opts.manifest);
  const gpage = geographPageUrl(url);
  if (gpage) return { by: '', lic: '', page: gpage };
  const name = commonsFilename(url);
  if (!name) return null;
  const page = commonsPageUrl(url);
  const data = await loadCredits();
  const hit = (data.files || {})[name];
  if (!hit) return { by: '', lic: '', page };
  return { by: hit[0] || '', lic: hit[1] || '', page };
}
