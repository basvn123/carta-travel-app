/**
 * device.js, the Uitgaven page's small device-only stores and browser
 * seams (G15): the faces (a photo per person, downscaled, on this device
 * only), the one-time speech notice, and the speech recogniser.
 */
import { reencode } from './receiptStore.js';

const FACES_KEY = 'carta.kas.faces.v1';
const NOTICE_KEY = 'carta.spend.speechNotice.v1';
const FACE_EDGE = 128;

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

/** { personId: dataUrl } for one trip. */
export const readFaces = (planId) => read(FACES_KEY, {})[planId] || {};

/** A picked photo as a small square-ish face, kept on this device. */
export async function saveFace(planId, personId, file) {
  const blob = await reencode(file);
  const bmp = await createImageBitmap(blob);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = FACE_EDGE;
  canvas.height = FACE_EDGE;
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, FACE_EDGE, FACE_EDGE);
  if (bmp.close) bmp.close();
  const url = canvas.toDataURL('image/jpeg', 0.8);
  const all = read(FACES_KEY, {});
  all[planId] = { ...(all[planId] || {}), [personId]: url };
  write(FACES_KEY, all);
  return url;
}

export const speechNoticeSeen = () => !!read(NOTICE_KEY, false);
export const markSpeechNoticeSeen = () => write(NOTICE_KEY, true);

const SPEECH_LANG = { en: 'en-GB', nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT' };

/** The browser's speech recogniser class, or null where there is none (the
 *  mic is then hidden and typing works the same). */
export function speechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Starts listening. Call it inside the tap (Safari needs the gesture).
 * Returns { stop }. `onText(text, final)` gets the live transcript; `onEnd`
 * runs once with the last text ('' when nothing was heard) or an error code.
 */
export function listen(lang, { onText, onEnd }) {
  const Rec = speechRecognition();
  if (!Rec) { onEnd?.('', 'unsupported'); return { stop() {} }; }
  const rec = new Rec();
  rec.lang = SPEECH_LANG[lang] || 'en-GB';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let text = '';
  let ended = false;
  const finish = (err) => { if (ended) return; ended = true; onEnd?.(text.trim(), err || null); };
  rec.onresult = (e) => {
    text = [...e.results].map((r) => r[0]?.transcript || '').join(' ');
    onText?.(text.trim(), e.results[e.results.length - 1]?.isFinal);
  };
  rec.onerror = (e) => finish(e.error || 'error');
  rec.onend = () => finish(null);
  try { rec.start(); } catch { finish('start'); }
  return { stop() { try { rec.stop(); } catch { finish(null); } } };
}
