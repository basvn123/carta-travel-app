/**
 * Live bed prices for the traveller's own nights (T540), from /api/stays.
 *
 * A destination's stays record carries `xk`, up to six Xotelo properties
 * (pipeline/stays/live_keys.py): four hotels, the most reviewed in each price
 * quartile, and two guesthouses, each with its typical night. For a dated
 * stay the app asks /api/stays for their prices on two of its nights (the
 * first and the middle) and keeps the result here.
 *
 * Tonight's price is used as a factor, not as the price: the most reviewed
 * hotels are central and dearer than the town's market, so a hotel at 1.6x
 * its own typical night says "this week costs 1.6x", and bedPrice() applies
 * that to the market-level model, marked q: 'live'. A festival, a trade fair
 * or a Saturday in December shows up this way without the hotels' premium.
 *
 * Which properties set which tier's factor:
 *   hotel2..hotel5   the hotels with that OSM star class when any is priced,
 *                    else the hotel in the matching price quartile, else all
 *                    the hotels
 *   room             the guesthouses, else the hotels
 *   dorm, private, home   not live: Xotelo is thin there, the model stays
 *
 * Nothing blocks on it: until an answer arrives (or when it fails) the
 * modelled price shows. Screens re-render through useLiveStaysVersion().
 */

import { useSyncExternalStore } from 'react';
import { stayRecord } from './staysData.js';

const results = new Map();     // query key -> {checked, nights} | null
const inflight = new Map();
const listeners = new Set();
let version = 0;

const LIVE_TIERS = ['hotel2', 'hotel3', 'hotel4', 'hotel5', 'room'];
const DAY = 86400000;

function iso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Two nights to sample: the first and the middle (one for a single night).
 *  Each costs Xotelo a call per property, so two keeps a first answer near
 *  ten seconds; the middle of a week-long stay usually falls on its other
 *  half (weekday against weekend). */
export function sampleNights(start, nights) {
  const s = Date.parse(`${start}T00:00:00Z`);
  const n = Math.max(1, Math.round(nights || 0));
  if (!Number.isFinite(s)) return [];
  return [...new Set([0, Math.floor(n / 2)])].filter((i) => i < n).map((i) => iso(s + i * DAY));
}

function adultsPerRoom(people) {
  return people >= 2 ? 2 : 1;
}

function queryKey(id, start, nights, a) {
  return `${id}|${start}|${nights}|${a}`;
}

function median(xs) {
  const s = xs.slice().sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function notify() {
  version += 1;
  listeners.forEach((fn) => fn());
}

/** Ask for one destination's live prices for a dated stay. Safe to call on
 *  every render: one request per stay, failures remembered as null. */
export function loadLiveStay(destId, start, nights, people) {
  const xk = stayRecord(destId)?.xk;
  if (!xk?.length || !start || !(nights > 0)) return;
  const a = adultsPerRoom(people);
  const qk = queryKey(destId, start, nights, a);
  if (results.has(qk) || inflight.has(qk)) return;
  const ns = sampleNights(start, nights);
  const today = iso(Date.now());
  if (!ns.length || ns[0] < today) return;
  const url = `/api/stays?k=${encodeURIComponent(xk.map((x) => x[0]).join(','))}`
    + `&n=${ns.join(',')}&a=${a}`;
  const p = fetch(url, { credentials: 'omit' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((body) => {
      results.set(qk, body?.nights ? body : null);
      inflight.delete(qk);
      notify();
    });
  inflight.set(qk, p);
}

function tierFactor(tier, xk, prices) {
  // tonight / typical, per property that has both
  const ratios = (pick) => xk.filter(pick).map((x) => (prices[x[0]] > 0 && x[4] > 0 ? prices[x[0]] / x[4] : null))
    .filter((v) => v != null);
  const hotels = ratios((x) => x[1] === 'h');
  if (tier === 'room') {
    const g = ratios((x) => x[1] === 'g');
    return g.length ? median(g) : hotels.length ? median(hotels) : null;
  }
  const stars = Number(tier.slice(5));
  const exact = ratios((x) => x[1] === 'h' && x[2] === stars);
  if (exact.length) return median(exact);
  const band = ratios((x) => x[1] === 'h' && x[3] === stars - 2);
  if (band.length) return band[0];
  return hotels.length >= 2 ? median(hotels) : null;
}

/** The live factor of one tier for a dated stay: { factor, checked, sampled }
 *  (tonight against typical, averaged over the sampled nights), or null. At
 *  least half of the sampled nights must be priced. */
export function liveStay(destId, tier, start, nights, people) {
  if (!LIVE_TIERS.includes(tier) || !start || !(nights > 0)) return null;
  const xk = stayRecord(destId)?.xk;
  if (!xk?.length) return null;
  const r = results.get(queryKey(destId, start, nights, adultsPerRoom(people)));
  if (!r) return null;
  const ns = Object.keys(r.nights);
  const vals = ns.map((n) => tierFactor(tier, xk, r.nights[n] || {})).filter((v) => v > 0);
  if (!vals.length || vals.length * 2 < ns.length) return null;
  return {
    factor: vals.reduce((s, v) => s + v, 0) / vals.length,
    checked: r.checked,
    sampled: vals.length,
  };
}

/** The destination with live keys nearest to a point, within maxKm, or
 *  null (T559). A journey names towns, not destination ids, so its trip card
 *  asks for the live prices of the closest place Carta can price live. */
export function nearestLiveDest(destinations, lat, lon, maxKm = 40) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null, bestKm = maxKm;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const d of Object.values(destinations || {})) {
    if (!Number.isFinite(d?.lat) || !Number.isFinite(d?.lon)) continue;
    const km = 111.2 * Math.hypot(d.lat - lat, (d.lon - lon) * k);
    if (km < bestKm && stayRecord(d.id)?.xk?.length) { best = d; bestKm = km; }
  }
  return best;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Goes up whenever a live answer arrives; put it in the dependency list of
 *  anything that prices a dated stay. */
export function useLiveStaysVersion() {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}

/** Tests only: seed or clear the answers. */
export function setLiveResult(destId, start, nights, people, body) {
  if (body === undefined) results.clear();
  else results.set(queryKey(destId, start, nights, adultsPerRoom(people)), body);
  notify();
}
