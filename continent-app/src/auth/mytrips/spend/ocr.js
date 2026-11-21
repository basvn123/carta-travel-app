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
// The progress listener of the read in hand (one read at a time).
let progressCb = null;

async function simdOk() {
  try {
    // The smallest module that uses a SIMD instruction (wasm-feature-detect's).
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch {
    return false;
  }
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      // The prebuilt browser bundle: the package's src is written for webpack.
      const { default: Tesseract } = await import('tesseract.js/dist/tesseract.esm.min.js');
      const { createWorker } = Tesseract;
      const corePath = (await simdOk()) ? coreSimd : corePlain;
      return createWorker('eng', 1, {
        workerPath,
        workerBlobURL: false,
        corePath,
        langPath: OCR_LANG_PATH,
        logger: (m) => { if (m?.status && Number.isFinite(m.progress)) progressCb?.(m.status, m.progress); },
      });
    })().catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

/** The text on a receipt image (a Blob), or throws. */
export async function readReceiptText(blob, onProgress) {
  progressCb = onProgress || null;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(blob);
    return data?.text || '';
  } finally {
    progressCb = null;
  }
}
