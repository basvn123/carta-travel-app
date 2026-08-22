/**
 * dayFileStore.js, the traveller's own documents for one plan.
 *
 * Boarding passes, a hotel confirmation, the museum ticket PDF, a photo of a
 * printed itinerary. These are private files nobody asked to publish, they can
 * be megabytes each, and the plan they belong to works for guests with no
 * account at all. So they live in IndexedDB on the device that added them,
 * beside the plan, and never leave it: no upload, no bucket, no third party
 * holding somebody's passport scan.
 *
 * That is a real limit and the UI says so out loud (see DayFilesTab): a file
 * added on a phone is not on the laptop. Notes, which are small and useful on
 * every device, stay in the synced trip extras instead.
 *
 * Record shape:
 *   { id, planId, name, type, size, addedAt, blob }
 * List reads deliberately drop `blob`, so rendering a folder of 40MB of PDFs
 * costs nothing until one is actually opened.
 */

const DB_NAME = 'carta-files';
const DB_VERSION = 1;
const STORE = 'files';

// One file bigger than this is almost certainly a video, not a ticket. Kept
// well under the browser's own per-origin quota so an add never half-lands.
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no_idb')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('planId', 'planId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb_open'));
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

function tx(mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    try { out = run(store); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error || new Error('idb_tx'));
    t.onabort = () => reject(t.error || new Error('idb_abort'));
  }));
}

/** True when this browser can hold files at all (private windows may not). */
export async function filesAvailable() {
  try { await openDb(); return true; } catch { return false; }
}

/** Every file on a plan, newest first, without the blobs. */
export async function listFiles(planId) {
  if (!planId) return [];
  try {
    const rows = await tx('readonly', (store) => store.index('planId').getAll(planId));
    return (rows || [])
      .map(({ blob, ...meta }) => meta) // eslint-disable-line no-unused-vars
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  } catch {
    return [];
  }
}

export async function totalBytes(planId) {
  return (await listFiles(planId)).reduce((n, f) => n + (f.size || 0), 0);
}

/**
 * Store real files against a plan. Returns { added, rejected: [{name, code}] }
 * so the caller can name what did not fit rather than failing the whole drop.
 */
export async function addFiles(planId, fileList) {
  const files = Array.from(fileList || []);
  if (!planId || !files.length) return { added: [], rejected: [] };
  let used = await totalBytes(planId);
  const added = [];
  const rejected = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) { rejected.push({ name: file.name, code: 'size' }); continue; }
    if (used + file.size > MAX_TOTAL_BYTES) { rejected.push({ name: file.name, code: 'full' }); continue; }
    const rec = {
      id: `f${Date.now()}${Math.random().toString(36).slice(2, 7)}`,
      planId,
      name: (file.name || 'document').slice(0, 120),
      type: file.type || '',
      size: file.size,
      addedAt: Date.now(),
      blob: file,
    };
    try {
      await tx('readwrite', (store) => store.put(rec));
      used += file.size;
      const { blob, ...meta } = rec; // eslint-disable-line no-unused-vars
      added.push(meta);
    } catch {
      rejected.push({ name: file.name, code: 'store' });
    }
  }
  return { added, rejected };
}

/** The stored Blob, or null when the record is gone. */
export async function readFile(id) {
  if (!id) return null;
  try {
    const rec = await tx('readonly', (store) => store.get(id));
    return rec?.blob || null;
  } catch {
    return null;
  }
}

export async function deleteFile(id) {
  if (!id) return;
  try { await tx('readwrite', (store) => store.delete(id)); } catch { /* already gone */ }
}

/** Drop every file of a plan (called when the plan itself is deleted). */
export async function deletePlanFiles(planId) {
  const rows = await listFiles(planId);
  for (const r of rows) await deleteFile(r.id);
}

/** "1.4 MB", "812 kB", "0.4 kB". Never a raw byte count. */
export function fmtBytes(n) {
  const b = Number(n) || 0;
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} kB`;
}
