/**
 * receiptStore.js, receipt photos on this device only (G15).
 *
 * A receipt photo is re-drawn onto a canvas and saved as a new JPEG, which
 * drops every EXIF field (the place it was taken, the phone, the time), and
 * kept in IndexedDB under an id the spend row carries (`photoId`). It never
 * goes into the trip extras, so it never syncs to the account: the house
 * rule for documents (PRODUCT.md principle 4). A guest in private mode with
 * no IndexedDB still logs the spend; only the photo is not kept.
 */
const DB = 'carta-receipts';
const STORE = 'photos';
const MAX_EDGE = 1400;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(out?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/** A picked or captured image as a fresh JPEG Blob, EXIF gone, at most
 *  MAX_EDGE on its long side. */
export async function reencode(file) {
  const bmp = typeof createImageBitmap === 'function'
    ? await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
    : await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  const w = bmp.width;
  const h = bmp.height;
  const k = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.8));
}

/** Keeps a receipt Blob; resolves to its id, or null when it cannot. */
export async function putReceipt(blob) {
  const id = `rc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await run('readwrite', (s) => s.put(blob, id));
    return id;
  } catch {
    return null;
  }
}

/** A receipt Blob by id, or null. */
export async function getReceipt(id) {
  if (!id) return null;
  try { return (await run('readonly', (s) => s.get(id))) || null; } catch { return null; }
}

export async function deleteReceipt(id) {
  if (!id) return;
  try { await run('readwrite', (s) => s.delete(id)); } catch { /* nothing kept */ }
}
