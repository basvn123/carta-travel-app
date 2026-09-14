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
 */

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

async function loadCredits() {
  if (!creditsPromise) {
    creditsPromise = fetch('/poi_credits.json')
      .then((r) => (r.ok ? r.json() : { files: {} }))
      .catch(() => ({ files: {} }));
  }
  return creditsPromise;
}

/**
 * {by, lic, page} for an image URL, or null when nothing is known.
 * `page` is always present on a Commons URL, credit or not.
 */
export async function creditFor(url) {
  const name = commonsFilename(url);
  if (!name) return null;
  const page = commonsPageUrl(url);
  const data = await loadCredits();
  const hit = (data.files || {})[name];
  if (!hit) return { by: '', lic: '', page };
  return { by: hit[0] || '', lic: hit[1] || '', page };
}
