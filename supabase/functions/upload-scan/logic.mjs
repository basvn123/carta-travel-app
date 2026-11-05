/**
 * upload-scan, the server privacy pass (T1070, register row T333-a), pure
 * rules. index.ts does the I/O; everything here runs unchanged in node, so
 * continent-app/tests/uploadScan.test.mjs tests it.
 *
 * The device strips a photo's metadata and trims a track's ends before
 * anything is sent (continent-app/src/lib/stripImageMeta.js and
 * gpxPrivacy.js, T333). Anybody with a session can call the Storage API
 * directly and skip that, so the server runs the same two modules again on
 * every pending upload before a person reviews it. The modules are copied
 * into ../_shared byte for byte (a test fails when they drift), because the
 * Edge Function bundle cannot reach into continent-app/.
 *
 *   photo  already clean            -> clean   (file kept as it is)
 *          metadata left, strippable -> cleaned (the stripped bytes replace it)
 *          not a JPEG or PNG, corrupt, or still dirty after a strip
 *                                    -> refused (the row is removed, the file
 *                                       queued for deletion)
 *   track  any GPX with two points left after the trim
 *                                    -> cleaned (always rewritten: geometry
 *                                       only, the ends hidden again)
 *          anything else             -> refused
 *
 * A second trim cannot know where the device's circles were; it guarantees
 * the stored file carries geometry only and is hidden at its own ends, which
 * is what the T333 design asks of it.
 */
import { stripImageMetadata, isMetadataFree, sniffImage } from '../_shared/stripImageMeta.js';
import { trimGpx } from '../_shared/gpxPrivacy.js';

export const BUCKET = 'user-uploads';
export const SCAN_BATCH = 20;
export const PURGE_BATCH = 200;

const refused = (code) => ({
  result: `refused:${String(code || 'unreadable').toLowerCase().replace(/[^a-z_]/g, '_').slice(0, 40)}`,
});

/**
 * One file through the pass.
 *   scanUpload('photo' | 'track', Uint8Array, { random })
 *     -> { result: 'clean' }
 *      | { result: 'cleaned', bytes: Uint8Array, contentType }
 *      | { result: 'refused:<code>' }
 */
export function scanUpload(kind, bytes, { random } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return refused('empty');
  if (kind === 'photo') {
    const type = sniffImage(bytes);
    if (type !== 'jpeg' && type !== 'png') return refused('unsupported');
    if (isMetadataFree(bytes)) return { result: 'clean' };
    let out;
    try {
      out = stripImageMetadata(bytes).bytes;
    } catch (e) {
      return refused(e && e.code);
    }
    if (!isMetadataFree(out)) return refused('not_clean');
    return { result: 'cleaned', bytes: out, contentType: type === 'png' ? 'image/png' : 'image/jpeg' };
  }
  if (kind === 'track') {
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return refused('not_gpx');
    }
    try {
      const res = trimGpx(text, random ? { random } : undefined);
      return { result: 'cleaned', bytes: new TextEncoder().encode(res.gpx), contentType: 'application/gpx+xml' };
    } catch (e) {
      return refused(e && e.code);
    }
  }
  return refused('bad_kind');
}

/** Constant-time compare of the cron header with the secret. */
export async function secretOk(header, secret) {
  if (!secret || typeof header !== 'string' || header.length === 0) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([header, secret].map((s) => crypto.subtle.digest('SHA-256', enc.encode(s))));
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * The queue rows as Storage API calls: single paths go out together in one
 * remove(); a folder (is_prefix) needs a list() first, done by the caller.
 */
export function splitPurge(rows) {
  const files = [];
  const folders = [];
  for (const r of rows || []) {
    if (!r || typeof r.path !== 'string' || r.path.length < 2) continue;
    if (r.is_prefix) folders.push(r);
    else files.push(r);
  }
  return { files, folders };
}
