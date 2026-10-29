/**
 * The trips a traveller kept from the trip finder (TF4, T806), the ones they
 * skipped for one answer set, and the one-shot plan My trips hands the Plan
 * tab. Kept on this device (localStorage), with a change event so every
 * screen that shows them (the cards, My trips, the Plan home) moves together.
 *
 * Light on purpose: the Plan home reads it in the first load, so nothing
 * here imports the engine or the flight files (kept.js does the sums).
 *
 * A kept record (kept.js keptRecord):
 *   { id, keptAt, name, country, iso2, image, nights, month, dates, party,
 *     total: { perPerson, group }, flight: { iata, out, back, paying, bagKey,
 *     then } | null, origin, plan }
 */
import { useEffect, useState, useSyncExternalStore } from 'react';

export const KEPT_KEY = 'carta.keptTrips.v1';
export const SKIP_KEY = 'carta.tripSkips.v1';
export const PLAN_ONCE_KEY = 'carta.finderPlan.once';
export const MAX_KEPT = 24;
// Skips are per answer set; the newest few sets are kept, older ones fall off.
const MAX_SKIP_SETS = 12;
const EVENT = 'carta:kept';

const local = () => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
const session = () => { try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; } };
const readJson = (store, key) => { try { return JSON.parse(store?.getItem(key) ?? 'null'); } catch { return null; } };
const writeJson = (store, key, value) => { try { store?.setItem(key, JSON.stringify(value)); } catch { /* full or blocked: this visit only */ } };
const notify = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT)); };

/** Every kept trip, newest first. */
export function readKept() {
  const list = readJson(local(), KEPT_KEY);
  return Array.isArray(list) ? list.filter((r) => r && typeof r.id === 'string') : [];
}

function writeKept(list) {
  writeJson(local(), KEPT_KEY, list.slice(0, MAX_KEPT));
  notify();
}

/** Keep one trip (a kept.js record); keeping it again moves it to the top. */
export function keep(record) {
  writeKept([record, ...readKept().filter((r) => r.id !== record.id)]);
}

export function unkeep(id) {
  writeKept(readKept().filter((r) => r.id !== id));
}

/** Calls `fn` when the kept trips change, here or in another tab. */
export function subscribeKept(fn) {
  if (typeof window === 'undefined') return () => {};
  const other = (e) => { if (!e.key || e.key === KEPT_KEY || e.key === SKIP_KEY) fn(); };
  window.addEventListener(EVENT, fn);
  window.addEventListener('storage', other);
  return () => { window.removeEventListener(EVENT, fn); window.removeEventListener('storage', other); };
}

// useSyncExternalStore wants the same object while nothing changed.
let cache = { raw: undefined, list: [] };
function snapshot() {
  const raw = local()?.getItem(KEPT_KEY) ?? null;
  if (raw !== cache.raw) cache = { raw, list: readKept() };
  return cache.list;
}
const EMPTY = [];

/** The kept trips, kept up to date. */
export function useKept() {
  return useSyncExternalStore(subscribeKept, snapshot, () => EMPTY);
}

/** The trips skipped for one answer set (ids). */
export function readSkips(key) {
  const all = readJson(local(), SKIP_KEY);
  const ids = all && typeof all === 'object' ? all[key] : null;
  return Array.isArray(ids) ? ids : [];
}

export function writeSkips(key, ids) {
  const all = readJson(local(), SKIP_KEY);
  const rest = all && typeof all === 'object' ? Object.entries(all).filter(([k]) => k !== key) : [];
  const next = Object.fromEntries([...(ids.length ? [[key, ids]] : []), ...rest].slice(0, MAX_SKIP_SETS));
  writeJson(local(), SKIP_KEY, next);
  notify();
}

// A held plan is only good for the hand-off it was made for: one the Plan
// tab did not pick up at once (a trip with stops was open) is dropped.
const HOLD_MS = 2 * 60 * 1000;

/** My trips hands the Plan tab one kept trip to plan (read once, then gone). */
export function holdPlan(plan) { writeJson(session(), PLAN_ONCE_KEY, { at: Date.now(), plan }); }

export function takePlan(now = Date.now()) {
  const s = session();
  const held = readJson(s, PLAN_ONCE_KEY);
  try { s?.removeItem(PLAN_ONCE_KEY); } catch { /* blocked */ }
  const plan = held?.plan;
  return plan && Array.isArray(plan.order) && now - held.at < HOLD_MS ? plan : null;
}

/**
 * The kept trips that got cheaper since they were kept (T807), by id:
 * { perPerson, group, total }. Empty until the swept files are in; the sums
 * load only when a kept trip has a flight to watch. `loadFlightFile` is
 * lib/flights/flightData.js's, handed in by the screen.
 *
 * The sums (kept.js dropsFor) come through the trip finder's chunk, which
 * carries kept.js and the flight rules already: a module of their own made
 * the bundler split the flight rules and the data host out of the shared
 * chunks, one more preload on every page (T806 build). Only a traveller
 * with a kept trip ever loads it from here.
 */
export function useKeptDrops(records, loadFlightFile) {
  const [drops, setDrops] = useState({});
  const watched = records.filter((r) => r.flight).map((r) => r.id).join();
  useEffect(() => {
    if (!watched) { setDrops({}); return undefined; }
    let live = true;
    import('../../planner/finder/FindingTrips.jsx').then((m) => m.dropsFor(records, loadFlightFile)).then((d) => { if (live) setDrops(d); }).catch(() => null);
    return () => { live = false; };
  }, [watched]); // eslint-disable-line react-hooks/exhaustive-deps -- `watched` stands for the records with a flight
  return drops;
}

// My trips remembers its open tab under this key (auth/SavedTripsPanel.jsx TAB_KEY).
const MYTRIPS_TAB_KEY = 'carta.savedTripsTab';

/** Open My trips on the tab that holds the kept trips. */
export function showKeptNext() { try { local()?.setItem(MYTRIPS_TAB_KEY, 'favorites'); } catch { /* blocked */ } }

// Which person this device is in each shared shortlist (together.js), by list id.
const ME_KEY = 'carta.together.me';

/** This device's number in a shared shortlist, or null when it has not picked yet. */
export function togetherMe(id) {
  const all = readJson(local(), ME_KEY);
  return all && Number.isInteger(all[id]) ? all[id] : null;
}

export function setTogetherMe(id, me) {
  const all = readJson(local(), ME_KEY);
  writeJson(local(), ME_KEY, { ...(all && typeof all === 'object' ? all : {}), [id]: me });
}

/** The hash a shared shortlist rides in (together.js). */
export const TOGETHER_HASH = '#together=';

