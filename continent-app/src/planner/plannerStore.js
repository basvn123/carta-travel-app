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

const DEFAULT_STATE = {
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
};

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const j = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...j,
      travelDates: { ...DEFAULT_STATE.travelDates, ...(j.travelDates || {}) },
      travelers: { ...DEFAULT_STATE.travelers, ...(j.travelers || {}) },
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

let state = load();
const listeners = new Set();

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
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
  reset() {
    state = { ...DEFAULT_STATE };
    emit();
  },
};

/** The store in React: re-renders on every store change. */
export function usePlannerStore() {
  return useSyncExternalStore(plannerStore.subscribe, plannerStore.getState);
}
