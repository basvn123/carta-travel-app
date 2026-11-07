/**
 * The traveller's verdicts on their taste chips (T1152, ROADMAP F3), on this
 * device first: local storage `carta.taste.v1`, one of the traveller's
 * things (lib/deviceData.js), so "Sign out and remove" clears it.
 *
 *   { v: 1, owner: account id | null, verdicts: { [node]: { v: 'accept' | 'reject', at } },
 *     removed: { [node]: at } }
 *
 * `removed` remembers a verdict taken back, so the account sync
 * (./sync.js) can write a tombstone instead of bringing it back. Every
 * function takes the storage as an argument for the node test; the hook
 * at the bottom binds it to the browser.
 */
import { useEffect, useState } from 'react';

export const TASTE_KEY = 'carta.taste.v1';
export const TASTE_EVENT = 'carta:taste';
const VERDICTS = ['accept', 'reject'];

const blank = () => ({ v: 1, owner: null, verdicts: {}, removed: {} });

export function readTasteState(storage) {
  let raw = null;
  try { raw = JSON.parse(storage?.getItem(TASTE_KEY) ?? 'null'); } catch { raw = null; }
  if (!raw || raw.v !== 1) return blank();
  const out = blank();
  out.owner = typeof raw.owner === 'string' ? raw.owner : null;
  for (const [k, x] of Object.entries(raw.verdicts || {})) {
    if (x && VERDICTS.includes(x.v) && typeof x.at === 'number') out.verdicts[k] = { v: x.v, at: x.at };
  }
  for (const [k, at] of Object.entries(raw.removed || {})) if (typeof at === 'number') out.removed[k] = at;
  return out;
}

export function writeTasteState(storage, st) {
  try { storage?.setItem(TASTE_KEY, JSON.stringify(st)); } catch { /* full or blocked: this visit only */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TASTE_EVENT));
}

/** Say yes or no to one chip; `null` takes the verdict back. Returns the new state. */
export function setVerdict(storage, node, verdict, now = Date.now()) {
  const st = readTasteState(storage);
  if (verdict && VERDICTS.includes(verdict)) {
    st.verdicts[node] = { v: verdict, at: now };
    delete st.removed[node];
  } else if (st.verdicts[node]) {
    delete st.verdicts[node];
    st.removed[node] = now;
  }
  writeTasteState(storage, st);
  return st;
}

/** Forget every verdict on this device (the traveller's "Start over"). */
export function clearVerdicts(storage, now = Date.now()) {
  const st = readTasteState(storage);
  for (const k of Object.keys(st.verdicts)) st.removed[k] = now;
  st.verdicts = {};
  writeTasteState(storage, st);
  return st;
}

/** The verdicts as a stable key: node and verdict, sorted, no times. */
export const verdictsKey = (verdicts) => Object.keys(verdicts || {}).sort()
  .map((n) => `${n}:${verdicts[n]?.v}`).join(',');

function browserStorage() {
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

/** The verdicts, live: re-read on this tab's changes and on other tabs'. */
export function useTasteVerdicts() {
  const [st, setSt] = useState(() => readTasteState(browserStorage()));
  useEffect(() => {
    const again = () => setSt(readTasteState(browserStorage()));
    const onStorage = (e) => { if (!e.key || e.key === TASTE_KEY) again(); };
    window.addEventListener(TASTE_EVENT, again);
    window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(TASTE_EVENT, again); window.removeEventListener('storage', onStorage); };
  }, []);
  return {
    verdicts: st.verdicts,
    set: (node, verdict) => setVerdict(browserStorage(), node, verdict),
    clear: () => clearVerdicts(browserStorage()),
  };
}

export { browserStorage };
