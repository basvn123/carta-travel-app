/**
 * ocr.js, reading a receipt on the phone (G15, owner decision 2026-11-21:
 * no Gemini). Tesseract.js runs in a Web Worker in WebAssembly; the photo
 * never leaves the device. Everything here loads only when the traveller
 * scans a receipt: this module is imported with import() from the scan
 * sheet, so neither Tesseract nor its 4 MB core is in the main chunk.
 *
 * Every file is served from Carta's own origins, as the CSP asks
 * (script-src 'self' 'wasm-unsafe-eval', worker-src 'self' blob:):
 *   the worker    built by Vite from tesseract.js (?worker&url)
 *   the core      tesseract.js-core's WebAssembly build (?url, an asset)
 *   the language  English LSTM data (about 3 MB gzipped) from the data host
 *                 (connect-src allows it), fetched once and then kept in
 *                 IndexedDB by Tesseract. Uploading it is an owner step
 *                 (docs/owner/cloudflare.md, G15); until it is there, a read
 *                 fails and the sheet says to type the amount.
 */
import workerPath from './ocr.worker.js?worker&url';
import coreSimd from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url';
import corePlain from 'tesseract.js-core/tesseract-core-lstm.wasm.js?url';

export const OCR_LANG_PATH = 'https://data.carta-europetravel.com/ocr/4.0.0_best_int';

let workerPromise = null;
// The worker once made, so a failure can end it.
let liveWorker = null;
// Bumped on every reset: a worker that arrives for an older generation is ended.
let generation = 0;
// The progress listener and the failure hook of the read in hand (one read
// at a time). Tesseract reports a failed load or read to errorHandler, not
// as a rejection, so without the hook a missing model left the sheet on
// "reading" for good (judge round 1).
let progressCb = null;
let failCb = null;

/** How long a load or a read may take before the sheet says to type it. */
export const OCR_TIMEOUT_MS = 30000;

function withTimeout(promise, ms, what) {
  let timer = 0;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Ends the worker and forgets it, so the next scan starts clean. */
function reset() {
  const w = liveWorker;
  liveWorker = null;
  workerPromise = null;
  generation += 1;
  if (w) w.terminate().catch(() => {});
}

async function simdOk() {
  try {
    // The smallest module that uses a SIMD instruction (wasm-feature-detect's).
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

function getWorker() {
  if (!workerPromise) {
    const mine = generation;
    const made = (async () => {
      // The prebuilt browser bundle: the package's src is written for webpack.
      const { default: Tesseract } = await import('tesseract.js/dist/tesseract.esm.min.js');
      const { createWorker } = Tesseract;
      const corePath = (await simdOk()) ? coreSimd : corePlain;
      const w = await createWorker('eng', 1, {
        workerPath,
        workerBlobURL: false,
        corePath,
        langPath: OCR_LANG_PATH,
        logger: (m) => { if (m?.status && Number.isFinite(m.progress)) progressCb?.(m.status, m.progress); },
        errorHandler: (e) => failCb?.(e instanceof Error ? e : new Error(String(e))),
      });
      // A worker that arrives after the load was given up on is ended.
      if (mine !== generation) { w.terminate().catch(() => {}); throw new Error('ocr load abandoned'); }
      liveWorker = w;
      return w;
    })();
    workerPromise = made;
    made.catch(() => { if (workerPromise === made) reset(); });
  }
  return workerPromise;
}

/** The text on a receipt image (a Blob), or throws within OCR_TIMEOUT_MS
 *  of a missing model, a failed load or a stuck read. */
export async function readReceiptText(blob, onProgress) {
  progressCb = onProgress || null;
  let fail = null;
  const failed = new Promise((_, reject) => { fail = reject; });
  failCb = fail;
  try {
    const worker = await withTimeout(Promise.race([getWorker(), failed]), OCR_TIMEOUT_MS, 'ocr load');
    const { data } = await withTimeout(Promise.race([worker.recognize(blob), failed]), OCR_TIMEOUT_MS, 'ocr read');
    return data?.text || '';
  } catch (e) {
    reset();
    throw e;
  } finally {
    progressCb = null;
    failCb = null;
    failed.catch(() => {});
  }
}
