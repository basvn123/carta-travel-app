/**
 * plannerStore.js, the guided trip wizard's global draft state.
 *
 * One plain-JS store (subscribe / snapshot, wired to React through
 * useSyncExternalStore) holding the origin-first planning context: where the
 * trip departs from, which airports that unlocks, the dates, the party and
 * travel style, and the selections made on the way to the overview. The
 * wizard remains the writer; the store makes the draft survive tab hops and
 * reloads (localStorage) and gives any other surface one place to read the
 * planning context from.
 *
 * Field shapes (JSDoc, the runtime is plain JS):
 *
 * @typedef {Object} GeoLocation
 * @property {string} name
 * @property {number} lat
 * @property {number} lng
 * @property {string} countryCode   ISO2, uppercase ('' when unknown)
 *
 * @typedef {Object} NearbyAirport
 * @property {string} iata
 * @property {string} name
 * @property {number} distanceKm
 *
 * @typedef {Object} TransitOption
 * @property {'drive'|'flight'|'train'} type
 * @property {string} [providerOrRoute]
 * @property {string} [departureAirport]
 * @property {string} [arrivalAirport]
 * @property {number} durationMinutes    0 when unknown
 * @property {number} estimatedCostEur
 * @property {boolean} [isCheapest]
 * @property {boolean} [isFastest]
 *
 * @typedef {Object} StopStay
 * @property {string} cityId
 * @property {string} cityName
 * @property {number} nights
 * @property {number} estimatedNightlyRateEur
 * @property {number} order
 * @property {string[]} [recommendedPlaces]
 */
import { useSyncExternalStore } from 'react';

const STORE_KEY = 'carta.plannerDraft.v1';

/** Shape version stored inside the record. The localStorage KEY stays v1 so a
 *  draft written by the previous build is found and migrated rather than
 *  silently abandoned; `version` inside the record is what tells the two
 *  shapes apart. */
const STORE_VERSION = 2;

/** A draft older than this is context from another trip, not work in progress.
 *  Restoring a month-old step and trip pick is worse than a clean start. */
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DEFAULT_STATE = {
  version: STORE_VERSION,
  /** When the draft was last written (epoch ms), for the staleness rules. */
  savedAt: 0,
  origin: null,             // GeoLocation | null
  nearbyAirports: [],       // NearbyAirport[]
  travelDates: {
    isFlexible: false,
    startDate: '',
    endDate: '',
    durationNights: 7,
    flexibleMonths: [],
  },
  travelers: {
    adults: 2,
    children: 0,
    lifestyle: 'standard',  // 'budget' | 'standard' | 'luxury'
  },
  selectedDestination: null, // country name | null
  selectedTransit: null,     // TransitOption | null
  itineraryType: 'custom',   // 'curated' | 'single' | 'custom'
  stops: [],                 // StopStay[]
  /** Where the traveller had got to in the wizard. Before v2 none of this was
   *  stored, so a reload dropped the countries, the dates, the step and the
   *  chosen trip and reopened on question one with nothing filled in. */
  wizard: {
    step: 1,
    countries: [],      // ISO2 / country names, as the wizard keys them
    buildMode: 'ready', // 'ready' | 'custom'
    tripPickId: null,
    dateMode: 'exact',  // 'exact' | 'flex'
    flexMonth: '',
    flexNights: 7,
    quiz: {},           // the Where quiz answers (T2)
  },
};

/** Today as YYYY-MM-DD, for the "start date is in the past" check. Compared as
 *  strings because that is the shape the wizard stores dates in. */
function todayKey() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * A v1 record has no `wizard` block and no `savedAt`. Everything it does carry
 * (origin, dates, travellers) is still valid, so migration is additive: keep
 * the record, give it the v2 defaults for the parts it never stored, and date
 * it now so it is not immediately judged stale for having no timestamp.
 */
function migrate(j) {
  if (!j || typeof j !== 'object') return { ...DEFAULT_STATE };
  if (j.version === STORE_VERSION) return j;
  return { ...j, version: STORE_VERSION, savedAt: Date.now(), wizard: { ...DEFAULT_STATE.wizard } };
}

/**
 * Drafts go stale two ways, and both mean the same thing: the trip this draft
 * describes is not the trip being planned now.
 *
 *   - older than 30 days
 *   - a start date that has already passed
 *
 * Neither is a reason to throw the work away wholesale. The countries are the
 * expensive answer and stay useful ("I still want to go to Portugal"), so a
 * stale draft keeps them and drops everything downstream: the step returns to
 * one, the dates, the trip pick and the quiz clear.
 */
function isStale(j) {
  if (!j) return false;
  const savedAt = Number(j.savedAt) || 0;
  if (savedAt && Date.now() - savedAt > DRAFT_MAX_AGE_MS) return true;
  const start = j.travelDates?.startDate;
  return Boolean(start) && start < todayKey();
}

/** A stale draft reduced to the part still worth keeping. */
function staleReset(j) {
  return {
    ...DEFAULT_STATE,
    wizard: { ...DEFAULT_STATE.wizard, countries: j.wizard?.countries || [] },
    // The party and where they leave from are properties of the traveller, not
    // of the trip, so they survive a stale draft too.
    origin: j.origin || null,
    nearbyAirports: j.nearbyAirports || [],
    travelers: { ...DEFAULT_STATE.travelers, ...(j.travelers || {}) },
    savedAt: Date.now(),
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const j = migrate(JSON.parse(raw));
    if (isStale(j)) return staleReset(j);
    return {
      ...DEFAULT_STATE,
      ...j,
      travelDates: { ...DEFAULT_STATE.travelDates, ...(j.travelDates || {}) },
      travelers: { ...DEFAULT_STATE.travelers, ...(j.travelers || {}) },
      wizard: { ...DEFAULT_STATE.wizard, ...(j.wizard || {}) },
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch { /* private mode */ }
}

function emit() {
  persist();
  for (const l of listeners) l();
}

export const plannerStore = {
  getState: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  /** Shallow-merge a patch; nested objects are replaced whole (callers pass
   *  complete travelDates / travelers objects). No-op patches don't emit. */
  set(patch) {
    let changed = false;
    for (const [k, v] of Object.entries(patch || {})) {
      if (state[k] !== v) { changed = true; break; }
    }
    if (!changed) return;
    state = { ...state, ...patch };
    emit();
  },
  setOrigin(origin) { plannerStore.set({ origin }); },
  setNearbyAirports(nearbyAirports) { plannerStore.set({ nearbyAirports }); },
  setTravelDates(dates) { plannerStore.set({ travelDates: { ...state.travelDates, ...dates } }); },
  setTravelers(travelers) { plannerStore.set({ travelers: { ...state.travelers, ...travelers } }); },
  setDestination(selectedDestination) { plannerStore.set({ selectedDestination }); },
  setTransit(selectedTransit) { plannerStore.set({ selectedTransit }); },
  setItineraryType(itineraryType) { plannerStore.set({ itineraryType }); },
  setStops(stops) { plannerStore.set({ stops }); },
  /** Merge a patch into the wizard block (step, countries, dates mode, pick). */
  setWizard(wizard) { plannerStore.set({ wizard: { ...state.wizard, ...wizard } }); },
  reset() {
    state = { ...DEFAULT_STATE, wizard: { ...DEFAULT_STATE.wizard }, savedAt: Date.now() };
    emit();
  },
};

/** The store in React: re-renders on every store change. */
export function usePlannerStore() {
  return useSyncExternalStore(plannerStore.subscribe, plannerStore.getState);
}
