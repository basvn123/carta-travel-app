/**
 * What Jouw smaak (TasteChips) reads, published by My trips (G12 decision 7:
 * the chips moved into the Style Studio, which has no trips or saves of its
 * own). The last inputs are kept for the session and in localStorage, so the
 * studio shows the profile on a fresh load too.
 */
const KEY = 'carta.tasteInputs.v1';
let current = null;
const subs = new Set();

function read() {
  if (current) return current;
  try { current = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { current = null; }
  return current;
}

export function publishTasteInputs(v) {
  current = { saves: v.saves || [], trips: v.trips || [], userId: v.userId || null };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode: the session copy is enough */ }
  subs.forEach((fn) => fn(current));
}

export function getTasteInputs() { return read() || { saves: [], trips: [], userId: null }; }

export function subscribeTasteInputs(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
