/**
 * uploads.js, the photo and track upload path (T333, destinations spec 2.8,
 * register rows T206-b and T068-h).
 *
 * A remote trail rarely has a good Commons photo and some walks have no open
 * track at all. The people who walked them have both. This module turns what
 * they pick on their device into something Carta may hold, under a licence it
 * can rely on, without the private details a phone writes into a file.
 *
 * THE LEGAL SHAPE, and where each piece lives:
 *
 *   The grant. The Terms (components/TermsOfService.jsx, "Photos and tracks
 *   you share") take a worldwide, non-exclusive, royalty-free, perpetual,
 *   irrevocable, transferable and sublicensable licence, with a warranty and
 *   an indemnity from the uploader. The form makes the uploader tick that
 *   grant for every upload, and the record carries UPLOAD_TERMS_VERSION so
 *   it is known which wording was accepted.
 *
 *   Attribution. Moral rights cannot be waived in France, Germany, Spain or
 *   Italy, so the Terms promise credit instead of asking for a waiver, and
 *   the form asks how the uploader wants to be credited.
 *
 *   The public licence. On top of the platform grant the uploader picks one
 *   of three: Carta only, CC BY 4.0 or CC BY-SA 4.0 (LICENCES).
 *
 *   OpenStreetMap. Neither CC licence lets a track flow into OSM by itself
 *   (CC BY 4.0 needs the OSMF waiver, CC BY-SA is incompatible), so a track
 *   carries a separate, explicit tick in the owner's wording (T362, block A
 *   of the owner runbook). That wording waits on a lawyer's check against the
 *   OSMF waiver template before launch (owner step J4, row T333-b).
 *
 *   Privacy. Photos lose their metadata (lib/stripImageMeta.js) and tracks
 *   their ends, times and extensions (lib/gpxPrivacy.js) on the device,
 *   before anything is sent, with no way to switch it off.
 *
 *   Notice and action. Nothing is public on arrival: every upload waits for a
 *   person, on the moderation surface of T067 to T070. A published upload is
 *   reportable through report_content, designed in the T333 report.
 *
 * THE SERVER HALF DOES NOT EXIST YET. Storing an upload needs a table, a
 * private storage bucket and three functions (begin_upload, finish_upload,
 * report_content), which is a migration, and this task was allowed none. The
 * T333 report designs them and row T333-a carries the work. Until it lands,
 * a send on a real project answers "did not send, nothing was stored", the
 * same honest failure the guide report gave before 037 was pasted.
 */
import { supabase } from '../lib/supabaseClient.js';
import { E2E_SEAMS } from '../lib/e2eSeams.js';
import { stripImageMetadata, isMetadataFree } from '../lib/stripImageMeta.js';
import { trimGpx } from '../lib/gpxPrivacy.js';

/* ---- the verify seam ------------------------------------------------------
 * Same precedent as ?guidesmock: a fixture stands in for the session and the
 * server so the form can be checked headlessly before the migration exists.
 * Display only, compiled out of a production build. */
export const UPLOAD_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('uploadmock');

/** The public licences an uploader may add to the platform grant. */
export const LICENCES = ['platform', 'cc-by-4.0', 'cc-by-sa-4.0'];

/** Which wording of the Terms' upload section a grant was given under.
 *  Change it whenever that section of TermsOfService.jsx changes. */
export const UPLOAD_TERMS_VERSION = '2026-10-07';

/** Which wording of the OpenStreetMap tick a permission was given under.
 *  Change it if the J4 legal check changes the sentence. */
export const OSM_TICK_VERSION = '2026-10-07';

export const PHOTO_MAX_BYTES = 25 * 1024 * 1024;
export const TRACK_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_MAX_EDGE = 2560;
export const PHOTO_MIN_EDGE = 800;
export const CREDIT_MAX = 80;

const fail = (code) => {
  const e = new Error(code);
  e.code = code;
  return e;
};

/* ---- preparing a photo --------------------------------------------------- */

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(fail('unreadable')); };
  img.src = url;
});

/**
 * Draws the photo onto a canvas at most PHOTO_MAX_EDGE on its long side and
 * encodes a JPEG. createImageBitmap with imageOrientation 'from-image' turns
 * the picture the way the camera meant it, which matters because the EXIF
 * orientation flag is about to be removed with everything else.
 */
async function reencode(file) {
  let src;
  if (typeof createImageBitmap === 'function') {
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { src = null; }
  }
  if (!src) src = await loadImage(file);
  const w0 = src.width;
  const h0 = src.height;
  if (!w0 || !h0) throw fail('unreadable');
  if (Math.max(w0, h0) < PHOTO_MIN_EDGE) throw fail('too_small');
  const k = Math.min(1, PHOTO_MAX_EDGE / Math.max(w0, h0));
  const w = Math.round(w0 * k);
  const h = Math.round(h0 * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(src, 0, 0, w, h);
  src.close?.();
  const blob = await new Promise((resolve) => { canvas.toBlob(resolve, 'image/jpeg', 0.86); });
  if (!blob) throw fail('unreadable');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h };
}

/**
 * A photo as it may leave the device:
 *   { kind: 'photo', blob, bytes, width, height, hadLocation, removedCount }
 * Throws with code too_big, too_small, unreadable or not_clean. The original
 * is read once to say what it carried; what is sent is the re-encoded copy,
 * stripped again and checked clean.
 */
export async function preparePhoto(file) {
  if (!file) throw fail('unreadable');
  if (file.size > PHOTO_MAX_BYTES) throw fail('too_big');
  const original = new Uint8Array(await file.arrayBuffer());
  let found = [];
  try { found = stripImageMetadata(original).removed; } catch { found = []; }
  const enc = await reencode(file);
  const { bytes } = stripImageMetadata(enc.bytes);
  if (!isMetadataFree(bytes)) throw fail('not_clean');
  return {
    kind: 'photo',
    blob: new Blob([bytes], { type: 'image/jpeg' }),
    bytes: bytes.length,
    width: enc.width,
    height: enc.height,
    hadLocation: found.includes('exif-gps'),
    removedCount: found.length,
  };
}

/* ---- preparing a track --------------------------------------------------- */

/**
 * A track as it may leave the device:
 *   { kind: 'track', blob, bytes, total, kept, removed, lengthM, radiusM }
 * Throws with code too_big, not_gpx, no_points or too_short.
 */
export async function prepareTrack(file) {
  if (!file) throw fail('not_gpx');
  if (file.size > TRACK_MAX_BYTES) throw fail('too_big');
  const res = trimGpx(await file.text());
  const blob = new Blob([res.gpx], { type: 'application/gpx+xml' });
  return {
    kind: 'track',
    blob,
    bytes: blob.size,
    total: res.total,
    kept: res.kept,
    removed: res.removed,
    lengthM: res.lengthM,
    radiusM: res.radiusM,
  };
}

/* ---- checking the choices ------------------------------------------------ */

/**
 * The first thing wrong with a set of choices, as an error word, or null.
 * The server checks the same things again; this gives the sentence first.
 */
export function uploadProblem({ prepared, licence, credit, grant }) {
  if (!prepared) return 'no_file';
  if (!LICENCES.includes(licence)) return 'bad_licence';
  const c = (credit || '').trim();
  if (c.length < 2 || c.length > CREDIT_MAX) return 'bad_credit';
  if (!grant) return 'no_grant';
  return null;
}

/* ---- sending ------------------------------------------------------------- */

/**
 * Sends one prepared upload for review. Resolves { id } on success; throws an
 * Error with `code` set on refusal (not_signed_in, too_many, bad_target, and
 * the words uploadProblem returns), or the transport error as it came.
 *
 * The server half, designed in the T333 report:
 *   begin_upload(...)   checks the session, the choices and a daily limit,
 *                       writes a pending row with the licence, the credit,
 *                       the OSM permission and both wording versions, and
 *                       answers the storage path the owner may write once;
 *   storage upload      into the private bucket user-uploads at that path;
 *   finish_upload(id)   records the size and queues the row for review.
 */
export async function submitUpload({
  layer, itemId, prepared, licence, credit, osm, grant,
}) {
  const problem = uploadProblem({ prepared, licence, credit, grant });
  if (problem) throw fail(problem);
  if (UPLOAD_MOCK) {
    await new Promise((r) => { setTimeout(r, 250); });
    return { id: 'mock-upload' };
  }
  if (!supabase) throw fail('not_signed_in');
  const { data, error } = await supabase.rpc('begin_upload', {
    p_kind: prepared.kind,
    p_layer: layer,
    p_item_id: String(itemId),
    p_licence: licence,
    p_credit: credit.trim(),
    p_osm_permission: prepared.kind === 'track' ? !!osm : null,
    p_osm_wording: prepared.kind === 'track' && osm ? OSM_TICK_VERSION : null,
    p_terms_version: UPLOAD_TERMS_VERSION,
    p_bytes: prepared.bytes,
  });
  if (error) throw error;
  if (data && data.error) throw fail(data.error);
  const up = await supabase.storage.from('user-uploads').upload(data.path, prepared.blob, {
    contentType: prepared.blob.type,
    upsert: false,
  });
  if (up.error) throw up.error;
  const done = await supabase.rpc('finish_upload', { p_id: data.id });
  if (done.error) throw done.error;
  if (done.data && done.data.error) throw fail(done.data.error);
  return { id: data.id };
}
