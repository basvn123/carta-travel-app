/**
 * bookingImport.js, the client half of the "magic import" flow.
 *
 * Reads the traveller's dropped files into the payload `parse-booking`
 * accepts, and invokes the Edge Function (the AI key never leaves the
 * server). The pure folding of the answer into booking rows and inbox items
 * lives in bookingImportLogic.js, which is Node-testable; this file adds the
 * two halves that touch the browser: FileReader and Supabase.
 *
 * Mirrors aiDayPlan.js on purpose: same typed failure codes, same "the AI is
 * an enhancer, not a dependency" posture. Nothing here ever overwrites a
 * field the traveller already typed: an import fills blanks, it does not
 * argue with people.
 */
import { supabase } from '../lib/supabaseClient.js';
import { importMime, MAX_IMPORT_FILES, MAX_IMPORT_BYTES, MAX_IMPORT_TOTAL_BYTES } from './bookingImportLogic.js';

export {
  IMPORT_MIMES, IMPORT_ACCEPT, MAX_IMPORT_FILES, MAX_IMPORT_BYTES,
  MAX_IMPORT_TOTAL_BYTES, importMime, matchBookingRow, applyParsedBookings,
  toInboxItems,
} from './bookingImportLogic.js';

/**
 * FileList -> { files: [{ mime, data, name }] } or { error, name }.
 * error: 'type' | 'size' | 'total' | 'count' | 'read'.
 */
export async function filesToPayload(fileList) {
  const list = [...fileList];
  if (list.length > MAX_IMPORT_FILES) return { error: 'count' };
  let total = 0;
  const files = [];
  for (const f of list) {
    const mime = importMime(f);
    if (!mime) return { error: 'type', name: f.name };
    if (f.size > MAX_IMPORT_BYTES) return { error: 'size', name: f.name };
    total += f.size;
    if (total > MAX_IMPORT_TOTAL_BYTES) return { error: 'total' };
    try {
      files.push({ mime, data: await fileToB64(f), name: f.name || '' });
    } catch {
      return { error: 'read', name: f.name };
    }
  }
  return { files };
}

const fileToB64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  // readAsDataURL keeps the browser's own base64 encoder (fast, no 2x string
  // juggling); the payload wants what follows the comma.
  r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});

/**
 * Call the Edge Function. Resolves to { ok: true, result } or
 * { ok: false, code } with the same code vocabulary as requestAiDayPlan,
 * plus 'nothing_found' / 'nothing_to_parse' from this endpoint.
 */
export async function requestBookingImport(payload) {
  if (!supabase) return { ok: false, code: 'no_auth_config' };
  try {
    const { data, error } = await supabase.functions.invoke('parse-booking', { body: payload });
    if (error) {
      let code = 'ai_error';
      try {
        const body = await error.context?.json?.();
        // Only our own string codes: the gateway answers a missing function
        // with {code:"NOT_FOUND"} and some proxies use numbers, both of which
        // used to fall through as a retryable "hiccup". A function that is
        // not deployed is the same traveller-facing fact as one switched off.
        if (typeof body?.code === 'string') code = body.code;
      } catch { /* non-JSON error body */ }
      if (code === 'NOT_FOUND' || error.context?.status === 404) code = 'no_ai';
      return { ok: false, code };
    }
    if (data?.code === 'nothing_found') return { ok: false, code: 'nothing_found' };
    if (!data || (!Array.isArray(data.bookings) && !Array.isArray(data.activities))) {
      return { ok: false, code: 'ai_bad_output' };
    }
    return { ok: true, result: data };
  } catch {
    return { ok: false, code: 'network' };
  }
}
